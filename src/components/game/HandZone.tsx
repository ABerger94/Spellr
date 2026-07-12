'use client';

import { useRef, useState } from 'react';
import type { CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

const SCROLL_AMOUNT_PX = 240;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  // Keyed by `${scryfallId}-${index in hand}` so two copies of the same MDFC
  // can be flipped independently — purely a local "which face am I looking
  // at" preview, not persisted game state, until the card is actually played.
  const [flippedKeys, setFlippedKeys] = useState<Set<string>>(new Set());

  function toggleFlip(key: string) {
    setFlippedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <div>
      <p className="mb-1 text-[10px] text-slate-500">
        Hand — tap a card to play it, drag it onto a zone, tap ⋯ (or right-click) for more options. Double-faced cards
        show a ⇄ button to flip which side you're about to play
      </p>
      <div className="relative">
        {hand.length > 2 && (
          <button
            onClick={() => scrollBy(-SCROLL_AMOUNT_PX)}
            title="Scroll hand left"
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-2 py-3 text-white hover:bg-black/90"
          >
            ‹
          </button>
        )}
        <div
          ref={scrollRef}
          data-dropzone="true"
          data-zone="hand"
          className={`flex min-h-[7.5rem] gap-2 overflow-x-auto rounded pb-1 ${
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
              <div key={key} className="w-28 flex-shrink-0">
                <DraggableCard
                  source={{ zone: 'hand', scryfallId, transformed: isFlipped }}
                  name={face?.name ?? facts?.name ?? scryfallId}
                  imageUrl={face?.imageNormal ?? facts?.imageNormal}
                  onClick={() => onPlay(scryfallId, isFlipped)}
                  title={`Click or drag to play ${face?.name ?? facts?.name ?? 'this card'}`}
                  touchAction="pan-x"
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
        {hand.length > 2 && (
          <button
            onClick={() => scrollBy(SCROLL_AMOUNT_PX)}
            title="Scroll hand right"
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/70 px-2 py-3 text-white hover:bg-black/90"
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}
