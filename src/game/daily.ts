import type { LevelDef } from '../levels/types';
import { propose } from '../sim/generator';

/**
 * The daily puzzle: generated from the date, the same for everyone. Each weekday has its
 * world's mechanic (Sunday classic, Monday ice, …), and the room is the generator's best
 * whose par lands in a fair window. Generated in a worker (it takes a moment).
 *
 * The puzzle depends on the generator, the solver and the rules: changing any of them
 * changes the dailies (scripts/dailytest.ts shows it). Avoid that while players have a streak.
 */
const RECIPES: { world: string; name: string; gen: Record<string, number> }[] = [
  { world: 'meadow', name: 'Sunday Meadow', gen: { crates: 3, w: 6, h: 6 } },
  { world: 'tundra', name: 'Monday Ice', gen: { crates: 2, w: 6, h: 6, ice: 0.35 } },
  { world: 'desert', name: 'Tuesday Sands', gen: { crates: 2, w: 6, h: 6, pits: 1, doors: 1 } },
  { world: 'sky', name: 'Wednesday Heights', gen: { crates: 2, w: 6, h: 6, terraces: 2, walls: 0.1 } },
  { world: 'forge', name: 'Thursday Forge', gen: { crates: 2, w: 6, h: 6, conveyors: 3, lava: 1 } },
  { world: 'crystal', name: 'Friday Colors', gen: { crates: 3, w: 6, h: 6, colors: 3 } },
  { world: 'clockwork', name: 'Saturday Clockwork', gen: { crates: 2, w: 6, h: 6, gates: 2, teleports: 1 } },
];

export interface Daily {
  date: string;
  level: LevelDef;
  par: number;
  solution: string;
}

/** Today's date as YYYY-MM-DD, in the player's own time zone. */
export function today(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** Days since 1970-01-01 for a YYYY-MM-DD date (no time zones involved). */
export const dayNumber = (date: string) => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);

export function dailyPuzzle(date: string): Daily {
  const day = dayNumber(date);
  const weekday = (day + 4) % 7; // 1970-01-01 was a Thursday
  for (const recipe of [RECIPES[weekday], RECIPES[0]]) {
    for (let round = 0; round < 4; round++) {
      const cands = propose({ tries: 160, states: 150000, ...recipe.gen, seed: day * 16 + round });
      const pick = cands.find((c) => c.par >= 20 && c.par <= 60) ?? (round === 3 ? cands[0] : undefined);
      if (!pick) continue;
      return {
        date,
        par: pick.par,
        solution: pick.solution,
        level: { ...pick.level, id: `daily-${date}`, name: recipe.name, world: recipe.world, difficulty: 3, tip: `The daily puzzle for ${date}: the same for everyone, par ${pick.par}.` },
      };
    }
  }
  throw new Error(`no daily puzzle for ${date}`);
}
