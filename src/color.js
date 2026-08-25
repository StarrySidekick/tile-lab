// ---------------------------------------------------------------------------
// COLOUR, PERCEPTUALLY.
//
// Everything here works in OKLCH: lightness, chroma, hue. It is the only sane
// space to reason about a palette in — HSL will tell you that #0000ff and
// #ffff00 are equally light, which is nonsense you can see with your own eyes,
// and it will tell you that rotating hue leaves a colour otherwise unchanged,
// which is also nonsense. In OKLCH a hue rotation really does hold lightness
// and saturation still, so "the same colour, moved round the wheel" means what
// it says. That is the whole reason the colour view can be trusted.
//
// Two things this file owes the caller:
//
//   ROUND TRIPS. hex → oklch → hex must come back where it started, or the
//   console would drift a colour every time you looked at it.
//   GAMUT. Most (L, C, h) triples are not sRGB colours. Asking for one has to
//   give back the nearest one that IS, by pulling chroma in — never by
//   clipping channels, which shifts hue and is how "the same colour at a
//   different angle" stops being the same colour.
// ---------------------------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** sRGB transfer function and its inverse — the gamma curve, not 2.2. */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const s = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(s, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]) {
  const two = (x) => Math.round(clamp01(x) * 255).toString(16).padStart(2, '0');
  return `#${two(r)}${two(g)}${two(b)}`;
}

/** sRGB (0..1) to OKLab. Ottosson's matrices, written out. */
export function rgbToOklab([r, g, b]) {
  const R = toLinear(r), G = toLinear(g), B = toLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  ];
}

/** OKLab back to sRGB (0..1). May land outside the cube — see `inGamut`. */
export function oklabToRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [
    toGamma(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toGamma(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s),
  ];
}

const EPS = 1 / 512;
const inGamut = ([r, g, b]) =>
  r >= -EPS && r <= 1 + EPS && g >= -EPS && g <= 1 + EPS && b >= -EPS && b <= 1 + EPS;

/** hex → { l, c, h } with h in degrees. */
export function hexToLch(hex) {
  const [L, a, b] = rgbToOklab(hexToRgb(hex));
  const c = Math.hypot(a, b);
  let h = Math.atan2(b, a) * 180 / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/**
 * { l, c, h } → hex, pulling chroma in until it is a colour sRGB can show.
 *
 * Binary search rather than a formula because the sRGB gamut boundary in
 * OKLCH is not an expression you can write down — it is the shape of a cube
 * seen from a strange angle. Sixteen halvings put it within a thousandth of
 * the edge, which is far below a single 8-bit step.
 */
export function lchToHex({ l, c, h }) {
  const L = Math.max(0, Math.min(1, l));
  const rad = h * Math.PI / 180;
  const at = (chroma) => oklabToRgb([L, Math.cos(rad) * chroma, Math.sin(rad) * chroma]);
  if (inGamut(at(c))) return rgbToHex(at(c));
  let lo = 0, hi = Math.max(0, c);
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(at(mid))) lo = mid; else hi = mid;
  }
  return rgbToHex(at(lo));
}

/** The most chroma this lightness and hue can actually hold in sRGB. */
export function maxChroma(l, h) {
  let lo = 0, hi = 0.5;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklabToRgb([l, Math.cos(h * Math.PI / 180) * mid, Math.sin(h * Math.PI / 180) * mid]))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Shortest signed distance from hue a to hue b, in degrees (-180..180]. */
export function hueDelta(a, b) {
  let d = (b - a) % 360;
  if (d > 180) d -= 360;
  if (d <= -180) d += 360;
  return d;
}

/**
 * The classical schemes, as offsets in degrees from a key hue.
 *
 * These are relationships, not rules — a palette that hits every angle exactly
 * looks like a colour picker rather than a picture. They are here to be aimed
 * at and then pulled away from, which is what the console is for.
 */
export const SCHEMES = [
  { id: 'mono', name: 'Monochrome', at: [0], note: 'One hue. Everything separates by lightness and chroma instead.' },
  { id: 'analogous', name: 'Analogous', at: [-30, 30], note: 'Neighbours. Quiet and coherent; needs a lightness range or it goes flat.' },
  { id: 'complement', name: 'Complementary', at: [180], note: 'Straight across. The strongest pairing there is, and the easiest to overdo.' },
  { id: 'split', name: 'Split complement', at: [150, 210], note: 'The complement, either side of it. Most of the tension, less of the shouting.' },
  { id: 'triad', name: 'Triadic', at: [120, 240], note: 'Three, evenly spaced. Lively; usually wants one to lead and two to support.' },
  { id: 'tetrad', name: 'Tetradic', at: [90, 180, 270], note: 'Two complementary pairs. The most colours you can hold together at once.' },
];

/** Every angle any scheme cares about, relative to a key hue. */
export function spokes(keyHue) {
  const out = [];
  for (const s of SCHEMES) {
    for (const off of s.at) {
      if (!off) continue;
      out.push({ scheme: s.id, name: s.name, offset: off, hue: (keyHue + off + 360) % 360 });
    }
  }
  return out;
}

/** The named relationship a hue stands in to a key hue, if it is near one. */
export function relation(keyHue, hue, tolerance = 8) {
  const d = hueDelta(keyHue, hue);
  if (Math.abs(d) <= tolerance) return { name: 'Same hue', offset: 0, off: d };
  let best = null;
  for (const s of SCHEMES) {
    for (const off of s.at) {
      if (!off) continue;
      const miss = hueDelta(off, d);
      if (Math.abs(miss) <= tolerance && (!best || Math.abs(miss) < Math.abs(best.off))) {
        best = { name: s.name, offset: off, off: miss };
      }
    }
  }
  return best;
}

/**
 * WCAG contrast, which is a blunt instrument and the only one everybody has
 * agreed on. Used here for the one question it answers well: can you read the
 * ink on the paper.
 */
export function contrast(hexA, hexB) {
  const lum = (hex) => {
    const [r, g, b] = hexToRgb(hex).map(toLinear);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const a = lum(hexA), b = lum(hexB);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
