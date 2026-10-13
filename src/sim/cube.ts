/**
 * Planet levels: the board is the outside of an N×N×N cube, written as its unfolded net.
 *
 *         T              The net is 4N wide and 3N tall. Each face is an N×N block;
 *       L F R B          cells outside the faces are not part of the planet.
 *         D
 *
 * Every surface cell is a unit voxel of the cube plus the face it sits on. Walking in a
 * direction moves to the next voxel along that direction's 3D axis; past the cube's edge,
 * it stays in the same voxel but moves onto the face around the corner, now heading down
 * that side (towards the old face's inside). So the seams come out of the geometry, not a
 * hand-written table, and every link is mutual.
 *
 * Directions are the net's (0 up, 1 right, 2 down, 3 left, as in grid.ts). Crossing a seam
 * can change the direction a thing is heading: `turn` gives the direction on arrival.
 */
export type Vec3 = [number, number, number];

/** Net block of each face: T L F R B D. */
const BLOCKS: [number, number][] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [3, 1],
  [1, 2],
];
/** Per face: outward normal, the 3D axis of net right, the 3D axis of net down. */
const FRAMES: [Vec3, Vec3, Vec3][] = [
  [[0, 1, 0], [1, 0, 0], [0, 0, 1]], // T: down the net goes toward the front
  [[-1, 0, 0], [0, 0, 1], [0, -1, 0]], // L
  [[0, 0, 1], [1, 0, 0], [0, -1, 0]], // F
  [[1, 0, 0], [0, 0, -1], [0, -1, 0]], // R
  [[0, 0, -1], [-1, 0, 0], [0, -1, 0]], // B
  [[0, -1, 0], [1, 0, 0], [0, 0, -1]], // D
];

export const FACE_NAMES = 'TLFRBD';

export interface CubeNet {
  n: number;
  w: number;
  h: number;
  /** Face of each net cell (-1: not on the planet). */
  face: Int8Array;
  /** Per cell × 4 directions: the neighbour cell and the direction on arrival. */
  link: Int16Array;
  turn: Int8Array;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
const same = (a: Vec3, b: Vec3) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** The 3D axis of net direction d on face f. */
export function axisOf(f: number, d: number): Vec3 {
  const [, r, dn] = FRAMES[f];
  return d === 0 ? neg(dn) : d === 1 ? r : d === 2 ? dn : neg(r);
}
export const normalOf = (f: number): Vec3 => FRAMES[f][0];

/** The voxel under face f's cell (u, v), in [0, n)³. */
function voxelOf(n: number, f: number, u: number, v: number): Vec3 {
  const [nrm, r, dn] = FRAMES[f];
  const p: Vec3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    // Along the normal: the outer layer. Along right/down: u or v, counted from the side they start.
    if (nrm[a]) p[a] = nrm[a] > 0 ? n - 1 : 0;
    else if (r[a]) p[a] = r[a] > 0 ? u : n - 1 - u;
    else p[a] = dn[a] > 0 ? v : n - 1 - v;
  }
  return p;
}

/** The face-local (u, v) of a voxel on face f. */
function uvOf(n: number, f: number, p: Vec3): [number, number] {
  const [, r, dn] = FRAMES[f];
  let u = 0;
  let v = 0;
  for (let a = 0; a < 3; a++) {
    if (r[a]) u = r[a] > 0 ? p[a] : n - 1 - p[a];
    if (dn[a]) v = dn[a] > 0 ? p[a] : n - 1 - p[a];
  }
  return [u, v];
}

const nets = new Map<number, CubeNet>();

export function cubeNet(n: number): CubeNet {
  const cached = nets.get(n);
  if (cached) return cached;
  const w = 4 * n;
  const h = 3 * n;
  const face = new Int8Array(w * h).fill(-1);
  const link = new Int16Array(w * h * 4).fill(-1);
  const turn = new Int8Array(w * h * 4).fill(-1);
  const cellOf = (f: number, u: number, v: number) => (BLOCKS[f][1] * n + v) * w + BLOCKS[f][0] * n + u;
  for (let f = 0; f < 6; f++) for (let v = 0; v < n; v++) for (let u = 0; u < n; u++) face[cellOf(f, u, v)] = f;
  const inside = (p: Vec3) => p.every((c) => c >= 0 && c < n);
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < n; v++)
      for (let u = 0; u < n; u++) {
        const c = cellOf(f, u, v);
        const p = voxelOf(n, f, u, v);
        for (let d = 0; d < 4; d++) {
          const t = axisOf(f, d);
          const q = add(p, t);
          let to: number;
          let arrive: number;
          if (inside(q)) {
            const [qu, qv] = uvOf(n, f, q);
            to = cellOf(f, qu, qv);
            arrive = d;
          } else {
            // Round the edge: same voxel, on the face whose normal is t, heading down its side.
            const g = FRAMES.findIndex(([nrm]) => same(nrm, t));
            const [qu, qv] = uvOf(n, g, p);
            to = cellOf(g, qu, qv);
            const down = neg(normalOf(f));
            arrive = [0, 1, 2, 3].find((e) => same(axisOf(g, e), down))!;
          }
          link[c * 4 + d] = to;
          turn[c * 4 + d] = arrive;
        }
      }
  const net = { n, w, h, face, link, turn };
  nets.set(n, net);
  return net;
}

/** Where a planet cell sits on the cube, for drawing: its voxel's centre on the outer face, the cube centred on 0. */
export function cellFrame(net: CubeNet, cell: number): { face: number; centre: Vec3; normal: Vec3 } {
  const f = net.face[cell];
  const x = cell % net.w;
  const y = (cell - x) / net.w;
  const p = voxelOf(net.n, f, x - BLOCKS[f][0] * net.n, y - BLOCKS[f][1] * net.n);
  const nrm = normalOf(f);
  const half = net.n / 2;
  const centre: Vec3 = [p[0] + 0.5 - half + nrm[0] * 0.5, p[1] + 0.5 - half + nrm[1] * 0.5, p[2] + 0.5 - half + nrm[2] * 0.5];
  return { face: f, centre, normal: nrm };
}
