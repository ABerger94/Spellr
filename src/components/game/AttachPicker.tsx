'use client';

import type { BattlefieldCard, CardFacts } from '@/types/game';

export function AttachPicker({
  cardName,
  candidates,
  cards,
  onPick,
  onClose,
}: {
  cardName: string;
  candidates: BattlefieldCard[];
  cards: Record<string, CardFacts>;
  onPick: (targetInstanceId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg bg-panel p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-lg font-medium text-white">Attach {cardName} to…</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        {candidates.length === 0 ? (
          <p className="text-sm text-slate-400">No other permanents on your battlefield to attach this to.</p>
        ) : (
          <div className="max-h-80 divide-y divide-white/5 overflow-y-auto">
            {candidates.map((c) => (
              <button
                key={c.instanceId}
                onClick={() => onPick(c.instanceId)}
                className="block w-full py-2 text-left text-sm text-slate-200 hover:text-white"
              >
                {cards[c.scryfallId]?.name ?? c.scryfallId}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
