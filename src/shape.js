// ---------------------------------------------------------------------------
// Feature silhouettes.
//
// Cities, forests, mountains and lakes are all "areas": they cover some subset
// of a tile's four sides and have to line up exactly with whatever is drawn on
// the other side of every seam.
//
// There is one rule, and everything else falls out of it:
//
//   AN AREA COVERS EVERY SIDE IT REACHES, CORNER TO CORNER.
//
// That's it. Because edge matching guarantees a city edge only ever meets
// another city edge, and both tiles cover that edge completely, the two halves
// are continuous along the whole seam with nothing left over at either end. No
// neighbour lookup, no negotiation between tiles, nothing to keep in sync.
//
// It took two wrong turns to get here. The original art had four hand-drawn
// shapes that disagreed about where they met an edge — a cap city crossed it
// corner to corner while a band city only crossed 0.14..0.86 — so a band next
// to a cap left a sliver of city facing a sliver of field at both ends. The
// fix after that pulled every shape back from any corner it didn't wrap, which
// made the shapes agree with each other but left the same awkward stub at
// every seam, and needed each tile to know what its neighbours were doing.
// Running corner to corner is both simpler and correct.
//
// The corners take care of themselves. A tile corner is a single point: an
// area that reaches two adjacent sides simply fills it, and one that reaches
// only one side comes to that point and turns. Since the four tiles round a
// vertex all agree about which of the four edges leaving it are city, their
// outlines meet there without anyone having to check.
//
// The other rule that matters: where an outline leaves a tile edge it leaves
// PERPENDICULAR to it. Two cap cities stacked one above the other then read as
// a single oval rather than two domes touching, because both boundaries pass
// through the shared corners vertically.
// ---------------------------------------------------------------------------

/** Tile corners, clockwise from top-left. Side s runs from C[s] to C[s+1]. */
const C = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Inward normal of each side — the direction an outline leaves that edge. */
const IN = [[0, 1], [-1, 0], [0, -1], [1, 0]];

// How far control points reach when the outline crosses a gap of skipped
// sides. Two skipped sides is a quarter sweep; three is a dome hanging off a
// single edge.
const REACH = [0, 0, 0.58, 0.52];

// A gap of exactly ONE skipped side runs between the two ends of that side, so
// a plain cubic with perpendicular tangents would lie flat along the edge and
// swallow the whole tile. It gets a waypoint pulled in off the middle of the
// skipped edge instead, which is what carves the grass wedge on a city-across
// tile — widest in the middle, tapering to nothing at the corners.
const WEDGE = 0.30;      // how deep the wedge bites
const WEDGE_EDGE = 0.22; // control reach at the corners
const WEDGE_MID = 0.24;  // control reach either side of the waypoint

const add = ([x, y], [dx, dy], m) => [x + dx * m, y + dy * m];

/**
 * Build the outline of an area feature from the canonical sides it reaches.
 *
 * Returns:
 *   path(ctx)   the filled region
 *   rim(ctx)    only the parts of the outline that are NOT on a tile edge —
 *               where the feature actually ends and a wall belongs. A feature
 *               covering all four sides has no rim at all, which is correct:
 *               it is the middle of something bigger, not a block on a field.
 *   towers      a point at the middle of each stretch of rim, far enough from
 *               any seam that a tower drawn there is nobody else's business.
 */
export function featureShape(sides) {
  const list = [0, 1, 2, 3].filter((s) => sides.includes(s));
  if (!list.length) return null;

  // One link per gap between consecutive covered sides. Sides that are already
  // adjacent need nothing: the first ends at exactly the corner the next
  // begins at, so the area simply carries on round the corner.
  const links = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    const next = list[(i + 1) % list.length];
    const gap = list.length === 1 ? 3 : (next - s - 1 + 4) & 3;
    if (gap > 0) links.push({ s, next, gap });
  }

  const draw = (ctx, { s, next, gap }) => {
    const from = C[(s + 1) & 3];
    const to = C[next];
    if (gap === 1) {
      const skipped = (s + 1) & 3;
      const mid = add([(C[skipped][0] + C[(skipped + 1) & 3][0]) / 2,
                       (C[skipped][1] + C[(skipped + 1) & 3][1]) / 2], IN[skipped], WEDGE);
      const run = [to[0] - from[0], to[1] - from[1]];             // along the edge
      const c1 = add(from, IN[s], WEDGE_EDGE);
      const c2 = add(mid, run, -WEDGE_MID / 2);
      const c3 = add(mid, run, WEDGE_MID / 2);
      const c4 = add(to, IN[next], WEDGE_EDGE);
      ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], mid[0], mid[1]);
      ctx.bezierCurveTo(c3[0], c3[1], c4[0], c4[1], to[0], to[1]);
      return;
    }
    const m = REACH[gap];
    const c1 = add(from, IN[s], m);
    const c2 = add(to, IN[next], m);
    ctx.bezierCurveTo(c1[0], c1[1], c2[0], c2[1], to[0], to[1]);
  };

  const towerOf = ({ s, next, gap }) => {
    const from = C[(s + 1) & 3];
    const to = C[next];
    if (gap === 1) {
      const skipped = (s + 1) & 3;
      return add([(C[skipped][0] + C[(skipped + 1) & 3][0]) / 2,
                  (C[skipped][1] + C[(skipped + 1) & 3][1]) / 2], IN[skipped], WEDGE);
    }
    const m = REACH[gap];
    const c1 = add(from, IN[s], m);
    const c2 = add(to, IN[next], m);
    return [(from[0] + 3 * c1[0] + 3 * c2[0] + to[0]) / 8,
            (from[1] + 3 * c1[1] + 3 * c2[1] + to[1]) / 8];
  };

  return {
    path(ctx) {
      ctx.moveTo(C[list[0]][0], C[list[0]][1]);
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const corner = C[(s + 1) & 3];
        ctx.lineTo(corner[0], corner[1]);           // the full side, end to end
        const link = links.find((l) => l.s === s);
        if (link) draw(ctx, link);
      }
      ctx.closePath();
    },

    rim(ctx) {
      for (const link of links) {
        const from = C[(link.s + 1) & 3];
        ctx.moveTo(from[0], from[1]);
        draw(ctx, link);
      }
    },

    hasRim: links.length > 0,
    towers: links.map(towerOf),
  };
}
