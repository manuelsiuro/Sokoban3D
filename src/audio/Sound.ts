/**
 * Synthesized sound effects (Web Audio, no files). The context starts on the first user
 * gesture (browsers block audio before one); a volume of 0 is silence (the mute switch).
 */
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: Music | null = null;
  private musicOn = true;
  private musicVolume = 0.5;
  private theme = 'meadow';
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
        this.music = new Music(this.ctx, this.noise);
        this.music.set(this.musicOn ? this.musicVolume : 0, this.theme);
      } catch {
        /* no audio on this device */
      }
    };
    addEventListener('pointerdown', start, { once: true });
    addEventListener('keydown', start, { once: true });
  }

  /** Background music: on or off, its volume (0..1), and the world whose theme plays. */
  setMusic(on: boolean, volume: number, theme = this.theme) {
    this.musicOn = on;
    this.musicVolume = volume;
    this.theme = theme;
    this.music?.set(on ? volume : 0, theme);
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
  slide() {
    this.hiss(2400, 0.28, 0.12, 0.7, 'highpass');
  }
  teleport() {
    this.tone(300, 1400, 0.25, 'sine', 0.15);
    this.tone(450, 2100, 0.2, 'triangle', 0.08, 0.05);
  }
  fill() {
    this.hiss(180, 0.35, 0.4);
    this.tone(140, 50, 0.3, 'sine', 0.25);
  }
  convey() {
    this.tone(220, 200, 0.08, 'square', 0.05);
  }
  door(open: boolean) {
    this.tone(open ? 260 : 340, open ? 400 : 200, 0.18, 'sawtooth', 0.06);
  }
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, f, 0.22, 'triangle', 0.2, k * 0.09));
  }
}

/**
 * Music made on the fly: per world a scale, a chord loop, a tempo and a timbre; a soft pad,
 * a wandering arpeggio and a bass note. Notes are scheduled a little ahead on the audio
 * clock, so timing stays steady whatever the frame rate.
 */
interface Theme {
  /** MIDI note of the scale's root. */
  root: number;
  scale: number[];
  /** Chords as scale degrees of their roots, one per bar. */
  chords: number[];
  bpm: number;
  arp: OscillatorType;
  pad: OscillatorType;
  /** A ticking hi-hat (clockwork). */
  tick?: boolean;
}

const THEMES: Record<string, Theme> = {
  meadow: { root: 60, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 4, 5, 3], bpm: 84, arp: 'triangle', pad: 'sine' },
  tundra: { root: 57, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 5, 2, 6], bpm: 70, arp: 'sine', pad: 'sine' },
  desert: { root: 62, scale: [0, 1, 4, 5, 7, 8, 10], chords: [0, 1, 0, 6], bpm: 80, arp: 'sawtooth', pad: 'triangle' },
  sky: { root: 65, scale: [0, 2, 4, 6, 7, 9, 11], chords: [0, 1, 0, 4], bpm: 68, arp: 'sine', pad: 'triangle' },
  forge: { root: 52, scale: [0, 2, 3, 5, 7, 8, 10], chords: [0, 3, 0, 4], bpm: 96, arp: 'square', pad: 'sawtooth' },
  crystal: { root: 59, scale: [0, 3, 5, 7, 10], chords: [0, 2, 3, 1], bpm: 66, arp: 'sine', pad: 'sine' },
  clockwork: { root: 55, scale: [0, 2, 4, 5, 7, 9, 11], chords: [0, 3, 4, 0], bpm: 100, arp: 'triangle', pad: 'triangle', tick: true },
};

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

class Music {
  private out: GainNode;
  private theme: Theme = THEMES.meadow;
  private beat = 0;
  private nextAt = 0;
  private timer = 0;
  private step = 3;

  constructor(
    private ctx: AudioContext,
    private noise: AudioBuffer,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(ctx.destination);
  }

  set(volume: number, theme: string) {
    this.theme = THEMES[theme] ?? THEMES.meadow;
    this.out.gain.setTargetAtTime(volume * 0.22, this.ctx.currentTime, 0.4);
    if (volume > 0 && !this.timer) {
      this.nextAt = this.ctx.currentTime + 0.1;
      this.timer = window.setInterval(() => this.schedule(), 100);
    } else if (volume === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = 0;
    }
  }

  /** The note of a scale degree (any integer; wraps into octaves). */
  private degree(d: number) {
    const s = this.theme.scale;
    const o = Math.floor(d / s.length);
    return this.theme.root + s[((d % s.length) + s.length) % s.length] + 12 * o;
  }

  private note(midi: number, at: number, dur: number, type: OscillatorType, gain: number, attack = 0.01) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = hz(midi);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.out);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  private schedule() {
    const t = this.theme;
    const beatLen = 60 / t.bpm / 2; // eighth notes
    while (this.nextAt < this.ctx.currentTime + 0.3) {
      const at = this.nextAt;
      const bar = Math.floor(this.beat / 8);
      const chord = t.chords[bar % t.chords.length];
      const pos = this.beat % 8;
      if (pos === 0) {
        // A pad: the chord's three notes, held for the bar.
        for (const k of [0, 2, 4]) this.note(this.degree(chord + k), at, beatLen * 8.5, t.pad, 0.05, 0.6);
        this.note(this.degree(chord) - 24, at, beatLen * 3, 'sine', 0.16, 0.02);
      }
      if (pos === 4) this.note(this.degree(chord) - 24, at, beatLen * 3, 'sine', 0.12, 0.02);
      // The arpeggio wanders over the chord, sometimes resting.
      if (Math.random() < 0.72) {
        this.step = Math.max(0, Math.min(6, this.step + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]));
        this.note(this.degree(chord + [0, 2, 4, 7, 9, 11, 14][this.step]) + 12, at, beatLen * 1.6, t.arp, t.arp === 'square' || t.arp === 'sawtooth' ? 0.025 : 0.06);
      }
      if (t.tick) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noise;
        const f = this.ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(pos % 2 ? 0.03 : 0.06, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
        src.connect(f).connect(g).connect(this.out);
        src.start(at, Math.random() * 0.3);
        src.stop(at + 0.05);
      }
      this.beat++;
      this.nextAt += beatLen;
    }
  }
}
