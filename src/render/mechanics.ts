import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { DX, DY, KIND, TILE, type Grid } from '../sim/grid';
import type { GameState } from '../sim/Sim';
import { mat } from './models';

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

export class Mechanics {
  readonly group = new THREE.Group();
  private plates = new Map<number, THREE.Object3D>();
  private doors = new Map<number, THREE.Object3D>();
  private gates = new Map<number, THREE.Object3D>();
  private receivers = new Map<number, THREE.MeshStandardMaterial>();
  private chevrons: { m: THREE.Object3D; base: THREE.Vector3; dir: number }[] = [];
  private swirls: THREE.Object3D[] = [];
  private lava: THREE.MeshStandardMaterial | null = null;
  private beams = new THREE.Group();
  private beamKey = '';
  private state: GameState | null = null;
  /** Shown openness of each door/gate (eased toward the state). */
  private ease = new Map<number, number>();

  constructor(
    private g: Grid,
    private pos: Pos,
    private levelH: number,
  ) {
    this.group.add(this.beams);
    for (let c = 0; c < g.w * g.h; c++) {
      const t = g.tile[c];
      const at = pos(c, g.floor[c]);
      const ch = CHANNEL[g.param[c]] ?? 0xffffff;
      if (t === TILE.plate) {
        const o = new THREE.Group();
        o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.38, 0.04, 20), mat(0x6b6f7a, { metal: 0.3, rough: 0.5 })));
        const top = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.08, 0.5, 1, 0.03), mat(ch, { rough: 0.4, emissive: ch, emissiveIntensity: 0.25 }));
        top.position.y = 0.06;
        top.name = 'top';
        o.add(top);
        o.position.copy(at);
        this.plates.set(c, o);
        this.group.add(shadowed(o));
      } else if (t === TILE.door) {
        const o = new THREE.Group();
        const post = new THREE.BoxGeometry(0.12, 1, 0.3);
        for (const s of [-0.45, 0.45]) {
          const p = new THREE.Mesh(post, mat(0x5a5f6b, { metal: 0.4, rough: 0.5 }));
          p.position.set(s, 0.5, 0);
          o.add(p);
        }
        const bars = new THREE.Group();
        bars.name = 'bars';
        for (let k = 0; k < 4; k++) {
          const b = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.9, 8), mat(ch, { metal: 0.5, rough: 0.35, emissive: ch, emissiveIntensity: 0.2 }));
          b.position.set(-0.3 + k * 0.2, 0.45, 0);
          bars.add(b);
        }
        o.add(bars);
        // Doors run across their corridor: turn them to face open floor.
        const open = (d: number) => {
          const n = this.near(c, d);
          return n >= 0 && !g.wall[n];
        };
        if (open(0) || open(2)) o.rotation.y = 0;
        if (!(open(0) || open(2)) && (open(1) || open(3))) o.rotation.y = Math.PI / 2;
        o.position.copy(at);
        this.doors.set(c, o);
        this.group.add(shadowed(o));
      } else if (t === TILE.gateEven || t === TILE.gateOdd) {
        const o = new THREE.Group();
        const block = new THREE.Mesh(new RoundedBoxGeometry(0.9, 0.8, 0.9, 1, 0.06), mat(t === TILE.gateEven ? 0xd6a84f : 0x8d6fd6, { metal: 0.55, rough: 0.35 }));
        block.position.y = 0.4;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), mat(0xfff1c4, { emissive: 0xffe08a, emissiveIntensity: 0.4 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.81;
        o.add(block, ring);
        const holder = new THREE.Group();
        holder.add(o);
        holder.position.copy(at);
        o.name = 'lift';
        this.gates.set(c, holder);
        this.group.add(shadowed(holder));
      } else if (t === TILE.conveyor) {
        const dir = g.param[c];
        for (let k = 0; k < 2; k++) {
          const chev = new THREE.Group();
          for (const s of [-1, 1]) {
            const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.03, 0.07), mat(0xffc23d, { emissive: 0xffa000, emissiveIntensity: 0.35 }));
            arm.position.set(s * 0.1, 0, 0.05);
            arm.rotation.y = s * 0.7;
            chev.add(arm);
          }
          // Point along the belt: the chevron's tip is at +z (south) unturned.
          chev.rotation.y = [Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir];
          const base = at.clone().add(new THREE.Vector3(0, 0.02, 0));
          this.chevrons.push({ m: chev, base, dir });
          this.group.add(chev);
          chev.userData.phase = k / 2;
        }
      } else if (t === TILE.teleport) {
        const color = PAIR[g.param[c]];
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 8, 24), mat(color, { emissive: color, emissiveIntensity: 0.8, rough: 0.3 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(at).add(new THREE.Vector3(0, 0.05, 0));
        const swirl = new THREE.Group();
        for (let k = 0; k < 3; k++) {
          const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), mat(color, { emissive: color, emissiveIntensity: 1 }));
          s.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.22, 0.2 + k * 0.1, Math.sin((k * Math.PI * 2) / 3) * 0.22);
          swirl.add(s);
        }
        swirl.position.copy(at);
        this.swirls.push(swirl);
        this.group.add(ring, swirl);
      } else if (t === TILE.emitter) {
        const o = new THREE.Group();
        o.add(new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.7, 1, 0.06), mat(0x4a4f5c, { metal: 0.5, rough: 0.4 })));
        o.children[0].position.y = 0.28;
        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 12), mat(0xff3d6e, { emissive: 0xff2050, emissiveIntensity: 1.2 }));
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, this.beamY(), -0.38);
        o.add(lens);
        o.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][g.param[c]];
        o.position.copy(at);
        this.group.add(shadowed(o));
      } else if (t === TILE.receiver) {
        const o = new THREE.Group();
        o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.4, 10), mat(0x4a4f5c, { metal: 0.5, rough: 0.4 })));
        o.children[0].position.y = 0.2;
        const gem = new THREE.MeshStandardMaterial({ color: ch, emissive: ch, emissiveIntensity: 0.1, roughness: 0.2, flatShading: true });
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gem);
        crystal.position.y = 0.62;
        crystal.scale.y = 1.4;
        o.add(crystal);
        o.position.copy(at);
        this.receivers.set(c, gem);
        this.group.add(shadowed(o));
      } else if (t === TILE.lava && !this.lava) {
        this.lava = mat(0xff6a1a, { rough: 0.5, emissive: 0xff4a10, emissiveIntensity: 1.2 });
      }
    }
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
    // Beams: rebuilt only when the paths change.
    const key = JSON.stringify(s.world.beams);
    if (key === this.beamKey) return;
    this.beamKey = key;
    this.beams.clear();
    const beamMat = mat(0xff3d6e, { emissive: 0xff2050, emissiveIntensity: 2.2, rough: 0.3 });
    for (const b of s.world.beams) {
      const z = this.g.floor[b.cells[0]];
      const pts = b.cells.map((c) => this.pos(c, z).add(new THREE.Vector3(0, this.beamY(), 0)));
      // The beam starts at the lens, ends at a receiver's middle or at the edge of what stopped it.
      const first = pts[0].clone().add(new THREE.Vector3(DX[b.dirs[0]] * 0.4, 0, DY[b.dirs[0]] * 0.4));
      const last = pts[pts.length - 1].clone();
      const lastDir = b.dirs[b.dirs.length - 1];
      if (b.blocked) last.add(new THREE.Vector3(DX[lastDir] * 0.5, 0, DY[lastDir] * 0.5));
      else if (this.g.tile[b.cells[b.cells.length - 1]] !== TILE.receiver) last.add(new THREE.Vector3(DX[lastDir] * 3, 0, DY[lastDir] * 3));
      const path = [first, ...pts.slice(1, -1), last];
      for (let k = 0; k + 1 < path.length; k++) {
        const a = path[k];
        const c = path[k + 1];
        const len = a.distanceTo(c);
        if (len < 0.01) continue;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, len, 6), beamMat);
        m.position.copy(a).lerp(c, 0.5);
        m.lookAt(c);
        m.rotateX(Math.PI / 2);
        this.beams.add(m);
      }
    }
  }

  update(time: number, dt: number) {
    const s = this.state;
    if (!s) return;
    const toward = (key: number, target: number) => {
      const v = this.ease.get(key) ?? target;
      const n = v + (target - v) * Math.min(1, dt * 12);
      this.ease.set(key, n);
      return n;
    };
    const player = s.cell;
    const onFloor = (c: number) => (player === c && s.z === this.g.floor[c]) || s.crates.some((k) => k.cell === c && k.z === this.g.floor[c]);
    for (const [c, o] of this.plates) {
      const pressed = onFloor(c);
      const top = o.getObjectByName('top')!;
      top.position.y = toward(c, pressed ? 0.025 : 0.06);
    }
    for (const [c, o] of this.doors) {
      const open = toward(c, s.world.open.includes(c) ? 1 : 0);
      o.getObjectByName('bars')!.position.y = -open * 0.92;
    }
    for (const [c, o] of this.gates) {
      const up = toward(c, s.world.raised.includes(c) ? 1 : 0);
      o.getObjectByName('lift')!.position.y = (up - 1) * 0.78;
    }
    for (const [c, m] of this.receivers) m.emissiveIntensity = s.world.lit.includes(c) ? 1.6 + Math.sin(time * 6) * 0.3 : 0.1;
    for (const ch of this.chevrons) {
      const t = (time * 0.8 + ch.m.userData.phase) % 1;
      ch.m.position.copy(ch.base).add(new THREE.Vector3(DX[ch.dir] * (t - 0.5) * 0.8, 0, DY[ch.dir] * (t - 0.5) * 0.8));
      ch.m.scale.setScalar(Math.sin(t * Math.PI));
    }
    for (const sw of this.swirls) sw.rotation.y = time * 2;
    if (this.lava) this.lava.emissiveIntensity = 1 + Math.sin(time * 2) * 0.25;
  }
}

/** Decorates a crate for its kind: colored panels, or a mirror across the top. */
export function dressCrate(group: THREE.Group, panels: THREE.MeshStandardMaterial, kind: number) {
  if (kind >= KIND.red && kind <= KIND.yellow) {
    panels.color.set(CRATE_COLORS[kind]);
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
