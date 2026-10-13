import { hint } from '../app/helper';
import { click, newTrophies, screen, shareText, summary } from '../app/context';
import { markBuilt } from '../game/achievements';
import { starLimits, starsFor } from '../game/score';
import { shareLink } from '../game/share';
import { KEYS as STORE, readJSON, writeJSON } from '../game/storage';
import { parseLevel } from '../sim/grid';
import { initialState } from '../sim/Sim';
import { newDraft, showEditor, type Draft } from '../ui/screens/editor';
import { play } from './run';
import { t } from '../i18n';

/** The workshop: edit, test-play, come back to the same draft. */
export async function workshopFlow() {
  let draft = readJSON<Draft | null>(STORE.editor, null);
  if (!draft || !Array.isArray(draft.base) || draft.base.length !== draft.w * draft.h) draft = newDraft();
  for (;;) {
    screen.mode = 'level';
    const choice = await showEditor(draft, {
      save: (d) => {
        draft = d;
        writeJSON(STORE.editor, d);
      },
      check: async (level) => {
        const r = await hint(level, initialState(parseLevel(level)));
        return r.solution ? r.solution.length : r.complete ? 0 : -1;
      },
      share: async (level, levelPar) => shareText(t('workshop.share', { name: level.name, par: levelPar ? t('workshop.sharePar', { par: levelPar }) : '' }), shareLink(level, levelPar)),
      click,
    });
    if (choice.type === 'back') return;
    const r = await play(choice.level, t('workshop.label'), choice.par);
    if (!r) continue;
    markBuilt();
    const extra = newTrophies();
    const s = r.state;
    await summary({ stars: choice.par ? starsFor(s.moves, choice.par) : 1, moves: s.moves, pushes: s.pushes, par: choice.par, limits: starLimits(choice.par), best: false, clean: r.clean, hasNext: false, extra });
  }
}
