# Web Game Playbook

What building two games taught us, written so the next game starts from it, not from zero:
- **Line Rider 3D** (`~/ClaudeProjects/LineRider3D`): a physics game, fixed-step simulation,
  levels built by measuring the physics.
- **Cratelands** (`~/ClaudeProjects/Sokoban3D`, live at manuelsiuro.github.io/Sokoban3D): a
  turn-based 3D Sokoban, 8 worlds, 10 cube planets, a solver that proves every par, French and
  English, installable PWA.

It covers the working method, the architecture (real-time and turn-based), content at scale,
testing, UI, juice, i18n, progression and release. Paths are examples from one game or the
other. The starter template (`~/ClaudeProjects/web-game-starter`) holds the reusable base,
including what Cratelands added (the self-healing service worker and boot guard, i18n,
haptics, the icon script). Bigger systems stay in Cratelands to copy when a game needs them:
photo mode, the solver and generator, the tutorial coach, the help screen, quality tiers.

**How to use it**
- Starting a new game: read **1. Working method** and **16. Checklists**, then copy the starter.
- Adding a feature: check the matching section's rules before writing code.
- Something went wrong: **15. Pitfalls** lists the mistakes already paid for.

---

## 1. Working method

The loop that worked, request after request:

1. **Design first, briefly.** For a big feature, show a short menu of options with a
   recommendation, plus questions only where the answer changes the build. The user picks
   tersely ("Both", "do all"); then build end to end without asking again.
2. **Write the plan down** (phases, each shippable). Big programmes (100 levels, 8 worlds)
   go phase by phase: mechanics → tooling → content batches.
3. **Build the tooling before the content.** Solvers, stats scripts and tests made 200 levels
   and puzzles possible; writing them by hand and checking them by playing would not have.
4. **Verify for real.** Run the build and the test suite, then look at it in a browser at
   desktop, phone portrait and phone landscape sizes. Measure layout problems with a script
   (for example `scrollWidth > clientWidth` finds cut-off text) instead of trusting a glance.
5. **Ship every phase.** Commit, `npm version patch|minor`, push with tags, poll the live
   site until the new version is served.
6. **Report and ask.** A short summary of what changed, what wasn't verified, the known
   limits, then the next step as a question.

**Open requests** ("improve it", "add a great feature", "polish it"): first look at what the
game already has (grep the effects, modes and settings), so the menu only offers real gaps.
Offer 3–4 directions with a recommendation (a new mode, more content for a mode, a polish
pass, a meta/progression feature) and ask how to deliver (feature branch or straight to main).

**Experimental modes go on a feature branch** (`feature/planet`): build and verify there, show
the user, merge and release only when they say so. Polish and fixes go straight to `main`.

Rules that kept it safe:
- **Browser tests run in an isolated context** (or snapshot every `game.*` storage key first
  and restore it after). One early test autosaved over the user's own track; another left a
  solved level in the user's real browser. With chrome-devtools, `new_page` with
  `isolatedContext`; seeding progress there (unlocking worlds to test) is then harmless.
- **Report honestly.** If the browser check was skipped, or 10 cases stay unsolved, say so.
  Name what a test browser can't check: sound, vibration, share sheets, real touch feel.
- **Memory**: keep project status, user decisions and hard-won lessons in memory files, so a
  new session (or a compacted one) picks up where the last left off. Update the status after
  every release.
- **Feedback with screenshots** is the best signal: fix exactly what the screenshot shows,
  then look for the same problem elsewhere (a cut-off label is rarely the only one).
- **When the user reports a bug after a mode switch** ("camera issues going from planets back
  to classic"), look for state one mode set and the other never resets (see 11).

---

## 2. Stack and skeleton

| Piece | Choice | Why |
|---|---|---|
| Build | Vite, TypeScript `strict`, `noUnusedLocals` | Fast dev server, zero config, catches dead code |
| 3D | Three.js, procedural low-poly models (no glTF) | No asset pipeline; models are code, themable and tiny |
| UI | Plain DOM: template strings + CSS, no framework | Screens are few and short-lived; no runtime cost |
| Tests | `tsx` scripts run headless in Node | The game logic has no DOM dependency |
| Hosting | GitHub Pages from CI | Free, public URL, deploys on every push to `main` |
| Offline | A generated service worker (`vite-sw.ts`) | Installable PWA; cache named after a build hash |
| Heavy work | One Web Worker (`src/app/worker.ts`) | Solver hints, daily generation off the main thread |

Layout (Line Rider 3D; Cratelands uses `sim/` for `physics/` and adds `modes/`, `i18n/`):

```
src/
  main.ts          wiring: builds the core, the controllers, the flows between screens
  app/             controllers: core objects, session state, input, run, quality, worlds
  physics/ | sim/  deterministic simulation (no Three.js rendering here)
  modes/           one file per game mode, all playing through one play() (Cratelands)
  render/          views that read the simulation and draw it
  game/            progress, settings, storage, achievements, medals, sharing
  levels/          content definitions, builders, templates, generated tables
  world/           biomes, sky, terrain, weather, decor
  i18n/            en.ts (the key list), fr.ts, keys.ts (keyboard labels)
  ui/              UI shell, dom helpers, icons, one file per screen
  styles/          numbered CSS files (01-base … 08-…), imported by index.css
scripts/
  test.ts          the test runner; *test*.ts files are the tests
  snapshots/       golden outputs
  dev/             probes, solvers, generators, the icon script (not tests)
.github/workflows/ci.yml
```

- **`base: './'`** in `vite.config.ts` so the build works under any Pages sub-path.
- **The version** comes from `package.json` through Vite `define` (`__APP_VERSION__`) and is
  shown in a corner of the title screen, so anyone can tell which build a phone is running.
  A dev plugin restarts the server when `npm version` changes it.
- **One `core` object** (`src/app/core.ts`; Cratelands: `src/app/context.ts`) holds the
  long-lived objects (renderer, views, sound, settings, the level on screen). Modes import
  from it, never from each other.
- **One session state** (`src/app/session.ts`): a tagged union of what the player is doing
  (`title | edit | level | daily | puzzle`) plus small predicates (`editing(s)`,
  `fixedTrack(s)`). Rules ask the predicates, never compare kinds all over the code.
- **Modes share one runner.** Cratelands' campaign, daily, Expedition, Time Trial, Grand
  Islands, Planets and the Workshop all call `play(level, label, par, opts)` in
  `src/modes/run.ts` (HUD, input, sounds, hints, ghosts, replays) and differ only in their
  flow: what comes before, what the summary offers after.
- **Dev ports**: each game gets its own fixed port (`vite --port 5287 --strictPort`), or a
  second game's server silently takes the first one's tab. After copying a project, run
  `npm ci` (rsync'd `node_modules` broke Vite).
- **Dev hooks**: expose the view on `window.__view` in dev builds only
  (`if (import.meta.env.DEV)`), and in the browser `await import('/src/...')` gets the same
  module instances Vite serves, so a test can call game functions directly.

---

## 3. Simulation architecture

The single most valuable decision: **the game state is a deterministic function of the
inputs.**

**Real-time games** (Line Rider 3D):
- **Fixed step** (40 steps/s), never `dt`-driven. Rendering interpolates or just shows the
  latest frame.
- **Every frame is recorded** into a flat `Float64Array` (positions, then a META block of
  counters and flags: crashed, contact, events, stars, checkpoint, jump charge…). `seek(f)`
  replays from the nearest recorded frame. Scrubbing, replays, ghosts, photo mode and
  respawn all come from this for free.
- **Inputs are data**: a bit mask per step (`push 1, brake 2, spin 4, jump 8`). A whole run
  is an **input plan**, a list of `[frame, mask]` changes. Ghosts and stored solutions are
  plans, so they stay tiny and exact.
- **Any change that affects physics invalidates the recording** (track revision, vehicle,
  gravity, ground drag). Decor and cosmetics don't bump the revision.

**Turn-based games** (Cratelands, `src/sim/Sim.ts`):
- **A state per move**: a small `Int16Array` (player cell, facing, each crate's cell and
  height, a few world flags, moves, events, solved). `step(grid, state, input)` returns the
  next state or `null` (blocked). The `Sim` keeps the history: undo, redo, restart and
  replays are seeks; redo replays a recorded future while the inputs match.
- **A run is a string** (LURD: lowercase moves, uppercase pushes). Solutions, ghosts, share
  links and best runs are strings; tests replay them exactly.
- **Derive, don't store**: doors, laser beams, lit receivers are computed from the state
  (`worldOf`), so undo and the solver never see stale copies.
- **Topology is data.** Neighbours come from a table (`Grid.link[cell*4+dir]`) and the heading
  after a step from another (`Grid.turn`). Flat boards fill them from DX/DY; a cube planet
  fills them from the cube's net, where crossing an edge turns the heading. Pushes, undo, the
  solver, hints and ghosts worked on planets unchanged. Anything that moves in a direction
  (pushes, slides, conveyors, beams) must use the arrival direction from the table, and
  anything that can loop (an ice slide round a planet) needs a stop rule (back at its start).
- **The solver plays the real rules**: breadth-first search over `step`, crates
  interchangeable in the visited key, dead squares pruned on plain levels. Hints run it from
  the current position in the worker.

Both kinds:
- **Events are a bit mask per step or move** (`push, goalOn, slide, teleport, fall, win…`).
  Sound, particles, haptics, popups and stats read the events; the simulation never calls them.
- **New state goes at the end of the buffer layout** and stays deterministic, so old
  replays and share links keep working.
- **Variants are data**: vehicles, biomes, tile kinds, rule sets (`rules: 'pull'`), board
  shapes (`planet: N`). A new ride, world or mode is mostly a new entry. Keep the original
  variant bit-identical when adding new ones: the existing snapshots prove it.

Determinism makes testing exact: a snapshot of finish times, trajectories or solutions catches
any rule drift (see 5).

---

## 4. Content at scale

**Content as code, grouped by chapter.** `src/levels/worlds/<world>.ts` exports levels in
play order. Each level is data (`{ id, name, difficulty 1–5, world, tip, map | build }`).

### Physics games (Line Rider 3D)

**Builders that measure instead of guess.** Helpers ride the real physics while building:
- `measureArc(track, fromX)`: the flight path of an untouched run from a takeoff.
- `landing(track, x, y, drop, floor)`: a landing ramp that follows that measured arc.
- `riderLine(track, xs)`: where the rider actually passes, to place stars and rings on it.
- Call the world setup (`home(t, { biome })`) first, so measuring uses that world's
  gravity and ground. Place measured pieces **before** anything that changes an untouched
  run (mud, hazards).

**Templates with known solutions.** A puzzle template (`src/levels/puzzleKit.ts`) builds a
family from a few numbers and also provides the solution; the tests ride every solution.

**Solvers for anything that needs input.** `scripts/dev/jumpsolve.ts`: ride the level; at
each failure, try every candidate action in a window before the failure, and keep the one
that gets furthest. It prints the plan to paste as the level's `solution`.

### Puzzle games (Cratelands)

**Par is never written by hand.** `scripts/dev/solveall.ts <id>` solves every registered
level and writes `src/levels/solutions.ts`; par is the solution's length. A test re-runs the
search with `maxDepth = par − 1` and must find nothing (par proven optimal).

**Generate, then keep what teaches.** `src/sim/generator.ts` proposes rooms (walls, crates on
cells a crate can still be pushed from, pads, the mechanic's tiles) and keeps a room only if
its optimal solution really uses the mechanic (a slide, a teleport, a pit filled), with a
difficulty band in moves and pushes. `scripts/dev/worldspecs.ts` lists slots per world (size,
crates, mechanic, minimum moves, tries); `buildworld.ts <world>` writes the world file;
`solveall.ts` writes the pars. The first world is hand-made; the rest came from the pipeline.
- Slow slots (lasers, big planets) need lighter specs: fewer tries, smaller boards.
- The seeded daily and procedural modes depend on the generator: any rules or generator
  change shifts them, and their snapshot shows it. Read that diff knowingly.
- `solveall` only sees levels registered in the level list: register a world before running.
- Copy solutions from `solutions.ts` when replaying in the browser; never retype them.

**A difficulty curve that is checked.** `curvetest`: ids unique (across worlds and modes, and
not clashing with trophy names), a world's levels together and in order, difficulty never
drops inside a world, every gate reachable. A stats script prints the curve (moves, pushes,
time, inputs, hazards per level).

**Pacing inside a world**: the first levels teach the new mechanic alone, the middle ones
combine it with older ones, the last is a showpiece. Rotate puzzle kinds so no two in a row
are the same.

**Many modes from one content base**: daily (date seed), endless floors (Expedition, seeded
per floor), Time Trial (the same levels against the clock, medals from par), big hand-tuned
islands with a best-known par, a pull-rules world, a different board shape (Planets). Each is
a few hundred lines of flow; the rules and the runner are shared.

---

## 5. Testing

**Runner** (`scripts/test.ts`): every `scripts/*test*.ts` runs in parallel as its own
process; a test fails by exiting non-zero (`check(ok, message)` from `scripts/assert.ts`).
Each test's **stdout is compared with a golden file** in `scripts/snapshots/`.
`npm test -- -u` accepts new output; `npm test -- name` filters. On CI, failures also become
GitHub annotations.

**What the tests guarantee**
- Every level finishes: untouched, or with its stored solution. A level with a solution must
  **fail** untouched (otherwise it doesn't really need input). Puzzle levels: each stored
  solution solves its level, and par is optimal.
- Every variant (ride, rule set, board shape) can finish the content that uses it.
- Medal times and star limits are ordered and match the rules.
- Storage migrations, share links (round trip), ghosts, mechanics, editor pieces, the daily
  and procedural generators.
- **Topology tests for unusual boards**: every link is mutual, a straight walk round a cube
  returns after 4N steps with the same heading, pushes and slides over every kind of seam.
- **Warnings never cry wolf**: a helper that warns the player (a stuck crate) is checked
  against every state of every stored solution — none may trip it — plus a few positions
  that must.
- **i18n**: the second language covers every key (and the snapshot lists the key count, so a
  new string shows up in the diff).
- The campaign curve and gates (see 4).

**Rules**
- Snapshots must not contain platform-dependent output (compressed sizes, long float
  prints): CI runs Linux, development runs macOS.
- When a snapshot changes, read the diff before accepting: additions are expected, changed
  lines in old content are a red flag.
- Probes and one-off investigations live in `scripts/dev/`, never in the test glob.
- **Gate releases on the exit code**: never pipe `npm test` into `| tail` in a release
  command chain (the pipe's status is `tail`'s); a red build once shipped that way. Use
  `npm test && …`, or check `${PIPESTATUS[0]}`.
- Trace tools pay off: `levelcheck <id>` prints what happened and why it failed;
  `plancheck <id> '<plan>'` tries any plan.

---

## 6. Progression and replay value

- **Stars**: 3 per level (physics: placed on the measured line; puzzles: by moves against
  par, ★★★ at par).
- **Unlocks never take things away.** A level opens with one star on the previous one; a
  world opens at a star total of about 55% of the stars before it; worlds already played in
  stay open when gates change.
- **Medals** per level, computed from reference runs (physics: an autopilot +3%; puzzles:
  par-based times for Time Trial).
- **Achievements** per world, per mode, firsts and streaks. Cosmetics (outfits, crate skins,
  paint) are the rewards; an achievement name must not reuse a level name.
- **Daily**: generated from the date's seed, the same for everyone, a streak and a share link.
- **Ghosts and best-run replays**: the best run is stored as its input string; the ghost
  stands where that run was after as many moves as the player has made; the summary offers
  "Watch".
- **Share links** carry the level (for the editor's creations), the score and the ghost,
  versioned and compressed.
- **Seasons**: a seasonal chapter on a date window, switchable in Settings.
- **A "New" badge** on a fresh title entry, and a one-time intro card the first time a mode
  opens (kept in a `seen` list in storage).

---

## 7. Level design lessons (physics games)

- **Measure, never guess.** Every landing, star and ring placed from a measured run stays
  right when the physics changes slightly.
- **Space hazards for reaction time**: about 44 m between obstacles that need a full
  charged jump; less and the player lands on the next one.
- **Gentle kickers** (`0.04·x²` over 6 m) work for every ride; steep ones crash the slow
  ones.
- **Know the world's bounds**: the terrain rises past 160 m from the origin, so long levels
  must end high.
- **Low gravity changes everything**: slow rider, short crumbling slabs, ~30 m jumps, long
  falls (widen the solver's search window).
- **The solver finds shortcuts** (a hop instead of a brake). If the intent matters, check
  hand-written plans and store those.
- **Hazards are capsules** a little smaller than their models, so a near miss that looks
  clean is clean.

## 8. Puzzle design lessons (Cratelands)

- **Teach one rule per level** at the start of a world; the generator's "solution must use
  the mechanic" filter is what makes generated levels teach.
- **Dead squares** (cells no push can bring to a pad) prune the solver and also seed the
  generator: crates only start on live cells.
- **Help the player out of lost positions**: a stuck-crate warning (dead square or a frozen
  2×2 block, only certain cases, on plain levels) with "undo to save it", switchable off.
  Hints solve from the current position and say plainly when no solution exists from here.
- **Undo is free and unlimited**; a "no undo" badge rewards not using it.
- **Tap to walk** (a path search to the tapped cell) on top of swipes, a d-pad and keys;
  map keys by `e.code` so the layout doesn't matter (see 10).
- **New board shapes need orientation help**: on a planet the camera rolls with the pusher,
  "up" on screen picks the board direction closest to the camera's up, a Look button (and
  two-finger drag, pinch, wheel) spins the whole planet, and a mini-map shows the unfolded
  net with the pusher and the pads.

---

## 9. Persistence

`src/game/storage.ts` is the only code that touches `localStorage`:
- **All keys in one `KEYS` table**, with a game prefix (`lr3d.*`, `cratelands.*`).
  `PROGRESS_KEYS` lists what "Reset progress" wipes; preferences survive it.
- **Never throws**: storage can be missing, full or blocked (private windows). Reads fall
  back to a default of the right shape (an object fallback only accepts a plain object
  back); writes return `false`.
- **Versioned with migrations**: `SAVE_VERSION` and a `MIGRATIONS` array; a migration that
  can't finish returns `false` and is retried next start; saves from a newer build are left
  alone.
- **New fields are optional** in saved formats and share links, so old saves and links keep
  loading. Share links carry their own version byte.
- **Settings** are one object merged over defaults, each field checked against its
  default's type, so new settings get defaults automatically. A mute switch is its own flag,
  separate from the volumes. Accessibility settings worth having from day one: reduced motion
  (defaults from `prefers-reduced-motion`), screen shake, haptics, color-blind shapes,
  quality, language.

---

## 10. UI system

- **Screens are functions returning a Promise** of the player's choice
  (`showLevels(...) → Promise<number | null>`). Flows read like a script:
  `const i = await pickLevel(); if (i === null) back(); else start(i);`.
- **Markup is template strings** built with `h(tag, class, html)`; icons are an inline SVG set
  (`icon(name, size)`, 24×24 strokes in `currentColor`). Inline SVG `.ic` is `display: block`
  by default, so inside running text give it `display: inline-block` or it breaks the line.
- **Design tokens** in CSS variables (`--ink`, `--ink-soft`, `--shadow`, `--gold`, fonts,
  easings). Theming by data attribute: `[data-world='volcano'] { --world: …; --world-2: …;
  --scene: url(svg) }`, used by cards, tabs, icons and banners alike.
- **Card patterns** that the games reuse everywhere: two-line cards (icon tile, title, a line
  of facts, pill on the right); menu entries with a colored icon, a sub-line of live facts and
  a thin progress bar; level cards with difficulty pips, stars and badges.
- **Tabs for big lists** (one world at a time) instead of one long scroll; a lock banner
  shows a progress bar and the exact number still needed.
- **Phone first**: every screen is checked at ~412×915 portrait and ~915×412 landscape.
  - Pickers over a 3D preview are a **sideways strip of cards** at the bottom, not a sheet
    that covers it, and the 3D picture is raised with `camera.setViewOffset` so the preview
    sits above the strip (clear it with `clearViewOffset`).
  - On tall phones the title menu goes to the bottom so the island shows above it.
  - **HUD crowding**: count the buttons per row at 412 px. A new button goes where there is
    room (the bottom bar's second row), not into a top bar where it squeezes the title.
  - **Scrolling cards** (settings): a fixed head and foot and a scrolling body with
    `min-height: 0`; without it flex children shrink and nothing scrolls.
- **The title can be a kiosk**: behind the menu, a level from each world rises and sinks in
  turn (`src/app/kiosk.ts`), paused while a dialog is open or the page is hidden.
- **Touch is detected once** (`MOBILE`, `TOUCH`, a `touch` class on `body`); keyboard
  shortcut hints are stripped from labels on touch; hover sounds only without touch.
- **How to play** (`ui/screens/help.ts`): tabs (Basics, Worlds, Modes), one small SVG picture
  per rule, every HUD button listed with what it does. Keep it in step with the rules: every
  new mechanic, mode or button adds its entry in the same commit. Size every picture the
  same; a new one drawn bigger stands out.
- **Tutorial coach** (`src/modes/coach.ts`): short prompts on the first levels, each waiting
  for the player to do the thing (move, cover a pad, undo) before the next.
- **Respect `prefers-reduced-motion`** for every looping animation, in CSS and in the 3D view.
- Keep one specificity rule in mind: later files win at equal specificity, so phone and
  landscape overrides must be at least as specific as the rule they override.

### i18n (from the start next time)

- `t('key', { n })` over `src/i18n/en.ts` (the English table defines the key type) and one
  file per language; level names and tips looked up by level id. A test checks the other
  languages cover every key. Grep before adding a key: an existing one with the same name
  silently changes another screen's text.
- The language follows the browser unless chosen in Settings; set `<html lang>` and
  `translate="no"` on languages the game speaks itself.
- **Keys by physical position**: read `e.code`, and write keys in strings as `%KeyW%`,
  filled with the label on this keyboard (`navigator.keyboard.getLayoutMap()`, with an
  AZERTY guess for French browsers). Shortcuts then read "Z" on a French keyboard.
- Retrofitting i18n into a finished game took a whole release; start with `t()` on day one.

---

## 11. Rendering, performance and juice

- **Quality tiers** (Cratelands `src/render/post.ts`): high = GTAO contact shadows + bloom,
  medium = bloom, low = plain render; auto starts high on desktop, medium on touch, and steps
  down while the frame rate stays low. Line Rider 3D also steps pixel ratio, shadow size and
  scenery density.
- **Procedural models** from Three.js primitives; colors from data (outfits, skins,
  palettes). Give a character separate groups for parts that animate (head, eyes, arms, legs).
- **Bake static scenery**: merge everything that never moves into one mesh per material
  (`bake()` in `shapes.ts`); a level has hundreds of small parts. Flag animated parts
  (`userData.spin`) so the baker leaves them.
- **Dispose on level change** (geometries and owned materials): leaks showed up after a few
  dozen levels.
- **Atmosphere per biome as data** (clouds made of merged lumps, not spheres; motes; far
  islands), with a sky texture and fog tuned to the camera distance.
- **Pools, not allocation**: particles from a fixed pool (oldest gives way), scratch vectors
  for the frame loop, ripple and footprint meshes reused.
- **The HUD writes text only when it changes** (`setText`), since it updates every frame.
- **Reset shared state when switching modes**: a planet camera tilted `camera.up` and left
  Euler x/z on the player; the island camera must set `camera.up` back and models must use
  `rotation.set(0, y, 0)`, not just `rotation.y = …`.

**Juice that made Cratelands feel finished** (each gated by reduced motion):
- squash and stretch on hops and stops, a lean into pushes, arms that reach;
- puffs where the player takes off, dust behind slides, shards on pushes, sparks on
  teleports, confetti on a win, a slow camera swing and a little zoom when solved;
- screen shake on falls (a setting);
- goals that pulse until covered, crates that glow on them and flash in turn on the win, a
  ring of light spreading over a pad, a chime that rises with each crate placed;
- idle life: blinks, glances around after a few seconds, a big stretch after a long wait;
- footprints on soft ground (a biome flag), fading;
- a level that rises from the clouds on entry and sinks on exit.

**Photo mode** (`src/ui/screens/photo.ts`): the HUD hides, the camera orbits and zooms under
the player's drag/pinch/wheel/keys, the shutter flashes. WebGL keeps no picture between
frames, so render and `drawImage` the canvas in the same task, add the game's name, then
`toBlob`. Phones get the share sheet (`navigator.share({ files })`), desktops a download.
Offer it from the HUD and from the win summary.

---

## 12. Audio and haptics

- **Audio** synthesized with Web Audio (no files), started on the first user gesture,
  separate music and effects volumes plus a mute flag; music per biome; the music ducks
  under fanfares. A test browser has no audio: say the sounds weren't heard.
- **Haptics** (`src/app/haptics.ts`): named patterns (`push`, `goal`, `win`…) through
  `navigator.vibrate`, a no-op where missing (iPhones), wrapped in try/catch, a setting.
- Sounds and haptics read the simulation's events, never the other way round.

---

## 13. Installable app, updates and icons

- **The update banner** offers a waiting version, never in the middle of a level (a
  `body.is-playing` class gates it); an update waiting at launch takes over before the game
  starts; the app checks for updates when it comes back to the foreground.
- **Stale HTML after an update** (blank page on the user's phone): `cache.addAll` reads the
  HTTP cache, and GitHub Pages sends `max-age=600`, so a release within 10 minutes of the
  last one cached the previous `index.html`, pointing at deleted assets. Cratelands'
  `vite-sw.ts` fixes it: fetch with `cache: 'reload'` and a `?sw=<cache>` tag, check every
  asset the stored `index.html` references is cached, and a new worker takes over and
  reloads a broken client. An inline boot guard in `index.html` (the app sets
  `window.__<game>Booted`) clears the service worker and caches and reloads once if the game
  hasn't started after 12 s. The starter has both (rename `game-`, `__gameBooted`).
- **Icons from a script** (`scripts/dev/icon.ts` → SVGs, `npm run icons` → PNGs with
  `rsvg-convert`):
  - `icon.svg` full bleed (192, 512 and the 180 px `apple-touch-icon`, no transparency);
  - `icon-maskable.svg`: the art scaled into the middle ~80%, because Android masks to a
    circle or squircle and crops the rest; list it with `"purpose": "maskable"`;
  - `favicon.svg`: a close-up of the main object for browser tabs (a whole scene is a
    smudge at 16–32 px).
  - Check a preview sheet (circle mask, squircle, 64/48/32 px) before shipping. Installed
    copies update slowly: Android within about a day, iOS only after re-adding the app.

---

## 14. Release

Every time:
1. `npm run build` and `npm test` pass (gate on the exit code, see 5).
2. Commit the work.
3. `npm version patch` (fixes, polish) or `npm version minor` (features, content); it
   commits and tags. If a stray `.git/index.lock` makes it fail halfway, check the bumped
   `package.json`, then commit and `git tag -a vX.Y.Z` by hand.
4. `git push --follow-tags origin main`. CI builds, tests and deploys Pages.
5. Poll the live site: the version lives in the JS bundle, not `index.html`, so fetch the
   page, find `assets/index-*.js` and grep the version there (and fetch new static files,
   like a new icon, to see they're served).
6. Update the project status in memory.

The service worker's cache is named after a hash of the build, so each deploy replaces
the cached game.

---

## 15. Pitfalls already paid for

- Platform-dependent snapshot output broke CI (compressed sizes, float formatting).
- Clicking through the game in the real browser profile overwrote the user's saves.
- `npm test | tail` in a release chain hid a failure; a red build shipped.
- A respawn loop: untouched runs crashed forever once auto-respawn existed; respawn only
  when a human is riding.
- An impassable obstacle made players quit: every hazard must be beatable with the
  controls the player has, and tests should prove it.
- Measured pieces placed after mud or hazards were measured on the wrong run.
- Ids collided across worlds; a level's name matched a trophy's: one name space, tested.
- Solutions typed from memory into the browser were wrong three times; copy them.
- A generator change silently reshuffled the dailies; the daily snapshot is the alarm.
- A world's decorative art overlapped card text; crop decoration to a strip.
- A flex child with `text-overflow: ellipsis` doesn't ellipsize; make it a block. Flex
  children in a card shrink instead of scrolling; give the scroller `min-height: 0`.
- The sound hint in the footer hid the only mute control on short screens; never hide a
  control with its decoration.
- Outdated copy ("5 spooky levels" after the chapter grew to 12): generate counts from data.
- Another game's dev server on the same port showed the wrong game.
- A mode left the camera's `up` and the player's tilt behind; the next mode inherited them.
- A sheet over the 3D preview hid what it previewed; use a strip and a view offset.
- A new HUD button in the top bar wrapped the level title on phones.
- Vite hot reload doesn't always swap a class's code; reload the page before judging a fix.
- Emissive glow alone barely shows under ACES tone mapping and a bright sun; tint the base
  color too for warnings.
- The service worker cached a stale `index.html` (see 13): blank page after two quick
  releases.

---

## 16. Checklists

**New game kickoff**
- [ ] Copy `web-game-starter`, `npm ci`; rename the storage prefix, title, colors, manifest;
      pick a dev port of its own.
- [ ] Rename the starter's cache prefix and boot flag; redraw the icon (`scripts/dev/icon.ts`,
      `npm run icons`); copy bigger systems from Cratelands as needed (photo mode, solver).
- [ ] Decide the core loop and what is deterministic: fixed step (real time) or a state per
      move (turn-based); define the inputs and the events.
- [ ] Set up CI and Pages on day one; show the version on the title.
- [ ] Write the first headless test before the first level.
- [ ] Text through `t()` from the first screen; settings for motion, shake, haptics, sound.
- [ ] Save the user's decisions in memory.

**New mechanic**
- [ ] State added at the end of the buffer, serialized, replay-safe; derived state derived.
- [ ] A mechanics test (it works, it's deterministic, old content's snapshots unchanged).
- [ ] Solver and generator support; editor support; help entry with a picture; tip on the
      first level using it; i18n in every language.
- [ ] Every variant can still finish the content that uses it.

**New mode**
- [ ] A flow in `src/modes/` over the shared `play()`; a title entry (and a "New" badge),
      a one-time intro card.
- [ ] Content through the pipeline; tests cover its levels (solutions, par, curve, i18n).
- [ ] Help (Modes tab and any new HUD button), trophies, music, the title showcase.
- [ ] Mode switching resets what it changed (camera, view offsets, model rotations).
- [ ] Built on a feature branch if experimental; merged when the user approves.

**Polish pass**
- [ ] Inventory what exists first (effects, sounds, settings), then fill real gaps.
- [ ] Every effect gated by reduced motion; warnings proven never wrong; a setting for any
      that some players dislike.
- [ ] Check the HUD fits at 412 px with the new buttons; size help pictures alike.

**Content batch**
- [ ] Levels in the world file (built or generated), registered in the level list.
- [ ] Solutions and par regenerated (`solveall`), par proven; input levels fail untouched.
- [ ] The curve looks right; `curvetest` passes; medals regenerated.
- [ ] Snapshot diffs read, then accepted.

**Release**
- [ ] Build + tests green (exit code); browser check at desktop, phone portrait, phone
      landscape, in an isolated context, console clean.
- [ ] Commit, `npm version`, push with tags, poll the live bundle.
- [ ] Report what changed, what wasn't checked, the known limits, and ask what's next.
