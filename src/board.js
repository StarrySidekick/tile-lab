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

import {
  SIDE_STEP, opposite, CENTRE_FEATURES, CAP, DOCK, edgesMeet,
  HALVES_OF_SIDE, halfPartner,
} from './tiles.js';

export const keyOf = (x, y) => `${x},${y}`;

/**
 * What one follower counts for when a majority is worked out.
 *
 * Lives here rather than in mechanics.js because the board is the thing that
 * counts majorities and mechanics.js already imports the board — the arrow has
 * to point one way. The mayor is the interesting case: he is worth a follower
 * per coat of arms in the city he stands in, which means he is worth nothing
 * at all in a city that has none.
 */
export function meepleWeight(m, d) {
  if (m.big) return 2;
  if (m.kind === 'mayor') return d.shields || 0;
  // A shepherd stands in the field but holds none of it.
  if (m.kind === 'shepherd') return 0;
  return 1;
}

export class Board {
  constructor({ bounds = null } = {}) {
    this.cells = new Map();       // "x,y" -> cell (the TOP cell, if stacked)
    this.parent = new Map();      // "x,y#i" -> parent id
    this.data = new Map();        // root id -> component data
    this.scoredParts = new Set(); // "x,y#i" of features already paid out
    this.bounds = bounds;         // {minX,maxX,minY,maxY} or null for unbounded
    this.seq = 0;                 // placement counter, for replay order
    /**
     * Bumped by every mutation — placing, shifting, removing, replacing. It
     * exists so that anything deriving an expensive answer FROM the board can
     * cache it against a single integer instead of re-deriving it or hashing
     * the cells. Girando asks "which piece of country is this tile on" once
     * per visible tile per frame and once per candidate square per turn, and
     * without this that question walks every cell on the board every time.
     */
    this.version = 0;
    this.links = [];              // extra unions (tunnels) that survive a rebuild
    this.hops = [];               // one-square road hops a follower may cross
    this.linked = new Set();      // cells already wired this rebuild — see link()
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

  /**
   * Index of the field showing at world half-edge h, or null if that half is
   * city or the tile has no fields. Rotating a tile a quarter-turn clockwise
   * moves every half-edge two places round the ring, which is the only thing
   * that has to be undone to ask the tile about itself.
   */
  fieldAt(cell, h) {
    const c = (h - 2 * cell.rot + 8) % 8;
    const i = cell.type.feats.findIndex((f) => f.type === 'field' && f.halves.includes(c));
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
   *   onto   a set of cell keys the placement must touch orthogonally. This is
   *          how Girando says "you may only build on the mainland": everything
   *          adrift is still on the board, still blowable, still scoring — it
   *          just can't be reached with a tile in your hand.
   */
  canPlace(x, y, type, rot, { free = false, cover = false, onto = null } = {}) {
    if (!this.inBounds(x, y)) return false;
    if (this.cells.has(keyOf(x, y)) && !cover) return false;
    if (onto && this.size > 0) {
      let reaches = false;
      for (let s = 0; s < 4 && !reaches; s++) {
        const nb = this.neighbor(x, y, s);
        if (nb && onto.has(keyOf(nb.x, nb.y))) reaches = true;
      }
      if (!reaches) return false;
    }
    if (free) return true;
    const probe = { x, y, type, rot };
    let touches = 0;
    for (let s = 0; s < 4; s++) {
      const nb = this.neighbor(x, y, s);
      if (!nb) continue;
      touches++;
      if (!edgesMeet(this.edgeAt(probe, s), this.edgeAt(nb, opposite(s)))) return false;
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

  /** Which feature index on this cell belongs to component d, or null. */
  featIndexOn(cell, d) {
    const root = this.find(d.parts[0]);
    for (let i = 0; i < cell.type.feats.length; i++) {
      const id = `${keyOf(cell.x, cell.y)}#${i}`;
      if (this.parent.has(id) && this.find(id) === root) return i;
    }
    return null;
  }

  /**
   * Join two features that never touch — a tunnel. Remembered, because a
   * rebuild replays only what adjacency can see. Neither mouth is an open
   * edge, so the joined road still completes by its outward ends alone.
   */
  addLink(a, b) {
    this.links.push([a, b]);
    if (this.parent.has(a) && this.parent.has(b)) this.union(a, b);
  }

  /** Wire one already-placed cell into the union-find. */
  link(cell) {
    const { x, y } = cell;
    const k = keyOf(x, y);
    this.linked.add(cell);
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
      const myEdge = this.edgeAt(cell, s);
      const theirEdge = this.edgeAt(nb, opposite(s));
      const id = `${keyOf(nb.x, nb.y)}#${theirs}`;
      // During a rebuild the neighbours are replayed in placement order, so a
      // later one isn't wired up yet — it'll make this same join from its side.
      const wired = this.parent.has(id);
      // …and the same question asked of the TILE rather than of one feature on
      // it, which is what a wildcard needs: an Abbazia has no features at all,
      // so `id` is "x,y#null" and `wired` can never be true for it. That made a
      // cap depend on which of the two tiles happened to be laid first — an
      // Abbazia put down BEFORE the road it caps never capped it, and the road
      // could never finish.
      const here = this.linked.has(nb);

      // A dock edge does neither: a ship moored against a road leaves the road
      // exactly as open as it found it. It is the one edge in the game that is
      // purely a fitting rule and not a connectivity one.
      if (myEdge === DOCK || theirEdge === DOCK) continue;

      // A wildcard edge CAPS rather than joins: the feature on the other side
      // loses that open slot and can finish against nothing.
      //
      // Whichever of the pair is linked SECOND does the closing — `wired` is
      // the test for that — so a cap is applied exactly once however the board
      // was built. Without the guard a rebuild double-counts it, and a road
      // with an Abbazia at each end never re-opens when one blows away.
      if (theirEdge === CAP) {
        if (mine != null && here) this.data.get(this.find(`${k}#${mine}`)).open -= 1;
        continue;
      }
      if (myEdge === CAP) {
        if (theirs != null && here) this.data.get(this.find(id)).open -= 1;
        continue;
      }

      if (mine == null || theirs == null) continue; // field-to-field seam
      // Placement guarantees matching edges, but the wind doesn't: it can
      // shove a road up against a city wall. A mismatched seam joins nothing
      // and closes nothing — both features stay open, facing a wall they can
      // never finish against, until something moves again.
      if (myEdge !== theirEdge) continue;
      if (!wired) continue;
      const root = this.union(`${k}#${mine}`, id);
      this.data.get(root).open -= 2; // both halves of the seam are now closed
    }

    this.linkFields(cell);
  }

  /**
   * Join this tile's fields to its neighbours'. Separate from the pass above
   * because fields meet along HALF an edge, not a whole one: the two halves of
   * one seam can belong to two different fields on each side, which is exactly
   * what a road running out to the tile edge does.
   *
   * Nothing here touches `open`. A field is never finished and never scores
   * during play — the farmers on it stay where they are until the game ends.
   */
  linkFields(cell) {
    const k = keyOf(cell.x, cell.y);
    for (let s = 0; s < 4; s++) {
      const nb = this.neighbor(cell.x, cell.y, s);
      if (!nb || nb === cell) continue;
      for (const h of HALVES_OF_SIDE[s]) {
        const mine = this.fieldAt(cell, h);
        const theirs = this.fieldAt(nb, halfPartner(h));
        if (mine == null || theirs == null) continue;
        const id = `${keyOf(nb.x, nb.y)}#${theirs}`;
        if (!this.parent.has(id)) continue;      // replayed later; it'll join from its side
        this.union(`${k}#${mine}`, id);
      }
    }
  }

  /**
   * Throw away all connectivity and replay the visible cells in placement
   * order. Called after any removal, cover or flip.
   */
  rebuild() {
    this.parent.clear();
    this.data.clear();
    this.linked.clear();
    const order = [...this.cells.values()].sort((a, b) => a.seq - b.seq);
    for (const cell of order) this.link(cell);
    this.roadHops();
    // The tunnels: unions between parts that are nowhere near each other, so
    // the adjacency replay above can't rediscover them. A link whose end was
    // lifted or blown away just goes quiet until the tile comes back.
    for (const [a, b] of this.links) {
      if (this.parent.has(a) && this.parent.has(b)) this.union(a, b);
    }
    for (const cell of order) {
      if (!cell.meeple) continue;
      // A follower with no feature is lying on the tile rather than holding
      // anything — the wind put it there. It stays where it is and counts for
      // nobody until something it can stand in arrives underneath it.
      if (cell.meeple.feat == null) continue;
      const d = this.featureOf(cell.x, cell.y, cell.meeple.feat);
      if (d) d.meeples.push({ ...cell.meeple, x: cell.x, y: cell.y });
      else cell.meeple = null;         // the feature it sat on no longer exists
    }
    for (const d of this.allComponents()) {
      if (d.parts.some((p) => this.scoredParts.has(p))) d.scored = true;
    }
  }

  /**
   * ROAD HOPS. A road that runs off one tile, across one empty square, and
   * straight on out of the tile beyond is a road a FOLLOWER CAN CROSS. It is
   * not one road: the two halves score separately, and there is nothing
   * standing in the gap.
   *
   * There used to be a plank drawn across it and the two halves scored as one,
   * on the argument that roads are the most weather-fragile thing on the board
   * — a gust cuts one and the halves can never rejoin, because `link` refuses a
   * seam whose edges disagree — and were paid by exactly the quantity the
   * weather destroys. The bridge gave them the length a single shove took away,
   * and it looked like a plank floating in mid-air, which is what it was. The
   * WALK is the half of it worth keeping: a figure can step across one square
   * of open sky, and a road you can walk is enough of a road.
   *
   * STRAIGHT ONLY, and only across ONE square: the road has to leave the near
   * tile on the same axis it enters the far one. Recorded as pairs of part ids
   * rather than resolved roots, because a walk asks about them long after this
   * pass has finished and the union-find has moved on.
   *
   * Rebuilt from scratch with everything else, so a hop appears and disappears
   * as the weather opens and closes the gap under it.
   */
  roadHops() {
    this.hops = [];
    for (const cell of this.cells.values()) {
      // Only two of the four directions, or every hop is found twice.
      for (const s of [1, 2]) {
        if (this.edgeAt(cell, s) !== 'r') continue;
        const [dx, dy] = SIDE_STEP[s];
        if (this.cells.has(keyOf(cell.x + dx, cell.y + dy))) continue;   // no gap
        const far = this.get(cell.x + dx * 2, cell.y + dy * 2);
        if (!far || this.edgeAt(far, opposite(s)) !== 'r') continue;
        const mine = this.featAt(cell, s);
        const theirs = this.featAt(far, opposite(s));
        if (mine == null || theirs == null) continue;
        const a = `${keyOf(cell.x, cell.y)}#${mine}`;
        const b = `${keyOf(far.x, far.y)}#${theirs}`;
        if (!this.parent.has(a) || !this.parent.has(b)) continue;
        if (this.find(a) === this.find(b)) continue;      // already one road
        this.hops.push({ a, b });
      }
    }
  }

  /**
   * Every road component a walker can reach from this one, itself included,
   * following hops as far as they go. Roots, because that is what a caller has
   * and what it can compare against.
   */
  hopsFrom(root) {
    const out = new Set([root]);
    if (!this.hops.length) return out;
    const queue = [root];
    while (queue.length) {
      const at = queue.pop();
      for (const { a, b } of this.hops) {
        if (!this.parent.has(a) || !this.parent.has(b)) continue;
        const ra = this.find(a), rb = this.find(b);
        const other = ra === at ? rb : rb === at ? ra : null;
        if (other == null || out.has(other)) continue;
        out.add(other);
        queue.push(other);
      }
    }
    return out;
  }

  /**
   * Place a tile. Assumes canPlace() already said yes.
   *   over   stack on top of whatever is here (Strata), keeping it underneath
   */
  place(x, y, type, rot, { over = false, owner = null } = {}) {
    this.version++;
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
    if (under) {
      this.rebuild();
    } else {
      this.link(cell);
      // A placement can complete a hop as readily as a removal can — the tile
      // you just laid may be the far end of one. Without this a board only
      // grew hops after something forced a rebuild, so the same two tiles were
      // walkable or not depending on how they got there.
      this.roadHops();
    }
    return cell;
  }

  /**
   * Slide a tile one cell over, keeping everything about it — who laid it,
   * who's standing on it, whether it's anchored, and its place in the
   * placement order, so a rebuild still replays the board in the order it was
   * built. The target must be empty; resolving collisions is the caller's job,
   * and so is calling `rebuild()` once the dust settles.
   *
   * This is the one operation that can produce a board no sequence of
   * placements could: tiles touching only at the corners, and seams whose
   * edges disagree.
   */
  shift(from, to) {
    this.version++;
    const fromKey = keyOf(from.x, from.y);
    const toKey = keyOf(to.x, to.y);
    const cell = this.cells.get(fromKey);
    if (!cell || this.cells.has(toKey)) return null;
    this.cells.delete(fromKey);
    for (const f of cell.type.feats.keys()) {
      if (this.scoredParts.delete(`${fromKey}#${f}`)) this.scoredParts.add(`${toKey}#${f}`);
    }
    cell.x = to.x;
    cell.y = to.y;
    this.cells.set(toKey, cell);
    return cell;
  }

  /** Is anything at all in the eight cells around this one? Corners count. */
  touching(x, y) { return this.surroundCount(x, y) > 0; }

  /**
   * Lift the top tile off a cell. Returns the removed cell, or null.
   * If something was underneath it resurfaces.
   *
   * `quiet` skips the rebuild, for a caller taking several tiles off in one go
   * and rebuilding once at the end. Rebuilding is a full replay of the board's
   * connectivity, so doing it per tile in a loop is the difference between a
   * storm costing microseconds and costing milliseconds — the wind can shed a
   * dozen tiles in one gust.
   */
  remove(x, y, { quiet = false } = {}) {
    this.version++;
    const k = keyOf(x, y);
    const cell = this.cells.get(k);
    if (!cell) return null;
    if (cell.under) this.cells.set(k, cell.under); else this.cells.delete(k);
    for (const f of cell.type.feats.keys()) this.scoredParts.delete(`${k}#${f}`);
    if (!quiet) this.rebuild();
    return cell;
  }

  /** Swap a placed tile for another type/rotation in situ (two-faced tiles). */
  replace(x, y, type, rot = null) {
    this.version++;
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

  /**
   * The board as separate pieces of country, biggest first. Orthogonal only:
   * two tiles touching at a corner are held up by each other but are not the
   * same island, which is exactly the distinction Girando scores on.
   */
  groups() {
    return this.regions(() => true).sort((a, b) => b.length - a.length);
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

  /**
   * Un-finish a feature. Only one thing does this: an Abbazia that was capping
   * something blows away, and what it was capping is open country again — and
   * can be finished, and paid for, a second time.
   */
  unmark(d) {
    d.scored = false;
    for (const p of d.parts) this.scoredParts.delete(p);
  }

  /** Features closed by the tile just played at (x,y). Marks them scored. */
  completedBy(x, y) {
    const done = [];
    const cell = this.get(x, y);
    if (!cell) return done;
    const roots = new Set();
    cell.type.feats.forEach((f, i) => {
      if (!CENTRE_FEATURES.has(f.type)) roots.add(this.find(`${keyOf(x, y)}#${i}`));
    });
    for (const r of roots) {
      const d = this.data.get(r);
      // A field reaches no side, so its `open` is 0 from the moment it is
      // laid. That is not a completed feature — it is a feature that never
      // completes, and only the final scoring ever looks at it.
      if (d && d.type !== 'field' && !d.scored && d.open === 0) { this.markScored(d); done.push(d); }
    }
    // A tile can complete a monastery anywhere in its 3x3 neighborhood.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.get(x + dx, y + dy);
        if (!c) continue;
        c.type.feats.forEach((f, i) => {
          if (!CENTRE_FEATURES.has(f.type)) return;
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

  /**
   * Points a component is worth. `final` = end-of-game (incomplete) scoring.
   *
   * A forest deliberately ignores `final`: it has no complete/incomplete
   * distinction, it's simply as big as it is. Lakes and rivers are worth
   * nothing on their own — they pay through the cities beside them.
   */
  value(d, final = false, { pennants = true } = {}) {
    const n = d.tiles.size;
    const shields = pennants ? d.shields : 0;
    if (d.type === 'city') return final ? n + shields : 2 * n + 2 * shields;
    if (d.type === 'road') return n;
    if (d.type === 'monastery' || d.type === 'garden') return 1 + this.surroundCount(d.at.x, d.at.y);
    if (d.type === 'forest') return n + d.shields;
    return 0;
  }

  /** Every tile of a component, as cells. */
  cellsOf(d) {
    const out = [];
    for (const k of d.tiles) {
      const [x, y] = k.split(',').map(Number);
      const c = this.get(x, y);
      if (c) out.push(c);
    }
    return out;
  }

  /**
   * Distinct bodies of water touching a component, by type. A city beside a
   * lake is worth more, and this is what counts the "beside".
   */
  adjacentWater(d) {
    const bodies = { lake: new Set(), river: new Set() };
    for (const cell of this.cellsOf(d)) {
      for (let s = 0; s < 4; s++) {
        const nb = this.neighbor(cell.x, cell.y, s);
        if (!nb) continue;
        nb.type.feats.forEach((f, i) => {
          if (f.type !== 'lake' && f.type !== 'river') return;
          bodies[f.type].add(this.find(`${keyOf(nb.x, nb.y)}#${i}`));
        });
      }
    }
    return { lakes: bodies.lake.size, rivers: bodies.river.size };
  }

  /** Marks carried anywhere on a component — inns, cathedrals, trade goods. */
  marksOn(d) {
    const root = this.find(d.parts[0]);
    const out = [];
    for (const cell of this.cellsOf(d)) {
      cell.type.marks.forEach((m, i) => {
        // Only marks anchored to a feature belong to it; a landmark sitting at
        // the tile centre belongs to the tile, not to the road running past it.
        if (m.on == null) return;
        if (this.find(`${keyOf(cell.x, cell.y)}#${m.on}`) !== root) return;
        out.push({ ...m, x: cell.x, y: cell.y, index: i });
      });
    }
    return out;
  }

  /** A gap enclosed on all four sides — the only place an Abbey may go. */
  isEnclosedGap(x, y) {
    return !this.cells.has(keyOf(x, y)) && this.inBounds(x, y) && this.degree(x, y) === 4;
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

  /**
   * Players with the most followers on a component (ties share full points).
   * A big follower counts as two, which is the whole of what it does.
   */
  majority(d, { hills = false } = {}) {
    const counts = new Map();
    for (const m of d.meeples) {
      counts.set(m.player, (counts.get(m.player) || 0) + meepleWeight(m, d));
    }
    let best = 0;
    for (const c of counts.values()) best = Math.max(best, c);
    // A figure can be worth nothing — a mayor in a city with no coat of arms
    // is the whole gamble of the piece — and nobody wins a majority with 0.
    if (best <= 0) return [];
    let tied = [...counts.entries()].filter(([, c]) => c === best).map(([p]) => p);
    // Hills settle ties: among the tied, whoever has more followers standing
    // on high ground takes the feature alone. Still tied on hills, all score.
    if (hills && tied.length > 1) {
      const high = new Map(tied.map((p) => [p, 0]));
      for (const m of d.meeples) {
        if (!high.has(m.player)) continue;
        const cell = this.get(m.x, m.y);
        if (cell?.type.marks.some((k) => k.kind === 'hillmark')) high.set(m.player, high.get(m.player) + 1);
      }
      const top = Math.max(...high.values());
      if (top > 0) tied = tied.filter((p) => high.get(p) === top);
    }
    return tied;
  }

  /**
   * A follower placed on a feature. `kind` is which piece it is; the plain
   * ones have no kind at all.
   */
  addMeeple(x, y, featIdx, player, opts = false) {
    // The old signature took a bare `big` boolean, and modes still call it.
    const o = typeof opts === 'object' && opts !== null ? opts : { big: !!opts };
    const m = { player, feat: featIdx, big: !!o.big, kind: o.kind || null };
    const cell = this.get(x, y);
    cell.meeple = m;
    this.featureOf(x, y, featIdx).meeples.push({ ...m, x, y });
  }

  /** Pull followers off a scored component and hand them back to their owners. */
  reclaim(d) {
    const out = [];
    for (const m of d.meeples) {
      const cell = this.get(m.x, m.y);
      if (cell) cell.meeple = null;
      out.push(m);
    }
    d.meeples = [];
    return out;
  }
}
