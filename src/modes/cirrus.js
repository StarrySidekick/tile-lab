// ---------------------------------------------------------------------------
// Cirrus — the cloud kingdom, where the main verb is LIFTING.
//
// Forty tiles, a hand of three, and a board that never settles. Each turn you
// either play from your hand or lift a tile that's already down and put it
// somewhere better. The whole game lives in what you're allowed to lift:
//
//   · anchored tiles can't be lifted — anything crystallised, or with a
//     windvane pinning it down
//   · a lift must leave the board CONNECTED. No orphan islands. You feel this
//     rule constantly, and it's the best one here.
//
// Closing a feature CRYSTALLISES its tiles: they turn to permanent land, they
// score, and they can never be lifted again. Everything still cloud is at the
// mercy of the DRIFT — at the end of each round, any unanchored tile clinging
// to the board by a single edge blows away.
//
// So the arc is a churning cloudscape you're racing to convert into solid
// kingdom before it dissipates under you. The deck can be small because the
// board is constantly recycling itself.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck, MARKS } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { canLift } from '../mechanics.js';

const HAND = 3;
const DECK_SIZE = 40;

export class Cirrus extends Mode {
  deck() { return buildDeck(['base', 'cloud'], this.game.rng, 'D', DECK_SIZE); }

  setup() {
    this.hands = this.game.players.map(() => []);
    this.lifting = false;
    this.lifted = 0;
    this.crystals = 0;
    const seed = this.game.board.get(0, 0);
    if (seed) seed.anchored = true;          // the founding stone stays put
  }

  // --- the hand -------------------------------------------------------------

  /** The hand IS the market row — same picker, different refill rule. */
  drawNext() {
    this.lifting = false;
    this.game.fillMarket(HAND, this.hands[this.game.current]);
  }

  // --- lifting --------------------------------------------------------------

  /**
   * The shared rule, plus the one Cirrus adds: a windvane pins its tile down.
   * `canLift` already refuses anchored, claimed, built-on and load-bearing
   * tiles, so this stays in step with the `lift` mechanic everywhere else.
   */
  liftable(x, y) {
    const cell = this.game.board.get(x, y);
    if (!cell || cell.type.marks.some((m) => m.kind === 'vane')) return false;
    return canLift(this.game.board, x, y);
  }

  allLiftable() {
    return [...this.game.board.cells.values()]
      .filter((c) => this.liftable(c.x, c.y))
      .map((c) => ({ x: c.x, y: c.y }));
  }

  beginLift() {
    if (!this.allLiftable().length) {
      this.game.say('Nothing can be lifted — everything is anchored or holding the board together.');
      return false;
    }
    this.lifting = true;
    this.game.phase = 'lift';
    return true;
  }

  cancelLift() {
    this.lifting = false;
    this.game.phase = this.game.tile ? 'place' : 'market';
    return true;
  }

  /** Click a placed tile while lifting: it comes off and becomes your tile. */
  onCellClick(x, y) {
    if (this.game.phase !== 'lift') return false;
    if (!this.liftable(x, y)) return false;
    const cell = this.game.board.remove(x, y);
    this.lifting = false;
    this.lifted++;
    this.game.market = null;              // this turn is the lift, not the hand
    this.game.tile = cell.type;
    this.game.rot = cell.rot;
    this.game.phase = 'place';
    this.game.say(`${this.game.player.name} lifts ${cell.type.id} out of the sky at (${x}, ${y}).`);
    this.game.emit('rotate');
    return true;
  }

  afterPlace(cell) {
    cell.round = this.game.round;
    return null;
  }

  // --- crystallising --------------------------------------------------------

  onClosed(d, closer) {
    const board = this.game.board;
    const pts = board.value(d, false);
    let bonus = 0;
    for (const k of d.tiles) {
      const [x, y] = k.split(',').map(Number);
      const cell = board.get(x, y);
      if (!cell || cell.anchored) continue;
      cell.anchored = true;
      this.crystals++;
      for (const m of cell.type.marks) bonus += MARKS[m.kind]?.score || 0;
    }
    if (closer != null) {
      this.game.players[closer].score += pts + bonus;
      this.game.say(`${this.game.players[closer].name} crystallises a ${d.type} of ${d.tiles.size} → +${pts + bonus}`);
      this.game.emit('score', { points: pts + bonus, player: closer, ...this.game.spotOf(d) });
    }
  }

  // --- drift ----------------------------------------------------------------

  /**
   * A tile holding on by one edge blows away, unless it's been crystallised.
   * Newly placed tiles get a round's grace, or you could never build outward.
   */
  endRound() {
    const board = this.game.board;
    const doomed = [...board.cells.values()].filter((c) =>
      !c.anchored && board.degree(c.x, c.y) <= 1 && (c.round ?? 0) < this.game.round - 1);

    if (doomed.length) {
      this.game.emit('drift', {
        cells: doomed.map((c) => ({ x: c.x, y: c.y, type: c.type, rot: c.rot })),
      });
    }
    for (const c of doomed) board.remove(c.x, c.y);
    if (doomed.length) {
      this.game.say(`The cloud thins — ${doomed.length} tile${doomed.length > 1 ? 's' : ''} drift away.`);
      this.game.emit('deny');
    }

    // Raincatches pay their owner for every round they survive intact.
    for (const c of board.cells.values()) {
      if (!c.type.marks.some((m) => m.kind === 'raincatch')) continue;
      if (c.owner == null) continue;
      this.game.players[c.owner].score += 1;
    }
    if (board.size === 0) this.game.finish();
  }

  // --- UI -------------------------------------------------------------------

  /** Solid land reads hard-edged; everything else reads as weather. */
  cellOverlay(cell) {
    return cell.anchored ? { crystal: true } : { cloud: true };
  }

  actions() {
    const g = this.game;
    const out = [];
    if (g.phase === 'lift') {
      out.push({ label: 'Cancel lift', fn: () => this.cancelLift() });
    } else if (g.phase === 'market' || g.phase === 'place') {
      out.push({
        label: 'Lift a tile',
        fn: () => this.beginLift(),
        disabled: !this.allLiftable().length,
      });
    }
    return out;
  }

  status() {
    const solid = [...this.game.board.cells.values()].filter((c) => c.anchored).length;
    return `${solid} solid · ${this.game.board.size - solid} still cloud`;
  }

  panel() {
    const rows = this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${this.hands[i].length} in hand</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    return `${rows}<p class="hint">Crystallised tiles are permanent. Everything else can be lifted — and drifts away if it's only holding on by one edge.</p>`;
  }
}

Cirrus.spec = {
  id: 'cirrus',
  name: 'Cirrus (cloud kingdom)',
  Mode: Cirrus,
  groups: ['base', 'cloud'],
  minPlayers: 1,
  maxPlayers: 4,
  market: false,             // the hand is its own row
  marketDiscards: false,
  tideStart: 5,
  opening: 'A first stone hangs in the cloud. Everything else is weather.',
  hint: 'Play from hand, or lift a placed tile and move it. Closing a feature turns it to permanent land; loose cloud drifts away each round.',
};
