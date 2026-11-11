export type Color = 'black' | 'white';
export type Sign = -1 | 0 | 1;
export type Vertex = [number, number];
export type Character = 'sloth' | 'shark' | 'jellyfish';

export const CHARACTERS: Character[] = ['sloth', 'shark', 'jellyfish'];
export const BOARD_SIZES = [9, 13, 19] as const;
export type BoardSize = (typeof BOARD_SIZES)[number];

export interface TimeControl {
  /** Main time per player in milliseconds. */
  mainTimeMs: number;
  /** Fischer increment added after every completed move, in milliseconds. */
  incrementMs: number;
}

export const TIME_CONTROL_PRESETS: { id: string; label: string; control: TimeControl }[] = [
  { id: 'blitz', label: 'Blitz · 1 min + 5s', control: { mainTimeMs: 60_000, incrementMs: 5_000 } },
  { id: 'normal', label: 'Normal · 5 min + 10s', control: { mainTimeMs: 300_000, incrementMs: 10_000 } },
  { id: 'long', label: 'Long · 15 min + 15s', control: { mainTimeMs: 900_000, incrementMs: 15_000 } },
];

export interface GameSettings {
  size: BoardSize;
  timeControl: TimeControl;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  size: 9,
  timeControl: TIME_CONTROL_PRESETS[1].control,
};

export interface ClockState {
  /** Remaining time (ms) for each player at the instant `at`. */
  black: number;
  white: number;
  /** Whose clock is currently running (null when the game is over). */
  running: Color | null;
  /** Server timestamp (ms since epoch) at which the values were sampled. */
  at: number;
}

export type GamePhase = 'playing' | 'finished';

export type GameEndReason = 'resign' | 'timeout' | 'score' | 'repetition' | 'abandon';

export interface ScoreBreakdown {
  blackStones: number;
  whiteStones: number;
  blackTerritory: number;
  whiteTerritory: number;
  komi: number;
  black: number;
  white: number;
}

export interface GameResult {
  /** null means draw. */
  winner: Color | null;
  reason: GameEndReason;
  score?: ScoreBreakdown;
  /** Human readable summary e.g. "B+3.5", "W+R", "Draw (triple repetition)". */
  summary: string;
}

export interface PlayerInfo {
  id: string;
  name: string;
  character: Character;
  rating: number;
  rank: string;
}

export interface GameState {
  id: string;
  size: number;
  komi: number;
  /** Rows of signs; board[y][x]. 1 = black, -1 = white. */
  board: Sign[][];
  turn: Color;
  moveNumber: number;
  lastMove: Vertex | 'pass' | null;
  captures: { black: number; white: number };
  consecutivePasses: number;
  phase: GamePhase;
  result: GameResult | null;
  players: { black: PlayerInfo; white: PlayerInfo };
  clock: ClockState;
  timeControl: TimeControl;
  /** Ownership map once the game has been scored: 1 black, -1 white, 0 neutral. */
  territory: Sign[][] | null;
  /** Point that is currently illegal because of simple ko, if any. */
  koPoint: Vertex | null;
}

export type PlayerStatus = 'idle' | 'queued' | 'playing' | 'practice';

export interface SalonPlayer extends PlayerInfo {
  x: number;
  y: number;
  tableId: string | null;
  seat: 0 | 1 | null;
  status: PlayerStatus;
}

export interface SalonTable {
  id: string;
  label: string;
  x: number;
  y: number;
  seats: [string | null, string | null];
  settings: GameSettings;
}

export interface SalonState {
  width: number;
  height: number;
  players: SalonPlayer[];
  tables: SalonTable[];
  queueSize: number;
}

export interface TsumegoSummary {
  id: string;
  title: string;
  description: string;
  difficulty: 'intro' | 'easy' | 'medium';
  size: number;
}

export type PracticeStatus = 'solving' | 'solved' | 'failed';

export interface PracticeState {
  problemId: string;
  title: string;
  description: string;
  size: number;
  board: Sign[][];
  toPlay: Color;
  status: PracticeStatus;
  message: string;
  lastMove: Vertex | null;
  moveCount: number;
}

export interface GameError {
  code:
    | 'not-your-turn'
    | 'occupied'
    | 'suicide'
    | 'ko'
    | 'out-of-bounds'
    | 'game-over'
    | 'not-in-game'
    | 'not-found'
    | 'invalid';
  message: string;
}

export type SessionResume = 'salon' | 'game' | 'practice';

export interface ServerToClientEvents {
  'session:ready': (payload: { player: PlayerInfo; resume: SessionResume }) => void;
  'session:player': (player: PlayerInfo) => void;
  'salon:state': (state: SalonState) => void;
  'salon:moved': (payload: { id: string; x: number; y: number }) => void;
  'queue:status': (payload: { queued: boolean; waiting: number }) => void;
  'game:start': (state: GameState) => void;
  'game:state': (state: GameState) => void;
  'game:error': (error: GameError) => void;
  'practice:list': (problems: TsumegoSummary[]) => void;
  'practice:state': (state: PracticeState) => void;
  'practice:error': (error: GameError) => void;
}

export interface ClientToServerEvents {
  'session:join': (payload: { name: string; character: Character; playerId: string }) => void;
  'salon:move': (payload: { x: number; y: number }) => void;
  'salon:sit': (payload: { tableId: string; seat: 0 | 1 }) => void;
  'salon:stand': () => void;
  'queue:join': (settings: GameSettings) => void;
  'queue:leave': () => void;
  'game:place': (payload: { gameId: string; x: number; y: number }) => void;
  'game:pass': (payload: { gameId: string }) => void;
  'game:resign': (payload: { gameId: string }) => void;
  'game:leave': (payload: { gameId: string }) => void;
  'practice:list': () => void;
  'practice:start': (payload: { problemId: string }) => void;
  'practice:move': (payload: { x: number; y: number }) => void;
  'practice:reset': () => void;
  'practice:stop': () => void;
}

/** EGF-style scale: 100 rating points per rank, 2100 = 1 dan. */
export const STARTING_RATING = 1500;

export function ratingToRank(rating: number): string {
  const index = Math.floor((rating - 2100) / 100);
  if (index >= 0) return `${Math.min(index + 1, 9)}d`;
  return `${Math.min(-index, 30)}k`;
}

export function opponentOf(color: Color): Color {
  return color === 'black' ? 'white' : 'black';
}

export function colorToSign(color: Color): Sign {
  return color === 'black' ? 1 : -1;
}
