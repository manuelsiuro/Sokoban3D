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
  /** Shapes on colored crates, goals, plates and doors (for color blindness). */
  symbols: boolean;
  /** Warn when a crate can never reach a pad any more. */
  stuck: boolean;
  /** Language: auto follows the browser. */
  lang: 'auto' | 'en' | 'fr';
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
  symbols: true,
  stuck: true,
  lang: 'auto',
};

/** Stored settings, each field checked against its default's type (a bad value gets the default). */
export function loadSettings(): Settings {
  const raw = readJSON<Record<string, unknown>>(KEYS.settings, {});
  const s = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) if (typeof raw[k] === typeof v) s[k] = raw[k];
  const out = s as unknown as Settings;
  if (!['auto', 'high', 'medium', 'low'].includes(out.quality)) out.quality = 'auto';
  if (!['auto', 'en', 'fr'].includes(out.lang)) out.lang = 'auto';
  for (const k of ['sfxVolume', 'musicVolume'] as const) out[k] = Math.min(1, Math.max(0, Number.isFinite(out[k]) ? out[k] : DEFAULT_SETTINGS[k]));
  return out;
}

export function saveSettings(s: Settings) {
  writeJSON(KEYS.settings, s);
}

/** Wipes stars and records; preferences stay. */
export function resetProgress() {
  for (const k of PROGRESS_KEYS) removeKey(k);
}
