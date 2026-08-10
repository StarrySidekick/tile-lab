// ---------------------------------------------------------------------------
// Turn flow.
//
//   Classic    place tile -> (claim a feature) -> score closed features
//   Expedition place tile -> move a pawn       -> claim landmarks you reach
//   Adventure  place tile -> move a party member -> collect, recruit, explore
//
// Classic can be played with meeples off entirely, in which case a completed
// feature pays whoever closed it.
//
// Interiors (caves, city streets) are a sub-map that replaces your surface turn
// while you're inside one. Both Expedition and Adventure use the same machine.
//
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import { TILES, GROUPS, buildDeck } from './tiles.js';
import { PLAYER_NAMES } from './theme.js';
import { Expedition } from './expedition.js';
import { Adventure } from './adventure.js';

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
  adventure: GROUPS.filter((g) => g.adventure).map((g) => g.id),
};

export class Game {
  constructor({ players = 2, seed = null, mode = 'classic', meeples = true, groups = null } = {}) {
    this.mode = mode;
    this.useMeeples = mode === 'classic' ? meeples : false;
    this.groups = groups || DEFAULT_GROUPS[mode] || DEFAULT_GROUPS.classic;
    if (mode === 'adventure') players = 1;

    this.board = new Board();
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.deck = buildDeck(this.groups, this.rng, RULES.startTile);
    this.players = Array.from({ length: players }, (_, i) => ({
      id: i,
      name: mode === 'adventure' ? 'Hero' : PLAYER_NAMES[i],
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
    this.turn = 1;

    this.board.place(0, 0, TILES[RULES.startTile], 0);
    this.expedition = mode === 'expedition' ? new Expedition(this) : null;
    this.adventure = mode === 'adventure' ? new Adventure(this) : null;
    this.say({
      expedition: 'The expedition sets out from the crossroads.',
      adventure: 'You set out from the crossroads with nothing but the road ahead.',
    }[mode] || 'Start tile placed.');
    this.startTurn();
  }

  get player() { return this.players[this.current]; }

  /** The sub-map replacing this player's surface turn, if any. */
  get interior() {
    if (this.adventure) return this.adventure.interior;
    if (this.expedition) return this.expedition.caveOf(this.current);
    return null;
  }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
  }

  /** Subscribe to gameplay events (sound, and anything else later). */
  on(fn) { this.listeners.push(fn); return this; }
  emit(kind, data = {}) { for (const fn of this.listeners) fn(kind, data); }

  // --- turn structure -------------------------------------------------------

  startTurn() {
    const inv = this.interior;
    if (inv) {
      this.phase = inv.tile ? 'interior-place' : 'interior-move';
      return;
    }
    if (this.deck.length === 0) {
      // Surface is done, but anyone still inside gets to finish exploring.
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
    else if (this.phase === 'interior-place' && this.interior) this.interior.rotate(dir);
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

    if (this.mode === 'adventure') {
      this.phase = 'move';
      return true;
    }
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

  // --- movement (both walking modes) ----------------------------------------

  get walker() { return this.adventure || this.expedition; }

  selectPawn(pawn) {
    if (this.phase !== 'move') return false;
    if (this.expedition && pawn.player !== this.current) return false;
    if (this.adventure && pawn.inside) return false;
    this.walker.selected = pawn;
    return true;
  }

  movePawn(x, y) {
    if (this.phase !== 'move') return false;
    const pawn = this.walker.selected;
    if (!pawn) return false;
    if (this.adventure) {
      if (!this.adventure.move(pawn, x, y)) return false;
      this.endTurn();
      return true;
    }
    if (!this.expedition.move(pawn, x, y)) return false;
    this.endTurn();
    return true;
  }

  restPawn() {
    if (this.phase !== 'move' || !this.expedition) return false;
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

  /** Adventure only: step through a finished city's gate. */
  enterCity() {
    if (this.phase !== 'move' || !this.adventure) return false;
    const p = this.adventure.selected;
    if (!p || !this.adventure.enterCity(p)) return false;
    this.endTurn();
    return true;
  }

  canEnterCity() {
    if (this.phase !== 'move' || !this.adventure) return false;
    const p = this.adventure.selected;
    return !!p && !p.inside && !!this.adventure.cityGateAt(p.x, p.y);
  }

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
    if (this.adventure) this.adventure.interiorArrive(inv.owner);
    else this.expedition.caveArrive(inv);
    this.endInteriorTurn(inv);
    return true;
  }

  interiorHold() {
    const inv = this.interior;
    if (!inv) return;
    this.endInteriorTurn(inv);
  }

  canLeaveInterior() {
    const inv = this.interior;
    return !!inv && inv.atEntrance();
  }

  leaveInterior() {
    const inv = this.interior;
    if (!inv || !inv.atEntrance()) return false;
    if (this.adventure) this.adventure.leaveInterior(inv.owner);
    else this.expedition.leaveCave(inv);
    this.nextPlayer();
    return true;
  }

  endInteriorTurn(inv) {
    // A shaft may already have kicked the explorer out.
    const still = this.interior === inv;
    if (still) {
      inv.draw();
      if (!inv.tile && inv.atEntrance()) {
        if (this.adventure) this.adventure.leaveInterior(inv.owner, 'has seen all there is to see here');
        else this.expedition.leaveCave(inv, 'runs out of cave and climbs back');
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
    this.turn++;
    this.startTurn();
    if (this.phase !== 'over') this.emit('turn');
  }

  award(d, final, closer = null) {
    if (this.mode !== 'classic') return;
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
    if (this.adventure) {
      this.players[0].score = this.adventure.score();
      const done = this.adventure.journal.filter((q) => q.done).length;
      this.say(`The road ends. ${done}/${this.adventure.journal.length} journal entries, ${this.players[0].score} points.`);
    } else {
      const best = Math.max(...this.players.map((p) => p.score));
      const winners = this.players.filter((p) => p.score === best).map((p) => p.name);
      this.say(`Game over — ${winners.join(' & ')} wins with ${best}.`);
    }
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
