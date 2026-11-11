import type { Server, Socket } from 'socket.io';
import {
  BOARD_SIZES,
  DEFAULT_GAME_SETTINGS,
  STARTING_RATING,
  ratingToRank,
  type ClientToServerEvents,
  type GameSettings,
  type PlayerInfo,
  type ServerToClientEvents,
} from '@multigo/shared';
import { GameManager } from './GameManager.js';
import { Salon, sanitizeCharacter, sanitizeName } from './salon.js';
import { PracticeSession } from './practice/PracticeSession.js';
import { findProblem, problemSummaries } from './practice/problems.js';
import type { GoGame } from './game/GoGame.js';

type IO = Server<ClientToServerEvents, ServerToClientEvents>;
type Sock = Socket<ClientToServerEvents, ServerToClientEvents>;

interface Session {
  player: PlayerInfo;
  practice: PracticeSession | null;
}

const MAX_MAIN_TIME_MS = 2 * 60 * 60 * 1000;
const MAX_INCREMENT_MS = 60 * 1000;

export function registerSockets(io: IO) {
  const sessions = new Map<string, Session>();
  const salon = new Salon();
  const queue: { playerId: string; settings: GameSettings }[] = [];

  const roomOf = (gameId: string) => `game:${gameId}`;

  const broadcastSalon = () => io.emit('salon:state', salon.toState(queue.length));

  const emitQueueStatus = () => {
    for (const entry of queue) {
      io.to(entry.playerId).emit('queue:status', { queued: true, waiting: queue.length });
    }
  };

  const removeFromQueue = (playerId: string) => {
    const idx = queue.findIndex((q) => q.playerId === playerId);
    if (idx >= 0) queue.splice(idx, 1);
    if (salon.get(playerId)?.status === 'queued') salon.setStatus(playerId, 'idle');
  };

  const games = new GameManager({
    onState: (state) => io.to(roomOf(state.id)).emit('game:state', state),
    onFinish: (game, updated) => {
      for (const color of ['black', 'white'] as const) {
        const info = updated[color];
        const session = sessions.get(info.id);
        if (session) {
          session.player = info;
          salon.updateInfo(info);
          salon.setStatus(info.id, 'idle');
          salon.stand(info.id);
          io.to(info.id).emit('session:player', info);
        }
      }
      broadcastSalon();
    },
  });

  const startGame = (aId: string, bId: string, settings: GameSettings) => {
    const a = sessions.get(aId);
    const b = sessions.get(bId);
    if (!a || !b) return;
    const game: GoGame = games.create(a.player, b.player, settings);
    for (const id of [aId, bId]) {
      salon.setStatus(id, 'playing');
      io.sockets.sockets.get(id)?.join(roomOf(game.id));
    }
    io.to(roomOf(game.id)).emit('game:start', game.toState());
    broadcastSalon();
  };

  io.on('connection', (socket: Sock) => {
    const id = socket.id;

    const requireSession = (): Session | null => sessions.get(id) ?? null;

    socket.on('session:join', (payload) => {
      if (sessions.has(id)) return;
      const player: PlayerInfo = {
        id,
        name: sanitizeName(payload?.name),
        character: sanitizeCharacter(payload?.character),
        rating: STARTING_RATING,
        rank: ratingToRank(STARTING_RATING),
      };
      sessions.set(id, { player, practice: null });
      salon.join(player);
      socket.emit('session:ready', { player });
      broadcastSalon();
    });

    socket.on('salon:move', ({ x, y }) => {
      if (!requireSession()) return;
      const p = salon.get(id);
      if (!p || p.status === 'playing') return;
      const wasSeated = !!p.tableId;
      const moved = salon.move(id, Number(x), Number(y));
      if (!moved) return;
      if (wasSeated) broadcastSalon();
      else io.emit('salon:moved', { id, x: moved.x, y: moved.y });
    });

    socket.on('salon:sit', ({ tableId, seat }) => {
      if (!requireSession()) return;
      removeFromQueue(id);
      const result = salon.sit(id, String(tableId), seat);
      if ('error' in result) {
        socket.emit('game:error', { code: 'invalid', message: result.error });
        return;
      }
      broadcastSalon();
      if (result.opponentId) startGame(result.opponentId, id, result.table.settings);
    });

    socket.on('salon:stand', () => {
      if (!requireSession()) return;
      salon.stand(id);
      broadcastSalon();
    });

    socket.on('queue:join', (settings) => {
      if (!requireSession()) return;
      const p = salon.get(id);
      if (!p || p.status === 'playing') return;
      if (queue.some((q) => q.playerId === id)) return;
      salon.stand(id);
      salon.setStatus(id, 'queued');
      queue.push({ playerId: id, settings: sanitizeSettings(settings) });
      if (queue.length >= 2) {
        const first = queue.shift()!;
        const second = queue.shift()!;
        startGame(first.playerId, second.playerId, first.settings);
        io.to(first.playerId).emit('queue:status', { queued: false, waiting: queue.length });
        io.to(second.playerId).emit('queue:status', { queued: false, waiting: queue.length });
      } else {
        broadcastSalon();
      }
      emitQueueStatus();
    });

    socket.on('queue:leave', () => {
      removeFromQueue(id);
      socket.emit('queue:status', { queued: false, waiting: queue.length });
      broadcastSalon();
    });

    socket.on('game:place', ({ gameId, x, y }) => {
      const res = games.place(id, String(gameId), Number(x), Number(y));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:pass', ({ gameId }) => {
      const res = games.pass(id, String(gameId));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:resign', ({ gameId }) => {
      const res = games.resign(id, String(gameId));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:leave', ({ gameId }) => {
      games.leave(id, String(gameId));
      socket.leave(roomOf(String(gameId)));
      salon.setStatus(id, 'idle');
      broadcastSalon();
    });

    socket.on('practice:list', () => {
      socket.emit('practice:list', problemSummaries());
    });

    socket.on('practice:start', ({ problemId }) => {
      const session = requireSession();
      if (!session) return;
      const problem = findProblem(String(problemId));
      if (!problem) {
        socket.emit('practice:error', { code: 'not-found', message: 'Unknown problem.' });
        return;
      }
      session.practice = new PracticeSession(problem);
      salon.setStatus(id, 'practice');
      socket.emit('practice:state', session.practice.toState());
      broadcastSalon();
    });

    socket.on('practice:move', ({ x, y }) => {
      const session = requireSession();
      if (!session?.practice) return;
      const res = session.practice.move(Number(x), Number(y));
      if (!res.ok) socket.emit('practice:error', res.error);
      socket.emit('practice:state', session.practice.toState());
    });

    socket.on('practice:reset', () => {
      const session = requireSession();
      if (!session?.practice) return;
      session.practice.reset();
      socket.emit('practice:state', session.practice.toState());
    });

    socket.on('practice:stop', () => {
      const session = requireSession();
      if (!session) return;
      session.practice = null;
      if (salon.get(id)?.status === 'practice') salon.setStatus(id, 'idle');
      broadcastSalon();
    });

    socket.on('disconnect', () => {
      removeFromQueue(id);
      games.abandon(id);
      salon.leave(id);
      sessions.delete(id);
      broadcastSalon();
      emitQueueStatus();
    });
  });
}

function sanitizeSettings(raw: unknown): GameSettings {
  const s = (raw ?? {}) as Partial<GameSettings>;
  const size = BOARD_SIZES.includes(s.size as (typeof BOARD_SIZES)[number]) ? (s.size as GameSettings['size']) : DEFAULT_GAME_SETTINGS.size;
  const tc = s.timeControl ?? DEFAULT_GAME_SETTINGS.timeControl;
  const mainTimeMs = clampInt(tc.mainTimeMs, 10_000, MAX_MAIN_TIME_MS, DEFAULT_GAME_SETTINGS.timeControl.mainTimeMs);
  const incrementMs = clampInt(tc.incrementMs, 0, MAX_INCREMENT_MS, DEFAULT_GAME_SETTINGS.timeControl.incrementMs);
  return { size, timeControl: { mainTimeMs, incrementMs } };
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}
