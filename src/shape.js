// ---------------------------------------------------------------------------
// Feature silhouettes.
//
// Cities, forests, mountains and lakes are all "areas": they cover some subset
// of a tile's four sides and have to line up exactly with whatever is drawn on
// the other side of every seam. This file builds that outline.
//
// The old art had four hand-drawn shapes that disagreed about where they met a
// tile edge — a band city crossed at 0.14..0.86 while a cap city crossed at
// 0..1 — so a band next to a cap left a sliver of city facing a sliver of
// field at both ends of the seam. That mismatch is what made the corners look
// wrong, and no amount of shading was going to fix it.
//
// The rule here is:
//
//   · An area always covers a whole side that it reaches, running corner to
//     corner — EXCEPT that it pulls back by `TRIM` at any tile corner it does
//     not wrap all the way around.
//
//   · Whether a corner is wrapped is a property of the VERTEX, not of the
//     tile: it's true only when all four tiles meeting there carry the same
//     feature around it. Every one of those four tiles computes the same
//     answer, so two tiles sharing an edge always agree about both of its
//     endpoints, and the outlines meet exactly.
//
// The payoff is that a block of city becomes one mass with a single outer wall
// and no internal boundaries, while a corner the feature genuinely doesn't
// wrap keeps a small courtyard — which is a real fact about the board, not an
// artifact.
//
// The other rule that matters: where the outline meets a tile edge it leaves
// PERPENDICULAR to that edge. The neighbour's outline arrives at the same
// point at the same angle, so the two halves read as one continuous curve
// across the seam no matter which tile types are involved.
// ---------------------------------------------------------------------------

/** How far an area pulls back from a corner it doesn't wrap. */
export const TRIM = 0.15;

/** Tile corners, clockwise from top-left. Side s runs from C[s] to C[s+1]. */
const C = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Inward normal of each side — the direction the outline leaves an edge. */
const IN = [[0, 1], [-1, 0], [0, -1], [1, 0]];

const lerp = ([ax, ay], [bx, by], t) => [ax + (bx - ax) * t, ay + (by - ay) * t];

// How far the control points reach when the outline crosses a gap of skipped
// sides. One skipped side is a near-straight run between opposite edges; three
// is a dome hanging off a single edge.
const REACH = [0, 0.30, 0.58, 0.62];
const BOW = 0.05;                      // gentle outward bulge on a 1-side gap

/**
 * Build the outline of an area feature.
 *
 * `sides` are the canonical (unrotated) sides the feature reaches. `solid` is a
 * 4-bit mask in the same canonical space: bit c set means the feature wraps
 * tile corner c and merges with its neighbours there.
 *
 * Returns:
 *   path(ctx)      the filled region
 *   rim(ctx)       only the parts of the outline that are NOT on a tile edge —
 *                  i.e. where the feature actually ends and a wall belongs.
 *                  A feature covering all four sides of a fully wrapped tile
 *                  has no rim at all, which is correct: it's the middle of
 *                  something bigger, not a block sitting on a field.
 *   crossings      the points where the rim meets a tile edge, so the wall can
 *                  be given a bastion there. Both tiles sharing the seam
 *                  produce the same point and each draws its own half.
 */
export function featureShape(sides, solid = 0) {
  const list = [0, 1, 2, 3].filter((s) => sides.includes(s));
  if (!list.length) return null;

  const wrapped = (c) => ((solid >> (c & 3)) & 1) === 1;
  const start = (s) => lerp(C[s], C[(s + 1) & 3], wrapped(s) ? 0 : TRIM);
  const end = (s) => lerp(C[s], C[(s + 1) & 3], wrapped(s + 1) ? 1 : 1 - TRIM);

  // One connector per feature side, joining the end of that side's run to the
  // start of the next one. `gap` counts the sides skipped on the way.
  const links = list.map((s, i) => {
    const next = list[(i + 1) % list.length];
    const gap = list.length === 1 ? 3 : (next - s - 1 + 4) & 3;
    return { s, next, gap, from: end(s), to: start(next) };
  });

  const draw = (ctx, link, moveFirst) => {
    const { s, next, gap, from, to } = link;
    if (moveFirst) ctx.moveTo(from[0], from[1]);
    if (gap === 0) {
      // Two feature sides meeting at a corner the feature doesn't wrap: round
      // the corner off, leaving a little of the field showing through.
      const k = C[(s + 1) & 3];
      ctx.quadraticCurveTo(k[0], k[1], to[0], to[1]);
      return;
    }
    const m = REACH[gap];
    const c1 = [from[0] + IN[s][0] * m, from[1] + IN[s][1] * m];
    const c2 = [to[0] + IN[next][0] * m, to[1] + IN[next][1] * m];
    if (gap === 1) {                    // bulge gently into the skipped side
      const skipped = (s + 1) & 3;
      c1[0] -= IN[skipped][0] * BOW; c1[1] -= IN[skipped][1] * BOW;
      c2[0] -= IN[skipped][0] * BOW; c2[1] -= IN[skipped][1] * BOW;
    }
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
  };

  // A connector is "empty" when the corner is wrapped: the two runs already
  // meet at the corner itself, and there is no wall to draw there.
  const live = links.filter((l) => !(l.gap === 0 && wrapped(l.s + 1)));

  return {
    path(ctx) {
      const first = list[0];
      const p = start(first);
      ctx.moveTo(p[0], p[1]);
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const e = end(s);
        ctx.lineTo(e[0], e[1]);
        const link = links[i];
        if (link.gap === 0 && wrapped(s + 1)) continue;   // runs already touch
        draw(ctx, link, false);
      }
      ctx.closePath();
    },

    rim(ctx) {
      for (const link of live) draw(ctx, link, true);
    },

    hasRim: live.length > 0,
    crossings: live.flatMap((l) => [l.from, l.to]),
  };
}

/**
 * Does `cell` carry a single feature of `kind` around tile corner `c`?
 *
 * Corner c sits between world sides c-1 and c. Both have to belong to the SAME
 * feature — two separate cities touching the same corner are two cities, and
 * drawing them merged would be a lie about the board.
 */
export function wrapsCorner(board, cell, c, kind) {
  if (!cell) return false;
  const a = board.featAt(cell, (c + 3) & 3);
  if (a === null || a !== board.featAt(cell, c & 3)) return false;
  return cell.type.feats[a].type === kind;
}

// Around any vertex: the four tiles that meet there, and which of their own
// corners is the one in question.
const AROUND = [[-1, -1, 2], [0, -1, 3], [-1, 0, 1], [0, 0, 0]];

/**
 * The 4-bit corner mask for one feature of one cell, in WORLD orientation.
 *
 * A corner counts as solid only when every tile around that vertex wraps it,
 * which is what lets four tiles agree without talking to each other.
 */
export function cornerMask(board, cell, kind) {
  let mask = 0;
  for (let c = 0; c < 4; c++) {
    const vx = cell.x + C[c][0];
    const vy = cell.y + C[c][1];
    let all = true;
    for (const [dx, dy, corner] of AROUND) {
      if (!wrapsCorner(board, board.get(vx + dx, vy + dy), corner, kind)) { all = false; break; }
    }
    if (all) mask |= 1 << c;
  }
  return mask;
}
