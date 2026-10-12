/**
 * Installing the game as an app. Chrome and Edge (Android, desktop) offer a prompt the
 * page can open from a button; iPhone and iPad install from Safari's share sheet, so they
 * get instructions instead. Nothing to offer when the game already runs installed.
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPrompt | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((f) => f());
// The browser's own install offer is held back so the game can offer it on its title
// screen (which must then show it: see onInstallChange).
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
  changed();
});
addEventListener('appinstalled', () => {
  deferred = null;
  changed();
});

/** Calls back when installing becomes possible (the browser's offer often comes a moment after load) or is done. */
export function onInstallChange(f: () => void) {
  listeners.add(f);
  return () => listeners.delete(f);
}

export const isInstalled = () => matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/** What the install entry can do here: open the browser's prompt, show iOS steps, or nothing. */
export function installKind(): 'prompt' | 'ios' | null {
  if (isInstalled()) return null;
  if (deferred) return 'prompt';
  return isIOS() ? 'ios' : null;
}

/** Opens the browser's install prompt; true when the player accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const p = deferred;
  deferred = null;
  changed();
  await p.prompt();
  return (await p.userChoice).outcome === 'accepted';
}
