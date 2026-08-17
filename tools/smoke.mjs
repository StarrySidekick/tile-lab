// ---------------------------------------------------------------------------
// Browser smoke test.
//
//   node tools/smoke.mjs [--shots]
//
// The harness plays the rules headlessly; this checks the half that only
// exists in a browser — that every mode boots, renders a frame, builds its
// panel and its buttons, and survives a few clicks without throwing. Most of
// the bugs a mode ships with are in that seam, not in the rules.
//
// With --shots it also writes a PNG per mode to tools/shots/.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 5199;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const file = join(ROOT, path === '/' ? 'index.html' : path);
    const body = await readFile(file);          // read first: a 404 after
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);                              // writeHead(200) can't be sent
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(PORT, r));

const shots = process.argv.includes('--shots');
if (shots) mkdirSync(join(ROOT, 'tools/shots'), { recursive: true });

// This environment ships a Chromium that may not match the pinned Playwright
// build, so point at it explicitly rather than downloading another one.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 820 } });

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForFunction(() => window.LAB && window.LAB.game);

const modes = await page.evaluate(() => window.LAB.MODES.map((m) => ({ id: m.id, name: m.name })));
let failures = 0;

// Everything below drives the game by hand, so the computer players have to be
// off or they'd be taking turns underneath the script.
await page.selectOption('#botCount', '0');

for (const mode of modes) {
  errors.length = 0;
  await page.selectOption('#mode', mode.id);
  await page.click('#newGame');
  await page.waitForTimeout(120);

  // Poke at it: a handful of legal moves driven through the same entry points
  // the mouse uses, so anything the UI layer touches gets touched.
  const state = await page.evaluate(async () => {
    const g = window.LAB.game;
    const rnd = (n) => Math.floor(Math.random() * n);
    for (let i = 0; i < 25 && g.phase !== 'over'; i++) {
      if (g.phase === 'market') { g.takeFromMarket(rnd(g.market.length)); continue; }
      if (g.phase === 'place') {
        const spots = g.m.piece
          ? g.board.legalPiecePlacements(g.m.piece)
          : g.board.legalPlacements(g.tile, g.placeOpts());
        if (!spots.length) break;
        const s = spots[rnd(spots.length)];
        if (s.rot != null) for (let r = 0; r < s.rot; r++) g.rotate(1);
        g.cellClick(s.x, s.y);
        continue;
      }
      if (g.phase === 'meeple') { g.skipMeeple(); continue; }
      if (g.phase === 'story') { g.m.choose(rnd(3)); continue; }
      if (g.phase === 'boon') { g.m.chooseBoon(rnd(3)); continue; }
      if (g.phase === 'move') {
        const w = g.walker;
        const p = w.visiblePawns[0];
        if (p && w.select(p)) {
          const d = [...w.reachable(p).values()];
          if (d.length) { g.movePawn(d[0].x, d[0].y); continue; }
        }
        g.holdPosition();
        continue;
      }
      if (g.phase === 'lift') { const l = g.m.allLiftable(); if (l.length) g.m.onCellClick(l[0].x, l[0].y); else g.m.cancelLift(); continue; }
      if (g.phase === 'interior-place') {
        const inv = g.interior;
        const s = inv.board.legalPlacements(inv.tile)[0];
        if (s) { for (let r = 0; r < s.rot; r++) inv.rotate(1); g.interiorPlaceAt(s.x, s.y); } else g.interiorHold();
        continue;
      }
      if (g.phase === 'interior-move') { g.interiorHold(); continue; }
      break;
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      phase: g.phase,
      tiles: g.board.size,
      panel: document.getElementById('scores').innerHTML.length,
      buttons: document.querySelectorAll('#actions button').length,
      hint: document.getElementById('modeHint').textContent.length,
    };
  });

  if (shots) await page.screenshot({ path: join(ROOT, `tools/shots/${mode.id}.png`) });

  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (state.tiles < 2) problems.push(`only ${state.tiles} tiles placed`);
  if (state.panel < 20) problems.push('panel is empty');
  if (!state.hint) problems.push('no mode hint');

  if (problems.length) {
    failures++;
    console.log(`  ✗ ${mode.id.padEnd(12)} ${problems.join(' · ')}`);
  } else {
    console.log(`  ✓ ${mode.id.padEnd(12)} ${String(state.tiles).padStart(3)} tiles · ${state.buttons} buttons · phase "${state.phase}"`);
  }
}

// The input layer itself, through real pointer events rather than by calling
// the game — everything else in this file drives the rules directly, so a tap
// that stopped placing tiles would sail straight past it. Three gestures, and
// the interesting assertions are the negative ones: a drag and a pinch must
// NOT leave a tile behind.
{
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.selectOption('#botCount', '0');
  await page.click('#newGame');
  const t = await page.evaluate(() => {
    const cv = document.getElementById('board');
    const r = cv.getBoundingClientRect();
    const ev = (type, id, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: id, clientX: r.left + x, clientY: r.top + y, pointerType: 'touch', isPrimary: id === 1,
    }));
    const { renderer, game } = window.LAB;
    const out = {};

    // A tap on a legal square.
    const spot = game.board.legalPlacements(game.tile, game.placeOpts())[0];
    const [tx, ty] = renderer.toScreen(spot.x + 0.5, spot.y + 0.5);
    const before = game.board.size;
    game.rot = spot.rot;
    ev('pointerdown', 1, tx, ty);
    ev('pointerup', 1, tx, ty);
    out.tapped = game.board.size - before;

    // A drag: the camera moves, nothing is played.
    const laid = game.board.size;
    const cam = renderer.cam.x;
    ev('pointerdown', 1, 300, 300);
    for (let i = 1; i <= 6; i++) ev('pointermove', 1, 300 - i * 12, 300);
    ev('pointerup', 1, 228, 300);
    out.panned = Math.abs(renderer.cam.x - cam) > 0.2;
    out.dragLaid = game.board.size - laid;

    // Two fingers: spread, then pinch.
    const gesture = (from, to) => {
      ev('pointerdown', 1, 400, 400);
      ev('pointerdown', 2, 400 + from, 400);
      for (let i = 1; i <= 10; i++) ev('pointermove', 2, 400 + from + (to - from) * i / 10, 400);
      ev('pointerup', 2, 400 + to, 400);
      ev('pointerup', 1, 400, 400);
      return renderer.cam.zoom;
    };
    out.start = renderer.cam.zoom;
    out.spread = gesture(100, 200);
    out.pinched = gesture(400, 100);
    out.pinchLaid = game.board.size - laid;
    return out;
  });
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (t.tapped !== 1) problems.push('a tap did not place a tile');
  if (!t.panned) problems.push('a drag did not pan');
  if (t.dragLaid) problems.push('a drag placed a tile');
  if (!(t.spread > t.start * 1.5)) problems.push(`spreading gave ${t.spread.toFixed(0)} from ${t.start.toFixed(0)}`);
  if (!(t.pinched < t.spread * 0.6)) problems.push(`pinching gave ${t.pinched.toFixed(0)} from ${t.spread.toFixed(0)}`);
  if (t.pinchLaid) problems.push('a pinch placed a tile');
  if (problems.length) { failures++; console.log(`  ✗ touch input: ${problems.join(' · ')}`); }
  else console.log(`  ✓ touch input       tap places · drag pans · pinch ${t.start.toFixed(0)} → ${t.spread.toFixed(0)} → ${t.pinched.toFixed(0)}`);
}

// Score effects: a closure has to put a number on the board and a flash on the
// tiles that paid, and the panel has to bump the row that changed.
{
  errors.length = 0;
  await page.click('#newGame');
  const fx = await page.evaluate(async () => {
    const g = window.LAB.game;
    for (let i = 0; i < 60 && g.phase !== 'over'; i++) {
      if (g.phase === 'place') {
        const s = g.board.legalPlacements(g.tile, g.placeOpts())[0];
        if (!s) break;
        g.rot = s.rot;
        g.cellClick(s.x, s.y);
      } else if (g.phase === 'meeple') {
        const o = g.meepleOptions();
        if (o.length) g.placeMeeple(o[0].i); else g.skipMeeple();
      } else break;
      if (window.LAB.fx.items.some((e) => e.kind === 'float')) break;
    }
    // The panel repaints on the render loop, so the bump only exists after a
    // frame has gone by.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      kinds: [...new Set(window.LAB.fx.items.map((e) => e.kind))],
      bumped: document.querySelectorAll('#scores .pscore.bump').length,
      scored: g.players.some((p) => p.score > 0),
    };
  });
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (!fx.scored) problems.push('nothing scored in 60 moves');
  else {
    if (!fx.kinds.includes('float')) problems.push(`no floating score (${fx.kinds.join(', ') || 'nothing'})`);
    if (!fx.kinds.includes('flash')) problems.push('no feature flash');
    if (!fx.bumped) problems.push('no panel bump');
  }
  if (problems.length) { failures++; console.log(`  ✗ score effects: ${problems.join(' · ')}`); }
  else console.log(`  ✓ score effects     ${fx.kinds.join(', ')} · ${fx.bumped} row bumped`);
}

// The computer player, which in the browser is a different claim from the one
// the harness makes: not "it picks legal moves" but "it takes its turns off the
// render loop, on its own, without being poked".
{
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.selectOption('#botSpeed', '0');
  await page.selectOption('#botCount', '2');        // both seats — it plays itself
  await page.click('#newGame');
  await page.waitForTimeout(2000);
  const st = await page.evaluate(() => ({
    tiles: window.LAB.game.board.size,
    bots: window.LAB.bots.size,
    locked: document.querySelectorAll('#actions button').length,
  }));
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (st.bots !== 2) problems.push(`${st.bots} bots built`);
  if (st.tiles < 6) problems.push(`only ${st.tiles} tiles laid in 2s`);
  if (st.locked) problems.push(`${st.locked} action buttons left live on a bot turn`);
  if (problems.length) { failures++; console.log(`  ✗ computer players: ${problems.join(' · ')}`); }
  else console.log(`  ✓ computer players  ${st.tiles} tiles laid unattended`);
  await page.selectOption('#botCount', '0');
  await page.selectOption('#botSpeed', '380');
}

// Every mechanic touches the UI too — the market row and the extra action
// buttons especially, and those only exist in a browser.
const mechanics = await page.evaluate(() => window.LAB.MECHANICS.map((m) => m.id));
for (const mech of mechanics) {
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.check(`#mechanics input[data-mech="${mech}"]`);
  await page.click('#newGame');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const g = window.LAB.game;
    const legal = () => {
      const out = [];
      const saved = g.rot;
      for (const { x, y } of g.board.candidates(g.placeOpts())) {
        for (let rot = 0; rot < 4; rot++) { g.rot = rot; if (g.canPlaceAt(x, y)) out.push({ x, y, rot }); }
      }
      g.rot = saved;
      return out;
    };
    for (let i = 0; i < 20 && g.phase !== 'over'; i++) {
      if (g.phase === 'market') { g.takeFromMarket(0); continue; }
      if (g.phase === 'place') {
        const s = legal()[0];
        if (!s) break;
        g.rot = s.rot;
        g.cellClick(s.x, s.y);
        continue;
      }
      if (g.phase === 'meeple') { g.skipMeeple(); continue; }
      if (g.phase === 'walk') { g.declineWalk(); continue; }
      break;
    }
  });
  await page.uncheck(`#mechanics input[data-mech="${mech}"]`);
  if (errors.length) { failures++; console.log(`  ✗ +${mech}: ${errors[0].split('\n')[0]}`); }
  else console.log(`  ✓ +${mech}`);
}

// And the tiles-per-turn setting, which changes the turn loop itself.
for (const n of ['1', '3', '5']) {
  errors.length = 0;
  await page.selectOption('#tilesPerTurn', n);
  await page.click('#newGame');
  await page.waitForTimeout(80);
  const left = await page.evaluate(() => window.LAB.game.tilesLeft);
  if (errors.length || left !== Number(n)) {
    failures++;
    console.log(`  ✗ ${n} tiles/turn: ${errors[0] || `tilesLeft was ${left}`}`);
  } else console.log(`  ✓ ${n} tiles/turn`);
}
await page.selectOption('#tilesPerTurn', '1');

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nbrowser: all good');
process.exit(failures ? 1 : 0);
