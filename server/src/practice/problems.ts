import type { Color, TsumegoSummary, Vertex } from '@multigo/shared';

/**
 * A node in the accepted-solution tree. The student plays `move`; if the node
 * has `next`, the server answers with `reply` and the student continues from
 * `next`. A node without `next` is a leaf: reaching it solves the problem.
 */
export interface SolutionNode {
  move: Vertex;
  reply?: Vertex;
  next?: SolutionNode[];
  /** Optional comment shown when this node is reached. */
  note?: string;
}

export interface TsumegoProblem extends TsumegoSummary {
  black: Vertex[];
  white: Vertex[];
  toPlay: Color;
  /** Accepted first moves. */
  solution: SolutionNode[];
  /**
   * Alternative win condition: the problem is also solved as soon as any of
   * these enemy stones has been captured (useful for capture problems where
   * several move orders work).
   */
  captureAny?: Vertex[];
  successMessage: string;
}

/**
 * Coordinates are [x, y] with [0, 0] in the top-left corner. All problems are
 * on a 9x9 board with Black to play.
 */
export const PROBLEMS: TsumegoProblem[] = [
  {
    id: 'first-capture',
    title: 'First capture',
    description: 'The white stone has only one liberty left. Capture it.',
    difficulty: 'intro',
    size: 9,
    toPlay: 'black',
    black: [[3, 4], [5, 4], [4, 3]],
    white: [[4, 4]],
    solution: [{ move: [4, 5] }],
    captureAny: [[4, 4]],
    successMessage: 'Captured! A stone with no liberties is removed from the board.',
  },
  {
    id: 'capture-two',
    title: 'Two stones in atari',
    description: 'Stones that touch share their liberties. Capture the two white stones.',
    difficulty: 'intro',
    size: 9,
    toPlay: 'black',
    black: [[2, 4], [5, 4], [3, 3], [4, 3], [3, 5]],
    white: [[3, 4], [4, 4]],
    solution: [{ move: [4, 5] }],
    captureAny: [[3, 4]],
    successMessage: 'Both stones come off together: a chain lives or dies as one.',
  },
  {
    id: 'edge-capture',
    title: 'On the edge',
    description: 'Stones on the edge have fewer liberties. Capture the white stone.',
    difficulty: 'intro',
    size: 9,
    toPlay: 'black',
    black: [[3, 0], [5, 0]],
    white: [[4, 0]],
    solution: [{ move: [4, 1] }],
    captureAny: [[4, 0]],
    successMessage: 'The edge counts as a wall: only three liberties to begin with.',
  },
  {
    id: 'corner-capture',
    title: 'In the corner',
    description: 'A corner stone starts with just two liberties. Capture it.',
    difficulty: 'intro',
    size: 9,
    toPlay: 'black',
    black: [[1, 0]],
    white: [[0, 0]],
    solution: [{ move: [0, 1] }],
    captureAny: [[0, 0]],
    successMessage: 'Two liberties, two moves. The corner is a dangerous place.',
  },
  {
    id: 'second-line-crawl',
    title: 'Atari on the second line',
    description: 'Put the white stone in atari so that running along the edge does not help it.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[3, 1], [5, 1]],
    white: [[4, 1]],
    solution: [
      {
        move: [4, 2],
        reply: [4, 0],
        next: [
          { move: [3, 0], reply: [5, 0], next: [{ move: [6, 0] }] },
          { move: [5, 0], reply: [3, 0], next: [{ move: [2, 0] }] },
        ],
      },
    ],
    captureAny: [[4, 1]],
    successMessage: 'Crawling on the first line only adds one liberty at a time. Captured!',
  },
  {
    id: 'ladder',
    title: 'The ladder',
    description: 'Chase the white stone with a ladder. Keep it in atari with every move.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[1, 2], [2, 1], [1, 3], [4, 4]],
    white: [[2, 2]],
    solution: [
      {
        move: [3, 2],
        reply: [2, 3],
        next: [
          {
            move: [2, 4],
            reply: [3, 3],
            next: [{ move: [4, 3], reply: [3, 4], next: [{ move: [3, 5] }] }],
          },
        ],
      },
    ],
    captureAny: [[2, 2]],
    successMessage: 'The ladder runs straight into your stone at (4,4). Captured!',
  },
  {
    id: 'net',
    title: 'The net',
    description: 'White cannot be caught in a ladder here. Capture the stone with a net instead.',
    difficulty: 'medium',
    size: 9,
    toPlay: 'black',
    black: [[3, 2], [4, 2], [5, 2], [2, 3], [3, 4]],
    white: [[3, 3], [4, 3]],
    solution: [
      {
        move: [5, 4],
        note: 'The net: whichever way White runs, it stays short of liberties.',
        reply: [4, 4],
        next: [{ move: [4, 5], reply: [5, 3], next: [{ move: [6, 3] }] }],
      },
    ],
    captureAny: [[3, 3]],
    successMessage: 'Netted! Taking away the escape routes is often stronger than a direct atari.',
  },
  {
    id: 'snapback',
    title: 'Snapback',
    description: 'Sacrifice one stone to capture many. Capture the white group.',
    difficulty: 'medium',
    size: 9,
    toPlay: 'black',
    black: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3], [2, 3], [3, 3], [3, 2], [4, 0], [4, 1]],
    white: [[1, 0], [2, 0], [3, 0], [1, 1], [3, 1], [1, 2]],
    solution: [
      { move: [2, 1], reply: [2, 2], next: [{ move: [2, 1] }] },
      { move: [2, 2], reply: [7, 7], next: [{ move: [2, 1] }] },
    ],
    captureAny: [[1, 1]],
    successMessage: 'Snapback! White captured one stone but was left with a single liberty.',
  },
  {
    id: 'double-atari',
    title: 'Double atari',
    description: 'One move, two threats. White can only save one stone.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[2, 4], [3, 3], [6, 4], [5, 3]],
    white: [[3, 4], [5, 4]],
    solution: [
      {
        move: [4, 4],
        reply: [3, 5],
        next: [{ move: [5, 5] }],
      },
    ],
    captureAny: [[3, 4], [5, 4]],
    successMessage: 'Double atari: whichever stone White saves, the other one is captured.',
  },
  {
    id: 'capture-to-escape',
    title: 'Escape by capturing',
    description: 'Your two stones are in atari and cannot run. Save them.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[4, 4], [4, 5], [3, 3], [5, 3]],
    white: [[3, 4], [5, 4], [3, 5], [5, 5], [4, 3], [3, 6], [5, 6], [4, 7]],
    solution: [{ move: [4, 2] }],
    captureAny: [[4, 3]],
    successMessage: 'When you cannot run, look for an enemy stone that is even shorter of liberties.',
  },
  {
    id: 'two-eyes',
    title: 'Make two eyes',
    description: 'Your corner group has a three-point eye space. Play the vital point to live.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    white: [[4, 0], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
    solution: [{ move: [1, 0] }],
    successMessage: 'Two separate eyes: White can never fill both, so the group lives.',
  },
  {
    id: 'kill-vital-point',
    title: 'Kill at the vital point',
    description: 'The white group has a straight three eye space. Take the point that prevents two eyes.',
    difficulty: 'easy',
    size: 9,
    toPlay: 'black',
    black: [[4, 0], [4, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2]],
    white: [[3, 0], [0, 1], [1, 1], [2, 1], [3, 1]],
    solution: [{ move: [1, 0] }],
    successMessage: 'With the middle point taken, White can only ever make one eye. Dead!',
  },
  {
    id: 'two-point-eye',
    title: 'A two-point eye is no eye',
    description: 'White seems to have an eye in the corner. Prove that the group is dead by capturing it.',
    difficulty: 'medium',
    size: 9,
    toPlay: 'black',
    black: [[3, 0], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2]],
    white: [[2, 0], [0, 1], [1, 1], [2, 1]],
    solution: [
      { move: [1, 0], reply: [0, 0], next: [{ move: [1, 0] }] },
      { move: [0, 0], reply: [1, 0], next: [{ move: [0, 0] }] },
    ],
    captureAny: [[1, 1]],
    successMessage: 'Throw in, get captured, capture back. A two-point eye space is only one eye.',
  },
];

export function problemSummaries(): TsumegoSummary[] {
  return PROBLEMS.map(({ id, title, description, difficulty, size }) => ({ id, title, description, difficulty, size }));
}

export function findProblem(id: string): TsumegoProblem | undefined {
  return PROBLEMS.find((p) => p.id === id);
}
