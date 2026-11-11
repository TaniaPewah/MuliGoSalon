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

// In production the built client is served from the same origin.
const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [path.resolve(here, '../../client/dist'), path.resolve(here, '../../../client/dist')];
const clientDist = candidates.find((p) => existsSync(p));
if (clientDist) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

registerSockets(io);

httpServer.listen(PORT, HOST, () => {
  console.log(`multiGO server listening on http://${HOST}:${PORT}`);
});
