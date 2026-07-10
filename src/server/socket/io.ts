import type { Server as IOServer } from 'socket.io';

const globalForIO = globalThis as unknown as { io?: IOServer };

export function setIO(io: IOServer) {
  globalForIO.io = io;
}

export function getIO(): IOServer {
  if (!globalForIO.io) {
    throw new Error('Socket.io server has not been initialized yet');
  }
  return globalForIO.io;
}

export function gameRoom(gameId: string) {
  return `game:${gameId}`;
}
