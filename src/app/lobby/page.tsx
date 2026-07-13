'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout/NavBar';
import { BRACKET_OPTIONS, bracketTagLabel } from '@/lib/bracket';

interface GamePlayer {
  seat: number;
  userId: string | null;
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
  bracket: number;
  players: GamePlayer[];
}

function BracketTag({ bracket }: { bracket: number }) {
  return (
    <span className="rounded bg-accent2/20 px-1.5 py-0.5 text-[10px] font-medium text-accent2" title={bracketTagLabel(bracket)}>
      B{bracket}
    </span>
  );
}

export default function LobbyPage() {
  const router = useRouter();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [openGames, setOpenGames] = useState<GameSummary[]>([]);
  const [format, setFormat] = useState<'COMMANDER' | 'ONE_V_ONE'>('COMMANDER');
  const [seatCount, setSeatCount] = useState(4);
  const [isPublic, setIsPublic] = useState(true);
  const [bracket, setBracket] = useState(3);
  const [inviteCode, setInviteCode] = useState('');
  const [spectateInviteCode, setSpectateInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [gamesRes, openGamesRes] = await Promise.all([fetch('/api/games'), fetch('/api/games/open')]);
    const gamesData = await gamesRes.json();
    const openGamesData = await openGamesRes.json();
    setGames(gamesData.games ?? []);
    setOpenGames(openGamesData.games ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    setError(null);
    const res = await fetch('/api/games', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format,
        seatCount: format === 'COMMANDER' ? seatCount : undefined,
        isPublic,
        bracket,
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
    if (!inviteCode.trim()) {
      setError('Enter an invite code');
      return;
    }
    const res = await fetch('/api/games/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: inviteCode.trim() }),
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
    const res = await fetch(`/api/games/${gameId}/join`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to join game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  async function handleSpectateOpenGame(gameId: string) {
    setError(null);
    const res = await fetch(`/api/games/${gameId}/spectate`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to spectate game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  async function handleSpectateByCode() {
    setError(null);
    if (!spectateInviteCode.trim()) {
      setError('Enter an invite code');
      return;
    }
    const res = await fetch('/api/games/spectate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: spectateInviteCode.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? 'Failed to spectate game');
      return;
    }
    router.push(`/game/${data.game.id}`);
  }

  return (
    <div className="relative min-h-screen">
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center opacity-[0.22]"
        style={{ backgroundImage: "url('/images/lobby-bg.jpg')" }}
      />
      <div className="relative z-10">
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <h1 className="mb-6 text-2xl font-semibold text-white">Lobby</h1>

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
                  <label className="mb-1 block text-sm text-slate-300">Bracket (power level)</label>
                  <select
                    value={bracket}
                    onChange={(e) => setBracket(Number(e.target.value))}
                    className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                  >
                    {BRACKET_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {bracketTagLabel(b)}
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
                <p className="text-xs text-slate-500">You&apos;ll pick your deck in the lobby waiting room after creating.</p>
              </div>
            </section>

            <div className="flex flex-col gap-6">
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
                  <button onClick={handleJoin} className="w-full rounded bg-panelLight px-3 py-2 font-medium text-white hover:bg-white/10">
                    Join game
                  </button>
                  <p className="text-xs text-slate-500">You&apos;ll pick your deck in the lobby waiting room after joining.</p>
                </div>
              </section>

              <section className="rounded-lg border border-white/10 bg-panel p-5">
                <h2 className="mb-4 text-lg font-medium text-white">Spectate a game</h2>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-slate-300">Invite code</label>
                    <input
                      value={spectateInviteCode}
                      onChange={(e) => setSpectateInviteCode(e.target.value)}
                      className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white"
                    />
                  </div>
                  <button
                    onClick={handleSpectateByCode}
                    className="w-full rounded bg-panelLight px-3 py-2 font-medium text-white hover:bg-white/10"
                  >
                    👁 Spectate game
                  </button>
                  <p className="text-xs text-slate-500">
                    Watch without taking a seat — you can read text chat and the game log, but can&apos;t play cards, take
                    actions, or use voice chat.
                  </p>
                </div>
              </section>

              <section className="flex flex-1 flex-col rounded-lg border border-white/10 bg-panel p-5">
                <h2 className="mb-4 text-lg font-medium text-white">Your games</h2>
                {games.length === 0 ? (
                  <p className="text-slate-400">No games yet — create one on the left.</p>
                ) : (
                  <div className="space-y-2">
                    {games.map((g) => (
                      <div
                        key={g.id}
                        className="flex items-center justify-between rounded border border-white/10 bg-panelLight px-4 py-3"
                      >
                        <div>
                          <p className="flex items-center gap-2 text-white">
                            {g.format === 'COMMANDER' ? 'Commander' : '1v1'} · {g.status} · {g.players.length}/{g.maxSeats} seats
                            <BracketTag bracket={g.bracket} />
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
            </div>
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
                  const host = g.players.find((p) => p.userId === g.hostUserId);
                  const full = g.players.length >= g.maxSeats;
                  return (
                    <div
                      key={g.id}
                      className="flex items-center justify-between rounded border border-white/10 bg-panel px-4 py-3"
                    >
                      <div>
                        <p className="flex items-center gap-2 text-white">
                          {g.format === 'COMMANDER' ? 'Commander' : '1v1'} · {g.status === 'ACTIVE' ? 'In progress' : `${g.players.length}/${g.maxSeats} seats`}
                          <BracketTag bracket={g.bracket} />
                        </p>
                        <p className="text-xs text-slate-500">Hosted by {host?.user?.displayName ?? 'Unknown'}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        {g.status === 'LOBBY' && (
                          <button
                            onClick={() => handleJoinOpenGame(g.id)}
                            disabled={full}
                            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {full ? 'Full' : 'Join'}
                          </button>
                        )}
                        <button
                          onClick={() => handleSpectateOpenGame(g.id)}
                          className="rounded bg-panelLight px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
                        >
                          👁 Spectate
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
