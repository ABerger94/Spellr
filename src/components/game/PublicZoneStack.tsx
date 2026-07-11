'use client';

import { useState } from 'react';
import type { CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';
import { useDragDrop } from './DragDropContext';

export function PublicZoneStack({
  label,
  zone,
  scryfallIds,
  cards,
  draggable,
  onCardAction,
  compact,
}: {
  label: string;
  zone: 'graveyard' | 'exile';
  scryfallIds: string[];
  cards: Record<string, CardFacts>;
  /** Whether this stack is a valid drop target (only true for the viewer's own zone). */
  draggable?: boolean;
  /** Opens a move-to-zone menu for a card inside the pile viewer modal. */
  onCardAction?: (e: React.MouseEvent, scryfallId: string) => void;
  /** Smaller footprint for the quadrant layout. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { dragging } = useDragDrop();
  const isHover = draggable && dragging?.hoverZone === zone;
  const topId = scryfallIds[scryfallIds.length - 1];
  const topFacts = topId ? cards[topId] : undefined;

  return (
    <>
      <div
        data-dropzone={draggable ? 'true' : undefined}
        data-zone={zone}
        className={`cursor-pointer rounded ${compact ? 'w-10' : 'w-20'} ${isHover ? 'bg-accent/10 ring-2 ring-accent' : ''}`}
        onClick={() => scryfallIds.length > 0 && setOpen(true)}
      >
        {scryfallIds.length > 0 ? (
          <div className="relative">
            <CardImage
              name={topFacts?.name ?? topId}
              imageUrl={topFacts?.imageNormal}
              manaCost={topFacts?.manaCost}
              typeLine={topFacts?.typeLine}
              oracleText={topFacts?.oracleText}
              power={topFacts?.power}
              toughness={topFacts?.toughness}
            />
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
              {scryfallIds.length}
            </span>
          </div>
        ) : (
          <div className="flex aspect-[5/7] items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-slate-600">
            {compact ? label.slice(0, 2) : label}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={() => setOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-panel p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">
                {label} ({scryfallIds.length})
              </h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>
            {onCardAction && (
              <p className="mb-2 text-[11px] text-slate-500">Tap ⋯ (or right-click) a card to move it elsewhere.</p>
            )}
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {[...scryfallIds].reverse().map((id, i) => (
                <div key={`${id}-${i}`} className="w-full">
                  <CardImage
                    name={cards[id]?.name ?? id}
                    imageUrl={cards[id]?.imageNormal}
                    manaCost={cards[id]?.manaCost}
                    typeLine={cards[id]?.typeLine}
                    oracleText={cards[id]?.oracleText}
                    power={cards[id]?.power}
                    toughness={cards[id]?.toughness}
                    onContextMenu={
                      onCardAction
                        ? (e) => {
                            e.preventDefault();
                            onCardAction(e, id);
                          }
                        : undefined
                    }
                    onMore={onCardAction ? (e) => onCardAction(e, id) : undefined}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
