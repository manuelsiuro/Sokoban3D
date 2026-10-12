import { DIRS, VOID, type Grid } from './grid';
import { EVENT, crateCells, eventsOf, initialState, isSolved, neighbour, stateKey, step } from './Sim';

/**
 * Finds the fewest-moves solution by breadth-first search over the real rules (`step`), so
 * whatever a mechanic does, the solver plays it exactly as the player would. Crates are
 * interchangeable in the visited key. On classic levels (flat, walls only), states with a
 * crate on a dead square (one no push can bring to a goal) are skipped.
 */
export interface SolveResult {
  /** LURD (uppercase: pushes), or null when none was found. */
  solution: string | null;
  /** States visited. */
  explored: number;
  /** Every state within maxDepth was searched (so null really means none that short). */
  complete: boolean;
}

/** Cells from which a crate can still be pushed onto some goal (classic levels only). */
export function liveCells(g: Grid): Uint8Array {
  const live = new Uint8Array(g.w * g.h);
  const open = (c: number) => c >= 0 && !g.wall[c] && g.floor[c] !== VOID;
  const todo = [...g.goals];
  for (const c of todo) live[c] = 1;
  while (todo.length) {
    const c = todo.pop()!;
    for (let d = 0; d < 4; d++) {
      // A crate at `from` pushed in direction d (player behind it at `back`) lands on c.
      const from = neighbour(g, c, (d + 2) % 4);
      const back = from < 0 ? -1 : neighbour(g, from, (d + 2) % 4);
      if (!open(from) || !open(back) || live[from]) continue;
      live[from] = 1;
      todo.push(from);
    }
  }
  return live;
}

export function solve(g: Grid, opts: { maxStates?: number; maxDepth?: number; start?: Int16Array } = {}): SolveResult {
  const maxStates = opts.maxStates ?? 3_000_000;
  const maxDepth = opts.maxDepth ?? Infinity;
  const live = g.classic ? liveCells(g) : null;
  const first = opts.start ?? initialState(g);
  const states: Int16Array[] = [first];
  const parent: number[] = [-1];
  const via: number[] = [-1];
  const depth: number[] = [0];
  const seen = new Set<string>([stateKey(first)]);
  const path = (i: number) => {
    let out = '';
    for (; parent[i] >= 0; i = parent[i]) {
      const c = DIRS[via[i]];
      out = (eventsOf(states[i]) & EVENT.push ? c.toUpperCase() : c) + out;
    }
    return out;
  };
  if (isSolved(first)) return { solution: '', explored: 1, complete: true };
  for (let head = 0; head < states.length; head++) {
    if (depth[head] >= maxDepth) continue;
    const b = states[head];
    for (let d = 0; d < 4; d++) {
      const next = step(g, b, d);
      if (!next) continue;
      const key = stateKey(next);
      if (seen.has(key)) continue;
      if (live && eventsOf(next) & EVENT.push && crateCells(next).some((c) => c >= 0 && !live[c])) continue;
      seen.add(key);
      states.push(next);
      parent.push(head);
      via.push(d);
      depth.push(depth[head] + 1);
      if (isSolved(next)) return { solution: path(states.length - 1), explored: states.length, complete: true };
      if (states.length >= maxStates) return { solution: null, explored: states.length, complete: false };
    }
  }
  return { solution: null, explored: states.length, complete: true };
}
