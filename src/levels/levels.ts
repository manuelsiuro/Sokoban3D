import type { LevelDef } from './types';
import { MEADOW } from './worlds/meadow';
import { TUNDRA } from './worlds/tundra';
import { DESERT } from './worlds/desert';
import { SKY } from './worlds/sky';
import { FORGE } from './worlds/forge';
import { CRYSTAL } from './worlds/crystal';

/** Every level, in play order: worlds one after another (see worlds.ts). */
export const LEVELS: LevelDef[] = [...MEADOW, ...TUNDRA, ...DESERT, ...SKY, ...FORGE, ...CRYSTAL];
