import * as THREE from 'three';

const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** A vertical gradient for the sky (drawn behind everything). Repaints `texture` when given. */
export function skyTexture(top: number, bottom: number, canvas = document.createElement('canvas'), texture?: THREE.CanvasTexture) {
  canvas.width = 2;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex(top));
  g.addColorStop(1, hex(bottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 256);
  const t = texture ?? new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
