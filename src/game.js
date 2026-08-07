// ---------------------------------------------------------------------------
// Turn flow: draw -> place tile -> optionally place meeple -> score -> next.
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import { TILES, buildDeck } from './tiles.js';
import { PLAYER_NAMES } from './art.js';

// Knobs worth fiddling with while prototyping.
export const RULES = {
  meeplesPerPlayer: 7,
  startTile: 'D',
  cityPerTile: 2,
  cityPerShield: 2,
  roadPerTile: 1,
};

export class Game {
  constructor({ players = 2, seed = null } = {}) {
    this.board = new Board();
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.deck = buildDeck(this.rng, RULES.startTile);
    this.players = Array.from({ length: players }, (_, i) => ({
      id: i,
      name: PLAYER_NAMES[i],
      score: 0,
      meeples: RULES.meeplesPerPlayer,
    }));
    this.current = 0;
    this.phase = 'place';       // 'place' | 'meeple' | 'over'
    this.tile = null;           // tile type in hand
    this.rot = 0;
    this.lastPlaced = null;     // cell just placed, for the meeple step
    this.log = [];
    this.free = false;          // sandbox: ignore edge matching
    this.forcedNext = null;     // sandbox: force the next tile id

    this.board.place(0, 0, TILES[RULES.startTile], 0);
    this.say('Start tile placed.');
    this.drawTile();
  }

  get player() { return this.players[this.current]; }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 60) this.log.pop();
  }

  // --- drawing --------------------------------------------------------------

  drawTile() {
    while (this.deck.length) {
      let id;
      if (this.forcedNext) {
        // Sandbox override: pull the requested tile out of the pile by hand.
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
    if (this.phase !== 'place') return;
    this.rot = (this.rot + dir + 4) % 4;
  }

  canPlaceAt(x, y) {
    return this.phase === 'place' &&
      this.board.canPlace(x, y, this.tile, this.rot, { free: this.free });
  }

  // --- the turn -------------------------------------------------------------

  placeAt(x, y) {
    if (!this.canPlaceAt(x, y)) return false;
    this.lastPlaced = this.board.place(x, y, this.tile, this.rot);
    this.say(`${this.player.name} played ${this.tile.id} at (${x}, ${y}).`);
    this.phase = 'meeple';
    if (this.meepleOptions().length === 0) this.endTurn();
    return true;
  }

  /** Features on the just-placed tile that are free to claim. */
  meepleOptions() {
    if (this.phase !== 'meeple' || !this.lastPlaced) return [];
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
    this.endTurn();
    return true;
  }

  skipMeeple() {
    if (this.phase !== 'meeple') return;
    this.endTurn();
  }

  endTurn() {
    const { x, y } = this.lastPlaced;
    for (const d of this.board.completedBy(x, y)) this.award(d, false);
    if (this.deck.length === 0) return this.finish();
    this.current = (this.current + 1) % this.players.length;
    this.drawTile();
  }

  /** Pay out a component and (mid-game) send the meeples home. */
  award(d, final) {
    const pts = this.board.value(d, final);
    const winners = this.board.majority(d);
    if (winners.length) {
      for (const p of winners) this.players[p].score += pts;
      const who = winners.map((p) => this.players[p].name).join(' & ');
      this.say(`${final ? 'Endgame: ' : ''}${d.type} of ${d.tiles.size} tile${d.tiles.size > 1 ? 's' : ''} → ${who} +${pts}`);
    } else if (!final) {
      this.say(`A ${d.type} closed with nobody on it.`);
    }
    if (!final) for (const p of this.board.reclaim(d)) this.players[p].meeples++;
  }

  finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.tile = null;
    for (const d of this.board.allComponents()) {
      if (d.scored || d.meeples.length === 0) continue;
      this.award(d, true);
    }
    const best = Math.max(...this.players.map((p) => p.score));
    const winners = this.players.filter((p) => p.score === best).map((p) => p.name);
    this.say(`Game over — ${winners.join(' & ')} wins with ${best}.`);
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
