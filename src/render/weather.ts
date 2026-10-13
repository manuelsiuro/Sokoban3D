import * as THREE from 'three';
import type { Biome, WeatherKind } from '../world/biomes';
import { DAY_LENGTH, MORNING, NOON, skyAt, type SkyLook } from '../world/daynight';
import { dot } from './atmosphere';

/**
 * The sky over the level: the time of day going round (daynight.ts gives the colors), the
 * weather coming and going, and what they bring: rain, a blizzard, a sandstorm or ash; stars,
 * fireflies and the aurora by night; a rainbow after rain. Visual only, never seeded from the
 * level (no two visits look the same), and the clock carries on from one level to the next.
 */
export class Weather {
  readonly group = new THREE.Group();
  /** 0..1 round the day (0 sunrise). */
  phase = MORNING;
  /** How much weather is on now, and where it's heading. */
  wet = 0;
  target = 0;
  /** Settings: the day goes round (else always noon); weather comes by. */
  cycle = true;
  enabled = true;
  private next = 0;
  private peak = 0;
  private rainbowT = 0;
  private biome: Biome | null = null;
  private kind: WeatherKind | null = null;
  private planet = false;
  private fall: Fall | null = null;
  private stars: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private flies: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private aurora: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> | null = null;
  private rainbow: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private time = 0;
  look: SkyLook | null = null;

  constructor() {
    this.stars = starField();
    this.rainbow = rainbowArc();
    this.group.add(this.stars, this.rainbow);
  }

  /** A new level: its biome's weather and night life, sized to the island (or planet). */
  setBiome(b: Biome, radius: number, planet: boolean, now: number, small: boolean) {
    const same = this.biome?.weather?.kind === b.weather?.kind && this.planet === planet;
    this.biome = b;
    this.planet = planet;
    this.kind = planet ? null : (b.weather?.kind ?? null);
    for (const o of [this.fall?.obj, this.flies, this.aurora]) {
      if (!o) continue;
      this.group.remove(o);
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
    this.fall = this.kind ? new Fall(this.kind, radius, small) : null;
    if (this.fall) this.group.add(this.fall.obj);
    this.flies = !planet && b.nightLife === 'fireflies' ? fireflies(radius) : null;
    this.aurora = !planet && b.nightLife === 'aurora' ? auroraBands() : null;
    for (const o of [this.flies, this.aurora]) if (o) this.group.add(o);
    // Another kind of world: its weather starts fresh (sometimes already falling).
    if (!same) {
      this.target = this.kind && Math.random() < 0.25 ? 0.45 + Math.random() * 0.5 : 0;
      this.wet = this.target;
      this.peak = this.wet;
      this.rainbowT = 0;
      this.next = now + 30 + Math.random() * 50;
    }
  }

  /** Advances the clock and the weather; returns the sky to draw. */
  update(now: number, dt: number, camera: THREE.Camera, reduced: boolean): SkyLook {
    const eye = camera.position;
    const b = this.biome!;
    this.time += dt;
    this.phase = this.cycle ? (this.phase + dt / DAY_LENGTH) % 1 : NOON;
    // Weather comes and goes: a spell of 45–90 s, then a clear 70–160 s (or a dry spell).
    const allowed = this.enabled && !reduced && this.kind !== null;
    if (!allowed) this.target = 0;
    else if (now >= this.next) {
      if (this.target > 0) {
        this.target = 0;
        this.next = now + 70 + Math.random() * 90;
      } else if (Math.random() < 0.55) {
        this.target = 0.5 + Math.random() * 0.5;
        this.next = now + 45 + Math.random() * 45;
      } else this.next = now + 40 + Math.random() * 40;
    }
    const step = dt / 9;
    this.wet += Math.max(-step, Math.min(step, this.target - this.wet));
    this.peak = Math.max(this.peak, this.wet);
    const storm = this.kind === 'snow' || this.kind === 'sand' ? this.wet : this.wet * 0.25;
    const look = (this.look = skyAt(b, this.phase, this.kind ? this.wet : 0, storm));
    // A rainbow when the rain clears by day (opposite the sun).
    if (this.kind === 'rain' && this.target === 0 && this.wet < 0.2 && this.peak > 0.4) {
      this.peak = 0;
      if (look.night < 0.1 && look.dusk < 0.5) this.rainbowT = 45;
    }
    this.rainbowT = Math.max(0, this.rainbowT - dt);
    const bow = Math.min(1, this.rainbowT / 6, (45 - this.rainbowT) / 6) * (1 - look.night);
    this.rainbow.visible = bow > 0.01 && !this.planet;
    if (this.rainbow.visible) {
      // In the camera's space, like the aurora: an arc across the top of the picture, off to
      // the side away from the sun.
      const [x, , z] = look.lightDir;
      const side = Math.sign(x * Math.cos(camera.rotation.y) - z * Math.sin(camera.rotation.y)) || 1;
      this.rainbow.position.set(-side * 24, -14, -150).applyQuaternion(camera.quaternion).add(eye);
      this.rainbow.quaternion.copy(camera.quaternion);
      this.rainbow.material.opacity = bow * 0.3;
    }
    // Stars and the night's lights fade in as the sky darkens (and hide behind the weather).
    const clear = 1 - this.wet;
    const dark = Math.max(0, look.night - 0.15) / 0.85;
    this.stars.visible = dark > 0.01;
    this.stars.material.uniforms.amount.value = dark * clear;
    this.stars.material.uniforms.time.value = this.time;
    this.stars.position.copy(eye);
    if (this.aurora) this.aurora.position.copy(eye), this.aurora.quaternion.copy(camera.quaternion);
    for (const o of [this.flies, this.aurora]) {
      if (!o) continue;
      o.visible = dark > 0.01;
      o.material.uniforms.amount.value = dark * clear;
      o.material.uniforms.time.value = reduced ? 0 : this.time;
    }
    if (this.fall) this.fall.update(this.wet, dt, this.time, look.night);
    return look;
  }

  /** Sound beds for the weather and the night: rain, wind, crickets (0..1 each). */
  get ambience() {
    const w = this.wet;
    const night = this.look?.night ?? 0;
    return {
      rain: this.kind === 'rain' ? w : 0,
      wind: this.kind === 'snow' || this.kind === 'sand' ? w : this.kind === 'ash' ? w * 0.4 : 0,
      crickets: this.flies ? Math.max(0, night - 0.3) * (1 - w) : 0,
    };
  }
}

/** Rain, snow, sand or ash in a box round the island; light weather draws fewer of them. */
class Fall {
  readonly obj: THREE.LineSegments | THREE.Points;
  private pos: Float32Array;
  private speed: Float32Array;
  private count: number;
  private half: number;
  private line: boolean;
  private p: { fall: number; wind: number; len: number; sway: number; opacity: number; color: number };

  constructor(
    private kind: WeatherKind,
    radius: number,
    small: boolean,
  ) {
    const P = {
      rain: { count: 900, fall: 15, wind: 2.2, len: 0.42, sway: 0, opacity: 0.62, color: 0xdce8f6, size: 0 },
      snow: { count: 1100, fall: 2.4, wind: 4.5, len: 0, sway: 0.7, opacity: 0.95, color: 0xffffff, size: 0.13 },
      sand: { count: 1000, fall: 0.4, wind: 11, len: 0.55, sway: 0.4, opacity: 0.45, color: 0xf2cf98, size: 0 },
      ash: { count: 600, fall: 0.8, wind: 0.7, len: 0, sway: 1.1, opacity: 0.9, color: 0xa69a96, size: 0.11 },
    }[kind];
    this.p = P;
    this.count = small ? Math.round(P.count * 0.55) : P.count;
    this.half = radius + 5;
    this.line = P.len > 0;
    const n = this.count;
    this.pos = new Float32Array(n * (this.line ? 6 : 3));
    this.speed = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      this.speed[k] = 0.75 + Math.random() * 0.5;
      this.spawn(k, -6 + Math.random() * 20);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    if (this.line) {
      this.obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: P.color, transparent: true, depthWrite: false, opacity: P.opacity }));
    } else {
      this.obj = new THREE.Points(geo, new THREE.PointsMaterial({ color: P.color, size: P.size * 2.2, map: dot(), transparent: true, depthWrite: false, opacity: P.opacity, sizeAttenuation: true }));
    }
    this.obj.frustumCulled = false;
    this.obj.userData.noAO = true;
  }

  /** Puts drop k somewhere across the box at height y. */
  private spawn(k: number, y: number) {
    const h = this.half;
    const x = -h + Math.random() * h * 2;
    const z = -h + Math.random() * h * 2;
    this.set(k, x, this.kind === 'sand' ? -1 + Math.random() * 6 : y, z);
  }

  private set(k: number, x: number, y: number, z: number) {
    const a = this.pos;
    if (this.line) {
      const p = this.p;
      // A streak along the way it's moving.
      const vx = p.wind;
      const vy = -p.fall;
      const l = p.len / Math.hypot(vx, vy);
      a.set([x, y, z, x - vx * l, y - vy * l, z], k * 6);
    } else a.set([x, y, z], k * 3);
  }

  update(amount: number, dt: number, time: number, night: number) {
    this.obj.visible = amount > 0.01;
    if (!this.obj.visible) return;
    const p = this.p;
    const n = this.count;
    this.obj.geometry.setDrawRange(0, Math.ceil(n * Math.min(1, amount * 1.2)) * (this.line ? 2 : 1));
    const m = this.obj.material as THREE.LineBasicMaterial | THREE.PointsMaterial;
    m.opacity = p.opacity * Math.min(1, 0.4 + amount) * (1 - night * 0.35);
    // A gust now and then.
    const gust = 1 + 0.35 * Math.sin(time * 0.6) + 0.15 * Math.sin(time * 1.7);
    const h = this.half;
    const a = this.pos;
    const stride = this.line ? 6 : 3;
    for (let k = 0; k < n; k++) {
      const i = k * stride;
      const s = this.speed[k];
      const dx = (p.wind * gust + Math.sin(time * 1.3 + k) * p.sway) * s * dt;
      const dy = -p.fall * s * dt;
      const dz = Math.cos(time * 0.9 + k * 1.7) * p.sway * s * dt;
      let x = a[i] + dx;
      let y = a[i + 1] + dy;
      let z = a[i + 2] + dz;
      if (y < -6 || x > h || x < -h) {
        // Out of the box: back in at the top (or the windward side).
        x = x > h ? -h : x < -h ? h : -h + Math.random() * h * 2;
        y = this.kind === 'sand' ? -1 + Math.random() * 6 : 14;
        z = -h + Math.random() * h * 2;
      }
      if (z > h) z -= h * 2;
      if (z < -h) z += h * 2;
      if (this.line) this.set(k, x, y, z);
      else {
        a[i] = x;
        a[i + 1] = y;
        a[i + 2] = z;
      }
    }
    (this.obj.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** A soft round sprite that blinks: each point has its own phase. Used by stars and fireflies. */
function blinkMaterial(color: number, size: number, opts: { rate: number; depth: boolean }) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 }, color: { value: new THREE.Color(color) }, size: { value: size }, scale: { value: innerHeight / 2 } },
    vertexShader: `
      attribute float phase;
      uniform float time, size, scale;
      varying float vA;
      void main() {
        vec3 p = position;
        ${opts.rate > 1 ? `p += vec3(sin(time * 0.7 + phase * 3.1), sin(time * 1.1 + phase * 1.7) * 0.5, cos(time * 0.6 + phase * 2.3)) * 0.6;` : ''}
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float b = 0.5 + 0.5 * sin(time * ${opts.rate.toFixed(2)} + phase * 6.283);
        vA = ${opts.rate > 1 ? 'smoothstep(0.35, 1.0, b)' : '0.55 + 0.45 * b'};
        gl_PointSize = size * scale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float amount;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA * amount;
        if (a < 0.01) discard;
        gl_FragColor = vec4(color, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: opts.depth,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

/** Stars on a big sphere round the camera, twinkling slowly. */
function starField() {
  const n = 700;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  const v = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
    if (v.lengthSq() > 1 || v.lengthSq() < 0.01) {
      k--;
      continue;
    }
    v.normalize().multiplyScalar(150);
    pos.set([v.x, v.y, v.z], k * 3);
    phase[k] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const m = blinkMaterial(0xfff6e0, 1.6, { rate: 0.8, depth: true });
  const o = new THREE.Points(geo, m);
  o.frustumCulled = false;
  o.renderOrder = -1;
  o.userData.noAO = true;
  return o;
}

/** Fireflies drifting low over the island, blinking on and off. */
function fireflies(radius: number) {
  const n = 46;
  const pos = new Float32Array(n * 3);
  const phase = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    pos.set([(Math.random() - 0.5) * (radius * 2 + 4), 0.4 + Math.random() * 1.8, (Math.random() - 0.5) * (radius * 2 + 4)], k * 3);
    phase[k] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const o = new THREE.Points(geo, blinkMaterial(0xd8ff7a, 0.5, { rate: 1.6, depth: true }));
  o.frustumCulled = false;
  o.userData.noAO = true;
  return o;
}

/**
 * The aurora: soft green and violet curtains across the top of the picture, rippling. Built in
 * the camera's own space (it follows the camera), since the view looks down at the island and
 * the sky it shows is whatever lies behind it.
 */
function auroraBands() {
  const parts: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const seg = 80;
  const D = 140;
  const half = D * Math.tan((17 * Math.PI) / 180);
  for (let b = 0; b < 3; b++) {
    const base = parts.length / 3;
    for (let i = 0; i <= seg; i++) {
      const u = i / seg;
      const x = (u * 2 - 1) * half * 3;
      const y = half * (0.45 + b * 0.16 + 0.12 * Math.sin(u * 7 + b * 2));
      for (const v of [0, 1]) {
        parts.push(x, y + v * half * (0.38 + b * 0.06), -D - b * 4);
        uv.push(u + b, v);
      }
    }
    for (let i = 0; i < seg; i++) {
      const q = base + i * 2;
      idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(parts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, amount: { value: 0 } },
    vertexShader: `
      uniform float time;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 p = position;
        p.y += sin(uv.x * 9.0 + time * 0.35) * 2.5;
        p.x += sin(uv.x * 4.0 + time * 0.2) * 4.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float time, amount;
      varying vec2 vUv;
      void main() {
        float rays = 0.55 + 0.45 * sin(vUv.x * 60.0 + time * 0.8) * sin(vUv.x * 23.0 - time * 0.5);
        float fade = smoothstep(0.0, 0.18, vUv.y) * pow(clamp(1.0 - vUv.y, 0.0, 1.0), 1.6);
        float u = fract(vUv.x);
        float ends = smoothstep(0.0, 0.15, u) * smoothstep(1.0, 0.85, u);
        vec3 c = mix(vec3(0.25, 1.0, 0.6), vec3(0.65, 0.4, 1.0), smoothstep(0.35, 1.0, vUv.y));
        gl_FragColor = vec4(c, fade * rays * ends * amount * 0.42);
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const o = new THREE.Mesh(geo, m);
  o.frustumCulled = false;
  o.userData.noAO = true;
  return o;
}

/** A rainbow: seven bands on a half ring, faint, far away. */
function rainbowArc() {
  const bands = [0x8f5bff, 0x4b6bff, 0x3fb8ff, 0x5fe06a, 0xffe34a, 0xffa23a, 0xff4a4a];
  const geo = new THREE.RingGeometry(40, 46, 64, bands.length - 1, 0, Math.PI);
  const col: number[] = [];
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    c.set(bands[Math.round(((r - 40) / 6) * (bands.length - 1))]);
    // The feet fade into the haze.
    const up = Math.max(0, pos.getY(i) / r);
    col.push(c.r, c.g, c.b, Math.min(1, up / 0.45) ** 1.5);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const o = new THREE.Mesh(geo, m);
  o.visible = false;
  o.userData.noAO = true;
  return o;
}
