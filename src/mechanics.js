// ---------------------------------------------------------------------------
// Mechanics — rules you can switch on à la carte, in any mode.
//
// Anything a single mode invented that turns out to be interesting on its own
// belongs here rather than locked inside that mode: lifting placed tiles came
// out of Cirrus, building on top came out of Strata, and both are more useful
// as things you can bolt onto Classic — or onto each other.
//
// The rest are real Carcassonne expansion rules, implemented as faithfully as
// a prototype wants to be. Where a rule needs a decision the UI can't ask for
// yet, the code takes the obvious option and says so in a comment.
//
// Each entry is data: an id, a name, a note for the tooltip, and the tile
// groups it needs (which the UI switches on with it). The behaviour lives in
// game.js and board.js — this file is the catalogue and the shared helpers.
// ---------------------------------------------------------------------------

import { keyOf } from './board.js';
import { SIDE_STEP, MARKS, NO_MEEPLE } from './tiles.js';

export const MECHANIC_GROUPS = [
  { id: 'play', name: 'Play' },
  { id: 'scoring', name: 'Scoring' },
  { id: 'expansions', name: 'Carcassonne expansions' },
];

export const MECHANICS = [
  // --- play -----------------------------------------------------------------
  {
    id: 'market', group: 'play', name: 'Drafting market',
    note: 'Choose from a face-up row instead of drawing blind. Taking a later tile discards the ones before it.',
  },
  {
    id: 'lift', group: 'play', name: 'Lift placed tiles',
    note: 'Instead of placing, pick up an unclaimed tile that isn\'t holding the board together, and play it somewhere better.',
  },
  {
    id: 'stack', group: 'play', name: 'Build on top of tiles',
    note: "Strata's rule, anywhere. Cover a tile that hasn't scored and has nobody on it. Three levels maximum.",
  },
  {
    id: 'recall', group: 'play', name: 'Recall a follower',
    note: 'Instead of claiming, take one of your followers back off the board.',
  },
  {
    id: 'wagon', group: 'play', name: 'Followers walk on',
    note: 'Abbey & Mayor’s wagon. When a feature scores, a follower on it steps along the road to the next unclaimed, unfinished thing instead of going home.',
  },
  {
    id: 'twoFaced', group: 'play', name: 'Two-faced tiles',
    note: 'Most tiles have a reverse — a road is a city on the back. Press F before you place.',
  },
  {
    id: 'fog', group: 'play', name: 'Fog of war',
    note: 'Tiles far from your figures fade out.',
  },

  // --- scoring --------------------------------------------------------------
  {
    id: 'agendas', group: 'scoring', name: 'Hidden agendas',
    note: 'Two secret objectives each, scored at the end. Every placement becomes a tell.',
  },
  {
    id: 'tide', group: 'scoring', name: 'Rising tide',
    note: 'A waterline climbs the board every three rounds, drowning whatever it reaches.',
  },
  {
    id: 'king', group: 'scoring', name: 'King & Robber Baron',
    note: 'Whoever finished the largest city, and the longest road, each score 1 per completed city / road on the board at the end.',
  },

  // --- expansions -----------------------------------------------------------
  {
    id: 'river', group: 'expansions', name: 'The River',
    note: 'Carcassonne’s mini-expansion. The river is laid first, spring to lake, and may not double back on itself. Then the game proper starts around it.',
  },
  {
    id: 'inns', group: 'expansions', name: 'Inns & Cathedrals',
    note: 'An inn doubles its road, a cathedral triples its city — and both pay nothing at all if the feature never closes.',
    groups: ['innscath'],
  },
  {
    id: 'bigMeeple', group: 'expansions', name: 'Big follower',
    note: 'One large follower each, counting as two when majorities are worked out.',
  },
  {
    id: 'abbey', group: 'expansions', name: 'Abbey tile',
    note: 'One abbey each, played instead of your tile into a hole surrounded on all four sides. It scores as a monastery, so it is always worth 9.',
  },
  {
    id: 'builder', group: 'expansions', name: 'Builder',
    note: 'Extend a feature you already have a follower on and you get another tile this turn. Once per turn.',
    groups: [],
  },
  {
    id: 'goods', group: 'expansions', name: 'Trade goods',
    note: 'Wine, grain and cloth go to whoever closes the city holding them. Most of each at the end is worth 10.',
    groups: ['traders'],
  },
];

export const MECHANIC_BY_ID = Object.fromEntries(MECHANICS.map((m) => [m.id, m]));

/** Tile groups that switching a mechanic on should switch on too. */
export function groupsFor(active) {
  const out = new Set();
  for (const id of Object.keys(active || {})) {
    if (!active[id]) continue;
    for (const g of MECHANIC_BY_ID[id]?.groups || []) out.add(g);
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Shared helpers. Modes call these too, so Cirrus and the `lift` mechanic
// can't drift apart.
// ---------------------------------------------------------------------------

export const MAX_STACK = 2;          // 0-indexed, so three levels

/** Is any feature on this cell part of something that already paid out? */
export function partOfScored(board, cell) {
  return cell.type.feats.some((f, i) => {
    const d = board.featureOf(cell.x, cell.y, i);
    return d && d.scored;
  });
}

/**
 * Can this tile be picked back up? It must be unclaimed, unscored, not built
 * on, and — the rule you feel constantly — not be what's holding the board
 * together.
 */
export function canLift(board, x, y) {
  const cell = board.get(x, y);
  if (!cell || cell.meeple || cell.anchored || cell.under) return false;
  if (partOfScored(board, cell)) return false;
  return board.staysConnected(x, y);
}

export function liftableCells(board) {
  return [...board.cells.values()]
    .filter((c) => canLift(board, c.x, c.y))
    .map((c) => ({ x: c.x, y: c.y }));
}

/** Why you can't build on this cell, or null if you can. */
export function coverProblem(board, x, y) {
  const under = board.get(x, y);
  if (!under) return null;
  if (under.h >= MAX_STACK) return 'already three levels high';
  if (under.meeple) return 'someone is standing on it';
  if (partOfScored(board, under)) return 'that feature has already scored';
  return null;
}

/** Features on a tile that a follower may be put on. */
export function claimableFeatures(type) {
  return type.feats
    .map((f, i) => ({ i, f }))
    .filter(({ f }) => !NO_MEEPLE.has(f.type));
}

// ---------------------------------------------------------------------------
// The wagon: when a feature scores, a follower on it may step along the road
// to the next unclaimed, unfinished feature rather than going back to supply.
// ---------------------------------------------------------------------------

/**
 * Where a follower standing at (x,y) could walk on to. Follows roads out of
 * the tile it's on, one tile, and offers any feature there that nobody holds
 * and nothing has scored.
 */
export function walkTargets(board, x, y, from) {
  const out = [];
  const here = board.get(x, y);
  if (!here) return out;

  const consider = (cell) => {
    if (!cell || cell.meeple) return;
    cell.type.feats.forEach((f, i) => {
      if (NO_MEEPLE.has(f.type)) return;
      const d = board.featureOf(cell.x, cell.y, i);
      if (!d || d.scored || d === from) return;
      if (d.meeples.length) return;
      out.push({ x: cell.x, y: cell.y, feat: i, type: f.type });
    });
  };

  // Out along every road leaving this tile, plus the tile itself — a follower
  // on a road that just scored can step into the city it ran up against.
  consider(here);
  for (let s = 0; s < 4; s++) {
    if (board.edgeAt(here, s) !== 'r') continue;
    const [dx, dy] = SIDE_STEP[s];
    consider(board.get(x + dx, y + dy));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Expansion scoring.
// ---------------------------------------------------------------------------

export const WATER = { lake: 3, river: 3 };   // per distinct body beside a city

/**
 * Multiplier and veto from Inns & Cathedrals. A road with an inn is worth
 * double and a city with a cathedral triple — but if the feature is still open
 * when the game ends, it's worth nothing at all.
 */
export function innsAndCathedrals(board, d, final) {
  const kinds = board.marksOn(d).map((m) => m.kind);
  const boosted = (d.type === 'road' && kinds.includes('inn'))
    || (d.type === 'city' && kinds.includes('cathedral'));
  if (!boosted) return { mult: 1, void: false };
  return { mult: d.type === 'road' ? 2 : 1.5, void: final };
}

/** Trade goods carried by a city, as a list of kinds. */
export function goodsOn(board, d) {
  if (d.type !== 'city') return [];
  return board.marksOn(d).map((m) => MARKS[m.kind]?.goods).filter(Boolean);
}

/** The largest completed city and longest completed road on the board. */
export function crownAndRoad(board) {
  let bestCity = null, bestRoad = null;
  let cities = 0, roads = 0;
  for (const d of board.allComponents()) {
    if (d.open !== 0) continue;
    if (d.type === 'city') {
      cities++;
      if (!bestCity || d.tiles.size > bestCity.tiles.size) bestCity = d;
    } else if (d.type === 'road') {
      roads++;
      if (!bestRoad || d.tiles.size > bestRoad.tiles.size) bestRoad = d;
    }
  }
  return { bestCity, bestRoad, cities, roads };
}

export { keyOf };
