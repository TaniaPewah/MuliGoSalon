import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '@multigo/shared';
import { registerSockets } from './sockets.js';

const PORT = Number(process.env.PORT ?? 4870);
const HOST = process.env.HOST ?? '127.0.0.1';

const app = express();
const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: true },
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Walk up from this file until we find client/dist. tsc's outDir nesting
// (dist/server/src vs dist) must not break serving the built UI.
function findClientDist(from: string): string | undefined {
  let dir = from;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'client', 'dist');
    if (existsSync(path.join(candidate, 'index.html'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = findClientDist(here);
if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
} else {
  app.get('/', (_req, res) => {
    res
      .status(503)
      .type('text/plain')
      .send(
        'Client UI is not built. Run `npm run build` then restart, or use `npm run dev` and open http://127.0.0.1:4871',
      );
  });
}

registerSockets(io);

httpServer.listen(PORT, HOST, () => {
  console.log(`multiGO server listening on http://${HOST}:${PORT}`);
  if (clientDist) {
    console.log(`serving client from ${clientDist}`);
  } else {
    console.warn('client dist not found; GET / will not serve the UI');
  }
});
