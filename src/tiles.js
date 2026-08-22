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

// --- half-edges, which is how fields are described ---------------------------
//
// A field is not an edge feature: two tiles' fields meet along HALF an edge,
// which is why a road running out to a tile's edge splits the field either
// side of it without the edge letter changing at all. So the tile perimeter is
// cut into eight half-edges, numbered clockwise from the top-left:
//
//        0   1
//      +---+---+
//    7 |       | 2
//      +       +
//    6 |       | 3
//      +---+---+
//        5   4
//
// Side s owns halves 2s and 2s+1, in clockwise order. Crossing a seam the
// clockwise order reverses, so half 2s meets the neighbour's 2·opp+1 and half
// 2s+1 meets its 2·opp — which is the whole of the joining rule.

export const HALVES_OF_SIDE = [[0, 1], [2, 3], [4, 5], [6, 7]];

/** The half-edge on the far side of a seam, seen from half `h`. */
export const halfPartner = (h) => {
  const s = h >> 1;
  const opp = (s + 2) % 4;
  return h % 2 === 0 ? 2 * opp + 1 : 2 * opp;
};

/** Midpoint of half-edge h in unit tile space. */
export const HALF_MID = [
  [0.25, 0], [0.75, 0], [1, 0.25], [1, 0.75],
  [0.75, 1], [0.25, 1], [0, 0.75], [0, 0.25],
];

/** Which side a half-edge belongs to. */
export const sideOfHalf = (h) => h >> 1;

const city = (sides, shield = false) => ({ type: 'city', sides, shield });
const road = (sides) => ({ type: 'road', sides });
const abbey = () => ({ type: 'monastery', sides: [] });

/**
 * A garden. It closes and pays exactly as a monastery does — surrounded on all
 * eight, worth 9 — but only an abbot may keep one, which is the whole reason
 * it is its own type rather than another cloister.
 */
const garden = () => ({ type: 'garden', sides: [] });

/**
 * A temple is a monastery that pays as it goes rather than when it closes. It
 * has no sides and completes the same way — surrounded on all eight — but the
 * points come from the arrivals: its keeper takes an offering for every tile
 * that lands in the parish, and double for one the wind put there. The wind
 * can't move the building, and the figure inside it is indoors.
 *
 * The FACING is what the shrine looks toward. Nothing reads it but the art.
 */
const temple = (face = N) => ({ type: 'temple', sides: [], face });

/**
 * Half of a sphere, on one edge. A sfera edge meets nothing but another sfera
 * edge, so joining two of them is a deliberate act rather than an accident —
 * and the moment two are joined, the sky starts counting islands.
 */
const sfera = (side = N) => ({ type: 'sfera', sides: [side] });

/**
 * `dir` is a cardinal direction carried by a mark, rotated with its tile the
 * same way a feature's sides are. Only the wind uses it.
 */
const mark = (kind, on = null, dir = null) => ({ kind, on, dir });

/**
 * A zephyr blows one way, usually. The special ones blow two, three or all
 * four at once — one gust down each lane, out of the same tile — so the mark
 * carries a LIST of directions and `dir` is just the first of them, kept so
 * that everything which only knows about single-facing marks still works.
 */
const zephyr = (dirs = [N]) => ({ kind: 'zephyr', on: null, dir: dirs[0], dirs });

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

/**
 * The wildcard edge. An Abbazia presents one on all four sides: it fits
 * anywhere, and rather than joining what it touches it CAPS it — the road or
 * city on the other side loses that open slot and can finish without ever
 * meeting anything. Take the Abbazia away again and the slot comes back.
 */
export const CAP = '*';

/**
 * The dock edge. A ship presents one on all four sides and it is the opposite
 * of a wildcard in every way but fitting: it goes anywhere, and it does
 * NOTHING to what it touches. No join, no cap. A road running into a moored
 * ship is a road that is still looking for its other end.
 */
export const DOCK = '~';

/** Do two edges meet? Same letter, or one of them takes anything. */
export const edgesMeet = (a, b) => a === b || a === CAP || b === CAP
  || a === DOCK || b === DOCK;

/** Edge letter per feature type. Two edges match only if their letters do. */
export const EDGE_LETTER = {
  city: 'c', road: 'r', monastery: 'f', temple: 'f', garden: 'f',
  forest: 'w', mountain: 'm', lake: 'l', river: 'v', sfera: 'o',
};

/** Features you can't put a follower on. */
export const NO_MEEPLE = new Set(['mountain', 'lake', 'river', 'sfera']);

/**
 * Features that reach no edge and are completed by being surrounded, rather
 * than by running out of open sides. The board checks the 3x3 around them.
 */
export const CENTRE_FEATURES = new Set(['monastery', 'temple', 'garden']);

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
  { id: 'cloud', name: 'Cloud kingdom', note: 'Zephyrs, sferas, temples, tower turbines, Abbazias, flying machines and windvanes.', classic: false, expedition: false, adventure: false },
  { id: 'mountains', name: 'Mountains', note: 'Pay the moment the chain grows, scaling with its size. Nothing can be claimed on them.', classic: false, expedition: false, adventure: false },
  { id: 'forests', name: 'Forests', note: '1 per tile, +1 per log. No complete/incomplete distinction — a forest is just as big as it is.', classic: false, expedition: false, adventure: false },
  { id: 'lakes', name: 'Lakes', note: 'Shores and corners, never all four sides. A city beside water is worth more.', classic: false, expedition: false, adventure: false },
  { id: 'innscath', name: 'Inns & cathedrals', note: 'Carcassonne expansion 1. Doubles a finished road, triples a finished city — and pays nothing if they never finish.', classic: false, expedition: false, adventure: false },
  { id: 'traders', name: 'Trade goods', note: 'Carcassonne expansion 2. Wine, grain and cloth, to whoever closes the city holding them.', classic: false, expedition: false, adventure: false },
  { id: 'gardens', name: 'Gardens', note: 'The Abbot’s little walled gardens — a second place he may sit.', classic: false, expedition: false, adventure: false },
  { id: 'vineyards', name: 'Vineyards', note: 'Hills & Sheep. A vineyard beside a monastery adds 3 when it closes.', classic: false, expedition: false, adventure: false },
  { id: 'dragonset', name: 'Portals & princesses', note: 'The Princess & the Dragon. Portals deploy anywhere; a princess evicts a knight.', classic: false, expedition: false, adventure: false },
  { id: 'festivals', name: 'Festivals', note: 'The Festival. Take one of your own followers back instead of claiming.', classic: false, expedition: false, adventure: false },
  { id: 'magic', name: 'Magic symbols', note: 'Mage & Witch. Each forces the mage or the witch onto an unfinished road or city.', classic: false, expedition: false, adventure: false },
  { id: 'goldrush', name: 'Gold veins', note: 'The Gold Mines. Ingots pile up and go to whoever closes the feature under them.', classic: false, expedition: false, adventure: false },
  { id: 'cults', name: 'Heretic shrines', note: 'Cult places. A shrine near a monastery starts a race to close first.', classic: false, expedition: false, adventure: false },
  { id: 'crops', name: 'Crop circles', note: 'Everyone adds a follower of the shown kind, or everyone takes one back.', classic: false, expedition: false, adventure: false },
  { id: 'sieges', name: 'Besieged cities', note: 'The Besiegers. A city under siege is worth half.', classic: false, expedition: false, adventure: false },
  { id: 'watchtowers', name: 'Watchtowers', note: 'Pay for the followers standing near them when their feature closes.', classic: false, expedition: false, adventure: false },
  { id: 'windroses', name: 'Wind roses', note: 'Pay 3 when laid in their own quadrant of the map.', classic: false, expedition: false, adventure: false },
  { id: 'tunnels', name: 'Tunnels', note: 'Roads that dive underground and pair up with the next tunnel laid.', classic: false, expedition: false, adventure: false },
  { id: 'plagues', name: 'The plague', note: 'Outbreak tiles that clear every follower around them.', classic: false, expedition: false, adventure: false },
  { id: 'robbers', name: 'Robbers', note: 'Post a robber on an opponent and take half of the next thing they score.', classic: false, expedition: false, adventure: false },
  { id: 'revolts', name: 'Peasant revolts', note: 'Lone followers on the named feature flee; paired ones stand firm.', classic: false, expedition: false, adventure: false },
  { id: 'signposts', name: 'Signposts', note: 'Roads worth 2 more per signpost when they close.', classic: false, expedition: false, adventure: false },
  { id: 'orchards', name: 'Fruit trees', note: 'Each tree pays the next four neighbours laid beside it.', classic: false, expedition: false, adventure: false },
  { id: 'hillsg', name: 'Hills', note: 'High ground that settles tied majorities.', classic: false, expedition: false, adventure: false },
  { id: 'bigtopg', name: 'The big top', note: 'The circus tent, moving from tile to tile and paying as it goes.', classic: false, expedition: false, adventure: false },
  { id: 'schools', name: 'The school', note: 'One tile; whoever closes its road takes the teacher.', classic: false, expedition: false, adventure: false },
  { id: 'circusg', name: 'Acrobat rings', note: 'Under the Big Top. Pyramids of followers, paid when the third climbs on.', classic: false, expedition: false, adventure: false },
  { id: 'baths', name: 'Bathhouses', note: 'The Barber-Surgeons. Move a follower from anywhere to the new tile.', classic: false, expedition: false, adventure: false },
  { id: 'dragonfire', name: 'Dragon & volcanoes', note: 'Eruptions summon the dragon; dragon tiles send it rampaging.', classic: false, expedition: false, adventure: false },
  { id: 'towersg', name: 'Tower foundations', note: 'Build floors, capture followers, ransom them back.', classic: false, expedition: false, adventure: false },
  { id: 'ferriesg', name: 'Ferry lakes', note: 'Lakes where several roads end, joined two at a time by ferry.', classic: false, expedition: false, adventure: false },
  { id: 'abbeyDE', name: 'Regional monasteries', note: 'Unfinished, they pay for the row and column they command.', classic: false, expedition: false, adventure: false },
  { id: 'abbeyJP', name: 'Japanese buildings', note: 'The same command of row and column, from the Japanese edition.', classic: false, expedition: false, adventure: false },
];

export const TILE_TYPES = [
  // --- base: the original 72 ------------------------------------------------
  { id: 'A', n: 2, group: 'base', name: 'Monastery + road',        feats: [abbey(), road([S])], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'B', n: 4, group: 'base', name: 'Monastery',               feats: [abbey()], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'C', n: 1, group: 'base', name: 'City all round',          feats: [city([N, E, S, W], true)], fields: [] },
  { id: 'D', n: 4, group: 'base', name: 'City + road through',     feats: [city([N]), road([E, W])], fields: [[2, 7], [3, 4, 5, 6]] },
  { id: 'E', n: 5, group: 'base', name: 'City edge',               feats: [city([N])], fields: [[2, 3, 4, 5, 6, 7]] },
  { id: 'F', n: 2, group: 'base', name: 'City across (shield)',    feats: [city([E, W], true)], fields: [[0, 1], [4, 5]] },
  { id: 'G', n: 1, group: 'base', name: 'City across',             feats: [city([E, W])], fields: [[0, 1], [4, 5]] },
  { id: 'H', n: 3, group: 'base', name: 'Two cities opposite',     feats: [city([E]), city([W])], fields: [[0, 1, 4, 5]] },
  { id: 'I', n: 2, group: 'base', name: 'Two cities adjacent',     feats: [city([E]), city([S])], fields: [[0, 1, 6, 7]] },
  { id: 'J', n: 3, group: 'base', name: 'City + road bend E-S',    feats: [city([N]), road([E, S])], fields: [[3, 4], [2, 5, 6, 7]] },
  { id: 'K', n: 3, group: 'base', name: 'City + road bend W-S',    feats: [city([N]), road([W, S])], fields: [[5, 6], [2, 3, 4, 7]] },
  { id: 'L', n: 3, group: 'base', name: 'City + 3-way road',       feats: [city([N]), road([E]), road([S]), road([W])], fields: [[3, 4], [5, 6], [2, 7]] },
  { id: 'M', n: 2, group: 'base', name: 'City corner (shield)',    feats: [city([N, W], true)], fields: [[2, 3, 4, 5]] },
  { id: 'N', n: 3, group: 'base', name: 'City corner',             feats: [city([N, W])], fields: [[2, 3, 4, 5]] },
  { id: 'O', n: 2, group: 'base', name: 'City corner + road (sh)', feats: [city([N, W], true), road([E, S])], fields: [[3, 4], [2, 5]] },
  { id: 'P', n: 3, group: 'base', name: 'City corner + road',      feats: [city([N, W]), road([E, S])], fields: [[3, 4], [2, 5]] },
  { id: 'Q', n: 1, group: 'base', name: 'City 3-sided (shield)',   feats: [city([N, E, W], true)], fields: [[4, 5]] },
  { id: 'R', n: 3, group: 'base', name: 'City 3-sided',            feats: [city([N, E, W])], fields: [[4, 5]] },
  { id: 'S', n: 2, group: 'base', name: 'City 3-sided + road (sh)',feats: [city([N, E, W], true), road([S])], fields: [[4], [5]] },
  { id: 'T', n: 1, group: 'base', name: 'City 3-sided + road',     feats: [city([N, E, W]), road([S])], fields: [[4], [5]] },
  // A straight road lies along whatever wind is blowing through it: hit side
  // on, it swings onto the wind's axis. `align` is the quiet half of `swing` —
  // same behaviour in the weather, none of the vane's art.
  { id: 'U', n: 8, group: 'base', name: 'Road straight',           feats: [road([N, S])], align: true , fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'V', n: 9, group: 'base', name: 'Road bend',               feats: [road([W, S])], fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },
  { id: 'W', n: 4, group: 'base', name: 'Road 3-way',              feats: [road([E]), road([S]), road([W])], fields: [[3, 4], [5, 6], [0, 1, 2, 7]] },
  { id: 'X', n: 1, group: 'base', name: 'Road 4-way',              feats: [road([N]), road([E]), road([S]), road([W])], fields: [[1, 2], [3, 4], [5, 6], [0, 7]] },

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
  // Girando's pool. Most of these exist to make the board MOVE rather than to
  // score: the zephyr blows a lane, the windvane re-points itself in the wind
  // and re-cuts what runs through it, and the turbine is paid for every gust
  // that arrives. The only thing that stops any of it is a city somebody has
  // finished, which turns to stone and is solid all the way up.
  // Gusts, pointing north on the tile and wherever you turn it in the world.
  // Sixteen single-facing ones, on every kind of ground there is: wind that
  // only ever arrived on empty fields would be wind you could plan around.
  { id: 'Kz',  n: 5, group: 'cloud', name: 'Zephyr',        feats: [],                        marks: [zephyr([N])] },
  { id: 'Kzr', n: 4, group: 'cloud', name: 'Zephyr road',   feats: [road([E, W])],            marks: [zephyr([N])] },
  { id: 'Kzb', n: 3, group: 'cloud', name: 'Zephyr bend',   feats: [road([S, E])],            marks: [zephyr([N])] },
  { id: 'Kzc', n: 3, group: 'cloud', name: 'Zephyr wall',   feats: [city([W])],               marks: [zephyr([N])] },
  { id: 'Kzt', n: 1, group: 'cloud', name: 'Zephyr gate',   feats: [city([S]), road([E, W])], marks: [zephyr([N])] },

  // The four winds that blow more than one way at once — one gust per lane,
  // out of the same square, all in the turn it's played. One of each, because
  // a compass rose in a seventy-two tile deck should be a thing that happens
  // once and gets talked about afterwards.
  { id: 'Kzx', n: 1, group: 'cloud', name: 'Crosswind',     feats: [], marks: [zephyr([N, E])] },
  { id: 'Kzy', n: 1, group: 'cloud', name: 'Split wind',    feats: [], marks: [zephyr([N, S])] },
  { id: 'Kzw', n: 1, group: 'cloud', name: 'Trident wind',  feats: [], marks: [zephyr([N, E, W])] },
  { id: 'Kzq', n: 1, group: 'cloud', name: 'Compass rose',  feats: [], marks: [zephyr([N, E, S, W])] },

  // The Palazzo: the founding stone of the kingdom, and the only tile on the
  // board that was there before anybody played. Same connections as the base
  // set's start tile — a city gate with the road running under it — and no more
  // rooted than anything else, so the sky can and does shove the seat of
  // government around. What it has instead is worth: the island it is sitting
  // on counts double when a sphere closes.
  { id: 'Kpz', n: 0, group: 'cloud', name: 'The Palazzo', feats: [city([N]), road([E, W])], marks: [mark('palazzo', 0)] },

  // The tower turbine: a windmill built into a city wall. Every gust that runs
  // through it pays a point to whoever holds the city it belongs to, which
  // makes a city something you want the weather to keep visiting rather than
  // something you want it to leave alone.
  { id: 'Ktb', n: 3, group: 'cloud', name: 'Tower turbine',  feats: [city([N])],    marks: [mark('turbine', 0)] },
  { id: 'Ktc', n: 2, group: 'cloud', name: 'Turbine corner', feats: [city([N, W])], marks: [mark('turbine', 0)] },

  // The sfera: one edge is half a sphere and meets nothing but its other half.
  // Join two and the sky starts counting islands, for the rest of the game.
  { id: 'Kso', n: 3, group: 'cloud', name: 'Sfera',          feats: [sfera(N)] },
  { id: 'Ksr', n: 3, group: 'cloud', name: 'Sfera road',     feats: [sfera(N), road([E, W])] },
  { id: 'Ksc', n: 2, group: 'cloud', name: 'Sfera wall',     feats: [sfera(N), city([S])] },
  { id: 'Ksb', n: 2, group: 'cloud', name: 'Sfera lane',     feats: [sfera(N), road([S])] },
  { id: 'Ksx', n: 2, group: 'cloud', name: 'Sfera span',     feats: [sfera(N), city([E, W])] },

  // End caps. A city has to be able to stop somewhere, and in a country that
  // keeps being rearranged it needs to be able to stop more often than the
  // base set allows.
  { id: 'Kce', n: 5, group: 'cloud', name: 'Cloud city cap', feats: [city([N])] },

  // The windvane: four ways in, only two of them joined, and the wind decides
  // which two. Every edge matches, so it always fits — what changes is what
  // runs THROUGH it. Its city twin, the vestibule, is out: it was a four-sided
  // city, and a city with four ways in and no way to cap it is a city the
  // weather never lets you finish.
  { id: 'Kw', n: 3, group: 'cloud', name: 'Windvane',   swing: true, feats: [road([N, S]), road([E]), road([W])] },

  { id: 'Kt',  n: 3, group: 'cloud', name: 'Temple',        feats: [temple(N)] },
  { id: 'Kta', n: 0, group: 'cloud', name: 'Temple + road', feats: [temple(N), road([S])] },

  // The Abbazia: every edge is a wildcard, and everything it touches ends
  // there. Blow it away and all of that is unfinished again.
  { id: 'Kab', n: 4, group: 'cloud', name: 'Abbazia', wild: true, feats: [], marks: [mark('abbazia')] },

  // A flying machine and its strip. Placing one lets a follower fly out along
  // the way it points, riding any zephyr it crosses.
  { id: 'Kfl', n: 3, group: 'cloud', name: 'Flying machine', feats: [road([S])], marks: [mark('flier', null, N)] },

  // Not dealt: Girando swaps these in for the base 3-way junctions. They END
  // the three roads that run into them, the way the base set's do, and they
  // carry the village that grew up at the junction. Girando tried the opposite
  // for two passes — junctions that carried a road straight through, to stop
  // things closing — and the mode did not need the help.
  { id: 'Gw', n: 0, group: 'cloud', name: 'Road 3-way + village',    feats: [road([E]), road([S]), road([W])],            marks: [mark('village')] },
  { id: 'Gl', n: 0, group: 'cloud', name: 'City + 3-way + village',  feats: [city([N]), road([E]), road([S]), road([W])], marks: [mark('village')] },

  // --- mountains ------------------------------------------------------------
  // Mountain edges only meet mountain edges, so a range grows as one mass and
  // can't be joined by anything else. Passes are the only way through.
  { id: 'Pa', n: 6, group: 'mountains', name: 'Mountain spur',   feats: [mountain([N])] , fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Pb', n: 5, group: 'mountains', name: 'Mountain ridge',  feats: [mountain([N, S])] , fields: [[2, 3, 4, 5, 6, 7]] },
  { id: 'Pc', n: 5, group: 'mountains', name: 'Mountain bend',   feats: [mountain([N, E])] , fields: [[4, 5, 6, 7]] },
  { id: 'Pd', n: 3, group: 'mountains', name: 'Mountain massif', feats: [mountain([N, E, W])] , fields: [[0, 1], [4, 5]] },
  { id: 'Pe', n: 3, group: 'mountains', name: 'Mountain pass',   feats: [mountain([N, S]), road([E, W])] },
  { id: 'Pf', n: 1, group: 'mountains', name: 'The peak',        feats: [mountain([N, E, S, W])] },

  // --- forests --------------------------------------------------------------
  { id: 'Fa', n: 6, group: 'forests', name: 'Forest edge',        feats: [forest([N])] , fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Fb', n: 3, group: 'forests', name: 'Forest edge + log',  feats: [forest([N], true)] , fields: [[2, 3, 4, 5, 6, 7]] },
  { id: 'Fc', n: 3, group: 'forests', name: 'Forest across',      feats: [forest([E, W])] , fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },
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
  { id: 'Ia', n: 3, group: 'innscath', name: 'Road + inn',        feats: [road([N, S])],          marks: [mark('inn', 0)] , fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Ib', n: 3, group: 'innscath', name: 'Road bend + inn',   feats: [road([W, S])],          marks: [mark('inn', 0)] , fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },
  { id: 'Ic', n: 2, group: 'innscath', name: 'Road 3-way + inn',  feats: [road([E]), road([S]), road([W])], marks: [mark('inn', 0)] , fields: [[3, 4], [5, 6], [0, 1, 2, 7]] },
  { id: 'Id', n: 2, group: 'innscath', name: 'City + cathedral',  feats: [city([N, E, W])],       marks: [mark('cathedral', 0)] , fields: [[4, 5]] },
  { id: 'Ie', n: 2, group: 'innscath', name: 'City across + cathedral', feats: [city([E, W])],    marks: [mark('cathedral', 0)] , fields: [[0, 1], [4, 5]] },

  // --- Trade goods (Carcassonne expansion 2) --------------------------------
  { id: 'Ta', n: 3, group: 'traders', name: 'City + wine',   feats: [city([N, E])],          marks: [mark('wine', 0)] , fields: [[4, 5, 6, 7]] },
  { id: 'Tb', n: 3, group: 'traders', name: 'City + grain',  feats: [city([N, W])],          marks: [mark('grain', 0)] , fields: [[2, 3, 4, 5]] },
  { id: 'Tc', n: 3, group: 'traders', name: 'City + cloth',  feats: [city([E, W])],          marks: [mark('cloth', 0)] , fields: [[0, 1], [4, 5]] },
  { id: 'Td', n: 2, group: 'traders', name: 'City road + wine',  feats: [city([N]), road([E, W])], marks: [mark('wine', 0)] , fields: [[2, 7], [3, 4, 5, 6]] },
  { id: 'Te', n: 2, group: 'traders', name: 'City road + grain', feats: [city([N]), road([S])],    marks: [mark('grain', 0)] , fields: [[2, 3, 4], [5, 6, 7]] },

  // --- gardens: the Abbot's second seat -------------------------------------
  { id: 'Ga', n: 3, group: 'gardens', name: 'Garden',            feats: [garden()], marks: [mark('garden')] , fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Gb', n: 2, group: 'gardens', name: 'Garden + road',     feats: [garden(), road([N, S])], marks: [mark('garden')] , fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Gc', n: 2, group: 'gardens', name: 'Garden + city',     feats: [garden(), city([N])], marks: [mark('garden')] , fields: [[2, 3, 4, 5, 6, 7]] },

  // --- vineyards: 3 more for the monastery next door ------------------------
  { id: 'Va', n: 3, group: 'vineyards', name: 'Vineyard',        feats: [], marks: [mark('vineyard')] , fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Vb', n: 2, group: 'vineyards', name: 'Vineyard + road', feats: [road([W, E])], marks: [mark('vineyard')] , fields: [[7, 0, 1, 2], [3, 4, 5, 6]] },
  { id: 'Vc', n: 2, group: 'vineyards', name: 'Vineyard + city', feats: [city([N])], marks: [mark('vineyard')] , fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Princess & the Dragon, the parts that need no dragon -------------
  { id: 'Pa', n: 3, group: 'dragonset', name: 'Magic portal',        feats: [road([N, S])], marks: [mark('portal')] },
  { id: 'Pb', n: 2, group: 'dragonset', name: 'Magic portal + city', feats: [city([N])],    marks: [mark('portal')] },
  { id: 'Pc', n: 3, group: 'dragonset', name: 'City + princess',     feats: [city([N, E])], marks: [mark('princess', 0)] },
  { id: 'Pd', n: 2, group: 'dragonset', name: 'City across + princess', feats: [city([E, W])], marks: [mark('princess', 0)] },

  // --- the Festival ----------------------------------------------------------
  { id: 'Fa', n: 3, group: 'festivals', name: 'Festival',        feats: [road([N, S])], marks: [mark('festival')] },
  { id: 'Fb', n: 2, group: 'festivals', name: 'Festival + city', feats: [city([N])],    marks: [mark('festival')] },
  { id: 'Fc', n: 2, group: 'festivals', name: 'Festival + bend', feats: [road([W, S])], marks: [mark('festival')] },

  // --- Mage & Witch: the tiles that summon them ------------------------------
  { id: 'Mga', n: 3, group: 'magic', name: 'Road + magic',   feats: [road([N, S])], marks: [mark('magic')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Mgb', n: 3, group: 'magic', name: 'City + magic',   feats: [city([N])],    marks: [mark('magic')], fields: [[2, 3, 4, 5, 6, 7]] },
  { id: 'Mgc', n: 2, group: 'magic', name: 'Bend + magic',   feats: [road([W, S])], marks: [mark('magic')], fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },

  // --- the Gold Mines --------------------------------------------------------
  { id: 'Aua', n: 3, group: 'goldrush', name: 'Bend + gold', feats: [road([W, S])], marks: [mark('ingot')], fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },
  { id: 'Aub', n: 3, group: 'goldrush', name: 'City + gold', feats: [city([N])],    marks: [mark('ingot')], fields: [[2, 3, 4, 5, 6, 7]] },
  { id: 'Auc', n: 2, group: 'goldrush', name: 'Field + gold', feats: [],            marks: [mark('ingot')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- Cult places: the shrine is a monastery with a grudge ------------------
  { id: 'Cua', n: 3, group: 'cults', name: 'Shrine',         feats: [abbey()],           marks: [mark('cult')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Cub', n: 2, group: 'cults', name: 'Shrine + road',  feats: [abbey(), road([S])], marks: [mark('cult')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- Crop circles ----------------------------------------------------------
  { id: 'Cca', n: 2, group: 'crops', name: 'Crop circle (farms)',  feats: [],             marks: [{ ...mark('crop'), crop: 'field' }], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Ccb', n: 2, group: 'crops', name: 'Crop circle (roads)',  feats: [road([N, S])], marks: [{ ...mark('crop'), crop: 'road' }],  fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Ccc', n: 2, group: 'crops', name: 'Crop circle (cities)', feats: [city([N])],    marks: [{ ...mark('crop'), crop: 'city' }],  fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Besiegers ---------------------------------------------------------
  { id: 'Sga', n: 2, group: 'sieges', name: 'Besieged city across', feats: [city([E, W], true)], marks: [mark('siege', 0)], fields: [[0, 1], [4, 5]] },
  { id: 'Sgb', n: 2, group: 'sieges', name: 'Besieged city corner', feats: [city([N, W])],       marks: [mark('siege', 0)], fields: [[2, 3, 4, 5]] },
  { id: 'Sgc', n: 1, group: 'sieges', name: 'Besieged city 3-side', feats: [city([N, E, W])],    marks: [mark('siege', 0)], fields: [[4, 5]] },

  // --- the Watchtowers -------------------------------------------------------
  { id: 'Wta', n: 3, group: 'watchtowers', name: 'Road + watchtower', feats: [road([N, S])], marks: [mark('watch')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Wtb', n: 3, group: 'watchtowers', name: 'City + watchtower', feats: [city([N])],    marks: [mark('watch')], fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Wind Roses: one per quadrant of the sky ---------------------------
  { id: 'WrNE', n: 1, group: 'windroses', name: 'Wind rose NE', feats: [], marks: [mark('rose')], quad: 'NE', fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'WrSE', n: 1, group: 'windroses', name: 'Wind rose SE', feats: [], marks: [mark('rose')], quad: 'SE', fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'WrSW', n: 1, group: 'windroses', name: 'Wind rose SW', feats: [], marks: [mark('rose')], quad: 'SW', fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'WrNW', n: 1, group: 'windroses', name: 'Wind rose NW', feats: [], marks: [mark('rose')], quad: 'NW', fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- the Tunnel: a dead end that isn't one ---------------------------------
  // The road runs into the hill; the field wraps around the mouth, so the tile
  // has ONE field for all that the road is on it.
  { id: 'Tna', n: 4, group: 'tunnels', name: 'Tunnel mouth', feats: [road([N])], marks: [mark('tunnel')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- the Plague ------------------------------------------------------------
  { id: 'Pga', n: 2, group: 'plagues', name: 'Outbreak',        feats: [],             marks: [mark('plague')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Pgb', n: 1, group: 'plagues', name: 'Outbreak + road', feats: [road([N, S])], marks: [mark('plague')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },

  // --- the Robbers -----------------------------------------------------------
  { id: 'Rba', n: 2, group: 'robbers', name: 'Road + robber',  feats: [road([N, S])], marks: [mark('swag')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Rbb', n: 2, group: 'robbers', name: 'City + robber',  feats: [city([N])],    marks: [mark('swag')], fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Peasant Revolts ---------------------------------------------------
  { id: 'Rva', n: 1, group: 'revolts', name: 'Revolt (cities)',     feats: [], marks: [{ ...mark('revolt'), revolt: 'city' }], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Rvb', n: 1, group: 'revolts', name: 'Revolt (roads)',      feats: [], marks: [{ ...mark('revolt'), revolt: 'road' }], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Rvc', n: 1, group: 'revolts', name: 'Revolt (cloisters)',  feats: [], marks: [{ ...mark('revolt'), revolt: 'monastery' }], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- the Signposts ---------------------------------------------------------
  { id: 'Sna', n: 2, group: 'signposts', name: 'Road + signpost', feats: [road([N, S])], marks: [mark('signpost', 0)], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Snb', n: 2, group: 'signposts', name: 'Bend + signpost', feats: [road([W, S])], marks: [mark('signpost', 0)], fields: [[5, 6], [0, 1, 2, 3, 4, 7]] },

  // --- the Fruit-Bearing Trees -----------------------------------------------
  { id: 'Fta', n: 2, group: 'orchards', name: 'Fruit tree',        feats: [],             marks: [mark('fruit')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Ftb', n: 2, group: 'orchards', name: 'Fruit tree + road', feats: [road([N, S])], marks: [mark('fruit')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },

  // --- Hills & Sheep: the high ground ----------------------------------------
  { id: 'Hla', n: 2, group: 'hillsg', name: 'Hill + road', feats: [road([N, S])], marks: [mark('hillmark')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Hlb', n: 2, group: 'hillsg', name: 'Hill + city', feats: [city([N])],    marks: [mark('hillmark')], fields: [[2, 3, 4, 5, 6, 7]] },

  // --- Under the Big Top: the acrobats ---------------------------------------
  { id: 'Aca', n: 2, group: 'circusg', name: 'Acrobats',        feats: [],             marks: [mark('ring')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Acb', n: 2, group: 'circusg', name: 'Acrobats + road', feats: [road([N, S])], marks: [mark('ring')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },

  // --- the big top itself ------------------------------------------------------
  { id: 'Bga', n: 3, group: 'bigtopg', name: 'Big top',        feats: [],             marks: [mark('bigtop')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Bgb', n: 2, group: 'bigtopg', name: 'Big top + road', feats: [road([N, S])], marks: [mark('bigtop')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },

  // --- the School --------------------------------------------------------------
  { id: 'Sca', n: 1, group: 'schools', name: 'The school', feats: [road([E, W])], marks: [mark('school', 0)], fields: [[7, 0, 1, 2], [3, 4, 5, 6]] },

  // --- the Barber-Surgeons ---------------------------------------------------
  { id: 'Bta', n: 2, group: 'baths', name: 'Bathhouse',        feats: [road([N, S])], marks: [mark('bath')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Btb', n: 1, group: 'baths', name: 'Bathhouse + city', feats: [city([N])],    marks: [mark('bath')], fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Princess & the Dragon: the fire half ------------------------------
  { id: 'Dva', n: 3, group: 'dragonfire', name: 'Volcano',       feats: [],             marks: [mark('volcano')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Dvb', n: 4, group: 'dragonfire', name: 'Dragon + road', feats: [road([N, S])], marks: [mark('dragonmark')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Dvc', n: 2, group: 'dragonfire', name: 'Dragon + city', feats: [city([N])],    marks: [mark('dragonmark')], fields: [[2, 3, 4, 5, 6, 7]] },

  // --- the Tower --------------------------------------------------------------
  { id: 'Twa', n: 3, group: 'towersg', name: 'Tower + road', feats: [road([N, S])], marks: [mark('towerbase')], fields: [[1, 2, 3, 4], [0, 5, 6, 7]] },
  { id: 'Twb', n: 2, group: 'towersg', name: 'Tower',        feats: [],             marks: [mark('towerbase')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

  // --- the Ferries ------------------------------------------------------------
  // Several roads end at the lake; the ferry decides which two are really one.
  { id: 'Fya', n: 3, group: 'ferriesg', name: 'Ferry lake (3 roads)', feats: [road([N]), road([E]), road([W])], marks: [mark('lakef')], fields: [[1, 2], [0, 7], [3, 4, 5, 6]] },
  { id: 'Fyb', n: 2, group: 'ferriesg', name: 'Ferry lake (4 roads)', feats: [road([N]), road([E]), road([S]), road([W])], marks: [mark('lakef')], fields: [[1, 2], [3, 4], [5, 6], [0, 7]] },

  // --- monasteries of the world ----------------------------------------------
  { id: 'Rmd', n: 3, group: 'abbeyDE', name: 'German monastery',  feats: [abbey()], marks: [mark('special')], fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },
  { id: 'Rmj', n: 3, group: 'abbeyJP', name: 'Japanese building', feats: [abbey()], marks: [mark('pagoda')],  fields: [[0, 1, 2, 3, 4, 5, 6, 7]] },

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
 * The ship. One per player, in their colour, held rather than drawn — the only
 * piece on the board that belongs to somebody. Every edge is a DOCK, so it
 * moors anywhere and does nothing at all to what it moors against: unlike the
 * Abbazia it caps no road and walls no city. What it does is sit there being
 * yours, and pay you for what the island it's tied to finishes.
 */
export const SHIP_TILE = {
  id: 'SHIP', n: 0, group: 'ship', name: 'Sky ship',
  dock: true, ground: 'sky', feats: [], marks: [mark('ship')],
};

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

  // expansions: the ones that ride on a tile symbol
  garden:    { label: 'Garden',    score: 0, note: 'An abbot may keep a garden as well as a cloister.' },
  vineyard:  { label: 'Vineyard',  score: 0, note: 'Adds 3 to a monastery beside it when that monastery closes.' },
  portal:    { label: 'Magic portal', score: 0, note: 'Claim anything unfinished anywhere on the board instead of this tile.' },
  princess:  { label: 'Princess',  score: 0, note: 'Lay it into a city and you may send a knight already there home.' },
  festival:  { label: 'Festival',  score: 0, note: 'Take one of your own followers back off the board instead of claiming.' },

  magic:    { label: 'Magic symbol', score: 0, note: 'The mage or the witch must be placed or moved when this is laid.' },
  ingot:    { label: 'Gold vein',  score: 0, note: 'Two ingots land here and nearby; whoever closes the feature under them takes them.' },
  cult:     { label: 'Shrine',     score: 0, note: 'A heretic shrine. Placed near a monastery it starts a race — first to close wins, the loser takes nothing.' },
  crop:     { label: 'Crop circle', score: 0, note: 'Everyone adds a follower beside one of theirs of this kind — or everyone takes one back.' },
  siege:    { label: 'Siege camp', score: 0, note: 'This city is under siege and worth half.' },
  watch:    { label: 'Watchtower', score: 0, note: 'Pays its holder for every follower near the tower when its feature closes.' },
  rose:     { label: 'Wind rose',  score: 0, note: 'Placed in its quadrant of the map, it pays 3 on the spot.' },
  tunnel:   { label: 'Tunnel mouth', score: 0, note: 'Roads into tunnels pair up: the next tunnel placed joins this road to it.' },
  plague:   { label: 'Outbreak',   score: 0, note: 'Every follower in the surrounding eight tiles is sent home.' },

  volcano:  { label: 'Volcano', score: 0, note: 'The dragon flies here the moment it erupts.' },
  dragonmark: { label: 'Dragon', score: 0, note: 'The dragon rampages six tiles, eating every follower it lands on.' },
  towerbase: { label: 'Tower foundation', score: 0, note: 'Build floors here; each floor extends the tower’s reach for capturing followers.' },
  lakef:    { label: 'Ferry lake', score: 0, note: 'A ferry joins two of the roads that end at this lake.' },
  special:  { label: 'Regional monastery', score: 0, note: 'Left unfinished, it pays 1 per tile in the unbroken row and column it commands.' },
  pagoda:   { label: 'Japanese building', score: 0, note: 'Left unfinished, it pays 1 per tile in the unbroken row and column it commands.' },
  bigtop:   { label: 'The big top', score: 0, note: 'The circus pitches here; when it moves on, everyone around the old ground gets paid.' },
  school:   { label: 'The school', score: 0, note: 'Close the road it stands on and the teacher follows you for a while.' },
  hillmark: { label: 'Hill', score: 0, note: 'High ground: whoever stands on more hills wins a tied majority outright.' },
  ring:     { label: 'Acrobats’ ring', score: 0, note: 'Followers stack into a pyramid here; the third one in pays everyone 5.' },
  bath:     { label: 'Bathhouse', score: 0, note: 'Move one of your followers from anywhere on the board to a feature on this tile.' },
  swag:     { label: 'Robber’s bag', score: 0, note: 'Post your robber on an opponent — you take half of the next thing they score.' },
  revolt:   { label: 'Peasant revolt', score: 0, note: 'Your lone followers on the named feature type flee home; paired ones stand firm for +2.' },
  signpost: { label: 'Signpost', score: 0, note: 'Adds 2 to its road when the road closes.' },
  fruit:    { label: 'Fruit tree', score: 0, note: 'The next four tiles laid beside it each pay their placer 1.' },

  // cloud
  turbine: { label: 'Tower turbine', score: 0, note: 'Pays 1 to whoever holds its city every time a gust runs through it.' },
  palazzo: { label: 'The Palazzo', score: 0, note: 'The seat of the kingdom. The island it sits on is worth double when a sphere closes.' },
  zephyr:  { label: 'Zephyr',  score: 0, note: 'Blows its lane when played, and again whenever the wind reaches it. Gusts stack up to three squares.' },
  abbazia: { label: 'Abbazia', score: 0, note: 'Caps every feature it touches — and un-caps them if the wind takes it away.' },
  flier:   { label: 'Flying machine', score: 0, note: 'Place it and a follower may fly out along it, riding any zephyr it crosses.' },
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
    if (t.wild) t.edges = [CAP, CAP, CAP, CAP];
    if (t.dock) t.edges = [DOCK, DOCK, DOCK, DOCK];
    for (const f of t.feats) {
      if (f.shield) t.shields++;
      if (t.wild || t.dock) continue;          // an Abbazia or a ship takes anything
      for (const s of f.sides) t.edges[s] = EDGE_LETTER[f.type] || 'r';
    }

    // Fields become real features, appended AFTER the edge letters are worked
    // out — a field reaches no side, presents no letter, and must not disturb
    // the indices anything else already refers to. `touches` is the set of city
    // features this field lies against, which is the only thing a farm needs
    // to know at the end of the game.
    t.fieldCount = 0;
    for (const halves of t.fields || []) {
      t.feats.push({ type: 'field', sides: [], halves, touches: citiesBeside(t, halves) });
      t.fieldCount++;
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
prepare([SHIP_TILE]);

export const TILES = Object.fromEntries(
  [...TILE_TYPES, ...CAVE_TYPES, ...CITY_TYPES, ...RIVER_TYPES, ABBEY_TILE, SHIP_TILE]
    .map((t) => [t.id, t]));

/** The river pool, spring and mouth held back to bookend it. */
export function buildRiverDeck(rng = Math.random, { long = false } = {}) {
  const deck = [];
  for (const t of RIVER_TYPES) {
    if (t.id === RIVER_SPRING || t.id === RIVER_MOUTH) continue;
    for (let i = 0; i < t.n; i++) deck.push(t.id);
  }
  // River II: the printed second river is longer and busier. The fork it adds
  // isn't modelled yet, so this is the length without the branch.
  if (long) deck.push('w1', 'w1', 'w2', 'w2', 'w3', 'w7');
  return shuffle(deck, rng);
}

// Declared as a function so it's hoisted above the prepare() calls that run
// at module load — a const arrow here is a temporal-dead-zone crash.
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/** Meeple anchor point for a feature, in unit tile space (0..1). */
/**
 * Which cities a field lies against.
 *
 * Walking the eight half-edges as a ring, a field touches a city when one of
 * its halves sits immediately beside a half the city owns. That is exactly the
 * distinction the artwork makes and a simpler "same tile" test misses: on the
 * city-and-road-through tile both fields share the tile with the city, but only
 * the strip above the road actually runs up against its walls.
 */
function citiesBeside(t, halves) {
  const out = new Set();
  const owner = new Map();                       // half-edge -> feature index
  t.feats.forEach((f, i) => {
    if (f.type !== 'city') return;
    for (const s of f.sides) for (const h of HALVES_OF_SIDE[s]) owner.set(h, i);
  });
  for (const h of halves) {
    for (const n of [(h + 7) % 8, (h + 1) % 8]) {
      if (owner.has(n)) out.add(owner.get(n));
    }
  }
  return [...out];
}

function featureSpot(f) {
  if (f.type === 'monastery') return [0.5, 0.5];
  // A farmer lies in the middle of his own ground: the average of the field's
  // half-edges, pulled off the rim so he isn't standing in the seam.
  if (f.type === 'field') {
    if (!f.halves.length) return [0.5, 0.5];
    let fx = 0, fy = 0;
    for (const h of f.halves) { fx += HALF_MID[h][0]; fy += HALF_MID[h][1]; }
    fx /= f.halves.length; fy /= f.halves.length;
    return [0.5 + (fx - 0.5) * 0.54, 0.5 + (fy - 0.5) * 0.54];
  }
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

/**
 * The same tile, with a bridge across it.
 *
 * A bridge is not an edit to the landscape — it is a road held OVER it, which
 * is why this is a derived type rather than a mutation: the extra road feature
 * is appended after everything the tile already had (fields included), so
 * every feature index, meeple reference and scored-part key stays exactly
 * where it was, and the fields underneath are never divided. `sides` is in the
 * tile's own canonical frame.
 */
export function bridgedType(type, sides) {
  const span = { type: 'road', sides, bridge: true };
  const t = {
    ...type,
    feats: [...type.feats, span],
    edges: [...type.edges],
    spots: [...type.spots, [0.5, 0.5]],
    bridged: true,
  };
  for (const s of sides) t.edges[s] = 'r';
  return t;
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
