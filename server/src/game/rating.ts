const K_FACTOR = 32;

/**
 * Plain Elo update. `scoreA` is 1 for a win, 0.5 for a draw, 0 for a loss of player A.
 * Returns the new ratings rounded to integers.
 */
export function updateElo(ratingA: number, ratingB: number, scoreA: number): { a: number; b: number } {
  const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreB = 1 - scoreA;
  return {
    a: Math.round(ratingA + K_FACTOR * (scoreA - expectedA)),
    b: Math.round(ratingB + K_FACTOR * (scoreB - expectedB)),
  };
}
