/**
 * Stars for a solve, from the moves it took and the level's par (the solver's fewest):
 * one for solving, two within 1.5× par, three within par + 10%.
 */
export function starsFor(moves: number, par: number): number {
  if (moves <= par + Math.floor(par * 0.1)) return 3;
  if (moves <= Math.floor(par * 1.5)) return 2;
  return 1;
}

/** The most moves that still earn each star count: [★★, ★★★]. */
export const starLimits = (par: number) => [Math.floor(par * 1.5), par + Math.floor(par * 0.1)];
