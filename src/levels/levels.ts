import type { LevelDef } from './types';
import { MEADOW } from './worlds/meadow';

/** Every level, in play order: worlds one after another (see worlds.ts). */
export const LEVELS: LevelDef[] = [...MEADOW];
