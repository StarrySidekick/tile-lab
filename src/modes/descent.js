// ---------------------------------------------------------------------------
// Descent — the roguelike.
//
// Adventure, but short, dangerous and losable. A run is four stages; each
// stage is a small board with a stair down shuffled into the back half of its
// deck. Find the stair before the deck runs out, or the run ends there.
//
// THE UPGRADE CURRENCY IS THE TILE POOL. Between stages you pick one of three
// boons, and the third kind adds tiles to the pool you draw from — you are
// deckbuilding the world. What the map CAN contain is the thing you upgrade,
// which is a lever a board game can't pull mid-session and we can.
//
// Escalation is the same lever pointed the other way: each stage reweights the
// deck toward danger. The difficulty curve isn't a number, it's the deck.
//
// Meta-progression unlocks whole tile groups permanently, so the lab's group
// toggles double as the unlock tree.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { Board, keyOf } from '../board.js';
import { TILES, MARKS, SIDE_STEP, weightedDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';

const STAGES = 4;
const START_HP = 10;
const STORE_KEY = 'tilelab.descent';

/** Stage decks. Safety drains away and threat replaces it, stage by stage. */
function stageDeck(stage, extras, rng) {
  const danger = stage - 1;
  const counts = [
    { id: 'U', n: 7 }, { id: 'V', n: 7 }, { id: 'W', n: 3 }, { id: 'X', n: 1 },
    { id: 'E', n: 3 }, { id: 'N', n: 2 }, { id: 'D', n: 2 }, { id: 'B', n: 2 },
    { id: 'Ac', n: Math.max(0, 3 - danger) },      // campsites
    { id: 'Aa', n: Math.max(0, 3 - danger) },      // wayshrines
    { id: 'De', n: Math.max(0, 2 - Math.floor(danger / 2)) },
    { id: 'Ad', n: 2 },                            // merchants
    { id: 'Db', n: 1 + danger },                   // bandits
    { id: 'Dc', n: 1 + danger },                   // wolves
    { id: 'Dd', n: Math.max(0, danger) },          // barrows
    { id: 'Df', n: 2 },                            // caches
    { id: 'Ab', n: 2 },                            // ruins
  ];
  for (const e of extras) counts.push(e);
  const deck = weightedDeck(counts.filter((c) => c.n > 0), rng);
  // The stair goes in the back half, so a stage is never over in three turns.
  const at = Math.floor(deck.length * (0.45 + rng() * 0.3));
  deck.splice(deck.length - at, 0, 'Da');
  return deck;
}

const BOONS = [
  { kind: 'stat',  text: '+3 max health, and heal to full',  apply: (m) => { m.maxHp += 3; m.hp = m.maxHp; } },
  { kind: 'stat',  text: '+1 might in every fight',          apply: (m) => { m.might += 1; } },
  { kind: 'stat',  text: '+4 supplies',                      apply: (m) => { m.supplies += 4; } },
  { kind: 'relic', text: 'Boots — roads carry you three tiles', apply: (m) => { m.relics.push('boots'); } },
  { kind: 'relic', text: 'Charm — the first fight each stage is skipped', apply: (m) => { m.relics.push('charm'); } },
  { kind: 'relic', text: 'Lantern — barrows and ruins pay double', apply: (m) => { m.relics.push('lantern'); } },
  { kind: 'tiles', text: 'The world holds more villages',     apply: (m) => { m.extras.push({ id: 'Af', n: 3 }); } },
  { kind: 'tiles', text: 'The world holds more wayshrines',   apply: (m) => { m.extras.push({ id: 'Aa', n: 3 }); } },
  { kind: 'tiles', text: 'The world holds more caches',       apply: (m) => { m.extras.push({ id: 'Df', n: 3 }); } },
  { kind: 'tiles', text: 'The world holds more merchants',    apply: (m) => { m.extras.push({ id: 'Ad', n: 3 }); } },
];

export class Descent extends Mode {
  isWalker = true;
  walkerKind = 'party';

  deck() { return stageDeck(1, [], this.game.rng); }

  setup() {
    this.stage = 1;
    this.hp = START_HP;
    this.maxHp = START_HP;
    this.might = 1;
    this.supplies = 3;
    this.gold = 0;
    this.relics = [];
    this.extras = [];
    this.claimed = new Set();
    this.boons = null;
    this.fightsThisStage = 0;
    this.dead = false;
    this.escaped = false;
    this.unlocked = loadUnlocks();
    this.hero = { id: 1, name: 'You', hero: true, x: 0, y: 0, player: 0, inside: null };
    this.selected = this.hero;
  }

  // --- turn flow ------------------------------------------------------------

  /** The boon screen takes the whole turn — the host stands down. */
  startTurn() {
    if (this.boons) { this.game.phase = 'boon'; return false; }
    if (this.dead || this.escaped) return false;
    return true;
  }

  afterPlace() { return 'move'; }

  get visiblePawns() { return this.dead ? [] : [this.hero]; }
  figureStyle() { return { color: 0, hero: true }; }

  select(p) { this.selected = p; return true; }

  reachable() {
    const board = this.game.board;
    const out = new Map();
    const dash = this.relics.includes('boots') ? 3 : 2;
    const seen = new Set([keyOf(this.hero.x, this.hero.y)]);

    const stepsFrom = (x, y) => {
      const found = [];
      const here = board.get(x, y);
      if (!here) return found;
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        if (!board.get(x + dx, y + dy)) continue;
        found.push({ x: x + dx, y: y + dy, road: board.edgeAt(here, s) === 'r' });
      }
      return found;
    };

    // Step one is free anywhere. Every step after that is free along a road
    // and costs a supply otherwise, so roads are genuinely faster.
    let frontier = [{ x: this.hero.x, y: this.hero.y, road: true }];
    for (let step = 1; step <= dash; step++) {
      const next = [];
      for (const cur of frontier) {
        for (const a of stepsFrom(cur.x, cur.y)) {
          const k = keyOf(a.x, a.y);
          if (seen.has(k)) continue;
          const road = step === 1 ? a.road : cur.road && a.road;
          const cost = step === 1 ? 0 : (road ? 0 : 1);
          if (cost > this.supplies) continue;
          seen.add(k);
          out.set(k, { x: a.x, y: a.y, steps: step, byRoad: road, cost });
          next.push({ x: a.x, y: a.y, road });
        }
      }
      frontier = next;
    }
    return out;
  }

  moveSelected(x, y) {
    const dest = this.reachable().get(keyOf(x, y));
    if (!dest) return false;
    if (dest.cost) {
      this.supplies -= dest.cost;
      this.game.say('Forced march — 1 supply spent.');
    }
    this.hero.x = x; this.hero.y = y;
    this.game.emit(dest.steps > 1 ? 'warp' : 'step');
    this.arrive();
    return true;
  }

  // --- arriving somewhere ---------------------------------------------------

  arrive() {
    const cell = this.game.board.get(this.hero.x, this.hero.y);
    if (!cell) return;
    cell.type.marks.forEach((m, i) => {
      const key = `${keyOf(cell.x, cell.y)}#${i}`;
      if (this.claimed.has(key)) return;
      this.claimed.add(key);
      const info = MARKS[m.kind] || {};

      if (info.exit) return this.descend();
      if (info.threat) { this.fight(m.kind, info); return; }
      if (info.heal) {
        this.hp = Math.min(this.maxHp, this.hp + info.heal);
        this.game.say(`You rest at the ${info.label}. Health ${this.hp}/${this.maxHp}.`);
      }
      this.take(info);
    });
  }

  take(info, multiplier = 1) {
    if (!info.loot) return;
    for (const [k, v] of Object.entries(info.loot)) {
      const n = v * multiplier;
      if (k === 'gold') this.gold += n;
      else if (k === 'supplies') this.supplies += n;
      else if (k === 'relics') { this.relics.push('relic'); }
    }
    this.game.emit('treasure');
    this.game.say(`${info.label || 'You find something'} — ${Object.entries(info.loot).map(([k, v]) => `+${v * multiplier} ${k}`).join(', ')}.`);
  }

  /**
   * Might plus a small die against the threat plus the depth. Losing costs
   * health equal to how badly you lost, never less than one.
   */
  fight(kind, info) {
    this.fightsThisStage++;
    if (this.relics.includes('charm') && this.fightsThisStage === 1) {
      this.game.say(`The charm turns the ${info.label} aside. You pass unseen.`);
      return;
    }
    const roll = 1 + Math.floor(this.game.rng() * 3);
    const power = this.might + roll + Math.floor(this.relics.length / 2);
    const threat = info.threat + this.stage - 1;
    if (power >= threat) {
      this.game.say(`${info.label}: you win, ${power} against ${threat}.`);
      const mult = this.relics.includes('lantern') && (kind === 'barrow' || kind === 'ruin') ? 2 : 1;
      this.take(info, mult);
      this.game.emit('score', { points: info.score || 1 });
    } else {
      const hurt = Math.max(1, threat - power);
      this.hp -= hurt;
      this.game.say(`${info.label}: you lose, ${power} against ${threat}. −${hurt} health.`);
      this.game.emit('deny');
      if (this.hp <= 0) this.die(info.label);
    }
  }

  die(what) {
    this.dead = true;
    this.hp = 0;
    this.game.say(`You fall at depth ${this.stage}, to the ${what}.`);
    this.game.finish();
  }

  // --- stages ---------------------------------------------------------------

  descend() {
    this.game.say(`You find the stair down from depth ${this.stage}.`);
    this.game.emit('caveEnter');
    if (this.stage >= STAGES) {
      this.escaped = true;
      this.game.say('Daylight. You are out, and alive.');
      this.unlock();
      return this.game.finish();
    }
    this.boons = pickBoons(this.game.rng);
  }

  chooseBoon(i) {
    if (!this.boons || !this.boons[i]) return false;
    const boon = this.boons[i];
    boon.apply(this);
    this.game.say(`Boon: ${boon.text}`);
    this.boons = null;
    this.stage++;
    this.fightsThisStage = 0;
    this.newStage();
    return true;
  }

  /** A fresh board, a harder deck, the hero back at the entrance. */
  newStage() {
    const g = this.game;
    g.board = new Board();
    g.board.place(0, 0, TILES.D, 0, { owner: 0 });
    g.deck = stageDeck(this.stage, this.extras, g.rng);
    g.lastPlaced = null;
    g.tile = null;
    g.market = null;
    this.claimed = new Set();
    this.hero.x = 0; this.hero.y = 0;
    g.say(`Depth ${this.stage}. ${g.deck.length} tiles of it.`);
    g.phase = 'place';
    g.startTurn();
  }

  finish() {
    this.game.players[0].score = this.score();
    if (!this.dead && !this.escaped) this.game.say(`The tiles run out at depth ${this.stage}. You never find the way down.`);
  }

  score() {
    return this.gold + this.relics.length * 5 + (this.stage - 1) * 10 + (this.escaped ? 25 : 0);
  }

  unlock() {
    const next = new Set(this.unlocked);
    next.add('descent');
    if (this.stage >= STAGES) next.add('adventure');
    saveUnlocks([...next]);
    this.unlocked = [...next];
  }

  // --- UI -------------------------------------------------------------------

  actions() {
    if (this.game.phase !== 'boon' || !this.boons) return [];
    return this.boons.map((b, i) => ({
      label: b.text,
      fn: (g) => { this.chooseBoon(i); g.emit('landmark'); },
    }));
  }

  status() {
    return `depth ${this.stage}/${STAGES} · ${this.hp}/${this.maxHp} health`;
  }

  panel() {
    const hearts = `<span class="hp">${'♥'.repeat(Math.max(0, this.hp))}<span class="dim">${'♡'.repeat(Math.max(0, this.maxHp - this.hp))}</span></span>`;
    const bag = [['gold', this.gold], ['supplies', this.supplies], ['relics', this.relics.length]]
      .map(([k, v]) => `<span class="bagItem"><b>${v}</b> ${k}</span>`).join('');
    const relics = this.relics.filter((r) => r !== 'relic');
    const boonList = this.boons
      ? `<h2>Choose a boon</h2><p class="hint">The third kind changes what the world can contain.</p>`
      : '';
    return `
      <div class="advTop">
        <span>Depth <b>${this.stage}/${STAGES}</b></span>
        <span>Score <b>${this.score()}</b></span>
      </div>
      <div class="bag">${hearts}</div>
      <div class="bag">${bag}</div>
      ${relics.length ? `<h2>Relics</h2><div class="bag">${relics.map((r) => `<span class="bagItem">${r}</span>`).join('')}</div>` : ''}
      ${boonList}
      <div class="member"><span class="swatch" style="background:${PLAYER_COLORS[0]}"></span>
        <span class="pname">★ You</span><span class="dim">(${this.hero.x}, ${this.hero.y})</span></div>`;
  }
}

function pickBoons(rng) {
  const byKind = { stat: [], relic: [], tiles: [] };
  for (const b of BOONS) byKind[b.kind].push(b);
  return ['stat', 'relic', 'tiles'].map((k) => {
    const list = byKind[k];
    return list[Math.floor(rng() * list.length)];
  });
}

function loadUnlocks() {
  try {
    if (typeof localStorage === 'undefined') return [];
    return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
  } catch { return []; }
}

function saveUnlocks(list) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORE_KEY, JSON.stringify(list));
  } catch { /* private browsing, don't care */ }
}

Descent.spec = {
  id: 'descent',
  name: 'Descent (roguelike)',
  Mode: Descent,
  groups: ['base', 'adventure', 'descent'],
  solo: true,
  market: false,
  playerName: () => 'Delver',
  opening: 'Depth one. Find the stair before the tiles run out.',
  hint: 'Four stages, one life. Find the stair down; pick a boon between depths. The deck gets meaner as you go.',
};
