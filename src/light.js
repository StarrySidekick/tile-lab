// ---------------------------------------------------------------------------
// Where the light comes from.
//
// One sun for the whole board, fixed in world space, low in the north-west.
// Everything that stands up — a curtain wall, a roof, a tower, a tree, a
// follower — is drawn as an object with a face toward it and a face away, and
// throws its shadow the same way.
//
// This file used to hold a lighting model that shaded the *boundary* of flat
// regions to fake height, which was a mistake: a city isn't a raised slab of
// ground, it's walls and roofs, and a road is just a road. Height now comes
// from drawing the thing itself (see art.js), so all that's left here is the
// direction and the two helpers that need it.
// ---------------------------------------------------------------------------

import { THEME } from './theme.js';

/**
 * Unit vector pointing TOWARD the light, in tile space (y grows downward, so
 * negative y is north). North-west, about 33° off vertical.
 */
export const LIGHT = { x: -0.55, y: -0.835 };

/**
 * Re-express a light vector inside a frame that has been turned `k` quarter
 * turns clockwise.
 *
 * This is the load-bearing detail. Tile art is drawn in a canonical
 * orientation and the *canvas* is rotated to place it, so a shadow baked into
 * the art would spin with the tile — four rotations of one tile type would be
 * lit from four different directions and the illusion would collapse.
 * Counter-rotating the light by the same amount cancels that out, and the sun
 * stays put no matter how the tile is turned.
 */
export function spin(L, k) {
  let { x, y } = L;
  for (let i = (k & 3); i > 0; i--) [x, y] = [y, -x];   // R(-90°), y-down
  return { x, y };
}

/**
 * Units-to-device-pixels scale of the current transform.
 *
 * Canvas shadow offsets and blurs are specified in device pixels and ignore
 * the CTM, but every caller here is drawing in unit tile space. This is the
 * conversion that lets them ask for a shadow in tile units.
 */
export function pixelScale(ctx) {
  const t = ctx.getTransform();
  return Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
}

/**
 * Cast a soft directional drop shadow on everything drawn until `noShadow`.
 *
 * Used for the small standing things — landmarks, followers, shields — where a
 * per-shape lighting model would mean rewriting forty little drawings. Every
 * fill and stroke inside gets a shadow in the same direction as the rest of
 * the board, for three lines and no edits to the drawings themselves.
 */
export function shadow(ctx, L, dist = 0.05, blur = 0.05, color = THEME.cast) {
  const s = pixelScale(ctx);
  ctx.shadowColor = color;
  ctx.shadowOffsetX = -L.x * dist * s;
  ctx.shadowOffsetY = -L.y * dist * s;
  ctx.shadowBlur = blur * s;
}

export function noShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowOffsetX = ctx.shadowOffsetY = ctx.shadowBlur = 0;
}
