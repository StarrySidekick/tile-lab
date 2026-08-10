// ---------------------------------------------------------------------------
// Procedural tile art. Everything is drawn in a 1x1 unit square at rotation 0;
// the renderer rotates the canvas. No image assets, so a new tile type gets
// art for free the moment you add it to tiles.js.
//
// Colours all come from theme.js — edit that file to re-vibe the game.
// ---------------------------------------------------------------------------

import { SIDE_MID } from './tiles.js';
import { THEME, PLAYER_COLORS, PLAYER_NAMES } from './theme.js';

export { PLAYER_COLORS, PLAYER_NAMES };

/** Run `fn` with the unit square rotated k quarter-turns about its centre. */
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
 * quarter-turns needed to line it up with the real sides.
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
  const [a, b] = sides;
  if ((a + 2) % 4 === b) return { k: set.has(1) ? 0 : 1, path: bandPath };
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
    ctx.fillStyle = THEME.city;
    ctx.fill();
    ctx.lineWidth = 0.035;
    ctx.strokeStyle = THEME.cityWall;
    ctx.stroke();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = THEME.cityShade;
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

function drawRoad(ctx, f, cave) {
  ctx.lineCap = 'round';
  roadPath(ctx, f);
  ctx.lineWidth = cave ? 0.30 : 0.14;
  ctx.strokeStyle = cave ? THEME.roadEdge : THEME.roadEdge;
  ctx.stroke();
  roadPath(ctx, f);
  ctx.lineWidth = cave ? 0.25 : 0.095;
  ctx.strokeStyle = cave ? '#8d7f66' : THEME.roadCore;
  ctx.stroke();
}

// --- monastery --------------------------------------------------------------

function drawAbbey(ctx) {
  ctx.fillStyle = 'rgba(232,222,208,0.10)';
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.30, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = THEME.plaster;
  ctx.strokeStyle = THEME.timber;
  ctx.lineWidth = 0.018;
  ctx.beginPath();
  ctx.rect(0.36, 0.46, 0.28, 0.22);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = THEME.roof;
  ctx.beginPath();
  ctx.moveTo(0.31, 0.46);
  ctx.lineTo(0.50, 0.31);
  ctx.lineTo(0.69, 0.46);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = THEME.roof;
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
  ctx.fillStyle = THEME.shield;
  ctx.fill();
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = THEME.shieldEdge;
  ctx.stroke();
}

// --- landmark marks ---------------------------------------------------------
// Each is drawn centred on (0,0) in a roughly 1x1 box, then scaled by `s`.

function roofTri(ctx, x, y, w, h, color) {
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y);
  ctx.lineTo(x, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.stroke();
}

const MARK_ART = {
  stable(ctx) {
    ctx.fillStyle = THEME.timber;
    ctx.fillRect(-0.38, -0.10, 0.76, 0.42);
    ctx.strokeRect(-0.38, -0.10, 0.76, 0.42);
    roofTri(ctx, 0, -0.10, 0.92, 0.34, THEME.roofDark);
    ctx.fillStyle = THEME.plaster;              // open stable door
    ctx.beginPath();
    ctx.moveTo(-0.14, 0.32);
    ctx.lineTo(-0.14, 0.06);
    ctx.quadraticCurveTo(0, -0.08, 0.14, 0.06);
    ctx.lineTo(0.14, 0.32);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  },
  village(ctx) {
    const hut = (x, y, w) => {
      ctx.fillStyle = THEME.plaster;
      ctx.fillRect(x - w / 2, y, w, w * 0.8);
      ctx.strokeRect(x - w / 2, y, w, w * 0.8);
      roofTri(ctx, x, y, w * 1.3, w * 0.7, THEME.roof);
    };
    hut(-0.26, 0.02, 0.34);
    hut(0.24, 0.08, 0.30);
    hut(0.00, -0.16, 0.38);
  },
  tower(ctx) {
    ctx.fillStyle = THEME.city;                 // tapered body
    ctx.beginPath();
    ctx.moveTo(-0.17, -0.28);
    ctx.lineTo(0.17, -0.28);
    ctx.lineTo(0.25, 0.40);
    ctx.lineTo(-0.25, 0.40);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = THEME.cityShade;            // parapet
    ctx.beginPath(); ctx.rect(-0.27, -0.30, 0.54, 0.10); ctx.fill(); ctx.stroke();
    for (const x of [-0.27, -0.07, 0.13]) {     // teeth, drawn apart so gaps read
      ctx.beginPath(); ctx.rect(x, -0.46, 0.14, 0.17); ctx.fill(); ctx.stroke();
    }

    ctx.fillStyle = THEME.teal;                 // lit window — the signal fire
    ctx.beginPath();
    ctx.moveTo(-0.07, 0.14);
    ctx.lineTo(0.07, 0.14);
    ctx.lineTo(0.07, -0.06);
    ctx.quadraticCurveTo(0, -0.18, -0.07, -0.06);
    ctx.closePath();
    ctx.fill();
  },
  cave(ctx) {
    ctx.fillStyle = THEME.cityShade;            // rocky mound
    ctx.beginPath();
    ctx.moveTo(-0.48, 0.38);
    ctx.quadraticCurveTo(-0.30, -0.42, 0.06, -0.40);
    ctx.quadraticCurveTo(0.42, -0.36, 0.48, 0.38);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#120f16';                  // the dark mouth
    ctx.beginPath();
    ctx.moveTo(-0.24, 0.38);
    ctx.quadraticCurveTo(-0.22, -0.10, 0.02, -0.12);
    ctx.quadraticCurveTo(0.26, -0.10, 0.24, 0.38);
    ctx.closePath();
    ctx.fill();
  },
  market(ctx) {
    ctx.fillStyle = THEME.timber;
    ctx.fillRect(-0.36, 0.02, 0.72, 0.30);
    ctx.strokeRect(-0.36, 0.02, 0.72, 0.30);
    const stripes = ['#b6483a', THEME.plaster, '#b6483a', THEME.plaster];
    stripes.forEach((c, i) => {                 // awning
      ctx.fillStyle = c;
      ctx.fillRect(-0.44 + i * 0.22, -0.24, 0.22, 0.26);
    });
    ctx.strokeRect(-0.44, -0.24, 0.88, 0.26);
  },
  keep(ctx) {
    ctx.fillStyle = THEME.cityShade;
    ctx.fillRect(-0.30, -0.24, 0.60, 0.62);
    ctx.strokeRect(-0.30, -0.24, 0.60, 0.62);
    for (const x of [-0.32, -0.10, 0.12]) {     // battlements
      ctx.fillStyle = THEME.city;
      ctx.fillRect(x, -0.38, 0.14, 0.16);
      ctx.strokeRect(x, -0.38, 0.14, 0.16);
    }
    ctx.strokeStyle = THEME.timber;             // flagpole
    ctx.beginPath(); ctx.moveTo(0, -0.38); ctx.lineTo(0, -0.62); ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.beginPath();
    ctx.moveTo(0, -0.62); ctx.lineTo(0.26, -0.54); ctx.lineTo(0, -0.46);
    ctx.closePath(); ctx.fill();
  },
  library(ctx) {
    ctx.fillStyle = THEME.plaster;
    ctx.fillRect(-0.36, -0.26, 0.72, 0.62);
    ctx.strokeRect(-0.36, -0.26, 0.72, 0.62);
    roofTri(ctx, 0, -0.26, 0.86, 0.28, THEME.roofDark);
    ctx.fillStyle = THEME.tealDeep;             // tall windows
    for (const x of [-0.24, -0.06, 0.12]) ctx.fillRect(x, -0.14, 0.12, 0.32);
  },
  armoury(ctx) {
    ctx.fillStyle = THEME.cityShade;
    ctx.beginPath();                            // shield
    ctx.moveTo(-0.30, -0.32);
    ctx.lineTo(0.30, -0.32);
    ctx.lineTo(0.30, 0.06);
    ctx.quadraticCurveTo(0, 0.46, -0.30, 0.06);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = THEME.gold;               // crossed blades
    ctx.lineWidth = 0.075;
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.18); ctx.lineTo(0.16, 0.14);
    ctx.moveTo(0.16, -0.18); ctx.lineTo(-0.16, 0.14);
    ctx.stroke();
  },
  hoard(ctx) {
    ctx.fillStyle = THEME.gold;
    for (const [x, y, r] of [[-0.20, 0.18, 0.15], [0.18, 0.20, 0.14], [0, 0.02, 0.17], [-0.06, 0.26, 0.12]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = THEME.teal;
    ctx.beginPath();
    ctx.moveTo(0.02, -0.34); ctx.lineTo(0.20, -0.14); ctx.lineTo(0.02, 0.06); ctx.lineTo(-0.16, -0.14);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  trove(ctx) {
    ctx.fillStyle = THEME.timber;
    ctx.fillRect(-0.34, -0.04, 0.68, 0.34);
    ctx.strokeRect(-0.34, -0.04, 0.68, 0.34);
    ctx.fillStyle = THEME.roofDark;             // curved lid
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.04);
    ctx.quadraticCurveTo(0, -0.42, 0.34, -0.04);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.fillRect(-0.07, -0.10, 0.14, 0.20);
  },
  spring(ctx) {
    ctx.fillStyle = 'rgba(95,191,174,0.22)';
    ctx.beginPath(); ctx.arc(0, 0, 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = THEME.teal;
    ctx.beginPath(); ctx.ellipse(0, 0.06, 0.30, 0.20, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(232,222,208,0.85)';
    ctx.beginPath(); ctx.ellipse(-0.08, 0.00, 0.10, 0.06, 0, 0, Math.PI * 2); ctx.fill();
  },
  shaft(ctx) {
    ctx.fillStyle = 'rgba(212,175,95,0.20)';    // shaft of daylight
    ctx.beginPath();
    ctx.moveTo(-0.12, -0.50); ctx.lineTo(0.12, -0.50);
    ctx.lineTo(0.34, 0.34); ctx.lineTo(-0.34, 0.34);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = THEME.gold;
    ctx.lineWidth = 0.06;
    for (const y of [0.06, 0.18, 0.30]) {       // ladder rungs
      ctx.beginPath(); ctx.moveTo(-0.16, y); ctx.lineTo(0.16, y); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(-0.16, -0.10); ctx.lineTo(-0.16, 0.34);
    ctx.moveTo(0.16, -0.10); ctx.lineTo(0.16, 0.34); ctx.stroke();
  },
};

/** Draw a landmark centred at (x, y) in unit tile space. */
export function drawMark(ctx, kind, [x, y], s = 0.46) {
  const art = MARK_ART[kind];
  if (!art) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = THEME.timber;
  ctx.lineJoin = 'round';
  // Soft ground shadow so landmarks sit on the tile instead of floating.
  ctx.fillStyle = 'rgba(13,11,17,0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 0.42, 0.50, 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  art(ctx);
  ctx.restore();
}

// --- public: draw one tile in unit space ------------------------------------

/**
 * Draw a tile type into the current 1x1 unit transform.
 *
 * Roads are painted before cities so they visually terminate at the city wall,
 * and the whole thing is clipped to the tile square — round line caps on roads
 * would otherwise bleed a few percent past the edge and break the seams.
 */
export function drawTile(ctx, type, { cave = false } = {}) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1, 1);
  ctx.clip();

  if (cave) {
    ctx.fillStyle = '#2b2533';                  // solid rock
    ctx.fillRect(0, 0, 1, 1);
  } else {
    ctx.fillStyle = THEME.field;
    ctx.fillRect(0, 0, 1, 1);
    // Faint diagonal hatch, matching the city masonry so the whole tile reads
    // as one drawing. Horizontal banding here just looked like scanlines.
    ctx.strokeStyle = 'rgba(90,100,56,0.30)';
    ctx.lineWidth = 0.02;
    for (let i = -1; i < 2.2; i += 0.21) {
      ctx.beginPath();
      ctx.moveTo(i, -0.2);
      ctx.lineTo(i + 0.9, 1.2);
      ctx.stroke();
    }
  }

  for (const f of type.feats) if (f.type === 'road') drawRoad(ctx, f, cave);

  // Two or more dead-end road stubs meeting = a junction, not a through road.
  if (type.feats.filter((f) => f.type === 'road' && f.sides.length === 1).length >= 2) {
    ctx.beginPath();
    ctx.arc(0.5, 0.5, cave ? 0.20 : 0.115, 0, Math.PI * 2);
    ctx.fillStyle = cave ? '#8d7f66' : THEME.roadCore;
    ctx.fill();
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = THEME.roadEdge;
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

  type.marks.forEach((m, i) => drawMark(ctx, m.kind, type.markSpots[i]));

  ctx.lineWidth = 0.02;
  ctx.strokeStyle = THEME.border;
  ctx.strokeRect(0.01, 0.01, 0.98, 0.98);
  ctx.restore();
}

// --- meeples ----------------------------------------------------------------

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

export function drawMeeple(ctx, x, y, size, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);

  if (opts.resting) {                           // face-down at a village
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0.16, 0.52, 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (opts.mounted) {                           // stable upgrade — a mount ring
    ctx.beginPath();
    ctx.arc(0, 0.06, 0.66, 0, Math.PI * 2);
    ctx.lineWidth = 0.10;
    ctx.strokeStyle = THEME.gold;
    ctx.stroke();
  }

  meeplePath(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.stroke();
  ctx.restore();
}
