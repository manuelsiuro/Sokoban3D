import { KEYS, PROGRESS_KEYS, readJSON, removeKey, writeJSON } from './storage';
import type { Quality } from '../render/post';

/** Player preferences, saved on this device. New fields get their default automatically. */
export interface Settings {
  /** 0..1 */
  sfxVolume: number;
  /** All sound off (the title's switch); the volume is kept for when it comes back. */
  muted: boolean;
  /** No screen shake or flashes. */
  reducedMotion: boolean;
  music: boolean;
  /** 0..1 */
  musicVolume: number;
  /** Chosen cosmetics (ids from achievements.ts). */
  skin: string;
  outfit: string;
  /** Show the ghost of the best run while playing. */
  ghost: boolean;
  /** The camera shakes on falls and lava. */
  shake: boolean;
  /** Render quality: auto adapts to the device. */
  quality: Quality;
  /** Vibrate on pushes, goals and wins (phones). */
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  sfxVolume: 0.8,
  muted: false,
  reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  music: true,
  musicVolume: 0.5,
  skin: 'world',
  outfit: 'red',
  ghost: true,
  shake: true,
  quality: 'auto',
  haptics: true,
};

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...readJSON<Partial<Settings>>(KEYS.settings, {}) };
}

export function saveSettings(s: Settings) {
  writeJSON(KEYS.settings, s);
}

/** Wipes stars and records; preferences stay. */
export function resetProgress() {
  for (const k of PROGRESS_KEYS) removeKey(k);
}
