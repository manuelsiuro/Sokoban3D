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

export interface WorldSection {
  name: string;
  mechanic: string;
  levels: LevelCard[];
}

/** Level select, a section per world (worlds without levels yet say so). Resolves with a level index, or null for back. */
export function showLevels(worlds: WorldSection[], click: () => void): Promise<number | null> {
  const all = worlds.flatMap((w) => w.levels);
  const total = all.reduce((n, l) => n + l.stars, 0);
  const pips = (n: number) => `<span class="level-diff" title="Difficulty ${n} of 5">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const card = (l: LevelCard, i: number) => `<button class="level-card ${l.unlocked ? '' : 'locked'}" data-i="${l.index}" ${l.unlocked ? '' : 'disabled'} style="animation-delay:${i * 0.03}s">
      <span class="level-num">${l.unlocked ? i + 1 : icon('lock', 20)}</span>
      ${l.clean ? `<span class="level-badge" title="Solved without undo">${icon('feather', 18)}</span>` : ''}
      <span class="level-name">${l.name}</span>
      ${pips(l.difficulty)}
      <span class="level-stars">${[0, 1, 2].map((s) => `<i class="${s < l.stars ? 'on' : ''}">${icon('star', 18)}</i>`).join('')}</span>
      <span class="level-best">${l.unlocked ? (l.best ? `Best ${l.best} · par ${l.par}` : `Par ${l.par}`) : 'Solve the one before'}</span>
    </button>`;
  const section = (w: WorldSection) => `<section class="world-section">
      <h3>${w.name}<small>${w.mechanic}</small></h3>
      ${w.levels.length ? `<div class="level-grid">${w.levels.map(card).join('')}</div>` : '<p class="world-soon">Coming soon</p>'}
    </section>`;
  const el = h(
    'div',
    'screen',
    `<div class="screen-inner">
      <div class="screen-head">
        <button class="icon-btn" data-back aria-label="Back">${icon('chevronLeft')}</button>
        <h2>Levels</h2>
        <span class="pill big">${icon('star', 16)} ${total} / ${all.length * 3}</span>
      </div>
      ${worlds.map(section).join('')}
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      click();
      closeOverlay(el);
      resolve(btn.dataset.back !== undefined ? null : Number(btn.dataset.i));
    };
    document.body.append(el);
  });
}
