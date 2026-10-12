/**
 * Builds a world's levels from its slot specs (worldspecs.ts): for each slot, the generator
 * proposes rooms with the slot's mechanics, and the best one whose par falls in the slot's
 * window is kept (seeded, so a run is reproducible). Writes src/levels/worlds/<world>.ts.
 * Picks are cached by slot spec (scripts/dev/.buildcache/), so changing one slot only
 * rebuilds that slot.
 *   npx tsx scripts/dev/buildworld.ts <world> [--print]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { levelSource, propose, type Cand } from './genlib';
import { SPECS } from './worldspecs';

const world = process.argv[2];
const spec = SPECS[world];
if (!spec) throw new Error(`No spec for ${world}; specs: ${Object.keys(SPECS).join(', ')}`);
const cacheDir = new URL('./.buildcache/', import.meta.url);
const cacheFile = new URL(`${world}.json`, cacheDir);
const cache: Record<string, Cand> = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, 'utf8')) : {};
const seen = new Set<string>();
const picked: { slot: (typeof spec.slots)[number]; c: Cand }[] = [];
for (const [n, slot] of spec.slots.entries()) {
  const key = JSON.stringify({ n, gen: slot.gen, par: slot.par, rounds: slot.rounds });
  let best: Cand | null = cache[key] ?? null;
  const t0 = Date.now();
  for (let round = 0; round < (slot.rounds ?? 12) && !best; round++) {
    const cands = propose({ tries: 700, ...slot.gen, seed: (n + 1) * 1000 + round });
    best = cands.find((c) => c.par >= slot.par[0] && c.par <= slot.par[1] && !seen.has(c.level.map.join('\n'))) ?? null;
  }
  if (!best) throw new Error(`${world} slot ${n + 1} (${slot.name}): nothing with par in ${slot.par.join('–')}`);
  seen.add(best.level.map.join('\n'));
  cache[key] = best;
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(cacheFile, JSON.stringify(cache));
  picked.push({ slot, c: best });
  console.error(`${String(n + 1).padStart(2)} ${slot.name.padEnd(22)} par ${String(best.par).padStart(3)} pushes ${String(best.pushes).padStart(3)} states ${best.states}  ${Date.now() - t0}ms`);
}
const ident = world.toUpperCase();
const src = `import type { LevelDef } from '../types';

// Built by scripts/dev/buildworld.ts from the slot specs in scripts/dev/worldspecs.ts
// (seeded and reproducible) — change the spec and rebuild rather than editing here.
// ${spec.about}
const W = '${world}';

export const ${ident}: LevelDef[] = [
${picked
  .map(
    ({ slot, c }, k) => `  {
    id: '${world}-${k + 1}',
    name: ${JSON.stringify(slot.name)},
    world: W,
    difficulty: ${slot.difficulty},
    tip: ${JSON.stringify(slot.tip)},
${levelSource(c.level)}  },`,
  )
  .join('\n')}
];
`;
if (process.argv.includes('--print')) console.log(src);
else writeFileSync(new URL(`../../src/levels/worlds/${world}.ts`, import.meta.url), src);
