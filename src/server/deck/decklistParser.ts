export interface DecklistLine {
  quantity: number;
  cardName: string;
}

const LINE_RE = /^(\d+)\s*x?\s+(.+)$/i;

export function parseDecklist(text: string): DecklistLine[] {
  const lines: DecklistLine[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#')) continue;

    const match = line.match(LINE_RE);
    if (!match) continue;

    const quantity = parseInt(match[1], 10);
    // Strip common set/collector-number suffixes like "(NEO) 123" if present.
    const cardName = match[2].replace(/\s*\([A-Za-z0-9]{2,6}\)\s*\d*\s*$/, '').trim();
    if (!cardName) continue;

    lines.push({ quantity, cardName });
  }

  return lines;
}
