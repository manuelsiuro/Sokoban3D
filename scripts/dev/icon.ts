/**
 * The app icon, drawn from isometric geometry: a 3×3 floating island with a crate, the pad it
 * goes to, the pusher behind it and a bush, under a soft sky. Writes public/icon.svg (full
 * bleed), public/icon-maskable.svg (the art inside the round-mask safe zone) and
 * public/favicon.svg (a close-up for browser tabs); the PNGs come from them:
 *
 *   npx tsx scripts/dev/icon.ts && npm run icons
 */
import { writeFileSync } from 'node:fs';

const A = 66; // half a tile's width on screen
const B = A / 2; // half its height
const H = 66; // one unit of height
const CX = 256;
const CY = 256;
/** Grid (x, y: 0..3 across the island, z: up) to screen. */
const P = (x: number, y: number, z = 0) => [CX + (x - y) * A, CY + (x + y - 3) * B - z * H] as const;
const pts = (...ps: (readonly [number, number])[]) => ps.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
const poly = (fill: string, ps: (readonly [number, number])[], extra = '') => `<polygon points="${pts(...ps)}" fill="${fill}" ${extra}/>`;

/** A box from (x0, y0) to (x1, y1), z0 to z1: its three visible faces (top, left-front, right-front). */
function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number, top: string, left: string, right: string, extra = '') {
  return [
    poly(left, [P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), P(x0, y1, z0)], extra),
    poly(right, [P(x1, y0, z1), P(x1, y1, z1), P(x1, y1, z0), P(x1, y0, z0)], extra),
    poly(top, [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)], extra),
  ].join('');
}

const parts: string[] = [];
// The rock under the island: two faceted faces narrowing to a point.
const soil = 0.42;
const tip = P(2.1, 2.1, -soil - 1.9);
parts.push(poly('#8b7768', [P(0, 3, -soil), P(3, 3, -soil), P(2.55, 2.75, -soil - 0.9), tip, P(1.1, 2.8, -soil - 1.05)]));
parts.push(poly('#6e5d52', [P(3, 0, -soil), P(3, 3, -soil), P(2.55, 2.75, -soil - 0.9), tip, P(2.85, 1.0, -soil - 0.9)]));
parts.push(`<path d="M${pts(P(1.6, 3, -soil), P(1.75, 2.85, -soil - 1.05))} M${pts(P(3, 1.8, -soil), P(2.9, 1.9, -soil - 0.95))}" stroke="#5e4f46" stroke-width="5" stroke-linecap="round" fill="none" opacity="0.55"/>`);
// Soil, then a grass lip hanging over its top edge.
parts.push(box(0, 0, 3, 3, -soil, 0, '#5f9f45', '#a8744a', '#8a5c38'));
parts.push(poly('#6fbf52', [P(0, 3, 0), P(3, 3, 0), P(3, 3, -0.13), P(2.4, 3, -0.2), P(1.7, 3, -0.12), P(1.0, 3, -0.19), P(0, 3, -0.11)]));
parts.push(poly('#5aa844', [P(3, 0, 0), P(3, 3, 0), P(3, 3, -0.13), P(3, 2.2, -0.19), P(3, 1.4, -0.11), P(3, 0.6, -0.18), P(3, 0, -0.1)]));
// The grass: a checker of tiles, a hair apart.
for (let x = 0; x < 3; x++)
  for (let y = 0; y < 3; y++) {
    const g = 0.035;
    parts.push(poly((x + y) % 2 ? '#93d46c' : '#9fdc78', [P(x + g, y + g), P(x + 1 - g, y + g), P(x + 1 - g, y + 1 - g), P(x + g, y + 1 - g)]));
  }
// The pad on the front-right tile, glowing.
{
  const [px, py] = P(2.5, 1.5);
  parts.push(`<ellipse cx="${px}" cy="${py}" rx="${A * 0.62}" ry="${B * 0.62}" fill="url(#padGlow)"/>`);
  parts.push(`<ellipse cx="${px}" cy="${py}" rx="${A * 0.5}" ry="${B * 0.5}" fill="#fff3b0" fill-opacity="0.55" stroke="#ffcf3a" stroke-width="7"/>`);
}
// A bush at the back right, and a few flowers.
{
  const [bx, by] = P(2.45, 0.45);
  parts.push(`<ellipse cx="${bx + 4}" cy="${by + 6}" rx="40" ry="16" fill="#3f7f34" opacity="0.25"/>`);
  for (const [dx, dy, r, c] of [
    [-16, -16, 24, '#4f9e3e'],
    [14, -14, 22, '#4a963a'],
    [0, -32, 22, '#5cb049'],
    [-4, -12, 20, '#58aa46'],
  ] as const)
    parts.push(`<circle cx="${bx + dx}" cy="${by + dy}" r="${r}" fill="${c}"/>`);
  parts.push(`<circle cx="${bx - 6}" cy="${by - 40}" r="9" fill="#7fcd65" opacity="0.8"/>`);
  for (const [fx, fy, c] of [
    [0.4, 2.55, '#ff8fb1'],
    [0.7, 2.75, '#ffffff'],
    [1.6, 2.6, '#ffd447'],
  ] as const) {
    const [x, y] = P(fx, fy);
    parts.push(`<circle cx="${x}" cy="${y}" r="5" fill="${c}"/>`);
  }
}
// The crate's shadow, then the pusher behind it, then the crate.
parts.push(poly('#2f6a2a', [P(1.05, 1.05), P(2.1, 1.05), P(2.15, 2.1), P(1.05, 1.95)], 'opacity="0.28"'));
{
  // The pusher on the back-left tile, leaning into the crate: legs, suit, head, red cap.
  const [x, y] = P(0.55, 1.5);
  parts.push(`<ellipse cx="${x}" cy="${y + 2}" rx="24" ry="10" fill="#2f6a2a" opacity="0.3"/>`);
  parts.push(`<g transform="translate(${x} ${y}) rotate(14)">
    <rect x="-13" y="-22" width="10" height="20" rx="5" fill="#2a5fb8"/><rect x="3" y="-22" width="10" height="20" rx="5" fill="#2a5fb8"/>
    <ellipse cx="-8" cy="-3" rx="9" ry="6" fill="#5a3a22"/><ellipse cx="8" cy="-3" rx="9" ry="6" fill="#5a3a22"/>
    <rect x="-20" y="-58" width="40" height="42" rx="18" fill="#2f6fd0"/>
    <rect x="-20" y="-34" width="40" height="6" fill="#5a3a22"/>
    <circle cx="0" cy="-74" r="22" fill="#f2c9a0"/>
    <path d="M-23 -76 A23 23 0 0 1 23 -76 Z" fill="#e0433a"/>
    <path d="M10 -78 Q32 -78 34 -71 Q22 -70 10 -72 Z" fill="#c43530"/>
    <circle cx="11" cy="-69" r="3.4" fill="#1a1a24"/>
    <rect x="16" y="-52" width="20" height="10" rx="5" fill="#2f6fd0"/><circle cx="36" cy="-47" r="6.5" fill="#f2c9a0"/>
  </g>`);
}
{
  // The crate: one tile, a little in from the edges; beveled faces, planks and a cross brace.
  const [x0, y0, x1, y1, h] = [1.05, 1.05, 1.95, 1.95, 1.0];
  parts.push(box(x0, y0, x1, y1, 0, h, '#ebb873', '#d39a55', '#b77d3f', 'stroke="#7d4f27" stroke-width="7" stroke-linejoin="round"'));
  const line = (a: readonly [number, number], b: readonly [number, number], w = 6, c = '#8c5a2b') => `<path d="M${pts(a)} L${pts(b)}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  // Top: planks.
  for (const t of [0.36, 0.64]) parts.push(line(P(x0 + (x1 - x0) * t, y0, h), P(x0 + (x1 - x0) * t, y1, h), 4, '#c48a4a'));
  // Front faces: a frame and a diagonal brace.
  const i = 0.12;
  parts.push(line(P(x0 + i, y1, i * 1.2), P(x1 - i, y1, h - i * 1.2), 7));
  parts.push(line(P(x1, y0 + i, h - i * 1.2), P(x1, y1 - i, i * 1.2), 7, '#734823'));
  // A highlight along the top front edges.
  parts.push(`<path d="M${pts(P(x0, y1, h))} L${pts(P(x1, y1, h))} L${pts(P(x1, y0, h))}" stroke="#ffd9a0" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8" transform="translate(0 4)"/>`);
}
// Sparkles over the pad.
{
  const [px, py] = P(2.5, 1.5);
  const star = (x: number, y: number, r: number) => `<path d="M${x} ${y - r} Q${x} ${y} ${x + r} ${y} Q${x} ${y} ${x} ${y + r} Q${x} ${y} ${x - r} ${y} Q${x} ${y} ${x} ${y - r} Z" fill="#fff6c8"/>`;
  parts.push(star(px + 34, py - 26, 10), star(px + 10, py - 46, 6));
}

const sky = `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3fa4ea"/><stop offset="0.65" stop-color="#8fd2f4"/><stop offset="1" stop-color="#d6f1fb"/></linearGradient>
  <radialGradient id="sun" cx="0.18" cy="0.12" r="0.55"><stop offset="0" stop-color="#fff8d6" stop-opacity="0.55"/><stop offset="1" stop-color="#fff8d6" stop-opacity="0"/></radialGradient>
  <radialGradient id="padGlow"><stop offset="0" stop-color="#fff2a0" stop-opacity="0.95"/><stop offset="0.7" stop-color="#ffd447" stop-opacity="0.45"/><stop offset="1" stop-color="#ffd447" stop-opacity="0"/></radialGradient>`;
const cloud = (x: number, y: number, s: number) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><ellipse cx="0" cy="10" rx="62" ry="16" fill="#d9ecf7"/><circle cx="-30" cy="0" r="24" fill="#fff"/><circle cx="2" cy="-12" r="32" fill="#fff"/><circle cx="34" cy="2" r="22" fill="#fff"/><rect x="-54" y="0" width="108" height="20" rx="10" fill="#fff"/></g>`;
const background = `<rect width="512" height="512" fill="url(#sky)"/><rect width="512" height="512" fill="url(#sun)"/>${cloud(388, 96, 0.95)}${cloud(108, 150, 0.7)}`;
const art = parts.join('\n  ');

const svg = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${sky}</defs>
  ${background}
  ${inner}
</svg>
`;
writeFileSync('public/icon.svg', svg(art));
// Maskable: launchers cut the icon to a circle or squircle; everything that matters stays in the middle 80%.
writeFileSync('public/icon-maskable.svg', svg(`<g transform="translate(256 272) scale(0.78) translate(-256 -272)">${art}</g>`));
// The browser tab: at 16–32 px a whole island is a smudge, so a close-up of the crate on its tile, in a rounded square.
writeFileSync(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>${sky}<clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath></defs>
  <g clip-path="url(#r)">${background}<g transform="translate(256 262) scale(2.05) translate(-256 -238)">${art}</g></g>
</svg>
`,
);
console.log('wrote public/icon.svg, public/icon-maskable.svg, public/favicon.svg');
