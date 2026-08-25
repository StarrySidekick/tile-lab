// Colour maths is easy to get subtly wrong and impossible to eyeball, so it
// gets assertions: round trips, known anchors, gamut behaviour, hue arithmetic.
//   node tools/color-check.mjs
import { hexToLch, lchToHex, hueDelta, relation, maxChroma, contrast, rgbToOklab, hexToRgb }
  from '../src/color.js';

let bad = 0;
const ok = (cond, what) => { if (!cond) { bad++; console.log(`  ✗ ${what}`); } };

// Round trips: every colour must survive hex → oklch → hex unchanged.
let worst = 0, worstHex = '';
for (let i = 0; i < 4096; i++) {
  const hex = '#' + [0, 1, 2].map(() =>
    Math.floor((i * 2654435761 >>> (8 * Math.random() | 0)) % 256).toString(16).padStart(2, '0')).join('');
  const back = lchToHex(hexToLch(hex));
  const d = Math.max(...[1, 3, 5].map((k) =>
    Math.abs(parseInt(hex.slice(k, k + 2), 16) - parseInt(back.slice(k, k + 2), 16))));
  if (d > worst) { worst = d; worstHex = `${hex} → ${back}`; }
}
ok(worst <= 1, `round trip drifts by ${worst} (${worstHex}); 1 step is the most a rounding may cost`);

// Anchors: OKLab's own reference points.
const white = rgbToOklab(hexToRgb('#ffffff'));
ok(Math.abs(white[0] - 1) < 0.001, `white L is ${white[0].toFixed(4)}, should be 1`);
ok(Math.hypot(white[1], white[2]) < 0.001, 'white should have no chroma');
const black = rgbToOklab(hexToRgb('#000000'));
ok(Math.abs(black[0]) < 0.001, `black L is ${black[0].toFixed(4)}, should be 0`);
const mid = hexToLch('#808080');
ok(mid.c < 0.002, `mid grey has chroma ${mid.c.toFixed(4)}, should be neutral`);

// Lightness has to be perceptual, which is the whole reason for this space:
// pure blue is dark, pure yellow is light, and HSL says they are the same.
ok(hexToLch('#ffff00').l > hexToLch('#0000ff').l + 0.3,
  'yellow should be much lighter than blue');

// Gamut: an impossible chroma comes back as the strongest colour that exists
// at that lightness and hue, not as a clipped one at the wrong hue.
const asked = { l: 0.6, c: 0.4, h: 150 };
const got = hexToLch(lchToHex(asked));
ok(got.c < asked.c, 'an out-of-gamut chroma must be pulled in');
ok(Math.abs(hueDelta(asked.h, got.h)) < 2,
  `pulling chroma in moved the hue by ${hueDelta(asked.h, got.h).toFixed(1)}°`);
ok(Math.abs(got.c - maxChroma(0.6, 150)) < 0.01, 'and it should land on the gamut edge');

// Hue arithmetic wraps the short way round.
ok(hueDelta(350, 10) === 20, `hueDelta(350, 10) is ${hueDelta(350, 10)}, should be 20`);
ok(hueDelta(10, 350) === -20, `hueDelta(10, 350) is ${hueDelta(10, 350)}, should be -20`);

// Relationships are found relative to a key.
ok(relation(30, 210)?.name === 'Complementary', 'a hue 180° away is the complement');
ok(relation(30, 150)?.name === 'Triadic', 'a hue 120° away is triadic');
ok(relation(30, 100) === null, 'a hue 70° away is no scheme at all');

// Contrast, for the one question it answers well.
ok(Math.abs(contrast('#ffffff', '#000000') - 21) < 0.01, 'white on black is 21:1');
ok(Math.abs(contrast('#ffffff', '#ffffff') - 1) < 0.001, 'a colour on itself is 1:1');

console.log(bad ? `\n${bad} check(s) failed.` : 'colour: all good');
process.exit(bad ? 1 : 0);
