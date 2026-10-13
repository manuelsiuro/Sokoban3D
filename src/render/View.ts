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
import { bake, plain, spikeGeometry } from './shapes';
import { skyTexture } from './sky';
import { CRATE_COLORS, Mechanics, dressCrate, tileColor } from './mechanics';
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
  private radius = 5;
  /** Half the island's longest side, rim included (what must fit across a narrow screen). */
  private halfSpan = 5;
  private crates: { group: THREE.Group; panels: THREE.MeshStandardMaterial; tween: Tween | null; lost: boolean }[] = [];
  private goals: { cell: number; glow: THREE.MeshStandardMaterial }[] = [];
  private mech: Mechanics | null = null;
  /** Each crate's tween is a pop (scale down and up) instead of a slide: it teleported. */
  private pops = new Set<number>();
  private player = playerModel();
  private playerTween: Tween | null = null;
  private hop = 0.1;
  private facing = 0;
  private facingFrom = 0;
  private pushing = false;
  private t0 = 0;
  private dur = MOVE_T;
  private now = 0;
  private fx = new Particles(this.root);
  /** The level's entrance (fly-in, island rising) and exit (sinking): start times, or -1. */
  private introAt = -1;
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
    const shell = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.26, 0.42, 4, 12),
      new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: 0.45, depthWrite: false, depthFunc: THREE.GreaterDepth }),
    );
    shell.position.y = 0.45;
    shell.renderOrder = 5;
    this.player.group.add(shell);
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
    for (const c of this.crates) this.root.remove(c.group);
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
    const special = new Map<string, { geos: THREE.BufferGeometry[]; m: THREE.Material }>();
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
        const look = isSolid ? tileColor(grid, c) : null;
        const tile = tileGeometry.clone().translate(wx, top - 0.15, wz);
        if (look) {
          const k = `${look.color}`;
          if (!special.has(k)) {
          const m = mat(look.color, look.opts);
          if (grid.tile[c] === TILE.lava) lavaShader(m);
          if (grid.tile[c] === TILE.ice) iceShader(m);
          special.set(k, { geos: [], m });
        }
          special.get(k)!.geos.push(tile);
        } else if (z !== 0) {
          // Higher ground is lighter, dips darker, so the levels read at a glance.
          const k = `z${z}|${(x + y) & 1}`;
          if (!special.has(k)) {
            const base = new THREE.Color((x + y) & 1 ? b.ground2 : b.ground);
            base.lerp(new THREE.Color(z > 0 ? 0xffffff : 0x000000), Math.min(0.5, Math.abs(z) * 0.16));
            special.set(k, { geos: [], m: mat(base.getHex(), { rough: 0.95 }) });
          }
          special.get(k)!.geos.push(tile);
        } else tiles[(x + y) & 1].push(tile);
        const colH = top + 0.5;
        if (colH > 0.01) soil.push(new THREE.BoxGeometry(1, colH, 1).translate(wx, top - 0.3 - colH / 2 + 0.02, wz));
      }
    // The rock under the island: deeper toward the middle, like a floating chunk of land.
    const key = (x: number, y: number) => `${x},${y}`;
    const inIsland = new Set(island.map(([x, y]) => key(x, y)));
    for (const [x, y, z] of island) {
      let edge = 0;
      for (let r = 1; r < 6; r++) {
        let ok = true;
        for (let d = 0; d < 4; d++) if (!inIsland.has(key(x + DX[d] * r, y + DY[d] * r))) ok = false;
        if (!ok) break;
        edge = r;
      }
      const depth = 0.7 + edge * 0.9 + R.next() * 0.8;
      const wx = x - (grid.w - 1) / 2;
      const wz = y - (grid.h - 1) / 2;
      // Below the cell's own floor (pits and lava sit lower than the ground around them).
      const base = Math.min(0, z) * LEVEL_H - 0.3;
      soil.push(new THREE.BoxGeometry(1, 0.5, 1).translate(wx, base - 0.25, wz));
      // A band of rock, then a craggy spike: together they hang like a chunk of land.
      rock.push(plain(new THREE.BoxGeometry(0.98, 0.3, 0.98).translate(wx, base - 0.65, wz)));
      rock.push(spikeGeometry(R.next, 0.66 + R.next() * 0.1, depth * 1.2).translate(wx, base - 0.78, wz));
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
    for (const { geos, m } of special.values()) add(geos, m);
    add(soil, mat(b.soil, { rough: 1 }), true);
    add(rock, mat(b.rock, { rough: 1, flat: true }), true);

    // Walls, goals, decor. Walls and decor are merged into a few meshes.
    const statics = new THREE.Group();
    for (let c = 0; c < grid.w * grid.h; c++) {
      if (grid.wall[c]) {
        const w = wallModel(b, c);
        this.pos(c, grid.floor[c], w.position);
        statics.add(w);
      }
      if (grid.goal[c]) {
        const { group, glow } = goalModel(b);
        if (grid.goalColor[c]) {
          glow.color.set(CRATE_COLORS[grid.goalColor[c]]);
          glow.emissive.set(CRATE_COLORS[grid.goalColor[c]]);
        }
        this.pos(c, grid.floor[c], group.position);
        this.world.add(group);
        this.goals.push({ cell: c, glow });
      }
    }
    if (this.mech) this.root.remove(this.mech.group);
    this.mech = new Mechanics(grid, (c, z, out) => this.pos(c, z, out), LEVEL_H);
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
    this.air = new Atmosphere(b, Math.max(grid.w, grid.h) / 2 + 1, hash(level.id));
    this.scene.add(this.air.group);

    // Crates.
    for (let k = 0; k < grid.crates.length; k++) {
      const c = crateModel(b, grid.crateKind[k] === 0 ? this.look : undefined);
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
    this.showHint(null);
    const animate = prev !== null && !this.reducedMotion;
    this.t0 = this.now;
    const falls = s.events & (EVENT.fall | EVENT.lost);
    this.dur = animate && prev && falls && s.moves > prev.moves ? FALL_T : MOVE_T;
    // Slides and conveyor rides cover more ground: a little longer per extra cell.
    if (animate && prev) {
      const g = this.grid;
      const far = (a: number, b: number) => (a < 0 || b < 0 ? 0 : Math.abs((a % g.w) - (b % g.w)) + Math.abs(Math.floor(a / g.w) - Math.floor(b / g.w)));
      const dist = Math.max(far(prev.cell, s.cell), ...s.crates.map((c, k) => far(prev.crates[k].cell, c.cell)));
      if (dist > 1 && !(s.events & EVENT.teleport)) this.dur = Math.min(0.5, this.dur + (dist - 1) * 0.07);
    }
    const teleported = animate && (s.events & EVENT.teleport) !== 0;
    const onPad = (c: number) => c >= 0 && this.grid!.tile[c] === TILE.teleport;
    this.pops.clear();
    if (teleported) this.dur = 0.3;
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
      // A crate sunk in lava has cooled to stone.
      const cooled = this.grid!.tile[c.cell] === TILE.lava && c.z === this.grid!.floor[c.cell];
      view.panels.color.set(cooled ? 0x4a4048 : view.panels.userData.base);
      if (teleported && was && onPad(c.cell) && was.cell !== c.cell) this.pops.add(k);
      if (animate && was && was.cell >= 0 && (was.cell !== c.cell || was.z !== c.z)) {
        const from = this.pos(was.cell, was.z).add(new THREE.Vector3(0, CRATE / 2, 0));
        view.tween = { from, to, drop: c.z < was.z };
        this.crateStop[k] = this.now + this.dur;
      } else {
        view.tween = null;
        view.group.position.copy(to);
      }
    });
    const pTo = this.pos(s.cell, s.z);
    if (teleported && prev && onPad(s.cell) && prev.cell !== s.cell) this.pops.add(-1);
    if (animate && prev && prev.cell !== s.cell) {
      this.playerTween = { from: this.pos(prev.cell, prev.z), to: pTo, drop: false };
      this.landAt = this.now + this.dur;
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
      this.introAt = -1;
      const g = this.grid;
      const at = (cell: number, z: number, y = 0.05) => this.pos(cell, z).add(new THREE.Vector3(0, y, 0));
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
      if (s.events & EVENT.push) this.burst(pTo.clone().add(new THREE.Vector3(DX[s.facing] * 0.5, 0.05, DY[s.facing] * 0.5)), this.biome.soil, 4, 0.8);
      if (s.events & EVENT.goalOn) {
        const k = s.pushed;
        const c = s.crates[k];
        if (c && c.cell >= 0) this.burst(this.pos(c.cell, c.z).add(new THREE.Vector3(0, 0.3, 0)), this.biome.goal, 14, 2.2);
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
  }

  private hintArrow: THREE.Group | null = null;
  private hintDir = 0;

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
      // The arrow's tip looks along -z: turn it to the direction.
      this.hintArrow.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][dir];
    }
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
    this.fx.emit(at, color, n, speed, 'shard');
  }

  /** Confetti over the island when it's solved. */
  celebrate() {
    if (!this.grid || this.reducedMotion) return;
    const colors = [0xffd447, 0xff6f91, 0x5fe3ff, 0x8fd16a, 0xb983ff];
    for (let k = 0; k < 5; k++) this.fx.emit(new THREE.Vector3((Math.random() - 0.5) * this.grid.w * 0.6, 1.5, (Math.random() - 0.5) * this.grid.h * 0.6), colors[k], 14, 3, 'shard', { size: 1.4 });
  }

  /** The level comes in: the camera flies down while the island rises from the clouds. */
  intro() {
    if (this.reducedMotion) return;
    this.introAt = this.now;
    this.outroAt = -1;
  }

  /** Ends the entrance at once (the player started moving). */
  skipIntro() {
    this.introAt = -1;
  }

  /** The island sinks into the clouds; resolves when it's gone (at once with reduced motion). */
  leave(): Promise<void> {
    if (this.reducedMotion || !this.grid) return Promise.resolve();
    this.introAt = -1;
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
    for (const c of this.crates) {
      if (!c.tween) continue;
      const { from, to, drop } = c.tween;
      if (drop) {
        // Slide over the edge in the first part, then fall (accelerating).
        const slide = Math.min(1, t / 0.45);
        const fall = Math.max(0, (t - 0.45) / 0.55);
        c.group.position.set(from.x + (to.x - from.x) * slide, from.y + (to.y - from.y) * fall * fall, from.z + (to.z - from.z) * slide);
      } else if (this.pops.has(this.crates.indexOf(c))) {
        c.group.position.copy(t < 0.5 ? from : to);
        c.group.scale.setScalar(Math.max(0.05, Math.abs(1 - 2 * t)));
      } else c.group.position.lerpVectors(from, to, ease);
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
    if (this.introAt >= 0) {
      const e = Math.min(1, (time - this.introAt) / 1.1);
      const back = 1 + 2.2 * (e - 1) ** 3 + 1.2 * (e - 1) ** 2;
      this.root.position.y = -7 * (1 - back);
      if (e >= 1) {
        this.introAt = -1;
        this.root.position.y = 0;
      }
    } else if (this.outroAt >= 0) {
      const e = Math.min(1, (time - this.outroAt) / 0.5);
      this.root.position.y = -9 * e * e;
      if (e >= 1) {
        this.outroAt = -1;
        this.outroDone?.();
        this.outroDone = null;
      }
    } else this.root.position.y = 0;
    // Goals pulse until covered; crates on goals glow.
    if (this.state && this.grid) {
      const onGoal = new Set<number>();
      this.state.crates.forEach((c, k) => {
        if (c.cell >= 0 && this.grid!.goal[c.cell] && this.grid!.floor[c.cell] === c.z && !this.crates[k].tween) onGoal.add(k);
      });
      const covered = new Set(this.state.crates.filter((c, k) => onGoal.has(k) && c).map((c) => c.cell));
      for (const g of this.goals) g.glow.emissiveIntensity = covered.has(g.cell) ? 1.4 : 0.45 + 0.35 * Math.sin(time * 3);
      // Once solved, the crates flash one after another.
      const won = this.wonAt >= 0 ? time - this.wonAt : -1;
      this.crates.forEach((c, k) => {
        const on = onGoal.has(k);
        c.panels.emissive.set(on ? this.biome.goal : 0x000000);
        const flash = won >= 0 ? Math.max(0, 1 - Math.abs(won - 0.25 - k * 0.14) / 0.18) : 0;
        c.panels.emissiveIntensity = on ? 0.35 + flash * 1.1 : 0;
      });
    }
    this.mech?.update(time, dt);
    if (this.ghost?.visible) {
      this.ghost.position.lerp(this.ghostTo, Math.min(1, dt * 14));
      let d = this.ghostTurn - this.ghost.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.ghost.rotation.y += d * Math.min(1, dt * 12);
    }
    if (this.hintArrow?.visible && this.state) {
      const at = this.pos(this.state.cell, this.state.z);
      const bob = 0.55 + Math.sin(time * 6) * 0.08;
      this.hintArrow.position.set(at.x + DX[this.hintDir] * bob, at.y + 0.5, at.z + DY[this.hintDir] * bob);
    }
    this.fx.update(dt);
    if (!this.reducedMotion) {
      this.air?.update(time, dt);
      for (const s of this.spinners) s.rotateY(s.userData.spin * dt);
    }
    this.placeCamera(dt);
    clock.value = time;
    this.post.render(this.scene, this.camera, time);
  }

  private placeCamera(dt: number) {
    if (this.orbiting) this.yaw += dt * 0.04;
    this.shownYaw += (this.yaw - this.shownYaw) * Math.min(1, dt * (this.orbiting ? 2 : 6));
    let a = this.shownYaw * (Math.PI / 2);
    let pitch = 1.08;
    // Far enough that the island fits both ways: its depth up and down, its width across.
    const tan = Math.tan((this.camera.fov * Math.PI) / 360);
    let dist = Math.max((this.radius / tan) * 0.92, (this.halfSpan / (tan * this.camera.aspect)) * 1.04) + 1;
    // The fly-in: from high and far, easing down onto the island.
    if (this.introAt >= 0) {
      const e = Math.min(1, (this.now - this.introAt) / 1.1);
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
    this.camera.position.set(this.center.x + Math.sin(a) * Math.cos(pitch) * dist, this.center.y + Math.sin(pitch) * dist, this.center.z + Math.cos(a) * Math.cos(pitch) * dist);
    // On tall screens, aim a little toward the camera: the island rises above the touch controls.
    const lift = this.camera.aspect < 1 ? 0.9 : 0;
    this.camera.lookAt(this.center.x + Math.sin(a) * lift, this.center.y - 0.3, this.center.z + Math.cos(a) * lift);
    if (this.shakeAmp > 0.002) {
      const s = this.shakeAmp;
      this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s));
      this.shakeAmp *= Math.exp(-dt * 9);
    } else this.shakeAmp = 0;
  }
}
