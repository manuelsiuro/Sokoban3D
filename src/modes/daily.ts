import { generateDaily } from '../app/helper';
import { newTrophies, shareText, summary, toast } from '../app/context';
import { today } from '../game/daily';
import { cacheDaily, cachedDaily, saveDaily } from '../game/dailyProgress';
import { starLimits, starsFor } from '../game/score';
import { h } from '../ui/dom';
import { play } from './run';
import { t, type Key } from '../i18n';

/** Today's daily puzzle: generated (or taken from the cache), played, its streak kept. */
export async function dailyFlow() {
  const date = today();
  let daily = cachedDaily(date);
  if (!daily) {
    const wait = h('div', 'modal', `<div class="card"><h2>${t('daily.title')}</h2><p class="summary-time">${t('daily.building')}</p></div>`);
    document.body.append(wait);
    daily = await generateDaily(date);
    wait.remove();
    if (!daily) {
      toast(t('daily.none'));
      return;
    }
    cacheDaily(daily);
  }
  // Its name and tip in the player's language (the puzzle itself is the same for everyone).
  const level = { ...daily.level, name: t(`daily.name.${daily.level.world}` as Key), tip: t('daily.tip', { date, par: daily.par }) };
  for (;;) {
    const r = await play(level, t('daily.label', { date }), daily.par);
    if (!r) return;
    const s = r.state;
    const stars = starsFor(s.moves, daily.par);
    const streak = saveDaily(date, stars, s.moves);
    const extra = [streak > 1 ? t('daily.streak', { n: streak }) : t('daily.tomorrow'), newTrophies()].filter(Boolean).join(' · ');
    const text = t('daily.share', { date, stars: '★'.repeat(stars) + '☆'.repeat(3 - stars), moves: s.moves, par: daily.par, streak: streak > 1 ? t('daily.shareStreak', { n: streak }) : '' });
    const choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: daily.par, limits: starLimits(daily.par), best: false, clean: r.clean, hasNext: false, extra, share: () => shareText(text) });
    if (choice !== 'retry') return;
  }
}
