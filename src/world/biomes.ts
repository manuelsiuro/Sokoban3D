/**
 * How each world looks: sky, ground, walls, crates and decor. Visual only: the rules never
 * read a biome. A new world is mostly a new entry here (and its mechanic in the sim).
 */
export type DecorKind = 'tree' | 'flower' | 'rock' | 'pine' | 'snowRock' | 'cactus' | 'pillar' | 'cloud' | 'basalt' | 'crystal' | 'gear';

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
}

export const BIOMES: Record<string, Biome> = {
  meadow: {
    skyTop: 0x6ec3f0, skyBottom: 0xdff3f7, fog: 0xd6eef4,
    ground: 0x8fd16a, ground2: 0x84c75f, soil: 0x9c6b43, rock: 0x7d6a5e,
    wall: 'hedge', wallColor: 0x4f9e48, wallTop: 0x63b956,
    crate: 0xd29a55, crateTrim: 0x8c5a2b, goal: 0xffd447,
    sun: 0xfff1d6, sunIntensity: 2.4, ambient: 1.25,
    decor: ['tree', 'tree', 'flower', 'flower', 'flower', 'rock'],
  },
  tundra: {
    skyTop: 0x8fb4e0, skyBottom: 0xeef4fb, fog: 0xe6eef8,
    ground: 0xf2f7fc, ground2: 0xe5eef7, soil: 0x8aa0b8, rock: 0x6f8296,
    wall: 'ice', wallColor: 0x6f86a3, wallTop: 0xf7fbff,
    crate: 0xc98f54, crateTrim: 0x7d4f27, goal: 0x5fe3ff,
    sun: 0xf2f6ff, sunIntensity: 2.2, ambient: 1.4,
    decor: ['pine', 'pine', 'snowRock'],
  },
  desert: {
    skyTop: 0xf2b66d, skyBottom: 0xfbe6c4, fog: 0xf7dfba,
    ground: 0xf0cf8e, ground2: 0xe8c47f, soil: 0xc58a4f, rock: 0xa0673c,
    wall: 'sandstone', wallColor: 0xc4834a, wallTop: 0xd89d5c,
    crate: 0xb77b45, crateTrim: 0x6f4421, goal: 0x3fd0c9,
    sun: 0xffe2b0, sunIntensity: 2.6, ambient: 1.15,
    decor: ['cactus', 'cactus', 'pillar', 'rock'],
  },
  sky: {
    skyTop: 0x7aa6ff, skyBottom: 0xf3e7ff, fog: 0xece6ff,
    ground: 0xa6e3a0, ground2: 0x98d892, soil: 0xb9a3d9, rock: 0x9c8ac2,
    wall: 'cloud', wallColor: 0xf4f2ff, wallTop: 0xffffff,
    crate: 0xe0b06a, crateTrim: 0x94652f, goal: 0xff8fd0,
    sun: 0xfff3e6, sunIntensity: 2.2, ambient: 1.35,
    decor: ['cloud', 'tree', 'flower'],
  },
  forge: {
    skyTop: 0x2a1a2e, skyBottom: 0x7a3326, fog: 0x4a2622,
    ground: 0x8d8494, ground2: 0x857c8c, soil: 0x3b3238, rock: 0x2c2429,
    wall: 'basalt', wallColor: 0x2a252e, wallTop: 0x3a3340,
    crate: 0x9a9fa8, crateTrim: 0x5d6168, goal: 0xff9a3d,
    sun: 0xffb27a, sunIntensity: 2.0, ambient: 0.9,
    decor: ['basalt', 'basalt', 'rock'],
  },
  crystal: {
    skyTop: 0x1b1f4a, skyBottom: 0x4a3d86, fog: 0x332c66,
    ground: 0x6f6aa8, ground2: 0x66619e, soil: 0x403a78, rock: 0x2f2a5e,
    wall: 'crystal', wallColor: 0x6d5bd0, wallTop: 0x9b8cf2,
    crate: 0xc9a46b, crateTrim: 0x7a5a30, goal: 0x7dffd6,
    sun: 0xcfd8ff, sunIntensity: 1.8, ambient: 1.0,
    decor: ['crystal', 'crystal', 'rock'],
  },
  clockwork: {
    skyTop: 0x3b5470, skyBottom: 0xd9c49a, fog: 0xc9b58c,
    ground: 0xbfae8c, ground2: 0xb3a27f, soil: 0x7a6146, rock: 0x5e4a36,
    wall: 'brass', wallColor: 0x4a3f38, wallTop: 0x6b5d50,
    crate: 0x8c6a4a, crateTrim: 0x4f3a26, goal: 0xff8f5a,
    sun: 0xffe9c4, sunIntensity: 2.2, ambient: 1.1,
    decor: ['gear', 'gear', 'pillar'],
  },
};

export const biomeOf = (world: string) => BIOMES[world] ?? BIOMES.meadow;
