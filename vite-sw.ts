import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

/** Every file in a folder, recursively. */
function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}

/**
 * Writes `sw.js` after the build: a service worker that stores the whole
 * game on the device (so the installed app plays offline). Its cache is
 * named after a hash of the build, so a new deploy replaces it.
 */
export function serviceWorker(): Plugin {
  let config: ResolvedConfig;
  return {
    name: 'service-worker',
    apply: 'build',
    configResolved(c) {
      config = c;
    },
    closeBundle() {
      const out = config.build.outDir;
      const files = walk(out)
        .map((f) => relative(out, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'))
        .sort();
      const hash = createHash('sha256').update(SW);
      for (const f of files) hash.update(f).update(readFileSync(join(out, f)));
      const version = hash.digest('hex').slice(0, 12);
      const assets = ['./', ...files.map((f) => `./${f}`)];
      const app = JSON.parse(readFileSync(join(config.root, 'package.json'), 'utf8')).version as string;
      writeFileSync(join(out, 'sw.js'), SW.replace('__VERSION__', version).replace('__APP__', app).replace('__ASSETS__', JSON.stringify(assets)));
    },
  };
}

const SW = `// Generated at build time (vite-sw.ts).
const CACHE = 'cratelands-__VERSION__';
/** The game version this worker serves (shown in the "new version" banner). */
const APP = '__APP__';
const FONTS = 'cratelands-fonts';
const ASSETS = __ASSETS__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('cratelands-') && k !== CACHE && k !== FONTS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks for a waiting update to take over (right after it loads, or when the player restarts).
// The page asks a waiting update which version it brings (answered on the given port).
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  else if (e.data === 'version' && e.ports[0]) e.ports[0].postMessage(APP);
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // The game itself: from the device first (it's a fixed build), the network as a fallback.
    // ignoreVary: module scripts send an Origin header the stored copies were fetched without.
    const key = req.mode === 'navigate' ? './index.html' : req;
    e.respondWith(caches.open(CACHE).then((c) => c.match(key, { ignoreSearch: req.mode === 'navigate', ignoreVary: true })).then((hit) => hit || fetch(req)));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    // Fonts: the stored copy right away, refreshed in the background.
    e.respondWith(
      caches.open(FONTS).then((c) =>
        c.match(req, { ignoreVary: true }).then((hit) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res.ok || res.type === 'opaque') c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || fresh;
        }),
      ),
    );
  }
});
`;
