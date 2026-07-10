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
  const index = battlefield.length;
  return { x: index % BATTLEFIELD_COLUMNS, y: Math.floor(index / BATTLEFIELD_COLUMNS) };
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
  } else {
    (next[toZone] as string[]).push(movedScryfallId);
  }

  return { zones: next, movedScryfallId };
}

export function tapCard(zones: ZoneState, instanceId: string, tapped: boolean): ZoneState {
  return {
    ...cloneZones(zones),
    battlefield: zones.battlefield.map((c) => (c.instanceId === instanceId ? { ...c, tapped } : c)),
  };
}

export function drawCard(zones: ZoneState): { zones: ZoneState; drawnScryfallId: string | null } {
  if (zones.library.length === 0) return { zones, drawnScryfallId: null };
  const result = moveCard(zones, { fromZone: 'library', toZone: 'hand' });
  return { zones: result.zones, drawnScryfallId: result.movedScryfallId };
}
