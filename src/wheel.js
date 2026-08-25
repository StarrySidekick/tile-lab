// ---------------------------------------------------------------------------
// THE COLOUR WHEEL.
//
// The second half of the design console. The dials list is good at "make this
// one thing darker" and hopeless at the question that actually decides whether
// a palette works: how do all of these sit RELATIVE TO EACH OTHER. Twenty-odd
// colour dials scattered down a scrolling list can't answer that. Plotted on a
// wheel they answer it at a glance — you can see the whole palette clustered
// in one warm quadrant, or the one colour sitting somewhere nothing else is.
//
// What it draws:
//
//   THE SLICE     the wheel behind the dots is a real slice through sRGB at
//                 one lightness — hue round, chroma out, and the ragged outer
//                 edge is the actual gamut boundary, which is why the greens
//                 reach further than the blues.
//   THE DOTS      one per colour in the book, at its own hue and chroma.
//   THE SPOKES    from the ANCHOR — the colour the palette is built around —
//                 out to wherever the chosen scheme says its partners belong.
//
// And what it lets you do: drag a dot to move it, or snap it onto a spoke and
// keep its own lightness and chroma. Snapping is a hue rotation and nothing
// else, which is exactly what a colour scheme is a claim about, and exactly
// what you cannot do by nudging RGB sliders.
// ---------------------------------------------------------------------------

import { hexToLch, lchToHex, maxChroma, oklabToRgb, hueDelta, relation, contrast, SCHEMES }
  from './color.js';

const TAU = Math.PI * 2;
const RIM = 0.33;              // the chroma the rim stands for
const DOT = 7;

const clamp255 = (x) => (x < 0 ? 0 : x > 255 ? 255 : x);
const prettyName = (key) => key.split('.').pop().replace(/([A-Z])/g, ' $1').toLowerCase();

export class Wheel {
  /**
   * @param {object} io
   *   swatches() → [{ key, hex, group }] — every colour in the book, now
   *   set(key, hex)                      — change one
   */
  constructor(io) {
    this.io = io;
    this.scheme = 'complement';
    this.anchor = null;
    this.selected = null;
    this.slice = null;          // the lightness the disc is drawn at
    this.discKey = '';
    this.before = null;         // one step of undo, for Harmonise
    this.el = this.build();
  }

  build() {
    const el = document.createElement('div');
    el.className = 'wheelView';
    el.innerHTML = `
      <div class="chips">${SCHEMES.map((s) =>
        `<button data-scheme="${s.id}">${s.name}</button>`).join('')}</div>
      <p class="dNote schemeNote"></p>
      <canvas class="wheelCanvas" width="640" height="640"></canvas>
      <label class="dRow sliceRow">
        <span class="dName">slice lightness</span>
        <span class="dCtl"><input type="range" min="0.15" max="0.95" step="0.01" />
        <output></output></span>
        <span class="dNote">Which horizontal cut through the colour solid you are looking at. Dots above it are drawn lighter than the wheel, dots below darker.</span>
      </label>
      <div class="pick"></div>
      <div class="wheelActions">
        <button data-act="harmonise">Snap every colour to this scheme</button>
        <button data-act="undo" disabled>Undo that</button>
      </div>`;

    this.canvas = el.querySelector('canvas');
    this.pick = el.querySelector('.pick');
    this.sliceInput = el.querySelector('.sliceRow input');
    this.sliceOut = el.querySelector('.sliceRow output');

    el.querySelector('.chips').addEventListener('click', (e) => {
      const id = e.target.closest('button')?.dataset.scheme;
      if (!id) return;
      this.scheme = id;
      this.refresh();
    });
    this.sliceInput.addEventListener('input', () => {
      this.slice = Number(this.sliceInput.value);
      this.refresh();
    });
    el.querySelector('.wheelActions').addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act === 'harmonise') this.harmonise();
      if (act === 'undo') this.undo();
    });
    this.pick.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.hue != null) this.moveTo(this.selected, Number(b.dataset.hue));
      if (b.dataset.act === 'anchor') { this.anchor = this.selected; this.refresh(); }
    });

    this.hookPointer();
    return el;
  }

  // --- geometry -------------------------------------------------------------

  /** Where a colour sits on the wheel, in canvas pixels. */
  place(lch, r) {
    const rad = lch.h * Math.PI / 180;
    const reach = Math.min(1, lch.c / RIM) * r;
    return [this.cx + Math.cos(rad) * reach, this.cy + Math.sin(rad) * reach];
  }

  /** …and back again: a point in canvas pixels to a hue and a chroma. */
  unplace(x, y, r) {
    const dx = x - this.cx, dy = y - this.cy;
    let h = Math.atan2(dy, dx) * 180 / Math.PI;
    if (h < 0) h += 360;
    return { h, c: Math.min(1, Math.hypot(dx, dy) / r) * RIM };
  }

  hookPointer() {
    const at = (e) => {
      const b = this.canvas.getBoundingClientRect();
      const s = this.canvas.width / b.width;
      return [(e.clientX - b.left) * s, (e.clientY - b.top) * s];
    };
    const hit = (x, y) => {
      let best = null, near = 22 * 22;
      for (const d of this.dots) {
        const q = (d.x - x) ** 2 + (d.y - y) ** 2;
        if (q < near) { near = q; best = d; }
      }
      return best;
    };

    this.canvas.addEventListener('pointerdown', (e) => {
      const [x, y] = at(e);
      const d = hit(x, y);
      if (!d) return;
      this.selected = d.key;
      if (!this.anchor) this.anchor = d.key;
      this.canvas.setPointerCapture(e.pointerId);
      this.dragging = d.key;
      this.refresh();
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      const [x, y] = at(e);
      const { h, c } = this.unplace(x, y, this.radius);
      const was = hexToLch(this.hexOf(this.dragging));
      this.io.set(this.dragging, lchToHex({ l: was.l, c, h }));
      this.refresh();
    });
    const drop = () => { this.dragging = null; };
    this.canvas.addEventListener('pointerup', drop);
    this.canvas.addEventListener('pointercancel', drop);
  }

  hexOf(key) {
    return this.io.swatches().find((s) => s.key === key)?.hex ?? '#000000';
  }

  // --- the drawing ----------------------------------------------------------

  /**
   * The gamut slice, cached. Every pixel is a real conversion — this is a
   * picture OF the colour space rather than a picture of a colour wheel — so
   * it is redrawn only when the lightness changes, not per interaction.
   */
  disc(ctx, r, l) {
    // Rastered small and scaled up. The disc is a smooth field with no detail
    // finer than a few pixels — every pixel of it is a real colour conversion,
    // so drawing it at full canvas size cost 80ms and looked identical.
    const size = 256;
    const key = `${size}|${l.toFixed(2)}`;
    if (this.discKey !== key) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const cx = c.getContext('2d');
      const img = cx.createImageData(size, size);
      const d = img.data;
      const mid = size / 2;
      // The gamut edge depends only on the ANGLE, so it is found once per
      // half-degree rather than once per pixel — the search for it is sixteen
      // colour conversions deep, and there are a hundred and sixty thousand
      // pixels in here.
      const STEPS = 720;
      const edge = new Float32Array(STEPS);
      for (let i = 0; i < STEPS; i++) edge[i] = maxChroma(l, i * 360 / STEPS);

      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const dx = x - mid, dy = y - mid;
          const dist = Math.hypot(dx, dy);
          const i = (y * size + x) * 4;
          if (dist > mid - 1) continue;
          let h = Math.atan2(dy, dx) * 180 / Math.PI;
          if (h < 0) h += 360;
          const want = (dist / (mid - 1)) * RIM;
          const most = edge[Math.round(h * STEPS / 360) % STEPS];
          const chroma = Math.min(want, most);
          const rad = h * Math.PI / 180;
          const [R, G, B] = oklabToRgb([l, Math.cos(rad) * chroma, Math.sin(rad) * chroma]);
          // Outside the gamut the colour stops changing, so it is dimmed
          // instead: the disc stays a disc, and the ring where it darkens is
          // the real shape of what sRGB can show at this lightness.
          const k = want > most ? 0.42 : 1;
          d[i] = clamp255(R * 255 * k);
          d[i + 1] = clamp255(G * 255 * k);
          d[i + 2] = clamp255(B * 255 * k);
          d[i + 3] = 255;
        }
      }
      cx.putImageData(img, 0, 0);
      this.discCanvas = c;
      this.discKey = key;
    }
    ctx.drawImage(this.discCanvas, this.cx - r, this.cy - r, r * 2, r * 2);
  }

  refresh() {
    const swatches = this.io.swatches();
    if (!swatches.length) return;
    if (!this.anchor || !swatches.some((s) => s.key === this.anchor)) {
      // Left alone, the anchor is the most saturated colour in the book: the
      // one a palette is in practice built around, because it is the one that
      // will shout loudest if the others fight it.
      this.anchor = swatches.reduce((a, b) =>
        (hexToLch(b.hex).c > hexToLch(a.hex).c ? b : a)).key;
    }
    if (!this.selected || !swatches.some((s) => s.key === this.selected)) {
      this.selected = this.anchor;
    }
    const anchorLch = hexToLch(this.hexOf(this.anchor));
    if (this.slice == null) this.slice = Math.round(anchorLch.l * 100) / 100;
    this.sliceInput.value = this.slice;
    this.sliceOut.textContent = this.slice.toFixed(2);

    for (const b of this.el.querySelectorAll('.chips button')) {
      b.classList.toggle('on', b.dataset.scheme === this.scheme);
    }
    const scheme = SCHEMES.find((s) => s.id === this.scheme);
    this.el.querySelector('.schemeNote').textContent = scheme.note;

    const ctx = this.canvas.getContext('2d');
    const W = this.canvas.width;
    this.cx = this.cy = W / 2;
    this.radius = W / 2 - 26;
    ctx.clearRect(0, 0, W, W);
    this.disc(ctx, this.radius, this.slice);

    // The spokes: where this scheme says the anchor's partners belong.
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 6]);
    for (const off of [0, ...scheme.at]) {
      const hue = (anchorLch.h + off + 360) % 360;
      const rad = hue * Math.PI / 180;
      ctx.strokeStyle = off ? 'rgba(255,255,255,0.55)' : 'rgba(255,214,140,0.85)';
      ctx.beginPath();
      ctx.moveTo(this.cx, this.cy);
      ctx.lineTo(this.cx + Math.cos(rad) * (this.radius + 12),
        this.cy + Math.sin(rad) * (this.radius + 12));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = off ? 'rgba(255,255,255,0.75)' : '#ffd68c';
      ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lx = this.cx + Math.cos(rad) * (this.radius + 17);
      const ly = this.cy + Math.sin(rad) * (this.radius + 17);
      ctx.fillText(off ? `${off > 0 ? '+' : ''}${off}°` : 'key', lx, ly);
      ctx.setLineDash([7, 6]);
    }
    ctx.restore();

    // The palette itself.
    this.dots = [];
    for (const s of swatches) {
      const lch = hexToLch(s.hex);
      const [x, y] = this.place(lch, this.radius);
      this.dots.push({ ...s, x, y, lch });
    }
    for (const d of this.dots) {
      const isSel = d.key === this.selected, isAnchor = d.key === this.anchor;
      ctx.beginPath();
      ctx.arc(d.x, d.y, DOT + (isSel ? 3 : 0), 0, TAU);
      ctx.fillStyle = d.hex;
      ctx.fill();
      ctx.lineWidth = isSel ? 3 : 1.5;
      ctx.strokeStyle = isSel ? '#ffffff' : 'rgba(0,0,0,0.7)';
      ctx.stroke();
      if (isAnchor) {
        ctx.beginPath();
        ctx.arc(d.x, d.y, DOT + 6, 0, TAU);
        ctx.strokeStyle = '#ffd68c';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    this.renderPick(anchorLch, scheme);
  }

  renderPick(anchorLch, scheme) {
    const hex = this.hexOf(this.selected);
    const lch = hexToLch(hex);
    const rel = relation(anchorLch.h, lch.h);
    const d = hueDelta(anchorLch.h, lch.h);
    const sameAsAnchor = this.selected === this.anchor;

    const targets = [0, ...scheme.at].map((off) => {
      const hue = (anchorLch.h + off + 360) % 360;
      return {
        off,
        hue,
        hex: lchToHex({ l: lch.l, c: lch.c, h: hue }),
        label: off ? `${off > 0 ? '+' : ''}${off}°` : 'key hue',
      };
    });

    this.pick.innerHTML = `
      <div class="pickHead">
        <span class="pickChip" style="background:${hex}"></span>
        <b>${prettyName(this.selected)}</b>
        <code>${hex}</code>
      </div>
      <p class="dNote">
        L ${lch.l.toFixed(2)} · C ${lch.c.toFixed(3)} · hue ${Math.round(lch.h)}°
        ${sameAsAnchor ? '· this is the anchor'
          : `· ${Math.round(Math.abs(d))}° from the anchor`
            + (rel ? ` — <b>${rel.name}</b>${Math.abs(rel.off) > 1
              ? `, ${Math.abs(Math.round(rel.off))}° off true` : ', on the nose'}` : ' — no scheme')}
        · ${this.selected === 'paper.tint'
          ? `contrast with the ink ${contrast(hex, this.io.ink()).toFixed(1)}:1`
          : `contrast with the sheet ${contrast(hex, this.io.paper()).toFixed(1)}:1`}
      </p>
      ${sameAsAnchor ? '<p class="dNote">Everything else is measured from this one. Pick another dot to move it.</p>' : `
        <div class="snapRow">${targets.map((t) =>
          `<button data-hue="${t.hue}" title="Rotate to ${Math.round(t.hue)}°, keeping this colour's own lightness and chroma">
             <span style="background:${t.hex}"></span>${t.label}
           </button>`).join('')}</div>`}
      <div class="wheelActions">
        <button data-act="anchor"${sameAsAnchor ? ' disabled' : ''}>Make this the anchor</button>
      </div>`;
  }

  // --- moving things --------------------------------------------------------

  /** Rotate one colour to a hue, keeping everything else about it. */
  moveTo(key, hue) {
    const was = hexToLch(this.hexOf(key));
    this.io.set(key, lchToHex({ l: was.l, c: was.c, h: hue }));
    this.refresh();
  }

  /**
   * Pull the whole palette onto the nearest arm of the current scheme.
   *
   * A blunt instrument on purpose — it is for seeing what a scheme would even
   * look like here, in one click, rather than for finishing anything. Nearly
   * neutral colours are left where they are: rotating the hue of something
   * with no chroma changes nothing and only muddles the picture.
   */
  harmonise() {
    const anchor = hexToLch(this.hexOf(this.anchor));
    const scheme = SCHEMES.find((s) => s.id === this.scheme);
    const arms = [0, ...scheme.at].map((off) => (anchor.h + off + 360) % 360);
    this.before = this.io.swatches().map((s) => [s.key, s.hex]);
    for (const s of this.io.swatches()) {
      if (s.key === this.anchor) continue;
      const lch = hexToLch(s.hex);
      if (lch.c < 0.02) continue;
      const to = arms.reduce((a, b) =>
        (Math.abs(hueDelta(lch.h, b)) < Math.abs(hueDelta(lch.h, a)) ? b : a));
      this.io.set(s.key, lchToHex({ l: lch.l, c: lch.c, h: to }));
    }
    this.el.querySelector('[data-act="undo"]').disabled = false;
    this.refresh();
  }

  undo() {
    if (!this.before) return;
    for (const [key, hex] of this.before) this.io.set(key, hex);
    this.before = null;
    this.el.querySelector('[data-act="undo"]').disabled = true;
    this.refresh();
  }
}
