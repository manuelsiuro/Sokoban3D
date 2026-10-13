import { generateFloor } from '../app/helper';
import { click, newTrophies, shareText, summary, toast, view } from '../app/context';
import { clearFloor, endRun, floorScore, loadExpedition, newRun, skipFloor, type Floor, type RunState } from '../game/expedition';
import { starLimits, starsFor } from '../game/score';
import { WORLDS } from '../levels/worlds';
import { h } from '../ui/dom';
import { icon } from '../ui/icons';
import { play } from './run';
import { t } from '../i18n';

/**
 * Expedition: floor after floor of generated islands until the player gives up with no
 * compass left. Each floor is built in the worker while the one before is played. Leaving
 * keeps the run; it's offered again next time.
 */
export async function expeditionFlow(seed?: number) {
  let run = await chooseRun(seed);
  if (!run) return;
  for (;;) {
    const floor = await fetchFloor(run);
    if (!floor) {
      toast(t('exp.uncharted'));
      run = { ...run, depth: run.depth + 1 };
      continue;
    }
    // The next island is charted while this one is played.
    void generateFloor(run.seed, run.depth + 1);
    const world = WORLDS.find((w) => w.id === floor.level.world)?.name ?? '';
    const level = { ...floor.level, name: t('exp.floor', { n: run.depth + 1 }) };
    const r = await play(level, t('exp.label', { world }), floor.par, { skip: run.compasses });
    if (!r) return; // Left: the run is saved where it was.
    if (r.skipped) {
      const next = skipFloor(run);
      if (!next) {
        await gameOver(run);
        return;
      }
      run = next;
      toast(`${icon('compass', 18)} <span>${run.compasses === 1 ? t('exp.skipped1') : t('exp.skipped', { n: run.compasses })}</span>`);
      await view.leave();
      continue;
    }
    const s = r.state;
    const stars = starsFor(s.moves, floor.par);
    const points = floorScore(run.depth, stars, s.moves, floor.par);
    const gained = stars >= 3 && run.compasses < 5;
    run = clearFloor(run, stars, s.moves, floor.par);
    const extra = [t('exp.points', { points, score: run.score }), gained ? `${icon('compass', 14)} ${t('exp.compass')}` : '', newTrophies()].filter(Boolean).join(' · ');
    const choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: floor.par, limits: starLimits(floor.par), best: false, clean: r.clean, hasNext: true, extra });
    if (choice !== 'next') return; // The run waits at the next floor.
    await view.leave();
  }
}

/** A run to play: the saved one, a new one, or one from a link. Null: the player backed out. */
async function chooseRun(seed?: number): Promise<RunState | null> {
  const save = loadExpedition();
  if (seed !== undefined) return newRun(seed);
  const best = save.best.depth ? `<p class="exp-best">${icon('trophy', 14)} ${t('exp.best', { depth: save.best.depth, score: save.best.score })}</p>` : '';
  const saved = save.run;
  const el = h(
    'div',
    'modal',
    `<div class="card exp-card">
      <div class="card-head"><h2>${t('title.expedition')}</h2><button class="icon-btn" data-c="back" aria-label="${t('common.back')}">${icon('close', 18)}</button></div>
      <p class="exp-lead">${t('exp.lead')}</p>
      ${best}
      <div class="actions column">
        ${saved ? `<button class="big-btn primary" data-c="resume">${icon('play', 16)} ${t('exp.continue', { n: saved.depth + 1, score: saved.score })}</button>` : ''}
        <button class="big-btn ${saved ? 'ghost' : 'primary'}" data-c="new">${icon('map', 16)} ${t('exp.new')}</button>
      </div>
    </div>`,
  );
  document.body.append(el);
  const c = await new Promise<string>((resolve) => {
    el.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-c]');
      if (!b && e.target !== el) return;
      click();
      el.remove();
      resolve(b?.dataset.c ?? 'back');
    };
  });
  if (c === 'resume' && saved) return saved;
  if (c === 'new') {
    if (saved) endRun(saved);
    return newRun();
  }
  return null;
}

/** The floor, from the worker; a wait card if it isn't ready yet. */
async function fetchFloor(run: RunState): Promise<Floor | null> {
  const p = generateFloor(run.seed, run.depth);
  let wait: HTMLElement | null = null;
  const timer = setTimeout(() => {
    wait = h('div', 'modal', `<div class="card"><h2>${t('exp.floor', { n: run.depth + 1 })}</h2><p class="summary-time">${t('exp.charting')}</p></div>`);
    document.body.append(wait);
  }, 150);
  const floor = await p;
  clearTimeout(timer);
  (wait as HTMLElement | null)?.remove();
  return floor;
}

/** No compass left: the run ends. Shows how deep it went and offers to share the seed. */
async function gameOver(run: RunState) {
  const better = endRun(run);
  const stars = run.stars.reduce((a, b) => a + b, 0);
  const link = `${location.origin}${location.pathname}#exp=${run.seed}`;
  const el = h(
    'div',
    'modal',
    `<div class="card exp-card">
      <h2>${t('exp.over')}</h2>
      <div class="summary-stats">
        <span class="stat ${better.depth ? 'par-hit' : ''}"><b>${run.depth}</b><small>${t('exp.floors')}</small></span>
        <span class="stat ${better.score ? 'par-hit' : ''}"><b>${run.score}</b><small>${t('exp.score')}</small></span>
        <span class="stat"><b>${stars}</b><small>${t('exp.stars')}</small></span>
      </div>
      ${better.depth || better.score ? `<p class="exp-best">${icon('trophy', 14)} ${t('exp.newBest')}</p>` : ''}
      <div class="actions"><button class="big-btn ghost" data-share>${icon('share', 16)} ${t('exp.share')}</button><button class="big-btn primary" data-done>${t('common.done')}</button></div>
    </div>`,
  );
  document.body.append(el);
  await new Promise<void>((resolve) => {
    el.onclick = async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-share]')) {
        const b = target.closest<HTMLElement>('[data-share]')!;
        b.textContent = await shareText(t('exp.shareText', { depth: run.depth, score: run.score }), link);
        return;
      }
      if (!target.closest('[data-done]')) return;
      click();
      el.remove();
      resolve();
    };
  });
}
