'use client';

import type { CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

export function CommandZone({
  scryfallIds,
  cards,
  onPlay,
  draggable,
  compact,
}: {
  scryfallIds: string[];
  cards: Record<string, CardFacts>;
  onPlay?: (scryfallId: string) => void;
  draggable?: boolean;
  /** Smaller footprint for the quadrant layout. */
  compact?: boolean;
}) {
  const { dragging } = useDragDrop();
  const isHover = draggable && dragging?.hoverZone === 'commandZone';
  const cardWidth = compact ? 'w-10' : 'w-20';

  return (
    <div
      data-dropzone={draggable ? 'true' : undefined}
      data-zone="commandZone"
      className={`flex gap-2 rounded ${isHover ? 'bg-accent/10 ring-2 ring-accent' : ''}`}
    >
      {scryfallIds.length === 0 ? (
        <div
          className={`flex items-center justify-center rounded border border-dashed border-white/10 text-slate-600 ${
            compact ? 'aspect-[5/7] w-10 text-[8px]' : 'h-24 w-20 text-[10px]'
          }`}
        >
          {compact ? 'CZ' : 'Command zone'}
        </div>
      ) : (
        scryfallIds.map((id, i) => (
          <div key={`${id}-${i}`} className={cardWidth}>
            <DraggableCard
              source={draggable ? { zone: 'commandZone', scryfallId: id } : null}
              name={cards[id]?.name ?? id}
              imageUrl={cards[id]?.imageNormal}
              onClick={onPlay ? () => onPlay(id) : undefined}
              manaCost={cards[id]?.manaCost}
              typeLine={cards[id]?.typeLine}
              oracleText={cards[id]?.oracleText}
              power={cards[id]?.power}
              toughness={cards[id]?.toughness}
            />
          </div>
        ))
      )}
    </div>
  );
}
