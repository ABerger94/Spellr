import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { getCardById } from '@/server/scryfall/cardService';
import { ScryfallError } from '@/server/scryfall/client';

export async function GET(_req: Request, { params }: { params: { scryfallId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const card = await getCardById(params.scryfallId);
    return NextResponse.json(card);
  } catch (err) {
    if (err instanceof ScryfallError && err.status === 404) {
      return NextResponse.json({ error: 'Card not found' }, { status: 404 });
    }
    console.error('[cards/:id]', err);
    return NextResponse.json({ error: 'Failed to load card' }, { status: 502 });
  }
}
