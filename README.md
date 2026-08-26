# Tilemaker's Workshop

**Play it: <https://starrysidekick.github.io/Tilemakers-Workshop/>**
· [tile atlas](https://starrysidekick.github.io/Tilemakers-Workshop/atlas.html)

A sandbox for experimenting with tile mechanics and game modes, built to be
**fast to iterate on**. No build step, no dependencies, no image assets — plain
ES modules and a canvas. Edit a file, hit refresh, keep playing.

Twelve modes and a catalogue of 79 Carcassonne rules — 67 of them playable —
all sharing one board engine. Each mode exists to answer a specific question
about what makes tile-laying good; [MODES.md](MODES.md) is where that
reasoning lives, and [docs/EDITIONS.md](docs/EDITIONS.md) is where the printed
game's own edition history is kept.

## Run it locally

**Double-click `Play Tilemaker's Workshop.command`.** It starts a local server and opens the
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
hold still, and neither will the people standing on it. **Nothing crystallises**
— every tile on the board can be pushed, finished or not, and the only thing
that has ever stopped one is the whale lying on top of it. And **nothing is
paid for being finished**: closing a *sphere* is the scoring round, so the
question every turn is never "can I close this" but "will a sphere close while
I am still standing in it".

| | |
|---|---|
| **Zephyr** | Twenty-two of them. Played, one blows its lane downwind — and does **nothing at all** to the country it passes through. Country backed up against more country is country the wind can't get under. What it takes is the **loose end**: the run of tiles downwind of the zephyr stops somewhere, at a gap or at open sky, and the last tiles before that gap are the ones that come away. **How many, and how far, is the power** — a gust arriving at power *N* pops the last *N* tiles off and carries each of them *N* squares, as a raft, still touching. A row of five with a zephyr on the right blowing west loses its leftmost tile one square west; put a second west-blowing zephyr in the row and the gust absorbs it, arrives at two, and the leftmost **two** tiles come away two squares each. The zephyr itself never travels — it opens no hole beside itself to travel into |
| **Gust cannon** | **Six** tiles in the deck carry one, and it is the artillery of the mode. A zephyr in every way the engine cares about — direction, absorption, chaining, and a cannon somebody else's gust *wakes* still fires like a cannon — except in what it does at the loose end. It does not carry the tiles; it **fires** them, and a fired tile travels until the square in front of it is occupied, however far away that is. So a raft crosses a strait it could never have crossed a square at a time, the leading tile going furthest and the ones behind piling up against it. And one fired down a lane with **nothing in it** never stops, which is to say it falls out of the sky: pointing a cannon at open air is a decision with a cost. Followers are unchanged — a person is not a projectile |
| **Power** | It used to stop at three. It doesn't. A gust hardens a square for every zephyr blowing its *own* way that it runs over — *beyond* the absorbed zephyr, never upon it, so a tile is never blown further by its own breath — **and a square for every corner it turns**. A zephyr pointing any way but the gust's is **woken** rather than absorbed: the storm carries on down that zephyr's lane, in that zephyr's direction, one power harder than it arrived. A line of zephyrs is a chain reaction that turns corners, rebounds, and hits harder every time it does; what keeps it finite is that no zephyr contributes the same direction to one storm twice. Two **double zephyrs** open at two |
| **The four winds** | One crosswind, one split wind, one trident and one compass rose — each opens two, three or four lanes at once out of the same square. They don't travel with their own wind: there is no answer to which of four directions a rose would go, so it stands still in the hole it makes of its own neighbourhood, and usually falls through it |
| **Nothing falls for being alone** | A tile the wind shakes free of everything **hangs there** over open air, and so does the one it strands behind it. Tiles touching nothing used to drop out of the sky, which was an eraser: it deleted every fragment before it could become country, so the board healed back into one mass every turn |
| **Catch and throw** | A tile the wind takes out of the sky — fired into nothing by a cannon, or landed where it fits nothing — goes back on **top of the deck**, and whoever set the wind off may throw **one** of them straight back down that turn, while the hole the wind just made is still open. Once a turn, however many fall. It is the only thing that gives back what the cannon takes |
| **The wind crosses gaps** | A gap is open air, not a wall. A gust takes the loose end of **every** run down its lane, not just the first, and its strength carries over the open water between them — the same wind on both sides of a strait. A board that is one tile thick in two places is a board one gust can cut in two places. Only the whale ends a lane |
| **What the wind can get under goes whole** | The mainland is the only country too big to lift. **Everything else adrift travels entire** — perpendicular arms, followers and all — and slides down the wind until it comes to rest *alongside* whatever stops it rather than short of it. So rocks meet and become islands, islands meet and become bigger islands, and an island driven back into the mainland is swallowed by it. That is the archipelago moving, and it is the price of the whole thing being weather |
| **Landing where you fit** | …and it is the one thing that still falls. A tile the wind **moved** has to *join* something: one that comes down beside country whose edges it can't meet — a road shoved up against a city wall — is touching the kingdom and holding on to none of it, and there is nothing holding that up. It goes back on top of the deck like anything else the wind takes. A tile with no neighbours at all has nothing to disagree with, so it floats. One legal connection is enough to stay in the sky; none, with something beside you, is the end of the tile. Followers on anything that falls go back to their owners |
| **Followers** | **Little star people** — the classic silhouette goes to mush at board size, and on a page of compass roses and wind-heads the figure ought to belong to the same drawing. Weather too, and **a feature that scores is emptied** — farms, cities, roads and temples alike, finished or not. The sky pays you and hands the figure back. That is the brake on the whole economy: without it a figure put down early collects from every sphere for the rest of the game and never moves, which is a game of who claimed fastest in the first ten turns. **Eight each.** One figure never comes home: one **lying flat**. A gust that carries a figure out over open sky takes it off the board, so does a tile falling out from under it, and your own flying machine can go and fetch one. And **a follower put down on a zephyr is in that wind**: it carries on down the new zephyr's lane at that zephyr's strength, and again if that lands it on another — which is one way a figure crosses the sky without a machine. And you may never put a second figure into something you already hold |
| **Nothing pays for anything but a sphere** | The sferas are the scoring engine — every farm, every city, every temple, every road waits for one. Closing a city is not a payday; it is a **rate change** on every blue sphere still to come. The windmill is the single exception |
| **Sfera** | Sixteen of them — **four of every colour** — each half a sphere on one edge, and **any** half fits **any** other. Closing one is the event the whole mode turns on: each of its two halves fires a scoring pass over one kind of thing, **everywhere on the board**, paying whoever is standing in each one. **Green** the farms — a point per two tiles of field, and only to the **majority farmer**; a field somebody else is already farming is closed to you, and a tie splits it. **Blue** the cities — 1 a tile open, 2 a tile once closed. **Red** the temples — 1 for every tile in the eight around one. **Yellow** the roads — 1 a tile, plus 1 for each city the road reaches and 2 if that city has closed, whoever owns the far end. **Both halves fire**, so two yellows score the roads twice over and a yellow against a blue does the roads and the cities once each. The pairing is the decision |
| **Temple** | A monastery with no cloisters left in the sky — every one is a temple, and it is the one thing on the board whose value is its **neighbours**. Red pays its keeper a point for every tile standing in the eight squares around it, so a temple laid early and garrisoned is worth more every time somebody builds near it — and worth something to your rival every time *you* do. It pays nothing on its own; red is its only source — and red takes the keeper back when it pays, like every other colour |
| **Windmill** | The turbine, and the only thing left in the mode that pays outside a sphere. It stands in a city **or on a road**, and it pays **2** to whoever **holds** that feature — once for every gust that blows through it, and once more when the feature finishes. Whoever laid the closing tile gets nothing for it: a mill is a thing you own, not a race you win |
| **The mainland** | Whatever is **biggest**. It used to be whichever piece the Palazzo happened to be standing on, which meant a gust that blew the seat onto a two-tile rock demoted the whole kingdom to an island and doubled every rate on the board in one move. Size is the reading a player makes anyway |
| **The Palazzo** | The seat of the kingdom, and the one thing that moves the archipelago on purpose. It starts the game and it is as blowable as anything else — and when a gust gets hold of it, **every island slides one square** the way the seat went, which is how you close a gap you were never allowed to build across |
| **Islands** | **Every** piece of country off the mainland, down to a single tile. It used to take two — *a lone tile adrift is not an island, it is a tile adrift* — and that sentence was the reason the archipelago never grew: the wind's commonest act is popping ONE tile off a loose end, so nearly every fragment it makes is a singleton, and calling those rocks meant they scored nothing and could never be **built on**. A single tile you have somebody standing on is now somewhere you may lay a tile, which is the whole engine — the wind makes the seed and the players grow it. Islands pay exactly **double**, all of it. The catch is that you may not build onto one **unless you are already standing on it** — being blown out there is meant to be an opportunity rather than a sentence, but you cannot sail out to an empty rock and start. Islands are made, not chosen: you were standing there when the country came apart, or you blew a tile across the gap, or you flew somebody out. At the end of the game a flat **10** goes to whoever has a follower standing on more separate islands than anybody else |
| **The Balena** | A sky whale the size of a district. Whatever tile it lies on cannot be moved by any wind, and no gust passes through it — a run backed up against the whale has no loose end at all, so nothing comes off it and its lee is untouched, and it holds its tile *up* as well as still. On your turn, **instead of placing a follower**, you may send it **anywhere on the board**. It swam three squares once, which meant it could only ever shelter the neighbourhood it was already in and the tile you wanted saved was reliably four squares away. It is the only brake in the mode, and it is a brake anybody can pick up |
| **The windvane** | Four ways in and only two of them joined, and **the wind picks which two**. It is the *only* tile the weather re-cuts: a straight road used to swing onto the wind as well, and a road you built should stay where you built it. Three-way junctions end their roads and carry a village |
| **Abbazia** | Takes any edge, and **caps** everything it touches — a road ends there, a city walls itself against it, and both can finish without meeting anything. It's an ordinary tile, so the wind can take it away again, and then everything it was holding shut is unfinished, and worth less to the next blue sphere. And **an Abbazia with somebody standing on it is a temple**: nothing on it can be claimed when you lay it — it has no features at all, which is the whole of what makes it a cap — but the wind can put a follower down on one, and red then pays it for its parish like any other temple. Being blown into one is the only way anybody ever gets there |
| **Flying machine** | Points down a lane, and does one of three things along it. It can put a **new** follower on any tile out there — an island included, which is the one way to reach one on purpose. It can go and **fetch** one of yours off the lane, back into your supply. Or it can fetch one and **set it down again further along** the same flight, which is the only way a figure in this mode ever moves anywhere on purpose. It **crosses open sky**, and a zephyr crossed on the way is a wind you're *in*: the flight turns and follows it |
| **The hop** | A road runs off one tile, out over **any amount of open air**, and straight on into the tile beyond — and a walking follower can **step across it**. One square or nine makes no difference to a figure that is going to step off the edge either way, and it is how somebody walks out to an island without a flying machine. What it can never cross is **country**: a road that runs into the back of a tile has arrived, and stops there. What it is not is one road: the two halves score separately, and there is nothing standing in the gap. There was a plank drawn there once and the halves scored as one, and it looked like a plank floating in mid-air, which is what it was |
| **The walk** | A follower whose feature just finished may **walk instead of coming home** — out along a road connected to where it stood, as far as the road runs, hopping any amount of open air in it, until it reaches something. A dead end is the road itself, claimed. A city stops it on the first tile it enters. You choose the fork where there is one, and you may not walk into an occupied feature or down a road with somebody else's follower on it. It is the only way a figure moves anywhere under its own steam |
| **Lying flat** | On your follower step you may **retire** one of your figures standing in a city: lay it on its side and it never comes home, not even when the city finishes and pays. It keeps the city — but a city held only by flat figures pays the **lower rate**, a point a tile, finished or not. A holding rather than a claim, and the answer to "I want to keep this one" in a mode where holding anything costs you the piece. Once a turn |
| **Blown open** | A finished city you were **holding** that the wind opens again costs you **1 a tile**. Nothing was paid for finishing it; that is the price of having been the one standing in it when the weather arrived |

**The end of the season** fires every colour once, and that is all — a sphere
you managed to close on the last turn is not a fifth pass, it is the same four
everyone gets. The islands are counted first, off the board exactly as play
left it.

**The design console — `Shift`+`D`.** Every visual dial in the mode, live, with
a slider or a swatch and a sentence saying what it does: the sheet's tone and
grain and foxing, the sky wash and where the brush pooled, the wobble and tooth
of the hand-drawn line, the chart's ink weights, every colour the country is
painted in, the storm's pacing, the proportions of a star person. **Export JSON**
hands back only what you changed — drop that file in as `assets/design.json` and
the game boots wearing it, for everyone. Adding a new dial is one line in
`src/design.js`; the console builds its own controls from that book.

**The sky is the space, not the ground.** The gaps between tiles are open air —
it is what a tile the wind blows clear of everything hangs in, and what runs
between islands — while the tiles themselves stay ordinary countryside. It is drawn as an old
chart of that sky, and the mode is printed rather than lit: **sky painted onto
parchment** — the sheet first, then the wash laid over it, pooled and uneven the
way a brush leaves it, and then the paper coming back through on top, its laid
lines and its foxing multiplied over the paint. Paint under grain reads as
pigment sunk into a sheet; paint over grain reads as a blue rectangle with a
texture stuck on it. Foxed and stained at the edges, a graticule with heavy meridians every five squares,
the rhumb lines a portolan strikes from its compass nodes in red ink, a rose on
the origin with the Latin winds named round it, and a **bearded wind-head** on
every zephyr, cheeks full, blowing its cone of air the way every sixteenth‑century
chart draws one. The panel is the same sheet as the board. There is no four-sided city anywhere in the
pool, because a city with four ways in and no way to cap it is one the weather
never lets you finish. **Nothing is settled and nothing is banked**: a city is
finished until the weather says otherwise, the mainland is wherever the Palazzo
happens to be this turn, what you hold is only worth anything at the moment
somebody closes a sphere, and the only permanent thing on the board is a whale
anyone can move.

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

## The workshop

One panel, every rule the project knows about, stacked in the order they build
on each other. The organising idea is the one the current Carcassonne rulebook
states outright:

> You can also choose to use only some elements from an expansion and not
> others; for instance, you could use only the large meeple from the first
> expansion and the builder from the second, without using any other elements.

So nothing in the catalogue is bundled. Inns & Cathedrals is not one switch, it
is three — the big follower, the inn, the cathedral — and each is a row you can
tick on its own.

That principle is then taken one layer further down than the printed game goes.
**The base layer is a set of switches too.** Cities, roads, fields, cloisters,
followers and pennants are rules Carcassonne happens to ship with, not laws of
physics, and a workshop that can't take the roads out isn't a workshop. They
default on; turning one off pulls its tiles out of the pool and stops it paying:

| off | what happens |
|---|---|
| **Cities** | Every tile carrying a city leaves the deck. 72 tiles become 28 |
| **Roads** | Same, for roads: 72 become 27 |
| **Cloisters** | The monastery and temple tiles leave: 72 become 66 |
| **Fields** | Farmers can't be laid, and no farm pays out |
| **Pennants** | Coats of arms stop counting; a shield is decoration |
| **Followers** | No majorities — a feature simply pays whoever closed it |

Take all of them out at once and you get 72 tiles laid, nobody scoring
anything, which is exactly what it should be: bare tiles.

The panel folds. Seventy-nine rules in a 306px column is only readable because
almost all of it is closed almost all the time — one layer open, the rest a
summary line, and a search box that cuts across the lot. Each row carries a dot
saying whether the rule is **playable**, **approximate**, or **catalogued but
not built yet**, and a `?` linking to the real rule on
[WikiCarpedia](https://wikicarpedia.com/car/Main_Page). A catalogue that hides
its gaps is worse than one that admits them, so the unbuilt rules are listed,
greyed, and honest about it.

Rules are also gated on their own prerequisites: you can't tick the pig with no
fields for it to stand in, and switching cities off switches the cathedral off
with them.

### Special followers

Every expansion that adds a figure adds the same three things: a supply of one,
a rule about where it may stand, and a rule about what it counts for. So they
are one table in `src/mechanics.js` rather than one branch each, and the panel
grows a button per figure you still hold.

The weight lives next to the majority count that reads it, in `board.js`,
because that is the only thing that needs it:

| figure | may stand | counts for |
|---|---|---|
| follower | anything claimable | 1 |
| big follower | anything claimable | 2 |
| mayor | cities only | one per coat of arms in that city |
| abbot | monasteries only | 1 |
| phantom | anything claimable | 1 |

The mayor is the interesting one, and the reason `majority()` had to learn that
**nobody wins with zero**: a mayor in a city with no pennant is worth nothing,
so a single plain follower beats him outright. That is the whole gamble of the
piece, and it is checked in the harness.

The phantom isn't a choice of piece but a second placement: claim normally, and
if you still hold your phantom and the tile has another free feature, the turn
stays in the meeple phase to offer it.

### Farms

The one base-game feature that isn't an edge feature, and the reason the board
carries a second kind of connectivity.

Cities and roads meet along a whole tile edge, so joining them is a matter of
comparing one letter per side. Fields don't: two tiles' fields meet along
*half* an edge, which is exactly why a road running out to the tile edge splits
the field either side of it without the edge letter changing at all. So each
tile's perimeter is cut into eight half-edges, numbered clockwise from the
top-left, and a field is the list of halves it occupies:

```
    0   1
  +---+---+
7 |       | 2
  +       +
6 |       | 3
  +---+---+
    5   4
```

Crossing a seam the clockwise order reverses, so half `2s` meets the
neighbour's `2·opp+1` and half `2s+1` meets its `2·opp`. That is the whole
joining rule.

The field layout of each of the 24 base tiles is written down rather than
derived, because the derivation gets the interesting tiles wrong: on the
city-and-road-through tile the field between the city and the road wraps
*behind* the city, and on the three-way-junction tile the three roads out of
one junction make three separate fields. Both are read straight off the printed
artwork.

Which cities a field feeds **is** derived, from that same ring: a field touches
a city when one of its halves sits immediately beside a half the city owns.
That distinction matters and a simpler "same tile" test misses it — on the
city-and-road tile both fields share a tile with the city, but only the strip
above the road actually runs up against its walls.

A farm never closes and never scores during play, so its farmers never come
home. At the end, each field pays **3 points per completed city touching it** —
4 under the original rules, which is what the edition switch changes — to
whoever has the most farmers lying in it, ties included.

The computer player values a farm at what its cities will probably be worth by
the end, and treats a farmer as costing about twice an ordinary follower, since
it is spent for the rest of the game.

### Bridges

The one rule that looked like board surgery and turned out to be a tile trick.

The blocker was real: the engine derives a cell's edges from its tile type, so
a road carried *over* a field tile seemed to need per-cell edge overrides
threaded through everything. The way in was to notice what a bridge physically
is — not an edit to the landscape but a road held above it. So building a
bridge **replaces the cell's tile with a derived copy of itself**: the same
tile with one extra road feature appended after everything it already had,
and two edges relettered. The same primitive the two-faced flip already uses.

Appending *after* the fields is what makes it safe — every feature index,
meeple reference and scored-part key stays exactly where it was. And it makes
it accurate: the fields underneath are **never divided**, because the bridge
is up in the air. That's the printed rule, falling out of the implementation.

Three bridges each. After placing a tile, throw one across it or a neighbour —
both spanned edges must be open country on the tile itself (a bridge stands on
the field, never on a wall), and whatever its ends meet must be something a
road can meet. The bridge road is claimable, scores as road, and survives
rebuilds because it lives in the cell's type like everything else. The printed
trick of using a bridge to legalise an otherwise-impossible placement isn't
modelled, which is why it's marked approximate.

### What stays on the shelf, and why

Twelve rules are catalogued but deliberately not built, each for a stated
reason rather than neglect:

| rule | why not |
|---|---|
| **The Catapult** | A physical dexterity game — flicking wooden discs across a table. There is no honest digital version of it |
| **The Count** | Needs the separate 2×3 City of Carcassonne board and its district-redeploy economy |
| **Castles** | Converting a closed city into a token that scores off its neighbours' future needs an interposed choice at scoring time |
| **Bazaars** | A live auction; against bots an auto-bid would gut the point of it |
| **Ringmaster** | Rides the circus events; worth doing once the big top has more than one trick |
| **Mists over Carcassonne** | A co-operative game — a mode, not a mechanic |
| **Halflings** | Triangular tiles on a square-cell engine |
| **Wheel of Fortune** | Replaces the start tile with a whole apparatus of its own |
| **Markets of Leipzig** | Four off-board market quarters bidding for cities |
| **The Bets** | Secret simultaneous choices — nothing honest survives automating them |
| **Castles in Germany** | Double-width personal tiles placed from supply |
| **The Maps' start squares** | The border is in (the Maps toggle); the printed multi-start layouts are not |

### The edition switch

Carcassonne has been revised twice and the revisions are not cosmetic — the
farm rule in particular has been three different rules. The **Rules** dropdown
picks which edition's constants the scoring reads: the current (3rd) edition,
where the River and the Abbot are part of the base box and a field pays 3 per
completed city touching it; the 2nd; or the original 2000 printing, where a
completed city was worth 4 to the farmers feeding it, counted once from the city
rather than from each field.

Where those editions actually differ — including the 2024 anniversary relaunch
that renamed and re-mechaniced half the big boxes (The Tower became *Towers &
Thieves*, a completely different game) — is written up in
[`docs/EDITIONS.md`](docs/EDITIONS.md), which is the reference the catalogue is
checked against. It's a synthesis of WikiCarpedia's per-edition pages, fetched
by `tools/wikicarpedia.mjs`.

### What's implemented

Of the 79 rules catalogued, 67 are playable — 34 to the letter, 33 marked as honest approximations whose tooltips say exactly what was simplified. The rest are named, described, dated
and linked, waiting for an implementation.

**Workshop originals** — things this sandbox invented, or lifted out of one of
its own modes. Lifting came out of the cloud kingdom, building on top came out
of Strata, and both are more useful bolted onto Classic, or onto each other.

**Play**

| | |
|---|---|
| **Drafting market** | A face-up row instead of a blind draw. The first is free; reaching past a tile discards it, so cost needs no currency |
| **Lift placed tiles** | Instead of placing, pick up an unclaimed tile that isn't holding the board together, and play it somewhere better |
| **Build on top of tiles** | Strata's rule, anywhere. Cover a tile that hasn't scored and has nobody on it. Three levels maximum |
| **Recall a follower** | Instead of claiming, take one of your followers back off the board |
| **Two-faced tiles** | Most tiles have a reverse — a road is a city on the back. Press `F` before you place |
| **Fog of war** | Tiles far from your figures fade out |

**Scoring**

| | |
|---|---|
| **Hidden agendas** | Two secret objectives each, scored at the end. Every placement becomes a tell |
| **Rising tide** | A waterline climbs the board every three rounds, drowning whatever it reaches. It's a moving bound on the board, so nothing else needed a special case |

**Carcassonne rules**, implemented from the published ones:

| | box | |
|---|---|---|
| **The River** | mini (2001) | Laid first, spring to lake, and it may not double back on itself — two curves in a row bending the same way would make a U-turn. Only an *immediate* reversal is illegal, which is the official reading |
| **Big follower** | Exp. 1 | One large follower each, counting as two when majorities are worked out |
| **Inns** | Exp. 1 | An inn doubles its road — and pays **nothing at all** if the road never closes |
| **Cathedrals** | Exp. 1 | The same bargain for a city. Approximate: the multiplier is 1.5 on a city already paying 2 a tile, not a true 3-a-tile rewrite |
| **Trade goods** | Exp. 2 | Wine, grain and cloth go to whoever *closes* the city holding them, follower or not. Most of each at the end is worth 10 |
| **Builder** | Exp. 2 | Extend a feature you already hold and you get another tile this turn, once per turn |
| **Abbey tile** | Exp. 5 | One abbey each, played instead of your tile into a hole surrounded on all four sides. It scores as a monastery, so it's always worth 9 |
| **Wagon** | Exp. 5 | When a feature scores, your follower steps along the road to the next unclaimed, unfinished thing instead of going home |
| **Mayor** | Exp. 5 | Cities only, and worth one follower per coat of arms — so he holds nothing at all in a city with no pennant |
| **Abbot** | mini (2016) | A follower for monasteries who can be called home on your turn instead of placing, scoring his cloister as it stands. Gardens aren't modelled yet |
| **Pig** | Exp. 2 | Joins a farm you already hold and makes every completed city beside it worth 4 instead of 3 |
| **Phantom** | mini (2011) | A second follower, placed in the same turn as your first, on a different feature of the same tile |
| **Gardens** | mini (2016) | The abbot's second seat, and nobody else may take one. Closes and pays exactly as a cloister does |
| **Vineyards** | Exp. 9 | Adds 3 to any monastery it neighbours, when that monastery closes |
| **Magic portals** | Exp. 3 | Claim any unfinished, unclaimed feature *anywhere on the board* instead of the tile you just laid |
| **Princess** | Exp. 3 | Lay her into a city and send a knight already standing there home |
| **Festival** | mini (2011) | Take one of your own followers straight back off the board, instead of claiming |
| **The King** | Exp. 6 | Whoever finished the largest city scores 1 per completed city on the board at the end |
| **The Robber Baron** | Exp. 6 | The same for roads: longest one finished takes 1 per completed road |

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

### Teaching it a new mode

Reading the board is one thing; knowing what to *care* about is another, and
for a mode whose rules were invented last week nobody knows the answer —
including whoever wrote the mode. Girando's advice is therefore a block of
plain numbers, `GIRANDO_WEIGHTS`, and `tools/train.mjs` improves them by
playing the mode against itself:

```bash
node tools/train.mjs                  # a session, ~20 minutes on four cores
node tools/train.mjs --rounds 40 --games 16
node tools/train.mjs --report         # just measure the shipped weights
```

Three things about it are worth stating, because each one is a trap somebody
falls into:

- **It selects on winning, not on scoring.** "Make the bot's score as large as
  possible" is the obvious objective and it is badly wrong: both seats play the
  same mode, so anything that inflates the board inflates *both* scores. A
  weight set that closes spheres constantly scores enormously and hands the
  same enormous score to its opponent. Win rate against the incumbent is the
  only signal that separates good play from big numbers.
- **Every match is played twice with the seats swapped.** The first player lays
  the tile that starts the weather, and over sixteen games that is worth more
  than most of the weights are.
- **A challenger has to beat a margin, not merely win.** Forty games puts the
  standard error on a win rate at about eight points; a hill-climb that accepts
  noise walks away from a good answer as happily as it walks toward one.

The session prints where the trained bot's points actually came from, per game
and per colour, which is the nearest thing the workshop has to a statement of
what the winning strategy *is*. Results land in `tools/brains/`.

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
| Place tile | drag the tile off the panel, or click a highlighted cell |
| Commit a staged tile | click it again, press `Enter`, or **Place it here** |
| Take it back | `Escape`, or drag it somewhere else |
| Lift a placed tile | `L`, then click it |
| Use the big follower | `B`, then claim |
| Pick from the row | click it, or `1`–`4` |
| Rotate | `R` (or right-click, or shift+scroll) |
| Flip a two-faced tile | `F` |
| Claim a feature | click a spot on the zoomed tile, or `1`–`9` |
| Enter a city | stand on its gate, press `E` |
| Skip / hold | `Space` |
| Move a pawn | click your pawn, then a gold target |
| Pan / zoom | drag / scroll, or one finger / two |
| Recenter | `C` |
| Feature overlay | `D` |
| Hide the panel | `Tab`, or **Lean** in the header |

### Laying a tile

The default flow is drop, turn, commit. Drag the tile out of the panel (or off
the floating HUD in lean mode) and let go over a square: it *stages* there
rather than playing, drawn solid under a dashed gold ring. Only the rotations
that actually fit that square are offered — the ring says how many there are,
and `R` cycles those and nothing else, so on a square with one legal facing
there is nothing to hunt for.

**Tapping the staged tile turns it.** Every tap, as many times as you like; it
never commits. Committing is one thing and one thing only: the **✓** in the
confirm panel, which comes up in the corner where the claim step's box appears,
showing the tile big at the rotation it is actually going down at. `Enter` does
the same from a keyboard, `Escape` takes it back, and dropping somewhere else
moves the staging. Tap and tap-again used to be stage and commit, which made the
one gesture you reach for to see a tile the other way round the same gesture
that ended the decision.

Turn the confirm step off with **Confirm before placing** in the panel and a
click lays the tile the instant it lands, as it always did.

### Claiming

The corner box does two consecutive halves of the same turn — first "is this
where the tile goes?", then "what do you take on it?" — so they share it rather
than each having one. With **Zoomed claim step** on, laying a tile opens a large
copy of it there with one dot per claimable feature — a bigger target than the board
marker, and legible on a phone. A four-way road with its four fields piles its
anchors within a few pixels of each other, so the dots are pushed apart until
each is its own target and any that moved draws a thin leader back to the spot
it means. Hovering names the feature; the dots are numbered, and `1`–`9`
claims by number. The board rings the tile in question and stops drawing its
own markers while the panel is up, so there is only ever one set of targets.

### Lean mode

`Tab` (or **Lean** in the header) hides the side panel and gives the board the
whole window. What you still need follows you: a small HUD in the bottom-left
carries the tile in hand, whose turn it is, the phase, the scores, and the same
action buttons the panel would show — and the tile in it is draggable, so the
whole turn is playable without the panel. `Tab` again brings it back. On a
phone, where the panel is a bottom drawer rather than a column, lean mode
collapses the drawer the same way.

Panel settings — mechanics, tile groups, mode, bots, sound, motion, and the two
switches above — are remembered in `localStorage` between visits.

### On a touch screen

Safari keeps a ~300ms window open after every tap to see whether a second one
follows, and reads that second tap as zoom-in. Turning a tile is the one thing
you press twice in a row on purpose, so rotating in a hurry used to zoom the
whole app. Everything now carries `touch-action: manipulation`, which drops
that window — panning and pinch-zoom still work, the browser just stops
watching for a double tap — and the board, the draggable tile and the claim
canvas keep `touch-action: none` because they run their own gestures. Safari's
separate `gesture*` pinch (two fingers, or a trackpad on a Mac) is refused over
the play area for the same reason: the board zooms, not the page.

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
  once, and two that push twice as hard), sferas in green, blue, red and yellow,
  temples, windmill turbines, Abbazias, flying machines, windvanes and city end
  caps (Girando's pool)
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
node tools/train.mjs                # tune Girando's bot by self-play
node tools/train.mjs --report       # …or just measure what it does now
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
