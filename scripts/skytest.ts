/**
 * The day and night: at noon every world looks exactly as designed, the night never gets too
 * dark to play (ground light stays above a floor), and the sky changes smoothly (no jumps from
 * one moment to the next, even where the sun hands over to the moon).
 */
import { BIOMES } from '../src/world/biomes';
import { NOON, groundLight, luma, skyAt } from '../src/world/daynight';
import { check } from './assert';

const STEPS = 2000;
const MIN_LIGHT = 0.3;
for (const [id, b] of Object.entries(BIOMES)) {
  const noon = skyAt(b, NOON);
  check(noon.top === b.skyTop && noon.bottom === b.skyBottom && noon.fog === b.fog, `${id}: noon sky is the biome's`);
  check(noon.light === b.sun && Math.abs(noon.lightIntensity - b.sunIntensity) < 1e-9 && noon.hemiIntensity === b.ambient, `${id}: noon light is the biome's`);
  let least = 1;
  let darkest = 1;
  let jump = 0;
  let prev = skyAt(b, 0);
  for (let i = 1; i <= STEPS; i++) {
    const p = i / STEPS;
    const s = skyAt(b, p);
    least = Math.min(least, groundLight(b, p));
    darkest = Math.min(darkest, luma(s.bottom));
    // Light on the ground from the sun or moon: how much it changes in one step.
    const lit = (x: typeof s) => x.lightIntensity * x.lightDir[1];
    jump = Math.max(jump, Math.abs(lit(s) - lit(prev)) / b.sunIntensity, Math.abs(luma(s.top) - luma(prev.top)));
    prev = s;
  }
  check(least >= MIN_LIGHT, `${id}: the night stays readable (${least.toFixed(2)})`);
  check(jump < 0.02, `${id}: no sudden change (${jump.toFixed(3)})`);
  // Weather greys the sky and dims the light, never brightens it.
  const wet = skyAt(b, NOON, 1, 1);
  check(wet.lightIntensity < noon.lightIntensity && wet.fogScale < 1, `${id}: weather dims and closes in`);
  console.log(`${id.padEnd(10)} least light ${least.toFixed(2)}  darkest horizon ${darkest.toFixed(2)}  biggest step ${jump.toFixed(3)}`);
}
