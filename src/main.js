// ---------------------------------------------------------------------------
// DOM wiring: input handling, side panel, and the render loop.
// ---------------------------------------------------------------------------

import { Game } from './game.js';
import { Renderer } from './render.js';
import { drawTile, PLAYER_COLORS } from './art.js';
import { TILE_TYPES } from './tiles.js';

const canvas = document.getElementById('board');
const renderer = new Renderer(canvas);
let game = new Game({ players: 2 });

const $ = (id) => document.getElementById(id);

// --- new game ---------------------------------------------------------------

function newGame() {
  const players = Number($('playerCount').value);
  const seedRaw = $('seed').value.trim();
  const seed = seedRaw === '' ? null : hashSeed(seedRaw);
  game = new Game({ players, seed });
  game.free = $('freePlace').checked;
  renderer.centerOn(0, 0);
  renderer.cam.zoom = 96;
}

function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// --- pointer ----------------------------------------------------------------

let drag = null;

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.offsetX, y: e.offsetY, moved: 0, camX: renderer.cam.x, camY: renderer.cam.y };
});

canvas.addEventListener('pointermove', (e) => {
  if (drag) {
    const dx = e.offsetX - drag.x, dy = e.offsetY - drag.y;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
    if (drag.moved > 4) {
      renderer.cam.x = drag.camX - dx / renderer.cam.zoom;
      renderer.cam.y = drag.camY - dy / renderer.cam.zoom;
    }
  }
  renderer.hover = renderer.cellAt(e.offsetX, e.offsetY);
});

canvas.addEventListener('pointerleave', () => { renderer.hover = null; });

canvas.addEventListener('pointerup', (e) => {
  const wasDrag = drag && drag.moved > 4;
  drag = null;
  if (wasDrag) return;

  if (game.phase === 'meeple') {
    const hit = renderer.hitMeepleSpot(e.offsetX, e.offsetY);
    if (hit) game.placeMeeple(hit.i);
    return;
  }
  if (game.phase === 'place') {
    const c = renderer.cellAt(e.offsetX, e.offsetY);
    game.placeAt(c.x, c.y);
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  game.rotate(1);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) { game.rotate(e.deltaY > 0 ? 1 : -1); return; }
  renderer.zoomAt(e.offsetX, e.offsetY, e.deltaY > 0 ? 0.9 : 1.1);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === 'r' || e.key === 'R') game.rotate(e.shiftKey ? -1 : 1);
  if (e.key === ' ') { e.preventDefault(); game.skipMeeple(); }
  if (e.key === 'd' || e.key === 'D') { renderer.showDebug = !renderer.showDebug; $('debug').checked = renderer.showDebug; }
  if (e.key === 'c' || e.key === 'C') {
    if (game.lastPlaced) renderer.centerOn(game.lastPlaced.x, game.lastPlaced.y);
  }
});

window.addEventListener('resize', () => renderer.resize());

// --- controls ---------------------------------------------------------------

$('rotate').onclick = () => game.rotate(1);
$('skip').onclick = () => game.skipMeeple();
$('newGame').onclick = newGame;
$('freePlace').onchange = (e) => { game.free = e.target.checked; };
$('debug').onchange = (e) => { renderer.showDebug = e.target.checked; };
$('forceTile').onchange = (e) => {
  game.forcedNext = e.target.value || null;
  // Swap the tile in hand right away so you can try it without burning a turn.
  if (game.forcedNext && game.phase === 'place') {
    game.deck.push(game.tile.id);
    game.drawTile();
  }
};

// Tile picker for poking at specific tiles while iterating.
for (const t of TILE_TYPES) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = `${t.id} — ${t.name}`;
  $('forceTile').appendChild(o);
}

// --- side panel -------------------------------------------------------------

const previewCtx = $('preview').getContext('2d');

function drawPreview() {
  const c = previewCtx;
  const size = $('preview').width;
  c.clearRect(0, 0, size, size);
  if (!game.tile) return;
  c.save();
  c.translate(size / 2, size / 2);
  c.rotate(game.rot * Math.PI / 2);
  c.translate(-size / 2, -size / 2);
  c.scale(size, size);
  drawTile(c, game.tile);
  c.restore();
}

function syncPanel() {
  $('scores').innerHTML = game.players.map((p, i) => `
    <div class="player ${i === game.current && game.phase !== 'over' ? 'active' : ''}">
      <span class="swatch" style="background:${PLAYER_COLORS[i]}"></span>
      <span class="pname">${p.name}</span>
      <span class="pmeeples">${'●'.repeat(p.meeples)}<span class="dim">${'○'.repeat(7 - p.meeples)}</span></span>
      <span class="pscore">${p.score}</span>
    </div>`).join('');

  $('deckCount').textContent = game.deck.length;
  $('tileName').textContent = game.tile ? `${game.tile.id} · ${game.tile.name}` : '—';

  const phase = {
    place: 'Place the tile — R rotates',
    meeple: 'Claim a feature, or skip (Space)',
    over: 'Game over',
  }[game.phase];
  $('phase').textContent = phase;
  $('skip').disabled = game.phase !== 'meeple';
  $('rotate').disabled = game.phase !== 'place';

  $('log').innerHTML = game.log.map((l) => `<div class="entry">${l}</div>`).join('');
  drawPreview();
}

// --- loop -------------------------------------------------------------------

// The panel redraws whenever a state fingerprint changes, rather than being
// pushed from each handler — so poking at LAB.game from the console stays in
// sync with the UI too.
let lastSig = '';
function signature() {
  return [
    game.phase, game.current, game.rot, game.deck.length, game.board.size,
    game.tile ? game.tile.id : '-', game.log.length,
    game.players.map((p) => `${p.score}/${p.meeples}`).join(','),
  ].join('|');
}

function frame() {
  const sig = signature();
  if (sig !== lastSig) { lastSig = sig; syncPanel(); }
  renderer.draw(game);
  requestAnimationFrame(frame);
}

frame();

// Handy for poking at state from the devtools console while iterating.
window.LAB = { get game() { return game; }, renderer, newGame };
