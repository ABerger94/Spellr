'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useGameState } from '@/hooks/useGameState';
import { NavBar } from '@/components/layout/NavBar';
import { PlayerQuadrant } from '@/components/game/PlayerQuadrant';
import { HandZone } from '@/components/game/HandZone';
import { GameLog } from '@/components/game/GameLog';
import { GameLobbyWait } from '@/components/game/GameLobbyWait';
import { ScryModal } from '@/components/game/ScryModal';
import { GameActionsBar } from '@/components/game/GameActionsBar';
import { DiceRoller } from '@/components/game/DiceRoller';
import { CardContextMenu, type ContextMenuOption } from '@/components/game/CardContextMenu';
import { CounterEditor } from '@/components/game/CounterEditor';
import { AttachPicker } from '@/components/game/AttachPicker';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { DragDropProvider, type DragSource, type DropTarget } from '@/components/game/DragDropContext';
import type { BattlefieldCard, ManaColor } from '@/types/game';

// Fills the viewport with a fixed grid of player quadrants (2x1 for two
// players, 2x2 for three-to-four) so a whole board is visible without
// scrolling, instead of a single scrolling column.
function quadrantGridClass(playerCount: number): string {
  if (playerCount <= 1) return 'grid-cols-1 grid-rows-1';
  if (playerCount === 2) return 'grid-cols-2 grid-rows-1';
  return 'grid-cols-2 grid-rows-2';
}

export default function GameTablePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { state, gameInfo, log, joinError, actionError, sendAction, onlineUserIds, refreshState } = useGameState(params.gameId);
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showLog, setShowLog] = useState(true);
  const [counterEditor, setCounterEditor] = useState<{ instanceId: string; name: string } | null>(null);
  const [attachPicker, setAttachPicker] = useState<{ instanceId: string; name: string } | null>(null);

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
        <GameLobbyWait
          state={state}
          gameInfo={gameInfo}
          isHost={userId === gameInfo.hostUserId}
          onStarted={refreshState}
          onCancelled={() => router.push('/lobby')}
          onSeatsChanged={refreshState}
        />
      </div>
    );
  }

  if (state.status === 'FINISHED') {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-lg px-6 py-12 text-center">
          <h1 className="mb-2 text-2xl font-semibold text-white">Game over</h1>
          <p className="mb-6 text-slate-400">This game has ended.</p>
          <Link href="/lobby" className="rounded bg-accent px-4 py-2 font-medium text-white hover:bg-accent/80">
            Back to lobby
          </Link>
        </main>
      </div>
    );
  }

  const me = state.players.find((p) => p.seat === state.viewerSeat);
  // Viewer's own quadrant always comes first (top-left), everyone else in
  // seat order after — a stable arrangement regardless of turn order.
  const orderedPlayers = [...state.players].sort((a, b) => {
    if (a.seat === state.viewerSeat) return -1;
    if (b.seat === state.viewerSeat) return 1;
    return a.seat - b.seat;
  });

  const displayName = (seat: number | null) =>
    seat === null ? 'System' : state.players.find((p) => p.seat === seat)?.displayName ?? `Seat ${seat}`;

  function handleDrop(source: DragSource, target: DropTarget) {
    if (!me) return;
    // Dropped back onto the zone it came from — no-op (battlefield is the
    // exception: dropping there always means "move to this exact spot").
    if (source.zone === target.zone && source.zone !== 'battlefield') return;

    if (source.zone === 'battlefield' && target.zone === 'battlefield') {
      if (!source.instanceId) return;
      // Dropped directly on top of another card — attach to it instead of
      // just repositioning. If that card is itself attached to something
      // (e.g. you dropped on a peeking equipment), attach to its host instead.
      if (target.targetInstanceId) {
        const targetCard = me.battlefield.find((c) => c.instanceId === target.targetInstanceId);
        const effectiveTargetId = targetCard?.attachedTo ?? target.targetInstanceId;
        if (effectiveTargetId !== source.instanceId) {
          sendAction({ type: 'ATTACH_CARD', instanceId: source.instanceId, targetInstanceId: effectiveTargetId });
          return;
        }
      }
      sendAction({
        type: 'MOVE_CARD',
        fromZone: 'battlefield',
        toZone: 'battlefield',
        instanceId: source.instanceId,
        x: target.xPercent,
        y: target.yPercent,
      });
      return;
    }

    if (target.zone === 'battlefield' && (source.zone === 'hand' || source.zone === 'commandZone')) {
      if (!source.scryfallId) return;
      sendAction({
        type: 'PLAY_CARD',
        fromZone: source.zone,
        scryfallId: source.scryfallId,
        x: target.xPercent,
        y: target.yPercent,
      });
      return;
    }

    if (source.zone === 'battlefield') {
      if (!source.instanceId) return;
      sendAction({
        type: 'MOVE_CARD',
        fromZone: 'battlefield',
        toZone: target.zone,
        instanceId: source.instanceId,
        position: target.zone === 'library' ? 'top' : undefined,
      });
      return;
    }

    if (source.scryfallId) {
      sendAction({
        type: 'MOVE_CARD',
        fromZone: source.zone,
        toZone: target.zone,
        scryfallId: source.scryfallId,
        position: target.zone === 'library' ? 'top' : undefined,
      });
    }
  }

  function openPileMenu(e: React.MouseEvent, zone: 'graveyard' | 'exile', scryfallId: string) {
    setMenu({
      x: e.clientX,
      y: e.clientY,
      options: [
        {
          label: 'Return to hand',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: zone, toZone: 'hand', scryfallId }),
        },
        {
          label: 'Put on battlefield',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: zone, toZone: 'battlefield', scryfallId }),
        },
        {
          label: 'Put on top of library',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: zone, toZone: 'library', scryfallId, position: 'top' }),
        },
        {
          label: 'Put on bottom of library',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: zone, toZone: 'library', scryfallId, position: 'bottom' }),
        },
      ],
    });
  }

  const openBattlefieldCardMenu = (e: React.MouseEvent, card: BattlefieldCard) => {
    const cardName = state.cards[card.scryfallId]?.name ?? card.scryfallId;
    const hasBackFace = !!state.cards[card.scryfallId]?.backFace;
    const hasDependents = !!me?.battlefield.some((c) => c.attachedTo === card.instanceId);

    setMenu({
      x: e.clientX,
      y: e.clientY,
      options: [
        {
          label: 'Edit counters',
          onClick: () =>
            setCounterEditor({
              instanceId: card.instanceId,
              name: cardName,
            }),
        },
        ...(hasBackFace
          ? [{ label: 'Flip card', onClick: () => sendAction({ type: 'FLIP_CARD', instanceId: card.instanceId }) }]
          : []),
        ...(card.attachedTo
          ? [
              {
                label: 'Detach',
                onClick: () => sendAction({ type: 'ATTACH_CARD', instanceId: card.instanceId, targetInstanceId: null }),
              },
            ]
          : []),
        ...(!hasDependents && !card.attachedTo
          ? [{ label: 'Attach to…', onClick: () => setAttachPicker({ instanceId: card.instanceId, name: cardName }) }]
          : []),
        {
          label: 'Move to graveyard',
          onClick: () =>
            sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'graveyard', instanceId: card.instanceId }),
        },
        {
          label: 'Exile',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'exile', instanceId: card.instanceId }),
        },
        {
          label: 'Return to hand',
          onClick: () => sendAction({ type: 'MOVE_CARD', fromZone: 'battlefield', toZone: 'hand', instanceId: card.instanceId }),
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
    });
  };

  function handleResetDeck() {
    if (window.confirm('Put all your cards back in your library and reshuffle? This also resets your life.')) {
      sendAction({ type: 'RESET_BOARD' });
    }
  }

  function handleRestartGame() {
    if (
      window.confirm(
        'Restart the game for everyone? This reshuffles every library, resets all life totals and boards, and returns to turn 1.',
      )
    ) {
      sendAction({ type: 'RESTART_GAME' });
    }
  }

  function handleEndGame() {
    if (window.confirm('End the game for everyone? This closes the table — the board and log are kept, but nobody can act anymore.')) {
      sendAction({ type: 'END_GAME' });
    }
  }

  const viewerUserId = (session?.user as { id?: string } | undefined)?.id;
  const isHost = !!viewerUserId && viewerUserId === gameInfo.hostUserId;

  return (
    <CardPreviewProvider>
    <DragDropProvider onDrop={handleDrop}>
    <div className="flex min-h-[100dvh] flex-col">
      <NavBar />

      <div className="flex items-center justify-between border-b border-white/10 bg-panel px-4 py-1.5 text-xs text-slate-400">
        <span className="hidden truncate sm:inline">
          Turn {state.turnNumber} · {displayName(state.currentTurnSeat)}&apos;s turn · tap or drag a card to play/move it
          · tap ⋯ for more options ·
          keyboard: <kbd className="rounded bg-panelLight px-1">D</kbd> draw, <kbd className="rounded bg-panelLight px-1">Space</kbd> pass turn
        </span>
        {isHost && (
          <button
            onClick={handleRestartGame}
            title="Restart the game for everyone"
            className="ml-auto mr-2 rounded bg-red-500/10 px-2 py-0.5 text-red-400 hover:bg-red-500/20 sm:ml-2"
          >
            ⟲ Restart game
          </button>
        )}
        {isHost && (
          <button
            onClick={handleEndGame}
            title="End the game for everyone"
            className="mr-2 rounded bg-red-500/10 px-2 py-0.5 text-red-400 hover:bg-red-500/20"
          >
            ✕ End game
          </button>
        )}
        <button
          onClick={() => setShowLog((v) => !v)}
          className={`mr-2 rounded px-2 py-0.5 hover:bg-white/10 ${
            showLog ? 'bg-accent/20 text-accent' : 'bg-panelLight'
          } ${isHost ? '' : 'ml-auto sm:ml-0'}`}
        >
          📜 {showLog ? 'Hide log' : 'Show log'}
        </button>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="rounded bg-panelLight px-2 py-0.5 hover:bg-white/10"
        >
          {showHelp ? 'Hide help' : '? Help'}
        </button>
      </div>

      {showHelp && (
        <div className="max-h-[40vh] overflow-y-auto border-b border-white/10 bg-panel px-4 py-3 text-sm text-slate-300">
          <p className="mb-1">
            <strong>Draw:</strong> tap your library (the card-back stack) for one card instantly, or press{' '}
            <kbd className="rounded bg-panelLight px-1">D</kbd> on a keyboard. The Draw button at the bottom of the
            screen lets you pick a number first — e.g. draw 7 for your opening hand.
          </p>
          <p className="mb-1">
            <strong>Play a card:</strong> tap it in your hand to send it straight to the battlefield, or drag it onto
            your quadrant; the platform doesn&apos;t know mana costs or the stack, so anything playable just resolves
            immediately.
          </p>
          <p className="mb-1">
            <strong>Tap/untap:</strong> tap a permanent on your battlefield.
          </p>
          <p className="mb-1">
            <strong>Discard, exile, sacrifice, bounce, top/bottom of library:</strong> drag a card from your hand or
            battlefield onto the graveyard/exile/library icon, or tap the ⋯ button on it (or right-click on desktop)
            for a move-to-zone menu.
          </p>
          <p className="mb-1">
            <strong>Graveyard / exile piles:</strong> tap the pile to view its contents; tap ⋯ (or right-click) a card
            inside to return it to hand, put it on the battlefield, or send it to the top/bottom of your library.
          </p>
          <p className="mb-1">
            <strong>Game actions bar:</strong> at the top — Untap All, Draw, Pass are one tap; the Actions ▾ menu adds
            Draw X, Scry, Surveil, Mill, Exile Top, Look at Top, Random Discard, Reveal Hand, Shuffle, Mulligan, and
            Reset Deck (cards back to library, reshuffled, life reset).
          </p>
          <p className="mb-1">
            <strong>Opening hand:</strong> everyone is dealt a fresh 7-card hand automatically when the game starts.
            Not happy with it? Actions ▾ → Mulligan shuffles your hand back in and deals you another 7 — only
            available during your first turn. Each mulligan taken means you owe that many cards on the bottom of
            your library once you keep (drag them onto the library, or tap ⋯ → bottom of library on each one).
          </p>
          <p className="mb-1">
            <strong>Every board on one screen:</strong> each player's zones and battlefield sit in their own quadrant,
            sized to fit without scrolling — yours is always top-left. Your hand is the strip along the bottom.
          </p>
          <p className="mb-1">
            <strong>Arrange your battlefield:</strong> drag any permanent to wherever you want it within your
            quadrant — it stays put until you move it again.
          </p>
          <p className="mb-1">
            <strong>Attach equipment/auras:</strong> drag a permanent onto another one on your battlefield to attach
            it — it renders stacked underneath, peeking out. Tap ⋯ → &quot;Detach&quot; to unattach, or use ⋯ →
            &quot;Attach to…&quot; instead of dragging.
          </p>
          <p className="mb-1">
            <strong>Two-sided cards:</strong> transform/modal-DFC permanents get a &quot;Flip card&quot; option in
            their ⋯ menu once they&apos;re on the battlefield, to show the other face.
          </p>
          <p className="mb-1">
            <strong>See a card bigger:</strong> hover your mouse over any card (or tap the 🔍 on it) to see it
            enlarged with its full text — tap/click anywhere to dismiss.
          </p>
          <p className="mb-1">
            <strong>Dice &amp; coins:</strong> below the game log — pick a die size and tap Roll, or tap Flip for a
            coin flip; results post to the log for everyone to see.
          </p>
          <p className="mb-1">
            <strong>Game log:</strong> tap 📜 Hide log up top (or the ✕ on the log panel) to free up screen space —
            actions still happen normally while it&apos;s hidden, tap 📜 Show log to bring it back.
          </p>
          <p className="mb-1">
            <strong>Chat:</strong> type in the box under the log and hit Enter (or tap Send) to talk to everyone at
            the table — chat messages show up right in the log alongside the actions.
          </p>
          <p className="mb-1">
            <strong>Life:</strong> the −/+ buttons next to any player&apos;s name adjust their life (you can adjust
            opponents&apos; life too — e.g. to deal combat damage — same as you would with paper life pads).
          </p>
          <p className="mb-1">
            <strong>Counters:</strong> tap ⋯ (or right-click) a permanent on your battlefield and choose
            &quot;Edit counters&quot; for +1/+1, -1/-1 (they cancel each other out automatically), or any custom
            counter you name — counts show as small badges on the card.
          </p>
          <p className="mb-1">
            <strong>Mana pool:</strong> tap a colored pip under your name to float a mana of that color (W/U/B/R/G/C),
            tap − to spend it, or tap Empty to clear your whole pool at once — everyone can see how much mana
            everyone has floating, same as real mana.
          </p>
          {isHost && (
            <p className="mb-1">
              <strong>Restart game:</strong> the host-only Restart game button reshuffles every player&apos;s library,
              resets everyone&apos;s life and board, and returns to turn 1 — for a mulligan on the whole game.
            </p>
          )}
          {isHost && (
            <p className="mb-1">
              <strong>End game:</strong> the host-only End game button closes the table for everyone — the board and
              log are kept, but nobody can act anymore, and it drops off everyone&apos;s lobby list. Cancelling a
              still-waiting lobby (before Start) is available from the &quot;Waiting for players&quot; screen instead.
            </p>
          )}
          <p>
            <strong>Not yet built:</strong> combat damage math — for now, resolve that by hand using life
            adjustments and counters.
          </p>
        </div>
      )}

      {actionError && (
        <div className="flex items-center justify-between border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm text-red-400">
          <span>{actionError}</span>
        </div>
      )}

      {me && (
        <GameActionsBar
          isMyTurn={!!isMyTurn}
          lookInProgress={me.pendingLook.length > 0}
          onUntapAll={() => sendAction({ type: 'UNTAP_ALL' })}
          onDraw={() => sendAction({ type: 'DRAW_CARD' })}
          onPassTurn={() => sendAction({ type: 'PASS_TURN' })}
          onDrawX={(count) => sendAction({ type: 'DRAW_CARD', count })}
          onScry={(count) => sendAction({ type: 'SCRY', count })}
          onSurveil={(count) => sendAction({ type: 'SURVEIL', count })}
          onMill={(count) => sendAction({ type: 'MILL', count })}
          onExileTop={() => sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'exile' })}
          onLookAtTop={() => sendAction({ type: 'SCRY', count: 1 })}
          onRandomDiscard={() => sendAction({ type: 'RANDOM_DISCARD' })}
          onRevealHand={() => sendAction({ type: 'REVEAL_HAND' })}
          onShuffle={() => sendAction({ type: 'SHUFFLE_LIBRARY' })}
          onMulligan={() => sendAction({ type: 'MULLIGAN' })}
          onResetLife={() => sendAction({ type: 'RESET_LIFE' })}
          onResetDeck={handleResetDeck}
        />
      )}

      <div className="flex flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3">
        <div
          className={`grid min-h-[320px] flex-1 gap-2 ${quadrantGridClass(orderedPlayers.length)}`}
        >
          {orderedPlayers.map((p) => {
            const isViewer = p.seat === state.viewerSeat;
            return (
              <PlayerQuadrant
                key={p.seat}
                player={p}
                cards={state.cards}
                format={state.format}
                isViewer={isViewer}
                isActiveTurn={state.currentTurnSeat === p.seat}
                isOnline={isViewer || p.isAI || (p.userId !== null && onlineUserIds.has(p.userId))}
                aiKeyMissing={!state.aiEnabled}
                onLifeChange={(delta) => sendAction({ type: 'ADJUST_LIFE', seat: p.seat, delta })}
                interactive={isViewer}
                onDraw={isViewer ? () => sendAction({ type: 'DRAW_CARD' }) : undefined}
                onShuffle={isViewer ? () => sendAction({ type: 'SHUFFLE_LIBRARY' }) : undefined}
                onManaAdjust={isViewer ? (color, delta) => sendAction({ type: 'ADJUST_MANA', color: color as ManaColor, delta }) : undefined}
                onManaEmpty={isViewer ? () => sendAction({ type: 'EMPTY_MANA_POOL' }) : undefined}
                onPlayCommander={
                  isViewer ? (scryfallId) => sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'commandZone' }) : undefined
                }
                onTapToggle={
                  isViewer
                    ? (instanceId, tapped) =>
                        sendAction(tapped ? { type: 'UNTAP_CARD', instanceId } : { type: 'TAP_CARD', instanceId })
                    : undefined
                }
                onContextMenu={isViewer ? openBattlefieldCardMenu : undefined}
                onPileCardAction={isViewer ? (e, zone, scryfallId) => openPileMenu(e, zone, scryfallId) : undefined}
              />
            );
          })}
        </div>

        {showLog && (
          <div className="flex h-40 flex-shrink-0 flex-col lg:h-full lg:w-72">
            <div className="min-h-0 flex-1">
              <GameLog
                events={log}
                displayName={displayName}
                onClose={() => setShowLog(false)}
                onSendChat={(text) => sendAction({ type: 'CHAT_MESSAGE', text })}
              />
            </div>
            <DiceRoller
              onRoll={(sides) => sendAction({ type: 'ROLL_DICE', sides })}
              onFlip={() => sendAction({ type: 'FLIP_COIN' })}
            />
          </div>
        )}
      </div>

      {me && (
        <div className="flex-shrink-0 border-t border-white/10 bg-panel px-3 py-2">
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

      {counterEditor &&
        (() => {
          const card = me?.battlefield.find((c) => c.instanceId === counterEditor.instanceId);
          if (!card) return null;
          return (
            <CounterEditor
              cardName={counterEditor.name}
              counters={card.counters ?? {}}
              onAdjust={(counterType, delta) =>
                sendAction({ type: 'ADJUST_COUNTER', instanceId: counterEditor.instanceId, counterType, delta })
              }
              onClose={() => setCounterEditor(null)}
            />
          );
        })()}

      {attachPicker && me && (
        <AttachPicker
          cardName={attachPicker.name}
          candidates={me.battlefield.filter((c) => c.instanceId !== attachPicker.instanceId && !c.attachedTo)}
          cards={state.cards}
          onPick={(targetInstanceId) => {
            sendAction({ type: 'ATTACH_CARD', instanceId: attachPicker.instanceId, targetInstanceId });
            setAttachPicker(null);
          }}
          onClose={() => setAttachPicker(null)}
        />
      )}
    </div>
    </DragDropProvider>
    </CardPreviewProvider>
  );
}
