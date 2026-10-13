/**
 * A level is data: a map in Sokoban notation, optional layers, a name and a tip. Its par
 * and solution are not written by hand: scripts/dev/solveall.ts finds them with the solver
 * and writes src/levels/solutions.ts, and the tests replay them.
 *
 * `map` (one character per cell):
 *   #  wall          @  player         $  crate          .  goal
 *   *  crate on goal  +  player on goal  (space) floor inside the walls, void outside
 *   -  floor (also outside the walls)    ,  void (a hole in the island)
 *
 * `tiles` (what the floor is; space for plain floor):
 *   ~  ice: crates and the player slide across it
 *   o  sand pit, L lava: a level lower; the player can't enter until a crate fills it
 *   p q r  pressure plates (channels 1–3), held down by a crate or the player
 *   P Q R  doors of those channels: open while a plate (or receiver) of the channel is on
 *   ^ > v <  conveyors: after each move, carry what stands on them one cell
 *   1–4  teleporter pairs: whatever stops on one comes out of the other (if it's free)
 *   g G  gates: raised after an even (g) or odd (G) number of moves, unless occupied
 *   N E S W  laser emitters shooting north, east, south or west (block like walls)
 *   x y z  receivers for channels 1–3, lit by a beam (block like walls)
 *
 * `kinds` (what the crate or goal on that cell is; space for plain):
 *   r g b y  colored crate or goal (a colored goal wants a crate of its color)
 *   / \     mirror crate: turns a laser beam a quarter turn
 */
export interface LevelDef {
  id: string;
  name: string;
  /** The world (biome) this level belongs to; levels of a world stay together. */
  world: string;
  /** 1 (gentle) to 5 (hard); never drops inside a world (curvetest). */
  difficulty: number;
  /** The look and music, when not the world's own (planets wear the campaign worlds'). */
  biome?: string;
  tip: string;
  map: string[];
  /** Floor height per cell, one digit each ('0'–'9'); missing rows or cells are 0. */
  heights?: string[];
  tiles?: string[];
  kinds?: string[];
  /** 'pull': crates can't be pushed, only pulled (stepping away from one drags it along). */
  rules?: 'pull';
  /**
   * Planet levels: the board is the outside of a cube of this size, and `map` (and the
   * layers) are its unfolded net, 4N wide and 3N tall (see src/sim/cube.ts). Walking off a
   * face leads onto the next. Plain floor, ice, pits and teleporters only.
   */
  planet?: number;
  /** 'bound': the stored solution is the best known, not proven fewest (too big to search). */
  parProof?: 'bound';
}
