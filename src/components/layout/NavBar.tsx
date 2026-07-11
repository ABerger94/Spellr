'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';

export function NavBar() {
  const { data: session } = useSession();

  return (
    <nav className="flex items-center justify-between border-b border-white/10 bg-panel px-6 py-3">
      <Link href="/lobby" className="text-lg font-semibold tracking-tight text-white">
        Mana<span className="text-accent">Verse</span>
      </Link>
      <div className="flex items-center gap-4 text-sm">
        <Link href="/decks" className="text-slate-300 hover:text-white">
          Decks
        </Link>
        <Link href="/lobby" className="text-slate-300 hover:text-white">
          Lobby
        </Link>
        {session?.user ? (
          <div className="flex items-center gap-3">
            <span className="text-slate-400">{session.user.name}</span>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="rounded bg-panelLight px-3 py-1.5 text-slate-200 hover:bg-white/10"
            >
              Sign out
            </button>
          </div>
        ) : (
          <Link href="/login" className="rounded bg-accent px-3 py-1.5 text-white hover:bg-accent/80">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
