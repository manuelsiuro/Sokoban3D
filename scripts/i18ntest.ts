/** Translations: French covers every English key with the same {holes}, and every campaign level. */
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';
import { FR_LEVELS } from '../src/i18n/levels.fr';
import { LEVELS } from '../src/levels/levels';

const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
const keys = Object.keys(en) as (keyof typeof en)[];
const missing = keys.filter((k) => fr[k] === undefined);
const badHoles = keys.filter((k) => fr[k] !== undefined && holes(fr[k]!) !== holes(en[k]));
const extra = Object.keys(fr).filter((k) => !(k in en));
const noLevel = LEVELS.filter((l) => !FR_LEVELS[l.id]?.name || !FR_LEVELS[l.id]?.tip).map((l) => l.id);
const problems = [
  missing.length ? `missing in fr: ${missing.join(', ')}` : '',
  badHoles.length ? `holes differ: ${badHoles.join(', ')}` : '',
  extra.length ? `unknown keys in fr: ${extra.join(', ')}` : '',
  noLevel.length ? `levels without French: ${noLevel.join(', ')}` : '',
].filter(Boolean);
if (problems.length) throw new Error(problems.join('\n'));
console.log(`${keys.length} keys, all in French with the same holes`);
console.log(`${LEVELS.length} campaign levels with French names and tips`);
