'use client';

import { useState } from 'react';

export function DecklistPasteBox({ deckId, onImported }: { deckId: string; onImported: () => void }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ imported: number; warnings: string[] } | null>(null);

  async function handleImport() {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(`/api/decks/${deckId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      setResult(data);
      if (data.imported > 0) {
        setText('');
        onImported();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'1 Sol Ring\n1 Command Tower\n1 Arcane Signet\n...'}
        rows={6}
        className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 font-mono text-sm text-white outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={handleImport}
        disabled={loading || !text.trim()}
        className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80 disabled:opacity-50"
      >
        {loading ? 'Importing…' : 'Import decklist'}
      </button>
      {result && (
        <div className="mt-2 text-sm">
          <p className="text-emerald-400">Imported {result.imported} card(s).</p>
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
