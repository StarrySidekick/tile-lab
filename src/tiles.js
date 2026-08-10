// ---------------------------------------------------------------------------
// Tile definitions.
//
// Sides are indexed clockwise from the top: 0=N 1=E 2=S 3=W.
//
// A tile is a list of FEATURES plus a list of MARKS.
//
//   feature: { type: 'city' | 'road' | 'monastery', sides: [...], shield }
//   mark:    { kind: 'stable' | 'village' | ... , on: featureIndex | null }
//
// FEATURES are edge-connected things — they span tiles, merge with neighbours,
// and score. `sides` lists which tile edges the feature reaches. Two road stubs
// meeting at a village centre are two SEPARATE features; that's what makes a
// 3-way junction terminate three roads.
//
// MARKS are point-of-interest landmarks that sit ON a tile and never span
// tiles. They do nothing in Classic mode; they're what Expedition mode is
// built around. `on` anchors a mark to a feature's spot (so a market sits
// inside its city); null puts it at the tile centre.
//
// Everything else — edge letters, art, meeple anchors — is derived.
// ---------------------------------------------------------------------------

export const N = 0, E = 1, S = 2, W = 3;
export const SIDE_NAMES = ['N', 'E', 'S', 'W'];
export const opposite = (s) => (s + 2) % 4;

/** Unit vector from tile centre toward side s (y points down, screen-style). */
export const SIDE_VEC = [[0, -1], [1, 0], [0, 1], [-1, 0]];
/** Midpoint of side s in unit tile space (0..1). */
export const SIDE_MID = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
/** Neighbour offset when stepping across side s. */
export const SIDE_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

const city = (sides, shield = false) => ({ type: 'city', sides, shield });
const road = (sides) => ({ type: 'road', sides });
const abbey = () => ({ type: 'monastery', sides: [] });
const mark = (kind, on = null) => ({ kind, on });

// ---------------------------------------------------------------------------
// Tile groups. Toggle these on and off to change what's in the draw pile.
// ---------------------------------------------------------------------------

export const GROUPS = [
  { id: 'base', name: 'Carcassonne base set', note: 'The original 72 tiles.', classic: true, expedition: true, adventure: true },
  { id: 'roads', name: 'Road experiments', note: 'Continuous crossroads, dead-ends, double bends.', classic: false, expedition: false, adventure: true },
  { id: 'cities', name: 'City experiments', note: 'Tunnels, four-way cities, twin corners.', classic: false, expedition: false, adventure: false },
  { id: 'outposts', name: 'Outposts', note: 'Stables, villages, towers, cave mouths.', classic: false, expedition: true, adventure: true },
  { id: 'citylife', name: 'City landmarks', note: 'Markets, keeps, libraries, armouries.', classic: false, expedition: true, adventure: true },
  { id: 'adventure', name: 'Adventure sites', note: 'Wayshrines, ruins, campsites, merchants.', classic: false, expedition: false, adventure: true },
];

export const TILE_TYPES = [
  // --- base: the original 72 ------------------------------------------------
  { id: 'A', n: 2, group: 'base', name: 'Monastery + road',        feats: [abbey(), road([S])] },
  { id: 'B', n: 4, group: 'base', name: 'Monastery',               feats: [abbey()] },
  { id: 'C', n: 1, group: 'base', name: 'City all round',          feats: [city([N, E, S, W], true)] },
  { id: 'D', n: 4, group: 'base', name: 'City + road through',     feats: [city([N]), road([E, W])] },
  { id: 'E', n: 5, group: 'base', name: 'City edge',               feats: [city([N])] },
  { id: 'F', n: 2, group: 'base', name: 'City across (shield)',    feats: [city([E, W], true)] },
  { id: 'G', n: 1, group: 'base', name: 'City across',             feats: [city([E, W])] },
  { id: 'H', n: 3, group: 'base', name: 'Two cities opposite',     feats: [city([E]), city([W])] },
  { id: 'I', n: 2, group: 'base', name: 'Two cities adjacent',     feats: [city([E]), city([S])] },
  { id: 'J', n: 3, group: 'base', name: 'City + road bend E-S',    feats: [city([N]), road([E, S])] },
  { id: 'K', n: 3, group: 'base', name: 'City + road bend W-S',    feats: [city([N]), road([W, S])] },
  { id: 'L', n: 3, group: 'base', name: 'City + 3-way road',       feats: [city([N]), road([E]), road([S]), road([W])] },
  { id: 'M', n: 2, group: 'base', name: 'City corner (shield)',    feats: [city([N, W], true)] },
  { id: 'N', n: 3, group: 'base', name: 'City corner',             feats: [city([N, W])] },
  { id: 'O', n: 2, group: 'base', name: 'City corner + road (sh)', feats: [city([N, W], true), road([E, S])] },
  { id: 'P', n: 3, group: 'base', name: 'City corner + road',      feats: [city([N, W]), road([E, S])] },
  { id: 'Q', n: 1, group: 'base', name: 'City 3-sided (shield)',   feats: [city([N, E, W], true)] },
  { id: 'R', n: 3, group: 'base', name: 'City 3-sided',            feats: [city([N, E, W])] },
  { id: 'S', n: 2, group: 'base', name: 'City 3-sided + road (sh)',feats: [city([N, E, W], true), road([S])] },
  { id: 'T', n: 1, group: 'base', name: 'City 3-sided + road',     feats: [city([N, E, W]), road([S])] },
  { id: 'U', n: 8, group: 'base', name: 'Road straight',           feats: [road([N, S])] },
  { id: 'V', n: 9, group: 'base', name: 'Road bend',               feats: [road([W, S])] },
  { id: 'W', n: 4, group: 'base', name: 'Road 3-way',              feats: [road([E]), road([S]), road([W])] },
  { id: 'X', n: 1, group: 'base', name: 'Road 4-way',              feats: [road([N]), road([E]), road([S]), road([W])] },

  // --- roads: not in the original -------------------------------------------
  // Two through-roads that cross without meeting. Neither road ends here, so a
  // crossroads no longer closes anything — it just gets longer.
  { id: 'Ra', n: 3, group: 'roads', name: 'Crossroads (continuous)', feats: [road([N, S]), road([E, W])] },
  // A road that simply stops. Seals its own field off from the rest.
  { id: 'Rb', n: 3, group: 'roads', name: 'Road dead-end',           feats: [road([N])] },
  // Two bends sharing a tile without touching.
  { id: 'Rc', n: 3, group: 'roads', name: 'Double bend',             feats: [road([N, E]), road([S, W])] },
  // A loop of road that pinches a field into a pocket.
  { id: 'Rd', n: 2, group: 'roads', name: 'Road fork + bypass',      feats: [road([N, S]), road([E])] },

  // --- cities: not in the original ------------------------------------------
  { id: 'Ca', n: 2, group: 'cities', name: 'City tunnel',            feats: [city([N, S]), road([E, W])] },
  { id: 'Cb', n: 1, group: 'cities', name: 'Four cities',            feats: [city([N]), city([E]), city([S]), city([W])] },
  { id: 'Cc', n: 2, group: 'cities', name: 'Twin corner cities',     feats: [city([N, E]), city([S, W])] },

  // --- outposts: Expedition landmarks ---------------------------------------
  { id: 'Oa', n: 3, group: 'outposts', name: 'Stable',      feats: [road([N, S])],                       marks: [mark('stable')] },
  { id: 'Ob', n: 3, group: 'outposts', name: 'Village',     feats: [road([E]), road([S]), road([W])],    marks: [mark('village')] },
  { id: 'Oc', n: 3, group: 'outposts', name: 'Watchtower',  feats: [],                                   marks: [mark('tower')] },
  { id: 'Od', n: 2, group: 'outposts', name: 'Tower + road',feats: [road([W, E])],                       marks: [mark('tower')] },
  { id: 'Oe', n: 3, group: 'outposts', name: 'Cave mouth',  feats: [],                                   marks: [mark('cave')] },
  { id: 'Of', n: 2, group: 'outposts', name: 'Cave + road', feats: [road([S])],                          marks: [mark('cave')] },

  // --- citylife: landmarks inside cities ------------------------------------
  // --- adventure: things to find on the road --------------------------------
  { id: 'Aa', n: 3, group: 'adventure', name: 'Wayshrine', feats: [],                marks: [mark('shrine')] },
  { id: 'Ab', n: 4, group: 'adventure', name: 'Ruin',      feats: [],                marks: [mark('ruin')] },
  { id: 'Ac', n: 3, group: 'adventure', name: 'Campsite',  feats: [road([N, S])],    marks: [mark('camp')] },
  { id: 'Ad', n: 2, group: 'adventure', name: 'Merchant',  feats: [road([E, W])],    marks: [mark('merchant')] },
  { id: 'Ae', n: 3, group: 'adventure', name: 'Roadside ruin', feats: [road([W, S])],marks: [mark('ruin')] },
  // Followers come only from villages, so Adventure needs more of them than
  // Expedition does — three in a ~110 tile deck left most runs solo.
  { id: 'Af', n: 4, group: 'adventure', name: 'Hamlet',    feats: [road([W, S])],    marks: [mark('village')] },
  { id: 'Ag', n: 2, group: 'adventure', name: 'Crossroads village', feats: [road([N]), road([E]), road([S]), road([W])], marks: [mark('village')] },

  { id: 'La', n: 2, group: 'citylife', name: 'Market',   feats: [city([N, W])],           marks: [mark('market', 0)] },
  { id: 'Lb', n: 2, group: 'citylife', name: 'Keep',     feats: [city([N, E, W], true)],  marks: [mark('keep', 0)] },
  { id: 'Lc', n: 2, group: 'citylife', name: 'Library',  feats: [city([E, W])],           marks: [mark('library', 0)] },
  { id: 'Ld', n: 2, group: 'citylife', name: 'Armoury',  feats: [city([N, E])],           marks: [mark('armoury', 0)] },
];

// ---------------------------------------------------------------------------
// Cave tiles — a separate pool used only inside caves. 'r' edges are passages,
// 'f' edges are solid rock, so the exact same edge-matching rule carves out a
// corridor network instead of a countryside.
// ---------------------------------------------------------------------------

export const CAVE_TYPES = [
  { id: 'va', n: 6, group: 'cave', name: 'Passage',        feats: [road([N, S])] },
  { id: 'vb', n: 6, group: 'cave', name: 'Passage bend',   feats: [road([W, S])] },
  { id: 'vc', n: 4, group: 'cave', name: 'Passage fork',   feats: [road([E]), road([S]), road([W])] },
  { id: 'vd', n: 2, group: 'cave', name: 'Chamber',        feats: [road([N]), road([E]), road([S]), road([W])], marks: [mark('hoard')] },
  { id: 've', n: 5, group: 'cave', name: 'Dead end',       feats: [road([N])],                                  marks: [mark('trove')] },
  { id: 'vf', n: 2, group: 'cave', name: 'Glowing spring', feats: [road([N, S])],                               marks: [mark('spring')] },
  { id: 'vg', n: 3, group: 'cave', name: 'Shaft to surface',feats: [road([N])],                                 marks: [mark('shaft')] },
];

// ---------------------------------------------------------------------------
// City interiors — the districts you walk through once a city is finished and
// you enter it by its gate. 'r' edges are streets, 'f' edges are building
// frontage, so the same matching rule lays out a street plan.
// ---------------------------------------------------------------------------

export const CITY_TYPES = [
  { id: 'ga', n: 1, group: 'city-interior', name: 'City gate',   feats: [road([N]), road([E]), road([S]), road([W])] },
  { id: 'gb', n: 6, group: 'city-interior', name: 'Street',      feats: [road([N, S])] },
  { id: 'gc', n: 6, group: 'city-interior', name: 'Street bend', feats: [road([W, S])] },
  { id: 'gd', n: 4, group: 'city-interior', name: 'Crossing',    feats: [road([E]), road([S]), road([W])] },
  { id: 'ge', n: 2, group: 'city-interior', name: 'Market square', feats: [road([N]), road([E]), road([S]), road([W])], marks: [mark('market')] },
  { id: 'gf', n: 2, group: 'city-interior', name: 'Smithy',      feats: [road([N])],    marks: [mark('smithy')] },
  { id: 'gg', n: 2, group: 'city-interior', name: 'Tavern',      feats: [road([N])],    marks: [mark('tavern')] },
  { id: 'gh', n: 1, group: 'city-interior', name: 'Temple',      feats: [road([N])],    marks: [mark('temple')] },
  { id: 'gi', n: 1, group: 'city-interior', name: 'Inner keep',  feats: [road([N])],    marks: [mark('keep')] },
  { id: 'gj', n: 2, group: 'city-interior', name: 'Well',        feats: [road([N, S])], marks: [mark('well')] },
  { id: 'gk', n: 2, group: 'city-interior', name: 'Guild hall',  feats: [road([N])],    marks: [mark('guild')] },
  { id: 'gl', n: 3, group: 'city-interior', name: 'Back alley',  feats: [road([N])],    marks: [mark('cache')] },
];

/** What each mark is worth / does. Referenced by Expedition and by the art. */
export const MARKS = {
  stable:  { label: 'Stable',   score: 1, note: 'Your pawn is mounted from now on — it moves 2 tiles.' },
  village: { label: 'Village',  score: 1, note: 'Rest here a turn to raise a second pawn.' },
  tower:   { label: 'Watchtower', score: 2, note: 'Once raised, pawns may warp between any two towers.' },
  cave:    { label: 'Cave mouth', score: 0, note: 'Enter to explore a cave.' },
  // City landmarks — these double as Expedition set-collection targets and as
  // Adventure districts, so they carry both a score and a loot table.
  market:  { label: 'Market',    score: 2, loot: { gold: 4 },     note: 'City landmark.' },
  keep:    { label: 'Keep',      score: 2, loot: { gold: 5 },     note: 'City landmark.' },
  library: { label: 'Library',   score: 2, loot: { relics: 1 },   note: 'City landmark.' },
  armoury: { label: 'Armoury',   score: 2, loot: { gold: 3 },     note: 'City landmark.' },
  // cave-only
  hoard:   { label: 'Hoard',    score: 5, note: 'Cave treasure.', loot: { gold: 6 } },
  trove:   { label: 'Trove',    score: 3, note: 'Cave treasure.', loot: { gold: 3 } },
  spring:  { label: 'Spring',   score: 2, note: 'Cave treasure.', loot: { supplies: 2 } },
  shaft:   { label: 'Shaft',    score: 1, note: 'Climb out to the surface.' },

  // adventure: surface landmarks
  shrine:    { label: 'Wayshrine', score: 1, loot: { supplies: 2 }, note: 'Rest and restock.' },
  ruin:      { label: 'Ruin',      score: 3, loot: { relics: 1 },   note: 'A relic lies here.' },
  camp:      { label: 'Campsite',  score: 1, loot: { supplies: 3 }, note: 'Provisions.' },
  merchant:  { label: 'Merchant',  score: 1, loot: { gold: 3 },     note: 'Trade on the road.' },

  // adventure: city districts
  smithy:  { label: 'Smithy',    score: 2, loot: { gold: 2 }, note: 'Gear for the road.' },
  tavern:  { label: 'Tavern',    score: 2, loot: { gold: 1 }, note: 'Rumours — and a lead.' },
  temple:  { label: 'Temple',    score: 3, loot: { supplies: 4 } },
  well:    { label: 'Well',      score: 1, loot: { supplies: 2 } },
  guild:   { label: 'Guild hall',score: 2, loot: { gold: 3 } },
  cache:   { label: 'Cache',     score: 1, loot: { gold: 2 } },
};

export const CITY_LANDMARKS = ['market', 'keep', 'library', 'armoury'];

// --- derived data -----------------------------------------------------------

function prepare(list) {
  for (const t of list) {
    t.feats = t.feats || [];
    t.marks = t.marks || [];
    // Edge letters: c=city, r=road, f=field/rock. Used for the matching rule.
    t.edges = ['f', 'f', 'f', 'f'];
    t.shields = 0;
    for (const f of t.feats) {
      if (f.shield) t.shields++;
      for (const s of f.sides) t.edges[s] = f.type === 'city' ? 'c' : 'r';
    }
    t.spots = t.feats.map(featureSpot);
    // A mark anchored to a feature borrows that feature's spot, pulled in from
    // the rim so a tall landmark can't hang off the edge of its tile.
    t.markSpots = t.marks.map((m) => {
      const [x, y] = m.on == null ? [0.5, 0.5] : t.spots[m.on];
      return [clamp(x, 0.30, 0.70), clamp(y, 0.32, 0.68)];
    });
  }
  return list;
}

prepare(TILE_TYPES);
prepare(CAVE_TYPES);
prepare(CITY_TYPES);

export const TILES = Object.fromEntries(
  [...TILE_TYPES, ...CAVE_TYPES, ...CITY_TYPES].map((t) => [t.id, t]));

// Declared as a function so it's hoisted above the prepare() calls that run
// at module load — a const arrow here is a temporal-dead-zone crash.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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

/**
 * Build a shuffled draw pile from the enabled groups.
 * `groups` is a Set/array of group ids; the start tile is removed once.
 */
export function buildDeck(groups, rng = Math.random, startId = 'D') {
  const on = new Set(groups);
  const deck = [];
  for (const t of TILE_TYPES) {
    if (!on.has(t.group)) continue;
    for (let i = 0; i < t.n; i++) deck.push(t.id);
  }
  const idx = deck.indexOf(startId);
  if (idx >= 0) deck.splice(idx, 1);
  return shuffle(deck, rng);
}

export function buildCaveDeck(rng = Math.random) {
  const deck = [];
  for (const t of CAVE_TYPES) for (let i = 0; i < t.n; i++) deck.push(t.id);
  return shuffle(deck, rng);
}

/**
 * A city's street plan. Bigger cities get more of it — `size` is the number of
 * tiles in the finished city, so a two-tile hamlet is a few streets and a
 * ten-tile capital is most of the pool.
 */
export function buildCityDeck(size, rng = Math.random) {
  const deck = [];
  for (const t of CITY_TYPES) {
    if (t.id === 'ga') continue;             // the gate is placed as the entrance
    for (let i = 0; i < t.n; i++) deck.push(t.id);
  }
  shuffle(deck, rng);
  const budget = Math.max(4, Math.min(deck.length, size * 3));
  return deck.slice(0, budget);
}

function shuffle(deck, rng) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}
