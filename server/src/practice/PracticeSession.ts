import { opponentOf, type GameError, type PlayerInfo, type PracticeState, type Vertex } from '@multigo/shared';
import { GoGame } from '../game/GoGame.js';
import type { SolutionNode, TsumegoProblem } from './problems.js';

const PRACTICE_PLAYER: PlayerInfo = { id: 'practice', name: 'Practice', character: 'sloth', rating: 0, rank: '-' };

export type PracticeMoveResult = { ok: true } | { ok: false; error: GameError };

/**
 * A solo tsumego session. The student's moves are validated by the regular
 * engine (legality, captures, ko) and then matched against the problem's
 * solution tree. The server plays the scripted reply moves.
 */
export class PracticeSession {
  private game: GoGame;
  private nodes: SolutionNode[];
  private status: PracticeState['status'] = 'solving';
  private message: string;
  private moveCount = 0;

  constructor(private readonly problem: TsumegoProblem) {
    this.game = PracticeSession.newGame(problem);
    this.nodes = problem.solution;
    this.message = `${problem.toPlay === 'black' ? 'Black' : 'White'} to play.`;
  }

  private static newGame(problem: TsumegoProblem): GoGame {
    return new GoGame({
      id: `practice-${problem.id}`,
      size: problem.size,
      timeControl: { mainTimeMs: Number.MAX_SAFE_INTEGER / 4, incrementMs: 0 },
      players: { black: PRACTICE_PLAYER, white: PRACTICE_PLAYER },
      setup: { black: problem.black, white: problem.white, toPlay: problem.toPlay },
      repetitionLimit: Number.MAX_SAFE_INTEGER,
    });
  }

  reset() {
    this.game = PracticeSession.newGame(this.problem);
    this.nodes = this.problem.solution;
    this.status = 'solving';
    this.moveCount = 0;
    this.message = `${this.problem.toPlay === 'black' ? 'Black' : 'White'} to play.`;
  }

  move(x: number, y: number): PracticeMoveResult {
    if (this.status !== 'solving') {
      return { ok: false, error: { code: 'game-over', message: 'This problem is finished. Reset to try again.' } };
    }
    const student = this.problem.toPlay;
    const res = this.game.place(student, x, y);
    if (!res.ok) return res;
    this.moveCount += 1;

    const node = this.nodes.find((n) => n.move[0] === x && n.move[1] === y);
    const capturedTarget = this.problem.captureAny?.some(([cx, cy]) => this.game.signMap[cy][cx] === 0) ?? false;

    if (capturedTarget || (node && !node.next?.length)) {
      this.status = 'solved';
      this.message = this.problem.successMessage;
      return { ok: true };
    }

    if (!node) {
      this.status = 'failed';
      this.message = 'That move does not work here. Reset and look for a better one.';
      return { ok: true };
    }

    if (node.reply) {
      const reply = this.game.place(opponentOf(student), node.reply[0], node.reply[1]);
      if (!reply.ok) {
        // Should never happen with a well-formed problem; fail safe by solving.
        this.status = 'solved';
        this.message = this.problem.successMessage;
        return { ok: true };
      }
    }
    this.nodes = node.next ?? [];
    this.message = node.note ?? 'Good. Keep going.';
    return { ok: true };
  }

  toState(): PracticeState {
    return {
      problemId: this.problem.id,
      title: this.problem.title,
      description: this.problem.description,
      size: this.problem.size,
      board: this.game.signMap,
      toPlay: this.problem.toPlay,
      status: this.status,
      message: this.message,
      lastMove: Array.isArray(this.game.lastMove) ? (this.game.lastMove as Vertex) : null,
      moveCount: this.moveCount,
    };
  }
}
