// ---------------------------------------------------------------------------
// The Chronicle — story mode, with D&D bones.
//
// The game supplies nouns and structure; the people at the table supply
// meaning. What you take away isn't a score, it's a log you can read back.
//
// Every tile you lay produces a PROMPT built from the tile itself — its
// features, its landmark, the name the generator gives the place. You don't
// get a blank box: you get three endings and pick one. Authored constraint
// rather than blank-page paralysis, which is the difference between a
// journalling game people finish and one they abandon on turn four.
//
// Underneath it there are three things keeping it a game rather than a toy:
//
//   NAMES    every site gets one, seeded, so (3,-2) becomes Ashfen Mill and
//            the log reads like a travelogue instead of coordinates
//   CLOCKS   threads that fill as certain tiles come up; when one fills,
//            something happens and the scene turns
//   ORACLE   yes/no/and/but, for when the table genuinely doesn't know
//
// The chronicle exports as markdown, because the output being shareable is
// the whole point of the mode.
// ---------------------------------------------------------------------------

import { Mode } from './mode.js';
import { buildDeck, MARKS } from '../tiles.js';

const HEAD = ['Ash', 'Bram', 'Cold', 'Dun', 'Elder', 'Fen', 'Grim', 'Hollow', 'Iron', 'Kel', 'Long', 'Mire', 'North', 'Oak', 'Raven', 'Salt', 'Thorn', 'West', 'Wyrm', 'Yarrow'];
const TAIL = ['fen', 'ford', 'gate', 'hollow', 'march', 'mill', 'moor', 'reach', 'rest', 'stead', 'wick', 'combe', 'barrow', 'cross', 'watch'];

const ORACLE = [
  'No, and it is worse than that.', 'No.', 'No, but there is a way through.',
  'Yes, but it costs you.', 'Yes.', 'Yes, and more than you hoped.',
];

/** Prompt frames, keyed by what the tile actually is. */
const FRAMES = {
  city: {
    lead: (n) => `You come within sight of ${n}, walled and watchful.`,
    options: ['The gates stand open, and nobody is manning them.', 'They are expecting someone. Not you.', 'A market day — the noise carries a mile.', 'Smoke, and it is not chimney smoke.', 'The walls are new. Whatever they fear is recent.'],
  },
  road: {
    lead: (n) => `The road runs on toward ${n}.`,
    options: ['You are not the only thing travelling it tonight.', 'Someone has left a marker at the crossing, meant for you.', 'It is a good road, and that is suspicious in itself.', 'Cart ruts, deep and fresh, going the other way. Fast.', 'The milestones have been defaced, every one.'],
  },
  monastery: {
    lead: (n) => `${n} keeps a bell, and the bell is ringing.`,
    options: ['The brothers will not say for whom.', 'It has been ringing since before you arrived.', 'They offer bread, a bed, and one question each.', 'Nobody has rung it. It is ringing anyway.', 'There is a name in their book you recognise.'],
  },
  wild: {
    lead: (n) => `Open country. The locals call this stretch ${n}.`,
    options: ['Nothing grows here in a straight line.', 'You find a boundary stone from a kingdom nobody remembers.', 'The wind changes, and so does the temperature.', 'Something has been through here ahead of you.', 'It is beautiful, and you do not trust it.'],
  },
};

/** Landmarks get their own frames — they're the strongest prompts on a tile. */
const SITE_FRAMES = {
  village:  ['They have a problem they will not name.', 'They want you gone before dark, politely.', 'A child follows you the length of the street.'],
  ruin:     ['Someone has been digging, recently and badly.', 'The stone is older than any kingdom you know.', 'There is a door, and it is the wrong shape.'],
  cave:     ['Cold air comes out of it steadily, like breath.', 'There are marks around the mouth. Warnings, or a tally.', 'You can hear water a long way down.'],
  shrine:   ['The offerings are fresh. Nobody lives within a day of here.', 'It is dedicated to a god you were told was dead.', 'You feel better for stopping. That is the worry.'],
  tower:    ['A light shows at the top, and goes out as you look.', 'It was built to watch something specific.', 'The door is barred from the inside.'],
  merchant: ['She has exactly the thing you need, which is the problem.', 'He will not take coin. He wants a favour.', 'The wagon is far too heavy for what is in it.'],
  camp:     ['The fire is warm. There is nobody here.', 'Three bedrolls, two people.', 'You are being offered a place at the fire. By whom is unclear.'],
  stronghold: ['The banner is one you have fought under. Or against.', 'The garrison is half what it should be.', 'They open the gate before you knock.'],
};

const CLOCK_TEMPLATES = [
  { text: 'Something is following the party', size: 6, ticks: ['wolves', 'bandit', 'ruin', 'barrow'] },
  { text: 'The road home is closing', size: 4, ticks: ['cave', 'tower', 'beacon'] },
  { text: 'Word of you is spreading', size: 6, ticks: ['village', 'merchant', 'market', 'tavern'] },
];

export class Chronicle extends Mode {
  deck() { return buildDeck(this.game.groups, this.game.rng, 'D', 45); }

  setup() {
    this.entries = [];
    this.names = new Map();
    this.pending = null;
    this.clocks = CLOCK_TEMPLATES.map((c) => ({ ...c, filled: 0, done: false }));
    this.oracleResult = null;
    this.entries.push({ turn: 0, who: '', text: 'The chronicle opens at a crossroads, with nothing decided.' });
  }

  // --- naming ---------------------------------------------------------------

  nameFor(x, y) {
    const k = `${x},${y}`;
    if (!this.names.has(k)) {
      const head = HEAD[Math.floor(this.game.rng() * HEAD.length)];
      const tail = TAIL[Math.floor(this.game.rng() * TAIL.length)];
      this.names.set(k, head + tail);
    }
    return this.names.get(k);
  }

  // --- prompts --------------------------------------------------------------

  afterPlace(cell) {
    this.pending = this.promptFor(cell);
    this.tickClocks(cell);
    return 'story';
  }

  promptFor(cell) {
    const name = this.nameFor(cell.x, cell.y);
    const site = cell.type.marks.find((m) => SITE_FRAMES[m.kind]);
    if (site) {
      const info = MARKS[site.kind] || { label: site.kind };
      return {
        lead: `${name}. A ${info.label.toLowerCase()} stands here.`,
        options: pick3(SITE_FRAMES[site.kind], this.game.rng),
      };
    }
    const kind = cell.type.feats.some((f) => f.type === 'city') ? 'city'
      : cell.type.feats.some((f) => f.type === 'monastery') ? 'monastery'
      : cell.type.feats.some((f) => f.type === 'road') ? 'road'
      : 'wild';
    const frame = FRAMES[kind];
    return { lead: frame.lead(name), options: pick3(frame.options, this.game.rng) };
  }

  /** Pick one of the three endings; that's the turn. */
  choose(i) {
    if (!this.pending || !this.pending.options[i]) return false;
    const text = `${this.pending.lead} ${this.pending.options[i]}`;
    this.entries.push({ turn: this.game.turn, who: this.game.player.name, text });
    this.game.say(text);
    this.game.emit('landmark');
    this.pending = null;
    this.oracleResult = null;
    this.game.endTurn();
    return true;
  }

  /** Write your own instead of taking one of the three. */
  writeOwn(text) {
    if (!this.pending || !text) return false;
    this.entries.push({ turn: this.game.turn, who: this.game.player.name, text: `${this.pending.lead} ${text}` });
    this.pending = null;
    this.oracleResult = null;
    this.game.endTurn();
    return true;
  }

  // --- clocks and oracle ----------------------------------------------------

  tickClocks(cell) {
    const kinds = cell.type.marks.map((m) => m.kind);
    for (const clock of this.clocks) {
      if (clock.done || !clock.ticks.some((t) => kinds.includes(t))) continue;
      clock.filled++;
      if (clock.filled >= clock.size) {
        clock.done = true;
        const line = `— ${clock.text}. It arrives.`;
        this.entries.push({ turn: this.game.turn, who: '', text: line });
        this.game.say(line);
        this.game.emit('score');
      } else {
        this.game.say(`${clock.text} — ${clock.filled}/${clock.size}`);
      }
    }
  }

  oracle() {
    this.oracleResult = ORACLE[Math.floor(this.game.rng() * ORACLE.length)];
    this.game.say(`Oracle: ${this.oracleResult}`);
    this.game.emit('rotate');
    return this.oracleResult;
  }

  // --- output ---------------------------------------------------------------

  toMarkdown() {
    const head = `# A chronicle\n\n*${this.entries.length - 1} entries · ${this.game.board.size} places · seed ${this.game.seed ?? 'random'}*\n\n`;
    const body = this.entries.map((e) => (e.who ? `**${e.who}.** ${e.text}` : `*${e.text}*`)).join('\n\n');
    const clocks = `\n\n---\n\n## Threads\n\n${this.clocks.map((c) => `- ${c.done ? '**✦**' : '○'} ${c.text} — ${Math.min(c.filled, c.size)}/${c.size}`).join('\n')}\n`;
    return head + body + clocks;
  }

  finish() {
    this.game.players.forEach((p) => { p.score = this.entries.length - 1; });
    this.game.say(`The chronicle closes with ${this.entries.length - 1} entries.`);
  }

  // --- UI -------------------------------------------------------------------

  actions() {
    const out = [];
    if (this.game.phase === 'story' && this.pending) {
      this.pending.options.forEach((o, i) => out.push({ label: o, wide: true, fn: () => this.choose(i) }));
      out.push({ label: this.oracleResult ? `Oracle: ${this.oracleResult}` : 'Ask the oracle', fn: () => this.oracle() });
    }
    return out;
  }

  status() {
    const open = this.clocks.filter((c) => !c.done).length;
    return `${this.entries.length - 1} entries · ${open} thread${open === 1 ? '' : 's'} open`;
  }

  /**
   * The prompt sits directly above the three endings rather than down in the
   * panel — you read the situation and then choose, in that order.
   */
  lead() {
    if (!this.pending) return '';
    return `<p class="lead">${this.pending.lead}</p>
      <input id="ownLine" class="storyInput" placeholder="…or write your own, then Enter" />`;
  }

  panel() {
    const clocks = this.clocks.map((c) => {
      const pips = '●'.repeat(Math.min(c.filled, c.size)) + `<span class="dim">${'○'.repeat(Math.max(0, c.size - c.filled))}</span>`;
      return `<div class="quest ${c.done ? 'done' : ''}"><span>${c.text}</span><span class="dim">${pips}</span></div>`;
    }).join('');

    const recent = this.entries.slice(-6).reverse()
      .map((e) => `<div class="entry">${e.who ? `<b>${e.who}</b> ` : ''}${e.text}</div>`).join('');

    return `<h2>Threads</h2>${clocks}<h2>Chronicle</h2><div class="chronicle">${recent}</div>`;
  }
}

function pick3(list, rng) {
  const pool = list.slice();
  const out = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

Chronicle.spec = {
  id: 'chronicle',
  name: 'The Chronicle (story)',
  Mode: Chronicle,
  groups: ['base', 'outposts', 'adventure', 'citylife'],
  minPlayers: 1,
  maxPlayers: 5,
  market: false,
  playerName: (i) => ['Teller', 'Second', 'Third', 'Fourth', 'Fifth'][i],
  opening: 'A crossroads, and nothing decided yet.',
  hint: 'Lay a tile, then say what is there. Pick one of three endings or write your own. Export the log when you are done.',
};
