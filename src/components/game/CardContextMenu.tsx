'use client';

import { useEffect, useRef } from 'react';

export interface ContextMenuOption {
  label: string;
  onClick: () => void;
}

export function CardContextMenu({
  x,
  y,
  options,
  onClose,
}: {
  x: number;
  y: number;
  options: ContextMenuOption[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y }}
      className="z-50 min-w-[160px] rounded border border-white/10 bg-panel py-1 shadow-xl"
    >
      {options.map((opt) => (
        <button
          key={opt.label}
          onClick={() => {
            opt.onClick();
            onClose();
          }}
          className="block w-full px-3 py-1.5 text-left text-sm text-slate-200 hover:bg-panelLight"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
