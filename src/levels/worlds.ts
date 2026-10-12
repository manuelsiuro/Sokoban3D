/** The campaign's worlds in order. A world with no levels yet shows as "coming soon". */
export interface WorldDef {
  id: string;
  name: string;
  /** The mechanic it introduces, in a few words. */
  mechanic: string;
}

export const WORLDS: WorldDef[] = [
  { id: 'meadow', name: 'Meadow', mechanic: 'Push crates onto the pads' },
  { id: 'tundra', name: 'Frozen Tundra', mechanic: 'Ice: everything slides' },
  { id: 'desert', name: 'Desert Ruins', mechanic: 'Sand pits, plates and doors' },
  { id: 'sky', name: 'Sky Islands', mechanic: 'Heights: climb and drop' },
  { id: 'forge', name: 'Volcanic Forge', mechanic: 'Conveyors and lava' },
  { id: 'crystal', name: 'Crystal Caverns', mechanic: 'Colors and lasers' },
  { id: 'clockwork', name: 'Clockwork Sanctum', mechanic: 'Flipping gates, teleporters' },
];
