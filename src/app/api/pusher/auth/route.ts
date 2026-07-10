import { NextResponse } from 'next/server';
import { requireSession } from '@/server/auth/session';
import { prisma } from '@/lib/prisma';
import { authorizeChannel } from '@/server/realtime/pusherServer';

const PRESENCE_RE = /^presence-game-(.+)$/;
const PRIVATE_SEAT_RE = /^private-game-(.+)-seat-(\d+)$/;

export async function POST(req: Request) {
  const auth = await requireSession();
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.text();
  const params = new URLSearchParams(body);
  const socketId = params.get('socket_id');
  const channelName = params.get('channel_name');
  if (!socketId || !channelName) {
    return NextResponse.json({ error: 'Missing socket_id/channel_name' }, { status: 400 });
  }

  const presenceMatch = channelName.match(PRESENCE_RE);
  if (presenceMatch) {
    const gameId = presenceMatch[1];
    const player = await prisma.gamePlayer.findFirst({ where: { gameId, userId: auth.userId } });
    if (!player) return NextResponse.json({ error: 'Not a player in this game' }, { status: 403 });

    const authResponse = authorizeChannel(socketId, channelName, {
      user_id: auth.userId,
      user_info: { seat: player.seat },
    });
    return NextResponse.json(authResponse);
  }

  const privateMatch = channelName.match(PRIVATE_SEAT_RE);
  if (privateMatch) {
    const [, gameId, seatStr] = privateMatch;
    const seat = Number(seatStr);
    const player = await prisma.gamePlayer.findFirst({ where: { gameId, userId: auth.userId } });
    // The one check that matters here: only ever authorize a user for their
    // OWN seat's private channel. This is what keeps an opponent's hand from
    // being subscribable by anyone but that opponent.
    if (!player || player.seat !== seat) {
      return NextResponse.json({ error: 'Not authorized for this channel' }, { status: 403 });
    }

    const authResponse = authorizeChannel(socketId, channelName);
    return NextResponse.json(authResponse);
  }

  return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
}
