// ---------------------------------------------------------------------------
// Canvas rendering + camera. Everything happens in "world units" where one
// tile is exactly 1x1, so the camera is just a scale and an offset.
// ---------------------------------------------------------------------------

import { drawTile, drawMeeple, PLAYER_COLORS, PALETTE } from './art.js';
import { rotPoint } from './tiles.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0.5, y: 0.5, zoom: 96 }; // world point at screen center
    this.hover = null;      // {x, y} grid cell under the pointer
    this.showDebug = false;
    this.meepleSpots = [];  // screen-space hit targets for the meeple step
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

  centerOn(x, y) { this.cam.x = x + 0.5; this.cam.y = y + 0.5; }

  /** Run `fn` inside the unit-square transform for grid cell (x, y). */
  inCell(x, y, rot, fn) {
    const ctx = this.ctx;
    const [sx, sy] = this.toScreen(x, y);
    const z = this.cam.zoom;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(z, z);
    if (rot) {
      ctx.translate(0.5, 0.5);
      ctx.rotate((rot & 3) * Math.PI / 2);
      ctx.translate(-0.5, -0.5);
    }
    fn(ctx);
    ctx.restore();
  }

  draw(game) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    this.drawBackdrop();

    for (const cell of game.board.cells.values()) {
      if (!this.onScreen(cell.x, cell.y)) continue;
      this.inCell(cell.x, cell.y, cell.rot, (c) => drawTile(c, cell.type));
    }

    if (game.phase === 'place' && game.tile) this.drawPlacementHints(game);
    this.drawMeeples(game);
    if (game.phase === 'meeple') this.drawMeepleTargets(game);
    else this.meepleSpots = [];
    if (this.showDebug) this.drawDebug(game);
  }

  onScreen(x, y) {
    const [sx, sy] = this.toScreen(x, y);
    const z = this.cam.zoom;
    return sx > -z && sy > -z && sx < this.w + z && sy < this.h + z;
  }

  drawBackdrop() {
    const ctx = this.ctx;
    ctx.fillStyle = '#1b1f18';
    ctx.fillRect(0, 0, this.w, this.h);
    // Faint grid so empty space still reads as a board.
    const z = this.cam.zoom;
    if (z < 40) return;
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
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

  drawPlacementHints(game) {
    const ctx = this.ctx;
    const legal = game.board.legalPlacements(game.tile, { free: game.free });
    const spots = new Set(legal.map((p) => `${p.x},${p.y}`));

    for (const k of spots) {
      const [x, y] = k.split(',').map(Number);
      if (!this.onScreen(x, y)) continue;
      const [sx, sy] = this.toScreen(x, y);
      const z = this.cam.zoom;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
      ctx.strokeStyle = 'rgba(255,255,255,0.20)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
    }

    const h = this.hover;
    if (!h) return;
    const ok = game.canPlaceAt(h.x, h.y);
    const occupied = game.board.get(h.x, h.y);
    if (occupied) return;

    ctx.save();
    ctx.globalAlpha = ok ? 0.92 : 0.35;
    this.inCell(h.x, h.y, game.rot, (c) => drawTile(c, game.tile));
    ctx.restore();

    const [sx, sy] = this.toScreen(h.x, h.y);
    const z = this.cam.zoom;
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? '#f5e07a' : '#e0564a';
    ctx.strokeRect(sx + 1.5, sy + 1.5, z - 3, z - 3);
  }

  drawMeeples(game) {
    for (const cell of game.board.cells.values()) {
      if (!cell.meeple || !this.onScreen(cell.x, cell.y)) continue;
      const spot = rotPoint(cell.type.spots[cell.meeple.feat], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      drawMeeple(this.ctx, sx, sy, this.cam.zoom * 0.42, PLAYER_COLORS[cell.meeple.player]);
    }
  }

  drawMeepleTargets(game) {
    const ctx = this.ctx;
    this.meepleSpots = [];
    const cell = game.lastPlaced;
    if (!cell) return;
    const color = PLAYER_COLORS[game.current];
    const t = performance.now() / 400;
    const pulse = 1 + Math.sin(t) * 0.08;

    for (const { i, f } of game.meepleOptions()) {
      const spot = rotPoint(cell.type.spots[i], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      const r = this.cam.zoom * 0.19 * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      drawMeeple(ctx, sx, sy, this.cam.zoom * 0.26, color);
      this.meepleSpots.push({ i, sx, sy, r: this.cam.zoom * 0.24, type: f.type });
    }
  }

  hitMeepleSpot(sx, sy) {
    for (const s of this.meepleSpots) {
      if (Math.hypot(sx - s.sx, sy - s.sy) <= s.r) return s;
    }
    return null;
  }

  /** Overlay showing which features are joined and how open they still are. */
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
        ctx.fillStyle = d.open === 0 ? '#8ef58e' : '#ffe9a8';
        ctx.fillText(label, sx, sy);
      });
    }
    ctx.restore();
  }
}
