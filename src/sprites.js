// ---------------------------------------------------------------------------
// Tile sprite cache.
//
// Tile art is procedural, which is lovely for authoring and wasteful at
// runtime: the old renderer re-ran every path in art.js for every tile on
// screen, every frame. Relief lighting adds clips, gradients and blurred
// shadows on top of that, which is far too much to pay sixty times a second.
//
// It doesn't have to be paid at all. A tile's art depends on exactly three
// things — its type, its rotation and its terrain — so there is only a finite
// set of pictures the game can ever draw. Render each one once into an
// offscreen canvas, then blit. The lighting becomes free, and the renderer
// gets faster than it was before the lighting existed.
//
// Rotation is baked into the sprite rather than applied by the caller. It has
// to be: the whole point of the light model is that the sun does NOT turn with
// the tile, so the four rotations of a type are four genuinely different
// pictures. See light.js.
//
// Nothing else varies. Feature outlines run corner to corner on every side
// they reach (see shape.js), so a tile's art doesn't depend on its neighbours
// and never has to be redrawn when one arrives.
// ---------------------------------------------------------------------------

import { drawTile } from './art.js';
import { THEME } from './theme.js';
import { roughen } from './ink.js';

// Sprites are rendered at whichever bucket is the first one big enough, so
// zooming re-uses a sprite until it would visibly soften, then steps up.
// 768 and 1024 exist for the chart: max zoom is 320 CSS px, and at a device
// pixel ratio of 2 or 3 that outruns 512 — past the last bucket the renderer
// draws clean vectors, and the hand-drawn line silently vanished exactly at
// the zoom where you were looking closest.
const BUCKETS = [64, 96, 128, 192, 256, 384, 512, 768, 1024];
const MAX = BUCKETS[BUCKETS.length - 1];

// Roughly 48MB of backing store. A full board at one zoom is a few hundred
// entries; the budget only ever bites if you sit there zooming in and out.
const BUDGET = 48 * 1024 * 1024;

const cache = new Map();          // insertion order doubles as the LRU queue
let bytes = 0;

function surface(px) {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(px, px);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  return c;
}

/**
 * A cached picture of one tile, or null if the tile is being drawn so large
 * that a sprite would be softer than just running the paths.
 *
 * `px` is the size the caller intends to draw it at, in device pixels.
 */
export function tileSprite(type, rot, terrain, px) {
  const size = BUCKETS.find((b) => b >= px);
  if (!size) return null;                       // past 512px, draw vectors
  const key = `${type.id}|${rot & 3}|${terrain}|${size}|${THEME.paletteName}`;

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);                          // touch: move to the fresh end
    cache.set(key, hit);
    return hit;
  }

  const canvas = surface(size);
  const ctx = canvas.getContext('2d');
  ctx.scale(size, size);
  ctx.translate(0.5, 0.5);
  ctx.rotate((rot & 3) * Math.PI / 2);
  ctx.translate(-0.5, -0.5);
  if (THEME.paletteName === 'chart') {
    // The hand-drawn line, in two passes (see ink.js for the philosophy):
    //   1. the GROUND — country, roads, spheres, wind-heads — drawn and gently
    //      bent, because a meadow's edge and a cloud's curl should wander;
    //   2. the ARCHITECTURE drawn straight over it, because a wobbled building
    //      reads as melting rather than drawn;
    //   3. a whisper of short-wavelength TOOTH over everything, which is the
    //      other half of what a nib does — straight lines stay straight but
    //      their edges take the grain of the paper.
    drawTile(ctx, type, { terrain, rot, only: 'ground' });
    roughen(canvas, { amp: Math.max(0.7, size * 0.009), grain: 0.12 });
    drawTile(ctx, type, { terrain, rot, only: 'built' });
    roughen(canvas, { amp: Math.max(0.5, size * 0.0032), grain: 0.024 });
  } else {
    drawTile(ctx, type, { terrain, rot });
  }

  cache.set(key, canvas);
  bytes += size * size * 4;
  while (bytes > BUDGET && cache.size > 1) {
    const [oldest] = cache.keys();
    const c = cache.get(oldest);
    bytes -= c.width * c.height * 4;
    cache.delete(oldest);
  }
  return canvas;
}

/** Largest sprite size available, so callers know when they'll get null. */
export const SPRITE_MAX = MAX;

/** Drop everything. Only needed if the theme or the art ever changes at runtime. */
export function clearSprites() {
  cache.clear();
  bytes = 0;
}
