import type { LevelDef } from '../levels/types';
import { Sim } from '../sim/Sim';

/** Where the player stood after each move of a run (index 0: the start). */
export interface GhostStep {
  cell: number;
  z: number;
  facing: number;
}

/**
 * The path of a recorded run (LURD), replayed through the real rules: the rules are
 * deterministic, so the ghost walks exactly where the run went. Stops at the first move
 * the level no longer allows (a run recorded before the level changed).
 */
export function ghostPath(level: LevelDef, run: string): GhostStep[] {
  const sim = new Sim(level);
  const at = () => {
    const s = sim.state;
    return { cell: s.cell, z: s.z, facing: s.facing };
  };
  const path = [at()];
  for (const c of run) {
    if (sim.play(c) === 0) break;
    path.push(at());
  }
  return path;
}

/** Whether a recorded run still solves the level (only those are shown as ghosts). */
export function runSolves(level: LevelDef, run: string) {
  const sim = new Sim(level);
  return sim.play(run) === run.length && sim.state.solved;
}
