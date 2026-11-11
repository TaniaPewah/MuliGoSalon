import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, GameState, ServerToClientEvents } from '@multigo/shared';
import { registerSockets } from './sockets.js';

type Client = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

function onceEvent<E extends keyof ServerToClientEvents>(
  socket: Client,
  event: E,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve) => {
    socket.once(event, (...args: unknown[]) => resolve(args[0] as Parameters<ServerToClientEvents[E]>[0]));
  });
}

describe('session reconnect', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let clients: Client[] = [];
  const graceMs = 80;

  beforeEach(async () => {
    httpServer = createServer();
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
    registerSockets(io, { reconnectGraceMs: graceMs });
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
    const addr = httpServer.address();
    if (!addr || typeof addr === 'string') throw new Error('no port');
    port = addr.port;
  });

  afterEach(async () => {
    for (const c of clients) c.close();
    clients = [];
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  function connectClient(): Client {
    const c = ioc(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      forceNew: true,
      autoConnect: true,
      reconnection: false,
    }) as Client;
    clients.push(c);
    return c;
  }

  async function join(c: Client, name: string, playerId: string) {
    await new Promise<void>((resolve) => {
      if (c.connected) resolve();
      else c.once('connect', () => resolve());
    });
    const ready = onceEvent(c, 'session:ready');
    c.emit('session:join', { name, character: 'sloth', playerId });
    return ready;
  }

  it('resumes an in-progress game after reconnect within the grace window', async () => {
    const aId = '11111111-1111-4111-8111-111111111111';
    const bId = '22222222-2222-4222-8222-222222222222';
    const a = connectClient();
    const b = connectClient();
    await join(a, 'Alice', aId);
    await join(b, 'Bob', bId);

    const started = onceEvent(a, 'game:start');
    a.emit('salon:sit', { tableId: 't1', seat: 0 });
    b.emit('salon:sit', { tableId: 't1', seat: 1 });
    const game = await started;
    expect(game.phase).toBe('playing');

    a.close();
    clients = clients.filter((c) => c !== a);
    await delay(20);

    const a2 = connectClient();
    const gameState = onceEvent(a2, 'game:state');
    const ready = join(a2, 'Alice', aId);
    const [state, session] = await Promise.all([gameState, ready]);
    expect(session.resume).toBe('game');
    expect(session.player.id).toBe(aId);
    expect((state as GameState).id).toBe(game.id);
    expect((state as GameState).moveNumber).toBe(game.moveNumber);
  });

  it('forfeits the game after the grace window expires', async () => {
    const aId = '33333333-3333-4333-8333-333333333333';
    const bId = '44444444-4444-4444-8444-444444444444';
    const a = connectClient();
    const b = connectClient();
    await join(a, 'Alice', aId);
    await join(b, 'Bob', bId);

    const started = onceEvent(a, 'game:start');
    a.emit('salon:sit', { tableId: 't2', seat: 0 });
    b.emit('salon:sit', { tableId: 't2', seat: 1 });
    await started;

    const finished = onceEvent(b, 'game:state');
    a.close();
    clients = clients.filter((c) => c !== a);

    await delay(graceMs + 40);
    const state = await finished;
    expect(state.phase).toBe('finished');
    expect(state.result?.reason).toBe('abandon');

    const a2 = connectClient();
    const session = await join(a2, 'Alice', aId);
    expect(session.resume).toBe('salon');
    // Rating from the forfeit should survive the session cleanup.
    expect(session.player.rating).not.toBe(1500);
  });

  it('resumes the salon when reconnecting outside a game', async () => {
    const aId = '55555555-5555-4555-8555-555555555555';
    const a = connectClient();
    await join(a, 'Alice', aId);
    a.close();
    clients = clients.filter((c) => c !== a);
    await delay(20);

    const a2 = connectClient();
    const salon = onceEvent(a2, 'salon:state');
    const ready = join(a2, 'Alice', aId);
    const [salonState, session] = await Promise.all([salon, ready]);
    expect(session.resume).toBe('salon');
    expect(salonState.players.some((p) => p.id === aId)).toBe(true);
  });
});
