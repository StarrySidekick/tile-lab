// ---------------------------------------------------------------------------
// Polyomino pieces — a move that covers two to four cells at once.
//
// Pieces are GENERATED rather than authored. Hand-writing tetrominoes means
// hand-checking that every internal seam matches, which is exactly the kind of
// bookkeeping you get wrong for weeks. Instead we pick a shape and fill it by
// search: each cell takes a (type, rotation) that agrees with the piece-mates
// already placed beside it. Anything that comes out is valid by construction,
// and the variety is endless.
//
// A piece is {cells: [{dx, dy, type, rot}], w, h, name}. Placement legality,
// rotation and drawing all work off that one shape.
// ---------------------------------------------------------------------------

import { TILES, TILE_TYPES, SIDE_STEP, opposite } from './tiles.js';

/** Cell offsets, normalised so the top-left of the bounding box is (0,0). */
export const SHAPES = [
  { name: 'Domino',  cells: [[0, 0], [1, 0]] },
  { name: 'Bar',     cells: [[0, 0], [1, 0], [2, 0]] },
  { name: 'Elbow',   cells: [[0, 0], [1, 0], [0, 1]] },
  { name: 'Square',  cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'Tee',     cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
  { name: 'Ell',     cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
  { name: 'Ess',     cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
];

/** Edge letter a type presents on world side s when rotated by `rot`. */
const edgeOf = (type, rot, s) => type.edges[(s - rot + 4) % 4];

const norm = (cells) => {
  const minX = Math.min(...cells.map((c) => c.dx));
  const minY = Math.min(...cells.map((c) => c.dy));
  return cells.map((c) => ({ ...c, dx: c.dx - minX, dy: c.dy - minY }));
};

function shuffled(list, rng) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Fill a shape with tile types whose shared edges agree.
 * Greedy with a shuffled candidate list and a retry budget — the base set is
 * varied enough that this lands within a couple of attempts.
 */
function fillShape(shape, pool, rng, tries = 24) {
  const options = [];
  for (const type of pool) for (let rot = 0; rot < 4; rot++) options.push({ type, rot });

  for (let attempt = 0; attempt < tries; attempt++) {
    const placed = new Map();                    // "dx,dy" -> {type, rot}
    let ok = true;

    for (const [dx, dy] of shape.cells) {
      const candidates = shuffled(options, rng);
      const pick = candidates.find(({ type, rot }) => {
        for (let s = 0; s < 4; s++) {
          const [sx, sy] = SIDE_STEP[s];
          const mate = placed.get(`${dx + sx},${dy + sy}`);
          if (!mate) continue;                   // outside the piece, unconstrained
          if (edgeOf(type, rot, s) !== edgeOf(mate.type, mate.rot, opposite(s))) return false;
        }
        return true;
      });
      if (!pick) { ok = false; break; }
      placed.set(`${dx},${dy}`, pick);
    }

    if (!ok) continue;
    return norm(shape.cells.map(([dx, dy]) => {
      const { type, rot } = placed.get(`${dx},${dy}`);
      return { dx, dy, type, rot };
    }));
  }
  return null;
}

function bounds(cells) {
  return {
    w: Math.max(...cells.map((c) => c.dx)) + 1,
    h: Math.max(...cells.map((c) => c.dy)) + 1,
  };
}

/**
 * One random piece. Falls back through smaller shapes if a fill fails, and
 * finally to a plain single tile, so this never returns null.
 */
export function makePiece(rng = Math.random, groups = ['base']) {
  const on = new Set(groups);
  const pool = TILE_TYPES.filter((t) => on.has(t.group));
  // Uniform over shapes rather than "biggest that fits" — sorting by size made
  // the search succeed on a tetromino every single time, and a mode where
  // every piece is four cells is a much duller mode than the one intended.
  const order = shuffled(SHAPES, rng);

  for (const shape of order) {
    const cells = fillShape(shape, pool, rng);
    if (cells) return { name: shape.name, cells, ...bounds(cells) };
  }
  const type = pool[Math.floor(rng() * pool.length)];
  return { name: 'Single', cells: [{ dx: 0, dy: 0, type, rot: 0 }], w: 1, h: 1 };
}

/** A 1x1 wild tile that ignores edge matching — the hole-plugging resource. */
export function fillerPiece(id = 'X') {
  return { name: 'Filler', filler: true, w: 1, h: 1, cells: [{ dx: 0, dy: 0, type: TILES[id], rot: 0 }] };
}

/** Rotate a whole piece a quarter-turn clockwise, contents and all. */
export function rotatePiece(piece, dir = 1) {
  let cells = piece.cells;
  const turns = ((dir % 4) + 4) % 4;
  for (let t = 0; t < turns; t++) {
    cells = norm(cells.map((c) => ({ ...c, dx: -c.dy, dy: c.dx, rot: (c.rot + 1) & 3 })));
  }
  return { ...piece, cells, ...bounds(cells) };
}

/** Sanity check used by the atlas and the harness: do internal seams agree? */
export function validatePiece(piece) {
  const at = new Map(piece.cells.map((c) => [`${c.dx},${c.dy}`, c]));
  for (const c of piece.cells) {
    for (let s = 0; s < 4; s++) {
      const [dx, dy] = SIDE_STEP[s];
      const mate = at.get(`${c.dx + dx},${c.dy + dy}`);
      if (!mate) continue;
      if (edgeOf(c.type, c.rot, s) !== edgeOf(mate.type, mate.rot, opposite(s))) {
        return `seam mismatch at (${c.dx},${c.dy}) side ${s}`;
      }
    }
  }
  return null;
}
