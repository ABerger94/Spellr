'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout/NavBar';
import { CardSearchAutocomplete } from '@/components/deck/CardSearchAutocomplete';
import { DecklistPasteBox } from '@/components/deck/DecklistPasteBox';
import { DeckCardGrid } from '@/components/deck/DeckCardGrid';

interface DeckCardEntry {
  scryfallId: string;
  quantity: number;
  isCommander: boolean;
  cardCache: { name: string; imageNormal: string | null; typeLine: string | null };
}

interface DeckData {
  id: string;
  name: string;
  format: 'COMMANDER' | 'STANDARD_1V1';
  cards: DeckCardEntry[];
}

export default function DeckEditorPage() {
  const params = useParams<{ deckId: string }>();
  const router = useRouter();
  const [deck, setDeck] = useState<DeckData | null>(null);
  const [notFound, setNotFound] = useState(false);

  const loadDeck = useCallback(async () => {
    const res = await fetch(`/api/decks/${params.deckId}`);
    if (!res.ok) {
      setNotFound(true);
      return;
    }
    const data = await res.json();
    setDeck(data.deck);
  }, [params.deckId]);

  useEffect(() => {
    loadDeck();
  }, [loadDeck]);

  async function patchDeck(body: Record<string, unknown>) {
    const res = await fetch(`/api/decks/${params.deckId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setDeck(data.deck);
  }

  async function handleDelete() {
    if (!confirm('Delete this deck?')) return;
    await fetch(`/api/decks/${params.deckId}`, { method: 'DELETE' });
    router.push('/decks');
  }

  if (notFound) {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-slate-400">Deck not found.</p>
        </main>
      </div>
    );
  }

  if (!deck) {
    return (
      <div>
        <NavBar />
        <main className="mx-auto max-w-5xl px-6 py-8">
          <p className="text-slate-400">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-white">{deck.name}</h1>
            <p className="text-sm text-slate-400">{deck.format === 'COMMANDER' ? 'Commander' : '1v1'}</p>
          </div>
          <button onClick={handleDelete} className="rounded bg-panelLight px-3 py-1.5 text-sm text-red-400 hover:bg-white/10">
            Delete deck
          </button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px]">
          <div>
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Deck</h2>
            <DeckCardGrid
              cards={deck.cards}
              format={deck.format}
              onRemove={(scryfallId) => patchDeck({ action: 'removeCard', scryfallId })}
              onSetCommander={(scryfallId) => patchDeck({ action: 'setCommander', scryfallId })}
            />
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Add cards</h2>
              <CardSearchAutocomplete
                onAdd={(scryfallId) => patchDeck({ action: 'addCard', scryfallId, quantity: 1 })}
              />
            </div>
            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Paste a decklist</h2>
              <DecklistPasteBox deckId={deck.id} onImported={loadDeck} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
