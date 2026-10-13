import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../sim/rng';
import type { Biome, DecorKind } from '../world/biomes';
import { cloudGeometry, crystalGeometry, gearGeometry, roughen } from './shapes';

/**
 * Procedural low-poly models: every piece is built from primitives in code, colored from
 * the biome. No asset files.
 */

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A shared material per color and finish (meshes that look alike share one). */
export function mat(color: number, opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number; flat?: boolean; vertexColors?: boolean } = {}) {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.flat ?? false}|${opts.vertexColors ?? false}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0, emissiveIntensity: opts.emissiveIntensity ?? 1, flatShading: opts.flat ?? false, vertexColors: opts.vertexColors ?? false });
    mats.set(key, m);
  }
  return m;
}

const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
};

export const CRATE = 0.84;

/** A wooden crate: a rounded frame, inset panels and a diagonal brace on each side. */
export function crateModel(b: Biome, look?: { crate: number; trim: number }): { group: THREE.Group; panels: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const s = CRATE;
  const trimColor = look && look.trim >= 0 ? look.trim : b.crateTrim;
  g.add(mesh(new RoundedBoxGeometry(s, s, s, 2, 0.06), mat(trimColor, { rough: 0.9 })));
  // Panels get their own material, so a crate on a goal can glow.
  const panels = new THREE.MeshStandardMaterial({ color: look && look.crate >= 0 ? look.crate : b.crate, roughness: 0.85 });
  const p = s * 0.78;
  const t = 0.03;
  const face = new THREE.BoxGeometry(p, p, t);
  const brace = new THREE.BoxGeometry(p * 1.25, 0.09, t);
  const trim = mat(trimColor, { rough: 0.9 });
  for (let k = 0; k < 4; k++) {
    const side = new THREE.Group();
    side.rotation.y = (k * Math.PI) / 2;
    side.add(mesh(face, panels, 0, 0, s / 2));
    const br = mesh(brace, trim, 0, 0, s / 2 + t);
    br.rotation.z = k % 2 ? Math.PI / 4 : -Math.PI / 4;
    side.add(br);
    g.add(side);
  }
  const top = mesh(face, panels, 0, s / 2, 0);
  top.rotation.x = -Math.PI / 2;
  g.add(top);
  const plank = mesh(new THREE.BoxGeometry(p, 0.02, 0.08), trim, 0, s / 2 + 0.02, 0);
  g.add(plank);
  return { group: g, panels };
}

/** The pusher: a round little character with a cap, eyes on the front (+z). */
export function playerModel(): { group: THREE.Group; body: THREE.Group; suit: THREE.MeshStandardMaterial; cap: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  // The suit and cap have their own materials: outfits recolor them.
  const suit = new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.6 });
  const skin = mat(0xf2c9a0, { rough: 0.7 });
  const cap = new THREE.MeshStandardMaterial({ color: 0xe0433a, roughness: 0.55 });
  body.add(mesh(new THREE.CapsuleGeometry(0.2, 0.18, 4, 12), suit, 0, 0.29, 0));
  body.add(mesh(new THREE.SphereGeometry(0.19, 16, 12), skin, 0, 0.66, 0));
  const capTop = mesh(new THREE.SphereGeometry(0.2, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 0.7, 0);
  body.add(capTop);
  const brim = mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), cap, 0, 0.71, 0.12);
  body.add(brim);
  const white = mat(0xffffff, { rough: 0.3 });
  const black = mat(0x1a1a24, { rough: 0.3 });
  for (const x of [-0.07, 0.07]) {
    body.add(mesh(new THREE.SphereGeometry(0.045, 10, 8), white, x, 0.66, 0.165));
    body.add(mesh(new THREE.SphereGeometry(0.025, 8, 6), black, x, 0.66, 0.2));
  }
  // A nose, rosy cheeks, a belt and a little backpack.
  body.add(mesh(new THREE.SphereGeometry(0.035, 8, 6), mat(0xf0b48a, { rough: 0.6 }), 0, 0.62, 0.19));
  for (const x of [-0.11, 0.11]) body.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat(0xff9c8a, { rough: 0.8 }), x, 0.6, 0.15));
  const belt = mesh(new THREE.TorusGeometry(0.205, 0.025, 6, 20), mat(0x5a3a22, { rough: 0.7 }), 0, 0.24, 0);
  belt.rotation.x = Math.PI / 2;
  body.add(belt);
  body.add(mesh(new RoundedBoxGeometry(0.22, 0.24, 0.1, 2, 0.04), mat(0xd9a441, { rough: 0.7 }), 0, 0.36, -0.2));
  // Hands, stretched out front when pushing.
  for (const x of [-0.2, 0.2]) body.add(mesh(new THREE.SphereGeometry(0.065, 10, 8), skin, x, 0.32, 0.05));
  // Boots.
  for (const x of [-0.09, 0.09]) body.add(mesh(new THREE.SphereGeometry(0.08, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0x5a3a22), x, 0, 0.02));
  return { group: g, body, suit, cap };
}

/** A goal pad: a glowing ring set in the floor. The ring's material pulses when uncovered. */
export function goalModel(b: Biome): { group: THREE.Group; glow: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const glow = new THREE.MeshStandardMaterial({ color: b.goal, emissive: b.goal, emissiveIntensity: 0.6, roughness: 0.4 });
  const ring = mesh(new THREE.TorusGeometry(0.3, 0.05, 8, 28), glow, 0, 0.02, 0);
  ring.rotation.x = -Math.PI / 2;
  ring.castShadow = false;
  const disc = mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), mat(b.goal, { rough: 0.5, emissive: b.goal, emissiveIntensity: 0.15 }), 0, 0.01, 0);
  disc.castShadow = false;
  g.add(ring, disc);
  return { group: g, glow };
}

/** A wall block, in the biome's style (seeded by its cell, so each one differs a little). */
export function wallModel(b: Biome, seed: number): THREE.Object3D {
  const g = new THREE.Group();
  const r = rng(seed * 7349 + 11).next;
  const side = mat(b.wallColor, { rough: 0.9 });
  const top = mat(b.wallTop, { rough: 0.85 });
  switch (b.wall) {
    case 'hedge': {
      // A clipped hedge: a soft block, leafy clumps bulging out of the top and the sides.
      const dark = mat(b.wallColor, { rough: 0.95, flat: true });
      const light = mat(b.wallTop, { rough: 0.9, flat: true });
      g.add(mesh(new RoundedBoxGeometry(0.94, 0.62, 0.94, 2, 0.14), dark, 0, 0.31, 0));
      for (let k = 0; k < 5; k++) {
        const a = r() * Math.PI * 2;
        const d = 0.12 + r() * 0.2;
        const leaf = mesh(roughen(new THREE.IcosahedronGeometry(0.2 + r() * 0.08, 1), 0.06, r), k < 3 ? light : dark, Math.cos(a) * d, 0.62 + r() * 0.06, Math.sin(a) * d);
        leaf.scale.y = 0.75;
        g.add(leaf);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + r();
        g.add(mesh(roughen(new THREE.IcosahedronGeometry(0.16, 1), 0.05, r), dark, Math.cos(a) * 0.4, 0.22 + r() * 0.25, Math.sin(a) * 0.4));
      }
      if (r() < 0.18) {
        const bloom = mat(r() < 0.5 ? 0xff8fb0 : 0xfff2a8, { rough: 0.6 });
        for (let k = 0; k < 3; k++) g.add(mesh(new THREE.IcosahedronGeometry(0.045, 0), bloom, (r() - 0.5) * 0.6, 0.72, (r() - 0.5) * 0.6));
      }
      break;
    }
    case 'ice': {
      // A faceted block of blue ice under a soft cap of snow, with a few icicles.
      const ice = mat(b.wallColor, { rough: 0.12, metal: 0.05, flat: true });
      g.add(mesh(roughen(new THREE.BoxGeometry(0.92, 0.7, 0.92, 2, 2, 2), 0.07, r, true), ice, 0, 0.35, 0));
      // The cap leaves a rim of ice showing, so walls stand out from the snowy floor.
      const snow = mesh(roughen(new RoundedBoxGeometry(0.7, 0.12, 0.7, 2, 0.06), 0.06, r), mat(b.wallTop, { rough: 0.95 }), (r() - 0.5) * 0.08, 0.72, (r() - 0.5) * 0.08);
      g.add(snow);
      const drift = mesh(new THREE.IcosahedronGeometry(0.17, 1), mat(b.wallTop, { rough: 0.95 }), (r() - 0.5) * 0.25, 0.77, (r() - 0.5) * 0.25);
      drift.scale.set(1.3, 0.45, 1.1);
      g.add(drift);
      const icicle = new THREE.ConeGeometry(0.035, 0.16, 5);
      icicle.rotateX(Math.PI);
      for (let k = 0; k < 3; k++) {
        const s = r() < 0.5 ? -1 : 1;
        const along = (r() - 0.5) * 0.8;
        const [x, z] = r() < 0.5 ? [s * 0.47, along] : [along, s * 0.47];
        g.add(mesh(icicle, ice, x, 0.62, z));
      }
      break;
    }
    case 'cloud': {
      // A bank of cloud: neighbouring walls overlap into one long cumulus.
      const m = new THREE.Mesh(cloudGeometry(r, { length: 0.8, height: 0.66, depth: 0.95, puffs: 4, top: b.wallTop, belly: 0xb8a8e0 }), mat(0xffffff, { rough: 1, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.18 }));
      m.position.y = 0.08;
      m.rotation.y = r() * Math.PI;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
      break;
    }
    case 'sandstone': {
      // Two courses of weathered blocks, the upper one set back and offset.
      const stone = mat(b.wallColor, { rough: 0.95, flat: true });
      const cap = mat(b.wallTop, { rough: 0.95, flat: true });
      g.add(mesh(roughen(new THREE.BoxGeometry(0.96, 0.34, 0.96, 2, 1, 2), 0.04, r, true), stone, 0, 0.17, 0));
      const upper = mesh(roughen(new THREE.BoxGeometry(0.9, 0.34, 0.9, 2, 1, 2), 0.05, r), cap, (r() - 0.5) * 0.06, 0.51, (r() - 0.5) * 0.06);
      upper.rotation.y = (r() - 0.5) * 0.08;
      g.add(upper);
      if (r() < 0.35) g.add(mesh(roughen(new THREE.DodecahedronGeometry(0.1, 0), 0.04, r), cap, (r() - 0.5) * 0.5, 0.72, (r() - 0.5) * 0.5));
      break;
    }
    case 'basalt': {
      // A cluster of hexagonal basalt columns, glowing faintly where they meet the floor.
      const rock = mat(b.wallColor, { rough: 0.85, flat: true });
      const tops = mat(b.wallTop, { rough: 0.7, flat: true });
      const col = (x: number, z: number, rad: number, h: number) => {
        g.add(mesh(new THREE.CylinderGeometry(rad, rad * 1.04, h, 6), rock, x, h / 2, z));
        const t = mesh(new THREE.CylinderGeometry(rad * 0.98, rad * 0.98, 0.03, 6), tops, x, h + 0.01, z);
        t.rotation.set((r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2);
        g.add(t);
      };
      col(0, 0, 0.24, 0.7 + r() * 0.15);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        col(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.17, 0.45 + r() * 0.35);
      }
      const glow = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 6), mat(0xff5a1a, { emissive: 0xff4010, emissiveIntensity: 0.9, rough: 0.6 }), 0, 0.015, 0);
      glow.castShadow = false;
      g.add(glow);
      break;
    }
    case 'crystal': {
      // Dark cave rock with a cluster of glowing crystals growing out of it.
      g.add(mesh(roughen(new THREE.BoxGeometry(0.94, 0.42, 0.94, 2, 1, 2), 0.08, r, true), mat(b.soil, { rough: 0.95, flat: true }), 0, 0.21, 0));
      const gem = mat(b.wallTop, { rough: 0.15, metal: 0.1, emissive: b.wallColor, emissiveIntensity: 0.55, flat: true });
      const gem2 = mat(0x9bf0ff, { rough: 0.15, emissive: 0x4fb8ff, emissiveIntensity: 0.5, flat: true });
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const c = mesh(crystalGeometry(0.09 + r() * 0.07, 0.35 + r() * 0.45), k === 0 && r() < 0.4 ? gem2 : gem, (r() - 0.5) * 0.45, 0.4, (r() - 0.5) * 0.45);
        c.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
        g.add(c);
      }
      break;
    }
    case 'brass': {
      // A machine block: iron sides with a brass band, rivets, and a gear set in the top.
      const iron = mat(b.wallColor, { rough: 0.55, metal: 0.45 });
      const brass = mat(0xc9963f, { rough: 0.35, metal: 0.75 });
      g.add(mesh(new RoundedBoxGeometry(0.96, 0.66, 0.96, 1, 0.05), iron, 0, 0.33, 0));
      g.add(mesh(new RoundedBoxGeometry(1, 0.07, 1, 1, 0.02), brass, 0, 0.5, 0));
      g.add(mesh(new RoundedBoxGeometry(1, 0.06, 1, 1, 0.02), brass, 0, 0.05, 0));
      const rivet = new THREE.SphereGeometry(0.035, 6, 4);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        g.add(mesh(rivet, brass, Math.cos(a) * 0.62, 0.36, Math.sin(a) * 0.62));
      }
      const gear = mesh(gearGeometry(0.28, 0.04, 9), mat(0xe0b45a, { rough: 0.3, metal: 0.8 }), 0, 0.67, 0);
      gear.rotation.y = r() * 3;
      g.add(gear);
      break;
    }
    default:
      g.add(mesh(new RoundedBoxGeometry(0.98, 0.6, 0.98, 1, 0.06), side, 0, 0.3, 0));
      g.add(mesh(new RoundedBoxGeometry(1, 0.14, 1, 1, 0.05), top, 0, 0.66, 0));
  }
  return g;
}

/**
 * A decor piece on the island's rim (never on a playable cell). Parts that move are
 * marked `userData.live` (with `spin` or `bob`), so baking leaves them alone.
 */
export function decorModel(kind: DecorKind, b: Biome, r: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const s = 0.75 + r() * 0.5;
  switch (kind) {
    case 'tree': {
      const bark = mat(0x8a5a35, { flat: true });
      const trunk = new THREE.CylinderGeometry(0.05, 0.09, 0.55, 6);
      g.add(mesh(trunk, bark, 0, 0.27, 0));
      const leafA = mat(0x4fae4a, { flat: true, rough: 0.9 });
      const leafB = mat(0x6cc45a, { flat: true, rough: 0.9 });
      const round = r() < 0.5;
      const clumps = round ? [[0, 0.72, 0, 0.32], [0.14, 0.92, 0.06, 0.22], [-0.12, 0.86, -0.08, 0.2]] : [[0, 0.62, 0, 0.3], [0, 0.88, 0, 0.24], [0, 1.08, 0, 0.15]];
      clumps.forEach(([x, y, z, rad], k) => {
        const c = mesh(roughen(new THREE.IcosahedronGeometry(rad, 1), rad * 0.25, r), k === 1 ? leafB : leafA, x, y, z);
        if (!round) c.scale.y = 0.8;
        g.add(c);
      });
      break;
    }
    case 'bush': {
      const leaf = mat(r() < 0.5 ? 0x4a9e45 : 0x5cb850, { flat: true, rough: 0.9 });
      for (let k = 0; k < 3; k++) g.add(mesh(roughen(new THREE.IcosahedronGeometry(0.15 + r() * 0.08, 1), 0.05, r), leaf, (k - 1) * 0.15, 0.1, (r() - 0.5) * 0.15));
      if (r() < 0.5) for (let k = 0; k < 3; k++) g.add(mesh(new THREE.IcosahedronGeometry(0.035, 0), mat(0xff5f6d, { rough: 0.5 }), (r() - 0.5) * 0.4, 0.22, (r() - 0.5) * 0.2));
      break;
    }
    case 'flower': {
      const colors = [0xff6f91, 0xffd447, 0xffffff, 0xb983ff, 0xff9a3d];
      const stem = mat(0x3f8f3a);
      const petal = new THREE.SphereGeometry(0.035, 6, 4);
      for (let k = 0; k < 3; k++) {
        const x = (r() - 0.5) * 0.6;
        const z = (r() - 0.5) * 0.6;
        const h = 0.12 + r() * 0.08;
        g.add(mesh(new THREE.CylinderGeometry(0.01, 0.012, h, 4), stem, x, h / 2, z));
        const pm = mat(colors[Math.floor(r() * colors.length)], { rough: 0.6 });
        for (let p = 0; p < 5; p++) {
          const a = (p / 5) * Math.PI * 2;
          const m = mesh(petal, pm, x + Math.cos(a) * 0.04, h + 0.01, z + Math.sin(a) * 0.04);
          m.scale.set(1, 0.4, 1);
          g.add(m);
        }
        g.add(mesh(new THREE.SphereGeometry(0.025, 6, 4), mat(0xffc93d, { rough: 0.5 }), x, h + 0.02, z));
      }
      return g;
    }
    case 'grass': {
      const blade = new THREE.ConeGeometry(0.025, 0.2, 3);
      const green = mat(b.ground2 === 0xe8c47f ? 0xb5b25a : 0x5aa84f, { flat: true });
      for (let k = 0; k < 7; k++) {
        const m = mesh(blade, green, (r() - 0.5) * 0.25, 0.08, (r() - 0.5) * 0.25);
        m.rotation.set((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6);
        m.scale.y = 0.6 + r() * 0.8;
        g.add(m);
      }
      return g;
    }
    case 'mushroom': {
      const glowing = b.wall === 'crystal';
      const capColor = glowing ? 0x7dffd6 : 0xe0433a;
      const cap = mat(capColor, glowing ? { emissive: 0x3fe0b0, emissiveIntensity: 0.8, rough: 0.4 } : { rough: 0.5 });
      for (let k = 0; k < 2; k++) {
        const x = k * 0.16 - 0.06;
        const h = k ? 0.1 : 0.16;
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 6), mat(0xf2e6d0), x, h / 2, 0));
        const c = mesh(new THREE.SphereGeometry(k ? 0.07 : 0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, x, h, 0);
        g.add(c);
        if (!glowing) for (let d = 0; d < 3; d++) g.add(mesh(new THREE.SphereGeometry(0.014, 4, 3), mat(0xffffff), x + Math.cos(d * 2.1) * 0.05, h + 0.06, Math.sin(d * 2.1) * 0.05));
      }
      break;
    }
    case 'rock':
    case 'snowRock': {
      const dr = rng(Math.floor(r() * 1e6)).next;
      const m = mesh(roughen(new THREE.DodecahedronGeometry(0.22, 0), 0.08, dr), mat(kind === 'rock' ? 0x9a9187 : 0x8c9bb0, { flat: true }), 0, 0.1, 0);
      m.scale.set(1.2, 0.75, 1);
      g.add(m);
      if (kind === 'snowRock') {
        const cap = mesh(new THREE.SphereGeometry(0.22, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2.4), mat(0xf7fbff, { rough: 0.95 }), 0, 0.15, 0);
        cap.scale.set(1.25, 0.6, 1.05);
        g.add(cap);
      }
      g.add(mesh(roughen(new THREE.DodecahedronGeometry(0.08, 0), 0.03, dr), mat(kind === 'rock' ? 0x8a8177 : 0xdfe8f2, { flat: true }), 0.25, 0.04, 0.1));
      break;
    }
    case 'pine': {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), mat(0x7a5232), 0, 0.15, 0));
      const needles = mat(0x3f7a5f, { flat: true });
      const snow = mat(0xf5faff, { flat: true, rough: 0.95 });
      for (let k = 0; k < 3; k++) {
        const rad = 0.36 - k * 0.09;
        const y = 0.42 + k * 0.22;
        const cone = mesh(new THREE.ConeGeometry(rad, 0.38, 7), needles, 0, y, 0);
        cone.rotation.y = r() * 3;
        g.add(cone);
        // Snow on the upper half of each tier.
        const cap = mesh(new THREE.ConeGeometry(rad * 0.62, 0.24, 7), snow, 0, y + 0.08, 0);
        cap.rotation.y = cone.rotation.y;
        g.add(cap);
      }
      break;
    }
    case 'cactus': {
      // A ribbed saguaro with one or two arms, sometimes in bloom.
      const c = mat(0x5aa05a, { flat: true });
      const h = 0.55 + r() * 0.25;
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.11, h, 8), c, 0, h / 2, 0));
      g.add(mesh(new THREE.SphereGeometry(0.1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, 0, h, 0));
      const arms = r() < 0.5 ? [1] : [1, -1];
      for (const sgn of arms) {
        const y = h * (0.4 + r() * 0.25);
        const out = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8), c, sgn * 0.14, y, 0);
        out.rotation.z = Math.PI / 2;
        g.add(out);
        const up = 0.16 + r() * 0.12;
        g.add(mesh(new THREE.CylinderGeometry(0.055, 0.06, up, 8), c, sgn * 0.22, y + up / 2 - 0.03, 0));
        g.add(mesh(new THREE.SphereGeometry(0.055, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), c, sgn * 0.22, y + up - 0.03, 0));
      }
      if (r() < 0.4) g.add(mesh(new THREE.IcosahedronGeometry(0.045, 0), mat(0xff6f91, { rough: 0.5 }), 0, h + 0.09, 0));
      break;
    }
    case 'pillar': {
      if (b.wall === 'brass') {
        // A brass pipe stack with a valve wheel.
        const brass = mat(0xc9963f, { rough: 0.35, metal: 0.75 });
        g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.8, 10), mat(0x6b5d50, { metal: 0.5, rough: 0.5 }), 0, 0.4, 0));
        for (const y of [0.1, 0.5, 0.8]) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 10), brass, 0, y, 0));
        const wheel = mesh(new THREE.TorusGeometry(0.1, 0.02, 5, 12), mat(0xe0533d, { metal: 0.3, rough: 0.5 }), 0, 0.6, 0.13);
        g.add(wheel);
        break;
      }
      // A ruined column: base, fluted shaft, capital; some are broken off.
      const stone = mat(b.wallTop, { flat: true, rough: 0.95 });
      const broken = r() < 0.45;
      const h = broken ? 0.35 + r() * 0.25 : 0.8;
      g.add(mesh(new THREE.BoxGeometry(0.34, 0.08, 0.34), stone, 0, 0.04, 0));
      g.add(mesh(roughen(new THREE.CylinderGeometry(0.12, 0.14, h, 8, 2), broken ? 0.05 : 0.015, r), stone, 0, 0.08 + h / 2, 0));
      if (!broken) g.add(mesh(new THREE.BoxGeometry(0.32, 0.08, 0.32), stone, 0, 0.92, 0));
      else {
        const piece = mesh(roughen(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), 0.04, r), stone, 0.3, 0.12, 0.05);
        piece.rotation.set(0, r() * 3, Math.PI / 2);
        g.add(piece);
      }
      break;
    }
    case 'cloud': {
      const m = new THREE.Mesh(cloudGeometry(r, { length: 0.5, height: 0.3, depth: 0.35, puffs: 3 }), mat(0xffffff, { rough: 1, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.06 }));
      m.position.y = 0.12;
      m.castShadow = true;
      g.add(m);
      break;
    }
    case 'basalt': {
      const rock = mat(0x2f2a33, { flat: true });
      for (let k = 0; k < 4; k++) {
        const h = 0.2 + r() * 0.45;
        const a = (k / 4) * Math.PI * 2;
        g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, h, 6), rock, k ? Math.cos(a) * 0.17 : 0, h / 2, k ? Math.sin(a) * 0.17 : 0));
      }
      break;
    }
    case 'ember': {
      // A cooling lava rock, cracked and glowing inside.
      const dr = rng(Math.floor(r() * 1e6)).next;
      g.add(mesh(roughen(new THREE.DodecahedronGeometry(0.2, 0), 0.07, dr), mat(0x3a2f33, { flat: true, rough: 0.9 }), 0, 0.1, 0));
      const core = mesh(new THREE.IcosahedronGeometry(0.17, 0), mat(0xff6a1a, { emissive: 0xff4a10, emissiveIntensity: 1.6, flat: true }), 0, 0.1, 0);
      core.scale.set(1.08, 1.05, 1.08);
      core.rotation.set(r() * 3, r() * 3, 0);
      g.add(core);
      break;
    }
    case 'crystal': {
      const tints: [number, number][] = [[0x9bf0ff, 0x4fb8ff], [0xd2a8ff, 0x9a5bff], [0xffb3e6, 0xff5fb8]];
      const [c, e] = tints[Math.floor(r() * tints.length)];
      const m = mat(c, { rough: 0.15, emissive: e, emissiveIntensity: 0.65, flat: true });
      for (let k = 0; k < 3; k++) {
        const x = mesh(crystalGeometry(0.06 + r() * 0.04, 0.25 + r() * 0.35), m, (r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
        x.rotation.set((r() - 0.5) * 0.8, r() * 3, (r() - 0.5) * 0.8);
        g.add(x);
      }
      break;
    }
    case 'gear': {
      // Two gears lying on the ground, meshing and turning (they read from above).
      const brass = mat(0xc9963f, { metal: 0.75, rough: 0.35 });
      const copper = mat(0xb06a3a, { metal: 0.7, rough: 0.4 });
      const pin = mat(0x4a3f38, { metal: 0.5, rough: 0.4 });
      const speed = (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.3);
      const pair: [number, number, number, THREE.Material, number][] = [[0, 0, 0.3, brass, speed], [0.4, 0.12, 0.17, copper, (-speed * 0.3) / 0.17]];
      for (const [x, z, rad, m, sp] of pair) {
        const wheel = new THREE.Group();
        wheel.add(mesh(gearGeometry(rad, 0.06, Math.round(rad * 34)), m));
        wheel.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 8), pin));
        wheel.position.set(x, 0.05, z);
        wheel.rotation.y = r() * 3;
        wheel.userData = { live: true, spin: sp };
        g.add(wheel);
      }
      break;
    }
    case 'lamp': {
      // A gas lamp on a brass post.
      const brass = mat(0xc9963f, { rough: 0.35, metal: 0.75 });
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 8), brass, 0, 0.03, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.75, 6), mat(0x3b2f2a, { metal: 0.5, rough: 0.4 }), 0, 0.4, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.16, 6), mat(0xffe08a, { emissive: 0xffc04a, emissiveIntensity: 1.4, rough: 0.3 }), 0, 0.86, 0));
      g.add(mesh(new THREE.ConeGeometry(0.11, 0.08, 6), brass, 0, 0.98, 0));
      break;
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

/** Rounded floor tile geometry (shared). */
export const tileGeometry = new RoundedBoxGeometry(1, 0.3, 1, 1, 0.06);
