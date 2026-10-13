import * as THREE from 'three';

/**
 * Small effects from a fixed pool of meshes (nothing is created while playing): shards that
 * fly and fall, soft puffs that drift and fade, glowing sparks that rise.
 */
export type Kind = 'shard' | 'puff' | 'spark';

interface P {
  m: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Its own material, for puffs (each fades on its own); shards and sparks share one per color. */
  own: THREE.MeshStandardMaterial;
  v: THREE.Vector3;
  life: number;
  max: number;
  spin: number;
  kind: Kind;
  size: number;
  gravity: number;
}

const GEO: Record<Kind, THREE.BufferGeometry> = {
  shard: new THREE.TetrahedronGeometry(0.06, 0),
  puff: new THREE.IcosahedronGeometry(0.09, 1),
  spark: new THREE.OctahedronGeometry(0.04, 0),
};
const POOL = 220;

/** Shards and sparks never fade (they shrink): one opaque material per kind and color. */
const solid = new Map<string, THREE.MeshStandardMaterial>();
function solidOf(kind: Kind, color: number) {
  const key = `${kind}|${color}`;
  let m = solid.get(key);
  if (!m) {
    const glow = kind === 'spark';
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: glow ? 1.6 : 0.4, roughness: 0.6 });
    solid.set(key, m);
  }
  return m;
}

export class Particles {
  private free: P[] = [];
  private live: P[] = [];

  constructor(parent: THREE.Object3D) {
    for (let k = 0; k < POOL; k++) {
      const own = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.9, depthWrite: false });
      const m = new THREE.Mesh(GEO.shard, own);
      m.visible = false;
      m.castShadow = false;
      m.renderOrder = 3;
      parent.add(m);
      this.free.push({ m, own, v: new THREE.Vector3(), life: 0, max: 1, spin: 0, kind: 'shard', size: 1, gravity: 6 });
    }
  }

  /** `n` particles at `at`, flying out at about `speed`. */
  emit(at: THREE.Vector3, color: number, n: number, speed: number, kind: Kind = 'shard', opts: { size?: number; up?: number; life?: number; spread?: THREE.Vector3 } = {}) {
    for (let k = 0; k < n; k++) {
      // When the pool runs dry, the oldest effect gives way.
      const p = this.free.pop() ?? this.live.shift();
      if (!p) return;
      p.kind = kind;
      p.m.geometry = GEO[kind];
      if (kind === 'puff') {
        p.m.material = p.own;
        p.own.color.set(color);
        p.own.opacity = 0.75;
      } else p.m.material = solidOf(kind, color);
      p.m.position.copy(at);
      if (opts.spread) p.m.position.add(new THREE.Vector3((Math.random() - 0.5) * opts.spread.x, (Math.random() - 0.5) * opts.spread.y, (Math.random() - 0.5) * opts.spread.z));
      const a = Math.random() * Math.PI * 2;
      const out = kind === 'puff' ? 0.4 : 1;
      p.v.set(Math.cos(a) * speed * out * (0.3 + Math.random()), (opts.up ?? (kind === 'shard' ? 1 : 0.4)) * speed * (0.6 + Math.random()), Math.sin(a) * speed * out * (0.3 + Math.random()));
      p.gravity = kind === 'shard' ? 6 : kind === 'puff' ? -0.3 : -0.8;
      p.life = 0;
      p.max = (opts.life ?? (kind === 'puff' ? 0.6 : 0.7)) * (0.7 + Math.random() * 0.6);
      p.spin = Math.random() * 10;
      p.size = (opts.size ?? 1) * (0.7 + Math.random() * 0.6);
      p.m.scale.setScalar(p.size);
      p.m.visible = true;
      this.live.push(p);
    }
  }

  update(dt: number) {
    for (let k = this.live.length - 1; k >= 0; k--) {
      const p = this.live[k];
      p.life += dt;
      p.v.y -= p.gravity * dt;
      if (p.kind === 'puff') p.v.multiplyScalar(1 - dt * 3);
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin * dt;
      const t = p.life / p.max;
      if (p.kind === 'puff') {
        // Puffs grow as they fade.
        p.m.scale.setScalar(p.size * (1 + t * 1.4));
        p.m.material.opacity = 0.75 * (1 - t);
      } else p.m.scale.setScalar(Math.max(0.01, p.size * (1 - t)));
      if (t >= 1) {
        p.m.visible = false;
        this.live.splice(k, 1);
        this.free.push(p);
      }
    }
  }

  clear() {
    for (const p of this.live) {
      p.m.visible = false;
      this.free.push(p);
    }
    this.live = [];
  }
}
