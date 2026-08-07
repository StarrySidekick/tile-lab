// ---------------------------------------------------------------------------
// Board state, placement legality, and feature connectivity.
//
// Every (tile, featureIndex) pair is a node in a union-find. When two tiles
// meet, the features that touch across that edge get merged. Each merged
// component tracks how many edge-slots are still hanging open; when that hits
// zero the feature is closed and scores.
// ---------------------------------------------------------------------------

import { SIDE_STEP, opposite } from './tiles.js';

export const keyOf = (x, y) => `${x},${y}`;

export class Board {
  constructor() {
    this.cells = new Map();   // "x,y" -> cell
    this.parent = new Map();  // "x,y#i" -> parent id
    this.data = new Map();    // root id -> component data
  }

  get(x, y) { return this.cells.get(keyOf(x, y)); }
  get size() { return this.cells.size; }

  /** Which canonical (unrotated) side of the tile is showing at world side s. */
  canonSide(cell, s) { return (s - cell.rot + 4) % 4; }

  /** Edge letter ('c' | 'r' | 'f') presented on world side s. */
  edgeAt(cell, s) { return cell.type.edges[this.canonSide(cell, s)]; }

  /** Index of the feature reaching world side s, or null for a field edge. */
  featAt(cell, s) {
    const c = this.canonSide(cell, s);
    const i = cell.type.feats.findIndex((f) => f.sides.includes(c));
    return i < 0 ? null : i;
  }

  neighbor(x, y, s) {
    const [dx, dy] = SIDE_STEP[s];
    return this.get(x + dx, y + dy);
  }

  // --- placement rules ------------------------------------------------------

  /** Can `type` at rotation `rot` legally go at (x,y)? */
  canPlace(x, y, type, rot, { free = false } = {}) {
    if (this.cells.has(keyOf(x, y))) return false;
    if (free) return true;
    const probe = { x, y, type, rot };
    let touches = 0;
    for (let s = 0; s < 4; s++) {
      const nb = this.neighbor(x, y, s);
      if (!nb) continue;
      touches++;
      if (this.edgeAt(probe, s) !== this.edgeAt(nb, opposite(s))) return false;
    }
    return touches > 0 || this.size === 0;
  }

  /** Every empty cell adjacent to something placed. */
  frontier() {
    const out = new Map();
    for (const cell of this.cells.values()) {
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        const nx = cell.x + dx, ny = cell.y + dy;
        const k = keyOf(nx, ny);
        if (!this.cells.has(k)) out.set(k, { x: nx, y: ny });
      }
    }
    return [...out.values()];
  }

  /** All (x, y, rot) a tile type could legally occupy right now. */
  legalPlacements(type, opts = {}) {
    const out = [];
    const cells = this.size === 0 ? [{ x: 0, y: 0 }] : this.frontier();
    for (const { x, y } of cells) {
      for (let rot = 0; rot < 4; rot++) {
        if (this.canPlace(x, y, type, rot, opts)) out.push({ x, y, rot });
      }
    }
    return out;
  }

  hasAnyPlacement(type, opts = {}) {
    const cells = this.size === 0 ? [{ x: 0, y: 0 }] : this.frontier();
    for (const { x, y } of cells) {
      for (let rot = 0; rot < 4; rot++) {
        if (this.canPlace(x, y, type, rot, opts)) return true;
      }
    }
    return false;
  }

  // --- union-find over features --------------------------------------------

  find(id) {
    let r = id;
    while (this.parent.get(r) !== r) r = this.parent.get(r);
    let c = id;
    while (this.parent.get(c) !== r) { const nx = this.parent.get(c); this.parent.set(c, r); c = nx; }
    return r;
  }

  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return a;
    let da = this.data.get(a), db = this.data.get(b);
    if (db.tiles.size > da.tiles.size) { [a, b] = [b, a]; [da, db] = [db, da]; }
    for (const t of db.tiles) da.tiles.add(t);
    da.shields += db.shields;
    da.open += db.open;
    da.meeples.push(...db.meeples);
    this.parent.set(b, a);
    this.data.delete(b);
    return a;
  }

  featureOf(x, y, i) { return this.data.get(this.find(`${keyOf(x, y)}#${i}`)); }

  /** Place a tile. Assumes canPlace() already said yes. */
  place(x, y, type, rot) {
    const k = keyOf(x, y);
    const cell = { x, y, type, rot, meeple: null };
    this.cells.set(k, cell);

    type.feats.forEach((f, i) => {
      const id = `${k}#${i}`;
      this.parent.set(id, id);
      this.data.set(id, {
        type: f.type,
        tiles: new Set([k]),
        shields: f.shield ? 1 : 0,
        open: f.sides.length,
        meeples: [],
        scored: false,
        at: { x, y },
      });
    });

    for (let s = 0; s < 4; s++) {
      const nb = this.neighbor(x, y, s);
      if (!nb) continue;
      const mine = this.featAt(cell, s);
      const theirs = this.featAt(nb, opposite(s));
      if (mine == null || theirs == null) continue; // field-to-field seam
      const root = this.union(`${k}#${mine}`, `${keyOf(nb.x, nb.y)}#${theirs}`);
      this.data.get(root).open -= 2; // both halves of the seam are now closed
    }
    return cell;
  }

  /** How many of the 8 surrounding cells are occupied. */
  surroundCount(x, y) {
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        if (this.cells.has(keyOf(x + dx, y + dy))) n++;
      }
    }
    return n;
  }

  /** Features closed by the tile just played at (x,y). Marks them scored. */
  completedBy(x, y) {
    const done = [];
    const cell = this.get(x, y);
    const roots = new Set();
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'monastery') roots.add(this.find(`${keyOf(x, y)}#${i}`));
    });
    for (const r of roots) {
      const d = this.data.get(r);
      if (d && !d.scored && d.open === 0) { d.scored = true; done.push(d); }
    }
    // A tile can complete a monastery anywhere in its 3x3 neighborhood.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.get(x + dx, y + dy);
        if (!c) continue;
        c.type.feats.forEach((f, i) => {
          if (f.type !== 'monastery') return;
          const d = this.data.get(this.find(`${keyOf(c.x, c.y)}#${i}`));
          if (d && !d.scored && this.surroundCount(c.x, c.y) === 8) { d.scored = true; done.push(d); }
        });
      }
    }
    return done;
  }

  /** Every distinct component still on the board. */
  allComponents() {
    const seen = new Set();
    const out = [];
    for (const id of this.parent.keys()) {
      const r = this.find(id);
      if (seen.has(r)) continue;
      seen.add(r);
      const d = this.data.get(r);
      if (d) out.push(d);
    }
    return out;
  }

  // --- scoring --------------------------------------------------------------

  /** Points a component is worth. `final` = end-of-game (incomplete) scoring. */
  value(d, final = false) {
    const n = d.tiles.size;
    if (d.type === 'city') return final ? n + d.shields : 2 * n + 2 * d.shields;
    if (d.type === 'road') return n;
    if (d.type === 'monastery') return 1 + this.surroundCount(d.at.x, d.at.y);
    return 0;
  }

  /** Players with the most meeples on a component (ties share full points). */
  majority(d) {
    const counts = new Map();
    for (const m of d.meeples) counts.set(m.player, (counts.get(m.player) || 0) + 1);
    let best = 0;
    for (const c of counts.values()) best = Math.max(best, c);
    return [...counts.entries()].filter(([, c]) => c === best).map(([p]) => p);
  }

  addMeeple(x, y, featIdx, player) {
    const cell = this.get(x, y);
    cell.meeple = { player, feat: featIdx };
    this.featureOf(x, y, featIdx).meeples.push({ player, x, y, feat: featIdx });
  }

  /** Pull meeples off a scored component and return them to their owners. */
  reclaim(d) {
    const out = [];
    for (const m of d.meeples) {
      const cell = this.get(m.x, m.y);
      if (cell) cell.meeple = null;
      out.push(m.player);
    }
    d.meeples = [];
    return out;
  }
}
