/**
 * Proposes rooms (see genlib.ts) and prints the best as level data ready to paste.
 *
 *   npx tsx scripts/dev/generate.ts crates=3 w=6 h=6 [walls=0.18] [ice=0.3] [pits=1] [lava=1]
 *     [doors=1] [conveyors=2] [teleports=1] [gates=2] [colors=2] [terraces=1] [holes=2] [lasers=1]
 *     [tries=500] [seed=1] [top=5]
 */
import { DEFAULTS, levelSource, propose } from './genlib';

const opt: Record<string, number> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (!(k in DEFAULTS)) throw new Error(`unknown option ${k}`);
  opt[k] = Number(v);
}
const out = propose(opt);
for (const c of out.slice(0, opt.top ?? DEFAULTS.top)) {
  console.log(`// score ${c.score.toFixed(1)} par ${c.par} pushes ${c.pushes} changes ${c.changes} states ${c.states}\n// ${c.solution}`);
  console.log(`  {\n${levelSource(c.level)}  },`);
}
console.error(`${out.length} kept of ${opt.tries ?? DEFAULTS.tries} tries`);
