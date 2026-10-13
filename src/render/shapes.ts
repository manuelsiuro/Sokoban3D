import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry helpers for the models: clouds, rough rock, crystals, gears, and a baker that
 * merges a static group into one mesh per material (a level has hundreds of small parts).
 */

type R = () => number;

/** Positions and normals only, non-indexed: every helper returns this, so all of them merge. */
export function plain(geo: THREE.BufferGeometry) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'color') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * Pushes each corner of a shape a little in and out (corners shared by faces move
 * together, so nothing cracks). Faceted: the result has flat normals.
 */
export function roughen(geo: THREE.BufferGeometry, amount: number, r: R, keepBottom = false) {
  const g = geo.clone();
  for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
  const m = mergeVertices(g, 1e-4);
  const p = m.attributes.position;
  let minY = Infinity;
  for (let k = 0; k < p.count; k++) minY = Math.min(minY, p.getY(k));
  for (let k = 0; k < p.count; k++) {
    if (keepBottom && p.getY(k) <= minY + 1e-4) {
      p.setXYZ(k, p.getX(k) + (r() - 0.5) * amount, p.getY(k), p.getZ(k) + (r() - 0.5) * amount);
      continue;
    }
    p.setXYZ(k, p.getX(k) + (r() - 0.5) * amount, p.getY(k) + (r() - 0.5) * amount, p.getZ(k) + (r() - 0.5) * amount);
  }
  const out = m.toNonIndexed();
  out.computeVertexNormals();
  return out;
}

/**
 * A cumulus cloud: a flat-bottomed base of wide puffs with bigger ones heaped in the middle.
 * The normals lean toward the whole cloud's outline, so it shades as one soft volume with
 * bumps rather than a cluster of balls, and the creases where puffs meet are darker
 * (vertex colors, from a white top to a tinted belly).
 */
export function cloudGeometry(r: R, opts: { length?: number; height?: number; depth?: number; puffs?: number; top?: number; belly?: number } = {}) {
  const len = opts.length ?? 2;
  const height = opts.height ?? 0.9;
  const depth = opts.depth ?? 1;
  const n = Math.max(2, opts.puffs ?? 5);
  const puffs: { x: number; y: number; z: number; rad: number }[] = [];
  // The base: puffs along the length, close enough to overlap well, staggered front and back.
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1);
    const rad = height * (0.42 + Math.sin(t * Math.PI) * 0.22) * (0.85 + r() * 0.3);
    puffs.push({ x: (t - 0.5) * len * 0.82, y: rad * 0.2, z: (k % 2 ? 1 : -1) * depth * (0.12 + r() * 0.12), rad });
  }
  // The heap: one to three big puffs on top, toward the middle.
  const heap = n >= 4 ? 2 + (r() < 0.5 ? 1 : 0) : 1;
  for (let k = 0; k < heap; k++) {
    const rad = height * (0.5 + r() * 0.18);
    puffs.push({ x: (r() - 0.5) * len * 0.42, y: height * (0.38 + r() * 0.14), z: (r() - 0.5) * depth * 0.3, rad });
  }
  // Small puffs on the sides, so the outline isn't a row of beads.
  for (let k = 0; k < Math.max(1, n - 2); k++) {
    const rad = height * (0.26 + r() * 0.12);
    puffs.push({ x: (r() - 0.5) * len * 0.8, y: rad * 0.15, z: (r() < 0.5 ? -1 : 1) * depth * (0.32 + r() * 0.1), rad });
  }
  const parts = puffs.map((q) => {
    const s = new THREE.IcosahedronGeometry(q.rad, 2);
    // Puffs a little wider than tall.
    s.scale(1.12, 0.9, 1.05);
    s.translate(q.x, q.y, q.z);
    return plain(s);
  });
  const geo = mergeGeometries(parts);
  for (const s of parts) s.dispose();
  const p = geo.attributes.position;
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  const top = new THREE.Color(opts.top ?? 0xffffff);
  const belly = new THREE.Color(opts.belly ?? 0xc9d3e8);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const blob = new THREE.Vector3();
  let maxY = 0;
  for (let k = 0; k < p.count; k++) maxY = Math.max(maxY, p.getY(k));
  // The whole cloud's half sizes, for the outline normal.
  const hx = len * 0.55;
  const hy = maxY * 0.9;
  const hz = depth * 0.6;
  for (let k = 0; k < p.count; k++) {
    let y = p.getY(k);
    const flat = y < 0;
    if (flat) {
      // A flat belly: everything below the base is squashed onto it.
      y *= 0.08;
      p.setY(k, y);
    }
    v.set(p.getX(k), y, p.getZ(k));
    if (flat) nrm.setXYZ(k, nrm.getX(k) * 0.25, -1, nrm.getZ(k) * 0.25);
    else {
      blob.set(v.x / (hx * hx), Math.max(0, v.y) / (hy * hy), v.z / (hz * hz)).normalize();
      blob.lerp(new THREE.Vector3(nrm.getX(k), nrm.getY(k), nrm.getZ(k)), 0.45).normalize();
      nrm.setXYZ(k, blob.x, blob.y, blob.z);
    }
    // Creases: a point inside other puffs (near where they meet) is in their shade.
    let crease = 0;
    for (const q of puffs) {
      const d = Math.hypot((v.x - q.x) / 1.12, (v.y - q.y) / 0.9, (v.z - q.z) / 1.05) / q.rad;
      if (d < 0.995) crease += 1 - d;
    }
    const t = Math.min(1, Math.max(0, y / (maxY * 0.8)));
    c.copy(belly).lerp(top, Math.sqrt(t)).multiplyScalar(1 - Math.min(0.22, crease * 1.6));
    colors.set([c.r, c.g, c.b], k * 3);
  }
  nrm.needsUpdate = true;
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** A crystal: a six-sided prism with a pointed tip (and a shorter point below the ground). */
export function crystalGeometry(radius: number, height: number) {
  const pts = [new THREE.Vector2(0, -radius), new THREE.Vector2(radius, 0), new THREE.Vector2(radius * 0.92, height * 0.72), new THREE.Vector2(0, height)];
  return plain(new THREE.LatheGeometry(pts, 6));
}

/** A gear: a toothed disc with a hole, lying flat (axis along y), centered on its thickness. */
export function gearGeometry(radius: number, thickness: number, teeth = 10, hole = 0.3) {
  const shape = new THREE.Shape();
  const inner = radius * 0.8;
  const steps = teeth * 4;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    // Tooth profile: up, top, down, bottom.
    const rr = k % 4 === 1 || k % 4 === 2 ? radius : inner;
    if (k === 0) shape.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else shape.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  const h = new THREE.Path();
  h.absarc(0, 0, radius * hole, 0, Math.PI * 2, true);
  shape.holes.push(h);
  // Spokes: three windows between the hub and the rim.
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.15, bevelSize: thickness * 0.15, bevelSegments: 1, curveSegments: 12 });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return plain(geo);
}

/** A tapered rock spike pointing down (the underside of an island), its top at y = 0. */
export function spikeGeometry(r: R, radius: number, depth: number) {
  const cone = new THREE.ConeGeometry(radius, depth, 6, 3);
  cone.rotateX(Math.PI);
  cone.rotateY(r() * Math.PI);
  cone.translate((r() - 0.5) * 0.15, -depth / 2, (r() - 0.5) * 0.15);
  return roughen(cone, radius * 0.28, r);
}

/**
 * Merges the meshes of a static group into one mesh per material (fewer draw calls).
 * Meshes marked `userData.live` (animated) are kept as they are.
 */
export function bake(group: THREE.Object3D): THREE.Group {
  group.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const out = new THREE.Group();
  const live: THREE.Object3D[] = [];
  group.traverse((o) => {
    if (o.userData.live) {
      live.push(o);
      return;
    }
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    for (let p = o.parent; p; p = p.parent) if (p.userData.live) return;
    const g = plain(o.geometry.clone()).applyMatrix4(o.matrixWorld);
    let entry = byMat.get(o.material);
    if (!entry) byMat.set(o.material, (entry = { geos: [], cast: false }));
    entry.geos.push(g);
    entry.cast ||= o.castShadow;
  });
  for (const [m, { geos, cast }] of byMat) {
    // Vertex colors must be on all or none.
    const colored = geos.some((g) => g.attributes.color);
    const same = colored ? geos.map((g) => (g.attributes.color ? g : withColor(g))) : geos;
    const mesh = new THREE.Mesh(mergeGeometries(same), m);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    out.add(mesh);
    for (const g of geos) g.dispose();
  }
  for (const o of live) {
    o.updateMatrixWorld(true);
    const keep = o.clone();
    o.matrixWorld.decompose(keep.position, keep.quaternion, keep.scale);
    out.add(keep);
  }
  return out;
}

function withColor(g: THREE.BufferGeometry) {
  const c = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}
