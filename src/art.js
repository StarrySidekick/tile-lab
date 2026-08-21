// ---------------------------------------------------------------------------
// Procedural tile art. Everything is drawn in a 1x1 unit square at rotation 0;
// the renderer rotates the canvas. No image assets, so a new tile type gets
// art for free the moment you add it to tiles.js.
//
// Colours all come from theme.js — edit that file to re-vibe the game.
// ---------------------------------------------------------------------------

import { SIDE_MID, SIDE_VEC } from './tiles.js';
import { THEME, PLAYER_COLORS, PLAYER_NAMES } from './theme.js';
import { LIGHT, spin, shadow, noShadow } from './light.js';
import { featureShape } from './shape.js';

export { PLAYER_COLORS, PLAYER_NAMES };

// --- cities: walled towns ---------------------------------------------------
//
// A city is not a raised slab of masonry, it's a walled town: a curtain wall
// running the edge of the region, packed ground and roofs inside, field
// outside. All of the height comes from things that are actually drawn — the
// wall has a shaded foot and a lit walkway, the roofs have a sunward slope and
// a shaded one — rather than from shading the boundary of a flat area.
//
// Everything here hangs off `featureShape`, so it lines up across seams by
// construction. The wall follows the RIM, which by definition excludes tile
// edges, so a city that continues into the next tile has no wall at the seam
// and a block of city reads as one town behind one wall.

/**
 * The curtain wall.
 *
 * Drawn INSIDE the town rather than centred on its boundary, and that detail is
 * the whole point. Stroking the rim at double width and clipping to the town
 * leaves a band of exactly `width` lying inside the edge.
 *
 * A wall centred on the boundary puts half its thickness out on the field. That
 * looks fine in the middle of a side, but the boundary runs into the tile
 * CORNERS — that's what makes areas meet across a seam — and there the outer
 * half falls into a neighbouring tile that has no city and will never draw it.
 * The tile clip then slices the wall off flat along the seam, which is exactly
 * the join the corner-to-corner rule was supposed to hide.
 *
 * Kept inside the town, the wall cannot leave the tile at all, because the town
 * cannot. Two tiles' walls run into the same corner from opposite sides and
 * meet as one.
 */
function drawWall(ctx, sh, L, width = 0.072) {
  if (!sh.hasRim) return;

  // What it throws onto the field, clipped to everything outside the town so
  // it lands on grass and never back on the wall.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, 1, 1);
  sh.path(ctx);
  ctx.clip('evenodd');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = THEME.cast;
  ctx.translate(-L.x * 0.04, -L.y * 0.04);
  for (const [mul, alpha] of [[2.2, 0.30], [1.3, 0.45]]) {
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width * mul;
    ctx.beginPath();
    sh.rim(ctx);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  sh.path(ctx);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const w2 = width * 2;                      // half of it is clipped away

  ctx.strokeStyle = THEME.city;              // the stone body
  ctx.lineWidth = w2;
  ctx.beginPath(); sh.rim(ctx); ctx.stroke();

  // The walkway on top. Nudged AWAY from the sun, so the clip keeps it only on
  // the stretches of wall that face the sun and drops it entirely on the ones
  // that don't — the direction of the light picks out which walls are lit
  // without anything having to know which way a given stretch runs.
  ctx.save();
  ctx.translate(-L.x * width * 0.55, -L.y * width * 0.55);
  ctx.strokeStyle = THEME.wallLit;
  ctx.lineWidth = w2 * 0.34;
  ctx.beginPath(); sh.rim(ctx); ctx.stroke();
  ctx.restore();

  // The outer face goes on LAST so it is always the outermost thing. Drawn
  // before the walkway, it survived only where the nudge happened to move the
  // walkway inward — so the wall grew a dark edge on some stretches and lost it
  // on others, which read as the wall changing shape at a tile corner.
  ctx.strokeStyle = THEME.cityWall;
  ctx.lineWidth = w2 * 0.26;
  ctx.beginPath(); sh.rim(ctx); ctx.stroke();
  ctx.restore();
}

/**
 * A bastion partway along the wall.
 *
 * Sited at the middle of each stretch of rim, which is always well inside the
 * tile — a tower on a seam would have to be agreed with the neighbour, and one
 * at a corner would come out as two opposite quarter-circles whenever only two
 * of the four tiles there had a wall.
 */
function drawBastion(ctx, [x, y], L, r = 0.052) {
  const disc = (rr, fill, dx = 0, dy = 0) => {
    ctx.beginPath();
    ctx.arc(x + dx, y + dy, rr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  };
  disc(r * 1.24, THEME.cityWall);
  disc(r, THEME.city);
  disc(r * 0.56, THEME.wallLit, L.x * r * 0.30, L.y * r * 0.30);
}

// Where houses sit inside a town. A loose grid rather than a scatter, because
// a town should read as blocks and streets; anything that falls outside the
// walls is clipped away, and the cut lands under the wall where it can't show.
const HOUSES = [
  [0.28, 0.26, 0.15, 0], [0.47, 0.22, 0.12, 1], [0.65, 0.28, 0.14, 0], [0.81, 0.22, 0.11, 1],
  [0.20, 0.44, 0.13, 1], [0.40, 0.42, 0.16, 0], [0.61, 0.46, 0.12, 1], [0.80, 0.42, 0.14, 0],
  [0.26, 0.64, 0.14, 0], [0.46, 0.62, 0.12, 1], [0.66, 0.66, 0.15, 0], [0.83, 0.62, 0.11, 1],
  [0.34, 0.82, 0.13, 1], [0.58, 0.80, 0.14, 0], [0.77, 0.83, 0.12, 1],
];

// --- shading helpers --------------------------------------------------------

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function mix(a, b, t) {
  const [ar, ag, ab] = hex(a), [br, bg, bb] = hex(b);
  return `rgb(${Math.round(ar + (br - ar) * t)},${Math.round(ag + (bg - ag) * t)},${Math.round(ab + (bb - ab) * t)})`;
}

/**
 * Pick a face colour from how squarely the face points at the sun.
 * `t` is the dot product of the face normal with the light, in -1..1.
 */
const facing = (base, lit, dark, t) => (t >= 0 ? mix(base, lit, t) : mix(base, dark, -t));

/**
 * One building, seen from just above.
 *
 * The roof is hipped — a short ridge with a slope falling away on all four
 * sides — because that is the shape that reads as three-dimensional from
 * directly overhead. Each of the four faces points a different way, so each
 * one takes its colour from how squarely it faces the sun, and the building
 * turns out to be lit correctly from any direction without a single hand-picked
 * highlight.
 */
function drawHouse(ctx, x, y, w, turn, L, roof) {
  const a = turn ? w * 0.44 : w * 0.62;      // half-width
  const b = turn ? w * 0.62 : w * 0.44;      // half-depth
  const [base, lit, dark] = roof;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = 'rgba(13,11,17,0.34)';     // shadow on the ground
  ctx.fillRect(-a - L.x * 0.035, -b - L.y * 0.035, a * 2, b * 2);

  ctx.fillStyle = THEME.plaster;             // walls, peeking out of the sun
  ctx.fillRect(-a - L.x * 0.018, -b - L.y * 0.018, a * 2, b * 2);

  // Ridge runs along whichever axis is longer, so the roof always slopes the
  // sensible way for the footprint.
  const rx = turn ? 0 : a * 0.42;
  const ry = turn ? b * 0.42 : 0;
  const faces = [
    [[-a, -b], [a, -b], [rx, -ry], [-rx, -ry], [0, -1]],   // north pitch
    [[a, b], [-a, b], [-rx, ry], [rx, ry], [0, 1]],        // south pitch
    [[-a, b], [-a, -b], [-rx, -ry], [-rx, ry], [-1, 0]],   // west
    [[a, -b], [a, b], [rx, ry], [rx, -ry], [1, 0]],        // east
  ];
  for (const f of faces) {
    const n = f[4];
    ctx.beginPath();
    ctx.moveTo(f[0][0], f[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(f[i][0], f[i][1]);
    ctx.closePath();
    ctx.fillStyle = facing(base, lit, dark, n[0] * L.x + n[1] * L.y);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(40,26,18,0.55)';   // eaves
  ctx.lineWidth = 0.012;
  ctx.strokeRect(-a, -b, a * 2, b * 2);
  ctx.strokeStyle = mix(base, lit, 0.55);    // the ridge catches the light
  ctx.lineWidth = 0.015;
  ctx.beginPath();
  ctx.moveTo(-rx, -ry);
  ctx.lineTo(rx, ry);
  ctx.stroke();
  ctx.restore();
}

/** A round tower with a conical cap — the one thing that reads as tall. */
function drawTurret(ctx, x, y, r, L, roof) {
  ctx.beginPath();                           // shadow
  ctx.arc(x - L.x * r * 0.85, y - L.y * r * 0.85, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13,11,17,0.42)';
  ctx.fill();

  for (const [rr, fill] of [[r * 1.16, THEME.cityWall], [r, THEME.city]]) {
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  const cap = r * 0.86;                      // the cone, lit on the sun side
  ctx.beginPath();
  ctx.arc(x, y, cap, 0, Math.PI * 2);
  ctx.fillStyle = roof[2];
  ctx.fill();
  const ang = Math.atan2(L.y, L.x);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, cap, ang - 1.75, ang + 1.75);
  ctx.closePath();
  ctx.fillStyle = roof[0];
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.arc(x, y, cap, ang - 0.75, ang + 0.75);
  ctx.closePath();
  ctx.fillStyle = roof[1];
  ctx.fill();
}

function drawCity(ctx, f, L) {
  const sh = featureShape(f.sides);
  if (!sh) return;

  ctx.save();
  ctx.beginPath();
  sh.path(ctx);
  ctx.clip();

  ctx.fillStyle = THEME.cityGround;
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = THEME.cityGrit;            // cobble mottling, fixed lattice
  for (let i = 0; i < 40; i++) {
    const cx = ((i * 37) % 100) / 100;
    const cy = ((i * 61) % 100) / 100;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 0.035, 0.022, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const roofs = [
    [THEME.roof, THEME.roofLit, THEME.roofShade],
    [THEME.roofDark, THEME.roof, THEME.roofShade],
    ['#8a6a4a', '#b59470', '#4e3a26'],       // a thatched one, for variety
  ];
  HOUSES.forEach(([hx, hy, hw, turn], i) => {
    drawHouse(ctx, hx, hy, hw, turn, L, roofs[(i + f.sides.length) % roofs.length]);
  });
  ctx.restore();

  drawWall(ctx, sh, L);
  for (const p of sh.towers) drawBastion(ctx, p, L);
}

// --- roads ------------------------------------------------------------------

function roadPath(ctx, f, short = false) {
  ctx.beginPath();
  if (f.sides.length === 1) {
    const [mx, my] = SIDE_MID[f.sides[0]];
    ctx.moveTo(mx, my);
    // A stub that stops short of the middle is a road that DOESN'T connect —
    // which is the entire question a windvane asks, and it has to be visible
    // at a glance or the tile is a shrug.
    const k = short ? 0.52 : 1;
    ctx.lineTo(mx + (0.5 - mx) * k, my + (0.5 - my) * k);
  } else if (f.sides.length === 2) {
    const [ax, ay] = SIDE_MID[f.sides[0]];
    const [bx, by] = SIDE_MID[f.sides[1]];
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(0.5, 0.5, bx, by);
  } else {
    // Three or four arms of ONE road, which is a junction you drive through
    // rather than a junction that ends anything. Spokes, and the centre dot
    // that the two-stub case draws is deliberately absent — nothing stops.
    for (const s of f.sides) {
      const [mx, my] = SIDE_MID[s];
      ctx.moveTo(mx, my);
      ctx.lineTo(0.5, 0.5);
    }
  }
}

const ROAD_STYLE = {
  surface: { outer: 0.14, inner: 0.095, edge: THEME.roadEdge, core: THEME.roadCore },
  cave:    { outer: 0.30, inner: 0.25,  edge: THEME.roadEdge, core: '#8d7f66' },
  city:    { outer: 0.42, inner: 0.36,  edge: '#3a3340',      core: '#9a9086' },
};

// A road is a road. It lies flat on the ground and gets no lighting of its own
// — the only thing on the board with height is something you could walk into.
function drawRoad(ctx, f, terrain, short = false) {
  const s = ROAD_STYLE[terrain] || ROAD_STYLE.surface;
  ctx.lineCap = 'round';
  roadPath(ctx, f, short);
  ctx.lineWidth = s.outer;
  ctx.strokeStyle = s.edge;
  ctx.stroke();
  roadPath(ctx, f, short);
  ctx.lineWidth = s.inner;
  ctx.strokeStyle = s.core;
  ctx.stroke();
}

/**
 * A temple: a monastery that pays by the arrival rather than by the closure.
 * The precinct ring is open on the side it faces — the way in — and the pennant
 * on the roof points the same way, so a temple reads as facing somewhere even
 * though nothing but the art cares which way that is.
 */
function drawTemple(ctx, f, L) {
  const cx = 0.5, cy = 0.52, r = 0.29;
  const face = (f.face ?? 0) & 3;
  const a = -Math.PI / 2 + face * Math.PI / 2;         // 0=N, clockwise

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx - L.x * 0.045, cy - L.y * 0.045, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13,11,17,0.34)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#6a7350';
  ctx.fill();

  // The precinct ring, left open to the quarter it faces.
  ctx.lineCap = 'round';
  ctx.strokeStyle = THEME.cityWall;
  ctx.lineWidth = 0.075;
  ctx.beginPath(); ctx.arc(cx, cy, r, a + 0.5, a - 0.5 + Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = THEME.wallLit;
  ctx.lineWidth = 0.035;
  ctx.beginPath(); ctx.arc(cx, cy - 0.018, r, a + 0.5, a - 0.5 + Math.PI * 2); ctx.stroke();

  // A squat shrine, and the pennant that gives the mode its weather.
  ctx.fillStyle = THEME.plaster;
  ctx.strokeStyle = THEME.timber;
  ctx.lineWidth = 0.022;
  ctx.beginPath(); ctx.rect(cx - 0.11, cy - 0.10, 0.22, 0.22); ctx.fill(); ctx.stroke();
  roofTri(ctx, cx, cy - 0.10, 0.30, 0.16, THEME.roof);

  ctx.save();
  ctx.translate(cx, cy - 0.20);
  ctx.rotate(a + Math.PI / 2);
  ctx.strokeStyle = THEME.timber;
  ctx.lineWidth = 0.03;
  ctx.beginPath(); ctx.moveTo(0, 0.06); ctx.lineTo(0, -0.20); ctx.stroke();
  ctx.fillStyle = THEME.teal;
  ctx.beginPath();
  ctx.moveTo(0.01, -0.20); ctx.lineTo(0.22, -0.10); ctx.lineTo(0.01, -0.01);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();

  ctx.restore();
}

/**
 * A sfera: half a sphere, cut flush with one edge of the tile, so two of them
 * meeting across a seam read as one whole ball. That's the entire visual rule —
 * a player has to be able to see the join from across the table, because the
 * join changes the game.
 */
function drawSfera(ctx, f, L) {
  const side = f.sides[0] ?? 0;
  const [vx, vy] = SIDE_VEC[side];
  const cx = 0.5 + vx * 0.5, cy = 0.5 + vy * 0.5;      // centre sits ON the edge
  const r = 0.30;

  ctx.save();
  // Clipped to the tile, so the half that belongs to the neighbour isn't drawn.
  ctx.beginPath(); ctx.rect(0, 0, 1, 1); ctx.clip();

  ctx.beginPath();
  ctx.arc(cx - L.x * 0.03, cy - L.y * 0.03, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13,11,17,0.30)';
  ctx.fill();

  const grad = ctx.createRadialGradient(
    cx - L.x * 0.11, cy - L.y * 0.11, r * 0.12, cx, cy, r);
  grad.addColorStop(0, '#cfe6df');
  grad.addColorStop(0.55, '#7fb3a8');
  grad.addColorStop(1, '#3c5f5c');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 0.028;
  ctx.strokeStyle = '#2a4746';
  ctx.stroke();

  // A meridian, so a half looks like half of something rather than a blob.
  ctx.beginPath();
  ctx.ellipse(cx, cy, r * 0.42, r, 0, 0, Math.PI * 2);
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = 'rgba(232,222,208,0.30)';
  ctx.stroke();

  ctx.restore();
}

// --- monastery --------------------------------------------------------------

/**
 * A monastery: a walled precinct with a garden, a chapel and a bell tower.
 *
 * It gets the same treatment as a city because it is the same kind of thing —
 * a built structure standing on the field, not a marking printed on it. The
 * precinct wall is lit like the curtain wall, the roofs have a sunward slope,
 * and everything throws a shadow the same way.
 */
function drawAbbey(ctx, L) {
  const cx = 0.5, cy = 0.52, r = 0.30;

  ctx.save();
  ctx.beginPath();                             // shadow the precinct throws
  ctx.arc(cx - L.x * 0.045, cy - L.y * 0.045, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(13,11,17,0.34)';
  ctx.fill();

  ctx.beginPath();                             // the garth inside the walls
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#6f7a46';
  ctx.fill();

  ctx.lineCap = 'round';                       // precinct wall: foot, then top
  ctx.strokeStyle = THEME.cityWall;
  ctx.lineWidth = 0.075;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = THEME.city;
  ctx.lineWidth = 0.055;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.translate(L.x * 0.016, L.y * 0.016);
  ctx.strokeStyle = THEME.wallLit;
  ctx.lineWidth = 0.022;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  ctx.beginPath();                             // cloister walk around the garth
  ctx.arc(cx, cy, r * 0.66, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(222,210,187,0.55)';
  ctx.lineWidth = 0.045;
  ctx.stroke();

  drawHouse(ctx, cx, cy + 0.04, 0.30, 0, L, [THEME.roof, THEME.roofLit, THEME.roofShade]);

  drawTurret(ctx, cx + 0.185, cy - 0.155, 0.088, L,
             [THEME.roof, THEME.roofLit, THEME.roofShade]);
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

/** A blunt tower body — keeps and forts are variations on it. */
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
  /**
   * The Palazzo: the seat of the kingdom, a domed hall with a standard over it.
   * Bigger and finer than anything else on the board, because it is the one
   * tile that was there before the game started and the one everybody can see
   * from wherever the wind has put them.
   */
  palazzo(ctx) {
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.05;
    ctx.fillStyle = THEME.plaster;
    ctx.beginPath(); ctx.rect(-0.46, -0.16, 0.92, 0.62); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(30,24,18,0.20)';             // an arcade along the front
    for (let x = -0.36; x < 0.34; x += 0.24) {
      ctx.beginPath();
      ctx.moveTo(x, 0.46);
      ctx.lineTo(x, 0.14);
      ctx.quadraticCurveTo(x + 0.07, 0.02, x + 0.14, 0.14);
      ctx.lineTo(x + 0.14, 0.46);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = THEME.roof;                        // the dome
    ctx.beginPath();
    ctx.moveTo(-0.34, -0.16);
    ctx.quadraticCurveTo(0, -0.72, 0.34, -0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.roofLit;
    ctx.beginPath();
    ctx.moveTo(-0.30, -0.18);
    ctx.quadraticCurveTo(-0.14, -0.60, 0.02, -0.56);
    ctx.quadraticCurveTo(-0.12, -0.44, -0.16, -0.18);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = THEME.timber;                    // the standard on top
    ctx.lineWidth = 0.04;
    ctx.beginPath(); ctx.moveTo(0, -0.58); ctx.lineTo(0, -0.92); ctx.stroke();
    ctx.fillStyle = THEME.gold;
    ctx.beginPath();
    ctx.moveTo(0.01, -0.92); ctx.lineTo(0.30, -0.83); ctx.lineTo(0.01, -0.72);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.055;
  },

  /**
   * A tower turbine: a mill tower built into a city wall, with a hub where the
   * sails go. The sails themselves are NOT drawn here — they turn, and this art
   * is baked into a static sprite. The renderer spins them on top; all the
   * sprite owes it is a tower and a hub in the right place.
   */
  turbine(ctx) {
    ctx.fillStyle = THEME.plaster;
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.22, 0.56); ctx.lineTo(-0.13, -0.28);
    ctx.lineTo(0.13, -0.28); ctx.lineTo(0.22, 0.56);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,24,18,0.28)';           // courses up the tower
    ctx.lineWidth = 0.035;
    for (const y of [0.34, 0.10, -0.14]) {
      ctx.beginPath(); ctx.moveTo(-0.20, y); ctx.lineTo(0.20, y); ctx.stroke();
    }
    roofTri(ctx, 0, -0.28, 0.44, 0.22, THEME.roof);
    ctx.fillStyle = THEME.timber;                      // the hub the sails sit on
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.arc(0, -0.34, 0.09, 0, Math.PI * 2); ctx.fill();
  },
  /**
   * A zephyr: three curls of moving air and the arrowhead they're headed for.
   * Drawn pointing north and turned by `drawMark`, so one drawing serves all
   * four facings and the tile can be rotated on top of that.
   */
  zephyr(ctx) {
    ctx.strokeStyle = 'rgba(228,240,248,0.85)';
    ctx.lineWidth = 0.09;
    ctx.lineCap = 'round';
    for (const [x, len] of [[-0.22, 0.30], [0, 0.46], [0.22, 0.30]]) {
      ctx.beginPath();
      ctx.moveTo(x, 0.44);
      ctx.quadraticCurveTo(x + 0.10, 0.44 - len * 0.6, x, 0.44 - len);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(228,240,248,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, -0.48); ctx.lineTo(0.22, -0.10); ctx.lineTo(-0.22, -0.10);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 0.055;
    ctx.lineCap = 'butt';
  },

  /**
   * An Abbazia: a walled house that everything stops at. Drawn big and squared
   * off, against the temple's open ring — one of them ends what it touches,
   * the other blows it about, and you have to tell them apart at a glance.
   */
  /**
   * An Abbazia. It caps every feature it touches on all four sides, so it is
   * drawn as a precinct wall running right out to all four EDGES of the tile —
   * there is deliberately no field showing anywhere around it. That silhouette
   * is the rule: nothing gets past this tile, and you can see that a road
   * running into one has run into a wall rather than into a building with a
   * garden.
   *
   * The mark is scaled to 0.46 by `drawMark`, so a unit here is a bit over two
   * tile-widths; 1.09 either side of centre is a hair past the tile edge, which
   * is what fills the corners once the tile clip has taken its bite.
   */
  abbazia(ctx) {
    const R = 1.09;                                   // just past the tile edge
    ctx.fillStyle = THEME.cityWall;                   // wall, corner to corner
    ctx.beginPath(); ctx.rect(-R, -R, R * 2, R * 2); ctx.fill();
    ctx.fillStyle = THEME.cityGround;                 // the precinct inside it
    ctx.beginPath(); ctx.rect(-R + 0.26, -R + 0.26, (R - 0.26) * 2, (R - 0.26) * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,18,0.55)';
    ctx.lineWidth = 0.05;
    ctx.beginPath(); ctx.rect(-R + 0.26, -R + 0.26, (R - 0.26) * 2, (R - 0.26) * 2); ctx.stroke();

    // The walkway on top of the wall, lit along every run so the tile reads as
    // walled from all four directions however it's turned.
    ctx.fillStyle = THEME.wallLit;
    ctx.beginPath();
    ctx.rect(-R, -R, R * 2, 0.09);
    ctx.rect(-R, R - 0.09, R * 2, 0.09);
    ctx.rect(-R, -R, 0.09, R * 2);
    ctx.rect(R - 0.09, -R, 0.09, R * 2);
    ctx.fill();
    for (let t = -R + 0.05; t < R; t += 0.30) {       // crenellations, all round
      ctx.fillStyle = THEME.city;
      ctx.beginPath();
      ctx.rect(t, -R, 0.15, 0.24);
      ctx.rect(t, R - 0.24, 0.15, 0.24);
      ctx.rect(-R, t, 0.24, 0.15);
      ctx.rect(R - 0.24, t, 0.24, 0.15);
      ctx.fill();
    }

    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.05;
    ctx.fillStyle = THEME.plaster;                    // the house itself
    ctx.beginPath(); ctx.rect(-0.36, -0.30, 0.72, 0.72); ctx.fill(); ctx.stroke();
    roofTri(ctx, 0, -0.30, 0.86, 0.34, THEME.roof);
    ctx.fillStyle = THEME.timber;                     // a door, and no windows
    ctx.beginPath(); ctx.rect(-0.11, 0.10, 0.22, 0.32); ctx.fill(); ctx.stroke();
    ctx.fillStyle = THEME.shield;
    ctx.beginPath(); ctx.arc(0, -0.10, 0.09, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = THEME.timber;
  },

  /**
   * A sky ship. Drawn flat and pale here because it is finished in the player's
   * colour by the renderer — this is the hull, the mast and the rigging, and
   * the sail is the bit that gets painted.
   */
  ship(ctx) {
    ctx.save();
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.06;
    ctx.fillStyle = THEME.timber;
    ctx.beginPath();                                  // hull
    ctx.moveTo(-0.62, 0.16);
    ctx.lineTo(0.62, 0.16);
    ctx.quadraticCurveTo(0.42, 0.66, 0, 0.66);
    ctx.quadraticCurveTo(-0.42, 0.66, -0.62, 0.16);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';       // a gunwale line
    ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(-0.50, 0.30); ctx.lineTo(0.50, 0.30); ctx.stroke();
    ctx.strokeStyle = THEME.timber;
    ctx.lineWidth = 0.06;
    ctx.beginPath(); ctx.moveTo(0, 0.16); ctx.lineTo(0, -0.74); ctx.stroke();  // mast
    ctx.restore();
  },

  /** A flying machine on its strip, pointing the way a follower can leave. */
  flier(ctx) {
    ctx.fillStyle = 'rgba(228,240,248,0.16)';         // the wind it launches into
    ctx.beginPath();
    ctx.moveTo(0, -0.72); ctx.lineTo(0.30, -0.30); ctx.lineTo(-0.30, -0.30);
    ctx.closePath(); ctx.fill();

    ctx.save();
    ctx.translate(0, 0.06);
    ctx.fillStyle = THEME.plaster;                    // wings
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.52, 0.17, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = THEME.timber;                   // ribs
    ctx.lineWidth = 0.035;
    for (const x of [-0.32, -0.14, 0.14, 0.32]) {
      ctx.beginPath(); ctx.moveTo(x, -0.13); ctx.lineTo(x, 0.13); ctx.stroke();
    }
    ctx.fillStyle = THEME.timber;                     // fuselage, nose forward
    ctx.beginPath();
    ctx.moveTo(0, -0.44); ctx.lineTo(0.11, 0.10); ctx.lineTo(-0.11, 0.10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(30,24,18,0.6)';
    ctx.stroke();
    ctx.restore();
    ctx.lineWidth = 0.055;
    ctx.strokeStyle = THEME.timber;
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
 * Woodland. Trees, not a green slab with a lit edge — the height comes from
 * each crown having its own shadow and its own sunlit side.
 */
function drawForest(ctx, f, L) {
  const sh = featureShape(f.sides);
  if (!sh) return;
  ctx.save();
  ctx.beginPath();
  sh.path(ctx);
  ctx.clip();

  ctx.fillStyle = THEME.forestDark;          // shaded floor between the trunks
  ctx.fillRect(0, 0, 1, 1);

  // Crowns on a fixed lattice, so a tile always draws the same. Dense enough
  // that the floor only shows as gaps, which is what a wood looks like from
  // above.
  for (let i = 0; i < 34; i++) {
    const x = ((i * 37) % 100) / 100;
    const y = ((i * 61) % 100) / 100;
    const r = 0.085 + ((i * 17) % 5) * 0.014;
    ctx.beginPath();
    ctx.arc(x - L.x * r * 0.42, y - L.y * r * 0.42, r * 0.94, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,24,14,0.50)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = i % 3 === 0 ? THEME.forestCanopy : THEME.forest;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + L.x * r * 0.34, y + L.y * r * 0.34, r * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190,214,148,0.20)';
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Rock. Each mass is a ridge with a sunward face and a shaded one meeting at a
 * skyline, which is the only way a mountain reads from directly above.
 */
function drawMountain(ctx, f, L) {
  const sh = featureShape(f.sides);
  if (!sh) return;
  ctx.save();
  ctx.beginPath();
  sh.path(ctx);
  ctx.clip();

  ctx.fillStyle = THEME.rockDark;            // scree
  ctx.fillRect(0, 0, 1, 1);
  ctx.fillStyle = 'rgba(120,110,98,0.35)';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 53) % 100) / 100;
    const y = ((i * 29) % 100) / 100;
    ctx.beginPath();
    ctx.ellipse(x, y, 0.04, 0.026, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const sunward = L.x < 0 ? -1 : 1;
  for (const [cx, base, w, h] of [[0.66, 1.08, 0.88, 0.92], [0.26, 1.00, 0.62, 0.62], [0.48, 0.46, 0.48, 0.40]]) {
    ctx.beginPath();                         // the shadow the mass throws
    ctx.moveTo(cx - w / 2 - L.x * 0.06, base - L.y * 0.06);
    ctx.lineTo(cx - L.x * 0.06, base - h - L.y * 0.06);
    ctx.lineTo(cx + w / 2 - L.x * 0.06, base - L.y * 0.06);
    ctx.closePath();
    ctx.fillStyle = 'rgba(12,10,16,0.42)';
    ctx.fill();

    ctx.beginPath();                         // the face out of the sun
    ctx.moveTo(cx - w / 2, base);
    ctx.lineTo(cx, base - h);
    ctx.lineTo(cx + w / 2, base);
    ctx.closePath();
    ctx.fillStyle = THEME.rockDark;
    ctx.fill();

    ctx.beginPath();                         // the face in it
    ctx.moveTo(cx, base - h);
    ctx.lineTo(cx + (w / 2) * sunward, base);
    ctx.lineTo(cx, base);
    ctx.closePath();
    ctx.fillStyle = THEME.rock;
    ctx.fill();

    ctx.beginPath();                         // snow, caught on the skyline
    ctx.moveTo(cx - w * 0.15, base - h * 0.74);
    ctx.lineTo(cx, base - h);
    ctx.lineTo(cx + w * 0.15, base - h * 0.74);
    ctx.quadraticCurveTo(cx, base - h * 0.60, cx - w * 0.15, base - h * 0.74);
    ctx.closePath();
    ctx.fillStyle = THEME.rockSnow;
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Standing water. Flat, because it is — the only relief is a pale shelf where
 * it meets the bank, which is the shallows rather than a shaded wall.
 */
function drawWater(ctx, f, deep) {
  const sh = featureShape(f.sides);
  if (!sh) return;
  ctx.save();
  ctx.beginPath();
  sh.path(ctx);
  ctx.clip();

  ctx.fillStyle = deep ? THEME.waterDeep : THEME.water;
  ctx.fillRect(0, 0, 1, 1);

  if (sh.hasRim) {                           // sand, then shallows, then shore
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [w, c] of [[0.115, '#a3a071'], [0.075, 'rgba(150,196,214,0.55)'],
                          [0.028, THEME.waterEdge]]) {
      ctx.strokeStyle = c;
      ctx.lineWidth = w;
      ctx.beginPath(); sh.rim(ctx); ctx.stroke();
    }
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(200,228,240,0.26)';
  ctx.lineWidth = 0.020;
  for (let y = 0.14; y < 1; y += 0.19) {
    ctx.beginPath();
    ctx.moveTo(-0.1, y);
    for (let x = -0.1; x < 1.2; x += 0.25) ctx.quadraticCurveTo(x + 0.06, y - 0.05, x + 0.125, y);
    ctx.stroke();
  }
  ctx.restore();
}

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

/**
 * The river is drawn as a band along its sides rather than as a shaped mass,
 * because a river reads as a line and a lake reads as an area.
 */
function drawRiver(ctx, f) {
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
const FLAT_MARKS = new Set(['mouth', 'spring', 'ford', 'shaft', 'hill', 'zephyr', 'ship']);

/**
 * Draw a landmark centred at (x, y) in unit tile space.
 *
 * Landmarks are the one place where a per-shape lighting model would mean
 * rewriting forty little drawings, so the standing ones get the canvas's own
 * drop shadow instead: every fill and stroke inside `art` throws a shadow in
 * the same direction as everything else on the board, for three lines and no
 * edits to the drawings themselves.
 */
export function drawMark(ctx, kind, [x, y], s = 0.46, L = LIGHT, dir = null) {
  const art = MARK_ART[kind];
  if (!art) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // A mark that carries a direction is drawn pointing north and turned here,
  // so its art never has to know which way its tile ended up facing.
  if (dir) ctx.rotate((dir & 3) * Math.PI / 2);
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
  // A tile may insist on its own ground. Exactly one does: the ship's mooring
  // is a piece of open sky rather than a piece of country, which is what makes
  // it obvious that it fits anywhere and joins nothing — the tile looks like
  // the gap between tiles, because that is what it is.
  if (type.ground) terrain = type.ground;
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
  } else if (terrain === 'sky') {
    // Girando is a kingdom in the air. Nothing mechanical hangs on this — the
    // rules don't care what colour the ground is — but "field" was doing real
    // damage to the fiction, because a tile blown off the edge of a green
    // meadow is a nonsense and a tile blown off the edge of the sky is the
    // whole mode. Banded rather than flat so a big board reads as depth, and
    // deliberately low-contrast so the roads and walls still carry.
    const air = ctx.createLinearGradient(0, 0, 0, 1);
    air.addColorStop(0, '#5d7492');
    air.addColorStop(0.55, '#6b83a1');
    air.addColorStop(1, '#7e93ac');
    ctx.fillStyle = air;
    ctx.fillRect(0, 0, 1, 1);
    // Thin cloud, drawn as crossed strokes for the same reason the field hatch
    // is: it has to survive a quarter turn without showing a seam.
    ctx.strokeStyle = 'rgba(228,240,248,0.10)';
    ctx.lineWidth = 0.05;
    for (let i = -1.2; i < 2.4; i += 0.42) {
      ctx.beginPath();
      ctx.moveTo(i, -0.2);
      ctx.lineTo(i + 1.4, 1.2);
      ctx.moveTo(i + 1.4, -0.2);
      ctx.lineTo(i, 1.2);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = THEME.field;
    ctx.fillRect(0, 0, 1, 1);
    // Crossed hatch, not a single diagonal: the tile art is rotated to place
    // it, and crossed strokes look identical after a quarter turn while one
    // diagonal flips. That's the difference between fields that run together
    // and fields with a seam down every edge.
    ctx.strokeStyle = 'rgba(92,102,58,0.20)';
    ctx.lineWidth = 0.016;
    for (let i = -1.2; i < 2.4; i += 0.25) {
      ctx.beginPath();
      ctx.moveTo(i, -0.2);
      ctx.lineTo(i + 1.4, 1.2);
      ctx.moveTo(i + 1.4, -0.2);
      ctx.lineTo(i, 1.2);
      ctx.stroke();
    }
  }

  // Water goes down before roads so a bridge crosses over it, and forests and
  // mountains go down before cities so a wall reads as built against them.
  type.feats.forEach((f) => { if (f.type === 'lake') drawWater(ctx, f, false); });
  type.feats.forEach((f) => { if (f.type === 'forest') drawForest(ctx, f, L); });
  type.feats.forEach((f) => { if (f.type === 'mountain') drawMountain(ctx, f, L); });
  type.feats.forEach((f) => { if (f.type === 'river') drawRiver(ctx, f); });

  // A swinging tile's stubs stop short of the middle: they are the ways in
  // that this tile is currently refusing.
  type.feats.forEach((f) => {
    if (f.type === 'road') drawRoad(ctx, f, terrain, !!type.swing && f.sides.length === 1);
  });

  // Two or more dead-end road stubs meeting = a junction, not a through road.
  // Not on a vane: nothing meets there, that's the point of it.
  if (!type.swing && type.feats.filter((f) => f.type === 'road' && f.sides.length === 1).length >= 2) {
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
  for (const f of type.feats) if (f.type === 'sfera') drawSfera(ctx, f, L);
  for (const f of type.feats) if (f.type === 'monastery') drawAbbey(ctx, L);
  for (const f of type.feats) if (f.type === 'temple') drawTemple(ctx, f, L);

  // A swinging tile made of CITY can't show a gap the way a road vane can —
  // city art merges into one silhouette — so the sides it ISN'T joined to get a
  // shut gate across the throat. Same message, drawn the way a city can carry
  // it. Nothing in the pool uses this today; it costs four lines and it is what
  // a city vane would need the moment one comes back.
  if (type.swing) {
    for (const f of type.feats) {
      if (f.type !== 'city' || f.sides.length !== 1) continue;
      const [vx, vy] = SIDE_VEC[f.sides[0]];
      ctx.save();
      ctx.translate(0.5 + vx * 0.26, 0.5 + vy * 0.26);
      ctx.rotate(Math.atan2(vy, vx));
      ctx.fillStyle = THEME.cityWall;
      ctx.beginPath(); ctx.rect(-0.035, -0.20, 0.07, 0.40); ctx.fill();
      ctx.fillStyle = THEME.wallLit;
      ctx.beginPath(); ctx.rect(-0.035, -0.20, 0.07, 0.06); ctx.fill();
      ctx.restore();
    }
  }

  // The pivot a vane turns on, so a tile that will re-point itself in the next
  // gust says so while it's still in your hand. Straight roads swing too but
  // get no pivot: there'd be one on a third of the deck, and the road visibly
  // lying a different way afterwards is cue enough.
  if (type.swing) {
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.085, 0, Math.PI * 2);
    ctx.fillStyle = THEME.teal;
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = 'rgba(20,16,26,0.55)';
    ctx.stroke();
  }

  type.marks.forEach((m, i) => {
    // A zephyr that blows more than one way is drawn as one gust per quarter,
    // pushed out toward its own edge and shrunk so four of them fit without
    // running into each other. One drawing, four facings, same as always.
    if (m.dirs && m.dirs.length > 1) {
      for (const d of m.dirs) {
        const [vx, vy] = SIDE_VEC[d];
        drawMark(ctx, m.kind, [0.5 + vx * 0.24, 0.5 + vy * 0.24], 0.32, L, d);
      }
      return;
    }
    drawMark(ctx, m.kind, type.markSpots[i], 0.46, L, m.dir);
  });

  ctx.lineWidth = 0.02;
  // Deliberately no tile outline. Now that features merge across seams, a box
  // drawn round every tile would put the grid straight back over the middle of
  // a city. The backdrop grid still shows through wherever the board is empty,
  // which is where you actually need it when placing.
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

  // Adrift: standing on a tile with nothing claimable on it, holding nothing
  // and counting for nobody until the country underneath changes. Drawn inside
  // a broken ring, because "why is that follower not scoring" is a question the
  // board should answer rather than the rules.
  if (opts.adrift) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([0.20, 0.16]);
    ctx.lineWidth = 0.11;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 0.78, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

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

  // A farmer is the same piece laid on its side, which is exactly how the
  // printed game distinguishes him — and the distinction carries the rule: a
  // follower lying down is one that will not be coming back this game.
  if (opts.farmer) {
    ctx.rotate(-Math.PI / 2);
    ctx.translate(0, -0.08);
  }

  // A follower is a standing piece, so it throws the longest shadow of
  // anything on the board — that shadow is most of what makes it look like it
  // is on the tile rather than printed into it.
  shadow(ctx, LIGHT, opts.farmer ? 0.06 : 0.12, opts.farmer ? 0.10 : 0.20, 'rgba(9,7,13,0.60)');
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
