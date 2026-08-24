// ---------------------------------------------------------------------------
// Headless play-testing.
//
//   node tools/harness.mjs                 every mode, every modifier
//   node tools/harness.mjs marches 200     one mode, 200 seeded games
//
// Plays random legal moves to completion and shouts if anything throws, hangs,
// or ends in a state that shouldn't exist. Twelve modes is more than you can
// click through by hand, and a rules change in board.js can break a mode you
// weren't looking at.
//
// It also prints score spreads, which is the only cheap way to notice that a
// mode is degenerate (everybody always ends on the same number) before you sit
// down to play it.
// ---------------------------------------------------------------------------

import { Game, MODES, MECHANICS, LIVE_MECHANICS } from '../src/game.js';
import { Bot, BOT_LEVELS } from '../src/ai.js';
import { makePiece, rotatePiece, validatePiece } from '../src/pieces.js';
import { Board } from '../src/board.js';
import { TILES } from '../src/tiles.js';
import { liftableCells, BASE_LAYER, allFields, citiesFed } from '../src/mechanics.js';
import { gust, storm } from '../src/wind.js';
import { GROUPS } from '../src/tiles.js';

const ALL_GROUPS = GROUPS.map((g) => g.id);

const MAX_STEPS = 4000;

let failures = 0;
const fail = (what, err) => {
  failures++;
  console.log(`  ✗ ${what}\n    ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n    ') : err}`);
};

/**
 * One full game. Every seat plays random legal moves, except the ones listed
 * in `bots` — pass `'all'` to hand the whole game to the computer player, or a
 * list of seats to set it against random play. Returns a summary or throws.
 */
function playOut(opts) {
  const game = new Game(opts);
  const rng = mulberry(opts.seed ?? 1);
  const bots = new Map();
  if (opts.bots) {
    const seats = opts.bots === 'all' ? game.players.map((p) => p.id) : opts.bots;
    for (const seat of seats) {
      bots.set(seat, new Bot(game, seat, { level: opts.botLevel || 'steady', seed: opts.seed ?? 1 }));
    }
  }
  let steps = 0;

  while (game.phase !== 'over' && steps++ < MAX_STEPS) {
    const before = state(game);
    const bot = bots.get(game.current);
    if (bot) bot.act(); else step(game, rng);
    const after = state(game);
    if (before === after) {
      // Nothing moved — the mode has no legal action, which is a bug in it.
      throw new Error(`stuck in phase "${game.phase}" (turn ${game.turn}, deck ${game.deck.length})`);
    }
  }
  if (steps >= MAX_STEPS) throw new Error(`ran ${MAX_STEPS} steps without finishing`);
  return {
    turns: game.turn,
    tiles: game.board.size,
    scores: game.players.map((p) => p.score),
    stuck: [...bots.values()].reduce((n, b) => n + b.stuck, 0),
  };
}

/**
 * Enough of the game to tell "nothing happened" from "something happened that
 * didn't put a tile down" — taking out the abbey or toggling the big follower
 * are real moves that leave the board untouched.
 */
/**
 * A fingerprint of everything a legal move could change, used only to notice
 * that a move changed nothing at all.
 *
 * `board.seq` is the load-bearing field. Board SIZE is not enough in a mode
 * where the country moves: Girando can lay a tile, have the wind blow a
 * different one out of the sky, put that one back in the deck and deal it
 * straight back — a real move, a completely rearranged board, and every coarse
 * counter back where it started. The placement counter only ever goes up.
 */
function state(game) {
  return [
    game.phase, game.turn, game.board.size, game.board.seq, game.deck.length,
    game.tile?.id, game.usingAbbey, game.useBig, game.tilesLeft,
    game.market?.length, game.player.meeples, game.player.abbeys,
    game.river?.deck.length, game.pendingWalk ? 1 : 0,
  ].join('|');
}

function step(game, rng) {
  const pick = (list) => list[Math.floor(rng() * list.length)];

  switch (game.phase) {
    case 'market': {
      game.takeFromMarket(Math.floor(rng() * game.market.length));
      return;
    }
    case 'place': {
      const spots = legalSpots(game);
      if (!spots.length) { game.holdPosition?.(); game.finish(); return; }
      // The abbey is a genuinely different placement, so try it sometimes.
      if (game.canPlayAbbey() && rng() < 0.4) { game.playAbbey(); return; }
      const spot = pick(spots);
      while (game.rot !== spot.rot && game.m.rotate === undefined) game.rotate(1);
      if (game.m.rotate) for (let i = 0; i < spot.rot; i++) game.rotate(1);
      if (!game.placeAt(spot.x, spot.y)) {
          // Rotation-sensitive modes may have moved the piece under us; retry once.
        const again = legalSpots(game);
        if (!again.length) return game.finish();
        game.placeAt(again[0].x, again[0].y);
      }
      return;
    }
    // Girando: walking a follower on down a road after the sky has paid it.
    case 'stroll': {
      const spots = game.m.stroll?.targets || [];
      if (!spots.length || rng() < 0.25) return void game.m.skipStroll();
      const t = pick(spots);
      if (!game.cellClick(t.x, t.y)) game.m.skipStroll();
      return;
    }
    // …and retiring one into a city it is standing in.
    case 'flat': {
      const spots = game.m.flatTargets();
      if (!spots.length) return void game.m.cancelFlat();
      const t = pick(spots);
      if (!game.cellClick(t.x, t.y)) game.m.cancelFlat();
      return;
    }
    // Girando's flying machine, fetching a follower back off its own lane.
    case 'flight': {
      const spots = game.m.flightLifts();
      if (!spots.length) return void game.m.cancelLift();
      const t = pick(spots);
      if (!game.cellClick(t.x, t.y)) game.m.cancelLift();
      return;
    }
    // Girando's whale: three squares, instead of a follower.
    case 'balena': {
      const spots = game.m.balenaTargets();
      if (!spots.length) return void game.m.cancelSwim();
      const t = pick(spots);
      if (!game.cellClick(t.x, t.y)) game.m.cancelSwim();
      return;
    }
    case 'magic': { game.magicAuto(); return; }
    case 'rob': { if (rng() < 0.5) game.robAuto(); else game.robSkip(); return; }
    case 'crop': { game.cropChoose(rng() < 0.5 ? 'add' : 'remove'); return; }
    case 'meeple': {
      // A mode may offer something INSTEAD of a follower; Girando's whale is
      // the only one, and it never gets exercised unless something picks it.
      if (game.m.canLieDown?.() && rng() < 0.3) return void game.m.beginFlat();
      if (game.m.canLift?.() && rng() < 0.25) return void game.m.beginLift();
      if (game.m.canSwim?.() && rng() < 0.15) return void game.m.beginSwim();
      if (game.canPlaceBuilding?.() && rng() < 0.5) game.placeBuilding();
      if (game.canBuildBridge?.() && rng() < 0.4) game.buildBridge();
      const opts = game.meepleOptions();
      if (game.canRecall() && rng() < 0.08) return void game.beginRecall();
      if (game.has('bigMeeple') && game.player.big > 0 && rng() < 0.3) game.toggleBig();
      if (opts.length && rng() < 0.7) { const o = pick(opts); game.placeMeeple(o.i, o); }
      else game.skipMeeple();
      return;
    }
    case 'move': {
      const walker = game.walker;
      const pawns = walker.visiblePawns.filter((p) => walker.select(p));
      if (!pawns.length) return game.holdPosition();
      const pawn = pick(pawns);
      walker.select(pawn);
      const dests = [...walker.reachable(pawn).values()];
      if (game.canEnterCity() && rng() < 0.5) return void game.enterCity();
      if (!dests.length || rng() < 0.12) return game.holdPosition();
      const d = pick(dests);
      if (!game.movePawn(d.x, d.y)) game.holdPosition();
      return;
    }
    case 'lift': {
      const spots = game.m.allLiftable ? game.m.allLiftable() : liftableCells(game.board);
      if (!spots.length) return void (game.m.cancelLift ? game.m.cancelLift() : game.cancelLift());
      const s = pick(spots);
      if (!game.cellClick(s.x, s.y)) { if (game.m.cancelLift) game.m.cancelLift(); else game.cancelLift(); }
      return;
    }
    case 'recall': {
      const mine = game.myMeeples();
      if (!mine.length) return void game.skipMeeple();
      const c = pick(mine);
      game.recallAt(c.x, c.y);
      return;
    }
    case 'walk': {
      if (rng() < 0.4) return void game.declineWalk();
      const t = pick(game.pendingWalk.targets);
      if (!game.walkTo(t.x, t.y)) game.declineWalk();
      return;
    }
    case 'story': {
      game.m.choose(Math.floor(rng() * 3));
      return;
    }
    case 'boon': {
      game.m.chooseBoon(Math.floor(rng() * 3));
      return;
    }
    case 'interior-place': {
      const inv = game.interior;
      const spots = inv.board.legalPlacements(inv.tile);
      if (!spots.length) return void game.interiorHold();
      const s = pick(spots);
      for (let i = 0; i < s.rot; i++) inv.rotate(1);
      game.interiorPlaceAt(s.x, s.y);
      return;
    }
    case 'interior-move': {
      if (game.canLeaveInterior() && rng() < 0.25) return void game.leaveInterior();
      const dests = [...game.interior.reachable().values()];
      if (!dests.length) return void game.interiorHold();
      const d = pick(dests);
      if (!game.interiorMoveTo(d.x, d.y)) game.interiorHold();
      return;
    }
    default:
      throw new Error(`no handler for phase "${game.phase}"`);
  }
}

/** Legal placements for whatever the mode is currently offering. */
function legalSpots(game) {
  if (game.usingAbbey) return game.abbeyGaps().map((g) => ({ ...g, rot: 0 }));
  if (game.riverActive) return game.riverPlacements(game.tile);
  if (game.m.piece) {
    return game.board.legalPiecePlacements(game.m.piece).map((p) => ({ ...p, rot: 0 }));
  }
  if (!game.tile) return [];
  // Go through canPlaceAt rather than board.canPlace, so every mechanic that
  // narrows placement (covering rules, the waterline, a mode's own veto) is
  // honoured instead of reimplemented here and drifting out of step.
  const out = [];
  const saved = game.rot;
  for (const { x, y } of game.board.candidates(game.placeOpts())) {
    for (let rot = 0; rot < 4; rot++) {
      game.rot = rot;
      if (game.canPlaceAt(x, y)) out.push({ x, y, rot });
    }
  }
  game.rot = saved;
  return out;
}

function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- unit-ish checks --------------------------------------------------------

function checkBoard() {
  console.log('board primitives');

  // remove() must restore exactly the connectivity a fresh board would have —
  // which now includes the sky bridge over the hole it just made, so the test
  // is the invariant rather than a number.
  const a = new Board();
  a.place(0, 0, TILES.U, 0);
  a.place(0, -1, TILES.U, 0);
  a.place(0, -2, TILES.U, 0);
  const road = a.featureOf(0, 0, 0);
  if (road.tiles.size !== 3) return fail('union of three road tiles', `got ${road.tiles.size}`);
  a.remove(0, -1);
  const fresh = new Board();
  fresh.place(0, 0, TILES.U, 0);
  fresh.place(0, -2, TILES.U, 0);
  const split = a.featureOf(0, 0, 0);
  if (split.tiles.size !== fresh.featureOf(0, 0, 0).tiles.size) {
    return fail('remove() leaves what a fresh board would have',
      `${split.tiles.size} against ${fresh.featureOf(0, 0, 0).tiles.size}`);
  }

  // A SKY BRIDGE: one square of open air, straight on, and the road is one
  // road again. Only straight, and only one square.
  {
    const b = new Board();
    b.place(0, 0, TILES.U, 0);
    b.place(0, -2, TILES.U, 0);
    if (b.featureOf(0, 0, 0).tiles.size !== 2) return fail('a road bridges one straight square', 'it did not');
    if (b.bridges.length !== 1) return fail('the bridge is reported for drawing', `${b.bridges.length}`);
    const c = new Board();
    c.place(0, 0, TILES.U, 0);
    c.place(0, -3, TILES.U, 0);
    if (c.featureOf(0, 0, 0).tiles.size !== 1) return fail('a road does not bridge two squares', 'it did');
    const d = new Board();
    d.place(0, 0, TILES.U, 0);
    d.place(0, -2, TILES.U, 1);                 // turned across: no longer straight
    if (d.featureOf(0, 0, 0).tiles.size !== 1) return fail('a bridge has to be straight', 'it bent');
  }
  if (a.size !== 2) return fail('remove() drops the cell', `size ${a.size}`);

  // Stacking: the top tile is what the neighbours see.
  const b = new Board();
  b.place(0, 0, TILES.U, 0);
  b.place(0, 0, TILES.G, 0, { over: true });
  if (b.get(0, 0).h !== 1) return fail('stacked cell height', b.get(0, 0).h);
  if (b.edgeAt(b.get(0, 0), 1) !== 'c') return fail('top tile owns the edges', b.edgeAt(b.get(0, 0), 1));
  b.remove(0, 0);
  if (b.get(0, 0)?.type.id !== 'U') return fail('removing a stack resurfaces what was under it', b.get(0, 0)?.type.id);

  // Connectivity guard used by Cirrus.
  const c = new Board();
  c.place(0, 0, TILES.X, 0);
  c.place(1, 0, TILES.X, 0);
  c.place(2, 0, TILES.X, 0);
  if (c.staysConnected(1, 0)) return fail('staysConnected spots a cut vertex', 'said yes');
  if (!c.staysConnected(2, 0)) return fail('staysConnected allows leaves', 'said no');

  // Enclosed holes.
  const d = new Board();
  for (const [x, y] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) d.place(x, y, TILES.B, 0, { free: true });
  const holes = d.enclosedHoles();
  if (holes.length !== 1 || holes[0].x !== 0 || holes[0].y !== 0) {
    return fail('enclosedHoles finds the courtyard', JSON.stringify(holes));
  }
  console.log('  ✓ remove, rebuild, stacking, connectivity, holes');
}

function checkPieces(n = 300) {
  console.log('piece generation');
  const rng = mulberry(7);
  let bad = 0, sizes = new Map();
  for (let i = 0; i < n; i++) {
    let p = makePiece(rng, ['base']);
    for (let r = 0; r < 4; r++) {
      const err = validatePiece(p);
      if (err) { bad++; break; }
      p = rotatePiece(p, 1);
    }
    sizes.set(p.cells.length, (sizes.get(p.cells.length) || 0) + 1);
  }
  if (bad) return fail(`${bad}/${n} generated pieces had bad internal seams`, '');
  const spread = [...sizes.entries()].sort().map(([k, v]) => `${k}-cell ×${v}`).join(', ');
  console.log(`  ✓ ${n} pieces valid through all four rotations (${spread})`);
}

// --- the wind ----------------------------------------------------------------

/**
 * Girando's engine, on boards built by hand. Every one of these is a rule you
 * can state in a sentence, and every one of them is a rule that a game of
 * Girando is unplayable without — which is exactly the set worth asserting
 * rather than hoping a random playthrough happens to cover.
 *
 * `B` and `Kz` are the two all-field tiles in the pool, so a board built out of
 * them has legal seams everywhere and nothing falls for the wrong reason. That
 * matters more than it used to: a tile the wind moves has to still FIT what it
 * lands against, so a test board thrown together out of mismatched roads now
 * loses tiles on its way to the assertion.
 */
function checkWind() {
  console.log('the wind');

  const at = (b, x, y) => b.get(x, y);
  const lay = (b, x, y, id, rot = 0) => b.place(x, y, TILES[id], rot, { free: true });

  // THE RULE. A row of five, a zephyr on the right of it blowing west: the wind
  // does nothing at all to the country it passes through, and takes the LOOSE
  // END off the far side. One tile, one square. And the zephyr stays where it
  // is — it no longer travels with its own wind, because it no longer opens a
  // hole beside itself to travel into.
  {
    const b = new Board();
    lay(b, 4, 0, 'Kz', 3);                  // the gust, pointing west
    for (const x of [3, 2, 1, 0]) lay(b, x, 0, 'B');
    lay(b, -1, 1, 'B');                     // what the loose end lands beside
    gust(b, { dir: 3, from: { x: 4, y: 0 } });
    if (!at(b, -1, 0)) return fail('the wind takes the loose end one square', 'it did not move');
    if (at(b, 0, 0)) return fail('the loose end leaves its square', 'it is still there');
    for (const x of [1, 2, 3]) {
      if (!at(b, x, 0)) return fail('the country in between does not move', `x=${x} moved`);
    }
    if (!at(b, 4, 0)) return fail('a zephyr does not travel with its own wind', 'it moved');
  }

  // …and at power two it is two tiles, two squares each — the user's own worked
  // example. They were touching before and they all travel together, so they
  // arrive still touching, as a raft.
  {
    const b = new Board();
    lay(b, 4, 0, 'Kz', 3);                  // the gust, west
    lay(b, 3, 0, 'B');
    lay(b, 2, 0, 'Kz', 3);                  // another west zephyr: absorbed
    lay(b, 1, 0, 'B'); lay(b, 0, 0, 'B');
    const r = gust(b, { dir: 3, from: { x: 4, y: 0 } });
    if (r.strength !== 2) return fail('an absorbed zephyr hardens the wind beyond it', `strength ${r.strength}`);
    if (!at(b, -2, 0) || !at(b, -1, 0)) return fail('power two pops two tiles two squares', 'they are not there');
    if (at(b, 0, 0) || at(b, 1, 0)) return fail('both loose tiles leave their squares', 'one stayed');
    if (!at(b, 2, 0)) return fail('the absorbed zephyr is not blown by its own breath', 'it moved');
  }

  // Power no longer stops at three. Four zephyrs blowing one way take the wind
  // to five, and five tiles come off the end five squares each.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the gust, north
    for (const y of [-1, -2, -3, -4]) lay(b, y === 0 ? 0 : 0, y, 'Kz');
    for (const y of [-5, -6, -7, -8, -9]) lay(b, 0, y, 'B');
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.strength !== 5) return fail('a gust stacks past three', `strength ${r.strength}`);
    if (!at(b, 0, -14)) return fail('five tiles travel five squares', 'the far tile is not there');
    if (at(b, 0, -9) || at(b, 0, -5)) return fail('all five leave their squares', 'one stayed');
    if (!at(b, 0, -4)) return fail('the absorbed zephyrs stay put', 'one blew away');
  }

  // A run backed up against the whale has no loose end at all: nothing comes
  // away, and everything in its lee is untouched.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'B');
    lay(b, 0, -2, 'B').balena = true;
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.moved.length) return fail('the whale gives the wind nothing to take', JSON.stringify(r.moved.length));
    if (!at(b, 0, -1) || !at(b, 0, -2)) return fail('the whale shelters its lee', 'something moved');
  }

  // …and `blocks` does the same for a mode that wants terrain of its own.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const keep = lay(b, 0, -1, 'B');
    keep.anchored = true; keep.blocks = true;
    lay(b, 0, -2, 'B');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1) || !at(b, 0, -2)) return fail('a crystallised city shelters its lee', 'the lee moved anyway');
  }

  // Crystallised ground that does NOT block is only ground: the run goes
  // straight over it, and it is the far end that comes away.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const paved = lay(b, 0, -1, 'B');
    paved.anchored = true;
    lay(b, 0, -2, 'B');
    lay(b, 1, -3, 'B');                     // somewhere for the loose end to land
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1)) return fail('crystallised ground does not move', 'it moved');
    if (!at(b, 0, -3)) return fail('the wind goes over it to the loose end', 'the far side sat still');
  }

  // …but the loose end itself, crystallised, stays where it is.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'B').anchored = true;
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1)) return fail('a crystallised loose end holds', 'the wind took it');
  }

  // A zephyr is never nailed down, whatever the mode has decided about it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const frozen = lay(b, 0, -1, 'Kz', 1);  // pointing east, so it is not absorbed
    frozen.anchored = true;
    lay(b, 1, -2, 'B');                     // somewhere for it to land beside
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece

    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (frozen.y !== -2) return fail('a crystallised zephyr still blows about', `it is at y ${frozen.y}`);
  }

  // Every corner the storm turns, it hits one power harder — and the raft it
  // tears off the next end is that much wider.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'Kz', 1);                 // caught across the wind: fires east
    lay(b, 0, -2, 'B'); lay(b, 0, -3, 'B');
    lay(b, 1, -4, 'B');                     // where the first raft lands
    lay(b, 1, -1, 'B'); lay(b, 2, -1, 'B'); // the lane the turn blows down
    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length !== 2) return fail('a blown zephyr fires in its turn', `${reports.length} gust(s)`);
    if (reports[1].dir !== 1) return fail('the turn goes the new zephyr\'s way', `dir ${reports[1].dir}`);
    if (reports[1].push !== 2) return fail('a turn gains a power', `push ${reports[1].push}`);
    if (!at(b, 3, -1) || !at(b, 4, -1)) return fail('the harder wind takes two tiles two squares', 'it did not');
  }

  // A zephyr caught HEAD ON rebounds: every zephyr the wind reaches fires in
  // its own direction, and there is no bracing.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'Kz', 2);                 // straight back at it, south
    lay(b, 1, -2, 'B');                     // where it lands, so it survives to fire
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece

    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length !== 2) return fail('a facing zephyr rebounds the storm', `${reports.length} gust(s)`);
    if (reports[1].dir !== 2) return fail('the rebound goes the facing zephyr\'s way', `dir ${reports[1].dir}`);
  }

  // And no zephyr blows twice in one storm, however the chain comes back round.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'Kz', 1);                 // east
    lay(b, 1, -1, 'Kz', 3);                 // west — pointed straight back at it
    lay(b, 1, -2, 'B'); lay(b, 2, -1, 'B');
    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length > 3) return fail('each zephyr blows once per storm', `${reports.length} gust(s)`);
  }

  // A compass rose opens all four lanes out of one square, and stands still in
  // the middle of them — no zephyr travels with its own wind any more.
  {
    const b = new Board();
    const rose = lay(b, 0, 0, 'Kzq');
    for (const [x, y] of [[0, -1], [0, -2], [1, 0], [2, 0], [0, 1], [0, 2], [-1, 0], [-2, 0]]) lay(b, x, y, 'B');
    const dirs = [0, 1, 2, 3].map((dir) => ({ dir, from: { x: 0, y: 0 } }));
    const reports = storm(b, dirs);
    if (reports.length !== 4) return fail('a compass rose blows all four lanes', `${reports.length} gust(s)`);
    if (rose.x !== 0 || rose.y !== 0) return fail('a compass rose stands still', `it is at ${rose.x},${rose.y}`);
  }

  // THE WIND CROSSES GAPS. A gap is open air, not a wall: the gust goes over it
  // and takes the loose end of the next run too, all the way down the lane.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'B'); lay(b, 0, -2, 'B'); // the near shore
    lay(b, 0, -4, 'B'); lay(b, 0, -5, 'B'); // …and the far one, across a strait
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -3)) return fail('the near run gives up its loose end', 'it did not move');
    if (!at(b, 0, -6)) return fail('and so does the one across the gap', 'the far shore sat still');
    if (r.reached.length !== 4) return fail('the whole lane is reached', `${r.reached.length} tiles`);
  }

  // …and its strength carries over the open air, so a zephyr on the near shore
  // hardens the wind that hits the far one.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'Kz');                    // absorbed: the wind hardens beyond it
    lay(b, 0, -3, 'B'); lay(b, 0, -4, 'B'); // the far shore, across a gap
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.strength !== 2) return fail('strength carries across a gap', `strength ${r.strength}`);
    if (!at(b, 0, -5) || !at(b, 0, -6)) return fail('the far shore loses two tiles two squares', 'it did not');
  }

  // …but the whale ends the lane outright: nothing in its lee is touched,
  // whatever the gaps out there look like.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'B').balena = true;
    lay(b, 0, -3, 'B'); lay(b, 0, -4, 'B');
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.moved.length) return fail('the whale ends the lane', `${r.moved.length} tile(s) moved`);
    if (!at(b, 0, -3) || !at(b, 0, -4)) return fail('nothing in its lee is touched', 'the lee moved');
  }

  // WHAT THE WIND CAN GET UNDER GOES WHOLE. Country a mode has not rooted is
  // lifted entire — perpendicular arms included — rather than nibbled at.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    const isle = [lay(b, 0, -2, 'B'), lay(b, 0, -3, 'B'), lay(b, 1, -3, 'B')];
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 }, rooted: new Set(['0,0']) });
    if (!at(b, 0, -3) || !at(b, 0, -4) || !at(b, 1, -4)) {
      return fail('the whole island travels, arm and all', JSON.stringify(isle.map((c) => `${c.x},${c.y}`)));
    }
    if (r.lifted.length !== 1 || r.lifted[0].steps !== 1) {
      return fail('…and it is reported as one lift', JSON.stringify(r.lifted.map((l) => l.steps)));
    }
  }

  // …and it slides until it comes to rest ALONGSIDE what stops it, not short of
  // it. Two rocks meeting is how an island is born.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kzz');                    // a double zephyr: power two, north
    lay(b, 0, -2, 'B');                     // a rock, adrift
    lay(b, 0, -5, 'B').anchored = true;     // …and another, three clear and pinned
    gust(b, { dir: 0, from: { x: 0, y: 0 }, push: 2, rooted: new Set(['0,0']) });
    if (!at(b, 0, -4)) return fail('a rock slides down the wind', 'it did not move');
    if (b.groups().length !== 2) return fail('…and comes to rest against the next one', `${b.groups().length} group(s)`);
  }

  // …and a piece the wind cannot lift stays whole rather than shedding a tile
  // off its end. It is one thing or it is nothing.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const isle = lay(b, 0, -2, 'B');
    lay(b, 0, -3, 'B').anchored = true;     // something in it the wind can't move
    gust(b, { dir: 0, from: { x: 0, y: 0 }, rooted: new Set(['0,0']) });
    if (isle.y !== -2) return fail('an island the wind cannot lift does not move', `it is at y ${isle.y}`);
    if (!at(b, 0, -3)) return fail('…and does not shed its far tile either', 'the end came off');
  }

  // A turbine is reported for every gust that runs over it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'Ktb');
    lay(b, 1, -2, 'B');
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece

    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.turbines.length !== 1) return fail('a gust turns a turbine', `${r.turbines.length} reported`);
  }

  // A weathervane turns to the wind, which re-cuts what runs through it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz', 1);                  // pointing east
    lay(b, 1, 0, 'Kw');                     // through-road N-S at rot 0
    lay(b, 2, 1, 'U');                      // an 'r' edge to land against
    lay(b, 0, 1, 'B');                      // a neighbour off the lane
    gust(b, { dir: 1, from: { x: 0, y: 0 } });
    const after = b.get(2, 0) || b.get(1, 0);
    if (!after || (after.rot & 1) !== 1) return fail('a vane swings onto the wind axis', `rot ${after && after.rot}`);
  }

  // A straight road does NOT swing — a road you built stays where you built it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz', 1);                  // blowing east
    const straight = lay(b, 1, 0, 'U');     // road N-S at rot 0, side on to it
    lay(b, 2, 1, 'U');
    lay(b, 0, 1, 'B');                      // a neighbour off the lane
    gust(b, { dir: 1, from: { x: 0, y: 0 } });
    if ((straight.rot & 1) !== 0) return fail('a straight road holds its line', `rot ${straight.rot}`);
  }

  // A tile that lands touching country it cannot legally JOIN has nothing
  // holding it up. It falls, and it is the ONLY thing that falls any more —
  // reported as a `mismatch`, and gone from the game.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');                     // a road, and the loose end
    lay(b, 1, -2, 'E', 3);                  // a city wall facing west, where it lands
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (at(b, 0, -2)) return fail('a road shoved against a city wall falls', 'it stayed in the sky');
    if (r.fell.length !== 1 || r.fell[0].why !== 'mismatch') {
      return fail('…and it is reported as a mismatch', JSON.stringify(r.fell.map((f) => f.why)));
    }
  }

  // …and one legal connection is enough to stay in the sky.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');
    lay(b, 1, -2, 'B');                     // a field edge, which a road's flank meets
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -2)) return fail('one legal connection holds a tile up', 'it fell anyway');
    if (r.fell.length) return fail('…and nothing falls', JSON.stringify(r.fell.map((f) => f.why)));
  }

  // NOTHING FALLS FOR BEING ALONE. The tile the wind blows clear of everything
  // hangs there over open sky, and so does the one it strands behind it — which
  // is the whole point, because those two fragments are where the next islands
  // come from. This board used to lose both of them.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the gust, north
    lay(b, 0, -1, 'B');
    lay(b, 0, -2, 'B');                     // the loose end, and the victim's only prop
    lay(b, 1, -2, 'B');                     // the victim, stranded when the end goes
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -3)) return fail('the loose end hangs there with nothing beside it', 'it fell');
    if (!at(b, 1, -2)) return fail('a stranded tile hangs there too', 'it fell');
    if (r.fell.length) return fail('and nothing falls at all', JSON.stringify(r.fell.map((f) => f.why)));
  }

  // …so a raft of two blown clear of the kingdom is an island, standing in open
  // sky with nothing but itself holding it up.
  {
    const b = new Board();
    lay(b, 4, 0, 'Kz', 3);                  // west
    lay(b, 3, 0, 'B');
    lay(b, 2, 0, 'Kz', 3);                  // absorbed: the wind arrives at two
    lay(b, 1, 0, 'B'); lay(b, 0, 0, 'B');
    const r = gust(b, { dir: 3, from: { x: 4, y: 0 } });
    if (!at(b, -2, 0) || !at(b, -1, 0)) return fail('the raft lands and stays', 'it fell');
    if (b.groups().length !== 2) return fail('and it is a piece of country of its own', `${b.groups().length} group(s)`);
    if (r.fell.length) return fail('nothing falls', JSON.stringify(r.fell.map((f) => f.why)));
  }

  // A DOUBLE ZEPHYR opens at two squares rather than one, which is two tiles
  // off the end as well as two squares each.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kzz');                    // double, pointing north
    lay(b, 0, -1, 'B'); lay(b, 0, -2, 'B');
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 }, push: 2 });
    if (r.strength !== 2) return fail('a double zephyr opens at two', `strength ${r.strength}`);
    if (!at(b, 0, -3) || !at(b, 0, -4)) return fail('two tiles go two squares', 'they are not there');
    if (!at(b, 0, 0)) return fail('a double zephyr still does not travel', 'it moved');
  }

  // Followers ride the raft: it moves, they move, and neither notices.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const under = lay(b, 0, -1, 'B');
    b.addMeeple(0, -1, 0, 0);
    lay(b, 1, -2, 'B');
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (under.y !== -2) return fail('the tile under the follower moves', `it is at y ${under.y}`);
    if (!b.get(0, -2)?.meeple) return fail('a follower travels with its tile', JSON.stringify(r.carried));
    if (r.homed.length) return fail('nobody goes home from a tile that landed', JSON.stringify(r.homed));
  }

  // …and one on the country the wind leaves alone is picked up off it and put
  // down downwind, on whatever it finds there. That is the whole difference:
  // the wind moves people it does not move the ground under them.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const staying = lay(b, 0, -1, 'B');
    b.addMeeple(0, -1, 0, 0);
    lay(b, 0, -2, 'B');
    lay(b, 0, -3, 'B');
    lay(b, 1, -4, 'B');                     // where the loose end lands
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (staying.y !== -1) return fail('the ground under a follower stays put', `it is at y ${staying.y}`);
    if (staying.meeple) return fail('a follower is lifted off ground the wind leaves', 'it stayed put');
    if (!b.get(0, -2)?.meeple || r.carried.length !== 1) {
      return fail('the wind puts it down one square on', JSON.stringify(r.carried));
    }
  }

  // Blown over open sky, it goes back to its owner's hand — the only way off.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'B');
    b.addMeeple(0, -1, 0, 2);
    lay(b, 0, -2, 'B');
    lay(b, 1, -3, 'B');                     // the loose end lands here, leaving a hole
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.homed.length !== 1 || r.homed[0].player !== 2 || r.homed[0].why !== 'sky') {
      return fail('a follower blown into open sky comes home', JSON.stringify(r.homed));
    }
  }

  // …and one riding a tile that lands where it fits nothing comes home too,
  // rather than going down with it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');                     // a road, and the loose end
    b.addMeeple(0, -1, 0, 3);
    lay(b, 1, -2, 'E', 3);                  // a city wall facing west, where it lands
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (at(b, 0, -2)) return fail('the tile that fits nothing falls', 'it is still there');
    if (!r.homed.some((m) => m.player === 3 && m.why === 'fell')) {
      return fail('its follower comes home rather than going down with it', JSON.stringify(r.homed));
    }
  }

  // A temple is blown about like anything else — parish, keeper and all.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const temple = lay(b, 0, -1, 'Kt');
    b.addMeeple(0, -1, 0, 1);
    lay(b, 1, -2, 'B');
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (b.get(0, -1) === temple) return fail('a temple is blown about', 'it stood still');
    if (temple.meeple?.player !== 1) return fail('its keeper rides along with it', JSON.stringify(temple.meeple));
  }

  // The Abbazia caps what it touches, and un-caps it when the wind takes it.
  {
    const b = new Board();
    lay(b, 0, 0, 'U');                      // a road, open at both ends
    const road = () => b.featureOf(0, 0, 0);
    if (road().open !== 2) return fail('a fresh road has two open ends', road().open);
    lay(b, 0, -1, 'Kab');                   // an Abbazia on one end
    if (road().open !== 1) return fail('an Abbazia caps what it touches', road().open);
    lay(b, 0, 1, 'Kab');
    if (road().open !== 0) return fail('two Abbazias finish a road', road().open);
    b.remove(0, -1);
    if (road().open !== 1) return fail('taking one away opens it again', road().open);
  }

  // Mismatched seams join nothing — a road blown up against a city wall is
  // touching it and joined to none of it, which is why the tile falls unless
  // something ELSE on it fits.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');                     // road N-S, the loose end
    lay(b, 0, -3, 'E', 2);                  // a city wall facing south, two clear
    lay(b, 1, -2, 'U');                     // …and a field flank that DOES fit
    lay(b, 1, 0, 'B');                      // a neighbour off the lane, so the board stays one piece
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    const road = b.featureOf(0, -2, 0);
    if (!road || road.type !== 'road') return fail('the shoved road survives as a road', road && road.type);
    if (road.tiles.size !== 1) return fail('a mismatched seam joins nothing', `road spans ${road.tiles.size}`);
  }

  // The whale outranks everything, zephyrs included.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    const whale = lay(b, 0, -1, 'Kz', 1);   // a zephyr of its own, under the whale
    whale.balena = true;
    lay(b, 0, -2, 'B');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (whale.y !== -1) return fail('the whale pins even a zephyr', `it moved to y ${whale.y}`);
    if (!b.get(0, -2)) return fail('the whale shelters its lee from a zephyr', 'the lee blew away');
  }

  console.log('  ✓ the loose end, rafts, power past three, corners that harden, the whale,'
    + ' crystals, loose zephyrs, turbines, vanes, straight roads, chains, rebounds,'
    + ' once-per-storm, the rose, mismatched landings, fragments that stay up,'
    + ' gaps crossed, islands lifted whole, islands merging, double zephyrs,'
    + ' followers riding and blown, temples, Abbazias, bad seams');
}

/**
 * Girando's own rules, which the wind engine knows nothing about: what the
 * mainland is, what a city pays and un-pays, what a road pays other people,
 * when the farms are harvested, and the whale. Every one of these is cheap to
 * assert and expensive to notice missing — the city clawback in particular is
 * invisible until somebody's score goes down for the wrong reason.
 */
function checkGirando() {
  console.log('girando');

  const fresh = (seed) => {
    const h = new Game({ mode: 'girando', players: 2, seed });
    for (const c of [...h.board.cells.values()]) h.board.remove(c.x, c.y);
    h.players[0].score = 0;
    h.players[1].score = 0;
    return h;
  };
  const lay = (b, x, y, id, rot = 0) => b.place(x, y, TILES[id], rot);

  // The Palazzo is the mainland, and the mainland is the only thing you may
  // build onto. Everything adrift is still on the board and still scoring; it
  // is simply out of reach of a tile in your hand.
  {
    const h = fresh(11);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');
    lay(b, 5, 5, 'Kz');
    lay(b, 5, 6, 'Kz');                       // two tiles adrift: an island
    b.rebuild();
    const opts = h.m.placeOpts();
    if (!opts.onto.has('0,0')) return fail('the Palazzo is the mainland', 'the seat is not in it');
    if (opts.onto.has('5,5')) return fail('an island is not the mainland', 'it was offered anyway');
    if (b.canPlace(6, 5, TILES.Kz, 0, opts)) {
      return fail('you may not build onto an island', 'a square beside one was legal');
    }
    if (!b.canPlace(0, 1, TILES.Kz, 0, opts)) {     // the seat's open south side
      return fail('you may build onto the mainland', 'a square beside the seat was refused');
    }
    // EVERY fragment off the mainland is an island now, down to a single tile —
    // which is what makes a rock you are standing on somewhere you may build,
    // and the reason the archipelago can grow at all.
    lay(b, 9, 9, 'Kz');
    b.rebuild();
    if (!h.m.onIsland(b.get(9, 9))) return fail('one tile alone is an island', 'it did not count');
    if (!h.m.onIsland(b.get(5, 5))) return fail('two tiles adrift are an island', 'it did not count');
    if (h.m.onIsland(b.get(0, 0))) return fail('the mainland is not an island', 'the seat counted as one');
  }

  // NOTHING is paid for being finished any more. Closing a city puts it on the
  // higher rate for the next blue sphere and pays its windmills, and that is
  // the whole of what closing anything does.
  {
    const h = fresh(4);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');                      // a turbine in a city facing north
    lay(b, 0, -1, 'E', 2);                    // …capped from the north
    b.addMeeple(0, 0, 0, 1);                  // seat 1 garrisons it
    b.rebuild();
    h.m.settle(0);                            // seat 0 laid the closing tile
    // The windmill pays the city's HOLDER, not the player who closed it: a mill
    // is a thing you own, not a race you win.
    if (h.players[0].score !== 0) {
      return fail('closing somebody else\'s city pays you nothing', `paid ${h.players[0].score}`);
    }
    if (h.players[1].score !== 2) {
      return fail('a windmill pays 2 to whoever holds its city', `paid ${h.players[1].score}`);
    }
    h.players[1].score = 0;
    if (!b.get(0, 0).meeple) return fail('a follower stays in the city it finished', 'it went home');

    // …and a BLUE sphere is what actually pays it: 2 a tile now that it has
    // closed — and then it hands the follower back, because a FINISHED feature
    // that has been paid for is a feature you get your piece out of.
    h.players[1].score = 0;
    h.players[1].meeples = 4;
    h.m.fire('blue');
    h.m.sweep();
    if (h.players[1].score !== 4) {
      return fail('blue pays 2 a tile for a finished city', `paid ${h.players[1].score} for two tiles`);
    }
    if (b.get(0, 0).meeple) return fail('a finished city hands its follower back', 'it stayed put');
    if (h.players[1].meeples !== 5) {
      return fail('the returned follower reaches the supply', `${h.players[1].meeples} in hand`);
    }
  }

  // An UNFINISHED city pays 1 a tile — and hands its follower back too. A
  // feature the sky has scored is a feature you get your piece out of, whether
  // or not it ever finishes; that is the only brake on a mode where a figure
  // put down early would otherwise collect from every sphere for good.
  {
    const h = fresh(41);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');                      // a city facing north, open
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.players[0].meeples = 4;
    h.m.fire('blue');
    h.m.sweep();
    if (h.players[0].score !== 1) {
      return fail('blue pays 1 a tile for an unfinished city', `paid ${h.players[0].score}`);
    }
    if (b.get(0, 0).meeple) return fail('scoring a city empties it, finished or not', 'the follower stayed');
    if (h.players[0].meeples !== 5) {
      return fail('the returned follower reaches the supply', `${h.players[0].meeples} in hand`);
    }
  }

  // …and a city you were HOLDING, finished, that the wind blows open again
  // costs its owner a point a tile.
  {
    const h = fresh(42);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');                      // city north…
    lay(b, 0, -1, 'Ca');                      // …carried on north, two tiles
    lay(b, 0, -2, 'Kab');                     // …and an Abbazia capping it shut
    b.addMeeple(0, 0, 0, 1);
    b.rebuild();
    h.m.settle(0);
    h.players[1].score = 0;
    b.shift({ x: 0, y: -2 }, { x: 4, y: -4 });   // the cap blows away
    b.rebuild();
    h.m.reopen();
    if (h.players[1].score !== -2) {
      return fail('a held city blown open costs a point a tile',
        `it cost ${-h.players[1].score} for two tiles`);
    }
  }

  // A temple pays NOTHING for a tile arriving beside it. It used to take an
  // offering per arrival, which was the one income in the mode that came in
  // without anything closing; red is now its only source.
  {
    const h = fresh(30);
    const b = h.board;
    lay(b, 0, 0, 'Kt');
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.afterPlace(lay(b, 1, 0, 'Kz'));       // a tile laid in the parish
    h.m.weather([{ dir: 3, from: { x: 4, y: 0 } }], 1);   // …and one blown through it
    if (h.players[0].score !== 0) {
      return fail('a temple takes no offering for an arriving tile', `paid ${h.players[0].score}`);
    }
  }

  // RED — the temples, a point for every tile standing around one.
  {
    const h = fresh(31);
    const b = h.board;
    lay(b, 0, 0, 'Kt');
    for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [1, 1]]) lay(b, x, y, 'Kz');
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.fire('red');
    h.m.sweep();
    if (h.players[0].score !== 4) {
      return fail('red pays a point per tile around a temple', `paid ${h.players[0].score} for four`);
    }
  }

  // YELLOW — the roads: a point a tile, plus what each city the road reaches
  // is worth, whoever owns that city.
  {
    const h = fresh(32);
    const b = h.board;
    lay(b, 0, 0, 'D');                        // city north, road east-west
    lay(b, -1, 0, 'Rb', 1);                   // a road stub facing east
    lay(b, 1, 0, 'Rb', 3);                    // …and one facing west
    const road = TILES.D.feats.findIndex((f) => f.type === 'road');
    b.addMeeple(0, 0, road, 0);               // roads are claimed again
    b.addMeeple(0, -0, 0, 1);                 // …and seat 1 holds the city
    b.rebuild();
    b.addMeeple(0, 0, road, 0);
    b.rebuild();
    h.m.fire('yellow');
    h.m.sweep();
    // Three tiles at 1, plus 1 for the unfinished city it runs into.
    if (h.players[0].score !== 4) {
      return fail('yellow pays a road 1 a tile plus its cities', `paid ${h.players[0].score}, expected 4`);
    }
    if (h.players[1].score !== 0) {
      return fail('a road pays its own holder, not the city\'s', `the city holder got ${h.players[1].score}`);
    }
  }

  // GREEN — the farms, a point for every TWO tiles of field.
  {
    const h = fresh(33);
    const b = h.board;
    for (const [x, y] of [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]) lay(b, x, y, 'Kz');
    const field = TILES.Kz.feats.findIndex((f) => f.type === 'field');
    b.addMeeple(0, 0, field, 0);
    b.rebuild();
    h.m.fire('green');
    h.m.sweep();
    if (h.players[0].score !== 2) {
      return fail('green pays a point per two tiles of field', `paid ${h.players[0].score} for five tiles`);
    }
  }

  // A sphere fires BOTH its halves, and any half fits any other. Two yellows
  // score the roads twice over; a yellow against a red scores the roads and the
  // temples once each. That is what makes the pairing a decision.
  {
    const build = (b) => {
      lay(b, 0, 0, 'Kt');                     // a temple, with a parish round it
      for (const [x, y] of [[1, 0], [-1, 0], [0, 1], [1, 1]]) lay(b, x, y, 'Kz');
      b.addMeeple(0, 0, 0, 0);                // a keeper for red to pay…
      b.rebuild();
      b.addMeeple(1, 0, 0, 0);                // …and a farmer for green
      b.rebuild();
    };
    // A sphere hung north of the temple, so the two halves meet on the seam
    // between them: north face against south face.
    const sphere = (h, a, bb) => {
      build(h.board);
      lay(h.board, 0, -1, a, 0);              // sfera facing north…
      lay(h.board, 0, -2, bb, 2);             // …meeting one facing south
      h.board.rebuild();
      h.m.joinSferas();
    };
    const twice = fresh(35);
    sphere(twice, 'Kro', 'Kro');              // red twice over
    const parish = twice.board.surroundCount(0, 0);
    const mixed = fresh(36);
    sphere(mixed, 'Kro', 'Kso');              // red once, green once
    if (twice.players[0].score !== parish * 2) {
      return fail('a matched sphere fires its colour twice',
        `paid ${twice.players[0].score}, expected ${parish} around the temple, twice`);
    }
    if (mixed.players[0].score <= parish || mixed.players[0].score >= parish * 2) {
      return fail('a mixed sphere fires one of each',
        `paid ${mixed.players[0].score}, expected ${parish} of red plus some green`);
    }
    // …and it only ever fires once.
    const was = twice.players[0].score;
    twice.m.joinSferas();
    if (twice.players[0].score !== was) {
      return fail('a sphere fires once', `paid ${twice.players[0].score - was} again`);
    }
  }

  // Any half fits any other. Colour is what a half DOES, not what it will meet.
  {
    const h = fresh(24);
    const b = h.board;
    lay(b, 0, 0, 'Kso', 2);                   // green, facing south
    if (!b.canPlace(0, 1, TILES.Kyo, 0, {})) {
      return fail('a green sfera meets a yellow one', 'the seam was refused');
    }
    if (!b.canPlace(0, 1, TILES.Kso, 0, {})) {
      return fail('a green sfera meets a green one', 'the seam was refused');
    }
  }

  // The end of the season fires every colour once, and nothing else. Unpaired
  // halves used to fire again here, which made a sfera you could not place
  // worth keeping — a consolation prize for a whole colour's worth of decision.
  {
    const h = fresh(37);
    const b = h.board;
    lay(b, 0, 0, 'Kt');                       // a temple, one tile beside it
    lay(b, 1, 0, 'Kz');
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.lastRound();
    const once = h.players[0].score;
    if (once < 1) return fail('the endgame scores everything one last time', 'it paid nothing');

    const spare = fresh(38);
    const sb = spare.board;
    lay(sb, 0, 0, 'Kt');
    lay(sb, 1, 0, 'Kro');                     // an unpaired RED half beside it
    sb.addMeeple(0, 0, 0, 0);
    sb.rebuild();
    spare.m.lastRound();
    if (spare.players[0].score !== once) {
      return fail('an unpaired half buys nothing at the end',
        `it paid ${spare.players[0].score} against ${once} without one`);
    }
  }

  // A ROAD BRIDGES a one-square gap for scoring, and a follower may walk
  // across one. The gap is not ground: the wind neither notices it nor stops
  // at it, and a tile can be blown straight through where the bridge was.
  {
    const h = fresh(43);
    const b = h.board;
    lay(b, 0, 0, 'U');
    lay(b, 0, -2, 'U');
    // A spine of country round the gap, so both ends of the bridge are on the
    // one mainland. Every fragment is an island now, and an island pays double
    // — which would make this a test of the island rate rather than the bridge.
    lay(b, 1, 0, 'B'); lay(b, 1, -1, 'B'); lay(b, 1, -2, 'B');
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    const road = b.featureOf(0, 0, 0);
    if (road.tiles.size !== 2) return fail('a bridged road scores as one road', `${road.tiles.size} tiles`);
    h.m.fire('yellow');
    h.m.sweep();
    if (h.players[0].score !== 2) {
      return fail('yellow pays a bridged road for both halves', `paid ${h.players[0].score}`);
    }
  }

  // …and a windmill on a finished ROAD pays its holder the same way.
  {
    const h = fresh(48);
    const b = h.board;
    lay(b, 0, 0, 'Ktr');                      // a turbine on a road, north–south
    lay(b, 0, -1, 'Kab');                     // capped both ends by Abbazias
    lay(b, 0, 1, 'Kab');
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.settle(1);
    if (h.players[0].score !== 2) {
      return fail('a windmill on a finished road pays its holder', `paid ${h.players[0].score}`);
    }
  }

  // A TURBINE ON A ROAD pays the road's holder, exactly as one in a city pays
  // the city's.
  {
    const h = fresh(44);
    const b = h.board;
    const mill = lay(b, 0, 0, 'Ktr');          // a turbine on a road
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.payTurbines([mill]);
    if (h.players[0].score !== 2) {
      return fail('a road turbine pays 2 to the road\'s holder', `paid ${h.players[0].score}`);
    }
  }

  // You may not double up on a feature you already hold, and a field with a
  // rival's farmer on it is closed to you outright.
  {
    const h = fresh(45);
    const b = h.board;
    lay(b, 0, 0, 'Kz');
    lay(b, 1, 0, 'Kz');
    const field = TILES.Kz.feats.findIndex((f) => f.type === 'field');
    b.addMeeple(0, 0, field, 0);
    b.rebuild();
    h.current = 0;
    if (h.m.claimAllowed({ x: 1, y: 0, i: field, f: { type: 'field' } })) {
      return fail('you may not put a second follower on your own feature', 'it was offered');
    }
    h.current = 1;
    if (h.m.claimAllowed({ x: 1, y: 0, i: field, f: { type: 'field' } })) {
      return fail('a field with a rival farmer is closed to you', 'it was offered');
    }
  }

  // An island you are already standing on is one you may build onto — being
  // blown out there is meant to be an opportunity, not a sentence.
  {
    const h = fresh(46);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');
    lay(b, 5, 5, 'Kz');
    lay(b, 5, 6, 'Kz');
    b.rebuild();
    if (h.m.placeOpts().onto.has('5,5')) {
      return fail('an empty island is out of reach', 'it was offered');
    }
    b.get(5, 5).meeple = { player: 0, feat: null, big: false };
    b.rebuild();
    if (!h.m.placeOpts().onto.has('5,5')) {
      return fail('an island you stand on is buildable', 'it was refused');
    }
  }

  // A follower LYING FLAT keeps its city at the lower rate and never comes
  // home — which is the trade, because a standing one in a finished city does.
  {
    const h = fresh(47);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');
    lay(b, 0, -1, 'E', 2);                    // capped, so the city is finished
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.phase = 'meeple';
    h.current = 0;
    if (!h.m.canLieDown()) return fail('a follower in a city may lie flat', 'it was not offered');
    h.m.beginFlat();
    h.m.flatAt(0, 0);
    h.m.fire('blue');
    h.m.sweep();
    if (h.players[0].score !== 2) {
      return fail('a flat follower holds its city at 1 a tile', `paid ${h.players[0].score} for two tiles`);
    }
    if (!b.get(0, 0).meeple) return fail('a flat follower stays put', 'it went home');
  }

  // THE WALK. A follower whose feature just finished may go out along a road
  // instead of home — as far as the road runs, and take up what it finds. It
  // may not turn round and step back into the thing it just left.
  {
    const h = fresh(49);
    const b = h.board;
    lay(b, 0, 0, 'Kzt');                      // city south, road east–west
    lay(b, 0, 1, 'Kab');                      // capped, so the city is finished
    lay(b, 1, 0, 'Kta', 1);                   // a temple down the road, unclaimed
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.current = 0;
    const had = h.players[0].meeples;
    h.m.fire('blue');
    h.m.sweep();
    if (b.get(0, 0).meeple) return fail('a finished city sends its follower off', 'it stayed');
    if (h.players[0].meeples !== had + 1) {
      return fail('the walker is back in the supply first', `${h.players[0].meeples} of ${had + 1}`);
    }
    const spots = h.m.strollTargets({ x: 0, y: 0, i: 0 });
    if (spots.some((o) => o.x === 0 && o.y === 0)) {
      return fail('a walk may not turn back into the city it left', 'it was offered');
    }
    if (!spots.some((o) => o.x === 1 && o.y === 0 && o.f.type === 'temple')) {
      return fail('a walk reaches the temple down the road',
        spots.map((o) => `${o.x},${o.y}:${o.f.type}`).join(' ') || 'nowhere');
    }
    if (!h.m.beginStroll()) return fail('the walk is offered', 'it was not');
    h.m.strollTo(1, 0);
    if (!b.get(1, 0).meeple) return fail('the follower walks on and takes the temple', 'it did not');
    if (h.players[0].meeples !== had) {
      return fail('walking spends the follower it just got back', `${h.players[0].meeples}`);
    }
  }

  // A road with somebody ELSE standing on it is a road you may not walk down.
  {
    const h = fresh(50);
    const b = h.board;
    lay(b, 0, 0, 'Kzt');
    lay(b, 0, 1, 'Kab');
    lay(b, 1, 0, 'Kta', 1);
    b.addMeeple(0, 0, 0, 0);
    b.addMeeple(1, 0, 1, 1);                  // a rival on the road itself
    b.rebuild();
    h.current = 0;
    if (h.m.strollTargets({ x: 0, y: 0, i: 0 }).length) {
      return fail('a road held by a rival is closed to the walk', 'it was offered');
    }
  }

  // The flying machine picks a follower back up. It is the only thing in the
  // mode that takes one off the board on purpose.
  {
    const h = fresh(39);
    const b = h.board;
    const flier = lay(b, 0, 0, 'Kfl');        // pointing north
    lay(b, 0, -1, 'Kt');                      // a temple, with our follower in it
    lay(b, 0, -2, 'Kt');                      // …and somewhere further along
    b.addMeeple(0, -1, 0, 0);
    b.rebuild();
    h.m.flight = h.m.flightPath(flier);
    h.players[0].meeples = 5;
    const lifts = h.m.flightLifts();
    if (!lifts.some((o) => o.x === 0 && o.y === -1)) {
      return fail('the flight offers your own followers to lift', JSON.stringify(lifts));
    }
    h.phase = 'meeple';
    h.m.beginLift();
    h.m.liftAt(0, -1);
    if (b.get(0, -1).meeple) return fail('a lifted follower comes off the board', 'it is still there');
    if (h.players[0].meeples !== 6) {
      return fail('a lifted follower goes back to the supply', `${h.players[0].meeples} in hand`);
    }
    // …and it may be set down further along the lane, but never back before it.
    const on = h.m.flightTargets();
    if (on.some((o) => o.y >= -1)) {
      return fail('a lifted follower only goes further along the flight', JSON.stringify(on));
    }
    if (!on.some((o) => o.x === 0 && o.y === -2)) {
      return fail('a lifted follower may be set down further along', JSON.stringify(on));
    }
  }

  // Everything out on an island is worth exactly DOUBLE.
  {
    const h = fresh(14);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');                      // the mainland, far away
    lay(b, 5, 5, 'Ktb');                      // a two-tile city, adrift
    lay(b, 5, 4, 'E', 2);
    b.addMeeple(5, 5, 0, 0);
    b.rebuild();
    h.m.settle(1);                            // closes it — pays the windmill only
    h.players[0].score = 0;
    h.players[1].score = 0;
    h.m.fire('blue');
    h.m.sweep();
    if (h.players[0].score !== 8) {
      return fail('a finished city on an island pays 4 a tile', `paid ${h.players[0].score} for two tiles`);
    }
  }

  // The whale. Nothing under it moves, and nothing downwind of it moves either.
  {
    const h = fresh(15);
    const b = h.board;
    lay(b, 0, 0, 'Kz');                       // pointing north
    lay(b, 0, -1, 'U');
    lay(b, 0, -2, 'U');
    b.get(0, -1).balena = true;
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!b.get(0, -1)) return fail('the whale cannot be blown', 'its tile moved');
    if (!b.get(0, -2)) return fail('the whale shelters its lee', 'the lee blew away');
    // …and it swims three squares, onto tiles, and nowhere further.
    h.m.balena = { x: 0, y: 0 };
    const reach = h.m.balenaTargets();
    if (!reach.some((t) => t.x === 0 && t.y === -2)) {
      return fail('the whale swims three squares', 'it could not reach two away');
    }
    if (reach.some((t) => t.x === 0 && t.y === 0)) {
      return fail('the whale has to actually move', 'it offered its own square');
    }
  }

  // The Palazzo goes with the wind, and the islands go with the Palazzo.
  {
    const h = fresh(16);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');
    lay(b, 4, 0, 'Kz');
    lay(b, 4, 1, 'Kz');
    b.rebuild();
    h.m.driftIslands(1);                      // east
    if (b.get(4, 0) || b.get(4, 1)) return fail('a towed island leaves where it was', 'a tile stayed behind');
    if (!b.get(5, 0) || !b.get(5, 1)) return fail('the whole island is towed at once', 'it came apart');
    if (!b.get(0, 0)) return fail('the mainland is not towed with the islands', 'the seat moved too');
  }

  // A flying machine crosses open sky. Reaching an island nobody has built a
  // road to is most of what the machine is for, so a gap in the country has to
  // be something the flight goes over rather than something that stops it.
  {
    const h = fresh(8);
    const b = h.board;
    const flier = lay(b, 0, 0, 'Kfl');                            // pointing north
    lay(b, 0, -5, 'E');                                           // an island, five clear
    b.rebuild();
    const path = h.m.flightPath(flier);
    if (!path || !path.some((c) => c.x === 0 && c.y === -5)) {
      return fail('a flight crosses open sky to a far island', `reached ${path ? path.length : 0} tiles`);
    }
  }

  // Ten points, at the end, to whoever is standing on the most islands — one
  // follower on each of two beats two followers parked on one.
  {
    const h = fresh(17);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');
    for (const [x, y] of [[5, 0], [5, 1], [9, 0], [9, 1]]) lay(b, x, y, 'Kz');
    b.rebuild();
    b.get(5, 0).meeple = { player: 0, feat: null, big: false };
    b.get(9, 0).meeple = { player: 0, feat: null, big: false };
    b.get(9, 1).meeple = { player: 1, feat: null, big: false };
    h.m.finish();
    if (h.players[0].score !== 10) {
      return fail('the archipelago pays 10 for the most islands', `paid ${h.players[0].score}`);
    }
    if (h.players[1].score !== 0) {
      return fail('the archipelago pays only the most islands', `also paid ${h.players[1].score}`);
    }
  }

  console.log('  ✓ mainland and islands, the four sfera passes, matched and mixed spheres,'
    + ' windmills, island rates, the last round, the flying machine\'s lift, the Balena,'
    + ' towed islands, long flights, the archipelago');
}

// --- runs -------------------------------------------------------------------

function runMode(spec, games, extraOpts = {}, label = '') {
  const summaries = [];
  for (let seed = 1; seed <= games; seed++) {
    try {
      summaries.push(playOut({
        mode: spec.id, seed,
        players: spec.solo ? 1 : (spec.maxPlayers === 2 ? 2 : 2),
        ...extraOpts,
      }));
    } catch (err) {
      fail(`${spec.id}${label} seed ${seed}`, err);
      return null;
    }
  }
  const scores = summaries.flatMap((s) => s.scores);
  const turns = summaries.map((s) => s.turns);
  const tiles = summaries.map((s) => s.tiles);
  const stuck = summaries.reduce((n, s) => n + (s.stuck || 0), 0);
  console.log(
    `  ✓ ${(spec.id + label).padEnd(22)} ${String(games).padStart(3)} games · ` +
    `${avg(turns).toFixed(0)} turns · ${avg(tiles).toFixed(0)} tiles · ` +
    `score ${Math.min(...scores)}–${Math.max(...scores)} (mean ${avg(scores).toFixed(1)})` +
    (stuck ? ` · ${stuck} position(s) with no move` : ''));
  return summaries;
}

// --- the computer player ----------------------------------------------------

/**
 * Two things worth knowing about a bot, and they're different questions.
 *
 * The first is whether it can play at all — every mode, every seat, to the
 * end, without throwing or running out of ideas. That's the same guarantee the
 * random player gives, and it's the one that keeps the UI from hanging.
 *
 * The second is whether it's any good, which only means anything against
 * something. Random legal play is a low bar, but it is a real one: a bot that
 * can't clear it is broken rather than gentle.
 */
/**
 * The field graph, which is the one piece of connectivity that isn't edge-based
 * and so gets none of the coverage the rest of the board does. Every case here
 * is a shape whose answer can be read straight off the printed tile, including
 * the two that a naive implementation gets wrong: a road running out to a tile
 * edge splits the field either side of it without changing the edge letter, and
 * a completed two-tile city keeps the fields on its two flanks apart.
 */
/**
 * The special followers, and the two rules that ride on them.
 *
 * Each is checked by playing a whole game that prefers that piece and then
 * asking the BOARD what happened, rather than reading the log — the log is a
 * fixed-size window and a piece that goes out early scrolls off it.
 */
/**
 * The rules that hang off a tile symbol: a garden, a vineyard, a portal, a
 * princess, a festival. Each is checked on a board built by hand, because the
 * tile that carries the symbol has to meet a specific situation and waiting for
 * a shuffle to produce one is not a test.
 */
/**
 * The symbol batch: mage & witch, gold, cults, wind roses, tunnels, plague,
 * sieges and buildings — checked on hand-built boards where the arithmetic
 * can be read straight off the printed rule.
 */
/** The score-side batch: robbers, messages, gifts, revolts, signposts, fruit. */
/** Hills, sheep, the barn, the acrobats and the baths. */
/** The dragon, the fairy, the tower, the ferries and the far monasteries. */
/** The big top, the teacher and the wonders. */
/**
 * The bridge: an elevated road appended to a living tile. The properties that
 * matter are exactly the ones the derived-type trick was chosen for — indexes
 * hold still, the field underneath is never divided, and a rebuild replays it.
 */
function checkBridges() {
  console.log('\nbridges');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  const g = new Game({ players: 2, seed: 1, options: { bridge: true } });
  g.board.place(20, 20, TILES.U, 1);           // road E–W
  g.board.place(21, 20, TILES.B, 0);           // a monastery in the way
  g.board.place(22, 20, TILES.U, 1);           // road E–W, stranded
  const fieldsBefore = allFields(g.board).length;
  ok('two roads stranded by a field tile',
    g.board.featureOf(20, 20, 0) !== g.board.featureOf(22, 20, 0));

  g.lastPlaced = { x: 21, y: 20, type: TILES.B };
  g.phase = 'meeple'; g.current = 0;
  ok('the engine offers the joining axis first',
    g.bridgeSpots()[0]?.joins === 2);
  g.buildBridge();
  ok('the bridge makes them one road',
    g.board.featureOf(20, 20, 0) === g.board.featureOf(22, 20, 0),
    `${g.board.featureOf(20, 20, 0).tiles.size} tiles`);
  ok('…without dividing the field beneath it',
    allFields(g.board).length === fieldsBefore);
  ok('…and without touching the monastery',
    g.board.featureOf(21, 20, 0)?.type === 'monastery');
  g.board.rebuild();
  ok('…and it survives a rebuild',
    g.board.featureOf(20, 20, 0) === g.board.featureOf(22, 20, 0));

  // A bridge never stands on a wall: the rotated city edge refuses its axis.
  const h = new Game({ players: 2, seed: 1, options: { bridge: true } });
  h.board.place(30, 30, TILES.E, 1);           // city facing world east
  h.lastPlaced = { x: 30, y: 30, type: TILES.E };
  h.phase = 'meeple'; h.current = 0;
  const axes = h.bridgeSpots().filter((o) => o.cell.x === 30 && o.cell.y === 30);
  ok('a wall refuses the bridge, rotation and all',
    axes.length === 1 && axes[0].axis.join() === '0,2');
}

function checkShowBatch() {
  console.log('\nthe travelling show');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // the circus pays the old ground when it moves on
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'bigtopg'], options: { circus: true } });
    g.board.place(20, 20, TILES.Bga, 0);
    g.moveBigTop(g.board.get(20, 20));
    g.board.place(21, 20, TILES.E, 0);
    g.board.addMeeple(21, 20, 0, 1);
    g.board.place(30, 30, TILES.Bga, 0);
    const before = g.players[1].score;
    g.moveBigTop(g.board.get(30, 30));
    ok('the circus pays 2 a head as it moves on', g.players[1].score === before + 2);
  }

  // the teacher follows the school road's closer
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'schools'], options: { school: true } });
    g.board.place(20, 20, TILES.Sca, 0);
    g.board.place(19, 20, TILES.Rb, 1);
    g.board.place(21, 20, TILES.Rb, 3);
    g.board.addMeeple(20, 20, 0, 0);
    g.award(g.board.featureOf(20, 20, 0), false, 0);
    ok('closing the school road takes the teacher', g.teacher === 0);
    g.board.place(30, 30, TILES.E, 0);
    g.board.place(30, 29, TILES.E, 2);
    g.board.addMeeple(30, 30, 0, 0);
    const before = g.players[0].score;
    g.award(g.board.featureOf(30, 30, 0), false, 0);
    ok('…and his lesson pays 2 on the next closure',
      g.players[0].score === before + 6 && g.teacher === null);
  }

  // wonders go to whoever passes the milestone first
  {
    const g = new Game({ players: 2, seed: 1, options: { wonders: true } });
    g.players[0].score = 14;
    g.players[0].score += 2; g.onPaid(0, 2);
    g.players[1].score = 16;
    g.players[1].score += 2; g.onPaid(1, 2);
    ok('the first past 15 takes the wonder', g.players[0].wonders === 1 && g.players[1].wonders === 0);
  }
}

function checkBeastBatch() {
  console.log('\ndragons, towers and ferries');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- the volcano summons, the dragon devours -------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'dragonfire'], options: { dragon: true, volcano: true } });
    g.board.place(20, 20, TILES.E, 0);
    g.board.addMeeple(20, 20, 0, 1);
    g.board.place(21, 20, TILES.Dva, 0);
    g.onMarks(g.board.get(21, 20));
    ok('the volcano brings the dragon down', !!g.dragon
      && g.dragon.x === 21 && g.dragon.y === 20);
    const had = g.players[1].meeples;
    g.rampage();
    ok('…and the rampage eats the neighbour', g.players[1].meeples === had + 1
      && !g.board.get(20, 20).meeple);
  }

  // --- the fairy pays and protects -------------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { fairy: true } });
    g.board.place(30, 30, TILES.E, 0);
    g.board.addMeeple(30, 30, 0, 0);
    g.fairy = { x: 30, y: 30 };
    g.current = 0;
    const before = g.players[0].score;
    g.startTurn();
    ok('the fairy pays 1 at the start of the turn', g.players[0].score === before + 1);
    g.board.place(30, 29, TILES.E, 2);
    g.award(g.board.featureOf(30, 30, 0), false, 0);
    ok('…and 3 more when the guarded feature scores',
      g.players[0].score >= before + 1 + 4 + 3, `score ${g.players[0].score}`);
  }

  // --- the tower captures within its reach -----------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'towersg'], options: { tower: true } });
    g.board.place(40, 40, TILES.Twb, 0);
    g.board.place(41, 40, TILES.E, 0);
    g.board.addMeeple(41, 40, 0, 1);            // an enemy one tile out
    g.current = 0;
    g.phase = 'meeple';
    g.lastPlaced = { x: 40, y: 40, type: TILES.Twb };
    g.buildTower({ x: 40, y: 40 });
    ok('one floor reaches one tile out', g.prisoners.length === 1
      && g.prisoners[0].owner === 1 && !g.board.get(41, 40).meeple);
    g.players[1].score = 5;
    g.current = 1;
    const captorBefore = g.players[0].score;
    g.payRansoms();
    ok('…and the ransom comes due at 3', g.players[1].score === 2
      && g.players[0].score === captorBefore + 3 && g.players[1].meeples === 8);
  }

  // --- the ferry joins two roads across the lake -----------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'ferriesg'], options: { ferries: true } });
    g.board.place(50, 50, TILES.Fya, 0);
    g.placeFerry(g.board.get(50, 50));
    const cell = g.board.get(50, 50);
    ok('the ferry moors between two stubs', Array.isArray(cell.ferry)
      && g.board.featureOf(50, 50, cell.ferry[0]) === g.board.featureOf(50, 50, cell.ferry[1]));
  }

  // --- a regional monastery commands its row and column ----------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'abbeyDE'], options: { monasteries: true } });
    g.board.place(60, 60, TILES.Rmd, 0);
    for (const [x, y] of [[61, 60], [62, 60], [59, 60], [60, 61]]) g.board.place(x, y, TILES.E, 0);
    const d = g.board.featureOf(60, 60, 0);
    const pts = g.valueOf(d, true);
    // Runs: 2 east + 1 west + 1 south = 4, plus itself = 5; the ordinary
    // count is 1 + 4 neighbours = 5 too — equal here, so accept >= 5.
    ok('the unfinished monastery commands its runs', pts >= 5, `${pts}`);
    g.board.place(63, 60, TILES.E, 0);          // stretch the eastern run
    ok('…and a longer run beats the neighbourhood', g.valueOf(d, true) === 6,
      `${g.valueOf(d, true)}`);
  }
}

function checkFlockBatch() {
  console.log('\nhills, flocks and pyramids');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- hills settle the tie --------------------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'hillsg'], options: { hills: true } });
    g.board.place(30, 30, TILES.Hlb, 0);
    g.board.place(30, 29, TILES.E, 2);
    g.board.addMeeple(30, 30, 0, 0);           // on the hill
    g.board.addMeeple(30, 29, 0, 1);           // on the flat
    const d = g.board.featureOf(30, 30, 0);
    ok('the hill takes a tied city outright',
      g.board.majority(d, { hills: true }).join() === '0');
    ok('…and without hills both still score',
      g.board.majority(d).length === 2);
  }

  // --- the shepherd grows and herds ------------------------------------------
  {
    const g = new Game({ players: 2, seed: 3, options: { sheep: true } });
    g.board.place(20, 20, TILES.U, 0);
    g.lastPlaced = { x: 20, y: 20, type: TILES.U };
    g.phase = 'meeple'; g.current = 0;
    g.useFigure('shepherd');
    const o = g.meepleOptions().find((z) => z.f.type === 'field');
    g.placeMeeple(o.i, o);
    g.current = 0;
    const cell = [...g.board.cells.values()].find((c) => c.meeple?.kind === 'shepherd');
    ok('the shepherd arrives with a first token', (cell.flock || []).length === 1);
    g.board.place(21, 20, TILES.U, 0);
    g.lastPlaced = { x: 21, y: 20, type: TILES.U };
    g.phase = 'meeple'; g.sheepActed = false;
    ok('extending the field wakes the shepherd', !!g.shepherdExtended());
    const before = g.players[0].score;
    g.herdFlock();
    ok('herding pays a point a sheep and goes home',
      g.players[0].score > before && g.players[0].shepherds === 1
        && g.flockBag.length === 18);
  }

  // --- the barn settles a farm early -----------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { barn: true } });
    g.board.place(40, 40, TILES.E, 0);
    g.board.place(40, 39, TILES.E, 2);         // one completed city
    g.board.place(41, 40, TILES.U, 1);         // field alongside... U rot1 roads E-W
    const fi = TILES.E.feats.findIndex((f) => f.type === 'field');
    g.board.addMeeple(40, 40, fi, 0);          // a farmer on the city's field
    g.lastPlaced = { x: 41, y: 40, type: TILES.U };
    g.phase = 'meeple'; g.current = 0;
    const spots = g.barnSpots();
    ok('the barn finds the farmed field', spots.length === 1);
    const before = g.players[0].score;
    g.placeBarn();
    ok('…settles it early at 3 per city', g.players[0].score === before + 3,
      `+${g.players[0].score - before}`);
    // The farmer went out via board.addMeeple, which bypasses the supply — so
    // his homecoming shows as one MORE than the untouched seven.
    ok('…and sends the farmer home', g.players[0].meeples === 8);
  }

  // --- the pyramid pays on the third -----------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'circusg'], options: { acrobats: true } });
    g.board.place(50, 50, TILES.Aca, 0);
    const climb = () => {
      g.lastPlaced = { x: 50, y: 50, type: TILES.Aca };
      g.phase = 'meeple';
      g.joinPyramid();
    };
    climb(); climb(); climb();                 // seats alternate as turns pass
    const total = g.players[0].score + g.players[1].score;
    ok('three acrobats up pays 5 apiece', total === 15, `${g.players[0].score}+${g.players[1].score}`);
    ok('…and the troupe steps down',
      (g.board.get(50, 50).pyramid || []).length === 0
        && g.players[0].meeples + g.players[1].meeples === 14);
  }
}

function checkScoreBatch() {
  console.log('\nthe score-side batch');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- a robber skims half of the next payout --------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'robbers'], options: { robbers: true } });
    g.thieves.push({ thief: 1, victim: 0 });
    g.board.place(20, 20, TILES.E, 0);
    g.board.place(20, 19, TILES.E, 2);
    g.board.addMeeple(20, 20, 0, 0);
    g.award(g.board.featureOf(20, 20, 0), false, 0);
    ok('the robber takes half, the victim keeps all',
      g.players[0].score === 4 && g.players[1].score === 2,
      `${g.players[0].score} / ${g.players[1].score}`);
    ok('…and the robber goes home to be posted again', g.players[1].robbers === 2);
  }

  // --- a score landing on a five brings a message ----------------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { messengers: true } });
    g.players[0].score = 1;
    g.board.place(20, 20, TILES.E, 0);
    g.board.place(20, 19, TILES.E, 2);           // a closed city worth 4: 1 + 4 = 5
    g.board.addMeeple(20, 20, 0, 0);
    g.award(g.board.featureOf(20, 20, 0), false, 0);
    ok('landing on a five brings a message', g.players[0].score >= 7,
      `score ${g.players[0].score}`);
  }

  // --- a signpost fattens its road -------------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'signposts'], options: { signposts: true } });
    g.board.place(30, 30, TILES.Sna, 0);
    g.board.place(30, 29, TILES.Rb, 2);          // dead end caps N... Rb is roads group
    const d = g.board.featureOf(30, 30, 0);
    const pts = g.valueOf(d, false);
    ok('a signpost adds 2 to its road', pts === d.tiles.size + 2, `${d.tiles.size} tiles -> ${pts}`);
  }

  // --- a revolt spares the follower with company -----------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'revolts'], options: { peasantRevolts: true } });
    g.board.place(40, 40, TILES.E, 0);           // a lone knight, doomed
    g.board.addMeeple(40, 40, 0, 0);
    const had = g.player.meeples;
    g.revolt({ type: TILES.Rva });
    ok('a lone follower flees the revolt',
      g.player.meeples === had + 1 && !g.board.get(40, 40).meeple);
  }

  // --- fruit ripens four times ------------------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'orchards'], options: { orchards: true } });
    g.board.place(50, 50, TILES.Fta, 0);
    g.board.get(50, 50).fruitLeft = 4;
    const before = g.player.score;
    for (const [x, y] of [[51, 50], [49, 50], [50, 51], [50, 49], [51, 51]]) {
      g.board.place(x, y, TILES.E, 0);
      g.checkFruit(g.board.get(x, y));
    }
    ok('a tree pays exactly four neighbours', g.player.score === before + 4,
      `+${g.player.score - before}`);
  }

  // --- the maps put a wall around the world ----------------------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { maps: true } });
    ok('the map has a border', !g.board.inBounds(6, 0) && g.board.inBounds(5, 0));
  }
}

function checkSymbolBatch() {
  console.log('\nthe symbol batch');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(46)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- the mage adds a point a tile, the witch halves ------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'magic'], options: { mageWitch: true } });
    g.board.place(20, 20, TILES.E, 0);
    g.board.place(20, 19, TILES.E, 2);            // a closed 2-tile city, worth 4
    const d = g.board.featureOf(20, 20, 0);
    const plain = g.valueOf(d, false);
    g.mage = { x: 20, y: 20, feat: 0 };
    const maged = g.valueOf(d, false);
    g.mage = null;
    g.witch = { x: 20, y: 20, feat: 0 };
    const witched = g.valueOf(d, false);
    ok('the mage adds a point per tile', maged === plain + 2, `${plain} -> ${maged}`);
    ok('the witch halves, rounded up', witched === Math.ceil(plain / 2), `${plain} -> ${witched}`);
  }

  // --- a besieged city is worth half -----------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'sieges'], options: { besiegers: true } });
    g.board.place(30, 30, TILES.Sgb, 0);          // besieged corner city (N,W)
    g.board.place(30, 29, TILES.E, 2);            // caps N
    g.board.place(29, 30, TILES.E, 1);            // caps W
    const d = g.board.featureOf(30, 30, 0);
    const pts = g.valueOf(d, false);
    ok('a besieged city pays half', d.open === 0 && pts === Math.ceil((2 * d.tiles.size) / 2),
      `${d.tiles.size} tiles -> ${pts}`);
  }

  // --- the cult race voids the loser -----------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'cults'], options: { cult: true } });
    g.board.place(40, 40, TILES.Cua, 0);          // the shrine
    g.board.place(41, 40, TILES.B, 0);            // the rival monastery next door
    g.board.addMeeple(41, 40, 0, 1);              // with a monk on it
    const shrine = g.board.featureOf(40, 40, 0);
    const had = g.players[1].meeples;
    g.award(shrine, false, 0);                    // the shrine closes first
    const rival = g.board.featureOf(41, 40, 0);
    ok('the losing cloister is voided', rival.scored === true);
    ok('…and its monk goes home with nothing',
      g.players[1].meeples === had + 1 && g.players[1].score === 0);
  }

  // --- gold: dropped on placement, collected on closure, assayed at the end --
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'goldrush'], options: { goldmines: true } });
    g.board.place(50, 50, TILES.E, 0);
    g.board.get(50, 50).gold = 3;
    const d = g.board.featureOf(50, 50, 0);
    g.board.place(50, 49, TILES.E, 2);            // close the city
    g.board.addMeeple(50, 50, 0, 0);
    g.award(g.board.featureOf(50, 50, 0), false, 0);
    ok('closing a feature collects its ingots', g.players[0].ingots === 3);
    g.players[0].ingots = 10;
    const before = g.players[0].score;
    g.scoreIngots();
    ok('ten ingots assay at 4 each', g.players[0].score === before + 40,
      `+${g.players[0].score - before}`);
  }

  // --- a wind rose pays only in its own quadrant ------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'windroses'], options: { windRoses: true } });
    const before = g.player.score;
    g.windRose({ x: 3, y: -2, type: TILES.WrNE });
    const right = g.player.score - before;
    g.windRose({ x: -3, y: 2, type: TILES.WrNE });
    const wrong = g.player.score - before - right;
    ok('a rose pays 3 in its own quadrant', right === 3 && wrong === 0);
  }

  // --- the tunnel joins two distant roads into one ---------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'tunnels'], options: { tunnel: true } });
    g.board.place(60, 60, TILES.Tna, 0);
    g.pairTunnel(g.board.get(60, 60));
    g.board.place(70, 70, TILES.Tna, 0);
    g.pairTunnel(g.board.get(70, 70));
    const a = g.board.featureOf(60, 60, 0);
    const b = g.board.featureOf(70, 70, 0);
    ok('two tunnel mouths are one road', a === b, `${a.tiles.size} tiles, ${a.open} open`);
    g.board.rebuild();
    ok('…and the join survives a rebuild',
      g.board.featureOf(60, 60, 0) === g.board.featureOf(70, 70, 0));
  }

  // --- the plague clears the neighbourhood -----------------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'plagues'], options: { plague: true } });
    g.board.place(80, 80, TILES.E, 0);
    g.board.addMeeple(80, 80, 0, 1);
    g.board.place(81, 80, TILES.Pga, 0);
    const had = g.players[1].meeples;
    g.outbreak(g.board.get(81, 80));
    ok('an outbreak sends the neighbours home',
      g.players[1].meeples === had + 1 && !g.board.get(80, 80).meeple);
  }

  // --- little buildings pay 1 / 2 / 3 ----------------------------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { littleBuildings: true } });
    g.board.place(90, 90, TILES.E, 0);
    g.board.get(90, 90).building = { player: 0, kind: 'tower' };
    g.board.place(91, 90, TILES.E, 0);
    g.board.get(91, 90).building = { player: 0, kind: 'shed' };
    const before = g.players[0].score;
    g.scoreBuildings();
    ok('a tower and a shed are worth 4 together', g.players[0].score === before + 4);
  }
}

function checkMarkRules() {
  console.log('\ntile-symbol rules');
  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(44)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- the garden: the abbot's, and nobody else's --------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'gardens'], options: { abbot: true, garden: true } });
    g.board.place(30, 30, TILES.Ga, 0);
    g.lastPlaced = { x: 30, y: 30, type: TILES.Ga };
    g.phase = 'meeple';
    const plain = g.meepleOptions().filter((o) => o.f.type === 'garden').length;
    g.useFigure('abbot');
    const abbot = g.meepleOptions().filter((o) => o.f.type === 'garden');
    ok('a plain follower cannot take a garden', plain === 0);
    ok('…but the abbot can', abbot.length === 1);
    if (abbot.length) {
      g.placeMeeple(abbot[0].i, abbot[0]);
      ok('…and that is what ends up standing there',
        g.board.get(30, 30).meeple?.kind === 'abbot');
    }
  }

  // --- the vineyard: three more for the monastery next door ----------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'vineyards'], options: { vineyards: true } });
    g.board.place(20, 20, TILES.B, 0);
    const alone = g.valueOf(g.board.featureOf(20, 20, 0), true);
    g.board.place(21, 20, TILES.Va, 0);
    const beside = g.valueOf(g.board.featureOf(20, 20, 0), true);
    // +1 for the neighbouring tile the cloister now counts, +3 for the vineyard.
    ok('a vineyard adds 3 to the monastery beside it', beside === alone + 4,
      `${alone} -> ${beside}`);
  }

  // --- the magic portal: claim anything, anywhere ---------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'dragonset'], options: { portal: true } });
    g.board.place(50, 50, TILES.E, 0);              // an unclaimed city, far away
    g.board.place(0, 5, TILES.Pa, 0);               // the portal tile just laid
    g.lastPlaced = { x: 0, y: 5, type: TILES.Pa };
    g.phase = 'meeple';
    const far = g.meepleOptions().filter((o) => o.portal && o.x === 50 && o.y === 50);
    ok('a portal reaches a feature across the board', far.length > 0,
      `${g.meepleOptions().length} options in all`);
  }

  // --- the princess: a knight is shown the gate ----------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'dragonset'], options: { princess: true } });
    g.board.place(40, 40, TILES.E, 0);
    g.board.addMeeple(40, 40, 0, 1);
    g.board.place(40, 39, TILES.Pc, 2);
    g.lastPlaced = { x: 40, y: 39, type: TILES.Pc };
    g.phase = 'meeple';
    const targets = g.princessTargets();
    ok('the princess finds the knight in her city', targets.length === 1);
    if (targets.length) {
      const had = g.players[1].meeples;
      g.sendKnightHome();
      ok('…sends him home, and he goes back to supply',
        g.players[1].meeples === had + 1 && !g.board.get(40, 40).meeple);
    }
  }

  // --- the festival: take one of your own back -----------------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'festivals'], options: { festival: true } });
    g.board.place(60, 60, TILES.E, 0);
    g.board.addMeeple(60, 60, 0, 0);                 // one of the current player's
    g.board.place(0, 5, TILES.Fa, 0);
    g.lastPlaced = { x: 0, y: 5, type: TILES.Fa };
    g.phase = 'meeple';
    ok('a festival offers to call a follower home', g.canCallHome());
    ok('…and without a festival tile it does not', (() => {
      g.lastPlaced = { x: 60, y: 60, type: TILES.E };
      return !g.canCallHome();
    })());
  }
}

function checkFigures() {
  console.log('\nspecial followers');

  const legal = (g) => {
    const out = []; const saved = g.rot;
    for (const { x, y } of g.board.candidates(g.placeOpts())) {
      for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) out.push({ x, y, rot: r }); }
    }
    g.rot = saved; return out;
  };

  /** Play to the end, letting `claim` decide what to do in the meeple phase. */
  const play = (opts, claim) => {
    const g = new Game(opts);
    const said = [];
    const say = g.say.bind(g);
    g.say = (m) => { said.push(m); say(m); };      // the log truncates; this doesn't
    for (let i = 0; i < 600 && g.phase !== 'over'; i++) {
      if (g.phase === 'place') {
        const s = legal(g)[0]; if (!s) break;
        g.rot = s.rot; g.cellClick(s.x, s.y);
      } else if (g.phase === 'meeple') claim(g);
      else break;
    }
    return { g, said };
  };

  /** Every follower of a given kind currently on the board. */
  const kinds = (g, kind) => [...g.board.cells.values()]
    .filter((c) => c.meeple && c.meeple.kind === kind);

  const ok = (what, cond, detail = '') => {
    if (cond) console.log(`  ✓ ${what.padEnd(40)} ${detail}`);
    else { failures++; console.log(`  ✗ ${what}${detail ? `: ${detail}` : ''}`); }
  };

  // --- the mayor: cities only, worth a follower per coat of arms ------------
  {
    const { g, said } = play({ players: 2, seed: 5, options: { mayor: true } }, (x) => {
      if (!x.useKind && x.figuresAvailable().some((f) => f.id === 'mayor')) x.useFigure('mayor');
      const o = x.meepleOptions();
      if (o.length) return void x.placeMeeple(o[0].i, o[0]);
      x.useKind = null;
      const p = x.meepleOptions();
      if (p.length) x.placeMeeple(p[0].i, p[0]); else x.skipMeeple();
    });
    const sent = said.filter((l) => /mayor/i.test(l)).length;
    ok('the mayor goes out', sent > 0, `${sent} sent`);
    const astray = kinds(g, 'mayor').filter((c) => c.type.feats[c.meeple.feat].type !== 'city');
    ok('…and only ever into a city', astray.length === 0);
  }

  // --- the abbot: monasteries only, and callable home early -----------------
  {
    const { g, said } = play({ players: 2, seed: 5, options: { abbot: true } }, (x) => {
      if (x.canRetireAbbot() && x.turn % 4 === 0) return void x.retireAbbot();
      if (!x.useKind && x.figuresAvailable().some((f) => f.id === 'abbot')) x.useFigure('abbot');
      const o = x.meepleOptions();
      if (o.length) return void x.placeMeeple(o[0].i, o[0]);
      x.useKind = null;
      const p = x.meepleOptions();
      if (p.length) x.placeMeeple(p[0].i, p[0]); else x.skipMeeple();
    });
    ok('the abbot goes out', said.some((l) => /with their abbot/i.test(l)));
    ok('…and is called home to score', said.some((l) => /calls the abbot home/i.test(l)));
    const astray = kinds(g, 'abbot').filter((c) => c.type.feats[c.meeple.feat].type !== 'monastery');
    ok('…and only ever onto a monastery', astray.length === 0);
  }

  // --- the phantom: a second body in the same turn --------------------------
  {
    const { said } = play({ players: 2, seed: 5, options: { phantom: true } }, (x) => {
      const o = x.meepleOptions();
      if (o.length) x.placeMeeple(o[0].i, o[0]); else x.skipMeeple();
    });
    ok('the phantom follows the follower', said.some((l) => /with their phantom/i.test(l)));
  }

  // --- the pig: fattens a farm its owner holds ------------------------------
  {
    const { said } = play({ players: 2, seed: 11, options: { pig: true } }, (x) => {
      if (x.canPlacePig()) return void x.placePig();
      const o = x.meepleOptions();
      const farm = o.find((z) => z.f.type === 'field');
      if (farm) x.placeMeeple(farm.i, farm);
      else if (o.length) x.placeMeeple(o[0].i, o[0]);
      else x.skipMeeple();
    });
    ok('the pig goes out', said.some((l) => /pig/i.test(l)));
    ok('…and raises the farm it stands on', said.some((l) => /\(pig\)/.test(l)));
  }

  // --- a mayor is worth nothing in a city with no pennant -------------------
  {
    const g = new Game({ players: 2, seed: 1, options: { mayor: true } });
    const b = g.board;
    b.place(5, 5, TILES.E, 0);                       // a plain city edge, no shield
    b.addMeeple(5, 5, 0, 0, { kind: 'mayor' });
    const city = b.featureOf(5, 5, 0);
    ok('a mayor holds nothing without a pennant', b.majority(city).length === 0,
      `majority=[${b.majority(city)}]`);
    b.addMeeple(5, 5, 0, 1);                         // a plain follower alongside
    ok('…and a plain follower beats him there', b.majority(city).join() === '1');
  }

  // --- the cathedral: three a tile, and per coat of arms --------------------
  {
    const g = new Game({ players: 2, seed: 1, groups: ['base', 'innscath'], options: { cathedrals: true } });
    const b = g.board;
    b.place(9, 9, TILES.Ie, 0);                      // city across, with a cathedral
    b.place(8, 9, TILES.E, 1);
    b.place(10, 9, TILES.E, 3);                      // caps both ends -> closed
    const city = b.featureOf(9, 9, 0);
    const plain = b.value(city, false);
    const paid = g.valueOf(city, false);
    ok('a cathedral makes its city 3 a tile', city.open === 0 && paid === plain * 1.5,
      `${plain} -> ${paid} over ${city.tiles.size} tiles`);
  }
}

function checkFields() {
  console.log('\nthe field graph');
  const fieldsOn = (place) => {
    const b = new Board({});
    place(b);
    return allFields(b).length;
  };
  const cases = [
    ['a lone crossroads has four corners', () => fieldsOn((b) => b.place(0, 0, TILES.X, 0)), 4],
    ['a straight road splits its tile in two', () => fieldsOn((b) => b.place(0, 0, TILES.U, 0)), 2],
    ['two roads side by side share their middle', () => fieldsOn((b) => {
      b.place(0, 0, TILES.U, 0); b.place(1, 0, TILES.U, 0);
    }), 3],
    ['…and the same when both are turned', () => fieldsOn((b) => {
      b.place(0, 0, TILES.U, 1); b.place(0, 1, TILES.U, 1);
    }), 3],
    ['fields wrap behind a city that faces away', () => fieldsOn((b) => {
      b.place(0, 0, TILES.E, 0); b.place(0, 1, TILES.E, 2);
    }), 1],
    ['a closed city keeps its two flanks apart', () => fieldsOn((b) => {
      b.place(0, 0, TILES.E, 0); b.place(0, -1, TILES.E, 2);
    }), 2],
    ['the city-and-road tile has a strip and a field', () => fieldsOn((b) => b.place(0, 0, TILES.D, 0)), 2],
    ['a three-way junction under a city makes three', () => fieldsOn((b) => b.place(0, 0, TILES.L, 0)), 3],
  ];
  for (const [what, run, want] of cases) {
    let got;
    try { got = run(); } catch (e) { got = e.message; }
    if (got === want) console.log(`  ✓ ${what.padEnd(46)} ${got}`);
    else { failures++; console.log(`  ✗ ${what}: got ${got}, expected ${want}`); }
  }

  // And the rule the whole feature exists for: only COMPLETED cities pay, and
  // they pay per field rather than per city.
  const b = new Board({});
  b.place(0, 0, TILES.E, 0);
  b.place(0, -1, TILES.E, 2);            // the two halves close one city
  const field = allFields(b)[0];
  const fed = citiesFed(b, field);
  if (fed.size === 1) console.log(`  ✓ ${'a closed city feeds the field beside it'.padEnd(46)} 1`);
  else { failures++; console.log(`  ✗ a closed city feeds the field beside it: got ${fed.size}`); }
}

function checkBots(games) {
  console.log('\nthe computer player, driving every seat');
  for (const spec of MODES) runMode(spec, games, { bots: 'all' }, ' +bots');
}

function botVsRandom(rounds) {
  console.log('\nthe computer player against random play (classic, 2p)');
  let bad = 0;
  for (const level of BOT_LEVELS) {
    let wins = 0, draws = 0, margin = 0;
    for (let seed = 1; seed <= rounds; seed++) {
      const seat = seed % 2;                       // alternate who leads
      const r = playOut({
        mode: 'classic', players: 2, seed, bots: [seat], botLevel: level.id,
      });
      const mine = r.scores[seat], theirs = r.scores[1 - seat];
      margin += mine - theirs;
      if (mine > theirs) wins++; else if (mine === theirs) draws++;
    }
    const decided = rounds - draws;
    const rate = decided ? wins / decided : 0;
    const floor = level.id === 'careless' ? 0.4 : 0.65;
    const ok = rate >= floor;
    if (!ok) bad++;
    console.log(
      `  ${ok ? '✓' : '✗'} ${level.name.padEnd(10)} ${wins}/${decided} decided games ` +
      `(${(rate * 100).toFixed(0)}%, mean margin ${(margin / rounds).toFixed(1)})` +
      (ok ? '' : ` — expected at least ${(floor * 100).toFixed(0)}%`));
  }
  if (bad) failures += bad;
}

const avg = (l) => l.reduce((a, b) => a + b, 0) / (l.length || 1);

function main() {
  const [only, count] = process.argv.slice(2);
  const games = Number(count) || 12;

  checkBoard();
  checkPieces();
  checkWind();
  checkGirando();

  console.log('\nmodes');
  for (const spec of MODES) {
    if (only && spec.id !== only) continue;
    runMode(spec, games);
  }

  if (only) {
    if (MODE_OF(only)) runMode(MODE_OF(only), games, { bots: 'all' }, ' +bots');
    else console.log(`  ? no mode called "${only}"`);
  } else {
    checkFields();
    checkFigures();
    checkMarkRules();
    checkSymbolBatch();
    checkScoreBatch();
    checkFlockBatch();
    checkBeastBatch();
    checkShowBatch();
    checkBridges();
    checkBots(Math.max(4, games / 2));
    botVsRandom(Math.max(10, games * 2));
    // Classic is the plain case, Girando moves tiles around under you, and
    // Sprawl places several at once — between them they cover the ways a
    // modifier can go wrong.
    console.log('\nmechanics, against a plain mode, a removing one and a piece one');
    // Only what the engine actually implements: the catalogue also lists rules
    // that are named but not built, and switching one of those on proves
    // nothing except that an inert flag is inert.
    for (const mech of LIVE_MECHANICS) {
      if (mech.id === 'fog') continue;                // purely a render flag
      if (mech.on) continue;                          // base layer, tested below
      for (const host of ['classic', 'girando', 'sprawl']) {
        runMode(MODE_OF(host), Math.max(4, games / 2), { options: { [mech.id]: true } }, `+${mech.id}`);
      }
    }

    // The other direction, which is the new one: pull a base rule OUT. Taking
    // cities away strips most of the pool, so the thing being checked is that
    // the game still deals, places and finishes rather than running dry.
    console.log('\nbase layer, one rule at a time, switched off');
    for (const layer of BASE_LAYER) {
      if (layer.status === 'planned') continue;
      runMode(MODE_OF('classic'), Math.max(4, games / 2),
        { options: { [layer.id]: false } }, `-${layer.id}`);
    }

    console.log('\ntiles per turn');
    for (const n of [2, 3, 5]) {
      runMode(MODE_OF('classic'), Math.max(4, games / 2), { tilesPerTurn: n }, ` x${n}`);
    }
    console.log('\nall mechanics at once');
    const all = Object.fromEntries(LIVE_MECHANICS.map((m) => [m.id, true]));
    runMode(MODE_OF('classic'), Math.max(4, games / 2), { options: all, groups: ALL_GROUPS }, '+everything');
    runMode(MODE_OF('world'), Math.max(4, games / 2), { options: all, groups: ALL_GROUPS }, '+everything');
    // The bot has a verb for several of these — the abbey, the big follower,
    // flipping, lifting — so it meets them all at once too.
    runMode(MODE_OF('classic'), Math.max(4, games / 2),
      { options: all, groups: ALL_GROUPS, bots: 'all' }, '+everything +bots');
  }

  console.log(failures ? `\n${failures} failure(s)` : '\nall good');
  process.exit(failures ? 1 : 0);
}

const MODE_OF = (id) => MODES.find((s) => s.id === id);

main();
