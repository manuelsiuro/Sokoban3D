import { ACHIEVEMENTS, OUTFITS, SKINS, type Ctx } from '../../game/achievements';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Achievements with their progress, and the wardrobe of what they unlocked. */
export function showTrophies(
  ctx: Ctx,
  have: Set<string>,
  unlocked: { skins: Set<string>; outfits: Set<string> },
  chosen: { skin: string; outfit: string },
  hooks: { choose: (kind: 'skin' | 'outfit', id: string) => void; click: () => void },
): Promise<void> {
  const reward = (a: (typeof ACHIEVEMENTS)[number]) => (a.reward?.skin ? `Crate skin: ${SKINS.find((s) => s.id === a.reward!.skin)?.name}` : a.reward?.outfit ? `Outfit: ${OUTFITS.find((o) => o.id === a.reward!.outfit)?.name}` : '');
  const item = (a: (typeof ACHIEVEMENTS)[number]) => {
    const n = Math.min(a.goal, a.count(ctx));
    const done = have.has(a.id);
    return `<div class="trophy ${done ? 'done' : ''}">
      <span class="trophy-ic">${icon(done ? 'trophy' : 'lock', 18)}</span>
      <span class="trophy-text"><b>${a.name}</b><small>${a.desc}${reward(a) ? ` · ${reward(a)}` : ''}</small><i style="--done:${((n / a.goal) * 100).toFixed(1)}%"></i></span>
      <span class="trophy-count">${done ? icon('check', 16) : `${n}/${a.goal}`}</span>
    </div>`;
  };
  const swatch = (kind: 'skin' | 'outfit', id: string, name: string, a: number, b: number, open: boolean, on: boolean) =>
    `<button class="swatch ${on ? 'on' : ''}" data-kind="${kind}" data-id="${id}" ${open ? '' : 'disabled'} title="${name}">
      <i style="background:${a < 0 ? 'linear-gradient(135deg,#d29a55,#8c5a2b)' : `linear-gradient(135deg,${hex(a)} 55%,${hex(b)} 55%)`}"></i>
      <span>${open ? '' : icon('lock', 12)}${name}</span>
    </button>`;
  const el = h(
    'div',
    'screen',
    `<div class="screen-inner">
      <div class="screen-head">
        <button class="icon-btn" data-back aria-label="Back">${icon('chevronLeft')}</button>
        <h2>Trophies</h2>
        <span class="pill big">${icon('trophy', 16)} ${have.size}/${ACHIEVEMENTS.length}</span>
      </div>
      <h3 class="sub-head">Wardrobe</h3>
      <div class="swatches">${SKINS.map((s) => swatch('skin', s.id, s.name, s.crate, s.trim, unlocked.skins.has(s.id), chosen.skin === s.id)).join('')}</div>
      <div class="swatches">${OUTFITS.map((o) => swatch('outfit', o.id, o.name, o.cap, o.suit, unlocked.outfits.has(o.id), chosen.outfit === o.id)).join('')}</div>
      <h3 class="sub-head">Achievements</h3>
      <div class="trophies">${ACHIEVEMENTS.map(item).join('')}</div>
    </div>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('button');
      if (!b) return;
      hooks.click();
      if (b.dataset.back !== undefined) {
        closeOverlay(el);
        resolve();
        return;
      }
      const kind = b.dataset.kind as 'skin' | 'outfit' | undefined;
      if (!kind) return;
      hooks.choose(kind, b.dataset.id!);
      for (const s of el.querySelectorAll<HTMLElement>(`[data-kind="${kind}"]`)) s.classList.toggle('on', s === b);
    };
    document.body.append(el);
  });
}
