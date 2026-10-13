import { h } from '../dom';
import { t } from '../../i18n';
import { icon } from '../icons';
import { installKind, onInstallChange } from '../../app/install';

/**
 * The logo mark: a crate (framed panels, planks, a brace, nails) sitting on its glowing pad,
 * drawn in true isometric (built by a short script: faces, then inset panels, then edges).
 */
const LOGO = `<svg class="logo-crate" viewBox="0 0 160 152" aria-hidden="true"><defs><linearGradient id="lgTop" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd896"/><stop offset="1" stop-color="#f1b96c"/></linearGradient><linearGradient id="lgLeft" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2a258"/><stop offset="1" stop-color="#c88540"/></linearGradient><linearGradient id="lgRight" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b9783a"/><stop offset="1" stop-color="#94592a"/></linearGradient><radialGradient id="lgGlow"><stop offset="0" stop-color="#ffe27a" stop-opacity="0.75"/><stop offset="0.6" stop-color="#ffd447" stop-opacity="0.3"/><stop offset="1" stop-color="#ffd447" stop-opacity="0"/></radialGradient></defs><ellipse class="lg-glow" cx="80" cy="106" rx="78" ry="40"/><ellipse class="lg-ring" cx="80" cy="106" rx="63" ry="31"/><path class="lg-ticks" d="M68.9 73.3 L80.0 67.5 L91.1 73.3 M142.9 100.2 L154.0 106.0 L142.9 111.8 M91.1 138.7 L80.0 144.5 L68.9 138.7 M17.1 111.8 L6.0 106.0 L17.1 100.2"/><ellipse cx="80" cy="104" rx="58" ry="28" fill="#2a1a08" opacity="0.22"/><path d="M28.0 44.0 L80.0 72.0 L80.0 128.0 L28.0 100.0Z" fill="url(#lgLeft)"/><path d="M36.8 58.3 L71.2 76.8 L71.2 113.7 L36.8 95.2Z" fill="#c9873f"/><path class="lg-plank" d="M36.8 70.6 L71.2 89.1 M36.8 82.9 L71.2 101.4"/><path class="lg-brace" d="M38.4 94.4 L69.6 77.6"/><circle cx="32.4" cy="51.1" r="1.9" class="lg-nail"/><circle cx="75.6" cy="74.4" r="1.9" class="lg-nail"/><circle cx="75.6" cy="120.9" r="1.9" class="lg-nail"/><circle cx="32.4" cy="97.6" r="1.9" class="lg-nail"/><path d="M80.0 72.0 L132.0 44.0 L132.0 100.0 L80.0 128.0Z" fill="url(#lgRight)"/><path d="M88.8 76.8 L123.2 58.3 L123.2 95.2 L88.8 113.7Z" fill="#a76a2f"/><path class="lg-plank" d="M88.8 89.1 L123.2 70.6 M88.8 101.4 L123.2 82.9"/><path class="lg-brace" d="M90.4 111.2 L121.6 60.8"/><circle cx="84.4" cy="74.4" r="1.9" class="lg-nail"/><circle cx="127.6" cy="51.1" r="1.9" class="lg-nail"/><circle cx="127.6" cy="97.6" r="1.9" class="lg-nail"/><circle cx="84.4" cy="120.9" r="1.9" class="lg-nail"/><path d="M28.0 44.0 L80.0 16.0 L132.0 44.0 L80.0 72.0Z" fill="url(#lgTop)"/><path d="M45.7 44.0 L80.0 25.5 L114.3 44.0 L80.0 62.5Z" fill="#e7ad62"/><path class="lg-plank" d="M57.1 37.8 L91.4 56.3 M68.6 31.7 L102.9 50.2"/><circle cx="36.8" cy="44.0" r="1.9" class="lg-nail"/><circle cx="80.0" cy="20.8" r="1.9" class="lg-nail"/><circle cx="123.2" cy="44.0" r="1.9" class="lg-nail"/><circle cx="80.0" cy="67.2" r="1.9" class="lg-nail"/><path class="lg-edge" d="M80.0 16.0 L132.0 44.0 L132.0 100.0 L80.0 128.0 L28.0 100.0 L28.0 44.0Z M28.0 44.0 L80.0 72.0 L132.0 44.0 M80.0 72.0 L80.0 128.0"/><path d="M31.1 42.3 L76.9 17.7" stroke="#fff3d6" stroke-width="2.5" stroke-linecap="round" opacity="0.8"/></svg>`;

/** The showcase caption under the menu: which world's island is behind it. */
export function setShowcase(world: string, level: string) {
  const el = document.querySelector<HTMLElement>('.title-showcase');
  if (!el) return;
  el.innerHTML = `<b>${world}</b><span>${level}</span>`;
  // Fade in again with each new island.
  el.classList.remove('in');
  void el.offsetWidth;
  el.classList.add('in');
}

export type TitleChoice = 'play' | 'worlds' | 'daily' | 'expedition' | 'workshop' | 'trophies' | 'settings' | 'install' | 'help';

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
  /** Sound effects off, music on. */
  muted: boolean;
  music: boolean;
  /** Flip the effects or the music; each returns whether it's now on. */
  toggleSfx: () => boolean;
  toggleMusic: () => boolean;
  /** Expedition: open once the Meadow is cleared; the run in progress, if any. */
  expedition: { open: boolean; run: { depth: number; score: number } | null };
}

/**
 * Title screen; resolves with the player's choice. The island behind it is the next level,
 * slowly turning.
 */
export function showTitle(info: TitleInfo, click: () => void): Promise<TitleChoice> {
  const done = ((info.stars / Math.max(1, info.maxStars)) * 100).toFixed(1);
  // A first visit: just the first level's name ("Play" says the rest); later, what's next.
  const sub = info.next ? (info.fresh ? `${info.next.number}. ${info.next.name}` : t('title.nextLine', { label: t('title.next'), n: info.next.number, name: info.next.name })) : t('title.allSolved');
  // Two switches: music and sound effects, each a pill that shows whether it's on.
  const pill = (kind: 'music' | 'sfx', on: boolean) =>
    `<button class="sound-toggle ${on ? '' : 'off'}" data-sound="${kind}" aria-pressed="${on}" aria-label="${t(kind === 'music' ? (on ? 'title.musicOn' : 'title.musicOff') : on ? 'title.sfxOn' : 'title.sfxOff')}">${icon(kind === 'music' ? (on ? 'music' : 'musicOff') : on ? 'sound' : 'mute', 16)}<span>${t(kind === 'music' ? 'title.music' : 'title.sfx')}</span></button>`;
  const el = h(
    'div',
    'title-screen',
    `<div class="title-inner">
      <div class="logo"><div class="logo-mark">${LOGO}</div><h1 class="wordmark">Cratelands</h1><p class="tagline">${t('title.tagline')}</p></div>
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
            <span class="menu-text"><span class="menu-label">${t('title.daily')}</span><small>${info.daily.stars ? t('title.dailySolved', { stars: '★'.repeat(info.daily.stars) }) : info.daily.streak ? t('title.dailyStreak', { n: info.daily.streak }) : t('title.dailyShort')}</small></span>
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
      <div class="title-foot">${pill('music', info.music)}${pill('sfx', !info.muted)}<button class="help-btn-title" data-c="help" aria-label="${t('title.help')}">${icon('help', 16)}<span>${t('title.help')}</span></button><button class="install-btn hidden" data-c="install">${icon('download', 16)}<span>${t('title.install')}</span></button></div>
      </div>
      <p class="keys-hint">${t('title.keys')}</p>
    </div>
    <p class="title-showcase" aria-hidden="true"></p>
    <span class="title-version">v${__APP_VERSION__}</span>
    <button class="icon-btn title-settings" data-c="settings" aria-label="${t('title.settings')}">${icon('gear', 20)}</button>`,
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
        const kind = toggle.dataset.sound as 'music' | 'sfx';
        const on = kind === 'music' ? info.toggleMusic() : info.toggleSfx();
        toggle.outerHTML = pill(kind, on);
        el.querySelector<HTMLElement>(`[data-sound="${kind}"]`)?.focus({ preventScroll: true });
        click();
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
