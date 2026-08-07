// ---------------------------------------------------------------------------
// Tile definitions.
//
// Sides are indexed clockwise from the top: 0=N 1=E 2=S 3=W.
//
// A tile is a list of FEATURES. A feature is a connected piece of stuff on the
// tile that can be scored and can hold a meeple:
//
//   { type: 'city' | 'road' | 'monastery', sides: [...], shield: bool }
//
// `sides` lists which tile edges the feature reaches. Two road stubs that meet
// at a village center are two SEPARATE features (that's what makes a 3-way
// junction end three roads). A city drawn across two edges is ONE feature.
//
// Everything else (edge letters, art, meeple spots) is derived from this, so
// adding a new tile type is one line of data.
// ---------------------------------------------------------------------------

export const N = 0, E = 1, S = 2, W = 3;
export const SIDE_NAMES = ['N', 'E', 'S', 'W'];
export const opposite = (s) => (s + 2) % 4;

/** Unit vector from tile center toward side s (y points down, screen-style). */
export const SIDE_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Midpoint of side s in unit tile space (0..1). */
export const SIDE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
/** Neighbor offset when stepping across side s. */
export const SIDE_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const city = (sides, shield = false) => ({ type: 'city', sides, shield });
const road = (sides) => ({ type: 'road', sides });
const abbey = () => ({ type: 'monastery', sides: [] });

// Standard 72-tile base game. `n` is how many copies are in the deck.
export const TILE_TYPES = [
  { id: 'A', n: 2, name: 'Monastery + road',        feats: [abbey(), road([S])] },
  { id: 'B', n: 4, name: 'Monastery',               feats: [abbey()] },
  { id: 'C', n: 1, name: 'City all round',          feats: [city([N, E, S, W], true)] },
  { id: 'D', n: 4, name: 'City + road through',     feats: [city([N]), road([E, W])] },
  { id: 'E', n: 5, name: 'City edge',               feats: [city([N])] },
  { id: 'F', n: 2, name: 'City across (shield)',    feats: [city([E, W], true)] },
  { id: 'G', n: 1, name: 'City across',             feats: [city([E, W])] },
  { id: 'H', n: 3, name: 'Two cities opposite',     feats: [city([E]), city([W])] },
  { id: 'I', n: 2, name: 'Two cities adjacent',     feats: [city([E]), city([S])] },
  { id: 'J', n: 3, name: 'City + road bend E-S',    feats: [city([N]), road([E, S])] },
  { id: 'K', n: 3, name: 'City + road bend W-S',    feats: [city([N]), road([W, S])] },
  { id: 'L', n: 3, name: 'City + 3-way road',       feats: [city([N]), road([E]), road([S]), road([W])] },
  { id: 'M', n: 2, name: 'City corner (shield)',    feats: [city([N, W], true)] },
  { id: 'N', n: 3, name: 'City corner',             feats: [city([N, W])] },
  { id: 'O', n: 2, name: 'City corner + road (sh)', feats: [city([N, W], true), road([E, S])] },
  { id: 'P', n: 3, name: 'City corner + road',      feats: [city([N, W]), road([E, S])] },
  { id: 'Q', n: 1, name: 'City 3-sided (shield)',   feats: [city([N, E, W], true)] },
  { id: 'R', n: 3, name: 'City 3-sided',            feats: [city([N, E, W])] },
  { id: 'S', n: 2, name: 'City 3-sided + road (sh)',feats: [city([N, E, W], true), road([S])] },
  { id: 'T', n: 1, name: 'City 3-sided + road',     feats: [city([N, E, W]), road([S])] },
  { id: 'U', n: 8, name: 'Road straight',           feats: [road([N, S])] },
  { id: 'V', n: 9, name: 'Road bend',               feats: [road([W, S])] },
  { id: 'W', n: 4, name: 'Road 3-way',              feats: [road([E]), road([S]), road([W])] },
  { id: 'X', n: 1, name: 'Road 4-way',              feats: [road([N]), road([E]), road([S]), road([W])] },
];

// --- derived data -----------------------------------------------------------

for (const t of TILE_TYPES) {
  // Edge letters: c=city, r=road, f=field. Used for the matching rule.
  t.edges = ['f', 'f', 'f', 'f'];
  t.shields = 0;
  for (const f of t.feats) {
    if (f.shield) t.shields++;
    for (const s of f.sides) t.edges[s] = f.type === 'city' ? 'c' : 'r';
  }
  // Where a meeple sits for each feature, in unit tile space.
  t.spots = t.feats.map((f) => featureSpot(f));
}

export const TILES = Object.fromEntries(TILE_TYPES.map((t) => [t.id, t]));

/** Meeple anchor point for a feature, in unit tile space (0..1). */
function featureSpot(f) {
  if (f.type === 'monastery') return [0.5, 0.5];
  let vx = 0, vy = 0;
  for (const s of f.sides) { vx += SIDE_VEC[s][0]; vy += SIDE_VEC[s][1]; }
  const len = Math.hypot(vx, vy);
  if (len < 1e-6) return [0.5, 0.5]; // symmetric: straight road, band city, 4-city
  vx /= len; vy /= len;
  const push = f.type === 'road'
    ? (f.sides.length === 1 ? 0.28 : 0.17)
    : (f.sides.length === 1 ? 0.31 : f.sides.length === 2 ? 0.21 : 0.16);
  return [0.5 + vx * push, 0.5 + vy * push];
}

/** Rotate a point in unit tile space by `rot` quarter-turns clockwise. */
export function rotPoint([x, y], rot) {
  const a = (rot & 3) * Math.PI / 2;
  const c = Math.cos(a), s = Math.sin(a);
  const dx = x - 0.5, dy = y - 0.5;
  return [0.5 + dx * c - dy * s, 0.5 + dx * s + dy * c];
}

/** Build a shuffled draw pile (start tile excluded). */
export function buildDeck(rng = Math.random, startId = 'D') {
  const deck = [];
  for (const t of TILE_TYPES) for (let i = 0; i < t.n; i++) deck.push(t.id);
  const idx = deck.indexOf(startId);
  if (idx >= 0) deck.splice(idx, 1);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
