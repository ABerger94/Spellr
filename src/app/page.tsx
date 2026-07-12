import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/server/auth/authOptions';

const FEATURES = [
  {
    title: 'Real card art, real tabletop',
    body: "Every card is rendered with real Scryfall art on a full battlefield, hand, library, graveyard, exile, and command zone — no physical cards, no webcam, just the game.",
  },
  {
    title: 'Build a deck in minutes',
    body: 'Paste a decklist or import straight from a Moxfield or Archidekt URL, then check mana curve, color balance, and consistency stats before you sit down.',
  },
  {
    title: 'Play with friends or strangers',
    body: 'Create a private table or drop into a bracket-tagged open Commander pod. Short a player? Fill the seat with an AI opponent that plays its own deck.',
  },
  {
    title: 'Everything in one tab',
    body: 'Commander damage, tokens, counters, a mana pool, and built-in voice chat — the whole game happens live, with nothing extra to install.',
  },
];

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect('/lobby');

  return (
    <main className="min-h-screen bg-ink">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <span className="text-lg font-semibold tracking-tight text-white">
          Mana<span className="text-accent">Verse</span>
        </span>
        <Link href="/login" className="text-sm text-slate-300 hover:text-white">
          Sign in
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-12 text-center sm:pt-20">
        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-5xl">
          Play Magic: The Gathering online, free
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-slate-400 sm:text-lg">
          No physical cards, no webcam — just a real virtual tabletop with real card art, live multiplayer, and an AI
          opponent when you're short a player. Build a deck, pull up a seat, and start slinging spells.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/login"
            className="rounded bg-accent px-6 py-3 font-medium text-white shadow-lg shadow-accent/20 hover:bg-accent/80"
          >
            Sign in / Sign up
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg border border-white/10 bg-panel p-5">
              <h2 className="mb-1.5 text-base font-semibold text-white">{f.title}</h2>
              <p className="text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
