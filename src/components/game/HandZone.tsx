'use client';

import { useRef } from 'react';
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
  onPlay: (scryfallId: string) => void;
  onContextMenu?: (e: React.MouseEvent, scryfallId: string) => void;
}) {
  const { dragging } = useDragDrop();
  const isHover = dragging?.hoverZone === 'hand';
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollBy(amount: number) {
    scrollRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  }

  return (
    <div>
      <p className="mb-1 text-[10px] text-slate-500">
        Hand — tap a card to play it, drag it onto a zone, tap ⋯ (or right-click) for more options
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
            return (
              <div key={`${scryfallId}-${i}`} className="w-28 flex-shrink-0">
                <DraggableCard
                  source={{ zone: 'hand', scryfallId }}
                  name={facts?.name ?? scryfallId}
                  imageUrl={facts?.imageNormal}
                  onClick={() => onPlay(scryfallId)}
                  title={`Click or drag to play ${facts?.name ?? 'this card'}`}
                  touchAction="pan-x"
                  manaCost={facts?.manaCost}
                  typeLine={facts?.typeLine}
                  oracleText={facts?.oracleText}
                  power={facts?.power}
                  toughness={facts?.toughness}
                  onContextMenu={
                    onContextMenu
                      ? (e) => {
                          e.preventDefault();
                          onContextMenu(e, scryfallId);
                        }
                      : undefined
                  }
                  onMore={onContextMenu ? (e) => onContextMenu(e, scryfallId) : undefined}
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
