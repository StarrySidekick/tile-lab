// ---------------------------------------------------------------------------
// Girando — the cloud kingdom, where the board itself is weather.
//
// You place tiles and claim features like Carcassonne, and then the wind
// rearranges the country underneath you. Nothing in the sky is nailed down:
// every tile on the board can be pushed, finished or not, and the only thing
// that has ever stopped one is the whale lying on top of it.
//
// THE ZEPHYR is the engine — twenty-two of them in the deck. Play one and it
// blows down its lane: everything in that row or column, downwind, slides
// along, and THE ZEPHYR GOES WITH IT, one square into the hole it just opened.
// Without that it was a permanent hole-maker, shoving the country away from
// itself and then sitting in the gap. Two DOUBLE ZEPHYRS open at two squares
// rather than one; a gust that runs over a zephyr blowing the SAME way absorbs
// it and blows a square harder beyond it, up to three — never harder upon it,
// so a zephyr is never shoved along by its own breath. A zephyr pointing ANY
// OTHER way is woken rather than absorbed: the storm turns and carries on down
// the new zephyr's lane, in the new zephyr's direction. Across the wind, back
// into it, it makes no difference — a line of zephyrs is a chain reaction that
// turns corners. What keeps it finite is that no zephyr contributes the same
// direction to the same storm twice. The ones that blow several ways at once
// don't travel: there is no answer to which way a compass rose would go, so it
// stands still in the hole it makes of its own neighbourhood, and usually falls
// through it.
//
// A TILE TOUCHING NOTHING ORTHOGONALLY falls out of the sky, back to the bottom
// of the deck — and that is asked of every tile after a gust, not only the ones
// that moved, because a tile the wind never touched is left hanging when the
// neighbours holding it up slide away. Whoever set the wind off may catch one
// and throw it straight back down, taking a second placement while the hole the
// wind just made is still open. Once a turn.
//
// FOLLOWERS ARE WEATHER TOO, and they STAY. A figure put down is a figure that
// stays down: it is never handed back for having scored, because in this mode
// a feature scores over and over and the figure standing in it is the record of
// whose it is. Nine of them each rather than seven, because they do not come
// back. Exactly two things take one off the board — a gust that carries it out
// over open sky, and your own flying machine going out to fetch it.
//
// NOTHING IS PAID FOR BEING FINISHED. The sferas are the scoring engine, and
// closing a sphere is the event the whole mode turns on: each of its two halves
// fires a scoring pass over one kind of thing, EVERYWHERE ON THE BOARD, paying
// whoever is standing in each one.
//
//   GREEN  the farms — a point for every two tiles of field
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
// Two things still pay outside the spheres, both attached to a BUILDING rather
// than to a feature, and both deliberately small: a WINDMILL pays 2 to whoever
// lays the tile that closes its city, and 1 to whoever holds that city for
// every gust that runs through it. Everything else — every farm, every city,
// every temple, every road — waits for a sphere.
//
// AN ISLAND pays exactly DOUBLE, all of it — and at the end a flat 10 goes to
// whoever has a follower standing on more separate islands than anybody else.
//
// AT THE END the sky fires every colour once, plus once more for every
// half-sphere still lying around unpaired. A sfera you could never find a
// partner for is a colour you get one more of when the wind drops.
//
// THE PALAZZO is what "mainland" means. Whichever piece of country the seat of
// government is standing on is the kingdom; every other group of two or more
// tiles is an ISLAND. You may not build onto an island and you may not walk a
// follower onto one — a tile only goes down where it touches the mainland.
// Islands are made, not chosen: you were standing there when the country blew
// apart, or you blew a tile across the gap, or you flew somebody out on a
// flying machine. And when the wind gets hold of the PALAZZO ITSELF, every
// island in the sky slides one square the way the seat went.
//
// THE BALENA is a sky whale the size of a district. Whatever tile it is lying
// on cannot be moved by any wind, and no gust passes through it — everything
// in its lee is sheltered. On your turn, INSTEAD of placing a follower, you
// may move it three squares to wherever you want it. It is the only brake in
// the mode, and it is a brake anybody can pick up.
//
// THE WINDVANE has four ways in and only two of them joined, and the wind picks
// which two. Straight roads do the same thing, quietly: a road hit side-on
// swings to lie along the wind.
//
// A TEMPLE is a monastery with no cloister left in it, and it is the one thing
// on the board whose value is its NEIGHBOURS: red pays its keeper a point for
// every tile standing in the eight squares around it, so a temple laid early
// and garrisoned is worth more every time somebody builds near it — and worth
// something to your rival every time you do.
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
import { claimableFeatures, citiesFed } from '../mechanics.js';
import {
  storm, zephyrDirs, worldDir, turbineOn, isTemple, MAX_STRENGTH,
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
const TURBINE = 1;           // to the city's holder, per gust through it
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
export const GIRANDO_WEIGHTS = {
  ahead: 2,          // firings a claim is priced over — and claim eagerness
  farm: 2,           // …scaled per feature type, because the four colours pay
  city: 1,           //    over different numbers of tiles and the bot has no
  road: 0.55,        //    way of knowing which of them is actually winnable
  temple: 1.2,
  sphere: 1,         // closing one, net of what it hands the table
  sferaHalf: 1,      // holding a half nobody has paired yet
  parish: 0.6,       // filling a square in somebody's parish
  parishFree: 0.3,   // …and an empty temple you could go and stand in
  turbineMine: 10,   // a windmill in a city we hold
  turbineTheirs: -3.4, // …or one somebody else does
  gust: 0.92,        // everything a gust does, as one dial
  gustBlow: 1,       // shoving a follower — ours out, theirs off
  whale: 0,          // points of shelter before the Balena is worth a turn
};

/** A seat's own weights, or the defaults. */
const weightsFor = (mode, seat) => mode.brains?.[seat] || GIRANDO_WEIGHTS;
const WINDMILL = 2;          // …and per windmill, to whoever closes its city
const MAX_CHAIN = 6;         // storms raised while a storm is still landing
const FLIGHT_RANGE = 24;     // squares, before we assume the zephyrs are a loop
const BALENA_RANGE = 3;      // squares the whale swims in one turn
const ARCHIPELAGO = 10;      // at the end, to whoever stands on the most islands
const EXTRA_FOLLOWERS = 2;   // …on top of everyone's usual seven
const SUPPLY = 9;            // …which is what the panel draws

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
 * What Girando plays instead of parts of the base set. The three-way junctions
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

export class Girando extends Mode {
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
    // Two more followers than anywhere else. Nothing here ever comes home off
    // a scored feature — a figure is put down and stays down — so a supply of
    // seven is a supply you run out of halfway through and then watch the
    // spheres go off without you.
    for (const p of this.game.players) p.meeples += EXTRA_FOLLOWERS;
    this.flight = null;
    this.lifted = null;
    this.laid = 0;
    this.gusts = 0;
    this.fallen = 0;
    this.spheres = 0;          // spheres closed so far
    this.hues = {};            // …and how many of each colour
    this.drifts = 0;           // times the Palazzo has towed the islands along
    this.blowing = false;
    this.blame = null;         // whose weather is currently running
    this.queued = [];
    this.caught = false;       // a tile fell into our hands this turn
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
    // The seat, if it is still on the board at all; the biggest piece of
    // country if the wind has blown the Palazzo out of the sky entirely.
    const main = groups.find(hasPalazzo) || groups[0] || [];
    // A lone tile adrift is not an island — it is a tile adrift. Two or more
    // that hold each other up are somewhere you could actually live.
    const isles = groups.filter((g) => g !== main && g.length >= 2);
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
    return { onto: this.land().mainKeys };
  }

  /** An island is somewhere you are blown or flown to, never walked onto. */
  claimAllowed({ x, y }) {
    return !this.onIsland(this.game.board.get(x, y));
  }

  // --- placing --------------------------------------------------------------

  afterPlace(cell) {
    cell.round = this.game.round;
    this.laid++;
    const dirs = zephyrDirs(cell);
    if (dirs.length) {
      this.game.say(dirs.length > 1
        ? `${this.game.player.name} lets the wind out ${dirs.length} ways at once.`
        : `${this.game.player.name} lets the zephyr out.`);
      const from = { x: cell.x, y: cell.y };
      this.weather(dirs.map((dir) => ({ dir, from })), this.game.current);
    }
    this.joinSferas();
    // The flight is worked out after the weather, because the weather may have
    // just rearranged everything the machine was going to fly over.
    this.flight = this.flightPath(cell);
    return 'meeple';
  }

  endTurn() {
    this.flight = null;
    this.lifted = null;
    this.caught = false;
    this.balenaMoved = false;
    if (this.laid >= STORM_LIMIT) {
      this.game.say('The season turns, and the wind drops.');
      this.game.finish();
    }
  }

  /**
   * What a feature is worth to a computer player. Everything in Girando is
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
        this.pay(p, TURBINE, `${this.game.players[p].name}'s turbine turns`,
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
    }
  }

  /**
   * One half-sphere going off: a scoring pass over one kind of thing, over the
   * whole board, paying whoever holds each one. Nothing in Girando is paid for
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
      const per = this.rate(done ? 'cityDone' : 'cityOpen', cells);
      this.payHolders(d, per * d.tiles.size,
        `${done ? 'A finished' : 'An unfinished'} city of ${d.tiles.size} tile${d.tiles.size === 1 ? '' : 's'}`
        + `${per > RATE[done ? 'cityDone' : 'cityOpen'].main ? ' out on an island' : ''}`, cells);
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
      if (!isTemple(cell) || !cell.meeple) continue;
      const around = board.surroundCount(cell.x, cell.y);
      if (!around) continue;
      const per = this.onIsland(cell) ? RATE.temple.isle : RATE.temple.main;
      this.pay(cell.meeple.player, around * per,
        `A temple with ${around} tile${around === 1 ? '' : 's'} around it`
        + `${per > RATE.temple.main ? ' out on an island' : ''}`
        + ` — ${this.game.players[cell.meeple.player].name}`,
        [{ x: cell.x, y: cell.y }]);
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
   * Pay a component's majority. Followers STAY where they are: a feature here
   * can be scored many times over, and the figure standing in it is the record
   * of whose it is. Only the wind and a friendly flying machine ever take one
   * off the board.
   */
  payHolders(d, pts, line, cells) {
    if (pts <= 0) return;
    const g = this.game;
    const where = cells.map((c) => ({ x: c.x, y: c.y }));
    for (const p of g.board.majority(d)) {
      this.pay(p, pts, `${line} — ${g.players[p].name}`, where);
    }
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

  /** Three squares, orthogonally, onto any tile — that's the whole of it. */
  balenaTargets() {
    if (!this.balena) return [];
    const out = [];
    for (const cell of this.game.board.cells.values()) {
      const d = Math.abs(cell.x - this.balena.x) + Math.abs(cell.y - this.balena.y);
      if (d > 0 && d <= BALENA_RANGE) out.push({ x: cell.x, y: cell.y });
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
    return !!this.lifted || this.flightLifts().length > 0
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
    try {
      let job = [spec, by];
      for (let n = 0; job && n < MAX_CHAIN; n++) {
        this.blame = job[1];
        for (const report of storm(this.game.board, job[0])) this.applyGust(report);
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
    this.payTurbines(r.turbines);
    if (!r.moved.length && !r.swung.length && !r.homed.length) return;

    g.emit('gust', {
      dir: r.dir,
      moves: r.moved.map((m) => ({
        from: { x: m.from.x + 0.5, y: m.from.y + 0.5 },
        at: { x: m.cell.x + 0.5, y: m.cell.y + 0.5 },
        type: m.cell.type, rot: m.cell.rot,
      })),
      fell: r.fell.map((f) => ({ x: f.x, y: f.y, type: f.type, rot: f.rot })),
    });
    if (r.strength > 1) {
      g.say(`The gust picks up a second wind — ${r.strength} squares.`);
    }

    // A tile the wind pushes off the edge of the world goes back to the bottom
    // of the deck — and whoever set the wind off may catch one and throw it
    // straight back down, which is what turns a big storm from bookkeeping
    // into a swing: the wind clears you a hole and hands you something to put
    // in it while it's still open. Once a turn.
    let caught = 0;
    for (const f of r.fell) {
      this.fallen++;
      g.deck.unshift(f.id);
      caught++;
    }
    if (r.fell.length) {
      g.say(`${r.fell.length} tile${r.fell.length > 1 ? 's' : ''} blow off the edge of the world and back into the deck.`);
    }
    if (caught && this.blame === g.current && !this.caught) {
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
      });
    }
    for (const m of r.homed) {
      g.players[m.player].meeples++;
      if (m.big) g.players[m.player].big++;
      g.say(`${g.players[m.player].name}'s follower is blown into open sky and comes home.`);
      g.emit('meeple', { recall: true, player: m.player, at: { x: m.x + 0.5, y: m.y + 0.5 } });
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
    if (d.type === 'city') return this.cityCloses(d, closer);
    if (d.type === 'temple') return this.templeCloses(d);
  }

  /**
   * Finishing a city pays nothing. What it does is put the city on the higher
   * rate — 2 a tile instead of 1 — for every blue sphere that closes after,
   * which is a longer and much more interesting bet than a lump sum.
   *
   * The WINDMILL is the one thing left in the mode that is paid for finishing
   * anything: 2 to whoever laid the closing tile, per turbine standing in the
   * city, and no wind ever takes it back. It is the only guaranteed point on
   * the board and it is deliberately small.
   */
  cityCloses(d, closer) {
    const g = this.game;
    const board = g.board;
    const cells = board.cellsOf(d);
    if (!cells.length || closer == null) return;
    // A turbine is anchored to one feature on its tile, and on a tile carrying
    // two cities that distinction is the difference between paying for the
    // city that closed and the one that didn't.
    const mills = cells.filter((c) => {
      const t = turbineOn(c);
      return t && t.on != null && board.featIndexOn(c, d) === t.on;
    }).length;
    if (!mills) return;
    this.pay(closer, WINDMILL * mills,
      `${mills} windmill${mills > 1 ? 's' : ''} in a finished city — ${g.players[closer].name}`,
      cells.map((c) => ({ x: c.x, y: c.y })));
  }

  /**
   * A temple with all eight squares around it filled is a temple at its
   * ceiling: red pays a point a tile of the parish, and eight is as many tiles
   * as a parish holds. The keeper STAYS — every figure in Girando stays where
   * it is put — and goes on being paid by every red sphere that closes.
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
   * And every UNPAIRED half still lying on the board fires its own colour an
   * EXTRA time. A sfera you could never find a partner for is not a wasted
   * tile — it is a colour you get one more of when the wind drops.
   */
  lastRound() {
    const g = this.game;
    const spare = [...g.board.cells.values()]
      .filter((c) => !c.sphered)
      .map(sferaHue)
      .filter(Boolean);
    g.say('The season turns, and the sky scores everything one last time'
      + `${spare.length ? ` — with ${listTally(spare, (h) => COLOURS[h])} once more, `
        + `for the ${spare.length === 1 ? 'half-sphere' : 'half-spheres'} that never found a partner` : ''}.`);
    for (const hue of Object.keys(COLOURS)) this.fire(hue);
    for (const hue of spare) this.fire(hue);
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
   * asks — how hard is it blowing by the time it gets there, whose figures are
   * in the way, whose temples and turbines does it feed — answered by walking
   * the lane rather than by simulating it, because the bot prices hundreds of
   * candidate squares a turn.
   */
  gustValue(cell, dir, player) {
    const board = this.game.board;
    const w = weightsFor(this, player);
    const [dx, dy] = SIDE_STEP[dir];
    let value = 0;
    let strength = 1;
    for (let step = 1; step <= 24; step++) {
      const other = board.get(cell.x + dx * step, cell.y + dy * step);
      if (!other) continue;
      if (other.balena) break;                   // the whale ends the lane
      value += this.turbineValue(other, player) * 0.3;
      // A follower about to be moved: ours is a risk, theirs is an opportunity,
      // and either way the further it travels the less likely it lands well.
      if (other.meeple) {
        const dest = board.get(other.x + dx * strength, other.y + dy * strength);
        const worse = (dest ? 0.6 : 2) * w.gustBlow;   // over open sky it goes home
        value += other.meeple.player === player ? -worse : worse * 0.7;
      }
      value += this.templeValue(
        { x: other.x + dx * strength, y: other.y + dy * strength }, player, 0.6);
      if (zephyrDirs(other).includes(dir)) strength = Math.min(MAX_STRENGTH, strength + 1);
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
    if (g.phase === 'balena') {
      return [{ label: 'Leave the Balena where it is', fn: () => this.cancelSwim() }];
    }
    if (g.phase === 'flight') {
      return [{ label: 'Leave them where they are', fn: () => this.cancelLift() }];
    }
    if (g.phase !== 'meeple') return [];
    const out = [{
      label: `Send the Balena (${BALENA_RANGE} squares)`,
      fn: () => this.beginSwim(),
      disabled: !this.canSwim(),
    }];
    if (this.canLift()) {
      out.unshift({ label: 'Fly out and pick a follower up', fn: () => this.beginLift() });
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
    return `${rows}<p class="hint">${this.gusts} gust${this.gusts === 1 ? '' : 's'} · ${this.fallen} tile${this.fallen === 1 ? '' : 's'} blown out of the sky · ${this.spheres ? `spheres harvested: ${closed}` : 'no sphere closed yet'} · ${whale}</p>`;
  }
}

Girando.spec = {
  id: 'girando',
  name: 'Girando (cloud kingdom)',
  Mode: Girando,
  groups: ['base', 'cloud'],
  meeples: true,
  minPlayers: 1,
  maxPlayers: 4,
  tideStart: 5,
  opening: 'A first stone hangs in the cloud. Everything else is weather.',
  hint: 'A zephyr blows its whole lane and wakes every other zephyr it reaches. '
    + 'Nothing is paid for being finished: closing a SPHERE is the scoring round, and both its halves fire a pass over the whole board. '
    + 'Green scores the farms (1 per two tiles of field), blue the cities (1 a tile open, 2 finished), red the temples (1 per tile around one), yellow the roads (1 a tile plus what each city it reaches is worth). '
    + 'Any half fits any other, so the pairing is the decision. '
    + 'You may only build onto the Palazzo’s mainland; everything adrift is an island, and islands pay more. '
    + 'Instead of a follower, send the Balena — nothing under the whale can be moved by any wind.',
};
