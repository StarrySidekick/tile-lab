// ---------------------------------------------------------------------------
// Procedural tile art. Everything is drawn in a 1x1 unit square at rotation 0;
// the renderer rotates the canvas. No image assets, so a new tile type gets
// art for free the moment you add it to tiles.js.
// ---------------------------------------------------------------------------

import { SIDE_MID } from './tiles.js';

export const PALETTE = {
  field: '#86ab5c',
  fieldEdge: '#6d9049',
  city: '#cfa871',
  cityShade: '#b98f56',
  cityWall: '#7d5b34',
  road: '#efe7d2',
  roadEdge: '#4a4032',
  border: 'rgba(40,34,24,0.45)',
  abbeyWall: '#f0e9db',
  abbeyRoof: '#a8402f',
  shield: '#2f5fa8',
  shieldEdge: '#16305c',
};

export const PLAYER_COLORS = ['#d23c34', '#2f6fd0', '#2f9e52', '#e0a520', '#141414'];
export const PLAYER_NAMES = ['Red', 'Blue', 'Green', 'Yellow', 'Black'];

/** Run `fn` with the unit square rotated k quarter-turns about its center. */
function withRot(ctx, k, fn) {
  ctx.save();
  ctx.translate(0.5, 0.5);
  ctx.rotate((k & 3) * Math.PI / 2);
  ctx.translate(-0.5, -0.5);
  fn();
  ctx.restore();
}

// --- city silhouettes (canonical orientations) ------------------------------

function capPath(ctx) {            // city on N only
  ctx.moveTo(0, 0);
  ctx.lineTo(1, 0);
  ctx.quadraticCurveTo(0.5, 0.68, 0, 0);
}

function cornerPath(ctx) {         // city on N + W, connected
  ctx.moveTo(1, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, 1);
  ctx.quadraticCurveTo(0.82, 0.82, 1, 0);
}

function bandPath(ctx) {           // city across E + W
  ctx.moveTo(0, 0.14);
  ctx.quadraticCurveTo(0.5, 0.34, 1, 0.14);
  ctx.lineTo(1, 0.86);
  ctx.quadraticCurveTo(0.5, 0.66, 0, 0.86);
  ctx.closePath();
}

function threePath(ctx) {          // city on N + E + W (S open)
  ctx.moveTo(0, 0);
  ctx.lineTo(1, 0);
  ctx.lineTo(1, 0.92);
  ctx.quadraticCurveTo(0.5, 0.56, 0, 0.92);
  ctx.closePath();
}

/**
 * Turn a city feature's side-set into { k, path } — a canonical shape plus the
 * number of quarter-turns needed to line it up with the real sides.
 */
function cityShape(sides) {
  const set = new Set(sides);
  const n = sides.length;
  if (n === 4) return { k: 0, path: (ctx) => ctx.rect(0, 0, 1, 1) };
  if (n === 1) return { k: sides[0], path: capPath };
  if (n === 3) {
    const open = [0, 1, 2, 3].find((s) => !set.has(s));
    return { k: (open - 2 + 4) % 4, path: threePath };
  }
  // n === 2
  const [a, b] = sides;
  if ((a + 2) % 4 === b) return { k: set.has(1) ? 0 : 1, path: bandPath };
  // adjacent pair: canonical shape covers {N, W} = {0, 3}
  for (let k = 0; k < 4; k++) {
    if (set.has(k % 4) && set.has((3 + k) % 4)) return { k, path: cornerPath };
  }
  return { k: 0, path: cornerPath };
}

function drawCity(ctx, f) {
  const { k, path } = cityShape(f.sides);
  withRot(ctx, k, () => {
    ctx.beginPath();
    path(ctx);
    ctx.fillStyle = PALETTE.city;
    ctx.fill();
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = PALETTE.cityWall;
    ctx.stroke();
    // A couple of masonry lines so cities read as built-up, not just tan blobs.
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = PALETTE.cityShade;
    ctx.lineWidth = 0.018;
    for (let i = -1; i < 2.2; i += 0.16) {
      ctx.beginPath();
      ctx.moveTo(i, -0.2);
      ctx.lineTo(i + 0.9, 1.2);
      ctx.stroke();
    }
    ctx.restore();
  });
}

// --- roads ------------------------------------------------------------------

function roadPath(ctx, f) {
  ctx.beginPath();
  if (f.sides.length === 1) {
    const [mx, my] = SIDE_MID[f.sides[0]];
    ctx.moveTo(mx, my);
    ctx.lineTo(0.5, 0.5);
  } else {
    const [ax, ay] = SIDE_MID[f.sides[0]];
    const [bx, by] = SIDE_MID[f.sides[1]];
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(0.5, 0.5, bx, by);
  }
}

function drawRoad(ctx, f) {
  ctx.lineCap = 'round';
  roadPath(ctx, f);
  ctx.lineWidth = 0.14;
  ctx.strokeStyle = PALETTE.roadEdge;
  ctx.stroke();
  roadPath(ctx, f);
  ctx.lineWidth = 0.095;
  ctx.strokeStyle = PALETTE.road;
  ctx.stroke();
}

// --- monastery & shield -----------------------------------------------------

function drawAbbey(ctx) {
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = PALETTE.abbeyWall;
  ctx.strokeStyle = PALETTE.cityWall;
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.rect(0.36, 0.46, 0.28, 0.22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.abbeyRoof;
  ctx.beginPath();
  ctx.moveTo(0.31, 0.46);
  ctx.lineTo(0.50, 0.31);
  ctx.lineTo(0.69, 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = PALETTE.abbeyRoof;      // little steeple
  ctx.fillRect(0.475, 0.24, 0.05, 0.10);
}

function drawShield(ctx, [sx, sy]) {
  const w = 0.10, h = 0.12;
  ctx.beginPath();
  ctx.moveTo(sx - w / 2, sy - h / 2);
  ctx.lineTo(sx + w / 2, sy - h / 2);
  ctx.lineTo(sx + w / 2, sy + h / 6);
  ctx.quadraticCurveTo(sx, sy + h / 2 + 0.02, sx - w / 2, sy + h / 6);
  ctx.closePath();
  ctx.fillStyle = PALETTE.shield;
  ctx.fill();
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = PALETTE.shieldEdge;
  ctx.stroke();
}

// --- public: draw one tile in unit space ------------------------------------

/**
 * Draw a tile type into the current 1x1 unit transform.
 * Roads are painted before cities so they visually terminate at the city wall.
 */
export function drawTile(ctx, type) {
  ctx.fillStyle = PALETTE.field;
  ctx.fillRect(0, 0, 1, 1);

  for (const f of type.feats) if (f.type === 'road') drawRoad(ctx, f);
  // Two or more dead-end road stubs meeting = a junction, not a through road.
  // The village disc is what makes L/W/X read correctly (and it's where the
  // roads actually terminate for scoring).
  if (type.feats.filter((f) => f.type === 'road' && f.sides.length === 1).length >= 2) {
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.115, 0, Math.PI * 2);
    ctx.fillStyle = PALETTE.road;
    ctx.fill();
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = PALETTE.roadEdge;
    ctx.stroke();
  }
  type.feats.forEach((f, i) => {
    if (f.type !== 'city') return;
    drawCity(ctx, f);
    if (f.shield) {
      const [sx, sy] = type.spots[i];
      drawShield(ctx, [sx, sy - 0.16]);
    }
  });
  for (const f of type.feats) if (f.type === 'monastery') drawAbbey(ctx);

  ctx.lineWidth = 0.02;
  ctx.strokeStyle = PALETTE.border;
  ctx.strokeRect(0.01, 0.01, 0.98, 0.98);
}

/** Meeple silhouette, centered on the origin, roughly 1 unit tall. */
export function meeplePath(ctx) {
  ctx.beginPath();
  ctx.arc(0, -0.30, 0.21, 0, Math.PI * 2);
  ctx.moveTo(0, -0.12);
  ctx.quadraticCurveTo(0.17, -0.10, 0.23, 0.02);
  ctx.lineTo(0.50, 0.10);
  ctx.lineTo(0.46, 0.25);
  ctx.lineTo(0.17, 0.22);
  ctx.lineTo(0.31, 0.50);
  ctx.lineTo(0.09, 0.50);
  ctx.lineTo(0, 0.34);
  ctx.lineTo(-0.09, 0.50);
  ctx.lineTo(-0.31, 0.50);
  ctx.lineTo(-0.17, 0.22);
  ctx.lineTo(-0.46, 0.25);
  ctx.lineTo(-0.50, 0.10);
  ctx.lineTo(-0.23, 0.02);
  ctx.quadraticCurveTo(-0.17, -0.10, 0, -0.12);
  ctx.closePath();
}

export function drawMeeple(ctx, x, y, size, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  meeplePath(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.stroke();
  ctx.restore();
}
