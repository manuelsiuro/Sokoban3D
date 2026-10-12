# Web Game Playbook

What building **Line Rider 3D** taught us, written so the next game starts from it, not from zero.
It covers the working method, the architecture, content at scale, testing, UI, progression and
release. Line Rider 3D paths are given as examples (`src/...`); the starter template
(`~/ClaudeProjects/web-game-starter`, a small demo game) already contains the reusable parts.

**How to use it**
- Starting a new game: read **1. Working method** and **13. Checklists**, then copy the starter.
- Adding a feature: check the matching section's rules before writing code.
- Something went wrong: **12. Pitfalls** lists the mistakes already paid for.

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

Rules that kept it safe:
- **Browser tests run in an isolated context** (or snapshot every `game.*` storage key first
  and restore it after). One early test autosaved over the user's own track.
- **Report honestly.** If the browser check was skipped, or 10 cases stay unsolved, say so.
- **Memory**: keep project status, user decisions and hard-won lessons in memory files, so a
  new session (or a compacted one) picks up where the last left off.
- **Feedback with screenshots** is the best signal: fix exactly what the screenshot shows,
  then look for the same problem elsewhere (a cut-off label is rarely the only one).

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

Layout (Line Rider 3D):

```
src/
  main.ts          wiring: builds the core, the controllers, the flows between screens
  app/             controllers: core objects, session state, input, run, quality, worlds
  physics/         deterministic simulation (no Three.js rendering here)
  render/          views that read the simulation and draw it
  game/            progress, settings, storage, achievements, medals, sharing
  levels/          content definitions, builders, templates, generated tables
  world/           biomes, sky, terrain, weather, decor
  ui/              UI shell, dom helpers, icons, one file per screen
  styles/          numbered CSS files (01-base … 24-…), imported by index.css
scripts/
  test.ts          the test runner; *test*.ts files are the tests
  snapshots/       golden outputs
  dev/             probes, solvers and generators (not tests)
.github/workflows/ci.yml
```

- **`base: './'`** in `vite.config.ts` so the build works under any Pages sub-path.
- **The version** comes from `package.json` through Vite `define` (`__APP_VERSION__`) and is
  shown in a corner of the title screen, so anyone can tell which build a phone is running.
  A dev plugin restarts the server when `npm version` changes it.
- **One `core` object** (`src/app/core.ts`) holds the long-lived objects (scene, simulation,
  views, sound, settings, UI). Controllers receive it; nothing is a global singleton.
- **One session state** (`src/app/session.ts`): a tagged union of what the player is doing
  (`title | edit | level | daily | puzzle`) plus small predicates (`editing(s)`,
  `fixedTrack(s)`). Rules ask the predicates, never compare kinds all over the code.

---

## 3. Simulation architecture

The single most valuable decision: **the game state is a deterministic function of the
inputs.**

- **Fixed step** (40 steps/s), never `dt`-driven. Rendering interpolates or just shows the
  latest frame.
- **Every frame is recorded** into a flat `Float64Array` (positions, then a META block of
  counters and flags: crashed, contact, events, stars, checkpoint, jump charge…). `seek(f)`
  replays from the nearest recorded frame. Scrubbing, replays, ghosts, photo mode and
  respawn all come from this for free.
- **Inputs are data**: a bit mask per step (`push 1, brake 2, spin 4, jump 8`). A whole run
  is an **input plan**, a list of `[frame, mask]` changes. Ghosts and stored solutions are
  plans, so they stay tiny and exact.
- **Events are a bit mask per step** (`ring, bounce, star, finish, checkpoint, respawn,
  jump`). Sound, particles, popups and stats read the events; the physics never calls them.
- **Any change that affects physics invalidates the recording** (track revision, vehicle,
  gravity, ground drag). Decor and cosmetics don't bump the revision.
- **New state goes at the end of the buffer layout** and stays deterministic, so old
  replays keep working (crumble-line timers live in the state too).
- **Variants are data**: `VehicleDef` (points, bones, contact modes, handling numbers) and
  `BiomeDef` (surface drag, gravity, weather, palette). A new ride or world is mostly a new
  entry. Keep the original variant bit-identical when adding assists to new ones.

Determinism makes testing exact: a snapshot of finish times and trajectories catches any
physics drift (see 5).

---

## 4. Content at scale

100 levels and 100 puzzles were built in four batches. What made that possible:

**Content as code, grouped by chapter.** `src/levels/worlds/<world>.ts` exports `levels`
and `puzzles` arrays in play order. Each level is `{ id, name, difficulty 1–5, world, tip,
solution?, build(track) }`.

**Builders that measure instead of guess.** Helpers ride the real physics while building:
- `measureArc(track, fromX)`: the flight path of an untouched run from a takeoff.
- `landing(track, x, y, drop, floor)`: a landing ramp that follows that measured arc.
- `riderLine(track, xs)`: where the rider actually passes, to place stars and rings on it.
- Call the world setup (`home(t, { biome })`) first, so measuring uses that world's
  gravity and ground. Place measured pieces **before** anything that changes an untouched
  run (mud, hazards).

**Templates with known solutions.** A puzzle template (`src/levels/puzzleKit.ts`) builds a
family from a few numbers and also provides the solution; the tests ride every solution.
Thirteen puzzles for a world are thirteen calls with different numbers and names.

**Solvers for anything that needs input.** `scripts/dev/jumpsolve.ts`: ride the level; at
each failure, try every candidate action (a jump released at each step, holds of 4, 12 or
24 steps, brake stretches) in a window before the failure, and keep the one that gets
furthest. It prints the plan to paste as the level's `solution`. Options: an autopilot that
pushes on contact, brakes on/off, a wider window for slow worlds.

**Generated tables, never edited by hand.** Medal times (`src/levels/medals.ts`) and
per-ride solutions (`src/levels/rideSolutions.ts`) are written by scripts, marked "Generated
by … do not edit", and checked by tests. Long jobs run in parallel shards
(`scripts/dev/ridesolveall.sh`: 12 shards, ~70 min for 137 cases).

**A difficulty curve that is checked.** `scripts/curvetest.ts`: ids unique, a world's levels
together and in order, difficulty never drops inside a world, every star gate reachable.
`scripts/dev/levelstats.ts` prints length, time, airtime, top speed, inputs needed, hazards
and checkpoints per level, so the curve is visible.

**Pacing inside a world**: the first levels teach the new mechanic alone, the middle ones
combine it with older ones, the last is a long showpiece with checkpoints. Rotate puzzle
kinds so no two in a row are the same.

---

## 5. Testing

**Runner** (`scripts/test.ts`): every `scripts/*test*.ts` runs in parallel as its own
process; a test fails by exiting non-zero (`check(ok, message)` from `scripts/assert.ts`).
Each test's **stdout is compared with a golden file** in `scripts/snapshots/`.
`npm test -- -u` accepts new output; `npm test -- name` filters. On CI, failures also become
GitHub annotations.

**What the tests guarantee** (Line Rider 3D has 21):
- Every level finishes with all stars: untouched, or with its stored solution. A level with
  a solution must **fail** untouched (otherwise it doesn't really need input).
- Every no-input level finishes with **every** ride; per-ride solutions must work for their
  ride.
- Every puzzle's solution finishes within par; no puzzle completes by itself.
- Medal times are ordered and match the physics (a sample is recomputed).
- Storage migrations, share links (round trip), ghosts, mechanics (mud, crumble, hazards,
  checkpoints, gravity, jump heights), editor pieces, the daily generator.
- The campaign curve and gates (see 4).

**Rules**
- Snapshots must not contain platform-dependent output (compressed sizes, long float
  prints): CI runs Linux and Node 22, development ran macOS and Node 23.
- When a snapshot changes, read the diff before accepting: additions are expected, changed
  lines in old content are a red flag.
- Probes and one-off investigations live in `scripts/dev/`, never in the test glob.
- Trace tools pay off: `levelcheck <id> [untouched]` prints the body's path every 20 steps
  and why it crashed; `plancheck <id> '<plan>'` tries any plan.

---

## 6. Progression and replay value

- **Stars**: 3 per level, placed on the measured line (some only reachable with a jump).
- **Unlocks never take things away.** A level opens with one star on the previous one; a
  world opens at a star total of about 55% of the stars before it; worlds already played in
  stay open when gates change.
- **Medals** (bronze, silver, gold, dev) per level and ride, computed from two reference
  runs: letting it ride, and an autopilot that pushes. Gold ≈ the autopilot +3%.
- **Achievements**: per world (3 stars everywhere), per ride (challenges that unlock paint
  jobs), firsts and streaks. Cosmetics (outfits, paint) are the rewards.
- **Daily ride**: a track generated from the date's seed, the same for everyone, with a
  streak counter and a share link.
- **Ghosts and challenge links**: a share link carries the track, the ride, the score and
  the ghost's input plan, versioned and compressed.
- **Seasons**: a seasonal chapter (Haunted Hollow) and costumes, on a date window, switchable
  in Settings.
- **Puzzles** ("fix the track") reuse the levels' physics with limited ink, rings to place,
  lines to erase, one-line or trick goals. The third star is for par.

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
- **Low gravity changes everything**: the rider is slow (slopes need ~0.14+), crumbling
  slabs must be short (~10 m), jumps fly ~30 m, hill crests throw the rider off, falls take
  long (widen the solver's search window).
- **A braking level** needs the untouched run to overshoot and the finish placed so the
  overshooting flight passes above the gate.
- **The solver finds shortcuts** (a hop instead of a brake). If the intent matters, check
  hand-written plans and store those.
- **Hazards are capsules** a little smaller than their models, so a near miss that looks
  clean is clean.

---

## 8. Persistence

`src/game/storage.ts` is the only code that touches `localStorage`:
- **All keys in one `KEYS` table**, with a game prefix (`lr3d.*`). `PROGRESS_KEYS` lists what
  "Reset progress" wipes; preferences survive it.
- **Never throws**: storage can be missing, full or blocked (private windows). Reads fall
  back to a default of the right shape; writes return `false`.
- **Versioned with migrations**: `SAVE_VERSION` and a `MIGRATIONS` array; a migration that
  can't finish (storage full) returns `false` and is retried next start; saves from a newer
  build are left alone.
- **New fields are optional** in saved formats and share links, so old saves and links keep
  loading. Share links carry their own version byte.
- **Settings** are one object merged over defaults (`{ ...DEFAULTS, ...saved }`), so new
  settings get defaults automatically. A mute switch is its own flag, separate from the
  volumes.

---

## 9. UI system

- **Screens are functions returning a Promise** of the player's choice
  (`showLevels(...) → Promise<number | null>`). Flows read like a script:
  `const i = await pickLevel(); if (i === null) back(); else start(i);`.
- **Markup is template strings** built with `h(tag, class, html)`; icons are an inline SVG set
  (`icon(name, size)`, 24×24 strokes in `currentColor`). Inline SVG `.ic` is `display: block`
  by default, so inside running text give it `display: inline-block` or it breaks the line.
- **Design tokens** in CSS variables (`--ink`, `--ink-soft`, `--shadow`, `--gold`, fonts,
  easings). Theming by data attribute: `[data-world='volcano'] { --world: …; --world-2: …;
  --scene: url(svg) }`, used by cards, tabs, icons and banners alike.
- **Card patterns** that the game reuses everywhere:
  - two-line cards (icon tile, title, a line of facts, pill on the right), e.g. Play,
    Daily, Create;
  - menu entries with a colored icon, a sub-line of live facts and a thin progress bar
    along the bottom edge (`--done: 42%`);
  - level cards with difficulty pips, stars, badges, and the world's skyline as a cropped
    strip at the bottom, under the text.
- **Tabs for big lists** (one world at a time) instead of one long scroll; locked tabs keep
  their own icon with a small padlock badge; a lock banner shows a progress bar and the
  exact number still needed.
- **Phone first**: every screen is checked at ~412×915 portrait and ~915×412 landscape.
  Garage/wardrobe-style screens are a bottom sheet with one sideways carousel, so the 3D
  preview stays visible; on desktop the carousel gets arrows and wheel scrolling.
- **Touch is detected once** (`MOBILE`, `TOUCH`, a `touch` class on `body`); keyboard
  shortcut hints are stripped from labels on touch.
- **Respect `prefers-reduced-motion`** for every looping animation (sheens, nudges, pulses).
- Keep one specificity rule in mind: later files win at equal specificity, so phone and
  landscape overrides must be at least as specific as the rule they override.

---

## 10. Rendering and performance

- **Auto quality** (`src/app/Quality.ts`): measure the frame rate over a window and step
  pixel ratio, shadow map size, bloom and scenery density down (or up); a manual setting
  overrides it. Low-power devices start at medium.
- **Procedural models**: every rider, vehicle, decor piece and hazard is built from Three.js
  primitives in code. Colors come from data (outfits, paints, world palettes).
- **Worlds**: a sky shader with uniforms (stars, Earth), fog, weather particles reused across
  kinds, a far terrain that is visual only (physics never depends on decor).
- **The HUD writes text only when it changes** (`setText`), since it updates every frame.

---

## 11. Audio and release

**Audio**: synthesized with Web Audio (no files), started on the first user gesture,
separate music and effects volumes plus a mute flag; ride sounds follow speed and contact.

**Release**, every time:
1. `npm run build` and `npm test` pass.
2. Commit the work.
3. `npm version patch` (fixes, polish) or `npm version minor` (features, content); it
   commits "Release vX.Y.Z" and tags.
4. `git push --follow-tags origin main`. CI builds, tests and deploys Pages.
5. Poll the live site: the version lives in the JS bundle, not `index.html`, so fetch the
   page, find `assets/index-*.js` and grep the version there.

The service worker's cache is named after a hash of the build, so each deploy replaces
the cached game.

---

## 12. Pitfalls already paid for

- Platform-dependent snapshot output broke CI (compressed sizes, float formatting).
- Clicking through the game in the real browser profile autosaved over the user's track.
- A respawn loop: untouched runs crashed forever once auto-respawn existed; respawn only
  when a human is riding.
- Charging a jump in the air felt wrong; charge only on the ground, and buffer a release
  in the air for a few steps.
- An impassable obstacle (a cactus too tall to jump) made players quit: every hazard must
  be beatable with the controls the player has, and tests should prove it.
- Measured pieces placed after mud or hazards were measured on the wrong run.
- Level and puzzle ids collided across worlds: keep one id space and test uniqueness.
- A world's decorative art overlapped card text; crop decoration to a strip.
- A flex child with `text-overflow: ellipsis` doesn't ellipsize; make it a block.
- The sound hint in the footer hid the only mute control on short screens; never hide a
  control with its decoration.
- Outdated copy ("5 spooky levels" after the chapter grew to 12): generate counts from data.

---

## 13. Checklists

**New game kickoff**
- [ ] Copy `web-game-starter`; rename the storage prefix, title, colors, manifest.
- [ ] Decide the core loop and what is deterministic; define the input mask and events.
- [ ] Set up CI and Pages on day one; show the version on the title.
- [ ] Write the first headless test before the first level.
- [ ] Save the user's decisions in memory.

**New mechanic**
- [ ] State added at the end of the buffer, serialized, replay-safe.
- [ ] A mechanics test (it works, it's deterministic, old content unchanged).
- [ ] Editor and builder support; help text; tips on the first level using it.
- [ ] Every ride/variant can still finish the content that uses it.

**Content batch**
- [ ] Levels in the world file, measured pieces first, `home()` first for odd worlds.
- [ ] Input levels solved (`jumpsolve`), untouched run fails.
- [ ] Puzzles from templates; every solution within par.
- [ ] `levelstats` curve looks right; `curvetest` passes; medals regenerated.
- [ ] Snapshot diffs read, then accepted.

**Release**
- [ ] Build + tests green; browser check at desktop, phone portrait, phone landscape.
- [ ] Commit, `npm version`, push with tags, poll the live bundle.
- [ ] Report what changed, what wasn't checked, the known limits, and ask what's next.
