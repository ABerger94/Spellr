'use client';

import { useState } from 'react';

interface ExportCard {
  quantity: number;
  isCommander: boolean;
  cardCache: { name: string };
}

/** Plain `<qty> <name>` lines with `//` comment headers — the same format
 * DecklistPasteBox accepts, so an exported list round-trips straight back
 * through import (comment lines and blank lines are already skipped there). */
export function buildDecklistText(cards: ExportCard[], deckName: string): string {
  const commanders = cards.filter((c) => c.isCommander);
  const rest = cards.filter((c) => !c.isCommander);
  const lines: string[] = [`// ${deckName}`];

  if (commanders.length > 0) {
    lines.push('', '// Commander');
    for (const c of commanders) lines.push(`${c.quantity} ${c.cardCache.name}`);
  }

  lines.push('', '// Deck');
  for (const c of rest) lines.push(`${c.quantity} ${c.cardCache.name}`);

  return lines.join('\n');
}

export function DeckExportBox({ deckName, cards }: { deckName: string; cards: ExportCard[] }) {
  const [copied, setCopied] = useState(false);
  const text = buildDecklistText(cards, deckName);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload() {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${deckName.trim().replace(/[^\w\- ]+/g, '') || 'decklist'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (cards.length === 0) {
    return <p className="text-sm text-slate-500">Add some cards to export a decklist.</p>;
  }

  return (
    <div>
      <textarea
        value={text}
        readOnly
        rows={6}
        className="w-full rounded border border-white/10 bg-panelLight px-3 py-2 font-mono text-sm text-white outline-none"
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={handleCopy}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/80"
        >
          {copied ? 'Copied!' : 'Copy to clipboard'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="rounded bg-panelLight px-4 py-2 text-sm font-medium text-white hover:bg-white/10"
        >
          Download .txt
        </button>
      </div>
    </div>
  );
}
