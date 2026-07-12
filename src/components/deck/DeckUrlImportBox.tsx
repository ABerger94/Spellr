'use client';

import { useState } from 'react';

export function DeckUrlImportBox({ deckId, onImported }: { deckId: string; onImported: () => void }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; warnings: string[]; commanderName: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!url.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok || typeof data.imported !== 'number') {
        setError(data.error ?? 'Import failed');
        return;
      }
      setResult(data);
      if (data.imported > 0) {
        setUrl('');
        onImported();
      }
    } catch {
      setError('Import failed — check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleImport();
        }}
        placeholder="https://www.moxfield.com/decks/... or https://archidekt.com/decks/..."
        className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-sm text-white outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={handleImport}
        disabled={loading || !url.trim()}
        className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50"
      >
        {loading ? 'Importing…' : 'Import from URL'}
      </button>
      <p className="mt-1 text-xs text-slate-500">
        Supports Moxfield and Archidekt deck links. If a site blocks the request, paste the decklist as text instead.
      </p>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      {result && (
        <div className="mt-2 text-sm">
          {result.imported > 0 ? (
            <p className="text-emerald-400">
              Imported {result.imported} card(s){result.commanderName ? ` — set ${result.commanderName} as commander` : ''}.
            </p>
          ) : (
            <p className="text-amber-400">Nothing was imported.</p>
          )}
          {result.warnings.length > 0 && (
            <ul className="mt-1 list-inside list-disc text-amber-400">
              {result.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
