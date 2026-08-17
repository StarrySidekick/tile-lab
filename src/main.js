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
import { groupsFor } from './mechanics.js';
import { Renderer } from './render.js';
import { drawTile, PLAYER_COLORS } from './art.js';
import { THEME } from './theme.js';
import { TILE_TYPES, TILES, GROUPS } from './tiles.js';
import { Sfx, SOUND_NAMES } from './audio.js';

const canvas = document.getElementById('board');
const renderer = new Renderer(canvas);
const $ = (id) => document.getElementById(id);
const sfx = new Sfx();

let enabledGroups = new Set(DEFAULT_GROUPS.classic);
let mechanics = {};
let game;

/** Every Game is fresh, so sound has to be re-subscribed each time. */
function bind(g) {
  g.on((kind) => sfx.play(kind));
  return g;
}

const spec = (id) => MODES.find((m) => m.id === id);

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
    tilesPerTurn: Number($('tilesPerTurn').value) || 1,
  }));
  game.free = $('freePlace').checked;
  buildBots();
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
    if (drag.moved > 4 && !game.interior) {
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
  if (botTurn()) return;              // hands off while the computer is playing
  const { offsetX: sx, offsetY: sy } = e;

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
    if (hit) game.placeMeeple(hit.i);
    return;
  }
  if (game.phase === 'move') {
    const pawn = renderer.hitPawn(sx, sy);
    if (pawn && game.selectPawn(pawn)) return;
  }

  const c = renderer.cellAt(sx, sy);
  const acted = game.cellClick(c.x, c.y);
  if (!acted && game.phase === 'place' && !game.board.get(c.x, c.y) && nearBoard(c)) sfx.play('deny');
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (!botTurn()) game.rotate(1);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { if (!botTurn()) game.rotate(e.deltaY > 0 ? 1 : -1); return; }
  if (game.interior) return;
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
$('useMeeples').onchange = onModeChange;
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

$('mechanics').innerHTML = MECHANIC_GROUPS.map((g) => {
  const items = MECHANICS.filter((m) => m.group === g.id);
  if (!items.length) return '';
  return `<h3>${g.name}</h3>` + items.map((m) => `
    <label title="${m.note}"><input type="checkbox" data-mech="${m.id}" /> ${m.name}</label>`).join('');
}).join('');
for (const el of $('mechanics').querySelectorAll('input[data-mech]')) {
  el.onchange = (e) => {
    const id = e.target.dataset.mech;
    if (e.target.checked) mechanics[id] = true; else delete mechanics[id];
    // Fog is pure rendering, so it can take effect without a new game.
    if (id === 'fog' && game) game.options.fog = !!mechanics.fog;
    if (MECHANICS.find((m) => m.id === id)?.groups?.length) renderGroups();
  };
}

$('hints').onchange = (e) => { renderer.showHints = e.target.checked; };

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

function frame(now = 0) {
  driveBots(now);
  const sig = signature();
  if (sig !== lastSig) { lastSig = sig; syncPanel(); }
  renderer.draw(game);
  requestAnimationFrame(frame);
}

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
  renderer, newGame, THEME, sfx, MODES, MECHANICS,
};
