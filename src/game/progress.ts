import { LEVELS } from '../levels/levels';
import { KEYS, readJSON, writeJSON } from './storage';

export interface LevelProgress {
  stars: number;
  /** Fewest moves of a solve (0: none). */
  moves: number;
  /** Solved once without undo or restart. */
  clean?: boolean;
}

export function loadProgress(): Record<string, LevelProgress> {
  return readJSON<Record<string, LevelProgress>>(KEYS.progress, {});
}

/** Keeps the best of each: stars, moves, the clean badge. Returns true for a new best. */
export function saveResult(id: string, stars: number, moves: number, clean: boolean): boolean {
  const all = loadProgress();
  const old = all[id];
  const better = !old || stars > old.stars || old.moves === 0 || moves < old.moves;
  all[id] = {
    stars: Math.max(stars, old?.stars ?? 0),
    moves: old && old.moves > 0 ? Math.min(old.moves, moves) : moves,
    ...(clean || old?.clean ? { clean: true } : {}),
  };
  writeJSON(KEYS.progress, all);
  return better;
}

export const totalStars = (p = loadProgress()) => Object.values(p).reduce((n, r) => n + (r?.stars ?? 0), 0);

/** A level opens once the previous one is solved (the first is always open). Solved levels stay open. */
export function isUnlocked(index: number, p = loadProgress()) {
  if (index <= 0) return true;
  if ((p[LEVELS[index]?.id]?.stars ?? 0) > 0) return true;
  return (p[LEVELS[index - 1]?.id]?.stars ?? 0) > 0;
}

/** The level Play leads to: the first open one not yet solved (null when all are solved). */
export function nextLevel(p = loadProgress()) {
  const i = LEVELS.findIndex((l, k) => isUnlocked(k, p) && !(p[l.id]?.stars ?? 0));
  return i < 0 ? null : i;
}
