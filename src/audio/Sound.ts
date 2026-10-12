/**
 * Synthesized sound effects (Web Audio, no files). The context starts on the first user
 * gesture (browsers block audio before one); a volume of 0 is silence (the mute switch).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private volume = 0.8;

  constructor() {
    const start = () => {
      if (this.ctx) return;
      try {
        this.ctx = new AudioContext();
        this.out = this.ctx.createGain();
        this.out.gain.value = this.volume;
        this.out.connect(this.ctx.destination);
        const n = this.ctx.sampleRate * 0.5;
        this.noise = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      } catch {
        /* no audio on this device */
      }
    };
    addEventListener('pointerdown', start, { once: true });
    addEventListener('keydown', start, { once: true });
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.out) this.out.gain.value = v;
  }

  /** A short tone sliding from f0 to f1 Hz, starting `delay` seconds from now. */
  private tone(f0: number, f1: number, dur: number, type: OscillatorType = 'sine', gain = 0.3, delay = 0) {
    const c = this.ctx;
    if (!c || !this.out || this.volume === 0) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** Filtered noise: scrapes, thuds, footsteps. */
  private hiss(freq: number, dur: number, gain: number, q = 1, type: BiquadFilterType = 'lowpass') {
    const c = this.ctx;
    if (!c || !this.out || !this.noise || this.volume === 0) return;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }

  click() {
    this.tone(900, 600, 0.05, 'triangle', 0.15);
  }
  step() {
    this.hiss(900 + Math.random() * 300, 0.05, 0.12, 0.8);
  }
  push() {
    this.hiss(380, 0.16, 0.35, 2.5, 'bandpass');
    this.tone(110, 90, 0.12, 'triangle', 0.1);
  }
  climb() {
    this.tone(320, 560, 0.1, 'triangle', 0.12);
  }
  fall() {
    this.tone(200, 60, 0.22, 'sine', 0.35);
    this.hiss(250, 0.18, 0.3);
  }
  lost() {
    this.tone(500, 80, 0.6, 'sine', 0.2);
  }
  bump() {
    this.tone(120, 90, 0.07, 'square', 0.06);
  }
  undo() {
    this.tone(600, 380, 0.07, 'triangle', 0.08);
  }
  goal() {
    this.tone(660, 990, 0.18, 'triangle', 0.18);
    this.tone(990, 1320, 0.22, 'sine', 0.1, 0.06);
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, f, 0.22, 'triangle', 0.2, k * 0.09));
  }
}
