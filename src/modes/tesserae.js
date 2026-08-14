// ---------------------------------------------------------------------------
// Tesserae — the daily puzzle.
//
// One seed derived from the date, so everybody gets the same thirty tiles on
// the same bounded board on the same day. Solo, no meeples, one sitting.
//
// It's here for two reasons beyond the obvious. It gives the lab a reason to
// be opened again rather than demoed once. And "this seed must produce this
// board forever" is the strictest regression test the engine will ever have —
// if a change to placement or shuffling alters today's puzzle, something moved
// that shouldn't have.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck } from '../tiles.js';

const RADIUS = 3;          // 7x7
const DECK = 30;

/** Days since epoch — the same integer everywhere on Earth for ~24h. */
export function dailySeed(now = new Date()) {
  const days = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  let h = 2166136261 ^ days;
  h = Math.imul(h, 16777619);
  return h >>> 0;
}

export function dailyLabel(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export class Tesserae extends Mode {
  deck() { return buildDeck(['base'], this.game.rng, 'D', DECK); }

  setup() {
    this.placed = 0;
    this.closedFeatures = 0;
    // Par scales with the deck: closing roughly half of what you lay is a
    // decent day, and beating it should feel like you played well rather than
    // like you got lucky with the draw.
    this.par = Math.round(DECK * 1.6);
  }

  afterPlace() { this.placed++; return null; }

  onClosed(d, closer) {
    this.closedFeatures++;
    this.game.award(d, false, closer);
  }

  finish() {
    const s = this.game.players[0].score;
    const verdict = s >= this.par + 12 ? 'A very good day.'
      : s >= this.par ? 'Par or better.'
      : `Short of par by ${this.par - s}.`;
    this.game.say(`${s} points from ${this.placed} tiles. ${verdict}`);
  }

  status() {
    return `${dailyLabel()} · par ${this.par}`;
  }

  panel() {
    const p = this.game.players[0];
    const pct = Math.max(0, Math.min(100, Math.round((p.score / this.par) * 100)));
    return `
      <div class="advTop"><span>${dailyLabel()}</span><span>Par <b>${this.par}</b></span></div>
      <div class="parBar"><div class="parFill" style="width:${pct}%"></div></div>
      <div class="advTop"><span>Score <b>${p.score}</b></span><span>${this.closedFeatures} closed</span></div>
      <p class="hint">Everyone gets this same board today. Bounded ${RADIUS * 2 + 1}×${RADIUS * 2 + 1}; unfinished features pay nothing.</p>`;
  }
}

Tesserae.spec = {
  id: 'tesserae',
  name: 'Tesserae (daily)',
  Mode: Tesserae,
  groups: ['base'],
  solo: true,
  market: false,
  seedFor: () => dailySeed(),
  playerName: () => 'You',
  bounds: { minX: -RADIUS, maxX: RADIUS, minY: -RADIUS, maxY: RADIUS },
  opening: "Today's puzzle. Same thirty tiles for everyone.",
  hint: 'Solo, seeded by the date, bounded board. Closed features pay; unfinished ones do not. Beat par.',
};
