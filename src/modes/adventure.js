// ---------------------------------------------------------------------------
// Adventure mode — single player, tile-based RPG.
//
// You are one hero. Every turn you lay a tile and move one member of your
// party. The map is built in front of you as you travel, so exploration and
// map-making are the same act: you decide what the world contains by choosing
// where the next piece of it goes.
//
//   movement   one tile anywhere; two along a road for free; two off-road
//              costs a supply (a forced march)
//   villages   recruit a follower you can also move
//   cities     once finished, walk in through a road gate and discover the
//              streets district by district
//   caves      the same, underground, with treasure
//
// Sites are claimed the first time anyone in the party stands on them.
// ---------------------------------------------------------------------------

import { keyOf } from '../board.js';
import { Interior } from '../interior.js';
import {
  MARKS, SIDE_STEP, rotPoint,
  buildCaveDeck, buildCityDeck,
} from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { Mode } from './mode.js';

export const ADVENTURE_RULES = {
  roadDash: 2,          // tiles you may cover along a road
  offRoadStep: 1,       // tiles you may cover otherwise, for free
  forcedMarchCost: 1,   // supplies to push a second tile off-road
  startSupplies: 3,
  relicPoints: 5,
};

const FOLLOWER_NAMES = [
  'Rusl', 'Ilia', 'Colin', 'Telma', 'Ashei', 'Shad', 'Auru', 'Fyer', 'Purlo',
];

export class Adventure extends Mode {
  isWalker = true;
  walkerKind = 'party';

  setup() {
    this.party = [];
    this.nextId = 1;
    this.claimed = new Set();       // "x,y#markIndex" already taken
    this.visitedCities = new Set(); // city component roots already entered
    this.bag = { gold: 0, supplies: ADVENTURE_RULES.startSupplies, relics: 0 };
    this.journal = makeJournal();
    this.hero = this.add('You', true);
  }

  // --- mode hooks -----------------------------------------------------------

  afterPlace() { return 'move'; }

  get visiblePawns() { return this.outside; }

  select(p) {
    if (p.inside) return false;
    this.selected = p;
    return true;
  }

  moveSelected(x, y) { return !!this.selected && this.move(this.selected, x, y); }

  interiorArrive(inv) { this.arriveInside(inv.owner); }
  leaveInterior(inv, how) { this.leaveInside(inv.owner, how); }

  enterCity() { return !!this.selected && this.enterCityWith(this.selected); }
  canEnterCity() {
    const p = this.selected;
    return !!p && !p.inside && !!this.cityGateAt(p.x, p.y);
  }

  figureStyle(p) { return { color: p.hero ? 0 : 1, hero: !!p.hero }; }

  actions() {
    const out = [];
    if (this.canEnterCity()) out.push({ label: 'Enter the city', key: 'E', fn: (g) => g.enterCity() });
    return out;
  }

  finish() {
    this.game.players[0].score = this.score();
    const done = this.journal.filter((q) => q.done).length;
    this.game.say(`The road ends. ${done}/${this.journal.length} journal entries, ${this.game.players[0].score} points.`);
  }

  /** Party / satchel / journal, in place of the score table. */
  panel() {
    const sel = this.selected;
    const party = this.party.map((p) => `
      <div class="member ${sel === p ? 'sel' : ''}">
        <span class="swatch" style="background:${p.hero ? PLAYER_COLORS[0] : PLAYER_COLORS[1]}"></span>
        <span class="pname">${p.hero ? '★ ' : ''}${p.name}</span>
        <span class="dim">${p.inside ? `in the ${p.inside.kind}` : `(${p.x}, ${p.y})`}</span>
      </div>`).join('');

    const bag = [['gold', this.bag.gold], ['supplies', this.bag.supplies], ['relics', this.bag.relics]]
      .map(([k, v]) => `<span class="bagItem"><b>${v}</b> ${k}</span>`).join('');

    const journal = this.journal.map((q) => `
      <div class="quest ${q.done ? 'done' : ''}">
        <span>${q.done ? '✓' : '○'} ${q.text}</span>
        <span class="dim">${Math.min(q.have, q.need)}/${q.need}</span>
      </div>`).join('');

    return `
      <div class="advTop"><span>Day <b>${this.game.turn}</b></span><span>Score <b>${this.score()}</b></span></div>
      <div class="bag">${bag}</div>
      <h2>Party</h2>${party}
      <h2>Journal</h2>${journal}`;
  }

  add(name, hero = false) {
    const p = { id: this.nextId++, name, hero, x: 0, y: 0, inside: null };
    this.party.push(p);
    if (!this.selected) this.selected = p;
    return p;
  }

  get outside() { return this.party.filter((p) => !p.inside); }
  get inside() { return this.party.find((p) => p.inside) || null; }
  /** The interior currently being explored, if any. */
  get interior() { const p = this.inside; return p ? p.inside : null; }

  score() {
    return this.bag.gold + this.bag.relics * ADVENTURE_RULES.relicPoints + this.claimed.size;
  }

  // --- movement -------------------------------------------------------------

  /**
   * Where a party member can finish this turn.
   * One step is always allowed. A second step is free along a road, and costs
   * a supply otherwise — so roads are genuinely faster, not just flavour.
   */
  reachable(p) {
    const board = this.game.board;
    const out = new Map();
    const start = { x: p.x, y: p.y };
    const seen = new Set([keyOf(p.x, p.y)]);

    const stepsFrom = (cell) => {
      const found = [];
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        const nx = cell.x + dx, ny = cell.y + dy;
        if (!board.cells.has(keyOf(nx, ny))) continue;
        const here = board.get(cell.x, cell.y);
        const road = board.edgeAt(here, s) === 'r';
        found.push({ x: nx, y: ny, road });
      }
      return found;
    };

    for (const a of stepsFrom(start)) {
      const k = keyOf(a.x, a.y);
      seen.add(k);
      out.set(k, { x: a.x, y: a.y, steps: 1, byRoad: a.road, cost: 0 });
    }
    for (const a of stepsFrom(start)) {
      for (const b of stepsFrom(a)) {
        const k = keyOf(b.x, b.y);
        if (seen.has(k)) continue;
        const byRoad = a.road && b.road;
        const cost = byRoad ? 0 : ADVENTURE_RULES.forcedMarchCost;
        if (cost > this.bag.supplies) continue;   // can't afford the march
        const prev = out.get(k);
        if (prev && prev.cost <= cost) continue;
        out.set(k, { x: b.x, y: b.y, steps: 2, byRoad, cost });
      }
    }
    return out;
  }

  move(p, x, y) {
    const dest = this.reachable(p).get(keyOf(x, y));
    if (!dest) return false;
    if (dest.cost) {
      this.bag.supplies -= dest.cost;
      this.game.say(`Forced march off-road — 1 supply spent.`);
    }
    p.x = x; p.y = y;
    this.game.emit(dest.byRoad && dest.steps === 2 ? 'warp' : 'step');
    this.game.say(`${p.name} ${dest.steps === 2 ? 'travels' : 'moves'} to (${x}, ${y}).`);
    this.arrive(p);
    return true;
  }

  // --- interacting ----------------------------------------------------------

  /** Landmarks on this cell that nobody has taken yet. */
  sitesAt(x, y) {
    const cell = this.game.board.get(x, y);
    if (!cell) return [];
    return cell.type.marks
      .map((m, i) => ({
        kind: m.kind,
        index: i,
        key: `${keyOf(x, y)}#${i}`,
        spot: rotPoint(cell.type.markSpots[i], cell.rot),
      }))
      .filter((m) => !this.claimed.has(m.key));
  }

  arrive(p) {
    for (const site of this.sitesAt(p.x, p.y)) {
      if (site.kind === 'cave') { this.enterCave(p); continue; }
      this.claimed.add(site.key);
      const info = MARKS[site.kind] || { label: site.kind };
      this.collect(info.loot);
      if (info.loot) this.game.emit('treasure');
      this.game.say(`${p.name} reaches the ${info.label}${lootText(info.loot)}`);

      if (site.kind === 'village') this.recruit(p);
      if (site.kind === 'ruin' || site.kind === 'library') this.progress('relics');
    }
    this.checkJournal();
  }

  collect(loot) {
    if (!loot) return;
    for (const [k, v] of Object.entries(loot)) this.bag[k] = (this.bag[k] || 0) + v;
  }

  recruit(p) {
    const name = FOLLOWER_NAMES[(this.party.length - 1) % FOLLOWER_NAMES.length];
    const f = this.add(name);
    f.x = p.x; f.y = p.y;
    this.game.say(`${name} joins you from the village.`);
    this.game.emit('landmark');
    this.progress('followers');
  }

  // --- cities ---------------------------------------------------------------

  /**
   * A finished city you could walk into from this tile: the cell has to be part
   * of a completed city AND carry a road, which is the gate.
   */
  cityGateAt(x, y) {
    const cell = this.game.board.get(x, y);
    if (!cell) return null;
    const hasRoad = cell.type.feats.some((f) => f.type === 'road');
    if (!hasRoad) return null;
    for (let i = 0; i < cell.type.feats.length; i++) {
      if (cell.type.feats[i].type !== 'city') continue;
      const root = this.game.board.find(`${keyOf(x, y)}#${i}`);
      const d = this.game.board.data.get(root);
      if (d && d.open === 0) return { root, data: d };
    }
    return null;
  }

  enterCityWith(p) {
    const gate = this.cityGateAt(p.x, p.y);
    if (!gate || p.inside) return false;
    const size = gate.data.tiles.size;
    p.inside = new Interior({
      kind: 'city',
      deck: buildCityDeck(size, this.game.rng),
      entryType: 'ga',
      entry: { x: p.x, y: p.y },
      owner: p,
      label: `CITY — ${size} tiles`,
      rng: this.game.rng,
    });
    this.visitedCities.add(gate.root);
    this.game.say(`${p.name} passes through the gate into the city.`);
    this.game.emit('caveExit');       // bright, rising — you're walking into light
    this.progress('cities');
    return true;
  }

  enterCave(p) {
    if (p.inside) return;
    p.inside = new Interior({
      kind: 'cave',
      deck: buildCaveDeck(this.game.rng),
      entryType: 'vc',
      entry: { x: p.x, y: p.y },
      owner: p,
      label: 'CAVE',
      rng: this.game.rng,
    });
    this.game.say(`${p.name} descends into the cave.`);
    this.game.emit('caveEnter');
    this.progress('caves');
  }

  /** Pick up whatever the party member is standing on inside an interior. */
  arriveInside(p) {
    const inv = p.inside;
    if (!inv) return;
    for (const m of inv.freshMarks()) {
      inv.take(m);
      const info = MARKS[m.kind] || { label: m.kind };
      this.collect(info.loot);
      if (info.loot) this.game.emit('treasure');
      this.game.say(`${p.name} finds the ${info.label}${lootText(info.loot)}`);
      if (m.kind === 'library') this.progress('relics');
      if (m.kind === 'shaft') this.leaveInside(p, 'climbs out through a shaft');
    }
    // "Districts" means city streets specifically — cave passages don't count.
    if (inv.kind === 'city') this.progress('districts');
    this.checkJournal();
  }

  leaveInside(p, how = 'returns to the surface') {
    if (!p.inside) return;
    p.x = p.inside.entry.x;
    p.y = p.inside.entry.y;
    p.inside = null;
    this.game.say(`${p.name} ${how}.`);
    this.game.emit('caveExit');
  }

  // --- journal --------------------------------------------------------------

  progress(key, n = 1) {
    for (const q of this.journal) if (!q.done && q.track === key) q.have += n;
  }

  checkJournal() {
    for (const q of this.journal) {
      if (q.done || q.have < q.need) continue;
      q.done = true;
      this.bag.gold += q.reward;
      this.game.say(`Journal — "${q.text}" complete. +${q.reward} gold.`);
      this.game.emit('score');
    }
  }
}

function lootText(loot) {
  if (!loot) return '.';
  const bits = Object.entries(loot).map(([k, v]) => `+${v} ${k}`);
  return ` — ${bits.join(', ')}.`;
}

function makeJournal() {
  return [
    { text: 'Gather three companions',     track: 'followers', need: 3, have: 0, reward: 6, done: false },
    { text: 'Recover two relics',          track: 'relics',    need: 2, have: 0, reward: 10, done: false },
    { text: 'Walk the streets of a city',  track: 'cities',    need: 1, have: 0, reward: 8, done: false },
    { text: 'Delve a cave',                track: 'caves',     need: 1, have: 0, reward: 6, done: false },
    { text: 'Discover twelve districts',   track: 'districts', need: 12, have: 0, reward: 12, done: false },
  ];
}

Adventure.spec = {
  id: 'adventure',
  name: 'Adventure (solo)',
  Mode: Adventure,
  groups: ['base', 'roads', 'outposts', 'citylife', 'adventure'],
  solo: true,
  playerName: () => 'Hero',
  opening: 'You set out from the crossroads with nothing but the road ahead.',
  hint: 'Solo. Place a tile, then move one of your party. Two tiles along a road; off-road costs supplies.',
};
