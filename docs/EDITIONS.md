# Carcassonne editions, and where the rules actually differ

This is the reference the catalogue in `src/mechanics.js` is checked against.
It is a synthesis, in our own words, of the edition-by-edition rules on
[WikiCarpedia](https://wikicarpedia.com/car/Main_Page) — the one source that
keeps a separate page per edition, which the publisher's own rulebooks (only
ever the current one) do not. `tools/wikicarpedia.mjs` fetches those pages into
a gitignored cache; nothing copyrighted is committed, only this summary and the
list of URLs it came from.

The wiki's shorthand for the editions:

| tag | years | what it is |
|---|---|---|
| **C1** | 2000–2016 | first edition (and its long life) |
| **C2** | 2014–2023 | the redesign |
| **C3** | 2020– | third edition; base + River + Abbot in one box |
| **C3.1** | 2024– | the 25th-anniversary relaunch — where a lot changed |

The workshop's edition switch (`RULESETS`) only carries the constants the
engine reads — today that is the farm rule. Everything else here is recorded so
the catalogue's notes and `since` fields stay honest, and as the spec to build
against when a `planned` rule gets implemented.

## The farm rule has been three different rules

This is the one that matters most, because it is the one the game implements,
and the one a casual "1st edition = 4 points" gets wrong.

- **Original 2000 printing.** Scored *from the city*: for each completed city,
  whoever had the most farmers adjacent to it scored **4**, and each city was
  counted **once**. A city bordering two of your farms paid you for one of them.
- **Every edition since (revised C1, C2, C3, C3.1).** Scored *from the field*:
  each field pays **3** for every completed city touching it, and one city can
  pay several different fields. This is the rule in the game now.

So our three rulesets are: current (3/field), 2nd (3/field, identical for farms),
and original-2000 (4). The engine scores per field throughout, so the
original-2000 option is an **approximation** — 4 per field, not the true
4-per-city-once — and its note says so.

Incomplete cities never feed a farm, in any edition. The farmer never comes home.

## The 2024/25 relaunch (C3.1) renamed and re-mechaniced the big boxes

The anniversary relaunch kept the ten expansion *numbers* but renamed most of
them, and several are a **different game**, not a reprint. This is the "some 3.1
rule sets are entirely different" the project was warned about.

| # | Through 2023 | C3.1 (2024/25) | Really changed? |
|---|---|---|---|
| 1 | Inns & Cathedrals | *Inns & Cathedrals* | Incomplete inn/cathedral now scores **1/tile** instead of **0**; 18→24 tiles |
| 2 | Traders & Builders | *Traders & Builders* | Builder now rides a meeple; **pig overhauled** (see below); wine→chickens |
| 3 | The Princess & the Dragon | **Dragon & Fairy** | Dragon movement changed, fairy bonus changed, **princess removed** |
| 4 | The Tower | **Towers & Thieves** | **Whole mechanic replaced** — build towers, post watchmen, thieves score them; no more capture-and-ransom |
| 5 | Abbey & Mayor | **Messengers & Mayors** | Re-theme |
| 6 | Count, King & Robber | **Jousts & Crests** | "Completely redefined" per the wiki |
| 7 | The Catapult | **Siege & Defense** | The catapult (C1-only dexterity game) never returned; its slot was reused |
| 8 | Bridges, Castles & Bazaars | **Castles & Bridges** | **Bazaars removed, barns added**; bridges now grey; castle → "maiden" scoring |
| 9 | Hills & Sheep | **Sheep & Shepherds** | **Hills removed, geese added**; vineyards now also boost gardens |
| 10 | Under the Big Top | **Circus & Artists** | Re-theme |

The pig is the clearest "not a tweak": pre-2025 it made each completed city on
your field worth **4 instead of 3**, scored at the end, needing field majority.
The **C3.1 pig** scores **immediately** the moment any city with a coat of arms
completes anywhere — 3 per completed city on its field, majority irrelevant —
then leaves, and scores **nothing** at the end.

## Smaller edition diffs worth knowing

- **The Messages (mini #2).** C3.1 caps you at resolving **one** message tile
  per turn; before, a second scoring in the same turn could trigger a second.
- **Monasteries (regional packs).** The side-laid-meeple placement was called
  "abbot" in C1/C2 and renamed **"claustral prior"** in C3 to stop clashing
  with the Abbot expansion's abbot. Same rule, different word.
- **Bridges/Castles (C1 vs C2).** C1 gave each player a fixed personal allotment
  of bridges and castles; C2 pooled them in a shared supply.
- **Count, King & Robber (C1 vs C2).** The City of Carcassonne was 12
  quarter-tiles with a redeploy mechanic in C1; in C2 it became two large 2×3
  tiles plus a wooden Count who blocks removal. King/Robber scoring (1 per
  completed city / road) is unchanged.
- **Flying Machines, Ferries, Gold Mines, Mage & Witch, Robbers, Crop Circles,
  River.** Essentially unchanged across editions — only wording and art.

## Rules a naive catalogue gets wrong (checked against the wiki)

- The **dragon** moves exactly **6 tiles**, one step at a time with players
  taking turns choosing each step — it does not home in on the nearest meeple.
- The **King** scores per completed **city**, the **Robber** per completed
  **road** (frequently swapped).
- The **fairy** has two separate bonuses: **+1** at the start of your turn if
  adjacent, and **+3** when the adjacent meeple's feature scores (paid with or
  without majority).
- The **abbot** goes on a monastery **or a garden** (ordinary meeples can't take
  gardens) and can be recalled early to score the monastery as it stands.
- **The Catapult** is a C1-only dexterity mini-game and was never reprinted;
  listing it as a current expansion is wrong.

## Numbering, for reference

- **Majors, Exp. 1–10:** Inns & Cathedrals · Traders & Builders · Princess &
  the Dragon · The Tower · Abbey & Mayor · Count, King & Robber · The Catapult ·
  Bridges, Castles & Bazaars · Hills & Sheep · Under the Big Top.
- **Minis, #1–#7:** Flying Machines · Messages · Ferries · Gold Mines ·
  Magicians (Mage & Witch) · Robbers · Crop Circles.
- "Ghosts, Castles & Cemeteries" is sometimes called the 11th major; HiG
  confirmed (Dec 2025) it is **not** official.

## Not modelled, and out of scope for the base catalogue

Whole separate games that share the tile-laying idea but are not expansions:
Hunters & Gatherers, South Seas, Amazonas, Gold Rush, Safari, The Castle, The
City, Star Wars, New World, Cardcassonne, The Dice Game, My First Carcassonne,
Winter Edition. These are deliberately absent from the catalogue.
