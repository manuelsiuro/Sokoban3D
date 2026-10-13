import { EVENT, type GameState } from '../sim/Sim';
import { DIRS } from '../sim/grid';
import type { LevelDef } from '../levels/types';
import { hint } from '../app/helper';
import { click, renderer, screen, settings, showLevel, sound, view } from '../app/context';
import { ghostPath, runSolves, type GhostStep } from '../game/ghost';
import { TOUCH, h, setText } from '../ui/dom';
import { icon } from '../ui/icons';

/**
 * Playing a level: the HUD, the input (keys, d-pad, swipes), the sounds of each move, hints,
 * ghosts and replays. Every mode plays through `play()`.
 */
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
  const s = screen.shown;
  setText($('.hud-moves b'), String(s.moves));
  setText($('.hud-moves small'), run?.par ? `/ par ${run.par}` : 'moves');
  $<HTMLButtonElement>('[data-a="undo"]').disabled = screen.sim.frame === 0;
  if (run?.ghost) view.setGhost(run.ghost[Math.min(s.moves, run.ghost.length - 1)]);
}

// ------------------------------------------------------------------ playing
interface Run {
  level: LevelDef;
  /** The best run's path, screen.shown as a ghost (null: none). */
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
export interface RunResult {
  state: GameState;
  clean: boolean;
  /** The moves made (LURD). */
  moves: string;
}
let run: Run | null = null;

/**
 * Plays a level until it's solved; resolves with the final state (null if the player left).
 * `ghost`: a recorded run to show as a ghost; `autoplay`: a run to replay by itself.
 */
export function play(level: LevelDef, label: string, levelPar: number, opts: { ghost?: string; autoplay?: string } = {}): Promise<RunResult | null> {
  showLevel(level);
  screen.mode = 'level';
  view.idle = false;
  view.intro();
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
        const prev = screen.shown;
        if (screen.sim.move(DIRS.indexOf(moves[k++]))) present(prev, true);
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
  r.done(state ? { state, clean: r.clean, moves: screen.sim.moves } : null);
}

/** Shows the sim's current state, animated from the one on screen, with its sounds. */
function present(prev: GameState, forward: boolean) {
  const s = screen.sim.state;
  if (view.animating) view.finish();
  view.show(s, prev);
  screen.shown = s;
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
    setTimeout(() => endRun(s), 1500);
  }
}

/** A move in a screen direction (0 up, 1 right, 2 down, 3 left). */
function move(dir: number) {
  if (!run || run.over || run.watching) return;
  const prev = screen.shown;
  if (screen.sim.move(view.screenDir(dir))) present(prev, true);
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
  const prev = screen.shown;
  if (a === 'undo' && screen.sim.undo()) {
    run.clean = false;
    present(prev, false);
  } else if (a === 'redo' && screen.sim.redo()) present(prev, true);
  else if (a === 'restart' && screen.sim.frame > 0) {
    run.clean = false;
    screen.sim.restart();
    screen.shown = screen.sim.state;
    view.show(screen.shown, null);
    sound.undo();
    updateHud();
  }
}

/** Shows a line in the tip bubble for a while. */
export function say(text: string, ms = 5000) {
  tip.textContent = text;
  tip.classList.remove('gone');
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tip.classList.add('gone'), ms);
}

/** Asks the solver (in the worker) for the way on from here; shows the next move as an arrow. */
async function askHint() {
  if (!run || run.over) return;
  click();
  const asked = screen.sim.frame;
  const r = run;
  say('Thinking\u2026', 20000);
  const answer = await hint(screen.sim.level, screen.sim.raw);
  if (run !== r || screen.sim.frame !== asked || r.over) return;
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
