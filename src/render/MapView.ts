import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from '../sim/rng';
import { biomeOf } from '../world/biomes';
import { crateModel, decorModel, goalModel, mat, wallModel } from './models';
import { bake, cloudGeometry, spikeGeometry } from './shapes';
import { skyTexture } from './sky';

/**
 * The overworld: one small floating island per world, in its biome's colors, joined by a
 * trail of floating stones. The camera glides to the selected island. Visual only.
 */
export class MapView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
  private islands: THREE.Group[] = [];
  private locks: THREE.Object3D[] = [];
  private focus = new THREE.Vector3();
  private shownFocus = new THREE.Vector3();
  private selected = 0;
  private skyFrom = new THREE.Color();
  private skyTo = new THREE.Color();
  private bottomFrom = new THREE.Color();
  private bottomTo = new THREE.Color();
  private skyT = 1;
  private skyCanvas: HTMLCanvasElement;
  private sky: THREE.CanvasTexture;
  private now = 0;
  private raycaster = new THREE.Raycaster();
  private clouds: THREE.Object3D[] = [];
  private sun: THREE.DirectionalLight;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    worlds: { id: string }[],
  ) {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a9a, 1.3));
    // The sun (and its shadow box) follows the camera's focus along the line of islands.
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d6, 2.2));
    sun.position.set(-10, 20, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    const sc = sun.shadow.camera;
    sc.left = -24;
    sc.right = 24;
    sc.top = 24;
    sc.bottom = -24;
    sc.near = 1;
    sc.far = 70;
    this.scene.add(sun, sun.target);
    this.skyCanvas = document.createElement('canvas');
    this.sky = skyTexture(0x6ec3f0, 0xdff3f7, this.skyCanvas);
    this.scene.background = this.sky;
    worlds.forEach((w, k) => {
      const island = buildIsland(w.id, k);
      island.position.copy(this.spot(k));
      this.scene.add(island);
      this.islands.push(island);
      // A padlock floating over locked islands.
      const lock = padlock();
      lock.position.set(0, 2.6, 0);
      island.add(lock);
      this.locks.push(lock);
      if (k > 0) this.trail(this.spot(k - 1), this.spot(k), k);
    });
    // Clouds drifting below the islands.
    const R = rng(4242);
    const cloud = mat(0xffffff, { rough: 1, vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0.3 });
    for (let k = 0; k < worlds.length * 2; k++) {
      const big = 0.8 + R.next() * 0.8;
      const c = new THREE.Mesh(cloudGeometry(R.next, { length: 3 * big, height: 1.1 * big, depth: 1.6 * big, puffs: 5 }), cloud);
      c.position.set(-6 + R.next() * (worlds.length * 9 + 12), -6 - R.next() * 5, -14 + R.next() * 10);
      this.scene.add(c);
      this.clouds.push(c);
    }
    this.select(0, true);
  }

  /** Where world k's island floats: a winding line. */
  private spot(k: number) {
    return new THREE.Vector3(k * 9, Math.sin(k * 1.3) * 1.2, Math.sin(k * 0.9) * 4 - (k % 2) * 2);
  }

  private trail(a: THREE.Vector3, b: THREE.Vector3, seed: number) {
    const R = rng(seed * 977);
    const stone = new THREE.DodecahedronGeometry(0.28, 0);
    for (let t = 0.22; t < 0.8; t += 0.11) {
      const p = a.clone().lerp(b, t);
      p.y += Math.sin(t * Math.PI) * 1.2 - 0.2;
      const m = new THREE.Mesh(stone, mat(0xcfc3b0, { flat: true }));
      m.position.copy(p);
      m.scale.set(1.3, 0.5, 1.1);
      m.rotation.y = R.next() * 6;
      m.castShadow = true;
      this.scene.add(m);
    }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /** Locked worlds get a padlock and a grey veil. */
  setLocked(locked: boolean[]) {
    locked.forEach((l, k) => {
      this.locks[k].visible = l;
      this.islands[k].traverse((o) => {
        if (o instanceof THREE.Mesh && o.userData.tint !== false) o.material = l ? greyOf(o.userData.base ?? o.material) : (o.userData.base ?? o.material);
      });
    });
  }

  select(k: number, snap = false) {
    this.selected = k;
    this.focus.copy(this.spot(k));
    const b = biomeOf(this.islands[k]?.userData.world ?? 'meadow');
    this.skyFrom.copy(this.top);
    this.bottomFrom.copy(this.bottom);
    this.skyTo.set(b.skyTop);
    this.bottomTo.set(b.skyBottom);
    this.skyT = snap ? 1 : 0;
    if (snap) {
      this.shownFocus.copy(this.focus);
      this.paintSky(1);
    }
  }

  private top = new THREE.Color(0x6ec3f0);
  private bottom = new THREE.Color(0xdff3f7);

  private paintSky(t: number) {
    this.top.copy(this.skyFrom).lerp(this.skyTo, t);
    this.bottom.copy(this.bottomFrom).lerp(this.bottomTo, t);
    skyTexture(this.top.getHex(), this.bottom.getHex(), this.skyCanvas, this.sky);
  }

  /** The world under a screen point, or -1. */
  pick(clientX: number, clientY: number) {
    const v = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(v, this.camera);
    const hits = this.raycaster.intersectObjects(this.islands, true);
    if (!hits.length) return -1;
    let o: THREE.Object3D | null = hits[0].object;
    while (o && !this.islands.includes(o as THREE.Group)) o = o.parent;
    return o ? this.islands.indexOf(o as THREE.Group) : -1;
  }

  draw(time: number) {
    const dt = Math.min(0.05, Math.max(0, time - this.now));
    this.now = time;
    this.shownFocus.lerp(this.focus, Math.min(1, dt * 4));
    if (this.skyT < 1) {
      this.skyT = Math.min(1, this.skyT + dt * 2.5);
      this.paintSky(this.skyT);
    }
    this.islands.forEach((isl, k) => {
      isl.position.y = this.spot(k).y + Math.sin(time * 0.8 + k) * 0.12;
      isl.rotation.y = k === this.selected ? Math.sin(time * 0.4) * 0.12 : 0;
    });
    for (const l of this.locks) l.rotation.y = time;
    for (const c of this.clouds) {
      c.position.x += dt * 0.25;
      if (c.position.x > this.islands.length * 9 + 8) c.position.x = -8;
    }
    // Portrait screens pull back, so the neighbours stay in view.
    const back = 22 / Math.min(1, this.camera.aspect * 1.1);
    const f = this.shownFocus;
    this.sun.position.set(f.x - 10, f.y + 20, f.z + 12);
    this.sun.target.position.copy(f);
    this.camera.position.set(f.x, f.y + back * 0.5, f.z + back);
    // Aim below the island, so it floats above the world card.
    this.camera.lookAt(f.x, f.y - 2.2, f.z);
    this.renderer.render(this.scene, this.camera);
  }
}

const greys = new Map<THREE.Material, THREE.Material>();
function greyOf(m: THREE.Material | THREE.Material[]): THREE.Material {
  const src = Array.isArray(m) ? m[0] : m;
  let g = greys.get(src);
  if (!g) {
    const c = (src as THREE.MeshStandardMaterial).color?.clone() ?? new THREE.Color(0x999999);
    const l = c.r * 0.3 + c.g * 0.59 + c.b * 0.11;
    g = new THREE.MeshStandardMaterial({ color: new THREE.Color(l, l, l).lerp(new THREE.Color(0xb8c2d0), 0.4), roughness: 0.9 });
    greys.set(src, g);
  }
  return g;
}

/** A small island in a world's colors, with a crate on a pad and decor. */
function buildIsland(world: string, seed: number): THREE.Group {
  const b = biomeOf(world);
  const R = rng(seed * 7919 + 13);
  const parts = new THREE.Group();
  const g = parts;
  const top = new RoundedBoxGeometry(1, 0.3, 1, 1, 0.06);
  const cells: [number, number][] = [];
  for (let x = -2; x <= 2; x++)
    for (let z = -2; z <= 2; z++) {
      const corner = Math.abs(x) === 2 && Math.abs(z) === 2;
      if (corner && R.next() < 0.7) continue;
      cells.push([x, z]);
    }
  for (const [x, z] of cells) {
    const edge = Math.max(Math.abs(x), Math.abs(z));
    g.add(keep(new THREE.Mesh(top, mat((x + z) & 1 ? b.ground2 : b.ground, { rough: 0.95 })), x, -0.15, z));
    g.add(keep(new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 1), mat(b.soil)), x, -0.6, z));
    const depth = 0.8 + (2 - edge) * 1.1 + R.next() * 0.6;
    g.add(keep(new THREE.Mesh(spikeGeometry(R.next, 0.68, depth * 1.3), mat(b.rock, { flat: true })), x, -0.88, z));
  }
  // A wall piece, a crate on a pad, decor on the rim.
  const wall = wallModel(b, seed);
  wall.position.set(-1, 0, -1);
  g.add(wall);
  const crate = crateModel(b);
  crate.group.position.set(0.0, 0.42, 0.2);
  g.add(crate.group);
  const goal = goalModel(b);
  goal.group.position.set(1, 0, 0.2);
  g.add(goal.group);
  for (const [x, z] of cells) {
    if (Math.max(Math.abs(x), Math.abs(z)) < 2 || R.next() < 0.45) continue;
    const d = decorModel(R.pick(b.decor), b, R.next);
    d.position.set(x, 0, z);
    g.add(d);
  }
  // Baked into one mesh per material (the map shows eight islands at once).
  parts.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  const island = bake(parts);
  island.userData.world = world;
  island.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.receiveShadow = true;
      o.userData.base = o.material;
      // Glows (the goal's light column) keep their look when locked.
      if ((o.material as THREE.Material).transparent) {
        o.userData.tint = false;
        o.castShadow = false;
      }
    }
  });
  return island;
}

function keep(m: THREE.Mesh, x: number, y: number, z: number) {
  m.position.set(x, y, z);
  return m;
}

function padlock(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.7, 0.55, 0.3, 2, 0.08), mat(0xffc23d, { metal: 0.5, rough: 0.35 }));
  const shackle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 8, 16, Math.PI), mat(0xd6dde6, { metal: 0.7, rough: 0.3 }));
  shackle.position.y = 0.27;
  g.add(body, shackle);
  g.traverse((o) => {
    o.userData.tint = false;
  });
  return g;
}
