import * as THREE from 'three';
import { LEVELS } from '../levels/levels';
import { SOLUTIONS } from '../levels/solutions';
import { WORLDS } from '../levels/worlds';
import type { LevelDef } from '../levels/types';
import { View } from '../render/View';
import { symbols } from '../render/mechanics';
import { MapView } from '../render/MapView';
import { Sound } from '../audio/Sound';
import { Sim, type GameState } from '../sim/Sim';
import { loadSettings } from '../game/settings';
import { OUTFITS, SKINS, checkAchievements, unlockedCosmetics } from '../game/achievements';
import { loadDaily } from '../game/dailyProgress';
import { loadProgress } from '../game/progress';
import { TOUCH, closeOverlay, h } from '../ui/dom';
import { icon } from '../ui/icons';
import { levelText, setLang, t } from '../i18n';
import { photoMode } from '../ui/screens/photo';
import { showSummary, type SummaryInfo } from '../ui/screens/summary';
import { buzz, setHaptics } from './haptics';

/**
 * The long-lived objects every mode shares: settings, sound, the renderer with its two
 * scenes, and the level on screen. Modes import from here instead of from each other.
 */
export const settings = loadSettings();
setLang(settings.lang);
export const sound = new Sound();
export const applySound = () => {
  sound.setVolume(settings.muted ? 0 : settings.sfxVolume);
  sound.setMusic(settings.music, settings.musicVolume);
};
applySound();
export const click = () => sound.click();
setHaptics(settings.haptics);

// A soft tick when the mouse moves onto a button (not on touch screens: no hover there).
if (!TOUCH) {
  let lastHover: Element | null = null;
  addEventListener('pointerover', (e) => {
    const b = (e.target as HTMLElement).closest?.('button:not(:disabled), .level-card');
    if (b && b !== lastHover) sound.hover();
    lastHover = b ?? null;
  });
}

/** Photo mode over the level on screen; resolves when it closes. */
export const photos = () => photoMode(view, levelText(screen.sim.level).name, `cratelands-${screen.sim.level.id}`, { click, shutter: () => sound.shutter() });

/** The summary after a solve, with its sounds (and a photo of the solved island). */
export const summary = (r: SummaryInfo) => showSummary({ pulls: screen.sim.grid.pull, photo: photos, ...r }, click, (k) => sound.star(k));
/** A campaign level's par (its stored solution's length). */
export const par = (index: number) => SOLUTIONS[LEVELS[index].id]?.length ?? 0;

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.append(renderer.domElement);
export const view = new View(renderer);
view.reducedMotion = settings.reducedMotion;
view.shake = settings.shake;
symbols.on = settings.symbols;
view.setQuality(settings.quality, TOUCH);
export const map = new MapView(renderer, WORLDS);
addEventListener('resize', () => map.resize());
map.resize();

/** Which scene the frame loop draws, and the level on screen (also behind the menus). */
export const screen = { mode: 'level' as 'level' | 'map', sim: new Sim(LEVELS[0]), shown: null as unknown as GameState };
screen.shown = screen.sim.state;

/** Shows a level (and plays its world's music, unless `music: false`: the title's showcase). */
export function showLevel(level: LevelDef, opts: { music?: boolean } = {}) {
  if (opts.music !== false) sound.setMusic(settings.music, settings.musicVolume, level.biome ?? level.world);
  screen.sim = new Sim(level);
  screen.shown = screen.sim.state;
  view.setLevel(level, screen.sim.grid, screen.shown);
}

export const worldIndex = (levelIndex: number) => WORLDS.findIndex((w) => w.id === LEVELS[levelIndex].world);

/** A short message at the top of the screen. */
export function toast(html: string, ms = 3200) {
  const t = h('div', 'toast', html);
  document.body.append(t);
  setTimeout(() => closeOverlay(t, 400), ms);
}

/** Checks achievements after a solve; returns a line for the summary (and toasts each new one). */
export function newTrophies(): string {
  const fresh = checkAchievements({ progress: loadProgress(), daily: loadDaily() });
  // A world cleared gets the big fanfare; other trophies a short one.
  if (fresh.length) {
    setTimeout(() => {
      sound.stinger(fresh.some((a) => a.id.startsWith('world-')) ? 'world' : 'trophy');
      buzz('win');
    }, 900);
  }
  fresh.forEach((a, k) => setTimeout(() => toast(`${icon('trophy', 18)} <span>${a.name}${a.reward ? t('toast.newLook') : ''}</span>`), 600 + k * 900));
  return fresh.length ? `${icon('trophy', 14)} ${fresh.map((a) => a.name).join(', ')}` : '';
}

/** Puts the chosen crate skin and outfit on (an unknown or locked choice falls back to the default). */
export function applyLook() {
  const { skins, outfits } = unlockedCosmetics();
  const skin = SKINS.find((k) => k.id === settings.skin && skins.has(k.id)) ?? SKINS[0];
  const outfit = OUTFITS.find((o) => o.id === settings.outfit && outfits.has(o.id)) ?? OUTFITS[0];
  view.setLook(skin, outfit);
}

/** Copies text (or opens the share sheet on phones); resolves with what happened. */
export async function shareText(text: string, url?: string): Promise<string> {
  try {
    if (navigator.share && TOUCH) {
      await navigator.share({ text, url });
      return t('share.shared');
    }
    await navigator.clipboard.writeText(url ? `${text} ${url}` : text);
    return t('share.copied');
  } catch {
    return t('share.failed');
  }
}

// Dev only: the view, for checking animations from the browser console.
if (import.meta.env.DEV) (window as unknown as { __view: View }).__view = view;
