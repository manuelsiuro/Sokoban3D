/**
 * Solves every level from scratch and prints par, states and the solution (nothing written):
 * a timing benchmark and a check that a rules change leaves every level's search unchanged.
 *   npx tsx scripts/dev/bench.ts [level-id ...]
 */
import { LEVELS } from '../../src/levels/levels';
import { parseLevel } from '../../src/sim/grid';
import { solve } from '../../src/sim/solver';

const only = process.argv.slice(2);
const t0 = Date.now();
let states = 0;
for (const level of LEVELS) {
  if (only.length && !only.includes(level.id)) continue;
  const r = solve(parseLevel(level), { maxStates: 8_000_000 });
  states += r.explored;
  console.log(`${level.id} ${r.solution?.length ?? '-'} ${r.explored} ${r.solution}`);
}
console.error(`${states} states in ${Date.now() - t0}ms`);
