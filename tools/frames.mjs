// ---------------------------------------------------------------------------
// How long does a frame actually take?
//
// The trap this exists to avoid: canvas 2D only RECORDS commands. Calling
// renderer.draw() in a tight loop and timing it measures how fast the game can
// DESCRIBE a frame, not how long the browser takes to paint one — and the two
// differ by a hundred times. Timing it that way said the board drew in a
// millisecond while the real loop was managing seven frames a second.
//
// So: measure the real requestAnimationFrame gaps, measure them again with the
// renderer stubbed out (whatever is left is the browser's own overhead, not
// ours), and force a readback after every timed call so the raster is included
// in it.
//
//   node tools/frames.mjs
// ---------------------------------------------------------------------------
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PORT = 8124;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((rq, rs) => {
  const u = rq.url.split('?')[0];
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  fs.readFile(f, (e, d) => {
    if (e) { rs.writeHead(404); rs.end(''); return; }
    rs.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    rs.end(d);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForTimeout(1100);
await page.selectOption('#mode', 'girando');
await page.fill('#seed', 'frames');
await page.click('#newGame');
await page.waitForTimeout(300);

const out = await page.evaluate(async () => {
  const g = window.LAB.game, R = window.LAB.renderer;
  const legal = () => {
    const o = []; const saved = g.rot;
    for (const { x, y } of g.board.candidates(g.placeOpts()))
      for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) o.push({ x, y, rot: r }); }
    g.rot = saved; return o;
  };
  for (let i = 0; i < 200 && g.phase !== 'over'; i++) {
    if (g.phase === 'market') g.takeFromMarket(0);
    else if (g.phase === 'place') { const p = legal()[0]; if (!p) break; g.rot = p.rot; g.cellClick(p.x, p.y); }
    else if (g.phase === 'meeple') { const o = g.meepleOptions(); if (o.length) g.placeMeeple(o[0].i, o[0]); else g.skipMeeple(); }
    else if (g.phase === 'lift') g.m.cancelLift();
    else break;
    if (g.board.cells.size >= 60 && g.phase === 'place') break;
  }
  await new Promise((r) => setTimeout(r, 1000));      // let the caches warm

  const watch = async (n) => {
    const gaps = []; let prev = performance.now();
    await new Promise((res) => {
      let i = 0;
      const tick = () => {
        const t = performance.now(); gaps.push(t - prev); prev = t;
        if (++i < n) requestAnimationFrame(tick); else res();
      };
      requestAnimationFrame(tick);
    });
    gaps.sort((a, b) => a - b);
    return { p50: +gaps[n >> 1].toFixed(1), p90: +gaps[Math.floor(n * 0.9)].toFixed(1),
      max: +gaps[n - 1].toFixed(1) };
  };

  const real = await watch(150);
  const draw = R.draw.bind(R);
  R.draw = () => {};
  const bare = await watch(90);
  R.draw = draw;

  const flush = () => R.ctx.getImageData(0, 0, 1, 1);
  const t = (fn, n = 10) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { fn(); flush(); }
    return +((performance.now() - t0) / n).toFixed(2);
  };
  return {
    scene: `${g.board.cells.size} tiles, ${R.canvas.width}x${R.canvas.height} device px`,
    frames: real,
    browserOnly: bare,
    parts: {
      whole: t(() => R.draw(g)),
      backdrop: t(() => R.drawBackdrop(g)),
      sheetBlit: t(() => { const s = R.sheet(); R.ctx.drawImage(s.under, 0, 0, R.w, R.h); }),
      rhumbs: t(() => R.drawRhumbs()),
      graticule: t(() => R.drawGraticule()),
      hints: t(() => R.drawPlacementHints(g)),
    },
  };
});

console.log(`scene: ${out.scene}`);
console.log(`frame gaps    p50 ${out.frames.p50}ms  p90 ${out.frames.p90}ms  max ${out.frames.max}ms`);
console.log(`without us    p50 ${out.browserOnly.p50}ms  p90 ${out.browserOnly.p90}ms`);
for (const [k, v] of Object.entries(out.parts)) console.log(`  ${k.padEnd(12)} ${v}ms`);

await browser.close();
server.close();
