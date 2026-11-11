import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  Character,
  GameError,
  GameSettings,
  GameState,
  PlayerInfo,
  PracticeState,
  SalonState,
  TsumegoSummary,
} from '@multigo/shared';
import { socket } from './socket';
import { playCaptureRustle, playStoneClack, unlockAudio } from './sound';

export type View = 'login' | 'salon' | 'game' | 'practice';

export interface Toast {
  id: number;
  text: string;
  tone: 'error' | 'info';
}

/** A game state together with the local time it arrived (for clock interpolation). */
export interface TimedGameState {
  state: GameState;
  receivedAt: number;
}

interface Store {
  view: View;
  connected: boolean;
  me: PlayerInfo | null;
  salon: SalonState | null;
  queue: { queued: boolean; waiting: number };
  game: TimedGameState | null;
  practice: PracticeState | null;
  problems: TsumegoSummary[];
  toasts: Toast[];
  actions: {
    join: (name: string, character: Character) => void;
    moveTo: (x: number, y: number) => void;
    sit: (tableId: string, seat: 0 | 1) => void;
    stand: () => void;
    joinQueue: (settings: GameSettings) => void;
    leaveQueue: () => void;
    place: (x: number, y: number) => void;
    pass: () => void;
    resign: () => void;
    leaveGame: () => void;
    openPractice: () => void;
    startProblem: (id: string) => void;
    practiceMove: (x: number, y: number) => void;
    resetProblem: () => void;
    closePractice: () => void;
    dismissToast: (id: number) => void;
  };
}

const StoreContext = createContext<Store | null>(null);

let toastId = 0;

export function StoreProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<View>('login');
  const [connected, setConnected] = useState(false);
  const [me, setMe] = useState<PlayerInfo | null>(null);
  const [salon, setSalon] = useState<SalonState | null>(null);
  const [queue, setQueue] = useState({ queued: false, waiting: 0 });
  const [game, setGame] = useState<TimedGameState | null>(null);
  const [practice, setPractice] = useState<PracticeState | null>(null);
  const [problems, setProblems] = useState<TsumegoSummary[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastGameRef = useRef<GameState | null>(null);
  const lastPracticeRef = useRef<PracticeState | null>(null);

  const pushToast = useCallback((text: string, tone: Toast['tone'] = 'error') => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, text, tone }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => {
      setConnected(false);
      setMe(null);
      setGame(null);
      setSalon(null);
      setView('login');
      pushToast('Disconnected from the salon. Please join again.', 'info');
    };
    const onReady = ({ player }: { player: PlayerInfo }) => {
      setMe(player);
      setView('salon');
    };
    const onPlayer = (player: PlayerInfo) => setMe(player);
    const onSalon = (state: SalonState) => setSalon(state);
    const onMoved = ({ id, x, y }: { id: string; x: number; y: number }) =>
      setSalon((s) => (s ? { ...s, players: s.players.map((p) => (p.id === id ? { ...p, x, y } : p)) } : s));
    const onQueue = (status: { queued: boolean; waiting: number }) => setQueue(status);
    const onGameStart = (state: GameState) => {
      lastGameRef.current = state;
      setGame({ state, receivedAt: Date.now() });
      setQueue({ queued: false, waiting: 0 });
      setView('game');
    };
    const onGameState = (state: GameState) => {
      const prev = lastGameRef.current;
      if (prev && prev.id === state.id) {
        if (state.moveNumber > prev.moveNumber && Array.isArray(state.lastMove)) playStoneClack();
        const captured = state.captures.black + state.captures.white - (prev.captures.black + prev.captures.white);
        if (captured > 0) playCaptureRustle(captured);
      }
      lastGameRef.current = state;
      setGame({ state, receivedAt: Date.now() });
    };
    const onGameError = (err: GameError) => pushToast(err.message);
    const onPracticeList = (list: TsumegoSummary[]) => setProblems(list);
    const onPracticeState = (state: PracticeState) => {
      const prev = lastPracticeRef.current;
      if (prev && prev.problemId === state.problemId && state.moveCount > prev.moveCount) {
        playStoneClack();
        const before = prev.board.flat().filter((s) => s !== 0).length;
        const after = state.board.flat().filter((s) => s !== 0).length;
        // Up to two stones were added (student + reply); fewer means captures happened.
        const placed = state.board.flat().filter((s, i) => s !== 0 && prev.board.flat()[i] === 0).length;
        const removed = before + placed - after;
        if (removed > 0) playCaptureRustle(removed);
      }
      lastPracticeRef.current = state;
      setPractice(state);
    };
    const onPracticeError = (err: GameError) => pushToast(err.message);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('session:ready', onReady);
    socket.on('session:player', onPlayer);
    socket.on('salon:state', onSalon);
    socket.on('salon:moved', onMoved);
    socket.on('queue:status', onQueue);
    socket.on('game:start', onGameStart);
    socket.on('game:state', onGameState);
    socket.on('game:error', onGameError);
    socket.on('practice:list', onPracticeList);
    socket.on('practice:state', onPracticeState);
    socket.on('practice:error', onPracticeError);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('session:ready', onReady);
      socket.off('session:player', onPlayer);
      socket.off('salon:state', onSalon);
      socket.off('salon:moved', onMoved);
      socket.off('queue:status', onQueue);
      socket.off('game:start', onGameStart);
      socket.off('game:state', onGameState);
      socket.off('game:error', onGameError);
      socket.off('practice:list', onPracticeList);
      socket.off('practice:state', onPracticeState);
      socket.off('practice:error', onPracticeError);
    };
  }, [pushToast]);

  const actions = useMemo<Store['actions']>(
    () => ({
      join: (name, character) => {
        unlockAudio();
        if (!socket.connected) socket.connect();
        const send = () => socket.emit('session:join', { name, character });
        if (socket.connected) send();
        else socket.once('connect', send);
      },
      moveTo: (x, y) => {
        setSalon((s) =>
          s && me ? { ...s, players: s.players.map((p) => (p.id === me.id ? { ...p, x, y } : p)) } : s,
        );
        socket.emit('salon:move', { x, y });
      },
      sit: (tableId, seat) => socket.emit('salon:sit', { tableId, seat }),
      stand: () => socket.emit('salon:stand'),
      joinQueue: (settings) => socket.emit('queue:join', settings),
      leaveQueue: () => socket.emit('queue:leave'),
      place: (x, y) => {
        const g = lastGameRef.current;
        if (g) socket.emit('game:place', { gameId: g.id, x, y });
      },
      pass: () => {
        const g = lastGameRef.current;
        if (g) socket.emit('game:pass', { gameId: g.id });
      },
      resign: () => {
        const g = lastGameRef.current;
        if (g) socket.emit('game:resign', { gameId: g.id });
      },
      leaveGame: () => {
        const g = lastGameRef.current;
        if (g) socket.emit('game:leave', { gameId: g.id });
        lastGameRef.current = null;
        setGame(null);
        setView('salon');
      },
      openPractice: () => {
        socket.emit('practice:list');
        setView('practice');
      },
      startProblem: (id) => socket.emit('practice:start', { problemId: id }),
      practiceMove: (x, y) => socket.emit('practice:move', { x, y }),
      resetProblem: () => socket.emit('practice:reset'),
      closePractice: () => {
        socket.emit('practice:stop');
        lastPracticeRef.current = null;
        setPractice(null);
        setView('salon');
      },
      dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    }),
    [me],
  );

  const value: Store = { view, connected, me, salon, queue, game, practice, problems, toasts, actions };
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
