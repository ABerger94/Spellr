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

export default function GameTablePage() {
  const params = useParams<{ gameId: string }>();
  const { state, log, joinError, sendAction, onlineUserIds } = useGameState(params.gameId);
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);

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
          <p className="text-slate-400">Loading game…</p>
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
    </div>
  );
}
