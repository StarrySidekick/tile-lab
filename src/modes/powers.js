// ---------------------------------------------------------------------------
// Asymmetric powers — each player breaks one rule, and everyone can see which.
//
// The cheapest way to make any of the twelve modes replayable: the board is
// the same and the deck is the same, but what a road is WORTH is no longer the
// same question for everybody at the table. You stop playing the board and
// start playing the person whose cities are worth more than yours.
//
// Public, not secret. Hidden agendas already occupy the bluffing space, and a
// hidden power would just be an agenda you cannot plan around — the interest
// here is in everyone knowing the mason wants the cathedral and racing him for
// it anyway.
//
// Every power resolves at ONE of two places the engine already asks a
// question: `Game.award()`, where a closed feature pays its winners, and the
// follower supply at setup. Nothing here needs a new hook, which is why it is
// cheap. A power that needed a third would want the dialog work listed under
// "Prompts for the auto-resolved choices" in MODES.md first.
// ---------------------------------------------------------------------------

/**
 * `bonus(d, ctx)` returns EXTRA points on top of what the feature already pays
 * this player, or 0. `ctx` is `{ final, value, game }` — `value` being what the
 * feature is worth before the power touches it, so a power can double rather
 * than only add.
 */
export const POWERS = [
  {
    id: 'mason', name: 'The Mason',
    note: 'Your closed cities pay 2 more for every tile in them.',
    bonus: (d, { final }) => (d.type === 'city' && !final ? d.tiles.size * 2 : 0),
  },
  {
    id: 'wayfarer', name: 'The Wayfarer',
    note: 'Your closed roads pay 2 more for every tile in them.',
    bonus: (d, { final }) => (d.type === 'road' && !final ? d.tiles.size * 2 : 0),
  },
  {
    id: 'abbot', name: 'The Abbot',
    note: 'Every monastery you complete pays 5 more.',
    bonus: (d, { final }) => (d.type === 'monastery' && !final ? 5 : 0),
  },
  {
    id: 'hermit', name: 'The Hermit',
    note: 'At the end, your unfinished features pay what a finished one would.',
    // valueOf() has already halved it, so the top-up is the difference. Asking
    // the game rather than doubling `value`, because half of an odd number has
    // been rounded and doubling it back would not land on the real figure.
    bonus: (d, { final, value, game }) => (final ? Math.max(0, game.valueOf(d, false) - value) : 0),
  },
  {
    id: 'recruiter', name: 'The Recruiter',
    note: 'You start with two extra followers.',
    meeples: 2,
  },
  {
    id: 'steward', name: 'The Steward',
    note: 'A tie for a feature goes to you alone.',
    tiebreak: true,
  },
];

export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));
