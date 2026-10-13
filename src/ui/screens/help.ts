import { h } from '../dom';
import { icon } from '../icons';
import { t, type Key } from '../../i18n';
import { TOUCH } from '../dom';
import { PLANET_PIC } from './planets';
import { WORLDS } from '../../levels/worlds';

/**
 * How to play: the basics, the rules of each world (with a small top-down picture of each),
 * and the modes. Opened from the title and from the level's HUD (on the world being played).
 * Worlds not reached yet keep their rules for when they open.
 */
export interface HelpInfo {
  /** Which worlds are open (by id). */
  open: Set<string>;
  /** Open on this world's rules (from a level). */
  world?: string;
}

// ------------------------------------------------------------------ pictures
/**
 * A little top-down board. One character per cell:
 *   # wall  @ pusher  $ crate  . pad  * crate on pad  ~ ice  o pit  L lava  p plate  P door
 *   > conveyor  1 portal  g gate up  G gate down  E laser  x crystal (lit)  / mirror crate
 *   r b colored crates  R B colored pads  - nothing
 * Arrows go from cell to cell ([col, row, col, row]); a beam is a line through cell centers.
 */
interface Pic {
  rows: string[];
  /** [col, row, col, row, offset across the arrow in px]. */
  arrows?: [number, number, number, number, number?][];
  beam?: [number, number][];
  /** Portal pairs linked by a dotted arc. */
  link?: [number, number, number, number];
  floor?: string;
  wall?: string;
  /** A cell marked as a dead end (a red cross). */
  bad?: [number, number];
}

const S = 30;
const COLORS: Record<string, string> = { r: '#e0533d', b: '#3f7fe0', R: '#e0533d', B: '#3f7fe0' };

function crate(x: number, y: number, fill = '#d89c55', edge = '#8a5a2b') {
  const m = 5;
  return `<g><rect x="${x + m}" y="${y + m}" width="${S - 2 * m}" height="${S - 2 * m}" rx="4" fill="${fill}" stroke="${edge}" stroke-width="2"/><path d="M${x + m + 3} ${y + m + 3}L${x + S - m - 3} ${y + S - m - 3}" stroke="${edge}" stroke-width="2" stroke-linecap="round"/></g>`;
}

function cell(ch: string, x: number, y: number, p: Pic): string {
  const c = x + S / 2;
  const cy = y + S / 2;
  const floor = `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="${p.floor ?? '#bfe39a'}"/>`;
  switch (ch) {
    case '-':
      return '';
    case '#':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="6" fill="${p.wall ?? '#4f9a46'}"/><rect x="${x + 4}" y="${y + 3}" width="${S - 8}" height="${S / 2 - 4}" rx="4" fill="#fff" opacity="0.18"/>`;
    case '@':
      return `${floor}<circle cx="${c}" cy="${cy + 1}" r="9" fill="#3f6fd0"/><circle cx="${c}" cy="${cy - 2}" r="7" fill="#e0533d"/><circle cx="${c - 2}" cy="${cy - 4}" r="2" fill="#fff" opacity="0.6"/>`;
    case '$':
      return floor + crate(x, y);
    case '.':
      return `${floor}<circle cx="${c}" cy="${cy}" r="9" fill="none" stroke="#f2c230" stroke-width="3.5"/><circle cx="${c}" cy="${cy}" r="4" fill="#ffe27a"/>`;
    case '*':
      return `${floor}<circle cx="${c}" cy="${cy}" r="11" fill="#ffe27a" opacity="0.7"/>${crate(x, y, '#f0bd76')}`;
    case 'r':
    case 'b':
      return floor + crate(x, y, COLORS[ch], '#1d2433');
    case 'R':
    case 'B':
      return `${floor}<circle cx="${c}" cy="${cy}" r="9" fill="none" stroke="${COLORS[ch]}" stroke-width="3.5"/>`;
    case '/':
      // A mirror crate (no brace: its glass is the diagonal), turning a beam from the west down.
      return `${floor}<rect x="${x + 5}" y="${y + 5}" width="${S - 10}" height="${S - 10}" rx="4" fill="#cfe4ff" stroke="#5d7fa8" stroke-width="2"/><path d="M${x + 9} ${y + 9}L${x + S - 9} ${y + S - 9}" stroke="#2c4e78" stroke-width="3.5" stroke-linecap="round"/>`;
    case '~':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="#bfe6ff"/><path d="M${x + 7} ${y + 20}l8-8M${x + 14} ${y + 23}l8-8" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>`;
    case 'o':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="${p.floor ?? '#e8c47f'}"/><rect x="${x + 5}" y="${y + 5}" width="${S - 10}" height="${S - 10}" rx="4" fill="#8a6a3c"/>`;
    case 'L':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="#ff7a1a"/><circle cx="${x + 10}" cy="${y + 12}" r="3" fill="#ffd25a"/><circle cx="${x + 20}" cy="${y + 19}" r="2.5" fill="#ffd25a"/>`;
    case 'p':
      return `${floor}<rect x="${x + 7}" y="${y + 7}" width="${S - 14}" height="${S - 14}" rx="3" fill="#ff9a3d" stroke="#b9621b" stroke-width="2"/>`;
    case 'P':
      return `${floor}<rect x="${x + 3}" y="${y + 3}" width="5" height="${S - 6}" rx="2" fill="#b9621b"/><rect x="${x + S - 8}" y="${y + 3}" width="5" height="${S - 6}" rx="2" fill="#b9621b"/><path d="M${x + 8} ${y + 9}h${S - 16}M${x + 8} ${y + 15}h${S - 16}M${x + 8} ${y + 21}h${S - 16}" stroke="#ff9a3d" stroke-width="3"/>`;
    case '>':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="5" fill="#5b6270"/><path d="M${x + 8} ${y + 9}l6 6-6 6M${x + 16} ${y + 9}l6 6-6 6" fill="none" stroke="#ffb347" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    case '1':
      return `${floor}<circle cx="${c}" cy="${cy}" r="10" fill="#b983ff" opacity="0.35"/><circle cx="${c}" cy="${cy}" r="10" fill="none" stroke="#9a5bff" stroke-width="2.5"/><circle cx="${c}" cy="${cy}" r="4" fill="#d9c2ff"/>`;
    case 'g':
      return `${floor}<rect x="${x + 4}" y="${y + 4}" width="${S - 8}" height="${S - 8}" rx="4" fill="#f2b630" stroke="#a87412" stroke-width="2"/><path d="M${c} ${y + 9}v12M${c - 5} ${y + 13}l5-5 5 5" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'G':
      return `${floor}<rect x="${x + 4}" y="${y + 4}" width="${S - 8}" height="${S - 8}" rx="4" fill="none" stroke="#9a5bff" stroke-width="2.5" stroke-dasharray="4 3"/>`;
    case 'E':
      return `<rect x="${x + 1}" y="${y + 1}" width="${S - 2}" height="${S - 2}" rx="6" fill="#3d3550"/><circle cx="${x + S - 9}" cy="${cy}" r="5" fill="#ff4f6d"/>`;
    case 'x':
      return `${floor}<circle cx="${c}" cy="${cy}" r="12" fill="#7ff3ff" opacity="0.35"/><path d="M${c} ${y + 4}l7 11-7 11-7-11Z" fill="#7ff3ff" stroke="#2aa6c4" stroke-width="2"/>`;
    default:
      return floor;
  }
}

function pic(p: Pic) {
  const w = Math.max(...p.rows.map((r) => r.length));
  const hgt = p.rows.length;
  const at = (col: number, row: number) => [col * S + S / 2, row * S + S / 2];
  let out = '';
  p.rows.forEach((r, row) => [...r].forEach((ch, col) => (out += cell(ch, col * S, row * S, p))));
  if (p.beam) out += `<polyline points="${p.beam.map(([c, r]) => at(c, r).join(',')).join(' ')}" fill="none" stroke="#ff4f6d" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.3"/><polyline points="${p.beam.map(([c, r]) => at(c, r).join(',')).join(' ')}" fill="none" stroke="#ff4f6d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (p.link) {
    const [x1, y1] = at(p.link[0], p.link[1]);
    const [x2, y2] = at(p.link[2], p.link[3]);
    out += `<path d="M${x1} ${y1 - 12}Q${(x1 + x2) / 2} ${Math.min(y1, y2) - 34} ${x2} ${y2 - 12}" fill="none" stroke="#9a5bff" stroke-width="2.5" stroke-dasharray="3 4" stroke-linecap="round"/>`;
  }
  for (const [c1, r1, c2, r2, off = 0] of p.arrows ?? []) {
    const [x1, y1] = at(c1, r1).map((v, k) => v + (k === 1 && r1 === r2 ? off : k === 0 && c1 === c2 ? off : 0));
    const [x2, y2] = at(c2, r2).map((v, k) => v + (k === 1 && r1 === r2 ? off : k === 0 && c1 === c2 ? off : 0));
    const a = Math.atan2(y2 - y1, x2 - x1);
    const ex = x2 - Math.cos(a) * 6;
    const ey = y2 - Math.sin(a) * 6;
    const head = (k: number) => `${ex - Math.cos(a + k) * 8},${ey - Math.sin(a + k) * 8}`;
    out += `<g stroke="#12233a" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.85"><path d="M${x1 + Math.cos(a) * 8} ${y1 + Math.sin(a) * 8}L${ex} ${ey}"/><path d="M${head(0.55)}L${ex},${ey}L${head(-0.55)}" stroke-linejoin="round"/></g>`;
  }
  if (p.bad) {
    const [x, y] = at(p.bad[0], p.bad[1]);
    out += `<g transform="translate(${x + 9} ${y - 9})"><circle r="8" fill="#e5484d" stroke="#fff" stroke-width="2"/><path d="M-3.2 -3.2l6.4 6.4M3.2 -3.2l-6.4 6.4" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></g>`;
  }
  return `<svg class="help-pic" viewBox="-2 -${p.link ? 26 : 2} ${w * S + 4} ${hgt * S + (p.link ? 30 : 6)}" width="${w * S + 4}" aria-hidden="true">${out}</svg>`;
}

/** Heights, seen from the side: a step up, and a crate dropping off a ledge. */
const SKY_PIC = `<svg class="help-pic" viewBox="0 0 184 96" width="184" aria-hidden="true">
  <rect x="2" y="56" width="58" height="38" rx="5" fill="#a9c7e8"/><rect x="62" y="32" width="58" height="62" rx="5" fill="#a9c7e8"/><rect x="122" y="70" width="60" height="24" rx="5" fill="#a9c7e8"/>
  <rect x="2" y="56" width="58" height="7" rx="3" fill="#cfe9a8"/><rect x="62" y="32" width="58" height="7" rx="3" fill="#cfe9a8"/><rect x="122" y="70" width="60" height="7" rx="3" fill="#cfe9a8"/>
  <circle cx="22" cy="46" r="8" fill="#3f6fd0"/><circle cx="22" cy="40" r="6" fill="#e0533d"/>
  <path d="M30 34q18-22 40-6" fill="none" stroke="#12233a" stroke-width="3" stroke-linecap="round" opacity="0.85"/><path d="M62 21l8 7-10 3" fill="none" stroke="#12233a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>
  <rect x="96" y="12" width="20" height="20" rx="3" fill="#d89c55" stroke="#8a5a2b" stroke-width="2"/>
  <path d="M118 22q20 0 26 38" fill="none" stroke="#12233a" stroke-width="3" stroke-dasharray="1 6" stroke-linecap="round" opacity="0.7"/>
  <rect x="136" y="50" width="20" height="20" rx="3" fill="#d89c55" stroke="#8a5a2b" stroke-width="2" opacity="0.55"/>
</svg>`;

const WORLD_PICS: Record<string, string> = {
  meadow: pic({ rows: ['######', '#@$ .#', '######'], arrows: [[2, 1, 4, 1]] }),
  tundra: pic({ rows: ['#######', '#@$~~~#', '#######'], arrows: [[2, 1, 5, 1]], floor: '#e8f2fb', wall: '#7fb6e0' }),
  desert: pic({ rows: ['@$o p', '   P ', '  $ .'].map((r) => r), arrows: [[1, 0, 2, 0]], floor: '#f3dca4', wall: '#c9a25e' }),
  forge: pic({ rows: ['@$>> ', '  L  ', ' $L .'], arrows: [[1, 0, 3, 0]], floor: '#8c7f78', wall: '#4b3f3c' }),
  crystal: pic({ rows: ['E  / ', '   x ', ' rR  '], beam: [[0.6, 0], [3, 0], [3, 1]], floor: '#c8c2e6', wall: '#5e4f8e' }),
  clockwork: pic({ rows: ['@g G 1', '      ', '1  $ .'], link: [5, 0, 0, 2], floor: '#e9dcc0', wall: '#8a6a3c' }),
  reverse: pic({ rows: ['######', '#$@  #', '######'], arrows: [[2, 1, 4, 1, -8], [1, 1, 3, 1, 8]], floor: '#d9c8ee', wall: '#6d5a99' }),
  sky: SKY_PIC,
};

/** A world's rule picture (for the card that introduces it). */
export const worldPicture = (id: string) => WORLD_PICS[id] ?? '';

const GOAL_PIC = pic({ rows: ['@$ .', '  $*'], arrows: [[1, 0, 3, 0]] });
const PUSH_PIC = pic({ rows: ['#####', '# $@#', '#   #'], arrows: [[2, 1, 1, 1]], bad: [1, 1] });

// ------------------------------------------------------------------ screen
const BUTTONS: [string, Key][] = [
  ['undo', 'help.b.undo'],
  ['crate', 'help.b.stuck'],
  ['replay', 'help.b.restart'],
  ['bulb', 'help.b.hint'],
  ['rotateRight', 'help.b.turn'],
  ['map', 'help.b.map'],
  ['globe', 'help.b.globe'],
  ['camera', 'help.b.photo'],
  ['hand', 'help.b.hand'],
  ['compass', 'help.b.compass'],
  ['chevronLeft', 'help.b.back'],
];

type Tab = 'basics' | 'worlds' | 'modes';

function basics() {
  return `
    <section class="help-row">${GOAL_PIC}<div><h3>${t('help.goal.t')}</h3><p>${t('help.goal')}</p></div></section>
    <section class="help-row"><span class="help-ic">${icon(TOUCH ? 'hand' : 'gamepad', 24)}</span><div><h3>${t('help.move.t')}</h3><p>${t(TOUCH ? 'help.moveTouch' : 'help.moveKeys')}</p></div></section>
    <section class="help-row">${PUSH_PIC}<div><h3>${t('help.push.t')}</h3><p>${t('help.push')}</p></div></section>
    <section class="help-row"><span class="help-stars">★★★</span><div><h3>${t('help.stars.t')}</h3><p>${t('help.stars')}</p></div></section>
    <h3 class="help-sub">${t('help.buttons.t')}</h3>
    <ul class="help-buttons">${BUTTONS.map(([ic, k]) => `<li><span class="help-btn">${icon(ic, 18)}</span><span>${t(k)}</span></li>`).join('')}</ul>
    ${TOUCH ? '' : `<p class="help-keys">${t('hud.keys')}</p>`}`;
}

function worlds(info: HelpInfo) {
  return WORLDS.map((w, k) => {
    const open = info.open.has(w.id);
    const label = w.id === 'reverse' ? t('intro.bonus').split('·')[0].trim() : t('worlds.world', { n: k + 1 });
    return `<section class="help-row help-world ${open ? '' : 'locked'} ${info.world === w.id ? 'here' : ''}" data-world="${w.id}">
      ${open ? WORLD_PICS[w.id] ?? '' : `<span class="help-ic">${icon('lock', 24)}</span>`}
      <div><small>${label}</small><h3>${w.name}</h3><p>${open ? t(`help.w.${w.id}` as Key) : t('help.locked')}</p></div>
    </section>`;
  }).join('');
}

function modes() {
  const mode = (ic: string, k: string) => `<section class="help-row"><span class="help-ic">${icon(ic, 24)}</span><div><h3>${t(`help.m.${k}.t` as Key)}</h3><p>${t(`help.m.${k}` as Key)}</p></div></section>`;
  const planets = `<section class="help-row">${PLANET_PIC}<div><h3>${t('help.m.planets.t')}</h3><p>${t('help.m.planets')}</p></div></section>`;
  return mode('star', 'daily') + planets + mode('compass', 'exp') + mode('clock', 'trial') + mode('crown', 'grand') + mode('hammer', 'workshop');
}

/** The How to play sheet; resolves when closed. */
export function showHelp(info: HelpInfo, click: () => void): Promise<void> {
  let tab: Tab = info.world && info.world !== 'meadow' ? 'worlds' : 'basics';
  const el = h(
    'div',
    'modal help-modal',
    `<div class="card help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="card-head"><h2 id="help-title">${t('help.title')}</h2><button class="icon-btn" data-done aria-label="${t('common.close')}">${icon('close', 18)}</button></div>
      <div class="seg help-tabs" role="tablist">${(['basics', 'worlds', 'modes'] as Tab[]).map((k) => `<button role="tab" data-tab="${k}">${t(`help.tab.${k}`)}</button>`).join('')}</div>
      <div class="help-body" tabindex="-1"></div>
    </div>`,
  );
  const body = el.querySelector<HTMLElement>('.help-body')!;
  const show = (k: Tab) => {
    tab = k;
    for (const b of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      b.classList.toggle('on', b.dataset.tab === k);
      b.setAttribute('aria-selected', String(b.dataset.tab === k));
    }
    body.innerHTML = k === 'basics' ? basics() : k === 'worlds' ? worlds(info) : modes();
    body.scrollTop = 0;
    const here = body.querySelector<HTMLElement>('.here');
    if (here) requestAnimationFrame(() => here.scrollIntoView({ block: 'center' }));
  };
  show(tab);
  document.body.append(el);
  return new Promise((resolve) => {
    el.onclick = (e) => {
      const target = e.target as HTMLElement;
      const k = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined;
      if (k && k !== tab) {
        click();
        show(k);
        return;
      }
      if (target.closest('[data-done]') || target === el) {
        click();
        el.remove();
        resolve();
      }
    };
  });
}
