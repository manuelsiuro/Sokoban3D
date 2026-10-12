/**
 * The rules, case by case on tiny maps (flat pushes, heights, falls, stacks, the void), and
 * the record: undo, redo and replays give exactly the same states.
 */
import { Sim, EVENT } from '../src/sim/Sim';
import type { LevelDef } from '../src/levels/types';
import { check } from './assert';

const lv = (map: string[], heights?: string[]): LevelDef => ({ id: 't', name: 't', world: 't', difficulty: 1, tip: '', map, heights });
const after = (level: LevelDef, moves: string) => {
  const sim = new Sim(level);
  const n = sim.play(moves);
  return { sim, n, s: sim.state };
};
const log = (name: string, ok: boolean) => {
  check(ok, name);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
};

// Flat pushes.
let r = after(lv(['#######', '#@ $ .#', '#######']), 'rrr');
log('a push moves the crate, three moves solve First Push', r.n === 3 && r.s.solved && r.s.pushes === 2 && r.s.crates[0].cell === 12);
log('the winning move has the win event', (r.s.events & EVENT.win) !== 0 && (r.s.events & EVENT.goalOn) !== 0);
r = after(lv(['#####', '#@$$#', '#####']), 'r');
log('two crates in a row are too heavy', r.n === 0);
r = after(lv(['####', '#@$#', '####']), 'r');
log('a crate against a wall does not move', r.n === 0);
r = after(lv(['#####', '#@  #', '#####']), 'rrr');
log('walls stop the player', r.n === 2 && r.s.x === 3);
r = after(lv(['######', '#@*.$#', '######']), 'r');
log('pushing a crate off a goal and onto another', !r.s.solved && (r.s.events & EVENT.goalOff) !== 0 && (r.s.events & EVENT.goalOn) !== 0);

// Heights: one step up or down, never two.
const terrace = lv(['-----', '-@---', '-----'], ['00000', '00120', '00000']);
r = after(terrace, 'r');
log('the player climbs one level', r.n === 1 && r.s.z === 1 && (r.s.events & EVENT.climb) !== 0);
r = after(terrace, 'rr');
log('then one more level up', r.n === 2 && r.s.z === 2);
r = after(lv(['----', '-@--', '----'], ['0000', '0020', '0000']), 'r');
log('a two-level wall of terrain blocks', r.n === 0);
r = after(lv(['-----', '-@---', '-----'], ['00000', '02100', '00000']), 'rr');
log('the player steps down one level at a time', r.n === 2 && r.s.z === 0 && (r.s.events & EVENT.descend) !== 0);

// Crates fall, stack and bridge.
const ledge = lv(['------', '-@$---', '------'], ['000000', '111000', '000000']);
r = after(ledge, 'r');
log('a crate pushed off a ledge falls to the floor below', r.s.crates[0].cell === 9 && r.s.crates[0].z === 0 && (r.s.events & EVENT.fall) !== 0);
r = after(ledge, 'rr');
log('a crate one level down is a step: walk onto it', r.n === 2 && r.s.z === 1 && r.s.x === 3);
const dip = lv(['-------', '-@$ ---', '-------'], ['1111111', '1110111', '1111111']);
r = after(dip, 'rrr');
log('a crate in a dip fills it: walk across', r.n === 3 && r.s.z === 1 && r.s.x === 4 && r.s.crates[0].z === 0);
const stack = lv(['------', '-@$$--', '------'], ['000000', '111000', '000000']);
r = after(stack, 'r');
log('a crate pushed onto another stacks on it', r.n === 1 && r.s.crates[0].cell === r.s.crates[1].cell && r.s.crates[0].z === 1);
r = after(stack, 'rurd');
log('a crate with another on top is too heavy to push', r.n === 3);
const below = lv(['------', '--$@--', '------'], ['000000', '000100', '000000']);
r = after(below, 'l');
log('a crate one level below is floor: the player walks onto it', r.n === 1 && r.s.z === 1 && r.s.crates[0].cell === 8);
r = after(lv(['------', '-@$---', '------'], ['000000', '000000', '000000']), 'r');
log('baseline push on open ground', r.n === 1);
r = after(lv(['-@$,-'], ['00000']), 'r');
log('a crate pushed into the void is lost', r.n === 1 && r.s.crates[0].cell === -1 && (r.s.events & EVENT.lost) !== 0);
r = after(lv(['-@,-'], ['0000']), 'r');
log('the player never walks into the void', r.n === 0);

// The record: undo, redo, replace.
const sim = new Sim(lv(['########', '#@ $  .#', '########']));
sim.play('rrrr');
const at4 = JSON.stringify(sim.state);
sim.undo();
sim.undo();
sim.redo();
sim.play('r');
log('redo and replaying the same move keep the record', JSON.stringify(sim.state) === at4 && sim.recorded === 5);
sim.undo();
sim.play('l');
log('a different move after undo replaces the moves after it', sim.recorded === 5 && sim.moves === 'rRRl');
console.log('moves after replace:', JSON.stringify(sim.moves));
sim.restart();
log('restart goes back to the first state', sim.state.moves === 0 && sim.state.x === 1);
