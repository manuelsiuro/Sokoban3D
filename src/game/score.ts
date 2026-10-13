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

/**
 * Time Trial medals (milliseconds): gold for about a third of a second a move over par
 * plus two seconds of thinking; silver at 1.5× gold, bronze at 2.2×. [bronze, silver, gold].
 */
export function medalTimes(par: number): [number, number, number] {
  const gold = Math.round((par * 0.32 + 2) * 1000);
  return [Math.round(gold * 2.2), Math.round(gold * 1.5), gold];
}

/** 0 (none) to 3 (gold) for a time. */
export function medalFor(ms: number, par: number): number {
  const [b, s, g] = medalTimes(par);
  return ms <= g ? 3 : ms <= s ? 2 : ms <= b ? 1 : 0;
}

/** A time as m:ss.t (or s.t under a minute). */
export function formatTime(ms: number): string {
  const tenths = Math.floor(ms / 100);
  const s = Math.floor(tenths / 10);
  const m = Math.floor(s / 60);
  return m ? `${m}:${String(s % 60).padStart(2, '0')}.${tenths % 10}` : `${s}.${tenths % 10}`;
}
