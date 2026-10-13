/**
 * Gamepads (the standard mapping), polled each frame. In a level: d-pad or left stick to
 * move (held: repeats; with A held, pull on pull levels), B undo, X hint, Y restart, shoulders turn the camera, Start back.
 * In menus: d-pad or stick moves the focus to the nearest button that way, A presses it,
 * B goes back.
 */
export interface PadTarget {
  /** True while a level is being played. */
  playing: () => boolean;
  /** `pull`: A is held (pull levels). */
  move: (screenDir: number, pull: boolean) => void;
  act: (action: string) => void;
}

const BTN = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
const FIRST = 0.28;
const AGAIN = 0.14;

export function startGamepad(t: PadTarget) {
  const was = new Set<number>();
  let held = -1;
  let wasPlaying = false;
  let heldSince = 0;
  let lastRepeat = 0;
  const focusable = () => [...document.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]')].filter((e) => e.offsetParent !== null && !e.closest('.hud.hidden'));
  /** The top layer's buttons (a modal over the title), so focus never wanders behind it. */
  const layer = () => {
    const all = focusable();
    const modals = [...document.querySelectorAll('.modal')];
    const top = modals[modals.length - 1];
    return top ? all.filter((e) => top.contains(e)) : all;
  };
  const moveFocus = (dir: number) => {
    const items = layer();
    if (!items.length) return;
    const cur = document.activeElement instanceof HTMLElement && items.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) return items[0].focus({ focusVisible: true } as FocusOptions);
    const a = cur.getBoundingClientRect();
    const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][dir];
    let best: HTMLElement | null = null;
    let score = Infinity;
    for (const e of items) {
      if (e === cur) continue;
      const b = e.getBoundingClientRect();
      const vx = b.x + b.width / 2 - (a.x + a.width / 2);
      const vy = b.y + b.height / 2 - (a.y + a.height / 2);
      const along = vx * dx + vy * dy;
      if (along <= 4) continue;
      const across = Math.abs(vx * dy - vy * dx);
      const s = along + across * 2.5;
      if (s < score) {
        score = s;
        best = e;
      }
    }
    best?.focus({ focusVisible: true } as FocusOptions);
  };
  const back = () => {
    const b = document.querySelector<HTMLElement>('.modal [data-done], .modal [data-back], [data-back], .back-btn');
    b?.click();
  };
  const poll = (now: number) => {
    requestAnimationFrame(poll);
    const pads = navigator.getGamepads?.() ?? [];
    const pad = [...pads].find((p) => p?.connected);
    if (!pad) return;
    const pressed = (i: number) => !!pad.buttons[i]?.pressed;
    const down = (i: number) => pressed(i) && !was.has(i);
    // A direction from the d-pad, or the left stick past a dead zone.
    const [sx, sy] = [pad.axes[0] ?? 0, pad.axes[1] ?? 0];
    let dir = pressed(BTN.up) ? 0 : pressed(BTN.right) ? 1 : pressed(BTN.down) ? 2 : pressed(BTN.left) ? 3 : -1;
    if (dir < 0 && Math.hypot(sx, sy) > 0.55) dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 1 : 3) : sy > 0 ? 2 : 0;
    const time = now / 1000;
    let fire = false;
    // Switching between menus and play: a direction still held doesn't carry over.
    const playing = t.playing();
    if (playing !== wasPlaying) {
      wasPlaying = playing;
      held = dir;
      heldSince = lastRepeat = time;
    }
    if (dir !== held) {
      held = dir;
      heldSince = lastRepeat = time;
      fire = dir >= 0;
    } else if (dir >= 0 && time - heldSince > FIRST && time - lastRepeat > AGAIN) {
      lastRepeat = time;
      fire = true;
    }
    if (playing) {
      if (fire) t.move(dir, pressed(BTN.a));
      if (down(BTN.b)) t.act('undo');
      if (down(BTN.x)) t.act('hint');
      if (down(BTN.y)) t.act('restart');
      if (down(BTN.lb)) t.act('left');
      if (down(BTN.rb)) t.act('right');
      if (down(BTN.start) || down(BTN.select)) t.act('back');
    } else {
      if (fire) moveFocus(dir);
      // Nothing focused: the layer's main button (not its close button).
      const main = () => layer().find((b) => b.classList.contains('primary')) ?? layer()[0];
      if (down(BTN.a)) (document.activeElement instanceof HTMLElement && layer().includes(document.activeElement) ? document.activeElement : main())?.click();
      if (down(BTN.b)) back();
    }
    was.clear();
    pad.buttons.forEach((b, i) => b.pressed && was.add(i));
  };
  requestAnimationFrame(poll);
}
