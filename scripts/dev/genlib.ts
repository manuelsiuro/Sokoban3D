/**
 * The room generator behind scripts/dev/generate.ts and scripts/dev/buildworld.ts: random
 * walls, crates, goals and mechanics, solved by the real solver. Only rooms whose optimal
 * solution uses every requested mechanic are kept.
 */
import { parseLevel, TILE } from '../../src/sim/grid';
import { liveCells, solve } from '../../src/sim/solver';
import { EVENT, Sim } from '../../src/sim/Sim';
import { rng } from '../../src/sim/rng';
import type { LevelDef } from '../../src/levels/types';

export const DEFAULTS: Record<string, number> = { crates: 3, w: 6, h: 6, walls: 0.18, ice: 0, pits: 0, lava: 0, doors: 0, conveyors: 0, teleports: 0, gates: 0, colors: 0, terraces: 0, holes: 0, lasers: 0, tries: 500, seed: 1, top: 5, states: 400000 };

export interface Cand { level: LevelDef; par: number; pushes: number; changes: number; states: number; score: number; solution: string }

export function propose(options: Partial<Record<string, number>>): Cand[] {
  const opt = { ...DEFAULTS, ...options } as Record<string, number>;
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
    for (const c of r.solution.toLowerCase()) {
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

const layer = (name: string, rows: string[] | undefined, blank: RegExp) => (rows && rows.some((r) => !blank.test(r)) ? `    ${name}: [\n${rows.map((r) => `      '${r.replaceAll('\\', '\\\\')}',`).join('\n')}\n    ],\n` : '');

/** A level's layers as TypeScript (blank layers left out). */
export function levelSource(l: LevelDef) {
  return `${layer('map', l.map, /^$/)}${layer('heights', l.heights, /^0*$/)}${layer('tiles', l.tiles, /^ *$/)}${layer('kinds', l.kinds, /^ *$/)}`;
}
