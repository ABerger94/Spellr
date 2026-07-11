import { prisma } from '@/lib/prisma';
import { broadcastGameLog } from '@/server/realtime/pusherServer';

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
    await broadcastGameLog(gameId, event);
  } catch (err) {
    // Pusher not configured / unreachable — the event is still persisted and
    // will show up next time a client fetches/reconnects, so this is safe to swallow.
    console.error('[broadcastGameLog]', err);
  }

  return event;
}
