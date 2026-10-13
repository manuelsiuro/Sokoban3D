import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * The finish on the level view, in quality tiers:
 * high: soft contact shadows (GTAO) and bloom; medium: bloom; low: a plain render.
 * "auto" starts high on desktops and medium on touch screens, and steps down while the
 * frame rate stays low (never up again in a session).
 */
export type Quality = 'auto' | 'high' | 'medium' | 'low';
type Tier = Exclude<Quality, 'auto'>;
const ORDER: Tier[] = ['high', 'medium', 'low'];

export class Post {
  private composer: EffectComposer;
  private gtao: GTAOPass;
  private bloom: UnrealBloomPass;
  private tier: Tier = 'high';
  private auto = true;
  /** Frame-time samples for the auto tier. */
  private samples: number[] = [];
  private last = 0;
  /** Called when the tier changes (shadow map size, pixel ratio). */
  onTier: (t: Tier) => void = () => {};

  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.gtao = new GTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.75;
    this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.5, thickness: 1, scale: 1 });
    // The AO pass draws the scene again for depth and normals: leave out see-through things
    // (particles, the ghost, the x-ray shell) as it already does points and lines.
    const ao = this.gtao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    ao._overrideVisibility = () => {
      scene.traverse((o) => {
        const see = o instanceof THREE.Mesh && !Array.isArray(o.material) && o.material.transparent;
        if (o.visible && (see || o instanceof THREE.Points || o instanceof THREE.Line)) {
          o.visible = false;
          ao._visibilityCache.push(o);
        }
      });
    };
    this.composer.addPass(this.gtao);
    // Only things brighter than lit white bloom: lava, crystals, lasers, lamps, glowing pads.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.4, 1.3);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  /** Sets the quality (auto picks and adapts the tier). */
  setQuality(q: Quality, touch: boolean) {
    this.auto = q === 'auto';
    this.samples = [];
    this.apply(q === 'auto' ? (touch ? 'medium' : 'high') : q);
  }

  get current() {
    return this.tier;
  }

  private apply(t: Tier) {
    this.tier = t;
    this.gtao.enabled = t === 'high';
    this.bloom.enabled = t !== 'low';
    this.onTier(t);
    this.resize();
  }

  resize() {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
  }

  render(scene: THREE.Scene, camera: THREE.Camera, now: number) {
    if (this.auto) this.watch(now);
    if (this.tier === 'low') this.renderer.render(scene, camera);
    else this.composer.render();
  }

  /** Steps down a tier when frames average over ~22 ms (under 45 fps) for two seconds. */
  private watch(now: number) {
    const dt = now - this.last;
    this.last = now;
    // Skip pauses (a hidden tab, a level being built).
    if (dt <= 0 || dt > 0.25) return;
    this.samples.push(dt);
    if (this.samples.length < 120) return;
    const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    this.samples = [];
    const k = ORDER.indexOf(this.tier);
    if (avg > 0.022 && k < ORDER.length - 1) this.apply(ORDER[k + 1]);
  }
}
