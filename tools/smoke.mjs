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

// The modifiers all touch the UI too — the market row especially.
for (const mod of ['market', 'agendas', 'fog', 'twoFaced', 'tide']) {
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.check(`#modifiers input[data-mod="${mod}"]`);
  await page.click('#newGame');
  await page.waitForTimeout(100);
  await page.evaluate(() => {
    const g = window.LAB.game;
    for (let i = 0; i < 12 && g.phase !== 'over'; i++) {
      if (g.phase === 'market') { g.takeFromMarket(0); continue; }
      if (g.phase === 'place') {
        const s = g.board.legalPlacements(g.tile, g.placeOpts())[0];
        if (!s) break;
        for (let r = 0; r < s.rot; r++) g.rotate(1);
        g.cellClick(s.x, s.y);
        continue;
      }
      if (g.phase === 'meeple') { g.skipMeeple(); continue; }
      break;
    }
  });
  await page.uncheck(`#modifiers input[data-mod="${mod}"]`);
  if (errors.length) { failures++; console.log(`  ✗ +${mod}: ${errors[0].split('\n')[0]}`); }
  else console.log(`  ✓ +${mod}`);
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nbrowser: all good');
process.exit(failures ? 1 : 0);
