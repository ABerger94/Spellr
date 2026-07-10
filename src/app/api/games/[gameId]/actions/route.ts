import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { actionSchema } from '@/server/game/actionTypes';
import { execute } from '@/server/game/actionHandler';

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
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Action failed' }, { status: 400 });
  }
}
