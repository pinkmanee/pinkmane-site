"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, makeArcade, rainbow, type Arcade, type ShopRow } from "./PinkShop";

// PINK VORTEX: breakout in a circle. Your paddle runs around the outside, the brick rings spin in the middle.
//   click wheel / hold ↑ ↓ (or A D) / drag on the screen = move the paddle      SPACE / OK / tap = launch
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// Leaves fall out of broken bricks: GREEN = bigger paddle, PURPLE = extra life, ORANGE = MULTIBALL (3 balls!).
// Every 5th level is a BOSS RING: BEARMANPIG sits in the middle. Break his armour and hit him until he pops.
// MONEY: SHARDS. 1 per brick, more for clearing a level and beating a boss.
// ONLINE TOP 10: board id "vortex" (see Scoreboard.tsx).

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  touch?: boolean;
};

type Mode = "ready" | "serve" | "running" | "dying" | "over";
type Brick = { ring: number; a0: number; a1: number; hp: number; maxHp: number };
type LeafKind = "wide" | "life" | "multi";
type Leaf = { angle: number; r: number; kind: LeafKind };
type Ball = { x: number; y: number; vx: number; vy: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number };

const GAME_TITLE = "PINK VORTEX";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;
const CX = 160;
const CY = 76;

// The paddle runs around this circle
const R = 64;
// If the ball gets this far out, it's gone
const OUT = R + 9;
const BALL_R = 2;
const WIDE_HALF = 0.5; // paddle size with the green leaf
const CORE_R = 6; // the eye in the middle (BEARMANPIG on boss levels)

// Brick rings (inner radius, thickness, how many bricks)
const RINGS = [
  { rin: 12, th: 7, count: 6 },
  { rin: 21, th: 7, count: 10 },
  { rin: 30, th: 7, count: 14 },
  { rin: 39, th: 7, count: 18 },
];

// ---------- EASY TUNING ----------
const BASE_SPEED = 60;
const MAX_SPEED = 200;
const START_LIVES = 3;
const MAX_LIVES = 6;
const BOSS_EVERY = 5; // every this many levels is a boss ring
const DROP_CHANCE = 0.14; // chance a broken brick drops a leaf
const MAX_BALLS = 8;

// Saved in the visitor's browser
const BEST_KEY = "pinkvortex-best";
const FX_KEY = "pinkvortex-fx";
const SHOP_KEY = "pinkvortex-shop";

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
const ORANGE = "#ff8a1a";
const DARK_ORANGE = "#b04a00";
const RING_COLORS = [PINK, INK, PINK, DARK_PINK];
const FIRE = ["#ffc800", "#ff7a00", "#ffffff", PINK];
const SMOKE = ["#777777", "#999999", "#555555"];
const BOOM = [PINK, "#ffc800", INK, "#777777", "#ffffff", "#d21e1e"];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 60 },
  { id: "ice", name: "ICE", price: 100 },
  { id: "fire", name: "FIRE", price: 160 },
  { id: "rainbow", name: "RAINBOW", price: 250 },
  { id: "gold", name: "GOLD", price: 400 },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "PADDLES" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} PADDLE`, prices: [k.price], wear: true, info: [`A ${k.name} PADDLE`, ""] })),
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:wide", name: "BIGGER PADDLE", prices: [80, 200], info: ["YOUR PADDLE IS WIDER", "A BIT MORE EVERY LEVEL"] },
  { kind: "item", id: "up:life", name: "EXTRA LIFE", prices: [150, 400], info: ["START WITH ONE MORE LIFE", "TWO MORE AT LEVEL 2"] },
  { kind: "item", id: "up:multi", name: "MULTIBALL LUCK", prices: [100, 250], info: ["MORE LEAVES FALL OUT", "AND MORE OF THEM ARE ORANGE"] },
  { kind: "back" },
];

const LEAF_PIXELS = ["....G....", "...GGG...", "G..GGG..G", "GGGGGGGGG", ".GGGGGGG.", "..GG.GG..", "....D....", "....D...."];
const LEAF_COLORS: Record<LeafKind, [string, string]> = { wide: [GREEN, DARK_GREEN], life: [PURPLE, DARK_PURPLE], multi: [ORANGE, DARK_ORANGE] };

// BEARMANPIG's face (boss rings): P pink, D dark pink, K black, W white, B brown fur
const PIG_FACE = [
  ".BB.....BB.",
  "BBBBBBBBBBB",
  "BPPPPPPPPPB",
  "PKWPPPPPWKP",
  "PPPPPPPPPPP",
  "PPPDDDDDPPP",
  "PPPDKDKDPPP",
  ".PPPDDDPPP.",
  "..PPPPPPP..",
];
const PIG_COLORS: Record<string, string> = { P: "#ff8ad8", D: DARK_PINK, K: INK, W: "#ffffff", B: "#6b3a1e" };

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
// Angle between -PI and PI
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// Angle between 0 and 2*PI
const wrap2 = (a: number) => {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
};
// Paddle gets smaller every level
const paddleHalfFor = (level: number) => Math.max(0.17, 0.36 - 0.025 * (level - 1));

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, kind: LeafKind) {
  const [main, dark] = LEAF_COLORS[kind];
  for (let r = 0; r < LEAF_PIXELS.length; r++) {
    for (let c = 0; c < LEAF_PIXELS[r].length; c++) {
      const ch = LEAF_PIXELS[r][c];
      if (ch === "G" || ch === "D") {
        ctx.fillStyle = ch === "G" ? main : dark;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
}
function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, colors: Record<string, string>) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const col = colors[rows[r][c]];
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
}
// the money icon: a little pink shard
const shardIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 2, y, 4, 8);
  ctx.fillRect(x, y + 2, 8, 4);
  ctx.fillStyle = PINK;
  ctx.fillRect(x + 3, y + 1, 2, 6);
  ctx.fillRect(x + 1, y + 3, 6, 2);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 3, y + 2, 1, 1);
};
const paddleColor = (skin: string, t: number) => (skin === "rainbow" ? rainbow(t) : (SKIN_COLORS[skin] ?? SKIN_COLORS.pink)[1]);

export default function VortexGame({ actionSignal, spinRef, fontFamily, muted, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const pressRef = useRef<(() => void) | null>(null);
  const arcRef = useRef<Arcade | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const isTouch = () => touchRef.current || coarse;
    const held = { ccw: false, cw: false };

    const s = {
      mode: "ready" as Mode,
      level: 1,
      score: 0,
      best: 0,
      lives: START_LIVES,
      paddle: Math.PI / 2, // bottom of the circle
      balls: [] as Ball[],
      speed: BASE_SPEED,
      levelSpeed: BASE_SPEED,
      bricks: [] as Brick[],
      rot: [0, 0, 0, 0],
      leaves: [] as Leaf[],
      wide: 0,
      boss: 0, // BEARMANPIG's hits left (0 = no boss)
      bossMax: 0,
      bossHurt: 0,
      particles: [] as Particle[],
      t: 0,
      clock: 0,
      runTime: 0,
      flash: 0,
      flashText: "",
      muzzle: 0,
      muzzleX: 0,
      muzzleY: 0,
      shake: 0,
      run: 0, // shards this game
      newBest: false,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- pause, shop, FX (the same in every game, see PinkShop.ts) ----------
    const bankRun = () => {
      if (s.run > 0) arc.shop.add(s.run);
      s.run = 0;
    };
    const arc = makeArcade({
      W,
      H,
      font: fontFamily,
      fxKey: FX_KEY,
      shopKey: SHOP_KEY,
      rows: SHOP_ROWS,
      moneyName: "SHARDS",
      icon: shardIcon,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, arc.shop.wearing("skin"), cx, cy, t),
      ink: INK,
      muted: () => mutedRef.current,
      touch: isTouch,
      playing: () => s.mode === "running" || s.mode === "serve",
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      busy: () => boardRef.current?.busy() ?? false,
      restart: () => {
        newGame();
        s.mode = "serve";
      },
      leaving: () => {
        if (s.mode === "running" || s.mode === "serve") bankRun();
      },
      stats: () => `LV ${s.level}  SCORE ${pad(s.score)}  +${s.run}`,
      pauseBtn: { x: W - 19, y: 18 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    // ---------- sounds ----------
    const noise = (dur: number, vol: number) => {
      // (a short noise burst made from quick random beeps: the cannon)
      for (let i = 0; i < 4; i++) beep(rand(80, 200), 40, dur, vol, "sawtooth", i * 0.02);
    };
    const playCannon = () => {
      beep(140, 40, 0.25, 0.25, "sine");
      noise(0.2, 0.05);
    };
    const playLifeLost = () => beep(440, 90, 0.35, 0.12);
    const playPowerUp = (high: boolean) => (high ? [523, 659, 784, 1047] : [392, 523, 659]).forEach((f, i) => beep(f, f, 0.11, 0.09, "square", i * 0.07));
    const playBrick = () => beep(900, 500, 0.04, 0.04);
    const playBossHit = () => beep(220, 90, 0.18, 0.1, "sawtooth");
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const isBossLevel = (level: number) => level % BOSS_EVERY === 0;
    const buildLevel = (level: number) => {
      const boss = isBossLevel(level);
      const ringCount = boss ? RINGS.length : Math.min(RINGS.length, level + 1);
      const bricks: Brick[] = [];
      for (let ring = 0; ring < ringCount; ring++) {
        const { count } = RINGS[ring];
        const seg = (Math.PI * 2) / count;
        // Tougher bricks later on (boss rings: his armour)
        let hp = 1;
        if (level >= 3 && ring >= 2) hp = 2;
        if (level >= 5) hp = ring >= 2 ? 3 : 2;
        if (boss) hp = ring === 0 ? 3 : 2;
        for (let i = 0; i < count; i++) bricks.push({ ring, a0: i * seg, a1: (i + 1) * seg - 0.06, hp, maxHp: hp });
      }
      s.bricks = bricks;
      s.rot = [0, 0, 0, 0];
      s.leaves = [];
      s.boss = boss ? 5 + Math.floor(level / BOSS_EVERY) * 2 : 0;
      s.bossMax = s.boss;
      s.levelSpeed = Math.min(MAX_SPEED, BASE_SPEED + (level - 1) * 9);
      s.speed = s.levelSpeed;
    };

    const halfSize = () => (s.wide > 0 ? WIDE_HALF : paddleHalfFor(s.level) + arc.shop.lvl("wide") * 0.035);

    // Put one ball back on the paddle
    const placeOnPaddle = () => {
      const r = R - 3 - BALL_R - 1;
      s.balls = [{ x: CX + Math.cos(s.paddle) * r, y: CY + Math.sin(s.paddle) * r, vx: 0, vy: 0 }];
    };

    const burst = (x: number, y: number, count: number, colors: string[], power: number, size = 2) => {
      for (let i = 0; i < count; i++) {
        s.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power, power), color: colors[Math.floor(Math.random() * colors.length)], life: rand(0.3, 0.9), size });
      }
    };

    const launch = () => {
      const b = s.balls[0];
      if (!b) return;
      const a = s.paddle + Math.PI + rand(-0.25, 0.25);
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      s.speed = s.levelSpeed;
      b.vx = dx * s.speed;
      b.vy = dy * s.speed;
      s.mode = "running";
      // Cannon blast: fire sparks shooting forward, smoke, a flash and a little shake
      for (let i = 0; i < 22; i++) {
        const spread = rand(-0.7, 0.7);
        const sp = rand(40, 130);
        s.particles.push({ x: b.x, y: b.y, vx: Math.cos(a + spread) * sp, vy: Math.sin(a + spread) * sp, color: FIRE[Math.floor(Math.random() * FIRE.length)], life: rand(0.15, 0.45), size: 2 });
      }
      for (let i = 0; i < 10; i++) {
        s.particles.push({ x: b.x, y: b.y, vx: rand(-25, 25) + dx * 15, vy: rand(-25, 25) + dy * 15, color: SMOKE[Math.floor(Math.random() * SMOKE.length)], life: rand(0.4, 0.8), size: 3 });
      }
      s.muzzle = 0.09;
      s.muzzleX = b.x;
      s.muzzleY = b.y;
      s.shake = 0.12;
      playCannon();
    };

    const newGame = () => {
      boardRef.current?.hide();
      s.level = 1;
      s.score = 0;
      s.lives = START_LIVES + arc.shop.lvl("life");
      s.wide = 0;
      s.runTime = 0;
      s.particles = [];
      s.flash = 0;
      s.run = 0;
      s.newBest = false;
      s.t = 0;
      buildLevel(1);
      placeOnPaddle();
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        launch();
      } else if (s.mode === "serve") launch();
      else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return;
        newGame();
        s.mode = "serve";
      }
    };
    pressRef.current = press;

    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      const got = s.run;
      bankRun();
      s.run = got;
      boardRef.current?.gameOver(Math.floor(s.score), s.runTime);
    };

    // the last ball is gone
    const loseLife = (x: number, y: number) => {
      s.lives -= 1;
      s.wide = 0;
      s.leaves = [];
      if (s.lives <= 0) {
        // Game over: big explosion, shake, death sound
        s.mode = "dying";
        s.t = 0;
        s.shake = 0.35;
        burst(x, y, 40, BOOM, 110);
        burst(CX + Math.cos(s.paddle) * R, CY + Math.sin(s.paddle) * R, 25, BOOM, 90);
        if (s.score > s.best) {
          s.best = Math.floor(s.score);
          s.newBest = true;
          try {
            localStorage.setItem(BEST_KEY, String(s.best));
          } catch {}
        }
        playDeath();
      } else {
        burst(x, y, 14, [INK, PINK], 60);
        s.shake = 0.15;
        playLifeLost();
        s.mode = "serve";
        s.speed = s.levelSpeed;
        placeOnPaddle();
      }
    };

    // MULTIBALL: every ball splits into 3
    const multiball = () => {
      const add: Ball[] = [];
      for (const b of s.balls) {
        for (const turnBy of [-0.5, 0.5]) {
          if (s.balls.length + add.length >= MAX_BALLS) break;
          const a = Math.atan2(b.vy, b.vx) + turnBy;
          const sp = Math.hypot(b.vx, b.vy) || s.speed;
          add.push({ x: b.x, y: b.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
        }
      }
      s.balls.push(...add);
    };

    // Move one ball in small steps so it never skips through bricks. Returns false when it flew out.
    const moveBall = (b: Ball, dt: number) => {
      const dist = Math.hypot(b.vx, b.vy) * dt;
      const steps = Math.max(1, Math.ceil(dist / 1.5));
      const sdt = dt / steps;
      for (let step = 0; step < steps; step++) {
        const px = b.x;
        const py = b.y;
        b.x += b.vx * sdt;
        b.y += b.vy * sdt;
        const dx = b.x - CX;
        const dy = b.y - CY;
        const r = Math.hypot(dx, dy) || 0.0001;
        const nx = dx / r;
        const ny = dy / r;
        const theta = Math.atan2(dy, dx);

        // Paddle
        const outward = b.vx * nx + b.vy * ny > 0;
        if (outward && r >= R - 3 - BALL_R && r <= R + 2) {
          const diff = wrap(theta - s.paddle);
          const half = halfSize();
          if (Math.abs(diff) <= half + 0.06) {
            const offset = Math.max(-1, Math.min(1, diff / half));
            const a = theta + Math.PI + offset * 0.9;
            s.speed = Math.min(MAX_SPEED, s.speed + 0.8);
            const sp = Math.max(s.speed, Math.hypot(b.vx, b.vy));
            b.vx = Math.cos(a) * sp;
            b.vy = Math.sin(a) * sp;
            b.x = CX + nx * (R - 3 - BALL_R - 0.5);
            b.y = CY + ny * (R - 3 - BALL_R - 0.5);
            continue;
          }
        }
        // Missed
        if (r > OUT) return false;

        // BEARMANPIG in the middle (boss rings): bounce off him and hurt him
        if (s.boss > 0 && r < CORE_R + BALL_R + 1 && b.vx * nx + b.vy * ny < 0) {
          const dot = b.vx * nx + b.vy * ny;
          b.vx -= 2 * dot * nx;
          b.vy -= 2 * dot * ny;
          b.x = px;
          b.y = py;
          s.boss -= 1;
          s.bossHurt = 0.25;
          s.score += 50 * s.level;
          burst(CX, CY, 12, ["#ff8ad8", DARK_PINK, "#ffffff"], 60);
          playBossHit();
          if (s.boss <= 0) {
            s.score += 500 * s.level;
            s.run += 25;
            s.flash = 1.4;
            s.flashText = "BEARMANPIG POPPED!";
            s.shake = 0.4;
            burst(CX, CY, 40, BOOM, 120);
            playPowerUp(true);
          }
          continue;
        }

        // Bricks
        for (let i = 0; i < s.bricks.length; i++) {
          const br = s.bricks[i];
          const ring = RINGS[br.ring];
          const rin = ring.rin;
          const rout = ring.rin + ring.th;
          if (r + BALL_R < rin || r - BALL_R > rout) continue;
          const local = wrap2(theta - s.rot[br.ring]);
          const margin = BALL_R / Math.max(r, 1);
          if (local < br.a0 - margin || local > br.a1 + margin) continue;
          // Hit! Bounce off the round face or the side of the brick
          const pr = Math.hypot(px - CX, py - CY);
          if (pr + BALL_R < rin || pr - BALL_R > rout) {
            const dot = b.vx * nx + b.vy * ny;
            b.vx -= 2 * dot * nx;
            b.vy -= 2 * dot * ny;
          } else {
            const tx = -ny;
            const ty = nx;
            const dot = b.vx * tx + b.vy * ty;
            b.vx -= 2 * dot * tx;
            b.vy -= 2 * dot * ty;
          }
          b.x = px;
          b.y = py;
          br.hp -= 1;
          const mid = (br.a0 + br.a1) / 2 + s.rot[br.ring];
          const mr = rin + ring.th / 2;
          const hx = CX + Math.cos(mid) * mr;
          const hy = CY + Math.sin(mid) * mr;
          if (br.hp <= 0) {
            s.score += 10 * s.level;
            s.run += 1;
            burst(hx, hy, 8, [RING_COLORS[br.ring], INK], 50);
            playBrick();
            // Weed leaf power-ups: green = bigger paddle, purple (rarer) = extra life, orange = multiball
            if (s.leaves.length < 2 && Math.random() < DROP_CHANCE + arc.shop.lvl("multi") * 0.04) {
              const roll = Math.random();
              const multiShare = 0.3 + arc.shop.lvl("multi") * 0.1;
              let kind: LeafKind = roll < multiShare ? "multi" : roll < multiShare + 0.25 && s.lives < MAX_LIVES ? "life" : "wide";
              if (kind === "wide" && s.wide > 0) kind = "multi";
              s.leaves.push({ angle: mid, r: rout, kind });
            }
            s.bricks.splice(i, 1);
          } else {
            s.score += 2 * s.level;
            burst(hx, hy, 4, [SCREEN, INK], 30);
          }
          break;
        }
      }
      return true;
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.muzzle > 0) s.muzzle -= dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.bossHurt > 0) s.bossHurt -= dt;
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
      if (held.ccw) s.paddle -= 3.6 * dt;
      if (held.cw) s.paddle += 3.6 * dt;
      s.paddle = wrap(s.paddle);

      if (s.mode === "dying") {
        if (s.t > 1.4) gameOver();
        return;
      }
      if (s.mode === "over") return;

      // Brick rings spin, faster on later levels (boss rings spin faster still)
      const fast = s.boss > 0 ? 1.8 : 1;
      for (let i = 0; i < s.rot.length; i++) s.rot[i] += (i % 2 === 0 ? 1 : -1) * (0.12 + 0.06 * Math.min(s.level, 12)) * fast * dt;

      if (s.mode === "ready" || s.mode === "serve") {
        placeOnPaddle();
        return;
      }
      s.runTime += dt;
      if (s.wide > 0) s.wide -= dt;

      // The longer a level lasts, the faster the balls get (gently at first)
      const ramp = Math.min(1.2, 0.4 + 0.12 * s.level);
      const target = Math.min(MAX_SPEED, s.speed + ramp * dt);
      if (target > s.speed) {
        const k = target / s.speed;
        s.speed = target;
        for (const b of s.balls) {
          b.vx *= k;
          b.vy *= k;
        }
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
          } else if (l.kind === "multi") {
            multiball();
            burst(px, py, 14, [ORANGE, DARK_ORANGE, "#ffffff"], 55);
            s.flash = 1;
            s.flashText = "MULTIBALL!";
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

      // the balls (the last one out = you lose a life)
      let lastX = CX;
      let lastY = CY;
      s.balls = s.balls.filter((b) => {
        const ok = moveBall(b, dt);
        if (!ok) {
          lastX = b.x;
          lastY = b.y;
        }
        return ok;
      });
      if (s.balls.length === 0) {
        loseLife(lastX, lastY);
        return;
      }

      // Level cleared (on a boss ring: BEARMANPIG has to pop too)
      if (s.mode === "running" && s.bricks.length === 0 && s.boss <= 0) {
        s.score += 100 * s.level;
        s.run += 10;
        s.level += 1;
        buildLevel(s.level);
        s.mode = "serve";
        placeOnPaddle();
        s.flash = 1.6;
        s.flashText = isBossLevel(s.level) ? "BOSS RING!" : `LEVEL ${s.level}`;
      }
    };

    // ---------- drawing ----------
    const textBox = (text: string, y: number) => {
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = SCREEN;
      ctx.fillRect(Math.round(CX - w / 2), y - 2, Math.round(w), 12);
      ctx.fillStyle = INK;
      ctx.fillText(text, CX, y);
    };
    const drawPaddle = (c: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number, half: number, skin: string, t: number, wide: boolean) => {
      c.lineCap = "butt";
      c.strokeStyle = INK;
      c.lineWidth = 5;
      c.beginPath();
      c.arc(cx, cy, r, angle - half, angle + half);
      c.stroke();
      c.strokeStyle = wide ? GREEN : paddleColor(skin, t);
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, r, angle - half + 0.04, angle + half - 0.04);
      c.stroke();
    };
    const drawBall = (c: CanvasRenderingContext2D, x: number, y: number) => {
      const bx = Math.round(x);
      const by = Math.round(y);
      c.fillStyle = PINK;
      c.fillRect(bx - 2, by - 1, 5, 3);
      c.fillRect(bx - 1, by - 2, 3, 5);
      c.fillStyle = INK;
      c.fillRect(bx - 1, by - 1, 3, 3);
    };
    // the shop's preview + the SHOP panel: the paddle going round a ball, or an upgrade's picture
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = SCREEN;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      if (id === "up:life") {
        for (let i = 0; i < 3; i++) {
          c.fillStyle = PINK;
          c.fillRect(cx - 12 + i * 9, cy - 3 + Math.round(Math.sin(t * 4 + i) * 2), 6, 6);
        }
        drawLeaf(c, cx - 4, cy - 18, "life");
        return;
      }
      if (id === "up:multi") {
        for (let i = 0; i < 3; i++) drawBall(c, cx + Math.cos(t * 2 + i * 2.1) * 10, cy + Math.sin(t * 2 + i * 2.1) * 10);
        drawLeaf(c, cx - 4, cy - 4, "multi");
        return;
      }
      const half = id === "up:wide" ? 0.45 + Math.sin(t * 3) * 0.12 : 0.4;
      drawPaddle(c, cx, cy, 16, t * 1.5, half, skin, t, false);
      drawBall(c, cx + Math.cos(t * 1.5 + Math.PI) * 6, cy + Math.sin(t * 1.5 + Math.PI) * 6);
    };

    const draw = () => {
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

      // The middle: BEARMANPIG on a boss ring, the eye of the vortex otherwise
      if (s.boss > 0) {
        const shake = s.bossHurt > 0 ? Math.round(rand(-1, 1)) : 0;
        drawPixels(ctx, PIG_FACE, CX - 5 + shake, CY - 4, s.bossHurt > 0 && Math.floor(s.clock * 20) % 2 === 0 ? { P: "#ffffff", D: "#ffffff", K: INK, W: "#ffffff", B: "#ffffff" } : PIG_COLORS);
      } else {
        ctx.fillStyle = INK;
        ctx.beginPath();
        ctx.arc(CX, CY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = PINK;
        ctx.fillRect(Math.round(CX + Math.cos(s.clock * 4) * 2) - 1, Math.round(CY + Math.sin(s.clock * 4) * 2) - 1, 2, 2);
      }

      for (const l of s.leaves) drawLeaf(ctx, CX + Math.cos(l.angle) * l.r - 4, CY + Math.sin(l.angle) * l.r - 4, l.kind);

      // Paddle (gone once you're out of lives)
      if (s.mode !== "dying" && s.mode !== "over") drawPaddle(ctx, CX, CY, R, s.paddle, halfSize(), arc.shop.wearingName("skin"), s.clock, s.wide > 0);

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
      if (s.mode === "ready" || s.mode === "serve" || s.mode === "running") for (const b of s.balls) drawBall(ctx, b.x, b.y);
      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.restore();

      // HUD (the speaker sits top left). Not on the start / game over screens: they have their own text there.
      const hud = s.mode !== "ready" && s.mode !== "over";
      ctx.font = `8px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.textAlign = "left";
      if (hud) ctx.fillText(`LV ${s.level}`, 24, 5);
      ctx.textAlign = "right";
      if (hud) ctx.fillText(pad(s.score), W - 6, 5);
      if (hud) ctx.fillText(`HI ${pad(s.best)}`, W - 6, H - 12);
      for (let i = 0; hud && i < s.lives; i++) {
        ctx.fillStyle = PINK;
        ctx.fillRect(6 + i * 7, H - 11, 5, 5);
      }
      // BEARMANPIG's health
      if (s.boss > 0 && s.mode !== "ready") {
        ctx.fillStyle = INK;
        ctx.fillRect(W - 66, 30, 60, 6);
        ctx.fillStyle = "#ff8ad8";
        ctx.fillRect(W - 65, 31, Math.round((58 * s.boss) / s.bossMax), 4);
        ctx.fillStyle = INK;
        ctx.textAlign = "right";
        ctx.fillText("BOSS", W - 6, 40);
      }

      ctx.textAlign = "center";
      const blink = Math.floor(s.clock * 2) % 2 === 0;
      if (s.mode === "running" && s.flash > 0 && s.flashText !== `LEVEL ${s.level}`) textBox(s.flashText, 18);
      if (s.mode === "serve") {
        if (s.flash > 0) textBox(s.flashText, CY - 16);
        if (blink) textBox(isTouch() ? "TAP TO LAUNCH" : "OK TO LAUNCH", CY + 6);
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "BREAKOUT IN A CIRCLE",
          lines: [
            [isTouch() ? "DRAG = MOVE THE PADDLE" : "↑ ↓ = MOVE THE PADDLE", "#ffffff"],
            ["ORANGE LEAF = MULTIBALL", KIT.lilac],
            ["BOSS EVERY 5 LEVELS", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${pad(top.score)}` : s.best > 0 ? `BEST ${pad(s.best)}` : undefined,
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS   - / + = FX VOLUME",
        });
        arc.drawPanels(ctx, s.clock);
      }
      if (s.mode === "over") {
        drawOverScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          age: s.t,
          title: "GAME OVER",
          score: `SCORE ${pad(s.score)}`,
          best: `BEST ${pad(s.best)}`,
          newBest: s.newBest,
          stats: `LEVEL ${s.level}`,
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} SHARDS SAVED`,
        });
        if (s.t > 0.4) arc.drawPanels(ctx, s.clock);
      }
      arc.drawOverlays(ctx, s.clock);
    };

    // ---------- keys ----------
    const onKeyFirst = (e: KeyboardEvent) => {
      if (arc.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowUp" || e.key === "a" || e.key === "A") held.ccw = true;
      if (e.key === "ArrowDown" || e.key === "d" || e.key === "D") held.cw = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "a" || e.key === "A") held.ccw = false;
      if (e.key === "ArrowDown" || e.key === "d" || e.key === "D") held.cw = false;
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    // ---------- taps + dragging: the paddle follows your finger around the circle ----------
    const toGame = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      const g = toGame(e.clientX, e.clientY);
      if (arc.tap(g.x, g.y)) {
        if (arc.dragging()) canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (arc.frozen()) return;
      if (s.mode === "over" || s.mode === "dying" || s.mode === "ready") {
        press();
        return;
      }
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      s.paddle = Math.atan2(g.y - CY, g.x - CX);
      if (s.mode === "serve") press();
    };
    const onMove = (e: PointerEvent) => {
      if (arc.dragging()) {
        arc.drag(toGame(e.clientX, e.clientY).y);
        return;
      }
      if (!dragging || arc.frozen()) return;
      const g = toGame(e.clientX, e.clientY);
      s.paddle = Math.atan2(g.y - CY, g.x - CX);
    };
    const onUp = () => {
      if (arc.dragging()) arc.drag(-1);
      dragging = false;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const onHidden = () => {
      if (document.hidden && (s.mode === "running" || s.mode === "serve")) arc.setPause(true);
    };
    document.addEventListener("visibilitychange", onHidden);

    newGame();
    s.mode = "ready";

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (arc.frozen()) {
        spinRef.current = 0;
        held.ccw = held.cw = false;
      } else update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyFirst, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onHidden);
      if (s.mode === "running" || s.mode === "serve") bankRun();
      arc.closeSound();
      pressRef.current = null;
      arcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily]);

  // OK / Enter / Space from the page (the pause menu or shop gets it first when open)
  useEffect(() => {
    if (actionSignal === firstSignal.current) return;
    if (arcRef.current?.ok()) return;
    pressRef.current?.();
  }, [actionSignal]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
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
      <ScorePanel game="vortex" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
