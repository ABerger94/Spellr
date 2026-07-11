import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { fillRemainingSeatsWithAI } from '@/server/game/gameService';

export async function POST(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    await fillRemainingSeatsWithAI(params.gameId, auth.userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not fill seats with AI' }, { status: 400 });
  }
}
