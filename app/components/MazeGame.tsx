"use client";

import { useEffect, useRef, useState } from "react";
import { PAUSE_ROWS_SIMPLE, drawPauseButton, drawPauseMenu, leaveToGameMenu, pauseBtnHit, pauseKey, pauseTapRow } from "./PinkShop";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // true on phones / tablets: swipe ANYWHERE on the screen to steer (no need to lift your finger), and the game is a bit kinder
  touch?: boolean;
};

type Mode = "ready" | "running" | "caught" | "dying" | "entry" | "board";
type Dir = { x: number; y: number };
// Something that walks the maze: standing on tile (cx, cy), walking toward the next tile
type Walker = { cx: number; cy: number; prog: number; dir: Dir; next: Dir };
type HaterMode = "home" | "chase" | "scared" | "eyes";
type Hater = Walker & { mode: HaterMode; wait: number; style: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;
const T = 8; // one maze tile
const OX = 4;
const OY = 20;

// The maze: # wall, . seed, o weed leaf, H haters' home, = door (only haters use it), P start
const MAZE = [
  "###############################",
  "#o..........#.....#..........o#",
  "#.####.####.#.###.#.####.####.#",
  "#.............................#",
  "#.####.#.#####...#####.#.####.#",
  "#......#....###=###....#......#",
  "######.####.#HHHHH#.####.######",
  "######.####.#HHHHH#.####.######",
  "#......#....#######....#......#",
  "#..............P..............#",
  "#.####.######.#.#.######.####.#",
  "#...#.........#.#.........#...#",
  "###.#.#.#####.#.#.#####.#.#.###",
  "#.....#.....#.....#.....#.....#",
  "#.#########.#.###.#.#########.#",
  "#o...........................o#",
  "###############################",
];
const COLS = MAZE[0].length;
const ROWS = MAZE.length;
const START = { x: 15, y: 9 };
const DOOR_OUT = { x: 15, y: 4 }; // the tile just outside the haters' door
const HOME = [
  { x: 14, y: 6 },
  { x: 16, y: 6 },
  { x: 14, y: 7 },
  { x: 16, y: 7 },
];

const START_LIVES = 3;
const WHEEL_TURN = 40; // degrees of click wheel = one turn

// ---------- PHONES (easy tuning) ----------
const SWIPE_PX = 14; // how far a finger slides for one turn (in screen pixels, smaller = more sensitive)
const TURN_GRACE = 0.35; // a turn pressed a moment too late (up to this much of a tile past a corner) still takes the corner
const TOUCH_HATER_SPEED = 0.88; // on phones the haters are this much slower (1 = the same as on a computer)
const TOUCH_SCARED_BONUS = 1.5; // ...and they stay scared this many seconds longer

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinkmaze-best";
const SFX_KEY = "pinkmaze-sfx";
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const PURPLE = "#b04ad8";
const BOOM = [PINK, "#ffc800", INK, "#ffffff", DARK_PINK];

// You: yellow face with the pink mohawk (two frames: mouth closed / open)
const PLAYER_FRAMES = [
  [
    "P.P.P..",
    ".PPP...",
    ".YYYYY.",
    "YWKYWKY",
    "YYYYYYY",
    "YYKKKYY",
    ".YYYYY.",
  ],
  [
    "P.P.P..",
    ".PPP...",
    ".YYYYY.",
    "YWKYWKY",
    "YYKKKYY",
    "YYKRKYY",
    ".YKKKY.",
  ],
];

// Haters: grumpy grey clouds. Scared ones turn purple and wobbly.
const HATER = [
  ".GG.GG.",
  "GGGGGGG",
  "GKKGKKG",
  "GWKGWKG",
  "GGGGGGG",
  "GGKKKGG",
  ".GGGGG.",
];
const HATER_SCARED = [
  ".UU.UU.",
  "UUUUUUU",
  "UUUUUUU",
  "UWUUUWU",
  "UUUUUUU",
  "UWUWUWU",
  ".UUUUU.",
];
const HATER_EYES = [
  ".......",
  ".......",
  ".......",
  "WK.WK..",
  ".......",
  ".......",
  ".......",
];
const HATER_COLORS = ["#8a8a8a", "#6e6e6e", "#a0a0a0", "#7c7c7c"];

const LEAF = [
  "..G..",
  "G.G.G",
  "GGGGG",
  ".GGG.",
  "..D..",
];

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

function tileAt(x: number, y: number) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return "#";
  return MAZE[y][x];
}

function isWall(x: number, y: number) {
  const t = tileAt(x, y);
  return t === "#" || t === "H" || t === "=";
}

function same(a: Dir, b: Dir) {
  return a.x === b.x && a.y === b.y;
}

function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  colors: Record<string, string>
) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const color = colors[rows[r][c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
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

export default function MazeGame({ actionSignal, spinRef, fontFamily, muted, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // the pause menu (the same one in every game, see PinkShop.ts)
  const pauseRef = useRef({ on: false, row: 0, t: 0 });
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const sfxOnRef = useRef(true);
  const swipeRef = useRef<{ x: number; y: number } | null>(null);

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
    player: { cx: START.x, cy: START.y, prog: 0, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } } as Walker,
    haters: [] as Hater[],
    seeds: [] as boolean[][], // true = still there
    leaves: [] as boolean[][],
    left: 0, // seeds + leaves still on the board
    score: 0,
    best: 0,
    lives: START_LIVES,
    level: 1,
    scared: 0, // seconds the haters stay scared
    combo: 0,
    wheelAcc: 0,
    releaseTimer: 0,
    particles: [] as Particle[],
    popups: [] as { x: number; y: number; text: string; life: number }[],
    munch: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    caughtAt: 0,
    shake: 0,
    flash: 0,
    flashText: "",
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

  let munchFlip = false;
  const playMunch = () => {
    munchFlip = !munchFlip;
    beep(munchFlip ? 420 : 340, munchFlip ? 300 : 460, 0.05, 0.03, "triangle");
  };
  const playLeaf = () => [392, 523, 659, 784].forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.06));
  const playEatHater = () => beep(200, 1200, 0.22, 0.07, "sawtooth");
  const playCaught = () => beep(600, 80, 0.6, 0.08, "square");
  const playLevel = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f, 0.09, 0.05, "square", i * 0.07));
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
      const res = await fetch("/api/scores?game=maze", { cache: "no-store" });
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
          game: "maze",
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

  // ---------- Game ----------

  const px = (w: Walker) => OX + (w.cx + w.dir.x * w.prog) * T;
  const py = (w: Walker) => OY + (w.cy + w.dir.y * w.prog) * T;

  const fillBoard = () => {
    const s = state.current;
    s.seeds = [];
    s.leaves = [];
    s.left = 0;
    for (let y = 0; y < ROWS; y++) {
      s.seeds.push([]);
      s.leaves.push([]);
      for (let x = 0; x < COLS; x++) {
        const t = MAZE[y][x];
        s.seeds[y].push(t === ".");
        s.leaves[y].push(t === "o");
        if (t === "." || t === "o") s.left += 1;
      }
    }
  };

  const placeEveryone = () => {
    const s = state.current;
    s.player = { cx: START.x, cy: START.y, prog: 0, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } };
    s.haters = HOME.map((h, i) => ({
      cx: h.x,
      cy: h.y,
      prog: 0,
      dir: { x: 0, y: -1 },
      next: { x: 0, y: -1 },
      mode: "home" as HaterMode,
      wait: 2 + i * 4,
      style: i,
    }));
    s.scared = 0;
  };

  const newGame = () => {
    const s = state.current;
    s.score = 0;
    s.lives = START_LIVES;
    s.level = 1;
    s.runTime = 0;
    s.particles = [];
    s.popups = [];
    fillBoard();
    placeEveryone();
  };

  // Steer to an exact direction (arrows, swipes). The turn is remembered until it's possible,
  // so you can swipe a little BEFORE a corner and you'll take it when you get there.
  const steer = (x: number, y: number) => {
    const s = state.current;
    if (s.mode !== "running") return;
    const p = s.player;
    p.next = { x, y };
    // Turning around is allowed any time
    if (p.dir.x === -x && p.dir.y === -y && p.prog > 0) {
      p.cx += p.dir.x;
      p.cy += p.dir.y;
      p.prog = 1 - p.prog;
      p.dir = { x, y };
      return;
    }
    // A turn pressed a moment too LATE: you've only just passed a corner where that way is open, so go back and take it
    const sideways = (x !== 0) !== (p.dir.x !== 0);
    if (sideways && p.prog > 0 && p.prog < TURN_GRACE && !isWall(p.cx + x, p.cy + y)) {
      p.prog = 0;
      p.dir = { x, y };
    }
  };

  // Turn left / right from where you're heading (click wheel)
  const turn = (right: boolean) => {
    const d = state.current.player.next;
    if (right) steer(-d.y, d.x);
    else steer(d.y, -d.x);
  };

  // Called on OK / Enter / Space / tapping the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "ready") {
      s.mode = "running";
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      newGame();
      s.mode = "running";
    }
  };

  const hatersSpeed = () => Math.min(6.0, 3.8 + (state.current.level - 1) * 0.35) * (touchRef.current ? TOUCH_HATER_SPEED : 1);
  const playerSpeed = () => Math.min(6.4, 5.4 + (state.current.level - 1) * 0.2);
  const scaredTime = () => Math.max(3, 7 - (state.current.level - 1) * 0.8) + (touchRef.current ? TOUCH_SCARED_BONUS : 0);

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power, power),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.4, 1.0),
      });
    }
  };

  // You arrived in the middle of a tile: eat what's there and pick the next direction
  const playerArrive = () => {
    const s = state.current;
    const p = s.player;
    if (s.seeds[p.cy][p.cx]) {
      s.seeds[p.cy][p.cx] = false;
      s.left -= 1;
      s.score += 10;
      playMunch();
    }
    if (s.leaves[p.cy][p.cx]) {
      s.leaves[p.cy][p.cx] = false;
      s.left -= 1;
      s.score += 50;
      s.scared = scaredTime();
      s.combo = 0;
      for (const h of s.haters) {
        if (h.mode === "chase") {
          h.mode = "scared";
          h.dir = { x: -h.dir.x, y: -h.dir.y };
          h.cx += h.prog > 0 ? -h.dir.x : 0;
          h.cy += h.prog > 0 ? -h.dir.y : 0;
          h.prog = h.prog > 0 ? 1 - h.prog : 0;
        }
      }
      burst(OX + p.cx * T + 4, OY + p.cy * T + 4, 12, [GREEN, DARK_GREEN, "#ffffff"], 45);
      playLeaf();
    }
    if (!isWall(p.cx + p.next.x, p.cy + p.next.y)) p.dir = { ...p.next };
  };

  const moveWalker = (
    w: Walker,
    dist: number,
    onArrive: () => void,
    canEnter: (x: number, y: number) => boolean
  ) => {
    let remaining = dist;
    let guard = 0;
    while (remaining > 0 && guard++ < 10) {
      if (w.prog === 0) {
        onArrive();
        if (!canEnter(w.cx + w.dir.x, w.cy + w.dir.y)) return; // blocked: stand still
      }
      w.prog += remaining;
      if (w.prog >= 1) {
        remaining = w.prog - 1;
        w.prog = 0;
        w.cx += w.dir.x;
        w.cy += w.dir.y;
      } else {
        remaining = 0;
      }
    }
  };

  // Where each hater wants to go
  const targetFor = (h: Hater) => {
    const s = state.current;
    const p = s.player;
    if (h.mode === "eyes") return DOOR_OUT;
    if (h.mode === "scared") return { x: COLS - 1 - p.cx, y: ROWS - 1 - p.cy };
    switch (h.style) {
      case 0:
        return { x: p.cx, y: p.cy }; // straight at you
      case 1:
        return { x: p.cx + p.dir.x * 4, y: p.cy + p.dir.y * 4 }; // cuts you off
      case 2: {
        // chases when far, wanders off when close
        const d = Math.abs(h.cx - p.cx) + Math.abs(h.cy - p.cy);
        return d > 8 ? { x: p.cx, y: p.cy } : { x: 1, y: ROWS - 2 };
      }
      default:
        return { x: p.cx - p.dir.x * 3, y: p.cy - p.dir.y * 3 }; // comes from behind
    }
  };

  const haterArrive = (h: Hater) => {
    const s = state.current;
    // Eyes got back to the door: go home and come back out soon
    if (h.mode === "eyes" && h.cx === DOOR_OUT.x && h.cy === DOOR_OUT.y) {
      const home = HOME[h.style];
      h.cx = home.x;
      h.cy = home.y;
      h.prog = 0;
      h.mode = "home";
      h.wait = 2;
      return;
    }
    const target = targetFor(h);
    const options = DIRS.filter(
      (d) => !isWall(h.cx + d.x, h.cy + d.y) && !(d.x === -h.dir.x && d.y === -h.dir.y)
    );
    const choices = options.length ? options : DIRS.filter((d) => !isWall(h.cx + d.x, h.cy + d.y));
    if (!choices.length) return;
    let best = choices[0];
    if (h.mode === "scared" && Math.random() < 0.5) {
      best = choices[Math.floor(Math.random() * choices.length)];
    } else {
      let bestD = Infinity;
      for (const d of choices) {
        const nx = h.cx + d.x;
        const ny = h.cy + d.y;
        const dist = (nx - target.x) ** 2 + (ny - target.y) ** 2;
        if (dist < bestD) {
          bestD = dist;
          best = d;
        }
      }
    }
    h.dir = best;
    void s;
  };

  const loseLife = () => {
    const s = state.current;
    s.lives -= 1;
    s.shake = 0.3;
    burst(px(s.player) + 4, py(s.player) + 4, 30, BOOM, 90);
    playCaught();
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
      s.mode = "caught";
      s.caughtAt = s.t;
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

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;
    if (s.flash > 0) s.flash -= dt;

    for (const p of s.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2 * dt;
      p.vy *= 1 - 2 * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    for (const pop of s.popups) {
      pop.y -= 12 * dt;
      pop.life -= dt;
    }
    s.popups = s.popups.filter((p) => p.life > 0);

    // Click wheel turns
    s.wheelAcc += spinRef.current;
    spinRef.current = 0;
    if (s.mode !== "running") s.wheelAcc = 0;
    while (s.wheelAcc >= WHEEL_TURN) {
      turn(true);
      s.wheelAcc -= WHEEL_TURN;
    }
    while (s.wheelAcc <= -WHEEL_TURN) {
      turn(false);
      s.wheelAcc += WHEEL_TURN;
    }

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 1.6) finishDeath();
      return;
    }
    if (s.mode === "caught") {
      if (s.t - s.caughtAt > 1.4) {
        placeEveryone();
        s.mode = "running";
      }
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;
    s.munch += dt;
    if (s.scared > 0) {
      s.scared -= dt;
      if (s.scared <= 0) {
        for (const h of s.haters) if (h.mode === "scared") h.mode = "chase";
      }
    }

    // You
    moveWalker(s.player, playerSpeed() * dt, playerArrive, (x, y) => !isWall(x, y));

    // Haters
    for (const h of s.haters) {
      if (h.mode === "home") {
        h.wait -= dt;
        if (h.wait <= 0) {
          h.cx = DOOR_OUT.x;
          h.cy = DOOR_OUT.y;
          h.prog = 0;
          h.dir = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
          h.mode = s.scared > 0 ? "scared" : "chase";
        }
        continue;
      }
      const speed = h.mode === "eyes" ? 11 : h.mode === "scared" ? 3 : hatersSpeed();
      moveWalker(h, speed * dt, () => haterArrive(h), (x, y) => !isWall(x, y));
    }

    // Touching a hater
    const ppx = px(s.player);
    const ppy = py(s.player);
    for (const h of s.haters) {
      if (h.mode === "home" || h.mode === "eyes") continue;
      if (Math.abs(px(h) - ppx) < 5 && Math.abs(py(h) - ppy) < 5) {
        if (h.mode === "scared") {
          s.combo += 1;
          const points = 200 * 2 ** (s.combo - 1);
          s.score += points;
          s.popups.push({ x: px(h) + 4, y: py(h), text: String(points), life: 1 });
          burst(px(h) + 4, py(h) + 4, 14, [PURPLE, "#ffffff"], 50);
          h.mode = "eyes";
          playEatHater();
        } else {
          loseLife();
          return;
        }
      }
    }

    // Board cleared: next level
    if (s.left <= 0) {
      s.score += 500;
      s.level += 1;
      fillBoard();
      placeEveryone();
      s.flash = 1.6;
      s.flashText = `LEVEL ${s.level}`;
      playLevel();
    }
  };

  const drawSfxIcon = (ctx: CanvasRenderingContext2D) => {
    const x = 6;
    const y = 5;
    ctx.fillStyle = INK;
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

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));

    ctx.fillStyle = SCREEN;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // Maze walls: black blocks with a pink edge where they meet a path
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const t = MAZE[y][x];
        const X = OX + x * T;
        const Y = OY + y * T;
        if (t === "#") {
          ctx.fillStyle = INK;
          ctx.fillRect(X, Y, T, T);
          ctx.fillStyle = PINK;
          if (!isWall(x, y - 1)) ctx.fillRect(X, Y, T, 1);
          if (!isWall(x, y + 1)) ctx.fillRect(X, Y + T - 1, T, 1);
          if (!isWall(x - 1, y)) ctx.fillRect(X, Y, 1, T);
          if (!isWall(x + 1, y)) ctx.fillRect(X + T - 1, Y, 1, T);
        } else if (t === "=") {
          ctx.fillStyle = DARK_PINK;
          ctx.fillRect(X, Y + 3, T, 2);
        } else if (t === "H") {
          ctx.fillStyle = "#c3e2a3";
          ctx.fillRect(X, Y, T, T);
        }
      }
    }

    // Seeds and weed leaves
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (s.seeds[y] && s.seeds[y][x]) {
          ctx.fillStyle = DARK_GREEN;
          ctx.fillRect(OX + x * T + 3, OY + y * T + 3, 2, 2);
        }
        if (s.leaves[y] && s.leaves[y][x] && Math.floor(s.t * 3) % 2 === 0) {
          drawPixels(ctx, LEAF, OX + x * T + 1, OY + y * T + 1, { G: GREEN, D: DARK_GREEN });
        }
      }
    }

    // Haters
    for (const h of s.haters) {
      const x = px(h) + 0.5;
      const y = py(h) + 0.5;
      if (h.mode === "eyes") {
        drawPixels(ctx, HATER_EYES, x, y, { W: "#ffffff", K: INK });
      } else if (h.mode === "scared") {
        const ending = s.scared < 1.5 && Math.floor(s.t * 8) % 2 === 0;
        drawPixels(ctx, HATER_SCARED, x, y, { U: ending ? "#ffffff" : PURPLE, W: ending ? PURPLE : "#ffffff" });
      } else {
        drawPixels(ctx, HATER, x, y, { G: HATER_COLORS[h.style], K: INK, W: "#ffffff" });
      }
    }

    // The turn you asked for that hasn't happened yet: a little blinking pink arrow on that side of you
    // (so on a phone you can see your swipe was caught, and you'll turn at the next corner)
    const pl = s.player;
    if (s.mode === "running" && !same(pl.next, pl.dir) && Math.floor(s.t * 8) % 2 === 0) {
      const ax = Math.round(px(pl) + 3.5 + pl.next.x * 7);
      const ay = Math.round(py(pl) + 3.5 + pl.next.y * 7);
      ctx.fillStyle = PINK;
      ctx.fillRect(ax - 1, ay - 1, 3, 3);
      ctx.fillRect(ax + pl.next.x * 2 - (pl.next.y ? 2 : 0), ay + pl.next.y * 2 - (pl.next.x ? 2 : 0), pl.next.y ? 5 : 1, pl.next.x ? 5 : 1);
    }

    // You (hidden while exploding)
    if (s.mode === "ready" || s.mode === "running") {
      const moving = s.player.prog > 0;
      const frame = moving && Math.floor(s.munch * 10) % 2 === 1 ? 1 : 0;
      drawPixels(ctx, PLAYER_FRAMES[frame], px(s.player) + 0.5, py(s.player) + 0.5, {
        P: PINK,
        Y: "#ffc800",
        W: "#ffffff",
        K: INK,
        R: "#d21e1e",
      });
    }

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }

    ctx.restore();

    // HUD
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    drawSfxIcon(ctx);
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(pad(s.score), 22, 6);
    ctx.textAlign = "center";
    ctx.fillText(`LV ${s.level}`, W / 2, 6);
    ctx.textAlign = "right";
    ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);
    for (let i = 0; i < s.lives; i++) {
      drawPixels(ctx, PLAYER_FRAMES[0], W - 90 - i * 9, 5, { P: PINK, Y: "#ffc800", W: "#ffffff", K: INK });
    }

    for (const pop of s.popups) {
      ctx.textAlign = "center";
      ctx.fillStyle = PURPLE;
      ctx.fillText(pop.text, pop.x, pop.y);
    }

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      textBox(ctx, "PINK MAZE", 62);
      if (touchRef.current) textBox(ctx, "SWIPE ANYWHERE TO STEER", 76);
      if (blink) textBox(ctx, touchRef.current ? "TAP TO START" : "PRESS OK TO START", 90);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 106);
    } else if (s.mode === "running" && s.flash > 0) {
      textBox(ctx, s.flashText, 90);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, pad(s.score), 44);
    }
  };

  // ---------- PAUSE: the same menu in every game (see PinkShop.ts) ----------
  // ESC / P, or the little II button at the top = RESUME / RESTART / GAME MENU (GAME MENU = back to the PSP game list)
  const PAUSE_BTN = { x: 72, y: 4 };
  const pauseActive = () => state.current.mode === "running" || state.current.mode === "caught"; // the II button only shows while you play
  const setPause = (on: boolean) => {
    const p = pauseRef.current;
    if (on && state.current.mode === "entry") return; // (typing your name for the Top 10)
    p.on = on;
    p.row = 0;
    swipeRef.current = null;
  };
  const pauseChoose = () => {
    const p = pauseRef.current;
    const pick = PAUSE_ROWS_SIMPLE[p.row];
    p.on = false;
    if (pick === "RESTART") {
      newGame();
      state.current.mode = "running";
    } else if (pick === "GAME MENU") leaveToGameMenu();
  };
  const pauseStats = () => {
    const s = state.current;
    return `LV ${s.level}  SCORE ${pad(s.score)}`;
  };
  // a click / tap on the screen, in game pixels
  const toGamePt = (el: HTMLCanvasElement, cx: number, cy: number) => {
    const rect = el.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    return { x: (cx - rect.left - (rect.width - W * scale) / 2) / scale, y: (cy - rect.top - (rect.height - H * scale) / 2) / scale };
  };
  // a tap while paused picks a row; a tap on the II button pauses. true = the tap was used up here
  const pauseTap = (x: number, y: number) => {
    if (pauseRef.current.on) {
      const r = pauseTapRow(x, y, W, PAUSE_ROWS_SIMPLE.length);
      if (r >= 0) {
        pauseRef.current.row = r;
        pauseChoose();
      }
      return true;
    }
    if (pauseActive() && pauseBtnHit(x, y, PAUSE_BTN.x, PAUSE_BTN.y)) {
      setPause(true);
      return true;
    }
    return false;
  };

  // Start the game loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Keyboard: arrows or WASD steer, M = game sounds on/off
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") steer(0, -1);
      if (k === "ArrowDown" || k === "s" || k === "S") steer(0, 1);
      if (k === "ArrowLeft" || k === "a" || k === "A") steer(-1, 0);
      if (k === "ArrowRight" || k === "d" || k === "D") steer(1, 0);
      if (k === "m" || k === "M") toggleSfx();
    };
    window.addEventListener("keydown", down);

    // PAUSE keys. This listens BEFORE the page does, so while paused UP / DOWN / OK / SPACE only move the pause menu
    // (they don't steer, jump or skip songs). BACKSPACE still goes back to the game list.
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false; // phone / tablet: the menu says TAP
    const onPauseKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const p = pauseRef.current;
      if (!p.on) {
        if ((e.key === "Escape" || e.key === "p" || e.key === "P") && state.current.mode !== "entry") {
          setPause(true);
          e.preventDefault();
          e.stopImmediatePropagation();
        }
        return;
      }
      if (e.key === "Backspace") return;
      const did = pauseKey(p, PAUSE_ROWS_SIMPLE.length, e.key);
      if (!did) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.repeat && did !== "move") return;
      if (did === "choose") pauseChoose();
      else if (did === "resume") setPause(false);
    };
    window.addEventListener("keydown", onPauseKey, true);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const pz = pauseRef.current;
      if (pz.on) {
        pz.t += dt;
        spinRef.current = 0; // (the click wheel does nothing while paused)
      } else update(dt);
      draw(ctx);
      if (pz.on) drawPauseMenu(ctx, fontFamily, { W, H, row: pz.row, t: pz.t, touch: coarse, rows: PAUSE_ROWS_SIMPLE, stats: pauseStats() });
      else if (pauseActive()) drawPauseButton(ctx, PAUSE_BTN.x, PAUSE_BTN.y);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onPauseKey, true);
      window.removeEventListener("keydown", down);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PHONES: swipe ANYWHERE on the screen to steer (the small EXIT / PAUSE / music buttons and the round pad still work).
  // The turn happens the moment your finger has slid SWIPE_PX, you don't have to lift it. Keep the finger down and
  // swipe another way for the next turn. A tap = start / play again. Speaker icon (top left of the game) = sounds on / off.
  // (Other touch screens: the swipe has to start on the game, or just next to it.)
  useEffect(() => {
    const onUi = (t: EventTarget | null) =>
      t instanceof Element &&
      !!t.closest("button, a, input, select, textarea, [role='button'], [role='slider'], [role='group']");
    const sw = { x: 0, y: 0, on: false, fired: false, id: -1, last: "" };
    const toGame = (cx: number, cy: number) => {
      const c = canvasRef.current;
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    const start = (e: TouchEvent) => {
      if (sw.on || onUi(e.target)) return;
      if (state.current.mode === "entry") return; // typing your name: leave the touch alone
      const t = e.changedTouches[0];
      const c = canvasRef.current;
      if (!c) return;
      if (!touchRef.current) {
        const r = c.getBoundingClientRect();
        const M = 40;
        if (t.clientX < r.left - M || t.clientX > r.right + M || t.clientY < r.top - M || t.clientY > r.bottom + M) return;
      }
      const g = toGame(t.clientX, t.clientY);
      // the pause menu / the II button
      if (g && pauseTap(g.x, g.y)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (g && g.x >= 0 && g.y >= 0 && g.x < 20 && g.y < 18) {
        toggleSfx();
        if (e.cancelable) e.preventDefault();
        return;
      }
      sw.x = t.clientX;
      sw.y = t.clientY;
      sw.on = true;
      sw.fired = false;
      sw.id = t.identifier;
      sw.last = "";
      if (e.cancelable) e.preventDefault(); // no double-tap zoom / page scrolling
    };
    const find = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === sw.id) return e.changedTouches[i];
      return null;
    };
    const move = (e: TouchEvent) => {
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      const dx = t.clientX - sw.x;
      const dy = t.clientY - sw.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      sw.x = t.clientX;
      sw.y = t.clientY;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (dir === sw.last) return; // one long swipe = one turn
      sw.last = dir;
      sw.fired = true;
      if (dir === "right") steer(1, 0);
      else if (dir === "left") steer(-1, 0);
      else if (dir === "down") steer(0, 1);
      else steer(0, -1);
    };
    const end = (e: TouchEvent) => {
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      sw.on = false;
      // a tap (no swipe) on the start / Top 10 screen = play
      if (e.type === "touchend" && !sw.fired && state.current.mode !== "running") press();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls
  useEffect(() => {
    // (OK while paused = choose the highlighted pause row)
    if (actionSignal !== firstSignal.current) {
      if (pauseRef.current.on) pauseChoose();
      else press();
    }
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
        // COMPUTER mouse: drag to steer, click to start. Speaker icon (top-left) = game sounds on/off.
        // (fingers are handled by the swipe code above, so they're skipped here)
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") return;
          {
            const pt = toGamePt(e.currentTarget, e.clientX, e.clientY);
            if (pauseTap(pt.x, pt.y)) return;
          }
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
          swipeRef.current = { x: e.clientX, y: e.clientY };
          if (mode !== "running") press();
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") return;
          const start = swipeRef.current;
          swipeRef.current = null;
          if (!start) return;
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
          if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
          else steer(0, dy > 0 ? 1 : -1);
        }}
        onPointerCancel={() => {
          swipeRef.current = null;
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
