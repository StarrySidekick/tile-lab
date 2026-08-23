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
//   THE WIND BLOWS THE LOOSE END OFF, NOT THE WHOLE LANE. A gust runs down its
//     lane through everything packed into it and does nothing at all to the
//     tiles it passes. What it moves is THE FAR END: the run of country
//     downwind of the zephyr ends somewhere — at a gap, at open sky — and the
//     last tiles before that gap are the ones that come away. Country that is
//     backed up against more country is country the wind can't get under.
//   HOW MANY, AND HOW FAR, IS THE POWER. A gust arriving at the loose end with
//     power N pops the last N tiles of the run off and carries each of them N
//     squares. One is one tile, one square. Two is two tiles, two squares
//     each — and because they were touching before and all travel together,
//     they arrive still touching, as a raft.
//   IT PICKS UP STRENGTH — AND ONLY FROM ITS OWN KIND. A gust that runs over a
//     zephyr blowing the same way absorbs it and blows a square harder. It no
//     longer stops at three: a lane packed with zephyrs is a lane that tears a
//     raft off the end of itself. The boost applies BEYOND the absorbed
//     zephyr, never to it: a tile is never blown further by its own breath.
//   AND FROM EVERY CORNER IT TURNS. A gust that reaches a zephyr pointing any
//     way but its own wakes it, and the weather carries on down the new
//     zephyr's lane in the new zephyr's direction — one power harder than it
//     arrived. Across the wind, back into it, it makes no difference; a line
//     of zephyrs is a chain reaction that turns corners, rebounds, and hits
//     harder every time it does. What keeps that finite is the rule below.
//   NO ZEPHYR BLOWS TWICE IN ONE STORM. Not per direction, not per gust: the
//     whole cascade is one weather event, and a zephyr contributes each of its
//     directions to it once. It's the other half of what stops a chain from
//     running away, and it's what makes a chain finite rather than merely
//     capped.
//   A ZEPHYR IS NEVER NAILED DOWN. Whatever else a mode has decided about a
//     tile, if it carries a zephyr the wind can move it. Weather that could be
//     frozen in place stops being weather, and a board of stuck zephyrs is a
//     board where the engine has quietly switched itself off.
//   ONLY THE WHALE STOPS THE WIND. A run that ends against a BLOCKER — in
//     Girando that is the Balena, and nothing else — has no loose end at all.
//     Nothing comes off it, and everything in the whale's lee is untouched.
//   FALLING IS TWO RULES NOW. A tile has to be beside something edge to edge
//     or it falls out of the sky — asked of every tile after a gust, not only
//     the ones that moved, because a tile the wind never touched is left
//     hanging when the neighbours holding it up slide away. And a tile the
//     wind MOVED has to still fit something: one that lands beside neighbours
//     it can't legally join has nothing holding it either, and goes the same
//     way. The first kind is `adrift` and the second is `mismatch`, and the
//     mode is told which, because they are not worth the same.
//   FOLLOWERS ARE BLOWN LIKE TILES — WHICH IS NOT WHAT HAPPENS TO THE TILES.
//     A follower on one of the tiles that comes away rides it and never
//     notices. Every OTHER follower in the lane is picked up and put down that
//     many squares downwind, on whatever it finds there, which may be a
//     feature somebody else holds, or nothing at all. Nothing at all means it
//     goes back to its owner's hand.
//   THE FAR END GOES FIRST. The raft is moved downwind-first, so it slides
//     along behind its own leading edge instead of piling up.
// ---------------------------------------------------------------------------

import { SIDE_STEP, NO_MEEPLE, opposite, edgesMeet } from './tiles.js';

/**
 * A backstop, not the rule. What ends a cascade is that no zephyr blows twice
 * in one storm (see `storm`); this is only here so that a bug in that
 * bookkeeping is a short storm rather than a hung tab.
 */
export const MAX_GUSTS = 16;

/**
 * The sky's ceiling, and a backstop rather than a rule. Power used to stop at
 * three, which was the rule; it doesn't any more — a lane full of zephyrs
 * blowing one way, or a storm that keeps turning corners, keeps building. What
 * bounds it in practice is that every square of power costs a distinct zephyr,
 * and there are only so many on the board. This is the number that stops a
 * pathological board asking the engine to move a tile a thousand squares.
 */
export const MAX_STRENGTH = 12;

/** However long a lane is, it is not longer than this. Loop insurance. */
const MAX_RUN = 512;

const markOf = (cell, kind) => cell.type.marks.find((m) => m.kind === kind) || null;

/** Which way a direction-carrying mark points once its tile has been turned. */
export const worldDir = (cell, m) => ((m.dir ?? 0) + cell.rot) % 4;

export const zephyrOn = (cell) => markOf(cell, 'zephyr');
export const turbineOn = (cell) => markOf(cell, 'turbine');
export const isTemple = (cell) => cell.type.feats.some((f) => f.type === 'temple');

/**
 * Every way a zephyr blows, in world directions. Most blow one way; the four
 * special ones blow two, three or all four at once, and each of those is a
 * separate gust down a separate lane out of the same square.
 */
export function zephyrDirs(cell) {
  const z = zephyrOn(cell);
  if (!z) return [];
  return (z.dirs || [z.dir ?? 0]).map((d) => (d + cell.rot) % 4);
}

/** How hard a zephyr opens — one square, or two for a double zephyr. */
export function zephyrPush(cell) {
  return zephyrOn(cell)?.push || 1;
}

/** Weathervanes and straight roads: the wind decides which way they lie. */
export const swings = (cell) => !!(cell.type.swing || cell.type.align);

/**
 * Everything the wind can't move. THE WHALE outranks everything, including a
 * zephyr: a tile with the Balena lying over it is a tile with a hundred tons
 * of sky whale on it. Anything else a mode has anchored or pinned is still
 * unmovable, but a zephyr overrides those — see the header.
 */
export const immovable = (cell) =>
  !!cell.balena || ((!!cell.anchored || !!cell.fixed) && !zephyrOn(cell));

/**
 * …and the smaller set that also STOPS a gust dead, so that the run ends
 * against it rather than at a gap and nothing comes away. The whale is the one
 * thing that reliably does this; `cell.blocks` is left for a mode that wants
 * terrain of its own to be solid all the way up.
 */
export const blocks = (cell) => !!cell.balena || (!!cell.blocks && !zephyrOn(cell));

/**
 * Does this tile agree with anything it is touching? Two neighbours whose
 * facing edges disagree are not holding each other up — they are a road
 * jammed against a city wall — and after the wind has moved a tile that is
 * the difference between country and wreckage.
 */
function fitsSomething(board, cell) {
  for (let s = 0; s < 4; s++) {
    const nb = board.neighbor(cell.x, cell.y, s);
    if (!nb) continue;
    if (edgesMeet(board.edgeAt(cell, s), board.edgeAt(nb, opposite(s)))) return true;
  }
  return false;
}

/**
 * The country the wind actually gets hold of: the unbroken run of tiles
 * downwind of a square, and whether it ended at a GAP — which is the loose end
 * the gust pops off — or against something solid, which is a run with no loose
 * end at all.
 */
function runFrom(board, from, dx, dy) {
  const cells = [];
  let x = from.x + dx, y = from.y + dy;
  for (let i = 0; i < MAX_RUN; i++) {
    const c = board.get(x, y);
    if (!c) return { cells, open: true };          // the gap the wind was looking for
    if (blocks(c)) return { cells, open: false };  // the whale: no loose end
    cells.push(c);
    x += dx; y += dy;
  }
  return { cells, open: false };
}

/**
 * Every lane on the board at once, for a mass weather event: each lane's run
 * starts at its most upwind tile and ends the same way any other run does.
 */
function openRuns(board, dx, dy) {
  const lanes = new Map();
  const along = (c) => c.x * dx + c.y * dy;
  for (const c of board.cells.values()) {
    const lane = dx === 0 ? c.x : c.y;
    const best = lanes.get(lane);
    if (!best || along(c) < along(best)) lanes.set(lane, c);
  }
  const out = [];
  for (const head of lanes.values()) {
    if (blocks(head)) continue;
    const run = runFrom(board, { x: head.x - dx, y: head.y - dy }, dx, dy);
    if (run.cells.length) out.push(run);
  }
  return out;
}

/**
 * One gust.
 *
 * @param board  the Board to shove
 * @param dir    0=N 1=E 2=S 3=W — the way the wind is going
 * @param from   {x, y} the tile it blows out of; reaches only that lane,
 *               downwind. Omit with `everywhere` for a mass event.
 * @param everywhere  every lane on the board at once
 * @param push   the power it opens at, before anything it absorbs
 */
export function gust(board, { dir, from = null, everywhere = false, push = 1 }) {
  const [dx, dy] = SIDE_STEP[dir];
  const report = {
    dir, from, everywhere, push, strength: push,
    moved: [], fell: [], carried: [], homed: [], swung: [],
    turbines: [], reached: [], zephyrs: [],
  };

  const runs = everywhere
    ? openRuns(board, dx, dy)
    : (from ? [runFrom(board, from, dx, dy)] : []);
  if (!runs.some((r) => r.cells.length)) return report;

  // Downwind distance along the gust — the order everything happens in.
  const along = (c) => c.x * dx + c.y * dy;

  // --- walk each run, upwind first -------------------------------------------
  // One pass decides two things: how hard the wind is blowing by the time it
  // reaches each tile, and which zephyrs it sets off rather than absorbs.
  const force = new Map();                        // cell -> the wind that reached it
  const rafts = [];                               // the loose end of each run
  for (const run of runs) {
    let strength = Math.min(MAX_STRENGTH, push);
    for (const c of run.cells) {
      // The force on THIS tile is the wind as it arrived — worked out before
      // the tile's own zephyr is folded in. A zephyr blowing the same way as
      // the gust hardens the wind BEYOND itself, not upon itself.
      force.set(c, strength);
      report.strength = Math.max(report.strength, strength);
      report.reached.push(c);
      if (turbineOn(c)) report.turbines.push(c);

      let absorbed = false;
      for (const d of zephyrDirs(c)) {
        // Blowing our way: absorbed, and the gust hardens from here on.
        if (d === dir) { absorbed = true; continue; }
        // Every other way it points, it FIRES — the gust arrives, the zephyr
        // wakes, and the weather turns down the new zephyr's own lane, one
        // power harder than it got here. That includes one pointing straight
        // back at us: the wind rebounds rather than bracing. Nothing runs
        // away, because a zephyr contributes each of its directions to a storm
        // exactly once (see `storm`).
        report.zephyrs.push({ cell: c, dir: d, push: Math.min(MAX_STRENGTH, strength + 1) });
      }
      if (absorbed) strength = Math.min(MAX_STRENGTH, strength + 1);
    }
    // The loose end. A run backed up against the whale has none, and a run
    // that ends at a gap gives up its last `power` tiles.
    if (!run.open || !run.cells.length) continue;
    const power = force.get(run.cells[run.cells.length - 1]);
    rafts.push({ power, cells: run.cells.slice(Math.max(0, run.cells.length - power)) });
  }

  const lifting = new Set();
  for (const r of rafts) for (const c of r.cells) lifting.add(c);

  // --- pick the followers up -------------------------------------------------
  // Everyone EXCEPT the people standing on the tiles that are about to come
  // away: those ride, and never notice. Everyone else is picked up before
  // anything moves, because they have to be put down against the board the
  // gust leaves behind.
  const riders = [];
  for (const c of report.reached) {
    if (!c.meeple || lifting.has(c)) continue;
    riders.push({
      meeple: c.meeple,
      was: { x: c.x, y: c.y },
      steps: force.get(c) || 1,
      type: c.type.feats[c.meeple.feat]?.type || null,
    });
    c.meeple = null;
  }

  // --- the shove -------------------------------------------------------------
  // Only the loose end moves, and it moves as one raft: `power` tiles, `power`
  // squares each, far end first so it slides along behind its own leading edge.
  for (const raft of rafts) {
    for (let i = raft.cells.length - 1; i >= 0; i--) {
      const cell = raft.cells[i];
      if (immovable(cell)) continue;
      let steps = 0;
      for (let n = 1; n <= raft.power; n++) {
        if (board.get(cell.x + dx * n, cell.y + dy * n)) break;   // pressed up against something
        steps = n;
      }
      if (!steps) continue;
      const was = { x: cell.x, y: cell.y };
      if (!board.shift(was, { x: was.x + dx * steps, y: was.y + dy * steps })) continue;
      report.moved.push({ cell, from: was, steps });
    }
  }

  // --- what the move did to them --------------------------------------------
  // Two ways to fall, and the mode is told which. A tile the wind MOVED has to
  // still fit what it landed against: a road shoved up against a city wall is
  // touching country and joined to none of it, and there is nothing holding it
  // up. That one is gone for good. And a tile touching nothing AT ALL is
  // adrift, which is asked of every tile on the board and not only the movers,
  // because a tile the wind never touched is left hanging when the neighbours
  // holding it up slide out from under it — by far the commonest way to end up
  // with nothing underneath you. Repeated, because dropping one tile can leave
  // the next one hanging too.
  //
  // Two things are never dropped: the tile the whale is lying on, which is
  // held up by a hundred tons of sky whale, and the last tile on the board,
  // because a board with nothing on it is not a game.
  const drop = (cell, why) => {
    if (cell.meeple) {
      report.homed.push({ ...cell.meeple, x: cell.x, y: cell.y, why: 'fell' });
      cell.meeple = null;
    }
    report.fell.push({ id: cell.type.id, x: cell.x, y: cell.y, type: cell.type, rot: cell.rot, cell, why });
    board.remove(cell.x, cell.y, { quiet: true });   // one rebuild at the end
  };

  for (const m of report.moved) {
    if (board.size <= 1) break;
    const cell = m.cell;
    if (board.get(cell.x, cell.y) !== cell || cell.balena) continue;
    if (!board.degree(cell.x, cell.y)) continue;     // adrift, and the pass below has it
    if (fitsSomething(board, cell)) continue;
    drop(cell, 'mismatch');
  }

  for (let pass = 0; pass < 32; pass++) {
    if (board.size <= 1) break;
    const loose = [...board.cells.values()]
      .filter((c) => !c.balena && board.degree(c.x, c.y) === 0)
      .sort((a, b) => a.seq - b.seq);
    if (!loose.length) break;
    for (const cell of loose) {
      if (board.size <= 1) break;
      drop(cell, 'adrift');
    }
  }

  // --- put the followers down ------------------------------------------------
  for (const r of riders.sort((a, b) => (b.was.x * dx + b.was.y * dy) - (a.was.x * dx + a.was.y * dy))) {
    const to = { x: r.was.x + dx * r.steps, y: r.was.y + dy * r.steps };
    const dest = board.get(to.x, to.y);
    // Open sky. This is the only way a follower ever leaves the board.
    if (!dest) { report.homed.push({ ...r.meeple, x: r.was.x, y: r.was.y, why: 'sky' }); continue; }
    // One tile holds one figure, so a follower blown onto somebody else stays
    // where it was — and if the wind took THAT away too, it goes home.
    if (dest.meeple) {
      const stay = board.get(r.was.x, r.was.y);
      if (stay && !stay.meeple) stay.meeple = { ...r.meeple, feat: landingFeature(stay, r.type) };
      else report.homed.push({ ...r.meeple, x: r.was.x, y: r.was.y, why: 'sky' });
      continue;
    }
    dest.meeple = { ...r.meeple, feat: landingFeature(dest, r.type) };
    if (to.x !== r.was.x || to.y !== r.was.y) report.carried.push({ ...r.meeple, from: r.was, to });
  }

  // --- the things that turn into the wind ------------------------------------
  // A vane turns whether or not it moved — it's a vane — and so does a straight
  // road, which lies along whatever is blowing through it. Anchored ones have
  // stopped being weather and don't.
  for (const cell of report.reached) {
    if (!swings(cell) || cell.anchored || cell.fixed) continue;
    if (board.get(cell.x, cell.y) !== cell) continue;
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
 * A gust, plus every gust it sets off — a zephyr the wind reached that blows
 * across it fires in its turn, from wherever it ended up, and one power harder
 * than the wind that woke it. That is what makes a corner worth turning: a
 * storm that keeps finding zephyrs keeps hitting harder, and the raft it tears
 * off the far end of the board gets wider every time.
 *
 * `first` is one spec or a list of them: a zephyr that blows more than one way
 * opens the storm with a gust down each of its lanes, and they belong to the
 * same weather event rather than to several in a row.
 *
 * The bookkeeping that matters is `fired`. Each zephyr contributes each of its
 * directions to a storm ONCE — tracked against the cell itself, not its
 * square, because the wind moves zephyrs around while the storm is still
 * going. Without it a chain is only bounded by `cap`, and "bounded by the cap"
 * is what a tile sailing ten squares off the edge of the world looks like from
 * the inside.
 *
 * Reports come back in the order they happened, so the caller can pay for them
 * and narrate them in the order a player watched them.
 */
export function storm(board, first, cap = MAX_GUSTS) {
  const out = [];
  const queue = Array.isArray(first) ? first.slice() : [first];
  const fired = new Map();                               // cell -> Set of directions

  const once = (cell, dir) => {
    let seen = fired.get(cell);
    if (!seen) fired.set(cell, seen = new Set());
    if (seen.has(dir)) return false;
    seen.add(dir);
    return true;
  };

  for (const spec of queue) {
    const src = spec.from && board.get(spec.from.x, spec.from.y);
    if (src) once(src, spec.dir);
  }

  while (queue.length && out.length < cap) {
    const g = gust(board, queue.shift());
    out.push(g);
    for (const { cell, dir, push } of g.zephyrs) {
      if (board.get(cell.x, cell.y) !== cell) continue;   // it fell, or was buried
      if (!once(cell, dir)) continue;
      // A woken zephyr opens at whichever is harder: the wind that woke it,
      // plus the square it gains for turning, or its own breath.
      queue.push({ dir, from: { x: cell.x, y: cell.y }, push: Math.max(push || 1, zephyrPush(cell)) });
    }
  }
  return out;
}
