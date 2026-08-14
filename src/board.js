// ---------------------------------------------------------------------------
// Board state, placement legality, and feature connectivity.
//
// Every (tile, featureIndex) pair is a node in a union-find. When two tiles
// meet, the features that touch across that edge get merged. Each merged
// component tracks how many edge-slots are still hanging open; when that hits
// zero the feature is closed and scores.
//
// Union-find can't split, so REMOVING a tile can't be incremental. It doesn't
// need to be: `cells` is the source of truth and connectivity is recomputable.
// `rebuild()` throws the components away and replays every visible cell in
// placement order — O(n) with n in the low hundreds, which is free at this
// scale. That one primitive is what lets tiles be lifted (Cirrus), covered
// (Strata), flipped (two-faced) and drowned (rising tide).
//
// Two pieces of state have to survive a rebuild, so neither lives on the
// component: meeples live on their cell, and "already scored" lives in
// `scoredParts` as a set of cell-feature keys.
// ---------------------------------------------------------------------------

import { SIDE_STEP, opposite } from './tiles.js';

export const keyOf = (x, y) => `${x},${y}`;

export class Board {
  constructor({ bounds = null } = {}) {
    this.cells = new Map();       // "x,y" -> cell (the TOP cell, if stacked)
    this.parent = new Map();      // "x,y#i" -> parent id
    this.data = new Map();        // root id -> component data
    this.scoredParts = new Set(); // "x,y#i" of features already paid out
    this.bounds = bounds;         // {minX,maxX,minY,maxY} or null for unbounded
    this.seq = 0;                 // placement counter, for replay order
  }

  get(x, y) { return this.cells.get(keyOf(x, y)); }
  get size() { return this.cells.size; }

  inBounds(x, y) {
    const b = this.bounds;
    return !b || (x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY);
  }

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

  /** How many of the 4 orthogonal neighbours are occupied. */
  degree(x, y) {
    let n = 0;
    for (let s = 0; s < 4; s++) if (this.neighbor(x, y, s)) n++;
    return n;
  }

  // --- placement rules ------------------------------------------------------

  /**
   * Can `type` at rotation `rot` legally go at (x,y)?
   *   free   ignore edge matching entirely (sandbox)
   *   cover  the cell may already be occupied (Strata builds on top)
   */
  canPlace(x, y, type, rot, { free = false, cover = false } = {}) {
    if (!this.inBounds(x, y)) return false;
    if (this.cells.has(keyOf(x, y)) && !cover) return false;
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

  /** Every empty in-bounds cell adjacent to something placed. */
  frontier() {
    const out = new Map();
    for (const cell of this.cells.values()) {
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        const nx = cell.x + dx, ny = cell.y + dy;
        const k = keyOf(nx, ny);
        if (!this.cells.has(k) && this.inBounds(nx, ny)) out.set(k, { x: nx, y: ny });
      }
    }
    return [...out.values()];
  }

  /** Candidate cells for a placement — the frontier, plus occupied if covering. */
  candidates(opts = {}) {
    if (this.size === 0) return [{ x: 0, y: 0 }];
    const out = this.frontier();
    if (opts.cover) for (const c of this.cells.values()) out.push({ x: c.x, y: c.y });
    return out;
  }

  /** All (x, y, rot) a tile type could legally occupy right now. */
  legalPlacements(type, opts = {}) {
    const out = [];
    for (const { x, y } of this.candidates(opts)) {
      for (let rot = 0; rot < 4; rot++) {
        if (this.canPlace(x, y, type, rot, opts)) out.push({ x, y, rot });
      }
    }
    return out;
  }

  hasAnyPlacement(type, opts = {}) {
    for (const { x, y } of this.candidates(opts)) {
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
    da.parts.push(...db.parts);
    this.parent.set(b, a);
    this.data.delete(b);
    return a;
  }

  featureOf(x, y, i) { return this.data.get(this.find(`${keyOf(x, y)}#${i}`)); }

  /** Wire one already-placed cell into the union-find. */
  link(cell) {
    const { x, y } = cell;
    const k = keyOf(x, y);
    cell.type.feats.forEach((f, i) => {
      const id = `${k}#${i}`;
      this.parent.set(id, id);
      this.data.set(id, {
        type: f.type,
        tiles: new Set([k]),
        parts: [id],
        shields: f.shield ? 1 : 0,
        open: f.sides.length,
        meeples: [],
        scored: this.scoredParts.has(id),
        at: { x, y },
      });
    });

    for (let s = 0; s < 4; s++) {
      const nb = this.neighbor(x, y, s);
      if (!nb || nb === cell) continue;
      const mine = this.featAt(cell, s);
      const theirs = this.featAt(nb, opposite(s));
      if (mine == null || theirs == null) continue; // field-to-field seam
      const id = `${keyOf(nb.x, nb.y)}#${theirs}`;
      // During a rebuild the neighbours are replayed in placement order, so a
      // later one isn't wired up yet — it'll make this same join from its side.
      if (!this.parent.has(id)) continue;
      const root = this.union(`${k}#${mine}`, id);
      this.data.get(root).open -= 2; // both halves of the seam are now closed
    }
  }

  /**
   * Throw away all connectivity and replay the visible cells in placement
   * order. Called after any removal, cover or flip.
   */
  rebuild() {
    this.parent.clear();
    this.data.clear();
    const order = [...this.cells.values()].sort((a, b) => a.seq - b.seq);
    for (const cell of order) this.link(cell);
    for (const cell of order) {
      if (!cell.meeple) continue;
      const d = this.featureOf(cell.x, cell.y, cell.meeple.feat);
      if (d) d.meeples.push({ player: cell.meeple.player, x: cell.x, y: cell.y, feat: cell.meeple.feat });
      else cell.meeple = null;         // the feature it sat on no longer exists
    }
    for (const d of this.allComponents()) {
      if (d.parts.some((p) => this.scoredParts.has(p))) d.scored = true;
    }
  }

  /**
   * Place a tile. Assumes canPlace() already said yes.
   *   over   stack on top of whatever is here (Strata), keeping it underneath
   */
  place(x, y, type, rot, { over = false, owner = null } = {}) {
    const k = keyOf(x, y);
    const under = over ? this.cells.get(k) || null : null;
    const cell = {
      x, y, type, rot,
      meeple: null,
      seq: this.seq++,
      owner,                 // who laid it — banners, foundations, drift
      under,
      h: under ? under.h + 1 : 0,
    };
    this.cells.set(k, cell);
    if (under) this.rebuild(); else this.link(cell);
    return cell;
  }

  /**
   * Lift the top tile off a cell. Returns the removed cell, or null.
   * If something was underneath it resurfaces.
   */
  remove(x, y) {
    const k = keyOf(x, y);
    const cell = this.cells.get(k);
    if (!cell) return null;
    if (cell.under) this.cells.set(k, cell.under); else this.cells.delete(k);
    for (const f of cell.type.feats.keys()) this.scoredParts.delete(`${k}#${f}`);
    this.rebuild();
    return cell;
  }

  /** Swap a placed tile for another type/rotation in situ (two-faced tiles). */
  replace(x, y, type, rot = null) {
    const cell = this.cells.get(keyOf(x, y));
    if (!cell) return null;
    cell.type = type;
    if (rot != null) cell.rot = rot;
    this.rebuild();
    return cell;
  }

  /** Would the board still be one connected mass without the cell at (x,y)? */
  staysConnected(x, y) {
    const k = keyOf(x, y);
    if (!this.cells.has(k)) return true;
    const remaining = [...this.cells.keys()].filter((c) => c !== k);
    if (remaining.length <= 1) return true;
    const seen = new Set([remaining[0]]);
    const queue = [remaining[0]];
    while (queue.length) {
      const [cx, cy] = queue.pop().split(',').map(Number);
      for (const [dx, dy] of SIDE_STEP) {
        const nk = keyOf(cx + dx, cy + dy);
        if (nk === k || seen.has(nk) || !this.cells.has(nk)) continue;
        seen.add(nk);
        queue.push(nk);
      }
    }
    return seen.size === remaining.length;
  }

  /** Connected runs of cells passing `sameGroup`, as arrays of cells. */
  regions(sameGroup) {
    const seen = new Set();
    const out = [];
    for (const start of this.cells.values()) {
      if (seen.has(keyOf(start.x, start.y))) continue;
      const group = [];
      const queue = [start];
      seen.add(keyOf(start.x, start.y));
      while (queue.length) {
        const cur = queue.pop();
        group.push(cur);
        for (let s = 0; s < 4; s++) {
          const nb = this.neighbor(cur.x, cur.y, s);
          if (!nb || seen.has(keyOf(nb.x, nb.y)) || !sameGroup(cur, nb)) continue;
          seen.add(keyOf(nb.x, nb.y));
          queue.push(nb);
        }
      }
      out.push(group);
    }
    return out;
  }

  /** Empty cells fully surrounded by tiles — courtyards, for Sprawl. */
  enclosedHoles() {
    if (this.size === 0) return [];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of this.cells.values()) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    minX--; maxX++; minY--; maxY++;          // a one-cell moat of guaranteed outside
    const outside = new Set();
    const queue = [[minX, minY]];
    outside.add(keyOf(minX, minY));
    while (queue.length) {
      const [cx, cy] = queue.pop();
      for (const [dx, dy] of SIDE_STEP) {
        const nx = cx + dx, ny = cy + dy;
        const nk = keyOf(nx, ny);
        if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
        if (outside.has(nk) || this.cells.has(nk)) continue;
        outside.add(nk);
        queue.push([nx, ny]);
      }
    }
    const holes = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const k = keyOf(x, y);
        if (!this.cells.has(k) && !outside.has(k)) holes.push({ x, y });
      }
    }
    return holes;
  }

  // --- multi-cell pieces ----------------------------------------------------

  /**
   * A piece is a list of {dx, dy, type, rot} offsets played as one move.
   * Legality is all-or-nothing: every cell empty and in bounds, every external
   * edge matching, at least one contact with the board. Internal seams are
   * pre-matched when the piece is built, so they need no check here.
   */
  canPlacePiece(px, py, piece, { free = false } = {}) {
    const taken = new Set(piece.cells.map((c) => keyOf(px + c.dx, py + c.dy)));
    if (taken.size !== piece.cells.length) return false;
    for (const c of piece.cells) {
      const x = px + c.dx, y = py + c.dy;
      if (!this.inBounds(x, y) || this.cells.has(keyOf(x, y))) return false;
    }
    if (free) return true;
    let touches = 0;
    for (const c of piece.cells) {
      const x = px + c.dx, y = py + c.dy;
      const probe = { x, y, type: c.type, rot: c.rot };
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        if (taken.has(keyOf(x + dx, y + dy))) continue;   // internal seam
        const nb = this.neighbor(x, y, s);
        if (!nb) continue;
        touches++;
        if (this.edgeAt(probe, s) !== this.edgeAt(nb, opposite(s))) return false;
      }
    }
    return touches > 0 || this.size === 0;
  }

  placePiece(px, py, piece, opts = {}) {
    const laid = [];
    for (const c of piece.cells) laid.push(this.place(px + c.dx, py + c.dy, c.type, c.rot, opts));
    return laid;
  }

  legalPiecePlacements(piece, opts = {}) {
    const out = [];
    const seen = new Set();
    const cells = this.size === 0 ? [{ x: 0, y: 0 }] : this.frontier();
    for (const { x, y } of cells) {
      for (const c of piece.cells) {
        const px = x - c.dx, py = y - c.dy;
        const k = keyOf(px, py);
        if (seen.has(k)) continue;
        seen.add(k);
        if (this.canPlacePiece(px, py, piece, opts)) out.push({ x: px, y: py });
      }
    }
    return out;
  }

  hasAnyPiecePlacement(piece, opts = {}) {
    return this.legalPiecePlacements(piece, opts).length > 0;
  }

  // --- completion -----------------------------------------------------------

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

  markScored(d) {
    d.scored = true;
    for (const p of d.parts) this.scoredParts.add(p);
  }

  /** Features closed by the tile just played at (x,y). Marks them scored. */
  completedBy(x, y) {
    const done = [];
    const cell = this.get(x, y);
    if (!cell) return done;
    const roots = new Set();
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'monastery') roots.add(this.find(`${keyOf(x, y)}#${i}`));
    });
    for (const r of roots) {
      const d = this.data.get(r);
      if (d && !d.scored && d.open === 0) { this.markScored(d); done.push(d); }
    }
    // A tile can complete a monastery anywhere in its 3x3 neighborhood.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.get(x + dx, y + dy);
        if (!c) continue;
        c.type.feats.forEach((f, i) => {
          if (f.type !== 'monastery') return;
          const d = this.data.get(this.find(`${keyOf(c.x, c.y)}#${i}`));
          if (d && !d.scored && this.surroundCount(c.x, c.y) === 8) { this.markScored(d); done.push(d); }
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

  /** Mean stack height of a component's tiles, for Strata. */
  meanHeight(d) {
    let sum = 0;
    for (const k of d.tiles) {
      const [x, y] = k.split(',').map(Number);
      const c = this.get(x, y);
      sum += c ? c.h : 0;
    }
    return sum / d.tiles.size;
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
