'use client';

import type { BattlefieldCard, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

/** Dense, non-scrolling battlefield for the quadrant layout — small cards
 * that wrap to fill the available space instead of BattlefieldZone's larger
 * freeform-positioned canvas, so a whole board fits on screen at once. */
export function CompactBattlefield({
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
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';

  return (
    <div
      data-dropzone={interactive ? 'true' : undefined}
      data-zone="battlefield"
      className={`flex h-full flex-wrap content-start gap-1 overflow-y-auto overflow-x-hidden rounded p-1 ${
        isHover ? 'bg-accent/10 ring-2 ring-inset ring-accent' : ''
      }`}
    >
      {battlefield.length === 0 && (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-600">
          {interactive ? 'Drag cards here' : 'Empty'}
        </div>
      )}
      {battlefield.map((c) => {
        const facts = cards[c.scryfallId];
        return (
          <div key={c.instanceId} className="w-16 flex-shrink-0">
            <DraggableCard
              source={interactive ? { zone: 'battlefield', instanceId: c.instanceId } : null}
              name={facts?.name ?? c.scryfallId}
              imageUrl={facts?.imageNormal}
              tapped={c.tapped}
              counters={c.counters}
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
  );
}
