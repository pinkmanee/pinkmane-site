"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  jumpSignal: number;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // Chosen before the game starts
  theme: "light" | "dark";
};

type Mode = "ready" | "running" | "dying" | "entry" | "board";
// kind 0 = pink spikes, 1 = speaker box, 2 = flying bat. y = top edge.
type Obstacle = { x: number; y: number; w: number; h: number; kind: number };
type Leaf = { x: number; y: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the iPod screen.
const W = 256;
const H = 160;
const GROUND = 138;
const PLAYER_X = 36;

// Size of one frame of the character in /public/game/pinkdude.png
const SPRITE_W = 24;
const SPRITE_H = 35;

// Feel of the game
const GRAVITY = 1100;
const JUMP_VELOCITY = -340;
const AIR_TIME = (2 * -JUMP_VELOCITY) / GRAVITY;
const START_SPEED = 120;
const MAX_SPEED = 380;
const ACCEL = 7;

// Saved in the visitor's browser
const BEST_KEY = "pinkrun-best";
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

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

// Put your death sound here: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const INK = "#111111";
const PINK = "#d63cc8";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";

// Light and dark look for the game
const THEMES = {
  light: { bg: "#d7efbc", ink: "#111111" },
  dark: { bg: "#15121b", ink: "#ececec" },
};
type Colors = { bg: string; ink: string };

// Weed leaf with 7 points
const LEAF_PIXELS = [
  "......G......",
  ".....GGG.....",
  "..G..GGG..G..",
  "..GG.GGG.GG..",
  "...GGGGGGG...",
  "G...GGGGG...G",
  "GGG..GGG..GGG",
  ".GGGGGGGGGGG.",
  "...GG.G.GG...",
  "......D......",
  "......D......",
];
const LEAF_W = 13;
const LEAF_H = 11;

const BAT_FRAMES = [
  [
    "K............K",
    "KK..........KK",
    ".KKK..KK..KKK.",
    "..KKKKKKKKKK..",
    "....KPKKPK....",
    ".....KKKK.....",
    "..............",
    "..............",
  ],
  [
    "..............",
    "..............",
    "....KKKKKK....",
    "..KKKPKKPKKK..",
    ".KKKKKKKKKKKK.",
    "KK...KKKK...KK",
    "K............K",
    "..............",
  ],
];

function palette(c: Colors): Record<string, string> {
  return { G: GREEN, D: DARK_GREEN, K: c.ink, P: PINK };
}

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

export default function JumpGame({ jumpSignal, fontFamily, muted, theme }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  // White outline around the character, used in dark mode
  const outlineRef = useRef<HTMLCanvasElement[]>([]);
  const colorsRef = useRef<Colors>(THEMES[theme]);
  colorsRef.current = THEMES[theme];
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const firstSignal = useRef(jumpSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

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
    y: GROUND - SPRITE_H,
    vy: 0,
    onGround: true,
    obstacles: [] as Obstacle[],
    leaves: [] as Leaf[],
    particles: [] as Particle[],
    speed: START_SPEED,
    distToNext: 200,
    score: 0,
    best: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    groundOffset: 0,
    shield: false,
    invuln: 0,
    shake: 0,
  });

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores", { cache: "no-store" });
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

  const resetRun = () => {
    const s = state.current;
    s.y = GROUND - SPRITE_H;
    s.vy = 0;
    s.onGround = true;
    s.obstacles = [];
    s.leaves = [];
    s.particles = [];
    s.speed = START_SPEED;
    s.distToNext = 200;
    s.score = 0;
    s.runTime = 0;
    s.shield = false;
    s.invuln = 0;
    s.shake = 0;
  };

  const jump = () => {
    const s = state.current;
    if (s.onGround) {
      s.vy = JUMP_VELOCITY;
      s.onGround = false;
    }
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power * 1.6, -power * 0.2),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.5, 1.3),
      });
    }
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

  // Called on OK / Enter / Space / tapping the screen
  const press = () => {
    const s = state.current;
    if (s.mode === "ready") {
      s.mode = "running";
      jump();
    } else if (s.mode === "running") {
      jump();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      resetRun();
      s.mode = "running";
    }
  };

  const die = () => {
    const s = state.current;
    s.mode = "dying";
    s.deadAt = s.t;
    s.shake = 0.35;
    const ink = colorsRef.current.ink;
    burst(PLAYER_X + 12, s.y + 17, 50, [PINK, "#ffc800", ink, "#777777", "#ffffff", "#d21e1e"], 170);
    if (s.score > s.best) {
      s.best = Math.floor(s.score);
      try {
        localStorage.setItem(BEST_KEY, String(s.best));
      } catch {}
    }
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
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

  const spawnPattern = () => {
    const s = state.current;
    const progress = Math.min(1, s.runTime / 90);
    const r = Math.random();
    const startX = W + 10;
    let width = 0;
    let allowLeaf = true;

    if (s.score > 800 && r < 0.18) {
      // Flying bat: stay on the ground and let it pass over you
      const bottom = GROUND - Math.floor(rand(38, 46));
      s.obstacles.push({ x: startX, y: bottom - 8, w: 14, h: 8, kind: 2 });
      width = 14;
      allowLeaf = false;
    } else if (s.score > 500 && r < 0.4) {
      // Two obstacles close together: one long jump over both
      const w1 = 6 * Math.floor(rand(1, 2.99));
      const h1 = Math.floor(rand(12, 20));
      const gap = Math.floor(rand(3, 8));
      const w2 = Math.floor(rand(8, 12));
      const h2 = Math.floor(rand(14, 22));
      s.obstacles.push({ x: startX, y: GROUND - h1, w: w1, h: h1, kind: 0 });
      s.obstacles.push({ x: startX + w1 + gap, y: GROUND - h2, w: w2, h: h2, kind: 1 });
      width = w1 + gap + w2;
    } else {
      const kind = Math.random() < 0.6 ? 0 : 1;
      const maxH = 22 + progress * 8;
      const w = kind === 0 ? 6 * Math.floor(rand(1, 3.99)) : Math.floor(rand(10, 15));
      const h = Math.floor(rand(12, maxH));
      s.obstacles.push({ x: startX, y: GROUND - h, w, h, kind });
      width = w;
    }

    // Gaps get shorter over time, but always leave room to land and jump again
    const minGap = s.speed * AIR_TIME + 14;
    const extra = Math.max(30, 240 * (1 - progress));
    const gap = rand(minGap, minGap + extra);

    // Rare weed leaf power-up = shield
    if (allowLeaf && !s.shield && s.score > 300 && Math.random() < 0.09) {
      s.leaves.push({ x: startX + width + gap / 2 - LEAF_W / 2, y: GROUND - Math.floor(rand(48, 64)) });
    }

    s.distToNext = width + gap;
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;

    for (const p of s.particles) {
      p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 1.4) finishDeath();
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;
    s.speed = Math.min(MAX_SPEED, START_SPEED + s.runTime * ACCEL);
    s.score += (s.speed * dt) / 8;
    if (s.invuln > 0) s.invuln -= dt;

    // Jumping and falling
    s.vy += GRAVITY * dt;
    s.y += s.vy * dt;
    const floorY = GROUND - SPRITE_H;
    if (s.y >= floorY) {
      s.y = floorY;
      s.vy = 0;
      s.onGround = true;
    }

    // Move the world
    const move = s.speed * dt;
    s.groundOffset += move;
    for (const o of s.obstacles) o.x -= move;
    for (const l of s.leaves) l.x -= move;
    s.obstacles = s.obstacles.filter((o) => o.x + o.w > -5);
    s.leaves = s.leaves.filter((l) => l.x > -LEAF_W - 4);

    s.distToNext -= move;
    if (s.distToNext <= 0) spawnPattern();

    // Collect leaves (whole body counts)
    const bx1 = PLAYER_X + 4;
    const bx2 = PLAYER_X + 20;
    const by1 = s.y;
    const by2 = s.y + SPRITE_H;
    for (const l of s.leaves) {
      if (bx2 > l.x && bx1 < l.x + LEAF_W && by2 > l.y && by1 < l.y + LEAF_H) {
        s.shield = true;
        burst(l.x + LEAF_W / 2, l.y + LEAF_H / 2, 14, [GREEN, DARK_GREEN], 80);
        l.x = -100;
      }
    }

    // Hit check (a bit forgiving: hair and arms don't count)
    const px1 = PLAYER_X + 8;
    const px2 = PLAYER_X + 17;
    const py1 = s.y + 9;
    const py2 = s.y + SPRITE_H - 1;
    for (const o of s.obstacles) {
      const hit = px2 > o.x + 2 && px1 < o.x + o.w - 2 && py2 > o.y + 2 && py1 < o.y + o.h;
      if (!hit || s.invuln > 0) continue;
      if (s.shield) {
        s.shield = false;
        s.invuln = 1;
        burst(o.x + o.w / 2, o.y + o.h / 2, 18, [GREEN, DARK_GREEN, PINK], 110);
        o.x = -100;
      } else {
        die();
      }
      break;
    }
  };

  const drawObstacle = (ctx: CanvasRenderingContext2D, o: Obstacle, t: number) => {
    const c = colorsRef.current;
    const x = Math.round(o.x);
    if (o.kind === 0) {
      // Pink crystal spikes
      const count = Math.max(1, Math.round(o.w / 6));
      const tw = o.w / count;
      ctx.fillStyle = PINK;
      for (let i = 0; i < count; i++) {
        for (let r = 0; r < o.h; r++) {
          const half = Math.floor((r / o.h) * (tw / 2));
          ctx.fillRect(Math.round(x + i * tw + tw / 2 - half - 1), o.y + r, half * 2 + 2, 1);
        }
      }
      ctx.fillStyle = c.ink;
      ctx.fillRect(x, GROUND - 2, o.w, 2);
    } else if (o.kind === 1) {
      // Black speaker box
      ctx.fillStyle = c.ink;
      ctx.fillRect(x, o.y, o.w, o.h);
      ctx.fillStyle = PINK;
      const cx = x + Math.floor(o.w / 2);
      ctx.fillRect(cx - 2, o.y + 4, 4, 4);
      ctx.fillRect(cx - 3, GROUND - 10, 6, 6);
    } else {
      // Flying bat
      drawPixels(ctx, BAT_FRAMES[Math.floor(t * 8) % 2], x, o.y, palette(c));
    }
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const c = colorsRef.current;
    const status = boardStatusRef.current;
    ctx.textBaseline = "top";
    ctx.fillStyle = c.ink;
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
        const mine = e.name === myNameRef.current;
        if (mine) {
          ctx.fillStyle = PINK;
          ctx.fillRect(24, y - 2, W - 48, 11);
        }
        ctx.fillStyle = c.ink;
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
    const c = colorsRef.current;
    const pal = palette(c);
    ctx.font = `8px ${fontFamily}`;

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));

    ctx.fillStyle = c.bg;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    if (s.mode === "board") {
      ctx.restore();
      drawBoard(ctx);
      return;
    }

    // Ground
    ctx.fillStyle = c.ink;
    ctx.fillRect(0, GROUND, W, 1);
    for (let i = 0; i < W / 16 + 1; i++) {
      const gx = Math.round((((i * 16 - s.groundOffset) % W) + W) % W);
      ctx.fillRect(gx, GROUND + 4, 5, 1);
      ctx.fillRect((gx + 9) % W, GROUND + 9, 3, 1);
    }

    for (const o of s.obstacles) drawObstacle(ctx, o, s.t);
    for (const l of s.leaves) drawPixels(ctx, LEAF_PIXELS, l.x, l.y + Math.round(Math.sin(s.t * 5) * 2), pal);

    // Character (hidden once he explodes, blinks after the shield saves him)
    const alive = s.mode === "ready" || s.mode === "running";
    const blinking = s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0;
    if (alive && !blinking) {
      const frame = s.mode === "running" && s.onGround ? Math.floor(s.runTime * 10) % 2 : 0;
      const sprite = spriteRef.current;
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const outline = outlineRef.current[frame];
        if (c.bg === THEMES.dark.bg && outline) ctx.drawImage(outline, PLAYER_X - 1, Math.round(s.y) - 1);
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, PLAYER_X, Math.round(s.y), SPRITE_W, SPRITE_H);
      } else {
        ctx.fillStyle = PINK;
        ctx.fillRect(PLAYER_X + 6, Math.round(s.y), 12, SPRITE_H);
      }
      // Little leaf floating above his head while the shield is on
      if (s.shield) drawPixels(ctx, LEAF_PIXELS, PLAYER_X + 5, s.y - 14 + Math.round(Math.sin(s.t * 6)), pal);
    }

    // Explosion pieces
    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }

    ctx.restore();

    // Scores
    ctx.textBaseline = "top";
    ctx.textAlign = "right";
    ctx.fillStyle = c.ink;
    ctx.fillText(`HI ${pad(s.best)}  ${pad(s.score)}`, W - 6, 6);
    if (s.shield) drawPixels(ctx, LEAF_PIXELS, 6, 3, pal);

    // Messages
    ctx.textAlign = "center";
    const blink = Math.floor(s.t * 2) % 2 === 0;
    if (s.mode === "ready") {
      ctx.fillText("PINK RUN", W / 2, 40);
      if (blink) ctx.fillText("PRESS OK TO START", W / 2, 58);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) {
        ctx.fillText(`#1 ${top.name} ${pad(top.score)}`, W / 2, 80);
      }
    }
    if (s.mode === "entry") {
      ctx.fillText("NEW TOP 10 SCORE!", W / 2, 36);
      ctx.fillText(pad(s.score), W / 2, 52);
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
    sprite.onload = () => {
      const frames: HTMLCanvasElement[] = [];
      for (let f = 0; f < 2; f++) {
        const oc = document.createElement("canvas");
        oc.width = SPRITE_W + 2;
        oc.height = SPRITE_H + 2;
        const octx = oc.getContext("2d");
        if (!octx) continue;
        for (const [dx, dy] of [[0, 1], [2, 1], [1, 0], [1, 2]]) {
          octx.drawImage(sprite, f * SPRITE_W, 0, SPRITE_W, SPRITE_H, dx, dy, SPRITE_W, SPRITE_H);
        }
        octx.globalCompositeOperation = "source-in";
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, oc.width, oc.height);
        frames.push(oc);
      }
      outlineRef.current = frames;
    };
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
      const saved = Number(localStorage.getItem(BEST_KEY));
      if (saved > 0) state.current.best = saved;
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) {
        nameRef.current = savedName;
        setName(savedName);
      }
    } catch {}

    loadBoard();

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
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls
  useEffect(() => {
    if (jumpSignal !== firstSignal.current) press();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpSignal]);

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
        onPointerDown={() => {
          if (state.current.mode !== "entry") press();
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: THEMES[theme].bg,
          touchAction: "manipulation",
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
