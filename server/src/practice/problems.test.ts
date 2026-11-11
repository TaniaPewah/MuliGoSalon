import { describe, expect, it } from 'vitest';
import { PROBLEMS, type SolutionNode } from './problems.js';
import { PracticeSession } from './PracticeSession.js';

function lines(nodes: SolutionNode[], prefix: SolutionNode[] = []): SolutionNode[][] {
  const out: SolutionNode[][] = [];
  for (const n of nodes) {
    const path = [...prefix, n];
    if (n.next?.length) out.push(...lines(n.next, path));
    else out.push(path);
  }
  return out;
}

describe('tsumego problem set', () => {
  it('contains between 8 and 15 problems with unique ids', () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(8);
    expect(PROBLEMS.length).toBeLessThanOrEqual(15);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  for (const problem of PROBLEMS) {
    describe(problem.title, () => {
      it('has a valid starting position', () => {
        expect(() => new PracticeSession(problem)).not.toThrow();
      });

      for (const line of lines(problem.solution)) {
        it(`solves via ${line.map((n) => `(${n.move})`).join(' ')}`, () => {
          const session = new PracticeSession(problem);
          for (const node of line) {
            expect(session.toState().status).toBe('solving');
            const res = session.move(node.move[0], node.move[1]);
            expect(res.ok, `move ${node.move} should be legal`).toBe(true);
          }
          const state = session.toState();
          expect(state.status).toBe('solved');
          if (problem.captureAny) {
            const captured = problem.captureAny.some(([x, y]) => state.board[y][x] === 0);
            expect(captured, 'a target stone should have been captured').toBe(true);
          }
        });
      }

      it('marks an unrelated move as failed', () => {
        const session = new PracticeSession(problem);
        const res = session.move(8, 8);
        expect(res.ok).toBe(true);
        expect(session.toState().status).toBe('failed');
        session.reset();
        expect(session.toState().status).toBe('solving');
        expect(session.toState().moveCount).toBe(0);
      });
    });
  }

  it('rejects illegal moves without changing the status', () => {
    const session = new PracticeSession(PROBLEMS[0]);
    const occupied = session.move(4, 4);
    expect(occupied.ok).toBe(false);
    expect(session.toState().status).toBe('solving');
  });
});
