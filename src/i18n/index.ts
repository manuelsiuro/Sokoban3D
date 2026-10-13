import { en, type Strings } from './en';
import { fr } from './fr';

/**
 * Translations. `t('key', { n: 3 })` looks the key up in the current language (falling back
 * to English) and fills `{n}`-style holes. Level names and tips are looked up by level id
 * with `levelText`. The language follows the browser unless the player picked one.
 */
export type Lang = 'en' | 'fr';
export type Key = keyof Strings;

const TABLES: Record<Lang, Partial<Strings>> = { en, fr };
let lang: Lang = 'en';

export const detectLang = (): Lang => (navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en');

export function setLang(l: Lang | 'auto') {
  lang = l === 'auto' ? detectLang() : l;
  document.documentElement.lang = lang;
  // The game speaks French itself: the browser shouldn't translate it again. English pages
  // stay translatable for players of other languages.
  document.documentElement.setAttribute('translate', lang === 'en' ? 'yes' : 'no');
}

export const currentLang = () => lang;

export function t(key: Key, vars: Record<string, string | number> = {}): string {
  const s = TABLES[lang][key] ?? en[key];
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** A level's name and tip in the current language (the level's own text when untranslated). */
export function levelText(level: { id: string; name: string; tip: string }): { name: string; tip: string } {
  const tr = lang === 'fr' ? FR_LEVELS[level.id] : undefined;
  return { name: tr?.name ?? level.name, tip: tr?.tip ?? level.tip };
}

import { FR_LEVELS } from './levels.fr';
