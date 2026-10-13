import { generateDaily } from '../app/helper';
import { newTrophies, shareText, summary, toast } from '../app/context';
import { today } from '../game/daily';
import { cacheDaily, cachedDaily, saveDaily } from '../game/dailyProgress';
import { starLimits, starsFor } from '../game/score';
import { h } from '../ui/dom';
import { play } from './run';

/** Today's daily puzzle: generated (or taken from the cache), played, its streak kept. */
export async function dailyFlow() {
  const date = today();
  let daily = cachedDaily(date);
  if (!daily) {
    const wait = h('div', 'modal', `<div class="card"><h2>Daily puzzle</h2><p class="summary-time">Building today’s island…</p></div>`);
    document.body.append(wait);
    daily = await generateDaily(date);
    wait.remove();
    if (!daily) {
      toast('No daily puzzle today, sorry. Try again later.');
      return;
    }
    cacheDaily(daily);
  }
  for (;;) {
    const r = await play(daily.level, `Daily · ${date}`, daily.par);
    if (!r) return;
    const s = r.state;
    const stars = starsFor(s.moves, daily.par);
    const streak = saveDaily(date, stars, s.moves);
    const extra = [streak > 1 ? `${streak}-day streak` : 'Come back tomorrow for a new one', newTrophies()].filter(Boolean).join(' · ');
    const text = `Cratelands daily ${date}: ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)} in ${s.moves} moves (par ${daily.par})${streak > 1 ? `, ${streak}-day streak` : ''}`;
    const choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: daily.par, limits: starLimits(daily.par), best: false, clean: r.clean, hasNext: false, extra, share: () => shareText(text) });
    if (choice !== 'retry') return;
  }
}
