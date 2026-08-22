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

  // remove() must restore exactly the connectivity a fresh board would have.
  const a = new Board();
  a.place(0, 0, TILES.U, 0);
  a.place(0, -1, TILES.U, 0);
  a.place(0, -2, TILES.U, 0);
  const road = a.featureOf(0, 0, 0);
  if (road.tiles.size !== 3) return fail('union of three road tiles', `got ${road.tiles.size}`);
  a.remove(0, -1);
  const split = a.featureOf(0, 0, 0);
  if (split.tiles.size !== 1) return fail('remove() splits a component', `got ${split.tiles.size}`);
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
 */
function checkWind() {
  console.log('the wind');

  const at = (b, x, y) => b.get(x, y);
  const lay = (b, x, y, id, rot = 0) => b.place(x, y, TILES[id], rot, { free: true });

  // A lane slides one square, downwind of the zephyr and nowhere else.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the gust, pointing north
    lay(b, 0, -1, 'U'); lay(b, 0, -2, 'U'); lay(b, 1, -1, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -2) || !at(b, 0, -3)) return fail('a lane shifts one square', 'it did not');
    if (!at(b, 1, -1)) return fail('the wind stays in its lane', 'the next column moved');
    if (!at(b, 0, 0)) return fail('the zephyr stays put', 'it blew itself away');
  }

  // Corners DON'T count: a tile that lands touching the board only at a corner
  // falls, and so does one touching nothing at all. Edge to edge or nothing.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -2, 'U');                     // alone in the lane, two clear
    lay(b, 1, -4, 'U');                     // only a corner to catch it
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (at(b, 0, -3) || r.fell.length !== 1) return fail('a diagonal contact does not hold a tile up', JSON.stringify(r.fell));

    const c = new Board();
    lay(c, 0, 0, 'Kz');
    lay(c, 0, -2, 'U');
    lay(c, 1, -3, 'U'); lay(c, 0, -3, 'U'); // …and now an edge, so it holds
    gust(c, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(c, 0, -3)) return fail('an edge contact does hold a tile up', 'it fell anyway');
  }

  // A crystallised city is solid all the way up: the gust stops at it and
  // everything in its lee is untouched.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const keep = lay(b, 0, -1, 'E');        // a city, finished and turned to stone
    keep.anchored = true; keep.blocks = true;
    lay(b, 0, -2, 'U'); lay(b, 1, -2, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1)) return fail('a crystallised city does not move', 'it blew away');
    if (!at(b, 0, -2)) return fail('a crystallised city shelters its lee', 'the lee moved anyway');
  }

  // …and a crystallised ROAD is only flat ground. It stays put, and the wind
  // goes straight over it and shoves what's beyond.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const paved = lay(b, 0, -1, 'U');
    paved.anchored = true;                  // anchored, but not `blocks`
    lay(b, 0, -2, 'U'); lay(b, 0, -3, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1)) return fail('a crystallised road does not move', 'it moved');
    if (!at(b, 0, -4)) return fail('the wind goes over a crystallised road', 'the far side sat still');
  }

  // A zephyr is never nailed down, whatever the mode has decided about it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const frozen = lay(b, 0, -1, 'Kzr');
    frozen.anchored = true;
    lay(b, 0, -3, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (at(b, 0, -1)) return fail('a crystallised zephyr still blows about', 'it stayed put');
  }

  // A turbine is reported for every gust that runs over it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'Ktb');
    lay(b, 1, -1, 'U');
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.turbines.length !== 1) return fail('a gust turns a turbine', `${r.turbines.length} reported`);
  }

  // Solid ground is a windbreak: nothing shifts into an occupied square.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');
    const crystal = lay(b, 0, -2, 'U');
    crystal.anchored = true;
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1) || !at(b, 0, -2)) return fail('a tile pressed against solid ground stays put', 'something moved');
  }

  // A straight road lies along whatever is blowing through it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz', 1);                  // blowing east
    lay(b, 1, 0, 'U');                      // road N-S at rot 0, side on to it
    lay(b, 2, 1, 'U');                      // something for it to land beside
    gust(b, { dir: 1, from: { x: 0, y: 0 } });
    const after = b.get(2, 0) || b.get(1, 0);
    if (!after || (after.rot & 1) !== 1) return fail('a straight road swings onto the wind', `rot ${after && after.rot}`);
  }

  // A weathervane turns to the wind, which re-cuts what runs through it.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz', 1);                  // pointing east
    lay(b, 1, 0, 'Kw');                     // through-road N-S at rot 0
    lay(b, 2, 1, 'U');                      // something for it to land against
    const before = at(b, 1, 0).rot;
    gust(b, { dir: 1, from: { x: 0, y: 0 } });
    const after = b.get(2, 0) || b.get(1, 0);
    if (!after || (after.rot & 1) !== 1) return fail('a vane swings onto the wind axis', `rot ${before} -> ${after && after.rot}`);
  }

  // A zephyr caught ACROSS the wind fires in its turn.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the one we set off, pointing north
    lay(b, 0, -1, 'Kz', 1);                 // caught by it, pointing east
    lay(b, 1, -2, 'U');
    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length < 2) return fail('a blown zephyr fires in its turn', `${reports.length} gust(s)`);
  }

  // …and so does one caught HEAD ON. Every zephyr the wind reaches fires in
  // its own direction; there is no bracing. What stops a facing pair shoving
  // the same lane apart forever is the once-per-storm rule below, not the
  // gust refusing to wake them.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'Kz', 2);                 // straight back at it, south
    lay(b, 1, -1, 'U');                     // neighbours, so nothing falls out
    lay(b, 1, -2, 'U');
    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length !== 2) return fail('a facing zephyr rebounds the storm', `${reports.length} gust(s)`);
    if (reports[1].dir !== 2) return fail('the rebound goes the facing zephyr\'s way', `dir ${reports[1].dir}`);
  }

  // A zephyr blowing the SAME way is absorbed — and the harder wind that comes
  // of it applies BEYOND it, never to it. A tile is never blown along by its
  // own breath, which is exactly what a second square of travel looked like.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the one we set off, north
    const rider = lay(b, 0, -1, 'Kz');      // another pointing the same way
    lay(b, 0, -2, 'U');                     // …and the tile the boost is for
    lay(b, 1, -2, 'U');                     // somewhere for them both to land beside
    lay(b, 1, -4, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (rider.y !== -2) return fail('an absorbed zephyr moves one square', `it went to y ${rider.y}`);
    if (!b.get(0, -4)) return fail('the wind beyond it blows two', 'the far tile moved one');
  }

  // And no zephyr blows twice in one storm, however the chain comes back round.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'Kz', 1);                 // east
    lay(b, 1, -1, 'Kz', 3);                 // west — pointed straight back at it
    lay(b, 1, -2, 'U');
    const reports = storm(b, { dir: 0, from: { x: 0, y: 0 } });
    if (reports.length > 3) return fail('each zephyr blows once per storm', `${reports.length} gust(s)`);
  }

  // A compass rose opens all four lanes out of one square.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kzq');
    for (const [x, y] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) lay(b, x, y, 'U');
    for (const [x, y] of [[1, -2], [2, 1], [-1, 2], [-2, -1]]) lay(b, x, y, 'U');
    const dirs = [0, 1, 2, 3].map((dir) => ({ dir, from: { x: 0, y: 0 } }));
    storm(b, dirs);
    const out = [[0, -2], [2, 0], [0, 2], [-2, 0]].filter(([x, y]) => at(b, x, y)).length;
    if (out !== 4) return fail('a compass rose blows all four lanes', `${out}/4 moved`);
    if (!at(b, 0, 0)) return fail('the rose stays where it is', 'it blew itself away');
  }

  // Followers ride their own tile: it moves, they move, and neither notices.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');
    b.addMeeple(0, -1, 0, 0);
    lay(b, 0, -2, 'U');
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (b.get(0, -1)) return fail('the road under the follower moves', 'it stayed');
    if (!b.get(0, -2)?.meeple) return fail('a follower travels with its tile', JSON.stringify(r.carried));
    if (r.homed.length) return fail('nobody goes home from a tile that landed', JSON.stringify(r.homed));
  }

  // …and a follower on ground the wind can't move is picked up off it and put
  // down downwind, on whatever it finds there.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const rock = lay(b, 0, -1, 'U');
    rock.anchored = true;
    b.addMeeple(0, -1, 0, 0);
    lay(b, 0, -2, 'U').anchored = true;     // a ledge downwind to be put down on
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (rock.meeple) return fail('a follower is lifted off crystallised ground', 'it stayed put');
    if (!b.get(0, -2)?.meeple || r.carried.length !== 1) {
      return fail('the wind puts it down one square on', JSON.stringify(r.carried));
    }
  }

  // Blown over open sky, it goes back to its owner's hand — the only way off.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const rock = lay(b, 0, -1, 'U');
    rock.anchored = true;
    b.addMeeple(0, -1, 0, 2);
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.homed.length !== 1 || r.homed[0].player !== 2) {
      return fail('a follower blown into open sky comes home', JSON.stringify(r.homed));
    }
  }

  // A temple is blown about like anything else — parish, keeper and all. It
  // used to be rooted and the figure inside it sheltered; now the sky can pick
  // the whole building up and put it somewhere else.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const temple = lay(b, 0, -1, 'Kt');
    b.addMeeple(0, -1, 0, 1);
    lay(b, 0, -2, 'U'); lay(b, 0, -3, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (b.get(0, -1) === temple) return fail('a temple is blown about', 'it stood still');
    if (temple.meeple?.player !== 1) return fail('its keeper rides along with it', JSON.stringify(temple.meeple));
  }

  // Gusts stack: a wind that runs over a zephyr pointing the same way blows a
  // square harder, and no harder than three however many agree.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // the one we set off, north
    lay(b, 0, -1, 'Kz');                    // …and three more, all north
    lay(b, 0, -2, 'Kz'); lay(b, 0, -3, 'Kz'); lay(b, 0, -4, 'Kz');
    const far = lay(b, 0, -5, 'U');
    lay(b, 1, -9, 'U');                     // something to land beside
    const r = gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (r.strength !== 3) return fail('a gust stacks to three and no further', `strength ${r.strength}`);
    if (far.y !== -8) return fail('the far tile travels three squares', `it is at y=${far.y}`);
  }

  // A joined sfera is nailed down: the mode locks the pair, and the wind can't.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    const held = lay(b, 0, -1, 'U');
    held.fixed = true;
    lay(b, 0, -2, 'U'); lay(b, 0, -3, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (b.get(0, -1) !== held) return fail('a locked tile does not move', 'the wind took it');
    if (!b.get(0, -3)) return fail('the wind carries on past a locked tile', 'the far side sat still');
  }

  // Crystallised ground doesn't move and doesn't stop the wind: what's jammed
  // against it stays, and what's beyond it goes anyway.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    lay(b, 0, -1, 'U');                     // will jam against the crystal
    lay(b, 0, -2, 'U').anchored = true;     // the crystal
    lay(b, 0, -3, 'U'); lay(b, 1, -4, 'U'); // beyond it, with a corner to land on
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (!at(b, 0, -1)) return fail('a tile jammed against a crystal stays', 'it moved');
    if (!at(b, 0, -2)) return fail('a crystal does not move', 'it did');
    if (!at(b, 0, -4)) return fail('the wind carries on past a crystal', 'the far side sat still');
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

  // Mismatched seams join nothing — the wind can shove a road into a city.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');
    lay(b, 0, -1, 'U');                     // road N-S
    lay(b, 0, -3, 'E', 2);                  // city facing south, two clear
    lay(b, 1, -2, 'U'); lay(b, 1, -4, 'U'); // edges to land against, both ends
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    const road = b.featureOf(0, -2, 0);
    if (!road || road.type !== 'road') return fail('the shoved road survives as a road', road && road.type);
    if (road.tiles.size !== 1) return fail('a mismatched seam joins nothing', `road spans ${road.tiles.size}`);
  }

  // The whale outranks everything, zephyrs included: a gust stops at it, and
  // the tile under it does not move even when that tile is weather itself.
  {
    const b = new Board();
    lay(b, 0, 0, 'Kz');                     // north
    const whale = lay(b, 0, -1, 'Kz', 1);   // a zephyr of its own, under the whale
    whale.balena = true;
    lay(b, 0, -2, 'U');
    gust(b, { dir: 0, from: { x: 0, y: 0 } });
    if (whale.y !== -1) return fail('the whale pins even a zephyr', `it moved to y ${whale.y}`);
    if (!b.get(0, -2)) return fail('the whale shelters its lee from a zephyr', 'the lee blew away');
  }

  console.log('  ✓ lanes, corners, ramparts, paving, loose zephyrs, turbines, vanes, straight roads,'
    + ' chains, rebounds, absorbed zephyrs, the whale, once-per-storm, the rose, stacking, followers,'
    + ' temples, locks, Abbazias, bad seams');
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
    // A lone tile adrift is not an island — it is a tile adrift.
    lay(b, 9, 9, 'Kz');
    b.rebuild();
    if (h.m.onIsland(b.get(9, 9))) return fail('one tile alone is not an island', 'it counted as one');
    if (!h.m.onIsland(b.get(5, 5))) return fail('two tiles adrift are an island', 'it did not count');
  }

  // A city pays 2 a tile to whoever is STANDING IN IT, the followers stay put,
  // the windmill pays the closer 2 — and blowing the city open again takes the
  // 2 a tile straight back off, while the windmill's 2 stays paid.
  {
    const h = fresh(4);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');                      // a turbine in a city facing north
    lay(b, 0, -1, 'E', 2);                    // …capped from the north
    b.addMeeple(0, 0, 0, 1);                  // seat 1 garrisons it
    b.rebuild();
    h.m.settle(0);                            // seat 0 laid the closing tile
    if (h.players[1].score !== 4) {
      return fail('a city pays 2 a tile to whoever stands in it', `paid ${h.players[1].score} for two tiles`);
    }
    if (h.players[0].score !== 2) {
      return fail('a windmill pays 2 to whoever closes its city', `paid ${h.players[0].score}`);
    }
    if (!b.get(0, 0).meeple) return fail('a follower stays in the city it finished', 'it went home');
    if (b.get(0, 0).anchored) return fail('nothing crystallises any more', 'the tile turned to stone');

    // The wind shoves the cap four squares away — the same tile, somewhere
    // else, which is what a gust actually does to one.
    b.shift({ x: 0, y: -1 }, { x: 4, y: -4 });
    b.rebuild();
    h.m.reopen();
    if (h.players[1].score !== 2) {
      return fail('a city blown open gives back ONE a tile', `left holding ${h.players[1].score} of 4`);
    }
    if (h.players[0].score !== 2) {
      return fail('a windmill\'s 2 survives the city being blown open', `left holding ${h.players[0].score}`);
    }

    // …and shoved back, closing it again brings back that one a tile — not the
    // full rate, because neither of these tiles is new country any more.
    b.shift({ x: 4, y: -4 }, { x: 0, y: -1 });
    b.rebuild();
    h.m.settle(0);
    if (h.players[1].score !== 4) {
      return fail('closing a city again pays one a tile', `holding ${h.players[1].score}, expected 4`);
    }
    // The windmill pays again too — it is a bounty on closing, not on the city.
    if (h.players[0].score !== 4) {
      return fail('a windmill pays every time its city closes', `holding ${h.players[0].score}`);
    }
  }

  // A city that never closed at all pays 1 a tile at the end. One that closed
  // and was blown open pays nothing more: it was paid in full and gave a point
  // a tile back, and that is the whole of its account.
  {
    const h = fresh(18);
    const b = h.board;
    lay(b, 0, 0, 'Ktb');                      // a city facing north
    lay(b, 0, -1, 'Ca');                      // …carried on north, and left open
    b.addMeeple(0, 0, 0, 0);
    b.rebuild();
    h.m.openCities();
    const first = h.players[0].score;
    if (first !== 2) {
      return fail('an unfinished city pays 1 a tile at the end', `paid ${first} for two tiles`);
    }
    // Mark it as having closed once and been blown open; now it pays nothing.
    for (const c of [b.get(0, 0), b.get(0, -1)]) {
      c.cityPaid = { 0: { players: [0], live: false } };
    }
    h.players[0].score = 0;
    h.m.openCities();
    if (h.players[0].score !== 0) {
      return fail('a city that already closed pays nothing at the end', `paid ${h.players[0].score}`);
    }
  }

  // The three sferas, on one board: the field is three tiles, it feeds one
  // finished city, and two temples stand on it. So a green half is worth 3
  // there, a blue one 2 and a red one 4 — and BOTH halves of a sphere fire, so
  // a matched pair doubles one of those and a mixed pair does two of them once
  // each. Any half fits any other, which is what makes that a decision.
  {
    const worth = { green: 3, blue: 2, red: 4 };
    const span = { green: 'Ksx', blue: 'Kbx', red: 'Krx' };
    const half = { green: 'Kso', blue: 'Kbo', red: 'Kro' };
    const pairs = [
      ['green', 'green'], ['blue', 'blue'], ['red', 'red'],   // doubled
      ['green', 'blue'], ['red', 'green'],                    // one of each
    ];
    const before = failures;
    pairs.forEach(([a, b], n) => {
      const want = worth[a] + worth[b];
      const h = fresh(20 + n);
      const bd = h.board;
      lay(bd, 0, 0, span[a]);                 // sfera north, cities east and west
      lay(bd, 0, -1, half[b], 2);             // …meeting a half of the other colour
      lay(bd, 1, 0, 'Kce', 3);                // the city, capped both ways
      lay(bd, -1, 0, 'Kce', 1);
      lay(bd, 0, 1, 'Kt');                    // two temples out on the same field
      lay(bd, 0, 2, 'Kt');
      const field = TILES[span[a]].feats.findIndex((f) => f.type === 'field');
      bd.addMeeple(0, 0, field, 0);
      bd.rebuild();
      h.players[0].meeples = 6;
      h.m.joinSferas();
      if (h.players[0].score !== want) {
        return fail(`a ${a}+${b} sphere fires both its halves`,
          `paid ${h.players[0].score}, expected ${worth[a]} + ${worth[b]}`);
      }
      if (h.players[0].meeples !== 7) {
        return fail('a harvested farmer walks home whatever the colours', `${h.players[0].meeples} in hand`);
      }
    });
    if (failures > before) return;
  }

  // …and any half fits any other. Colour is what the half DOES, not what it
  // will meet: a green ball and a red one make a sphere that is half of each.
  {
    const h = fresh(24);
    const b = h.board;
    lay(b, 0, 0, 'Kso', 2);                   // green, facing south
    if (!b.canPlace(0, 1, TILES.Kro, 0, {})) {
      return fail('a green sfera meets a red one', 'the seam was refused');
    }
    if (!b.canPlace(0, 1, TILES.Kso, 0, {})) {
      return fail('a green sfera meets a green one', 'the seam was refused');
    }
  }

  // The last harvest: a field still being farmed when the wind drops is scored
  // as though a sphere had closed on it, taking its colour from any sfera
  // lying in it and falling back to blue.
  {
    const h = fresh(25);
    const b = h.board;
    lay(b, 0, 0, 'Kro');                      // an unpaired RED half, in the field
    lay(b, 2, 0, 'Kso');                      // …and an unpaired GREEN one
    lay(b, 1, 0, 'Kt');                       // one temple, on the same field
    const field = TILES.Kro.feats.findIndex((f) => f.type === 'field');
    b.addMeeple(0, 0, field, 0);
    b.rebuild();
    h.m.lastHarvest();
    // Red pays 2 for the one temple; green pays 1 for each of the three tiles.
    if (h.players[0].score !== 5) {
      return fail('every unpaired sfera fires at the last harvest',
        `paid ${h.players[0].score}, expected 2 (red, one temple) + 3 (green, three tiles)`);
    }
    // …and a field with no sfera in it is counted BLUE, per finished city.
    const k = fresh(26);
    const kb = k.board;
    lay(kb, 0, 0, 'Ktb');                     // a city facing north…
    lay(kb, 0, -1, 'E', 2);                   // …capped, so it is finished
    const kf = TILES.Ktb.feats.findIndex((f) => f.type === 'field');
    kb.addMeeple(0, 0, kf, 0);
    kb.rebuild();
    k.m.settle(0);                            // close the city so the farm feeds one
    k.players[0].score = 0;
    k.m.lastHarvest();
    if (k.players[0].score !== 2) {
      return fail('a field with no sfera in it is harvested blue',
        `paid ${k.players[0].score}, expected 2 for one finished city`);
    }
  }

  // A road is nobody's to claim, and finishing one pays its finisher 1 a tile
  // — plus 2 to the holder of every city it runs into, whoever that is.
  {
    const h = fresh(12);
    const b = h.board;
    lay(b, 0, 0, 'D');                        // city north, road east-west
    lay(b, -1, 0, 'Rb', 1);                   // a road stub facing east
    lay(b, 1, 0, 'Rb', 3);                    // …and one facing west
    b.addMeeple(0, 0, 0, 1);                  // seat 1 holds the city
    b.rebuild();
    const roadIdx = TILES.D.feats.findIndex((f) => f.type === 'road');
    if (h.m.claimAllowed({ x: 0, y: 0, i: roadIdx, f: { type: 'road' } })) {
      return fail('a road cannot be claimed', 'it was offered');
    }
    h.m.settle(0);
    if (h.players[0].score !== 3) {
      return fail('finishing a road pays 1 a tile', `paid ${h.players[0].score} for three tiles`);
    }
    if (h.players[1].score !== 2) {
      return fail('a road pays 2 to the holder of the city it reaches', `paid ${h.players[1].score}`);
    }
  }

  // A sphere is harvested exactly once, however many times the board is asked.
  {
    const h = fresh(13);
    const b = h.board;
    lay(b, 0, 0, 'Kso');                      // green sfera, facing north
    lay(b, 0, -1, 'Kso', 2);                  // …meeting its other half
    const field = TILES.Kso.feats.findIndex((f) => f.type === 'field');
    b.addMeeple(0, 0, field, 0);
    b.rebuild();
    h.m.joinSferas();
    const once = h.players[0].score;
    if (!once) return fail('a closing sphere harvests its field', 'it paid nothing');
    h.m.joinSferas();
    if (h.players[0].score !== once) {
      return fail('a sphere is harvested once', `paid ${h.players[0].score - once} again`);
    }
  }

  // Everything out on an island is worth half again as much.
  {
    const h = fresh(14);
    const b = h.board;
    lay(b, 0, 0, 'Kpz');                      // the mainland, far away
    lay(b, 5, 5, 'Ktb');                      // a two-tile city, adrift
    lay(b, 5, 4, 'E', 2);
    b.addMeeple(5, 5, 0, 0);
    b.rebuild();
    h.m.settle(1);
    // 2 tiles at the island rate of 3, plus the windmill's flat 2 to the closer.
    if (h.players[0].score !== 6) {
      return fail('a city on an island pays 3 a tile', `paid ${h.players[0].score} for two tiles`);
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

  console.log('  ✓ mainland and islands, city pay/clawback/reclose, unfinished cities, windmills,'
    + ' road tolls, sfera colours matched and mixed, the last harvest, island rates, the Balena,'
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
