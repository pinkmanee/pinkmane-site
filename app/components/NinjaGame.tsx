"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";

// PINK NINJA: a weed slicing game. Weed nugs in all kinds of colours fly up from the bottom of the screen, you chop them in half
// (and the kief falls out).
//   DRAG the mouse (button held down) / SWIPE with your finger  = slice
//   SPACE / OK / tap                                            = start / play again
//   ESC / P, the II button (top right) or PAUSE on phones       = pause
//   M = game sounds on / off, - and = = quieter / louder, or the speaker + slider in the top left corner
// Slice 3 or more in one swipe = COMBO (bonus points). A GOLDEN NUG is rare and worth 5.
// Let a nug fall without slicing it = you lose a life (3 lives). Slice a BOMB = game over straight away.
// The background is your trippy picture from PINKMANE VOID (public/backgrounds/field-trippy.png), wobbling like the covers there.
// When the site's music is playing, things are thrown up on the beat and the background pulses with it.
// After the game: the online Top 10 (Scoreboard.tsx, board "ninja"), where a good score can be saved with your name.

type Props = {
  // Goes up by 1 every time the player presses OK / A / Space (= start / play again)
  actionSignal: number;
  // The pixel font from the page, so the game text matches the other games
  fontFamily: string;
  // Follows the mute button
  muted: boolean;
  // true on phones / tablets (the hints say SWIPE / TAP instead of DRAG / SPACE, and the blade is a bit wider)
  touch?: boolean;
  // The page's beat clock (the same one PINK JUNGLE gets). Leave it out and the game simply doesn't react to the music.
  beatRef?: { current: { kick: number; live: boolean } };
};

// The name of the game on its start screen (the PSP game list has its own copy in page.tsx)
const GAME_TITLE = "PINK NINJA";
// Where things are saved in the browser
const BEST_KEY = "pinkmane-ninja-best";
const FX_KEY = "pinkmane-ninja-fx"; // "on" / "off": the game sounds
const FX_VOL_KEY = "pinkmane-ninja-fx-volume"; // 0..1
// The online Top 10 after each game (true = on, false = off). Its board is "ninja" in app/api/scores/shared.ts.
const SHOW_TOP10 = true;
// The background picture (if it can't be loaded, a dark dojo is drawn instead)
const BG_IMAGE = "/backgrounds/field-trippy.png";
const BG_DARKEN = 0.35; // how much darker the picture is made, so the nugs stand out (0 = not at all, 1 = black)
const BG_WOBBLE = 3; // how far the picture wobbles sideways (pixels, 0 = still)

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const START_LIVES = 3; // things you can drop before it's game over
const GRAVITY = 150; // how fast things fall back down (bigger = faster game)
const WAVE_GAP_START = 2.6; // seconds between two throws at the start (bigger = easier)
const WAVE_GAP_MIN = 1.2; // ...and the shortest it ever gets
const MAX_PER_WAVE = 6; // most things thrown up at once
const BOMB_FROM_WAVE = 4; // bombs start coming from this throw on
const BOMB_CHANCE_MAX = 0.3; // the highest chance that a thrown thing is a bomb (0-1)
const COMBO_MIN = 3; // slices in one swipe that count as a combo
const CUT_REACH = 2; // how many pixels next to something still count as hitting it (bigger = easier)
const CUT_REACH_TOUCH = 4; // ...on phones (a finger is less exact than a mouse)

// ---------- Screen ----------
// wide picture, the same shape as the other PSP games, so it fills the PINKMANE handheld screen
const W = 320;
const H = 150;
const BOMB_R = 8; // how big the bomb counts as when you hit it

// ---------- Colours ----------
const PINK = "#ff5fd2";
const GREEN = "#7dff6a";
const YELLOW = "#ffd24a";
const RED = "#ff3b5c";
const INK = "#111111";

// ---------- The nugs you chop ----------
// r:      how big it is (radius in pixels)
// points: score for chopping it
// weight: how often it comes (bigger = more often, compared with the others)
// colors: base / dark (shade) / light / hair (the little hairs) / frost (the crystals)
// inside: the colour you see where it's cut
// kief:   the colours of the dust that falls out when you chop it
type BudColors = { base: string; dark: string; light: string; hair: string; frost: string };
const ITEMS: { id: string; r: number; points: number; weight: number; colors: BudColors; inside: string; kief: string[]; shiny?: boolean }[] = [
  {
    id: "kush",
    r: 8,
    points: 1,
    weight: 3,
    colors: { base: "#3ea83a", dark: "#1d6b2a", light: "#7dff6a", hair: "#ff8a1a", frost: "#e8ffe0" },
    inside: "#b6ff9e",
    kief: ["#f0e6a0", "#d8e8a0", "#ffffff"],
  },
  {
    id: "purple",
    r: 8,
    points: 1,
    weight: 2,
    colors: { base: "#9a4cf0", dark: "#5a1fa0", light: "#d8a8ff", hair: "#ff8a1a", frost: "#f4e8ff" },
    inside: "#e0c0ff",
    kief: ["#f0e6a0", "#e8d8ff", "#ffffff"],
  },
  {
    id: "frost",
    r: 7,
    points: 1,
    weight: 2,
    colors: { base: "#8fd88a", dark: "#3a8a3a", light: "#e8ffe0", hair: "#ffa23a", frost: "#ffffff" },
    inside: "#ffffff",
    kief: ["#ffffff", "#f0f0e0", "#f0e6a0"],
  },
  {
    id: "tangie",
    r: 8,
    points: 1,
    weight: 2,
    colors: { base: "#e07a1a", dark: "#8a3a0c", light: "#ffc070", hair: "#ffe34a", frost: "#fff0d8" },
    inside: "#ffd8a0",
    kief: ["#f0e6a0", "#ffd8a0", "#ffffff"],
  },
  {
    id: "blueberry",
    r: 7,
    points: 1,
    weight: 2,
    colors: { base: "#3a6ad8", dark: "#1a3a8a", light: "#8ab8ff", hair: "#ff8a1a", frost: "#e8f2ff" },
    inside: "#c0d8ff",
    kief: ["#f0e6a0", "#d8e8ff", "#ffffff"],
  },
  {
    id: "pinkkush",
    r: 8,
    points: 1,
    weight: 2,
    colors: { base: "#e04ab8", dark: "#8a1f6a", light: "#ffa8e8", hair: "#ffe34a", frost: "#ffe8f8" },
    inside: "#ffc8ee",
    kief: ["#f0e6a0", "#ffd8f4", "#ffffff"],
  },
  {
    id: "gold",
    r: 8,
    points: 5,
    weight: 0.25,
    colors: { base: "#ffd24a", dark: "#b8860b", light: "#fff3b0", hair: "#ff5fd2", frost: "#ffffff" },
    inside: "#fff6b0",
    kief: ["#ffd24a", "#fff3b0", "#ffffff"],
    shiny: true,
  },
];

// ---------- Pixel pictures (made once when the game opens, so drawing them is quick on phones) ----------
function makeCanvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
}
// A small seeded random, so the pictures look the same every time
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
// a 1 pixel black outline around everything drawn on the canvas
function outline(c: HTMLCanvasElement) {
  const g = c.getContext("2d")!;
  const { width: w, height: h } = c;
  const a = g.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 0;
  g.fillStyle = INK;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) g.fillRect(x, y, 1, 1);
}
// a bud: a lumpy ball made of small round lumps, with orange hairs and white crystals
function buildBud(r: number, col: BudColors, seed: number) {
  const S = r * 2 + 6;
  const { c, g } = makeCanvas(S, S);
  const rnd = seeded(seed);
  const lumps: [number, number, number][] = [[0, 0, r * 0.72]];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.5;
    lumps.push([Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.48, r * 0.48 + rnd() * r * 0.14]);
  }
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = x + 0.5 - S / 2;
      const py = y + 0.5 - S / 2;
      if (!lumps.some(([lx, ly, lr]) => (px - lx) ** 2 + (py - ly) ** 2 <= lr * lr)) continue;
      let color = px + py > r * 0.5 ? col.dark : px + py < -r * 0.6 ? col.light : col.base;
      const n = rnd();
      if (n < 0.07) color = col.hair;
      else if (n < 0.15) color = col.frost;
      else if (n < 0.25) color = col.light;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }
  outline(c);
  return c;
}
// the bomb (don't cut it!): a black ball with a shine and a pink skull (the fuse + spark are drawn moving, in the game)
function buildBomb() {
  const r = 8;
  const S = r * 2 + 4;
  const { c, g } = makeCanvas(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const px = x + 0.5 - S / 2;
      const py = y + 0.5 - S / 2;
      if (px * px + py * py > r * r) continue;
      g.fillStyle = px + py > r * 0.5 ? "#0a0a10" : "#2a2a36";
      g.fillRect(x, y, 1, 1);
    }
  const m = S / 2;
  g.fillStyle = "#9a9ab0"; // the shine
  g.fillRect(m - 4, m - 4, 2, 1);
  g.fillRect(m - 4, m - 3, 1, 1);
  g.fillStyle = "#ff5fd2"; // the skull
  g.fillRect(m - 2, m - 3, 5, 3);
  g.fillRect(m - 1, m, 3, 1);
  g.fillStyle = "#2a2a36";
  g.fillRect(m - 1, m - 2, 1, 1);
  g.fillRect(m + 1, m - 2, 1, 1);
  outline(c);
  return c;
}
// cut a picture in two (top + bottom half, or left + right half when across = true), with the inside colour along the cut
function splitPicture(img: HTMLCanvasElement, inside: string, across = false) {
  const halves: HTMLCanvasElement[] = [];
  const w = img.width;
  const h = img.height;
  const mid = Math.floor((across ? w : h) / 2);
  for (const first of [true, false]) {
    const { c, g } = makeCanvas(w, h);
    g.drawImage(img, 0, 0);
    if (across) {
      if (first) g.clearRect(mid, 0, w - mid, h);
      else g.clearRect(0, 0, mid, h);
    } else if (first) g.clearRect(0, mid, w, h - mid);
    else g.clearRect(0, 0, w, mid);
    // the cut face: paint the line along the cut in the inside colour (only where there is something, not on the outline)
    const line = first ? mid - 1 : mid;
    const a = across ? g.getImageData(line, 0, 1, h).data : g.getImageData(0, line, w, 1).data;
    const n = across ? h : w;
    g.fillStyle = inside;
    for (let i = 1; i < n - 1; i++)
      if (a[i * 4 + 3] > 0 && a[(i - 1) * 4 + 3] > 0 && a[(i + 1) * 4 + 3] > 0) {
        if (across) g.fillRect(line, i, 1, 1);
        else g.fillRect(i, line, 1, 1);
      }
    halves.push(c);
  }
  return halves as [HTMLCanvasElement, HTMLCanvasElement];
}

type Thing = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; item: number; bomb: boolean; done: boolean };
// kief: tiny dust that falls slowly out of a chopped nug and sparkles
type Kief = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Half = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; item: number; side: 0 | 1 };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Popup = { x: number; y: number; text: string; life: number; color: string };
type Mode = "ready" | "running" | "over";

export default function NinjaGame({ actionSignal, fontFamily, muted, touch = false, beatRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const beatSrc = useRef(beatRef);
  beatSrc.current = beatRef;
  const boardRef = useRef<ScoreApi | null>(null); // the online Top 10 box (Scoreboard.tsx), board id "ninja"
  const lastSignal = useRef(actionSignal);
  // what the pointer handlers below ask the game loop to do (x, y in game pixels)
  const api = useRef<{
    press: () => void;
    down: (x: number, y: number) => void;
    move: (x: number, y: number) => void;
    up: () => void;
  } | null>(null);

  // OK / A / Space from the page = start / play again
  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    api.current?.press();
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // ---------- pictures ----------
    const pics = ITEMS.map((it, i) => buildBud(it.r, it.colors, 11 + i * 17));
    const halfPics = pics.map((p, i) => splitPicture(p, ITEMS[i].inside));
    const bombPic = buildBomb();
    // the background picture
    let bg: HTMLImageElement | null = null;
    const bgImg = new Image();
    bgImg.onload = () => {
      if (bgImg.width > 0) bg = bgImg;
    };
    bgImg.src = BG_IMAGE;
    const totalWeight = ITEMS.reduce((n, it) => n + it.weight, 0);
    const pickItem = () => {
      let r = Math.random() * totalWeight;
      for (let i = 0; i < ITEMS.length; i++) {
        r -= ITEMS[i].weight;
        if (r <= 0) return i;
      }
      return 0;
    };

    // the beat of the song: 1 right on the beat, falling to 0. 0 = no music playing right now
    const beatLive = () => !!beatSrc.current?.current?.live;
    const beatKick = () => {
      const b = beatSrc.current?.current;
      return b && b.live ? Math.max(0, b.kick) : 0;
    };

    // ---------- sound (game sounds only, not your music) ----------
    let fxOn = true;
    let fxVol = 1;
    try {
      fxOn = localStorage.getItem(FX_KEY) !== "off";
      const v = localStorage.getItem(FX_VOL_KEY);
      if (v !== null && !Number.isNaN(Number(v))) fxVol = Math.max(0, Math.min(1, Number(v)));
    } catch {}
    const saveFx = () => {
      try {
        localStorage.setItem(FX_KEY, fxOn ? "on" : "off");
        localStorage.setItem(FX_VOL_KEY, String(fxVol));
      } catch {}
    };
    // (moving the slider up from 0 also turns the sounds back on)
    const setFxVolume = (v: number) => {
      fxVol = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
      if (fxVol > 0) fxOn = true;
      saveFx();
    };
    const toggleFx = () => {
      fxOn = !fxOn;
      if (fxOn && fxVol <= 0) fxVol = 0.5;
      saveFx();
    };
    const soundOk = () => !mutedRef.current && fxOn && fxVol > 0;

    let ac: AudioContext | null = null;
    const audio = () => {
      if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      return ac;
    };
    const tone = (f1: number, f2: number, dur: number, type: OscillatorType, vol = 0.08, delay = 0) => {
      if (!soundOk()) return;
      try {
        const a = audio();
        const t0 = a.currentTime + delay;
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
        g.gain.setValueAtTime(vol * fxVol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(a.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      } catch {}
    };
    // a burst of noise that sweeps from one pitch to another (the swish of the blade, the bust)
    const noise = (dur: number, vol: number, from: number, to: number) => {
      if (!soundOk()) return;
      try {
        const a = audio();
        const len = Math.max(1, Math.floor(a.sampleRate * dur));
        const buf = a.createBuffer(1, len, a.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = a.createBufferSource();
        src.buffer = buf;
        const f = a.createBiquadFilter();
        f.type = "bandpass";
        f.Q.value = 1.2;
        f.frequency.setValueAtTime(from, a.currentTime);
        f.frequency.exponentialRampToValueAtTime(Math.max(30, to), a.currentTime + dur);
        const g = a.createGain();
        g.gain.value = vol * fxVol;
        src.connect(f).connect(g).connect(a.destination);
        src.start();
      } catch {}
    };
    const sfx = {
      start: () => {
        tone(330, 660, 0.1, "square", 0.05);
        tone(660, 990, 0.12, "square", 0.05, 0.1);
      },
      launch: () => tone(160, 260, 0.08, "triangle", 0.03),
      swish: () => noise(0.12, 0.22, 3200, 700),
      chop: () => {
        noise(0.09, 0.3, 1600, 400);
        tone(320, 120, 0.1, "triangle", 0.06);
      },
      gold: () => [880, 1320, 1760].forEach((f, i) => tone(f, f, 0.07, "square", 0.05, i * 0.05)),
      combo: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.08, "square", 0.05, i * 0.06)),
      miss: () => tone(220, 90, 0.3, "square", 0.06),
      boom: () => {
        noise(0.7, 0.7, 900, 60);
        tone(120, 30, 0.6, "sawtooth", 0.12);
      },
      click: () => tone(420, 380, 0.04, "square", 0.03),
    };

    // ---------- best score ----------
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- game state ----------
    const pause = { on: false };
    let runId = 0; // goes up every run, so a late Top 10 box never opens in the middle of a new run
    const s = {
      mode: "ready" as Mode,
      t: 0, // seconds in this mode
      runT: 0, // seconds this run has lasted (the scoreboard checks the score is possible for that time)
      score: 0,
      lives: START_LIVES,
      wave: 0, // how many throws so far
      waveT: 0, // seconds until the next throw
      queue: [] as { at: number; bomb: boolean }[], // things waiting to be thrown up
      things: [] as Thing[],
      halves: [] as Half[],
      parts: [] as Particle[],
      kief: [] as Kief[],
      pops: [] as Popup[],
      misses: [] as { x: number; life: number }[], // red X where something was dropped
      shake: 0,
      flash: 0,
      why: "",
      newBest: false,
    };
    // the blade: where the finger / mouse has been in the last moment (that's the trail you see)
    const blade = { down: false, pts: [] as { x: number; y: number; t: number }[], swishT: 0, cut: 0, cutT: 0, cutX: 0, cutY: 0 };
    let clock = 0;
    let pauseClock = 0;

    const reset = () => {
      boardRef.current?.hide();
      runId++;
      s.mode = "running";
      s.t = 0;
      s.runT = 0;
      s.score = 0;
      s.lives = START_LIVES;
      s.wave = 0;
      s.waveT = 0.6;
      s.queue = [];
      s.things = [];
      s.halves = [];
      s.parts = [];
      s.kief = [];
      s.pops = [];
      s.misses = [];
      s.why = "";
      s.newBest = false;
      blade.cut = 0;
      sfx.start();
    };

    const gameOver = (why: string) => {
      s.mode = "over";
      s.t = 0;
      s.why = why;
      s.queue = [];
      blade.down = false;
      if (s.score > best) {
        best = s.score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
      // ONLINE TOP 10: after a moment the name box (good score) or the Top 10 pops up
      const myRun = runId;
      const score = s.score;
      const runT = s.runT;
      setTimeout(() => {
        if (runId === myRun && s.mode === "over") boardRef.current?.gameOver(score, runT);
      }, 900);
    };

    const burst = (x: number, y: number, n: number, colors: string[], power = 70) => {
      if (s.parts.length > 300) return; // (keeps phones smooth)
      for (let i = 0; i < n; i++)
        s.parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * power * 2,
          vy: (Math.random() - 0.7) * power * 1.6,
          life: 0.35 + Math.random() * 0.45,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
    };

    // ---------- throwing things up ----------
    const spawn = (bomb: boolean) => {
      const x0 = 30 + Math.random() * (W - 60);
      const vy = -(150 + Math.random() * 50); // how high it goes
      const air = (-2 * vy) / GRAVITY; // seconds until it falls back down
      const vx = ((W / 2 - x0) / air) * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * 20; // leans towards the middle
      s.things.push({ x: x0, y: H + 14, vx, vy, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 5, item: pickItem(), bomb, done: false });
      sfx.launch();
    };
    const waveGap = () => Math.max(WAVE_GAP_MIN, WAVE_GAP_START - s.wave * 0.05);
    const startWave = () => {
      s.wave++;
      const n = Math.min(MAX_PER_WAVE, 1 + Math.floor(s.wave / 3) + (Math.random() < 0.4 ? 1 : 0));
      const bombChance = s.wave >= BOMB_FROM_WAVE ? Math.min(BOMB_CHANCE_MAX, 0.06 + s.wave * 0.012) : 0;
      const maxBombs = s.wave > 15 ? 2 : 1;
      let bombs = 0;
      const together = Math.random() < 0.35; // sometimes all at once, otherwise one after the other
      for (let i = 0; i < n; i++) {
        const bomb = i > 0 && bombs < maxBombs && Math.random() < bombChance; // (the first one is never a bomb)
        if (bomb) bombs++;
        s.queue.push({ at: clock + (together ? 0 : i * 0.22), bomb });
      }
      s.waveT = waveGap();
    };

    // ---------- slicing ----------
    // how far point (px, py) is from the line between (ax, ay) and (bx, by)
    const segDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      const k = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
      return Math.hypot(px - (ax + dx * k), py - (ay + dy * k));
    };
    const chop = (t: Thing, ang: number) => {
      const it = ITEMS[t.item];
      t.done = true;
      // two halves fly apart, one each side of the cut
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (const side of [0, 1] as const) {
        const k = side === 0 ? -1 : 1;
        s.halves.push({
          x: t.x + nx * k * 2,
          y: t.y + ny * k * 2,
          vx: t.vx * 0.6 + nx * k * 28,
          vy: Math.min(t.vy, 0) * 0.5 + ny * k * 28 - 10,
          rot: ang, // the cut line follows your swipe
          vr: k * (2 + Math.random() * 2),
          item: t.item,
          side,
        });
      }
      burst(t.x, t.y, 8, [it.colors.base, it.colors.light, it.colors.hair]);
      // the kief falls out: fine dust that drifts down slowly
      if (s.kief.length < 400)
        for (let i = 0; i < 22; i++)
          s.kief.push({
            x: t.x + (Math.random() - 0.5) * 8,
            y: t.y + (Math.random() - 0.5) * 6,
            vx: (Math.random() - 0.5) * 30,
            vy: -10 - Math.random() * 25,
            life: 1.4 + Math.random() * 1.4,
            color: it.kief[Math.floor(Math.random() * it.kief.length)],
          });
      s.score += it.points;
      if (it.points > 1) s.pops.push({ x: t.x, y: t.y - 12, text: `+${it.points}`, life: 0.8, color: it.shiny ? YELLOW : GREEN });
      blade.cut++;
      blade.cutT = clock;
      blade.cutX = t.x;
      blade.cutY = t.y;
      sfx.chop();
      if (it.shiny) sfx.gold();
    };
    const explode = (t: Thing) => {
      t.done = true;
      sfx.boom();
      s.shake = 0.6;
      s.flash = 1;
      burst(t.x, t.y, 40, ["#ffffff", YELLOW, "#ff7a1a", RED, INK], 120);
      gameOver("BOOM!");
    };
    // the blade moved from (ax, ay) to (bx, by): anything on that line gets chopped
    const cutBetween = (ax: number, ay: number, bx: number, by: number) => {
      if (s.mode !== "running" || pause.on) return;
      const len = Math.hypot(bx - ax, by - ay);
      if (len < 1.5) return; // (holding still doesn't cut)
      if (len > 6 && clock - blade.swishT > 0.18) {
        blade.swishT = clock;
        sfx.swish();
      }
      const ang = Math.atan2(by - ay, bx - ax);
      const reach = touchRef.current ? CUT_REACH_TOUCH : CUT_REACH;
      for (const t of s.things) {
        if (t.done) continue;
        const r = t.bomb ? BOMB_R : ITEMS[t.item].r;
        if (segDist(t.x, t.y, ax, ay, bx, by) > r + reach) continue;
        if (t.bomb) {
          explode(t);
          return;
        }
        chop(t, ang);
      }
    };

    // ---------- FX speaker + slider (top left) and the pause button (top right) ----------
    const FX_SLIDER = { x: 4, top: 18, bottom: 58 };
    const PAUSE_BTN = { x: W - 62, y: 2, w: 16, h: 13 };
    let fxDrag = false;
    const fxHit = (x: number, y: number) => {
      if (x < 16 && y < 14) return "icon";
      if (x < 16 && y >= FX_SLIDER.top - 5 && y <= FX_SLIDER.bottom + 5) return "slider";
      return null;
    };
    const fxFromY = (y: number) => setFxVolume((FX_SLIDER.bottom - y) / (FX_SLIDER.bottom - FX_SLIDER.top));
    const onPauseBtn = (x: number, y: number) =>
      x >= PAUSE_BTN.x - 3 && x <= PAUSE_BTN.x + PAUSE_BTN.w + 3 && y >= 0 && y <= PAUSE_BTN.y + PAUSE_BTN.h + 3;
    const setPause = (on: boolean) => {
      if (s.mode !== "running") return;
      pause.on = on;
      blade.down = false;
      blade.pts = [];
      sfx.click();
    };

    // ---------- input ----------
    const press = () => {
      if (boardRef.current?.busy()) return; // the Top 10 / name box is open: close it first
      if (pause.on) {
        setPause(false);
        return;
      }
      if (s.mode === "ready") reset();
      else if (s.mode === "over" && s.t > 0.8) reset(); // (wait a moment so you don't skip the game over screen by accident)
    };
    api.current = {
      press,
      down: (x, y) => {
        if (boardRef.current?.busy()) return;
        const hit = fxHit(x, y);
        if (hit === "icon") {
          toggleFx();
          sfx.click();
          return;
        }
        if (hit === "slider") {
          fxDrag = true;
          fxFromY(y);
          return;
        }
        if (s.mode === "running" && !pause.on && onPauseBtn(x, y)) {
          setPause(true);
          return;
        }
        if (pause.on || s.mode !== "running") {
          press();
          return;
        }
        blade.down = true;
        blade.pts = [{ x, y, t: clock }];
      },
      move: (x, y) => {
        if (fxDrag) {
          fxFromY(y);
          return;
        }
        if (!blade.down) return;
        const last = blade.pts[blade.pts.length - 1];
        if (last) cutBetween(last.x, last.y, x, y);
        blade.pts.push({ x, y, t: clock });
      },
      up: () => {
        if (fxDrag) {
          fxDrag = false;
          sfx.click(); // a little test sound at the new volume
        }
        blade.down = false;
      },
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // typing your name for the Top 10
      const k = e.key;
      if (k === "Escape" || k === "p" || k === "P") {
        setPause(!pause.on);
        return;
      }
      if (k === "m" || k === "M") {
        toggleFx();
        sfx.click();
      }
      if (k === "-" || k === "_" || k === "=" || k === "+") {
        setFxVolume((fxOn ? fxVol : 0) + (k === "-" || k === "_" ? -0.1 : 0.1));
        sfx.click();
      }
    };
    // switching apps / tabs pauses the game
    const onHidden = () => {
      if (!document.hidden) return;
      blade.down = false;
      if (s.mode === "running") pause.on = true;
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHidden);

    // ---------- drawing helpers ----------
    const text = (str: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center") => {
      ctx.font = `${size}px ${fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    };
    // a picture, turned around its middle
    const drawPic = (img: HTMLCanvasElement, x: number, y: number, rot: number) => {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      ctx.rotate(rot);
      ctx.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2));
      ctx.restore();
    };

    const drawThing = (t: Thing) => {
      if (t.bomb) {
        drawBomb(t.x, t.y);
        return;
      }
      const it = ITEMS[t.item];
      drawPic(pics[t.item], t.x, t.y, t.rot);
      // the golden bud sparkles
      if (it.shiny && Math.floor(clock * 6 + t.x) % 3 === 0) {
        ctx.fillStyle = "#ffffff";
        const a = clock * 4 + t.x;
        ctx.fillRect(Math.round(t.x + Math.cos(a) * 11), Math.round(t.y + Math.sin(a) * 11), 1, 1);
        ctx.fillRect(Math.round(t.x - Math.cos(a) * 9), Math.round(t.y - Math.sin(a) * 9), 1, 1);
      }
    };

    // the bomb, with its fuse and a spark that flickers
    const drawBomb = (bx: number, by: number) => {
      drawPic(bombPic, bx, by, 0);
      const x = Math.round(bx);
      const y = Math.round(by) - BOMB_R;
      ctx.fillStyle = "#8a6a3a";
      ctx.fillRect(x + 1, y - 2, 1, 2);
      ctx.fillRect(x + 2, y - 3, 1, 1);
      const on = Math.floor(clock * 20) % 2 === 0;
      ctx.fillStyle = on ? "#ffffff" : YELLOW;
      ctx.fillRect(x + 2, y - 5, 2, 2);
      ctx.fillStyle = on ? "#ff7a1a" : "#ffffff";
      ctx.fillRect(x + 4 - (Math.floor(clock * 30) % 3), y - 6 + (Math.floor(clock * 25) % 2), 1, 1);
    };

    // a little X (lives, and where something was dropped)
    const drawX = (cx: number, cy: number, color: string) => {
      for (let i = -3; i <= 3; i++) {
        ctx.fillStyle = INK;
        ctx.fillRect(cx + i - 1, cy + i - 1, 3, 3);
        ctx.fillRect(cx - i - 1, cy + i - 1, 3, 3);
      }
      ctx.fillStyle = color;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(cx + i, cy + i, 1, 1);
        ctx.fillRect(cx - i, cy + i, 1, 1);
      }
    };

    // the background: your trippy picture, wobbling (every couple of rows slides sideways on a slow wave, faster with the music),
    // made a bit darker so the nugs stand out. Until it has loaded (or if it's missing): the night dojo.
    let wob = 0;
    const drawBack = () => {
      if (bg) {
        const iw = bg.width;
        const ih = bg.height;
        const sc = Math.max((W + BG_WOBBLE * 2 + 4) / iw, H / ih); // fill the screen ("cover"), a little wider for the wobble
        const dw = iw * sc;
        const dh = ih * sc;
        const ox = (W - dw) / 2;
        const oy = (H - dh) / 2;
        const k = beatKick();
        wob += 1 / 60 + k * 0.03;
        const STRIP = 2;
        for (let y = 0; y < H; y += STRIP) {
          const shift = Math.sin(wob * 1.6 + y * 0.06) * BG_WOBBLE;
          const sy = (y - oy) / sc;
          ctx.drawImage(bg, 0, sy, iw, STRIP / sc, Math.round(ox + shift), y, dw, STRIP);
        }
        ctx.fillStyle = `rgba(10,4,20,${BG_DARKEN})`;
        ctx.fillRect(0, 0, W, H);
        if (k > 0.05) {
          ctx.fillStyle = `rgba(214,60,200,${k * 0.1})`;
          ctx.fillRect(0, 0, W, H);
        }
        return;
      }
      const bands = ["#140820", "#1c0c2c", "#241036", "#2c1440", "#34184a"];
      const bh = Math.ceil(H / bands.length);
      bands.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, i * bh, W, bh);
      });
      ctx.fillStyle = "rgba(255,224,246,0.16)"; // the moon behind the paper
      ctx.beginPath();
      ctx.arc(W - 64, 44, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c1a50"; // wooden frames
      for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 2, H);
      for (let y = 30; y < H; y += 40) ctx.fillRect(0, y, W, 2);
      ctx.fillStyle = "#4a2262";
      for (let x = 0; x < W; x += 40) ctx.fillRect(x, 0, 1, H);
      ctx.fillStyle = "#1a0a24"; // the floor
      ctx.fillRect(0, H - 8, W, 8);
      ctx.fillStyle = "#4a2262";
      ctx.fillRect(0, H - 8, W, 1);
      const k = beatKick(); // music: a soft pink pulse on every beat
      if (k > 0.05) {
        ctx.fillStyle = `rgba(214,60,200,${k * 0.1})`;
        ctx.fillRect(0, 0, W, H);
      }
    };

    // the speaker + volume slider, top left
    const drawFx = () => {
      const x = 2;
      const y = 5;
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 1, y - 1, 12, 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y + 2, 2, 3);
      ctx.fillRect(x + 2, y + 1, 1, 5);
      ctx.fillRect(x + 3, y, 1, 7);
      if (fxOn && fxVol > 0) {
        ctx.fillRect(x + 5, y + 2, 1, 3);
        ctx.fillRect(x + 7, y + 1, 1, 5);
      } else {
        ctx.fillStyle = PINK;
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
          ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
        }
      }
      const { x: sx, top, bottom } = FX_SLIDER;
      const vol = fxOn ? fxVol : 0;
      const knobY = Math.round(bottom - vol * (bottom - top));
      ctx.globalAlpha = fxDrag ? 1 : 0.75;
      ctx.fillStyle = INK;
      ctx.fillRect(sx - 1, top - 1, 5, bottom - top + 2);
      ctx.fillStyle = "#6e6478";
      ctx.fillRect(sx, top, 3, bottom - top);
      ctx.fillStyle = PINK;
      ctx.fillRect(sx, knobY, 3, bottom - knobY);
      ctx.fillStyle = INK;
      ctx.fillRect(sx - 3, knobY - 2, 9, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx - 2, knobY - 1, 7, 3);
      ctx.globalAlpha = 1;
    };

    // the II pause button, top right (next to the lives)
    const drawPauseBtn = () => {
      const { x, y, w, h } = PAUSE_BTN;
      ctx.fillStyle = INK;
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
      ctx.fillStyle = "rgba(74,20,71,0.9)";
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 5, y + 3, 2, h - 6);
      ctx.fillRect(x + 9, y + 3, 2, h - 6);
    };

    // the blade trail: a white line with a pink glow, thinner towards its end
    const drawBlade = () => {
      const pts = blade.pts;
      if (pts.length < 2) return;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let i = 1; i < pts.length; i++) {
        const k = i / pts.length; // 0 = oldest .. 1 = newest
        ctx.strokeStyle = `rgba(255,95,210,${0.5 * k})`;
        ctx.lineWidth = 1 + k * 4;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
        ctx.lineWidth = 0.5 + k * 1.5;
        ctx.stroke();
      }
    };

    // ---------- the game loop ----------
    const step = (dt: number) => {
      clock += dt;
      s.t += dt;
      if (s.mode === "running") s.runT += dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.flash > 0) s.flash -= dt * 2;

      if (s.mode === "running") {
        // time for the next throw (with music on: it waits for the next beat, but never long)
        s.waveT -= dt;
        if (s.waveT <= 0 && (!beatLive() || beatKick() > 0.85 || s.waveT < -0.5)) startWave();
        for (const q of s.queue)
          if (q.at <= clock) {
            spawn(q.bomb);
            q.at = -1;
          }
        s.queue = s.queue.filter((q) => q.at >= 0);
      }

      // things fly up and fall back down
      for (const t of s.things) {
        if (t.done) continue;
        t.vy += GRAVITY * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.rot += t.vr * dt;
        if (t.bomb) t.rot = 0; // (the bomb doesn't spin, so its fuse stays on top)
        const r = t.bomb ? BOMB_R : ITEMS[t.item].r;
        if (t.vy > 0 && t.y > H + r + 8) {
          t.done = true;
          // a nug got away: lose a life (a bomb falling away is fine)
          if (!t.bomb && s.mode === "running") {
            s.lives--;
            s.misses.push({ x: Math.max(8, Math.min(W - 8, t.x)), life: 1.2 });
            sfx.miss();
            if (s.lives <= 0) gameOver("DROPPED 3!");
          }
        }
      }
      s.things = s.things.filter((t) => !t.done);

      for (const h of s.halves) {
        h.vy += GRAVITY * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
      }
      s.halves = s.halves.filter((h) => h.y < H + 24);

      // a combo ends a moment after the last cut
      if (blade.cut > 0 && clock - blade.cutT > 0.25) {
        if (blade.cut >= COMBO_MIN) {
          s.score += blade.cut;
          s.pops.push({ x: Math.max(50, Math.min(W - 50, blade.cutX)), y: Math.max(26, blade.cutY - 14), text: `COMBO x${blade.cut}! +${blade.cut}`, life: 1.3, color: YELLOW });
          sfx.combo();
        }
        blade.cut = 0;
      }
      blade.pts = blade.pts.filter((p) => p.t > clock - 0.12); // the trail fades quickly

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const k of s.kief) {
        k.vx *= 1 - 1.5 * dt; // the dust slows down quickly and floats down
        k.vy = Math.min(22, k.vy + 45 * dt);
        k.x += (k.vx + Math.sin(clock * 3 + k.y) * 4) * dt;
        k.y += k.vy * dt;
        k.life -= dt;
      }
      s.kief = s.kief.filter((k) => k.life > 0 && k.y < H + 2);
      for (const p of s.pops) {
        p.y -= 14 * dt;
        p.life -= dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);
      for (const m of s.misses) m.life -= dt;
      s.misses = s.misses.filter((m) => m.life > 0);
    };

    const render = () => {
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 5), Math.round((Math.random() - 0.5) * 5));
      drawBack();
      for (const h of s.halves) drawPic(halfPics[h.item][h.side], h.x, h.y, h.rot);
      for (const t of s.things) if (!t.done) drawThing(t);
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      // kief: 1 pixel dust that twinkles as it falls
      for (const k of s.kief) {
        ctx.globalAlpha = Math.min(1, k.life);
        ctx.fillStyle = Math.random() < 0.08 ? "#ffffff" : k.color;
        ctx.fillRect(Math.round(k.x), Math.round(k.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      drawBlade();
      ctx.restore();

      // dropped: a red X at the bottom where it fell
      for (const m of s.misses) {
        ctx.globalAlpha = Math.min(1, m.life);
        drawX(Math.round(m.x), H - 14, RED);
      }
      ctx.globalAlpha = 1;
      for (const p of s.pops) text(p.text, p.x, p.y, p.color);

      if (s.mode === "running") {
        text(String(s.score), 18, 4, YELLOW, 16, "left");
        if (best > 0) text(`BEST ${best}`, 18, 22, "#b48ad0", 8, "left");
        for (let i = 0; i < START_LIVES; i++) drawX(W - 10 - i * 12, 9, i < START_LIVES - s.lives ? RED : "#5a4a6a");
        if (!pause.on) drawPauseBtn();
        // how to play, during the first seconds
        if (s.t < 3.5) {
          ctx.globalAlpha = Math.min(1, (3.5 - s.t) / 0.8);
          text(touchRef.current ? "SWIPE THROUGH THE NUGS!" : "HOLD THE MOUSE + DRAG THROUGH THE NUGS!", W / 2, 48, "#ffffff");
          ctx.globalAlpha = 1;
        }
      }

      if (s.mode === "ready") {
        ctx.fillStyle = "rgba(14,4,24,0.6)";
        ctx.fillRect(0, 0, W, H);
        text(GAME_TITLE, W / 2, 14 - Math.round(beatKick() * 2), PINK, 16); // (bounces to the music)
        drawPic(pics[0], W / 2 - 92, 21, 0); // a nug on each side of the title
        drawPic(pics[5], W / 2 + 92, 21, 0);
        text(touchRef.current ? "SWIPE TO CHOP THE NUGS" : "DRAG THE MOUSE TO CHOP THE NUGS", W / 2, 44, "#ffffff");
        text("DON'T CUT THE BOMBS", W / 2, 58, RED);
        drawBomb(W / 2 + 90, 62);
        text(`DROP ${START_LIVES} = GAME OVER`, W / 2, 72, "#d8a8ff");
        text(`${COMBO_MIN}+ IN ONE SWIPE = COMBO`, W / 2, 86, GREEN);
        text("GOLDEN NUG = +5", W / 2, 98, YELLOW);
        drawPic(pics[6], W / 2 - 78, 101, 0);
        if (Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP TO START" : "SPACE / CLICK = START", W / 2, 116, YELLOW);
        if (best > 0) text(`BEST ${best}`, W / 2, 132, "#b48ad0");
      }

      if (s.mode === "over") {
        ctx.fillStyle = `rgba(14,4,24,${Math.min(0.72, s.t * 1.2)})`;
        ctx.fillRect(0, 0, W, H);
        if (s.t > 0.4) {
          text(s.why, W / 2, 24, s.why === "BOOM!" ? RED : PINK, 16);
          text(`SCORE ${s.score}`, W / 2, 56, YELLOW);
          text(s.newBest ? "NEW BEST!" : `BEST ${best}`, W / 2, 70, s.newBest ? PINK : "#b48ad0");
          if (s.t > 0.8 && Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP = AGAIN" : "SPACE / CLICK = AGAIN", W / 2, 100, GREEN);
        }
      }

      if (pause.on) {
        ctx.fillStyle = "rgba(14,4,24,0.75)";
        ctx.fillRect(0, 0, W, H);
        text("PAUSED", W / 2, 40, PINK, 16);
        text(`SCORE ${s.score}`, W / 2, 70, YELLOW);
        if (Math.floor(pauseClock * 2) % 2 === 0) text(touchRef.current ? "TAP = RESUME" : "SPACE / ESC / CLICK = RESUME", W / 2, 92, GREEN);
      }

      // the bomb: a white flash
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, s.flash) * 0.8})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawFx();
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (pause.on) pauseClock += dt; // only for the blinking text
      else step(dt);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHidden);
      api.current = null;
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily]);

  // ---------- mouse + finger ----------
  // The canvas box is measured once when you press (not on every move), and every in-between point the browser
  // collected is used, so fast swipes on phones still cut everything they pass through.
  const rect = useRef({ left: 0, top: 0, sc: 1, ox: 0, oy: 0 });
  const measure = () => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H); // the picture is fitted inside the canvas box ("contain")
    rect.current = { left: r.left, top: r.top, sc, ox: (r.width - W * sc) / 2, oy: (r.height - H * sc) / 2 };
  };
  const gx = (cx: number) => (cx - rect.current.left - rect.current.ox) / rect.current.sc;
  const gy = (cy: number) => (cy - rect.current.top - rect.current.oy) / rect.current.sc;

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          measure();
          api.current?.down(gx(e.clientX), gy(e.clientY));
        }}
        onPointerMove={(e) => {
          const list = e.nativeEvent.getCoalescedEvents?.() ?? [];
          if (list.length > 1) for (const p of list) api.current?.move(gx(p.clientX), gy(p.clientY));
          else api.current?.move(gx(e.clientX), gy(e.clientY));
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          api.current?.up();
        }}
        onPointerCancel={() => api.current?.up()}
        onLostPointerCapture={() => api.current?.up()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: "#140820",
          touchAction: "none",
          cursor: "crosshair",
        }}
      />
      {SHOW_TOP10 && <ScorePanel game="ninja" title="PINK NINJA" apiRef={boardRef} fontFamily={fontFamily} accent={PINK} />}
    </>
  );
}
