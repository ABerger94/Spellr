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

export function useGameState(gameId: string) {
  const { socketRef, connected } = useSocket();
  const [state, setState] = useState<GameStateView | null>(null);
  const [log, setLog] = useState<GameLogEntry[]>([]);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/games/${gameId}/events`)
      .then((res) => res.json())
      .then((data) => setLog(data.events ?? []))
      .catch(() => undefined);
  }, [gameId]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    function onState(s: GameStateView) {
      setState(s);
    }
    function onLog(event: GameLogEntry) {
      setLog((prev) => [...prev, event]);
    }

    socket.on('game:state', onState);
    socket.on('game:log', onLog);

    socket.emit('game:join', { gameId }, (res: { ok: boolean; error?: string }) => {
      if (!res.ok) setJoinError(res.error ?? 'Failed to join game');
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
