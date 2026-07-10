import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireSession } from '@/server/auth/session';
import { listDecksForUser } from '@/server/deck/deckService';
import { NavBar } from '@/components/layout/NavBar';

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
            {decks.map((deck) => {
              const commander = deck.cards.find((c) => c.isCommander);
              const cardCount = deck.cards.reduce((sum, c) => sum + c.quantity, 0);
              return (
                <Link
                  key={deck.id}
                  href={`/decks/${deck.id}`}
                  className="block overflow-hidden rounded-lg border border-white/10 bg-panel hover:border-accent/50"
                >
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
                      {deck.format === 'COMMANDER' ? 'Commander' : '1v1'} · {cardCount} cards
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
