import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { getDeckForUser, importDecklist } from '@/server/deck/deckService';

const importSchema = z.object({ text: z.string().min(1) });

export async function POST(req: Request, { params }: { params: { deckId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deck = await getDeckForUser(params.deckId, auth.userId);
  if (!deck) return NextResponse.json({ error: 'Deck not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Missing decklist text' }, { status: 400 });
  }

  const result = await importDecklist(params.deckId, parsed.data.text);
  return NextResponse.json(result);
}
