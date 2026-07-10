'use client';

import type { CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

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
  if (hand.length === 0) {
    return <div className="flex h-28 items-center justify-center text-xs text-slate-600">Your hand is empty</div>;
  }

  return (
    <div>
      <p className="mb-1 text-[10px] text-slate-500">Hand — click a card to play it, right-click for discard/exile</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {hand.map((scryfallId, i) => {
          const facts = cards[scryfallId];
          return (
            <div key={`${scryfallId}-${i}`} className="w-28 flex-shrink-0">
              <CardImage
                name={facts?.name ?? scryfallId}
                imageUrl={facts?.imageNormal}
                onClick={() => onPlay(scryfallId)}
                title={`Click to play ${facts?.name ?? 'this card'}`}
                onContextMenu={
                  onContextMenu
                    ? (e) => {
                        e.preventDefault();
                        onContextMenu(e, scryfallId);
                      }
                    : undefined
                }
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
