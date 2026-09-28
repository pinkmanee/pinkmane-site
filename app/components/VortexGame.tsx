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

type Mode = "ready" | "serve" | "running" | "dying" | "entry" | "board";
type Brick = { ring: number; a0: number; a1: number; hp: number; maxHp: number };
// kind "wide" = green leaf (bigger paddle), "life" = purple leaf (extra life)
type Leaf = { angle: number; r: number; kind: "wide" | "life" };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;
const CX = 128;
const CY = 84;

// The paddle runs around this circle
const R = 66;
// If the ball gets this far out, you lose a life
const OUT = R + 9;
const BALL_R = 2;
const WIDE_HALF = 0.5; // paddle size with the leaf power-up

// Brick rings (inner radius, thickness, how many bricks)
const RINGS = [
  { rin: 12, th: 7, count: 6 },
  { rin: 21, th: 7, count: 10 },
  { rin: 30, th: 7, count: 14 },
  { rin: 39, th: 7, count: 18 },
];

const BASE_SPEED = 60;
const MAX_SPEED = 200;
const START_LIVES = 3;
const MAX_LIVES = 5;

// Saved in the visitor's browser (name, device and owner code are shared with Pink Run)
const BEST_KEY = "pinkvortex-best";
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
const RING_COLORS = [PINK, INK, PINK, DARK_PINK];
const FIRE = ["#ffc800", "#ff7a00", "#ffffff", PINK];
const SMOKE = ["#777777", "#999999", "#555555"];
const BOOM = [PINK, "#ffc800", INK, "#777777", "#ffffff", "#d21e1e"];

const LEAF_PIXELS = [
  "....G....",
  "...GGG...",
  "G..GGG..G",
  "GGGGGGGGG",
  ".GGGGGGG.",
  "..GG.GG..",
  "....D....",
  "....D....",
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

// Angle between -PI and PI
function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

// Angle between 0 and 2*PI
function wrap2(a: number) {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

// Paddle gets smaller every level
function paddleHalfFor(level: number) {
  return Math.max(0.17, 0.36 - 0.025 * (level - 1));
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

export default function VortexGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const firstSignal = useRef(actionSignal);
  const heldRef = useRef({ ccw: false, cw: false });
  const draggingRef = useRef(false);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);

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
    level: 1,
    score: 0,
    best: 0,
    lives: START_LIVES,
    paddle: Math.PI / 2, // bottom of the circle
    bx: CX,
    by: CY,
    vx: 0,
    vy: 0,
    speed: BASE_SPEED,
    levelSpeed: BASE_SPEED,
    bricks: [] as Brick[],
    rot: [0, 0, 0, 0],
    leaves: [] as Leaf[],
    wide: 0,
    particles: [] as Particle[],
    t: 0,
    runTime: 0,
    deadAt: 0,
    flash: 0,
    flashText: "",
    muzzle: 0,
    muzzleX: 0,
    muzzleY: 0,
    shake: 0,
  });

  // ---------- Sounds (made in code, no files needed) ----------

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

  // Cannon boom when the ball launches
  const playCannon = () => {
    if (mutedRef.current) return;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime;

    const len = Math.floor(ac.sampleRate * 0.35);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const noise = ac.createBufferSource();
    noise.buffer = buf;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.3);
    const ng = ac.createGain();
    ng.gain.setValueAtTime(0.45, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    noise.connect(filter).connect(ng).connect(ac.destination);
    noise.start(now);

    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.25);
    const og = ac.createGain();
    og.gain.setValueAtTime(0.55, now);
    og.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.connect(og).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.32);
  };

  // Short retro "bloop" when you lose a life
  const playLifeLost = () => {
    if (mutedRef.current) return;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(90, now + 0.35);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  };

  // Happy little arpeggio when you catch a leaf
  const playPowerUp = (high: boolean) => {
    if (mutedRef.current) return;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime;
    const notes = high ? [523, 659, 784, 1047] : [392, 523, 659];
    notes.forEach((f, i) => {
      const osc = ac.createOscillator();
      osc.type = "square";
      osc.frequency.setValueAtTime(f, now + i * 0.07);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.setValueAtTime(0.09, now + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.12);
      osc.connect(g).connect(ac.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 0.13);
    });
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
      const res = await fetch("/api/scores?game=vortex", { cache: "no-store" });
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
          game: "vortex",
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

  const buildLevel = (level: number) => {
    const s = state.current;
    const ringCount = Math.min(RINGS.length, level + 1);
    const bricks: Brick[] = [];
    for (let ring = 0; ring < ringCount; ring++) {
      const { count } = RINGS[ring];
      const seg = (Math.PI * 2) / count;
      // Tougher bricks later on
      let hp = 1;
      if (level >= 3 && ring >= 2) hp = 2;
      if (level >= 5) hp = ring >= 2 ? 3 : 2;
      for (let i = 0; i < count; i++) {
        bricks.push({ ring, a0: i * seg, a1: (i + 1) * seg - 0.06, hp, maxHp: hp });
      }
    }
    s.bricks = bricks;
    s.rot = [0, 0, 0, 0];
    s.leaves = [];
    s.levelSpeed = Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * 9);
    s.speed = s.levelSpeed;
  };

  const halfSize = () => {
    const s = state.current;
    return s.wide > 0 ? WIDE_HALF : paddleHalfFor(s.level);
  };

  // Put the ball back on the paddle
  const placeOnPaddle = () => {
    const s = state.current;
    const r = R - 3 - BALL_R - 1;
    s.bx = CX + Math.cos(s.paddle) * r;
    s.by = CY + Math.sin(s.paddle) * r;
    s.vx = 0;
    s.vy = 0;
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number, size = 2) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power, power),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.3, 0.9),
        size,
      });
    }
  };

  const launch = () => {
    const s = state.current;
    const a = s.paddle + Math.PI + rand(-0.25, 0.25);
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    s.speed = s.levelSpeed;
    s.vx = dx * s.speed;
    s.vy = dy * s.speed;
    s.mode = "running";

    // Cannon blast: fire sparks shooting forward, smoke, a flash and a little shake
    for (let i = 0; i < 22; i++) {
      const spread = rand(-0.7, 0.7);
      const sp = rand(40, 130);
      s.particles.push({
        x: s.bx,
        y: s.by,
        vx: Math.cos(a + spread) * sp,
        vy: Math.sin(a + spread) * sp,
        color: FIRE[Math.floor(Math.random() * FIRE.length)],
        life: rand(0.15, 0.45),
        size: 2,
      });
    }
    for (let i = 0; i < 10; i++) {
      s.particles.push({
        x: s.bx,
        y: s.by,
        vx: rand(-25, 25) + dx * 15,
        vy: rand(-25, 25) + dy * 15,
        color: SMOKE[Math.floor(Math.random() * SMOKE.length)],
        life: rand(0.4, 0.8),
        size: 3,
      });
    }
    s.muzzle = 0.09;
    s.muzzleX = s.bx;
    s.muzzleY = s.by;
    s.shake = 0.12;
    playCannon();
  };

  const newGame = () => {
    const s = state.current;
    s.level = 1;
    s.score = 0;
    s.lives = START_LIVES;
    s.wide = 0;
    s.runTime = 0;
    s.particles = [];
    s.flash = 0;
    buildLevel(1);
    placeOnPaddle();
  };

  // Called on OK / Enter / Space / tapping the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "ready" || s.mode === "serve") {
      launch();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      newGame();
      s.mode = "serve";
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

  const loseLife = () => {
    const s = state.current;
    s.lives -= 1;
    s.wide = 0;
    if (s.lives <= 0) {
      // Game over: big explosion, shake, death sound
      s.mode = "dying";
      s.deadAt = s.t;
      s.shake = 0.35;
      burst(s.bx, s.by, 40, BOOM, 110);
      burst(CX + Math.cos(s.paddle) * R, CY + Math.sin(s.paddle) * R, 25, BOOM, 90);
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    } else {
      burst(s.bx, s.by, 14, [INK, PINK], 60);
      s.shake = 0.15;
      playLifeLost();
      s.mode = "serve";
      s.speed = s.levelSpeed;
      placeOnPaddle();
    }
  };

  // Move the ball in small steps so it never skips through bricks
  const moveBall = (dt: number) => {
    const s = state.current;
    const dist = Math.hypot(s.vx, s.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 1.5));
    const sdt = dt / steps;

    for (let step = 0; step < steps; step++) {
      const px = s.bx;
      const py = s.by;
      s.bx += s.vx * sdt;
      s.by += s.vy * sdt;

      const dx = s.bx - CX;
      const dy = s.by - CY;
      const r = Math.hypot(dx, dy) || 0.0001;
      const nx = dx / r;
      const ny = dy / r;
      const theta = Math.atan2(dy, dx);

      // Paddle
      const outward = s.vx * nx + s.vy * ny > 0;
      if (outward && r >= R - 3 - BALL_R && r <= R + 2) {
        const diff = wrap(theta - s.paddle);
        const half = halfSize();
        if (Math.abs(diff) <= half + 0.06) {
          const offset = Math.max(-1, Math.min(1, diff / half));
          const a = theta + Math.PI + offset * 0.9;
          s.speed = Math.min(MAX_SPEED, s.speed + 0.8);
          s.vx = Math.cos(a) * s.speed;
          s.vy = Math.sin(a) * s.speed;
          s.bx = CX + nx * (R - 3 - BALL_R - 0.5);
          s.by = CY + ny * (R - 3 - BALL_R - 0.5);
          continue;
        }
      }

      // Missed
      if (r > OUT) {
        loseLife();
        return;
      }

      // Bricks
      for (let i = 0; i < s.bricks.length; i++) {
        const b = s.bricks[i];
        const ring = RINGS[b.ring];
        const rin = ring.rin;
        const rout = ring.rin + ring.th;
        if (r + BALL_R < rin || r - BALL_R > rout) continue;
        const local = wrap2(theta - s.rot[b.ring]);
        const margin = BALL_R / Math.max(r, 1);
        if (local < b.a0 - margin || local > b.a1 + margin) continue;

        // Hit! Bounce off the round face or the side of the brick
        const pr = Math.hypot(px - CX, py - CY);
        if (pr + BALL_R < rin || pr - BALL_R > rout) {
          const dot = s.vx * nx + s.vy * ny;
          s.vx -= 2 * dot * nx;
          s.vy -= 2 * dot * ny;
        } else {
          const tx = -ny;
          const ty = nx;
          const dot = s.vx * tx + s.vy * ty;
          s.vx -= 2 * dot * tx;
          s.vy -= 2 * dot * ty;
        }
        s.bx = px;
        s.by = py;

        b.hp -= 1;
        const mid = (b.a0 + b.a1) / 2 + s.rot[b.ring];
        const mr = rin + ring.th / 2;
        const hx = CX + Math.cos(mid) * mr;
        const hy = CY + Math.sin(mid) * mr;
        if (b.hp <= 0) {
          s.score += 10 * s.level;
          burst(hx, hy, 8, [RING_COLORS[b.ring], INK], 50);
          // Weed leaf power-ups: green = bigger paddle, purple (rarer) = extra life
          if (s.leaves.length === 0 && Math.random() < 0.14) {
            const canLife = s.lives < MAX_LIVES;
            const canWide = s.wide <= 0;
            if (canLife && (Math.random() < 0.4 || !canWide)) {
              s.leaves.push({ angle: mid, r: rout, kind: "life" });
            } else if (canWide) {
              s.leaves.push({ angle: mid, r: rout, kind: "wide" });
            }
          }
          s.bricks.splice(i, 1);
        } else {
          s.score += 2 * s.level;
          burst(hx, hy, 4, [SCREEN, INK], 30);
        }
        break;
      }
    }
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.flash > 0) s.flash -= dt;
    if (s.muzzle > 0) s.muzzle -= dt;
    if (s.shake > 0) s.shake -= dt;

    for (const p of s.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt;
      p.vy *= 1 - 2.2 * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);

    // Turning the paddle: click wheel, keyboard
    const spin = spinRef.current;
    spinRef.current = 0;
    s.paddle += (spin * Math.PI) / 180;
    if (heldRef.current.ccw) s.paddle -= 3.6 * dt;
    if (heldRef.current.cw) s.paddle += 3.6 * dt;
    s.paddle = wrap(s.paddle);

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 1.4) finishDeath();
      return;
    }
    if (s.mode === "entry" || s.mode === "board") return;

    // Brick rings spin, faster on later levels
    for (let i = 0; i < s.rot.length; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      s.rot[i] += dir * (0.12 + 0.06 * s.level) * dt;
    }

    if (s.mode === "ready" || s.mode === "serve") {
      placeOnPaddle();
      return;
    }

    s.runTime += dt;
    if (s.wide > 0) s.wide -= dt;

    // The longer a level lasts, the faster the ball gets (gently at first)
    const ramp = Math.min(1.2, 0.4 + 0.12 * s.level);
    const target = Math.min(MAX_SPEED, s.speed + ramp * dt);
    if (target > s.speed) {
      const k = target / s.speed;
      s.speed = target;
      s.vx *= k;
      s.vy *= k;
    }

    // Falling leaves
    for (const l of s.leaves) {
      l.r += 35 * dt;
      if (l.r >= R - 3 && l.r <= R + 3 && Math.abs(wrap(l.angle - s.paddle)) <= halfSize() + 0.1) {
        const px = CX + Math.cos(l.angle) * R;
        const py = CY + Math.sin(l.angle) * R;
        if (l.kind === "life") {
          s.lives = Math.min(MAX_LIVES, s.lives + 1);
          burst(px, py, 14, [PURPLE, DARK_PURPLE, "#ffffff"], 55);
          s.flash = 1;
          s.flashText = "+1 LIFE";
          playPowerUp(true);
        } else {
          s.wide = 10;
          burst(px, py, 12, [GREEN, DARK_GREEN], 50);
          playPowerUp(false);
        }
        l.r = 999;
      }
    }
    s.leaves = s.leaves.filter((l) => l.r < OUT);

    moveBall(dt);

    // Level cleared
    if (s.mode === "running" && s.bricks.length === 0) {
      s.score += 100 * s.level;
      s.level += 1;
      buildLevel(s.level);
      s.mode = "serve";
      placeOnPaddle();
      s.flash = 1.6;
      s.flashText = `LEVEL ${s.level}`;
    }
  };

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(CX - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, CX, y);
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

    // Paddle track
    ctx.strokeStyle = "rgba(17,17,17,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(CX, CY, R, 0, Math.PI * 2);
    ctx.stroke();

    // Bricks
    for (const b of s.bricks) {
      const ring = RINGS[b.ring];
      const a0 = b.a0 + s.rot[b.ring];
      const a1 = b.a1 + s.rot[b.ring];
      ctx.beginPath();
      ctx.arc(CX, CY, ring.rin + ring.th, a0, a1);
      ctx.arc(CX, CY, ring.rin, a1, a0, true);
      ctx.closePath();
      ctx.fillStyle = RING_COLORS[b.ring];
      ctx.fill();
      // Tough bricks show cracks as they get hit
      if (b.maxHp > 1) {
        ctx.strokeStyle = SCREEN;
        ctx.lineWidth = b.hp < b.maxHp ? 2 : 1;
        ctx.stroke();
      }
    }

    // Eye of the vortex
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(CX, CY, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.fillRect(Math.round(CX + Math.cos(s.t * 4) * 2) - 1, Math.round(CY + Math.sin(s.t * 4) * 2) - 1, 2, 2);

    // Leaves
    for (const l of s.leaves) {
      drawLeaf(ctx, CX + Math.cos(l.angle) * l.r - 4, CY + Math.sin(l.angle) * l.r - 4, l.kind === "life");
    }

    // Paddle (gone once you're out of lives)
    if (s.mode !== "dying" && s.mode !== "entry") {
      const half = halfSize();
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(CX, CY, R, s.paddle - half, s.paddle + half);
      ctx.stroke();
      ctx.strokeStyle = s.wide > 0 ? GREEN : PINK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(CX, CY, R, s.paddle - half + 0.04, s.paddle + half - 0.04);
      ctx.stroke();
    }

    // Cannon flash
    if (s.muzzle > 0) {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.muzzleX, s.muzzleY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffc800";
      ctx.beginPath();
      ctx.arc(s.muzzleX, s.muzzleY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ball: black with a pink outline, so it's easy to see over the black bricks
    if (s.mode === "ready" || s.mode === "serve" || s.mode === "running") {
      const bx = Math.round(s.bx);
      const by = Math.round(s.by);
      ctx.fillStyle = PINK;
      ctx.fillRect(bx - 2, by - 1, 5, 3);
      ctx.fillRect(bx - 1, by - 2, 3, 5);
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 1, by - 1, 3, 3);
    }

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }

    ctx.restore();

    // HUD
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = INK;
    ctx.textAlign = "left";
    ctx.fillText(`LV ${s.level}`, 6, 6);
    ctx.textAlign = "right";
    ctx.fillText(pad(s.score), W - 6, 6);
    ctx.fillText(`HI ${pad(s.best)}`, W - 6, H - 12);
    for (let i = 0; i < s.lives; i++) {
      ctx.fillStyle = PINK;
      ctx.fillRect(6 + i * 7, H - 11, 5, 5);
    }

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      textBox(ctx, "PINK VORTEX", CY - 16);
      if (blink) textBox(ctx, "PRESS OK", CY + 6);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, CY + 26);
    } else if (s.mode === "running") {
      if (s.flash > 0 && s.flashText === "+1 LIFE") textBox(ctx, s.flashText, 22);
    } else if (s.mode === "serve") {
      if (s.flash > 0) textBox(ctx, s.flashText, CY - 16);
      if (blink) textBox(ctx, "OK TO LAUNCH", CY + 6);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 22);
      textBox(ctx, pad(s.score), 36);
    }
  };

  // Tap or drag on the screen: the paddle follows your finger around the circle
  const pointerAngle = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scale = Math.min(rect.width / W, rect.height / H);
    const offX = (rect.width - W * scale) / 2;
    const offY = (rect.height - H * scale) / 2;
    const x = (e.clientX - rect.left - offX) / scale;
    const y = (e.clientY - rect.top - offY) / scale;
    return Math.atan2(y - CY, x - CX);
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

    // Keyboard: hold ↑ / A to turn left, ↓ / D to turn right
    const down = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowUp" || e.key === "a" || e.key === "A") heldRef.current.ccw = true;
      if (e.key === "ArrowDown" || e.key === "d" || e.key === "D") heldRef.current.cw = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "a" || e.key === "A") heldRef.current.ccw = false;
      if (e.key === "ArrowDown" || e.key === "d" || e.key === "D") heldRef.current.cw = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);

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
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
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
        onPointerDown={(e) => {
          const mode = state.current.mode;
          if (mode === "entry") return;
          if (mode === "board" || mode === "dying") {
            press();
            return;
          }
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          state.current.paddle = pointerAngle(e);
          if (mode !== "running") press();
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) state.current.paddle = pointerAngle(e);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
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
