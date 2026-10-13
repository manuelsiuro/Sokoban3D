/**
 * Phone vibration for the big moments (a no-op where the device or browser has none, as on
 * iPhones). Patterns are milliseconds: buzz, pause, buzz…
 */
const PATTERNS = {
  push: [8],
  bump: [14],
  goal: [12, 40, 18],
  fall: [30],
  lava: [20, 30, 40],
  win: [20, 60, 20, 60, 50],
} as const;

export type Haptic = keyof typeof PATTERNS;

let on = true;

export function setHaptics(enabled: boolean) {
  on = enabled;
}

export function buzz(kind: Haptic) {
  if (!on || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(PATTERNS[kind] as unknown as number[]);
  } catch {
    /* blocked (no user gesture yet) */
  }
}
