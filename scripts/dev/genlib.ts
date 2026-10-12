/** Dev helpers around the room generator (src/sim/generator.ts): printing levels as source. */
import type { LevelDef } from '../../src/levels/types';

export { DEFAULTS, propose, type Cand } from '../../src/sim/generator';

const layer = (name: string, rows: string[] | undefined, blank: RegExp) => (rows && rows.some((r) => !blank.test(r)) ? `    ${name}: [\n${rows.map((r) => `      '${r.replaceAll('\\', '\\\\')}',`).join('\n')}\n    ],\n` : '');

/** A level's layers as TypeScript (blank layers left out). */
export function levelSource(l: LevelDef) {
  return `${layer('map', l.map, /^$/)}${layer('heights', l.heights, /^0*$/)}${layer('tiles', l.tiles, /^ *$/)}${layer('kinds', l.kinds, /^ *$/)}`;
}
