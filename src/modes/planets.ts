import { PLANET } from '../levels/worlds/planet';
import { SOLUTIONS } from '../levels/solutions';
import { click, newTrophies, screen, showLevel, summary, view } from '../app/context';
import { loadProgress, saveResult } from '../game/progress';
import { starLimits, starsFor } from '../game/score';
import { KEYS as STORE, readJSON, writeJSON } from '../game/storage';
import { h } from '../ui/dom';
import { levelText, t } from '../i18n';
import { PLANET_PIC, showPlanets } from '../ui/screens/planets';
import type { LevelCard } from '../ui/screens/worlds';
import { play } from './run';

/**
 * Planets: Sokoban on little cube worlds (src/sim/cube.ts). A mode of its own on the title
 * screen: ten planets in order, each opening once the one before is solved.
 */
const parOf = (i: number) => SOLUTIONS[PLANET[i].id]?.length ?? 0;
const solved = (i: number, p = loadProgress()) => (p[PLANET[i].id]?.stars ?? 0) > 0;
const unlocked = (i: number, p = loadProgress()) => i === 0 || solved(i - 1, p);

/** The planet to offer: the first open one not yet solved (or the last). */
export function nextPlanet() {
  const p = loadProgress();
  const i = PLANET.findIndex((_, k) => unlocked(k, p) && !solved(k, p));
  return i < 0 ? PLANET.length - 1 : i;
}

/** For the title screen: planets solved, out of how many. */
export function planetsDone() {
  const p = loadProgress();
  return { solved: PLANET.filter((_, k) => solved(k, p)).length, levels: PLANET.length };
}

/** The first time in: a card on how a planet works, over the first planet. Once. */
async function introduce() {
  const stored = readJSON<unknown>(STORE.seen, []);
  const seen = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
  if (seen.includes('planets')) return;
  writeJSON(STORE.seen, [...seen, 'planets']);
  const el = h(
    'div',
    'modal',
    `<div class="card intro-card"><p class="intro-kicker">${t('planets.kicker')}</p><h2>${t('planets.title')}</h2><div class="intro-pic">${PLANET_PIC}</div><p class="intro-tip">${t('planets.intro')}</p><p class="intro-tip">${t('planets.globe')}</p><div class="actions"><button class="big-btn primary" data-done>${t('intro.go')}</button></div></div>`,
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

/** Shows a planet turning behind the menus, seen whole. */
function preview(i: number) {
  showLevel(PLANET[i]);
  screen.mode = 'level';
  view.idle = true;
  view.overview = true;
  // The list covers the bottom of the screen: the planet turns above it.
  view.raise = innerHeight < 500 ? 0.24 : 0.17;
}

function cards(): LevelCard[] {
  const p = loadProgress();
  return PLANET.map((l, i) => ({
    index: i,
    name: levelText(l).name,
    difficulty: l.difficulty,
    stars: p[l.id]?.stars ?? 0,
    unlocked: unlocked(i, p),
    best: p[l.id]?.moves ?? 0,
    par: parOf(i),
    clean: !!p[l.id]?.clean,
    medal: 0,
    gold: 0,
  }));
}

export async function planetsFlow() {
  let pick = nextPlanet();
  for (;;) {
    preview(pick);
    const list = cards();
    const i = await showPlanets(list, { stars: list.reduce((n, c) => n + c.stars, 0), max: list.length * 3 }, preview, click);
    if (i === null) return;
    pick = await playFrom(i);
  }
}

/** Plays from a planet on, through Next, until the player leaves; resolves with the last one played. */
async function playFrom(index: number): Promise<number> {
  for (;;) {
    const level = PLANET[index];
    if (index === 0) {
      preview(0);
      await introduce();
    }
    const p = parOf(index);
    const r = await play(level, t('planets.label', { n: index + 1 }), p, { ghost: loadProgress()[level.id]?.run });
    if (!r) return index;
    const { state: s, clean } = r;
    const stars = starsFor(s.moves, p);
    const best = saveResult(level.id, stars, s.moves, clean, r.moves);
    const extra = newTrophies();
    const next = index + 1 < PLANET.length ? index + 1 : -1;
    let choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best, clean, hasNext: next >= 0, extra, watch: !!loadProgress()[level.id]?.run });
    while (choice === 'watch') {
      const run = loadProgress()[level.id]?.run;
      if (run) await play(level, t('campaign.replay', { label: t('planets.label', { n: index + 1 }) }), p, { autoplay: run });
      choice = await summary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best: false, clean, hasNext: next >= 0, extra: '', watch: true });
    }
    if (choice === 'levels') return index;
    if (choice === 'next') {
      await view.leave();
      index = next;
    } else if (choice !== 'retry') return index;
  }
}
