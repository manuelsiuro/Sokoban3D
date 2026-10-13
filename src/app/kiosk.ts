import type { LevelDef } from '../levels/types';
import { LEVELS } from '../levels/levels';
import { WORLDS } from '../levels/worlds';
import { PLANET } from '../levels/worlds/planet';
import { screen, showLevel, view } from './context';

/**
 * Behind the title screen, a showcase: every few seconds the island sinks and one from the
 * next world rises, so the menu shows off each biome in turn (a kiosk loop). The first island
 * is the level the player would play next; Play shows its own level anyway (play() does).
 *
 * It waits while a dialog is over the title or the page is hidden, and stops for good the
 * moment the title closes (a swap already under way is dropped).
 */

/** One island per world, picked for its looks: a later level, with more of the world in it. */
const SHOWCASE: LevelDef[] = WORLDS.map((w) => {
  const own = LEVELS.filter((l) => l.world === w.id);
  return own[Math.min(own.length - 1, 6)];
}).filter(Boolean);
// And a little planet among them (the Planets mode), seen whole.
SHOWCASE.splice(4, 0, PLANET[5]);

const HOLD = 9000;
/** With reduced motion: a plain swap, less often. */
const HOLD_CALM = 16000;

export interface Kiosk {
  stop(): void;
}

/**
 * Starts the loop from the island on screen. `onShow` is told each new level (for a caption).
 */
export function startKiosk(onShow: (level: LevelDef) => void): Kiosk {
  let stopped = false;
  let timer = 0;
  // The loop goes on from the world of the island already shown.
  const shownWorld = screen.sim.level.world;
  let k = Math.max(0, SHOWCASE.findIndex((l) => l.world === shownWorld));
  onShow(screen.sim.level);

  /** The island coming next while the old one sinks. */
  let sinking: LevelDef | null = null;
  const arrive = (level: LevelDef) => {
    sinking = null;
    showLevel(level, { music: false });
    view.idle = true;
    view.overview = !!level.planet;
    view.intro();
    onShow(level);
  };
  const busy = () => document.hidden || !!document.querySelector('.modal');
  const schedule = (ms: number) => {
    clearTimeout(timer);
    if (!stopped) timer = window.setTimeout(tick, ms);
  };
  const tick = async () => {
    if (stopped) return;
    // Something over the title, or nobody looking: try again a little later.
    if (busy()) return schedule(2000);
    k = (k + 1) % SHOWCASE.length;
    const level = SHOWCASE[k];
    sinking = level;
    await view.leave();
    // The title closed while the island sank: stop() has already brought the new one in.
    if (stopped || sinking !== level) return;
    arrive(level);
    schedule(view.reducedMotion ? HOLD_CALM : HOLD);
  };
  schedule(view.reducedMotion ? HOLD_CALM : HOLD);
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      // Never leave the island sunk (a dialog over the title would show an empty sky).
      if (sinking) arrive(sinking);
    },
  };
}
