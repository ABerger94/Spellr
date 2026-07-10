'use client';

import { useEffect, useRef, useState } from 'react';

interface SearchResult {
  scryfallId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  imageNormal: string | null;
}

export function CardSearchAutocomplete({ onAdd }: { onAdd: (scryfallId: string, name: string) => void }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    clearTimeout(debounceRef.current);
    const requestId = ++requestIdRef.current;
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cards/autocomplete?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        // Ignore this response if a newer query has since been typed.
        if (requestId !== requestIdRef.current) return;
        setSuggestions(data.names ?? []);
      } catch {
        if (requestId === requestIdRef.current) setSuggestions([]);
      }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function runSearch(q: string) {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const res = await fetch(`/api/cards/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setResults([]);
      } else {
        setResults(data.cards ?? []);
      }
    } catch {
      setError('Search failed — is the network reachable?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) runSearch(query.trim());
        }}
        className="flex gap-2"
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for a card…"
          className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 text-white outline-none focus:border-accent"
        />
        <button type="submit" className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80">
          Search
        </button>
      </form>

      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded border border-white/10 bg-panel shadow-xl">
          {suggestions.map((name) => (
            <li key={name}>
              <button
                type="button"
                onClick={() => {
                  setQuery(name);
                  runSearch(name);
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-panelLight"
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {loading && <p className="mt-2 text-sm text-slate-400">Searching…</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}

      {results.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
          {results.map((card) => (
            <button
              key={card.scryfallId}
              type="button"
              onClick={() => onAdd(card.scryfallId, card.name)}
              className="group relative overflow-hidden rounded-md border border-white/10 text-left"
              title={`Add ${card.name}`}
            >
              {card.imageNormal ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={card.imageNormal} alt={card.name} className="w-full" />
              ) : (
                <div className="flex aspect-[5/7] items-center justify-center bg-panelLight p-2 text-center text-xs text-slate-300">
                  {card.name}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white">+ Add</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
