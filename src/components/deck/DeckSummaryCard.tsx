'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Deck {
  id: string;
  name: string;
  format: 'COMMANDER' | 'STANDARD_1V1';
  cards: { quantity: number; isCommander: boolean; cardCache: { imageArtCrop: string | null } }[];
}

function cardCount(deck: Deck): number {
  return deck.cards.reduce((sum, c) => sum + c.quantity, 0);
}

export function DeckSummaryCard({ deck }: { deck: Deck }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const commander = deck.cards.find((c) => c.isCommander);

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`Delete "${deck.name}"? This can't be undone.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/decks/${deck.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? 'Failed to delete deck');
      setDeleting(false);
      return;
    }
    router.refresh();
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/10 bg-panel hover:border-accent/50">
      <Link href={`/decks/${deck.id}`} className="block">
        <div className="flex aspect-[16/9] items-center justify-center bg-panelLight">
          {commander?.cardCache.imageArtCrop ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={commander.cardCache.imageArtCrop} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-4xl">🃏</span>
          )}
        </div>
        <div className="p-4">
          <p className="font-medium text-white">{deck.name}</p>
          <p className="text-sm text-slate-400">
            {deck.format === 'COMMANDER' ? 'Commander' : '1v1'} · {cardCount(deck)} cards
          </p>
        </div>
      </Link>
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete deck"
        className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-red-400 opacity-0 hover:bg-black/90 group-hover:opacity-100 disabled:opacity-50"
      >
        {deleting ? '…' : '🗑 Delete'}
      </button>
    </div>
  );
}
