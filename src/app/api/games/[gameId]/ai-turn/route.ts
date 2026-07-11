import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { runAITurnOnce } from '@/server/ai/aiController';

// A full AI turn can involve several sequential LLM round trips (plus a
// fallback provider retry on error) — comfortably longer than a platform's
// default function timeout, so this needs real headroom. Triggered as a
// normal, fully-awaited request from a connected client rather than
// backgrounded off of another request, since backgrounded work is only kept
// alive up to that other request's own (likely much shorter, unset-by-default)
// duration limit.
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

  // The turn may have already moved on by the time this request lands (e.g.
  // a second client's trigger arriving just after the first one finished) —
  // a no-op in that case rather than replaying an already-resolved turn.
  if (game.currentTurnSeat !== seat) return NextResponse.json({ ok: true });

  await runAITurnOnce(params.gameId, seat);
  return NextResponse.json({ ok: true });
}
