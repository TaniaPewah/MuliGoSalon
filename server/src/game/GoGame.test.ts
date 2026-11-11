import { describe, expect, it } from 'vitest';
import type { PlayerInfo } from '@multigo/shared';
import { GoGame } from './GoGame.js';
import { scoreArea } from './scoring.js';
import { updateElo } from './rating.js';

const black: PlayerInfo = { id: 'b', name: 'Hikaru', character: 'sloth', rating: 1500, rank: '6k' };
const white: PlayerInfo = { id: 'w', name: 'Akira', character: 'shark', rating: 1500, rank: '6k' };

function newGame(size = 9, opts: { mainTimeMs?: number; incrementMs?: number; now?: number } = {}) {
  return new GoGame({
    id: 'g1',
    size,
    timeControl: { mainTimeMs: opts.mainTimeMs ?? 60_000, incrementMs: opts.incrementMs ?? 0 },
    players: { black, white },
    now: opts.now ?? 0,
  });
}

/** Plays a list of alternating moves starting with the player to move. */
function play(game: GoGame, moves: ([number, number] | 'pass')[], now = 1) {
  for (const m of moves) {
    const res = m === 'pass' ? game.pass(game.turn, now) : game.place(game.turn, m[0], m[1], now);
    if (!res.ok) throw new Error(`Move ${JSON.stringify(m)} failed: ${res.error.message}`);
  }
}

describe('basic placement rules', () => {
  it('rejects moves out of turn', () => {
    const g = newGame();
    const res = g.place('white', 4, 4, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('not-your-turn');
  });

  it('rejects occupied and out of bounds points', () => {
    const g = newGame();
    play(g, [[4, 4]]);
    const occupied = g.place('white', 4, 4, 1);
    expect(occupied.ok).toBe(false);
    if (!occupied.ok) expect(occupied.error.code).toBe('occupied');
    const oob = g.place('white', 9, 0, 1);
    expect(oob.ok).toBe(false);
    if (!oob.ok) expect(oob.error.code).toBe('out-of-bounds');
  });

  it('alternates turns and counts moves', () => {
    const g = newGame();
    play(g, [[2, 2], [6, 6]]);
    expect(g.turn).toBe('black');
    expect(g.moveNumber).toBe(2);
    expect(g.signMap[2][2]).toBe(1);
    expect(g.signMap[6][6]).toBe(-1);
  });
});

describe('captures', () => {
  it('captures a single surrounded stone', () => {
    const g = newGame();
    // White stone at (4,4) surrounded by black on three sides, then the fourth.
    play(g, [[3, 4], [4, 4], [5, 4], [0, 0], [4, 3], [0, 1], [4, 5]]);
    expect(g.signMap[4][4]).toBe(0);
    expect(g.captures.black).toBe(1);
    expect(g.captures.white).toBe(0);
  });

  it('captures a multi-stone chain', () => {
    const g = newGame();
    // White chain (3,3),(4,3); black surrounds it.
    play(g, [
      [2, 3], [3, 3],
      [5, 3], [4, 3],
      [3, 2], [8, 8],
      [4, 2], [8, 7],
      [3, 4], [8, 6],
      [4, 4],
    ]);
    expect(g.signMap[3][3]).toBe(0);
    expect(g.signMap[3][4]).toBe(0);
    expect(g.captures.black).toBe(2);
  });

  it('allows capturing while in atari (a move with no liberties of its own that captures)', () => {
    const g = newGame();
    // Black (2,1) ends up in atari with (1,1) as its only liberty. The white
    // chain (1,0),(2,0) also has (1,1) as its only liberty. Black playing (1,1)
    // would have zero liberties by itself, but it captures first and is legal.
    play(g, [
      [2, 1], [1, 0],
      [0, 0], [2, 0],
      [3, 0], [1, 2],
      [0, 1], [3, 1],
      [8, 8], [2, 2],
      [8, 7], [0, 2],
    ]);
    // Black (0,0),(0,1) and (2,1) are each in atari with (1,1) as their only liberty.
    expect(g.signMap[1][2]).toBe(1);
    expect(g.signMap[0][0]).toBe(1);
    const res = g.place('black', 1, 1, 1);
    expect(res.ok).toBe(true);
    expect(g.signMap[0][1]).toBe(0);
    expect(g.signMap[0][2]).toBe(0);
    expect(g.signMap[1][1]).toBe(1);
    expect(g.captures.black).toBe(2);
  });
});

describe('suicide', () => {
  it('rejects a suicidal move', () => {
    const g = newGame();
    // Black surrounds (0,0): black at (1,0) and (0,1). White tries (0,0).
    play(g, [[1, 0], [8, 8], [0, 1]]);
    const res = g.place('white', 0, 0, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('suicide');
    expect(g.signMap[0][0]).toBe(0);
    expect(g.turn).toBe('white');
  });

  it('rejects multi-stone suicide', () => {
    const g = newGame();
    // Black walls (2,0),(2,1),(0,2),(1,2). White at (0,0),(1,0),(0,1); white plays (1,1) -> suicide.
    play(g, [[2, 0], [0, 0], [2, 1], [1, 0], [0, 2], [0, 1], [1, 2]]);
    const res = g.place('white', 1, 1, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('suicide');
  });
});

describe('ko', () => {
  function setupKo() {
    const g = newGame();
    //   0 1 2 3
    // 0 . B W .
    // 1 B . B W     <- hmm, we build the classic ko shape below
    // 2 . B W .
    // Black: (1,0),(0,1),(1,2),(2,1). White: (2,0),(3,1),(2,2). Then white takes (1,1)? No:
    // Build: black (1,0),(0,1),(1,2); white (2,0),(3,1),(2,2); black (2,1); white captures at (1,1).
    play(g, [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2], [2, 1], [1, 1]]);
    return g;
  }

  it('forbids immediate recapture of a ko', () => {
    const g = setupKo();
    // White captured black (2,1) by playing (1,1).
    expect(g.signMap[1][2]).toBe(0);
    expect(g.captures.white).toBe(1);
    expect(g.koPoint).toEqual([2, 1]);
    const res = g.place('black', 2, 1, 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ko');
  });

  it('allows retaking the ko after a move elsewhere', () => {
    const g = setupKo();
    play(g, [[8, 8], [8, 0]]);
    expect(g.koPoint).toBeNull();
    const res = g.place('black', 2, 1, 1);
    expect(res.ok).toBe(true);
    expect(g.signMap[1][1]).toBe(0);
    expect(g.captures.black).toBe(1);
  });

  it('does not treat a multi-stone capture as ko', () => {
    const g = newGame();
    play(g, [
      [2, 3], [3, 3],
      [5, 3], [4, 3],
      [3, 2], [8, 8],
      [4, 2], [8, 7],
      [3, 4], [8, 6],
      [4, 4],
    ]);
    expect(g.koPoint).toBeNull();
  });
});

describe('passing, resignation and scoring', () => {
  it('two consecutive passes end the game with area scoring + komi', () => {
    const g = newGame(9);
    // Black wall on column 4 from top to bottom, white stones at column 6.
    // Black owns columns 0-4 (5*9 = 45 points), white owns 5-8 ... Build a clean wall.
    const moves: ([number, number] | 'pass')[] = [];
    for (let y = 0; y < 9; y++) {
      moves.push([4, y]);
      moves.push([5, y]);
    }
    play(g, moves);
    play(g, ['pass', 'pass']);
    expect(g.phase).toBe('finished');
    expect(g.result?.reason).toBe('score');
    // Black: 9 stones + 36 territory = 45; White: 9 stones + 27 territory + 7.5 komi = 43.5.
    expect(g.result?.score?.black).toBe(45);
    expect(g.result?.score?.white).toBe(43.5);
    expect(g.result?.winner).toBe('black');
    expect(g.result?.summary).toBe('B+1.5');
    expect(g.territory?.[0][0]).toBe(1);
    expect(g.territory?.[0][8]).toBe(-1);
  });

  it('a pass followed by a move resets the pass counter', () => {
    const g = newGame();
    play(g, ['pass', [4, 4], 'pass']);
    expect(g.phase).toBe('playing');
    expect(g.consecutivePasses).toBe(1);
  });

  it('clears the ko point after a pass so the ko can be retaken', () => {
    const g = newGame();
    play(g, [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2], [2, 1], [1, 1]]);
    expect(g.koPoint).toEqual([2, 1]);
    play(g, ['pass', [8, 8]]);
    expect(g.koPoint).toBeNull();
    expect(g.place('black', 2, 1, 1).ok).toBe(true);
  });

  it('resignation ends the game in favour of the opponent', () => {
    const g = newGame();
    play(g, [[4, 4]]);
    expect(g.resign('white', 1).ok).toBe(true);
    expect(g.phase).toBe('finished');
    expect(g.result?.winner).toBe('black');
    expect(g.result?.summary).toBe('B+R');
    const after = g.place('black', 0, 0, 2);
    expect(after.ok).toBe(false);
    if (!after.ok) expect(after.error.code).toBe('game-over');
  });

  it('scores an empty board as a white win by komi and neutral empty area', () => {
    const { score, territory } = scoreArea(
      Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0 as const)),
      7.5,
    );
    expect(score.black).toBe(0);
    expect(score.white).toBe(7.5);
    expect(territory[4][4]).toBe(0);
  });

  it('treats empty regions touching both colours as neutral', () => {
    const board = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => 0 as 0 | 1 | -1));
    board[0][0] = 1;
    board[4][4] = -1;
    const { score } = scoreArea(board, 0);
    expect(score.blackTerritory).toBe(0);
    expect(score.whiteTerritory).toBe(0);
    expect(score.black).toBe(1);
    expect(score.white).toBe(1);
  });
});

describe('triple repetition', () => {
  it('declares a draw when the same position occurs three times', () => {
    // Triple ko: three independent ko shapes. Each capture is legal because the
    // previous capture happened in a different ko, so the position cycles with
    // period 6 and must be stopped by the repetition rule.
    const g = newGame(9);
    play(g, [
      // Ko A (top-left): black (1,0),(0,1),(1,2); white (2,0),(3,1),(2,2); p=(1,1) q=(2,1)
      [1, 0], [2, 0],
      [0, 1], [3, 1],
      [1, 2], [2, 2],
      // Ko B (top-right): black (6,0),(5,1),(6,2); white (7,0),(8,1),(7,2); p=(6,1) q=(7,1)
      [6, 0], [7, 0],
      [5, 1], [8, 1],
      [6, 2], [7, 2],
      // Ko C (bottom-left): black (1,5),(0,6),(1,7); white (2,5),(3,6),(2,7); p=(1,6) q=(2,6)
      [1, 5], [2, 5],
      [0, 6], [3, 6],
      [1, 7], [2, 7],
      // Initial ko stones: black holds A, white holds B and C.
      [2, 1], [6, 1],
      [4, 4], [1, 6],
    ]);
    const cycle: [number, number][] = [
      [7, 1], // B captures ko B
      [1, 1], // W captures ko A
      [2, 6], // B captures ko C
      [6, 1], // W retakes ko B
      [2, 1], // B retakes ko A
      [1, 6], // W retakes ko C
    ];
    const startBoard = JSON.stringify(g.signMap);
    play(g, cycle); // back to the starting position: second occurrence
    expect(JSON.stringify(g.signMap)).toBe(startBoard);
    expect(g.phase).toBe('playing');
    play(g, cycle.slice(0, 5)); // every intermediate position has now occurred twice
    expect(g.phase).toBe('playing');
    // The last move of the second cycle recreates the starting position for the third time.
    const last = cycle[5];
    expect(g.place(g.turn, last[0], last[1], 1).ok).toBe(true);
    expect(g.phase).toBe('finished');
    expect(g.result?.reason).toBe('repetition');
    expect(g.result?.winner).toBeNull();
  });
});

describe('clock', () => {
  it('deducts elapsed time and adds the Fischer increment after a move', () => {
    const g = newGame(9, { mainTimeMs: 10_000, incrementMs: 2_000, now: 0 });
    expect(g.place('black', 4, 4, 3_000).ok).toBe(true);
    let clock = g.clockState(3_000);
    expect(clock.black).toBe(9_000); // 10s - 3s + 2s
    expect(clock.white).toBe(10_000);
    expect(clock.running).toBe('white');
    clock = g.clockState(4_000);
    expect(clock.white).toBe(9_000); // white's clock is ticking
    expect(clock.black).toBe(9_000);
  });

  it('declares a timeout loss when the player to move exceeds their time', () => {
    const g = newGame(9, { mainTimeMs: 5_000, incrementMs: 0, now: 0 });
    expect(g.deadlineAt()).toBe(5_000);
    expect(g.checkTimeout(4_999)).toBe(false);
    expect(g.checkTimeout(5_000)).toBe(true);
    expect(g.phase).toBe('finished');
    expect(g.result?.reason).toBe('timeout');
    expect(g.result?.winner).toBe('white');
    expect(g.clockState(9_000).black).toBe(0);
    expect(g.clockState(9_000).running).toBeNull();
  });

  it('rejects a late move and ends the game instead of accepting it', () => {
    const g = newGame(9, { mainTimeMs: 5_000, incrementMs: 0, now: 0 });
    const res = g.place('black', 4, 4, 6_000);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('game-over');
    expect(g.signMap[4][4]).toBe(0);
    expect(g.result?.reason).toBe('timeout');
    expect(g.result?.winner).toBe('white');
  });

  it('passing also consumes time and receives the increment', () => {
    const g = newGame(9, { mainTimeMs: 10_000, incrementMs: 1_000, now: 0 });
    g.pass('black', 2_000);
    expect(g.clockState(2_000).black).toBe(9_000);
    expect(g.deadlineAt()).toBe(12_000);
  });
});

describe('rating', () => {
  it('moves rating towards the winner', () => {
    const { a, b } = updateElo(1500, 1500, 1);
    expect(a).toBe(1516);
    expect(b).toBe(1484);
  });

  it('is symmetric on a draw between equals', () => {
    const { a, b } = updateElo(1500, 1500, 0.5);
    expect(a).toBe(1500);
    expect(b).toBe(1500);
  });
});
