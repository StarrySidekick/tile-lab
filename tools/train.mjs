// ---------------------------------------------------------------------------
// Training the computer player, by playing it against itself.
//
//   node tools/train.mjs                      a default session, ~20 minutes
//   node tools/train.mjs --rounds 40 --games 16
//   node tools/train.mjs --report             just measure the current weights
//
// Soffiando's bot reads the board perfectly well — what is standing where, who
// holds it, what it would pay. What it cannot read is how much to CARE about a
// farm against a temple, or whether shoving a rival's follower into open sky is
// worth a placement. Those judgements live in `SOFFIANDO_WEIGHTS` as fifteen
// numbers, and in a mode this young every one of them is a guess.
//
// This replaces the guesses with a measurement.
//
// HOW IT WORKS, and why it is shaped this way:
//
//   IT SELECTS ON WINNING, NOT ON SCORING. The obvious objective — "make the
//     bot's score as large as possible" — is the wrong one, and badly. Both
//     seats are playing the same mode, so anything that inflates the board
//     inflates BOTH scores; a weight set that closes spheres constantly scores
//     enormously and also hands the same enormous score to its opponent. Win
//     rate against the champion is the only signal that separates "this is
//     good play" from "this makes big numbers happen".
//
//   EVERY MATCH IS PLAYED TWICE, SEATS SWAPPED. The first player in Soffiando
//     lays the tile that starts the weather, and over sixteen games that is
//     worth more than most of the weights are. Playing each seed from both
//     seats cancels it exactly, and halves the number of games needed to see
//     through the noise.
//
//   IT HILL-CLIMBS FROM THE INCUMBENT rather than running a population. With a
//     game costing a second and a half, a (1+λ) climb spends its budget on
//     more matches per candidate instead of more candidates — and the thing
//     that kills a noisy optimiser is accepting a mutant that got lucky, not
//     failing to consider enough of them.
//
//   A CHALLENGER HAS TO BEAT THE MARGIN, not merely win. Anything that only
//     draws level is noise wearing a hat.
//
// The result is written to tools/brains/<name>.json and printed as a block you
// can paste straight into SOFFIANDO_WEIGHTS.
// ---------------------------------------------------------------------------

import { fork } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { cpus } from 'node:os';
import { SOFFIANDO_WEIGHTS } from '../src/modes/soffiando.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'brains');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);

const ROUNDS = arg('rounds', 60);        // hill-climbing steps
const GAMES = arg('games', 20);          // seeds per match — doubled by the swap
const TRIALS = arg('trials', 60);        // bot search depth while training
const JOBS = arg('jobs', Math.max(1, Math.min(cpus().length - 1, 4)));
const SIGMA = 0.35;                      // mutation size, in log space
/**
 * How far past even a challenger has to land before it is believed. Forty
 * games puts the standard error on a win rate at about eight points, so
 * anything under this is a coin that came up heads a few too many times —
 * and a hill-climb that accepts noise walks away from a good answer as
 * happily as it walks toward one.
 */
const MARGIN = 0.08;

// --- the worker pool ---------------------------------------------------------
//
// One child per core, each playing whole games and reporting the result. Games
// are the unit of work rather than matches, so a slow seed can't leave three
// cores idle waiting for a fourth.

class Pool {
  constructor(n) {
    this.free = [];
    this.waiting = [];
    this.kids = Array.from({ length: n }, () => {
      const kid = fork(join(HERE, 'train-worker.mjs'), { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
      kid.busy = null;
      kid.on('message', (msg) => {
        const done = kid.busy;
        kid.busy = null;
        this.release(kid);
        done?.(msg);
      });
      this.free.push(kid);
      return kid;
    });
  }

  release(kid) {
    const next = this.waiting.shift();
    if (next) next(kid); else this.free.push(kid);
  }

  take() {
    const kid = this.free.pop();
    return kid ? Promise.resolve(kid) : new Promise((r) => this.waiting.push(r));
  }

  async run(job) {
    const kid = await this.take();
    return new Promise((resolve) => {
      kid.busy = resolve;
      kid.send(job);
    });
  }

  close() { for (const kid of this.kids) kid.kill(); }
}

// --- a match -----------------------------------------------------------------

/**
 * `a` against `b` over `games` seeds, each played twice with the seats
 * swapped. Returns a's win rate and the mean margin, plus the raw scores so a
 * session can say how high the numbers actually got.
 */
async function match(pool, a, b, games, seedBase = 1, breakdown = false) {
  const jobs = [];
  for (let i = 0; i < games; i++) {
    const seed = seedBase + i;
    jobs.push({ seed, trials: TRIALS, weights: [a, b], hero: 0, breakdown });
    jobs.push({ seed, trials: TRIALS, weights: [b, a], hero: 1, breakdown });
  }
  const out = await Promise.all(jobs.map((j) => pool.run(j)));
  let wins = 0, draws = 0, margin = 0, top = 0, mine = 0, spheres = 0;
  const streams = {};
  for (const r of out) {
    if (r.error) console.log(`    ! ${r.error}`);
    if (r.margin > 0) wins++; else if (r.margin === 0) draws++;
    margin += r.margin;
    top = Math.max(top, ...r.scores);
    mine += r.hero;
    spheres += r.spheres || 0;
    for (const [k, v] of Object.entries(r.streams || {})) streams[k] = (streams[k] || 0) + v;
  }
  const n = out.length;
  for (const k of Object.keys(streams)) streams[k] = Math.round(streams[k] / n);
  return {
    rate: (wins + draws * 0.5) / n,
    margin: margin / n,
    top,
    mean: mine / n,
    spheres: spheres / n,
    streams,
    games: n,
  };
}

// --- mutation ----------------------------------------------------------------
//
// Multiplicative, because every weight here is a scale on something rather than
// an offset: halving and doubling should be the same size of step. The two that
// can legitimately be negative are perturbed additively instead.

const SIGNED = new Set(['turbineTheirs']);

function mutate(w, rng, sigma = SIGMA) {
  const out = { ...w };
  const keys = Object.keys(w);
  // Two or three at a time. One at a time is too slow to escape a saddle;
  // all fifteen at once is a random restart wearing a costume.
  const n = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < n; i++) {
    const k = keys[Math.floor(rng() * keys.length)];
    const step = gauss(rng) * sigma;
    out[k] = SIGNED.has(k) ? round(w[k] + step * 2) : round(w[k] * Math.exp(step));
  }
  return out;
}

const round = (v) => Math.round(v * 1000) / 1000;

function gauss(rng) {
  const u = Math.max(1e-9, rng());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- the session -------------------------------------------------------------

/** What a measured match actually says, in the mode's own units. */
function report(r) {
  console.log(`  win rate ${(r.rate * 100).toFixed(1)}% over ${r.games} games`
    + ` · mean margin ${r.margin >= 0 ? '+' : ''}${r.margin.toFixed(1)}`
    + ` · mean score ${r.mean.toFixed(0)} · best single score ${r.top}`
    + ` · ${r.spheres.toFixed(1)} spheres a game`);
  const rows = Object.entries(r.streams).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((n, [, v]) => n + v, 0) || 1;
  console.log('  where its points came from, per game:');
  for (const [k, v] of rows) {
    console.log(`    ${k.padEnd(14)} ${String(v).padStart(4)}  ${'█'.repeat(Math.round(28 * v / total))}`);
  }
}

function show(w, base = SOFFIANDO_WEIGHTS) {
  return Object.keys(w).map((k) => {
    const drift = base[k] === 0 ? 0 : (w[k] - base[k]) / Math.abs(base[k] || 1);
    const mark = Math.abs(drift) < 0.08 ? ' ' : (drift > 0 ? '↑' : '↓');
    return `${mark} ${k}: ${w[k]}`;
  }).join('\n  ');
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const pool = new Pool(JOBS);
  const rng = mulberry(20260823);
  const t0 = Date.now();

  try {
    // --- the sweep ---------------------------------------------------------
    //
    // One weight at a time, halved and doubled, each measured against the
    // shipped set. A hill-climb tells you where it ended up; this tells you
    // which of the fifteen numbers the mode is actually SENSITIVE to, and in
    // which direction — which is the more useful thing to know about a rule
    // set somebody is still writing. Embarrassingly parallel, and immune to
    // the path-dependence that makes a climb hard to read.
    if (flag('sweep')) {
      const keys = Object.keys(SOFFIANDO_WEIGHTS);
      console.log(`Sweeping ${keys.length} weights x2 directions, `
        + `${GAMES * 2} games each, ${JOBS} workers.`);
      const rows = [];
      for (const k of keys) {
        for (const [label, mul] of [['halved', 0.5], ['doubled', 2]]) {
          const w = { ...SOFFIANDO_WEIGHTS, [k]: round(SOFFIANDO_WEIGHTS[k] * mul) };
          if (w[k] === SOFFIANDO_WEIGHTS[k]) continue;
          const r = await match(pool, w, SOFFIANDO_WEIGHTS, GAMES, 50001);
          // Dead level on BOTH counts is the signature of a weight that
          // changed nothing at all: with the seats swapped, two identical
          // players give every pair a margin of +x and −x, which sums to
          // exactly zero and splits the wins exactly evenly. A weight that
          // does that is a weight that isn't wired to a decision — a pure
          // scale on a comparison, or a branch nothing reaches.
          const inert = r.rate === 0.5 && r.margin === 0;
          rows.push({ k, label, to: w[k], rate: r.rate, margin: r.margin, inert });
          console.log(`  ${k.padEnd(14)} ${label.padEnd(8)} → ${String(w[k]).padEnd(7)}`
            + ` ${(r.rate * 100).toFixed(0).padStart(3)}% (${r.margin >= 0 ? '+' : ''}${r.margin.toFixed(0)})`
            + `${inert ? '   ← INERT: changed nothing' : ''}`);
        }
      }
      const dead = [...new Set(rows.filter((r) => r.inert).map((r) => r.k))]
        .filter((k) => rows.filter((r) => r.k === k).every((r) => r.inert));
      if (dead.length) {
        console.log(`\nInert — these are not wired to any decision: ${dead.join(', ')}`);
      }
      rows.sort((a, b) => Math.abs(b.rate - 0.5) - Math.abs(a.rate - 0.5));
      console.log('\nWhat the mode is most sensitive to, strongest first:');
      for (const r of rows.slice(0, 10)) {
        const verdict = r.rate > 0.5 ? 'BETTER' : 'worse';
        console.log(`  ${r.k.padEnd(14)} ${r.label.padEnd(8)} ${verdict.padEnd(7)}`
          + ` ${(r.rate * 100).toFixed(0)}%`);
      }
      return;
    }

    if (flag('report')) {
      const name = process.argv[process.argv.indexOf('--report') + 1];
      const brain = name && existsSync(join(OUT, `${name}.json`))
        ? JSON.parse(readFileSync(join(OUT, `${name}.json`), 'utf8')).weights
        : SOFFIANDO_WEIGHTS;
      console.log(`Measuring against the shipped weights, ${GAMES * 2} games…`);
      const r = await match(pool, brain, SOFFIANDO_WEIGHTS, GAMES, 90001, true);
      report(r);
      return;
    }

    let champ = { ...SOFFIANDO_WEIGHTS };
    let accepted = 0;
    let bestTop = 0;
    console.log(`Training Soffiando: ${ROUNDS} rounds x ${GAMES * 2} games, `
      + `${JOBS} workers, ${TRIALS} trials/turn.`);

    for (let round = 1; round <= ROUNDS; round++) {
      const challenger = mutate(champ, rng);
      const r = await match(pool, challenger, champ, GAMES, 1 + round * 97);
      bestTop = Math.max(bestTop, r.top);
      const changed = Object.keys(challenger)
        .filter((k) => challenger[k] !== champ[k])
        .map((k) => `${k} ${champ[k]}→${challenger[k]}`).join(', ');
      const took = r.rate > 0.5 + MARGIN;
      if (took) { champ = challenger; accepted++; }
      const mins = ((Date.now() - t0) / 60000).toFixed(1);
      console.log(`  ${String(round).padStart(2)}/${ROUNDS} ${took ? 'TAKE' : 'keep'} `
        + `${(r.rate * 100).toFixed(0)}% (${r.margin >= 0 ? '+' : ''}${r.margin.toFixed(0)}) `
        + `· ${mins}m · ${changed}`);
    }

    // What did it actually learn? Measured fresh, on seeds it never trained on,
    // and broken down by where the points came from — which is the answer to
    // "what strategy is this", stated in the mode's own units.
    console.log('\nValidating against the shipped weights on unseen seeds…');
    const check = await match(pool, champ, SOFFIANDO_WEIGHTS, Math.max(GAMES, 16), 90001, true);
    report(check);

    const name = `soffiando-${new Date(t0).toISOString().slice(0, 10)}`;
    writeFileSync(join(OUT, `${name}.json`), `${JSON.stringify({
      mode: 'soffiando', rounds: ROUNDS, games: GAMES * 2, trials: TRIALS,
      accepted, validation: check, weights: champ,
    }, null, 2)}\n`);
    console.log(`\n${accepted} of ${ROUNDS} challengers taken. Written to tools/brains/${name}.json`);
    console.log(`\nLearned weights (↑↓ = moved from shipped):\n  ${show(champ)}`);
    console.log(`\nBest single score seen while training: ${bestTop}`);
  } finally {
    pool.close();
  }
}

main();
