/**
 * Sound: relaxing generative music and the sound effects, all synthesised with the Web Audio API (no audio files). The audio
 * context may only start after a user gesture, so everything is silent until `unlock()` (called on the first click or key press).
 * Every call is safe without Web Audio (tests, old browsers): it simply does nothing.
 */

export type SoundName =
  | 'click' | 'tick' | 'deny' | 'place' | 'remove' | 'sugar' | 'lure' | 'repel' | 'found' | 'garden' | 'research' | 'select' | 'send'
  | 'deliver' | 'hatch' | 'fight' | 'redkill' | 'spray' | 'queen' | 'warning' | 'raid' | 'season' | 'extinct';

const KEY = 'ant-colony-sound';
/** Minimum seconds between two plays of the same effect (a big colony would otherwise make a roar). */
const GAP: Partial<Record<SoundName, number>> = { deliver: 0.14, hatch: 0.25, fight: 0.22, redkill: 0.25, spray: 0.2, tick: 0.05, click: 0.04 };

type Ctx = AudioContext;

interface Settings {
  music: boolean;
  sfx: boolean;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const o = JSON.parse(raw) as Partial<Settings>;
      return { music: o.music !== false, sfx: o.sfx !== false };
    }
  } catch {
    /* ignore */
  }
  return { music: true, sfx: true };
}

/** Frequency of a MIDI note. */
const hz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Slow chords (MIDI notes) of the music, in C major pentatonic colours, and the notes the soft bells pick from. */
const CHORDS: readonly (readonly number[])[] = [
  [48, 55, 59, 64],
  [45, 52, 59, 64],
  [41, 48, 57, 64],
  [43, 50, 59, 62],
];
const BELLS = [72, 74, 76, 79, 81, 84];

export class Sound {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private delay: DelayNode | null = null;
  private rainGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private settings: Settings = loadSettings();
  private last = new Map<SoundName, number>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextChord = 0;
  private nextBell = 0;
  private chordIx = 0;
  private raining = false;
  private seed = 12345;

  get musicOn(): boolean {
    return this.settings.music;
  }
  get sfxOn(): boolean {
    return this.settings.sfx;
  }

  /** Deterministic little random generator, so the music does not depend on Math.random in tests. */
  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  /** Starts the audio after the first user gesture; harmless to call again. */
  unlock(): void {
    try {
      if (this.ctx) {
        void this.ctx.resume();
        return;
      }
      const AC = (typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined) as
        | typeof AudioContext
        | undefined;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(ctx.destination);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.settings.music ? 0.32 : 0;
      this.sfxGain = ctx.createGain();
      this.sfxGain.gain.value = this.settings.sfx ? 0.6 : 0;
      // a soft echo gives the music some space
      this.delay = ctx.createDelay(1.5);
      this.delay.delayTime.value = 0.47;
      const fb = ctx.createGain();
      fb.gain.value = 0.38;
      const wet = ctx.createGain();
      wet.gain.value = 0.5;
      const damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      damp.frequency.value = 1800;
      this.delay.connect(damp);
      damp.connect(fb);
      fb.connect(this.delay);
      damp.connect(wet);
      wet.connect(this.musicGain);
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      // rain: a loop of filtered noise, silent until it rains
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = this.rnd() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      this.rainGain = ctx.createGain();
      this.rainGain.gain.value = 0;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(this.rainGain);
      this.rainGain.connect(this.sfxGain);
      src.start();
      this.nextChord = ctx.currentTime + 0.3;
      this.nextBell = ctx.currentTime + 3;
      this.timer = setInterval(() => this.schedule(), 600);
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.visibilityState === 'hidden') void this.ctx.suspend();
        else void this.ctx.resume();
      });
    } catch {
      /* no audio: stay silent */
    }
  }

  private save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.settings));
    } catch {
      /* best effort */
    }
  }

  setMusic(on: boolean): void {
    this.settings.music = on;
    this.save();
    if (this.ctx && this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.32 : 0, this.ctx.currentTime, 0.4);
  }

  setSfx(on: boolean): void {
    this.settings.sfx = on;
    this.save();
    if (this.ctx && this.sfxGain) this.sfxGain.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.1);
  }

  /** The rain loop fades in and out with the weather. */
  setRain(on: boolean): void {
    if (on === this.raining) return;
    this.raining = on;
    if (this.ctx && this.rainGain) this.rainGain.gain.setTargetAtTime(on ? 0.1 : 0, this.ctx.currentTime, 1.2);
  }

  // ---- music ------------------------------------------------------------------------------------------------------------

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.music || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    // a new chord every ~9 s, notes that swell for 3 s and fade for 5 s
    while (this.nextChord < now + 2) {
      const notes = CHORDS[this.chordIx % CHORDS.length];
      this.chordIx++;
      for (const m of notes) this.pad(hz(m), this.nextChord, 9);
      this.nextChord += 8.5;
    }
    // a soft bell now and then
    while (this.nextBell < now + 2) {
      if (this.rnd() < 0.8) this.bell(hz(BELLS[Math.floor(this.rnd() * BELLS.length)]), this.nextBell);
      this.nextBell += 2.2 + this.rnd() * 3.5;
    }
  }

  private pad(f: number, at: number, dur: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.05, at + 3);
    g.gain.linearRampToValueAtTime(0, at + dur + 2);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    lp.connect(g);
    g.connect(this.musicGain);
    for (const [type, detune] of [['sine', -4], ['triangle', 5]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(lp);
      o.start(at);
      o.stop(at + dur + 2.2);
    }
  }

  private bell(f: number, at: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || !this.delay) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(0.07, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, at + 3.2);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g);
    g.connect(this.musicGain);
    g.connect(this.delay);
    o.start(at);
    o.stop(at + 3.3);
  }

  // ---- effects ----------------------------------------------------------------------------------------------------------

  private tone(f: number, dur: number, type: OscillatorType, gain: number, at = 0, slideTo?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slideTo !== undefined) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur / 3));
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g);
    g.connect(this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', at = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || !this.noiseBuf) return;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.sfxGain);
    s.start(t, this.rnd() * 1.5);
    s.stop(t + dur + 0.02);
  }

  /** Plays an effect (rate-limited per name; does nothing before unlock() or with effects switched off). */
  play(name: SoundName): void {
    const ctx = this.ctx;
    if (!ctx || !this.settings.sfx || ctx.state !== 'running') return;
    const gap = GAP[name];
    if (gap !== undefined) {
      const last = this.last.get(name) ?? -1;
      if (ctx.currentTime - last < gap) return;
      this.last.set(name, ctx.currentTime);
    }
    try {
      const j = 0.92 + this.rnd() * 0.16; // a little pitch variation so repeats do not sound mechanical
      switch (name) {
        case 'click': this.tone(660 * j, 0.05, 'square', 0.035); break;
        case 'tick': this.tone(520 * j, 0.03, 'sine', 0.05); break;
        case 'deny': this.tone(180, 0.16, 'square', 0.04, 0, 120); break;
        case 'place': this.tone(300 * j, 0.14, 'sine', 0.12, 0, 520); this.noise(0.05, 1800, 1, 0.04); break;
        case 'remove': this.tone(420 * j, 0.14, 'triangle', 0.1, 0, 200); break;
        case 'sugar': [1318, 1568, 1976, 2349].forEach((f, i) => this.tone(f * j, 0.18, 'sine', 0.05, i * 0.05)); break;
        case 'lure': this.tone(560 * j, 0.22, 'sine', 0.1, 0, 820); break;
        case 'repel': this.tone(320, 0.18, 'square', 0.04, 0, 190); break;
        case 'found': [262, 330, 392, 523].forEach((f, i) => this.tone(f, 0.7, 'sine', 0.09, i * 0.07)); break;
        case 'garden': this.tone(200, 0.3, 'triangle', 0.12, 0, 330); this.tone(330, 0.25, 'sine', 0.06, 0.1, 440); break;
        case 'research': [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.28, 'triangle', 0.09, i * 0.08)); break;
        case 'select': this.tone(740 * j, 0.07, 'sine', 0.08, 0, 880); break;
        case 'send': this.tone(520 * j, 0.1, 'sine', 0.08, 0, 640); break;
        case 'deliver': this.tone(900 * j, 0.08, 'sine', 0.035); break;
        case 'hatch': this.tone(480 * j, 0.16, 'sine', 0.05, 0, 900); break;
        case 'fight': this.noise(0.1, 320, 1.5, 0.09); this.tone(130 * j, 0.12, 'triangle', 0.08, 0, 90); break;
        case 'redkill': this.tone(220 * j, 0.22, 'sawtooth', 0.05, 0, 70); break;
        case 'spray': this.noise(0.4, 3200, 0.8, 0.09, 'highpass'); break;
        case 'queen': this.tone(784, 1.2, 'sine', 0.1); this.tone(1175, 1.4, 'sine', 0.06, 0.1); break;
        case 'warning': this.tone(150, 0.55, 'sawtooth', 0.06, 0, 140); this.tone(150, 0.55, 'sawtooth', 0.06, 0.7, 140); break;
        case 'raid': [0, 0.35, 0.7].forEach((a) => this.tone(110, 0.3, 'sawtooth', 0.07, a, 80)); break;
        case 'season': this.tone(523, 1, 'sine', 0.07); this.tone(659, 1.1, 'sine', 0.06, 0.12); break;
        case 'extinct': this.tone(420, 1.4, 'sine', 0.1, 0, 90); break;
      }
    } catch {
      /* a failed effect is not worth a crash */
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** The one sound system of the game. */
export const sound = new Sound();

/** Starts the sound on the first click or key press anywhere (also on the very first screen, before the game exists). */
export function installSoundUnlock(): void {
  const unlock = (): void => {
    sound.unlock();
    document.removeEventListener('pointerdown', unlock, true);
    document.removeEventListener('keydown', unlock, true);
  };
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('keydown', unlock, true);
}
