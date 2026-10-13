import { EVENT, inputOf, neighbour, type GameState } from '../sim/Sim';
import { DIRS } from '../sim/grid';
import type { LevelDef } from '../levels/types';
import { hint } from '../app/helper';
import { buzz } from '../app/haptics';
import { startGamepad } from '../app/gamepad';
import { TILE } from '../sim/grid';
import { walkTo } from '../game/path';
import { Coach } from './coach';
import { levelText, t, type Key } from '../i18n';
import { click, renderer, screen, settings, showLevel, sound, view } from '../app/context';
import { ghostPath, runSolves, type GhostStep } from '../game/ghost';
import { formatTime } from '../game/score';
import { isWorldOpen, loadProgress } from '../game/progress';
import { WORLDS } from '../levels/worlds';
import { showHelp } from '../ui/screens/help';
import { TOUCH, h, setText } from '../ui/dom';
import { icon } from '../ui/icons';
import { CRATE_COLORS } from '../render/mechanics';

/**
 * Playing a level: the HUD, the input (keys, d-pad, swipes, taps, gamepads), the sounds of each move, hints,
 * ghosts and replays. Every mode plays through `play()`.
 */
// ------------------------------------------------------------------ HUD
const hud = h(
  'div',
  'hud hidden',
  `<div class="hud-top">
     <button class="icon-btn" data-a="back" data-l="hud.back">${icon('chevronLeft')}</button>
     <button class="hud-title" data-a="tip" data-l="hud.tipAgain"><small></small><b></b></button>
     <button class="icon-btn hud-help" data-a="help" data-l="hud.help">${icon('help')}</button>
     <span class="hud-pills"><span class="pill big hud-moves"><b>0</b>&nbsp;<small>/ par 0</small></span><span class="pill big hud-timer gone">${icon('clock', 16)}<b>0.0</b><i class="hud-pen"></i></span></span>
   </div>
   <div class="hud-bar">
     <button class="icon-btn" data-a="undo" data-l="hud.undo">${icon('undo')}</button>
     <button class="icon-btn" data-a="restart" data-l="hud.restart">${icon('replay')}</button>
     <button class="icon-btn" data-a="hint" data-l="hud.hint">${icon('bulb')}</button>
     <button class="icon-btn hud-view gone" data-a="overview" data-l="hud.overview" aria-pressed="false">${icon('map')}</button>
     <button class="icon-btn hud-grab gone" data-a="grab" data-l="hud.grab" aria-pressed="false">${icon('hand')}</button>
     <button class="icon-btn hud-skip gone" data-a="skip" data-l="hud.skip">${icon('compass')}<b class="hud-count"></b></button>
     <span class="sep"></span>
     <button class="icon-btn" data-a="left" data-l="hud.turnLeft">${icon('rotateLeft')}</button>
     <button class="icon-btn" data-a="right" data-l="hud.turnRight">${icon('rotateRight')}</button>
   </div>
   <button class="hud-minimap gone" data-a="minimap" data-l="hud.minimap"></button>
   <p class="hud-tip gone" role="status" aria-live="polite"></p>
   ${
     TOUCH
       ? `<div class="dpad">${[0, 1, 2, 3].map((d) => `<button data-d="${d}" data-l="${['hud.up', 'hud.right', 'hud.down', 'hud.left'][d]}">${icon(['up', 'chevronRight', 'down', 'chevronLeft'][d], 26)}</button>`).join('')}</div>`
       : '<div class="hud-keys"></div>'
   }`,
);
document.body.append(hud);
const $ = <T extends Element = HTMLElement>(sel: string) => hud.querySelector<T & HTMLElement>(sel)!;
/** Puts the HUD's labels in the current language (the HUD is built once; the language can change). */
function labelHud() {
  for (const b of hud.querySelectorAll<HTMLElement>('[data-l]')) b.setAttribute('aria-label', t(b.dataset.l as Key));
  const keys = hud.querySelector('.hud-keys');
  if (keys) keys.innerHTML = t('hud.keys');
}
const tip = $('.hud-tip');
let tipTimer = 0;

function updateHud() {
  const s = screen.shown;
  setText($('.hud-moves b'), String(s.moves));
  setText($('.hud-moves small'), run?.par ? t('hud.par', { par: run.par }) : t('hud.moves'));
  $<HTMLButtonElement>('[data-a="undo"]').disabled = screen.sim.frame === 0;
  if (run?.ghost) view.setGhost(run.ghost[Math.min(s.moves, run.ghost.length - 1)]);
  drawMinimap();
}

/** The Look button shows whether the free camera is on (planets). */
function syncLook() {
  const b = $('.hud-view');
  const on = view.looking;
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}

/**
 * Planets: the unfolded cube in a corner, with the pads, crates and the pusher (and an arrow
 * for which way is up on screen), so the far side is never a mystery.
 */
function drawMinimap() {
  const el = $('.hud-minimap');
  const g = screen.sim.grid;
  if (!g.planet || !run) {
    el.classList.add('gone');
    return;
  }
  el.classList.remove('gone');
  const s = screen.shown;
  const C = 10;
  const n = g.planet;
  const parts: string[] = [];
  const at = (c: number) => [(c % g.w) * C, Math.floor(c / g.w) * C];
  const here = Math.floor((s.cell % g.w) / n) + Math.floor(Math.floor(s.cell / g.w) / n) * 4;
  // The faces, the one the pusher is on outlined.
  for (const [fx, fy] of [[1, 0], [0, 1], [1, 1], [2, 1], [3, 1], [1, 2]]) parts.push(`<rect class="mm-face${fx + fy * 4 === here ? ' here' : ''}" x="${fx * n * C}" y="${fy * n * C}" width="${n * C}" height="${n * C}" rx="3"/>`);
  for (let c = 0; c < g.w * g.h; c++) {
    if (g.floor[c] === -100) continue;
    const [x, y] = at(c);
    if (g.wall[c]) parts.push(`<rect class="mm-wall" x="${x + 1}" y="${y + 1}" width="${C - 2}" height="${C - 2}" rx="1.5"/>`);
    else if (g.tile[c] === TILE.ice) parts.push(`<rect class="mm-ice" x="${x + 1}" y="${y + 1}" width="${C - 2}" height="${C - 2}" rx="1.5"/>`);
    else if (g.tile[c] === TILE.pit && !s.crates.some((k) => k.cell === c)) parts.push(`<rect class="mm-pit" x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" rx="1"/>`);
    else if (g.tile[c] === TILE.teleport) parts.push(`<circle class="mm-tele" cx="${x + C / 2}" cy="${y + C / 2}" r="3"/>`);
    if (g.goal[c]) parts.push(`<circle class="mm-goal" cx="${x + C / 2}" cy="${y + C / 2}" r="3.3" style="stroke:${MM_COLORS[g.goalColor[c]]}"/>`);
  }
  for (const k of s.crates) {
    if (k.cell < 0) continue;
    const [x, y] = at(k.cell);
    const done = g.goal[k.cell] && (!g.goalColor[k.cell] || g.goalColor[k.cell] === k.kind);
    parts.push(`<rect class="mm-crate${done ? ' done' : ''}" x="${x + 2}" y="${y + 2}" width="${C - 4}" height="${C - 4}" rx="1.2" style="fill:${k.kind >= 1 && k.kind <= 4 ? MM_COLORS[k.kind] : ''}"/>`);
  }
  // The pusher, and the way "up" on screen goes from it.
  const [px, py] = at(s.cell);
  const d = view.screenDir(0);
  const ax = [0, 1, 0, -1][d];
  const ay = [-1, 0, 1, 0][d];
  const cx = px + C / 2;
  const cy = py + C / 2;
  // A chevron just ahead of the dot: tip 9 out, wings 5 out and 3 to each side.
  parts.push(`<path class="mm-up" d="M${cx + ax * 5 - ay * 3} ${cy + ay * 5 + ax * 3}L${cx + ax * 9} ${cy + ay * 9}L${cx + ax * 5 + ay * 3} ${cy + ay * 5 - ax * 3}"/>`);
  parts.push(`<circle class="mm-me" cx="${px + C / 2}" cy="${py + C / 2}" r="3.4"/>`);
  el.innerHTML = `<svg viewBox="-2 -2 ${4 * n * C + 4} ${3 * n * C + 4}" aria-hidden="true">${parts.join('')}</svg>`;
}
const MM_COLORS = ['#ffd447', ...CRATE_COLORS.slice(1).map((c) => `#${c.toString(16).padStart(6, '0')}`)];

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
  /** Time Trial: the clock starts on the first move (-1 before), undo adds penalties (ms), each frame's time. */
  timed?: { start: number; penalty: number; at: number[]; final: number; ghost: { steps: GhostStep[]; at: number[] } | null };
  /** Expedition compasses left (undefined: no skipping here); `giveUp`: pressed once with none. */
  skip?: number;
  giveUp?: boolean;
  done: (result: RunResult | null) => void;
}
export interface RunResult {
  state: GameState;
  clean: boolean;
  /** The moves made (LURD). */
  moves: string;
  /** Left with the Skip button (Expedition), not solved. */
  skipped?: boolean;
  /** Time Trial: the time (ms, penalties in) and when each move of `moves` was made. */
  time?: number;
  at?: number[];
}
let run: Run | null = null;

/**
 * Plays a level until it's solved; resolves with the final state (null if the player left).
 * `ghost`: a recorded run to show as a ghost; `autoplay`: a run to replay by itself.
 */
export function play(level: LevelDef, label: string, levelPar: number, opts: { ghost?: string; autoplay?: string; skip?: number; timed?: { ghost?: { moves: string; at: number[] } } } = {}): Promise<RunResult | null> {
  showLevel(level);
  screen.mode = 'level';
  view.idle = false;
  view.intro();
  labelHud();
  const text = levelText(level);
  setText($('.hud-title small'), label);
  setText($('.hud-title b'), text.name);
  tip.textContent = text.tip;
  // No tip (generated islands): no bubble.
  tip.classList.toggle('gone', !text.tip);
  clearTimeout(tipTimer);
  tipTimer = window.setTimeout(() => tip.classList.add('gone'), 9000);
  hud.classList.remove('hidden');
  return new Promise((resolve) => {
    const ghost = settings.ghost && opts.ghost && !opts.autoplay && runSolves(level, opts.ghost) ? ghostPath(level, opts.ghost) : null;
    document.body.classList.add('is-playing');
    run = { level, par: levelPar, ghost, watching: !!opts.autoplay, timer: 0, clean: true, over: false, done: resolve, skip: opts.skip };
    $('.hud-skip').classList.toggle('gone', opts.skip === undefined);
    $('.hud-timer').classList.toggle('gone', !opts.timed);
    // The clock doesn't stop for the rules: no help button against it.
    $('.hud-help').classList.toggle('gone', !!opts.timed || !!opts.autoplay);
    if (opts.timed) {
      const tg = opts.timed.ghost;
      const steps = settings.ghost && tg && runSolves(level, tg.moves) ? ghostPath(level, tg.moves) : null;
      run.timed = { start: -1, penalty: 0, at: [0], final: 0, ghost: steps && tg ? { steps, at: tg.at } : null };
      run.ghost = null;
      tick(run);
    }
    $('.hud-grab').classList.toggle('gone', !screen.sim.grid.pull || !!opts.autoplay);
    $('.hud-view').classList.toggle('gone', !view.follows);
    $('.hud-view').classList.remove('on');
    // On a planet the overview is the whole globe.
    const globe = screen.sim.grid.planet > 0;
    $('.hud-view').innerHTML = icon(globe ? 'globe' : 'map');
    $('.hud-view').dataset.l = globe ? 'hud.globe' : 'hud.overview';
    $('.hud-view').setAttribute('aria-label', t(globe ? 'hud.globe' : 'hud.overview'));
    setGrab(false);
    setText($('.hud-count'), String(opts.skip ?? ''));
    hud.classList.toggle('watching', !!opts.autoplay);
    if (opts.autoplay) {
      // A replay: one move every quarter second, through the same rules and animations.
      const moves = opts.autoplay;
      let k = 0;
      const r = run;
      say(t('hud.replay'), 4000);
      r.timer = window.setInterval(() => {
        if (run !== r || r.over || k >= moves.length) return clearInterval(r.timer);
        const prev = screen.shown;
        if (screen.sim.move(inputOf(screen.sim.grid, moves[k++]))) present(prev, true);
      }, 260);
    }
    updateHud();
    if (coach.start(level.id, !!opts.autoplay)) tip.classList.add('coach');
    else tip.classList.remove('coach');
  });
}

// Time Trial: time spent away (another app, a call) is not counted.
let hiddenAt = -1;
document.addEventListener('visibilitychange', () => {
  const tm = run?.timed;
  if (document.hidden) hiddenAt = performance.now();
  else if (hiddenAt >= 0) {
    if (tm && tm.start >= 0 && !run!.over) tm.start += performance.now() - hiddenAt;
    hiddenAt = -1;
  }
});

/** The Time Trial clock: elapsed ms with penalties (0 before the first move). */
const elapsed = (r: Run) => (!r.timed || r.timed.start < 0 ? 0 : (r.over ? r.timed.final : performance.now() - r.timed.start + r.timed.penalty));

/** Each frame of a Time Trial: the clock, and the best time's ghost where it was at this time. */
function tick(r: Run) {
  if (run !== r || !r.timed) return;
  const ms = elapsed(r);
  setText($('.hud-timer b'), formatTime(ms));
  const g = r.timed.ghost;
  if (g) {
    let k = 0;
    while (k < g.at.length && g.at[k] <= ms && r.timed.start >= 0) k++;
    view.setGhost(g.steps[Math.min(k, g.steps.length - 1)]);
  }
  requestAnimationFrame(() => tick(r));
}

function endRun(state: GameState | null, skipped = false) {
  const r = run;
  if (!r) return;
  stopWalk();
  clearTimeout(repeat);
  coach.stop();
  clearInterval(r.timer);
  view.setGhost(null);
  document.body.classList.remove('is-playing');
  run = null;
  hud.classList.add('hidden');
  const timed = r.timed && state ? { time: r.timed.final, at: r.timed.at.slice(1, screen.sim.frame + 1) } : {};
  r.done(state ? { state, clean: r.clean, moves: screen.sim.moves, skipped, ...timed } : null);
}

/** Shows the sim's current state, animated from the one on screen, with its sounds. */
function present(prev: GameState, forward: boolean) {
  const s = screen.sim.state;
  // Time Trial: the clock starts with the first move; each frame keeps the time it was reached.
  const tm = run?.timed;
  if (tm && forward) {
    if (tm.start < 0) tm.start = performance.now();
    tm.at[screen.sim.frame] = Math.round(performance.now() - tm.start + tm.penalty);
  }
  if (view.animating) view.finish();
  view.show(s, prev);
  screen.shown = s;
  if (forward) {
    const e = s.events;
    if (e & EVENT.lost) sound.lost();
    else if (e & EVENT.fall) sound.fall();
    if (e & (EVENT.lost | EVENT.fall)) buzz('fall');
    if (e & (EVENT.push | EVENT.pull)) {
      sound.push();
      buzz('push');
    }
    else if (e & EVENT.climb) sound.climb();
    else sound.step();
    coach.on('move');
    if (e & EVENT.goalOn) {
      coach.on('goal');
      sound.goal();
      buzz('goal');
    }
    if (e & EVENT.slide) sound.slide();
    if (e & EVENT.teleport) sound.teleport();
    if (e & EVENT.fill) {
      // Lava hisses; a pit just swallows.
      const g = screen.sim.grid;
      const inLava = s.crates.some((c, k) => c.cell >= 0 && c.cell !== prev.crates[k].cell && g.tile[c.cell] === TILE.lava && c.z === g.floor[c.cell]);
      if (inLava) {
        sound.lava();
        buzz('lava');
      } else sound.fill();
    }
    if (s.world.lit.length > prev.world.lit.length) sound.lit();
    if (s.world.raised.join() !== prev.world.raised.join()) sound.gate();
    if (e & EVENT.convey) sound.convey();
    if (e & (EVENT.open | EVENT.close)) sound.door((e & EVENT.open) !== 0);
  } else sound.undo();
  updateHud();
  if (s.moves >= 3 && s.moves < 4 && !tip.classList.contains('coach')) tip.classList.add('gone');
  if (forward && s.events & EVENT.win && run) {
    if (run.timed) run.timed.final = run.timed.at[screen.sim.frame];
    run.over = true;
    sound.win();
    buzz('win');
    view.celebrate();
    // Only this run: a level started meanwhile is not closed by the old one's win.
    const r = run;
    setTimeout(() => run === r && endRun(s), 1500);
  }
}

/** Pull levels: the Grab toggle (touch) is on; Shift does the same while held. */
let grab = false;
function setGrab(on: boolean) {
  grab = on;
  const b = $('.hud-grab');
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}

/**
 * A move in a screen direction (0 up, 1 right, 2 down, 3 left). On pull levels, `pull` (or
 * the Grab toggle) steps away dragging the crate behind. Stops a tapped walk.
 */
function move(dir: number, pull = false) {
  stopWalk();
  // A move brings the camera back behind the pusher (the screen's directions are its).
  if (view.looking) {
    view.looking = false;
    syncLook();
  }
  const pulling = screen.sim.grid.pull && (pull || grab);
  moveGrid(view.screenDir(dir) + (pulling ? 4 : 0));
}

/** A move in a grid direction; false when blocked. */
function moveGrid(d: number): boolean {
  if (!run || run.over || run.watching) return false;
  const prev = screen.shown;
  if (screen.sim.move(d)) {
    present(prev, true);
    return true;
  }
  sound.bump();
  buzz('bump');
  return false;
}

// Tap-to-move: a tap next to the pusher steps (or pushes) that way; further away, it walks
// there by the shortest way that moves no crate, one move at the animation's pace.
let walk = 0;
function stopWalk() {
  clearTimeout(walk);
  walk = 0;
}
function tapCell(cell: number) {
  if (!run || run.over || run.watching || cell < 0) return;
  stopWalk();
  if (view.looking) {
    view.looking = false;
    syncLook();
  }
  const g = screen.sim.grid;
  const at = screen.shown.cell;
  // Next door (over a planet's edge too): a single step that way.
  const d = [0, 1, 2, 3].find((k) => neighbour(g, at, k) === cell);
  if (d !== undefined) {
    // Pull levels: a step away from a crate right behind pulls it.
    const behind = neighbour(g, at, (d + 2) % 4);
    const pull = g.pull && screen.shown.crates.some((c) => c.cell === behind && c.z === screen.shown.z);
    moveGrid(d + (pull ? 4 : 0));
    return;
  }
  if (cell === at) return;
  const path = walkTo(g, screen.sim.raw, cell);
  if (!path) {
    sound.bump();
    return;
  }
  let k = 0;
  const next = () => {
    if (k >= path.length || !moveGrid(path[k++])) return stopWalk();
    walk = window.setTimeout(next, 150);
  };
  next();
}

function act(a: string) {
  if (!run) return;
  stopWalk();
  if (a === 'back') {
    click();
    // Leaving during the win celebration keeps the solve.
    endRun(run.over && !run.watching ? screen.sim.state : null);
    return;
  }
  if (a === 'left' || a === 'right') {
    view.rotate(a === 'left' ? -1 : 1);
    drawMinimap();
    click();
    return;
  }
  if (a === 'tip') {
    click();
    const text = levelText(run.level).tip;
    if (text) say(text, 9000);
    return;
  }
  if (a === 'help') {
    click();
    const p = loadProgress();
    showHelp({ open: new Set(WORLDS.filter((_, k) => isWorldOpen(k, p)).map((w) => w.id)), world: run.level.world }, click);
    return;
  }
  if (a === 'minimap') {
    click();
    $('.hud-minimap').classList.toggle('big');
    return;
  }
  if (a === 'overview' && screen.sim.grid.planet) {
    click();
    view.looking = !view.looking;
    syncLook();
    return;
  }
  if (a === 'overview' && view.follows) {
    click();
    view.overview = !view.overview;
    $('.hud-view').classList.toggle('on', view.overview);
    $('.hud-view').setAttribute('aria-pressed', String(view.overview));
    return;
  }
  if (run.over || run.watching) return;
  if (a === 'hint') {
    askHint();
    return;
  }
  if (a === 'grab') {
    click();
    setGrab(!grab);
    if (grab) say(t('hud.grabOn'), 3500);
    return;
  }
  if (a === 'skip' && run.skip !== undefined) {
    click();
    // With no compass left, skipping ends the expedition: press twice.
    if (run.skip > 0 || run.giveUp) endRun(screen.sim.state, true);
    else {
      run.giveUp = true;
      say(t('exp.giveUp'), 5000);
    }
    return;
  }
  const prev = screen.shown;
  if (a === 'undo' && screen.sim.undo()) {
    coach.on('undo');
    run.clean = false;
    // Time Trial: undo costs two seconds.
    if (run.timed && run.timed.start >= 0) {
      run.timed.penalty += 2000;
      const pen = $('.hud-pen');
      pen.textContent = '+2';
      pen.classList.remove('show');
      void pen.offsetWidth;
      pen.classList.add('show');
    }
    present(prev, false);
  } else if (a === 'redo' && screen.sim.redo()) present(prev, true);
  else if (a === 'restart' && screen.sim.frame > 0) {
    run.clean = false;
    if (run.timed) Object.assign(run.timed, { start: -1, penalty: 0, at: [0] });
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

const coach = new Coach((text, ms) => say(text, ms));

/** Asks the solver (in the worker) for the way on from here; shows the next move as an arrow. */
async function askHint() {
  if (!run || run.over) return;
  click();
  const asked = screen.sim.raw;
  const r = run;
  say(t('hud.thinking'), 20000);
  const answer = await hint(screen.sim.level, screen.sim.raw);
  // The same position (an undo then another move can reach the same frame with a different one).
  if (run !== r || screen.sim.raw !== asked || r.over) return;
  r.clean = false;
  if (answer.solution) {
    const c = answer.solution[0];
    view.showHint(DIRS.indexOf(c.toLowerCase()));
    const n = answer.solution.length;
    const push = c === c.toUpperCase();
    if (push && screen.sim.grid.pull) say(n === 1 ? t('hint.pull1') : t('hint.pull', { n }));
    else say(n === 1 ? t(push ? 'hud.hintPushOne' : 'hud.hintStepOne') : t(push ? 'hud.hintPush' : 'hud.hintStep', { n }));
  } else say(answer.complete ? t('hud.stuck') : t('hud.tooMany'));
}

const KEYS: Record<string, number> = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const ACTIONS: Record<string, string> = { KeyH: 'hint', KeyZ: 'undo', Backspace: 'undo', KeyY: 'redo', KeyR: 'restart', KeyQ: 'left', KeyE: 'right', KeyV: 'overview', Escape: 'back' };
addEventListener('keydown', (e) => {
  // A dialog over the level (help, a card) takes the keys.
  if (run && document.querySelector('.modal')) return;
  if (run && e.key === '?') {
    e.preventDefault();
    if (!run.timed && !run.watching) act('help');
    return;
  }
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
    move(d, e.shiftKey);
    return;
  }
  // A focused HUD button must not be pressed again by Space or Enter.
  if (e.code === 'Space' || e.code === 'Enter') {
    if (!(e.target as HTMLElement).closest?.('.modal')) e.preventDefault();
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
  pad.addEventListener('lostpointercapture', up);
}
let swipe: { x: number; y: number; id: number; moved: boolean; t: number } | null = null;
// Planets: looking around. Two fingers (or the right mouse button, or one finger with Look
// on) spin the planet; pinching or the wheel zooms. Every pointer down on the canvas is kept.
const pointers = new Map<number, { x: number; y: number }>();
let pinch = 0;
let spinning = false;
const onPlanet = () => !!run && !run.over && screen.sim.grid.planet > 0;
const spread = () => {
  const [a, b] = [...pointers.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
};
const middle = () => {
  const ps = [...pointers.values()];
  return { x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length };
};
let spinFrom = { x: 0, y: 0 };
renderer.domElement.addEventListener('contextmenu', (e) => {
  if (onPlanet()) e.preventDefault();
});
renderer.domElement.addEventListener(
  'wheel',
  (e) => {
    if (!onPlanet()) return;
    e.preventDefault();
    view.zoom(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
    syncLook();
  },
  { passive: false },
);
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (onPlanet() && (pointers.size >= 2 || e.button === 2 || view.looking)) {
    // A spin, not a swipe or a tap.
    spinning = true;
    swipe = pointers.size === 1 ? { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, t: performance.now() } : null;
    spinFrom = middle();
    pinch = spread();
    return;
  }
  swipe = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, t: performance.now() };
});
renderer.domElement.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (spinning) {
    const m = middle();
    const dx = m.x - spinFrom.x;
    const dy = m.y - spinFrom.y;
    // One finger with Look on: a short press is still a tap (walk there).
    if (swipe && Math.hypot(e.clientX - swipe.x, e.clientY - swipe.y) > 8) swipe.moved = true;
    if (!swipe || swipe.moved) view.spin(dx, dy);
    spinFrom = m;
    const d = spread();
    if (pinch && d) view.zoom(pinch / d);
    pinch = d;
    syncLook();
    return;
  }
  if (!swipe || e.pointerId !== swipe.id) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 28) return;
  swipe.moved = true;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  // Keep sliding the finger for more moves.
  swipe.x = e.clientX;
  swipe.y = e.clientY;
});
const lift = (e: PointerEvent) => {
  pointers.delete(e.pointerId);
  if (spinning) {
    spinFrom = middle();
    pinch = spread();
    if (pointers.size === 0) spinning = false;
  }
};
renderer.domElement.addEventListener('pointerup', (e) => {
  // A short press that didn't swipe is a tap on a cell.
  if (swipe && e.pointerId === swipe.id && !swipe.moved && pointers.size === 1 && performance.now() - swipe.t < 450) tapCell(view.cellAt(e.clientX, e.clientY));
  swipe = null;
  lift(e);
});
renderer.domElement.addEventListener('pointercancel', (e) => {
  swipe = null;
  lift(e);
});

startGamepad({ playing: () => !!run && !document.querySelector('.modal'), move: (d, pull) => move(d, pull), act });
