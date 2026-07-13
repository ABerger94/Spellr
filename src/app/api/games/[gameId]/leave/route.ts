import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { leaveLobby } from '@/server/game/gameService';

/** Backs the calling player out of a lobby they've joined, freeing their
 * seat — the host leaving cancels the whole lobby instead (see leaveLobby). */
export async function POST(_req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const result = await leaveLobby(params.gameId, auth.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not leave game' }, { status: 400 });
  }
}
