import type { LevelDef } from '../../levels/types';
import { parseLevel } from '../../sim/grid';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import { t as tr, type Key } from '../../i18n';

/**
 * The workshop: paint a level on a grid (terrain, things, mechanics, colors, heights), check
 * it with the solver, test it in 3D, share it as a link. The draft is plain data, saved by
 * the caller after every change.
 *
 * Built for a phone first: the grid fills the space it has, the tools sit in a dock under the
 * thumb (four tabs of picture tiles; a tool with variants, such as a belt's direction, shows
 * them as a row of chips), and every stroke can be undone.
 */
export interface Draft {
  name: string;
  w: number;
  h: number;
  /** Per cell: '#' wall, '-' floor, ',' nothing. */
  base: string[];
  /** Per cell: '', '@', '$', '.' (a crate on a goal is '$' + goal). */
  thing: string[];
  goal: boolean[];
  tile: string[];
  kind: string[];
  height: number[];
  /** Par from the last check of this exact layout (0: not checked). */
  par: number;
}

export type EditorChoice = { type: 'back' } | { type: 'play'; level: LevelDef; par: number };

export interface EditorHooks {
  save: (d: Draft) => void;
  /** Runs the solver; resolves with the par, 0 for no solution, -1 when it's too big to tell. */
  check: (level: LevelDef) => Promise<number>;
  share: (level: LevelDef, par: number) => Promise<string>;
  click: () => void;
  /** A light tick as a cell is painted (a phone's vibration). */
  tick?: () => void;
}

export function newDraft(w = 7, h = 6): Draft {
  const n = w * h;
  const base = [...Array(n)].map((_, i) => {
    const x = i % w;
    const y = Math.floor(i / w);
    return x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : '-';
  });
  const d: Draft = { name: tr('editor.myLevel'), w, h, base, thing: Array(n).fill(''), goal: Array(n).fill(false), tile: Array(n).fill(' '), kind: Array(n).fill(' '), height: Array(n).fill(0), par: 0 };
  const at = (x: number, y: number) => y * w + x;
  d.thing[at(1, 1)] = '@';
  d.thing[at(3, 2)] = '$';
  d.goal[at(5, 3)] = true;
  return d;
}

/** The draft as a level (map, heights, tiles, kinds). */
export function draftLevel(d: Draft): LevelDef {
  const rows = (f: (i: number) => string) => [...Array(d.h)].map((_, y) => [...Array(d.w)].map((_, x) => f(y * d.w + x)).join(''));
  return {
    id: 'workshop',
    name: d.name.trim() || tr('editor.myLevel'),
    world: 'meadow',
    difficulty: 3,
    tip: tr('editor.tip'),
    map: rows((i) => {
      if (d.base[i] === '#') return '#';
      if (d.base[i] === ',') return ',';
      const t = d.thing[i];
      if (t === '@') return d.goal[i] ? '+' : '@';
      if (t === '$') return d.goal[i] ? '*' : '$';
      return d.goal[i] ? '.' : '-';
    }),
    heights: rows((i) => String(d.height[i])),
    tiles: rows((i) => (d.base[i] === '-' ? d.tile[i] : ' ')),
    kinds: rows((i) => (d.base[i] === '-' ? d.kind[i] : ' ')),
  };
}

/* ---------------------------------------------------------------- pictures */

const CHANNEL = ['#ffffff', '#ff9a3d', '#2fd6c3'];
const PAIR = ['', '#b983ff', '#5fe3ff'];
const KIND_COLOR: Record<string, string> = { r: '#e0533d', g: '#4fb84a', b: '#3f7fe0', y: '#f2c230' };
const DIR_DEG: Record<string, number> = { '^': 0, '>': 90, v: 180, '<': 270, N: 0, E: 90, S: 180, W: 270 };
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const num = (n: string, fill = '#fff') => `<text x="12" y="15.6" text-anchor="middle" font-size="10" font-weight="800" font-family="system-ui,sans-serif" fill="${fill}">${n}</text>`;

/** The crate as drawn on the grid: wood, a colored band, or a steel mirror crate. */
function crateArt(kind: string, small = false) {
  const o = small ? 4.5 : 3;
  const s = 24 - o * 2;
  if (kind === '/' || kind === '\\') {
    const line = kind === '/' ? `M${o + 3} ${24 - o - 3}L${24 - o - 3} ${o + 3}` : `M${o + 3} ${o + 3}L${24 - o - 3} ${24 - o - 3}`;
    return `<rect x="${o}" y="${o}" width="${s}" height="${s}" rx="2.5" fill="#9fb4c8" stroke="#4d5f73" stroke-width="1.6"/><path d="${line}" stroke="#eefaff" stroke-width="3" stroke-linecap="round"/>`;
  }
  const band = KIND_COLOR[kind];
  return `<rect x="${o}" y="${o}" width="${s}" height="${s}" rx="2.5" fill="#d89c55" stroke="#7a4c22" stroke-width="1.6"/><path d="M${o + 0.8} ${o + s / 3}h${s - 1.6}M${o + 0.8} ${o + (s * 2) / 3}h${s - 1.6}" stroke="#a8743a" stroke-width="1.2"/><path d="M${o + 2} ${o + 2}h${s - 4}" stroke="#f3c88c" stroke-width="1.2" stroke-linecap="round"/>${band ? `<rect x="${o + 1.6}" y="${o + 1.6}" width="${s - 3.2}" height="${s - 3.2}" rx="1.6" fill="none" stroke="${band}" stroke-width="2.6"/>` : ''}`;
}
const playerArt = () =>
  `<ellipse cx="12" cy="20" rx="6" ry="1.6" fill="rgba(18,35,58,.22)"/><circle cx="12" cy="12" r="8" fill="#2f7fd8" stroke="#1d4f8f" stroke-width="1.5"/><path d="M6.5 9.5a6 6 0 0 1 4-4" stroke="#8cc4ff" stroke-width="1.5" fill="none" stroke-linecap="round"/><circle cx="9.4" cy="11.6" r="1.4" fill="#fff"/><circle cx="14.6" cy="11.6" r="1.4" fill="#fff"/><path d="M9.2 15q2.8 1.8 5.6 0" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
const padArt = (kind: string) => {
  const c = KIND_COLOR[kind] ?? '#f2b51f';
  return `<circle cx="12" cy="12" r="8.6" fill="${c}2e" stroke="${c}" stroke-width="2.2"/><circle cx="12" cy="12" r="3" fill="${c}"/>`;
};

/** A tile's picture (mechanics drawn on a floor cell). */
function tileArt(t: string) {
  if (t === '~') return `<path d="M12 4v16M5 8l14 8M19 8 5 16" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M10 5.5l2 1.6 2-1.6M10 18.5l2-1.6 2 1.6" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  if (t === 'o') return `<ellipse cx="12" cy="13" rx="8" ry="6.5" fill="#8a6235"/><ellipse cx="12" cy="14" rx="5.5" ry="4" fill="#6b4724"/><circle cx="8" cy="9" r=".9" fill="#e6c48b"/><circle cx="16.5" cy="10" r=".9" fill="#e6c48b"/>`;
  if (t === 'L') return `<path d="M5 15c2-2 3 1 5-1s3 1 5-1 3 1 4 0" stroke="#ffe08a" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8" cy="9" r="1.6" fill="#ffd36a"/><circle cx="15.5" cy="7.5" r="1.1" fill="#ffd36a"/>`;
  if (t === 'p' || t === 'q') {
    const c = CHANNEL[t === 'p' ? 1 : 2];
    return `<rect x="3.5" y="3.5" width="17" height="17" rx="4" fill="#6b6f7a"/><rect x="5.5" y="5.5" width="13" height="13" rx="3" fill="${c}"/>${num(t === 'p' ? '1' : '2', '#3b2a10')}`;
  }
  if (t === 'P' || t === 'Q') {
    const c = CHANNEL[t === 'P' ? 1 : 2];
    return `<rect x="3" y="3" width="18" height="18" rx="2.5" fill="#3b3a42"/><path d="M8 4.5v15M12 4.5v15M16 4.5v15" stroke="${c}" stroke-width="2.2"/><path d="M3.5 8h17M3.5 16h17" stroke="#5a5966" stroke-width="1.4"/>`;
  }
  if ('^>v<'.includes(t))
    return `<rect x="3" y="3" width="18" height="18" rx="3" fill="#4a4d55"/><g transform="rotate(${DIR_DEG[t]} 12 12)"><path d="M7.5 12l4.5-4.5 4.5 4.5M7.5 17l4.5-4.5 4.5 4.5" stroke="#ffc23d" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  if (t === '1' || t === '2') {
    const c = PAIR[Number(t)];
    return `<circle cx="12" cy="12" r="9" fill="#1f1a33"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="${c}" stroke-width="2.2"/><path d="M12 5.2a6.8 6.8 0 0 1 6.8 6.8" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/>${num(t)}`;
  }
  if (t === 'g' || t === 'G') {
    const [f, s] = t === 'g' ? ['#d6a84f', '#8a6420'] : ['#8d6fd6', '#5a3fa8'];
    return `<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="${f}" stroke="${s}" stroke-width="1.5"/><circle cx="12" cy="12" r="3.6" fill="none" stroke="#fff1c4" stroke-width="2"/><path d="M6 6.5h12" stroke="#fff" stroke-width="1.2" opacity=".45" stroke-linecap="round"/>`;
  }
  if ('NESW'.includes(t))
    return `<g transform="rotate(${DIR_DEG[t]} 12 12)"><path d="M12 11V2.5" stroke="#ff3d6e" stroke-width="3" stroke-linecap="round" opacity=".35"/><path d="M12 11V3" stroke="#ff3d6e" stroke-width="1.8" stroke-linecap="round"/><path d="M9 5.5 12 2.5l3 3" stroke="#ff3d6e" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="6.5" y="9.5" width="11" height="11" rx="3" fill="#5e6472" stroke="#3a3f4a" stroke-width="1.2"/><circle cx="12" cy="15" r="2.6" fill="#ff3d6e"/><circle cx="12" cy="15" r="1" fill="#ffd0dc"/></g>`;
  if (t === 'x') return `<path d="M12 3l6.5 7.5L12 21l-6.5-10.5Z" fill="#7fe0ff" stroke="#2a8bb5" stroke-width="1.5" stroke-linejoin="round"/><path d="M5.5 10.5h13M12 3v18" stroke="#2a8bb5" stroke-width="1" opacity=".55"/><path d="M9 7.5 12 4.5" stroke="#fff" stroke-width="1.3" stroke-linecap="round"/>`;
  return '';
}

/* ---------------------------------------------------------------- tools */

interface Tool {
  id: string;
  /** The tile's picture in the dock. */
  art: string;
  apply: (d: Draft, i: number) => void;
  /** Toggles (pads): the first cell of a stroke decides whether the stroke adds or removes. */
  toggle?: (d: Draft, i: number) => boolean;
}

/** A dock tile: one tool, or a family of variants (a belt's four directions). */
interface Family {
  id: string;
  tools: Tool[];
}

const floorOnly = (f: (d: Draft, i: number) => void) => (d: Draft, i: number) => {
  if (d.base[i] !== '-') d.base[i] = '-';
  f(d, i);
};
const tileTool = (ch: string): Tool => ({ id: `t${ch}`, art: svg(tileArt(ch)), apply: floorOnly((d, i) => (d.tile[i] = ch)) });
const kindTool = (ch: string, art: string): Tool => ({ id: `k${ch}`, art: svg(art), apply: floorOnly((d, i) => (d.kind[i] = ch)) });
const family = (id: string, ...tools: Tool[]): Family => ({ id, tools });
const one = (tool: Tool): Family => ({ id: tool.id, tools: [tool] });
const swatch = (c: string) => `<circle cx="12" cy="12" r="7.5" fill="${c}" stroke="rgba(18,35,58,.25)" stroke-width="1.5"/><circle cx="9.5" cy="9.5" r="2" fill="#fff" opacity=".55"/>`;

const TABS: { name: 'Terrain' | 'Things' | 'Mechanics' | 'Colors'; ic: string; families: Family[] }[] = [
  {
    name: 'Terrain',
    ic: svg('<rect x="3" y="11" width="8" height="9" rx="1.5" fill="#5c7a5e"/><rect x="13" y="6" width="8" height="14" rx="1.5" fill="#8fb97a"/><path d="M3 20.5h18" stroke="#3f5a43" stroke-width="1.5"/>'),
    families: [
      one({ id: 'floor', art: svg('<rect x="3" y="3" width="18" height="18" rx="3" fill="#cfe8b8" stroke="#8fb97a" stroke-width="1.5"/><path d="M3.5 12h17M12 3.5v17" stroke="#b5d69e" stroke-width="1.2"/>'), apply: (d, i) => (d.base[i] = '-') }),
      one({ id: 'wall', art: svg('<rect x="3" y="5.5" width="18" height="15.5" rx="3" fill="#3f5a43"/><rect x="3" y="3" width="18" height="14" rx="3" fill="#5c7a5e"/><path d="M6.5 6.5h11" stroke="#87a588" stroke-width="1.6" stroke-linecap="round"/>'), apply: (d, i) => ((d.base[i] = '#'), (d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' '), (d.kind[i] = ' ')) }),
      one({ id: 'hole', art: svg('<rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="rgba(255,255,255,.35)" stroke="#7d8fa6" stroke-width="1.5" stroke-dasharray="3 2.4"/><path d="M9 15c1-3 5-3 6 0" stroke="#9fb0c4" stroke-width="1.3" fill="none" stroke-linecap="round"/>'), apply: (d, i) => ((d.base[i] = ','), (d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' '), (d.kind[i] = ' '), (d.height[i] = 0)) }),
      one({ id: 'up', art: svg('<path d="M4 17.5 12 21l8-3.5-8-3.5Z" fill="#a7cf8f" stroke="#6f9a5c" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 3v9M8.5 6.5 12 3l3.5 3.5" stroke="#2f6fd0" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'), apply: (d, i) => d.base[i] !== ',' && (d.height[i] = Math.min(3, d.height[i] + 1)) }),
      one({ id: 'down', art: svg('<path d="M4 17.5 12 21l8-3.5-8-3.5Z" fill="#a7cf8f" stroke="#6f9a5c" stroke-width="1.2" stroke-linejoin="round"/><path d="M12 3v9M8.5 8.5 12 12l3.5-3.5" stroke="#c2412f" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'), apply: (d, i) => (d.height[i] = Math.max(0, d.height[i] - 1)) }),
    ],
  },
  {
    name: 'Things',
    ic: svg(crateArt('')),
    families: [
      one({
        id: 'player',
        art: svg(playerArt()),
        apply: floorOnly((d, i) => {
          d.thing = d.thing.map((t) => (t === '@' ? '' : t));
          d.thing[i] = '@';
        }),
      }),
      one({ id: 'crate', art: svg(crateArt('')), apply: floorOnly((d, i) => (d.thing[i] = '$')) }),
      one({ id: 'goal', art: svg(padArt(' ')), apply: floorOnly(() => {}), toggle: (d, i) => !d.goal[i] }),
      one({
        id: 'erase',
        art: svg('<path d="M14.5 4 20 9.5l-9 9H6.5L3.5 15.5Z" fill="#f4a3b5" stroke="#b5475f" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.2 9.3l5.5 5.5" stroke="#b5475f" stroke-width="1.5"/><path d="M12.5 20.5h8" stroke="#b5475f" stroke-width="1.5" stroke-linecap="round"/>'),
        apply: (d, i) => ((d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' '), (d.kind[i] = ' ')),
      }),
    ],
  },
  {
    name: 'Mechanics',
    ic: svg(tileArt('>')),
    families: [
      one({ ...tileTool('~'), art: svg(`<rect x="3" y="3" width="18" height="18" rx="3" fill="#8fd3f5"/>${tileArt('~')}`) }),
      one({ ...tileTool('o'), art: svg(`<rect x="3" y="3" width="18" height="18" rx="3" fill="#e6cf9c"/>${tileArt('o')}`) }),
      one({ ...tileTool('L'), art: svg(`<rect x="3" y="3" width="18" height="18" rx="3" fill="#ff7a2a"/>${tileArt('L')}`) }),
      family('plate', tileTool('p'), tileTool('q')),
      family('door', tileTool('P'), tileTool('Q')),
      family('belt', tileTool('^'), tileTool('>'), tileTool('v'), tileTool('<')),
      family('portal', tileTool('1'), tileTool('2')),
      family('gate', tileTool('g'), tileTool('G')),
      family('laser', tileTool('N'), tileTool('E'), tileTool('S'), tileTool('W')),
      one(tileTool('x')),
    ],
  },
  {
    name: 'Colors',
    ic: svg('<circle cx="8" cy="9" r="5" fill="#e0533d"/><circle cx="16" cy="9" r="5" fill="#3f7fe0"/><circle cx="12" cy="16" r="5" fill="#f2c230"/>'),
    families: [
      one(kindTool('r', swatch(KIND_COLOR.r))),
      one(kindTool('g', swatch(KIND_COLOR.g))),
      one(kindTool('b', swatch(KIND_COLOR.b))),
      one(kindTool('y', swatch(KIND_COLOR.y))),
      family('mirror', kindTool('/', crateArt('/')), kindTool('\\', crateArt('\\'))),
      one(kindTool(' ', '<circle cx="12" cy="12" r="7.5" fill="#fff" stroke="#8a96a6" stroke-width="1.8"/><path d="M7 17 17 7" stroke="#c2412f" stroke-width="2" stroke-linecap="round"/>')),
    ],
  },
];
const FAMILIES = TABS.flatMap((g) => g.families);
const TOOLS = FAMILIES.flatMap((f) => f.tools);
/** A tool's name in the current language. */
const toolLabel = (tool: Tool) => tr(`editor.tool.${tool.id}` as Key);
const familyLabel = (f: Family) => (f.tools.length > 1 ? tr(`editor.fam.${f.id}` as Key) : toolLabel(f.tools[0]));
/** What the chosen tool does, in a line (the colors share one). */
const describe = (f: Family) => tr(`editor.desc.${/^k[rgby]$/.test(f.id) ? 'color' : f.id}` as Key);
const familyOf = (tool: Tool) => FAMILIES.find((f) => f.tools.includes(tool))!;
const tabOf = (tool: Tool) => TABS.findIndex((g) => g.families.includes(familyOf(tool)));

/** Resizes a draft, keeping what fits. */
function resize(d: Draft, w: number, h: number): Draft {
  const n = newDraft(w, h);
  n.name = d.name;
  n.thing.fill('');
  n.goal.fill(false);
  for (let y = 0; y < Math.min(h, d.h); y++)
    for (let x = 0; x < Math.min(w, d.w); x++) {
      const a = y * d.w + x;
      const b = y * w + x;
      n.base[b] = d.base[a];
      n.thing[b] = d.thing[a];
      n.goal[b] = d.goal[a];
      n.tile[b] = d.tile[a];
      n.kind[b] = d.kind[a];
      n.height[b] = d.height[a];
    }
  return n;
}

const MIN = 4;
const MAX = 14;
const GAP = 2;

/** One cell's look: its ground (a class), then the tile, the pad, the thing on top. */
function cellHtml(d: Draft, i: number, cursor: boolean) {
  const base = d.base[i];
  const t = base === '-' ? d.tile[i] : ' ';
  const k = base === '-' ? d.kind[i] : ' ';
  const x = i % d.w;
  const y = Math.floor(i / d.w);
  const ground = base === '#' ? 'w' : base === ',' ? 'v' : t === '~' ? 'f ice' : t === 'o' ? 'f pit' : t === 'L' ? 'f lava' : `f${(x + y) % 2 ? ' alt' : ''}`;
  let layers = '';
  if (base === '-') {
    if (t !== ' ') layers += tileArt(t);
    if (d.goal[i]) layers += padArt(k);
    if (d.thing[i] === '$') layers += crateArt(k, d.goal[i]);
    else if (d.thing[i] === '@') layers += playerArt();
    // A color on a cell with nothing to color yet: a small dot, so it isn't invisible.
    if (k !== ' ' && !d.goal[i] && d.thing[i] !== '$') layers += KIND_COLOR[k] ? `<circle cx="5" cy="19" r="2.6" fill="${KIND_COLOR[k]}" stroke="#fff" stroke-width="1"/>` : `<path d="M3 21 7 17" stroke="#4d5f73" stroke-width="1.8"/>`;
  }
  const hgt = base === '-' && d.height[i] ? d.height[i] : 0;
  return `<div class="ed-cell ${ground}${d.goal[i] && d.thing[i] === '$' ? ' done' : ''}${cursor ? ' cursor' : ''}" data-c="${i}" style="--hgt:${hgt}">${layers ? svg(layers) : ''}${hgt ? `<b class="ed-hgt">${hgt}</b>` : ''}</div>`;
}

export function showEditor(start: Draft, hooks: EditorHooks): Promise<EditorChoice> {
  let d: Draft = structuredClone(start);
  let tool = TOOLS.find((x) => x.id === 'wall')!;
  let tab = tabOf(tool);
  /** The keyboard cursor (-1: none until an arrow key is pressed). */
  let cursor = -1;
  const past: string[] = [];
  const future: string[] = [];

  const el = h(
    'div',
    'screen editor',
    `<div class="ed-top">
        <button class="icon-btn" data-back aria-label="${tr('common.back')}">${icon('chevronLeft')}</button>
        <label class="ed-title"><small>${tr('editor.title')}</small><input class="ed-name" maxlength="32" enterkeyhint="done" aria-label="${tr('editor.name')}"></label>
        <button class="icon-btn" data-act="undo" aria-label="${tr('editor.undo')}">${icon('undo', 20)}</button>
        <button class="icon-btn" data-act="redo" aria-label="${tr('editor.redo')}">${icon('redo', 20)}</button>
      </div>
      <div class="ed-stage">
        <p class="ed-status" role="status" aria-live="polite"></p>
        <div class="ed-grid" tabindex="0" role="application" aria-label="${tr('editor.gridLabel')}"></div>
      </div>
      <div class="ed-dock">
        <div class="ed-tabs" role="tablist">${TABS.map((g, k) => `<button class="ed-tab" role="tab" data-tab="${k}">${g.ic}<span>${tr(`editor.group.${g.name}` as Key)}</span></button>`).join('')}</div>
        <div class="ed-palette"></div>
        <div class="ed-variants"></div>
        <p class="ed-desc"></p>
        <div class="ed-bar">
          <div class="ed-size-wrap">
            <button class="ed-act" data-act="size" aria-expanded="false">${svg('<rect x="4" y="4" width="16" height="16" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 4v16M15 4v16M4 9h16M4 15h16" stroke="currentColor" stroke-width="1.2" opacity=".55"/>')}<span class="ed-size-label"></span></button>
            <div class="ed-pop hidden" role="dialog" aria-label="${tr('editor.size')}">
              <div class="ed-step"><span>${tr('editor.width')}</span><button class="icon-btn small" data-size="w-1" aria-label="${tr('editor.narrower')}">−</button><b class="ed-w"></b><button class="icon-btn small" data-size="w1" aria-label="${tr('editor.wider')}">+</button></div>
              <div class="ed-step"><span>${tr('editor.height')}</span><button class="icon-btn small" data-size="h-1" aria-label="${tr('editor.shorter')}">−</button><b class="ed-h"></b><button class="icon-btn small" data-size="h1" aria-label="${tr('editor.taller')}">+</button></div>
            </div>
          </div>
          <button class="ed-act" data-act="clear">${icon('plusSquare', 20)}<span>${tr('editor.new')}</span></button>
          <button class="ed-act" data-act="check">${icon('bulb', 20)}<span>${tr('editor.check')}</span></button>
          <button class="ed-act" data-act="share">${icon('share', 20)}<span>${tr('editor.share')}</span></button>
          <button class="big-btn primary ed-play" data-act="play">${icon('play', 18)}<span>${tr('editor.play')}</span></button>
        </div>
      </div>`,
  );
  const grid = el.querySelector<HTMLElement>('.ed-grid')!;
  const stage = el.querySelector<HTMLElement>('.ed-stage')!;
  const status = el.querySelector<HTMLElement>('.ed-status')!;
  const name = el.querySelector<HTMLInputElement>('.ed-name')!;
  const palette = el.querySelector<HTMLElement>('.ed-palette')!;
  const variants = el.querySelector<HTMLElement>('.ed-variants')!;
  const pop = el.querySelector<HTMLElement>('.ed-pop')!;
  const desc = el.querySelector<HTMLElement>('.ed-desc')!;
  name.value = d.name;

  /** What stops the level from being played, said the player's way (the parser's words last). */
  const problem = () => {
    const n = d.w * d.h;
    const cells = [...Array(n).keys()].filter((i) => d.base[i] === '-');
    if (!cells.some((i) => d.thing[i] === '@')) return tr('editor.err.noPlayer');
    for (const p of ['1', '2']) {
      const count = cells.filter((i) => d.tile[i] === p).length;
      if (count && count !== 2) return tr('editor.err.portal', { n: p });
    }
    for (const c of 'rgby') {
      const want = cells.filter((i) => d.goal[i] && d.kind[i] === c).length;
      const have = cells.filter((i) => d.thing[i] === '$' && d.kind[i] === c).length;
      if (have < want) return tr('editor.err.color', { color: tr(`editor.tool.k${c}` as Key) });
    }
    const crates = cells.filter((i) => d.thing[i] === '$').length;
    const pads = cells.filter((i) => d.goal[i]).length;
    if (crates < pads) return tr('editor.err.crates', { crates, pads });
    try {
      const g = parseLevel(draftLevel(d));
      if (g.goals.length + g.receivers.length === 0) return tr('editor.noGoal');
      return '';
    } catch (e) {
      return String((e as Error).message).replace(/^workshop: /, '');
    }
  };
  const say = (text: string, kind: '' | 'bad' | 'good' | 'busy' = '') => {
    status.textContent = text;
    status.className = `ed-status ${kind}`;
  };
  const sayState = () => {
    const p = problem();
    if (p) say(p, 'bad');
    else if (d.par > 0) say(tr('editor.solvable', { par: d.par }), 'good');
    else say(past.length ? tr('editor.unchecked') : tr('editor.howTo'));
  };

  /** Fits the cells to the stage: as big as both directions allow, up to 52px. */
  const fit = () => {
    const cs = getComputedStyle(stage);
    const w = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;
    const hh = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - 12 - status.offsetHeight - 8;
    const room = Math.min((w - GAP * (d.w - 1)) / d.w, (hh - GAP * (d.h - 1)) / d.h);
    grid.style.setProperty('--cell', `${Math.max(18, Math.min(matchMedia('(pointer: fine)').matches ? 64 : 56, Math.floor(room)))}px`);
  };
  const drawGrid = () => {
    grid.style.setProperty('--w', String(d.w));
    grid.innerHTML = d.base.map((_, i) => cellHtml(d, i, i === cursor)).join('');
    fit();
  };
  const redrawCell = (i: number) => {
    const c = grid.children[i];
    if (c) c.outerHTML = cellHtml(d, i, i === cursor);
  };
  const drawDock = () => {
    for (const b of el.querySelectorAll<HTMLElement>('[data-tab]')) {
      const on = Number(b.dataset.tab) === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    }
    const fam = familyOf(tool);
    const scroll = palette.dataset.tab === String(tab) ? palette.scrollLeft : 0;
    palette.dataset.tab = String(tab);
    palette.innerHTML = TABS[tab].families
      .map((f) => {
        const shown = f === fam ? tool : f.tools[0];
        return `<button class="ed-tool${f === fam ? ' on' : ''}" data-fam="${f.id}" aria-pressed="${f === fam}" aria-label="${familyLabel(f)}">${shown.art}<span>${familyLabel(f)}</span>${f.tools.length > 1 ? `<i class="ed-more">${f.tools.length}</i>` : ''}</button>`;
      })
      .join('');
    variants.innerHTML = fam.tools.length > 1 && tabOf(tool) === tab ? fam.tools.map((v) => `<button class="ed-var${v === tool ? ' on' : ''}" data-tool="${v.id}" aria-pressed="${v === tool}" aria-label="${toolLabel(v)}" title="${toolLabel(v)}">${v.art}</button>`).join('') : '';
    variants.classList.toggle('hidden', !variants.innerHTML);
    desc.innerHTML = `<b>${fam.tools.length > 1 ? toolLabel(tool) : familyLabel(fam)}</b> ${describe(fam)}`;
    // The row keeps its place; the chosen tile is scrolled into view if it's off the edge.
    palette.scrollLeft = scroll;
    palette.querySelector('.ed-tool.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const drawBar = () => {
    el.querySelector('.ed-size-label')!.textContent = `${d.w}×${d.h}`;
    el.querySelector('.ed-w')!.textContent = String(d.w);
    el.querySelector('.ed-h')!.textContent = String(d.h);
    el.querySelector<HTMLButtonElement>('[data-act="undo"]')!.disabled = !past.length;
    el.querySelector<HTMLButtonElement>('[data-act="redo"]')!.disabled = !future.length;
  };
  const render = () => {
    drawGrid();
    drawDock();
    drawBar();
    sayState();
  };

  /** Keeps the state before a change, so it can be undone. */
  const remember = () => {
    past.push(JSON.stringify(d));
    if (past.length > 120) past.shift();
    future.length = 0;
  };
  const changed = () => {
    d.par = 0;
    hooks.save(d);
    render();
  };
  const travel = (from: string[], to: string[]) => {
    const s = from.pop();
    if (!s) return;
    to.push(JSON.stringify(d));
    d = JSON.parse(s) as Draft;
    name.value = d.name;
    cursor = Math.min(cursor, d.w * d.h - 1);
    hooks.save(d);
    render();
  };

  // Painting: press and drag; cells are found from the pointer's position, and a quick drag
  // fills every cell between two events, so a fast swipe leaves no gaps.
  let stroke: { before: string; last: number; set?: boolean; seen: Set<number> } | null = null;
  const cellAt = (cx: number, cy: number) => {
    const r = grid.getBoundingClientRect();
    const x = Math.floor((cx - r.left) / ((r.width + GAP) / d.w));
    const y = Math.floor((cy - r.top) / ((r.height + GAP) / d.h));
    return x >= 0 && y >= 0 && x < d.w && y < d.h ? y * d.w + x : -1;
  };
  const paintCell = (i: number) => {
    if (!stroke || i < 0 || stroke.seen.has(i)) return;
    stroke.seen.add(i);
    const before = JSON.stringify([d.base[i], d.thing[i], d.goal[i], d.tile[i], d.kind[i], d.height[i]]);
    if (tool.toggle) {
      if (stroke.set === undefined) stroke.set = tool.toggle(d, i);
      tool.apply(d, i);
      d.goal[i] = stroke.set;
    } else tool.apply(d, i);
    if (JSON.stringify([d.base[i], d.thing[i], d.goal[i], d.tile[i], d.kind[i], d.height[i]]) === before) return;
    d.par = 0;
    hooks.tick?.();
    // Moving the player clears where it was.
    if (tool.id === 'player') drawGrid();
    else redrawCell(i);
  };
  const paintLine = (to: number) => {
    if (!stroke || to < 0) return;
    const from = stroke.last;
    stroke.last = to;
    if (from < 0) return paintCell(to);
    const [x0, y0, x1, y1] = [from % d.w, Math.floor(from / d.w), to % d.w, Math.floor(to / d.w)];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 1; s <= n; s++) paintCell(Math.round(y0 + ((y1 - y0) * s) / n) * d.w + Math.round(x0 + ((x1 - x0) * s) / n));
  };
  const endStroke = () => {
    if (!stroke) return;
    const { before } = stroke;
    stroke = null;
    if (before === JSON.stringify(d)) return;
    past.push(before);
    if (past.length > 120) past.shift();
    future.length = 0;
    changed();
  };
  grid.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    e.preventDefault();
    closePop();
    try {
      grid.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    stroke = { before: JSON.stringify(d), last: -1, seen: new Set() };
    paintLine(cellAt(e.clientX, e.clientY));
  });
  grid.addEventListener('pointermove', (e) => {
    if (stroke) paintLine(cellAt(e.clientX, e.clientY));
  });
  grid.addEventListener('pointerup', endStroke);
  grid.addEventListener('pointercancel', endStroke);
  grid.addEventListener('lostpointercapture', endStroke);

  // Keyboard: arrows move a cursor over the grid, Space or Enter paints there.
  grid.addEventListener('keydown', (e) => {
    const dirs: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    const step = dirs[e.key];
    if (step) {
      e.preventDefault();
      const old = cursor;
      const x = cursor < 0 ? 0 : Math.max(0, Math.min(d.w - 1, (cursor % d.w) + step[0]));
      const y = cursor < 0 ? 0 : Math.max(0, Math.min(d.h - 1, Math.floor(cursor / d.w) + step[1]));
      cursor = y * d.w + x;
      if (old >= 0) redrawCell(old);
      redrawCell(cursor);
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && cursor >= 0) {
      e.preventDefault();
      stroke = { before: JSON.stringify(d), last: -1, seen: new Set() };
      paintLine(cursor);
      endStroke();
    }
  });
  grid.addEventListener('blur', () => {
    const old = cursor;
    cursor = -1;
    if (old >= 0) redrawCell(old);
  });

  const onKey = (e: KeyboardEvent) => {
    if (document.querySelector('.modal') || e.target === name) return;
    if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) travel(future, past);
      else travel(past, future);
    } else if ((e.metaKey || e.ctrlKey) && e.code === 'KeyY') {
      e.preventDefault();
      travel(future, past);
    } else if (e.key === 'Escape' && !pop.classList.contains('hidden')) {
      e.stopPropagation();
      closePop();
    }
  };
  addEventListener('keydown', onKey, true);

  const resizeObserver = new ResizeObserver(fit);
  resizeObserver.observe(stage);

  function closePop() {
    pop.classList.add('hidden');
    el.querySelector('[data-act="size"]')!.setAttribute('aria-expanded', 'false');
  }

  name.addEventListener('input', () => {
    d.name = name.value;
    hooks.save(d);
  });
  name.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') name.blur();
  });

  render();

  return new Promise((resolve) => {
    const finish = (c: EditorChoice) => {
      removeEventListener('keydown', onKey, true);
      resizeObserver.disconnect();
      closeOverlay(el);
      resolve(c);
    };
    const checkNow = async (): Promise<number> => {
      if (problem()) return 0;
      say(tr('editor.checking'), 'busy');
      const par = await hooks.check(draftLevel(d));
      d.par = Math.max(0, par);
      hooks.save(d);
      if (par > 0) say(tr('editor.solvable', { par }), 'good');
      else if (par === 0) say(tr('editor.noSolution'), 'bad');
      else say(tr('editor.tooBig'), 'bad');
      return par;
    };
    el.onclick = async (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!btn || btn.disabled) return;
      if (!btn.closest('.ed-size-wrap')) closePop();
      hooks.click();
      if (btn.dataset.back !== undefined) return finish({ type: 'back' });
      if (btn.dataset.tab) {
        tab = Number(btn.dataset.tab);
        drawDock();
        return;
      }
      if (btn.dataset.fam) {
        const f = FAMILIES.find((x) => x.id === btn.dataset.fam)!;
        // Pressing the chosen family again steps to its next variant (a belt turns).
        tool = familyOf(tool) === f ? f.tools[(f.tools.indexOf(tool) + 1) % f.tools.length] : f.tools[0];
        drawDock();
        return;
      }
      if (btn.dataset.tool) {
        tool = TOOLS.find((x) => x.id === btn.dataset.tool)!;
        drawDock();
        return;
      }
      if (btn.dataset.size) {
        const [, axis, delta] = btn.dataset.size.match(/^([wh])(-?1)$/)!;
        const w = Math.max(MIN, Math.min(MAX, d.w + (axis === 'w' ? Number(delta) : 0)));
        const hh = Math.max(MIN, Math.min(MAX, d.h + (axis === 'h' ? Number(delta) : 0)));
        if (w === d.w && hh === d.h) return;
        remember();
        d = resize(d, w, hh);
        cursor = -1;
        changed();
        return;
      }
      const act = btn.dataset.act;
      if (act === 'size') {
        const open = pop.classList.toggle('hidden') === false;
        btn.setAttribute('aria-expanded', String(open));
      } else if (act === 'undo') travel(past, future);
      else if (act === 'redo') travel(future, past);
      else if (act === 'clear') {
        // A fresh level; undo brings the old one back.
        remember();
        d = newDraft();
        name.value = d.name;
        cursor = -1;
        changed();
      } else if (act === 'check') await checkNow();
      else if (act === 'play') {
        const p = problem();
        if (p) return say(p, 'bad');
        finish({ type: 'play', level: draftLevel(d), par: d.par });
      } else if (act === 'share') {
        const p = problem();
        if (p) return say(p, 'bad');
        const par = d.par || (await checkNow());
        if (par === 0) return;
        say(await hooks.share(draftLevel(d), Math.max(0, par)), 'good');
      }
    };
    document.body.append(el);
    requestAnimationFrame(fit);
  });
}
