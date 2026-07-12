import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { getDeckForUser, importDecklist, importDecklistFromUrl } from '@/server/deck/deckService';

const importSchema = z.union([z.object({ text: z.string().min(1) }), z.object({ url: z.string().url() })]);

export async function POST(req: Request, { params }: { params: { deckId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await getDeckForUser(params.deckId, auth.userId);
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Provide either a decklist text or a deck URL' }, { status: 400 });
  }

  const result =
    'url' in parsed.data
      ? await importDecklistFromUrl(params.deckId, parsed.data.url)
      : await importDecklist(params.deckId, parsed.data.text);
  return NextResponse.json(result);
}
