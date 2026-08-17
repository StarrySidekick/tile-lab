// ---------------------------------------------------------------------------
// Transient visual effects — the score numbers that float off the board, and
// the flashes that say which tiles just paid.
//
// The game already broadcasts everything interesting: `emit('score', …)` is
// what makes the chime play. This is the same stream, drawn. Sound and picture
// are two subscribers to one event, which is why neither of them needed a hook
// of their own and why turning either off changes nothing else.
//
// An effect is data: a kind, a position in WORLD units (one tile = 1), a birth
// time and a lifespan. It cannot touch the game, nothing waits on it, and it
// is dropped the moment it expires — so effects can be switched off, capped,
// or fail to be created at all and the rules never notice. The drawing lives
// in render.js with the rest of the painting; this file decides only what
// exists and for how long.
//
// Events carry a position where one is meaningful (`at`), and where it isn't —
// The Marches counting its levies across the whole map — no number floats and
// the panel does the telling instead. A "+14" over an unrelated tile is worse
// than no "+14" at all.
// ---------------------------------------------------------------------------

import { PLAYER_COLORS, THEME } from './theme.js';

const MAX_LIVE = 64;          // a runaway effect list is a frame-rate bug

export const LIFE = {
  float: 1500,
  flash: 950,
  ring: 520,
  land: 400,
};

export class Effects {
  constructor({ enabled = true } = {}) {
    this.items = [];
    this.enabled = enabled;
  }

  clear() { this.items.length = 0; }

  add(item) {
    if (!this.enabled) return null;
    const born = performance.now();
    this.items.push({ born, ...item });
    if (this.items.length > MAX_LIVE) this.items.splice(0, this.items.length - MAX_LIVE);
    return item;
  }

  /** Drop what's expired. Called once a frame by the renderer. */
  live(now) {
    if (this.items.length) this.items = this.items.filter((e) => now - e.born < e.life);
    return this.items;
  }

  // --- the pieces -----------------------------------------------------------

  float(x, y, text, color) {
    return this.add({ kind: 'float', x, y, text, color, life: LIFE.float });
  }

  flash(cells, color) {
    if (!cells || !cells.length) return null;
    return this.add({ kind: 'flash', cells, color, life: LIFE.flash });
  }

  ring(x, y, color, r = 0.55) {
    return this.add({ kind: 'ring', x, y, color, r, life: LIFE.ring });
  }

  land(x, y) {
    return this.add({ kind: 'land', x, y, life: LIFE.land });
  }

  // --- the event stream -----------------------------------------------------

  /**
   * One game event in, whatever it should look like out. `game` is only ever
   * read from, and only for the fallback position — the tile just played.
   */
  on(kind, data = {}, game = null) {
    if (!this.enabled) return;
    const laid = game?.lastPlaced;
    const here = data.at || null;

    switch (kind) {
      case 'score': {
        // Several players can be paid by one closure, so the numbers stack
        // rather than sitting on top of each other.
        if (!here) return;
        const winners = data.players?.length ? data.players : [data.player ?? game?.current ?? 0];
        winners.forEach((p, i) => {
          this.float(here.x, here.y - i * 0.4, `+${data.points}`, PLAYER_COLORS[p % PLAYER_COLORS.length]);
        });
        this.flash(data.cells, PLAYER_COLORS[winners[0] % PLAYER_COLORS.length]);
        return;
      }

      case 'landmark': {
        const at = here || (laid ? centre(laid) : null);
        if (!at) return;
        if (data.points) {
          this.float(at.x, at.y, `+${data.points}`, THEME.gold);
        } else {
          this.ring(at.x, at.y, THEME.gold, 0.7);
        }
        return;
      }

      case 'place':
        if (laid) this.land(laid.x + 0.5, laid.y + 0.5);
        return;

      case 'meeple':
        if (laid) this.ring(laid.x + 0.5, laid.y + 0.5, PLAYER_COLORS[(game?.current ?? 0) % PLAYER_COLORS.length]);
        return;

      case 'deny':
        if (here) this.ring(here.x, here.y, '#a8443a', 0.5);
        return;

      default:
        return;
    }
  }
}

/** A cell's middle, in world units. */
export const centre = (cell) => ({ x: cell.x + 0.5, y: cell.y + 0.5 });
