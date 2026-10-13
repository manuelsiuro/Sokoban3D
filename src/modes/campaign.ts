import { LEVELS } from '../levels/levels';
import { WORLDS } from '../levels/worlds';
import type { LevelDef } from '../levels/types';
import { click, map, newTrophies, par, screen, settings, showLevel, sound, summary, view, worldIndex } from '../app/context';
import { isUnlocked, isWorldOpen, loadProgress, saveResult, totalStars, worldGate, worldLevels, worldStars } from '../game/progress';
import { starLimits, starsFor } from '../game/score';
import { showWorlds } from '../ui/screens/worlds';
import { play } from './run';
import { KEYS as STORE, readJSON, writeJSON } from '../game/storage';
import { h } from '../ui/dom';
import { levelText, t } from '../i18n';

/** Before a new world's first level (after the Meadow): a card on what its mechanic does. Once. */
async function introduce(level: LevelDef) {
  const w = WORLDS.findIndex((x) => x.id === level.world);
  if (w <= 0 || LEVELS.find((l) => l.world === level.world) !== level) return;
  const seen = readJSON<string[]>(STORE.seen, []);
  if (seen.includes(level.world)) return;
  writeJSON(STORE.seen, [...seen, level.world]);
  // The new world's island is already behind the card.
  showLevel(level);
  screen.mode = 'level';
  view.idle = true;
  const world = WORLDS[w];
  const el = h(
    'div',
    'modal',
    `<div class="card intro-card"><p class="intro-kicker">${t('intro.kicker', { n: w + 1 })}</p><h2>${world.name}</h2><p class="intro-mech">${world.mechanic}</p><p class="intro-tip">${levelText(level).tip}</p><div class="actions"><button class="big-btn primary" data-done>${t('intro.go')}</button></div></div>`,
  );
  document.body.append(el);
  await new Promise<void>((resolve) => {
    el.onclick = (e) => {
      if (!(e.target as HTMLElement).closest('[data-done]')) return;
      click();
      el.remove();
      resolve();
    };
  });
}

/** A campaign level's label: its world and number. */
export const campaignLabel = (level: LevelDef) => `${WORLDS.find((w) => w.id === level.world)?.name ?? ''} · ${LEVELS.filter((l) => l.world === level.world).indexOf(level) + 1}`;

/** Plays from a level on, through Next, until the player leaves; resolves with the last level played. */
export async function levelFlow(index: number): Promise<number> {
  for (;;) {
    const level = LEVELS[index];
    await introduce(level);
    const r = await play(level, campaignLabel(level), par(index), { ghost: loadProgress()[level.id]?.run });
    if (!r) return index;
    const { state: s, clean } = r;
    const p = par(index);
    const stars = starsFor(s.moves, p);
    const best = saveResult(level.id, stars, s.moves, clean, r.moves);
    const extra = newTrophies();
    // Next stays inside the world; after its last level, back to the map.
    const next = index + 1 < LEVELS.length && LEVELS[index + 1].world === level.world ? index + 1 : -1;
    let choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best, clean, hasNext: next >= 0, extra, watch: !!loadProgress()[level.id]?.run });
    // Watching the best run comes back to the same summary.
    while (choice === 'watch') {
      const run = loadProgress()[level.id]?.run;
      if (run) await play(level, t('campaign.replay', { label: campaignLabel(level) }), p, { autoplay: run });
      choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best: false, clean, hasNext: next >= 0, extra: '', watch: true });
    }
    if (choice === 'levels') return index;
    if (choice === 'next') {
      await view.leave();
      index = next;
    }
  }
}

/** The world map: pick a world and a level, play, come back to the same world. */
export async function worldsFlow(start: number) {
  let at = { world: start, sheet: false };
  for (;;) {
    const p = loadProgress();
    screen.mode = 'map';
    map.setLocked(WORLDS.map((_, k) => !isWorldOpen(k, p)));
    const total = totalStars(p);
    const cards = WORLDS.map((w, k) => {
      const levels = worldLevels(w.id);
      return {
        name: w.name,
        mechanic: w.mechanic,
        stars: worldStars(w.id, p),
        maxStars: levels.length * 3,
        open: isWorldOpen(k, p),
        missing: Math.max(0, worldGate(k) - total),
        gate: worldGate(k),
        soon: levels.length === 0,
        levels: levels.map(({ l, i }) => ({ index: i, name: levelText(l).name, difficulty: l.difficulty, stars: p[l.id]?.stars ?? 0, unlocked: isUnlocked(i, p), best: p[l.id]?.moves ?? 0, par: par(i), clean: !!p[l.id]?.clean })),
      };
    });
    const i = await showWorlds(cards, at, { select: (k) => (map.select(k), sound.setMusic(settings.music, settings.musicVolume, WORLDS[k].id)), pick: (x, y) => map.pick(x, y) }, click);
    if (i === null) return;
    const last = await levelFlow(i);
    at = { world: worldIndex(last), sheet: true };
  }
}
