'use client';

import { useState } from 'react';
import type { GameStateView } from '@/types/game';
import type { GameInfo } from '@/hooks/useGameState';

export function GameLobbyWait({
  state,
  gameInfo,
  isHost,
  onStarted,
  onCancelled,
  onSeatsChanged,
}: {
  state: GameStateView;
  gameInfo: GameInfo;
  isHost: boolean;
  onStarted: () => void | Promise<void>;
  onCancelled: () => void | Promise<void>;
  onSeatsChanged: () => void | Promise<void>;
}) {
  const [starting, setStarting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [fillingAI, setFillingAI] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    const res = await fetch(`/api/games/${gameInfo.id}/start`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to start game');
      setStarting(false);
      return;
    }
    // Don't rely solely on the realtime push landing — fetch the new state
    // directly so a dropped/delayed Pusher message can't strand the host on
    // this screen even though the game did actually start.
    await onStarted();
  }

  async function handleFillAI() {
    setFillingAI(true);
    setError(null);
    const res = await fetch(`/api/games/${gameInfo.id}/fill-ai`, { method: 'POST' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to fill seats with AI');
      setFillingAI(false);
      return;
    }
    await onSeatsChanged();
    setFillingAI(false);
  }

  async function handleCancel() {
    if (!window.confirm('Cancel this game? It will be removed for everyone in the lobby.')) return;
    setCancelling(true);
    setError(null);
    const res = await fetch(`/api/games/${gameInfo.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to cancel game');
      setCancelling(false);
      return;
    }
    await onCancelled();
  }

  const seats = Array.from({ length: gameInfo.maxSeats }, (_, seat) => state.players.find((p) => p.seat === seat));

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-white">Waiting for players</h1>
      <p className="mb-6 text-sm text-slate-400">
        Invite code: <span className="font-mono text-accent2">{gameInfo.inviteCode}</span>
      </p>

      <div className="mb-6 space-y-2">
        {seats.map((player, seat) => (
          <div key={seat} className="flex items-center justify-between rounded border border-white/10 bg-panel px-4 py-2">
            <span className="text-white">Seat {seat}</span>
            {player ? (
              <span className="text-sm text-slate-300">
                {player.displayName}
                {player.isAI && <span className="ml-1 rounded bg-panelLight px-1 text-[10px] text-slate-400">AI</span>}
              </span>
            ) : (
              <span className="text-sm text-slate-600">Empty seat</span>
            )}
          </div>
        ))}
      </div>

      {!state.aiEnabled && seats.some((p) => p?.isAI) && (
        <p className="mb-4 rounded bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          No GEMINI_API_KEY or GROQ_API_KEY is configured on the server, so AI seats will just pass their turn instead of playing.
        </p>
      )}

      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

      {isHost ? (
        <div className="space-y-2">
          {seats.some((p) => !p) && (
            <button
              onClick={handleFillAI}
              disabled={starting || cancelling || fillingAI}
              className="w-full rounded bg-panelLight px-4 py-2 font-medium text-white hover:bg-white/10 disabled:opacity-50"
            >
              {fillingAI ? 'Filling…' : 'Fill remaining seats with AI'}
            </button>
          )}
          <button
            onClick={handleStart}
            disabled={starting || cancelling || fillingAI}
            className="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {starting ? 'Starting…' : 'Start game'}
          </button>
          <button
            onClick={handleCancel}
            disabled={starting || cancelling || fillingAI}
            className="w-full rounded bg-red-500/10 px-4 py-2 font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel game'}
          </button>
        </div>
      ) : (
        <p className="text-center text-sm text-slate-400">Waiting for the host to start the game…</p>
      )}
    </div>
  );
}
