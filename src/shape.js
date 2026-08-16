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
// Outlines meet tile edges only at corners, and they leave a corner along the
// diagonal — see CORNER_T for why that matters more than it sounds.
// ---------------------------------------------------------------------------

/** Tile corners, clockwise from top-left. Side s runs from C[s] to C[s+1]. */
const C = [[0, 0], [1, 0], [1, 1], [0, 1]];

/** Inward normal of each side — the direction an outline leaves that edge. */
const IN = [[0, 1], [-1, 0], [0, -1], [1, 0]];

// An outline leaves a tile corner along the DIAGONAL, heading for the middle of
// the tile.
//
// The earlier rule was "leave perpendicular to the edge", which is right in the
// middle of a side but wrong at a corner: perpendicular to one edge means
// running flush along the other one. The boundary then hugged the seam for a
// stretch, and since the wall is drawn inside the town with its dark lip and
// its shadow on the outside, there was nowhere for either to go — the wall came
// out sliced flat exactly where two tiles were supposed to join invisibly.
//
// Leaving on the diagonal, the boundary is clear of both edges immediately, so
// the wall keeps its outer face and its shadow right up to the corner. Two
// tiles meeting at that corner leave it in opposite diagonals, which turns a
// merged city into a lens with a rounded point rather than a flat-ended oval.
const CORNER_T = C.map(([x, y]) => {
  const dx = 0.5 - x, dy = 0.5 - y;
  const n = Math.hypot(dx, dy);
  return [dx / n, dy / n];
});

// Every gap routes through one waypoint, which is what actually sets the shape:
// how deep a grass wedge bites into a city-across tile, how far a cap city
// hangs off its edge. Indexed by how many sides the gap skips.
const WAYPOINT = [0, 0.25, 0.42, 0.60];

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

  // Where a gap bulges out to. For one or three skipped sides that's off the
  // middle of the (middle) skipped edge; for two it's the corner between them,
  // pulled in toward the tile.
  const waypoint = ({ s, gap }) => {
    if (gap === 2) {
      const k = (s + 2) & 3;
      return add(C[k], CORNER_T[k], WAYPOINT[2]);
    }
    const g = gap === 1 ? (s + 1) & 3 : (s + 2) & 3;
    const mid = [(C[g][0] + C[(g + 1) & 3][0]) / 2, (C[g][1] + C[(g + 1) & 3][1]) / 2];
    return add(mid, IN[g], WAYPOINT[gap]);
  };

  // One smooth hop, given where it starts and ends and which way it's pointing
  // at each end.
  const hop = (ctx, p0, t0, p1, t1) => {
    const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) * 0.44;
    ctx.bezierCurveTo(p0[0] + t0[0] * d, p0[1] + t0[1] * d,
                      p1[0] - t1[0] * d, p1[1] - t1[1] * d, p1[0], p1[1]);
  };

  const draw = (ctx, link) => {
    const a = C[(link.s + 1) & 3];
    const b = C[link.next];
    const w = waypoint(link);
    const ta = CORNER_T[(link.s + 1) & 3];               // leaving into the tile
    const tb = CORNER_T[link.next];                      // arriving at the corner
    const n = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const tw = [(b[0] - a[0]) / n, (b[1] - a[1]) / n];   // straight through
    hop(ctx, a, ta, w, tw);
    hop(ctx, w, tw, b, [-tb[0], -tb[1]]);
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
    towers: links.map(waypoint),
  };
}
