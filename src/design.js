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
    note: 'How dark the hairline of ink round each square is — what an engraved plate has and a rendered board does not. 0 removes it.' },
  { key: 'tile.borderWidth', group: 'Tiles on the page', type: 'range', def: 1, min: 0.5, max: 5, step: 0.1,
    note: 'How thick that hairline is, in screen pixels. It does not grow with zoom, the way a printed line does not.' },
  { key: 'tile.hatch', group: 'Tiles on the page', type: 'range', def: 0.10, min: 0, max: 0.5, step: 0.01,
    note: 'The crosshatch on open field. A printed map’s land is a wash, so this stays a whisper.' },

  // --- the country ---------------------------------------------------------
  { key: 'chart.field', group: 'The country', type: 'color', def: '#b0ab77', note: 'Open field.' },
  { key: 'chart.fieldAlt', group: 'The country', type: 'color', def: '#a49e6c', note: 'Its second tone — hills, banks.' },
  { key: 'chart.fieldEdge', group: 'The country', type: 'color', def: '#7d774e', note: 'Where field meets something else.' },
  { key: 'chart.road', group: 'The country', type: 'color', def: '#e6d6ae', note: 'A road: bare paper showing between ink edges.' },
  { key: 'chart.roadCore', group: 'The country', type: 'color', def: '#eee0bf', note: 'The lit centre of the track.' },
  { key: 'chart.roadEdge', group: 'The country', type: 'color', def: '#45351f', note: 'The ink line either side of a road.' },
  { key: 'road.width', group: 'The country', type: 'range', def: 0.14, min: 0.04, max: 0.30, step: 0.005,
    note: 'Width of a road as a fraction of a tile, ink edges included.' },
  { key: 'road.core', group: 'The country', type: 'range', def: 0.095, min: 0.01, max: 0.26, step: 0.005,
    note: 'Width of the pale track inside it. The difference between the two IS the ink edge.' },
  { key: 'chart.forest', group: 'The country', type: 'color', def: '#7d8a58', note: 'Woodland.' },
  { key: 'chart.water', group: 'The country', type: 'color', def: '#8fa9b4', note: 'Lakes and rivers — the portolan’s near-grey sea.' },
  { key: 'chart.waterDeep', group: 'The country', type: 'color', def: '#6d8b9a', note: 'Deep water.' },

  // --- what is built -------------------------------------------------------
  { key: 'chart.city', group: 'What is built', type: 'color', def: '#cdb488', note: 'Curtain wall stone.' },
  { key: 'chart.cityWall', group: 'What is built', type: 'color', def: '#54402a', note: 'The wall’s shaded foot — an ink line at this scale.' },
  { key: 'chart.cityGround', group: 'What is built', type: 'color', def: '#c4ac81', note: 'Packed earth inside the walls.' },
  { key: 'chart.roof', group: 'What is built', type: 'color', def: '#b5502f', note: 'Vermillion — the accent every reference leans on.' },
  { key: 'chart.plaster', group: 'What is built', type: 'color', def: '#eee0c2', note: 'Rendered walls, temple columns.' },
  { key: 'chart.timber', group: 'What is built', type: 'color', def: '#54402a', note: 'Beams, poles, pennant staffs.' },
  { key: 'mark.size', group: 'What is built', type: 'range', def: 1, min: 0.5, max: 1.8, step: 0.02,
    note: 'Size of every stamp that sits on a tile — inns, cathedrals, shrines, and the wind-heads too.' },
  { key: 'mark.ink', group: 'What is built', type: 'range', def: 1, min: 0.2, max: 3, step: 0.05,
    note: 'Weight of the line those stamps are drawn in.' },
  { key: 'turbine.tower', group: 'What is built', type: 'color', def: '#eee0c2',
    note: 'The windmill’s tower.' },
  { key: 'turbine.sail', group: 'What is built', type: 'color', def: '#e8ded0',
    note: 'Its four turning sails — the arms and the canvas on them.' },
  { key: 'flier.wing', group: 'What is built', type: 'color', def: '#eee0c2',
    note: 'The flying machine’s wing.' },
  { key: 'flier.frame', group: 'What is built', type: 'color', def: '#54402a',
    note: 'Its ribs and fuselage.' },
  { key: 'flier.wind', group: 'What is built', type: 'color', def: '#e4f0f8',
    note: 'The wedge of air it launches into. Very faint — it is a hint of a direction, not a shape.' },

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
  { key: 'zephyr.size', group: 'The weather', type: 'range', def: 1, min: 0.5, max: 1.8, step: 0.02,
    note: 'Size of the wind-heads specifically — zephyrs and gust cannons — on top of the stamp size.' },
  { key: 'zephyr.ink', group: 'The weather', type: 'range', def: 1, min: 0.2, max: 3, step: 0.05,
    note: 'Weight of the line THEY are drawn in, again on top of the stamp weight.' },
  { key: 'zephyr.line', group: 'The weather', type: 'color', def: '#342416',
    note: 'The ink a wind-head is drawn in — hair, face, the ruled lines of moving air.' },
  { key: 'zephyr.face', group: 'The weather', type: 'color', def: '#f2e7cd',
    note: 'The paper he is made of: the bank of cloud round him and his face.' },
  { key: 'zephyr.breath', group: 'The weather', type: 'color', def: '#f2e7cd',
    note: 'The cone of air he is blowing. Laid at part opacity over whatever is under it.' },
  { key: 'zephyr.brass', group: 'The weather', type: 'color', def: '#c9a24d',
    note: 'The gust cannon’s horn — the one thing that tells a cannon from a zephyr at a glance.' },

  // --- the figures ---------------------------------------------------------
  { key: 'star.arm', group: 'The figures', type: 'range', def: 0.56, min: 0.3, max: 0.9, step: 0.01,
    note: 'Reach of the star person’s arms and legs.' },
  { key: 'star.head', group: 'The figures', type: 'range', def: 0.68, min: 0.3, max: 1, step: 0.01,
    note: 'Reach of the head point. Longer than the arms is what makes a star stand like a person.' },
  { key: 'star.waist', group: 'The figures', type: 'range', def: 0.235, min: 0.1, max: 0.45, step: 0.005,
    note: 'The valley between the points. Tighter is a spikier, thinner figure.' },
  { key: 'star.ink', group: 'The figures', type: 'range', def: 1, min: 0, max: 3, step: 0.05,
    note: 'Weight of the outline round a follower.' },
  { key: 'balena.size', group: 'The figures', type: 'range', def: 0.88, min: 0.4, max: 1.3, step: 0.01,
    note: 'How much of its square the whale fills. Under 1 so you can still tell which tile it is pinning.' },
  { key: 'balena.skin', group: 'The figures', type: 'color', def: '#5b6b84',
    note: 'The whale’s back — one flat wash, the way a margin sea-monster is inked.' },
  { key: 'balena.belly', group: 'The figures', type: 'color', def: '#d9d2ba',
    note: 'Its pale underside, the second wash.' },
  { key: 'balena.inkTone', group: 'The figures', type: 'color', def: '#282420',
    note: 'The line it is drawn in.' },
  { key: 'balena.ink', group: 'The figures', type: 'range', def: 1, min: 0.2, max: 3, step: 0.05,
    note: 'Weight of that line.' },
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

const BOOK = new Map(SPEC.map((s) => [s.key, s]));
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * A value, or nothing.
 *
 * Everything that reaches DESIGN comes through here, because everything that
 * reads DESIGN trusts it absolutely — and rightly, since checking a number is
 * a number in the middle of a render loop is how you get a render loop full of
 * checks. One `"x"` where a number belongs used to reach a gradient stop and
 * throw; the frame loop caught it, skipped the frame, and every frame after
 * it, and the board went black with nothing on screen to say why. A draft in
 * localStorage or a hand-edited design.json is enough to do that, so the
 * boundary is here: an unknown key, a NaN, a colour that isn't one, and the
 * value is refused rather than believed.
 */
function coerce(key, value) {
  const spec = BOOK.get(key);
  if (!spec) return undefined;
  if (spec.type === 'color') {
    if (typeof value !== 'string' || !HEX.test(value.trim())) return undefined;
    return value.trim().toLowerCase();
  }
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(spec.max, Math.max(spec.min, n));
}

export function setValue(key, value) {
  const v = coerce(key, value);
  if (v === undefined) return;
  set(DESIGN, key, v);
  announce();
}

/** Take a flat `{ 'a.b': v }` bag — an exported file, or a saved session. */
export function apply(flat) {
  if (!flat || typeof flat !== 'object' || Array.isArray(flat)) return;
  const refused = [];
  for (const [k, v] of Object.entries(flat)) {
    const use = coerce(k, v);
    if (use === undefined) refused.push(k);
    else set(DESIGN, k, use);
  }
  if (refused.length) {
    console.warn(`design: ignored ${refused.length} value(s) that were not usable — ${refused.join(', ')}`);
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
    if (!res.ok) return null;
    const book = await res.json();
    apply(book);
    return book;                  // kept by the caller, to restore from
  } catch { return null; }
}

/** rgba() from a hex swatch and an alpha, since most of these are both. */
export function rgba(hex, a = 1) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
