"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

type Mode = "ready" | "running" | "dying" | "entry" | "board";
type Cell = { x: number; y: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  life: number;
  maxLife: number;
  size: number;
};
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;

// The play field: 30 x 17 squares of 8 pixels
const CELL = 8;
const COLS = 30;
const ROWS = 17;
const OX = 8;
const OY = 18;

// Speed: seconds per step (smaller = faster)
const START_STEP = 0.15;
const MIN_STEP = 0.065;
const SPEEDUP = 0.0025; // per leaf eaten

// Turning the click wheel this many degrees = one turn
const WHEEL_TURN = 40;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinksnake-best";
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
const DARK_PURPLE = "#6a2a8a";
const SMOKE = ["#8a8a8a", "#a5a5a5", "#bdbdbd", "#707070"];
const BOOM = [PINK, DARK_PINK, "#ffc800", INK, "#ffffff"];

const LEAF_PIXELS = [
  "...G...",
  "..GGG..",
  "G.GGG.G",
  "GGGGGGG",
  ".GGGGG.",
  "...D...",
  "...D...",
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, purple = false) {
  for (let r = 0; r < LEAF_PIXELS.length; r++) {
    for (let c = 0; c < LEAF_PIXELS[r].length; c++) {
      const ch = LEAF_PIXELS[r][c];
      if (ch === "G" || ch === "D") {
        if (purple) ctx.fillStyle = ch === "G" ? PURPLE : DARK_PURPLE;
        else ctx.fillStyle = ch === "G" ? GREEN : DARK_GREEN;
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

export default function SnakeGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
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
    snake: [] as Cell[], // [0] is the head
    dir: { x: 1, y: 0 } as Cell,
    queue: [] as Cell[], // turns waiting to happen
    grow: 0,
    leaf: { x: 20, y: 8 } as Cell,
    bonus: null as Cell | null,
    bonusTime: 0,
    step: START_STEP,
    acc: 0,
    wheelAcc: 0,
    score: 0,
    best: 0,
    eaten: 0,
    particles: [] as Particle[],
    smokeTimer: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
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
    if (mutedRef.current) return;
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

  const playEat = () => beep(520, 980, 0.07, 0.1);

  const playBonus = () => {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.1, 0.08, "square", i * 0.07));
  };

  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  // ---------- Scoreboard ----------

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores?game=snake", { cache: "no-store" });
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
          game: "snake",
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

  const cellFree = (x: number, y: number) => {
    const s = state.current;
    return !s.snake.some((c) => c.x === x && c.y === y);
  };

  const randomFreeCell = (): Cell => {
    const s = state.current;
    for (let tries = 0; tries < 500; tries++) {
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      const onLeaf = s.leaf && s.leaf.x === x && s.leaf.y === y;
      const onBonus = s.bonus && s.bonus.x === x && s.bonus.y === y;
      if (cellFree(x, y) && !onLeaf && !onBonus) return { x, y };
    }
    return { x: 0, y: 0 };
  };

  const newGame = () => {
    const s = state.current;
    const y = Math.floor(ROWS / 2);
    s.snake = [
      { x: 8, y },
      { x: 7, y },
      { x: 6, y },
      { x: 5, y },
    ];
    s.dir = { x: 1, y: 0 };
    s.queue = [];
    s.grow = 0;
    s.bonus = null;
    s.bonusTime = 0;
    s.step = START_STEP;
    s.acc = 0;
    s.wheelAcc = 0;
    s.score = 0;
    s.eaten = 0;
    s.runTime = 0;
    s.particles = [];
    s.leaf = { x: 20, y };
  };

  // Where the next turn starts from (the last one waiting, or the current direction)
  const lastDir = () => {
    const s = state.current;
    return s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
  };

  // Steer to an exact direction (arrows, swipes)
  const steer = (x: number, y: number) => {
    const s = state.current;
    if (s.mode !== "running") return;
    const last = lastDir();
    if ((last.x === x && last.y === y) || (last.x === -x && last.y === -y)) return;
    if (s.queue.length < 3) s.queue.push({ x, y });
  };

  // Turn left / right from where it's heading (click wheel)
  const turn = (right: boolean) => {
    const last = lastDir();
    if (right) steer(-last.y, last.x);
    else steer(last.y, -last.x);
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

  const px = (c: Cell) => OX + c.x * CELL;
  const py = (c: Cell) => OY + c.y * CELL;

  // Tip of the joint, in pixels
  const jointTip = () => {
    const s = state.current;
    const head = s.snake[0];
    const cx = px(head) + CELL / 2;
    const cy = py(head) + CELL / 2;
    return { x: cx + s.dir.x * 9, y: cy + s.dir.y * 9 };
  };

  const puff = (x: number, y: number, count: number, spread: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      const life = rand(0.8, 1.5);
      s.particles.push({
        x: x + rand(-1, 1),
        y: y + rand(-1, 1),
        vx: rand(-spread, spread),
        vy: rand(-22, -8),
        color: SMOKE[Math.floor(Math.random() * SMOKE.length)],
        life,
        maxLife: life,
        size: Math.random() < 0.4 ? 3 : 2,
      });
    }
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      const life = rand(0.4, 1.0);
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power, power),
        color: colors[Math.floor(Math.random() * colors.length)],
        life,
        maxLife: life,
        size: 2,
      });
    }
  };

  const die = () => {
    const s = state.current;
    s.mode = "dying";
    s.deadAt = s.t;
    s.shake = 0.35;
    // Every piece of the snake pops
    s.snake.forEach((c, i) => {
      burst(px(c) + CELL / 2, py(c) + CELL / 2, i === 0 ? 20 : 4, BOOM, i === 0 ? 90 : 50);
    });
    puff(px(s.snake[0]) + 4, py(s.snake[0]) + 4, 10, 20);
    if (s.score > s.best) {
      s.best = Math.floor(s.score);
      try {
        localStorage.setItem(BEST_KEY, String(s.best));
      } catch {}
    }
    playDeath();
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

  // One step of the snake
  const tick = () => {
    const s = state.current;
    if (s.queue.length) s.dir = s.queue.shift() as Cell;
    const head = s.snake[0];
    const next = { x: head.x + s.dir.x, y: head.y + s.dir.y };

    // Walls
    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      die();
      return;
    }
    // Own body (the tail moves away this step, unless growing)
    const body = s.grow > 0 ? s.snake : s.snake.slice(0, -1);
    if (body.some((c) => c.x === next.x && c.y === next.y)) {
      die();
      return;
    }

    s.snake.unshift(next);
    if (s.grow > 0) s.grow -= 1;
    else s.snake.pop();

    // Green leaf: grow by 1
    if (next.x === s.leaf.x && next.y === s.leaf.y) {
      s.grow += 1;
      s.score += 10;
      s.eaten += 1;
      s.step = Math.max(MIN_STEP, s.step - SPEEDUP);
      const tip = jointTip();
      puff(tip.x, tip.y, 8, 14); // big exhale
      burst(px(next) + 4, py(next) + 4, 8, [GREEN, DARK_GREEN], 40);
      playEat();
      s.leaf = randomFreeCell();
      // Sometimes a rare purple leaf shows up for a few seconds
      if (!s.bonus && s.eaten >= 3 && Math.random() < 0.18) {
        s.bonus = randomFreeCell();
        s.bonusTime = 6;
      }
    }

    // Purple leaf: bonus points, grow by 3
    if (s.bonus && next.x === s.bonus.x && next.y === s.bonus.y) {
      s.grow += 3;
      s.score += 50;
      const tip = jointTip();
      puff(tip.x, tip.y, 14, 18);
      burst(px(next) + 4, py(next) + 4, 14, [PURPLE, DARK_PURPLE, "#ffffff"], 55);
      playBonus();
      s.bonus = null;
    }
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;

    for (const p of s.particles) {
      p.x += p.vx * dt + Math.sin(s.t * 6 + p.y) * 0.1;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);

    // Click wheel: turning it turns the snake
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
      if (s.t - s.deadAt > 1.5) finishDeath();
      return;
    }

    // The joint is always smoking (also on the start screen)
    if (s.mode === "running" || s.mode === "ready") {
      s.smokeTimer -= dt;
      if (s.smokeTimer <= 0) {
        const tip = jointTip();
        puff(tip.x, tip.y - 1, 1, 5);
        s.smokeTimer = 0.12;
      }
    }

    if (s.mode !== "running") return;

    s.runTime += dt;
    if (s.bonus) {
      s.bonusTime -= dt;
      if (s.bonusTime <= 0) s.bonus = null;
    }

    s.acc += dt;
    while (s.acc >= s.step && s.mode === "running") {
      s.acc -= s.step;
      tick();
    }
  };

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, W / 2, y);
  };

  const drawSnake = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const n = s.snake.length;

    // Body, tail first so the head sits on top
    for (let i = n - 1; i >= 1; i--) {
      const c = s.snake[i];
      const x = px(c);
      const y = py(c);
      const tail = i === n - 1;
      ctx.fillStyle = INK;
      if (tail) ctx.fillRect(x + 1, y + 1, 6, 6);
      else ctx.fillRect(x, y, 8, 8);
      ctx.fillStyle = PINK;
      if (tail) ctx.fillRect(x + 2, y + 2, 4, 4);
      else ctx.fillRect(x + 1, y + 1, 6, 6);
      if (!tail && i % 2 === 0) {
        ctx.fillStyle = DARK_PINK;
        ctx.fillRect(x + 3, y + 3, 2, 2);
      }
    }

    // Head
    const head = s.snake[0];
    const x = px(head);
    const y = py(head);
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, y - 1, 10, 10);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, y, 8, 8);

    // Eyes on the side it's heading to
    const d = s.dir;
    ctx.fillStyle = "#ffffff";
    const eyes: [number, number][] =
      d.x === 1
        ? [[5, 1], [5, 5]]
        : d.x === -1
        ? [[1, 1], [1, 5]]
        : d.y === -1
        ? [[1, 1], [5, 1]]
        : [[1, 5], [5, 5]];
    for (const [ex, ey] of eyes) ctx.fillRect(x + ex, y + ey, 2, 2);
    ctx.fillStyle = INK;
    for (const [ex, ey] of eyes) ctx.fillRect(x + ex + (d.x === 1 ? 1 : 0), y + ey + (d.y === 1 ? 1 : 0), 1, 1);

    // The joint sticking out of its mouth, with a glowing tip
    const cx = x + 4;
    const cy = y + 4;
    const glow = Math.floor(s.t * 6) % 2 === 0 ? "#ff7a00" : "#ffc800";
    if (d.x !== 0) {
      const jx = d.x === 1 ? x + 8 : x - 6;
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(jx, cy, 6, 2);
      ctx.fillStyle = glow;
      ctx.fillRect(d.x === 1 ? jx + 5 : jx, cy, 2, 2);
    } else {
      const jy = d.y === 1 ? y + 8 : y - 6;
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(cx - 1, jy, 2, 6);
      ctx.fillStyle = glow;
      ctx.fillRect(cx - 1, d.y === 1 ? jy + 5 : jy, 2, 2);
    }
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

    // Play field border
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.strokeRect(OX - 1.5, OY - 1.5, COLS * CELL + 3, ROWS * CELL + 3);

    // Leaves
    drawLeaf(ctx, px(s.leaf), py(s.leaf) + Math.round(Math.sin(s.t * 5)));
    if (s.bonus && (s.bonusTime > 2 || Math.floor(s.t * 8) % 2 === 0)) {
      drawLeaf(ctx, px(s.bonus), py(s.bonus), true);
    }

    if (s.mode === "ready" || s.mode === "running") drawSnake(ctx);

    // Smoke and explosion pieces (smoke fades out)
    for (const p of s.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / p.maxLife + 0.15));
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // HUD
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(pad(s.score), OX, 5);
    ctx.textAlign = "right";
    ctx.fillText(`HI ${pad(s.best)}`, W - OX, 5);

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      textBox(ctx, "PINK SNAKE", 44);
      if (blink) textBox(ctx, "PRESS OK TO START", 100);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 120);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, pad(s.score), 44);
    }
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

    // Keyboard: arrows or WASD steer
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") steer(0, -1);
      if (k === "ArrowDown" || k === "s" || k === "S") steer(0, 1);
      if (k === "ArrowLeft" || k === "a" || k === "A") steer(-1, 0);
      if (k === "ArrowRight" || k === "d" || k === "D") steer(1, 0);
    };
    window.addEventListener("keydown", down);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", down);
      audioCtxRef.current?.close().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls
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
        // Phones: swipe on the screen to steer, tap to start
        onPointerDown={(e) => {
          const mode = state.current.mode;
          if (mode === "entry") return;
          swipeRef.current = { x: e.clientX, y: e.clientY };
          if (mode !== "running") press();
        }}
        onPointerUp={(e) => {
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
