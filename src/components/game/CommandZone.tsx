'use client';

import type { CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

export function CommandZone({
  scryfallIds,
  cards,
  onPlay,
  draggable,
}: {
  scryfallIds: string[];
  cards: Record<string, CardFacts>;
  onPlay?: (scryfallId: string) => void;
  draggable?: boolean;
}) {
  const { dragging } = useDragDrop();
  const isHover = draggable && dragging?.hoverZone === 'commandZone';

  return (
    <div
      data-dropzone={draggable ? 'true' : undefined}
      data-zone="commandZone"
      className={`flex gap-2 rounded ${isHover ? 'bg-accent/10 ring-2 ring-accent' : ''}`}
    >
      {scryfallIds.length === 0 ? (
        <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-slate-600">
          Command zone
        </div>
      ) : (
        scryfallIds.map((id, i) => (
          <div key={`${id}-${i}`} className="w-20">
            <DraggableCard
              source={draggable ? { zone: 'commandZone', scryfallId: id } : null}
              name={cards[id]?.name ?? id}
              imageUrl={cards[id]?.imageNormal}
              onClick={onPlay ? () => onPlay(id) : undefined}
            />
          </div>
        ))
      )}
    </div>
  );
}
