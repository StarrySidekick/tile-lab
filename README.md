# Tile Lab

**Play it: <https://starrysidekick.github.io/tile-lab/>**
· [tile atlas](https://starrysidekick.github.io/tile-lab/atlas.html)

A sandbox for experimenting with tile mechanics and game modes, built to be
**fast to iterate on**. No build step, no dependencies, no image assets — plain
ES modules and a canvas. Edit a file, hit refresh, keep playing.

Eleven modes and five modifiers, all sharing one board engine. Each mode exists
to answer a specific question about what makes tile-laying good;
[MODES.md](MODES.md) is where that reasoning lives.

## Run it locally

**Double-click `Play Tile Lab.command`.** It starts a local server and opens the
game. Closing that Terminal window stops it.

Or from a terminal:

```bash
python3 -m http.server 5180
```

It does need to be *served* — ES modules won't load over `file://`, so
double-clicking `index.html` won't work.

## The modes

Pick one from the dropdown. Every mode brings its own tile pool, panel and
buttons.

### The short forms

**Duel** — 2 players, a bounded 5×5, 24 tiles, an open pool you draft from, and
nothing else. No meeples, no pawns, no gold. This is the diagnostic mode: if
placing a tile isn't fun with nothing on top of it, no amount of RPG will fix
that. Five minutes a game.

**Tesserae** — the daily puzzle. One seed derived from the date, so everyone
gets the same thirty tiles on the same 7×7 board on the same day. Solo, against
par.

**Sprawl** — pieces of two to four cells, in tetromino shapes. A big piece has
to satisfy several neighbours at once, so once a single-cell gap exists almost
nothing fits it — **denial becomes a real strategy**. Sealing an empty cell
makes a *courtyard* worth points. Four wild **fillers** each let you plug a hole
anyway, and you can always **break a piece** and play just one cell of it, so it
never deadlocks.

Pieces are *generated*, not authored: a shape is picked and then filled by
search with tiles whose shared edges agree, so every piece is valid by
construction. `atlas.html?group=pieces` shows a fresh dozen.

**Strata** — build on top of tiles. The top tile owns the edges; what's
underneath still counts. A closed feature scores **× its mean height**, so
building up beats building out and the skyline is the score. Ground-level tiles
earn stone, covering spends it, and you can't cover something that already
scored. Buried tiles still pay 1 to whoever laid them at the end — **covering
an opponent freezes them rather than erasing them**.

**Cirrus** — the cloud kingdom. Forty tiles, a hand of three, and the main verb
is *lifting*: each turn, play from hand or pick up a placed tile and put it
somewhere better. Two rules make that a game rather than a fidget — you can't
lift anything anchored, and a lift **must leave the board connected**. Closing a
feature *crystallises* its tiles into permanent land. Everything still cloud is
subject to the **drift**: at the end of each round, any unanchored tile holding
on by a single edge blows away.

### The long forms

**The Marches** — war and area control. The board grows from a keep per player
at opposite ends. Laying a tile beside ground you hold plants your banner; a
company marching onto neutral or enemy ground takes it. Battles are
deterministic — units plus terrain, defender wins ties — with **muster chits**
as the only variable, spent to win a fight you'd otherwise lose.

The good part is supply: territory is counted every four rounds, and a region
only scores **if it can trace a path of your banners back to your keep**. So the
sharpest move is often the tile that *severs* rather than the one that grows.

**Descent** — the roguelike. Four depths, one life. Each depth is a small board
with a stair down shuffled into the back half of its deck; find it before the
tiles run out. Encounters resolve against your might, and losing costs health.

Between depths you pick one of three boons — a stat, a relic that changes a
rule, or **more of a thing the world can contain**. That last kind is the point:
the upgrade currency is the tile pool itself. Each depth also reweights the
deck toward danger, so the difficulty curve isn't a number, it's the deck.

**The Chronicle** — story mode with D&D bones. Each tile you lay produces a
prompt built from what's actually on it, and you pick one of three endings or
type your own. Places get **names** (a seeded generator, so `(3,-2)` becomes
Ashfen Mill), threads fill **clocks** as relevant tiles come up, and an
**oracle** answers yes/no/and/but when the table doesn't know. Export the whole
log as markdown when you're done — the shareable artifact is the point.

**Expedition** — pawns that walk the map instead of meeples that sit on it.
Place a tile, then move a pawn. Landmarks go to the first pawn to reach them,
which makes placement a race.

| Landmark | Effect |
|---|---|
| **Stable** | Your pawn is mounted permanently — 2 tiles per turn |
| **Village** | Rest a turn (pawn goes face-down) to raise a second pawn here |
| **Watchtower** | Once two are standing, pawns warp between any two towers |
| **Cave mouth** | Drop into a private sub-map with its own tile pool and treasure |
| **Market / Keep / Library / Armoury** | City landmarks — collect all four for +8 |

**Adventure (solo)** — a tile-based RPG. Exploration and map-making are the same
act: you decide what the world contains by choosing where the next piece of it
goes. Roads are genuinely faster (two tiles free; two off-road costs a supply),
villages recruit followers, and **finished cities can be entered** through a
road gate to discover their streets district by district. Caves work the same
way, underground.

**Classic** — place a tile, optionally claim a feature, score it when it closes.
Meeples can be turned off entirely, in which case a completed feature pays
whoever closed it — the cheapest way to see how much of Carcassonne is the
meeples.

## Modifiers

Orthogonal to modes, and they compose — each one changes several modes at once,
which is where the leverage is.

| Modifier | What it does |
|---|---|
| **Drafting market** | A face-up row instead of a blind draw. The first is free; reaching past a tile discards it, so cost needs no currency |
| **Hidden agendas** | Two secret objectives each, scored at the end. Every placement becomes a tell |
| **Fog of war** | Tiles far from your figures fade out |
| **Two-faced tiles** | Most tiles have a reverse — a road is a city on the back. Press `F` before you place |
| **Rising tide** | A waterline climbs the board every three rounds, drowning whatever it reaches. It's implemented as a moving bound, so nothing else needed a special case |

## Playing

| | |
|---|---|
| Place tile | click a highlighted cell |
| Pick from the row | click it, or `1`–`4` |
| Rotate | `R` (or right-click, or shift+scroll) |
| Flip a two-faced tile | `F` |
| Claim a feature | click the pulsing meeple marker |
| Enter a city | stand on its gate, press `E` |
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
- **Adventure sites** — wayshrines, ruins, campsites, merchants
- **War terrain** — keeps, forts, hills, fords, beacons, muster fields
- **Dangers** — stairs down, bandit camps, wolf dens, barrows
- **Cloud kingdom** — skyholds, windvanes, raincatches

Changes apply on the next new game. Each mode picks sensible defaults when you
switch to it.

## How it's put together

```
src/tiles.js       tile data — the only file you touch to add tiles
src/pieces.js      polyomino generation for Sprawl
src/theme.js       the entire colour scheme, in one place
src/board.js       grid, placement, connectivity, removal, stacking, scoring
src/art.js         procedural tile + landmark drawing (no assets)
src/game.js        the host: turn flow, deck, players, modifiers
src/modes/         one file per mode, behind a small set of hooks
src/interior.js    caves and city streets — a sub-map on the same loop
src/render.js      camera, canvas painting, overlays, hit-testing
src/main.js        DOM wiring
tools/             headless and browser test harnesses
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
in Classic; they're what every other mode is built on. Anchoring a mark to a
feature index puts it inside that feature (so a market sits in its city).

Connectivity is a union-find over `(tile, featureIndex)` pairs where each
component counts how many edge-slots are still open. Joining two tiles closes
two slots; zero means complete. That one counter is the whole completion
rule — identical for a 2-tile road and a 40-tile city.

### A mutable board

Union-find can't split, so removing a tile can't be incremental. It doesn't need
to be: `cells` is the source of truth and connectivity is **recomputable**.
`Board.rebuild()` throws the components away and replays every visible cell in
placement order — O(n) with n in the low hundreds, which is free at this scale.

That one primitive is what lets tiles be **lifted** (Cirrus), **covered**
(Strata), **flipped** (two-faced) and **drowned** (rising tide). Two pieces of
state have to survive a rebuild, so neither lives on the component: meeples live
on their cell, and "already scored" lives in `scoredParts` as a set of
cell-feature keys.

### Adding a tile type

One line in `src/tiles.js`. It gets art, meeple spots, edge matching, landmark
placement and scoring for free:

```js
{ id: 'Ze', n: 2, group: 'cities', name: 'City corner + 3-way road',
  feats: [ city([N, W]), road([E]), road([S]) ] },
```

Check it in `atlas.html` (which takes `?group=cities` to show one group), then
use **Force next tile** to deal it to yourself immediately.

### Adding a mode

Write `src/modes/<name>.js` exporting a class extending `Mode` plus a `.spec`,
and add it to the list in `src/modes/index.js`. Nothing else changes — the
dropdown, hint, player-count limits, panel and buttons are all built from the
spec and the hooks.

```js
export class Skirmish extends Mode {
  deck()            { return buildDeck(['base'], this.game.rng, 'D', 30); }
  seeds()           { return [{ x: 0, y: 0, id: 'D' }]; }
  afterPlace(cell)  { return 'move'; }        // or null to just end the turn
  onClosed(d, by)   { this.game.award(d, false, by); }
  actions()         { return [{ label: 'Rally', fn: (g) => g.endTurn() }]; }
  panel()           { return '<p>…</p>'; }    // null keeps the score table
}
Skirmish.spec = { id: 'skirmish', name: 'Skirmish', Mode: Skirmish, groups: ['base'] };
```

Every hook has a do-nothing default, so a mode file only writes what it changes.
Walking modes add `visiblePawns`, `reachable`, `select` and `moveSelected`, and
the renderer draws figures and move targets from those.

### Testing

Eleven modes is more than you can click through, and a change in `board.js`
breaks the one you weren't looking at.

```bash
node tools/harness.mjs              # every mode + modifier, headless
node tools/harness.mjs marches 200  # one mode, 200 seeded games
node tools/smoke.mjs                # each mode booted in a real browser
node tools/smoke.mjs --shots        # …and screenshotted to tools/shots/
```

The harness plays random legal moves to completion and fails on anything that
throws, hangs or gets stuck with no legal action. It also prints turn counts and
score spreads, which is the cheap way to notice that a mode is degenerate before
you sit down to play it. The smoke test covers the half that only exists in a
browser: that each mode renders, builds its panel and survives being clicked.

`package.json` exists only so Node treats `src/` as ES modules for those two
scripts. The game itself still has no build step and no dependencies.
(`tools/smoke.mjs` wants Playwright, which is the one dev-only exception:
`npm install --no-save playwright`.)

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
- `window.LAB` exposes `game`, `renderer`, `THEME` and `MODES` live

## What's next

[MODES.md](MODES.md) has the full reasoning behind each mode, what it was built
to find out, and what's still scoped but unbuilt. The short version of what the
engine is still missing:

**Fields as real features.** Farmers, and richer area control in The Marches,
both need fields modelled as their own segments — split by roads, bounded by
city walls, so a road-bend tile has *two* distinct fields. That means features
carrying half-edges (eight slots, not four) rather than a new feature type. It's
a change to the tile format, so it wants doing before the pool grows much
further. The Marches currently does area control by banner instead, which works
but is coarser.

**A proper battle UI for The Marches.** Muster chits are auto-spent to win a
fight when you can afford it. Against a human, choosing to spend — and bluffing
about it — is the interesting half, and that needs a prompt.

Also absent: an AI opponent, networked play, and persistence beyond Descent's
unlocks.
