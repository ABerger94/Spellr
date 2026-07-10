'use client';

import { useState } from 'react';

const DIE_SIZES = [4, 6, 8, 10, 12, 20, 100];

export function DiceRoller({ onRoll, onFlip }: { onRoll: (sides: number) => void; onFlip: () => void }) {
  const [sides, setSides] = useState(6);

  return (
    <div className="flex items-center gap-1.5 border-t border-white/10 bg-panel p-2">
      <button
        onClick={() => onRoll(sides)}
        className="rounded bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-slate-200"
      >
        Roll
      </button>
      <select
        value={sides}
        onChange={(e) => setSides(Number(e.target.value))}
        className="rounded border border-white/10 bg-panelLight px-1.5 py-1.5 text-xs text-white"
      >
        {DIE_SIZES.map((n) => (
          <option key={n} value={n}>
            d{n}
          </option>
        ))}
      </select>
      <button
        onClick={onFlip}
        className="ml-auto rounded bg-panelLight px-3 py-1.5 text-xs font-medium text-white hover:bg-white/10"
      >
        Flip
      </button>
    </div>
  );
}
