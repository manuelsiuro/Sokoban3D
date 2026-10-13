import { propose } from '../sim/generator';
import type { Floor } from './expedition';

/**
 * Expedition floors, from the run's seed and the depth (deterministic): every three floors
 * the next world's mechanic, rooms growing and gaining crates deeper down. Built in the
 * worker (the generator solves every room it proposes).
 */
const BIOMES: { world: string; gen: Record<string, number> }[] = [
  { world: 'meadow', gen: {} },
  { world: 'tundra', gen: { ice: 0.35 } },
  { world: 'desert', gen: { pits: 1, doors: 1 } },
  { world: 'sky', gen: { terraces: 2, walls: 0.1 } },
  { world: 'forge', gen: { conveyors: 3, lava: 1 } },
  { world: 'crystal', gen: { colors: 3 } },
  { world: 'clockwork', gen: { gates: 2, teleports: 1 } },
];
const FLOORS_PER_WORLD = 3;

/** What a floor at a depth is made of: its world, room size, crates and a fair par window. */
export function recipe(depth: number) {
  const b = BIOMES[Math.floor(depth / FLOORS_PER_WORLD) % BIOMES.length];
  const lap = Math.floor(depth / (FLOORS_PER_WORLD * BIOMES.length));
  const size = 5 + Math.min(2, Math.floor(depth / 6));
  // Two crates at first and three from the second world (colors always three; lava and
  // teleporters stay at two, they're busy enough); one more on every lap after the first.
  const base = b.gen.colors ? 3 : b.gen.lava || b.gen.teleports || depth < FLOORS_PER_WORLD ? 2 : 3;
  const crates = Math.min(4, base + (lap > 0 ? 1 : 0));
  const lo = Math.min(30, 6 + depth * 1.5);
  const hi = Math.min(90, 22 + depth * 3);
  return { world: b.world, gen: { crates, w: size, h: size, ...b.gen }, par: [Math.round(lo), Math.round(hi)] as [number, number] };
}

/** The generator's seed for one try at a floor: the run's seed mixed (so runs never share floors), then the depth and try. */
const floorSeed = (seed: number, depth: number, round: number) => (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ (depth * 4 + round)) >>> 0;

/** The floor at `depth` of the run `seed` (deterministic). Null if none could be made. */
export function expeditionFloor(seed: number, depth: number): Floor | null {
  const r = recipe(depth);
  let fallback: Floor | null = null;
  for (let round = 0; round < 4; round++) {
    const cands = propose({ tries: 120, states: 120000, ...r.gen, seed: floorSeed(seed, depth, round) });
    const pick = cands.find((c) => c.par >= r.par[0] && c.par <= r.par[1]) ?? null;
    const any = pick ?? cands[0];
    if (!any) continue;
    const floor: Floor = { depth, par: any.par, solution: any.solution, level: { ...any.level, id: `exp-${seed}-${depth}`, name: `Floor ${depth + 1}`, world: r.world, difficulty: Math.min(5, 1 + Math.floor(depth / 4)), tip: '' } };
    if (pick) return floor;
    fallback ??= floor;
  }
  return fallback;
}

