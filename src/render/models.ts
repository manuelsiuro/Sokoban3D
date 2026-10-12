import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Biome, DecorKind } from '../world/biomes';

/**
 * Procedural low-poly models: every piece is built from primitives in code, colored from
 * the biome. No asset files.
 */

const mats = new Map<string, THREE.MeshStandardMaterial>();
/** A shared material per color and finish (meshes that look alike share one). */
export function mat(color: number, opts: { rough?: number; metal?: number; emissive?: number; emissiveIntensity?: number; flat?: boolean } = {}) {
  const key = `${color}|${opts.rough ?? 0.8}|${opts.metal ?? 0}|${opts.emissive ?? 0}|${opts.emissiveIntensity ?? 1}|${opts.flat ?? false}`;
  let m = mats.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.8, metalness: opts.metal ?? 0, emissive: opts.emissive ?? 0, emissiveIntensity: opts.emissiveIntensity ?? 1, flatShading: opts.flat ?? false });
    mats.set(key, m);
  }
  return m;
}

const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
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

/** A wall block, in the biome's style. */
export function wallModel(b: Biome, seed: number): THREE.Object3D {
  const g = new THREE.Group();
  const side = mat(b.wallColor, { rough: 0.9 });
  const top = mat(b.wallTop, { rough: 0.85 });
  switch (b.wall) {
    case 'hedge': {
      g.add(mesh(new RoundedBoxGeometry(0.98, 0.66, 0.98, 2, 0.12), side, 0, 0.33, 0));
      // A few leafy bumps on top.
      const bump = new THREE.IcosahedronGeometry(0.17, 0);
      for (let k = 0; k < 3; k++) {
        const a = seed * 1.7 + k * 2.1;
        g.add(mesh(bump, top, Math.cos(a) * 0.25, 0.66, Math.sin(a) * 0.25));
      }
      break;
    }
    case 'ice':
      g.add(mesh(new RoundedBoxGeometry(0.96, 0.6, 0.96, 1, 0.06), mat(b.wallColor, { rough: 0.6, flat: true }), 0, 0.3, 0));
      g.add(mesh(new RoundedBoxGeometry(1, 0.14, 1, 1, 0.06), top, 0, 0.64, 0));
      break;
    case 'cloud': {
      const puff = new THREE.IcosahedronGeometry(0.38, 1);
      for (let k = 0; k < 4; k++) g.add(mesh(puff, k ? top : side, (k % 2) * 0.3 - 0.15, 0.35 + (k > 1 ? 0.35 : 0), Math.floor(k / 2) * 0.3 - 0.15));
      break;
    }
    case 'crystal': {
      g.add(mesh(new RoundedBoxGeometry(0.96, 0.45, 0.96, 1, 0.05), mat(b.soil), 0, 0.22, 0));
      const c = mesh(new THREE.OctahedronGeometry(0.3, 0), mat(b.wallTop, { rough: 0.2, emissive: b.wallColor, emissiveIntensity: 0.35, flat: true }), 0, 0.85, 0);
      c.scale.y = 1.2;
      c.position.y = 0.7;
      c.rotation.y = seed;
      g.add(c);
      break;
    }
    default:
      // Stone, sandstone, basalt, brass: a block with a lighter cap.
      g.add(mesh(new RoundedBoxGeometry(0.98, 0.6, 0.98, 1, 0.06), side, 0, 0.3, 0));
      g.add(mesh(new RoundedBoxGeometry(1, 0.14, 1, 1, 0.05), top, 0, 0.66, 0));
  }
  return g;
}

/** A decor piece on the island's rim (never on a playable cell). */
export function decorModel(kind: DecorKind, b: Biome, r: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const s = 0.75 + r() * 0.5;
  switch (kind) {
    case 'tree': {
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.5, 6), mat(0x8a5a35), 0, 0.25, 0));
      const leaf = mat(r() < 0.5 ? 0x4fae4a : 0x62c056, { flat: true });
      g.add(mesh(new THREE.IcosahedronGeometry(0.32, 0), leaf, 0, 0.7, 0));
      g.add(mesh(new THREE.IcosahedronGeometry(0.22, 0), leaf, 0.12, 0.95, 0.05));
      break;
    }
    case 'flower': {
      const colors = [0xff6f91, 0xffd447, 0xffffff, 0xb983ff, 0xff9a3d];
      for (let k = 0; k < 3; k++) {
        const x = (r() - 0.5) * 0.6;
        const z = (r() - 0.5) * 0.6;
        g.add(mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4), mat(0x3f8f3a), x, 0.08, z));
        g.add(mesh(new THREE.IcosahedronGeometry(0.05, 0), mat(colors[Math.floor(r() * colors.length)], { rough: 0.5 }), x, 0.17, z));
      }
      return g;
    }
    case 'rock':
    case 'snowRock': {
      const m = mesh(new THREE.DodecahedronGeometry(0.22, 0), mat(kind === 'rock' ? 0x9a9187 : 0xdfe8f2, { flat: true }), 0, 0.1, 0);
      m.scale.set(1.2, 0.7, 1);
      m.rotation.y = r() * 6;
      g.add(m);
      break;
    }
    case 'pine': {
      g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 6), mat(0x7a5232), 0, 0.15, 0));
      for (let k = 0; k < 3; k++) g.add(mesh(new THREE.ConeGeometry(0.34 - k * 0.08, 0.38, 7), mat(k === 2 ? 0xf5faff : 0x3f7a5f, { flat: true }), 0, 0.42 + k * 0.22, 0));
      break;
    }
    case 'cactus': {
      const c = mat(0x5aa05a, { flat: true });
      g.add(mesh(new THREE.CapsuleGeometry(0.1, 0.5, 3, 8), c, 0, 0.35, 0));
      g.add(mesh(new THREE.CapsuleGeometry(0.06, 0.18, 3, 6), c, 0.15, 0.45, 0));
      break;
    }
    case 'pillar':
      g.add(mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.9, 8), mat(b.wallTop, { flat: true }), 0, 0.45, 0));
      break;
    case 'cloud': {
      const puff = new THREE.IcosahedronGeometry(0.2, 1);
      for (let k = 0; k < 3; k++) g.add(mesh(puff, mat(0xffffff), k * 0.18 - 0.18, 0.15 + (k === 1 ? 0.08 : 0), 0));
      break;
    }
    case 'basalt':
      for (let k = 0; k < 3; k++) g.add(mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3 + k * 0.2, 6), mat(0x2f2a33, { flat: true }), (k - 1) * 0.2, 0.15 + k * 0.1, (k % 2) * 0.1));
      break;
    case 'crystal': {
      const m = mesh(new THREE.OctahedronGeometry(0.18, 0), mat(0x9bf0ff, { rough: 0.2, emissive: 0x4fb8ff, emissiveIntensity: 0.5, flat: true }), 0, 0.3, 0);
      m.scale.y = 2;
      g.add(m);
      break;
    }
    case 'gear': {
      const m = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10), mat(0xb8893a, { metal: 0.6, rough: 0.4, flat: true }), 0, 0.05, 0);
      g.add(m);
      break;
    }
  }
  g.scale.setScalar(s);
  g.rotation.y = r() * Math.PI * 2;
  return g;
}

/** Rounded floor tile geometry (shared). */
export const tileGeometry = new RoundedBoxGeometry(1, 0.3, 1, 1, 0.06);
