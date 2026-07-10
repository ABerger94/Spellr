'use client';

import { useState } from 'react';

export function LookCountPrompt({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (count: number) => void;
  onCancel: () => void;
}) {
  const [count, setCount] = useState(1);

  return (
    <div className="absolute z-40 mt-1 flex items-center gap-2 rounded border border-white/10 bg-panel p-2 shadow-xl">
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
