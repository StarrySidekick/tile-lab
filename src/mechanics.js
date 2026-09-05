// ---------------------------------------------------------------------------
// The Workshop catalogue — every rule the game knows about, as data.
//
// The idea is the one the current Carcassonne rulebook states outright: "You
// can also choose to use only some elements from an expansion and not others."
// So nothing in here is bundled. Inns & Cathedrals is not one switch, it is
// three — the big follower, the inn and the cathedral — and each of them is a
// row you can tick on its own.
//
// That principle is taken one layer further down than the printed game goes:
// the BASE LAYER is a set of switches too. Cities, roads, fields, cloisters,
// followers and pennants are rules Carcassonne happens to ship with, not laws
// of physics, and a workshop that can't take the roads out isn't a workshop.
// They default on; turning one off pulls its tiles out of the pool and stops
// it paying.
//
// Each entry is DATA and nothing else:
//
//   id       what game.has() is asked about, and what the URL/state key is
//   layer    which section of the panel it lives in
//   pack     the box it came out of, used as a sub-heading
//   name     the row label
//   note     the tooltip — what the rule actually does
//   on       true for the base layer: on unless you turn it off
//   status   'live'    — implemented and playable
//            'partial' — implemented, but not to the letter (see the note)
//            'planned' — catalogued only; the row is there, the rule isn't
//   groups   tile groups switching this on should switch on too
//   needs    other mechanics this one is meaningless without
//   wiki     the WikiCarpedia page for the real rule
//   since    which editions of the printed game have it
//
// The BEHAVIOUR lives in game.js and board.js. This file is the catalogue and
// the shared helpers, and it is the only place a new rule has to be named.
// ---------------------------------------------------------------------------

import { keyOf } from './board.js';
import { SIDE_STEP, MARKS, NO_MEEPLE } from './tiles.js';

const wiki = (slug) => `https://wikicarpedia.com/car/${slug}`;

// ---------------------------------------------------------------------------
// Editions.
//
// Carcassonne has been revised twice, and the revisions are not cosmetic — the
// farm rule in particular has been three different rules. Picking an edition
// here changes the constants the scoring reads, so "the old rules" is a switch
// rather than a fork.
// ---------------------------------------------------------------------------

export const RULESETS = [
  {
    id: 'c3',
    name: 'Current (3rd ed.)',
    note: 'The 2021 edition and its 2024 anniversary revision. The River and '
      + 'the Abbot are part of the base box, and a field pays 3 per completed '
      + 'city touching it, from the field outwards.',
    farmPerCity: 3,
    farmPerField: true,
    baseIncludes: ['river', 'abbot', 'garden'],
  },
  {
    id: 'c2',
    name: '2nd edition',
    note: 'The 2014 redesign. Same farm rule as now — 3 per completed city, '
      + 'scored from each field outwards — but the River is a separate '
      + 'mini-expansion again.',
    farmPerCity: 3,
    farmPerField: true,
    baseIncludes: [],
  },
  {
    id: 'c1',
    name: 'Original (2000)',
    note: 'The award-winning first printing, before the farm rule was rewritten. '
      + 'A completed city was worth 4, counted once from the city rather than '
      + 'from each field — so a city feeding two farms paid one of them, not '
      + 'both. Approximated here at 4 per field.',
    farmPerCity: 4,
    farmPerField: true,
    baseIncludes: [],
  },
];

export const RULESET_BY_ID = Object.fromEntries(RULESETS.map((r) => [r.id, r]));
export const DEFAULT_RULESET = 'c3';

// ---------------------------------------------------------------------------
// Panel layers, in the order they stack.
// ---------------------------------------------------------------------------

export const LAYERS = [
  {
    id: 'base',
    name: 'Base layer',
    note: 'The rules Carcassonne is made of. On unless you take them out.',
  },
  {
    id: 'exp',
    name: 'Major expansions',
    note: 'The ten numbered boxes, broken into the individual rules inside them.',
  },
  {
    id: 'mini',
    name: 'Mini-expansions',
    note: 'The small ones — a handful of tiles and one idea each.',
  },
  {
    id: 'promo',
    name: 'Promos & one-offs',
    note: 'Magazine inserts, convention tiles, and the alternative base games.',
  },
  {
    id: 'lab',
    name: 'Workshop originals',
    note: 'Rules this sandbox invented, or lifted out of one of its own modes.',
  },
];

// Kept under its old name because game.js and the tools import it.
export const MECHANIC_GROUPS = LAYERS;

// ---------------------------------------------------------------------------
// The catalogue.
// ---------------------------------------------------------------------------

export const MECHANICS = [
  // --- the base layer -------------------------------------------------------
  {
    id: 'cities', layer: 'base', name: 'Cities',
    note: 'Walled cities that merge across tile edges. 2 a tile while the game '
      + 'runs, 1 a tile if they never close. Off pulls every city tile out of the pool.',
    on: true, status: 'live', wiki: wiki('Base_game'), since: 'all',
  },
  {
    id: 'roads', layer: 'base', name: 'Roads',
    note: 'Roads that run until they hit a junction, a city gate or a cloister. '
      + '1 a tile either way. Off pulls every road tile out of the pool.',
    on: true, status: 'live', wiki: wiki('Base_game'), since: 'all',
  },
  {
    id: 'fields', layer: 'base', name: 'Fields',
    note: 'Farmers, lying down, scored only at the very end: 3 for every '
      + 'completed city their field touches — 4 under the original rules. '
      + 'A farmer never comes home.',
    on: true, status: 'live', needs: ['meeple'], wiki: wiki('Farmers'), since: 'all',
  },
  {
    id: 'cloisters', layer: 'base', name: 'Cloisters',
    note: 'A monastery pays 1 for itself and 1 for each of the eight tiles '
      + 'around it, and closes at 9. Off pulls every cloister tile out of the pool.',
    on: true, status: 'live', wiki: wiki('Base_game'), since: 'all',
  },
  {
    id: 'meeple', layer: 'base', name: 'Followers',
    note: 'Seven wooden followers each, and the majority rule that makes every '
      + 'placement an argument. Off, a feature simply pays whoever closed it.',
    on: true, status: 'live', wiki: wiki('Base_game'), since: 'all',
  },
  {
    id: 'pennants', layer: 'base', name: 'Pennants',
    note: 'The coats of arms on some city tiles, each worth an extra tile\'s '
      + 'worth of city. Off, a shield is decoration.',
    on: true, status: 'live', needs: ['cities'], wiki: wiki('Base_game'), since: 'all',
  },

  // --- Exp. 1: Inns & Cathedrals -------------------------------------------
  {
    id: 'bigMeeple', layer: 'exp', pack: 'Exp. 1 — Inns & Cathedrals (2002)',
    name: 'Big follower',
    note: 'One large follower each, counting as two when majorities are worked out.',
    status: 'live', needs: ['meeple'], wiki: wiki('Inns_and_Cathedrals'), since: 'all',
  },
  {
    id: 'inns', layer: 'exp', pack: 'Exp. 1 — Inns & Cathedrals (2002)',
    name: 'Inns',
    note: 'An inn on the lake doubles its road when it closes — and makes it '
      + 'worth nothing at all if the game ends with it open.',
    status: 'live', needs: ['roads'], groups: ['innscath'],
    wiki: wiki('Inns_and_Cathedrals'), since: 'all',
  },
  {
    id: 'cathedrals', layer: 'exp', pack: 'Exp. 1 — Inns & Cathedrals (2002)',
    name: 'Cathedrals',
    note: 'A cathedral makes its city 3 a tile — and per coat of arms — when it '
      + 'closes, and nothing at all if it never does. (The C3.1 rules dropped '
      + 'that penalty; this is the C1–C3 reading.)',
    status: 'live', needs: ['cities'], groups: ['innscath'],
    wiki: wiki('Inns_and_Cathedrals'), since: 'all',
  },

  // --- Exp. 2: Traders & Builders ------------------------------------------
  {
    id: 'goods', layer: 'exp', pack: 'Exp. 2 — Traders & Builders (2003)',
    name: 'Trade goods',
    note: 'Wine, grain and cloth go to whoever closes the city holding them. '
      + 'Most of each at the end is worth 10.',
    status: 'live', needs: ['cities'], groups: ['traders'],
    wiki: wiki('Traders_and_Builders'), since: 'all',
  },
  {
    id: 'builder', layer: 'exp', pack: 'Exp. 2 — Traders & Builders (2003)',
    name: 'Builder',
    note: 'Extend a feature you already have a follower on and you get another '
      + 'tile this turn. Once per turn.',
    status: 'live', needs: ['meeple'], wiki: wiki('Traders_and_Builders'), since: 'all',
  },
  {
    id: 'pig', layer: 'exp', pack: 'Exp. 2 — Traders & Builders (2003)',
    name: 'Pig',
    note: 'A pig joins one of your farms and makes every completed city beside '
      + 'it worth 4 instead of 3 — but only if you hold the majority there.',
    status: 'live', needs: ['fields'], wiki: wiki('Traders_and_Builders'), since: 'all',
  },

  // --- Exp. 3: The Princess & The Dragon -----------------------------------
  {
    id: 'dragon', layer: 'exp', pack: 'Exp. 3 — Princess & Dragon (2005) · C3.1: Dragon & Fairy',
    name: 'Dragon',
    note: 'Woken by a dragon tile, it rampages six tiles and eats every '
      + 'follower it lands on. The printed game hands each step to the '
      + 'players in turn; here the beast hunts on its own.',
    status: 'partial', needs: ['volcano'], groups: ['dragonfire'],
  },
  {
    id: 'volcano', layer: 'exp', pack: 'Exp. 3 — Princess & Dragon (2005) · C3.1: Dragon & Fairy',
    name: 'Volcanoes',
    note: 'A volcano erupts and the dragon wheels down onto it — nothing '
      + 'rampages until a dragon tile follows.',
    status: 'live', groups: ['dragonfire'],
  },
  {
    id: 'fairy', layer: 'exp', pack: 'Exp. 3 — Princess & Dragon (2005) · C3.1: Dragon & Fairy',
    name: 'Fairy',
    note: 'Call her to stand guard beside a follower: 1 at the start of your '
      + 'turn, 3 when the guarded feature scores, and neither dragon nor '
      + 'tower dares touch her tile. She picks the follower nearest the dragon.',
    status: 'partial', needs: ['meeple'],
  },
  {
    id: 'princess', layer: 'exp', pack: 'Exp. 3 — Princess & Dragon (2005) · C3.1: Dragon & Fairy',
    name: 'Princess',
    note: 'Lay the princess into a city and you may send a knight already in it '
      + 'home — instead of claiming anything yourself.',
    status: 'live', needs: ['cities'], groups: ['dragonset'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },
  {
    id: 'portal', layer: 'exp', pack: 'Exp. 3 — Princess & Dragon (2005) · C3.1: Dragon & Fairy',
    name: 'Magic portals',
    note: 'A portal tile lets you place your follower onto any unfinished, '
      + 'unclaimed feature anywhere on the board instead of onto the tile you '
      + 'just laid.',
    status: 'live', needs: ['meeple'], groups: ['dragonset'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },

  // --- Exp. 4: The Tower ---------------------------------------------------
  {
    id: 'tower', layer: 'exp', pack: 'Exp. 4 — The Tower (2006) · C3.1: Towers & Thieves (new mechanic)',
    name: 'Towers',
    note: 'Add a floor instead of claiming, and the tower seizes an enemy '
      + 'follower within its reach — a tile per floor, four ways. Ransom '
      + 'comes due at 3, paid automatically on the owner’s turn.',
    status: 'partial', needs: ['meeple'], groups: ['towersg'],
  },

  // --- Exp. 5: Abbey & Mayor -----------------------------------------------
  {
    id: 'abbey', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007) · C3.1: Messengers & Mayors',
    name: 'Abbey tile',
    note: 'One abbey each, played instead of your tile into a hole surrounded '
      + 'on all four sides. It scores as a monastery, so it is always worth 9.',
    status: 'live', wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'mayor', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007) · C3.1: Messengers & Mayors',
    name: 'Mayor',
    note: 'Goes only into cities, and counts not as one follower but as one per '
      + 'pennant in the city he stands in — so he is worth nothing in a city '
      + 'that has none.',
    status: 'live', needs: ['cities', 'pennants'], wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'wagon', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007) · C3.1: Messengers & Mayors',
    name: 'Wagon',
    note: 'When a feature scores, a follower on it steps along the road to the '
      + 'next unclaimed, unfinished thing instead of going home.',
    status: 'live', needs: ['meeple'], wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'barn', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007) · C3.1: Messengers & Mayors',
    name: 'Barn',
    note: 'A barn settles its farm early at today’s rate, sends the farmers '
      + 'home, and keeps the field for good at a point more per city. Placed '
      + 'on the field rather than the printed four-corner join.',
    status: 'partial', needs: ['fields'],
  },

  // --- Exp. 6: Count, King & Robber ----------------------------------------
  {
    id: 'count', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008) · C3.1: Jousts & Crests',
    name: 'The Count of Carcassonne',
    note: 'A four-tile city sits off one corner of the board. Followers sent '
      + 'into its quarters can be moved out into whatever just scored nearby.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Count_of_Carcassonne'), since: 'all',
  },
  {
    id: 'king', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008) · C3.1: Jousts & Crests',
    name: 'The King',
    note: 'Whoever finished the largest city scores 1 for every completed city '
      + 'on the board at the end.',
    status: 'live', needs: ['cities'], wiki: wiki('King_and_Robber_Baron'), since: 'all',
  },
  {
    id: 'robberBaron', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008) · C3.1: Jousts & Crests',
    name: 'The Robber Baron',
    note: 'The same bargain for roads: longest one finished takes 1 per '
      + 'completed road at the end.',
    status: 'live', needs: ['roads'], wiki: wiki('King_and_Robber_Baron'), since: 'all',
  },
  {
    id: 'cult', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008) · C3.1: Jousts & Crests',
    name: 'Cult places (shrines)',
    note: 'A shrine within sight of a cloister starts a race: the first of the '
      + 'two to close scores, and the loser is voided on the spot, its keeper '
      + 'going home with nothing.',
    status: 'live', needs: ['cloisters'], groups: ['cults'], wiki: wiki('The_Cult'), since: 'all',
  },
  {
    id: 'riverII', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008) · C3.1: Jousts & Crests',
    name: 'The River II',
    note: 'A longer, busier river. The fork — the printed set’s one big idea — '
      + 'isn’t modelled yet, so this is the length without the branch.',
    status: 'partial', needs: ['river'],
  },

  // --- Exp. 7: The Catapult ------------------------------------------------
  {
    id: 'catapult', layer: 'exp', pack: 'Exp. 7 — The Catapult (2008, C1 only) · C3.1: Siege & Defense',
    name: 'The Catapult',
    note: 'Physically flick wooden discs across the table to knock followers '
      + 'over, catch them, or seduce them. Never reissued after the 1st edition.',
    status: 'planned', wiki: wiki('The_Catapult'), since: 'c1',
  },

  // --- Exp. 8: Bridges, Castles and Bazaars --------------------------------
  {
    id: 'bridge', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles & Bazaars (2010) · C3.1: Castles & Bridges (barns replace bazaars)',
    name: 'Bridges',
    note: 'Three bridges each. After placing, throw one across the tile just '
      + 'laid or a neighbour — it carries a road high over the field, which '
      + 'is never divided, and joins whatever its two ends meet. The printed '
      + 'trick of legalising an otherwise-impossible placement isn’t modelled.',
    status: 'partial', needs: ['roads'],
  },
  {
    id: 'castle', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles & Bazaars (2010) · C3.1: Castles & Bridges (barns replace bazaars)',
    name: 'Castles',
    note: 'Convert a completed two-tile city into a castle, and it pays out the '
      + 'value of the next thing that scores anywhere near it.',
    status: 'planned', needs: ['cities'], wiki: wiki('Bridges,_Castles_and_Bazaars'), since: 'all',
  },
  {
    id: 'bazaar', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles & Bazaars (2010) · C3.1: Castles & Bridges (barns replace bazaars)',
    name: 'Bazaars',
    note: 'A bazaar tile stops the game for an auction: tiles go under the '
      + 'hammer and the money changes hands between players.',
    status: 'planned', wiki: wiki('Bridges,_Castles_and_Bazaars'), since: 'all',
  },

  // --- Exp. 9: Hills & Sheep -----------------------------------------------
  {
    id: 'hills', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014) · C3.1: Sheep & Shepherds (geese replace hills)',
    name: 'Hills',
    note: 'High ground settles arguments: a tied majority goes outright to '
      + 'whoever has more followers standing on hills. The hidden tile under '
      + 'each hill isn’t modelled.',
    status: 'partial', needs: ['meeple'], groups: ['hillsg'],
  },
  {
    id: 'sheep', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014) · C3.1: Sheep & Shepherds (geese replace hills)',
    name: 'Shepherds & sheep',
    note: 'Put a shepherd in a field and grow the flock each time the field '
      + 'grows — or herd it home for a point a sheep. Two wolves in the bag '
      + 'take everything.',
    status: 'live', needs: ['fields'],
  },
  {
    id: 'vineyards', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014) · C3.1: Sheep & Shepherds (geese replace hills)',
    name: 'Vineyards',
    note: 'A vineyard adds 3 to any monastery it neighbours, when that monastery '
      + 'closes. The C3.1 rules extend it to gardens too.',
    status: 'live', needs: ['cloisters'], groups: ['vineyards'], wiki: wiki('Hills_and_Sheep'), since: 'c2',
  },

  // --- Exp. 10: Under the Big Top ------------------------------------------
  {
    id: 'circus', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017) · C3.1: Circus & Artists',
    name: 'The big top',
    note: 'The tent moves from big-top tile to big-top tile, and each move '
      + 'pays 2 per follower around the ground it leaves.',
    status: 'partial', needs: ['meeple'], groups: ['bigtopg'],
  },
  {
    id: 'acrobats', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017) · C3.1: Circus & Artists',
    name: 'Acrobats',
    note: 'Followers stack into a pyramid on an acrobat tile — anyone’s. The '
      + 'third one up pays every member 5 and the troupe takes a bow.',
    status: 'live', needs: ['meeple'], groups: ['circusg'],
  },
  {
    id: 'ringmaster', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017) · C3.1: Circus & Artists',
    name: 'Ringmaster',
    note: 'Scores for every acrobat troupe and circus tile already on the board '
      + 'when he takes the ring.',
    status: 'planned', needs: ['circus'], wiki: wiki('Under_the_Big_Top'), since: 'c2',
  },

  // --- mini-expansions ------------------------------------------------------
  {
    id: 'river', layer: 'mini', pack: 'The River (2001)', name: 'The River',
    note: 'Laid first, spring to lake, and it may not double back on itself. '
      + 'Part of the base box since the current edition.',
    status: 'live', wiki: wiki('The_River'), since: 'all',
  },
  {
    id: 'abbot', layer: 'mini', pack: 'The Abbot (2016)', name: 'The Abbot',
    note: 'A second kind of follower for cloisters, who can be called home on '
      + 'your turn instead of placing, scoring his monastery as it stands. '
      + 'Gardens aren’t modelled yet, so he keeps to monasteries.',
    status: 'live', needs: ['cloisters'], wiki: wiki('The_Abbot'), since: 'c2',
  },
  {
    id: 'garden', layer: 'mini', pack: 'The Abbot (2016)', name: 'Gardens',
    note: 'The little walled gardens the abbot can also sit in — and nobody '
      + 'else may. They close and pay exactly as a cloister does.',
    status: 'live', needs: ['abbot'], groups: ['gardens'],
    wiki: wiki('The_Abbot'), since: 'c3',
  },
  {
    id: 'flier', layer: 'mini', pack: 'The Flying Machines (2012)', name: 'Flying machines',
    note: 'Put a follower in the machine, roll 1–3, and it lands that many tiles '
      + 'away on whatever unfinished thing is there — occupied or not.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Flier'), since: 'all',
  },
  {
    id: 'messengers', layer: 'mini', pack: 'The Messengers (2012)', name: 'Messengers',
    note: 'Land your score exactly on a multiple of five and a message arrives: '
      + 'the engine reads it and takes the better of the printed choices. The '
      + 'second scoring figure isn’t modelled.',
    status: 'partial',
  },
  {
    id: 'ferries', layer: 'mini', pack: 'The Ferries (2013)', name: 'Ferries',
    note: 'Several roads end at the lake; a ferry decides which two are really '
      + 'one. The engine moors it where it does the most; repositioning '
      + 'isn’t modelled yet.',
    status: 'partial', needs: ['roads'], groups: ['ferriesg'],
  },
  {
    id: 'goldmines', layer: 'mini', pack: 'The Gold Mines (2014)', name: 'Gold mines',
    note: 'Ingots pile onto tiles and go to whoever holds the feature under '
      + 'them when it closes. Worth more the more you mined: 1 each up to 3, up '
      + 'to 4 each past 9. The second ingot lands where the engine judges best.',
    status: 'partial', groups: ['goldrush'], wiki: wiki('The_Gold_Mines'), since: 'all',
  },
  {
    id: 'mageWitch', layer: 'mini', pack: 'Mage & Witch (2014)', name: 'Mage & witch',
    note: 'A magic tile forces one of the pair onto an unfinished road or city: '
      + 'the mage adds 1 a tile to whatever he stands on, the witch halves it, '
      + 'rounded up. They never share a feature.',
    status: 'live', groups: ['magic'], wiki: wiki('The_Mage_and_the_Witch'), since: 'all',
  },
  {
    id: 'robbers', layer: 'mini', pack: 'The Robbers (2015)', name: 'Robbers',
    note: 'Post your robber on an opponent and take half of the next thing they '
      + 'score — they keep the full amount, you skim the shadow of it.',
    status: 'live', needs: ['meeple'], groups: ['robbers'],
  },
  {
    id: 'cropCircles', layer: 'mini', pack: 'The Crop Circles (2016)', name: 'Crop circles',
    note: 'Whoever lays a crop circle decides for the table: everyone adds a '
      + 'follower beside one of theirs of the shown kind, or everyone takes one '
      + 'back. The additions are placed by the engine.',
    status: 'partial', needs: ['meeple'], groups: ['crops'], wiki: wiki('The_Crop_Circles'), since: 'all',
  },
  {
    id: 'tunnel', layer: 'mini', pack: 'The Tunnel (2010)', name: 'Tunnels',
    note: 'A road that dives into the hill. The next tunnel mouth laid joins '
      + 'its road to the one still waiting, however far apart they are.',
    status: 'partial', needs: ['roads'], groups: ['tunnels'], wiki: wiki('The_Tunnel'), since: 'all',
  },
  {
    id: 'plague', layer: 'mini', pack: 'The Plague (2010)', name: 'The Plague',
    note: 'An outbreak clears every follower in the surrounding eight tiles, '
      + 'sent home with nothing. The printed slow spread of fleas is collapsed '
      + 'into the one bad moment.',
    status: 'partial', needs: ['meeple'], groups: ['plagues'], wiki: wiki('The_Plague'), since: 'all',
  },
  {
    id: 'phantom', layer: 'mini', pack: 'The Phantom (2011)', name: 'The Phantom',
    note: 'A second follower you may place in the same turn as your first, on a '
      + 'different feature of the tile you just laid.',
    status: 'live', needs: ['meeple'], wiki: wiki('The_Phantom'), since: 'all',
  },
  {
    id: 'festival', layer: 'mini', pack: 'The Festival (2011)', name: 'The Festival',
    note: 'A festival tile lets you take any one of your followers straight back '
      + 'off the board, instead of claiming.',
    status: 'live', needs: ['meeple'], groups: ['festivals'], wiki: wiki('The_Festival'), since: 'all',
  },
  {
    id: 'halflings', layer: 'mini', pack: 'The Halflings (2018)', name: 'Halflings',
    note: 'Triangular tiles. Two of them fill one square, and the diagonal seam '
      + 'has to match on both halves.',
    status: 'planned', wiki: wiki('The_Halflings'), since: 'c2',
  },
  {
    id: 'barbers', layer: 'mini', pack: 'The Barber-Surgeons (2018)', name: 'Barber-surgeons',
    note: 'A bathhouse lets one of your followers leave wherever it was stuck '
      + 'and come out onto the new tile instead.',
    status: 'partial', needs: ['meeple'], groups: ['baths'],
  },
  {
    id: 'watchtowers', layer: 'mini', pack: 'The Watchtowers (2018)', name: 'Watchtowers',
    note: 'Stand a follower on the tower and close its feature: the tower pays '
      + '2 for every follower it can see, yours or not. One tower design of the '
      + 'printed six, for now.',
    status: 'partial', groups: ['watchtowers'], wiki: wiki('The_Watchtowers'), since: 'c2',
  },
  {
    id: 'littleBuildings', layer: 'mini', pack: 'Little Buildings (2011)', name: 'Little buildings',
    note: 'A shed, a house and a tower each, placed on tiles you lay — on top '
      + 'of whatever else the turn does. Worth 1, 2 and 3 at the end.',
    status: 'live', wiki: wiki('The_Little_Buildings'), since: 'all',
  },
  {
    id: 'windRoses', layer: 'mini', pack: 'The Wind Roses (2013)', name: 'Wind roses',
    note: 'Four tiles, one per quadrant of the map. Laid in its own quadrant, a '
      + 'rose pays 3 on the spot; laid anywhere else, nothing.',
    status: 'live', groups: ['windroses'], wiki: wiki('The_Wind_Roses'), since: 'all',
  },
  {
    id: 'besiegers', layer: 'mini', pack: 'The Besiegers (2003)', name: 'Besiegers',
    note: 'A city under siege is worth half, rounded up. The printed escape '
      + 'through a nearby cloister isn’t modelled yet.',
    status: 'partial', needs: ['cities'], groups: ['sieges'], wiki: wiki('The_Besiegers'), since: 'c1',
  },
  {
    id: 'monasteries', layer: 'mini', pack: 'Monasteries of the world (2013–)', name: 'Regional monasteries',
    note: 'German-style monasteries: left unfinished, one commands its row and '
      + 'column — 1 per tile in the unbroken runs, plus itself.',
    status: 'partial', needs: ['cloisters'], groups: ['abbeyDE'],
  },
  {
    id: 'orchards', layer: 'mini', pack: 'Fruit-Bearing Trees (2019)', name: 'Fruit-bearing trees',
    note: 'A tree pays whoever lays each of the next four tiles beside it — '
      + 'the fruit ripens and is picked as the country grows around it.',
    status: 'partial', groups: ['orchards'],
  },
  {
    id: 'signposts', layer: 'mini', pack: 'The Signposts (2021)', name: 'Signposts',
    note: 'A signpost adds 2 to its road when the road closes. The printed '
      + 'direction-matching is folded into the flat bonus.',
    status: 'partial', needs: ['roads'], groups: ['signposts'],
  },

  {
    id: 'gifts', layer: 'mini', pack: 'The Gifts (2020)', name: 'The Gifts',
    note: 'Extend somebody else’s road or city and a gift arrives on the spot — '
      + 'a couple of points, or an extra tile this turn. Opened immediately '
      + 'rather than held.',
    status: 'partial',
  },
  {
    id: 'bets', layer: 'mini', pack: 'The Bets (2020)', name: 'The Bets',
    note: 'Everyone bets, in secret, on what the final scores will look like.',
    status: 'planned', wiki: wiki('The_Bets'), since: 'c2',
  },
  {
    id: 'peasantRevolts', layer: 'mini', pack: 'The Peasant Revolts (2020)',
    name: 'Peasant revolts',
    note: 'A revolt names a feature type: your lone followers on one flee home, '
      + 'and any standing in pairs weather it for 2 apiece. “Protected” is '
      + 'read as “not alone” here.',
    status: 'partial', needs: ['meeple'], groups: ['revolts'],
  },
  {
    id: 'wonders', layer: 'mini', pack: 'The Wonders of Humanity (2020)',
    name: 'Wonders of humanity',
    note: 'The first player past 15, 20 and 25 raises a wonder, worth 8 at the '
      + 'end. The printed meeple-pairs on the track are folded into the '
      + 'milestones.',
    status: 'partial',
  },
  {
    id: 'maps', layer: 'mini', pack: 'The Maps (2020)', name: 'The Maps',
    note: 'Play within a hard border — an 11×11 map — instead of out across an '
      + 'open table. The printed start squares aren’t modelled.',
    status: 'partial',
  },
  {
    id: 'castlesGermany', layer: 'mini', pack: 'Castles in Germany (2020)',
    name: 'Castles in Germany',
    note: 'Six double-width castle tiles, one or two owned by each player, laid '
      + 'from your own supply rather than drawn.',
    status: 'planned', wiki: wiki('Castles_in_Germany'), since: 'c2',
  },
  {
    id: 'japanese', layer: 'mini', pack: 'Japanese Buildings (2017)',
    name: 'Japanese buildings',
    note: 'The Japanese edition’s buildings, commanding their row and '
      + 'column the same way the German monasteries do.',
    status: 'partial', groups: ['abbeyJP'],
  },
  {
    id: 'mists', layer: 'exp', pack: 'Mists over Carcassonne (2023)',
    name: 'Mists & ghosts',
    note: 'The co-operative one. Mist tiles raise ghosts that have to be laid to '
      + 'rest by the players together, against the board rather than each other.',
    status: 'planned', wiki: wiki('Mists_over_Carcassonne'), since: 'c3',
  },

  // --- promos & alternative base games -------------------------------------
  {
    id: 'wheel', layer: 'promo', pack: 'The Wheel of Fortune (2009)', name: 'Wheel of Fortune',
    note: 'Replaces the start tile with a roulette wheel that fires off a '
      + 'scoring event every time a follower crosses it.',
    status: 'planned', wiki: wiki('The_Wheel_of_Fortune'), since: 'all',
  },
  {
    id: 'school', layer: 'promo', pack: 'The School (2011)', name: 'The School',
    note: 'Close the road the school stands on and the teacher follows you: '
      + '+2 on your next scored feature, then back to his desk.',
    status: 'partial', groups: ['schools'],
  },
  {
    id: 'markets', layer: 'promo', pack: 'The Markets of Leipzig (2015)', name: 'Markets of Leipzig',
    note: 'Four market quarters bid against each other for the completed cities '
      + 'nearest them.',
    status: 'planned', needs: ['cities'], wiki: wiki('The_Markets_of_Leipzig'), since: 'c2',
  },

  // --- workshop originals ---------------------------------------------------
  {
    id: 'market', layer: 'lab', pack: 'Play', name: 'Drafting market',
    note: 'Choose from a face-up row instead of drawing blind. Taking a later '
      + 'tile discards the ones before it.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'lift', layer: 'lab', pack: 'Play', name: 'Lift placed tiles',
    note: 'Instead of placing, pick up an unclaimed tile that isn\'t holding the '
      + 'board together, and play it somewhere better.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'stack', layer: 'lab', pack: 'Play', name: 'Build on top of tiles',
    note: 'Strata\'s rule, anywhere. Cover a tile that hasn\'t scored and has '
      + 'nobody on it. Three levels maximum.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'recall', layer: 'lab', pack: 'Play', name: 'Recall a follower',
    note: 'Instead of claiming, take one of your followers back off the board.',
    status: 'live', needs: ['meeple'], wiki: null, since: null,
  },
  {
    id: 'twoFaced', layer: 'lab', pack: 'Play', name: 'Two-faced tiles',
    note: 'Most tiles have a reverse — a road is a city on the back. Press F '
      + 'before you place.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'fog', layer: 'lab', pack: 'Play', name: 'Fog of war',
    note: 'Tiles far from your figures fade out. Takes effect immediately.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'agendas', layer: 'lab', pack: 'Scoring', name: 'Hidden agendas',
    note: 'Two secret objectives each, scored at the end. Every placement '
      + 'becomes a tell.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'powers', layer: 'lab', pack: 'Play', name: 'Asymmetric powers',
    note: 'One power each, dealt at the start and visible to everyone. What a '
      + 'road is worth stops being the same question for the whole table.',
    status: 'live', wiki: null, since: null,
  },
  {
    id: 'tide', layer: 'lab', pack: 'Scoring', name: 'Rising tide',
    note: 'A waterline climbs the board every three rounds, drowning whatever '
      + 'it reaches.',
    status: 'live', wiki: null, since: null,
  },
];

export const MECHANIC_BY_ID = Object.fromEntries(MECHANICS.map((m) => [m.id, m]));

/** Everything the engine actually implements — what the harness exercises. */
export const LIVE_MECHANICS = MECHANICS.filter((m) => m.status !== 'planned');

/** Implemented rules you bolt ON, i.e. everything live that isn't base layer. */
export const BOLT_ONS = LIVE_MECHANICS.filter((m) => !m.on);

/** The base layer, in the order it stacks. */
export const BASE_LAYER = MECHANICS.filter((m) => m.layer === 'base');

/** The state a fresh workshop starts in: the base layer, and nothing else. */
export function defaultMechanics() {
  return Object.fromEntries(MECHANICS.filter((m) => m.on).map((m) => [m.id, true]));
}

/** Tile groups that switching a mechanic on should switch on too. */
export function groupsFor(active) {
  const out = new Set();
  for (const id of Object.keys(active || {})) {
    if (!active[id]) continue;
    for (const g of MECHANIC_BY_ID[id]?.groups || []) out.add(g);
  }
  return [...out];
}

/**
 * Which of a mechanic's prerequisites are missing, given the current state.
 * The panel greys a row out and says so rather than letting you switch on a
 * pig with no fields for it to stand in.
 */
export function missingNeeds(id, active) {
  return (MECHANIC_BY_ID[id]?.needs || []).filter((n) => !active?.[n]);
}

// ---------------------------------------------------------------------------
// Base-layer surgery.
//
// Taking a feature out of the base game means two things: its tiles leave the
// pool, and anything of that type that does somehow exist stops paying. The
// first is the one that matters — a board with no city tiles on it has no
// cities to score.
// ---------------------------------------------------------------------------

/** Feature types belonging to each base-layer switch. */
export const BASE_FEATURES = {
  cities: ['city'],
  roads: ['road'],
  cloisters: ['monastery', 'temple'],
};

/** The feature types the current settings have switched off. */
export function disabledFeatures(active) {
  const out = new Set();
  for (const [id, types] of Object.entries(BASE_FEATURES)) {
    // Absent means "never mentioned", which for the base layer means on.
    if (active && active[id] === false) for (const t of types) out.add(t);
  }
  return out;
}

/** Would this tile type survive the current base layer? */
export function tileAllowed(type, off) {
  if (!off || !off.size) return true;
  return !type.feats.some((f) => off.has(f.type));
}

// ---------------------------------------------------------------------------
// Shared helpers. Modes call these too, so Cirrus and the `lift` mechanic
// can't drift apart.
// ---------------------------------------------------------------------------

export const MAX_STACK = 2;          // 0-indexed, so three levels

// ---------------------------------------------------------------------------
// Special followers.
//
// Every expansion that adds a figure adds the same three things: a supply of
// one, a rule about where it may stand, and a rule about what it counts for.
// So they are one table rather than one branch each, and `game.useKind` picks
// which of them the next placement spends.
//
// The weight itself lives in board.js, next to the majority count that reads
// it. This table is about the UI and the supply.
// ---------------------------------------------------------------------------

export const FIGURES = [
  {
    id: 'big', mech: 'bigMeeple', supply: 'big', key: 'B',
    name: 'big follower', label: 'Use the big follower', using: 'Using the BIG follower',
    allows: () => true,
  },
  {
    id: 'mayor', mech: 'mayor', supply: 'mayors', key: 'M',
    name: 'mayor', label: 'Send the mayor', using: 'Sending the MAYOR',
    // Cities only, and worth one follower per coat of arms in the city — so a
    // mayor in a city with no pennant is worth nothing at all.
    allows: (f) => f.type === 'city',
  },
  {
    id: 'abbot', mech: 'abbot', supply: 'abbots', key: 'A',
    name: 'abbot', label: 'Send the abbot', using: 'Sending the ABBOT',
    // The abbot is the only figure who may keep a garden, and the only reason
    // a garden is its own feature type rather than another cloister.
    allows: (f) => f.type === 'monastery' || f.type === 'garden',
  },
  {
    id: 'shepherd', mech: 'sheep', supply: 'shepherds', key: 'S',
    name: 'shepherd', label: 'Send the shepherd', using: 'Sending the SHEPHERD',
    // A shepherd stands in a field but is no farmer: he counts for nothing in
    // the farm majority, and his flock is his own business.
    allows: (f) => f.type === 'field',
  },
];

/** Does this tile carry a mark of the given kind? */
export function hasMark(cell, kind) {
  return !!cell?.type.marks.some((m) => m.kind === kind);
}

/**
 * Vineyards. A monastery is worth 3 more for every vineyard in the eight
 * tiles around it — the same neighbourhood the cloister itself counts.
 */
export function vineyardBonus(board, d) {
  if (d.type !== 'monastery') return 0;
  let n = 0;
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      if (hasMark(board.get(d.at.x + dx, d.at.y + dy), 'vineyard')) n++;
    }
  }
  return n * 3;
}

/**
 * Every unfinished feature on the board that nobody is standing on — where a
 * magic portal lets you put a follower instead of onto the tile you just laid.
 */
export function portalTargets(board, { fields = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const cell of board.cells.values()) {
    claimableFeatures(cell.type, { fields }).forEach(({ i, f }) => {
      const d = board.featureOf(cell.x, cell.y, i);
      if (!d || d.scored || d.meeples.length) return;
      // A component reaches many tiles; offer it once, at the first tile seen.
      const root = board.find(d.parts[0]);
      if (seen.has(root)) return;
      seen.add(root);
      out.push({ x: cell.x, y: cell.y, i, f, portal: true });
    });
  }
  return out;
}

export const FIGURE_BY_ID = Object.fromEntries(FIGURES.map((f) => [f.id, f]));

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

/**
 * Features on a tile that a follower may be put on.
 *
 * Fields are only among them when the farm rule is switched on. They exist as
 * components either way — the board wires them up from the moment a tile is
 * laid — but with the rule off they are scenery, and offering them would put a
 * follower somewhere that can never pay.
 */
export function claimableFeatures(type, { fields = false } = {}) {
  return type.feats
    .map((f, i) => ({ i, f }))
    .filter(({ f }) => !NO_MEEPLE.has(f.type) && (fields || f.type !== 'field'));
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
      // A wagon walks the roads; it does not take up farming.
      if (NO_MEEPLE.has(f.type) || f.type === 'field') return;
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
// Farms.
//
// The one feature in the base game that is not scored when it finishes,
// because it never finishes. A field pays at the very end, and it pays for the
// COMPLETED cities standing on it — three points each in the current rules,
// four in the original, which is what the edition switch is for.
// ---------------------------------------------------------------------------

/**
 * The completed cities a field feeds, as components rather than tile features:
 * one city sprawling over six of the field's tiles is one city, and must be
 * counted once.
 */
export function citiesTouching(board, field) {
  const out = new Set();
  for (const cell of board.cellsOf(field)) {
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'field') return;
      // Only the field we are actually scoring, and only the cities that this
      // particular field on this particular tile lies against.
      if (board.featureOf(cell.x, cell.y, i) !== field) return;
      for (const ci of f.touches) {
        const city = board.featureOf(cell.x, cell.y, ci);
        if (city) out.add(city);
      }
    });
  }
  return out;
}

/** …and only the ones that actually closed, which are the only ones that pay. */
export function citiesFed(board, field) {
  return new Set([...citiesTouching(board, field)].filter((c) => c.open === 0));
}

/** Every distinct field component on the board. */
export function allFields(board) {
  return board.allComponents().filter((d) => d.type === 'field');
}

/**
 * What each player takes from the farms. Returns a list of payouts rather than
 * mutating anyone, so the caller can log and animate them one at a time.
 */
export function farmPayouts(board, perCity = 3, pigs = null) {
  const out = [];
  for (const field of allFields(board)) {
    if (!field.meeples.length) continue;
    const cities = citiesFed(board, field);
    if (!cities.size) continue;
    for (const player of board.majority(field)) {
      // A pig only pays the player who owns it, and only where that player
      // already holds the field — it raises their rate, nobody else's.
      const per = pigs?.get(field)?.has(player) ? perCity + 1 : perCity;
      out.push({ field, player, points: cities.size * per, cities: cities.size, per });
    }
  }
  return out;
}

/**
 * Where each player's pig is standing, as field component -> set of players.
 * Pigs live on the cell like a follower does, so they survive a rebuild the
 * same way, and this resolves them to whatever component that cell is in now.
 */
export function pigsByField(board) {
  const out = new Map();
  for (const cell of board.cells.values()) {
    if (!cell.pig) continue;
    const d = board.featureOf(cell.x, cell.y, cell.pig.feat);
    if (!d || d.type !== 'field') continue;
    if (!out.has(d)) out.set(d, new Set());
    out.get(d).add(cell.pig.player);
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
 *
 * The two halves are separate switches, because the rulebook itself says you
 * may take one element of an expansion without the other.
 */
export function innsAndCathedrals(board, d, final, { inns = true, cathedrals = true } = {}) {
  const kinds = board.marksOn(d).map((m) => m.kind);
  const boosted = (inns && d.type === 'road' && kinds.includes('inn'))
    || (cathedrals && d.type === 'city' && kinds.includes('cathedral'));
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
