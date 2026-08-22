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
//   anythingLeft()    whether there's anything left to deal you
//   valueOf(d)        price a feature your own way
//   flightTargets()   extra squares a follower may go to this turn
//   botPlaceBonus()   what a computer player can't see in your scoring
//   botMoveValue()    …and what it can't see in your movement
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

  /**
   * Is there anything left to deal THIS player? The host ends the game when
   * there isn't. The default is the shared deck plus whatever's face up; a
   * mode that deals private hands has to answer for its own, because the
   * host's `market` still points at the last player who took a turn.
   */
  anythingLeft() { return this.game.deck.length > 0 || !!this.game.market?.length; }

  afterPlace() { return null; }
  onClosed() {}
  endTurn() {}
  endRound() {}
  onDrowned() {}
  finish() {}

  /**
   * Price a feature your own way, or return null to use the board's rules.
   * Girando pays a city 1 per tile, like a road.
   */
  valueOf() { return null; }

  /**
   * Extra squares a follower may be put on this turn, beyond the tile just
   * laid: `{x, y, i, f, flying}`. Girando's flying machine is the only user.
   */
  flightTargets() { return []; }

  /**
   * May a follower be put on this feature at all? The host has already checked
   * that it is claimable and unheld; this is the mode's veto on top of that.
   * Girando uses it twice over — roads are nobody's to claim any more, and an
   * island is somewhere you have to be blown or flown to.
   */
  claimAllowed() { return true; }

  /**
   * Do the farms pay at the very end, the way the base game's do? Girando says
   * no: its fields are harvested when a sphere closes and the farmers walk
   * home, so there is nothing left to count when the wind drops.
   */
  finalFarms = true;

  /**
   * Keep the follower step open even when there is nothing to claim. The host
   * skips straight past an empty claim step, which is right everywhere except
   * where the mode offers something INSTEAD of a follower — Girando's whale is
   * moved in place of putting one down, and most turns there is nothing on the
   * tile to claim anyway.
   */
  holdsMeeplePhase() { return false; }

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

  // --- advice for the computer player ---------------------------------------
  //
  // The bot in src/ai.js prices a move off the board alone: what closed, who
  // is standing in it, what the closure pays. Anything a mode scores on its
  // own books is invisible to it, so a mode that keeps score its own way says
  // so here rather than the bot growing a switch statement on mode ids.
  //
  // Both return POINTS, on the same scale as everything else the bot counts.

  /** What laying these cells is worth to `player`, beyond what closed. */
  botPlaceBonus() { return 0; }

  /** What walking `pawn` to `dest` is worth. Walking modes want this one. */
  botMoveValue() { return 0; }

  /**
   * A move that REPLACES the turn rather than decorating it. Return true if
   * you took it. Asked once, before the bot starts pricing squares, because
   * "moor the ship instead of building" is a decision only the mode can price.
   */
  botAction() { return false; }

  // --- UI -------------------------------------------------------------------

  actions() { return []; }
  panel() { return null; }
  status() { return ''; }

  /** Extra per-cell paint the renderer applies — banners, heights, water. */
  cellOverlay() { return null; }
}
