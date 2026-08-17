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

/**
 * A temple is a monastery that nobody owns. It has no sides, it completes the
 * same way — surrounded on all eight — and it scores nothing at all. What it
 * has instead is a FACING: when the country closes around it, it exhales, and
 * everything on the board moves one square that way. Girando's engine.
 */
const temple = (face = N) => ({ type: 'temple', sides: [], face });

/**
 * `dir` is a cardinal direction carried by a mark, rotated with its tile the
 * same way a feature's sides are. Only the wind uses it.
 */
const mark = (kind, on = null, dir = null) => ({ kind, on, dir });

// --- World features ---------------------------------------------------------
// Each spans tiles and merges like a city does, but scores its own way.
//
//   forest    1/tile, +1 per log. No complete/incomplete distinction — a forest
//             is worth the same whether it closes or the game ends around it.
//   mountain  pays the moment it grows, scaling with the size of the chain.
//             Nothing can be claimed on it.
//   lake      worth nothing alone; a city beside one is worth more.
//   river     the same, and laid before the game starts.
//
// The `log` on a forest reuses the shield slot, because that's exactly what it
// is: a pennant that adds one to the feature's value.
const forest = (sides, log = false) => ({ type: 'forest', sides, shield: log });
const mountain = (sides) => ({ type: 'mountain', sides });
const lake = (sides) => ({ type: 'lake', sides });
const river = (sides) => ({ type: 'river', sides });

/** Edge letter per feature type. Two edges match only if their letters do. */
export const EDGE_LETTER = {
  city: 'c', road: 'r', monastery: 'f', temple: 'f',
  forest: 'w', mountain: 'm', lake: 'l', river: 'v',
};

/** Features you can't put a follower on. */
export const NO_MEEPLE = new Set(['mountain', 'lake', 'river', 'temple']);

/**
 * Features that reach no edge and are completed by being surrounded, rather
 * than by running out of open sides. The board checks the 3x3 around them.
 */
export const CENTRE_FEATURES = new Set(['monastery', 'temple']);

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
  { id: 'marches', name: 'War terrain', note: 'Keeps, forts, hills, fords, beacons.', classic: false, expedition: false, adventure: false },
  { id: 'descent', name: 'Dangers', note: 'Stairs down, bandits, wolves, barrows.', classic: false, expedition: false, adventure: false },
  { id: 'cloud', name: 'Cloud kingdom', note: 'Zephyrs, temples, windvanes, vestibules, skywalls and flutitantes.', classic: false, expedition: false, adventure: false },
  { id: 'mountains', name: 'Mountains', note: 'Pay the moment the chain grows, scaling with its size. Nothing can be claimed on them.', classic: false, expedition: false, adventure: false },
  { id: 'forests', name: 'Forests', note: '1 per tile, +1 per log. No complete/incomplete distinction — a forest is just as big as it is.', classic: false, expedition: false, adventure: false },
  { id: 'lakes', name: 'Lakes', note: 'Shores and corners, never all four sides. A city beside water is worth more.', classic: false, expedition: false, adventure: false },
  { id: 'innscath', name: 'Inns & cathedrals', note: 'Carcassonne expansion 1. Doubles a finished road, triples a finished city — and pays nothing if they never finish.', classic: false, expedition: false, adventure: false },
  { id: 'traders', name: 'Trade goods', note: 'Carcassonne expansion 2. Wine, grain and cloth, to whoever closes the city holding them.', classic: false, expedition: false, adventure: false },
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

  // --- marches: terrain that matters for marching, not for scoring ----------
  // The keep is a seed tile, so its edges are deliberately easy to build off:
  // a road through and open field either side.
  { id: 'Ma', n: 2, group: 'marches', name: 'Keep',     feats: [road([N, S])], marks: [mark('stronghold')] },
  { id: 'Mb', n: 3, group: 'marches', name: 'Fort',     feats: [road([N, S])], marks: [mark('fort')] },
  { id: 'Mc', n: 5, group: 'marches', name: 'Hill',     feats: [],             marks: [mark('hill')] },
  { id: 'Md', n: 3, group: 'marches', name: 'Ford',     feats: [road([E, W])], marks: [mark('ford')] },
  { id: 'Me', n: 3, group: 'marches', name: 'Beacon',   feats: [],             marks: [mark('beacon')] },
  { id: 'Mf', n: 3, group: 'marches', name: 'Muster field', feats: [road([W, S])], marks: [mark('muster')] },

  // --- descent: things that can kill you ------------------------------------
  { id: 'Da', n: 2, group: 'descent', name: 'Stair down', feats: [road([N])],    marks: [mark('stair')] },
  { id: 'Db', n: 4, group: 'descent', name: 'Bandit camp', feats: [road([N, S])], marks: [mark('bandit')] },
  { id: 'Dc', n: 4, group: 'descent', name: 'Wolf den',   feats: [],             marks: [mark('wolves')] },
  { id: 'Dd', n: 3, group: 'descent', name: 'Barrow',     feats: [],             marks: [mark('barrow')] },
  { id: 'De', n: 3, group: 'descent', name: "Healer's hut", feats: [road([S])],  marks: [mark('healer')] },
  { id: 'Df', n: 3, group: 'descent', name: 'Wayside cache', feats: [road([W, S])], marks: [mark('chest')] },

  // --- cloud: the sky kingdom, and the weather that runs it -----------------
  //
  // Girando's pool. Five of these exist to make the board MOVE rather than to
  // score: the zephyr blows a lane, the temple blows everything, the windvane
  // and the vestibule re-point themselves in the wind and re-cut what's
  // finished, and the skywall is the only thing that stops any of it.
  { id: 'Ka', n: 3, group: 'cloud', name: 'Skyhold',    feats: [city([N, W])],  marks: [mark('skyhold', 0)] },

  // A gust, pointing north on the tile and wherever you turn it in the world.
  { id: 'Kz', n: 4, group: 'cloud', name: 'Zephyr',       feats: [],                marks: [mark('zephyr', null, N)] },
  { id: 'Kzr', n: 2, group: 'cloud', name: 'Zephyr road', feats: [road([E, W])],    marks: [mark('zephyr', null, N)] },

  // The vane and the vestibule are the same idea twice: four ways in, only two
  // of them joined, and the wind decides which two. Every edge matches, so
  // they always fit — what changes is what runs THROUGH them.
  { id: 'Kw', n: 3, group: 'cloud', name: 'Windvane',   swing: true, feats: [road([N, S]), road([E]), road([W])] },
  { id: 'Kv', n: 2, group: 'cloud', name: 'Vestibule',  swing: true, feats: [city([N, S]), city([E]), city([W])] },

  { id: 'Kt', n: 3, group: 'cloud', name: 'Temple',     feats: [temple(N)] },
  { id: 'Kl', n: 2, group: 'cloud', name: 'Skywall',    feats: [],              marks: [mark('wall')] },

  // Flutitantes: terrain built on a hull. You may move one instead of playing
  // a tile, and the wind can strand one in open sky without sinking it.
  { id: 'Kf', n: 2, group: 'cloud', name: 'Flutitante road',  feats: [road([N, S])], marks: [mark('raft')] },
  { id: 'Kg', n: 2, group: 'cloud', name: 'Flutitante hold',  feats: [city([N, W])], marks: [mark('raft')] },
  { id: 'Kh', n: 2, group: 'cloud', name: 'Flutitante field', feats: [],             marks: [mark('raft')] },

  // Not dealt: Girando swaps these in for the base 3-way junctions, so a road
  // running into one carries on instead of ending. Fewer things close, which
  // is the point — a kingdom that keeps finishing stops being weather.
  { id: 'Gw', n: 0, group: 'cloud', name: 'Road 3-way (open)',    feats: [road([E, S, W])] },
  { id: 'Gl', n: 0, group: 'cloud', name: 'City + 3-way (open)',  feats: [city([N]), road([E, S, W])] },

  // --- mountains ------------------------------------------------------------
  // Mountain edges only meet mountain edges, so a range grows as one mass and
  // can't be joined by anything else. Passes are the only way through.
  { id: 'Pa', n: 6, group: 'mountains', name: 'Mountain spur',   feats: [mountain([N])] },
  { id: 'Pb', n: 5, group: 'mountains', name: 'Mountain ridge',  feats: [mountain([N, S])] },
  { id: 'Pc', n: 5, group: 'mountains', name: 'Mountain bend',   feats: [mountain([N, E])] },
  { id: 'Pd', n: 3, group: 'mountains', name: 'Mountain massif', feats: [mountain([N, E, W])] },
  { id: 'Pe', n: 3, group: 'mountains', name: 'Mountain pass',   feats: [mountain([N, S]), road([E, W])] },
  { id: 'Pf', n: 1, group: 'mountains', name: 'The peak',        feats: [mountain([N, E, S, W])] },

  // --- forests --------------------------------------------------------------
  { id: 'Fa', n: 6, group: 'forests', name: 'Forest edge',        feats: [forest([N])] },
  { id: 'Fb', n: 3, group: 'forests', name: 'Forest edge + log',  feats: [forest([N], true)] },
  { id: 'Fc', n: 3, group: 'forests', name: 'Forest across',      feats: [forest([E, W])] },
  { id: 'Fd', n: 5, group: 'forests', name: 'Forest corner',      feats: [forest([N, W])] },
  { id: 'Fe', n: 2, group: 'forests', name: 'Forest corner + log',feats: [forest([N, W], true)] },
  { id: 'Ff', n: 2, group: 'forests', name: 'Deep forest',        feats: [forest([N, E, W])] },
  { id: 'Fg', n: 3, group: 'forests', name: 'Forest track',       feats: [forest([N]), road([E, W])] },
  { id: 'Fh', n: 2, group: 'forests', name: 'Old growth',         feats: [forest([N, E, S, W], true)] },

  // --- lakes ----------------------------------------------------------------
  // Shores and corners only — a tile that was lake on all four sides would be
  // a hole in the map nothing could ever touch.
  { id: 'Wa', n: 5, group: 'lakes', name: 'Lake shore',        feats: [lake([N])] },
  { id: 'Wb', n: 5, group: 'lakes', name: 'Lake corner',       feats: [lake([N, W])] },
  { id: 'Wc', n: 3, group: 'lakes', name: 'Lake narrows',      feats: [lake([E, W])] },
  { id: 'Wd', n: 3, group: 'lakes', name: 'Lakeside road',     feats: [lake([N]), road([E, W])] },
  { id: 'We', n: 2, group: 'lakes', name: 'Lakeside town',     feats: [lake([N, W]), city([S])] },
  { id: 'Wf', n: 2, group: 'lakes', name: 'Lake headland',     feats: [lake([N, E, W])] },

  // --- Inns & Cathedrals (Carcassonne expansion 1) --------------------------
  // An inn doubles its road and a cathedral triples its city — but both pay
  // nothing at all if the feature never closes.
  { id: 'Ia', n: 3, group: 'innscath', name: 'Road + inn',        feats: [road([N, S])],          marks: [mark('inn', 0)] },
  { id: 'Ib', n: 3, group: 'innscath', name: 'Road bend + inn',   feats: [road([W, S])],          marks: [mark('inn', 0)] },
  { id: 'Ic', n: 2, group: 'innscath', name: 'Road 3-way + inn',  feats: [road([E]), road([S]), road([W])], marks: [mark('inn', 0)] },
  { id: 'Id', n: 2, group: 'innscath', name: 'City + cathedral',  feats: [city([N, E, W])],       marks: [mark('cathedral', 0)] },
  { id: 'Ie', n: 2, group: 'innscath', name: 'City across + cathedral', feats: [city([E, W])],    marks: [mark('cathedral', 0)] },

  // --- Trade goods (Carcassonne expansion 2) --------------------------------
  { id: 'Ta', n: 3, group: 'traders', name: 'City + wine',   feats: [city([N, E])],          marks: [mark('wine', 0)] },
  { id: 'Tb', n: 3, group: 'traders', name: 'City + grain',  feats: [city([N, W])],          marks: [mark('grain', 0)] },
  { id: 'Tc', n: 3, group: 'traders', name: 'City + cloth',  feats: [city([E, W])],          marks: [mark('cloth', 0)] },
  { id: 'Td', n: 2, group: 'traders', name: 'City road + wine',  feats: [city([N]), road([E, W])], marks: [mark('wine', 0)] },
  { id: 'Te', n: 2, group: 'traders', name: 'City road + grain', feats: [city([N]), road([S])],    marks: [mark('grain', 0)] },

  { id: 'La', n: 2, group: 'citylife', name: 'Market',   feats: [city([N, W])],           marks: [mark('market', 0)] },
  { id: 'Lb', n: 2, group: 'citylife', name: 'Keep',     feats: [city([N, E, W], true)],  marks: [mark('keep', 0)] },
  { id: 'Lc', n: 2, group: 'citylife', name: 'Library',  feats: [city([E, W])],           marks: [mark('library', 0)] },
  { id: 'Ld', n: 2, group: 'citylife', name: 'Armoury',  feats: [city([N, E])],           marks: [mark('armoury', 0)] },
];

// ---------------------------------------------------------------------------
// The River — Carcassonne's mini-expansion, laid before the game proper.
//
// A separate pool, like the cave deck. The spring goes down first, the rest are
// laid in turn, and the lake caps it. Then the base game starts building off
// whatever countryside the river left behind.
//
// The one real restriction is that the river may not double back on itself:
// two curves in a row bending the same way would make a U-turn. Only an
// *immediate* reversal is illegal — a river that meanders back near itself
// several tiles later is fine.
// ---------------------------------------------------------------------------

export const RIVER_SPRING = 'w0';
export const RIVER_MOUTH = 'w9';

export const RIVER_TYPES = [
  { id: 'w0', n: 1, group: 'river', name: 'Spring',            feats: [river([N])],                    marks: [mark('spring')] },
  { id: 'w1', n: 2, group: 'river', name: 'River straight',    feats: [river([N, S])] },
  { id: 'w2', n: 3, group: 'river', name: 'River bend',        feats: [river([N, E])] },
  { id: 'w3', n: 1, group: 'river', name: 'River + bridge',    feats: [river([N, S]), road([E, W])] },
  { id: 'w4', n: 1, group: 'river', name: 'River bend + town', feats: [river([N, E]), city([S])] },
  { id: 'w5', n: 1, group: 'river', name: 'River + monastery', feats: [river([N, S]), abbey()] },
  { id: 'w6', n: 1, group: 'river', name: 'River bend + road', feats: [river([W, S]), road([N, E])] },
  { id: 'w7', n: 1, group: 'river', name: 'River + city gate', feats: [river([N, S]), city([W])] },
  { id: 'w8', n: 1, group: 'river', name: 'River bend + wood', feats: [river([S, W]), forest([N])] },
  { id: 'w9', n: 1, group: 'river', name: 'The lake',          feats: [river([N])],                    marks: [mark('mouth')] },
];

/**
 * The Abbey — Carcassonne expansion 5. One per player, held in hand rather
 * than drawn, and it ignores edge matching entirely because it can only go
 * into a hole that's already surrounded on all four sides.
 */
export const ABBEY_TILE = { id: 'ABB', n: 0, group: 'abbey', name: 'Abbey', feats: [abbey()] };

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

  // marches: terrain modifiers rather than treasure. `defence` is added to a
  // defender's strength; `home` marks a tile as a supply source.
  stronghold: { label: 'Keep',    score: 0, defence: 3, home: true, note: 'Your seat. Supply flows from here.' },
  fort:       { label: 'Fort',    score: 0, defence: 2, note: 'Whoever holds it defends at +2.' },
  hill:       { label: 'Hill',    score: 0, defence: 1, note: 'High ground — defend at +1.' },
  ford:       { label: 'Ford',    score: 0, defence: 0, note: 'A crossing. Nothing defends well here.' },
  beacon:     { label: 'Beacon',  score: 1, defence: 0, note: 'Lights a region: +1 when you score it.' },
  muster:     { label: 'Muster field', score: 0, defence: 0, muster: 1, note: 'Take a muster chit when you hold it.' },

  // descent: hazards. `threat` is what you roll against; `heal` restores HP.
  stair:   { label: 'Stair down', score: 0, exit: true, note: 'The way to the next depth.' },
  bandit:  { label: 'Bandit camp', score: 2, threat: 2, loot: { gold: 5 } },
  wolves:  { label: 'Wolf den',   score: 2, threat: 3, loot: { supplies: 3 } },
  barrow:  { label: 'Barrow',     score: 4, threat: 4, loot: { relics: 1 } },
  healer:  { label: "Healer's hut", score: 1, heal: 3, loot: { supplies: 1 } },
  chest:   { label: 'Wayside cache', score: 1, loot: { gold: 4 } },

  // world + expansions
  inn:       { label: 'Inn',       score: 0, note: 'Doubles its road when it closes — and voids it if it never does.' },
  cathedral: { label: 'Cathedral', score: 0, note: 'Triples its city when it closes — and voids it if it never does.' },
  wine:      { label: 'Wine',      score: 0, goods: 'wine' },
  grain:     { label: 'Grain',     score: 0, goods: 'grain' },
  cloth:     { label: 'Cloth',     score: 0, goods: 'cloth' },
  spring:    { label: 'Spring',    score: 0, note: 'Where the river starts.' },
  mouth:     { label: 'The lake',  score: 0, note: 'Where the river ends.' },

  // cloud
  skyhold: { label: 'Skyhold', score: 3, note: 'Crystallises the moment its city closes.' },
  zephyr:  { label: 'Zephyr',  score: 0, note: 'Blows its lane one square when played, and again whenever the wind reaches it.' },
  wall:    { label: 'Skywall', score: 0, note: 'Immovable. Nothing downwind of it in a lane is touched by the wind.' },
  raft:    { label: 'Flutitante', score: 0, note: 'Move it instead of playing a tile. It floats — the wind can strand it in open sky.' },
};

/**
 * Two-faced tiles: the reverse of each tile. Flipping is an action, and the
 * back is usually the wilder or more ruined version of the front. Listed one
 * way round and mirrored below, so every pair works in both directions.
 */
const BACK_PAIRS = [
  ['U', 'G'],    // road straight     <-> city across
  ['V', 'N'],    // road bend         <-> city corner
  ['E', 'Rb'],   // city edge         <-> road dead-end
  ['B', 'Ab'],   // monastery         <-> ruin
  ['W', 'R'],    // road 3-way        <-> city 3-sided
  ['D', 'Ra'],   // city + road       <-> continuous crossroads
  ['X', 'C'],    // road 4-way        <-> city all round
  ['A', 'Ae'],   // monastery + road  <-> roadside ruin
  ['H', 'Rc'],   // two cities        <-> double bend
  ['P', 'Oc'],   // city corner+road  <-> watchtower
];

export const BACKS = Object.fromEntries(
  BACK_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));

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
      for (const s of f.sides) t.edges[s] = EDGE_LETTER[f.type] || 'r';
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
prepare(RIVER_TYPES);
prepare([ABBEY_TILE]);

export const TILES = Object.fromEntries(
  [...TILE_TYPES, ...CAVE_TYPES, ...CITY_TYPES, ...RIVER_TYPES, ABBEY_TILE].map((t) => [t.id, t]));

/** The river pool, spring and mouth held back to bookend it. */
export function buildRiverDeck(rng = Math.random) {
  const deck = [];
  for (const t of RIVER_TYPES) {
    if (t.id === RIVER_SPRING || t.id === RIVER_MOUTH) continue;
    for (let i = 0; i < t.n; i++) deck.push(t.id);
  }
  return shuffle(deck, rng);
}

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
export function buildDeck(groups, rng = Math.random, startId = 'D', limit = 0) {
  const on = new Set(groups);
  const deck = [];
  for (const t of TILE_TYPES) {
    if (!on.has(t.group)) continue;
    for (let i = 0; i < t.n; i++) deck.push(t.id);
  }
  const idx = deck.indexOf(startId);
  if (idx >= 0) deck.splice(idx, 1);
  shuffle(deck, rng);
  return limit > 0 ? deck.slice(0, limit) : deck;
}

/**
 * A deck built from an explicit list of {id, n} counts rather than from whole
 * groups — what Descent uses to reweight the pool stage by stage.
 */
export function weightedDeck(counts, rng = Math.random) {
  const deck = [];
  for (const { id, n } of counts) for (let i = 0; i < n; i++) deck.push(id);
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
