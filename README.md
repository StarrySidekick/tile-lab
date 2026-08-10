# Tile Lab

**Play it: <https://starrysidekick.github.io/tile-lab/>**
· [tile atlas](https://starrysidekick.github.io/tile-lab/atlas.html)

A Carcassonne-style tile game built to be **fast to iterate on**. No build step, no
dependencies, no image assets — plain ES modules and a canvas. Edit a file, hit
refresh, keep playing.

## Run it locally

**Double-click `Play Tile Lab.command`.** It starts a local server and opens the
game. Closing that Terminal window stops it.

Or from a terminal:

```bash
python3 -m http.server 5180 --directory carcassonne-lab
```

It does need to be *served* — ES modules won't load over `file://`, so
double-clicking `index.html` won't work.

## Two modes

### Classic

Place a tile, optionally claim a feature with a meeple, score it when it closes.
Cities 2/tile + 2/shield, roads 1/tile, monasteries 1 + surrounding tiles.

**Meeples can be turned off entirely.** With no meeples, a completed feature pays
whoever closed it — the placement game stays intact without any claim or supply
management.

### Expedition

A different use of meeples. Each player has a **pawn** that walks the map. Every
turn you place a tile, *then move a pawn one tile* (two if it's mounted). The
board stops being a scoring grid and becomes terrain you lay in front of
yourself as you travel.

Landmarks go to the **first pawn to reach them**, which is what makes placement a
race: you're building road toward what you want while trying not to build it
toward what they want.

| Landmark | Effect |
|---|---|
| **Stable** | Your pawn is mounted permanently — 2 tiles per turn |
| **Village** | Rest a turn (pawn goes face-down) to raise a second pawn here |
| **Watchtower** | Once two are standing, pawns warp between any two towers |
| **Cave mouth** | Drop into a private sub-map with its own tile pool and treasure |
| **Market / Keep / Library / Armoury** | City landmarks — collect all four for +8 |

**Caves** are a real second board: your own tile pool of passages and chambers,
lit by a lantern falloff. You place a passage and move each turn, banking
hoards, troves and springs, and climb out at the entrance or via a shaft. Other
players keep going on the surface while you're down there.

> **Towers are a placeholder.** Warp-between-towers is my proposal, not your
> spec — it's one function in `expedition.js` (`reachable`) if you want
> something else.

## Playing

| | |
|---|---|
| Place tile | click a highlighted cell |
| Rotate | `R` (or right-click, or shift+scroll) |
| Claim a feature | click the pulsing meeple marker |
| Skip / hold | `Space` |
| Move a pawn | click your pawn, then a gold target |
| Pan / zoom | drag / scroll |
| Recenter | `C` |
| Feature overlay | `D` |

## The tile pool

Tiles are grouped, and each group toggles on and off independently:

- **Carcassonne base set** — the original 72
- **Road experiments** — continuous crossroads (two roads crossing without
  meeting, so a crossroads no longer *closes* anything), dead-ends that seal a
  field off, double bends, fork-and-bypass
- **City experiments** — city tunnels with a road passing under, four separate
  cities on one tile, twin corner cities
- **Outposts** — stables, villages, watchtowers, cave mouths
- **City landmarks** — markets, keeps, libraries, armouries

Changes apply on the next new game.

## How it's put together

```
src/tiles.js      tile data — the only file you touch to add tiles
src/theme.js      the entire colour scheme, in one place
src/board.js      grid, placement legality, feature connectivity, scoring
src/art.js        procedural tile + landmark drawing (no assets)
src/game.js       turn flow for both modes
src/expedition.js pawn movement, landmarks, caves
src/render.js     camera, canvas painting, cave overlay, hit-testing
src/main.js       DOM wiring
```

### The core idea

A tile is **data, not a picture** — a list of features plus a list of marks:

```js
{ id: 'Oa', n: 3, group: 'outposts', name: 'Stable',
  feats: [ road([N, S]) ],
  marks: [ mark('stable') ] },
```

**Features** are edge-connected: they span tiles, merge with neighbours, and
score. `sides` says which edges they reach. Two road stubs meeting at a village
centre are two *separate* features — that's exactly what makes a 3-way junction
terminate three roads.

**Marks** are landmarks that sit on a tile and never span tiles. They do nothing
in Classic; they're what Expedition is built on. Anchoring a mark to a feature
index puts it inside that feature (so a market sits in its city).

Everything else is derived: edge letters for the matching rule, the art, meeple
anchors, landmark positions.

Connectivity is a union-find over `(tile, featureIndex)` pairs where each
component counts how many edge-slots are still open. Joining two tiles closes
two slots; zero means complete. That one counter is the whole completion
rule — identical for a 2-tile road and a 40-tile city.

### Adding a tile type

One line in `src/tiles.js`. It gets art, meeple spots, edge matching, landmark
placement and scoring for free:

```js
{ id: 'Ze', n: 2, group: 'cities', name: 'City corner + 3-way road',
  feats: [ city([N, W]), road([E]), road([S]) ] },
```

Check it in `atlas.html` (which takes `?group=cities` to show one group), then
use **Force next tile** to deal it to yourself immediately.

### Re-vibing the look

`src/theme.js` holds every colour plus the dusk vignette. The current look is
Twilight Princess: desaturated and warm-shifted, olive rather than emerald
greens, grey-brown stone, and a dusk vignette with a faint amber wash over the
whole frame. Saturation stays low so the gold accents and twilight teal are the
only things that read as bright.

### Sandbox tools

- **Free placement** — ignore edge matching, so you can build any board state
- **Feature overlay** (`D`) — `tiles·openEdges` per feature, `✓` when closed
- **Force next tile** — deal yourself a specific tile
- **Seed** — reproducible shuffles
- `window.LAB` exposes `game`, `renderer` and `THEME` live

## Deliberately not implemented

**Farmers.** Field scoring needs fields modelled as their own segments, split by
roads and bounded by city walls — a road-bend tile has *two* distinct fields,
not one. That's a change to the tile format rather than an addition, so the
"roads that cut off farms" tiles above are currently about the *geometry*; the
fields they carve aren't scored yet. It's the natural next build.

Also absent: an AI opponent, networked play, and persistence.
