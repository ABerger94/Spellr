'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useGameState } from '@/hooks/useGameState';
import { NavBar } from '@/components/layout/NavBar';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { BattlefieldZone } from '@/components/game/BattlefieldZone';
import { HandZone } from '@/components/game/HandZone';
import { LibraryStack } from '@/components/game/LibraryStack';
import { PublicZoneStack } from '@/components/game/PublicZoneStack';
import { CommandZone } from '@/components/game/CommandZone';
import { GameLog } from '@/components/game/GameLog';
import { GameLobbyWait } from '@/components/game/GameLobbyWait';
import { ScryModal } from '@/components/game/ScryModal';
import { MobileActionBar } from '@/components/game/MobileActionBar';
import { CardContextMenu, type ContextMenuOption } from '@/components/game/CardContextMenu';

export default function GameTablePage() {
  const params = useParams<{ gameId: string }>();
  const { data: session } = useSession();
  const { state, gameInfo, log, joinError, actionError, sendAction, onlineUserIds, refreshState } = useGameState(params.gameId);
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const isMyTurn = state?.status === 'ACTIVE' && state.currentTurnSeat === state.viewerSeat;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (!state || state.status !== 'ACTIVE') return;

      if (e.key === 'Escape') {
        setMenu(null);
        return;
      }
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        sendAction({ type: 'DRAW_CARD' });
        return;
      }
      if ((e.key === ' ' || e.key === 'Enter') && isMyTurn) {
        e.preventDefault();
        sendAction({ type: 'PASS_TURN' });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state, isMyTurn, sendAction]);

  if (joinError) {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-red-400">{joinError}</p>
        </main>
      </div>
    );
  }

  if (!state || !gameInfo) {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-slate-400">Loading game…</p>
        </main>
      </div>
    );
  }

  if (state.status === 'LOBBY') {
    const userId = (session?.user as { id?: string } | undefined)?.id;
    return (
      <div>
        <NavBar />
        <GameLobbyWait state={state} gameInfo={gameInfo} isHost={userId === gameInfo.hostUserId} onStarted={refreshState} />
      </div>
    );
  }

  const me = state.players.find((p) => p.seat === state.viewerSeat);
  const opponents = state.players.filter((p) => p.seat !== state.viewerSeat);

  const displayName = (seat: number | null) =>
    seat === null ? 'System' : state.players.find((p) => p.seat === seat)?.displayName ?? `Seat ${seat}`;

  return (
    <div className="flex h-screen flex-col">
      <NavBar />

      <div className="flex items-center justify-between border-b border-white/10 bg-panel px-4 py-1.5 text-xs text-slate-400">
        <span className="hidden truncate sm:inline">
          Tap a card to play/draw it · tap ⋯ on a card for more options · use the bar at the bottom for draw/scry/surveil/pass ·
          keyboard: <kbd className="rounded bg-panelLight px-1">D</kbd> draw, <kbd className="rounded bg-panelLight px-1">Space</kbd> pass turn
        </span>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="ml-auto rounded bg-panelLight px-2 py-0.5 hover:bg-white/10 sm:ml-0"
        >
          {showHelp ? 'Hide help' : '? Help'}
        </button>
      </div>

      {showHelp && (
        <div className="border-b border-white/10 bg-panel px-4 py-3 text-sm text-slate-300">
          <p className="mb-1">
            <strong>Draw:</strong> tap your library (the card-back stack) for one card instantly, or press{' '}
            <kbd className="rounded bg-panelLight px-1">D</kbd> on a keyboard. The Draw button at the bottom of the
            screen lets you pick a number first — e.g. draw 7 for your opening hand.
          </p>
          <p className="mb-1">
            <strong>Play a card:</strong> tap it in your hand — lands/creatures/artifacts/etc. go to the battlefield; the
            platform doesn&apos;t know mana costs or the stack, so anything playable just resolves immediately.
          </p>
          <p className="mb-1">
            <strong>Tap/untap:</strong> tap a permanent on your battlefield.
          </p>
          <p className="mb-1">
            <strong>Discard, exile, sacrifice, bounce, top/bottom of library:</strong> tap the ⋯ button on a card (in
            hand or on the battlefield) — or right-click it on desktop — for a move-to-zone menu.
          </p>
          <p className="mb-1">
            <strong>Scry / Surveil:</strong> use the Scry/Surveil buttons in the bar at the bottom of the screen, pick
            how many cards, then choose top/bottom (scry) or top/graveyard (surveil) for each card revealed.
          </p>
          <p className="mb-1">
            <strong>Life:</strong> the −/+ buttons next to any player&apos;s name adjust their life (you can adjust
            opponents&apos; life too — e.g. to deal combat damage — same as you would with paper life pads).
          </p>
          <p>
            <strong>Not yet built:</strong> counters beyond the basics and combat damage math — for now, resolve
            those by hand using life adjustments and the move-to-zone menu.
          </p>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm text-red-400">
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 overflow-hidden p-4 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {/* Opponents */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {opponents.map((p) => (
              <div key={p.seat} className="rounded-lg border border-white/10 bg-panel p-3">
                <PlayerPanel
                  player={p}
                  isViewer={false}
                  isActiveTurn={state.currentTurnSeat === p.seat}
                  isOnline={p.isAI || (p.userId !== null && onlineUserIds.has(p.userId))}
                  onLifeChange={(delta) => sendAction({ type: 'ADJUST_LIFE', seat: p.seat, delta })}
                />
                <div className="mt-2 flex items-center gap-2">
                  <LibraryStack count={p.libraryCount} />
                  <PublicZoneStack label="Graveyard" scryfallIds={p.graveyard} cards={state.cards} />
                  <PublicZoneStack label="Exile" scryfallIds={p.exile} cards={state.cards} />
                  {state.format === 'COMMANDER' && <CommandZone scryfallIds={p.commandZone} cards={state.cards} />}
                  <span className="text-xs text-slate-500">Hand: {p.handCount}</span>
                </div>
                <div className="mt-2">
                  <BattlefieldZone battlefield={p.battlefield} cards={state.cards} interactive={false} />
                </div>
              </div>
            ))}
          </div>

          {/* Turn indicator */}
          <div className="text-center text-xs text-slate-500">
            Turn {state.turnNumber} · {displayName(state.currentTurnSeat)}&apos;s turn
          </div>

          {/* My side */}
          {me && (
            <div className="rounded-lg border border-accent/30 bg-panel p-3">
              <PlayerPanel
                player={me}
                isViewer
                isActiveTurn={state.currentTurnSeat === me.seat}
                isOnline
                onLifeChange={(delta) => sendAction({ type: 'ADJUST_LIFE', seat: me.seat, delta })}
              />
              <div className="mt-2 flex items-center gap-2">
                <LibraryStack count={me.libraryCount} onDraw={() => sendAction({ type: 'DRAW_CARD' })} />
                <PublicZoneStack label="Graveyard" scryfallIds={me.graveyard} cards={state.cards} />
                <PublicZoneStack label="Exile" scryfallIds={me.exile} cards={state.cards} />
                {state.format === 'COMMANDER' && (
                  <CommandZone
                    scryfallIds={me.commandZone}
                    cards={state.cards}
                    onPlay={(scryfallId) => sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'commandZone' })}
                  />
                )}
                {state.currentTurnSeat === me.seat && (
                  <button
                    onClick={() => sendAction({ type: 'PASS_TURN' })}
                    className="ml-auto rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
                  >
                    Pass turn
                  </button>
                )}
              </div>
              <div className="mt-2">
                <BattlefieldZone
                  battlefield={me.battlefield}
                  cards={state.cards}
                  interactive
                  onTapToggle={(instanceId, tapped) =>
                    sendAction(tapped ? { type: 'UNTAP_CARD', instanceId } : { type: 'TAP_CARD', instanceId })
                  }
                  onContextMenu={(e, card) =>
                    setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      options: [
                        {
                          label: 'Move to graveyard',
                          onClick: () =>
                            sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'graveyard', instanceId: card.instanceId }),
                        },
                        {
                          label: 'Exile',
                          onClick: () =>
                            sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'exile', instanceId: card.instanceId }),
                        },
                        {
                          label: 'Return to hand',
                          onClick: () =>
                            sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'hand', instanceId: card.instanceId }),
                        },
                        {
                          label: 'Put on top of library',
                          onClick: () =>
                            sendAction({
                              type: 'MOVE_CARD',
                              fromZone: 'battlefield',
                              toZone: 'library',
                              instanceId: card.instanceId,
                              position: 'top',
                            }),
                        },
                        {
                          label: 'Put on bottom of library',
                          onClick: () =>
                            sendAction({
                              type: 'MOVE_CARD',
                              fromZone: 'battlefield',
                              toZone: 'library',
                              instanceId: card.instanceId,
                              position: 'bottom',
                            }),
                        },
                      ],
                    })
                  }
                />
              </div>
              <div className="mt-3 border-t border-white/10 pt-2">
                <HandZone
                  hand={me.hand ?? []}
                  cards={state.cards}
                  onPlay={(scryfallId) => sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'hand' })}
                  onContextMenu={(e, scryfallId) =>
                    setMenu({
                      x: e.clientX,
                      y: e.clientY,
                      options: [
                        {
                          label: 'Discard',
                          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: 'hand', toZone: 'graveyard', scryfallId }),
                        },
                        {
                          label: 'Exile from hand',
                          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: 'hand', toZone: 'exile', scryfallId }),
                        },
                        {
                          label: 'Put on top of library',
                          onClick: () =>
                            sendAction({ type: 'MOVE_CARD', fromZone: 'hand', toZone: 'library', scryfallId, position: 'top' }),
                        },
                        {
                          label: 'Put on bottom of library',
                          onClick: () =>
                            sendAction({ type: 'MOVE_CARD', fromZone: 'hand', toZone: 'library', scryfallId, position: 'bottom' }),
                        },
                      ],
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="h-40 flex-shrink-0 lg:h-auto lg:w-72">
          <GameLog events={log} displayName={displayName} />
        </div>
      </div>

      {me && (
        <MobileActionBar
          isMyTurn={!!isMyTurn}
          lookInProgress={me.pendingLook.length > 0}
          onDraw={(count) => sendAction({ type: 'DRAW_CARD', count })}
          onScry={(count) => sendAction({ type: 'SCRY', count })}
          onSurveil={(count) => sendAction({ type: 'SURVEIL', count })}
          onPassTurn={() => sendAction({ type: 'PASS_TURN' })}
        />
      )}

      {menu && <CardContextMenu x={menu.x} y={menu.y} options={menu.options} onClose={() => setMenu(null)} />}

      {me && me.pendingLookMode && me.pendingLook.length > 0 && (
        <ScryModal
          mode={me.pendingLookMode}
          cards={me.pendingLook}
          cardFacts={state.cards}
          onResolve={(scryfallId, destination) => sendAction({ type: 'RESOLVE_LOOK', scryfallId, destination })}
        />
      )}
    </div>
  );
}
