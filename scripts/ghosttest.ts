/** Ghosts: every level's solution replays as a ghost path that ends solved; broken runs are not shown. */
import { LEVELS } from '../src/levels/levels';
import { PLANET } from '../src/levels/worlds/planet';
import { SOLUTIONS } from '../src/levels/solutions';
import { ghostPath, runSolves } from '../src/game/ghost';
import { check } from './assert';

let steps = 0;
for (const l of [...LEVELS, ...PLANET]) {
  const run = SOLUTIONS[l.id];
  if (!run) continue;
  const path = ghostPath(l, run);
  check(path.length === run.length + 1, `${l.id}: the ghost walks the whole run`);
  check(runSolves(l, run), `${l.id}: the run solves the level`);
  check(JSON.stringify(path) === JSON.stringify(ghostPath(l, run)), `${l.id}: the same path every time`);
  steps += path.length;
}
check(!runSolves(LEVELS[0], 'r'), 'a run that stops short is not a solve');
check(ghostPath(LEVELS[0], 'lllll').length === 1, 'blocked moves end the ghost path');
console.log(`${LEVELS.length + PLANET.length} ghost paths, ${steps} steps`);
