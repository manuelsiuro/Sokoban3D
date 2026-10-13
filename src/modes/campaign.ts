import { LEVELS } from '../levels/levels';
import { WORLDS } from '../levels/worlds';
import type { LevelDef } from '../levels/types';
import { click, map, newTrophies, par, screen, settings, showLevel, sound, summary, view, worldIndex } from '../app/context';
import { OPENS_AFTER, isUnlocked, isWorldOpen, saveTime, worldCleared, loadProgress, saveResult, totalStars, worldGate, worldLevels, worldStars } from '../game/progress';
import { formatTime, medalFor, medalTimes, starLimits, starsFor } from '../game/score';
import { showWorlds } from '../ui/screens/worlds';
import { play } from './run';
import { GRANDS, GRAND_SOLUTIONS } from '../levels/grand';
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

/** The level sheet's Grand Island card for a world. */
function grandCardOf(world: string, p: ReturnType<typeof loadProgress>) {
  const g = GRANDS.find((x) => x.world === world);
  if (!g) return undefined;
  return { name: levelText(g).name, stars: p[g.id]?.stars ?? 0, best: p[g.id]?.moves ?? 0, par: GRAND_SOLUTIONS[g.id].length, open: worldCleared(world, p) };
}

/** A world's Grand Island: the big finale, with the camera following the pusher. Par is the best known. */
export async function grandFlow(world: string) {
  const level = GRANDS.find((g) => g.world === world);
  if (!level) return;
  const p = GRAND_SOLUTIONS[level.id].length;
  const label = t('grand.label', { world: WORLDS.find((w) => w.id === world)?.name ?? '' });
  for (;;) {
    const r = await play(level, label, p, { ghost: loadProgress()[level.id]?.run });
    if (!r) return;
    const stars = starsFor(r.state.moves, p);
    const best = saveResult(level.id, stars, r.state.moves, r.clean, r.moves);
    const extra = [r.state.moves < p ? t('grand.beatBest') : '', newTrophies()].filter(Boolean).join(' · ');
    const choice = await summary({ stars, moves: r.state.moves, pushes: r.state.pushes, par: p, limits: starLimits(p), best, clean: r.clean, hasNext: false, extra, bound: true });
    if (choice !== 'retry') return;
  }
}

const MEDAL_KEYS = ['trial.noMedal', 'trial.bronze', 'trial.silver', 'trial.gold'] as const;

/** Time Trial: a solved level against the clock, through Next inside its world; the best time's ghost runs alongside. */
export async function timeTrialFlow(index: number): Promise<number> {
  for (;;) {
    const level = LEVELS[index];
    const p = par(index);
    const saved = loadProgress()[level.id];
    const r = await play(level, t('trial.label', { label: campaignLabel(level) }), p, { timed: { ghost: saved?.timeRun } });
    if (!r || r.time === undefined) return index;
    const medal = medalFor(r.time, p);
    const best = saveTime(level.id, r.time, r.moves, r.at ?? []);
    const extra = newTrophies();
    const times = medalTimes(p);
    const nextMedal = medal < 3 ? t('trial.nextMedal', { medal: t((['medal.bronze', 'medal.silver', 'medal.gold'] as const)[medal]), time: formatTime(times[medal]) }) : t('trial.goldDone');
    const next = index + 1 < LEVELS.length && LEVELS[index + 1].world === level.world ? index + 1 : -1;
    const choice = await summary({
      stars: medal,
      moves: r.state.moves,
      pushes: r.state.pushes,
      par: p,
      limits: starLimits(p),
      best,
      clean: r.clean,
      hasNext: next >= 0,
      extra,
      time: { text: formatTime(r.time), medal: t(MEDAL_KEYS[medal]), next: nextMedal, gold: medal === 3 },
    });
    if (choice === 'levels') return index;
    if (choice === 'next') {
      await view.leave();
      index = next;
    }
  }
}

/** The world map: pick a world and a level, play, come back to the same world. */
export async function worldsFlow(start: number) {
  let at = { world: start, sheet: false, timed: false };
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
        opensAfter: OPENS_AFTER[w.id] ? WORLDS.find((x) => x.id === OPENS_AFTER[w.id])?.name : undefined,
        gate: worldGate(k),
        soon: levels.length === 0,
        trial: worldCleared(w.id, p),
        grand: grandCardOf(w.id, p),
        levels: levels.map(({ l, i }) => ({
          index: i,
          name: levelText(l).name,
          difficulty: l.difficulty,
          stars: p[l.id]?.stars ?? 0,
          unlocked: isUnlocked(i, p),
          best: p[l.id]?.moves ?? 0,
          par: par(i),
          clean: !!p[l.id]?.clean,
          time: p[l.id]?.time,
          medal: p[l.id]?.time !== undefined ? medalFor(p[l.id].time!, par(i)) : 0,
          gold: medalTimes(par(i))[2],
        })),
      };
    });
    const i = await showWorlds(cards, at, { select: (k) => (map.select(k), sound.setMusic(settings.music, settings.musicVolume, WORLDS[k].id)), pick: (x, y) => map.pick(x, y) }, click);
    if (i === null) return;
    if (i.grand) {
      await grandFlow(LEVELS[i.index].world);
      at = { world: worldIndex(i.index), sheet: true, timed: false };
      continue;
    }
    const last = i.timed ? await timeTrialFlow(i.index) : await levelFlow(i.index);
    at = { world: worldIndex(last), sheet: true, timed: i.timed };
  }
}
