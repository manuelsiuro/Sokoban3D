# Cratelands

A modern Sokoban on small 3D floating islands: push crates onto the pads, across seven
biomes that each add a mechanic (ice, sand pits and doors, heights, conveyors and lava,
colors and lasers, flipping gates and teleporters). Built from **web-game-starter**; the
plan is in **[docs/PLAN.md](docs/PLAN.md)**, the method in **[docs/PLAYBOOK.md](docs/PLAYBOOK.md)**.

## What's in the game

- **7 worlds × 10 levels**, each world with its own mechanic: Meadow (classic), Frozen
  Tundra (ice), Desert Ruins (sand pits, plates and doors), Sky Islands (heights), Volcanic
  Forge (conveyors, lava), Crystal Caverns (colors, lasers and mirror crates), Clockwork
  Sanctum (gates that flip every move, teleporters). Every par is the solver's proven optimum.
- **World map** of floating islands; worlds open at 55% of the stars before them.
- **Stars** against par, a no-undo badge, **hints** from the live solver, free undo/redo.
- **Ghost** of your best run walks beside you; **Watch best** replays it.
- **Daily puzzle** (generated from the date, a mechanic per weekday) with a streak and sharing.
- **Workshop**: paint a level with every mechanic, check it with the solver, play it, share a link.
- **Trophies** that unlock crate skins and outfits; generated music per world; settings.

## Commands

```sh
npm run dev       # dev server (also on your network, for phones)
npm test          # headless tests;  npm test -- -u  accepts new snapshots
npm run build     # type-check and build to dist/
npx tsx scripts/dev/solve.ts [level-id ...]        # par, pushes and search size
npx tsx scripts/dev/solve.ts --map draft.txt       # try a draft map (map, blank line, heights)
npx tsx scripts/dev/solveall.ts [level-id ...]     # regenerate src/levels/solutions.ts
npx tsx scripts/dev/generate.ts crates=3 w=6 h=6 ice=0.3 …       # propose rooms (see the file)
npx tsx scripts/dev/buildworld.ts <world>          # rebuild a world from scripts/dev/worldspecs.ts
```

## Map

| Path | What it is |
|---|---|
| `src/sim/Sim.ts` | The rules: deterministic, turn-based, heights and stacks; every state recorded (undo/redo/replay) |
| `src/sim/grid.ts` | Parses a level's map and heights into the fixed layout |
| `src/sim/solver.ts` | Fewest-moves BFS over the real rules, dead-square pruning on classic levels |
| `src/sim/generator.ts` | Room generator (keeps rooms whose optimal solution uses the requested mechanics) |
| `src/app/worker.ts` | Hints and the daily puzzle, off the main thread |
| `src/game/daily.ts`, `dailyProgress.ts` | The daily puzzle from the date; streaks |
| `src/game/achievements.ts`, `share.ts` | Trophies and cosmetics; share links (`#lvl=`) |
| `src/ui/screens/editor.ts` | The workshop |
| `src/levels/worlds/*.ts` | Levels as data, one file per world (Meadow by hand, the others built from `scripts/dev/worldspecs.ts`) |
| `src/levels/solutions.ts` | Generated: each level's optimal solution (its length is the par) |
| `src/render/` | The diorama view (tweened moves, camera turns, particles) and procedural models |
| `src/world/biomes.ts` | Each world's look: sky, ground, walls, crates, decor |
| `src/game/` | Storage (versioned, never throws), settings, progress, star scoring |
| `src/ui/` | Screens as Promise-returning functions, icons, DOM helpers |
| `scripts/*test*.ts` | Rules for every mechanic, every level solved at par, par optimal, the curve, storage, dailies, share links |

## Controls

Arrows or WASD to move (relative to the camera), Z undo, Y redo, R restart, H hint, Q/E turn
the camera, Esc back. On touch screens: swipe on the island or use the d-pad.
In dev, `?level=<id>` opens a level straight away.
