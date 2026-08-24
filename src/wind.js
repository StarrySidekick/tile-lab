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
//   AND IT DOES THAT AT EVERY GAP DOWN THE LANE. A gap is open air, not a
//     wall: the wind crosses it, finds the next piece of country, and takes
//     that one's loose end too, all the way to the far edge of the board. Its
//     strength carries across — it is the same wind on both sides of a strait.
//     One gust is one nibble per run, not one nibble.
//   WHAT THE WIND CAN GET UNDER GOES WHOLE. A mode may name the country too
//     big to lift (`rooted` — in Girando, the Palazzo's mainland). Everything
//     else the gust reaches is small enough that the wind takes ALL of it,
//     perpendicular arms and all, and sets it down downwind as one thing —
//     sliding until it comes to rest ALONGSIDE whatever stops it, rather than
//     short of it. That is what makes an archipelago move: islands travel,
//     meet, and merge.
//   HOW MANY, AND HOW FAR, IS THE POWER. A gust arriving at the loose end with
//     power N pops the last N tiles of the run off and carries each of them N
//     squares. One is one tile, one square. Two is two tiles, two squares
//     each — and because they were touching before and all travel together,
//     they arrive still touching, as a raft.
//   …UNLESS IT IS A CANNON, and then it FIRES them. `blast` on a gust means
//     the loose end is not carried N squares but shot: each tile travels until
//     the square in front of it is occupied, however far away that is, so a
//     raft crosses a strait it could never have crossed a square at a time,
//     the leading tile going furthest and the ones behind piling up against
//     it. One fired down a lane with NOTHING in it never stops, which is to
//     say it falls out of the sky — the one thing the wind destroys. Only the
//     tiles are fired; followers are carried as they always were, because a
//     person is not a projectile.
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
//     Girando that is the Balena, and nothing else — has no loose end at all,
//     and the lane ENDS there: nothing comes off it, and everything in the
//     whale's lee, gaps and all, is untouched.
//   NOTHING FALLS FOR BEING ALONE. A tile touching nothing at all hangs there
//     in the open sky, and that is the point: the fragments are where islands
//     come from, and dropping them was an eraser that healed the board back
//     into one mass every turn. The ONE thing that still falls is a tile the
//     wind MOVED that no longer FITS — one that comes down beside country
//     whose edges it cannot meet is touching the kingdom and joined to none of
//     it, and there is nothing holding that up. It is gone for good. A tile
//     with no neighbours has nothing to disagree with, so it floats.
//   FOLLOWERS ARE BLOWN LIKE TILES — WHICH IS NOT WHAT HAPPENS TO THE TILES.
//     A follower on one of the tiles that comes away rides it and never
//     notices. Every OTHER follower in the lane is picked up and put down that
//     many squares downwind — squares, not the cannon's range, because a
//     person is not a projectile — on whatever it finds there, which may be a
//     feature somebody else holds, or nothing at all. Nothing at all means it
//     goes back to its owner's hand.
//   AND A FOLLOWER PUT DOWN ON A ZEPHYR IS IN THAT WIND. It does not stand
//     there next to it: it goes on down the new zephyr's lane, at that
//     zephyr's strength, and if THAT lands it on another zephyr it goes on
//     again. Being blown across a board full of weather is a journey, not a
//     step.
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

/**
 * A GUST CANNON. It is a zephyr in every way the engine cares about — it has a
 * direction, it is absorbed by wind blowing its way, it is woken by wind that
 * isn't, and it chains — except in what it does at the loose end: it FIRES the
 * tiles rather than carrying them, and a fired tile travels until the square in
 * front of it is taken, however far away that is.
 */
export const isCannon = (cell) => !!zephyrOn(cell)?.blast;

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

/** The key a mode's `rooted` set is keyed by, and the one this file uses. */
const kOf = (x, y) => `${x},${y}`;

/**
 * The runs of country down one lane, in the order the wind meets them.
 *
 * The wind does not stop at the first gap. It crosses it — a gap is open air,
 * not a wall — and finds the next piece of country, and the next, all the way
 * to the far edge of the board. Every one of those runs has a loose end of its
 * own, and the gust takes every one. That is the difference between a zephyr
 * that rearranges its own corner and weather that reaches across a strait, and
 * it is what lets a gust cut a board that is one tile thick in two places at
 * once.
 *
 * Only the WHALE ends a lane. A run backed up against it has no loose end, and
 * nothing beyond it is touched at all.
 */
function laneRuns(board, from, dx, dy) {
  const lane = [];
  for (const c of board.cells.values()) {
    const ok = dx === 0
      ? c.x === from.x && (dy < 0 ? c.y < from.y : c.y > from.y)
      : c.y === from.y && (dx < 0 ? c.x < from.x : c.x > from.x);
    if (ok) lane.push(c);
  }
  lane.sort((a, b) => (a.x * dx + a.y * dy) - (b.x * dx + b.y * dy));

  const runs = [];
  let cur = null;
  let prev = null;
  for (const c of lane) {
    if (blocks(c)) { if (cur) cur.open = false; break; }   // the whale: no loose end, no lee
    const d = c.x * dx + c.y * dy;
    if (!cur || d !== prev + 1) { cur = { cells: [], open: true }; runs.push(cur); }
    cur.cells.push(c);
    prev = d;
  }
  return runs;
}

/** Every lane on the board at once, for a mass weather event. */
function everyLane(board, dx, dy) {
  const heads = new Map();
  const along = (c) => c.x * dx + c.y * dy;
  for (const c of board.cells.values()) {
    const lane = dx === 0 ? c.x : c.y;
    const best = heads.get(lane);
    if (!best || along(c) < along(best)) heads.set(lane, c);
  }
  const out = [];
  for (const head of heads.values()) {
    const runs = laneRuns(board, { x: head.x - dx, y: head.y - dy }, dx, dy);
    if (runs.length) out.push(runs);
  }
  return out;
}

/** The whole connected piece of country a tile belongs to, corners not counting. */
function regionOf(board, seed) {
  const seen = new Set([kOf(seed.x, seed.y)]);
  const out = [seed];
  const queue = [seed];
  while (queue.length) {
    const c = queue.pop();
    for (let s = 0; s < 4; s++) {
      const nb = board.neighbor(c.x, c.y, s);
      if (!nb) continue;
      const k = kOf(nb.x, nb.y);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(nb);
      queue.push(nb);
    }
  }
  return out;
}

/**
 * How far a cannon carries something: until the square in front of any part of
 * it is occupied by something that is not itself. `null` means it never hits
 * anything at all — it has been fired clean out of the world, and whatever was
 * fired is gone.
 *
 * The range is bounded by the board rather than by a constant: nothing beyond
 * the furthest tile downwind can ever stop anything, so one square past that is
 * where a shot stops being a shot and starts being a loss.
 */
function firingRange(board, cells, dx, dy, far) {
  const mine = new Set(cells.map((c) => kOf(c.x, c.y)));
  const start = Math.min(...cells.map((c) => c.x * dx + c.y * dy));
  const reach = far - start + 1;
  for (let n = 1; n <= reach; n++) {
    for (const c of cells) {
      const [tx, ty] = [c.x + dx * n, c.y + dy * n];
      if (board.get(tx, ty) && !mine.has(kOf(tx, ty))) return n - 1;
    }
  }
  return null;
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
 * @param blast  a GUST CANNON rather than a zephyr: the loose end is fired
 *               until it hits something rather than carried `power` squares
 */
export function gust(board, { dir, from = null, everywhere = false, push = 1, rooted = null, blast = false }) {
  const [dx, dy] = SIDE_STEP[dir];
  const report = {
    dir, from, everywhere, push, blast, strength: push,
    moved: [], fell: [], carried: [], homed: [], swung: [],
    turbines: [], reached: [], zephyrs: [], lifted: [],
  };

  const lanes = everywhere
    ? everyLane(board, dx, dy)
    : (from ? [laneRuns(board, from, dx, dy)] : []);
  if (!lanes.some((runs) => runs.length)) return report;

  const roots = typeof rooted === 'function' ? rooted(board) : rooted;
  // Downwind distance along the gust — the order everything happens in.
  const along = (c) => c.x * dx + c.y * dy;

  // --- walk each lane, upwind first ------------------------------------------
  // One pass decides three things: how hard the wind is blowing by the time it
  // reaches each tile, which zephyrs it sets off rather than absorbs, and what
  // it gets hold of at each loose end. Strength carries ACROSS the gaps — it is
  // the same wind on the far side of a strait as it was on the near one.
  const force = new Map();                        // cell -> the wind that reached it
  const rafts = [];                               // what actually moves
  const seen = new Set();                         // pieces of country already lifted
  for (const runs of lanes) {
    let strength = Math.min(MAX_STRENGTH, push);
    for (const run of runs) {
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
          // away, because a zephyr contributes each of its directions to a
          // storm exactly once (see `storm`).
          report.zephyrs.push({ cell: c, dir: d, push: Math.min(MAX_STRENGTH, strength + 1), blast: isCannon(c) });
        }
        if (absorbed) strength = Math.min(MAX_STRENGTH, strength + 1);
      }

      // The loose end. A run backed up against the whale has none.
      if (!run.open || !run.cells.length) continue;
      const last = run.cells[run.cells.length - 1];
      const power = force.get(last);

      // WHAT THE WIND CAN GET UNDER GOES WHOLE. A mode may name the country
      // that is too big to lift — in Girando that is the Palazzo's mainland,
      // and nothing else. Everything else adrift in the sky is small enough
      // that the wind takes ALL of it, perpendicular arms and all, and sets it
      // down further downwind rather than nibbling a tile off its end. That is
      // what makes the archipelago move: islands slide, meet, and merge.
      if (roots && !roots.has(kOf(last.x, last.y))) {
        const group = regionOf(board, last);
        if (seen.has(group[0])) continue;
        for (const c of group) seen.add(c);
        rafts.push({ power, cells: group, whole: true });
        continue;
      }
      rafts.push({ power, cells: run.cells.slice(Math.max(0, run.cells.length - power)) });
    }
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
  // Far end first, always, so anything moving slides along behind its own
  // leading edge instead of piling up into itself.
  //
  // How far anything can possibly go: nothing past the furthest tile downwind
  // can ever stop a shot, so that is where a cannon runs out of world.
  let far = -Infinity;
  for (const c of board.cells.values()) far = Math.max(far, along(c));
  const fired = [];                               // shot clean out of the world

  for (const raft of rafts) {
    const order = raft.cells.slice().sort((a, b) => along(b) - along(a));

    // A whole piece of country the wind got under. It travels as ONE thing, so
    // it goes as far as ALL of it can — up to the power, and no further than
    // the first square any part of it would have to share. Coming to rest
    // ALONGSIDE something rather than stopping short of it is the point: that
    // is how two rocks become an island and how an island grows.
    if (raft.whole) {
      if (order.some(immovable)) continue;
      const mine = new Set(order.map((c) => kOf(c.x, c.y)));
      let steps = 0;
      for (let n = 1; n <= raft.power; n++) {
        const clear = order.every((c) => {
          const [tx, ty] = [c.x + dx * n, c.y + dy * n];
          return !board.get(tx, ty) || mine.has(kOf(tx, ty));
        });
        if (!clear) break;
        steps = n;
      }
      if (!steps) continue;
      const was0 = order.map((c) => ({ x: c.x, y: c.y }));
      for (const cell of order) {
        const was = { x: cell.x, y: cell.y };
        if (!board.shift(was, { x: was.x + dx * steps, y: was.y + dy * steps })) continue;
        report.moved.push({ cell, from: was, steps });
      }
      report.lifted.push({ cells: order, steps, from: was0 });
      continue;
    }

    // The loose end of the mainland: `power` tiles come off, each travelling
    // `power` squares — unless this is a CANNON, in which case each of them is
    // FIRED and travels until the square in front of it is taken, however far
    // that is. The leading tile goes furthest and the ones behind pile up
    // against it, so a raft arrives still a raft. Fired down a lane with
    // nothing in it, a tile goes on for ever, which is to say out of the sky.
    for (const cell of order) {
      if (immovable(cell)) continue;
      let steps = 0;
      if (blast) {
        const shot = firingRange(board, [cell], dx, dy, far);
        if (shot === null) { fired.push(cell); continue; }
        steps = shot;
      } else {
        for (let n = 1; n <= raft.power; n++) {
          if (board.get(cell.x + dx * n, cell.y + dy * n)) break;   // pressed up against something
          steps = n;
        }
      }
      if (!steps) continue;
      const was = { x: cell.x, y: cell.y };
      if (!board.shift(was, { x: was.x + dx * steps, y: was.y + dy * steps })) continue;
      report.moved.push({ cell, from: was, steps });
    }
  }

  // --- what the move did to them --------------------------------------------
  // TWO ways out of the sky, and neither is "it was on its own". A tile the
  // wind shakes free of everything hangs there: the fragments are where the
  // islands come from, and dropping them was an eraser that healed the board
  // back into one mass every turn.
  //
  // What falls is a tile that has been FIRED into a lane with nothing in it —
  // there was never anything out there to stop it, so it is still going — and
  // a tile the wind moved that no longer FITS, one that comes down beside
  // country whose edges it can't meet, touching the kingdom and joined to none
  // of it. A tile with no neighbours at all has nothing to disagree with, so it
  // floats.
  //
  // The whale's tile is never dropped: a hundred tons of sky whale outranks the
  // seam it happens to be sitting on.
  const drop = (cell, why) => {
    if (cell.meeple) {
      report.homed.push({ ...cell.meeple, x: cell.x, y: cell.y, why: 'fell' });
      cell.meeple = null;
    }
    report.fell.push({ id: cell.type.id, x: cell.x, y: cell.y, type: cell.type, rot: cell.rot, cell, why });
    board.remove(cell.x, cell.y, { quiet: true });   // one rebuild at the end
  };

  for (const cell of fired) {
    if (board.size <= 1) break;
    if (board.get(cell.x, cell.y) !== cell || cell.balena) continue;
    drop(cell, 'fired');
  }

  for (const m of report.moved) {
    if (board.size <= 1) break;
    const cell = m.cell;
    if (board.get(cell.x, cell.y) !== cell || cell.balena) continue;
    if (!board.degree(cell.x, cell.y)) continue;     // nothing to disagree with: it floats
    if (fitsSomething(board, cell)) continue;
    drop(cell, 'mismatch');
  }

  // --- put the followers down ------------------------------------------------
  //
  // A follower blown onto a zephyr is IN that wind, not standing beside it: it
  // carries on down the new zephyr's lane at that zephyr's own strength, and
  // if that lands it on another zephyr it goes again. Being blown across a
  // board full of weather is a journey rather than a step, and it is the one
  // way a figure crosses the sky without a flying machine.
  //
  // Bounded by the tiles it has already been blown off, so a ring of zephyrs
  // pointed at each other is a short ride rather than a hung tab.
  const carried = (from) => {
    let { x, y } = from;
    const been = new Set();
    for (let hop = 0; hop < MAX_GUSTS; hop++) {
      const on = board.get(x, y);
      if (!on || been.has(on)) break;
      been.add(on);
      const winds = zephyrDirs(on);
      if (!winds.length) break;
      const [ax, ay] = SIDE_STEP[winds[0]];
      const n = zephyrPush(on);
      x += ax * n; y += ay * n;
    }
    return { x, y };
  };

  for (const r of riders.sort((a, b) => (b.was.x * dx + b.was.y * dy) - (a.was.x * dx + a.was.y * dy))) {
    const to = carried({ x: r.was.x + dx * r.steps, y: r.was.y + dy * r.steps });
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
export function storm(board, first, { cap = MAX_GUSTS, rooted = null } = {}) {
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
    const g = gust(board, { ...queue.shift(), rooted });
    out.push(g);
    for (const { cell, dir, push, blast } of g.zephyrs) {
      if (board.get(cell.x, cell.y) !== cell) continue;   // it fell, or was buried
      if (!once(cell, dir)) continue;
      // A woken zephyr opens at whichever is harder: the wind that woke it,
      // plus the square it gains for turning, or its own breath. A woken CANNON
      // fires like a cannon — being set off by somebody else's weather does not
      // make it a different piece of artillery.
      queue.push({ dir, from: { x: cell.x, y: cell.y }, push: Math.max(push || 1, zephyrPush(cell)), blast });
    }
  }
  return out;
}
