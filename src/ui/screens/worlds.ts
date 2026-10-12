import { closeOverlay, h } from '../dom';
import { icon } from '../icons';

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
}

export interface WorldCard {
  name: string;
  mechanic: string;
  stars: number;
  maxStars: number;
  open: boolean;
  /** Stars still needed to open it (0 when open). */
  missing: number;
  /** The gate, for the lock banner's bar. */
  gate: number;
  /** No levels yet. */
  soon: boolean;
  levels: LevelCard[];
}

export interface MapHooks {
  /** Moves the map's camera to a world. */
  select: (k: number) => void;
  /** The world under a screen point, or -1. */
  pick: (x: number, y: number) => number;
}

const pips = (n: number) => `<span class="level-diff" title="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
const card = (l: LevelCard, i: number) => `<button class="level-card ${l.unlocked ? '' : 'locked'}" data-i="${l.index}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${i * 0.03}s">
    <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
    ${l.clean ? `<span class="level-badge" title="Solved without undo">${icon('feather', 18)}</span>` : ''}
    <span class="level-name">${l.name}</span>
    ${pips(l.difficulty)}
    <span class="level-stars">${[0, 1, 2].map((s) => `<i class="${s < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
    <span class="level-best">${l.unlocked ? (l.best ? `Best ${l.best} · par ${l.par}` : `Par ${l.par}`) : 'Solve the one before'}</span>
  </button>`;

/**
 * The world map's overlay: the selected world's card (‹ › or swipe to change, tap an island
 * to pick it), and a sheet of its levels. Resolves with a level index, or null for back.
 */
export function showWorlds(worlds: WorldCard[], start: { world: number; sheet: boolean }, map: MapHooks, click: () => void): Promise<number | null> {
  let k = start.world;
  const total = worlds.reduce((n, w) => n + w.stars, 0);
  const max = worlds.reduce((n, w) => n + w.maxStars, 0);
  const el = h(
    'div',
    'worlds',
    `<div class="worlds-head">
      <button class="icon-btn" data-back aria-label="Back">${icon('chevronLeft')}</button>
      <h2>Worlds</h2>
      <span class="pill big">${icon('star', 16)} ${total} / ${max}</span>
    </div>
    <div class="world-card"></div>
    <div class="sheet hidden"><div class="sheet-inner"></div></div>`,
  );
  const cardEl = el.querySelector<HTMLElement>('.world-card')!;
  const sheet = el.querySelector<HTMLElement>('.sheet')!;
  const sheetInner = el.querySelector<HTMLElement>('.sheet-inner')!;
  const render = () => {
    const w = worlds[k];
    const done = w.maxStars ? (w.stars / w.maxStars) * 100 : 0;
    const lock = w.soon
      ? '<p class="world-lock">Coming soon</p>'
      : !w.open
        ? `<div class="world-lock">${icon('lock', 16)} <span>${w.missing} more ${w.missing === 1 ? 'star' : 'stars'} to open</span><i style="--done:${((1 - w.missing / Math.max(1, w.gate)) * 100).toFixed(1)}%"></i></div>`
        : '';
    cardEl.innerHTML = `
      <button class="icon-btn world-prev" data-step="-1" aria-label="Previous world" ${k === 0 ? 'disabled' : ''}>${icon('chevronLeft')}</button>
      <div class="world-info">
        <small>World ${k + 1}</small>
        <b>${w.name}</b>
        <span>${w.mechanic}</span>
        ${w.open ? `<span class="world-stars">${icon('star', 14)} ${w.stars}/${w.maxStars}<i style="--done:${done.toFixed(1)}%"></i></span>` : ''}
        ${lock}
        ${w.open ? `<button class="big-btn primary" data-open>${icon('play', 16)} Levels</button>` : ''}
      </div>
      <button class="icon-btn world-next" data-step="1" aria-label="Next world" ${k === worlds.length - 1 ? 'disabled' : ''}>${icon('chevronRight')}</button>`;
    sheetInner.innerHTML = `<div class="sheet-head"><h3>${w.name}<small>${w.mechanic}</small></h3><button class="icon-btn" data-close aria-label="Close">${icon('close')}</button></div>
      <div class="level-grid">${w.levels.map(card).join('')}</div>`;
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
    const finish = (v: number | null) => {
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
      const t = e.target as HTMLElement;
      const btn = t.closest<HTMLElement>('button');
      if (!btn) return;
      click();
      if (btn.dataset.back !== undefined) finish(null);
      else if (btn.dataset.step) go(k + Number(btn.dataset.step));
      else if (btn.dataset.open !== undefined) openSheet();
      else if (btn.dataset.close !== undefined) sheet.classList.add('hidden');
      else if (btn.dataset.i !== undefined) finish(Number(btn.dataset.i));
    };
    document.body.append(el);
  });
}
