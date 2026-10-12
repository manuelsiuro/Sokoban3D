import type { LevelDef } from '../levels/types';

/** No floor at all: things that go there fall off the island. */
export const VOID = -100;

/**
 * A level's fixed layout, parsed from its map: what never changes during play. Cells are
 * numbered `y * w + x`. Everything that moves (the player, the crates) is in the state.
 */
export interface Grid {
  w: number;
  h: number;
  /** Floor height per cell (VOID: no floor). Walls keep the height of their base. */
  floor: Int8Array;
  wall: Uint8Array;
  goal: Uint8Array;
  goals: number[];
  start: number;
  /** Starting cell of each crate. */
  crates: number[];
  /** Every floor is at the same height and nothing but walls and goals is in the way. */
  classic: boolean;
}

export const DX = [0, 1, 0, -1];
export const DY = [-1, 0, 1, 0];
/** Directions as LURD letters: up (north, −y), right, down, left. */
export const DIRS = 'urdl';

export function parseLevel(level: LevelDef): Grid {
  const h = level.map.length;
  const w = Math.max(...level.map.map((r) => r.length));
  const n = w * h;
  const ch = (x: number, y: number) => level.map[y]?.[x] ?? ' ';
  const floor = new Int8Array(n).fill(VOID);
  const wall = new Uint8Array(n);
  const goal = new Uint8Array(n);
  const crates: number[] = [];
  let start = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = ch(x, y);
      const i = y * w + x;
      if (c === '@' || c === '+') {
        if (start >= 0) throw new Error(`${level.id}: two players`);
        start = i;
      }
      if (c === '$' || c === '*') crates.push(i);
      if (c === '.' || c === '*' || c === '+') goal[i] = 1;
      if (c === '#') wall[i] = 1;
      if (!' -,#@+$*.'.includes(c)) throw new Error(`${level.id}: unknown map character '${c}' at ${x},${y}`);
    }
  if (start < 0) throw new Error(`${level.id}: no player`);
  // Floor: every cell reachable from the player without crossing walls, plus explicit '-'.
  const inside = new Uint8Array(n);
  const todo = [start];
  inside[start] = 1;
  while (todo.length) {
    const i = todo.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d];
      const ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const j = ny * w + nx;
      const c = ch(nx, ny);
      if (inside[j] || c === '#' || c === ',') continue;
      inside[j] = 1;
      todo.push(j);
    }
  }
  for (let i = 0; i < n; i++) {
    const x = i % w;
    const c = ch(x, (i - x) / w);
    if (inside[i] || c === '#' || c === '-') {
      const d = level.heights?.[(i - x) / w]?.[x] ?? '0';
      if (!/[0-9]/.test(d)) throw new Error(`${level.id}: bad height '${d}'`);
      floor[i] = Number(d);
    }
  }
  const goals = [...goal.keys()].filter((i) => goal[i]);
  for (const i of [...crates, ...goals]) if (floor[i] === VOID || wall[i]) throw new Error(`${level.id}: a crate or goal off the floor`);
  if (crates.length < goals.length) throw new Error(`${level.id}: ${crates.length} crates for ${goals.length} goals`);
  const heights = new Set<number>();
  for (let i = 0; i < n; i++) if (floor[i] !== VOID && !wall[i]) heights.add(floor[i]);
  return { w, h, floor, wall, goal, goals, start, crates, classic: heights.size === 1 && !level.map.some((r) => r.includes(',')) };
}
