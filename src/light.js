// ---------------------------------------------------------------------------
// Relief lighting.
//
// One sun for the whole board, fixed in world space, low in the north-west.
// Every raised thing — a city wall, a treeline, a ridge — catches it on the
// faces that point at it and loses it on the faces that don't. That single
// consistent direction is what makes a flat top-down board read as carved
// rather than printed.
//
// The whole thing is a lighting model for SILHOUETTES, not for geometry. We
// never build a 3D anything; we shade the boundary of a 2D shape as if the
// shape were a plateau standing on the field. See `relief` for the trick.
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
 * This is the load-bearing detail of the whole feature. Tile art is drawn in a
 * canonical orientation and the *canvas* is rotated to place it, so a shadow
 * baked into the art would spin with the tile — four tiles of the same type
 * would be lit from four different directions and the illusion would collapse.
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
 * the CTM, but every one of our callers is drawing in unit tile space. This is
 * the conversion factor that lets them ask for a shadow in tile units.
 */
export function pixelScale(ctx) {
  const t = ctx.getTransform();
  return Math.sqrt(Math.abs(t.a * t.d - t.b * t.c)) || 1;
}

/** Cast a soft directional drop shadow on everything drawn until `noShadow`. */
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

/**
 * Light the rim of a silhouette as though it were raised off the field.
 *
 * The trick is that we never work out a single normal. We stroke the shape's
 * rim twice, both times clipped to the shape:
 *
 *   · the band nudged TOWARD the light only survives the clip where the
 *     boundary faces away from it — those are the walls in shadow;
 *   · the band nudged AWAY from the light only survives where the boundary
 *     faces it — those are the walls catching it.
 *
 * The clip does the trigonometry. Curved and diagonal boundaries get the right
 * answer for free, and the transition between lit and shadowed rim happens
 * exactly where the boundary turns away from the sun.
 *
 * Two properties matter as much as the look:
 *
 *   1. Nothing is positioned relative to the tile, only relative to the shape's
 *      own boundary. A city wall crossing a seam is lit identically on both
 *      tiles, so it reads as one wall rather than two.
 *   2. `rim` deliberately excludes the parts of the outline that lie ON a tile
 *      edge. Those aren't real boundaries — the feature continues into the
 *      neighbour — so lighting them would draw a wall straight down the middle
 *      of a city that isn't finished yet.
 *
 * `sunken` swaps the two bands, which is all it takes to turn a plateau into a
 * basin: in a hole it's the near wall that's dark and the far wall that's lit.
 */
export function relief(ctx, path, rim, L, opts = {}) {
  if (!rim) return;                       // shape is all tile edge — no rim at all
  const {
    height = 0.045,
    lit = THEME.lit,
    shade = THEME.shade,
    cast = THEME.cast,
    sunken = false,
  } = opts;
  const h = height;

  ctx.save();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';

  // The shadow the shape throws onto the ground beside it. Clipped to
  // everything OUTSIDE the shape, so it lands on the field and never on the
  // thing casting it. Three passes stand in for a blur.
  if (cast && !sunken) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 1, 1);
    path(ctx);
    ctx.clip('evenodd');
    ctx.strokeStyle = cast;
    ctx.translate(-L.x * h * 1.2, -L.y * h * 1.2);
    for (const [width, alpha] of [[5.0, 0.30], [2.8, 0.45], [1.4, 0.70]]) {
      ctx.globalAlpha = alpha;
      ctx.lineWidth = h * width;
      ctx.beginPath();
      rim(ctx);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.beginPath();
  path(ctx);
  ctx.clip();
  ctx.lineWidth = h * 2;

  // Offsets are symmetric so that each band is entirely inside the shape where
  // it belongs and entirely outside — clipped to nothing — where it doesn't.
  for (const [dir, color] of [[1, sunken ? lit : shade], [-1, sunken ? shade : lit]]) {
    ctx.save();
    ctx.translate(L.x * h * dir, L.y * h * dir);
    ctx.strokeStyle = color;
    ctx.beginPath();
    rim(ctx);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Shade a stroked band — a road or a river — as a shallow groove.
 *
 * Same idea as `relief`, but a band has no fillable silhouette to clip
 * against, so instead we re-stroke the band slightly narrower and offset: what
 * peeks out along one side is the wall of the groove. One pass per side.
 */
export function groove(ctx, path, L, width, opts = {}) {
  const { lit = THEME.lit, shade = THEME.shade, thin = 0.34 } = opts;
  const w = width * thin;
  const t = (width - w) / 2;          // far enough to sit on the edge, never past it
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = w;
  // In a groove the near wall faces away from the sun, so the band shifted
  // toward the light exposes shadow and the one shifted away exposes highlight
  // — the reverse of a plateau. Where the road happens to run along the light
  // the two bands drift inward and meet, which is what grazing light does.
  for (const [dir, color] of [[1, shade], [-1, lit]]) {
    ctx.save();
    ctx.translate(L.x * t * dir, L.y * t * dir);
    ctx.strokeStyle = color;
    ctx.beginPath();
    path(ctx);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
