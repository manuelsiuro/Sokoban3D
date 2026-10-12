/**
 * Heavy work off the main thread: the solver for hints (from the position on screen) and
 * the daily puzzle's generator. Messages in: { id, type: 'hint', level, raw } or
 * { id, type: 'daily', date }; out: { id, result }.
 */
import type { LevelDef } from '../levels/types';
import { parseLevel } from '../sim/grid';
import { solve } from '../sim/solver';
import { dailyPuzzle } from '../game/daily';

type Job = { id: number; type: 'hint'; level: LevelDef; raw: number[] } | { id: number; type: 'daily'; date: string };

/** The worker's own scope (typed here, so the DOM types of the rest of the app stay as they are). */
const ctx = self as unknown as { postMessage: (m: unknown) => void; onmessage: ((e: MessageEvent<Job>) => void) | null };

ctx.onmessage = (e) => {
  const job = e.data;
  if (job.type === 'hint') {
    const r = solve(parseLevel(job.level), { start: Int16Array.from(job.raw), maxStates: 700_000 });
    ctx.postMessage({ id: job.id, result: { solution: r.solution, complete: r.complete } });
  } else {
    let result = null;
    try {
      result = dailyPuzzle(job.date);
    } catch {
      /* no puzzle: the caller says so */
    }
    ctx.postMessage({ id: job.id, result });
  }
};
