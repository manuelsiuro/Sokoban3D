import { h } from '../dom';
import { icon } from '../icons';
import { t } from '../../i18n';

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
     <span class="update-text"><b>${t('update.ready', { v: version ? ` v${version}` : '' })}</b><small>${t('update.sub')}</small></span>
     <button class="big-btn primary small-btn" data-u="restart">${t('update.restart')}</button>
     <button class="icon-btn flat" data-u="later" aria-label="${t('update.later')}">${icon('close', 18)}</button>`,
  );
  el.onclick = (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-u]');
    if (!b) return;
    if (b.dataset.u === 'restart') {
      b.textContent = t('update.restarting');
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
