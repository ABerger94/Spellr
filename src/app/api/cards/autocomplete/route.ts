import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { autocomplete } from '@/server/scryfall/cardService';

export async function GET(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') ?? '';

  try {
    const names = await autocomplete(q);
    return NextResponse.json({ names });
  } catch (err) {
    console.error('[cards/autocomplete]', err);
    return NextResponse.json({ names: [] });
  }
}
