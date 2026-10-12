import { LEVELS } from '../levels/levels';
import { SOLUTIONS } from '../levels/solutions';
import { WORLDS } from '../levels/worlds';
import type { DailyProgress } from './dailyProgress';
import type { Progress } from './progress';
import { KEYS, readJSON, writeJSON } from './storage';

/**
 * Achievements, worked out from progress (so they can't drift from it), and the cosmetics
 * they unlock: crate skins and the pusher's outfits. Once earned, an achievement stays
 * (its id is stored), even if the levels change.
 */
export interface Skin {
  id: string;
  name: string;
  crate: number;
  trim: number;
}
export interface Outfit {
  id: string;
  name: string;
  cap: number;
  suit: number;
}

export const SKINS: Skin[] = [
  { id: 'world', name: 'World wood', crate: -1, trim: -1 },
  { id: 'frost', name: 'Frost', crate: 0xbfe6ff, trim: 0x5f8fb8 },
  { id: 'iron', name: 'Ironclad', crate: 0x9aa3ad, trim: 0x4d545c },
  { id: 'gem', name: 'Gemstone', crate: 0xb48cff, trim: 0x5a3fa0 },
  { id: 'candy', name: 'Candy', crate: 0xff9ec7, trim: 0xffffff },
  { id: 'gold', name: 'Gold', crate: 0xffcf4d, trim: 0xb07a12 },
  { id: 'royal', name: 'Royal', crate: 0x3f4fd0, trim: 0xffcf4d },
];

export const OUTFITS: Outfit[] = [
  { id: 'red', name: 'Red cap', cap: 0xe0433a, suit: 0x2f6fd0 },
  { id: 'meadow', name: 'Gardener', cap: 0x4fae4a, suit: 0x8a5a35 },
  { id: 'explorer', name: 'Explorer', cap: 0xd9b27a, suit: 0x6f8a4a },
  { id: 'aviator', name: 'Aviator', cap: 0x8a5a35, suit: 0xb9a3d9 },
  { id: 'brass', name: 'Clockmaker', cap: 0xb8893a, suit: 0x3b2f4a },
  { id: 'blue', name: 'Sharpshooter', cap: 0x2f8fe0, suit: 0x1f3f6a },
  { id: 'purple', name: 'Steady', cap: 0x8d5fd6, suit: 0x3a2a5a },
  { id: 'hardhat', name: 'Architect', cap: 0xffc23d, suit: 0xe8763a },
];

export interface Ctx {
  progress: Progress;
  daily: DailyProgress;
  /** A level made in the workshop was solved. */
  built: boolean;
}

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  reward?: { skin?: string; outfit?: string };
  /** How far along (done when value >= goal). */
  count: (c: Ctx) => number;
  goal: number;
}

const solved = (c: Ctx, ids: string[]) => ids.filter((id) => (c.progress[id]?.stars ?? 0) > 0).length;
const ids = (world?: string) => LEVELS.filter((l) => !world || l.world === world).map((l) => l.id);
const REWARD: Record<string, Achievement['reward']> = {
  meadow: { outfit: 'meadow' },
  tundra: { skin: 'frost' },
  desert: { outfit: 'explorer' },
  sky: { outfit: 'aviator' },
  forge: { skin: 'iron' },
  crystal: { skin: 'gem' },
  clockwork: { outfit: 'brass' },
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Push', desc: 'Solve a level.', count: (c) => Math.min(1, solved(c, ids())), goal: 1 },
  ...WORLDS.filter((w) => ids(w.id).length > 0).map(
    (w): Achievement => ({ id: `world-${w.id}`, name: `${w.name} cleared`, desc: `Solve every level in ${w.name}.`, reward: REWARD[w.id], count: (c) => solved(c, ids(w.id)), goal: ids(w.id).length }),
  ),
  { id: 'par', name: 'Sharp', desc: 'Match the par on 10 levels.', reward: { outfit: 'blue' }, count: (c) => LEVELS.filter((l) => (c.progress[l.id]?.moves ?? 0) > 0 && c.progress[l.id].moves <= (SOLUTIONS[l.id]?.length ?? 0)).length, goal: 10 },
  { id: 'clean', name: 'Steady Hands', desc: 'Solve 10 levels without undo or restart.', reward: { outfit: 'purple' }, count: (c) => LEVELS.filter((l) => c.progress[l.id]?.clean).length, goal: 10 },
  { id: 'daily', name: 'Daily Visitor', desc: 'Solve a daily puzzle.', count: (c) => Math.min(1, Object.keys(c.daily.results).length), goal: 1 },
  { id: 'streak', name: 'Week of Puzzles', desc: 'Solve the daily puzzle 7 days in a row.', reward: { skin: 'candy' }, count: (c) => c.daily.best, goal: 7 },
  { id: 'architect', name: 'Architect', desc: 'Build a level in the workshop and solve it.', reward: { outfit: 'hardhat' }, count: (c) => (c.built ? 1 : 0), goal: 1 },
  { id: 'champion', name: 'Cratelands Champion', desc: 'Solve every level.', reward: { skin: 'royal' }, count: (c) => solved(c, ids()), goal: ids().length },
  { id: 'perfect', name: 'Perfectionist', desc: 'Three stars on every level.', reward: { skin: 'gold' }, count: (c) => LEVELS.filter((l) => (c.progress[l.id]?.stars ?? 0) >= 3).length, goal: ids().length },
];

interface Stored {
  earned: string[];
  built?: boolean;
}
const load = () => {
  const s = readJSON<Partial<Stored>>(KEYS.achievements, {});
  return { earned: Array.isArray(s.earned) ? s.earned : [], built: !!s.built };
};

export const earned = () => new Set(load().earned);
export const builtOne = () => load().built;

/** Notes a solved workshop level. */
export function markBuilt() {
  const s = load();
  s.built = true;
  writeJSON(KEYS.achievements, s);
}

/** Checks every achievement; stores and returns the ones earned just now. */
export function checkAchievements(ctx: Omit<Ctx, 'built'>): Achievement[] {
  const s = load();
  const full: Ctx = { ...ctx, built: s.built };
  const fresh = ACHIEVEMENTS.filter((a) => !s.earned.includes(a.id) && a.count(full) >= a.goal);
  if (fresh.length) writeJSON(KEYS.achievements, { ...s, earned: [...s.earned, ...fresh.map((a) => a.id)] });
  return fresh;
}

/** The cosmetics the player may wear: the defaults plus every earned reward. */
export function unlockedCosmetics(have = earned()) {
  const skins = new Set(['world']);
  const outfits = new Set(['red']);
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.id) || !a.reward) continue;
    if (a.reward.skin) skins.add(a.reward.skin);
    if (a.reward.outfit) outfits.add(a.reward.outfit);
  }
  return { skins, outfits };
}
