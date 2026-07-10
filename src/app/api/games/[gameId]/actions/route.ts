import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { actionSchema } from '@/server/game/actionTypes';
import { execute } from '@/server/game/actionHandler';
import { buildStateFor } from '@/server/game/stateSerializer';

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const player = await prisma.gamePlayer.findFirst({ where: { gameId: params.gameId, userId: auth.userId } });
  if (!player) return NextResponse.json({ error: 'You are not a player in this game' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = actionSchema.safeParse(body?.action);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  try {
    await execute(params.gameId, { userId: auth.userId, seat: player.seat }, parsed.data);
    // Return the actor's own fresh state directly rather than relying solely
    // on the realtime broadcast reaching this same client — Pusher delivery
    // to *other* players still happens via the broadcast inside execute().
    const state = await buildStateFor(params.gameId, player.seat);
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Action failed' }, { status: 400 });
  }
}
