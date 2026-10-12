# Cratelands: plan

A modern Sokoban played on small 3D dioramas: floating islands, one biome per world, each
world built around a new mechanic. The 3D is in the rules as well as the looks: terrain has
heights (climb one step, crates fall off ledges, a crate in a dip becomes floor).

Decisions (2026-10-12): all seven biomes; low-poly toy diorama look; original levels only,
every one proven by the solver; local git only for now (no deploy yet).

## Rules (the simulation, `src/sim/`)

- Turn-based and deterministic: one input = one move (`u d l r`), resolved completely
  (pushes, falls, slides, conveyors, doors) before the next. The state is a flat
  `Int16Array`; every state is recorded, so undo/redo/restart are `seek`, and a solution,
  replay or ghost is a LURD string (`lowercase` = walk, `UPPERCASE` = push).
- Every move returns an event mask (`step, push, climb, drop, fall, fill, slide, goal,
  win, bump…`); sound, particles and animation read the events, the sim never calls them.
- Terrain: each cell has a floor height or is void; walls are impassable. Crates stack:
  a cell's *surface* is its floor plus its crates.
- The player, standing at elevation `e`, moving into a cell:
  - a crate occupying level `e` there is pushed (only if nothing sits on top of it);
    it moves sideways at level `e` into a cell whose surface is ≤ `e`, then falls to
    that surface (into the void it is lost);
  - otherwise the player steps if the surface there is within ±1 of `e`.
- Win: every goal cell holds a crate (colored goals: a crate of that color).
- New state goes at the end of the layout (sections sized from the level).

## Worlds and mechanics

| # | Biome | New mechanic |
|---|---|---|
| 1 | Meadow | Classic push, goal pads (tutorial) |
| 2 | Frozen Tundra | Ice: crates and the player slide until blocked or off the ice |
| 3 | Desert Ruins | Sand pits a crate fills (becomes floor); pressure plates that open doors |
| 4 | Sky Islands | Heights: climb, drop crates off ledges, crates as steps |
| 5 | Volcanic Forge | Conveyors move things after each move; lava swallows crates (cools to floor) |
| 6 | Crystal Caverns | Colored crates and pads; mirror crates send a laser to receivers |
| 7 | Clockwork Sanctum | Gates that flip every move; teleporter pairs |

Pacing inside a world: the first levels teach the mechanic alone, the middle ones combine
it with earlier ones, the last one is a showpiece.

## Systems

- Stars per level: ★ solved, ★★ within 1.5× par, ★★★ within par + 10% (par = the
  solver's fewest moves). A "no undo" badge.
- World map (an overworld of floating islands), worlds open at ~55% of the stars before
  them; unlocks are never taken back.
- Hints from the live solver (the next push, or "dead end, undo").
- Daily puzzle generated from the date's seed (reverse play + solver check), streak, share link.
- Later: level editor with share links, achievements → crate skins and outfits, ghost
  replays, synthesized music per biome.

## Tooling

- `scripts/dev/solve.ts <id>`: BFS over the real `step()` (crates of the same kind are
  interchangeable in the key, dead squares pruned on classic levels).
- `scripts/dev/solveall.ts` writes `src/levels/solutions.ts` (generated: par + solution).
- Tests: rules (`simtest`), every level solved by its stored solution with moves = par and
  not solved at the start (`levelstest`), par is optimal (`partest`), ids and the
  difficulty curve (`curvetest`), storage.

## Phases (each one ships)

0. Scaffold from web-game-starter, rename, git, version on the title.
1. Core: rules with heights, undo/redo/restart, 3D diorama view with tweened moves,
   camera rotation (Q/E), keyboard + swipe + d-pad, solver, tests, Meadow × 10.
2. World map, progression, stars, level select per world, summary.
3. Biome batches, one release each: Tundra → Desert → Sky → Forge → Crystal → Clockwork
   (~10–12 levels each, mechanic + tests + curve).
4. Systems: hints, daily puzzle, then editor, achievements, music.

## Status

- v0.1 Phase 0–1: rules, solver, Meadow, 3D view. v0.2 Phase 2: world map, progression.
- v0.3–v0.8 Phase 3: Tundra, Desert (+ hints), Sky, Forge, Crystal, Clockwork.
- Phase 4: hints, daily puzzle with streaks, workshop with share links, trophies and
  cosmetics, generated music, settings.
- v0.10: ghost of the best run, replays (Watch best); GitHub remote and Pages deploy.
