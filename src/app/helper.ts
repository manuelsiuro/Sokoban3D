import type { LevelDef } from '../levels/types';
import type { Daily } from '../game/daily';

/** Promise-shaped calls to the worker (src/app/worker.ts). */
let worker: Worker | null = null;
let next = 1;
const waiting = new Map<number, (v: unknown) => void>();

function call<T>(msg: Record<string, unknown>): Promise<T> {
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      waiting.get(e.data.id)?.(e.data.result);
      waiting.delete(e.data.id);
    };
  }
  const id = next++;
  return new Promise<T>((resolve) => {
    waiting.set(id, resolve as (v: unknown) => void);
    worker!.postMessage({ id, ...msg });
  });
}

/** The fewest moves from a position (null: none found; `complete`: none exists). */
export const hint = (level: LevelDef, raw: Int16Array) => call<{ solution: string | null; complete: boolean }>({ type: 'hint', level, raw: [...raw] });

export const generateDaily = (date: string) => call<Daily | null>({ type: 'daily', date });
