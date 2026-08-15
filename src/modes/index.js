// ---------------------------------------------------------------------------
// The mode registry.
//
// Adding a mode is: write src/modes/<name>.js exporting a class that extends
// Mode plus a `.spec`, then add it to the list below. Nothing else in the
// codebase needs to know it exists — `game.js` runs the phase machine off the
// hooks, `main.js` builds the dropdown and panel from the specs, and the
// renderer asks the mode what to draw.
//
// Ordered roughly as: the classics, then the placement experiments, then the
// long-form ones.
// ---------------------------------------------------------------------------

import { Classic } from './classic.js';
import { Expedition } from './expedition.js';
import { Adventure } from './adventure.js';
import { Duel } from './duel.js';
import { Cirrus } from './cirrus.js';
import { Sprawl } from './sprawl.js';
import { Strata } from './strata.js';
import { Marches } from './marches.js';
import { Descent } from './descent.js';
import { Chronicle } from './chronicle.js';
import { Tesserae } from './tesserae.js';
import { World } from './world.js';

export const MODES = [
  Classic, World, Duel, Sprawl, Strata, Cirrus,
  Marches, Expedition, Adventure, Descent, Chronicle, Tesserae,
].map((M) => M.spec);

export const MODE_BY_ID = Object.fromEntries(MODES.map((s) => [s.id, s]));
