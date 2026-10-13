import type { LevelDef } from '../levels/types';
import { summary } from '../app/context';
import { starLimits, starsFor } from '../game/score';
import { play } from './run';
import { t } from '../i18n';

/** Plays a level from a share link (#lvl=…), then goes on to the title. */
export async function sharedFlow(level: LevelDef, levelPar: number) {
  for (;;) {
    const r = await play({ ...level, tip: t('shared.tip') }, t('shared.label'), levelPar);
    if (!r) return;
    const s = r.state;
    const stars = levelPar ? starsFor(s.moves, levelPar) : 1;
    const choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: levelPar, limits: starLimits(levelPar), best: false, clean: r.clean, hasNext: false });
    if (choice !== 'retry') return;
  }
}
