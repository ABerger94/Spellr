import { prisma } from '@/lib/prisma';
import type { ZoneState } from '@/types/game';
import { drawCard, moveCard, mulliganHand, tapCard } from './zones';
import { buildStateFor } from './stateSerializer';
import { logEvent } from './gameEvents';
import { getIO, gameRoom } from '@/server/socket/io';
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
    const io = getIO();
    const sockets = await io.in(gameRoom(gameId)).fetchSockets();
    await Promise.all(
      sockets.map(async (s) => {
        const seat = (s.data.seat as number | null) ?? null;
        const state = await buildStateFor(gameId, seat);
        io.to(s.id).emit('game:state', state);
      }),
    );
  } catch {
    // io not initialized — safe to skip (e.g. an AI turn triggered outside the socket server).
  }
}

export function execute(gameId: string, actor: ActionActor, action: Action): Promise<void> {
  return withGameLock(gameId, () => executeLocked(gameId, actor, action));
}

async function executeLocked(gameId: string, actor: ActionActor, action: Action): Promise<void> {
  const game = await prisma.game.findUniqueOrThrow({ where: { id: gameId } });
  if (game.status !== 'ACTIVE') throw new Error('Game is not active');

  switch (action.type) {
    case 'DRAW_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const { zones: nextZones, drawnScryfallId } = drawCard(zones);
      if (!drawnScryfallId) throw new Error('Library is empty');
      await updateZones(player.id, nextZones);
      await logEvent(gameId, 'DRAW_CARD', {}, actor);
      break;
    }

    case 'MULLIGAN': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const counters = (player.counters as Record<string, number> | null) ?? {};
      const mulliganCount = counters.mulliganCount ?? 0;
      const requiredBottomCards = Math.max(0, mulliganCount);

      if (requiredBottomCards > 0) {
        const selectedCards = action.bottomCardScryfallIds ?? [];
        if (selectedCards.length !== requiredBottomCards) {
          throw new Error(`Choose ${requiredBottomCards} card${requiredBottomCards === 1 ? '' : 's'} to put on the bottom of your library`);
        }
      }

      const { zones: nextZones } = mulliganHand(zones, requiredBottomCards, action.bottomCardScryfallIds);
      const nextCounters = { ...counters, mulliganCount: mulliganCount + 1 };

      await prisma.gamePlayer.update({
        where: { id: player.id },
        data: { zones: nextZones as unknown as object, counters: nextCounters as unknown as object },
      });
      await logEvent(gameId, 'MULLIGAN', { mulliganCount: mulliganCount + 1, bottomCardScryfallIds: action.bottomCardScryfallIds ?? [] }, actor);
      break;
    }

    case 'PLAY_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const { zones: nextZones } = moveCard(zones, {
        fromZone: action.fromZone,
        toZone: 'battlefield',
        scryfallId: action.scryfallId,
      });
      await updateZones(player.id, nextZones);
      await logEvent(gameId, 'PLAY_CARD', { scryfallId: action.scryfallId, fromZone: action.fromZone }, actor);
      break;
    }

    case 'TAP_CARD':
    case 'UNTAP_CARD': {
      const player = await getPlayer(gameId, actor.seat);
      const zones = player.zones as unknown as ZoneState;
      const nextZones = tapCard(zones, action.instanceId, action.type === 'TAP_CARD');
      await updateZones(player.id, nextZones);
      await logEvent(gameId, action.type, { instanceId: action.instanceId }, actor);
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
      });
      await updateZones(player.id, nextZones);
      await logEvent(gameId, 'MOVE_CARD', { fromZone: action.fromZone, toZone: action.toZone }, actor);
      break;
    }

    case 'ADJUST_LIFE': {
      const player = await getPlayer(gameId, action.seat);
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { life: { increment: action.delta } } });
      await logEvent(gameId, 'ADJUST_LIFE', { seat: action.seat, delta: action.delta }, actor);
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
      await logEvent(gameId, 'TURN_PASSED', { nextSeat }, actor);

      const nextPlayer = players.find((p) => p.seat === nextSeat);
      if (nextPlayer?.isAI) {
        void maybeTakeAITurn(gameId, nextSeat);
      }
      break;
    }
  }

  await broadcastState(gameId);
}
