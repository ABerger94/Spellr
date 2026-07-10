import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { searchCards } from '@/server/scryfall/cardService';
import { ScryfallError } from '@/server/scryfall/client';

export async function GET(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  const page = Number(searchParams.get('page') ?? '1') || 1;

  if (!q || !q.trim()) {
    return NextResponse.json({ cards: [], hasMore: false, totalCards: 0 });
  }

  try {
    const result = await searchCards(q, page);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ScryfallError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 404 ? 200 : 502 });
    }
    console.error('[cards/search]', err);
    return NextResponse.json({ error: 'Card search failed' }, { status: 502 });
  }
}
