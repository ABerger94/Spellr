export interface BattlefieldCard {
  instanceId: string;
  scryfallId: string;
  tapped: boolean;
  x: number;
  y: number;
  counters?: Record<string, number>;
}

export type LookMode = 'scry' | 'surveil';

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
};

export interface CardFacts {
  scryfallId: string;
  name: string;
  imageNormal: string | null;
  typeLine: string | null;
  manaCost: string | null;
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
  hand: string[] | null; // full contents only for the viewer's own seat
  handCount: number;
  pendingLook: string[]; // only populated for the viewer's own seat
  pendingLookMode: LookMode | null;
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
}

export type LibraryPosition = 'top' | 'bottom';
export type LookDestination = LibraryPosition | 'graveyard';

/** The "real" card-holding zones — excludes pendingLook/pendingLookMode, which
 * are scry/surveil bookkeeping, not a zone cards can be generically moved to/from. */
export type ContentZone = 'library' | 'hand' | 'battlefield' | 'graveyard' | 'exile' | 'commandZone';

export type GameActionPayload =
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_CARD'; scryfallId: string; fromZone: 'hand' | 'commandZone' }
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
    }
  | { type: 'ADJUST_LIFE'; seat: number; delta: number }
  | { type: 'PASS_TURN' }
  | { type: 'SCRY'; count: number }
  | { type: 'SURVEIL'; count: number }
  | { type: 'RESOLVE_LOOK'; scryfallId: string; destination: LookDestination };
