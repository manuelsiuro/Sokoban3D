/** The daily puzzle: a week of dates each give a solvable puzzle (the snapshot proves it's the same on every run). */
import { dailyPuzzle, dayNumber } from '../src/game/daily';
import { Sim } from '../src/sim/Sim';
import { check } from './assert';

check(dayNumber('1970-01-02') === 1 && dayNumber('2026-10-12') === 20738, 'day numbers');
for (let d = 0; d < 7; d++) {
  const date = new Date(Date.UTC(2026, 9, 11 + d)).toISOString().slice(0, 10);
  const a = dailyPuzzle(date);
  const sim = new Sim(a.level);
  check(!sim.state.solved, `${date}: not solved at the start`);
  check(sim.play(a.solution) === a.par && sim.state.solved, `${date}: its solution solves it`);
  console.log(`${date} ${a.level.name.padEnd(20)} par ${String(a.par).padStart(3)} ${a.level.map.join('/')}`);
}
