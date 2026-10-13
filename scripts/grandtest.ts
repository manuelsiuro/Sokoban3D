/** Grand Islands: every stored solution solves its island (par is the best known, 'bound'). */
import { GRANDS, GRAND_SOLUTIONS } from '../src/levels/grand';
import { WORLDS } from '../src/levels/worlds';
import { Sim } from '../src/sim/Sim';
import { check } from './assert';

for (const w of WORLDS) check(GRANDS.some((g) => g.world === w.id), `${w.id}: no Grand Island`);
for (const level of GRANDS) {
  const sol = GRAND_SOLUTIONS[level.id];
  const sim = new Sim(level);
  const played = sim.play(sol ?? '');
  check(!!sol && played === sol.length && sim.state.solved, `${level.id}: its solution does not solve it`);
  check(level.parProof === 'bound', `${level.id}: should say its par is a bound`);
  console.log(`${level.id.padEnd(16)} ${sim.grid.w}x${sim.grid.h}  crates ${sim.state.crates.length}  best known ${sol.length}`);
}
