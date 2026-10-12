import { h } from '../dom';
import { icon } from '../icons';

export type TitleChoice = 'play' | 'levels';

export interface TitleInfo {
  stars: number;
  maxStars: number;
  solved: number;
  levels: number;
  /** The next level to play (name and number), or null when every level is solved. */
  next: { name: string; number: number } | null;
  fresh: boolean;
  muted: boolean;
  /** Flips sound on or off; returns whether it's now muted. */
  toggleSound: () => boolean;
}

/**
 * Title screen; resolves with the player's choice. The island behind it is the next level,
 * slowly turning.
 */
export function showTitle(info: TitleInfo, click: () => void): Promise<TitleChoice> {
  const done = ((info.stars / Math.max(1, info.maxStars)) * 100).toFixed(1);
  const sub = info.next ? `${info.fresh ? 'Start with' : 'Next'}: ${info.next.number}. ${info.next.name}` : 'Every level solved · go for 3 stars';
  const sound = (muted: boolean) => `${icon(muted ? 'mute' : 'sound', 16)}<span>${muted ? 'Sound off' : 'Sound on'}</span>`;
  const el = h(
    'div',
    'title-screen',
    `<div class="title-inner">
      <div class="logo"><div class="logo-mark">${icon('crate', 40)}</div><h1>Cratelands</h1><p class="tagline">Push, slide, climb.</p></div>
      <div class="title-actions">
        <button class="hero-card play-card" data-c="play" style="--done:${done}%">
          <span class="hero-ic">${icon('play', 22)}</span>
          <span class="hero-text"><b>${info.next && !info.fresh ? 'Continue' : 'Play'}</b><small>${sub}</small></span>
          <span class="pill">${icon('star', 14)} ${info.stars}/${info.maxStars}</span>
        </button>
        <button class="menu-btn" data-c="levels" style="--tone:#4fae4a;--tone-2:#2f8a3a;--done:${done}%">
          <span class="menu-ic">${icon('trophy', 18)}</span>
          <span class="menu-text"><span class="menu-label">Levels</span><small>${info.solved}/${info.levels} solved · ${icon('star', 12)} ${info.stars}/${info.maxStars}</small></span>
          ${icon('chevronRight', 16)}<i class="menu-bar"></i>
        </button>
      </div>
      <div class="title-foot"><button class="sound-toggle ${info.muted ? 'off' : ''}" data-sound>${sound(info.muted)}</button><span class="keys-hint">Arrows or WASD to move · Z undo · Q/E turn</span></div>
    </div>
    <span class="title-version">v${__APP_VERSION__}</span>`,
  );
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const t = e.target as HTMLElement;
      const toggle = t.closest<HTMLElement>('[data-sound]');
      if (toggle) {
        const muted = info.toggleSound();
        toggle.classList.toggle('off', muted);
        toggle.innerHTML = sound(muted);
        if (!muted) click();
        return;
      }
      const c = t.closest<HTMLElement>('[data-c]')?.dataset.c as TitleChoice | undefined;
      if (!c) return;
      click();
      el.remove();
      resolve(c);
    };
    document.body.append(el);
  });
}
