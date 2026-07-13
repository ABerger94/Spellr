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
    landPlayedThisTurn: zones.landPlayedThisTurn ?? false,
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
  /** Whether this permanent should enter already showing its back face —
   * for modal double-faced cards played as their back (e.g. Sophoric
   * Springs); only meaningful when toZone is 'battlefield'. */
  enterTransformed?: boolean;
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
    next.battlefield.push({
      instanceId: uuidv4(),
      scryfallId: movedScryfallId,
      tapped: params.enterTapped ?? false,
      x: pos.x,
      y: pos.y,
      transformed: params.enterTransformed || undefined,
    });
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

/** Creates a token directly onto the battlefield — not sourced from any
 * other zone, since a token doesn't exist anywhere before this. */
export function createToken(zones: ZoneState, scryfallId: string, x?: number, y?: number): ZoneState {
  const next = cloneZones(zones);
  const pos = x !== undefined && y !== undefined ? { x: clampPercent(x), y: clampPercent(y) } : nextBattlefieldSlot(next.battlefield);
  next.battlefield.push({ instanceId: uuidv4(), scryfallId, tapped: false, x: pos.x, y: pos.y, isToken: true });
  return next;
}

/** Removes a token from the battlefield entirely — tokens cease to exist
 * once they'd leave the battlefield, rather than moving to another zone. */
export function removeToken(zones: ZoneState, instanceId: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Token not found on battlefield');
  if (!zones.battlefield[idx].isToken) throw new Error('That card is not a token');

  const next = cloneZones(zones);
  next.battlefield.splice(idx, 1);
  // Anything attached to the removed token comes loose rather than pointing
  // at a card that no longer exists.
  next.battlefield = next.battlefield.map((c) => (c.attachedTo === instanceId ? { ...c, attachedTo: undefined } : c));
  return next;
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

/** Multi-select helper — taps or untaps every listed card in one update, so
 * a group picked via battlefield drag-select can be toggled together. Cards
 * that no longer exist (e.g. moved away between selecting and tapping) are
 * silently skipped rather than failing the whole batch. */
export function setGroupTapped(zones: ZoneState, instanceIds: string[], tapped: boolean): ZoneState {
  const idSet = new Set(instanceIds);
  return {
    ...cloneZones(zones),
    battlefield: zones.battlefield.map((c) => (idSet.has(c.instanceId) ? { ...c, tapped } : c)),
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

/** Sets (or with an empty string, clears) the free-text note pinned to a
 * battlefield card. Purely cosmetic bookkeeping — no game meaning. */
export function setAnnotation(zones: ZoneState, instanceId: string, text: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = { ...next.battlefield[idx] };
  const trimmed = text.trim();
  if (trimmed) card.annotation = trimmed;
  else delete card.annotation;
  next.battlefield[idx] = card;
  return next;
}

export interface GiveCardResult {
  giverZones: ZoneState;
  receiverZones: ZoneState;
  scryfallId: string;
}

/** Transfers control of a battlefield permanent from one player's board to
 * another's — the same instanceId/tapped state/counters carry over (it's
 * still the same permanent, just under new control), but attachments and
 * combat declarations don't make sense pointing at a board it's no longer
 * on, so both are cleared, same as any other way of leaving the battlefield. */
export function giveCard(giverZones: ZoneState, receiverZones: ZoneState, instanceId: string): GiveCardResult {
  const idx = giverZones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on your battlefield');

  const nextGiver = cloneZones(giverZones);
  const [card] = nextGiver.battlefield.splice(idx, 1);
  // Anything that was attached to the given card comes loose rather than
  // pointing at a card that just left this battlefield.
  nextGiver.battlefield = nextGiver.battlefield.map((c) =>
    c.attachedTo === instanceId ? { ...c, attachedTo: undefined } : c,
  );

  const nextReceiver = cloneZones(receiverZones);
  const pos = nextBattlefieldSlot(nextReceiver.battlefield);
  const given: BattlefieldCard = { ...card, x: pos.x, y: pos.y };
  delete given.attachedTo;
  delete given.attacking;
  delete given.blocking;
  nextReceiver.battlefield.push(given);

  return { giverZones: nextGiver, receiverZones: nextReceiver, scryfallId: card.scryfallId };
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

export interface AttackTarget {
  targetType: 'player' | 'planeswalker';
  targetSeat: number;
  targetInstanceId?: string;
}

/** Combat helper — declares this card as attacking a target (a player's
 * face or one of their planeswalkers/battles). Also taps the card, matching
 * a normal attacker — unless the caller says it has vigilance, in which
 * case its tapped state is left alone. Bookkeeping only — no damage math,
 * same as the rest of the table. */
export function declareAttack(
  zones: ZoneState,
  instanceId: string,
  target: AttackTarget,
  options?: { hasVigilance?: boolean },
): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = next.battlefield[idx];
  next.battlefield[idx] = { ...card, attacking: target, tapped: options?.hasVigilance ? card.tapped : true };
  return next;
}

export function cancelAttack(zones: ZoneState, instanceId: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = { ...next.battlefield[idx] };
  delete card.attacking;
  next.battlefield[idx] = card;
  return next;
}

/** Combat helper — declares this card as blocking an attacker (identified
 * by instanceId, which may belong to another player's battlefield). Does
 * not tap or otherwise touch the attacking card. */
export function declareBlock(zones: ZoneState, instanceId: string, attackerInstanceId: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = { ...next.battlefield[idx] };
  const blocking = new Set(card.blocking ?? []);
  blocking.add(attackerInstanceId);
  card.blocking = [...blocking];
  next.battlefield[idx] = card;
  return next;
}

export function cancelBlock(zones: ZoneState, instanceId: string, attackerInstanceId: string): ZoneState {
  const idx = zones.battlefield.findIndex((c) => c.instanceId === instanceId);
  if (idx === -1) throw new Error('Card not found on battlefield');

  const next = cloneZones(zones);
  const card = { ...next.battlefield[idx] };
  const remaining = (card.blocking ?? []).filter((id) => id !== attackerInstanceId);
  if (remaining.length > 0) card.blocking = remaining;
  else delete card.blocking;
  next.battlefield[idx] = card;
  return next;
}

/** Clears every attacking/blocking declaration on this player's battlefield
 * — called automatically for every player when the active player's turn
 * passes, and available as a manual "Clear My Combat" action too. */
export function clearCombat(zones: ZoneState): ZoneState {
  const next = cloneZones(zones);
  next.battlefield = next.battlefield.map((c) => {
    if (!c.attacking && !c.blocking) return c;
    const copy = { ...c };
    delete copy.attacking;
    delete copy.blocking;
    return copy;
  });
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

/** Mulligan: shuffle the current hand back into the library, draw a fresh 7,
 * and record that a mulligan was taken. The first mulligan is free; each one
 * after that means the player is expected to put an extra card on the
 * bottom of their library once they keep (see mulliganCardsOwed) — nothing
 * here enforces that part, same as every other judgment call on this
 * virtual tabletop. */
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
  // Reorder resolves all at once via confirmReorder, not card-by-card.
  reorder: [],
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

/** Resolves an in-progress reorder (Sensei's Divining Top-style: look at the
 * top X, rearrange them, put all of them back on top) in one shot — `order`
 * must be a permutation of the cards currently in pendingLook, top-to-bottom.
 * Unlike resolveLook, nothing is shuffled and nothing leaves the library. */
export function confirmReorder(zones: ZoneState, order: string[]): ZoneState {
  if (zones.pendingLookMode !== 'reorder') throw new Error('No reorder in progress');

  const pending = [...zones.pendingLook].sort();
  const proposed = [...order].sort();
  const sameCards = pending.length === proposed.length && pending.every((id, i) => id === proposed[i]);
  if (!sameCards) {
    throw new Error('The new order must contain exactly the cards being looked at, with none added or removed');
  }

  const next = cloneZones(zones);
  next.library = [...order, ...next.library];
  next.pendingLook = [];
  next.pendingLookMode = null;
  return next;
}
