import { t } from '../i18n';

/** The campaign's worlds in order. A world with no levels yet shows as "coming soon". */
export interface WorldDef {
  id: string;
  name: string;
  /** The mechanic it introduces, in a few words. */
  mechanic: string;
}

export const WORLDS: WorldDef[] = [
  { id: 'meadow', get name() { return t('world.meadow.name'); }, get mechanic() { return t('world.meadow.mechanic'); } },
  { id: 'tundra', get name() { return t('world.tundra.name'); }, get mechanic() { return t('world.tundra.mechanic'); } },
  { id: 'desert', get name() { return t('world.desert.name'); }, get mechanic() { return t('world.desert.mechanic'); } },
  { id: 'sky', get name() { return t('world.sky.name'); }, get mechanic() { return t('world.sky.mechanic'); } },
  { id: 'forge', get name() { return t('world.forge.name'); }, get mechanic() { return t('world.forge.mechanic'); } },
  { id: 'crystal', get name() { return t('world.crystal.name'); }, get mechanic() { return t('world.crystal.mechanic'); } },
  { id: 'clockwork', get name() { return t('world.clockwork.name'); }, get mechanic() { return t('world.clockwork.mechanic'); } },
  // A side world: pull rules. It opens with the Desert cleared, not at a star gate (progress.ts).
  { id: 'reverse', get name() { return t('world.reverse.name'); }, get mechanic() { return t('world.reverse.mechanic'); } },
];
