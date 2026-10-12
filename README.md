# Cratelands

A modern Sokoban on small 3D floating islands: push crates onto the pads, across seven
biomes that each add a mechanic (ice, sand pits and doors, heights, conveyors and lava,
colors and lasers, flipping gates and teleporters). Built from **web-game-starter**; the
plan is in **[docs/PLAN.md](docs/PLAN.md)**, the method in **[docs/PLAYBOOK.md](docs/PLAYBOOK.md)**.

## Commands

```sh
npm run dev       # dev server (also on your network, for phones)
npm test          # headless tests;  npm test -- -u  accepts new snapshots
npm run build     # type-check and build to dist/
npx tsx scripts/dev/solve.ts [level-id ...]        # par, pushes and search size
npx tsx scripts/dev/solve.ts --map draft.txt       # try a draft map (map, blank line, heights)
npx tsx scripts/dev/solveall.ts [level-id ...]     # regenerate src/levels/solutions.ts
npx tsx scripts/dev/generate.ts <crates> <w> <h> [tries] [seed]   # propose rooms
```

## Map

| Path | What it is |
|---|---|
| `src/sim/Sim.ts` | The rules: deterministic, turn-based, heights and stacks; every state recorded (undo/redo/replay) |
| `src/sim/grid.ts` | Parses a level's map and heights into the fixed layout |
| `src/sim/solver.ts` | Fewest-moves BFS over the real rules, dead-square pruning on classic levels |
| `src/levels/worlds/*.ts` | Levels as data, one file per world; `worlds.ts` lists the worlds |
| `src/levels/solutions.ts` | Generated: each level's optimal solution (its length is the par) |
| `src/render/` | The diorama view (tweened moves, camera turns, particles) and procedural models |
| `src/world/biomes.ts` | Each world's look: sky, ground, walls, crates, decor |
| `src/game/` | Storage (versioned, never throws), settings, progress, star scoring |
| `src/ui/` | Screens as Promise-returning functions, icons, DOM helpers |
| `scripts/*test*.ts` | Rules, every level solved at par, par optimal, the curve, storage |

## Controls

Arrows or WASD to move (relative to the camera), Z undo, Y redo, R restart, Q/E turn the
camera, Esc back. On touch screens: swipe on the island or use the d-pad.
