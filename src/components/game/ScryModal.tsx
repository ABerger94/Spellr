'use client';

import type { CardFacts, LookDestination } from '@/types/game';
import { CardImage } from '@/components/card/CardImage';

/** 'reorder' has its own dedicated ReorderTopModal — it resolves the whole
 * batch at once rather than one card at a time, so it never reaches here. */
type ScryOrSurveil = 'scry' | 'surveil';

const DESTINATION_OPTIONS: Record<ScryOrSurveil, { label: string; destination: LookDestination }[]> = {
  scry: [
    { label: 'Keep on top', destination: 'top' },
    { label: 'Put on bottom', destination: 'bottom' },
  ],
  surveil: [
    { label: 'Keep on top', destination: 'top' },
    { label: 'Put in graveyard', destination: 'graveyard' },
  ],
};

const MODE_LABEL: Record<ScryOrSurveil, string> = { scry: 'Scry', surveil: 'Surveil' };

export function ScryModal({
  mode,
  cards,
  cardFacts,
  onResolve,
}: {
  mode: ScryOrSurveil;
  cards: string[];
  cardFacts: Record<string, CardFacts>;
  onResolve: (scryfallId: string, destination: LookDestination) => void;
}) {
  const options = DESTINATION_OPTIONS[mode];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-panel p-4">
        <h3 className="mb-1 text-lg font-medium text-white">
          {MODE_LABEL[mode]} {cards.length}
        </h3>
        <p className="mb-4 text-sm text-slate-400">
          {mode === 'scry'
            ? 'For each card: keep it on top of your library, or put it on the bottom.'
            : 'For each card: keep it on top of your library, or put it in your graveyard.'}
        </p>
        <div className="space-y-3">
          {cards.map((scryfallId, i) => {
            const facts = cardFacts[scryfallId];
            return (
              <div
                key={`${scryfallId}-${i}`}
                className="flex items-center gap-4 rounded border border-white/10 bg-panelLight p-2"
              >
                <div className="w-20 flex-shrink-0">
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
                <div className="flex-1">
                  <p className="mb-2 text-sm font-medium text-white">{facts?.name ?? scryfallId}</p>
                  <div className="flex gap-2">
                    {options.map((opt) => (
                      <button
                        key={opt.destination}
                        onClick={() => onResolve(scryfallId, opt.destination)}
                        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent/80"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
