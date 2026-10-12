import { h } from '../dom';
import { icon } from '../icons';

/**
 * "A new version is ready" banner (the same system as Line Rider 3D). It waits until no
 * level is being played; Restart switches to the new version, Later hides it until the
 * next launch (which takes the update over by itself).
 */
export function showUpdate(version: string | null, restart: () => void) {
  if (document.querySelector('.update-banner')) return;
  const el = h(
    'div',
    'update-banner',
    `<span class="update-ic">${icon('download', 20)}</span>
     <span class="update-text"><b>New version${version ? ` v${version}` : ''} is ready</b><small>Restart to get the latest levels and fixes.</small></span>
     <button class="big-btn primary small-btn" data-u="restart">Restart</button>
     <button class="icon-btn flat" data-u="later" aria-label="Later">${icon('close', 18)}</button>`,
  );
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-u]');
    if (!b) return;
    if (b.dataset.u === 'restart') {
      b.textContent = 'Restarting…';
      restart();
    } else {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 300);
    }
  };
  // Never in the middle of a level: show it once the player is back in the menus.
  const show = () => {
    if (document.body.classList.contains('is-playing')) return void setTimeout(show, 1500);
    document.body.append(el);
  };
  show();
}
