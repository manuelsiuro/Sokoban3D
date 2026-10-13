import type { LevelDef } from '../levels/types';
import type { Daily } from '../game/daily';
import type { Floor } from '../game/expedition';

/**
 * Promise-shaped calls to the worker (src/app/worker.ts). Hints get a worker of their own, so
 * a long solve never holds up an Expedition floor or the daily puzzle, and a stuck one can be
 * stopped. Every call settles: a worker that dies or times out resolves what it owed with
 * that call's failure value, and the next call starts a fresh worker.
 */
class Channel {
  private worker: Worker | null = null;
  private next = 1;
  private waiting = new Map<number, { resolve: (v: unknown) => void; fail: unknown }>();

  call<T>(msg: Record<string, unknown>, fail: T): Promise<T> {
    const id = this.next++;
    return new Promise<T>((resolve) => {
      this.waiting.set(id, { resolve: resolve as (v: unknown) => void, fail });
      try {
        (this.worker ?? this.start()).postMessage({ id, ...msg });
      } catch {
        this.reset();
      }
    });
  }

  /** Stops the worker and resolves everything still owed with its failure value. */
  reset() {
    this.worker?.terminate();
    this.worker = null;
    const owed = [...this.waiting.values()];
    this.waiting.clear();
    for (const p of owed) p.resolve(p.fail);
  }

  private start(): Worker {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<{ id: number; result: unknown }>) => {
      const p = this.waiting.get(e.data.id);
      this.waiting.delete(e.data.id);
      p?.resolve(e.data.result);
    };
    w.onerror = (e) => {
      e.preventDefault();
      if (this.worker === w) this.reset();
    };
    w.onmessageerror = () => {
      if (this.worker === w) this.reset();
    };
    this.worker = w;
    return w;
  }
}

const hints = new Channel();
const builder = new Channel();

type Hint = { solution: string | null; complete: boolean };
/** A solve that takes longer than this is given up (the hint worker is stopped). */
const HINT_MS = 25_000;
let pendingHint: { key: string; promise: Promise<Hint> } | null = null;

/**
 * The fewest moves from a position (null: none found; `complete`: none exists). Asking again
 * for the same position while it's being solved returns the same promise; asking for another
 * one stops the solve in progress (which then resolves as not found).
 */
export function hint(level: LevelDef, raw: Int16Array): Promise<Hint> {
  const key = JSON.stringify([level, [...raw]]);
  if (pendingHint?.key === key) return pendingHint.promise;
  if (pendingHint) hints.reset();
  const fail: Hint = { solution: null, complete: false };
  let timer = 0;
  const promise = new Promise<Hint>((resolve) => {
    timer = window.setTimeout(() => {
      hints.reset();
      resolve(fail);
    }, HINT_MS);
    void hints.call<Hint>({ type: 'hint', level, raw: [...raw] }, fail).then(resolve);
  }).finally(() => {
    clearTimeout(timer);
    if (pendingHint?.promise === promise) pendingHint = null;
  });
  pendingHint = { key, promise };
  return promise;
}

export const generateDaily = (date: string) => builder.call<Daily | null>({ type: 'daily', date }, null);

/** An Expedition floor; asking again for the same one returns the same promise (prefetch). */
const floors = new Map<string, Promise<Floor | null>>();
export function generateFloor(seed: number, depth: number) {
  const key = `${seed}:${depth}`;
  let p = floors.get(key);
  if (!p) {
    p = builder.call<Floor | null>({ type: 'floor', seed, depth }, null);
    // A floor that failed (a dead worker) is asked for afresh next time.
    void p.then((f) => {
      if (!f && floors.get(key) === p) floors.delete(key);
    });
    floors.set(key, p);
    // Keep only the last few.
    if (floors.size > 4) floors.delete(floors.keys().next().value!);
  }
  return p;
}
