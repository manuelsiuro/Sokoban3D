/** Par is optimal: the solver, run again, finds no shorter solution than the stored one. */
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS } from '../src/levels/solutions';
import { parseLevel } from '../src/sim/grid';
import { solve } from '../src/sim/solver';
import { check } from './assert';

for (const level of LEVELS) {
  const stored = SOLUTIONS[level.id];
  if (stored === undefined) continue;
  const r = solve(parseLevel(level), { maxDepth: stored.length - 1, maxStates: 8_000_000 });
  check(r.solution === null && r.complete, `${level.id}: ${r.solution !== null ? `a shorter solution exists (${r.solution.length})` : 'search too big to prove par'}`);
  console.log(`${level.id.padEnd(14)} par ${stored.length} proven (${r.explored} states)`);
}
