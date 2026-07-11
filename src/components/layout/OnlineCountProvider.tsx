'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import type { PresenceChannel } from 'pusher-js';
import { getPusherClient } from '@/lib/pusherClient';

const ONLINE_PRESENCE_CHANNEL = 'presence-online';

export interface OnlineCountState {
  count: number | null;
  /** True once we know the channel will never connect (bad Pusher config, a
   * rejected auth request, etc.) — lets the UI stop saying "Connecting…"
   * forever and show something more honest instead. */
  errored: boolean;
}

const OnlineCountContext = createContext<OnlineCountState>({ count: null, errored: false });

/** Tracks how many authenticated users are connected anywhere in the app via
 * one shared presence channel subscribed here at the provider level (mounted
 * once in the root layout) — so the count doesn't flicker as a user
 * navigates between pages, and every page shares a single subscription
 * instead of each mounting its own. */
export function OnlineCountProvider({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const [state, setState] = useState<OnlineCountState>({ count: null, errored: false });

  useEffect(() => {
    if (status !== 'authenticated') {
      setState({ count: null, errored: false });
      return;
    }

    let pusher: ReturnType<typeof getPusherClient>;
    try {
      pusher = getPusherClient();
    } catch (err) {
      // Previously swallowed silently, which left the lobby badge stuck on
      // "Connecting…" forever with zero indication of why (usually
      // NEXT_PUBLIC_PUSHER_KEY/CLUSTER missing or stale from before a
      // redeploy) — log it so it's actually diagnosable from devtools.
      console.error('[OnlineCountProvider] Pusher client unavailable', err);
      setState({ count: null, errored: true });
      return;
    }

    const channel = pusher.subscribe(ONLINE_PRESENCE_CHANNEL) as PresenceChannel;
    const updateCount = () => setState({ count: channel.members.count, errored: false });
    channel.bind('pusher:subscription_succeeded', updateCount);
    channel.bind('pusher:member_added', updateCount);
    channel.bind('pusher:member_removed', updateCount);
    channel.bind('pusher:subscription_error', (err: unknown) => {
      console.error('[OnlineCountProvider] presence-online subscription failed', err);
      setState({ count: null, errored: true });
    });

    return () => {
      pusher.unsubscribe(ONLINE_PRESENCE_CHANNEL);
    };
  }, [status]);

  return <OnlineCountContext.Provider value={state}>{children}</OnlineCountContext.Provider>;
}

/** { count: null, errored: false } while still connecting or not signed in. */
export function useOnlineCount(): OnlineCountState {
  return useContext(OnlineCountContext);
}
