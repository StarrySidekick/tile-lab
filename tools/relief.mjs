// ---------------------------------------------------------------------------
// Relief spike — poses and screenshots.
//
//   node tools/relief.mjs [--shots]
//
// tools/relief.html is the experiment; this is how it gets checked without a
// pair of eyes. It boots the page in a real browser, waits for the board to be
// dealt, and asserts the three things that would make the spike a lie:
//
//   1. the page renders at all, with no console error;
//   2. the deal produced prisms — i.e. some tile actually had a silhouette to
//      extrude, so we are not admiring an empty field;
//   3. the drawn frame is not one flat colour, which is what a broken shader,
//      a black texture or a camera inside the ground all look like.
//
// With --shots it writes tools/shots/relief-*.png: the same board from
// overhead, from a low orbit, and in silhouette mode. Those three are the
// pictures the scoping note is written from.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 5201;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('nope');
  }
});
await new Promise((r) => server.listen(PORT, r));

const shots = process.argv.includes('--shots');
if (shots) mkdirSync(join(ROOT, 'tools/shots'), { recursive: true });

// Headless Chromium has no GPU, so WebGL falls to SwiftShader — which needs
// asking for by name. Slow, correct, and entirely good enough for a still.
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? '  ok' : 'FAIL'}  ${what}`);
  if (!ok) failed++;
};

await page.goto(`http://localhost:${PORT}/tools/relief.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.relief && document.getElementById('stat').textContent, null, { timeout: 30000 });

const stat = await page.textContent('#stat');
console.log(`\n  ${stat}`);
const prisms = +(stat.match(/(\d+) prisms/)?.[1] ?? 0);
check(prisms > 0, `the deal extruded something (${prisms} prisms)`);
const houses = +(stat.match(/(\d+) houses/)?.[1] ?? 0);
check(houses > 0, `the towns got settled (${houses} houses)`);

/** Pose the camera, let a couple of frames land, and read the canvas back. */
async function pose(name, patch) {
  const spread = await page.evaluate(async (p) => {
    Object.assign(window.relief.cam, p.cam);
    window.relief.ui.silh.checked = !!p.silhouettes;
    if (p.focus) window.relief.focus(p.focus.kind, p.focus.min ?? 0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // How much variety is on screen. A single flat colour means nothing drew.
    const gl = document.getElementById('gl');
    const s = document.createElement('canvas');
    s.width = 64; s.height = 40;
    s.getContext('2d').drawImage(gl, 0, 0, 64, 40);
    const d = s.getContext('2d').getImageData(0, 0, 64, 40).data;
    let lo = 255, hi = 0;
    for (let i = 0; i < d.length; i += 4) {
      const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    return hi - lo;
  }, patch);
  check(spread > 20, `${name} drew a picture (range ${Math.round(spread)})`);
  if (shots) await page.screenshot({ path: join(ROOT, `tools/shots/relief-${name}.png`) });
}

await pose('overhead', { cam: { yaw: 0.0, pitch: 1.35, dist: 8 } });
await pose('orbit', { cam: { yaw: 0.62, pitch: 0.55, dist: 8 } });
await pose('silhouettes', { cam: { yaw: 0.62, pitch: 0.55, dist: 8 }, silhouettes: true });
// The close-ups the modelling is judged against: a walled town with its
// houses and towers, and the cloister that the extrusion could never make.
await pose('town', { cam: { yaw: 0.9, pitch: 0.62, dist: 2.4 }, focus: { kind: 'city', min: 2 } });
await pose('cloister', { cam: { yaw: 2.0, pitch: 0.46, dist: 1.35 }, focus: { kind: 'monastery' } });

check(errors.length === 0, `no console errors${errors.length ? `: ${errors[0]}` : ''}`);

await browser.close();
server.close();
console.log(failed ? `\n${failed} failed\n` : '\nall good\n');
process.exit(failed ? 1 : 0);
