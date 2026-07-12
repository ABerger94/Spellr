'use client';

import { CardSearchAutocomplete } from '@/components/deck/CardSearchAutocomplete';

/** Tokens are just real Scryfall cards with layout:token (Treasure, Clue,
 * 1/1 Soldier, ...) — Scryfall indexes all of them with real art, so this
 * reuses the same search infrastructure as the deck builder instead of
 * building a separate "design your own token" form. */
export function AddTokenModal({ onAdd, onClose }: { onAdd: (scryfallId: string) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-panel p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Add a token</h3>
            <p className="text-sm text-slate-400">Search for a real token card (Treasure, Clue, 1/1 Soldier, ...) to put on your battlefield.</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
        <CardSearchAutocomplete
          queryPrefix="t:token"
          placeholder="e.g. treasure, clue, 1/1 soldier…"
          onAdd={(scryfallId) => {
            onAdd(scryfallId);
            onClose();
          }}
        />
      </div>
    </div>
  );
}
