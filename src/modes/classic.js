// ---------------------------------------------------------------------------
// Classic — place a tile, optionally claim a feature, score it when it closes.
//
// With meeples off, a completed feature simply pays whoever closed it. The
// placement game survives intact without any claim or supply management, which
// is the cheapest way to see how much of Carcassonne is the meeples.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';

export class Classic extends Mode {
  afterPlace() { return this.game.useMeeples ? 'meeple' : null; }

  onClosed(d, closer) { this.game.award(d, false, closer); }

  finish() {
    if (!this.game.useMeeples) return;
    for (const d of this.game.board.allComponents()) {
      if (d.scored || d.meeples.length === 0) continue;
      this.game.award(d, true);
    }
  }
}

Classic.spec = {
  id: 'classic',
  name: 'Classic',
  Mode: Classic,
  groups: ['base'],
  meeples: true,
  minPlayers: 2,
  maxPlayers: 5,
  opening: 'Start tile placed.',
  hint: 'Claim features with meeples; majority scores when they close.',
};
