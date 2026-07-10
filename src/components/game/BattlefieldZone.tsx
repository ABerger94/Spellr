'use client';

import type { BattlefieldCard, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

export function BattlefieldZone({
  battlefield,
  cards,
  interactive,
  zoom = 1,
  onTapToggle,
  onContextMenu,
}: {
  battlefield: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  interactive: boolean;
  /** Client-side-only view scale (does not affect stored positions). */
  zoom?: number;
  onTapToggle?: (instanceId: string, tapped: boolean) => void;
  onContextMenu?: (e: React.MouseEvent, card: BattlefieldCard) => void;
}) {
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';

  return (
    <div
      data-dropzone={interactive ? 'true' : undefined}
      data-zone="battlefield"
      className={`relative h-56 w-full overflow-hidden rounded sm:h-64 ${
        isHover ? 'bg-accent/10 ring-2 ring-accent' : ''
      }`}
      style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
    >
      {battlefield.length === 0 && (
        <div className="flex h-full items-center justify-center text-xs text-slate-600">
          Battlefield is empty{interactive ? ' — drag cards here' : ''}
        </div>
      )}
      {battlefield.map((c) => {
        const facts = cards[c.scryfallId];
        return (
          <div key={c.instanceId} className="absolute w-20 sm:w-24" style={{ left: `${c.x}%`, top: `${c.y}%` }}>
            <DraggableCard
              source={interactive ? { zone: 'battlefield', instanceId: c.instanceId } : null}
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
  );
}
