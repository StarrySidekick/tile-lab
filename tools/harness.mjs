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

import { Game, MODES, MECHANICS } from '../src/game.js';
import { Bot, BOT_LEVELS } from '../src/ai.js';
import { makePiece, rotatePiece, validatePiece } from '../src/pieces.js';
import { Board } from '../src/board.js';
import { TILES } from '../src/tiles.js';
import { liftableCells } from '../src/mechanics.js';
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
function state(game) {
  return [
    game.phase, game.turn, game.board.size, game.deck.length,
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
    case 'meeple': {
      const opts = game.meepleOptions();
      if (game.canRecall() && rng() < 0.08) return void game.beginRecall();
      if (game.has('bigMeeple') && game.player.big > 0 && rng() < 0.3) game.toggleBig();
      if (opts.length && rng() < 0.7) game.placeMeeple(pick(opts).i);
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

  console.log('\nmodes');
  for (const spec of MODES) {
    if (only && spec.id !== only) continue;
    runMode(spec, games);
  }

  if (only) {
    if (MODE_OF(only)) runMode(MODE_OF(only), games, { bots: 'all' }, ' +bots');
    else console.log(`  ? no mode called "${only}"`);
  } else {
    checkBots(Math.max(4, games / 2));
    botVsRandom(Math.max(10, games * 2));
    // Classic is the plain case, Cirrus removes tiles, and Sprawl places
    // several at once — between them they cover the ways a modifier can go
    // wrong.
    console.log('\nmechanics, against a plain mode, a removing one and a piece one');
    for (const mech of MECHANICS) {
      if (mech.id === 'fog') continue;                // purely a render flag
      for (const host of ['classic', 'cirrus', 'sprawl']) {
        runMode(MODE_OF(host), Math.max(4, games / 2), { options: { [mech.id]: true } }, `+${mech.id}`);
      }
    }

    console.log('\ntiles per turn');
    for (const n of [2, 3, 5]) {
      runMode(MODE_OF('classic'), Math.max(4, games / 2), { tilesPerTurn: n }, ` x${n}`);
    }
    console.log('\nall mechanics at once');
    const all = Object.fromEntries(MECHANICS.map((m) => [m.id, true]));
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
