import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelDef } from '../levels/types';
import { DX, DY, VOID, type Grid } from '../sim/grid';
import { EVENT, type GameState } from '../sim/Sim';
import { rng } from '../sim/rng';
import { biomeOf, type Biome } from '../world/biomes';
import { CRATE, crateModel, decorModel, goalModel, mat, playerModel, tileGeometry, wallModel } from './models';

/** World height of one level (a crate's height, so a crate in a dip is flush with the floor). */
export const LEVEL_H = CRATE;
/** How long a move's animation lasts (seconds); a fall takes longer. */
const MOVE_T = 0.13;
const FALL_T = 0.24;

interface Tween {
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** Slides first, then drops (a crate falling off a ledge). */
  drop: boolean;
}

interface Particle {
  m: THREE.Mesh;
  v: THREE.Vector3;
  life: number;
  max: number;
  spin: number;
}

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * Draws a level and the game state; never changes the state. A move is shown as a short
 * tween from the previous state to the new one, which the simulation never waits for.
 */
export class View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  private world = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private grid: Grid | null = null;
  private biome: Biome = biomeOf('meadow');
  private center = new THREE.Vector3();
  private radius = 5;
  /** Half the island's longest side, rim included (what must fit across a narrow screen). */
  private halfSpan = 5;
  private crates: { group: THREE.Group; panels: THREE.MeshStandardMaterial; tween: Tween | null; lost: boolean }[] = [];
  private goals: { cell: number; glow: THREE.MeshStandardMaterial }[] = [];
  private player = playerModel();
  private playerTween: Tween | null = null;
  private hop = 0.1;
  private facing = 0;
  private facingFrom = 0;
  private pushing = false;
  private t0 = 0;
  private dur = MOVE_T;
  private now = 0;
  private particles: Particle[] = [];
  private clouds: THREE.Object3D[] = [];
  private state: GameState | null = null;
  private wonAt = -1;
  /** Camera yaw in quarter turns (0: looking north), and the shown, eased yaw. */
  private yaw = 0;
  private shownYaw = 0;
  /** Behind the title screen: the camera orbits slowly. */
  private orbiting = false;
  reducedMotion = false;

  constructor(readonly renderer: THREE.WebGLRenderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.2);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.world, this.player.group);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  /** World position of a cell's floor (or of a crate/player standing at level z). */
  private pos(cell: number, z: number, out = new THREE.Vector3()) {
    const g = this.grid!;
    const x = cell % g.w;
    const y = Math.floor(cell / g.w);
    return out.set(x - (g.w - 1) / 2, z * LEVEL_H, y - (g.h - 1) / 2);
  }

  /** Builds the island for a level: tiles, columns, walls, goals, decor, the rock below. */
  setLevel(level: LevelDef, grid: Grid, state: GameState) {
    this.grid = grid;
    const b = (this.biome = biomeOf(level.world));
    this.world.clear();
    for (const c of this.crates) this.scene.remove(c.group);
    this.crates = [];
    this.goals = [];
    this.wonAt = -1;
    const R = rng(hash(level.id));
    // Sky, fog and light.
    this.scene.background = skyTexture(b.skyTop, b.skyBottom);
    this.scene.fog = new THREE.Fog(b.fog, 30, 80);
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.set(b.soil);
    this.hemi.intensity = b.ambient;
    this.sun.color.set(b.sun);
    this.sun.intensity = b.sunIntensity;

    // The island: playable cells, walls, and a rim of one cell around them.
    const W = grid.w + 2;
    const H = grid.h + 2;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= grid.w || y >= grid.h ? -1 : y * grid.w + x);
    const solid = (x: number, y: number) => {
      const c = at(x, y);
      return c >= 0 && grid.floor[c] !== VOID;
    };
    const rim = (x: number, y: number) => {
      if (solid(x, y)) return false;
      if (at(x, y) >= 0 && level.map[y]?.[x] === ',') return false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (solid(x + dx, y + dy)) return true;
      return false;
    };
    const tiles: [THREE.BufferGeometry[], THREE.BufferGeometry[]] = [[], []];
    const soil: THREE.BufferGeometry[] = [];
    const rock: THREE.BufferGeometry[] = [];
    const island: [number, number, number][] = [];
    for (let y = -1; y < H - 1; y++)
      for (let x = -1; x < W - 1; x++) {
        const c = at(x, y);
        const isSolid = solid(x, y);
        if (!isSolid && !rim(x, y)) continue;
        // A rim cell sits at the height of its lowest solid neighbour.
        let z = isSolid ? grid.floor[c] : 99;
        if (!isSolid) for (let d = 0; d < 4; d++) if (solid(x + DX[d], y + DY[d])) z = Math.min(z, grid.floor[at(x + DX[d], y + DY[d])]);
        if (z === 99) z = 0;
        island.push([x, y, z]);
        const wx = x - (grid.w - 1) / 2;
        const wz = y - (grid.h - 1) / 2;
        const top = z * LEVEL_H;
        tiles[(x + y) & 1].push(tileGeometry.clone().translate(wx, top - 0.15, wz));
        const colH = top + 0.5;
        if (colH > 0.01) soil.push(new THREE.BoxGeometry(1, colH, 1).translate(wx, top - 0.3 - colH / 2 + 0.02, wz));
      }
    // The rock under the island: deeper toward the middle, like a floating chunk of land.
    const key = (x: number, y: number) => `${x},${y}`;
    const inIsland = new Set(island.map(([x, y]) => key(x, y)));
    for (const [x, y] of island) {
      let edge = 0;
      for (let r = 1; r < 6; r++) {
        let ok = true;
        for (let d = 0; d < 4; d++) if (!inIsland.has(key(x + DX[d] * r, y + DY[d] * r))) ok = false;
        if (!ok) break;
        edge = r;
      }
      const depth = 0.7 + edge * 0.75 + R.next() * 0.5;
      const wx = x - (grid.w - 1) / 2;
      const wz = y - (grid.h - 1) / 2;
      rock.push(new THREE.BoxGeometry(0.96 - edge * 0.02, depth, 0.96 - edge * 0.02).translate(wx, -0.8 - depth / 2, wz));
      soil.push(new THREE.BoxGeometry(1, 0.5, 1).translate(wx, -0.55, wz));
    }
    const add = (geos: THREE.BufferGeometry[], m: THREE.Material, cast = false) => {
      if (!geos.length) return;
      const merged = new THREE.Mesh(mergeGeometries(geos), m);
      merged.receiveShadow = true;
      merged.castShadow = cast;
      this.world.add(merged);
      for (const g of geos) g.dispose();
    };
    add(tiles[0], mat(b.ground, { rough: 0.95 }));
    add(tiles[1], mat(b.ground2, { rough: 0.95 }));
    add(soil, mat(b.soil, { rough: 1 }), true);
    add(rock, mat(b.rock, { rough: 1, flat: true }), true);

    // Walls, goals, decor.
    for (let c = 0; c < grid.w * grid.h; c++) {
      if (grid.wall[c]) {
        const w = wallModel(b, c);
        this.pos(c, grid.floor[c], w.position);
        this.world.add(w);
      }
      if (grid.goal[c]) {
        const { group, glow } = goalModel(b);
        this.pos(c, grid.floor[c], group.position);
        this.world.add(group);
        this.goals.push({ cell: c, glow });
      }
    }
    for (const [x, y, z] of island) {
      if (solid(x, y) || R.next() > 0.45) continue;
      const d = decorModel(R.pick(b.decor), b, R.next);
      d.position.set(x - (grid.w - 1) / 2 + (R.next() - 0.5) * 0.3, z * LEVEL_H, y - (grid.h - 1) / 2 + (R.next() - 0.5) * 0.3);
      this.world.add(d);
    }
    // Clouds drifting around and below.
    this.clouds = [];
    for (let k = 0; k < 7; k++) {
      const cl = new THREE.Group();
      const puff = new THREE.IcosahedronGeometry(1, 1);
      for (let p = 0; p < 4; p++) {
        const m = new THREE.Mesh(puff, mat(0xffffff, { rough: 1, emissive: 0xffffff, emissiveIntensity: 0.35 }));
        m.position.set(p * 1.1 - 1.6, (p % 2) * 0.4, R.next() * 0.6);
        m.scale.setScalar(0.5 + R.next() * 0.4);
        cl.add(m);
      }
      const a = (k / 7) * Math.PI * 2 + R.next();
      const dist = Math.max(grid.w, grid.h) * 0.8 + 4 + R.next() * 6;
      cl.position.set(Math.cos(a) * dist, -5 - R.next() * 6, Math.sin(a) * dist);
      cl.userData.speed = 0.15 + R.next() * 0.2;
      this.world.add(cl);
      this.clouds.push(cl);
    }

    // Crates.
    for (let k = 0; k < grid.crates.length; k++) {
      const c = crateModel(b);
      this.scene.add(c.group);
      this.crates.push({ ...c, tween: null, lost: false });
    }
    // Framing: the playable box.
    let maxZ = 0;
    for (let c = 0; c < grid.w * grid.h; c++) if (grid.floor[c] !== VOID) maxZ = Math.max(maxZ, grid.floor[c]);
    this.center.set(0, (maxZ * LEVEL_H) / 2, 0);
    this.radius = Math.hypot(grid.w, grid.h) / 2 + 0.6;
    this.halfSpan = Math.max(grid.w, grid.h) / 2 + 1;
    // Shadows cover the island.
    const sc = this.sun.shadow.camera;
    const r = this.radius + 3;
    sc.left = -r;
    sc.right = r;
    sc.top = r;
    sc.bottom = -r;
    sc.near = 1;
    sc.far = 60;
    sc.updateProjectionMatrix();
    this.sun.position.set(-8, 16, 10);
    this.sun.target.position.set(0, 0, 0);
    this.show(state, null);
    this.shownYaw = this.yaw;
  }

  /**
   * Shows a state. With the previous state, the change is animated (a move, an undo);
   * without, it snaps (a restart, a new level).
   */
  show(s: GameState, prev: GameState | null) {
    if (!this.grid) return;
    const animate = prev !== null && !this.reducedMotion;
    this.t0 = this.now;
    const falls = s.events & (EVENT.fall | EVENT.lost);
    this.dur = animate && prev && falls && s.moves > prev.moves ? FALL_T : MOVE_T;
    s.crates.forEach((c, k) => {
      const view = this.crates[k];
      const to = c.cell < 0 ? null : this.pos(c.cell, c.z).add(new THREE.Vector3(0, CRATE / 2, 0));
      const was = prev?.crates[k];
      if (!to) {
        // Fell off the island: slide one cell out, then drop out of sight.
        if (animate && was && was.cell >= 0 && !view.lost) {
          const from = this.pos(was.cell, was.z).add(new THREE.Vector3(0, CRATE / 2, 0));
          const dir = s.facing;
          const out = from.clone().add(new THREE.Vector3(DX[dir], 0, DY[dir]));
          out.y -= 6;
          view.tween = { from, to: out, drop: true };
          this.dur = 0.5;
        } else {
          view.group.visible = false;
          view.tween = null;
        }
        view.lost = true;
        return;
      }
      view.lost = false;
      view.group.visible = true;
      if (animate && was && was.cell >= 0 && (was.cell !== c.cell || was.z !== c.z)) {
        const from = this.pos(was.cell, was.z).add(new THREE.Vector3(0, CRATE / 2, 0));
        view.tween = { from, to, drop: c.z < was.z };
      } else {
        view.tween = null;
        view.group.position.copy(to);
      }
    });
    const pTo = this.pos(s.cell, s.z);
    if (animate && prev && prev.cell !== s.cell) {
      this.playerTween = { from: this.pos(prev.cell, prev.z), to: pTo, drop: false };
      this.hop = s.z > prev.z ? 0.45 : s.z < prev.z ? 0.25 : 0.08;
    } else {
      this.playerTween = null;
      this.player.group.position.copy(pTo);
    }
    this.facingFrom = this.shownFacing();
    // The model looks along +z (down); a quarter turn per direction.
    this.facing = (6 - s.facing) % 4;
    if (!animate) this.facingFrom = this.facing;
    this.pushing = (s.events & EVENT.push) !== 0 && prev !== null && s.moves > prev.moves;
    // Feedback.
    if (animate && prev && s.moves > prev.moves) {
      if (s.events & EVENT.push) this.burst(pTo.clone().add(new THREE.Vector3(DX[s.facing] * 0.5, 0.05, DY[s.facing] * 0.5)), this.biome.soil, 4, 0.8);
      if (s.events & EVENT.goalOn) {
        const k = s.pushed;
        const c = s.crates[k];
        if (c && c.cell >= 0) this.burst(this.pos(c.cell, c.z).add(new THREE.Vector3(0, 0.3, 0)), this.biome.goal, 14, 2.2);
      }
    }
    if (s.solved && (!prev || !prev.solved) && prev) this.wonAt = this.now;
    if (!s.solved) this.wonAt = -1;
    this.state = s;
  }

  /** Finishes the running animation at once (a new move arrived). */
  finish() {
    this.t0 = -1e9;
  }

  get animating() {
    return this.now - this.t0 < this.dur;
  }

  private shownFacing() {
    return this.player.group.rotation.y / (Math.PI / 2);
  }

  /** Behind the title screen the camera orbits slowly; in play it settles on a quarter turn. */
  set idle(on: boolean) {
    this.orbiting = on;
    if (!on) this.yaw = Math.round(this.yaw);
  }

  /** Turns the camera a quarter turn (dir ±1). */
  rotate(dir: number) {
    this.yaw += dir;
  }

  /**
   * The grid direction that a screen direction (0 up, 1 right, 2 down, 3 left) means from
   * the current camera: "up" walks away from the camera.
   */
  screenDir(screen: number) {
    const k = ((Math.round(this.yaw) % 4) + 4) % 4;
    return (screen - k + 4) % 4;
  }

  private burst(at: THREE.Vector3, color: number, n: number, speed: number) {
    if (this.reducedMotion) return;
    const geo = new THREE.TetrahedronGeometry(0.06, 0);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(geo, mat(color, { emissive: color, emissiveIntensity: 0.4 }));
      m.position.copy(at);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * speed * (0.3 + Math.random()), speed * (0.6 + Math.random()), Math.sin(a) * speed * (0.3 + Math.random()));
      this.scene.add(m);
      this.particles.push({ m, v, life: 0, max: 0.5 + Math.random() * 0.4, spin: Math.random() * 10 });
    }
  }

  /** Confetti over the island when it's solved. */
  celebrate() {
    if (!this.grid) return;
    const colors = [0xffd447, 0xff6f91, 0x5fe3ff, 0x8fd16a, 0xb983ff];
    for (let k = 0; k < 5; k++) this.burst(new THREE.Vector3((Math.random() - 0.5) * this.grid.w * 0.6, 1.5, (Math.random() - 0.5) * this.grid.h * 0.6), colors[k], 12, 3);
  }

  /** Advances the animations to `time` (seconds) and draws. */
  draw(time: number) {
    const dt = Math.min(0.05, Math.max(0, time - this.now));
    this.now = time;
    const t = Math.min(1, (time - this.t0) / this.dur);
    const ease = 1 - (1 - t) * (1 - t);
    for (const c of this.crates) {
      if (!c.tween) continue;
      const { from, to, drop } = c.tween;
      if (drop) {
        // Slide over the edge in the first part, then fall (accelerating).
        const slide = Math.min(1, t / 0.45);
        const fall = Math.max(0, (t - 0.45) / 0.55);
        c.group.position.set(from.x + (to.x - from.x) * slide, from.y + (to.y - from.y) * fall * fall, from.z + (to.z - from.z) * slide);
      } else c.group.position.lerpVectors(from, to, ease);
      if (t >= 1) {
        c.group.position.copy(to);
        c.tween = null;
        if (c.lost) c.group.visible = false;
      }
    }
    // The player: a hop along the move, turning toward it.
    const p = this.player;
    if (this.playerTween) {
      const { from, to } = this.playerTween;
      p.group.position.lerpVectors(from, to, ease);
      const climbing = to.y !== from.y;
      p.group.position.y = (climbing ? from.y + (to.y - from.y) * Math.min(1, t * 1.6) : from.y) + Math.sin(Math.PI * t) * this.hop;
      if (t >= 1) {
        p.group.position.copy(to);
        this.playerTween = null;
      }
    }
    let df = this.facing - this.facingFrom;
    df = ((((df + 2) % 4) + 4) % 4) - 2;
    p.group.rotation.y = (this.facingFrom + df * Math.min(1, t * 1.8)) * (Math.PI / 2);
    // Lean into a push; a little bob while idle; a happy spin once solved.
    p.body.rotation.x = this.pushing && t < 1 ? 0.25 * Math.sin(Math.PI * t) : 0;
    p.body.position.y = Math.max(0, Math.sin(time * 3) * 0.015);
    if (this.wonAt >= 0) {
      const w = time - this.wonAt;
      if (w < 1.2) {
        p.body.position.y = Math.abs(Math.sin(w * Math.PI * 2.5)) * 0.35 * (1 - w / 1.2);
        p.body.rotation.y = w < 0.8 ? (w / 0.8) * Math.PI * 2 : 0;
      } else p.body.rotation.y = 0;
    } else p.body.rotation.y = 0;
    // Goals pulse until covered; crates on goals glow.
    if (this.state && this.grid) {
      const onGoal = new Set<number>();
      this.state.crates.forEach((c, k) => {
        if (c.cell >= 0 && this.grid!.goal[c.cell] && this.grid!.floor[c.cell] === c.z && !this.crates[k].tween) onGoal.add(k);
      });
      const covered = new Set(this.state.crates.filter((c, k) => onGoal.has(k) && c).map((c) => c.cell));
      for (const g of this.goals) g.glow.emissiveIntensity = covered.has(g.cell) ? 1.4 : 0.45 + 0.35 * Math.sin(time * 3);
      this.crates.forEach((c, k) => {
        const on = onGoal.has(k);
        c.panels.emissive.set(on ? this.biome.goal : 0x000000);
        c.panels.emissiveIntensity = on ? 0.35 : 0;
      });
    }
    // Particles.
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const q = this.particles[k];
      q.life += dt;
      q.v.y -= 6 * dt;
      q.m.position.addScaledVector(q.v, dt);
      q.m.rotation.x += q.spin * dt;
      q.m.scale.setScalar(Math.max(0.01, 1 - q.life / q.max));
      if (q.life >= q.max) {
        this.scene.remove(q.m);
        this.particles.splice(k, 1);
      }
    }
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > 30) c.position.x = -30;
    }
    this.placeCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private placeCamera(dt: number) {
    if (this.orbiting) this.yaw += dt * 0.04;
    this.shownYaw += (this.yaw - this.shownYaw) * Math.min(1, dt * (this.orbiting ? 2 : 6));
    const a = this.shownYaw * (Math.PI / 2);
    const pitch = 1.08;
    // Far enough that the island fits both ways: its depth up and down, its width across.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    const dist = Math.max((this.radius / tan) * 0.92, (this.halfSpan / (tan * this.camera.aspect)) * 1.04) + 1;
    this.camera.position.set(this.center.x + Math.sin(a) * Math.cos(pitch) * dist, this.center.y + Math.sin(pitch) * dist, this.center.z + Math.cos(a) * Math.cos(pitch) * dist);
    // On tall screens, aim a little toward the camera: the island rises above the touch controls.
    const lift = this.camera.aspect < 1 ? 0.9 : 0;
    this.camera.lookAt(this.center.x + Math.sin(a) * lift, this.center.y - 0.3, this.center.z + Math.cos(a) * lift);
  }
}

/** A vertical gradient for the sky (drawn behind everything). */
function skyTexture(top: number, bottom: number) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  g.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
