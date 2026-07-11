'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { PresenceChannel } from 'pusher-js';
import { getPusherClient } from '@/lib/pusherClient';

const ONLINE_PRESENCE_CHANNEL = 'presence-online';

const OnlineCountContext = createContext<number | null>(null);

/** Tracks how many authenticated users are connected anywhere in the app via
 * one shared presence channel subscribed here at the provider level (mounted
 * once in the root layout) — so the count doesn't flicker as a user
 * navigates between pages, and every page shares a single subscription
 * instead of each mounting its own. */
export function OnlineCountProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (status !== 'authenticated') {
      setCount(null);
      return;
    }

    let pusher: ReturnType<typeof getPusherClient>;
    try {
      pusher = getPusherClient();
    } catch {
      return;
    }

    const channel = pusher.subscribe(ONLINE_PRESENCE_CHANNEL) as PresenceChannel;
    const updateCount = () => setCount(channel.members.count);
    channel.bind('pusher:subscription_succeeded', updateCount);
    channel.bind('pusher:member_added', updateCount);
    channel.bind('pusher:member_removed', updateCount);

    return () => {
      pusher.unsubscribe(ONLINE_PRESENCE_CHANNEL);
    };
  }, [status]);

  return <OnlineCountContext.Provider value={count}>{children}</OnlineCountContext.Provider>;
}

/** Null while not yet known (still connecting, or not signed in). */
export function useOnlineCount(): number | null {
  return useContext(OnlineCountContext);
}
