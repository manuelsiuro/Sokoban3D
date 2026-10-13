import type { Settings } from '../../game/settings';
import { h } from '../dom';
import { icon } from '../icons';
import { t, type Key } from '../../i18n';

/** Settings: sound, music, motion, and resetting progress (two presses, no browser dialog). */
export function showSettings(
  s: Settings,
  hooks: { change: (s: Settings) => void; reset: () => void; install: 'prompt' | 'ios' | null; promptInstall: () => Promise<boolean>; installHelp: () => Promise<void>; click: () => void; tier?: string },
): Promise<void> {
  const row = (key: 'muted' | 'music' | 'reducedMotion' | 'ghost' | 'shake' | 'haptics' | 'symbols', label: string, on: boolean) => `<label class="set-row"><span>${label}</span><input type="checkbox" data-k="${key}" ${on ? 'checked' : ''}><i class="switch"></i></label>`;
  const slider = (key: 'sfxVolume' | 'musicVolume', label: string) => `<label class="set-row"><span>${label}</span><input type="range" min="0" max="1" step="0.05" value="${s[key]}" data-k="${key}"></label>`;
  const body = () => `<div class="card settings-card">
      <div class="card-head"><h2>${t('settings.title')}</h2><button class="icon-btn" data-done aria-label="${t('common.close')}">${icon('close', 18)}</button></div>
      <div class="set-body">
      <h3 class="set-group">${icon('sound', 15)} ${t('settings.sound')}</h3>
      <div class="set-list">
        ${row('muted', t('settings.sfx'), !s.muted)}
        ${slider('sfxVolume', t('settings.sfxVolume'))}
        ${row('music', t('settings.music'), s.music)}
        ${slider('musicVolume', t('settings.musicVolume'))}
      </div>
      <h3 class="set-group">${icon('gamepad', 15)} ${t('settings.play')}</h3>
      <div class="set-list">
        ${row('ghost', t('settings.ghost'), s.ghost)}
        ${row('symbols', t('settings.symbols'), s.symbols)}
        ${row('shake', t('settings.shake'), s.shake)}
        ${typeof navigator.vibrate === 'function' ? row('haptics', t('settings.haptics'), s.haptics) : ''}
        ${row('reducedMotion', t('settings.reducedMotion'), s.reducedMotion)}
      </div>
      <h3 class="set-group">${icon('star', 15)} ${t('settings.graphics')}</h3>
      <div class="set-list">
        <label class="set-row"><span>${t('settings.quality')}${hooks.tier ? ` <small class="set-note">${t('settings.now', { tier: t(`settings.q.${hooks.tier}` as Key) })}</small>` : ''}</span><select data-k="quality">${(['auto', 'high', 'medium', 'low'] as const).map((q) => `<option value="${q}" ${s.quality === q ? 'selected' : ''}>${t(`settings.q.${q}`)}</option>`).join('')}</select></label>
        <label class="set-row"><span>${t('settings.language')}</span><select data-k="lang">${(['auto', 'en', 'fr'] as const).map((l) => `<option value="${l}" ${s.lang === l ? 'selected' : ''}>${l === 'auto' ? t('settings.lang.auto') : l === 'en' ? 'English' : 'Français'}</option>`).join('')}</select></label>
      </div>
      ${hooks.install === 'prompt' ? `<button class="big-btn ghost" data-install>${icon('download', 16)} ${t('settings.install')}</button>` : ''}
      ${hooks.install === 'ios' ? `<button class="big-btn ghost" data-install-help>${icon('download', 16)} ${t('settings.install')}</button>` : ''}
      <button class="big-btn ghost danger" data-reset>${icon('replay', 16)} ${t('settings.reset')}</button>
      </div>
      <div class="actions"><button class="big-btn primary" data-done>${t('settings.done')}</button></div>
    </div>`;
  const el = h('div', 'modal', body());
  return new Promise((resolve) => {
    el.addEventListener('input', (e) => {
      const input = e.target as HTMLInputElement;
      const k = input.dataset.k as keyof Settings | undefined;
      if (!k) return;
      if (k === 'quality') s.quality = input.value as Settings['quality'];
      else if (k === 'lang') s.lang = input.value as Settings['lang'];
      else if (k === 'muted') s.muted = !input.checked;
      else if (input.type === 'checkbox') (s as unknown as Record<string, boolean>)[k] = input.checked;
      else (s as unknown as Record<string, number>)[k] = Number(input.value);
      hooks.change(s);
      // A new language: draw the card again in it.
      if (k === 'lang') {
        const top = el.querySelector('.set-body')?.scrollTop ?? 0;
        el.innerHTML = body();
        el.querySelector('.set-body')!.scrollTop = top;
      }
    });
    let armed = false;
    el.onclick = (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-done]') || target === el) {
        hooks.click();
        el.remove();
        resolve();
      } else if (target.closest('[data-install]')) {
        const b = target.closest<HTMLElement>('[data-install]')!;
        hooks.click();
        hooks.promptInstall().then((ok) => {
          if (ok) b.remove();
        });
      } else if (target.closest('[data-install-help]')) {
        hooks.click();
        hooks.installHelp();
      } else if (target.closest('[data-reset]')) {
        const b = target.closest<HTMLElement>('[data-reset]')!;
        hooks.click();
        if (!armed) {
          armed = true;
          b.innerHTML = `${icon('replay', 16)} ${t('settings.resetArmed')}`;
          b.classList.add('armed');
          return;
        }
        hooks.reset();
        b.innerHTML = `${icon('check', 16)} ${t('settings.resetDone')}`;
        b.setAttribute('disabled', '');
      }
    };
    document.body.append(el);
  });
}
