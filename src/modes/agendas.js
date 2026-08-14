// ---------------------------------------------------------------------------
// Hidden agendas — two secret objectives per player, scored at the end.
//
// The point isn't the points. It's that every placement becomes a tell, and
// blocking someone requires guessing what they're chasing. A perfect
// information game becomes one where you're reading people.
//
// Each agenda is a predicate over the finished board. Most of them look at
// components rather than tiles, so they cost nothing to evaluate.
// ---------------------------------------------------------------------------

import { keyOf } from '../board.js';

const comps = (board, type) => board.allComponents().filter((d) => d.type === type);

/** Did this player lay a run of `n` tiles in a straight line anywhere? */
function hasLine(board, player, n) {
  for (const cell of board.cells.values()) {
    if (cell.owner !== player) continue;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      let run = 1;
      for (let i = 1; i < n; i++) {
        const c = board.get(cell.x + dx * i, cell.y + dy * i);
        if (!c || c.owner !== player) break;
        run++;
      }
      if (run >= n) return true;
    }
  }
  return false;
}

const ownTiles = (board, player) =>
  [...board.cells.values()].filter((c) => c.owner === player);

export const AGENDAS = [
  {
    text: 'Close a road of six tiles or more', points: 8,
    test: (b) => comps(b, 'road').some((d) => d.open === 0 && d.tiles.size >= 6),
  },
  {
    text: 'Close a city of five tiles or more', points: 8,
    test: (b) => comps(b, 'city').some((d) => d.open === 0 && d.tiles.size >= 5),
  },
  {
    text: 'Complete two monasteries', points: 9,
    test: (b) => comps(b, 'monastery').filter((d) => b.surroundCount(d.at.x, d.at.y) === 8).length >= 2,
  },
  {
    text: 'Lay five of your tiles in a straight line', points: 7,
    test: (b, p) => hasLine(b, p, 5),
  },
  {
    text: 'Have two closed cities sharing an edge', points: 9,
    test: (b) => {
      for (const cell of b.cells.values()) {
        for (let s = 0; s < 4; s++) {
          const nb = b.neighbor(cell.x, cell.y, s);
          if (!nb) continue;
          const a = b.featAt(cell, s), c = b.featAt(nb, (s + 2) % 4);
          if (a == null || c == null) continue;
          const da = b.featureOf(cell.x, cell.y, a), dc = b.featureOf(nb.x, nb.y, c);
          if (!da || !dc || da === dc) continue;
          if (da.type === 'city' && dc.type === 'city' && da.open === 0 && dc.open === 0) return true;
        }
      }
      return false;
    },
  },
  {
    text: 'Place a tile at each of the four compass extremes', points: 10,
    test: (b, p) => {
      const mine = ownTiles(b, p);
      if (!mine.length) return false;
      const all = [...b.cells.values()];
      const at = (pick) => pick(all);
      const extremes = [
        at((l) => l.reduce((m, c) => (c.y < m.y ? c : m))),
        at((l) => l.reduce((m, c) => (c.y > m.y ? c : m))),
        at((l) => l.reduce((m, c) => (c.x < m.x ? c : m))),
        at((l) => l.reduce((m, c) => (c.x > m.x ? c : m))),
      ];
      return extremes.every((c) => c.owner === p);
    },
  },
  {
    text: 'Own a tile that touches four others', points: 6,
    test: (b, p) => ownTiles(b, p).some((c) => b.degree(c.x, c.y) === 4),
  },
  {
    text: 'Close three roads', points: 8,
    test: (b) => comps(b, 'road').filter((d) => d.open === 0).length >= 3,
  },
  {
    text: 'Leave a courtyard — an empty cell fully surrounded', points: 7,
    test: (b) => b.enclosedHoles().length > 0,
  },
  {
    text: 'Own six tiles that all touch another of yours', points: 7,
    test: (b, p) => {
      const mine = ownTiles(b, p);
      const set = new Set(mine.map((c) => keyOf(c.x, c.y)));
      const linked = mine.filter((c) => {
        for (let s = 0; s < 4; s++) {
          const nb = b.neighbor(c.x, c.y, s);
          if (nb && set.has(keyOf(nb.x, nb.y))) return true;
        }
        return false;
      });
      return linked.length >= 6;
    },
  },
];
