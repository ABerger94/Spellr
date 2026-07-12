'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

// Cards wrap into a grid that fills the (resizable) hand container instead
// of a single horizontally-scrolling row, so a hand fits entirely on screen
// without scrolling up to NO_SCROLL_CARD_COUNT cards — beyond that, card
// size is pinned to what fit NO_SCROLL_CARD_COUNT and the rest scrolls
// vertically instead of shrinking indefinitely.
const NO_SCROLL_CARD_COUNT = 20;
const CARD_ASPECT = 5 / 7; // width / height, matches CardImage's aspect-ratio
const GAP_PX = 8; // matches gap-2
const MAX_CARD_WIDTH_PX = 160;

/** Picks the column count (1..n) that yields the largest card width while
 * keeping the whole n-card grid within the container's width and height.
 * No minimum is enforced — fitting all n cards without scrolling always
 * wins over a floor on card size; make the hand bar taller/wider (it's
 * user-resizable) if cards get too small to read comfortably. */
function computeCardWidth(n: number, containerWidth: number, containerHeight: number): number {
  if (n <= 0 || containerWidth <= 0 || containerHeight <= 0) return MAX_CARD_WIDTH_PX;
  let best = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const widthFromCols = (containerWidth - GAP_PX * (cols - 1)) / cols;
    const heightFromRows = (containerHeight - GAP_PX * (rows - 1)) / rows;
    const widthFromHeight = heightFromRows * CARD_ASPECT;
    const cardWidth = Math.min(widthFromCols, widthFromHeight);
    if (cardWidth > best) best = cardWidth;
  }
  return Math.min(MAX_CARD_WIDTH_PX, best);
}

export function HandZone({
  hand,
  cards,
  onPlay,
  onContextMenu,
}: {
  hand: string[];
  cards: Record<string, CardFacts>;
  /** transformed is true when the card was flipped to its back face before
   * being played (modal double-faced cards like Sink into Stupor //
   * Sophoric Springs, castable as either side straight from hand). */
  onPlay: (scryfallId: string, transformed: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, scryfallId: string) => void;
}) {
  const { dragging } = useDragDrop();
  const isHover = dragging?.hoverZone === 'hand';
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  // Keyed by `${scryfallId}-${index in hand}` so two copies of the same MDFC
  // can be flipped independently — purely a local "which face am I looking
  // at" preview, not persisted game state, until the card is actually played.
  const [flippedKeys, setFlippedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setContainerSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardWidth = useMemo(
    () => computeCardWidth(Math.min(hand.length, NO_SCROLL_CARD_COUNT), containerSize.width, containerSize.height),
    [hand.length, containerSize.width, containerSize.height],
  );

  function toggleFlip(key: string) {
    setFlippedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="flex h-full flex-col">
      <p className="mb-1 flex-shrink-0 text-[10px] text-slate-500">
        Hand — tap a card to play it, drag it onto a zone, tap ⋯ (or right-click) for more options. Double-faced cards
        show a ⇄ button to flip which side you're about to play
      </p>
      <div
        ref={containerRef}
        data-dropzone="true"
        data-zone="hand"
        className={`flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto rounded pb-1 ${
          isHover ? 'bg-accent/10 ring-2 ring-accent' : ''
        }`}
      >
        {hand.length === 0 && (
          <div className="flex w-full items-center justify-center text-xs text-slate-600">Your hand is empty</div>
        )}
        {hand.map((scryfallId, i) => {
          const facts = cards[scryfallId];
          const key = `${scryfallId}-${i}`;
          const isFlipped = flippedKeys.has(key) && !!facts?.backFace;
          const face = isFlipped ? facts!.backFace! : null;
          return (
            <div key={key} className="flex-shrink-0" style={{ width: cardWidth }}>
              <DraggableCard
                source={{ zone: 'hand', scryfallId, transformed: isFlipped }}
                name={face?.name ?? facts?.name ?? scryfallId}
                imageUrl={face?.imageNormal ?? facts?.imageNormal}
                onClick={() => onPlay(scryfallId, isFlipped)}
                title={`Click or drag to play ${face?.name ?? facts?.name ?? 'this card'}`}
                touchAction="pan-y"
                manaCost={face ? undefined : facts?.manaCost}
                typeLine={face?.typeLine ?? facts?.typeLine}
                oracleText={face?.oracleText ?? facts?.oracleText}
                power={face?.power ?? facts?.power}
                toughness={face?.toughness ?? facts?.toughness}
                onContextMenu={
                  onContextMenu
                    ? (e) => {
                        e.preventDefault();
                        onContextMenu(e, scryfallId);
                      }
                    : undefined
                }
                onMore={onContextMenu ? (e) => onContextMenu(e, scryfallId) : undefined}
                onFlip={facts?.backFace ? () => toggleFlip(key) : undefined}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
