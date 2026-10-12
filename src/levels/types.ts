/**
 * A level is data: a map in Sokoban notation, optional heights, a name and a tip. Its par
 * and solution are not written by hand: scripts/dev/solveall.ts finds them with the solver
 * and writes src/levels/solutions.ts, and the tests replay them.
 *
 * Map characters (one per cell):
 *   #  wall          @  player         $  crate          .  goal
 *   *  crate on goal  +  player on goal  (space) floor inside the walls, void outside
 *   -  floor (also outside the walls)    ,  void (a hole in the island)
 */
export interface LevelDef {
  id: string;
  name: string;
  /** The world (biome) this level belongs to; levels of a world stay together. */
  world: string;
  /** 1 (gentle) to 5 (hard); never drops inside a world (curvetest). */
  difficulty: number;
  tip: string;
  map: string[];
  /** Floor height per cell, one digit each ('0'–'9'); missing rows or cells are 0. */
  heights?: string[];
}
