/**
 * Each generated world as ten slots: the mechanics and room size the generator uses, the
 * par window the chosen room must fall in, its difficulty, name and tip. The first slots
 * teach the world's mechanic alone, the middle ones combine it, the last is a showpiece.
 */
export interface Slot {
  name: string;
  tip: string;
  difficulty: number;
  /** Fewest and most moves allowed for the room's par. */
  par: [number, number];
  gen: Record<string, number>;
  rounds?: number;
}

export const SPECS: Record<string, { about: string; slots: Slot[] }> = {
  tundra: {
    about: 'World 2, Frozen Tundra: ice. Crates and the player slide until something stops them.',
    slots: [
      { name: 'Black Ice', difficulty: 1, par: [5, 12], gen: { crates: 1, w: 5, h: 4, ice: 0.4 }, tip: 'Ice! A pushed crate slides until something stops it. So do you.' },
      { name: 'Skating Rink', difficulty: 1, par: [8, 18], gen: { crates: 1, w: 6, h: 5, ice: 0.45 }, tip: 'A slide never stops halfway: look for something to stop against.' },
      { name: 'Snowdrift', difficulty: 2, par: [10, 22], gen: { crates: 2, w: 5, h: 5, ice: 0.3 }, tip: 'A crate standing on snow makes a good stopper.' },
      { name: 'Frozen Pond', difficulty: 2, par: [14, 28], gen: { crates: 2, w: 6, h: 5, ice: 0.4 }, tip: 'A crate sliding off the ice stops on the first snowy cell.' },
      { name: 'Icicle Hall', difficulty: 3, par: [20, 36], gen: { crates: 2, w: 6, h: 6, ice: 0.35 }, tip: 'Know where you will stop before you step onto the ice.' },
      { name: 'Glacier Steps', difficulty: 3, par: [22, 40], gen: { crates: 3, w: 6, h: 5, ice: 0.3 }, tip: 'Use one crate to stop the next.' },
      { name: 'Polar Night', difficulty: 3, par: [30, 50], gen: { crates: 3, w: 6, h: 6, ice: 0.3 }, tip: 'Sometimes the long way round is the only way.' },
      { name: 'Avalanche', difficulty: 4, par: [36, 60], gen: { crates: 3, w: 7, h: 6, ice: 0.35 }, tip: 'Three crates and a slippery floor. Turn the camera (Q/E) to read the ice.' },
      { name: 'Permafrost', difficulty: 4, par: [45, 75], gen: { crates: 3, w: 7, h: 6, ice: 0.3 }, tip: 'A crate in an icy corner is stuck there for good.' },
      { name: 'The Ice Palace', difficulty: 5, par: [55, 110], gen: { crates: 4, w: 7, h: 7, ice: 0.3, states: 1500000 }, tip: 'The palace: every trick of the ice at once.' },
    ],
  },
  desert: {
    about: 'World 3, Desert Ruins: sand pits a crate fills, pressure plates that hold doors open.',
    slots: [
      { name: 'Sinkhole', difficulty: 1, par: [5, 14], gen: { crates: 1, pits: 1, w: 5, h: 4 }, tip: 'Sand pits swallow a crate, and a filled pit is floor again.' },
      { name: 'Pressure Plate', difficulty: 1, par: [6, 18], gen: { crates: 1, doors: 1, w: 5, h: 5 }, tip: 'A crate on the plate holds its door open. So do you, while you stand on it.' },
      { name: 'Dune Crossing', difficulty: 2, par: [12, 26], gen: { crates: 2, pits: 1, w: 6, h: 5 }, tip: 'Fill the pit, or find a way round it?' },
      { name: 'Temple Gate', difficulty: 2, par: [14, 30], gen: { crates: 2, doors: 1, w: 6, h: 5 }, tip: 'The door shuts as soon as nothing holds the plate.' },
      { name: 'Quicksand', difficulty: 3, par: [18, 36], gen: { crates: 2, pits: 2, w: 6, h: 5 }, tip: 'Two pits to fill: choose which crates to give up.' },
      { name: 'Buried Door', difficulty: 3, par: [22, 42], gen: { crates: 2, doors: 1, pits: 1, w: 6, h: 6 }, tip: 'Pits and plates together.' },
      { name: 'Twin Seals', difficulty: 3, par: [24, 48], gen: { crates: 2, doors: 2, w: 7, h: 6 }, tip: 'Each plate opens the door of its color.' },
      { name: 'Sphinx', difficulty: 4, par: [30, 58], gen: { crates: 3, pits: 1, doors: 1, w: 7, h: 6 }, tip: 'The riddle: which crate goes in the pit?' },
      { name: 'Lost Oasis', difficulty: 4, par: [38, 72], gen: { crates: 3, pits: 2, w: 7, h: 6 }, tip: 'Bridge the sand, then bring the crates home.' },
      { name: 'The Sun Temple', difficulty: 5, par: [45, 110], gen: { crates: 3, pits: 2, doors: 1, w: 7, h: 7, states: 1500000 }, tip: 'Sand, stone and the temple doors.' },
    ],
  },
  sky: {
    about: 'World 4, Sky Islands: heights. Climb one level, push crates off ledges, use them as steps.',
    slots: [
      { name: 'Step Up', difficulty: 1, par: [5, 14], gen: { crates: 1, terraces: 1, w: 5, h: 4, walls: 0.1 }, tip: 'You can step up or down one level. Crates only go down.' },
      { name: 'Ledge Drop', difficulty: 1, par: [8, 18], gen: { crates: 1, terraces: 1, w: 6, h: 5, walls: 0.1 }, tip: 'Push a crate off a ledge and it drops to the level below.' },
      { name: 'Stepping Stone', difficulty: 2, par: [12, 26], gen: { crates: 2, terraces: 1, w: 6, h: 5, walls: 0.12 }, tip: 'A crate one level below you is floor: walk across it.' },
      { name: 'Cloud Hop', difficulty: 2, par: [14, 30], gen: { crates: 2, terraces: 2, holes: 1, w: 6, h: 5, walls: 0.1 }, tip: 'Mind the gaps: a crate pushed into the sky is gone (undo!).' },
      { name: 'Terrace Garden', difficulty: 3, par: [20, 38], gen: { crates: 2, terraces: 2, w: 6, h: 6, walls: 0.1 }, tip: 'Turn the camera (Q/E) to see the steps clearly.' },
      { name: 'Windy Heights', difficulty: 3, par: [24, 44], gen: { crates: 3, terraces: 1, w: 6, h: 6, walls: 0.1 }, tip: 'A crate can’t be pushed up. Bring it down from above.' },
      { name: 'Floating Market', difficulty: 3, par: [28, 52], gen: { crates: 3, terraces: 2, holes: 1, w: 7, h: 6, walls: 0.1 }, tip: 'Three crates, two levels, one hole in the floor.' },
      { name: 'Stairway', difficulty: 4, par: [34, 60], gen: { crates: 3, terraces: 2, w: 7, h: 6, walls: 0.1 }, tip: 'Stacked crates are too heavy to push.' },
      { name: 'Sky Bridge', difficulty: 4, par: [40, 72], gen: { crates: 3, terraces: 3, holes: 2, w: 7, h: 6, walls: 0.08 }, tip: 'High ground, low ground and open sky.' },
      { name: 'Castle in the Clouds', difficulty: 5, par: [45, 110], gen: { crates: 3, terraces: 3, w: 7, h: 7, walls: 0.1, states: 1500000 }, tip: 'Every height trick at once.' },
    ],
  },
  forge: {
    about: 'World 5, Volcanic Forge: conveyors carry things after every move; lava swallows crates.',
    slots: [
      { name: 'Hot Belt', difficulty: 1, par: [5, 14], gen: { crates: 1, conveyors: 2, w: 5, h: 4 }, tip: 'Conveyors move whatever stands on them, after each of your moves.' },
      { name: 'Into the Fire', difficulty: 1, par: [6, 16], gen: { crates: 1, lava: 1, w: 5, h: 5 }, tip: 'Lava swallows a crate and cools into stone you can cross.' },
      { name: 'Assembly Line', difficulty: 2, par: [12, 26], gen: { crates: 2, conveyors: 3, w: 6, h: 5 }, tip: 'Let the belts do some of the pushing.' },
      { name: 'Molten Moat', difficulty: 2, par: [14, 30], gen: { crates: 2, lava: 1, conveyors: 1, w: 6, h: 5 }, tip: 'Cross the lava on a sunken crate.' },
      { name: 'Foundry', difficulty: 3, par: [20, 38], gen: { crates: 2, conveyors: 4, w: 6, h: 6 }, tip: 'Belts carry you too: step on, step off.' },
      { name: 'Slag Heap', difficulty: 3, par: [22, 44], gen: { crates: 2, lava: 2, conveyors: 2, w: 6, h: 6 }, tip: 'Two lava pools, two crates to spare.' },
      { name: 'Crucible', difficulty: 3, par: [26, 50], gen: { crates: 3, conveyors: 3, w: 7, h: 6 }, tip: 'Time your pushes with the belts.' },
      { name: 'Bellows', difficulty: 4, par: [32, 58], gen: { crates: 3, lava: 1, conveyors: 3, w: 7, h: 6 }, tip: 'Heat and motion.' },
      { name: 'Magma Works', difficulty: 4, par: [38, 72], gen: { crates: 3, lava: 2, conveyors: 3, w: 7, h: 6 }, tip: 'Plan the belts before the lava.' },
      { name: 'The Great Furnace', difficulty: 5, par: [45, 110], gen: { crates: 3, lava: 2, conveyors: 4, w: 7, h: 7, states: 1500000 }, tip: 'The heart of the forge.' },
    ],
  },
  crystal: {
    about: 'World 6, Crystal Caverns: colored crates and pads; mirror crates that steer lasers onto receivers.',
    slots: [
      { name: 'Prism', difficulty: 1, par: [3, 14], gen: { crates: 0, lasers: 1, w: 5, h: 5, tries: 2000 }, tip: 'A mirror crate turns the laser. Light up the crystal.' },
      { name: 'Color Sort', difficulty: 1, par: [8, 18], gen: { crates: 2, colors: 2, w: 5, h: 5 }, tip: 'Colored pads want crates of their own color.' },
      { name: 'Refraction', difficulty: 2, par: [10, 24], gen: { crates: 1, lasers: 1, w: 6, h: 5, tries: 2000 }, tip: 'Light the crystal and fill the pad.' },
      { name: 'Spectrum', difficulty: 2, par: [14, 30], gen: { crates: 3, colors: 3, w: 6, h: 5 }, tip: 'Three colors, three pads.' },
      { name: 'Light Well', difficulty: 3, par: [18, 36], gen: { crates: 2, lasers: 1, colors: 2, w: 6, h: 6, tries: 2000 }, tip: 'Mirrors and colors together.' },
      { name: 'Geode', difficulty: 3, par: [22, 42], gen: { crates: 3, colors: 3, w: 6, h: 6 }, tip: 'Sort the crystals by color.' },
      { name: 'Twin Beams', difficulty: 3, par: [20, 48], gen: { crates: 1, lasers: 2, w: 7, h: 6, tries: 3000 }, tip: 'Two lasers, two mirrors, two crystals.' },
      { name: 'Amethyst Hall', difficulty: 4, par: [28, 58], gen: { crates: 2, lasers: 1, colors: 2, w: 7, h: 6, tries: 2000 }, tip: 'The beam must stay lit while you finish.' },
      { name: 'Kaleidoscope', difficulty: 4, par: [30, 72], gen: { crates: 2, colors: 2, lasers: 1, w: 6, h: 6, tries: 1500 }, tip: 'Everything shines, nothing stays still.' },
      { name: 'The Crystal Heart', difficulty: 5, par: [36, 110], gen: { crates: 2, lasers: 1, colors: 2, w: 7, h: 6, tries: 1500 }, tip: 'Light every crystal and fill every pad.' },
    ],
  },
  clockwork: {
    about: 'World 7, Clockwork Sanctum: gates that flip with every move, teleporter pairs.',
    slots: [
      { name: 'Tick', difficulty: 1, par: [5, 14], gen: { crates: 1, gates: 2, w: 5, h: 4 }, tip: 'Gold gates are up after an even number of moves, violet ones after odd. Count your steps.' },
      { name: 'Portal', difficulty: 1, par: [5, 16], gen: { crates: 1, teleports: 1, w: 5, h: 5 }, tip: 'Stop on a pad and you come out of its twin. Crates too.' },
      { name: 'Tock', difficulty: 2, par: [12, 26], gen: { crates: 2, gates: 2, w: 6, h: 5 }, tip: 'A gate can’t rise under you or a crate.' },
      { name: 'Wormhole', difficulty: 2, par: [14, 30], gen: { crates: 2, teleports: 1, w: 6, h: 5 }, tip: 'A pad whose twin is taken does nothing.' },
      { name: 'Escapement', difficulty: 3, par: [18, 36], gen: { crates: 2, gates: 3, w: 6, h: 6 }, tip: 'Sometimes you need one extra step to change the gates.' },
      { name: 'Pendulum', difficulty: 3, par: [22, 42], gen: { crates: 2, gates: 2, teleports: 1, w: 6, h: 6 }, tip: 'Gates and portals together.' },
      { name: 'Gear Train', difficulty: 3, par: [26, 50], gen: { crates: 3, gates: 2, w: 7, h: 6 }, tip: 'Three crates in time with the gates.' },
      { name: 'Mainspring', difficulty: 4, par: [30, 58], gen: { crates: 3, teleports: 2, w: 7, h: 6 }, tip: 'Two pairs of pads.' },
      { name: 'Orrery', difficulty: 4, par: [36, 72], gen: { crates: 3, gates: 3, teleports: 1, w: 7, h: 6 }, tip: 'Everything turns.' },
      { name: 'The Grand Clock', difficulty: 5, par: [42, 110], gen: { crates: 3, gates: 4, teleports: 2, w: 7, h: 7, states: 1500000 }, tip: 'The last tick.' },
    ],
  },
  reverse: {
    about: 'Mirror Grove (opens after the Desert): pull rules. Crates cannot be pushed; stepping away from one drags it along.',
    slots: [
      { name: 'Backwards', difficulty: 1, par: [5, 12], gen: { pull: 1, crates: 1, w: 5, h: 4 }, tip: 'Here you pull: stand by a crate, then step away from it (Shift + arrow, or the Grab button).' },
      { name: 'Tug of War', difficulty: 1, par: [8, 16], gen: { pull: 1, crates: 1, w: 5, h: 5 }, tip: 'You end up beyond the crate you pull: leave yourself room to step.' },
      { name: 'Two Ropes', difficulty: 2, par: [10, 20], gen: { pull: 1, crates: 2, w: 5, h: 5 }, tip: 'Corners are no trap here: a crate in a corner can still be pulled out.' },
      { name: 'Mirror Pond', difficulty: 2, par: [14, 26], gen: { pull: 1, crates: 2, w: 6, h: 5 }, tip: 'Walls next to a pad are a problem: there is no room to step away.' },
      { name: 'Reflection', difficulty: 3, par: [18, 32], gen: { pull: 1, crates: 2, w: 6, h: 6 }, tip: 'Think from the pad: where must you stand when the crate arrives?' },
      { name: 'Looking Glass', difficulty: 3, par: [22, 40], gen: { pull: 1, crates: 2, w: 6, h: 6, walls: 0.24 }, tip: 'Narrow halls: pull a crate through, then walk round it.' },
      { name: 'Hall of Mirrors', difficulty: 3, par: [26, 46], gen: { pull: 1, crates: 3, w: 6, h: 6 }, tip: 'Three crates: bring the far one in first.' },
      { name: 'Backwater', difficulty: 4, par: [32, 56], gen: { pull: 1, crates: 3, w: 6, h: 6, walls: 0.22 }, tip: 'Every pull leaves you one step further on.' },
      { name: 'Undertow', difficulty: 4, par: [38, 66], gen: { pull: 1, crates: 3, w: 7, h: 6, states: 800000 }, tip: 'Pull a crate past a pad to make room, then bring it back.' },
      { name: 'Through the Glass', difficulty: 5, par: [44, 90], gen: { pull: 1, crates: 3, w: 7, h: 7, states: 1200000 }, tip: 'The grove\'s last riddle: everything backwards at once.' },
    ],
  },
};
