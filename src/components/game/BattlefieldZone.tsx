'use client';

import type { BattlefieldCard, CardFacts } from '@/types/game';
import { DraggableCard } from './DraggableCard';
import { useDragDrop } from './DragDropContext';

// The canvas is deliberately larger than most viewports (especially phones)
// so permanents have real room and don't overlap — the outer box scrolls
// (both axes) to reveal the rest instead of clipping or cramming everything
// into a tiny area.
const CANVAS_MIN_WIDTH = 720;
const CANVAS_MIN_HEIGHT = 480;

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
  const { dragging } = useDragDrop();
  const isHover = interactive && dragging?.hoverZone === 'battlefield';

  return (
    <div className="h-72 w-full overflow-auto rounded border border-white/5">
      <div
        data-dropzone={interactive ? 'true' : undefined}
        data-zone="battlefield"
        className={`relative w-full ${isHover ? 'bg-accent/10 ring-2 ring-inset ring-accent' : ''}`}
        style={{ minWidth: CANVAS_MIN_WIDTH, minHeight: CANVAS_MIN_HEIGHT }}
      >
        {battlefield.length === 0 && (
          <div className="flex h-full items-center justify-center text-xs text-slate-600">
            Battlefield is empty{interactive ? ' — drag cards here, scroll for more room' : ''}
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
    </div>
  );
}
