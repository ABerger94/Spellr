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

export interface GameInfo {
  id: string;
  hostUserId: string;
  maxSeats: number;
  inviteCode: string;
}

export function useGameState(gameId: string) {
  const [state, setState] = useState<GameStateView | null>(null);
  const [gameInfo, setGameInfo] = useState<GameInfo | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const stateRef = useRef<GameStateView | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pusher: ReturnType<typeof getPusherClient> | null = null;
    let seatChannelName: string | null = null;
    const presenceChannelName = `presence-game-${gameId}`;

    async function init() {
      try {
        pusher = getPusherClient();
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : 'Realtime connection failed to initialize');
        return;
      }

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
      setGameInfo(data.game);
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

    init().catch((err) => {
      console.error('[useGameState] init failed', err);
      if (!cancelled) setJoinError(err instanceof Error ? err.message : 'Failed to load game');
    });

    return () => {
      cancelled = true;
      if (pusher) {
        pusher.unsubscribe(presenceChannelName);
        if (seatChannelName) pusher.unsubscribe(seatChannelName);
      }
    };
  }, [gameId]);

  const sendAction = useCallback(
    async (action: GameActionPayload) => {
      const res = await fetch(`/api/games/${gameId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setActionError(data.error ?? 'Action failed');
        return;
      }
      setActionError(null);
      // Apply our own resulting state immediately rather than waiting on the
      // realtime broadcast — this is what made every action (draw, tap, life
      // changes, ...) look like it silently did nothing when the broadcast
      // was slow, dropped, or never configured correctly.
      if (data.state) {
        setState(data.state);
        stateRef.current = data.state;
      }
      // Same issue as state: the game log otherwise only updates via the
      // realtime broadcast, so our own actions wouldn't show up in our own
      // log until some other refresh happened to fire.
      if (data.event) {
        setLog((prev) => mergeLogEntries(prev, [data.event]));
      }
    },
    [gameId],
  );

  // A direct fallback for state-changing calls made outside the action
  // pipeline (e.g. starting the game) — don't rely solely on the realtime
  // push landing, since a dropped/delayed Pusher message shouldn't leave a
  // player stuck looking at a stale view.
  const refreshState = useCallback(async () => {
    const [stateRes, eventsRes] = await Promise.all([
      fetch(`/api/games/${gameId}`),
      fetch(`/api/games/${gameId}/events`),
    ]);
    if (stateRes.ok) {
      const data = await stateRes.json();
      setState(data.state);
      stateRef.current = data.state;
      setGameInfo(data.game);
    }
    if (eventsRes.ok) {
      const eventsData = await eventsRes.json().catch(() => ({}));
      setLog((prev) => mergeLogEntries(prev, eventsData.events ?? []));
    }
  }, [gameId]);

  return { state, gameInfo, log, joinError, actionError, sendAction, onlineUserIds, refreshState };
}
