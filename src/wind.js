// ---------------------------------------------------------------------------
// The wind.
//
// One function that moves a board, and nothing else. It takes a Board and a
// direction, shoves what it can, and hands back a report of everything that
// happened; deciding what any of it is worth belongs to the mode. No game, no
// scores, no DOM — which is what makes it testable and what would let a second
// mode blow on a board without inheriting Girando's rules.
//
// A GUST has a direction and a reach. A zephyr reaches down one lane — the row
// or column it sits in, downwind of itself. A temple exhaling reaches every
// lane at once. Everything the gust reaches moves one square that way.
//
// The four rules that make it a game rather than a shuffle:
//
//   SOLID THINGS DON'T MOVE, BUT THEY DON'T STOP THE WIND EITHER. Crystallised
//     tiles and skywalls stay where they are, and a tile pressed up against
//     one has nowhere to go so it stays too — but the gust carries on past
//     them and shoves everything loose further down the lane.
//   A SKYWALL SHELTERS ITS LEE — if it's standing across the wind. A wall
//     faces one way; wind running into its face stops there, and wind running
//     along it goes by. It is the only thing that stops a gust.
//   CORNERS COUNT. A tile that lands touching anything, even diagonally, stays
//     up. A tile that lands touching nothing falls out of the sky. Diagonal
//     contact is a state placement can never produce, which is exactly why the
//     board after a gust doesn't look like a board you could have built.
//   THE FAR END GOES FIRST. Tiles are moved downwind-first, so a lane slides
//     along behind whatever's in front of it instead of piling up.
//
// Reported, not decided: which tiles moved, which fell, which followers were
// blown off a road, which weathervanes re-pointed, which temples were shoved
// (Girando pays you for that) and which zephyrs were caught by the gust and
// have to fire in their turn.
// ---------------------------------------------------------------------------

import { SIDE_STEP } from './tiles.js';

/** A cascade has to stop somewhere: zephyrs blowing zephyrs blowing zephyrs. */
export const MAX_GUSTS = 10;

const markOf = (cell, kind) => cell.type.marks.find((m) => m.kind === kind) || null;

/** Which way a direction-carrying mark points once its tile has been turned. */
export const worldDir = (cell, m) => ((m.dir ?? 0) + cell.rot) % 4;

const wallOn = (cell) => markOf(cell, 'wall');
export const isWall = (cell) => !!wallOn(cell);

/**
 * A wall only stops what runs into its face. Its mark points the way it looks,
 * so the wall itself lies across that axis: a wind travelling along the same
 * axis hits the flat of it and stops, and a wind travelling across slides past
 * the end of it and carries on.
 */
export function shelters(cell, dir) {
  const w = wallOn(cell);
  return !!w && (worldDir(cell, w) & 1) === (dir & 1);
}
export const isRaft = (cell) => !!markOf(cell, 'raft');
export const zephyrOn = (cell) => markOf(cell, 'zephyr');

/** Weathervanes and vestibules: four ways in, and the wind picks the two. */
export const swings = (cell) => !!cell.type.swing;

/**
 * One gust.
 *
 * @param board  the Board to shove
 * @param dir    0=N 1=E 2=S 3=W — the way the wind is going
 * @param from   {x, y} the tile it blows out of; reaches only that lane,
 *               downwind. Omit with `everywhere` for a mass event.
 * @param everywhere  every lane on the board at once (a temple exhaling)
 */
export function gust(board, { dir, from = null, everywhere = false }) {
  const [dx, dy] = SIDE_STEP[dir];
  const report = {
    dir, from, everywhere,
    moved: [], fell: [], unseated: [], swung: [], temples: [], zephyrs: [],
  };

  // --- who the wind can reach ------------------------------------------------
  const reached = [...board.cells.values()].filter((c) => {
    if (everywhere) return true;
    if (!from) return false;
    return dx === 0
      ? c.x === from.x && (dy < 0 ? c.y < from.y : c.y > from.y)
      : c.y === from.y && (dx < 0 ? c.x < from.x : c.x > from.x);
  });
  if (!reached.length) return report;

  // Downwind distance along the gust, which is both the sort key and the lane
  // ordering. The perpendicular coordinate is the lane itself.
  const along = (c) => c.x * dx + c.y * dy;
  const lane = (c) => (dx === 0 ? c.x : c.y);

  // --- what a skywall shelters ----------------------------------------------
  // Walk each lane from the upwind end; once a wall standing ACROSS this wind
  // has gone by, everything after it is in its lee and the wind never gets
  // there. Nothing else stops a gust — it runs the length of the lane and
  // shoves everything loose in it, crystallised ground included. Solid tiles
  // don't move, but the wind doesn't stop at them either; what's behind them
  // has nowhere to go, and what's beyond them goes anyway.
  const sheltered = new Set();
  const lanes = new Map();
  for (const c of reached) {
    if (!lanes.has(lane(c))) lanes.set(lane(c), []);
    lanes.get(lane(c)).push(c);
  }
  for (const row of lanes.values()) {
    row.sort((a, b) => along(a) - along(b));       // upwind first
    let blocked = false;
    for (const c of row) {
      if (blocked) sheltered.add(c);
      if (shelters(c, dir)) blocked = true;
    }
  }

  const exposed = reached.filter((c) => !sheltered.has(c));

  // --- the shove -------------------------------------------------------------
  for (const cell of exposed.slice().sort((a, b) => along(b) - along(a))) {
    if (cell.anchored || isWall(cell)) continue;          // solid things stay put
    const to = { x: cell.x + dx, y: cell.y + dy };
    if (board.get(to.x, to.y)) continue;                  // pressed up against something
    const was = { x: cell.x, y: cell.y };
    if (!board.shift(was, to)) continue;
    report.moved.push({ cell, from: was });
  }
  if (!report.moved.length && !exposed.some(swings)) return report;

  // --- what the move did to them --------------------------------------------
  for (const { cell } of report.moved) {
    // Nothing under it and nothing beside it, not even a corner: it's gone.
    if (!isRaft(cell) && !board.touching(cell.x, cell.y)) {
      report.fell.push({
        id: cell.type.id, x: cell.x, y: cell.y, type: cell.type, rot: cell.rot,
        meeple: cell.meeple,
      });
      continue;
    }
    // A follower in a city is behind walls. One standing on a road is not.
    if (cell.meeple && cell.type.feats[cell.meeple.feat]?.type === 'road') {
      report.unseated.push({ ...cell.meeple, x: cell.x, y: cell.y });
      cell.meeple = null;
    }
    if (cell.type.feats.some((f) => f.type === 'temple')) report.temples.push(cell);
    const z = zephyrOn(cell);
    if (z) report.zephyrs.push({ x: cell.x, y: cell.y, dir: worldDir(cell, z) });
  }

  for (const f of report.fell) board.remove(f.x, f.y);

  // --- the weathervanes ------------------------------------------------------
  // A vane turns whether or not it moved — it's a vane. Crystallised ones have
  // stopped being weather and don't.
  for (const cell of exposed) {
    if (!swings(cell) || cell.anchored) continue;
    const want = dx === 0 ? 0 : 1;                        // through-feature is N-S at rot 0
    if ((cell.rot & 1) === want) continue;
    board.replace(cell.x, cell.y, cell.type, want);
    report.swung.push(cell);
  }

  board.rebuild();
  return report;
}

/**
 * A gust, plus every gust it sets off — a zephyr caught by the wind fires in
 * its turn, from wherever it ended up. Capped, because two zephyrs pointed at
 * each other are a perpetual motion machine.
 *
 * Reports come back in the order they happened, so the caller can pay for them
 * and narrate them in the order a player watched them.
 */
export function storm(board, first, cap = MAX_GUSTS) {
  const out = [];
  const queue = [first];
  while (queue.length && out.length < cap) {
    const g = gust(board, queue.shift());
    out.push(g);
    for (const z of g.zephyrs) queue.push({ dir: z.dir, from: { x: z.x, y: z.y } });
  }
  return out;
}
