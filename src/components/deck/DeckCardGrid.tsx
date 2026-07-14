'use client';

import { CardImage } from '@/components/card/CardImage';

interface DeckCardEntry {
  scryfallId: string;
  quantity: number;
  isCommander: boolean;
  cardCache: {
    name: string;
    imageNormal: string | null;
    typeLine: string | null;
    manaCost?: string | null;
    oracleText?: string | null;
    power?: string | null;
    toughness?: string | null;
  };
}

export function DeckCardGrid({
  cards,
  format,
  onRemove,
  onSetCommander,
}: {
  cards: DeckCardEntry[];
  format: 'COMMANDER' | 'STANDARD_1V1';
  onRemove: (scryfallId: string) => void;
  onSetCommander: (scryfallId: string) => void;
}) {
  const commander = cards.find((c) => c.isCommander);
  const rest = cards.filter((c) => !c.isCommander).sort((a, b) => a.cardCache.name.localeCompare(b.cardCache.name));
  const totalCount = cards.reduce((sum, c) => sum + c.quantity, 0);

  return (
    <div>
      <p className="mb-3 text-sm text-slate-400">{totalCount} card(s)</p>

      {format === 'COMMANDER' && commander && (
        <div className="mb-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent2">Commander</p>
          <div className="w-32">
            <CardImage
              name={commander.cardCache.name}
              imageUrl={commander.cardCache.imageNormal}
              typeLine={commander.cardCache.typeLine}
              manaCost={commander.cardCache.manaCost}
              oracleText={commander.cardCache.oracleText}
              power={commander.cardCache.power}
              toughness={commander.cardCache.toughness}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {rest.map((c) => (
          <div key={c.scryfallId} className="group relative">
            <CardImage
              name={c.cardCache.name}
              imageUrl={c.cardCache.imageNormal}
              typeLine={c.cardCache.typeLine}
              manaCost={c.cardCache.manaCost}
              oracleText={c.cardCache.oracleText}
              power={c.cardCache.power}
              toughness={c.cardCache.toughness}
            />
            {c.quantity > 1 && (
              <span className="absolute right-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-xs font-semibold text-white">
                ×{c.quantity}
              </span>
            )}
            <div className="mt-1 flex gap-1 opacity-0 group-hover:opacity-100">
              {format === 'COMMANDER' && (
                <button
                  onClick={() => onSetCommander(c.scryfallId)}
                  className="flex-1 rounded bg-panelLight px-1 py-0.5 text-[10px] text-slate-300 hover:bg-white/10"
                >
                  Set commander
                </button>
              )}
              <button
                onClick={() => onRemove(c.scryfallId)}
                className="flex-1 rounded bg-panelLight px-1 py-0.5 text-[10px] text-red-400 hover:bg-white/10"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {cards.length === 0 && <p className="text-sm text-slate-500">No cards yet — search or paste a decklist below.</p>}
    </div>
  );
}
