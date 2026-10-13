import { h } from '../dom';
import { icon } from '../icons';
import { t } from '../../i18n';

/** How to install on iPhone and iPad: Safari has no install prompt, only the share sheet. */
export function showInstallHelp(click: () => void): Promise<void> {
  const el = h(
    'div',
    'modal',
    `<div class="card">
      <h2>${t('install.title')}</h2>
      <p class="summary-time">${t('install.sub')}</p>
      <ol class="install-steps">
        <li><span>${t('install.step1', { icon: icon('share', 18) })}</span></li>
        <li><span>${t('install.step2', { icon: icon('plusSquare', 18) })}</span></li>
        <li><span>${t('install.step3')}</span></li>
      </ol>
      <div class="actions"><button class="big-btn primary" data-done>${t('install.ok')}</button></div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-done]') && target !== el) return;
      click();
      el.remove();
      resolve();
    };
    document.body.append(el);
  });
}
