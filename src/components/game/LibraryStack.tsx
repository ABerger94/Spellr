'use client';

import { CardBack } from '@/components/card/CardBack';
import { useDragDrop } from './DragDropContext';

export function LibraryStack({ count, onDraw, draggable }: { count: number; onDraw?: () => void; draggable?: boolean }) {
  const { dragging } = useDragDrop();
  const isHover = draggable && dragging?.hoverZone === 'library';

  return (
    <div className="w-20">
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
      {onDraw && <p className="mt-0.5 text-center text-[10px] text-slate-500">Click to draw · drag cards here for top</p>}
    </div>
  );
}
