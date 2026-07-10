import type { Server, Socket } from 'socket.io';
import { prisma } from '@/lib/prisma';
import { gameRoom } from '@/server/socket/io';
import { buildStateFor } from '@/server/game/stateSerializer';
import { execute } from '@/server/game/actionHandler';
import { actionSchema } from '@/server/game/actionTypes';

interface JoinAck {
  ok: boolean;
  error?: string;
}

interface ActionAck {
  ok: boolean;
  error?: string;
}

async function broadcastStateToRoom(io: Server, gameId: string) {
  const sockets = await io.in(gameRoom(gameId)).fetchSockets();
  await Promise.all(
    sockets.map(async (s) => {
      const seat = (s.data.seat as number | null) ?? null;
      const state = await buildStateFor(gameId, seat);
      io.to(s.id).emit('game:state', state);
    }),
  );
}

export function registerGameHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId as string;

  socket.on('game:join', async (payload: { gameId: string }, ack?: (res: JoinAck) => void) => {
    try {
      const player = await prisma.gamePlayer.findFirst({
        where: { gameId: payload.gameId, userId },
      });
      if (!player) {
        ack?.({ ok: false, error: 'You are not a player in this game' });
        return;
      }

      // A socket that previously joined a different game must leave that
      // room first, or it keeps receiving (and being counted toward) that
      // game's state broadcasts under its new seat/game — leaking hand data.
      const previousGameId = socket.data.gameId as string | undefined;
      if (previousGameId && previousGameId !== payload.gameId) {
        await socket.leave(gameRoom(previousGameId));
      }

      socket.data.gameId = payload.gameId;
      socket.data.seat = player.seat;
      await socket.join(gameRoom(payload.gameId));

      await prisma.gamePlayer.update({ where: { id: player.id }, data: { connected: true } });

      const state = await buildStateFor(payload.gameId, player.seat);
      socket.emit('game:state', state);
      ack?.({ ok: true });

      // Let everyone else's view pick up the updated `connected` flag too.
      await broadcastStateToRoom(io, payload.gameId);
    } catch (err) {
      console.error('[socket game:join]', err);
      ack?.({ ok: false, error: 'Failed to join game' });
    }
  });

  socket.on('game:action', async (payload: { gameId: string; action: unknown }, ack?: (res: ActionAck) => void) => {
    try {
      const gameId = socket.data.gameId as string | undefined;
      const seat = socket.data.seat as number | undefined;
      if (!gameId || seat === undefined || gameId !== payload.gameId) {
        ack?.({ ok: false, error: 'Not joined to this game' });
        return;
      }

      const parsed = actionSchema.safeParse(payload.action);
      if (!parsed.success) {
        ack?.({ ok: false, error: 'Invalid action' });
        return;
      }

      await execute(gameId, { userId, seat }, parsed.data);
      ack?.({ ok: true });
    } catch (err) {
      console.error('[socket game:action]', err);
      ack?.({ ok: false, error: err instanceof Error ? err.message : 'Action failed' });
    }
  });

  socket.on('disconnect', async () => {
    const gameId = socket.data.gameId as string | undefined;
    if (!gameId) return;
    try {
      // Another tab/socket for the same user may still be connected to this
      // game (multiple tabs, or a fresh reconnect racing this teardown) —
      // only mark the player offline if no other socket of theirs remains.
      const remaining = await io.in(gameRoom(gameId)).fetchSockets();
      const stillConnected = remaining.some((s) => s.id !== socket.id && s.data.userId === userId);
      if (stillConnected) return;

      await prisma.gamePlayer.updateMany({ where: { gameId, userId }, data: { connected: false } });
      await broadcastStateToRoom(io, gameId);
    } catch (err) {
      console.error('[socket disconnect]', err);
    }
  });
}
