// ---------------------------------------------------------------------------
// Expedition mode.
//
// A different use of meeples: instead of staking a claim on a feature and
// leaving it there, each player has PAWNS that walk the map. Every turn you
// place a tile, then move a pawn. The board isn't a scoring grid any more —
// it's terrain you're building in front of yourself as you travel.
//
// Landmarks are claimed by the FIRST pawn to reach them, which is what turns
// tile placement into a race: you're laying track toward the thing you want
// while trying not to lay track toward the thing they want.
//
//   stable   → your pawn is mounted for good, and moves 2 tiles instead of 1
//   village  → rest here a turn (face-down) to raise a second pawn
//   tower    → once two are standing, pawns may warp between any of them
//   cave     → drop into a private sub-map with its own tile pool and treasure
//   market / keep / library / armoury → city landmarks; collect all four for a bonus
// ---------------------------------------------------------------------------

import { keyOf } from '../board.js';
import { Interior } from '../interior.js';
import { MARKS, CITY_LANDMARKS, buildCaveDeck, rotPoint, SIDE_STEP } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { Mode } from './mode.js';

export const EXPEDITION_RULES = {
  baseMoves: 1,
  mountedMoves: 2,
  setBonus: 8,            // for collecting all four city landmarks
  caveTurnLimit: 0,       // 0 = explore until you leave or the cave deck runs dry
  movementRequiresRoad: false, // knob: gate movement on road connections instead
};

export class Expedition extends Mode {
  isWalker = true;

  setup() {
    this.pawns = [];
    this.nextId = 1;
    this.claimed = new Set();                 // "x,y#markIndex" already scored
    this.collections = this.game.players.map(() => new Set());
    this.caves = new Map();                   // player id -> cave session
    this.moved = false;
    for (const p of this.game.players) this.spawn(p.id, 0, 0);
  }

  // --- mode hooks -----------------------------------------------------------

  afterPlace() {
    this.beginMovement(this.game.current);
    const mine = this.pawnsOf(this.game.current);
    this.selected = mine.length === 1 ? mine[0] : null;
    return 'move';
  }

  get visiblePawns() { return this.pawns.filter((p) => !p.inCave); }
  get interior() { return this.caveOf(this.game.current); }

  select(pawn) {
    if (pawn.player !== this.game.current) return false;
    this.selected = pawn;
    return true;
  }

  moveSelected(x, y) { return !!this.selected && this.move(this.selected, x, y); }

  rest() { return !!this.selected && this.doRest(this.selected); }

  /** Expedition's endgame lets anyone still underground finish exploring. */
  someoneStillInside(current) {
    for (let i = 1; i <= this.game.players.length; i++) {
      const p = (current + i) % this.game.players.length;
      if (this.caves.has(p)) return p;
    }
    return null;
  }

  interiorArrive(inv) { this.caveArrive(inv); }
  leaveInterior(inv, how) { this.leaveCave(inv, how); }

  figureStyle(p) { return { color: p.player, hero: false }; }

  actions() {
    const out = [];
    if (this.selected && this.canRest(this.selected)) {
      out.push({ label: 'Rest at village', fn: (g) => g.restPawn() });
    }
    return out;
  }

  panel() {
    return this.game.players.map((p, i) => {
      const pawns = this.pawns.filter((q) => q.player === i);
      const bits = [`${pawns.length} pawn${pawns.length > 1 ? 's' : ''}`];
      if (pawns.some((q) => q.mounted)) bits.push('mounted');
      if (pawns.some((q) => q.inCave)) bits.push('in cave');
      const set = this.collections[i];
      if (set.size) bits.push(`${set.size}/${CITY_LANDMARKS.length} landmarks`);
      const active = i === this.game.current && this.game.phase !== 'over';
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${bits.join(' · ')}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
  }

  spawn(player, x, y) {
    const pawn = { id: this.nextId++, player, x, y, mounted: false, resting: false, inCave: false };
    this.pawns.push(pawn);
    return pawn;
  }

  pawnsOf(player) { return this.pawns.filter((p) => p.player === player && !p.inCave); }
  pawnsAt(x, y) { return this.pawns.filter((p) => !p.inCave && p.x === x && p.y === y); }
  caveOf(player) { return this.caves.get(player) || null; }

  moveAllowance(pawn) {
    return pawn.mounted ? EXPEDITION_RULES.mountedMoves : EXPEDITION_RULES.baseMoves;
  }

  // --- landmarks ------------------------------------------------------------

  /** Landmarks on a placed cell, with rotation applied to their positions. */
  marksAt(cell) {
    if (!cell) return [];
    return cell.type.marks.map((m, i) => ({
      kind: m.kind,
      index: i,
      spot: rotPoint(cell.type.markSpots[i], cell.rot),
      claimed: this.claimed.has(`${keyOf(cell.x, cell.y)}#${i}`),
    }));
  }

  towers() {
    const out = [];
    for (const cell of this.game.board.cells.values()) {
      cell.type.marks.forEach((m) => { if (m.kind === 'tower') out.push({ x: cell.x, y: cell.y }); });
    }
    return out;
  }

  // --- movement -------------------------------------------------------------

  /**
   * Every tile a pawn could finish this turn on: a breadth-first walk over
   * placed tiles up to its allowance, plus tower-to-tower warps.
   */
  reachable(pawn) {
    const board = this.game.board;
    const out = new Map();
    const limit = this.moveAllowance(pawn);
    const seen = new Set([keyOf(pawn.x, pawn.y)]);
    let frontier = [{ x: pawn.x, y: pawn.y }];

    for (let step = 1; step <= limit; step++) {
      const next = [];
      for (const cur of frontier) {
        for (let s = 0; s < 4; s++) {
          const [dx, dy] = SIDE_STEP[s];
          const nx = cur.x + dx, ny = cur.y + dy;
          const k = keyOf(nx, ny);
          if (seen.has(k) || !board.cells.has(k)) continue;
          if (EXPEDITION_RULES.movementRequiresRoad) {
            const from = board.get(cur.x, cur.y);
            if (board.edgeAt(from, s) !== 'r') continue;
          }
          seen.add(k);
          out.set(k, { x: nx, y: ny, steps: step, warp: false });
          next.push({ x: nx, y: ny });
        }
      }
      frontier = next;
    }

    // Warping: standing on a tower connects you to every other tower.
    const here = board.get(pawn.x, pawn.y);
    if (here && here.type.marks.some((m) => m.kind === 'tower')) {
      for (const t of this.towers()) {
        const k = keyOf(t.x, t.y);
        if (k === keyOf(pawn.x, pawn.y) || out.has(k)) continue;
        out.set(k, { x: t.x, y: t.y, steps: 0, warp: true });
      }
    }
    return out;
  }

  /** Start of a player's movement phase: wake rested pawns, raise new ones. */
  beginMovement(player) {
    this.selected = null;
    this.moved = false;
    for (const pawn of this.pawns) {
      if (pawn.player !== player || !pawn.resting) continue;
      pawn.resting = false;
      this.spawn(player, pawn.x, pawn.y);
      this.game.say(`A second pawn is raised at the village (${pawn.x}, ${pawn.y}).`);
    }
  }

  canRest(pawn) {
    const cell = this.game.board.get(pawn.x, pawn.y);
    return !!cell && cell.type.marks.some((m) => m.kind === 'village') && !pawn.resting;
  }

  doRest(pawn) {
    if (!this.canRest(pawn)) return false;
    pawn.resting = true;
    this.game.say(`${this.game.players[pawn.player].name} rests at the village.`);
    this.game.emit('rest');
    return true;
  }

  move(pawn, x, y) {
    const opts = this.reachable(pawn);
    const dest = opts.get(keyOf(x, y));
    if (!dest) return false;
    pawn.x = x; pawn.y = y;
    const name = this.game.players[pawn.player].name;
    this.game.say(dest.warp ? `${name} warps between watchtowers.` : `${name} moves to (${x}, ${y}).`);
    this.game.emit(dest.warp ? 'warp' : 'step');
    this.resolve(pawn);
    return true;
  }

  /** Apply whatever the pawn just landed on. */
  resolve(pawn) {
    const cell = this.game.board.get(pawn.x, pawn.y);
    if (!cell) return;
    const player = this.game.players[pawn.player];

    cell.type.marks.forEach((m, i) => {
      const key = `${keyOf(cell.x, cell.y)}#${i}`;
      const info = MARKS[m.kind] || { label: m.kind, score: 0 };

      if (m.kind === 'stable' && !pawn.mounted) {
        pawn.mounted = true;
        this.game.say(`${player.name} is mounted — 2 tiles per turn from now on.`);
      }

      if (m.kind === 'cave') { this.enterCave(pawn, cell); return; }

      if (this.claimed.has(key)) return;
      this.claimed.add(key);
      if (info.score) {
        player.score += info.score;
        this.game.say(`${player.name} claims the ${info.label} +${info.score}`);
        this.game.emit('landmark', { kind: m.kind });
      }

      if (CITY_LANDMARKS.includes(m.kind)) {
        const set = this.collections[pawn.player];
        set.add(m.kind);
        if (set.size === CITY_LANDMARKS.length) {
          player.score += EXPEDITION_RULES.setBonus;
          this.game.say(`${player.name} completes the city set +${EXPEDITION_RULES.setBonus}`);
        }
      }
    });
  }

  // --- caves ----------------------------------------------------------------

  enterCave(pawn, cell) {
    if (this.caves.has(pawn.player)) return;
    const cave = new Interior({
      kind: 'cave',
      deck: buildCaveDeck(this.game.rng),
      entryType: 'vc',
      entry: { x: cell.x, y: cell.y },
      owner: pawn,
      label: 'CAVE',
      rng: this.game.rng,
    });
    pawn.inCave = true;
    this.caves.set(pawn.player, cave);
    this.game.say(`${this.game.players[pawn.player].name} descends into the cave.`);
    this.game.emit('caveEnter');
  }

  /** Score whatever the pawn just walked onto underground. */
  caveArrive(cave) {
    const player = this.game.players[cave.owner.player];
    for (const m of cave.freshMarks()) {
      cave.take(m);
      const info = MARKS[m.kind] || { label: m.kind, score: 0 };
      if (info.score) {
        player.score += info.score;
        this.game.say(`${player.name} finds a ${info.label} in the cave +${info.score}`);
        this.game.emit('treasure', { kind: m.kind });
      }
      if (m.kind === 'shaft') this.leaveCave(cave, 'climbs out through a shaft');
    }
  }

  leaveCave(cave, how = 'returns to the surface') {
    const pawn = cave.owner;
    if (!this.caves.has(pawn.player)) return;
    pawn.inCave = false;
    pawn.x = cave.entry.x;
    pawn.y = cave.entry.y;
    this.caves.delete(pawn.player);
    this.game.say(`${this.game.players[pawn.player].name} ${how}.`);
    this.game.emit('caveExit');
  }
}

Expedition.spec = {
  id: 'expedition',
  name: 'Expedition',
  Mode: Expedition,
  groups: ['base', 'outposts', 'citylife'],
  minPlayers: 2,
  maxPlayers: 5,
  opening: 'The expedition sets out from the crossroads.',
  hint: 'Place a tile, then walk a pawn. Landmarks go to whoever reaches them first.',
};
