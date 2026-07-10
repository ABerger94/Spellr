export interface BattlefieldCard {
  instanceId: string;
  scryfallId: string;
  tapped: boolean;
  x: number;
  y: number;
  counters?: Record<string, number>;
}

export interface ZoneState {
  library: string[];
  hand: string[];
  battlefield: BattlefieldCard[];
  graveyard: string[];
  exile: string[];
  commandZone: string[];
}

export const EMPTY_ZONES: ZoneState = {
  library: [],
  hand: [],
  battlefield: [],
  graveyard: [],
  exile: [],
  commandZone: [],
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

export type GameActionPayload =
  | { type: 'DRAW_CARD' }
  | { type: 'PLAY_CARD'; scryfallId: string; fromZone: 'hand' | 'commandZone' }
  | { type: 'TAP_CARD'; instanceId: string }
  | { type: 'UNTAP_CARD'; instanceId: string }
  | {
      type: 'MOVE_CARD';
      fromZone: keyof ZoneState;
      toZone: keyof ZoneState;
      // For battlefield source, identify by instanceId; for other zones, by scryfallId.
      instanceId?: string;
      scryfallId?: string;
      targetSeat?: number; // defaults to actor's own seat; used for e.g. giving control (future)
    }
  | { type: 'ADJUST_LIFE'; seat: number; delta: number }
  | { type: 'PASS_TURN' };
