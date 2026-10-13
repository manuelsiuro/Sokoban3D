import type { LevelDef } from '../levels/types';
import { click } from '../app/context';
import { starLimits, starsFor } from '../game/score';
import { showSummary } from '../ui/screens/summary';
import { play } from './run';

/** Plays a level from a share link (#lvl=…), then goes on to the title. */
export async function sharedFlow(level: LevelDef, levelPar: number) {
  for (;;) {
    const r = await play(level, 'Shared level', levelPar);
    if (!r) return;
    const s = r.state;
    const stars = levelPar ? starsFor(s.moves, levelPar) : 1;
    const choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: levelPar, limits: starLimits(levelPar), best: false, clean: r.clean, hasNext: false }, click);
    if (choice !== 'retry') return;
  }
}
