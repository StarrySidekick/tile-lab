// ---------------------------------------------------------------------------
// Canvas rendering + camera. Everything happens in "world units" where one
// tile is exactly 1x1, so the camera is just a scale and an offset.
//
// The cave overlay is a second, independent little viewport drawn on top with
// its own fixed camera — same Board, same tile art, different transform.
// ---------------------------------------------------------------------------

import { drawTile, drawMeeple, drawPig, drawIngots, drawBuilding, PLAYER_COLORS } from './art.js';
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

/** How a portolan's rhumb network is struck: nodes on a ring, 16 bearings each. */
const RHUMB_NODES = 12;
const RHUMB_RING = 11;        // squares out from the origin

/** The Latin winds, named round the rose. 0=N 1=E 2=S 3=W. */
const WINDS = [
  { name: 'SEPTENTRIO', dir: 0 }, { name: 'ORIENS', dir: 1 },
  { name: 'MERIDIES', dir: 2 }, { name: 'OCCIDENS', dir: 3 },
];

/** Where the brush pooled: [x, y, radius, alpha], fractions of the viewport. */
const POOLING = [
  [0.18, 0.12, 0.34, 0.20], [0.72, 0.30, 0.40, 0.16],
  [0.42, 0.74, 0.36, 0.13], [0.92, 0.86, 0.30, 0.17],
];

/** Foxing on the page: [x, y, radius, alpha], all fractions of the viewport. */
const FOXING = [
  [0.11, 0.19, 0.10, 0.10], [0.44, 0.08, 0.07, 0.07], [0.73, 0.26, 0.12, 0.08],
  [0.21, 0.56, 0.08, 0.09], [0.61, 0.66, 0.11, 0.06], [0.90, 0.49, 0.06, 0.10],
  [0.35, 0.88, 0.09, 0.07], [0.79, 0.93, 0.07, 0.09], [0.05, 0.78, 0.08, 0.06],
];

/** Fast then slow — the shape almost everything transient here moves on. */
const ease = (t) => 1 - (1 - t) ** 3;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: 0.5, y: 0.5, zoom: 96 };
    this.hover = null;      // grid cell under the pointer
    this.pending = null;    // a placement staged but not yet committed
    this.hideMeepleTargets = false;   // the zoomed claim panel is showing them
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
    this.drawBackdrop(game);
    if (game.options?.tide) this.drawWater(game);

    const fog = game.options?.fog ? this.fogSet(game) : null;
    // A mode printed on parchment wants its country printed on it too, not
    // painted over the top of it. One warm wash and a hairline of ink round
    // every tile turns the board from a set of models into a plate.
    const antique = game.m?.backdrop === 'sky';

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
      if (antique) this.drawFoxedTile(cell.x, cell.y - lift);
      if (overlay) this.drawCellOverlay(cell, overlay, lift);
    }

    if (game.phase === 'lift') this.drawCellTargets(game.m.allLiftable ? game.m.allLiftable() : liftableCells(game.board), THEME.violet, '107,90,140');
    if (game.phase === 'balena') this.drawCellTargets(game.m.balenaTargets(), THEME.teal, '95,191,174');
    if (game.phase === 'flight') this.drawCellTargets(game.m.flightLifts(), THEME.teal, '95,191,174');
    if (game.phase === 'flat') this.drawCellTargets(game.m.flatTargets(), THEME.gold, '212,175,95');
    if (game.phase === 'stroll') this.drawCellTargets(game.m.stroll?.targets || [], MOVE_OK.line, MOVE_OK.rgb);
    if (game.phase === 'recall') this.drawCellTargets(game.myMeeples(), MOVE_COSTLY.line, MOVE_COSTLY.rgb);
    if (game.phase === 'walk') this.drawCellTargets(game.pendingWalk?.targets || [], MOVE_OK.line, MOVE_OK.rgb);
    if (game.phase === 'place') this.drawPlacementHints(game);

    this.drawMeeples(game);
    if (game.phase === 'meeple' && !this.hideMeepleTargets) this.drawMeepleTargets(game);
    // With the claim panel doing the aiming, the board still says WHICH tile
    // is being claimed on — otherwise the two read as unrelated things.
    if (game.phase === 'meeple' && this.hideMeepleTargets && game.lastPlaced) {
      const { x, y } = game.lastPlaced;
      if (this.onScreen(x, y)) {
        const [sx, sy] = this.toScreen(x, y);
        const z = this.cam.zoom;
        this.ctx.save();
        this.ctx.lineWidth = 3;
        this.ctx.strokeStyle = THEME.gold;
        this.ctx.setLineDash([z * 0.12, z * 0.08]);
        this.ctx.lineDashOffset = (performance.now() / 70) % (z * 0.2);
        this.ctx.strokeRect(sx + 2, sy + 2, z - 4, z - 4);
        this.ctx.restore();
      }
    }
    else this.meepleSpots = [];

    if (game.walker) this.drawPawns(game);
    else { this.pawnSpots = []; this.moveSpots = []; }

    if (this.showDebug) this.drawDebug(game);

    // A chart is not lit at dusk — it is a sheet on a table. The vignette that
    // frames every other mode would only fight the stain already painted round
    // the edge of the paper, and two vignettes are a smudge rather than a frame.
    if (!antique) applyDusk(ctx, this.w, this.h);

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

  /**
   * What's between the tiles. In every mode but one it's the night the board
   * hangs in; in Girando it's open sky, because there the gaps are the point —
   * a tile blown off the edge falls into that, and islands are pieces of
   * country with it running between them. The tiles themselves stay ordinary
   * countryside: the sky is the SPACE, not the ground.
   */
  drawBackdrop(game) {
    const ctx = this.ctx;
    if (game?.m?.backdrop !== 'sky') {
      ctx.fillStyle = THEME.night;
      ctx.fillRect(0, 0, this.w, this.h);
      return this.drawGrid(THEME.grid);
    }
    this.drawChart();
  }

  /**
   * The sky, drawn as an old chart of it.
   *
   * A flat blue wash with a hairline grid read as a spreadsheet you could sail
   * on. What it wanted was a MAP: a sea-chart ground with a real graticule —
   * thin parallels, heavy meridians every five squares — the rhumb lines a
   * portolan draws from its compass nodes, and a rose sitting on the origin
   * with the Latin winds named round it. All of it is drawn in WORLD space, so
   * it pans and zooms with the board and reads as the chart the kingdom is
   * printed on rather than as wallpaper behind it.
   *
   * There were drifting cloud banks over the top of it, and they were the one
   * thing here that wasn't the chart: soft white blobs sliding across a drawn
   * map, smudging the graticule and reading as dirt on the glass. The chart is
   * the backdrop. Nothing floats in front of it.
   *
   * And it is SKY PAINTED ONTO PARCHMENT rather than a bare sheet. The order is
   * the whole trick and it is the order a painter works in: the paper first,
   * then the wash laid over it — pooled and uneven, the way a brush leaves it —
   * and then the paper coming BACK THROUGH on top, its laid lines and its
   * foxing multiplied over the paint. Paint under grain reads as pigment sunk
   * into a sheet; paint over grain reads as a blue rectangle with a texture
   * stuck on it. Only then the ink: the graticule, the rhumbs and the rose are
   * drawn last because they were drawn last.
   */
  drawChart() {
    const ctx = this.ctx;
    const z = this.cam.zoom;

    // PARCHMENT. It was a blue sea-chart, which is a fine thing but not the
    // thing this mode is: the sky here is a printed page, and everything on it
    // — the rhumbs, the rose, the wind-heads on the zephyrs — is ink. So the
    // ground is aged paper, warm in the middle and browner at the edges the way
    // a sheet is where it has been handled, with foxing blotted into it.
    const paper = ctx.createLinearGradient(0, 0, this.w * 0.4, this.h);
    paper.addColorStop(0, '#e9dcbd');
    paper.addColorStop(0.45, '#e2d3b0');
    paper.addColorStop(1, '#cfbc94');
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, this.w, this.h);

    this.drawSkyWash();
    this.drawLaidLines();
    this.drawFoxing();

    // The rhumb network and the rose are the expensive half and the half that
    // stops meaning anything when the squares get small, so both drop out with
    // the grid rather than piling detail into an unreadable zoom.
    if (z < 26) return this.drawEdgeStain();
    this.drawRhumbs();
    this.drawGraticule();
    if (z >= 40) this.drawRose();
    this.drawEdgeStain();
  }

  /**
   * The sky, painted on. A vertical wash — deeper overhead, thinning toward the
   * bottom of the sheet the way a horizon does — laid at part opacity so the
   * warm paper under it comes through and takes the chill off the blue, which
   * is what separates gouache on toned paper from a blue rectangle.
   *
   * Then the POOLING: three or four soft patches where a brush left more
   * pigment than it meant to. Parallaxed with the camera like the foxing, so
   * they belong to the sheet rather than to the screen, and laid out from a
   * fixed table so they never reshuffle between frames.
   */
  drawSkyWash() {
    const ctx = this.ctx;
    ctx.save();
    const sky = ctx.createLinearGradient(0, 0, 0, this.h);
    sky.addColorStop(0, 'rgba(86,116,146,0.80)');
    sky.addColorStop(0.42, 'rgba(116,146,171,0.74)');
    sky.addColorStop(0.78, 'rgba(150,175,188,0.62)');
    sky.addColorStop(1, 'rgba(178,194,192,0.50)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.w, this.h);

    const drift = this.cam.zoom * 0.10;
    for (const [ox, oy, r, a] of POOLING) {
      const x = ox * this.w - this.cam.x * drift;
      const y = oy * this.h - this.cam.y * drift;
      const rad = r * Math.max(this.w, this.h);
      const pool = ctx.createRadialGradient(x, y, 0, x, y, rad);
      pool.addColorStop(0, `rgba(62,96,128,${a})`);
      pool.addColorStop(0.65, `rgba(62,96,128,${a * 0.4})`);
      pool.addColorStop(1, 'rgba(62,96,128,0)');
      ctx.fillStyle = pool;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.66, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * The laid lines of the sheet, brought back through the paint. Fine chain
   * lines one way and closer wire lines the other, multiplied so they darken
   * the wash rather than sitting on it — the single cheapest thing that says
   * "this is paper" and the reason the wash reads as sunk in.
   *
   * Pinned to the screen rather than the world: the sheet is what you are
   * looking THROUGH, and a grain that slid about under the board would read as
   * something moving rather than as something you are holding.
   */
  drawLaidLines() {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = 'rgba(126,102,68,0.09)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < this.w; x += 3) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, this.h); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(126,102,68,0.07)';
    ctx.beginPath();
    for (let y = 0; y < this.h; y += 9) { ctx.moveTo(0, y + 0.5); ctx.lineTo(this.w, y + 0.5); }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Foxing: the rust-brown blotches an old sheet grows where it was damp. Laid
   * out from a fixed table and parallaxed with the camera like everything else
   * on this backdrop, so the page is a page you are moving over rather than a
   * texture stuck to the glass — and so it never reshuffles between frames.
   */
  drawFoxing() {
    const ctx = this.ctx;
    const drift = this.cam.zoom * 0.10;
    ctx.save();
    // Multiplied, because foxing is a stain IN the sheet: it has to darken the
    // sky painted over it rather than sit on top of the paint as a beige smear.
    ctx.globalCompositeOperation = 'multiply';
    for (const [ox, oy, r, a] of FOXING) {
      const x = ox * this.w - this.cam.x * drift;
      const y = oy * this.h - this.cam.y * drift;
      const rad = r * Math.min(this.w, this.h);
      const blot = ctx.createRadialGradient(x, y, 0, x, y, rad);
      blot.addColorStop(0, `rgba(146,104,54,${a * 1.7})`);
      blot.addColorStop(0.6, `rgba(146,104,54,${a * 0.8})`);
      blot.addColorStop(1, 'rgba(146,104,54,0)');
      ctx.fillStyle = blot;
      ctx.beginPath();
      ctx.ellipse(x, y, rad, rad * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * …and the shadow round the edge of the sheet, which is what stops a flat
   * wash from reading as a flat wash. Pinned to the screen rather than the
   * world: it is the page you are looking through, not a place on it.
   */
  drawEdgeStain() {
    const ctx = this.ctx;
    const r = Math.hypot(this.w, this.h) * 0.62;
    const v = ctx.createRadialGradient(this.w / 2, this.h / 2, r * 0.42, this.w / 2, this.h / 2, r);
    v.addColorStop(0, 'rgba(84,56,28,0)');
    v.addColorStop(0.72, 'rgba(84,56,28,0.10)');
    v.addColorStop(1, 'rgba(84,56,28,0.40)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  /** The plain hairline grid, for every mode that isn't a chart. */
  drawGrid(color) {
    const ctx = this.ctx;
    if (this.cam.zoom < 40) return;
    ctx.strokeStyle = color;
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

  /**
   * Parallels and meridians. Two weights, because a graticule with one weight
   * is graph paper: every square gets a hairline, every fifth gets an ink line,
   * and that fifth is what lets you count squares across a board at a glance
   * instead of following a lane with your finger.
   */
  drawGraticule() {
    const ctx = this.ctx;
    const [x0, y0] = this.toWorld(0, 0);
    const [x1, y1] = this.toWorld(this.w, this.h);

    for (const [step, color, width] of [[1, 'rgba(38,28,16,0.17)', 1], [5, 'rgba(38,28,16,0.42)', 1.6]]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        const [sx] = this.toScreen(x, 0);
        ctx.moveTo(Math.round(sx) + 0.5, 0);
        ctx.lineTo(Math.round(sx) + 0.5, this.h);
      }
      for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        const [, sy] = this.toScreen(0, y);
        ctx.moveTo(0, Math.round(sy) + 0.5);
        ctx.lineTo(this.w, Math.round(sy) + 0.5);
      }
      ctx.stroke();
    }
  }

  /**
   * Rhumb lines: the sixteen bearings struck from each of a ring of compass
   * nodes, which is the thing that makes a portolan look like a portolan. Drawn
   * long enough to always cross the viewport and clipped by it, and kept faint
   * — they're the paper the map is on, not something you're meant to read.
   */
  drawRhumbs() {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const R = RHUMB_RING;                                  // node ring, in squares
    const reach = (Math.hypot(this.w, this.h) / z) + R * 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(126,46,32,0.17)';        // rhumbs are drawn in red ink
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let n = 0; n < RHUMB_NODES; n++) {
      const a = (n / RHUMB_NODES) * Math.PI * 2;
      const nx = Math.cos(a) * R, ny = Math.sin(a) * R;
      const [sx, sy] = this.toScreen(nx, ny);
      if (sx < -reach * z || sy < -reach * z || sx > this.w + reach * z || sy > this.h + reach * z) continue;
      for (let i = 0; i < 16; i++) {
        const b = (i / 16) * Math.PI * 2;
        const [ex, ey] = this.toScreen(nx + Math.cos(b) * reach, ny + Math.sin(b) * reach);
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The rose on the origin, with the Latin winds named round it. Septentrio is
   * north, Oriens east, Meridies south, Occidens west — the names a mediaeval
   * chart actually used, and the reason the tile that blows a lane is called a
   * zephyr in the first place (Favonius, the west wind, is Zephyrus in Greek).
   */
  drawRose() {
    const ctx = this.ctx;
    const z = this.cam.zoom;
    const [cx, cy] = this.toScreen(0.5, 0.5);
    const r = z * 1.9;                    // just under four squares across
    if (cx < -r * 2 || cy < -r * 2 || cx > this.w + r * 2 || cy > this.h + r * 2) return;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = 'rgba(38,28,16,0.46)';
    ctx.lineWidth = 1.2;
    for (const k of [1, 0.72, 0.16]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Eight points, the cardinals long and filled, the ordinals short and open.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const len = i % 2 === 0 ? r : r * 0.66;
      const w = r * (i % 2 === 0 ? 0.10 : 0.06);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a + Math.PI / 2) * w, Math.sin(a + Math.PI / 2) * w);
      ctx.lineTo(Math.cos(a - Math.PI / 2) * w, Math.sin(a - Math.PI / 2) * w);
      ctx.closePath();
      if (i % 2 === 0) { ctx.fillStyle = 'rgba(126,46,32,0.30)'; ctx.fill(); }
      ctx.stroke();
    }
    // Small caps, letter-spaced, and clamped: the names are an inscription on
    // the chart, not a headline. Left unclamped they scale with the zoom and
    // SEPTENTRIO ends up the size of a tile.
    const size = Math.max(8, Math.min(15, r * 0.12));
    ctx.fillStyle = 'rgba(38,28,16,0.62)';
    ctx.font = `600 ${size}px ui-serif, Georgia, serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    WINDS.forEach(({ name, dir }) => {
      const a = (dir / 4) * Math.PI * 2 - Math.PI / 2;
      const [tx, ty] = [Math.cos(a) * r * 1.28, Math.sin(a) * r * 1.28];
      ctx.save();
      ctx.translate(tx, ty);
      for (let i = 0; i < name.length; i++) {          // hand-spaced letters
        ctx.fillText(name[i], (i - (name.length - 1) / 2) * size * 0.78, 0);
      }
      ctx.restore();
    });
    ctx.restore();
  }

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

  /**
   * The aged-paper pass over one tile. A LIGHT warm wash pulls every colour on
   * the board toward the same ink-and-parchment family, and a hairline border
   * round the square is what an engraved plate has and a rendered board does
   * not — it says "this was printed" more than any amount of texture would.
   *
   * Light on purpose. At any real strength the wash eats the greens and the
   * terracotta together and the board goes to beige mush: the country is still
   * country, it is just country printed on an old sheet.
   *
   * Done here rather than in the tile art so the art stays the art: every other
   * mode draws the same tiles and does not want to look four hundred years old.
   */
  drawFoxedTile(x, y) {
    const ctx = this.ctx;
    const [sx, sy] = this.toScreen(x, y);
    const z = this.cam.zoom;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(216,193,150,0.15)';
    ctx.fillRect(sx, sy, z, z);
    ctx.restore();
    ctx.strokeStyle = 'rgba(64,44,26,0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(sx) + 0.5, Math.round(sy) + 0.5, Math.round(z) - 1, Math.round(z) - 1);
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
    // Girando: country adrift from the mainland. You cannot build onto it and
    // you cannot walk a follower onto it — and everything that closes out
    // there is worth half again as much. That is the single most consequential
    // thing about a square in the mode, so it gets a rim of its own.
    if (overlay.island) {
      ctx.save();
      ctx.strokeStyle = 'rgba(212,175,95,0.55)';
      ctx.lineWidth = 3;
      ctx.setLineDash([z * 0.10, z * 0.07]);
      ctx.strokeRect(sx + 2, sy + 2, z - 4, z - 4);
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

    // The turbine's sails. They can't live in the tile sprite — a sprite is
    // one picture, and these turn — so the sprite draws the tower and the hub
    // and the renderer puts the sails on every frame.
    if (overlay.turbine) this.drawSails(cell, sx, sy, z);

    // A ship flies its owner's colours. The sprite is the hull and the mast;
    // the sail is the half that says whose it is, so it's painted here.
    if (overlay.ship != null) this.drawSail(cell, sx, sy, z, PLAYER_COLORS[overlay.ship]);

    // The whale. It belongs to nobody and it sits ABOVE the country rather
    // than on it, so it is drawn last and drawn big — it overhangs its square,
    // because a thing that shelters a whole lee ought to look like it could.
    if (overlay.balena) this.drawBalena(sx, sy, z);
  }

  /**
   * The Balena: a sky whale, breathing. Nothing under it can be moved by any
   * wind and no gust passes through it, so it wants to read as MASS — a dark
   * body with a pale underside, drifting a little so it never looks like a
   * static token somebody forgot to clear.
   */
  drawBalena(sx, sy, z) {
    const ctx = this.ctx;
    const t = performance.now() / 1000;
    const bob = Math.sin(t * 0.9) * 0.035;
    const fluke = Math.sin(t * 1.7) * 0.09;
    ctx.save();
    ctx.translate(sx + z * 0.5, sy + z * (0.5 + bob));
    // A shade under full size: the whale has to read as the heaviest thing on
    // the board without hiding which tile it is pinning, and the tile under it
    // is exactly the tile you most want to be able to identify.
    ctx.scale(z * 0.88, z * 0.88);

    ctx.fillStyle = 'rgba(13,11,17,0.28)';                 // the shadow it throws
    ctx.beginPath();
    ctx.ellipse(0.02, 0.30, 0.44, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    const skin = ctx.createLinearGradient(0, -0.30, 0, 0.24);
    skin.addColorStop(0, '#4a5570');
    skin.addColorStop(0.62, '#2b3247');
    skin.addColorStop(1, '#c9d4e4');
    ctx.fillStyle = skin;
    ctx.strokeStyle = 'rgba(13,11,17,0.7)';
    ctx.lineWidth = 0.02;

    ctx.beginPath();                                        // body, nose east
    ctx.moveTo(0.52, 0.02);
    ctx.bezierCurveTo(0.30, -0.26, -0.16, -0.30, -0.34, -0.14);
    ctx.bezierCurveTo(-0.44, -0.06, -0.44, 0.06, -0.34, 0.14);
    ctx.bezierCurveTo(-0.14, 0.30, 0.28, 0.26, 0.52, 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.beginPath();                                        // tail, flicking
    ctx.moveTo(-0.32, 0.00);
    ctx.quadraticCurveTo(-0.50, -0.02 + fluke, -0.60, -0.20 + fluke);
    ctx.quadraticCurveTo(-0.46, -0.10, -0.42, 0.00);
    ctx.quadraticCurveTo(-0.46, 0.10, -0.60, 0.22 + fluke);
    ctx.quadraticCurveTo(-0.50, 0.04 + fluke, -0.32, 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.beginPath();                                        // pectoral fin
    ctx.moveTo(0.06, 0.10);
    ctx.quadraticCurveTo(0.02, 0.30, -0.14, 0.30);
    ctx.quadraticCurveTo(-0.06, 0.18, -0.06, 0.08);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#e8ded0';                              // the eye
    ctx.beginPath();
    ctx.arc(0.33, -0.05, 0.028, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#12101a';
    ctx.beginPath();
    ctx.arc(0.335, -0.05, 0.013, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Four sails on a hub, turning. Speed is fixed rather than tied to the wind:
   * the wind in this game is instantaneous, and a mill that spun only during a
   * gust would look broken for the ninety-nine frames in between.
   */
  drawSails(cell, sx, sy, z) {
    const ctx = this.ctx;
    const spot = this.markSpot(cell, 'turbine');
    if (!spot) return;
    const cx = sx + spot[0] * z;
    const cy = sy + spot[1] * z - z * 0.16;
    const a = (performance.now() / 1400) % (Math.PI * 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.strokeStyle = 'rgba(232,222,208,0.92)';
    ctx.lineWidth = Math.max(1.4, z * 0.028);
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -z * 0.20);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,222,208,0.55)';       // the canvas on each arm
      ctx.beginPath();
      ctx.moveTo(0, -z * 0.07);
      ctx.lineTo(z * 0.055, -z * 0.19);
      ctx.lineTo(0, -z * 0.20);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** The ship's sail, in its owner's colour, luffing a little. */
  drawSail(cell, sx, sy, z, color) {
    const ctx = this.ctx;
    const belly = Math.sin(performance.now() / 900) * 0.03;
    ctx.save();
    ctx.translate(sx + z * 0.5, sy + z * 0.5);
    ctx.scale(z, z);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(13,11,17,0.55)';
    ctx.lineWidth = 0.022;
    ctx.beginPath();
    ctx.moveTo(0.01, -0.34);
    ctx.quadraticCurveTo(0.30 + belly, -0.14, 0.01, 0.06);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(-0.01, -0.30);
    ctx.quadraticCurveTo(-0.22 - belly, -0.16, -0.01, 0.02);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /** Where a named mark sits on a placed tile, in unit space, after rotation. */
  markSpot(cell, kind) {
    const i = cell.type.marks.findIndex((m) => m.kind === kind);
    if (i < 0) return null;
    return rotPoint(cell.type.markSpots[i], cell.rot);
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
      // On a chart the hints are drawn in the red ink the rhumbs are drawn in;
      // gold was invisible on night and far too loud on a painted sky.
      const chart = game.m?.backdrop === 'sky';
      ctx.fillStyle = chart ? 'rgba(126,46,32,0.07)' : 'rgba(212,175,95,0.07)';
      ctx.fillRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
      ctx.strokeStyle = chart ? 'rgba(126,46,32,0.34)' : 'rgba(212,175,95,0.24)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx + z * 0.06, sy + z * 0.06, z * 0.88, z * 0.88);
    }

    // A STAGED tile is drawn solid and ringed: it is a decision you have made,
    // not a preview of one you are considering, and it should look settled
    // enough that the only question left is whether to commit it.
    const p = this.pending;
    if (p) {
      const [px, py] = this.toScreen(p.x, p.y);
      const z = this.cam.zoom;
      this.paintTile(p.x, p.y, p.rot, game.tile);
      ctx.save();
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = THEME.gold;
      ctx.setLineDash([z * 0.14, z * 0.09]);
      ctx.lineDashOffset = (performance.now() / 60) % (z * 0.23);
      ctx.strokeRect(px + 2, py + 2, z - 4, z - 4);
      ctx.restore();
      // What a tap on it does now, so the gesture doesn't have to be guessed.
      // The checkmark in the confirm panel is the only thing that commits.
      ctx.save();
      ctx.fillStyle = THEME.gold;
      ctx.font = `600 ${Math.max(10, z * 0.16)}px ui-sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(p.rots.length > 1 ? `tap to turn · ${p.rots.length} ways fit` : 'only one way fits',
        px + z / 2, py - z * 0.10);
      ctx.restore();
      return;                                 // the ghost would only fight it
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
    this.drawTokens(game);
    this.drawPigs(game);
    for (const cell of game.board.cells.values()) {
      if (!cell.meeple || !this.onScreen(cell.x, cell.y)) continue;
      if (this.fx?.veiled(`meeple:${cell.x},${cell.y}`)) continue;   // on its way
      // A follower with no feature is holding nothing — the wind put it down on
      // a tile with nothing claimable on it. It stands in the middle of the
      // tile, waiting for the country underneath it to change. There is no
      // anchor to look up, and looking one up anyway used to throw and take the
      // whole render loop down with it, which is what "the game froze" was.
      const anchor = cell.meeple.feat == null ? [0.5, 0.5] : cell.type.spots[cell.meeple.feat];
      const spot = rotPoint(anchor || [0.5, 0.5], cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      const holds = cell.meeple.feat == null ? null : cell.type.feats[cell.meeple.feat];
      // One LYING FLAT has been retired into its city on purpose: it never
      // comes home and the city pays the lower rate. It is drawn on its back,
      // which is the same shorthand the printed game uses for a figure that
      // has stopped being a follower and become a resident.
      const flat = !!cell.meeple.flat;
      this.ctx.save();
      if (flat) {
        this.ctx.translate(sx, sy);
        this.ctx.rotate(Math.PI / 2);
        this.ctx.translate(-sx, -sy);
        this.ctx.globalAlpha = 0.85;
      }
      drawMeeple(this.ctx, sx, sy, this.cam.zoom * 0.42, PLAYER_COLORS[cell.meeple.player],
        {
          adrift: cell.meeple.feat == null,
          farmer: holds?.type === 'field',
          kind: cell.meeple.kind,
          big: cell.meeple.big,
        });
      this.ctx.restore();
    }
  }

  /** Gold, little buildings, and the two magic figures. */
  drawTokens(game) {
    const z = this.cam.zoom;
    for (const cell of game.board.cells.values()) {
      if (!this.onScreen(cell.x, cell.y)) continue;
      if (cell.gold) {
        const [sx, sy] = this.toScreen(cell.x + 0.18, cell.y + 0.82);
        drawIngots(this.ctx, sx, sy, z * 0.16, cell.gold);
      }
      if (cell.building) {
        const [sx, sy] = this.toScreen(cell.x + 0.82, cell.y + 0.20);
        drawBuilding(this.ctx, sx, sy, z * 0.20, cell.building.kind,
          PLAYER_COLORS[cell.building.player]);
      }
    }
    // Pyramids and flocks stack on their own tiles.
    for (const cell of game.board.cells.values()) {
      if (!this.onScreen(cell.x, cell.y)) continue;
      if (cell.pyramid?.length) {
        for (let i = 0; i < cell.pyramid.length; i++) {
          const [sx, sy] = this.toScreen(cell.x + 0.5, cell.y + 0.62 - i * 0.22);
          drawMeeple(this.ctx, sx, sy, z * (0.34 - i * 0.04), PLAYER_COLORS[cell.pyramid[i]]);
        }
      }
      if (cell.flock?.length) {
        const n = cell.flock.reduce((a, b) => a + b, 0);
        const [sx, sy] = this.toScreen(cell.x + 0.80, cell.y + 0.80);
        this.ctx.fillStyle = '#e8e2d4';
        this.ctx.beginPath();
        this.ctx.ellipse(sx, sy, z * 0.10, z * 0.07, 0, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#2a2433';
        this.ctx.font = `${Math.max(9, z * 0.16)}px ui-sans-serif`;
        this.ctx.textAlign = 'center';
        this.ctx.fillText(String(n), sx, sy - z * 0.12);
      }
    }
    // Tower floors stack as rings; the dragon is unmistakable.
    for (const cell of game.board.cells.values()) {
      if (!cell.tower || !this.onScreen(cell.x, cell.y)) continue;
      const [sx, sy] = this.toScreen(cell.x + 0.5, cell.y + 0.5);
      for (let i = 0; i < cell.tower; i++) {
        this.ctx.strokeStyle = 'rgba(79,68,51,0.9)';
        this.ctx.lineWidth = Math.max(2, z * 0.05);
        this.ctx.strokeRect(sx - z * (0.20 - i * 0.03), sy - z * (0.20 - i * 0.03) - i * z * 0.08,
          z * (0.40 - i * 0.06), z * (0.40 - i * 0.06));
      }
    }
    if (game.dragon) {
      const [sx, sy] = this.toScreen(game.dragon.x + 0.5, game.dragon.y + 0.5);
      this.ctx.font = `${z * 0.6}px serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🐉', sx, sy);
    }
    if (game.fairy) {
      const [sx, sy] = this.toScreen(game.fairy.x + 0.78, game.fairy.y + 0.26);
      this.ctx.font = `${z * 0.34}px serif`;
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      this.ctx.fillText('🧚', sx, sy);
    }
    for (const [fig, color] of [[game.mage, '#8a5fbf'], [game.witch, '#d47a2f']]) {
      if (!fig) continue;
      const cell = game.board.get(fig.x, fig.y);
      if (!cell || !this.onScreen(fig.x, fig.y)) continue;
      const anchor = cell.type.spots[fig.feat] || [0.5, 0.5];
      const spot = rotPoint(anchor, cell.rot);
      const [sx, sy] = this.toScreen(fig.x + spot[0] * 0.6 + 0.2, fig.y + spot[1] * 0.6 + 0.2);
      drawMeeple(this.ctx, sx, sy, z * 0.34, color, { hero: true });
    }
  }

  /** Pigs, drawn under the followers so a farmer is never hidden by one. */
  drawPigs(game) {
    for (const cell of game.board.cells.values()) {
      if (!cell.pig || !this.onScreen(cell.x, cell.y)) continue;
      const anchor = cell.type.spots[cell.pig.feat] || [0.5, 0.5];
      const spot = rotPoint(anchor, cell.rot);
      const [sx, sy] = this.toScreen(cell.x + spot[0], cell.y + spot[1]);
      drawPig(this.ctx, sx + this.cam.zoom * 0.16, sy + this.cam.zoom * 0.10,
        this.cam.zoom * 0.26, PLAYER_COLORS[cell.pig.player]);
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
      drawMeeple(ctx, sx, sy, this.cam.zoom * 0.26, PLAYER_COLORS[game.current],
        { farmer: o.f?.type === 'field' });
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
