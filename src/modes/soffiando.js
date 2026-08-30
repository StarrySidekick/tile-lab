// ---------------------------------------------------------------------------
// Soffiando — the cloud kingdom, where the board itself is weather.
//
// You place tiles and claim features like Carcassonne, and then the wind
// rearranges the country underneath you. Nothing in the sky is nailed down:
// every tile on the board can be pushed, finished or not, and the only thing
// that has ever stopped one is the whale lying on top of it.
//
// THE ZEPHYR is the engine — twenty-two of them in the deck. Play one and it
// blows down its lane, and what it does there is not what you would guess: it
// does NOTHING to the country it passes through. Country packed against more
// country is country the wind can't get under. What it moves is THE LOOSE END
// — the run of tiles downwind of the zephyr stops somewhere, at a gap or at
// open sky, and the last tiles before that gap are the ones that come away.
//
// HOW MANY, AND HOW FAR, IS THE POWER. A gust arriving at the loose end with
// power N pops the last N tiles off and carries each of them N squares. A row
// of five with a zephyr on the right of it blowing west: power one, so the
// leftmost tile alone goes one square west. Put a second west-blowing zephyr
// in that row and the gust absorbs it, arrives at power two, and the leftmost
// TWO tiles come away two squares each — as a raft, because they were touching
// before and they all travel together.
//
// THE GUST CANNON is the other kind of wind, and six tiles in the deck carry
// one. It is a zephyr in every way the engine cares about — direction,
// absorption, chaining, and one that somebody else's gust WAKES still fires
// like a cannon — except in what it does at the loose end. It does not carry
// the tiles; it FIRES them, and a fired tile travels until the square in front
// of it is occupied, however far away that is. So a raft crosses a strait it
// could never have crossed a square at a time, the leading tile going furthest
// and the ones behind piling up against it. And one fired down a lane with
// NOTHING in it never stops, which is to say it falls out of the sky: that is
// the one thing the wind destroys, and whoever set it off may throw ONE of what
// fell straight back down, this turn, while the hole is still open. Followers
// are unchanged by all of it — a person is not a projectile.
//
// AND IT BUILDS. Power used to stop at three; it doesn't any more. A gust that
// runs over a zephyr blowing the SAME way absorbs it and blows a square harder
// beyond it — never harder upon it, so a zephyr is never shoved along by its
// own breath. A zephyr pointing ANY OTHER way is woken rather than absorbed:
// the storm turns and carries on down the new zephyr's lane, in the new
// zephyr's direction, ONE POWER HARDER THAN IT ARRIVED. Every corner a storm
// turns it hits harder, and the raft it tears off the next end is wider. What
// keeps that finite is that no zephyr contributes the same direction to the
// same storm twice. The ones that blow several ways at once open a lane each
// out of the same square. Two DOUBLE ZEPHYRS open at two.
//
// NOTHING FALLS FOR BEING ALONE. A tile the wind shakes free of everything
// hangs there over open air, and it stays there. That is the engine of the
// whole mode now: the fragments the weather makes are the ISLANDS, and the old
// rule — a tile touching nothing drops out of the sky — was an eraser that
// deleted them before they could ever become country, so the board healed back
// into one mass every turn and the archipelago was a thing you read about in
// the rules.
//
// AND THREE RULES TURN THOSE FRAGMENTS INTO AN ARCHIPELAGO. Removing the
// eraser was not enough by itself — it left the board covered in single tiles
// that were nobody's and could never grow. So:
//
//   THE WIND CROSSES GAPS. It takes the loose end of EVERY run down its lane,
//     not just the first, and its strength carries over the open air between
//     them. A board that is one tile thick in two places is a board one gust
//     can cut in two places.
//   WHAT THE WIND CAN GET UNDER GOES WHOLE. The Palazzo's mainland is the only
//     country too big to lift. Everything else adrift the gust reaches travels
//     entire — arms, followers and all — and slides until it comes to rest
//     ALONGSIDE what stops it. Rocks meet and become islands; islands meet and
//     become bigger islands; and an island driven back into the mainland is
//     swallowed by it, which is the price of the whole thing being weather.
//   EVERY FRAGMENT IS AN ISLAND, down to a single tile. The wind's commonest
//     act is popping ONE tile off a loose end, so nearly every fragment it
//     makes is a singleton, and calling those rocks rather than islands meant
//     they scored nothing and could never be BUILT ON. A tile you have
//     somebody standing on is somewhere you may lay a tile — so the wind makes
//     the seed and the players grow it.
//
// WHAT FALLS IS A TILE THAT NO LONGER FITS. One the wind MOVED that lands
// beside country it cannot legally join is touching the kingdom and holding on
// to none of it: a road jammed against a city wall. That one falls, and it does
// not come back — nobody collects it, nobody plays it again. A tile with no
// neighbours at all has nothing to disagree with, so it floats. One legal
// connection is enough to stay in the sky; none, with something beside you, is
// the end of the tile.
//
// FOLLOWERS ARE BLOWN LIKE TILES, WHICH IS NOT WHAT HAPPENS TO THE TILES. One
// standing on the raft rides it and never notices. Every other follower in the
// lane is picked up and put down downwind, on whatever is there — somebody
// else's feature, or nothing at all. Nothing at all means it goes home.
//
// A FEATURE THAT SCORES IS EMPTIED. Farms, cities, roads, temples: a colour
// firing over a thing you are standing in pays you, and then hands the figure
// back. That is the brake on the whole economy — without it a figure put down
// early collects from every sphere for the rest of the game and never moves,
// which is a game of who claimed fastest in the first ten turns.
//
// Eight each. One figure never comes home: one LYING FLAT, which is a follower
// you have retired into its city on purpose — it keeps the city and the city
// pays the lower rate for as long as it is the only thing holding it.
//
// And a follower whose feature just finished may WALK instead of going home:
// out along a road connected to where it stood, as far as the road runs, and
// take up whatever it finds. A dead end is the road itself. A road with
// somebody else's follower on it is a road you may not use. It is the only way
// a figure moves anywhere under its own steam.
//
// NOTHING IS PAID FOR BEING FINISHED. The sferas are the scoring engine, and
// closing a sphere is the event the whole mode turns on: each of its two halves
// fires a scoring pass over one kind of thing, EVERYWHERE ON THE BOARD, paying
// whoever is standing in each one.
//
//   GREEN  the farms — a point for every two tiles of field, to the majority
//            farmer; a field a rival is already farming is closed to you
//   BLUE   the cities — 1 a tile for one still open, 2 a tile once it has closed
//   RED    the temples — 1 for every tile standing in the eight around one
//   YELLOW the roads — 1 a tile, plus 1 for each city the road reaches and 2
//            if that city has closed, whoever owns the far end
//
// Any half fits any other, and BOTH fire: two yellows score the roads twice
// over, a yellow against a blue scores the roads and the cities once each. So
// the question every turn is never "can I close this" but "will a sphere close
// while I am still standing in it" — and finishing a city is not a payday, it
// is a rate change on every blue sphere still to come.
//
// One thing still pays outside the spheres, and it is the WINDMILL. It stands
// in a city OR on a road, and it pays 2 to whoever HOLDS that feature — once
// for every gust that blows through it, and once more when the feature
// finishes. Whoever laid the closing tile gets nothing for it: a mill is a
// thing you own, not a race you win.
//
// And a city you were HOLDING, finished, that the wind blows open again costs
// you a point a tile. Nothing was paid for finishing it; that is the price of
// having been the one holding it when the weather arrived.
//
// AN ISLAND pays exactly DOUBLE, all of it — and at the end a flat 10 goes to
// whoever has a follower standing on more separate islands than anybody else.
//
// AT THE END the sky fires every colour once, and that is all.
//
// THE MAINLAND IS WHATEVER IS BIGGEST, and every other piece of country is an
// ISLAND, down to a single tile. It used to be whichever piece the Palazzo
// happened to be standing on, which meant a gust that blew the seat onto a
// two-tile rock demoted the whole kingdom to an island and doubled every rate
// on the board in one move.
//
// You may not build onto an island unless you are ALREADY
// STANDING on it — being blown out there is meant to be an opportunity rather
// than a sentence, but you cannot sail out to an empty rock and start.
// Islands are made, not chosen: you were standing there when the country blew
// apart, or you blew a tile across the gap, or you flew somebody out on a
// flying machine. And when the wind gets hold of the PALAZZO ITSELF, every
// island in the sky slides one square the way the seat went.
//
// THE BALENA is a sky whale the size of a district. Whatever tile it is lying
// on cannot be moved by any wind, and no gust passes through it — a run backed
// up against the whale has no loose end, so nothing comes off it and its lee
// is untouched. On your turn, INSTEAD of placing a follower, you may send it
// ANYWHERE on the board. It is the only brake in the mode, and it is a brake
// anybody can pick up.
//
// THE WINDVANE has four ways in and only two of them joined, and the wind picks
// which two. It is the ONLY tile the weather re-cuts — a straight road used to
// swing onto the wind as well, and a road you built should stay where you built
// it.
//
// A FOLLOWER HOPS a one-square gap. Run off one tile, across one empty square,
// and straight on out of the tile beyond, and a walker can step over it. What
// it is NOT is one road — the two halves score separately, and there is nothing
// standing in the gap to see. There used to be a plank drawn across it and the
// halves scored as one, on the argument that a gust cuts a road and the two
// ends can never rejoin, so roads were paid by exactly the quantity the weather
// destroys; the bridge gave the length back and looked like a plank floating in
// mid-air, which is what it was. The step is the half worth keeping.
//
// A TEMPLE is a monastery with no cloister left in it, and it is the one thing
// on the board whose value is its NEIGHBOURS: red pays its keeper a point for
// every tile standing in the eight squares around it, so a temple laid early
// and garrisoned is worth more every time somebody builds near it — and worth
// something to your rival every time you do. Red pays it and then takes the
// keeper back, like every other colour.
//
// THE ABBAZIA takes any edge and CAPS everything it touches: a road running
// into one ends there, a city walls itself off against it, and both can finish
// without ever meeting anything. It is also perfectly blowable — and when it
// goes, everything it was holding shut is open country again.
//
// THE FLYING MACHINE points down a lane, and does one of three things along it.
// It can put a NEW follower on any tile out there — an island included, which
// is the one way to reach one on purpose. It can go and FETCH one of yours off
// the lane, back into your supply. Or it can fetch one and SET IT DOWN again
// further along the same flight, which is the only way a figure in this mode
// ever moves anywhere on purpose.
//
// The thesis is in one line: NOTHING IS SETTLED AND NOTHING IS BANKED. A city
// is finished until the weather says otherwise, the mainland is wherever the
// Palazzo happens to be this turn, what you hold is only worth anything at the
// moment somebody closes a sphere, and the only permanent thing on the board is
// a whale that anyone can move.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import {
  TILE_TYPES, CENTRE_FEATURES, SIDE_STEP, opposite, buildDeck,
} from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { DESIGN } from '../design.js';
import { claimableFeatures, citiesFed, hasMark } from '../mechanics.js';
import {
  storm, zephyrDirs, zephyrPush, isCannon, worldDir, turbineOn, isTemple, MAX_STRENGTH,
} from '../wind.js';

/**
 * Bigger than a Carcassonne set, because the cloud pool alone is now 65 tiles
 * and four sfera colours want four different kinds of country to count. Cut to
 * 72 and the base tiles that carry the ordinary cities, roads and fields came
 * to seven, which is a board with nothing on it for three of the four colours.
 */
const DECK_SIZE = 88;
/**
 * The backstop, in tiles laid rather than rounds played. Counting placements
 * is the only clock that means the same thing at every player count, and this
 * one sits a third above the deck.
 */
const STORM_LIMIT = 96;
const TURBINE = 2;           // to the feature's holder, per gust through it
/**
 * EVERY OPINION THE COMPUTER PLAYER HAS, in one object.
 *
 * The bot reads the board — what is standing where, who holds it, what it
 * would pay — but none of that tells it how much it should CARE about a farm
 * against a temple, or whether shoving a rival's follower into open sky is
 * worth giving up a placement for. Those are judgements, and in a mode this
 * young they are guesses.
 *
 * So they live here as numbers rather than being spread through the methods,
 * and `tools/train.mjs` plays the mode against itself to improve them. A seat
 * can be handed its own set, which is what lets a trainer put two different
 * strategies in the same game and find out which one is right.
 *
 * `ahead` is the one with a real-world meaning: roughly how many more times a
 * given sfera colour will fire from the middle of a game — eight spheres, two
 * halves each, four colours. Everything a claim is worth is multiplied by it,
 * so it is also, in effect, how eagerly the bot spends followers.
 *
 * THESE NUMBERS WERE MEASURED, not guessed. A sensitivity sweep and a
 * self-play climb agreed on all of them, and the set below beats the guesses
 * it started from in 62.5% of 120 games at a mean margin of 19 points. What it
 * says about the mode is worth reading off directly: FARMS ARE THE GAME (2× as
 * important as first assumed, and the strongest single signal in the sweep by
 * a distance), temples come second, roads are worth about half what they look
 * like, and a windmill in a city you hold is worth twice the guess.
 */
export const SOFFIANDO_WEIGHTS = {
  ahead: 2,          // firings a claim is priced over — and claim eagerness
  farm: 4,           // …scaled per feature type, because the four colours pay
  city: 1,           //    over different numbers of tiles and the bot has no
  road: 1.1,         //    way of knowing which of them is actually winnable
  temple: 1.2,
  sphere: 1,         // closing one, net of what it hands the table
  sferaHalf: 1,      // holding a half nobody has paired yet
  parish: 0.6,       // filling a square in somebody's parish
  parishFree: 0.3,   // …and an empty temple you could go and stand in
  turbineMine: 10,   // a windmill in a city we hold
  turbineTheirs: -3.4, // …or one somebody else does
  gust: 1.84,        // everything a gust does, as one dial
  gustBlow: 1,       // shoving a follower — ours out, theirs off
  whale: 0,          // points of shelter before the Balena is worth a turn
};

/** A seat's own weights, or the defaults. */
const weightsFor = (mode, seat) => mode.brains?.[seat] || SOFFIANDO_WEIGHTS;
const WINDMILL = 2;          // …and per windmill, to whoever HOLDS the feature it finishes
const REOPENED = 1;          // per tile, off a held city the wind blows open again
const MAX_CHAIN = 6;         // storms raised while a storm is still landing
const FLIGHT_RANGE = 24;     // squares, before we assume the zephyrs are a loop
const ARCHIPELAGO = 10;      // at the end, to whoever stands on the most islands
const EXTRA_FOLLOWERS = 1;   // …on top of everyone's usual seven
const SUPPLY = 8;            // …which is what the panel draws

/**
 * What everything pays, on the mainland and out on an island — and everything
 * out on an island pays exactly DOUBLE. Nothing here is paid for finishing;
 * it is all paid by a sphere closing, over the whole board at once.
 */
const RATE = {
  farm: { main: 1, isle: 2, per: 2 },     // per `per` tiles of field
  cityOpen: { main: 1, isle: 2 },         // per tile, unfinished
  cityDone: { main: 2, isle: 4 },         // per tile, finished
  temple: { main: 1, isle: 2 },           // per tile standing around it
  road: { main: 1, isle: 2 },             // per tile
  roadCity: { main: 1, isle: 2 },         // …plus this per city the road reaches
  roadCityDone: { main: 2, isle: 4 },     // …and this if that city is finished
};

/**
 * What each sfera colour counts when its half of a sphere fires. Each is a
 * scoring pass over one kind of thing, EVERYWHERE ON THE BOARD, paying whoever
 * holds each one — which is why closing a sphere is the event the whole mode
 * turns on rather than a bonus on top of it.
 */
const COLOURS = {
  green: 'the farms',
  blue: 'the cities',
  red: 'the temples',
  yellow: 'the roads',
};

/** The colour of the half-sphere on a tile, if there is one. */
const sferaHue = (cell) =>
  cell?.type.feats.find((f) => f.type === 'sfera')?.hue || null;

/** "green and blue", "green, blue and red" — for the log. */
const listOf = (words) => (words.length < 2 ? words.join('')
  : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/**
 * The same list with repeats folded into a count. A matched pair fires the
 * same effect twice, and "2 a finished city and 2 a finished city" is a
 * sentence nobody should have to read.
 */
const tallyOf = (things) => {
  const seen = new Map();
  for (const t of things) seen.set(t, (seen.get(t) || 0) + 1);
  return [...seen];
};
const listTally = (things, label = (t) => t) =>
  listOf(tallyOf(things).map(([t, n]) => `${label(t)}${n > 1 ? ` ×${n}` : ''}`));

/**
 * What Soffiando plays instead of parts of the base set. The three-way junctions
 * become junctions with a village on them; there are no cloisters in the sky,
 * so every one is a temple; and the four-sided city is out, because a city
 * that can only be entered and never capped is one the weather never lets you
 * finish.
 */
const SWAPS = { W: 'Gw', L: 'Gl', A: 'Kta', B: 'Kt', C: 'E' };

/** The eight squares around a tile — a temple's parish, and what red counts. */
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

const isPalazzo = (cell) => cell?.type.id === 'Kpz';
const hasPalazzo = (cells) => cells.some(isPalazzo);
const key = (c) => `${c.x},${c.y}`;

export class Soffiando extends Mode {
  /** The kingdom starts with a seat, and the seat is as blowable as anything. */
  seeds() { return [{ x: 0, y: 0, id: 'Kpz', rot: 0 }]; }

  /**
   * The SPACE between the tiles is open sky, not the ground on them. That
   * distinction is the whole readability of the mode: every gap you can see
   * through is somewhere a tile could fall out of, and every gap wide enough
   * to walk round is what makes the country on the far side an island.
   */
  backdrop = 'sky';

  /** The farms are counted when a sphere closes, and never again at the end. */
  finalFarms = false;

  /**
   * A guaranteed mix rather than a cut of the shuffled pool: this mode is its
   * weather, and a deck that happened to deal no zephyrs would be a different
   * game entirely. Every cloud tile goes in, then base tiles fill the rest.
   */
  deck() {
    const rng = this.game.rng;
    const cloud = [];
    for (const t of TILE_TYPES) {
      if (t.group !== 'cloud') continue;
      for (let i = 0; i < t.n; i++) cloud.push(t.id);
    }
    const base = buildDeck(['base'], rng, 'D');
    const deck = [...cloud, ...base.slice(0, Math.max(0, DECK_SIZE - cloud.length))];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck.map((id) => SWAPS[id] || id);
  }

  setup() {
    // One more follower than anywhere else. Everything comes home off a scored
    // feature now, so the supply turns over — but a sphere is also the only
    // thing that ever pays, and being caught one figure short of the board you
    // wanted when one closes is the whole loss.
    for (const p of this.game.players) p.meeples += EXTRA_FOLLOWERS;
    this.flight = null;
    this.lifted = null;
    this.laid = 0;
    this.gusts = 0;
    this.fallen = 0;           // tiles the wind has taken out of the sky
    this.caught = false;       // …and whether one has come back to hand this turn
    this.spheres = 0;          // spheres closed so far
    this.hues = {};            // …and how many of each colour
    this.drifts = 0;           // times the Palazzo has towed the islands along
    this.blowing = false;
    this.blame = null;         // whose weather is currently running
    this.queued = [];
    this.pending = [];         // followers the sphere has paid, waiting to come off
    this.strollers = [];       // followers offered a walk when the scoring settles
    this.stroll = null;        // …and the one being asked about now
    this.laidFlat = false;     // one follower retired into a city per turn
    this.balenaMoved = false;  // …and the whale has already swum this turn
    // The whale starts asleep over the seat of government. Nothing else is on
    // the board yet for it to lie on, and the first player who wants the
    // Palazzo blowable has only to move it.
    this.balena = { x: 0, y: 0 };
    this.settleBalena();
  }

  // --- the mainland, and everything adrift from it ---------------------------
  //
  // The Palazzo decides what "the mainland" is, and everything else follows
  // from that one fact: where you may build, where a follower may be put down,
  // and what every closure is worth. It moves, so all of that moves with it.

  /**
   * Where every tile on the board stands: the kingdom, and the sky adrift from
   * it. Everything downstream of this — where you may build, where a follower
   * may be put down, what every closure is worth — is one lookup in the two
   * key sets it returns.
   *
   * Cached against the board's mutation counter rather than against a turn,
   * because the wind rearranges the board several times inside a single turn —
   * and this is asked once per visible tile per frame by the renderer and once
   * per candidate square per turn by the computer player, so the cache check
   * itself has to be a single integer compare. The flood fill behind it only
   * runs when the country has actually changed shape.
   */
  land() {
    const board = this.game.board;
    const stamp = board.version;
    if (this._land && this._land.stamp === stamp) return this._land;

    const groups = board.groups();                    // biggest first
    // THE MAINLAND IS WHATEVER IS BIGGEST. It used to be whichever piece the
    // Palazzo happened to be standing on, which meant a gust that blew the seat
    // onto a two-tile rock demoted the entire kingdom to an island and doubled
    // every rate on the board in one move. Size is the reading a player makes
    // anyway — the big one is the mainland — and it leaves the Palazzo doing
    // the one job it is actually good at, which is towing the archipelago.
    const main = groups[0] || [];
    // EVERY piece of country off the mainland is an island, down to a single
    // tile. It used to take two — "a lone tile adrift is not an island, it is a
    // tile adrift" — and that sentence was the reason the archipelago never
    // grew. The wind's commonest act is popping ONE tile off a loose end, so
    // nearly every fragment it makes is a singleton; calling those rocks rather
    // than islands meant they scored nothing, counted for nothing, and above
    // all could never be BUILT ON, because you may only build onto an island
    // you are standing on. They sat there forever. A rock you have somebody
    // standing on is now somewhere you may lay a tile, which is the whole
    // engine: the wind makes the seed and the players grow it.
    const isles = groups.filter((g) => g !== main && g.length >= 1);
    const mainKeys = new Set(main.map(key));
    const isleKeys = new Set();
    for (const g of isles) for (const c of g) isleKeys.add(key(c));
    this._land = { stamp, groups, main, isles, mainKeys, isleKeys };
    return this._land;
  }

  /** Is this square out on an island — a group of two or more, off the seat? */
  onIsland(cell) { return !!cell && this.land().isleKeys.has(key(cell)); }

  /** What a component pays per tile, given where in the sky it is standing. */
  rateFor(kind, cells) {
    return this.onIsland(cells[0]) ? RATE[kind].isle : RATE[kind].main;
  }

  /**
   * You may only put a tile down where it touches the kingdom. This is passed
   * straight through to the board, so the legal-square wash, the bot and the
   * "this tile has nowhere to go" check all agree about it without any of them
   * knowing what an island is.
   */
  placeOpts() {
    return { onto: this.reachable() };
  }

  /**
   * Where a tile may go: the mainland, plus any island you already have a
   * follower standing on. You cannot sail out to a rock and start building on
   * it — but a piece of country that came apart under your own people is still
   * yours to build on, and cutting it off entirely made being blown onto one a
   * punishment rather than an opportunity.
   */
  reachable() {
    const { main, isles, mainKeys } = this.land();
    const mine = isles.filter((g) => g.some((c) => c.meeple));
    if (!mine.length) return mainKeys;
    const out = new Set(mainKeys);
    for (const g of mine) for (const c of g) out.add(key(c));
    return out;
  }

  /**
   * On top of the host's own rule that a feature has to be unclaimed:
   *
   *   AN ISLAND is somewhere you are blown or flown to, unless you are already
   *     standing on it — the same reach that decides where a tile may go.
   *   YOU MAY NOT DOUBLE UP. A feature you already have somebody on is not a
   *     feature you may put a second follower on, whatever route you took.
   *   A FIELD WITH A RIVAL'S FARMER ON IT is closed to you outright. Farms are
   *     the one thing here decided by a majority you cannot un-place, so a
   *     contest for one is a race nobody can win by arriving second.
   */
  claimAllowed({ x, y, i, f }) {
    const board = this.game.board;
    const cell = board.get(x, y);
    if (!cell) return false;
    if (this.onIsland(cell) && !this.reachable().has(key(cell))) return false;
    const d = board.featureOf(x, y, i);
    if (!d) return false;
    const seat = this.game.current;
    if (d.meeples.some((m) => m.player === seat)) return false;
    if (f.type === 'field' && d.meeples.some((m) => m.player !== seat)) return false;
    return true;
  }

  // --- placing --------------------------------------------------------------

  afterPlace(cell) {
    cell.round = this.game.round;
    this.laid++;
    const dirs = zephyrDirs(cell);
    if (dirs.length) {
      this.game.say(dirs.length > 1
        ? `${this.game.player.name} lets the wind out ${dirs.length} ways at once.`
        : isCannon(cell)
          ? `${this.game.player.name} touches off the gust cannon.`
          : `${this.game.player.name} lets the zephyr out.`);
      const from = { x: cell.x, y: cell.y };
      // …at its own strength, and as its own kind of weather: a double zephyr
      // opens at two whether the wind that let it out was somebody else's gust
      // or its owner's hand, and a gust cannon fires rather than pushes.
      const push = zephyrPush(cell);
      const blast = isCannon(cell);
      this.weather(dirs.map((dir) => ({ dir, from, push, blast })), this.game.current);
    }
    this.joinSferas();
    // The flight is worked out after the weather, because the weather may have
    // just rearranged everything the machine was going to fly over.
    this.flight = this.flightPath(cell);
    return 'meeple';
  }

  endTurn() {
    this.flight = null;
    this.caught = false;
    this.lifted = null;
    this.stroll = null;
    this.strollers.length = 0;
    this.laidFlat = false;
    this.balenaMoved = false;
    if (this.laid >= STORM_LIMIT) {
      this.game.say('The season turns, and the wind drops.');
      this.game.finish();
    }
  }

  /**
   * What a feature is worth to a computer player. Everything in Soffiando is
   * paid by the sferas, over the whole board, several times a game — so the
   * price of standing in something is what its colour pays TIMES the number of
   * times that colour is still likely to fire. Without this the bot reads the
   * board's ordinary Carcassonne values, which price a field at nothing at all
   * and a temple at nothing at all, and those are two of the four things
   * actually worth holding here.
   */
  valueOf(d) {
    const board = this.game.board;
    // `d.at` is the tile the component was first linked on, which is always a
    // real square — so the island test costs one lookup rather than building
    // the whole cell list, and this is asked for every component on the board
    // for every candidate placement the bot prices.
    const on = board.get(d.at.x, d.at.y);
    if (!on) return null;
    // Whoever is thinking is whoever's turn it is: this is only ever asked by
    // a computer player pricing its own move.
    const w = weightsFor(this, this.game.current);
    const isle = this.onIsland(on);
    const per = (kind) => (isle ? RATE[kind].isle : RATE[kind].main) * w.ahead;
    switch (d.type) {
      case 'field':
        return Math.floor(d.tiles.size / RATE.farm.per) * per('farm') * w.farm;
      case 'city':
        return d.tiles.size * per(d.open === 0 ? 'cityDone' : 'cityOpen') * w.city;
      case 'road':
        return d.tiles.size * per('road') * w.road;
      case 'temple':
        return board.surroundCount(d.at.x, d.at.y) * per('temple') * w.temple;
      default:
        return null;
    }
  }

  // --- turbines -------------------------------------------------------------

  /**
   * Every gust that runs through a turbine pays whoever holds the city it is
   * built into. Nobody in the city, nobody paid — and since a follower now
   * stays in a city it has finished, a windmill you have garrisoned keeps
   * paying for the rest of the game.
   */
  payTurbines(cells) {
    const board = this.game.board;
    for (const cell of cells) {
      if (board.get(cell.x, cell.y) !== cell) continue;
      const t = turbineOn(cell);
      if (!t || t.on == null) continue;
      const d = board.featureOf(cell.x, cell.y, t.on);
      if (!d || !d.meeples.length) continue;
      for (const p of board.majority(d)) {
        this.pay(p, TURBINE, `${this.game.players[p].name}'s ${d.type} turbine turns`,
          [{ x: cell.x, y: cell.y }]);
      }
    }
  }

  /** One place where points are handed out, so every stream looks the same. */
  pay(player, points, line, cells) {
    const g = this.game;
    g.players[player].score += points;
    g.say(`${line} ${points < 0 ? '' : '+'}${points}`);
    g.emit('score', {
      points, player, players: [player], cells,
      at: { x: cells[0].x + 0.5, y: cells[0].y + 0.5 },
    });
  }

  // --- the sfera and the farms ----------------------------------------------

  /**
   * Two half-spheres meeting is the one event in the mode that pays for the
   * GROUND rather than for what was built on it. It can only happen
   * deliberately — a sfera edge meets nothing else — and all it does now is
   * call the harvest in on the field the sphere itself is lying in.
   *
   * The pair is remembered on the tiles rather than by position, because the
   * weather will move them: `sphered` says this half has already been counted,
   * wherever in the sky it ends up.
   */
  joinSferas() {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (d.type !== 'sfera' || d.tiles.size < 2) continue;
      const cells = board.cellsOf(d);
      if (cells.every((c) => c.sphered)) continue;          // an old one
      for (const c of cells) c.sphered = true;
      // BOTH halves fire. Two yellows score the roads twice over; a yellow
      // against a blue scores the roads and the cities once each. The pairing
      // is the decision, and it is why any half fits any other — a colour you
      // have no partner for is still worth playing against whatever you can
      // reach.
      const hues = cells.map(sferaHue).filter(Boolean);
      this.spheres++;
      for (const h of hues) this.hues[h] = (this.hues[h] || 0) + 1;
      const names = tallyOf(hues).map(([h]) => h);
      this.game.say(`A ${listOf(names)} sphere closes — the sky scores `
        + `${listTally(hues, (h) => COLOURS[h])}.`);
      this.game.emit('landmark');
      for (const h of hues) this.fire(h);
      this.sweep();
      this.beginStroll();
    }
  }

  /**
   * One half-sphere going off: a scoring pass over one kind of thing, over the
   * whole board, paying whoever holds each one. Nothing in Soffiando is paid for
   * being finished any more — finishing a city changes what it is worth when a
   * blue sphere next closes, and that is all. Which means the question every
   * turn is not "can I close this" but "will a sphere close while I am still
   * standing in it".
   */
  fire(hue) {
    switch (hue) {
      case 'green': return this.scoreFarms();
      case 'blue': return this.scoreCities();
      case 'red': return this.scoreTemples();
      case 'yellow': return this.scoreRoads();
      default: return undefined;
    }
  }

  /** Which of a rate pair applies to a component, by where it is standing. */
  rate(kind, cells) {
    return this.onIsland(cells[0]) ? RATE[kind].isle : RATE[kind].main;
  }

  /**
   * GREEN — the farms. A point for every two tiles of field, doubled to a
   * point a tile out on an island. It is the one colour that pays for GROUND
   * rather than for anything built on it, so the sprawling field nobody wanted
   * is suddenly the thing worth holding.
   */
  scoreFarms() {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (d.type !== 'field' || !d.meeples.length) continue;
      const cells = board.cellsOf(d);
      if (!cells.length) continue;
      const per = this.rate('farm', cells);
      const pts = Math.floor(d.tiles.size / RATE.farm.per) * per;
      this.payHolders(d, pts,
        `Farm of ${d.tiles.size} tile${d.tiles.size === 1 ? '' : 's'}`
        + `${per > RATE.farm.main ? ' out on an island' : ''}`, cells);
    }
  }

  /**
   * BLUE — the cities. 1 a tile for one still open, 2 a tile for one that has
   * closed, doubled on an island. Finishing a city no longer pays anything by
   * itself; what it does is put the city on the higher rate for every blue
   * sphere that closes afterwards, which is a much longer bet.
   */
  scoreCities() {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (d.type !== 'city' || !d.meeples.length) continue;
      const cells = board.cellsOf(d);
      if (!cells.length) continue;
      const done = d.open === 0;
      // A city held by a figure LYING FLAT pays the lower rate forever: the
      // retired follower keeps the city but not the full income, which is the
      // whole of the trade you make when you lay one down.
      const flat = d.meeples.every((m) => m.flat);
      const kind = flat || !done ? 'cityOpen' : 'cityDone';
      const per = this.rate(kind, cells);
      this.payHolders(d, per * d.tiles.size,
        `${flat ? 'A city kept by a retired follower' : done ? 'A finished city' : 'An unfinished city'}`
        + ` of ${d.tiles.size} tile${d.tiles.size === 1 ? '' : 's'}`
        + `${per > RATE[kind].main ? ' out on an island' : ''}`, cells);
    }
  }

  /**
   * RED — the temples. A point for every tile standing in the eight squares
   * around one, doubled on an island. A temple already pays its keeper for
   * every tile that ARRIVES in the parish; red pays them again for the parish
   * as it stands, so a temple built early and kept is the compounding piece.
   */
  scoreTemples() {
    const board = this.game.board;
    for (const cell of board.cells.values()) {
      // AN ABBAZIA WITH SOMEBODY ON IT IS A TEMPLE. Nothing on it can be
      // claimed when you lay it — it has no features at all, which is the whole
      // of what makes it a cap — but the wind can put a follower down on one,
      // and a walled house in the sky with somebody living in it is a temple by
      // every test that matters. Red pays it for its parish like any other.
      // Being blown into one is the only way anybody ever gets there, which is
      // exactly the kind of thing this mode should reward.
      const abbey = hasMark(cell, 'abbazia') && cell.meeple;
      if ((!isTemple(cell) && !abbey) || !cell.meeple) continue;
      const around = board.surroundCount(cell.x, cell.y);
      if (!around) continue;
      const per = this.onIsland(cell) ? RATE.temple.isle : RATE.temple.main;
      this.pay(cell.meeple.player, around * per,
        `${abbey ? 'An Abbazia kept as a temple' : 'A temple'} with ${around} tile${around === 1 ? '' : 's'} around it`
        + `${per > RATE.temple.main ? ' out on an island' : ''}`
        + ` — ${this.game.players[cell.meeple.player].name}`,
        [{ x: cell.x, y: cell.y }]);
      // …and then the keeper comes off it, like everybody else the sky has just
      // paid. A temple is never finished — the parish can always lose a tile to
      // the weather again — so waiting for a full eight was waiting for a thing
      // that mostly never came.
      if (!cell.meeple.flat) this.pending.push({ x: cell.x, y: cell.y });
    }
  }

  /**
   * YELLOW — the roads. A point a tile, plus what each city the road runs into
   * is worth: 1 for one still open, 2 for one that has closed. WHOSE city that
   * is doesn't matter — a road is paid for what it reaches, not for who owns
   * the far end, which is what makes building into somebody else's country a
   * thing worth doing rather than a favour.
   */
  scoreRoads() {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (d.type !== 'road' || !d.meeples.length) continue;
      const cells = board.cellsOf(d);
      if (!cells.length) continue;
      const isle = this.onIsland(cells[0]);
      const per = isle ? RATE.road.isle : RATE.road.main;
      let pts = per * d.tiles.size;
      // Cities the road arrives at, deduped: one city sprawling over four of
      // the road's tiles is one city and is counted once.
      const seen = new Set();
      let reached = 0;
      for (const cell of cells) {
        cell.type.feats.forEach((f, i) => {
          if (f.type !== 'city') return;
          const city = board.featureOf(cell.x, cell.y, i);
          if (!city) return;
          const root = board.find(city.parts[0]);
          if (seen.has(root)) return;
          seen.add(root);
          reached++;
          const key2 = city.open === 0 ? 'roadCityDone' : 'roadCity';
          pts += isle ? RATE[key2].isle : RATE[key2].main;
        });
      }
      this.payHolders(d, pts,
        `Road of ${d.tiles.size} tile${d.tiles.size === 1 ? '' : 's'}`
        + `${reached ? ` into ${reached} cit${reached === 1 ? 'y' : 'ies'}` : ''}`
        + `${isle ? ' out on an island' : ''}`, cells);
    }
  }

  /**
   * Pay a component's majority, and then take everybody off it.
   *
   * SCORING A FEATURE EMPTIES IT. Farms, cities, roads, temples — finished or
   * not, a colour firing over a thing you are standing in pays you and then
   * hands the figure back. That is the brake on the whole economy: without it
   * a figure put down early collects from every sphere for the rest of the
   * game and there is no reason ever to move it, which is a game of who
   * claimed fastest in the first ten turns. It used to be only FINISHED things
   * that emptied, which left the farmer — the single biggest income in the
   * mode — standing in a field nothing could ever finish, for good.
   *
   * One figure stays: one LYING FLAT has been retired into its city on purpose
   * and lives there now, which is the whole of what you bought when you laid
   * it down.
   */
  payHolders(d, pts, line, cells) {
    const g = this.game;
    const where = cells.map((c) => ({ x: c.x, y: c.y }));
    if (pts > 0) {
      for (const p of g.board.majority(d)) {
        this.pay(p, pts, `${line} — ${g.players[p].name}`, where);
      }
    }
    for (const m of d.meeples.slice()) {
      if (m.flat) continue;
      this.pending.push({ x: m.x, y: m.y });
    }
  }

  /**
   * Take everybody the sphere just paid off the board — AFTER every half of it
   * has fired, which is the whole reason this is a queue rather than something
   * `payHolders` does on the spot. Both halves of a sphere fire, and two reds
   * pay the same temple twice; emptying it the moment the first half landed
   * meant the second half found an empty board and a matched pair paid once.
   *
   * It is also what keeps the computer player honest. `sphereValue` fires a
   * sphere for real against a scratch tally to find out what it would pay, and
   * with the reclaim inline that made merely THINKING about a placement strip
   * the followers off the board. The bot throws the queue away; the game sweeps
   * it.
   */
  sweep() {
    const g = this.game;
    if (!this.pending.length) return;
    for (const { x, y } of this.pending.splice(0)) {
      const cell = g.board.get(x, y);
      const m = cell?.meeple;
      if (!m || m.flat) continue;                  // already gone, or lying down
      // The current player is offered a walk instead of the trip home; this
      // notes the chance and the host asks about it once the pass is over.
      if (m.player === g.current) this.strollers.push({ x, y, i: m.feat });
      g.sendHome(cell);
      g.emit('meeple', { recall: true, player: m.player, at: { x: x + 0.5, y: y + 0.5 } });
    }
    g.board.rebuild();
  }

  // --- walking on, when the sky has just paid you -----------------------------
  //
  // A follower whose feature just finished is on its way back to the supply.
  // Instead, it may WALK: out along a road connected to where it was standing,
  // as far as the road goes, and take up whatever it finds at the end. It is
  // the only way a figure moves anywhere in Soffiando under its own steam, and
  // it is what stops a scored feature from simply being an eviction.
  //
  // The road it walks is a road COMPONENT, which is why sky bridges matter
  // here: a road the wind cut in two is one road again as far as a walker is
  // concerned, so long as the gap is a single square and the two halves line
  // up. And a road with somebody else's follower on it is a road you may not
  // use — you walk your own country, not through theirs.

  /**
   * Where the follower that was standing at (x, y) could walk to. The roads
   * leaving that tile, and everything unclaimed standing along them; if there
   * is nothing to walk INTO, the road itself is the destination, which is the
   * dead-end case.
   */
  strollTargets(from) {
    const g = this.game;
    const board = g.board;
    const cell = board.get(from.x, from.y);
    if (!cell) return [];
    const seat = g.current;
    const out = [];
    const seen = new Set();
    let deadEnd = null;
    // The feature it is walking OUT of. Without this the walk hands the brake
    // straight back: a city finishes, pays, returns its follower — and the
    // road running through the same tile offers that very city as somewhere
    // to walk to, so the figure steps back into what it just left and holds
    // it for nothing. A walk has to go somewhere.
    const back = from.i != null && board.parent.has(`${from.x},${from.y}#${from.i}`)
      ? board.find(`${from.x},${from.y}#${from.i}`) : null;

    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'road') return;
      const road = board.featureOf(from.x, from.y, i);
      if (!road) return;
      const root = board.find(road.parts[0]);
      if (seen.has(root)) return;
      seen.add(root);
      // Somebody else's road is not a road you may walk down.
      if (road.meeples.some((m) => m.player !== seat)) return;
      // A ONE-SQUARE GAP IS A STEP, not a wall. The two halves of a road the
      // wind cut apart score separately — there is no bridge standing in the
      // gap and nothing to see there — but a figure can cross it, so the walk
      // follows every road hop-connected to this one. A half somebody else is
      // standing on is still theirs, and the walk stops rather than steps over
      // it.
      const reach = [road];
      for (const other of board.hopsFrom(root)) {
        if (other === root || seen.has(other)) continue;
        seen.add(other);
        const d = board.data.get(other);
        if (!d || d.meeples.some((m) => m.player !== seat)) continue;
        reach.push(d);
      }
      const cells = reach.flatMap((d) => board.cellsOf(d));
      for (const c of cells) {
        if (c.meeple) continue;                       // one figure a tile
        for (const o of claimableFeatures(c.type, { fields: g.has('fields') })) {
          if (o.f.type === 'field' || o.f.type === 'road') continue;
          const d = board.featureOf(c.x, c.y, o.i);
          if (!d || d.meeples.length) continue;
          if (back && board.parent.has(`${c.x},${c.y}#${o.i}`)
            && board.find(`${c.x},${c.y}#${o.i}`) === back) continue;
          out.push({ x: c.x, y: c.y, i: o.i, f: o.f, stroll: true });
        }
      }
      // …and the road itself, if there is nobody on it and nowhere else to go.
      // Any of the halves will do — a walker that hopped the gap can stand on
      // the far side of it as readily as the near one.
      if (deadEnd) return;
      for (const d of reach) {
        if (d.meeples.length) continue;
        const spare = board.cellsOf(d).find((c) => !c.meeple);
        if (!spare) continue;
        const idx = board.featIndexOn(spare, d);
        if (idx == null) continue;
        deadEnd = { x: spare.x, y: spare.y, i: idx, f: { type: 'road' }, stroll: true };
        break;
      }
    });

    // "It goes until it hits another feature or a dead end" — so the road is
    // what you claim when there was nothing to walk into, not an alternative
    // to walking into it.
    return out.length ? out : (deadEnd ? [deadEnd] : []);
  }

  /** Is anybody waiting to walk, and is there anywhere for them to go? */
  nextStroll() {
    while (this.strollers.length) {
      const from = this.strollers[0];
      const targets = this.strollTargets(from);
      if (targets.length && this.game.player.meeples > 0) return { from, targets };
      this.strollers.shift();
    }
    return null;
  }

  beginStroll() {
    const next = this.nextStroll();
    if (!next) return false;
    this.stroll = next;
    this.game.phase = 'stroll';
    return true;
  }

  strollTo(x, y) {
    const g = this.game;
    const spot = this.stroll?.targets.find((o) => o.x === x && o.y === y);
    if (!spot) return false;
    this.strollers.shift();
    this.stroll = null;
    g.board.addMeeple(x, y, spot.i, g.current);
    g.player.meeples--;
    g.say(`${g.player.name}'s follower walks on and takes the ${spot.f.type} at (${x}, ${y}).`);
    g.emit('meeple', { feat: spot.i, player: g.current, at: { x: x + 0.5, y: y + 0.5 } });
    if (this.beginStroll()) return true;
    g.phase = 'meeple';
    this.afterScoring();
    return true;
  }

  /** Stay home instead — the follower is already back in the supply. */
  skipStroll() {
    if (this.game.phase !== 'stroll') return false;
    this.strollers.shift();
    this.stroll = null;
    if (this.beginStroll()) return true;
    this.game.phase = 'meeple';
    this.afterScoring();
    return true;
  }

  /**
   * The scoring is over and nobody is walking. If the turn was waiting on the
   * follower step it carries on; if the whole thing happened inside a storm on
   * somebody else's business, there is nothing to resume.
   */
  afterScoring() {
    const g = this.game;
    if (g.phase !== 'meeple') return;
    if (!g.meepleOptions().length && !this.holdsMeeplePhase()) g.endTurn();
  }

  // --- retiring a follower into a city ---------------------------------------

  /**
   * Lay one flat. A follower lying down in a city stops being a follower: it
   * never comes home, not even when the city finishes and pays — and the city
   * pays the LOWER rate for as long as it is the only thing holding it. It is
   * the answer to "I want to keep this city" in a mode where holding anything
   * costs you the piece.
   */
  flatTargets() {
    const g = this.game;
    // Offered from the follower step, and still offered once you are in the
    // middle of choosing — the guard used to empty the list the moment the
    // phase changed, so nothing could ever be picked.
    if (g.phase !== 'meeple' && g.phase !== 'flat') return [];
    const out = [];
    for (const cell of g.board.cells.values()) {
      const m = cell.meeple;
      if (!m || m.flat || m.player !== g.current || m.feat == null) continue;
      if (cell.type.feats[m.feat]?.type !== 'city') continue;
      out.push({ x: cell.x, y: cell.y });
    }
    return out;
  }

  canLieDown() { return this.flatTargets().length > 0 && !this.laidFlat; }

  beginFlat() {
    if (!this.canLieDown()) return false;
    this.game.phase = 'flat';
    return true;
  }

  flatAt(x, y) {
    if (!this.flatTargets().some((o) => o.x === x && o.y === y)) return false;
    const g = this.game;
    const cell = g.board.get(x, y);
    cell.meeple.flat = true;
    const d = g.board.featureOf(x, y, cell.meeple.feat);
    if (d) for (const m of d.meeples) if (m.x === x && m.y === y) m.flat = true;
    this.laidFlat = true;
    g.phase = 'meeple';
    g.say(`${g.player.name} lays a follower flat in the city at (${x}, ${y}) — it stays, `
      + 'and the city pays the lower rate from here on.');
    g.emit('landmark');
    return true;
  }

  cancelFlat() {
    if (this.game.phase !== 'flat') return false;
    this.game.phase = 'meeple';
    return true;
  }

  // --- the Balena -----------------------------------------------------------
  //
  // A whale the size of a district, and the only brake in the mode. It is not
  // anybody's piece: whoever is willing to spend their follower placement on
  // it decides what the weather can't touch this turn.

  /** Keep `cell.balena` true on exactly one square, wherever it drifted to. */
  settleBalena() {
    const board = this.game.board;
    for (const cell of board.cells.values()) cell.balena = false;
    if (!this.balena) return;
    let cell = board.get(this.balena.x, this.balena.y);
    // The whale can't be blown, but the tile under it can be taken off the
    // board other ways. If its perch has gone, it settles on the nearest one.
    if (!cell) {
      let best = null;
      for (const c of board.cells.values()) {
        const d = Math.abs(c.x - this.balena.x) + Math.abs(c.y - this.balena.y);
        if (!best || d < best.d) best = { c, d };
      }
      if (!best) { this.balena = null; return; }
      cell = best.c;
      this.balena = { x: cell.x, y: cell.y };
    }
    cell.balena = true;
  }

  /**
   * Anywhere on the board — that's the whole of it. It used to swim three
   * squares, which meant the whale could only ever shelter the neighbourhood
   * it was already in, and the tile you actually wanted saved was reliably
   * four squares away. A brake anybody can pick up is only a brake if it can
   * reach the thing that needs stopping.
   */
  balenaTargets() {
    if (!this.balena) return [];
    const out = [];
    for (const cell of this.game.board.cells.values()) {
      if (cell.x === this.balena.x && cell.y === this.balena.y) continue;
      out.push({ x: cell.x, y: cell.y });
    }
    return out;
  }

  canSwim() {
    return this.game.phase === 'meeple' && !this.balenaMoved && this.balenaTargets().length > 0;
  }

  /**
   * There is very often nothing to claim on the tile you just laid — roads
   * belong to nobody now — and the host would skip the follower step entirely.
   * The whale is spent INSTEAD of a follower, so the step has to stay open for
   * as long as there is a whale to send.
   */
  holdsMeeplePhase() {
    return !!this.lifted || this.flightLifts().length > 0 || this.canLieDown()
      || (!this.balenaMoved && this.balenaTargets().length > 0);
  }

  /** Instead of putting a follower down: send the whale somewhere. */
  beginSwim() {
    if (!this.canSwim()) return false;
    this.game.phase = 'balena';
    this.game.say(`${this.game.player.name} calls the Balena.`);
    return true;
  }

  onCellClick(x, y) {
    if (this.game.phase === 'stroll') return this.strollTo(x, y);
    if (this.game.phase === 'flat') return this.flatAt(x, y);
    if (this.game.phase === 'flight') return this.liftAt(x, y);
    if (this.game.phase !== 'balena') return false;
    if (!this.balenaTargets().some((t) => t.x === x && t.y === y)) return false;
    this.balena = { x, y };
    this.balenaMoved = true;
    this.settleBalena();
    this.game.say(`The Balena settles over (${x}, ${y}) — nothing there moves while it stays.`);
    this.game.emit('landmark');
    this.game.endTurn();
    return true;
  }

  // --- flying machines ------------------------------------------------------

  /**
   * The lane a machine sends a follower down: straight out the way it points,
   * over whatever tiles are there, until the country runs out — but a zephyr
   * crossed on the way is a wind you're in, not a wind you watch, so the
   * flight turns and follows it.
   */
  flightPath(cell) {
    const flier = cell.type.marks.find((m) => m.kind === 'flier');
    if (!flier) return null;
    const board = this.game.board;
    let dir = worldDir(cell, flier);
    let { x, y } = cell;
    const path = [];
    const seen = new Set();
    for (let step = 0; step < FLIGHT_RANGE; step++) {
      const [dx, dy] = SIDE_STEP[dir];
      x += dx; y += dy;
      const k = `${x},${y}`;
      if (seen.has(k)) break;                    // zephyrs pointed in a circle
      seen.add(k);
      // Open sky is something a flying machine crosses, not something that
      // stops it: reaching an island nobody has built a road to is most of
      // what the machine is for.
      const over = board.get(x, y);
      if (!over) continue;
      path.push(over);
      const winds = zephyrDirs(over);
      if (!winds.length || winds.includes(dir)) continue;
      const turn = winds.find((d) => d !== opposite(dir));
      if (turn == null) break;
      dir = turn;
    }
    return path.length ? path : null;
  }

  /**
   * Anywhere along that flight will do — and unlike an ordinary claim, it
   * doesn't matter whether somebody already holds the feature, and the island
   * rule doesn't apply. Flying out to one is the one way to CHOOSE to be
   * there. What it can't do is land on a tile with a figure already on it.
   *
   * If a follower has been LIFTED off the path, the flight carries on from
   * where it picked them up: only squares further along the lane are offered,
   * because the machine is flying, not turning round.
   */
  flightTargets() {
    if (!this.flight) return [];
    const board = this.game.board;
    const from = this.lifted ? this.lifted.step + 1 : 0;
    const out = [];
    this.flight.forEach((cell, step) => {
      if (step < from) return;
      if (!board.get(cell.x, cell.y) || cell.meeple) return;
      for (const { i, f } of claimableFeatures(cell.type, { fields: this.game.has('fields') })) {
        if (!board.featureOf(cell.x, cell.y, i)) continue;
        out.push({ x: cell.x, y: cell.y, i, f, flying: true });
      }
    });
    return out;
  }

  // --- the flying machine's other two verbs ---------------------------------
  //
  // A machine can put a follower DOWN on its lane, or it can pick one UP. The
  // second is the one that matters in a mode where nothing else ever comes
  // home: a figure you put in a city three storms ago, out on a rock you have
  // stopped caring about, is a figure you can go and fetch. Having fetched it
  // you may set it down again further along the same flight, or bring it home.

  /** Your own followers standing along this turn's flight. */
  flightLifts() {
    if (!this.flight || this.lifted) return [];
    const board = this.game.board;
    const out = [];
    this.flight.forEach((cell, step) => {
      if (board.get(cell.x, cell.y) !== cell) return;
      if (cell.meeple?.player !== this.game.current) return;
      out.push({ x: cell.x, y: cell.y, step });
    });
    return out;
  }

  canLift() {
    return this.game.phase === 'meeple' && this.flightLifts().length > 0;
  }

  beginLift() {
    if (!this.canLift()) return false;
    this.game.phase = 'flight';
    this.game.say(`${this.game.player.name} sends the flying machine down the lane to pick somebody up.`);
    return true;
  }

  /**
   * Lift one off. The follower goes straight back into its owner's supply,
   * which is also how it gets spent again if they set it down further along —
   * placing takes one out of the supply, so a lift-and-place nets to nothing
   * and a lift-and-leave gives a follower back.
   */
  liftAt(x, y) {
    const spot = this.flightLifts().find((o) => o.x === x && o.y === y);
    if (!spot) return false;
    const g = this.game;
    const cell = g.board.get(x, y);
    const m = cell.meeple;
    g.sendHome(cell);
    this.lifted = { step: spot.step, from: { x, y }, big: !!m.big };
    g.board.rebuild();
    g.phase = 'meeple';
    g.say(`${g.player.name}'s follower is lifted off (${x}, ${y}) — it may ride on down the lane, or go home.`);
    g.emit('meeple', { recall: true, player: m.player, at: { x: x + 0.5, y: y + 0.5 } });
    // Nowhere further to set it down: the flight ends and so does the turn.
    if (!this.flightTargets().length && !g.meepleOptions().length) g.endTurn();
    return true;
  }

  // --- the weather ----------------------------------------------------------

  /**
   * Blow, then pay for whatever that finished, then blow again if the settling
   * raised another wind.
   *
   * Re-entrant on purpose: scoring a closure can move the board, and moving the
   * board can score. Rather than recursing through `onClosed` — which would
   * interleave two storms and score them in an order nobody could follow —
   * anything raised mid-storm is queued and run after the current one lands.
   */
  weather(spec, by) {
    if (this.blowing) { this.queued.push([spec, by]); return; }
    this.blowing = true;
    // The visual clock. The rules resolve the whole storm synchronously —
    // nothing here waits — but each gust's EFFECTS are stamped a beat later
    // than the last, so a chain plays out on screen as a sequence you can
    // follow: streak, wake, slide, streak, wake, slide.
    this.stormAt = 0;
    this.stormN = 0;
    try {
      let job = [spec, by];
      for (let n = 0; job && n < MAX_CHAIN; n++) {
        this.blame = job[1];
        // The mainland is the one thing in the sky too big for the wind to get
        // under; it is recomputed per gust because the storm keeps changing
        // what the mainland IS.
        const rooted = () => this.land().mainKeys;
        for (const report of storm(this.game.board, job[0], { rooted })) this.applyGust(report);
        this.settleBalena();
        this.reopen();
        this.settle(job[1]);
        job = this.queued.shift();
      }
      if (this.queued.length) this.game.say('The sky runs out of breath.');
      this.queued.length = 0;
    } finally {
      this.blowing = false;
      this.blame = null;
    }
  }

  /** Turn one gust's report into points, losses, log lines and pictures. */
  applyGust(r) {
    const g = this.game;
    this.gusts++;
    const at = this.stormAt || 0;
    // The first gusts of a storm take a full beat; later ones come quicker, so
    // a six-gust chain reads as weather picking up pace rather than a queue.
    // Beats SHORTEN as a storm goes on: by the third corner you have
    // understood the shape and only want to see where it ends up. Never below
    // the floor, and both dials live in the design book.
    const BEAT = Math.max(DESIGN.storm.minBeat,
      DESIGN.storm.beat * (DESIGN.storm.decay ** (this.stormN || 0)));
    // The gust's own streak, down the lane it actually reached — and a beat on
    // the clock only if there was anything to watch.
    const acted = r.moved.length || r.fell.length || r.swung.length
      || r.homed.length || r.carried.length || r.lifted.length || r.zephyrs.length;
    if (r.from && acted) {
      const [dx, dy] = SIDE_STEP[r.dir];
      const far = r.reached.length
        ? Math.max(...r.reached.map((c) => (c.x - r.from.x) * dx + (c.y - r.from.y) * dy)) + 1
        : 2;
      g.emit('wind', {
        dir: r.dir, blast: !!r.blast, delay: at,
        from: { x: r.from.x, y: r.from.y },
        to: { x: r.from.x + dx * far, y: r.from.y + dy * far },
      });
    }
    // Every zephyr this gust wakes flashes just before its own gust plays.
    for (const zz of r.zephyrs) {
      g.emit('wake', { at: { x: zz.cell.x + 0.5, y: zz.cell.y + 0.5 }, blast: !!zz.blast, delay: at + BEAT * 0.55 });
    }
    if (acted) { this.stormAt = at + BEAT; this.stormN = (this.stormN || 0) + 1; }
    this.payTurbines(r.turbines);
    // A gust that found nothing has to SAY it found nothing. Nearly half the
    // zephyrs played point out over the edge of the country into open sky —
    // there is no run downwind, so there is no loose end and nothing happens —
    // and a silent nothing reads as a broken rule rather than as an empty lane.
    if (!r.moved.length && !r.swung.length && !r.homed.length && !r.lifted.length) {
      if (!r.reached.length) {
        g.say(r.blast
          ? 'The cannon fires out over open sky and finds nothing to hit.'
          : 'The zephyr blows out over open sky and finds nothing to push.');
      } else if (!r.fell.length) {
        g.say(`The zephyr blows, and the country in its lane is packed too tight to shift.`);
      }
      return;
    }

    g.emit('gust', {
      dir: r.dir,
      delay: at + 140,
      moves: r.moved.map((m) => ({
        from: { x: m.from.x + 0.5, y: m.from.y + 0.5 },
        at: { x: m.cell.x + 0.5, y: m.cell.y + 0.5 },
        type: m.cell.type, rot: m.cell.rot,
      })),
      fell: r.fell.map((f) => ({ x: f.x, y: f.y, type: f.type, rot: f.rot })),
    });
    if (r.strength > 1) {
      g.say(`The gust picks up — ${r.strength} tiles off the end, ${r.strength} squares each.`);
    }

    // A TILE OUT OF THE SKY IS A TILE BACK IN YOUR HAND. Whatever took it —
    // fired down a lane with nothing in it, or landed where it fits nothing —
    // it goes back on top of the deck, and whoever set the wind off may throw
    // ONE of them straight back down this turn, while the hole the wind just
    // made is still open. That is what turns a big storm from bookkeeping into
    // a swing, and it is the only thing that gives back what the cannon takes.
    // Once a turn, however many fall.
    if (r.fell.length) {
      this.fallen += r.fell.length;
      for (const f of r.fell) g.deck.unshift(f.id);
      const fired = r.fell.filter((f) => f.why === 'fired').length;
      const bad = r.fell.length - fired;
      const said = [];
      if (fired) said.push(`${fired} tile${fired > 1 ? 's are' : ' is'} fired clean out of the world`);
      if (bad) said.push(`${bad} land${bad > 1 ? '' : 's'} where nothing fits`);
      g.say(`${said.join(' and ')} — back to the top of the deck.`);
    }
    if (r.fell.length && this.blame === g.current && !this.caught) {
      this.caught = true;
      g.tilesLeft++;
      g.say(`${g.player.name} catches one out of the air, and may throw it straight back down.`);
      g.emit('landmark');
    }

    // Followers travel with the weather. One the wind put down somewhere is
    // still on the board and still counts for whoever owns it; one it carried
    // out over open sky is the only figure that ever comes home by accident.
    for (const m of r.carried) {
      g.emit('step', {
        from: { x: m.from.x + 0.5, y: m.from.y + 0.5 },
        at: { x: m.to.x + 0.5, y: m.to.y + 0.5 },
        key: `meeple:${m.to.x},${m.to.y}`, player: m.player,
        delay: at + 220,
      });
    }
    for (const m of r.homed) {
      g.players[m.player].meeples++;
      if (m.big) g.players[m.player].big++;
      g.say(m.why === 'fell'
        ? `${g.players[m.player].name}'s follower goes down with its tile and comes home.`
        : `${g.players[m.player].name}'s follower is blown into open sky and comes home.`);
      g.emit('meeple', { recall: true, player: m.player, at: { x: m.x + 0.5, y: m.y + 0.5 } });
    }

    // An island going somewhere as one thing is the most visible event on the
    // board, and the one a player most needs told: the country they were
    // standing on has just sailed.
    for (const l of r.lifted) {
      if (!l.steps) continue;
      g.say(`An island of ${l.cells.length} tile${l.cells.length > 1 ? 's' : ''} sails `
        + `${l.steps} square${l.steps > 1 ? 's' : ''} down the wind.`);
    }

    if (r.swung.length) {
      g.say(`${r.swung.length} road${r.swung.length > 1 ? 's swing' : ' swings'} onto the wind.`);
    }

    // …and if the seat of government itself has just been shoved, the whole
    // archipelago is towed along behind it.
    if (r.moved.some((m) => isPalazzo(m.cell))) this.driftIslands(r.dir);
    this.joinSferas();
  }

  /**
   * The Palazzo moves, and every island moves with it. The kingdom staying put
   * while the sky slides one square past it is the one thing on the board that
   * changes which pieces of country are touching which, without a single tile
   * being laid — so blowing the seat about is how you close a gap you were
   * never allowed to build across.
   *
   * An island only goes if the whole of it can: something in the way, or the
   * whale lying on any part of it, and it stays exactly where it is.
   */
  driftIslands(dir) {
    const board = this.game.board;
    const [dx, dy] = SIDE_STEP[dir];
    const { isles } = this.land();
    const moves = [];
    for (const group of isles) {
      if (group.some((c) => c.balena)) continue;
      const mine = new Set(group.map(key));
      const clear = group.every((c) => {
        const to = board.get(c.x + dx, c.y + dy);
        return !to || mine.has(`${c.x + dx},${c.y + dy}`);
      });
      if (!clear) continue;
      // Far end first, so the island slides along behind its own leading edge
      // rather than colliding with itself.
      const order = group.slice()
        .sort((a, b) => (b.x * dx + b.y * dy) - (a.x * dx + a.y * dy));
      for (const c of order) {
        const from = { x: c.x, y: c.y };
        if (!board.shift(from, { x: c.x + dx, y: c.y + dy })) continue;
        moves.push({
          from: { x: from.x + 0.5, y: from.y + 0.5 },
          at: { x: c.x + 0.5, y: c.y + 0.5 },
          type: c.type, rot: c.rot,
        });
      }
    }
    if (!moves.length) return;
    board.rebuild();
    this.drifts++;
    this.settleBalena();
    this.game.say(`The Palazzo goes with the wind, and the islands go with the Palazzo — ${moves.length} tile${moves.length > 1 ? 's' : ''} adrift.`);
    this.game.emit('gust', { dir, moves, fell: [] });
  }

  /**
   * …and the wind can UN-finish things. An Abbazia was capping that road; the
   * wind took the Abbazia away, and the road is open country again. Nothing is
   * taken back — nothing was paid for finishing in the first place — but it
   * has to stop counting as scored, or its windmills can never pay again and a
   * blue sphere would keep paying it at the finished rate for a city that is
   * standing open.
   */
  reopen() {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (!d.scored) continue;
      const done = CENTRE_FEATURES.has(d.type)
        ? board.surroundCount(d.at.x, d.at.y) === 8
        : d.open === 0;
      if (done) continue;
      board.unmark(d);
      this.game.say(`The ${d.type} at (${d.at.x}, ${d.at.y}) is open country again.`);
      // A city you were standing in and had FINISHED is worth less open than
      // it was shut, and the difference comes off you. Nothing was paid for
      // finishing it, so this is not a clawback — it is the cost of having
      // been holding the thing when the weather got to it.
      if (d.type !== 'city' || !d.meeples.length) continue;
      const cells = board.cellsOf(d);
      for (const p of board.majority(d)) {
        this.pay(p, -REOPENED * d.tiles.size,
          `${this.game.players[p].name}'s city is blown open — a point a tile`,
          cells.map((c) => ({ x: c.x, y: c.y })));
      }
    }
  }

  /**
   * The wind can finish things. Two halves of a city shoved together close it;
   * so does the country closing around a temple. Nothing else in the engine
   * looks for a completion that no tile placement caused, so this does.
   */
  settle(by) {
    const board = this.game.board;
    for (const d of board.allComponents()) {
      if (d.scored || d.type === 'field') continue;   // a field is never finished
      const done = CENTRE_FEATURES.has(d.type)
        ? board.surroundCount(d.at.x, d.at.y) === 8
        : d.open === 0;
      if (!done) continue;
      board.markScored(d);
      this.game.noteClosure(d, by);
      this.onClosed(d, by);
    }
  }

  // --- closing --------------------------------------------------------------

  onClosed(d, closer) {
    if (d.type === 'city' || d.type === 'road') return this.millsPay(d);
    if (d.type === 'temple') return this.templeCloses(d);
  }

  /**
   * Finishing anything pays nothing by itself. What it does is put a city on
   * the higher rate for the next blue sphere, and let a road be walked away
   * from — and that is all.
   *
   * The WINDMILL is the one exception left in the mode: every turbine standing
   * in a feature that finishes pays 2, and it pays WHOEVER HOLDS THE FEATURE
   * rather than whoever laid the closing tile. That distinction is the whole
   * point of it — a mill is a thing you own, not a race you win, and paying
   * the closer made the last tile of somebody else's city the most valuable
   * square on the board.
   */
  millsPay(d) {
    const g = this.game;
    const board = g.board;
    const cells = board.cellsOf(d);
    if (!cells.length) return;
    // A turbine is anchored to one feature on its tile, and on a tile carrying
    // two features that distinction is the difference between paying for the
    // one that closed and the one that didn't.
    const mills = cells.filter((c) => {
      const t = turbineOn(c);
      return t && t.on != null && board.featIndexOn(c, d) === t.on;
    }).length;
    if (!mills) return;
    const where = cells.map((c) => ({ x: c.x, y: c.y }));
    for (const p of board.majority(d)) {
      this.pay(p, WINDMILL * mills,
        `${mills} windmill${mills > 1 ? 's' : ''} in a finished ${d.type} — ${g.players[p].name}`,
        where);
    }
  }

  /**
   * A temple with all eight squares around it filled is a temple at its
   * ceiling: red pays a point a tile of the parish, and eight is as many tiles
   * as a parish holds. Nothing is paid for reaching it — it is worth saying
   * out loud because the parish is the one thing on the board that fills up.
   */
  templeCloses(d) {
    this.game.say(`The temple at (${d.at.x}, ${d.at.y}) is enclosed — a full parish, `
      + 'and as much as red will ever pay for it.');
    this.game.emit('landmark');
  }

  // --- the season -----------------------------------------------------------

  endRound() {
    if (this.game.board.size === 0) this.game.finish();
  }

  /**
   * The end of the season. Carcassonne's endgame, bent to a board that never
   * settled: the harvest is called in one last time, the cities that never
   * finished are paid for what they got to, and the sky counts who is standing
   * where.
   */
  finish() {
    // The islands are counted FIRST, off the board exactly as play left it —
    // before the last scoring round moves anything's rate around.
    this.archipelago();
    this.lastRound();
  }

  /**
   * The end of the season, and it is a sphere going off in every colour at
   * once: the farms, the cities, the temples and the roads are all scored one
   * final time. Everything you are still standing in pays, which is the whole
   * point of a mode where nothing is ever finished for good.
   *
   * Four passes, one each, and no more. Unpaired halves used to fire again
   * here, which made a sfera you could not place worth keeping — a consolation
   * prize for a thing that was already a whole colour's worth of decision.
   */
  lastRound() {
    this.game.say('The season turns, and the sky scores everything one last time.');
    for (const hue of Object.keys(COLOURS)) this.fire(hue);
    this.sweep();
  }

  /**
   * The archipelago. Ten flat points to whoever is standing on more separate
   * islands than anybody else — one follower on each of three islands beats
   * five followers parked on one, which is the whole of what it is for.
   */
  archipelago() {
    const g = this.game;
    const { isles } = this.land();
    const counts = g.players.map(() => 0);
    for (const group of isles) {
      const here = new Set();
      for (const cell of group) if (cell.meeple) here.add(cell.meeple.player);
      for (const p of here) counts[p]++;
    }
    const best = Math.max(0, ...counts);
    if (!best) {
      g.say('Nobody is standing on an island when the wind drops.');
      return;
    }
    const winners = counts.map((n, p) => (n === best ? p : -1)).filter((p) => p >= 0);
    for (const p of winners) {
      g.players[p].score += ARCHIPELAGO;
      g.say(`${g.players[p].name} holds ${best} island${best > 1 ? 's' : ''} at the end — +${ARCHIPELAGO}`);
    }
    g.emit('landmark');
  }

  // --- what a computer player can't see -------------------------------------
  //
  // The bot reads the board: what closed, who holds it, what it pays. None of
  // that includes the weather, and in this mode the weather is the game.

  botPlaceBonus(cells, player) {
    const w = weightsFor(this, player);
    let value = 0;
    for (const cell of cells) {
      value += this.templeValue(cell, player);
      // Closing a sphere is not a bonus in this mode, it is the scoring round:
      // everything the two colours count pays out over the whole board, to
      // whoever is standing in it. Priced as what it would pay US minus what
      // it would pay the best rival, so a sphere the table is better placed
      // for is one the bot leaves alone.
      const joins = this.joinsSphere(cell);
      if (joins) value += this.sphereValue(joins, player) * w.sphere;
      else if (cell.type.feats.some((f) => f.type === 'sfera')) value += w.sferaHalf;
      value += this.turbineValue(cell, player);
      for (const d of zephyrDirs(cell)) value += this.gustValue(cell, d, player) * w.gust;
    }
    return value;
  }

  /**
   * What closing this sphere is worth to us, net of what it hands everybody
   * else. Both halves fire, so both colours are counted; the pass is run for
   * real against a scratch tally rather than estimated, because the board-wide
   * passes are cheap and guessing at them was never going to be close.
   */
  sphereValue(hues, player) {
    const before = this.game.players.map((p) => p.score);
    const quiet = this.game.say;
    const emit = this.game.emit;
    this.game.say = () => {};
    this.game.emit = () => {};
    try {
      for (const hue of hues) this.fire(hue);
    } finally {
      this.pending.length = 0;              // thinking about a sphere doesn't empty the board
      this.game.say = quiet;
      this.game.emit = emit;
    }
    let mine = 0, best = 0;
    this.game.players.forEach((p, i) => {
      const gained = p.score - before[i];
      p.score = before[i];
      if (i === player) mine = gained; else best = Math.max(best, gained);
    });
    return mine - best;
  }

  /**
   * Filling a square in somebody's parish. Red pays a temple's keeper a point
   * for every tile standing around it, so every square of the eight you fill
   * in is worth a point to them on every red sphere still to come — which
   * means building beside a rival's temple is a gift, and beside your own is
   * an annuity.
   */
  templeValue(cell, player, weight = 1) {
    const board = this.game.board;
    const w = weightsFor(this, player);
    let value = 0;
    for (const [dx, dy] of RING) {
      const t = board.get(cell.x + dx, cell.y + dy);
      if (!t || !isTemple(t)) continue;
      const per = (this.onIsland(t) ? RATE.temple.isle : RATE.temple.main) * w.ahead;
      if (t.meeple) value += (t.meeple.player === player ? per : -per) * weight * w.parish;
      // An empty temple you could stand in yourself is a parish waiting for a
      // keeper, and worth rather more than one square of somebody else's.
      else value += w.parishFree * per * weight * w.parish;
    }
    return value;
  }

  /** A windmill is an annuity plus a bounty, so it's worth more than one gust. */
  turbineValue(cell, player) {
    const t = turbineOn(cell);
    if (!t || t.on == null) return 0;
    const w = weightsFor(this, player);
    const d = this.game.board.featureOf(cell.x, cell.y, t.on);
    if (!d) return 0;                            // no city under it, no income
    const mine = d.meeples.some((m) => m.player === player);
    return mine ? w.turbineMine : w.turbineTheirs;
  }

  /**
   * Sending the whale instead of putting a follower down. Only worth the turn
   * when there is nothing to claim — a follower on the board earns for the
   * rest of the game and the whale only stops things happening — and then only
   * when there is something specific under it worth stopping.
   */
  botAction(seat) {
    const g = this.game;
    const w = weightsFor(this, seat);
    if (g.current !== seat || g.phase !== 'meeple' || !this.canSwim()) return false;
    if (g.meepleOptions().length) return false;
    let best = null;
    for (const t of this.balenaTargets()) {
      const value = this.shelterValue(t, seat);
      if (!best || value > best.value) best = { ...t, value };
    }
    // A threshold rather than a scale. `whale` used to multiply the shelter
    // value, which changed neither the argmax nor the sign test and so did
    // precisely nothing — a sweep caught it returning identical games at half
    // and at double. As a bar the whale has to clear, it is a real dial: how
    // good the shelter has to be before it is worth a follower placement.
    if (!best || best.value <= w.whale) return false;
    if (!this.beginSwim()) return false;
    return this.onCellClick(best.x, best.y);
  }

  /** What parking the whale on a square is worth: what it stops happening. */
  shelterValue(at, seat) {
    const board = this.game.board;
    const cell = board.get(at.x, at.y);
    if (!cell) return 0;
    let value = 0;
    if (cell.meeple) value += cell.meeple.player === seat ? 3 : -1;
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'city') return;
      const d = board.featureOf(cell.x, cell.y, i);
      if (!d || !d.scored) return;
      // A finished city we hold is a payout the weather can reverse. Pinning a
      // tile of it is worth a share of what blowing it open would cost us.
      const mine = d.meeples.some((m) => m.player === seat);
      value += mine ? RATE.cityDone.main * d.tiles.size * 0.25 : -1;
    });
    return value;
  }

  /**
   * Does this tile put a half-sphere against another half? Returns the two
   * colours that would fire, or null — any half fits any other, so what the
   * pairing is worth depends entirely on which two.
   */
  joinsSphere(cell) {
    const board = this.game.board;
    for (let s = 0; s < 4; s++) {
      const i = board.featAt(cell, s);
      if (i == null || cell.type.feats[i].type !== 'sfera') continue;
      const nb = board.neighbor(cell.x, cell.y, s);
      if (!nb || nb.sphered) continue;
      const theirs = board.featAt(nb, opposite(s));
      if (theirs != null && nb.type.feats[theirs].type === 'sfera') {
        return [cell.type.feats[i].hue, nb.type.feats[theirs].hue];
      }
    }
    return null;
  }

  /**
   * What letting this gust out does. It is the same questions the wind itself
   * asks — how far down the lane does the country run, how hard is it blowing
   * by the time it gets to the loose end, whose figures are standing in the
   * way, whose temples and turbines does it feed — answered by walking the
   * lane rather than by simulating it, because the bot prices hundreds of
   * candidate squares a turn.
   *
   * The shape of the answer changed with the wind. A gust does nothing to the
   * country it passes through; what it is worth is what it does to the RAFT it
   * tears off the far end, and to every follower standing in the lane between
   * here and there.
   */
  gustValue(cell, dir, player) {
    const board = this.game.board;
    const w = weightsFor(this, player);
    const [dx, dy] = SIDE_STEP[dir];
    let value = 0;
    let strength = 1;
    const run = [];
    for (let step = 1; step <= 24; step++) {
      const other = board.get(cell.x + dx * step, cell.y + dy * step);
      if (!other) break;                         // the gap: this is the loose end
      if (other.balena) return value;            // the whale: nothing comes away
      run.push({ cell: other, force: strength });
      value += this.turbineValue(other, player) * 0.3;
      if (zephyrDirs(other).includes(dir)) strength = Math.min(MAX_STRENGTH, strength + 1);
    }
    if (!run.length) return value;
    const power = run[run.length - 1].force;
    const raft = new Set(run.slice(Math.max(0, run.length - power)).map((r) => r.cell));
    for (const { cell: other, force } of run) {
      // A follower about to be moved: ours is a risk, theirs is an
      // opportunity. One on the raft rides it and is only as exposed as its
      // tile; one on the country between is picked up and put down blind.
      if (other.meeple) {
        const steps = raft.has(other) ? power : force;
        const dest = board.get(other.x + dx * steps, other.y + dy * steps);
        const worse = (dest ? 0.6 : 2) * w.gustBlow * (raft.has(other) ? 0.5 : 1);
        value += other.meeple.player === player ? -worse : worse * 0.7;
      }
      // Only the raft actually lands somewhere new, so only the raft can
      // arrive in — or leave — somebody's parish.
      if (!raft.has(other)) continue;
      value += this.templeValue(
        { x: other.x + dx * power, y: other.y + dy * power }, player, 0.6);
      value -= this.templeValue({ x: other.x, y: other.y }, player, 0.6);
    }
    return value;
  }

  // --- UI -------------------------------------------------------------------

  /**
   * Everything is cloud, because nothing is ever settled. What the overlay has
   * to say instead is WHERE you are: an island is somewhere you can't build,
   * and it pays more, so it gets a rim of its own.
   */
  cellOverlay(cell) {
    const out = { cloud: true };
    if (this.onIsland(cell)) out.island = true;
    if (turbineOn(cell)) out.turbine = true;
    if (cell.balena) out.balena = true;
    return out;
  }

  actions() {
    const g = this.game;
    if (g.phase === 'stroll') {
      return [{ label: 'Send it home instead', key: 'Space', fn: () => this.skipStroll(), wide: true }];
    }
    if (g.phase === 'flat') {
      return [{ label: 'Leave them standing', fn: () => this.cancelFlat() }];
    }
    if (g.phase === 'balena') {
      return [{ label: 'Leave the Balena where it is', fn: () => this.cancelSwim() }];
    }
    if (g.phase === 'flight') {
      return [{ label: 'Leave them where they are', fn: () => this.cancelLift() }];
    }
    if (g.phase !== 'meeple') return [];
    const out = [{
      label: 'Send the Balena (anywhere)',
      fn: () => this.beginSwim(),
      disabled: !this.canSwim(),
    }];
    if (this.canLift()) {
      out.unshift({ label: 'Fly out and pick a follower up', fn: () => this.beginLift() });
    }
    if (this.canLieDown()) {
      out.unshift({ label: 'Lay a follower flat in its city', fn: () => this.beginFlat() });
    }
    if (this.lifted) {
      out.unshift({ label: 'Bring the lifted follower home', fn: () => g.skipMeeple(), wide: true });
    }
    return out;
  }

  cancelLift() {
    if (this.game.phase !== 'flight') return false;
    this.game.phase = 'meeple';
    return true;
  }

  cancelSwim() {
    if (this.game.phase !== 'balena') return false;
    this.game.phase = 'meeple';
    return true;
  }

  status() {
    const { main, isles } = this.land();
    const adrift = isles.reduce((n, g) => n + g.length, 0);
    return `${this.laid} tiles laid · mainland of ${main.length}`
      + ` · ${isles.length} island${isles.length === 1 ? '' : 's'} (${adrift} tiles)`
      + ` · ${this.gusts} gust${this.gusts === 1 ? '' : 's'}`
      + (this.drifts ? ` · ${this.drifts} towed by the Palazzo` : '');
  }

  panel() {
    const g = this.game;
    const { isles } = this.land();
    const rows = g.players.map((p, i) => {
      const active = i === g.current && g.phase !== 'over';
      const meeples = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(Math.max(0, SUPPLY - p.meeples))}</span>`;
      const mine = isles.filter((grp) => grp.some((c) => c.meeple?.player === i)).length;
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}${mine ? ` <span class="dim">${mine}⌖</span>` : ''}</span>
          <span class="pmeta">${meeples}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    const whale = this.balena ? `The Balena rests at (${this.balena.x}, ${this.balena.y}).` : 'The Balena is nowhere.';
    const closed = ['green', 'blue', 'red'].filter((h) => this.hues[h])
      .map((h) => `${this.hues[h]} ${h}`).join(', ');
    return `${rows}<p class="hint">${this.gusts} gust${this.gusts === 1 ? '' : 's'} · ${this.fallen} tile${this.fallen === 1 ? '' : 's'} lost for good · ${this.spheres ? `spheres harvested: ${closed}` : 'no sphere closed yet'} · ${whale}</p>`;
  }
}

Soffiando.spec = {
  id: 'soffiando',
  name: 'Soffiando (cloud kingdom)',
  Mode: Soffiando,
  groups: ['base', 'cloud'],
  // Ink on aged paper rather than twilight: the whole mode is a chart, the
  // zephyrs are the wind-heads drawn in its corners, and the panel has to be
  // the same sheet as the board.
  antique: true,
  meeples: true,
  minPlayers: 1,
  maxPlayers: 4,
  tideStart: 5,
  opening: 'A first stone hangs in the cloud. Everything else is weather.',
  hint: 'A zephyr does nothing to the country it blows through — it tears the LOOSE END off it. '
    + 'The run downwind ends at a gap, and the last tiles before it come away: power N pops N tiles off and carries each of them N squares. '
    + 'A GUST CANNON — six in the deck — does not carry them, it FIRES them: each flies until the square in front of it is taken, however far that is, and one fired down an empty lane never stops, which is to say it falls out of the sky. '
    + 'It gains a power off every zephyr blowing its own way and off every corner it turns, and it no longer stops at three. '
    + 'A tile the wind shakes loose of everything HANGS THERE, and every fragment off the biggest landmass is an ISLAND, down to one tile. Anything that does fall goes back on top of the deck, and you may throw one of them straight back down — once a turn. '
    + 'The mainland is the only country too big for the wind to get under: everything else adrift sails whole, and slides until it comes to rest against something — so islands meet and merge. '
    + 'Nothing is paid for being finished: closing a SPHERE is the scoring round, and both its halves fire a pass over the whole board. '
    + 'Green scores the farms (1 per two tiles of field), blue the cities (1 a tile open, 2 finished), red the temples (1 per tile around one), yellow the roads (1 a tile plus what each city it reaches is worth). '
    + 'Any half fits any other, so the pairing is the decision. '
    + 'You may only build onto the mainland, or an island you are already standing on; islands pay double. '
    + 'A follower blown onto a zephyr rides it, and again, and again. A feature that scores hands its followers back — or they walk on down a road, out over any amount of open air as long as a road points off the cliff on both sides. '
    + 'Instead of a follower, send the Balena anywhere on the board — nothing under the whale can be moved by any wind.',
};
