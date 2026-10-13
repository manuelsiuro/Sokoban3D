import { DIRS, VOID, type Grid } from './grid';
import { MOVED_CRATE, arrival, crateCells, eventsOf, initialState, inputCount, isSolved, neighbour, stateKey, step } from './Sim';

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
      // A crate at `from` (next to c) pushed towards c, the player behind it at `back`.
      // Links are mutual, so away from c at `from` is the direction we arrived in.
      const from = neighbour(g, c, d);
      const back = from < 0 ? -1 : neighbour(g, from, arrival(g, c, d));
      if (!open(from) || !open(back) || live[from]) continue;
      live[from] = 1;
      todo.push(from);
    }
  }
  return live;
}

/**
 * Crates that can never reach a pad any more (classic levels only; [] elsewhere): on a dead
 * square, or frozen in a 2×2 block of walls and crates that isn't all on pads. Only ever
 * certain cases, so a warning built on it is never wrong. `live` is liveCells(g), cached by the caller.
 */
export function stuckCrates(g: Grid, cells: number[], live: Uint8Array): number[] {
  if (!g.classic) return [];
  const crate = new Set(cells.filter((c) => c >= 0));
  const out = new Set<number>();
  cells.forEach((c, k) => {
    if (c >= 0 && !live[c]) out.add(k);
  });
  // A 2×2 block (flat islands: the square closes on the grid) where nothing can move.
  if (!g.planet) {
    const solid = (c: number) => c >= 0 && (g.wall[c] === 1 || g.floor[c] === VOID || crate.has(c));
    for (const c of crate) {
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
        const x = (c % g.w) + dx;
        const y = Math.floor(c / g.w) + dy;
        if (x < 0 || y < 0 || x + 1 >= g.w || y + 1 >= g.h) continue;
        const block = [y * g.w + x, y * g.w + x + 1, (y + 1) * g.w + x, (y + 1) * g.w + x + 1];
        if (!block.every(solid)) continue;
        const held = block.filter((b) => crate.has(b));
        if (held.every((b) => g.goal[b])) continue;
        for (const b of held) if (!g.goal[b]) out.add(cells.indexOf(b));
      }
    }
  }
  return [...out].sort((a, b) => a - b);
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
  const seen = new Set<string>([stateKey(g, first)]);
  const path = (i: number) => {
    let out = '';
    for (; parent[i] >= 0; i = parent[i]) {
      const c = DIRS[via[i] & 3];
      out = (eventsOf(states[i]) & MOVED_CRATE ? c.toUpperCase() : c) + out;
    }
    return out;
  };
  if (isSolved(first)) return { solution: '', explored: 1, complete: true };
  for (let head = 0; head < states.length; head++) {
    if (depth[head] >= maxDepth) continue;
    const b = states[head];
    for (let d = 0, n = inputCount(g); d < n; d++) {
      const next = step(g, b, d);
      if (!next) continue;
      const key = stateKey(g, next);
      if (seen.has(key)) continue;
      if (live && eventsOf(next) & MOVED_CRATE && crateCells(next).some((c) => c >= 0 && !live[c])) continue;
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
