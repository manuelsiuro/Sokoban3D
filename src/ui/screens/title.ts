import { h } from '../dom';
import { icon } from '../icons';
import { installKind, onInstallChange } from '../../app/install';

export type TitleChoice = 'play' | 'worlds' | 'daily' | 'workshop' | 'trophies' | 'settings' | 'install';

export interface TitleInfo {
  stars: number;
  maxStars: number;
  solved: number;
  levels: number;
  worlds: number;
  worldsOpen: number;
  /** Today's daily: the streak, and the stars if solved today. */
  daily: { streak: number; stars: number };
  trophies: { have: number; total: number };
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
        <button class="menu-btn" data-c="worlds" style="--tone:#4fae4a;--tone-2:#2f8a3a;--done:${done}%">
          <span class="menu-ic">${icon('map', 18)}</span>
          <span class="menu-text"><span class="menu-label">Worlds</span><small>${info.worldsOpen}/${info.worlds} open · ${info.solved}/${info.levels} solved</small></span>
          ${icon('chevronRight', 16)}<i class="menu-bar"></i>
        </button>
        <button class="menu-btn" data-c="daily" style="--tone:#ff9a3d;--tone-2:#e0662a;--done:${info.daily.stars ? 100 : 0}%">
          <span class="menu-ic">${icon('star', 18)}</span>
          <span class="menu-text"><span class="menu-label">Daily puzzle</span><small>${info.daily.stars ? `Solved today · ${'★'.repeat(info.daily.stars)}` : 'A new puzzle every day'}${info.daily.streak ? ` · ${info.daily.streak}-day streak` : ''}</small></span>
          ${icon('chevronRight', 16)}<i class="menu-bar"></i>
        </button>
        <div class="menu-pair">
          <button class="menu-btn" data-c="workshop" style="--tone:#7466f0;--tone-2:#4f3fd1;--done:0%">
            <span class="menu-ic">${icon('crate', 18)}</span>
            <span class="menu-text"><span class="menu-label">Workshop</span><small>Build and share</small></span>
          </button>
          <button class="menu-btn" data-c="trophies" style="--tone:#f2a51f;--tone-2:#c77d0a;--done:${((info.trophies.have / info.trophies.total) * 100).toFixed(1)}%">
            <span class="menu-ic">${icon('trophy', 18)}</span>
            <span class="menu-text"><span class="menu-label">Trophies</span><small>${info.trophies.have}/${info.trophies.total}</small></span>
            <i class="menu-bar"></i>
          </button>
        </div>
      </div>
      <div class="title-foot"><button class="sound-toggle ${info.muted ? 'off' : ''}" data-sound>${sound(info.muted)}</button><button class="icon-btn small" data-c="settings" aria-label="Settings">${icon('gear', 18)}</button><button class="install-btn hidden" data-c="install">${icon('download', 16)}<span>Install app</span></button><span class="keys-hint">Arrows or WASD to move · Z undo · Q/E turn</span></div>
    </div>
    <span class="title-version">v${__APP_VERSION__}</span>`,
  );
  // Install app: shown while the game can be installed here (the offer may arrive later).
  const installBtn = el.querySelector<HTMLElement>('.install-btn')!;
  const showInstall = () => installBtn.classList.toggle('hidden', installKind() === null);
  showInstall();
  const stopWatching = onInstallChange(showInstall);
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
      stopWatching();
      el.remove();
      resolve(c);
    };
    document.body.append(el);
  });
}
