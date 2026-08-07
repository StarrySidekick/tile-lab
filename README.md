# Tile Lab

A Carcassonne-style tile game built to be **fast to iterate on**. No build step, no
dependencies, no image assets — plain ES modules and a canvas. Edit a file, hit
refresh, keep playing.

## Run it

**Double-click `Play Tile Lab.command`.** It starts a local server and opens the
game. Closing that Terminal window stops it. Running it twice is harmless — the
second one just reopens the tab.

Or from a terminal:

```bash
python3 -m http.server 5180 --directory carcassonne-lab
```

Then open <http://localhost:5180>. Any static server works — it's just files.
It does need to be *served*, though: ES modules won't load over `file://`, so
double-clicking `index.html` itself won't work.

- `index.html` — the game
- `atlas.html` — every tile type at rotation 0 with its edges and meeple anchors

## Playing

| | |
|---|---|
| Place tile | click a highlighted cell |
| Rotate | `R` (or right-click, or shift+scroll) |
| Claim a feature | click the pulsing meeple marker |
| Skip claiming | `Space` |
| Pan / zoom | drag / scroll |
| Recenter | `C` |
| Feature overlay | `D` |

Hotseat for 2–5 players. Cities score 2/tile + 2/shield when closed (1 each at
game end), roads 1/tile, monasteries 1 + surrounding tiles.

## How it's put together

```
src/tiles.js   tile data — the only file you touch to add tiles
src/board.js   grid, placement legality, feature connectivity, scoring
src/art.js     procedural tile drawing (no assets)
src/game.js    turn flow: draw → place → claim → score
src/render.js  camera, canvas painting, hit-testing
src/main.js    DOM wiring
```

### The core idea

A tile is **a list of features**, not a picture:

```js
{ id: 'P', n: 3, name: 'City corner + road',
  feats: [ city([N, W]), road([E, S]) ] }
```

`sides` says which tile edges a feature reaches. Two road stubs that meet at a
village center are two *separate* features — that's exactly what makes a 3-way
junction terminate three roads. Everything else is derived: the edge letters used
for the matching rule, the art, and where meeples sit.

Connectivity is a union-find over `(tile, featureIndex)` pairs. Each merged
component tracks how many edge-slots are still hanging open; joining two tiles
closes two slots at once, and a component that reaches zero is complete and
scores. That one counter is the whole completion rule — it works identically for
a two-tile road and a forty-tile city.

### Adding a tile type

One line in `src/tiles.js`. It gets art, meeple spots, edge matching, and
scoring for free:

```js
{ id: 'Y', n: 2, name: 'City corner + 3-way road',
  feats: [ city([N, W]), road([E]), road([S]) ] },
```

Check it in `atlas.html`, then use **Force next tile** in the sandbox panel to
deal it to yourself immediately.

### Sandbox tools

- **Free placement** — ignore edge matching, so you can lay out any board state
- **Feature overlay** (`D`) — shows `tiles·openEdges` per feature, `✓` when closed
- **Force next tile** — deal yourself a specific tile
- **Seed** — reproducible shuffles while you're chasing a bug
- `window.LAB` in the console exposes `game` and `renderer` live

## Deliberately not implemented

**Farmers.** Field scoring needs fields modeled as their own segments, split by
roads and bounded by city walls — a tile like `V` has two distinct fields, not
one. That's a real change to the tile format (fields become explicit features
with their own sub-edge positions), so it's the natural next thing to build
rather than something to bolt on.

Also absent: an AI opponent, networked play, the river/expansions, and
persistence.

## Shipping it

It's already static — the folder drops onto GitHub Pages, Netlify, or any host
as-is. Nothing to compile.
