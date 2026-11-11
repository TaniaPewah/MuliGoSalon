import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientToServerEvents, GameError, GameState, SalonState, ServerToClientEvents } from '@multigo/shared';
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

function waitSalon(socket: Client, pred: (state: SalonState) => boolean): Promise<SalonState> {
  return new Promise((resolve) => {
    const onState = (state: SalonState) => {
      if (!pred(state)) return;
      socket.off('salon:state', onState);
      resolve(state);
    };
    socket.on('salon:state', onState);
  });
}

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('table spectating', () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let clients: Client[] = [];

  beforeEach(async () => {
    httpServer = createServer();
    const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);
    registerSockets(io, { reconnectGraceMs: 80 });
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

  async function sitToPlay(a: Client, b: Client) {
    const started = onceEvent(a, 'game:start');
    a.emit('salon:sit', { tableId: 't1', seat: 0 });
    b.emit('salon:sit', { tableId: 't1', seat: 1 });
    return started;
  }

  it('starts spectating when an idle player walks up to a live table', async () => {
    const a = connectClient();
    const b = connectClient();
    const c = connectClient();
    await join(a, 'Alice', A);
    await join(b, 'Bob', B);
    await join(c, 'Cara', C);
    const game = await sitToPlay(a, b);

    const watched = onceEvent(c, 'game:start');
    const salon = waitSalon(c, (s) => s.players.find((p) => p.id === C)?.status === 'spectating');
    c.emit('salon:move', { x: 230, y: 170 });
    const [state, salonState] = await Promise.all([watched, salon]);
    expect(state.id).toBe(game.id);
    expect(state.moveNumber).toBe(game.moveNumber);
    expect(salonState.tables.find((t) => t.id === 't1')?.gameId).toBe(game.id);
  });

  it('rejects a spectator place and does not change the board', async () => {
    const a = connectClient();
    const b = connectClient();
    const c = connectClient();
    await join(a, 'Alice', A);
    await join(b, 'Bob', B);
    await join(c, 'Cara', C);
    const game = await sitToPlay(a, b);
    const watched = onceEvent(c, 'game:start');
    c.emit('salon:move', { x: 230, y: 170 });
    await watched;

    const err = onceEvent(c, 'game:error');
    c.emit('game:place', { gameId: game.id, x: 4, y: 4 });
    const error = (await err) as GameError;
    expect(error.code).toBe('not-in-game');

    // A real player can still move; spectators did not mutate the game.
    const mover = game.players[game.turn].id === A ? a : b;
    const next = onceEvent(mover, 'game:state');
    mover.emit('game:place', { gameId: game.id, x: 4, y: 4 });
    const after = (await next) as GameState;
    expect(after.moveNumber).toBe(game.moveNumber + 1);
  });

  it('unwatch returns the spectator to the salon outside the table radius', async () => {
    const a = connectClient();
    const b = connectClient();
    const c = connectClient();
    await join(a, 'Alice', A);
    await join(b, 'Bob', B);
    await join(c, 'Cara', C);
    const game = await sitToPlay(a, b);
    const watched = onceEvent(c, 'game:start');
    c.emit('salon:move', { x: 230, y: 170 });
    await watched;

    const salon = waitSalon(c, (s) => s.players.find((p) => p.id === C)?.status === 'idle');
    c.emit('game:unwatch', { gameId: game.id });
    const salonState = await salon;
    const cara = salonState.players.find((p) => p.id === C);
    expect(cara?.status).toBe('idle');
    expect(Math.hypot(cara!.x - 230, cara!.y - 170)).toBeGreaterThan(100);
  });

  it('resumes spectating after a reload within the grace window', async () => {
    const a = connectClient();
    const b = connectClient();
    const c = connectClient();
    await join(a, 'Alice', A);
    await join(b, 'Bob', B);
    await join(c, 'Cara', C);
    const game = await sitToPlay(a, b);
    const watched = onceEvent(c, 'game:start');
    c.emit('salon:move', { x: 230, y: 170 });
    await watched;

    c.close();
    clients = clients.filter((x) => x !== c);
    await delay(20);

    const c2 = connectClient();
    const stateP = onceEvent(c2, 'game:state');
    const readyP = join(c2, 'Cara', C);
    const [state, session] = await Promise.all([stateP, readyP]);
    expect(session.resume).toBe('spectate');
    expect((state as GameState).id).toBe(game.id);
  });
});
