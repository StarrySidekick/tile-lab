// ---------------------------------------------------------------------------
// DOM wiring: input handling, side panel, and the render loop.
// ---------------------------------------------------------------------------

import { Game, DEFAULT_GROUPS } from './game.js';
import { Renderer } from './render.js';
import { drawTile, PLAYER_COLORS } from './art.js';
import { THEME } from './theme.js';
import { TILE_TYPES, GROUPS, CITY_LANDMARKS } from './tiles.js';
import { Sfx, SOUND_NAMES } from './audio.js';

const canvas = document.getElementById('board');
const renderer = new Renderer(canvas);
const $ = (id) => document.getElementById(id);
const sfx = new Sfx();

let enabledGroups = new Set(DEFAULT_GROUPS.classic);
let game;

/** Every Game is fresh, so sound has to be re-subscribed each time. */
function bind(g) {
  g.on((kind) => sfx.play(kind));
  return g;
}

game = bind(new Game({ players: 2, groups: [...enabledGroups] }));

// --- new game ---------------------------------------------------------------

function newGame() {
  const mode = $('mode').value;
  const players = Number($('playerCount').value);
  const seedRaw = $('seed').value.trim();
  const seed = seedRaw === '' ? null : hashSeed(seedRaw);
  game = bind(new Game({
    players, seed, mode,
    meeples: $('useMeeples').checked,
    groups: [...enabledGroups],
  }));
  game.free = $('freePlace').checked;
  renderer.centerOn(0, 0);
  renderer.cam.zoom = 96;
}

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Switching mode swaps in that mode's sensible default tile pool. */
function onModeChange() {
  const mode = $('mode').value;
  enabledGroups = new Set(DEFAULT_GROUPS[mode]);
  renderGroups();
  $('meepleRow').style.display = mode === 'classic' ? '' : 'none';
  $('modeHint').textContent = mode === 'expedition'
    ? 'Place a tile, then walk a pawn. Landmarks go to whoever reaches them first.'
    : ($('useMeeples').checked
      ? 'Claim features with meeples; majority scores when they close.'
      : 'No meeples — a feature pays whoever closes it.');
}

// --- pointer ----------------------------------------------------------------

let drag = null;

/** Is this cell touching the played area? Used to decide whether to buzz. */
function nearBoard(c) {
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) if (game.board.get(c.x + dx, c.y + dy)) return true;
  }
  return false;
}

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.offsetX, y: e.offsetY, moved: 0, camX: renderer.cam.x, camY: renderer.cam.y };
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 4 && !game.cave) {
      renderer.cam.x = drag.camX - dx / renderer.cam.zoom;
      renderer.cam.y = drag.camY - dy / renderer.cam.zoom;
    }
  }
  renderer.pointer = { sx: e.offsetX, sy: e.offsetY };
  renderer.hover = renderer.cellAt(e.offsetX, e.offsetY);
});

canvas.addEventListener('pointerleave', () => { renderer.hover = null; renderer.pointer = null; });

canvas.addEventListener('pointerup', (e) => {
  const wasDrag = drag && drag.moved > 4;
  drag = null;
  if (wasDrag) return;
  const { offsetX: sx, offsetY: sy } = e;

  // A cave takes over the whole interaction while it's open.
  if (game.cave) {
    const c = renderer.caveCellAt(game, sx, sy);
    if (!c) return;
    if (game.phase === 'cave-place') game.cavePlaceAt(c.x, c.y);
    else if (game.phase === 'cave-move') game.caveMoveTo(c.x, c.y);
    return;
  }

  switch (game.phase) {
    case 'place': {
      const c = renderer.cellAt(sx, sy);
      // Only complain if they aimed at a real but illegal square — clicking
      // empty space well off the board shouldn't buzz at you.
      if (!game.placeAt(c.x, c.y) && !game.board.get(c.x, c.y) && nearBoard(c)) sfx.play('deny');
      break;
    }
    case 'meeple': {
      const hit = renderer.hitMeepleSpot(sx, sy);
      if (hit) game.placeMeeple(hit.i);
      break;
    }
    case 'move': {
      const pawn = renderer.hitPawn(sx, sy);
      if (pawn && pawn.player === game.current) { game.selectPawn(pawn); break; }
      const c = renderer.cellAt(sx, sy);
      game.movePawn(c.x, c.y);
      break;
    }
  }
});

canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); game.rotate(1); });

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { game.rotate(e.deltaY > 0 ? 1 : -1); return; }
  if (game.cave) return;
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'r' || e.key === 'R') game.rotate(e.shiftKey ? -1 : 1);
  if (e.key === ' ') {
    e.preventDefault();
    if (game.phase === 'meeple') game.skipMeeple();
    else if (game.phase === 'move') game.holdPosition();
    else if (game.phase === 'cave-move') game.caveHold();
  }
  if (e.key === 'd' || e.key === 'D') { renderer.showDebug = !renderer.showDebug; $('debug').checked = renderer.showDebug; }
  if (e.key === 'c' || e.key === 'C') {
    if (game.lastPlaced) renderer.centerOn(game.lastPlaced.x, game.lastPlaced.y);
  }
});

window.addEventListener('resize', () => renderer.resize());

// --- controls ---------------------------------------------------------------

$('newGame').onclick = newGame;
$('mode').onchange = onModeChange;
$('useMeeples').onchange = onModeChange;
$('freePlace').onchange = (e) => { game.free = e.target.checked; };
$('debug').onchange = (e) => { renderer.showDebug = e.target.checked; };
$('forceTile').onchange = (e) => {
  game.forcedNext = e.target.value || null;
  if (game.forcedNext && game.phase === 'place') {
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

// --- sound controls ---------------------------------------------------------

$('sound').onchange = (e) => {
  sfx.enabled = e.target.checked;
  if (sfx.enabled) sfx.play('meeple');   // confirm it's back on
};
$('volume').oninput = (e) => {
  sfx.setVolume(Number(e.target.value));
};
for (const name of SOUND_NAMES) {
  const o = document.createElement('option');
  o.value = name;
  o.textContent = name;
  $('testSound').appendChild(o);
}
$('testSound').onchange = (e) => { if (e.target.value) sfx.play(e.target.value); };
$('testSound').onclick = (e) => { if (e.target.value) sfx.play(e.target.value); };

function renderGroups() {
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
  if (game.cave && game.phase === 'cave-place') return { type: game.cave.tile, rot: game.cave.rot, cave: true };
  if (game.tile) return { type: game.tile, rot: game.rot, cave: false };
  return null;
}

function drawPreview() {
  const c = previewCtx;
  const size = $('preview').width;
  c.clearRect(0, 0, size, size);
  const cur = currentTile();
  if (!cur || !cur.type) return;
  c.save();
  c.translate(size / 2, size / 2);
  c.rotate(cur.rot * Math.PI / 2);
  c.translate(-size / 2, -size / 2);
  c.scale(size, size);
  drawTile(c, cur.type, { cave: cur.cave });
  c.restore();
}

const PHASE_TEXT = {
  place: 'Place the tile — R rotates',
  meeple: 'Claim a feature, or skip',
  move: 'Move a pawn',
  'cave-place': 'Cave: place a passage',
  'cave-move': 'Cave: move, or hold',
  over: 'Game over',
};

/** Contextual buttons — what you can actually do right now. */
function renderActions() {
  const btns = [];
  const add = (label, key, fn, disabled = false) =>
    btns.push({ label, key, fn, disabled });

  if (game.phase === 'place' || game.phase === 'cave-place') add('Rotate', 'R', () => game.rotate(1));
  if (game.phase === 'meeple') add('Skip meeple', 'Space', () => game.skipMeeple());
  if (game.phase === 'move') {
    const sel = game.expedition.selected;
    add('Hold position', 'Space', () => game.holdPosition());
    if (sel && game.expedition.canRest(sel)) add('Rest at village', '', () => game.restPawn());
  }
  if (game.phase === 'cave-move') {
    add('Hold', 'Space', () => game.caveHold());
    if (game.expedition.canLeaveCave(game.cave)) add('Leave cave', '', () => game.caveLeave());
  }

  const host = $('actions');
  host.innerHTML = '';
  for (const b of btns) {
    const el = document.createElement('button');
    el.innerHTML = `${b.label}${b.key ? ` <kbd>${b.key}</kbd>` : ''}`;
    el.disabled = b.disabled;
    el.onclick = b.fn;
    host.appendChild(el);
  }
  if (!btns.length) host.innerHTML = '<span class="dim" style="font-size:11px">—</span>';
}

function scoreRow(p, i) {
  const active = i === game.current && game.phase !== 'over';
  let extra = '';
  if (game.expedition) {
    const pawns = game.expedition.pawns.filter((q) => q.player === i);
    const mounted = pawns.some((q) => q.mounted);
    const inCave = pawns.some((q) => q.inCave);
    const set = game.expedition.collections[i];
    const bits = [`${pawns.length} pawn${pawns.length > 1 ? 's' : ''}`];
    if (mounted) bits.push('mounted');
    if (inCave) bits.push('in cave');
    if (set.size) bits.push(`${set.size}/${CITY_LANDMARKS.length} landmarks`);
    extra = bits.join(' · ');
  } else if (game.useMeeples) {
    extra = '●'.repeat(p.meeples) + `<span class="dim">${'○'.repeat(7 - p.meeples)}</span>`;
  }
  return `
    <div class="player ${active ? 'active' : ''}">
      <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
      <span class="pname">${p.name}</span>
      <span class="pmeta">${extra}</span>
      <span class="pscore">${p.score}</span>
    </div>`;
}

function syncPanel() {
  $('scores').innerHTML = game.players.map(scoreRow).join('');
  $('deckCount').textContent = game.cave ? game.cave.deck.length : game.deck.length;
  const cur = currentTile();
  $('tileName').textContent = cur && cur.type ? `${cur.type.id} · ${cur.type.name}` : '—';
  $('phase').textContent = PHASE_TEXT[game.phase] || '—';
  $('log').innerHTML = game.log.map((l) => `<div class="entry">${l}</div>`).join('');
  renderActions();
  drawPreview();
}

// --- loop -------------------------------------------------------------------

// The panel redraws whenever a state fingerprint changes, rather than being
// pushed from each handler — so poking at LAB.game from the console stays in
// sync with the UI too.
let lastSig = '';
function signature() {
  const cave = game.cave;
  return [
    game.phase, game.current, game.rot, game.deck.length, game.board.size,
    game.tile ? game.tile.id : '-', game.log.length,
    cave ? `${cave.deck.length}/${cave.rot}/${cave.board.size}/${cave.pos.x},${cave.pos.y}` : '-',
    game.expedition ? game.expedition.pawns.length + ':' + (game.expedition.selected?.id ?? '-') : '-',
    game.players.map((p) => `${p.score}/${p.meeples}`).join(','),
  ].join('|');
}

function frame() {
  const sig = signature();
  if (sig !== lastSig) { lastSig = sig; syncPanel(); }
  renderer.draw(game);
  requestAnimationFrame(frame);
}

renderGroups();
onModeChange();
frame();

// Handy for poking at state from the devtools console while iterating.
window.LAB = { get game() { return game; }, renderer, newGame, THEME, sfx };
