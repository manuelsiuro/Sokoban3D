import type { LevelDef } from '../levels/types';
import { KEYS, readJSON, writeJSON } from './storage';

/**
 * Expedition: an endless run of generated islands. Every three floors the run reaches the
 * next world and its mechanic; rooms grow and gain crates as it goes deeper. A run is a
 * seed: the same seed gives the same floors to everyone (a share link carries it).
 *
 * Rules: undo is free; skipping a floor costs a compass (3 to start, one more for each
 * three-star solve, at most 5); with no compass left, giving up ends the run.
 * The floors themselves are built in the worker (expeditionFloors.ts).
 */
export const START_COMPASSES = 3;
export const MAX_COMPASSES = 5;

export interface Floor {
  depth: number;
  level: LevelDef;
  par: number;
  solution: string;
}

/** A run in progress (saved after each floor, so it can be left and picked up later). */
export interface RunState {
  seed: number;
  /** The floor being played (0-based). */
  depth: number;
  score: number;
  compasses: number;
  /** Stars per floor cleared (0: skipped). */
  stars: number[];
}

export interface ExpeditionSave {
  run: RunState | null;
  best: { depth: number; score: number };
  runs: number;
}

export const loadExpedition = (): ExpeditionSave => {
  const s = readJSON<Partial<ExpeditionSave>>(KEYS.expedition, {}) ?? {};
  const r = s.run;
  // A run saved in a shape this version can't play is dropped, not crashed on.
  const ok = !!r && [r.seed, r.depth, r.score, r.compasses].every(Number.isFinite) && Array.isArray(r.stars);
  const best = s.best && Number.isFinite(s.best.depth) && Number.isFinite(s.best.score) ? s.best : { depth: 0, score: 0 };
  return { run: ok ? r! : null, best, runs: Number.isFinite(s.runs) ? s.runs! : 0 };
};
const save = (s: ExpeditionSave) => writeJSON(KEYS.expedition, s);

export function newRun(seed = Math.floor(Math.random() * 1e9)): RunState {
  const s = loadExpedition();
  const run: RunState = { seed, depth: 0, score: 0, compasses: START_COMPASSES, stars: [] };
  save({ ...s, run, runs: s.runs + 1 });
  return run;
}

/** Points for a floor: more for deeper floors and more stars, a bonus for matching par. */
export const floorScore = (depth: number, stars: number, moves: number, par: number) => (stars ? (depth + 1) * 10 * stars + (moves <= par ? 25 : 0) : 0);

/** A floor solved: the score, a compass for three stars, on to the next floor. */
export function clearFloor(run: RunState, stars: number, moves: number, par: number): RunState {
  const next: RunState = {
    ...run,
    depth: run.depth + 1,
    score: run.score + floorScore(run.depth, stars, moves, par),
    compasses: Math.min(MAX_COMPASSES, run.compasses + (stars >= 3 ? 1 : 0)),
    stars: [...run.stars, stars],
  };
  keep(next);
  return next;
}

/** A floor skipped with a compass (null: none left). */
export function skipFloor(run: RunState): RunState | null {
  if (run.compasses <= 0) return null;
  const next: RunState = { ...run, depth: run.depth + 1, compasses: run.compasses - 1, stars: [...run.stars, 0] };
  keep(next);
  return next;
}

/** Ends the run: the best depth and score are kept. Returns whether either is a new best. */
export function endRun(run: RunState): { depth: boolean; score: boolean } {
  const s = loadExpedition();
  const better = { depth: run.depth > s.best.depth, score: run.score > s.best.score };
  save({ ...s, run: null, best: { depth: Math.max(s.best.depth, run.depth), score: Math.max(s.best.score, run.score) } });
  return better;
}

function keep(run: RunState) {
  const s = loadExpedition();
  save({ ...s, run, best: { depth: Math.max(s.best.depth, run.depth), score: Math.max(s.best.score, run.score) } });
}
