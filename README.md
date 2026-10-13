# Cratelands

A modern Sokoban on small 3D floating islands: push crates onto the pads, across seven
biomes that each add a mechanic (ice, sand pits and doors, heights, conveyors and lava,
colors and lasers, flipping gates and teleporters), plus a world played by pulling.
Live at https://manuelsiuro.github.io/Sokoban3D/ (installable, plays offline; English and French). Built from **web-game-starter**; the
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
- **Mirror Grove**: 10 levels with pull rules (crates can only be pulled), opening with the Desert.
- **Grand Islands**: a four-room finale per world; the camera follows on phones (V: whole island).
- **Expedition**: endless generated islands through every world, compasses to skip, seeded runs (`#exp=`).
- **Time Trial**: replay a cleared world against the clock for bronze, silver and gold, with a real-time ghost.
- **Trophies** that unlock crate skins and outfits; generated music per world; settings.
- **Polish**: bloom and soft shadows with quality tiers, level fly-ins and transitions, squash and
  stretch, screen shake, pooled particles, per-world atmosphere (clouds, snow, embers, motes),
  mixed audio with per-world reverb, vibration, tap-to-move, gamepads, color symbols, a tutorial.

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
npx tsx scripts/dev/buildgrand.ts [world ...]      # rebuild Grand Islands (src/levels/grand.ts)
```

## Map

| Path | What it is |
|---|---|
| `src/sim/Sim.ts` | The rules: deterministic, turn-based, heights and stacks; every state recorded (undo/redo/replay) |
| `src/sim/grid.ts` | Parses a level's map and heights into the fixed layout |
| `src/sim/solver.ts` | Fewest-moves BFS over the real rules, dead-square pruning on classic levels |
| `src/sim/generator.ts` | Room generator (keeps rooms whose optimal solution uses the requested mechanics) |
| `src/app/worker.ts` | Hints, the daily puzzle and Expedition floors, off the main thread |
| `src/app/context.ts`, `boot.ts` | The shared objects (renderer, view, sound, settings); migrations first |
| `src/modes/` | One file per mode: `run.ts` (playing: HUD, input, timer), campaign, daily, expedition, shared, workshop, coach (tutorial) |
| `src/game/expedition*.ts`, `path.ts` | Expedition runs and floors; tap-to-move paths |
| `src/i18n/` | `t(key)`, English and French, French level names |
| `src/render/post.ts`, `shaders.ts`, `particles.ts`, `atmosphere.ts`, `shapes.ts` | Post FX and quality tiers, shader touches, pooled particles, world atmosphere, geometry helpers |
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

Arrows or WASD to move (relative to the camera), Shift + direction to pull (Mirror Grove),
Z undo, Y redo, R restart, H hint, Q/E turn the camera, V whole island, Esc back. On touch
screens: swipe, tap where to go, or use the d-pad. Gamepads: d-pad/stick, A (hold to pull),
B undo, X hint, Y restart, shoulders turn the camera.
In dev, `?level=<id>` opens a level straight away.
