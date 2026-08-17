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
// or column it sits in, downwind of itself. (`everywhere` blows every lane at
// once; nothing triggers it at the moment, but the capability is the cheap
// half of a mass weather event and it's kept for when one comes back.)
//
// The rules that make a gust a game rather than a shuffle:
//
//   IT PICKS UP STRENGTH. A gust that runs over a zephyr pointing the same way
//     absorbs it and blows a square harder — one, two, three squares, and no
//     further. A zephyr pointing some other way isn't absorbed; it fires in
//     its own turn, which is how a line of them becomes a chain reaction.
//   SOLID THINGS DON'T MOVE, BUT THEY DON'T STOP THE WIND EITHER. Crystallised
//     tiles, skywalls, temples and joined sfera stay where they are, and a
//     tile with nowhere to go stays too — but the gust carries on past them
//     and shoves everything loose further down the lane.
//   A SKYWALL SHELTERS ITS LEE — if it's standing across the wind. A wall
//     faces one way; wind into its face stops there, wind along it goes by. It
//     is the only thing that stops a gust.
//   CORNERS COUNT. A tile that lands touching anything, even diagonally, stays
//     up. A tile that lands touching nothing falls out of the sky. Diagonal
//     contact is a state placement can never produce, which is exactly why the
//     board after a gust doesn't look like a board you could have built.
//   FOLLOWERS ARE BLOWN LIKE TILES. A follower travels the same distance as
//     everything else in its lane, so one standing on a tile that also moves
//     rides along and never notices — and one standing on a tile that DOESN'T
//     move gets picked up and put down on whatever is downwind of it, which
//     may be a feature somebody else holds, or nothing at all. Nothing at all
//     means it goes back to its owner's hand; that is the only way a follower
//     leaves the board. There is one exception, and it is a building: a figure
//     inside a TEMPLE is indoors, and the weather doesn't reach it.
//   THE FAR END GOES FIRST. Tiles are moved downwind-first, so a lane slides
//     along behind whatever's in front of it instead of piling up.
// ---------------------------------------------------------------------------

import { SIDE_STEP, NO_MEEPLE } from './tiles.js';

/** A cascade has to stop somewhere: zephyrs blowing zephyrs blowing zephyrs. */
export const MAX_GUSTS = 10;

/** Three squares is as hard as the sky blows, however many zephyrs agree. */
export const MAX_STRENGTH = 3;

const markOf = (cell, kind) => cell.type.marks.find((m) => m.kind === kind) || null;

/** Which way a direction-carrying mark points once its tile has been turned. */
export const worldDir = (cell, m) => ((m.dir ?? 0) + cell.rot) % 4;

const wallOn = (cell) => markOf(cell, 'wall');
export const isWall = (cell) => !!wallOn(cell);
export const isRaft = (cell) => !!markOf(cell, 'raft');
export const zephyrOn = (cell) => markOf(cell, 'zephyr');
export const isTemple = (cell) => cell.type.feats.some((f) => f.type === 'temple');

/** Weathervanes and vestibules: four ways in, and the wind picks the two. */
export const swings = (cell) => !!cell.type.swing;

/**
 * Everything the wind can't move: ground that has crystallised, a wall, a
 * temple, and a sfera the mode has locked because it found its other half.
 */
export const immovable = (cell) => !!cell.anchored || !!cell.fixed || isWall(cell) || isTemple(cell);

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

/**
 * One gust.
 *
 * @param board  the Board to shove
 * @param dir    0=N 1=E 2=S 3=W — the way the wind is going
 * @param from   {x, y} the tile it blows out of; reaches only that lane,
 *               downwind. Omit with `everywhere` for a mass event.
 * @param everywhere  every lane on the board at once
 */
export function gust(board, { dir, from = null, everywhere = false }) {
  const [dx, dy] = SIDE_STEP[dir];
  const report = {
    dir, from, everywhere, strength: 1,
    moved: [], fell: [], carried: [], homed: [], swung: [], zephyrs: [],
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
  const laneOf = (c) => (dx === 0 ? c.x : c.y);

  // --- walk each lane, upwind first -----------------------------------------
  // One pass decides three things at once: how hard the wind is blowing by the
  // time it reaches each tile, where a wall cuts it off, and which zephyrs it
  // sets off rather than absorbs.
  const sheltered = new Set();
  const force = new Map();                        // cell -> squares it will move
  const lanes = new Map();
  for (const c of reached) {
    if (!lanes.has(laneOf(c))) lanes.set(laneOf(c), []);
    lanes.get(laneOf(c)).push(c);
  }

  for (const row of lanes.values()) {
    row.sort((a, b) => along(a) - along(b));
    let strength = 1;
    let blocked = false;
    for (const c of row) {
      if (blocked) { sheltered.add(c); continue; }
      const z = zephyrOn(c);
      if (z) {
        if (worldDir(c, z) === dir) strength = Math.min(MAX_STRENGTH, strength + 1);
        else report.zephyrs.push(c);              // points elsewhere: it fires next
      }
      force.set(c, strength);
      report.strength = Math.max(report.strength, strength);
      if (shelters(c, dir)) blocked = true;
    }
  }

  const exposed = reached.filter((c) => !sheltered.has(c));

  // --- pick the followers up -------------------------------------------------
  // Before anything moves, because a follower travels the same distance as its
  // lane and has to be put down against the board the gust leaves behind.
  const riders = [];
  for (const c of exposed) {
    if (!c.meeple || isTemple(c)) continue;      // its keeper is indoors
    riders.push({
      meeple: c.meeple,
      was: { x: c.x, y: c.y },
      steps: force.get(c) || 1,
      type: c.type.feats[c.meeple.feat]?.type || null,
    });
    c.meeple = null;
  }

  // --- the shove -------------------------------------------------------------
  for (const cell of exposed.slice().sort((a, b) => along(b) - along(a))) {
    if (immovable(cell)) continue;
    const want = force.get(cell) || 1;
    let steps = 0;
    for (let i = 1; i <= want; i++) {
      if (board.get(cell.x + dx * i, cell.y + dy * i)) break;   // pressed up against something
      steps = i;
    }
    if (!steps) continue;
    const was = { x: cell.x, y: cell.y };
    if (!board.shift(was, { x: was.x + dx * steps, y: was.y + dy * steps })) continue;
    report.moved.push({ cell, from: was, steps });
  }

  // --- what the move did to them --------------------------------------------
  for (const { cell } of report.moved) {
    if (isRaft(cell) || board.touching(cell.x, cell.y)) continue;
    report.fell.push({ id: cell.type.id, x: cell.x, y: cell.y, type: cell.type, rot: cell.rot });
  }
  for (const f of report.fell) board.remove(f.x, f.y);

  // --- put the followers down ------------------------------------------------
  for (const r of riders.sort((a, b) => (b.was.x * dx + b.was.y * dy) - (a.was.x * dx + a.was.y * dy))) {
    const to = { x: r.was.x + dx * r.steps, y: r.was.y + dy * r.steps };
    const dest = board.get(to.x, to.y);
    // Open sky. This is the only way a follower ever leaves the board.
    if (!dest) { report.homed.push({ ...r.meeple, x: r.was.x, y: r.was.y }); continue; }
    // One tile holds one figure, so a follower blown onto somebody else stays
    // where it was — and if the wind took THAT away too, it goes home.
    if (dest.meeple) {
      const stay = board.get(r.was.x, r.was.y);
      if (stay && !stay.meeple) stay.meeple = { ...r.meeple, feat: landingFeature(stay, r.type) };
      else report.homed.push({ ...r.meeple, x: r.was.x, y: r.was.y });
      continue;
    }
    dest.meeple = { ...r.meeple, feat: landingFeature(dest, r.type) };
    if (to.x !== r.was.x || to.y !== r.was.y) report.carried.push({ ...r.meeple, from: r.was, to });
  }

  // --- the weathervanes ------------------------------------------------------
  // A vane turns whether or not it moved — it's a vane. Crystallised ones have
  // stopped being weather and don't.
  for (const cell of exposed) {
    if (!swings(cell) || cell.anchored || board.get(cell.x, cell.y) !== cell) continue;
    const want = dx === 0 ? 0 : 1;                        // through-feature is N-S at rot 0
    if ((cell.rot & 1) === want) continue;
    board.replace(cell.x, cell.y, cell.type, want);
    report.swung.push(cell);
  }

  board.rebuild();
  return report;
}

/**
 * What a follower blown onto a tile ends up standing in. It keeps doing what
 * it was doing if the new tile has one — a road-walker stays on the road —
 * and otherwise takes whatever it can. A tile with nothing claimable on it
 * leaves the follower simply lying there, holding nothing, until the country
 * underneath it changes again.
 */
function landingFeature(cell, wasType) {
  const open = cell.type.feats
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !NO_MEEPLE.has(f.type));
  if (!open.length) return null;
  return (open.find(({ f }) => f.type === wasType) || open[0]).i;
}

/**
 * A gust, plus every gust it sets off — a zephyr the wind reached that points
 * somewhere else fires in its turn, from wherever it ended up. Capped, because
 * two zephyrs pointed at each other are a perpetual motion machine.
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
    for (const cell of g.zephyrs) {
      if (board.get(cell.x, cell.y) !== cell) continue;    // it fell, or was buried
      const z = zephyrOn(cell);
      if (z) queue.push({ dir: worldDir(cell, z), from: { x: cell.x, y: cell.y } });
    }
  }
  return out;
}
