// ---------------------------------------------------------------------------
// The art review tool. Two jobs:
//
//   node tools/art.mjs             render tools/shots/contact-sheet.png — every
//                                  cloud tile and mark at 24/40/64/240px, side
//                                  by side, because art reviewed only at atlas
//                                  size ships mush at play size
//   node tools/art.mjs --measure   re-sample the reference images in docs/refs
//                                  and print their palettes and ink coverage
//
// The contact sheet is rendered in a real browser (same as tools/smoke.mjs),
// so it is the art the game actually draws, palette and all.
// ---------------------------------------------------------------------------

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

if (process.argv.includes('--measure')) {
  execFileSync('python3', ['-c', `
from PIL import Image
import numpy as np, collections, os
for f in sorted(os.listdir('docs/refs')):
    if not f.endswith('.jpg'): continue
    im = Image.open(f'docs/refs/{f}').convert('RGB')
    a = np.asarray(im).reshape(-1, 3)
    q = (a // 16) * 16 + 8
    keys = [tuple(c) for c in q[::23]]
    top = collections.Counter(keys).most_common(8)
    lum = a.mean(axis=1)
    print(f'{f}  {im.size}  ink {100*(lum<110).mean():.0f}%  medlum {np.median(lum):.0f}')
    print('  ', ' '.join(f'#{r:02x}{g:02x}{b:02x}' for (r,g,b),n in top))
`], { cwd: ROOT, stdio: 'inherit' });
  process.exit(0);
}

const PORT = 5223;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(req.url.split('?')[0]));
    const body = await readFile(join(ROOT, path === '/' ? 'index.html' : path));
    res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('nope'); }
});
await new Promise((r) => server.listen(PORT, r));
mkdirSync(join(ROOT, 'tools/shots'), { recursive: true });

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1460, height: 2600 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${PORT}/index.html`);
await page.waitForFunction(() => window.LAB && window.LAB.game);

await page.evaluate(async () => {
  const { TILE_TYPES } = await import('./src/tiles.js');
  const { drawTile } = await import('./src/art.js');
  const { usePalette } = await import('./src/theme.js');
  const { roughen } = await import('./src/ink.js');
  usePalette?.('chart');

  const SIZES = [24, 40, 64, 240];
  const ids = TILE_TYPES.filter((t) => t.group === 'cloud').map((t) => t.id);
  // …plus the base tiles Girando actually deals.
  for (const id of ['D', 'E', 'N', 'U', 'V', 'B', 'Gw', 'Gl']) ids.push(id);

  const sheet = document.createElement('div');
  sheet.style.cssText = 'position:fixed;inset:0;z-index:99;background:#d8c496;overflow:auto;'
    + 'display:flex;flex-wrap:wrap;gap:6px;padding:10px;align-content:flex-start';
  for (const id of ids) {
    const t = TILE_TYPES.find((x) => x.id === id);
    if (!t) continue;
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;align-items:flex-end;gap:4px;background:#cbb583;'
      + 'padding:4px;border:1px solid #8a7048';
    for (const px of SIZES) {
      const cv = document.createElement('canvas');
      cv.width = cv.height = px;
      cv.style.cssText = `width:${px}px;height:${px}px;image-rendering:auto`;
      const ctx = cv.getContext('2d');
      ctx.scale(px, px);
      drawTile(ctx, t, {});
      roughen(cv);                        // the sheet shows what the game shows
      cell.appendChild(cv);
    }
    const tag = document.createElement('div');
    tag.textContent = t.id;
    tag.style.cssText = 'font:10px monospace;color:#33251a;align-self:flex-start';
    cell.appendChild(tag);
    sheet.appendChild(cell);
  }
  document.body.appendChild(sheet);
});
await page.waitForTimeout(400);
await page.screenshot({ path: join(ROOT, 'tools/shots/contact-sheet.png'), fullPage: false });
console.log('tools/shots/contact-sheet.png');
await browser.close();
server.close();
