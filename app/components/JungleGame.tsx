"use client";

import { useEffect, useRef } from "react";

// PINK JUNGLE: an endless 3-lane jungle runner. Pinkmane runs down an old mossy temple path
// and BEARMANPIG (half bear, half pig, half man) chases him.
//   ← → (or A / D, click wheel, swipe)  = change lane
//   ↑ / W / SPACE / OK (or swipe up)     = jump
//   ↓ / S (or swipe down)                = slide
// Hit something once = you stumble and BEARMANPIG catches up. Stumble again while he's close = he gets you.
// Every 1000 score the world changes: GREEN JUNGLE -> ORANGE JUNGLE -> BLUE GRASS (no trees, tall grass) -> green again...
// The game is drawn wide (like PINKMANE VOID), so it fills the PINKMANE handheld screen.

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= start / jump)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

// The name of the game on its start screen (the menu on the iPod has its own copy in page.tsx)
const GAME_TITLE = "PINK JUNGLE";
// Where the best score is saved in the browser
const BEST_KEY = "pinkmane-jungle-best";

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const START_SPEED = 6.5; // how fast you run at the start (meters per second)
const MAX_EXTRA_SPEED = 9.5; // how much faster it can get
const SPEED_RAMP = 200; // meters it takes to get +1 speed (bigger = slower ramp = easier)
const SAFE_START = 45; // first meters with no obstacles at all
const CHASE_DECAY = 0.065; // how fast BEARMANPIG falls back after a stumble (bigger = easier)
const CHASE_DEADLY = 0.3; // stumble while he's closer than this = caught
const START_PIXELS = 4; // how chunky the picture is at the start (it sharpens to 1 in the first seconds)
const ZONE_SCORE = 1000; // every this many points the background changes to the next world

// ---------- Screen + camera ----------
// wide picture, the same shape as the handheld screen (64 : 30)
const W = 320;
const H = 150;
const HOR = 46; // horizon line
const F = 196; // focal length (how "zoomed in" the 3D is)
const PZ = 3; // how far in front of the camera the player runs
const LANE = 0.8; // distance between lanes (world units)
const PATHW = 1.25; // half the width of the stone path
const FAR = 42; // how far you can see
const FH = H - HOR;

// ---------- Colours (green theme) ----------
const GREEN = "#7dff6a";
const GREEN_DARK = "#1d6b2a";
const PINK = "#ff5fd2";
const BRICKS: [number, number, number][] = [
  [78, 98, 72],
  [88, 110, 78],
  [68, 88, 64],
  [96, 120, 84],
];
const MORTAR: [number, number, number] = [34, 50, 32];
const EDGE: [number, number, number] = [52, 70, 48];
const EDGE_DARK: [number, number, number] = [40, 56, 38];

// ---------- The 3 worlds (the background changes every ZONE_SCORE points) ----------
// name      = the text that pops up when you get there
// fog       = the colour far away
// ground    = 4 colours for the ground next to the path
// sky       = 4 colour bands of the sky, top to bottom
// far       = the dark line of trees / hills at the horizon
// canopy    = the leaves hanging from the top of the screen (canopyAmt 0 = open sky with stars)
// leaves    = 4 colours for the tree leaves (or the tall grass), dark to light
// vine      = hanging vines + moss on the pillars (dark, light)
// side      = "trees" or "grass" (tall grass instead of trees)
type RGB = [number, number, number];
type Theme = {
  name: string;
  title: string;
  fog: RGB;
  ground: RGB[];
  sky: RGB[];
  far: RGB;
  canopy: RGB;
  canopyAmt: number;
  leaves: string[];
  vine: string;
  vineLight: string;
  firefly: string;
  side: "trees" | "grass";
};
const THEMES: Theme[] = [
  {
    name: "GREEN JUNGLE",
    title: "#7dff6a",
    fog: [12, 40, 22],
    ground: [
      [20, 62, 28],
      [26, 76, 34],
      [16, 52, 24],
      [34, 92, 40],
    ],
    sky: [
      [5, 20, 10],
      [8, 32, 15],
      [11, 42, 20],
      [12, 48, 24],
    ],
    far: [14, 53, 25],
    canopy: [4, 17, 10],
    canopyAmt: 1,
    leaves: ["#0f3a17", "#17521f", "#1f6b28", "#2c8a33"],
    vine: "#1f6b28",
    vineLight: "#2c8a33",
    firefly: "#d8ff6a",
    side: "trees",
  },
  {
    name: "ORANGE JUNGLE",
    title: "#ffa23a",
    fog: [52, 24, 8],
    ground: [
      [92, 44, 12],
      [112, 56, 16],
      [78, 36, 10],
      [138, 72, 20],
    ],
    sky: [
      [26, 10, 4],
      [42, 18, 6],
      [58, 26, 8],
      [72, 34, 10],
    ],
    far: [70, 30, 8],
    canopy: [22, 9, 3],
    canopyAmt: 1,
    leaves: ["#5a2408", "#8a3a0c", "#c2560f", "#f08a1c"],
    vine: "#a8480e",
    vineLight: "#e07a1a",
    firefly: "#ffd36a",
    side: "trees",
  },
  {
    name: "BLUE GRASS",
    title: "#6ab4ff",
    fog: [8, 18, 46],
    ground: [
      [14, 34, 78],
      [18, 44, 98],
      [12, 28, 64],
      [26, 62, 128],
    ],
    sky: [
      [3, 8, 24],
      [6, 16, 38],
      [10, 24, 54],
      [12, 32, 70],
    ],
    far: [10, 26, 64],
    canopy: [3, 8, 24],
    canopyAmt: 0,
    leaves: ["#0f2a5a", "#17408a", "#1f5cc2", "#4a8cf0"],
    vine: "#1f5cc2",
    vineLight: "#4a8cf0",
    firefly: "#a8d8ff",
    side: "grass",
  },
];

// ---------- Pixel sprites ----------
// Only the LEFT half is drawn here, the right half is mirrored automatically.
// Pinkmane seen from behind (pink spiky hair, black tee, grey pants)
const DUDE_HALF = [
  "....B.",
  "..B.BB",
  ".BBBBB",
  "ABBBBB",
  "ABBBBB",
  ".ABBBB",
  "..AFFF",
  ".AAAAA",
  "AAAAAA",
  "FAAADA",
  "FAAAAA",
  ".AAAAA",
  "..AKKK",
  "..AKKA",
  "..AKKA",
  "..AKKA",
  "..AKKA",
  "..AAAA",
];
const DUDE_COLORS: Record<string, string> = {
  A: "#111111",
  B: "#d63cc8",
  D: "#8a1f86",
  F: "#ffc800",
  K: "#787878",
};
const DUDE_LEGS = 13; // row where the legs start (they move when running)

// BEARMANPIG from behind: bear ears + fur, a dirty tank top and jeans (the man part), a curly pig tail
const BMP_HALF = [
  "..AA.....",
  ".ANNA....",
  ".ANNNAAAA",
  "..ANNNNNN",
  "..ANNNNNN",
  "..ANNMNNN",
  "...ANNNNN",
  ".AANNNNNN",
  "ANNNAWWWW",
  "ANNAWWWWW",
  "ANNAWWWWW",
  "ANNAWWwWW",
  "ANNAWWWWW",
  "CNNAJJJJJ",
  ".C.AJJJJJ",
  "...AJJJJA",
  "...AJJJJA",
  "...AjJJJA",
  "...AJJJJA",
  "...ANNNNA",
  "..ANNNNNA",
  "..AAAAAA.",
];
const BMP_COLORS: Record<string, string> = {
  A: "#111111",
  N: "#6b3d1f",
  M: "#8a5530",
  W: "#e6e2cc",
  w: "#b8b08a",
  J: "#3a5fa8",
  j: "#2b4680",
  C: "#f2f2f2",
};
const BMP_LEGS = 15;
// the curly pig tail (drawn on top, not mirrored)
const BMP_TAIL: [number, number][] = [
  [9, 12],
  [10, 12],
  [11, 11],
  [11, 10],
  [10, 10],
];

// BEARMANPIG's face (front), for the start and game over screens
const FACE_HALF = [
  "AA......",
  "APA.....",
  "ANNAAAAA",
  "ANNNNNNN",
  ".ANNNNNN",
  ".ANNNNNN",
  ".ANRRNNN",
  ".ANRANNN",
  ".ANNNPPP",
  ".ANNPPAP",
  ".ANNPPAP",
  ".ANNNPPP",
  "..ANNNNN",
  "..ANWAAA",
  "...ANNNN",
  "....AAAA",
];
const FACE_COLORS: Record<string, string> = {
  A: "#111111",
  N: "#6b3d1f",
  P: "#ff8fb8",
  R: "#ff2a2a",
  W: "#f2f2f2",
};

// Builds a mirrored sprite. legShift: 0 = standing, 1 = left leg up, 2 = right leg up
function buildSprite(
  half: string[],
  colors: Record<string, string>,
  legStart: number,
  legShift: 0 | 1 | 2,
  extra?: { px: [number, number][]; color: string }
) {
  const w = half[0].length * 2;
  const h = half.length;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const put = (x: number, y: number, ch: string) => {
    const col = colors[ch];
    if (!col) return;
    let yy = y;
    if (y >= legStart) {
      if (legShift === 1 && x < w / 2) yy -= 2;
      if (legShift === 2 && x >= w / 2) yy -= 2;
    }
    g.fillStyle = col;
    g.fillRect(x, yy, 1, 1);
  };
  half.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      put(x, y, row[x]);
      put(w - 1 - x, y, row[x]);
    }
  });
  if (extra) {
    g.fillStyle = extra.color;
    extra.px.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }
  return cv;
}

// A small seeded random, so the jungle trees look the same every time
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Number noise used for the stone bricks and the moss
function hash(a: number, b: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A jungle tree (24 x 48 pixels). greens = 4 leaf colours (dark to light), vine = the hanging vines
function buildTree(seed: number, greens: string[], vine: string) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 24;
  cv.height = 48;
  const g = cv.getContext("2d")!;
  // trunk
  g.fillStyle = "#111";
  g.fillRect(9, 18, 6, 30);
  g.fillStyle = "#4a2e17";
  g.fillRect(10, 18, 4, 30);
  g.fillStyle = "#6a4423";
  for (let y = 20; y < 48; y += 4) g.fillRect(10 + ((y / 4) % 2), y, 2, 1);
  // leafy blobs
  for (let i = 0; i < 14; i++) {
    const cx = 4 + r() * 16;
    const cy = 3 + r() * 18;
    const rad = 3 + r() * 4;
    const col = greens[Math.floor(r() * greens.length)];
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y > rad * rad) continue;
        const px = Math.round(cx + x);
        const py = Math.round(cy + y);
        if (px < 0 || px >= 24 || py < 0 || py >= 30) continue;
        g.fillStyle = y < -rad / 2 && col !== greens[3] ? greens[Math.min(3, greens.indexOf(col) + 1)] : col;
        g.fillRect(px, py, 1, 1);
      }
  }
  // hanging vines
  g.fillStyle = vine;
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(r() * 18);
    const len = 6 + Math.floor(r() * 12);
    for (let y = 18; y < 18 + len; y++) g.fillRect(x + (y % 5 === 0 ? 1 : 0), y, 1, 1);
  }
  return cv;
}

// A clump of tall grass (28 x 22 pixels), used instead of trees in the BLUE GRASS world
function buildGrass(seed: number, colors: string[]) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 28;
  cv.height = 22;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 26; i++) {
    const x = 2 + r() * 24;
    const h = 9 + r() * 13;
    const lean = (r() - 0.5) * 7;
    const base = Math.floor(r() * 3); // darker blades at the back, lighter at the front
    for (let y = 0; y < h; y++) {
      const v = y / h; // 0 at the ground .. 1 at the tip
      const px = Math.round(x + lean * v * v);
      g.fillStyle = colors[Math.min(3, base + (v > 0.7 ? 1 : 0))];
      g.fillRect(px, 21 - y, v < 0.55 ? 2 : 1, 1);
    }
  }
  return cv;
}

// An old temple pillar with moss (12 x 36 pixels)
function buildPillar(seed: number, moss: string, mossDark: string) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 12;
  cv.height = 36;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, 12, 36);
  const stones = ["#5d6e57", "#6b7d63", "#53634e"];
  for (let y = 1; y < 35; y += 5) {
    const off = (y / 5) % 2 ? 0 : 3;
    for (let x = 1 - off; x < 11; x += 6) {
      g.fillStyle = stones[Math.floor(r() * 3)];
      g.fillRect(Math.max(1, x), y, Math.min(5, 11 - Math.max(1, x)), 4);
    }
  }
  // moss on top + dripping down
  g.fillStyle = moss;
  g.fillRect(0, 0, 12, 3);
  for (let x = 0; x < 12; x++) {
    const len = Math.floor(r() * 9);
    g.fillRect(x, 3, 1, len);
  }
  g.fillStyle = mossDark;
  for (let x = 0; x < 12; x += 2) g.fillRect(x, 3, 1, Math.floor(r() * 5));
  return cv;
}

type Obstacle = { at: number; kind: "rock" | "root" | "branch"; lanes: number[]; hit: boolean };
type Gem = { at: number; lane: number; taken: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Popup = { x: number; y: number; text: string; life: number; color: string };
type Mode = "ready" | "running" | "caught";

export default function JungleGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // what the input handlers ask the game loop to do
  const inputRef = useRef<((a: "left" | "right" | "jump" | "slide" | "go") => void) | null>(null);
  const lastSignal = useRef(actionSignal);

  // OK / Enter / Space from the page = start, or jump while running
  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    inputRef.current?.("go");
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // ---------- sprites ----------
    const dude = [buildSprite(DUDE_HALF, DUDE_COLORS, DUDE_LEGS, 1), buildSprite(DUDE_HALF, DUDE_COLORS, DUDE_LEGS, 2)];
    const dudeStand = buildSprite(DUDE_HALF, DUDE_COLORS, DUDE_LEGS, 0);
    const tail = { px: BMP_TAIL, color: "#ff8fb8" };
    const bmp = [buildSprite(BMP_HALF, BMP_COLORS, BMP_LEGS, 1, tail), buildSprite(BMP_HALF, BMP_COLORS, BMP_LEGS, 2, tail)];
    const face = buildSprite(FACE_HALF, FACE_COLORS, 99, 0);
    // one set of trees (or tall grass) and pillars for each world
    const trees = THEMES.map((th) =>
      [7, 21, 99].map((seed) => (th.side === "grass" ? buildGrass(seed, th.leaves) : buildTree(seed, th.leaves, th.vineLight)))
    );
    const pillars = THEMES.map((th) => [buildPillar(3, th.vineLight, th.vine), buildPillar(11, th.vineLight, th.vine)]);

    // small canvas used for the "pixelated at the start" effect
    const pix = document.createElement("canvas");
    const pctx = pix.getContext("2d")!;

    const floor = ctx.createImageData(W, FH);
    const floor32 = new Uint32Array(floor.data.buffer);

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
      gem: () => tone(990, 1480, 0.08, "square", 0.05),
      jump: () => tone(260, 620, 0.14, "square", 0.05),
      slide: () => tone(500, 160, 0.16, "triangle", 0.07),
      lane: () => tone(420, 380, 0.04, "square", 0.025),
      stumble: () => {
        tone(160, 60, 0.25, "sawtooth", 0.09);
        tone(420, 260, 0.12, "sawtooth", 0.06, 0.05); // oink
      },
      caught: () => {
        tone(480, 240, 0.16, "sawtooth", 0.09); // OINK
        tone(440, 220, 0.16, "sawtooth", 0.09, 0.2);
        tone(90, 45, 0.7, "sawtooth", 0.12, 0.1); // bear roar
      },
      start: () => {
        tone(330, 660, 0.1, "square", 0.05);
        tone(660, 990, 0.12, "square", 0.05, 0.1);
      },
      zone: () => {
        tone(520, 780, 0.1, "square", 0.05);
        tone(780, 1040, 0.1, "square", 0.05, 0.1);
        tone(1040, 1560, 0.16, "square", 0.05, 0.2);
      },
    };

    // ---------- best score ----------
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- game state ----------
    const s = {
      mode: "ready" as Mode,
      t: 0, // time in this mode
      dist: 0,
      speedMul: 1,
      lane: 0,
      px: 0, // player x in world units
      jumpY: 0,
      vy: 0,
      slide: 0, // seconds of slide left
      chase: 0.7, // how close BEARMANPIG is (0 = far away, 1 = right behind you)
      chaseVis: 0.7,
      mx: 0, // BEARMANPIG x (follows you a bit late)
      invuln: 0,
      shake: 0,
      gems: 0,
      score: 0,
      nextAt: SAFE_START,
      obs: [] as Obstacle[],
      gemList: [] as Gem[],
      parts: [] as Particle[],
      pops: [] as Popup[],
      curve: 0,
      newBest: false,
      zone: 0, // how many times the world has changed in this run
      // where each world starts (distance) and which one it is. The new world comes towards you from the horizon.
      zones: [{ from: -1e9, theme: 0 }] as { from: number; theme: number }[],
    };

    const reset = () => {
      s.mode = "running";
      s.t = 0;
      s.dist = 0;
      s.speedMul = 1;
      s.lane = 0;
      s.px = 0;
      s.jumpY = 0;
      s.vy = 0;
      s.slide = 0;
      s.chase = 0.7;
      s.mx = 0;
      s.invuln = 0;
      s.gems = 0;
      s.score = 0;
      s.nextAt = SAFE_START;
      s.obs = [];
      s.gemList = [];
      s.parts = [];
      s.pops = [];
      s.newBest = false;
      s.zone = 0;
      s.zones = [{ from: -1e9, theme: 0 }];
      // a little line of gems to start with
      for (let i = 0; i < 8; i++) s.gemList.push({ at: 14 + i * 1.6, lane: 0, taken: false });
      sfx.start();
    };

    const speed = () => (START_SPEED + Math.min(MAX_EXTRA_SPEED, s.dist / SPEED_RAMP)) * s.speedMul;
    const rndLane = () => Math.floor(Math.random() * 3) - 1;

    // Builds the path ahead. The farther you are, the more kinds of obstacles and the closer together.
    const generate = (limit: number) => {
      while (s.nextAt < limit) {
        const d = s.nextAt;
        const tier = d < 250 ? 1 : d < 550 ? 2 : d < 900 ? 3 : 4;
        const gap = Math.max(6.5, 15 - d / 110);
        const r = Math.random();
        let kind: Obstacle["kind"] = "rock";
        let lanes: number[] = [];
        if (tier === 1) kind = "rock";
        else if (tier === 2) kind = r < 0.65 ? "rock" : "root";
        else if (tier === 3) kind = r < 0.45 ? "rock" : r < 0.72 ? "root" : "branch";
        else kind = r < 0.5 ? "rock" : r < 0.75 ? "root" : "branch";
        if (kind === "rock") {
          // from tier 3 on, sometimes two lanes are blocked
          if (tier >= 3 && Math.random() < (tier === 4 ? 0.55 : 0.3)) {
            const free = rndLane();
            lanes = [-1, 0, 1].filter((l) => l !== free);
          } else lanes = [rndLane()];
        } else lanes = [-1, 0, 1];
        s.obs.push({ at: d, kind, lanes, hit: false });

        // gems after the obstacle, in a lane that's free
        if (Math.random() < 0.7) {
          const free = [-1, 0, 1].filter((l) => !lanes.includes(l) || kind !== "rock");
          const lane = free[Math.floor(Math.random() * free.length)];
          const n = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) {
            const at = d + 2 + i * 1.2;
            if (at < d + gap * 0.85 - 1.5) s.gemList.push({ at, lane, taken: false });
          }
        }
        s.nextAt += gap * (0.85 + Math.random() * 0.4);
      }
    };

    const playerScreen = () => ({ x: W / 2 + (s.px * F) / PZ, y: HOR + F / PZ });

    const burst = (x: number, y: number, n: number, colors: string[]) => {
      for (let i = 0; i < n; i++)
        s.parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 90,
          vy: -Math.random() * 80 - 10,
          life: 0.4 + Math.random() * 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
    };

    const stumble = (o: Obstacle) => {
      o.hit = true;
      if (s.invuln > 0) return;
      const p = playerScreen();
      if (o.kind === "rock") burst(p.x, p.y - 10, 14, ["#6b7d63", "#53634e", "#2c8a33"]);
      else burst(p.x, p.y - 10, 12, ["#6a4423", "#4a2e17", "#2c8a33"]);
      if (s.chase > CHASE_DEADLY) {
        caught();
        return;
      }
      sfx.stumble();
      s.chase = Math.min(1, s.chase + 0.65);
      s.speedMul = 0.55;
      s.invuln = 1.1;
      s.shake = 0.3;
      s.pops.push({ x: p.x, y: p.y - 46, text: "OINK!", life: 0.9, color: PINK });
    };

    const caught = () => {
      sfx.caught();
      s.mode = "caught";
      s.t = 0;
      s.shake = 0.5;
      s.score = Math.floor(s.dist) + s.gems * 5;
      if (s.score > best) {
        best = s.score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
    };

    // ---------- input ----------
    inputRef.current = (a) => {
      if (s.mode !== "running") {
        // start / restart (after game over wait a moment so you don't skip the screen by accident)
        if (a === "go" || a === "jump") {
          if (s.mode === "caught" && s.t < 0.9) return;
          reset();
        }
        return;
      }
      if (a === "left" && s.lane > -1) {
        s.lane--;
        sfx.lane();
      }
      if (a === "right" && s.lane < 1) {
        s.lane++;
        sfx.lane();
      }
      if (a === "jump" || a === "go") {
        if (s.jumpY <= 0.001) {
          s.vy = 4.3;
          s.slide = 0;
          sfx.jump();
        }
      }
      if (a === "slide") {
        if (s.jumpY > 0.001) s.vy = -9; // in the air: drop down fast
        s.slide = 0.65;
        sfx.slide();
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") inputRef.current?.("left");
      else if (k === "ArrowRight" || k === "d" || k === "D") inputRef.current?.("right");
      else if (k === "ArrowUp" || k === "w" || k === "W") inputRef.current?.("jump");
      else if (k === "ArrowDown" || k === "s" || k === "S") inputRef.current?.("slide");
    };
    window.addEventListener("keydown", onKey);

    // ---------- drawing helpers ----------
    const off = (z: number) => (z <= PZ ? 0 : s.curve * (z - PZ) * (z - PZ) * 0.02);
    const proj = (wx: number, z: number) => {
      const sc = F / z;
      return { x: W / 2 + (wx + off(z)) * sc, y: HOR + sc, s: sc };
    };
    const fogAt = (z: number) => Math.min(1, Math.max(0, (z - 4) / (FAR - 4)));

    // ---------- worlds ----------
    // which world a spot on the path belongs to
    const themeIndexAt = (at: number) => {
      let t = s.zones[0].theme;
      for (const z of s.zones) if (z.from <= at) t = z.theme;
      return t;
    };
    const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    // the sky + fog colours right now (they blend slowly while the next world gets closer)
    const look = {
      fog: THEMES[0].fog,
      sky: THEMES[0].sky,
      far: THEMES[0].far,
      canopy: THEMES[0].canopy,
      canopyAmt: THEMES[0].canopyAmt,
      near: THEMES[0],
    };
    const updateLook = () => {
      const cur = THEMES[themeIndexAt(s.dist)];
      const last = s.zones[s.zones.length - 1];
      const next = THEMES[last.theme];
      const t = next === cur ? 0 : Math.min(1, Math.max(0, 1 - (last.from - s.dist) / FAR));
      look.fog = mix(cur.fog, next.fog, t);
      look.sky = cur.sky.map((c, i) => mix(c, next.sky[i], t));
      look.far = mix(cur.far, next.far, t);
      look.canopy = mix(cur.canopy, next.canopy, t);
      look.canopyAmt = cur.canopyAmt + (next.canopyAmt - cur.canopyAmt) * t;
      look.near = t < 0.5 ? cur : next;
    };

    const text = (str: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center") => {
      ctx.font = `${size}px ${fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    };

    // a blocky rounded boulder
    const blob = (cx: number, bottom: number, w: number, h: number) => {
      const rows = Math.max(1, Math.round(h));
      for (let i = 0; i < rows; i++) {
        const v = (i + 0.5) / rows; // 0 top .. 1 bottom
        const k = Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.6) / 0.6, 2)));
        const hw = Math.max(1, Math.round((w / 2) * k));
        const y = Math.round(bottom - rows + i);
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(cx - hw - 1), y, hw * 2 + 2, 1);
        ctx.fillStyle = v < 0.2 ? "#3ee05a" : v < 0.4 ? "#b08d62" : v < 0.8 ? "#86684a" : "#5a4630";
        ctx.fillRect(Math.round(cx - hw), y, hw * 2, 1);
      }
    };

    // a log lying across the path (y0 = bottom height, y1 = top height, in world units)
    const log = (z: number, y0: number, y1: number) => {
      const a = proj(-PATHW - 0.1, z);
      const b = proj(PATHW + 0.1, z);
      const top = Math.round(a.y - y1 * a.s);
      const bot = Math.round(a.y - y0 * a.s);
      const h = Math.max(2, bot - top);
      const x0 = Math.round(a.x);
      const w = Math.round(b.x - a.x);
      ctx.fillStyle = "#111";
      ctx.fillRect(x0 - 1, top - 1, w + 2, h + 2);
      ctx.fillStyle = "#6a4423";
      ctx.fillRect(x0, top, w, h);
      ctx.fillStyle = "#8a5a2e";
      ctx.fillRect(x0, top, w, Math.max(1, Math.round(h * 0.3)));
      ctx.fillStyle = "#4a2e17";
      ctx.fillRect(x0, top + Math.round(h * 0.7), w, Math.max(1, Math.round(h * 0.3)));
      // knots + moss
      const step = Math.max(4, Math.round(a.s * 0.5));
      for (let x = x0 + step; x < x0 + w - 2; x += step) {
        ctx.fillStyle = "#4a2e17";
        ctx.fillRect(x, top + Math.round(h * 0.35), Math.max(1, Math.round(h * 0.25)), Math.max(1, Math.round(h * 0.25)));
        ctx.fillStyle = "#2c8a33";
        ctx.fillRect(x + 2, top, Math.max(1, Math.round(step * 0.4)), Math.max(1, Math.round(h * 0.15)));
      }
      return { x0, w, top };
    };

    const drawObstacle = (o: Obstacle, z: number) => {
      const p = proj(0, z);
      if (o.kind === "rock") {
        for (const l of o.lanes) {
          const q = proj(l * LANE, z);
          blob(q.x, q.y + 1, 0.7 * q.s, 0.52 * q.s);
        }
      } else if (o.kind === "root") {
        log(z, 0, 0.28);
      } else {
        // a fallen branch up high, held by two posts. Slide under it!
        const a = proj(-PATHW - 0.1, z);
        const b = proj(PATHW + 0.1, z);
        const pw = Math.max(2, Math.round(0.14 * p.s));
        const top = Math.round(p.y - 1.05 * p.s);
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(a.x) - pw - 1, top, pw + 2, Math.round(p.y) - top);
        ctx.fillRect(Math.round(b.x) - 1, top, pw + 2, Math.round(p.y) - top);
        ctx.fillStyle = "#5d6e57";
        ctx.fillRect(Math.round(a.x) - pw, top, pw, Math.round(p.y) - top);
        ctx.fillRect(Math.round(b.x), top, pw, Math.round(p.y) - top);
        const L = log(z, 0.62, 0.92);
        // vines hanging from it
        ctx.fillStyle = "#2c8a33";
        const step = Math.max(3, Math.round(p.s * 0.35));
        for (let x = L.x0 + 2; x < L.x0 + L.w; x += step) {
          const len = Math.round(((hash(x, Math.round(o.at)) * 0.18) + 0.05) * p.s);
          ctx.fillRect(x, L.top, 1, Math.round(0.3 * p.s) + len);
        }
      }
    };

    const drawGem = (g: Gem, z: number, t: number) => {
      const q = proj(g.lane * LANE, z);
      const size = Math.max(1, Math.round(0.13 * q.s));
      const cy = Math.round(q.y - (0.32 + Math.sin(t * 5 + g.at) * 0.06) * q.s);
      const cx = Math.round(q.x);
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
      if (size >= 2) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(cx - 1, cy - Math.round(size / 2), 1, 1);
      }
    };

    const drawFloor = () => {
      const dist = s.dist;
      const FOG = look.fog;
      for (let y = 0; y < FH; y++) {
        const z = F / (y + 0.5);
        const fog = Math.pow(fogAt(z), 0.7);
        const cx = W / 2 + (off(z) * F) / z;
        const inv = z / F;
        const wz = z + dist - PZ;
        const brow = Math.floor(wz * 1.7);
        const bfr = wz * 1.7 - brow;
        const grow = Math.floor(wz * 1.1);
        const mort = Math.min(0.3, 0.1 + z * 0.004);
        const JUNGLE = THEMES[themeIndexAt(wz)].ground; // this row's world
        for (let x = 0; x < W; x++) {
          const wx = (x + 0.5 - cx) * inv;
          const ax = Math.abs(wx);
          let c: [number, number, number];
          if (ax < PATHW) {
            const u = (wx + PATHW) * 2 + (brow & 1) * 0.5;
            const col = Math.floor(u);
            if (bfr < mort || u - col < mort * 0.8) c = MORTAR;
            else c = BRICKS[Math.floor(hash(brow, col) * 4)];
          } else if (ax < PATHW + 0.2) {
            c = brow & 1 ? EDGE : EDGE_DARK;
          } else {
            c = JUNGLE[Math.floor(hash(grow, Math.floor(wx * 1.4)) * 4)];
            if (ax < PATHW + 0.45) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]; // shadow next to the path
          }
          const r = c[0] + (FOG[0] - c[0]) * fog;
          const gg = c[1] + (FOG[1] - c[1]) * fog;
          const b = c[2] + (FOG[2] - c[2]) * fog;
          floor32[y * W + x] = (255 << 24) | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
        }
      }
      ctx.putImageData(floor, 0, HOR);
    };

    const drawSky = (t: number) => {
      const bands = look.sky;
      const bh = Math.ceil(HOR / bands.length);
      bands.forEach((c, i) => {
        ctx.fillStyle = css(c);
        ctx.fillRect(0, i * bh, W, bh);
      });
      const shift = s.curve * 90;
      // open sky (BLUE GRASS): stars and a moon, fading in as the leaves above go away
      const open = 1 - look.canopyAmt;
      if (open > 0.02) {
        ctx.globalAlpha = open;
        for (let i = 0; i < 34; i++) {
          const sx = ((hash(i, 11) * W + shift * 0.2) % W + W) % W;
          const sy = 2 + hash(i, 12) * (HOR - 16);
          if (Math.sin(t * 2 + i * 2.3) < -0.75) continue; // twinkle
          ctx.fillStyle = hash(i, 13) > 0.7 ? "#ffffff" : "#9cc4ff";
          ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
        const mx = Math.round((((W * 0.78 + shift * 0.2) % W) + W) % W);
        ctx.fillStyle = "#e8f2ff";
        ctx.fillRect(mx - 3, 7, 6, 8);
        ctx.fillRect(mx - 4, 8, 8, 6);
        ctx.fillStyle = "#b8d0f0";
        ctx.fillRect(mx - 1, 9, 2, 2);
        ctx.fillRect(mx + 1, 12, 1, 1);
        ctx.globalAlpha = 1;
      }
      // far tree line
      ctx.fillStyle = css(look.far);
      for (let x = 0; x < W; x++) {
        const xx = x + shift * 0.5;
        const h = 10 + Math.sin(xx * 0.07) * 4 + Math.sin(xx * 0.19) * 2 + Math.sin(xx * 0.5) * 1;
        ctx.fillRect(x, Math.round(HOR - h), 1, Math.round(h));
      }
      // canopy hanging from the top + vines
      for (let x = 0; x < W; x++) {
        const xx = x + shift;
        const h = (7 + Math.sin(xx * 0.11) * 4 + Math.sin(xx * 0.31) * 2) * look.canopyAmt;
        if (h < 1) continue; // no leaves above in the open worlds
        ctx.fillStyle = css(look.canopy);
        ctx.fillRect(x, 0, 1, Math.round(h));
        const xi = Math.floor(xx);
        if (((xi % 13) + 13) % 13 === 0) {
          const len = Math.round((8 + Math.floor(hash(xi, 5) * 22)) * look.canopyAmt);
          ctx.fillStyle = look.near.vine;
          ctx.fillRect(x, Math.round(h), 1, len);
          ctx.fillStyle = look.near.vineLight;
          for (let y = Math.round(h) + 3; y < h + len; y += 4) ctx.fillRect(x + 1, y, 1, 1);
        }
      }
      // fireflies
      for (let i = 0; i < 12; i++) {
        const fx = ((hash(i, 1) * W + t * (6 + i) + shift) % W + W) % W;
        const fy = 10 + hash(i, 2) * (HOR - 4) + Math.sin(t * 2 + i) * 3;
        if (Math.sin(t * 3 + i * 1.7) > 0.2) {
          ctx.fillStyle = look.near.firefly;
          ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
        }
      }
    };

    // trees + pillars along both sides, obstacles and gems, drawn far to near
    const drawWorld = (t: number) => {
      type Item = { z: number; draw: () => void };
      const items: Item[] = [];
      const SPACING = 2.5;
      const k0 = Math.floor((s.dist - PZ + 1.6) / SPACING);
      const k1 = Math.floor((s.dist - PZ + FAR) / SPACING);
      for (let k = k0; k <= k1; k++) {
        for (const side of [-1, 1]) {
          const h = hash(k, side + 7);
          const z = k * SPACING - s.dist + PZ;
          if (z < 1.6 || z > FAR) continue;
          // which world this spot is in: trees (green / orange) or tall grass (blue)
          const ti = themeIndexAt(k * SPACING);
          const grass = THEMES[ti].side === "grass";
          if (!grass && h < 0.15) continue; // a gap between the trees (the grass has no gaps)
          const isPillar = grass ? h < 0.1 : h < 0.38;
          const wx = side * (PATHW + (isPillar ? 0.45 : grass ? 0.6 : 0.9) + hash(k, side + 3) * 0.8);
          const add = (x: number, img: HTMLCanvasElement, w: number, tall: number) =>
            items.push({
              z,
              draw: () => {
                const q = proj(x, z);
                const ww = w * q.s;
                const hh = tall * q.s;
                ctx.globalAlpha = 1 - Math.pow(fogAt(z), 1.4);
                ctx.drawImage(img, Math.round(q.x - ww / 2), Math.round(q.y - hh), Math.round(ww), Math.round(hh));
                ctx.globalAlpha = 1;
              },
            });
          if (isPillar) add(wx, pillars[ti][k & 1], 0.8, 2.4);
          else if (grass) {
            // tall grass: a clump next to the path and another one behind it
            add(wx + side * 1.3, trees[ti][Math.abs(k + 1) % 3], 1.9, 1.5);
            add(wx, trees[ti][Math.abs(k) % 3], 1.8, 1.3);
          } else add(wx, trees[ti][Math.abs(k) % 3], 1.8, 3.6);
        }
      }
      for (const o of s.obs) {
        const z = o.at - s.dist + PZ;
        if (z < 1.7 || z > FAR) continue;
        if (o.hit && o.kind === "rock") continue; // smashed
        items.push({
          z,
          draw: () => {
            ctx.globalAlpha = (1 - Math.pow(fogAt(z), 1.4)) * (o.hit ? 0.45 : 1);
            drawObstacle(o, z);
            ctx.globalAlpha = 1;
          },
        });
      }
      for (const g of s.gemList) {
        if (g.taken) continue;
        const z = g.at - s.dist + PZ;
        if (z < 1.7 || z > FAR * 0.75) continue;
        items.push({
          z,
          draw: () => {
            ctx.globalAlpha = 1 - fogAt(z);
            drawGem(g, z, t);
            ctx.globalAlpha = 1;
          },
        });
      }
      items.sort((a, b) => b.z - a.z);
      // everything farther than the player, then the player, then nearer things
      let i = 0;
      for (; i < items.length && items[i].z >= PZ; i++) items[i].draw();
      drawPlayer(t);
      for (; i < items.length; i++) items[i].draw();
    };

    const drawPlayer = (t: number) => {
      const p = playerScreen();
      const sc = F / PZ;
      const lift = Math.round(s.jumpY * sc);
      // shadow
      const shw = Math.max(6, 12 - lift / 4);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(Math.round(p.x - shw), Math.round(p.y - 2), shw * 2, 3);
      if (s.invuln > 0 && Math.floor(t * 16) % 2 === 0) return; // blink after a stumble
      const x = Math.round(p.x - 12);
      if (s.mode === "ready") {
        ctx.drawImage(dudeStand, x, Math.round(p.y - 36), 24, 36);
      } else if (s.slide > 0 && s.jumpY <= 0.001) {
        // sliding: only the top half shows, low to the ground
        ctx.drawImage(dudeStand, 0, 0, 12, 12, x, Math.round(p.y - 24), 24, 24);
      } else {
        const f = s.jumpY > 0.001 ? dudeStand : dude[Math.floor(s.dist * 2.4) % 2];
        ctx.drawImage(f, x, Math.round(p.y - 36 - lift), 24, 36);
      }
    };

    const drawMonster = (t: number) => {
      const vis = s.chaseVis;
      if (vis < 0.03) return;
      const top = H + 2 - vis * (H + 2 - 106) + Math.sin(t * 14) * 2;
      const x = W / 2 + (s.mx * F) / PZ - 27;
      const frame = bmp[Math.floor(t * 8) % 2];
      ctx.drawImage(frame, Math.round(x), Math.round(top), 54, 66);
    };

    const drawHud = () => {
      text(`${Math.floor(s.dist)}M`, 4, 4, GREEN, 8, "left");
      // gem icon + count
      const gx = W - 12;
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(gx + 2, 4, 3, 1);
      ctx.fillRect(gx + 1, 5, 5, 2);
      ctx.fillRect(gx + 2, 7, 3, 2);
      ctx.fillRect(gx + 3, 9, 1, 2);
      text(String(s.gems), gx - 2, 4, GREEN, 8, "right");
      // danger bar: how close BEARMANPIG is
      if (s.chase > 0.02) {
        const w = Math.round(40 * s.chase);
        ctx.fillStyle = "#000";
        ctx.fillRect(W / 2 - 21, 5, 42, 5);
        ctx.fillStyle = s.chase > CHASE_DEADLY ? "#ff3b5c" : PINK;
        ctx.fillRect(W / 2 - 20, 6, w, 3);
      }
    };

    const drawFace = (cx: number, y: number, scale: number) => {
      ctx.drawImage(face, Math.round(cx - 8 * scale), Math.round(y), 16 * scale, 16 * scale);
    };

    const pixelate = (f: number) => {
      if (f <= 1) return;
      const w = Math.round(W / f);
      const h = Math.round(H / f);
      if (pix.width !== w) {
        pix.width = w;
        pix.height = h;
      }
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(canvas, 0, 0, W, H, 0, 0, w, h);
      ctx.drawImage(pix, 0, 0, w, h, 0, 0, W, H);
    };

    // ---------- the game loop ----------
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let spinAcc = 0;

    const step = (dt: number) => {
      clock += dt;
      s.t += dt;

      // click wheel: every 35 degrees = one lane
      spinAcc += spinRef.current;
      spinRef.current = 0;
      while (spinAcc > 35) {
        inputRef.current?.("right");
        spinAcc -= 35;
      }
      while (spinAcc < -35) {
        inputRef.current?.("left");
        spinAcc += 35;
      }

      s.curve += ((Math.sin(s.dist * 0.012) * 0.45 + Math.sin(s.dist * 0.031) * 0.15) - s.curve) * Math.min(1, dt * 2);

      if (s.mode === "running") {
        s.speedMul += (1 - s.speedMul) * Math.min(1, dt * 1.2);
        s.dist += speed() * dt;
        s.px += Math.sign(s.lane * LANE - s.px) * Math.min(Math.abs(s.lane * LANE - s.px), 9 * dt);
        // jump
        if (s.jumpY > 0 || s.vy > 0) {
          s.vy -= 12.5 * dt;
          s.jumpY += s.vy * dt;
          if (s.jumpY <= 0) {
            s.jumpY = 0;
            s.vy = 0;
          }
        }
        if (s.slide > 0) s.slide -= dt;
        if (s.invuln > 0) s.invuln -= dt;
        s.chase = Math.max(0, s.chase - CHASE_DECAY * dt);

        generate(s.dist + FAR + 5);

        // hits
        const myLane = Math.round(s.px / LANE);
        for (const o of s.obs) {
          if (o.hit) continue;
          const d = o.at - s.dist;
          if (d > 0.3) break;
          if (d < -0.3) continue;
          if (o.kind === "rock" && o.lanes.includes(myLane) && s.jumpY < 0.42) stumble(o);
          else if (o.kind === "root" && s.jumpY < 0.22) stumble(o);
          else if (o.kind === "branch" && !(s.slide > 0 && s.jumpY < 0.3)) stumble(o);
          if (s.mode !== "running") break;
        }
        // gems
        for (const g of s.gemList) {
          if (g.taken) continue;
          const d = g.at - s.dist;
          if (d > 0.4) break;
          if (d < -0.4) continue;
          if (g.lane === myLane && s.jumpY < 0.9) {
            g.taken = true;
            s.gems++;
            sfx.gem();
            const p = playerScreen();
            burst(p.x, p.y - 20, 5, ["#b6ff9e", "#3ee05a", "#fff"]);
          }
        }
        // forget things behind us
        s.obs = s.obs.filter((o) => o.at > s.dist - 3);
        s.gemList = s.gemList.filter((g) => g.at > s.dist - 3);
        s.gemList.sort((a, b) => a.at - b.at);
        s.score = Math.floor(s.dist) + s.gems * 5;
        // every ZONE_SCORE points: the next world starts at the horizon and comes towards you
        const zone = Math.floor(s.score / ZONE_SCORE);
        if (zone > s.zone) {
          s.zone = zone;
          const ti = zone % THEMES.length;
          s.zones.push({ from: s.dist + FAR, theme: ti });
          if (s.zones.length > 4) s.zones.shift();
          s.pops.push({ x: W / 2, y: 46, text: THEMES[ti].name, life: 2.2, color: THEMES[ti].title });
          sfx.zone();
        }
      } else if (s.mode === "ready") {
        s.chase = 0.55 + Math.sin(clock * 1.5) * 0.1; // he's lurking
      }

      const target = s.mode === "caught" ? 1.45 : s.chase;
      s.chaseVis += (target - s.chaseVis) * Math.min(1, dt * (s.mode === "caught" ? 5 : 2.5));
      s.mx += (s.px - s.mx) * Math.min(1, dt * 3);
      if (s.shake > 0) s.shake -= dt;

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
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
      updateLook();
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
      drawFloor();
      drawSky(clock);
      drawWorld(clock);
      drawMonster(clock);
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      // chunky pixels at the start, getting sharper during the first seconds
      if (s.mode === "ready") pixelate(START_PIXELS);
      else if (s.mode === "running") pixelate(Math.max(1, Math.ceil(START_PIXELS - s.t * 1.5)));

      for (const p of s.pops) text(p.text, p.x, p.y, p.color);

      if (s.mode === "running") drawHud();

      if (s.mode === "ready") {
        ctx.fillStyle = "rgba(0,20,8,0.55)";
        ctx.fillRect(0, 0, W, H);
        text(GAME_TITLE, W / 2, 12, GREEN, 16);
        drawFace(W / 2, 36, 2);
        text("RUN FROM", W / 2, 72, "#ffffff");
        text("BEARMANPIG!", W / 2, 83, PINK);
        text("SWIPE / ARROWS", W / 2, 100, "#b6ffb0");
        if (Math.floor(clock * 2) % 2 === 0) text("SPACE = RUN", W / 2, 114, GREEN);
        if (best > 0) text(`BEST ${best}`, W / 2, 130, "#9ad19a");
      }

      if (s.mode === "caught") {
        const a = Math.min(0.7, s.t * 1.2);
        ctx.fillStyle = `rgba(0,15,5,${a})`;
        ctx.fillRect(0, 0, W, H);
        if (s.t > 0.4) {
          drawFace(W / 2, 8, 3);
          text("BEARMANPIG", W / 2, 60, PINK);
          text("GOT YOU!", W / 2, 71, "#ffffff");
          text(`SCORE ${s.score}`, W / 2, 88, GREEN);
          text(s.newBest ? "NEW BEST!" : `BEST ${best}`, W / 2, 100, s.newBest ? PINK : "#9ad19a");
          text(`${Math.floor(s.dist)}M  ${s.gems} GEMS`, W / 2, 112, "#b6ffb0");
          if (s.t > 0.9 && Math.floor(clock * 2) % 2 === 0) text("SPACE = AGAIN", W / 2, 128, GREEN);
        }
      }
    };

    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      step(dt);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      inputRef.current = null;
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily, spinRef]);

  // ---------- touch: swipe to move, tap to jump / start ----------
  const swipe = useRef({ x: 0, y: 0, on: false, fired: false });
  const SWIPE_PX = 16;

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      onPointerDown={(e) => {
        e.stopPropagation();
        swipe.current = { x: e.clientX, y: e.clientY, on: true, fired: false };
      }}
      onPointerMove={(e) => {
        const sw = swipe.current;
        if (!sw.on || sw.fired) return;
        const dx = e.clientX - sw.x;
        const dy = e.clientY - sw.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
        sw.fired = true;
        if (Math.abs(dx) > Math.abs(dy)) inputRef.current?.(dx > 0 ? "right" : "left");
        else inputRef.current?.(dy > 0 ? "slide" : "jump");
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const sw = swipe.current;
        if (sw.on && !sw.fired) inputRef.current?.("go"); // a tap
        sw.on = false;
      }}
      onPointerCancel={() => {
        swipe.current.on = false;
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "#05140a",
        touchAction: "none",
        cursor: "pointer",
      }}
    />
  );
}
