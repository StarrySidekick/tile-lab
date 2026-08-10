// ---------------------------------------------------------------------------
// Turn flow.
//
//   Classic    place tile -> (claim a feature) -> score closed features
//   Expedition place tile -> move a pawn       -> claim landmarks you reach
//
// Classic can be played with meeples off entirely, in which case a completed
// feature pays whoever closed it. That keeps the placement game intact without
// any of the claim/supply management.
//
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import { TILES, GROUPS, buildDeck } from './tiles.js';
import { PLAYER_NAMES } from './theme.js';
import { Expedition } from './expedition.js';

export const RULES = {
  meeplesPerPlayer: 7,
  startTile: 'D',
  cityPerTile: 2,
  cityPerShield: 2,
  roadPerTile: 1,
};

export const DEFAULT_GROUPS = {
  classic: GROUPS.filter((g) => g.classic).map((g) => g.id),
  expedition: GROUPS.filter((g) => g.expedition).map((g) => g.id),
};

export class Game {
  constructor({ players = 2, seed = null, mode = 'classic', meeples = true, groups = null } = {}) {
    this.mode = mode;                 // 'classic' | 'expedition'
    this.useMeeples = mode === 'classic' ? meeples : false;
    this.groups = groups || DEFAULT_GROUPS[mode] || DEFAULT_GROUPS.classic;

    this.board = new Board();
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.deck = buildDeck(this.groups, this.rng, RULES.startTile);
    this.players = Array.from({ length: players }, (_, i) => ({
      id: i,
      name: PLAYER_NAMES[i],
      score: 0,
      meeples: RULES.meeplesPerPlayer,
    }));
    this.current = 0;
    this.phase = 'place';
    this.tile = null;
    this.rot = 0;
    this.lastPlaced = null;
    this.log = [];
    this.free = false;
    this.forcedNext = null;
    this.listeners = [];

    this.board.place(0, 0, TILES[RULES.startTile], 0);
    this.expedition = mode === 'expedition' ? new Expedition(this) : null;
    this.say(mode === 'expedition'
      ? 'The expedition sets out from the crossroads.'
      : 'Start tile placed.');
    this.startTurn();
  }

  get player() { return this.players[this.current]; }
  get cave() { return this.expedition ? this.expedition.caveOf(this.current) : null; }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
  }

  /** Subscribe to gameplay events (sound, and anything else later). */
  on(fn) { this.listeners.push(fn); return this; }
  emit(kind, data = {}) { for (const fn of this.listeners) fn(kind, data); }

  // --- turn structure -------------------------------------------------------

  startTurn() {
    const cave = this.cave;
    if (cave) {
      this.phase = cave.tile ? 'cave-place' : 'cave-move';
      return;
    }
    if (this.deck.length === 0) {
      // Surface is done, but anyone still underground gets to finish their dig.
      for (let i = 1; i <= this.players.length; i++) {
        const p = (this.current + i) % this.players.length;
        if (this.caves.has(p)) { this.current = p; return this.startTurn(); }
      }
      return this.finish();
    }
    this.drawTile();
  }

  drawTile() {
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
      const type = TILES[id];
      if (this.board.hasAnyPlacement(type, { free: this.free })) {
        this.tile = type;
        this.rot = 0;
        this.phase = 'place';
        return;
      }
      this.say(`Tile ${id} had nowhere to go — discarded.`);
    }
    this.finish();
  }

  rotate(dir = 1) {
    if (this.phase === 'place') this.rot = (this.rot + dir + 4) % 4;
    else if (this.phase === 'cave-place' && this.cave) this.cave.rot = (this.cave.rot + dir + 4) % 4;
    else return;
    this.emit('rotate');
  }

  canPlaceAt(x, y) {
    return this.phase === 'place' &&
      this.board.canPlace(x, y, this.tile, this.rot, { free: this.free });
  }

  placeAt(x, y) {
    if (!this.canPlaceAt(x, y)) return false;
    this.lastPlaced = this.board.place(x, y, this.tile, this.rot);
    this.say(`${this.player.name} played ${this.tile.id} at (${x}, ${y}).`);
    this.emit('place');

    if (this.mode === 'expedition') {
      this.phase = 'move';
      this.expedition.beginMovement(this.current);
      const mine = this.expedition.pawnsOf(this.current);
      this.expedition.selected = mine.length === 1 ? mine[0] : null;
      return true;
    }

    if (!this.useMeeples) { this.endTurn(); return true; }
    this.phase = 'meeple';
    if (this.meepleOptions().length === 0) this.endTurn();
    return true;
  }

  // --- classic: meeples -----------------------------------------------------

  meepleOptions() {
    if (this.phase !== 'meeple' || !this.lastPlaced || !this.useMeeples) return [];
    if (this.player.meeples <= 0) return [];
    const { x, y, type } = this.lastPlaced;
    return type.feats
      .map((f, i) => ({ i, f }))
      .filter(({ i }) => this.board.featureOf(x, y, i).meeples.length === 0);
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

  skipMeeple() {
    if (this.phase === 'meeple') this.endTurn();
  }

  // --- expedition: movement -------------------------------------------------

  selectPawn(pawn) {
    if (this.phase !== 'move' || pawn.player !== this.current) return false;
    this.expedition.selected = pawn;
    return true;
  }

  movePawn(x, y) {
    if (this.phase !== 'move') return false;
    const pawn = this.expedition.selected;
    if (!pawn || !this.expedition.move(pawn, x, y)) return false;
    this.endTurn();
    return true;
  }

  restPawn() {
    if (this.phase !== 'move') return false;
    const pawn = this.expedition.selected;
    if (!pawn || !this.expedition.rest(pawn)) return false;
    this.endTurn();
    return true;
  }

  holdPosition() {
    if (this.phase !== 'move') return;
    this.say(`${this.player.name} holds position.`);
    this.endTurn();
  }

  // --- expedition: caves ----------------------------------------------------

  cavePlaceAt(x, y) {
    const cave = this.cave;
    if (this.phase !== 'cave-place' || !cave || !cave.tile) return false;
    if (!cave.board.canPlace(x, y, cave.tile, cave.rot)) return false;
    cave.board.place(x, y, cave.tile, cave.rot);
    cave.tile = null;
    this.emit('place');
    this.phase = 'cave-move';
    return true;
  }

  caveMoveTo(x, y) {
    const cave = this.cave;
    if (this.phase !== 'cave-move' || !cave) return false;
    if (!this.expedition.caveMove(cave, x, y)) return false;
    this.endCaveTurn(cave);
    return true;
  }

  caveHold() {
    const cave = this.cave;
    if (!cave) return;
    this.endCaveTurn(cave);
  }

  caveLeave() {
    const cave = this.cave;
    if (!cave || !this.expedition.canLeaveCave(cave)) return false;
    this.expedition.leaveCave(cave);
    this.nextPlayer();
    return true;
  }

  endCaveTurn(cave) {
    // leaveCave() may already have fired via a shaft.
    if (this.expedition.caves.has(cave.pawn.player)) {
      this.expedition.drawCaveTile(cave);
      if (!cave.tile && this.expedition.canLeaveCave(cave)) {
        this.expedition.leaveCave(cave, 'runs out of cave and climbs back');
      }
    }
    this.nextPlayer();
  }

  // --- shared ---------------------------------------------------------------

  endTurn() {
    if (this.lastPlaced) {
      const { x, y } = this.lastPlaced;
      for (const d of this.board.completedBy(x, y)) this.award(d, false, this.current);
    }
    this.nextPlayer();
  }

  get caves() { return this.expedition ? this.expedition.caves : new Map(); }

  nextPlayer() {
    this.current = (this.current + 1) % this.players.length;
    this.startTurn();
    if (this.phase !== 'over') this.emit('turn');
  }

  /**
   * Pay out a component. With meeples on, the majority takes it; with meeples
   * off, whoever closed it does. Expedition doesn't score features at all.
   */
  award(d, final, closer = null) {
    if (this.mode === 'expedition') return;
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
    if (this.mode === 'classic' && this.useMeeples) {
      for (const d of this.board.allComponents()) {
        if (d.scored || d.meeples.length === 0) continue;
        this.award(d, true);
      }
    }
    const best = Math.max(...this.players.map((p) => p.score));
    const winners = this.players.filter((p) => p.score === best).map((p) => p.name);
    this.say(`Game over — ${winners.join(' & ')} wins with ${best}.`);
    this.emit('over');
  }
}

/** Small seeded PRNG so a layout can be replayed while iterating. */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
