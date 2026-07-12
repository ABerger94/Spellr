export interface ExternalDeckCard {
  name: string;
  quantity: number;
  isCommander: boolean;
}

export interface ExternalDeckResult {
  cards: ExternalDeckCard[];
  siteName: string;
}

// A generic fetch (no browser fingerprint, no cookies) reads as automated
// traffic to sites with bot protection — a realistic UA/Accept pair is the
// best a server-side request can do, and isn't guaranteed to get through.
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

async function fetchJson(url: string, siteName: string): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(url, { headers: BROWSER_HEADERS });
  } catch {
    throw new Error(`Couldn't reach ${siteName} — try again, or paste the decklist as text instead.`);
  }
  if (!res.ok) {
    throw new Error(`${siteName} rejected the request (${res.status}) — the deck may be private, or ${siteName} may be blocking automated access. Try pasting the decklist as text instead.`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('json')) {
    // A bot-protection challenge page (Cloudflare, etc.) typically comes
    // back as HTML with a 200 — treat that the same as an outright failure.
    throw new Error(`${siteName} didn't return deck data (it may be blocking automated requests) — try pasting the decklist as text instead.`);
  }
  return res.json();
}

function getPath(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function firstString(obj: unknown, paths: string[][]): string | undefined {
  for (const path of paths) {
    const val = getPath(obj, path);
    if (typeof val === 'string' && val) return val;
  }
  return undefined;
}

function extractDeckId(url: URL, pattern: RegExp): string | null {
  const match = url.pathname.match(pattern);
  return match ? match[1] : null;
}

async function fetchMoxfieldDeck(deckId: string): Promise<ExternalDeckResult> {
  const data = await fetchJson(`https://api2.moxfield.com/v2/decks/all/${encodeURIComponent(deckId)}`, 'Moxfield');
  const cards: ExternalDeckCard[] = [];

  function collect(sectionKey: string, isCommander: boolean) {
    const section = getPath(data, [sectionKey]);
    if (!section || typeof section !== 'object') return;
    for (const entry of Object.values(section as Record<string, unknown>)) {
      const name = firstString(entry, [['card', 'name'], ['name']]);
      const quantity = getPath(entry, ['quantity']);
      if (name && typeof quantity === 'number' && quantity > 0) {
        cards.push({ name, quantity, isCommander });
      }
    }
  }

  collect('mainboard', false);
  collect('commanders', true);

  if (cards.length === 0) {
    throw new Error("Couldn't find any cards in that Moxfield deck — it may be private, or Moxfield changed their data format. Try pasting the decklist as text instead.");
  }
  return { cards, siteName: 'Moxfield' };
}

async function fetchArchidektDeck(deckId: string): Promise<ExternalDeckResult> {
  const data = await fetchJson(`https://archidekt.com/api/decks/${encodeURIComponent(deckId)}/`, 'Archidekt');
  const rawCards = getPath(data, ['cards']);
  if (!Array.isArray(rawCards) || rawCards.length === 0) {
    throw new Error("Couldn't find any cards in that Archidekt deck — it may be private, or Archidekt changed their data format. Try pasting the decklist as text instead.");
  }

  const cards: ExternalDeckCard[] = [];
  for (const entry of rawCards) {
    const name = firstString(entry, [
      ['card', 'oracleCard', 'name'],
      ['card', 'name'],
      ['oracleCard', 'name'],
    ]);
    const quantity = getPath(entry, ['quantity']);
    const categories = getPath(entry, ['categories']);
    const isCommander = Array.isArray(categories) && categories.some((c) => typeof c === 'string' && c.toLowerCase() === 'commander');
    if (name && typeof quantity === 'number' && quantity > 0) {
      cards.push({ name, quantity, isCommander });
    }
  }

  if (cards.length === 0) {
    throw new Error("Couldn't find any cards in that Archidekt deck — it may be private, or Archidekt changed their data format. Try pasting the decklist as text instead.");
  }
  return { cards, siteName: 'Archidekt' };
}

/** Fetches and parses a decklist from a Moxfield or Archidekt deck URL.
 * Both sites' APIs are undocumented/unofficial and may block server-side
 * requests outright (bot protection) — every failure path here throws a
 * clear, actionable Error rather than a cryptic one. */
export async function importFromExternalUrl(rawUrl: string): Promise<ExternalDeckResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That doesn\'t look like a valid URL.');
  }

  const host = url.hostname.replace(/^www\./, '');

  if (host === 'moxfield.com') {
    const deckId = extractDeckId(url, /\/decks\/([A-Za-z0-9_-]+)/);
    if (!deckId) throw new Error("Couldn't find a deck ID in that Moxfield URL — expected something like moxfield.com/decks/xxxxxxxx.");
    return fetchMoxfieldDeck(deckId);
  }

  if (host === 'archidekt.com') {
    const deckId = extractDeckId(url, /\/decks\/(\d+)/);
    if (!deckId) throw new Error("Couldn't find a deck ID in that Archidekt URL — expected something like archidekt.com/decks/123456.");
    return fetchArchidektDeck(deckId);
  }

  throw new Error('Only Moxfield and Archidekt deck URLs are supported right now — paste the decklist as text instead.');
}
