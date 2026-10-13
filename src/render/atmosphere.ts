import * as THREE from 'three';
import { rng } from '../sim/rng';
import type { Biome } from '../world/biomes';
import { mat } from './models';
import { cloudGeometry, crystalGeometry, gearGeometry, roughen, spikeGeometry } from './shapes';

/**
 * What surrounds an island: drifting clouds (or ash), falling snow or rising embers and
 * motes, and big slow shapes far away. Visual only, seeded per level.
 */
export class Atmosphere {
  readonly group = new THREE.Group();
  private clouds: { o: THREE.Mesh; speed: number; m: THREE.MeshStandardMaterial }[] = [];
  private spinners: { o: THREE.Object3D; speed: number }[] = [];
  private floaters: { o: THREE.Object3D; y: number; phase: number }[] = [];
  private motes: THREE.Points | null = null;
  private moteSpeed: Float32Array = new Float32Array();
  private rise = 0;
  /** Half the size of the box the motes live in. */
  private box = 10;
  private span = 30;

  constructor(b: Biome, radius: number, seed: number) {
    const R = rng(seed);
    const r = R.next;
    const air = b.air;
    this.span = Math.max(30, radius * 3 + 16);
    if (air.clouds) {
      const { top, belly, count } = air.clouds;
      const base = mat(0xffffff, { rough: 1, vertexColors: true, emissive: top, emissiveIntensity: 0.26 });
      for (let k = 0; k < count; k++) {
        // Each cloud fades on its own when the camera comes close (see update).
        const m = base.clone();
        m.transparent = true;
        const big = 0.8 + r() * 1;
        const geo = cloudGeometry(r, { length: 3 * big, height: 1.1 * big, depth: 1.6 * big, puffs: 4 + Math.floor(r() * 3), top, belly });
        const c = new THREE.Mesh(geo, m);
        const a = (k / count) * Math.PI * 2 + r() * 0.6;
        // Most float below the island's edge; a few far off at its height.
        const low = r() < 0.7;
        const dist = low ? radius + 6 + r() * 8 : radius + 18 + r() * 8;
        c.position.set(Math.cos(a) * dist, low ? -5 - r() * 6 : r() * 3, Math.sin(a) * dist);
        if (!low) c.scale.setScalar(1.8);
        c.rotation.y = r() * 0.6 - 0.3;
        this.group.add(c);
        this.clouds.push({ o: c, speed: 0.12 + r() * 0.18, m });
      }
    }
    if (air.far === 'islands') {
      // Little islands far off, each with a tree or two.
      for (let k = 0; k < 4; k++) {
        const isl = new THREE.Group();
        const size = 0.9 + r() * 1.2;
        isl.add(new THREE.Mesh(new THREE.CylinderGeometry(size, size * 0.95, 0.3, 7), mat(b.ground, { rough: 0.95, flat: true })));
        const under = new THREE.Mesh(spikeGeometry(r, size * 0.95, size * 2.2), mat(b.rock, { flat: true }));
        under.position.y = -0.15;
        isl.add(under);
        if (b.decor.includes('tree') || b.decor.includes('pine') || b.decor.includes('cactus')) {
          const leaf = mat(b.decor.includes('pine') ? 0x3f7a5f : b.decor.includes('cactus') ? 0x5aa05a : 0x4fae4a, { flat: true });
          for (let t = 0; t < 1 + Math.floor(r() * 2); t++) {
            const tree = new THREE.Mesh(b.decor.includes('tree') ? new THREE.IcosahedronGeometry(0.35, 0) : new THREE.ConeGeometry(0.3, 0.8, 6), leaf);
            tree.position.set((r() - 0.5) * size, 0.5, (r() - 0.5) * size);
            isl.add(tree);
          }
        }
        const a = r() * Math.PI * 2;
        const dist = radius + 16 + r() * 12;
        isl.position.set(Math.cos(a) * dist, -2 + r() * 6, Math.sin(a) * dist);
        this.group.add(isl);
        this.floaters.push({ o: isl, y: isl.position.y, phase: r() * 6 });
      }
    } else if (air.far === 'shards') {
      // Floating rocks with crystals, slowly bobbing below and around.
      const rock = mat(b.rock, { flat: true, rough: 0.95 });
      const gem = mat(0x9bf0ff, { rough: 0.15, emissive: 0x4fb8ff, emissiveIntensity: 0.8, flat: true });
      const gem2 = mat(0xd2a8ff, { rough: 0.15, emissive: 0x9a5bff, emissiveIntensity: 0.8, flat: true });
      for (let k = 0; k < 9; k++) {
        const o = new THREE.Group();
        const size = 0.4 + r() * 0.9;
        o.add(new THREE.Mesh(roughen(new THREE.DodecahedronGeometry(size, 0), size * 0.3, r), rock));
        for (let c = 0; c < 3; c++) {
          const x = new THREE.Mesh(crystalGeometry(size * 0.18, size * (0.8 + r() * 0.8)), r() < 0.5 ? gem : gem2);
          x.position.set((r() - 0.5) * size * 0.8, size * 0.5, (r() - 0.5) * size * 0.8);
          x.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
          o.add(x);
        }
        const a = (k / 9) * Math.PI * 2 + r();
        const dist = radius + 4 + r() * 12;
        o.position.set(Math.cos(a) * dist, -6 + r() * 8, Math.sin(a) * dist);
        o.rotation.y = r() * 6;
        this.group.add(o);
        this.floaters.push({ o, y: o.position.y, phase: r() * 6 });
        this.spinners.push({ o, speed: (r() - 0.5) * 0.15 });
      }
    } else if (air.far === 'gears') {
      // Huge gears turning in the distance, meshing in pairs.
      const brass = mat(0xb8893a, { metal: 0.7, rough: 0.4 });
      const dark = mat(0x6b5440, { metal: 0.6, rough: 0.5 });
      for (let k = 0; k < 4; k++) {
        const size = 3 + r() * 3;
        const g = new THREE.Mesh(gearGeometry(size, size * 0.12, 14), k % 2 ? dark : brass);
        const holder = new THREE.Group();
        holder.add(g);
        g.rotation.x = Math.PI / 2;
        const a = Math.PI * (0.65 + k * 0.23) + r() * 0.2;
        const dist = radius + 14 + r() * 8;
        holder.position.set(Math.cos(a) * dist, -4 + r() * 10, -Math.abs(Math.sin(a) * dist));
        holder.lookAt(0, holder.position.y, 0);
        this.group.add(holder);
        this.spinners.push({ o: g, speed: (k % 2 ? -1 : 1) * (0.05 + r() * 0.05) });
      }
    }
    if (air.motes) {
      const { color, count, rise, size, glow } = air.motes;
      this.box = radius + 4;
      const pos = new Float32Array(count * 3);
      this.moteSpeed = new Float32Array(count);
      for (let k = 0; k < count; k++) {
        pos[k * 3] = (r() - 0.5) * this.box * 2;
        pos[k * 3 + 1] = -4 + r() * 12;
        pos[k * 3 + 2] = (r() - 0.5) * this.box * 2;
        this.moteSpeed[k] = 0.6 + r() * 0.8;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pm = new THREE.PointsMaterial({ color, size: size * 2.4, map: dot(), transparent: true, depthWrite: false, opacity: glow ? 0.9 : 0.85, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
      this.motes = new THREE.Points(geo, pm);
      this.rise = rise;
      this.group.add(this.motes);
    }
  }

  /** `eye`: the camera, so clouds drifting close to it fade instead of filling the screen. */
  update(time: number, dt: number, eye?: THREE.Vector3) {
    const half = this.span;
    for (const c of this.clouds) {
      c.o.position.x += c.speed * dt;
      if (c.o.position.x > half) c.o.position.x = -half;
      if (eye) {
        c.o.getWorldPosition(at);
        const d = at.distanceTo(eye) / Math.max(1, c.o.scale.x);
        const o = Math.min(1, Math.max(0, (d - 7) / 6));
        c.m.opacity = o;
        c.o.visible = o > 0.01;
      }
    }
    for (const s of this.spinners) s.o.rotation.y += s.speed * dt;
    for (const f of this.floaters) f.o.position.y = f.y + Math.sin(time * 0.5 + f.phase) * 0.3;
    if (this.motes) {
      const p = this.motes.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      for (let k = 0; k < p.count; k++) {
        const v = this.moteSpeed[k];
        a[k * 3 + 1] += this.rise * v * dt;
        // A little sideways drift.
        a[k * 3] += Math.sin(time * 0.7 + k) * 0.12 * dt;
        a[k * 3 + 2] += Math.cos(time * 0.5 + k * 1.3) * 0.12 * dt;
        if (a[k * 3 + 1] > 8) a[k * 3 + 1] = -4;
        if (a[k * 3 + 1] < -4) a[k * 3 + 1] = 8;
      }
      p.needsUpdate = true;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    for (const c of this.clouds) c.m.dispose();
    (this.motes?.material as THREE.Material | undefined)?.dispose();
  }
}

const at = new THREE.Vector3();

let dotTex: THREE.Texture | null = null;
/** A soft round dot for the particles. */
function dot() {
  if (dotTex) return dotTex;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.8)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  dotTex = new THREE.CanvasTexture(c);
  return dotTex;
}
