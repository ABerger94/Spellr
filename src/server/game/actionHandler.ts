import { prisma } from '@/lib/prisma';
import type { GameEvent } from '@prisma/client';
import type { ZoneState } from '@/types/game';
import { drawCards, moveCard, resolveLook, startLook, tapCard } from './zones';
import { logEvent } from './gameEvents';
import { broadcastGameState } from '@/server/realtime/pusherServer';
import type { Action } from './actionTypes';
import { maybeTakeAITurn } from '@/server/ai/aiController';

export interface ActionActor {
  userId?: string | null;
  seat: number;
}

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

  let event: GameEvent;

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
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: 'battlefield',
        scryfallId: action.scryfallId,
        x: action.x,
        y: action.y,
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
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: action.toZone,
        instanceId: action.instanceId,
        scryfallId: action.scryfallId,
        position: action.position,
        x: action.x,
        y: action.y,
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

    case 'ADJUST_LIFE': {
      const player = await getPlayer(gameId, action.seat);
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { life: { increment: action.delta } } });
      event = await logEvent(gameId, 'ADJUST_LIFE', { seat: action.seat, delta: action.delta }, actor);
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

      const nextPlayer = players.find((p) => p.seat === nextSeat);
      if (nextPlayer?.isAI) {
        void maybeTakeAITurn(gameId, nextSeat);
      }
      break;
    }
  }

  await broadcastState(gameId);
  return event;
}
