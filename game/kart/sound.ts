// PINK KART SOUND
//
// - MUSIC: your beats from public/music (which beat plays where is set in MUSIC in kart.ts). The volume follows the
//   music volume you set on the main page (the iPod slider), so the whole site sounds the same.
// - SOUND EFFECTS: made in code, no sound files to download: engine hum, boost whoosh, jump, falling, rings, hits,
//   bombs, item pickups, countdown beeps, the finish.
// - SOUND ON / OFF: the M key or the row in the pause menu. Remembered on this device.
//
// Browsers only allow sound after the first tap or key press, so nothing plays before that (unlock()).

export type Sfx =
  | "beep"
  | "go"
  | "boost"
  | "jump"
  | "fall"
  | "ring"
  | "hit"
  | "boom"
  | "pick"
  | "use"
  | "wave"
  | "lap"
  | "finish"
  | "muted"
  | "stall";

// how loud the effects are next to the music (0 - 1)
const SFX_VOLUME = 0.55;
// how loud the music is (on top of the main page's volume)
const MUSIC_VOLUME = 0.75;

export class KartSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private engineNodes: { a: OscillatorNode; b: OscillatorNode; f: BiquadFilterNode; g: GainNode } | null = null;
  private music: HTMLAudioElement | null = null;
  private musicSrc = "";
  private wantMusic = "";
  private duck = 1;
  private pageVolume = 0.5;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem("pinkmane-kart-sound") === "off";
      const v = localStorage.getItem("pinkmane-volume");
      if (v !== null && !Number.isNaN(Number(v))) this.pageVolume = Math.max(0, Math.min(1, Number(v)));
    } catch {}
  }

  /** the first tap / key press: now the browser lets us make sound */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.out = this.ctx.createGain();
        this.out.gain.value = this.muted ? 0 : SFX_VOLUME;
        this.out.connect(this.ctx.destination);
        // one second of white noise, reused for whooshes and bangs
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === "suspended") void this.ctx.resume();
      if (this.wantMusic && (!this.music || this.music.paused)) this.setMusic(this.wantMusic, true);
    } catch {}
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem("pinkmane-kart-sound", this.muted ? "off" : "on");
    } catch {}
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : SFX_VOLUME, this.ctx.currentTime, 0.02);
    this.applyMusicVolume();
    return this.muted;
  }

  // ---------------------------------------------------------------- music
  /** which beat plays (or "" for none). The same beat keeps playing if it's already on. */
  /** where the song is right now, in seconds (-1 when no song is playing): 808 TEMPLE's speakers bounce on its beat */
  musicTime() {
    return this.music && !this.music.paused ? this.music.currentTime : -1;
  }

  setMusic(src: string, force = false) {
    this.wantMusic = src;
    if (!src) {
      this.music?.pause();
      return;
    }
    try {
      if (!this.music) {
        this.music = new Audio();
        this.music.loop = true;
        this.music.preload = "auto";
      }
      if (this.musicSrc !== src) {
        this.musicSrc = src;
        this.music.src = src;
        force = true;
      }
      this.applyMusicVolume();
      if (force || this.music.paused) void this.music.play().catch(() => {});
    } catch {}
  }

  /** another tab / the phone's home screen: music stops, and starts again when you come back */
  setHidden(hidden: boolean) {
    try {
      if (hidden) {
        this.music?.pause();
        if (this.out && this.ctx) this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      } else {
        if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : SFX_VOLUME, this.ctx.currentTime, 0.02);
        if (this.wantMusic && this.ctx) void this.music?.play().catch(() => {});
      }
    } catch {}
  }

  /** the pause menu: music goes quiet, the engine stops */
  setDuck(on: boolean) {
    this.duck = on ? 0.35 : 1;
    this.applyMusicVolume();
  }

  private applyMusicVolume() {
    if (this.music) this.music.volume = this.muted ? 0 : Math.max(0, Math.min(1, this.pageVolume * MUSIC_VOLUME * this.duck));
  }

  // ---------------------------------------------------------------- engine
  /** called every frame: on = your kart is racing. speed 0 - 1 (1 = top speed), boost = boosting */
  engine(on: boolean, speed: number, boost: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.out) return;
    try {
      if (!this.engineNodes) {
        const a = ctx.createOscillator();
        const b = ctx.createOscillator();
        const f = ctx.createBiquadFilter();
        const g = ctx.createGain();
        a.type = "sawtooth";
        b.type = "square";
        f.type = "lowpass";
        f.Q.value = 3;
        g.gain.value = 0;
        a.connect(f);
        b.connect(f);
        f.connect(g);
        g.connect(this.out);
        a.start();
        b.start();
        this.engineNodes = { a, b, f, g };
      }
      const n = this.engineNodes;
      const t = ctx.currentTime;
      const s = Math.max(0, Math.min(1.4, speed));
      const pitch = 42 + s * 95 + (boost ? 28 : 0);
      n.a.frequency.setTargetAtTime(pitch, t, 0.05);
      n.b.frequency.setTargetAtTime(pitch * 0.5 + 1.5, t, 0.05);
      n.f.frequency.setTargetAtTime(380 + s * 900 + (boost ? 600 : 0), t, 0.05);
      n.g.gain.setTargetAtTime(on ? 0.05 + s * 0.07 : 0, t, on ? 0.06 : 0.03);
    } catch {}
  }

  // ---------------------------------------------------------------- effects
  play(name: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.out || this.muted) return;
    try {
      switch (name) {
        case "beep":
          this.tone(440, 440, 0.13, "square", 0.22);
          break;
        case "go":
          this.tone(880, 880, 0.4, "square", 0.26);
          this.tone(1320, 1320, 0.4, "triangle", 0.12);
          break;
        case "boost":
          this.noise(0.5, 500, 3200, 0.35, "bandpass");
          this.tone(180, 520, 0.35, "sawtooth", 0.08);
          break;
        case "jump":
          this.tone(260, 760, 0.2, "square", 0.16);
          break;
        case "fall":
          this.tone(820, 70, 1.3, "sawtooth", 0.14);
          this.noise(1.2, 1800, 200, 0.12, "lowpass");
          break;
        case "ring":
          this.tone(1320, 1320, 0.16, "sine", 0.2);
          this.tone(1980, 1980, 0.28, "sine", 0.14, 0.07);
          break;
        case "hit":
          this.noise(0.28, 900, 120, 0.45, "lowpass");
          this.tone(170, 55, 0.3, "square", 0.18);
          break;
        case "boom":
          this.noise(0.7, 1400, 60, 0.7, "lowpass");
          this.tone(90, 35, 0.55, "sine", 0.4);
          break;
        case "pick":
          [660, 880, 1100].forEach((f, i) => this.tone(f, f, 0.07, "triangle", 0.18, i * 0.05));
          break;
        case "use":
          this.tone(560, 240, 0.14, "square", 0.16);
          break;
        case "wave":
          this.tone(95, 38, 0.6, "sine", 0.5);
          this.noise(0.5, 300, 80, 0.3, "lowpass");
          break;
        case "lap":
          this.tone(880, 880, 0.14, "square", 0.16);
          this.tone(1175, 1175, 0.3, "square", 0.16, 0.14);
          break;
        case "finish":
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, i === 3 ? 0.5 : 0.13, "square", 0.17, i * 0.12));
          break;
        case "muted":
          this.tone(220, 90, 0.45, "sawtooth", 0.16);
          break;
        case "stall":
          this.tone(130, 90, 0.35, "square", 0.18);
          break;
      }
    } catch {}
  }

  private tone(from: number, to: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out!);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, from: number, to: number, vol: number, kind: BiquadFilterType) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out!);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  /** leaving the page: everything off */
  destroy() {
    try {
      this.music?.pause();
      if (this.music) this.music.src = "";
      this.engineNodes?.a.stop();
      this.engineNodes?.b.stop();
      void this.ctx?.close();
    } catch {}
    this.ctx = null;
    this.engineNodes = null;
  }
}
