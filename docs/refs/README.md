# Reference dossier — the antique chart look

The five images Girando's art is measured against. "Match the reference" is a
number here, not a vibe: the palettes and ink densities below were sampled from
the files in this directory (`tools/art.mjs --measure` re-runs the sampling).

These are the OWNER'S reference uploads, kept for direction. They are not
shipped, not drawn from at runtime, and nothing in `src/` loads them.

| file | what it is | teaches |
|---|---|---|
| `wind-heads-engraving.jpg` | Dutch engraving: bearded wind-heads blowing at a globe's rim | How wind is DRAWN: ruled breath-cones, scalloped curls, **48% ink coverage** — an engraving is nearly half ink |
| `hand-coloured-chart.jpg` | Münster-style woodcut, hand-coloured | Colour sits ON the print: flat washes inside ink lines, orange-gold frame `#d89848`, paper `#e8d8b8` |
| `woodcut-wind-cloud.jpg` | Woodcut wind-face in a cloud bank | The cloud IS the body; scalloped lobes, no interior modelling |
| `blaeu-double-hemisphere.jpg` | Blaeu-school double hemisphere, aged | The gold master-tone: paper `#e8c888`, everything warm-shifted toward it, ink 18% |
| `portolan-europe.jpg` | Portolan-style Europe chart | Sea as grey-blue wash `#a898a0`-family, land pale against it, rhumbs in red/black, compass roses as decoration |

## The measured targets

- **Paper**: `#e8c888` → `#e8d8b8` family (gold-buff, far yellower than a naive
  "parchment beige"). Foxing `#8c6636`-ish, multiplied.
- **Sea/sky wash**: grey-blue, low saturation: `#a8b0b8` down to `#788088` in
  the deep. The portolan sea is nearly grey.
- **Ink**: near-black warm `#28241c`, at full strength for outlines; hatching
  carries shading, not gradients.
- **Colour accents**: vermillion/orange `#d88838`–`#b5502f` (roofs, frames),
  chart red for rhumbs `#7e2e20`, sage-olive for land `#a8a878` family.
- **Ink coverage**: figures ~48%, coloured charts 15–18%. Our marks should sit
  between those: figure-dense, field-light.

## Ground rules

- No image generators. Assets are drawn (canvas paths), synthesised
  (deterministic noise for paper grain), or measured from these references.
- Any real scan ever added must be public domain / CC0, with provenance noted
  here.
