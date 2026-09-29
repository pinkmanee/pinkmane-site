"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= jump)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

type Mode = "ready" | "running" | "pipe" | "hurt" | "dying" | "entry" | "board";

// One column of the level
type Column = {
  ground: number; // row where the ground starts, -1 = pit
  block: number; // floating brick floor (one-way), -1 = none
  block2: number; // second brick floor above it
  bonus: number; // bonus block row (bump it from below), -1 = none
  used: boolean;
  bump: number;
  line: number; // thin line to jump on (one-way), -1 = none
  lineTh: number; // how thick the line is drawn (gets thinner the farther you go)
  pipe: number; // 0 = no pipe, 1 = left half, 2 = right half
  pipeOut: boolean; // pipe that leads back out of the bonus room
  pipeUsed: boolean;
  zone: number; // which zone look this column has (99 = SoundCloud Void)
};

type Enemy = {
  kind: "walker" | "flyer";
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseY: number;
  phase: number;
  alive: boolean;
  squash: number;
};
type Leaf = { x: number; y: number; taken: boolean };
type Heart = { x: number; y: number; taken: boolean };
type PowerUp = { x: number; y: number; vx: number; vy: number };
type Fireball = { x: number; y: number; vx: number; vy: number; life: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Popup = { x: number; y: number; text: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the screen.
const W = 256;
const H = 160;
const T = 16; // one tile
const ROWS = 10;

// Your pixel dude: /public/game/pinkdude.png (2 frames side by side)
const SPRITE_W = 24;
const SPRITE_H = 35;
// Hitbox inside the sprite (hair and arms don't count)
const HB_X = 7;
const HB_Y = 5;
const HB_W = 11;
const HB_H = 30;

// Feel of the game
const GRAVITY = 1150;
const JUMP = -370;
const RUN = 100;
const ACCEL = 900;
const STOMP_BOUNCE = -240;

// Lives are hearts: you start with 2 and can collect up to 4
const START_LIVES = 2;
const MAX_LIVES = 4;

// Zones change every this many tiles, each with its own look and harder jumping
const ZONE_LEN = 150;
const ZONE_NAMES = ["PINK FIELDS", "SPEAKER HILLS", "ROOFTOPS", "PINK CLOUDS"];
const VOID_ZONE = 99;

// Fire power: 5 fireballs, and a timer bar at the bottom. Picking up another one refills, it doesn't stack.
const FIRE_AMMO = 5;
const FIRE_TIME = 15;
const FIREBALL_SPEED = 170;

// Points
const PTS_LEAF = 10;
const PTS_WALKER = 100;
const PTS_FLYER = 150;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinksuper-best";
const SFX_KEY = "pinksuper-sfx";
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const HILLS = "#c3e2a3";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const LIGHT_GREEN = "#6fdc5a";
const ROOF = "#6a2a8a";
const ROOF_LINE = "#8e3fb0";
const CLOUD = "#fdeefb";
const CLOUD_SKY = "#f3d3ee";
const VOID_BG = "#160c1d";
const BOOM = [PINK, "#ffc800", INK, "#777777", "#ffffff"];
const FIRE = ["#ff7a00", "#ffc800", "#d21e1e", "#ffffff"];

// Haters: grumpy grey clouds that walk around (drawn 2x bigger)
const HATER = [
  ".GG.GG.",
  "GGGGGGG",
  "GKKGKKG",
  "GWKGWKG",
  "GGGGGGG",
  "GGKKKGG",
  ".G.G.G.",
];
// Green flying monster (two wing frames, drawn 2x bigger)
const FLYER = [
  [
    "GG.....GG",
    "GGG...GGG",
    ".GGDDDGG.",
    "..DWDWD..",
    "..DDDDD..",
    "...D.D...",
    ".........",
  ],
  [
    ".........",
    "...DDD...",
    "..DWDWD..",
    "GGDDDDDGG",
    "GGG.D.GGG",
    "GG.....GG",
    ".........",
  ],
];
const LEAF = [
  "...G...",
  "..GGG..",
  "G.GGG.G",
  "GGGGGGG",
  ".GGGGG.",
  "...D...",
  "...D...",
];
const HEART = [
  ".PP.PP.",
  "PPPPPPP",
  "PPPPPPP",
  ".PPPPP.",
  "..PPP..",
  "...P...",
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  colors: Record<string, string>,
  scale = 1
) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const color = colors[rows[r][c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }
}

// Small repeatable "random" number for background decorations
function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// A random ID for this browser, so names stay locked to the device that claimed them
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}

function getOwnerCode() {
  try {
    return localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}

export default function SuperGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const sfxOnRef = useRef(true);
  const heldRef = useRef({ left: false, right: false });
  const touchRef = useRef(0); // -1 holding left side, 1 holding right side
  const wheelRef = useRef({ dir: 0, timer: 0 });

  // Scoreboard (shared online) and name entry
  const [showEntry, setShowEntry] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const boardRef = useRef<Entry[]>([]);
  const boardStatusRef = useRef<BoardStatus>("loading");
  const myNameRef = useRef("");
  const nameRef = useRef("");
  const savingRef = useRef(false);

  const state = useRef({
    mode: "ready" as Mode,
    x: 40,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    facing: 1,
    cam: 0,
    cols: [] as Column[],
    genGround: 8,
    genFlat: 0,
    pipeZones: [] as number[], // zones that already got their bonus pipe
    enemies: [] as Enemy[],
    leaves: [] as Leaf[],
    hearts: [] as Heart[],
    powerups: [] as PowerUp[],
    fireballs: [] as Fireball[],
    particles: [] as Particle[],
    popups: [] as Popup[],
    ammo: 0,
    fireTime: 0,
    auraTimer: 0,
    zoneShown: 0,
    flash: 0,
    flashText: "",
    // Bonus room (SoundCloud Void)
    inBonus: false,
    saved: null as null | {
      cols: Column[];
      enemies: Enemy[];
      leaves: Leaf[];
      hearts: Heart[];
      powerups: PowerUp[];
      cam: number;
      pipeCol: number;
    },
    pipeDir: 0 as 0 | 1 | -1, // 1 = going down into the void, -1 = coming out
    pipeTimer: 0,
    pipeCol: 0,
    score: 0,
    farthest: 0,
    bonus: 0,
    best: 0,
    lives: START_LIVES,
    invuln: 0,
    runAnim: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    hurtAt: 0,
    shake: 0,
  });

  // ---------- Sounds (made in code) ----------

  const getAudio = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const beep = (from: number, to: number, time: number, volume: number, type: OscillatorType = "square", delay = 0) => {
    if (mutedRef.current || !sfxOnRef.current) return;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + time);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + time + 0.02);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + time + 0.04);
  };

  const playJump = () => beep(260, 640, 0.12, 0.045, "square");
  const playLeaf = () => {
    beep(988, 988, 0.05, 0.045);
    beep(1319, 1319, 0.1, 0.045, "square", 0.05);
  };
  const playStomp = () => beep(500, 120, 0.12, 0.07, "square");
  const playHurt = () => beep(500, 70, 0.5, 0.08, "sawtooth");
  const playBump = () => beep(180, 120, 0.08, 0.07, "square");
  const playPowerAppear = () => [330, 440, 554, 659].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.05));
  const playPowerUp = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f * 1.01, 0.08, 0.055, "square", i * 0.06));
  const playFireball = () => beep(900, 300, 0.07, 0.035, "sawtooth");
  const playPowerDown = () => beep(700, 200, 0.35, 0.07, "square");
  const playEmpty = () => beep(140, 110, 0.05, 0.05, "square");
  const playHeart = () => [659, 784, 988, 1319].forEach((f, i) => beep(f, f, 0.09, 0.055, "triangle", i * 0.07));
  const playPipe = () => [520, 390, 260, 180].forEach((f, i) => beep(f, f * 0.9, 0.08, 0.05, "square", i * 0.08));
  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current && sfxOnRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // ---------- Scoreboard ----------

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores?game=super", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      boardRef.current = Array.isArray(data.scores) ? data.scores : [];
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
    if (boardStatusRef.current !== "ok" || score < 10) return false;
    const b = boardRef.current;
    return b.length < 10 || score > b[b.length - 1].score;
  };

  const submitName = async () => {
    const s = state.current;
    const clean = nameRef.current.trim();
    if (clean.length < 2) {
      setMessage("NAME TOO SHORT");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: "super",
          name: clean,
          score: Math.floor(s.score),
          runTime: s.runTime,
          device: getDeviceId(),
          ownerCode: getOwnerCode(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(String(data.error || "COULD NOT SAVE").toUpperCase());
        return;
      }
      boardRef.current = Array.isArray(data.scores) ? data.scores : boardRef.current;
      myNameRef.current = data.name || clean;
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {}
      setShowEntry(false);
      s.mode = "board";
      s.deadAt = s.t;
    } catch {
      setMessage("COULD NOT SAVE");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const skipEntry = () => {
    const s = state.current;
    setShowEntry(false);
    setMessage("");
    s.mode = "board";
    s.deadAt = s.t;
  };

  // ---------- Level ----------

  const makeCol = (ground: number, zone: number, extra: Partial<Column> = {}): Column => ({
    ground,
    block: -1,
    block2: -1,
    bonus: -1,
    used: false,
    bump: 0,
    line: -1,
    lineTh: 4,
    pipe: 0,
    pipeOut: false,
    pipeUsed: false,
    zone,
    ...extra,
  });

  const zoneOf = (i: number) => Math.floor(i / ZONE_LEN) % ZONE_NAMES.length;

  const addWalker = (i: number, ground: number, progress: number) => {
    state.current.enemies.push({
      kind: "walker",
      x: i * T,
      y: ground * T - 14,
      vx: -(28 + progress * 24),
      vy: 0,
      baseY: 0,
      phase: 0,
      alive: true,
      squash: 0,
    });
  };

  const addFlyer = (i: number, ground: number, progress: number) => {
    const baseY = Math.max(20, (ground - 3) * T + rand(-8, 8));
    state.current.enemies.push({
      kind: "flyer",
      x: i * T,
      y: baseY,
      vx: -(30 + progress * 22),
      vy: 0,
      baseY,
      phase: Math.random() * Math.PI * 2,
      alive: true,
      squash: 0,
    });
  };

  // Floating bricks: sometimes two floors, rarely with a bonus block (orange leaf inside)
  const addPlatforms = (zone: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const g = s.genGround;
    const len = 3 + Math.floor(Math.random() * 3);
    const row = g - 3;
    const twoFloors = g >= 7 && Math.random() < (zone === 1 ? 0.6 : 0.35);
    const bonusAt = Math.random() < 0.15 ? 1 + Math.floor(Math.random() * (len - 2)) : -1;
    for (let k = 0; k < len; k++) {
      const upper = twoFloors && k >= 1 && k < len - 1 ? row - 3 : -1;
      if (k === bonusAt) s.cols.push(makeCol(g, zone, { bonus: row, block2: upper }));
      else s.cols.push(makeCol(g, zone, { block: row, block2: upper }));
      const top = upper >= 0 ? upper : row;
      // Very rarely a heart instead of a leaf
      if (Math.random() < 0.02) {
        s.hearts.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 2, taken: false });
      } else if (Math.random() < (upper >= 0 ? 0.8 : 0.5)) {
        s.leaves.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 1, taken: false });
      }
    }
  };

  // A wide pit with thin lines to hop across. The farther you go, the shorter and thinner they get.
  const addLineBridge = (zone: number, progress: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const gapW = 6 + Math.floor(Math.random() * 4);
    const lineLen = Math.max(1, 3 - Math.floor(progress * 3));
    const th = Math.max(2, 5 - Math.floor(progress * 4));
    for (let k = 0; k < gapW; k++) s.cols.push(makeCol(-1, zone));
    let row = s.genGround - 2;
    let o = 1;
    while (o + lineLen <= gapW - 1) {
      for (let k = 0; k < lineLen; k++) {
        const c = s.cols[i0 + o + k];
        c.line = row;
        c.lineTh = th;
      }
      if (Math.random() < 0.5) s.leaves.push({ x: (i0 + o) * T + 1, y: (row - 1) * T + 1, taken: false });
      o += lineLen + 1 + (Math.random() < progress ? 1 : 0);
      row = Math.max(3, Math.min(s.genGround - 1, row + Math.floor(rand(-1, 1.99))));
    }
  };

  // A pipe down into the SoundCloud Void (one per zone)
  const addPipe = (zone: number) => {
    const s = state.current;
    const g = s.genGround;
    const top = g - 2;
    s.cols.push(makeCol(g, zone));
    s.cols.push(makeCol(top, zone, { pipe: 1 }));
    s.cols.push(makeCol(top, zone, { pipe: 2 }));
    s.cols.push(makeCol(g, zone));
  };

  // Builds the level a bit ahead of the camera. Gets harder the farther you go.
  const generateUpTo = (col: number) => {
    const s = state.current;
    if (s.inBonus) return;
    while (s.cols.length <= col) {
      const i = s.cols.length;
      const zone = zoneOf(i);
      const zoneIndex = Math.floor(i / ZONE_LEN);
      const progress = Math.min(1, i / 900); // reaches full difficulty after ~900 tiles

      // Safe start, and a calm flat bit at the start of every new zone
      if (i < 18 || i % ZONE_LEN < 5) {
        if (i >= 18 && i % ZONE_LEN === 0) s.genGround = 8;
        s.cols.push(makeCol(i < 18 ? 8 : s.genGround, zone));
        continue;
      }

      if (s.genFlat > 0) {
        s.genFlat -= 1;
        s.cols.push(makeCol(s.genGround, zone));
        if (s.genFlat > 1 && zone !== 3 && Math.random() < 0.05 + progress * 0.09 + (zone === 1 ? 0.03 : 0)) {
          addWalker(i, s.genGround, progress);
        }
        if (progress > 0.06 && Math.random() < 0.015 + progress * 0.035 + (zone === 3 ? 0.03 : 0)) {
          addFlyer(i, s.genGround, progress);
        }
        continue;
      }

      // Bonus pipe halfway through each zone
      if (i % ZONE_LEN > 60 && !s.pipeZones.includes(zoneIndex)) {
        s.pipeZones.push(zoneIndex);
        addPipe(zone);
        s.genFlat = 3;
        continue;
      }

      const r = Math.random();
      const lineChance = progress < 0.1 ? 0 : zone === 3 ? 0.3 : 0.14;

      if (r < lineChance) {
        addLineBridge(zone, progress);
        s.genFlat = 3 + Math.floor(Math.random() * 3);
        continue;
      }

      if (zone === 2) {
        // ROOFTOPS: narrow pillars at different heights with gaps between
        if (r < 0.75) {
          const count = 3 + Math.floor(Math.random() * 4);
          for (let k = 0; k < count; k++) {
            const gap = Math.random() < 0.35 + progress * 0.3 ? 2 : 1;
            for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
            let delta = Math.floor(rand(-2, 2.99));
            if (gap === 2 && delta < -1) delta = -1;
            s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
            const width = Math.random() < 0.35 ? 1 : 2;
            for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
            if (Math.random() < 0.3) {
              s.leaves.push({ x: (s.cols.length - 1) * T + 1, y: (s.genGround - 2) * T, taken: false });
            }
          }
        } else {
          addPlatforms(zone);
        }
        s.genFlat = 3 + Math.floor(Math.random() * 4);
        continue;
      }

      if (zone === 3) {
        // PINK CLOUDS: fluffy islands floating in the sky
        const count = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k++) {
          const gap = 1 + Math.floor(Math.random() * (progress > 0.5 ? 3 : 2));
          for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
          let delta = Math.floor(rand(-1, 1.99));
          if (gap >= 2 && delta < 0) delta = 0;
          s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
          const width = 2 + Math.floor(Math.random() * 4);
          const start = s.cols.length;
          for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
          if (Math.random() < 0.5) {
            s.leaves.push({ x: (start + Math.floor(width / 2)) * T + 1, y: (s.genGround - 2) * T, taken: false });
          }
        }
        s.genFlat = 2 + Math.floor(Math.random() * 3);
        continue;
      }

      if (r < lineChance + 0.24 + progress * 0.12) {
        // A pit, 2 to 3 tiles wide
        const width = Math.random() < 0.3 + progress * 0.4 ? 3 : 2;
        for (let k = 0; k < width; k++) s.cols.push(makeCol(-1, zone));
        if (Math.random() < 0.5) {
          s.leaves.push({ x: (i + width / 2) * T - 7, y: (s.genGround - 3) * T, taken: false });
        }
      } else if (r < (zone === 1 ? 0.62 : 0.5)) {
        // Step up or down (SPEAKER HILLS: bigger steps)
        const size = zone === 1 && Math.random() < 0.5 ? 2 : 1;
        const next = Math.max(zone === 1 ? 5 : 6, Math.min(8, s.genGround + (Math.random() < 0.5 ? -size : size)));
        s.genGround = next;
        s.cols.push(makeCol(next, zone));
      } else {
        addPlatforms(zone);
      }
      s.genFlat = 3 + Math.floor(Math.random() * (7 - progress * 3));
    }
  };

  // The bonus room: SoundCloud Void. Weed leaves everywhere, one bonus heart, and a pipe out.
  const buildVoid = () => {
    const cols: Column[] = [];
    const leaves: Leaf[] = [];
    const hearts: Heart[] = [];
    const len = 36;
    for (let i = 0; i < len; i++) {
      if (i === 0 || i === len - 1) {
        cols.push(makeCol(0, VOID_ZONE)); // walls
        continue;
      }
      const c = makeCol(8, VOID_ZONE);
      if (i >= 8 && i <= 12) c.block = 5;
      if (i >= 20 && i <= 24) c.block = 5;
      if (i >= 14 && i <= 18) {
        c.line = 3;
        c.lineTh = 3;
      }
      if (i === len - 4) {
        c.ground = 6;
        c.pipe = 1;
        c.pipeOut = true;
      }
      if (i === len - 3) {
        c.ground = 6;
        c.pipe = 2;
        c.pipeOut = true;
      }
      cols.push(c);
    }
    // Leaves: a row along the floor, on the bricks, and a wave in the air
    for (let i = 3; i < len - 6; i++) leaves.push({ x: i * T + 1, y: 7 * T + 1, taken: false });
    for (let i = 8; i <= 12; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
    for (let i = 20; i <= 24; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
    for (let i = 14; i <= 18; i++) leaves.push({ x: i * T + 1, y: 2 * T + 1, taken: false });
    for (let i = 3; i < 7; i++) leaves.push({ x: i * T + 1, y: (5 - Math.abs(i - 5)) * T, taken: false });
    // The bonus life, up on the thin line
    hearts.push({ x: 16 * T + 1, y: 1 * T + 4, taken: false });
    return { cols, leaves, hearts };
  };

  const colAt = (col: number): Column => {
    const s = state.current;
    if (col < 0) return makeCol(0, 0);
    if (s.inBonus) return s.cols[col] || makeCol(0, VOID_ZONE);
    generateUpTo(col + 2);
    return s.cols[col];
  };

  // Ground and bonus blocks are solid. Bricks and thin lines are "one-way": you land on them from above.
  const solidAt = (px: number, py: number) => {
    const col = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (row < 0) return false;
    if (row >= ROWS) return false;
    const c = colAt(col);
    if (c.bonus >= 0 && row === c.bonus) return true;
    return c.ground >= 0 && row >= c.ground;
  };

  const oneWayTopsAt = (px: number) => {
    const c = colAt(Math.floor(px / T));
    const tops: number[] = [];
    if (c.block >= 0) tops.push(c.block * T);
    if (c.block2 >= 0) tops.push(c.block2 * T);
    if (c.line >= 0) tops.push(c.line * T);
    return tops;
  };

  // Is anything solid inside this box?
  const boxHits = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy += 8) {
      for (let xx = x; xx < x + w; xx += 8) {
        if (solidAt(xx, yy)) return true;
      }
      if (solidAt(x + w - 0.01, yy)) return true;
    }
    for (let xx = x; xx < x + w; xx += 8) if (solidAt(xx, y + h - 0.01)) return true;
    return solidAt(x + w - 0.01, y + h - 0.01);
  };

  const groundYAt = (col: number) => {
    const c = colAt(col);
    return c.ground >= 0 && c.pipe === 0 ? c.ground * T : -1;
  };

  const placeOnGroundNear = (x: number) => {
    const s = state.current;
    let col = Math.max(0, Math.floor(x / T));
    for (let k = 0; k < 40; k++) {
      const gy = groundYAt(col + k);
      const gy2 = groundYAt(col + k + 1);
      if (gy >= 0 && gy2 >= 0 && gy === gy2) {
        col = col + k;
        s.x = col * T;
        s.y = gy - SPRITE_H;
        break;
      }
    }
    s.vx = 0;
    s.vy = 0;
    for (const e of s.enemies) if (Math.abs(e.x - s.x) < 60) e.alive = false;
  };

  const newGame = () => {
    const s = state.current;
    s.inBonus = false;
    s.saved = null;
    s.cols = [];
    s.enemies = [];
    s.leaves = [];
    s.hearts = [];
    s.powerups = [];
    s.fireballs = [];
    s.particles = [];
    s.popups = [];
    s.pipeZones = [];
    s.ammo = 0;
    s.fireTime = 0;
    s.zoneShown = 0;
    s.flash = 0;
    s.genGround = 8;
    s.genFlat = 0;
    generateUpTo(40);
    s.x = 40;
    s.y = 8 * T - SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.cam = 0;
    s.facing = 1;
    s.score = 0;
    s.farthest = 0;
    s.bonus = 0;
    s.lives = START_LIVES;
    s.invuln = 0;
    s.runTime = 0;
  };

  const jump = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (s.onGround || s.coyote > 0) {
      s.vy = JUMP;
      s.onGround = false;
      s.coyote = 0;
      playJump();
    }
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power * 1.4, power * 0.4),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.4, 1.0),
      });
    }
  };

  const popup = (x: number, y: number, text: string) => {
    state.current.popups.push({ x, y, text, life: 0.9 });
  };

  const hasFire = () => {
    const s = state.current;
    return s.ammo > 0 && s.fireTime > 0;
  };

  // Shoot one fireball (F / X / ↓, or the handheld's fire button)
  const shoot = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (!hasFire()) {
      if (s.fireTime > 0) playEmpty();
      return;
    }
    if (s.fireballs.length >= 2) return;
    s.ammo -= 1;
    s.fireballs.push({
      x: s.x + (s.facing > 0 ? SPRITE_W - 4 : 0),
      y: s.y + 16,
      vx: s.facing * FIREBALL_SPEED,
      vy: 40,
      life: 1.6,
    });
    playFireball();
    if (s.ammo <= 0) s.fireTime = 0;
  };

  // Standing on a pipe and pressing down: into the SoundCloud Void (or back out)
  const pipeUnderFeet = () => {
    const s = state.current;
    if (!s.onGround) return -1;
    const cx = s.x + HB_X + HB_W / 2;
    const col = Math.floor(cx / T);
    const c = colAt(col);
    if (c.pipe === 0 || c.pipeUsed) return -1;
    const feet = s.y + HB_Y + HB_H;
    if (Math.abs(feet - c.ground * T) > 2) return -1;
    return c.pipe === 1 ? col : col - 1;
  };

  const down = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    const pipeCol = pipeUnderFeet();
    if (pipeCol >= 0) {
      s.mode = "pipe";
      s.pipeDir = s.inBonus ? -1 : 1;
      s.pipeTimer = 0.7;
      s.pipeCol = pipeCol;
      s.x = pipeCol * T + T - SPRITE_W / 2;
      s.vx = 0;
      s.vy = 0;
      playPipe();
      return;
    }
    shoot();
  };

  const enterVoid = () => {
    const s = state.current;
    s.saved = {
      cols: s.cols,
      enemies: s.enemies,
      leaves: s.leaves,
      hearts: s.hearts,
      powerups: s.powerups,
      cam: s.cam,
      pipeCol: s.pipeCol,
    };
    const room = buildVoid();
    s.inBonus = true;
    s.cols = room.cols;
    s.leaves = room.leaves;
    s.hearts = room.hearts;
    s.enemies = [];
    s.powerups = [];
    s.fireballs = [];
    s.cam = 0;
    s.x = 2 * T;
    s.y = -SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.flash = 2;
    s.flashText = "SOUNDCLOUD VOID";
    s.mode = "running";
  };

  const leaveVoid = () => {
    const s = state.current;
    const saved = s.saved;
    s.inBonus = false;
    if (!saved) return;
    s.cols = saved.cols;
    s.enemies = saved.enemies;
    s.leaves = saved.leaves;
    s.hearts = saved.hearts;
    s.powerups = saved.powerups;
    s.fireballs = [];
    s.cam = saved.cam;
    const pc = s.cols[saved.pipeCol];
    const pc2 = s.cols[saved.pipeCol + 1];
    if (pc) pc.pipeUsed = true;
    if (pc2) pc2.pipeUsed = true;
    s.saved = null;
    // Pop out of the pipe you went into
    s.x = saved.pipeCol * T + T - SPRITE_W / 2;
    s.y = (pc ? pc.ground * T : 6 * T) - SPRITE_H - 2;
    s.vy = -260;
    s.invuln = 1;
    s.mode = "running";
  };

  const hurt = (pit = false) => {
    const s = state.current;
    if (hasFire() && !pit) {
      // Getting hit while you have fire only takes the fire away
      s.ammo = 0;
      s.fireTime = 0;
      s.invuln = 1.5;
      s.shake = 0.15;
      burst(s.x + SPRITE_W / 2, s.y + 8, 16, FIRE, 60);
      playPowerDown();
      return;
    }
    s.ammo = 0;
    s.fireTime = 0;
    s.lives -= 1;
    s.shake = 0.3;
    burst(s.x + SPRITE_W / 2, s.y + SPRITE_H / 2, 34, BOOM, 100);
    playHurt();
    if (s.lives <= 0) {
      s.mode = "dying";
      s.deadAt = s.t;
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    } else {
      s.mode = "hurt";
      s.hurtAt = s.t;
    }
  };

  const finishDeath = () => {
    const s = state.current;
    if (qualifies(Math.floor(s.score))) {
      s.mode = "entry";
      setMessage("");
      setShowEntry(true);
    } else {
      s.mode = "board";
      s.deadAt = s.t;
    }
  };

  // Called on OK / Enter / Space / tapping the middle of the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "ready") {
      s.mode = "running";
    } else if (s.mode === "running") {
      jump();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      newGame();
      s.mode = "running";
    }
  };

  // Bumping a bonus block from below: a flaming weed leaf pops out and slides away
  const bumpBlock = (col: number) => {
    const s = state.current;
    const c = colAt(col);
    c.bump = 0.15;
    if (c.used) {
      playBump();
      return;
    }
    c.used = true;
    s.powerups.push({
      x: col * T + 1,
      y: (c.bonus - 1) * T + 2,
      vx: s.facing >= 0 ? 45 : -45,
      vy: -140,
    });
    burst(col * T + 8, c.bonus * T, 8, FIRE, 40);
    playPowerAppear();
  };

  const killEnemy = (e: Enemy, points: number) => {
    const s = state.current;
    e.alive = false;
    e.squash = 0.35;
    s.bonus += points;
    popup(e.x + 7, e.y - 4, `+${points}`);
    burst(e.x + 7, e.y + 7, 12, e.kind === "flyer" ? [LIGHT_GREEN, DARK_GREEN, "#ffffff"] : ["#8a8a8a", "#ffffff", INK], 60);
    playStomp();
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;
    if (s.flash > 0) s.flash -= dt;

    for (const p of s.particles) {
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    for (const p of s.popups) {
      p.y -= 18 * dt;
      p.life -= dt;
    }
    s.popups = s.popups.filter((p) => p.life > 0);

    // Click wheel: turning it walks you that way for a moment
    const spin = spinRef.current;
    spinRef.current = 0;
    if (spin !== 0) {
      wheelRef.current.dir = spin > 0 ? 1 : -1;
      wheelRef.current.timer = 0.2;
    }
    if (wheelRef.current.timer > 0) {
      wheelRef.current.timer -= dt;
      if (wheelRef.current.timer <= 0) wheelRef.current.dir = 0;
    }

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 1.6) finishDeath();
      return;
    }
    if (s.mode === "hurt") {
      if (s.t - s.hurtAt > 1.2) {
        placeOnGroundNear(s.cam + 48);
        s.invuln = 1.5;
        s.mode = "running";
      }
      return;
    }
    if (s.mode === "pipe") {
      // Sink into the pipe, then switch worlds
      s.y += 45 * dt;
      s.pipeTimer -= dt;
      if (s.pipeTimer <= 0) {
        if (s.pipeDir > 0) enterVoid();
        else leaveVoid();
      }
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;
    if (s.invuln > 0) s.invuln -= dt;

    // Fire power runs out when the timer bar is empty
    if (s.fireTime > 0) {
      s.fireTime -= dt;
      if (s.fireTime <= 0) {
        s.fireTime = 0;
        s.ammo = 0;
        playPowerDown();
      }
    }

    // Which way do you want to go
    let want = 0;
    if (heldRef.current.left || touchRef.current < 0) want -= 1;
    if (heldRef.current.right || touchRef.current > 0) want += 1;
    if (want === 0) want = wheelRef.current.dir;
    if (want !== 0) s.facing = want;

    const target = want * RUN;
    if (s.vx < target) s.vx = Math.min(target, s.vx + ACCEL * dt);
    if (s.vx > target) s.vx = Math.max(target, s.vx - ACCEL * dt);
    s.vy = Math.min(420, s.vy + GRAVITY * dt);

    // Move sideways, then up/down, stopping at solid tiles
    const hx = () => s.x + HB_X;
    const hy = () => s.y + HB_Y;
    s.x += s.vx * dt;
    if (s.x + HB_X < s.cam) s.x = s.cam - HB_X; // can't go back past the left edge
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vx > 0) s.x = Math.floor((hx() + HB_W) / T) * T - HB_W - HB_X - 0.01;
      else if (s.vx < 0) s.x = (Math.floor(hx() / T) + 1) * T - HB_X + 0.01;
      s.vx = 0;
    }
    const prevBottom = hy() + HB_H;
    s.y += s.vy * dt;
    s.onGround = false;
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vy > 0) {
        s.y = Math.floor((hy() + HB_H) / T) * T - HB_H - HB_Y - 0.01;
        s.onGround = true;
      } else {
        // Head hit something: if it's a bonus block, bump it
        const headRow = Math.floor(hy() / T);
        for (const fx of [hx() + HB_W / 2, hx() + 1, hx() + HB_W - 1]) {
          const col = Math.floor(fx / T);
          const c = colAt(col);
          if (c.bonus === headRow) {
            bumpBlock(col);
            break;
          }
        }
        s.y = (headRow + 1) * T - HB_Y + 0.01;
      }
      s.vy = 0;
    }
    // Landing on bricks or thin lines from above
    if (!s.onGround && s.vy >= 0) {
      const bottom = hy() + HB_H;
      let landed = false;
      for (const fx of [hx() + 1, hx() + HB_W - 1]) {
        for (const top of oneWayTopsAt(fx)) {
          if (prevBottom <= top + 1 && bottom >= top) {
            s.y = top - HB_H - HB_Y - 0.01;
            s.vy = 0;
            s.onGround = true;
            landed = true;
            break;
          }
        }
        if (landed) break;
      }
    }
    if (s.onGround) s.coyote = 0.09;
    else if (s.coyote > 0) s.coyote -= dt;

    if (Math.abs(s.vx) > 5 && s.onGround) s.runAnim += dt;

    // Camera follows you forward only (in the Void it stays inside the room)
    if (s.inBonus) {
      s.cam = Math.max(0, Math.min(s.cols.length * T - W, s.x - 110));
    } else {
      s.cam = Math.max(s.cam, s.x - 90);
      generateUpTo(Math.floor((s.cam + W) / T) + 4);
    }

    // Score: distance + bonus
    if (!s.inBonus) s.farthest = Math.max(s.farthest, s.x);
    s.score = Math.floor(s.farthest / T) + s.bonus;

    // Fell in a pit
    if (s.y > H + 10) {
      hurt(true);
      return;
    }

    // Zone name when you enter a new zone
    if (!s.inBonus) {
      const zoneIndex = Math.floor(Math.floor(s.x / T) / ZONE_LEN);
      if (zoneIndex > s.zoneShown) {
        s.zoneShown = zoneIndex;
        s.flash = 2;
        s.flashText = `ZONE ${zoneIndex + 1}: ${ZONE_NAMES[zoneIndex % ZONE_NAMES.length]}`;
      }
    }

    // Bonus block bounce animation
    for (let col = Math.floor(s.cam / T); col <= Math.floor((s.cam + W) / T); col++) {
      const c = colAt(col);
      if (c.bump > 0) c.bump -= dt;
    }

    // Flaming weed leaves slide along and bounce off walls
    for (const pu of s.powerups) {
      pu.vy = Math.min(300, pu.vy + GRAVITY * 0.7 * dt);
      pu.x += pu.vx * dt;
      const front = pu.vx > 0 ? pu.x + 14 : pu.x;
      if (solidAt(front, pu.y + 7)) pu.vx = -pu.vx;
      pu.y += pu.vy * dt;
      if (solidAt(pu.x + 7, pu.y + 14)) {
        pu.y = Math.floor((pu.y + 14) / T) * T - 14;
        pu.vy = 0;
      }
      if (hx() + HB_W > pu.x && hx() < pu.x + 14 && hy() + HB_H > pu.y && hy() < pu.y + 14) {
        // 5 fireballs and a full timer. Doesn't stack: it just refills.
        s.ammo = FIRE_AMMO;
        s.fireTime = FIRE_TIME;
        s.bonus += 100;
        popup(pu.x + 7, pu.y - 4, "FIRE!");
        burst(pu.x + 7, pu.y + 7, 20, FIRE, 70);
        playPowerUp();
        pu.y = 999;
      }
    }
    s.powerups = s.powerups.filter((pu) => pu.y < H + 20 && pu.x > s.cam - 40);

    // Little flames around you while you have fire
    if (hasFire()) {
      s.auraTimer -= dt;
      if (s.auraTimer <= 0) {
        s.auraTimer = 0.07;
        s.particles.push({
          x: s.x + rand(6, 18),
          y: s.y + rand(0, 10),
          vx: rand(-10, 10),
          vy: rand(-60, -30),
          color: FIRE[Math.floor(Math.random() * 3)],
          life: rand(0.2, 0.4),
        });
      }
    }

    // Fireballs bounce along the ground and burn monsters
    for (const f of s.fireballs) {
      f.life -= dt;
      f.vy = Math.min(300, f.vy + 900 * dt);
      f.x += f.vx * dt;
      if (solidAt(f.x + (f.vx > 0 ? 4 : 0), f.y + 2)) {
        f.life = 0;
        burst(f.x, f.y, 6, FIRE, 40);
        continue;
      }
      f.y += f.vy * dt;
      if (solidAt(f.x + 2, f.y + 4)) {
        f.y = Math.floor((f.y + 4) / T) * T - 4;
        f.vy = -170;
      }
      if (f.x < s.cam - 10 || f.x > s.cam + W + 10 || f.y > H) f.life = 0;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        const ew = e.kind === "flyer" ? 18 : 14;
        if (f.x + 4 > e.x && f.x < e.x + ew && f.y + 4 > e.y && f.y < e.y + 14) {
          killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          f.life = 0;
          break;
        }
      }
    }
    s.fireballs = s.fireballs.filter((f) => f.life > 0);

    // Monsters
    for (const e of s.enemies) {
      if (!e.alive) {
        e.squash -= dt;
        continue;
      }
      if (e.x < s.cam - 60 || e.x > s.cam + W + 40) {
        if (e.x < s.cam - 60) e.alive = false;
        continue;
      }
      if (e.kind === "flyer") {
        // Green flyer: floats left in a wave
        e.phase += dt * 2.6;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.phase) * 14;
      } else {
        // Walker: walks, turns at edges and walls
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        const front = e.vx < 0 ? e.x : e.x + 14;
        const footRow = Math.floor((e.y + 14) / T);
        const wall = solidAt(front, e.y + 7);
        const edge = !solidAt(front, (footRow + 0.5) * T);
        if (wall || edge) e.vx = -e.vx;
        e.y += e.vy * dt;
        if (solidAt(e.x + 7, e.y + 14)) {
          e.y = Math.floor((e.y + 14) / T) * T - 14;
          e.vy = 0;
        }
        if (e.y > H + 20) e.alive = false;
      }

      // Touching you
      const ew = e.kind === "flyer" ? 18 : 14;
      const px1 = hx();
      const py1 = hy();
      if (px1 + HB_W > e.x + 2 && px1 < e.x + ew - 2 && py1 + HB_H > e.y + 2 && py1 < e.y + 12) {
        const falling = s.vy > 0 && py1 + HB_H - e.y < 10;
        if (falling) {
          killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          s.vy = STOMP_BOUNCE;
        } else if (s.invuln <= 0) {
          hurt();
          return;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.squash > 0);

    // Weed leaves: points
    for (const l of s.leaves) {
      if (l.taken) continue;
      if (hx() + HB_W > l.x && hx() < l.x + 14 && hy() + HB_H > l.y && hy() < l.y + 14) {
        l.taken = true;
        s.bonus += PTS_LEAF;
        burst(l.x + 7, l.y + 7, 8, [GREEN, DARK_GREEN, "#ffffff"], 45);
        playLeaf();
      }
    }
    s.leaves = s.leaves.filter((l) => !l.taken && l.x > s.cam - 40);

    // Hearts: an extra life (max 4)
    for (const h of s.hearts) {
      if (h.taken) continue;
      if (hx() + HB_W > h.x && hx() < h.x + 14 && hy() + HB_H > h.y && hy() < h.y + 12) {
        h.taken = true;
        if (s.lives < MAX_LIVES) {
          s.lives += 1;
          popup(h.x + 7, h.y - 4, "+1 LIFE");
        } else {
          s.bonus += 200;
          popup(h.x + 7, h.y - 4, "+200");
        }
        burst(h.x + 7, h.y + 6, 16, [PINK, "#ffffff", DARK_PINK], 60);
        playHeart();
      }
    }
    s.hearts = s.hearts.filter((h) => !h.taken && h.x > s.cam - 40);
  };

  // ---------- Drawing ----------

  const drawSfxIcon = (ctx: CanvasRenderingContext2D, color: string) => {
    const x = 6;
    const y = 5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 2, 2, 3);
    ctx.fillRect(x + 2, y + 1, 1, 5);
    ctx.fillRect(x + 3, y, 1, 7);
    if (sfxOnRef.current) {
      ctx.fillRect(x + 5, y + 2, 1, 3);
      ctx.fillRect(x + 7, y + 1, 1, 5);
    } else {
      ctx.fillStyle = PINK;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
        ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
      }
    }
  };

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, W / 2, y);
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const status = boardStatusRef.current;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = INK;
    ctx.textAlign = "center";

    if (status !== "ok") {
      ctx.fillText("GAME OVER", W / 2, 40);
      ctx.fillText(`SCORE ${pad(s.score)}`, W / 2, 58);
      ctx.fillText(status === "loading" ? "LOADING SCORES..." : "SCOREBOARD OFFLINE", W / 2, 80);
    } else {
      ctx.fillText("TOP 10", W / 2, 8);
      const b = boardRef.current;
      if (b.length === 0) ctx.fillText("NO SCORES YET", W / 2, 60);
      b.slice(0, 10).forEach((e, i) => {
        const y = 22 + i * 11;
        if (e.name === myNameRef.current) {
          ctx.fillStyle = PINK;
          ctx.fillRect(24, y - 2, W - 48, 11);
        }
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
        ctx.textAlign = "right";
        ctx.fillText(pad(e.score), W - 28, y);
      });
      ctx.textAlign = "center";
      ctx.fillText(`YOU ${pad(s.score)}`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText("OK TO PLAY AGAIN", W / 2, 148);
  };

  // Background for each zone (moves slower than the level, so it feels far away)
  const drawBackground = (ctx: CanvasRenderingContext2D, zone: number) => {
    const s = state.current;
    const cam = s.cam;

    if (zone === VOID_ZONE) {
      // SoundCloud Void: dark room with a moving sound wave
      ctx.fillStyle = VOID_BG;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      for (let i = 0; i < W / 4 + 1; i++) {
        const h = 10 + (Math.sin(s.t * 3 + i * 0.5) + 1) * 14 + hash(i) * 12;
        ctx.fillStyle = i % 2 === 0 ? "#3a1a44" : "#2a1234";
        ctx.fillRect(i * 4, 64 - h / 2, 3, h);
      }
      return;
    }

    ctx.fillStyle = zone === 3 ? CLOUD_SKY : SCREEN;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    if (zone === 0) {
      // Rolling hills
      ctx.fillStyle = HILLS;
      const off = -((cam * 0.3) % 120);
      for (let i = -1; i < 4; i++) {
        const x = off + i * 120;
        ctx.beginPath();
        ctx.moveTo(x, 130);
        ctx.quadraticCurveTo(x + 50, 70, x + 100, 130);
        ctx.fill();
      }
    } else if (zone === 1) {
      // Far-away speaker stacks
      const base = Math.floor((cam * 0.3) / 40);
      for (let i = -1; i < W / 40 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 40 - cam * 0.3);
        const h = 40 + Math.floor(hash(idx) * 50);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 130 - h, 30, h);
        ctx.fillStyle = SCREEN;
        for (let yy = 130 - h + 6; yy < 124; yy += 14) {
          ctx.beginPath();
          ctx.arc(x + 15, yy + 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (zone === 2) {
      // City skyline with lit windows
      const base = Math.floor((cam * 0.25) / 24);
      for (let i = -1; i < W / 24 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 24 - cam * 0.25);
        const h = 30 + Math.floor(hash(idx + 7) * 70);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 140 - h, 22, h);
        ctx.fillStyle = "#e7b3e0";
        for (let yy = 140 - h + 4; yy < 134; yy += 8) {
          for (let xx = 3; xx < 20; xx += 6) {
            if (hash(idx * 31 + yy + xx) > 0.55) ctx.fillRect(x + xx, yy, 2, 3);
          }
        }
      }
    } else {
      // Pink clouds drifting in the sky
      const base = Math.floor((cam * 0.2) / 70);
      for (let i = -1; i < W / 70 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 70 - cam * 0.2 + Math.sin(s.t * 0.3 + idx) * 4);
        const y = 20 + Math.floor(hash(idx + 3) * 60);
        ctx.fillStyle = "#fbe3f6";
        ctx.beginPath();
        ctx.arc(x + 14, y + 10, 10, 0, Math.PI * 2);
        ctx.arc(x + 28, y + 6, 13, 0, Math.PI * 2);
        ctx.arc(x + 42, y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 12, y + 10, 32, 10);
      }
    }
  };

  const drawGround = (ctx: CanvasRenderingContext2D, c: Column, col: number, x: number) => {
    const s = state.current;
    const gy = c.ground * T;
    if (c.pipe) return;
    if (c.zone === VOID_ZONE) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = GREEN;
      ctx.fillRect(x, gy, T, 2);
      // weed pattern in the floor
      if (gy < H - 12) drawPixels(ctx, LEAF, x + 4, gy + 6, { G: DARK_GREEN, D: "#10401a" });
      return;
    }
    if (c.zone === 3) {
      // Fluffy cloud islands
      ctx.fillStyle = CLOUD;
      ctx.fillRect(x, gy + 4, T, H - gy);
      ctx.beginPath();
      ctx.arc(x + 8, gy + 6, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy + 4, T, 1);
      ctx.fillStyle = "#f3c6ec";
      ctx.fillRect(x + ((col * 5) % 10) + 2, gy + 12, 3, 2);
      return;
    }
    if (c.zone === 2) {
      ctx.fillStyle = ROOF;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = ROOF_LINE;
      for (let yy = gy + 6; yy < H; yy += 8) ctx.fillRect(x, yy, T, 1);
      ctx.fillRect(x + (col % 2) * 8 + 3, gy + 6, 1, H - gy - 6);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 1);
      return;
    }
    if (c.zone === 1) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 2);
      for (let yy = gy + 5; yy + 8 < H; yy += 14) {
        ctx.fillStyle = DARK_PINK;
        ctx.fillRect(x + 4, yy, 8, 8);
        ctx.fillStyle = INK;
        ctx.fillRect(x + 6, yy + 2, 4, 4);
        ctx.fillStyle = PINK;
        ctx.fillRect(x + 7, yy + 3, 2, 2);
      }
      return;
    }
    ctx.fillStyle = INK;
    ctx.fillRect(x, gy, T, H - gy);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, gy, T, 2);
    ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 7, 2, 2);
    ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 20, 2, 2);
    void s;
  };

  const drawBrick = (ctx: CanvasRenderingContext2D, x: number, by: number, zone: number) => {
    if (zone === 3 || zone === VOID_ZONE) {
      // cloud puffs / void blocks
      ctx.fillStyle = zone === 3 ? CLOUD : "#2d1838";
      ctx.fillRect(x, by + 2, T, T - 4);
      ctx.fillStyle = zone === 3 ? PINK : GREEN;
      ctx.fillRect(x, by + 2, T, 1);
      return;
    }
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by, T, T);
    ctx.fillStyle = PINK;
    ctx.fillRect(x + 1, by + 1, T - 2, T - 2);
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by + 7, T, 1);
    ctx.fillRect(x + 7, by, 1, 7);
    ctx.fillRect(x + 3, by + 8, 1, 8);
    ctx.fillRect(x + 11, by + 8, 1, 8);
  };

  const drawPipe = (ctx: CanvasRenderingContext2D, c: Column, x: number) => {
    const s = state.current;
    const top = c.ground * T;
    const left = c.pipe === 1;
    // body
    ctx.fillStyle = INK;
    ctx.fillRect(x, top + 6, T, H - top);
    ctx.fillStyle = c.pipeUsed ? "#6c6474" : DARK_PINK;
    ctx.fillRect(x + (left ? 2 : 0), top + 6, T - 2, H - top);
    ctx.fillStyle = c.pipeUsed ? "#8a8292" : PINK;
    if (left) ctx.fillRect(x + 4, top + 6, 3, H - top);
    // rim
    ctx.fillStyle = INK;
    ctx.fillRect(x - (left ? 2 : 0), top, T + 2, 7);
    ctx.fillStyle = c.pipeUsed ? "#8a8292" : PINK;
    ctx.fillRect(x - (left ? 1 : 0), top + 1, T + (left ? 1 : -1), 5);
    // the dark opening, with a little glow while it can still be used
    if (!c.pipeUsed && left) {
      const glow = Math.floor(s.t * 3) % 2 === 0 ? "#ff7a00" : "#ffc800";
      ctx.fillStyle = glow;
      ctx.fillRect(x + 10, top - 6, 12, 2);
      ctx.fillStyle = INK;
      ctx.fillRect(x + 15, top - 10, 2, 3);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }

    const cam = Math.round(s.cam);
    const viewZone = s.inBonus ? VOID_ZONE : colAt(Math.floor((cam + W / 2) / T)).zone;

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));

    drawBackground(ctx, viewZone);

    const firstCol = Math.floor(cam / T);

    // Level: ground, bricks, thin lines, bonus blocks, pipes
    for (let col = firstCol; col <= firstCol + W / T + 1; col++) {
      const c = colAt(col);
      const x = col * T - cam;
      if (c.ground >= 0 && !c.pipe) drawGround(ctx, c, col, x);
      if (c.pipe) drawPipe(ctx, c, x);
      if (c.block >= 0) drawBrick(ctx, x, c.block * T, c.zone);
      if (c.block2 >= 0) drawBrick(ctx, x, c.block2 * T, c.zone);
      if (c.line >= 0) {
        const ly = c.line * T;
        ctx.fillStyle = INK;
        ctx.fillRect(x, ly, T, c.lineTh + 1);
        ctx.fillStyle = c.zone === VOID_ZONE ? LIGHT_GREEN : PINK;
        ctx.fillRect(x, ly, T, c.lineTh);
      }
      if (c.bonus >= 0) {
        const by = c.bonus * T - (c.bump > 0 ? Math.round(Math.sin((c.bump / 0.15) * Math.PI) * 4) : 0);
        if (c.used) {
          ctx.fillStyle = "#555555";
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = "#777777";
          ctx.fillRect(x + 2, by + 2, T - 4, T - 4);
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = Math.floor(s.t * 3) % 2 === 0 ? "#ff7a00" : PINK;
          ctx.fillRect(x, by, T, 1);
          ctx.fillRect(x, by + T - 1, T, 1);
          ctx.fillRect(x, by, 1, T);
          ctx.fillRect(x + T - 1, by, 1, T);
          drawPixels(ctx, LEAF, x + 4, by + 4, { G: "#ff7a00", D: "#ffc800" }, 1);
        }
      }
    }

    // Leaves and hearts
    for (const l of s.leaves) {
      drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x) * 2), { G: GREEN, D: DARK_GREEN }, 2);
    }
    for (const h of s.hearts) {
      const bob = Math.round(Math.sin(s.t * 5 + h.x) * 2);
      drawPixels(ctx, HEART, h.x - cam + 1, h.y + bob + 1, { P: INK }, 2);
      drawPixels(ctx, HEART, h.x - cam, h.y + bob, { P: Math.floor(s.t * 4) % 2 === 0 ? PINK : "#ff5fe0" }, 2);
    }

    // Flaming weed leaves (the power-up)
    for (const pu of s.powerups) {
      const x = pu.x - cam;
      drawPixels(ctx, LEAF, x, pu.y, { G: "#ff7a00", D: "#d21e1e" }, 2);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = FIRE[(Math.floor(s.t * 12) + k) % 3];
        ctx.fillRect(Math.round(x + 2 + k * 4 + rand(-1, 1)), Math.round(pu.y - 3 - rand(0, 3)), 2, 2);
      }
    }

    // Fireballs
    for (const f of s.fireballs) {
      const x = Math.round(f.x - cam);
      const y = Math.round(f.y);
      ctx.fillStyle = "#ff7a00";
      ctx.fillRect(x, y, 5, 5);
      ctx.fillStyle = "#ffc800";
      ctx.fillRect(x + 1, y + 1, 3, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }

    // Monsters (squashed flat when beaten)
    for (const e of s.enemies) {
      const x = e.x - cam;
      if (e.kind === "flyer") {
        if (e.alive) {
          const frame = Math.floor(s.t * 8 + e.phase) % 2;
          drawPixels(ctx, FLYER[frame], x, e.y, { G: LIGHT_GREEN, D: DARK_GREEN, W: "#ffffff" }, 2);
        } else {
          ctx.fillStyle = LIGHT_GREEN;
          ctx.fillRect(x + 2, e.y + 10, 14, 3);
        }
      } else if (e.alive) {
        const bob = Math.floor(s.t * 6 + e.x) % 2;
        drawPixels(ctx, HATER, x, e.y - bob, { G: "#8a8a8a", K: INK, W: "#ffffff" }, 2);
      } else {
        ctx.fillStyle = "#8a8a8a";
        ctx.fillRect(x, e.y + 10, 14, 4);
      }
    }

    // You
    const blinking = s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0;
    if ((s.mode === "ready" || s.mode === "running" || s.mode === "pipe") && !blinking) {
      const sprite = spriteRef.current;
      const frame = s.onGround && Math.abs(s.vx) > 5 ? Math.floor(s.runAnim * 10) % 2 : 0;
      const x = Math.round(s.x - cam);
      const y = Math.round(s.y);
      ctx.save();
      if (s.mode === "pipe") {
        // Only draw the part above the pipe while sinking in
        const c = colAt(s.pipeCol);
        ctx.beginPath();
        ctx.rect(0, 0, W, c.ground * T);
        ctx.clip();
      }
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        if (s.facing < 0) {
          ctx.translate(x + SPRITE_W, y);
          ctx.scale(-1, 1);
          ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
        } else {
          ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, SPRITE_W, SPRITE_H);
        }
      } else {
        ctx.fillStyle = PINK;
        ctx.fillRect(x + HB_X, y + HB_Y, HB_W, HB_H);
      }
      ctx.restore();
    }

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam), Math.round(p.y), 2, 2);
    }

    ctx.restore();

    // Point popups
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const p of s.popups) {
      ctx.fillStyle = INK;
      ctx.fillText(p.text, Math.round(p.x - cam) + 1, Math.round(p.y) + 1);
      ctx.fillStyle = p.text.startsWith("+1") ? PINK : "#ffc800";
      ctx.fillText(p.text, Math.round(p.x - cam), Math.round(p.y));
    }

    // HUD
    const hudInk = viewZone === VOID_ZONE ? "#ffffff" : INK;
    drawSfxIcon(ctx, hudInk);
    ctx.fillStyle = hudInk;
    ctx.textAlign = "left";
    ctx.fillText(pad(s.score), 22, 6);
    ctx.textAlign = "right";
    ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);

    // Hearts = lives (max 4)
    for (let i = 0; i < MAX_LIVES; i++) {
      const x = W / 2 - 34 + i * 16;
      drawPixels(ctx, HEART, x + 1, 5, { P: INK }, 1);
      drawPixels(ctx, HEART, x, 4, { P: i < s.lives ? PINK : "#9b8fa6" }, 1);
    }

    // Fire power: 5 fireball icons + a blinking orange timer bar along the bottom
    if (hasFire()) {
      for (let i = 0; i < FIRE_AMMO; i++) {
        const x = W / 2 - 15 + i * 6;
        ctx.fillStyle = i < s.ammo ? "#ff7a00" : "#9b8fa6";
        ctx.fillRect(x, 14, 4, 4);
        if (i < s.ammo) {
          ctx.fillStyle = "#ffc800";
          ctx.fillRect(x + 1, 15, 2, 2);
        }
      }
      const left = s.fireTime / FIRE_TIME;
      const low = s.fireTime < 4;
      const barOn = !low || Math.floor(s.t * 8) % 2 === 0;
      ctx.fillStyle = INK;
      ctx.fillRect(8, H - 6, W - 16, 4);
      if (barOn) {
        ctx.fillStyle = Math.floor(s.t * 6) % 2 === 0 ? "#ff7a00" : "#ffc800";
        ctx.fillRect(9, H - 5, Math.max(0, Math.round((W - 18) * left)), 2);
      }
    }

    // Messages
    const blink = Math.floor(s.t * 2) % 2 === 0;
    ctx.textAlign = "center";
    if (s.mode === "ready") {
      textBox(ctx, "SUPER PINKMANE", 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 70);
    } else if ((s.mode === "running" || s.mode === "pipe") && s.flash > 0) {
      textBox(ctx, s.flashText, 36);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, pad(s.score), 44);
    }
    // Hint on top of an unused pipe
    if (s.mode === "running" && pipeUnderFeet() >= 0 && blink) {
      textBox(ctx, s.inBonus ? "PRESS DOWN TO LEAVE" : "PRESS DOWN TO ENTER", 88);
    }
  };

  // Start the game loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const sprite = new Image();
    sprite.src = "/game/pinkdude.png";
    spriteRef.current = sprite;
    deathSoundRef.current = new Audio(DEATH_SOUND);

    // Owner code: open the site once with ?owner=YOURCODE on each of your devices
    try {
      const params = new URLSearchParams(window.location.search);
      const ownerParam = params.get("owner");
      if (ownerParam) {
        localStorage.setItem(OWNER_KEY, ownerParam);
        params.delete("owner");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    } catch {}

    try {
      sfxOnRef.current = localStorage.getItem(SFX_KEY) !== "off";
      const saved = Number(localStorage.getItem(BEST_KEY));
      if (saved > 0) state.current.best = saved;
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) {
        nameRef.current = savedName;
        setName(savedName);
      }
    } catch {}

    loadBoard();
    newGame();

    // Keyboard: ← → / A D walk, ↑ / W jump (Space and Enter jump through the iPod),
    // F / X shoot, ↓ / S go down a pipe (or shoot), M = game sounds on/off
    const keyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = true;
      if (k === "ArrowUp" || k === "w" || k === "W") jump();
      if (k === "ArrowDown" || k === "s" || k === "S") down();
      if (k === "f" || k === "F" || k === "x" || k === "X") shoot();
      if (k === "m" || k === "M") toggleSfx();
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = false;
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls (jump)
  useEffect(() => {
    if (actionSignal !== firstSignal.current) press();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal]);

  const buttonStyle: React.CSSProperties = {
    fontFamily,
    fontSize: "clamp(8px, 2.4vw, 11px)",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        // Phones: hold the left or right third to walk, tap the middle to jump,
        // swipe down in the middle to shoot / go down a pipe. Speaker icon (top-left) = sounds.
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cx = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          if (cx < 20 && cy < 18) {
            toggleSfx();
            return;
          }
          const mode = state.current.mode;
          if (mode === "entry") return;
          if (mode !== "running") {
            press();
            return;
          }
          if (cx < W * 0.33) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = -1;
          } else if (cx > W * 0.67) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = 1;
          } else if (cy > H * 0.6) {
            down();
          } else {
            jump();
          }
        }}
        onPointerUp={() => {
          touchRef.current = 0;
        }}
        onPointerCancel={() => {
          touchRef.current = 0;
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: SCREEN,
          touchAction: "none",
          cursor: "pointer",
        }}
      />

      {showEntry && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "12%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            zIndex: 10,
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={12}
            placeholder="YOUR NAME"
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "");
              nameRef.current = v;
              setName(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") skipEntry();
            }}
            style={{
              fontFamily,
              fontSize: "clamp(10px, 3vw, 13px)",
              width: "60%",
              textAlign: "center",
              padding: "6px",
              background: INK,
              color: "#fff",
              border: `2px solid ${PINK}`,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={submitName} disabled={saving} style={{ ...buttonStyle, background: PINK, color: "#fff" }}>
              {saving ? "SAVING..." : "SAVE"}
            </button>
            <button onClick={skipEntry} style={{ ...buttonStyle, background: "#bbb", color: INK }}>
              SKIP
            </button>
          </div>
          {message && (
            <div style={{ fontFamily, fontSize: "clamp(7px, 2vw, 9px)", color: "#b00020" }}>{message}</div>
          )}
        </div>
      )}
    </>
  );
}
