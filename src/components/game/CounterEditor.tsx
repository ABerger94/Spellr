'use client';

import { useState } from 'react';

const QUICK_TYPES = ['+1/+1', '-1/-1'];

export function CounterEditor({
  cardName,
  counters,
  onAdjust,
  onClose,
}: {
  cardName: string;
  counters: Record<string, number>;
  onAdjust: (counterType: string, delta: number) => void;
  onClose: () => void;
}) {
  const [customType, setCustomType] = useState('');
  const customTypes = Object.keys(counters).filter((type) => !QUICK_TYPES.includes(type) && counters[type] > 0);

  function Row({ type }: { type: string }) {
    const count = counters[type] ?? 0;
    return (
      <div className="flex items-center justify-between gap-2 py-1.5">
        <span className="text-sm text-slate-200">{type}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onAdjust(type, -1)}
            disabled={count === 0}
            className="h-7 w-7 rounded bg-panelLight text-white hover:bg-white/10 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-6 text-center text-sm font-medium text-white">{count}</span>
          <button onClick={() => onAdjust(type, 1)} className="h-7 w-7 rounded bg-panelLight text-white hover:bg-white/10">
            +
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Counters — {cardName}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <div className="divide-y divide-white/5">
          {QUICK_TYPES.map((type) => (
            <Row key={type} type={type} />
          ))}
          {customTypes.map((type) => (
            <Row key={type} type={type} />
          ))}
        </div>
        <div className="mt-3 flex gap-2 border-t border-white/10 pt-3">
          <input
            value={customType}
            onChange={(e) => setCustomType(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customType.trim()) {
                onAdjust(customType.trim(), 1);
                setCustomType('');
              }
            }}
            placeholder="Custom counter name (e.g. charge)"
            maxLength={20}
            className="flex-1 rounded border border-white/10 bg-panelLight px-2 py-1 text-sm text-white placeholder:text-slate-500"
          />
          <button
            onClick={() => {
              if (customType.trim()) {
                onAdjust(customType.trim(), 1);
                setCustomType('');
              }
            }}
            className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent/80"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
