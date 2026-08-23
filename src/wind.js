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
//   IT PICKS UP STRENGTH — AND ONLY FROM ITS OWN KIND. A gust that runs over
//     a zephyr blowing the same way absorbs it and blows a square harder: one,
//     two, three squares, and no further. That is the only thing that makes a
//     gust travel further. The boost applies BEYOND the absorbed zephyr, never
//     to it: a tile is never blown further by its own breath.
//   EVERY OTHER ZEPHYR THE WIND TOUCHES FIRES, AND THE WEATHER TURNS. A gust
//     that reaches a zephyr pointing any way but its own wakes it, and the
//     storm carries on down the new zephyr's lane in the new zephyr's
//     direction. Across the wind, back into it — it makes no difference; a
//     line of zephyrs is a chain reaction that turns corners and rebounds.
//     What keeps that finite is the rule below, not any bracing.
//   NO ZEPHYR BLOWS TWICE IN ONE STORM. Not per direction, not per gust: the
//     whole cascade is one weather event, and a zephyr contributes each of its
//     directions to it once. It's the other half of what stops a chain from
//     running away, and it's what makes a chain finite rather than merely
//     capped.
//   A ZEPHYR IS NEVER NAILED DOWN. Whatever else a mode has decided about a
//     tile, if it carries a zephyr the wind can move it. Weather that could be
//     frozen in place stops being weather, and a board of stuck zephyrs is a
//     board where the engine has quietly switched itself off.
//   ONLY THE WHALE STOPS THE WIND. A tile with nowhere to go doesn't budge,
//     but the gust carries on past it and shoves everything loose beyond. The
//     one exception is a BLOCKER — in Girando that is the Balena, and nothing
//     else. Wind hits it, stops, and everything in its lee is untouched.
//   CORNERS DON'T COUNT, AND EVERY TILE IS CHECKED. A tile has to be beside
//     something edge to edge or it falls out of the sky — and that is asked of
//     every tile on the board after a gust, not only the ones that moved. A
//     tile the wind never touched is left hanging when the neighbours holding
//     it up slide away from it, which is by far the commonest way to end up
//     with nothing underneath you.
//   A ZEPHYR GOES WITH ITS OWN WIND. It is blowing, and it is in the wind too:
//     one square downwind, into the hole its own lane just opened. Without it a
//     zephyr is a permanent hole-maker, shoving the country away from itself
//     and then sitting in the gap. One that blows SEVERAL ways at once doesn't
//     travel — it is braced by its own weather, and there is no answer to
//     which of four directions a compass rose would go.
//   FOLLOWERS ARE BLOWN LIKE TILES. A follower travels the same distance as
//     everything else in its lane, so one standing on a tile that also moves
//     rides along and never notices — and one standing on a tile that DOESN'T
//     move gets picked up and put down on whatever is downwind of it, which
//     may be a feature somebody else holds, or nothing at all. Nothing at all
//     means it goes back to its owner's hand; that is the only way a follower
//     leaves the board.
//   THE FAR END GOES FIRST. Tiles are moved downwind-first, so a lane slides
//     along behind whatever's in front of it instead of piling up.
// ---------------------------------------------------------------------------

import { SIDE_STEP, NO_MEEPLE, opposite } from './tiles.js';

/**
 * A backstop, not the rule. What ends a cascade is that no zephyr blows twice
 * in one storm (see `storm`); this is only here so that a bug in that
 * bookkeeping is a short storm rather than a hung tab.
 */
export const MAX_GUSTS = 16;

/** Three squares is as hard as the sky blows, however many zephyrs agree. */
export const MAX_STRENGTH = 3;

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
 * …and the smaller set that also STOPS a gust dead, so that everything in the
 * lee of it is untouched. The whale is the one thing that reliably does this;
 * `cell.blocks` is left for a mode that wants terrain of its own to be solid
 * all the way up.
 */
export const blocks = (cell) => !!cell.balena || (!!cell.blocks && !zephyrOn(cell));

/**
 * One gust.
 *
 * @param board  the Board to shove
 * @param dir    0=N 1=E 2=S 3=W — the way the wind is going
 * @param from   {x, y} the tile it blows out of; reaches only that lane,
 *               downwind. Omit with `everywhere` for a mass event.
 * @param everywhere  every lane on the board at once
 */
export function gust(board, { dir, from = null, everywhere = false, push = 1 }) {
  const [dx, dy] = SIDE_STEP[dir];
  const report = {
    dir, from, everywhere, push, strength: push,
    moved: [], fell: [], carried: [], homed: [], swung: [],
    turbines: [], reached: [], zephyrs: [],
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
  // time it reaches each tile, where something solid cuts it off, and which
  // zephyrs it sets off rather than absorbs.
  const sheltered = new Set();
  const force = new Map();                        // cell -> squares it will move
  const lanes = new Map();
  for (const c of reached) {
    if (!lanes.has(laneOf(c))) lanes.set(laneOf(c), []);
    lanes.get(laneOf(c)).push(c);
  }

  for (const row of lanes.values()) {
    row.sort((a, b) => along(a) - along(b));
    // A DOUBLE ZEPHYR opens at two squares rather than one. Everything else
    // about the lane is unchanged — it still hardens on zephyrs blowing its
    // way and it still stops at three.
    let strength = Math.min(MAX_STRENGTH, push);
    let blocked = false;
    for (const c of row) {
      if (blocked) { sheltered.add(c); continue; }
      if (blocks(c)) { blocked = true; continue; }  // the whale, and nothing else

      // The force on THIS tile is the wind as it arrived — worked out before
      // the tile's own zephyr is folded in. A zephyr blowing the same way as
      // the gust used to boost the wind and then be moved by the boosted
      // figure, which looked exactly like a tile being blown two squares by
      // its own breath. It hardens the wind BEYOND itself, not upon itself.
      force.set(c, strength);
      report.strength = Math.max(report.strength, strength);
      if (turbineOn(c)) report.turbines.push(c);

      let absorbed = false;
      for (const d of zephyrDirs(c)) {
        // Blowing our way: absorbed, and the gust hardens from here on.
        if (d === dir) { absorbed = true; continue; }
        // Every other way it points, it FIRES — the gust arrives, the zephyr
        // wakes, and the weather turns down the new zephyr's own lane. That
        // includes one pointing straight back at us: the wind rebounds rather
        // than bracing. Nothing runs away, because a zephyr contributes each
        // of its directions to a storm exactly once (see `storm`).
        report.zephyrs.push({ cell: c, dir: d });
      }
      if (absorbed) strength = Math.min(MAX_STRENGTH, strength + 1);
    }
  }

  const exposed = reached.filter((c) => !sheltered.has(c) && !blocks(c));
  report.reached = exposed;

  // --- pick the followers up -------------------------------------------------
  // Before anything moves, because a follower travels the same distance as its
  // lane and has to be put down against the board the gust leaves behind.
  const riders = [];
  for (const c of exposed) {
    if (!c.meeple) continue;
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

  // --- the zephyr goes with its own wind -------------------------------------
  // It is blowing; it is in the wind too. One square, downwind, into the hole
  // the lane just left behind it — which is most of the point, because a
  // zephyr that stayed put was a permanent hole-maker: it shoved the country
  // away from itself and then sat in the gap it had made.
  // …but only a zephyr that blows ONE way. A crosswind, a trident or a compass
  // rose is letting go in several directions at once and is braced by its own
  // weather; it is the fixed centre of its own storm, and asking it to travel
  // four ways in one turn has no answer anyway.
  const src = from && !everywhere ? board.get(from.x, from.y) : null;
  const rides = src && zephyrDirs(src).length === 1;
  if (rides && !immovable(src) && !board.get(from.x + dx, from.y + dy)) {
    const was = { x: from.x, y: from.y };
    if (board.shift(was, { x: was.x + dx, y: was.y + dy })) {
      report.moved.push({ cell: src, from: was, steps: 1 });
    }
  }

  // --- what the move did to them --------------------------------------------
  // Corners don't hold a tile up: a tile has to be beside something edge to
  // edge or it falls out of the sky. EVERY tile is checked, not just the ones
  // that moved — a tile the wind never touched is left hanging in the air when
  // the neighbours that were holding it up slide away, and that is far and
  // away the commonest way to be left holding nothing. Repeated, because
  // dropping one tile can leave the next one hanging too.
  //
  // Two things are never dropped: the tile the whale is lying on, which is
  // held up by a hundred tons of sky whale, and the last tile on the board,
  // because a board with nothing on it is not a game.
  for (let pass = 0; pass < 32; pass++) {
    if (board.size <= 1) break;
    const loose = [...board.cells.values()]
      .filter((c) => !c.balena && board.degree(c.x, c.y) === 0)
      .sort((a, b) => a.seq - b.seq);
    if (!loose.length) break;
    for (const cell of loose) {
      if (board.size <= 1) break;
      report.fell.push({ id: cell.type.id, x: cell.x, y: cell.y, type: cell.type, rot: cell.rot, cell });
      board.remove(cell.x, cell.y, { quiet: true });   // one rebuild at the end
    }
  }

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

  // --- the things that turn into the wind ------------------------------------
  // A vane turns whether or not it moved — it's a vane — and so does a straight
  // road, which lies along whatever is blowing through it. Anchored ones have
  // stopped being weather and don't.
  for (const cell of exposed) {
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
 * across it fires in its turn, from wherever it ended up.
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
    for (const { cell, dir } of g.zephyrs) {
      if (board.get(cell.x, cell.y) !== cell) continue;   // it fell, or was buried
      if (!once(cell, dir)) continue;
      queue.push({ dir, from: { x: cell.x, y: cell.y }, push: zephyrPush(cell) });
    }
  }
  return out;
}
