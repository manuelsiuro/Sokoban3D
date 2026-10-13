import type { LevelDef } from '../levels/types';
import { cubeNet } from './cube';

/** No floor at all: things that go there fall off the island. */
export const VOID = -100;

/** Floor kinds (`tiles` layer). */
export const TILE = {
  plain: 0,
  ice: 1,
  pit: 2,
  lava: 3,
  plate: 4,
  door: 5,
  conveyor: 6,
  teleport: 7,
  gateEven: 8,
  gateOdd: 9,
  emitter: 10,
  receiver: 11,
} as const;

/** Crate kinds (`kinds` layer): 0 plain, 1–4 colors (r g b y), 5 mirror '/', 6 mirror '\'. */
export const KIND = { plain: 0, red: 1, green: 2, blue: 3, yellow: 4, mirrorSlash: 5, mirrorBack: 6 } as const;
const COLORS = ' rgby';

/**
 * A level's fixed layout, parsed from its layers: what never changes during play. Cells
 * are numbered `y * w + x`. Everything that moves (the player, the crates) is in the state.
 */
export interface Grid {
  w: number;
  h: number;
  /** Floor height per cell (VOID: no floor). Walls keep the height of their base; pits and lava sit one lower. */
  floor: Int8Array;
  wall: Uint8Array;
  goal: Uint8Array;
  /** Color a goal wants (0: any crate). */
  goalColor: Uint8Array;
  goals: number[];
  tile: Uint8Array;
  /** Per tile: a channel (plates, doors, receivers), a direction (conveyors, emitters) or a pair (teleporters). */
  param: Int8Array;
  /** The other pad of each teleporter (-1 elsewhere). */
  partner: Int32Array;
  start: number;
  /** Starting cell and kind of each crate. */
  crates: number[];
  crateKind: number[];
  /** Cells of each tile kind that the rules visit every move. */
  plates: number[];
  receivers: number[];
  emitters: number[];
  conveyors: number[];
  doors: number[];
  /** Gate cells (both kinds). */
  gateCells: number[];
  /** Gates exist: the move count's parity is part of the position. */
  gates: boolean;
  /** Every floor is at the same height and nothing but walls and goals is in the way. */
  classic: boolean;
  /** Pull rules: moves 4–7 step away dragging the crate behind; crates are never pushed. */
  pull: boolean;
  /** Planet levels: the cube's size N (0 on islands). The map is the cube's net (cube.ts). */
  planet: number;
  /** Per cell × 4 directions: the neighbour (-1: none) and the direction on arrival (crossing a planet's edge turns it). */
  link: Int16Array;
  turn: Int8Array;
}

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
/** Directions as LURD letters: up (north, −y), right, down, left. */
export const DIRS = 'urdl';

const TILE_CHARS: Record<string, [number, number]> = {
  ' ': [TILE.plain, 0],
  '.': [TILE.plain, 0],
  '~': [TILE.ice, 0],
  o: [TILE.pit, 0],
  L: [TILE.lava, 0],
  p: [TILE.plate, 1],
  q: [TILE.plate, 2],
  r: [TILE.plate, 3],
  P: [TILE.door, 1],
  Q: [TILE.door, 2],
  R: [TILE.door, 3],
  '^': [TILE.conveyor, 0],
  '>': [TILE.conveyor, 1],
  v: [TILE.conveyor, 2],
  '<': [TILE.conveyor, 3],
  '1': [TILE.teleport, 1],
  '2': [TILE.teleport, 2],
  '3': [TILE.teleport, 3],
  '4': [TILE.teleport, 4],
  g: [TILE.gateEven, 0],
  G: [TILE.gateOdd, 0],
  N: [TILE.emitter, 0],
  E: [TILE.emitter, 1],
  S: [TILE.emitter, 2],
  W: [TILE.emitter, 3],
  x: [TILE.receiver, 1],
  y: [TILE.receiver, 2],
  z: [TILE.receiver, 3],
};

export function parseLevel(level: LevelDef): Grid {
  // A planet's map is its cube's net, padded to full size (rows may stop early).
  const size = level.planet ?? 0;
  if (size && (!Number.isInteger(size) || size < 2 || size > 8)) throw new Error(`${level.id}: planet size ${size} out of range`);
  const h = size ? 3 * size : level.map.length;
  const w = size ? 4 * size : Math.max(...level.map.map((r) => r.length));
  if (size && (level.map.length > h || level.map.some((r) => r.length > w))) throw new Error(`${level.id}: a planet of size ${size} has a ${w}×${h} net`);
  const n = w * h;
  const ch = (x: number, y: number) => level.map[y]?.[x] ?? ' ';
  const layer = (rows: string[] | undefined, x: number, y: number) => rows?.[y]?.[x] ?? ' ';
  const floor = new Int8Array(n).fill(VOID);
  const wall = new Uint8Array(n);
  const goal = new Uint8Array(n);
  const goalColor = new Uint8Array(n);
  const tile = new Uint8Array(n);
  const param = new Int8Array(n);
  const partner = new Int32Array(n).fill(-1);
  const crates: number[] = [];
  const crateKind: number[] = [];
  let start = -1;
  let special = false;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = ch(x, y);
      const i = y * w + x;
      if (!' -,#@+$*.'.includes(c)) throw new Error(`${level.id}: unknown map character '${c}' at ${x},${y}`);
      if (c === '@' || c === '+') {
        if (start >= 0) throw new Error(`${level.id}: two players`);
        start = i;
      }
      const k = layer(level.kinds, x, y);
      const color = COLORS.indexOf(k);
      if (k !== ' ' && color < 0 && k !== '/' && k !== '\\') throw new Error(`${level.id}: unknown kind '${k}' at ${x},${y}`);
      if (c === '$' || c === '*') {
        crates.push(i);
        crateKind.push(k === '/' ? KIND.mirrorSlash : k === '\\' ? KIND.mirrorBack : Math.max(0, color));
      }
      if (c === '.' || c === '*' || c === '+') {
        goal[i] = 1;
        goalColor[i] = Math.max(0, color);
      }
      if (c === '#') wall[i] = 1;
      const t = TILE_CHARS[layer(level.tiles, x, y)];
      if (!t) throw new Error(`${level.id}: unknown tile '${layer(level.tiles, x, y)}' at ${x},${y}`);
      tile[i] = t[0];
      param[i] = t[1];
      if (t[0] !== TILE.plain || k !== ' ') special = true;
    }
  if (start < 0) throw new Error(`${level.id}: no player`);
  const planet = size;
  const { link, turn } = planet ? planetLinks(level, planet, tile) : flatLinks(w, h);
  const net = planet ? cubeNet(planet) : null;
  // Inside: every cell reachable from the player without crossing walls or holes.
  const inside = new Uint8Array(n);
  const todo = [start];
  inside[start] = 1;
  while (todo.length) {
    const i = todo.pop()!;
    for (let d = 0; d < 4; d++) {
      const j = link[i * 4 + d];
      if (j < 0) continue;
      const x = j % w;
      const c = ch(x, (j - x) / w);
      if (inside[j] || c === '#' || c === ',') continue;
      inside[j] = 1;
      todo.push(j);
    }
  }
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const y = (i - x) / w;
    const c = ch(x, y);
    // Floor: reached from the player, or marked: '-', walls' bases, anything with a crate, goal or the player on it.
    // On a planet, the whole surface is floor.
    if (net ? net.face[i] >= 0 : inside[i] || '#-$*.@+'.includes(c)) {
      const d = level.heights?.[y]?.[x] ?? '0';
      if (!/[0-9]/.test(d)) throw new Error(`${level.id}: bad height '${d}'`);
      floor[i] = Number(d) - (tile[i] === TILE.pit || tile[i] === TILE.lava ? 1 : 0);
    } else if (tile[i] !== TILE.plain) throw new Error(`${level.id}: a tile outside the floor at ${x},${y}`);
  }
  const goals = [...goal.keys()].filter((i) => goal[i]);
  for (const i of [...crates, ...goals]) if (floor[i] === VOID || wall[i]) throw new Error(`${level.id}: a crate or goal off the floor`);
  const list = (t: number) => [...tile.keys()].filter((i) => tile[i] === t);
  // Teleporters come in pairs.
  for (let p = 1; p <= 4; p++) {
    const pads = list(TILE.teleport).filter((i) => param[i] === p);
    if (pads.length === 0) continue;
    if (pads.length !== 2) throw new Error(`${level.id}: teleporter ${p} needs exactly two pads`);
    partner[pads[0]] = pads[1];
    partner[pads[1]] = pads[0];
  }
  const receivers = list(TILE.receiver);
  for (const c of [1, 2, 3, 4]) {
    const want = goals.filter((g) => goalColor[g] === c).length;
    const have = crateKind.filter((k) => k === c).length;
    if (have < want) throw new Error(`${level.id}: ${have} crates of color ${c} for ${want} goals`);
  }
  if (crates.length < goals.length) throw new Error(`${level.id}: ${crates.length} crates for ${goals.length} goals`);
  const gateCells = [...tile.keys()].filter((i) => tile[i] === TILE.gateEven || tile[i] === TILE.gateOdd);
  const heights = new Set<number>();
  for (let i = 0; i < n; i++) if (floor[i] !== VOID && !wall[i]) heights.add(floor[i]);
  return {
    w,
    h,
    floor,
    wall,
    goal,
    goalColor,
    goals,
    tile,
    param,
    partner,
    start,
    crates,
    crateKind,
    plates: list(TILE.plate),
    receivers,
    emitters: list(TILE.emitter),
    conveyors: list(TILE.conveyor),
    doors: list(TILE.door),
    gateCells,
    gates: gateCells.length > 0,
    classic: !special && heights.size === 1 && !level.map.some((r) => r.includes(',')) && level.rules !== 'pull',
    pull: level.rules === 'pull',
    planet,
    link,
    turn,
  };
}

/** An island: neighbours on the grid, edges lead nowhere, nothing turns. */
function flatLinks(w: number, h: number) {
  const link = new Int16Array(w * h * 4);
  const turn = new Int8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w;
    const y = (i - x) / w;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      link[i * 4 + d] = nx < 0 || ny < 0 || nx >= w || ny >= h ? -1 : ny * w + nx;
      turn[i * 4 + d] = d;
    }
  }
  return { link, turn };
}

/** A planet: the net's seams. Only what reads well on a small round world is allowed. */
function planetLinks(level: LevelDef, size: number, tile: Uint8Array) {
  const net = cubeNet(size);
  if (level.heights?.some((r) => /[1-9]/.test(r))) throw new Error(`${level.id}: planets have no heights`);
  if (level.rules) throw new Error(`${level.id}: planets use push rules`);
  for (let i = 0; i < net.w * net.h; i++) {
    const x = i % net.w;
    const y = (i - x) / net.w;
    const c = level.map[y]?.[x] ?? ' ';
    const t = tile[i];
    if (net.face[i] < 0) {
      if (c !== ' ' || t !== TILE.plain) throw new Error(`${level.id}: '${c}' off the planet at ${x},${y}`);
      continue;
    }
    if (c === ',' || c === '-') throw new Error(`${level.id}: '${c}' has no meaning on a planet`);
    if (t !== TILE.plain && t !== TILE.ice && t !== TILE.pit && t !== TILE.teleport) throw new Error(`${level.id}: that tile isn't used on planets (${x},${y})`);
  }
  return { link: net.link, turn: net.turn };
}
