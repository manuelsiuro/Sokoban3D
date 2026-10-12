import type { Daily } from './daily';
import { dayNumber } from './daily';
import { KEYS, readJSON, writeJSON } from './storage';

/** Daily results and the streak (days in a row with a solve). */
export interface DailyProgress {
  streak: number;
  best: number;
  /** The last date solved (YYYY-MM-DD), or ''. */
  last: string;
  results: Record<string, { stars: number; moves: number }>;
}

const EMPTY: DailyProgress = { streak: 0, best: 0, last: '', results: {} };

export const loadDaily = (): DailyProgress => ({ ...EMPTY, ...readJSON<Partial<DailyProgress>>(KEYS.daily, {}) });

/** The streak as it stands today: it's broken once a whole day went by without a solve. */
export function currentStreak(today: string, p = loadDaily()) {
  if (!p.last) return 0;
  return dayNumber(today) - dayNumber(p.last) <= 1 ? p.streak : 0;
}

/** Records a solve of `date`'s puzzle; returns the streak after it. */
export function saveDaily(date: string, stars: number, moves: number): number {
  const p = loadDaily();
  const old = p.results[date];
  p.results[date] = { stars: Math.max(stars, old?.stars ?? 0), moves: old ? Math.min(old.moves, moves) : moves };
  if (p.last !== date) {
    p.streak = p.last && dayNumber(date) - dayNumber(p.last) === 1 ? p.streak + 1 : 1;
    p.last = date;
    p.best = Math.max(p.best, p.streak);
  }
  writeJSON(KEYS.daily, p);
  return p.streak;
}

/** Today's puzzle, if it was generated already (it takes a moment). */
export function cachedDaily(date: string): Daily | null {
  const c = readJSON<Partial<Daily>>(KEYS.dailyCache, {});
  return c.date === date && c.level ? (c as Daily) : null;
}

export const cacheDaily = (d: Daily) => writeJSON(KEYS.dailyCache, d);
