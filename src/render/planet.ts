import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { axisOf, cubeNet, normalOf, type CubeNet } from '../sim/cube';
import { TILE, type Grid } from '../sim/grid';

/**
 * The shape of a planet level: its cube net (cube.ts) puffed out into a ball. A point on a
 * face is warped equi-angularly (tan), so every cell spans the same angle and the tiles stay
 * close to square; the ball's radius makes a cell about one unit wide, like on an island.
 *
 * Every cell has a frame: up out of the planet, x along the net's right, z along the net's
 * down, so a model built for a flat island (looking along +z for "down") sits on any face.
 */
export class PlanetShape {
  readonly net: CubeNet;
  readonly n: number;
  /** Radius of the ground's surface. */
  readonly radius: number;
  private dirs: THREE.Vector3[] = [];
  private frames: THREE.Quaternion[] = [];
  private tangents: THREE.Vector3[][] = [];

  constructor(n: number) {
    this.n = n;
    this.net = cubeNet(n);
    this.radius = ((2 * n) / Math.PI) * 1.08;
    const m = new THREE.Matrix4();
    for (let c = 0; c < this.net.w * this.net.h; c++) {
      const f = this.net.face[c];
      if (f < 0) continue;
      const x = c % this.net.w;
      const y = (c - x) / this.net.w;
      const [u, v] = this.faceUV(c, x, y);
      const up = this.surface(f, u + 0.5, v + 0.5);
      const ax = (d: number) => {
        const a = new THREE.Vector3(...axisOf(f, d));
        return a.addScaledVector(up, -a.dot(up)).normalize();
      };
      const right = ax(1);
      const down = new THREE.Vector3().crossVectors(right, up);
      this.dirs[c] = up;
      this.tangents[c] = [down.clone().negate(), right, down, right.clone().negate()];
      this.frames[c] = new THREE.Quaternion().setFromRotationMatrix(m.makeBasis(right, up, down));
    }
  }

  private faceUV(c: number, x = c % this.net.w, y = Math.floor(c / this.net.w)): [number, number] {
    return [x % this.n, y % this.n];
  }

  /** The unit direction of face f's point (s, t), both in 0..n. */
  surface(f: number, s: number, t: number, out = new THREE.Vector3()) {
    const half = this.n / 2;
    const warp = (a: number) => Math.tan(((a - half) / half) * (Math.PI / 4));
    const nrm = normalOf(f);
    const r = axisOf(f, 1);
    const d = axisOf(f, 2);
    const a = warp(s);
    const b = warp(t);
    return out.set(nrm[0] + r[0] * a + d[0] * b, nrm[1] + r[1] * a + d[1] * b, nrm[2] + r[2] * a + d[2] * b).normalize();
  }

  /** Up at a cell (unit, out of the planet). */
  up(cell: number) {
    return this.dirs[cell];
  }

  /** The cell's frame: x net right, y up, z net down. */
  frame(cell: number) {
    return this.frames[cell];
  }

  /** The 3D way a net direction points at a cell (on the ground's tangent plane). */
  tangent(cell: number, dir: number) {
    return this.tangents[cell][dir];
  }

  /** A point at height z (in levels of `levelH`) above a cell's ground, plus `lift` along up. */
  point(cell: number, z: number, levelH: number, lift = 0, out = new THREE.Vector3()) {
    // A net cell off the planet has no place: the centre (nothing is ever drawn there).
    const up = this.dirs[cell];
    if (!up) return out.set(0, 0, 0);
    return out.copy(up).multiplyScalar(this.radius + z * levelH + lift);
  }

  /** The cell whose middle is nearest a direction from the planet's centre. */
  nearest(dir: THREE.Vector3) {
    let best = -1;
    let dot = -2;
    for (let c = 0; c < this.dirs.length; c++) {
      const u = this.dirs[c];
      if (!u) continue;
      const k = u.dot(dir);
      if (k > dot) {
        dot = k;
        best = c;
      }
    }
    return best;
  }

  /**
   * The ground: a tile per cell, curved with the ball and set a little apart, each a slab
   * reaching down to the core so the grooves between them read as seams. Pits are sunk one
   * level, with walls round them. Returns one geometry per look (plain ground, then each
   * special tile color), vertex colored.
   */
  ground(g: Grid, levelH: number, color: (cell: number) => THREE.Color, special: (cell: number) => string | null) {
    const parts = new Map<string, THREE.BufferGeometry[]>();
    const seg = 4;
    const gap = 0.035;
    const depth = this.radius - levelH - 0.12;
    const tmp = new THREE.Vector3();
    for (let c = 0; c < this.net.w * this.net.h; c++) {
      const f = this.net.face[c];
      if (f < 0) continue;
      const [u, v] = this.faceUV(c);
      const sunk = g.tile[c] === TILE.pit;
      const top = this.radius + (sunk ? -levelH : 0);
      const pos: number[] = [];
      const idx: number[] = [];
      const col: number[] = [];
      const k = color(c);
      const shade = (r: number) => (r < top - 0.01 ? 0.55 : 1);
      const vert = (s: number, t: number, r: number) => {
        this.surface(f, u + gap + s * (1 - 2 * gap), v + gap + t * (1 - 2 * gap), tmp).multiplyScalar(r);
        pos.push(tmp.x, tmp.y, tmp.z);
        const sh = shade(r);
        col.push(k.r * sh, k.g * sh, k.b * sh);
        return pos.length / 3 - 1;
      };
      // The top, a seg×seg patch.
      const base = pos.length / 3;
      for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) vert(i / seg, j / seg, top);
      for (let j = 0; j < seg; j++)
        for (let i = 0; i < seg; i++) {
          const a = base + j * (seg + 1) + i;
          // Wound so the face points out of the planet (down × right = up).
          idx.push(a, a + seg + 1, a + 1, a + 1, a + seg + 1, a + seg + 2);
        }
      // The four sides, down to the core (or up from a pit's floor to the ground around it).
      const edges: [number, number, number, number][] = [
        [0, 0, 1, 0],
        [1, 0, 1, 1],
        [1, 1, 0, 1],
        [0, 1, 0, 0],
      ];
      for (const [s0, t0, s1, t1] of edges) {
        for (let i = 0; i < seg; i++) {
          const a0 = i / seg;
          const a1 = (i + 1) / seg;
          const p = (a: number) => [s0 + (s1 - s0) * a, t0 + (t1 - t0) * a] as const;
          const [sa, ta] = p(a0);
          const [sb, tb] = p(a1);
          const lo = sunk ? this.radius : depth;
          const q0 = vert(sa, ta, top);
          const q1 = vert(sb, tb, top);
          const q2 = vert(sb, tb, lo);
          const q3 = vert(sa, ta, lo);
          // Outward on a tile's sides, inward on a pit's walls (the height runs the other way).
          idx.push(q0, q1, q3, q1, q2, q3);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      const key = special(c) ?? '';
      if (!parts.has(key)) parts.set(key, []);
      parts.get(key)!.push(geo);
    }
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [key, geos] of parts) {
      out.set(key, mergeGeometries(geos));
      for (const geo of geos) geo.dispose();
    }
    return out;
  }
}
