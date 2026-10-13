/** The campaign's shape: unique ids, each world's levels together and in world order, difficulty never drops inside a world. */
import { LEVELS } from '../src/levels/levels';
import { PLANET } from '../src/levels/worlds/planet';
import { WORLDS } from '../src/levels/worlds';
import { check } from './assert';
import { worldGate } from '../src/game/progress';

const ids = new Set<string>();
const order = WORLDS.map((w) => w.id);
let world = -1;
let d = 0;
for (const l of LEVELS) {
  check(!ids.has(l.id), `unique id ${l.id}`);
  ids.add(l.id);
  const w = order.indexOf(l.world);
  check(w >= 0, `${l.id}: unknown world ${l.world}`);
  check(w >= world, `${l.id}: world ${l.world} out of order`);
  if (w !== world) d = 0;
  world = w;
  check(l.difficulty >= d && l.difficulty <= 5, `${l.id}: difficulty ${l.difficulty} after ${d}`);
  d = l.difficulty;
  check(l.tip.length > 0, `${l.id}: a tip`);
}
WORLDS.forEach((w, k) => {
  const ls = LEVELS.filter((l) => l.world === w.id);
  console.log(`${w.id.padEnd(10)} ${String(ls.length).padStart(2)} levels  opens at ${String(worldGate(k)).padStart(3)} stars  difficulty ${ls.map((l) => l.difficulty).join(' ') || '-'}`);
});
// Planets: their own ids, in order of difficulty, each a cube net.
let pd = 0;
for (const l of PLANET) {
  check(!ids.has(l.id), `unique id ${l.id}`);
  ids.add(l.id);
  check(l.difficulty >= pd && l.difficulty <= 5, `${l.id}: difficulty ${l.difficulty} after ${pd}`);
  pd = l.difficulty;
  check(!!l.planet && l.tip.length > 0, `${l.id}: a planet with a tip`);
}
console.log(`planets    ${String(PLANET.length).padStart(2)} levels  sizes ${PLANET.map((l) => l.planet).join(' ')}  difficulty ${PLANET.map((l) => l.difficulty).join(' ')}`);
