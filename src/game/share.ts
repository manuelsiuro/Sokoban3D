import type { LevelDef } from '../levels/types';
import { parseLevel } from '../sim/grid';

/**
 * Share links for workshop levels: the level's layers as compact JSON, base64url-encoded,
 * after `#lvl=`. Version 1; blank layers are left out. Decoding checks the level parses.
 */
interface Packed {
  v: 1;
  n: string;
  m: string[];
  h?: string[];
  t?: string[];
  k?: string[];
  /** The par, when the solver found it. */
  p?: number;
}

const blank = (rows: string[] | undefined, re: RegExp) => !rows || rows.every((r) => re.test(r));
const toB64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const fromB64 = (s: string) => new TextDecoder().decode(Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0)));

export function encodeLevel(level: LevelDef, par?: number): string {
  const p: Packed = { v: 1, n: level.name, m: level.map };
  if (!blank(level.heights, /^0*$/)) p.h = level.heights;
  if (!blank(level.tiles, /^ *$/)) p.t = level.tiles;
  if (!blank(level.kinds, /^ *$/)) p.k = level.kinds;
  if (par) p.p = par;
  return toB64(JSON.stringify(p));
}

/** The level (and par) in a link, or null when it's broken. */
export function decodeLevel(code: string): { level: LevelDef; par: number } | null {
  try {
    const p = JSON.parse(fromB64(code)) as Partial<Packed>;
    if (p.v !== 1 || !Array.isArray(p.m)) return null;
    const level: LevelDef = { id: 'shared', name: String(p.n || 'Shared level').slice(0, 40), world: 'meadow', difficulty: 3, tip: 'A level someone built in the workshop.', map: p.m, heights: p.h, tiles: p.t, kinds: p.k };
    parseLevel(level);
    return { level, par: Number(p.p) || 0 };
  } catch {
    return null;
  }
}

/** A link to play a level: this page's address with the level after #lvl=. */
export const shareLink = (level: LevelDef, par?: number) => `${location.origin}${location.pathname}#lvl=${encodeLevel(level, par)}`;
