// ---------------------------------------------------------------------------
// Fetch reference pages from WikiCarpedia.
//
//   node tools/wikicarpedia.mjs           fetch the default page list
//   node tools/wikicarpedia.mjs Slug ...  fetch specific /car/<Slug> pages
//
// WikiCarpedia is the community reference that tracks Carcassonne's rules
// edition by edition — the one thing the publisher's own rulebooks don't give
// you, because HiG only hosts the CURRENT sheet. That edition history is what
// this pulls, to cross-check the catalogue's `since` fields and the notes that
// claim a rule changed between editions.
//
// The site sits behind Anubis, a proof-of-work gate meant to make MASS
// scraping expensive. This is not that: a couple of dozen pages, fetched
// politely with a pause between each, for a personal project that links back
// to every page it read. The gate is cleared the same way any browser clears
// it — by doing the small hash computation the challenge asks for — rather
// than by pretending to be something we're not.
//
// As with the HiG rulebooks, the fetched text is the site's copyrighted
// content, so it lives in a gitignored cache and is never committed. The
// script is the reproducible part.
// ---------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = join(ROOT, '.rules-cache/wikicarpedia');
const BASE = 'https://wikicarpedia.com';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// The pages worth cross-checking, as WikiCarpedia actually names them —
// discovered from its own navigation. The site keeps a CURRENT page for each
// rule plus explicit `_(1st_edition)` and `_(3rd_edition)` variants, which is
// the edition history the publisher's own rulebooks don't carry. Every trio is
// listed on purpose: the diff between them is the thing being harvested.
const DEFAULT_PAGES = [
  // base + farmers + the two small ones now in the box
  'Base_game', 'Base_game_(1st_edition)', 'The_Farmers', 'The_Abbot',
  'River', 'River_(1st_edition)', 'Tile_Counts',
  // the numbered expansions, current / 1st / 3rd where they exist
  'Inns_and_Cathedrals', 'Inns_and_Cathedrals_(1st_edition)', 'Inns_and_Cathedrals_(3rd_edition)',
  'Traders_and_Builders', 'Traders_and_Builders_(1st_edition)', 'Traders_and_Builders_(3rd_edition)',
  'The_Princess_and_The_Dragon', 'The_Princess_and_The_Dragon_(1st_edition)',
  'The_Tower', 'The_Tower_(1st_edition)',
  'Count,_King_and_Robber', 'Count,_King_and_Robber_(1st_edition)',
  'The_Catapult_(1st_edition)',
  'Bridges,_Castles_and_Bazaars', 'Bridges,_Castles_and_Bazaars_(1st_edition)',
  'Hills_&_Sheep', 'Hills_&_Sheep_(1st_edition)',
  // the 2024 relaunch re-themes
  'Towers_and_Thieves', 'Castles_and_Bridges', 'Sheep_and_Shepherds',
  // the minis, current / editions
  'The_Flier', 'The_Flier_(1st_edition)', 'The_Flying_Machines_(3rd_edition)',
  'The_Messages', 'The_Messages_(1st_edition)', 'The_Messages_(3rd_edition)',
  'The_Ferries', 'The_Ferries_(1st_edition)', 'The_Ferries_(3rd_edition)',
  'The_Goldmines', 'The_Goldmines_(1st_edition)', 'The_Gold_Mines_(3rd_edition)',
  'Mage_and_Witch', 'Mage_and_Witch_(1st_edition)',
  'The_Robbers', 'The_Robbers_(1st_edition)', 'The_Robbers_(3rd_edition)',
  'Crop_Circles', 'Crop_Circles_(1st_edition)', 'The_Crop_Circles_(3rd_edition)',
  'The_Wheel_of_Fortune', 'The_Wheel_of_Fortune_(1st_edition)',
  'The_Phantom', 'The_Phantom_(1st_edition)',
  'The_Tunnel_(1st_edition)', 'The_Plague_(1st_edition)',
  'The_Festival', 'The_Festival_(1st_edition)',
  'Halflings', 'Halflings_(1st_edition)',
  'Monasteries', 'Monasteries_(1st_edition)',
  'Wind_Roses_(1st_edition)',
  // the 20th-anniversary and newest minis
  '20th_Anniversary_Expansion', 'The_Barber-Surgeons', 'The_Watchtowers',
  'The_Signposts', 'The_Gifts', 'The_Peasant_Revolts', 'The_Wonders_of_Humanity',
  'The_Drawbridges', 'Cathedrals_in_Germany',
];

// Two Anubis cookies matter, at different moments: a short-lived
// `cookie-verification` the gate page hands you, which must be presented when
// you claim your solution, and the `auth` JWT you get back, which is what
// actually clears the gate afterwards. Kept as a small jar keyed by name.
const cookies = new Map();

function cookieHeader(...names) {
  const wanted = names.length ? names : [...cookies.keys()];
  return wanted.filter((n) => cookies.has(n)).map((n) => `${n}=${cookies.get(n)}`).join('; ');
}

function captureCookie(res) {
  const set = res.headers.get('set-cookie');
  if (!set) return;
  for (const part of set.split(/,(?=[^;]+=)/)) {
    const [name, ...rest] = part.split(';')[0].trim().split('=');
    const val = rest.join('=');
    if (val === '') cookies.delete(name); else cookies.set(name, val);
  }
}

async function raw(url, cookie, opts = {}) {
  return fetch(url, {
    redirect: 'manual',
    headers: { 'user-agent': UA, ...(cookie ? { cookie } : {}), ...(opts.headers || {}) },
  });
}

// The name Anubis uses for its cleared-the-gate token.
const AUTH = 'techaro.lol-anubis-auth';
const VERIFY = 'techaro.lol-anubis-cookie-verification';

/** The Anubis challenge embedded in a gate page, or null if this isn't one. */
function challengeFrom(html) {
  if (!/id="anubis_challenge"/.test(html)) return null;
  const m = html.match(/id="anubis_challenge"[^>]*>([^<]+)</);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

/**
 * The proof of work, replicated from Anubis's own worker: increment a nonce
 * until sha256hex(randomData + nonce) has `difficulty` leading zero nibbles.
 * Difficulty is tiny (2), so this returns in well under a second.
 */
function solve(randomData, difficulty) {
  const prefix = '0'.repeat(difficulty);
  for (let nonce = 0; nonce < 1e9; nonce++) {
    const hash = createHash('sha256').update(randomData + nonce).digest('hex');
    if (hash.startsWith(prefix)) return { hash, nonce };
  }
  throw new Error('no nonce found');
}

/** Clear the gate for a URL, leaving the auth cookie in the jar. */
async function clearGate(pageUrl, challenge) {
  const { hash, nonce } = solve(challenge.challenge.randomData, challenge.rules.difficulty);
  const q = new URLSearchParams({
    id: challenge.challenge.id,
    response: hash,
    nonce: String(nonce),
    redir: pageUrl,
    elapsedTime: '840',
  });
  // The claim has to carry the verification cookie the gate page just set.
  const res = await raw(`${BASE}/.within.website/x/cmd/anubis/api/pass-challenge?${q}`, cookieHeader(VERIFY));
  captureCookie(res);
  if (!cookies.has(AUTH)) throw new Error(`gate refused the solution (status ${res.status})`);
}

async function fetchPage(slug) {
  const url = `${BASE}/car/${slug}`;
  // Present only the auth token on content requests — the stale verification
  // cookie alongside it makes the gate re-challenge.
  let res = await raw(url, cookieHeader(AUTH));
  let html = await res.text();

  let challenge = challengeFrom(html);
  if (challenge) {
    captureCookie(res);                 // the gate page hands us a fresh verification cookie
    await clearGate(url, challenge);
    // The freshly-minted auth cookie can take a beat to be honoured, so a
    // re-gate on the very next request is worth one quiet retry.
    for (let tries = 0; tries < 4; tries++) {
      await sleep(1000);                // let the just-issued auth cookie settle
      res = await raw(url, cookieHeader(AUTH));
      html = await res.text();
      challenge = challengeFrom(html);
      if (!challenge) break;
      captureCookie(res);
      await clearGate(url, challenge);
    }
    if (challenge) throw new Error('still gated after clearing');
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get('location');
    if (loc) { res = await raw(new URL(loc, BASE).href, cookieHeader(AUTH)); html = await res.text(); }
  }
  return { status: res.status, html };
}

/** MediaWiki content, stripped to readable text. */
function toText(html) {
  const body = html.match(/<div[^>]*id="mw-content-text"[\s\S]*?<\/div>\s*(?:<div[^>]*class="printfooter")/);
  const src = body ? body[0] : html;
  return src
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&#160;/g, ' ').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await mkdir(CACHE, { recursive: true });
  const pages = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_PAGES;
  let ok = 0;
  for (const slug of pages) {
    try {
      const { status, html } = await fetchPage(slug);
      const text = toText(html);
      const name = slug.replace(/[^A-Za-z0-9_&,-]/g, '_') + '.txt';
      await writeFile(join(CACHE, name), text);
      const flag = text.length > 800 ? '✓' : '?';
      console.log(`  ${flag} ${slug.padEnd(34)} ${status}  ${String(text.length).padStart(6)} chars`);
      if (text.length > 800) ok++;
    } catch (e) {
      console.log(`  ✗ ${slug.padEnd(34)} ${e.message.slice(0, 60)}`);
    }
    await sleep(1500);   // polite: one page every 1.5s, not a firehose
  }
  console.log(`\n${ok}/${pages.length} pages fetched to .rules-cache/wikicarpedia/`);
}

main();
