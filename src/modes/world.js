// ---------------------------------------------------------------------------
// World — the countryside gets the rest of its geography.
//
// Four new families of terrain, all of which can be switched on in any other
// mode from the tile pool list. This mode is just the one that turns them all
// on at once, with the river laid first.
//
//   MOUNTAINS pay the instant they grow, scaling with the size of the chain —
//     a range of five has paid 2+3+4+5 over its life, so the fifth tile is
//     worth more than the second and joining two ranges is worth more than
//     either. Nothing can be claimed on them, so they're pure placement.
//
//   FORESTS are cities with the tension taken out: 1 per tile, +1 per log, and
//     no complete/incomplete distinction at all. A forest is simply as big as
//     it is, and it pays the same whether it closes or the game ends around
//     it. That makes them the safe thing to claim and cities the greedy one.
//
//   LAKES are worth nothing by themselves. A city beside one is worth more,
//     which turns "where is the water" into a placement question rather than
//     scenery. They only come as shores and corners.
//
//   RIVERS work like Carcassonne's, laid before the game proper, and pay a
//     city the same way a lake does.
//
// The mountain rule is the one worth watching: it's the only feature in the
// lab that pays *immediately*, with no completion and no claim, which makes it
// the only thing on the board you can't be denied.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';

/** What a mountain chain pays when it reaches this size. */
export const mountainValue = (n) => n;

export class World extends Mode {
  deck() { return buildDeck(this.game.groups, this.game.rng, 'D'); }

  setup() {
    this.ranges = 0;
    this.biggestRange = 0;
    this.forestPoints = 0;
  }

  afterPlace(cell) {
    this.scoreMountains(cell);
    return this.game.useMeeples ? 'meeple' : null;
  }

  /**
   * A mountain pays the moment it joins something. Placing the tile is the
   * whole action — there's nothing to claim and no closing to wait for.
   */
  scoreMountains(cell) {
    const g = this.game;
    const seen = new Set();
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'mountain') return;
      const d = g.board.featureOf(cell.x, cell.y, i);
      if (!d || seen.has(d)) return;
      seen.add(d);
      const n = d.tiles.size;
      this.biggestRange = Math.max(this.biggestRange, n);
      if (n < 2) { this.ranges++; return; }
      const pts = mountainValue(n);
      g.player.score += pts;
      g.say(`${g.player.name} extends a range to ${n} tiles → +${pts}`);
      g.emit('score', { points: pts });
    });
  }

  /**
   * Mountains pay on placement rather than on closure, so they're the one
   * thing here a computer player reading the board alone would never chase.
   */
  botPlaceBonus(cells) {
    const board = this.game.board;
    const seen = new Set();
    let value = 0;
    for (const cell of cells) {
      cell.type.feats.forEach((f, i) => {
        if (f.type !== 'mountain') return;
        const d = board.featureOf(cell.x, cell.y, i);
        if (!d || d.tiles.size < 2) return;
        const root = board.find(d.parts[0]);
        if (seen.has(root)) return;
        seen.add(root);
        value += mountainValue(d.tiles.size);
      });
    }
    return value;
  }

  onClosed(d, closer) {
    const pts = this.game.valueOf(d, false);
    if (d.type === 'forest') this.forestPoints += pts;
    this.game.award(d, false, closer);
  }

  /**
   * Forests pay at the end whether they closed or not — that's the point of
   * them. Everything else follows the usual endgame rules.
   */
  finish() {
    if (!this.game.useMeeples) return;
    for (const d of this.game.board.allComponents()) {
      if (d.scored || d.meeples.length === 0) continue;
      this.game.award(d, d.type !== 'forest', null);
    }
  }

  status() {
    const bits = [];
    if (this.biggestRange > 1) bits.push(`longest range ${this.biggestRange}`);
    if (this.game.riverActive) bits.push('laying the river');
    return bits.join(' · ');
  }

  panel() {
    const rows = this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      const extra = this.game.useMeeples
        ? '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(7 - p.meeples)}</span>`
        : '';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${extra}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    return `${rows}<p class="hint">Mountains pay the moment a range grows and can't be claimed. Forests pay whether they close or not. A city beside water is worth more.</p>`;
  }
}

World.spec = {
  id: 'world',
  name: 'World',
  Mode: World,
  groups: ['base', 'mountains', 'forests', 'lakes'],
  mechanics: ['river'],
  meeples: true,
  minPlayers: 1,
  maxPlayers: 5,
  opening: 'A river, and country to put around it.',
  hint: 'Mountains score as their range grows. Forests score whether they finish or not. Cities beside water are worth more.',
};
