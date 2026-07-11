'use client';

import { CardBack } from '@/components/card/CardBack';
import { useDragDrop } from './DragDropContext';

export function LibraryStack({
  count,
  onDraw,
  onShuffle,
  draggable,
  compact,
}: {
  count: number;
  onDraw?: () => void;
  onShuffle?: () => void;
  draggable?: boolean;
  /** Smaller footprint (no hint text, tighter shuffle button) for the quadrant layout. */
  compact?: boolean;
}) {
  const { dragging } = useDragDrop();
  const isHover = draggable && dragging?.hoverZone === 'library';

  return (
    <div className={compact ? 'w-10' : 'w-20'}>
      <div
        data-dropzone={draggable ? 'true' : undefined}
        data-zone="library"
        onClick={onDraw}
        role={onDraw ? 'button' : undefined}
        title={onDraw ? 'Click to draw a card, or drag a card here to put it on top of the library' : undefined}
        className={`rounded ${onDraw ? 'cursor-pointer transition-transform hover:scale-[1.03]' : ''} ${
          isHover ? 'bg-accent/10 ring-2 ring-accent' : ''
        }`}
      >
        <CardBack count={count} label="Library" />
      </div>
      {!compact && onDraw && <p className="mt-0.5 text-center text-[10px] text-slate-500">Click to draw · drag for top</p>}
      {onShuffle && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onShuffle();
          }}
          title="Shuffle your library"
          className={`mt-0.5 w-full rounded bg-panelLight text-center text-slate-300 hover:bg-white/10 ${
            compact ? 'py-0 text-[8px]' : 'py-0.5 text-[10px]'
          }`}
        >
          🔀{!compact && ' Shuffle'}
        </button>
      )}
    </div>
  );
}
