// ---------------------------------------------------------------------------
// One worker of the trainer: plays whole games and reports the result.
//
// It exists as a separate process rather than a function because a game costs
// a second and a half and there are four cores; the parent hands out one game
// at a time so a slow seed can't leave three workers idle.
//
// Never run directly — see tools/train.mjs.
// ---------------------------------------------------------------------------

import { Game } from '../src/game.js';
import { Bot } from '../src/ai.js';

const MAX_STEPS = 4000;

/** Which income stream a payout line belongs to, for the strategy report. */
const STREAM = [
  [/city of/i, 'blue cities'],
  [/^Road of/, 'yellow roads'],
  [/^Farm of/, 'green farms'],
  [/tiles? around it/, 'red temples'],
  [/windmill/, 'windmills'],
  [/turbine turns/, 'turbine gusts'],
  [/islands? at the end/, 'archipelago'],
];

process.on('message', ({ seed, trials, weights, hero, breakdown }) => {
  const game = new Game({ players: weights.length, seed, mode: 'girando' });
  // Where each seat's points came from — only when asked for, because it means
  // wrapping the payout path for the whole game.
  const streams = weights.map(() => ({}));
  if (breakdown) {
    const realPay = game.m.pay.bind(game.m);
    game.m.pay = (p, pts, line, cells) => {
      const key = (STREAM.find(([re]) => re.test(line)) || [null, 'other'])[1];
      streams[p][key] = (streams[p][key] || 0) + pts;
      return realPay(p, pts, line, cells);
    };
  }
  // Each seat thinks with its own weights. This is the whole point of the
  // exercise: two strategies, one board, one winner.
  game.m.brains = weights;
  const bots = game.players.map((p, i) => new Bot(game, i, {
    level: 'sharp', seed: seed * 31 + i, trials,
  }));

  let steps = 0;
  try {
    while (game.phase !== 'over' && steps++ < MAX_STEPS) bots[game.current].act();
  } catch (err) {
    // A crashed game is worse than useless as a data point — it would look
    // like a draw and quietly reward whatever caused it. Say so and score it
    // as a loss for the seat being measured.
    process.send({ error: String(err && err.stack ? err.stack.split('\n')[0] : err), margin: -1, scores: [0, 0], hero: 0 });
    return;
  }

  const scores = game.players.map((p) => p.score);
  const best = Math.max(...scores.filter((_, i) => i !== hero));
  process.send({
    margin: scores[hero] - best, scores, hero: scores[hero], steps,
    streams: breakdown ? streams[hero] : null,
    spheres: game.m.spheres, laid: game.m.laid,
  });
});
