# The modes

Tilemaker's Workshop is a place to find out which tile mechanic is worth building a whole
game around. This file is the reasoning behind each one: **what it changes
mechanically**, what it cost against the engine, and — most importantly —
**what question it answers**. A prototype that doesn't answer a question isn't
worth building.

**All twelve are built**, plus a thirteenth — World — and a mechanics menu.
Eight became modes; four became mechanics, because a rule that works on every
mode is worth more than one that works on its own. Each section below keeps its
original design, with a note at the top recording what actually shipped and
where the build differed from the plan — the places they diverge are the
interesting part.

| | Shipped as | Question it answers |
|---|---|---|
| 1. The Marches | mode | Is the board better as a contested surface than a scoring one? |
| 2. Cirrus → **Girando** | mode | Is a small board you keep *editing* better than a big one you keep *growing*? — and then: is it better still if the board edits *itself*? |
| 3. Sprawl | mode | Does the board get more interesting when the *holes* matter? |
| 4. Descent | mode | Does exploration hold up with a real fail state? |
| 5. The Chronicle | mode | Are the tiles good *prompts*? |
| 6. Strata | mode | What does a Z axis buy — replacement, or elevation? |
| 7. Tideline | modifier `Rising tide` | Does every mode here just need a clock? |
| 8. Market | modifier `Drafting market` | How much of the game is the randomness of the draw? |
| 9. Duel | mode | Is placing a tile fun with *nothing else* attached? |
| 10. Agendas & fog | modifiers | Does anything change when players can't read each other? |
| 11. Tesserae | mode | Is there a version someone opens every morning? |
| 12. Two-faced | mechanic | Is a tile a noun, or a state? |
| 13. World | mode + 4 tile families | What does the countryside still not have? |

Play them and the questions answer themselves. What's at the bottom is what the
engine still can't do.

---

## What the engine gave us for free

Worth stating plainly, because it decided which of these were cheap and which
were expensive:

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

And the three things it couldn't do, which most of the list below depended on:

| Missing | Blocked | Status |
|---|---|---|
| Removing a tile (union-find is append-only) | Cloud kingdom, stacking, tideline, two-faced | **Done** — `Board.rebuild()` |
| Multi-cell footprints (`place` assumed 1×1) | Polyomino mode | **Done** — `canPlacePiece` / `placePiece` |
| Fields as real features (half-edge connectivity) | Wargame area control, farmers | **Not done** — Marches uses banners instead |

See [Shared engine work](#shared-engine-work) for how each was actually done.

---

# Your six

## 1. The Marches — war, battle, area control

> **Built** — `src/modes/marches.js`. Area control ended up being done by *banner* flood-fill rather than by field, which needs no tile-format change and gets the supply rule working today; fields would make it finer-grained. The campaign is capped at twelve rounds and territory is counted every fourth, because continuous income compounded into meaningless four-figure scores. Muster chits are auto-spent when they'd win a fight — against a human, choosing to spend and bluffing about it is the interesting half, and that needs a prompt. Cut-off ground is now drained of colour on the board, which the mode badly needed: supply is the rule the whole design turns on, and until the board said which of your tiles were paying you it was something you had to work out by eye every round.

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

> **Built, played, and rebuilt as GIRANDO** — `src/modes/girando.js`, with the weather engine in `src/wind.js`. The original is below, unchanged, because the reason it was replaced is the interesting part.
>
> Cirrus worked and it answered its question: a board you keep editing *is* better than one you only grow. But the editing was all yours. Every change to the board was a player deciding to make it, which made the mode a puzzle with a fidget attached rather than a place with weather in it. The drift was the only thing the board did on its own, and once you learned to keep everything at degree 2 it stopped happening.
>
> **Girando moves the verb from the player to the sky.** You place and claim as in Carcassonne — meeples are back, majority scoring is back — and the churn comes from the tiles themselves:
>
> - **Zephyrs** blow their whole lane one square downwind when played. Tiles that land touching nothing (corners count) fall out of the sky and go back in the deck. A zephyr caught by the wind fires in its turn, so a line of them is a chain.
> - **Temples** replace monasteries: nobody claims them, they score nothing, and when the country closes around one it exhales — *every* lane on the board moves the way it faces. Shoving one with a gust pays 2.
> - **Windvanes** and **vestibules** have four ways in and only two of them joined, and the wind picks which two. Every edge matches so they always fit; what changes is what runs through them, which means what's finished can become unfinished.
> - **Skywalls** are the only thing that stops any of it. Crystallised tiles don't move either, so everything you finish becomes a windbreak and the board grows a skeleton it can't lose.
> - **Flutitantes** are what's left of lifting: terrain on a hull, the only tiles you may move yourself, and the only ones that survive being stranded in open sky.
> - The base set's **3-way junctions are swapped for open ones** that carry a road through instead of ending it. Fewer closures, fewer crystals, more weather.
>
> Three things the rebuild forced on the engine, all of which are improvements everywhere. `Board.link` now refuses to join a seam whose edges disagree — placement can't produce one, but wind can shove a road into a city wall, and without the guard the union-find merged them. `Board.shift` moves a tile keeping its follower, its owner and its place in the replay order. And the host now asks the mode `anythingLeft()` instead of reading `market`, which was pointing at the *previous* player's hand and could end a hand-dealt game while you were holding three playable tiles.
>
> **Second pass.** Zephyrs doubled to twelve and spread across every kind of ground, so the wind isn't something that only ever arrives on empty fields. A gust now runs the full length of its lane — crystallised ground doesn't move and doesn't stop it either — and a skywall only shelters its lee when it's standing *across* the wind, which turns a wall from a fact into a decision about which way the country may be shoved. Cloisters are gone entirely; every one is a temple. A city pays 1 a tile like a road. The hand of three became a single drawn tile.
>
> Two new pieces, both of which cut against the mode's own grain in useful ways. The **Abbazia** takes any edge and caps whatever it touches, so it's the one reliable way to *finish* anything — and it's blowable, so a feature you already banked can come un-capped, un-finish, and be scored again. That needed `Board.unmark`, the first thing in the engine that can make a scored feature unscored. The **flying machine** sends a follower down a lane onto any feature out there, contested or not, riding any zephyr it crosses; a zephyr pointing the wrong way is a wall for fliers.
>
> The deck is seventy-two tiles, a full Carcassonne set's worth, and the clock that stops a game is counted in TILES LAID rather than rounds played. It has to be: tiles blown off the board come back, so "until the deck runs out" isn't a promise the mode can keep, and a round cap means something different at two players than at four. Ninety-six placements is the backstop; a real game lands around seventy-eight.
>
> **What it still needed.** Twenty bot games at the full length: median score 9, mean 27.5, top 183. That gap was the finding. Closures were rare — the weather worked and the economy didn't — but *rattling* wasn't: a temple paid 2 every time a gust shoved it, there were half a dozen temples on a full board, and thirty-odd gusts a game. Paying only once per temple per turn took the worst case from 625 to 183, and the rattle economy still dwarfed the closure economy in the games where the wind got going.
>
> **Third pass: three economies instead of one.** Rattling is gone. In its place, three ways to be paid that can't all be chased at once.
>
> - **The temple is claimable again, and pays by the tile.** 1 to its keeper for every tile a player *lays* in the eight squares around it, 2 for every tile the wind *blows* in — and it cannot be moved, so a keeper is the one figure on the board the weather can't take. Capped at one payment per temple per tile per turn, which is what kills the oscillation exploit: without it, two zephyrs pointed at each other walk the same tile in and out of the same parish all turn.
> - **Followers are blown like tiles.** They no longer come off the board when their road is shoved; they travel the lane's distance and take up whatever they land in, including nothing at all, in which case they lie on the tile holding nothing until the country under them changes. Only open sky sends one home. This is the rule that made the mode feel like weather rather than like a board with weather on it — your position moves, not just your terrain.
> - **The sfera counts the islands.** Two half-spheres joined lock forever and the sky looks down *once*: the majority on any piece of country that has broken off the mainland takes a point per tile. It resolves at the end of the turn the sphere closed on, after everything else that turn did, which is the whole tactic — blow a rival's figure off the rock, or fly one out to it, *before* the count.
>
> Plus: gusts **stack** to three squares when they run over zephyrs pointing their way, four more zephyrs (sixteen now) in place of the mass weather event, cities back to 2 a tile, five extra city end caps, and no four-sided city.
>
> **Scarcity is what lets the count pay full price, and that took a wrong turn to find.** Built first as a standing rule — once any sphere closed, islands paid at the end of *every* round thereafter — it measured at 0 to 492 island points a game across twenty games. Whoever's follower happened to be standing on the big piece when it broke off collected its size thirty times over and nothing else in the game mattered; the brake it needed (a tile pays a given player once) worked, but it was a brake bolted onto an annuity. Tying the count to the sphere instead is the better shape of the same idea and needs no brake at all: twelve sfera makes six spheres, so six counts, and a thing that happens six times in a game can afford to be worth a lot. Around 3.7 spheres actually close in a bot game, and each count pays about 6 points to somebody.
>
> **Where the third pass landed.** Twenty bot games, per game: temple 28.1, island 20.6, cities 11.8, roads 0.6, skyholds 0.5 — 62 points across two players, scores 0–105, three streams that can't all be chased at once. Closures up from 0.65 to 2.25 a game, and a sharp bot beating random play 37–3 in forty.
>
> **Fourth pass: the skeleton comes out.** Three changes, and the third is the one that matters.
>
> - **A chain reaction was throwing the board away, and it wasn't emergent, it was a missing rule.** Two zephyrs facing each other took turns firing: A shoved the lane north, which reached B, which fired south, which reached A, which fired north, ten times over until everything at both ends of the lane had sailed off into open sky. The fix says out loud what the stacking rule already implied — a gust is amplified by a zephyr blowing *its* way and by nothing else. One blowing across still fires, down its own lane, which is the chain reaction worth having. One blowing straight back does nothing; the two brace. And no zephyr blows twice in one storm, tracked against the cell rather than the square, because the wind moves zephyrs while the storm is still going. A cascade is now finite rather than merely capped.
> - **Four winds that blow more than one way.** A crosswind, a split wind, a trident and a compass rose — one of each — opening two, three and four lanes at once out of the same square. The mark carries a list of directions instead of one, so `storm()` takes a list of openers and the whole fan is a single weather event rather than four in a row.
> - **Nothing crystallises.** Closing a feature used to turn its tiles to permanent land, and that was load-bearing in the wrong direction: every closure grew the board a skeleton the wind couldn't touch, so a long game quietly stopped being weather. Now the rooted list is a temple and a joined pair of sfera, and that's all — the skywall moves too, so the shelter it casts is a thing that slides around. A city you scored can be pulled apart, and when it is, it's open country again worth finishing a second time.
>
> **What taking the skeleton out actually did.** The board shatters. Islands at the end of a game went from 3.3 to 7.7, and island income from 20.6 to 50.1 a game — over half the total, because a sphere closing now finds a sky in eight pieces rather than three. Tiles genuinely lost stayed flat at 5 a game, which is the interesting part: the wind isn't destroying more, it's *fragmenting* more. Per game now: island 50.1, temple 31.1, cities 12.1, skyholds 1.9, roads 0.6 — 96 across two players, scores 11–118, and a sharp bot beating random 36–4. Whether a permanently shattered sky is the mode or a step too far is a table question, not a harness one; the knob if it's too much is putting crystallisation back on skyholds alone, so finished *landmarks* root and finished ordinary country doesn't.

> **Fifth pass: the sky gets a floor, a fleet and a windmill.** The biggest single change is that the mode stopped pretending to be a countryside — the ground is drawn as open sky now, which alters no rule and fixes the fiction, because a tile blown off the edge of a green meadow is a nonsense and a tile blown off the edge of the sky is the whole mode.
>
> - **Two real bugs.** The sfera was scoring every island *except* the largest, so a sphere closed on the mainland — which is where you close nearly all of them — paid nothing at all and the mechanic looked broken. It now counts the island it is actually standing on. And zephyrs looked frozen because crystallisation was pinning any zephyr tile whose road or city had closed; a zephyr never crystallises now, on the principle that weather you can nail down has stopped being weather.
> - **Crystals are back, and asymmetric.** Finished features turn to permanent land again, but a crystallised CITY is solid all the way up — it stops a gust dead and shelters its lee, which is the job the skywall used to do — while a crystallised ROAD is flat ground the wind goes straight over. Cities are the walls you build; roads are the floor you build them on. Skywalls are gone, and so are skyholds, vestibules and flutitantes.
> - **Corners no longer hold a tile up**, and a tile that falls goes into the HAND of whoever set the wind off rather than back into the deck. That turns blowing the board apart from vandalism into a supply line, and gives the mode a face-up row again — your hand is the market picker, which is why it needed no new UI.
> - **The sky ship.** One per player, in their colour, moored to the outside of a piece of country and never into an internal hole. Every feature that finishes on that piece pays 2 more; the ship fits anywhere and does nothing to what it touches, which needed a third edge kind alongside the wildcard — `DOCK`, an edge that matches everything and neither joins nor caps. Once moored it is becalmed until a gust reaches it, so the ship wants to sit where the weather never goes and can only leave if the weather comes.
> - **The tower turbine**, built into a city wall, pays 1 to whoever holds that city for every gust that runs through it — the first thing in the mode that wants the weather to keep arriving. Its sails can't live in the tile sprite, because a sprite is one picture and these turn, so the sprite draws the tower and the hub and the renderer spins the sails on top.
> - **Straight roads are weathervanes now**: hit side-on, a road swings to lie along the wind. Three-way junctions went back to ending their roads, with a village on them. Four multi-way zephyrs, the Abbazia redrawn walled edge to edge so you can see that it caps, and no four-sided city anywhere in the pool.
>
> **And a finding that matters more than any of them.** Counting the sphere's own island is the rule as asked for, and it is now 74% of all the points in the game: 204 of 274 a game, because the sphere's island is usually the mainland and the mainland is forty-odd tiles. The rest — temple 41, city 15, ship 10, turbine 2, road 2 — is rounding next to it. The measurable consequence is that the mode stopped rewarding play: a sharp bot against random play went from **37–3 to 23–17**. It isn't that the bot got worse; it's that the game is now mostly decided by who happens to hold the majority on the mainland when a sphere closes, which is a thing you can barely steer. Every knob points the same way — count only country that has BROKEN OFF, or pay a fraction of a point per tile, or count the sphere's island only up to some size — and they're all one line.

> **Sixth pass, mostly a bug and a look.** The sky moved from the tiles to the SPACE between them — the backdrop is open air with slow parallaxed cloud behind it, and the tiles went back to being ordinary countryside. That's the right split: the gaps are what a tile falls into and what runs between islands, so they're the thing that should read as sky. Exactly one tile is still drawn as sky, the ship's mooring, because it's the one tile that fits against anything and joins nothing.
>
> **And the freeze.** Two computer players would lock the tab up. It wasn't the bots and it wasn't a loop — a follower the wind puts down on a tile with nothing claimable on it holds no feature, and the renderer looked up an anchor point for a feature index of `null`, threw, and killed the requestAnimationFrame chain. A dead chain is indistinguishable from a hung tab: the board stops, the bots stop, and nothing says why. It's fixed twice over — that follower is drawn in the middle of its tile inside a broken ring, which is also the first time the board has said out loud "this figure is holding nothing", and the frame is wrapped so any future render bug is a dropped frame and a console line rather than a freeze. Worth doing: a sandbox you iterate on this fast will throw in a draw call again.
>
> Turbines also kept turning after their city closed, which took writing the holder onto the tile at the moment of closing — closing hands the followers back, so by the time the mill wants paying there is nobody standing in the city to read a majority off.

> **Seventh pass: the count gets a flat rate, and the sky gets a chart.** Paying an island a point a tile was three quarters of every point in the game and had taken the mode's skill ceiling down with it — a sharp bot beat random 23–17, when it beat it 37–3 before islands existed. The fix is a FLAT THREE per island, every island counted rather than only the sphere's, and it works: island income fell from 204 a game to 54, the split is now island 54 / temple 42 / city 17 / ship 9, and the bot is back to **31–9**. Flat also changes what you play for — three points doesn't care how big a piece of country is, so a count rewards standing on several pieces of sky rather than parking on the biggest one.
>
> **The Palazzo** is the exception that gives the flat rate a shape: the tile the game starts on, same connections as any start tile and no more rooted than anything else, and whichever island it has ended up on counts 6. The seat of government is a thing the wind pushes around and everyone chases.
>
> **Catch and throw.** A tile the wind knocks loose already fell into the hand of whoever set the wind off; now catching one on your own turn buys you a second placement that turn, while the hole the wind just made is still open. Capped at once a turn — a caught zephyr would otherwise buy the placement that catches the next one, forever.
>
> **Flying machines cross open sky.** They used to stop at the first gap, which meant the one piece on the board built for reaching somewhere unreachable couldn't reach an island. Now the flight goes straight over open air and lands anywhere along its lane; it still needs a tile under it to catch a zephyr and turn, so gaps are crossed but not steered through.
>
> **The backdrop is a portolan.** A flat blue wash with a hairline grid read as a spreadsheet you could sail on; it's now a chart of the sky — a graticule with heavy meridians every fifth square, the rhumb network a portolan strikes from a ring of compass nodes, and a rose on the origin with the Latin winds named round it. All in world space, so it pans and zooms with the board and reads as the paper the kingdom is printed on.
>
> One lesson worth recording. Restructuring the renderer spliced out four methods including `drawCellOverlay`, and because the frame is now wrapped in a try/catch, the result was a board that silently drew one tile instead of a tab that froze — logged once to the console and then invisible. The net did its job and it also hid the bug for two screenshots. If a frame ever *keeps* throwing, read the console before you read the code.

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

> **Built** — `src/modes/sprawl.js`, with pieces generated by search (`src/pieces.js`) so seams are valid by construction. First version sorted shapes biggest-first before filling, and the search succeeded on a tetromino *every single time* — a mode where every piece is four cells is much duller than the one intended. Choosing uniformly across shapes fixed it: roughly 15% dominoes, 30% trominoes, 55% tetrominoes.

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

> **Built** — `src/modes/descent.js`. Four depths, HP, escalating decks, and the boon that adds tiles to the pool is in. Meta-progression writes to `localStorage`, guarded so the headless harness can still run it.

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

> **Built** — `src/modes/chronicle.js`. Names, clocks, oracle and markdown export all in. The prompt had to move to sit directly *above* the three endings — read the situation, then choose — which is a two-line change and makes the whole mode read properly.

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

> **Built** — `src/modes/strata.js`. Cost, respect and ceiling are all in, and height-as-multiplier is the version that shipped rather than height-as-replacement. Foundations pay at the end. The art check came first, as planned: a raised tile is drawn lifted with a drop shadow and a `▲n` badge, and you can read a stack at a glance.

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
via rebuild (same primitive as the cloud kingdom). Rendering is the real risk — solve it
with a small vertical offset per level plus a drop shadow and a lit top edge.
Pseudo-isometric, cheap, and it reads instantly.

**Risk.** Board legibility. If you can't tell a height-3 stack from a height-1
at a glance, the mode is dead regardless of the rules. Prototype the *art*
first, before the rules.

---

# My six

## 7. Tideline — the board changes without anyone placing

> **Built as a modifier**, not a mode — `Rising tide`, and it works on any of the eleven. It's implemented as a moving southern bound on the board, which is why nothing else needed a special case: a tile that could only go underwater is unplayable for the same reason a tile off the edge of Duel's 5×5 is, and the draw loop already discarded those.

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

> **Built as a modifier** — `Drafting market`, and it works everywhere. Duel's open pool and Girando's hand reuse the same row and the same picker, with the discard rule switched off.

**Question:** how much of the game is the randomness of the draw?

Instead of drawing one tile blind, a face-up row of five with escalating cost.
Take the cheapest for free, pay influence for the ones further along. Refill
from the deck.

~60 lines. Works with every mode already built and every mode on this list.
Converts the deck from luck into an economy, and gives you a place to spend
gold — which the README correctly notes has no sink. **If you only build one
thing off this document, build this.**

## 9. Duel — 24 tiles, a 5×5 board, no randomness

> **Built** — `src/modes/duel.js`.

**Question:** is the act of placing a tile fun with *nothing else* attached?

Both players see the same open pool and draft from it. Bounded board, so every
placement is denial and tempo. No meeples, no pawns, no gold. Five minutes a
game.

This is the diagnostic mode. Every other design on this list assumes the core
placement act carries a game, and none of them can tell you whether it's true,
because they're all wearing so much scaffolding. This one can — and it's also
the best regression testbed you'll have for rule changes.

## 10. Hidden agendas & fog — imperfect information

> **Built as two modifiers** — `Hidden agendas` (ten of them, in `src/modes/agendas.js`) and `Fog of war`. Fog is pure rendering, so it's the one modifier that takes effect without starting a new game.

**Question:** does anything change when players can't read each other's plans?

Two secret objectives per player, drawn at the start, scored at the end: *"a
road of seven or more"*, *"two cities sharing an edge"*, *"a monastery with no
road within two tiles"*. Suddenly every placement is also a tell, and blocking
requires guessing.

Optional fog on top: tiles beyond N of your pawns render as silhouettes. Turns
Expedition into a genuinely different game for near-zero engine cost.

## 11. Tesserae — daily puzzle

> **Built** — `src/modes/tesserae.js`. The seed comes from the UTC date, and the seed box hides itself so you can't accidentally play a different puzzle from everyone else.

**Question:** is there a version of this that someone opens every morning?

Fixed seed, fixed 30-tile deck, solo, a par score, one attempt. Same puzzle
for everyone that day. Seeds already exist, so this is mostly UI and a par
calculation.

Two reasons beyond the obvious: it gives the lab a reason to be revisited
rather than just demoed, and *"this seed must produce this board forever"* is
the best regression test the engine will ever have.

## 12. Two-faced tiles — every tile has a reverse

> **Built as a modifier** — `Two-faced tiles`, ten pairs in the `BACKS` table in `tiles.js`. Press `F` before placing. It came out nearly free once removal existed, exactly as predicted.

**Question:** is a tile a noun, or a state?

Each tile has a back — usually a ruined, wilder, or drowned version of its
front. Flipping a placed tile is an action. A city becomes rubble; a road
becomes a river; a monastery becomes a barrow.

Small engine change (`type.back`, and a flip that goes through the same
rebuild path as removal), large combinatorial payoff, and it composes with
almost everything: Strata's cover rule, the cloud kingdom's drift, Tideline's flood front,
Descent's escalation. Worth prototyping *after* removal exists, because it's
nearly free at that point.

---

# And one more

## 13. World — mountains, forests, lakes and rivers

> **Built** — `src/modes/world.js`, and all four families are tile groups you
> can switch on inside any other mode. Each new feature type cost one line in a
> table plus one drawing function, because they inherit edge matching, merging
> and the completion counter for free. That was the real test of the engine and
> it passed.

**Question it answers:** what is the countryside still missing, and does the
feature system stretch to hold it?

Four families, each picking a different fight with how Carcassonne scores:

**Mountains** pay the *instant* a range grows, scaling with size — a range of
five has paid 2+3+4+5 over its life. There's no completion and no claim, so a
mountain is the one thing on the board you cannot be denied, and joining two
ranges is worth more than extending either. It's the purest placement scoring
in the lab: no meeple economy at all.

**Forests** are cities with the tension taken out — 1 per tile, +1 per log, and
no complete/incomplete distinction whatsoever. A forest pays the same whether
it closes or the game ends around it. That makes them the *safe* claim against
cities' greedy one, and it reproduces the farmer trade-off honestly: a follower
parked on a big forest is locked there all game, and paid in full at the end.

**Lakes** are worth nothing alone; a city beside one is worth +3 per distinct
body of water. That's the cheapest possible way to make a terrain type matter
without giving it a scoring rule of its own, and it turns "where is the water"
into a placement question rather than scenery. Shores and corners only — a tile
that was lake on all four sides would be a hole nothing could ever touch.

**Rivers** are Carcassonne's own mini-expansion, laid before the game proper,
and they pay a city the way a lake does.

**What to watch at the table.** Mountains and forests pull in opposite
directions on purpose — one rewards placing with no follower at all, the other
rewards committing a follower for the whole game. If one of those dominates,
the fix is the number, not the rule.

---

---

# Mechanics — bolt onto any mode

Cheap, orthogonal, and each changes several modes at once. This is where the
leverage turned out to be: four of the twelve designs above are here rather
than in the mode list, and they're worth more for it — and two rules that
started life as whole modes (the cloud kingdom's lifting, Strata's stacking) turned out to
be better as switches than as places.

| Mechanic | What it does | Built |
|---|---|---|
| **Drafting market** (#8) | Removes draw luck, adds a cost model with no currency | ✔ |
| **Lift placed tiles** | The cloud kingdom's verb, anywhere | ✔ |
| **Build on top** | Strata's rule, anywhere | ✔ |
| **Recall a follower** | Take one back instead of claiming | ✔ |
| **Followers walk on** | The wagon, from Abbey & Mayor | ✔ |
| **Hidden objectives** (#10) | Imperfect information, bluffing | ✔ (ten of them) |
| **Fog** (#10) | Exploration becomes real | ✔ |
| **Two-faced tiles** (#12) | A tile is a state, not a noun | ✔ (ten pairs) |
| **Rising tide** (#7) | A clock, and pressure on every mode at once | ✔ |
| **King & Robber Baron** | End bonuses for the largest city and longest road | ✔ |
| **The River** | Carcassonne's mini-expansion, laid first | ✔ |
| **Inns & Cathedrals** | Doubles a finished road, triples a finished city, voids both if open | ✔ |
| **Big follower** | Counts as two for majorities | ✔ |
| **Abbey tile** | One each, fills an enclosed hole, scores 9 | ✔ |
| **Builder** | Extend what you hold, get another tile | ✔ (simplified) |
| **Trade goods** | Wine / grain / cloth, 10 for each majority | ✔ |
| **Oracle dice** | Uncertainty the table resolves narratively | ✔, inside The Chronicle |
| **Hand of tiles** | Choice instead of fate | ✔, inside Girando |
| **Asymmetric powers** | Each player breaks one rule | not built |
| **Turn timer** | Kills analysis paralysis, changes the whole feel | not built |
| **Co-op vs the deck** | The deck plays events against the table | not built |

Plus **tiles per turn**, one to five, which isn't a mechanic so much as a knob
on the turn itself — each tile is a full place-and-act step, so in a walking
mode three means three tiles and three moves.

Three rules are simplified where the UI has nowhere to ask a question: Marches
auto-spends muster chits, the builder uses any of your followers rather than
its own figure, and only the active player is offered a wagon walk. Each is one
dialog away from the real rule.

The three unbuilt ones are all small. Asymmetric powers is the one I'd do next,
because it's the cheapest way to make any of the twelve replayable.

---

# Shared engine work

Three primitives were supposed to unlock most of the list. Two got built and
did exactly that; the third turned out not to be needed yet.

### 1. A mutable board — `Board.remove()` and `Board.rebuild()` ✔

Union-find can't split, so removal can't be incremental. It doesn't need to be:
`cells` is the source of truth and connectivity is **recomputable**.

```js
rebuild() {
  this.parent.clear(); this.data.clear();
  for (const cell of visibleCellsInPlacementOrder) this.link(cell);
}
```

O(n) per removal with n ≈ 100. Free at this scale, and the same call now
supports **lifting** (Girando), **covering** (Strata), **flipping** (two-faced)
and **flooding** (rising tide) — one primitive, four features, which is the
best ratio anything in this document achieved.

Two things the design flagged as fiddly, and one it missed:

- `scored` is component-level and components change, so it moved to
  `board.scoredParts`, a set of cell-feature keys. Meeples moved onto their
  cell and are re-attached during replay.
- **The one it missed:** during a replay, a cell's neighbour may not be linked
  yet, because it was placed later. `link()` has to skip those — that
  neighbour makes the same join from its own side when its turn comes. Without
  the guard, `union()` reaches into an empty component and every mode that
  removes a tile crashes on its first removal. The harness caught it in the
  first run.

### 2. Pieces — multi-cell footprints ✔

`Piece = {cells: [{dx, dy, type, rot}]}` plus `canPlacePiece` / `placePiece`
laying the cells in order. `board.js` needed nothing new; the work was in the
renderer and hit-testing, as predicted.

The part the design got wrong: it assumed pieces would be **authored**. They're
**generated** — a shape is picked and filled by search with tiles whose shared
edges agree. That removes the whole class of hand-checking bugs the design was
worried about, and it means the piece pool is effectively infinite.

### 3. Fields as real features ✖

Not built — and the World tilesets are the evidence for why that's a *format*
problem rather than a missing feature type. Forests, mountains, lakes and
rivers each went in as one line in a table plus one drawing function, inheriting
edge matching, merging and the completion counter untouched. Fields don't fit
that mould because they need **half**-edges, not because they're new. Marches does area control by banner flood-fill instead, which needs
no format change and gets the supply rule working today — the thing that makes
the mode good is the *supply* rule, not the granularity of the territory.

It's still the natural next build, and it's still a change to the tile format
rather than an addition: features would carry **half-edges** (eight slots —
N-left, N-right, E-top, … — instead of four sides), so a road bend can hold two
distinct field segments. `featAt` generalises; the union-find and the `open`
counter don't change at all. It wants doing before the tile pool grows much
further.

### And one refactor: a mode registry ✔

Done first, and it paid for itself immediately. `Game` is now a host that runs
the phase machine and calls hooks; each mode is one file in `src/modes/`
exporting a class plus a spec. The dropdown, the hint, the player-count limits,
the panel and the action buttons are all built from that spec — adding the
eighth mode touched exactly one new file and one line of `index.js`.

### And one thing the design didn't ask for: a computer player ✔

Not on the list, and it turned out to be a consequence of primitive #1 rather
than a project of its own. If a board can have a tile taken off it and rebuild
itself exactly, then a bot doesn't need a model of the rules: it plays the move
for real, scores the position the board reports, and takes the move back. One
file, `src/ai.js`, and it plays all twelve modes without knowing that modes
exist.

What it evaluates is the part that generalises — what closed, what the closure
pays, who is standing in it, what an open feature will probably be worth by the
end, and what it is leaving one tile from closing for the next player. What it
can't see is everything a mode scores on its own books, so that knowledge went
back to the modes as two hooks, `botPlaceBonus` and `botMoveValue`. That's the
mode registry earning out again — a whole new consumer of the hooks, and not
one line of `game.js` or the renderer knows it exists.

Two things it turned up immediately, neither of which random play could have:

- **Expedition's caves are free turns.** A bot that mines them properly runs a
  two-player game from 96 turns to 670 and from 26 points to 285, because
  interior turns don't consume the surface deck and every cave tile can carry
  treasure. Both players score similarly, so it isn't unfair — it's unbounded.
  `EXPEDITION_RULES.caveTurnLimit` was declared for exactly this and is read by
  nothing; wiring it up is the fix.
- **The bot ladder is real.** Sharp beats Steady in 88% of decided games and
  Steady beats Careless in 86%, which says the evaluation is doing the work and
  the noise is doing what noise should.

---

# What playing them should tell you

The build order is spent. What's left is the part only you can do, which is
deciding which of these is the game.

A few things the harness noticed that are worth watching for at the table:

- **Duel** finishes in ~22 turns and scores land between 0 and 28. That spread
  is healthy — it means the draft and the bounded board are doing work. If it's
  *not* fun, that's the single most useful negative result in the whole
  document, because everything else assumes it is.
- **Girando** scores *low* — a mean of 3 across random play, 10 across bot
  games, where Classic runs 28 and 45. That's the thesis working (nothing pays
  until it closes, and the wind keeps things from closing) but it's close to
  the edge: if a game can end with everyone on 4, the wind is winning too
  often. *Four passes later it scores 48 a player and the question has
  inverted* — see the Girando entry above for where the points now come from,
  and note that the new risk is the opposite one: a sky that shatters into
  eight islands and pays mostly for standing on them.
- **Marches** is capped at twelve rounds because uncapped income compounds into
  meaningless numbers. If the campaign feels short, raise the cap before you
  touch the scoring — the round count is the tuning knob, not the points.
- **Descent** loses most random runs by depth two, which is roughly right for a
  roguelike but says nothing about how it plays with actual decisions. The
  boons are where the mode lives; if they feel weak, they're too small, not too
  few.
- **The Chronicle** can't be judged by score. Judge it on whether people keep
  taking turns, and whether the exported log is worth reading back.

**The two I'd still bet on for the full game:** Descent, because roguelike
structure solves the "when does it end and why do I replay it" problem that
every other mode here has — and Strata, because height-as-elevation is the only
idea in this document that isn't already a board game.
