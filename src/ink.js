// ---------------------------------------------------------------------------
// The drawn line.
//
// Everything in art.js is geometry: arcs and rects stroked by a machine, every
// edge dead straight. A sixteenth-century plate has no straight lines in it —
// even the ruled ones breathe — and redrawing two thousand path calls with
// hand-wobble would be a rewrite that never ends.
//
// So the wobble is applied to the PICTURE, not the paths. A sprite is rendered
// clean and then run through `roughen`: every pixel is looked up a small,
// smoothly-varying distance from where it "should" be, which bends every edge
// in the image at once — outlines, hatching, roofs, all of it — exactly the
// way a nib wanders. The displacement field is smooth value noise, so lines
// waver rather than dissolve; it is seeded, so the same tile roughens the same
// way every time; and it runs ONCE per cached sprite, so the per-frame cost is
// zero.
//
// The field is zero-mean and small (about 1.5% of the tile), so tiles still
// abut: sampling clamps at the canvas edge rather than reading transparency,
// which keeps the seams closed.
// ---------------------------------------------------------------------------

/** Deterministic PRNG, so the grain of the world doesn't reroll per session. */
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A tileable lattice of smooth noise, sampled with smoothstep interpolation. */
function makeNoise(seed, n = 16) {
  const rng = mulberry(seed);
  const g = new Float32Array(n * n);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const fx = x - xi, fy = y - yi;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const x0 = ((xi % n) + n) % n, x1 = (x0 + 1) % n;
    const y0 = ((yi % n) + n) % n, y1 = (y0 + 1) % n;
    const a = g[y0 * n + x0], b = g[y0 * n + x1];
    const c = g[y1 * n + x0], d = g[y1 * n + x1];
    return (a + (b - a) * sx) + ((c + (d - c) * sx) - (a + (b - a) * sx)) * sy;
  };
}

const noiseX = makeNoise(101);
const noiseY = makeNoise(707);

/**
 * Bend every line in a canvas as if it had been drawn by hand.
 *
 * `amp` is the maximum wander in pixels (default ~1.5% of the width) and
 * `grain` the wobble wavelength as a fraction of the width. Small amp, longish
 * wavelength is a steady hand; crank either and it becomes a child's crayon.
 */
export function roughen(canvas, { amp = null, grain = 0.09 } = {}) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  const s = src.data, o = out.data;
  const a = amp ?? Math.max(0.8, w * 0.015);
  const inv = 1 / (w * grain);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (noiseX(x * inv, y * inv) - 0.5) * 2 * a;
      const ny = (noiseY(x * inv, y * inv) - 0.5) * 2 * a;
      let sx = (x + nx) | 0; if (sx < 0) sx = 0; else if (sx >= w) sx = w - 1;
      let sy = (y + ny) | 0; if (sy < 0) sy = 0; else if (sy >= h) sy = h - 1;
      const si = (sy * w + sx) * 4, oi = (y * w + x) * 4;
      o[oi] = s[si]; o[oi + 1] = s[si + 1]; o[oi + 2] = s[si + 2]; o[oi + 3] = s[si + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}
