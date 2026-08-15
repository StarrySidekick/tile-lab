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
