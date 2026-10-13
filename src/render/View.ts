import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { LevelDef } from '../levels/types';
import { DX, DY, TILE, VOID, type Grid } from '../sim/grid';
import { EVENT, type GameState } from '../sim/Sim';
import { rng } from '../sim/rng';
import { biomeOf, type Biome } from '../world/biomes';
import { Atmosphere } from './atmosphere';
import { Particles } from './particles';
import { Post, type Quality } from './post';
import { clock, iceShader, lavaShader } from './shaders';
import { bake, plain, roughen, spikeGeometry } from './shapes';
import { skyTexture } from './sky';
import { CRATE_COLORS, Mechanics, dressCrate, symbolMesh, tileColor } from './mechanics';
import { PlanetShape } from './planet';
import { CRATE, crateModel, decorModel, disposeTree, goalModel, mat, playerModel, tileGeometry, wallModel } from './models';

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
  /** On a planet: the orientation it starts from (it turns with the ground it rolls over). */
  q?: THREE.Quaternion;
}

const Y = new THREE.Vector3(0, 1, 0);
const qYaw = (a: number, out = new THREE.Quaternion()) => out.setFromAxisAngle(Y, a);

const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);

/**
 * Draws a level and the game state; never changes the state. A move is shown as a short
 * tween from the previous state to the new one, which the simulation never waits for.
 */
export class View {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  /** Everything of the level (island, crates, pusher, mechanics): it rises, sinks and shakes as one. */
  private root = new THREE.Group();
  private world = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private grid: Grid | null = null;
  private biome: Biome = biomeOf('meadow');
  private center = new THREE.Vector3();
  /** A big island (Grand Islands): on narrow or short screens the camera frames a window around the pusher, unless the overview is on. */
  private big = false;
  get follows() {
    return !!this.planet || (this.big && (this.camera.aspect < 1.3 || innerHeight < 560));
  }
  /** A planet level (cube.ts): its shape, and the camera's frame over it (up out of the planet, forward = screen up). */
  private planet: PlanetShape | null = null;
  private camN = new THREE.Vector3(0, 1, 0);
  private camF = new THREE.Vector3(0, 0, -1);
  /** The pusher's orientation at the start and end of its move (planets). */
  private pqFrom = new THREE.Quaternion();
  private pqTo = new THREE.Quaternion();
  overview = false;
  /** Raises the picture by this fraction of the screen's height (a sheet covers the bottom: the Planets list). */
  raise = 0;
  private raised = 0;
  /** The point the camera aims at, eased toward the island's middle or the pusher. */
  private aim = new THREE.Vector3();
  private aimSpan = { radius: 5, half: 5 };
  private radius = 5;
  /** Half the island's longest side, rim included (what must fit across a narrow screen). */
  private halfSpan = 5;
  private crates: { group: THREE.Group; panels: THREE.MeshStandardMaterial; tween: Tween | null; lost: boolean }[] = [];
  /** Goals: the pulsing groove, and the light column (faded out while covered). */
  private goals: { cell: number; glow: THREE.MeshStandardMaterial; column: THREE.MeshBasicMaterial; beam: THREE.Object3D; shown: number }[] = [];
  private mech: Mechanics | null = null;
  /** Each crate's tween is a pop (scale down and up) instead of a slide: it teleported. */
  private pops = new Set<number>();
  private player = playerModel();
  private playerTween: Tween | null = null;
  private hop = 0.1;
  private facing = 0;
  private facingFrom = 0;
  private pushing = false;
  private pulling = false;
  private t0 = 0;
  private dur = MOVE_T;
  private now = 0;
  private fx = new Particles(this.root);
  /** The level's entrance (fly-in, island rising): progress 0..1, or -1; and how fast it runs. */
  private introE = -1;
  private introRate = 1 / 1.1;
  /** The exit (sinking): start time, or -1. */
  private outroAt = -1;
  private outroDone: (() => void) | null = null;
  /** Screen shake: strength, fading out. */
  private shakeAmp = 0;
  /** Shake on falls and lava (a setting). */
  shake = true;
  /** When the pusher last landed, and each crate's last stop (for squash). */
  private landAt = -1;
  private crateStop: number[] = [];
  private air: Atmosphere | null = null;
  /** Decor parts that turn (gears). */
  private spinners: THREE.Object3D[] = [];
  private state: GameState | null = null;
  private wonAt = -1;
  /** Camera yaw in quarter turns (0: looking north), and the shown, eased yaw. */
  private yaw = 0;
  private shownYaw = 0;
  /** Behind the title screen: the camera orbits slowly. */
  private orbiting = false;
  reducedMotion = false;
  private post: Post;
  private skyCanvas = document.createElement('canvas');
  private sky: THREE.CanvasTexture | null = null;
  private fog = new THREE.Fog(0xffffff, 30, 80);
  /** The arms' reach (0 at rest, 1 reaching forward) and which leg leads the next hop. */
  private reach = 0;
  private stride = 1;
  /** Scratch space for the frame loop (nothing is allocated per frame). */
  private tmp = new THREE.Vector3();
  private target = new THREE.Vector3();
  private tq = new THREE.Quaternion();
  private onGoal: boolean[] = [];
  private covered = new Set<number>();

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
    this.root.add(this.world, this.player.group);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.root);
    this.addXray();
    this.post = new Post(renderer, this.scene, this.camera);
    this.post.onTier = (t) => {
      // Lower tiers draw fewer pixels and smaller shadows.
      renderer.setPixelRatio(Math.min(devicePixelRatio, t === 'high' ? 2 : t === 'medium' ? 1.5 : 1));
      const size = t === 'high' ? 2048 : 1024;
      if (this.sun.shadow.mapSize.x !== size) {
        this.sun.shadow.mapSize.set(size, size);
        this.sun.shadow.map?.dispose();
        this.sun.shadow.map = null;
      }
      this.resize();
    };
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.post?.resize();
  }

  /** The render quality (see post.ts); touch screens start lower on auto. */
  setQuality(q: Quality, touch: boolean) {
    this.post.setQuality(q, touch);
  }

  get qualityTier() {
    return this.post.current;
  }

  /**
   * The pusher seen through walls: a slightly bigger shell drawn only where something is in
   * front of it (depth test reversed), so it's never lost behind a wall after a turn.
   */
  private addXray() {
    // Drawn in the opaque pass after the world (render order 0) and before the pusher itself
    // (1), so only walls and crates in front reveal it, never the pusher's own arms or brim.
    const m = new THREE.MeshBasicMaterial({ color: 0x8fd0ff, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth });
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.SrcAlphaFactor;
    m.blendDst = THREE.OneMinusSrcAlphaFactor;
    this.player.group.traverse((o) => (o.renderOrder = 1));
    const shell = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.42, 4, 12), m);
    shell.position.y = 0.475;
    shell.renderOrder = 0.5;
    shell.userData.noAO = true;
    this.player.group.add(shell);
  }

  /** World position of a cell's floor (or of a crate/player standing at level z). */
  private pos(cell: number, z: number, out = new THREE.Vector3()) {
    if (this.planet) return this.planet.point(cell, z, LEVEL_H, 0, out);
    const g = this.grid!;
    const x = cell % g.w;
    const y = Math.floor(cell / g.w);
    return out.set(x - (g.w - 1) / 2, z * LEVEL_H, y - (g.h - 1) / 2);
  }

  /** A cell's up (+y on islands, out of the ground on planets). */
  private upAt(cell: number) {
    return this.planet && cell >= 0 ? this.planet.up(cell) : Y;
  }

  /** `pos` raised by h along the cell's up. */
  private lift(cell: number, z: number, h: number, out = new THREE.Vector3()) {
    return this.pos(cell, z, out).addScaledVector(this.upAt(cell), h);
  }

  /** Stands an object on a cell: at its floor, turned to its frame (and by yaw about its up). */
  private stand(o: THREE.Object3D, cell: number, z: number, yaw = 0) {
    this.pos(cell, z, o.position);
    if (this.planet) o.quaternion.copy(this.planet.frame(cell)).multiply(qYaw(yaw));
    else o.rotation.y = yaw;
    return o;
  }

  /** Builds the island for a level: tiles, columns, walls, goals, decor, the rock below. */
  setLevel(level: LevelDef, grid: Grid, state: GameState) {
    this.grid = grid;
    const b = (this.biome = biomeOf(level.biome ?? level.world));
    // Free the previous level's meshes (geometries and the materials they own).
    disposeTree(this.world);
    this.world.clear();
    for (const c of this.crates) {
      this.root.remove(c.group);
      disposeTree(c.group);
    }
    this.crates = [];
    this.goals = [];
    this.wonAt = -1;
    this.setGhost(null);
    this.root.position.set(0, 0, 0);
    this.fx.clear();
    this.crateStop = [];
    this.shakeAmp = 0;
    const R = rng(hash(level.id));
    // Sky, fog and light.
    this.sky = skyTexture(b.skyTop, b.skyBottom, this.skyCanvas, this.sky ?? undefined);
    this.scene.background = this.sky;
    this.fog.color.set(b.fog);
    this.scene.fog = this.fog;
    this.hemi.color.set(0xffffff);
    this.hemi.groundColor.set(b.soil);
    this.hemi.intensity = b.ambient;
    this.sun.color.set(b.sun);
    this.sun.intensity = b.sunIntensity;

    this.planet = grid.planet ? new PlanetShape(grid.planet) : null;
    // The island: playable cells, walls, and a rim of one cell around them (planets: the ball).
    const W = this.planet ? 0 : grid.w + 2;
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
    const special = new Map<string, { geos: THREE.BufferGeometry[]; m: THREE.Material }>();
    /** Plain ground (checker, rim, higher and lower ground): one vertex-colored mesh. */
    const ground: THREE.BufferGeometry[] = [];
    const soil: THREE.BufferGeometry[] = [];
    const rock: THREE.BufferGeometry[] = [];
    const lip: THREE.BufferGeometry[] = [];
    const island: [number, number, number][] = [];
    const tops = new Map<string, number>();
    const key = (x: number, y: number) => `${x},${y}`;
    if (this.planet) this.buildPlanet(grid, b, R);
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
        tops.set(key(x, y), z);
      }
    const inIsland = (x: number, y: number) => tops.has(key(x, y));
    // What shades a corner of a floor tile: a wall, or ground higher than the tile.
    const blocks = (x: number, y: number, z: number) => {
      const c = at(x, y);
      if (c >= 0 && grid.wall[c]) return 1;
      const t = tops.get(key(x, y));
      return t !== undefined && t > z ? 1 : 0;
    };
    const AO = [1, 0.78, 0.65, 0.56];
    const rimTint = new THREE.Color(b.soil);
    const col = new THREE.Color();
    for (const [x, y, z] of island) {
      const c = at(x, y);
      const isSolid = solid(x, y);
      const wx = x - (grid.w - 1) / 2;
      const wz = y - (grid.h - 1) / 2;
      const top = z * LEVEL_H;
      const look = isSolid ? tileColor(grid, c) : null;
      if (look) {
        const tile = tileGeometry.clone().translate(wx, top - 0.15, wz);
        const k = `${look.color}`;
        if (!special.has(k)) {
          const m = mat(look.color, look.opts);
          if (grid.tile[c] === TILE.lava) lavaShader(m);
          if (grid.tile[c] === TILE.ice) iceShader(m);
          special.set(k, { geos: [], m });
        }
        special.get(k)!.geos.push(tile);
      } else {
        // Higher ground is lighter, dips darker, so the levels read at a glance; the rim is a
        // little darker than the playable floor; each tile varies a touch in tone and height.
        col.set((x + y) & 1 ? b.ground2 : b.ground);
        if (z !== 0) col.lerp(new THREE.Color(z > 0 ? 0xffffff : 0x000000), Math.min(0.5, Math.abs(z) * 0.16));
        if (!isSolid) col.lerp(rimTint, 0.16).multiplyScalar(0.94);
        col.multiplyScalar(0.97 + R.next() * 0.06);
        const tile = plain(tileGeometry.clone()).translate(0, (R.next() - 0.5) * 0.014, 0);
        const p = tile.attributes.position;
        const colors = new Float32Array(p.count * 3);
        for (let v = 0; v < p.count; v++) {
          const sx = p.getX(v) > 0 ? 1 : -1;
          const sz = p.getZ(v) > 0 ? 1 : -1;
          let shade = 0.72;
          if (p.getY(v) > 0.1) {
            const s1 = blocks(x + sx, y, z);
            const s2 = blocks(x, y + sz, z);
            shade = AO[s1 && s2 ? 3 : s1 + s2 + blocks(x + sx, y + sz, z)];
          } else if (p.getY(v) > -0.1) shade = 0.86;
          colors.set([col.r * shade, col.g * shade, col.b * shade], v * 3);
        }
        tile.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        ground.push(tile.translate(wx, top - 0.15, wz));
      }
      const colH = top + 0.5;
      if (colH > 0.01) soil.push(new THREE.BoxGeometry(1, colH, 1).translate(wx, top - 0.3 - colH / 2 + 0.02, wz));
      // A lip of grass (sand, snow) over the island's outer edge, with a few drips.
      if (b.lip !== undefined) {
        const out = [0, 1, 2, 3].map((d) => !inIsland(x + DX[d], y + DY[d]));
        for (let d = 0; d < 4; d++) {
          if (!out[d]) continue;
          const along = DX[d] === 0;
          const slab = roughen(new THREE.BoxGeometry(along ? 1.03 : 0.15, 0.13, along ? 0.15 : 1.03, along ? 4 : 1, 1, along ? 1 : 4), 0.04, R.next);
          lip.push(slab.translate(wx + DX[d] * 0.5, top - 0.07, wz + DY[d] * 0.5));
          // Outer corners get a corner piece.
          const e = (d + 1) % 4;
          if (out[e]) lip.push(roughen(new THREE.BoxGeometry(0.15, 0.12, 0.15), 0.02, R.next).translate(wx + (DX[d] + DX[e]) * 0.5, top - 0.065, wz + (DY[d] + DY[e]) * 0.5));
          const drips = Math.floor(R.next() * 2.6);
          for (let k = 0; k < drips; k++) {
            const len = 0.07 + R.next() * 0.16;
            const t = (R.next() - 0.5) * 0.8;
            const drip = new THREE.ConeGeometry(0.03 + R.next() * 0.03, len, 5).rotateX(Math.PI);
            lip.push(plain(drip).translate(wx + DX[d] * 0.52 + (along ? t : 0), top - 0.12 - len / 2 + 0.01, wz + DY[d] * 0.52 + (along ? 0 : t)));
          }
        }
      }
    }
    // The rock under the island: deeper toward the middle, like a floating chunk of land.
    // Spikes are jittered in size and place (and some cells get two) so no grid shows.
    for (const [x, y, z] of island) {
      let edge = 0;
      for (let r = 1; r < 6; r++) {
        let ok = true;
        for (let d = 0; d < 4; d++) if (!inIsland(x + DX[d] * r, y + DY[d] * r)) ok = false;
        if (!ok) break;
        edge = r;
      }
      const depth = 0.7 + edge * 0.9 + R.next() * 0.8;
      const wx = x - (grid.w - 1) / 2;
      const wz = y - (grid.h - 1) / 2;
      // Below the cell's own floor (pits and lava sit lower than the ground around them).
      const base = Math.min(0, z) * LEVEL_H - 0.3;
      soil.push(new THREE.BoxGeometry(1, 0.5, 1).translate(wx, base - 0.25, wz));
      // A band of rock, then craggy spikes: together they hang like a chunk of land.
      rock.push(roughen(new THREE.BoxGeometry(1.02, 0.3, 1.02, 2, 1, 2), edge ? 0.02 : 0.09, R.next).translate(wx, base - 0.65, wz));
      const j = edge ? 0.3 : 0.12;
      rock.push(spikeGeometry(R.next, 0.5 + R.next() * 0.3, depth * (0.95 + R.next() * 0.5)).translate(wx + (R.next() - 0.5) * j, base - 0.76, wz + (R.next() - 0.5) * j));
      if (R.next() < 0.4) rock.push(spikeGeometry(R.next, 0.25 + R.next() * 0.2, depth * (0.4 + R.next() * 0.4)).translate(wx + (R.next() - 0.5) * 0.7, base - 0.72, wz + (R.next() - 0.5) * 0.7));
    }
    const add = (geos: THREE.BufferGeometry[], m: THREE.Material, cast = false) => {
      if (!geos.length) return;
      const merged = new THREE.Mesh(mergeGeometries(geos), m);
      merged.receiveShadow = true;
      merged.castShadow = cast;
      this.world.add(merged);
      for (const g of geos) g.dispose();
    };
    add(ground, mat(0xffffff, { rough: 0.95, vertexColors: true }));
    for (const { geos, m } of special.values()) add(geos, m);
    add(soil, mat(b.soil, { rough: 1 }), true);
    add(rock, mat(b.rock, { rough: 1, flat: true }), true);
    if (b.lip !== undefined) add(lip, mat(b.lip, { rough: 0.95, flat: true }), true);

    // Walls, goals, decor. Walls and decor are merged into a few meshes.
    const statics = new THREE.Group();
    for (let c = 0; c < grid.w * grid.h; c++) {
      if (grid.wall[c]) statics.add(this.stand(wallModel(b, c), c, grid.floor[c]));
      if (grid.goal[c]) {
        const { group, glow, column } = goalModel(b);
        if (grid.goalColor[c]) {
          const hue = CRATE_COLORS[grid.goalColor[c]];
          glow.color.set(hue);
          glow.emissive.set(hue);
          column.color.set(hue);
          const sym = symbolMesh(grid.goalColor[c] - 1, 0.13, 0xffffff, 0.9);
          if (sym) {
            sym.position.y = 0.03;
            group.add(sym);
          }
        }
        this.stand(group, c, grid.floor[c]);
        this.world.add(group);
        this.goals.push({ cell: c, glow, column, beam: group.getObjectByName('column')!, shown: 1 });
      }
    }
    if (this.mech) {
      this.root.remove(this.mech.group);
      this.mech.dispose();
    }
    const planet = this.planet;
    this.mech = new Mechanics(grid, (c, z, out) => this.pos(c, z, out), LEVEL_H, planet ? (c) => planet.frame(c) : undefined);
    this.root.add(this.mech.group);
    for (const [x, y, z] of island) {
      if (solid(x, y) || R.next() > 0.45) continue;
      const d = decorModel(R.pick(b.decor), b, R.next);
      d.position.set(x - (grid.w - 1) / 2 + (R.next() - 0.5) * 0.3, z * LEVEL_H, y - (grid.h - 1) / 2 + (R.next() - 0.5) * 0.3);
      statics.add(d);
    }
    const baked = bake(statics);
    this.world.add(baked);
    this.spinners = baked.children.filter((o) => o.userData.spin);
    // Clouds, particles and far-off shapes.
    if (this.air) {
      this.scene.remove(this.air.group);
      this.air.dispose();
    }
    // Round a planet the camera looks from every side: no far-off islands (they'd hang overhead).
    const air = this.planet ? { ...b, air: { ...b.air, far: undefined } } : b;
    this.air = new Atmosphere(air, this.planet ? this.planet.radius + 3 : Math.max(grid.w, grid.h) / 2 + 1, hash(level.id));
    this.scene.add(this.air.group);

    // Crates.
    for (let k = 0; k < grid.crates.length; k++) {
      const c = crateModel(b, grid.crateKind[k] === 0 ? this.look : undefined, hash(level.id) + k);
      dressCrate(c.group, c.panels, grid.crateKind[k]);
      c.panels.userData.base = c.panels.color.getHex();
      this.root.add(c.group);
      this.crates.push({ ...c, tween: null, lost: false });
    }
    // Framing: the playable box.
    let maxZ = 0;
    for (let c = 0; c < grid.w * grid.h; c++) if (grid.floor[c] !== VOID) maxZ = Math.max(maxZ, grid.floor[c]);
    this.center.set(0, (maxZ * LEVEL_H) / 2, 0);
    this.radius = Math.hypot(grid.w, grid.h) / 2 + 0.6;
    this.halfSpan = Math.max(grid.w, grid.h) / 2 + 1;
    if (this.planet) {
      this.center.set(0, 0, 0);
      this.radius = this.halfSpan = this.planet.radius + 1.5;
      // The camera starts over the pusher, the net's up pointing up the screen.
      this.camN.copy(this.planet.up(grid.start));
      this.camF.copy(this.planet.tangent(grid.start, 0));
      this.yaw = Math.round(this.yaw / 4) * 4;
    }
    this.big = Math.max(grid.w, grid.h) > 12;
    this.overview = false;
    this.raise = 0;
    this.aim.copy(this.center);
    this.aimSpan = { radius: this.radius, half: this.halfSpan };
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

  /** A planet's ground: curved tiles (checkered by cell, ice and pits in their own looks), and the rock core. */
  private buildPlanet(grid: Grid, b: Biome, R: { next: () => number }) {
    const planet = this.planet!;
    const n = planet.n;
    const col = new THREE.Color();
    const looks = new Map<string, NonNullable<ReturnType<typeof tileColor>>>();
    const parts = planet.ground(
      grid,
      LEVEL_H,
      (c) => {
        const x = c % grid.w;
        const y = Math.floor(c / grid.w);
        col.set((x + y) & 1 ? b.ground2 : b.ground);
        // Walls stand on a darker floor; each tile varies a touch in tone.
        if (grid.wall[c]) col.lerp(new THREE.Color(b.soil), 0.3);
        void n;
        return col.clone().multiplyScalar(0.97 + R.next() * 0.06);
      },
      (c) => {
        const look = tileColor(grid, c);
        if (!look) return null;
        looks.set(`${look.color}`, look);
        return `${look.color}`;
      },
    );
    for (const [key, geo] of parts) {
      const look = looks.get(key);
      let m: THREE.Material;
      if (look) {
        const sm = mat(look.color, look.opts);
        if (grid.tile.some((t, c) => t === TILE.ice && `${tileColor(grid, c)?.color}` === key)) iceShader(sm);
        m = sm;
      } else m = mat(0xffffff, { rough: 0.95, vertexColors: true });
      const mesh = new THREE.Mesh(geo, m);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.world.add(mesh);
    }
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(planet.radius - LEVEL_H - 0.1, 4), mat(b.soil, { rough: 1 }));
    core.receiveShadow = true;
    this.world.add(core);
  }

  /** Moves a point between two others, along the planet's curve on planets (a straight line on islands). */
  private glide(from: THREE.Vector3, to: THREE.Vector3, e: number, out: THREE.Vector3) {
    if (!this.planet) return out.lerpVectors(from, to, e);
    const r = from.length() + (to.length() - from.length()) * e;
    return out.copy(from).normalize().lerp(this.tmp.copy(to).normalize(), e).normalize().multiplyScalar(r);
  }

  /**
   * Shows a state. With the previous state, the change is animated (a move, an undo);
   * without, it snaps (a restart, a new level).
   */
  show(s: GameState, prev: GameState | null) {
    if (!this.grid) return;
    this.showHint(null);
    const animate = prev !== null && !this.reducedMotion;
    this.t0 = this.now;
    const falls = s.events & (EVENT.fall | EVENT.lost);
    this.dur = animate && prev && falls && s.moves > prev.moves ? FALL_T : MOVE_T;
    // Slides and conveyor rides cover more ground: a little longer per extra cell.
    if (animate && prev) {
      const g = this.grid;
      const far = (a: number, b: number) =>
        a < 0 || b < 0 ? 0 : this.planet ? Math.round(this.planet.up(a).angleTo(this.planet.up(b)) / (Math.PI / 2 / this.planet.n)) : Math.abs((a % g.w) - (b % g.w)) + Math.abs(Math.floor(a / g.w) - Math.floor(b / g.w));
      const dist = Math.max(far(prev.cell, s.cell), ...s.crates.map((c, k) => far(prev.crates[k].cell, c.cell)));
      if (dist > 1 && !(s.events & EVENT.teleport)) this.dur = Math.min(0.5, this.dur + (dist - 1) * 0.07);
    }
    const teleported = animate && (s.events & EVENT.teleport) !== 0;
    const onPad = (c: number) => c >= 0 && this.grid!.tile[c] === TILE.teleport;
    this.pops.clear();
    if (teleported) this.dur = 0.3;
    const moved: number[] = [];
    s.crates.forEach((c, k) => {
      const view = this.crates[k];
      const to = c.cell < 0 ? null : this.lift(c.cell, c.z, CRATE / 2);
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
      // A crate sunk in lava has cooled to stone.
      const cooled = this.grid!.tile[c.cell] === TILE.lava && c.z === this.grid!.floor[c.cell];
      view.panels.color.set(cooled ? 0x4a4048 : view.panels.userData.base);
      if (teleported && was && onPad(c.cell) && was.cell !== c.cell) this.pops.add(k);
      if (animate && was && was.cell >= 0 && (was.cell !== c.cell || was.z !== c.z)) {
        const from = this.lift(was.cell, was.z, CRATE / 2);
        view.tween = { from, to, drop: c.z < was.z, q: this.planet ? view.group.quaternion.clone() : undefined };
        moved.push(k);
      } else {
        view.tween = null;
        view.group.position.copy(to);
        if (this.planet) view.group.quaternion.copy(this.planet.frame(c.cell));
      }
    });
    // After the loop: a crate lost over the edge may have made the move longer.
    for (const k of moved) this.crateStop[k] = this.now + this.dur;
    const pTo = this.pos(s.cell, s.z);
    if (teleported && prev && onPad(s.cell) && prev.cell !== s.cell) this.pops.add(-1);
    if (animate && prev && prev.cell !== s.cell) {
      this.playerTween = { from: this.pos(prev.cell, prev.z), to: pTo, drop: false };
      this.landAt = this.now + this.dur;
      this.hop = s.z > prev.z ? 0.45 : s.z < prev.z ? 0.25 : 0.08;
      this.stride = -this.stride;
    } else {
      this.playerTween = null;
      this.player.group.position.copy(pTo);
    }
    this.facingFrom = this.shownFacing();
    // The model looks along +z (down); a quarter turn per direction.
    this.facing = (6 - s.facing) % 4;
    if (!animate) this.facingFrom = this.facing;
    if (this.planet) {
      this.pqFrom.copy(animate ? this.player.group.quaternion : this.planet.frame(s.cell).clone().multiply(qYaw(this.facing * (Math.PI / 2))));
      this.pqTo.copy(this.planet.frame(s.cell)).multiply(qYaw(this.facing * (Math.PI / 2)));
      if (!animate) this.player.group.quaternion.copy(this.pqTo);
    }
    this.pushing = (s.events & EVENT.push) !== 0 && prev !== null && s.moves > prev.moves;
    this.pulling = (s.events & EVENT.pull) !== 0 && prev !== null && s.moves > prev.moves;
    // Feedback.
    if (animate && prev && s.moves > prev.moves) {
      this.skipIntro();
      const g = this.grid;
      const at = (cell: number, z: number, y = 0.05) => this.lift(cell, z, y);
      // A puff where the pusher took off; dust behind anything sliding on ice.
      this.fx.emit(at(prev.cell, prev.z), 0xffffff, 2, 0.5, 'puff', { size: 0.8 });
      if (s.events & EVENT.slide) {
        s.crates.forEach((c, k) => {
          const was = prev.crates[k];
          if (c.cell >= 0 && was.cell >= 0 && c.cell !== was.cell) this.fx.emit(at(was.cell, was.z), 0xeaf6ff, 5, 0.8, 'puff', { size: 1.1 });
        });
        if (s.cell !== prev.cell) this.fx.emit(at(prev.cell, prev.z), 0xeaf6ff, 3, 0.6, 'puff');
      }
      if (s.events & EVENT.fill) {
        // A crate swallowed by lava throws embers and smoke; by a pit, sand.
        s.crates.forEach((c, k) => {
          if (c.cell < 0 || c.cell === prev.crates[k].cell || c.z !== g.floor[c.cell]) return;
          if (g.tile[c.cell] === TILE.lava) {
            this.fx.emit(at(c.cell, c.z, 0.3), 0xff7a20, 16, 2.2, 'spark', { up: 1.4, life: 0.9 });
            this.fx.emit(at(c.cell, c.z, 0.4), 0x5a4a4e, 6, 0.8, 'puff', { size: 1.6, up: 1.5, life: 1.2 });
            this.kick(0.12);
          } else if (g.tile[c.cell] === TILE.pit) this.fx.emit(at(c.cell, c.z, 0.4), this.biome.ground, 10, 1.4, 'shard');
        });
      }
      if (s.events & (EVENT.fall | EVENT.lost)) this.kick(s.events & EVENT.lost ? 0.22 : 0.14);
      if (s.events & EVENT.teleport) {
        this.fx.emit(at(prev.cell, prev.z, 0.4), 0xd2a8ff, 10, 1.2, 'spark', { up: 1.2 });
        this.fx.emit(at(s.cell, s.z, 0.4), 0xd2a8ff, 10, 1.2, 'spark', { up: 1.2 });
      }
      if (s.events & EVENT.push) {
        const ahead = this.planet ? this.lift(s.cell, s.z, 0.05).addScaledVector(this.planet.tangent(s.cell, s.facing), 0.5) : pTo.clone().add(new THREE.Vector3(DX[s.facing] * 0.5, 0.05, DY[s.facing] * 0.5));
        this.burst(ahead, this.biome.soil, 4, 0.8);
      }
      if (s.events & EVENT.goalOn) {
        const k = s.pushed;
        const c = s.crates[k];
        if (c && c.cell >= 0) this.burst(this.lift(c.cell, c.z, 0.3), this.biome.goal, 14, 2.2);
      }
    }
    this.mech?.setState(s);
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

  /** The crate skin (colors, or -1 for the world's own wood). */
  private look = { crate: -1, trim: -1 };

  /** Cosmetics: the crate skin (applied from the next level built) and the pusher's outfit. */
  setLook(skin: { crate: number; trim: number }, outfit: { cap: number; suit: number }) {
    this.look = { crate: skin.crate, trim: skin.trim };
    this.player.cap.color.set(outfit.cap);
    this.player.suit.color.set(outfit.suit);
  }

  /** Behind the title screen the camera orbits slowly; in play it turns back to north-up. */
  set idle(on: boolean) {
    this.orbiting = on;
    // Back to the level's own heading (north up), so the arrows match the map as designed.
    if (!on) this.yaw = Math.round(this.yaw / 4) * 4;
  }

  private ghost: THREE.Group | null = null;
  private ghostTo = new THREE.Vector3();
  private ghostTurn = 0;
  private ghostCell = -1;

  /**
   * The ghost of the best run: a see-through pusher standing where that run was after as
   * many moves as the player has made (null: no ghost). It glides there.
   */
  setGhost(step: { cell: number; z: number; facing: number } | null) {
    if (!step || !this.grid) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (!this.ghost) {
      const g = playerModel().group;
      const glass = new THREE.MeshStandardMaterial({ color: 0x8fcaff, emissive: 0x3f9bff, emissiveIntensity: 0.6, transparent: true, opacity: 0.5, depthWrite: false, roughness: 0.4 });
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = glass;
          o.castShadow = false;
          o.receiveShadow = false;
          o.renderOrder = 2;
        }
      });
      this.ghost = g;
      this.root.add(g);
      this.pos(step.cell, step.z, g.position);
    }
    const wasHidden = !this.ghost.visible;
    this.ghost.visible = true;
    this.pos(step.cell, step.z, this.ghostTo);
    if (wasHidden) this.ghost.position.copy(this.ghostTo);
    this.ghostTurn = ((6 - step.facing) % 4) * (Math.PI / 2);
    this.ghostCell = step.cell;
  }

  private hintArrow: THREE.Group | null = null;
  private hintDir = 0;
  private hintCell = -1;

  /** A bouncing arrow beside the player, pointing the way of the next move (null: none). */
  showHint(dir: number | null) {
    if (!this.hintArrow) {
      const g = new THREE.Group();
      const m = mat(0xffd447, { emissive: 0xffb000, emissiveIntensity: 0.8, rough: 0.3 });
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.3, 12), m);
      head.rotation.x = -Math.PI / 2;
      head.position.z = -0.2;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 8), m);
      shaft.rotation.x = -Math.PI / 2;
      shaft.position.z = 0.05;
      g.add(head, shaft);
      this.hintArrow = g;
      this.root.add(g);
    }
    this.hintArrow.visible = dir !== null;
    if (dir !== null) {
      this.hintDir = dir;
      this.hintCell = this.state?.cell ?? -1;
      // The arrow's tip looks along -z: turn it to the direction.
      this.hintArrow.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
    }
  }

  private ray = new THREE.Raycaster();

  /** The cell under a screen point (a floor tile, a wall top, a crate), or -1. */
  cellAt(clientX: number, clientY: number): number {
    const g = this.grid;
    if (!g) return -1;
    this.ray.setFromCamera(new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1), this.camera);
    const hits = this.ray.intersectObjects([this.world, ...this.crates.map((c) => c.group)], true);
    for (const h of hits) {
      // A point just inside the surface hit, in the level's own space.
      const p = this.root.worldToLocal(h.point.clone().addScaledVector(this.ray.ray.direction, 0.05));
      if (this.planet) return this.planet.nearest(p.normalize());
      const x = Math.round(p.x + (g.w - 1) / 2);
      const y = Math.round(p.z + (g.h - 1) / 2);
      if (x >= 0 && y >= 0 && x < g.w && y < g.h) return y * g.w + x;
    }
    return -1;
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
    if (this.planet && this.state) {
      // On a planet: the net direction at the pusher's cell that best matches the screen's.
      const f = this.tmp.copy(this.camF).applyAxisAngle(this.camN, Math.round(this.yaw) * (Math.PI / 2));
      const want = f.applyAxisAngle(this.camN, -screen * (Math.PI / 2));
      let best = 0;
      let dot = -2;
      for (let d = 0; d < 4; d++) {
        const k = this.planet.tangent(this.state.cell, d).dot(want);
        if (k > dot) {
          dot = k;
          best = d;
        }
      }
      return best;
    }
    const k = ((Math.round(this.yaw) % 4) + 4) % 4;
    return (screen - k + 4) % 4;
  }

  private burst(at: THREE.Vector3, color: number, n: number, speed: number) {
    if (this.reducedMotion) return;
    this.fx.emit(at, color, n, speed, 'shard');
  }

  /** Confetti over the island when it's solved. */
  celebrate() {
    if (!this.grid || this.reducedMotion) return;
    const colors = [0xffd447, 0xff6f91, 0x5fe3ff, 0x8fd16a, 0xb983ff];
    const p = this.player.group.position;
    const up = this.state ? this.upAt(this.state.cell) : Y;
    for (let k = 0; k < 5; k++) {
      const at = this.planet ? p.clone().addScaledVector(up, 1.5).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2)) : new THREE.Vector3((Math.random() - 0.5) * this.grid.w * 0.6, 1.5, (Math.random() - 0.5) * this.grid.h * 0.6);
      this.fx.emit(at, colors[k], 14, 3, 'shard', { size: 1.4 });
    }
  }

  /** The level comes in: the camera flies down while the island rises from the clouds. */
  intro() {
    this.settleOutro();
    if (this.reducedMotion) return;
    this.introE = 0;
    this.introRate = 1 / 1.1;
  }

  /** Hurries the entrance to its end (over a moment, so nothing jumps): the player started moving. */
  skipIntro() {
    if (this.introE >= 0) this.introRate = Math.max(this.introRate, (1 - this.introE) / 0.15);
  }

  /** Resolves a pending exit (a new exit or entrance replaces it). */
  private settleOutro() {
    const done = this.outroDone;
    this.outroDone = null;
    this.outroAt = -1;
    done?.();
  }

  /** The island sinks into the clouds; resolves when it's gone (at once with reduced motion). */
  leave(): Promise<void> {
    this.settleOutro();
    if (this.reducedMotion || !this.grid) return Promise.resolve();
    this.introE = -1;
    this.outroAt = this.now;
    return new Promise((r) => (this.outroDone = r));
  }

  private kick(amount: number) {
    if (this.shake && !this.reducedMotion) this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  /** Advances the animations to `time` (seconds) and draws. */
  draw(time: number) {
    const dt = Math.min(0.05, Math.max(0, time - this.now));
    this.now = time;
    const t = Math.min(1, (time - this.t0) / this.dur);
    const ease = 1 - (1 - t) * (1 - t);
    for (let k = 0; k < this.crates.length; k++) {
      const c = this.crates[k];
      if (!c.tween) continue;
      const { from, to, drop } = c.tween;
      if (drop) {
        // Slide over the edge in the first part, then fall (accelerating).
        const slide = Math.min(1, t / 0.45);
        const fall = Math.max(0, (t - 0.45) / 0.55);
        c.group.position.set(from.x + (to.x - from.x) * slide, from.y + (to.y - from.y) * fall * fall, from.z + (to.z - from.z) * slide);
      } else if (this.pops.has(k)) {
        c.group.position.copy(t < 0.5 ? from : to);
        c.group.scale.setScalar(Math.max(0.05, Math.abs(1 - 2 * t)));
      } else this.glide(from, to, ease, c.group.position);
      // On a planet the crate rolls with the ground: turned as far as its up has turned.
      if (c.tween.q) c.group.quaternion.setFromUnitVectors(this.tmp.copy(from).normalize(), this.target.copy(c.group.position).normalize()).multiply(c.tween.q);
      if (t >= 1) {
        c.group.scale.setScalar(1);
        c.group.position.copy(to);
        c.tween = null;
        if (c.lost) c.group.visible = false;
      }
    }
    // The player: a hop along the move, turning toward it.
    const p = this.player;
    if (this.playerTween) {
      const { from, to } = this.playerTween;
      if (this.pops.has(-1)) {
        p.group.position.copy(t < 0.5 ? from : to);
        p.group.scale.setScalar(Math.max(0.05, Math.abs(1 - 2 * t)));
      } else if (this.planet) {
        this.glide(from, to, ease, p.group.position);
        p.group.position.addScaledVector(this.tmp.copy(p.group.position).normalize(), Math.sin(Math.PI * t) * this.hop);
      } else {
        p.group.position.lerpVectors(from, to, ease);
        const climbing = to.y !== from.y;
        p.group.position.y = (climbing ? from.y + (to.y - from.y) * Math.min(1, t * 1.6) : from.y) + Math.sin(Math.PI * t) * this.hop;
      }
      if (t >= 1) {
        p.group.scale.setScalar(1);
        p.group.position.copy(to);
        this.playerTween = null;
      }
    }
    if (this.planet) {
      // Turn toward the move, then stand up straight on the ground it's over.
      const q = p.group.quaternion.slerpQuaternions(this.pqFrom, this.pqTo, Math.min(1, t * 1.8));
      const up = this.tmp.set(0, 1, 0).applyQuaternion(q);
      q.premultiply(this.tq.setFromUnitVectors(up, this.target.copy(p.group.position).normalize()));
    } else {
      let df = this.facing - this.facingFrom;
      df = ((((df + 2) % 4) + 4) % 4) - 2;
      p.group.rotation.y = (this.facingFrom + df * Math.min(1, t * 1.8)) * (Math.PI / 2);
    }
    // Lean into a push, lean back hauling a pull; a little bob while idle; a happy spin once solved.
    p.body.rotation.x = (this.pushing ? 0.25 : this.pulling ? -0.3 : 0) * (t < 1 ? Math.sin(Math.PI * t) : 0);
    p.body.position.y = this.reducedMotion ? 0 : Math.max(0, Math.sin(time * 3) * 0.015);
    // Arms reach forward while pushing or pulling (and a moment after), swing on a plain hop;
    // the legs stride on a hop.
    const working = (this.pushing || this.pulling) && time - this.t0 < this.dur + 0.35;
    this.reach += ((working ? 1 : 0) - this.reach) * (this.reducedMotion ? 1 : Math.min(1, dt * 16));
    const hopping = this.playerTween !== null && !this.pops.has(-1);
    const swing = hopping ? Math.sin(Math.PI * t) * this.stride : 0;
    p.arms.forEach((a, k) => {
      const side = k ? 1 : -1;
      a.rotation.x = -this.reach * (this.pulling ? 1.25 : 1.4) + swing * side * 0.6 * (1 - this.reach);
      a.rotation.z = side * (0.18 - this.reach * 0.1);
    });
    p.legs.forEach((l, k) => (l.rotation.x = swing * (k ? 0.7 : -0.7)));
    if (this.wonAt >= 0 && !this.reducedMotion) {
      const w = time - this.wonAt;
      if (w < 1.2) {
        p.body.position.y = Math.abs(Math.sin(w * Math.PI * 2.5)) * 0.35 * (1 - w / 1.2);
        p.body.rotation.y = w < 0.8 ? (w / 0.8) * Math.PI * 2 : 0;
      } else p.body.rotation.y = 0;
    } else p.body.rotation.y = 0;
    // Squash and stretch: long in the air, flat for a moment on landing.
    let sy = 1;
    if (this.playerTween && !this.pops.has(-1)) sy = 1 + 0.12 * Math.sin(Math.PI * t);
    const land = time - this.landAt;
    if (!this.playerTween && land >= 0 && land < 0.16) sy = 1 - 0.14 * Math.sin((land / 0.16) * Math.PI);
    if (this.reducedMotion) sy = 1;
    p.body.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    // Crates squat a little when they stop.
    this.crates.forEach((c, k) => {
      if (c.tween || this.reducedMotion) return;
      const u = time - (this.crateStop[k] ?? -9);
      const w = u >= 0 && u < 0.18 ? Math.sin((u / 0.18) * Math.PI) : 0;
      c.group.scale.set(1 + 0.07 * w, 1 - 0.1 * w, 1 + 0.07 * w);
    });
    // Coming in and going out: the whole island rises from below, or sinks away.
    if (this.introE >= 0) {
      const e = (this.introE = Math.min(1, this.introE + dt * this.introRate));
      const back = 1 + 2.2 * (e - 1) ** 3 + 1.2 * (e - 1) ** 2;
      this.root.position.y = -7 * (1 - back);
      if (e >= 1) {
        this.introE = -1;
        this.root.position.y = 0;
      }
    } else if (this.outroAt >= 0) {
      const e = Math.min(1, (time - this.outroAt) / 0.5);
      this.root.position.y = -9 * e * e;
      if (e >= 1) this.settleOutro();
    } else this.root.position.y = 0;
    // Goals pulse until covered; crates on goals glow.
    if (this.state && this.grid) {
      const grid = this.grid;
      const onGoal = this.onGoal;
      const covered = this.covered;
      covered.clear();
      this.state.crates.forEach((c, k) => {
        onGoal[k] = c.cell >= 0 && grid.goal[c.cell] === 1 && grid.floor[c.cell] === c.z && !this.crates[k].tween;
        if (onGoal[k]) covered.add(c.cell);
      });
      for (const g of this.goals) {
        const on = covered.has(g.cell);
        g.glow.emissiveIntensity = on ? 1.4 : 0.45 + 0.35 * Math.sin(time * 3);
        // The light column fades out under a crate and back when it leaves.
        g.shown += ((on ? 0 : 1) - g.shown) * Math.min(1, dt * 7);
        g.column.opacity = g.shown * (0.17 + 0.05 * Math.sin(time * 2.2 + g.cell));
        g.beam.visible = g.shown > 0.02;
      }
      // Once solved, the crates flash one after another.
      const won = this.wonAt >= 0 ? time - this.wonAt : -1;
      this.crates.forEach((c, k) => {
        const on = onGoal[k];
        c.panels.emissive.set(on ? this.biome.goal : 0x000000);
        const flash = won >= 0 ? Math.max(0, 1 - Math.abs(won - 0.25 - k * 0.14) / 0.18) : 0;
        c.panels.emissiveIntensity = on ? 0.35 + flash * 1.1 : 0;
      });
    }
    this.mech?.update(time, dt);
    if (this.ghost?.visible) {
      if (this.planet && this.ghostCell >= 0) {
        this.glide(this.ghost.position.clone(), this.ghostTo, Math.min(1, dt * 14), this.ghost.position);
        this.ghost.quaternion.slerp(this.tq.copy(this.planet.frame(this.ghostCell)).multiply(qYaw(this.ghostTurn)), Math.min(1, dt * 12));
      } else {
        this.ghost.position.lerp(this.ghostTo, Math.min(1, dt * 14));
        let d = this.ghostTurn - this.ghost.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.ghost.rotation.y += d * Math.min(1, dt * 12);
      }
    }
    if (this.hintArrow?.visible && this.state) {
      // Follows the pusher as it moves (the state's cell is already the end of the move).
      const at = this.player.group.position;
      const bob = 0.55 + (this.reducedMotion ? 0 : Math.sin(time * 6) * 0.08);
      if (this.planet && this.hintCell >= 0) {
        const c = this.hintCell;
        this.hintArrow.position.copy(at).addScaledVector(this.planet.up(c), 0.5).addScaledVector(this.planet.tangent(c, this.hintDir), bob);
        this.hintArrow.quaternion.copy(this.planet.frame(c)).multiply(qYaw([0, -Math.PI / 2, Math.PI, Math.PI / 2][this.hintDir]));
      } else this.hintArrow.position.set(at.x + DX[this.hintDir] * bob, at.y + 0.5, at.z + DY[this.hintDir] * bob);
    }
    this.fx.update(dt);
    if (!this.reducedMotion) {
      this.air?.update(time, dt, this.camera.position);
      for (const s of this.spinners) s.rotateY(s.userData.spin * dt);
    }
    this.placeCamera(dt);
    // Glide the picture up or down (a view offset, so nothing else about the camera changes).
    // On a tall screen a planet also sits a little higher, clear of the touch controls.
    const goal = this.raise || (this.planet && this.camera.aspect < 0.8 ? 0.1 : 0);
    const was = this.raised;
    this.raised = this.reducedMotion || Math.abs(goal - was) < 1e-3 ? goal : was + (goal - was) * Math.min(1, dt * 6);
    if (this.raised) this.camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * this.raised, innerWidth, innerHeight);
    else if (was) this.camera.clearViewOffset();
    clock.value = time;
    this.post.render(this.scene, this.camera, time);
  }

  private placeCamera(dt: number) {
    if (this.orbiting && !this.reducedMotion) this.yaw += dt * 0.04;
    this.shownYaw += (this.yaw - this.shownYaw) * Math.min(1, dt * (this.orbiting ? 2 : 6));
    if (this.planet) return this.placePlanetCamera(dt);
    let a = this.shownYaw * (Math.PI / 2);
    let pitch = 1.08;
    // Far enough that the island fits both ways: its depth up and down, its width across.
    // On a big island, a window of about nine cells around the pusher, kept inside the island.
    const framed = this.follows && !this.overview && !this.orbiting;
    const want = framed ? { radius: 6.6, half: 5.2 } : { radius: this.radius, half: this.halfSpan };
    const glide = Math.min(1, dt * 4);
    this.aimSpan.radius += (want.radius - this.aimSpan.radius) * glide;
    this.aimSpan.half += (want.half - this.aimSpan.half) * glide;
    const target = this.target.copy(this.center);
    if (framed && this.grid) {
      const p = this.player.group.position;
      const mx = Math.max(0, this.grid.w / 2 - 4);
      const mz = Math.max(0, this.grid.h / 2 - 4);
      target.set(Math.max(-mx, Math.min(mx, p.x)), this.center.y, Math.max(-mz, Math.min(mz, p.z)));
    }
    this.aim.lerp(target, glide);
    const c = this.aim;
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    let dist = Math.max((this.aimSpan.radius / tan) * 0.92, (this.aimSpan.half / (tan * this.camera.aspect)) * 1.04) + 1;
    // The fly-in: from high and far, easing down onto the island.
    if (this.introE >= 0) {
      const e = this.introE;
      const k = (1 - e) ** 3;
      dist *= 1 + 0.9 * k;
      pitch += 0.3 * k;
      a -= 0.6 * k;
    }
    // Solved: a slow swing and a little closer.
    if (this.wonAt >= 0 && !this.reducedMotion) {
      const w = Math.min(1, (this.now - this.wonAt) / 1.6);
      const ease = w * w * (3 - 2 * w);
      a += 0.32 * ease;
      dist *= 1 - 0.1 * ease;
    }
    // Fog starts just in front of the island and thickens past it, at any camera distance.
    this.fog.near = dist * 0.9;
    this.fog.far = dist + 50;
    this.camera.position.set(c.x + Math.sin(a) * Math.cos(pitch) * dist, c.y + Math.sin(pitch) * dist, c.z + Math.cos(a) * Math.cos(pitch) * dist);
    // On tall screens, aim a little toward the camera: the island rises above the touch controls.
    const lift = this.camera.aspect < 1 ? 0.9 : 0;
    this.camera.lookAt(c.x + Math.sin(a) * lift, c.y - 0.3, c.z + Math.cos(a) * lift);
    this.shakeCamera(dt);
  }

  /**
   * Over a planet: the camera rides above the pusher, tilted to look ahead, with the screen's
   * up along `camF`. Its frame is carried along as the pusher walks (projected onto the new
   * ground each frame), so over an edge the view rolls smoothly instead of flipping. The
   * overview pulls back to see the whole planet.
   */
  private placePlanetCamera(dt: number) {
    const planet = this.planet!;
    const glide = Math.min(1, dt * 3.2);
    const p = this.player.group.position;
    const up = this.tmp.copy(p).normalize();
    this.camN.lerp(up, this.reducedMotion ? 1 : glide).normalize();
    this.camF.addScaledVector(this.camN, -this.camF.dot(this.camN)).normalize();
    const n = this.camN;
    const f = this.target.copy(this.camF).applyAxisAngle(n, this.shownYaw * (Math.PI / 2));
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    // Enough to see the pusher's face and the ones around it; more on narrow screens.
    const fit = (planet.radius + 1.6) / tan / Math.min(1, this.camera.aspect * 1.15);
    let dist = this.overview ? fit * 1.25 : fit * 0.9;
    let pitch = this.overview ? 1.35 : 1.38;
    if (this.introE >= 0) {
      const k = (1 - this.introE) ** 3;
      dist *= 1 + 0.9 * k;
      pitch += 0.2 * k;
    }
    if (this.wonAt >= 0 && !this.reducedMotion) {
      const w = Math.min(1, (this.now - this.wonAt) / 1.6);
      dist *= 1 + 0.15 * w * w * (3 - 2 * w);
    }
    // Aim at the pusher, seen from behind and above: its face, and the curve over to the next.
    const ground = this.aim.copy(n).multiplyScalar(this.overview ? 0 : planet.radius);
    this.camera.position.copy(ground).addScaledVector(n, Math.sin(pitch) * dist).addScaledVector(f, -Math.cos(pitch) * dist);
    // Look a little ahead.
    const look = ground.addScaledVector(f, 0.6);
    this.camera.up.copy(f);
    this.camera.lookAt(look);
    // The sun follows the camera, a little to one side, so the face in play is lit.
    const side = this.tmp.copy(f).cross(n);
    this.sun.position.copy(n).multiplyScalar(14).addScaledVector(f, -4).addScaledVector(side, 6);
    this.sun.target.position.set(0, 0, 0);
    this.fog.near = dist * 0.9;
    this.fog.far = dist + 50;
    this.shakeCamera(dt);
  }

  private shakeCamera(dt: number) {
    if (this.shakeAmp > 0.002) {
      const s = this.shakeAmp;
      this.camera.position.add(this.tmp.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shakeAmp *= Math.exp(-dt * 9);
    } else this.shakeAmp = 0;
  }
}
