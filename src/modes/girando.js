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
// zephyr blowing straight back at the wind does nothing at all. No zephyr blows
// twice in one storm, and no zephyr is ever nailed down — a zephyr tile never
// crystallises, because weather you can freeze in place stops being weather.
// Four of them blow more than one way at once: two crosswinds, a trident and a
// compass rose.
//
// A TILE THAT LANDS TOUCHING NOTHING ORTHOGONALLY falls out of the sky — and it
// falls into the hand of whoever set the wind off. Corners don't hold anything
// up any more, which means the sky sheds tiles readily, and the player doing
// the shedding is the one who gets to play them again.
//
// FOLLOWERS ARE WEATHER TOO. Once a figure is on the board it never comes off
// by choice: a gust blows it the same distance as everything else in its lane,
// and it takes up whatever it lands in — its own kind of feature if the new
// tile has one, anything claimable if it doesn't, and simply lying on the tile
// holding nothing if there's nothing there at all. Blown over open sky, it goes
// back to its owner's hand. That is the only way home.
//
// CRYSTALLISATION is back. Finishing a feature turns its tiles to permanent
// land: they never move again, and a crystallised CITY is solid all the way up,
// so it stops a gust dead and shelters everything in its lee. A crystallised
// ROAD is flat ground — it doesn't move, but the wind goes straight over it.
// That asymmetry is the whole geography of the mode: cities are the walls you
// build, roads are the floor you build them on.
//
// A TEMPLE is claimable and pays by the tile: 1 to its keeper every time
// somebody LAYS a tile in the eight squares around it, and 2 every time the
// wind BLOWS one in. It is not rooted — the sky can pick a temple up and put it
// somewhere else, parish and all.
//
// A TOWER TURBINE is built into a city wall, and every gust that runs through
// it pays a point to whoever holds that city. It is the one thing on the board
// that wants the weather to keep coming back.
//
// THE SFERA is half a sphere on one edge, and that edge meets nothing but
// another sfera's. Join two and they lock together forever — nothing moves them
// again — and the sky looks down and COUNTS THE ISLAND THEY ARE PART OF:
// whoever has the most figures standing on that piece of country scores a point
// for each of its tiles, ties paying both. Once, then and there. Twelve sfera
// makes six spheres, so six counts in a whole game, and where you close one is
// as much of the decision as when.
//
// THE SKY SHIP is one tile per player, in their colour, held rather than drawn.
// Moor it to the outside edge of a piece of country and every feature that
// finishes on that piece pays 2 more. It fits anywhere and does nothing to what
// it touches — no road ends at a ship, no city walls itself against one — and
// once moored it stays moored until a gust powers it, which is the tension: the
// ship wants to be somewhere the weather never goes, and it can't leave unless
// the weather comes.
//
// THE WINDVANE has four ways in and only two of them joined, and the wind picks
// which two. Straight roads now do the same thing, quietly: a road hit side-on
// swings to lie along the wind. A road you built is a road the weather has
// opinions about.
//
// THE ABBAZIA takes any edge and CAPS everything it touches: a road running
// into one ends there, a city walls itself off against it, and both can finish
// without ever meeting anything. It is also, being an ordinary tile, perfectly
// blowable — and when it goes, everything it was holding shut is open country
// again, unfinished, and can be finished and paid for a second time.
//
// THE FLYING MACHINE points down a lane. Place one and your follower may go on
// ANY tile out along that lane rather than only the tile you just laid,
// including a feature somebody else already holds — the only thing it can't do
// is land on a tile with a figure standing on it. A zephyr crossed on the way
// is a wind you're in, not one you watch: the flight turns and follows it, and
// a zephyr blowing straight back at you is where the flight ends.
//
// There are no cloisters in the sky: every one of them is a temple. Cities pay
// the ordinary 2 a tile, three-way junctions end their roads and have a village
// on them, and there is no four-sided city anywhere in the pool, because a city
// with four ways in and no way to cap it is a city the weather never lets you
// finish.
//
// The thesis is in one line: SCORING IS NOT GUARANTEED. Nothing pays until it
// closes, nothing that hasn't closed pays at the end, and an Abbazia blowing
// away can un-finish what you already banked — which cuts both ways, because
// unfinished country can be finished again. The temple, the turbine, the ship
// and the island are the exceptions, and all four are the sky's terms.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import {
  TILE_TYPES, TILES, SHIP_TILE, CENTRE_FEATURES, SIDE_STEP, opposite, buildDeck,
} from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { claimableFeatures } from '../mechanics.js';
import {
  storm, zephyrDirs, worldDir, turbineOn, isTemple, MAX_STRENGTH,
} from '../wind.js';

const DECK_SIZE = 72;        // a full Carcassonne set's worth of country
/**
 * The backstop, in tiles laid rather than rounds played. Tiles blown off the
 * board come back into somebody's hand, so "play until the deck runs out" isn't
 * a promise the mode can keep on its own — but a round cap can't be the answer
 * either, because two players get through the deck in half as many rounds as
 * four. Counting placements is the only clock that means the same thing at
 * every player count, and this one sits a third above the deck.
 */
const STORM_LIMIT = 96;
const TEMPLE_LAID = 1;       // to its keeper, per tile placed in the ring
const TEMPLE_BLOWN = 2;      // …and per tile the wind puts there
const TURBINE = 1;           // to the city's holder, per gust through it
const SHIP_BONUS = 2;        // added to a feature finished on your ship's island
const MAX_CHAIN = 6;         // storms raised while a storm is still landing
const FLIGHT_RANGE = 24;     // squares, before we assume the zephyrs are a loop
const SPHERES = 6;           // twelve sfera in the deck, so six counts in a game
const HAND_CAP = 5;          // blown tiles you can be holding at once

/**
 * What Girando plays instead of parts of the base set. The three-way junctions
 * become junctions with a village on them — they end their roads, exactly like
 * the base set's, which is what the mode reverted to after two passes of trying
 * the opposite. There are no cloisters in the sky, so every one is a temple.
 * And the four-sided city is out: a city that can only be entered and never
 * capped is one the weather never lets you finish.
 */
const SWAPS = { W: 'Gw', L: 'Gl', A: 'Kta', B: 'Kt', C: 'E' };

/** The eight squares around a tile — a temple's parish, and a monastery's. */
const RING = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const inRing = (a, b) => a && b && Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1
  && !(a.x === b.x && a.y === b.y);

const isShip = (cell) => cell?.type.id === SHIP_TILE.id;
const hasCity = (cell) => cell.type.feats.some((f) => f.type === 'city');

export class Girando extends Mode {
  /**
   * The SPACE between the tiles is open sky, not the ground on them. That
   * distinction is the whole readability of the mode: a field is a field, and
   * every gap you can see through is somewhere a tile could fall out of. The
   * only sky that appears ON a tile is a tile that is literally a hole in the
   * country — the ship's mooring — and that one says so with its own ground.
   */
  backdrop = 'sky';

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
    this.crystals = 0;
    this.gusts = 0;
    this.fallen = 0;
    this.blowing = false;
    this.blame = null;         // whose weather is currently running
    this.queued = [];
    this.spheres = 0;          // half-spheres joined so far — six of them exist
    this.pendingCounts = [];   // islands a closing sphere still owes a count to
    this.paidRing = new Set(); // "temple|tile" pairs already paid this turn
    this.hands = this.game.players.map(() => []);
    this.ships = this.game.players.map(() => ({ at: null, charged: true }));
  }

  // --- the hand -------------------------------------------------------------
  //
  // Girando is a draw-one game with a pocket. You are dealt a tile a turn like
  // anywhere else, but the sky keeps handing things back: a tile the wind pushes
  // off the edge of the world lands in the hand of whoever set that wind off.
  // Blowing the board apart is therefore not vandalism, it's a supply line.

  get hand() { return this.hands[this.game.current]; }

  /**
   * Deal. The hand plus one fresh tile IS the face-up row, so the market picker
   * the host already has renders it and the bot already knows how to use it —
   * and because `game.market` is the very same array, taking a tile removes it
   * from the hand with no bookkeeping of its own.
   */
  drawNext() {
    const g = this.game;
    const hand = this.hand;

    // Anything that can't be played from hand goes back in the deck rather than
    // clogging the row: this is a board that changes shape constantly, so a
    // tile with nowhere to go today may well have somewhere tomorrow.
    for (let i = hand.length - 1; i >= 0; i--) {
      if (g.placeableNow(TILES[hand[i]])) continue;
      g.deck.push(hand.splice(i, 1)[0]);
    }
    while (g.deck.length && hand.length < HAND_CAP) {
      const id = g.deck.pop();
      if (g.placeableNow(TILES[id])) { hand.push(id); break; }
      g.say(`Tile ${id} had nowhere to go — discarded.`);
    }

    if (!hand.length) return void g.finish();
    g.market = hand;
    g.phase = 'market';
  }

  /** The host's default reads `market`, which is the last player's hand. */
  anythingLeft() {
    return this.game.deck.length > 0 || this.hand.length > 0 || this.canSail();
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
    while (this.pendingCounts.length) this.scoreIsland(this.pendingCounts.shift());
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
        this.pay(temple.meeple.player, rate,
          `${g.players[temple.meeple.player].name}'s temple at (${temple.x}, ${temple.y}) takes an offering`,
          [{ x: temple.x, y: temple.y }, { x: cell.x, y: cell.y }]);
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

  // --- turbines -------------------------------------------------------------

  /**
   * Every gust that runs through a turbine pays whoever holds the city it is
   * built into. Nobody in the city, nobody paid — which makes a turbine a
   * reason to garrison a city you would otherwise have left to the weather.
   */
  payTurbines(cells) {
    const board = this.game.board;
    for (const cell of cells) {
      if (board.get(cell.x, cell.y) !== cell) continue;
      const t = turbineOn(cell);
      if (!t || t.on == null) continue;
      // A finished city has had its followers handed back, so there is nobody
      // standing in it to read a majority off. The mill doesn't stop turning
      // because the city got built — whoever held it when it closed keeps the
      // income, and `millers` is where that survives the reclaim.
      const d = board.featureOf(cell.x, cell.y, t.on);
      const holders = d && d.meeples.length ? board.majority(d) : (cell.millers || []);
      for (const p of holders) {
        this.pay(p, TURBINE, `${this.game.players[p].name}'s turbine turns`,
          [{ x: cell.x, y: cell.y }]);
      }
    }
  }

  /** One place where points are handed out, so every stream looks the same. */
  pay(player, points, line, cells) {
    const g = this.game;
    g.players[player].score += points;
    g.say(`${line} +${points}`);
    g.emit('score', {
      points, player, players: [player], cells,
      at: { x: cells[0].x + 0.5, y: cells[0].y + 0.5 },
    });
  }

  // --- the sfera ------------------------------------------------------------

  /**
   * Two half-spheres meeting is the one event in the mode that pays for where
   * everybody is STANDING rather than for what they built. It can only happen
   * deliberately — a sfera edge meets nothing else — and it never un-happens:
   * the pair is nailed down where it stands, and the sky counts the island they
   * are part of, once, there and then.
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
      const cells = board.cellsOf(d);
      if (cells.every((c) => c.fixed)) continue;         // an old one, already locked
      for (const cell of cells) cell.fixed = true;
      this.game.emit('landmark');
      this.pendingCounts.push(cells[0]);
    }
    if (found <= this.spheres) return;
    this.spheres = found;
    this.game.say(`A sphere closes and locks where it stands — the sky looks down and counts (${this.spheres} of ${SPHERES}).`);
  }

  /**
   * The count. One island: the piece of country the sphere itself is part of,
   * which is what makes WHERE you close a sphere as much of the decision as
   * when. Most figures standing on it takes a point for each of its tiles, and
   * a tie pays both in full.
   *
   * It runs at the end of the turn the sphere closed on, after everything else
   * that turn did — so a follower blown off the island a moment before is a
   * follower that wasn't there, and one flown out to it a moment before is.
   */
  scoreIsland(anchor) {
    const g = this.game;
    const board = g.board;
    if (!anchor || board.get(anchor.x, anchor.y) !== anchor) return;
    const group = board.groups().find((cells) => cells.includes(anchor));
    if (!group) return;

    const counts = new Map();
    for (const cell of group) {
      if (!cell.meeple) continue;
      const n = cell.meeple.big ? 2 : 1;
      counts.set(cell.meeple.player, (counts.get(cell.meeple.player) || 0) + n);
    }
    if (!counts.size) {
      g.say(`The sphere's island of ${group.length} has nobody standing on it.`);
      return;
    }
    const best = Math.max(...counts.values());
    const winners = [...counts.entries()].filter(([, n]) => n === best).map(([p]) => p);
    const pts = group.length;
    for (const p of winners) g.players[p].score += pts;
    g.say(`The sphere's island of ${pts} tile${pts > 1 ? 's' : ''} → ${winners.map((p) => g.players[p].name).join(' & ')} +${pts}`);
    g.emit('score', {
      points: pts, players: winners,
      at: {
        x: group.reduce((s, c) => s + c.x, 0) / group.length + 0.5,
        y: group.reduce((s, c) => s + c.y, 0) / group.length + 0.5,
      },
      cells: group.map((c) => ({ x: c.x, y: c.y })),
    });
  }

  // --- the ship -------------------------------------------------------------

  get ship() { return this.ships[this.game.current]; }

  canSail() {
    const s = this.ship;
    return !!s && s.charged && this.moorings().length > 0;
  }

  /**
   * Where a ship may tie up: the OUTSIDE of the country. Any empty square
   * touching a tile, minus the enclosed courtyards — a ship is a thing on the
   * edge of the world, not a plug for a hole in the middle of it.
   */
  moorings() {
    const board = this.game.board;
    const holes = new Set(board.enclosedHoles().map((h) => `${h.x},${h.y}`));
    return board.frontier().filter((c) => !holes.has(`${c.x},${c.y}`));
  }

  /** Instead of playing a tile: cast off, and re-moor somewhere better. */
  beginSail() {
    const g = this.game;
    if (!this.canSail()) {
      g.say(this.ship.charged ? 'Nowhere to moor.' : 'The ship is becalmed until a gust reaches it.');
      return false;
    }
    const s = this.ship;
    if (s.at) {
      const cell = g.board.get(s.at.x, s.at.y);
      if (cell && isShip(cell)) g.board.remove(s.at.x, s.at.y);
      s.at = null;
      g.say(`${g.player.name} casts off.`);
    }
    g.market = null;
    g.tile = SHIP_TILE;
    g.rot = 0;
    g.phase = 'place';
    this.sailing = true;
    g.emit('rotate');
    return true;
  }

  /** The ship ignores edge matching and the hole rule replaces it. */
  canPlaceAt(x, y) {
    const g = this.game;
    if (!this.sailing) {
      return g.board.canPlace(x, y, g.tile, g.rot, g.placeOpts());
    }
    return this.moorings().some((m) => m.x === x && m.y === y);
  }

  /**
   * A ship that has just moored is stuck there until the weather comes for it,
   * and it doesn't count as a tile laid — sailing is what you do INSTEAD of
   * building, so it can't also be the thing that ends the game.
   */
  placeAt(x, y) {
    const g = this.game;
    if (!this.sailing) return undefined;             // not ours; the host handles it
    if (!this.canPlaceAt(x, y)) return false;
    const seat = g.current;
    const cell = g.board.place(x, y, SHIP_TILE, 0, { owner: seat });
    cell.ship = seat;
    this.sailing = false;
    this.ships[seat] = { at: { x, y }, charged: false };
    g.tile = null;
    this.payTemples([{ cell, from: null }], TEMPLE_LAID);
    g.say(`${g.player.name} moors the sky ship at (${x}, ${y}).`);
    g.emit('place', { cells: [cell] });
    g.lastPlaced = cell;
    this.flight = null;
    g.endTurn();
    return true;
  }

  /** Which seats have a ship tied to this piece of country. */
  shipsOn(group) {
    const out = new Set();
    for (const cell of group) {
      for (let s = 0; s < 4; s++) {
        const nb = this.game.board.neighbor(cell.x, cell.y, s);
        if (nb && isShip(nb)) out.add(nb.ship);
      }
    }
    return out;
  }

  /** Keep every ship's bookkeeping honest after the wind has had its way. */
  resettleShips() {
    const board = this.game.board;
    this.ships.forEach((s, i) => {
      if (!s.at) return;
      const cell = board.get(s.at.x, s.at.y);
      if (cell && isShip(cell) && cell.ship === i) return;
      // Blown off the edge of the world, or shoved somewhere: find it again.
      const found = [...board.cells.values()].find((c) => isShip(c) && c.ship === i);
      if (found) { s.at = { x: found.x, y: found.y }; s.charged = true; }
      else { s.at = null; s.charged = true; }
    });
  }

  // --- flying machines ------------------------------------------------------

  /**
   * The lane a machine sends a follower down: straight out the way it points,
   * over whatever tiles are there, until the country runs out — but a zephyr
   * crossed on the way is a wind you're in, not a wind you watch, so the
   * flight turns and follows it. That's the whole tactic: a zephyr blowing
   * straight back at you ends the flight, and everything past it is
   * unreachable.
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
      // you is the end of the flight.
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
      if (!board.get(cell.x, cell.y) || cell.meeple || isShip(cell)) continue;
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
        this.blame = job[1];
        for (const report of storm(this.game.board, job[0])) this.applyGust(report);
        this.resettleShips();
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
    for (const cell of r.reached) {
      const s = isShip(cell) ? this.ships[cell.ship] : null;
      if (s) s.charged = true;                   // the weather came for it
    }
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

    // A tile the wind pushes off the edge of the world lands in the hand of
    // whoever set that wind off. A ship never does: it goes back to its owner.
    for (const f of r.fell) {
      this.fallen++;
      if (isShip(f.cell)) continue;              // resettleShips will find it gone
      const hand = this.blame != null ? this.hands[this.blame] : null;
      if (hand && hand.length < HAND_CAP) hand.push(f.id);
      else g.deck.push(f.id);
    }
    if (r.fell.length) {
      const who = this.blame != null ? g.players[this.blame].name : 'The sky';
      g.say(`${r.fell.length} tile${r.fell.length > 1 ? 's' : ''} blow off the edge of the world, into ${who}'s hand.`);
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

    // The majority has to be read BEFORE the award, because awarding a feature
    // hands its followers back and there is nobody standing in it afterwards.
    const winners = this.game.board.majority(d);
    this.game.award(d, false, closer);
    this.shipBonus(d, winners);
    this.crystallise(d, winners);
  }

  /** A feature that finishes on a piece of country a ship is tied to pays more. */
  shipBonus(d, winners) {
    if (!winners.length) return;
    const board = this.game.board;
    const cells = board.cellsOf(d);
    if (!cells.length) return;
    const group = board.groups().find((cs) => cs.includes(cells[0]));
    if (!group) return;
    const moored = this.shipsOn(group);
    if (!moored.size) return;
    for (const p of winners) {
      this.pay(p, SHIP_BONUS * moored.size,
        `${moored.size > 1 ? 'Ships' : 'A ship'} at the quay — ${this.game.players[p].name}`,
        cells.map((c) => ({ x: c.x, y: c.y })));
    }
  }

  /**
   * Everything in a finished feature turns to permanent land — except a zephyr,
   * which is never nailed down, and the ship, which is nobody's terrain. A
   * crystallised CITY is solid all the way up and stops a gust; a crystallised
   * road is flat ground the wind goes straight over.
   */
  crystallise(d, holders = []) {
    for (const cell of this.game.board.cellsOf(d)) {
      // A turbine in a city that just closed keeps paying whoever held it, so
      // the majority is written onto the tile before the followers go home.
      if (turbineOn(cell) && holders.length) cell.millers = holders.slice();
      if (cell.anchored || isShip(cell) || zephyrDirs(cell).length) continue;
      cell.anchored = true;
      cell.blocks = hasCity(cell);
      this.crystals++;
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

  // --- what a computer player can't see -------------------------------------
  //
  // The bot reads the board: what closed, who holds it, what it pays. None of
  // that includes the weather, and in this mode the weather is the game.

  botPlaceBonus(cells, player) {
    let value = 0;
    let joining = false;
    for (const cell of cells) {
      value += this.templeValue(cell, player, TEMPLE_LAID);
      if (this.joinsSphere(cell)) { joining = true; value += 2; }
      else if (cell.type.feats.some((f) => f.type === 'sfera')) value += 0.5;
      value += this.turbineValue(cell, player);
      value += this.shipValue(cell, player);
      for (const d of zephyrDirs(cell)) value += this.gustValue(cell, d, player);
    }
    // Standing on an island only ever pays when a sphere closes — all of it on
    // the turn you close one yourself, and a fraction of it the rest of the
    // time, because somebody else will close one of the remaining five.
    if (this.spheres < SPHERES) value += this.islandValue(player) * (joining ? 1 : 0.15);
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

  /** A turbine is an annuity, so it's worth more than one gust's worth of it. */
  turbineValue(cell, player) {
    const t = turbineOn(cell);
    if (!t || t.on == null) return 0;
    if (cell.millers) return cell.millers.includes(player) ? 4 : -2;
    const d = this.game.board.featureOf(cell.x, cell.y, t.on);
    if (!d) return 3;                            // unclaimed, and we could hold it
    const mine = d.meeples.some((m) => m.player === player);
    return mine ? 4 : -2;
  }

  /** Building on the piece of country your own ship is tied to. */
  shipValue(cell, player) {
    const s = this.ships[player];
    if (!s || !s.at) return 0;
    const d = Math.abs(cell.x - s.at.x) + Math.abs(cell.y - s.at.y);
    return d <= 2 ? SHIP_BONUS * 0.4 : 0;
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
      if (other.blocks) break;                   // a crystallised city ends the lane
      if (zephyrDirs(other).includes(dir)) strength = Math.min(MAX_STRENGTH, strength + 1);
      value += this.turbineValue(other, player) * 0.3;
      // A follower about to be moved: ours is a risk, theirs is an opportunity,
      // and either way the further it travels the less likely it lands well.
      if (other.meeple) {
        const dest = board.get(other.x + dx * strength, other.y + dy * strength);
        const worse = dest ? 0.6 : 2;            // over open sky it goes home
        value += other.meeple.player === player ? -worse : worse * 0.7;
      }
      // Tiles the gust is about to park in one of our parishes.
      if (!other.anchored && !other.fixed) {
        value += this.templeValue(
          { x: other.x + dx * strength, y: other.y + dy * strength }, player, TEMPLE_BLOWN * 0.6);
      }
    }
    return value;
  }

  /**
   * Mooring instead of building. Worth a turn only when the ship is free, when
   * there is somewhere genuinely better to be than where it is, and when that
   * somewhere is beside country we are actually going to finish — a ship tied
   * to a piece of sky where nothing of ours closes pays nothing at all.
   */
  botAction(seat) {
    if (this.game.current !== seat) return false;
    const s = this.ships[seat];
    if (!s || !s.charged) return false;
    const moorings = this.moorings();
    if (!moorings.length) return false;

    let best = null;
    for (const m of moorings) {
      const value = this.quayValue(m, seat);
      if (!best || value > best.value) best = { ...m, value };
    }
    const here = s.at ? this.quayValue(s.at, seat) : 0;
    // A move has to beat staying put by a clear margin: casting off costs the
    // whole turn, and the ship is then stuck until the weather comes back.
    if (!best || best.value < here + 4) return false;
    if (!this.beginSail()) return false;

    // Casting off changes the shape of the country — the square the old ship
    // was moored to may not even be on the frontier any more — so the target
    // is picked again against the board we're actually looking at. There is no
    // way back from here: a ship that has cast off has to moor somewhere.
    let pick = null;
    for (const m of this.moorings()) {
      const value = this.quayValue(m, seat);
      if (!pick || value > pick.value) pick = { ...m, value };
    }
    if (!pick) pick = best;
    return this.game.placeAt(pick.x, pick.y) !== false;
  }

  /** What the piece of country beside a mooring is about to be worth to us. */
  quayValue(at, seat) {
    const board = this.game.board;
    let value = 0;
    const seen = new Set();
    for (let s = 0; s < 4; s++) {
      const nb = board.neighbor(at.x, at.y, s);
      if (!nb) continue;
      nb.type.feats.forEach((f, i) => {
        if (f.type !== 'city' && f.type !== 'road') return;
        const d = board.featureOf(nb.x, nb.y, i);
        if (!d || d.scored) return;
        const root = board.find(d.parts[0]);
        if (seen.has(root)) return;
        seen.add(root);
        const mine = d.meeples.some((m) => m.player === seat);
        // Close to closing and ours: the bonus lands. Somebody else's: it
        // lands for them, which is worse than not mooring at all.
        const odds = 1 / (1 + d.open);
        value += (mine ? SHIP_BONUS : d.meeples.length ? -SHIP_BONUS : SHIP_BONUS * 0.4) * (1 + odds * 3);
      });
    }
    return value;
  }

  /** What a count would pay us right now, minus what it would pay the best rival. */
  islandValue(player) {
    let value = 0;
    for (const group of this.game.board.groups()) {
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
    const out = cell.anchored || cell.fixed ? { crystal: true } : { cloud: true };
    if (cell.blocks) out.rampart = true;
    if (turbineOn(cell)) out.turbine = true;
    if (isShip(cell)) out.ship = cell.ship;
    return out;
  }

  actions() {
    const g = this.game;
    const s = this.ship;
    if (this.sailing) return [];
    if (g.phase !== 'market' && g.phase !== 'place') return [];
    return [{
      label: s.at ? 'Cast off and re-moor the ship' : 'Moor your sky ship',
      fn: () => this.beginSail(),
      disabled: !this.canSail(),
    }];
  }

  status() {
    const board = this.game.board;
    const rooted = [...board.cells.values()].filter((c) => c.anchored || c.fixed).length;
    const isles = Math.max(0, board.groups().length - 1);
    return `${this.laid} tiles laid · ${rooted} solid · ${board.size - rooted} still cloud`
      + ` · ${isles} island${isles === 1 ? '' : 's'} adrift`;
  }

  panel() {
    const g = this.game;
    const rows = g.players.map((p, i) => {
      const active = i === g.current && g.phase !== 'over';
      const meeples = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(Math.max(0, 7 - p.meeples))}</span>`;
      const s = this.ships[i];
      const ship = s.at ? (s.charged ? '⛵' : '<span class="dim">⚓</span>') : '⛵';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name} ${ship}</span>
          <span class="pmeta">${meeples}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    return `${rows}<p class="hint">${this.gusts} gust${this.gusts === 1 ? '' : 's'} · ${this.fallen} tile${this.fallen === 1 ? '' : 's'} blown back into hand · ${this.spheres} of ${SPHERES} spheres closed.</p>`;
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
  market: false,           // the row is the mode's own hand, not a draft
  marketDiscards: false,
  opening: 'A first stone hangs in the cloud. Everything else is weather.',
  hint: 'Claim as normal — but a zephyr blows its whole lane and stacks up to three, followers and tiles are blown along with it, anything that lands touching nothing falls into your hand, a temple pays its keeper for every tile that arrives beside it, a turbine pays its city for every gust, and joining two half-spheres counts the island they sit on.',
};
