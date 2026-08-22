// ---------------------------------------------------------------------------
// The host.
//
// `Game` owns the things every mode shares — players, the deck, the board, the
// turn counter, the log, the event stream — and nothing else. Everything that
// makes a mode a *mode* lives in src/modes/<name>.js behind a small set of
// hooks, so adding one is adding one file rather than editing five.
//
// The generic turn is: draw something placeable -> place it -> let the mode
// decide what happens next -> score whatever closed -> next player.
//
// MECHANICS (see mechanics.js) are orthogonal to modes and live here, because
// they apply to all of them: the drafting market, lifting placed tiles,
// building on top of them, and the Carcassonne expansion rules.
//
// Pure state; no DOM and no canvas in here.
// ---------------------------------------------------------------------------

import { Board } from './board.js';
import {
  TILES, GROUPS, BACKS, ABBEY_TILE, NO_MEEPLE, MARKS, bridgedType,
  buildDeck, buildRiverDeck, opposite, SIDE_STEP,
  RIVER_MOUTH, RIVER_SPRING,
} from './tiles.js';
import { PLAYER_NAMES } from './theme.js';
import { MODES, MODE_BY_ID } from './modes/index.js';
import { AGENDAS } from './modes/agendas.js';
import {
  MECHANICS, MECHANIC_GROUPS, MECHANIC_BY_ID, LAYERS, LIVE_MECHANICS,
  RULESETS, RULESET_BY_ID, DEFAULT_RULESET, defaultMechanics,
  disabledFeatures, tileAllowed,
  canLift, liftableCells, coverProblem,
  claimableFeatures, walkTargets, innsAndCathedrals, goodsOn, crownAndRoad,
  farmPayouts, pigsByField, citiesFed, FIGURES, FIGURE_BY_ID,
  hasMark, vineyardBonus, portalTargets,
  WATER, MAX_STACK,
} from './mechanics.js';

export const RULES = {
  meeplesPerPlayer: 7,
  startTile: 'D',
  cityPerTile: 2,
  cityPerShield: 2,
  roadPerTile: 1,
  goodsBonus: 10,
};

export const DEFAULT_GROUPS = Object.fromEntries(MODES.map((m) => [m.id, m.groups]));
export {
  MODES, GROUPS, MECHANICS, MECHANIC_GROUPS, MECHANIC_BY_ID, LAYERS,
  LIVE_MECHANICS, RULESETS, RULESET_BY_ID, DEFAULT_RULESET, defaultMechanics,
};

const MARKET_SIZE = 4;
const TIDE_PERIOD = 3;          // rounds between waterline steps
const GOODS = ['wine', 'grain', 'cloth'];

export class Game {
  constructor({
    players = 2, seed = null, mode = 'classic', meeples = true,
    groups = null, options = {}, tilesPerTurn = 1, ruleset = DEFAULT_RULESET,
  } = {}) {
    const spec = MODE_BY_ID[mode] || MODE_BY_ID.classic;
    this.mode = spec.id;
    this.spec = spec;
    this.options = options;
    this.rules = RULESET_BY_ID[ruleset] || RULESET_BY_ID[DEFAULT_RULESET];

    // The base layer that decides which tiles may exist at all. Worked out
    // once, here, because the deck, the seeds and the art all have to agree
    // about it and none of them should be re-deriving it.
    this.offFeatures = disabledFeatures(options);

    // Followers are a base-layer switch now. The old `meeples` argument still
    // works — a mode that has no followers at all still overrules both.
    this.useMeeples = spec.meeples ? (options.meeple ?? meeples) !== false : false;
    this.groups = groups && groups.length ? groups : spec.groups;
    if (spec.solo) players = 1;
    else players = Math.max(spec.minPlayers || 1, Math.min(spec.maxPlayers || 5, players));

    // A mode may insist on its own seed — Tesserae is the same puzzle for
    // everyone on a given day, which is the entire point of it.
    if (seed == null && spec.seedFor) seed = spec.seedFor();
    this.rng = seed == null ? Math.random : mulberry32(seed);
    this.seed = seed;
    // The Maps: play within a fixed border rather than out across the table.
    // A mode with its own bounds keeps them; the mechanic only fills silence.
    const mapBounds = this.has('maps') && !spec.bounds
      ? { minX: -5, maxX: 5, minY: -5, maxY: 5 } : null;
    this.board = new Board({ bounds: spec.bounds || mapBounds || null });
    this.players = Array.from({ length: players }, (_, i) => ({
      id: i,
      name: spec.playerName ? spec.playerName(i) : PLAYER_NAMES[i],
      score: 0,
      meeples: RULES.meeplesPerPlayer,
      big: this.has('bigMeeple') ? 1 : 0,
      mayors: this.has('mayor') ? 1 : 0,
      abbots: this.has('abbot') ? 1 : 0,
      phantoms: this.has('phantom') ? 1 : 0,
      pigs: this.has('pig') ? 1 : 0,
      abbeys: this.has('abbey') ? 1 : 0,
      ingots: 0,
      buildings: this.has('littleBuildings') ? { shed: 1, house: 1, tower: 1 } : null,
      robbers: this.has('robbers') ? 1 : 0,
      shepherds: this.has('sheep') ? 1 : 0,
      barns: this.has('barn') ? 1 : 0,
      floors: this.has('tower') ? [0, 10, 10, 9, 7, 6][players] || 6 : 0,
      wonders: 0,
      bridges: this.has('bridge') ? 3 : 0,
      goods: { wine: 0, grain: 0, cloth: 0 },
    }));

    this.current = 0;
    this.round = 1;
    this.phase = 'place';
    this.tile = null;
    this.rot = 0;
    this.lastPlaced = null;
    this.log = [];
    this.free = false;
    this.forcedNext = null;
    this.listeners = [];
    this.turn = 1;
    this.market = null;
    this.flipped = false;
    this.waterline = null;

    // How many tiles a player lays before the turn passes. Each one is a full
    // place-and-act sequence, so in a walking mode it's N tiles and N moves.
    this.tilesPerTurn = Math.max(1, Math.min(5, tilesPerTurn));
    this.tilesLeft = 0;
    this.useKind = null;          // which special follower the next claim spends
    this.usingPhantom = false;    // the free second placement, mid-flight
    this.usingAbbey = false;
    this.builderUsed = false;
    this.pendingWalk = null;
    this.crown = { city: null, cityBy: null, road: null, roadBy: null };
    this.mage = null;             // {x, y, feat} — where the mage is standing
    this.witch = null;            // …and the witch
    this.magicPick = 'mage';      // which of the two the next magic click places
    this.ingots = 16;             // the shared gold supply, as printed
    this.tunnelOpen = null;       // a tunnel mouth waiting for its pair
    this.thieves = [];            // outstanding robbers: {thief, victim}
    this.giftDrawn = false;       // one gift a turn, however generous the tile
    this.flockBag = this.has('sheep') ? shuffleBag(this.rng) : null;
    this.dragon = null;           // {x, y} once a volcano has erupted
    this.fairy = null;            // {x, y} — the one figure that protects
    this.prisoners = [];          // tower captives: {holder, owner, big, kind}
    this.bigTop = null;           // {x, y} — where the circus is pitched
    this.teacher = null;          // which player the teacher follows

    this.m = new spec.Mode(this);
    this.deck = this.cull(this.m.deck());
    this.river = this.has('river') ? this.startRiver() : null;

    for (const s of this.seeds()) {
      const id = this.legalSeed(s.id);
      if (id) this.board.place(s.x, s.y, TILES[id], s.rot || 0, { owner: s.owner ?? null });
    }

    if (this.has('agendas')) this.dealAgendas();
    if (this.has('tide')) this.setWaterline(spec.tideStart ?? 6);

    this.m.setup();
    this.say(this.river ? 'The river rises. Lay it out before anything else.' : (spec.opening || 'Start tile placed.'));
    this.startTurn();
  }

  /**
   * Is a mechanic switched on? A mode may force one on for itself, and the
   * base layer is on unless it has been explicitly switched off — otherwise
   * every mode that never heard of `cities` would be playing without them.
   */
  has(id) {
    const set = this.options?.[id];
    if (set !== undefined) return !!set;
    if (this.spec?.mechanics?.includes(id)) return true;
    return !!MECHANIC_BY_ID[id]?.on;
  }

  // --- the base layer -------------------------------------------------------

  /**
   * Take out of the deck every tile carrying a feature the base layer has
   * switched off. This is what "turn cities off" actually means: not a city
   * that scores nothing, but a landscape with no cities in it.
   */
  cull(deck) {
    if (!this.offFeatures.size) return deck;
    const kept = deck.filter((id) => TILES[id] && tileAllowed(TILES[id], this.offFeatures));
    // Emptying the pool entirely would be a game with nothing to play, so the
    // cull gives way rather than deals you nothing.
    return kept.length ? kept : deck;
  }

  /**
   * The opening tile, or a stand-in for it. A mode's start tile is chosen for
   * its own reasons and may well be a city-and-road crossroads, which is
   * exactly the tile a base layer without cities has just banned.
   */
  legalSeed(id) {
    const type = TILES[id];
    if (!type || tileAllowed(type, this.offFeatures)) return id;
    const swap = this.deck.find((d) => tileAllowed(TILES[d], this.offFeatures));
    if (!swap) return id;
    this.deck.splice(this.deck.indexOf(swap), 1);
    return swap;
  }

  get player() { return this.players[this.current]; }
  get modeName() { return this.spec.name; }

  /** The sub-map replacing this player's turn, if any. */
  get interior() { return this.m.interior; }
  get caves() { return this.m.caves || new Map(); }

  /** Legacy accessors so render/main can stay mode-agnostic. */
  get expedition() { return this.m.id === 'expedition' ? this.m : null; }
  get adventure() { return this.m.walkerKind === 'party' ? this.m : null; }
  get walker() { return this.m.isWalker ? this.m : null; }

  say(msg) {
    this.log.unshift(msg);
    if (this.log.length > 80) this.log.pop();
  }

  /** Subscribe to gameplay events (sound, and anything else later). */
  on(fn) { this.listeners.push(fn); return this; }
  emit(kind, data = {}) { for (const fn of this.listeners) fn(kind, data); }

  // --- the river ------------------------------------------------------------

  /**
   * The river is laid before the game proper: the spring first, then tiles in
   * turn, and the lake last. It may not double back on itself — two curves in
   * a row bending the same way would make a U-turn — but only an *immediate*
   * reversal is illegal, which is the official reading.
   */
  startRiver() {
    const deck = buildRiverDeck(this.rng, { long: this.has('riverII') });
    deck.unshift(RIVER_MOUTH);          // drawn last, since we pop from the end
    return { deck, end: null, lastTurn: 0, done: false };
  }

  /** The opening tiles: the spring if there's a river, else the mode's seeds. */
  seeds() {
    if (!this.river) return this.m.seeds();
    this.river.end = { x: 0, y: 0, side: 0 };   // the spring flows north
    return [{ x: 0, y: 0, id: RIVER_SPRING, rot: 0 }];
  }

  /** The cell the next river tile has to occupy. */
  riverTarget() {
    const e = this.river?.end;
    if (!e) return null;
    const [dx, dy] = SIDE_STEP[e.side];
    return { x: e.x + dx, y: e.y + dy };
  }

  /** Where the river leaves a tile, and which way it turned to get there. */
  riverFlow(type, rot) {
    const incoming = opposite(this.river.end.side);
    const feat = type.feats.find((f) => f.type === 'river');
    if (!feat) return null;
    const world = feat.sides.map((s) => (s + rot) % 4);
    if (!world.includes(incoming)) return null;
    const outgoing = world.find((s) => s !== incoming);
    if (outgoing == null) return { outgoing: null, turn: 0 };   // the lake
    const delta = (outgoing - incoming + 4) % 4;
    return { outgoing, turn: delta === 2 ? 0 : delta };
  }

  riverLegal(x, y, type, rot) {
    const target = this.riverTarget();
    if (!target || x !== target.x || y !== target.y) return false;
    const flow = this.riverFlow(type, rot);
    if (!flow) return false;
    // Two bends the same way in a row would turn the river through 180°.
    if (flow.turn !== 0 && flow.turn === this.river.lastTurn) return false;
    return true;
  }

  advanceRiver(cell) {
    const flow = this.riverFlow(cell.type, cell.rot);
    if (!flow || flow.outgoing == null) return this.endRiver();
    this.river.end = { x: cell.x, y: cell.y, side: flow.outgoing };
    this.river.lastTurn = flow.turn;
    if (!this.river.deck.length) this.endRiver();
  }

  endRiver() {
    this.river.done = true;
    this.say('The river reaches the lake. The country around it is open now.');
    this.emit('caveExit');
  }

  get riverActive() { return !!this.river && !this.river.done; }

  // --- turn structure -------------------------------------------------------

  startTurn() {
    if (this.has('fairy') && this.fairy) {
      const c = this.board.get(this.fairy.x, this.fairy.y);
      if (c?.meeple?.player === this.current) {
        this.player.score += 1;
        this.say(`The fairy's blessing — ${this.player.name} +1.`);
      }
    }
    this.payRansoms();
    if (this.phase === 'over') return;
    const inv = this.interior;
    if (inv) {
      this.phase = inv.tile ? 'interior-place' : 'interior-move';
      return;
    }
    if (this.m.startTurn() === false) return;    // mode took over (boons, stages)
    if (this.tilesLeft <= 0) {
      this.tilesLeft = this.tilesPerTurn;
      this.builderUsed = false;
    }
    if (!this.riverActive && !this.m.anythingLeft()) {
      const other = this.m.someoneStillInside(this.current);
      if (other != null) { this.current = other; return this.startTurn(); }
      return this.finish();
    }
    this.drawTile();
  }

  drawTile() {
    this.usingAbbey = false;
    this.useBig = false;
    // A mode with its own draw owns it completely — including deciding that
    // there's nothing left and ending the game.
    if (this.m.drawNext && !this.riverActive) return void this.m.drawNext();
    this.flipped = false;
    if (this.riverActive) return this.drawRiverTile();
    if (this.has('market') && this.spec.market !== false) return this.fillMarket();

    while (this.deck.length) {
      let id;
      if (this.forcedNext) {
        id = this.forcedNext;
        this.forcedNext = null;
        const idx = this.deck.indexOf(id);
        if (idx >= 0) this.deck.splice(idx, 1); else this.deck.pop();
      } else {
        id = this.deck.pop();
      }
      if (this.offer(id)) return;
      this.say(`Tile ${id} had nowhere to go — discarded.`);
    }
    this.finish();
  }

  /** River tiles come off their own pile, and only fit in one place. */
  drawRiverTile() {
    while (this.river.deck.length) {
      const id = this.river.deck.pop();
      const type = TILES[id];
      if (this.riverPlacements(type).length) {
        this.tile = type;
        this.rot = 0;
        this.phase = 'place';
        return;
      }
      this.say(`River tile ${id} had nowhere to go — discarded.`);
    }
    this.endRiver();
    this.drawTile();
  }

  riverPlacements(type) {
    const target = this.riverTarget();
    if (!target) return [];
    const out = [];
    for (let rot = 0; rot < 4; rot++) {
      if (!this.riverLegal(target.x, target.y, type, rot)) continue;
      if (!this.board.canPlace(target.x, target.y, type, rot, { free: this.free })) continue;
      out.push({ x: target.x, y: target.y, rot });
    }
    return out;
  }

  /** Make a drawn tile the current one, if it can actually be played. */
  offer(id) {
    const type = TILES[id];
    if (!this.placeableNow(type)) return false;
    this.tile = type;
    this.rot = 0;
    this.phase = 'place';
    return true;
  }

  placeableNow(type) {
    return this.board.hasAnyPlacement(type, this.placeOpts());
  }

  placeOpts() {
    const opts = { free: this.free, ...(this.m.placeOpts?.() || {}) };
    if (this.has('stack') && !this.riverActive) opts.cover = true;
    return opts;
  }

  // --- the drafting market --------------------------------------------------

  fillMarket(size = MARKET_SIZE, row = null) {
    const market = row || this.market || [];
    this.market = market;
    for (let i = market.length - 1; i >= 0; i--) {
      if (!this.placeableNow(TILES[market[i]])) market.splice(i, 1);
    }
    while (market.length < size && this.deck.length) {
      const id = this.deck.pop();
      if (this.placeableNow(TILES[id])) market.push(id);
    }
    if (!market.length) return this.finish();
    this.phase = 'market';
    return true;
  }

  takeFromMarket(i) {
    if (this.phase !== 'market' || !this.market || i < 0 || i >= this.market.length) return false;
    const discards = this.spec.marketDiscards !== false;
    const discarded = discards ? this.market.splice(0, i) : [];
    const id = discards ? this.market.shift() : this.market.splice(i, 1)[0];
    if (discarded.length) this.say(`${this.player.name} passes over ${discarded.join(', ')} to take ${id}.`);
    this.emit('rotate');
    if (!this.offer(id)) this.drawTile();
    return true;
  }

  // --- placing --------------------------------------------------------------

  rotate(dir = 1) {
    if (this.phase === 'place') {
      // The mode only handles rotation for tiles it dealt. An abbey out of
      // hand, or a river tile, is the host's and turns the ordinary way.
      const mine = this.usingAbbey || this.riverActive;
      if (this.m.rotate && !mine) this.m.rotate(dir);
      else this.rot = (this.rot + dir + 4) % 4;
    } else if (this.phase === 'interior-place' && this.interior) {
      this.interior.rotate(dir);
    } else return;
    this.emit('rotate');
  }

  canFlip() {
    if (!this.has('twoFaced') || this.phase !== 'place') return false;
    if (this.m.piece || this.usingAbbey || this.riverActive) return false;
    return !!this.tile && !!BACKS[this.tile.id];
  }

  flipTile() {
    if (!this.canFlip()) return false;
    const back = TILES[BACKS[this.tile.id]];
    if (!this.board.hasAnyPlacement(back, this.placeOpts())) {
      this.say(`The reverse of ${this.tile.id} has nowhere to go.`);
      return false;
    }
    this.say(`${this.player.name} turns ${this.tile.id} over — it is ${back.name} on the back.`);
    this.tile = back;
    this.flipped = !this.flipped;
    this.emit('rotate');
    return true;
  }

  // --- the abbey (expansion 5) ---------------------------------------------

  /**
   * Not while the river is going down. The river owns placement completely —
   * `canPlaceAt` routes through `riverLegal` before it looks at anything else —
   * so an abbey taken out now is a tile with nowhere at all it may go, and the
   * turn can never end.
   */
  canPlayAbbey() {
    return this.has('abbey') && this.phase === 'place' && !this.usingAbbey
      && !this.riverActive && this.player.abbeys > 0 && this.abbeyGaps().length > 0;
  }

  abbeyGaps() {
    const out = [];
    for (const { x, y } of this.board.frontier()) {
      if (this.board.isEnclosedGap(x, y)) out.push({ x, y });
    }
    return out;
  }

  playAbbey() {
    if (!this.canPlayAbbey()) return false;
    this.heldTile = this.tile;
    this.tile = ABBEY_TILE;
    this.rot = 0;
    this.usingAbbey = true;
    this.say(`${this.player.name} takes out their abbey.`);
    this.emit('rotate');
    return true;
  }

  // --- lifting (Cirrus's rule, anywhere) -----------------------------------

  canLiftNow() {
    if (!this.has('lift') || this.riverActive) return false;
    if (this.phase !== 'place' && this.phase !== 'market') return false;
    return liftableCells(this.board).length > 0;
  }

  beginLift() {
    if (!this.canLiftNow()) return false;
    this.phase = 'lift';
    return true;
  }

  cancelLift() {
    if (this.phase !== 'lift') return false;
    this.phase = this.tile ? 'place' : 'market';
    return true;
  }

  /** Pick a placed tile up; you play it instead of the one you drew. */
  liftAt(x, y) {
    if (this.phase !== 'lift' || !canLift(this.board, x, y)) return false;
    const cell = this.board.remove(x, y);
    if (this.tile) this.deck.push(this.tile.id);   // the drawn tile goes back
    this.tile = cell.type;
    this.rot = cell.rot;
    this.market = null;
    this.phase = 'place';
    this.say(`${this.player.name} lifts ${cell.type.id} off (${x}, ${y}).`);
    this.emit('rotate');
    return true;
  }

  // --- placement ------------------------------------------------------------

  canPlaceAt(x, y) {
    if (this.phase !== 'place') return false;
    if (this.riverActive) return this.riverLegal(x, y, this.tile, this.rot)
      && this.board.canPlace(x, y, this.tile, this.rot, { free: this.free });
    if (this.usingAbbey) return this.board.isEnclosedGap(x, y);
    if (this.m.canPlaceAt) return this.m.canPlaceAt(x, y);
    if (this.board.get(x, y) && coverProblem(this.board, x, y)) return false;
    return this.board.canPlace(x, y, this.tile, this.rot, this.placeOpts());
  }

  placeAt(x, y) {
    if (this.phase !== 'place') return false;
    // A mode that owns placement says so by answering. Returning `undefined`
    // means "not mine this time" — Girando only intercepts when the thing in
    // your hand is a ship rather than a tile, and wants the ordinary path for
    // everything else.
    if (this.m.placeAt && !this.usingAbbey && !this.riverActive) {
      const done = this.m.placeAt(x, y);
      if (done !== undefined) return done;
    }
    if (!this.canPlaceAt(x, y)) return false;

    const covering = !!this.board.get(x, y);
    const cell = this.board.place(x, y, this.tile, this.rot, {
      owner: this.current, over: covering,
      ...(this.m.placeOpts?.() || {}),
    });
    this.lastPlaced = cell;
    if (this.usingAbbey) {
      this.player.abbeys--;
      this.tile = this.heldTile || null;      // your drawn tile is still to come
      this.heldTile = null;
      this.usingAbbey = false;
      this.say(`${this.player.name} closes the gap at (${x}, ${y}) with their abbey.`);
    } else {
      this.tile = null;
      this.say(`${this.player.name} played ${cell.type.id} at (${x}, ${y})${covering ? ` — level ${cell.h + 1}` : ''}.`);
    }
    this.emit('place', { cells: [cell] });
    if (this.riverActive) this.advanceRiver(cell);
    this.checkBuilder(cell);
    // Tile symbols with an opinion about what happens next. An instant one
    // (gold, plague, a wind rose) resolves in place; an interactive one (the
    // magic figures, a crop circle) interposes its own phase, and the turn
    // continues into `afterPlace` when it is answered.
    if (!this.riverActive) {
      if (this.has('orchards')) this.checkFruit(cell);
      if (this.has('gifts')) this.checkGift(cell);
    }
    const interpose = this.riverActive ? null : this.onMarks(cell);
    if (interpose) { this.phase = interpose; return true; }
    this.afterPlace(cell);
    return true;
  }

  // --- tile symbols ----------------------------------------------------------

  /** Resolve the marks on a just-laid tile. Returns a phase to interpose, or null. */
  onMarks(cell) {
    const kinds = cell.type.marks.map((m) => m.kind);

    if (this.has('windRoses') && kinds.includes('rose')) this.windRose(cell);
    if (this.has('plague') && kinds.includes('plague')) this.outbreak(cell);
    if (this.has('goldmines') && kinds.includes('ingot')) this.dropIngots(cell);
    if (this.has('tunnel') && kinds.includes('tunnel')) this.pairTunnel(cell);

    if (this.has('peasantRevolts') && kinds.includes('revolt')) this.revolt(cell);
    if (this.has('orchards') && kinds.includes('fruit')) cell.fruitLeft = 4;

    if (this.has('volcano') && kinds.includes('volcano')) {
      this.dragon = { x: cell.x, y: cell.y };
      this.say('The volcano erupts — the dragon wheels down onto it.');
    }
    if (this.has('dragon') && kinds.includes('dragonmark') && this.dragon) this.rampage();
    if (this.has('ferries') && kinds.includes('lakef')) this.placeFerry(cell);
    if (this.has('circus') && kinds.includes('bigtop')) this.moveBigTop(cell);

    if (this.has('robbers') && kinds.includes('swag')
      && this.player.robbers > 0 && this.players.length > 1) return 'rob';
    if (this.has('cropCircles') && kinds.includes('crop')) return 'crop';
    if (this.has('mageWitch') && kinds.includes('magic')
      && this.magicTargets().length) return 'magic';
    return null;
  }

  /** A wind rose pays 3 on the spot — but only laid in its own quadrant. */
  windRose(cell) {
    const q = cell.type.quad;
    if (!q) return;
    const ok = (q.includes('N') ? cell.y < 0 : cell.y > 0)
      && (q.includes('E') ? cell.x > 0 : cell.x < 0);
    if (!ok) return;
    this.player.score += 3;
    this.say(`${this.player.name} lays the ${q} wind rose in its own quadrant — +3.`);
    this.emit('score', { points: 3, players: [this.current], at: { x: cell.x + 0.5, y: cell.y + 0.5 } });
  }

  /** The plague: every follower in the surrounding eight tiles goes home. */
  outbreak(cell) {
    let swept = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.board.get(cell.x + dx, cell.y + dy);
        if (!c?.meeple) continue;
        this.sendHome(c);
        swept++;
      }
    }
    if (swept) this.say(`Plague at (${cell.x}, ${cell.y}) — ${swept} follower${swept > 1 ? 's' : ''} flee home.`);
  }

  /** One follower off the board and back into the right supply, scoring nothing. */
  sendHome(c) {
    const m = c.meeple;
    const d = m.feat != null ? this.board.featureOf(c.x, c.y, m.feat) : null;
    if (d) d.meeples = d.meeples.filter((o) => !(o.x === c.x && o.y === c.y));
    c.meeple = null;
    const owner = this.players[m.player];
    if (m.kind === 'phantom') owner.phantoms++; else owner.meeples++;
    if (m.big) owner.big++;
    if (m.kind === 'mayor') owner.mayors++;
    if (m.kind === 'abbot') owner.abbots++;
    if (m.kind === 'shepherd') owner.shepherds++;
  }

  /**
   * Gold: one ingot on the tile, one on a neighbour — the engine picks the
   * neighbour, preferring one on a feature the placer holds. (The printed rule
   * lets the placer choose; that choice is folded in here for now.)
   */
  dropIngots(cell) {
    const put = (c) => { if (this.ingots > 0) { c.gold = (c.gold || 0) + 1; this.ingots--; } };
    put(cell);
    const around = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const c = this.board.get(cell.x + dx, cell.y + dy);
        if (c) around.push(c);
      }
    }
    if (!around.length) return;
    const mine = around.find((c) => c.type.feats.some((f, i) => {
      const d = this.board.featureOf(c.x, c.y, i);
      return d && d.meeples.some((m) => m.player === this.current);
    }));
    put(mine || around[Math.floor(this.rng() * around.length)]);
    this.say(`Gold surfaces at (${cell.x}, ${cell.y}).`);
  }

  /** The second tunnel mouth joins its road to the one still waiting. */
  pairTunnel(cell) {
    const feat = cell.type.feats.findIndex((f) => f.type === 'road');
    if (feat < 0) return;
    const open = this.tunnelOpen;
    if (open && this.board.get(open.x, open.y)) {
      this.board.addLink(`${open.x},${open.y}#${open.feat}`, `${cell.x},${cell.y}#${feat}`);
      this.tunnelOpen = null;
      this.say('The tunnel breaks through — two roads are one.');
    } else {
      this.tunnelOpen = { x: cell.x, y: cell.y, feat };
      this.say('A tunnel mouth opens, waiting for its far end.');
    }
  }

  /**
   * Builder: extending a feature you already hold buys you another tile this
   * turn. The real expansion has a separate figure you place; here any of your
   * followers on the extended feature counts, which is the same decision
   * without the extra bookkeeping.
   */
  checkBuilder(cell) {
    if (!this.has('builder') || this.builderUsed) return;
    const mine = cell.type.feats.some((f, i) => {
      const d = this.board.featureOf(cell.x, cell.y, i);
      return d && d.tiles.size > 1 && d.meeples.some((m) => m.player === this.current);
    });
    if (!mine) return;
    this.builderUsed = true;
    this.tilesLeft++;
    this.say(`${this.player.name}'s builder is at work — another tile this turn.`);
    this.emit('landmark');
  }

  /** Hand off to the mode; a null answer means "just end the turn". */
  afterPlace(cell) {
    const next = this.m.afterPlace(cell);
    if (!next) return this.endTurn();
    this.phase = next;
    if (next === 'meeple' && this.meepleOptions().length === 0
      && !this.m.holdsMeeplePhase()) this.endTurn();
  }

  /**
   * Board clicks the host doesn't recognise go to the mode, which is how
   * Marches picks a battle and Cirrus lifts its own way.
   */
  cellClick(x, y) {
    switch (this.phase) {
      case 'place': return this.placeAt(x, y);
      case 'move': return this.movePawn(x, y);
      case 'lift': return this.m.onCellClick ? this.m.onCellClick(x, y) : this.liftAt(x, y);
      case 'recall': return this.recallAt(x, y);
      case 'walk': return this.walkTo(x, y);
      case 'magic': return this.magicAt(x, y);
      default: return this.m.onCellClick?.(x, y) ?? false;
    }
  }

  // --- followers ------------------------------------------------------------

  /**
   * Where a follower may go this turn. Normally that's the unclaimed features
   * on the tile you just laid — but a mode may offer somewhere else entirely
   * (Girando's flying machine sends one down a lane), so every option carries
   * the square it belongs to rather than assuming `lastPlaced`.
   */
  meepleOptions() {
    if (this.phase !== 'meeple' || !this.lastPlaced || !this.useMeeples) return [];
    // The phantom is a second body, not a second follower — it costs nothing
    // from the ordinary supply, so an empty supply doesn't stop it.
    if (this.player.meeples <= 0 && !this.usingPhantom) return [];
    const { x, y, type } = this.lastPlaced;
    const fig = this.useKind ? FIGURE_BY_ID[this.useKind] : null;
    const here = claimableFeatures(type, { fields: this.has('fields') })
      .filter(({ i, f }) => {
        // Only the abbot keeps a garden, so it is offered only when he is the
        // piece in hand.
        if (f.type === 'garden' && this.useKind !== 'abbot') return false;
        // A chosen figure narrows where you may go: the mayor only into
        // cities, the abbot only onto a monastery or a garden.
        if (fig && !fig.allows(f)) return false;
        if (!this.m.claimAllowed({ x, y, i, f })) return false;
        const d = this.board.featureOf(x, y, i);
        return d && d.meeples.length === 0;
      })
      .map((o) => ({ ...o, x, y }));

    // A magic portal on the tile you just laid lets the follower go anywhere
    // unfinished instead — the tile itself is only the ticket.
    const portal = this.has('portal') && hasMark(this.board.get(x, y), 'portal')
      ? portalTargets(this.board, { fields: this.has('fields') })
        .filter((o) => (!fig || fig.allows(o.f)) && o.f.type !== 'garden'
          && this.m.claimAllowed(o))
      : [];

    return [...here, ...portal, ...(this.m.flightTargets?.() || [])];
  }

  /** Which special followers this player could spend right now. */
  figuresAvailable() {
    return FIGURES.filter((f) => this.has(f.mech) && this.player[f.supply] > 0);
  }

  placeMeeple(featIdx, at = null) {
    if (this.phase !== 'meeple') return false;
    const spot = this.meepleOptions().find((o) => o.i === featIdx
      && (!at || (o.x === at.x && o.y === at.y)));
    if (!spot) return false;
    const cell = this.board.get(spot.x, spot.y);
    if (!cell) return false;

    const fig = this.useKind ? FIGURE_BY_ID[this.useKind] : null;
    const spend = fig && this.player[fig.supply] > 0 ? fig : null;
    const phantom = this.usingPhantom;

    this.board.addMeeple(spot.x, spot.y, featIdx, this.current, {
      big: spend?.id === 'big',
      kind: phantom ? 'phantom' : (spend?.id || null),
    });
    // The phantom comes out of its own supply of one and leaves the ordinary
    // followers untouched; everything else costs a follower.
    if (phantom) this.player.phantoms--;
    else this.player.meeples--;
    if (spend) this.player[spend.supply]--;
    this.useKind = null;

    if (spend?.id === 'shepherd') this.drawFlock(cell);

    const what = cell.type.feats[featIdx].type;
    const who = phantom ? 'their phantom' : (spend ? `their ${spend.name}` : null);
    this.say(spot.flying
      ? `${this.player.name} flies a follower out to the ${what} at (${spot.x}, ${spot.y}).`
      : `${this.player.name} claimed the ${what}${who ? ` with ${who}` : ''}.`);
    this.emit('meeple', { feat: featIdx, player: this.current, at: { x: spot.x + 0.5, y: spot.y + 0.5 } });

    // The phantom follows your ordinary follower in the same turn, onto a
    // different feature of the same tile. Offered rather than forced.
    if (!phantom && this.has('phantom') && this.player.phantoms > 0) {
      this.usingPhantom = true;
      if (this.meepleOptions().length) return true;   // stay in the meeple phase
      this.usingPhantom = false;
    } else {
      this.usingPhantom = false;
    }

    this.endTurn();
    return true;
  }

  skipMeeple() {
    if (this.phase !== 'meeple') return;
    this.usingPhantom = false;
    this.useKind = null;
    this.endTurn();
  }

  /**
   * Choose which follower the next claim spends, or clear the choice. The
   * plain follower is `null`.
   */
  useFigure(id) {
    const fig = FIGURE_BY_ID[id];
    if (!fig || !this.has(fig.mech) || this.player[fig.supply] <= 0) return false;
    if (this.usingPhantom) return false;          // the phantom is its own piece
    this.useKind = this.useKind === id ? null : id;
    return true;
  }

  toggleBig() { return this.useFigure('big'); }

  // The big follower had its own flag before there were others; keep the name
  // working, because the modes, the bot and the tests all still say it.
  get useBig() { return this.useKind === 'big'; }
  set useBig(v) {
    if (v) this.useKind = 'big';
    else if (this.useKind === 'big') this.useKind = null;
  }

  // --- bridges -----------------------------------------------------------------

  /**
   * Where a bridge could stand: the tile just laid or one of its four
   * neighbours, spanning N–S or E–W. Both spanned edges must be open country
   * on the tile itself (a bridge stands on the field, never on a wall), and a
   * neighbour across either end has to be something a road can meet.
   */
  bridgeSpots() {
    if (!this.has('bridge') || this.phase !== 'meeple' || !this.lastPlaced) return [];
    if (this.player.bridges <= 0) return [];
    const out = [];
    const { x, y } = this.lastPlaced;
    const cells = [this.board.get(x, y)];
    for (let sdir = 0; sdir < 4; sdir++) cells.push(this.board.neighbor(x, y, sdir));
    for (const cell of cells) {
      if (!cell || cell.type.bridged) continue;
      for (const axis of [[0, 2], [1, 3]]) {
        if (!axis.every((w) => this.board.edgeAt(cell, w) === 'f')) continue;
        let joins = 0, blocked = false;
        for (const w of axis) {
          const nb = this.board.neighbor(cell.x, cell.y, w);
          if (!nb) continue;
          const theirs = this.board.edgeAt(nb, (w + 2) % 4);
          if (theirs === 'r') joins++;
          else if (theirs !== '*' && theirs !== '~') blocked = true;
        }
        if (blocked) continue;
        out.push({ cell, axis, joins });
      }
    }
    return out.sort((a, b) => b.joins - a.joins);
  }

  canBuildBridge() { return this.bridgeSpots().length > 0; }

  /**
   * Raise the bridge. The cell keeps its identity — the bridge is a derived
   * copy of its tile with one elevated road appended after everything else,
   * so nothing standing on the tile moves and the field underneath is never
   * divided. `replace` rebuilds connectivity, which is what joins the new
   * road to whatever its two ends meet.
   */
  buildBridge(at = null) {
    const spots = this.bridgeSpots();
    const spot = at
      ? spots.find((o) => o.cell.x === at.x && o.cell.y === at.y)
      : spots[0];
    if (!spot) return false;
    const { cell, axis } = spot;
    const canon = axis.map((w) => (w - cell.rot + 4) % 4);
    this.player.bridges--;
    this.board.replace(cell.x, cell.y, bridgedType(cell.type, canon));
    this.say(`${this.player.name} throws a bridge ${axis[0] === 0 ? 'north to south' : 'east to west'} across (${cell.x}, ${cell.y}).`);
    this.emit('place', { cells: [cell] });
    // The bridge can close the road it just completed, there and then.
    for (const d of this.board.completedBy(cell.x, cell.y)) {
      this.noteClosure(d, this.current);
      this.m.onClosed(d, this.current);
    }
    return true;
  }

  // --- the big top -------------------------------------------------------------

  /**
   * The circus moves on, and the old pitch pays out on its way: 2 for every
   * follower in the eight tiles around where the tent stood.
   */
  moveBigTop(cell) {
    const old = this.bigTop;
    this.bigTop = { x: cell.x, y: cell.y };
    if (!old) { this.say('The circus pitches its tent.'); return; }
    const paid = new Map();
    for (const c of this.cellsAround(old)) {
      if (!c.meeple) continue;
      paid.set(c.meeple.player, (paid.get(c.meeple.player) || 0) + 2);
    }
    for (const [seat, pts] of paid) {
      this.players[seat].score += pts;
      this.say(`The circus moves on — ${this.players[seat].name} +${pts} for the crowd it drew.`);
      this.onPaid(seat, pts);
    }
    if (!paid.size) this.say('The circus moves on to fresher ground.');
  }

  // --- the dragon --------------------------------------------------------------

  /**
   * Six tiles of rampage. The printed game hands each step to the players in
   * turn; here the beast hunts on its own — always toward the nearest
   * follower, never doubling back, never onto the fairy's tile.
   */
  rampage() {
    const visited = new Set([`${this.dragon.x},${this.dragon.y}`]);
    let ate = 0;
    for (let step = 0; step < 6; step++) {
      const opts = [];
      for (let sdir = 0; sdir < 4; sdir++) {
        const nb = this.board.neighbor(this.dragon.x, this.dragon.y, sdir);
        if (!nb || visited.has(`${nb.x},${nb.y}`)) continue;
        if (this.fairy && nb.x === this.fairy.x && nb.y === this.fairy.y) continue;
        opts.push(nb);
      }
      if (!opts.length) break;
      const dist = (c) => {
        let best = 99;
        for (const o of this.board.cells.values()) {
          if (!o.meeple) continue;
          best = Math.min(best, Math.abs(o.x - c.x) + Math.abs(o.y - c.y));
        }
        return best;
      };
      opts.sort((a, b) => dist(a) - dist(b));
      const to = opts[0];
      this.dragon = { x: to.x, y: to.y };
      visited.add(`${to.x},${to.y}`);
      if (to.meeple) { this.sendHome(to); ate++; }
      if (to.pig) { this.players[to.pig.player].pigs++; to.pig = null; ate++; }
    }
    this.say(`The dragon rampages${ate ? ` and devours ${ate} figure${ate > 1 ? 's' : ''}` : ', finding nobody'}.`);
    this.emit('warp', { at: { x: this.dragon.x + 0.5, y: this.dragon.y + 0.5 } });
  }

  // --- the fairy ---------------------------------------------------------------

  canCallFairy() {
    if (!this.has('fairy') || this.phase !== 'meeple') return false;
    return this.myMeeples().length > 0;
  }

  /** The fairy goes to stand guard beside one of your followers. */
  callFairy() {
    if (!this.canCallFairy()) return false;
    const mine = this.myMeeples();
    // She guards whoever is nearest the dragon; with no dragon, the first.
    const pick = this.dragon
      ? mine.sort((a, b) => (Math.abs(a.x - this.dragon.x) + Math.abs(a.y - this.dragon.y))
        - (Math.abs(b.x - this.dragon.x) + Math.abs(b.y - this.dragon.y)))[0]
      : mine[0];
    this.fairy = { x: pick.x, y: pick.y };
    this.say(`The fairy alights beside ${this.player.name}'s follower.`);
    this.endTurn();
    return true;
  }

  // --- the tower ---------------------------------------------------------------

  towerBases() {
    if (!this.has('tower') || this.phase !== 'meeple' || this.player.floors <= 0) return [];
    return [...this.board.cells.values()].filter((c) => hasMark(c, 'towerbase'));
  }

  canBuildTower() { return this.towerBases().length > 0; }

  /**
   * A floor on a tower, and a capture with its new reach: the tower's own
   * tile plus as many tiles as it has floors, straight out in each of the four
   * directions. The engine takes the most valuable enemy follower in range.
   */
  buildTower(at = null) {
    const bases = this.towerBases();
    if (!bases.length) return false;
    let cell = at ? bases.find((c) => c.x === at.x && c.y === at.y) : null;
    if (!cell) {
      // Build where it hurts: the base with the most enemies in future reach.
      cell = bases.sort((a, b) => this.towerThreat(b) - this.towerThreat(a))[0];
    }
    cell.tower = (cell.tower || 0) + 1;
    this.player.floors--;

    const reach = [cell];
    for (let sdir = 0; sdir < 4; sdir++) {
      let c = cell;
      for (let step = 0; step < cell.tower; step++) {
        c = this.board.neighbor(c.x, c.y, sdir);
        if (!c) break;
        reach.push(c);
      }
    }
    const prey = reach.filter((c) => c.meeple && c.meeple.player !== this.current
      && (!this.fairy || c.x !== this.fairy.x || c.y !== this.fairy.y));
    if (prey.length) {
      const victim = prey.sort((a, b) => (b.meeple.big ? 2 : 1) - (a.meeple.big ? 2 : 1))[0];
      const m = victim.meeple;
      const d = m.feat != null ? this.board.featureOf(victim.x, victim.y, m.feat) : null;
      if (d) d.meeples = d.meeples.filter((o) => !(o.x === victim.x && o.y === victim.y));
      victim.meeple = null;
      this.prisoners.push({ holder: this.current, owner: m.player, big: m.big, kind: m.kind });
      this.say(`${this.player.name}'s tower (${cell.tower} floor${cell.tower > 1 ? 's' : ''}) seizes ${this.players[m.player].name}'s follower.`);
    } else {
      this.say(`${this.player.name} adds a floor to the tower.`);
    }
    this.endTurn();
    return true;
  }

  towerThreat(cell) {
    const h = (cell.tower || 0) + 1;
    let n = 0;
    for (let sdir = 0; sdir < 4; sdir++) {
      let c = cell;
      for (let step = 0; step < h; step++) {
        c = this.board.neighbor(c.x, c.y, sdir);
        if (!c) break;
        if (c.meeple && c.meeple.player !== this.current) n++;
      }
    }
    return n;
  }

  /** Ransoms come due at the start of your turn: 3 points a head, paid across. */
  payRansoms() {
    if (!this.has('tower')) return;
    for (let i = this.prisoners.length - 1; i >= 0; i--) {
      const pr = this.prisoners[i];
      if (pr.owner !== this.current || this.player.score < 3) continue;
      this.player.score -= 3;
      this.players[pr.holder].score += 3;
      if (pr.kind === 'phantom') this.player.phantoms++; else this.player.meeples++;
      if (pr.big) this.player.big++;
      if (pr.kind === 'mayor') this.player.mayors++;
      if (pr.kind === 'abbot') this.player.abbots++;
      if (pr.kind === 'shepherd') this.player.shepherds++;
      this.prisoners.splice(i, 1);
      this.say(`${this.player.name} pays 3 ransom to ${this.players[pr.holder].name}.`);
    }
  }

  // --- the ferries -------------------------------------------------------------

  /** The ferry joins two of the lake's road ends — the pair that does the most. */
  placeFerry(cell) {
    const stubs = cell.type.feats
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => f.type === 'road');
    if (stubs.length < 2) return;
    // Prefer joining two stubs that each continue into placed neighbours; the
    // printed choice belongs to the placer, folded into this preference.
    const continues = ({ f, i }) => {
      const side = (f.sides[0] + cell.rot) % 4;
      return this.board.neighbor(cell.x, cell.y, side) ? 1 : 0;
    };
    stubs.sort((a, b) => continues(b) - continues(a));
    const [a, b] = stubs;
    this.board.addLink(`${cell.x},${cell.y}#${a.i}`, `${cell.x},${cell.y}#${b.i}`);
    cell.ferry = [a.i, b.i];
    this.say('The ferry casts off, joining two roads across the lake.');
  }

  // --- shepherds & sheep -------------------------------------------------------

  /** Pull a token from the bag: sheep join the flock, a wolf scatters it. */
  drawFlock(cell) {
    if (!this.flockBag?.length) return;
    const tok = this.flockBag.pop();
    if (tok === 'wolf') {
      const flock = cell.flock || [];
      this.flockBag.push(...flock, 'wolf');
      // A rough reshuffle: the bag is opaque, not ordered.
      for (let i = this.flockBag.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [this.flockBag[i], this.flockBag[j]] = [this.flockBag[j], this.flockBag[i]];
      }
      cell.flock = [];
      if (cell.meeple?.kind === 'shepherd') this.sendHome(cell);
      this.say('A wolf! The flock scatters and the shepherd runs for home.');
    } else {
      cell.flock = [...(cell.flock || []), tok];
      this.say(`The flock grows by ${tok} — ${cell.flock.reduce((a, b) => a + b, 0)} sheep in all.`);
    }
  }

  /** Your shepherd, if the tile just laid extended the field he stands in. */
  shepherdExtended() {
    if (!this.has('sheep') || this.phase !== 'meeple' || !this.lastPlaced || this.sheepActed) return null;
    for (const c of this.board.cells.values()) {
      if (!c.meeple || c.meeple.player !== this.current || c.meeple.kind !== 'shepherd') continue;
      const d = this.board.featureOf(c.x, c.y, c.meeple.feat);
      if (d && this.board.cellsOf(d).some((o) => o.x === this.lastPlaced.x && o.y === this.lastPlaced.y)) return c;
    }
    return null;
  }

  growFlock() {
    const c = this.shepherdExtended();
    if (!c) return false;
    this.sheepActed = true;
    this.drawFlock(c);
    return true;
  }

  herdFlock() {
    const c = this.shepherdExtended();
    if (!c) return false;
    this.sheepActed = true;
    const pts = (c.flock || []).reduce((a, b) => a + b, 0);
    this.flockBag.push(...(c.flock || []));
    c.flock = [];
    if (pts > 0) {
      this.player.score += pts;
      this.emit('score', { points: pts, players: [this.current], at: { x: c.x + 0.5, y: c.y + 0.5 } });
    }
    this.sendHome(c);
    this.say(`${this.player.name} herds the flock home — +${pts}.`);
    return true;
  }

  // --- the barn ----------------------------------------------------------------

  /** Fields you farm, where a barn could go. */
  barnSpots() {
    if (!this.has('barn') || this.phase !== 'meeple' || this.player.barns <= 0) return [];
    return [...this.board.cells.values()].filter((c) => c.meeple
      && c.meeple.player === this.current && !c.meeple.kind && !c.barn
      && c.type.feats[c.meeple.feat]?.type === 'field');
  }

  canPlaceBarn() { return this.barnSpots().length > 0; }

  /**
   * The barn pays the field out immediately at today's rate and sends every
   * farmer home — then keeps the field for good, at a point more per city,
   * settled at the end.
   */
  placeBarn(at = null) {
    const spots = this.barnSpots();
    const c = at ? spots.find((o) => o.x === at.x && o.y === at.y) : spots[0];
    if (!c) return false;
    const field = this.board.featureOf(c.x, c.y, c.meeple.feat);
    if (!field) return false;
    this.player.barns--;
    c.barn = { player: this.current };

    const per = this.rules.farmPerCity;
    const pigs = this.has('pig') ? pigsByField(this.board) : null;
    for (const pay of farmPayouts(this.board, per, pigs)) {
      if (pay.field !== field) continue;
      this.players[pay.player].score += pay.points;
      this.say(`The barn settles the farm early — ${this.players[pay.player].name} +${pay.points}.`);
      this.onPaid(pay.player, pay.points);
    }
    for (const cell of this.board.cellsOf(field)) {
      if (cell.meeple && cell.type.feats[cell.meeple.feat]?.type === 'field'
        && cell.meeple.kind !== 'shepherd') this.sendHome(cell);
      if (cell.pig) { this.players[cell.pig.player].pigs++; cell.pig = null; }
    }
    this.say(`${this.player.name} raises a barn over the field.`);
    this.endTurn();
    return true;
  }

  // --- the acrobats ------------------------------------------------------------

  /** Rings on or beside the tile just laid, with room in the pyramid. */
  pyramidSpots() {
    if (!this.has('acrobats') || this.phase !== 'meeple' || !this.lastPlaced) return [];
    if (this.player.meeples <= 0) return [];
    const { x, y } = this.lastPlaced;
    const spots = [this.board.get(x, y)];
    for (let sdir = 0; sdir < 4; sdir++) spots.push(this.board.neighbor(x, y, sdir));
    return spots.filter((c) => c && hasMark(c, 'ring') && (c.pyramid?.length || 0) < 3);
  }

  canJoinPyramid() { return this.pyramidSpots().length > 0; }

  /** Climb on. The third acrobat completes the pyramid and everybody scores 5. */
  joinPyramid(at = null) {
    const spots = this.pyramidSpots();
    const c = at ? spots.find((o) => o.x === at.x && o.y === at.y) : spots[0];
    if (!c) return false;
    c.pyramid = [...(c.pyramid || []), this.current];
    this.player.meeples--;
    this.say(`${this.player.name} climbs onto the pyramid.`);
    if (c.pyramid.length >= 3) {
      for (const seat of c.pyramid) {
        this.players[seat].score += 5;
        this.players[seat].meeples++;
        this.emit('score', { points: 5, players: [seat], at: { x: c.x + 0.5, y: c.y + 0.5 } });
      }
      this.say('The pyramid stands three high — 5 apiece, and the troupe bows out.');
      c.pyramid = [];
    }
    this.endTurn();
    return true;
  }

  // --- the bathhouse -----------------------------------------------------------

  canBathe() {
    if (!this.has('barbers') || this.phase !== 'meeple' || !this.lastPlaced) return false;
    const cell = this.board.get(this.lastPlaced.x, this.lastPlaced.y);
    if (!cell || !hasMark(cell, 'bath')) return false;
    return this.myMeeples().some((c) => !c.meeple.kind)
      && this.meepleOptions().some((o) => o.x === this.lastPlaced.x && o.y === this.lastPlaced.y);
  }

  /** Move one of your followers from wherever it is to the baths' own tile. */
  bathe() {
    if (!this.canBathe()) return false;
    const from = this.myMeeples().find((c) => !c.meeple.kind);
    const to = this.meepleOptions().find((o) => o.x === this.lastPlaced.x && o.y === this.lastPlaced.y);
    if (!from || !to) return false;
    this.sendHome(from);
    this.player.meeples--;
    this.board.addMeeple(to.x, to.y, to.i, this.current);
    this.say(`${this.player.name}'s follower takes the waters and comes out somewhere better.`);
    this.endTurn();
    return true;
  }

  // --- the robbers ------------------------------------------------------------

  /** Post your robber on an opponent; half of the next thing they score is yours. */
  robPlace(victim) {
    if (this.phase !== 'rob') return false;
    if (victim === this.current || !this.players[victim]) return false;
    if (this.player.robbers <= 0) return false;
    this.player.robbers--;
    this.thieves.push({ thief: this.current, victim });
    this.say(`${this.player.name} posts a robber on ${this.players[victim].name}'s trail.`);
    this.phase = 'place';
    this.afterPlace(this.lastPlaced);
    return true;
  }

  robSkip() {
    if (this.phase !== 'rob') return false;
    this.phase = 'place';
    this.afterPlace(this.lastPlaced);
    return true;
  }

  robAuto() {
    if (this.phase !== 'rob') return false;
    const marks = this.players
      .map((p, i) => ({ i, score: p.score }))
      .filter((o) => o.i !== this.current
        && !this.thieves.some((t) => t.thief === this.current && t.victim === o.i))
      .sort((a, b) => b.score - a.score);
    return marks.length ? this.robPlace(marks[0].i) : this.robSkip();
  }

  /**
   * A player has just been paid during play. The robbers on their trail take
   * half each (the victim keeps everything), and a score that lands exactly on
   * a multiple of five brings a message.
   */
  onPaid(who, pts) {
    if (pts <= 0) return;
    if (this.has('robbers')) {
      const due = this.thieves.filter((t) => t.victim === who);
      this.thieves = this.thieves.filter((t) => t.victim !== who);
      for (const t of due) {
        const cut = Math.ceil(pts / 2);
        this.players[t.thief].score += cut;
        this.players[t.thief].robbers++;
        this.say(`${this.players[t.thief].name}'s robber takes ${cut} from ${this.players[who].name}'s winnings.`);
      }
    }
    if (this.has('wonders')) {
      for (const gate of [15, 20, 25]) {
        if (this.players[who].score < gate) continue;
        if (this.wondersTaken?.has(gate)) continue;
        (this.wondersTaken ??= new Set()).add(gate);
        this.players[who].wonders++;
        this.say(`${this.players[who].name} passes ${gate} first and raises a wonder.`);
      }
    }
    if (this.has('messengers') && this.players[who].score > 0
      && this.players[who].score % 5 === 0) {
      // The engine reads the message and takes the better of the printed
      // choices: a flat 2, or 2 per coat of arms in cities you hold.
      let shields = 0;
      for (const d of this.board.allComponents()) {
        if (d.type !== 'city' || !d.meeples.some((m) => m.player === who)) continue;
        shields += d.shields;
      }
      const gain = Math.max(2, 2 * shields);
      this.players[who].score += gain;
      this.say(`A message reaches ${this.players[who].name} — +${gain}.`);
    }
  }

  // --- gifts, revolts and fruit -----------------------------------------------

  /** Lengthening somebody else's feature is worth a small thank-you. */
  checkGift(cell) {
    if (this.giftDrawn) return;
    const generous = cell.type.feats.some((f, i) => {
      if (f.type !== 'road' && f.type !== 'city') return false;
      const d = this.board.featureOf(cell.x, cell.y, i);
      return d && d.tiles.size > 1 && d.meeples.length
        && !d.meeples.some((m) => m.player === this.current);
    });
    if (!generous) return;
    this.giftDrawn = true;
    if (this.rng() < 0.5) {
      this.player.score += 2;
      this.say(`${this.player.name} opens a gift — +2.`);
    } else {
      this.tilesLeft++;
      this.say(`${this.player.name} opens a gift — an extra tile this turn.`);
    }
  }

  /**
   * A revolt names a feature type. The active player's lone followers on it
   * flee home; any standing in pairs weather it for 2 apiece.
   */
  revolt(cell) {
    const kind = cell.type.marks.find((m) => m.kind === 'revolt')?.revolt;
    if (!kind) return;
    const mine = [...this.board.cells.values()].filter((c) => c.meeple
      && c.meeple.player === this.current
      && c.type.feats[c.meeple.feat]?.type === kind);
    let fled = 0, stood = 0;
    for (const c of mine) {
      const d = this.board.featureOf(c.x, c.y, c.meeple.feat);
      const allies = d ? d.meeples.filter((m) => m.player === this.current).length : 1;
      if (allies >= 2) { this.player.score += 2; stood++; } else { this.sendHome(c); fled++; }
    }
    if (fled || stood) {
      this.say(`Revolt in the ${kind === 'monastery' ? 'cloisters' : `${kind}s`} — `
        + `${fled ? `${fled} of ${this.player.name}'s followers flee` : ''}`
        + `${fled && stood ? ', ' : ''}${stood ? `${stood} stand firm for +${2 * stood}` : ''}.`);
    }
  }

  /** Fruit ripens: a tile laid beside a tree pays its placer, four times over. */
  checkFruit(cell) {
    for (let sdir = 0; sdir < 4; sdir++) {
      const nb = this.board.neighbor(cell.x, cell.y, sdir);
      if (!nb || !nb.fruitLeft) continue;
      nb.fruitLeft--;
      this.player.score += 1;
      this.say(`${this.player.name} picks fruit from the tree at (${nb.x}, ${nb.y}) — +1.`);
    }
  }

  // --- the mage and the witch -------------------------------------------------

  /**
   * Every unfinished road or city the chosen figure could stand on, occupied
   * or not — the magic figures don't care whose feature it is, only that it
   * is still open and that the other figure isn't already there.
   */
  magicTargets() {
    const other = this.magicPick === 'mage' ? this.witch : this.mage;
    const otherD = other && this.board.featureOf(other.x, other.y, other.feat);
    const out = [];
    const seen = new Set();
    for (const cell of this.board.cells.values()) {
      cell.type.feats.forEach((f, i) => {
        if (f.type !== 'road' && f.type !== 'city') return;
        const d = this.board.featureOf(cell.x, cell.y, i);
        if (!d || d.scored || d.open === 0 || d === otherD) return;
        const root = this.board.find(d.parts[0]);
        if (seen.has(root)) return;
        seen.add(root);
        out.push({ x: cell.x, y: cell.y, feat: i, type: f.type, d });
      });
    }
    return out;
  }

  /** Choose which figure the next magic click places. */
  pickMagic(kind) {
    if (this.phase !== 'magic') return false;
    this.magicPick = kind === 'witch' ? 'witch' : 'mage';
    return true;
  }

  /** Put the chosen figure on the unfinished road or city at (x, y). */
  magicAt(x, y) {
    if (this.phase !== 'magic') return false;
    const cell = this.board.get(x, y);
    if (!cell) return false;
    const spot = this.magicTargets().find((t) => {
      const d = this.board.featureOf(t.x, t.y, t.feat);
      return d && this.board.cellsOf(d).some((c) => c.x === x && c.y === y);
    });
    if (!spot) return false;
    this[this.magicPick] = { x: spot.x, y: spot.y, feat: spot.feat };
    this.say(`The ${this.magicPick} settles on the ${spot.type}.`);
    this.phase = 'meeple';
    this.afterMagic();
    return true;
  }

  /** No eligible home, or none wanted: the figure steps off the board. */
  magicSkip() {
    if (this.phase !== 'magic') return false;
    this[this.magicPick] = null;
    this.say(`The ${this.magicPick} is set aside.`);
    this.afterMagic();
    return true;
  }

  afterMagic() {
    this.phase = 'place';                // afterPlace decides the real next phase
    this.afterPlace(this.lastPlaced);
  }

  /**
   * The default: witch on an opponent's best feature, mage on your own, and
   * always SOME resolution — the eligible set depends on which figure is being
   * placed (the other one's feature is out of bounds), so each figure is tried
   * against its own set and the fallback is to stand a figure down.
   */
  magicAuto() {
    if (this.phase !== 'magic') return false;
    const mine = (d) => d.meeples.some((m) => m.player === this.current);
    const biggest = (list) => list.sort((a, b) => b.d.tiles.size - a.d.tiles.size)[0];
    for (const pick of ['witch', 'mage']) {
      this.magicPick = pick;
      const targets = this.magicTargets();
      if (!targets.length) continue;
      const wanted = pick === 'witch'
        ? targets.filter((t) => t.d.meeples.length && !mine(t.d))
        : targets.filter((t) => mine(t.d));
      const t = biggest(wanted.length ? wanted : targets);
      if (this.magicAt(t.x, t.y)) return true;
    }
    return this.magicSkip();
  }

  // --- crop circles -----------------------------------------------------------

  /** The feature type this circle is about — 'field', 'road' or 'city'. */
  cropKind() {
    const cell = this.lastPlaced && this.board.get(this.lastPlaced.x, this.lastPlaced.y);
    return cell?.type.marks.find((m) => m.kind === 'crop')?.crop || 'field';
  }

  /**
   * The circle resolves for every player at once, starting with whoever laid
   * it: each may add a follower beside one they already have of this kind, or
   * each must take one back. The choice belongs to the layer of the tile.
   */
  cropChoose(which) {
    if (this.phase !== 'crop') return false;
    const kind = this.cropKind();
    const seats = this.players.map((_, i) => (this.current + i) % this.players.length);
    for (const seat of seats) {
      const p = this.players[seat];
      const standing = [...this.board.cells.values()].filter((c) => c.meeple
        && c.meeple.player === seat
        && c.type.feats[c.meeple.feat]?.type === kind);
      if (which === 'add') {
        if (p.meeples <= 0 || !standing.length) continue;
        // Beside one of theirs: another tile of the same component with room.
        const c = standing[0];
        const d = this.board.featureOf(c.x, c.y, c.meeple.feat);
        const spot = d && this.board.cellsOf(d).find((o) => !o.meeple
          && this.board.featIndexOn(o, d) != null);
        if (!spot) continue;
        const idx = this.board.featIndexOn(spot, d);
        this.board.addMeeple(spot.x, spot.y, idx, seat);
        p.meeples--;
        this.say(`${p.name} slips another follower into the ${kind}.`);
      } else if (standing.length) {
        this.sendHome(standing[0]);
        this.say(`${p.name} takes a follower back from the ${kind}.`);
      }
    }
    this.phase = 'place';
    this.afterPlace(this.lastPlaced);
    return true;
  }

  cropAuto() {
    if (this.phase !== 'crop') return false;
    const kind = this.cropKind();
    const count = (seat) => [...this.board.cells.values()].filter((c) => c.meeple
      && c.meeple.player === seat && c.type.feats[c.meeple.feat]?.type === kind).length;
    const me = count(this.current);
    const best = Math.max(...this.players.map((_, i) => count(i)));
    return this.cropChoose(me > 0 && me >= best ? 'add' : 'remove');
  }

  /** Resolve whatever special phase is open, with the engine's defaults. */
  autoAct() {
    switch (this.phase) {
      case 'magic': return this.magicAuto();
      case 'crop': return this.cropAuto();
      case 'rob': return this.robAuto();
      default: return false;
    }
  }

  // --- the princess -----------------------------------------------------------

  /**
   * A princess laid into a city sends a knight already standing in it home.
   * Offered rather than forced, and only against a city that has someone in it.
   */
  princessTargets() {
    if (!this.has('princess') || this.phase !== 'meeple' || !this.lastPlaced) return [];
    const { x, y } = this.lastPlaced;
    const cell = this.board.get(x, y);
    if (!cell || !hasMark(cell, 'princess')) return [];
    const out = [];
    cell.type.feats.forEach((f, i) => {
      if (f.type !== 'city') return;
      const d = this.board.featureOf(x, y, i);
      if (!d) return;
      for (const m of d.meeples) out.push({ ...m, d });
    });
    return out;
  }

  canSendKnightHome() { return this.princessTargets().length > 0; }

  sendKnightHome(at = null) {
    const targets = this.princessTargets();
    const m = at ? targets.find((t) => t.x === at.x && t.y === at.y) : targets[0];
    if (!m) return false;
    const cell = this.board.get(m.x, m.y);
    if (cell) cell.meeple = null;
    m.d.meeples = m.d.meeples.filter((o) => !(o.x === m.x && o.y === m.y));
    const owner = this.players[m.player];
    if (m.kind === 'phantom') owner.phantoms++; else owner.meeples++;
    if (m.big) owner.big++;
    if (m.kind === 'mayor') owner.mayors++;
    if (m.kind === 'abbot') owner.abbots++;
    if (m.kind === 'shepherd') owner.shepherds++;
    this.say(`The princess sends ${owner.name}'s knight out of the city.`);
    this.endTurn();
    return true;
  }

  // --- the festival -----------------------------------------------------------

  /**
   * A festival tile lets you take one of your own followers back off the board
   * instead of claiming — anywhere, from anything, however well it was placed.
   */
  canCallHome() {
    if (!this.has('festival') || this.phase !== 'meeple' || !this.lastPlaced) return false;
    return hasMark(this.board.get(this.lastPlaced.x, this.lastPlaced.y), 'festival')
      && this.myMeeples().length > 0;
  }

  beginFestival() {
    if (!this.canCallHome()) return false;
    this.phase = 'recall';
    return true;
  }

  // --- the abbot --------------------------------------------------------------

  /**
   * The abbot may be called home on your turn INSTEAD of placing a follower,
   * and his monastery pays out as it stands rather than waiting to be
   * surrounded. That is the whole point of the piece: a cloister that is never
   * going to close still pays something.
   */
  myAbbots() {
    return [...this.board.cells.values()]
      .filter((c) => c.meeple && c.meeple.player === this.current && c.meeple.kind === 'abbot');
  }

  canRetireAbbot() {
    return this.has('abbot') && this.phase === 'meeple' && !this.usingPhantom
      && this.myAbbots().length > 0;
  }

  retireAbbot(at = null) {
    if (!this.canRetireAbbot()) return false;
    const cell = at
      ? this.myAbbots().find((c) => c.x === at.x && c.y === at.y)
      : this.myAbbots()[0];
    if (!cell) return false;
    const d = this.board.featureOf(cell.x, cell.y, cell.meeple.feat);
    if (!d) return false;

    const pts = 1 + this.board.surroundCount(cell.x, cell.y);
    this.player.score += pts;
    this.player.meeples++;
    this.player.abbots++;
    cell.meeple = null;
    d.meeples = d.meeples.filter((m) => !(m.x === cell.x && m.y === cell.y));
    this.say(`${this.player.name} calls the abbot home — the monastery pays ${pts}.`);
    this.emit('score', { points: pts, players: [this.current], at: { x: cell.x + 0.5, y: cell.y + 0.5 } });
    this.endTurn();
    return true;
  }

  // --- little buildings -------------------------------------------------------

  /** One building per tile, on the tile you just laid, on top of everything else. */
  canPlaceBuilding() {
    if (!this.has('littleBuildings') || this.phase !== 'meeple' || !this.lastPlaced) return false;
    const b = this.player.buildings;
    if (!b || (b.shed + b.house + b.tower) <= 0) return false;
    const cell = this.board.get(this.lastPlaced.x, this.lastPlaced.y);
    return !!cell && !cell.building;
  }

  placeBuilding() {
    if (!this.canPlaceBuilding()) return false;
    const b = this.player.buildings;
    const kind = b.tower > 0 ? 'tower' : b.house > 0 ? 'house' : 'shed';
    b[kind]--;
    const cell = this.board.get(this.lastPlaced.x, this.lastPlaced.y);
    cell.building = { player: this.current, kind };
    this.say(`${this.player.name} raises a little ${kind}.`);
    return true;
  }

  // --- the pig ----------------------------------------------------------------

  /**
   * The pig joins a field you are already farming and fattens it: every
   * completed city touching that field is worth one more, to you, provided you
   * still hold the majority when the game ends.
   */
  pigSpots() {
    if (!this.has('pig') || this.player.pigs <= 0) return [];
    const out = [];
    for (const cell of this.board.cells.values()) {
      if (cell.pig) continue;
      if (!cell.meeple || cell.meeple.player !== this.current) continue;
      const f = cell.type.feats[cell.meeple.feat];
      if (!f || f.type !== 'field') continue;
      out.push({ x: cell.x, y: cell.y, feat: cell.meeple.feat });
    }
    return out;
  }

  canPlacePig() { return this.phase === 'meeple' && this.pigSpots().length > 0; }

  placePig(at = null) {
    const spots = this.pigSpots();
    if (!spots.length) return false;
    const spot = at ? spots.find((s) => s.x === at.x && s.y === at.y) : spots[0];
    if (!spot) return false;
    this.board.get(spot.x, spot.y).pig = { player: this.current, feat: spot.feat };
    this.player.pigs--;
    this.say(`${this.player.name} turns a pig out onto the farm.`);
    this.emit('meeple', { player: this.current, at: { x: spot.x + 0.5, y: spot.y + 0.5 } });
    this.endTurn();
    return true;
  }

  // --- recalling a follower -------------------------------------------------

  canRecall() {
    return this.has('recall') && this.phase === 'meeple' && this.myMeeples().length > 0;
  }

  myMeeples() {
    return [...this.board.cells.values()].filter((c) => c.meeple && c.meeple.player === this.current);
  }

  beginRecall() {
    if (!this.canRecall()) return false;
    this.phase = 'recall';
    return true;
  }

  recallAt(x, y) {
    const cell = this.board.get(x, y);
    if (!cell || !cell.meeple || cell.meeple.player !== this.current) return false;
    const big = cell.meeple.big;
    cell.meeple = null;
    this.board.rebuild();
    this.player.meeples++;
    if (big) this.player.big++;
    this.say(`${this.player.name} calls a follower home from (${x}, ${y}).`);
    this.emit('meeple', { recall: true, player: this.current, at: { x: x + 0.5, y: y + 0.5 } });
    this.endTurn();
    return true;
  }

  // --- the wagon: followers walk on ----------------------------------------

  /**
   * When a feature scores, a follower on it may step along the road to the
   * next unclaimed, unfinished thing rather than going back to supply. Only
   * the player whose turn it is gets the choice; everyone else's followers go
   * home, because stopping the game to ask four people in turn is worse than
   * the rule is good.
   */
  offerWalk(d) {
    if (!this.has('wagon')) return false;
    const mine = d.meeples.filter((m) => m.player === this.current);
    if (!mine.length) return false;
    for (const m of mine) {
      const targets = walkTargets(this.board, m.x, m.y, d);
      if (!targets.length) continue;
      this.pendingWalk = { from: m, targets, big: !!m.big };
      this.phase = 'walk';
      return true;
    }
    return false;
  }

  walkTo(x, y) {
    const w = this.pendingWalk;
    if (!w) return false;
    const t = w.targets.find((o) => o.x === x && o.y === y);
    if (!t) return false;
    this.board.addMeeple(t.x, t.y, t.feat, this.current, w.big);
    this.player.meeples--;
    if (w.big) this.player.big--;
    this.say(`${this.player.name}'s follower walks on to the ${t.type} at (${x}, ${y}).`);
    this.pendingWalk = null;
    this.emit('step', {
      from: { x: w.from.x + 0.5, y: w.from.y + 0.5 },
      at: { x: x + 0.5, y: y + 0.5 },
      key: `meeple:${x},${y}`, player: this.current,
    });
    this.resumeTurn();
    return true;
  }

  declineWalk() {
    if (!this.pendingWalk) return false;
    this.pendingWalk = null;
    this.resumeTurn();
    return true;
  }

  /** Carry on from wherever a mid-turn prompt interrupted us. */
  resumeTurn() {
    this.finishTurnStep();
  }

  // --- movement (walking modes) --------------------------------------------

  selectPawn(pawn) {
    if (this.phase !== 'move' || !this.walker) return false;
    return this.m.select(pawn);
  }

  movePawn(x, y) {
    if (this.phase !== 'move' || !this.walker) return false;
    if (!this.m.moveSelected(x, y)) return false;
    if (this.phase === 'move') this.endTurn();
    return true;
  }

  restPawn() {
    if (this.phase !== 'move' || !this.m.rest) return false;
    if (!this.m.rest()) return false;
    this.endTurn();
    return true;
  }

  holdPosition() {
    if (this.phase !== 'move') return;
    this.say(`${this.player.name} holds position.`);
    this.endTurn();
  }

  enterCity() {
    if (this.phase !== 'move' || !this.m.enterCity) return false;
    if (!this.m.enterCity()) return false;
    this.endTurn();
    return true;
  }

  canEnterCity() { return this.phase === 'move' && !!this.m.canEnterCity?.(); }

  // --- interiors ------------------------------------------------------------

  interiorPlaceAt(x, y) {
    const inv = this.interior;
    if (this.phase !== 'interior-place' || !inv) return false;
    if (!inv.place(x, y)) return false;
    this.emit('place');
    this.phase = 'interior-move';
    return true;
  }

  interiorMoveTo(x, y) {
    const inv = this.interior;
    if (this.phase !== 'interior-move' || !inv) return false;
    if (!inv.moveTo(x, y)) return false;
    this.emit('step');
    this.m.interiorArrive(inv);
    this.endInteriorTurn(inv);
    return true;
  }

  interiorHold() {
    const inv = this.interior;
    if (inv) this.endInteriorTurn(inv);
  }

  canLeaveInterior() {
    const inv = this.interior;
    return !!inv && inv.atEntrance();
  }

  leaveInterior() {
    const inv = this.interior;
    if (!inv || !inv.atEntrance()) return false;
    this.m.leaveInterior(inv);
    this.nextPlayer();
    return true;
  }

  endInteriorTurn(inv) {
    if (this.interior === inv) {
      inv.draw();
      if (!inv.tile && inv.atEntrance()) this.m.leaveInterior(inv, 'has seen all there is to see here');
    }
    this.nextPlayer();
  }

  // --- ending a turn --------------------------------------------------------

  endTurn() {
    if (this.lastPlaced) {
      const { x, y } = this.lastPlaced;
      for (const d of this.board.completedBy(x, y)) {
        this.noteClosure(d, this.current);
        this.m.onClosed(d, this.current);
        if (this.offerWalk(d)) return;      // wait for them to pick a target
      }
    }
    this.finishTurnStep();
  }

  /**
   * One tile is done. Either deal the next one of this turn's allowance, or
   * pass play on.
   */
  finishTurnStep() {
    this.tilesLeft--;
    const more = this.riverActive || this.deck.length > 0 || (this.market?.length > 0);
    if (this.tilesLeft > 0 && more && this.phase !== 'over') {
      this.phase = 'place';
      return this.startTurn();
    }
    this.tilesLeft = 0;
    this.giftDrawn = false;
    this.sheepActed = false;
    this.m.endTurn();
    this.nextPlayer();
  }

  nextPlayer() {
    if (this.phase === 'over') return;
    const wrapped = this.current === this.players.length - 1;
    this.current = (this.current + 1) % this.players.length;
    this.turn++;
    if (wrapped) {
      this.round++;
      this.m.endRound();
      if (this.has('tide')) this.advanceTide();
    }
    if (this.phase === 'over') return;
    this.startTurn();
    if (this.phase !== 'over') this.emit('turn');
  }

  // --- the rising tide ------------------------------------------------------

  /**
   * The waterline is just a moving southern bound on the board, which is why
   * it needs no special case anywhere else: a tile that could only go
   * underwater is unplayable for the same reason a tile off the edge of Duel's
   * 5x5 is, and the existing draw loop already discards those.
   */
  setWaterline(y) {
    this.waterline = y;
    const b = this.spec.bounds;
    this.board.bounds = {
      minX: b?.minX ?? -Infinity, maxX: b?.maxX ?? Infinity,
      minY: b?.minY ?? -Infinity, maxY: Math.min(b?.maxY ?? Infinity, y - 1),
    };
  }

  advanceTide() {
    if (this.round % TIDE_PERIOD !== 1 || this.round <= 1) return;
    this.setWaterline(this.waterline - 1);
    const drowned = [];
    for (const cell of [...this.board.cells.values()]) {
      if (cell.y < this.waterline || cell.anchored) continue;
      drowned.push(cell);
    }
    // Say goodbye before they go: the effect needs the tile it's drawing.
    if (drowned.length) {
      this.emit('drown', {
        cells: drowned.map((c) => ({ x: c.x, y: c.y, type: c.type, rot: c.rot })),
      });
    }
    for (const cell of drowned) this.board.remove(cell.x, cell.y);
    if (drowned.length) {
      this.say(`The water rises to y=${this.waterline}. ${drowned.length} tile${drowned.length > 1 ? 's' : ''} lost.`);
      this.emit('deny');
      this.m.onDrowned(drowned);
    }
    if (this.board.size === 0) this.finish();
  }

  // --- hidden agendas -------------------------------------------------------

  dealAgendas() {
    const pool = AGENDAS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.players.forEach((p, i) => { p.agendas = [pool[i * 2 % pool.length], pool[(i * 2 + 1) % pool.length]]; });
  }

  scoreAgendas() {
    for (const p of this.players) {
      for (const a of p.agendas || []) {
        if (!a.test(this.board, p.id)) continue;
        p.score += a.points;
        this.say(`Agenda — ${p.name}: "${a.text}" +${a.points}`);
      }
    }
  }

  // --- scoring --------------------------------------------------------------

  /** Track who finished the biggest city and the longest road. */
  noteClosure(d, closer) {
    if (closer == null) return;
    if (d.type === 'city' && (!this.crown.city || d.tiles.size > this.crown.city)) {
      this.crown.city = d.tiles.size;
      this.crown.cityBy = closer;
    }
    if (d.type === 'road' && (!this.crown.road || d.tiles.size > this.crown.road)) {
      this.crown.road = d.tiles.size;
      this.crown.roadBy = closer;
    }
    if (this.has('goods')) {
      for (const g of goodsOn(this.board, d)) {
        this.players[closer].goods[g]++;
        this.say(`${this.players[closer].name} takes the ${g} from the city.`);
      }
    }
  }

  /**
   * Where a component sits, for anything that wants to point at it — the score
   * numbers that float off the board, and the flash that says which tiles the
   * points came from. Returns null for a component with nothing left on the
   * board, which a drowned or lifted one can be.
   */
  spotOf(d) {
    const cells = this.board.cellsOf(d);
    if (!cells.length) return null;
    return {
      at: {
        x: cells.reduce((s, c) => s + c.x, 0) / cells.length + 0.5,
        y: cells.reduce((s, c) => s + c.y, 0) / cells.length + 0.5,
      },
      cells: cells.map((c) => ({ x: c.x, y: c.y })),
    };
  }

  /**
   * What a component pays, with every scoring mechanic folded in: the water a
   * city sits beside, and the inn or cathedral on it.
   */
  valueOf(d, final) {
    // A mode that scores a feature type its own way says so; anything it
    // doesn't have an opinion about falls through to the board's rules.
    const own = this.m.valueOf?.(d, final);
    let pts = own == null ? this.board.value(d, final, { pennants: this.has('pennants') }) : own;

    // A feature whose whole layer has been switched off pays nothing, for the
    // rare case where one exists anyway — a mode's seed tile, mostly.
    if (this.offFeatures.has(d.type)) return 0;

    const inns = this.has('inns'), cathedrals = this.has('cathedrals');
    if (inns || cathedrals) {
      const ic = innsAndCathedrals(this.board, d, final, { inns, cathedrals });
      if (ic.void) return 0;
      pts = Math.round(pts * ic.mult);
    }
    if (d.type === 'city') {
      const { lakes, rivers } = this.board.adjacentWater(d);
      pts += lakes * WATER.lake + rivers * WATER.river;
    }
    if (this.has('vineyards')) pts += vineyardBonus(this.board, d);
    // A regional monastery left unfinished commands its row and column: 1 per
    // tile in the unbroken runs, plus itself — taken when that beats the
    // ordinary count, since the printed prior would have chosen it.
    if (final && d.type === 'monastery' && d.open === 0
      && (this.has('monasteries') || this.has('japanese'))) {
      const cell = this.board.get(d.at.x, d.at.y);
      if (cell && ((this.has('monasteries') && hasMark(cell, 'special'))
        || (this.has('japanese') && hasMark(cell, 'pagoda')))) {
        let runs = 0;
        for (let sdir = 0; sdir < 4; sdir++) {
          let c = cell;
          for (;;) {
            c = this.board.neighbor(c.x, c.y, sdir);
            if (!c) break;
            runs++;
          }
        }
        pts = Math.max(pts, 1 + runs);
      }
    }
    if (this.has('signposts') && d.type === 'road') {
      pts += 2 * this.board.marksOn(d).filter((m) => m.kind === 'signpost').length;
    }

    // The magic figures: the mage adds a point per tile to whatever he stands
    // on, the witch halves whatever she does. A besieged city is halved too —
    // and the witch's arithmetic on top of a siege is exactly as brutal as it
    // sounds, which is why nobody plays them together twice.
    if (this.has('mageWitch')) {
      const md = this.mage && this.board.featureOf(this.mage.x, this.mage.y, this.mage.feat);
      if (md === d) pts += d.tiles.size;
    }
    if (this.has('besiegers') && d.type === 'city'
      && this.board.marksOn(d).some((m) => m.kind === 'siege')) {
      pts = Math.ceil(pts / 2);
    }
    if (this.has('mageWitch')) {
      const wd = this.witch && this.board.featureOf(this.witch.x, this.witch.y, this.witch.feat);
      if (wd === d) pts = Math.ceil(pts / 2);
    }
    return pts;
  }

  /** Classic payout: majority of followers, or the closer when meeples are off. */
  award(d, final, closer = null) {
    const pts = this.valueOf(d, final);
    let winners;
    if (this.useMeeples) winners = this.board.majority(d, { hills: this.has('hills') });
    else winners = final || closer == null ? [] : [closer];

    if (winners.length && pts > 0) {
      for (const p of winners) this.players[p].score += pts;
      // The teacher: rides whoever last earned him, pays 2 on their next
      // scored feature, and retires to the schoolhouse.
      if (!final && this.has('school') && this.teacher != null && winners.includes(this.teacher)) {
        this.players[this.teacher].score += 2;
        this.say(`The teacher's lesson pays ${this.players[this.teacher].name} +2, and he returns to the school.`);
        this.teacher = null;
      }
      if (!final && this.has('school') && d.type === 'road'
        && this.board.marksOn(d).some((m) => m.kind === 'school')) {
        this.teacher = winners[0];
        this.say(`${this.players[winners[0]].name} closes the school road and the teacher follows them out.`);
      }
      if (!final) for (const p of winners) this.onPaid(p, pts);
      const who = winners.map((p) => this.players[p].name).join(' & ');
      const n = d.tiles.size;
      this.say(`${final ? 'Endgame: ' : ''}${d.type} of ${n} tile${n > 1 ? 's' : ''} → ${who} +${pts}`);
      this.emit('score', { points: pts, players: winners, ...this.spotOf(d) });
    } else if (!final && !winners.length) {
      this.say(`A ${d.type} closed with nobody on it.`);
    }
    if (!final && this.has('fairy') && this.fairy) {
      const fc = this.board.get(this.fairy.x, this.fairy.y);
      const fd = fc?.meeple && fc.meeple.feat != null
        ? this.board.featureOf(fc.x, fc.y, fc.meeple.feat) : null;
      if (fd === d && fc.meeple) {
        this.players[fc.meeple.player].score += 3;
        this.say(`The fairy's favour — ${this.players[fc.meeple.player].name} +3.`);
      }
    }

    // The tile-symbol payouts ride on the closure, before the followers go
    // home — the watchtower in particular counts the crowd still standing.
    if (!final) {
      if (this.has('goldmines')) this.collectGold(d, winners);
      if (this.has('watchtowers')) this.watchBonus(d);
      if (this.has('cult') && d.type === 'monastery') this.resolveCult(d);
    }
    // A magic figure's feature has scored: the figure steps off.
    if (this.mage && this.board.featureOf(this.mage.x, this.mage.y, this.mage.feat) === d) this.mage = null;
    if (this.witch && this.board.featureOf(this.witch.x, this.witch.y, this.witch.feat) === d) this.witch = null;

    if (!final && this.useMeeples) {
      for (const m of this.board.reclaim(d)) {
        // A phantom goes back to being a phantom; everything else gives back a
        // follower, plus whatever piece of office it was carrying.
        if (m.kind === 'phantom') this.players[m.player].phantoms++;
        else this.players[m.player].meeples++;
        if (m.big) this.players[m.player].big++;
        if (m.kind === 'mayor') this.players[m.player].mayors++;
        if (m.kind === 'abbot') this.players[m.player].abbots++;
        if (m.kind === 'shepherd') this.players[m.player].shepherds++;
      }
    }
  }

  /**
   * The farms, once, at the very end. A field pays for the completed cities
   * standing on it — three each now, four under the original rules — to
   * whoever has the most farmers lying in it, ties included.
   */
  scoreFarms() {
    const per = this.rules.farmPerCity;
    const pigs = this.has('pig') ? pigsByField(this.board) : null;
    const barned = new Set();
    if (this.has('barn')) {
      for (const cell of this.board.cells.values()) {
        if (!cell.barn) continue;
        const i = cell.type.feats.findIndex((f) => f.type === 'field');
        const d = i >= 0 && this.board.featureOf(cell.x, cell.y, i);
        if (!d) continue;
        barned.add(d);
        const cities = citiesFed(this.board, d).size;
        if (!cities) continue;
        const pts = cities * (per + 1);
        this.players[cell.barn.player].score += pts;
        this.say(`The barn's field feeds ${cities} cit${cities === 1 ? 'y' : 'ies'} at ${per + 1} each → ${this.players[cell.barn.player].name} +${pts}.`);
      }
    }
    for (const { field, player, points, cities, per: rate } of farmPayouts(this.board, per, pigs)) {
      if (barned.has(field)) continue;
      this.players[player].score += points;
      this.say(`Farm of ${field.tiles.size} feeding ${cities} cit${cities === 1 ? 'y' : 'ies'}`
        + `${rate > per ? ' (pig)' : ''}`
        + ` → ${this.players[player].name} +${points}`);
      const spot = this.spotOf(field);
      if (spot) this.emit('score', { points, players: [player], ...spot });
    }
  }

  /** The ingots on a closed feature go to whoever held it, dealt round. */
  collectGold(d, winners) {
    if (!winners.length) return;
    const cells = d.type === 'monastery' ? this.cellsAround(d.at) : this.board.cellsOf(d);
    let pot = 0;
    for (const c of cells) { pot += c.gold || 0; c.gold = 0; }
    if (!pot) return;
    for (let i = 0; i < pot; i++) this.players[winners[i % winners.length]].ingots++;
    this.say(`${winners.map((w) => this.players[w].name).join(' & ')} take${winners.length > 1 ? '' : 's'} ${pot} gold ingot${pot > 1 ? 's' : ''}.`);
  }

  cellsAround(at) {
    const out = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const c = this.board.get(at.x + dx, at.y + dy);
        if (c) out.push(c);
      }
    }
    return out;
  }

  /**
   * Watchtowers: a follower standing on the tower tile of the feature that
   * just closed is paid 2 for every follower in sight of the tower — itself
   * included, whoever they belong to.
   */
  watchBonus(d) {
    for (const cell of this.board.cellsOf(d)) {
      if (!hasMark(cell, 'watch') || !cell.meeple) continue;
      if (this.board.featureOf(cell.x, cell.y, cell.meeple.feat) !== d) continue;
      const seen = this.cellsAround({ x: cell.x, y: cell.y }).filter((c) => c.meeple).length;
      const pts = 2 * seen;
      if (!pts) continue;
      this.players[cell.meeple.player].score += pts;
      this.say(`The watchtower pays ${this.players[cell.meeple.player].name} +${pts}.`);
      this.emit('score', { points: pts, players: [cell.meeple.player], at: { x: cell.x + 0.5, y: cell.y + 0.5 } });
    }
  }

  /**
   * The cult race: a shrine and a monastery within sight of each other are
   * rivals, and the one that closes first takes everything — the loser is
   * voided on the spot, its keeper going home with nothing.
   */
  resolveCult(d) {
    const winner = this.board.get(d.at.x, d.at.y);
    if (!winner) return;
    const isShrine = hasMark(winner, 'cult');
    for (const c of this.cellsAround(d.at)) {
      if (c === winner) continue;
      const i = c.type.feats.findIndex((f) => f.type === 'monastery');
      if (i < 0 || hasMark(c, 'cult') === isShrine) continue;
      const rival = this.board.featureOf(c.x, c.y, i);
      if (!rival || rival.scored) continue;
      this.board.markScored(rival);
      const lost = rival.meeples.length;
      for (const m of this.board.reclaim(rival)) {
        if (m.kind === 'phantom') this.players[m.player].phantoms++;
        else this.players[m.player].meeples++;
        if (m.big) this.players[m.player].big++;
        if (m.kind === 'abbot') this.players[m.player].abbots++;
      }
      this.say(`The ${isShrine ? 'shrine' : 'monastery'} closes first — the ${isShrine ? 'monastery' : 'shrine'} next door pays nothing${lost ? ' and its keeper goes home empty-handed' : ''}.`);
    }
  }

  /** What the collected ingots are worth: the more you mined, the purer. */
  scoreIngots() {
    for (const p of this.players) {
      if (!p.ingots) continue;
      const per = p.ingots <= 3 ? 1 : p.ingots <= 6 ? 2 : p.ingots <= 9 ? 3 : 4;
      const pts = p.ingots * per;
      p.score += pts;
      this.say(`${p.name}'s ${p.ingots} ingot${p.ingots > 1 ? 's' : ''} assay at ${per} each → +${pts}.`);
    }
  }

  /** Little buildings: what each one placed is worth at the end. */
  scoreBuildings() {
    const worth = { shed: 1, house: 2, tower: 3 };
    for (const cell of this.board.cells.values()) {
      if (!cell.building) continue;
      const pts = worth[cell.building.kind] || 1;
      this.players[cell.building.player].score += pts;
    }
    this.say('The little buildings are counted.');
  }

  scoreGoods() {
    for (const g of GOODS) {
      const best = Math.max(...this.players.map((p) => p.goods[g]));
      if (best <= 0) continue;
      const winners = this.players.filter((p) => p.goods[g] === best);
      for (const p of winners) p.score += RULES.goodsBonus;
      this.say(`${g}: ${winners.map((p) => p.name).join(' & ')} +${RULES.goodsBonus}`);
    }
  }

  scoreCrown() {
    const { cities, roads } = crownAndRoad(this.board);
    if (this.has('king') && this.crown.cityBy != null && cities) {
      this.players[this.crown.cityBy].score += cities;
      this.say(`The King (largest city, ${this.crown.city} tiles) — ${this.players[this.crown.cityBy].name} +${cities}`);
    }
    if (this.has('robberBaron') && this.crown.roadBy != null && roads) {
      this.players[this.crown.roadBy].score += roads;
      this.say(`The Robber Baron (longest road, ${this.crown.road} tiles) — ${this.players[this.crown.roadBy].name} +${roads}`);
    }
  }

  finish() {
    if (this.phase === 'over') return;
    this.phase = 'over';
    this.tile = null;
    this.market = null;
    this.m.finish();
    if (this.has('fields') && this.m.finalFarms) this.scoreFarms();
    if (this.has('goldmines')) this.scoreIngots();
    if (this.has('littleBuildings')) this.scoreBuildings();
    if (this.has('wonders')) {
      for (const p of this.players) {
        if (!p.wonders) continue;
        p.score += 8 * p.wonders;
        this.say(`${p.name}'s wonder${p.wonders > 1 ? 's' : ''} of humanity → +${8 * p.wonders}.`);
      }
    }
    if (this.has('goods')) this.scoreGoods();
    if (this.has('king') || this.has('robberBaron')) this.scoreCrown();
    if (this.has('agendas')) this.scoreAgendas();
    if (!this.spec.solo) {
      const best = Math.max(...this.players.map((p) => p.score));
      const winners = this.players.filter((p) => p.score === best).map((p) => p.name);
      this.say(`Game over — ${winners.join(' & ')} wins with ${best}.`);
    }
    this.emit('over');
  }
}

/**
 * The shepherd's bag, as printed: sixteen flock tokens and two wolves. Drawn
 * tokens go back only when a flock is herded — a wolf eats its way back in.
 */
function shuffleBag(rng) {
  const bag = [1, 1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 'wolf', 'wolf'];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

/** Small seeded PRNG so a layout can be replayed while iterating. */
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { buildDeck, MAX_STACK, NO_MEEPLE, MARKS };
