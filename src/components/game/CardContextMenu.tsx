'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

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
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let left = x;
    let top = y;
    if (left + rect.width > window.innerWidth - margin) left = window.innerWidth - rect.width - margin;
    if (left < margin) left = margin;
    if (top + rect.height > window.innerHeight - margin) top = window.innerHeight - rect.height - margin;
    if (top < margin) top = margin;
    setPos({ left, top });
  }, [x, y]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // Capture-phase + stopPropagation so the click that dismisses this menu
        // doesn't also fall through to whatever card/button is underneath it.
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
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
