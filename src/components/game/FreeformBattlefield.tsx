'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { BattlefieldCard, CardFace, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

// The canvas is deliberately larger than most viewports (especially phones)
// so permanents have real room and don't overlap — the outer box scrolls
// (both axes) to reveal the rest instead of clipping or cramming everything
// into a tiny area.
const CANVAS_MIN_WIDTH = 720;
const CANVAS_MIN_HEIGHT = 480;
const CARD_WIDTH_PX = 96;
const CARD_ASPECT_RATIO = 7 / 5; // height / width, matches CardImage's 5:7
/** How far each attached card (aura/equipment) peeks out from under its host. */
const ATTACH_OFFSET_PX = 16;
/** Minimum pointer travel before a canvas drag counts as a marquee instead
 * of a plain click (which clears the selection instead). */
const SELECT_DRAG_THRESHOLD_PX = 4;

function faceFor(card: BattlefieldCard, facts: CardFacts | undefined): (CardFace & { manaCost?: string | null }) | undefined {
  if (card.transformed && facts?.backFace) return facts.backFace;
  return facts;
}

/** Freeform battlefield: cards sit wherever their x/y percent position says
 * and can be dragged anywhere within the canvas, matching a real playmat.
 * Cards attached to another card (auras/equipment) render stacked behind
 * their host instead of getting their own spot. */
export function FreeformBattlefield({
  battlefield,
  cards,
  interactive,
  onTapToggle,
  onContextMenu,
  compact,
  zoom = 1,
  combatLabels,
  selectedInstanceIds,
  onSelectionChange,
}: {
  battlefield: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  interactive: boolean;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
  /** Fills the height of its parent instead of a fixed height — used in the
   * grid quadrant layout, where the parent itself is already sized to fit
   * the available space. The canvas is unchanged and still scrolls to reach
   * every card. */
  compact?: boolean;
  /** Scales card size only — the battlefield zone itself keeps its actual
   * footprint, so zooming out fits more cards into the same space instead
   * of shrinking (and wasting) the zone around them. */
  zoom?: number;
  /** Combat helper badges, keyed by instanceId, precomputed table-wide by
   * the caller (a card's attack target or blocked attacker may belong to a
   * different player, so the label text can't be resolved locally here). */
  combatLabels?: Record<string, { text: string; variant: 'attacking' | 'blocking' }>;
  /** Multi-select: instanceIds currently drag-selected on this board, shown
   * with a gold ring. Only meaningful (and only wired up) on the viewer's
   * own interactive battlefield. */
  selectedInstanceIds?: Set<string>;
  /** Dragging on empty canvas space draws a marquee and reports every root
   * card it overlaps; a plain click (no drag) on empty space reports an
   * empty set, clearing the selection. Mouse only — touch keeps the canvas's
   * native scroll-to-pan gesture on empty space instead. */
  onSelectionChange?: (ids: Set<string>) => void;
}) {
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';
  const cardWidth = CARD_WIDTH_PX * zoom;
  const attachOffset = ATTACH_OFFSET_PX * zoom;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const byInstance = new Map(battlefield.map((c) => [c.instanceId, c]));
  const attachedByHost = new Map<string, BattlefieldCard[]>();
  const roots: BattlefieldCard[] = [];
  for (const c of battlefield) {
    if (c.attachedTo && byInstance.has(c.attachedTo)) {
      if (!attachedByHost.has(c.attachedTo)) attachedByHost.set(c.attachedTo, []);
      attachedByHost.get(c.attachedTo)!.push(c);
    } else {
      roots.push(c);
    }
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    if (!onSelectionChange || e.button !== 0 || e.pointerType !== 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-battlefield-card]')) return; // let the card's own drag/click handle it
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;

    function onMove(ev: PointerEvent) {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < SELECT_DRAG_THRESHOLD_PX) return;
      moved = true;
      setMarquee({
        left: Math.min(startX, ev.clientX),
        top: Math.min(startY, ev.clientY),
        width: Math.abs(dx),
        height: Math.abs(dy),
      });
    }

    function onUp(ev: PointerEvent) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setMarquee(null);
      if (!moved) {
        onSelectionChange!(new Set());
        return;
      }

      const selLeft = Math.min(startX, ev.clientX);
      const selTop = Math.min(startY, ev.clientY);
      const selRight = Math.max(startX, ev.clientX);
      const selBottom = Math.max(startY, ev.clientY);
      const rect = canvasEl!.getBoundingClientRect();
      const cardHeight = cardWidth * CARD_ASPECT_RATIO;

      const picked = new Set<string>();
      for (const c of roots) {
        const cardLeft = rect.left + (c.x / 100) * rect.width;
        const cardTop = rect.top + (c.y / 100) * rect.height;
        if (cardLeft < selRight && cardLeft + cardWidth > selLeft && cardTop < selBottom && cardTop + cardHeight > selTop) {
          picked.add(c.instanceId);
        }
      }
      onSelectionChange!(picked);
    }

    function onCancel() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      setMarquee(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function renderCard(c: BattlefieldCard) {
    const facts = cards[c.scryfallId];
    const face = faceFor(c, facts);
    return (
      <DraggableCard
        source={interactive ? { zone: 'battlefield', instanceId: c.instanceId } : null}
        name={face?.name ?? c.scryfallId}
        imageUrl={face?.imageNormal}
        tapped={c.tapped}
        selected={selectedInstanceIds?.has(c.instanceId)}
        counters={c.counters}
        typeLine={face?.typeLine}
        oracleText={face?.oracleText}
        power={face?.power}
        toughness={face?.toughness}
        manaCost={c.transformed ? undefined : facts?.manaCost}
        onClick={interactive && onTapToggle ? () => onTapToggle(c.instanceId, c.tapped) : undefined}
        onContextMenu={
          interactive && onContextMenu
            ? (e) => {
                e.preventDefault();
                onContextMenu(e, c);
              }
            : undefined
        }
        onMore={interactive && onContextMenu ? (e) => onContextMenu(e, c) : undefined}
        combatBadge={combatLabels?.[c.instanceId]}
      />
    );
  }

  return (
    <div className={`w-full overflow-auto rounded border border-white/5 ${compact ? 'h-full' : 'h-72'}`}>
      <div
        ref={canvasRef}
        data-dropzone={interactive ? 'true' : undefined}
        data-zone="battlefield"
        onPointerDown={interactive ? handleCanvasPointerDown : undefined}
        className={`relative ${compact ? 'h-full w-full' : 'w-full'} ${isHover ? 'bg-accent/10 ring-2 ring-inset ring-accent' : ''}`}
        style={{
          minWidth: compact ? undefined : CANVAS_MIN_WIDTH,
          minHeight: compact ? undefined : CANVAS_MIN_HEIGHT,
        }}
      >
        {battlefield.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Battlefield is empty{interactive ? ' — drag cards here, scroll for more room' : ''}
          </div>
        )}
        {roots.map((root) => {
          const attachments = attachedByHost.get(root.instanceId) ?? [];
          return (
            <div
              key={root.instanceId}
              className="absolute"
              style={{ left: `${root.x}%`, top: `${root.y}%`, width: cardWidth }}
            >
              <div className="relative" style={{ width: cardWidth }}>
                {attachments.map((att, i) => (
                  <div
                    key={att.instanceId}
                    data-battlefield-card={interactive ? att.instanceId : undefined}
                    className="absolute"
                    style={{ left: (i + 1) * attachOffset, top: (i + 1) * attachOffset, width: cardWidth, zIndex: i + 1 }}
                  >
                    {renderCard(att)}
                  </div>
                ))}
                <div
                  data-battlefield-card={interactive ? root.instanceId : undefined}
                  className="relative"
                  style={{ zIndex: attachments.length + 1 }}
                >
                  {renderCard(root)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {marquee &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] rounded border-2 border-amber-400 bg-amber-400/10"
            style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
          />,
          document.body,
        )}
    </div>
  );
}
