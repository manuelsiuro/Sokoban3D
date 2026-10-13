import type { View } from '../../render/View';
import { TOUCH, h } from '../dom';
import { icon } from '../icons';
import { t } from '../../i18n';

/**
 * Photo mode: the HUD steps aside, the player turns and zooms the camera (drag, pinch, wheel,
 * arrow keys) and takes a picture of the island, saved or shared as a PNG. Resolves on close.
 */
export function photoMode(view: View, caption: string, file: string, hooks: { click: () => void; shutter: () => void }): Promise<void> {
  const el = h(
    'div',
    'photo-mode',
    `<div class="photo-top">
      <button class="icon-btn" data-close aria-label="${t('common.close')}">${icon('close', 20)}</button>
      <p class="photo-help">${t(TOUCH ? 'photo.helpTouch' : 'photo.help')}</p>
    </div>
    <div class="photo-flash"></div>
    <div class="photo-bar">
      <button class="photo-shutter" data-shoot aria-label="${t('photo.take')}">${icon('camera', 30)}</button>
    </div>
    <p class="photo-saved" role="status" aria-live="polite"></p>`,
  );
  view.photo = true;
  document.body.classList.add('is-photo');
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch = 0;
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const centre = () => {
    const ps = [...pointers.values()];
    return { x: ps.reduce((n, p) => n + p.x, 0) / ps.length, y: ps.reduce((n, p) => n + p.y, 0) / ps.length };
  };
  let from = { x: 0, y: 0 };
  const onStage = (e: Event) => !(e.target as HTMLElement).closest('button');
  el.addEventListener('pointerdown', (e) => {
    if (!onStage(e)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* gone already */
    }
    from = centre();
    pinch = spread();
  });
  el.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const m = centre();
    view.spin(m.x - from.x, m.y - from.y);
    from = m;
    const d = spread();
    if (pinch && d) view.zoom(pinch / d);
    pinch = d;
  });
  const lift = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size) from = centre();
    pinch = spread();
  };
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      view.zoom(Math.exp(Math.max(-60, Math.min(60, e.deltaY)) * 0.004));
    },
    { passive: false },
  );

  const saved = el.querySelector<HTMLElement>('.photo-saved')!;
  let busy = false;
  const shoot = async () => {
    if (busy) return;
    busy = true;
    hooks.shutter();
    const flash = el.querySelector<HTMLElement>('.photo-flash')!;
    flash.classList.remove('go');
    void flash.offsetWidth;
    flash.classList.add('go');
    const blob = await view.snapshot(caption);
    busy = false;
    if (!blob) return;
    const name = `${file}.png`;
    let said = t('photo.saved');
    try {
      const f = new File([blob], name, { type: 'image/png' });
      // Phones: the share sheet (save to photos, send). Elsewhere: a download.
      if (TOUCH && navigator.canShare?.({ files: [f] })) {
        await navigator.share({ files: [f] });
        said = t('photo.shared');
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }
    } catch {
      // The share sheet was closed: nothing to say.
      said = '';
    }
    saved.textContent = said;
    saved.classList.toggle('show', !!said);
    setTimeout(() => saved.classList.remove('show'), 2200);
  };

  return new Promise((resolve) => {
    const close = () => {
      removeEventListener('keydown', onKey, true);
      view.photo = false;
      document.body.classList.remove('is-photo');
      el.remove();
      resolve();
    };
    const onKey = (e: KeyboardEvent) => {
      // Photo mode takes every key while it's open.
      e.stopPropagation();
      const turn: Record<string, [number, number]> = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -20], ArrowDown: [0, 20], KeyA: [-30, 0], KeyD: [30, 0], KeyW: [0, -20], KeyS: [0, 20] };
      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        hooks.click();
        close();
      } else if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        shoot();
      } else if (turn[e.code]) {
        e.preventDefault();
        view.spin(...turn[e.code]);
      } else if (e.key === '+' || e.key === '=' || e.key === '-') {
        e.preventDefault();
        view.zoom(e.key === '-' ? 1.1 : 0.9);
      }
    };
    addEventListener('keydown', onKey, true);
    el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (!b) return;
      if (b.dataset.close !== undefined) {
        hooks.click();
        close();
      } else if (b.dataset.shoot !== undefined) shoot();
    });
    document.body.append(el);
  });
}
