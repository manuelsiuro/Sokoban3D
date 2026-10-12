/** Share links: every campaign level round-trips through a link; broken links are refused. */
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS } from '../src/levels/solutions';
import { decodeLevel, encodeLevel } from '../src/game/share';
import { check } from './assert';

let longest = 0;
for (const l of LEVELS) {
  const code = encodeLevel(l, SOLUTIONS[l.id]?.length);
  longest = Math.max(longest, code.length);
  const back = decodeLevel(code);
  check(back !== null, `${l.id}: decodes`);
  check(JSON.stringify([back?.level.map, back?.level.tiles ?? null, back?.level.kinds ?? null]) === JSON.stringify([l.map, l.tiles?.some((r) => r.trim()) ? l.tiles : null, l.kinds?.some((r) => r.trim()) ? l.kinds : null]), `${l.id}: layers survive`);
  check(back?.par === SOLUTIONS[l.id]?.length, `${l.id}: par survives`);
}
check(decodeLevel('not-a-level') === null, 'garbage is refused');
check(decodeLevel(encodeLevel({ ...LEVELS[0], map: ['####', '#  #', '####'] })) === null, 'a level without a player is refused');
console.log(`${LEVELS.length} levels round-trip; longest code ${longest < 1000 ? 'under' : 'over'} 1000 characters`);
