'use client';

import { useRef } from 'react';
import { CardImage } from '@/components/card/CardImage';
import { useDragDrop, type DragSource } from './DragDropContext';

const DRAG_THRESHOLD_PX = 6;

export function DraggableCard({
  source,
  name,
  imageUrl,
  tapped,
  className,
  title,
  onClick,
  onContextMenu,
  onMore,
  touchAction = 'none',
}: {
  /** Pass null to disable dragging (e.g. opponents' cards, read-only views). */
  source: DragSource | null;
  name: string;
  imageUrl?: string | null;
  tapped?: boolean;
  className?: string;
  title?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMore?: (e: React.MouseEvent) => void;
  /** 'pan-x' lets a horizontal swipe fall through to a scrollable ancestor
   * (e.g. the hand strip) instead of always being claimed for dragging. */
  touchAction?: 'none' | 'pan-x';
}) {
  const { startDrag, updateDrag, endDrag, cancelDrag } = useDragDrop();
  const elRef = useRef<HTMLDivElement>(null);

  function handlePointerDown(e: React.PointerEvent) {
    if (!source || e.button !== 0 || !elRef.current) return;
    const rect = elRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;

    function suppressClick(ev: MouseEvent) {
      ev.preventDefault();
      ev.stopPropagation();
    }

    function cleanup() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    }

    function onMove(ev: PointerEvent) {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        startDrag(source!, { name, imageUrl }, { clientX: startX, clientY: startY }, rect);
      }
      updateDrag(ev.clientX, ev.clientY);
    }

    function onUp(ev: PointerEvent) {
      cleanup();
      if (dragging && elRef.current) {
        // A click event fires right after pointerup on the same element;
        // swallow just that one so a drag doesn't also trigger the card's
        // tap-to-play/tap-to-tap action.
        elRef.current.addEventListener('click', suppressClick, { capture: true, once: true });
        endDrag(ev.clientX, ev.clientY);
      }
    }

    function onCancel() {
      cleanup();
      if (dragging) cancelDrag();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  return (
    <div ref={elRef} onPointerDown={handlePointerDown} style={source ? { touchAction } : undefined}>
      <CardImage
        name={name}
        imageUrl={imageUrl}
        tapped={tapped}
        className={className}
        title={title}
        onClick={onClick}
        onContextMenu={onContextMenu}
        onMore={onMore}
      />
    </div>
  );
}
