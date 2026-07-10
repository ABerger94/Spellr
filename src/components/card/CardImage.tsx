'use client';

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
}: CardImageProps) {
  const counterEntries = Object.entries(counters ?? {}).filter(([, count]) => count > 0);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
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
          className="absolute right-0.5 top-0.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-xs text-white hover:bg-black/90"
        >
          ⋯
        </button>
      )}
      {counterEntries.length > 0 && (
        <div className="absolute bottom-0.5 left-0.5 right-0.5 z-10 flex flex-wrap gap-0.5">
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
