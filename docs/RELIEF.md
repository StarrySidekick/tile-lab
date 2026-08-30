# Relief — what it would take to make the tiles actually 3D

A scoping note and a working spike. Nothing in `src/` changed; the experiment
grew up: it lives at `relief.html` in the repo root, and the game can hand it
a real board (the **View the board in relief** button in the panel).

```
node tools/relief.mjs --shots     # boots it, checks it, writes tools/shots/relief-*.png
open relief.html                  # or just look at it, and drag it about
```

## The question that actually mattered

Not "can canvas do 3D" — it can't, and that was never the problem. The problem
is `shape.js`.

The entire art system rests on one rule: **an area covers every side it
reaches, corner to corner.** That rule is what lets a tile be drawn with no
knowledge of its neighbours and still line up with them exactly, and it is
worth more than any individual drawing in the repo. Everything expensive we
might build on top of it is worthless if the rule doesn't survive the move.

So the spike was built to answer one thing: **does corner-to-corner still hold
when you push it into a third dimension?**

It does, and for the same reason it works flat. Two tiles sharing a city edge
share the whole seam with nothing left over. Extrude both outlines to the same
height and the two prisms share the whole seam too — no neighbour lookup, no
negotiation, nothing to keep in sync. Better still, `featureShape` already
hands back a `rim`, defined as "the outline minus the tile edges", which is
*precisely* the set of places a cliff face belongs. Skirt the rim and nowhere
else, and a city that continues into the next tile has no wall at the join.

Turn on **Silhouettes only** in the spike to see it: the raised tops go bone,
the cut faces go rust, and a town spanning four tiles is one unbroken plateau
with rust round the outside of the whole thing and none at all down the seams.

## What the spike is

A page of WebGL2 and no dependencies, in the same spirit as `tools/seams.html`. It imports the real tile table, the real `Board` with the
real edge matching, the real silhouettes and the real `drawTile`. Nothing was
re-authored for 3D. The only new information in the whole file is a table of
six numbers:

```js
const RELIEF = {
  city:     { h:  0.17, tex: 'full',   wall: THEME.cityWall },
  forest:   { h:  0.11, tex: 'ground', wall: THEME.forestDark },
  mountain: { h:  0.30, tex: 'ground', wall: THEME.rockDark },
  lake:     { h: -0.05, tex: 'ground', wall: THEME.waterDeep },
};
```

Three details are worth keeping whatever gets built next.

**The outline is read, not re-derived.** `featureShape` draws through a canvas
context, so the spike hands it a context that records instead of painting and
flattens the beziers on the way through. The prism therefore stands on
*precisely* the curve the 2D art is drawn against, because it is that curve.
Re-deriving the silhouette in 3D would be the fastest possible way to lose the
seam rule.

**Rotation is applied to the points, not to a matrix.** The art is drawn
unrotated and the canvas is turned to place it, so a point's position after
`rotPoint` is also its coordinate in the finished picture. One transform does
the geometry and the UV both, and the texture cannot drift out of register with
the shape.

**The ground and the architecture are drawn separately.** `drawTile` already
takes `only: 'ground' | 'built'` — it was added for the chart's two-pass ink,
and it turns out to be exactly the decomposition 3D needs. The flat tile under
everything is drawn with `only: 'ground'`, so it has the country and the roads
and no walls; the raised plateau is textured with the full picture. Without
that split every wall would be painted flat on the field *and* standing up
beside itself.

## What it proved, and what it didn't

**Proved.** The seam rule holds. Four feature types get relief from six
numbers. A 24-tile board is 46 draw calls and renders fine on SwiftShader with
no GPU at all. And straight overhead through an orthographic camera the whole
thing degenerates back to the board we already have — the ground quad *is* the
sprite — which means relief could be a camera, not a fork.

**Didn't, at first.** Four honest gaps — two of which the second round (below)
has since closed:

- **Point features get nothing.** ~~A monastery, a garden and a temple have no
  sides, so `featureShape` returns null and they stay painted flat.~~ CLOSED:
  the cloister is now a modelled church — see *Modelling from reference*.
- **The art already fakes height, and now it doubles.** ~~Roofs are a flat
  picture lying on a raised floor.~~ CLOSED for towns: the plateau is packed
  earth with modelled houses standing on it, and the painted picture is no
  longer projected onto the top at all. Still true for the mountain's rock
  shading, which remains painted.
- **A mountain is not a mesa.** Uniform extrusion gives rock a flat top, which
  reads as a plateau. Rock wants a peaked profile — a height *function* over
  the silhouette rather than a constant — which is a per-type generator, not a
  bigger number. Still open.
- **Roads stay flat**, which on inspection is correct. A cart track is a track.

## Modelling from reference

The second round took the classic tile sheet as a *reference* — not traced,
not imported, no generator — and modelled the structures that repeat on it,
in the theme's own colours, lit by the one sun. The reference teaches the
vocabulary and the proportions; the geometry is original and procedural:

- **A town** is a cluster of small gabled houses at jostled angles — mostly
  grid-ish, no two roofs quite agreeing — behind a stone curtain wall. The
  wall is the plateau's own cut face, risen past the top into a parapet with
  an inner face, so it still follows the rim and still vanishes at every seam.
  Square towers with pyramid caps stand at the points `featureShape` already
  nominates (`towers`: the middle of each stretch of rim, clear of any seam).
  Settlement is deterministic per cell, houses keep off the parapet by more
  than their own half-diagonal, and towns joining across a seam read as one
  huddle because the margin is small and the ground is shared.
- **The cloister** is a tower with a pyramid cap, a taller-than-the-nave
  proportion taken straight from the reference, a long gabled nave off its
  shoulder and a low side chapel, set a touch north of centre so tile A's
  road still arrives, and turned a few degrees off the grid because nothing
  in the reference sits square.

The whole vocabulary is three generators — `house`, `tower`, `cloister` —
plus a `settle` pass, maybe 120 lines. The loop that made it work was not the
modelling but the *looking*: render, screenshot through `tools/relief.mjs`,
compare against the reference, adjust proportions, again. Two rounds got the
cloister's massing right; no round would have got it right blind.

The round also caught a real bug the textures had been hiding since the first
spike: the ear-clipping triangulator silently dropped area on five of the
fifteen silhouettes — half the polygon, in the worst case — because a
corner-to-corner side closes the path exactly where it began and the
duplicated vertex deadlocks the classic algorithm. The fix (dedupe, and when
no ear is found remove the flattest vertex rather than giving up) was proved
by measuring triangulated area against polygon area for all fifteen
silhouettes: exact to five decimals, all of them.

## What shipping it would cost

Three rungs, and they are very different sizes.

**Rung one — the spike, kept.** Leave `relief.html` as a viewer, wire it to a
real game's board, and use it to look at a finished map. No rules, no input,
no UI. DONE: the game's panel has a **View the board in relief** button that
hands the current board over through localStorage, mid-game or finished, any
mode. The snapshot carries only `{x, y, tile id, rotation}` per cell, so a
mode's derived tile types are skipped rather than fatal.

**Rung two — relief as a camera in the real game.** This is where the cost
actually lives, and it is not in the art. `render.js` is 1,739 lines, 28
`draw*` methods, 434 `ctx.` calls and 40 uses of `toScreen`, and every one of
them assumes a tile is an axis-aligned square at a known screen rectangle.
Hit-testing (`cellAt` → `toWorld` → `Math.floor`) assumes it too, and stops
being true the moment a tower can stand in front of the tile behind it. Meeple
targets, move targets, placement hints, the fog, the fx layer and the claim
panel are all drawn in that 2D screen space. Making the board 3D means writing
a second renderer and picking against geometry — call it a rewrite of
`render.js` with `art.js`, `shape.js`, `tiles.js` and every mode untouched.
That is a real project, but it is a *bounded* one, and the boundary is exactly
one file.

**Rung three — 3D as the look.** Architecture as geometry, models for the point
features, height functions for rock, shadows that are cast rather than drawn.
This is a different game's art department and it would throw away most of
`art.js`. Not recommended, and not because it's hard: the flat board is
genuinely good, and the parchment modes are *drawn maps* — a drawn map with a
perspective camera in it is a category error, which is why the chart palette
should stay flat no matter what the rest of the board does.

**Recommendation.** Rung one is already done. Rung two is worth it if and only
if 3D is meant to be playable rather than pretty; if it's meant to be pretty, a
turntable viewer over a finished game gets ninety per cent of the pleasure for
five per cent of the work.

## On generating 3D models

Worth saying plainly, because it's the obvious next thought and it's a trap
here: image-to-3D generators (the Meshy / Tripo / Hunyuan3D family) produce a
*mesh with baked topology*. Every one of them would break the seam rule, which
is the one thing this codebase cannot give up — a generated city that doesn't
run corner to corner leaves a sliver of city facing a sliver of field at every
join, and no amount of retopology fixes it, because the constraint is per-edge
and the generator has never heard of the edge.

Where a generator genuinely would help is the gap named above: the dozen point
features. A monastery, a windmill, a shrine — small, self-contained props that
sit at a tile's centre and touch no seam. Those are exactly the objects a
generator is good at and exactly the objects the extrusion can't produce. That
is a real, narrow, useful application, and it is about a dozen models.

Everything else should keep coming out of `featureShape`.
