import { h } from '../dom';
import { icon } from '../icons';

export type SummaryChoice = 'retry' | 'next' | 'levels' | 'watch';

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
  /** A line under the result (a streak, new trophies). */
  extra?: string;
  /** Shares the result; resolves with what to say ("Copied!"). */
  share?: () => Promise<string>;
  /** Offer to watch the best run. */
  watch?: boolean;
}

/** A solved level: stars, moves against par, and what to do next. */
/** `star(k)` plays as the k-th earned star lands (its animation). */
export function showSummary(r: SummaryInfo, click: () => void, star?: (k: number) => void): Promise<SummaryChoice> {
  const hint = r.stars < 3 ? `${r.limits[1]} moves or fewer for ★★★` : r.moves <= r.par ? 'Matched the par!' : 'Three stars';
  const notes = [r.par ? hint : '', r.best ? 'New best' : '', r.clean ? 'No undo' : ''].filter(Boolean);
  const stat = (label: string, value: number | string, cls = '') => `<span class="stat ${cls}"><b>${value}</b><small>${label}</small></span>`;
  const el = h(
    'div',
    'modal',
    `<div class="card summary-card">
      <div class="summary-burst" aria-hidden="true"></div>
      <h2>Solved!</h2>
      <div class="summary-stars" aria-label="${r.stars} of 3 stars">${[0, 1, 2].map((k) => `<i class="${k < r.stars ? 'on' : ''}" style="animation-delay:${0.2 + k * 0.15}s">${icon('star', k === 1 ? 54 : 42)}</i>`).join('')}</div>
      <div class="summary-stats">
        ${stat('moves', r.moves, r.par && r.moves <= r.par ? 'par-hit' : '')}
        ${stat('pushes', r.pushes)}
        ${r.par ? stat('par', r.par) : ''}
      </div>
      ${notes.length ? `<p class="summary-notes">${notes.map((n) => `<span>${n}</span>`).join('')}</p>` : ''}
      ${r.extra ? `<p class="summary-extra">${r.extra}</p>` : ''}
      <div class="summary-actions">
        ${r.hasNext ? `<button class="big-btn primary wide" data-c="next">Next level ${icon('chevronRight', 18)}</button>` : `<button class="big-btn primary wide" data-c="retry">${icon('replay', 18)} Play again</button>`}
        <div class="summary-row">
          <button class="big-btn ghost" data-c="levels" aria-label="Levels" title="Levels">${icon('home', 18)}</button>
          ${r.hasNext ? `<button class="big-btn ghost" data-c="retry" aria-label="Retry">${icon('replay', 18)} Retry</button>` : ''}
          ${r.watch ? `<button class="big-btn ghost" data-c="watch" aria-label="Watch your best run">${icon('play', 16)} Watch</button>` : ''}
          ${r.share ? `<button class="big-btn ghost" data-share>${icon('share', 18)} Share</button>` : ''}
        </div>
      </div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = async (e) => {
      const share = (e.target as HTMLElement).closest<HTMLElement>('[data-share]');
      if (share && r.share) {
        click();
        share.textContent = await r.share();
        return;
      }
      const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c as SummaryChoice | undefined;
      if (!c) return;
      click();
      el.remove();
      resolve(c);
    };
    document.body.append(el);
    for (let k = 0; k < r.stars; k++) setTimeout(() => el.isConnected && star?.(k), (0.2 + k * 0.15 + 0.22) * 1000);
  });
}
