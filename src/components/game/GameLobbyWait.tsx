'use client';

import { useEffect, useState } from 'react';
import type { GameStateView } from '@/types/game';
import type { GameInfo } from '@/hooks/useGameState';
import { bracketTagLabel } from '@/lib/bracket';

interface Deck {
  id: string;
  name: string;
  format: 'COMMANDER' | 'STANDARD_1V1';
  cards: { quantity: number }[];
}

function cardCount(deck: Deck): number {
  return deck.cards.reduce((sum, c) => sum + c.quantity, 0);
}

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
  const [decks, setDecks] = useState<Deck[]>([]);
  const [selectedDeckId, setSelectedDeckId] = useState('');
  const [savingDeck, setSavingDeck] = useState(false);
  const [togglingReady, setTogglingReady] = useState(false);

  const me = state.players.find((p) => p.seat === state.viewerSeat);
  const decksForFormat = decks.filter((d) => d.format === (state.format === 'COMMANDER' ? 'COMMANDER' : 'STANDARD_1V1'));

  useEffect(() => {
    fetch('/api/decks')
      .then((res) => res.json())
      .then((data) => setDecks(data.decks ?? []))
      .catch(() => {});
  }, []);

  // Keep the dropdown in sync with whatever's actually saved server-side
  // (e.g. after a page reload, or another tab changing it) without
  // clobbering an in-progress local selection.
  useEffect(() => {
    if (me?.deckId) setSelectedDeckId(me.deckId);
  }, [me?.deckId]);

  async function handleSetDeck(deckId: string) {
    setSelectedDeckId(deckId);
    if (!deckId) return;
    setSavingDeck(true);
    setError(null);
    const res = await fetch(`/api/games/${gameInfo.id}/set-deck`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to set deck');
      setSavingDeck(false);
      return;
    }
    await onSeatsChanged();
    setSavingDeck(false);
  }

  async function handleToggleReady() {
    setTogglingReady(true);
    setError(null);
    const res = await fetch(`/api/games/${gameInfo.id}/set-ready`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ready: !me?.isReady }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Failed to update ready status');
      setTogglingReady(false);
      return;
    }
    await onSeatsChanged();
    setTogglingReady(false);
  }

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
  const notReadyCount = seats.filter((p) => p && !p.isAI && (!p.deckId || !p.isReady)).length;
  const canStart = notReadyCount === 0;

  return (
    <div className="mx-auto max-w-lg px-6 py-12">
      <h1 className="mb-2 text-2xl font-semibold text-white">Waiting for players</h1>
      <p className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        Invite code: <span className="font-mono text-accent2">{gameInfo.inviteCode}</span>
        <span className="rounded bg-accent2/20 px-1.5 py-0.5 text-[10px] font-medium text-accent2">
          {bracketTagLabel(gameInfo.bracket)}
        </span>
      </p>

      {me && !me.isAI && (
        <div className="mb-6 rounded border border-white/10 bg-panel p-4">
          <h2 className="mb-2 text-sm font-medium text-white">Your deck</h2>
          <select
            value={selectedDeckId}
            onChange={(e) => handleSetDeck(e.target.value)}
            disabled={savingDeck}
            className="mb-3 w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white disabled:opacity-50"
          >
            <option value="">Select a deck…</option>
            {decksForFormat.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({cardCount(d)} cards)
              </option>
            ))}
          </select>
          {decksForFormat.length === 0 && (
            <p className="mb-3 text-xs text-amber-400">
              You don&apos;t have a {state.format === 'COMMANDER' ? 'Commander' : '1v1'} deck yet — build one from Decks first.
            </p>
          )}
          <button
            onClick={handleToggleReady}
            disabled={togglingReady || !me.deckId}
            className={`w-full rounded px-4 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
              me.isReady ? 'bg-panelLight text-white hover:bg-white/10' : 'bg-green-600 text-white hover:bg-green-500'
            }`}
          >
            {togglingReady ? 'Updating…' : me.isReady ? 'Ready ✓ — click to un-ready' : 'Mark yourself ready'}
          </button>
        </div>
      )}

      <div className="mb-6 space-y-2">
        {seats.map((player, seat) => (
          <div key={seat} className="flex items-center justify-between rounded border border-white/10 bg-panel px-4 py-2">
            <span className="text-white">Seat {seat}</span>
            {player ? (
              <span className="flex items-center gap-2 text-sm text-slate-300">
                {player.displayName}
                {player.isAI && <span className="rounded bg-panelLight px-1 text-[10px] text-slate-400">AI</span>}
                {!player.isAI &&
                  (player.isReady ? (
                    <span className="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-medium text-green-400">Ready</span>
                  ) : player.deckId ? (
                    <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">Not ready</span>
                  ) : (
                    <span className="rounded bg-slate-500/20 px-1.5 py-0.5 text-[10px] font-medium text-slate-400">Picking deck…</span>
                  ))}
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
            disabled={starting || cancelling || fillingAI || !canStart}
            title={canStart ? undefined : 'Every player must pick a deck and mark themselves ready first'}
            className="w-full rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {starting ? 'Starting…' : canStart ? 'Start game' : `Waiting on ${notReadyCount} player${notReadyCount === 1 ? '' : 's'}…`}
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
        <p className="text-center text-sm text-slate-400">
          {me && !me.isAI && !me.isReady
            ? 'Pick a deck and mark yourself ready above.'
            : canStart
              ? 'Waiting for the host to start the game…'
              : 'Waiting for other players to pick a deck and ready up…'}
        </p>
      )}
    </div>
  );
}
