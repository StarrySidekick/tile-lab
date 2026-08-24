# ---------------------------------------------------------------------------
# Synthesise the paper. Deterministic, seeded, and tileable: value noise for
# the sheet's cockle, horizontal fibre streaks for the laid texture, chain
# lines, and a scatter of darker flecks. No image generator anywhere near it —
# this is the same fractal-noise construction every texture tool uses, written
# out longhand.
#
#   python3 tools/paper.py        writes assets/paper.png (tileable, 512px)
#
# The PNG ships with the game and is drawn as a repeating pattern under the
# chart and the panels. Regenerating it with the same seed reproduces it
# byte-for-byte in spirit (PNG encoder aside); change SEED to re-roll.
# ---------------------------------------------------------------------------
import numpy as np
from PIL import Image

SEED = 11
N = 512
rng = np.random.default_rng(SEED)

def tileable_noise(n, cells):
    """Value noise that wraps: random lattice, bicubic-ish upsample by FFT pad."""
    g = rng.standard_normal((cells, cells))
    # Upsample by zero-padding the spectrum => smooth periodic interpolation.
    F = np.fft.fft2(g)
    P = np.zeros((n, n), dtype=complex)
    h = cells // 2
    P[:h, :h] = F[:h, :h]
    P[:h, -h:] = F[:h, -h:]
    P[-h:, :h] = F[-h:, :h]
    P[-h:, -h:] = F[-h:, -h:]
    out = np.real(np.fft.ifft2(P)) * (n / cells)
    return (out - out.min()) / (out.max() - out.min() + 1e-9)

# The sheet: several octaves of cockle.
base = (0.55 * tileable_noise(N, 8) + 0.28 * tileable_noise(N, 24)
        + 0.17 * tileable_noise(N, 64))
base = (base - base.min()) / (base.max() - base.min())

# Laid texture: fine horizontal fibre streaks (wire lines), slightly wavering.
y = np.arange(N)
wobble = tileable_noise(N, 6)[:, 0] * 3.0
wire = 0.5 + 0.5 * np.sin((y[:, None] + wobble[None, :] * 4) * (2 * np.pi * 96 / N))
wire = wire ** 3
fibre_gain = 0.5 + 0.5 * tileable_noise(N, 16)      # streaks come and go

# Chain lines: sparse vertical lines every ~64px, soft.
x = np.arange(N)
chain = np.exp(-((x[None, :] % 64) - 32) ** 2 / 6.0)

# Flecks: darker specks of pulp.
flecks = np.zeros((N, N))
for _ in range(240):
    fx, fy = rng.integers(0, N, 2)
    r = rng.integers(1, 3)
    yy, xx = np.ogrid[-r:r + 1, -r:r + 1]
    mask = xx * xx + yy * yy <= r * r
    ys, xs = (np.arange(fy - r, fy + r + 1) % N), (np.arange(fx - r, fx + r + 1) % N)
    flecks[np.ix_(ys, xs)] += mask * rng.uniform(0.25, 0.7)
flecks = np.clip(flecks, 0, 1)

# Compose as a light-map around 1.0: >1 lighter paper, <1 darker.
light = (1.0
         + (base - 0.5) * 0.10          # cockle
         - wire * fibre_gain * 0.035    # wire lines
         - chain * 0.05                 # chain lines
         - flecks * 0.10)               # pulp

# The gold-buff paper of the references (#e8d0a0 family), modulated.
tone = np.array([0xE6, 0xD2, 0xA6], dtype=float)
img = np.clip(tone[None, None, :] * light[:, :, None], 0, 255).astype(np.uint8)
Image.fromarray(img).save('assets/paper.png', optimize=True)

# Check tileability + report.
a = np.asarray(Image.open('assets/paper.png')).astype(int)
seam_x = np.abs(a[:, 0] - a[:, -1]).mean()
seam_y = np.abs(a[0, :] - a[-1, :]).mean()
print(f'assets/paper.png {a.shape[1]}x{a.shape[0]}  seam dx {seam_x:.1f} dy {seam_y:.1f} (lower is cleaner)')
