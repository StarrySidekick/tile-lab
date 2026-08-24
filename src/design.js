// ---------------------------------------------------------------------------
// THE DESIGN BOOK.
//
// Every number and colour that decides how the game LOOKS, in one place, with
// a name, a range, and a sentence saying what it does. Nothing here affects a
// rule; everything here used to be a literal buried three files deep, tuned by
// guesswork and rediscovered by grepping.
//
// It exists to be edited by hand at play speed. `designer.js` builds a control
// for every entry below straight from this table — so adding a tunable is ONE
// LINE here and it appears in the console with a slider, a swatch and its
// note. Exporting hands back a JSON file of only what was changed from the
// defaults, which can be dropped in as `assets/design.json` and becomes the
// new baseline for everyone.
//
// The contract for a consumer is: READ AT USE, never at module load. A value
// cached in a `const` at import time cannot be tuned, which is exactly the
// problem this file is here to end.
// ---------------------------------------------------------------------------

/**
 * The book. `key` is a dot path; `type` picks the control; `note` is what the
 * console shows under it, and is the only documentation that ever gets read.
 */
export const SPEC = [
  // --- the sheet -----------------------------------------------------------
  { key: 'paper.tint', group: 'The sheet', type: 'color', def: '#e6d2a6',
    note: 'Base tone of the parchment, under everything else.' },
  { key: 'paper.grain', group: 'The sheet', type: 'range', def: 0.42, min: 0, max: 1, step: 0.01,
    note: 'How strongly the paper’s laid lines and flecks come back THROUGH the sky wash. This is what makes paint read as sunk into a sheet.' },
  { key: 'paper.foxing', group: 'The sheet', type: 'range', def: 1, min: 0, max: 3, step: 0.05,
    note: 'Strength of the rust-brown damp blotches. 0 is a clean sheet.' },
  { key: 'paper.edge', group: 'The sheet', type: 'range', def: 0.40, min: 0, max: 1, step: 0.01,
    note: 'The stain round the edge of the page, where a sheet is handled.' },
  { key: 'paper.edgeTone', group: 'The sheet', type: 'color', def: '#54381c',
    note: 'Colour of that edge stain.' },

  // --- the sky wash --------------------------------------------------------
  { key: 'sky.top', group: 'The sky wash', type: 'color', def: '#567492',
    note: 'The blue overhead, at the top of the sheet.' },
  { key: 'sky.mid', group: 'The sky wash', type: 'color', def: '#7492ab',
    note: 'Halfway down.' },
  { key: 'sky.low', group: 'The sky wash', type: 'color', def: '#96afbc',
    note: 'Near the horizon, where a wash thins out.' },
  { key: 'sky.alpha', group: 'The sky wash', type: 'range', def: 0.74, min: 0, max: 1, step: 0.01,
    note: 'Opacity of the whole wash. Lower lets more warm paper through and takes the chill off the blue.' },
  { key: 'sky.pooling', group: 'The sky wash', type: 'range', def: 1, min: 0, max: 3, step: 0.05,
    note: 'Patches where the brush left more pigment than it meant to. 0 is a flat airbrushed wash.' },
  { key: 'sky.poolTone', group: 'The sky wash', type: 'color', def: '#3e6080',
    note: 'The deeper blue those pools are made of.' },

  // --- the drawn line ------------------------------------------------------
  { key: 'line.wobbleAmp', group: 'The drawn line', type: 'range', def: 0.009, min: 0, max: 0.05, step: 0.0005,
    note: 'How far the GROUND’s lines wander, as a fraction of a tile. Country and clouds bend; buildings never do.' },
  { key: 'line.wobbleGrain', group: 'The drawn line', type: 'range', def: 0.12, min: 0.02, max: 0.4, step: 0.005,
    note: 'Wavelength of that wander. Long is a steady hand; short is a shiver.' },
  { key: 'line.toothAmp', group: 'The drawn line', type: 'range', def: 0.0022, min: 0, max: 0.01, step: 0.0001,
    note: 'Sub-pixel bite applied to EVERYTHING including architecture. A straight line stays straight; its edge takes the grain of the paper.' },
  { key: 'line.toothGrain', group: 'The drawn line', type: 'range', def: 0.032, min: 0.005, max: 0.2, step: 0.002,
    note: 'Wavelength of the tooth. Short is a rough paper, long is a smooth one.' },

  // --- the chart's ink -----------------------------------------------------
  { key: 'ink.tone', group: 'The chart’s ink', type: 'color', def: '#26210f',
    note: 'The colour the graticule and the rose are drawn in.' },
  { key: 'ink.graticule', group: 'The chart’s ink', type: 'range', def: 0.17, min: 0, max: 0.6, step: 0.01,
    note: 'Weight of the hairline parallels and meridians.' },
  { key: 'ink.meridian', group: 'The chart’s ink', type: 'range', def: 0.42, min: 0, max: 1, step: 0.01,
    note: 'Weight of the heavy line every fifth square — what lets you count squares at a glance.' },
  { key: 'ink.rhumbTone', group: 'The chart’s ink', type: 'color', def: '#7e2e20',
    note: 'The red a portolan strikes its rhumb lines in.' },
  { key: 'ink.rhumb', group: 'The chart’s ink', type: 'range', def: 0.17, min: 0, max: 0.6, step: 0.01,
    note: 'Weight of the rhumb network radiating from the compass nodes.' },
  { key: 'ink.rose', group: 'The chart’s ink', type: 'range', def: 0.46, min: 0, max: 1, step: 0.01,
    note: 'Weight of the compass rose on the origin.' },
  { key: 'ink.windNames', group: 'The chart’s ink', type: 'range', def: 0.62, min: 0, max: 1, step: 0.01,
    note: 'How boldly SEPTENTRIO and the other Latin winds are lettered.' },

  // --- tiles on the page ---------------------------------------------------
  { key: 'tile.wash', group: 'Tiles on the page', type: 'range', def: 0.15, min: 0, max: 0.6, step: 0.01,
    note: 'A warm multiply over every tile, pulling the whole board toward one ink-and-paper family. Too much and the greens die.' },
  { key: 'tile.washTone', group: 'Tiles on the page', type: 'color', def: '#d8c196',
    note: 'The colour of that wash.' },
  { key: 'tile.border', group: 'Tiles on the page', type: 'range', def: 0.28, min: 0, max: 1, step: 0.01,
    note: 'The hairline of ink round each square — what an engraved plate has and a rendered board does not.' },
  { key: 'tile.hatch', group: 'Tiles on the page', type: 'range', def: 0.10, min: 0, max: 0.5, step: 0.01,
    note: 'The crosshatch on open field. A printed map’s land is a wash, so this stays a whisper.' },

  // --- the country ---------------------------------------------------------
  { key: 'chart.field', group: 'The country', type: 'color', def: '#b0ab77', note: 'Open field.' },
  { key: 'chart.fieldAlt', group: 'The country', type: 'color', def: '#a49e6c', note: 'Its second tone — hills, banks.' },
  { key: 'chart.fieldEdge', group: 'The country', type: 'color', def: '#7d774e', note: 'Where field meets something else.' },
  { key: 'chart.road', group: 'The country', type: 'color', def: '#e6d6ae', note: 'A road: bare paper showing between ink edges.' },
  { key: 'chart.roadCore', group: 'The country', type: 'color', def: '#eee0bf', note: 'The lit centre of the track.' },
  { key: 'chart.roadEdge', group: 'The country', type: 'color', def: '#45351f', note: 'The ink line either side of a road.' },
  { key: 'chart.forest', group: 'The country', type: 'color', def: '#7d8a58', note: 'Woodland.' },
  { key: 'chart.forestCanopy', group: 'The country', type: 'color', def: '#8f9c66', note: 'The lit side of a tree.' },
  { key: 'chart.water', group: 'The country', type: 'color', def: '#8fa9b4', note: 'Lakes and rivers — the portolan’s near-grey sea.' },
  { key: 'chart.waterDeep', group: 'The country', type: 'color', def: '#6d8b9a', note: 'Deep water.' },

  // --- what is built -------------------------------------------------------
  { key: 'chart.city', group: 'What is built', type: 'color', def: '#cdb488', note: 'Curtain wall stone.' },
  { key: 'chart.cityWall', group: 'What is built', type: 'color', def: '#54402a', note: 'The wall’s shaded foot — an ink line at this scale.' },
  { key: 'chart.wallLit', group: 'What is built', type: 'color', def: '#e5d2a6', note: 'The walkway on top.' },
  { key: 'chart.cityGround', group: 'What is built', type: 'color', def: '#c4ac81', note: 'Packed earth inside the walls.' },
  { key: 'chart.roof', group: 'What is built', type: 'color', def: '#b5502f', note: 'Vermillion — the accent every reference leans on.' },
  { key: 'chart.roofLit', group: 'What is built', type: 'color', def: '#d0703f', note: 'The slope facing the sun.' },
  { key: 'chart.roofShade', group: 'What is built', type: 'color', def: '#6e2c17', note: 'The slope that doesn’t. A flat pair, not a gradient.' },
  { key: 'chart.plaster', group: 'What is built', type: 'color', def: '#eee0c2', note: 'Rendered walls, temple columns.' },
  { key: 'chart.timber', group: 'What is built', type: 'color', def: '#54402a', note: 'Beams, poles, pennant staffs.' },

  // --- the weather ---------------------------------------------------------
  { key: 'storm.beat', group: 'The weather', type: 'range', def: 650, min: 120, max: 1600, step: 10,
    note: 'Milliseconds between one gust of a storm and the next. The whole reason a chain is watchable.' },
  { key: 'storm.decay', group: 'The weather', type: 'range', def: 0.82, min: 0.4, max: 1, step: 0.01,
    note: 'Each beat is this much of the one before, so a six-gust chain does not outstay its welcome. 1 keeps every beat equal.' },
  { key: 'storm.minBeat', group: 'The weather', type: 'range', def: 220, min: 60, max: 800, step: 10,
    note: 'However far the decay runs, beats never get shorter than this.' },
  { key: 'storm.streak', group: 'The weather', type: 'range', def: 0.80, min: 0, max: 1, step: 0.01,
    note: 'Opacity of the ink comet that sweeps the lane a gust reached.' },
  { key: 'storm.streakInk', group: 'The weather', type: 'color', def: '#28241c', note: 'Colour of a zephyr’s streak.' },
  { key: 'storm.cannonInk', group: 'The weather', type: 'color', def: '#7e2e20', note: 'Colour of a gust cannon’s — red, because artillery.' },
  { key: 'storm.tileGlide', group: 'The weather', type: 'range', def: 420, min: 80, max: 1200, step: 10,
    note: 'Milliseconds a tile takes to slide to where the wind put it.' },

  // --- the figures ---------------------------------------------------------
  { key: 'star.arm', group: 'The figures', type: 'range', def: 0.56, min: 0.3, max: 0.9, step: 0.01,
    note: 'Reach of the star person’s arms and legs.' },
  { key: 'star.head', group: 'The figures', type: 'range', def: 0.68, min: 0.3, max: 1, step: 0.01,
    note: 'Reach of the head point. Longer than the arms is what makes a star stand like a person.' },
  { key: 'star.waist', group: 'The figures', type: 'range', def: 0.235, min: 0.1, max: 0.45, step: 0.005,
    note: 'The valley between the points. Tighter is a spikier, thinner figure.' },
  { key: 'star.ink', group: 'The figures', type: 'range', def: 1, min: 0, max: 3, step: 0.05,
    note: 'Weight of the outline round a follower.' },
];

/** Defaults, as a nested object, built once from the book. */
function seed() {
  const out = {};
  for (const s of SPEC) set(out, s.key, s.def);
  return out;
}

function set(obj, path, value) {
  const parts = path.split('.');
  let at = obj;
  for (let i = 0; i < parts.length - 1; i++) at = (at[parts[i]] ??= {});
  at[parts[parts.length - 1]] = value;
}

function get(obj, path) {
  return path.split('.').reduce((at, k) => (at == null ? at : at[k]), obj);
}

/**
 * The live values. Mutated in place, so a consumer that holds a reference to
 * `DESIGN` sees every change without re-importing anything.
 */
export const DESIGN = seed();

/** Everything that differs from the defaults — which is what gets exported. */
export function changes() {
  const out = {};
  for (const s of SPEC) {
    const now = get(DESIGN, s.key);
    if (now !== s.def) out[s.key] = now;
  }
  return out;
}

const listeners = new Set();
export function onDesignChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function announce() { for (const fn of listeners) fn(); }

export function setValue(key, value) {
  set(DESIGN, key, value);
  announce();
}

/** Take a flat `{ 'a.b': v }` bag — an exported file, or a saved session. */
export function apply(flat) {
  if (!flat) return;
  for (const [k, v] of Object.entries(flat)) {
    if (SPEC.some((s) => s.key === k)) set(DESIGN, k, v);
  }
  announce();
}

export function reset() {
  Object.assign(DESIGN, seed());
  announce();
}

/**
 * Load `assets/design.json` if somebody has committed one. That is how an
 * exported session becomes the new baseline: hand back the file, drop it in,
 * and the game boots wearing it.
 */
export async function loadCommitted() {
  try {
    const res = await fetch('./assets/design.json', { cache: 'no-store' });
    if (!res.ok) return false;
    apply(await res.json());
    return true;
  } catch { return false; }
}

/** rgba() from a hex swatch and an alpha, since most of these are both. */
export function rgba(hex, a = 1) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
