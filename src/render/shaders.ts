import * as THREE from 'three';

/**
 * Small shader touches added to standard materials (onBeforeCompile), all driven by one
 * shared clock: lava that churns, ice with a moving sheen and a bright rim, teleporter
 * cores that swirl.
 */
export const clock = { value: 0 };

const NOISE = `
  float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
  }
`;

/** Adds a world-position varying and the clock, then lets `frag` change the emissive light. */
function patch(m: THREE.MeshStandardMaterial, key: string, frag: string) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clock;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\nvarying vec3 vLocal;\n${NOISE}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${frag}`);
  };
  m.customProgramCacheKey = () => key;
  m.needsUpdate = true;
  return m;
}

/** Lava: bright veins drifting through a darker glow. */
export const lavaShader = (m: THREE.MeshStandardMaterial) =>
  patch(
    m,
    'lava',
    `{
      vec2 q = vWPos.xz * 2.2;
      float n = vnoise(q + vec2(uTime * 0.25, uTime * 0.1)) * 0.6 + vnoise(q * 2.3 - uTime * 0.35) * 0.4;
      float veins = smoothstep(0.45, 0.8, n);
      totalEmissiveRadiance *= 0.45 + 1.3 * veins;
      diffuseColor.rgb *= 0.6 + 0.6 * veins;
    }`,
  );

/** Ice: a soft band of light sweeping across, and a bright rim at grazing angles. */
export const iceShader = (m: THREE.MeshStandardMaterial) =>
  patch(
    m,
    'ice',
    `{
      float band = fract((vWPos.x + vWPos.z) * 0.18 - uTime * 0.12);
      float sheen = smoothstep(0.0, 0.06, band) * (1.0 - smoothstep(0.06, 0.16, band));
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
      totalEmissiveRadiance += vec3(0.75, 0.9, 1.0) * (sheen * 0.35 + rim * 0.25);
    }`,
  );

/** Teleporter cores: arms of light turning around the middle. */
export const swirlShader = (m: THREE.MeshStandardMaterial) =>
  patch(
    m,
    'swirl',
    `{
      float r = length(vLocal.xz);
      float a = atan(vLocal.z, vLocal.x);
      float arms = 0.5 + 0.5 * sin(a * 3.0 - uTime * 4.0 + r * 18.0);
      totalEmissiveRadiance *= 0.55 + 0.9 * arms;
    }`,
  );

let glowTex: THREE.Texture | null = null;
/** A soft round glow (sprites, sparks, laser flares), shared. */
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

let fadeTex: THREE.Texture | null = null;
/** A vertical fade, bright at the bottom (v = 0) to nothing at the top: light columns. Shared. */
export function fadeTexture() {
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 64, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 2, 64);
  fadeTex = new THREE.CanvasTexture(c);
  return fadeTex;
}

/** An additive, unlit glow material (columns, beam halos, sparks): never in the depth buffer. */
export function glowMaterial(color: number, opacity: number, map: THREE.Texture | null = null) {
  return new THREE.MeshBasicMaterial({ color, map, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, toneMapped: false });
}

/**
 * A soft halo around a tube (laser beams): additive, brightest where the surface faces the
 * camera and fading to nothing at its silhouette, so it reads as glow rather than a pipe.
 */
export function haloMaterial(color: number, opacity: number) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    vertexShader: `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        gl_FragColor = vec4(uColor, uOpacity * f * f);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
