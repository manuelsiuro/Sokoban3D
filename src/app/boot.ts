import { migrateStorage } from '../game/storage';

// Imported first by main.ts: saves are upgraded before anything reads them (settings load
// when src/app/context.ts is imported).
migrateStorage();
// The boot guard in index.html stands down: the game started.
(window as { __cratelandsBooted?: boolean }).__cratelandsBooted = true;
