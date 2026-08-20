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
import { drawTile, PLAYER_COLORS } from './art.js';
import { THEME } from './theme.js';
import { TILE_TYPES, TILES, GROUPS } from './tiles.js';
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
  const acted = game.cellClick(c.x, c.y);
  if (!acted && game.phase === 'place' && !game.board.get(c.x, c.y) && nearBoard(c)) {
    sfx.play('deny');
    fx.on('deny', { at: { x: c.x + 0.5, y: c.y + 0.5 } }, game);
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!botTurn()) game.rotate(1);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { if (!botTurn()) game.rotate(e.deltaY > 0 ? 1 : -1); return; }
  if (game.interior) return;
  renderer.glide = null;
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  // The two view keys still work while the computer plays; nothing else does.
  if (e.key === 'd' || e.key === 'D') { renderer.showDebug = !renderer.showDebug; $('debug').checked = renderer.showDebug; }
  if (e.key === 'c' || e.key === 'C') {
    if (game.lastPlaced) renderer.centerOn(game.lastPlaced.x, game.lastPlaced.y);
  }
  if (botTurn()) return;
  if (e.key === 'r' || e.key === 'R') game.rotate(e.shiftKey ? -1 : 1);
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
  if (e.key === 'b' || e.key === 'B') game.toggleBig();
  if (e.key >= '1' && e.key <= '9' && game.phase === 'market') {
    game.takeFromMarket(Number(e.key) - 1);
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

// --- side panel -------------------------------------------------------------

const previewCtx = $('preview').getContext('2d');

function currentTile() {
  const inv = game.interior;
  if (inv && game.phase === 'interior-place') return { type: inv.tile, rot: inv.rot, terrain: inv.kind };
  if (game.m.piece) return { piece: game.m.piece };
  if (game.tile) return { type: game.tile, rot: game.rot, terrain: 'surface' };
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
  const add = (label, key, fn, disabled = false, wide = false) =>
    btns.push({ label, key, fn, disabled, wide });

  if (game.phase === 'place' || game.phase === 'interior-place') add('Rotate', 'R', () => game.rotate(1));
  if (game.canFlip()) add('Flip it over', 'F', () => game.flipTile());
  if (game.canPlayAbbey()) add(`Play your abbey (${game.player.abbeys})`, '', () => game.playAbbey());
  if (game.canLiftNow()) add('Lift a placed tile', 'L', () => game.beginLift());
  if (game.phase === 'lift') add('Cancel lift', '', () => game.cancelLift());
  if (game.phase === 'meeple') {
    add('Skip meeple', 'Space', () => game.skipMeeple());
    if (game.has('bigMeeple') && game.player.big > 0) {
      add(game.useBig ? 'Using the BIG follower' : 'Use the big follower', 'B', () => game.toggleBig());
    }
    if (game.canRecall()) add('Recall a follower', '', () => game.beginRecall());
  }
  if (game.phase === 'walk') add('Send it home instead', 'Space', () => game.declineWalk());
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
    if (b.wide) el.className = 'wide';
    el.innerHTML = `${b.label}${b.key ? ` <kbd>${b.key}</kbd>` : ''}`;
    el.disabled = b.disabled;
    el.onclick = b.fn;
    host.appendChild(el);
  }
  if (!btns.length) host.innerHTML = '<span class="dim" style="font-size:11px">—</span>';
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
  bumpScores();
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
    game.tilesLeft, game.useBig ? 'B' : '-', game.usingAbbey ? 'A' : '-', bots.size,
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
setRuleset(ruleset);
renderMechanics();
renderGroups();
onModeChange();
game = bind(new Game({ players: 2, groups: [...enabledGroups] }));
buildBots();
syncPanel();
frame();

// Handy for poking at state from the devtools console while iterating.
window.LAB = {
  get game() { return game; },
  get bots() { return bots; },
  renderer, newGame, THEME, sfx, fx, MODES, MECHANICS, LIVE_MECHANICS, VERSION,
  get mechanics() { return mechanics; },
  get ruleset() { return ruleset; },
};
