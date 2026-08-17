// ---------------------------------------------------------------------------
// Girando — the cloud kingdom, where the board itself is weather.
//
// The old version of this mode (Cirrus) let you lift any loose tile and put it
// somewhere better. That made the board changeable, but it made *you* the only
// thing changing it. Girando takes the verb away from the player and gives it
// to the sky: you place tiles and claim features like Carcassonne, and then
// the wind rearranges the country underneath you.
//
// THE ZEPHYR is the engine. Play one and it blows down its lane — everything
// in that row or column, downwind, slides one square. Tiles that end up
// touching nothing fall out of the sky and go back in the deck. Followers
// standing on a road get blown off it; followers inside a city are behind
// walls and ride it out. A zephyr caught by another zephyr fires in its turn,
// so a good line of them is a chain reaction.
//
// A TEMPLE is a monastery nobody owns. It scores nothing. When the country
// closes around it, it exhales: every lane on the board moves one square the
// way it faces. Shove one with a zephyr and it pays you 2 — it likes the wind.
//
// THE WINDVANE AND THE VESTIBULE have four ways in and only two of them
// joined, and the wind decides which two. A road that ran through one is a
// dead end after the next gust, and a city that was two tiles from finishing
// might now be finished, or might never be. Every edge matches, so they always
// fit; what changes is what runs through them.
//
// THE SKYWALL is the only thing that stops any of this — nothing in its lee
// gets touched. Crystallised tiles don't move either, so everything you finish
// becomes a windbreak, and the board slowly grows a skeleton it can't lose.
//
// FLUTITANTES are terrain built on a hull. They're the only tiles you may pick
// up and move yourself, and the only ones that survive being stranded in open
// sky. They're what's left of Cirrus's lifting, narrowed to the tiles that are
// supposed to do it.
//
// The thesis is in one line: SCORING IS NOT GUARANTEED. Nothing pays until it
// closes, nothing that hasn't closed pays at the end, and the wind is under no
// obligation to leave your city where you built it.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { TILE_TYPES, MARKS, CENTRE_FEATURES, buildDeck } from '../tiles.js';
import { PLAYER_COLORS } from '../theme.js';
import { partOfScored } from '../mechanics.js';
import { storm, zephyrOn, worldDir, isRaft, isWall } from '../wind.js';

const HAND = 3;
const DECK_SIZE = 46;
const SEASON = 20;           // rounds; tiles come back, so the clock has to be real
const TEMPLE_SHOVE = 2;      // for blowing a temple with a zephyr
const MAX_CHAIN = 6;         // temples setting off temples

/** Girando plays the open junctions instead of the base set's terminators. */
const OPEN_JUNCTIONS = { W: 'Gw', L: 'Gl' };

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
    // A road running into a 3-way junction should carry on through it, not
    // stop there. Fewer closures means fewer crystals means more weather.
    return deck.map((id) => OPEN_JUNCTIONS[id] || id);
  }

  setup() {
    this.hands = this.game.players.map(() => []);
    this.crystals = 0;
    this.gusts = 0;
    this.fallen = 0;
    this.blowing = false;
    this.queued = [];
    const seed = this.game.board.get(0, 0);
    if (seed) seed.anchored = true;          // the founding stone stays put
  }

  // --- the hand -------------------------------------------------------------

  /** The hand IS the market row — same picker, different refill rule. */
  drawNext() {
    this.game.fillMarket(HAND, this.hands[this.game.current]);
  }

  /** Hands are private, so the host can't see them to know when to stop. */
  anythingLeft() {
    return this.game.deck.length > 0 || this.hands[this.game.current].length > 0;
  }

  // --- placing --------------------------------------------------------------

  afterPlace(cell) {
    cell.round = this.game.round;
    const z = zephyrOn(cell);
    if (z) {
      this.game.say(`${this.game.player.name} lets the zephyr out.`);
      this.weather({ dir: worldDir(cell, z), from: { x: cell.x, y: cell.y } }, this.game.current);
    }
    return 'meeple';
  }

  // --- the weather ----------------------------------------------------------

  /**
   * Blow, then pay for whatever that finished, then blow again if a temple
   * closed while the dust was settling.
   *
   * Re-entrant on purpose: a gust can complete a temple, and a temple exhaling
   * is another gust. Rather than recursing through `onClosed` — which would
   * interleave two storms and score them in an order nobody could follow —
   * anything raised mid-storm is queued and run after the current one lands.
   */
  weather(spec, by) {
    if (this.blowing) { this.queued.push([spec, by]); return; }
    this.blowing = true;
    try {
      let job = [spec, by];
      for (let n = 0; job && n < MAX_CHAIN; n++) {
        for (const report of storm(this.game.board, job[0])) this.applyGust(report, job[1]);
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
  applyGust(r, by) {
    const g = this.game;
    this.gusts++;
    if (!r.moved.length && !r.swung.length) return;

    g.emit('gust', {
      dir: r.dir,
      moves: r.moved.map((m) => ({
        from: { x: m.from.x + 0.5, y: m.from.y + 0.5 },
        at: { x: m.cell.x + 0.5, y: m.cell.y + 0.5 },
        type: m.cell.type, rot: m.cell.rot,
      })),
      fell: r.fell.map((f) => ({ x: f.x, y: f.y, type: f.type, rot: f.rot })),
    });

    // Tiles that end up touching nothing go back in the deck — the sky keeps
    // what it takes, and hands it back later.
    for (const f of r.fell) {
      g.deck.push(f.id);
      if (f.meeple) g.players[f.meeple.player].meeples++;
      this.fallen++;
    }
    if (r.fell.length) {
      g.say(`${r.fell.length} tile${r.fell.length > 1 ? 's' : ''} blow off the edge of the world.`);
    }

    for (const m of r.unseated) {
      g.players[m.player].meeples++;
      g.say(`${g.players[m.player].name}'s follower is blown off the road at (${m.x}, ${m.y}).`);
    }

    if (r.swung.length) {
      g.say(`${r.swung.length} vane${r.swung.length > 1 ? 's' : ''} swing${r.swung.length > 1 ? '' : 's'} into the wind.`);
    }

    // A temple likes being shoved.
    if (by != null) {
      for (const cell of r.temples) {
        g.players[by].score += TEMPLE_SHOVE;
        g.say(`${g.players[by].name} rattles the temple at (${cell.x}, ${cell.y}) +${TEMPLE_SHOVE}`);
        g.emit('score', {
          points: TEMPLE_SHOVE, player: by,
          at: { x: cell.x + 0.5, y: cell.y + 0.5 }, cells: [{ x: cell.x, y: cell.y }],
        });
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
    if (d.type === 'temple') return this.templeCloses(d, closer);

    const winners = this.game.board.majority(d);
    this.game.award(d, false, closer);
    const bonus = this.crystallise(d);
    if (bonus && winners.length) {
      for (const p of winners) this.game.players[p].score += bonus;
      this.game.say(`Skyholds in the ${d.type} → ${winners.map((p) => this.game.players[p].name).join(' & ')} +${bonus}`);
    }
  }

  /** Everything in a finished feature turns to permanent land. */
  crystallise(d) {
    const board = this.game.board;
    let bonus = 0;
    for (const cell of board.cellsOf(d)) {
      if (cell.anchored) continue;
      cell.anchored = true;
      this.crystals++;
      for (const m of cell.type.marks) bonus += MARKS[m.kind]?.score || 0;
    }
    return bonus;
  }

  /**
   * A temple pays nobody. What it does instead is breathe out: every lane on
   * the board moves one square the way it faces.
   */
  templeCloses(d, by) {
    const board = this.game.board;
    const cell = board.get(d.at.x, d.at.y);
    if (!cell) return;
    cell.anchored = true;
    this.crystals++;
    const feat = cell.type.feats.find((f) => f.type === 'temple');
    const dir = ((feat?.face ?? 0) + cell.rot) % 4;
    this.game.say(`The temple at (${cell.x}, ${cell.y}) is enclosed, and exhales ${['north', 'east', 'south', 'west'][dir]}.`);
    this.game.emit('landmark');
    this.weather({ dir, everywhere: true }, by);
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
    if (!cell || !isRaft(cell) || cell.anchored || cell.meeple) return false;
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
    if (this.game.round > SEASON) {
      this.game.say('The season turns, and the wind drops.');
      this.game.finish();
    }
    if (this.game.board.size === 0) this.game.finish();
  }

  // --- what a computer player can't see -------------------------------------
  //
  // The bot reads the board: what closed, who holds it, what it pays. None of
  // that includes the weather, and in this mode the weather is the game.

  botPlaceBonus(cells, player) {
    const board = this.game.board;
    let value = 0;
    for (const cell of cells) {
      // Ground in a wall's lee keeps what you build on it.
      for (const other of board.cells.values()) {
        if (!isWall(other)) continue;
        if (other.x === cell.x || other.y === cell.y) { value += 0.6; break; }
      }
      const z = zephyrOn(cell);
      if (!z) continue;
      // What this gust would knock about: temples pay, and a follower of
      // someone else's blown off a road is worth having done.
      const dir = worldDir(cell, z);
      const vertical = dir === 0 || dir === 2;
      const back = dir === 0 || dir === 3 ? -1 : 1;
      for (const other of board.cells.values()) {
        if (other.anchored) continue;
        const inLane = vertical
          ? other.x === cell.x && Math.sign(other.y - cell.y) === back
          : other.y === cell.y && Math.sign(other.x - cell.x) === back;
        if (!inLane) continue;
        if (other.type.feats.some((f) => f.type === 'temple')) value += TEMPLE_SHOVE;
        if (other.meeple && other.meeple.player !== player
          && other.type.feats[other.meeple.feat]?.type === 'road') value += 1.5;
        if (other.meeple && other.meeple.player === player) value -= 1.5;
      }
    }
    return value;
  }

  // --- UI -------------------------------------------------------------------

  /** Solid land reads hard-edged; everything else reads as weather. */
  cellOverlay(cell) {
    const out = cell.anchored ? { crystal: true } : { cloud: true };
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
    const solid = [...this.game.board.cells.values()].filter((c) => c.anchored).length;
    return `round ${Math.min(this.game.round, SEASON)}/${SEASON} · ${solid} solid · ${this.game.board.size - solid} still cloud`;
  }

  panel() {
    const rows = this.game.players.map((p, i) => {
      const active = i === this.game.current && this.game.phase !== 'over';
      const meeples = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(Math.max(0, 7 - p.meeples))}</span>`;
      return `<div class="player ${active ? 'active' : ''}">
          <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
          <span class="pname">${p.name}</span>
          <span class="pmeta">${this.hands[i].length} in hand ${meeples}</span>
          <span class="pscore">${p.score}</span>
        </div>`;
    }).join('');
    return `${rows}<p class="hint">${this.gusts} gust${this.gusts === 1 ? '' : 's'} · ${this.fallen} tile${this.fallen === 1 ? '' : 's'} lost to the sky. Nothing pays until it closes, and nothing pays at the end.</p>`;
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
  market: false,             // the hand is its own row
  marketDiscards: false,
  tideStart: 5,
  opening: 'A first stone hangs in the cloud. Everything else is weather.',
  hint: 'Claim features as normal — but a zephyr blows its whole lane one square, temples blow the entire board, and nothing unfinished ever pays.',
};
