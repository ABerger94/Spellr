'use client';

interface CardImageProps {
  name: string;
  imageUrl?: string | null;
  tapped?: boolean;
  selected?: boolean;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

export function CardImage({ name, imageUrl, tapped, selected, className = '', onClick, onContextMenu }: CardImageProps) {
  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={name}
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
    </div>
  );
}
