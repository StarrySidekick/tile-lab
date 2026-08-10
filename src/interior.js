// ---------------------------------------------------------------------------
// Interiors — a sub-map you step into from the surface and explore tile by
// tile, on the same place-then-move loop as the main board.
//
// Caves and city interiors are the same machine with a different tile pool and
// a different backdrop: you enter at a fixed mouth, lay a tile each turn, walk
// one step, and pick up whatever you land on. Everything above the surface
// carries on while you're inside.
// ---------------------------------------------------------------------------

import { Board, keyOf } from './board.js';
import { TILES, SIDE_STEP } from './tiles.js';

export class Interior {
  /**
   * @param kind      'cave' | 'city' — picks the backdrop and the label
   * @param deck      array of tile ids for this interior's pool
   * @param entryType tile id placed at (0,0) as the way in
   * @param entry     {x, y} surface cell you came from, and return to
   * @param owner     the pawn inside
   * @param label     shown on the overlay
   * @param rng       shared game RNG
   */
  constructor({ kind, deck, entryType, entry, owner, label, rng = Math.random }) {
    this.kind = kind;
    this.deck = deck;
    this.entry = entry;
    this.owner = owner;
    this.label = label;
    this.rng = rng;

    this.board = new Board();
    this.board.place(0, 0, TILES[entryType], 0);
    this.pos = { x: 0, y: 0 };
    this.tile = null;
    this.rot = 0;
    this.claimed = new Set();
    this.visited = 1;
    this.draw();
  }

  /** Pull the next tile that can actually be placed somewhere. */
  draw() {
    while (this.deck.length) {
      const type = TILES[this.deck.pop()];
      if (this.board.hasAnyPlacement(type)) {
        this.tile = type;
        this.rot = 0;
        return true;
      }
    }
    this.tile = null;      // out of map — you can only walk what's already here
    return false;
  }

  rotate(dir = 1) { this.rot = (this.rot + dir + 4) % 4; }

  canPlace(x, y) { return !!this.tile && this.board.canPlace(x, y, this.tile, this.rot); }

  place(x, y) {
    if (!this.canPlace(x, y)) return false;
    this.board.place(x, y, this.tile, this.rot);
    this.tile = null;
    this.visited++;
    return true;
  }

  /** Tiles one step away that exist. */
  reachable() {
    const out = new Map();
    for (let s = 0; s < 4; s++) {
      const [dx, dy] = SIDE_STEP[s];
      const nx = this.pos.x + dx, ny = this.pos.y + dy;
      if (this.board.cells.has(keyOf(nx, ny))) out.set(keyOf(nx, ny), { x: nx, y: ny });
    }
    return out;
  }

  moveTo(x, y) {
    if (!this.reachable().has(keyOf(x, y))) return false;
    this.pos = { x, y };
    return true;
  }

  /** Marks on the current tile that haven't been taken yet. */
  freshMarks() {
    const cell = this.board.get(this.pos.x, this.pos.y);
    if (!cell) return [];
    return cell.type.marks
      .map((m, i) => ({ ...m, key: `${keyOf(cell.x, cell.y)}#${i}` }))
      .filter((m) => !this.claimed.has(m.key));
  }

  take(mark) { this.claimed.add(mark.key); }

  atEntrance() { return this.pos.x === 0 && this.pos.y === 0; }

  /** Nothing left to lay and nowhere new to go. */
  get exhausted() { return !this.tile && this.deck.length === 0; }
}
