import { v4 as uuidv4 } from 'uuid';
import type { ZoneState, BattlefieldCard, ContentZone, LookMode, LookDestination } from '@/types/game';

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const BATTLEFIELD_COLUMNS = 8;
const COLUMN_WIDTH_PERCENT = 11;
const ROW_HEIGHT_PERCENT = 20;

function clampPercent(n: number): number {
  return Math.min(100, Math.max(0, n));
}

/** Picks a default slot (as a percentage position) for a card newly entering
 * the battlefield without an explicit drop position. */
function nextBattlefieldSlot(battlefield: BattlefieldCard[]): { x: number; y: number } {
  const occupied = new Set(battlefield.map((c) => `${Math.round(c.x)},${Math.round(c.y)}`));
  for (let index = 0; ; index++) {
    const x = (index % BATTLEFIELD_COLUMNS) * COLUMN_WIDTH_PERCENT;
    const y = Math.floor(index / BATTLEFIELD_COLUMNS) * ROW_HEIGHT_PERCENT;
    if (!occupied.has(`${Math.round(x)},${Math.round(y)}`)) return { x, y };
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
    // Fall back for rows persisted before these fields existed.
    pendingLook: [...(zones.pendingLook ?? [])],
    pendingLookMode: zones.pendingLookMode ?? null,
    manaPool: { ...(zones.manaPool ?? {}) },
    mulliganCount: zones.mulliganCount ?? 0,
  };
}

export interface MoveCardParams {
  fromZone: ContentZone;
  toZone: ContentZone;
  /** Required when fromZone is 'battlefield'. */
  instanceId?: string;
  /** Identifies the card in non-battlefield source zones; omit to take the top (index 0). */
  scryfallId?: string;
  /** Only meaningful when toZone is 'library'; defaults to 'top'. */
  position?: 'top' | 'bottom';
  /** Freeform drop position (percentage 0-100); only meaningful when toZone is 'battlefield'. */
  x?: number;
  y?: number;
  /** Whether this permanent should enter tapped; only meaningful when toZone is 'battlefield'. */
  enterTapped?: boolean;
}

export interface MoveCardResult {
  zones: ZoneState;
  movedScryfallId: string;
}

export function moveCard(zones: ZoneState, params: MoveCardParams): MoveCardResult {
  const { fromZone, toZone } = params;
  const next = cloneZones(zones);

  // Repositioning a card within the battlefield (e.g. dragging it to a new
  // spot) must preserve its identity/tapped state/counters, not re-enter it
  // as a brand-new permanent — handle it as its own case up front.
  if (fromZone === 'battlefield' && toZone === 'battlefield') {
    const idx = next.battlefield.findIndex((c) => c.instanceId === params.instanceId);
    if (idx === -1) throw new Error('Card not found on battlefield');
    const existing = next.battlefield[idx];
    const x = params.x !== undefined ? clampPercent(params.x) : existing.x;
    const y = params.y !== undefined ? clampPercent(params.y) : existing.y;
    // A manual drag to an explicit spot picks the card up and sets it back
    // down — if it was attached to something, that comes loose. (Dragging
    // it onto another card to re-attach is handled separately, via ATTACH_CARD.)
    const attachedTo = params.x !== undefined || params.y !== undefined ? undefined : existing.attachedTo;
    next.battlefield[idx] = { ...existing, x, y, attachedTo };
    return { zones: next, movedScryfallId: existing.scryfallId };
  }

  let movedScryfallId: string;

  if (fromZone === 'battlefield') {
    const idx = next.battlefield.findIndex((c) => c.instanceId === params.instanceId);
    if (idx === -1) throw new Error('Card not found on battlefield');
    movedScryfallId = next.battlefield[idx].scryfallId;
    next.battlefield.splice(idx, 1);
    // Anything attached to a card that just left the battlefield comes loose
    // rather than pointing at a card that no longer exists.
    next.battlefield = next.battlefield.map((c) =>
      c.attachedTo === params.instanceId ? { ...c, attachedTo: undefined } : c,
    );
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
    const pos =
      params.x !== undefined && params.y !== undefined
        ? { x: clampPercent(params.x), y: clampPercent(params.y) }
        : nextBattlefieldSlot(next.battlefield);
    next.battlefield.push({ instanceId: uuidv4(), scryfallId: movedScryfallId, tapped: params.enterTapped ?? false, x: pos.x, y: pos.y });
  } else if (toZone === 'library') {
    // index 0 is the top of the library, matching where drawCard reads from.
    // Cards entering the library default to the top unless bottom is requested.
    if (params.position === 'bottom') {
      next.library.push(movedScryfallId);
    } else {
      next.library.unshift(movedScryfallId);
    }
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

export function mulliganWithBottomCards(
  zones: ZoneState,
  bottomCardCount: number,
  bottomCardScryfallIds?: Array<string | null> | null,
): MulliganResult {
  const next = cloneZones(zones);
  const handCards = [...next.hand];
  const bottomCards: string[] = [];

  for (const scryfallId of bottomCardScryfallIds ?? []) {
    if (!scryfallId) continue;
    const index = handCards.indexOf(scryfallId);
    if (index === -1) throw new Error('Card not found in hand');
    bottomCards.push(handCards.splice(index, 1)[0]);
  }

  if (bottomCards.length !== bottomCardCount) {
    throw new Error(`Choose ${bottomCardCount} card${bottomCardCount === 1 ? '' : 's'} to put on the bottom of your library`);
  }

  next.library = shuffle([...next.library, ...handCards]);
  if (bottomCards.length > 0) next.library.push(...bottomCards);

  const drawnScryfallIds = next.library.splice(0, OPENING_HAND_SIZE);
  next.hand = drawnScryfallIds;
  next.mulliganCount += 1;
  return { zones: next, drawnScryfallIds };
}

export function untapAll(zones: ZoneState): ZoneState {
  return {
    ...cloneZones(zones),
    battlefield: zones.battlefield.map((c) => ({ ...c, tapped: false })),
  };
}

const PLUS_ONE_COUNTER = '+1/+1';
const MINUS_ONE_COUNTER = '-1/-1';

/** Adds (or with a negative delta, removes) counters of the given type on a
 * battlefield card. Counts never go below zero, and a zeroed-out type is
 * dropped entirely rather than left at 0. +1/+1 and -1/-1 counters cancel
 * each other out in matching pairs, per MTG rule 122.3. */
export function adjustCounter(zones: ZoneState, instanceId: string, counterType: string, delta: number): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = next.battlefield[idx];
  const counters = { ...(card.counters ?? {}) };

  const updated = Math.max(0, (counters[counterType] ?? 0) + delta);
  if (updated === 0) delete counters[counterType];
  else counters[counterType] = updated;

  if (counters[PLUS_ONE_COUNTER] && counters[MINUS_ONE_COUNTER]) {
    const cancel = Math.min(counters[PLUS_ONE_COUNTER], counters[MINUS_ONE_COUNTER]);
    counters[PLUS_ONE_COUNTER] -= cancel;
    counters[MINUS_ONE_COUNTER] -= cancel;
    if (counters[PLUS_ONE_COUNTER] === 0) delete counters[PLUS_ONE_COUNTER];
    if (counters[MINUS_ONE_COUNTER] === 0) delete counters[MINUS_ONE_COUNTER];
  }

  next.battlefield[idx] = { ...card, counters };
  return next;
}

/** Flips a two-sided (transform/MDFC) card on the battlefield to its other face. */
export function flipCard(zones: ZoneState, instanceId: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');
  const next = cloneZones(zones);
  next.battlefield[idx] = { ...next.battlefield[idx], transformed: !next.battlefield[idx].transformed };
  return next;
}

/** Attaches a card to another battlefield card (e.g. an aura/equipment onto a
 * creature), or detaches it when targetInstanceId is null. Attachment is a
 * single level deep — a card that's already a host, or already attached to
 * something, can't be chosen as a new target — so stacks can't chain or loop. */
export function attachCard(zones: ZoneState, instanceId: string, targetInstanceId: string | null): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  if (targetInstanceId !== null) {
    if (targetInstanceId === instanceId) throw new Error('A card cannot be attached to itself');
    const target = zones.battlefield.find((c) => c.instanceId === targetInstanceId);
    if (!target) throw new Error('Target card not found on battlefield');
    if (target.attachedTo) throw new Error('Cannot attach to a card that is itself attached to something');
    if (zones.battlefield.some((c) => c.attachedTo === instanceId)) {
      throw new Error('Cannot attach a card that already has cards attached to it');
    }
  }

  const next = cloneZones(zones);
  next.battlefield[idx] = { ...next.battlefield[idx], attachedTo: targetInstanceId ?? undefined };
  return next;
}

/** Floats (or with a negative delta, spends/removes) mana of a given color
 * in the player's mana pool. Never goes below zero, and a zeroed-out color
 * is dropped entirely rather than left at 0. */
export function adjustMana(zones: ZoneState, color: string, delta: number): ZoneState {
  const next = cloneZones(zones);
  const updated = Math.max(0, (next.manaPool[color] ?? 0) + delta);
  if (updated === 0) delete next.manaPool[color];
  else next.manaPool[color] = updated;
  return next;
}

/** Clears every color out of the mana pool at once (e.g. end of phase/turn cleanup). */
export function emptyManaPool(zones: ZoneState): ZoneState {
  return { ...cloneZones(zones), manaPool: {} };
}

export function shuffleLibrary(zones: ZoneState): ZoneState {
  return { ...cloneZones(zones), library: shuffle(zones.library) };
}

const MAX_DRAW_COUNT = 40;

/** Draws up to `count` cards, stopping early (without error) if the library
 * runs out partway through — that's a legitimate game state, not a bug. */
export function drawCards(zones: ZoneState, count: number): { zones: ZoneState; drawnScryfallIds: string[] } {
  const clamped = Math.min(Math.max(1, Math.floor(count)), MAX_DRAW_COUNT);
  let current = zones;
  const drawn: string[] = [];
  for (let i = 0; i < clamped && current.library.length > 0; i++) {
    const result = moveCard(current, { fromZone: 'library', toZone: 'hand' });
    current = result.zones;
    drawn.push(result.movedScryfallId);
  }
  return { zones: current, drawnScryfallIds: drawn };
}

/** Mills up to `count` cards from the top of the library to the graveyard,
 * stopping early (without error) if the library runs out. */
export function millCards(zones: ZoneState, count: number): { zones: ZoneState; milledScryfallIds: string[] } {
  const clamped = Math.min(Math.max(1, Math.floor(count)), MAX_DRAW_COUNT);
  let current = zones;
  const milled: string[] = [];
  for (let i = 0; i < clamped && current.library.length > 0; i++) {
    const result = moveCard(current, { fromZone: 'library', toZone: 'graveyard' });
    current = result.zones;
    milled.push(result.movedScryfallId);
  }
  return { zones: current, milledScryfallIds: milled };
}

/** Discards a uniformly random card from hand. */
export function randomDiscard(zones: ZoneState): { zones: ZoneState; discardedScryfallId: string } {
  if (zones.hand.length === 0) throw new Error('Your hand is empty');
  const scryfallId = zones.hand[Math.floor(Math.random() * zones.hand.length)];
  const { zones: next } = moveCard(zones, { fromZone: 'hand', toZone: 'graveyard', scryfallId });
  return { zones: next, discardedScryfallId: scryfallId };
}

export const OPENING_HAND_SIZE = 7;

/** London mulligan: shuffle the current hand back into the library, draw a
 * fresh 7, and record that a mulligan was taken. The player is expected to
 * put a number of cards equal to zones.mulliganCount on the bottom of their
 * library once they keep — nothing here enforces that part, same as every
 * other judgment call on this virtual tabletop. */
export function mulligan(zones: ZoneState): ZoneState {
  const { zones: nextZones } = mulliganWithBottomCards(zones, 0, []);
  return nextZones;
}

const MAX_LOOK_COUNT = 20;

/** Pulls the top `count` cards of the library into pendingLook for a scry/surveil. */
export function startLook(zones: ZoneState, count: number, mode: LookMode): ZoneState {
  if (zones.pendingLook.length > 0) {
    throw new Error(`Resolve your current ${zones.pendingLookMode ?? 'look'} before starting another one`);
  }
  if (!Number.isInteger(count) || count < 1) {
    throw new Error('Count must be a positive whole number');
  }
  const clamped = Math.min(count, zones.library.length, MAX_LOOK_COUNT);
  const next = cloneZones(zones);
  next.pendingLook = next.library.splice(0, clamped);
  next.pendingLookMode = mode;
  return next;
}

const ALLOWED_DESTINATIONS: Record<LookMode, LookDestination[]> = {
  scry: ['top', 'bottom'],
  surveil: ['top', 'graveyard'],
};

/** Resolves one card from an in-progress scry/surveil to its chosen destination. */
export function resolveLook(zones: ZoneState, scryfallId: string, destination: LookDestination): ZoneState {
  const mode = zones.pendingLookMode;
  if (!mode) throw new Error('No scry or surveil in progress');
  if (!ALLOWED_DESTINATIONS[mode].includes(destination)) {
    throw new Error(`${destination} is not a valid destination while resolving a ${mode}`);
  }

  const next = cloneZones(zones);
  const idx = next.pendingLook.indexOf(scryfallId);
  if (idx === -1) throw new Error('That card is not part of the current scry/surveil');
  next.pendingLook.splice(idx, 1);

  if (destination === 'top') next.library.unshift(scryfallId);
  else if (destination === 'bottom') next.library.push(scryfallId);
  else next.graveyard.push(scryfallId);

  if (next.pendingLook.length === 0) next.pendingLookMode = null;
  return next;
}
