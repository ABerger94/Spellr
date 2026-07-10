import { createServer } from 'http';
import next from 'next';
import { Server } from 'socket.io';
import { getToken } from 'next-auth/jwt';
import { setIO } from '@/server/socket/io';
import { registerGameHandlers } from '@/server/socket/handlers/gameHandlers';

const dev = process.env.NODE_ENV !== 'production';
const port = Number(process.env.PORT) || 3000;

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      // next-auth's getToken() reads from req.cookies (a pre-parsed object), which
      // a raw http.IncomingMessage doesn't have — parse the Cookie header ourselves.
      const cookieHeader = socket.request.headers.cookie ?? '';
      const cookies: Record<string, string> = {};
      for (const pair of cookieHeader.split(';')) {
        const idx = pair.indexOf('=');
        if (idx === -1) continue;
        const name = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim();
        if (name) cookies[name] = decodeURIComponent(value);
      }

      const token = await getToken({
        req: { headers: socket.request.headers, cookies } as never,
        secret: process.env.NEXTAUTH_SECRET,
      });
      if (!token?.sub) {
        return next(new Error('unauthorized'));
      }
      socket.data.userId = token.sub;
      next();
    } catch (err) {
      console.error('[socket auth] error verifying token', err);
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    registerGameHandlers(io, socket);
  });

  setIO(io);

  httpServer.listen(port, () => {
    console.log(`> Spellr ready on http://localhost:${port}`);
  });
});
