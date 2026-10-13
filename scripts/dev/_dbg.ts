import { readFileSync } from 'node:fs';
const cache = JSON.parse(readFileSync(new URL('./.buildcache/grand.json', import.meta.url), 'utf8'));
const c = Object.values(cache)[0] as any;
console.log(JSON.stringify(c.level.tiles), JSON.stringify(c.level.heights), JSON.stringify(c.level.map));
