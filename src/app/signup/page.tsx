'use client';

import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { HeroBackground } from '@/components/layout/HeroBackground';

export default function SignupPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Something went wrong');
      setLoading(false);
      return;
    }

    const signInRes = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (signInRes?.error) {
      setError('Account created — please sign in.');
      router.push('/login');
      return;
    }
    router.push('/lobby');
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-ink px-4">
      <HeroBackground />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-white/10 bg-panel p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-semibold text-white">
          Mana<span className="text-accent">Verse</span>
        </h1>
        <p className="mb-6 text-sm text-slate-400">Create an account.</p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Display name</label>
            <input
              required
              minLength={2}
              maxLength={40}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="mt-4 text-sm text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-accent2 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
