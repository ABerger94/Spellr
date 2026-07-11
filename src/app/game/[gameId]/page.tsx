'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useGameState } from '@/hooks/useGameState';
import { NavBar } from '@/components/layout/NavBar';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { BattlefieldZone } from '@/components/game/BattlefieldZone';
import { HandZone } from '@/components/game/HandZone';
import { LibraryStack } from '@/components/game/LibraryStack';
import { PublicZoneStack } from '@/components/game/PublicZoneStack';
import { CommandZone } from '@/components/game/CommandZone';
import { GameLog } from '@/components/game/GameLog';
import { CardContextMenu, type ContextMenuOption } from '@/components/game/CardContextMenu';
import { CardImage } from '@/components/card/CardImage';

export default function GameTablePage() {
  const params = useParams<{ gameId: string }>();
  const { state, log, connected, joinError, sendAction } = useGameState(params.gameId);
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [mulliganOpen, setMulliganOpen] = useState(false);
  const [selectedBottomCards, setSelectedBottomCards] = useState<string[]>([]);

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

  if (!state) {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-3xl px-6 py-8">
          <p className="text-slate-400">{connected ? 'Joining game…' : 'Connecting…'}</p>
        </main>
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
      <div className="flex flex-1 gap-4 overflow-hidden p-4">
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto">
          {/* Opponents */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {opponents.map((p) => (
              <div key={p.seat} className="rounded-lg border border-white/10 bg-panel p-3">
                <PlayerPanel
                  player={p}
                  isViewer={false}
                  isActiveTurn={state.currentTurnSeat === p.seat}
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
                onLifeChange={(delta) => sendAction({ type: 'ADJUST_LIFE', seat: me.seat, delta })}
              />
              <div className="mt-2 flex items-center gap-2">
                <LibraryStack
                  count={me.libraryCount}
                  onDraw={() => sendAction({ type: 'DRAW_CARD' })}
                  onSearch={() => setLibrarySearchOpen(true)}
                />
                <PublicZoneStack label="Graveyard" scryfallIds={me.graveyard} cards={state.cards} />
                <PublicZoneStack label="Exile" scryfallIds={me.exile} cards={state.cards} />
                {state.format === 'COMMANDER' && (
                  <CommandZone
                    scryfallIds={me.commandZone}
                    cards={state.cards}
                    onPlay={(scryfallId) => sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'commandZone' })}
                  />
                )}
                <div className="ml-auto flex items-center gap-2">
                  {me.hand && me.hand.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (me.mulliganCount > 0) {
                          setSelectedBottomCards([]);
                          setMulliganOpen(true);
                        } else {
                          sendAction({ type: 'MULLIGAN' });
                        }
                      }}
                      className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-600"
                    >
                      Mulligan{me.mulliganCount > 0 ? ` (${me.mulliganCount})` : ''}
                    </button>
                  )}
                  {state.currentTurnSeat === me.seat && (
                    <button
                      onClick={() => sendAction({ type: 'PASS_TURN' })}
                      className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
                    >
                      Pass turn
                    </button>
                  )}
                </div>
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
                      ],
                    })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="w-72 flex-shrink-0">
          <GameLog events={log} displayName={displayName} />
        </div>
      </div>

      {menu && <CardContextMenu x={menu.x} y={menu.y} options={menu.options} onClose={() => setMenu(null)} />}

      {librarySearchOpen && me && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Search your library</h3>
                <p className="text-sm text-slate-400">Choose a card to move from your library to your hand or exile.</p>
              </div>
              <button type="button" onClick={() => setLibrarySearchOpen(false)} className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                Close
              </button>
            </div>

            {me.library && me.library.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {me.library.map((scryfallId, index) => {
                  const facts = state.cards[scryfallId];
                  return (
                    <div key={`${scryfallId}-${index}`} className="rounded border border-white/10 bg-panel p-2">
                      <CardImage name={facts?.name ?? scryfallId} imageUrl={facts?.imageNormal} />
                      <div className="mt-2 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'hand', scryfallId });
                            setLibrarySearchOpen(false);
                          }}
                          className="rounded bg-accent px-2 py-1 text-sm text-white hover:bg-accent/80"
                        >
                          To hand
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'exile', scryfallId });
                            setLibrarySearchOpen(false);
                          }}
                          className="rounded bg-slate-700 px-2 py-1 text-sm text-white hover:bg-slate-600"
                        >
                          Exile
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Your library is empty.</p>
            )}
          </div>
        </div>
      )}

      {mulliganOpen && me && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Mulligan</h3>
                <p className="text-sm text-slate-400">
                  {me.mulliganCount > 0
                    ? `Choose ${me.mulliganCount} card${me.mulliganCount === 1 ? '' : 's'} to put on the bottom of your library before drawing a new seven-card hand.`
                    : 'Take a fresh hand of seven cards.'}
                </p>
              </div>
              <button type="button" onClick={() => setMulliganOpen(false)} className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                Cancel
              </button>
            </div>

            {me.hand && me.hand.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {me.hand.map((scryfallId, index) => {
                  const facts = state.cards[scryfallId];
                  const isSelected = selectedBottomCards.includes(scryfallId);
                  return (
                    <button
                      key={`${scryfallId}-${index}`}
                      type="button"
                      onClick={() => {
                        setSelectedBottomCards((current) => {
                          if (isSelected) return current.filter((id) => id !== scryfallId);
                          if (current.length >= me.mulliganCount) return current;
                          return [...current, scryfallId];
                        });
                      }}
                      className={`rounded border p-2 text-left ${isSelected ? 'border-accent2 bg-accent2/20' : 'border-white/10 bg-panel'}`}
                    >
                      <CardImage name={facts?.name ?? scryfallId} imageUrl={facts?.imageNormal} />
                      <p className="mt-2 text-xs text-slate-300">{isSelected ? 'Selected to bottom' : 'Select for bottom'}</p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400">Your hand is empty.</p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setMulliganOpen(false)} className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600">
                Cancel
              </button>
              <button
                type="button"
                disabled={me.mulliganCount > 0 && selectedBottomCards.length !== me.mulliganCount}
                onClick={() => {
                  sendAction({ type: 'MULLIGAN', bottomCardScryfallIds: selectedBottomCards });
                  setMulliganOpen(false);
                  setSelectedBottomCards([]);
                }}
                className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                Confirm mulligan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
