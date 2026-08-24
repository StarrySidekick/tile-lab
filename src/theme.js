// ---------------------------------------------------------------------------
// Twilight Princess palette.
//
// The TP look is less about specific hues than about *restraint*: everything is
// desaturated and warm-shifted, greens go olive rather than emerald, stone is
// grey-brown rather than grey, and the whole frame sits under a dusk vignette
// with a faint amber wash. Saturation stays low so the gold UI accents and the
// twilight teal are the only things that ever read as "bright".
//
// This is the one file to edit if you want to re-vibe the whole game.
// ---------------------------------------------------------------------------

import { DESIGN, rgba } from './design.js';

export const THEME = {
  // --- world ---------------------------------------------------------------
  night: '#17141d',        // page + canvas backdrop, violet-black
  nightDeep: '#0d0b11',    // vignette target
  grid: 'rgba(212,175,95,0.05)',

  field: '#7e8b52',        // Hyrule Field olive
  fieldAlt: '#717d47',
  fieldEdge: '#5a6438',

  road: '#cbb68d',         // dusty cart track
  roadCore: '#dccaa4',
  roadEdge: '#463b29',

  city: '#a89877',         // weathered stone — the curtain wall itself
  cityShade: '#8e7f62',
  cityWall: '#4f4433',     // the wall's shaded foot
  wallLit: '#c6b593',      // the walkway on top, where the sun lands
  cityGround: '#8b7e63',   // packed earth inside the walls
  cityGrit: '#897c61',     // cobble mottling on it

  roof: '#a05c3c',         // terracotta
  roofDark: '#7d4229',
  roofLit: '#c17d54',      // the slope facing the sun
  roofShade: '#5f3220',    // and the one that doesn't
  plaster: '#ded2bb',
  timber: '#5b4530',

  shield: '#4a6f8a',
  shieldEdge: '#2b4356',

  // --- world features ------------------------------------------------------
  // Forests go darker and bluer than field so a wood reads as denser country;
  // rock is warm grey; water is the one genuinely cool thing on the board,
  // which is what makes a lake read at a glance under the dusk wash.
  forest: '#4e6a3f',
  forestDark: '#3c5432',
  forestCanopy: '#5c7a48',
  rock: '#7d7468',
  rockDark: '#5d564d',
  rockSnow: '#cfc7bb',
  water: '#3f6d86',
  waterDeep: '#2c5068',
  waterEdge: '#6d9db2',

  border: 'rgba(30,24,18,0.5)',

  // --- accents -------------------------------------------------------------
  gold: '#d4af5f',         // UI gold, Triforce-ish
  goldDim: '#9c8043',
  teal: '#5fbfae',         // twilight energy — used sparingly, it pops
  tealDeep: '#2f6f68',
  violet: '#6b5a8c',       // twilight realm

  // --- light ---------------------------------------------------------------
  // One sun, low in the north-west, for the whole board. Warm on the faces it
  // catches, cool violet in the faces it misses — the same split the palette
  // uses everywhere else. Kept weak on purpose: this should read as a painted
  // board catching the light, not as a lit 3D scene.
  lit: 'rgba(255,238,206,0.30)',
  shade: 'rgba(26,18,34,0.42)',
  cast: 'rgba(13,11,17,0.40)',

  // --- UI ------------------------------------------------------------------
  panel: '#1f1b25',
  panel2: '#282232',
  line: '#3d3547',
  text: '#e8ded0',         // parchment
  dim: '#9a9089',
};

/**
 * THE CHART PALETTE — Girando's, and measured rather than invented. The
 * reference scans in docs/refs sample to a gold-buff paper (#e8c888 family),
 * near-grey sea washes, vermillion accents and a warm near-black ink; the
 * values here are those samples, adjusted only far enough apart to stay
 * readable at 40px. See docs/refs/README.md for the numbers.
 *
 * A partial overlay: anything not named here keeps its twilight value.
 */
/**
 * Built fresh on every palette switch from the DESIGN book, so the console's
 * colour swatches are the real thing rather than a copy that drifts. Anything
 * the book doesn't name keeps a value of its own here.
 */
const chartPalette = () => ({
  field: DESIGN.chart.field,        // sage wash on buff — land on a coloured chart
  fieldAlt: DESIGN.chart.fieldAlt,
  fieldEdge: DESIGN.chart.fieldEdge,

  road: DESIGN.chart.road,          // bare paper showing between ink edges
  roadCore: DESIGN.chart.roadCore,
  roadEdge: DESIGN.chart.roadEdge,

  city: DESIGN.chart.city,          // warm stone, one step off the paper
  cityShade: '#b39a6e',
  cityWall: DESIGN.chart.cityWall,
  wallLit: DESIGN.chart.wallLit,
  cityGround: DESIGN.chart.cityGround,
  cityGrit: '#b9a175',

  roof: DESIGN.chart.roof,          // vermillion — the accent every reference leans on
  roofDark: '#8c3a20',
  roofLit: DESIGN.chart.roofLit,
  roofShade: DESIGN.chart.roofShade,
  plaster: DESIGN.chart.plaster,
  timber: DESIGN.chart.timber,

  shield: '#5b7f99',                // chart blue
  shieldEdge: '#33506a',

  forest: DESIGN.chart.forest,
  forestDark: '#616e42',
  forestCanopy: DESIGN.chart.forestCanopy,
  rock: '#a08c6e',
  rockDark: '#7c6b51',
  rockSnow: '#e8dcc2',
  water: DESIGN.chart.water,        // the portolan's near-grey sea
  waterDeep: DESIGN.chart.waterDeep,
  waterEdge: '#b6cbd1',

  border: rgba(DESIGN.ink.tone, 0.55),   // ink outline on every tile

  teal: '#2f6f68',
  tealDeep: '#1f4a45',

  // An engraving is not lit at all. The three shading channels — the sunward
  // wash, the shaded face, and every cast drop-shadow in art.js — go fully
  // transparent on the chart: a print has no sun, and any shading it wants in
  // future has to be DRAWN, as hatching or stipple, not calculated. The flat
  // two-tone pairs (roofLit/roofShade and friends) stay, because a flat pair
  // is exactly what a hand-coloured wash looks like.
  lit: 'rgba(0,0,0,0)',
  shade: 'rgba(0,0,0,0)',
  cast: 'rgba(0,0,0,0)',
});

/** What twilight had, for everything the chart touches — so the switch reverses. */
const TWILIGHT = {};
for (const k of Object.keys(chartPalette())) TWILIGHT[k] = THEME[k];

/**
 * Swap the live palette. THEME is imported by value-reference everywhere, so
 * this mutates it in place; the sprite cache keys on `THEME.paletteName` and
 * keeps both sets of pictures. The renderer calls this once per frame from
 * whatever mode is active — the last game drawn decides, which is fine,
 * because there is only ever one.
 */
THEME.paletteName = 'twilight';
export function usePalette(name, force = false) {
  if (THEME.paletteName === name && !force) return;
  Object.assign(THEME, name === 'chart' ? chartPalette() : TWILIGHT);
  THEME.paletteName = name;
}

// Muted, earthy player colors — no primaries.
export const PLAYER_COLORS = ['#b6483a', '#4a7fa8', '#6f9a52', '#d0a03f', '#7a6a94'];
export const PLAYER_NAMES = ['Ordon', 'Lanayru', 'Faron', 'Eldin', 'Twilight'];

/**
 * Dusk vignette + warm wash. Drawn over the finished board, which is what
 * actually sells the TP look — without it the palette alone reads flat.
 */
export function applyDusk(ctx, w, h) {
  // Kept deliberately light: strong enough to frame the board and warm the
  // midtones, weak enough that tiles at the edge stay readable.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.34, w / 2, h / 2, Math.max(w, h) * 0.82);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.65, 'rgba(13,11,17,0.13)');
  g.addColorStop(1, 'rgba(13,11,17,0.48)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'overlay';
  ctx.fillStyle = 'rgba(198,150,74,0.045)';
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'source-over';
}
