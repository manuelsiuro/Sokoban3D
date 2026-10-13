/** Pull rules: crates can't be pushed, a step away drags the crate behind, the solver plays both. */
import type { LevelDef } from '../src/levels/types';
import { parseLevel } from '../src/sim/grid';
import { EVENT, Sim, initialState, step, viewState } from '../src/sim/Sim';
import { solve } from '../src/sim/solver';

const L = (map: string[], extra: Partial<LevelDef> = {}): LevelDef => ({ id: 't', name: 't', world: 'meadow', difficulty: 1, tip: '', map, rules: 'pull', ...extra });
const out: string[] = [];
const check = (name: string, ok: boolean) => {
  out.push(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
};

// Crate to the left of the pusher: walking into it is blocked under pull rules.
{
  const g = parseLevel(L(['######', '#.$@ #', '######']));
  const b = initialState(g);
  check('no push on a pull level', step(g, b, 3) === null);
  // Stepping right while pulling (input 1 + 4) drags it along.
  const n = step(g, b, 5)!;
  const s = viewState(g, n);
  check('a pull moves pusher and crate', s.cell === 4 + 6 && s.crates[0].cell === 3 + 6 && (s.events & EVENT.pull) !== 0);
  check('pulling faces the crate', s.facing === 3);
  check('a pull with nothing behind is blocked', step(g, n, 6) === null);
  // The same level under push rules: the push works, and pull inputs don't.
  const p = parseLevel(L(['######', '#.$@ #', '######'], { rules: undefined }));
  check('push rules: push works', step(p, initialState(p), 3) !== null);
  check('push rules: no pull input', step(p, initialState(p), 5) === null);
}
// A room solved by pulling: the solution replays (uppercase = pulls) and solves it.
{
  const level = L(['########', '#      #', '# . $ @#', '########']);
  const g = parseLevel(level);
  const r = solve(g);
  out.push(`solution ${r.solution} (${r.explored} states)`);
  const sim = new Sim(level);
  check('solution replays and solves', !!r.solution && sim.play(r.solution) === r.solution.length && sim.state.solved);
  check('moves string round-trips', sim.moves === r.solution);
}
console.log(out.join('\n'));
