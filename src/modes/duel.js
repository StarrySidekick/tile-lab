// ---------------------------------------------------------------------------
// Duel — 24 tiles, a bounded 5x5 board, and no randomness worth the name.
//
// This is the diagnostic mode. Every other design in the lab assumes the core
// act of placing a tile carries a game, and none of them can tell you whether
// that's true, because they're all wearing scaffolding — pawns, gold, caves,
// journals. This one has none of it: both players see the same face-up pool
// and take from it, the board is small enough that every square is contested,
// and a game is over in five minutes.
//
// If placement isn't fun here, it isn't fun anywhere, and no amount of RPG on
// top will fix it.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';

const POOL = 3;          // face-up tiles to choose from
const RADIUS = 2;        // 5x5 board

export class Duel extends Mode {
  deck() { return buildDeck(['base'], this.game.rng, 'D', 24); }

  /** No blind draw — refill the open pool and let them pick. */
  drawNext() { this.game.fillMarket(POOL); }

  afterPlace() { return null; }

  onClosed(d, closer) { this.game.award(d, false, closer); }

  /**
   * Nothing pays at the end. An unfinished city is just a thing you failed to
   * finish, which is what makes the last four tiles tense.
   */
  finish() {
    const [a, b] = this.game.players;
    if (a.score === b.score) this.game.say('Drawn. Play again — it takes five minutes.');
  }

  status() {
    const left = this.game.deck.length + (this.game.market?.length || 0);
    const filled = this.game.board.size;
    return `${filled}/${(RADIUS * 2 + 1) ** 2} squares · ${left} tiles left`;
  }

  panel() {
    return this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      const mine = [...this.game.board.cells.values()].filter((c) => c.owner === i).length;
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${mine} tiles</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
  }
}

Duel.spec = {
  id: 'duel',
  name: 'Duel (2p, 5 min)',
  Mode: Duel,
  groups: ['base'],
  minPlayers: 2,
  maxPlayers: 2,
  bounds: { minX: -RADIUS, maxX: RADIUS, minY: -RADIUS, maxY: RADIUS },
  market: false,             // it runs its own pool
  marketDiscards: false,     // and taking from it is free
  opening: 'Five by five. Twenty-four tiles. No hiding.',
  hint: 'Bounded board, open pool, no meeples. A closed feature pays whoever closed it; unfinished ones pay nobody.',
};
