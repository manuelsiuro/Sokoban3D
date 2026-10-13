/**
 * How each world looks: sky, ground, walls, crates and decor. Visual only: the rules never
 * read a biome. A new world is mostly a new entry here (and its mechanic in the sim).
 */
export type DecorKind = 'tree' | 'bush' | 'flower' | 'rock' | 'pine' | 'snowRock' | 'cactus' | 'pillar' | 'cloud' | 'basalt' | 'ember' | 'crystal' | 'gear' | 'lamp' | 'mushroom' | 'grass';

/** What drifts around the island: clouds, ash and embers, glowing motes, snow, gears. */
export interface Atmosphere {
  /** Clouds around and below (top and belly colors), or none. */
  clouds?: { top: number; belly: number; count: number };
  /** Small particles: snow falls, embers and motes rise. */
  motes?: { color: number; count: number; rise: number; size: number; glow: boolean };
  /** Big slow things in the distance. */
  far?: 'gears' | 'shards' | 'islands';
}

export interface Biome {
  skyTop: number;
  skyBottom: number;
  fog: number;
  /** Top of the floor tiles, and a second shade for the checker. */
  ground: number;
  ground2: number;
  /** Sides of the island and the floor columns. */
  soil: number;
  /** The rock under the island. */
  rock: number;
  /** Grass, sand or snow overhanging the island's outer edge (none on stone floors). */
  lip?: number;
  /** Walls: style and colors. */
  wall: 'hedge' | 'stone' | 'ice' | 'sandstone' | 'cloud' | 'basalt' | 'crystal' | 'brass';
  wallColor: number;
  wallTop: number;
  crate: number;
  crateTrim: number;
  goal: number;
  sun: number;
  sunIntensity: number;
  ambient: number;
  decor: DecorKind[];
  air: Atmosphere;
}

export const BIOMES: Record<string, Biome> = {
  meadow: {
    skyTop: 0x6ec3f0, skyBottom: 0xdff3f7, fog: 0xd6eef4,
    ground: 0x8fd16a, ground2: 0x84c75f, soil: 0x9c6b43, rock: 0x7d6a5e, lip: 0x7cc25a,
    wall: 'hedge', wallColor: 0x4f9e48, wallTop: 0x63b956,
    crate: 0xd29a55, crateTrim: 0x8c5a2b, goal: 0xffd447,
    sun: 0xfff1d6, sunIntensity: 2.4, ambient: 1.25,
    decor: ['tree', 'tree', 'bush', 'flower', 'flower', 'flower', 'grass', 'grass', 'rock', 'mushroom'],
    air: { clouds: { top: 0xffffff, belly: 0xc6d8ea, count: 9 }, motes: { color: 0xfff6c8, count: 40, rise: 0.08, size: 0.07, glow: false }, far: 'islands' },
  },
  tundra: {
    skyTop: 0x8fb4e0, skyBottom: 0xeef4fb, fog: 0xe6eef8,
    ground: 0xf2f7fc, ground2: 0xe5eef7, soil: 0x8aa0b8, rock: 0x6f8296, lip: 0xf7fbff,
    wall: 'ice', wallColor: 0x8cc6ec, wallTop: 0xf7fbff,
    crate: 0xc98f54, crateTrim: 0x7d4f27, goal: 0x5fe3ff,
    sun: 0xf2f6ff, sunIntensity: 2.2, ambient: 1.4,
    decor: ['pine', 'pine', 'pine', 'snowRock', 'snowRock'],
    air: { clouds: { top: 0xffffff, belly: 0xbccbe0, count: 8 }, motes: { color: 0xffffff, count: 260, rise: -0.6, size: 0.09, glow: false }, far: 'islands' },
  },
  desert: {
    skyTop: 0xf2b66d, skyBottom: 0xfbe6c4, fog: 0xf7dfba,
    ground: 0xf0cf8e, ground2: 0xe8c47f, soil: 0xc58a4f, rock: 0xa0673c, lip: 0xe6c17c,
    wall: 'sandstone', wallColor: 0xc4834a, wallTop: 0xd89d5c,
    crate: 0xb77b45, crateTrim: 0x6f4421, goal: 0x3fd0c9,
    sun: 0xffe2b0, sunIntensity: 2.6, ambient: 1.15,
    decor: ['cactus', 'cactus', 'pillar', 'rock', 'grass'],
    air: { clouds: { top: 0xfff8ea, belly: 0xf0c99a, count: 5 }, motes: { color: 0xffe2a8, count: 60, rise: 0.05, size: 0.06, glow: false }, far: 'islands' },
  },
  sky: {
    skyTop: 0x7aa6ff, skyBottom: 0xf3e7ff, fog: 0xece6ff,
    ground: 0xa6e3a0, ground2: 0x98d892, soil: 0xb9a3d9, rock: 0x9c8ac2, lip: 0x8fd68a,
    wall: 'cloud', wallColor: 0xf4f2ff, wallTop: 0xffffff,
    crate: 0xe0b06a, crateTrim: 0x94652f, goal: 0xff8fd0,
    sun: 0xfff3e6, sunIntensity: 2.2, ambient: 1.35,
    decor: ['cloud', 'cloud', 'tree', 'bush', 'flower', 'flower'],
    air: { clouds: { top: 0xffffff, belly: 0xd9cdf2, count: 14 }, motes: { color: 0xffffff, count: 40, rise: 0.1, size: 0.07, glow: true }, far: 'islands' },
  },
  forge: {
    skyTop: 0x2a1a2e, skyBottom: 0x7a3326, fog: 0x4a2622,
    ground: 0x8d8494, ground2: 0x857c8c, soil: 0x3b3238, rock: 0x2c2429,
    wall: 'basalt', wallColor: 0x2a252e, wallTop: 0x3a3340,
    crate: 0x9b6f4a, crateTrim: 0x4a4d55, goal: 0xff9a3d,
    sun: 0xffb27a, sunIntensity: 2.0, ambient: 0.9,
    decor: ['basalt', 'basalt', 'ember', 'ember', 'rock'],
    air: { clouds: { top: 0x5a4a4e, belly: 0x2a1e22, count: 7 }, motes: { color: 0xff8a2a, count: 140, rise: 0.7, size: 0.08, glow: true } },
  },
  crystal: {
    skyTop: 0x1b1f4a, skyBottom: 0x4a3d86, fog: 0x332c66,
    ground: 0x6f6aa8, ground2: 0x66619e, soil: 0x403a78, rock: 0x2f2a5e,
    wall: 'crystal', wallColor: 0x6d5bd0, wallTop: 0x9b8cf2,
    crate: 0xc9a46b, crateTrim: 0x7a5a30, goal: 0x7dffd6,
    sun: 0xcfd8ff, sunIntensity: 1.8, ambient: 1.0,
    decor: ['crystal', 'crystal', 'crystal', 'mushroom', 'rock'],
    air: { motes: { color: 0x9bf0ff, count: 120, rise: 0.12, size: 0.08, glow: true }, far: 'shards' },
  },
  clockwork: {
    skyTop: 0x3b5470, skyBottom: 0xd9c49a, fog: 0xc9b58c,
    ground: 0xbfae8c, ground2: 0xb3a27f, soil: 0x7a6146, rock: 0x5e4a36,
    wall: 'brass', wallColor: 0x4a3f38, wallTop: 0x6b5d50,
    crate: 0x8c6a4a, crateTrim: 0x4f3a26, goal: 0xff8f5a,
    sun: 0xffe9c4, sunIntensity: 2.2, ambient: 1.1,
    decor: ['gear', 'gear', 'lamp', 'lamp', 'pillar'],
    air: { clouds: { top: 0xfff1d8, belly: 0xc9a98a, count: 7 }, motes: { color: 0xffd98a, count: 40, rise: 0.06, size: 0.06, glow: true }, far: 'gears' },
  },
  reverse: {
    skyTop: 0x3d2f6e, skyBottom: 0xf2a6b8, fog: 0xd9a0b8,
    ground: 0x9ed8c4, ground2: 0x93cfba, soil: 0x7a5a8c, rock: 0x5e4a72, lip: 0x86c9b2,
    wall: 'hedge', wallColor: 0x7a5fb0, wallTop: 0x9a80d0,
    crate: 0xd8a868, crateTrim: 0x7a5432, goal: 0xff8fd0,
    sun: 0xffd2c2, sunIntensity: 2.0, ambient: 1.2,
    decor: ['tree', 'bush', 'flower', 'flower', 'mushroom', 'grass'],
    air: { clouds: { top: 0xffe0ec, belly: 0xb88ab8, count: 8 }, motes: { color: 0xffc2e8, count: 90, rise: 0.1, size: 0.08, glow: true }, far: 'islands' },
  },
};

export const biomeOf = (world: string) => BIOMES[world] ?? BIOMES.meadow;
