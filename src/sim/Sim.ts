import type { LevelDef } from '../levels/types';
import { DIRS, DX, DY, KIND, TILE, VOID, parseLevel, type Grid } from './grid';

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
 *
 * A move, in order: the step or push (a crate slides on across ice, drops into pits and
 * lava, comes out of a teleporter), the player's own slide and teleport, then conveyors
 * carry what stands on them. Doors, gates, lasers and receivers are never stored: they are
 * worked out from the state (`worldOf`), so undo and the solver stay exact.
 */

/** What happened during a move (sound, particles and animation read these). */
export const EVENT = {
  step: 1,
  push: 2,
  /** The player stepped up a level. */
  climb: 4,
  /** The player stepped down a level. */
  descend: 8,
  /** A crate fell to a lower surface. */
  fall: 16,
  /** A crate fell off the island. */
  lost: 32,
  /** A goal got covered. */
  goalOn: 64,
  /** A goal got uncovered. */
  goalOff: 128,
  /** Everything is solved. */
  win: 256,
  /** Something slid across ice. */
  slide: 512,
  teleport: 1024,
  /** A crate filled a pit or sank into lava. */
  fill: 2048,
  /** A conveyor carried something. */
  convey: 4096,
  /** A door opened or closed. */
  open: 8192,
  close: 16384,
  /** A crate was pulled (pull rules). The top bit of the Int16 events: it reads back as 0x8000 under `&`. */
  pull: 32768,
} as const;

/** How many inputs a level has: 4 directions, and 4 pulls on pull levels (dir + 4). */
export const inputCount = (g: Grid) => (g.pull ? 8 : 4);

/** The input of a LURD letter: lowercase moves; uppercase pushes (same input) or pulls (dir + 4). */
export function inputOf(g: Grid, c: string): number {
  const d = DIRS.indexOf(c.toLowerCase());
  return d >= 0 && g.pull && c !== c.toLowerCase() ? d + 4 : d;
}

/** Moves crates (a push or a pull): written uppercase in LURD. */
export const MOVED_CRATE = EVENT.push | EVENT.pull;

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
  kind: number;
}

/** What the state implies for the switches and lasers. */
export interface World {
  /** Channel 1–3 is on (a plate held down or a receiver lit). Index 0 is unused. */
  on: boolean[];
  /** Receivers hit by a beam. */
  lit: number[];
  /** Each beam's path: the cells it crosses from its emitter, its direction in each, and whether something stopped it (rather than a receiver or the map's edge). */
  beams: { cells: number[]; dirs: number[]; blocked: boolean }[];
  /** Doors standing open and gates standing raised. */
  open: number[];
  raised: number[];
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
  world: World;
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

const occupied = (b: Int16Array, cell: number) => {
  if (b[S.cell] === cell) return true;
  for (let k = HEAD; k < b.length; k += 2) if (b[k] === cell) return true;
  return false;
};

/** A pit or lava cell nothing has filled yet: the player can't go in. */
const isHole = (g: Grid, b: Int16Array, cell: number) => (g.tile[cell] === TILE.pit || g.tile[cell] === TILE.lava) && surface(g, b, cell) === g.floor[cell];

const gateUp = (g: Grid, moves: number, cell: number) => (g.tile[cell] === TILE.gateEven && moves % 2 === 0) || (g.tile[cell] === TILE.gateOdd && moves % 2 === 1);

/** A goal is covered by a crate on its floor, of its color if it has one. */
function covered(g: Grid, b: Int16Array, cell: number) {
  const k = crateAt(b, cell, g.floor[cell]);
  if (k < 0) return false;
  return g.goalColor[cell] === 0 || g.crateKind[k] === g.goalColor[cell];
}

export function neighbour(g: Grid, cell: number, dir: number) {
  const x = (cell % g.w) + DX[dir];
  const y = Math.floor(cell / g.w) + DY[dir];
  return x < 0 || y < 0 || x >= g.w || y >= g.h ? -1 : y * g.w + x;
}

const MIRROR_SLASH = [1, 0, 3, 2];
const MIRROR_BACK = [3, 2, 1, 0];

/** Plates, receivers and beams, and the doors and gates they imply. */
export function worldOf(g: Grid, b: Int16Array): World {
  const on = [false, false, false, false];
  for (const c of g.plates) if ((b[S.cell] === c && b[S.z] === g.floor[c]) || crateAt(b, c, g.floor[c]) >= 0) on[g.param[c]] = true;
  const lit: number[] = [];
  const beams: World['beams'] = [];
  for (const e of g.emitters) {
    const level = g.floor[e];
    let dir = g.param[e];
    let cell = e;
    const cells = [e];
    const dirs = [dir];
    let blocked = true;
    for (let n = 0; n < g.w * g.h * 4; n++) {
      const next = neighbour(g, cell, dir);
      if (next < 0) {
        blocked = false;
        break;
      }
      if (g.wall[next] || g.tile[next] === TILE.emitter) break;
      if (g.tile[next] === TILE.receiver) {
        if (!lit.includes(next)) lit.push(next);
        cells.push(next);
        dirs.push(dir);
        blocked = false;
        break;
      }
      if (g.floor[next] !== VOID && g.floor[next] > level) break;
      const k = crateAt(b, next, level);
      if (k >= 0) {
        const kind = g.crateKind[k];
        if (kind !== KIND.mirrorSlash && kind !== KIND.mirrorBack) break;
        dir = (kind === KIND.mirrorSlash ? MIRROR_SLASH : MIRROR_BACK)[dir];
      }
      cell = next;
      cells.push(cell);
      dirs.push(dir);
    }
    beams.push({ cells, dirs, blocked });
  }
  for (const r of lit) on[g.param[r]] = true;
  const open: number[] = [];
  const raised: number[] = [];
  for (const c of g.doors) if (on[g.param[c]] || occupied(b, c)) open.push(c);
  for (const c of g.gateCells) if (gateUp(g, b[S.moves], c) && !occupied(b, c)) raised.push(c);
  return { on, lit, beams, open, raised };
}

/** The channels on, which is all a move needs of the world (only plates and receivers switch them). */
const NONE_ON: readonly boolean[] = [false, false, false, false];
const channelsOn = (g: Grid, b: Int16Array): readonly boolean[] => (g.plates.length || g.receivers.length ? worldOf(g, b).on : NONE_ON);

/** The largest move (and push) count an Int16 holds: past it the move count steps back by one, so its parity (the gates) stays right. */
const MAX_MOVES = 32767;

/** Something can't enter this cell at all (walls, emitters, receivers, closed doors, raised gates). */
function blocked(g: Grid, b: Int16Array, on: readonly boolean[], cell: number) {
  if (cell < 0 || g.wall[cell]) return true;
  const t = g.tile[cell];
  if (t === TILE.emitter || t === TILE.receiver) return true;
  if (t === TILE.door) return !on[g.param[cell]] && !occupied(b, cell);
  if (t === TILE.gateEven || t === TILE.gateOdd) return gateUp(g, b[S.moves], cell) && !occupied(b, cell);
  return false;
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
  b[S.solved] = isWon(g, b) ? 1 : 0;
  return b;
}

const isWon = (g: Grid, b: Int16Array) => g.goals.every((c) => covered(g, b, c)) && (g.receivers.length === 0 || worldOf(g, b).lit.length === g.receivers.length);

/**
 * Moves crate k into `cell` (where it falls to the surface), then lets it slide on across
 * ice and come out of a teleporter. `dest` is the cell the player is stepping into (or -1):
 * the crate never slides or teleports there. Returns the events.
 */
function placeCrate(g: Grid, b: Int16Array, on: readonly boolean[], k: number, cell: number, dir: number, slide: boolean, dest: number): number {
  const i = HEAD + k * 2;
  let ev = 0;
  for (let n = 0; n < g.w * g.h; n++) {
    if (g.floor[cell] === VOID) {
      b[i] = -1;
      b[i + 1] = 0;
      return ev | EVENT.lost;
    }
    const from = b[i + 1];
    const land = surface(g, b, cell);
    b[i] = cell;
    b[i + 1] = land;
    if (land < from) ev |= EVENT.fall;
    if ((g.tile[cell] === TILE.pit || g.tile[cell] === TILE.lava) && land === g.floor[cell]) return ev | EVENT.fill;
    if (!slide || g.tile[cell] !== TILE.ice || land !== g.floor[cell]) break;
    // On ice: on to the next cell, if there's room at this level.
    const next = neighbour(g, cell, dir);
    if (next < 0 || blocked(g, b, on, next) || b[S.cell] === next || next === dest) break;
    if (g.floor[next] !== VOID && surface(g, b, next) > land) break;
    ev |= EVENT.slide;
    cell = next;
  }
  const pad = b[i];
  const z = b[i + 1];
  if (g.tile[pad] === TILE.teleport && z === g.floor[pad]) {
    const out = g.partner[pad];
    if (out >= 0 && out !== dest && !occupied(b, out) && !blocked(g, b, on, out)) {
      b[i] = out;
      b[i + 1] = g.floor[out];
      ev |= EVENT.teleport;
    }
  }
  return ev;
}

/** The player slides across ice (stopping before anything in the way), then may teleport. */
function settlePlayer(g: Grid, b: Int16Array, on: readonly boolean[], dir: number): number {
  let ev = 0;
  for (let n = 0; n < g.w * g.h; n++) {
    const cell = b[S.cell];
    const z = b[S.z];
    if (g.tile[cell] !== TILE.ice || z !== g.floor[cell]) break;
    const next = neighbour(g, cell, dir);
    if (next < 0 || blocked(g, b, on, next) || g.floor[next] === VOID || crateAt(b, next, z) >= 0 || isHole(g, b, next)) break;
    const s = surface(g, b, next);
    if (s > z || s < z - 1) break;
    b[S.cell] = next;
    b[S.z] = s;
    ev |= EVENT.slide;
  }
  return ev | teleportPlayer(g, b, on);
}

/** The player standing on a teleporter comes out of its twin, if that is free. */
function teleportPlayer(g: Grid, b: Int16Array, on: readonly boolean[]): number {
  const pad = b[S.cell];
  if (g.tile[pad] !== TILE.teleport || b[S.z] !== g.floor[pad]) return 0;
  const out = g.partner[pad];
  if (out < 0 || occupied(b, out) || blocked(g, b, on, out)) return 0;
  b[S.cell] = out;
  b[S.z] = g.floor[out];
  return EVENT.teleport;
}

/** Conveyors carry what stands on them one cell, each thing at most once a move. */
function convey(g: Grid, b: Int16Array, on: readonly boolean[]): number {
  if (g.conveyors.length === 0) return 0;
  let ev = 0;
  const moved = new Set<number>();
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of g.conveyors) {
      const dir = g.param[c];
      const z = g.floor[c];
      const to = neighbour(g, c, dir);
      if (to < 0 || blocked(g, b, on, to)) continue;
      if (b[S.cell] === c && b[S.z] === z && !moved.has(-1)) {
        if (g.floor[to] === VOID || crateAt(b, to, z) >= 0 || isHole(g, b, to)) continue;
        const s = surface(g, b, to);
        if (s > z || s < z - 1) continue;
        b[S.cell] = to;
        b[S.z] = s;
        moved.add(-1);
        changed = true;
        ev |= EVENT.convey | teleportPlayer(g, b, on);
        continue;
      }
      const k = crateAt(b, c, z);
      // Never from under the player or another crate, never into the player.
      if (k < 0 || moved.has(k) || crateAt(b, c, z + 1) >= 0 || b[S.cell] === c || b[S.cell] === to) continue;
      if (g.floor[to] !== VOID && surface(g, b, to) > z) continue;
      ev |= placeCrate(g, b, on, k, to, dir, false, -1) | EVENT.convey;
      moved.add(k);
      changed = true;
    }
  }
  return ev;
}

/** One move. Returns the new state, or null when the move is blocked (nothing changes). */
export function step(g: Grid, prev: Int16Array, input: number): Int16Array | null {
  const on = channelsOn(g, prev);
  const from = prev[S.cell];
  const e = prev[S.z];
  const pulling = input >= 4;
  const dir = input & 3;
  const to = neighbour(g, from, dir);
  if (to < 0 || g.floor[to] === VOID || blocked(g, prev, on, to)) return null;
  const b = new Int16Array(prev);
  let ev = 0;
  b[S.pushed] = -1;
  const crate = crateAt(b, to, e);
  if (pulling) {
    // A pull: a crate right behind, nothing on it, and level ground ahead to step onto.
    if (!g.pull) return null;
    const back = neighbour(g, from, (dir + 2) % 4);
    const k = back < 0 ? -1 : crateAt(b, back, e);
    if (k < 0 || crateAt(b, back, e + 1) >= 0 || crate >= 0 || isHole(g, b, to) || surface(g, b, to) !== e) return null;
    b[S.cell] = to;
    b[S.z] = e;
    b[S.pushes] = Math.min(MAX_MOVES, b[S.pushes] + 1);
    b[S.pushed] = k;
    ev |= EVENT.pull | placeCrate(g, b, on, k, from, dir, true, to);
  } else if (crate >= 0) {
    if (g.pull) return null;
    // A push: nothing on top of the crate, and room for it at this level beyond.
    if (crateAt(b, to, e + 1) >= 0) return null;
    const beyond = neighbour(g, to, dir);
    if (beyond < 0 || blocked(g, b, on, beyond)) return null;
    if (g.floor[beyond] !== VOID && surface(g, b, beyond) > e) return null;
    b[S.pushes] = Math.min(MAX_MOVES, b[S.pushes] + 1);
    b[S.pushed] = crate;
    ev |= EVENT.push | placeCrate(g, b, on, crate, beyond, dir, true, to);
  } else {
    const s = surface(g, b, to);
    if (Math.abs(s - e) > 1 || isHole(g, b, to)) return null;
    if (s > e) ev |= EVENT.climb;
    if (s < e) ev |= EVENT.descend;
  }
  b[S.cell] = to;
  b[S.z] = surface(g, b, to);
  ev |= settlePlayer(g, b, on, dir);
  // Pulling, the pusher walks backwards, facing the crate.
  b[S.facing] = pulling ? (dir + 2) % 4 : dir;
  b[S.moves] = prev[S.moves] >= MAX_MOVES ? MAX_MOVES - 1 : prev[S.moves] + 1;
  ev |= convey(g, b, on) | EVENT.step;
  for (const c of g.goals) {
    const was = covered(g, prev, c);
    const now = covered(g, b, c);
    if (now && !was) ev |= EVENT.goalOn;
    if (was && !now) ev |= EVENT.goalOff;
  }
  if (g.plates.length || g.receivers.length) {
    const after = worldOf(g, b).on;
    for (let c = 1; c <= 3; c++) {
      if (after[c] && !on[c]) ev |= EVENT.open;
      if (!after[c] && on[c]) ev |= EVENT.close;
    }
  }
  const solved = isWon(g, b);
  if (solved && !prev[S.solved]) ev |= EVENT.win;
  b[S.solved] = solved ? 1 : 0;
  b[S.events] = ev;
  return b;
}

export function viewState(g: Grid, b: Int16Array): GameState {
  const crates: CrateState[] = [];
  for (let k = HEAD; k < b.length; k += 2) crates.push({ cell: b[k], z: b[k + 1], kind: g.crateKind[(k - HEAD) / 2] });
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
    world: worldOf(g, b),
  };
}

/**
 * The position part of a state, for the solver: the player's cell and the crates (crates of
 * the same kind are interchangeable, so they're sorted), the move parity when gates exist.
 */
export function stateKey(g: Grid, b: Int16Array): string {
  const keys: number[] = [];
  for (let k = HEAD; k < b.length; k += 2) keys.push((g.crateKind[(k - HEAD) / 2] * 4096 + b[k] + 1) * 32 + b[k + 1] + 8);
  keys.sort((p, q) => p - q);
  const out = [b[S.cell], b[S.z] + 8, g.gates ? b[S.moves] % 2 : 0];
  for (const v of keys) out.push(v & 0xffff, v >>> 16);
  return String.fromCharCode(...out);
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

  /** The raw state shown (for the solver and hints). */
  get raw(): Int16Array {
    return this.history[this.frame];
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
      const c = DIRS[this.inputs[f] & 3];
      out += this.history[f + 1][S.events] & MOVED_CRATE ? c.toUpperCase() : c;
    }
    return out;
  }

  /** Plays a LURD string (case matters only on pull levels: uppercase pulls); returns how many moves were played. */
  play(lurd: string): number {
    let n = 0;
    for (const c of lurd) {
      const d = inputOf(this.grid, c);
      if (d < 0 || !this.move(d)) break;
      n++;
    }
    return n;
  }
}
