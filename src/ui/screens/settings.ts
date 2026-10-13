import type { Settings } from '../../game/settings';
import { h } from '../dom';
import { icon } from '../icons';

/** Settings: sound, music, motion, and resetting progress (two presses, no browser dialog). */
export function showSettings(
  s: Settings,
  hooks: { change: (s: Settings) => void; reset: () => void; install: 'prompt' | 'ios' | null; promptInstall: () => Promise<boolean>; installHelp: () => Promise<void>; click: () => void },
): Promise<void> {
  const row = (key: 'muted' | 'music' | 'reducedMotion' | 'ghost', label: string, on: boolean) => `<label class="set-row"><span>${label}</span><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''}><i class="switch"></i></label>`;
  const slider = (key: 'sfxVolume' | 'musicVolume', label: string) => `<label class="set-row"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-k="${key}"></label>`;
  const el = h(
    'div',
    'modal',
    `<div class="card settings-card">
      <div class="card-head"><h2>Settings</h2><button class="icon-btn" data-done aria-label="Close">${icon('close', 18)}</button></div>
      <h3 class="set-group">${icon('sound', 15)} Sound</h3>
      <div class="set-list">
        ${row('muted', 'Sound effects', !s.muted)}
        ${slider('sfxVolume', 'Effects volume')}
        ${row('music', 'Music', s.music)}
        ${slider('musicVolume', 'Music volume')}
      </div>
      <h3 class="set-group">${icon('gamepad', 15)} Play</h3>
      <div class="set-list">
        ${row('ghost', 'Ghost of your best run', s.ghost)}
        ${row('reducedMotion', 'Reduced motion', s.reducedMotion)}
      </div>
      ${hooks.install === 'prompt' ? `<button class="big-btn ghost" data-install>${icon('download', 16)} Install the app</button>` : ''}
      ${hooks.install === 'ios' ? `<button class="big-btn ghost" data-install-help>${icon('download', 16)} Install the app</button>` : ''}
      <button class="big-btn ghost danger" data-reset>${icon('replay', 16)} Reset progress</button>
      <div class="actions"><button class="big-btn primary" data-done>Done</button></div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.addEventListener('input', (e) => {
      const t = e.target as HTMLInputElement;
      const k = t.dataset.k as keyof Settings | undefined;
      if (!k) return;
      if (k === 'muted') s.muted = !t.checked;
      else if (t.type === 'checkbox') (s as unknown as Record<string, boolean>)[k] = t.checked;
      else (s as unknown as Record<string, number>)[k] = Number(t.value);
      hooks.change(s);
    });
    let armed = false;
    el.onclick = (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-done]') || t === el) {
        hooks.click();
        el.remove();
        resolve();
      } else if (t.closest('[data-install]')) {
        const b = t.closest<HTMLElement>('[data-install]')!;
        hooks.click();
        hooks.promptInstall().then((ok) => {
          if (ok) b.remove();
        });
      } else if (t.closest('[data-install-help]')) {
        hooks.click();
        hooks.installHelp();
      } else if (t.closest('[data-reset]')) {
        const b = t.closest<HTMLElement>('[data-reset]')!;
        hooks.click();
        if (!armed) {
          armed = true;
          b.innerHTML = `${icon('replay', 16)} Press again to erase all stars`;
          b.classList.add('armed');
          return;
        }
        hooks.reset();
        b.innerHTML = `${icon('check', 16)} Progress reset`;
        b.setAttribute('disabled', '');
      }
    };
    document.body.append(el);
  });
}
