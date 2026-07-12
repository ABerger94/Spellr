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
  millCards,
  moveCard,
  mulligan,
  randomDiscard,
  removeToken,
  resolveLook,
  shuffleLibrary,
  startLook,
  tapCard,
  untapAll,
} from './zones';
import { logEvent } from './gameEvents';
import { broadcastGameState } from '@/server/realtime/pusherServer';
import type { Action } from './actionTypes';
import { endGame, resetPlayerBoard, restartGame, startingLifeFor } from './gameService';
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
  if (game.status !== 'ACTIVE') throw new Error('Game is not active');

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
      const enterTapped = await resolveEnterTapped(action.scryfallId);
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: 'battlefield',
        scryfallId: action.scryfallId,
        x: action.x,
        y: action.y,
        enterTapped,
        enterTransformed: action.transformed,
      });
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

    case 'PASS_TURN': {
      if (game.currentTurnSeat !== actor.seat) {
        throw new Error("It isn't your turn");
      }
      const players = await prisma.gamePlayer.findMany({ where: { gameId }, orderBy: { seat: 'asc' } });
      const seats = players.map((p) => p.seat);
      const currentIndex = seats.indexOf(actor.seat);
      const nextIndex = (currentIndex + 1) % seats.length;
      const nextSeat = seats[nextIndex];
      const wrapped = nextIndex <= currentIndex;

      await prisma.game.update({
        where: { id: gameId },
        data: { currentTurnSeat: nextSeat, turnNumber: wrapped ? game.turnNumber + 1 : game.turnNumber },
      });
      event = await logEvent(gameId, 'TURN_PASSED', { nextSeat }, actor);

      // Combat is over once the turn passes — clear every player's attack/
      // block declarations, not just the actor's own, since blockers live on
      // the defending players' cards.
      await Promise.all(
        players.map((p) => updateZones(p.id, clearCombat(p.zones as unknown as ZoneState))),
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

    case 'DECLARE_ATTACK': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = declareAttack(zones, action.instanceId, {
        targetType: action.targetType,
        targetSeat: action.targetSeat,
        targetInstanceId: action.targetInstanceId,
      });
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

  await broadcastState(gameId);
  return event;
}
