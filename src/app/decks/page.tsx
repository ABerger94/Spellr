import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSession } from '@/server/auth/session';
import { listDecksForUser } from '@/server/deck/deckService';
import { NavBar } from '@/components/layout/NavBar';
import { DeckSummaryCard } from '@/components/deck/DeckSummaryCard';

export default async function DecksPage() {
  const auth = await requireSession();
  if (!auth) redirect('/login');

  const decks = await listDecksForUser(auth.userId);

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-white">Your decks</h1>
          <Link href="/decks/new" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80">
            + New deck
          </Link>
        </div>

        {decks.length === 0 ? (
          <p className="text-slate-400">You haven&apos;t built any decks yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {decks.map((deck) => (
              <DeckSummaryCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
