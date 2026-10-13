/**
 * The room generator (the daily puzzle, scripts/dev/generate.ts, scripts/dev/buildworld.ts):
 * random walls, crates, goals and mechanics, solved by the real solver. Only rooms whose
 * optimal solution uses every requested mechanic are kept. `pull: 1` makes pull-rule rooms.
 */
import { cubeNet } from './cube';
import { parseLevel, TILE } from './grid';
import { liveCells, solve } from './solver';
import { EVENT, Sim } from './Sim';
import { rng } from './rng';
import type { LevelDef } from '../levels/types';

export const DEFAULTS: Record<string, number> = { crates: 3, w: 6, h: 6, walls: 0.18, ice: 0, pits: 0, lava: 0, doors: 0, conveyors: 0, teleports: 0, gates: 0, colors: 0, terraces: 0, holes: 0, lasers: 0, pull: 0, planet: 0, seams: 0, tries: 500, seed: 1, top: 5, states: 400000 };

export interface Cand { level: LevelDef; par: number; pushes: number; changes: number; states: number; score: number; solution: string }

export function propose(options: Partial<Record<string, number>>): Cand[] {
  const opt = { ...DEFAULTS, ...options } as Record<string, number>;
  if (opt.planet) return proposePlanet(opt);
  const R = rng(opt.seed);
  const W = opt.w + 2;
  const H = opt.h + 2;
  const DIRCH = '^>v<';
  const out: Cand[] = [];
  for (let t = 0; t < opt.tries; t++) {
    const map: string[][] = [];
    const tiles: string[][] = [];
    const kinds: string[][] = [];
    const heights: string[][] = [];
    for (let y = 0; y < H; y++) {
      map.push([...Array(W)].map((_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? '#' : R.next() < opt.walls ? '#' : ' ')));
      tiles.push(Array(W).fill(' '));
      kinds.push(Array(W).fill(' '));
      heights.push(Array(W).fill('0'));
    }
    const free: [number, number][] = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (map[y][x] === ' ') free.push([x, y]);
    if (free.length < 2 * opt.crates + 8) continue;
    const take = () => free.splice(R.int(free.length), 1)[0];
    // Terraces: a raised block of the room, one level up.
    if (opt.terraces) {
      for (let n = 0; n < opt.terraces; n++) {
        const x0 = 1 + R.int(W - 3);
        const y0 = 1 + R.int(H - 3);
        const w = 2 + R.int(3);
        const h = 2 + R.int(3);
        for (let y = y0; y < Math.min(H - 1, y0 + h); y++) for (let x = x0; x < Math.min(W - 1, x0 + w); x++) heights[y][x] = String(Math.min(2, Number(heights[y][x]) + 1));
      }
    }
    // Mechanics on free cells (none of them under a crate, goal or the player).
    const place = (ch: string) => {
      const [x, y] = take();
      tiles[y][x] = ch;
      return [x, y];
    };
    if (opt.ice) {
      const n = Math.round(free.length * opt.ice);
      // Ice in patches: grow from a few seeds.
      const seeds = [take(), take()];
      for (const [x, y] of seeds) tiles[y][x] = '~';
      for (let k = 0; k < n * 3 && free.length > 2 * opt.crates + 4; k++) {
        const [sx, sy] = R.pick(seeds);
        const x = sx + R.int(3) - 1;
        const y = sy + R.int(3) - 1;
        const i = free.findIndex(([fx, fy]) => fx === x && fy === y);
        if (i < 0) continue;
        free.splice(i, 1);
        tiles[y][x] = '~';
        seeds.push([x, y]);
        if (seeds.length > n) break;
      }
    }
    for (let k = 0; k < opt.pits; k++) place('o');
    for (let k = 0; k < opt.lava; k++) place('L');
    for (let k = 0; k < opt.doors; k++) {
      place('pqr'[k]);
      place('PQR'[k]);
    }
    for (let k = 0; k < opt.conveyors; k++) place(DIRCH[R.int(4)]);
    for (let k = 0; k < opt.teleports; k++) {
      place(String(k + 1));
      place(String(k + 1));
    }
    for (let k = 0; k < opt.gates; k++) place(k % 2 ? 'G' : 'g');
    for (let k = 0; k < opt.holes; k++) {
      const [x, y] = take();
      map[y][x] = ',';
    }
    for (let k = 0; k < opt.lasers; k++) {
      place('NESW'[R.int(4)]);
      place('xyz'[k]);
    }
    const goals = opt.crates;
    // Pits and lava swallow a crate each; a door's plate needs one to hold it; a laser needs a mirror.
    const extra = opt.pits + opt.lava + opt.doors + opt.lasers;
    const goalCells = [...Array(goals)].map(take);
    for (const [x, y] of goalCells) map[y][x] = '.';
    const p = take();
    map[p[1]][p[0]] = '@';
    const level = (): LevelDef => ({
      id: 'gen',
      name: 'gen',
      world: 'gen',
      difficulty: 1,
      tip: '',
      map: map.map((r) => r.join('')),
      tiles: tiles.map((r) => r.join('')),
      kinds: kinds.map((r) => r.join('')),
      heights: heights.map((r) => r.join('')),
      ...(opt.pull ? { rules: 'pull' as const } : {}),
    });
    // Crates: on squares a crate can still be pushed from (on classic rooms).
    let live: Uint8Array | null = null;
    try {
      const probe = level();
      probe.map = probe.map.map((r) => r.replaceAll('.', '*'));
      const g = parseLevel(probe);
      if (g.classic) live = liveCells(g);
    } catch {
      continue;
    }
    const ok = free.filter(([x, y]) => !live || live[y * W + x]);
    if (ok.length < goals + extra) continue;
    const crates: [number, number][] = [];
    for (let i = 0; i < goals + extra; i++) {
      const c = ok.splice(R.int(ok.length), 1)[0];
      map[c[1]][c[0]] = '$';
      crates.push(c);
    }
    for (let i = 0; i < opt.lasers; i++) {
      const [x, y] = crates[crates.length - 1 - i];
      kinds[y][x] = R.next() < 0.5 ? '/' : '\\';
    }
    for (let i = 0; i < opt.colors && i < goals; i++) {
      const color = 'rgby'[i % 4];
      kinds[goalCells[i][1]][goalCells[i][0]] = color;
      kinds[crates[i][1]][crates[i][0]] = color;
    }
    const L = level();
    let g;
    try {
      g = parseLevel(L);
    } catch {
      continue;
    }
    const r = solve(g, { maxStates: opt.states });
    if (!r.solution || r.solution.length < 6) continue;
    // Replay: crate changes, and which mechanics the solution uses.
    const sim = new Sim(L);
    let changes = 0;
    let last = -1;
    let used = 0;
    let throughGate = false;
    let throughDoor = false;
    // Case matters: on pull rooms uppercase letters are pulls.
    for (const c of r.solution) {
      sim.play(c);
      const s = sim.state;
      used |= s.events;
      const tl = g.tile[s.cell];
      if (tl === TILE.gateEven || tl === TILE.gateOdd) throughGate = true;
      if (tl === TILE.door || s.crates.some((k) => k.cell >= 0 && g.tile[k.cell] === TILE.door)) throughDoor = true;
      if (s.pushed >= 0 && s.pushed !== last) {
        changes++;
        last = s.pushed;
      }
    }
    if (opt.ice && !(used & EVENT.slide)) continue;
    if ((opt.pits || opt.lava) && !(used & EVENT.fill)) continue;
    if (opt.doors && !throughDoor) continue;
    if (opt.conveyors && !(used & EVENT.convey)) continue;
    if (opt.teleports && !(used & EVENT.teleport)) continue;
    if (opt.gates && !throughGate) continue;
    if (opt.terraces && !(used & (EVENT.climb | EVENT.fall))) continue;
    // A laser must start dark, so the mirror has to be moved.
    if (opt.lasers && new Sim(L).state.world.lit.length > 0) continue;
    const pushes = [...r.solution].filter((c) => c >= 'A' && c <= 'Z').length;
    out.push({ level: L, par: r.solution.length, pushes, changes, states: r.explored, solution: r.solution, score: pushes + changes * 3 + Math.log2(r.explored) * 2 });
  }

  return out.sort((a, b) => b.score - a.score);
}

/**
 * Planet rooms (`planet: N`): walls, crates and goals on the surface of an N-cube (its net,
 * cube.ts). Cells the player can't reach are walled in. `seams: n` keeps only rooms whose
 * solution pushes crates over an edge at least n times. Ice, pits, lava, teleporters and
 * colors as in propose().
 */
function proposePlanet(opt: Record<string, number>): Cand[] {
  const R = rng(opt.seed);
  const net = cubeNet(opt.planet);
  const { w, h } = net;
  const out: Cand[] = [];
  const surface = [...net.face.keys()].filter((i) => net.face[i] >= 0);
  for (let t = 0; t < opt.tries; t++) {
    const map: string[] = [...Array(w * h)].map((_, i) => (net.face[i] >= 0 && R.next() < opt.walls ? '#' : ' '));
    const tiles: string[] = Array(w * h).fill(' ');
    const kinds: string[] = Array(w * h).fill(' ');
    const open = surface.filter((i) => map[i] === ' ');
    if (open.length < 2 * opt.crates + 8) continue;
    // The player first; every cell it can't reach becomes rock.
    const p = open[R.int(open.length)];
    const reach = new Set([p]);
    for (const todo = [p]; todo.length; ) {
      const c = todo.pop()!;
      for (let d = 0; d < 4; d++) {
        const n = net.link[c * 4 + d];
        if (map[n] === ' ' && !reach.has(n)) {
          reach.add(n);
          todo.push(n);
        }
      }
    }
    for (const i of open) if (!reach.has(i)) map[i] = '#';
    const free = open.filter((i) => reach.has(i) && i !== p);
    if (free.length < 2 * opt.crates + 8) continue;
    map[p] = '@';
    const take = () => free.splice(R.int(free.length), 1)[0];
    if (opt.ice) {
      // Ice in patches, grown across the seams.
      const want = Math.round(free.length * opt.ice);
      const seeds = [take(), take()];
      for (const c of seeds) tiles[c] = '~';
      for (let k = 0; k < want * 4 && seeds.length < want && free.length > 2 * opt.crates + 4; k++) {
        const n = net.link[R.pick(seeds) * 4 + R.int(4)];
        const i = free.indexOf(n);
        if (i < 0) continue;
        free.splice(i, 1);
        tiles[n] = '~';
        seeds.push(n);
      }
    }
    for (let k = 0; k < opt.pits; k++) tiles[take()] = 'o';
    for (let k = 0; k < opt.lava; k++) tiles[take()] = 'L';
    for (let k = 0; k < opt.teleports; k++) {
      // A pair on two different faces.
      const a = take();
      const others = free.filter((c) => net.face[c] !== net.face[a]);
      if (!others.length) continue;
      const b = others[R.int(others.length)];
      free.splice(free.indexOf(b), 1);
      tiles[a] = tiles[b] = String(k + 1);
    }
    const goalCells = [...Array(opt.crates)].map(take);
    for (const c of goalCells) map[c] = '.';
    const rows = (a: string[]) => [...Array(h)].map((_, y) => a.slice(y * w, y * w + w).join('').trimEnd());
    const level = (): LevelDef => ({ id: 'gen', name: 'gen', world: 'gen', difficulty: 1, tip: '', planet: opt.planet, map: rows(map), tiles: rows(tiles), kinds: rows(kinds) });
    let live: Uint8Array | null = null;
    try {
      const probe = level();
      probe.map = probe.map.map((r) => r.replaceAll('.', '*'));
      const g = parseLevel(probe);
      if (g.classic) live = liveCells(g);
    } catch {
      continue;
    }
    const extra = opt.pits + opt.lava;
    const ok = free.filter((c) => !live || live[c]);
    if (ok.length < opt.crates + extra) continue;
    const crates: number[] = [];
    for (let i = 0; i < opt.crates + extra; i++) {
      const c = ok.splice(R.int(ok.length), 1)[0];
      map[c] = '$';
      crates.push(c);
    }
    for (let i = 0; i < opt.colors && i < opt.crates; i++) kinds[goalCells[i]] = kinds[crates[i]] = 'rgby'[i % 4];
    const L = level();
    let g;
    try {
      g = parseLevel(L);
    } catch {
      continue;
    }
    const r = solve(g, { maxStates: opt.states });
    if (!r.solution || r.solution.length < 6) continue;
    const sim = new Sim(L);
    let changes = 0;
    let last = -1;
    let used = 0;
    let seams = 0;
    const faces = new Set<number>();
    for (const c of r.solution) {
      const before = sim.state.crates.map((k) => k.cell);
      sim.play(c);
      const s = sim.state;
      used |= s.events;
      faces.add(net.face[s.cell]);
      s.crates.forEach((k, i) => {
        if (k.cell >= 0 && before[i] >= 0 && net.face[k.cell] !== net.face[before[i]]) seams++;
      });
      if (s.pushed >= 0 && s.pushed !== last) {
        changes++;
        last = s.pushed;
      }
    }
    if (seams < opt.seams) continue;
    if (opt.ice && !(used & EVENT.slide)) continue;
    if ((opt.pits || opt.lava) && !(used & EVENT.fill)) continue;
    if (opt.teleports && !(used & EVENT.teleport)) continue;
    const pushes = [...r.solution].filter((c) => c >= 'A' && c <= 'Z').length;
    // Rooms that send the player round the planet and crates over its edges score higher.
    out.push({ level: L, par: r.solution.length, pushes, changes, states: r.explored, solution: r.solution, score: pushes + changes * 3 + seams * 3 + faces.size * 2 + Math.log2(r.explored) * 2 });
  }
  return out.sort((a, b) => b.score - a.score);
}
