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

  remember() {
    try { localStorage.setItem(STORE, JSON.stringify(changes())); } catch { /* full, private mode */ }
  }

  toggle() {
    if (!this.el) this.build();
    this.open = !this.open;
    this.el.hidden = !this.open;
  }

  build() {
    const el = document.createElement('div');
    el.id = 'designer';
    el.hidden = true;
    el.innerHTML = `
      <header>
        <b>Design</b>
        <span class="dim">every visual dial · <kbd>Shift</kbd>+<kbd>D</kbd></span>
        <button data-act="close" title="Close">✕</button>
      </header>
      <div class="rows"></div>
      <footer>
        <button data-act="export" class="primary">Export JSON</button>
        <button data-act="import">Import…</button>
        <button data-act="reset">Reset all</button>
        <input type="file" accept="application/json" hidden />
      </footer>`;
    const rows = el.querySelector('.rows');

    for (const [group, items] of groupsOf(SPEC)) {
      const h = document.createElement('h4');
      h.textContent = group;
      rows.appendChild(h);
      for (const s of items) rows.appendChild(this.control(s));
    }

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
        <span class="dNote">${s.note}</span>`;
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        setValue(s.key, input.value);
        row.querySelector('output').textContent = input.value;
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
    for (const row of this.el.querySelectorAll('.dRow')) {
      const v = read(row.dataset.key);
      const input = row.querySelector('input');
      input.value = v;
      row.querySelector('output').textContent = v;
    }
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
