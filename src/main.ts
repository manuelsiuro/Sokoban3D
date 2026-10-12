import * as THREE from 'three';
import './styles/index.css';
import { EVENT, Sim, type GameState } from './sim/Sim';
import { LEVELS } from './levels/levels';
import { SOLUTIONS } from './levels/solutions';
import { WORLDS } from './levels/worlds';
import { View } from './render/View';
import { Sound } from './audio/Sound';
import { loadSettings, saveSettings } from './game/settings';
import { migrateStorage } from './game/storage';
import { isUnlocked, loadProgress, nextLevel, saveResult, totalStars } from './game/progress';
import { starLimits, starsFor } from './game/score';
import { TOUCH, h, setText } from './ui/dom';
import { icon } from './ui/icons';
import { showTitle } from './ui/screens/title';
import { showLevels } from './ui/screens/levels';
import { showSummary } from './ui/screens/summary';
import { registerServiceWorker } from './app/pwa';

/**
 * Wiring: storage first, then the long-lived objects, then the flows between screens.
 * Screens are functions that resolve with the player's choice, so each flow reads as a
 * script (title → levels → play → summary → …).
 */
migrateStorage();
const settings = loadSettings();
const sound = new Sound();
const applySound = () => sound.setVolume(settings.muted ? 0 : settings.sfxVolume);
applySound();
const click = () => sound.click();
const par = (index: number) => SOLUTIONS[LEVELS[index].id]?.length ?? 0;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
const view = new View(renderer);
view.reducedMotion = settings.reducedMotion;

/** The level on screen (also behind the menus). */
let sim = new Sim(LEVELS[0]);
let shown: GameState = sim.state;
function showLevel(index: number) {
  sim = new Sim(LEVELS[index]);
  shown = sim.state;
  view.setLevel(LEVELS[index], sim.grid, shown);
}
showLevel(nextLevel() ?? 0);

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
     <span class="sep"></span>
     <button class="icon-btn" data-a="left" aria-label="Turn the camera (Q)">${icon('rotateLeft')}</button>
     <button class="icon-btn" data-a="right" aria-label="Turn the camera (E)">${icon('rotateRight')}</button>
   </div>
   <p class="hud-tip gone"></p>
   ${
     TOUCH
       ? `<div class="dpad">${[0, 1, 2, 3].map((d) => `<button data-d="${d}" aria-label="${['Up', 'Right', 'Down', 'Left'][d]}">${icon(['up', 'chevronRight', 'down', 'chevronLeft'][d], 26)}</button>`).join('')}</div>`
       : '<div class="hud-keys"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> or <kbd>WASD</kbd> move<br><kbd>Z</kbd> undo · <kbd>Y</kbd> redo · <kbd>R</kbd> restart<br><kbd>Q</kbd> <kbd>E</kbd> turn the camera</div>'
   }`,
);
document.body.append(hud);
const $ = <T extends Element = HTMLElement>(sel: string) => hud.querySelector<T & HTMLElement>(sel)!;
const tip = $('.hud-tip');
let tipTimer = 0;

function updateHud() {
  const s = shown;
  setText($('.hud-moves b'), String(s.moves));
  setText($('.hud-moves small'), `/ par ${par(run?.index ?? 0)}`);
  $<HTMLButtonElement>('[data-a="undo"]').disabled = sim.frame === 0;
}

// ------------------------------------------------------------------ playing
interface Run {
  index: number;
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

/** Plays a level until it's solved; resolves with the final state (null if the player left). */
function play(index: number): Promise<RunResult | null> {
  showLevel(index);
  view.idle = false;
  const level = LEVELS[index];
  const world = WORLDS.find((w) => w.id === level.world);
  setText($('.hud-title small'), `${world?.name ?? ''} · ${LEVELS.filter((l) => l.world === level.world).indexOf(level) + 1}`);
  setText($('.hud-title b'), level.name);
  tip.textContent = level.tip;
  tip.classList.remove('gone');
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tip.classList.add('gone'), 9000);
  hud.classList.remove('hidden');
  return new Promise((resolve) => {
    run = { index, clean: true, over: false, done: resolve };
    updateHud();
  });
}

function endRun(state: GameState | null) {
  const r = run;
  if (!r) return;
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
  } else sound.undo();
  updateHud();
  if (s.moves >= 3) tip.classList.add('gone');
  if (forward && s.events & EVENT.win && run) {
    run.over = true;
    sound.win();
    view.celebrate();
    setTimeout(() => endRun(s), 1100);
  }
}

/** A move in a screen direction (0 up, 1 right, 2 down, 3 left). */
function move(screen: number) {
  if (!run || run.over) return;
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
  if (run.over) return;
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

const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const ACTIONS: Record<string, string> = { KeyZ: 'undo', Backspace: 'undo', KeyY: 'redo', KeyR: 'restart', KeyQ: 'left', KeyE: 'right', Escape: 'back' };
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
  view.draw(now / 1000);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------------ flows
async function levelFlow(index: number): Promise<void> {
  for (;;) {
    const r = await play(index);
    if (!r) return;
    const { state: s, clean } = r;
    const p = par(index);
    const stars = starsFor(s.moves, p);
    const best = saveResult(LEVELS[index].id, stars, s.moves, clean);
    const choice = await showSummary({ stars, moves: s.moves, pushes: s.pushes, par: p, limits: starLimits(p), best, clean, hasNext: index + 1 < LEVELS.length }, click);
    if (choice === 'levels') return;
    if (choice === 'next') index++;
  }
}
async function pickLevel(): Promise<number | null> {
  const p = loadProgress();
  return showLevels(
    WORLDS.map((w) => ({
      name: w.name,
      mechanic: w.mechanic,
      levels: LEVELS.map((l, i) => ({ l, i }))
        .filter(({ l }) => l.world === w.id)
        .map(({ l, i }) => ({ index: i, name: l.name, difficulty: l.difficulty, stars: p[l.id]?.stars ?? 0, unlocked: isUnlocked(i, p), best: p[l.id]?.moves ?? 0, par: par(i), clean: !!p[l.id]?.clean })),
    })),
    click,
  );
}

async function titleFlow() {
  for (;;) {
    const p = loadProgress();
    const next = nextLevel(p);
    showLevel(next ?? 0);
    view.idle = true;
    const choice = await showTitle(
      {
        stars: totalStars(p),
        maxStars: LEVELS.length * 3,
        solved: LEVELS.filter((l) => (p[l.id]?.stars ?? 0) > 0).length,
        levels: LEVELS.length,
        next: next === null ? null : { name: LEVELS[next].name, number: next + 1 },
        fresh: Object.keys(p).length === 0,
        muted: settings.muted,
        toggleSound: () => {
          settings.muted = !settings.muted;
          saveSettings(settings);
          applySound();
          return settings.muted;
        },
      },
      click,
    );
    if (choice === 'play') {
      await levelFlow(next ?? 0);
      continue;
    }
    for (;;) {
      const i = await pickLevel();
      if (i === null) break;
      await levelFlow(i);
    }
  }
}

titleFlow();
registerServiceWorker(() => {});
