// ---------------------------------------------------------------------------
// Strata — the board gets a Z axis.
//
// You may place onto an occupied cell. The top tile is the truth for edge
// matching; what's underneath still counts at the end. Height is the whole
// idea: a closed feature scores its normal value multiplied by how high it
// stands, so building UP beats building OUT, and the skyline is the score.
//
// The cover rules, which are the actual experiment:
//
//   COST     covering costs 2 stone; laying at ground level earns 1. So going
//            up is paid for by going out, and you can't only do one.
//   RESPECT  you can't cover a tile in a feature that has already scored.
//            Otherwise closing a city would be a trap rather than a reward.
//   CEILING  three levels. Past that it's unreadable on screen, which is a
//            real constraint and not a design one.
//
// FOUNDATIONS: a buried tile still pays 1 to whoever laid it, at the end. So
// building over an opponent doesn't erase them, it freezes them — which keeps
// the person losing a stack fight in the game.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { coverProblem, MAX_STACK } from '../mechanics.js';

const COVER_COST = 2;
const GROUND_GAIN = 1;
const STONE_CAP = 8;

export class Strata extends Mode {
  deck() { return buildDeck(this.game.groups, this.game.rng, 'D'); }

  setup() {
    this.stone = this.game.players.map(() => 3);
    this.tallest = 0;
  }

  placeOpts() { return { cover: true }; }

  // --- covering rules -------------------------------------------------------

  /**
   * The shared cover rules, plus the one Strata adds: it costs stone. The
   * height ceiling and the "nothing that scored, nothing claimed" rules live
   * in mechanics.js so the `stack` mechanic behaves identically elsewhere.
   */
  coverProblem(x, y) {
    const shared = coverProblem(this.game.board, x, y);
    if (shared) return shared;
    if (!this.game.board.get(x, y)) return null;
    if (this.stone[this.game.current] < COVER_COST) return 'not enough stone';
    return null;
  }

  canPlaceAt(x, y) {
    const g = this.game;
    if (!g.tile) return false;
    if (g.board.get(x, y) && this.coverProblem(x, y)) return false;
    return g.board.canPlace(x, y, g.tile, g.rot, { free: g.free, cover: true });
  }

  placeAt(x, y) {
    if (!this.canPlaceAt(x, y)) return false;
    const g = this.game;
    const covering = !!g.board.get(x, y);
    const cell = g.board.place(x, y, g.tile, g.rot, { cover: true, over: covering, owner: g.current });
    if (covering) {
      this.stone[g.current] -= COVER_COST;
      g.say(`${g.player.name} builds over (${x}, ${y}) — level ${cell.h + 1}, −${COVER_COST} stone.`);
    } else {
      this.stone[g.current] = Math.min(STONE_CAP, this.stone[g.current] + GROUND_GAIN);
      g.say(`${g.player.name} lays ${cell.type.id} at (${x}, ${y}) — +${GROUND_GAIN} stone.`);
    }
    this.tallest = Math.min(MAX_STACK, Math.max(this.tallest, cell.h));
    g.lastPlaced = cell;
    g.tile = null;
    g.emit('place', { cells: [cell] });
    g.afterPlace(cell);
    return true;
  }

  // --- scoring --------------------------------------------------------------

  onClosed(d, closer) {
    if (closer == null) return;
    const board = this.game.board;
    const base = board.value(d, false);
    const mult = 1 + board.meanHeight(d);
    const pts = Math.round(base * mult);
    this.game.players[closer].score += pts;
    this.game.say(
      `${this.game.players[closer].name} closes a ${d.type} of ${d.tiles.size} at mean height ${mult.toFixed(1)} → +${pts}`);
    this.game.emit('score', { points: pts, player: closer, ...this.game.spotOf(d) });
  }

  /**
   * Height is the score here, and the generic evaluation only knows a
   * feature's flat value — so hand a computer player the multiplier, and the
   * stone that pays for it.
   */
  botPlaceBonus(cells) {
    const board = this.game.board;
    const seen = new Set();
    let value = 0;
    for (const cell of cells) {
      cell.type.feats.forEach((f, i) => {
        const d = board.featureOf(cell.x, cell.y, i);
        if (!d || d.scored || d.open !== 0) return;
        const root = board.find(d.parts[0]);
        if (seen.has(root)) return;
        seen.add(root);
        value += board.value(d, false) * board.meanHeight(d);
      });
      value += cell.h ? -COVER_COST / 2 : GROUND_GAIN / 2;
    }
    return value;
  }

  /** Foundations: every buried tile pays 1 to whoever laid it. */
  finish() {
    const buried = new Map();
    for (const cell of this.game.board.cells.values()) {
      for (let c = cell.under; c; c = c.under) {
        if (c.owner == null) continue;
        buried.set(c.owner, (buried.get(c.owner) || 0) + 1);
      }
    }
    for (const [player, n] of buried) {
      this.game.players[player].score += n;
      this.game.say(`Foundations — ${this.game.players[player].name} has ${n} tile${n > 1 ? 's' : ''} buried +${n}`);
    }
  }

  // --- UI -------------------------------------------------------------------

  status() {
    return `${this.stone[this.game.current]} stone · tallest ${this.tallest + 1}`;
  }

  /** The renderer asks per cell; height is drawn as a lift plus a shadow. */
  cellOverlay(cell) {
    return cell.h > 0 ? { lift: cell.h } : null;
  }

  panel() {
    return this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${this.stone[i]} stone</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('') + '<p class="hint">Closed features score × their mean height. Ground-level tiles earn stone; covering spends it.</p>';
  }
}

Strata.spec = {
  id: 'strata',
  name: 'Strata (stacking)',
  Mode: Strata,
  groups: ['base', 'cities'],
  minPlayers: 1,
  maxPlayers: 4,
  opening: 'Ground level. Everything from here is up.',
  hint: 'Build on top of tiles. Features score × mean height. Covering costs stone; laying on the ground earns it.',
};
