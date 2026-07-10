'use client';

import type { BattlefieldCard, CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

export function BattlefieldZone({
  battlefield,
  cards,
  interactive,
  onTapToggle,
  onContextMenu,
}: {
  battlefield: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  interactive: boolean;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
}) {
  if (battlefield.length === 0) {
    return <div className="flex h-24 items-center justify-center text-xs text-slate-600">Battlefield is empty</div>;
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(8, minmax(64px, 1fr))' }}>
        {battlefield.map((c) => {
          const facts = cards[c.scryfallId];
          return (
            <div key={c.instanceId} style={{ gridColumn: c.x + 1, gridRow: c.y + 1 }}>
              <CardImage
                name={facts?.name ?? c.scryfallId}
                imageUrl={facts?.imageNormal}
                tapped={c.tapped}
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
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
