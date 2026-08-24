// ---------------------------------------------------------------------------
// Does every dial do something?
//
// The design console is only worth having if each control it draws actually
// reaches the picture. It is very easy for one not to: a value read into a
// `const` at import time, a colour the art never asks for, a width that was
// hardcoded next to the dial that was supposed to set it. Those look fine in
// review and are invisible until somebody drags the slider and nothing moves.
//
// So: start a seeded Girando game, stop while there are still followers on
// the board, then for every entry in the book push it to an extreme and
// redraw. The picture is captured with the clock stopped and the sprite cache
// settled, so the only thing that can move a pixel is the dial. A dial that leaves the hash
// alone is either dead or too subtle to see, and both are worth knowing.
//
//   node tools/dials.mjs        [--all]  include the non-chart palettes
// ---------------------------------------------------------------------------
import { chromium } from 'playwright';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const PORT = 8123;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer((rq, rs) => {
  const f = path.join(ROOT, rq.url.split('?')[0] === '/' ? 'index.html' : rq.url.split('?')[0]);
  fs.readFile(f, (e, d) => {
    if (e) { rs.writeHead(404); rs.end(''); return; }
    rs.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    rs.end(d);
  });
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 820 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForTimeout(900);
await page.selectOption('#mode', 'girando');
await page.fill('#seed', 'dials');      // the same board every run, or a dial
await page.click('#newGame');           // that fails is just a board that varied
await page.waitForTimeout(300);

const result = await page.evaluate(async () => {
  const g = window.LAB.game, R = window.LAB.renderer;
  const { SPEC, DESIGN, setValue } = await import('/src/design.js');
  const { usePalette } = await import('/src/theme.js');
  const sprites = await import('/src/sprites.js');

  // Lay a real board: roads, cities, followers, a whale, some weather.
  const legal = () => {
    const out = []; const saved = g.rot;
    for (const { x, y } of g.board.candidates(g.placeOpts()))
      for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) out.push({ x, y, rot: r }); }
    g.rot = saved; return out;
  };
  const standing = () => {
    let n = 0;
    for (const c of g.board.cells.values()) if (c.meeple) n++;
    return n;
  };
  for (let i = 0; i < 200 && g.phase !== 'over'; i++) {
    if (g.phase === 'market') g.takeFromMarket(0);
    else if (g.phase === 'place') { const s = legal()[0]; if (!s) break; g.rot = s.rot; g.cellClick(s.x, s.y); }
    else if (g.phase === 'meeple') { const o = g.meepleOptions(); if (o.length) g.placeMeeple(o[0].i, o[0]); else g.skipMeeple(); }
    else if (g.phase === 'lift') g.m.cancelLift();
    else break;
    // Stop while there are still followers standing: features close as the
    // board grows and scoring calls them home, so playing to the end leaves
    // an empty map and nothing to test the figure dials against.
    if (g.board.cells.size >= 24 && standing() >= 2 && g.phase === 'place') break;
  }

  // The board is never pixel-identical twice: the whale bobs, the turbine
  // sails turn, and both read the clock. So a dial is not judged against a
  // remembered hash — it is judged against the noise of drawing the same
  // scene twice with nothing changed. Anything that does not move the picture
  // by more than the animation already does is dead as far as this can tell.
  const shot = () => {
    usePalette(window.LAB.THEME.paletteName, true);
    sprites.clearSprites();
    // Draw until the sprite cache stops building. The renderer spreads that
    // work over frames on purpose, so one draw after a clear is a picture
    // half made of stand-in resolutions and no two of them match.
    let last = -1;
    for (let i = 0; i < 600; i++) {
      R.draw(g);
      const b = sprites.spriteStats().builds;
      if (b === last) break;
      last = b;
    }
    // The picture is captured with the clock stopped, so the whale's bob and
    // the turbine sails cannot masquerade as a dial doing something. Safe to
    // freeze only now: with the cache warm, this draw builds nothing, and the
    // build budget is the other thing that reads the clock.
    const real = performance.now.bind(performance);
    performance.now = () => 1234567;
    try { R.draw(g); } finally { performance.now = real; }
    return R.ctx.getImageData(0, 0, R.canvas.width, R.canvas.height).data.slice();
  };
  const diff = (a, b) => {
    let n = 0;
    for (let i = 0; i < a.length; i += 41) if (a[i] !== b[i]) n++;
    return n;
  };

  // What the scene can and cannot answer for. Timing dials never show up in a
  // still, and the storm's ink is only drawn while a gust is on screen — those
  // are reported apart from the ones that ought to have moved something.
  const NOT_IN_A_STILL = new Set([
    'storm.beat', 'storm.decay', 'storm.minBeat', 'storm.tileGlide',
    'storm.streak', 'storm.streakInk', 'storm.cannonInk',
  ]);

  const read = (k) => k.split('.').reduce((at, p) => at?.[p], DESIGN);
  const dead = [], untestable = [];
  for (const s of SPEC) {
    const was = read(s.key);
    const to = s.type === 'color'
      ? (was.toLowerCase() === '#ff00ff' ? '#00ff88' : '#ff00ff')
      : (Math.abs(s.max - was) > Math.abs(was - s.min) ? s.max : s.min);
    const before = shot();
    const floor = diff(before, shot());          // same scene, nothing changed
    setValue(s.key, to);
    const moved = diff(before, shot());
    setValue(s.key, was);
    if (moved <= floor + 20) (NOT_IN_A_STILL.has(s.key) ? untestable : dead).push(s.key);
  }
  shot();
  const seen = { followers: 0, terrain: new Set() };
  for (const c of g.board.cells.values()) {
    seen.terrain.add(c.terrain || 'surface');
    if (c.meeples?.length || c.meeple) seen.followers++;
  }
  return { total: SPEC.length, dead, untestable,
    scene: { tiles: g.board.cells.size, followers: seen.followers, terrain: [...seen.terrain] } };
});

console.log(`scene: ${result.scene.tiles} tiles, ${result.scene.followers} follower(s), `
  + `terrain ${result.scene.terrain.join('/')}`);
for (const k of result.dead) console.log(`  \u2717 ${k} moves nothing`);
if (result.untestable.length) {
  console.log(`  \u00b7 not answerable from a still: ${result.untestable.join(', ')}`);
}
console.log(result.dead.length
  ? `\n${result.dead.length} of ${result.total} dials moved nothing in this scene.`
  : `\nall ${result.total - result.untestable.length} testable dials reach the picture.`);
if (errors.length) console.log('page errors:', errors.slice(0, 3));

await browser.close();
server.close();
// A report, not a gate: a dial can move nothing because the scene has no
// forest in it, which is not the same as being broken. Read the list — the
// scene line above says what was on the board to move.
process.exit(0);
