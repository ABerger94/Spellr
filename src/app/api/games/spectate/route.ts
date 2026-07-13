import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSession } from '@/server/auth/session';
import { spectateGameByInviteCode } from '@/server/game/gameService';

const spectateSchema = z.object({ inviteCode: z.string().min(1) });

/** Starts spectating a game by invite code — the spectate equivalent of
 * POST /api/games/join, for watching a private game you were invited to. */
export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = spectateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }

  try {
    const game = await spectateGameByInviteCode(parsed.data.inviteCode, auth.userId);
    return NextResponse.json({ game });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not spectate game' }, { status: 400 });
  }
}
