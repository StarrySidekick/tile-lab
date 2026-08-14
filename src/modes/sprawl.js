// ---------------------------------------------------------------------------
// Sprawl — pieces of two to four cells, in tetromino shapes.
//
// A big piece has to satisfy several neighbours at once, so once a single-cell
// gap exists almost nothing fits into it. That's the entire reason this mode
// is here: DENIAL becomes a real strategy. In Classic you never really block
// anyone; here you deliberately leave holes where someone else's city wanted
// to grow.
//
// Two rules keep it from grinding:
//
//   · FILLERS — four wild 1x1 tiles each, which plug any hole regardless of
//     matching. Scarce, so a hole is negotiable rather than permanent.
//   · BREAK — play a single cell of a piece and discard the rest. Always
//     available, always costly, so the game can't deadlock.
//
// Sealing an empty cell completely makes a COURTYARD, worth points to whoever
// closed it — which rewards shape play directly instead of hoping it emerges.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { makePiece, rotatePiece, fillerPiece } from '../pieces.js';
import { keyOf } from '../board.js';
import { PLAYER_COLORS } from '../theme.js';

const PIECES = 26;
const FILLERS = 4;
const COURTYARD = 3;

export class Sprawl extends Mode {
  /** The "deck" is a count of pieces; each one is generated when drawn. */
  deck() { return Array.from({ length: PIECES }, (_, i) => `piece${i}`); }

  setup() {
    this.piece = null;
    this.fillers = this.game.players.map(() => FILLERS);
    this.holes = new Set(this.game.board.enclosedHoles().map((h) => keyOf(h.x, h.y)));
    this.courtyards = 0;
  }

  // --- drawing --------------------------------------------------------------

  drawNext() {
    const g = this.game;
    this.usingFiller = false;
    while (g.deck.length) {
      g.deck.pop();
      const piece = this.findPlaceable();
      if (piece) {
        this.piece = piece;
        g.tile = piece.cells[0].type;      // so the preview has something to draw
        g.rot = 0;
        g.phase = 'place';
        return true;
      }
    }
    g.finish();
    return true;
  }

  /** Generate until something fits — falls back to a single cell if need be. */
  findPlaceable(tries = 14) {
    for (let i = 0; i < tries; i++) {
      let piece = makePiece(this.game.rng, ['base']);
      for (let r = 0; r < 4; r++) {
        if (this.game.board.hasAnyPiecePlacement(piece)) return piece;
        piece = rotatePiece(piece, 1);
      }
    }
    for (let i = 0; i < tries; i++) {
      const single = { ...makePiece(this.game.rng, ['base']) };
      const one = { name: 'Single', w: 1, h: 1, cells: [{ ...single.cells[0], dx: 0, dy: 0 }] };
      if (this.game.board.hasAnyPiecePlacement(one)) return one;
    }
    return null;
  }

  // --- placing --------------------------------------------------------------

  rotate(dir) {
    if (!this.piece) return;
    this.piece = rotatePiece(this.piece, dir);
    this.game.rot = (this.game.rot + dir + 4) % 4;
  }

  canPlaceAt(x, y) {
    if (!this.piece) return false;
    if (this.piece.filler) {
      const b = this.game.board;
      return !b.get(x, y) && b.inBounds(x, y) && b.degree(x, y) > 0;
    }
    return this.game.board.canPlacePiece(x, y, this.piece);
  }

  placeAt(x, y) {
    if (!this.canPlaceAt(x, y)) return false;
    const g = this.game;
    const laid = g.board.placePiece(x, y, this.piece, { owner: g.current });
    g.lastPlaced = laid[0];
    if (this.piece.filler) {
      this.fillers[g.current]--;
      g.say(`${g.player.name} plugs (${x}, ${y}) with a filler.`);
    } else {
      g.say(`${g.player.name} drops a ${this.piece.name} at (${x}, ${y}).`);
    }
    this.piece = null;
    g.tile = null;
    g.emit('place');

    // Every cell of the piece can close something, not just the anchor.
    for (const cell of laid) {
      for (const d of g.board.completedBy(cell.x, cell.y)) this.onClosed(d, g.current);
    }
    this.scoreCourtyards(g.current);
    g.endTurn();
    return true;
  }

  /** Play a single cell of the piece and throw the rest away. */
  breakPiece() {
    if (!this.piece || this.piece.filler || this.piece.cells.length < 2) return false;
    const cell = this.piece.cells[0];
    this.piece = { name: 'Broken', w: 1, h: 1, cells: [{ ...cell, dx: 0, dy: 0 }] };
    this.game.say(`${this.game.player.name} breaks the piece apart.`);
    this.game.emit('deny');
    return true;
  }

  playFiller() {
    if (this.fillers[this.game.current] <= 0) return false;
    this.usingFiller = true;
    this.piece = fillerPiece();
    this.game.tile = this.piece.cells[0].type;
    return true;
  }

  onClosed(d, closer) { this.game.award(d, false, closer); }

  scoreCourtyards(player) {
    for (const h of this.game.board.enclosedHoles()) {
      const k = keyOf(h.x, h.y);
      if (this.holes.has(k)) continue;
      this.holes.add(k);
      this.courtyards++;
      this.game.players[player].score += COURTYARD;
      this.game.say(`${this.game.players[player].name} seals a courtyard at (${h.x}, ${h.y}) +${COURTYARD}`);
      this.game.emit('score', { points: COURTYARD });
    }
  }

  // --- UI -------------------------------------------------------------------

  actions() {
    const out = [];
    if (this.game.phase !== 'place') return out;
    if (this.piece && !this.piece.filler && this.piece.cells.length > 1) {
      out.push({ label: 'Break the piece', fn: () => this.breakPiece() });
    }
    if (!this.usingFiller) {
      out.push({
        label: `Play a filler (${this.fillers[this.game.current]})`,
        fn: () => this.playFiller(),
        disabled: this.fillers[this.game.current] <= 0,
      });
    }
    return out;
  }

  status() {
    return this.piece ? `${this.piece.name} · ${this.piece.cells.length} cells` : '';
  }

  panel() {
    return this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${this.fillers[i]} fillers</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('') + `<p class="hint">${this.courtyards} courtyard${this.courtyards === 1 ? '' : 's'} sealed. A hole nobody can fill is a hole you made on purpose.</p>`;
  }
}

Sprawl.spec = {
  id: 'sprawl',
  name: 'Sprawl (polyomino)',
  Mode: Sprawl,
  groups: ['base'],
  minPlayers: 1,
  maxPlayers: 4,
  market: false,
  opening: 'Big pieces, small gaps.',
  hint: 'Pieces cover 2–4 cells. Every external edge must match. Seal an empty cell to make a courtyard.',
};
