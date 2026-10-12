/** Save migrations and crash-safe storage, against an in-memory localStorage. */
import { check } from './assert';

const mem = new Map<string, string>();
let blocked = false;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => {
    if (blocked) throw new Error('SecurityError');
    return mem.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error('QuotaExceededError');
    mem.set(k, String(v));
  },
  removeItem: (k: string) => void mem.delete(k),
};

const { KEYS, SAVE_VERSION, migrateStorage, readJSON } = await import('../src/game/storage');
const { saveResult, loadProgress, isUnlocked, nextLevel } = await import('../src/game/progress');

migrateStorage();
check(mem.get(KEYS.version) === String(SAVE_VERSION), 'version is stamped');
// A save from a newer build is left alone.
mem.set(KEYS.version, String(SAVE_VERSION + 5));
check(migrateStorage() === SAVE_VERSION + 5, 'newer saves are not migrated');
mem.set(KEYS.version, String(SAVE_VERSION));

// Records keep the best of each.
saveResult('meadow-1', 3, 3, false);
saveResult('meadow-2', 2, 9, true);
saveResult('meadow-2', 1, 7, false);
const p = loadProgress()['meadow-2'];
check(p?.stars === 2 && p?.moves === 7 && p?.clean === true, 'best stars, fewest moves and the clean badge are kept');
check(isUnlocked(2) && !isUnlocked(3), 'a solve opens the next level');
check(nextLevel() === 2, 'Play leads to the first open level not solved');

// The best run (for the ghost) follows the fewest moves.
saveResult('meadow-4', 2, 9, false, 'rrrrddddl');
saveResult('meadow-4', 3, 6, false, 'rDDurD');
saveResult('meadow-4', 2, 8, false, 'rrrrdddd');
check(loadProgress()['meadow-4']?.run === 'rDDurD', 'the ghost run is the fewest-moves one');

// Blocked storage: nothing throws, reads fall back.
blocked = true;
check(readJSON(KEYS.progress, { ok: true }).ok === true, 'blocked storage falls back');
check(saveResult('meadow-3', 3, 6, true) === true, 'saving with blocked storage does not throw');
blocked = false;
// Garbage in storage falls back to the right shape.
mem.set(KEYS.progress, '[1,2,3]');
check(Object.keys(loadProgress()).length === 0, 'a wrong shape falls back to {}');
// The daily streak: days in a row count, a gap starts over, the best is kept.
const { saveDaily, currentStreak, loadDaily } = await import('../src/game/dailyProgress');
check(saveDaily('2026-10-10', 2, 30) === 1 && saveDaily('2026-10-11', 3, 25) === 2, 'consecutive days grow the streak');
check(saveDaily('2026-10-11', 1, 40) === 2 && loadDaily().results['2026-10-11'].stars === 3, 'a second solve the same day keeps the best');
check(currentStreak('2026-10-12') === 2 && currentStreak('2026-10-14') === 0, 'the streak lasts until a whole day is missed');
check(saveDaily('2026-10-14', 3, 20) === 1 && loadDaily().best === 2, 'a gap starts over, the best streak stays');

// Achievements are earned from progress and stay earned.
const { checkAchievements, earned } = await import('../src/game/achievements');
const fresh = checkAchievements({ progress: { 'meadow-1': { stars: 3, moves: 3 } }, daily: loadDaily() });
check(fresh.some((a) => a.id === 'first') && fresh.some((a) => a.id === 'daily'), 'first solve and first daily are earned');
check(checkAchievements({ progress: {}, daily: loadDaily() }).length === 0 && earned().has('first'), 'earned achievements stay earned');
console.log('storage ok, version', SAVE_VERSION);
