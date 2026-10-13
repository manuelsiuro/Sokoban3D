import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import { t } from '../../i18n';
import { formatTime } from '../../game/score';

export interface LevelCard {
  /** Index in the campaign. */
  index: number;
  name: string;
  difficulty: number;
  stars: number;
  unlocked: boolean;
  /** Fewest moves of a solve (0: not solved). */
  best: number;
  par: number;
  clean: boolean;
  /** Time Trial: best time (ms), its medal (0–3), and the gold time. */
  time?: number;
  medal: number;
  gold: number;
}

export interface WorldCard {
  name: string;
  mechanic: string;
  stars: number;
  maxStars: number;
  open: boolean;
  /** Stars still needed to open it (0 when open). */
  missing: number;
  /** A side world: opens when this world is cleared (instead of at a star gate). */
  opensAfter?: string;
  /** The gate, for the lock banner's bar. */
  gate: number;
  /** No levels yet. */
  soon: boolean;
  /** Cleared: its levels can be played against the clock. */
  trial: boolean;
  levels: LevelCard[];
}

export interface MapHooks {
  /** Moves the map's camera to a world. */
  select: (k: number) => void;
  /** The world under a screen point, or -1. */
  pick: (x: number, y: number) => number;
}

const pips = (n: number) => `<span class="level-diff" title="${t('worlds.difficulty', { n })}">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const state = (l: LevelCard, next: boolean) => (!l.unlocked ? 'locked' : l.stars >= 3 ? 'solved perfect' : l.stars ? 'solved' : next ? 'next' : '');
const MEDALS = ['', 'bronze', 'silver', 'gold'];
/** A level card in Time Trial: the medal won and the best time (or the time for gold). */
const timedCard = (l: LevelCard, i: number) => `<button class="level-card timed ${l.medal ? `medal-${MEDALS[l.medal]}` : ''}" data-i="${l.index}" style="animation-delay:${i * 0.03}s">
    <span class="level-num">${i + 1}</span>
    <span class="level-name">${l.name}</span>
    <span class="level-medal">${l.medal ? icon('trophy', 22) : icon('clock', 22)}</span>
    <span class="level-best">${l.time !== undefined ? t('trial.best', { time: formatTime(l.time) }) : t('trial.goldIn', { time: formatTime(l.gold) })}</span>
  </button>`;
const card = (l: LevelCard, i: number, all: LevelCard[]) => `<button class="level-card ${state(l, all.find((x) => x.unlocked && !x.stars) === l)}" data-i="${l.index}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${i * 0.03}s">
    <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
    ${l.clean ? `<span class="level-badge" title="${t('worlds.clean')}">${icon('feather', 18)}</span>` : ''}
    <span class="level-name">${l.name}</span>
    ${pips(l.difficulty)}
    <span class="level-stars">${[0, 1, 2].map((s) => `<i class="${s < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
    <span class="level-best">${l.unlocked ? (l.best ? t('worlds.best', { best: l.best, par: l.par }) : t('worlds.par', { par: l.par })) : t('worlds.solveBefore')}</span>
  </button>`;

/**
 * The world map's overlay: the selected world's card (‹ › or swipe to change, tap an island
 * to pick it), and a sheet of its levels. Resolves with a level index, or null for back.
 */
export function showWorlds(worlds: WorldCard[], start: { world: number; sheet: boolean; timed?: boolean }, map: MapHooks, click: () => void): Promise<{ index: number; timed: boolean } | null> {
  let k = start.world;
  let timed = !!start.timed;
  const total = worlds.reduce((n, w) => n + w.stars, 0);
  const max = worlds.reduce((n, w) => n + w.maxStars, 0);
  const el = h(
    'div',
    'worlds',
    `<div class="worlds-head">
      <button class="icon-btn" data-back aria-label="${t('common.back')}">${icon('chevronLeft')}</button>
      <h2>${t('worlds.title')}</h2>
      <span class="pill big">${icon('star', 16)} ${total} / ${max}</span>
    </div>
    <div class="world-card"></div>
    <div class="sheet hidden"><i class="sheet-grip" aria-hidden="true"></i><div class="sheet-inner"></div></div>`,
  );
  const cardEl = el.querySelector<HTMLElement>('.world-card')!;
  const sheet = el.querySelector<HTMLElement>('.sheet')!;
  const sheetInner = el.querySelector<HTMLElement>('.sheet-inner')!;
  const render = () => {
    const w = worlds[k];
    const done = w.maxStars ? (w.stars / w.maxStars) * 100 : 0;
    const lock = w.soon
      ? `<p class="world-lock">${t('worlds.soon')}</p>`
      : !w.open
        ? `<div class="world-lock">${icon('lock', 16)} <span>${w.opensAfter ? t('worlds.opensAfter', { world: w.opensAfter }) : w.missing === 1 ? t('worlds.missingOne') : t('worlds.missing', { n: w.missing })}</span><i style="--done:${((1 - w.missing / Math.max(1, w.gate)) * 100).toFixed(1)}%"></i></div>`
        : '';
    cardEl.innerHTML = `
      <button class="icon-btn world-prev" data-step="-1" aria-label="${t('worlds.prev')}" ${k === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <div class="world-info">
        <small>${t('worlds.world', { n: k + 1 })}</small>
        <b>${w.name}</b>
        <span>${w.mechanic}</span>
        ${w.open ? `<span class="world-stars">${icon('star', 14)} ${w.stars}/${w.maxStars}<i style="--done:${done.toFixed(1)}%"></i></span>` : ''}
        ${lock}
        ${w.open ? `<button class="big-btn primary" data-open>${icon('play', 16)} ${t('worlds.levels')}</button>` : ''}
      </div>
      <button class="icon-btn world-next" data-step="1" aria-label="${t('worlds.next')}" ${k === worlds.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>`;
    const trial = w.trial && timed;
    const toggle = w.trial
      ? `<div class="seg" role="tablist"><button class="${trial ? '' : 'on'}" data-mode="moves" role="tab" aria-selected="${!trial}">${icon('star', 14)} ${t('trial.moves')}</button><button class="${trial ? 'on' : ''}" data-mode="time" role="tab" aria-selected="${trial}">${icon('clock', 14)} ${t('trial.time')}</button></div>`
      : '';
    sheetInner.innerHTML = `<div class="sheet-head"><h3>${w.name}<small>${trial ? t('trial.about') : w.mechanic}</small></h3>${toggle}<button class="icon-btn" data-close aria-label="${t('common.close')}">${icon('close')}</button></div>
      <div class="level-grid">${w.levels.map((l, i) => (trial ? timedCard(l, i) : card(l, i, w.levels))).join('')}</div>`;
  };
  const go = (to: number) => {
    if (to < 0 || to >= worlds.length || to === k) return;
    k = to;
    map.select(k);
    sheet.classList.add('hidden');
    render();
  };
  const openSheet = () => {
    if (worlds[k].open) sheet.classList.remove('hidden');
  };
  map.select(k);
  render();
  if (start.sheet) openSheet();

  return new Promise((resolve) => {
    const finish = (v: { index: number; timed: boolean } | null) => {
      removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointerup', onUp);
      closeOverlay(el);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') go(k - 1);
      else if (e.code === 'ArrowRight' || e.code === 'KeyD') go(k + 1);
      else if (e.code === 'Enter' || e.code === 'Space') {
        if (sheet.classList.contains('hidden')) openSheet();
      } else if (e.code === 'Escape') {
        if (!sheet.classList.contains('hidden')) sheet.classList.add('hidden');
        else finish(null);
      } else return;
      e.preventDefault();
    };
    // Swipes and taps on the map (not on the overlay's controls).
    let down: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      down = (e.target as HTMLElement).tagName === 'CANVAS' ? { x: e.clientX, y: e.clientY } : null;
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      down = null;
      if (Math.abs(dx) > 40) {
        go(k + (dx < 0 ? 1 : -1));
        return;
      }
      const hit = map.pick(e.clientX, e.clientY);
      if (hit < 0) return;
      click();
      if (hit === k) openSheet();
      else go(hit);
    };
    addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('pointerup', onUp);
    el.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!btn) return;
      click();
      if (btn.dataset.back !== undefined) finish(null);
      else if (btn.dataset.step) go(k + Number(btn.dataset.step));
      else if (btn.dataset.open !== undefined) openSheet();
      else if (btn.dataset.close !== undefined) sheet.classList.add('hidden');
      else if (btn.dataset.mode) {
        timed = btn.dataset.mode === 'time';
        render();
      } else if (btn.dataset.i !== undefined) finish({ index: Number(btn.dataset.i), timed: worlds[k].trial && timed });
    };
    document.body.append(el);
  });
}
