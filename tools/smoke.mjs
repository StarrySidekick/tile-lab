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
        // Through canPlaceAt, not board.legalPlacements: the river only accepts
        // one square and one rotation, and a mode may veto anything it likes.
        const spots = [];
        if (g.m.piece) spots.push(...g.board.legalPiecePlacements(g.m.piece));
        else {
          const saved = g.rot;
          for (const { x, y } of g.board.candidates(g.placeOpts())) {
            for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) spots.push({ x, y, rot: r }); }
          }
          g.rot = saved;
        }
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

// The build stamp, which exists to answer "is this the version I just pushed"
// — so the thing worth checking is that it says something, and that it agrees
// with the copy the server hands out uncached.
{
  errors.length = 0;
  const v = await page.evaluate(async () => {
    const live = await (await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })).json();
    return {
      badge: document.getElementById('version').textContent.trim(),
      stale: document.getElementById('version').classList.contains('stale'),
      built: window.LAB.VERSION,
      live,
    };
  });
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (!/^v\d+\.\d+\.\d+ · b\d+$/.test(v.badge)) problems.push(`badge reads "${v.badge}"`);
  if (v.stale) problems.push('the page thinks it is stale against its own server');
  if (v.built.build !== v.live.build || v.built.version !== v.live.version) {
    problems.push(`src/version.js (b${v.built.build}) and version.json (b${v.live.build}) disagree — re-run tools/stamp.mjs`);
  }
  if (problems.length) { failures++; console.log(`  ✗ build stamp: ${problems.join(' · ')}`); }
  else console.log(`  ✓ build stamp       ${v.badge}`);
}

// Safari treats a second tap inside ~300ms as zoom-in, which made turning a
// tile twice in a hurry scale the whole app. `touch-action: manipulation` is
// the fix, and it has to stay off the elements that run their own gestures.
{
  const touch = await page.evaluate(() => {
    const of = (sel) => getComputedStyle(document.querySelector(sel)).touchAction;
    const btn = [...document.querySelectorAll('#actions button, #panel button')][0];
    return {
      button: btn ? getComputedStyle(btn).touchAction : null,
      body: of('body'),
      board: of('#board'),
      hudTile: of('#hudTile'),
      claimTile: of('#claimTile'),
    };
  });
  const problems = [];
  if (touch.button !== 'manipulation') problems.push(`buttons are "${touch.button}"`);
  if (touch.body !== 'manipulation') problems.push(`body is "${touch.body}"`);
  for (const own of ['board', 'hudTile', 'claimTile']) {
    if (touch[own] !== 'none') problems.push(`${own} lost its own gestures ("${touch[own]}")`);
  }
  if (problems.length) { failures++; console.log(`  ✗ double-tap zoom: ${problems.join(' · ')}`); }
  else console.log('  ✓ double-tap zoom    buttons "manipulation" · board keeps "none"');
}

// The input layer itself, through real pointer events rather than by calling
// the game — everything else in this file drives the rules directly, so a tap
// that stopped placing tiles would sail straight past it. Two passes: once with
// the confirm step off, where a tap plays at once and the interesting
// assertions are the negative ones (a drag and a pinch must NOT leave a tile
// behind), and once with it on, where it takes two taps — stage, then commit.
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
    document.getElementById('confirmPlace').checked = false;

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

    // A tap on a legal square, confirm step off: it plays there and then.
    const spot = game.board.legalPlacements(game.tile, game.placeOpts())[0];
    const [tx, ty] = renderer.toScreen(spot.x + 0.5, spot.y + 0.5);
    const before = game.board.size;
    game.rot = spot.rot;
    ev('pointerdown', 1, tx, ty);
    ev('pointerup', 1, tx, ty);
    out.tapped = game.board.size - before;
    return out;
  });

  // The same tap with the confirm step on. The first tap STAGES; every tap
  // after that only TURNS the staged tile, however many times you do it; and
  // the tile reaches the board when the checkmark in the confirm panel is
  // pressed and not before. The old behaviour — a second tap commits — meant
  // the gesture for "let me see it the other way round" was also the gesture
  // that ended the decision.
  await page.click('#newGame');
  const c = await page.evaluate(() => {
    const cv = document.getElementById('board');
    const r = cv.getBoundingClientRect();
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, clientX: r.left + x, clientY: r.top + y, pointerType: 'touch', isPrimary: true,
    }));
    const { renderer, game } = window.LAB;
    const out = {};
    document.getElementById('confirmPlace').checked = true;
    // A tile with more than one legal rotation, so "tap turns it" has
    // something to show; otherwise the turn is a no-op and proves nothing.
    let spot = null;
    for (let n = 0; n < 40 && !spot; n++) {
      const places = game.board.legalPlacements(game.tile, game.placeOpts());
      const first = places[0];
      const ways = first
        ? places.filter((p) => p.x === first.x && p.y === first.y).length : 0;
      if (ways > 1) spot = first;
      else { game.deck.push(game.deck.shift()); game.drawTile(); }
    }
    if (!spot) return { skip: true };
    const [tx, ty] = renderer.toScreen(spot.x + 0.5, spot.y + 0.5);
    const before = game.board.size;
    ev('pointerdown', tx, ty); ev('pointerup', tx, ty);
    out.staged = !!renderer.pending;
    out.rots = renderer.pending ? renderer.pending.rots.length : 0;
    out.stagedLaid = game.board.size - before;

    // The confirm panel is up, in the claim box's place, with a checkmark.
    out.panelUp = !document.getElementById('claim').hidden;
    out.hasCheck = !!document.querySelector('#claimActions button.check');

    // A second and third tap only turn it.
    const wasRot = renderer.pending.rot;
    ev('pointerdown', tx, ty); ev('pointerup', tx, ty);
    out.turned = renderer.pending && renderer.pending.rot !== wasRot;
    out.stillStaged = !!renderer.pending;
    out.tapLaid = game.board.size - before;

    // …and the checkmark is what puts it down.
    document.querySelector('#claimActions button.check').click();
    out.committed = game.board.size - before;
    out.cleared = !renderer.pending;
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
  if (c.skip) problems.push('no tile with two legal rotations to test with');
  if (!c.staged) problems.push('a tap did not stage a tile for confirming');
  if (c.stagedLaid) problems.push('staging a tile put it straight on the board');
  if (!c.rots) problems.push('a staged tile offered no rotations');
  if (!c.panelUp) problems.push('the confirm panel did not come up');
  if (!c.hasCheck) problems.push('the confirm panel had no checkmark');
  if (!c.turned) problems.push('a second tap did not turn the staged tile');
  if (!c.stillStaged) problems.push('a second tap unstaged the tile');
  if (c.tapLaid) problems.push('a second tap put the tile on the board');
  if (c.committed !== 1) problems.push('the checkmark did not place the staged tile');
  if (!c.cleared) problems.push('committing left the tile staged');
  if (problems.length) { failures++; console.log(`  ✗ touch input: ${problems.join(' · ')}`); }
  else console.log(`  ✓ touch input       tap places · drag pans · pinch ${t.start.toFixed(0)} → ${t.spread.toFixed(0)} → ${t.pinched.toFixed(0)} · tap turns, ✓ commits`);
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
        if (o.length) g.placeMeeple(o[0].i, o[0]); else g.skipMeeple();
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
  if (!fx.kinds.includes('tile')) problems.push('no tile flying in');
  if (!fx.kinds.includes('figure')) problems.push('no follower in flight');
  if (problems.length) { failures++; console.log(`  ✗ score effects: ${problems.join(' · ')}`); }
  else console.log(`  ✓ score effects     ${fx.kinds.join(', ')} · ${fx.bumped} row bumped`);
}

/**
 * Tick a rule in the workshop. Every layer is folded away by default and the
 * search box is the fastest way to a specific row, so this types the rule's
 * name in rather than hunting through <details> for it.
 *
 * A rule whose prerequisites aren't met is deliberately disabled by the panel —
 * you can't have a garden with no abbot — so switching one on means switching
 * on what it stands upon first. Turning off unwinds in the same order.
 */
async function setMech(page, id, on) {
  const needs = await page.evaluate(
    (m) => (window.LAB.MECHANICS.find((x) => x.id === m)?.needs || []).filter(
      (n) => !window.LAB.MECHANICS.find((x) => x.id === n)?.on,
    ),
    id,
  );
  if (on) for (const n of needs) await setMech(page, n, true);

  await page.fill('#mechSearch', id);
  await page.waitForTimeout(30);
  const box = `#mechanics input[data-mech="${id}"]`;
  await page.waitForSelector(box, { state: 'attached' });
  if (on) await page.check(box); else await page.uncheck(box);
  await page.fill('#mechSearch', '');
  await page.waitForTimeout(30);

  // Switching a prerequisite off already cascades its dependants off in the
  // panel, so unwinding only has to deal with what's left.
  if (!on) for (const n of needs) await setMech(page, n, false);
}

// The rest of the motion, one mode each, because each one is the only place
// its effect can happen: tiles blowing off the cloud, tiles going under the
// water, a region lighting up as it's counted, and the endgame paying out one
// feature at a time instead of all at once.
for (const [what, mode, mech, kind] of [
  ['drown', 'classic', 'tide', 'fall'],
  ['levy sweep', 'marches', null, 'sweep'],
]) {
  errors.length = 0;
  await page.selectOption('#mode', mode);
  if (mech) await setMech(page, mech, true);
  await page.click('#newGame');
  const got = await page.evaluate(async ([kind]) => {
    const g = window.LAB.game;
    const legal = () => {
      const out = [];
      const saved = g.rot;
      for (const { x, y } of g.board.candidates(g.placeOpts())) {
        for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) out.push({ x, y, rot: r }); }
      }
      g.rot = saved;
      return out;
    };
    for (let i = 0; i < 120 && g.phase !== 'over'; i++) {
      if (g.phase === 'market') g.takeFromMarket(0);
      else if (g.phase === 'place') {
        const s = legal()[0];
        if (!s) break;
        g.rot = s.rot;
        g.cellClick(s.x, s.y);
      } else if (g.phase === 'meeple') g.skipMeeple();
      else if (g.phase === 'move') {
        const w = g.walker;
        const p = w.visiblePawns.find((q) => w.select(q));
        const d = p ? [...w.reachable(p).values()] : [];
        if (p && d.length) { g.selectPawn(p); g.movePawn(d[0].x, d[0].y); } else g.holdPosition();
      } else break;
      if (window.LAB.fx.items.some((e) => e.kind === kind)) return true;
      await new Promise((r) => requestAnimationFrame(r));
    }
    return false;
  }, [kind]);
  if (mech) await setMech(page, mech, false);
  if (errors.length || !got) {
    failures++;
    console.log(`  ✗ ${what}: ${errors[0]?.split('\n')[0] || `no "${kind}" effect in ${mode}`}`);
  } else console.log(`  ✓ ${what.padEnd(17)} ${mode}`);
}

// Girando's wind, which is the one effect driven by the rules rather than by
// a score: a zephyr has to actually shove the board, and the tiles it shoved
// have to be drawn sliding rather than teleporting.
{
  errors.length = 0;
  await page.selectOption('#mode', 'girando');
  await page.click('#newGame');
  const wind = await page.evaluate(async () => {
    const g = window.LAB.game;
    // A gust that FIRES a tile out of the world did something, and did it
    // visibly — the tumble is drawn the same way the slide is. Counting only
    // `moves` made this a test of whether the wind happened to have somewhere
    // to push, which is luck rather than a rule.
    let gusts = 0, moved = 0;
    g.on((kind, data) => {
      if (kind !== 'gust') return;
      gusts++;
      moved += data.moves.length + (data.fell?.length || 0);
    });
    const legal = () => {
      const out = [];
      const saved = g.rot;
      for (const { x, y } of g.board.candidates(g.placeOpts())) {
        for (let r = 0; r < 4; r++) { g.rot = r; if (g.canPlaceAt(x, y)) out.push({ x, y, rot: r }); }
      }
      g.rot = saved;
      return out;
    };
    const seen = {};
    let steps = 0;
    for (; steps < 400 && g.phase !== 'over'; steps++) {
      seen[g.phase] = (seen[g.phase] || 0) + 1;
      if (g.phase === 'market') {
        // Take a zephyr the moment one is in hand, so this doesn't rely on luck.
        const z = g.market.findIndex((id) => id.startsWith('Kz'));
        g.takeFromMarket(z >= 0 ? z : 0);
      } else if (g.phase === 'place') {
        const s = legal()[0];
        if (!s) break;
        g.rot = s.rot;
        g.cellClick(s.x, s.y);
      } else if (g.phase === 'meeple') {
        const o = g.meepleOptions();
        if (o.length) g.placeMeeple(o[0].i, o[0]); else g.skipMeeple();
      } else if (g.phase === 'lift') {
        g.m.cancelLift();
      } else break;
      if (gusts && moved) break;
      // Let the render loop breathe now and then — the effects are made
      // synchronously, so this is for the picture, not for the test.
      if (steps % 16 === 15) await new Promise((r) => requestAnimationFrame(r));
    }
    return { mode: g.mode, gusts, moved, steps, seen, phase: g.phase };
  });
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (wind.mode !== 'girando') problems.push(`the mode was ${wind.mode}`);
  else if (!wind.gusts) {
    problems.push(`no zephyr in ${wind.steps} steps (${JSON.stringify(wind.seen)}, ended in "${wind.phase}")`);
  } else if (!wind.moved) problems.push('the wind did nothing at all');
  if (problems.length) { failures++; console.log(`  ✗ girando wind: ${problems.join(' · ')}`); }
  else console.log(`  ✓ girando wind      ${wind.gusts} gust(s), ${wind.moved} tiles moved or lost`);
}

// The endgame tally: many features settle in one frame, and they have to be
// shown one at a time or the result is a number changing.
{
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.click('#newGame');
  const tally = await page.evaluate(() => {
    const g = window.LAB.game;
    for (let i = 0; i < 900 && g.phase !== 'over'; i++) {
      if (g.phase === 'place') {
        const s = g.board.legalPlacements(g.tile, g.placeOpts())[0];
        if (!s) { g.finish(); break; }
        g.rot = s.rot;
        g.cellClick(s.x, s.y);
      } else if (g.phase === 'meeple') {
        const o = g.meepleOptions();
        if (o.length) g.placeMeeple(o[0].i, o[0]); else g.skipMeeple();
      } else break;
    }
    const born = window.LAB.fx.items.filter((e) => e.kind === 'float').map((e) => e.born);
    return { over: g.phase === 'over', n: born.length, spread: born.length ? Math.max(...born) - Math.min(...born) : 0 };
  });
  const problems = [];
  if (errors.length) problems.push(errors[0].split('\n')[0]);
  if (!tally.over) problems.push('the game never ended');
  else if (tally.n < 2) problems.push(`only ${tally.n} endgame scores`);
  else if (tally.spread < 200) problems.push(`${tally.n} scores landed within ${Math.round(tally.spread)}ms of each other`);
  if (problems.length) { failures++; console.log(`  ✗ endgame tally: ${problems.join(' · ')}`); }
  else console.log(`  ✓ endgame tally     ${tally.n} features over ${(tally.spread / 1000).toFixed(1)}s`);
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
// The catalogue lists rules that aren't built yet; those rows are disabled
// on purpose, so the sweep is over what the engine actually implements.
const mechanics = await page.evaluate(
  () => window.LAB.LIVE_MECHANICS.filter((m) => !m.on).map((m) => m.id),
);
for (const mech of mechanics) {
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await setMech(page, mech, true);
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
  await setMech(page, mech, false);
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

// --- the play surface -------------------------------------------------------
//
// Dragging a tile out of the hand, staging it, turning it only the ways it
// fits, committing, then claiming on a zoomed copy of it — the whole turn as
// a person actually performs it, which none of the checks above touch because
// they all drive the engine directly.
{
  errors.length = 0;
  await page.selectOption('#mode', 'classic');
  await page.fill('#seed', 'ui-probe');
  await page.click('#newGame');
  await page.waitForTimeout(250);

  const box = await page.locator('#board').boundingBox();
  const target = await page.evaluate(() => {
    const [sx, sy] = window.LAB.renderer.toScreen(1.5, 0.5);
    return { sx, sy };
  });
  const pv = await page.locator('#preview').boundingBox();
  await page.mouse.move(pv.x + pv.width / 2, pv.y + pv.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + target.sx, box.y + target.sy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(200);

  const staged = await page.evaluate(() => window.LAB.renderer.pending);
  const laid = await page.evaluate(() => window.LAB.game.board.size);
  if (!staged || staged.x !== 1 || staged.y !== 0) {
    failures++;
    console.log(`  ✗ drag to stage: ${errors[0] || JSON.stringify(staged)}`);
  } else if (laid !== 1) {
    failures++;
    console.log(`  ✗ drag to stage: it committed instead of staging (${laid} tiles)`);
  } else if (!staged.rots.length || staged.rots.some((r) => r < 0 || r > 3)) {
    failures++;
    console.log(`  ✗ drag to stage: bad rotations ${JSON.stringify(staged.rots)}`);
  } else console.log(`  ✓ drag to stage        ${staged.rots.length} rotation(s) fit`);

  // Only the legal rotations are reachable from the confirm step.
  const legal = await page.evaluate(() => {
    const g = window.LAB.game;
    const p = window.LAB.renderer.pending;
    const saved = g.rot;
    const ok = p.rots.every((r) => { g.rot = r; return g.canPlaceAt(p.x, p.y); });
    g.rot = saved;
    return ok;
  });
  if (!legal) { failures++; console.log('  ✗ staged rotations are all legal'); }
  else console.log('  ✓ staged rotations legal');

  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#actions button')].find((x) => /Place it here/.test(x.textContent));
    b?.click();
  });
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => ({
    size: window.LAB.game.board.size,
    phase: window.LAB.game.phase,
    pending: window.LAB.renderer.pending,
    claim: !document.querySelector('#claim').hidden,
  }));
  if (errors.length || after.size !== 2 || after.pending) {
    failures++;
    console.log(`  ✗ confirm places: ${errors[0] || JSON.stringify(after)}`);
  } else console.log(`  ✓ confirm places       phase "${after.phase}"`);

  if (after.phase === 'meeple') {
    if (!after.claim) { failures++; console.log('  ✗ the claim panel opens on the meeple step'); }
    else {
      const took = await page.evaluate(() => {
        const c = document.querySelector('#claimTile');
        const r = c.getBoundingClientRect();
        const g = window.LAB.game;
        // Claiming ends the turn, so game.player is somebody else by the time
        // we look — count the supply of whoever is claiming, by index.
        const who = g.current;
        const before = g.players[who].meeples;
        // Aim at the first spot through the real pointer path.
        const spots = window.LAB.claimSpots();
        if (!spots.length) return null;
        const sc = r.width / c.width;
        c.dispatchEvent(new PointerEvent('pointerdown', {
          clientX: r.left + spots[0].sx * sc,
          clientY: r.top + spots[0].sy * sc,
          bubbles: true,
        }));
        const cell = g.board.get(spots[0].x, spots[0].y);
        return { before, after: g.players[who].meeples, onTile: !!cell?.meeple };
      });
      if (!took || took.after !== took.before - 1 || !took.onTile) {
        failures++;
        console.log(`  ✗ claiming from the panel: ${JSON.stringify(took)}`);
      } else console.log('  ✓ claim from the panel');
    }
  }

  // Folding the panel away gives the board the whole window.
  const wide = await page.evaluate(() => document.querySelector('#board').clientWidth);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(200);
  const lean = await page.evaluate(() => ({
    lean: document.body.classList.contains('lean'),
    hud: !document.querySelector('#hud').hidden,
    w: document.querySelector('#board').clientWidth,
  }));
  if (!lean.lean || !lean.hud || lean.w <= wide) {
    failures++;
    console.log(`  ✗ lean mode: ${JSON.stringify(lean)}`);
  } else console.log(`  ✓ lean mode            board ${wide} → ${lean.w}px`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} failure(s)` : '\nbrowser: all good');
process.exit(failures ? 1 : 0);
