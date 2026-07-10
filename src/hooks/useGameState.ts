'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PresenceChannel } from 'pusher-js';
import { getPusherClient } from '@/lib/pusherClient';
import type { GameActionPayload, GameStateView } from '@/types/game';

export interface GameLogEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actorSeat: number | null;
  createdAt: string;
}

interface PresenceMember {
  id: string;
}

const MAX_LOG_ENTRIES = 500;

function mergeLogEntries(existing: GameLogEntry[], incoming: GameLogEntry[]): GameLogEntry[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const event of incoming) byId.set(event.id, event);
  const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged.length > MAX_LOG_ENTRIES ? merged.slice(merged.length - MAX_LOG_ENTRIES) : merged;
}

export function useGameState(gameId: string) {
  const [state, setState] = useState<GameStateView | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const stateRef = useRef<GameStateView | null>(null);

  useEffect(() => {
    let cancelled = false;
    const pusher = getPusherClient();
    let seatChannelName: string | null = null;
    const presenceChannelName = `presence-game-${gameId}`;

    async function init() {
      // Resolve our own seat + initial state via REST first — the per-seat
      // private channel's name depends on knowing our seat.
      const res = await fetch(`/api/games/${gameId}`);
      if (cancelled) return;
      if (!res.ok) {
        setJoinError('You are not a player in this game');
        return;
      }
      const data = await res.json();
      if (cancelled) return;
      setState(data.state);
      stateRef.current = data.state;
      setJoinError(null);

      const presenceChannel = pusher.subscribe(presenceChannelName) as PresenceChannel;
      presenceChannel.bind('pusher:subscription_succeeded', () => {
        const ids = new Set<string>();
        presenceChannel.members.each((m: PresenceMember) => ids.add(m.id));
        setOnlineUserIds(ids);
      });
      presenceChannel.bind('pusher:member_added', (m: PresenceMember) => {
        setOnlineUserIds((prev) => new Set(prev).add(m.id));
      });
      presenceChannel.bind('pusher:member_removed', (m: PresenceMember) => {
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          next.delete(m.id);
          return next;
        });
      });
      presenceChannel.bind('game:log', (event: GameLogEntry) => {
        setLog((prev) => mergeLogEntries(prev, [event]));
      });

      const viewerSeat: number | null = data.state.viewerSeat;
      if (viewerSeat !== null) {
        seatChannelName = `private-game-${gameId}-seat-${viewerSeat}`;
        const seatChannel = pusher.subscribe(seatChannelName);
        seatChannel.bind('game:state', (s: GameStateView) => {
          setState(s);
          stateRef.current = s;
        });
      }

      const eventsRes = await fetch(`/api/games/${gameId}/events`);
      const eventsData = await eventsRes.json().catch(() => ({}));
      if (!cancelled) setLog((prev) => mergeLogEntries(prev, eventsData.events ?? []));
    }

    init();

    return () => {
      cancelled = true;
      pusher.unsubscribe(presenceChannelName);
      if (seatChannelName) pusher.unsubscribe(seatChannelName);
    };
  }, [gameId]);

  const sendAction = useCallback(
    async (action: GameActionPayload) => {
      const res = await fetch(`/api/games/${gameId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('[sendAction]', data.error ?? 'Action failed');
      }
    },
    [gameId],
  );

  return { state, log, joinError, sendAction, onlineUserIds };
}
