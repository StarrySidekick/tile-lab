# Modes to prototype

Tile Lab is a place to find out which tile mechanic is worth building a whole
game around. This file is the queue: twelve modes, each described in terms of
**what it changes mechanically**, what it costs to build against the engine as
it stands, and — most importantly — **what question it answers**. A prototype
that doesn't answer a question isn't worth building.

Six of these are yours. Six are mine. At the bottom there's a list of
*modifiers* — mechanics that bolt onto any mode — plus the shared engine work
and a recommended build order.

---

## What the engine already gives you for free

Worth stating plainly, because it decides which of these are cheap and which
are expensive:

- **Edge matching is generic.** `Board.canPlace` compares edge letters. Caves
  and city interiors already reuse it with `r`/`f` meaning *passage*/*rock*
  instead of *road*/*field*. Any new terrain vocabulary is free.
- **Completion is one counter.** A component tracks `open` edge-slots; zero
  means closed. Identical for a 2-tile road and a 40-tile city. Any new
  feature type that spans tiles inherits this.
- **Interiors are a reusable machine.** `Interior` is a whole second board with
  its own pool, entrance and exit, on the same place-then-move loop. Dungeons,
  ships, towers, arenas — all of it is a tile list plus a backdrop.
- **A tile is data.** One line in `tiles.js` gets you art, meeple anchors, edge
  matching and scoring.

And the three things it *can't* do yet, which most of the list below depends
on:

| Missing | Blocks |
|---|---|
| Removing a tile (union-find is append-only) | Cloud kingdom, stacking, tideline |
| Fields as real features (half-edge connectivity) | Wargame area control, farmers |
| Multi-cell footprints (`place` assumes 1×1) | Polyomino mode |

See [Shared engine work](#shared-engine-work) for how each is actually done.

---

# Your six

## 1. The Marches — war, battle, area control

**Question it answers:** is the board more interesting as a *contested surface*
than as a scoring one?

**The hook.** Every tile you lay is both terrain and a claim. The map is the
war — you win by cutting people off from their own territory, not by having
the biggest army.

**Core loop.** *Muster → Place → March → Resolve.* Two keeps start at opposite
ends (the board grows from two seeds instead of one, which alone changes the
whole geometry — everything meets in the middle). Placing a tile adjacent to
your own units plants your banner on it. Then you move one unit; moving into
an enemy tile is a battle.

**Battle.** Start deterministic: strength = units in the stack + terrain
(city +2, hill +1, forest +1 to defender, road 0), ties go to the defender.
No dice at first — the drama should come from the placement layer, and dice
would mask whether it does. Then add **muster chits**, a small hidden reserve
you can spend to win a fight, so battles become bluffs. The loser retreats
along a road; no road out means destroyed. *That's the rule that makes
road-building strategic in a way Classic never does.*

**Area control, and the good part.** At end of each round, score contiguous
same-banner regions: size, doubled if the region contains a city landmark.
But a banner tile with no path of banner tiles back to your keep is **cut
off** and scores nothing. So the sharpest move in the game is placing a tile
that *severs* rather than one that grows — a field tile dropped to break a
road, a city wall laid across a corridor. Connectivity is already the thing
this engine is best at.

**New tiles.** Fords and bridges (edges that connect only for movement),
hills, mountain passes with genuinely impassable edges, forts, watch-fires.
This is the mode that needs the **movement graph to differ from the placement
graph** — a mountain edge matches for placement but blocks marching.

**Engine work.** Banners (`cell.owner`), unit stacks (generalise pawns), a
flood fill over `cells` for regions (no union-find needed — banners change,
components would have to split), battle resolution, per-round scoring, and
multi-seed starts. Medium-large; regions are the cheap half, units the
expensive half.

**Risk.** Two-player with a fixed round count first. Three-player area control
kingmakes badly, and you'd blame the mechanic instead of the count.

---

## 2. Cirrus — the cloud kingdom, where tiles can be lifted

**Question it answers:** is a small board you keep *editing* better than a big
one you keep *growing*?

**The hook.** ~40 tiles, a hand of three, and a board that never settles.
The main verb isn't placing, it's **lifting**.

**Core loop.** Each turn, either play a tile from your hand, or **lift one
already-placed tile and re-place it** anywhere legal, at any rotation. That's
it. The whole game is in what you're allowed to lift.

**The constraints that make it a game and not a fidget:**

- You can't lift an **anchored** tile — one with a citizen on it, one that's
  part of a completed feature, or one with something built on top.
- Lifting must leave the board **connected**. No orphaned islands. You feel
  this constantly; it's the best single rule in the mode.
- One lift per turn.

**Crystallisation.** Closing a feature turns its tiles to permanent land —
they're anchored forever and they score. Everything not yet crystallised is
still cloud.

**Drift.** At the end of each round, any tile touching fewer than two
neighbours evaporates. Cloud dissipates. Build compactly or lose the edges.
This is what stops the board from being a stable puzzle you solve at leisure,
and it's why the deck can be small — the board is constantly recycling.

So the arc is: a churning, rearrangeable cloudscape that you're racing to
convert into solid kingdom before it blows away.

**Engine work.** `Board.remove()` (see below), a connectivity check on
removal, a hand of tiles instead of a single draw, an `anchored` flag, and an
end-of-round drift pass. The removal primitive is the expensive bit and three
other modes want it.

**Risk.** Analysis paralysis — a rearrangeable board with a hand of options is
a big decision space. Mitigations in order of preference: limit lifts to tiles
*you* placed; then a turn timer; then a hand of two.

---

## 3. Sprawl — polyomino tiles

**Question it answers:** does the board get more interesting when the *holes*
matter?

**The hook.** Pieces are 2–4 cells in tetromino shapes. Edge matching still
applies on every external edge, so a big piece has to satisfy several
neighbours at once — and once you've made a single-cell gap, almost nothing
fits in it.

That's the whole reason to build this: **denial becomes the primary strategy.**
In Classic, you never really block anyone. Here, you deliberately leave holes
where an opponent's city wanted to grow.

**The pressure valve.** A small supply of 1×1 filler tiles (say four per
player) that plug any hole regardless of matching. Scarce, so holes are
negotiable rather than permanent — and spending one is a real cost.

**Scoring twist.** Score **enclosed empty space**: seal a hole completely and
it becomes a courtyard/lake worth points to whoever closed it. That rewards
shape play directly instead of hoping it emerges.

**Engine work.** Lighter than it looks. A piece is
`{cells: [{dx, dy, typeId, rot}]}`; legality is "every cell empty, every
external edge matches, at least one contact"; placement lays each cell in
order and the union-find merges internal seams by itself. Rotation rotates the
shape and each cell. The real work is the renderer (multi-cell ghost) and
hit-testing against an origin cell. Call it ~150 lines and no changes to
`board.js` at all.

**Also needed:** a validator in `atlas.html` that shouts when a piece's
internal seams don't match each other. You will get this wrong constantly
while authoring pieces.

**Risk.** Legality dries up fast and you start discarding a lot of pieces.
Fix: allow **breaking a piece** — play one cell of it and discard the rest.
Costly, always available, keeps the game moving.

---

## 4. Descent — roguelike

**Question it answers:** does the exploration loop hold up under real pressure
and a real fail state? (Right now Adventure is upside-only — nothing on the
map can hurt you.)

**The hook.** Adventure, but short, dangerous, and losable — and **the
upgrade currency is the tile pool itself.**

**Run structure.** 3–5 stages. Each stage is a small board (25–35 tiles) with
an exit tile shuffled into the back half of the deck. Reach the exit before
the deck runs out or the run ends. Total run: fifteen minutes.

**Danger.** HP, plus encounters resolved against party size and gear —
the README already names encounters as the highest-value missing piece and
this is the mode that needs them most. A threat deck parallel to the tile
deck: bandits on roads, wolves in fields, worse things deep in caves.

**Escalation.** Each stage reweights the tile pool: fewer campsites and
wayshrines, more ruins and cave mouths, and eventually tiles that only exist
in stage 4. **The deck is the difficulty curve** — a board game can't tune
that smoothly mid-session and we can.

**Between stages: pick one of three boons.**

1. A **stat** (max HP, carry, movement)
2. A **relic** that changes a rule — "roads let you move 3", "monasteries
   heal", "discard a tile to redraw", "your first encounter each stage is
   skipped"
3. **New tiles added to your pool** — a wayshrine, a merchant, a second
   village

That third one is the idea worth having: you are literally deckbuilding the
world. What the map *can contain* is the thing you upgrade.

**Meta-progression.** Unlock tile groups permanently across runs — the lab's
existing group toggles become the unlock tree, which is a very neat fit with
what's already there.

**Engine work.** Sequential stages sharing a run state, HP and encounters, a
threat deck, a boon screen, weighted deck construction (`buildDeck` takes
groups; extend it to take weights), `localStorage` for meta-progression.

**Risk.** Balance. Build a headless auto-play harness early — seeded runs,
random-legal play, 500 runs, look at the death-stage histogram. Cheap and it
saves weeks.

---

## 5. The Chronicle — story mode, D&D-ish, ad-lib

**Question it answers:** are the tiles good *prompts*? Is the map worth
reading back afterwards?

**The hook.** The game supplies nouns and structure; humans supply meaning.
The artifact you take away isn't a score, it's a log.

**Two sub-modes, same board:**

**Solo/co-op journalling.** Every placed tile and landmark yields a prompt
built from slot tables — *"You come to a {ruin} in {weather}. It is held by
{faction}, who want {want} and fear {fear}."* You write a line into the
chronicle. Ad-lib style: instead of a blank box, you're offered **three words
per slot and pick one**, so there's authored constraint rather than
blank-page paralysis.

**GM screen.** The map is a shared canvas. The GM gets free placement (already
in the sandbox), named markers, fog they can lift tile by tile, and the
ability to rename any site. Everything else in the lab already supports this;
it's mostly UI.

**What makes it a game rather than a toy:**

- **Oracle dice** — yes/no/and/but, rolled when the table doesn't know
- **Clocks** — 4- or 6-segment threads that tick when certain tiles come up;
  when one fills, something happens and the scene ends
- **Bonds** with NPCs recruited at villages — mechanical weight to who's with
  you

**Names are load-bearing.** A seeded name generator per site (README roadmap
#8) is what turns `(3, -2)` into Ashfen Mill. Without names none of this
lands. With names, the log reads like a travelogue.

**Export the chronicle as markdown.** The output being shareable *is* the
point of the mode.

**Engine work.** Almost none on the board. Prompt tables (data), a chronicle
log with editable entries, name generation, a clocks widget, markdown export.
This is the cheapest mode on the list by engine cost and the most expensive by
content — which makes it a good one to slot in whenever board work is blocked.

**Risk.** There's no win condition, so "is it good" can't be measured by
score. Judge it on: do people keep taking turns, and do they read the log at
the end.

---

## 6. Strata — building on top of tiles

**Question it answers:** what does a Z axis buy? Replacement, or elevation?

**The hook.** You may place onto an occupied cell. The top tile is the truth
for edges and matching; what's underneath still matters for scoring.

**The cover rule is the experiment.** Four candidates, and the lab exists to
try all four:

- **a. Improve** — the new tile must carry at least as much of the same
  feature type. You build city over field, never the reverse.
- **b. Cost** — covering costs a resource. Makes it an economy sink.
- **c. Respect** — you can't cover a claimed tile or one in a closed feature.
- **d. Ceiling** — max height 3.

**What buried tiles do.** Foundations still pay: at endgame a buried tile
scores half to whoever laid it. So building over an opponent doesn't erase
them, it *freezes* them — much better feel than pure destruction, and it keeps
the loser of a stack fight in the game.

**The version I'd actually chase: height as elevation.** A pawn on height 2
moves and sees further; water flows downhill; a keep on a stack dominates the
tiles below it. Then a closed feature scores × its average height, and the
mode becomes "build a skyline" rather than "erase your opponent". That's a
genuinely different game from everything else on this list, and it's the one
stacking is uniquely good at.

**Engine work.** `cell.under` as a stack; edges read from the top; connectivity
via rebuild (same primitive as Cirrus). Rendering is the real risk — solve it
with a small vertical offset per level plus a drop shadow and a lit top edge.
Pseudo-isometric, cheap, and it reads instantly.

**Risk.** Board legibility. If you can't tell a height-3 stack from a height-1
at a glance, the mode is dead regardless of the rules. Prototype the *art*
first, before the rules.

---

# My six

## 7. Tideline — the board changes without anyone placing

**Question:** does every mode here just need a clock?

A front advances each round — flood, fire, blight — eating tiles from one edge
inward. Everyone builds ahead of it. Works competitively (last kingdom
standing, or most land banked before it's swallowed) or co-operatively (hold
the line: certain tile configurations dam the water).

Nothing on this list has time pressure except Descent, and the absence shows
in playtests as "pleasant but slack". This is the cheapest fix, it reuses the
removal primitive, and it can be **switched on over any other mode** as a
difficulty setting.

## 8. Market — a drafting layer (best ratio on the list)

**Question:** how much of the game is the randomness of the draw?

Instead of drawing one tile blind, a face-up row of five with escalating cost.
Take the cheapest for free, pay influence for the ones further along. Refill
from the deck.

~60 lines. Works with every mode already built and every mode on this list.
Converts the deck from luck into an economy, and gives you a place to spend
gold — which the README correctly notes has no sink. **If you only build one
thing off this document, build this.**

## 9. Duel — 24 tiles, a 5×5 board, no randomness

**Question:** is the act of placing a tile fun with *nothing else* attached?

Both players see the same open pool and draft from it. Bounded board, so every
placement is denial and tempo. No meeples, no pawns, no gold. Five minutes a
game.

This is the diagnostic mode. Every other design on this list assumes the core
placement act carries a game, and none of them can tell you whether it's true,
because they're all wearing so much scaffolding. This one can — and it's also
the best regression testbed you'll have for rule changes.

## 10. Hidden agendas & fog — imperfect information

**Question:** does anything change when players can't read each other's plans?

Two secret objectives per player, drawn at the start, scored at the end: *"a
road of seven or more"*, *"two cities sharing an edge"*, *"a monastery with no
road within two tiles"*. Suddenly every placement is also a tell, and blocking
requires guessing.

Optional fog on top: tiles beyond N of your pawns render as silhouettes. Turns
Expedition into a genuinely different game for near-zero engine cost.

## 11. Tesserae — daily puzzle

**Question:** is there a version of this that someone opens every morning?

Fixed seed, fixed 30-tile deck, solo, a par score, one attempt. Same puzzle
for everyone that day. Seeds already exist, so this is mostly UI and a par
calculation.

Two reasons beyond the obvious: it gives the lab a reason to be revisited
rather than just demoed, and *"this seed must produce this board forever"* is
the best regression test the engine will ever have.

## 12. Two-faced tiles — every tile has a reverse

**Question:** is a tile a noun, or a state?

Each tile has a back — usually a ruined, wilder, or drowned version of its
front. Flipping a placed tile is an action. A city becomes rubble; a road
becomes a river; a monastery becomes a barrow.

Small engine change (`type.back`, and a flip that goes through the same
rebuild path as removal), large combinatorial payoff, and it composes with
almost everything: Strata's cover rule, Cirrus's drift, Tideline's flood front,
Descent's escalation. Worth prototyping *after* removal exists, because it's
nearly free at that point.

---

# Modifiers — bolt onto any mode

Cheap, orthogonal, and each one changes several modes at once. These are
where the leverage is.

| Modifier | What it does | Cost |
|---|---|---|
| **Drafting market** (#8) | Removes draw luck, adds an economy | Small |
| **Hidden objectives** (#10) | Imperfect information, bluffing | Small |
| **Fog** | Exploration becomes real | Small |
| **Oracle dice** | Uncertainty the table resolves narratively | Tiny |
| **Asymmetric powers** | Each player breaks one rule ("your roads score double", "you may rotate a placed tile") | Small |
| **Turn timer** | Kills analysis paralysis, changes the whole feel | Tiny |
| **Co-op vs the deck** | Deck plays events against the table | Medium |
| **Hand of tiles** | Choice instead of fate; needed by Cirrus anyway | Small |

---

# Shared engine work

Three primitives unlock most of the list. Doing them in this order means each
mode gets cheaper than the last.

### 1. A mutable board — `Board.remove()` and `Board.rebuild()`

Union-find can't split, so removal can't be incremental. It doesn't need to
be: keep `cells` as the source of truth and make connectivity **recomputable**.

```js
rebuild() {
  this.parent.clear(); this.data.clear();
  for (const cell of this.order) this.link(cell);   // replay placement
}
```

O(n) per removal with n ≈ 100. Utterly fine at this scale, and it's the same
call that supports **lifting** (Cirrus), **covering** (Strata), **flipping**
(#12) and **flooding** (Tideline). One caveat: `scored` flags and claimed
marks live on components, so they need to live on cells and be re-applied
during replay. That's the only fiddly part.

### 2. Fields as real features

Area control (#1) and the long-promised farmers both need fields modelled as
their own segments. The clean version: features get **half-edges** — eight
slots (N-left, N-right, E-top, …) instead of four sides. A road bend has two
distinct field segments, which is exactly what a four-side model can't express.
`featAt` generalises to half-edges; the union-find and the `open` counter don't
change at all. Declared in tile data alongside the existing features.

This is a change to the tile *format*, not an addition — so it wants doing
before the tile pool grows much further.

### 3. Pieces — multi-cell footprints

`Piece = {cells: [{dx, dy, typeId, rot}]}` plus `canPlacePiece` / `placePiece`
that lay the cells in order. `board.js` needs nothing new; the work is in the
renderer and hit-testing. Needed only by Sprawl (#3), but cheap and isolated.

### And one refactor: a mode registry

`Game` already branches on `this.mode` in eight places, and there are three
modes. At twelve it becomes unreadable. Before mode four goes in, move each
mode to `src/modes/<name>.js` exporting a spec:

```js
{ id, name, hint, groups, players, setup, onPlace, onEndTurn, actions, panel }
```

`game.js` becomes the host that runs the phase machine and calls hooks. This
is what keeps the lab a lab — a new mode should be *one new file*, and right
now it's edits in five.

---

# Recommended build order

Ordered by *question answered per unit of work*, not by how exciting each one
is.

| # | Build | Why here |
|---|---|---|
| 0 | **Mode registry** | Do it while there are only three modes to move |
| 1 | **Market (#8)** | ~60 lines, improves everything already built |
| 2 | **Duel (#9)** | Tells you if the core act is fun before you build more on top of it |
| 3 | **`Board.remove()`** | Unlocks Cirrus, Strata, Tideline, two-faced |
| 4 | **Cirrus (#2)** | Smallest complete new mode; proves removal |
| 5 | **Sprawl (#3)** | Self-contained, no removal needed, biggest visual change |
| 6 | **Strata (#6)** | Art prototype first, rules second |
| 7 | **Encounters, then Descent (#4)** | Encounters are the missing piece; the roguelike is where they pay off. Most likely to *be* the full game |
| 8 | **Fields, then The Marches (#1)** | Biggest mode, and it wants fields underneath it |
| 9 | **The Chronicle (#5)** | Content-heavy, engine-light — slot it in whenever board work is blocked |

Tideline (#7), hidden agendas (#10), Tesserae (#11) and two-faced tiles (#12)
are small enough to drop in wherever they fit.

**The two I'd bet on for the full game:** Descent, because roguelike structure
solves the "when does it end and why do I replay it" problem that every one of
these modes otherwise has — and Strata-as-elevation, because it's the only
idea here that isn't already a board game.
