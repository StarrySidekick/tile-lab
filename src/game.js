// ---------------------------------------------------------------------------
// The host.
//
// `Game` owns the things every mode shares — players, the deck, the board, the
// turn counter, the log, the event stream — and nothing else. Everything that
// makes a mode a *mode* lives in src/modes/<name>.js behind a small set of
// hooks, so adding one is adding one file rather than editing five.
//
// The generic turn is: draw something placeable -> place it -> let the mode
// decide what happens next -> score whatever closed -> next player.
//
// MECHANICS (see mechanics.js) are orthogonal to modes and live here, because
// they apply to all of them: the drafting market, lifting placed tiles,
// building on top of them, and the Carcassonne expansion rules.
//
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import {
  TILES, GROUPS, BACKS, ABBEY_TILE, NO_MEEPLE, MARKS,
  buildDeck, buildRiverDeck, opposite, SIDE_STEP,
  RIVER_MOUTH, RIVER_SPRING,
} from './tiles.js';
import { PLAYER_NAMES } from './theme.js';
import { MODES, MODE_BY_ID } from './modes/index.js';
import { AGENDAS } from './modes/agendas.js';
import {
  MECHANICS, MECHANIC_GROUPS, canLift, liftableCells, coverProblem,
  claimableFeatures, walkTargets, innsAndCathedrals, goodsOn, crownAndRoad,
  WATER, MAX_STACK,
} from './mechanics.js';

export const RULES = {
  meeplesPerPlayer: 7,
  startTile: 'D',
  cityPerTile: 2,
  cityPerShield: 2,
  roadPerTile: 1,
  goodsBonus: 10,
};

export const DEFAULT_GROUPS = Object.fromEntries(MODES.map((m) => [m.id, m.groups]));
export { MODES, GROUPS, MECHANICS, MECHANIC_GROUPS };

const MARKET_SIZE = 4;
const TIDE_PERIOD = 3;          // rounds between waterline steps
const GOODS = ['wine', 'grain', 'cloth'];

export class Game {
  constructor({
    players = 2, seed = null, mode = 'classic', meeples = true,
    groups = null, options = {}, tilesPerTurn = 1,
  } = {}) {
    const spec = MODE_BY_ID[mode] || MODE_BY_ID.classic;
    this.mode = spec.id;
    this.spec = spec;
    this.options = options;
    this.useMeeples = spec.meeples ? meeples : false;
    this.groups = groups && groups.length ? groups : spec.groups;
    if (spec.solo) players = 1;
    else players = Math.max(spec.minPlayers || 1, Math.min(spec.maxPlayers || 5, players));

    // A mode may insist on its own seed — Tesserae is the same puzzle for
    // everyone on a given day, which is the entire point of it.
    if (seed == null && spec.seedFor) seed = spec.seedFor();
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.seed = seed;
    this.board = new Board({ bounds: spec.bounds || null });
    this.players = Array.from({ length: players }, (_, i) => ({
      id: i,
      name: spec.playerName ? spec.playerName(i) : PLAYER_NAMES[i],
      score: 0,
      meeples: RULES.meeplesPerPlayer,
      big: this.has('bigMeeple') ? 1 : 0,
      abbeys: this.has('abbey') ? 1 : 0,
      goods: { wine: 0, grain: 0, cloth: 0 },
    }));

    this.current = 0;
    this.round = 1;
    this.phase = 'place';
    this.tile = null;
    this.rot = 0;
    this.lastPlaced = null;
    this.log = [];
    this.free = false;
    this.forcedNext = null;
    this.listeners = [];
    this.turn = 1;
    this.market = null;
    this.flipped = false;
    this.waterline = null;

    // How many tiles a player lays before the turn passes. Each one is a full
    // place-and-act sequence, so in a walking mode it's N tiles and N moves.
    this.tilesPerTurn = Math.max(1, Math.min(5, tilesPerTurn));
    this.tilesLeft = 0;
    this.useBig = false;
    this.usingAbbey = false;
    this.builderUsed = false;
    this.pendingWalk = null;
    this.crown = { city: null, cityBy: null, road: null, roadBy: null };

    this.m = new spec.Mode(this);
    this.deck = this.m.deck();
    this.river = this.has('river') ? this.startRiver() : null;

    for (const s of this.seeds()) {
      this.board.place(s.x, s.y, TILES[s.id], s.rot || 0, { owner: s.owner ?? null });
    }

    if (this.has('agendas')) this.dealAgendas();
    if (this.has('tide')) this.setWaterline(spec.tideStart ?? 6);

    this.m.setup();
    this.say(this.river ? 'The river rises. Lay it out before anything else.' : (spec.opening || 'Start tile placed.'));
    this.startTurn();
  }

  /** Is a mechanic switched on? A mode may force one on for itself. */
  has(id) { return !!(this.options?.[id] || this.spec?.mechanics?.includes(id)); }

  get player() { return this.players[this.current]; }
  get modeName() { return this.spec.name; }

  /** The sub-map replacing this player's turn, if any. */
  get interior() { return this.m.interior; }
  get caves() { return this.m.caves || new Map(); }

  /** Legacy accessors so render/main can stay mode-agnostic. */
  get expedition() { return this.m.id === 'expedition' ? this.m : null; }
  get adventure() { return this.m.walkerKind === 'party' ? this.m : null; }
  get walker() { return this.m.isWalker ? this.m : null; }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
  }

  /** Subscribe to gameplay events (sound, and anything else later). */
  on(fn) { this.listeners.push(fn); return this; }
  emit(kind, data = {}) { for (const fn of this.listeners) fn(kind, data); }

  // --- the river ------------------------------------------------------------

  /**
   * The river is laid before the game proper: the spring first, then tiles in
   * turn, and the lake last. It may not double back on itself — two curves in
   * a row bending the same way would make a U-turn — but only an *immediate*
   * reversal is illegal, which is the official reading.
   */
  startRiver() {
    const deck = buildRiverDeck(this.rng);
    deck.unshift(RIVER_MOUTH);          // drawn last, since we pop from the end
    return { deck, end: null, lastTurn: 0, done: false };
  }

  /** The opening tiles: the spring if there's a river, else the mode's seeds. */
  seeds() {
    if (!this.river) return this.m.seeds();
    this.river.end = { x: 0, y: 0, side: 0 };   // the spring flows north
    return [{ x: 0, y: 0, id: RIVER_SPRING, rot: 0 }];
  }

  /** The cell the next river tile has to occupy. */
  riverTarget() {
    const e = this.river?.end;
    if (!e) return null;
    const [dx, dy] = SIDE_STEP[e.side];
    return { x: e.x + dx, y: e.y + dy };
  }

  /** Where the river leaves a tile, and which way it turned to get there. */
  riverFlow(type, rot) {
    const incoming = opposite(this.river.end.side);
    const feat = type.feats.find((f) => f.type === 'river');
    if (!feat) return null;
    const world = feat.sides.map((s) => (s + rot) % 4);
    if (!world.includes(incoming)) return null;
    const outgoing = world.find((s) => s !== incoming);
    if (outgoing == null) return { outgoing: null, turn: 0 };   // the lake
    const delta = (outgoing - incoming + 4) % 4;
    return { outgoing, turn: delta === 2 ? 0 : delta };
  }

  riverLegal(x, y, type, rot) {
    const target = this.riverTarget();
    if (!target || x !== target.x || y !== target.y) return false;
    const flow = this.riverFlow(type, rot);
    if (!flow) return false;
    // Two bends the same way in a row would turn the river through 180°.
    if (flow.turn !== 0 && flow.turn === this.river.lastTurn) return false;
    return true;
  }

  advanceRiver(cell) {
    const flow = this.riverFlow(cell.type, cell.rot);
    if (!flow || flow.outgoing == null) return this.endRiver();
    this.river.end = { x: cell.x, y: cell.y, side: flow.outgoing };
    this.river.lastTurn = flow.turn;
    if (!this.river.deck.length) this.endRiver();
  }

  endRiver() {
    this.river.done = true;
    this.say('The river reaches the lake. The country around it is open now.');
    this.emit('caveExit');
  }

  get riverActive() { return !!this.river && !this.river.done; }

  // --- turn structure -------------------------------------------------------

  startTurn() {
    if (this.phase === 'over') return;
    const inv = this.interior;
    if (inv) {
      this.phase = inv.tile ? 'interior-place' : 'interior-move';
      return;
    }
    if (this.m.startTurn() === false) return;    // mode took over (boons, stages)
    if (this.tilesLeft <= 0) {
      this.tilesLeft = this.tilesPerTurn;
      this.builderUsed = false;
    }
    if (!this.riverActive && !this.m.anythingLeft()) {
      const other = this.m.someoneStillInside(this.current);
      if (other != null) { this.current = other; return this.startTurn(); }
      return this.finish();
    }
    this.drawTile();
  }

  drawTile() {
    this.usingAbbey = false;
    this.useBig = false;
    // A mode with its own draw owns it completely — including deciding that
    // there's nothing left and ending the game.
    if (this.m.drawNext && !this.riverActive) return void this.m.drawNext();
    this.flipped = false;
    if (this.riverActive) return this.drawRiverTile();
    if (this.has('market') && this.spec.market !== false) return this.fillMarket();

    while (this.deck.length) {
      let id;
      if (this.forcedNext) {
        id = this.forcedNext;
        this.forcedNext = null;
        const idx = this.deck.indexOf(id);
        if (idx >= 0) this.deck.splice(idx, 1); else this.deck.pop();
      } else {
        id = this.deck.pop();
      }
      if (this.offer(id)) return;
      this.say(`Tile ${id} had nowhere to go — discarded.`);
    }
    this.finish();
  }

  /** River tiles come off their own pile, and only fit in one place. */
  drawRiverTile() {
    while (this.river.deck.length) {
      const id = this.river.deck.pop();
      const type = TILES[id];
      if (this.riverPlacements(type).length) {
        this.tile = type;
        this.rot = 0;
        this.phase = 'place';
        return;
      }
      this.say(`River tile ${id} had nowhere to go — discarded.`);
    }
    this.endRiver();
    this.drawTile();
  }

  riverPlacements(type) {
    const target = this.riverTarget();
    if (!target) return [];
    const out = [];
    for (let rot = 0; rot < 4; rot++) {
      if (!this.riverLegal(target.x, target.y, type, rot)) continue;
      if (!this.board.canPlace(target.x, target.y, type, rot, { free: this.free })) continue;
      out.push({ x: target.x, y: target.y, rot });
    }
    return out;
  }

  /** Make a drawn tile the current one, if it can actually be played. */
  offer(id) {
    const type = TILES[id];
    if (!this.placeableNow(type)) return false;
    this.tile = type;
    this.rot = 0;
    this.phase = 'place';
    return true;
  }

  placeableNow(type) {
    return this.board.hasAnyPlacement(type, this.placeOpts());
  }

  placeOpts() {
    const opts = { free: this.free, ...(this.m.placeOpts?.() || {}) };
    if (this.has('stack') && !this.riverActive) opts.cover = true;
    return opts;
  }

  // --- the drafting market --------------------------------------------------

  fillMarket(size = MARKET_SIZE, row = null) {
    const market = row || this.market || [];
    this.market = market;
    for (let i = market.length - 1; i >= 0; i--) {
      if (!this.placeableNow(TILES[market[i]])) market.splice(i, 1);
    }
    while (market.length < size && this.deck.length) {
      const id = this.deck.pop();
      if (this.placeableNow(TILES[id])) market.push(id);
    }
    if (!market.length) return this.finish();
    this.phase = 'market';
    return true;
  }

  takeFromMarket(i) {
    if (this.phase !== 'market' || !this.market || i < 0 || i >= this.market.length) return false;
    const discards = this.spec.marketDiscards !== false;
    const discarded = discards ? this.market.splice(0, i) : [];
    const id = discards ? this.market.shift() : this.market.splice(i, 1)[0];
    if (discarded.length) this.say(`${this.player.name} passes over ${discarded.join(', ')} to take ${id}.`);
    this.emit('rotate');
    if (!this.offer(id)) this.drawTile();
    return true;
  }

  // --- placing --------------------------------------------------------------

  rotate(dir = 1) {
    if (this.phase === 'place') {
      // The mode only handles rotation for tiles it dealt. An abbey out of
      // hand, or a river tile, is the host's and turns the ordinary way.
      const mine = this.usingAbbey || this.riverActive;
      if (this.m.rotate && !mine) this.m.rotate(dir);
      else this.rot = (this.rot + dir + 4) % 4;
    } else if (this.phase === 'interior-place' && this.interior) {
      this.interior.rotate(dir);
    } else return;
    this.emit('rotate');
  }

  canFlip() {
    if (!this.has('twoFaced') || this.phase !== 'place') return false;
    if (this.m.piece || this.usingAbbey || this.riverActive) return false;
    return !!this.tile && !!BACKS[this.tile.id];
  }

  flipTile() {
    if (!this.canFlip()) return false;
    const back = TILES[BACKS[this.tile.id]];
    if (!this.board.hasAnyPlacement(back, this.placeOpts())) {
      this.say(`The reverse of ${this.tile.id} has nowhere to go.`);
      return false;
    }
    this.say(`${this.player.name} turns ${this.tile.id} over — it is ${back.name} on the back.`);
    this.tile = back;
    this.flipped = !this.flipped;
    this.emit('rotate');
    return true;
  }

  // --- the abbey (expansion 5) ---------------------------------------------

  /**
   * Not while the river is going down. The river owns placement completely —
   * `canPlaceAt` routes through `riverLegal` before it looks at anything else —
   * so an abbey taken out now is a tile with nowhere at all it may go, and the
   * turn can never end.
   */
  canPlayAbbey() {
    return this.has('abbey') && this.phase === 'place' && !this.usingAbbey
      && !this.riverActive && this.player.abbeys > 0 && this.abbeyGaps().length > 0;
  }

  abbeyGaps() {
    const out = [];
    for (const { x, y } of this.board.frontier()) {
      if (this.board.isEnclosedGap(x, y)) out.push({ x, y });
    }
    return out;
  }

  playAbbey() {
    if (!this.canPlayAbbey()) return false;
    this.heldTile = this.tile;
    this.tile = ABBEY_TILE;
    this.rot = 0;
    this.usingAbbey = true;
    this.say(`${this.player.name} takes out their abbey.`);
    this.emit('rotate');
    return true;
  }

  // --- lifting (Cirrus's rule, anywhere) -----------------------------------

  canLiftNow() {
    if (!this.has('lift') || this.riverActive) return false;
    if (this.phase !== 'place' && this.phase !== 'market') return false;
    return liftableCells(this.board).length > 0;
  }

  beginLift() {
    if (!this.canLiftNow()) return false;
    this.phase = 'lift';
    return true;
  }

  cancelLift() {
    if (this.phase !== 'lift') return false;
    this.phase = this.tile ? 'place' : 'market';
    return true;
  }

  /** Pick a placed tile up; you play it instead of the one you drew. */
  liftAt(x, y) {
    if (this.phase !== 'lift' || !canLift(this.board, x, y)) return false;
    const cell = this.board.remove(x, y);
    if (this.tile) this.deck.push(this.tile.id);   // the drawn tile goes back
    this.tile = cell.type;
    this.rot = cell.rot;
    this.market = null;
    this.phase = 'place';
    this.say(`${this.player.name} lifts ${cell.type.id} off (${x}, ${y}).`);
    this.emit('rotate');
    return true;
  }

  // --- placement ------------------------------------------------------------

  canPlaceAt(x, y) {
    if (this.phase !== 'place') return false;
    if (this.riverActive) return this.riverLegal(x, y, this.tile, this.rot)
      && this.board.canPlace(x, y, this.tile, this.rot, { free: this.free });
    if (this.usingAbbey) return this.board.isEnclosedGap(x, y);
    if (this.m.canPlaceAt) return this.m.canPlaceAt(x, y);
    if (this.board.get(x, y) && coverProblem(this.board, x, y)) return false;
    return this.board.canPlace(x, y, this.tile, this.rot, this.placeOpts());
  }

  placeAt(x, y) {
    if (this.phase !== 'place') return false;
    if (this.m.placeAt && !this.usingAbbey && !this.riverActive) return this.m.placeAt(x, y);
    if (!this.canPlaceAt(x, y)) return false;

    const covering = !!this.board.get(x, y);
    const cell = this.board.place(x, y, this.tile, this.rot, {
      owner: this.current, over: covering,
      ...(this.m.placeOpts?.() || {}),
    });
    this.lastPlaced = cell;
    if (this.usingAbbey) {
      this.player.abbeys--;
      this.tile = this.heldTile || null;      // your drawn tile is still to come
      this.heldTile = null;
      this.usingAbbey = false;
      this.say(`${this.player.name} closes the gap at (${x}, ${y}) with their abbey.`);
    } else {
      this.tile = null;
      this.say(`${this.player.name} played ${cell.type.id} at (${x}, ${y})${covering ? ` — level ${cell.h + 1}` : ''}.`);
    }
    this.emit('place', { cells: [cell] });
    if (this.riverActive) this.advanceRiver(cell);
    this.checkBuilder(cell);
    this.afterPlace(cell);
    return true;
  }

  /**
   * Builder: extending a feature you already hold buys you another tile this
   * turn. The real expansion has a separate figure you place; here any of your
   * followers on the extended feature counts, which is the same decision
   * without the extra bookkeeping.
   */
  checkBuilder(cell) {
    if (!this.has('builder') || this.builderUsed) return;
    const mine = cell.type.feats.some((f, i) => {
      const d = this.board.featureOf(cell.x, cell.y, i);
      return d && d.tiles.size > 1 && d.meeples.some((m) => m.player === this.current);
    });
    if (!mine) return;
    this.builderUsed = true;
    this.tilesLeft++;
    this.say(`${this.player.name}'s builder is at work — another tile this turn.`);
    this.emit('landmark');
  }

  /** Hand off to the mode; a null answer means "just end the turn". */
  afterPlace(cell) {
    const next = this.m.afterPlace(cell);
    if (!next) return this.endTurn();
    this.phase = next;
    if (next === 'meeple' && this.meepleOptions().length === 0) this.endTurn();
  }

  /**
   * Board clicks the host doesn't recognise go to the mode, which is how
   * Marches picks a battle and Cirrus lifts its own way.
   */
  cellClick(x, y) {
    switch (this.phase) {
      case 'place': return this.placeAt(x, y);
      case 'move': return this.movePawn(x, y);
      case 'lift': return this.m.onCellClick ? this.m.onCellClick(x, y) : this.liftAt(x, y);
      case 'recall': return this.recallAt(x, y);
      case 'walk': return this.walkTo(x, y);
      default: return this.m.onCellClick?.(x, y) ?? false;
    }
  }

  // --- followers ------------------------------------------------------------

  /**
   * Where a follower may go this turn. Normally that's the unclaimed features
   * on the tile you just laid — but a mode may offer somewhere else entirely
   * (Girando's flying machine sends one down a lane), so every option carries
   * the square it belongs to rather than assuming `lastPlaced`.
   */
  meepleOptions() {
    if (this.phase !== 'meeple' || !this.lastPlaced || !this.useMeeples) return [];
    if (this.player.meeples <= 0) return [];
    const { x, y, type } = this.lastPlaced;
    const here = claimableFeatures(type)
      .filter(({ i }) => {
        const d = this.board.featureOf(x, y, i);
        return d && d.meeples.length === 0;
      })
      .map((o) => ({ ...o, x, y }));
    return [...here, ...(this.m.flightTargets?.() || [])];
  }

  placeMeeple(featIdx, at = null) {
    if (this.phase !== 'meeple') return false;
    const spot = this.meepleOptions().find((o) => o.i === featIdx
      && (!at || (o.x === at.x && o.y === at.y)));
    if (!spot) return false;
    const cell = this.board.get(spot.x, spot.y);
    if (!cell) return false;
    const big = this.useBig && this.player.big > 0;
    this.board.addMeeple(spot.x, spot.y, featIdx, this.current, big);
    this.player.meeples--;
    if (big) this.player.big--;
    this.useBig = false;
    const what = cell.type.feats[featIdx].type;
    this.say(spot.flying
      ? `${this.player.name} flies a follower out to the ${what} at (${spot.x}, ${spot.y}).`
      : `${this.player.name} claimed the ${what}${big ? ' with their big follower' : ''}.`);
    this.emit('meeple', { feat: featIdx, player: this.current, at: { x: spot.x + 0.5, y: spot.y + 0.5 } });
    this.endTurn();
    return true;
  }

  skipMeeple() { if (this.phase === 'meeple') this.endTurn(); }

  toggleBig() {
    if (!this.has('bigMeeple') || this.player.big <= 0) return false;
    this.useBig = !this.useBig;
    return true;
  }

  // --- recalling a follower -------------------------------------------------

  canRecall() {
    return this.has('recall') && this.phase === 'meeple' && this.myMeeples().length > 0;
  }

  myMeeples() {
    return [...this.board.cells.values()].filter((c) => c.meeple && c.meeple.player === this.current);
  }

  beginRecall() {
    if (!this.canRecall()) return false;
    this.phase = 'recall';
    return true;
  }

  recallAt(x, y) {
    const cell = this.board.get(x, y);
    if (!cell || !cell.meeple || cell.meeple.player !== this.current) return false;
    const big = cell.meeple.big;
    cell.meeple = null;
    this.board.rebuild();
    this.player.meeples++;
    if (big) this.player.big++;
    this.say(`${this.player.name} calls a follower home from (${x}, ${y}).`);
    this.emit('meeple', { recall: true, player: this.current, at: { x: x + 0.5, y: y + 0.5 } });
    this.endTurn();
    return true;
  }

  // --- the wagon: followers walk on ----------------------------------------

  /**
   * When a feature scores, a follower on it may step along the road to the
   * next unclaimed, unfinished thing rather than going back to supply. Only
   * the player whose turn it is gets the choice; everyone else's followers go
   * home, because stopping the game to ask four people in turn is worse than
   * the rule is good.
   */
  offerWalk(d) {
    if (!this.has('wagon')) return false;
    const mine = d.meeples.filter((m) => m.player === this.current);
    if (!mine.length) return false;
    for (const m of mine) {
      const targets = walkTargets(this.board, m.x, m.y, d);
      if (!targets.length) continue;
      this.pendingWalk = { from: m, targets, big: !!m.big };
      this.phase = 'walk';
      return true;
    }
    return false;
  }

  walkTo(x, y) {
    const w = this.pendingWalk;
    if (!w) return false;
    const t = w.targets.find((o) => o.x === x && o.y === y);
    if (!t) return false;
    this.board.addMeeple(t.x, t.y, t.feat, this.current, w.big);
    this.player.meeples--;
    if (w.big) this.player.big--;
    this.say(`${this.player.name}'s follower walks on to the ${t.type} at (${x}, ${y}).`);
    this.pendingWalk = null;
    this.emit('step', {
      from: { x: w.from.x + 0.5, y: w.from.y + 0.5 },
      at: { x: x + 0.5, y: y + 0.5 },
      key: `meeple:${x},${y}`, player: this.current,
    });
    this.resumeTurn();
    return true;
  }

  declineWalk() {
    if (!this.pendingWalk) return false;
    this.pendingWalk = null;
    this.resumeTurn();
    return true;
  }

  /** Carry on from wherever a mid-turn prompt interrupted us. */
  resumeTurn() {
    this.finishTurnStep();
  }

  // --- movement (walking modes) --------------------------------------------

  selectPawn(pawn) {
    if (this.phase !== 'move' || !this.walker) return false;
    return this.m.select(pawn);
  }

  movePawn(x, y) {
    if (this.phase !== 'move' || !this.walker) return false;
    if (!this.m.moveSelected(x, y)) return false;
    if (this.phase === 'move') this.endTurn();
    return true;
  }

  restPawn() {
    if (this.phase !== 'move' || !this.m.rest) return false;
    if (!this.m.rest()) return false;
    this.endTurn();
    return true;
  }

  holdPosition() {
    if (this.phase !== 'move') return;
    this.say(`${this.player.name} holds position.`);
    this.endTurn();
  }

  enterCity() {
    if (this.phase !== 'move' || !this.m.enterCity) return false;
    if (!this.m.enterCity()) return false;
    this.endTurn();
    return true;
  }

  canEnterCity() { return this.phase === 'move' && !!this.m.canEnterCity?.(); }

  // --- interiors ------------------------------------------------------------

  interiorPlaceAt(x, y) {
    const inv = this.interior;
    if (this.phase !== 'interior-place' || !inv) return false;
    if (!inv.place(x, y)) return false;
    this.emit('place');
    this.phase = 'interior-move';
    return true;
  }

  interiorMoveTo(x, y) {
    const inv = this.interior;
    if (this.phase !== 'interior-move' || !inv) return false;
    if (!inv.moveTo(x, y)) return false;
    this.emit('step');
    this.m.interiorArrive(inv);
    this.endInteriorTurn(inv);
    return true;
  }

  interiorHold() {
    const inv = this.interior;
    if (inv) this.endInteriorTurn(inv);
  }

  canLeaveInterior() {
    const inv = this.interior;
    return !!inv && inv.atEntrance();
  }

  leaveInterior() {
    const inv = this.interior;
    if (!inv || !inv.atEntrance()) return false;
    this.m.leaveInterior(inv);
    this.nextPlayer();
    return true;
  }

  endInteriorTurn(inv) {
    if (this.interior === inv) {
      inv.draw();
      if (!inv.tile && inv.atEntrance()) this.m.leaveInterior(inv, 'has seen all there is to see here');
    }
    this.nextPlayer();
  }

  // --- ending a turn --------------------------------------------------------

  endTurn() {
    if (this.lastPlaced) {
      const { x, y } = this.lastPlaced;
      for (const d of this.board.completedBy(x, y)) {
        this.noteClosure(d, this.current);
        this.m.onClosed(d, this.current);
        if (this.offerWalk(d)) return;      // wait for them to pick a target
      }
    }
    this.finishTurnStep();
  }

  /**
   * One tile is done. Either deal the next one of this turn's allowance, or
   * pass play on.
   */
  finishTurnStep() {
    this.tilesLeft--;
    const more = this.riverActive || this.deck.length > 0 || (this.market?.length > 0);
    if (this.tilesLeft > 0 && more && this.phase !== 'over') {
      this.phase = 'place';
      return this.startTurn();
    }
    this.tilesLeft = 0;
    this.m.endTurn();
    this.nextPlayer();
  }

  nextPlayer() {
    if (this.phase === 'over') return;
    const wrapped = this.current === this.players.length - 1;
    this.current = (this.current + 1) % this.players.length;
    this.turn++;
    if (wrapped) {
      this.round++;
      this.m.endRound();
      if (this.has('tide')) this.advanceTide();
    }
    if (this.phase === 'over') return;
    this.startTurn();
    if (this.phase !== 'over') this.emit('turn');
  }

  // --- the rising tide ------------------------------------------------------

  /**
   * The waterline is just a moving southern bound on the board, which is why
   * it needs no special case anywhere else: a tile that could only go
   * underwater is unplayable for the same reason a tile off the edge of Duel's
   * 5x5 is, and the existing draw loop already discards those.
   */
  setWaterline(y) {
    this.waterline = y;
    const b = this.spec.bounds;
    this.board.bounds = {
      minX: b?.minX ?? -Infinity, maxX: b?.maxX ?? Infinity,
      minY: b?.minY ?? -Infinity, maxY: Math.min(b?.maxY ?? Infinity, y - 1),
    };
  }

  advanceTide() {
    if (this.round % TIDE_PERIOD !== 1 || this.round <= 1) return;
    this.setWaterline(this.waterline - 1);
    const drowned = [];
    for (const cell of [...this.board.cells.values()]) {
      if (cell.y < this.waterline || cell.anchored) continue;
      drowned.push(cell);
    }
    // Say goodbye before they go: the effect needs the tile it's drawing.
    if (drowned.length) {
      this.emit('drown', {
        cells: drowned.map((c) => ({ x: c.x, y: c.y, type: c.type, rot: c.rot })),
      });
    }
    for (const cell of drowned) this.board.remove(cell.x, cell.y);
    if (drowned.length) {
      this.say(`The water rises to y=${this.waterline}. ${drowned.length} tile${drowned.length > 1 ? 's' : ''} lost.`);
      this.emit('deny');
      this.m.onDrowned(drowned);
    }
    if (this.board.size === 0) this.finish();
  }

  // --- hidden agendas -------------------------------------------------------

  dealAgendas() {
    const pool = AGENDAS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.players.forEach((p, i) => { p.agendas = [pool[i * 2 % pool.length], pool[(i * 2 + 1) % pool.length]]; });
  }

  scoreAgendas() {
    for (const p of this.players) {
      for (const a of p.agendas || []) {
        if (!a.test(this.board, p.id)) continue;
        p.score += a.points;
        this.say(`Agenda — ${p.name}: "${a.text}" +${a.points}`);
      }
    }
  }

  // --- scoring --------------------------------------------------------------

  /** Track who finished the biggest city and the longest road. */
  noteClosure(d, closer) {
    if (closer == null) return;
    if (d.type === 'city' && (!this.crown.city || d.tiles.size > this.crown.city)) {
      this.crown.city = d.tiles.size;
      this.crown.cityBy = closer;
    }
    if (d.type === 'road' && (!this.crown.road || d.tiles.size > this.crown.road)) {
      this.crown.road = d.tiles.size;
      this.crown.roadBy = closer;
    }
    if (this.has('goods')) {
      for (const g of goodsOn(this.board, d)) {
        this.players[closer].goods[g]++;
        this.say(`${this.players[closer].name} takes the ${g} from the city.`);
      }
    }
  }

  /**
   * Where a component sits, for anything that wants to point at it — the score
   * numbers that float off the board, and the flash that says which tiles the
   * points came from. Returns null for a component with nothing left on the
   * board, which a drowned or lifted one can be.
   */
  spotOf(d) {
    const cells = this.board.cellsOf(d);
    if (!cells.length) return null;
    return {
      at: {
        x: cells.reduce((s, c) => s + c.x, 0) / cells.length + 0.5,
        y: cells.reduce((s, c) => s + c.y, 0) / cells.length + 0.5,
      },
      cells: cells.map((c) => ({ x: c.x, y: c.y })),
    };
  }

  /**
   * What a component pays, with every scoring mechanic folded in: the water a
   * city sits beside, and the inn or cathedral on it.
   */
  valueOf(d, final) {
    // A mode that scores a feature type its own way says so; anything it
    // doesn't have an opinion about falls through to the board's rules.
    const own = this.m.valueOf?.(d, final);
    let pts = own == null ? this.board.value(d, final) : own;
    if (this.has('inns')) {
      const ic = innsAndCathedrals(this.board, d, final);
      if (ic.void) return 0;
      pts = Math.round(pts * ic.mult);
    }
    if (d.type === 'city') {
      const { lakes, rivers } = this.board.adjacentWater(d);
      pts += lakes * WATER.lake + rivers * WATER.river;
    }
    return pts;
  }

  /** Classic payout: majority of followers, or the closer when meeples are off. */
  award(d, final, closer = null) {
    const pts = this.valueOf(d, final);
    let winners;
    if (this.useMeeples) winners = this.board.majority(d);
    else winners = final || closer == null ? [] : [closer];

    if (winners.length && pts > 0) {
      for (const p of winners) this.players[p].score += pts;
      const who = winners.map((p) => this.players[p].name).join(' & ');
      const n = d.tiles.size;
      this.say(`${final ? 'Endgame: ' : ''}${d.type} of ${n} tile${n > 1 ? 's' : ''} → ${who} +${pts}`);
      this.emit('score', { points: pts, players: winners, ...this.spotOf(d) });
    } else if (!final && !winners.length) {
      this.say(`A ${d.type} closed with nobody on it.`);
    }
    if (!final && this.useMeeples) {
      for (const m of this.board.reclaim(d)) {
        this.players[m.player].meeples++;
        if (m.big) this.players[m.player].big++;
      }
    }
  }

  scoreGoods() {
    for (const g of GOODS) {
      const best = Math.max(...this.players.map((p) => p.goods[g]));
      if (best <= 0) continue;
      const winners = this.players.filter((p) => p.goods[g] === best);
      for (const p of winners) p.score += RULES.goodsBonus;
      this.say(`${g}: ${winners.map((p) => p.name).join(' & ')} +${RULES.goodsBonus}`);
    }
  }

  scoreCrown() {
    const { cities, roads } = crownAndRoad(this.board);
    if (this.crown.cityBy != null && cities) {
      this.players[this.crown.cityBy].score += cities;
      this.say(`The King (largest city, ${this.crown.city} tiles) — ${this.players[this.crown.cityBy].name} +${cities}`);
    }
    if (this.crown.roadBy != null && roads) {
      this.players[this.crown.roadBy].score += roads;
      this.say(`The Robber Baron (longest road, ${this.crown.road} tiles) — ${this.players[this.crown.roadBy].name} +${roads}`);
    }
  }

  finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.tile = null;
    this.market = null;
    this.m.finish();
    if (this.has('goods')) this.scoreGoods();
    if (this.has('king')) this.scoreCrown();
    if (this.has('agendas')) this.scoreAgendas();
    if (!this.spec.solo) {
      const best = Math.max(...this.players.map((p) => p.score));
      const winners = this.players.filter((p) => p.score === best).map((p) => p.name);
      this.say(`Game over — ${winners.join(' & ')} wins with ${best}.`);
    }
    this.emit('over');
  }
}

/** Small seeded PRNG so a layout can be replayed while iterating. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { buildDeck, MAX_STACK, NO_MEEPLE, MARKS };
