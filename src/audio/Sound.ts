/**
 * Synthesized sound effects (Web Audio, no files). The context starts on the first user
 * gesture (browsers block audio before one); a volume of 0 is silence (the mute switch).
 *
 * Mixing: effects and music meet in a compressor; both send to a reverb whose room fits
 * the world (a small meadow, a vast cave); the music ducks under wins and stingers.
 */

/** Reverb per world: length of the tail (s) and how much of it is heard. */
const ROOMS: Record<string, { size: number; wet: number }> = {
  meadow: { size: 0.8, wet: 0.12 },
  tundra: { size: 1.6, wet: 0.2 },
  desert: { size: 1.0, wet: 0.12 },
  sky: { size: 2.2, wet: 0.24 },
  forge: { size: 1.2, wet: 0.2 },
  crystal: { size: 3.0, wet: 0.34 },
  clockwork: { size: 1.4, wet: 0.2 },
  reverse: { size: 1.1, wet: 0.16 },
};
export class Sound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private music: Music | null = null;
  private musicOn = true;
  private musicVolume = 0.5;
  private theme = 'meadow';
  private noise: AudioBuffer | null = null;
  private volume = 0.8;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private room = '';

  constructor() {
    const start = () => {
      if (this.ctx) return;
      try {
        const c = (this.ctx = new AudioContext());
        // effects → out ─┬→ compressor → speakers
        //                └→ reverb send ┘ (music joins both too)
        const master = c.createDynamicsCompressor();
        master.threshold.value = -16;
        master.ratio.value = 4;
        master.connect(c.destination);
        this.reverb = c.createConvolver();
        this.wet = c.createGain();
        this.reverb.connect(this.wet).connect(master);
        this.out = c.createGain();
        this.out.gain.value = this.volume;
        this.out.connect(master);
        this.out.connect(this.reverb);
        const n = c.sampleRate * 0.5;
        this.noise = c.createBuffer(1, n, c.sampleRate);
        const d = this.noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        this.music = new Music(c, this.noise, master, this.reverb);
        this.music.set(this.musicOn ? this.musicVolume : 0, this.theme);
        this.setRoom(this.theme);
      } catch {
        /* no audio on this device */
      }
    };
    // Phones may leave the context suspended (or interrupt it after a call): every gesture
    // wakes it. A hidden page goes quiet, and the music doesn't pile up notes meanwhile.
    const wake = () => {
      start();
      if (this.ctx && this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
    };
    for (const e of ['pointerdown', 'pointerup', 'keydown', 'touchend']) addEventListener(e, wake);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else wake();
    });
  }

  /** Background music: on or off, its volume (0..1), and the world whose theme plays. */
  setMusic(on: boolean, volume: number, theme = this.theme) {
    this.musicOn = on;
    this.musicVolume = volume;
    this.theme = theme;
    this.music?.set(on ? volume : 0, theme);
    this.setRoom(theme);
  }

  /** The reverb of a world's space: a decaying burst of noise as its impulse response. */
  private setRoom(world: string) {
    const c = this.ctx;
    if (!c || !this.reverb || !this.wet || this.room === world) return;
    this.room = world;
    const { size, wet } = ROOMS[world] ?? ROOMS.meadow;
    const len = Math.floor(c.sampleRate * size);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    this.reverb.buffer = ir;
    this.wet.gain.setTargetAtTime(wet, c.currentTime, 0.2);
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
    // Looped, so a long hiss from a random point never runs off the buffer's end.
    src.loop = true;
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
    this.music?.duck(2.2);
    [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, f, 0.22, 'triangle', 0.2, k * 0.09));
    this.tone(1568, 1568, 0.6, 'sine', 0.08, 0.5);
  }
  /** The k-th star landing on the summary (0..2): each one higher. */
  star(k: number) {
    const f = [784, 988, 1319][k] ?? 784;
    this.tone(f, f * 1.5, 0.14, 'triangle', 0.16);
    this.tone(f * 2, f * 2, 0.3, 'sine', 0.05, 0.05);
  }
  /** A laser reaching its receiver. */
  lit() {
    this.tone(1200, 1800, 0.2, 'sine', 0.12);
    this.tone(2400, 2400, 0.35, 'sine', 0.04, 0.08);
  }
  /** Clock gates flipping up or down. */
  gate() {
    this.tone(180, 140, 0.12, 'square', 0.05);
    this.hiss(3000, 0.05, 0.1, 2, 'bandpass');
  }
  /** A crate sinking into lava: a hiss and a deep glug. */
  lava() {
    this.hiss(1400, 0.6, 0.25, 0.6, 'highpass');
    this.tone(120, 40, 0.45, 'sine', 0.3);
  }
  /** A pointer over a menu button. */
  hover() {
    this.tone(1400, 1500, 0.025, 'sine', 0.025);
  }
  /** A fanfare: a world cleared or a trophy earned. */
  stinger(kind: 'world' | 'trophy') {
    this.music?.duck(kind === 'world' ? 2.8 : 1.6);
    const notes = kind === 'world' ? [523, 659, 784, 1047, 784, 1047, 1319, 1568] : [880, 1109, 1319, 1760];
    notes.forEach((f, k) => this.tone(f, f, 0.26, k % 2 ? 'sine' : 'triangle', 0.14, 0.15 + k * 0.1));
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

  /** Dips under wins and stingers. */
  private ducker: GainNode;

  constructor(
    private ctx: AudioContext,
    private noise: AudioBuffer,
    master: AudioNode,
    reverb: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.ducker = ctx.createGain();
    this.out.connect(this.ducker);
    this.ducker.connect(master);
    this.ducker.connect(reverb);
  }

  /** Lowers the music for a while (seconds), then brings it back. */
  duck(seconds: number) {
    const g = this.ducker.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(0.25, t, 0.05);
    g.setTargetAtTime(1, t + seconds, 0.5);
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
    // Back after a pause (a throttled timer): carry on from now, not with every missed note.
    if (this.nextAt < this.ctx.currentTime) this.nextAt = this.ctx.currentTime + 0.05;
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
