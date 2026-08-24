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
import { roughen, WOBBLE, TOOTH } from './ink.js';

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

// Entries are { c: canvas, b: bytes, f: the frame they were last drawn in }.
// Insertion order doubles as the LRU queue.
const cache = new Map();
let bytes = 0;
let frameNo = 0;

// A ceiling on how big a sprite may be rendered, regardless of how big it is
// about to be drawn. Normally there isn't one — but a 1024px chart tile costs
// ~20ms and a good deal of scratch memory to roughen, and the design console
// throws the whole cache away on every twitch of a slider. While the dials are
// moving we render small and blurry, which is free, and go back to full
// resolution the moment you stop. Entries are keyed by size, so the two
// resolutions coexist in the cache rather than evicting each other.
let cap = Infinity;

export function setSpriteCap(px) { cap = px || Infinity; }

// Building a sprite is not cheap at the big buckets: a 768px chart tile costs
// tens of milliseconds, most of it spent reading the canvas back out for the
// two roughen passes. Zooming past a bucket boundary asks for every visible
// tile at a new size AT ONCE, and paying for all of them in one frame is a
// freeze you can see — a fifth of a second at a middling zoom, over a second
// up close.
//
// So there is a budget per frame. Once it is spent, a tile is served from
// whatever smaller size is already cached — soft for a frame or two, then it
// sharpens, the way a map fills in — or built at the cheapest bucket so there
// is always a picture. One full build is always allowed, so the work spreads
// out instead of stalling. Steady play never comes near this: with a warm
// cache nothing is built at all.
const FRAME_BUDGET_MS = 8;
const NEW_FRAME_MS = 30;      // this long since the last build means a new one

let spent = 0;
let made = 0;
let builds = 0;
let lastBuild = -Infinity;

/** Reset the build budget and start a new frame. Called once a frame. */
export function spriteFrame() { spent = 0; made = 0; frameNo++; }

/** What the cache is doing. Not used by the game — this is for profiling. */
export function spriteStats() {
  return { entries: cache.size, mb: +(bytes / 1048576).toFixed(1), builds };
}

/** The best already-cached picture of this tile smaller than `size`, if any. */
function softer(type, rot, terrain, size) {
  for (let i = BUCKETS.indexOf(size) - 1; i >= 0; i--) {
    const key = `${type.id}|${rot & 3}|${terrain}|${BUCKETS[i]}|${THEME.paletteName}`;
    const hit = cache.get(key);
    if (hit) { cache.delete(key); cache.set(key, hit); hit.f = frameNo; return hit.c; }
  }
  return null;
}

/**
 * Trim to budget — but never throw away a picture that is on screen RIGHT NOW.
 *
 * Without that rule the cache livelocks: zoom in far enough that the visible
 * board wants more than the budget and every frame evicts sprites it is about
 * to need again, so the board is rebuilt from scratch sixty times a second and
 * the whole thing crawls. Better to sit a little over budget for as long as
 * that many tiles are actually being looked at.
 */
function trim() {
  for (const [key, e] of cache) {
    if (bytes <= BUDGET || cache.size <= 1) break;
    if (e.f === frameNo) continue;
    bytes -= e.b;
    cache.delete(key);
  }
}

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
  const size = BUCKETS.find((b) => b >= Math.min(px, cap));
  if (!size) return null;                       // past 512px, draw vectors
  const key = `${type.id}|${rot & 3}|${terrain}|${size}|${THEME.paletteName}`;

  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);                          // touch: move to the fresh end
    cache.set(key, hit);
    hit.f = frameNo;
    return hit.c;
  }

  const now = performance.now();
  if (now - lastBuild > NEW_FRAME_MS) { spent = 0; made = 0; }
  let build = size;
  if (made && spent >= FRAME_BUDGET_MS) {
    const ready = softer(type, rot, terrain, size);
    if (ready) return ready;
    build = BUCKETS[0] < size ? BUCKETS[0] : size;
  }

  const canvas = surface(build);
  const ctx = canvas.getContext('2d');
  ctx.scale(build, build);
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
    roughen(canvas, WOBBLE(build));
    drawTile(ctx, type, { terrain, rot, only: 'built' });
    roughen(canvas, TOOTH(build));
  } else {
    drawTile(ctx, type, { terrain, rot });
  }

  const b = build * build * 4;
  cache.set(build === size
    ? key
    : `${type.id}|${rot & 3}|${terrain}|${build}|${THEME.paletteName}`,
    { c: canvas, b, f: frameNo });
  builds++;
  made++;
  lastBuild = performance.now();
  spent += lastBuild - now;
  bytes += b;
  trim();
  return canvas;
}

/** Largest sprite size available, so callers know when they'll get null. */
export const SPRITE_MAX = MAX;

/** Drop everything. Only needed if the theme or the art ever changes at runtime. */
export function clearSprites() {
  cache.clear();
  bytes = 0;
}
