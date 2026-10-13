import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import { t } from '../../i18n';
import { levelCardHtml, type LevelCard } from './worlds';

/**
 * The cube net, folded: six faces in a cross, a crate on the front face pushed up over the
 * edge onto the top one. Shows the planet rule at a glance (the intro card and How to play).
 */
export const PLANET_PIC = (() => {
  const s = 20;
  const faces: [number, number, string][] = [
    [1, 0, '#9fd27a'],
    [0, 1, '#8fc86c'],
    [1, 1, '#b4e08e'],
    [2, 1, '#8fc86c'],
    [3, 1, '#7fb85e'],
    [1, 2, '#8fc86c'],
  ];
  const sq = faces.map(([x, y, c]) => `<rect x="${x * s + 1}" y="${y * s + 1}" width="${s - 2}" height="${s - 2}" rx="3" fill="${c}"/>`).join('');
  // The folds: dashed where two faces meet.
  const folds = `<path d="M${s} ${s}h${s} M${s} ${2 * s}h${s} M${s} ${s}v${s} M${2 * s} ${s}v${s} M${3 * s} ${s}v${s}" stroke="#2f5a2a" stroke-width="1.2" stroke-dasharray="2 2" opacity="0.6"/>`;
  const crate = `<rect x="${s + 6}" y="${s + 3}" width="8" height="8" rx="1.5" fill="#d9a45a" stroke="#8a5a2a" stroke-width="1"/>`;
  const arrow = `<path d="M${s + 10} ${s + 1}V${s - 9}" stroke="#ffd447" stroke-width="2.4" stroke-linecap="round"/><path d="M${s + 6} ${s - 6}l4 -5 4 5" fill="none" stroke="#ffd447" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  const pad = `<circle cx="${s + 10}" cy="${s * 0.35}" r="3.2" fill="none" stroke="#ffd447" stroke-width="1.6"/>`;
  const player = `<circle cx="${s + 10}" cy="${s + 15.5}" r="3" fill="#e0433a"/>`;
  return `<svg class="help-pic" viewBox="0 0 ${4 * s} ${3 * s}" aria-hidden="true">${sq}${folds}${pad}${crate}${arrow}${player}</svg>`;
})();

/**
 * The Planets screen: the planets in order (each opens once the one before is solved), the
 * chosen one turning behind. Resolves with a planet's index, or null for back.
 */
export function showPlanets(cards: LevelCard[], about: { stars: number; max: number }, preview: (index: number) => void, click: () => void): Promise<number | null> {
  const el = h(
    'div',
    'worlds planets-screen',
    `<div class="worlds-head">
      <button class="icon-btn" data-back aria-label="${t('common.back')}">${icon('chevronLeft')}</button>
      <h2>${t('planets.title')}</h2>
      <span class="pill big">${icon('star', 16)} ${about.stars} / ${about.max}</span>
    </div>
    <div class="sheet"><div class="sheet-inner">
      <p class="planets-about">${t('planets.about')}</p>
      <div class="level-grid">${cards.map((c, i) => levelCardHtml(c, i, cards)).join('')}</div>
    </div></div>`,
  );
  // Locked cards say which planet opens them.
  el.querySelectorAll<HTMLElement>('.level-card:disabled .level-best').forEach((b, k) => {
    const i = cards.findIndex((c) => !c.unlocked) + k;
    b.textContent = t('planets.locked', { n: i });
  });
  let shown = -1;
  const look = (i: number) => {
    if (i === shown || !cards[i]?.unlocked) return;
    shown = i;
    preview(i);
  };
  return new Promise((resolve) => {
    const finish = (v: number | null) => {
      removeEventListener('keydown', onKey);
      closeOverlay(el);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('.modal')) return;
      if (e.code === 'Escape') finish(null);
    };
    addEventListener('keydown', onKey);
    // Pointing at (or tabbing to) a planet turns it behind the list.
    const at = (e: Event) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      if (c) look(Number(c.dataset.i));
    };
    el.addEventListener('pointerover', at);
    el.addEventListener('focusin', at);
    el.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!btn) return;
      click();
      if (btn.dataset.back !== undefined) finish(null);
      else if (btn.dataset.i !== undefined) finish(Number(btn.dataset.i));
    };
    document.body.append(el);
    // The strip starts at the planet to play next.
    el.querySelector<HTMLElement>('.level-card.next')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  });
}
