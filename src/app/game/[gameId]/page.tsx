'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useGameState } from '@/hooks/useGameState';
import { useVoiceChat } from '@/hooks/useVoiceChat';
import { NavBar } from '@/components/layout/NavBar';
import { PlayerPanel } from '@/components/game/PlayerPanel';
import { FreeformBattlefield } from '@/components/game/FreeformBattlefield';
import { HandZone } from '@/components/game/HandZone';
import { LibraryStack } from '@/components/game/LibraryStack';
import { PublicZoneStack } from '@/components/game/PublicZoneStack';
import { CommandZone } from '@/components/game/CommandZone';
import { GameLog } from '@/components/game/GameLog';
import { GameLobbyWait } from '@/components/game/GameLobbyWait';
import { ScryModal } from '@/components/game/ScryModal';
import { ReorderTopModal } from '@/components/game/ReorderTopModal';
import { GameActionsBar } from '@/components/game/GameActionsBar';
import { DiceRoller } from '@/components/game/DiceRoller';
import { CardContextMenu, type ContextMenuOption } from '@/components/game/CardContextMenu';
import { CardImage } from '@/components/card/CardImage';
import { CounterEditor } from '@/components/game/CounterEditor';
import { AttachPicker } from '@/components/game/AttachPicker';
import { AnnotationEditor } from '@/components/game/AnnotationEditor';
import { GivePicker } from '@/components/game/GivePicker';
import { AttackTargetPicker, type AttackTargetOption } from '@/components/game/AttackTargetPicker';
import { BlockTargetPicker, type BlockAttackerOption } from '@/components/game/BlockTargetPicker';
import { AddTokenModal } from '@/components/game/AddTokenModal';
import { CardPreviewProvider } from '@/components/game/CardPreviewContext';
import { ManaPool } from '@/components/game/ManaPool';
import { DragDropProvider, type DragSource, type DropTarget } from '@/components/game/DragDropContext';
import type { BattlefieldCard, ManaColor } from '@/types/game';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 1.5;

// handHeightPx/handWidthPx are named for the panel's default bottom-docked
// orientation, but really mean "thickness" (the short dimension, poking
// away from whichever edge it's docked to) and "length" (the long
// dimension, running parallel to that edge, holding the fanned-out cards)
// — when docked to the left/right edge instead, thickness maps to on-screen
// width and length maps to on-screen height. See panelDims().
const DEFAULT_HAND_HEIGHT_PX = 190;
const MIN_HAND_HEIGHT_PX = 120;
const MAX_HAND_HEIGHT_PX = 560;
const DEFAULT_HAND_WIDTH_PX = 768; // matches the old max-w-3xl cap
const MIN_HAND_WIDTH_PX = 360;
const MAX_HAND_WIDTH_PX = 1600;
// Fixed thickness of the drag/collapse header strip itself (h-6 / w-6).
const HAND_HEADER_THICKNESS_PX = 24;
// How close to a screen edge the panel's title strip has to be dropped for
// it to snap to (and reorient to run along) that edge.
const HAND_EDGE_SNAP_PX = 80;

type HandEdge = 'top' | 'bottom' | 'left' | 'right';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Keeps at least a grabbable strip of the floating hand panel on-screen
 * after a move or resize (or a viewport resize), rather than letting it
 * drift entirely out of reach. Never demands more margin than the panel is
 * actually wide/tall — otherwise a fully on-screen but narrow panel (e.g.
 * collapsed, docked flush against an edge) gets needlessly nudged away from
 * that edge just because 48px alone would exceed its own thickness. */
function clampHandPos(pos: { x: number; y: number }, width: number, height: number): { x: number; y: number } {
  const marginX = Math.min(48, width);
  const marginY = Math.min(48, height);
  return {
    x: clamp(pos.x, -(width - marginX), window.innerWidth - marginX),
    y: clamp(pos.y, 0, window.innerHeight - marginY),
  };
}

/** The hand panel's actual on-screen box, given its edge/collapsed state
 * and its thickness/length — the single source of truth for every place
 * that needs to reason about its real width/height (edge-snap detection,
 * collapse/expand position compensation, resize clamping). */
function panelDims(edge: HandEdge, collapsed: boolean, lengthPx: number, thicknessPx: number): { width: number; height: number } {
  const thicknessExtent = collapsed ? HAND_HEADER_THICKNESS_PX : HAND_HEADER_THICKNESS_PX + thicknessPx;
  const isVertical = edge === 'left' || edge === 'right';
  return isVertical ? { width: thicknessExtent, height: lengthPx } : { width: lengthPx, height: thicknessExtent };
}

/** The seat grid fills row-major (top-left, top-right, bottom-left,
 * bottom-right) when there are exactly 4 boards, but turn order always
 * advances by ascending seat number — so rendered in raw seat order, turns
 * would visually jump top-right -> bottom-left -> bottom-right instead of
 * sweeping around the table. Swapping the last two entries turns that into
 * top-left -> top-right -> bottom-right -> bottom-left, a proper clockwise
 * loop. The 1/2/3-seat layouts (already read clockwise given how their grid
 * cells are arranged) are left untouched. */
function clockwiseDisplayOrder<T>(players: T[]): T[] {
  if (players.length !== 4) return players;
  return [players[0], players[1], players[3], players[2]];
}

export default function GameTablePage() {
  const params = useParams<{ gameId: string }>();
  const router = useRouter();
  const { data: session } = useSession();
  const { state, gameInfo, log, joinError, actionError, sendAction, onlineUserIds, refreshState } = useGameState(params.gameId);
  const viewerUserId = (session?.user as { id?: string } | undefined)?.id ?? null;
  const voiceChat = useVoiceChat(params.gameId, viewerUserId);
  const [menu, setMenu] = useState<{ x: number; y: number; options: ContextMenuOption[] } | null>(null);
  const [librarySearchOpen, setLibrarySearchOpen] = useState(false);
  const [librarySearchQuery, setLibrarySearchQuery] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [showLog, setShowLog] = useState(true);
  const [handCollapsed, setHandCollapsed] = useState(false);
  const [handHeightPx, setHandHeightPx] = useState(DEFAULT_HAND_HEIGHT_PX);
  const [handWidthPx, setHandWidthPx] = useState(DEFAULT_HAND_WIDTH_PX);
  // Which screen edge the hand panel is currently docked to and running
  // parallel with — changes when it's dragged near a different edge.
  const [handEdge, setHandEdge] = useState<HandEdge>('bottom');
  // Top-left corner of the floating hand panel, in viewport px — null until
  // the mount effect below picks a default (needs `window`, so it can't be
  // computed during the initial server-rendered pass).
  const [handPos, setHandPos] = useState<{ x: number; y: number } | null>(null);
  const [counterEditor, setCounterEditor] = useState<{ instanceId: string; name: string } | null>(null);
  const [attachPicker, setAttachPicker] = useState<{ instanceId: string; name: string } | null>(null);
  const [annotationEditor, setAnnotationEditor] = useState<{ instanceId: string; name: string } | null>(null);
  const [givePicker, setGivePicker] = useState<{ instanceId: string; name: string } | null>(null);
  const [attackPicker, setAttackPicker] = useState<{ instanceId: string; name: string } | null>(null);
  const [blockPicker, setBlockPicker] = useState<{ instanceId: string; name: string } | null>(null);
  const [addTokenOpen, setAddTokenOpen] = useState(false);
  // Battlefield multi-select: instanceIds drag-selected on your own board,
  // shown with a gold ring — tapping any one of them while 2+ are selected
  // taps/untaps the whole group together instead of just that card.
  const [selectedInstanceIds, setSelectedInstanceIds] = useState<Set<string>>(new Set());

  const isMyTurn = state?.status === 'ACTIVE' && state.currentTurnSeat === state.viewerSeat;

  // A short landscape phone has so little height to begin with that the
  // default hand bar and the always-on log panel can together eat most of
  // the screen — start the hand collapsed to its minimum and the log
  // hidden, same viewport check as the mobile-landscape Tailwind variant
  // used throughout this page. Only runs once at mount so a mid-game
  // rotation doesn't yank settings the player already changed themselves.
  useEffect(() => {
    const isShortLandscape = window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches;
    const initialHeight = isShortLandscape ? MIN_HAND_HEIGHT_PX : DEFAULT_HAND_HEIGHT_PX;
    if (isShortLandscape) {
      setHandHeightPx(MIN_HAND_HEIGHT_PX);
      setShowLog(false);
    }
    // Default docked position: bottom-center, matching where the hand bar
    // used to be permanently pinned before it became freely movable.
    const dims = panelDims('bottom', false, DEFAULT_HAND_WIDTH_PX, initialHeight);
    setHandPos(
      clampHandPos(
        { x: (window.innerWidth - DEFAULT_HAND_WIDTH_PX) / 2, y: window.innerHeight - dims.height - 8 },
        dims.width,
        dims.height,
      ),
    );
  }, []);

  // Keep the hand panel from getting stranded off-screen if the viewport
  // resizes (window resize, or a phone rotating) after it's been moved.
  useEffect(() => {
    function onResize() {
      setHandPos((prev) => {
        if (!prev) return prev;
        const dims = panelDims(handEdge, handCollapsed, handWidthPx, handHeightPx);
        return clampHandPos(prev, dims.width, dims.height);
      });
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [handEdge, handCollapsed, handWidthPx, handHeightPx]);

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

  const displayName = (seat: number | null) =>
    seat === null ? 'System' : state.players.find((p) => p.seat === seat)?.displayName ?? `Seat ${seat}`;

  // Commander damage is tracked per source commander, so the picker shows
  // each opponent's commander name rather than the player's own name —
  // falls back to the player name if no commander is set (e.g. an empty deck).
  const otherSeatsFor = (seat: number) =>
    state.players
      .filter((p) => p.seat !== seat)
      .map((p) => ({ seat: p.seat, name: (p.commanderCardId && state.cards[p.commanderCardId]?.name) || p.displayName }));

  // Combat helper (bookkeeping only — no damage math): looks up a card's name
  // by instanceId across every player's battlefield, since an attack target
  // or blocked attacker can live on a different player's board than the
  // card carrying the badge.
  const cardNameByInstance = new Map<string, string>();
  for (const p of state.players) {
    for (const c of p.battlefield) {
      cardNameByInstance.set(c.instanceId, state.cards[c.scryfallId]?.name ?? c.scryfallId);
    }
  }

  const combatLabels: Record<string, { text: string; variant: 'attacking' | 'blocking' }> = {};
  for (const p of state.players) {
    for (const c of p.battlefield) {
      if (c.attacking) {
        const targetName =
          c.attacking.targetType === 'player'
            ? displayName(c.attacking.targetSeat)
            : (c.attacking.targetInstanceId && cardNameByInstance.get(c.attacking.targetInstanceId)) ?? 'a planeswalker';
        combatLabels[c.instanceId] = { text: `Attacking ${targetName}`, variant: 'attacking' };
      }
      if (c.blocking && c.blocking.length > 0) {
        const names = c.blocking.map((id) => cardNameByInstance.get(id) ?? 'an attacker');
        combatLabels[c.instanceId] = { text: `Blocking ${names.join(', ')}`, variant: 'blocking' };
      }
    }
  }

  function computeAttackOptions(): AttackTargetOption[] {
    if (!me || !state) return [];
    const options: AttackTargetOption[] = [];
    for (const p of state.players) {
      if (p.seat === me.seat) continue;
      options.push({ targetType: 'player', targetSeat: p.seat, label: `${p.displayName} (face)` });
      for (const c of p.battlefield) {
        const typeLine = state.cards[c.scryfallId]?.typeLine ?? '';
        if (typeLine.includes('Planeswalker') || typeLine.includes('Battle')) {
          const name = state.cards[c.scryfallId]?.name ?? c.scryfallId;
          options.push({
            targetType: 'planeswalker',
            targetSeat: p.seat,
            targetInstanceId: c.instanceId,
            label: `${name} (${p.displayName})`,
          });
        }
      }
    }
    return options;
  }

  function computeBlockOptions(blockerInstanceId: string): BlockAttackerOption[] {
    if (!me || !state) return [];
    const myInstanceIds = new Set(me.battlefield.map((c) => c.instanceId));
    const blockerCard = me.battlefield.find((c) => c.instanceId === blockerInstanceId);
    const alreadyBlockingSet = new Set(blockerCard?.blocking ?? []);
    const options: BlockAttackerOption[] = [];
    for (const p of state.players) {
      if (p.seat === me.seat) continue;
      for (const c of p.battlefield) {
        if (!c.attacking) continue;
        const targetsMe =
          c.attacking.targetType === 'player'
            ? c.attacking.targetSeat === me.seat
            : c.attacking.targetInstanceId !== undefined && myInstanceIds.has(c.attacking.targetInstanceId);
        if (!targetsMe) continue;
        const name = state.cards[c.scryfallId]?.name ?? c.scryfallId;
        options.push({
          attackerInstanceId: c.instanceId,
          label: `${name} (${p.displayName})`,
          alreadyBlocking: alreadyBlockingSet.has(c.instanceId),
        });
      }
    }
    return options;
  }

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
        transformed: source.transformed,
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
    const typeLine = state.cards[card.scryfallId]?.typeLine ?? '';
    const isCreature = typeLine.includes('Creature');

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
        {
          label: card.annotation ? 'Edit note' : 'Annotate',
          onClick: () => setAnnotationEditor({ instanceId: card.instanceId, name: cardName }),
        },
        // A fresh token copy — same printed card, but its own instance with
        // no counters/tap state carried over, same as any other token.
        {
          label: 'Make copy (token)',
          onClick: () => sendAction({ type: 'CREATE_TOKEN', scryfallId: card.scryfallId, x: card.x + 3, y: card.y + 3 }),
        },
        ...(me && otherSeatsFor(me.seat).length > 0
          ? [{ label: 'Give to player…', onClick: () => setGivePicker({ instanceId: card.instanceId, name: cardName }) }]
          : []),
        // Combat helper: bookkeeping only, no automatic damage — declares an
        // attack target or a blocked attacker and shows a badge, same spirit
        // as the rest of the table.
        ...(isCreature && !card.attacking
          ? [{ label: 'Attack…', onClick: () => setAttackPicker({ instanceId: card.instanceId, name: cardName }) }]
          : []),
        ...(card.attacking
          ? [{ label: 'Cancel attack', onClick: () => sendAction({ type: 'CANCEL_ATTACK', instanceId: card.instanceId }) }]
          : []),
        ...(isCreature
          ? [{ label: 'Block…', onClick: () => setBlockPicker({ instanceId: card.instanceId, name: cardName }) }]
          : []),
        ...(card.blocking ?? []).map((attackerInstanceId) => ({
          label: `Stop blocking ${cardNameByInstance.get(attackerInstanceId) ?? 'attacker'}`,
          onClick: () => sendAction({ type: 'CANCEL_BLOCK', instanceId: card.instanceId, attackerInstanceId }),
        })),
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
        // Tokens don't exist anywhere except the battlefield — leaving it
        // means ceasing to exist, not moving to hand/library/graveyard/exile.
        ...(card.isToken
          ? [
              {
                label: 'Remove token (destroy)',
                onClick: () => sendAction({ type: 'REMOVE_TOKEN', instanceId: card.instanceId }),
              },
            ]
          : [
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
            ]),
      ],
    });
  };

  // A deliberately tiny menu for cards on someone else's battlefield — you
  // don't control them, so the only thing on offer is copying the printed
  // card as a fresh token onto your own board (CREATE_TOKEN always creates
  // on the caller's own battlefield server-side, regardless of whose card
  // this scryfallId came from).
  const openOpponentCardMenu = (e: React.MouseEvent, card: BattlefieldCard) => {
    const cardName = state.cards[card.scryfallId]?.name ?? card.scryfallId;
    setMenu({
      x: e.clientX,
      y: e.clientY,
      options: [
        {
          label: 'Copy to my board',
          onClick: () => sendAction({ type: 'CREATE_TOKEN', scryfallId: card.scryfallId }),
        },
      ],
    });
  };

  // Drag anywhere on the panel's title strip to move it. On release, if it
  // was dropped close enough to a screen edge, it snaps flush against that
  // edge and reorients to run parallel to it (vertical along left/right,
  // horizontal along top/bottom) — otherwise it's left wherever dropped,
  // keeping whatever orientation it already had.
  function handleHandDragStart(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startPos = handPos ?? { x: 0, y: 0 };
    let latestPos = startPos;
    function onMove(ev: PointerEvent) {
      latestPos = clampHandPos(
        { x: startPos.x + (ev.clientX - startX), y: startPos.y + (ev.clientY - startY) },
        handWidthPx,
        handHeightPx,
      );
      setHandPos(latestPos);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);

      const dims = panelDims(handEdge, handCollapsed, handWidthPx, handHeightPx);
      const distances = {
        top: latestPos.y,
        bottom: window.innerHeight - (latestPos.y + dims.height),
        left: latestPos.x,
        right: window.innerWidth - (latestPos.x + dims.width),
      };
      const nearest = (['top', 'bottom', 'left', 'right'] as const).reduce((a, b) => (distances[a] <= distances[b] ? a : b));
      if (distances[nearest] > HAND_EDGE_SNAP_PX) return; // dropped in the open — leave position and orientation as-is

      const newDims = panelDims(nearest, handCollapsed, handWidthPx, handHeightPx);
      let nx = latestPos.x;
      let ny = latestPos.y;
      if (nearest === 'left') nx = 8;
      else if (nearest === 'right') nx = window.innerWidth - newDims.width - 8;
      if (nearest === 'top') ny = 8;
      else if (nearest === 'bottom') ny = window.innerHeight - newDims.height - 8;
      // Along the free (length) axis, keep the whole panel on-screen when it
      // fits rather than leaving it wherever it happened to be dropped —
      // it should always open into the playfield, never off it.
      if (nearest === 'left' || nearest === 'right') {
        ny = clamp(ny, 0, Math.max(0, window.innerHeight - newDims.height));
      } else {
        nx = clamp(nx, 0, Math.max(0, window.innerWidth - newDims.width));
      }

      setHandEdge(nearest);
      setHandPos(clampHandPos({ x: nx, y: ny }, newDims.width, newDims.height));
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  // Drag any edge or corner handle to resize the hand panel from that
  // side. Screen-space deltas (dx/dy) always mean the same thing physically
  // (dragging the right edge right always widens the box on-screen), but
  // which semantic dimension that becomes — thickness (poking away from the
  // docked edge) vs. length (running along it) — flips depending on whether
  // the panel is currently docked horizontally or vertically. When the
  // dragged edge is the top or left one, the opposite edge has to stay
  // visually anchored, so resizing from there also shifts position by
  // however much the (possibly clamped) size actually changed.
  function handleHandResizeStart(e: React.PointerEvent, edges: { top?: boolean; bottom?: boolean; left?: boolean; right?: boolean }) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const isVertical = handEdge === 'left' || handEdge === 'right';
    const startLength = handWidthPx;
    const startThickness = handHeightPx;
    const startPos = handPos ?? { x: 0, y: 0 };
    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;

      let length = startLength;
      let thickness = startThickness;
      let x = startPos.x;
      let y = startPos.y;

      // On-screen width (dx) drives length when horizontal, thickness when vertical.
      if (edges.right) {
        if (isVertical) thickness = clamp(startThickness + dx, MIN_HAND_HEIGHT_PX, MAX_HAND_HEIGHT_PX);
        else length = clamp(startLength + dx, MIN_HAND_WIDTH_PX, MAX_HAND_WIDTH_PX);
      } else if (edges.left) {
        if (isVertical) {
          thickness = clamp(startThickness - dx, MIN_HAND_HEIGHT_PX, MAX_HAND_HEIGHT_PX);
          x = startPos.x + (startThickness - thickness);
        } else {
          length = clamp(startLength - dx, MIN_HAND_WIDTH_PX, MAX_HAND_WIDTH_PX);
          x = startPos.x + (startLength - length);
        }
      }

      // On-screen height (dy) drives thickness when horizontal, length when vertical.
      if (edges.bottom) {
        if (isVertical) length = clamp(startLength + dy, MIN_HAND_WIDTH_PX, MAX_HAND_WIDTH_PX);
        else thickness = clamp(startThickness + dy, MIN_HAND_HEIGHT_PX, MAX_HAND_HEIGHT_PX);
      } else if (edges.top) {
        if (isVertical) {
          length = clamp(startLength - dy, MIN_HAND_WIDTH_PX, MAX_HAND_WIDTH_PX);
          y = startPos.y + (startLength - length);
        } else {
          thickness = clamp(startThickness - dy, MIN_HAND_HEIGHT_PX, MAX_HAND_HEIGHT_PX);
          y = startPos.y + (startThickness - thickness);
        }
      }

      setHandWidthPx(length);
      setHandHeightPx(thickness);
      const dims = panelDims(handEdge, handCollapsed, length, thickness);
      setHandPos(clampHandPos({ x, y }, dims.width, dims.height));
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

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

  const isHost = !!viewerUserId && viewerUserId === gameInfo.hostUserId;

  return (
    <CardPreviewProvider>
    <DragDropProvider onDrop={handleDrop}>
    <div className="flex h-screen flex-col">
      <NavBar />

      <div className="flex items-center justify-between border-b border-white/10 bg-panel px-4 py-1.5 text-xs text-slate-400 mobile-landscape:px-2 mobile-landscape:py-0.5">
        <span className="hidden truncate sm:inline mobile-landscape:hidden">
          Tap or drag a card to play/move it · tap ⋯ on a card for more options · use the Game actions bar for
          draw/scry/surveil/mill/pass/etc ·
          keyboard: <kbd className="rounded bg-panelLight px-1">D</kbd> draw, <kbd className="rounded bg-panelLight px-1">Space</kbd> pass turn
        </span>
        {isHost && (
          <button
            onClick={handleRestartGame}
            title="Restart the game for everyone"
            className="ml-auto mr-2 whitespace-nowrap rounded bg-red-500/10 px-2 py-0.5 text-red-400 hover:bg-red-500/20 sm:ml-2 mobile-landscape:mr-1 mobile-landscape:px-1.5 mobile-landscape:py-0"
          >
            ⟲ Restart game
          </button>
        )}
        {isHost && (
          <button
            onClick={handleEndGame}
            title="End the game for everyone"
            className="mr-2 whitespace-nowrap rounded bg-red-500/10 px-2 py-0.5 text-red-400 hover:bg-red-500/20 mobile-landscape:mr-1 mobile-landscape:px-1.5 mobile-landscape:py-0"
          >
            ✕ End game
          </button>
        )}
        <button
          onClick={() => setShowLog((v) => !v)}
          className={`mr-2 whitespace-nowrap rounded px-2 py-0.5 hover:bg-white/10 mobile-landscape:mr-1 mobile-landscape:px-1.5 mobile-landscape:py-0 ${
            showLog ? 'bg-accent/20 text-accent' : 'bg-panelLight'
          } ${isHost ? '' : 'ml-auto sm:ml-0'}`}
        >
          📜 {showLog ? 'Hide log' : 'Show log'}
        </button>
        <button
          onClick={() => setShowHelp((v) => !v)}
          className="whitespace-nowrap rounded bg-panelLight px-2 py-0.5 hover:bg-white/10 mobile-landscape:px-1.5 mobile-landscape:py-0"
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
            <strong>Search your library:</strong> tap Search under your library to browse every card in it and send
            one to your hand or the top — type in the filter box to narrow the grid down by name instead of
            scrolling to find it. The rest of the library is shuffled afterward (even if you close without picking
            anything), and opening the search is logged for everyone to see, same as a real tutor.
          </p>
          <p className="mb-1">
            <strong>Play a card:</strong> tap it in your hand to send it straight to the battlefield, or drag it there
            to drop it exactly where you want; the platform doesn&apos;t know mana costs or the stack, so anything
            playable just resolves immediately.
          </p>
          <p className="mb-1">
            <strong>Tap/untap:</strong> tap a permanent on your battlefield.
          </p>
          <p className="mb-1">
            <strong>Select and tap multiple at once:</strong> on a computer, drag on empty battlefield space (not on
            a card) to draw a selection box around several permanents — they highlight with a gold ring. Tap any one
            of the highlighted cards to tap/untap the whole group together; tap empty space again to clear the
            selection. Mouse only for now, so it doesn&apos;t fight with scrolling the battlefield by touch.
          </p>
          <p className="mb-1">
            <strong>Rearrange the battlefield:</strong> drag a permanent to any spot — positions are freeform, not a grid.
          </p>
          <p className="mb-1">
            <strong>Attach equipment/auras:</strong> drag a permanent onto another one on your battlefield to attach
            it — it renders stacked underneath, peeking out. Tap ⋯ → &quot;Detach&quot; to unattach, or use ⋯ →
            &quot;Attach to…&quot; instead of dragging.
          </p>
          <p className="mb-1">
            <strong>Make a token copy:</strong> tap ⋯ on any permanent and choose &quot;Make copy (token)&quot; to
            drop a fresh token copy of it right next to the original — same printed card, but its own tap state and
            counters starting fresh, same as any other token.
          </p>
          <p className="mb-1">
            <strong>Two-sided cards:</strong> transform/modal-DFC permanents get a &quot;Flip card&quot; option in
            their ⋯ menu once they&apos;re on the battlefield, to show the other face.
          </p>
          <p className="mb-1">
            <strong>Declaring attackers &amp; blockers:</strong> tap ⋯ on a creature and choose &quot;Attack…&quot;
            to pick a target — an opponent&apos;s face, or one of their planeswalkers/battles — which taps the
            creature (unless its rules text has vigilance) and shows a red ring/badge naming the target (choose
            &quot;Cancel attack&quot; to undo). On the
            defending side, tap ⋯ → &quot;Block…&quot; on your own creature to pick an attacker aimed at you or your
            permanents — it shows a sky-blue ring/badge (tap the attacker again, or &quot;Stop blocking…&quot;, to
            undo). This is bookkeeping only — no damage math happens automatically, same as the rest of the table.
            Everyone&apos;s attack/block declarations clear automatically when the turn passes, or manually via
            Actions ▾ → Clear My Combat.
          </p>
          <p className="mb-1">
            <strong>See a card bigger:</strong> hover your mouse over any card to see it enlarged with its full text.
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
            <strong>Game actions bar:</strong> at the top — Untap All and Draw are one tap; the Actions ▾ menu adds
            Pass Turn, Draw X, Scry, Surveil, Mill, Exile Top, Look at Top, Random Discard, Reveal Hand, Shuffle,
            Mulligan, Reset Life, and Reset Deck (cards back to library, reshuffled, life reset). The +/− on the
            right shrinks or grows card size on every battlefield — the battlefield zone itself stays put, so
            zooming out just fits more cards into the same space, handy for a crowded board.
          </p>
          <p className="mb-1">
            <strong>Look at Top (Sensei&apos;s Divining Top-style):</strong> pick a count to look at that many cards
            off the top of your library, then use the ▲/▼ arrows to put them back in whatever order you want and
            tap Confirm order — nothing is shuffled and nothing leaves the library, only the top cards get
            rearranged.
          </p>
          <p className="mb-1">
            <strong>Voice chat:</strong> tap 🎙️ Join Voice to talk with the other players in this game over your
            microphone (peer-to-peer, no recording) — the button then toggles Mute/Unmute, and Actions ▾ → Leave
            Voice Chat disconnects you entirely.
          </p>
          <p className="mb-1">
            <strong>Opening hand:</strong> everyone is dealt a fresh 7-card hand automatically when the game starts.
            Not happy with it? Actions ▾ → Mulligan shuffles your hand back in and deals you another 7 — only
            available during your first turn. Your first mulligan each game is free; take as many more as you
            need after that. The platform doesn&apos;t track or enforce bottoming cards for extra mulligans — that&apos;s
            between you and your table (drag cards onto the library, or tap ⋯ → bottom of library, if that&apos;s
            how you&apos;re playing it).
          </p>
          <p className="mb-1">
            <strong>More room:</strong> each player&apos;s battlefield (including yours) is its own scrollable canvas
            within its board — scroll (or drag) to reach cards placed further out. Your hand wraps into rows and
            shrinks cards to fit as needed, so up to 20 cards are visible at once with no scrolling; beyond 20 cards
            it scrolls vertically instead of shrinking further.
          </p>
          <p className="mb-1">
            <strong>Layout:</strong> every player&apos;s board — including yours — sits in a grid sized to fit the
            whole table on screen at once, no scrolling needed; your own board is highlighted, and your hand floats
            over the grid as its own movable panel rather than taking up a permanent row of its own. Drag the
            <strong> • • •</strong> strip at its top to put it anywhere on screen, or any of its edges/corners to
            resize it from that side. Tap ▼ Hide hand / ▲ Show hand on that strip to collapse it entirely and see the
            full boards underneath (you can still drag a collapsed hand out of the way).
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
            <strong>Commander damage &amp; player counters:</strong> tap the ▾ button next to a player&apos;s life
            total for a dropdown with commander damage taken from each opponent, poison/energy/experience/rad
            counters, and a box to add any other custom counter — a red dot on ▾ means something there is at a
            dangerous total.
          </p>
          <p className="mb-1">
            <strong>Counters (on a card):</strong> tap ⋯ (or right-click) a permanent on your battlefield and choose
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

      {voiceChat.signalingError && (
        <div className="flex items-center justify-between border-b border-red-500/30 bg-red-500/10 px-4 py-1.5 text-sm text-red-400">
          <span>{voiceChat.signalingError}</span>
        </div>
      )}

      {me && (
        <GameActionsBar
          isMyTurn={!!isMyTurn}
          lookInProgress={me.pendingLook.length > 0}
          zoom={zoom}
          onZoomIn={() => setZoom((z) => Math.min(MAX_ZOOM, +(z + 0.1).toFixed(2)))}
          onZoomOut={() => setZoom((z) => Math.max(MIN_ZOOM, +(z - 0.1).toFixed(2)))}
          onUntapAll={() => sendAction({ type: 'UNTAP_ALL' })}
          onDraw={() => sendAction({ type: 'DRAW_CARD' })}
          onPassTurn={() => sendAction({ type: 'PASS_TURN' })}
          onDrawX={(count) => sendAction({ type: 'DRAW_CARD', count })}
          onScry={(count) => sendAction({ type: 'SCRY', count })}
          onSurveil={(count) => sendAction({ type: 'SURVEIL', count })}
          onMill={(count) => sendAction({ type: 'MILL', count })}
          onExileTop={() => sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'exile' })}
          onLookAtTop={(count) => sendAction({ type: 'REORDER_TOP', count })}
          onRandomDiscard={() => sendAction({ type: 'RANDOM_DISCARD' })}
          onRevealHand={() => sendAction({ type: 'REVEAL_HAND' })}
          onShuffle={() => sendAction({ type: 'SHUFFLE_LIBRARY' })}
          onMulligan={() => sendAction({ type: 'MULLIGAN' })}
          onResetLife={() => sendAction({ type: 'RESET_LIFE' })}
          onResetDeck={handleResetDeck}
          onAddToken={() => setAddTokenOpen(true)}
          onClearCombat={() => sendAction({ type: 'CLEAR_MY_COMBAT' })}
          voiceJoined={voiceChat.joined}
          voiceMuted={voiceChat.muted}
          voiceConnectedPeerCount={voiceChat.connectedPeerCount}
          voiceConnectingPeerCount={voiceChat.connectingPeerCount}
          voiceMicError={voiceChat.micError}
          voiceAudioBlocked={voiceChat.audioBlocked}
          onVoiceJoin={voiceChat.join}
          onVoiceToggleMute={voiceChat.toggleMute}
          onVoiceLeave={voiceChat.leave}
          onVoiceEnableAudio={voiceChat.enableAudio}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 lg:flex-row lg:gap-4 lg:p-4">
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Turn indicator */}
          <div className="flex-shrink-0 pb-2 text-center text-xs text-slate-500 mobile-landscape:pb-0.5">
            Turn {state.turnNumber} · {displayName(state.currentTurnSeat)}&apos;s turn
          </div>

          {/* Every seat, including your own, sized to exactly fill the space
              below — a true edhplay-style grid, no scrolling needed to see
              every board. On short landscape phones a 2x2 grid leaves each
              board only a quarter of an already-tiny viewport, so it
              collapses to a single row instead — every board then gets the
              full viewport height, at the cost of being narrower, which is
              the better trade when width is the one thing landscape has
              plenty of. */}
          <div className="min-h-0 flex-1">
            <div
              className={`grid h-full gap-2 mobile-landscape:grid-flow-col mobile-landscape:grid-rows-1 ${
                state.players.length > 1 ? 'grid-cols-2' : 'grid-cols-1'
              } ${state.players.length > 2 ? 'grid-rows-2' : 'grid-rows-1'} ${
                state.players.length >= 4
                  ? 'mobile-landscape:grid-cols-4'
                  : state.players.length === 3
                    ? 'mobile-landscape:grid-cols-3'
                    : state.players.length === 2
                      ? 'mobile-landscape:grid-cols-2'
                      : 'mobile-landscape:grid-cols-1'
              }`}
            >
              {clockwiseDisplayOrder(state.players).map((p, i) => {
                const isViewer = !!me && p.seat === me.seat;
                const isActiveTurn = state.currentTurnSeat === p.seat;
                const isLastOdd = state.players.length % 2 === 1 && i === state.players.length - 1;
                // Sidebar hugs the outer edge of the grid — left column boards
                // keep it on the left, right column boards on the right — so
                // the two boards sharing the middle of the screen don't both
                // crowd toward the center, and the battlefield gets a clean
                // rectangle next to it either way.
                const sidebarOnLeft = i % 2 === 0;

                const sidebar = (
                  <div className="flex w-11 flex-shrink-0 flex-col items-center gap-1 overflow-y-auto">
                    {state.format === 'COMMANDER' && (
                      <CommandZone
                        scryfallIds={p.commandZone}
                        cards={state.cards}
                        onPlay={
                          isViewer
                            ? (scryfallId) => sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'commandZone' })
                            : undefined
                        }
                        draggable={isViewer}
                        compact
                      />
                    )}
                    <LibraryStack
                      count={p.libraryCount}
                      onDraw={isViewer ? () => sendAction({ type: 'DRAW_CARD' }) : undefined}
                      onSearch={
                        isViewer
                          ? () => {
                              setLibrarySearchOpen(true);
                              setLibrarySearchQuery('');
                              // Logged so opponents can see (and check) that this
                              // player's library was opened for viewing/search —
                              // a private "see the whole order" action would
                              // otherwise be unauditable at the table.
                              sendAction({ type: 'SEARCH_LIBRARY' });
                            }
                          : undefined
                      }
                      onShuffle={isViewer ? () => sendAction({ type: 'SHUFFLE_LIBRARY' }) : undefined}
                      draggable={isViewer}
                      compact
                    />
                    <PublicZoneStack
                      label="Graveyard"
                      zone="graveyard"
                      scryfallIds={p.graveyard}
                      cards={state.cards}
                      draggable={isViewer}
                      onCardAction={isViewer ? (e, scryfallId) => openPileMenu(e, 'graveyard', scryfallId) : undefined}
                      compact
                    />
                    <PublicZoneStack
                      label="Exile"
                      zone="exile"
                      scryfallIds={p.exile}
                      cards={state.cards}
                      draggable={isViewer}
                      onCardAction={isViewer ? (e, scryfallId) => openPileMenu(e, 'exile', scryfallId) : undefined}
                      compact
                    />
                    <span className="text-center text-[9px] leading-tight text-slate-500">Hand {p.handCount}</span>
                  </div>
                );

                return (
                  <div
                    key={p.seat}
                    className={`flex min-h-0 flex-col overflow-hidden rounded-lg border bg-panel p-1.5 mobile-landscape:col-span-1 ${
                      isLastOdd ? 'col-span-2' : ''
                    } ${isActiveTurn ? 'border-accent2 ring-1 ring-accent2/50' : isViewer ? 'border-accent/40' : 'border-white/10'}`}
                  >
                    <div className="flex flex-shrink-0 flex-wrap items-start gap-1">
                      <PlayerPanel
                        player={p}
                        isViewer={isViewer}
                        isActiveTurn={isActiveTurn}
                        isOnline={isViewer || p.isAI || (p.userId !== null && onlineUserIds.has(p.userId))}
                        aiKeyMissing={!state.aiEnabled}
                        onLifeChange={(delta) => sendAction({ type: 'ADJUST_LIFE', seat: p.seat, delta })}
                        commanderDamageFrom={state.format === 'COMMANDER' ? otherSeatsFor(p.seat) : undefined}
                        onCommanderDamageChange={(fromSeat, delta) =>
                          sendAction({ type: 'ADJUST_COMMANDER_DAMAGE', seat: p.seat, fromSeat, delta })
                        }
                        onCounterChange={(counterType, delta) => sendAction({ type: 'ADJUST_PLAYER_COUNTER', seat: p.seat, counterType, delta })}
                        onEliminateChange={(eliminated) => sendAction({ type: 'ELIMINATE_PLAYER', seat: p.seat, eliminated })}
                        compact
                      />
                      <ManaPool
                        pool={p.manaPool}
                        interactive={isViewer}
                        onAdjust={
                          isViewer
                            ? (color, delta) => sendAction({ type: 'ADJUST_MANA', color: color as ManaColor, delta })
                            : undefined
                        }
                        onEmpty={isViewer ? () => sendAction({ type: 'EMPTY_MANA_POOL' }) : undefined}
                        compact
                      />
                    </div>
                    <div className="mt-1 flex min-h-0 flex-1 gap-1">
                      {sidebarOnLeft && sidebar}
                      <div className="min-h-0 min-w-0 flex-1">
                        <FreeformBattlefield
                          battlefield={p.battlefield}
                          cards={state.cards}
                          interactive={isViewer}
                          onTapToggle={
                            isViewer
                              ? (instanceId, tapped) => {
                                  if (selectedInstanceIds.size > 1 && selectedInstanceIds.has(instanceId)) {
                                    sendAction({
                                      type: 'SET_GROUP_TAPPED',
                                      instanceIds: Array.from(selectedInstanceIds),
                                      tapped: !tapped,
                                    });
                                  } else {
                                    sendAction(tapped ? { type: 'UNTAP_CARD', instanceId } : { type: 'TAP_CARD', instanceId });
                                    if (selectedInstanceIds.size > 0) setSelectedInstanceIds(new Set());
                                  }
                                }
                              : undefined
                          }
                          onContextMenu={isViewer ? openBattlefieldCardMenu : openOpponentCardMenu}
                          compact
                          zoom={zoom}
                          combatLabels={combatLabels}
                          selectedInstanceIds={isViewer ? selectedInstanceIds : undefined}
                          onSelectionChange={isViewer ? setSelectedInstanceIds : undefined}
                        />
                      </div>
                      {!sidebarOnLeft && sidebar}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Your hand floats as a freely movable, resizable panel over the
              grid instead of reserving its own row or being pinned to one
              spot — drag its title strip to put it anywhere on screen, or
              near a screen edge to dock and reorient it to run parallel to
              that edge (vertical along left/right, horizontal along
              top/bottom); drag any edge or corner to resize it from that
              side. Always expands toward the middle of the screen, never
              off it. Collapsible: hide it entirely to see the full boards
              underneath, leaving just a handle to bring it back. */}
          {me && handPos && (() => {
            const isVertical = handEdge === 'left' || handEdge === 'right';
            const roundingByEdge: Record<HandEdge, { wrapper: string; near: string; far: string }> = {
              bottom: { wrapper: 'rounded-b-lg', near: 'rounded-bl-lg', far: 'rounded-br-lg' },
              top: { wrapper: 'rounded-t-lg', near: 'rounded-tl-lg', far: 'rounded-tr-lg' },
              left: { wrapper: 'rounded-l-lg', near: 'rounded-tl-lg', far: 'rounded-bl-lg' },
              right: { wrapper: 'rounded-r-lg', near: 'rounded-tr-lg', far: 'rounded-br-lg' },
            };
            const rounding = roundingByEdge[handEdge];
            const panelDirectionClass = {
              bottom: 'flex-col-reverse',
              top: 'flex-col',
              left: 'flex-row',
              right: 'flex-row-reverse',
            }[handEdge];
            // Padding on the three "free" sides (everything but the header
            // side) has to be at least as wide as the invisible resize
            // handles rendered below, or those handles overlap real card
            // content — stealing hover/click from whatever card happens to
            // sit at that edge (most noticeably the last, rightmost card).
            const contentPaddingClass = {
              bottom: 'p-2.5 pb-0',
              top: 'p-2.5 pt-0',
              left: 'p-2.5 pl-0',
              right: 'p-2.5 pr-0',
            }[handEdge];
            const arrow = {
              bottom: handCollapsed ? '▲' : '▼',
              top: handCollapsed ? '▼' : '▲',
              left: handCollapsed ? '▶' : '◀',
              right: handCollapsed ? '◀' : '▶',
            }[handEdge];
            const label = handCollapsed ? `${arrow} Show${isVertical ? '' : ` hand (${me.hand?.length ?? 0})`}` : `${arrow} Hide`;

            function toggleCollapsed() {
              const expanding = handCollapsed;
              const nextCollapsed = !expanding;
              setHandCollapsed(nextCollapsed);
              // Only the edges where the header sits at the box's "far" side
              // in its axis (bottom, right) need the position compensated —
              // for top/left the header is already at the "near" side, so
              // growth naturally happens away from it with no position change.
              if (handEdge === 'bottom' || handEdge === 'right') {
                setHandPos((prev) => {
                  if (!prev) return prev;
                  const delta = expanding ? -handHeightPx : handHeightPx;
                  const next = handEdge === 'bottom' ? { x: prev.x, y: prev.y + delta } : { x: prev.x + delta, y: prev.y };
                  const dims = panelDims(handEdge, nextCollapsed, handWidthPx, handHeightPx);
                  return clampHandPos(next, dims.width, dims.height);
                });
              }
            }

            return (
              <div
                className={`fixed z-20 flex ${panelDirectionClass} rounded-lg border border-white/10 bg-panel/95 shadow-2xl backdrop-blur`}
                style={
                  isVertical
                    ? { left: handPos.x, top: handPos.y, height: handWidthPx, maxHeight: '97vh' }
                    : { left: handPos.x, top: handPos.y, width: handWidthPx, maxWidth: '97vw' }
                }
              >
                {!handCollapsed && (
                  <>
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { top: true })}
                      title="Drag to resize height"
                      className="absolute inset-x-2 top-0 h-2 cursor-ns-resize hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { bottom: true })}
                      title="Drag to resize height"
                      className="absolute inset-x-2 bottom-0 h-2 cursor-ns-resize hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { left: true })}
                      title="Drag to resize width"
                      className="absolute inset-y-2 left-0 w-2 cursor-ew-resize hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { right: true })}
                      title="Drag to resize width"
                      className="absolute inset-y-2 right-0 w-2 cursor-ew-resize hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { top: true, left: true })}
                      title="Drag to resize"
                      className="absolute left-0 top-0 h-2 w-2 cursor-nwse-resize rounded-tl-lg hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { top: true, right: true })}
                      title="Drag to resize"
                      className="absolute right-0 top-0 h-2 w-2 cursor-nesw-resize rounded-tr-lg hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { bottom: true, left: true })}
                      title="Drag to resize"
                      className="absolute bottom-0 left-0 h-2 w-2 cursor-nesw-resize rounded-bl-lg hover:bg-white/10"
                    />
                    <div
                      onPointerDown={(e) => handleHandResizeStart(e, { bottom: true, right: true })}
                      title="Drag to resize"
                      className="absolute bottom-0 right-0 h-2 w-2 cursor-nwse-resize rounded-br-lg hover:bg-white/10"
                    />
                  </>
                )}
                <div
                  className={`flex-shrink-0 ${isVertical ? 'flex flex-col items-stretch' : 'flex items-stretch'} ${rounding.wrapper}`}
                  style={isVertical ? { width: HAND_HEADER_THICKNESS_PX } : { height: HAND_HEADER_THICKNESS_PX }}
                >
                  <div
                    onPointerDown={handleHandDragStart}
                    title="Drag to move your hand — drop it near a screen edge to dock it there"
                    className={`flex flex-1 cursor-move items-center justify-center gap-1 hover:bg-white/5 ${rounding.near}`}
                  >
                    <span
                      className="select-none text-[10px] tracking-widest text-slate-500"
                      style={isVertical ? { writingMode: 'vertical-rl' } : undefined}
                    >
                      • • •
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={toggleCollapsed}
                    className={`flex items-center justify-center gap-1 whitespace-nowrap px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5 ${rounding.far}`}
                    style={isVertical ? { writingMode: 'vertical-rl' } : undefined}
                  >
                    {label}
                  </button>
                </div>
                {!handCollapsed && (
                  <div
                    className={`min-h-0 min-w-0 flex-shrink-0 ${contentPaddingClass}`}
                    style={isVertical ? { width: handHeightPx } : { height: handHeightPx }}
                  >
                    <HandZone
                      hand={me.hand ?? []}
                      cards={state.cards}
                      onPlay={(scryfallId, transformed) =>
                        sendAction({ type: 'PLAY_CARD', scryfallId, fromZone: 'hand', transformed })
                      }
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
              </div>
            );
          })()}
        </div>

        {showLog && (
          <div className="flex h-40 flex-shrink-0 flex-col mobile-landscape:h-28 lg:h-auto lg:w-72">
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

      {menu && <CardContextMenu x={menu.x} y={menu.y} options={menu.options} onClose={() => setMenu(null)} />}

      {librarySearchOpen && me && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[85vh] w-full max-w-5xl overflow-y-auto rounded-lg border border-white/10 bg-slate-900 p-4 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Search your library</h3>
                <p className="text-sm text-slate-400">
                  Choose a card to move from your library to your hand or the top — the rest of your library is then
                  shuffled, same as a real tutor.
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setLibrarySearchOpen(false);
                  // You've now seen the whole library in order — shuffle it
                  // even though nothing was picked, so closing without a
                  // selection can't be used to memorize draw order.
                  await sendAction({ type: 'SHUFFLE_LIBRARY' });
                }}
                className="rounded bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
              >
                Close
              </button>
            </div>

            {me.library && me.library.length > 0 && (
              <input
                type="text"
                value={librarySearchQuery}
                onChange={(e) => setLibrarySearchQuery(e.target.value)}
                placeholder="Filter by card name…"
                autoFocus
                className="mb-4 w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-accent"
              />
            )}

            {me.library && me.library.length > 0 ? (
              (() => {
                const query = librarySearchQuery.trim().toLowerCase();
                const filtered = query
                  ? me.library.filter((scryfallId) => (state.cards[scryfallId]?.name ?? '').toLowerCase().includes(query))
                  : me.library;
                if (filtered.length === 0) {
                  return <p className="text-sm text-slate-400">No cards match &quot;{librarySearchQuery}&quot;.</p>;
                }
                return (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                    {filtered.map((scryfallId, index) => {
                      const facts = state.cards[scryfallId];
                      return (
                        <div
                          key={`${scryfallId}-${index}`}
                          data-scryfall-id={scryfallId}
                          className="rounded border border-white/10 bg-panel p-2"
                        >
                          <CardImage name={facts?.name ?? scryfallId} imageUrl={facts?.imageNormal} />
                          <div className="mt-2 flex flex-col gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                setLibrarySearchOpen(false);
                                await sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'hand', scryfallId });
                                await sendAction({ type: 'SHUFFLE_LIBRARY' });
                              }}
                              className="rounded bg-accent px-2 py-1 text-sm text-white hover:bg-accent/80"
                            >
                              to hand
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                setLibrarySearchOpen(false);
                                // Shuffle first, then move the found card to top —
                                // otherwise shuffling after would just randomize
                                // the card we specifically meant to put on top.
                                await sendAction({ type: 'SHUFFLE_LIBRARY' });
                                await sendAction({ type: 'MOVE_CARD', fromZone: 'library', toZone: 'library', scryfallId, position: 'top' });
                              }}
                              className="rounded bg-slate-700 px-2 py-1 text-sm text-white hover:bg-slate-600"
                            >
                              to top of library
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            ) : (
              <p className="text-sm text-slate-400">Your library is empty.</p>
            )}
          </div>
        </div>
      )}

      {me && me.pendingLookMode === 'reorder' && me.pendingLook.length > 0 && (
        <ReorderTopModal
          cards={me.pendingLook}
          cardFacts={state.cards}
          onConfirm={(order) => sendAction({ type: 'CONFIRM_REORDER', order })}
        />
      )}

      {me && (me.pendingLookMode === 'scry' || me.pendingLookMode === 'surveil') && me.pendingLook.length > 0 && (
        <ScryModal
          mode={me.pendingLookMode}
          cards={me.pendingLook}
          cardFacts={state.cards}
          onResolve={(scryfallId, destination) => sendAction({ type: 'RESOLVE_LOOK', scryfallId, destination })}
        />
      )}

      {addTokenOpen && (
        <AddTokenModal
          onAdd={(scryfallId) => sendAction({ type: 'CREATE_TOKEN', scryfallId })}
          onClose={() => setAddTokenOpen(false)}
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
              knownCustomTypes={state.customCounterTypes ?? []}
              onAdjust={(counterType, delta) =>
                sendAction({ type: 'ADJUST_COUNTER', instanceId: counterEditor.instanceId, counterType, delta })
              }
              onClose={() => setCounterEditor(null)}
            />
          );
        })()}

      {annotationEditor &&
        (() => {
          const card = me?.battlefield.find((c) => c.instanceId === annotationEditor.instanceId);
          if (!card) return null;
          return (
            <AnnotationEditor
              cardName={annotationEditor.name}
              initialText={card.annotation ?? ''}
              onSave={(text) => sendAction({ type: 'SET_ANNOTATION', instanceId: annotationEditor.instanceId, text })}
              onClose={() => setAnnotationEditor(null)}
            />
          );
        })()}

      {givePicker && me && (
        <GivePicker
          cardName={givePicker.name}
          players={otherSeatsFor(me.seat)}
          onPick={(toSeat) => {
            sendAction({ type: 'GIVE_CARD', instanceId: givePicker.instanceId, toSeat });
            setGivePicker(null);
          }}
          onClose={() => setGivePicker(null)}
        />
      )}

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

      {attackPicker && me && (
        <AttackTargetPicker
          cardName={attackPicker.name}
          options={computeAttackOptions()}
          onPick={(option) => {
            sendAction({
              type: 'DECLARE_ATTACK',
              instanceId: attackPicker.instanceId,
              targetType: option.targetType,
              targetSeat: option.targetSeat,
              targetInstanceId: option.targetInstanceId,
            });
            setAttackPicker(null);
          }}
          onClose={() => setAttackPicker(null)}
        />
      )}

      {blockPicker && me && (
        <BlockTargetPicker
          cardName={blockPicker.name}
          options={computeBlockOptions(blockPicker.instanceId)}
          onPick={(attackerInstanceId, currentlyBlocking) => {
            sendAction(
              currentlyBlocking
                ? { type: 'CANCEL_BLOCK', instanceId: blockPicker.instanceId, attackerInstanceId }
                : { type: 'DECLARE_BLOCK', instanceId: blockPicker.instanceId, attackerInstanceId },
            );
            setBlockPicker(null);
          }}
          onClose={() => setBlockPicker(null)}
        />
      )}
    </div>
    </DragDropProvider>
    </CardPreviewProvider>
  );
}
