import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { runAIBlockCheckOnce } from '@/server/ai/aiController';

// Same reasoning as ai-turn/route.ts's maxDuration: an LLM round trip (plus
// a fallback provider retry) needs real headroom, and this must be a real,
// fully-awaited request from a connected client rather than backgrounded
// off of the attacker's own action request.
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: { gameId: string } }) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const requester = await prisma.gamePlayer.findFirst({ where: { gameId: params.gameId, userId: auth.userId } });
  if (!requester) return NextResponse.json({ error: 'You are not a player in this game' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const seat = Number(body?.seat);
  if (!Number.isInteger(seat)) return NextResponse.json({ error: 'Invalid seat' }, { status: 400 });

  const game = await prisma.game.findUnique({ where: { id: params.gameId } });
  if (!game || game.status !== 'ACTIVE') return NextResponse.json({ ok: true }); // nothing to do

  const target = await prisma.gamePlayer.findFirst({ where: { gameId: params.gameId, seat } });
  if (!target?.isAI) return NextResponse.json({ error: 'That seat is not an AI seat' }, { status: 400 });

  // Unlike ai-turn, this is intentionally NOT gated on currentTurnSeat — a
  // block reaction is expected to fire during another player's turn.
  await runAIBlockCheckOnce(params.gameId, seat);
  return NextResponse.json({ ok: true });
}
