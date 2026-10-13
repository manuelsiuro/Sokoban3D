import { t } from '../i18n';

/** Small DOM helpers shared by the HUD and the screens. */

export const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
};

/** Writes text only when it changed (the HUD updates every frame). */
export function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

const ua = navigator.userAgent;
/** A phone or tablet by its own word (iPadOS says "Macintosh" but has a touch screen). */
export const MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

/** Phones and tablets: no keyboard, no hover. The `touch` class on body mirrors it. */
export const TOUCH = MOBILE || matchMedia('(pointer: coarse)').matches;
document.body.classList.toggle('touch', TOUCH);

/** Fades a screen out, then removes it. */
export function closeOverlay(el: HTMLElement, ms = 250) {
  el.classList.add('leaving');
  setTimeout(() => el.remove(), ms);
}

/**
 * Makes a sideways row of cards easy to scroll with a mouse: arrow buttons over its ends
 * (hidden at either end, and on touch screens) and the vertical wheel scrolling it sideways.
 * Wraps the row in a `.carousel` element.
 */
export function carousel(row: HTMLElement, arrow: (dir: 'left' | 'right') => string) {
  const wrap = document.createElement('div');
  wrap.className = 'carousel';
  row.replaceWith(wrap);
  const prev = document.createElement('button');
  prev.className = 'carousel-arrow prev';
  prev.setAttribute('aria-label', t('scroll.left'));
  prev.innerHTML = arrow('left');
  const next = document.createElement('button');
  next.className = 'carousel-arrow next';
  next.setAttribute('aria-label', t('scroll.right'));
  next.innerHTML = arrow('right');
  wrap.append(prev, row, next);
  const update = () => {
    prev.disabled = row.scrollLeft <= 4;
    next.disabled = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
  };
  const page = (dir: number) => row.scrollBy({ left: dir * row.clientWidth * 0.8, behavior: 'smooth' });
  prev.onclick = (e) => {
    e.stopPropagation();
    page(-1);
  };
  next.onclick = (e) => {
    e.stopPropagation();
    page(1);
  };
  row.addEventListener('scroll', update, { passive: true });
  row.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || row.scrollWidth <= row.clientWidth) return;
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    },
    { passive: false },
  );
  addEventListener('resize', update);
  requestAnimationFrame(update);
  return update;
}

/**
 * Dialogs (every `.modal`): announced as dialogs, focus moved in (and kept in with Tab),
 * Escape presses their close or done button. Watching the page means each screen gets this
 * without wiring it up.
 */
const topModal = () => {
  const all = document.querySelectorAll<HTMLElement>('.modal');
  return all.length ? all[all.length - 1] : null;
};
const focusables = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex]:not([tabindex="-1"])')].filter((b) => b.offsetParent !== null);
new MutationObserver((records) => {
  for (const r of records)
    for (const n of r.addedNodes) {
      if (!(n instanceof HTMLElement) || !n.classList.contains('modal')) continue;
      const card = n.querySelector<HTMLElement>('.card') ?? n;
      if (!card.hasAttribute('role')) card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      const head = card.querySelector('h2');
      if (head && !card.hasAttribute('aria-labelledby') && !card.hasAttribute('aria-label')) card.setAttribute('aria-label', head.textContent ?? '');
      if (!n.contains(document.activeElement)) {
        const first = n.querySelector<HTMLElement>('.primary') ?? focusables(n)[0];
        // Keyboard players land on the main button; on touch screens no ring shows.
        first?.focus({ preventScroll: true, focusVisible: !TOUCH } as FocusOptions);
      }
    }
}).observe(document.body, { childList: true });
addEventListener(
  'keydown',
  (e) => {
    const m = topModal();
    if (!m) return;
    if (e.key === 'Escape') {
      const close = m.querySelector<HTMLElement>('[data-done], [data-back]');
      if (close) {
        e.preventDefault();
        e.stopImmediatePropagation();
        close.click();
      }
    } else if (e.key === 'Tab') {
      const f = focusables(m);
      if (!f.length) return;
      const at = f.indexOf(document.activeElement as HTMLElement);
      if (at < 0 || (e.shiftKey && at === 0) || (!e.shiftKey && at === f.length - 1)) {
        e.preventDefault();
        f[e.shiftKey ? f.length - 1 : 0].focus();
      }
    }
  },
  true,
);
