'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { NavBar } from '@/components/layout/NavBar';

export default function NewDeckPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [format, setFormat] = useState<'COMMANDER' | 'STANDARD_1V1'>('COMMANDER');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, format }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error ?? 'Failed to create deck');
      return;
    }
    router.push(`/decks/${data.deck.id}`);
  }

  return (
    <div>
      <NavBar />
      <main className="mx-auto max-w-md px-6 py-8">
        <h1 className="mb-6 text-2xl font-semibold text-white">New deck</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Deck name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Format</label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as 'COMMANDER' | 'STANDARD_1V1')}
              className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
            >
              <option value="COMMANDER">Commander</option>
              <option value="STANDARD_1V1">1v1</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent/80 disabled:opacity-50"
          >
            {loading ? 'Creating…' : 'Create deck'}
          </button>
        </form>
      </main>
    </div>
  );
}
