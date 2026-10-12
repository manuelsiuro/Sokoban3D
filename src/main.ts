import * as THREE from 'three';
import './styles/index.css';
import { EVENT, Sim, type GameState } from './sim/Sim';
import { LEVELS } from './levels/levels';
import { SOLUTIONS } from './levels/solutions';
import { WORLDS } from './levels/worlds';
import { View } from './render/View';
import { MapView } from './render/MapView';
import { Sound } from './audio/Sound';
import { loadSettings, resetProgress, saveSettings } from './game/settings';
import { KEYS as STORE, migrateStorage, readJSON, writeJSON } from './game/storage';
import { ACHIEVEMENTS, OUTFITS, SKINS, builtOne, checkAchievements, earned, markBuilt, unlockedCosmetics } from './game/achievements';
import { today } from './game/daily';
import { cacheDaily, cachedDaily, currentStreak, loadDaily, saveDaily } from './game/dailyProgress';
import { decodeLevel, shareLink } from './game/share';
import { initialState } from './sim/Sim';
import { parseLevel } from './sim/grid';
import { isUnlocked, isWorldOpen, loadProgress, nextLevel, saveResult, totalStars, worldGate, worldLevels, worldStars } from './game/progress';
import { starLimits, starsFor } from './game/score';
import { TOUCH, closeOverlay, h, setText } from './ui/dom';
import { icon } from './ui/icons';
import { showTitle } from './ui/screens/title';
import { showWorlds } from './ui/screens/worlds';
import { showSummary } from './ui/screens/summary';
import { newDraft, showEditor, type Draft } from './ui/screens/editor';
import { showSettings } from './ui/screens/settings';
import { showTrophies } from './ui/screens/trophies';
import { showUpdate } from './ui/screens/update';
import { installKind, promptInstall } from './app/install';
import { showInstallHelp } from './ui/screens/installHelp';
import { registerServiceWorker } from './app/pwa';
import { generateDaily, hint } from './app/helper';
import { ghostPath, runSolves, type GhostStep } from './game/ghost';
import { DIRS } from './sim/grid';
import type { LevelDef } from './levels/types';

/**
 * Wiring: storage first, then the long-lived objects, then the flows between screens.
 * Screens are functions that resolve with the player's choice, so each flow reads as a
 * script (title → levels → play → summary → …).
 */
migrateStorage();
const settings = loadSettings();
const sound = new Sound();
const applySound = () => {
  sound.setVolume(settings.muted ? 0 : settings.sfxVolume);
  sound.setMusic(settings.music, settings.musicVolume);
};
applySound();
const click = () => sound.click();
const par = (index: number) => SOLUTIONS[LEVELS[index].id]?.length ?? 0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const view = new View(renderer);
view.reducedMotion = settings.reducedMotion;
const map = new MapView(renderer, WORLDS);
addEventListener('resize', () => map.resize());
map.resize();
/** Which scene the frame loop draws. */
let mode: 'level' | 'map' = 'level';

/** The level on screen (also behind the menus). */
let sim = new Sim(LEVELS[0]);
let shown: GameState = sim.state;
function showLevel(level: LevelDef) {
  sound.setMusic(settings.music, settings.musicVolume, level.world);
  sim = new Sim(level);
  shown = sim.state;
  view.setLevel(level, sim.grid, shown);
}
showLevel(LEVELS[nextLevel() ?? 0]);

// ------------------------------------------------------------------ HUD
const hud = h(
  'div',
  'hud hidden',
  `<div class="hud-top">
     <button class="icon-btn" data-a="back" aria-label="Back to the levels">${icon('chevronLeft')}</button>
     <div class="hud-title"><small></small><b></b></div>
     <span class="pill big hud-moves"><b>0</b>&nbsp;<small>/ par 0</small></span>
   </div>
   <div class="hud-bar">
     <button class="icon-btn" data-a="undo" aria-label="Undo (Z)">${icon('undo')}</button>
     <button class="icon-btn" data-a="restart" aria-label="Restart (R)">${icon('replay')}</button>
     <button class="icon-btn" data-a="hint" aria-label="Hint (H)">${icon('bulb')}</button>
     <span class="sep"></span>
     <button class="icon-btn" data-a="left" aria-label="Turn the camera (Q)">${icon('rotateLeft')}</button>
     <button class="icon-btn" data-a="right" aria-label="Turn the camera (E)">${icon('rotateRight')}</button>
   </div>
   <p class="hud-tip gone"></p>
   ${
     TOUCH
       ? `<div class="dpad">${[0, 1, 2, 3].map((d) => `<button data-d="${d}" aria-label="${['Up', 'Right', 'Down', 'Left'][d]}">${icon(['up', 'chevronRight', 'down', 'chevronLeft'][d], 26)}</button>`).join('')}</div>`
       : '<div class="hud-keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>WASD</kbd> move<br><kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>R</kbd> restart · <kbd>H</kbd> hint<br><kbd>Q</kbd> <kbd>E</kbd> turn the camera</div>'
   }`,
);
document.body.append(hud);
const $ = <T extends Element = HTMLElement>(sel: string) => hud.querySelector<T & HTMLElement>(sel)!;
const tip = $('.hud-tip');
let tipTimer = 0;

function updateHud() {
  const s = shown;
  setText($('.hud-moves b'), String(s.moves));
  setText($('.hud-moves small'), run?.par ? `/ par ${run.par}` : 'moves');
  $<HTMLButtonElement>('[data-a="undo"]').disabled = sim.frame === 0;
  if (run?.ghost) view.setGhost(run.ghost[Math.min(s.moves, run.ghost.length - 1)]);
}

// ------------------------------------------------------------------ playing
interface Run {
  level: LevelDef;
  /** The best run's path, shown as a ghost (null: none). */
  ghost: GhostStep[] | null;
  /** A replay plays by itself: the player only watches. */
  watching: boolean;
  timer: number;
  /** The fewest moves (0: unknown). */
  par: number;
  /** No undo or restart used. */
  clean: boolean;
  /** Solved: input is closed while the summary comes. */
  over: boolean;
  done: (result: RunResult | null) => void;
}
interface RunResult {
  state: GameState;
  clean: boolean;
}
let run: Run | null = null;

/** A campaign level's label: its world and number. */
const campaignLabel = (level: LevelDef) => `${WORLDS.find((w) => w.id === level.world)?.name ?? ''} · ${LEVELS.filter((l) => l.world === level.world).indexOf(level) + 1}`;

/**
 * Plays a level until it's solved; resolves with the final state (null if the player left).
 * `ghost`: a recorded run to show as a ghost; `autoplay`: a run to replay by itself.
 */
function play(level: LevelDef, label: string, levelPar: number, opts: { ghost?: string; autoplay?: string } = {}): Promise<RunResult | null> {
  showLevel(level);
  mode = 'level';
  view.idle = false;
  setText($('.hud-title small'), label);
  setText($('.hud-title b'), level.name);
  tip.textContent = level.tip;
  tip.classList.remove('gone');
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tip.classList.add('gone'), 9000);
  hud.classList.remove('hidden');
  return new Promise((resolve) => {
    const ghost = settings.ghost && opts.ghost && !opts.autoplay && runSolves(level, opts.ghost) ? ghostPath(level, opts.ghost) : null;
    document.body.classList.add('is-playing');
    run = { level, par: levelPar, ghost, watching: !!opts.autoplay, timer: 0, clean: true, over: false, done: resolve };
    hud.classList.toggle('watching', !!opts.autoplay);
    if (opts.autoplay) {
      // A replay: one move every quarter second, through the same rules and animations.
      const moves = opts.autoplay.toLowerCase();
      let k = 0;
      const r = run;
      say('Replay of your best run', 4000);
      r.timer = window.setInterval(() => {
        if (run !== r || r.over || k >= moves.length) return clearInterval(r.timer);
        const prev = shown;
        if (sim.move(DIRS.indexOf(moves[k++]))) present(prev, true);
      }, 260);
    }
    updateHud();
  });
}

function endRun(state: GameState | null) {
  const r = run;
  if (!r) return;
  clearInterval(r.timer);
  view.setGhost(null);
  document.body.classList.remove('is-playing');
  run = null;
  hud.classList.add('hidden');
  r.done(state ? { state, clean: r.clean } : null);
}

/** Shows the sim's current state, animated from the one on screen, with its sounds. */
function present(prev: GameState, forward: boolean) {
  const s = sim.state;
  if (view.animating) view.finish();
  view.show(s, prev);
  shown = s;
  if (forward) {
    const e = s.events;
    if (e & EVENT.lost) sound.lost();
    else if (e & EVENT.fall) sound.fall();
    if (e & EVENT.push) sound.push();
    else if (e & EVENT.climb) sound.climb();
    else sound.step();
    if (e & EVENT.goalOn) sound.goal();
    if (e & EVENT.slide) sound.slide();
    if (e & EVENT.teleport) sound.teleport();
    if (e & EVENT.fill) sound.fill();
    if (e & EVENT.convey) sound.convey();
    if (e & (EVENT.open | EVENT.close)) sound.door((e & EVENT.open) !== 0);
  } else sound.undo();
  updateHud();
  if (s.moves >= 3 && s.moves < 4) tip.classList.add('gone');
  if (forward && s.events & EVENT.win && run) {
    run.over = true;
    sound.win();
    view.celebrate();
    setTimeout(() => endRun(s), 1100);
  }
}

/** A move in a screen direction (0 up, 1 right, 2 down, 3 left). */
function move(screen: number) {
  if (!run || run.over || run.watching) return;
  const prev = shown;
  if (sim.move(view.screenDir(screen))) present(prev, true);
  else sound.bump();
}

function act(a: string) {
  if (!run) return;
  if (a === 'back') {
    click();
    endRun(null);
    return;
  }
  if (a === 'left' || a === 'right') {
    view.rotate(a === 'left' ? -1 : 1);
    click();
    return;
  }
  if (run.over || run.watching) return;
  if (a === 'hint') {
    askHint();
    return;
  }
  const prev = shown;
  if (a === 'undo' && sim.undo()) {
    run.clean = false;
    present(prev, false);
  } else if (a === 'redo' && sim.redo()) present(prev, true);
  else if (a === 'restart' && sim.frame > 0) {
    run.clean = false;
    sim.restart();
    shown = sim.state;
    view.show(shown, null);
    sound.undo();
    updateHud();
  }
}

/** Shows a line in the tip bubble for a while. */
function say(text: string, ms = 5000) {
  tip.textContent = text;
  tip.classList.remove('gone');
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tip.classList.add('gone'), ms);
}

/** Asks the solver (in the worker) for the way on from here; shows the next move as an arrow. */
async function askHint() {
  if (!run || run.over) return;
  click();
  const asked = sim.frame;
  const r = run;
  say('Thinking\u2026', 20000);
  const answer = await hint(sim.level, sim.raw);
  if (run !== r || sim.frame !== asked || r.over) return;
  r.clean = false;
  if (answer.solution) {
    const c = answer.solution[0];
    view.showHint(DIRS.indexOf(c.toLowerCase()));
    say(`${c === c.toUpperCase() ? 'Push' : 'Step'} that way · ${answer.solution.length} ${answer.solution.length === 1 ? 'move' : 'moves'} to go from here`);
  } else say(answer.complete ? 'No way to solve it from here: undo a few moves.' : 'Too many paths to check from here. Try undoing a little.');
}

const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const ACTIONS: Record<string, string> = { KeyH: 'hint', KeyZ: 'undo', Backspace: 'undo', KeyY: 'redo', KeyR: 'restart', KeyQ: 'left', KeyE: 'right', Escape: 'back' };
addEventListener('keydown', (e) => {
  if (!run || e.metaKey || e.ctrlKey || e.altKey) {
    // Ctrl/Cmd+Z also undoes.
    if (run && (e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
      e.preventDefault();
      act(e.shiftKey ? 'redo' : 'undo');
    }
    return;
  }
  const d = KEYS[e.code];
  if (d !== undefined) {
    e.preventDefault();
    // Held keys repeat at the animation's pace.
    if (e.repeat && view.animating) return;
    move(d);
    return;
  }
  const a = ACTIONS[e.code];
  if (a) {
    e.preventDefault();
    if (e.repeat && a !== 'undo') return;
    if (e.repeat && view.animating) return;
    act(e.code === 'KeyZ' && e.shiftKey ? 'redo' : a);
  }
});

hud.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
  if (a) act(a);
});

// Touch: the d-pad (held: repeats) and swipes on the island.
let repeat = 0;
for (const pad of hud.querySelectorAll<HTMLElement>('[data-d]')) {
  const d = Number(pad.dataset.d);
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try {
      pad.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    move(d);
    clearTimeout(repeat);
    const again = () => {
      move(d);
      repeat = window.setTimeout(again, 150);
    };
    repeat = window.setTimeout(again, 280);
  });
  const up = () => clearTimeout(repeat);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
}
let swipe: { x: number; y: number; id: number } | null = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 28) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  // Keep sliding the finger for more moves.
  swipe.x = e.clientX;
  swipe.y = e.clientY;
});
const endSwipe = () => (swipe = null);
renderer.domElement.addEventListener('pointerup', endSwipe);
renderer.domElement.addEventListener('pointercancel', endSwipe);

function frame(now: number) {
  requestAnimationFrame(frame);
  if (mode === 'map') map.draw(now / 1000);
  else view.draw(now / 1000);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ flows
const worldIndex = (levelIndex: number) => WORLDS.findIndex((w) => w.id === LEVELS[levelIndex].world);

/** A short message at the top of the screen. */
function toast(html: string, ms = 3200) {
  const t = h('div', 'toast', html);
  document.body.append(t);
  setTimeout(() => closeOverlay(t, 400), ms);
}

/** Checks achievements after a solve; returns a line for the summary (and toasts each new one). */
function newTrophies(): string {
  const fresh = checkAchievements({ progress: loadProgress(), daily: loadDaily() });
  fresh.forEach((a, k) => setTimeout(() => toast(`${icon('trophy', 18)} <span>${a.name}${a.reward ? ' · new look in Trophies' : ''}</span>`), 600 + k * 900));
  return fresh.length ? `${icon('trophy', 14)} ${fresh.map((a) => a.name).join(', ')}` : '';
}

/** Puts the chosen crate skin and outfit on (an unknown or locked choice falls back to the default). */
function applyLook() {
  const { skins, outfits } = unlockedCosmetics();
  const skin = SKINS.find((k) => k.id === settings.skin && skins.has(k.id)) ?? SKINS[0];
  const outfit = OUTFITS.find((o) => o.id === settings.outfit && outfits.has(o.id)) ?? OUTFITS[0];
  view.setLook(skin, outfit);
}
applyLook();

/** Copies text (or opens the share sheet on phones); resolves with what happened. */
async function shareText(text: string, url?: string): Promise<string> {
  try {
    if (navigator.share && TOUCH) {
      await navigator.share({ text, url });
      return 'Shared!';
    }
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    return 'Copied!';
  } catch {
    return 'Could not share';
  }
}

/** Plays from a level on, through Next, until the player leaves; resolves with the last level played. */
async function levelFlow(index: number): Promise<number> {
  for (;;) {
    const level = LEVELS[index];
    const r = await play(level, campaignLabel(level), par(index), { ghost: loadProgress()[level.id]?.run });
    if (!r) return index;
    const { state: s, clean } = r;
    const p = par(index);
    const stars = starsFor(s.moves, p);
    const best = saveResult(level.id, stars, s.moves, clean, sim.moves);
    const extra = newTrophies();
    // Next stays inside the world; after its last level, back to the map.
    const next = index + 1 < LEVELS.length && LEVELS[index + 1].world === level.world ? index + 1 : -1;
    let choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best, clean, hasNext: next >= 0, extra, watch: !!loadProgress()[level.id]?.run }, click);
    // Watching the best run comes back to the same summary.
    while (choice === 'watch') {
      const run = loadProgress()[level.id]?.run;
      if (run) await play(level, `${campaignLabel(level)} · replay`, p, { autoplay: run });
      choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best: false, clean, hasNext: next >= 0, extra: '', watch: true }, click);
    }
    if (choice === 'levels') return index;
    if (choice === 'next') index = next;
  }
}

/** The world map: pick a world and a level, play, come back to the same world. */
async function worldsFlow(start: number) {
  let at = { world: start, sheet: false };
  for (;;) {
    const p = loadProgress();
    mode = 'map';
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
        levels: levels.map(({ l, i }) => ({ index: i, name: l.name, difficulty: l.difficulty, stars: p[l.id]?.stars ?? 0, unlocked: isUnlocked(i, p), best: p[l.id]?.moves ?? 0, par: par(i), clean: !!p[l.id]?.clean })),
      };
    });
    const i = await showWorlds(cards, at, { select: (k) => (map.select(k), sound.setMusic(settings.music, settings.musicVolume, WORLDS[k].id)), pick: (x, y) => map.pick(x, y) }, click);
    if (i === null) return;
    const last = await levelFlow(i);
    at = { world: worldIndex(last), sheet: true };
  }
}

/** Today's daily puzzle: generated (or taken from the cache), played, its streak kept. */
async function dailyFlow() {
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
    const choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: daily.par, limits: starLimits(daily.par), best: false, clean: r.clean, hasNext: false, extra, share: () => shareText(text) }, click);
    if (choice !== 'retry') return;
  }
}

/** Plays a level from a share link (#lvl=…), then goes on to the title. */
async function sharedFlow(level: LevelDef, levelPar: number) {
  for (;;) {
    const r = await play(level, 'Shared level', levelPar);
    if (!r) return;
    const s = r.state;
    const stars = levelPar ? starsFor(s.moves, levelPar) : 1;
    const choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: levelPar, limits: starLimits(levelPar), best: false, clean: r.clean, hasNext: false }, click);
    if (choice !== 'retry') return;
  }
}

/** The workshop: edit, test-play, come back to the same draft. */
async function workshopFlow() {
  let draft = readJSON<Draft | null>(STORE.editor, null);
  if (!draft || !Array.isArray(draft.base) || draft.base.length !== draft.w * draft.h) draft = newDraft();
  for (;;) {
    mode = 'level';
    const choice = await showEditor(draft, {
      save: (d) => {
        draft = d;
        writeJSON(STORE.editor, d);
      },
      check: async (level) => {
        const r = await hint(level, initialState(parseLevel(level)));
        return r.solution ? r.solution.length : r.complete ? 0 : -1;
      },
      share: async (level, levelPar) => shareText(`Try my Cratelands level “${level.name}”${levelPar ? ` (par ${levelPar})` : ''}:`, shareLink(level, levelPar)),
      click,
    });
    if (choice.type === 'back') return;
    const r = await play(choice.level, 'Workshop', choice.par);
    if (!r) continue;
    markBuilt();
    const extra = newTrophies();
    const s = r.state;
    await showSummary({ stars: choice.par ? starsFor(s.moves, choice.par) : 1, moves: s.moves, pushes: s.pushes, par: choice.par, limits: starLimits(choice.par), best: false, clean: r.clean, hasNext: false, extra }, click);
  }
}

async function titleFlow() {
  for (;;) {
    const p = loadProgress();
    const next = nextLevel(p);
    showLevel(LEVELS[next ?? 0]);
    mode = 'level';
    view.idle = true;
    // Trophies earned by progress made elsewhere (an older version, another flow).
    newTrophies();
    const have = earned();
    const date = today();
    const choice = await showTitle(
      {
        stars: totalStars(p),
        maxStars: LEVELS.length * 3,
        solved: LEVELS.filter((l) => (p[l.id]?.stars ?? 0) > 0).length,
        levels: LEVELS.length,
        worlds: WORLDS.length,
        worldsOpen: WORLDS.filter((_, k) => isWorldOpen(k, p)).length,
        next: next === null ? null : { name: `${LEVELS[next].name} (${WORLDS[worldIndex(next)].name})`, number: worldLevels(LEVELS[next].world).findIndex(({ i }) => i === next) + 1 },
        fresh: Object.keys(p).length === 0,
        muted: settings.muted,
        daily: { streak: currentStreak(date), stars: loadDaily().results[date]?.stars ?? 0 },
        trophies: { have: have.size, total: ACHIEVEMENTS.length },
        toggleSound: () => {
          settings.muted = !settings.muted;
          saveSettings(settings);
          applySound();
          return settings.muted;
        },
      },
      click,
    );
    if (choice === 'play') await levelFlow(next ?? 0);
    else if (choice === 'worlds') await worldsFlow(next === null ? 0 : worldIndex(next));
    else if (choice === 'daily') await dailyFlow();
    else if (choice === 'workshop') await workshopFlow();
    else if (choice === 'install') {
      if (installKind() === 'prompt') await promptInstall();
      else await showInstallHelp(click);
    }
    else if (choice === 'trophies') {
      const { skins, outfits } = unlockedCosmetics(have);
      await showTrophies({ progress: p, daily: loadDaily(), built: builtOne() }, have, { skins, outfits }, { skin: settings.skin, outfit: settings.outfit }, {
        choose: (kind, id) => {
          if (kind === 'skin') settings.skin = id;
          else settings.outfit = id;
          saveSettings(settings);
          applyLook();
        },
        click,
      });
    } else if (choice === 'settings')
      await showSettings(settings, {
        change: (s) => {
          saveSettings(s);
          applySound();
          view.reducedMotion = s.reducedMotion;
        },
        reset: () => resetProgress(),
        install: installKind(),
        promptInstall,
        installHelp: () => showInstallHelp(click),
        click,
      });
  }
}

// A share link (#lvl=…) opens that level first; in dev, ?level=<id> opens a campaign level.
const shared = location.hash.startsWith('#lvl=') ? decodeLevel(location.hash.slice(5)) : null;
if (location.hash.startsWith('#lvl=')) history.replaceState(null, '', location.pathname + location.search);
const devLevel = import.meta.env.DEV ? LEVELS.findIndex((l) => l.id === new URLSearchParams(location.search).get('level')) : -1;
if (shared) sharedFlow(shared.level, shared.par).then(titleFlow);
else if (devLevel >= 0) levelFlow(devLevel).then(titleFlow);
else titleFlow();
// Installed app: offline, and a new version found while the game is open is offered once no
// level is being played (the same system as Line Rider 3D).
registerServiceWorker((version, restart) => showUpdate(version, restart));

// A share link opened while the game runs (only the hash changed): start over with it.
addEventListener('hashchange', () => {
  if (location.hash.startsWith('#lvl=')) location.reload();
});
