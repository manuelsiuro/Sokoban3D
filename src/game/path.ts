import type { Grid } from '../sim/grid';
import { crateCells, step, stateKey, viewState } from '../sim/Sim';

/**
 * Tap-to-move: the shortest walk to a cell that moves no crate, found with the real rules
 * (so ice, conveyors, heights and gates count). Returns grid directions, or null.
 */
export function walkTo(g: Grid, from: Int16Array, target: number, limit = 5000): number[] | null {
  const crates = crateCells(from).join();
  const seen = new Set([stateKey(g, from)]);
  const queue: { b: Int16Array; path: number[] }[] = [{ b: from, path: [] }];
  for (let k = 0; k < queue.length && seen.size < limit; k++) {
    const { b, path } = queue[k];
    for (let d = 0; d < 4; d++) {
      const next = step(g, b, d);
      if (!next || crateCells(next).join() !== crates) continue;
      const key = stateKey(g, next);
      if (seen.has(key)) continue;
      seen.add(key);
      const p = [...path, d];
      if (viewState(g, next).cell === target) return p;
      queue.push({ b: next, path: p });
    }
  }
  return null;
}
