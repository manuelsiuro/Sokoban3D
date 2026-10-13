import { h } from '../dom';
import { t } from '../../i18n';
import { icon } from '../icons';
import { installKind, onInstallChange } from '../../app/install';

/** The logo mark: the crate from the app icon, on its glowing pad. */
const LOGO = `<svg class="logo-crate" viewBox="0 0 160 150" aria-hidden="true">
  <ellipse class="logo-pad" cx="80" cy="128" rx="58" ry="17"/>
  <g stroke="#7a4c22" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M24 46 L80 18 L136 46 L80 74 Z" fill="#f0bd76"/>
    <path d="M24 46 L80 74 L80 136 L24 108 Z" fill="#d89c55"/>
    <path d="M80 74 L136 46 L136 108 L80 136 Z" fill="#b97a3c"/>
    <path d="M33 60 L71 122 M127 60 L89 122 M44 41 L100 68" fill="none" opacity="0.85"/>
  </g>
  <path d="M30 47 L80 22" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.55"/>
</svg>`;

export type TitleChoice = 'play' | 'worlds' | 'daily' | 'expedition' | 'workshop' | 'trophies' | 'settings' | 'install';

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
  /** Expedition: open once the Meadow is cleared; the run in progress, if any. */
  expedition: { open: boolean; run: { depth: number; score: number } | null };
}

/**
 * Title screen; resolves with the player's choice. The island behind it is the next level,
 * slowly turning.
 */
export function showTitle(info: TitleInfo, click: () => void): Promise<TitleChoice> {
  const done = ((info.stars / Math.max(1, info.maxStars)) * 100).toFixed(1);
  const sub = info.next ? t('title.nextLine', { label: t(info.fresh ? 'title.startWith' : 'title.next'), n: info.next.number, name: info.next.name }) : t('title.allSolved');
  const sound = (muted: boolean) => `${icon(muted ? 'mute' : 'sound', 16)}<span>${t(muted ? 'title.soundOff' : 'title.soundOn')}</span>`;
  const el = h(
    'div',
    'title-screen',
    `<div class="title-inner">
      <div class="logo"><div class="logo-mark">${LOGO}</div><h1>Cratelands</h1><p class="tagline">${t('title.tagline')}</p></div>
      <div class="title-panel">
      <div class="title-actions">
        <button class="hero-card play-card" data-c="play" style="--done:${done}%">
          <span class="hero-ic">${icon('play', 22)}</span>
          <span class="hero-text"><b>${t(info.next && !info.fresh ? 'title.continue' : 'title.play')}</b><small>${sub}</small></span>
          <span class="pill">${icon('star', 14)} ${info.stars}/${info.maxStars}</span>
        </button>
        <button class="menu-btn" data-c="worlds" style="--tone:#4fae4a;--tone-2:#2f8a3a;--done:${done}%">
          <span class="menu-ic">${icon('map', 18)}</span>
          <span class="menu-text"><span class="menu-label">${t('title.worlds')}</span><small>${t('title.worldsSub', { open: info.worldsOpen, worlds: info.worlds, solved: info.solved, levels: info.levels })}</small></span>
          ${icon('chevronRight', 16)}<i class="menu-bar"></i>
        </button>
        <div class="menu-pair">
          <button class="menu-btn" data-c="daily" style="--tone:#ff9a3d;--tone-2:#e0662a;--done:${info.daily.stars ? 100 : 0}%">
            <span class="menu-ic">${icon('star', 18)}</span>
            <span class="menu-text"><span class="menu-label">${t('title.daily')}</span><small>${info.daily.stars ? t('title.dailySolved', { stars: '★'.repeat(info.daily.stars) }) : t('title.dailyNew')}${info.daily.streak ? t('title.streak', { n: info.daily.streak }) : ''}</small></span>
            <i class="menu-bar"></i>
          </button>
          <button class="menu-btn ${info.expedition.open ? '' : 'locked'}" data-c="expedition" style="--tone:#2fb8a8;--tone-2:#1f8a80;--done:0%" ${info.expedition.open ? '' : 'disabled'}>
            <span class="menu-ic">${icon(info.expedition.open ? 'compass' : 'lock', 18)}</span>
            <span class="menu-text"><span class="menu-label">${t('title.expedition')}</span><small>${!info.expedition.open ? t('title.expLocked') : info.expedition.run ? t('title.expRun', { n: info.expedition.run.depth + 1, score: info.expedition.run.score }) : t('title.expNew')}</small></span>
          </button>
        </div>
        <div class="menu-pair">
          <button class="menu-btn" data-c="workshop" style="--tone:#7466f0;--tone-2:#4f3fd1;--done:0%">
            <span class="menu-ic">${icon('hammer', 18)}</span>
            <span class="menu-text"><span class="menu-label">${t('title.workshop')}</span><small>${t('title.workshopSub')}</small></span>
          </button>
          <button class="menu-btn" data-c="trophies" style="--tone:#f2a51f;--tone-2:#c77d0a;--done:${((info.trophies.have / info.trophies.total) * 100).toFixed(1)}%">
            <span class="menu-ic">${icon('trophy', 18)}</span>
            <span class="menu-text"><span class="menu-label">${t('title.trophies')}</span><small>${info.trophies.have}/${info.trophies.total}</small></span>
            <i class="menu-bar"></i>
          </button>
        </div>
      </div>
      <div class="title-foot"><button class="sound-toggle ${info.muted ? 'off' : ''}" data-sound>${sound(info.muted)}</button><button class="icon-btn small" data-c="settings" aria-label="${t('title.settings')}">${icon('gear', 18)}</button><button class="install-btn hidden" data-c="install">${icon('download', 16)}<span>${t('title.install')}</span></button></div>
      </div>
      <p class="keys-hint">${t('title.keys')}</p>
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
      const target = e.target as HTMLElement;
      const toggle = target.closest<HTMLElement>('[data-sound]');
      if (toggle) {
        const muted = info.toggleSound();
        toggle.classList.toggle('off', muted);
        toggle.innerHTML = sound(muted);
        if (!muted) click();
        return;
      }
      const c = target.closest<HTMLElement>('[data-c]')?.dataset.c as TitleChoice | undefined;
      if (!c) return;
      click();
      stopWatching();
      el.remove();
      resolve(c);
    };
    document.body.append(el);
  });
}
