/**
 * Proposes classic rooms: random walls, crates and goals, solved by the real solver, ranked
 * by how much they ask (pushes, crate changes, search size). A starting point for hand
 * curation, not finished levels.
 *   npx tsx scripts/dev/generate.ts <crates> <width> <height> [tries] [seed]
 */
import { parseLevel } from '../../src/sim/grid';
import { liveCells, solve } from '../../src/sim/solver';
import { Sim } from '../../src/sim/Sim';
import { rng } from '../../src/sim/rng';

const [k = 3, W = 6, H = 6, tries = 400, seed = 1] = process.argv.slice(2).map(Number);
const R = rng(seed);
interface Cand { map: string[]; par: number; pushes: number; changes: number; states: number; score: number; solution: string }
const out: Cand[] = [];
for (let t = 0; t < tries; t++) {
  const rows: string[][] = [];
  for (let y = 0; y < H + 2; y++) rows.push([...Array(W + 2)].map((_, x) => (x === 0 || y === 0 || x === W + 1 || y === H + 1 ? '#' : R.next() < 0.18 ? '#' : ' ')));
  const free: [number, number][] = [];
  for (let y = 1; y <= H; y++) for (let x = 1; x <= W; x++) if (rows[y][x] === ' ') free.push([x, y]);
  if (free.length < 2 * k + 6) continue;
  const take = () => free.splice(R.int(free.length), 1)[0];
  const goals = [...Array(k)].map(take);
  for (const [x, y] of goals) rows[y][x] = '.';
  const p = take();
  rows[p[1]][p[0]] = '@';
  // Crates only on live squares, so the room isn't trivially dead.
  let probe;
  try {
    probe = parseLevel({ id: 'g', name: 'g', world: 'g', difficulty: 1, tip: '', map: rows.map((r) => r.join('').replaceAll('.', '*')) });
  } catch {
    continue; // a goal walled off from the player
  }
  const live = liveCells(probe);
  const ok = free.filter(([x, y]) => live[y * probe.w + x]);
  if (ok.length < k) continue;
  for (let i = 0; i < k; i++) {
    const [x, y] = ok.splice(R.int(ok.length), 1)[0];
    rows[y][x] = '$';
  }
  const map = rows.map((r) => r.join(''));
  let g;
  try {
    g = parseLevel({ id: 'g', name: 'g', world: 'g', difficulty: 1, tip: '', map });
  } catch {
    continue;
  }
  const r = solve(g, { maxStates: 400_000 });
  if (!r.solution) continue;
  // Crate changes: how often the solution switches to pushing another crate.
  const sim = new Sim({ id: 'g', name: 'g', world: 'g', difficulty: 1, tip: '', map });
  let changes = 0;
  let last = -1;
  for (const c of r.solution.toLowerCase()) {
    sim.play(c);
    const s = sim.state;
    if (s.pushed >= 0 && s.pushed !== last) {
      changes++;
      last = s.pushed;
    }
  }
  const pushes = [...r.solution].filter((c) => c >= 'A' && c <= 'Z').length;
  out.push({ map, par: r.solution.length, pushes, changes, states: r.explored, solution: r.solution, score: pushes + changes * 3 + Math.log2(r.explored) * 2 });
}
out.sort((a, b) => b.score - a.score);
for (const c of out.slice(0, 8)) {
  console.log(`score ${c.score.toFixed(1)} par ${c.par} pushes ${c.pushes} changes ${c.changes} states ${c.states}`);
  console.log(c.map.join('\n'));
  console.log(c.solution + '\n');
}
