// ---------------------------------------------------------------------------
// Procedural tile art. Everything is drawn in a 1x1 unit square at rotation 0;
// the renderer rotates the canvas. No image assets, so a new tile type gets
// art for free the moment you add it to tiles.js.
//
// Colours all come from theme.js — edit that file to re-vibe the game.
// ---------------------------------------------------------------------------

import { SIDE_MID } from './tiles.js';
import { THEME, PLAYER_COLORS, PLAYER_NAMES } from './theme.js';
import { LIGHT, spin, relief, groove, shadow, noShadow } from './light.js';

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
//
// Every silhouette comes in two halves: the `path` it fills, and the `rim` —
// the part of its outline that is a genuine boundary rather than a tile edge.
// Relief lighting shades the rim and leaves the tile edges alone, so a feature
// running across a seam reads as one continuous thing instead of two walled-off
// halves. See light.js.

function capPath(ctx) {            // city on N only
  ctx.moveTo(0, 0);
  ctx.lineTo(1, 0);
  ctx.quadraticCurveTo(0.5, 0.68, 0, 0);
}

function capRim(ctx) {
  ctx.moveTo(1, 0);
  ctx.quadraticCurveTo(0.5, 0.68, 0, 0);
}

function cornerPath(ctx) {         // city on N + W, connected
  ctx.moveTo(1, 0);
  ctx.lineTo(0, 0);
  ctx.lineTo(0, 1);
  ctx.quadraticCurveTo(0.82, 0.82, 1, 0);
}

function cornerRim(ctx) {
  ctx.moveTo(0, 1);
  ctx.quadraticCurveTo(0.82, 0.82, 1, 0);
}

function bandPath(ctx) {           // city across E + W
  ctx.moveTo(0, 0.14);
  ctx.quadraticCurveTo(0.5, 0.34, 1, 0.14);
  ctx.lineTo(1, 0.86);
  ctx.quadraticCurveTo(0.5, 0.66, 0, 0.86);
  ctx.closePath();
}

function bandRim(ctx) {
  ctx.moveTo(0, 0.14);
  ctx.quadraticCurveTo(0.5, 0.34, 1, 0.14);
  ctx.moveTo(1, 0.86);
  ctx.quadraticCurveTo(0.5, 0.66, 0, 0.86);
}

function threePath(ctx) {          // city on N + E + W (S open)
  ctx.moveTo(0, 0);
  ctx.lineTo(1, 0);
  ctx.lineTo(1, 0.92);
  ctx.quadraticCurveTo(0.5, 0.56, 0, 0.92);
  ctx.closePath();
}

function threeRim(ctx) {
  ctx.moveTo(1, 0.92);
  ctx.quadraticCurveTo(0.5, 0.56, 0, 0.92);
}

/**
 * Turn a city feature's side-set into { k, path, rim } — a canonical shape plus
 * the quarter-turns needed to line it up with the real sides.
 *
 * A four-sided feature has no rim: every edge of it is a tile edge, so there is
 * no wall to light. That is exactly right — a city filling the whole tile is
 * the middle of a bigger city, not a block sitting on a field.
 */
function cityShape(sides) {
  const set = new Set(sides);
  const n = sides.length;
  if (n === 4) return { k: 0, path: (ctx) => ctx.rect(0, 0, 1, 1), rim: null };
  if (n === 1) return { k: sides[0], path: capPath, rim: capRim };
  if (n === 3) {
    const open = [0, 1, 2, 3].find((s) => !set.has(s));
    return { k: (open - 2 + 4) % 4, path: threePath, rim: threeRim };
  }
  const [a, b] = sides;
  if ((a + 2) % 4 === b) return { k: set.has(1) ? 0 : 1, path: bandPath, rim: bandRim };
  for (let k = 0; k < 4; k++) {
    if (set.has(k % 4) && set.has((3 + k) % 4)) return { k, path: cornerPath, rim: cornerRim };
  }
  return { k: 0, path: cornerPath, rim: cornerRim };
}

function drawCity(ctx, f, L) {
  const { k, path, rim } = cityShape(f.sides);
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
    // Stone stands tallest of anything on the board, and it's the one feature
    // whose whole point is that it's walled.
    relief(ctx, path, rim, spin(L, k), {
      height: 0.055, lit: THEME.litStrong, shade: THEME.shadeStrong,
    });
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

const ROAD_STYLE = {
  surface: { outer: 0.14, inner: 0.095, edge: THEME.roadEdge, core: THEME.roadCore },
  cave:    { outer: 0.30, inner: 0.25,  edge: THEME.roadEdge, core: '#8d7f66' },
  city:    { outer: 0.42, inner: 0.36,  edge: '#3a3340',      core: '#9a9086' },
};

function drawRoad(ctx, f, terrain, L) {
  const s = ROAD_STYLE[terrain] || ROAD_STYLE.surface;
  ctx.lineCap = 'round';
  roadPath(ctx, f);
  ctx.lineWidth = s.outer;
  ctx.strokeStyle = s.edge;
  ctx.stroke();
  roadPath(ctx, f);
  ctx.lineWidth = s.inner;
  ctx.strokeStyle = s.core;
  ctx.stroke();
  // A cart track is worn into the ground rather than laid on it, so it gets a
  // groove rather than a wall: dark on the lit side, bright on the far one.
  groove(ctx, (c) => roadPath(c, f), L, s.inner, {
    thin: 0.30, lit: 'rgba(255,240,212,0.16)', shade: 'rgba(26,18,34,0.34)',
  });
}

// --- monastery --------------------------------------------------------------

function drawAbbey(ctx, L) {
  ctx.fillStyle = 'rgba(232,222,208,0.10)';
  ctx.beginPath();
  ctx.arc(0.5, 0.5, 0.30, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  shadow(ctx, L, 0.035, 0.045);

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
  ctx.restore();

  // The roof is the one plane on the tile whose pitch we actually know, so it
  // gets lit properly: the slope facing the sun, and the one that doesn't.
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0.31, 0.46);
  ctx.lineTo(0.50, 0.31);
  ctx.lineTo(0.69, 0.46);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = L.x < 0 ? THEME.lit : THEME.shade;
  ctx.fillRect(0.31, 0.31, 0.19, 0.15);
  ctx.fillStyle = L.x < 0 ? THEME.shade : THEME.lit;
  ctx.fillRect(0.50, 0.31, 0.19, 0.15);
  ctx.restore();
}

function drawShield(ctx, [sx, sy], L = LIGHT) {
  const w = 0.10, h = 0.12;
  ctx.save();
  shadow(ctx, L, 0.028, 0.04);
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
  ctx.restore();
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

/**
 * City districts share one building silhouette and differ by roof colour plus a
 * small glyph — they sit shoulder to shoulder in a street, so a common shape
 * reads as a row of buildings rather than a row of unrelated icons.
 */
function district(ctx, roof, glyph) {
  ctx.fillStyle = THEME.plaster;
  ctx.beginPath(); ctx.rect(-0.34, -0.04, 0.68, 0.40); ctx.fill(); ctx.stroke();
  roofTri(ctx, 0, -0.04, 0.82, 0.30, roof);
  if (glyph) glyph(ctx);
}

/** A blunt tower body — keeps, forts and skyholds are all variations on it. */
function turret(ctx, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.rect(-w / 2, -h / 2, w, h);
  ctx.fill(); ctx.stroke();
  for (let x = -w / 2; x < w / 2 - 0.01; x += w / 3) {   // crenellations
    ctx.beginPath();
    ctx.rect(x, -h / 2 - 0.12, w / 6, 0.13);
    ctx.fill(); ctx.stroke();
  }
}

const MARK_ART = {
  // --- expansions ------------------------------------------------------------
  inn(ctx) {
    district(ctx, '#8a5a3a', (c) => {           // a sign hanging off the front
      c.strokeStyle = THEME.timber;
      c.lineWidth = 0.06;
      c.beginPath(); c.moveTo(0.34, 0.04); c.lineTo(0.52, 0.04); c.stroke();
      c.fillStyle = THEME.gold;
      c.beginPath(); c.rect(0.44, 0.06, 0.16, 0.14); c.fill(); c.stroke();
    });
  },
  cathedral(ctx) {
    ctx.fillStyle = THEME.plaster;
    ctx.beginPath(); ctx.rect(-0.30, -0.10, 0.60, 0.46); ctx.fill(); ctx.stroke();
    for (const x of [-0.18, 0.18]) {            // towers
      ctx.beginPath(); ctx.rect(x - 0.09, -0.34, 0.18, 0.30); ctx.fill(); ctx.stroke();
      roofTri(ctx, x, -0.34, 0.24, 0.20, THEME.roofDark);
    }
    roofTri(ctx, 0, -0.14, 0.44, 0.26, THEME.roof);
    ctx.fillStyle = THEME.shield;               // rose window
    ctx.beginPath(); ctx.arc(0, 0.10, 0.10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  },
  wine(ctx) {
    ctx.fillStyle = '#6d2f45';
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.34); ctx.lineTo(0.16, -0.34);
    ctx.quadraticCurveTo(0.20, 0.06, 0.26, 0.34);
    ctx.lineTo(-0.26, 0.34);
    ctx.quadraticCurveTo(-0.20, 0.06, -0.16, -0.34);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.plaster;
    ctx.beginPath(); ctx.rect(-0.18, 0.02, 0.36, 0.16); ctx.fill();
  },
  grain(ctx) {
    ctx.strokeStyle = '#b99a4e';
    ctx.lineWidth = 0.08;
    for (const x of [-0.18, 0, 0.18]) {
      ctx.beginPath(); ctx.moveTo(x, 0.38); ctx.lineTo(x, -0.24); ctx.stroke();
      ctx.fillStyle = '#d9be6e';
      ctx.beginPath();
      ctx.ellipse(x, -0.30, 0.10, 0.17, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.055;
  },
  cloth(ctx) {
    ctx.fillStyle = '#4a6f8a';
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.26); ctx.lineTo(0.34, -0.26); ctx.lineTo(0.34, 0.18);
    ctx.quadraticCurveTo(0.17, 0.38, 0, 0.18);
    ctx.quadraticCurveTo(-0.17, -0.02, -0.34, 0.18);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.045;
    for (const y of [-0.14, 0.00]) {
      ctx.beginPath(); ctx.moveTo(-0.30, y); ctx.lineTo(0.30, y); ctx.stroke();
    }
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.055;
  },
  spring(ctx) {
    ctx.fillStyle = THEME.rockDark;             // rocks around the source
    for (const [x, y, r] of [[-0.30, 0.18, 0.16], [0.30, 0.14, 0.14], [0.02, -0.28, 0.13]]) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  },
  mouth(ctx) {
    ctx.fillStyle = 'rgba(190,220,235,0.5)';    // widening water
    ctx.beginPath();
    ctx.ellipse(0, 0.06, 0.42, 0.30, 0, 0, Math.PI * 2);
    ctx.fill();
  },

  // --- marches ---------------------------------------------------------------
  stronghold(ctx) {
    turret(ctx, 0.34, 0.72, THEME.city);
    turret(ctx, 0.72, 0.42, THEME.cityShade);
    ctx.fillStyle = THEME.gold;                 // banner
    ctx.beginPath();
    ctx.moveTo(0.17, -0.50);
    ctx.lineTo(0.52, -0.40);
    ctx.lineTo(0.17, -0.28);
    ctx.closePath();
    ctx.fill();
  },
  fort(ctx) {
    turret(ctx, 0.60, 0.46, THEME.cityShade);
    ctx.fillStyle = THEME.timber;               // gate
    ctx.beginPath(); ctx.rect(-0.10, 0.00, 0.20, 0.23); ctx.fill(); ctx.stroke();
  },
  hill(ctx) {
    ctx.fillStyle = THEME.fieldAlt;
    ctx.beginPath();
    ctx.moveTo(-0.56, 0.30);
    ctx.quadraticCurveTo(-0.16, -0.36, 0.10, 0.06);
    ctx.quadraticCurveTo(0.30, 0.34, 0.56, 0.30);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.fieldEdge;
    ctx.beginPath();
    ctx.moveTo(0.02, 0.30);
    ctx.quadraticCurveTo(0.26, -0.12, 0.44, 0.12);
    ctx.quadraticCurveTo(0.52, 0.24, 0.58, 0.30);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  },
  ford(ctx) {
    ctx.strokeStyle = THEME.shield;
    ctx.lineWidth = 0.10;
    for (const y of [-0.12, 0.10, 0.32]) {
      ctx.beginPath();
      ctx.moveTo(-0.50, y);
      ctx.quadraticCurveTo(-0.16, y - 0.14, 0.10, y);
      ctx.quadraticCurveTo(0.34, y + 0.14, 0.54, y);
      ctx.stroke();
    }
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.055;
  },
  beacon(ctx) {
    ctx.fillStyle = THEME.timber;               // brazier legs
    ctx.beginPath();
    ctx.moveTo(-0.20, 0.42); ctx.lineTo(-0.06, 0.02);
    ctx.lineTo(0.06, 0.02); ctx.lineTo(0.20, 0.42);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.gold;                 // flame
    ctx.beginPath();
    ctx.moveTo(0, -0.52);
    ctx.quadraticCurveTo(0.28, -0.16, 0.16, 0.02);
    ctx.quadraticCurveTo(0, 0.10, -0.16, 0.02);
    ctx.quadraticCurveTo(-0.28, -0.16, 0, -0.52);
    ctx.fill();
  },
  muster(ctx) {
    for (const x of [-0.26, 0, 0.26]) {         // a rack of spears
      ctx.strokeStyle = THEME.timber;
      ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.moveTo(x, 0.42); ctx.lineTo(x, -0.40); ctx.stroke();
      ctx.fillStyle = THEME.cityShade;
      ctx.beginPath();
      ctx.moveTo(x, -0.56); ctx.lineTo(x + 0.09, -0.34); ctx.lineTo(x - 0.09, -0.34);
      ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 0.055;
  },

  // --- descent ---------------------------------------------------------------
  stair(ctx) {
    ctx.fillStyle = '#241f2c';                  // a hole with steps going down
    ctx.beginPath(); ctx.rect(-0.44, -0.34, 0.88, 0.74); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.cityShade;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.rect(-0.40 + i * 0.05, 0.28 - i * 0.16, 0.80 - i * 0.10, 0.10);
      ctx.fill();
    }
  },
  bandit(ctx) {
    ctx.fillStyle = THEME.timber;               // lean-to
    ctx.beginPath();
    ctx.moveTo(-0.46, 0.38); ctx.lineTo(-0.02, -0.40);
    ctx.lineTo(0.14, -0.40); ctx.lineTo(0.30, 0.38);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#a8443a';                // crossed blades
    ctx.lineWidth = 0.08;
    ctx.beginPath();
    ctx.moveTo(0.10, 0.34); ctx.lineTo(0.56, -0.10);
    ctx.moveTo(0.56, 0.34); ctx.lineTo(0.10, -0.10);
    ctx.stroke();
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.055;
  },
  wolves(ctx) {
    ctx.fillStyle = '#4a4453';                  // head
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.10); ctx.lineTo(-0.20, -0.46); ctx.lineTo(-0.04, -0.18);
    ctx.lineTo(0.12, -0.46); ctx.lineTo(0.26, -0.08);
    ctx.quadraticCurveTo(0.30, 0.34, -0.04, 0.38);
    ctx.quadraticCurveTo(-0.38, 0.32, -0.34, -0.10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.gold;                 // eyes
    ctx.beginPath(); ctx.arc(-0.15, 0.02, 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0.09, 0.02, 0.055, 0, Math.PI * 2); ctx.fill();
  },
  barrow(ctx) {
    ctx.fillStyle = THEME.fieldEdge;            // grass mound
    ctx.beginPath();
    ctx.ellipse(0, 0.16, 0.54, 0.34, 0, Math.PI, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1c1822';                  // the dark doorway
    ctx.beginPath();
    ctx.moveTo(-0.14, 0.16); ctx.lineTo(-0.14, -0.06);
    ctx.quadraticCurveTo(0, -0.22, 0.14, -0.06);
    ctx.lineTo(0.14, 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  },
  healer(ctx) {
    district(ctx, '#6f8a5e', (c) => {
      c.strokeStyle = THEME.plaster;
      c.lineWidth = 0.09;
      c.beginPath();
      c.moveTo(0, 0.04); c.lineTo(0, 0.28);
      c.moveTo(-0.12, 0.16); c.lineTo(0.12, 0.16);
      c.stroke();
      c.strokeStyle = THEME.timber;
      c.lineWidth = 0.055;
    });
  },
  chest(ctx) {
    ctx.fillStyle = THEME.timber;
    ctx.beginPath(); ctx.rect(-0.36, -0.06, 0.72, 0.38); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.roofDark;
    ctx.beginPath();
    ctx.moveTo(-0.36, -0.06);
    ctx.quadraticCurveTo(0, -0.44, 0.36, -0.06);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.beginPath(); ctx.rect(-0.07, -0.10, 0.14, 0.18); ctx.fill();
  },

  // --- cloud -----------------------------------------------------------------
  skyhold(ctx) {
    turret(ctx, 0.40, 0.56, THEME.plaster);
    ctx.fillStyle = 'rgba(255,255,255,0.30)';   // the cloud it rests on
    ctx.beginPath();
    ctx.ellipse(-0.18, 0.36, 0.30, 0.15, 0, 0, Math.PI * 2);
    ctx.ellipse(0.20, 0.36, 0.26, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  vane(ctx) {
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.moveTo(0, 0.44); ctx.lineTo(0, -0.44); ctx.stroke();
    ctx.fillStyle = THEME.teal;
    ctx.beginPath();
    ctx.moveTo(0.02, -0.44); ctx.lineTo(0.46, -0.24); ctx.lineTo(0.02, -0.06);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.055;
  },
  raincatch(ctx) {
    ctx.fillStyle = THEME.shield;               // a basin of caught water
    ctx.beginPath();
    ctx.moveTo(-0.40, -0.06); ctx.lineTo(0.40, -0.06);
    ctx.lineTo(0.26, 0.34); ctx.lineTo(-0.26, 0.34);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 0.06;
    for (const x of [-0.20, 0.04, 0.24]) {
      ctx.beginPath(); ctx.moveTo(x, -0.50); ctx.lineTo(x - 0.05, -0.16); ctx.stroke();
    }
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.055;
  },

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
  // --- adventure: surface sites --------------------------------------------
  shrine(ctx) {
    ctx.fillStyle = 'rgba(95,191,174,0.16)';
    ctx.beginPath(); ctx.arc(0, 0, 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = THEME.city;                 // standing arch
    ctx.beginPath();
    ctx.moveTo(-0.30, 0.36); ctx.lineTo(-0.30, -0.10);
    ctx.quadraticCurveTo(0, -0.52, 0.30, -0.10);
    ctx.lineTo(0.30, 0.36);
    ctx.lineTo(0.14, 0.36); ctx.lineTo(0.14, -0.04);
    ctx.quadraticCurveTo(0, -0.30, -0.14, -0.04);
    ctx.lineTo(-0.14, 0.36);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.teal;
    ctx.beginPath(); ctx.arc(0, -0.02, 0.08, 0, Math.PI * 2); ctx.fill();
  },
  ruin(ctx) {
    ctx.fillStyle = THEME.cityShade;            // broken columns
    for (const [x, h] of [[-0.28, 0.46], [0.02, 0.28], [0.30, 0.38]]) {
      ctx.beginPath(); ctx.rect(x - 0.09, 0.36 - h, 0.18, h); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = THEME.city;                 // fallen lintel
    ctx.beginPath(); ctx.rect(-0.40, 0.30, 0.80, 0.10); ctx.fill(); ctx.stroke();
  },
  camp(ctx) {
    ctx.fillStyle = THEME.plaster;              // tent
    ctx.beginPath();
    ctx.moveTo(-0.36, 0.34); ctx.lineTo(-0.04, -0.34); ctx.lineTo(0.24, 0.34);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.timber;
    ctx.beginPath();
    ctx.moveTo(-0.14, 0.34); ctx.lineTo(-0.04, 0.02); ctx.lineTo(0.06, 0.34);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d08a3a';                  // fire
    ctx.beginPath();
    ctx.moveTo(0.36, 0.34); ctx.quadraticCurveTo(0.30, 0.06, 0.40, -0.06);
    ctx.quadraticCurveTo(0.48, 0.08, 0.44, 0.34);
    ctx.closePath(); ctx.fill();
  },
  merchant(ctx) {
    ctx.fillStyle = THEME.timber;               // wagon body
    ctx.beginPath(); ctx.rect(-0.38, -0.02, 0.72, 0.26); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.plaster;              // canvas hood
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.02);
    ctx.quadraticCurveTo(0, -0.48, 0.30, -0.02);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.roofDark;             // wheels
    for (const x of [-0.22, 0.18]) { ctx.beginPath(); ctx.arc(x, 0.28, 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  },

  // --- adventure: city districts -------------------------------------------
  smithy: (ctx) => district(ctx, '#6b4a3a', (c) => {
    c.fillStyle = THEME.cityShade;              // anvil
    c.beginPath(); c.rect(-0.16, 0.04, 0.32, 0.09); c.fill();
    c.beginPath(); c.rect(-0.06, 0.13, 0.12, 0.10); c.fill();
    c.beginPath(); c.rect(-0.14, 0.23, 0.28, 0.06); c.fill();
  }),
  tavern: (ctx) => district(ctx, '#7a5230', (c) => {
    c.fillStyle = THEME.gold;                   // tankard
    c.beginPath(); c.rect(-0.13, 0.02, 0.22, 0.24); c.fill();
    c.beginPath(); c.arc(0.13, 0.12, 0.08, -1.4, 1.4); c.lineWidth = 0.05;
    c.strokeStyle = THEME.gold; c.stroke();
  }),
  temple: (ctx) => district(ctx, '#4a5f7a', (c) => {
    c.fillStyle = THEME.teal;                   // arched window
    c.beginPath();
    c.moveTo(-0.09, 0.28); c.lineTo(-0.09, 0.08);
    c.quadraticCurveTo(0, -0.06, 0.09, 0.08); c.lineTo(0.09, 0.28);
    c.closePath(); c.fill();
  }),
  guild: (ctx) => district(ctx, '#5f4a72', (c) => {
    c.fillStyle = THEME.gold;                   // hanging banner
    c.beginPath();
    c.moveTo(-0.13, 0.02); c.lineTo(0.13, 0.02); c.lineTo(0.13, 0.24);
    c.lineTo(0, 0.16); c.lineTo(-0.13, 0.24);
    c.closePath(); c.fill();
  }),
  well(ctx) {
    ctx.fillStyle = THEME.cityShade;
    ctx.beginPath(); ctx.ellipse(0, 0.12, 0.26, 0.17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d2a30';
    ctx.beginPath(); ctx.ellipse(0, 0.10, 0.16, 0.10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.07;
    ctx.beginPath();                            // winch frame
    ctx.moveTo(-0.22, 0.10); ctx.lineTo(-0.16, -0.32);
    ctx.lineTo(0.16, -0.32); ctx.lineTo(0.22, 0.10);
    ctx.moveTo(-0.16, -0.32); ctx.lineTo(0.16, -0.32);
    ctx.stroke();
  },
  cache(ctx) {
    ctx.fillStyle = THEME.timber;               // crate
    ctx.beginPath(); ctx.rect(-0.26, -0.06, 0.52, 0.38); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = THEME.roofDark;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.26, -0.06); ctx.lineTo(0.26, 0.32);
    ctx.moveTo(0.26, -0.06); ctx.lineTo(-0.26, 0.32);
    ctx.stroke();
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

// --- world features ---------------------------------------------------------
// Forests, mountains and water all reuse the city silhouette machinery: the
// same "which sides does this reach" shape, filled and detailed differently.
// That means a forest corner and a city corner line up exactly across a seam,
// which is what stops the board looking like two games stapled together.

/**
 * Clip to a feature's silhouette but draw the scenery inside it UPRIGHT.
 *
 * `cityShape` returns the shape plus the quarter-turns needed to line it up,
 * and a city's masonry hatch doesn't care which way that is. Mountains and
 * water do: peaks have to point up and ripples have to lie flat, whichever
 * edges the feature happens to reach. So the rotation is applied to build the
 * clip and then undone before anything is drawn through it.
 */
function inShape(ctx, k, path, fn) {
  const a = (k & 3) * Math.PI / 2;
  ctx.save();
  ctx.translate(0.5, 0.5); ctx.rotate(a); ctx.translate(-0.5, -0.5);
  ctx.beginPath();
  path(ctx);
  ctx.clip();
  ctx.translate(0.5, 0.5); ctx.rotate(-a); ctx.translate(-0.5, -0.5);
  fn(ctx);
  ctx.restore();
}

/** Fill and outline a feature's silhouette. */
function shape(ctx, k, path, fill, line, width = 0.03) {
  withRot(ctx, k, () => {
    ctx.beginPath();
    path(ctx);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = width;
    ctx.strokeStyle = line;
    ctx.stroke();
  });
}

function drawForest(ctx, f, L) {
  const { k, path, rim } = cityShape(f.sides);
  shape(ctx, k, path, THEME.forest, THEME.forestDark);
  inShape(ctx, k, path, (c) => {
    // Canopy blobs on a fixed lattice, so a tile always draws the same. Each
    // one is a little dome: its own crown catches the sun on one side and its
    // own shadow falls on the canopy below.
    for (let i = 0; i < 26; i++) {
      const x = ((i * 37) % 100) / 100;
      const y = ((i * 61) % 100) / 100;
      const r = 0.06 + ((i * 17) % 5) * 0.012;
      c.beginPath();
      c.arc(x - L.x * r * 0.34, y - L.y * r * 0.34, r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(20,26,16,0.42)';
      c.fill();
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = i % 3 === 0 ? THEME.forestCanopy : THEME.forestDark;
      c.fill();
      c.beginPath();
      c.arc(x + L.x * r * 0.30, y + L.y * r * 0.30, r * 0.58, 0, Math.PI * 2);
      c.fillStyle = 'rgba(180,205,140,0.16)';
      c.fill();
    }
  });
  withRot(ctx, k, () => {
    // A treeline stands about as tall as a wall but reads softer, so the light
    // on it is gentler than the one on stone.
    relief(ctx, path, rim, spin(L, k), { height: 0.05 });
  });
}

/** A log stack — the forest's pennant, worth one extra point. */
function drawLog(ctx, [x, y], L = LIGHT) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.30, 0.30);
  ctx.lineWidth = 0.10;
  ctx.strokeStyle = '#3a2c1e';
  shadow(ctx, L, 0.09, 0.10);
  for (const [dx, dy] of [[-0.28, 0.18], [0.28, 0.18], [0, -0.22]]) {
    ctx.beginPath();
    ctx.ellipse(dx, dy, 0.30, 0.24, 0, 0, Math.PI * 2);
    ctx.fillStyle = THEME.timber;
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(dx, dy, 0.13, 0.10, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#8a6c4a';
    ctx.fill();
  }
  ctx.restore();
}

function drawMountain(ctx, f, L) {
  const { k, path, rim } = cityShape(f.sides);
  shape(ctx, k, path, THEME.rock, THEME.rockDark);
  inShape(ctx, k, path, (c) => {
    // Three peaks at different heights, so a range still reads when the
    // silhouette is only a sliver along one edge — a one-sided mountain tile
    // has no room at the bottom of the tile for anything to stand on.
    // Which flank catches the sun follows the light, not the drawing order —
    // a range laid across four rotations has to be lit as one range.
    const sunward = L.x < 0 ? -1 : 1;
    for (const [cx, base, w, h] of [[0.62, 1.05, 0.80, 0.85], [0.24, 0.98, 0.58, 0.58], [0.46, 0.44, 0.44, 0.36]]) {
      c.beginPath();                       // the flank in shadow
      c.moveTo(cx - w / 2, base);
      c.lineTo(cx, base - h);
      c.lineTo(cx + w / 2, base);
      c.closePath();
      c.fillStyle = THEME.rockDark;
      c.fill();
      c.beginPath();                       // the flank facing the sun
      c.moveTo(cx, base - h);
      c.lineTo(cx + (w / 2) * sunward, base);
      c.lineTo(cx, base);
      c.closePath();
      c.fillStyle = THEME.rock;
      c.fill();
      c.beginPath();                       // snow cap
      c.moveTo(cx - w * 0.15, base - h * 0.74);
      c.lineTo(cx, base - h);
      c.lineTo(cx + w * 0.15, base - h * 0.74);
      c.quadraticCurveTo(cx, base - h * 0.62, cx - w * 0.15, base - h * 0.74);
      c.closePath();
      c.fillStyle = THEME.rockSnow;
      c.fill();
    }
  });
  withRot(ctx, k, () => {
    // Rock is the tallest thing on the board and throws the longest shadow.
    relief(ctx, path, rim, spin(L, k), {
      height: 0.075, lit: THEME.litStrong, shade: THEME.shadeStrong,
    });
  });
}

function drawWater(ctx, f, deep, L) {
  const { k, path, rim } = cityShape(f.sides);
  shape(ctx, k, path, deep ? THEME.waterDeep : THEME.water, THEME.waterEdge);
  inShape(ctx, k, path, (c) => {
    c.strokeStyle = 'rgba(190,220,235,0.30)';
    c.lineWidth = 0.022;
    for (let y = 0.12; y < 1; y += 0.18) {
      c.beginPath();
      c.moveTo(-0.1, y);
      for (let x = -0.1; x < 1.2; x += 0.25) c.quadraticCurveTo(x + 0.06, y - 0.05, x + 0.125, y);
      c.stroke();
    }
  });
  withRot(ctx, k, () => {
    // Water is the one feature that sits BELOW the field, so it's lit inside
    // out: the near bank shadows the water at its foot, and the far bank is
    // the bright line you actually see across a lake at dusk.
    relief(ctx, path, rim, spin(L, k), {
      height: 0.05, sunken: true, lit: 'rgba(214,238,250,0.34)',
    });
  });
}

/**
 * The river is drawn as a band along its sides rather than as a shaped mass,
 * because a river reads as a line and a lake reads as an area.
 */
function drawRiver(ctx, f, L) {
  const course = (c) => {
    c.beginPath();
    if (f.sides.length === 1) {
      const [mx, my] = SIDE_MID[f.sides[0]];
      c.moveTo(mx, my);
      c.lineTo(0.5, 0.5);
    } else {
      for (let i = 0; i < f.sides.length; i++) {
        const [mx, my] = SIDE_MID[f.sides[i]];
        if (i === 0) c.moveTo(mx, my);
        else c.quadraticCurveTo(0.5, 0.5, mx, my);
      }
    }
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const w of [0.30, 0.22]) {
    course(ctx);
    ctx.strokeStyle = w > 0.25 ? THEME.waterEdge : THEME.water;
    ctx.lineWidth = w;
    ctx.stroke();
  }
  // A cut bank, same as a road but deeper and wetter.
  groove(ctx, course, L, 0.22, { lit: 'rgba(214,238,250,0.32)', thin: 0.30 });
  // A spring or a mouth is a pool where the line stops.
  if (f.sides.length === 1) {
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.22, 0, Math.PI * 2);
    ctx.fillStyle = THEME.waterDeep;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = THEME.waterEdge;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Landmarks that lie IN the ground rather than stand on it. A pool, a ford or
 * a shaft of daylight has nothing to cast a shadow with, and giving them one
 * turns a spring into a coin sitting on the grass.
 */
const FLAT_MARKS = new Set(['mouth', 'spring', 'ford', 'shaft', 'hill']);

/**
 * Draw a landmark centred at (x, y) in unit tile space.
 *
 * Landmarks are the one place where a per-shape lighting model would mean
 * rewriting forty little drawings, so the standing ones get the canvas's own
 * drop shadow instead: every fill and stroke inside `art` throws a shadow in
 * the same direction as everything else on the board, for three lines and no
 * edits to the drawings themselves.
 */
export function drawMark(ctx, kind, [x, y], s = 0.46, L = LIGHT) {
  const art = MARK_ART[kind];
  if (!art) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineWidth = 0.055;
  ctx.strokeStyle = THEME.timber;
  ctx.lineJoin = 'round';
  if (!FLAT_MARKS.has(kind)) {
    // Contact shadow — pooled at the foot, nudged away from the sun. Kept
    // faint and tucked close: the cast shadow does the real work, and two
    // shadows at full strength on one landmark just read as a smudge.
    ctx.fillStyle = 'rgba(13,11,17,0.20)';
    ctx.beginPath();
    ctx.ellipse(-L.x * 0.10, 0.42 - L.y * 0.05, 0.50, 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
    shadow(ctx, L, 0.07, 0.10, 'rgba(13,11,17,0.50)');
  }
  art(ctx);
  noShadow(ctx);
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
export function drawTile(ctx, type, { cave = false, terrain = cave ? 'cave' : 'surface', rot = 0 } = {}) {
  // The art is drawn unrotated and the caller turns the canvas, so the light
  // has to be turned the other way to stay put in the world. Everything below
  // shades against `L`; nothing bakes in a direction of its own.
  const L = spin(LIGHT, rot);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1, 1);
  ctx.clip();

  if (terrain === 'cave') {
    ctx.fillStyle = '#2b2533';                  // solid rock
    ctx.fillRect(0, 0, 1, 1);
  } else if (terrain === 'city') {
    ctx.fillStyle = '#463d4e';                  // building frontage
    ctx.fillRect(0, 0, 1, 1);
    ctx.strokeStyle = 'rgba(20,16,26,0.45)';    // rooflines
    ctx.lineWidth = 0.03;
    for (let i = 0.14; i < 1; i += 0.24) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1, i); ctx.stroke();
    }
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

  // Water goes down before roads so a bridge crosses over it, and forests and
  // mountains go down before cities so a wall reads as built against them.
  for (const f of type.feats) if (f.type === 'lake') drawWater(ctx, f, false, L);
  for (const f of type.feats) if (f.type === 'forest') drawForest(ctx, f, L);
  for (const f of type.feats) if (f.type === 'mountain') drawMountain(ctx, f, L);
  for (const f of type.feats) if (f.type === 'river') drawRiver(ctx, f, L);

  for (const f of type.feats) if (f.type === 'road') drawRoad(ctx, f, terrain, L);

  // Two or more dead-end road stubs meeting = a junction, not a through road.
  if (type.feats.filter((f) => f.type === 'road' && f.sides.length === 1).length >= 2) {
    const js = ROAD_STYLE[terrain] || ROAD_STYLE.surface;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, js.inner * 0.8 + 0.03, 0, Math.PI * 2);
    ctx.fillStyle = js.core;
    ctx.fill();
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = THEME.roadEdge;
    ctx.stroke();
  }

  type.feats.forEach((f, i) => {
    if (f.type !== 'city') return;
    drawCity(ctx, f, L);
    if (f.shield) {
      const [sx, sy] = type.spots[i];
      drawShield(ctx, [sx, sy - 0.16], L);
    }
  });
  type.feats.forEach((f, i) => {
    if (f.type === 'forest' && f.shield) drawLog(ctx, type.spots[i], L);
  });
  for (const f of type.feats) if (f.type === 'monastery') drawAbbey(ctx, L);

  type.marks.forEach((m, i) => drawMark(ctx, m.kind, type.markSpots[i], 0.46, L));

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

  // A follower is a standing piece, so it throws the longest shadow of
  // anything on the board — that shadow is most of what makes it look like it
  // is on the tile rather than printed into it.
  shadow(ctx, LIGHT, 0.12, 0.20, 'rgba(9,7,13,0.60)');
  meeplePath(ctx);
  ctx.fillStyle = color;
  ctx.fill();
  noShadow(ctx);
  ctx.lineWidth = 0.09;
  ctx.strokeStyle = opts.hero ? 'rgba(20,14,6,0.85)' : 'rgba(0,0,0,0.65)';
  ctx.stroke();

  // Rounding on the body: a warm edge where the sun hits, cool where it doesn't.
  ctx.save();
  meeplePath(ctx);
  ctx.clip();
  const sheen = ctx.createLinearGradient(LIGHT.x * 0.7, LIGHT.y * 0.7, -LIGHT.x * 0.7, -LIGHT.y * 0.7);
  sheen.addColorStop(0, 'rgba(255,244,222,0.30)');
  sheen.addColorStop(0.5, 'rgba(255,244,222,0)');
  sheen.addColorStop(1, 'rgba(18,12,26,0.34)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  // The hero is the one piece you always need to find at a glance: gold trim
  // and a plume, rather than a different colour that would clash with players.
  if (opts.hero) {
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = THEME.gold;
    meeplePath(ctx);
    ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.beginPath();
    ctx.moveTo(0, -0.52);
    ctx.quadraticCurveTo(0.20, -0.72, 0.30, -0.56);
    ctx.quadraticCurveTo(0.14, -0.50, 0.06, -0.44);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
