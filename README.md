# Tile Lab

**Play it: <https://starrysidekick.github.io/tile-lab/>**
· [tile atlas](https://starrysidekick.github.io/tile-lab/atlas.html)

A sandbox for experimenting with tile mechanics and game modes, built to be
**fast to iterate on**. No build step, no dependencies, no image assets — plain
ES modules and a canvas. Edit a file, hit refresh, keep playing.

Three modes are built. **[MODES.md](MODES.md) is the queue** — twelve more
scoped out, with what each one changes mechanically, what it costs against the
current engine, and what question it answers.

## Run it locally

**Double-click `Play Tile Lab.command`.** It starts a local server and opens the
game. Closing that Terminal window stops it.

Or from a terminal:

```bash
python3 -m http.server 5180 --directory carcassonne-lab
```

It does need to be *served* — ES modules won't load over `file://`, so
double-clicking `index.html` won't work.

## Three modes so far

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

### Adventure (solo)

A tile-based RPG. You are one hero. Each turn you lay a tile and move one member
of your party — so exploration and map-making are the same act: **you decide
what the world contains by choosing where the next piece of it goes.**

- **Movement** — one tile anywhere. Two tiles along a road, free. Two tiles
  off-road is a *forced march* and costs a supply, shown on the tile before you
  commit. Roads are genuinely faster, not just flavour.
- **Villages** recruit a follower you can also move. More bodies means covering
  more ground, but only one of them acts per turn.
- **Cities** — once a city is *finished*, walk onto one of its tiles that also
  carries a road (the gate) and step inside. The interior is a street plan you
  discover district by district: markets, smithies, taverns, temples, guild
  halls, wells, back-alley caches. Bigger cities have more of it — the deck is
  sized from the finished city's tile count, so a two-tile hamlet is a few
  streets and a ten-tile capital is a warren.
- **Caves** work the same way, underground, with treasure.
- **Sites** are claimed the first time anyone in the party stands on them.
- **Journal** tracks five objectives and pays out gold as you complete them.

Score is gold + 5/relic + sites discovered.

## Playing

| | |
|---|---|
| Place tile | click a highlighted cell |
| Enter a city | stand on its gate, press `E` |
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

### Sound

Placeholder effects are **synthesised at runtime** — oscillators, filtered noise
and envelopes, no audio files. That keeps the no-assets rule and means you can
retune a sound by editing a number instead of re-recording. Voicing leans warm
and muted to match the palette: triangle waves through lowpass filters rather
than bright square/saw.

All 14 voices live in the `VOICES` table at the bottom of `src/audio.js`:

`place` `rotate` `meeple` `score` `step` `warp` `landmark` `rest`
`caveEnter` `caveExit` `treasure` `deny` `turn` `over`

Frequent sounds are deliberately tiny (a rotate tick peaks around 0.03) and
rewards are loud (treasure ~0.33), so the constant ones stay out of the way.
Use the **Test** dropdown in the panel to audition any of them.

**Real audio files override the placeholders.** Drop files into `assets/sfx/`
and list them in `assets/sfx/manifest.json`:

```json
{ "place": "tile-clack.wav", "score": "chime.mp3" }
```

Anything not listed keeps its synth voice, so you can replace the set one sound
at a time and A/B against the placeholder. A missing manifest is not an error.

Sound is driven by gameplay events rather than by the UI poking at it — `Game`
emits (`game.on(fn)`) and `main.js` maps events to voices, so the engine stays
free of audio and the same events can drive animation later.

### Sandbox tools

- **Free placement** — ignore edge matching, so you can build any board state
- **Feature overlay** (`D`) — `tiles·openEdges` per feature, `✓` when closed
- **Force next tile** — deal yourself a specific tile
- **Seed** — reproducible shuffles
- `window.LAB` exposes `game`, `renderer` and `THEME` live

## Adventure roadmap — scoped, not built

Ordered by how much game they add per unit of work. Each is deliberately
described in terms of what it changes mechanically, not just what it adds.

**1. Encounters (highest value).** Right now nothing on the map can hurt you, so
every decision is upside-only. Bandits on roads, wolves in fields, something
worse in deep cave tiles. Resolve against party size + gear so followers and the
smithy both suddenly matter. This is the single change that turns collecting
into *risk management*.

**2. Supply upkeep.** Followers currently cost nothing to keep. Charge 1 supply
per follower per turn and recruiting becomes a real decision instead of a
strict gain — you'd stop at the party you can feed. Pairs with wayshrines and
campsites becoming genuinely important rather than nice.

**3. Follower roles.** Scout (sees two tiles of the draw pile), porter (+carry,
cheaper marches), guard (wins encounters). Turns "a follower" into "*which*
follower", and makes which village you reach first matter.

**4. Quest chains.** Taverns currently pay coins. Have them *issue* a job —
"carry this to the keep three tiles east" — that names a real board location and
pays on delivery. Converts the map from a scoring surface into a set of
destinations.

**5. A clock.** The deck is the only timer, and it's long. A day counter with
nightfall (encounters get worse, or you must be in a settlement) gives every
turn a cost and makes the road dash a decision rather than a freebie.

**6. Gear and the economy.** Gold has no sink. Smithy sells a mount (+1 move) or
armour (encounter rolls); markets sell supplies. Gives the whole loop somewhere
to spend.

**7. Hero progression.** XP from discoveries; pick a perk every few levels.
Cheap to add once encounters exist, meaningless before.

**8. Named sites and a seeded world.** Generate names for cities and villages
and keep them in the journal, so a run becomes a story you can retell.

## Deliberately not implemented

**Farmers.** Field scoring needs fields modelled as their own segments, split by
roads and bounded by city walls — a road-bend tile has *two* distinct fields,
not one. That's a change to the tile format rather than an addition, so the
"roads that cut off farms" tiles above are currently about the *geometry*; the
fields they carve aren't scored yet. It's the natural next build, and the
wargame mode in [MODES.md](MODES.md) needs it too.

Also absent: an AI opponent, networked play, and persistence.
