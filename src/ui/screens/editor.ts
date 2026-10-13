import type { LevelDef } from '../../levels/types';
import { parseLevel } from '../../sim/grid';
import { closeOverlay, h } from '../dom';
import { icon } from '../icons';
import { t as tr, type Key } from '../../i18n';

/**
 * The workshop: paint a level on a grid (terrain, things, mechanics, colors, heights), check
 * it with the solver, test it in 3D, share it as a link. The draft is plain data, saved by
 * the caller after every change.
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

interface Tool {
  id: string;
  label: string;
  glyph: string;
  apply: (d: Draft, i: number) => void;
}

const floorOnly = (f: (d: Draft, i: number) => void) => (d: Draft, i: number) => {
  if (d.base[i] !== '-') d.base[i] = '-';
  f(d, i);
};
const tileTool = (ch: string, label: string, glyph = ch): Tool => ({ id: `t${ch}`, label, glyph, apply: floorOnly((d, i) => (d.tile[i] = ch)) });
const kindTool = (ch: string, label: string, glyph: string): Tool => ({ id: `k${ch}`, label, glyph, apply: floorOnly((d, i) => (d.kind[i] = ch)) });

const GROUPS: { name: string; tools: Tool[] }[] = [
  {
    name: 'Terrain',
    tools: [
      { id: 'floor', label: 'Floor', glyph: '□', apply: (d, i) => (d.base[i] = '-') },
      { id: 'wall', label: 'Wall', glyph: '■', apply: (d, i) => ((d.base[i] = '#'), (d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' ')) },
      { id: 'hole', label: 'Hole', glyph: '·', apply: (d, i) => ((d.base[i] = ','), (d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' ')) },
      { id: 'up', label: 'Raise', glyph: '▲', apply: (d, i) => (d.height[i] = Math.min(3, d.height[i] + 1)) },
      { id: 'down', label: 'Lower', glyph: '▼', apply: (d, i) => (d.height[i] = Math.max(0, d.height[i] - 1)) },
    ],
  },
  {
    name: 'Things',
    tools: [
      {
        id: 'player',
        label: 'Player',
        glyph: '☺',
        apply: floorOnly((d, i) => {
          d.thing = d.thing.map((t) => (t === '@' ? '' : t));
          d.thing[i] = '@';
        }),
      },
      { id: 'crate', label: 'Crate', glyph: '▣', apply: floorOnly((d, i) => (d.thing[i] = '$')) },
      { id: 'goal', label: 'Pad', glyph: '◎', apply: floorOnly((d, i) => (d.goal[i] = !d.goal[i])) },
      { id: 'erase', label: 'Clear', glyph: '✕', apply: (d, i) => ((d.thing[i] = ''), (d.goal[i] = false), (d.tile[i] = ' '), (d.kind[i] = ' ')) },
    ],
  },
  {
    name: 'Mechanics',
    tools: [
      tileTool('~', 'Ice', '❄'),
      tileTool('o', 'Sand pit', '◌'),
      tileTool('L', 'Lava', '♨'),
      tileTool('p', 'Plate 1', 'p'),
      tileTool('P', 'Door 1', 'P'),
      tileTool('q', 'Plate 2', 'q'),
      tileTool('Q', 'Door 2', 'Q'),
      tileTool('^', 'Belt up', '↑'),
      tileTool('>', 'Belt right', '→'),
      tileTool('v', 'Belt down', '↓'),
      tileTool('<', 'Belt left', '←'),
      tileTool('1', 'Portal 1', '①'),
      tileTool('2', 'Portal 2', '②'),
      tileTool('g', 'Gate even', 'g'),
      tileTool('G', 'Gate odd', 'G'),
      tileTool('N', 'Laser up', '⇡'),
      tileTool('E', 'Laser right', '⇢'),
      tileTool('S', 'Laser down', '⇣'),
      tileTool('W', 'Laser left', '⇠'),
      tileTool('x', 'Crystal 1', '◆'),
    ],
  },
  {
    name: 'Colors',
    tools: [
      kindTool('r', 'Red', '●'),
      kindTool('g', 'Green', '●'),
      kindTool('b', 'Blue', '●'),
      kindTool('y', 'Yellow', '●'),
      kindTool('/', 'Mirror /', '⟋'),
      kindTool('\\', 'Mirror \\', '⟍'),
      kindTool(' ', 'Plain', '○'),
    ],
  },
];
const TOOLS = GROUPS.flatMap((g) => g.tools);
/** A tool's name in the current language. */
const toolLabel = (tool: Tool) => tr(`editor.tool.${tool.id}` as Key);
const KIND_COLOR: Record<string, string> = { r: '#e0533d', g: '#4fb84a', b: '#3f7fe0', y: '#f2c230' };

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

export function showEditor(start: Draft, hooks: EditorHooks): Promise<EditorChoice> {
  let d: Draft = structuredClone(start);
  let tool = TOOLS[1];
  const el = h(
    'div',
    'screen editor',
    `<div class="screen-inner">
      <div class="screen-head">
        <button class="icon-btn" data-back aria-label="${tr('common.back')}">${icon('chevronLeft')}</button>
        <h2>${tr('editor.title')}</h2>
      </div>
      <div class="ed-row">
        <input class="ed-name" maxlength="32" aria-label="${tr('editor.name')}">
        <span class="ed-size">
          <button class="icon-btn small" data-size="w-1" aria-label="${tr('editor.narrower')}">−</button><b class="ed-w"></b>
          <button class="icon-btn small" data-size="w1" aria-label="${tr('editor.wider')}">+</button>
          <span>×</span>
          <button class="icon-btn small" data-size="h-1" aria-label="${tr('editor.shorter')}">−</button><b class="ed-h"></b>
          <button class="icon-btn small" data-size="h1" aria-label="${tr('editor.taller')}">+</button>
        </span>
      </div>
      <div class="ed-tools">${GROUPS.map((g) => `<div class="ed-group"><small>${tr(`editor.group.${g.name}` as Key)}</small><div>${g.tools.map((t) => `<button class="ed-tool" data-tool="${t.id}" title="${toolLabel(t)}" style="${t.id.startsWith('k') && KIND_COLOR[t.id[1]] ? `color:${KIND_COLOR[t.id[1]]}` : ''}"><i>${t.glyph}</i><span>${toolLabel(t)}</span></button>`).join('')}</div></div>`).join('')}</div>
      <div class="ed-grid-wrap"><div class="ed-grid"></div></div>
      <p class="ed-status"></p>
      <div class="actions ed-actions">
        <button class="big-btn ghost" data-act="clear">${icon('close', 16)} ${tr('editor.new')}</button>
        <button class="big-btn ghost" data-act="check">${icon('bulb', 16)} ${tr('editor.check')}</button>
        <button class="big-btn ghost" data-act="share">${icon('share', 16)} ${tr('editor.share')}</button>
        <button class="big-btn primary" data-act="play">${icon('play', 16)} ${tr('editor.play')}</button>
      </div>
    </div>`,
  );
  const grid = el.querySelector<HTMLElement>('.ed-grid')!;
  const status = el.querySelector<HTMLElement>('.ed-status')!;
  const name = el.querySelector<HTMLInputElement>('.ed-name')!;
  name.value = d.name;
  const problem = () => {
    try {
      const g = parseLevel(draftLevel(d));
      if (g.goals.length + g.receivers.length === 0) return tr('editor.noGoal');
      return '';
    } catch (e) {
      return String((e as Error).message).replace(/^workshop: /, '');
    }
  };
  const say = (text: string, bad = false) => {
    status.textContent = text;
    status.classList.toggle('bad', bad);
  };
  const cellHtml = (i: number) => {
    const t = d.tile[i];
    const k = d.kind[i];
    const glyph = d.thing[i] === '@' ? '☺' : d.thing[i] === '$' ? (k === '/' ? '⟋' : k === '\\' ? '⟍' : '▣') : TOOLS.find((x) => x.id === `t${t}`)?.glyph ?? '';
    const color = KIND_COLOR[k] ? `color:${KIND_COLOR[k]}` : '';
    return `<button class="ed-cell b${d.base[i] === '#' ? 'w' : d.base[i] === ',' ? 'v' : 'f'} ${t !== ' ' ? `t${'~oL'.includes(t) ? t.replace('~', 'ice').replace('o', 'pit').replace('L', 'lava') : 'x'}` : ''} ${d.goal[i] ? 'goal' : ''}" data-c="${i}" style="${color}">${glyph}${d.height[i] ? `<sup>${d.height[i]}</sup>` : ''}</button>`;
  };
  const render = () => {
    grid.style.setProperty('--w', String(d.w));
    grid.innerHTML = d.base.map((_, i) => cellHtml(i)).join('');
    el.querySelector('.ed-w')!.textContent = String(d.w);
    el.querySelector('.ed-h')!.textContent = String(d.h);
    for (const b of el.querySelectorAll<HTMLElement>('[data-tool]')) b.classList.toggle('on', b.dataset.tool === tool.id);
    const p = problem();
    if (p) say(p, true);
    else say(d.par > 0 ? tr('editor.solvable', { par: d.par }) : tr('editor.unchecked'));
  };
  const changed = () => {
    d.par = 0;
    hooks.save(d);
    render();
  };
  render();

  // Painting: press and drag over cells.
  let painting = false;
  let last = -1;
  const paint = (target: EventTarget | null) => {
    const c = (target as HTMLElement | null)?.closest<HTMLElement>('[data-c]');
    if (!c) return;
    const i = Number(c.dataset.c);
    if (i === last) return;
    last = i;
    tool.apply(d, i);
    d.par = 0;
    c.outerHTML = cellHtml(i);
  };
  grid.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    painting = true;
    last = -1;
    paint(e.target);
  });
  grid.addEventListener('pointermove', (e) => {
    if (painting) paint(document.elementFromPoint(e.clientX, e.clientY));
  });
  const stop = () => {
    if (!painting) return;
    painting = false;
    changed();
  };
  addEventListener('pointerup', stop);
  name.addEventListener('input', () => {
    d.name = name.value;
    hooks.save(d);
  });

  return new Promise((resolve) => {
    const finish = (c: EditorChoice) => {
      removeEventListener('pointerup', stop);
      closeOverlay(el);
      resolve(c);
    };
    const checkNow = async (): Promise<number> => {
      if (problem()) return 0;
      say(tr('editor.checking'));
      const par = await hooks.check(draftLevel(d));
      d.par = Math.max(0, par);
      hooks.save(d);
      if (par > 0) say(tr('editor.solvable', { par }));
      else if (par === 0) say(tr('editor.noSolution'), true);
      else say(tr('editor.tooBig'), true);
      return par;
    };
    el.onclick = async (e) => {
      const t = e.target as HTMLElement;
      const btn = t.closest<HTMLElement>('button');
      if (!btn || btn.dataset.c) return;
      hooks.click();
      if (btn.dataset.back !== undefined) return finish({ type: 'back' });
      if (btn.dataset.tool) {
        tool = TOOLS.find((x) => x.id === btn.dataset.tool)!;
        render();
        return;
      }
      if (btn.dataset.size) {
        const [, axis, delta] = btn.dataset.size.match(/^([wh])(-?1)$/)!;
        const w = Math.max(4, Math.min(14, d.w + (axis === 'w' ? Number(delta) : 0)));
        const hh = Math.max(4, Math.min(14, d.h + (axis === 'h' ? Number(delta) : 0)));
        d = resize(d, w, hh);
        changed();
        return;
      }
      const act = btn.dataset.act;
      if (act === 'clear') {
        d = newDraft();
        name.value = d.name;
        changed();
      } else if (act === 'check') await checkNow();
      else if (act === 'play') {
        const p = problem();
        if (p) return say(p, true);
        finish({ type: 'play', level: draftLevel(d), par: d.par });
      } else if (act === 'share') {
        const p = problem();
        if (p) return say(p, true);
        const par = d.par || (await checkNow());
        if (par === 0) return;
        say(await hooks.share(draftLevel(d), Math.max(0, par)));
      }
    };
    document.body.append(el);
  });
}
