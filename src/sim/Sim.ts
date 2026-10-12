import type { LevelDef } from '../levels/types';
import { DIRS, DX, DY, VOID, parseLevel, type Grid } from './grid';

/**
 * The game's rules, deterministic and turn-based: the state after move n depends only on
 * the level and the moves before it. Every state is recorded, so undo, redo, restart and
 * replays are seeks, and a solution is a LURD string. No Three.js and no DOM here: the
 * tests and the solver run it in Node.
 *
 * Heights: each cell has a floor height; crates stack on it, so a cell's surface is its
 * floor plus its crates. The player stands on surfaces, steps up or down one level, and
 * pushes a crate that sits at its own level (never one with another crate on top). A
 * pushed crate slides sideways at that level, then falls to the surface below it.
 */

/** What happened during a move (sound, particles and animation read these). */
export const EVENT = {
  step: 1,
  push: 2,
  /** The player stepped up a level. */
  climb: 4,
  /** The player stepped down a level. */
  descend: 8,
  /** A pushed crate fell to a lower surface. */
  fall: 16,
  /** A pushed crate fell off the island. */
  lost: 32,
  /** A crate landed on a goal. */
  goalOn: 64,
  /** A crate left a goal. */
  goalOff: 128,
  /** Every goal is covered. */
  win: 256,
} as const;

/**
 * The state as a flat array. The header, then one (cell, z) pair per crate. New sections go
 * at the end, so recorded games keep their meaning.
 */
const S = { cell: 0, z: 1, facing: 2, moves: 3, pushes: 4, events: 5, solved: 6, pushed: 7 } as const;
const HEAD = 8;

export interface CrateState {
  /** Cell index (y * w + x), or -1 once it fell off the island. */
  cell: number;
  z: number;
}

export interface GameState {
  cell: number;
  x: number;
  y: number;
  z: number;
  /** The direction of the last move (0 up, 1 right, 2 down, 3 left). */
  facing: number;
  moves: number;
  pushes: number;
  events: number;
  solved: boolean;
  /** The crate pushed by the last move, or -1. */
  pushed: number;
  crates: CrateState[];
}

/** The surface height at a cell: its floor plus the crates stacked on it. */
export function surface(g: Grid, b: Int16Array, cell: number) {
  let z = g.floor[cell];
  if (z === VOID) return VOID;
  for (let k = HEAD; k < b.length; k += 2) if (b[k] === cell) z++;
  return z;
}

/** The crate at a cell and level, or -1. */
function crateAt(b: Int16Array, cell: number, z: number) {
  for (let k = HEAD; k < b.length; k += 2) if (b[k] === cell && b[k + 1] === z) return (k - HEAD) / 2;
  return -1;
}

/** A goal is covered when a crate sits on its floor. */
function covered(g: Grid, b: Int16Array, cell: number) {
  return crateAt(b, cell, g.floor[cell]) >= 0;
}

export function initialState(g: Grid): Int16Array {
  const b = new Int16Array(HEAD + g.crates.length * 2);
  b[S.cell] = g.start;
  b[S.z] = g.floor[g.start];
  b[S.facing] = 2;
  b[S.pushed] = -1;
  g.crates.forEach((c, k) => {
    b[HEAD + k * 2] = c;
    b[HEAD + k * 2 + 1] = g.floor[c];
  });
  b[S.solved] = g.goals.every((c) => covered(g, b, c)) ? 1 : 0;
  return b;
}

/** The neighbour of a cell in a direction, or -1 off the map. */
export function neighbour(g: Grid, cell: number, dir: number) {
  const x = (cell % g.w) + DX[dir];
  const y = Math.floor(cell / g.w) + DY[dir];
  return x < 0 || y < 0 || x >= g.w || y >= g.h ? -1 : y * g.w + x;
}

/** One move. Returns the new state, or null when the move is blocked (nothing changes). */
export function step(g: Grid, prev: Int16Array, dir: number): Int16Array | null {
  const from = prev[S.cell];
  const e = prev[S.z];
  const to = neighbour(g, from, dir);
  if (to < 0 || g.wall[to] || g.floor[to] === VOID) return null;
  const b = new Int16Array(prev);
  let ev = 0;
  b[S.pushed] = -1;
  const crate = crateAt(b, to, e);
  if (crate >= 0) {
    // A push: nothing on top of the crate, and room for it at this level beyond.
    if (crateAt(b, to, e + 1) >= 0) return null;
    const beyond = neighbour(g, to, dir);
    if (beyond < 0 || g.wall[beyond]) return null;
    const k = HEAD + crate * 2;
    const wasOnGoal = g.goal[to] && g.floor[to] === e;
    if (g.floor[beyond] === VOID) {
      b[k] = -1;
      b[k + 1] = 0;
      ev |= EVENT.lost;
    } else {
      const land = surface(g, b, beyond);
      if (land > e) return null;
      b[k] = beyond;
      b[k + 1] = land;
      if (land < e) ev |= EVENT.fall;
      if (g.goal[beyond] && g.floor[beyond] === land) ev |= EVENT.goalOn;
    }
    if (wasOnGoal) ev |= EVENT.goalOff;
    b[S.pushes]++;
    b[S.pushed] = crate;
    ev |= EVENT.push;
  } else {
    const s = surface(g, b, to);
    if (Math.abs(s - e) > 1) return null;
    if (s > e) ev |= EVENT.climb;
    if (s < e) ev |= EVENT.descend;
  }
  b[S.cell] = to;
  b[S.z] = surface(g, b, to);
  b[S.facing] = dir;
  b[S.moves]++;
  ev |= EVENT.step;
  const solved = g.goals.every((c) => covered(g, b, c));
  if (solved && !prev[S.solved]) ev |= EVENT.win;
  b[S.solved] = solved ? 1 : 0;
  b[S.events] = ev;
  return b;
}

export function viewState(g: Grid, b: Int16Array): GameState {
  const crates: CrateState[] = [];
  for (let k = HEAD; k < b.length; k += 2) crates.push({ cell: b[k], z: b[k + 1] });
  return {
    cell: b[S.cell],
    x: b[S.cell] % g.w,
    y: Math.floor(b[S.cell] / g.w),
    z: b[S.z],
    facing: b[S.facing],
    moves: b[S.moves],
    pushes: b[S.pushes],
    events: b[S.events],
    solved: b[S.solved] === 1,
    pushed: b[S.pushed],
    crates,
  };
}

/**
 * The position part of a state, for the solver: the player's cell and the crates, with
 * crates sorted (they are interchangeable), counters left out.
 */
export function stateKey(b: Int16Array): string {
  const pairs: number[] = [];
  for (let k = HEAD; k < b.length; k += 2) pairs.push(b[k] * 16 + b[k + 1] + 8);
  pairs.sort((p, q) => p - q);
  return String.fromCharCode(b[S.cell], ...pairs);
}

export const isSolved = (b: Int16Array) => b[S.solved] === 1;
export const eventsOf = (b: Int16Array) => b[S.events];

/** Crate cells of a raw state (for the solver's dead-square check). */
export function crateCells(b: Int16Array): number[] {
  const out: number[] = [];
  for (let k = HEAD; k < b.length; k += 2) out.push(b[k]);
  return out;
}

/**
 * A game in progress: the recorded states and the moves between them. Undo and redo move
 * through the record; a new move after an undo replaces the moves after it (unless it is
 * the same move, which keeps them, like redo).
 */
export class Sim {
  readonly grid: Grid;
  private history: Int16Array[];
  private inputs: number[] = [];
  /** Index of the state shown (moves played). */
  frame = 0;

  constructor(readonly level: LevelDef) {
    this.grid = parseLevel(level);
    this.history = [initialState(this.grid)];
  }

  get state(): GameState {
    return viewState(this.grid, this.history[this.frame]);
  }

  /** States recorded (for redo: frames above `frame` can be replayed). */
  get recorded() {
    return this.history.length;
  }

  /** Plays a move from the current state; false when it's blocked. */
  move(dir: number): boolean {
    if (this.inputs[this.frame] === dir && this.history.length > this.frame + 1) {
      this.frame++;
      return true;
    }
    const next = step(this.grid, this.history[this.frame], dir);
    if (!next) return false;
    this.history.length = this.frame + 1;
    this.inputs.length = this.frame;
    this.history.push(next);
    this.inputs.push(dir);
    this.frame++;
    return true;
  }

  undo(): boolean {
    if (this.frame === 0) return false;
    this.frame--;
    return true;
  }

  redo(): boolean {
    if (this.frame + 1 >= this.history.length) return false;
    this.frame++;
    return true;
  }

  restart() {
    this.frame = 0;
  }

  /** The moves played up to the current state, as LURD (uppercase: pushes). */
  get moves(): string {
    let out = '';
    for (let f = 0; f < this.frame; f++) {
      const c = DIRS[this.inputs[f]];
      out += this.history[f + 1][S.events] & EVENT.push ? c.toUpperCase() : c;
    }
    return out;
  }

  /** Plays a LURD string (case is ignored); returns how many moves were played. */
  play(lurd: string): number {
    let n = 0;
    for (const c of lurd.toLowerCase()) {
      const d = DIRS.indexOf(c);
      if (d < 0 || !this.move(d)) break;
      n++;
    }
    return n;
  }
}
