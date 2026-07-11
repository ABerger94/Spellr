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
}

export type LookMode = 'scry' | 'surveil';

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
   * each time MULLIGAN is called. When keeping a hand after N mulligans, the
   * player is expected to put N cards on the bottom of their library. */
  mulliganCount: number;
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
<<<<<<< HEAD
=======
  pendingLook: string[]; // only populated for the viewer's own seat
  pendingLookMode: LookMode | null;
  manaPool: Record<string, number>;
>>>>>>> 1fa834cf83b85c96962ca71e647fd951538a06c3
  mulliganCount: number;
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
}

export type LibraryPosition = 'top' | 'bottom';
export type LookDestination = LibraryPosition | 'graveyard';

/** The "real" card-holding zones — excludes pendingLook/pendingLookMode, which
 * are scry/surveil bookkeeping, not a zone cards can be generically moved to/from. */
export type ContentZone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'commandZone';

export type GameActionPayload =
  | { type: 'DRAW_CARD'; count?: number }
  | { type: 'MULLIGAN'; bottomCardScryfallIds?: string[] }
  | { type: 'PLAY_CARD'; scryfallId: string; fromZone: 'hand' | 'commandZone'; x?: number; y?: number }
  | { type: 'TAP_CARD'; instanceId: string }
  | { type: 'UNTAP_CARD'; instanceId: string }
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
  | { type: 'PASS_TURN' }
  | { type: 'SCRY'; count: number }
  | { type: 'SURVEIL'; count: number }
  | { type: 'RESOLVE_LOOK'; scryfallId: string; destination: LookDestination }
  | { type: 'SHUFFLE_LIBRARY' }
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
  | { type: 'END_GAME' }
  | { type: 'CHAT_MESSAGE'; text: string };
