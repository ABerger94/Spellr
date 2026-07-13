export interface BattlefieldCard {
  instanceId: string;
  scryfallId: string;
  tapped: boolean;
  /** Freeform position as a percentage (0-100) of the battlefield container's width/height. */
  x: number;
  y: number;
  counters?: Record<string, number>;
  /** True when a two-sided (transform/MDFC) card is showing its back face. */
  transformed?: boolean;
  /** instanceId of another battlefield card this one is attached to (e.g. an
   * aura/equipment on a creature) — rendered stacked underneath its host. */
  attachedTo?: string | null;
  /** True for a token (Treasure, Clue, 1/1 Soldier, ...) created directly
   * onto the battlefield rather than played from hand — tokens cease to
   * exist when removed rather than moving to another zone. */
  isToken?: boolean;
  /** Combat helper: what this card is declared as attacking, if anything —
   * either a player's face or one of their planeswalkers/battles. Cleared
   * automatically at the end of the attacking player's turn. No damage math
   * happens automatically; this is bookkeeping only, same philosophy as the
   * rest of the table. */
  attacking?: { targetType: 'player' | 'planeswalker'; targetSeat: number; targetInstanceId?: string };
  /** Combat helper: instanceIds of attacking cards (anywhere in the game)
   * this card is declared as blocking. An array since multiple attackers
   * could theoretically be blocked by one creature with the right ability. */
  blocking?: string[];
}

/** 'reorder' is a Sensei's Divining Top-style look: no destination choice per
 * card, just rearranging the looked-at cards and putting all of them back on
 * top in the chosen order — resolved in one shot via CONFIRM_REORDER rather
 * than the one-card-at-a-time RESOLVE_LOOK flow scry/surveil use. */
export type LookMode = 'scry' | 'surveil' | 'reorder';

export type ManaColor = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

export interface ZoneState {
  library: string[];
  hand: string[];
  battlefield: BattlefieldCard[];
  graveyard: string[];
  exile: string[];
  commandZone: string[];
  /** Cards temporarily pulled off the top of the library for a scry/surveil in progress. */
  pendingLook: string[];
  pendingLookMode: LookMode | null;
  /** Floating mana pool, keyed by color (W/U/B/R/G/C). */
  manaPool: Record<string, number>;
  /** Number of mulligans taken this game — reset on a fresh deal, incremented
   * each time MULLIGAN is called. The first mulligan is free; see
   * mulliganCardsOwed for how many cards a kept hand owes on the bottom. */
  mulliganCount: number;
  /** Whether this player has played a land this turn — bookkeeping only
   * (nothing blocks a second land play), but surfaced to the AI so it
   * reliably takes its land drop instead of skipping it. Reset to false for
   * whoever's turn is starting whenever PASS_TURN fires. */
  landPlayedThisTurn: boolean;
}

/** The first mulligan each game is free (fresh 7, nothing owed) — each one
 * after that costs one more card on the bottom of the library once the
 * player keeps: 2nd mulligan owes 1, 3rd owes 2, and so on. */
export function mulliganCardsOwed(mulliganCount: number): number {
  return Math.max(0, mulliganCount - 1);
}

export const EMPTY_ZONES: ZoneState = {
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  commandZone: [],
  pendingLook: [],
  pendingLookMode: null,
  manaPool: {},
  mulliganCount: 0,
  landPlayedThisTurn: false,
};

export interface CardFace {
  name: string;
  imageNormal: string | null;
  typeLine: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
}

export interface CardFacts {
  scryfallId: string;
  name: string;
  imageNormal: string | null;
  typeLine: string | null;
  manaCost: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
  /** The other face of a two-sided (transform/MDFC) card, if any. */
  backFace?: CardFace | null;
}

export interface PlayerStateView {
  seat: number;
  userId: string | null;
  displayName: string;
  isAI: boolean;
  connected: boolean;
  life: number;
  counters: Record<string, number>;
  commanderDamage: Record<string, number>;
  battlefield: BattlefieldCard[];
  graveyard: string[];
  exile: string[];
  commandZone: string[];
  libraryCount: number;
  library: string[] | null; // full contents only for the viewer's own seat
  hand: string[] | null; // full contents only for the viewer's own seat
  handCount: number;
  pendingLook: string[]; // only populated for the viewer's own seat
  pendingLookMode: LookMode | null;
  manaPool: Record<string, number>;
  mulliganCount: number;
  landPlayedThisTurn: boolean;
}

export interface GameStateView {
  gameId: string;
  format: 'ONE_V_ONE' | 'COMMANDER';
  status: 'LOBBY' | 'ACTIVE' | 'FINISHED';
  currentTurnSeat: number | null;
  turnNumber: number;
  viewerSeat: number | null;
  players: PlayerStateView[];
  cards: Record<string, CardFacts>;
  /** Whether the server has a GEMINI_API_KEY configured — when false, every
   * AI seat will just pass its turn instead of playing. Surfaced so players
   * can tell "AI is intentionally sitting out" apart from "AI is broken". */
  aiEnabled: boolean;
  /** Every non-built-in counter type name any card in this game has ever
   * used — table-wide, so it shows up as a quick-pick option on every card,
   * not just the one it was first typed on, and stays listed even after
   * every card's count of it returns to zero. */
  customCounterTypes: string[];
}

export type LibraryPosition = 'top' | 'bottom';
export type LookDestination = LibraryPosition | 'graveyard';

/** The "real" card-holding zones — excludes pendingLook/pendingLookMode, which
 * are scry/surveil bookkeeping, not a zone cards can be generically moved to/from. */
export type ContentZone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'commandZone';

export type GameActionPayload =
  | { type: 'DRAW_CARD'; count?: number }
  | { type: 'PLAY_CARD'; scryfallId: string; fromZone: 'hand' | 'commandZone'; x?: number; y?: number; transformed?: boolean }
  | { type: 'TAP_CARD'; instanceId: string }
  | { type: 'UNTAP_CARD'; instanceId: string }
  /** Multi-select helper: taps or untaps every listed card in one shot, so a
   * group selected via battlefield drag-select can be toggled together
   * instead of one card at a time. */
  | { type: 'SET_GROUP_TAPPED'; instanceIds: string[]; tapped: boolean }
  | {
      type: 'MOVE_CARD';
      fromZone: ContentZone;
      toZone: ContentZone;
      // For battlefield source, identify by instanceId; for other zones, by scryfallId.
      instanceId?: string;
      scryfallId?: string;
      targetSeat?: number; // defaults to actor's own seat; used for e.g. giving control (future)
      position?: LibraryPosition; // only meaningful when toZone === 'library'; defaults to 'top'
      // Freeform battlefield drop position (percentage 0-100); only meaningful when toZone === 'battlefield'.
      x?: number;
      y?: number;
    }
  | { type: 'ADJUST_LIFE'; seat: number; delta: number }
  | { type: 'ADJUST_COMMANDER_DAMAGE'; seat: number; fromSeat: number; delta: number }
  | { type: 'ADJUST_PLAYER_COUNTER'; seat: number; counterType: string; delta: number }
  | { type: 'PASS_TURN' }
  | { type: 'SCRY'; count: number }
  | { type: 'SURVEIL'; count: number }
  | { type: 'RESOLVE_LOOK'; scryfallId: string; destination: LookDestination }
  | { type: 'REORDER_TOP'; count: number }
  | { type: 'CONFIRM_REORDER'; order: string[] }
  | { type: 'SHUFFLE_LIBRARY' }
  | { type: 'SEARCH_LIBRARY' }
  | { type: 'UNTAP_ALL' }
  | { type: 'RESET_LIFE' }
  | { type: 'RESET_BOARD' }
  | { type: 'RESTART_GAME' }
  | { type: 'MILL'; count: number }
  | { type: 'RANDOM_DISCARD' }
  | { type: 'REVEAL_HAND' }
  | { type: 'MULLIGAN' }
  | { type: 'ROLL_DICE'; sides: number }
  | { type: 'FLIP_COIN' }
  | { type: 'ADJUST_COUNTER'; instanceId: string; counterType: string; delta: number }
  | { type: 'FLIP_CARD'; instanceId: string }
  | { type: 'ATTACH_CARD'; instanceId: string; targetInstanceId: string | null }
  | { type: 'ADJUST_MANA'; color: ManaColor; delta: number }
  | { type: 'EMPTY_MANA_POOL' }
  | { type: 'CREATE_TOKEN'; scryfallId: string; x?: number; y?: number }
  | { type: 'REMOVE_TOKEN'; instanceId: string }
  | {
      type: 'DECLARE_ATTACK';
      instanceId: string;
      targetType: 'player' | 'planeswalker';
      targetSeat: number;
      targetInstanceId?: string;
    }
  | { type: 'CANCEL_ATTACK'; instanceId: string }
  | { type: 'DECLARE_BLOCK'; instanceId: string; attackerInstanceId: string }
  | { type: 'CANCEL_BLOCK'; instanceId: string; attackerInstanceId: string }
  | { type: 'CLEAR_MY_COMBAT' }
  | { type: 'END_GAME' }
  | { type: 'CHAT_MESSAGE'; text: string };
