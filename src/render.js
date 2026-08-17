// ---------------------------------------------------------------------------
// Canvas rendering + camera. Everything happens in "world units" where one
// tile is exactly 1x1, so the camera is just a scale and an offset.
//
// The cave overlay is a second, independent little viewport drawn on top with
// its own fixed camera — same Board, same tile art, different transform.
// ---------------------------------------------------------------------------

import { drawTile, drawMeeple, PLAYER_COLORS } from './art.js';
import { tileSprite } from './sprites.js';
import { LIGHT } from './light.js';
import { THEME, applyDusk } from './theme.js';
import { rotPoint } from './tiles.js';
import { liftableCells } from './mechanics.js';

// Move targets, in the order you want to notice them. Green is the plain "you
// can go here"; teal is a special move (a road dash, a warp, a fight); red is
// one that costs you something.
const MOVE_OK = { rgb: '124,196,108', line: '#7cc46c' };
const MOVE_SPECIAL = { rgb: '95,191,174', line: THEME.teal };
const MOVE_COSTLY = { rgb: '196,104,80', line: '#c46850' };

/** Fast then slow — the shape almost everything transient here moves on. */
const ease = (t) => 1 - (1 - t) ** 3;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0.5, y: 0.5, zoom: 96 };
    this.hover = null;      // grid cell under the pointer
    this.pointer = null;    // raw screen coords, needed for the cave overlay
    this.showDebug = false;
    this.showHints = true;  // highlight every square the tile could go in
    this.meepleSpots = [];
    this.pawnSpots = [];
    this.moveSpots = [];
    this.caveView = null;
    this.fx = null;         // an Effects list, if anyone has given us one
    this.glide = null;      // a camera easing somewhere
    this.shownWater = null; // where the sea has got to, chasing the waterline
    this.resize();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.w = r.width;
    this.h = r.height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toScreen(wx, wy) {
    return [(wx - this.cam.x) * this.cam.zoom + this.w / 2,
            (wy - this.cam.y) * this.cam.zoom + this.h / 2];
  }

  toWorld(sx, sy) {
    return [(sx - this.w / 2) / this.cam.zoom + this.cam.x,
            (sy - this.h / 2) / this.cam.zoom + this.cam.y];
  }

  cellAt(sx, sy) {
    const [wx, wy] = this.toWorld(sx, sy);
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  zoomAt(sx, sy, factor) {
    const [wx, wy] = this.toWorld(sx, sy);
    this.cam.zoom = Math.max(28, Math.min(320, this.cam.zoom * factor));
    const [nx, ny] = this.toWorld(sx, sy);
    this.cam.x += wx - nx;
    this.cam.y += wy - ny;
  }

  centerOn(x, y) {
    this.cam.x = x + 0.5;
    this.cam.y = y + 0.5;
    this.glide = null;
  }

  /**
   * Ease the camera to a square instead of jumping to it. Used when the
   * computer plays somewhere you weren't looking — a cut leaves you hunting
   * for what changed, a glide tells you where it is on the way.
   *
   * Skipped when the square is already comfortably on screen, because the most
   * annoying camera is one that moves when it didn't need to.
   */
  glideTo(x, y, dur = 480) {
    const [sx, sy] = this.toScreen(x + 0.5, y + 0.5);
    const m = this.cam.zoom * 1.2;
    if (sx > m && sy > m && sx < this.w - m && sy < this.h - m) return false;
    this.glide = {
      x0: this.cam.x, y0: this.cam.y, x1: x + 0.5, y1: y + 0.5,
      t0: performance.now(), dur,
    };
    return true;
  }

  glideStep() {
    const g = this.glide;
    if (!g) return;
    const t = Math.min(1, (performance.now() - g.t0) / g.dur);
    const k = t * t * (3 - 2 * t);                 // smoothstep: no jerk at either end
    this.cam.x = g.x0 + (g.x1 - g.x0) * k;
    this.cam.y = g.y0 + (g.y1 - g.y0) * k;
    if (t >= 1) this.glide = null;
  }

  /**
   * Paint one tile at a grid position — the one call every tile goes through.
   *
   * Prefers a cached sprite and falls back to running the paths, which is what
   * happens when a tile is drawn bigger than the largest sprite. The two paths
   * produce identical pictures; the sprite is just the same drawing, already
   * done. Note the rotation is handled differently in each: the sprite has it
   * baked in, so it must NOT be applied again here.
   */
  paintTile(x, y, rot, type, terrain = 'surface', zoom = this.cam.zoom, origin = null) {
    const dpr = window.devicePixelRatio || 1;
    const sprite = tileSprite(type, rot, terrain, zoom * dpr);
    if (!sprite) {
      this.inCell(x, y, rot, (c) => drawTile(c, type, { terrain, rot }), zoom, origin);
      return;
    }
    const [sx, sy] = origin ? origin(x, y) : this.toScreen(x, y);
    // A hair of overlap. Tiles land on fractional pixels, and without it two
    // neighbours can each give up a sliver of their shared edge to rounding
    // and leave a backdrop-coloured hairline between them.
    this.ctx.drawImage(sprite, sx, sy, zoom + 0.5, zoom + 0.5);
  }

  inCell(x, y, rot, fn, zoom = this.cam.zoom, origin = null) {
    const ctx = this.ctx;
    const [sx, sy] = origin ? origin(x, y) : this.toScreen(x, y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(zoom, zoom);
    if (rot) {
      ctx.translate(0.5, 0.5);
      ctx.rotate((rot & 3) * Math.PI / 2);
      ctx.translate(-0.5, -0.5);
    }
    fn(ctx);
    ctx.restore();
  }

  // --- main pass ------------------------------------------------------------

  draw(game) {
    const ctx = this.ctx;
    this.glideStep();
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawBackdrop();
    if (game.options?.tide) this.drawWater(game);

    const fog = game.options?.fog ? this.fogSet(game) : null;

    for (const cell of game.board.cells.values()) {
      if (!this.onScreen(cell.x, cell.y)) continue;
      if (this.fx?.veiled(`tile:${cell.x},${cell.y}`)) continue;   // still in the air
      const overlay = game.m.cellOverlay?.(cell) || null;
      const lift = (overlay?.lift || 0) * 0.08;
      if (lift) this.drawStackShadow(cell, lift);
      ctx.save();
      if (fog && !fog.has(`${cell.x},${cell.y}`)) ctx.globalAlpha = 0.26;
      this.paintTile(cell.x, cell.y - lift, cell.rot, cell.type);
      ctx.restore();
      if (overlay) this.drawCellOverlay(cell, overlay, lift);
    }

    if (game.phase === 'lift') this.drawCellTargets(game.m.allLiftable ? game.m.allLiftable() : liftableCells(game.board), THEME.violet, '107,90,140');
    if (game.phase === 'recall') this.drawCellTargets(game.myMeeples(), MOVE_COSTLY.line, MOVE_COSTLY.rgb);
    if (game.phase === 'walk') this.drawCellTargets(game.pendingWalk?.targets || [], MOVE_OK.line, MOVE_OK.rgb);
    if (game.phase === 'place') this.drawPlacementHints(game);

    this.drawMeeples(game);
    if (game.phase === 'meeple') this.drawMeepleTargets(game);
    else this.meepleSpots = [];

    if (game.walker) this.drawPawns(game);
    else { this.pawnSpots = []; this.moveSpots = []; }

    if (this.showDebug) this.drawDebug(game);

    applyDusk(ctx, this.w, this.h);

    // Effects sit above the dusk wash. A score you can't read is not a score
    // you can read dimly — it's one you miss.
    this.drawEffects();

    // Interiors sit above that — you're indoors, not outdoors.
    if (game.interior) this.drawInterior(game); else this.caveView = null;
  }

  onScreen(x, y) {
    const [sx, sy] = this.toScreen(x, y);
    const z = this.cam.zoom;
    return sx > -z && sy > -z && sx < this.w + z && sy < this.h + z;
  }

  drawBackdrop() {
    const ctx = this.ctx;
    ctx.fillStyle = THEME.night;
    ctx.fillRect(0, 0, this.w, this.h);
    const z = this.cam.zoom;
    if (z < 40) return;
    ctx.strokeStyle = THEME.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.w, this.h);
    for (let x = Math.floor(x0); x <= x1; x++) {
      const [sx] = this.toScreen(x, 0);
      ctx.moveTo(Math.round(sx) + 0.5, 0);
      ctx.lineTo(Math.round(sx) + 0.5, this.h);
    }
    for (let y = Math.floor(y0); y <= y1; y++) {
      const [, sy] = this.toScreen(0, y);
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(this.w, Math.round(sy) + 0.5);
    }
    ctx.stroke();
  }

  // --- overlays the modes ask for -------------------------------------------

  /**
   * Strata: a dropped shadow under a raised tile sells the height. It falls
   * the same way every other shadow on the board does — a lifted tile is the
   * biggest raised thing in the game, so it's the one that would look most
   * wrong lit from its own private direction.
   */
  drawStackShadow(cell, lift) {
    const ctx = this.ctx;
    const [sx, sy] = this.toScreen(cell.x, cell.y);
    const z = this.cam.zoom;
    const d = lift + 0.03;
    ctx.fillStyle = 'rgba(8,6,12,0.55)';
    ctx.fillRect(sx - LIGHT.x * d * z, sy - LIGHT.y * d * z, z, z);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(sx, sy - lift * z + z, z, lift * z);
  }

  drawCellOverlay(cell, overlay, lift) {
    const ctx = this.ctx;
    const [sx, sy0] = this.toScreen(cell.x, cell.y);
    const sy = sy0 - lift * this.cam.zoom;
    const z = this.cam.zoom;

    if (overlay.banner != null) {
      // Ground that can't trace a path home scores nothing, so it shouldn't
      // look like ground that can: the colour drains out of it and the pennant
      // hangs grey.
      const color = overlay.cut ? '#6f665b' : PLAYER_COLORS[overlay.banner];
      ctx.save();
      ctx.globalAlpha = overlay.cut ? 0.10 : 0.16;
      ctx.fillStyle = color;
      ctx.fillRect(sx, sy, z, z);
      ctx.restore();
      ctx.fillStyle = color;                       // corner pennant
      ctx.beginPath();
      ctx.moveTo(sx + z, sy);
      ctx.lineTo(sx + z, sy + z * 0.26);
      ctx.lineTo(sx + z * 0.74, sy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (overlay.lift) {
      ctx.fillStyle = THEME.gold;
      ctx.font = `600 ${Math.max(9, z * 0.15)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`▲${overlay.lift + 1}`, sx + z * 0.06, sy + z * 0.06);
    }

    // Cirrus: solid land is hard-edged, cloud is hazed and cool. The two have
    // to be distinguishable at a glance or the lift rules read as arbitrary.
    if (overlay.crystal) {
      ctx.strokeStyle = 'rgba(95,191,174,0.75)';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx + 1, sy + 1, z - 2, z - 2);
    }
    // A flutitante wears its hull, because "which of these can I move" is a
    // question you ask every turn and shouldn't have to answer from memory.
    if (overlay.raft) {
      ctx.save();
      ctx.strokeStyle = 'rgba(155,120,78,0.95)';
      ctx.lineWidth = 3;
      ctx.setLineDash([z * 0.16, z * 0.09]);
      ctx.strokeRect(sx + 2.5, sy + 2.5, z - 5, z - 5);
      ctx.restore();
    }

    if (overlay.cloud) {
      const haze = ctx.createLinearGradient(sx, sy, sx, sy + z);
      haze.addColorStop(0, 'rgba(206,222,240,0.20)');
      haze.addColorStop(0.55, 'rgba(186,204,228,0.10)');
      haze.addColorStop(1, 'rgba(150,170,205,0.22)');
      ctx.fillStyle = haze;
      ctx.fillRect(sx, sy, z, z);
    }
  }

  /** Pulsing highlights on a list of cells — lifting, recalling, walking on. */
  drawCellTargets(cells, line, rgb) {
    const ctx = this.ctx;
    const pulse = 0.5 + Math.sin(performance.now() / 360) * 0.16;
    for (const s of cells) {
      if (!this.onScreen(s.x, s.y)) continue;
      const [sx, sy] = this.toScreen(s.x, s.y);
      const z = this.cam.zoom;
      ctx.fillStyle = `rgba(${rgb},${0.18 + pulse * 0.22})`;
      ctx.fillRect(sx, sy, z, z);
      ctx.strokeStyle = line;
      ctx.lineWidth = 3;
      ctx.strokeRect(sx + 2, sy + 2, z - 4, z - 4);
    }
  }

  /**
   * The rising tide: everything at or below the waterline is sea.
   *
   * The waterline itself is a game rule and moves in whole squares; the water
   * you see slides up to meet it, because a sea that teleports doesn't read as
   * a sea. Purely a rendering lag — the rules never see this number.
   */
  drawWater(game) {
    if (game.waterline == null) return;
    const ctx = this.ctx;
    if (this.shownWater == null) this.shownWater = game.waterline;
    this.shownWater += (game.waterline - this.shownWater) * 0.06;
    if (Math.abs(game.waterline - this.shownWater) < 0.004) this.shownWater = game.waterline;
    const [, sy] = this.toScreen(0, this.shownWater);
    if (sy > this.h) return;
    const top = Math.max(0, sy);
    const g = ctx.createLinearGradient(0, top, 0, this.h);
    g.addColorStop(0, 'rgba(74,111,138,0.55)');
    g.addColorStop(1, 'rgba(30,52,74,0.85)');
    ctx.fillStyle = g;
    ctx.fillRect(0, top, this.w, this.h - top);
    if (sy > 0) {
      ctx.strokeStyle = 'rgba(150,200,220,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(this.w, sy);
      ctx.stroke();
    }
  }

  /** Fog: only cells near your own figures stay bright. */
  fogSet(game) {
    const near = new Set();
    const walker = game.walker;
    const seeds = walker
      ? walker.visiblePawns.filter((p) => p.player == null || p.player === game.current)
      : (game.lastPlaced ? [game.lastPlaced] : []);
    const R = 3;
    for (const s of seeds) {
      for (let dx = -R; dx <= R; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= R) near.add(`${s.x + dx},${s.y + dy}`);
        }
      }
    }
    return near;
  }

  // --- placement ------------------------------------------------------------

  drawPlacementHints(game) {
    if (game.m.piece) return this.drawPieceHints(game);
    if (!game.tile) return;
    const ctx = this.ctx;
    // The hover ghost is always drawn; only the "here are all the squares it
    // could go" wash is optional, because some people want to find that out
    // themselves.
    const spots = this.showHints ? new Set(
      game.board.legalPlacements(game.tile, game.placeOpts())
        .filter((p) => !game.m.canPlaceAt || this.modeAllows(game, p))
        .map((p) => `${p.x},${p.y}`)) : new Set();

    for (const k of spots) {
      const [x, y] = k.split(',').map(Number);
      if (!this.onScreen(x, y)) continue;
      const [sx, sy] = this.toScreen(x, y);
      const z = this.cam.zoom;
      ctx.fillStyle = 'rgba(212,175,95,0.07)';
      ctx.fillRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
      ctx.strokeStyle = 'rgba(212,175,95,0.24)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
    }

    const h = this.hover;
    if (!h) return;
    const covering = !!game.board.get(h.x, h.y);
    const ok = game.canPlaceAt(h.x, h.y);
    if (covering && !ok) return;              // don't smear a ghost over the board
    ctx.save();
    ctx.globalAlpha = ok ? 0.92 : 0.32;
    this.paintTile(h.x, h.y, game.rot, game.tile);
    ctx.restore();

    const [sx, sy] = this.toScreen(h.x, h.y);
    const z = this.cam.zoom;
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? THEME.gold : '#a8443a';
    ctx.strokeRect(sx + 1.5, sy + 1.5, z - 3, z - 3);
  }

  modeAllows(game, p) {
    const saved = game.rot;
    game.rot = p.rot;
    const ok = game.m.canPlaceAt(p.x, p.y);
    game.rot = saved;
    return ok;
  }

  /** Sprawl: the ghost is a whole shape, so every cell of it gets drawn. */
  drawPieceHints(game) {
    const ctx = this.ctx;
    const piece = game.m.piece;
    const anchors = !this.showHints ? []
      : piece.filler
        ? game.board.frontier().filter((c) => game.m.canPlaceAt(c.x, c.y))
        : game.board.legalPiecePlacements(piece);

    for (const a of anchors) {
      if (!this.onScreen(a.x, a.y)) continue;
      const [sx, sy] = this.toScreen(a.x, a.y);
      const z = this.cam.zoom;
      ctx.fillStyle = 'rgba(212,175,95,0.07)';
      ctx.fillRect(sx + z * 0.3, sy + z * 0.3, z * 0.4, z * 0.4);
    }

    const h = this.hover;
    if (!h) return;
    const ok = game.m.canPlaceAt(h.x, h.y);
    ctx.save();
    ctx.globalAlpha = ok ? 0.92 : 0.30;
    for (const c of piece.cells) {
      this.paintTile(h.x + c.dx, h.y + c.dy, c.rot, c.type);
    }
    ctx.restore();
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? THEME.gold : '#a8443a';
    for (const c of piece.cells) {
      const [sx, sy] = this.toScreen(h.x + c.dx, h.y + c.dy);
      ctx.strokeRect(sx + 1.5, sy + 1.5, this.cam.zoom - 3, this.cam.zoom - 3);
    }
  }

  // --- classic meeples ------------------------------------------------------

  drawMeeples(game) {
    for (const cell of game.board.cells.values()) {
      if (!cell.meeple || !this.onScreen(cell.x, cell.y)) continue;
      if (this.fx?.veiled(`meeple:${cell.x},${cell.y}`)) continue;   // on its way
      const spot = rotPoint(cell.type.spots[cell.meeple.feat], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      drawMeeple(this.ctx, sx, sy, this.cam.zoom * 0.42, PLAYER_COLORS[cell.meeple.player]);
    }
  }

  /**
   * Where a follower may go. Usually the tile just laid, but an option carries
   * its own square — Girando's flying machine offers features halfway across
   * the board, drawn in the flight's own colour so you can tell the two kinds
   * of claim apart before you commit one.
   */
  drawMeepleTargets(game) {
    const ctx = this.ctx;
    this.meepleSpots = [];
    const pulse = 1 + Math.sin(performance.now() / 400) * 0.08;

    for (const o of game.meepleOptions()) {
      const cell = game.board.get(o.x, o.y);
      if (!cell || !this.onScreen(o.x, o.y)) continue;
      const color = o.flying ? THEME.teal : PLAYER_COLORS[game.current];
      const spot = rotPoint(cell.type.spots[o.i], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      const r = this.cam.zoom * 0.19 * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13,11,17,0.40)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      drawMeeple(ctx, sx, sy, this.cam.zoom * 0.26, PLAYER_COLORS[game.current]);
      this.meepleSpots.push({ i: o.i, x: o.x, y: o.y, sx, sy, r: this.cam.zoom * 0.24, type: o.f.type });
    }
  }

  // --- expedition pawns -----------------------------------------------------

  /** The mode decides what a figure looks like — by player, or by role. */
  pawnColor(game, p) {
    const style = game.m.figureStyle ? game.m.figureStyle(p) : { color: p.player ?? 0 };
    return PLAYER_COLORS[style.color % PLAYER_COLORS.length];
  }

  pawnHero(game, p) {
    return !!(game.m.figureStyle ? game.m.figureStyle(p).hero : p.hero);
  }

  drawPawns(game) {
    const ctx = this.ctx;
    const walker = game.walker;
    this.pawnSpots = [];
    this.moveSpots = [];

    // Reachable tiles for the selected figure. Adventure marks the free road
    // dash apart from the supply-costing forced march.
    // Where you can go is the single most important thing on screen during a
    // move, so it gets the loudest treatment on the board: a green wash, a
    // green border, and an arrow from the figure to every square it can reach.
    if (game.phase === 'move' && walker.selected) {
      const pulse = 0.5 + Math.sin(performance.now() / 380) * 0.14;
      const from = walker.selected;
      for (const dest of walker.reachable(from).values()) {
        this.moveSpots.push({ x: dest.x, y: dest.y });
        if (!this.onScreen(dest.x, dest.y)) continue;
        const [sx, sy] = this.toScreen(dest.x, dest.y);
        const z = this.cam.zoom;
        // `warp` doubles as "this is a fight" in Marches — either way it's the
        // move you want to notice before you click it.
        const special = dest.warp || (dest.steps >= 2 && dest.byRoad);
        const costly = dest.cost > 0;
        const style = costly ? MOVE_COSTLY : special ? MOVE_SPECIAL : MOVE_OK;

        ctx.fillStyle = `rgba(${style.rgb},${0.16 + pulse * 0.20})`;
        ctx.fillRect(sx, sy, z, z);
        ctx.lineWidth = 3;
        ctx.strokeStyle = style.line;
        ctx.strokeRect(sx + 2, sy + 2, z - 4, z - 4);

        this.drawMoveArrow(from, dest, style.line);

        if (costly) {                      // show the price on the tile
          ctx.fillStyle = '#f0d6c2';
          ctx.font = `600 ${Math.max(9, z * 0.16)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('−1 supply', sx + z / 2, sy + z * 0.86);
        }
      }
    }

    // Figures, fanned out when several share a tile.
    const list = walker.visiblePawns;
    const byCell = new Map();
    for (const p of list) {
      const k = `${p.x},${p.y}`;
      if (!byCell.has(k)) byCell.set(k, []);
      byCell.get(k).push(p);
    }
    for (const [k, group] of byCell) {
      const [cx, cy] = k.split(',').map(Number);
      if (!this.onScreen(cx, cy)) continue;
      group.forEach((p, i) => {
        if (this.fx?.veiled(`pawn:${p.id}`)) return;      // mid-stride
        const off = group.length === 1 ? [0, 0]
          : [Math.cos(i / group.length * Math.PI * 2) * 0.22, Math.sin(i / group.length * Math.PI * 2) * 0.22];
        const [sx, sy] = this.toScreen(cx + 0.5 + off[0], cy + 0.62 + off[1]);
        const size = this.cam.zoom * 0.46;
        const mine = p.player == null || p.player === game.current;
        if (mine && game.phase === 'move') {
          ctx.beginPath();
          ctx.arc(sx, sy, size * 0.62, 0, Math.PI * 2);
          ctx.strokeStyle = walker.selected === p ? THEME.gold : 'rgba(212,175,95,0.35)';
          ctx.lineWidth = walker.selected === p ? 3 : 2;
          ctx.stroke();
        }
        drawMeeple(ctx, sx, sy, size, this.pawnColor(game, p), {
          mounted: p.mounted, resting: p.resting, hero: this.pawnHero(game, p),
        });
        this.pawnSpots.push({ pawn: p, sx, sy, r: size * 0.62 });
      });
    }
  }

  /**
   * An arrow from the figure to a square it can reach. It stops short of both
   * ends so it never covers the meeple or the tile art, and a two-step move
   * gets a longer tail so distance reads without counting squares.
   */
  drawMoveArrow(from, dest, color) {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const [x0, y0] = this.toScreen(from.x + 0.5, from.y + 0.5);
    const [x1, y1] = this.toScreen(dest.x + 0.5, dest.y + 0.5);
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < z * 0.4) return;
    const ux = dx / len, uy = dy / len;
    const start = z * 0.34;                 // clear of the figure
    const end = len - z * 0.30;             // stop before the target's centre
    if (end <= start) return;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, z * 0.035);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0 + ux * start, y0 + uy * start);
    ctx.lineTo(x0 + ux * end, y0 + uy * end);
    ctx.stroke();

    const hx = x0 + ux * end, hy = y0 + uy * end;
    const head = z * 0.17;
    ctx.beginPath();
    ctx.moveTo(hx + ux * head, hy + uy * head);
    ctx.lineTo(hx - uy * head * 0.62 - ux * head * 0.2, hy + ux * head * 0.62 - uy * head * 0.2);
    ctx.lineTo(hx + uy * head * 0.62 - ux * head * 0.2, hy - ux * head * 0.62 - uy * head * 0.2);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  hitMeepleSpot(sx, sy) {
    for (const s of this.meepleSpots) if (Math.hypot(sx - s.sx, sy - s.sy) <= s.r) return s;
    return null;
  }

  hitPawn(sx, sy) {
    for (const s of this.pawnSpots) if (Math.hypot(sx - s.sx, sy - s.sy) <= s.r) return s.pawn;
    return null;
  }

  // --- cave overlay ---------------------------------------------------------

  caveGeom() {
    const size = Math.min(this.w * 0.62, this.h * 0.82);
    return { x: (this.w - size) / 2, y: (this.h - size) / 2, size, zoom: size / 5.5 };
  }

  caveToScreen(g, inv, wx, wy) {
    return [(wx - inv.pos.x - 0.5) * g.zoom + g.x + g.size / 2,
            (wy - inv.pos.y - 0.5) * g.zoom + g.y + g.size / 2];
  }

  interiorCellAt(game, sx, sy) {
    const inv = game.interior;
    if (!inv || !this.caveView) return null;
    const g = this.caveView;
    if (sx < g.x || sx > g.x + g.size || sy < g.y || sy > g.y + g.size) return null;
    const wx = (sx - g.x - g.size / 2) / g.zoom + inv.pos.x + 0.5;
    const wy = (sy - g.y - g.size / 2) / g.zoom + inv.pos.y + 0.5;
    return { x: Math.floor(wx), y: Math.floor(wy) };
  }

  drawInterior(game) {
    const ctx = this.ctx;
    const inv = game.interior;
    const g = this.caveGeom();
    this.caveView = g;
    const terrain = inv.kind;                  // 'cave' | 'city'
    const isCity = terrain === 'city';

    ctx.fillStyle = 'rgba(9,8,12,0.78)';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x, g.y, g.size, g.size);
    ctx.fillStyle = isCity ? '#2a2432' : '#15111b';
    ctx.fill();
    ctx.clip();

    const origin = (x, y) => this.caveToScreen(g, inv, x, y);

    for (const cell of inv.board.cells.values()) {
      this.paintTile(cell.x, cell.y, cell.rot, cell.type, terrain, g.zoom, origin);
    }

    if (game.phase === 'interior-place' && inv.tile) {
      for (const p of inv.board.legalPlacements(inv.tile)) {
        const [sx, sy] = origin(p.x, p.y);
        ctx.fillStyle = 'rgba(212,175,95,0.07)';
        ctx.fillRect(sx, sy, g.zoom, g.zoom);
        ctx.strokeStyle = 'rgba(212,175,95,0.26)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 2, sy + 2, g.zoom - 4, g.zoom - 4);
      }
      if (this.pointer) {
        const c = this.interiorCellAt(game, this.pointer.sx, this.pointer.sy);
        if (c && inv.canPlace(c.x, c.y)) {
          ctx.save();
          ctx.globalAlpha = 0.9;
          this.paintTile(c.x, c.y, inv.rot, inv.tile, terrain, g.zoom, origin);
          ctx.restore();
        }
      }
    }

    if (game.phase === 'interior-move') {
      const pulse = 0.5 + Math.sin(performance.now() / 380) * 0.14;
      for (const d of inv.reachable().values()) {
        const [sx, sy] = origin(d.x, d.y);
        ctx.fillStyle = `rgba(95,191,174,${0.10 + pulse * 0.14})`;
        ctx.fillRect(sx, sy, g.zoom, g.zoom);
        ctx.strokeStyle = THEME.teal;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(sx + 2, sy + 2, g.zoom - 4, g.zoom - 4);
      }
    }

    const owner = inv.owner;
    const [px, py] = origin(inv.pos.x + 0.5, inv.pos.y + 0.62);
    drawMeeple(ctx, px, py, g.zoom * 0.46, this.pawnColor(game, owner), {
      mounted: owner.mounted, hero: this.pawnHero(game, owner),
    });

    // Falloff: a lantern underground, lamplit streets in a city.
    const lamp = ctx.createRadialGradient(px, py, g.zoom * (isCity ? 0.7 : 0.4), px, py, g.size * 0.62);
    lamp.addColorStop(0, 'rgba(0,0,0,0)');
    lamp.addColorStop(1, isCity ? 'rgba(10,8,14,0.42)' : 'rgba(6,5,9,0.60)');
    ctx.fillStyle = lamp;
    ctx.fillRect(g.x, g.y, g.size, g.size);

    // An interior has its own camera, so effects down here need their own pass
    // through the same list — inside the clip, above the lamp, so treasure
    // isn't dimmed by the dark it was found in.
    this.drawEffects('interior', origin, g.zoom);
    ctx.restore();

    ctx.lineWidth = 2;
    ctx.strokeStyle = THEME.goldDim;
    ctx.strokeRect(g.x, g.y, g.size, g.size);

    ctx.fillStyle = THEME.gold;
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const verb = game.phase === 'interior-place'
      ? (isCity ? 'lay a street' : 'place a passage')
      : 'move, or hold';
    ctx.fillText(`${inv.label} — ${verb}`, g.x + 10, g.y + 20);
    ctx.fillStyle = THEME.dim;
    ctx.fillText(`${inv.deck.length} tiles left · ${inv.visited} discovered`, g.x + 10, g.y + g.size - 12);
  }

  // --- effects --------------------------------------------------------------

  /**
   * Whatever src/fx.js is currently holding. The effects themselves are inert
   * data with a birth time and a lifespan; all the drawing is here, with the
   * rest of the painting, so adding one is a case in this switch rather than a
   * new canvas call in a module that isn't about canvases.
   */
  drawEffects(space = 'board', origin = null, zoom = this.cam.zoom) {
    if (!this.fx) return;
    const now = performance.now();
    const items = this.fx.live(now);
    if (!items.length) return;
    const ctx = this.ctx;
    const z = zoom;
    const at = origin
      ? (wx, wy) => origin(wx, wy)
      : (wx, wy) => this.toScreen(wx, wy);
    const visible = origin ? () => true : (x, y) => this.onScreen(x, y);

    ctx.save();
    for (const e of items) {
      if ((e.space || 'board') !== space) continue;
      if (now < e.born) continue;                 // staggered — not yet
      const t = Math.min(1, Math.max(0, (now - e.born) / e.life));
      switch (e.kind) {
        case 'float': {
          // Rises, slowing, and fades out over the last third — the number has
          // to be readable for most of its life or there's no point drawing it.
          const rise = ease(t) * 0.85;
          const [sx, sy] = at(e.x, e.y - rise);
          if (sx < -80 || sy < -80 || sx > this.w + 80 || sy > this.h + 80) break;
          const pop = t < 0.16 ? 0.55 + 0.45 * (t / 0.16) : 1;
          const size = Math.max(15, z * 0.34) * pop;
          ctx.globalAlpha = t < 0.1 ? t / 0.1 : Math.min(1, (1 - t) / 0.34);
          ctx.font = `700 ${size}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          ctx.lineWidth = Math.max(3, size * 0.24);
          ctx.strokeStyle = 'rgba(13,11,17,0.9)';
          ctx.strokeText(e.text, sx, sy);
          ctx.fillStyle = e.color;
          ctx.fillText(e.text, sx, sy);
          break;
        }

        case 'flash': {
          // Which tiles paid. One swell, in the colour of whoever was paid.
          const a = Math.sin(t * Math.PI) ** 1.4;
          ctx.globalAlpha = a * 0.36;
          ctx.fillStyle = e.color;
          for (const c of e.cells) {
            if (!visible(c.x, c.y)) continue;
            const [sx, sy] = at(c.x, c.y);
            ctx.fillRect(sx, sy, z, z);
          }
          ctx.globalAlpha = a * 0.85;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2.5;
          for (const c of e.cells) {
            if (!visible(c.x, c.y)) continue;
            const [sx, sy] = at(c.x, c.y);
            ctx.strokeRect(sx + 1.5, sy + 1.5, z - 3, z - 3);
          }
          break;
        }

        case 'ring': {
          const [sx, sy] = at(e.x, e.y);
          ctx.globalAlpha = (1 - t) * 0.8;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = Math.max(2, z * 0.05) * (1 - t * 0.6);
          ctx.beginPath();
          ctx.arc(sx, sy, (0.12 + ease(t) * e.r) * z, 0, Math.PI * 2);
          ctx.stroke();
          break;
        }

        case 'land': {
          // A tile arriving: a square that closes onto the cell it landed in.
          const [sx, sy] = at(e.x, e.y);
          const grow = (1 + (1 - ease(t)) * 0.5) * z * 0.5;
          ctx.globalAlpha = (1 - t) * 0.7;
          ctx.strokeStyle = THEME.gold;
          ctx.lineWidth = Math.max(2, z * 0.04);
          ctx.strokeRect(sx - grow, sy - grow, grow * 2, grow * 2);
          break;
        }

        case 'tile': {
          // In from the preview, landing on the square you chose. The cell
          // itself is veiled for exactly this long, so there's one tile on
          // screen throughout rather than two or none.
          const k = ease(t);
          const wx = e.from.x + (e.to.x - e.from.x) * k;
          const wy = e.from.y + (e.to.y - e.from.y) * k - (e.lift0 + (e.lift1 - e.lift0) * k);
          const scale = 1 + (1 - k) * 0.22;                 // a shade oversized, settling
          const s = z * scale;
          const [sx, sy] = at(wx - 0.5, wy - 0.5);
          ctx.globalAlpha = Math.min(1, 0.35 + t * 3);
          this.paintTile(0, 0, e.rot, e.type, 'surface', s, () => [sx - (s - z) / 2, sy - (s - z) / 2]);
          break;
        }

        case 'figure': {
          // A follower crossing the board: a hop, because a straight slide
          // reads as a bug and an arc reads as a decision.
          const k = ease(t);
          const wx = e.from.x + (e.to.x - e.from.x) * k;
          const wy = e.from.y + (e.to.y - e.from.y) * k - Math.sin(t * Math.PI) * 0.5;
          const [sx, sy] = at(wx, wy);
          drawMeeple(ctx, sx, sy, z * 0.46, e.color, e.style || {});
          break;
        }

        case 'fall': {
          // Blown off the cloud, or taken by the water. Same effect, opposite
          // moods: one tumbles sideways, the other slides straight down.
          const k = ease(t);
          const sink = e.how === 'sink';
          const [sx, sy] = at(e.x + e.drift * k, e.y + (sink ? k * 0.55 : k * 0.9));
          ctx.globalAlpha = (1 - t) * (sink ? 0.85 : 0.7);
          const shrink = z * (1 - k * (sink ? 0.12 : 0.45));
          ctx.save();
          ctx.translate(sx + z / 2, sy + z / 2);
          ctx.rotate(e.spin * k);
          this.paintTile(0, 0, e.rot, e.type, 'surface', shrink, () => [-shrink / 2, -shrink / 2]);
          if (sink) {
            ctx.fillStyle = `rgba(48,84,110,${0.25 + k * 0.55})`;
            ctx.fillRect(-shrink / 2, -shrink / 2, shrink, shrink);
          }
          ctx.restore();
          break;
        }

        case 'sweep': {
          // A colour running out through a region, one cell at a time.
          if (!visible(e.x, e.y)) break;
          const [sx, sy] = at(e.x, e.y);
          const a = Math.sin(Math.min(1, t * 1.6) * Math.PI);
          ctx.globalAlpha = a * 0.5;
          ctx.fillStyle = e.color;
          ctx.fillRect(sx, sy, z, z);
          ctx.globalAlpha = a;
          ctx.strokeStyle = e.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 1, sy + 1, z - 2, z - 2);
          break;
        }

        default: break;
      }
    }
    ctx.restore();
  }

  drawDebug(game) {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${Math.max(9, this.cam.zoom * 0.12)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const cell of game.board.cells.values()) {
      if (!this.onScreen(cell.x, cell.y)) continue;
      cell.type.feats.forEach((f, i) => {
        const d = game.board.featureOf(cell.x, cell.y, i);
        const spot = rotPoint(cell.type.spots[i], cell.rot);
        const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
        const label = `${d.tiles.size}${d.open ? '·' + d.open : '✓'}`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = d.open === 0 ? '#9fd98a' : THEME.gold;
        ctx.fillText(label, sx, sy);
      });
    }
    ctx.restore();
  }
}
