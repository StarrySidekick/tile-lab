// ---------------------------------------------------------------------------
// Transient visual effects — everything on the board that moves because
// something happened, rather than because it's there.
//
// The game already broadcasts everything interesting: `emit('score', …)` is
// what makes the chime play. This is the same stream, drawn. Sound and picture
// are two subscribers to one event, which is why neither of them needed a hook
// of their own and why turning either off changes nothing else.
//
// An effect is data: a kind, a position in WORLD units (one tile = 1), a birth
// time and a lifespan. It cannot touch the game, nothing waits on it, and it's
// dropped the moment it expires — so effects can be switched off, capped, or
// fail to be created at all and the rules never notice. The drawing lives in
// render.js with the rest of the painting; this file decides only what exists
// and for how long.
//
// TWO THINGS make animation possible in a renderer that otherwise paints the
// current state and nothing else:
//
//   · VEILS. A tile in flight must not also be sitting at its destination, so
//     an effect can hide the thing it's animating, by key, until it lands. A
//     veil is a deadline rather than a flag — it can't leak, because it can't
//     outlive its clock even if the effect is never drawn again.
//   · A BIRTH IN THE FUTURE. Staggering is just an offset birth, which is how
//     the endgame tally walks the board and how a banner sweeps a region: one
//     spawn call, many effects, each waking up a moment later than the last.
//
// Positions come in from the events. Where an event has no meaningful place —
// The Marches counting levies across the whole map — nothing is drawn on the
// board and the panel does the telling instead. A "+14" over an unrelated tile
// is worse than no "+14" at all.
// ---------------------------------------------------------------------------

import { PLAYER_COLORS, THEME } from './theme.js';
import { rotPoint } from './tiles.js';
import { DESIGN } from './design.js';

const MAX_LIVE = 120;         // a runaway effect list is a frame-rate bug

export const LIFE = {
  float: 1500,
  flash: 950,
  ring: 520,
  land: 400,
  tile: 260,                  // a tile flying in from the preview
  gustTile: 420,              // a tile the wind moves — slower, so the eye follows
  wind: 900,                  // the streak of a gust sweeping its lane
  figure: 420,                // a follower hopping to where it's going
  fall: 900,                  // drifting away, or going under
  sweep: 260,                 // per cell; a region takes as long as it's wide
};

const TALLY_STEP = 260;       // between features, when the game settles up

export class Effects {
  constructor({ enabled = true } = {}) {
    this.items = [];
    this.veils = new Map();          // key -> the time it stops being hidden
    this.enabled = enabled;
    // Where a tile or a follower comes from when it enters play. main.js sets
    // this to the preview panel, converted to world units; without it, things
    // simply appear where they land.
    this.entryAt = null;
    this.tally = 0;                  // stagger for the endgame, reset by `clear`
  }

  clear() {
    this.items.length = 0;
    this.veils.clear();
    this.tally = 0;
  }

  add(item) {
    if (!this.enabled) return null;
    const born = performance.now() + (item.delay || 0);
    const made = { ...item, born };
    this.items.push(made);
    if (this.items.length > MAX_LIVE) this.items.splice(0, this.items.length - MAX_LIVE);
    return made;
  }

  /** Drop what's expired. Called once a frame by the renderer. */
  live(now) {
    if (this.items.length) this.items = this.items.filter((e) => now - e.born < e.life);
    // A veil is normally cleared by the thing that asks about it, but nobody
    // asks about a cell that's scrolled off the screen. Sweep them now and then
    // rather than leaving one entry per tile ever played.
    if (this.veils.size > 48) {
      for (const [key, until] of this.veils) if (until <= now) this.veils.delete(key);
    }
    return this.items;
  }

  // --- veils ----------------------------------------------------------------

  /** Hide something the renderer would otherwise draw, for `ms`. */
  veil(key, ms) {
    if (!this.enabled) return;
    this.veils.set(key, performance.now() + ms);
  }

  veiled(key) {
    const until = this.veils.get(key);
    if (until == null) return false;
    if (until <= performance.now()) { this.veils.delete(key); return false; }
    return true;
  }

  // --- the pieces -----------------------------------------------------------

  float(x, y, text, color, delay = 0) {
    return this.add({ kind: 'float', x, y, text, color, delay, life: LIFE.float });
  }

  flash(cells, color, delay = 0) {
    if (!cells || !cells.length) return null;
    return this.add({ kind: 'flash', cells, color, delay, life: LIFE.flash });
  }

  ring(x, y, color, r = 0.55, space = 'board') {
    return this.add({ kind: 'ring', x, y, color, r, space, life: LIFE.ring });
  }

  land(x, y, delay = 0) {
    return this.add({ kind: 'land', x, y, delay, life: LIFE.land });
  }

  /**
   * A tile arriving. `lift` is where it settles vertically, which is how a
   * Strata tile rises onto the stack it just covered instead of appearing on
   * top of it.
   */
  flyTile({ from, to, type, rot, lift = 0, from_lift = null, delay = 0, life = LIFE.tile, solid = false }) {
    const e = this.add({
      kind: 'tile', from: from || to, to, type, rot, solid,
      lift0: from_lift == null ? lift : from_lift, lift1: lift,
      delay, life,
    });
    if (e) this.veil(`tile:${to.x},${to.y}`, (e.delay || 0) + life);
    return e;
  }

  /** A follower going somewhere: hops, in an arc, and is hidden until it lands. */
  flyFigure({ from, to, color, key, style = null, delay = 0, life = LIFE.figure }) {
    const e = this.add({ kind: 'figure', from: from || to, to, color, style, delay, life });
    if (e && key) this.veil(key, (e.delay || 0) + life);
    return e;
  }

  /** A tile leaving the board: blown off the edge, or going under the water. */
  fall(cells, how = 'blow', delay = 0) {
    if (!cells?.length) return;
    cells.forEach((c, i) => {
      this.add({
        kind: 'fall', x: c.x, y: c.y, type: c.type, rot: c.rot, how,
        spin: how === 'blow' ? (i % 2 ? 0.5 : -0.5) : 0.08,
        drift: how === 'blow' ? 1.6 : 0,
        delay: delay + i * 45,
        life: LIFE.fall,
      });
    });
  }

  /** A colour running across a region, cell by cell, out from where it started. */
  sweep(cells, color, origin) {
    if (!cells?.length) return;
    const o = origin || cells[0];
    for (const c of cells) {
      const step = Math.abs(c.x - o.x) + Math.abs(c.y - o.y);
      this.add({ kind: 'sweep', x: c.x, y: c.y, color, delay: step * 55, life: LIFE.sweep + 240 });
    }
  }

  // --- the event stream -----------------------------------------------------

  /**
   * One game event in, whatever it should look like out. `game` is only ever
   * read from — for the fallback position, and to know whether the game is
   * settling up, which is the one time effects deliberately queue rather than
   * all happen at once.
   */
  on(kind, data = {}, game = null) {
    if (!this.enabled) return;
    const laid = game?.lastPlaced;
    const here = data.at || null;
    const space = data.space || 'board';

    switch (kind) {
      case 'score': {
        if (!here) return;
        // At the end, everything scores in one frame. Walking the features one
        // at a time is the difference between a number changing and a result.
        const wait = game?.phase === 'over' ? this.tally++ * TALLY_STEP : 0;
        const winners = data.players?.length ? data.players : [data.player ?? game?.current ?? 0];
        // Points can go DOWN: Girando takes a city's payment back when the wind
        // blows it open again. A clawback wants its own sign and its own
        // colour, or "+-4" flashes up in the colour of a reward.
        const back = data.points < 0;
        winners.forEach((p, i) => {
          this.float(here.x, here.y - i * 0.4, signed(data.points),
            back ? LOSS : colorOf(p), wait);
        });
        this.flash(data.cells, back ? LOSS : colorOf(winners[0]), wait);
        return;
      }

      case 'levy': {
        // The Marches counting up. The territory lights, then says what it paid.
        if (!data.cells?.length) return;
        this.sweep(data.cells, data.supplied ? colorOf(data.player) : '#6d6459', data.at);
        if (here && data.points) this.float(here.x, here.y, `+${data.points}`, colorOf(data.player), 220);
        return;
      }

      case 'banner':
        // Ground changing hands: the colour runs out through everything it
        // just joined, so you see the shape of what you now hold.
        if (data.cells?.length) this.sweep(data.cells, colorOf(data.player), here);
        return;

      case 'landmark': {
        const at = here || (laid ? centre(laid) : null);
        if (!at) return;
        if (data.points) this.float(at.x, at.y, `+${data.points}`, THEME.gold);
        else this.ring(at.x, at.y, THEME.gold, 0.7, space);
        return;
      }

      case 'treasure': {
        // Underground, where the interior has its own camera.
        if (!here) return;
        this.ring(here.x, here.y, THEME.gold, 0.6, space);
        if (data.points) {
          this.add({
            kind: 'float', x: here.x, y: here.y, text: `+${data.points}`,
            color: THEME.gold, space, life: LIFE.float,
          });
        }
        return;
      }

      case 'place': {
        const cells = data.cells?.length ? data.cells : (laid ? [laid] : []);
        cells.forEach((cell, i) => {
          const to = centre(cell);
          // A tile comes in from the preview — the place you were just looking
          // at — rather than blinking into existence under the cursor.
          this.flyTile({
            from: this.entryAt?.() || null,
            to,
            type: cell.type,
            rot: cell.rot,
            lift: (cell.h || 0) * 0.08,
            from_lift: 0,               // …and rises onto whatever it covered
            delay: i * 70,
          });
          this.land(to.x, to.y, i * 70 + LIFE.tile * 0.7);
        });
        return;
      }

      case 'meeple': {
        const color = colorOf(data.player ?? game?.current ?? 0);
        // Called home: it leaves the board the way it came, and there's
        // nothing to veil because it's already off.
        if (data.recall) {
          if (!here) return;
          this.flyFigure({ from: here, to: this.entryAt?.() || here, color });
          this.ring(here.x, here.y, color, 0.5);
          return;
        }
        if (!laid) return;
        const at = here || spotOn(laid, data.feat) || centre(laid);
        this.flyFigure({
          from: this.entryAt?.(),
          to: at,
          color,
          key: `meeple:${laid.x},${laid.y}`,
        });
        this.ring(at.x, at.y, color, 0.5);
        return;
      }

      case 'step':
      case 'warp': {
        // A figure that moved: it walks (or flickers) rather than teleporting.
        if (!data.from || !here) return;
        this.flyFigure({
          from: data.from,
          to: here,
          color: colorOf(data.player ?? game?.current ?? 0),
          key: data.key,
          style: data.style || null,
          delay: data.delay || 0,
          life: kind === 'warp' ? 300 : LIFE.figure,
        });
        if (kind === 'warp') {
          this.ring(data.from.x, data.from.y, THEME.teal, 0.6);
          this.ring(here.x, here.y, THEME.teal, 0.6);
        }
        return;
      }

      case 'gust': {
        // Everything the wind shoved, sliding one square at once, and whatever
        // it pushed off the edge tumbling after it. `delay` staggers the gusts
        // of one storm so a chain plays out as a sequence you can follow
        // rather than a single instantaneous rearrangement.
        const at = data.delay || 0;
        for (const m of data.moves || []) {
          this.flyTile({ from: m.from, to: m.at, type: m.type, rot: m.rot, delay: at, life: DESIGN.storm.tileGlide, solid: true });
        }
        if (data.fell?.length) this.fall(data.fell, 'blow', at);
        return;
      }

      case 'wind': {
        // The gust itself: an ink streak sweeping down the lane, so the path
        // the weather takes is a thing you watch rather than reconstruct.
        this.add({
          kind: 'wind', from: data.from, to: data.to, dir: data.dir,
          blast: !!data.blast, delay: data.delay || 0, life: LIFE.wind,
        });
        return;
      }

      case 'wake': {
        // A zephyr the storm reached and set off. The ring is the "this one
        // fires next" cue, timed just before its own gust plays.
        this.add({
          kind: 'ring', x: data.at.x, y: data.at.y, color: data.blast ? '#8a3f28' : THEME.tealDeep,
          r: 0.62, space: 'board', delay: data.delay || 0, life: LIFE.ring + 260,
        });
        this.flash([{ x: data.at.x - 0.5, y: data.at.y - 0.5 }], data.blast ? '138,63,40' : '47,111,104', data.delay || 0);
        return;
      }

      case 'drift':
        this.fall(data.cells, 'blow');
        return;

      case 'drown':
        this.fall(data.cells, 'sink');
        return;

      case 'deny':
        if (here) this.ring(here.x, here.y, '#a8443a', 0.5, space);
        return;

      default:
        return;
    }
  }
}

const colorOf = (p) => PLAYER_COLORS[(p || 0) % PLAYER_COLORS.length];

/** Points can be negative; a minus sign is not a plus sign. */
const signed = (n) => (n < 0 ? `${n}` : `+${n}`);

/** What a payment being taken back looks like: dust, not gold. */
const LOSS = '#a8443a';

/** A cell's middle, in world units. */
export const centre = (cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });

/** Where on a tile a given feature's follower stands, if we know the feature. */
function spotOn(cell, feat) {
  if (feat == null || !cell.type?.spots?.[feat]) return null;
  const [sx, sy] = rotPoint(cell.type.spots[feat], cell.rot);
  return { x: cell.x + sx, y: cell.y + sy };
}
