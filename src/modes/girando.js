// ---------------------------------------------------------------------------
// Girando — the cloud kingdom, where the board itself is weather.
//
// The old version of this mode (Cirrus) let you lift any loose tile and put it
// somewhere better. That made the board changeable, but it made *you* the only
// thing changing it. Girando takes the verb away from the player and gives it
// to the sky: you place tiles and claim features like Carcassonne, and then
// the wind rearranges the country underneath you.
//
// THE ZEPHYR is the engine — twenty of them in a seventy-two tile deck. Play
// one and it blows down its lane: everything in that row or column, downwind,
// slides along. Gusts STACK, and only one thing stacks them — a wind that runs
// over a zephyr blowing the SAME way absorbs it and blows a square harder, up
// to three. A zephyr blowing across the wind isn't absorbed but fires in its
// own turn down its own lane, so a good line of them is a chain reaction; a
// zephyr blowing straight back at the wind does nothing at all, because two
// winds shoving the same lane in opposite directions is not weather, it's a
// machine for throwing the board away. And no zephyr blows twice in one storm.
//
// FOUR OF THEM BLOW MORE THAN ONE WAY: two crosswinds, a trident and a compass
// rose, one of each, opening two, three and four lanes at once out of the same
// square. Tiles that end up touching nothing fall out of the sky and go back in
// the deck.
//
// NOTHING CRYSTALLISES. Finishing a feature used to turn it to permanent land,
// which meant every closure grew the board a skeleton the wind couldn't touch
// and a long game slowly stopped being weather. Now only two things are rooted:
// a temple, and a pair of sfera that have found each other. Everything else
// stays loose for the whole game — including the city you just scored, which
// the wind is free to pull apart again. When it does, the feature is simply
// open country once more, and finishing it a second time pays a second time.
//
// FOLLOWERS ARE WEATHER TOO. Once a figure is on the board it never comes off
// by choice: a gust blows it the same distance as everything else in its lane,
// and it takes up whatever it lands in — its own kind of feature if the new
// tile has one, anything claimable if it doesn't, and simply lying on the tile
// holding nothing if there's nothing there at all. Blown over open sky, it goes
// back to its owner's hand. That is the only way home.
//
// A TEMPLE is claimable, immovable, and pays by the tile: 1 to its keeper every
// time somebody LAYS a tile in the eight squares around it, and 2 every time
// the wind BLOWS one in. It is the one reliable income in a mode where nothing
// else is reliable, and it's reliable because the wind cannot touch it — a
// figure inside a temple is indoors.
//
// THE SFERA is half a sphere on one edge, and that edge meets nothing but
// another sfera's. Join two and they lock together forever — nothing moves them
// again — and the sky LOOKS DOWN AND COUNTS: whoever has the most figures on a
// broken-off piece of country scores a point for each of its tiles, ties paying
// both. Once, then and there, not every round after. Twelve sfera in the deck
// makes six spheres, so six counts in a whole game, and that scarcity is what
// lets the count pay full price — it's a moment you play toward and can be
// beaten to rather than an income. It resolves at the end of the turn the
// sphere closed on, after everything else that turn did, so a follower blown
// off an island a moment before is a follower that wasn't there, and one flown
// out to one a moment before is.
//
// THE WINDVANE AND THE VESTIBULE have four ways in and only two of them
// joined, and the wind decides which two. A road that ran through one is a
// dead end after the next gust, and a city that was two tiles from finishing
// might now be finished, or might never be. Every edge matches, so they always
// fit; what changes is what runs through them.
//
// THE SKYWALL is the only thing that stops a gust — and only face on. A wall
// stands across one axis: wind running into it stops dead and everything in
// its lee is untouched, wind running along it goes straight past. Turning one
// is deciding which way the country is allowed to be shoved. It is not itself
// rooted, though: a wall is shoved along like anything else, so the shelter it
// casts is a thing that moves, and the safe ground behind it is only safe
// until the next gust comes down the other axis.
//
// THE ABBAZIA takes any edge and CAPS everything it touches: a road running
// into one ends there, a city walls itself off against it, and both can finish
// without ever meeting anything. It is also, being an ordinary tile, perfectly
// blowable — and when it goes, everything it was holding shut is open country
// again, unfinished, and can be finished and paid for a second time.
//
// THE FLYING MACHINE sends a follower out along the lane it points down. It
// can land on any tile out there, including features somebody else already
// holds — the only thing it can't do is land on a tile with a figure standing
// on it. And a zephyr crossed on the way is a wind you're IN: the flight turns
// and follows it, so a zephyr pointed the wrong way is a wall for fliers and
// everything past it is unreachable.
//
// FLUTITANTES are terrain built on a hull. They're the only tiles you may pick
// up and move yourself, and the only ones that survive being stranded in open
// sky. They're what's left of Cirrus's lifting, narrowed to the tiles that are
// supposed to do it.
//
// There are no cloisters in the sky: every one of them is a temple. Cities pay
// the ordinary 2 a tile, because in this mode finishing one is hard enough to
// be worth the full price — and there are more end caps in the deck than the
// base set has, because a country that keeps being rearranged needs more ways
// to stop.
//
// The thesis is in one line: SCORING IS NOT GUARANTEED, AND NOTHING IS BANKED.
// Nothing pays until it closes, nothing that hasn't closed pays at the end,
// and anything the wind pulls apart is unfinished again — which cuts both
// ways, because unfinished country can be finished, and paid for, once more.
// The temple and the island are the two exceptions, and both of them are the
// sky's terms, not yours.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { TILE_TYPES, MARKS, CENTRE_FEATURES, SIDE_STEP, opposite, buildDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { partOfScored, claimableFeatures } from '../mechanics.js';
import {
  storm, zephyrDirs, worldDir, isRaft, isWall, isTemple, shelters, MAX_STRENGTH,
} from '../wind.js';

const DECK_SIZE = 72;        // a full Carcassonne set's worth of country
/**
 * The backstop, in tiles laid rather than rounds played. Tiles blown off the
 * board go back in the deck, so "play until the deck runs out" isn't a promise
 * the mode can keep on its own — but a round cap can't be the answer either,
 * because two players get through the deck in half as many rounds as four.
 * Counting placements is the only clock that means the same thing at every
 * player count, and this one sits a third above the deck: enough slack for the
 * sky to hand tiles back, tight enough that it can't blow forever.
 */
const STORM_LIMIT = 96;
const TEMPLE_LAID = 1;       // to its keeper, per tile placed in the ring
const TEMPLE_BLOWN = 2;      // …and per tile the wind puts there
const MAX_CHAIN = 6;         // storms raised while a storm is still landing
const FLIGHT_RANGE = 24;     // squares, before we assume the zephyrs are a loop
const SPHERES = 6;           // twelve sfera in the deck, so six counts in a game

/**
 * What Girando plays instead of parts of the base set. The 3-way junctions
 * carry a road THROUGH instead of ending it — fewer closures, more weather —
 * there are no cloisters in the sky (every one of them is a temple), and the
 * four-sided city is out, because a city that can only ever be entered and
 * never capped is a city the weather will never let you finish.
 */
const SWAPS = { W: 'Gw', L: 'Gl', A: 'Kta', B: 'Kt', C: 'E' };

/** The eight squares around a tile — a temple's parish, and a monastery's. */
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const inRing = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
  && !(a.x === b.x && a.y === b.y);

export class Girando extends Mode {
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
    this.blowing = false;
    this.queued = [];
    this.spheres = 0;          // half-spheres joined so far — six of them exist
    this.counting = false;     // a sphere closed this turn: count islands at the end
    this.paidRing = new Set(); // "temple|tile" pairs already paid this turn
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

  /**
   * The end of the turn is where a closed sphere is cashed — after the wind,
   * after whatever that finished, and after the follower has been put down or
   * flown out. "After any other actions" is the whole of the timing rule, and
   * this is the last moment in the turn that qualifies.
   */
  endTurn() {
    this.flight = null;
    this.paidRing.clear();
    if (this.counting) {
      this.counting = false;
      this.scoreIslands();
    }
    if (this.laid >= STORM_LIMIT) {
      this.game.say('The season turns, and the wind drops.');
      this.game.finish();
    }
  }

  // --- temples --------------------------------------------------------------

  /**
   * A temple is worth exactly what happens next to it. Every tile that arrives
   * in its eight squares pays whoever is standing in it — one for a tile a
   * player laid there, two for one the wind put there, which is the mode
   * saying out loud that it would rather you built next to the weather than
   * away from it.
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
        const key = `${temple.x},${temple.y}|${cell.seq}`;
        if (this.paidRing.has(key)) continue;
        this.paidRing.add(key);
        const who = temple.meeple.player;
        g.players[who].score += rate;
        g.say(`${g.players[who].name}'s temple at (${temple.x}, ${temple.y}) takes an offering +${rate}`);
        g.emit('score', {
          points: rate, player: who, players: [who],
          at: { x: temple.x + 0.5, y: temple.y + 0.5 },
          cells: [{ x: temple.x, y: temple.y }, { x: cell.x, y: cell.y }],
        });
      }
    }
  }

  /**
   * A temple pays nothing when it closes; it pays all the way there. Nothing
   * in the engine scores one, so this exists purely to tell anyone pricing the
   * board — the computer player, mostly — what standing in it is worth: one
   * offering for every square of the parish still empty, and a bit more than
   * one, because a good share of those tiles arrive on the wind at double.
   */
  valueOf(d) {
    if (d.type !== 'temple') return null;
    const left = 8 - this.game.board.surroundCount(d.at.x, d.at.y);
    return Math.round(left * (TEMPLE_LAID + TEMPLE_BLOWN) / 2);
  }

  // --- the sfera ------------------------------------------------------------

  /**
   * Two half-spheres meeting is the one event in the mode that pays for where
   * everybody is STANDING rather than for what they built. It can only happen
   * deliberately — a sfera edge meets nothing else — and it never un-happens:
   * the pair is nailed down where it stands, and the sky counts the islands
   * once, there and then.
   *
   * Twelve sfera in the deck, so six spheres, so six counts in a whole game.
   * That scarcity is what lets the count pay full price: it is a moment you
   * play toward and can be beaten to, not an income.
   */
  joinSferas() {
    const board = this.game.board;
    let found = 0;
    for (const d of board.allComponents()) {
      if (d.type !== 'sfera' || d.tiles.size < 2) continue;
      found++;
      for (const cell of board.cellsOf(d)) {
        if (cell.fixed) continue;
        cell.fixed = true;
        this.game.emit('landmark');
      }
    }
    if (found <= this.spheres) return;
    this.spheres = found;
    this.counting = true;
    this.game.say(`A sphere closes and locks where it stands — the sky looks down and counts (${this.spheres} of 6).`);
  }

  /**
   * The count. It happens at the end of the turn a sphere closed on, after
   * everything else that turn did — which is the whole of the timing rule: a
   * follower blown off a rock a moment ago is a follower that isn't standing
   * on it now, and one flown out to a rock a moment ago is.
   *
   * The biggest piece of country is the mainland and pays nobody; everything
   * that has broken off it is an island, and the majority standing on one takes
   * a point for each of its tiles. Ties pay in full, both ways.
   */
  scoreIslands() {
    const g = this.game;
    const groups = g.board.groups();
    if (groups.length < 2) {
      g.say('…and finds one unbroken country. Nothing is adrift to count.');
      return;
    }
    for (const group of groups.slice(1)) {
      const counts = new Map();
      for (const cell of group) {
        if (!cell.meeple) continue;
        const n = cell.meeple.big ? 2 : 1;
        counts.set(cell.meeple.player, (counts.get(cell.meeple.player) || 0) + n);
      }
      if (!counts.size) continue;
      const best = Math.max(...counts.values());
      const winners = [...counts.entries()].filter(([, n]) => n === best).map(([p]) => p);
      const pts = group.length;
      for (const p of winners) g.players[p].score += pts;
      g.say(`Island of ${pts} tile${pts > 1 ? 's' : ''} → ${winners.map((p) => g.players[p].name).join(' & ')} +${pts}`);
      g.emit('score', {
        points: pts, players: winners,
        at: {
          x: group.reduce((s, c) => s + c.x, 0) / group.length + 0.5,
          y: group.reduce((s, c) => s + c.y, 0) / group.length + 0.5,
        },
        cells: group.map((c) => ({ x: c.x, y: c.y })),
      });
    }
  }

  // --- flying machines ------------------------------------------------------

  /**
   * The lane a machine sends a follower down: straight out the way it points,
   * over whatever tiles are there, until the country runs out — but a zephyr
   * crossed on the way is a wind you're in, not a wind you watch, so the
   * flight turns and follows it. That's the whole tactic: a zephyr pointing
   * the wrong way is a wall for fliers, and everything past it is unreachable.
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
      const key = `${x},${y}`;
      if (seen.has(key)) break;                  // zephyrs pointed in a circle
      seen.add(key);
      const over = board.get(x, y);
      if (!over) break;                          // open sky: nowhere to land
      path.push(over);
      // You don't choose to ride it. A wind already going your way changes
      // nothing; one going across turns you; and one blowing straight back at
      // you is the end of the flight — you can reach that square and no
      // further, which is what makes a facing zephyr a wall for fliers.
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
   * doesn't matter whether somebody already holds the feature. What it can't
   * do is land on a tile with a follower already standing on it; one tile
   * holds one figure.
   */
  flightTargets() {
    if (!this.flight) return [];
    const board = this.game.board;
    const out = [];
    for (const cell of this.flight) {
      if (!board.get(cell.x, cell.y) || cell.meeple) continue;
      for (const { i, f } of claimableFeatures(cell.type)) {
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
        for (const report of storm(this.game.board, job[0])) this.applyGust(report);
        this.reopen();
        this.settle(job[1]);
        job = this.queued.shift();
      }
      if (this.queued.length) this.game.say('The sky runs out of breath.');
      this.queued.length = 0;
    } finally {
      this.blowing = false;
    }
  }

  /** Turn one gust's report into points, losses, log lines and pictures. */
  applyGust(r) {
    const g = this.game;
    this.gusts++;
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
      g.say(`The gust picks up a second wind — ${r.strength} square${r.strength > 1 ? 's' : ''}.`);
    }

    // Tiles that end up touching nothing go back in the deck — the sky keeps
    // what it takes, and hands it back later.
    for (const f of r.fell) {
      g.deck.push(f.id);
      this.fallen++;
    }
    if (r.fell.length) {
      g.say(`${r.fell.length} tile${r.fell.length > 1 ? 's' : ''} blow off the edge of the world.`);
    }

    // Followers travel with the weather. One the wind put down somewhere is
    // still on the board and still counts for whoever owns it; one it carried
    // out over open sky is the only figure that ever comes home.
    for (const m of r.carried) {
      g.emit('step', {
        from: { x: m.from.x + 0.5, y: m.from.y + 0.5 },
        at: { x: m.to.x + 0.5, y: m.to.y + 0.5 },
        key: `meeple:${m.to.x},${m.to.y}`, player: m.player,
      });
    }
    if (r.carried.length) {
      g.say(`${r.carried.length} follower${r.carried.length > 1 ? 's are' : ' is'} carried down the lane.`);
    }
    for (const m of r.homed) {
      g.players[m.player].meeples++;
      if (m.big) g.players[m.player].big++;
      g.say(`${g.players[m.player].name}'s follower is blown into open sky and comes home.`);
      g.emit('meeple', { recall: true, player: m.player, at: { x: m.x + 0.5, y: m.y + 0.5 } });
    }

    if (r.swung.length) {
      g.say(`${r.swung.length} vane${r.swung.length > 1 ? 's' : ''} swing${r.swung.length > 1 ? '' : 's'} into the wind.`);
    }

    // Tiles the wind has just parked next to a temple pay double. A tile that
    // was already in the parish and only shuffled along inside it doesn't:
    // arriving is the thing that's worth something.
    this.payTemples(r.moved, TEMPLE_BLOWN);
    this.joinSferas();
  }

  /**
   * …and the wind can UN-finish things. An Abbazia was capping that road; the
   * wind took the Abbazia away, and the road is open country again. It has to
   * stop counting as scored, or it can never pay a second time — which is the
   * whole reason the Abbazia is allowed to be blown around while it's holding
   * something shut.
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
      if (d.scored) continue;
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
    if (d.type === 'sfera') return;              // a sphere isn't scored, it's a rule
    if (d.type === 'temple') return this.templeCloses(d);

    const winners = this.game.board.majority(d);
    this.game.award(d, false, closer);
    const bonus = this.skyholds(d);
    if (bonus && winners.length) {
      for (const p of winners) this.game.players[p].score += bonus;
      this.game.say(`Skyholds in the ${d.type} → ${winners.map((p) => this.game.players[p].name).join(' & ')} +${bonus}`);
    }
  }

  /** What the landmarks inside a finished feature are worth on top of it. */
  skyholds(d) {
    let bonus = 0;
    for (const cell of this.game.board.cellsOf(d)) {
      for (const m of cell.type.marks) bonus += MARKS[m.kind]?.score || 0;
    }
    return bonus;
  }

  /**
   * A temple's income stops when the parish is full: eight tiles have arrived,
   * eight offerings have been paid, and there is nowhere left for a ninth to
   * come from. The keeper walks home, and the building stands where it always
   * stood — a temple was never movable, finished or not.
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

  // --- flutitantes ----------------------------------------------------------

  /**
   * The narrowed version of Cirrus's lift: only hulls, and no connectivity
   * rule, because a thing built to float is allowed to leave a hole. It goes
   * back down under the ordinary placement rules — the wind is the only thing
   * that can strand one in open sky.
   */
  liftable(x, y) {
    const cell = this.game.board.get(x, y);
    if (!cell || !isRaft(cell) || cell.fixed || cell.meeple) return false;
    return !partOfScored(this.game.board, cell);
  }

  allLiftable() {
    return [...this.game.board.cells.values()]
      .filter((c) => this.liftable(c.x, c.y))
      .map((c) => ({ x: c.x, y: c.y }));
  }

  beginLift() {
    if (!this.allLiftable().length) {
      this.game.say('No flutitante is free to move.');
      return false;
    }
    this.game.phase = 'lift';
    return true;
  }

  cancelLift() {
    this.game.phase = this.game.tile ? 'place' : 'market';
    return true;
  }

  onCellClick(x, y) {
    if (this.game.phase !== 'lift' || !this.liftable(x, y)) return false;
    const cell = this.game.board.remove(x, y);
    this.game.market = null;              // this turn is the move, not the hand
    this.game.tile = cell.type;
    this.game.rot = cell.rot;
    this.game.phase = 'place';
    this.game.say(`${this.game.player.name} casts off the flutitante at (${x}, ${y}).`);
    this.game.emit('rotate');
    return true;
  }

  // --- the season -----------------------------------------------------------

  endRound() {
    if (this.game.board.size === 0) this.game.finish();
  }

  // --- what a computer player can't see -------------------------------------
  //
  // The bot reads the board: what closed, who holds it, what it pays. None of
  // that includes the weather, and in this mode the weather is the game. Four
  // things are worth points it can't see — a temple's parish, a sphere about to
  // close, the majority on an island, and the lane a zephyr is about to open.

  botPlaceBonus(cells, player) {
    const board = this.game.board;
    let value = 0;
    let joining = false;
    for (const cell of cells) {
      value += this.templeValue(cell, player, TEMPLE_LAID);
      if (this.joinsSphere(cell)) { joining = true; value += 2; }
      else if (cell.type.feats.some((f) => f.type === 'sfera')) value += 0.5;
      // Ground in a wall's lee keeps what you build on it.
      for (const other of board.cells.values()) {
        if (!isWall(other)) continue;
        if (other.x === cell.x || other.y === cell.y) { value += 0.6; break; }
      }
      for (const d of zephyrDirs(cell)) value += this.gustValue(cell, d, player);
    }
    // Standing on an island only ever pays when a sphere closes — all of it on
    // the turn you close one yourself, and a fraction of it the rest of the
    // time, because somebody else will close one of the remaining five.
    if (this.spheres < SPHERES) value += this.islandValue(player) * (joining ? 1 : 0.2);
    return value;
  }

  /** Laying next to somebody's temple pays them, not you. */
  templeValue(cell, player, rate) {
    let value = 0;
    for (const [dx, dy] of RING) {
      const t = this.game.board.get(cell.x + dx, cell.y + dy);
      if (!t || !isTemple(t)) continue;
      if (t.meeple) value += t.meeple.player === player ? rate : -rate;
      // An empty temple you could stand in yourself is a parish waiting for a
      // keeper: worth roughly one offering for each square still to be filled.
      else value += 0.25 * (8 - this.game.board.surroundCount(t.x, t.y));
    }
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
   * What letting this gust out does. It is the same three questions the wind
   * itself asks — how hard is it blowing by the time it gets there, whose
   * figures are in the way, and whose temples does it feed — answered by
   * walking the lane rather than by simulating it, because the bot prices
   * hundreds of candidate squares a turn.
   */
  gustValue(cell, dir, player) {
    const board = this.game.board;
    const [dx, dy] = SIDE_STEP[dir];
    let value = 0;
    let strength = 1;
    for (let step = 1; step <= 24; step++) {
      const other = board.get(cell.x + dx * step, cell.y + dy * step);
      if (!other) continue;
      if (zephyrDirs(other).includes(dir)) strength = Math.min(MAX_STRENGTH, strength + 1);
      // A follower about to be moved: ours is a risk, theirs is an opportunity,
      // and either way the further it travels the less likely it lands well.
      if (other.meeple && !isTemple(other)) {
        const dest = board.get(other.x + dx * strength, other.y + dy * strength);
        const worse = dest ? 0.6 : 2;            // over open sky it goes home
        value += other.meeple.player === player ? -worse : worse * 0.7;
      }
      // Tiles the gust is about to park in one of our parishes.
      if (!other.fixed && !isTemple(other)) {
        value += this.templeValue(
          { x: other.x + dx * strength, y: other.y + dy * strength }, player, TEMPLE_BLOWN * 0.6);
      }
      if (shelters(other, dir)) break;           // a wall face-on ends the lane
    }
    return value;
  }

  /** What the count would pay us right now, minus what it would pay the best rival. */
  islandValue(player) {
    const groups = this.game.board.groups();
    if (groups.length < 2) return 0;
    let value = 0;
    for (const group of groups.slice(1)) {
      let mine = 0, theirs = 0;
      for (const cell of group) {
        if (!cell.meeple) continue;
        const n = cell.meeple.big ? 2 : 1;
        if (cell.meeple.player === player) mine += n; else theirs = Math.max(theirs, n);
      }
      if (mine >= theirs && mine > 0) value += group.length;
      if (theirs >= mine && theirs > 0) value -= group.length;
    }
    return value;
  }

  // --- UI -------------------------------------------------------------------

  /** Solid land reads hard-edged; everything else reads as weather. */
  cellOverlay(cell) {
    const out = cell.fixed || isTemple(cell) ? { crystal: true } : { cloud: true };
    if (isRaft(cell)) out.raft = true;
    return out;
  }

  actions() {
    const g = this.game;
    const out = [];
    if (g.phase === 'lift') {
      out.push({ label: 'Never mind', fn: () => this.cancelLift() });
    } else if (g.phase === 'market' || g.phase === 'place') {
      out.push({
        label: 'Move a flutitante',
        fn: () => this.beginLift(),
        disabled: !this.allLiftable().length,
      });
    }
    return out;
  }

  status() {
    const rooted = [...this.game.board.cells.values()].filter((c) => c.fixed || isTemple(c)).length;
    const isles = Math.max(0, this.game.board.groups().length - 1);
    return `${this.laid} tiles laid · ${rooted} rooted · ${this.game.board.size - rooted} loose`
      + ` · ${isles} island${isles === 1 ? '' : 's'} adrift`;
  }

  panel() {
    const rows = this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      const meeples = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(Math.max(0, 7 - p.meeples))}</span>`;
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${meeples}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    const isles = `${this.spheres} of ${SPHERES} spheres closed — each one counts the islands once, `
      + 'the moment it closes.';
    return `${rows}<p class="hint">${this.gusts} gust${this.gusts === 1 ? '' : 's'} · ${this.fallen} tile${this.fallen === 1 ? '' : 's'} lost to the sky. ${isles}</p>`;
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
  hint: 'Claim as normal — but a zephyr blows its whole lane and stacks up to three, followers are blown along with the tiles, a temple pays its keeper for every tile that arrives beside it, and joining two half-spheres makes the sky count the islands then and there. Six spheres, six counts.',
};
