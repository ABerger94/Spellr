'use client';

import { useEffect, useRef, useState } from 'react';
import { CardImage } from '@/components/card/CardImage';

interface SearchResult {
  scryfallId: string;
  name: string;
  manaCost: string | null;
  typeLine: string | null;
  imageNormal: string | null;
  oracleText: string | null;
  power: string | null;
  toughness: string | null;
}

export function CardSearchAutocomplete({
  onAdd,
  tokensOnly,
  placeholder,
}: {
  onAdd: (scryfallId: string, name: string) => void;
  /** Restricts results to token cards (Treasure, Clue, 1/1 Soldier, ...),
   * filtered server-side on the actual type line Scryfall returns — not
   * just a query-string hint — so a real card can never show up here. */
  tokensOnly?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const requestIdRef = useRef(0);

  useEffect(() => {
    // Scryfall's autocomplete endpoint matches card names generally and
    // can't be scoped to tokens — suggesting non-token names here would
    // just lead to a dead-end "no tokens found" click, so skip it entirely
    // in tokensOnly mode and let Search do the (correctly filtered) work.
    if (!query.trim() || tokensOnly) {
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
  }, [query, tokensOnly]);

  async function runSearch(q: string) {
    setLoading(true);
    setError(null);
    setSuggestions([]);
    try {
      const params = new URLSearchParams({ q });
      if (tokensOnly) params.set('tokens', '1');
      const res = await fetch(`/api/cards/search?${params.toString()}`);
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
          placeholder={placeholder ?? 'Search for a card…'}
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
            <div key={card.scryfallId} className="group relative overflow-hidden rounded-md border border-white/10">
              <CardImage
                name={card.name}
                imageUrl={card.imageNormal}
                manaCost={card.manaCost}
                typeLine={card.typeLine}
                oracleText={card.oracleText}
                power={card.power}
                toughness={card.toughness}
                title={`Add ${card.name}`}
                onClick={() => onAdd(card.scryfallId, card.name)}
              />
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white">+ Add</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
