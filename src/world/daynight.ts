import type { Biome } from './biomes';

/**
 * Time of day and weather, as colors and amounts (no Three.js here, so a test can check them).
 * Visual only: the rules never read the sky.
 *
 * The day is a loop of `DAY_LENGTH` seconds. `phase` 0 is sunrise; the sun stands highest at
 * 0.25 and sets a little after 0.5, so days run longer than nights. At the top of the day the
 * look is exactly the biome's own colors; the night is moonlit and stays readable (walls,
 * crates and pads keep at least `NIGHT_FLOOR` of their daylight).
 */
export const DAY_LENGTH = 480;
/** Where a new session starts: mid-morning. */
export const MORNING = 0.12;
/** The phase of "always day" (the setting off). */
export const NOON = 0.25;
/** The least light the ground gets, as a share of noon. */
export const NIGHT_FLOOR = 0.55;

export interface SkyLook {
  top: number;
  bottom: number;
  fog: number;
  /** The directional light: the sun by day, the moon by night. */
  light: number;
  lightIntensity: number;
  /** Where the light comes from (unit vector, y up). */
  lightDir: [number, number, number];
  hemi: number;
  hemiGround: number;
  hemiIntensity: number;
  /** 0 by day, 1 deep in the night (stars, fireflies, the lantern). */
  night: number;
  /** Warmth at sunrise and sunset, 0..1. */
  dusk: number;
  /** Fog distance multiplier (storms bring it closer). */
  fogScale: number;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Mixes two 0xRRGGBB colors. */
export function mix(a: number, b: number, t: number) {
  t = clamp(t);
  const ch = (s: number) => {
    const x = (a >> s) & 255;
    const y = (b >> s) & 255;
    return Math.round(x + (y - x) * t) << s;
  };
  return ch(16) | ch(8) | ch(0);
}

/** Perceived brightness of a color, 0..1. */
export const luma = (c: number) => (0.2126 * ((c >> 16) & 255) + 0.7152 * ((c >> 8) & 255) + 0.0722 * (c & 255)) / 255;

const NIGHT_TOP = 0x0a1034;
const NIGHT_BOTTOM = 0x2b3a6e;
const DUSK_TOP = 0x5a5fae;
const DUSK_BOTTOM = 0xff9a6a;
const MOON = 0x9fb6ff;
const SUNSET = 0xff9450;

/** The sun's height in the sky, about -1..1 (above 0: up). */
export const elevation = (phase: number) => Math.sin(phase * Math.PI * 2) + 0.2;

/**
 * The sky at a phase, for a biome. `wet` (0..1) is how much weather is on: rain and storms
 * grey the sky and dim the sun; `storm` (0..1) is how much the weather hides the distance.
 */
export function skyAt(b: Biome, phase: number, wet = 0, storm = 0): SkyLook {
  const p = ((phase % 1) + 1) % 1;
  const e = elevation(p);
  // Dark worlds (the forge, the crystal caves) change less: their sky is mostly their own.
  const k = b.cycle ?? 1;
  const day = smooth(-0.15, 0.45, e);
  const night = (1 - smooth(-0.45, 0.02, e)) * k;
  const dusk = Math.exp(-((e - 0.05) ** 2) / 0.035) * k;
  let top = mix(mix(b.skyTop, DUSK_TOP, dusk * 0.55), NIGHT_TOP, night * 0.85);
  let bottom = mix(mix(b.skyBottom, DUSK_BOTTOM, dusk * 0.6), NIGHT_BOTTOM, night * 0.8);
  let fog = mix(mix(b.fog, DUSK_BOTTOM, dusk * 0.35), NIGHT_BOTTOM, night * 0.75);
  // Weather: a grey lid (sand and ash tint it their own way, see the biome's weather color).
  const grey = b.weather?.tint ?? 0x8c97a6;
  top = mix(top, mix(grey, NIGHT_TOP, night * 0.8), wet * 0.6);
  bottom = mix(bottom, mix(grey, NIGHT_BOTTOM, night * 0.7), wet * 0.5);
  fog = mix(fog, mix(grey, NIGHT_BOTTOM, night * 0.7), wet * 0.55 + storm * 0.3);
  // The sun by day, the moon by night; between the two the light dips to nothing, so its
  // direction can switch unseen.
  const moonUp = smooth(-0.12, -0.4, e);
  // Worlds with a full cycle see the light swing across the sky; dark worlds keep it still.
  const swing = k >= 1;
  const isMoon = swing && e < -0.12;
  const arc = !swing ? Math.PI / 2 : isMoon ? p * Math.PI * 2 + Math.PI : p * Math.PI * 2;
  // East to west, never lower than a long-shadow angle; at noon it's the islands' usual light.
  const dx = -0.5 - Math.cos(arc) * 0.6;
  const dy = 0.45 + 0.55 * clamp(Math.sin(arc));
  const dz = 0.62;
  const n = Math.hypot(dx, dy, dz);
  const base = e < -0.12 ? moonUp * 0.42 : day;
  const sunI = b.sunIntensity * (1 - k * (1 - base)) * (1 - wet * 0.55);
  const light = mix(mix(b.sun, SUNSET, dusk * 0.7), MOON, smooth(-0.1, -0.3, e) * k);
  // The sky's fill keeps the night readable: it never drops below the floor.
  // Twilight, while the sun has set and the moon isn't up yet, the sky itself fills in.
  const twilight = Math.exp(-((e + 0.12) ** 2) / 0.025) * k;
  const fill = (1 - (1 - NIGHT_FLOOR) * night) * (1 + 0.5 * twilight);
  return {
    top,
    bottom,
    fog,
    light,
    lightIntensity: sunI,
    lightDir: [dx / n, dy / n, dz / n],
    hemi: mix(mix(0xffffff, 0xffd2b0, dusk * 0.5), 0x8ea2dc, night * 0.75),
    hemiGround: mix(b.soil, 0x1c2240, night * 0.6),
    hemiIntensity: b.ambient * fill * (1 + wet * 0.08),
    night,
    dusk,
    fogScale: 1 - storm * 0.6,
  };
}

/**
 * How much light reaches the ground at a phase, as a share of noon (sun on a flat floor plus
 * the sky's fill). The test proves it never drops below NIGHT_FLOOR.
 */
export function groundLight(b: Biome, phase: number) {
  const at = (s: SkyLook) => s.hemiIntensity * luma(s.hemi) + s.lightIntensity * luma(s.light) * s.lightDir[1];
  return at(skyAt(b, phase)) / at(skyAt(b, NOON));
}
