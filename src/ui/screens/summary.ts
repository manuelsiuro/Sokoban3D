import { h } from '../dom';
import { icon } from '../icons';

export type SummaryChoice = 'retry' | 'next' | 'levels';

export interface SummaryInfo {
  stars: number;
  moves: number;
  pushes: number;
  par: number;
  /** Most moves for ★★ and ★★★. */
  limits: number[];
  best: boolean;
  clean: boolean;
  hasNext: boolean;
}

/** A solved level: stars, moves against par, and what to do next. */
export function showSummary(r: SummaryInfo, click: () => void): Promise<SummaryChoice> {
  const hint = r.stars < 3 ? `${r.limits[1]} moves or fewer for ★★★` : r.moves <= r.par ? 'Matched the par!' : 'Three stars';
  const el = h(
    'div',
    'modal',
    `<div class="card summary-card">
      <h2>Solved!</h2>
      <div class="summary-stars">${[0, 1, 2].map((k) => `<i class="${k < r.stars ? 'on' : ''}" style="animation-delay:${0.2 + k * 0.15}s">${icon('star', 40)}</i>`).join('')}</div>
      <p class="summary-moves"><b>${r.moves}</b> moves · ${r.pushes} pushes · par ${r.par}</p>
      <p class="summary-time">${hint}${r.best ? ' · new best' : ''}${r.clean ? ' · no undo' : ''}</p>
      <div class="actions">
        <button class="big-btn ghost" data-c="levels" aria-label="Levels">${icon('home', 18)}</button>
        <button class="big-btn ${r.hasNext ? 'ghost' : 'primary'}" data-c="retry">${icon('replay', 18)} Retry</button>
        ${r.hasNext ? `<button class="big-btn primary" data-c="next">Next ${icon('chevronRight', 18)}</button>` : ''}
      </div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c as SummaryChoice | undefined;
      if (!c) return;
      click();
      el.remove();
      resolve(c);
    };
    document.body.append(el);
  });
}
