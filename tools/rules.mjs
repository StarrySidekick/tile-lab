// ---------------------------------------------------------------------------
// Fetch the official rulebooks.
//
//   node tools/rules.mjs            crawl, download and extract to the cache
//   node tools/rules.mjs --index    just re-print what the cache holds
//
// Hans im Glück publish every Carcassonne rulebook as a PDF on the game's own
// page, and the family index links every game. That is the primary source the
// fan wikis are summarising, it needs no scraping tricks to reach, and it is
// the thing to check a catalogue entry against.
//
// The extracted text is NOT committed: it's the publisher's copyrighted rules
// text, so it lives in a gitignored cache and this script is what reproduces
// it. What IS committed is the index — the URL each rulebook came from — so
// the provenance of a catalogue entry is checkable without shipping the text.
// ---------------------------------------------------------------------------

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CACHE = join(ROOT, '.rules-cache');
const INDEX = join(ROOT, 'tools/rules-index.json');
const FAMILY = 'https://www.hans-im-glueck.de/en/carcassonne-family/';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const get = async (url) => {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r;
};

/** Every Carcassonne game page HiG lists, plus the base game itself. */
async function gamePages() {
  const html = await (await get(FAMILY)).text();
  const found = [...html.matchAll(/href="(https:\/\/www\.hans-im-glueck\.de\/en\/game\/[^"]*)"/g)]
    .map((m) => m[1]);
  return [...new Set(['https://www.hans-im-glueck.de/en/game/carcassonne/', ...found])];
}

/**
 * The rulebooks on one game page. Both languages are listed; the English one
 * is preferred, but a mini that only ever shipped a bilingual German sheet is
 * still worth having, so anything is better than nothing.
 */
function rulebooksOn(html) {
  const pdfs = [...new Set([...html.matchAll(/href="([^"]*\.pdf)"/g)].map((m) => m[1]))];
  const english = pdfs.filter((u) => /(_|-)(en|EN)(_|-|\.)|rulebook|rules|rulesheet|supplement/i.test(u));
  return english.length ? english : pdfs;
}

async function extract(buf) {
  const { PDFParse } = await import('pdf-parse');
  const p = new PDFParse({ data: new Uint8Array(buf) });
  return (await p.getText()).text;
}

async function main() {
  await mkdir(CACHE, { recursive: true });

  if (process.argv.includes('--index')) {
    console.log(await readFile(INDEX, 'utf8'));
    return;
  }

  const pages = await gamePages();
  console.log(`${pages.length} game pages on the family index`);

  const index = [];
  for (const page of pages) {
    const slug = page.replace(/\/$/, '').split('/en/game/')[1].replace(/\//g, '--');
    let html;
    try { html = await (await get(page)).text(); } catch (e) {
      console.log(`  ✗ ${slug}: ${e.message}`);
      continue;
    }
    const pdfs = rulebooksOn(html);
    if (!pdfs.length) { console.log(`  – ${slug}: no rulebook linked`); continue; }

    const entry = { slug, page, rulebooks: [] };
    for (const [i, url] of pdfs.entries()) {
      const name = `${slug}${pdfs.length > 1 ? `-${i}` : ''}.txt`;
      const file = join(CACHE, name);
      entry.rulebooks.push({ url, text: `.rules-cache/${name}` });
      if (existsSync(file)) continue;
      try {
        const buf = Buffer.from(await (await get(url)).arrayBuffer());
        const text = await extract(buf);
        await writeFile(file, text);
        console.log(`  ✓ ${name.padEnd(52)} ${String(text.length).padStart(6)} chars`);
      } catch (e) {
        console.log(`  ✗ ${name}: ${e.message.slice(0, 60)}`);
      }
    }
    index.push(entry);
  }

  await writeFile(INDEX, `${JSON.stringify(index, null, 2)}\n`);
  const books = index.reduce((n, e) => n + e.rulebooks.length, 0);
  console.log(`\n${index.length} games · ${books} rulebooks · index written to tools/rules-index.json`);
}

main();
