'use client';

import { useState } from 'react';
import type { CardFacts } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

/** Sensei's Divining Top-style modal: look at the top X cards and rearrange
 * them with the arrows, then confirm — the whole batch goes back on top of
 * the library in the chosen order. Nothing is shuffled and nothing leaves
 * the library, unlike scry/surveil which resolve each card individually to
 * a destination. */
export function ReorderTopModal({
  cards,
  cardFacts,
  onConfirm,
}: {
  cards: string[];
  cardFacts: Record<string, CardFacts>;
  onConfirm: (order: string[]) => void;
}) {
  const [order, setOrder] = useState(cards);

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setOrder((prev) => {
      if (index === prev.length - 1) return prev;
      const next = [...prev];
      [next[index + 1], next[index]] = [next[index], next[index + 1]];
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-panel p-4">
        <h3 className="mb-1 text-lg font-medium text-white">Look at top {cards.length} &amp; reorder</h3>
        <p className="mb-4 text-sm text-slate-400">
          Rearrange these cards with the arrows, then confirm — they go back on top of your library in this exact
          order (#1 ends up on top). Nothing is shuffled.
        </p>
        <div className="space-y-2">
          {order.map((scryfallId, i) => {
            const facts = cardFacts[scryfallId];
            return (
              <div
                key={`${scryfallId}-${i}`}
                className="flex items-center gap-4 rounded border border-white/10 bg-panelLight p-2"
              >
                <span className="w-5 flex-shrink-0 text-center text-xs font-semibold text-slate-500">{i + 1}</span>
                <div className="w-16 flex-shrink-0">
                  <CardImage
                    name={facts?.name ?? scryfallId}
                    imageUrl={facts?.imageNormal}
                    manaCost={facts?.manaCost}
                    typeLine={facts?.typeLine}
                    oracleText={facts?.oracleText}
                    power={facts?.power}
                    toughness={facts?.toughness}
                  />
                </div>
                <p className="flex-1 text-sm font-medium text-white">{facts?.name ?? scryfallId}</p>
                <div className="flex flex-shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => moveUp(i)}
                    disabled={i === 0}
                    title="Move toward the top"
                    className="rounded bg-panel px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    onClick={() => moveDown(i)}
                    disabled={i === order.length - 1}
                    title="Move toward the bottom"
                    className="rounded bg-panel px-2 py-1 text-xs text-white hover:bg-white/10 disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => onConfirm(order)}
          className="mt-4 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/80"
        >
          Confirm order
        </button>
      </div>
    </div>
  );
}
