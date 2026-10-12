import { h } from '../dom';
import { icon } from '../icons';

/** How to install on iPhone and iPad: Safari has no install prompt, only the share sheet. */
export function showInstallHelp(click: () => void): Promise<void> {
  const el = h(
    'div',
    'modal',
    `<div class="card">
      <h2>Install Cratelands</h2>
      <p class="summary-time">Play full screen and offline, from your home screen.</p>
      <ol class="install-steps">
        <li><span>In Safari, tap Share ${icon('share', 18)}</span></li>
        <li><span>Choose <b>Add to Home Screen</b> ${icon('plusSquare', 18)}</span></li>
        <li><span>Tap <b>Add</b>, then open Cratelands from your home screen</span></li>
      </ol>
      <div class="actions"><button class="big-btn primary" data-done>Got it</button></div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-done]') && t !== el) return;
      click();
      el.remove();
      resolve();
    };
    document.body.append(el);
  });
}
