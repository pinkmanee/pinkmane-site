"use client";

import { useEffect, useRef } from "react";

// PINK JETPACK (DEMO): an endless side-scrolling jetpack game.
// Pinkmane flies through the night city. His jetpack shoots WEED LEAVES downwards, that's what pushes him up.
//   HOLD  SPACE / UP / W / mouse button / finger on the screen  = fly up
//   LET GO                                                      = fall down
//   ESC / P (or the PAUSE button on phones)                     = pause
// Dodge the ZAPPERS (electric bars) and the ROCKETS (a red ! shows where one is coming from).
// Collect the green gems. The little PIGLETS on the ground don't hurt you: hit one with your weed leaves for bonus gems.
// One hit and the run is over. Score = meters + 5 for every gem. Your best score is saved in the browser.
// This is a first demo: no shop, no skins, no online Top 10 yet.

type Props = {
  // Goes up by 1 every time the player presses OK / A on the handheld (= start, or a short puff of the jetpack)
  actionSignal: number;
  // The pixel font from the page, so the game text matches the other games
  fontFamily: string;
  // Follows the mute button
  muted: boolean;
  // true on phones / tablets: you hold a finger anywhere on the screen to fly
  touch?: boolean;
  // The page's beat clock (the same one PINK JUNGLE gets). Leave it out and the game simply doesn't react to the music.
  beatRef?: { current: { kick: number; live: boolean } };
};

// The name of the game on its start screen (the PSP game list has its own copy in page.tsx)
const GAME_TITLE = "PINK JETPACK";
// Where the best score is saved in the browser
const BEST_KEY = "pinkmane-jet-best";
// Your pixel dude, the same picture PINKMANE VOID uses (walking frames side by side, each 24 x 35, he looks to the right).
// If the picture can't be loaded, a simple drawn Pinkmane is used instead.
const DUDE_IMAGE = "/game/pinkdude.png";

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const START_SPEED = 95; // how fast the world moves at the start (pixels per second, 10 pixels = 1 meter)
const MAX_SPEED = 235; // the fastest it ever gets
const SPEED_GAIN = 0.09; // how much faster it gets for every meter you fly (smaller = easier)
const GRAVITY = 560; // how hard you fall
const THRUST = 620; // how hard the jetpack pushes you up while you hold
const MAX_UP = 175; // fastest you can fly up
const MAX_DOWN = 220; // fastest you can fall
const SAFE_START = 300; // first pixels with nothing in your way (30 meters)
const GAP_START = 190; // pixels between two obstacles at the start (bigger = easier)
const GAP_MIN = 105; // ...and the smallest it ever gets
const ROCKETS_FROM = 150; // meters before the first rocket can come
const SPIN_FROM = 400; // meters before zappers can start to spin
const ROCKET_WARN = 1.1; // seconds the red ! follows you before the rocket is fired
const ROCKET_SPEED = 250; // how fast a rocket flies (on top of the world speed)
const LEAF_EVERY = 0.035; // seconds between two weed leaves while you fly (smaller = more leaves)
const LEAF_FALL = 170; // how fast the leaves fall (smaller = they stay on the screen longer)
const PIG_GEMS = 3; // bonus gems for hitting a piglet with a leaf
const PIG_EVERY = 240; // about how many pixels between two piglets (smaller = more piglets)

// ---------- Screen ----------
// wide picture, the same shape as PINK JUNGLE, so it fills the PINKMANE handheld screen
const W = 320;
const H = 150;
const CEIL = 12; // the ceiling (you can't fly higher)
const FLOOR = 134; // the ground (you run on it)
const PX = 56; // where Pinkmane is on the screen (left edge of his picture)
const SW = 24; // his picture: 24 x 35 pixels
const SH = 35;
// the part of him that can be hit (hair, arms and the jetpack don't count, so close calls feel fair)
const HB = { x: 8, y: 6, w: 9, h: 27 };

// ---------- Colours ----------
const PINK = "#ff5fd2";
const GREEN = "#7dff6a";
const YELLOW = "#ffd24a";
const SKY = ["#2a1258", "#40197c", "#5c24a0", "#8433c0"]; // the sky, top to bottom (lighter colours = a brighter game)
const FAR_CITY = "#4c2690"; // the buildings far away
const NEAR_CITY = "#2b1458"; // the buildings close by
const NEAR_CITY_TOP = "#45238a"; // ...and their roof edge
const GROUND = "#2e1852"; // the floor you run on
const ROOF = "#1c0e36"; // the ceiling

// ---------- Pixel sprites ----------
// a weed leaf (7 x 7)
const LEAF_MAP = ["...G...", ".G.G.G.", "..GLG..", "GGLLLGG", "..GLG..", ".G.d.G.", "...d..."];
const LEAF_COLORS: Record<string, string> = { G: "#3ee05a", L: "#b6ff9e", d: "#1d6b2a" };
const LEAF_COLORS_DARK: Record<string, string> = { G: "#2c8a33", L: "#3ee05a", d: "#1d6b2a" };
// a piglet (11 x 8), looking to the left
const PIG_MAP = [".PP....PP..", "PPPPPPPPPP.", "PKPPPPPPPPc", "NNPPPPPPPP.", "NNPPPPPPPP.", ".PPPPPPPPP.", ".P.P..P.P..", ".A.A..A.A.."];
const PIG_COLORS: Record<string, string> = { P: "#ff8fb8", N: "#ff5f9a", K: "#111111", c: "#ff5f9a", A: "#8a3a5a" };

function buildMap(rows: string[], colors: Record<string, string>) {
  const cv = document.createElement("canvas");
  cv.width = rows[0].length;
  cv.height = rows.length;
  const g = cv.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colors[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}

// A simple drawn Pinkmane (only used when /game/pinkdude.png can't be loaded). step = his legs take a step.
function buildDude(step: boolean) {
  const cv = document.createElement("canvas");
  cv.width = SW;
  cv.height = SH;
  const g = cv.getContext("2d")!;
  const r = (c: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // pink spiky hair
  r("#d63cc8", 7, 2, 11, 6);
  r("#d63cc8", 8, 0, 2, 2);
  r("#d63cc8", 12, 0, 2, 2);
  r("#d63cc8", 16, 1, 2, 2);
  r("#d63cc8", 6, 4, 2, 5);
  // face (he looks to the right)
  r("#ffc800", 9, 7, 9, 6);
  r("#111111", 15, 9, 2, 2);
  // black tee + arm
  r("#111111", 7, 13, 11, 11);
  r("#ffc800", 17, 17, 3, 3);
  // grey pants + shoes
  r("#787878", 8, 24, 4, step ? 7 : 9);
  r("#787878", 13, 24, 4, step ? 9 : 7);
  r("#111111", 8, step ? 31 : 33, 5, 2);
  r("#111111", 13, step ? 33 : 31, 5, 2);
  return cv;
}

// Number noise, so the city looks the same every time
function hash(a: number, b: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

// Everything below has "x" in WORLD pixels (how far along the city it is). On screen it's drawn at x - scroll.
type Zapper = { x: number; y: number; len: number; ang: number; spin: number };
type Gem = { x: number; y: number; taken: boolean };
type Pig = { x: number; dir: number; dead: boolean };
// A rocket is on the SCREEN, not in the world: warn = the ! follows you, lock = the ! stops and blinks fast, fly = it's coming
type Rocket = { stage: "warn" | "lock" | "fly"; t: number; x: number; y: number };
type Leaf = { x: number; y: number; vx: number; vy: number; dark: boolean; wob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Popup = { x: number; y: number; text: string; life: number; color: string };
type Mode = "ready" | "running" | "dead";

export default function JetGame({ actionSignal, fontFamily, muted, touch = false, beatRef }: Props) {
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const beatSrc = useRef(beatRef);
  beatSrc.current = beatRef;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // what is being held down right now (any of them = the jetpack is on)
  const holdRef = useRef({ key: false, mouse: false, touch: false });
  // a fresh press (start / play again / resume)
  const pressRef = useRef<(() => void) | null>(null);
  // a short puff of the jetpack (for the OK / A button, which can only be tapped)
  const puffRef = useRef<(() => void) | null>(null);
  const lastSignal = useRef(actionSignal);

  // OK / A from the page = start, or a short puff while flying.
  // (SPACE also arrives here, but the game already handles the keyboard itself, so that one is skipped.)
  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    if (holdRef.current.key) return;
    pressRef.current?.();
    puffRef.current?.();
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const hold = holdRef.current;
    hold.key = hold.mouse = hold.touch = false;

    // ---------- sprites ----------
    const leafImg = [buildMap(LEAF_MAP, LEAF_COLORS), buildMap(LEAF_MAP, LEAF_COLORS_DARK)];
    const pigImg = buildMap(PIG_MAP, PIG_COLORS);
    const drawnDude = [buildDude(false), buildDude(true)];
    let dudeImg: HTMLImageElement | null = null;
    const img = new Image();
    img.onload = () => {
      if (img.width >= SW * 2 && img.height >= SH) dudeImg = img;
    };
    img.src = DUDE_IMAGE;

    // the beat of the song: 1 right on the beat, falling to 0. 0 = no music playing right now
    const beatKick = () => {
      const b = beatSrc.current?.current;
      return b && b.live ? Math.max(0, b.kick) : 0;
    };

    // ---------- sound ----------
    let ac: AudioContext | null = null;
    const tone = (f1: number, f2: number, dur: number, type: OscillatorType, vol = 0.08, delay = 0) => {
      if (mutedRef.current) return;
      try {
        if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (ac.state === "suspended") ac.resume();
        const t0 = ac.currentTime + delay;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(ac.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      } catch {}
    };
    const sfx = {
      start: () => {
        tone(330, 660, 0.1, "square", 0.05);
        tone(660, 990, 0.12, "square", 0.05, 0.1);
      },
      jet: () => tone(150 + Math.random() * 50, 80, 0.06, "sawtooth", 0.02),
      gem: () => tone(990, 1480, 0.08, "square", 0.045),
      pig: () => {
        tone(520, 260, 0.12, "sawtooth", 0.06); // oink
        tone(990, 1480, 0.08, "square", 0.04, 0.08);
      },
      warn: () => {
        tone(880, 880, 0.07, "square", 0.05);
        tone(880, 880, 0.07, "square", 0.05, 0.14);
      },
      launch: () => tone(700, 120, 0.35, "sawtooth", 0.06),
      zap: () => {
        tone(1400, 80, 0.3, "sawtooth", 0.1);
        tone(90, 40, 0.5, "square", 0.08, 0.05);
      },
      boom: () => {
        tone(200, 40, 0.5, "sawtooth", 0.12);
        tone(110, 30, 0.6, "square", 0.08, 0.04);
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
    const s = {
      mode: "ready" as Mode,
      t: 0, // seconds in this mode
      scroll: 0, // how far the world has moved (pixels)
      speed: START_SPEED,
      y: FLOOR - SH, // top of Pinkmane's picture
      vy: 0,
      rot: 0, // he spins when he's hit
      puff: 0, // seconds of jetpack left from a tap on OK / A
      leafT: 0,
      jetT: 0,
      gems: 0,
      score: 0,
      newBest: false,
      why: "", // what got you (shown on the game over screen)
      shake: 0,
      nextAt: SAFE_START, // where the next obstacle goes
      nextPig: 200,
      zaps: [] as Zapper[],
      gemList: [] as Gem[],
      pigs: [] as Pig[],
      rockets: [] as Rocket[],
      leaves: [] as Leaf[],
      parts: [] as Particle[],
      pops: [] as Popup[],
    };
    const meters = () => Math.floor(s.scroll / 10);
    const flying = () => s.mode === "running" && (hold.key || hold.mouse || hold.touch || s.puff > 0);

    const reset = () => {
      s.mode = "running";
      s.t = 0;
      s.scroll = 0;
      s.speed = START_SPEED;
      s.y = FLOOR - SH;
      s.vy = 0;
      s.rot = 0;
      s.puff = 0;
      s.leafT = 0;
      s.jetT = 0;
      s.gems = 0;
      s.score = 0;
      s.newBest = false;
      s.why = "";
      s.nextAt = SAFE_START;
      s.nextPig = 200;
      s.zaps = [];
      s.gemList = [];
      s.pigs = [];
      s.rockets = [];
      s.leaves = [];
      s.parts = [];
      s.pops = [];
      // a little line of gems to start with
      for (let i = 0; i < 8; i++) s.gemList.push({ x: 150 + i * 12, y: 80, taken: false });
      sfx.start();
    };

    pressRef.current = () => {
      if (pause.on) {
        pause.on = false;
        sfx.click();
        return;
      }
      if (s.mode === "ready") reset();
      else if (s.mode === "dead" && s.t > 0.8) reset(); // (wait a moment so you don't skip the game over screen by accident)
    };
    puffRef.current = () => {
      if (s.mode === "running") s.puff = 0.16;
    };

    const burst = (x: number, y: number, n: number, colors: string[], power = 90) => {
      for (let i = 0; i < n; i++)
        s.parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * power,
          vy: -Math.random() * power * 0.9 - 10,
          life: 0.4 + Math.random() * 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
    };

    // ---------- building the city ahead ----------
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const gemLine = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) s.gemList.push({ x: x + i * 11, y, taken: false });
    };
    const gemWave = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) s.gemList.push({ x: x + i * 11, y: y + Math.sin(i * 0.7) * 16, taken: false });
    };
    const gemBlock = (x: number, y: number) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) s.gemList.push({ x: x + c * 10, y: y + r * 10, taken: false });
    };
    const generate = (limit: number) => {
      while (s.nextAt < limit) {
        const x = s.nextAt;
        const m = x / 10;
        const gap = Math.max(GAP_MIN, GAP_START - m * 0.05) * rnd(0.85, 1.25);
        const r = Math.random();
        const rocketsOn = m > ROCKETS_FROM;
        if (rocketsOn && r < 0.2 && s.rockets.length < (m > 700 ? 2 : 1)) {
          // a rocket: the ! shows up at the right edge and follows you
          s.rockets.push({ stage: "warn", t: 0, x: W + 20, y: s.y + SH / 2 });
          sfx.warn();
        } else if (r < 0.42) {
          // just gems
          const kind = Math.random();
          if (kind < 0.4) gemLine(x, rnd(CEIL + 16, FLOOR - 16), 6 + Math.floor(Math.random() * 5));
          else if (kind < 0.75) gemWave(x, rnd(CEIL + 34, FLOOR - 34), 10);
          else gemBlock(x, rnd(CEIL + 14, FLOOR - 40));
        } else {
          // a zapper: flat, upright, slanted, or (later) spinning
          const kind = Math.random();
          let ang = 0;
          let spin = 0;
          let len = rnd(34, 50);
          if (m > SPIN_FROM && kind < 0.22) {
            spin = (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 2);
            len = rnd(32, 42);
          } else if (kind < 0.5) ang = 0;
          else if (kind < 0.78) {
            ang = Math.PI / 2;
            len = rnd(30, 44);
          } else ang = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 4);
          // (keep the whole bar between the ceiling and the ground, whichever way it points or spins)
          const reach = spin ? len / 2 : Math.abs(Math.sin(ang)) * (len / 2);
          const y = rnd(CEIL + 8 + reach, FLOOR - 8 - reach);
          s.zaps.push({ x: x + 30, y, len, ang, spin });
          // often some gems right after it, on the other half of the screen
          if (Math.random() < 0.5) {
            const mid = (CEIL + FLOOR) / 2;
            gemLine(x + 62, y < mid ? rnd(mid + 14, FLOOR - 14) : rnd(CEIL + 14, mid - 14), 5);
          }
        }
        s.nextAt += gap;
      }
      // piglets walking on the ground
      while (s.nextPig < limit) {
        s.pigs.push({ x: s.nextPig, dir: Math.random() < 0.7 ? -1 : 1, dead: false });
        s.nextPig += PIG_EVERY * rnd(0.6, 1.5);
      }
    };

    // the two ends of a zapper, on screen
    const zapEnds = (z: Zapper) => {
      const cx = z.x - s.scroll;
      const dx = Math.cos(z.ang) * (z.len / 2);
      const dy = Math.sin(z.ang) * (z.len / 2);
      return { ax: cx - dx, ay: z.y - dy, bx: cx + dx, by: z.y + dy };
    };

    const die = (why: string, boom: boolean) => {
      s.mode = "dead";
      s.t = 0;
      s.why = why;
      s.vy = -150;
      s.shake = 0.5;
      s.puff = 0;
      if (boom) sfx.boom();
      else sfx.zap();
      burst(PX + SW / 2, s.y + SH / 2, 22, boom ? ["#ffd24a", "#ff7a1a", "#e0301a", "#ffffff"] : ["#ffffff", "#ffe34a", PINK], 130);
      s.score = meters() + s.gems * 5;
      if (s.score > best) {
        best = s.score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
    };

    // ---------- input: keyboard ----------
    const FLY_KEYS = [" ", "ArrowUp", "w", "W"];
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      // ESC / P (or the PAUSE button on phones) = pause / resume, only while flying
      if (k === "Escape" || k === "p" || k === "P") {
        if (s.mode === "running") {
          pause.on = !pause.on;
          sfx.click();
        }
        return;
      }
      if (FLY_KEYS.includes(k)) {
        hold.key = true;
        pressRef.current?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (FLY_KEYS.includes(e.key)) hold.key = false;
    };
    const letGo = () => {
      hold.key = hold.mouse = hold.touch = false;
    };
    const onMouseUp = () => {
      hold.mouse = false;
    };
    // switching apps / tabs pauses the run and lets go of the jetpack
    const onHidden = () => {
      if (!document.hidden) return;
      letGo();
      if (s.mode === "running") pause.on = true;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onMouseUp);
    window.addEventListener("blur", letGo);
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

    // the night city: sky, stars, moon, two rows of buildings, the ceiling and the ground
    const drawCity = (t: number) => {
      const bh = Math.ceil((FLOOR - CEIL) / SKY.length);
      SKY.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, CEIL + i * bh, W, bh);
      });
      // stars + moon (they barely move)
      for (let i = 0; i < 28; i++) {
        if (Math.sin(t * 2 + i * 2.3) < -0.75) continue; // twinkle
        ctx.fillStyle = hash(i, 13) > 0.7 ? "#ffffff" : "#e8c8ff";
        ctx.fillRect(Math.round(mod(hash(i, 11) * W - s.scroll * 0.02, W)), Math.round(CEIL + 3 + hash(i, 12) * 58), 1, 1);
      }
      const mx = Math.round(mod(W * 0.8 - s.scroll * 0.02, W + 20)) - 10;
      ctx.fillStyle = "#ffe0f6";
      ctx.fillRect(mx - 4, 24, 8, 10);
      ctx.fillRect(mx - 5, 25, 10, 8);
      ctx.fillStyle = "#f0a8dc";
      ctx.fillRect(mx - 2, 27, 2, 2);
      ctx.fillRect(mx + 1, 30, 2, 1);
      // far buildings (move slowly)
      const off1 = s.scroll * 0.12;
      ctx.fillStyle = FAR_CITY;
      for (let b = Math.floor(off1 / 16); b * 16 - off1 < W; b++) {
        const h = 18 + hash(b, 5) * 36;
        ctx.fillRect(Math.round(b * 16 - off1), Math.round(FLOOR - h), 16, Math.ceil(h));
      }
      // near buildings with lit windows (the windows glow brighter on the beat)
      const off2 = s.scroll * 0.35;
      const glow = 0.75 + beatKick() * 0.25;
      for (let b = Math.floor(off2 / 26); b * 26 - off2 < W; b++) {
        if (hash(b, 10) < 0.18) continue; // a gap between two buildings
        const h = Math.round(30 + hash(b, 9) * 54);
        const x = Math.round(b * 26 - off2);
        const top = FLOOR - h;
        ctx.fillStyle = NEAR_CITY;
        ctx.fillRect(x, top, 24, h);
        ctx.fillStyle = NEAR_CITY_TOP;
        ctx.fillRect(x, top, 24, 2);
        ctx.globalAlpha = glow;
        for (let wy = top + 5; wy < FLOOR - 6; wy += 7)
          for (let wx = 3; wx < 20; wx += 6) {
            const n = hash(b * 31 + wx, wy - top);
            if (n < 0.55) continue;
            ctx.fillStyle = n > 0.85 ? YELLOW : PINK;
            ctx.fillRect(x + wx, wy, 3, 3);
          }
        ctx.globalAlpha = 1;
      }
      // the ceiling
      ctx.fillStyle = ROOF;
      ctx.fillRect(0, 0, W, CEIL);
      ctx.fillStyle = "#5a2c96";
      ctx.fillRect(0, CEIL - 3, W, 2);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, CEIL - 1, W, 1);
      // the ground
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, FLOOR, W, 1);
      ctx.fillStyle = "#4a2a80";
      ctx.fillRect(0, FLOOR + 1, W, 2);
      const off3 = mod(s.scroll, 20);
      for (let x = -off3; x < W; x += 20) {
        ctx.fillStyle = "#5a2c96";
        ctx.fillRect(Math.round(x), 3, 2, 2); // rivets on the ceiling
        ctx.fillStyle = "#1c0e36";
        ctx.fillRect(Math.round(x), FLOOR + 3, 1, H - FLOOR - 3); // lines between the floor tiles
        ctx.fillStyle = "#4a2a80";
        ctx.fillRect(Math.round(x) + 6, FLOOR + 8, 8, 1);
      }
    };

    const drawGem = (x: number, y: number, t: number) => {
      const size = 3 + (beatKick() > 0.5 ? 1 : 0); // the gems swell on every beat
      const cx = Math.round(x);
      const cy = Math.round(y + Math.sin(t * 5 + x * 0.05) * 1.5);
      for (let i = -size; i <= size; i++) {
        const hw = size - Math.abs(i);
        ctx.fillStyle = "#0b3d14";
        ctx.fillRect(cx - hw - 1, cy + i, hw * 2 + 3, 1);
      }
      for (let i = -size; i <= size; i++) {
        const hw = size - Math.abs(i);
        ctx.fillStyle = i < 0 ? "#b6ff9e" : "#3ee05a";
        ctx.fillRect(cx - hw, cy + i, hw * 2 + 1, 1);
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - 1, cy - 2, 1, 1);
    };

    const drawZapper = (z: Zapper, t: number) => {
      const e = zapEnds(z);
      const n = Math.ceil(z.len / 2);
      // the electric beam: a soft pink glow with a jumpy white / yellow line on top
      ctx.fillStyle = "rgba(255,95,210,0.28)";
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        ctx.fillRect(Math.round(e.ax + (e.bx - e.ax) * v) - 3, Math.round(e.ay + (e.by - e.ay) * v) - 3, 6, 6);
      }
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        const j = Math.floor(t * 30);
        const jx = (hash(i + j, 3) - 0.5) * 3;
        const jy = (hash(i + j, 4) - 0.5) * 3;
        ctx.fillStyle = (i + j) % 3 === 0 ? "#ffe34a" : "#ffffff";
        ctx.fillRect(Math.round(e.ax + (e.bx - e.ax) * v + jx) - 1, Math.round(e.ay + (e.by - e.ay) * v + jy) - 1, 2, 2);
      }
      // the two metal ends
      for (const [x, y] of [
        [e.ax, e.ay],
        [e.bx, e.by],
      ]) {
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
        ctx.fillStyle = "#9a9ab0";
        ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        ctx.fillStyle = Math.floor(t * 8) % 2 ? "#ffe34a" : PINK;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    };

    const drawRocket = (r: Rocket, t: number) => {
      if (r.stage !== "fly") {
        // the warning: a red ! at the right edge, at the height the rocket will come from
        const fast = r.stage === "lock";
        const on = Math.floor(t * (fast ? 16 : 6)) % 2 === 0;
        const y = Math.round(r.y);
        ctx.fillStyle = "#000";
        ctx.fillRect(W - 17, y - 8, 14, 16);
        ctx.fillStyle = on ? "#ff2a3c" : fast ? "#ffffff" : "#7a1420";
        ctx.fillRect(W - 16, y - 7, 12, 14);
        ctx.fillStyle = on ? "#ffffff" : "#ff2a3c";
        ctx.fillRect(W - 11, y - 5, 2, 6);
        ctx.fillRect(W - 11, y + 3, 2, 2);
        return;
      }
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      // flame + smoke behind it
      ctx.fillStyle = Math.floor(t * 20) % 2 ? "#ffd24a" : "#ff7a1a";
      ctx.fillRect(x + 15, y - 2, 4 + (Math.floor(t * 20) % 3), 4);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 22 + i * 7, y - 1 + Math.round(Math.sin(t * 9 + i) * 2), 3, 3);
      // the rocket (it flies to the left)
      ctx.fillStyle = "#111";
      ctx.fillRect(x + 1, y - 4, 15, 8);
      ctx.fillStyle = "#c8c8d8";
      ctx.fillRect(x + 3, y - 3, 12, 6);
      ctx.fillStyle = "#ff2a3c";
      ctx.fillRect(x, y - 2, 4, 4);
      ctx.fillRect(x + 12, y - 5, 3, 2);
      ctx.fillRect(x + 12, y + 3, 3, 2);
      ctx.fillStyle = "#8a8a9a";
      ctx.fillRect(x + 3, y + 1, 12, 2);
    };

    const drawPig = (p: Pig, t: number) => {
      const x = Math.round(p.x - s.scroll);
      const y = FLOOR - 8 - (Math.floor(t * 6 + p.x) % 2); // a tiny hop while it walks
      if (p.dir < 0) ctx.drawImage(pigImg, x, y);
      else {
        // walking to the right: the picture is flipped
        ctx.save();
        ctx.translate(x + 11, y);
        ctx.scale(-1, 1);
        ctx.drawImage(pigImg, 0, 0);
        ctx.restore();
      }
    };

    const drawPlayer = (t: number) => {
      const onGround = s.y >= FLOOR - SH - 0.5;
      // shadow on the ground (smaller the higher you are)
      const high = (FLOOR - SH - s.y) / (FLOOR - SH - CEIL);
      const shw = Math.round(9 - high * 5);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(PX + SW / 2 - shw, FLOOR - 1, shw * 2, 2);

      ctx.save();
      ctx.translate(PX + SW / 2, Math.round(s.y) + SH / 2);
      if (s.mode === "dead") ctx.rotate(s.rot);
      else if (!onGround) ctx.rotate(Math.max(-0.12, Math.min(0.16, s.vy / 1400))); // leans a little with the flight
      ctx.translate(-SW / 2, -SH / 2);

      // the jetpack on his back
      ctx.fillStyle = "#111";
      ctx.fillRect(1, 12, 8, 15);
      ctx.fillStyle = "#8a8a9a";
      ctx.fillRect(2, 13, 6, 13);
      ctx.fillStyle = "#c8c8d8";
      ctx.fillRect(2, 13, 2, 13);
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(2, 17, 6, 3); // green stripe: it runs on weed
      ctx.fillStyle = "#111";
      ctx.fillRect(3, 27, 4, 2); // the nozzle
      if (flying()) {
        // a little green + yellow flash where the leaves come out
        ctx.fillStyle = Math.floor(t * 24) % 2 ? "#b6ff9e" : "#ffe34a";
        ctx.fillRect(2, 29, 6, 2 + (Math.floor(t * 24) % 3));
      }

      // Pinkmane: running on the ground, legs still in the air
      const frame = s.mode === "running" && onGround ? Math.floor(s.scroll / 9) % 2 : 0;
      if (dudeImg) {
        // each frame in the picture is 24 x 35 (the picture can hold more than 2 of them, only the first 2 are used)
        ctx.drawImage(dudeImg, frame * SW, 0, SW, SH, 0, 0, SW, SH);
      } else ctx.drawImage(drawnDude[frame], 0, 0);
      ctx.restore();
    };

    const drawHud = () => {
      text(`${meters()}M`, 4, 15, GREEN, 8, "left");
      const gx = W - 12;
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(gx + 2, 15, 3, 1);
      ctx.fillRect(gx + 1, 16, 5, 2);
      ctx.fillRect(gx + 2, 18, 3, 2);
      ctx.fillRect(gx + 3, 20, 1, 2);
      text(String(s.gems), gx - 2, 15, GREEN, 8, "right");
      if (best > 0) text(`BEST ${best}`, W / 2, 15, "#b48ad0");
      // how to play, during the first seconds of a run
      if (s.t < 4.5 && meters() < 60) {
        ctx.globalAlpha = Math.min(1, (4.5 - s.t) / 0.8);
        text(touchRef.current ? "HOLD THE SCREEN = FLY UP" : "HOLD SPACE = FLY UP", W / 2, 44, "#ffffff");
        text("LET GO = FALL", W / 2, 56, "#d8a8ff");
        ctx.globalAlpha = 1;
      }
    };

    // ---------- the game loop ----------
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let pauseClock = 0;

    const step = (dt: number) => {
      clock += dt;
      s.t += dt;
      if (s.puff > 0) s.puff -= dt;
      if (s.shake > 0) s.shake -= dt;
      const floorY = FLOOR - SH;

      if (s.mode === "running") {
        s.speed = Math.min(MAX_SPEED, START_SPEED + (s.scroll / 10) * SPEED_GAIN);
        s.scroll += s.speed * dt;

        // the jetpack
        const on = flying();
        s.vy += (on ? -THRUST : GRAVITY) * dt;
        s.vy = Math.max(-MAX_UP, Math.min(MAX_DOWN, s.vy));
        s.y += s.vy * dt;
        if (s.y < CEIL) {
          s.y = CEIL;
          s.vy = Math.max(0, s.vy);
        }
        if (s.y > floorY) {
          s.y = floorY;
          s.vy = Math.min(0, s.vy);
        }
        // ...shoots weed leaves downwards
        if (on) {
          s.leafT -= dt;
          while (s.leafT <= 0) {
            s.leafT += LEAF_EVERY;
            if (s.leaves.length < 140)
              s.leaves.push({
                x: PX + 5 + (Math.random() - 0.5) * 3,
                y: s.y + 29,
                vx: -s.speed * 0.3 + (Math.random() - 0.5) * 50,
                vy: LEAF_FALL + Math.random() * 60,
                dark: Math.random() < 0.35,
                wob: Math.random() * 6,
              });
          }
          s.jetT -= dt;
          if (s.jetT <= 0) {
            s.jetT = 0.09;
            sfx.jet();
          }
        } else s.leafT = 0;

        generate(s.scroll + W + 40);

        // the part of Pinkmane that can be hit
        const hx = PX + HB.x;
        const hy = s.y + HB.y;

        // zappers
        for (const z of s.zaps) {
          if (z.spin) z.ang += z.spin * dt;
          const cx = z.x - s.scroll;
          if (cx < PX - 40 || cx > PX + SW + 40) continue;
          const e = zapEnds(z);
          const n = Math.ceil(z.len / 3);
          for (let i = 0; i <= n; i++) {
            const x = e.ax + ((e.bx - e.ax) * i) / n;
            const y = e.ay + ((e.by - e.ay) * i) / n;
            if (x > hx - 2 && x < hx + HB.w + 2 && y > hy - 2 && y < hy + HB.h + 2) {
              die("ZAPPED!", false);
              break;
            }
          }
          if (s.mode !== "running") break;
        }

        // gems
        for (const g of s.gemList) {
          if (g.taken) continue;
          const x = g.x - s.scroll;
          if (x > hx - 7 && x < hx + HB.w + 7 && g.y > hy - 6 && g.y < hy + HB.h + 6) {
            g.taken = true;
            s.gems++;
            sfx.gem();
            burst(x, g.y, 4, ["#b6ff9e", "#3ee05a", "#fff"], 60);
          }
        }

        s.score = meters() + s.gems * 5;
      } else if (s.mode === "dead") {
        // he tumbles to the ground and the world slows to a stop
        s.speed *= Math.max(0, 1 - dt * 2.2);
        s.scroll += s.speed * dt;
        s.vy = Math.min(MAX_DOWN * 1.4, s.vy + GRAVITY * dt);
        s.y += s.vy * dt;
        if (s.y >= floorY) {
          s.y = floorY;
          s.vy = s.vy > 70 ? -s.vy * 0.35 : 0;
        } else s.rot += dt * 9;
        if (s.y >= floorY && s.vy === 0) s.rot = Math.PI / 2; // lying on the ground
      }

      // rockets (they keep flying on the game over screen too)
      const hx = PX + HB.x;
      const hy = s.y + HB.y;
      for (const r of s.rockets) {
        r.t += dt;
        if (r.stage === "warn") {
          r.y += (s.y + SH / 2 - r.y) * Math.min(1, dt * 4); // the ! follows you
          r.y = Math.max(CEIL + 9, Math.min(FLOOR - 9, r.y));
          if (r.t > ROCKET_WARN || s.mode !== "running") {
            r.stage = "lock";
            r.t = 0;
          }
        } else if (r.stage === "lock") {
          if (r.t > 0.35) {
            r.stage = "fly";
            r.t = 0;
            r.x = W + 10;
            sfx.launch();
          }
        } else {
          r.x -= (s.speed + ROCKET_SPEED) * dt;
          if (s.mode === "running" && r.x < hx + HB.w && r.x + 16 > hx && r.y + 3 > hy && r.y - 3 < hy + HB.h) {
            r.x = -99;
            die("BOOM!", true);
          }
        }
      }
      s.rockets = s.rockets.filter((r) => r.stage !== "fly" || r.x > -40);

      // piglets walk along the ground
      for (const p of s.pigs) p.x += p.dir * 16 * dt;

      // weed leaves fall, flutter a little, and pop piglets
      for (const l of s.leaves) {
        l.x += (l.vx + Math.sin(clock * 12 + l.wob) * 26) * dt;
        l.y += l.vy * dt;
        if (l.y < FLOOR - 13) continue;
        for (const p of s.pigs) {
          const px = p.x - s.scroll;
          if (p.dead || l.x < px - 4 || l.x > px + 14) continue;
          p.dead = true;
          l.y = 999;
          sfx.pig();
          burst(px + 5, FLOOR - 5, 12, ["#ff8fb8", "#ff5f9a", "#3ee05a", "#ffffff"], 80);
          if (s.mode === "running") {
            s.gems += PIG_GEMS;
            s.pops.push({ x: px + 5, y: FLOOR - 22, text: `+${PIG_GEMS}`, life: 0.9, color: GREEN });
          }
          break;
        }
        if (l.y >= FLOOR - 4 && l.y < 900 && Math.random() < 0.3)
          s.parts.push({ x: l.x, y: FLOOR - 2, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30, life: 0.25, color: "#3ee05a" });
      }
      s.leaves = s.leaves.filter((l) => l.y < FLOOR - 4);

      // forget things behind us
      s.zaps = s.zaps.filter((z) => z.x > s.scroll - 60);
      s.gemList = s.gemList.filter((g) => !g.taken && g.x > s.scroll - 20);
      s.pigs = s.pigs.filter((p) => !p.dead && p.x > s.scroll - 30);

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const p of s.pops) {
        p.y -= 18 * dt;
        p.life -= dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);
    };

    const render = () => {
      const t = clock;
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
      drawCity(t);
      for (const g of s.gemList) {
        const x = g.x - s.scroll;
        if (x > -8 && x < W + 8) drawGem(x, g.y, t);
      }
      for (const z of s.zaps) {
        const x = z.x - s.scroll;
        if (x > -40 && x < W + 40) drawZapper(z, t);
      }
      for (const p of s.pigs) {
        const x = p.x - s.scroll;
        if (x > -14 && x < W + 4) drawPig(p, t);
      }
      for (const l of s.leaves) ctx.drawImage(leafImg[l.dark ? 1 : 0], Math.round(l.x) - 3, Math.round(l.y) - 3);
      drawPlayer(t);
      for (const r of s.rockets) drawRocket(r, t);
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      for (const p of s.pops) text(p.text, p.x, p.y, p.color);
      if (s.mode === "running") drawHud();

      if (s.mode === "ready") {
        ctx.fillStyle = "rgba(14,4,24,0.6)";
        ctx.fillRect(0, 0, W, H);
        text(GAME_TITLE, W / 2, 18 - Math.round(beatKick() * 2), PINK, 16); // (bounces to the music)
        text("DEMO", W / 2, 38, YELLOW);
        ctx.drawImage(leafImg[0], W / 2 - 60, 53, 14, 14);
        ctx.drawImage(leafImg[0], W / 2 + 46, 53, 14, 14);
        text("WEED POWERED", W / 2, 56, GREEN);
        text(touchRef.current ? "HOLD THE SCREEN TO FLY" : "HOLD SPACE TO FLY", W / 2, 76, "#ffffff");
        text("DODGE ZAPPERS + ROCKETS", W / 2, 88, "#d8a8ff");
        if (Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP TO START" : "SPACE = START", W / 2, 106, GREEN);
        if (best > 0) text(`BEST ${best}`, W / 2, 122, "#b48ad0");
      }

      if (s.mode === "dead") {
        ctx.fillStyle = `rgba(14,4,24,${Math.min(0.72, s.t * 1.2)})`;
        ctx.fillRect(0, 0, W, H);
        if (s.t > 0.4) {
          text(s.why, W / 2, 22, PINK, 16);
          text(`SCORE ${s.score}`, W / 2, 52, GREEN);
          text(s.newBest ? "NEW BEST!" : `BEST ${best}`, W / 2, 64, s.newBest ? PINK : "#b48ad0");
          text(`${meters()}M  ${s.gems} GEMS`, W / 2, 80, "#d8a8ff");
          if (s.t > 0.8 && Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP = AGAIN" : "SPACE = AGAIN", W / 2, 104, GREEN);
        }
      }

      if (pause.on) {
        ctx.fillStyle = "rgba(14,4,24,0.75)";
        ctx.fillRect(0, 0, W, H);
        text("PAUSED", W / 2, 40, PINK, 16);
        text(`${meters()}M  ${s.gems} GEMS`, W / 2, 70, "#d8a8ff");
        if (Math.floor(pauseClock * 2) % 2 === 0) text(touchRef.current ? "TAP = RESUME" : "SPACE / ESC = RESUME", W / 2, 92, GREEN);
      }
    };

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
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", onMouseUp);
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onHidden);
      pressRef.current = null;
      puffRef.current = null;
      letGo();
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily]);

  // ---------- touch: hold a finger down to fly ----------
  // PHONES (touch = true): hold ANYWHERE on the screen (the page's small EXIT / PAUSE / music buttons still work).
  //   Other touch screens: the finger has to start on the game picture (or just next to it).
  useEffect(() => {
    // touches on buttons, sliders and links are left alone
    const onUi = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, [role='button'], [role='slider']");
    const fingers = new Set<number>();

    const start = (e: TouchEvent) => {
      if (onUi(e.target)) return;
      const t = e.changedTouches[0];
      if (!touchRef.current) {
        const r = canvasRef.current?.getBoundingClientRect();
        const M = 40;
        if (!r || t.clientX < r.left - M || t.clientX > r.right + M || t.clientY < r.top - M || t.clientY > r.bottom + M) return;
      }
      for (let i = 0; i < e.changedTouches.length; i++) fingers.add(e.changedTouches[i].identifier);
      holdRef.current.touch = true;
      pressRef.current?.();
      if (e.cancelable) e.preventDefault(); // no double-tap zoom / long-press menu
    };
    const move = (e: TouchEvent) => {
      if (fingers.size && e.cancelable) e.preventDefault(); // don't scroll the page while flying
    };
    const end = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) fingers.delete(e.changedTouches[i].identifier);
      if (e.touches.length === 0) fingers.clear();
      holdRef.current.touch = fingers.size > 0;
    };

    window.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      // COMPUTER mouse: hold the button down on the game picture = fly (touch is handled above)
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        e.stopPropagation();
        holdRef.current.mouse = true;
        pressRef.current?.();
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "#2a1258",
        touchAction: "none",
        cursor: "pointer",
      }}
    />
  );
}
