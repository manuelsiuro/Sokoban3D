import { LEVELS } from '../levels/levels';
import { WORLDS } from '../levels/worlds';
import { KEYS, readJSON, writeJSON } from './storage';

export interface LevelProgress {
  stars: number;
  /** Fewest moves of a solve (0: none). */
  moves: number;
  /** Solved once without undo or restart. */
  clean?: boolean;
  /** The moves of the best solve (LURD), for the ghost and replays. */
  run?: string;
  /** Time Trial: the best time (ms) and that run's moves with when each was made (ms). */
  time?: number;
  timeRun?: { moves: string; at: number[] };
}

export type Progress = Record<string, LevelProgress>;

export function loadProgress(): Progress {
  return readJSON<Progress>(KEYS.progress, {});
}

/** Keeps the best of each: stars, moves (with that run's moves), the clean badge. Returns true for a new best. */
export function saveResult(id: string, stars: number, moves: number, clean: boolean, run?: string): boolean {
  const all = loadProgress();
  const old = all[id];
  const better = !old || stars > old.stars || old.moves === 0 || moves < old.moves;
  const fewer = !old || old.moves === 0 || moves < old.moves;
  // The fewest-moves run; a save from before runs were kept takes the first run it gets.
  const keepRun = fewer || !old?.run ? run : old.run;
  all[id] = {
    stars: Math.max(stars, old?.stars ?? 0),
    moves: old && old.moves > 0 ? Math.min(old.moves, moves) : moves,
    ...(clean || old?.clean ? { clean: true } : {}),
    ...(keepRun ? { run: keepRun } : {}),
  };
  writeJSON(KEYS.progress, all);
  return better;
}

/** Keeps a Time Trial time if it's the best; returns true for a new best. */
export function saveTime(id: string, ms: number, moves: string, at: number[]): boolean {
  const all = loadProgress();
  const old = all[id];
  if (!old || (old.time !== undefined && old.time <= ms)) return false;
  all[id] = { ...old, time: ms, timeRun: { moves, at } };
  writeJSON(KEYS.progress, all);
  return true;
}

const starsOf = (p: Progress, id: string) => p[id]?.stars ?? 0;
export const totalStars = (p = loadProgress()) => LEVELS.reduce((n, l) => n + starsOf(p, l.id), 0);
export const worldLevels = (world: string) => LEVELS.map((l, i) => ({ l, i })).filter(({ l }) => l.world === world);
export const worldStars = (world: string, p = loadProgress()) => worldLevels(world).reduce((n, { l }) => n + starsOf(p, l.id), 0);

/** The share of the stars before a world needed to open it. */
export const GATE = 0.55;

/** Stars needed to open a world: 55% of all the stars in the worlds before it. */
export function worldGate(index: number) {
  const before = WORLDS.slice(0, index).reduce((n, w) => n + worldLevels(w.id).length * 3, 0);
  return Math.ceil(before * GATE);
}

/** Side worlds that open once another world is cleared (every level solved), not at a star gate. */
export const OPENS_AFTER: Record<string, string> = { reverse: 'desert' };
export const worldCleared = (world: string, p = loadProgress()) => worldLevels(world).every(({ l }) => starsOf(p, l.id) > 0);

/**
 * A world opens at its star gate, and stays open once a level in it has a star (so a
 * changed gate never locks a world already played in). Worlds without levels stay shut.
 */
export function isWorldOpen(index: number, p = loadProgress()) {
  const w = WORLDS[index];
  if (!w || worldLevels(w.id).length === 0) return false;
  if (index === 0 || worldStars(w.id, p) > 0) return true;
  if (OPENS_AFTER[w.id]) return worldCleared(OPENS_AFTER[w.id], p);
  return totalStars(p) >= worldGate(index);
}

/** A level opens with its world, once the one before it in the world is solved. Solved levels stay open. */
export function isUnlocked(index: number, p = loadProgress()) {
  const level = LEVELS[index];
  if (!level) return false;
  if (starsOf(p, level.id) > 0) return true;
  if (!isWorldOpen(WORLDS.findIndex((w) => w.id === level.world), p)) return false;
  const inWorld = worldLevels(level.world);
  const k = inWorld.findIndex(({ i }) => i === index);
  return k === 0 || starsOf(p, inWorld[k - 1].l.id) > 0;
}

/** The level Play leads to: the first open one not yet solved (null when all open ones are solved). */
export function nextLevel(p = loadProgress()) {
  const i = LEVELS.findIndex((l, k) => isUnlocked(k, p) && !starsOf(p, l.id));
  return i < 0 ? null : i;
}
