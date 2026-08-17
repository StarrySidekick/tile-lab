// ---------------------------------------------------------------------------
// Stamp a build.
//
//   node tools/stamp.mjs                  bump the build number
//   node tools/stamp.mjs 0.10.0           …and set the version
//   node tools/stamp.mjs -m "what's new"  …and say what's in it
//
// Writes the same stamp to two places on purpose:
//
//   src/version.js   compiled into the page, so the badge shows what the code
//                    you are actually running was built from
//   version.json     fetched at boot past the cache, so the page can compare
//                    the two and tell you when what you're looking at is old
//
// That pair is the whole point. A version number baked into the app can only
// ever tell you what the app thinks it is; it can't tell you the browser
// handed you a stale copy, which is the failure you most want to catch after
// a deploy. Two copies, one of them uncacheable, answers it.
// ---------------------------------------------------------------------------

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

const args = process.argv.slice(2);
const at = args.indexOf('-m');
const label = at >= 0 ? args[at + 1] || '' : null;
const version = args.find((a, i) => /^\d+\.\d+\.\d+$/.test(a) && i !== at + 1) || null;

const current = await load();
const stamp = {
  version: version || current.version,
  build: (current.build || 0) + 1,
  date: new Date().toISOString().slice(0, 10),
  label: label == null ? current.label : label,
};

await writeFile(join(ROOT, 'src/version.js'),
  `// Written by tools/stamp.mjs. Don't edit by hand — run the tool, or the
// copy in version.json goes out of step and the page starts crying wolf.
export const VERSION = ${JSON.stringify(stamp, null, 2)};
`);

await writeFile(join(ROOT, 'version.json'), `${JSON.stringify(stamp, null, 2)}\n`);

// package.json exists only to mark src/ as ES modules, but it's the first
// place a person looks for a version, so keep it honest too.
try {
  const pkgPath = join(ROOT, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf8'));
  pkg.version = stamp.version;
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
} catch { /* no package.json is not a problem worth failing over */ }

console.log(`stamped v${stamp.version} · build ${stamp.build} · ${stamp.date}${stamp.label ? ` · ${stamp.label}` : ''}`);

async function load() {
  try {
    return JSON.parse(await readFile(join(ROOT, 'version.json'), 'utf8'));
  } catch {
    return { version: '0.1.0', build: 0, label: '' };
  }
}
