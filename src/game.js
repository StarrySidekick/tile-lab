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
// MODIFIERS (a drafting market, hidden agendas, two-faced tiles, a rising
// tide) are orthogonal to modes and live here, because they apply to all of
// them.
//
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import { TILES, GROUPS, BACKS, buildDeck } from './tiles.js';
import { PLAYER_NAMES } from './theme.js';
import { MODES, MODE_BY_ID } from './modes/index.js';
import { AGENDAS } from './modes/agendas.js';

export const RULES = {
  meeplesPerPlayer: 7,
  startTile: 'D',
  cityPerTile: 2,
  cityPerShield: 2,
  roadPerTile: 1,
};

export const MODIFIERS = [
  { id: 'market',   name: 'Drafting market', note: 'Choose from a face-up row instead of drawing blind. Taking a later tile discards the ones before it.' },
  { id: 'agendas',  name: 'Hidden agendas',  note: 'Two secret objectives each, scored at the end.' },
  { id: 'fog',      name: 'Fog of war',      note: 'Tiles far from your figures fade out.' },
  { id: 'twoFaced', name: 'Two-faced tiles', note: 'Many tiles have a reverse. Flip before you place.' },
  { id: 'tide',     name: 'Rising tide',     note: 'A waterline climbs the board every few rounds, drowning whatever it reaches.' },
];

export const DEFAULT_GROUPS = Object.fromEntries(MODES.map((m) => [m.id, m.groups]));
export { MODES, GROUPS };

const MARKET_SIZE = 4;
const TIDE_PERIOD = 3;          // rounds between waterline steps

export class Game {
  constructor({
    players = 2, seed = null, mode = 'classic', meeples = true,
    groups = null, options = {},
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

    // The mode builds its own state, then tells us what the deck and the
    // opening tiles are.
    this.m = new spec.Mode(this);
    this.deck = this.m.deck();
    for (const s of this.m.seeds()) this.board.place(s.x, s.y, TILES[s.id], s.rot || 0, { owner: s.owner ?? null });

    if (this.options.agendas) this.dealAgendas();
    if (this.options.tide) this.setWaterline(spec.tideStart ?? 6);

    this.m.setup();
    this.say(spec.opening || 'Start tile placed.');
    this.startTurn();
  }

  get player() { return this.players[this.current]; }
  get modeName() { return this.spec.name; }

  /** The sub-map replacing this player's turn, if any. */
  get interior() { return this.m.interior; }

  /** Kept for Expedition's "let people finish their caves" endgame check. */
  get caves() { return this.m.caves || new Map(); }

  /** Legacy accessors so render/main can stay mode-agnostic. */
  get expedition() { return this.m.id === 'expedition' ? this.m : null; }
  get adventure() { return this.m.walkerKind === 'party' ? this.m : null; }
  get walker() { return this.m.isWalker ? this.m : null; }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
  }

  on(fn) { this.listeners.push(fn); return this; }
  emit(kind, data = {}) { for (const fn of this.listeners) fn(kind, data); }

  // --- turn structure -------------------------------------------------------

  startTurn() {
    if (this.phase === 'over') return;
    const inv = this.interior;
    if (inv) {
      this.phase = inv.tile ? 'interior-place' : 'interior-move';
      return;
    }
    if (this.m.startTurn() === false) return;    // mode took over (boons, stages)
    if (this.deck.length === 0 && !this.market?.length) {
      const other = this.m.someoneStillInside(this.current);
      if (other != null) { this.current = other; return this.startTurn(); }
      return this.finish();
    }
    this.drawTile();
  }

  /**
   * Pull the next placeable tile. With the market modifier on, this fills a
   * face-up row and hands the choice to the player instead.
   */
  drawTile() {
    // A mode with its own draw owns it completely — including deciding that
    // there's nothing left and ending the game.
    if (this.m.drawNext) return void this.m.drawNext();
    this.flipped = false;
    if (this.options.market && this.spec.market !== false) return this.fillMarket();

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

  placeOpts() { return { free: this.free, ...(this.m.placeOpts?.() || {}) }; }

  // --- the drafting market modifier ----------------------------------------

  /**
   * Fill a face-up row and hand the choice to the player. Duel and Cirrus reuse
   * this for their own draft and hand — same UI, different refill rules.
   */
  fillMarket(size = MARKET_SIZE, row = null) {
    const market = row || this.market || [];
    this.market = market;
    // Anything unplayable is dead weight in a face-up row, so cull it.
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

  /**
   * Take the i-th tile in the row. In the market modifier, reaching past a
   * tile discards it — that's the whole cost model, and it needs no currency.
   */
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
      if (this.m.rotate) this.m.rotate(dir); else this.rot = (this.rot + dir + 4) % 4;
    } else if (this.phase === 'interior-place' && this.interior) {
      this.interior.rotate(dir);
    } else return;
    this.emit('rotate');
  }

  /** Two-faced modifier: swap the held tile for its reverse. */
  canFlip() {
    if (!this.options.twoFaced || this.phase !== 'place') return false;
    if (this.m.piece) return false;          // a piece isn't one tile to turn over
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

  canPlaceAt(x, y) {
    if (this.phase !== 'place') return false;
    if (this.m.canPlaceAt) return this.m.canPlaceAt(x, y);
    return this.board.canPlace(x, y, this.tile, this.rot, this.placeOpts());
  }

  placeAt(x, y) {
    if (this.phase !== 'place') return false;
    if (this.m.placeAt) return this.m.placeAt(x, y);
    if (!this.canPlaceAt(x, y)) return false;
    const cell = this.board.place(x, y, this.tile, this.rot, {
      owner: this.current, ...(this.m.placeOpts?.() || {}),
    });
    this.lastPlaced = cell;
    this.tile = null;
    this.say(`${this.player.name} played ${cell.type.id} at (${x}, ${y}).`);
    this.emit('place');
    this.afterPlace(cell);
    return true;
  }

  /** Hand off to the mode; a null answer means "just end the turn". */
  afterPlace(cell) {
    const next = this.m.afterPlace(cell);
    if (!next) return this.endTurn();
    this.phase = next;
    // Nothing to claim is not a decision — don't make them press skip.
    if (next === 'meeple' && this.meepleOptions().length === 0) this.endTurn();
  }

  /**
   * Board clicks the host doesn't recognise go to the mode, which is how
   * Cirrus lifts a tile and Marches picks a battle.
   */
  cellClick(x, y) {
    switch (this.phase) {
      case 'place': return this.placeAt(x, y);
      case 'move': return this.movePawn(x, y);
      default: return this.m.onCellClick?.(x, y) ?? false;
    }
  }

  // --- classic-style meeples (shared by any mode that opts in) --------------

  meepleOptions() {
    if (this.phase !== 'meeple' || !this.lastPlaced || !this.useMeeples) return [];
    if (this.player.meeples <= 0) return [];
    const { x, y, type } = this.lastPlaced;
    return type.feats
      .map((f, i) => ({ i, f }))
      .filter(({ i }) => {
        const d = this.board.featureOf(x, y, i);
        return d && d.meeples.length === 0;
      });
  }

  placeMeeple(featIdx) {
    if (this.phase !== 'meeple') return false;
    if (!this.meepleOptions().some((o) => o.i === featIdx)) return false;
    const { x, y, type } = this.lastPlaced;
    this.board.addMeeple(x, y, featIdx, this.current);
    this.player.meeples--;
    this.say(`${this.player.name} claimed the ${type.feats[featIdx].type}.`);
    this.emit('meeple');
    this.endTurn();
    return true;
  }

  skipMeeple() { if (this.phase === 'meeple') this.endTurn(); }

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
    if (this.interior === inv) {          // a shaft may already have ejected them
      inv.draw();
      if (!inv.tile && inv.atEntrance()) this.m.leaveInterior(inv, 'has seen all there is to see here');
    }
    this.nextPlayer();
  }

  // --- shared ---------------------------------------------------------------

  endTurn() {
    if (this.lastPlaced) {
      const { x, y } = this.lastPlaced;
      for (const d of this.board.completedBy(x, y)) this.m.onClosed(d, this.current);
    }
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
      if (this.options.tide) this.advanceTide();
    }
    if (this.phase === 'over') return;
    this.startTurn();
    if (this.phase !== 'over') this.emit('turn');
  }

  // --- the rising tide modifier --------------------------------------------

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
    for (const cell of drowned) this.board.remove(cell.x, cell.y);
    if (drowned.length) {
      this.say(`The water rises to y=${this.waterline}. ${drowned.length} tile${drowned.length > 1 ? 's' : ''} lost.`);
      this.emit('deny');
      this.m.onDrowned(drowned);
    }
    if (this.board.size === 0) this.finish();
  }

  // --- hidden agendas modifier ---------------------------------------------

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

  // --- scoring helpers modes reuse -----------------------------------------

  /** Classic payout: majority of meeples, or the closer when meeples are off. */
  award(d, final, closer = null) {
    const pts = this.board.value(d, final);
    let winners;
    if (this.useMeeples) winners = this.board.majority(d);
    else winners = final || closer == null ? [] : [closer];

    if (winners.length) {
      for (const p of winners) this.players[p].score += pts;
      const who = winners.map((p) => this.players[p].name).join(' & ');
      const n = d.tiles.size;
      this.say(`${final ? 'Endgame: ' : ''}${d.type} of ${n} tile${n > 1 ? 's' : ''} → ${who} +${pts}`);
      this.emit('score', { points: pts });
    } else if (!final) {
      this.say(`A ${d.type} closed with nobody on it.`);
    }
    if (!final && this.useMeeples) {
      for (const p of this.board.reclaim(d)) this.players[p].meeples++;
    }
  }

  finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.tile = null;
    this.market = null;
    this.m.finish();
    if (this.options.agendas) this.scoreAgendas();
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

export { buildDeck };
