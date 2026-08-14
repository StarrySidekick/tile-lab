// ---------------------------------------------------------------------------
// The Marches — war, battle and area control.
//
// Every tile you lay is both terrain and a claim. You win by cutting people
// off from their own territory, not by having the biggest army.
//
// THE BOARD grows from two keeps at opposite ends instead of one start tile,
// so everything meets in the middle. Laying a tile next to ground you already
// hold plants your banner on it; anything else is neutral until someone
// marches onto it.
//
// BATTLE is deliberately deterministic. Strength is units plus terrain, and
// the defender wins ties — no dice, because dice would hide whether the
// PLACEMENT layer is generating the drama. Muster chits are the only variable:
// a small reserve you spend to win a fight you'd otherwise lose.
//
// SUPPLY is the good part. At the end of each round every contiguous run of
// your banners scores its size — but only if it can trace back to your keep.
// A region that can't is cut off and scores nothing. Which means the sharpest
// move in the game is laying a tile that SEVERS rather than one that grows: a
// field tile dropped to break a road, a city wall laid across a corridor.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { keyOf } from '../board.js';
import { buildDeck, MARKS, SIDE_STEP } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';

const UNITS_PER_PLAYER = 3;
const MAX_CHITS = 3;
const KEEP_SPACING = 4;
const CITY_VALUE = 2;
const DECK_SIZE = 60;
const CAMPAIGN_ROUNDS = 12;   // the war is finite, or nobody ever finishes one
const SCORE_EVERY = 4;        // rounds between counts of the levies

export class Marches extends Mode {
  isWalker = true;

  deck() { return buildDeck(['base', 'marches', 'citylife'], this.game.rng, 'D', DECK_SIZE); }

  /** One keep per player, spread around the origin. */
  seeds() {
    const n = this.game.players.length;
    const spots = [
      { x: -KEEP_SPACING, y: 0 }, { x: KEEP_SPACING, y: 0 },
      { x: 0, y: -KEEP_SPACING }, { x: 0, y: KEEP_SPACING },
    ];
    return spots.slice(0, n).map((s, i) => ({ ...s, id: 'Ma', rot: 0, owner: i }));
  }

  setup() {
    this.units = [];
    this.nextId = 1;
    this.chits = this.game.players.map(() => 1);
    this.keeps = [];
    this.rounds = [];

    this.seeds().forEach((s, i) => {
      const cell = this.game.board.get(s.x, s.y);
      if (!cell) return;
      cell.banner = i;
      cell.anchored = true;                 // a keep never drowns or drifts
      this.keeps[i] = { x: s.x, y: s.y };
      for (let u = 0; u < UNITS_PER_PLAYER; u++) this.spawn(i, s.x, s.y);
    });
  }

  spawn(player, x, y) {
    const unit = { id: this.nextId++, player, x, y };
    this.units.push(unit);
    return unit;
  }

  unitsAt(x, y) { return this.units.filter((u) => u.x === x && u.y === y); }
  unitsOf(player) { return this.units.filter((u) => u.player === player); }
  holder(x, y) {
    const here = this.unitsAt(x, y);
    return here.length ? here[0].player : null;
  }

  // --- placing: banners -----------------------------------------------------

  afterPlace(cell) {
    const me = this.game.current;
    const board = this.game.board;
    let claimed = false;
    for (let s = 0; s < 4; s++) {
      const nb = board.neighbor(cell.x, cell.y, s);
      if (!nb) continue;
      if (nb.banner === me || this.unitsAt(nb.x, nb.y).some((u) => u.player === me)) claimed = true;
    }
    if (claimed) {
      cell.banner = me;
      this.game.say(`${this.game.player.name} raises a banner over (${cell.x}, ${cell.y}).`);
    }
    const mine = this.unitsOf(me);
    this.selected = mine.length === 1 ? mine[0] : null;
    return 'move';
  }

  // --- marching -------------------------------------------------------------

  get visiblePawns() { return this.units; }

  select(unit) {
    if (unit.player !== this.game.current) return false;
    this.selected = unit;
    return true;
  }

  /** One tile, or two if both steps follow a road. Enemy tiles are targets. */
  reachable(unit) {
    const board = this.game.board;
    const out = new Map();
    const stepsFrom = (x, y) => {
      const found = [];
      const here = board.get(x, y);
      if (!here) return found;
      for (let s = 0; s < 4; s++) {
        const [dx, dy] = SIDE_STEP[s];
        const nx = x + dx, ny = y + dy;
        const nb = board.get(nx, ny);
        if (!nb) continue;
        if (this.blocked(here, nb, s)) continue;
        found.push({ x: nx, y: ny, road: board.edgeAt(here, s) === 'r' });
      }
      return found;
    };

    for (const a of stepsFrom(unit.x, unit.y)) {
      out.set(keyOf(a.x, a.y), { x: a.x, y: a.y, steps: 1, byRoad: a.road, cost: 0 });
    }
    for (const a of stepsFrom(unit.x, unit.y)) {
      if (!a.road || this.enemyAt(a.x, a.y, unit.player)) continue;  // can't march through a fight
      for (const b of stepsFrom(a.x, a.y)) {
        const k = keyOf(b.x, b.y);
        if (!b.road || out.has(k) || (b.x === unit.x && b.y === unit.y)) continue;
        out.set(k, { x: b.x, y: b.y, steps: 2, byRoad: true, cost: 0 });
      }
    }
    for (const dest of out.values()) dest.warp = this.enemyAt(dest.x, dest.y, unit.player);
    return out;
  }

  /** Mountains would go here — for now the only impassable seam is no seam. */
  blocked() { return false; }

  enemyAt(x, y, player) {
    return this.unitsAt(x, y).some((u) => u.player !== player);
  }

  defenceOf(x, y) {
    const cell = this.game.board.get(x, y);
    if (!cell) return 0;
    let d = 0;
    for (const m of cell.type.marks) d += MARKS[m.kind]?.defence || 0;
    if (cell.type.feats.some((f) => f.type === 'city')) d += 1;
    return d;
  }

  moveSelected(x, y) {
    const unit = this.selected;
    if (!unit) return false;
    const dest = this.reachable(unit).get(keyOf(x, y));
    if (!dest) return false;

    if (this.enemyAt(x, y, unit.player)) return this.battle(unit, x, y);

    unit.x = x; unit.y = y;
    this.claimUnderfoot(unit);
    this.game.emit(dest.steps === 2 ? 'warp' : 'step');
    return true;
  }

  /** Standing on ground flips it to you — that's how neutral land changes hands. */
  claimUnderfoot(unit) {
    const cell = this.game.board.get(unit.x, unit.y);
    if (!cell || cell.banner === unit.player) return;
    const contested = this.unitsAt(unit.x, unit.y).some((u) => u.player !== unit.player);
    if (contested) return;
    cell.banner = unit.player;
    for (const m of cell.type.marks) {
      if (MARKS[m.kind]?.muster) {
        this.chits[unit.player] = Math.min(MAX_CHITS, this.chits[unit.player] + 1);
        this.game.say(`${this.game.players[unit.player].name} musters at (${unit.x}, ${unit.y}) — ${this.chits[unit.player]} chits.`);
      }
    }
  }

  // --- battle ---------------------------------------------------------------

  battle(unit, x, y) {
    const g = this.game;
    const attacker = unit.player;
    const defenders = this.unitsAt(x, y);
    const defender = defenders[0].player;

    const attack = this.unitsAt(unit.x, unit.y).filter((u) => u.player === attacker).length;
    const defend = defenders.length + this.defenceOf(x, y);

    // Spend the minimum reserve that turns a loss into a win, and no more.
    const need = Math.max(0, defend - attack + 1);
    const spend = need <= this.chits[attacker] ? need : 0;
    this.chits[attacker] -= spend;
    const total = attack + spend;

    const names = [g.players[attacker].name, g.players[defender].name];
    g.say(`Battle at (${x}, ${y}) — ${names[0]} ${total} vs ${names[1]} ${defend}${spend ? ` (${spend} chit${spend > 1 ? 's' : ''} spent)` : ''}.`);

    if (total > defend) {
      const casualty = defenders[0];
      this.units = this.units.filter((u) => u !== casualty);
      const left = this.unitsAt(x, y);
      if (!left.length) {
        unit.x = x; unit.y = y;
        this.claimUnderfoot(unit);
        g.say(`${names[1]} is driven off. ${names[0]} takes the ground.`);
      } else {
        g.say(`${names[1]} loses a company but holds.`);
      }
      g.emit('score', { points: 1 });
    } else {
      this.units = this.units.filter((u) => u !== unit);
      if (this.selected === unit) this.selected = null;
      g.say(`${names[0]} is thrown back and loses a company.`);
      g.emit('deny');
      if (!this.unitsOf(attacker).length) this.reinforce(attacker, 'is wiped out and raises fresh levies at the keep');
    }
    return true;
  }

  reinforce(player, why) {
    const keep = this.keeps[player];
    if (!keep) return;
    this.spawn(player, keep.x, keep.y);
    this.game.say(`${this.game.players[player].name} ${why}.`);
  }

  // --- muster ---------------------------------------------------------------

  muster() {
    const p = this.game.current;
    if (this.chits[p] >= MAX_CHITS) return false;
    this.chits[p]++;
    this.game.say(`${this.game.player.name} musters — ${this.chits[p]} chit${this.chits[p] > 1 ? 's' : ''} in reserve.`);
    this.game.emit('rest');
    return true;
  }

  // --- area control ---------------------------------------------------------

  /** Contiguous runs of one banner. A run without your keep in it is cut off. */
  bannerRegions() {
    return this.game.board
      .regions((a, b) => a.banner != null && a.banner === b.banner)
      .filter((r) => r[0].banner != null);
  }

  /**
   * Territory is counted every few rounds rather than continuously — three
   * counts in a campaign, so holding ground at the right moment matters more
   * than holding it constantly, and the totals stay in a legible range.
   */
  endRound() {
    const g = this.game;
    this.roundsPlayed = (this.roundsPlayed || 0) + 1;

    // A keep with nobody home levies one fresh company a round, so losing your
    // whole army is a setback rather than the end.
    for (const p of g.players) if (!this.unitsOf(p.id).length) this.reinforce(p.id, 'raises a fresh company');

    if (this.roundsPlayed % SCORE_EVERY === 0) this.count();
    if (this.roundsPlayed >= CAMPAIGN_ROUNDS) {
      g.say('The campaign season ends.');
      g.finish();
    }
  }

  count() {
    const g = this.game;
    const tally = g.players.map(() => ({ held: 0, cut: 0, points: 0 }));

    for (const region of this.bannerRegions()) {
      const player = region[0].banner;
      const keep = this.keeps[player];
      const supplied = keep && region.some((c) => c.x === keep.x && c.y === keep.y);
      if (!supplied) { tally[player].cut += region.length; continue; }
      // Size, plus a bonus for the things worth holding ground for.
      let pts = region.length;
      for (const c of region) {
        for (const m of c.type.marks) {
          if (m.kind === 'beacon') pts += 1;
          if (['market', 'keep', 'library', 'armoury'].includes(m.kind)) pts += CITY_VALUE;
        }
      }
      tally[player].held += region.length;
      tally[player].points += pts;
    }

    for (const p of g.players) {
      const t = tally[p.id];
      p.score += t.points;
      g.say(`Levies counted — ${p.name} holds ${t.held} tiles in supply +${t.points}${t.cut ? `, ${t.cut} cut off` : ''}`);
    }
    g.emit('score');
    this.rounds.push(tally);
  }

  /** A last count when the deck runs out before the season does. */
  finish() {
    if ((this.roundsPlayed || 0) % SCORE_EVERY !== 0) this.count();
  }

  // --- UI -------------------------------------------------------------------

  figureStyle(u) { return { color: u.player, hero: false }; }

  actions() {
    const out = [];
    if (this.game.phase === 'move') {
      out.push({
        label: `Muster (${this.chits[this.game.current]}/${MAX_CHITS})`,
        fn: (g) => { if (this.muster()) g.endTurn(); },
        disabled: this.chits[this.game.current] >= MAX_CHITS,
      });
    }
    return out;
  }

  cellOverlay(cell) {
    return cell.banner == null ? null : { banner: cell.banner };
  }

  status() {
    const cut = this.bannerRegions()
      .filter((r) => {
        const k = this.keeps[r[0].banner];
        return !k || !r.some((c) => c.x === k.x && c.y === k.y);
      })
      .reduce((n, r) => n + r.length, 0);
    return `round ${this.game.round}${cut ? ` · ${cut} tiles cut off` : ''}`;
  }

  panel() {
    const rows = this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      const held = [...this.game.board.cells.values()].filter((c) => c.banner === i).length;
      const bits = [`${this.unitsOf(i).length} companies`, `${held} tiles`];
      if (this.chits[i]) bits.push(`${this.chits[i]} chit${this.chits[i] > 1 ? 's' : ''}`);
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${bits.join(' · ')}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    return `${rows}<p class="hint">Territory scores at the end of every round — but only if it can trace a path of your banners back to your keep.</p>`;
  }
}

Marches.spec = {
  id: 'marches',
  name: 'The Marches (war)',
  Mode: Marches,
  groups: ['base', 'marches', 'citylife'],
  minPlayers: 2,
  maxPlayers: 4,
  opening: 'Two keeps, and a lot of ground between them.',
  hint: 'Place a tile, then march a company. Territory scores each round only if it connects back to your keep.',
};
