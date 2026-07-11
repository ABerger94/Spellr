'use client';

import { useRef } from 'react';
import { useCardPreview } from '@/components/game/CardPreviewContext';

const LONG_PRESS_MS = 500;
const LONG_PRESS_MOVE_TOLERANCE_PX = 10;

interface CardImageProps {
  name: string;
  imageUrl?: string | null;
  tapped?: boolean;
  selected?: boolean;
  className?: string;
  title?: string;
  /** Counter type -> count (e.g. { '+1/+1': 2 }), rendered as small badges. */
  counters?: Record<string, number>;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  /** Tap-friendly equivalent of onContextMenu — right-click doesn't exist on
   * touch devices, so this renders a visible "more options" button instead
   * of relying on long-press. Called with the same handler shape. */
  onMore?: (e: React.MouseEvent) => void;
  /** Extra facts (beyond name/image) shown in the hover/tap enlarge preview. */
  manaCost?: string | null;
  typeLine?: string | null;
  oracleText?: string | null;
  power?: string | null;
  toughness?: string | null;
  /** Set false to suppress the enlarge-preview trigger (e.g. a card-back). */
  previewable?: boolean;
}

function counterLabel(type: string, count: number): string {
  if (type === '+1/+1') return `+${count}/+${count}`;
  if (type === '-1/-1') return `-${count}/-${count}`;
  return `${type} ${count}`;
}

function counterColor(type: string): string {
  if (type === '+1/+1') return 'bg-green-600/90';
  if (type === '-1/-1') return 'bg-red-600/90';
  return 'bg-slate-600/90';
}

export function CardImage({
  name,
  imageUrl,
  tapped,
  selected,
  className = '',
  title,
  counters,
  onClick,
  onContextMenu,
  onMore,
  manaCost,
  typeLine,
  oracleText,
  power,
  toughness,
  previewable = true,
}: CardImageProps) {
  const counterEntries = Object.entries(counters ?? {}).filter(([, count]) => count > 0);
  const { showPreviewNow, showPreviewOnHover, hidePreview } = useCardPreview();
  const rootRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);

  function previewPayload() {
    return { name, imageUrl, manaCost, typeLine, oracleText, power, toughness };
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }

  // Touch has no hover, so the preview opens on a press-and-hold instead —
  // a plain tap (used to play/tap a card, or hit the ⋯ button) must not
  // trigger it. Real mouse pointers skip this path entirely and keep using
  // hover below.
  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType !== 'touch') return;
    longPressStartRef.current = { x: e.clientX, y: e.clientY };
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      showPreviewNow(previewPayload());
      // Swallow the click that follows this touch's release so the long
      // press doesn't also play/tap the card underneath the preview it just opened.
      const el = rootRef.current;
      if (el) {
        const suppressClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
        };
        el.addEventListener('click', suppressClick, { capture: true, once: true });
      }
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!longPressStartRef.current) return;
    const dx = e.clientX - longPressStartRef.current.x;
    const dy = e.clientY - longPressStartRef.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_TOLERANCE_PX) clearLongPressTimer();
  }

  return (
    <div
      ref={rootRef}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onPointerEnter={previewable ? (e) => { if (e.pointerType === 'mouse') showPreviewOnHover(previewPayload()); } : undefined}
      onPointerLeave={previewable ? (e) => { if (e.pointerType === 'mouse') hidePreview(); } : undefined}
      onPointerDown={previewable ? handlePointerDown : undefined}
      onPointerMove={previewable ? handlePointerMove : undefined}
      onPointerUp={previewable ? clearLongPressTimer : undefined}
      onPointerCancel={previewable ? clearLongPressTimer : undefined}
      title={title ?? name}
      className={`card-image relative inline-block w-full select-none overflow-hidden bg-panelLight shadow-md transition-transform duration-150 ${
        tapped ? 'rotate-90' : ''
      } ${selected ? 'ring-2 ring-accent2' : ''} ${onClick ? 'cursor-pointer hover:scale-[1.03] hover:shadow-xl' : ''} ${className}`}
      style={{ aspectRatio: '5 / 7' }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={name} className="h-full w-full object-cover" draggable={false} loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center p-2 text-center text-[10px] leading-tight text-slate-300">
          {name}
        </div>
      )}
      {onMore && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMore(e);
          }}
          title="More options"
          className="absolute bottom-0.5 left-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black/90"
        >
          ⋯
        </button>
      )}
      {counterEntries.length > 0 && (
        <div className={`absolute bottom-0.5 right-0.5 z-10 flex flex-wrap justify-end gap-0.5 ${onMore ? 'left-7' : 'left-0.5'}`}>
          {counterEntries.map(([type, count]) => (
            <span
              key={type}
              className={`rounded px-1 text-[9px] font-bold leading-tight text-white ${counterColor(type)}`}
            >
              {counterLabel(type, count)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
