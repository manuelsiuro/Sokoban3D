/**
 * Stuck crates: the warning is never wrong. No state along any stored solution has a stuck
 * crate (a solvable position can't be lost), and the plain dead cases are caught.
 */
import { LEVELS } from '../src/levels/levels';
import { PLANET } from '../src/levels/worlds/planet';
import { SOLUTIONS } from '../src/levels/solutions';
import type { LevelDef } from '../src/levels/types';
import { parseLevel } from '../src/sim/grid';
import { Sim, crateCells, inputOf } from '../src/sim/Sim';
import { liveCells, stuckCrates } from '../src/sim/solver';
import { check } from './assert';

let levels = 0;
let states = 0;
for (const level of [...LEVELS, ...PLANET]) {
  const g = parseLevel(level);
  if (!g.classic) continue;
  const live = liveCells(g);
  const sim = new Sim(level);
  const run = SOLUTIONS[level.id] ?? '';
  levels++;
  for (let k = 0; k <= run.length; k++) {
    if (k) sim.move(inputOf(g, run[k - 1]));
    const stuck = stuckCrates(g, crateCells(sim.raw), live);
    states++;
    check(stuck.length === 0, `${level.id}: a stuck crate after ${k} moves of the solution`);
  }
}
console.log(`${levels} classic levels, ${states} solution states, none stuck`);

const L = (map: string[]): LevelDef => ({ id: 't', name: 't', world: 'meadow', difficulty: 1, tip: '', map });
const stuckAfter = (map: string[], moves: string) => {
  const level = L(map);
  const g = parseLevel(level);
  const sim = new Sim(level);
  sim.play(moves);
  return stuckCrates(g, crateCells(sim.raw), liveCells(g));
};
// Into a corner.
check(stuckAfter(['#####', '#.  #', '# $ #', '# @ #', '#####'], 'u').length === 0, 'a crate on an open cell is not stuck');
check(stuckAfter(['#####', '#  .#', '#$  #', '#@  #', '#####'], 'u').join() === '0', 'a crate pushed into a corner is stuck');
// Four crates in a square, in the open: none can move (a dead square doesn't see it).
check(stuckAfter(['#######', '#.    #', '# $$  #', '# $$ .#', '#  @ .#', '#.    #', '#######'], '').join() === '0,1,2,3', 'four crates in a square are stuck');
const open = ['#######', '#.    #', '# $$  #', '# $ $@#', '#    .#', '#.   .#', '#######'];
check(stuckAfter(open, '').length === 0 && stuckAfter(open, 'l').join() === '0,1,2,3', 'the square is caught once the fourth crate is pushed in');
// The same pair, both on pads, is fine.
check(stuckAfter(['######', '# .. #', '# $$ #', '# @  #', '######'], 'u').length === 0, 'two crates frozen on pads are fine');
console.log('corner, frozen square, frozen on pads: ok');
