'use client';

import { useState } from 'react';

export function LookCountPrompt({
  label,
  direction = 'down',
  onConfirm,
  onCancel,
}: {
  label: string;
  /** 'down' opens below the anchor (default), 'up' opens above it — use 'up'
   * near the bottom of the viewport (e.g. a fixed bottom action bar). */
  direction?: 'down' | 'up';
  onConfirm: (count: number) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(1);
  const positionClass = direction === 'up' ? 'bottom-full left-1/2 mb-2 -translate-x-1/2' : 'mt-1';

  return (
    <div className={`absolute z-40 flex items-center gap-2 whitespace-nowrap rounded border border-white/10 bg-panel p-2 shadow-xl ${positionClass}`}>
      <span className="text-xs text-slate-300">{label}</span>
      <input
        type="number"
        min={1}
        max={20}
        value={count}
        onChange={(e) => setCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
        className="w-14 rounded border border-white/10 bg-panelLight px-1 py-0.5 text-center text-white"
        autoFocus
      />
      <button
        onClick={() => onConfirm(count)}
        className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent/80"
      >
        Go
      </button>
      <button onClick={onCancel} className="rounded bg-panelLight px-2 py-1 text-xs text-slate-300 hover:bg-white/10">
        Cancel
      </button>
    </div>
  );
}
