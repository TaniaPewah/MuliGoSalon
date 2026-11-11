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
  type SessionResume,
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
  /** Socket currently owning this session (null while disconnected within the grace window). */
  socketId: string | null;
  graceTimer: NodeJS.Timeout | null;
}

const MAX_MAIN_TIME_MS = 2 * 60 * 60 * 1000;
const MAX_INCREMENT_MS = 60 * 1000;
export const RECONNECT_GRACE_MS = 30_000;

export function registerSockets(io: IO, opts?: { reconnectGraceMs?: number }) {
  const reconnectGraceMs = opts?.reconnectGraceMs ?? RECONNECT_GRACE_MS;
  const sessions = new Map<string, Session>();
  const socketToPlayer = new Map<string, string>();
  /** Survives grace-window cleanup so a later rejoin keeps the last rating. */
  const profiles = new Map<string, PlayerInfo>();
  const salon = new Salon();
  const queue: { playerId: string; settings: GameSettings }[] = [];

  const roomOf = (gameId: string) => `game:${gameId}`;

  const broadcastSalon = () => io.emit('salon:state', salon.toState(queue.length));

  const socketOf = (playerId: string): Sock | undefined => {
    const session = sessions.get(playerId);
    if (!session?.socketId) return undefined;
    return io.sockets.sockets.get(session.socketId) as Sock | undefined;
  };

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
          profiles.set(info.id, info);
          salon.updateInfo(info);
          salon.setStatus(info.id, 'idle');
          salon.stand(info.id);
          io.to(info.id).emit('session:player', info);
        }
      }
      broadcastSalon();
    },
  });

  const finalizeDisconnect = (playerId: string) => {
    const session = sessions.get(playerId);
    if (!session) return;
    if (session.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = null;
    }
    removeFromQueue(playerId);
    games.abandon(playerId);
    salon.leave(playerId);
    if (session.socketId) socketToPlayer.delete(session.socketId);
    sessions.delete(playerId);
    broadcastSalon();
    emitQueueStatus();
  };

  const startGame = (aId: string, bId: string, settings: GameSettings) => {
    const a = sessions.get(aId);
    const b = sessions.get(bId);
    if (!a || !b) return;
    const game: GoGame = games.create(a.player, b.player, settings);
    for (const id of [aId, bId]) {
      salon.setStatus(id, 'playing');
      socketOf(id)?.join(roomOf(game.id));
    }
    io.to(roomOf(game.id)).emit('game:start', game.toState());
    broadcastSalon();
  };

  const attachSocket = (socket: Sock, playerId: string, session: Session) => {
    if (session.graceTimer) {
      clearTimeout(session.graceTimer);
      session.graceTimer = null;
    }
    if (session.socketId && session.socketId !== socket.id) {
      socketToPlayer.delete(session.socketId);
    }
    session.socketId = socket.id;
    socketToPlayer.set(socket.id, playerId);
    void socket.join(playerId);
  };

  const resumeFor = (socket: Sock, playerId: string, session: Session): SessionResume => {
    socket.emit('salon:state', salon.toState(queue.length));
    if (queue.some((q) => q.playerId === playerId)) {
      socket.emit('queue:status', { queued: true, waiting: queue.length });
    }

    const game = games.gameOf(playerId);
    if (game) {
      void socket.join(roomOf(game.id));
      socket.emit('game:state', game.toState());
      return 'game';
    }

    if (session.practice) {
      socket.emit('practice:state', session.practice.toState());
      return 'practice';
    }

    return 'salon';
  };

  io.on('connection', (socket: Sock) => {
    const requireSession = (): Session | null => {
      const playerId = socketToPlayer.get(socket.id);
      if (!playerId) return null;
      return sessions.get(playerId) ?? null;
    };

    const requirePlayerId = (): string | null => socketToPlayer.get(socket.id) ?? null;

    socket.on('session:join', (payload) => {
      const playerId = sanitizePlayerId(payload?.playerId);
      if (!playerId) return;

      const existing = sessions.get(playerId);
      if (existing) {
        // Same socket already joined this session.
        if (existing.socketId === socket.id) return;
        attachSocket(socket, playerId, existing);
        // Refresh display name / character from the client.
        existing.player = {
          ...existing.player,
          name: sanitizeName(payload?.name),
          character: sanitizeCharacter(payload?.character),
        };
        profiles.set(playerId, existing.player);
        salon.updateInfo(existing.player);
        const resume = resumeFor(socket, playerId, existing);
        socket.emit('session:ready', { player: existing.player, resume });
        broadcastSalon();
        return;
      }

      // Reject if this socket already owns a different session.
      if (socketToPlayer.has(socket.id)) return;

      const prior = profiles.get(playerId);
      const player: PlayerInfo = {
        id: playerId,
        name: sanitizeName(payload?.name),
        character: sanitizeCharacter(payload?.character),
        rating: prior?.rating ?? STARTING_RATING,
        rank: prior?.rank ?? ratingToRank(STARTING_RATING),
      };
      profiles.set(playerId, player);
      const session: Session = { player, practice: null, socketId: null, graceTimer: null };
      sessions.set(playerId, session);
      attachSocket(socket, playerId, session);
      salon.join(player);
      socket.emit('session:ready', { player, resume: 'salon' });
      broadcastSalon();
    });

    socket.on('salon:move', ({ x, y }) => {
      const id = requirePlayerId();
      if (!id || !requireSession()) return;
      const p = salon.get(id);
      if (!p || p.status === 'playing') return;
      const wasSeated = !!p.tableId;
      const moved = salon.move(id, Number(x), Number(y));
      if (!moved) return;
      if (wasSeated) broadcastSalon();
      else io.emit('salon:moved', { id, x: moved.x, y: moved.y });
    });

    socket.on('salon:sit', ({ tableId, seat }) => {
      const id = requirePlayerId();
      if (!id || !requireSession()) return;
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
      const id = requirePlayerId();
      if (!id || !requireSession()) return;
      salon.stand(id);
      broadcastSalon();
    });

    socket.on('queue:join', (settings) => {
      const id = requirePlayerId();
      if (!id || !requireSession()) return;
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
      const id = requirePlayerId();
      if (!id) return;
      removeFromQueue(id);
      socket.emit('queue:status', { queued: false, waiting: queue.length });
      broadcastSalon();
    });

    socket.on('game:place', ({ gameId, x, y }) => {
      const id = requirePlayerId();
      if (!id) return;
      const res = games.place(id, String(gameId), Number(x), Number(y));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:pass', ({ gameId }) => {
      const id = requirePlayerId();
      if (!id) return;
      const res = games.pass(id, String(gameId));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:resign', ({ gameId }) => {
      const id = requirePlayerId();
      if (!id) return;
      const res = games.resign(id, String(gameId));
      if (!res.ok) socket.emit('game:error', res.error);
    });

    socket.on('game:leave', ({ gameId }) => {
      const id = requirePlayerId();
      if (!id) return;
      games.leave(id, String(gameId));
      socket.leave(roomOf(String(gameId)));
      salon.setStatus(id, 'idle');
      broadcastSalon();
    });

    socket.on('practice:list', () => {
      socket.emit('practice:list', problemSummaries());
    });

    socket.on('practice:start', ({ problemId }) => {
      const id = requirePlayerId();
      const session = requireSession();
      if (!id || !session) return;
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
      const id = requirePlayerId();
      const session = requireSession();
      if (!id || !session) return;
      session.practice = null;
      if (salon.get(id)?.status === 'practice') salon.setStatus(id, 'idle');
      broadcastSalon();
    });

    socket.on('disconnect', () => {
      const playerId = socketToPlayer.get(socket.id);
      if (!playerId) return;
      const session = sessions.get(playerId);
      if (!session) {
        socketToPlayer.delete(socket.id);
        return;
      }
      // A newer socket already owns this session (e.g. second tab / faster reconnect).
      if (session.socketId !== socket.id) {
        socketToPlayer.delete(socket.id);
        return;
      }
      session.socketId = null;
      socketToPlayer.delete(socket.id);
      if (session.graceTimer) clearTimeout(session.graceTimer);
      session.graceTimer = setTimeout(() => finalizeDisconnect(playerId), reconnectGraceMs);
    });
  });
}

/** Accept UUID-shaped ids from the client; reject empty / oversized junk. */
function sanitizePlayerId(raw: unknown): string | null {
  const id = String(raw ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  return id.toLowerCase();
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
