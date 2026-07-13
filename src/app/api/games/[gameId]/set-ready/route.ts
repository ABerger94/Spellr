import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { setPlayerReady } from '@/server/game/gameService';

const setReadySchema = z.object({ ready: z.boolean() });

/** Marks (or unmarks) the calling player ready in the lobby waiting room —
 * the host can't start until every human seat is ready with a deck picked. */
export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = setReadySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    await setPlayerReady(params.gameId, auth.userId, parsed.data.ready);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not update ready status' }, { status: 400 });
  }
}
