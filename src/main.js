// ---------------------------------------------------------------------------
// DOM wiring: input handling, side panel, and the render loop.
//
// Nothing in here knows what a mode is. The dropdown, the hint, the panel and
// the action buttons are all built from the mode registry and from whatever
// the running mode returns from its hooks — so a new mode file shows up in the
// UI without this file changing.
//
// It also owns the clock the computer players run on, since "one move, then a
// pause you can watch" is a UI concern and not something src/ai.js should have
// an opinion about.
// ---------------------------------------------------------------------------

import { Game, DEFAULT_GROUPS, MODES, MECHANICS, MECHANIC_GROUPS } from './game.js';
import { Bot, BOT_LEVELS } from './ai.js';
import {
  groupsFor, missingNeeds, defaultMechanics, LIVE_MECHANICS, MECHANIC_BY_ID,
  RULESETS, RULESET_BY_ID, DEFAULT_RULESET,
} from './mechanics.js';
import { Renderer } from './render.js';
import { drawTile, drawMeeple, PLAYER_COLORS } from './art.js';
import { roughen } from './ink.js';
import { THEME } from './theme.js';
import { TILE_TYPES, TILES, GROUPS, rotPoint } from './tiles.js';
import { Sfx, SOUND_NAMES } from './audio.js';
import { Effects } from './fx.js';
import { VERSION } from './version.js';

const canvas = document.getElementById('board');
const renderer = new Renderer(canvas);
const $ = (id) => document.getElementById(id);
const sfx = new Sfx();

// Someone who has asked their system not to animate things has asked us too.
const stillness = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const fx = new Effects({ enabled: !stillness });
renderer.fx = fx;

let enabledGroups = new Set(DEFAULT_GROUPS.classic);
// The workshop starts as plain Carcassonne: the base layer on, nothing bolted
// on. Every other state the panel can be in is a departure from this one.
let mechanics = defaultMechanics();
let ruleset = DEFAULT_RULESET;
let game;

/**
 * A placement you have made but not yet committed.
 *
 * The engine has no notion of this: as far as it is concerned a tile is in
 * your hand or on the board. The staging happens entirely up here, which is
 * why turning it off is a checkbox rather than a branch through the rules —
 * `commitPending` is the only thing that ever calls `placeAt`.
 *
 *   {x, y, rot, rots: [...]}   rots is every rotation legal at THAT square
 */
let pending = null;
let dragging = null;            // a tile being dragged out of the preview

/**
 * Every Game is fresh, so its listeners have to be re-subscribed each time.
 * Sound and effects are two subscribers to the same stream — neither knows the
 * other exists, and either can be switched off without the game noticing.
 */
function bind(g) {
  g.on((kind, data) => {
    sfx.play(kind);
    fx.on(kind, data, g);
    // You clicked your own move, so you know where it went. The computer's you
    // have to be shown, or you spend the turn hunting for what changed.
    if (botTurn() && MOVES.has(kind)) {
      const at = data.at || (g.lastPlaced ? { x: g.lastPlaced.x + 0.5, y: g.lastPlaced.y + 0.5 } : null);
      if (at) renderer.glideTo(at.x - 0.5, at.y - 0.5);
    }
  });
  return g;
}

const MOVES = new Set(['place', 'step', 'warp']);

/**
 * Where a tile or a follower comes from when it enters play: the preview, in
 * world units. It's off the side of the canvas, which is exactly right — the
 * thing you were looking at is where the thing you played comes from.
 */
fx.entryAt = () => {
  const pv = $('preview').getBoundingClientRect();
  const cv = canvas.getBoundingClientRect();
  const [x, y] = renderer.toWorld(pv.left + pv.width / 2 - cv.left, pv.top + pv.height / 2 - cv.top);
  return { x, y };
};

const spec = (id) => MODES.find((m) => m.id === id);

// --- the build stamp ---------------------------------------------------------

/**
 * What this page was built from, and whether it's the current one.
 *
 * The badge alone can only ever report what the running code thinks it is —
 * which is no help at all when the browser has quietly served you last week's
 * copy. So the same stamp is fetched from version.json past the cache and the
 * two are compared: if they disagree, what you're looking at is stale, and the
 * badge says so instead of confidently showing the wrong number.
 */
function showVersion() {
  const el = $('version');
  const stamp = `v${VERSION.version} · b${VERSION.build}`;
  el.textContent = stamp;
  el.title = `Built ${VERSION.date}${VERSION.label ? ` — ${VERSION.label}` : ''}`;

  fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((live) => {
      if (!live || (live.build === VERSION.build && live.version === VERSION.version)) return;
      el.classList.add('stale');
      el.textContent = `${stamp} → v${live.version} · b${live.build}`;
      el.title = 'Your browser is running an older copy than the server has. '
        + 'Click to reload; if it comes back the same, hard-refresh (shift+reload).';
      el.onclick = () => window.location.reload();
    })
    .catch(() => { /* offline, or opened without a server: nothing to compare to */ });
}

// --- computer players --------------------------------------------------------
//
// Bots take the LAST seats, so you are always the first player and the colour
// you were before you switched one on. They're rebuilt rather than reconfigured
// whenever anything about them changes, which includes mid-game: turning one on
// hands it whatever position is on the board right now.

let bots = new Map();

function buildBots() {
  bots = new Map();
  if (!game || game.spec.solo) return;
  const wanted = Math.min(Number($('botCount').value) || 0, game.players.length);
  const level = $('botSkill').value;
  for (let seat = game.players.length - wanted; seat < game.players.length; seat++) {
    bots.set(seat, new Bot(game, seat, { level, seed: (game.seed ?? Date.now()) + seat }));
  }
}

const botTurn = () => game.phase !== 'over' && bots.has(game.current);

/** The seat count is per game, so the dropdown is rebuilt with the players. */
let botSeats = 1;
function renderBotSeats() {
  const el = $('botCount');
  const players = Number($('playerCount').value) || 2;
  const chosen = Math.min(botSeats, players);
  el.innerHTML = '';
  for (let n = 0; n <= players; n++) {
    const label = n === 0 ? 'None' : n === players ? `All ${n} — watch` : `${n}`;
    el.insertAdjacentHTML('beforeend', `<option value="${n}">${label}</option>`);
  }
  el.value = String(chosen);
}

/**
 * One action per tick, never more, and always after a pause — a bot that
 * resolves its whole turn between two frames looks like a bug rather than an
 * opponent. Driven from the render loop rather than a timer so it can't outlive
 * the game it belongs to.
 */
let nextBotAt = 0;
function driveBots(now) {
  if (!botTurn()) { nextBotAt = 0; return; }
  renderer.hover = null;              // no ghost tile following your mouse
  const wait = Number($('botSpeed').value) || 0;
  if (!nextBotAt) { nextBotAt = now + wait; return; }
  if (now < nextBotAt) return;
  nextBotAt = now + wait;
  bots.get(game.current).act();
}

// --- new game ---------------------------------------------------------------

function newGame() {
  const mode = $('mode').value;
  const players = Number($('playerCount').value);
  const seedRaw = $('seed').value.trim();
  const seed = seedRaw === '' ? null : hashSeed(seedRaw);
  // A mechanic that needs its own tiles switches them on with it, so ticking
  // "Inns & Cathedrals" doesn't silently do nothing.
  for (const g of groupsFor(mechanics)) enabledGroups.add(g);
  game = bind(new Game({
    players, seed, mode,
    meeples: $('useMeeples').checked,
    groups: [...enabledGroups],
    options: { ...mechanics },
    ruleset,
    tilesPerTurn: Number($('tilesPerTurn').value) || 1,
  }));
  game.free = $('freePlace').checked;
  pending = null;
  renderer.pending = null;
  buildBots();
  fx.clear();
  shownScores = [];
  bumping.clear();
  renderer.centerOn(0, 0);
  renderer.cam.zoom = spec(mode)?.bounds ? 78 : 96;
  syncPanel();
}

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Switching mode swaps in that mode's sensible default tile pool. */
function onModeChange() {
  const id = $('mode').value;
  const s = spec(id);
  enabledGroups = new Set(DEFAULT_GROUPS[id] || DEFAULT_GROUPS.classic);
  renderGroups();
  $('meepleRow').style.display = s?.meeples ? '' : 'none';
  $('playerRow').style.display = s?.solo ? 'none' : '';
  $('seedRow').style.display = s?.seedFor ? 'none' : '';

  const count = $('playerCount');
  const min = s?.minPlayers || 1, max = s?.maxPlayers || 5;
  count.innerHTML = '';
  for (let n = Math.max(2, min); n <= max; n++) {
    count.insertAdjacentHTML('beforeend', `<option>${n}</option>`);
  }
  for (const id of ['botRow', 'botSkillRow', 'botSpeedRow']) {
    $(id).style.display = s?.solo ? 'none' : '';
  }
  renderBotSeats();

  let hint = s?.hint || '';
  if (id === 'classic' && !$('useMeeples').checked) {
    hint = 'No meeples — a feature pays whoever closes it.';
  }
  $('modeHint').textContent = hint;
  // The cloud kingdom is printed on parchment rather than lit in twilight, and
  // the panel has to agree with the board or the whole thing looks like two
  // games in one window. One class, and the palette variables do the rest.
  document.body.classList.toggle('parchment', !!s?.antique);
}

/**
 * Every rotation this tile could legally take at (x, y). The confirm step
 * turns only through these, so a staged tile can never be rotated into an
 * illegal position and you never have to guess which way round it will go.
 */
function legalRotationsAt(x, y) {
  const out = [];
  const saved = game.rot;
  for (let r = 0; r < 4; r++) {
    game.rot = r;
    if (game.canPlaceAt(x, y) && (!game.m.canPlaceAt || game.m.canPlaceAt(x, y))) out.push(r);
  }
  game.rot = saved;
  return out;
}

const confirming = () => $('confirmPlace').checked && game.phase === 'place' && !game.m.piece;

/** Stage a placement at (x, y), preferring the rotation already in hand. */
function stagePending(x, y) {
  const rots = legalRotationsAt(x, y);
  if (!rots.length) return false;
  pending = { x, y, rot: rots.includes(game.rot) ? game.rot : rots[0], rots };
  game.rot = pending.rot;
  renderer.pending = pending;
  sfx.play('rotate');
  syncPanel();
  return true;
}

function clearPending() {
  pending = null;
  renderer.pending = null;
  syncPanel();
}

/** Turn a staged tile to its next legal rotation. */
function turnPending(dir = 1) {
  if (!pending) return false;
  const i = pending.rots.indexOf(pending.rot);
  pending.rot = pending.rots[(i + dir + pending.rots.length) % pending.rots.length];
  game.rot = pending.rot;
  sfx.play('rotate');
  syncPanel();
  return true;
}

/** Lock it in. This is the one place a staged tile reaches the engine. */
function commitPending() {
  if (!pending) return false;
  const { x, y, rot } = pending;
  pending = null;
  renderer.pending = null;
  game.rot = rot;
  const done = game.placeAt(x, y);
  if (!done) sfx.play('deny');
  return done;
}

// --- pointer ----------------------------------------------------------------
//
// One finger pans, two fingers pinch, and a mouse behaves exactly as it did.
// Every live pointer is tracked, because that's the only way to tell a pinch
// from a drag — and the moment a second finger lands, whatever the first one
// was doing stops being a drag and stops being a tap.
//
// Positions come off clientX/clientY rather than offsetX/offsetY: with two
// pointers on one element the two are the same thing anyway, and this way a
// synthetic event from a test carries the coordinates it was given.

const pointers = new Map();   // pointerId -> {x, y}
let drag = null;              // one-pointer pan
let pinch = null;             // two-pointer zoom: last {dist, x, y}
let gestured = false;         // a pinch happened — the release isn't a tap

function local(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

/** Distance between the two live pointers, and the point between them. */
function spread() {
  const [a, b] = [...pointers.values()];
  if (!a || !b) return null;
  return { dist: Math.hypot(b.x - a.x, b.y - a.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Is this cell touching the played area? Used to decide whether to buzz. */
function nearBoard(c) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) if (game.board.get(c.x + dx, c.y + dy)) return true;
  }
  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  const p = local(e);
  renderer.glide = null;          // you take the camera back the moment you touch it
  pointers.set(e.pointerId, p);
  // A synthetic pointer (a test, mostly) has nothing to capture.
  try { canvas.setPointerCapture(e.pointerId); } catch { /* not a real pointer */ }
  if (pointers.size >= 2) {
    drag = null;
    pinch = spread();
    gestured = true;
    renderer.hover = null;
  } else {
    drag = { x: p.x, y: p.y, moved: 0, camX: renderer.cam.x, camY: renderer.cam.y };
    gestured = false;
  }
});

canvas.addEventListener('pointermove', (e) => {
  const p = local(e);
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);

  // Pinch: scale about the midpoint, then follow the midpoint. Doing both is
  // what keeps the board stuck to your fingers instead of sliding under them.
  if (pinch && pointers.size >= 2) {
    const now = spread();
    if (now && pinch.dist > 0 && !game.interior) {
      renderer.zoomAt(now.x, now.y, now.dist / pinch.dist);
      renderer.cam.x -= (now.x - pinch.x) / renderer.cam.zoom;
      renderer.cam.y -= (now.y - pinch.y) / renderer.cam.zoom;
    }
    pinch = now;
    renderer.hover = null;
    return;
  }

  if (drag) {
    const dx = p.x - drag.x, dy = p.y - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 4 && !game.interior) {
      renderer.cam.x = drag.camX - dx / renderer.cam.zoom;
      renderer.cam.y = drag.camY - dy / renderer.cam.zoom;
    }
  }
  renderer.pointer = { sx: p.x, sy: p.y };
  renderer.hover = renderer.cellAt(p.x, p.y);
});

canvas.addEventListener('pointerleave', () => { renderer.hover = null; renderer.pointer = null; });

function liftPointer(e) {
  pointers.delete(e.pointerId);
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* never captured */ }
  if (pointers.size < 2) pinch = null;
  // One finger left after a pinch: it becomes the pan anchor from where it is,
  // or the board leaps the moment it moves.
  if (pointers.size === 1) {
    const [p] = pointers.values();
    drag = { x: p.x, y: p.y, moved: 99, camX: renderer.cam.x, camY: renderer.cam.y };
  }
}

canvas.addEventListener('pointercancel', liftPointer);

// A pointer whose release we never see would leave the map thinking a finger
// is still down, and taps would stop working entirely. Losing focus is the way
// that actually happens, so that's where it gets cleaned up.
window.addEventListener('blur', () => {
  pointers.clear();
  pinch = null;
  drag = null;
  gestured = false;
});

canvas.addEventListener('pointerup', (e) => {
  const wasDrag = (drag && drag.moved > 4) || gestured;
  liftPointer(e);
  if (pointers.size) return;          // still touching — not a tap yet
  const { x: sx, y: sy } = local(e);
  drag = null;
  if (wasDrag) { gestured = false; return; }
  if (botTurn()) return;              // hands off while the computer is playing

  // An interior takes over the whole interaction while it's open.
  if (game.interior) {
    const c = renderer.interiorCellAt(game, sx, sy);
    if (!c) return;
    if (game.phase === 'interior-place') game.interiorPlaceAt(c.x, c.y);
    else if (game.phase === 'interior-move') game.interiorMoveTo(c.x, c.y);
    return;
  }

  if (game.phase === 'meeple') {
    const hit = renderer.hitMeepleSpot(sx, sy);
    if (hit) game.placeMeeple(hit.i, hit);
    return;
  }
  if (game.phase === 'move') {
    const pawn = renderer.hitPawn(sx, sy);
    if (pawn && game.selectPawn(pawn)) return;
  }

  const c = renderer.cellAt(sx, sy);

  // With the confirm step on, a tap on the board STAGES rather than plays:
  // tapping the staged square again TURNS it, tapping elsewhere moves it, and
  // the only thing that commits it is the checkmark. A tap used to be the
  // commit, which meant the one gesture you reach for to see the tile the
  // other way round was also the gesture that ended your decision.
  if (confirming()) {
    if (pending && pending.x === c.x && pending.y === c.y) {
      if (pending.rots.length > 1) turnPending(1); else sfx.play('deny');
      return;
    }
    if (stagePending(c.x, c.y)) return;
    if (!game.board.get(c.x, c.y) && nearBoard(c)) {
      sfx.play('deny');
      fx.on('deny', { at: { x: c.x + 0.5, y: c.y + 0.5 } }, game);
    }
    return;
  }

  const acted = game.cellClick(c.x, c.y);
  if (!acted && game.phase === 'place' && !game.board.get(c.x, c.y) && nearBoard(c)) {
    sfx.play('deny');
    fx.on('deny', { at: { x: c.x + 0.5, y: c.y + 0.5 } }, game);
  }
});

// Safari has its own pinch, outside the pointer events: a two-finger pinch (or
// a trackpad pinch on a Mac) fires `gesture*` and zooms the PAGE, which fights
// the board's own zoom and leaves the whole app scaled up. The board and the
// overlays run their gestures themselves, so refuse Safari's over the stage and
// let the pointer handlers do the work. Unknown everywhere else, and ignored.
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  $('stage').addEventListener(type, (e) => e.preventDefault(), { passive: false });
}

// Belt and braces for the tap-tap-zoom: `touch-action: manipulation` in the
// stylesheet is what actually stops it, but a double click on a button (fast
// mouse, or a stylus) has no meaning here either, so swallow it.
document.addEventListener('dblclick', (e) => {
  if (e.target.closest('button, label, select, #panel')) e.preventDefault();
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (botTurn()) return;
  if (pending) turnPending(1); else game.rotate(1);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) {
    if (botTurn()) return;
    if (pending) turnPending(e.deltaY > 0 ? 1 : -1); else game.rotate(e.deltaY > 0 ? 1 : -1);
    return;
  }
  if (game.interior) return;
  renderer.glide = null;
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  // Tab folds the panel from anywhere — it is the one key that is about the
  // window rather than the game.
  if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey) { e.preventDefault(); return void setLean(!lean); }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  // The two view keys still work while the computer plays; nothing else does.
  if (e.key === 'd' || e.key === 'D') { renderer.showDebug = !renderer.showDebug; $('debug').checked = renderer.showDebug; }
  if (e.key === 'c' || e.key === 'C') {
    if (game.lastPlaced) renderer.centerOn(game.lastPlaced.x, game.lastPlaced.y);
  }
  if (botTurn()) return;
  if (e.key === 'Enter' && pending) { e.preventDefault(); return void commitPending(); }
  if (e.key === 'Escape' && pending) { e.preventDefault(); return void clearPending(); }
  if (e.key === 'r' || e.key === 'R') {
    if (pending) turnPending(e.shiftKey ? -1 : 1);
    else game.rotate(e.shiftKey ? -1 : 1);
  }
  if (e.key === 'f' || e.key === 'F') game.flipTile();
  if (e.key === ' ') {
    e.preventDefault();
    if (game.phase === 'meeple') game.skipMeeple();
    else if (game.phase === 'move') game.holdPosition();
    else if (game.phase === 'walk') game.declineWalk();
    else if (game.phase === 'interior-move') game.interiorHold();
  }
  if (e.key === 'e' || e.key === 'E') game.enterCity();
  if (e.key === 'l' || e.key === 'L') game.beginLift();
  // Each special follower answers to its own letter.
  for (const f of game.figuresAvailable?.() || []) {
    if (e.key.toLowerCase() === f.key.toLowerCase()) game.useFigure(f.id);
  }
  if (e.key >= '1' && e.key <= '9' && game.phase === 'market') {
    game.takeFromMarket(Number(e.key) - 1);
  }
  if (e.key >= '1' && e.key <= '9' && game.phase === 'meeple' && claimSpots.length) {
    const spot = claimSpots[Number(e.key) - 1];
    if (spot) game.placeMeeple(spot.i, spot);
  }
});

window.addEventListener('resize', () => renderer.resize());

// --- controls ---------------------------------------------------------------

for (const s of MODES) {
  $('mode').insertAdjacentHTML('beforeend', `<option value="${s.id}">${s.name}</option>`);
}

for (const l of BOT_LEVELS) {
  $('botSkill').insertAdjacentHTML('beforeend', `<option value="${l.id}">${l.name}</option>`);
}
$('botSkill').value = 'steady';

$('newGame').onclick = newGame;
$('mode').onchange = onModeChange;
$('useMeeples').onchange = (e) => { setMechanic('meeple', e.target.checked); onModeChange(); };
$('playerCount').onchange = () => { renderBotSeats(); buildBots(); };
$('botCount').onchange = (e) => { botSeats = Number(e.target.value) || 0; buildBots(); };
$('botSkill').onchange = buildBots;
$('freePlace').onchange = (e) => { game.free = e.target.checked; };
$('debug').onchange = (e) => { renderer.showDebug = e.target.checked; };
$('forceTile').onchange = (e) => {
  game.forcedNext = e.target.value || null;
  if (game.forcedNext && game.phase === 'place' && game.tile) {
    game.deck.push(game.tile.id);
    game.drawTile();
  }
};

for (const t of TILE_TYPES) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = `${t.id} — ${t.name}`;
  $('forceTile').appendChild(o);
}

// --- the workshop -----------------------------------------------------------
//
// One panel, every rule the catalogue knows about, in the order they stack:
// the base layer first, then the boxes that bolt onto it. Rules the engine
// doesn't implement yet are still listed — greyed, with a dot that says so —
// because a catalogue that hides its gaps is worse than one that admits them.
//
// Nothing here knows what any individual rule DOES. It renders src/mechanics.js
// and writes back into `mechanics`, so a new rule is a new entry in that file
// and nothing else.

for (const r of RULESETS) {
  $('ruleset').insertAdjacentHTML('beforeend', `<option value="${r.id}">${r.name}</option>`);
}
$('ruleset').value = ruleset;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Rows matching what's in the search box: name, note, or the box it came out
 * of — and the id as well, so that typing an exact rule key finds exactly the
 * one row, which is what the browser test relies on.
 */
function matches(m, q) {
  if (!q) return true;
  return `${m.id} ${m.name} ${m.note} ${m.pack || ''}`.toLowerCase().includes(q);
}

/**
 * A rule you can't have yet, and why. The engine gates on nothing here — this
 * is the panel refusing to let you tick "pig" when there are no fields for it
 * to stand in, which is a better answer than a switch that silently does
 * nothing.
 */
function blockedBy(m) {
  if (m.status === 'planned') return 'not built yet';
  const missing = missingNeeds(m.id, mechanics);
  if (!missing.length) return null;
  return `needs ${missing.map((n) => (MECHANIC_BY_ID[n]?.name || n).toLowerCase()).join(' + ')}`;
}

function renderMechanics() {
  const q = $('mechSearch').value.trim().toLowerCase();
  const host = $('mechanics');
  const open = new Set(
    [...host.querySelectorAll('details[open]')].map((d) => d.dataset.layer),
  );
  // First paint, and every search: the base layer stands open, the rest fold
  // away. Seventy rules unfolded is a wall, not a panel.
  if (!host.dataset.painted) open.add('base');

  host.innerHTML = MECHANIC_GROUPS.map((layer) => {
    const items = MECHANICS.filter((m) => m.layer === layer.id && matches(m, q));
    if (!items.length) return '';
    const live = items.filter((m) => mechanics[m.id]).length;

    // Sub-headings are the box a rule came out of, printed once per run.
    let pack = null;
    const rows = items.map((m) => {
      const head = m.pack && m.pack !== pack ? `<h4>${esc(m.pack)}</h4>` : '';
      pack = m.pack;
      const why = blockedBy(m);
      const on = !!mechanics[m.id];
      const title = esc(m.note) + (why ? ` — ${esc(why)}` : '');
      return `${head}<label class="mech ${why ? 'off' : ''}" title="${title}">
        <input type="checkbox" data-mech="${m.id}" ${on ? 'checked' : ''} ${why ? 'disabled' : ''} />
        <span class="dot ${m.status}"></span>
        <span class="mech-name">${esc(m.name)}</span>
        ${m.wiki ? `<a class="mech-doc" href="${m.wiki}" target="_blank" rel="noreferrer"
            title="The real rule, on WikiCarpedia">?</a>` : ''}
      </label>`;
    }).join('');

    const isOpen = q || open.has(layer.id);
    return `<details data-layer="${layer.id}" ${isOpen ? 'open' : ''}>
      <summary>${esc(layer.name)}
        <span class="dim">${live ? `${live} on · ` : ''}${items.length}</span>
      </summary>
      <p class="hint">${esc(layer.note)}</p>
      ${rows}
    </details>`;
  }).join('') || '<p class="hint">Nothing matches that.</p>';

  host.dataset.painted = '1';

  for (const el of host.querySelectorAll('input[data-mech]')) {
    el.onchange = (e) => setMechanic(e.target.dataset.mech, e.target.checked);
  }
  updateMechCount();
}

/**
 * Flip one rule. A base-layer rule is stored as an explicit false when it's
 * off, because "absent" already means "on" everywhere else — see Game.has().
 */
function setMechanic(id, on) {
  const m = MECHANIC_BY_ID[id];
  if (!m) return;
  if (m.on) mechanics[id] = on; else if (on) mechanics[id] = true; else delete mechanics[id];

  // Anything that depended on what just went off has to go off too, or you
  // end up with a cathedral in a game with no cities.
  if (!on) {
    for (const other of MECHANICS) {
      if (mechanics[other.id] && (other.needs || []).includes(id)) setMechanic(other.id, false);
    }
  }
  // Followers have a second switch of their own up in Game; keep them level.
  if (id === 'meeple') $('useMeeples').checked = on;
  // Fog is pure rendering, so it can take effect without a new game.
  if (id === 'fog' && game) game.options.fog = !!mechanics.fog;
  if (m.groups?.length) renderGroups();
  renderMechanics();
}

function updateMechCount() {
  const on = MECHANICS.filter((m) => mechanics[m.id]).length;
  const bolted = MECHANICS.filter((m) => mechanics[m.id] && !m.on).length;
  $('mechCount').textContent = `${on} on · ${bolted} bolted`;
  $('mechCount').title = `${MECHANICS.length} rules catalogued, `
    + `${LIVE_MECHANICS.length} of them implemented.`;
}

function setRuleset(id) {
  ruleset = id;
  const r = RULESET_BY_ID[id];
  $('rulesetHint').textContent = r ? r.note : '';
}

$('mechSearch').oninput = renderMechanics;
$('ruleset').onchange = (e) => setRuleset(e.target.value);
$('mechReset').onclick = () => { mechanics = defaultMechanics(); renderMechanics(); };
$('mechClear').onclick = () => { mechanics = Object.fromEntries(
  MECHANICS.filter((m) => m.on).map((m) => [m.id, false])); renderMechanics(); };
$('mechAll').onclick = () => {
  mechanics = defaultMechanics();
  // In catalogue order, so a rule's prerequisites are already on when it's
  // reached and nothing gets refused for a dependency that comes later.
  for (const m of LIVE_MECHANICS) if (!m.on && !blockedBy(m)) mechanics[m.id] = true;
  renderMechanics();
};

$('hints').onchange = (e) => { renderer.showHints = e.target.checked; };
$('confirmPlace').onchange = () => { if (pending) clearPending(); else syncPanel(); };
$('zoomClaim').onchange = () => syncPanel();
$('effects').checked = !stillness;
$('effects').onchange = (e) => {
  fx.enabled = e.target.checked;
  if (!fx.enabled) fx.clear();
};

// --- sound controls ---------------------------------------------------------

$('sound').onchange = (e) => {
  sfx.enabled = e.target.checked;
  if (sfx.enabled) sfx.play('meeple');   // confirm it's back on
};
$('volume').oninput = (e) => { sfx.setVolume(Number(e.target.value)); };
for (const name of SOUND_NAMES) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  $('testSound').appendChild(o);
}
$('testSound').onchange = (e) => { if (e.target.value) sfx.play(e.target.value); };
$('testSound').onclick = (e) => { if (e.target.value) sfx.play(e.target.value); };

function renderGroups() {
  for (const g of groupsFor(mechanics)) enabledGroups.add(g);
  $('groups').innerHTML = GROUPS.map((g) => `
    <label title="${g.note}">
      <input type="checkbox" data-group="${g.id}" ${enabledGroups.has(g.id) ? 'checked' : ''} />
      ${g.name}
    </label>`).join('');
  for (const el of $('groups').querySelectorAll('input[data-group]')) {
    el.onchange = (e) => {
      const id = e.target.dataset.group;
      if (e.target.checked) enabledGroups.add(id); else enabledGroups.delete(id);
    };
  }
}

// --- remembering how you like to play ----------------------------------------
//
// Seventy-nine rules, a tile pool, an edition and a dozen preferences is a lot
// to set up, and losing it to a refresh is the kind of small insult that stops
// people experimenting. All of it is written to localStorage on change and
// restored on boot. Wrapped in try/catch because a private window throws on
// the accessor itself, and a game that won't start because it couldn't save a
// checkbox is worse than one that forgets.

const SAVE_KEY = 'tilemakers-workshop/settings';
const SAVED_FIELDS = [
  'mode', 'playerCount', 'botCount', 'botSkill', 'botSpeed', 'tilesPerTurn',
  'ruleset', 'useMeeples', 'effects', 'sound', 'volume', 'hints', 'freePlace',
  'confirmPlace', 'zoomClaim',
];

function saveSettings() {
  try {
    const fields = {};
    for (const id of SAVED_FIELDS) {
      const el = $(id);
      if (el) fields[id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      fields, mechanics, groups: [...enabledGroups], lean,
    }));
  } catch { /* private window, or storage off: play on regardless */ }
}

function loadSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch { /* ignore */ }
  if (!saved) return false;
  for (const [id, v] of Object.entries(saved.fields || {})) {
    const el = $(id);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
  }
  if (saved.mechanics) mechanics = { ...saved.mechanics };
  if (saved.groups?.length) enabledGroups = new Set(saved.groups);
  ruleset = $('ruleset').value || DEFAULT_RULESET;
  if (saved.lean) setLean(true);
  return true;
}

// Any change to any of them is worth remembering; one listener covers the lot.
document.addEventListener('change', saveSettings);

// --- dragging a tile out of the hand ----------------------------------------
//
// The preview is the tile you are holding, so the most direct thing you can do
// with it is pick it up and put it down. A drag that starts on either preview
// (the panel's or the HUD's) turns into the ordinary hover ghost the moment it
// crosses the board, and drops into the same staging step a tap would.

function beginTileDrag(e) {
  if (botTurn() || game.phase !== 'place' || (!game.tile && !game.m.piece)) return;
  dragging = { id: e.pointerId };
  try { e.target.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
  e.preventDefault();
}

function dragTo(e) {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  const inside = e.clientX >= r.left && e.clientX <= r.right
    && e.clientY >= r.top && e.clientY <= r.bottom;
  renderer.hover = inside ? renderer.cellAt(e.clientX - r.left, e.clientY - r.top) : null;
  renderer.pointer = inside ? { sx: e.clientX - r.left, sy: e.clientY - r.top } : null;
}

function dropTile(e) {
  if (!dragging) return;
  const drop = renderer.hover;
  dragging = null;
  renderer.hover = null;
  if (!drop) return;
  if (confirming()) { stagePending(drop.x, drop.y); return; }
  const saved = game.rot;
  const rots = legalRotationsAt(drop.x, drop.y);
  if (rots.length && !rots.includes(saved)) game.rot = rots[0];
  if (!game.cellClick(drop.x, drop.y)) {
    game.rot = saved;
    sfx.play('deny');
    fx.on('deny', { at: { x: drop.x + 0.5, y: drop.y + 0.5 } }, game);
  }
}

for (const id of ['preview', 'hudTile']) {
  const el = $(id);
  el.addEventListener('pointerdown', beginTileDrag);
  el.addEventListener('pointermove', dragTo);
  el.addEventListener('pointerup', dropTile);
  el.addEventListener('pointercancel', () => { dragging = null; renderer.hover = null; });
}
// The pointer leaves the little canvas almost immediately, so the move and up
// that matter arrive on the window.
window.addEventListener('pointermove', dragTo);
window.addEventListener('pointerup', dropTile);

// --- folding the panel away --------------------------------------------------

let lean = false;
function setLean(on) {
  lean = on;
  document.body.classList.toggle('lean', lean);
  $('hud').hidden = !lean;
  renderer.resize();
  syncPanel();
}
$('lean').onclick = () => setLean(true);
$('hudExpand').onclick = () => setLean(false);

// --- the box in the corner ----------------------------------------------------
//
// One panel, two jobs, and they are consecutive halves of the same turn: first
// "is this where the tile goes?", then "what do you take on it?". Both are
// decisions about a single tile, both want that tile drawn big enough to read,
// and both are answered by touching the same corner of the screen — so they
// share the box rather than each having one.

const claimCtx = $('claimTile').getContext('2d');
let claimSpots = [];

/** The options that live on the tile just laid — the ones this panel can show. */
function claimOptions() {
  if (game.phase !== 'meeple' || !game.lastPlaced) return [];
  const { x, y } = game.lastPlaced;
  return game.meepleOptions().filter((o) => o.x === x && o.y === y);
}

function renderClaim() {
  if (pending && !botTurn()) return renderConfirm();
  const host = $('claim');
  const opts = $('zoomClaim').checked ? claimOptions() : [];
  if (!opts.length || botTurn()) {
    host.hidden = true;
    claimSpots = [];
    renderer.hideMeepleTargets = false;
    return;
  }
  host.hidden = false;
  renderer.hideMeepleTargets = true;

  const cell = game.board.get(game.lastPlaced.x, game.lastPlaced.y);
  const size = $('claimTile').width;
  claimCtx.clearRect(0, 0, size, size);
  claimCtx.save();
  claimCtx.translate(size / 2, size / 2);
  claimCtx.rotate(cell.rot * Math.PI / 2);
  claimCtx.translate(-size / 2, -size / 2);
  claimCtx.scale(size, size);
  drawTile(claimCtx, cell.type, { rot: cell.rot });
  claimCtx.restore();
  inkUp(claimCtx.canvas);

  // The dots start where the follower itself would stand, turned with the tile.
  // A busy tile — a four-way road with its four fields — puts several anchors
  // within a few pixels of each other, so they are then pushed apart until
  // each is its own target, and any that moved gets a leader back to the spot
  // it actually means.
  const r = size * 0.105;
  claimSpots = opts.map((o) => {
    const anchor = cell.type.spots[o.i] || [0.5, 0.5];
    const [px, py] = rotPoint(anchor, cell.rot);
    return { ...o, ax: px * size, ay: py * size, sx: px * size, sy: py * size, r };
  });
  for (let pass = 0; pass < 60; pass++) {
    let moved = false;
    for (let a = 0; a < claimSpots.length; a++) {
      for (let b = a + 1; b < claimSpots.length; b++) {
        const A = claimSpots[a], B = claimSpots[b];
        let dx = B.sx - A.sx, dy = B.sy - A.sy;
        let d = Math.hypot(dx, dy);
        if (d > r * 2.25) continue;
        if (d < 0.01) { dx = (a - b) || 1; dy = 1; d = Math.hypot(dx, dy); }
        const push = (r * 2.25 - d) / 2;
        const ux = dx / d * push, uy = dy / d * push;
        A.sx -= ux; A.sy -= uy; B.sx += ux; B.sy += uy;
        moved = true;
      }
    }
    // Keep them all on the tile.
    for (const sp of claimSpots) {
      sp.sx = Math.max(r * 1.1, Math.min(size - r * 1.1, sp.sx));
      sp.sy = Math.max(r * 1.1, Math.min(size - r * 1.1, sp.sy));
    }
    if (!moved) break;
  }

  const colour = PLAYER_COLORS[game.current];
  for (const spot of claimSpots) {
    if (Math.hypot(spot.sx - spot.ax, spot.sy - spot.ay) < 3) continue;
    claimCtx.beginPath();
    claimCtx.moveTo(spot.ax, spot.ay);
    claimCtx.lineTo(spot.sx, spot.sy);
    claimCtx.strokeStyle = 'rgba(232,222,208,0.5)';
    claimCtx.lineWidth = 1.5;
    claimCtx.stroke();
    claimCtx.beginPath();
    claimCtx.arc(spot.ax, spot.ay, 2.5, 0, Math.PI * 2);
    claimCtx.fillStyle = 'rgba(232,222,208,0.7)';
    claimCtx.fill();
  }

  for (const spot of claimSpots) {
    claimCtx.beginPath();
    claimCtx.arc(spot.sx, spot.sy, spot.r, 0, Math.PI * 2);
    claimCtx.fillStyle = 'rgba(18,14,26,0.55)';
    claimCtx.fill();
    claimCtx.lineWidth = 3;
    claimCtx.strokeStyle = colour;
    claimCtx.stroke();
    drawMeeple(claimCtx, spot.sx, spot.sy, spot.r * 1.5, colour,
      { farmer: spot.f.type === 'field' });
  }

  // A number on each spot, because the keyboard should reach them too.
  claimSpots.forEach((spot, i) => {
    claimCtx.beginPath();
    claimCtx.arc(spot.sx + spot.r * 0.85, spot.sy - spot.r * 0.85, spot.r * 0.52, 0, Math.PI * 2);
    claimCtx.fillStyle = 'rgba(18,14,26,0.85)';
    claimCtx.fill();
    claimCtx.strokeStyle = 'rgba(212,175,95,0.7)';
    claimCtx.lineWidth = 1.2;
    claimCtx.stroke();
    claimCtx.fillStyle = '#e8ded0';
    claimCtx.font = `600 ${Math.round(spot.r * 0.8)}px ui-sans-serif`;
    claimCtx.textAlign = 'center';
    claimCtx.textBaseline = 'middle';
    claimCtx.fillText(String(i + 1), spot.sx + spot.r * 0.85, spot.sy - spot.r * 0.85);
  });

  $('claimWho').textContent = `${game.player.name} — claim a feature`;
  $('claim').classList.remove('confirming');
}

/**
 * The confirm half. A staged tile is drawn here at the rotation it is actually
 * going down at, and the checkmark under it is the ONE thing that puts it on
 * the board — on the board itself a tap only turns it. Shown whenever
 * something is staged, whether or not the zoomed claim step is switched on:
 * with the tap no longer committing, hiding this would leave a touch screen
 * with no way to say yes at all.
 */
function renderConfirm() {
  const host = $('claim');
  const cur = currentTile();
  if (!cur || !cur.type) { host.hidden = true; return; }
  host.hidden = false;
  claimSpots = [];
  renderer.hideMeepleTargets = false;

  const size = $('claimTile').width;
  claimCtx.clearRect(0, 0, size, size);
  claimCtx.save();
  claimCtx.translate(size / 2, size / 2);
  claimCtx.rotate(pending.rot * Math.PI / 2);
  claimCtx.translate(-size / 2, -size / 2);
  claimCtx.scale(size, size);
  drawTile(claimCtx, cur.type, { terrain: cur.terrain, rot: pending.rot });
  inkUp(claimCtx.canvas);
  claimCtx.restore();

  claimCtx.save();
  claimCtx.strokeStyle = 'rgba(212,175,95,0.8)';
  claimCtx.lineWidth = 3;
  claimCtx.strokeRect(1.5, 1.5, size - 3, size - 3);
  claimCtx.restore();

  $('claimWho').textContent = `${game.player.name} — place it here?`;
  $('claim').classList.add('confirming');
}

$('claimTile').addEventListener('pointermove', (e) => {
  if (pending) {
    $('claimTile').title = pending.rots.length > 1 ? 'Turn it' : '';
    $('claimTile').style.cursor = pending.rots.length > 1 ? 'pointer' : 'default';
    return;
  }
  const hit = claimHit(e);
  $('claimTile').title = hit ? `Claim the ${hit.f.type}` : '';
  $('claimTile').style.cursor = hit ? 'pointer' : 'default';
});

function claimHit(e) {
  const r = $('claimTile').getBoundingClientRect();
  const scale = $('claimTile').width / r.width;
  const px = (e.clientX - r.left) * scale;
  const py = (e.clientY - r.top) * scale;
  return claimSpots.find((sp) => Math.hypot(px - sp.sx, py - sp.sy) <= sp.r * 1.4);
}

$('claimTile').addEventListener('pointerdown', (e) => {
  // The big tile turns when you touch it, exactly as the staged one on the
  // board does — the same gesture in both places, and neither of them commits.
  if (pending) { if (pending.rots.length > 1) turnPending(1); return; }
  const hit = claimHit(e);
  if (hit) game.placeMeeple(hit.i, hit);
});

// --- side panel -------------------------------------------------------------

const previewCtx = $('preview').getContext('2d');

function currentTile() {
  const inv = game.interior;
  if (inv && game.phase === 'interior-place') return { type: inv.tile, rot: inv.rot, terrain: inv.kind };
  if (game.m.piece) return { piece: game.m.piece };
  if (game.tile) return { type: game.tile, rot: game.rot, terrain: 'surface' };
  // Between laying a tile and claiming on it your hand is empty, which left
  // the preview a black square during the one step you most want to look at
  // the tile. Show what you just laid instead.
  if (game.lastPlaced) {
    const c = game.board.get(game.lastPlaced.x, game.lastPlaced.y);
    if (c) return { type: c.type, rot: c.rot, terrain: 'surface', laid: true };
  }
  return null;
}

/** The held tile, or the whole piece scaled to fit the same square. */
function drawPreview() {
  const c = previewCtx;
  const size = $('preview').width;
  c.clearRect(0, 0, size, size);
  const cur = currentTile();
  if (!cur) return;

  if (cur.piece) {
    const p = cur.piece;
    const scale = size / Math.max(p.w, p.h);
    const ox = (size - p.w * scale) / 2, oy = (size - p.h * scale) / 2;
    for (const cell of p.cells) {
      c.save();
      c.translate(ox + cell.dx * scale, oy + cell.dy * scale);
      c.scale(scale, scale);
      c.translate(0.5, 0.5);
      c.rotate((cell.rot & 3) * Math.PI / 2);
      c.translate(-0.5, -0.5);
      drawTile(c, cell.type, { rot: cell.rot });
      c.restore();
    }
    inkUp(c.canvas);
    return;
  }

  if (!cur.type) return;
  c.save();
  c.translate(size / 2, size / 2);
  c.rotate(cur.rot * Math.PI / 2);
  c.translate(-size / 2, -size / 2);
  c.scale(size, size);
  drawTile(c, cur.type, { terrain: cur.terrain, rot: cur.rot });
  c.restore();
  inkUp(c.canvas);
}

/**
 * The previews draw tiles straight through art.js rather than the sprite
 * cache, so they get the hand-drawn line applied here — only on the chart,
 * and only when a preview is redrawn, which is on events rather than frames.
 */
function inkUp(canvas) {
  if (document.body.classList.contains('parchment')) roughen(canvas);
}

const PHASE_TEXT = {
  place: 'Place the tile — R rotates',
  market: 'Choose a tile',
  lift: 'Click a tile to lift it',
  recall: 'Click one of your followers to call it home',
  walk: 'Walk the follower on, or send it home',
  meeple: 'Claim a feature, or skip',
  move: 'Move — click a figure, then a target',
  story: 'Say what is there',
  boon: 'Choose a boon',
  magic: 'Place the figure — click an unfinished road or city',
  crop: 'A crop circle — choose what everyone does',
  rob: 'Post your robber on an opponent',
  balena: 'Send the Balena — click any tile on the board',
  flight: 'Click one of your followers on the flight to pick it up',
  stroll: 'Walk the follower on down the road, or send it home',
  flat: 'Click one of your followers in a city to lay it flat',
  'interior-place': 'Lay the next piece',
  'interior-move': 'Move, or hold',
  over: 'Game over',
};

/** The face-up row, when a mode or the market modifier is offering a choice. */
function renderMarket() {
  const host = $('market');
  if (game.phase !== 'market' || !game.market || !game.market.length) {
    host.innerHTML = '';
    host.style.display = 'none';
    return;
  }
  host.style.display = '';
  const discards = game.spec.marketDiscards !== false;
  host.innerHTML = `<h2>${discards ? 'Market' : 'Your hand'}</h2><div class="row-tiles"></div>
    <p class="hint">${discards
      ? 'The first is free. Reaching past a tile discards it.'
      : 'Take any of them.'}</p>`;
  const row = host.querySelector('.row-tiles');

  game.market.forEach((id, i) => {
    const wrap = document.createElement('button');
    wrap.className = 'tileBtn';
    wrap.title = `${id} — ${TILES[id].name}`;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 56;
    const ctx = cv.getContext('2d');
    ctx.scale(56, 56);
    drawTile(ctx, TILES[id]);
    inkUp(cv);
    wrap.appendChild(cv);
    wrap.insertAdjacentHTML('beforeend', `<kbd>${i + 1}</kbd>`);
    wrap.onclick = () => game.takeFromMarket(i);
    row.appendChild(wrap);
  });
}

/** Contextual buttons — what you can actually do right now, mode included. */
function renderActions() {
  if (botTurn()) {
    $('actions').innerHTML = `<span class="dim" style="font-size:11px">${game.player.name} is thinking…</span>`;
    return;
  }
  const btns = [];
  const add = (label, key, fn, disabled = false, wide = false, tone = '') =>
    btns.push({ label, key, fn, disabled, wide, tone });

  // A staged tile owns the turn until it is committed or taken back — and the
  // checkmark is the only thing on screen that commits it, so it is drawn as
  // the one obvious answer rather than as the first of three buttons.
  if (pending) {
    add('✓ Place it here', 'Enter', () => commitPending(), false, true, 'check');
    if (pending.rots.length > 1) {
      add(`⟳ Turn it (${pending.rots.length} ways fit)`, 'R', () => turnPending(1));
    }
    add('✕ Put it back', 'Esc', () => clearPending());
    const host = $('actions');
    host.innerHTML = '';
    for (const b of btns) {
      const el = document.createElement('button');
      el.className = [b.wide ? 'wide' : '', b.tone || ''].filter(Boolean).join(' ');
      el.innerHTML = `${b.label}${b.key ? ` <kbd>${b.key}</kbd>` : ''}`;
      el.onclick = b.fn;
      host.appendChild(el);
    }
    mirrorActions(btns);
    return;
  }

  if (game.phase === 'place' || game.phase === 'interior-place') add('Rotate', 'R', () => game.rotate(1));
  if (game.canFlip()) add('Flip it over', 'F', () => game.flipTile());
  if (game.canPlayAbbey()) add(`Play your abbey (${game.player.abbeys})`, '', () => game.playAbbey());
  if (game.canLiftNow()) add('Lift a placed tile', 'L', () => game.beginLift());
  if (game.phase === 'lift') add('Cancel lift', '', () => game.cancelLift());
  if (game.phase === 'meeple') {
    add(game.usingPhantom ? 'Skip the phantom' : 'Skip meeple', 'Space', () => game.skipMeeple());
    // One button per special follower this player still has in hand. The
    // phantom is its own second placement, so it isn't offered as a choice.
    if (!game.usingPhantom) {
      for (const f of game.figuresAvailable()) {
        add(game.useKind === f.id ? f.using : f.label, f.key, () => game.useFigure(f.id));
      }
    }
    if (game.canRetireAbbot()) add('Call the abbot home', '', () => game.retireAbbot());
    if (game.canSendKnightHome()) add('Send a knight home (princess)', '', () => game.sendKnightHome());
    if (game.canCallHome()) add('Festival — take one back', '', () => game.beginFestival());
    if (game.canPlacePig()) add('Turn out the pig', '', () => game.placePig());
    if (game.canPlaceBuilding()) add('Raise a little building', '', () => { game.placeBuilding(); syncPanel(); });
    if (game.shepherdExtended?.()) {
      add('Grow the flock', '', () => game.growFlock());
      add('Herd the flock home', '', () => game.herdFlock());
    }
    if (game.canPlaceBarn?.()) add('Raise a barn on the farm', '', () => game.placeBarn());
    if (game.canJoinPyramid?.()) add('Join the acrobats', '', () => game.joinPyramid());
    if (game.canBathe?.()) add('Send a follower to the baths', '', () => game.bathe());
    if (game.canCallFairy?.()) add('Call the fairy to a follower', '', () => game.callFairy());
    if (game.canBuildTower?.()) add(`Build a tower floor (${game.player.floors})`, '', () => game.buildTower());
    if (game.canBuildBridge?.()) add(`Build a bridge (${game.player.bridges})`, '', () => { game.buildBridge(); syncPanel(); });
    if (game.canRecall()) add('Recall a follower', '', () => game.beginRecall());
  }
  if (game.phase === 'walk') add('Send it home instead', 'Space', () => game.declineWalk());
  if (game.phase === 'magic') {
    add(game.magicPick === 'mage' ? 'Placing the MAGE' : 'Place the mage', '', () => game.pickMagic('mage'));
    add(game.magicPick === 'witch' ? 'Placing the WITCH' : 'Place the witch', '', () => game.pickMagic('witch'));
    add('Set the figure aside', '', () => game.magicSkip());
  }
  if (game.phase === 'rob') {
    game.players.forEach((p, i) => {
      if (i !== game.current) add(`Rob ${p.name}`, '', () => game.robPlace(i));
    });
    add('Keep the robber home', '', () => game.robSkip());
  }
  if (game.phase === 'crop') {
    add('Everyone adds a follower', '', () => game.cropChoose('add'), false, true);
    add('Everyone takes one back', '', () => game.cropChoose('remove'), false, true);
  }
  if (game.phase === 'move') {
    add('Hold position', 'Space', () => game.holdPosition());
  }
  if (game.phase === 'interior-move') {
    add('Hold', 'Space', () => game.interiorHold());
    if (game.canLeaveInterior()) {
      add(game.interior.kind === 'city' ? 'Leave the city' : 'Leave the cave', '', () => game.leaveInterior());
    }
  }
  for (const a of game.m.actions()) {
    add(a.label, a.key || '', () => a.fn(game), !!a.disabled, !!a.wide);
  }

  const host = $('actions');
  host.innerHTML = '';
  for (const b of btns) {
    const el = document.createElement('button');
    el.className = [b.wide ? 'wide' : '', b.tone || ''].filter(Boolean).join(' ');
    el.innerHTML = `${b.label}${b.key ? ` <kbd>${b.key}</kbd>` : ''}`;
    el.disabled = b.disabled;
    el.onclick = b.fn;
    host.appendChild(el);
  }
  if (!btns.length) host.innerHTML = '<span class="dim" style="font-size:11px">—</span>';
  mirrorActions(btns);
}

/**
 * The same buttons, again, in the HUD and on the claim panel. They are built
 * once and rendered wherever they are needed, so a rule that adds a button
 * never has to know how many places show it.
 */
function mirrorActions(btns) {
  for (const [id, list] of [['hudActions', btns], ['claimActions', btns]]) {
    const el = $(id);
    if (!el) continue;
    el.innerHTML = '';
    // The claim panel already IS the claim, so it only carries the verbs.
    const wanted = id === 'claimActions'
      ? list.filter((b) => !/^Rotate$/.test(b.label))
      : list;
    for (const b of wanted) {
      const btn = document.createElement('button');
      btn.className = [b.wide ? 'wide' : '', b.tone || ''].filter(Boolean).join(' ');
      btn.innerHTML = `${b.label}${b.key ? ` <kbd>${b.key}</kbd>` : ''}`;
      btn.disabled = b.disabled;
      btn.onclick = b.fn;
      el.appendChild(btn);
    }
  }
}

function scoreRow(p, i) {
  const active = i === game.current && game.phase !== 'over';
  const extra = (bots.has(i) ? '<span class="dim">cpu</span> ' : '') + (game.useMeeples
    ? '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(7 - p.meeples)}</span>`
    : '');
  const agendas = (p.agendas || []).map((a) => `<div class="quest"><span>◆ ${a.text}</span><span class="dim">${a.points}</span></div>`).join('');
  return `
    <div class="player ${active ? 'active' : ''}">
      <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
      <span class="pname">${p.name}</span>
      <span class="pmeta">${extra}</span>
      <span class="pscore">${p.score}</span>
    </div>${active && agendas ? agendas : ''}`;
}

function syncPanel() {
  const custom = game.m.panel();
  $('scores').innerHTML = custom != null ? custom : game.players.map(scoreRow).join('');
  $('lead').innerHTML = game.m.lead ? game.m.lead() : '';

  // The Chronicle's free-text box is re-created on every panel render, so wire
  // it up here rather than once at startup.
  const own = $('ownLine');
  if (own) {
    own.onkeydown = (e) => {
      if (e.key !== 'Enter' || !own.value.trim()) return;
      game.m.writeOwn(own.value.trim());
    };
  }

  $('deckCount').textContent = game.interior ? game.interior.deck.length : game.deck.length;
  const cur = currentTile();
  $('tileName').textContent = cur
    ? (cur.piece ? `${cur.piece.name} · ${cur.piece.cells.length} cells`
      : cur.type ? `${cur.type.id} · ${cur.type.name}` : '—')
    : '—';
  const status = game.m.status();
  const doing = botTurn() ? `${game.player.name} is playing` : (PHASE_TEXT[game.phase] || '—');
  $('phase').textContent = doing + (status ? ` · ${status}` : '');
  $('log').innerHTML = game.log.map((l) => `<div class="entry">${l}</div>`).join('');
  $('export').style.display = game.m.toMarkdown ? '' : 'none';
  renderMarket();
  renderActions();
  drawPreview();
  renderHud(doing, status);
  renderClaim();
  bumpScores();
}

/** The HUD carries the turn: what you are holding, what to do, who is winning. */
function renderHud(doing, status) {
  if (!lean) return;
  $('hudPhase').textContent = doing + (status ? ` · ${status}` : '');
  $('hudScores').innerHTML = game.players.map((p, i) => `
    <span class="${i === game.current && game.phase !== 'over' ? 'on' : ''}">
      <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>${p.score}
    </span>`).join('');

  const c = $('hudTile').getContext('2d');
  const size = $('hudTile').width;
  c.clearRect(0, 0, size, size);
  const cur = currentTile();
  if (!cur || !cur.type) return;
  c.save();
  c.translate(size / 2, size / 2);
  c.rotate(cur.rot * Math.PI / 2);
  c.translate(-size / 2, -size / 2);
  c.scale(size, size);
  drawTile(c, cur.type, { terrain: cur.terrain, rot: cur.rot });
  c.restore();
  inkUp(c.canvas);
}

/**
 * Make the number that changed jump. Every mode's panel — the default one and
 * the six that build their own — lays a row out as `.player` with a `.pscore`
 * in it, so this works everywhere without any of them being asked to help.
 *
 * It's the half of "you scored" that the board can't do: The Marches counts
 * levies across the whole map, and there's nowhere on the board to put that
 * number, but there is always a row in the panel.
 */
const BUMP_LIFE = { bump: 640, 'bump-down': 420 };
let shownScores = [];
const bumping = new Map();          // seat -> {kind, at}

function bumpScores() {
  const now = performance.now();
  $('scores').querySelectorAll('.pscore').forEach((el, i) => {
    const score = game.players[i]?.score;
    if (score == null) return;
    const was = shownScores[i];
    if (fx.enabled && was != null && score !== was) {
      bumping.set(i, { kind: score > was ? 'bump' : 'bump-down', at: now });
    }
    const b = bumping.get(i);
    if (!b) return;
    const elapsed = now - b.at;
    if (elapsed >= BUMP_LIFE[b.kind]) { bumping.delete(i); return; }
    // This panel is rebuilt from scratch whenever anything changes, so an
    // animation that began two refreshes ago is *resumed* with a negative
    // delay rather than restarted — otherwise a busy turn stutters it.
    el.style.animationDelay = `-${Math.round(elapsed)}ms`;
    el.classList.add(b.kind);
  });
  shownScores = game.players.map((p) => p.score);
}

$('export').onclick = () => {
  if (!game.m.toMarkdown) return;
  const blob = new Blob([game.m.toMarkdown()], { type: 'text/markdown' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chronicle-${game.seed ?? 'run'}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
};

// --- loop -------------------------------------------------------------------

// The panel redraws whenever a state fingerprint changes, rather than being
// pushed from each handler — so poking at LAB.game from the console stays in
// sync with the UI too.
let lastSig = '';
function signature() {
  const inv = game.interior;
  return [
    game.phase, game.current, game.rot, game.deck.length, game.board.size,
    game.tile ? game.tile.id : '-', game.log.length, game.turn, game.round,
    game.market ? game.market.join('') : '-',
    inv ? `${inv.deck.length}/${inv.rot}/${inv.board.size}/${inv.pos.x},${inv.pos.y}` : '-',
    game.walker ? (game.walker.selected?.id ?? '-') : '-',
    game.m.piece ? game.m.piece.cells.map((c) => `${c.dx}${c.dy}${c.rot}`).join('') : '-',
    pending ? `${pending.x},${pending.y},${pending.rot}` : '-', lean ? 'L' : '-',
    game.tilesLeft, game.useKind || '-', game.usingPhantom ? 'P' : '-',
    game.magicPick, game.mage ? 'M' : '-', game.witch ? 'W' : '-', game.ingots,
    game.dragon ? `${game.dragon.x},${game.dragon.y}` : '-',
    game.fairy ? `${game.fairy.x},${game.fairy.y}` : '-', game.prisoners.length,
    game.usingAbbey ? 'A' : '-', bots.size,
    game.players.map((p) => `${p.big}${p.mayors}${p.abbots}${p.phantoms}${p.pigs}`).join(''),
    game.pendingWalk ? game.pendingWalk.targets.length : '-',
    game.players.map((p) => `${p.score}/${p.meeples}`).join(','),
  ].join('|');
}

/**
 * One frame. The draw is wrapped because a throw inside it used to kill the
 * requestAnimationFrame chain outright, and a dead chain is indistinguishable
 * from a hung tab — the board stops, the bots stop, nothing in the console
 * says why unless you had it open at the moment it happened. Now a bad frame
 * is a dropped frame: it's logged once per distinct error and the loop carries
 * on, so a rendering bug degrades into a glitch instead of a freeze.
 */
const drawFailures = new Set();
function frame(now = 0) {
  driveBots(now);
  const sig = signature();
  if (sig !== lastSig) { lastSig = sig; syncPanel(); }
  try {
    renderer.draw(game);
  } catch (err) {
    const key = String(err && err.stack ? err.stack.split('\n').slice(0, 3).join('|') : err);
    if (!drawFailures.has(key)) {
      drawFailures.add(key);
      console.error('The renderer threw; the frame is skipped and the game carries on.', err);
    }
  }
  requestAnimationFrame(frame);
}

showVersion();
// Settings first: the panel, the mode dropdown and the first game should all
// come up the way you left them.
const restored = loadSettings();
setRuleset(ruleset);
renderMechanics();
renderGroups();
onModeChange();
if (restored) {
  // onModeChange resets the tile pool to the mode's default, which is right
  // for a mode you just picked and wrong for one you are coming back to.
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (saved?.groups?.length) { enabledGroups = new Set(saved.groups); renderGroups(); }
  } catch { /* ignore */ }
}
game = bind(new Game({
  players: Number($('playerCount').value) || 2,
  groups: [...enabledGroups],
  options: { ...mechanics },
  ruleset,
  meeples: $('useMeeples').checked,
  tilesPerTurn: Number($('tilesPerTurn').value) || 1,
  mode: $('mode').value,
}));
game.free = $('freePlace').checked;
buildBots();
syncPanel();
frame();

// Handy for poking at state from the devtools console while iterating.
window.LAB = {
  get game() { return game; },
  get bots() { return bots; },
  renderer, newGame, THEME, sfx, fx, MODES, MECHANICS, LIVE_MECHANICS, VERSION,
  claimSpots: () => claimSpots,
  setLean,
  get mechanics() { return mechanics; },
  get ruleset() { return ruleset; },
};
