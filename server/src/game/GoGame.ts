import GoBoardModule from '@sabaki/go-board';
import {
  colorToSign,
  opponentOf,
  type Color,
  type GameError,
  type GamePhase,
  type GameResult,
  type GameState,
  type PlayerInfo,
  type Sign,
  type TimeControl,
  type Vertex,
} from '@multigo/shared';
import { formatScoreSummary, scoreArea } from './scoring.js';

// @sabaki/go-board is a CommonJS module. Under NodeNext the default import is
// typed as the whole `module.exports`, while at runtime Node hands us the class
// itself, so normalise both.
type GoBoardCtor = typeof GoBoardModule.default;
type Board = InstanceType<GoBoardCtor>;
const Board: GoBoardCtor =
  (GoBoardModule as unknown as { default?: GoBoardCtor }).default ?? (GoBoardModule as unknown as GoBoardCtor);

export interface GoGameOptions {
  id: string;
  size: number;
  komi?: number;
  timeControl: TimeControl;
  players: { black: PlayerInfo; white: PlayerInfo };
  now?: number;
  /** Number of times a position may occur before the game is declared a draw. */
  repetitionLimit?: number;
  /** Optional preset position (used by practice problems). */
  setup?: { black: Vertex[]; white: Vertex[]; toPlay: Color };
}

export type MoveResult = { ok: true } | { ok: false; error: GameError };

const DEFAULT_KOMI = 7.5;

/**
 * Authoritative Go game engine. Board mechanics (captures, suicide detection)
 * are delegated to @sabaki/go-board; everything else (turn order, simple ko,
 * repetition, passes, resignation, scoring and the clock) lives here.
 */
export class GoGame {
  readonly id: string;
  readonly size: number;
  readonly komi: number;
  readonly timeControl: TimeControl;
  readonly players: { black: PlayerInfo; white: PlayerInfo };

  private board: Board;
  turn: Color = 'black';
  moveNumber = 0;
  lastMove: Vertex | 'pass' | null = null;
  captures = { black: 0, white: 0 };
  consecutivePasses = 0;
  phase: GamePhase = 'playing';
  result: GameResult | null = null;
  koPoint: Vertex | null = null;
  territory: Sign[][] | null = null;

  private readonly repetitionLimit: number;
  private positionCounts = new Map<string, number>();
  private remaining: { black: number; white: number };
  private turnStartedAt: number;
  private finishedAt: number | null = null;

  constructor(opts: GoGameOptions) {
    this.id = opts.id;
    this.size = opts.size;
    this.komi = opts.komi ?? DEFAULT_KOMI;
    this.timeControl = opts.timeControl;
    this.players = opts.players;
    this.repetitionLimit = opts.repetitionLimit ?? 3;
    this.board = Board.fromDimensions(opts.size);
    if (opts.setup) {
      for (const v of opts.setup.black) this.board.set(v, 1);
      for (const v of opts.setup.white) this.board.set(v, -1);
      if (!this.board.isValid()) throw new Error('Invalid setup position: a chain has no liberties');
      this.turn = opts.setup.toPlay;
    }
    this.remaining = { black: opts.timeControl.mainTimeMs, white: opts.timeControl.mainTimeMs };
    this.turnStartedAt = opts.now ?? Date.now();
    this.recordPosition();
  }

  get signMap(): Sign[][] {
    return this.board.signMap.map((row) => row.slice() as Sign[]);
  }

  colorOf(playerId: string): Color | null {
    if (this.players.black.id === playerId) return 'black';
    if (this.players.white.id === playerId) return 'white';
    return null;
  }

  /** Absolute server time at which the player to move loses on time. */
  deadlineAt(): number | null {
    if (this.phase !== 'playing') return null;
    return this.turnStartedAt + this.remaining[this.turn];
  }

  /**
   * Settles the clock of the player to move. Returns false (and ends the game)
   * if that player has already run out of time.
   */
  checkTimeout(now = Date.now()): boolean {
    if (this.phase !== 'playing') return false;
    const elapsed = now - this.turnStartedAt;
    if (elapsed >= this.remaining[this.turn]) {
      this.remaining[this.turn] = 0;
      this.finish(
        { winner: opponentOf(this.turn), reason: 'timeout', summary: `${opponentOf(this.turn) === 'black' ? 'B' : 'W'}+T` },
        now,
      );
      return true;
    }
    return false;
  }

  place(color: Color, x: number, y: number, now = Date.now()): MoveResult {
    const gate = this.gate(color, now);
    if (gate) return gate;

    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= this.size || y >= this.size) {
      return fail('out-of-bounds', 'That point is not on the board.');
    }
    const vertex: Vertex = [x, y];
    if (this.board.get(vertex) !== 0) return fail('occupied', 'That point is already occupied.');
    if (this.koPoint && this.koPoint[0] === x && this.koPoint[1] === y) {
      return fail('ko', 'Ko: you must play elsewhere before retaking.');
    }

    const sign = colorToSign(color);
    const analysis = this.board.analyzeMove(sign, vertex);
    if (analysis.suicide) return fail('suicide', 'Suicide is not allowed.');

    const before = this.board;
    const after = before.makeMove(sign, vertex, { preventOverwrite: true, preventSuicide: true });

    const capturedStones: Vertex[] = [];
    for (let yy = 0; yy < this.size; yy++) {
      for (let xx = 0; xx < this.size; xx++) {
        if (before.signMap[yy][xx] === -sign && after.signMap[yy][xx] === 0) capturedStones.push([xx, yy]);
      }
    }
    this.captures[color] += capturedStones.length;

    // Simple ko: a single stone captured a single stone and is itself left with
    // exactly one liberty, the point just captured.
    const liberties = after.getLiberties(vertex);
    const isKo =
      capturedStones.length === 1 &&
      after.getChain(vertex).length === 1 &&
      liberties.length === 1 &&
      liberties[0][0] === capturedStones[0][0] &&
      liberties[0][1] === capturedStones[0][1];
    this.koPoint = isKo ? capturedStones[0] : null;

    this.board = after;
    this.lastMove = vertex;
    this.consecutivePasses = 0;
    this.advanceTurn(now);

    const repetitions = this.recordPosition();
    if (repetitions >= this.repetitionLimit) {
      this.finish({ winner: null, reason: 'repetition', summary: 'Draw (triple repetition)' }, now);
    }
    return { ok: true };
  }

  pass(color: Color, now = Date.now()): MoveResult {
    const gate = this.gate(color, now);
    if (gate) return gate;

    this.lastMove = 'pass';
    this.koPoint = null;
    this.consecutivePasses += 1;
    this.advanceTurn(now);
    this.recordPosition();

    if (this.consecutivePasses >= 2) this.score(now);
    return { ok: true };
  }

  resign(color: Color, now = Date.now()): MoveResult {
    if (this.phase !== 'playing') return fail('game-over', 'The game is already over.');
    const winner = opponentOf(color);
    this.finish({ winner, reason: 'resign', summary: `${winner === 'black' ? 'B' : 'W'}+R` }, now);
    return { ok: true };
  }

  /** Ends the game because `color` left; the opponent wins. */
  abandon(color: Color, now = Date.now()): void {
    if (this.phase !== 'playing') return;
    const winner = opponentOf(color);
    this.finish({ winner, reason: 'abandon', summary: `${winner === 'black' ? 'B' : 'W'}+F` }, now);
  }

  toState(now = Date.now()): GameState {
    return {
      id: this.id,
      size: this.size,
      komi: this.komi,
      board: this.signMap,
      turn: this.turn,
      moveNumber: this.moveNumber,
      lastMove: this.lastMove,
      captures: { ...this.captures },
      consecutivePasses: this.consecutivePasses,
      phase: this.phase,
      result: this.result,
      players: this.players,
      clock: this.clockState(now),
      timeControl: this.timeControl,
      territory: this.territory,
      koPoint: this.koPoint,
    };
  }

  clockState(now = Date.now()) {
    const at = this.phase === 'playing' ? now : (this.finishedAt ?? now);
    const black = this.remaining.black;
    const white = this.remaining.white;
    if (this.phase !== 'playing') return { black, white, running: null, at };
    const elapsed = Math.max(0, now - this.turnStartedAt);
    return {
      black: this.turn === 'black' ? Math.max(0, black - elapsed) : black,
      white: this.turn === 'white' ? Math.max(0, white - elapsed) : white,
      running: this.turn,
      at,
    };
  }

  // ---- internals -------------------------------------------------------

  private gate(color: Color, now: number): MoveResult | null {
    if (this.phase !== 'playing') return fail('game-over', 'The game is already over.');
    if (color !== this.turn) return fail('not-your-turn', "It is not your turn.");
    if (this.checkTimeout(now)) return fail('game-over', 'You ran out of time.');
    return null;
  }

  private advanceTurn(now: number) {
    const elapsed = Math.max(0, now - this.turnStartedAt);
    this.remaining[this.turn] = Math.max(0, this.remaining[this.turn] - elapsed) + this.timeControl.incrementMs;
    this.turn = opponentOf(this.turn);
    this.turnStartedAt = now;
    this.moveNumber += 1;
  }

  private recordPosition(): number {
    const key = this.board.signMap.map((row) => row.join('')).join('/') + ':' + this.turn;
    const count = (this.positionCounts.get(key) ?? 0) + 1;
    this.positionCounts.set(key, count);
    return count;
  }

  private score(now: number) {
    const { score, territory } = scoreArea(this.signMap, this.komi);
    this.territory = territory;
    const diff = score.black - score.white;
    this.finish(
      {
        winner: diff === 0 ? null : diff > 0 ? 'black' : 'white',
        reason: 'score',
        score,
        summary: formatScoreSummary(score),
      },
      now,
    );
  }

  private finish(result: GameResult, now: number) {
    if (this.phase === 'finished') return;
    // Freeze the clock of the player to move.
    const elapsed = Math.max(0, now - this.turnStartedAt);
    this.remaining[this.turn] = Math.max(0, this.remaining[this.turn] - elapsed);
    this.phase = 'finished';
    this.result = result;
    this.finishedAt = now;
  }
}

function fail(code: GameError['code'], message: string): MoveResult {
  return { ok: false, error: { code, message } };
}
