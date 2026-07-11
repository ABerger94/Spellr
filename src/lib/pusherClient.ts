'use client';

import PusherClient from 'pusher-js';

const globalForPusher = globalThis as unknown as { pusherClient?: PusherClient };

export function getPusherClient(): PusherClient {
  if (!globalForPusher.pusherClient) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
    if (!key || !cluster) {
      // pusher-js itself throws a much less obvious error for this — surface
      // something a caller can catch and show to the user instead of crashing.
      throw new Error(
        'Realtime sync is not configured (NEXT_PUBLIC_PUSHER_KEY / NEXT_PUBLIC_PUSHER_CLUSTER are missing). ' +
          'If you just added them in Vercel, redeploy — NEXT_PUBLIC_ variables are baked in at build time.',
      );
    }
    globalForPusher.pusherClient = new PusherClient(key, { cluster, authEndpoint: '/api/pusher/auth' });
  }
  return globalForPusher.pusherClient;
}
