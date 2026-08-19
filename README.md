# Tile Lab

**Play it: <https://starrysidekick.github.io/tile-lab/>**
· [tile atlas](https://starrysidekick.github.io/tile-lab/atlas.html)

A sandbox for experimenting with tile mechanics and game modes, built to be
**fast to iterate on**. No build step, no dependencies, no image assets — plain
ES modules and a canvas. Edit a file, hit refresh, keep playing.

Twelve modes and sixteen mechanics, all sharing one board engine. Each mode
exists to answer a specific question about what makes tile-laying good;
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

**Girando** — the cloud kingdom, where the board itself is weather. You draw
one tile and claim as in Carcassonne; the difference is that the country won't
hold still, and neither will the people standing on it.

| | |
|---|---|
| **Zephyr** | Twenty of them in a seventy-two tile deck. Played, one blows its lane downwind — the whole length of it. Gusts **stack**, and only one thing stacks them: a wind that runs over a zephyr blowing the *same* way absorbs it and blows a square harder, up to three. One blowing *across* isn't absorbed and fires in its own turn, so a line of them is a chain; one blowing straight *back* does nothing, because the two brace. No zephyr blows twice in one storm, and no zephyr is ever nailed down — a zephyr tile never crystallises, because weather you can freeze in place stops being weather |
| **The four winds** | One crosswind, one split wind, one trident and one compass rose — each opens two, three or four lanes at once out of the same square, in the turn it's played. One of each in the deck |
| **Falling** | A tile that lands touching nothing **edge to edge** falls out of the sky. Corners don't hold anything up, so the sky sheds tiles readily — and they fall into the **hand** of whoever set the wind off. Better: catch one on your own turn and you may **throw it straight back down**, taking a second placement while the hole the wind just made is still open. Once a turn, or a caught zephyr would buy the placement that catches the next |
| **Followers** | Weather too. Once a figure is on the board it never comes off by choice: a gust blows it as far as everything else in its lane and it takes up whatever it lands in — its own kind of feature if there is one, anything claimable if not, and simply lying on the tile holding nothing if there's nothing there. Blown over open sky it goes back to its owner's hand, and that is the only way home |
| **Crystals** | Finishing a feature turns its tiles to permanent land. A crystallised **city** is solid all the way up: it stops a gust dead and shelters everything in its lee. A crystallised **road** is flat ground — it doesn't move, but the wind goes straight over it. Cities are the walls you build; roads are the floor you build them on |
| **Temple** | A monastery with no cloisters left in the sky — every one is a temple. Claim it and it pays by the tile: **1** every time somebody *lays* a tile in the eight squares around it, **2** every time the wind *blows* one in. The sky can pick the whole building up and move it, parish, keeper and all |
| **Tower turbine** | A mill built into a city wall. Every gust that runs through it pays **1** to whoever holds that city — the one thing on the board that wants the weather to keep coming back. Finishing the city doesn't stop it: closing hands the followers home, so the holder at the moment of closing keeps the mill |
| **Sfera** | Twelve of them, each half a sphere on one edge, and that edge meets nothing but another sfera's. Join two and they **lock forever**, and the sky counts **every island**: most figures on each piece of country takes a flat **3**, ties paying both. Once, then and there — six spheres, six counts in a whole game. Flat is the point: paying per tile made this one rule three quarters of the game's points, so the way to win a count is now to be standing on *several* pieces of sky rather than parked on the biggest. Resolved at the end of that turn, after everything else it did |
| **The Palazzo** | The seat of the kingdom and the tile the game starts on — same connections as an ordinary start tile, and no more rooted than anything else, so the sky shoves the seat of government around. Whichever island it has ended up on is worth **6** instead of 3 when a sphere closes |
| **Sky ship** | One per player, in your colour, held rather than drawn. It's the one tile drawn as open sky, because it's the one tile that fits against anything. Moor it to the **outside** of a piece of country — never an internal hole — and every feature that finishes on that piece pays **2** more. It fits anywhere and does nothing to what it touches: no road ends at a ship, no city walls itself against one. Once moored it stays moored until a gust reaches it, which is the tension — the ship wants to be where the weather never goes, and it can't leave unless the weather comes |
| **Straight roads** | Are quietly weathervanes. A road hit side-on swings to lie along the wind, so a road you built is a road the weather has opinions about. Three-way junctions end their roads and carry a village; the windvane still has four ways in and two of them joined |
| **Abbazia** | Takes any edge, and **caps** everything it touches — a road ends there, a city walls itself against it, and both can finish without meeting anything. It's drawn walled edge to edge, because that's what it does. It's an ordinary tile, so the wind can take it away again, and then everything it was holding shut is unfinished and can be **scored a second time** |
| **Flying machine** | Points down a lane. Place one and your follower may go on **any tile out along that lane** rather than only the tile you laid — including a feature somebody already holds, but never a tile with a figure on it. It **crosses open sky**, so an island nobody has built a road to is reachable, which is most of what the machine is for. A zephyr crossed on the way is a wind you're *in*: the flight turns and follows it, and one blowing straight back at you is where the flight ends |

**The sky is the space, not the ground.** The gaps between tiles are open air —
that's what a tile blown off the edge falls into, and what runs between islands
— while the tiles themselves stay ordinary countryside. It's drawn as an old
chart of that sky: a graticule with heavy meridians every five squares, the
rhumb lines a portolan strikes from its compass nodes, and a rose on the origin
with the Latin winds named round it. Cities pay the ordinary
2 a tile, and there is no four-sided city anywhere in the pool, because a city
with four ways in and no way to cap it is one the weather never lets you finish.
Nothing pays until it closes, nothing unfinished pays at the end — the temple, the turbine, the ship and the island count are the
exceptions, and all four are the sky's terms rather than yours.

**World** — the countryside gets the rest of its geography, in four families
you can also switch on inside any other mode:

| | |
|---|---|
| **Mountains** | Pay the *instant* a range grows, scaling with its size — a range of five has paid 2+3+4+5 over its life, so joining two ranges is worth more than either. Nothing can be claimed on them, which makes them the one thing on the board you can't be denied |
| **Forests** | 1 per tile, +1 per log, and **no complete/incomplete distinction at all**. A forest is simply as big as it is and pays the same either way — so they're the safe claim and cities are the greedy one |
| **Lakes** | Worth nothing alone. A city beside one is worth +3 per distinct body of water, which turns "where is the water" into a placement question rather than scenery. Shores and corners only |
| **Rivers** | Carcassonne's, laid before the game proper — and they pay a city the same way a lake does |

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

## Mechanics

Rules you switch on à la carte, in any mode and any combination. Anything a
single mode invented that turns out to be interesting on its own lives here
rather than locked inside that mode — lifting came out of the cloud kingdom,
building on top came out of Strata, and both are more useful bolted onto
Classic, or onto each other.

**Play**

| | |
|---|---|
| **Drafting market** | A face-up row instead of a blind draw. The first is free; reaching past a tile discards it, so cost needs no currency |
| **Lift placed tiles** | Instead of placing, pick up an unclaimed tile that isn't holding the board together, and play it somewhere better |
| **Build on top of tiles** | Strata's rule, anywhere. Cover a tile that hasn't scored and has nobody on it. Three levels maximum |
| **Recall a follower** | Instead of claiming, take one of your followers back off the board |
| **Followers walk on** | Abbey & Mayor's wagon. When a feature scores, your follower steps along the road to the next unclaimed, unfinished thing instead of going home |
| **Two-faced tiles** | Most tiles have a reverse — a road is a city on the back. Press `F` before you place |
| **Fog of war** | Tiles far from your figures fade out |

**Scoring**

| | |
|---|---|
| **Hidden agendas** | Two secret objectives each, scored at the end. Every placement becomes a tell |
| **Rising tide** | A waterline climbs the board every three rounds, drowning whatever it reaches. It's a moving bound on the board, so nothing else needed a special case |
| **King & Robber Baron** | Whoever finished the largest city, and the longest road, each score 1 per completed city / road on the board at the end |

**Carcassonne expansions**, implemented from the published rules:

| | |
|---|---|
| **The River** | The mini-expansion. Laid first, spring to lake, and it may not double back on itself — two curves in a row bending the same way would make a U-turn. Only an *immediate* reversal is illegal, which is the official reading |
| **Inns & Cathedrals** | An inn doubles its road and a cathedral triples its city — and both pay **nothing at all** if the feature never closes |
| **Big follower** | One large follower each, counting as two when majorities are worked out |
| **Abbey tile** | One abbey each, played instead of your tile into a hole surrounded on all four sides. It scores as a monastery, so it's always worth 9 |
| **Builder** | Extend a feature you already hold and you get another tile this turn, once per turn |
| **Trade goods** | Wine, grain and cloth go to whoever *closes* the city holding them, follower or not. Most of each at the end is worth 10 |

Two of these are simplified where the UI can't yet ask a question. The builder
has no separate figure — any of your followers on the extended feature counts,
which is the same decision without the bookkeeping. And a wagon only offers the
walk to the player whose turn it is; everyone else's followers go home, because
stopping to ask four people in turn is worse than the rule is good.

## Tiles per turn

A dropdown, one to five. Each tile is a full place-and-act step, so in a
walking mode "three" means three tiles and three moves before play passes on.
It is the cheapest way to find out whether a mode is paced wrong — most of
these were built assuming one, and several are better at two.

## Playing against the computer

**Computer** hands the last seats to a bot, so you're always the first player.
It starts on, with one opponent: set it to *None* for a hotseat game, or to
*All* and watch them play each other. It applies immediately, mid-game
included — switch it on and the computer inherits whatever position you'd got
yourself into, which is also the quickest way to find out what it would have
done differently.

**Skill** is three settings of one judgement rather than three bots. *Steady*
is the evaluation straight. *Careless* is the same one shouted over — about
nine points of noise on every candidate move, so it misses things without
playing nonsense. *Sharp* takes the noise off, claims a little more eagerly,
and bothers with the one-off verbs: the abbey, the big follower, flipping a
two-faced tile, lifting a placed one when nothing else will fit.

**Thinking** is the pause between its actions. *Instant* is one action per
frame, which is the setting for watching a whole game go past.

It plays every mode, because it doesn't know what a mode is. Each candidate
move is genuinely played on the board, the position that results is scored from
its seat, and the tile comes straight back off — `Board.remove()` rebuilds
connectivity from scratch, so a trial leaves nothing behind. What it counts is
what closed and what the closure pays, who is standing in what, what an open
feature will *probably* be worth by the end (a city with room to grow is worth
more than a cramped one, and both are worth less with every tile that leaves
the deck), and whether it's leaving something one tile from closing for the
player after it.

Anything a mode scores on its own books is invisible to that, so the modes hand
it the missing points through two hooks — banners and battle odds in The
Marches, landmarks in Expedition, courtyards in Sprawl, height in Strata,
mountain ranges in World. A mode that implements neither gets a bot that plays
the placement game straight and ignores the trimmings, which is a fair
description of what it is.

It searches one move deep and it does not model the deck. Against random legal
play in Classic it takes about 90% of decided games on *Careless* and
effectively all of them on *Sharp*; *Sharp* beats *Steady* about 88% of the
time, which is the only evidence that the three settings are a ladder rather
than three flavours. Against a person who is thinking, it is beatable — that's
the point of it.

## Which version am I looking at?

The panel header carries a build stamp — `v0.9.0 · b12` — and it is the first
thing to check when a change doesn't seem to have arrived.

It's stamped into two files by `node tools/stamp.mjs`: `src/version.js`, which
is compiled into the page, and `version.json`, which the page fetches at boot
with the cache switched off. On load it compares them. If they agree, the badge
is quiet gold and you're running what the server has. If they disagree the
badge goes solid amber and reads `v0.9.0 · b11 → v0.9.0 · b12` — your browser
handed you an old copy, click it to reload, and hard-refresh if it comes back
saying the same thing.

That pair is the point. A version number baked into a page can only tell you
what the page thinks it is; it cannot tell you the page itself is stale, which
is the one thing you actually want to know after a deploy.

`node tools/stamp.mjs 0.10.0 -m "what changed"` sets a version and a label; with
no arguments it just bumps the build number. The browser test fails if the two
files ever fall out of step.

## Motion

Nothing on this board teleports any more.

**Scoring.** The number floats off the tiles that paid it, in the colour of
whoever was paid, and those tiles flash underneath. That pairing is the point:
a score you can see is worth less than a score you can *locate* — "+9" tells
you how much, the flash tells you which city. Where a mode scores something
with no place on the board, no number floats, because a "+14" over an
unrelated tile is worse than none; the panel row bumps instead, and that works
in every mode. **At the end**, where a dozen features settle in a single frame,
they're paid out one at a time, a quarter-second apart, so the final score is
a result rather than a number changing.

**Arriving and leaving.** A tile flies in from the preview — the thing you were
just looking at — and lands slightly oversized, settling. In Strata it keeps
going and rises onto the stack it covered. A follower hops in on an arc and
hops back off when it's recalled; one that walks on (the wagon) crosses to its
new feature rather than reappearing there. Pawns and companies walk their move.
Tiles that leave do it visibly too: a gust in Girando tumbles them off the edge,
and the rising tide slides them under with the water going over them.

**Territory.** In The Marches a banner running out through a region shows you
the shape of what you now hold, the levy count lights each region up before it
says what it paid, and ground that can't trace a path home is drained of colour
— it scores nothing, so it shouldn't look like ground that does.

**The camera** eases to the computer's move when it lands off-screen, and stops
the instant you touch the board. **The sea** lags the waterline and slides up to
meet it. Small ones: a square closing onto a landed tile, a ring where a
follower is claimed, a red one for an illegal move, and treasure rings inside
caves — which need their own pass, because an interior draws through its own
camera.

`src/fx.js` holds all of it: inert items with a kind, a position in world
units, a birth and a lifespan, spawned from the *same* event stream that drives
the sound, so neither subscriber knows the other exists. Two things make
animation possible in a renderer that otherwise paints only the current state —
**veils** (a tile in flight must not also be sitting at its destination, so an
effect can hide what it's animating, by key, until it lands) and **a birth in
the future** (staggering is just an offset birth, which is how the endgame walks
the board and how a banner sweeps a region). Drawing lives in `render.js` with
the rest of the painting. **Score effects** in the panel turns the lot off, and
it starts off if your system asks for reduced motion.

Still scoped: the camera doesn't follow the endgame tally, so features light up
off-screen; and the deliberate omissions are screen shake, particle bursts and
confetti — wrong game, and they'd be the only loud thing in a palette that's
restrained on purpose.

## Playing

| | |
|---|---|
| Place tile | click a highlighted cell |
| Lift a placed tile | `L`, then click it |
| Use the big follower | `B`, then claim |
| Pick from the row | click it, or `1`–`4` |
| Rotate | `R` (or right-click, or shift+scroll) |
| Flip a two-faced tile | `F` |
| Claim a feature | click the pulsing meeple marker |
| Enter a city | stand on its gate, press `E` |
| Skip / hold | `Space` |
| Move a pawn | click your pawn, then a gold target |
| Pan / zoom | drag / scroll, or one finger / two |
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
- **Cloud kingdom** — zephyrs (including four that blow more than one way at
  once), sferas, temples, tower turbines, Abbazias, flying machines, windvanes
  and city end caps (Girando's pool)
- **Mountains** — spurs, ridges, bends, massifs, passes, and one peak
- **Forests** — edges, corners, deep forest and old growth, some with logs
- **Lakes** — shores, corners, narrows, headlands
- **Inns & cathedrals**, **trade goods** — the expansion tiles, switched on
  with their mechanic

Changes apply on the next new game. Each mode picks sensible defaults when you
switch to it.

## How it's put together

```
src/tiles.js       tile data — the only file you touch to add tiles
src/mechanics.js   the à-la-carte rules catalogue, and their shared helpers
src/pieces.js      polyomino generation for Sprawl
src/theme.js       the entire colour scheme, in one place
src/board.js       grid, placement, connectivity, removal, stacking, scoring
src/art.js         procedural tile + landmark drawing (no assets)
src/light.js       where the light comes from — one sun for the whole board
src/shape.js       area silhouettes — the corner-to-corner rule that makes tiles match
src/sprites.js     tile sprite cache, so the art is drawn once and then blitted
src/wind.js        Girando's weather: one gust, and everything it moved
src/game.js        the host: turn flow, deck, players, modifiers
src/modes/         one file per mode, behind a small set of hooks
src/ai.js          the computer player — one class, one action at a time
src/fx.js          transient effects: floating scores, flashes, rings
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

That one primitive is what lets tiles be **lifted** (Girando), **covered**
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

Two more are worth writing if your mode keeps score its own way:
`botPlaceBonus(cells, player)` and `botMoveValue(pawn, dest)` return points on
the same scale as everything else, and are the only thing standing between a
computer player and a mode whose scoring it can't see. Both default to zero, so
skipping them costs you a bot that plays the placement game and ignores your
banners.

`cellOverlay(cell)` is the other one worth knowing about: it's how a mode paints
per-cell state without touching the renderer — a banner, a height, cloud, or
whether that ground can still trace a path home.

### Testing

Eleven modes is more than you can click through, and a change in `board.js`
breaks the one you weren't looking at.

```bash
node tools/harness.mjs              # every mode + modifier, headless
node tools/harness.mjs marches 200  # one mode, 200 seeded games
node tools/smoke.mjs                # each mode booted in a real browser
node tools/smoke.mjs --shots        # …and screenshotted to tools/shots/
node tools/stamp.mjs -m "what's new"  # bump the build stamp before pushing
```

The harness plays random legal moves to completion and fails on anything that
throws, hangs or gets stuck with no legal action. It also prints turn counts and
score spreads, which is the cheap way to notice that a mode is degenerate before
you sit down to play it. The smoke test covers the half that only exists in a
browser: that each mode renders, builds its panel and survives being clicked.

Then it does both again with the computer player driving every seat, and plays
it against random legal play in Classic — because "it never hangs" and "it is
any good" are different claims, and the second one only means anything against
something. A bot that can't beat random play is broken rather than gentle. The
browser test has its own version of the question: that a bot takes its turns off
the render loop unprompted, and that the action buttons go dead while it does.

Input and motion only exist in a browser, so they're checked there too. The
input block drives real pointer events rather than calling the game — a tap
places, a drag pans, a spread zooms in and a pinch zooms out — and its
load-bearing assertions are the negative ones: neither a drag nor a pinch may
leave a tile behind, because a gesture read as a tap is the bug you'd ship.
The motion block asks each effect to happen in the one mode where it can: a
closure puts a number and a flash on the board and bumps the panel row, the
tide takes a tile under, The Marches lights up a region as it counts it,
Girando's wind actually shoves the board, and the endgame pays its features out
over seconds rather than in a single frame.

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

### How the board is drawn

The board is lit by a single sun, fixed in world space, low in the north-west.
Everything that stands up is drawn as an object with a face toward it and a
face away — a curtain wall with a shaded foot and a lit walkway, a hipped roof
whose four pitches each take their colour from how squarely they face the sun,
a tower, a tree. Roads and rivers and water get no lighting at all, because
they don't stand up.

An earlier pass tried to fake height by shading the *boundary* of flat regions.
That was the wrong model: a city is not a raised slab of ground, it's walls and
roofs, and shading its outline just drew a bright line along every seam.

#### Areas have to line up

Cities, forests, mountains and lakes cover some subset of a tile's four sides
and must match whatever is on the other side of every seam. `src/shape.js`
builds that outline, and there is exactly one rule:

> **An area covers every side it reaches, corner to corner.**

Because edge matching guarantees a city edge only ever meets another city edge,
and both tiles cover that edge completely, the two halves are continuous along
the whole seam with nothing left over at either end. The shape is a pure
function of the tile's own sides — no neighbour lookup, no negotiation between
tiles, nothing to keep in sync.

Corners take care of themselves. A tile corner is a single point: an area
reaching two adjacent sides fills it, and one reaching a single side comes to
that point and turns. The four tiles around a vertex already agree about which
of the four edges leaving it are city, so their outlines meet without anyone
having to check.

It took two wrong turns to get here, both worth recording. The original art had
four hand-drawn shapes that disagreed about where they met an edge — a cap city
crossed corner to corner while a band city only crossed `0.14→0.86` — so a band
next to a cap left a sliver of city facing a sliver of field at both ends of
the seam. The fix after that pulled every shape back from any corner it didn't
wrap: the shapes then agreed with each other, but every seam still had the same
awkward stub, and it cost a per-tile corner mask computed from the neighbours.
Running corner to corner is simpler *and* correct, and deleted that machinery
outright.

One more rule: where an outline leaves a tile edge it leaves **perpendicular**
to it. Two cap cities stacked one above the other then read as a single oval
rather than two domes touching. A gap of exactly one skipped side is the
awkward case — a plain curve with perpendicular tangents would lie flat along
the edge and swallow the tile — so it routes through a waypoint pulled in off
the middle of that edge, which is what carves the grass wedge on a
city-across tile: widest in the middle, tapering to nothing at the corners.

#### Walls only exist where the city ends

Each silhouette exposes a `rim`: the part of its outline that is a real
boundary rather than a tile edge. The curtain wall follows the rim, so a city
continuing into the next tile has no wall at the seam and a block of city is
one town behind one wall. A feature covering all four sides of a fully wrapped
tile has no rim at all — correct, since it's the middle of something bigger.

Bastions sit at the middle of each stretch of rim, always well inside a tile: a
tower on a seam would have to be agreed with the neighbour, and one at a corner
would come out as two opposite quarter-circles whenever only two of the four
tiles there had a wall.

Tile art depends on nothing but type, rotation and terrain, so there is a
finite set of pictures the game can ever draw: `src/sprites.js` renders each
once and blits it thereafter. A full board draws in 0.33 ms/frame, against
1.29 ms for the original much simpler art, because the old renderer re-ran
every vector path every frame. Past 512px a tile falls back to running the
paths directly.

Two smaller things follow from the same rule. Tiles have no outline drawn round
them, because that would put the grid straight back over the middle of a merged
city. And the field hatch is *crossed* rather than a single diagonal, so that
it looks the same after the quarter turn that places the tile.

### Sound
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

Adding forests, mountains, lakes and rivers was the test of that: each is a new
feature type and each cost one line in a table plus one drawing function,
because they all inherit edge matching, merging and the completion counter for
free. Fields are the only thing that doesn't fit, and it's because they need
*half*-edges, not because they're a new type.

**Prompts for the auto-resolved choices.** Three rules currently take the
obvious option because there's nowhere to ask: Marches auto-spends muster chits
to win a fight, the builder has no separate figure, and only the active player
is offered a wagon walk. Each is one dialog away from being the real rule, and
in Marches's case the bluff *is* the mechanic.

**A computer player that looks ahead.** The one in `src/ai.js` searches a
single move and evaluates the position honestly, which is enough to beat random
play in every mode and to give you a game in Classic. What it can't do is play
around a tile it hasn't drawn, or notice that the tile it wants is the one it's
about to hand you. Depth needs a model of the deck, which the engine could give
it — the remaining pool is `game.deck` — but that's a real search, not an
evening. It also can't see a *severing* move in The Marches, the sharpest thing
in that mode, because pricing one means running the supply trace per candidate.

Also absent: networked play, and persistence beyond Descent's unlocks.
