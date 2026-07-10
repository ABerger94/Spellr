'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import type { GameActionPayload, GameStateView } from '@/types/game';

export interface GameLogEntry {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  actorSeat: number | null;
  createdAt: string;
}

const MAX_LOG_ENTRIES = 500;

function mergeLogEntries(existing: GameLogEntry[], incoming: GameLogEntry[]): GameLogEntry[] {
  const byId = new Map(existing.map((e) => [e.id, e]));
  for (const event of incoming) byId.set(event.id, event);
  const merged = [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return merged.length > MAX_LOG_ENTRIES ? merged.slice(merged.length - MAX_LOG_ENTRIES) : merged;
}

export function useGameState(gameId: string) {
  const { socketRef, connected } = useSocket();
  const [state, setState] = useState<GameStateView | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/games/${gameId}/events`)
      .then((res) => res.json())
      // Merge rather than replace: a game:log event may already have arrived
      // over the socket before this REST fetch resolves.
      .then((data) => setLog((prev) => mergeLogEntries(prev, data.events ?? [])))
      .catch(() => undefined);
  }, [gameId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    function onState(s: GameStateView) {
      setState(s);
    }
    function onLog(event: GameLogEntry) {
      setLog((prev) => mergeLogEntries(prev, [event]));
    }

    socket.on('game:state', onState);
    socket.on('game:log', onLog);

    socket.emit('game:join', { gameId }, (res: { ok: boolean; error?: string }) => {
      if (res.ok) {
        setJoinError(null);
        // Pick up anything logged between the initial REST fetch and this
        // socket actually joining the room (and thus starting to receive game:log).
        fetch(`/api/games/${gameId}/events`)
          .then((r) => r.json())
          .then((data) => setLog((prev) => mergeLogEntries(prev, data.events ?? [])))
          .catch(() => undefined);
      } else {
        setJoinError(res.error ?? 'Failed to join game');
      }
    });

    return () => {
      socket.off('game:state', onState);
      socket.off('game:log', onLog);
    };
  }, [gameId, connected, socketRef]);

  const sendAction = useCallback(
    (action: GameActionPayload) => {
      socketRef.current?.emit('game:action', { gameId, action });
    },
    [gameId, socketRef],
  );

  return { state, log, connected, joinError, sendAction };
}
