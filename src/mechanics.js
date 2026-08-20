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
    note: 'The 2021 edition. The River and the Abbot are part of the base box, '
      + 'and a field pays 3 per completed city touching it.',
    farmPerCity: 3,
    baseIncludes: ['river', 'abbot', 'garden'],
  },
  {
    id: 'c2',
    name: '2nd edition',
    note: 'The 2014 redesign. Fields are scored from the field outwards, 3 per '
      + 'completed city, but the River is a separate mini-expansion again.',
    farmPerCity: 3,
    baseIncludes: [],
  },
  {
    id: 'c1',
    name: 'Original (1st ed.)',
    note: 'The 2000 rules. A completed city is worth 4 to the farmers feeding '
      + 'it, counted city by city rather than field by field.',
    farmPerCity: 4,
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
      + 'completed city their field touches (4 under the original rules). '
      + 'Not modelled yet — the tiles carry no field graph.',
    on: false, status: 'planned', needs: ['meeple'], wiki: wiki('Farmers'), since: 'all',
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
    note: 'A cathedral makes its city 3 a tile when it closes, and nothing at '
      + 'all if it never does.',
    status: 'partial', needs: ['cities'], groups: ['innscath'],
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
    status: 'planned', needs: ['fields'], wiki: wiki('Traders_and_Builders'), since: 'all',
  },

  // --- Exp. 3: The Princess & The Dragon -----------------------------------
  {
    id: 'dragon', layer: 'exp', pack: 'Exp. 3 — The Princess & The Dragon (2005)',
    name: 'Dragon',
    note: 'Woken by a dragon tile, it walks six tiles chosen by the players in '
      + 'turn and eats every follower it steps on.',
    status: 'planned', wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },
  {
    id: 'volcano', layer: 'exp', pack: 'Exp. 3 — The Princess & The Dragon (2005)',
    name: 'Volcanoes',
    note: 'A volcano tile takes no follower and summons the dragon to it.',
    status: 'planned', needs: ['dragon'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },
  {
    id: 'fairy', layer: 'exp', pack: 'Exp. 3 — The Princess & The Dragon (2005)',
    name: 'Fairy',
    note: 'Stands beside one of your followers: 1 a turn, 3 when its feature '
      + 'closes, and the dragon will not touch it.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },
  {
    id: 'princess', layer: 'exp', pack: 'Exp. 3 — The Princess & The Dragon (2005)',
    name: 'Princess',
    note: 'Lay the princess into a city and you may send a knight already in it home.',
    status: 'planned', needs: ['cities'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },
  {
    id: 'portal', layer: 'exp', pack: 'Exp. 3 — The Princess & The Dragon (2005)',
    name: 'Magic portals',
    note: 'A portal tile lets you place your follower onto any unfinished '
      + 'feature anywhere on the board instead of onto the tile you just laid.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Princess_and_the_Dragon'), since: 'all',
  },

  // --- Exp. 4: The Tower ---------------------------------------------------
  {
    id: 'tower', layer: 'exp', pack: 'Exp. 4 — The Tower (2006)',
    name: 'Towers',
    note: 'Stack a storey instead of placing a follower, then capture any '
      + 'follower within the tower\'s new reach and ransom it back.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Tower'), since: 'all',
  },

  // --- Exp. 5: Abbey & Mayor -----------------------------------------------
  {
    id: 'abbey', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007)',
    name: 'Abbey tile',
    note: 'One abbey each, played instead of your tile into a hole surrounded '
      + 'on all four sides. It scores as a monastery, so it is always worth 9.',
    status: 'live', wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'mayor', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007)',
    name: 'Mayor',
    note: 'Goes only into cities, and counts not as one follower but as one per '
      + 'pennant in the city he stands in.',
    status: 'planned', needs: ['cities', 'pennants'], wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'wagon', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007)',
    name: 'Wagon',
    note: 'When a feature scores, a follower on it steps along the road to the '
      + 'next unclaimed, unfinished thing instead of going home.',
    status: 'live', needs: ['meeple'], wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },
  {
    id: 'barn', layer: 'exp', pack: 'Exp. 5 — Abbey & Mayor (2007)',
    name: 'Barn',
    note: 'Placed on the corner where four tiles meet, it claims that field for '
      + 'good — and throws every farmer already on it off the board, scoring them.',
    status: 'planned', needs: ['fields'], wiki: wiki('Abbey_and_Mayor'), since: 'all',
  },

  // --- Exp. 6: Count, King & Robber ----------------------------------------
  {
    id: 'count', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008)',
    name: 'The Count of Carcassonne',
    note: 'A four-tile city sits off one corner of the board. Followers sent '
      + 'into its quarters can be moved out into whatever just scored nearby.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Count_of_Carcassonne'), since: 'all',
  },
  {
    id: 'king', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008)',
    name: 'The King',
    note: 'Whoever finished the largest city scores 1 for every completed city '
      + 'on the board at the end.',
    status: 'live', needs: ['cities'], wiki: wiki('King_and_Robber_Baron'), since: 'all',
  },
  {
    id: 'robberBaron', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008)',
    name: 'The Robber Baron',
    note: 'The same bargain for roads: longest one finished takes 1 per '
      + 'completed road at the end.',
    status: 'live', needs: ['roads'], wiki: wiki('King_and_Robber_Baron'), since: 'all',
  },
  {
    id: 'cult', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008)',
    name: 'Cult places (shrines)',
    note: 'A shrine placed within sight of a cloister starts a duel: the first '
      + 'of the two to close takes 9, the other takes nothing.',
    status: 'planned', needs: ['cloisters'], wiki: wiki('The_Cult'), since: 'all',
  },
  {
    id: 'riverII', layer: 'exp', pack: 'Exp. 6 — Count, King & Robber (2008)',
    name: 'The River II',
    note: 'A longer river with a fork, a lake and a volcano in it.',
    status: 'planned', needs: ['river'], wiki: wiki('The_River_II'), since: 'all',
  },

  // --- Exp. 7: The Catapult ------------------------------------------------
  {
    id: 'catapult', layer: 'exp', pack: 'Exp. 7 — The Catapult (2008)',
    name: 'The Catapult',
    note: 'Physically flick wooden discs across the table to knock followers '
      + 'over, catch them, or seduce them. Never reissued after the 1st edition.',
    status: 'planned', wiki: wiki('The_Catapult'), since: 'c1',
  },

  // --- Exp. 8: Bridges, Castles and Bazaars --------------------------------
  {
    id: 'bridge', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles and Bazaars (2010)',
    name: 'Bridges',
    note: 'Lay a bridge straight across a field tile to carry a road over ground '
      + 'that has no road on it.',
    status: 'planned', needs: ['roads'], wiki: wiki('Bridges,_Castles_and_Bazaars'), since: 'all',
  },
  {
    id: 'castle', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles and Bazaars (2010)',
    name: 'Castles',
    note: 'Convert a completed two-tile city into a castle, and it pays out the '
      + 'value of the next thing that scores anywhere near it.',
    status: 'planned', needs: ['cities'], wiki: wiki('Bridges,_Castles_and_Bazaars'), since: 'all',
  },
  {
    id: 'bazaar', layer: 'exp', pack: 'Exp. 8 — Bridges, Castles and Bazaars (2010)',
    name: 'Bazaars',
    note: 'A bazaar tile stops the game for an auction: tiles go under the '
      + 'hammer and the money changes hands between players.',
    status: 'planned', wiki: wiki('Bridges,_Castles_and_Bazaars'), since: 'all',
  },

  // --- Exp. 9: Hills & Sheep -----------------------------------------------
  {
    id: 'hills', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014)',
    name: 'Hills',
    note: 'A hill tile hides a face-down tile under it, and breaks ties on the '
      + 'feature above it — high ground wins.',
    status: 'planned', wiki: wiki('Hills_and_Sheep'), since: 'c2',
  },
  {
    id: 'sheep', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014)',
    name: 'Shepherds & sheep',
    note: 'Put a shepherd in a field and keep drawing tokens: the flock grows '
      + 'until you cash it in, or the wolf arrives and takes the lot.',
    status: 'planned', needs: ['fields'], wiki: wiki('Hills_and_Sheep'), since: 'c2',
  },
  {
    id: 'vineyards', layer: 'exp', pack: 'Exp. 9 — Hills & Sheep (2014)',
    name: 'Vineyards',
    note: 'A vineyard beside a cloister adds 3 to it when the cloister closes.',
    status: 'planned', needs: ['cloisters'], wiki: wiki('Hills_and_Sheep'), since: 'c2',
  },

  // --- Exp. 10: Under the Big Top ------------------------------------------
  {
    id: 'circus', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017)',
    name: 'The big top',
    note: 'The circus moves around the board; followers around the ring when it '
      + 'moves on get paid for being there.',
    status: 'planned', wiki: wiki('Under_the_Big_Top'), since: 'c2',
  },
  {
    id: 'acrobats', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017)',
    name: 'Acrobats',
    note: 'Followers stack into a human pyramid on an acrobat tile, and the '
      + 'whole troupe scores when the third one climbs on.',
    status: 'planned', needs: ['meeple'], wiki: wiki('Under_the_Big_Top'), since: 'c2',
  },
  {
    id: 'ringmaster', layer: 'exp', pack: 'Exp. 10 — Under the Big Top (2017)',
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
    note: 'A second kind of follower for cloisters and gardens, who can be '
      + 'called home early to score his monastery as it stands.',
    status: 'planned', needs: ['cloisters'], wiki: wiki('The_Abbot'), since: 'c2',
  },
  {
    id: 'garden', layer: 'mini', pack: 'The Abbot (2016)', name: 'Gardens',
    note: 'The little walled gardens the abbot can also sit in. Part of the base '
      + 'box since the current edition.',
    status: 'planned', needs: ['abbot'], wiki: wiki('The_Abbot'), since: 'c3',
  },
  {
    id: 'flier', layer: 'mini', pack: 'The Flying Machines (2012)', name: 'Flying machines',
    note: 'Put a follower in the machine, roll 1–3, and it lands that many tiles '
      + 'away on whatever unfinished thing is there — occupied or not.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Flier'), since: 'all',
  },
  {
    id: 'messengers', layer: 'mini', pack: 'The Messengers (2012)', name: 'Messengers',
    note: 'A second marker on the score track. Land either of them on a multiple '
      + 'of five and you draw a message worth points or an extra action.',
    status: 'planned', wiki: wiki('The_Messengers'), since: 'all',
  },
  {
    id: 'ferries', layer: 'mini', pack: 'The Ferries (2013)', name: 'Ferries',
    note: 'A ferry on a lake joins two road ends, and can be shunted to a '
      + 'different pair later — breaking a road that had already been paid for.',
    status: 'planned', needs: ['roads'], wiki: wiki('The_Ferries'), since: 'all',
  },
  {
    id: 'goldmines', layer: 'mini', pack: 'The Gold Mines (2014)', name: 'Gold mines',
    note: 'Ingots pile onto tiles and go to whoever closes the feature under '
      + 'them. What an ingot is worth is not known until the game ends.',
    status: 'planned', wiki: wiki('The_Gold_Mines'), since: 'all',
  },
  {
    id: 'mageWitch', layer: 'mini', pack: 'Mage & Witch (2014)', name: 'Mage & witch',
    note: 'The mage adds 1 a tile to the feature he stands on; the witch halves '
      + 'whatever she is standing on, rounded up.',
    status: 'planned', wiki: wiki('The_Mage_and_the_Witch'), since: 'all',
  },
  {
    id: 'robbers', layer: 'mini', pack: 'The Robbers (2015)', name: 'Robbers',
    note: 'Park a robber on another player\'s space on the score track and take '
      + 'half of the next thing they score.',
    status: 'planned', wiki: wiki('The_Robbers'), since: 'all',
  },
  {
    id: 'cropCircles', layer: 'mini', pack: 'The Crop Circles (2016)', name: 'Crop circles',
    note: 'A crop circle tile makes every player either add a follower to a '
      + 'matching feature, or take one back off.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Crop_Circles'), since: 'c2',
  },
  {
    id: 'tunnel', layer: 'mini', pack: 'The Tunnel (2010)', name: 'Tunnels',
    note: 'Two matching tunnel tokens join two road ends anywhere on the board '
      + 'into one road.',
    status: 'planned', needs: ['roads'], wiki: wiki('The_Tunnel'), since: 'all',
  },
  {
    id: 'plague', layer: 'mini', pack: 'The Plague (2010)', name: 'The Plague',
    note: 'Infection spreads from flea-bitten tiles along features and removes '
      + 'the followers it reaches.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Plague'), since: 'all',
  },
  {
    id: 'phantom', layer: 'mini', pack: 'The Phantom (2011)', name: 'The Phantom',
    note: 'A second follower you may place in the same turn as your first.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Phantom'), since: 'all',
  },
  {
    id: 'festival', layer: 'mini', pack: 'The Festival (2011)', name: 'The Festival',
    note: 'A festival tile lets you take any one of your followers straight back '
      + 'off the board.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Festival'), since: 'all',
  },
  {
    id: 'halflings', layer: 'mini', pack: 'The Halflings (2018)', name: 'Halflings',
    note: 'Triangular tiles. Two of them fill one square, and the diagonal seam '
      + 'has to match on both halves.',
    status: 'planned', wiki: wiki('The_Halflings'), since: 'c2',
  },
  {
    id: 'barbers', layer: 'mini', pack: 'The Barber-Surgeons (2018)', name: 'Barber-surgeons',
    note: 'Bathhouse tiles that let a follower already on the board be moved '
      + 'somewhere better.',
    status: 'planned', needs: ['meeple'], wiki: wiki('The_Barber-Surgeons'), since: 'c2',
  },
  {
    id: 'watchtowers', layer: 'mini', pack: 'The Watchtowers (2018)', name: 'Watchtowers',
    note: 'Each watchtower scores for a particular thing it can see in the eight '
      + 'tiles around it — followers, roads, cities, cloisters.',
    status: 'planned', wiki: wiki('The_Watchtowers'), since: 'c2',
  },
  {
    id: 'littleBuildings', layer: 'mini', pack: 'Little Buildings (2011)', name: 'Little buildings',
    note: 'Sheds, houses and towers placed on a tile you just laid, paid out at '
      + 'the end for what they ended up beside.',
    status: 'planned', wiki: wiki('The_Little_Buildings'), since: 'all',
  },
  {
    id: 'windRoses', layer: 'mini', pack: 'The Wind Roses (2013)', name: 'Wind roses',
    note: 'A tile laid on the correct side of the start tile pays a small bonus, '
      + 'and more again if it completes something.',
    status: 'planned', wiki: wiki('The_Wind_Roses'), since: 'all',
  },
  {
    id: 'besiegers', layer: 'mini', pack: 'The Besiegers (2003)', name: 'Besiegers',
    note: 'Siege camps around a city: the city pays half, and the besiegers take '
      + 'the other half.',
    status: 'planned', needs: ['cities'], wiki: wiki('The_Besiegers'), since: 'c1',
  },
  {
    id: 'monasteries', layer: 'mini', pack: 'Monasteries of the world (2013–)', name: 'Regional monasteries',
    note: 'German, Dutch & Belgian, Japanese and Spanish monastery tiles — each '
      + 'set with its own local completion rule.',
    status: 'planned', needs: ['cloisters'], wiki: wiki('German_Monasteries'), since: 'all',
  },
  {
    id: 'orchards', layer: 'mini', pack: 'Fruit-Bearing Trees (2019)', name: 'Fruit-bearing trees',
    note: 'Orchard tiles that pay a bonus to whoever closes the feature growing '
      + 'through them.',
    status: 'planned', wiki: wiki('The_Fruit-Bearing_Trees'), since: 'c2',
  },
  {
    id: 'signposts', layer: 'mini', pack: 'The Signposts (2021)', name: 'Signposts',
    note: 'Road tiles that point somewhere, and pay for whatever is found in '
      + 'that direction.',
    status: 'planned', needs: ['roads'], wiki: wiki('The_Signposts'), since: 'c3',
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
    note: 'A schoolhouse tile and a teacher who follows whoever last scored.',
    status: 'planned', wiki: wiki('The_School'), since: 'all',
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
