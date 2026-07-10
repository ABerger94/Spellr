'use client';

import type { CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

export function CommandZone({
  scryfallIds,
  cards,
  onPlay,
}: {
  scryfallIds: string[];
  cards: Record<string, CardFacts>;
  onPlay?: (scryfallId: string) => void;
}) {
  if (scryfallIds.length === 0) {
    return <div className="flex h-24 w-20 items-center justify-center rounded border border-dashed border-white/10 text-[10px] text-slate-600">Command zone</div>;
  }

  return (
    <div className="flex gap-2">
      {scryfallIds.map((id, i) => (
        <div key={`${id}-${i}`} className="w-20">
          <CardImage
            name={cards[id]?.name ?? id}
            imageUrl={cards[id]?.imageNormal}
            onClick={onPlay ? () => onPlay(id) : undefined}
          />
        </div>
      ))}
    </div>
  );
}
