import PusherServer from 'pusher';
import { prisma } from '@/lib/prisma';
import { env } from '@/lib/env';
import { buildStateFor } from '@/server/game/stateSerializer';
import type { GameStateView } from '@/types/game';

const globalForPusher = globalThis as unknown as { pusherServer?: PusherServer };

function getPusher(): PusherServer {
  if (!globalForPusher.pusherServer) {
    globalForPusher.pusherServer = new PusherServer({
      appId: env.pusherAppId,
      key: env.pusherKey,
      secret: env.pusherSecret,
      cluster: env.pusherCluster,
      useTLS: true,
    });
  }
  return globalForPusher.pusherServer;
}

export function presenceGameChannel(gameId: string): string {
  return `presence-game-${gameId}`;
}

export function privateSeatChannel(gameId: string, seat: number): string {
  return `private-game-${gameId}-seat-${seat}`;
}

/**
 * Every player has their own private channel carrying their own
 * seat-redacted view (their hand is never present on any channel another
 * user could subscribe to). The shared presence channel only ever carries
 * public info (the game log).
 */
export async function broadcastGameState(gameId: string): Promise<void> {
  const humanPlayers = await prisma.gamePlayer.findMany({
    where: { gameId, userId: { not: null } },
    select: { seat: true },
  });

  const pusher = getPusher();
  await Promise.all(
    humanPlayers.map(async ({ seat }) => {
      const state: GameStateView = await buildStateFor(gameId, seat);
      await pusher.trigger(privateSeatChannel(gameId, seat), 'game:state', state);
    }),
  );
}

export async function broadcastGameLog(gameId: string, event: unknown): Promise<void> {
  await getPusher().trigger(presenceGameChannel(gameId), 'game:log', event);
}

export function authorizeChannel(
  socketId: string,
  channelName: string,
  presenceData?: { user_id: string; user_info?: Record<string, unknown> },
) {
  return presenceData
    ? getPusher().authorizeChannel(socketId, channelName, presenceData)
    : getPusher().authorizeChannel(socketId, channelName);
}
