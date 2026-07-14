'use client';

import { useState } from 'react';

export function RevealHandPicker({
  players,
  onRevealToAll,
  onRevealToSeats,
  onClose,
}: {
  players: { seat: number; name: string }[];
  onRevealToAll: () => void;
  onRevealToSeats: (seats: number[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  function toggle(seat: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat)) next.delete(seat);
      else next.add(seat);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Reveal hand to…</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        <button
          onClick={() => {
            onRevealToAll();
            onClose();
          }}
          className="mb-3 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/80"
        >
          🌐 Reveal to everyone
        </button>

        {players.length === 0 ? (
          <p className="text-sm text-slate-400">No other players at the table.</p>
        ) : (
          <>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Or pick specific players</p>
            <div className="mb-3 max-h-60 divide-y divide-white/5 overflow-y-auto">
              {players.map((p) => (
                <label key={p.seat} className="flex cursor-pointer items-center gap-2 py-2 text-sm text-slate-200 hover:text-white">
                  <input type="checkbox" checked={selected.has(p.seat)} onChange={() => toggle(p.seat)} />
                  {p.name}
                </label>
              ))}
            </div>
            <button
              onClick={() => {
                onRevealToSeats([...selected]);
                onClose();
              }}
              disabled={selected.size === 0}
              className="w-full rounded bg-panelLight px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Reveal to selected ({selected.size})
            </button>
          </>
        )}
      </div>
    </div>
  );
}
