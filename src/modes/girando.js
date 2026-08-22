// ---------------------------------------------------------------------------
// Girando — the cloud kingdom, where the board itself is weather.
//
// You place tiles and claim features like Carcassonne, and then the wind
// rearranges the country underneath you. Nothing in the sky is nailed down:
// every tile on the board can be pushed, finished or not, and the only thing
// that has ever stopped one is the whale lying on top of it.
//
// THE ZEPHYR is the engine — twenty of them in a seventy-two tile deck. Play
// one and it blows down its lane: everything in that row or column, downwind,
// slides along. A gust that runs over a zephyr blowing the SAME way absorbs it
// and blows a square harder beyond it, up to three — never harder upon it, so
// a zephyr is never shoved along by its own breath. A zephyr pointing ANY
// OTHER way is woken rather than absorbed: the storm turns and carries on down
// the new zephyr's lane, in the new zephyr's direction. Across the wind, back
// into it, it makes no difference — a line of zephyrs is a chain reaction that
// turns corners. What keeps it finite is that no zephyr contributes the same
// direction to the same storm twice.
//
// A TILE THAT LANDS TOUCHING NOTHING ORTHOGONALLY falls out of the sky, back
// to the bottom of the deck — and whoever set the wind off may catch one and
// throw it straight back down, taking a second placement while the hole the
// wind just made is still open. Once a turn.
//
// FOLLOWERS ARE WEATHER TOO. Once a figure is on the board it never comes off
// by choice: a gust blows it the same distance as everything else in its lane,
// and it takes up whatever it lands in. Blown over open sky, it goes back to
// its owner's hand. That is the only way home for a knight — and it is why a
// follower STAYS in a city that finishes. The city is a thing that can be
// blown open again, and the figure standing in it is the record of who owns
// it. Only farmers ever walk home off a scored feature.
//
// WHAT SCORES, AND WHAT UN-SCORES:
//
//   A CITY pays 2 a tile the FIRST time it finishes, and only ever to somebody
//     standing in it — an empty city is a nice piece of country worth nothing.
//     After that it is worth 1 a tile, down every time the wind blows it open
//     and up every time it closes again. So a city you finish and then lose is
//     still ahead; what the weather takes is the difference between holding it
//     and having held it. The WINDMILL is the reason to build around one:
//     every turbine standing in a city that finishes pays 2 to whoever laid
//     the last tile, and no wind ever takes that back.
//   A ROAD is nobody's. You don't claim it; you finish it, and finishing it
//     pays you 1 a tile. What makes a road worth building is what it ARRIVES
//     at: every city or temple it runs into pays 2 to whoever holds that city
//     or temple — which is very often not you. Roads are the mode's diplomacy.
//   A FARM is harvested when a SPHERE CLOSES, and the COLOUR of the sphere
//     decides what the harvest counts on the field it is lying in. GREEN pays
//     1 a tile of farmland, BLUE 2 a finished city the field feeds, RED 2 a
//     temple standing on it. The farmers then walk home — the only figures in
//     the mode that ever leave a scored feature under their own steam.
//   AN ISLAND pays more of everything. Roads 2 a tile, cities 3, farms double
//     — and at the end of the game a flat 10 to whoever has a follower
//     standing on more separate islands than anybody else.
//   A TEMPLE pays as it goes: 1 to its keeper for every tile LAID in the eight
//     squares around it, 2 for every tile the wind BLOWS in.
//
// AT THE END the sky settles up, the way Carcassonne does, bent to a board
// that never settled. The islands are counted off the board exactly as play
// left it. Every farm still being worked is harvested once more, taking its
// colour from any sfera lying in the field and falling back to blue. And a
// city that never finished at all pays 1 a tile — while one that finished and
// was blown open pays nothing more, because it was already paid in full and
// already gave a point a tile back. That is the whole of its account.
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
// THE ABBAZIA takes any edge and CAPS everything it touches: a road running
// into one ends there, a city walls itself off against it, and both can finish
// without ever meeting anything. It is also perfectly blowable — and when it
// goes, everything it was holding shut is open country again.
//
// THE FLYING MACHINE points down a lane. Place one and your follower may go on
// ANY tile out along that lane rather than only the tile you just laid — an
// island included, which is the one way to reach one on purpose.
//
// The thesis is in one line: NOTHING IS SETTLED. A city is finished until the
// weather says otherwise, the mainland is wherever the Palazzo happens to be
// this turn, and the only permanent thing on the board is a whale that anyone
// can move.
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

const DECK_SIZE = 72;        // a full Carcassonne set's worth of country
/**
 * The backstop, in tiles laid rather than rounds played. Counting placements
 * is the only clock that means the same thing at every player count, and this
 * one sits a third above the deck.
 */
const STORM_LIMIT = 96;
const TEMPLE_LAID = 1;       // to its keeper, per tile placed in the ring
const TEMPLE_BLOWN = 2;      // …and per tile the wind puts there
const TURBINE = 1;           // to the city's holder, per gust through it
const WINDMILL = 2;          // …and per windmill, to whoever closes its city
const ROAD_LINK = 2;         // to the holder of every city or temple a road reaches
const MAX_CHAIN = 6;         // storms raised while a storm is still landing
const FLIGHT_RANGE = 24;     // squares, before we assume the zephyrs are a loop
const BALENA_RANGE = 3;      // squares the whale swims in one turn
const ARCHIPELAGO = 10;      // at the end, to whoever stands on the most islands

/**
 * What everything pays, on the mainland and out on an island. Islands pay more
 * of everything, and you cannot build onto one: the only ways to be there are
 * to have been blown there, to have been there when the country came apart, or
 * to have flown. That premium is the whole reason to take any of those.
 */
const RATE = {
  city: { main: 2, isle: 3 },     // per tile, the FIRST time it finishes
  road: { main: 1, isle: 2 },     // per tile, to whoever finishes it
  // …and per tile, at the very end, for a city that never finished at all.
  cityOpen: { main: 1, isle: 2 },
  /**
   * The harvest, by the colour of the sphere that called it in. Green counts
   * the ground, blue counts what the ground feeds, red counts what is standing
   * on it — so the field worth planting depends on which sfera you are holding,
   * which is the whole reason the sfera has colours.
   */
  farm: {
    green: { of: 'tiles', main: 1, isle: 2, what: 'tile of farmland' },
    blue: { of: 'cities', main: 2, isle: 4, what: 'finished city' },
    red: { of: 'temples', main: 2, isle: 4, what: 'temple' },
  },
};

/**
 * A city is worth 2 a tile ONCE. After that it is worth 1 a tile, down when
 * the wind blows it open and up when it closes again — flat, on the mainland
 * and on an island alike, because it is the oscillation that is being priced
 * rather than the country. So a city you finish and then lose is still ahead;
 * what you lose is the difference between holding it and having held it.
 */
const CITY_AGAIN = 1;           // per tile, every closure after the first
const CITY_BACK = 1;            // per tile, every time it is blown open again

/** Which colour a sphere is, read off any of its halves. */
const sferaHue = (cell) =>
  cell?.type.feats.find((f) => f.type === 'sfera')?.hue || 'green';

/**
 * What Girando plays instead of parts of the base set. The three-way junctions
 * become junctions with a village on them; there are no cloisters in the sky,
 * so every one is a temple; and the four-sided city is out, because a city
 * that can only be entered and never capped is one the weather never lets you
 * finish.
 */
const SWAPS = { W: 'Gw', L: 'Gl', A: 'Kta', B: 'Kt', C: 'E' };

/** The eight squares around a tile — a temple's parish. */
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const inRing = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
  && !(a.x === b.x && a.y === b.y);

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
    this.flight = null;
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
    this.paidRing = new Set(); // "temple|tile" pairs already paid this turn
    this.owed = new Set();     // city payouts still owed back if the wind opens them
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
   * Cached against a hash of the board's occupied squares rather than against
   * a turn counter, because the wind rearranges the board several times inside
   * a single turn and the renderer asks this question once per visible tile
   * per frame. The hash is a pass over the cells; the sort and the flood fill
   * behind it only run when the country has actually changed shape.
   */
  land() {
    const board = this.game.board;
    let stamp = board.size * 2654435761;
    for (const c of board.cells.values()) {
      stamp = (Math.imul(stamp ^ ((c.x + 4096) * 8192 + (c.y + 4096)), 16777619)) >>> 0;
    }
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

  /** Roads belong to nobody now, and an island is somewhere you're blown to. */
  claimAllowed({ x, y, f }) {
    if (f.type === 'road') return false;
    return !this.onIsland(this.game.board.get(x, y));
  }

  // --- placing --------------------------------------------------------------

  afterPlace(cell) {
    cell.round = this.game.round;
    this.laid++;
    this.payTemples([{ cell, from: null }], TEMPLE_LAID);
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
    this.paidRing.clear();
    this.caught = false;
    this.balenaMoved = false;
    if (this.laid >= STORM_LIMIT) {
      this.game.say('The season turns, and the wind drops.');
      this.game.finish();
    }
  }

  // --- temples --------------------------------------------------------------

  /**
   * A temple is worth exactly what happens next to it. Every tile that arrives
   * in its eight squares pays whoever is standing in it — one for a tile a
   * player laid there, two for one the wind put there.
   *
   * Paid at most once per temple per tile per turn. Without that, two zephyrs
   * pointed at each other could walk the same tile in and out of the same
   * parish all turn and print money doing it.
   */
  payTemples(arrivals, rate) {
    const g = this.game;
    for (const { cell, from } of arrivals) {
      if (!cell || g.board.get(cell.x, cell.y) !== cell) continue;
      for (const [dx, dy] of RING) {
        const temple = g.board.get(cell.x + dx, cell.y + dy);
        if (!temple || !isTemple(temple) || !temple.meeple) continue;
        if (from && inRing(from, temple)) continue;     // it was already in the parish
        const k = `${temple.x},${temple.y}|${cell.seq}`;
        if (this.paidRing.has(k)) continue;
        this.paidRing.add(k);
        this.pay(temple.meeple.player, rate,
          `${g.players[temple.meeple.player].name}'s temple at (${temple.x}, ${temple.y}) takes an offering`,
          [{ x: temple.x, y: temple.y }, { x: cell.x, y: cell.y }]);
      }
    }
  }

  /**
   * A temple pays nothing when it closes; it pays all the way there. Nothing
   * in the engine scores one, so this exists purely to tell anyone pricing the
   * board — the computer player, mostly — what standing in it is worth.
   */
  valueOf(d) {
    if (d.type !== 'temple') return null;
    const left = 8 - this.game.board.surroundCount(d.at.x, d.at.y);
    return Math.round(left * (TEMPLE_LAID + TEMPLE_BLOWN) / 2);
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
      const hue = sferaHue(cells[0]);
      this.spheres++;
      this.hues[hue] = (this.hues[hue] || 0) + 1;
      this.game.say(`A ${hue} sphere closes, and calls in the harvest on the field beneath it — `
        + `${RATE.farm[hue].main} a ${RATE.farm[hue].what}.`);
      this.game.emit('landmark');
      this.harvest(cells, hue);
    }
  }

  /** Score every field the closing sphere's own tiles are lying in. */
  harvest(cells, hue) {
    const board = this.game.board;
    const done = new Set();
    let paid = 0;
    for (const cell of cells) {
      cell.type.feats.forEach((f, i) => {
        if (f.type !== 'field') return;
        const field = board.featureOf(cell.x, cell.y, i);
        if (!field || done.has(field)) return;
        done.add(field);
        if (this.scoreFarm(field, hue)) paid++;
      });
    }
    if (!paid) this.game.say('…and there is nobody farming it.');
  }

  /**
   * What a field is worth under a given sphere. The colour picks what gets
   * counted, and the field it is counted over is the same field either way:
   *
   *   GREEN counts the GROUND — a point a tile, so the sprawling field nobody
   *     built anything on is suddenly the valuable one.
   *   BLUE counts what the ground FEEDS — two a finished city, which is the
   *     nearest thing to Carcassonne's own farm and the one that rewards
   *     farming beside your own building.
   *   RED counts what is STANDING on it — two a temple, and a temple is
   *     already the thing you were garrisoning for its own income.
   *
   * Doubled out on an island, like everything else out there.
   */
  farmValue(field, hue) {
    const board = this.game.board;
    const rule = RATE.farm[hue] || RATE.farm.green;
    const cells = board.cellsOf(field);
    const per = this.onIsland(cells[0]) ? rule.isle : rule.main;
    let n = 0;
    if (rule.of === 'tiles') n = field.tiles.size;
    else if (rule.of === 'cities') n = citiesFed(board, field).size;
    else n = cells.filter(isTemple).length;
    return { pts: n * per, n, per, rule, cells };
  }

  /**
   * A farm pays whoever has the most farmers lying in it, by the colour of the
   * sphere that called the harvest in. Unlike every other figure in the mode,
   * a farmer that has been paid walks home.
   */
  scoreFarm(field, hue) {
    const g = this.game;
    const board = g.board;
    if (!field.meeples.length) return false;
    const { pts, n, per, rule, cells } = this.farmValue(field, hue);
    const winners = board.majority(field);
    if (pts > 0 && winners.length) {
      for (const p of winners) {
        this.pay(p, pts,
          `Farm of ${field.tiles.size} — ${n} ${rule.what}${n === 1 ? '' : 's'} at ${per}`
          + `${per > rule.main ? ' out on an island' : ''} — ${g.players[p].name}`,
          cells.map((c) => ({ x: c.x, y: c.y })));
      }
    } else {
      g.say(winners.length
        ? `A farm is harvested, and there is no ${rule.what} on it to count.`
        : 'A farm is harvested with nobody holding it.');
    }
    // Home they go — the only figures in Girando that ever leave a scored
    // feature under their own steam.
    for (const m of board.reclaim(field)) {
      g.players[m.player].meeples++;
      if (m.big) g.players[m.player].big++;
      g.emit('meeple', { recall: true, player: m.player, at: { x: m.x + 0.5, y: m.y + 0.5 } });
    }
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
  holdsMeeplePhase() { return !this.balenaMoved && this.balenaTargets().length > 0; }

  /** Instead of putting a follower down: send the whale somewhere. */
  beginSwim() {
    if (!this.canSwim()) return false;
    this.game.phase = 'balena';
    this.game.say(`${this.game.player.name} calls the Balena.`);
    return true;
  }

  onCellClick(x, y) {
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
   * there. What it can't do is land on a tile with a figure standing on it,
   * or take a road, because roads are nobody's.
   */
  flightTargets() {
    if (!this.flight) return [];
    const board = this.game.board;
    const out = [];
    for (const cell of this.flight) {
      if (!board.get(cell.x, cell.y) || cell.meeple) continue;
      for (const { i, f } of claimableFeatures(cell.type, { fields: this.game.has('fields') })) {
        if (f.type === 'road') continue;
        if (!board.featureOf(cell.x, cell.y, i)) continue;
        out.push({ x: cell.x, y: cell.y, i, f, flying: true });
      }
    }
    return out;
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
      this.refundCity(f.cell);          // whatever it was part of is open again
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

    // Tiles the wind has just parked next to a temple pay double. A tile that
    // was already in the parish and only shuffled along inside it doesn't:
    // arriving is the thing that's worth something.
    this.payTemples(r.moved, TEMPLE_BLOWN);

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
   * wind took the Abbazia away, and the road is open country again. It has to
   * stop counting as scored, or it can never pay a second time — and if it was
   * a CITY, the 2 a tile it paid is taken straight back off whoever took it.
   */
  reopen() {
    const board = this.game.board;
    this.chargeDeparted();
    for (const d of board.allComponents()) {
      if (!d.scored) continue;
      const done = CENTRE_FEATURES.has(d.type)
        ? board.surroundCount(d.at.x, d.at.y) === 8
        : d.open === 0;
      if (done) continue;
      board.unmark(d);
      if (d.type === 'city') this.refundCityComponent(d);
      this.game.say(`The ${d.type} at (${d.at.x}, ${d.at.y}) is open country again.`);
    }
  }

  /**
   * Take a city's payment back — ONE a tile, not the whole of it. Finishing a
   * city is worth keeping something for: what the wind takes when it blows one
   * open is the difference between holding it and having held it, and closing
   * it again pays that same one a tile straight back.
   *
   * Tile by tile, because a city blown open is usually a city blown APART, and
   * each of the pieces reopens on its own. Charging each piece for its own
   * tiles is what makes the total come out right however many pieces there
   * are — including the piece that sailed off the edge of the world, which is
   * charged as it falls.
   */
  refundCityComponent(d) {
    const board = this.game.board;
    const owed = new Map();
    for (const cell of board.cellsOf(d)) {
      const i = board.featIndexOn(cell, d);
      if (i == null) continue;
      this.takeBack(cell, i, owed);
    }
    this.settleBack(owed, d.at);
  }

  /** A tile leaving the board is charged for whatever it was still holding. */
  refundCity(cell) {
    if (!cell?.cityPaid) return;
    const owed = new Map();
    for (const k of Object.keys(cell.cityPaid)) this.takeBack(cell, k, owed);
    this.settleBack(owed, cell);
  }

  /**
   * One tile's worth, into the running tally. The record stays behind with
   * `live` cleared: the debt is settled, but the tile has still been part of a
   * finished city, which is what makes its next closure worth 1 rather than 2.
   */
  takeBack(cell, i, owed) {
    this.charge(cell.cityPaid?.[i], owed);
  }

  /** One live record, settled once. */
  charge(rec, owed) {
    if (!rec || !rec.live) return;
    rec.live = false;
    this.owed.delete(rec);
    for (const p of rec.players) owed.set(p, (owed.get(p) || 0) + CITY_BACK);
  }

  /**
   * The backstop for a tile that left the board by some route other than being
   * blown off the edge of it. Every live record is held here as well as on its
   * tile, so a tile that has gone can still be charged for its point — the
   * component sweep can only ever see the tiles that are still there.
   */
  chargeDeparted() {
    const board = this.game.board;
    const owed = new Map();
    let at = null;
    for (const rec of [...this.owed]) {
      if (board.get(rec.cell.x, rec.cell.y) === rec.cell) continue;
      at = at || rec.cell;
      this.charge(rec, owed);
    }
    if (at) this.settleBack(owed, at);
  }

  /** …and paid out as one line per player, rather than one per tile. */
  settleBack(owed, at) {
    for (const [p, n] of owed) {
      this.pay(p, -n,
        `A city blown open again — ${this.game.players[p].name} gives back a point a tile`,
        [{ x: at.x, y: at.y }]);
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
    if (d.type === 'sfera' || d.type === 'field') return;   // a sphere is a rule, not a score
    if (d.type === 'temple') return this.templeCloses(d);
    if (d.type === 'city') return this.cityCloses(d, closer);
    if (d.type === 'road') return this.roadCloses(d, closer);
  }

  /**
   * A city pays 2 a tile — 3 out on an island — and only ever to somebody
   * standing in it. The followers STAY: a city here is a thing that can be
   * blown open and finished again, and the figure in it is the only record of
   * whose it was. The windmills are the half that never comes back: 2 apiece
   * to whoever laid the tile that closed the city, whatever the weather does
   * to it afterwards.
   */
  cityCloses(d, closer) {
    const g = this.game;
    const board = g.board;
    const cells = board.cellsOf(d);
    if (!cells.length) return;
    const per = this.rateFor('city', cells);
    const winners = board.majority(d);
    const where = cells.map((c) => ({ x: c.x, y: c.y }));

    if (winners.length) {
      // The ledger is kept TILE BY TILE, not city by city, because a city is
      // not a stable object here: the wind splits one into two and shoves two
      // into one, and only the tiles carry anything through that. A tile that
      // has been part of a finished city before is worth 1; one that never has
      // is worth the full rate. So a fresh wing built onto an old city pays
      // properly for the new ground and nothing twice for the old.
      let pts = 0;
      let fresh = 0;
      for (const cell of cells) {
        const i = board.featIndexOn(cell, d);
        if (i == null) continue;
        const been = cell.cityPaid?.[i];
        if (been) pts += CITY_AGAIN; else { pts += per; fresh++; }
      }
      for (const p of winners) {
        this.pay(p, pts,
          `City of ${d.tiles.size} tile${d.tiles.size > 1 ? 's' : ''}`
          + `${fresh < cells.length ? ' closes again' : (per > RATE.city.main ? ' out on an island' : '')}`
          + ` — ${g.players[p].name}`, where);
      }
      // Stamped on every tile with who is owed, so the wind can find it again
      // to take it back — whichever of those tiles is still there to be found.
      // `live` is the outstanding half; the record itself outlives the refund,
      // because "this tile has been in a finished city before" is what makes
      // the next closure worth 1 rather than 2.
      for (const cell of cells) {
        const i = board.featIndexOn(cell, d);
        if (i == null) continue;
        // One record per tile per city feature, for the whole game: reused
        // rather than replaced, so `owed` can never accumulate a superseded
        // entry for ground that has already been paid for again.
        cell.cityPaid = cell.cityPaid || {};
        const rec = cell.cityPaid[i] || (cell.cityPaid[i] = { cell, i });
        rec.players = winners.slice();
        rec.live = true;
        this.owed.add(rec);
      }
    } else {
      g.say(`A city of ${d.tiles.size} closed with nobody standing in it.`);
    }

    // Windmills standing in THIS city — a turbine is anchored to one feature
    // on its tile, and on a tile carrying two cities that distinction is the
    // difference between paying for the city that closed and the one that
    // didn't.
    const mills = cells.filter((c) => {
      const t = turbineOn(c);
      return t && t.on != null && board.featIndexOn(c, d) === t.on;
    }).length;
    if (mills && closer != null) {
      this.pay(closer, WINDMILL * mills,
        `${mills} windmill${mills > 1 ? 's' : ''} in a finished city — ${g.players[closer].name} keeps this whatever the weather does`,
        where);
    }
  }

  /**
   * A road is nobody's. Finishing one pays the player who laid the last tile,
   * 1 a tile and 2 out on an island — and then every city and every temple the
   * road runs into pays 2 to WHOEVER HOLDS IT, which is as often as not the
   * player across the table. Roads are how you are paid for connecting things,
   * and how everybody else is paid for you connecting to them.
   */
  roadCloses(d, closer) {
    const g = this.game;
    const board = g.board;
    const cells = board.cellsOf(d);
    if (!cells.length) return;
    const per = this.rateFor('road', cells);
    const where = cells.map((c) => ({ x: c.x, y: c.y }));

    if (closer != null) {
      this.pay(closer, per * d.tiles.size,
        `Road of ${d.tiles.size} tile${d.tiles.size > 1 ? 's' : ''}`
        + `${per > RATE.road.main ? ' out on an island' : ''} — ${g.players[closer].name} finishes it`, where);
    }

    // What it arrived at. A city sprawling over four of the road's tiles is
    // one city and pays once, so they are deduped by component.
    const seen = new Set();
    for (const cell of cells) {
      cell.type.feats.forEach((f, i) => {
        if (f.type !== 'city') return;
        const city = board.featureOf(cell.x, cell.y, i);
        if (!city) return;
        const root = board.find(city.parts[0]);
        if (seen.has(root)) return;
        seen.add(root);
        for (const p of board.majority(city)) {
          this.pay(p, ROAD_LINK,
            `The road runs into ${g.players[p].name}'s city`,
            [{ x: cell.x, y: cell.y }]);
        }
      });
      if (isTemple(cell) && cell.meeple) {
        this.pay(cell.meeple.player, ROAD_LINK,
          `The road runs up to ${g.players[cell.meeple.player].name}'s temple`,
          [{ x: cell.x, y: cell.y }]);
      }
    }
  }

  /**
   * A temple's income stops when the parish is full: eight tiles have arrived,
   * eight offerings have been paid, and there is nowhere left for a ninth to
   * come from. The keeper walks home.
   */
  templeCloses(d) {
    const g = this.game;
    const home = g.board.reclaim(d);
    for (const m of home) {
      g.players[m.player].meeples++;
      if (m.big) g.players[m.player].big++;
    }
    g.say(home.length
      ? `The temple at (${d.at.x}, ${d.at.y}) is enclosed, and its keeper comes home.`
      : `The temple at (${d.at.x}, ${d.at.y}) is enclosed, with nobody in it.`);
    g.emit('landmark');
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
    // The islands are counted FIRST, off the board exactly as play left it.
    // The harvest sends farmers home, and a follower that walked off an island
    // during the tidying-up was standing on it when the wind dropped.
    this.archipelago();
    this.lastHarvest();
    this.openCities();
  }

  /**
   * Every field still being farmed, harvested as though a sphere had closed on
   * it. WHICH sphere is the question, and the field answers it: if a sfera is
   * lying in the field — one you never managed to pair, most likely — its
   * colour decides what the harvest counts. A field with no sfera in it is
   * counted BLUE, the ordinary Carcassonne farm, per finished city it feeds.
   *
   * Fields already harvested are skipped for free: harvesting sends the
   * farmers home, so an empty field is a field that has been paid.
   */
  lastHarvest() {
    const g = this.game;
    const board = g.board;
    const fields = board.allComponents().filter((d) => d.type === 'field' && d.meeples.length);
    if (!fields.length) return;
    g.say('The season turns, and every farm still standing is harvested.');
    for (const field of fields) {
      let hue = 'blue';
      for (const cell of board.cellsOf(field)) {
        if (!cell.type.feats.some((f) => f.type === 'sfera')) continue;
        hue = sferaHue(cell);
        break;
      }
      this.scoreFarm(field, hue);
    }
  }

  /**
   * A city that never closed at all pays 1 a tile — 2 out on an island — to
   * whoever is standing in it, which is the ordinary endgame rule for a half
   * a city.
   *
   * A city that DID close and has been blown open again pays nothing more. It
   * was paid the full rate when it closed and it gave a point a tile back when
   * the wind took it apart; that is the whole of its account, and paying it a
   * third time at the end would be paying twice for the same country. The
   * ledger on the tiles is what tells the two apart.
   */
  openCities() {
    const g = this.game;
    const board = g.board;
    for (const d of board.allComponents()) {
      if (d.type !== 'city' || d.open === 0) continue;
      const cells = board.cellsOf(d);
      if (!cells.length) continue;
      const winners = board.majority(d);
      if (!winners.length) continue;
      // Only the tiles that have never been part of a finished city. A wing
      // built onto an old city and left open pays for the wing.
      const fresh = cells.filter((c) => {
        const i = board.featIndexOn(c, d);
        return i != null && !c.cityPaid?.[i];
      });
      if (!fresh.length) continue;
      const per = this.onIsland(cells[0]) ? RATE.cityOpen.isle : RATE.cityOpen.main;
      const pts = fresh.length * per;
      for (const p of winners) {
        this.pay(p, pts,
          `Endgame: an unfinished city of ${fresh.length} tile${fresh.length > 1 ? 's' : ''}`
          + `${per > RATE.cityOpen.main ? ' out on an island' : ''} — ${g.players[p].name}`,
          cells.map((c) => ({ x: c.x, y: c.y })));
      }
    }
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
    let value = 0;
    for (const cell of cells) {
      value += this.templeValue(cell, player, TEMPLE_LAID);
      if (this.joinsSphere(cell)) value += 4;
      else if (cell.type.feats.some((f) => f.type === 'sfera')) value += 0.5;
      value += this.turbineValue(cell, player);
      for (const d of zephyrDirs(cell)) value += this.gustValue(cell, d, player);
    }
    return value;
  }

  /** Laying next to somebody's temple pays them, not you. */
  templeValue(cell, player, rate) {
    let value = 0;
    for (const [dx, dy] of RING) {
      const t = this.game.board.get(cell.x + dx, cell.y + dy);
      if (!t || !isTemple(t)) continue;
      if (t.meeple) value += t.meeple.player === player ? rate : -rate;
      else value += 0.25 * (8 - this.game.board.surroundCount(t.x, t.y));
    }
    return value;
  }

  /** A windmill is an annuity plus a bounty, so it's worth more than one gust. */
  turbineValue(cell, player) {
    const t = turbineOn(cell);
    if (!t || t.on == null) return 0;
    const d = this.game.board.featureOf(cell.x, cell.y, t.on);
    if (!d) return 3;                            // unclaimed, and we could hold it
    const mine = d.meeples.some((m) => m.player === player);
    return mine ? 5 : -2;
  }

  /**
   * Sending the whale instead of putting a follower down. Only worth the turn
   * when there is nothing to claim — a follower on the board earns for the
   * rest of the game and the whale only stops things happening — and then only
   * when there is something specific under it worth stopping.
   */
  botAction(seat) {
    const g = this.game;
    if (g.current !== seat || g.phase !== 'meeple' || !this.canSwim()) return false;
    if (g.meepleOptions().length) return false;
    let best = null;
    for (const t of this.balenaTargets()) {
      const value = this.shelterValue(t, seat);
      if (!best || value > best.value) best = { ...t, value };
    }
    if (!best || best.value <= 0) return false;
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
      value += mine ? RATE.city.main * d.tiles.size * 0.25 : -1;
    });
    return value;
  }

  /** Does this tile put a half-sphere against its other half? */
  joinsSphere(cell) {
    const board = this.game.board;
    for (let s = 0; s < 4; s++) {
      const i = board.featAt(cell, s);
      if (i == null || cell.type.feats[i].type !== 'sfera') continue;
      const nb = board.neighbor(cell.x, cell.y, s);
      if (!nb) continue;
      const theirs = board.featAt(nb, opposite(s));
      if (theirs != null && nb.type.feats[theirs].type === 'sfera') return true;
    }
    return false;
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
        const worse = dest ? 0.6 : 2;            // over open sky it goes home
        value += other.meeple.player === player ? -worse : worse * 0.7;
      }
      value += this.templeValue(
        { x: other.x + dx * strength, y: other.y + dy * strength }, player, TEMPLE_BLOWN * 0.6);
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
    if (g.phase !== 'meeple') return [];
    return [{
      label: `Send the Balena (${BALENA_RANGE} squares)`,
      fn: () => this.beginSwim(),
      disabled: !this.canSwim(),
    }];
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
      const meeples = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(Math.max(0, 7 - p.meeples))}</span>`;
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
    + 'Cities pay 2 a tile to whoever stands in them the first time they close, then 1 a tile up and down as the wind opens and shuts them. '
    + 'Roads are nobody’s: finish one for 1 a tile, and every city or temple it reaches pays its holder 2. '
    + 'Farms are harvested when a sphere closes, by its colour — green 1 a tile of field, blue 2 a finished city, red 2 a temple. '
    + 'You may only build onto the Palazzo’s mainland; everything adrift is an island, and islands pay more. '
    + 'Instead of a follower, send the Balena — nothing under the whale can be moved by any wind.',
};
