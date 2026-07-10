import { enqueueScryfallCall } from './queue';

const BASE_URL = 'https://api.scryfall.com';
const HEADERS = {
  'User-Agent': 'Spellr/0.1 (https://github.com/aberger94/spellr)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};

export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
  art_crop?: string;
  border_crop?: string;
}

export interface ScryfallCardFace {
  name?: string;
  image_uris?: ScryfallImageUris;
  oracle_text?: string;
  type_line?: string;
  mana_cost?: string;
  power?: string;
  toughness?: string;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  color_identity?: string[];
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  scryfall_uri?: string;
  set?: string;
  collector_number?: string;
  [key: string]: unknown;
}

interface ScryfallSearchResponse {
  object: 'list' | 'error';
  total_cards?: number;
  has_more?: boolean;
  next_page?: string;
  data?: ScryfallCard[];
  details?: string;
}

async function scryfallFetch<T>(path: string): Promise<T> {
  return enqueueScryfallCall(async () => {
    const res = await fetch(`${BASE_URL}${path}`, { headers: HEADERS });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ScryfallError(
        (body as { details?: string }).details ?? `Scryfall request failed (${res.status})`,
        res.status,
      );
    }
    return res.json() as Promise<T>;
  });
}

export class ScryfallError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScryfallError';
    this.status = status;
  }
}

export async function searchCards(query: string, page = 1): Promise<{ cards: ScryfallCard[]; hasMore: boolean; totalCards: number }> {
  const params = new URLSearchParams({ q: query, page: String(page) });
  try {
    const data = await scryfallFetch<ScryfallSearchResponse>(`/cards/search?${params.toString()}`);
    return { cards: data.data ?? [], hasMore: !!data.has_more, totalCards: data.total_cards ?? 0 };
  } catch (err) {
    if (err instanceof ScryfallError && err.status === 404) {
      return { cards: [], hasMore: false, totalCards: 0 };
    }
    throw err;
  }
}

export async function getCardById(scryfallId: string): Promise<ScryfallCard> {
  return scryfallFetch<ScryfallCard>(`/cards/${encodeURIComponent(scryfallId)}`);
}

export async function getCardByExactName(name: string): Promise<ScryfallCard | null> {
  const params = new URLSearchParams({ exact: name });
  try {
    return await scryfallFetch<ScryfallCard>(`/cards/named?${params.toString()}`);
  } catch (err) {
    if (err instanceof ScryfallError && err.status === 404) return null;
    throw err;
  }
}

export async function autocomplete(query: string): Promise<string[]> {
  const params = new URLSearchParams({ q: query });
  const data = await scryfallFetch<{ data: string[] }>(`/cards/autocomplete?${params.toString()}`);
  return data.data ?? [];
}
