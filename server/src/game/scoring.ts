import type { ScoreBreakdown, Sign } from '@multigo/shared';

export interface AreaScore {
  score: ScoreBreakdown;
  /** Ownership map: 1 black, -1 white, 0 neutral/dame. */
  territory: Sign[][];
}

/**
 * Area scoring (Tromp-Taylor / Chinese style): every stone on the board counts
 * one point for its owner, and every empty region that touches only one colour
 * counts for that colour. Regions touching both colours (or nothing) are neutral.
 *
 * Stones that are "dead" in a human sense are NOT removed automatically: players
 * are expected to capture them before passing, exactly as under Tromp-Taylor rules.
 */
export function scoreArea(board: Sign[][], komi: number): AreaScore {
  const size = board.length;
  const territory: Sign[][] = board.map((row) => row.map((s) => (s === 0 ? 0 : s)) as Sign[]);
  const visited: boolean[][] = board.map((row) => row.map(() => false));

  let blackStones = 0;
  let whiteStones = 0;
  let blackTerritory = 0;
  let whiteTerritory = 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const s = board[y][x];
      if (s === 1) blackStones++;
      else if (s === -1) whiteStones++;
    }
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (board[y][x] !== 0 || visited[y][x]) continue;

      const region: [number, number][] = [];
      const stack: [number, number][] = [[x, y]];
      visited[y][x] = true;
      let touchesBlack = false;
      let touchesWhite = false;

      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        region.push([cx, cy]);
        for (const [nx, ny] of neighbors(cx, cy, size)) {
          const ns = board[ny][nx];
          if (ns === 0) {
            if (!visited[ny][nx]) {
              visited[ny][nx] = true;
              stack.push([nx, ny]);
            }
          } else if (ns === 1) touchesBlack = true;
          else touchesWhite = true;
        }
      }

      let owner: Sign = 0;
      if (touchesBlack && !touchesWhite) owner = 1;
      else if (touchesWhite && !touchesBlack) owner = -1;

      if (owner === 1) blackTerritory += region.length;
      else if (owner === -1) whiteTerritory += region.length;
      for (const [rx, ry] of region) territory[ry][rx] = owner;
    }
  }

  const black = blackStones + blackTerritory;
  const white = whiteStones + whiteTerritory + komi;

  return {
    score: { blackStones, whiteStones, blackTerritory, whiteTerritory, komi, black, white },
    territory,
  };
}

export function neighbors(x: number, y: number, size: number): [number, number][] {
  const out: [number, number][] = [];
  if (x > 0) out.push([x - 1, y]);
  if (x < size - 1) out.push([x + 1, y]);
  if (y > 0) out.push([x, y - 1]);
  if (y < size - 1) out.push([x, y + 1]);
  return out;
}

export function formatScoreSummary(score: ScoreBreakdown): string {
  const diff = score.black - score.white;
  if (diff === 0) return 'Draw (equal score)';
  return diff > 0 ? `B+${diff}` : `W+${-diff}`;
}
