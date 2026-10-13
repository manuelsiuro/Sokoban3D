import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DX, DY, KIND, TILE, type Grid } from '../sim/grid';
import type { GameState } from '../sim/Sim';
import { CRATE_LID, disposeTree, mat, merge, owned, shared } from './models';
import { fadeTexture, glowMaterial, glowTexture, haloMaterial, lavaShader, swirlShader } from './shaders';
import { bake, plain } from './shapes';

/**
 * The models for the biome mechanics, and how the state moves them: plates sink, doors
 * open, gates rise, conveyors run, beams follow the lasers. Visual only.
 */

/** Channel colors (plates, doors, receivers): 1 orange, 2 teal, 3 pink. */
export const CHANNEL = [0xffffff, 0xff9a3d, 0x2fd6c3, 0xff6fb5];
/** Crate colors (kinds 1–4). */
export const CRATE_COLORS = [0, 0xe0533d, 0x4fb84a, 0x3f7fe0, 0xf2c230];
/** Teleporter pair colors. */
const PAIR = [0, 0xb983ff, 0x5fe3ff, 0xffd447, 0x8fd16a];

type Pos = (cell: number, z: number, out?: THREE.Vector3) => THREE.Vector3;

/**
 * Shapes that tell colors apart without seeing hue (a setting): crate kinds 1–4 are a
 * circle, triangle, square and star (on the crate's top and its goal); channels 1–3 a
 * diamond, a plus and a ring (on plates and doors).
 */
export const symbols = { on: true };
const SHAPES: ((s: THREE.Shape, r: number) => void)[] = [
  (s, r) => s.absarc(0, 0, r, 0, Math.PI * 2, false),
  (s, r) => poly(s, 3, r * 1.15, Math.PI / 2),
  (s, r) => poly(s, 4, r * 1.2, Math.PI / 4),
  (s, r) => star(s, 5, r * 1.2, r * 0.5),
  (s, r) => poly(s, 4, r * 1.15, 0),
  (s, r) => {
    const w = r * 0.38;
    const pts = [[w, r], [w, w], [r, w], [r, -w], [w, -w], [w, -r], [-w, -r], [-w, -w], [-r, -w], [-r, w], [-w, w], [-w, r]];
    pts.forEach(([x, y], k) => (k ? s.lineTo(x, y) : s.moveTo(x, y)));
  },
  (s, r) => {
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, r * 0.55, 0, Math.PI * 2, true);
    s.holes.push(hole);
  },
];
function poly(s: THREE.Shape, n: number, r: number, a0: number) {
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    if (k) s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
}
function star(s: THREE.Shape, n: number, r: number, inner: number) {
  for (let k = 0; k < n * 2; k++) {
    const a = Math.PI / 2 + (k / (n * 2)) * Math.PI * 2;
    const rr = k % 2 ? inner : r;
    if (k) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
}
const symbolGeo = new Map<string, THREE.BufferGeometry>();
/** A flat symbol lying face up (index into SHAPES), or null when symbols are off. */
export function symbolMesh(index: number, size: number, color = 0x1d2433, opacity = 0.7): THREE.Mesh | null {
  if (!symbols.on || index < 0 || index >= SHAPES.length) return null;
  const key = `${index}|${size}`;
  let geo = symbolGeo.get(key);
  if (!geo) {
    const sh = new THREE.Shape();
    SHAPES[index](sh, size);
    geo = shared(new THREE.ShapeGeometry(sh, 16).rotateX(-Math.PI / 2));
    symbolGeo.set(key, geo);
  }
  const m = new THREE.Mesh(geo, owned(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  m.renderOrder = 1;
  return m;
}

const shadowed = <T extends THREE.Object3D>(o: T) => {
  o.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
  return o;
};

/** Colors for floor tiles that aren't plain ground, or null for plain. */
export function tileColor(g: Grid, cell: number): { color: number; opts: Parameters<typeof mat>[1] } | null {
  switch (g.tile[cell]) {
    case TILE.ice:
      return { color: 0x7cc8ef, opts: { rough: 0.05, metal: 0.2 } };
    case TILE.pit:
      return { color: 0x9c7442, opts: { rough: 1 } };
    case TILE.lava:
      return { color: 0xff6a1a, opts: { rough: 0.5, emissive: 0xff4a10, emissiveIntensity: 1.2 } };
    case TILE.conveyor:
      return { color: 0x3b3a42, opts: { rough: 0.7 } };
    default:
      return null;
  }
}

/** Shared pieces (never freed): a unit cylinder for beams and columns, a chevron, glow materials. */
const UNIT = shared(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true));
const COLUMN = shared(new THREE.CylinderGeometry(0.3, 0.34, 1.1, 18, 1, true).translate(0, 0.55, 0));
const CHEVRON = shared(
  (() => {
    const parts = [-1, 1].map((s) => plain(new THREE.BoxGeometry(0.28, 0.03, 0.07).rotateY(s * 0.7).translate(s * 0.1, 0, 0.05)));
    return merge(parts);
  })(),
);
const glows = new Map<string, THREE.Material>();
const glowOf = (color: number, opacity: number, column: boolean) => {
  const key = `${color}|${opacity}|${column}`;
  let m = glows.get(key);
  if (!m) glows.set(key, (m = glowMaterial(color, opacity, column ? fadeTexture() : null)));
  return m;
};
const points = new Map<string, THREE.PointsMaterial>();
const sparkOf = (color: number, size: number) => {
  let m = points.get(`${color}|${size}`);
  if (!m) {
    m = new THREE.PointsMaterial({ color, size, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
    points.set(`${color}|${size}`, m);
  }
  return m;
};
const BEAM = 0xff3d6e;
let halo: THREE.Material | null = null;
/** How many sparks rise around a teleporter pad. */
const SPARKS = 10;

export class Mechanics {
  readonly group = new THREE.Group();
  private plates: { cell: number; top: THREE.Object3D }[] = [];
  private doors: { cell: number; bars: THREE.Object3D }[] = [];
  private gates: { cell: number; lift: THREE.Object3D }[] = [];
  private receivers = new Map<number, THREE.MeshStandardMaterial>();
  private chevrons: { m: THREE.Object3D; base: THREE.Vector3; dir: number; phase: number }[] = [];
  private pads: { sparks: THREE.Points; at: THREE.Vector3; seed: number }[] = [];
  private lava: THREE.MeshStandardMaterial | null = null;
  /** Lava surface: crust plates that drift, bubbles that swell and pop (hidden under a sunk crate). */
  private crust: { m: THREE.Object3D; base: THREE.Vector3; phase: number; cell: number }[] = [];
  private bubbles: { m: THREE.Object3D; phase: number; speed: number; cell: number }[] = [];
  private sunk = new Set<number>();
  private beams = new THREE.Group();
  private flares: THREE.Points | null = null;
  private beamKey = '';
  private state: GameState | null = null;
  /** Shown openness of each door/gate, and the height of each plate (eased toward the state). */
  private ease = new Map<number, number>();

  constructor(
    private g: Grid,
    private pos: Pos,
    private levelH: number,
    /** On planets: each cell's frame (x net right, y up, z net down); things set on a cell turn with it. */
    frame?: (cell: number) => THREE.Quaternion,
  ) {
    this.group.add(this.beams);
    // Parts that never move are baked into a few meshes at the end.
    const statics = new THREE.Group();
    let cell = -1;
    const place = (o: THREE.Object3D, at: THREE.Vector3, rotY = 0) => {
      o.position.copy(at);
      o.rotation.y = rotY;
      if (frame && cell >= 0) o.quaternion.premultiply(frame(cell));
      return o;
    };
    const metal = mat(0x737a88, { metal: 0.25, rough: 0.45 });
    const dark = mat(0x1d1f26, { rough: 0.9 });
    for (let c = 0; c < g.w * g.h; c++) {
      const t = g.tile[c];
      const at = pos(c, g.floor[c]);
      cell = c;
      const ch = CHANNEL[g.param[c]] ?? 0xffffff;
      if (t === TILE.plate) {
        // A metal ring set in the floor, and the colored button that sinks.
        const base = new THREE.Group();
        base.add(new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.41, 0.04, 24), mat(0x6b6f7a, { metal: 0.3, rough: 0.5 })));
        const lip = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 6, 24).rotateX(Math.PI / 2), metal);
        lip.position.y = 0.03;
        base.add(lip);
        statics.add(place(base, at));
        const top = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.5, 2, 0.03), mat(ch, { rough: 0.4, emissive: ch, emissiveIntensity: 0.25 }));
        top.position.copy(at).add(new THREE.Vector3(0, 0.06, 0));
        const sym = symbolMesh(3 + g.param[c], 0.13);
        if (sym) {
          sym.position.y = 0.045;
          top.add(sym);
        }
        this.plates.push({ cell: c, top });
        this.group.add(shadowed(top));
      } else if (t === TILE.door) {
        // Doors run across their corridor: turn them to face open floor.
        const open = (d: number) => {
          const n = this.near(c, d);
          return n >= 0 && !g.wall[n];
        };
        const rot = !(open(0) || open(2)) && (open(1) || open(3)) ? Math.PI / 2 : 0;
        // A frame of two posts and a lintel, with a slot in the floor the bars sink into.
        const frame = new THREE.Group();
        const post = new RoundedBoxGeometry(0.13, 1.06, 0.3, 1, 0.025);
        for (const s of [-0.45, 0.45]) frame.add(place(new THREE.Mesh(post, metal), new THREE.Vector3(s, 0.53, 0)));
        frame.add(place(new THREE.Mesh(new RoundedBoxGeometry(1.06, 0.13, 0.32, 1, 0.03), metal), new THREE.Vector3(0, 1.04, 0)));
        const band = mat(ch, { metal: 0.4, rough: 0.4, emissive: ch, emissiveIntensity: 0.35 });
        for (const z of [-0.162, 0.162]) frame.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.01), band), new THREE.Vector3(0, 1.04, z)));
        frame.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.012, 0.13), dark), new THREE.Vector3(0, 0.004, 0)));
        statics.add(place(frame, at, rot));
        const o = new THREE.Group();
        const parts: THREE.BufferGeometry[] = [];
        for (let k = 0; k < 4; k++) {
          const x = -0.3 + k * 0.2;
          parts.push(plain(new THREE.CylinderGeometry(0.042, 0.042, 0.88, 10).translate(x, 0.44, 0)));
          parts.push(plain(new THREE.CylinderGeometry(0.058, 0.058, 0.05, 10).translate(x, 0.08, 0)));
          parts.push(plain(new THREE.SphereGeometry(0.058, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0.88, 0)));
        }
        // A crossbar holding the bars together.
        parts.push(plain(new THREE.BoxGeometry(0.72, 0.05, 0.05).translate(0, 0.62, 0)));
        const bars = new THREE.Mesh(merge(parts), mat(ch, { metal: 0.5, rough: 0.35, emissive: ch, emissiveIntensity: 0.2 }));
        o.add(bars);
        for (const x of [-0.45, 0.45]) {
          const sym = symbolMesh(3 + g.param[c], 0.07, ch, 1);
          if (sym) {
            sym.position.set(x, 1.107, 0);
            o.add(sym);
          }
        }
        this.doors.push({ cell: c, bars });
        this.group.add(shadowed(place(o, at, rot)));
      } else if (t === TILE.gateEven || t === TILE.gateOdd) {
        const o = new THREE.Group();
        const block = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.9, 2, 0.06), mat(t === TILE.gateEven ? 0xd6a84f : 0x8d6fd6, { metal: 0.55, rough: 0.35 }));
        block.position.y = 0.4;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), mat(0xfff1c4, { emissive: 0xffe08a, emissiveIntensity: 0.4 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.81;
        o.add(block, ring);
        const holder = new THREE.Group();
        holder.add(o);
        holder.position.copy(at);
        this.gates.push({ cell: c, lift: o });
        this.group.add(shadowed(holder));
        // The well it rises from.
        statics.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.012, 0.96), dark), at.clone().add(new THREE.Vector3(0, 0.004, 0))));
      } else if (t === TILE.conveyor) {
        const dir = g.param[c];
        const m = mat(0xffc23d, { emissive: 0xffa000, emissiveIntensity: 0.35 });
        for (let k = 0; k < 2; k++) {
          const chev = new THREE.Mesh(CHEVRON, m);
          // Point along the belt: the chevron's tip is at +z (south) unturned.
          chev.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
          this.chevrons.push({ m: chev, base: at.clone().add(new THREE.Vector3(0, 0.02, 0)), dir, phase: k / 2 });
          this.group.add(chev);
        }
        // Rails along the belt's sides.
        const along = dir === 1 || dir === 3;
        for (const s of [-0.44, 0.44]) {
          const rail = new THREE.Mesh(new THREE.BoxGeometry(along ? 1 : 0.05, 0.03, along ? 0.05 : 1), metal);
          statics.add(place(rail, at.clone().add(new THREE.Vector3(along ? 0 : s, 0.015, along ? s : 0))));
        }
      } else if (t === TILE.teleport) {
        const color = PAIR[g.param[c]];
        // A beveled hexagonal metal pad with a glowing core (goals are rings; pads are filled).
        const pad = new THREE.Group();
        pad.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.47, 0.04, 6), metal), new THREE.Vector3(0, 0.02, 0)));
        pad.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.44, 0.025, 6), mat(0x7a808c, { metal: 0.6, rough: 0.3 })), new THREE.Vector3(0, 0.052, 0)));
        pad.add(place(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 4, 6).rotateX(Math.PI / 2).rotateY(Math.PI / 6), mat(color, { emissive: color, emissiveIntensity: 0.9 })), new THREE.Vector3(0, 0.066, 0)));
        statics.add(place(pad, at));
        // The moving parts stand on the pad in a holder of their own (turned with the cell on planets).
        const holder = place(new THREE.Group(), at);
        const core = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 6), swirlShader(mat(color, { emissive: color, emissiveIntensity: 1.1, rough: 0.3 })));
        core.position.y = 0.068;
        core.receiveShadow = true;
        // A faint column of light, and sparks rising around it.
        const col = new THREE.Mesh(COLUMN, glowOf(color, 0.15, true));
        col.position.y = 0.07;
        col.renderOrder = 4;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SPARKS * 3), 3));
        const sparks = new THREE.Points(geo, sparkOf(color, 0.12));
        sparks.frustumCulled = false;
        this.pads.push({ sparks, at, seed: c * 0.731 });
        holder.add(core, col, sparks);
        this.group.add(holder);
      } else if (t === TILE.emitter) {
        const o = new THREE.Group();
        o.add(place(new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.7, 2, 0.06), mat(0x5e6472, { metal: 0.3, rough: 0.45 })), new THREE.Vector3(0, 0.28, 0)));
        // Cooling fins on the back, a collar round the lens.
        for (let k = 0; k < 3; k++) o.add(place(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.06), metal), new THREE.Vector3(0, 0.16 + k * 0.12, 0.37)));
        const collar = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 6, 14), metal);
        collar.position.set(0, this.beamY(), -0.36);
        o.add(collar);
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 12), mat(0xff3d6e, { emissive: 0xff2050, emissiveIntensity: 1.2 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, this.beamY(), -0.38);
        o.add(lens);
        statics.add(place(o, at, [0, -Math.PI / 2, Math.PI, Math.PI / 2][g.param[c]]));
      } else if (t === TILE.receiver) {
        const o = new THREE.Group();
        o.add(place(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 12), mat(0x5e6472, { metal: 0.3, rough: 0.45 })), new THREE.Vector3(0, 0.2, 0)));
        o.add(place(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 18).rotateX(Math.PI / 2), mat(ch, { metal: 0.4, rough: 0.4, emissive: ch, emissiveIntensity: 0.3 })), new THREE.Vector3(0, 0.4, 0)));
        statics.add(place(o, at));
        const gem = owned(new THREE.MeshStandardMaterial({ color: ch, emissive: ch, emissiveIntensity: 0.1, roughness: 0.2, flatShading: true }));
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gem);
        crystal.position.copy(at).add(new THREE.Vector3(0, 0.62, 0));
        crystal.scale.y = 1.4;
        this.receivers.set(c, gem);
        this.group.add(shadowed(crystal));
      } else if (t === TILE.lava) {
        if (!this.lava) this.lava = lavaShader(mat(0xff6a1a, { rough: 0.5, emissive: 0xff4a10, emissiveIntensity: 1.2 }));
        const crustMat = mat(0x3a2a2a, { rough: 0.9, flat: true, emissive: 0x401000, emissiveIntensity: 0.4 });
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13 + ((c * 7 + k * 3) % 5) * 0.02, 0), crustMat);
          m.scale.set(1.3, 0.25, 1);
          const base = at.clone().add(new THREE.Vector3(k ? 0.18 : -0.15, 0.01, k ? -0.12 : 0.16));
          m.position.copy(base);
          m.rotation.y = c + k;
          m.receiveShadow = true;
          this.crust.push({ m, base, phase: c * 0.37 + k * 2, cell: c });
          this.group.add(m);
        }
        const bubbleMat = mat(0xffa040, { emissive: 0xff7a20, emissiveIntensity: 1.6, rough: 0.3 });
        for (let k = 0; k < 2; k++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), bubbleMat);
          m.position.copy(at).add(new THREE.Vector3(((c * 13 + k * 7) % 7) / 10 - 0.3, 0, ((c * 5 + k * 11) % 7) / 10 - 0.3));
          this.bubbles.push({ m, phase: (c * 0.61 + k * 0.5) % 1, speed: 0.5 + ((c + k) % 3) * 0.15, cell: c });
          this.group.add(m);
        }
      }
    }
    if (statics.children.length) this.group.add(bake(statics));
    disposeTree(statics);
  }

  private near(c: number, d: number) {
    const x = (c % this.g.w) + DX[d];
    const y = Math.floor(c / this.g.w) + DY[d];
    return x < 0 || y < 0 || x >= this.g.w || y >= this.g.h ? -1 : y * this.g.w + x;
  }

  /** Beam height above the floor (the middle of a crate). */
  private beamY() {
    return this.levelH * 0.5;
  }

  setState(s: GameState) {
    this.state = s;
    // A crate sunk in a lava pool hides its bubbles and crust.
    this.sunk.clear();
    for (const k of s.crates) if (k.cell >= 0 && this.g.tile[k.cell] === TILE.lava && k.z === this.g.floor[k.cell]) this.sunk.add(k.cell);
    for (const b of this.bubbles) b.m.visible = !this.sunk.has(b.cell);
    for (const k of this.crust) k.m.visible = !this.sunk.has(k.cell);
    // Beams: rebuilt only when the paths change.
    const key = JSON.stringify(s.world.beams);
    if (key === this.beamKey) return;
    this.beamKey = key;
    this.beams.clear();
    this.flares?.geometry.dispose();
    this.flares = null;
    const core = mat(BEAM, { emissive: 0xff2050, emissiveIntensity: 2.2, rough: 0.3 });
    halo ??= haloMaterial(BEAM, 0.75);
    const ends: number[] = [];
    const y = new THREE.Vector3(0, this.beamY(), 0);
    for (const b of s.world.beams) {
      const z = this.g.floor[b.cells[0]];
      const pts = b.cells.map((c) => this.pos(c, z).add(y));
      // The beam starts at the lens, ends at a receiver's middle or at the edge of what stopped it.
      const first = pts[0].clone().add(new THREE.Vector3(DX[b.dirs[0]] * 0.4, 0, DY[b.dirs[0]] * 0.4));
      const last = pts[pts.length - 1].clone();
      const lastDir = b.dirs[b.dirs.length - 1];
      const hit = b.blocked || this.g.tile[b.cells[b.cells.length - 1]] === TILE.receiver;
      if (b.blocked) last.add(new THREE.Vector3(DX[lastDir] * 0.42, 0, DY[lastDir] * 0.42));
      else if (!hit) last.add(new THREE.Vector3(DX[lastDir] * 3, 0, DY[lastDir] * 3));
      ends.push(first.x, first.y, first.z);
      if (hit) ends.push(last.x, last.y, last.z);
      // Only the turns matter: one segment per straight run (no seams along it).
      const path = [first];
      for (let k = 1; k + 1 < pts.length; k++) if (b.dirs[k] !== b.dirs[k - 1]) path.push(pts[k]);
      path.push(last);
      for (let k = 0; k + 1 < path.length; k++) {
        const a = path[k];
        const c = path[k + 1];
        const len = a.distanceTo(c);
        if (len < 0.01) continue;
        for (const [m, r] of [[core, 0.035], [halo, 0.12]] as const) {
          const seg = new THREE.Mesh(UNIT, m);
          seg.position.copy(a).lerp(c, 0.5);
          seg.lookAt(c);
          seg.rotateX(Math.PI / 2);
          seg.scale.set(r, len, r);
          if (m === halo) seg.renderOrder = 4;
          this.beams.add(seg);
        }
        // Mirrors bounce the beam: a small flare at each turn.
        if (k > 0) ends.push(a.x, a.y, a.z);
      }
    }
    if (ends.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ends), 3));
      this.flares = new THREE.Points(geo, sparkOf(0xff7a9a, 1.2));
      this.flares.renderOrder = 4;
      this.beams.add(this.flares);
    }
  }

  private toward(key: number, target: number, dt: number) {
    const v = this.ease.get(key) ?? target;
    const n = v + (target - v) * Math.min(1, dt * 12);
    this.ease.set(key, n);
    return n;
  }

  private pressed(s: GameState, c: number) {
    const f = this.g.floor[c];
    if (s.cell === c && s.z === f) return true;
    for (const k of s.crates) if (k.cell === c && k.z === f) return true;
    return false;
  }

  update(time: number, dt: number) {
    const s = this.state;
    if (!s) return;
    for (const p of this.plates) p.top.position.y = this.pos(p.cell, this.g.floor[p.cell], tmp).y + this.toward(p.cell, this.pressed(s, p.cell) ? 0.025 : 0.06, dt);
    for (const d of this.doors) d.bars.position.y = -this.toward(d.cell, s.world.open.includes(d.cell) ? 1 : 0, dt) * 0.92;
    for (const gt of this.gates) gt.lift.position.y = (this.toward(gt.cell, s.world.raised.includes(gt.cell) ? 1 : 0, dt) - 1) * 0.78;
    for (const [c, m] of this.receivers) m.emissiveIntensity = s.world.lit.includes(c) ? 1.6 + Math.sin(time * 6) * 0.3 : 0.1;
    for (const ch of this.chevrons) {
      const t = (time * 0.8 + ch.phase) % 1;
      ch.m.position.set(ch.base.x + DX[ch.dir] * (t - 0.5) * 0.8, ch.base.y, ch.base.z + DY[ch.dir] * (t - 0.5) * 0.8);
      ch.m.scale.setScalar(Math.max(0.001, Math.sin(t * Math.PI)));
    }
    // Sparks rise around each pad in a slow spiral, fading out at the top (by shrinking).
    for (const p of this.pads) {
      const a = p.sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < SPARKS; k++) {
        const u = (time * 0.45 + k / SPARKS + p.seed) % 1;
        const ang = (k / SPARKS) * Math.PI * 2 + time * 0.9;
        const rad = 0.3 - u * 0.08;
        a.setXYZ(k, Math.cos(ang) * rad, 0.1 + u * 0.9, Math.sin(ang) * rad);
      }
      a.needsUpdate = true;
    }
    if (this.lava) this.lava.emissiveIntensity = 1 + Math.sin(time * 2) * 0.25;
    for (const k of this.crust) {
      k.m.position.set(k.base.x + Math.sin(time * 0.4 + k.phase) * 0.06, k.base.y, k.base.z + Math.cos(time * 0.3 + k.phase) * 0.06);
      k.m.rotation.y += dt * 0.1;
    }
    for (const b of this.bubbles) {
      const t = (time * b.speed + b.phase) % 1;
      // Swell for most of the cycle, then pop.
      b.m.scale.setScalar(t < 0.85 ? 0.3 + t * 1.2 : 0.01);
    }
    if (this.flares) (this.flares.material as THREE.PointsMaterial).size = 1.2 + Math.sin(time * 9) * 0.12;
  }

  /** Frees the GPU side of everything built for this level. */
  dispose() {
    disposeTree(this.group);
  }
}

const tmp = new THREE.Vector3();

/** Decorates a crate for its kind: colored panels, or a mirror across the top. */
export function dressCrate(group: THREE.Group, panels: THREE.MeshStandardMaterial, kind: number) {
  if (kind >= KIND.red && kind <= KIND.yellow) {
    panels.color.set(CRATE_COLORS[kind]);
    const sym = symbolMesh(kind - 1, 0.17, 0xffffff, 0.85);
    if (sym) {
      sym.position.y = CRATE_LID + 0.006;
      group.add(sym);
    }
    return;
  }
  if (kind === KIND.mirrorSlash || kind === KIND.mirrorBack) {
    panels.color.set(0x9fb4c8);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62, 0.05), mat(0xdff6ff, { metal: 0.9, rough: 0.05, emissive: 0x6fbfff, emissiveIntensity: 0.25 }));
    // '/' runs from south-west to north-east (world: -x,+z to +x,-z).
    glass.rotation.y = kind === KIND.mirrorSlash ? Math.PI / 4 : -Math.PI / 4;
    glass.position.y = 0.62;
    glass.castShadow = true;
    group.add(glass);
  }
}
