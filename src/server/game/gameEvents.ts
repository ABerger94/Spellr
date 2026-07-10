import { prisma } from '@/lib/prisma';
import { getIO, gameRoom } from '@/server/socket/io';

export async function logEvent(
  gameId: string,
  type: string,
  payload: Record<string, unknown> = {},
  actor?: { userId?: string | null; seat?: number | null },
) {
  const event = await prisma.gameEvent.create({
    data: {
      gameId,
      type,
      payload: payload as object,
      actorUserId: actor?.userId ?? null,
      actorSeat: actor?.seat ?? null,
    },
  });

  try {
    getIO().to(gameRoom(gameId)).emit('game:log', event);
  } catch {
    // io not initialized yet (e.g. during a one-off script) — safe to skip.
  }

  return event;
}
