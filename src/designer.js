// ---------------------------------------------------------------------------
// THE DESIGN CONSOLE.
//
// A panel of controls generated from `design.js`'s book — one per entry, in
// its group, with its note underneath. Nothing here knows what any setting
// MEANS; it knows only how to draw a slider for a number and a swatch for a
// colour. That is the whole point: adding a tunable is one line in the book,
// and it turns up here with a control and its documentation.
//
// Three things it can do beyond twiddling:
//
//   EXPORT   downloads a JSON file of only what differs from the defaults —
//            small, readable, and exactly what to hand back so a change can be
//            made permanent (drop it in as assets/design.json).
//   IMPORT   reads one back, so a look can be passed around or restored.
//   RESET    back to the book's defaults.
//
// It also remembers the session in localStorage, so a look survives a reload
// while you are still deciding about it.
// ---------------------------------------------------------------------------

import { SPEC, DESIGN, setValue, apply, reset, changes } from './design.js';
import { Wheel } from './wheel.js';
import { hexToLch, lchToHex, hueDelta, SCHEMES } from './color.js';

const STORE = 'tilelab.design';

const groupsOf = (spec) => {
  const out = new Map();
  for (const s of spec) {
    if (!out.has(s.group)) out.set(s.group, []);
    out.get(s.group).push(s);
  }
  return out;
};

const read = (path) => path.split('.').reduce((at, k) => (at == null ? at : at[k]), DESIGN);

export class Designer {
  constructor() {
    this.el = null;
    this.open = false;
  }

  /** Restore whatever was being tried last session, before anything draws. */
  restore() {
    try {
      const raw = localStorage.getItem(STORE);
      if (raw) apply(JSON.parse(raw));
    } catch { /* a corrupt draft is not worth a crash */ }
  }

  /**
   * Keep the draft, but not on every twitch: a slider drag fires input events
   * far faster than a synchronous storage write wants to happen, and the last
   * one is the only one worth keeping.
   */
  remember() {
    clearTimeout(this.saving);
    this.saving = setTimeout(() => {
      try { localStorage.setItem(STORE, JSON.stringify(changes())); } catch { /* full, private mode */ }
    }, 250);
  }

  toggle() {
    if (!this.el) this.build();
    this.open = !this.open;
    this.el.hidden = !this.open;
    // The page may want to make room for it — see main.js, which on a narrow
    // screen gives the console the bottom half and the board the top.
    this.onToggle?.(this.open);
  }

  build() {
    const el = document.createElement('div');
    el.id = 'designer';
    el.hidden = true;
    el.innerHTML = `
      <header>
        <b>Design</b>
        <span class="dim">every visual dial<span class="key"> · <kbd>Shift</kbd>+<kbd>D</kbd></span></span>
        <button data-act="close" title="Close">✕</button>
      </header>
      <nav class="tabs">
        <button data-view="rows" class="on">Dials</button>
        <button data-view="wheel">Colour</button>
      </nav>
      <div class="rows"></div>
      <div class="wheelWrap" hidden></div>
      <footer>
        <button data-act="export" class="primary">Export JSON</button>
        <button data-act="import">Import…</button>
        <button data-act="reset">Reset all</button>
        <input type="file" accept="application/json" hidden />
      </footer>`;
    const rows = el.querySelector('.rows');

    // What the chips beside every swatch are measured from. Both controls
    // drive the wheel's own anchor and scheme, so the two views can never
    // disagree about what the palette is built around.
    const bar = document.createElement('div');
    bar.className = 'harmonyBar';
    bar.innerHTML = `
      <span>Harmony</span>
      <select class="hScheme">${SCHEMES.map((s) =>
        `<option value="${s.id}">${s.name}</option>`).join('')}</select>
      <span>from</span>
      <select class="hAnchor"></select>`;
    rows.appendChild(bar);
    this.hScheme = bar.querySelector('.hScheme');
    this.hAnchor = bar.querySelector('.hAnchor');
    this.hScheme.addEventListener('change', () => {
      this.wheel.scheme = this.hScheme.value;
      this.paintHarmony();
      if (!el.querySelector('.wheelWrap').hidden) this.wheel.refresh();
    });
    this.hAnchor.addEventListener('change', () => {
      this.wheel.anchor = this.hAnchor.value;
      this.paintHarmony();
      if (!el.querySelector('.wheelWrap').hidden) this.wheel.refresh();
    });

    // One handler for every chip: rotate this colour's hue to that angle and
    // leave its lightness and chroma exactly where they were.
    rows.addEventListener('click', (e) => {
      const chip = e.target.closest('.hChip');
      if (!chip) return;
      const key = chip.closest('.dRow').dataset.key;
      const was = hexToLch(read(key));
      setValue(key, lchToHex({ l: was.l, c: was.c, h: Number(chip.dataset.hue) }));
      this.syncOne(key);
      this.paintHarmony(key);
      this.remember();
    });

    for (const [group, items] of groupsOf(SPEC)) {
      const h = document.createElement('h4');
      h.textContent = group;
      rows.appendChild(h);
      for (const s of items) rows.appendChild(this.control(s));
    }

    // The wheel is the same book seen from the side: it reads and writes the
    // very same values the sliders do, so a colour moved there moves the
    // swatch here, and both repaint the board through the one change hook.
    this.wheel = new Wheel({
      swatches: () => SPEC.filter((s) => s.type === 'color')
        .map((s) => ({ key: s.key, group: s.group, hex: read(s.key) })),
      set: (key, hex) => {
        setValue(key, hex);
        this.syncOne(key);
        this.paintHarmony(key);
        this.remember();
      },
      paper: () => read('paper.tint'),
      ink: () => read('ink.tone'),
    });
    el.querySelector('.wheelWrap').appendChild(this.wheel.el);

    el.querySelector('.tabs').addEventListener('click', (e) => {
      const view = e.target.closest('button')?.dataset.view;
      if (!view) return;
      for (const b of el.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.view === view);
      el.querySelector('.rows').hidden = view !== 'rows';
      el.querySelector('.wheelWrap').hidden = view !== 'wheel';
      if (view === 'wheel') this.wheel.refresh();
    });

    el.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'close') this.toggle();
      if (act === 'reset') { reset(); this.sync(); this.remember(); }
      if (act === 'export') this.export();
      if (act === 'import') el.querySelector('input[type=file]').click();
    });
    el.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      try { apply(JSON.parse(await f.text())); this.sync(); this.remember(); }
      catch { alert('That file is not a design export.'); }
      e.target.value = '';
    });

    document.body.appendChild(el);
    this.el = el;
    this.paintHarmony();
  }

  /**
   * The chips beside every colour swatch: where that colour would land on each
   * arm of the current scheme, previewed in the colour it would become.
   *
   * This is the wheel's snapping, brought to the place you are already looking
   * — a colour is nearly always edited from its own row, and having to leave
   * for the other tab to ask "what would the complement be" is exactly the
   * friction that stops anybody asking. The swatch itself is untouched, so a
   * custom colour is still one tap away; the chips are a shortcut, not a cage.
   *
   * `only` repaints one row. Everything is repainted when the ANCHOR moves,
   * because then every chip in the list is aiming somewhere new.
   */
  paintHarmony(only = null) {
    if (!this.el) return;
    const anchor = this.wheel.ensureAnchor();
    if (!anchor) return;
    if (only && only === anchor) only = null;

    const scheme = SCHEMES.find((s) => s.id === this.wheel.scheme);
    const anchorHue = hexToLch(read(anchor)).h;
    this.hScheme.value = this.wheel.scheme;
    if (this.hAnchor.dataset.built !== 'yes') {
      this.hAnchor.innerHTML = SPEC.filter((s) => s.type === 'color')
        .map((s) => `<option value="${s.key}">${s.key}</option>`).join('');
      this.hAnchor.dataset.built = 'yes';
    }
    this.hAnchor.value = anchor;

    const strips = only
      ? [this.el.querySelector(`.rows .dRow[data-key="${only}"] .harmony`)].filter(Boolean)
      : this.el.querySelectorAll('.rows .harmony');
    for (const strip of strips) {
      const key = strip.closest('.dRow').dataset.key;
      if (key === anchor) {
        strip.innerHTML = '<em>the anchor — every other chip is measured from this</em>';
        continue;
      }
      const lch = hexToLch(read(key));
      strip.innerHTML = [0, ...scheme.at].map((off) => {
        const hue = (anchorHue + off + 360) % 360;
        const hex = lchToHex({ l: lch.l, c: lch.c, h: hue });
        const on = Math.abs(hueDelta(hue, lch.h)) < 3;
        const what = off ? `${off > 0 ? '+' : ''}${off}° from the anchor` : 'the anchor’s own hue';
        return `<button class="hChip${on ? ' on' : ''}" data-hue="${hue}"
          title="${what} — ${hex}, keeping this colour's lightness and chroma"><span
          style="background:${hex}"></span></button>`;
      }).join('');
    }
  }

  control(s) {
    const row = document.createElement('label');
    row.className = 'dRow';
    row.dataset.key = s.key;
    const value = read(s.key);
    const name = s.key.split('.').pop().replace(/([A-Z])/g, ' $1').toLowerCase();

    if (s.type === 'color') {
      row.innerHTML = `<span class="dName">${name}</span>
        <span class="dCtl"><input type="color" value="${value}" />
        <output>${value}</output></span>
        <span class="harmony"></span>
        <span class="dNote">${s.note}</span>`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        setValue(s.key, input.value);
        row.querySelector('output').textContent = input.value;
        this.paintHarmony(s.key);
        this.remember();
      });
    } else {
      row.innerHTML = `<span class="dName">${name}</span>
        <span class="dCtl"><input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${value}" />
        <output>${value}</output></span>
        <span class="dNote">${s.note}</span>`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        setValue(s.key, v);
        row.querySelector('output').textContent = v;
        this.remember();
      });
    }
    return row;
  }

  /** Push the live values back into the controls, after a reset or an import. */
  sync() {
    if (!this.el) return;
    for (const row of this.el.querySelectorAll('.rows .dRow')) {
      const v = read(row.dataset.key);
      const input = row.querySelector('input');
      input.value = v;
      row.querySelector('output').textContent = v;
    }
    this.paintHarmony();
    if (!this.el.querySelector('.wheelWrap').hidden) this.wheel.refresh();
  }

  /** …or just the one, which is what the wheel needs when it moves a colour. */
  syncOne(key) {
    const row = this.el?.querySelector(`.rows .dRow[data-key="${key}"]`);
    if (!row) return;
    const v = read(key);
    row.querySelector('input').value = v;
    row.querySelector('output').textContent = v;
  }

  /**
   * Only the differences, and pretty-printed: this file is meant to be read by
   * a person and pasted into a conversation as readily as dropped in a folder.
   */
  export() {
    const diff = changes();
    const body = JSON.stringify(diff, null, 2);
    const blob = new Blob([body], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'design.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    const n = Object.keys(diff).length;
    console.log(`design.json — ${n} change${n === 1 ? '' : 's'} from the defaults\n${body}`);
  }
}
