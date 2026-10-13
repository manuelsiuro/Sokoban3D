/** Tap-to-move paths: shortest, never moving a crate, null when unreachable. */
import { LEVELS } from '../src/levels/levels';
import { walkTo } from '../src/game/path';
import { parseLevel } from '../src/sim/grid';
import { crateCells, initialState, step, viewState } from '../src/sim/Sim';

const out: string[] = [];
for (const id of ['meadow-1', 'meadow-5', 'tundra-3', 'forge-4', 'clockwork-2']) {
  const level = LEVELS.find((l) => l.id === id)!;
  const g = parseLevel(level);
  const b0 = initialState(g);
  let reach = 0;
  let blocked = 0;
  let total = 0;
  for (let c = 0; c < g.w * g.h; c++) {
    if (g.wall[c] || c === viewState(g, b0).cell) continue;
    const p = walkTo(g, b0, c);
    if (!p) {
      blocked++;
      continue;
    }
    // Replaying the path lands on the cell and leaves every crate where it was.
    let b = b0;
    for (const d of p) b = step(g, b, d)!;
    if (viewState(g, b).cell !== c || crateCells(b).join() !== crateCells(b0).join()) throw new Error(`${id}: bad path to ${c}`);
    reach++;
    total += p.length;
  }
  out.push(`${id.padEnd(12)} reachable ${reach}  unreachable ${blocked}  steps ${total}`);
}
console.log(out.join('\n'));
