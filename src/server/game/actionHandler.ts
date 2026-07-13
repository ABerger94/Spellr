import { prisma } from '@/lib/prisma';
import type { GameEvent } from '@prisma/client';
import type { ZoneState } from '@/types/game';
import {
  adjustCounter,
  adjustMana,
  attachCard,
  cancelAttack,
  cancelBlock,
  clearCombat,
  confirmReorder,
  createToken,
  declareAttack,
  declareBlock,
  drawCards,
  emptyManaPool,
  flipCard,
  giveCard,
  millCards,
  moveCard,
  mulligan,
  randomDiscard,
  removeToken,
  setAnnotation,
  setGroupTapped,
  resolveLook,
  shuffleLibrary,
  startLook,
  tapCard,
  untapAll,
} from './zones';
import { logEvent } from './gameEvents';
import { broadcastGameState } from '@/server/realtime/pusherServer';
import type { Action } from './actionTypes';
import { endGame, resetPlayerBoard, restartGame, startingLifeFor, touchGameActivity } from './gameService';
import { getCardById } from '@/server/scryfall/cardService';

export interface ActionActor {
  userId?: string | null;
  seat: number;
}

// Kept in sync with zones.ts's PLUS_ONE_COUNTER/MINUS_ONE_COUNTER — these
// are always available on every card and never need to be added to the
// game-wide custom counter type registry below.
const BUILT_IN_COUNTER_TYPES = ['+1/+1', '-1/-1'];

// Serializes all actions for a given game so two concurrent requests (e.g. a
// double-clicked button, or a human and the AI acting back-to-back) can't
// race on the same GamePlayer's zones/life with a read-modify-write.
const gameLocks = new Map<string, Promise<unknown>>();

function withGameLock<T>(gameId: string, fn: () => Promise<T>): Promise<T> {
  const previous = gameLocks.get(gameId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  gameLocks.set(
    gameId,
    run.catch(() => undefined),
  );
  return run;
}

async function getPlayer(gameId: string, seat: number) {
  return prisma.gamePlayer.findFirstOrThrow({ where: { gameId, seat } });
}

async function updateZones(gamePlayerId: string, zones: ZoneState) {
  await prisma.gamePlayer.update({ where: { id: gamePlayerId }, data: { zones: zones as unknown as object } });
}

const CONDITIONAL_TAPPED_MARKERS = ['unless', 'you may', "don't"];

/** Whether a permanent unconditionally enters the battlefield tapped (Guildgates,
 * bounce lands, etc.) — deliberately conservative, so it skips cards that
 * make tapped-vs-untapped a real choice (shock lands' "pay 2 life", check
 * lands' "unless you control", fast/slow lands' land-count conditions) rather
 * than risk forcing a choice the player didn't get to make. */
function entersTappedUnconditionally(oracleText: string | null): boolean {
  if (!oracleText) return false;
  const text = oracleText.toLowerCase();
  if (!text.includes('enters the battlefield tapped') && !text.includes('enters tapped')) return false;
  return !CONDITIONAL_TAPPED_MARKERS.some((marker) => text.includes(marker));
}

async function resolveEnterTapped(scryfallId: string | undefined): Promise<boolean> {
  if (!scryfallId) return false;
  const card = await prisma.cardCache.findUnique({ where: { scryfallId }, select: { oracleText: true } });
  return entersTappedUnconditionally(card?.oracleText ?? null);
}

/** Whether a played card is a land — used only to track landPlayedThisTurn
 * (bookkeeping/guidance, not a hard block on playing a second one). */
async function resolveIsLand(scryfallId: string): Promise<boolean> {
  const card = await prisma.cardCache.findUnique({ where: { scryfallId }, select: { typeLine: true } });
  return (card?.typeLine ?? '').includes('Land');
}

/** Whether a card has vigilance, so declaring it as an attacker shouldn't
 * tap it — keyword abilities are always printed as their own bare word
 * (e.g. "Vigilance" or "Flying, vigilance"), so a substring check is safe
 * here, same as the enters-tapped detection above. */
function hasVigilance(oracleText: string | null): boolean {
  if (!oracleText) return false;
  return oracleText.toLowerCase().includes('vigilance');
}

async function resolveHasVigilance(scryfallId: string | undefined): Promise<boolean> {
  if (!scryfallId) return false;
  const card = await prisma.cardCache.findUnique({ where: { scryfallId }, select: { oracleText: true } });
  return hasVigilance(card?.oracleText ?? null);
}

/** Finds the next seat after `fromSeat` in turn order, skipping any
 * eliminated seats — wraps around the full table if needed (e.g. everyone
 * else at the table is eliminated, so play just continues with the one
 * remaining seat). `wrapped` is true whenever the search crosses back past
 * the start of the seat order, same meaning PASS_TURN uses it for to decide
 * whether the turn counter increments. */
function nextActiveSeat(seats: number[], eliminatedSeats: Set<number>, fromSeat: number): { nextSeat: number; wrapped: boolean } {
  const fromIndex = seats.indexOf(fromSeat);
  let idx = fromIndex;
  let wrapped = false;
  for (let step = 0; step < seats.length; step++) {
    const prevIdx = idx;
    idx = (idx + 1) % seats.length;
    if (idx <= prevIdx) wrapped = true;
    if (!eliminatedSeats.has(seats[idx])) break;
  }
  return { nextSeat: seats[idx], wrapped };
}

async function broadcastState(gameId: string) {
  try {
    await broadcastGameState(gameId);
  } catch (err) {
    // Pusher not configured / unreachable — state is persisted regardless and
    // will be picked up on next page load/reconnect, so this is safe to swallow.
    console.error('[broadcastGameState]', err);
  }
}

export function execute(gameId: string, actor: ActionActor, action: Action): Promise<GameEvent> {
  return withGameLock(gameId, () => executeLocked(gameId, actor, action));
}

async function executeLocked(gameId: string, actor: ActionActor, action: Action): Promise<GameEvent> {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  // Chat is the one action allowed before the game actually starts, so
  // players waiting in the lobby can talk to each other.
  if (action.type !== 'CHAT_MESSAGE' && game.status !== 'ACTIVE') throw new Error('Game is not active');

  let event: GameEvent | undefined;

  switch (action.type) {
    case 'DRAW_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const { zones: nextZones, drawnScryfallIds } = drawCards(zones, action.count ?? 1);
      if (drawnScryfallIds.length === 0) throw new Error('Library is empty');
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'DRAW_CARD', { count: drawnScryfallIds.length }, actor);
      break;
    }

    case 'PLAY_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const [enterTapped, isLand] = await Promise.all([
        resolveEnterTapped(action.scryfallId),
        resolveIsLand(action.scryfallId),
      ]);
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: 'battlefield',
        scryfallId: action.scryfallId,
        x: action.x,
        y: action.y,
        enterTapped,
        enterTransformed: action.transformed,
      });
      if (isLand) nextZones.landPlayedThisTurn = true;
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'PLAY_CARD', { scryfallId: action.scryfallId, fromZone: action.fromZone }, actor);
      break;
    }

    case 'TAP_CARD':
    case 'UNTAP_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = tapCard(zones, action.instanceId, action.type === 'TAP_CARD');
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, action.type, { instanceId: action.instanceId }, actor);
      break;
    }

    case 'SET_GROUP_TAPPED': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = setGroupTapped(zones, action.instanceIds, action.tapped);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'SET_GROUP_TAPPED', { instanceIds: action.instanceIds, tapped: action.tapped }, actor);
      break;
    }

    case 'MOVE_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const enterTapped = action.toZone === 'battlefield' ? await resolveEnterTapped(action.scryfallId) : false;
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: action.toZone,
        instanceId: action.instanceId,
        scryfallId: action.scryfallId,
        position: action.position,
        x: action.x,
        y: action.y,
        enterTapped,
      });
      await updateZones(player.id, nextZones);
      event = await logEvent(
        gameId,
        'MOVE_CARD',
        { fromZone: action.fromZone, toZone: action.toZone, position: action.position },
        actor,
      );
      break;
    }

    case 'SCRY':
    case 'SURVEIL': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const mode = action.type === 'SCRY' ? 'scry' : 'surveil';
      const nextZones = startLook(zones, action.count, mode);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, action.type, { count: nextZones.pendingLook.length }, actor);
      break;
    }

    case 'RESOLVE_LOOK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const mode = zones.pendingLookMode;
      const nextZones = resolveLook(zones, action.scryfallId, action.destination);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'LOOK_RESOLVED', { mode, destination: action.destination }, actor);
      break;
    }

    // Sensei's Divining Top-style look: no shuffling, just look at the top
    // count cards and rearrange them — see REORDER_TOP/CONFIRM_REORDER below.
    case 'REORDER_TOP': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = startLook(zones, action.count, 'reorder');
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'REORDER_TOP', { count: nextZones.pendingLook.length }, actor);
      break;
    }

    case 'CONFIRM_REORDER': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = confirmReorder(zones, action.order);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'CONFIRM_REORDER', { count: action.order.length }, actor);
      break;
    }

    case 'ADJUST_LIFE': {
      const player = await getPlayer(gameId, action.seat);
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { life: { increment: action.delta } } });
      event = await logEvent(gameId, 'ADJUST_LIFE', { seat: action.seat, delta: action.delta }, actor);
      break;
    }

    // Tracked on the *defending* player's own record, keyed by which seat's
    // commander dealt it — same simplification as everything else on this
    // manual tabletop: a seat with two partner commanders shares one running
    // total rather than tracking each commander card separately.
    case 'ADJUST_COMMANDER_DAMAGE': {
      const player = await getPlayer(gameId, action.seat);
      const current = (player.commanderDamage as Record<string, number> | null) ?? {};
      const key = String(action.fromSeat);
      const total = Math.max(0, (current[key] ?? 0) + action.delta);
      const nextCommanderDamage = { ...current, [key]: total };
      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: { commanderDamage: nextCommanderDamage as unknown as object },
      });
      event = await logEvent(
        gameId,
        'ADJUST_COMMANDER_DAMAGE',
        { seat: action.seat, fromSeat: action.fromSeat, delta: action.delta, total },
        actor,
      );
      break;
    }

    // Poison, experience, energy, or any other player-level counter — same
    // "type it in and it just works" free-form approach as battlefield card
    // counters, just scoped to a player instead of a permanent.
    case 'ADJUST_PLAYER_COUNTER': {
      const player = await getPlayer(gameId, action.seat);
      const current = (player.counters as Record<string, number> | null) ?? {};
      const total = Math.max(0, (current[action.counterType] ?? 0) + action.delta);
      const nextCounters = { ...current };
      if (total === 0) delete nextCounters[action.counterType];
      else nextCounters[action.counterType] = total;
      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: { counters: nextCounters as unknown as object },
      });
      event = await logEvent(
        gameId,
        'ADJUST_PLAYER_COUNTER',
        { seat: action.seat, counterType: action.counterType, delta: action.delta, total },
        actor,
      );
      break;
    }

    // Any player can mark any seat eliminated (same table-trust model as
    // life/counters) — PASS_TURN skips their seat in turn order from then
    // on. Un-eliminating puts them back in the rotation.
    case 'ELIMINATE_PLAYER': {
      const player = await getPlayer(gameId, action.seat);
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { eliminated: action.eliminated } });

      // If the seat being eliminated currently holds the active turn, don't
      // leave the game stuck waiting on them to pass it themselves — advance
      // immediately to the next non-eliminated seat, same logic PASS_TURN uses.
      if (action.eliminated && game.currentTurnSeat === action.seat) {
        const players = await prisma.gamePlayer.findMany({ where: { gameId }, orderBy: { seat: 'asc' } });
        const seats = players.map((p) => p.seat);
        const eliminatedSeats = new Set(players.filter((p) => p.eliminated).map((p) => p.seat));
        eliminatedSeats.add(action.seat);
        const { nextSeat, wrapped } = nextActiveSeat(seats, eliminatedSeats, action.seat);
        if (nextSeat !== action.seat) {
          await prisma.game.update({
            where: { id: gameId },
            data: { currentTurnSeat: nextSeat, turnNumber: wrapped ? game.turnNumber + 1 : game.turnNumber },
          });
          await Promise.all(
            players.map((p) => {
              const nextZones = clearCombat(p.zones as unknown as ZoneState);
              if (p.seat === nextSeat) nextZones.landPlayedThisTurn = false;
              return updateZones(p.id, nextZones);
            }),
          );
        }
      }

      event = await logEvent(gameId, 'ELIMINATE_PLAYER', { seat: action.seat, eliminated: action.eliminated }, actor);
      break;
    }

    case 'PASS_TURN': {
      if (game.currentTurnSeat !== actor.seat) {
        throw new Error("It isn't your turn");
      }
      const players = await prisma.gamePlayer.findMany({ where: { gameId }, orderBy: { seat: 'asc' } });
      const seats = players.map((p) => p.seat);
      const eliminatedSeats = new Set(players.filter((p) => p.eliminated).map((p) => p.seat));
      const { nextSeat, wrapped } = nextActiveSeat(seats, eliminatedSeats, actor.seat);

      await prisma.game.update({
        where: { id: gameId },
        data: { currentTurnSeat: nextSeat, turnNumber: wrapped ? game.turnNumber + 1 : game.turnNumber },
      });
      event = await logEvent(gameId, 'TURN_PASSED', { nextSeat }, actor);

      // Combat is over once the turn passes — clear every player's attack/
      // block declarations, not just the actor's own, since blockers live on
      // the defending players' cards. The land drop resets only for whoever's
      // turn is now starting; everyone else's flag is irrelevant until their
      // own turn comes back around, when this same reset covers it again.
      await Promise.all(
        players.map((p) => {
          const nextZones = clearCombat(p.zones as unknown as ZoneState);
          if (p.seat === nextSeat) nextZones.landPlayedThisTurn = false;
          return updateZones(p.id, nextZones);
        }),
      );

      // Drawing for turn is left to the player (Draw button / D shortcut /
      // the AI's own draw_card call) rather than happening automatically here
      // — upkeep triggers sometimes need to resolve before the draw step.
      // If the next seat is AI, a connected client's useGameState hook
      // notices via the returned state and calls POST /api/games/[gameId]/ai-turn
      // itself — a real, fully-awaited request, not backgrounded off of this
      // one (backgrounded work only stays alive up to this request's own
      // duration limit, which isn't enough for a multi-step AI turn).
      break;
    }

    case 'SHUFFLE_LIBRARY': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      await updateZones(player.id, shuffleLibrary(zones));
      event = await logEvent(gameId, 'SHUFFLE_LIBRARY', {}, actor);
      break;
    }

    // No zone mutation — this exists purely so every player's library
    // browse is visible in the shared log, since a private "look at your
    // whole library in order" action would otherwise be unauditable by
    // the other players at the table.
    case 'SEARCH_LIBRARY': {
      event = await logEvent(gameId, 'SEARCH_LIBRARY', {}, actor);
      break;
    }

    case 'UNTAP_ALL': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      await updateZones(player.id, untapAll(zones));
      event = await logEvent(gameId, 'UNTAP_ALL', {}, actor);
      break;
    }

    case 'RESET_LIFE': {
      const player = await getPlayer(gameId, actor.seat);
      const life = startingLifeFor(game.format);
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { life } });
      event = await logEvent(gameId, 'RESET_LIFE', { life }, actor);
      break;
    }

    case 'RESET_BOARD': {
      await resetPlayerBoard(gameId, actor.seat);
      event = await logEvent(gameId, 'RESET_BOARD', {}, actor);
      break;
    }

    case 'RESTART_GAME': {
      await restartGame(gameId, actor.userId ?? '');
      event = await logEvent(gameId, 'RESTART_GAME', {}, actor);
      break;
    }

    case 'MILL': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const { zones: nextZones, milledScryfallIds } = millCards(zones, action.count);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'MILL', { count: milledScryfallIds.length }, actor);
      break;
    }

    case 'RANDOM_DISCARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const { zones: nextZones } = randomDiscard(zones);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'RANDOM_DISCARD', {}, actor);
      break;
    }

    case 'REVEAL_HAND': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const cardRows = await prisma.cardCache.findMany({
        where: { scryfallId: { in: zones.hand } },
        select: { scryfallId: true, name: true },
      });
      const namesById = new Map(cardRows.map((c) => [c.scryfallId, c.name]));
      const cardNames = zones.hand.map((id) => namesById.get(id) ?? id);
      event = await logEvent(gameId, 'REVEAL_HAND', { cardNames }, actor);
      break;
    }

    case 'MULLIGAN': {
      if (game.turnNumber !== 1) {
        throw new Error('You can only mulligan during the first turn of the game');
      }
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = mulligan(zones);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'MULLIGAN', { mulliganCount: nextZones.mulliganCount }, actor);
      break;
    }

    case 'ROLL_DICE': {
      const result = 1 + Math.floor(Math.random() * action.sides);
      event = await logEvent(gameId, 'ROLL_DICE', { sides: action.sides, result }, actor);
      break;
    }

    case 'FLIP_COIN': {
      const result = Math.random() < 0.5 ? 'heads' : 'tails';
      event = await logEvent(gameId, 'FLIP_COIN', { result }, actor);
      break;
    }

    case 'ADJUST_COUNTER': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = adjustCounter(zones, action.instanceId, action.counterType, action.delta);
      await updateZones(player.id, nextZones);
      // Any non-built-in counter name typed on one card becomes a quick-pick
      // option for every card in the game from now on — tracked here rather
      // than derived from live counter values, so it doesn't disappear again
      // once every card's count of it drops back to zero.
      if (!BUILT_IN_COUNTER_TYPES.includes(action.counterType)) {
        const known = (game.customCounterTypes as unknown as string[]) ?? [];
        if (!known.includes(action.counterType)) {
          const updatedTypes = [...known, action.counterType];
          await prisma.game.update({ where: { id: gameId }, data: { customCounterTypes: updatedTypes } });
        }
      }
      event = await logEvent(
        gameId,
        'ADJUST_COUNTER',
        { instanceId: action.instanceId, counterType: action.counterType, delta: action.delta },
        actor,
      );
      break;
    }

    case 'FLIP_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = flipCard(zones, action.instanceId);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'FLIP_CARD', { instanceId: action.instanceId }, actor);
      break;
    }

    case 'ATTACH_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = attachCard(zones, action.instanceId, action.targetInstanceId);
      await updateZones(player.id, nextZones);
      event = await logEvent(
        gameId,
        'ATTACH_CARD',
        { instanceId: action.instanceId, targetInstanceId: action.targetInstanceId },
        actor,
      );
      break;
    }

    case 'ADJUST_MANA': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = adjustMana(zones, action.color, action.delta);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'ADJUST_MANA', { color: action.color, delta: action.delta }, actor);
      break;
    }

    case 'EMPTY_MANA_POOL': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = emptyManaPool(zones);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'EMPTY_MANA_POOL', {}, actor);
      break;
    }

    case 'CREATE_TOKEN': {
      const cardCache = await getCardById(action.scryfallId); // ensures CardCache row exists (FK requirement)
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = createToken(zones, action.scryfallId, action.x, action.y);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'CREATE_TOKEN', { scryfallId: action.scryfallId, name: cardCache.name }, actor);
      break;
    }

    case 'REMOVE_TOKEN': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const removed = zones.battlefield.find((c) => c.instanceId === action.instanceId);
      const nextZones = removeToken(zones, action.instanceId);
      await updateZones(player.id, nextZones);
      const cardCache = removed ? await prisma.cardCache.findUnique({ where: { scryfallId: removed.scryfallId }, select: { name: true } }) : null;
      event = await logEvent(gameId, 'REMOVE_TOKEN', { scryfallId: removed?.scryfallId, name: cardCache?.name }, actor);
      break;
    }

    case 'SET_ANNOTATION': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = setAnnotation(zones, action.instanceId, action.text);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'SET_ANNOTATION', { instanceId: action.instanceId }, actor);
      break;
    }

    case 'GIVE_CARD': {
      if (action.toSeat === actor.seat) throw new Error('Cannot give a card to yourself');
      const giver = await getPlayer(gameId, actor.seat);
      const receiver = await getPlayer(gameId, action.toSeat);
      const giverZones = giver.zones as unknown as ZoneState;
      const receiverZones = receiver.zones as unknown as ZoneState;
      const result = giveCard(giverZones, receiverZones, action.instanceId);
      await updateZones(giver.id, result.giverZones);
      await updateZones(receiver.id, result.receiverZones);
      event = await logEvent(
        gameId,
        'GIVE_CARD',
        { instanceId: action.instanceId, scryfallId: result.scryfallId, toSeat: action.toSeat },
        actor,
      );
      break;
    }

    case 'DECLARE_ATTACK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const attackingCard = zones.battlefield.find((c) => c.instanceId === action.instanceId);
      if (!attackingCard) {
        throw new Error('That creature is not on your own battlefield — you can only declare attacks with creatures you control.');
      }
      const vigilant = await resolveHasVigilance(attackingCard?.scryfallId);
      const nextZones = declareAttack(
        zones,
        action.instanceId,
        {
          targetType: action.targetType,
          targetSeat: action.targetSeat,
          targetInstanceId: action.targetInstanceId,
        },
        { hasVigilance: vigilant },
      );
      await updateZones(player.id, nextZones);
      event = await logEvent(
        gameId,
        'DECLARE_ATTACK',
        {
          instanceId: action.instanceId,
          targetType: action.targetType,
          targetSeat: action.targetSeat,
          targetInstanceId: action.targetInstanceId,
        },
        actor,
      );
      break;
    }

    case 'CANCEL_ATTACK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = cancelAttack(zones, action.instanceId);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'CANCEL_ATTACK', { instanceId: action.instanceId }, actor);
      break;
    }

    case 'DECLARE_BLOCK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      if (!zones.battlefield.some((c) => c.instanceId === action.instanceId)) {
        throw new Error('That creature is not on your own battlefield — you can only declare blocks with creatures you control.');
      }
      const nextZones = declareBlock(zones, action.instanceId, action.attackerInstanceId);
      await updateZones(player.id, nextZones);
      event = await logEvent(
        gameId,
        'DECLARE_BLOCK',
        { instanceId: action.instanceId, attackerInstanceId: action.attackerInstanceId },
        actor,
      );
      break;
    }

    case 'CANCEL_BLOCK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = cancelBlock(zones, action.instanceId, action.attackerInstanceId);
      await updateZones(player.id, nextZones);
      event = await logEvent(
        gameId,
        'CANCEL_BLOCK',
        { instanceId: action.instanceId, attackerInstanceId: action.attackerInstanceId },
        actor,
      );
      break;
    }

    case 'CLEAR_MY_COMBAT': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = clearCombat(zones);
      await updateZones(player.id, nextZones);
      event = await logEvent(gameId, 'CLEAR_MY_COMBAT', {}, actor);
      break;
    }

    case 'END_GAME': {
      await endGame(gameId, actor.userId ?? '');
      event = await logEvent(gameId, 'GAME_ENDED', {}, actor);
      break;
    }

    case 'CHAT_MESSAGE': {
      event = await logEvent(gameId, 'CHAT_MESSAGE', { text: action.text }, actor);
      break;
    }
  }

  if (!event) {
    throw new Error('Unhandled action type');
  }

  await touchGameActivity(gameId);
  await broadcastState(gameId);
  return event;
}
