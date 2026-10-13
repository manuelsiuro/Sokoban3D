import './styles/index.css';
import './app/boot';
import { LEVELS } from './levels/levels';
import { WORLDS } from './levels/worlds';
import { applyLook, applySound, click, map, newTrophies, screen, settings, showLevel, view, worldIndex } from './app/context';
import { resetProgress, saveSettings } from './game/settings';
import { ACHIEVEMENTS, builtOne, earned, unlockedCosmetics } from './game/achievements';
import { today } from './game/daily';
import { currentStreak, loadDaily } from './game/dailyProgress';
import { decodeLevel } from './game/share';
import { isWorldOpen, loadProgress, nextLevel, totalStars, worldLevels } from './game/progress';
import { showTitle } from './ui/screens/title';
import { levelText, setLang, t } from './i18n';
import { TOUCH } from './ui/dom';
import { setHaptics } from './app/haptics';
import { symbols } from './render/mechanics';
import { showSettings } from './ui/screens/settings';
import { showTrophies } from './ui/screens/trophies';
import { showUpdate } from './ui/screens/update';
import { installKind, promptInstall } from './app/install';
import { showInstallHelp } from './ui/screens/installHelp';
import { registerServiceWorker } from './app/pwa';
import { levelFlow, worldsFlow } from './modes/campaign';
import { dailyFlow } from './modes/daily';
import { sharedFlow } from './modes/shared';
import { workshopFlow } from './modes/workshop';
import { expeditionFlow } from './modes/expedition';
import { loadExpedition } from './game/expedition';

/**
 * Wiring: storage first (app/boot), the long-lived objects (app/context), then the title
 * and the flows between screens (modes/). Screens are functions that resolve with the
 * player's choice, so each flow reads as a script (title → levels → play → summary → …).
 */
/** Expedition opens once every Meadow level is solved. */
const expeditionOpen = (p: ReturnType<typeof loadProgress>) => worldLevels('meadow').every(({ l }) => (p[l.id]?.stars ?? 0) > 0);

showLevel(LEVELS[nextLevel() ?? 0]);
applyLook();
/** The quality the view runs at (changing any other setting leaves the auto tier alone). */
let shownQuality = settings.quality;

function frame(now: number) {
  requestAnimationFrame(frame);
  if (screen.mode === 'map') map.draw(now / 1000);
  else view.draw(now / 1000);
}
requestAnimationFrame(frame);

async function titleFlow() {
  for (;;) {
    const p = loadProgress();
    const next = nextLevel(p);
    showLevel(LEVELS[next ?? 0]);
    screen.mode = 'level';
    view.idle = true;
    // Trophies earned by progress made elsewhere (an older version, another flow).
    newTrophies();
    const have = earned();
    const date = today();
    const choice = await showTitle(
      {
        stars: totalStars(p),
        maxStars: LEVELS.length * 3,
        solved: LEVELS.filter((l) => (p[l.id]?.stars ?? 0) > 0).length,
        levels: LEVELS.length,
        worlds: WORLDS.length,
        worldsOpen: WORLDS.filter((_, k) => isWorldOpen(k, p)).length,
        next: next === null ? null : { name: t('title.nextName', { name: levelText(LEVELS[next]).name, world: WORLDS[worldIndex(next)].name }), number: worldLevels(LEVELS[next].world).findIndex(({ i }) => i === next) + 1 },
        fresh: Object.keys(p).length === 0,
        muted: settings.muted,
        daily: { streak: currentStreak(date), stars: loadDaily().results[date]?.stars ?? 0 },
        expedition: { open: expeditionOpen(p), run: loadExpedition().run },
        trophies: { have: have.size, total: ACHIEVEMENTS.length },
        toggleSound: () => {
          settings.muted = !settings.muted;
          saveSettings(settings);
          applySound();
          return settings.muted;
        },
      },
      click,
    );
    if (choice === 'play') await levelFlow(next ?? 0);
    else if (choice === 'worlds') await worldsFlow(next === null ? 0 : worldIndex(next));
    else if (choice === 'daily') await dailyFlow();
    else if (choice === 'expedition') await expeditionFlow();
    else if (choice === 'workshop') await workshopFlow();
    else if (choice === 'install') {
      if (installKind() === 'prompt') await promptInstall();
      else await showInstallHelp(click);
    }
    else if (choice === 'trophies') {
      const { skins, outfits } = unlockedCosmetics(have);
      await showTrophies({ progress: p, daily: loadDaily(), built: builtOne() }, have, { skins, outfits }, { skin: settings.skin, outfit: settings.outfit }, {
        choose: (kind, id) => {
          if (kind === 'skin') settings.skin = id;
          else settings.outfit = id;
          saveSettings(settings);
          applyLook();
        },
        click,
      });
    } else if (choice === 'settings')
      await showSettings(settings, {
        change: (s) => {
          saveSettings(s);
          applySound();
          view.reducedMotion = s.reducedMotion;
          view.shake = s.shake;
          setLang(s.lang);
          symbols.on = s.symbols;
          setHaptics(s.haptics);
          if (s.quality !== shownQuality) view.setQuality((shownQuality = s.quality), TOUCH);
        },
        reset: () => resetProgress(),
        install: installKind(),
        promptInstall,
        installHelp: () => showInstallHelp(click),
        click,
        tier: settings.quality === 'auto' ? view.qualityTier : undefined,
      });
  }
}

// A share link (#lvl=…) opens that level first; in dev, ?level=<id> opens a campaign level.
// An expedition link (#exp=<seed>) starts that run.
const shared = location.hash.startsWith('#lvl=') ? decodeLevel(location.hash.slice(5)) : null;
const expSeed = /^#exp=(\d{1,10})$/.exec(location.hash)?.[1];
if (location.hash.startsWith('#lvl=') || expSeed) history.replaceState(null, '', location.pathname + location.search);
const devLevel = import.meta.env.DEV ? LEVELS.findIndex((l) => l.id === new URLSearchParams(location.search).get('level')) : -1;
if (shared) sharedFlow(shared.level, shared.par).then(titleFlow);
else if (expSeed) expeditionFlow(Number(expSeed)).then(titleFlow);
else if (devLevel >= 0) levelFlow(devLevel).then(titleFlow);
else titleFlow();
// Installed app: offline, and a new version found while the game is open is offered once no
// level is being played (the same system as Line Rider 3D).
registerServiceWorker((version, restart) => showUpdate(version, restart));

// A share link opened while the game runs (only the hash changed): start over with it.
addEventListener('hashchange', () => {
  if (location.hash.startsWith('#lvl=') || location.hash.startsWith('#exp=')) location.reload();
});
