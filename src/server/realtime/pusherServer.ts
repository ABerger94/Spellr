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

/** Relays a WebRTC signaling message (offer/answer/ICE candidate/join/leave)
 * to every client subscribed to the game's presence channel; each client
 * filters locally by `target`/`from`. This is a server-triggered relay
 * rather than a Pusher "client event" so no dashboard config is needed. */
export async function broadcastVoiceSignal(gameId: string, signal: unknown): Promise<void> {
  await getPusher().trigger(presenceGameChannel(gameId), 'voice:signal', signal);
}

/** Notifies everyone still waiting in a lobby that it's gone, since the game
 * row (and their per-seat channel) is about to disappear — either the host
 * cancelled it, or (reason: 'idle') the scheduled cleanup closed it after an
 * hour with nobody taking any action. */
export async function broadcastGameCancelled(gameId: string, reason: 'host' | 'idle' = 'host'): Promise<void> {
  await getPusher().trigger(presenceGameChannel(gameId), 'game:cancelled', { reason });
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
