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
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as InstallPrompt;
});
addEventListener('appinstalled', () => (deferred = null));

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
  await p.prompt();
  return (await p.userChoice).outcome === 'accepted';
}
