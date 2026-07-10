import { prisma } from '@/lib/prisma';
import type { ZoneState } from '@/types/game';
import { drawCard, moveCard, tapCard } from './zones';
import { buildStateFor } from './stateSerializer';
import { logEvent } from './gameEvents';
import { getIO, gameRoom } from '@/server/socket/io';
import type { Action } from './actionTypes';
import { maybeTakeAITurn } from '@/server/ai/aiController';

export interface ActionActor {
  userId?: string | null;
  seat: number;
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

export async function execute(gameId: string, actor: ActionActor, action: Action): Promise<void> {
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
      await prisma.gamePlayer.update({ where: { id: player.id }, data: { life: player.life + action.delta } });
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
