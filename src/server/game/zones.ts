import { v4 as uuidv4 } from 'uuid';
import type { ZoneState, BattlefieldCard } from '@/types/game';

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BATTLEFIELD_COLUMNS = 8;

function nextBattlefieldSlot(battlefield: BattlefieldCard[]): { x: number; y: number } {
  const occupied = new Set(battlefield.map((c) => `${c.x},${c.y}`));
  for (let index = 0; ; index++) {
    const x = index % BATTLEFIELD_COLUMNS;
    const y = Math.floor(index / BATTLEFIELD_COLUMNS);
    if (!occupied.has(`${x},${y}`)) return { x, y };
  }
}

function cloneZones(zones: ZoneState): ZoneState {
  return {
    library: [...zones.library],
    hand: [...zones.hand],
    battlefield: zones.battlefield.map((c) => ({ ...c })),
    graveyard: [...zones.graveyard],
    exile: [...zones.exile],
    commandZone: [...zones.commandZone],
  };
}

export interface MoveCardParams {
  fromZone: keyof ZoneState;
  toZone: keyof ZoneState;
  /** Required when fromZone is 'battlefield'. */
  instanceId?: string;
  /** Identifies the card in non-battlefield source zones; omit to take the top (index 0). */
  scryfallId?: string;
}

export interface MoveCardResult {
  zones: ZoneState;
  movedScryfallId: string;
}

export function moveCard(zones: ZoneState, params: MoveCardParams): MoveCardResult {
  const { fromZone, toZone } = params;
  const next = cloneZones(zones);
  let movedScryfallId: string;

  if (fromZone === 'battlefield') {
    const idx = next.battlefield.findIndex((c) => c.instanceId === params.instanceId);
    if (idx === -1) throw new Error('Card not found on battlefield');
    movedScryfallId = next.battlefield[idx].scryfallId;
    next.battlefield.splice(idx, 1);
  } else {
    const arr = next[fromZone] as string[];
    const idx = params.scryfallId ? arr.indexOf(params.scryfallId) : 0;
    if (idx === -1 || arr.length === 0) {
      throw new Error(`Card not found in ${fromZone}`);
    }
    movedScryfallId = arr[idx];
    arr.splice(idx, 1);
  }

  if (toZone === 'battlefield') {
    const { x, y } = nextBattlefieldSlot(next.battlefield);
    next.battlefield.push({ instanceId: uuidv4(), scryfallId: movedScryfallId, tapped: false, x, y });
  } else if (toZone === 'library') {
    // index 0 is the top of the library; cards entering the library (e.g. a
    // "return to top of library" effect) go on top, matching where drawCard reads from.
    next.library.unshift(movedScryfallId);
  } else {
    (next[toZone] as string[]).push(movedScryfallId);
  }

  return { zones: next, movedScryfallId };
}

export function tapCard(zones: ZoneState, instanceId: string, tapped: boolean): ZoneState {
  if (!zones.battlefield.some((c) => c.instanceId === instanceId)) {
    throw new Error('Card not found on battlefield');
  }
  return {
    ...cloneZones(zones),
    battlefield: zones.battlefield.map((c) => (c.instanceId === instanceId ? { ...c, tapped } : c)),
  };
}

export interface MulliganResult {
  zones: ZoneState;
  drawnScryfallIds: string[];
}

export function mulliganHand(zones: ZoneState, bottomCardCount: number, bottomCardScryfallIds?: Array<string | null> | null): MulliganResult {
  const next = cloneZones(zones);
  const handCards = [...next.hand];
  const bottomCards: string[] = [];

  for (const scryfallId of bottomCardScryfallIds ?? []) {
    if (!scryfallId) continue;
    const index = handCards.indexOf(scryfallId);
    if (index === -1) throw new Error('Card not found in hand');
    bottomCards.push(handCards.splice(index, 1)[0]);
  }

  next.library = shuffle([...next.library, ...handCards]);
  if (bottomCards.length > 0) next.library.push(...bottomCards);

  const drawnScryfallIds = next.library.splice(0, 7);
  next.hand = drawnScryfallIds;
  return { zones: next, drawnScryfallIds };
}

export function drawCard(zones: ZoneState): { zones: ZoneState; drawnScryfallId: string | null } {
  if (zones.library.length === 0) return { zones, drawnScryfallId: null };
  const result = moveCard(zones, { fromZone: 'library', toZone: 'hand' });
  return { zones: result.zones, drawnScryfallId: result.movedScryfallId };
}
