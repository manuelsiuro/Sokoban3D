# Working on Cratelands

A 3D Sokoban built from **web-game-starter**. Follow `docs/PLAYBOOK.md` (the method) and
`docs/PLAN.md` (this game's design, worlds and phases).

Rules that matter every time:
- **The simulation is deterministic and turn-based** (`src/sim/`): state from moves only, no
  DOM or Three.js there. New state sections go at the end of the buffer.
- **Content is data** (`src/levels/worlds/`). Par and solutions are never written by hand:
  `npx tsx scripts/dev/solveall.ts <id>` regenerates `src/levels/solutions.ts`; the tests prove
  each solution solves its level and that par is optimal.
- **`npm test`** runs `scripts/*test*.ts` against golden outputs in `scripts/snapshots/`
  (`-u` to accept, after reading the diff). Keep snapshot output platform-independent.
- **Storage** only through `src/game/storage.ts` (prefix `cratelands`, never throws, migrations).
- **UI**: screens are functions returning a Promise; check desktop, 412×915 and 915×412.
- **Browser tests in an isolated browser context**, so the player's saves are never touched.
  Another project's dev server may hold port 5199; use another port.
- **Release**: build + tests green → commit → `npm version patch|minor` (local only for now;
  no remote yet).
