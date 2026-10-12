/**
 * Every level is won by its stored solution, whose length is the par; no level starts
 * solved; every level parses. Prints a line per level, compared with the snapshot.
 */
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS } from '../src/levels/solutions';
import { Sim } from '../src/sim/Sim';
import { starLimits } from '../src/game/score';
import { check } from './assert';

for (const level of LEVELS) {
  const solution = SOLUTIONS[level.id];
  check(solution !== undefined, `${level.id}: no stored solution (run scripts/dev/solveall.ts)`);
  if (solution === undefined) continue;
  const sim = new Sim(level);
  check(!sim.state.solved, `${level.id}: solved at the start`);
  const played = sim.play(solution);
  const s = sim.state;
  check(played === solution.length, `${level.id}: move ${played + 1} of the solution is blocked`);
  check(s.solved, `${level.id}: the solution doesn't solve it`);
  check(sim.moves === solution, `${level.id}: pushes in the solution don't match the rules`);
  const [two, three] = starLimits(solution.length);
  console.log(`${s.solved ? 'OK  ' : 'FAIL'} ${level.id.padEnd(14)} par ${String(solution.length).padStart(3)} pushes ${String(s.pushes).padStart(3)} crates ${s.crates.length}  ★★ ≤${two} ★★★ ≤${three}`);
}
