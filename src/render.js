// ---------------------------------------------------------------------------
// Canvas rendering + camera. Everything happens in "world units" where one
// tile is exactly 1x1, so the camera is just a scale and an offset.
//
// The cave overlay is a second, independent little viewport drawn on top with
// its own fixed camera — same Board, same tile art, different transform.
// ---------------------------------------------------------------------------

import { drawTile, drawMeeple, PLAYER_COLORS } from './art.js';
import { THEME, applyDusk } from './theme.js';
import { rotPoint } from './tiles.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0.5, y: 0.5, zoom: 96 };
    this.hover = null;      // grid cell under the pointer
    this.pointer = null;    // raw screen coords, needed for the cave overlay
    this.showDebug = false;
    this.meepleSpots = [];
    this.pawnSpots = [];
    this.moveSpots = [];
    this.caveView = null;
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

    if (game.walker) this.drawPawns(game);
    else { this.pawnSpots = []; this.moveSpots = []; }

    if (this.showDebug) this.drawDebug(game);

    applyDusk(ctx, this.w, this.h);

    // Interiors sit above the dusk pass — you're indoors, not outdoors.
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

  drawPlacementHints(game) {
    const ctx = this.ctx;
    const legal = game.board.legalPlacements(game.tile, { free: game.free });
    const spots = new Set(legal.map((p) => `${p.x},${p.y}`));

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
    if (!h || game.board.get(h.x, h.y)) return;
    const ok = game.canPlaceAt(h.x, h.y);
    ctx.save();
    ctx.globalAlpha = ok ? 0.92 : 0.32;
    this.inCell(h.x, h.y, game.rot, (c) => drawTile(c, game.tile));
    ctx.restore();

    const [sx, sy] = this.toScreen(h.x, h.y);
    const z = this.cam.zoom;
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? THEME.gold : '#a8443a';
    ctx.strokeRect(sx + 1.5, sy + 1.5, z - 3, z - 3);
  }

  // --- classic meeples ------------------------------------------------------

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
    const pulse = 1 + Math.sin(performance.now() / 400) * 0.08;

    for (const { i, f } of game.meepleOptions()) {
      const spot = rotPoint(cell.type.spots[i], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      const r = this.cam.zoom * 0.19 * pulse;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(13,11,17,0.40)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.stroke();
      drawMeeple(ctx, sx, sy, this.cam.zoom * 0.26, color);
      this.meepleSpots.push({ i, sx, sy, r: this.cam.zoom * 0.24, type: f.type });
    }
  }

  // --- expedition pawns -----------------------------------------------------

  /** Colour for a figure — Expedition goes by player, Adventure by role. */
  pawnColor(game, p) {
    if (game.adventure) return p.hero ? PLAYER_COLORS[0] : PLAYER_COLORS[1];
    return PLAYER_COLORS[p.player];
  }

  drawPawns(game) {
    const ctx = this.ctx;
    const walker = game.walker;
    this.pawnSpots = [];
    this.moveSpots = [];

    // Reachable tiles for the selected figure. Adventure marks the free road
    // dash apart from the supply-costing forced march.
    if (game.phase === 'move' && walker.selected) {
      const pulse = 0.5 + Math.sin(performance.now() / 380) * 0.14;
      for (const dest of walker.reachable(walker.selected).values()) {
        if (!this.onScreen(dest.x, dest.y)) continue;
        const [sx, sy] = this.toScreen(dest.x, dest.y);
        const z = this.cam.zoom;
        const special = dest.warp || (dest.steps === 2 && dest.byRoad);
        const costly = dest.cost > 0;
        const hue = costly ? '182,88,68' : special ? '95,191,174' : '212,175,95';
        ctx.fillStyle = `rgba(${hue},${0.08 + pulse * 0.13})`;
        ctx.fillRect(sx, sy, z, z);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = costly ? '#b65844' : special ? THEME.teal : THEME.gold;
        ctx.strokeRect(sx + 2, sy + 2, z - 4, z - 4);
        this.moveSpots.push({ x: dest.x, y: dest.y });

        if (costly) {                      // show the price on the tile
          ctx.fillStyle = '#e8c9a8';
          ctx.font = `600 ${Math.max(9, z * 0.16)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('−1 supply', sx + z / 2, sy + z * 0.86);
        }
      }
    }

    // Figures, fanned out when several share a tile.
    const list = game.adventure ? game.adventure.outside : walker.pawns.filter((p) => !p.inCave);
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
        const off = group.length === 1 ? [0, 0]
          : [Math.cos(i / group.length * Math.PI * 2) * 0.22, Math.sin(i / group.length * Math.PI * 2) * 0.22];
        const [sx, sy] = this.toScreen(cx + 0.5 + off[0], cy + 0.62 + off[1]);
        const size = this.cam.zoom * 0.46;
        const mine = game.adventure ? true : p.player === game.current;
        if (mine && game.phase === 'move') {
          ctx.beginPath();
          ctx.arc(sx, sy, size * 0.62, 0, Math.PI * 2);
          ctx.strokeStyle = walker.selected === p ? THEME.gold : 'rgba(212,175,95,0.35)';
          ctx.lineWidth = walker.selected === p ? 3 : 2;
          ctx.stroke();
        }
        drawMeeple(ctx, sx, sy, size, this.pawnColor(game, p), {
          mounted: p.mounted, resting: p.resting, hero: p.hero,
        });
        this.pawnSpots.push({ pawn: p, sx, sy, r: size * 0.62 });
      });
    }
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
      this.inCell(cell.x, cell.y, cell.rot, (c) => drawTile(c, cell.type, { terrain }), g.zoom, origin);
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
          this.inCell(c.x, c.y, inv.rot, (cc) => drawTile(cc, inv.tile, { terrain }), g.zoom, origin);
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
      mounted: owner.mounted, hero: owner.hero,
    });

    // Falloff: a lantern underground, lamplit streets in a city.
    const lamp = ctx.createRadialGradient(px, py, g.zoom * (isCity ? 0.7 : 0.4), px, py, g.size * 0.62);
    lamp.addColorStop(0, 'rgba(0,0,0,0)');
    lamp.addColorStop(1, isCity ? 'rgba(10,8,14,0.42)' : 'rgba(6,5,9,0.60)');
    ctx.fillStyle = lamp;
    ctx.fillRect(g.x, g.y, g.size, g.size);
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
