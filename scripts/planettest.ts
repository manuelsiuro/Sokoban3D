/** Planet levels: the cube net's seams, walking and pushing over edges, ice round the planet, the solver. */
import type { LevelDef } from '../src/levels/types';
import { cubeNet } from '../src/sim/cube';
import { parseLevel } from '../src/sim/grid';
import { EVENT, Sim, initialState, step, viewState } from '../src/sim/Sim';
import { solve } from '../src/sim/solver';

const out: string[] = [];
const check = (name: string, ok: boolean) => {
  out.push(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok) process.exitCode = 1;
};
const L = (map: string[], extra: Partial<LevelDef> = {}): LevelDef => ({ id: 't', name: 't', world: 'planet', difficulty: 1, tip: '', map, planet: 3, ...extra });

// The seams: every link is mutual, and the planet has 6N² cells, each with four neighbours.
for (const n of [2, 3, 5]) {
  const net = cubeNet(n);
  let cells = 0;
  let mutual = true;
  for (let c = 0; c < net.w * net.h; c++) {
    if (net.face[c] < 0) continue;
    cells++;
    for (let d = 0; d < 4; d++) {
      const to = net.link[c * 4 + d];
      const a = net.turn[c * 4 + d];
      // Going back the way we came (the opposite of the arrival direction) returns here.
      if (to < 0 || net.face[to] < 0 || net.link[to * 4 + ((a + 2) % 4)] !== c || net.turn[to * 4 + ((a + 2) % 4)] !== (d + 2) % 4) mutual = false;
    }
  }
  check(`N=${n}: ${cells} cells, links mutual`, cells === 6 * n * n && mutual);
  // Walking straight on, from any cell in any direction, comes back after 4N steps, heading the same way.
  let loops = true;
  for (let c = 0; c < net.w * net.h; c++) {
    if (net.face[c] < 0) continue;
    for (let d = 0; d < 4; d++) {
      let cell = c;
      let dir = d;
      for (let k = 0; k < 4 * n; k++) {
        const i = cell * 4 + dir;
        cell = net.link[i];
        dir = net.turn[i];
        if (k < 4 * n - 1 && cell === c) loops = false;
      }
      if (cell !== c || dir !== d) loops = false;
    }
  }
  check(`N=${n}: every straight walk loops in 4N steps`, loops);
}

// A 3-planet: T at columns 3-5 of rows 0-2; L F R B on rows 3-5; D at columns 3-5 of rows 6-8.
const EMPTY = ['            ', '            ', '            ', '            ', '            ', '            ', '            ', '            ', '            '];
const put = (rows: string[], marks: [number, number, string][]) => {
  const m = rows.map((r) => [...r]);
  for (const [x, y, c] of marks) m[y][x] = c;
  return m.map((r) => r.join(''));
};
const NET = put(EMPTY, [...[0, 1, 2].flatMap((y) => [3, 4, 5].map((x) => [x, y, ' '] as [number, number, string]))]);
const W = 12;
const at = (x: number, y: number) => y * W + x;

// Walking up off the front face's top edge lands on the top face's bottom row, still heading up.
{
  const g = parseLevel(L(put(NET, [[4, 3, '@'], [0, 4, '.'], [1, 4, '$']])));
  const b = step(g, initialState(g), 0)!;
  const s = viewState(g, b);
  check('walk F → T over the edge', s.cell === at(4, 2) && s.facing === 0);
  // Walking left off the top face's left edge lands on L's top row, heading down.
  const c = viewState(g, step(g, step(g, b, 3)!, 3)!);
  check('walk T → L turns the heading', c.cell === at(2, 3) && c.facing === 2);
}
// A crate pushed over the edge goes round it: from F's top row onto T, then on up.
{
  const g = parseLevel(L(put(NET, [[4, 4, '@'], [4, 3, '$'], [4, 1, '.']])));
  const b = step(g, initialState(g), 0)!;
  let s = viewState(g, b);
  check('push over an edge', s.crates[0].cell === at(4, 2) && s.cell === at(4, 3) && (s.events & EVENT.push) !== 0);
  s = viewState(g, step(g, b, 0)!);
  check('push on across the top, onto the goal', s.crates[0].cell === at(4, 1) && s.solved);
}
// Pushing a crate from T's left edge onto L: the crate turns with the seam (lands heading down L).
{
  const g = parseLevel(L(put(NET, [[4, 1, '@'], [3, 1, '$'], [1, 4, '.']])));
  const s = viewState(g, step(g, initialState(g), 3)!);
  check('push T → L', s.crates[0].cell === at(1, 3) && s.cell === at(3, 1) && s.facing === 3);
  const t = viewState(g, step(g, step(g, initialState(g), 3)!, 3)!);
  check('push on down L', t.crates[0].cell === at(1, 4) && t.cell === at(1, 3) && t.facing === 2 && t.solved);
}
// Ice round the equator: a crate slides all the way round and stops behind the pusher.
{
  const g = parseLevel(L(put(NET, [[4, 4, '@'], [5, 4, '$'], [4, 1, '.']]), { tiles: ['', '', '', '', '~~~~~~~~~~~~'] }));
  const s = viewState(g, step(g, initialState(g), 1)!);
  check('a slide round the planet stops before the pusher', s.crates[0].cell === at(3, 4) && (s.events & EVENT.slide) !== 0);
}
// Teleporters on opposite faces.
{
  const g = parseLevel(L(put(NET, [[4, 4, '@'], [9, 4, '.'], [7, 4, '$']]), { tiles: ['', '', '', '', '     1   1  '] }));
  const s = viewState(g, step(g, initialState(g), 1)!);
  check('teleport to the far side', s.cell === at(9, 4) && (s.events & EVENT.teleport) !== 0);
}
// Off-planet characters are refused.
{
  let refused = false;
  try {
    parseLevel(L(put(NET, [[4, 4, '@'], [0, 0, '#']])));
  } catch {
    refused = true;
  }
  check('a wall off the planet is refused', refused);
}
// The solver plays the seams: a crate that has to go round a corner.
{
  const level = L(put(NET, [[4, 4, '@'], [4, 6, '$'], [1, 4, '.']]));
  const r = solve(parseLevel(level));
  out.push(`solution ${r.solution} (${r.explored} states)`);
  const sim = new Sim(level);
  check('solution replays and solves', !!r.solution && sim.play(r.solution) === r.solution.length && sim.state.solved);
  check('moves string round-trips', sim.moves === r.solution);
  sim.undo();
  sim.undo();
  sim.redo();
  sim.redo();
  check('undo/redo across seams', sim.state.solved);
}
console.log(out.join('\n'));
