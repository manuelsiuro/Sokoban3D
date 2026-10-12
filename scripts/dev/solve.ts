/**
 * Solves one level (or a map file) and prints its par, pushes and search size.
 *   npx tsx scripts/dev/solve.ts <level-id>
 *   npx tsx scripts/dev/solve.ts --map path/to/map.txt   (a draft: map, then a blank line, then heights)
 */
import { readFileSync } from 'node:fs';
import { LEVELS } from '../../src/levels/levels';
import type { LevelDef } from '../../src/levels/types';
import { parseLevel } from '../../src/sim/grid';
import { solve } from '../../src/sim/solver';

const args = process.argv.slice(2);
let levels: LevelDef[];
if (args[0] === '--map') {
  levels = args.slice(1).map((file) => {
    const [map, heights] = readFileSync(file, 'utf8').replace(/\n+$/, '').split(/\n\s*\n/);
    return { id: file, name: file, world: 'draft', difficulty: 1, tip: '', map: map.split('\n'), heights: heights?.split('\n') };
  });
} else {
  levels = args.length ? args.map((id) => LEVELS.find((l) => l.id === id) ?? (() => { throw new Error(`No level ${id}`); })()) : LEVELS;
}
for (const level of levels) {
  const t0 = Date.now();
  const g = parseLevel(level);
  const r = solve(g);
  const pushes = r.solution ? [...r.solution].filter((c) => c === c.toUpperCase()).length : 0;
  console.log(`${level.id.padEnd(22)} ${r.solution === null ? (r.complete ? 'UNSOLVABLE' : 'GAVE UP') : `par ${String(r.solution.length).padStart(3)}  pushes ${String(pushes).padStart(3)}`}  states ${r.explored}  ${Date.now() - t0}ms${g.classic ? '' : '  (not classic)'}`);
  if (r.solution) console.log(`  ${r.solution}`);
}
