'use client';

import PusherClient from 'pusher-js';

const globalForPusher = globalThis as unknown as { pusherClient?: PusherClient };

export function getPusherClient(): PusherClient {
  if (!globalForPusher.pusherClient) {
    globalForPusher.pusherClient = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY as string, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER as string,
      authEndpoint: '/api/pusher/auth',
    });
  }
  return globalForPusher.pusherClient;
}
