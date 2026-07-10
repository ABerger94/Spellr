'use client';

import { useState } from 'react';
import type { CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

export function PublicZoneStack({
  label,
  scryfallIds,
  cards,
  onCardClick,
}: {
  label: string;
  scryfallIds: string[];
  cards: Record<string, CardFacts>;
  onCardClick?: (scryfallId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const topId = scryfallIds[scryfallIds.length - 1];
  const topFacts = topId ? cards[topId] : undefined;

  return (
    <>
      <div className="w-20 cursor-pointer" onClick={() => scryfallIds.length > 0 && setOpen(true)}>
        {scryfallIds.length > 0 ? (
          <div className="relative">
            <CardImage name={topFacts?.name ?? topId} imageUrl={topFacts?.imageNormal} />
            <span className="absolute right-1 top-1 rounded bg-black/70 px-1 text-[10px] font-semibold text-white">
              {scryfallIds.length}
            </span>
          </div>
        ) : (
          <div className="flex aspect-[5/7] items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-slate-600">
            {label}
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
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
              {[...scryfallIds].reverse().map((id, i) => (
                <div key={`${id}-${i}`} className="w-full">
                  <CardImage
                    name={cards[id]?.name ?? id}
                    imageUrl={cards[id]?.imageNormal}
                    onClick={onCardClick ? () => onCardClick(id) : undefined}
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
