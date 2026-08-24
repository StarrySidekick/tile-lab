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

> **Eighth pass: take the floor out and put a whale on it.** The mode had accumulated three separate ways of nailing tiles down — crystallisation, the locked sfera pair, the anchored ship — and every one of them was a rule that made the board *stop*. All three are gone. Every tile on the board can be pushed, finished or not, and the only brake left is a piece anybody can pick up and carry.
>
> - **The Balena.** A sky whale the size of a district. Whatever tile it lies on cannot be moved by any wind — zephyrs included, which nothing else in the engine has ever outranked — and no gust passes through it, so everything in its lee is sheltered. On your turn, *instead of* placing a follower, you may move it three squares wherever you like. Trading a follower for a turn of shelter is a real price: the follower earns for the rest of the game and the whale only stops things happening.
> - **The ships are out, and with them the hand.** The sky ship was a good idea in a mode that has run out of room for it, and the hand it made necessary — tiles blown off the board landing in your fingers, dealt back as a face-up row — turned every turn into a small draft. Fallen tiles go to the bottom of the deck now, you draw one like anywhere else, and the catch-and-throw-back bonus survives as a second *placement* rather than a second *choice*. That is most of the UI weight gone from the mode.
> - **The Palazzo means something.** It used to be a tile with a scoring modifier stapled to it. Now it defines the **mainland**: whatever piece of country the seat stands on is the kingdom, and every other group of two or more tiles is an *island*. You may not build onto an island and you may not walk a follower onto one — placement is filtered by a new `onto` option on `Board.canPlace`, which is one set lookup and which every path that asks "can this tile go anywhere" already runs through. And when the wind gets hold of the Palazzo itself, every island slides one square the way the seat went, which is how you close a gap you were never allowed to build across.
> - **Islands pay half again as much** — roads 2 a tile, cities 3, farms 5 a city — and ten flat points at the end go to whoever stands on more separate islands than anybody else. Since you can't *choose* to be on one, every one of those points was paid for by having been blown somewhere, or by a flying machine.
> - **Cities pay, and un-pay.** 2 a tile, only ever to somebody standing in the city, and the followers **stay** — a city here is a thing that can be blown open and finished again, and the figure in it is the only record of whose it was. Blowing one open reverses the payment exactly. That needed a numbered book entry per closure, stamped on every tile of the city: refunding the *surviving tiles* gives back the wrong number the moment a tile of the city has fallen off the edge of the world, and "effectively reversing the points gained" is what the rule says. The windmill is the counterweight — 2 to whoever closes the city, per turbine standing in it, and no wind ever takes that back. It is the only durable point in the mode.
> - **Roads are nobody's.** You don't claim one, you finish it, for 1 a tile. What makes a road worth building is what it *arrives* at: every city or temple it runs into pays 2 to whoever holds it, which is as often as not the player across the table. It's the first thing in the game you build in order to pay somebody else, and it is by some distance the most interesting new decision.
> - **Farmers, at last, and harvested rather than counted.** The sfera stopped scoring islands and became one thing: closing a sphere harvests the field the sfera is lying in, at 3 a finished city, and the farmers walk home. That is the only figure in the mode that ever leaves a scored feature under its own steam. It also meant giving every cloud tile a field, worked out the same way the base set's are — a pool where half the tiles had no ground on them would be a pool where farms stopped at the weather.
>
> **Two wind bugs, both visible at the table.** A zephyr blowing the same way as the gust was boosting the wind and then being moved by the *boosted* figure — a tile blown two squares by its own breath. The boost now applies beyond the absorbed zephyr and never to it. And a zephyr caught head-on used to do nothing at all, on the theory that the two brace; that was a patch for a runaway chain the once-per-storm rule already prevents. Every zephyr the wind reaches now fires in its own direction, so a storm rebounds and turns corners, and a line of zephyrs is the chain reaction it looked like it should be.
>
> **Where it landed.** Thirty sharp-bot games, two players, per game: temple 49.2, city 20.4 *gross*, farm 15.9, road 13.2, archipelago 12.7, turbine gusts 10.3, windmill 6.9, road tolls 3.2 — and **city clawback −17.7**. Scores 20–120, mean 57.8, about 94 tiles laid, 6.2 spheres harvested, 4.7 islands standing at the end, the Palazzo towing the archipelago 6.7 times and the whale moved 18 times.
>
> The number to argue about is that clawback. **Eighty-four per cent of everything cities pay gets taken straight back**, which leaves a city worth about 3 points net over a whole game — for a follower you never get back, because a follower stays in the city it finished. That is exactly what the rules say and it may well be the point: the windmill is the durable half, and 6.9 a game of unloseable windmill income next to 3 a game of net city is a clear statement about which of the two you should be building for. But if cities want to be worth claiming at all, the knob is the clawback rate rather than the payout — giving back one a tile instead of two would leave the reversal legible and the city worth garrisoning.
>
> The temple is still 43% of the economy, unchanged from the pass before and still the thing most worth pointing a knob at next.
>
> **And one in the harness**, worth writing down because it was a false positive that would have hidden real ones. The stuck-detector compares a coarse fingerprint of the game before and after each move. In a mode where the country moves, a real move can lay a tile, have the wind blow a *different* one out of the sky, put that one back in the deck and deal it straight back — a completely rearranged board with every coarse counter where it started. `board.seq`, which only ever goes up, is now in the fingerprint.


> **Ninth pass: a city you lose is still a city you had, and the sphere gets a colour.** Three changes, all of them about what the *end* of a thing is worth.
>
> - **The city clawback drops from the full payment to a point a tile.** The eighth pass measured 84% of everything cities paid getting taken straight back, leaving a city worth about 3 points net over a whole game for a follower you never get back. The rule is now: 2 a tile the FIRST time it closes, and 1 a tile up and down forever after as the weather opens and shuts it. So a city you finish and then lose is still ahead, and what the wind takes is the difference between holding it and having held it. The ledger had to go per-TILE to say that — a city is not a stable object here, the wind splits one into two and shoves two into one, and only the tiles carry anything through it. A tile that has been in a finished city before is worth 1; one that never has is worth the full rate, so a fresh wing built onto an old city pays properly for the new ground and nothing twice for the old. It also fixed the split case the whole-payment version got wrong for free: each piece of a shattered city is charged for its own tiles, and the piece that sailed off the edge of the world is charged as it falls.
> - **An endgame, at last.** Carcassonne's, bent to a board that never settled. Islands are counted off the board exactly as play left it — before the harvest, because a farmer that walks home during the tidying-up was standing on that island when the wind dropped. Every farm still being worked is harvested once more. And a city that never finished at all pays 1 a tile, while one that finished and was blown open pays nothing more: it was paid in full, it gave a point a tile back, and that is the whole of its account. The per-tile ledger is what tells those two apart, which is the second thing it bought.
> - **Three sferas, and ANY half fits any other.** Green, blue and red, and the colour decides what the harvest COUNTS on the field the sphere is lying in: green 1 a tile of farmland, blue 2 a finished city the field feeds, red 2 a temple standing on it. BOTH halves of a closed sphere fire, which is the rule that makes the whole thing a decision rather than a lottery — two greens double the ground, a green against a blue takes a smaller field and the cities on it, and a colour you have no partner for is still worth playing against whatever you can reach. The green half in your hand wants a big empty field, the blue one wants to be beside your own building, the red one wants the parish you were already garrisoning; what you can actually pair it with decides which of those you get.
>
>   Built first the other way — a colour only meeting its own colour, three edge letters and the sphere unambiguously one thing. It was tidier and it was worse: it made the sfera in your hand a tile you either found the right partner for or did not, with no play in between. Letting the halves mix is one line fewer and turns every pairing into a small design problem.
>
>   Five shapes in each colour, one of each. The halves that never pair are not waste: at the endgame every unpaired half lying in a field fires as though it had found a partner, so a sfera you could not place against another is a standing instruction about the ground it is lying on.
>
> **Where that landed.** Thirty sharp-bot games, two players, per game: farm 57.4, temple 52.8, city 24.4 net (19.5 paid, −8.5 clawed back, 6.7 for cities that never closed, 6.7 windmills), road 20.3 including 3.6 of tolls, archipelago 11.7, turbine gusts 8.3. Scores 21–203, mean 87.4, 8.0 spheres a game and 2.3 halves left unpaired on the board.
>
> Cities went from 3 points net a game to 24, which is the clawback change working. The farm went from 15.9 to 57.4 and is now the largest single stream — but only just, with the temple at 52.8 behind it, and the two of them are 63% of the game between them rather than one of them being 43% on its own. That is a better shape than it was. Of the farm's 57, only 5.8 comes from the endgame harvest: it is an economy you work during the game, not a lump at the end.
>
> The temple is still the thing most worth pointing a knob at next. It is the only income in the mode that arrives without anything closing.


> **Tenth pass: the sferas become the whole economy, and two bugs that had been shaping the board all along.**
>
> **The bug that mattered.** Tiles were standing in open sky with nothing beside them, and it had been happening for passes: the falling rule only ever asked the tiles that MOVED whether they were still touching anything. A tile the wind never reached is left hanging the moment the neighbours propping it up slide out from under it — which is not a rare case, it is what a gust does to the lane *next* to the one it blows. 179 stranded tiles across twelve games, now zero. The check runs over every tile on the board after a gust and repeats, because dropping one can leave the next one hanging; the whale's tile is exempt, and so is the last tile on the board.
>
> **And a rule that fixes holes at the source.** A zephyr now goes WITH its own wind — one square downwind, into the gap its own lane just opened. Without it a zephyr was a permanent hole-maker: it shoved the country away from itself and then sat in the middle of the space it had made. The ones that blow several ways at once don't travel, because there is no answer to which of four directions a compass rose would go; it stands still in the hole it makes of its own neighbourhood, and now usually falls through it, which is a fitting end for a compass rose. Two DOUBLE ZEPHYRS join the pool, opening at two squares rather than one.
>
> **Nothing is paid for being finished any more.** This is the big one. The sferas are the scoring engine, and closing a sphere is the event the whole mode turns on: each of its two halves fires a scoring pass over one kind of thing, over the WHOLE BOARD, paying whoever is standing in each one. Green the farms, blue the cities, red the temples, yellow the roads — a fourth colour, and roads are claimable again like anywhere else. Both halves fire and any half fits any other, so two yellows score the roads twice over and a yellow against a blue does the roads and the cities once each.
>
> What that does to the turn is worth stating plainly: the question is never "can I close this" but "will a sphere close while I am still standing in it". Finishing a city is not a payday, it is a rate change — 2 a tile instead of 1 on every blue sphere still to come. And it deleted a lot of machinery: the per-tile city ledger, the clawback, the reopen refunds, the road tolls, the separate endgame city rule. Two things still pay outside the spheres, both deliberately small: the temple's offering per arriving tile, and the windmill's 2 for closing its city.
>
> Followers now STAY, everywhere and always — a feature scores over and over, so the figure standing in it is the record of whose it is. Nine each rather than seven, because they never come back. Exactly two things take one off the board: a gust that carries it out over open sky, and your own flying machine going out to fetch it. The machine grew accordingly — it can put a new follower down its lane, fetch one of yours back to the supply, or fetch one and set it down again further along the same flight, which is the only way a figure in this mode ever moves anywhere on purpose.
>
> **The deck had to grow.** The cloud pool is 65 tiles now, and cut to 72 that left seven base tiles — a board with nothing on it for three of the four colours to count. 88, which gives about twenty-one ordinary cities, roads and fields.
>
> **And then the temple's offering went too.** It was the last income that arrived without a sphere — a point for every tile laid in the parish, two for every one the wind blew in — and it had been the biggest single stream in the mode for four passes running. Red is now a temple's only source, which changes what a temple IS rather than just what it earns: red pays a point per tile of the parish, so a temple is the one thing on the board whose value is its neighbours. Laying beside your own is an annuity; laying beside a rival's is a gift. The offering said the same thing in a much worse voice, because it paid at the moment of arrival and could be farmed by two facing zephyrs walking the same tile in and out.
>
> Taking it out also forced the computer player to be told what things are worth, which was overdue. It had been reading the board's ordinary Carcassonne values — which price a field at nothing and a temple at nothing, two of the four things actually worth holding here — so it is now given each feature's own colour rate times how many times that colour is still likely to fire.
>
> **Where it landed.** Thirty sharp-bot games, two players, per game: yellow 369, blue 322, green 279, red 245, windmills 7.1, turbine gusts 6.9, archipelago 9.0. Scores 107–270, mean 186, about 8 spheres a game.
>
> The four-way split is even enough that no colour is a trap and none is the obvious pick, which is the thing worth having; yellow leads because a road picks up the cities it reaches as well as its own tiles, so it compounds where the others don't. Scores are still roughly eightfold what they were before the sferas took over the economy, because a pass over the whole board firing sixteen times a game pays for everything you hold every single time. That is what the rules say and it may well be the point — but if the numbers want to be Carcassonne-sized rather than pinball-sized, the knob is the rates themselves, not the structure. Halving every rate leaves the split untouched.


> **Eleventh pass: teach the computer player the rules, and find out what winning looks like.**
>
> Girando's rules were four passes old and nobody had ever played it well — including the harness, which was reading the board correctly and then valuing what it saw by Carcassonne's assumptions. So the mode's advice to the bot became a block of fifteen plain numbers, `GIRANDO_WEIGHTS`, and `tools/train.mjs` plays the mode against itself to improve them. Three things about how it is built are worth writing down, because each is a trap:
>
> - **It selects on WINNING, not on scoring.** "Make the bot's score as large as possible" is the obvious objective and it is badly wrong: both seats play the same mode, so anything that inflates the board inflates both scores. A weight set that closes spheres constantly scores enormously and hands the same enormous score to its opponent.
> - **Every match is played twice with the seats swapped.** The first player lays the tile that starts the weather, and over sixteen games that is worth more than most of the weights are.
> - **A challenger has to beat a margin.** Forty games puts the standard error on a win rate at about eight points, and a hill-climb that accepts noise walks away from a good answer as happily as it walks toward one.
>
> **It found a real bug in ten minutes, and the bug is the interesting part.** The trainer has a sweep mode that moves one weight at a time, halved and doubled. The `farm` weight came back at exactly 50% and a mean margin of exactly zero in BOTH directions — which, with the seats swapped, is the signature of two players behaving identically. The weight was not wired to anything: `Bot.expectedValue` had a hard-coded branch pricing a field by the completed cities touching it, Carcassonne's own farm rule, without ever asking the mode. Girando's farms pay by the TILE. The bot had been valuing the biggest income in the game by a rule that has nothing to do with it, for four passes, and nothing else would ever have caught it. The fix is one guard: a mode that prices a feature type itself is the authority on it. The bot's mean score went from 158 to 195 on that line alone.
>
> The same signature caught two dead weights. `whale` was a pure positive scale on a value used only in an argmax and a sign test, so it could not change a decision; it is a THRESHOLD now — how good the shelter has to be before the Balena is worth a follower placement. `turbineFree` guarded a branch nothing reaches, and is gone.
>
> **What winning actually looks like.** A sensitivity sweep and a self-play climb, run separately, agreed on every direction; the composed set beats the guesses it started from in **62.5% of 120 games at a mean margin of 19 points**. Read off the weights, the mode says:
>
> - **FARMS ARE THE GAME.** Twice as important as first assumed, and the strongest single signal in the sweep by a distance — halving it loses 75% of games, doubling it wins 69%. A trained bot takes 317 points a game from green and 26 from yellow.
> - **Temples come second**, and roads are worth about half what they look like — despite yellow being the biggest stream when two identical bots play, which is the point: yellow pays everybody, and paying everybody is not a strategy.
> - **A windmill in a city you hold is worth twice the guess**, which makes it the one small permanent thing worth fighting over.
>
> Two trained bots at full depth run a mean of 196 a game with a highest single score of 382, and 499 was seen during training. The lopsidedness — 317 from farms against 26 from roads — is the balance finding: the four colours are near-even when nobody is trying, and a long way from even once somebody is.


> **Twelfth pass: put the followers back in the box, and give roads somewhere to go.**
>
> The eleventh pass measured the mode and the measurement said two things. Roads were claimed 1.9 times a game against fields held 44 tiles deep, and the trained bot took 317 points a game out of green and 26 out of yellow. Both numbers have the same cause and it is not the rates: a gust cuts a road in half and the two halves can never rejoin, because the seam that used to be a road is now a road facing empty sky and the board will not weld a mismatched edge. Fields reconnect freely — ground is ground. So the mode paid roads by exactly the quantity the weather was built to destroy, and the bot noticed long before I did.
>
> **The sky bridge is the fix, and it is a scoring rule rather than a terrain rule.** A road that runs off one tile, across one empty square, and straight on out of the tile beyond is one road: it scores as one and a follower may walk across it. The gap stays open air — the wind neither notices the bridge nor stops at it, and a tile can be blown clean through where it stands. That separation is the whole of why it works. Making the gap into ground would have given the wind a new kind of obstacle to reason about and turned every cut road into a permanent structure; making it a *fact about connectivity* costs the weather nothing. It lives in `Board.bridgeRoads()`, which unions the two road parts and takes 2 off the pair's open count, and it runs from `place()` as well as `rebuild()` — the incremental path links without rebuilding, so a freshly built board had no bridges at all until it did.
>
> **And followers come home again — but only off something finished.** The eighth pass made them permanent, on the argument that a feature which scores over and over needs a standing record of whose it is. That argument is right and the consequence was still wrong: a figure put down on turn three collected from every sphere for the rest of the game and never moved, so the mode was a race to claim in the first ten turns and then a long wait. The rule now is the one distinction the mode already had lying around: a sphere paying a **finished** city or road hands its followers back, one paying an unfinished one leaves them standing. Eight each instead of nine. Finishing something is still not a payday — it never pays a point — but it is now how you get your people back, which is a second reason to close things in a mode that had removed the first one.
>
> Two figures are exempt because the rule cannot reach them. A **farmer** stands in a field and a field is never finished. And one **lying flat** is a follower you have retired into its city on purpose: it never comes home, and the city it holds pays the lower rate — a point a tile, finished or not — for as long as it is the only thing holding it. That is a real bargain rather than a bonus. It is the answer to "I want to keep this one" in a mode where keeping anything now costs you the piece, and it costs you the piece.
>
> **The walk** is the other half of the same idea. A follower whose feature just finished may go out along a road connected to where it stood instead of coming home — as far as the road runs, hopping the bridges, until it reaches something. A dead end is the road itself, claimed. A city stops it on the first tile it enters. You may not walk into an occupied feature or down a road somebody else is standing on. It is Carcassonne's wagon with the mode's own geometry underneath it, and it does two jobs at once: it is the only way a figure moves anywhere under its own steam, and it is the only thing in the mode that makes a road worth *building through* rather than merely worth holding.
>
> The rest of the pass is tightening:
>
> - **Farms pay the majority only**, and a field somebody else is already farming is closed to you. Ties split it. A field that pays everyone standing in it is a field nobody has to contest, and green was the biggest income in the game.
> - **No second figure into something you already hold.** It had never been a rule and it should always have been one.
> - **Straight roads no longer swing onto the wind.** The windvane does, and it is now the only tile the weather re-cuts. A road you built should stay where you built it; the vane is the exception you can see coming, because it is drawn as one.
> - **The windmill pays the feature's owner**, not whoever laid the closing tile, and it stands on roads as well as in cities: 2 for every gust through it and 2 more when the feature closes. A mill is a thing you own, not a race you win.
> - **A held city the wind blows open again costs a point a tile.** Nothing was paid for finishing it, so this is not a clawback; it is the price of having been the one standing in it when the weather arrived.
> - **The Abbazia finishes what it caps**, rather than only capping it — and that turned out to be a genuine ordering bug rather than a rule change. `link()` decided whether to apply a cap by asking whether the neighbour was already in the union-find, using an id of `"x,y#null"` for the featureless Abbazia itself, so an Abbazia laid *before* the road it capped never capped it and that road could never close. It now tracks the cells it has wired.
> - **Four of every sfera, not five**, and the endgame fires the four colours once — a sphere you close on the last turn is not a fifth pass.
> - **You may build onto an island you are standing on.** Being blown out there was meant to be an opportunity rather than a sentence.
>
>
> **Where it landed, and it landed on the thing it was aimed at.** A fresh sensitivity sweep — one weight at a time, halved and doubled, 80 games each — says **`road` doubled wins 63%**, the strongest single move on the board, against a weight the eleventh pass had trained *down* to 0.55 because roads were not worth holding. Composed with the other two the sweep liked (`farm` doubled again, `gust` doubled), the set beats the shipped one in **57.1% of 120 games at a mean margin of 12**. Its income, per game: green 306, red 80, **yellow 75**, blue 16. Yellow has gone from 26 to 75 and it is now the second real stream rather than the thing nobody claimed.
>
> Blue collapsing from 118 to 16 is the follower rule showing its teeth, and it is worth being honest about: a city only pays double once it is finished, and finishing it now takes your follower off it, so the bot mostly stops holding cities and lets the walk carry the figure somewhere else. That may be too sharp. The knob is `cityDone`, not the return rule — but it is the number to watch at a real table.
>
> Scores roughly halved, 196 a game to 105, which is what the brake was for. Random play runs 41 and bot play 91 against 131/172 before the pass. The gap between the two has *widened*, which is the good direction: more of the score is now arriving because somebody meant it.


> **Thirteenth pass: the wind stops shuffling the lane and starts tearing the end off it.**
>
> Every pass so far has treated a gust as a conveyor: everything downwind slides
> along together, so a zephyr rearranged a whole row and changed almost nothing
> about it. The country came out the far end in the same order it went in, one
> square over. It looked enormous and it did very little, and the tell was that
> nobody at the table could ever say what a particular zephyr would *do* beyond
> "shift that lot".
>
> **The wind does nothing to the country it passes through.** It runs down the
> lane and takes the LOOSE END: the run of tiles downwind of the zephyr stops
> somewhere — a gap, open sky — and the last tiles before that gap are the ones
> that come away. Country backed up against more country is country the wind
> can't get under, which is a sentence you can plan around. **How many and how
> far is the power**: a gust arriving at power *N* pops the last *N* tiles off
> and carries each of them *N* squares, as a raft, still touching each other
> because they all travel the same distance. A row of five with a zephyr on the
> right blowing west loses its leftmost tile, one square. Put a second
> west-blowing zephyr in that row and the wind arrives at two: the leftmost
> **two** tiles come away, two squares each.
>
> **And power no longer stops at three.** It gained a square per same-facing
> zephyr and capped, which made a lane of four zephyrs identical to a lane of
> three. It now also gains **a square for every corner the storm turns** — a
> woken zephyr opens one power harder than the wind that woke it — so a chain
> through a knot of zephyrs is a storm that keeps getting worse, and the raft it
> tears off the next end keeps getting wider. What still bounds it is that no
> zephyr contributes the same direction to one storm twice, and that every
> square of power costs a distinct zephyr. `MAX_STRENGTH` is a backstop now
> rather than a rule.
>
> **A tile the wind moved has to still fit what it landed against.** The falling
> rule only ever asked whether a tile was touching anything; a road shoved up
> against a city wall was touching plenty and joined to none of it, and it hung
> there in the sky as a permanent dead seam. It falls now — and unlike a tile
> that simply drifted loose, **it does not come back**. Nobody collects it and
> nobody plays it again. One legal connection is enough to stay up; none is the
> end of the tile. The report says which kind of loss it was, because the two
> are not worth the same to the mode: `adrift` goes to the bottom of the deck
> and can be caught, `mismatch` leaves the game. Followers on anything that
> falls, either way, go back to their owners — they used to go down with it.
>
> **The zephyr no longer travels with its own wind.** That rule existed because
> a zephyr shoved the country away from itself and then sat in the gap it had
> made; under the new wind it opens no gap beside itself, so riding into one
> only ever blew the zephyr into open sky. Followers still travel exactly as
> they did — one on the raft rides it, and every other follower in the lane is
> picked up and put down downwind on whatever is there. That asymmetry is the
> mode in one line: **the wind moves people; it does not move the ground under
> them.**
>
> **Scoring a feature empties it, finished or not.** The twelfth pass gave
> followers back off finished things, which left the farmer — the single biggest
> income in the game — standing in a field nothing can ever finish, permanently.
> Farms, cities, roads and temples all hand the figure back now. The temple's
> keeper no longer waits for a full parish it will probably never get. Only a
> follower **lying flat** stays, which is exactly what you bought when you laid
> it down.
>
> **And the Balena swims anywhere.** Three squares meant the whale could only
> shelter the neighbourhood it was already in, and the tile you actually wanted
> saved was reliably four squares away — a brake anybody can pick up is only a
> brake if it can reach the thing that needs stopping.
>
> Two pieces of art went with it. The temple was drawn inside a walled ring,
> which reads from across the table as a coin: it is a roof on columns now,
> steps and a pediment and the pennant on the ridge, because that silhouette is
> the one everybody already knows. And the drifting cloud banks came off the sky
> chart — soft white blobs sliding over a drawn map, smudging the graticule and
> reading as dirt on the glass. The chart is the backdrop; nothing floats in
> front of it.


> **Fourteenth pass: nothing falls for being alone — and it did not do what it was for.**
>
> The falling rule was the mode's great eraser. A tile touching nothing dropped
> out of the sky and went back into the deck, which meant every fragment the
> weather made was deleted before it could become country: the board healed back
> into one mass every turn, and the archipelago was something you read about in
> the rules rather than something you saw. So it is gone. A tile the wind shakes
> free of everything hangs there over open air, and so does the one it strands
> behind it. The ONE thing that still falls is a tile the wind moved that no
> longer FITS — touching country and joined to none of it — and that one is a
> loss, not a return.
>
> **It made fewer islands, not more, and the reason is worth writing down.**
> Twelve bot games on the same seeds, before and after:
>
> | | tiles fall | nothing falls |
> |---|---|---|
> | islands at the end | 1.8 | **0.6** |
> | lone rocks adrift | 0.0 | **1.8** |
> | tiles lost | 14.3 | 3.4 |
> | gusts a game | 47.8 | 37.8 |
> | mainland, of ~85 | 78.0 | 81.8 |
>
> Three things, and only the first is really about the rule. **The fragments the
> wind makes are singletons.** A power-one gust — the common case by a distance —
> pops exactly one tile off the end, and one tile adrift is by rule not an
> island; it is a rock. The 1.8 tiles a game that used to fall are now sitting
> there as rocks, which is the same board with the deletions painted back in
> rather than a board with more country on it. **Nothing goes back into the
> deck**, so the deck is no longer replenished and a game is eight tiles and ten
> gusts shorter, which is less weather. And **nothing shrinks the mainland any
> more**, so it only grows.
>
> The lever this actually wants is the *definition*, not the falling: `land()`
> filters adrift groups to two tiles or more, on the reasoning that a lone tile
> adrift is not somewhere you could live. Drop that to one and the 1.8 rocks
> become 1.8 islands, and — the part that compounds — a rock you are standing on
> becomes somewhere you may BUILD, so it can grow into country instead of sitting
> there forever. That is a real design decision with teeth (island rates are
> double, and the end-game archipelago bonus counts islands held), so it is
> written down here rather than taken.
>
> The catch-and-throw went with the falling, because nothing comes back into the
> deck for anybody to catch.


> **Fifteenth pass: three rules that turn the fragments into an archipelago.**
>
> The fourteenth pass took the eraser out and got fewer islands, not more. The
> diagnosis was in the numbers and it was three-part: the wind's commonest act
> pops exactly ONE tile off a loose end, so nearly every fragment it makes is a
> singleton; a singleton was by rule not an island, so it scored nothing and —
> the part that mattered — could never be built on; and a gust stopped at the
> first gap, so it only ever nibbled the near edge of the country and never cut
> anything. Three rules, one for each.
>
> **The wind crosses gaps.** A gap is open air, not a wall. A gust now takes the
> loose end of *every* run down its lane, and its strength carries over the open
> water between them — the same wind on both sides of a strait. One gust is one
> nibble per run rather than one nibble, and a board that is one tile thick in
> two places is a board a single gust can cut in two places. Only the whale still
> ends a lane.
>
> **What the wind can get under goes whole.** `gust()` takes a `rooted` set from
> the mode — the country too big to lift, which in Girando is the Palazzo's
> mainland and nothing else. Everything else adrift that the gust reaches travels
> *entire*: perpendicular arms, followers and all, set down downwind as one
> thing, sliding until it comes to rest **alongside** what stops it rather than
> short of it. That last word is the mechanism. Rocks meet and become islands,
> islands meet and become bigger islands — and an island driven back into the
> mainland is swallowed by it, which is the price of the whole thing being
> weather rather than a ratchet.
>
> **Every fragment is an island, down to one tile.** *A lone tile adrift is not
> an island, it is a tile adrift* was a good sentence and it was the reason the
> archipelago never grew. A rock you have somebody standing on is now somewhere
> you may lay a tile — so the wind makes the seed and the players grow it, which
> is the only mechanism in the mode where the weather and the placement rules
> pull the same way.
>
> **The ablation, twelve bot games on the same seeds.** Every combination was
> measured rather than argued about, and the argument would have got it wrong:
>
> | | islands | island tiles | biggest | rocks left | mainland | top score |
> |---|---|---|---|---|---|---|
> | fourteenth pass | 0.6 | — | — | 1.8 | 81.8 | 125 |
> | + gaps crossed | 4.2 | 23.6 | 12.0 | 9.2 | 47.8 | 88 |
> | + gaps, whole lifts | 2.6 | 18.1 | 13.3 | 5.1 | 59.8 | 119 |
> | + gaps, lifts, rock=island | **6.9** | **25.3** | **15.7** | 4.3 | 57.1 | 108 |
> | + gaps, rock=island | 10.9 | 21.1 | 7.2 | 7.8 | 58.9 | 98 |
>
> Gap-crossing alone makes the most *fragments* and the worst game: half the
> board ends up in pieces nobody can reach and the score falls by a third. The
> whole-lift is what turns fragments into country — it more than halves the dead
> rocks and grows the biggest island — but on its own it also merges islands back
> into the mainland, so the count goes down. All three together is the one row
> that is best or near-best on every column that matters: **11× the islands, a
> biggest island of 16 tiles on an 82-tile board, and a score that gives up 14%
> rather than a third.**
>
> Twenty games on the shipped set confirm it: **7.5 islands a game, 25 tiles of
> island on an 82-tile board, a biggest island of 13, and 2.5 islands with
> somebody standing on them** — against 0.6 islands and nobody standing anywhere
> a pass ago. The archipelago is a thing you look at now.
>
> What it costs is spheres: 4.7 a game down to 3.1, and the score with them,
> because a fragmented board is a board where two sfera halves are harder to
> bring together and where a third of the country is out of reach of your hand.
> That is the number to watch — if the mode wants its scoring engine back the
> knob is the sfera pool or the pairing rule, not the weather. The other honest
> caveat is that the computer player has no opinion about islands at all: it
> prices what it holds at the island rate and otherwise plays as if the mainland
> were the whole board, so every number here is what the archipelago does to
> players who are not trying to make one.


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

> **Built as a modifier** — `Drafting market`, and it works everywhere. Duel's open pool reuses the same row and the same picker with the discard rule switched off; Girando did too, until the eighth pass took the hand out and went back to a single drawn tile.

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
| **Hand of tiles** | Choice instead of fate | ✔, as the `Drafting market` modifier |
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
- **Girando** scored *low* at first — a mean of 3 across random play, 10 across
  bot games, where Classic runs 28 and 45. That was the thesis working (nothing
  pays until it closes, and the wind keeps things from closing) but it sat close
  to the edge: if a game can end with everyone on 4, the wind is winning too
  often. *Several passes later it ran 131 across random play and 172 across bot
  games*, and the question had inverted twice over. The twelfth pass put the
  followers back in the box — they come home off anything finished — and it
  runs **41 across random play and 91 across bot games** now. The gap between
  the two numbers is the thing worth watching, and taking it from 1.3× to 2.2×
  is the whole point of that rule: the sfera passes pay for everything on the
  board every time one fires, so a lot of a random player's score used to
  arrive whether they meant it or not.
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
