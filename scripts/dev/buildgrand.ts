/**
 * Builds each world's Grand Island: four generated rooms of the world's mechanics in a 2×2
 * block, joined by doorways in a loop (top-left → top-right → bottom-right → bottom-left).
 * Its solution is each room's optimal solution with the walks between them, replayed
 * through the real rules to prove it; that length is the "best known" par (a shorter one
 * may exist: the whole island is too big to search). Writes src/levels/grand.ts.
 *   npx tsx scripts/dev/buildgrand.ts [world ...]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { LevelDef } from '../../src/levels/types';
import { propose, type Cand } from '../../src/sim/generator';
import { DIRS, parseLevel } from '../../src/sim/grid';
import { initialState, inputOf, isSolved, step, viewState } from '../../src/sim/Sim';
import { walkTo } from '../../src/game/path';
import { levelSource } from './genlib';

interface Spec {
  name: string;
  tip: string;
  /** The four rooms' generator options (each 6×5 inside). */
  rooms: Record<string, number>[];
  par: [number, number];
}
const W = 6;
const H = 5;
const SPECS: Record<string, Spec> = {
  meadow: { name: 'The Grand Farm', tip: 'Four fields in one: finish each before you go on through the gap.', par: [14, 40], rooms: [{ crates: 2 }, { crates: 2 }, { crates: 3 }, { crates: 3 }] },
  tundra: { name: 'The Frozen Fortress', tip: 'Four halls of ice. Mind the doorways: a slide can carry a crate right through.', par: [12, 40], rooms: [{ crates: 2, ice: 0.35 }, { crates: 2, ice: 0.4 }, { crates: 2, ice: 0.3 }, { crates: 3, ice: 0.3 }] },
  desert: { name: 'The Sunken Temple', tip: 'Every chamber has its own plates and doors.', par: [12, 40], rooms: [{ crates: 2, pits: 1 }, { crates: 2, doors: 1 }, { crates: 2, pits: 1, doors: 1 }, { crates: 2, pits: 2 }] },
  sky: { name: 'The Cloud Citadel', tip: 'Four terraces: climb, drop and stack your way across.', par: [10, 40], rooms: [{ crates: 2, terraces: 1 }, { crates: 2, terraces: 2, walls: 0.1 }, { crates: 2, terraces: 2 }, { crates: 2, terraces: 2, holes: 1 }] },
  forge: { name: 'The Great Foundry', tip: 'Belts and lava pools, chamber after chamber.', par: [10, 40], rooms: [{ crates: 2, conveyors: 3 }, { crates: 2, lava: 1 }, { crates: 2, conveyors: 3, lava: 1 }, { crates: 2, conveyors: 4 }] },
  crystal: { name: 'The Prism Vault', tip: 'Colors, then light: one vault at a time.', par: [10, 40], rooms: [{ crates: 3, colors: 3 }, { crates: 1, lasers: 1 }, { crates: 3, colors: 2 }, { crates: 2, lasers: 1 }] },
  clockwork: { name: 'The Great Clock', tip: 'The gates count every step you take between the rooms too.', par: [10, 40], rooms: [{ crates: 2, gates: 2 }, { crates: 2, teleports: 1 }, { crates: 2, gates: 2 }, { crates: 2, gates: 1, teleports: 1 }] },
  reverse: { name: 'The Mirror Maze', tip: 'Four gardens to pull your way through.', par: [10, 36], rooms: [{ crates: 1, pull: 1 }, { crates: 2, pull: 1 }, { crates: 2, pull: 1 }, { crates: 2, pull: 1 }] },
};
// Room k sits at (col, row) of the block; doorways join k and k+1.
const AT = [[0, 0], [1, 0], [1, 1], [0, 1]];

const cacheFile = new URL('./.buildcache/grand.json', import.meta.url);
const cache: Record<string, Cand> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};

function room(world: string, k: number, spec: Spec): Cand {
  const key = JSON.stringify({ world, k, gen: spec.rooms[k], par: spec.par });
  if (cache[key]) return cache[key];
  for (let round = 0; round < 30; round++) {
    const cands = propose({ tries: 300, w: W, h: H, ...spec.rooms[k], seed: 90000 + k * 1000 + round * 7 + world.length * 131 });
    const c = cands.find((x) => x.par >= spec.par[0] && x.par <= spec.par[1]);
    if (c) {
      cache[key] = c;
      mkdirSync(new URL('./.buildcache/', import.meta.url), { recursive: true });
      writeFileSync(cacheFile, JSON.stringify(cache));
      return c;
    }
  }
  throw new Error(`${world}: no room ${k + 1}`);
}

/**
 * A room mirrored left-right (`h`) and/or top-bottom (`v`), with its solution: directions,
 * belts, emitters and mirrors flip with it.
 */
const SWAP_H: Record<string, string> = { '<': '>', '>': '<', E: 'W', W: 'E' };
const SWAP_V: Record<string, string> = { '^': 'v', v: '^', N: 'S', S: 'N' };
function flip(c: Cand, h: boolean, v: boolean): { level: LevelDef; solution: string } {
  const sw = (str: string, table: Record<string, string>) => [...str].map((ch) => table[ch] ?? ch).join('');
  // Crate kinds are color letters (r g b y) and mirrors: only the mirrors turn.
  const MIRRORS = { '/': '\\', '\\': '/' };
  const layer = (rows: string[] | undefined, mirrorable: boolean) => {
    if (!rows) return rows;
    let out = rows.map((r) => r.padEnd(W + 2, ' '));
    if (v) out = [...out].reverse().map((r) => (mirrorable ? sw(r, MIRRORS) : r));
    if (h) out = out.map((r) => [...r].reverse().join('')).map((r) => (mirrorable ? sw(r, MIRRORS) : r));
    return out;
  };
  const l = c.level;
  let solution = c.solution;
  if (h) solution = sw(solution, { l: 'r', r: 'l', L: 'R', R: 'L' });
  if (v) solution = sw(solution, { u: 'd', d: 'u', U: 'D', D: 'U' });
  // Plates, doors and receivers (p q r P Q R x y z) are tile letters too: only belts and emitters turn.
  const tileTurn = (rows: string[] | undefined) => {
    if (!rows) return rows;
    let out = rows.map((r) => r.padEnd(W + 2, ' '));
    const only = (t: Record<string, string>) => Object.fromEntries(Object.entries(t).filter(([k]) => '<>^vNSEW'.includes(k)));
    if (v) out = [...out].reverse().map((r) => sw(r, only(SWAP_V)));
    if (h) out = out.map((r) => [...r].reverse().join('')).map((r) => sw(r, only(SWAP_H)));
    return out;
  };
  return { level: { ...l, map: layer(l.map, false)!, heights: layer(l.heights, false), tiles: tileTurn(l.tiles), kinds: layer(l.kinds, true) }, solution };
}

const layerOf = (l: LevelDef, name: 'map' | 'tiles' | 'kinds' | 'heights', x: number, y: number) => (l[name]?.[y]?.[x] ?? (name === 'heights' ? '0' : ' '));

/** Channels and teleporter pairs per room, so rooms don't open each other's doors. */
function remap(c: string, k: number, pairs: Map<string, string>): string {
  const ch = 'pqr'.indexOf(c.toLowerCase());
  if ('pqrPQR'.includes(c)) {
    const shifted = 'pqr'[(ch + k) % 3];
    return c === c.toUpperCase() ? shifted.toUpperCase() : shifted;
  }
  if ('xyz'.includes(c)) return 'xyz'[('xyz'.indexOf(c) + k) % 3];
  if ('1234'.includes(c)) {
    const id = `${k}:${c}`;
    if (!pairs.has(id)) pairs.set(id, String(pairs.size + 1));
    return pairs.get(id)!;
  }
  return c;
}

/** The block, with doorways at the given offsets along each shared wall. */
function compose(world: string, spec: Spec, rooms: LevelDef[], doors: number[]): { level: LevelDef; starts: number[] } | null {
  const RW = W + 2;
  const RH = H + 2;
  const TW = RW * 2 - 1;
  const TH = RH * 2 - 1;
  const layers = { map: [] as string[][], tiles: [] as string[][], kinds: [] as string[][], heights: [] as string[][] };
  for (const name of Object.keys(layers) as (keyof typeof layers)[]) for (let y = 0; y < TH; y++) layers[name].push(Array(TW).fill(name === 'map' ? '#' : name === 'heights' ? '0' : ' '));
  const pairs = new Map<string, string>();
  const starts: number[] = [];
  rooms.forEach((r, k) => {
    const [cx, cy] = AT[k];
    const ox = cx * (RW - 1);
    const oy = cy * (RH - 1);
    for (let y = 0; y < RH; y++)
      for (let x = 0; x < RW; x++) {
        let m = layerOf(r, 'map', x, y);
        if (m === '#' && layers.map[oy + y][ox + x] !== '#') continue;
        if (m === '@' || m === '+') {
          starts.push((oy + y) * TW + ox + x);
          if (k > 0) m = m === '+' ? '.' : ' ';
        }
        layers.map[oy + y][ox + x] = m;
        layers.tiles[oy + y][ox + x] = remap(layerOf(r, 'tiles', x, y), k, pairs);
        layers.kinds[oy + y][ox + x] = layerOf(r, 'kinds', x, y);
        layers.heights[oy + y][ox + x] = layerOf(r, 'heights', x, y);
      }
  });
  if (pairs.size > 4) return null;
  // Doorways: 0→1 in the top shared column, 1→2 in the right shared row, 2→3 in the bottom shared column.
  const cells = [
    [RW - 1, 1 + doors[0]],
    [RW - 1 + 1 + doors[1], RH - 1],
    [RW - 1, RH - 1 + 1 + doors[2]],
  ];
  for (const [x, y] of cells) {
    const across = x === RW - 1 ? [[x - 1, y], [x + 1, y]] : [[x, y - 1], [x, y + 1]];
    const sides = across.map(([ax, ay]) => ({ m: layers.map[ay][ax], t: layers.tiles[ay][ax], h: layers.heights[ay][ax] }));
    // Plain, level floor on both sides (no crate, goal, wall or mechanic in the doorway's way).
    if (sides.some((s) => s.m !== ' ' || s.t !== ' ') || sides[0].h !== sides[1].h) return null;
    layers.map[y][x] = ' ';
    layers.heights[y][x] = sides[0].h;
  }
  const level: LevelDef = {
    id: `${world}-grand`,
    name: spec.name,
    world,
    difficulty: 5,
    tip: spec.tip,
    map: layers.map.map((r) => r.join('')),
    tiles: layers.tiles.map((r) => r.join('')),
    kinds: layers.kinds.map((r) => r.join('')),
    heights: layers.heights.map((r) => r.join('')),
    ...(spec.rooms[0].pull ? { rules: 'pull' as const } : {}),
  };
  return { level, starts };
}

/** Plays the rooms' solutions with the walks between; the whole solution, or null if it breaks. */
function solveGrand(level: LevelDef, starts: number[], sols: string[]): string | null {
  const g = parseLevel(level);
  let b = initialState(g);
  let out = '';
  for (let k = 0; k < sols.length; k++) {
    if (k > 0) {
      // Walk to the next room's start, arriving on an even move count when gates count moves.
      const path = walkTo(g, b, starts[k], 20000, g.gates ? 0 : -1);
      if (!path) return null;
      for (const d of path) {
        b = step(g, b, d)!;
        out += DIRS[d];
      }
    }
    for (const c of sols[k]) {
      const next = step(g, b, inputOf(g, c));
      if (!next) return null;
      b = next;
      out += c;
    }
  }
  return isSolved(b) ? out : null;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const DEBUG = process.argv.includes("--debug");
const done: Record<string, { level: LevelDef; solution: string }> = {};
const prevFile = new URL('../../src/levels/grand.ts', import.meta.url);
for (const [world, spec] of Object.entries(SPECS)) {
  if (only.length && !only.includes(world)) continue;
  const t0 = Date.now();
  const cands = spec.rooms.map((_, k) => room(world, k, spec));
  let made: { level: LevelDef; solution: string } | null = null;
  // Each room in any of its four mirrorings, the doorways anywhere along their walls.
  let composed = 0;
  for (let o = 0; o < 256 && !made; o++) {
    const rooms = cands.map((c, k) => flip(c, ((o >> (k * 2)) & 1) === 1, ((o >> (k * 2 + 1)) & 1) === 1));
    for (let tries = 0; tries < H * W * H && !made; tries++) {
      const doors = [tries % H, Math.floor(tries / H) % W, Math.floor(tries / (H * W)) % H];
      const c = compose(world, spec, rooms.map((x) => x.level), doors);
      if (!c) continue;
      composed++;
      const sol = solveGrand(c.level, c.starts, rooms.map((x) => x.solution));
      if (sol) made = { level: c.level, solution: sol };
    }
  }
  if (DEBUG) console.error(`${world}: ${composed} layouts joined`);
  if (!made) throw new Error(`${world}: the rooms don't join`);
  // The proof: a fresh replay of the solution solves the island.
  const g = parseLevel(made.level);
  let b = initialState(g);
  for (const ch of made.solution) b = step(g, b, inputOf(g, ch))!;
  if (!isSolved(b) || viewState(g, b).moves !== made.solution.length) throw new Error(`${world}: replay failed`);
  done[world] = made;
  console.error(`${world.padEnd(10)} ${made.level.name.padEnd(22)} best known ${String(made.solution.length).padStart(3)}  ${Date.now() - t0}ms`);
}
// Keep the worlds not rebuilt this time.
if (only.length && existsSync(prevFile)) {
  const old = await import(prevFile.href);
  for (const l of old.GRANDS as LevelDef[]) if (!done[l.world]) done[l.world] = { level: l, solution: old.GRAND_SOLUTIONS[l.id] };
}
const order = Object.keys(SPECS).filter((w) => done[w]);
writeFileSync(
  prevFile,
  `import type { LevelDef } from './types';

// Built by scripts/dev/buildgrand.ts — do not edit. Each world's Grand Island: four rooms
// joined by doorways. Its solution chains the rooms' optimal solutions (proven by replay);
// its length is the best known par, not a proven fewest (parProof: 'bound').
export const GRANDS: LevelDef[] = [
${order
  .map(
    (w) => `  {
    id: '${w}-grand',
    name: ${JSON.stringify(done[w].level.name)},
    world: '${w}',
    difficulty: 5,
    tip: ${JSON.stringify(done[w].level.tip)},
    parProof: 'bound',
${levelSource(done[w].level)}  },`,
  )
  .join('\n')}
];

export const GRAND_SOLUTIONS: Record<string, string> = {
${order.map((w) => `  '${w}-grand': '${done[w].solution}',`).join('\n')}
};
`,
);
