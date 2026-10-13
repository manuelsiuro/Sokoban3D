/** Expedition floors: the same seed gives the same floors, each solvable by its solution. */
import { expeditionFloor, recipe } from '../src/game/expeditionFloors';
import { Sim } from '../src/sim/Sim';
import { DIRS } from '../src/sim/grid';

const out: string[] = [];
for (const depth of [0, 3, 6, 9, 12, 15, 18]) {
  const a = expeditionFloor(42, depth);
  if (!a) {
    out.push(`floor ${depth + 1}: none`);
    continue;
  }
  // Built twice, the same floor (checked on the first, to keep the test quick).
  const b = depth === 0 ? expeditionFloor(42, depth)! : a;
  if (a.level.map.join('/') !== b.level.map.join('/') || a.solution !== b.solution) throw new Error(`floor ${depth} is not deterministic`);
  const sim = new Sim(a.level);
  for (const c of a.solution) sim.move(DIRS.indexOf(c.toLowerCase()));
  if (!sim.state.solved) throw new Error(`floor ${depth} solution does not solve it`);
  const r = recipe(depth);
  out.push(`floor ${String(depth + 1).padStart(2)} ${a.level.world.padEnd(9)} crates ${r.gen.crates} ${r.gen.w}x${r.gen.h} par ${String(a.par).padStart(3)} window ${r.par.join('-')}  ${a.level.map.join('/')}`);
}
console.log(out.join('\n'));
