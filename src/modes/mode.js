// ---------------------------------------------------------------------------
// The base a mode extends.
//
// Every hook has a do-nothing default, so a mode file only writes the parts it
// actually changes. `Game` calls these and never inspects `game.mode` itself.
//
//   deck()            what's in the draw pile
//   seeds()           the opening tiles on the board
//   setup()           build mode state (called after the board is seeded)
//   startTurn()       return false to take over the turn entirely
//   afterPlace(cell)  return the next phase, or null to just end the turn
//   onClosed(d, by)   a feature completed — pay for it however you like
//   endTurn/endRound  upkeep
//   actions()         the contextual buttons in the panel
//   panel()           HTML replacing the score table, or null to keep it
//
// Walking modes additionally implement `visiblePawns`, `reachable`, `select`
// and `moveSelected`, which is all the renderer needs to draw figures and
// their move targets.
// ---------------------------------------------------------------------------

import { buildDeck } from '../tiles.js';

export class Mode {
  constructor(game) {
    this.game = game;
    this.selected = null;
  }

  /** The spec object this mode was registered with. */
  get spec() { return this.constructor.spec; }
  get id() { return this.spec.id; }

  // --- setup ----------------------------------------------------------------

  deck() { return buildDeck(this.game.groups, this.game.rng, 'D'); }
  seeds() { return [{ x: 0, y: 0, id: 'D', rot: 0 }]; }
  setup() {}

  // --- turn hooks -----------------------------------------------------------

  startTurn() { return true; }
  afterPlace() { return null; }
  onClosed() {}
  endTurn() {}
  endRound() {}
  onDrowned() {}
  finish() {}

  // --- walking --------------------------------------------------------------

  isWalker = false;
  walkerKind = null;          // 'party' makes the panel and renderer act solo
  get visiblePawns() { return []; }
  reachable() { return new Map(); }
  select(pawn) { this.selected = pawn; return true; }
  moveSelected() { return false; }

  /** Which player colour a figure draws in, and whether it's the hero. */
  figureStyle(p) { return { color: p.player ?? 0, hero: !!p.hero }; }

  // --- interiors ------------------------------------------------------------

  get interior() { return null; }
  someoneStillInside() { return null; }
  interiorArrive() {}
  leaveInterior() {}

  // --- UI -------------------------------------------------------------------

  actions() { return []; }
  panel() { return null; }
  status() { return ''; }

  /** Extra per-cell paint the renderer applies — banners, heights, water. */
  cellOverlay() { return null; }
}
