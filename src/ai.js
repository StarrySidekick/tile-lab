// ---------------------------------------------------------------------------
// The computer player.
//
// One class, driven from outside. `bot.act()` takes exactly ONE action for
// whoever's turn it is and returns — main.js calls it on a timer so you can
// watch what it did, and the harness calls it in a tight loop. Nothing in here
// runs a loop of its own, so a bot can never hijack the frame or the game.
//
// It thinks the way the board thinks. Every candidate move is genuinely played
// on the real board, the position that results is scored from the bot's point
// of view, and then the tile is taken straight back off — `Board.remove()`
// rebuilds connectivity from scratch, so a trial leaves nothing behind. That
// one property of the board is the entire reason this file is short, and it is
// why the bot can play modes it has never heard of: it doesn't model the
// rules, it asks the board what happened.
//
// WHAT IT UNDERSTANDS, everywhere, for free:
//   · what a placement closes, and what the closure pays
//   · who holds a feature, and what contesting it is worth
//   · that an open city is a promise rather than points, and that the promise
//     is worth less with every tile that leaves the deck
//   · that leaving a feature one tile from closing hands it to the next player
//
// WHAT IT CANNOT SEE is anything a mode scores on its own books — banners in
// The Marches, landmarks in Expedition, courtyards in Sprawl, height in
// Strata. Those modes hand it the missing points through two hooks on `Mode`,
// `botPlaceBonus` and `botMoveValue`, so the knowledge lives with the rules
// that need it rather than in a switch statement in here.
//
// DELIBERATELY NOT HERE: search past the current move. One ply, evaluated
// honestly, already plays a decent game of Carcassonne, and a deeper search
// would have to model a shuffled deck and every mode's turn structure to be
// worth anything. If this ever grows, it grows into the evaluation, not into
// the depth.
// ---------------------------------------------------------------------------

import { TILES, BACKS, NO_MEEPLE, SIDE_STEP } from './tiles.js';
import { keyOf } from './board.js';
import { rotatePiece } from './pieces.js';
import { liftableCells, citiesTouching } from './mechanics.js';
import { mulberry32 } from './game.js';

/**
 * The three settings, which differ in how much noise they add and whether they
 * bother with the one-off verbs — the abbey, the big follower, flipping a tile
 * over, lifting one back up. Careless isn't a worse evaluator, it's the same
 * one shouted over.
 */
export const BOT_LEVELS = [
  { id: 'careless', name: 'Careless', jitter: 9, claimBias: -1.5, verbs: false },
  { id: 'steady', name: 'Steady', jitter: 2.5, claimBias: 0, verbs: true },
  { id: 'sharp', name: 'Sharp', jitter: 0, claimBias: 1.5, verbs: true },
];

export const BOT_LEVEL_BY_ID = Object.fromEntries(BOT_LEVELS.map((l) => [l.id, l]));

const MAX_TRIALS = 160;      // candidate placements actually evaluated per turn
const CLAIM_BASE = 2.2;      // what an unplaced follower is worth, in points
const FARMER_COST = 1.9;     // …and how much dearer it is when it never comes back
const CLAIM_SCARCITY = 9;    // …divided by how many are left, so the last ones hurt
const GIFT = 0.35;           // penalty for leaving a feature one tile from closing
const CONTACT = 0.15;        // mild preference for a tight board over a sprawling one
const BIG_FOLLOWER = 7;      // expected points a claim needs before the big one goes out
const WALK_ON = 1;           // expected points before a follower walks on rather than home

export class Bot {
  /**
   * @param game   the Game it plays in — a bot is bound to one game and one
   *               seat, so a new game means new bots
   * @param seat   player index it plays
   * @param level  id from BOT_LEVELS
   * @param seed   its own RNG, kept separate from the game's so that thinking
   *               never disturbs a seeded shuffle
   */
  constructor(game, seat, { level = 'steady', seed = 1 } = {}) {
    this.game = game;
    this.seat = seat;
    this.level = BOT_LEVEL_BY_ID[level] || BOT_LEVEL_BY_ID.steady;
    this.rng = mulberry32(((seed >>> 0) ^ ((seat + 1) * 0x9e3779b1)) >>> 0);
    this.stuck = 0;
  }

  get name() { return this.game.players[this.seat]?.name ?? `player ${this.seat}`; }

  /**
   * Take one action. Returns whether the game actually moved.
   *
   * Three tiers, because a bot that hangs the game is worse than a bot that
   * plays badly: the policy below, then a random legal move, then — only if
   * the position genuinely has no action in it — ending cleanly.
   */
  act() {
    const g = this.game;
    if (g.phase === 'over') return false;
    const before = fingerprint(g);

    try {
      this.decide();
    } catch (err) {
      console.error('The computer player threw; falling back to a random move.', err);
    }
    if (fingerprint(g) !== before) return true;

    try {
      this.improvise();
    } catch (err) {
      console.error('…and the fallback threw too.', err);
    }
    if (fingerprint(g) !== before) return true;

    this.stuck++;
    g.say(`${this.name} has no legal move.`);
    if (g.phase === 'move') g.holdPosition();
    else if (g.phase === 'meeple') g.skipMeeple();
    else g.finish();
    return fingerprint(g) !== before;
  }

  decide() {
    const g = this.game;
    // Some modes offer a move that replaces the turn rather than decorating it
    // — Girando's ship is moored instead of laying a tile. Only the mode can
    // price that, so it gets asked before we start pricing squares.
    if ((g.phase === 'market' || g.phase === 'place') && this.level.verbs
      && g.m.botAction?.(this.seat)) return;
    switch (g.phase) {
      case 'market': return this.draft();
      case 'place': return g.m.piece ? this.playPiece() : this.playTile();
      case 'meeple': return this.claim();
      case 'walk': return this.walkOn();
      case 'recall': return this.recall();
      case 'lift': return this.lift();
      case 'move': return this.march();
      // A story ending and a boon are both just "one of the buttons", and
      // neither is a thing to have opinions about — the Chronicle's endings
      // aren't scored at all, and a bot picking the same one every game would
      // make the mode read as broken.
      case 'story': case 'boon': return void this.pickAction();
      case 'interior-place': return this.exploreLay();
      case 'interior-move': return this.exploreStep();
      default: return this.improvise();
    }
  }

  // --- choosing a tile ------------------------------------------------------

  /**
   * The face-up row. Reaching past a tile discards it in most modes, so a
   * later tile has to be better by more than the ones it burns.
   */
  draft() {
    const g = this.game;
    if (!g.market || !g.market.length) return;
    const discards = g.spec.marketDiscards !== false;
    let best = null;
    g.market.forEach((id, i) => {
      const spot = this.survey(TILES[id]);
      if (!spot) return;
      const value = spot.value - (discards ? i * 1.2 : 0);
      if (!best || value > best.value) best = { i, value };
    });
    g.takeFromMarket(best ? best.i : 0);
  }

  // --- placing --------------------------------------------------------------

  playTile() {
    const g = this.game;
    if (!g.tile) return this.improvise();

    // The abbey is nine points for a tile you were going to draw anyway, and
    // you only ever get one, so there is nothing to weigh up.
    if (this.level.verbs && g.canPlayAbbey()) return void g.playAbbey();

    let best = this.survey(g.tile);

    // Two-faced tiles: a road on one side is a city on the other, so the
    // question is only ever "is the other face worth more here".
    if (this.level.verbs && g.canFlip()) {
      const back = BACKS[g.tile.id] ? TILES[BACKS[g.tile.id]] : null;
      const other = back ? this.survey(back) : null;
      if (other && (!best || other.value > best.value + 1.5) && g.flipTile()) return;
    }

    if (!best) {
      // Nothing fits. Picking a tile back up is the one move that changes that.
      if (g.m.beginLift && g.m.allLiftable?.().length && g.m.beginLift()) return;
      if (g.canLiftNow() && g.beginLift()) return;
      return this.modeAction();
    }

    this.turnTo(best.rot);
    if (!g.placeAt(best.x, best.y)) this.improvise();
  }

  /** Sprawl's polyominoes: same search, but the shape rotates rather than a tile. */
  playPiece() {
    const g = this.game;
    let shape = g.m.piece;
    let best = null;

    if (shape.filler) {
      // A filler ignores edge matching, so the only question is which hole.
      const spot = this.survey(g.tile);
      if (spot) { if (!g.placeAt(spot.x, spot.y)) this.improvise(); return; }
      return this.modeAction();
    }

    for (let turns = 0; turns < 4; turns++) {
      for (const at of this.sample(g.board.legalPiecePlacements(shape))) {
        const cells = shape.cells.map((c) => ({
          x: at.x + c.dx, y: at.y + c.dy, type: c.type, rot: c.rot,
        }));
        const value = this.trial(cells) + this.jitter();
        if (!best || value > best.value) best = { x: at.x, y: at.y, turns, value };
      }
      shape = rotatePiece(shape, 1);
    }

    if (!best) return this.modeAction();
    for (let i = 0; i < best.turns; i++) g.rotate(1);
    if (!g.placeAt(best.x, best.y)) this.improvise();
  }

  /**
   * Best square and rotation for a tile type, whether or not it's the one in
   * hand — the market and the flip both need to price a tile the game isn't
   * currently offering, so the tile and the phase are swapped in for the
   * length of the search and put back afterwards.
   */
  survey(type) {
    const g = this.game;
    const held = { tile: g.tile, rot: g.rot, phase: g.phase };
    g.tile = type;
    g.phase = 'place';
    let best = null;
    try {
      for (const spot of this.sample(this.legalSpots())) {
        const value = this.trial([{ x: spot.x, y: spot.y, type, rot: spot.rot }]) + this.jitter();
        if (!best || value > best.value) best = { ...spot, value };
      }
    } finally {
      g.tile = held.tile;
      g.rot = held.rot;
      g.phase = held.phase;
    }
    return best;
  }

  /**
   * Every square and rotation the game would accept right now. Asked through
   * `canPlaceAt` rather than `board.canPlace`, so every rule that narrows
   * placement — covering, the waterline, a mode's own veto — is honoured
   * instead of reimplemented here and drifting out of step.
   */
  legalSpots() {
    const g = this.game;
    if (g.usingAbbey) return g.abbeyGaps().map((s) => ({ ...s, rot: 0 }));
    if (g.riverActive) return g.riverPlacements(g.tile);
    const out = [];
    const held = g.rot;
    for (const { x, y } of g.board.candidates(g.placeOpts())) {
      for (let rot = 0; rot < 4; rot++) {
        g.rot = rot;
        if (g.canPlaceAt(x, y)) out.push({ x, y, rot });
      }
    }
    g.rot = held;
    return out;
  }

  /** Lay these cells, score the position they make, take them off again. */
  trial(cells) {
    const board = this.game.board;
    const laid = [];
    try {
      for (const c of cells) {
        laid.push(board.place(c.x, c.y, c.type, c.rot, {
          over: !!board.get(c.x, c.y), owner: this.seat,
        }));
      }
      return this.scorePosition(laid);
    } finally {
      for (let i = laid.length - 1; i >= 0; i--) board.remove(laid[i].x, laid[i].y);
    }
  }

  /**
   * What the board is worth to us with those cells on it, including the best
   * follower we could put down afterwards. Placement and claim are one
   * decision — a city is only worth building because you can stand in it —
   * so they're priced together and the claim is worked out again for real
   * when the meeple phase actually arrives.
   */
  scorePosition(laid) {
    const g = this.game;
    let best = this.positionValue(null);

    if (g.useMeeples && g.player.meeples > 0) {
      const cost = this.claimCost();
      for (const root of this.claimableRoots(laid)) {
        best = Math.max(best, this.positionValue(root) - cost);
      }
    }

    for (const cell of laid) best += CONTACT * g.board.degree(cell.x, cell.y);
    return best + (g.m.botPlaceBonus?.(laid, this.seat) || 0);
  }

  /** Components on the cells just laid that a follower could still be put on. */
  claimableRoots(laid) {
    const board = this.game.board;
    const out = new Set();
    for (const cell of laid) {
      cell.type.feats.forEach((f, i) => {
        const d = board.featureOf(cell.x, cell.y, i);
        if (!d || d.scored || d.meeples.length) return;
        if (NO_MEEPLE.has(f.type)) return;
        out.add(board.find(d.parts[0]));
      });
    }
    return out;
  }

  // --- the evaluation -------------------------------------------------------

  /**
   * The whole board, in points, from our seat. A DIFFERENCE, not a total: what
   * a feature pays us minus what it pays whoever else is standing in it, which
   * is the only number that decides a game.
   *
   * `virtual` is the component we're considering putting a follower on, priced
   * without actually spending one.
   */
  positionValue(virtual) {
    const g = this.game;
    const board = g.board;
    const left = g.deck.length + (g.market?.length || 0) + (g.river?.deck.length || 0);
    const room = Math.min(1, left / 18);      // no tiles left, no growth and no closures
    let total = 0;

    for (const d of board.allComponents()) {
      if (d.scored) continue;
      const closed = d.open === 0;

      if (!g.useMeeples) {
        // Nobody stands anywhere; a closed feature simply pays whoever closed
        // it, and in this trial that's us.
        if (closed) total += g.valueOf(d, false);
        else if (d.open === 1) total -= GIFT * g.valueOf(d, false);
        continue;
      }

      // Majorities are counted per player, and a big follower counts as two.
      const root = board.find(d.parts[0]);
      const strength = new Map();
      for (const m of d.meeples) {
        strength.set(m.player, (strength.get(m.player) || 0) + (m.big ? 2 : 1));
      }
      let mine = strength.get(this.seat) || 0;
      if (root === virtual) mine += 1;
      let theirs = 0;
      for (const [p, n] of strength) if (p !== this.seat) theirs = Math.max(theirs, n);
      if (!mine && !theirs) continue;

      const expect = this.expectedValue(d, closed, room);
      // Ties pay everyone in full, so a tie is worth nothing in the difference.
      if (mine >= theirs && mine > 0) total += expect;
      if (theirs >= mine && theirs > 0) total -= expect;
    }
    return total;
  }

  /**
   * What a feature will probably be worth by the end, not what it is worth
   * now. Two things move it: the odds it ever closes, and the tiles it will
   * still pick up while it's open.
   */
  expectedValue(d, closed, room) {
    const g = this.game;
    const board = g.board;

    // A monastery is the clearest case of the distinction: an empty one
    // already pays 1 and will pay 9 if the country fills in around it.
    if (d.type === 'monastery') {
      const filled = board.surroundCount(d.at.x, d.at.y);
      if (filled === 8) return board.value(d);
      const odds = room * (0.3 + 0.7 * filled / 8);
      return odds * 9 + (1 - odds) * (1 + filled);
    }

    // A farm pays once, at the very end, for the completed cities standing on
    // it — so what it is worth now is what its cities will have become by then.
    // An open city on the farm is worth something, but only the part of it that
    // is likely to close.
    if (d.type === 'field') {
      let pts = 0;
      for (const city of citiesTouching(board, d)) {
        pts += city.open === 0 ? 1 : room * 0.75 ** city.open;
      }
      return pts * (g.rules?.farmPerCity ?? 3);
    }

    const now = g.valueOf(d, false);
    if (closed) return now;
    const odds = room * 0.75 ** d.open;
    const growth = (d.tiles.size + d.open * room * 0.9) / d.tiles.size;
    return growth * (odds * now + (1 - odds) * g.valueOf(d, true));
  }

  /** What spending a follower costs — more as the supply runs down. */
  claimCost() {
    const held = Math.max(1, this.game.player.meeples);
    return CLAIM_BASE + CLAIM_SCARCITY / held - this.level.claimBias;
  }

  // --- followers ------------------------------------------------------------

  claim() {
    const g = this.game;
    const options = g.meepleOptions();
    if (!options.length) return void g.skipMeeple();

    const base = this.positionValue(null);
    const cost = this.claimCost();
    let best = null;

    // An option knows its own square: most are on the tile just laid, but a
    // mode can offer one anywhere on the board.
    for (const o of options) {
      const d = g.board.featureOf(o.x, o.y, o.i);
      if (!d) continue;
      // A follower laid in a field is gone for the rest of the game, so it has
      // to be worth more than one that will be back in a few turns.
      const spend = cost * (d.type === 'field' ? FARMER_COST : 1);
      const value = this.positionValue(g.board.find(d.parts[0])) - spend + this.jitter() * 0.4;
      if (!best || value > best.value) best = { ...o, value, gain: value + cost - base };
    }

    if (!best || best.value <= base) return void g.skipMeeple();
    if (this.level.verbs && g.has('bigMeeple') && g.player.big > 0 && best.gain > BIG_FOLLOWER) {
      g.toggleBig();
    }
    g.placeMeeple(best.i, best);
  }

  /** A follower whose feature just scored, deciding whether to walk on. */
  walkOn() {
    const g = this.game;
    const w = g.pendingWalk;
    if (!w) return;
    const base = this.positionValue(null);
    let best = null;
    for (const t of w.targets) {
      const d = g.board.featureOf(t.x, t.y, t.feat);
      if (!d) continue;
      const value = this.positionValue(g.board.find(d.parts[0])) - base;
      if (!best || value > best.value) best = { ...t, value };
    }
    if (best && best.value > WALK_ON) g.walkTo(best.x, best.y);
    else g.declineWalk();
  }

  /** Call home the follower doing the least good. */
  recall() {
    const g = this.game;
    const mine = g.myMeeples();
    if (!mine.length) return void g.skipMeeple();
    let worst = null;
    for (const cell of mine) {
      const d = g.board.featureOf(cell.x, cell.y, cell.meeple.feat);
      const value = d ? this.expectedValue(d, d.open === 0, 1) : 0;
      if (!worst || value < worst.value) worst = { cell, value };
    }
    g.recallAt(worst.cell.x, worst.cell.y);
  }

  /**
   * Lifting. The bot only ever gets here because nothing would fit, so the
   * question is which tile costs least to take away: a leaf, ideally, and not
   * one carrying a landmark.
   */
  lift() {
    const g = this.game;
    const spots = g.m.allLiftable ? g.m.allLiftable() : liftableCells(g.board);
    if (!spots.length) return void (g.m.cancelLift ? g.m.cancelLift() : g.cancelLift());
    let best = null;
    for (const s of spots) {
      const cell = g.board.get(s.x, s.y);
      const cost = g.board.degree(s.x, s.y) + (cell?.type.marks.length || 0) * 2;
      if (!best || cost < best.cost) best = { ...s, cost };
    }
    if (!g.cellClick(best.x, best.y)) {
      if (g.m.cancelLift) g.m.cancelLift(); else g.cancelLift();
    }
  }

  // --- walking modes --------------------------------------------------------

  /**
   * Figures. What a destination is worth is almost entirely mode knowledge —
   * ground in The Marches, landmarks in Expedition — so the mode is asked, and
   * all this adds is a nudge toward moving at all and toward tiles with
   * something on them.
   */
  march() {
    const g = this.game;
    const m = g.m;
    const mine = (m.visiblePawns || []).filter((p) => m.select(p));
    if (!mine.length) return void g.holdPosition();

    // A village raises a second pawn, and two pawns is worth a turn standing still.
    if (this.level.verbs && m.canRest && m.rest) {
      const resting = mine.find((p) => m.canRest(p));
      if (resting && mine.length < 2 && g.selectPawn(resting) && g.restPawn()) return;
    }

    let best = null;
    for (const pawn of mine) {
      m.select(pawn);
      for (const dest of m.reachable(pawn).values()) {
        const cell = g.board.get(dest.x, dest.y);
        const value = (m.botMoveValue?.(pawn, dest) || 0)
          + (cell?.type.marks.length ? 1 : 0)
          + this.jitter() * 0.3;
        if (!best || value > best.value) best = { pawn, dest, value };
      }
    }

    if (!best || best.value < 0) return void g.holdPosition();
    if (!g.selectPawn(best.pawn) || !g.movePawn(best.dest.x, best.dest.y)) g.holdPosition();
  }

  // --- interiors ------------------------------------------------------------

  /** Underground: lay the tile next to where you're standing, so it's walkable. */
  exploreLay() {
    const g = this.game;
    const inv = g.interior;
    const spots = inv.board.legalPlacements(inv.tile);
    if (!spots.length) return void g.interiorHold();
    let best = null;
    for (const s of spots) {
      const near = Math.abs(s.x - inv.pos.x) + Math.abs(s.y - inv.pos.y);
      if (!best || near < best.near) best = { ...s, near };
    }
    for (let i = 0; i < best.rot; i++) inv.rotate(1);
    if (!g.interiorPlaceAt(best.x, best.y)) g.interiorHold();
  }

  /**
   * …then walk on to something new, and climb out once there's nothing left.
   *
   * The way out is walked by shortest path rather than by heading roughly
   * toward the mouth: an interior is a corridor system, and "reduce the
   * distance home" will happily pace back and forth in front of a wall.
   */
  exploreStep() {
    const g = this.game;
    const inv = g.interior;
    if (inv.exhausted && g.canLeaveInterior()) return void g.leaveInterior();
    const dests = [...inv.reachable().values()];
    if (!dests.length) return void g.interiorHold();

    const home = inv.exhausted ? distancesFromMouth(inv.board) : null;
    let best = null;
    for (const d of dests) {
      const cell = inv.board.get(d.x, d.y);
      const fresh = cell
        ? cell.type.marks.filter((m, i) => !inv.claimed.has(`${keyOf(d.x, d.y)}#${i}`)).length
        : 0;
      const value = home
        ? -(home.get(keyOf(d.x, d.y)) ?? 99)
        : fresh * 3 + this.jitter() * 0.2;
      if (!best || value > best.value) best = { ...d, value };
    }
    if (!g.interiorMoveTo(best.x, best.y)) g.interiorHold();
  }

  // --- fallbacks ------------------------------------------------------------

  /** The first mode button that isn't greyed out — break a piece, muster, rest. */
  modeAction() {
    const g = this.game;
    for (const a of g.m.actions()) {
      if (a.disabled) continue;
      a.fn(g);
      return;
    }
  }

  /**
   * …or any of them, when the mode is offering a choice rather than a way out.
   *
   * One at random — but not every button on a choice resolves the choice. The
   * Chronicle's oracle re-rolls an omen and leaves you exactly where you were,
   * and a turn has to end somewhere, so if the phase didn't move, take the
   * first thing offered instead. In every mode that asks, that's a real answer.
   */
  pickAction() {
    const g = this.game;
    const live = g.m.actions().filter((a) => !a.disabled);
    if (!live.length) return false;
    const before = `${g.phase}/${g.turn}`;
    live[this.roll(live.length)].fn(g);
    if (`${g.phase}/${g.turn}` !== before) return true;
    const answers = g.m.actions().filter((a) => !a.disabled);
    if (answers.length) answers[0].fn(g);
    return true;
  }

  /**
   * A random legal move. Not the strategy — the safety net under it, for a
   * phase this file has never seen or a position the policy declined to act
   * in. It is exactly what the harness does, which is the point: whatever it
   * can survive, a bot can survive.
   */
  improvise() {
    const g = this.game;
    switch (g.phase) {
      case 'market': return void g.takeFromMarket(this.roll(g.market.length));
      case 'place': {
        const spots = g.m.piece && !g.m.piece.filler
          ? g.board.legalPiecePlacements(g.m.piece)
          : this.legalSpots();
        if (!spots.length) return this.modeAction();
        const s = spots[this.roll(spots.length)];
        if (s.rot != null) this.turnTo(s.rot);
        g.placeAt(s.x, s.y);
        return;
      }
      case 'meeple': return void g.skipMeeple();
      case 'walk': return void g.declineWalk();
      case 'move': return void g.holdPosition();
      case 'recall': return void g.skipMeeple();
      case 'interior-move': return void g.interiorHold();
      case 'interior-place': return void g.interiorHold();
      default: return this.modeAction();
    }
  }

  // --- small change ---------------------------------------------------------

  turnTo(rot) {
    const g = this.game;
    // A mode that owns rotation (Sprawl turns a whole piece) counts turns;
    // everything else can be set straight to the rotation it wants.
    if (g.m.rotate && !g.usingAbbey && !g.riverActive) {
      for (let i = 0; i < rot; i++) g.rotate(1);
      return;
    }
    for (let guard = 0; g.rot !== rot && guard < 4; guard++) g.rotate(1);
  }

  jitter() { return (this.rng() - 0.5) * 2 * this.level.jitter; }

  roll(n) { return Math.floor(this.rng() * Math.max(1, n)); }

  /** Big boards make big candidate lists; take a random slice and move on. */
  sample(list) {
    if (list.length <= MAX_TRIALS) return list;
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.roll(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out.slice(0, MAX_TRIALS);
  }
}

/** Every interior cell's distance from the mouth at (0, 0), by BFS. */
function distancesFromMouth(board) {
  const dist = new Map([[keyOf(0, 0), 0]]);
  const queue = [{ x: 0, y: 0 }];
  while (queue.length) {
    const cur = queue.shift();
    const d = dist.get(keyOf(cur.x, cur.y)) + 1;
    for (const [dx, dy] of SIDE_STEP) {
      const nx = cur.x + dx, ny = cur.y + dy;
      const k = keyOf(nx, ny);
      if (dist.has(k) || !board.cells.has(k)) continue;
      dist.set(k, d);
      queue.push({ x: nx, y: ny });
    }
  }
  return dist;
}

/** Enough of the game to tell "it moved" from "it didn't". */
function fingerprint(g) {
  const inv = g.interior;
  return [
    g.phase, g.turn, g.current, g.board.size, g.deck.length, g.tile?.id, g.rot,
    g.market?.length, g.tilesLeft, g.usingAbbey, g.useBig, g.log.length,
    g.pendingWalk ? 1 : 0, g.player.meeples,
    inv ? `${inv.deck.length}/${inv.board.size}/${inv.pos.x},${inv.pos.y}` : '-',
  ].join('|');
}
