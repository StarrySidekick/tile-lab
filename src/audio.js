// ---------------------------------------------------------------------------
// Placeholder sound effects, synthesised at runtime.
//
// No audio files — everything here is oscillators, filtered noise and envelopes
// built on the fly, which keeps the project's "no assets" rule intact. They're
// meant to be stand-ins with the right *shape* and timing: woody clacks, soft
// chimes, muffled footsteps. Swap in real samples later by replacing play().
//
// The voicing leans warm and muted to match the Twilight palette — triangle
// waves through lowpass filters rather than bright square/saw. All the knobs
// worth turning are in VOICES at the bottom.
//
// Everything is original: short functional motifs, not melodies from anything.
// ---------------------------------------------------------------------------

const A4 = 440;
/** Semitones from A4 -> Hz. n('C5') style isn't worth it; use numbers. */
const st = (n) => A4 * Math.pow(2, n / 12);

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.55;
    this.noiseBuf = null;
    this.samples = {};       // name -> AudioBuffer, once real files are supplied
    this.sampleBase = './assets/sfx/';
    this.triedSamples = false;
  }

  /**
   * Real audio files override the synthesised placeholders. Drop files into
   * assets/sfx/ and list them in assets/sfx/manifest.json:
   *
   *     { "place": "tile-clack.wav", "score": "chime.mp3" }
   *
   * Anything not listed keeps using its synth voice, so you can replace the
   * set one sound at a time. A missing manifest is not an error.
   */
  async loadSamples() {
    if (this.triedSamples || !this.ctx) return;
    this.triedSamples = true;
    try {
      const res = await fetch(this.sampleBase + 'manifest.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const map = await res.json();
      await Promise.all(Object.entries(map).map(async ([name, file]) => {
        try {
          const r = await fetch(this.sampleBase + file);
          if (!r.ok) return;
          this.samples[name] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        } catch { /* one bad file shouldn't kill the rest */ }
      }));
    } catch { /* no manifest — synth only */ }
  }

  /**
   * Browsers refuse to start audio outside a user gesture, so the context is
   * created lazily and resumed on every call.
   */
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      // Keeps overlapping sounds from clipping when a turn resolves several
      // things at once. The knee matters more than anything else here: the
      // default is 30dB, which starts compressing ~44dB below threshold and
      // flattens quiet effects into nothing.
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -8;
      this.comp.knee.value = 4;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.004;
      this.comp.release.value = 0.18;
      // A compressor only ever reduces, so gain has to come back afterwards.
      this.makeup = this.ctx.createGain();
      this.makeup.gain.value = 1.7;
      this.master.connect(this.comp).connect(this.makeup).connect(this.ctx.destination);

      const n = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, n, n);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get now() { return this.ctx.currentTime; }

  // --- primitives -----------------------------------------------------------

  /** A pitched blip with an exponential tail. */
  tone({ freq, dur = 0.25, type = 'triangle', gain = 0.25, at = 0, attack = 0.006, slideTo = null, cutoff = null }) {
    const t0 = this.now + at;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);

    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    let tail = g;
    if (cutoff) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      g.connect(f);
      tail = f;
    }
    osc.connect(g);
    tail.connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of filtered noise — impacts, footsteps, rustle. */
  noise({ dur = 0.12, gain = 0.2, at = 0, type = 'bandpass', freq = 1000, q = 1, sweepTo = null }) {
    const t0 = this.now + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;

    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t0);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, sweepTo), t0 + dur);
    f.Q.value = q;

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** Play a short sequence of semitone offsets from A4. */
  motif(steps, { spacing = 0.075, dur = 0.42, gain = 0.16, type = 'triangle', cutoff = 2600 } = {}) {
    steps.forEach((s, i) => {
      this.tone({ freq: st(s), dur, gain, type, cutoff, at: i * spacing });
      // A quiet octave doubling gives the chimes some body.
      this.tone({ freq: st(s + 12), dur: dur * 0.6, gain: gain * 0.35, type: 'sine', at: i * spacing });
    });
  }

  // --- public ---------------------------------------------------------------

  play(kind) {
    if (!this.enabled || !this.ensure()) return;
    // First sound is the earliest point we're guaranteed a live context.
    if (!this.triedSamples) this.loadSamples();

    const buf = this.samples[kind];
    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.master);
      src.start();
      return;
    }
    const v = VOICES[kind];
    if (v) v(this);
  }
}

// ---------------------------------------------------------------------------
// The sounds themselves. Each is a few primitives — tweak freely.
// ---------------------------------------------------------------------------

const VOICES = {
  // Wooden tile meeting the table: a click plus a low body thump.
  place: (s) => {
    s.noise({ dur: 0.055, gain: 0.22, type: 'bandpass', freq: 1500, q: 1.1 });
    s.tone({ freq: 150, slideTo: 92, dur: 0.13, type: 'sine', gain: 0.30, cutoff: 700 });
  },

  // Light tick, deliberately tiny — this fires a lot.
  rotate: (s) => s.noise({ dur: 0.028, gain: 0.10, type: 'highpass', freq: 3200 }),

  // Soft pop of a wooden figure being set down.
  meeple: (s) => {
    s.tone({ freq: 430, slideTo: 250, dur: 0.11, type: 'triangle', gain: 0.20, cutoff: 1800 });
    s.noise({ dur: 0.035, gain: 0.09, type: 'bandpass', freq: 900 });
  },

  // A feature closed and paid out — warm rising third.
  score: (s) => s.motif([3, 7, 10], { spacing: 0.085, dur: 0.5, gain: 0.15 }),

  // Muffled footstep on grass.
  step: (s) => {
    s.noise({ dur: 0.085, gain: 0.16, type: 'lowpass', freq: 900, sweepTo: 380 });
    s.tone({ freq: 110, slideTo: 70, dur: 0.09, type: 'sine', gain: 0.14 });
  },

  // Tower-to-tower warp: a shimmer that lifts away.
  warp: (s) => {
    s.tone({ freq: st(0), slideTo: st(19), dur: 0.34, type: 'triangle', gain: 0.14, cutoff: 4000 });
    s.noise({ dur: 0.34, gain: 0.07, type: 'bandpass', freq: 1400, sweepTo: 5200, q: 2 });
  },

  // Claiming a landmark. Four notes, resolving upward — original motif.
  landmark: (s) => s.motif([0, 4, 7, 12], { spacing: 0.09, dur: 0.55, gain: 0.16 }),

  // Resting at a village — settling, downward.
  rest: (s) => s.motif([7, 3], { spacing: 0.11, dur: 0.5, gain: 0.12, cutoff: 1500 }),

  // Descending into a cave: pitch falls away, air opens up.
  caveEnter: (s) => {
    s.tone({ freq: 230, slideTo: 62, dur: 0.85, type: 'triangle', gain: 0.22, cutoff: 900 });
    s.noise({ dur: 0.9, gain: 0.10, type: 'lowpass', freq: 700, sweepTo: 180 });
  },

  // Climbing back out — the same shape, reversed.
  caveExit: (s) => {
    s.tone({ freq: 90, slideTo: 300, dur: 0.6, type: 'triangle', gain: 0.20, cutoff: 2200 });
    s.noise({ dur: 0.5, gain: 0.08, type: 'lowpass', freq: 300, sweepTo: 1600 });
  },

  // Finding treasure underground: bright, sparkling, short.
  treasure: (s) => {
    s.motif([12, 16, 19, 24], { spacing: 0.06, dur: 0.5, gain: 0.15, cutoff: 6000 });
    s.noise({ dur: 0.45, gain: 0.05, type: 'highpass', freq: 4000 });
  },

  // A gust crossing the board: air, not a note. Long enough to cover the
  // tiles sliding, quiet enough to sit under everything else that fires.
  gust: (s) => {
    s.noise({ dur: 0.55, gain: 0.13, type: 'bandpass', freq: 420, sweepTo: 1700, q: 0.8 });
    s.tone({ freq: 190, slideTo: 96, dur: 0.5, type: 'sine', gain: 0.07, cutoff: 600 });
  },

  // Illegal move — dull, non-punishing.
  deny: (s) => {
    s.tone({ freq: 120, slideTo: 84, dur: 0.13, type: 'square', gain: 0.11, cutoff: 420 });
  },

  // Turn handover: one quiet marimba-ish note.
  turn: (s) => s.tone({ freq: st(-5), dur: 0.28, type: 'triangle', gain: 0.09, cutoff: 1400 }),

  // End of game — settles rather than celebrates.
  over: (s) => s.motif([12, 7, 4, 0], { spacing: 0.16, dur: 0.9, gain: 0.17, cutoff: 2200 }),
};

export const SOUND_NAMES = Object.keys(VOICES);
