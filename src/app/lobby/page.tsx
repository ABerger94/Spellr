'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout/NavBar';
import { useOnlineCount } from '@/components/layout/OnlineCountProvider';

interface Deck {
  id: string;
  name: string;
  format: 'COMMANDER' | 'STANDARD_1V1';
  cards: { quantity: number }[];
}

function cardCount(deck: Deck): number {
  return deck.cards.reduce((sum, c) => sum + c.quantity, 0);
}

interface GamePlayer {
  seat: number;
  isAI: boolean;
  aiPersona: string | null;
  user: { displayName: string } | null;
}

interface GameSummary {
  id: string;
  format: 'ONE_V_ONE' | 'COMMANDER';
  status: 'LOBBY' | 'ACTIVE' | 'FINISHED';
  maxSeats: number;
  hostUserId: string;
  inviteCode: string;
  players: GamePlayer[];
}

export default function LobbyPage() {
  const router = useRouter();
  const { count: onlineCount, errored: onlineCountErrored } = useOnlineCount();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [openGames, setOpenGames] = useState<GameSummary[]>([]);
  const [format, setFormat] = useState<'COMMANDER' | 'ONE_V_ONE'>('COMMANDER');
  const [deckId, setDeckId] = useState('');
  const [seatCount, setSeatCount] = useState(4);
  const [isPublic, setIsPublic] = useState(true);
  const [inviteCode, setInviteCode] = useState('');
  const [joinDeckId, setJoinDeckId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [decksRes, gamesRes, openGamesRes] = await Promise.all([
      fetch('/api/decks'),
      fetch('/api/games'),
      fetch('/api/games/open'),
    ]);
    const decksData = await decksRes.json();
    const gamesData = await gamesRes.json();
    const openGamesData = await openGamesRes.json();
    setDecks(decksData.decks ?? []);
    setGames(gamesData.games ?? []);
    setOpenGames(openGamesData.games ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decksForFormat = decks.filter((d) => d.format === (format === 'COMMANDER' ? 'COMMANDER' : 'STANDARD_1V1'));

  async function handleCreate() {
    setError(null);
    if (!deckId) {
      setError('Pick a deck first');
      return;
    }
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format,
        deckId,
        seatCount: format === 'COMMANDER' ? seatCount : undefined,
        isPublic,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to create game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  async function handleJoin() {
    setError(null);
    if (!inviteCode.trim() || !joinDeckId) {
      setError('Enter an invite code and pick a deck');
      return;
    }
    const res = await fetch('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: inviteCode.trim(), deckId: joinDeckId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to join game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  async function handleJoinOpenGame(gameId: string) {
    setError(null);
    if (!joinDeckId) {
      setError('Pick a deck in "Join a game" first, then tap Join on an open game below');
      return;
    }
    const res = await fetch(`/api/games/${gameId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: joinDeckId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to join game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Lobby</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-panel px-2.5 py-1 text-xs text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                onlineCountErrored ? 'bg-red-400' : onlineCount !== null ? 'bg-emerald-400' : 'bg-slate-600'
              }`}
            />
            {onlineCountErrored
              ? 'Realtime unavailable'
              : onlineCount !== null
                ? `${onlineCount} player${onlineCount === 1 ? '' : 's'} online`
                : 'Connecting…'}
          </span>
        </div>

        {error && <p className="mb-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-white/10 bg-panel p-5">
            <h2 className="mb-4 text-lg font-medium text-white">Create a game</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-slate-300">Format</label>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'COMMANDER' | 'ONE_V_ONE')}
                  className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                >
                  <option value="COMMANDER">Commander</option>
                  <option value="ONE_V_ONE">1v1</option>
                </select>
              </div>
              {format === 'COMMANDER' && (
                <div>
                  <label className="mb-1 block text-sm text-slate-300">Seats</label>
                  <select
                    value={seatCount}
                    onChange={(e) => setSeatCount(Number(e.target.value))}
                    className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                  >
                    {[2, 3, 4].map((n) => (
                      <option key={n} value={n}>
                        {n} players
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm text-slate-300">Your deck</label>
                <select
                  value={deckId}
                  onChange={(e) => setDeckId(e.target.value)}
                  className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                >
                  <option value="">Select a deck…</option>
                  {decksForFormat.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({cardCount(d)} cards)
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
                Public — listed in Open games below for anyone to join (uncheck for invite-only)
              </label>
              <button onClick={handleCreate} className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent/80">
                Create game
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-white/10 bg-panel p-5">
            <h2 className="mb-4 text-lg font-medium text-white">Join a game</h2>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-slate-300">Invite code</label>
                <input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-300">Your deck</label>
                <select
                  value={joinDeckId}
                  onChange={(e) => setJoinDeckId(e.target.value)}
                  className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                >
                  <option value="">Select a deck…</option>
                  {decks.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.format === 'COMMANDER' ? 'Commander' : '1v1'}, {cardCount(d)} cards)
                    </option>
                  ))}
                </select>
              </div>
              <button onClick={handleJoin} className="w-full rounded bg-panelLight px-3 py-2 font-medium text-white hover:bg-white/10">
                Join game
              </button>
            </div>
          </section>
        </div>

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">Open games</h2>
            <button onClick={load} className="text-xs text-slate-400 hover:text-white">
              ↻ Refresh
            </button>
          </div>
          {openGames.length === 0 ? (
            <p className="text-slate-400">
              No public games waiting for players right now — create one above, or ask a friend for their invite code.
            </p>
          ) : (
            <div className="space-y-2">
              {openGames.map((g) => {
                const host = g.players.find((p) => p.seat === 0);
                const full = g.players.length >= g.maxSeats;
                return (
                  <div
                    key={g.id}
                    className="flex items-center justify-between rounded border border-white/10 bg-panel px-4 py-3"
                  >
                    <div>
                      <p className="text-white">
                        {g.format === 'COMMANDER' ? 'Commander' : '1v1'} · {g.players.length}/{g.maxSeats} seats
                      </p>
                      <p className="text-xs text-slate-500">Hosted by {host?.user?.displayName ?? 'Unknown'}</p>
                    </div>
                    <button
                      onClick={() => handleJoinOpenGame(g.id)}
                      disabled={full}
                      className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {full ? 'Full' : 'Join'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-4 text-lg font-medium text-white">Your games</h2>
          {games.length === 0 ? (
            <p className="text-slate-400">No games yet — create one above.</p>
          ) : (
            <div className="space-y-2">
              {games.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between rounded border border-white/10 bg-panel px-4 py-3"
                >
                  <div>
                    <p className="text-white">
                      {g.format === 'COMMANDER' ? 'Commander' : '1v1'} · {g.status} · {g.players.length}/{g.maxSeats} seats
                    </p>
                    <p className="text-xs text-slate-500">Invite code: {g.inviteCode}</p>
                  </div>
                  <button
                    onClick={() => router.push(`/game/${g.id}`)}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/80"
                  >
                    {g.status === 'LOBBY' ? 'Enter lobby' : 'Resume'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
