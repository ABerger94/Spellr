import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/server/game/gameEvents';
import { touchGameActivity } from '@/server/game/gameService';

const chatSchema = z.object({ text: z.string().trim().min(1).max(500) });

/** Chat for spectators, who have no seat and so can't go through the normal
 * actions route (it requires a GamePlayer row). Logged with a null
 * actorSeat and the sender's display name embedded in the payload, since
 * the client has no other way to label a message from someone who isn't in
 * state.players. */
export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const spectator = await prisma.gameSpectator.findUnique({
    where: { gameId_userId: { gameId: params.gameId, userId: auth.userId } },
  });
  if (!spectator) return NextResponse.json({ error: 'You are not spectating this game' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid message' }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { displayName: true } });
  const event = await logEvent(
    params.gameId,
    'CHAT_MESSAGE',
    { text: parsed.data.text, spectatorName: user?.displayName ?? 'Spectator' },
    { userId: auth.userId, seat: null },
  );
  await touchGameActivity(params.gameId);

  return NextResponse.json({ ok: true, event });
}
