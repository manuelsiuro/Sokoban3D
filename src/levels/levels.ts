import type { LevelDef } from './types';
import { MEADOW } from './worlds/meadow';
import { TUNDRA } from './worlds/tundra';
import { DESERT } from './worlds/desert';

/** Every level, in play order: worlds one after another (see worlds.ts). */
export const LEVELS: LevelDef[] = [...MEADOW, ...TUNDRA, ...DESERT];
