"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, drawOverScreen, drawStartScreen, makeArcade, repaintPink, type Arcade, type ShopRow } from "./PinkShop";
import { isPhoneOrTablet } from "./device";

// PINK RUN: the very first game. Pinkmane runs, you jump over the spikes, speaker boxes and bats.
//   SPACE / OK / ↑ / tap = jump. Press it again in the air = DOUBLE JUMP.
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// A WEED LEAF = a shield (blocks one hit). Little green NUGS float along the way: they're your money.
// The PINK SHOP has PINKMANE VOID's outfits (the same pictures) and upgrades.
// This one stays on the iPod screen (256 x 160) on purpose: the old-school look.
// ONLINE TOP 10: board id "pinkrun" (see Scoreboard.tsx).

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  jumpSignal: number;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // Chosen before the game starts
  theme: "light" | "dark";
  touch?: boolean;
};

type Mode = "ready" | "running" | "dying" | "over";
// kind 0 = pink spikes, 1 = speaker box, 2 = flying bat. y = top edge.
type Obstacle = { x: number; y: number; w: number; h: number; kind: number };
type Thing = { x: number; y: number; taken?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };

const GAME_TITLE = "PINK RUN";

// Game size in pixels (the iPod screen)
const W = 256;
const H = 160;
const GROUND = 138;
const PLAYER_X = 36;

// Size of one frame of the character in /public/game/pinkdude.png
const SPRITE_W = 24;
const SPRITE_H = 35;

// ---------- EASY TUNING ----------
const GRAVITY = 1100;
const JUMP_VELOCITY = -340;
const DOUBLE_JUMP_VELOCITY = -290; // the second jump in the air (a bit smaller)
const AIR_TIME = (2 * -JUMP_VELOCITY) / GRAVITY;
const START_SPEED = 120;
const MAX_SPEED = 380;
const ACCEL = 7;
const NUG_ROW_CHANCE = 0.35; // chance a row of nugs floats over a gap
const MAGNET_RANGE = [0, 22, 34, 48];

// Saved in the visitor's browser
const BEST_KEY = "pinkrun-best";
const FX_KEY = "pinkrun-fx";
const SHOP_KEY = "pinkrun-shop";

// Put your death sound here: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const INK = "#111111";
const PINK = "#d63cc8";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const NUG_GREEN = "#6fdc5a";

// Light and dark look for the game
const THEMES = {
  light: { bg: "#d7efbc", ink: "#111111" },
  dark: { bg: "#15121b", ink: "#ececec" },
};
type Colors = { bg: string; ink: string };

// ---------- the PINK SHOP ----------
// OUTFITS: the same pictures PINKMANE VOID uses (the same layout as pinkdude.png).
// If a file is missing, the classic picture is repainted with the 3 colours in recolor (dark, main, light) instead.
const OUTFITS: { id: string; name: string; price: number; file?: string; recolor?: [string, string, string]; ghost?: boolean }[] = [
  { id: "classic", name: "CLASSIC", price: 0 },
  { id: "trippy", name: "TRIPPY", price: 150, file: "/game/pinkdude-pinkfit.png", recolor: ["#a8287e", "#ff5fd2", "#ffb8ee"] },
  { id: "icy", name: "ICY", price: 250, file: "/game/pinkdude-icy.png", recolor: ["#2a9ad0", "#8fd9ff", "#e8f8ff"] },
  { id: "ghost", name: "GHOSTY", price: 350, file: "/game/pinkdude-ghost.png", recolor: ["#7ab8a8", "#bfe9d8", "#f0fff8"], ghost: true },
  { id: "toxic", name: "TOXIC", price: 450, recolor: ["#2c8a33", "#6fdc5a", "#b8ff9a"] },
  { id: "bloody", name: "BLOODY", price: 550, recolor: ["#7a0c0c", "#d21e1e", "#ff6a6a"] },
  { id: "shadow", name: "SHADOW", price: 650, recolor: ["#1e1230", "#3b2456", "#7a5aa8"] },
  { id: "gold", name: "GOLD", price: 900, recolor: ["#b8860b", "#ffd700", "#fff3a0"] },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "OUTFITS" },
  ...OUTFITS.map((o): ShopRow => ({ kind: "item", id: `skin:${o.id}`, name: `${o.name} PINKMANE`, prices: [o.price], wear: true, info: [`${o.name} PINKMANE`, ""] })),
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:magnet", name: "NUG MAGNET", prices: [60, 150, 300], info: ["PULLS NEARBY NUGS TO YOU", "A BIGGER PULL EVERY LEVEL"] },
  { kind: "item", id: "up:lucky", name: "LUCKY LEAF", prices: [80, 200], info: ["MORE SHIELD LEAVES", "AND THEY SHOW UP SOONER"] },
  { kind: "item", id: "up:start", name: "START SHIELD", prices: [250], info: ["EVERY RUN STARTS", "WITH A SHIELD ON"] },
  { kind: "back" },
];

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
  ["K............K", "KK..........KK", ".KKK..KK..KKK.", "..KKKKKKKKKK..", "....KPKKPK....", ".....KKKK.....", "..............", ".............."],
  ["..............", "..............", "....KKKKKK....", "..KKKPKKPKKK..", ".KKKKKKKKKKKK.", "KK...KKKK...KK", "K............K", ".............."],
];
const NUG = [".GG.", "GGGG", "GLGG", ".GG."];

const palette = (c: Colors): Record<string, string> => ({ G: GREEN, D: DARK_GREEN, K: c.ink, P: PINK, L: "#ffffff" });
function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, colors: Record<string, string>) {
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
// the money icon: a nug
const nugIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y, 6, 8);
  ctx.fillRect(x, y + 1, 8, 6);
  drawPixels(ctx, NUG.map((r) => r.replace(/G/g, "N")), x + 2, y + 2, { N: NUG_GREEN, L: "#ffffff" });
};

export default function JumpGame({ jumpSignal, fontFamily, muted, theme, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const colorsRef = useRef<Colors>(THEMES[theme]);
  colorsRef.current = THEMES[theme];
  const firstSignal = useRef(jumpSignal);
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
    ctx.imageSmoothingEnabled = false;
    const coarse = isPhoneOrTablet(); // a real phone or tablet (a computer with a touch screen still says CLICK)
    const isTouch = () => touchRef.current || coarse;

    // ---------- the pictures: Pinkmane in every outfit, and a white outline for the dark look ----------
    const pics: Record<string, CanvasImageSource | null> = {};
    const outlines: Record<string, HTMLCanvasElement[]> = {};
    const makeOutline = (src: CanvasImageSource) => {
      const frames: HTMLCanvasElement[] = [];
      for (let f = 0; f < 2; f++) {
        const oc = document.createElement("canvas");
        oc.width = SPRITE_W + 2;
        oc.height = SPRITE_H + 2;
        const octx = oc.getContext("2d");
        if (!octx) continue;
        for (const [dx, dy] of [
          [0, 1],
          [2, 1],
          [1, 0],
          [1, 2],
        ]) {
          octx.drawImage(src, f * SPRITE_W, 0, SPRITE_W, SPRITE_H, dx, dy, SPRITE_W, SPRITE_H);
        }
        octx.globalCompositeOperation = "source-in";
        octx.fillStyle = "#ffffff";
        octx.fillRect(0, 0, oc.width, oc.height);
        frames.push(oc);
      }
      return frames;
    };
    const keep = (id: string, src: CanvasImageSource) => {
      pics[id] = src;
      outlines[id] = makeOutline(src);
    };
    const sprite = new Image();
    sprite.onload = () => {
      if (sprite.width < SPRITE_W * 2 || sprite.height < SPRITE_H) return;
      keep("classic", sprite);
      for (const o of OUTFITS) {
        if (o.recolor && !pics[o.id]) keep(o.id, repaintPink(sprite, o.recolor));
        if (o.file) {
          const own = new Image();
          own.onload = () => {
            if (own.width >= SPRITE_W * 2 && own.height >= SPRITE_H) keep(o.id, own);
          };
          own.src = o.file;
        }
      }
    };
    sprite.src = "/game/pinkdude.png";

    const s = {
      mode: "ready" as Mode,
      y: GROUND - SPRITE_H,
      vy: 0,
      onGround: true,
      airJumps: 0, // double jumps left in this jump
      obstacles: [] as Obstacle[],
      leaves: [] as Thing[],
      nugs: [] as Thing[],
      particles: [] as Particle[],
      speed: START_SPEED,
      distToNext: 200,
      score: 0,
      best: 0,
      t: 0,
      clock: 0,
      runTime: 0,
      groundOffset: 0,
      shield: false,
      invuln: 0,
      shake: 0,
      run: 0, // nugs this run
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
      moneyName: "NUGS",
      icon: nugIcon,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, arc.shop.wearing("skin"), cx, cy, t),
      ink: colorsRef.current.ink,
      muted: () => mutedRef.current,
      touch: isTouch,
      playing: () => s.mode === "running",
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      busy: () => boardRef.current?.busy() ?? false,
      restart: () => {
        resetRun();
        s.mode = "running";
      },
      leaving: () => {
        if (s.mode === "running") bankRun();
      },
      stats: () => `SCORE ${pad(s.score)}  +${s.run} NUGS`,
      pauseBtn: { x: 42, y: 3 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    // ---------- sounds ----------
    const playJump = () => beep(300, 620, 0.09, 0.05, "square");
    const playDouble = () => beep(500, 1000, 0.1, 0.05, "square");
    const playNug = () => beep(1300, 1900, 0.04, 0.035);
    const playShield = () => [523, 784, 1047].forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.06));
    const playBlock = () => beep(700, 200, 0.2, 0.08, "sawtooth");
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const resetRun = () => {
      boardRef.current?.hide();
      s.y = GROUND - SPRITE_H;
      s.vy = 0;
      s.onGround = true;
      s.airJumps = 0;
      s.obstacles = [];
      s.leaves = [];
      s.nugs = [];
      s.particles = [];
      s.speed = START_SPEED;
      s.distToNext = 200;
      s.score = 0;
      s.runTime = 0;
      s.shield = arc.shop.lvl("start") > 0;
      s.invuln = 0;
      s.shake = 0;
      s.run = 0;
      s.newBest = false;
      s.t = 0;
    };
    const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
      for (let i = 0; i < count; i++) {
        s.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power * 1.6, -power * 0.2), color: colors[Math.floor(Math.random() * colors.length)], life: rand(0.5, 1.3) });
      }
    };
    const jump = () => {
      if (s.onGround) {
        s.vy = JUMP_VELOCITY;
        s.onGround = false;
        s.airJumps = 1;
        playJump();
      } else if (s.airJumps > 0) {
        // DOUBLE JUMP: a little puff of leaves under his feet
        s.airJumps -= 1;
        s.vy = DOUBLE_JUMP_VELOCITY;
        burst(PLAYER_X + 12, s.y + SPRITE_H, 8, [GREEN, DARK_GREEN, "#ffffff"], 50);
        playDouble();
      }
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        resetRun();
        s.mode = "running";
        jump();
      } else if (s.mode === "running") jump();
      else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return;
        resetRun();
        s.mode = "running";
      }
    };
    pressRef.current = press;

    const die = () => {
      s.mode = "dying";
      s.t = 0;
      s.shake = 0.35;
      burst(PLAYER_X + 12, s.y + 17, 50, [PINK, "#ffc800", colorsRef.current.ink, "#777777", "#ffffff", "#d21e1e"], 170);
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      const got = s.run;
      bankRun();
      s.run = got;
      boardRef.current?.gameOver(Math.floor(s.score), s.runTime);
    };

    const spawnPattern = () => {
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
      // Weed leaf = shield (LUCKY LEAF = more of them, sooner)
      const lucky = arc.shop.lvl("lucky");
      if (allowLeaf && !s.shield && s.score > 300 - lucky * 120 && Math.random() < 0.09 + lucky * 0.05) {
        s.leaves.push({ x: startX + width + gap / 2 - LEAF_W / 2, y: GROUND - Math.floor(rand(48, 64)) });
      } else if (Math.random() < NUG_ROW_CHANCE) {
        // a little arc of nugs over the obstacle: jump through them
        const n = 3 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const k = n === 1 ? 0.5 : i / (n - 1);
          s.nugs.push({ x: startX + width / 2 - (n - 1) * 5 + i * 10, y: GROUND - 34 - Math.round(Math.sin(k * Math.PI) * 18) });
        }
      }
      s.distToNext = width + gap;
    };

    const update = (dt: number) => {
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
        if (s.t > 1.4) gameOver();
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
        s.airJumps = 0;
      }
      // Move the world
      const move = s.speed * dt;
      s.groundOffset += move;
      for (const o of s.obstacles) o.x -= move;
      for (const l of s.leaves) l.x -= move;
      for (const n of s.nugs) n.x -= move;
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > -5);
      s.leaves = s.leaves.filter((l) => l.x > -LEAF_W - 4 && !l.taken);
      s.nugs = s.nugs.filter((n) => n.x > -8 && !n.taken);
      s.distToNext -= move;
      if (s.distToNext <= 0) spawnPattern();

      // Collect leaves + nugs (whole body counts; the NUG MAGNET pulls nugs in)
      const bx1 = PLAYER_X + 4;
      const bx2 = PLAYER_X + 20;
      const by1 = s.y;
      const by2 = s.y + SPRITE_H;
      for (const l of s.leaves) {
        if (!l.taken && bx2 > l.x && bx1 < l.x + LEAF_W && by2 > l.y && by1 < l.y + LEAF_H) {
          l.taken = true;
          s.shield = true;
          burst(l.x + LEAF_W / 2, l.y + LEAF_H / 2, 14, [GREEN, DARK_GREEN], 80);
          playShield();
        }
      }
      const pull = MAGNET_RANGE[arc.shop.lvl("magnet")] ?? 0;
      const cx = PLAYER_X + 12;
      const cy = s.y + SPRITE_H / 2;
      for (const n of s.nugs) {
        if (n.taken) continue;
        const dx = cx - (n.x + 2);
        const dy = cy - (n.y + 2);
        const d = Math.hypot(dx, dy);
        if (pull > 0 && d < pull) {
          n.x += (dx / d) * 200 * dt;
          n.y += (dy / d) * 200 * dt;
        }
        if (bx2 > n.x && bx1 < n.x + 4 && by2 > n.y && by1 < n.y + 4) {
          n.taken = true;
          s.run += 1;
          playNug();
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
          playBlock();
        } else die();
        break;
      }
    };

    // ---------- drawing ----------
    const drawObstacle = (o: Obstacle, t: number) => {
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
      } else drawPixels(ctx, BAT_FRAMES[Math.floor(Math.max(0, t) * 8) % 2], x, o.y, palette(c)); // Flying bat
    };
    // Pinkmane in an outfit (frame 0 or 1)
    const drawDude = (c: CanvasRenderingContext2D, id: string, x: number, y: number, frame: number, outline: boolean) => {
      const pic = pics[id] ?? pics.classic;
      if (!pic) {
        c.fillStyle = PINK;
        c.fillRect(x + 6, y, 12, SPRITE_H);
        return;
      }
      const ol = (outlines[id] ?? outlines.classic)?.[frame];
      if (outline && ol) c.drawImage(ol, x - 1, y - 1);
      if (OUTFITS.find((o) => o.id === id)?.ghost) c.globalAlpha = 0.7;
      c.drawImage(pic, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, SPRITE_W, SPRITE_H);
      c.globalAlpha = 1;
    };
    // the shop's preview + the SHOP panel
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      const col = colorsRef.current;
      c.fillStyle = col.bg;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const outfit = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      const frame = Math.floor(Math.max(0, t) * 8) % 2;
      if (id === "up:magnet") {
        drawDude(c, outfit, cx - 26, cy - 18, frame, col.bg === THEMES.dark.bg);
        for (let i = 0; i < 3; i++) drawPixels(c, NUG, cx + 2 + ((t * 30 + i * 9) % 24), cy - 4, { G: NUG_GREEN, L: "#ffffff" });
        return;
      }
      if (id === "up:lucky" || id === "up:start") {
        drawDude(c, outfit, cx - 12, cy - 12, frame, col.bg === THEMES.dark.bg);
        drawPixels(c, LEAF_PIXELS, cx - 7, cy - 28 + Math.round(Math.sin(t * 6)), palette(col));
        return;
      }
      drawDude(c, outfit, cx - 12, cy - 18, frame, col.bg === THEMES.dark.bg);
    };

    const draw = () => {
      const c = colorsRef.current;
      const pal = palette(c);
      ctx.font = `8px ${fontFamily}`;
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = c.bg;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      // Ground
      ctx.fillStyle = c.ink;
      ctx.fillRect(0, GROUND, W, 1);
      for (let i = 0; i < W / 16 + 1; i++) {
        const gx = Math.round((((i * 16 - s.groundOffset) % W) + W) % W);
        ctx.fillRect(gx, GROUND + 4, 5, 1);
        ctx.fillRect((gx + 9) % W, GROUND + 9, 3, 1);
      }
      for (const o of s.obstacles) drawObstacle(o, s.clock);
      for (const l of s.leaves) drawPixels(ctx, LEAF_PIXELS, l.x, l.y + Math.round(Math.sin(s.clock * 5) * 2), pal);
      for (const n of s.nugs) drawPixels(ctx, NUG, n.x, n.y + Math.round(Math.sin(s.clock * 6 + n.x * 0.2)), { G: NUG_GREEN, L: "#ffffff" });

      // Pinkmane (hidden once he explodes, blinks after the shield saves him)
      const alive = s.mode === "ready" || s.mode === "running";
      const blinking = s.invuln > 0 && Math.floor(s.clock * 12) % 2 === 0;
      if (alive && !blinking) {
        const frame = s.mode === "running" && s.onGround ? Math.floor(s.runTime * 10) % 2 : 0;
        drawDude(ctx, arc.shop.wearingName("skin"), PLAYER_X, Math.round(s.y), frame, c.bg === THEMES.dark.bg);
        // Little leaf floating above his head while the shield is on
        if (s.shield) drawPixels(ctx, LEAF_PIXELS, PLAYER_X + 5, s.y - 14 + Math.round(Math.sin(s.clock * 6)), pal);
      }
      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      // Scores (the speaker sits top left)
      if (s.mode === "running" || s.mode === "dying") {
        ctx.font = `8px ${fontFamily}`;
        ctx.textBaseline = "top";
        ctx.textAlign = "right";
        ctx.fillStyle = c.ink;
        ctx.fillText(`HI ${pad(s.best)}  ${pad(s.score)}`, W - 6, 6);
        if (s.shield) drawPixels(ctx, LEAF_PIXELS, 24, 3, pal);
        nugIcon(ctx, W - 22, 17);
        ctx.fillStyle = c.ink;
        ctx.fillText(String(s.run), W - 26, 17);
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "THE ORIGINAL",
          lines: [
            [isTouch() ? "TAP = JUMP" : "SPACE = JUMP", "#ffffff"],
            ["AGAIN IN THE AIR", KIT.lilac],
            ["= DOUBLE JUMP", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${pad(top.score)}` : s.best > 0 ? `BEST ${pad(s.best)}` : undefined,
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS  -/+ = FX VOLUME",
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
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} NUGS SAVED`,
        });
        if (s.t > 0.4) arc.drawPanels(ctx, s.clock);
      }
      arc.drawOverlays(ctx, s.clock);
    };

    // ---------- keys (capture: true = before the page, so the pause menu / shop / FX keys go there first) ----------
    const onKeyFirst = (e: KeyboardEvent) => {
      if (arc.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", onKeyFirst, true);

    // ---------- taps ----------
    const toGame = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    const onDown = (e: PointerEvent) => {
      const g = toGame(e.clientX, e.clientY);
      if (arc.tap(g.x, g.y)) {
        if (arc.dragging()) canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (arc.frozen()) return;
      press();
    };
    const onMove = (e: PointerEvent) => {
      if (arc.dragging()) arc.drag(toGame(e.clientX, e.clientY).y);
    };
    const onUp = () => {
      if (arc.dragging()) arc.drag(-1);
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    const onHidden = () => {
      if (document.hidden && s.mode === "running") arc.setPause(true);
    };
    document.addEventListener("visibilitychange", onHidden);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (!arc.frozen()) update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyFirst, true);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("visibilitychange", onHidden);
      if (s.mode === "running") bankRun();
      arc.closeSound();
      pressRef.current = null;
      arcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily]);

  // OK / Enter / Space / ↑ from the page (the pause menu or shop gets it first when open)
  useEffect(() => {
    if (jumpSignal === firstSignal.current) return;
    if (arcRef.current?.ok()) return;
    pressRef.current?.();
  }, [jumpSignal]);

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
          background: THEMES[theme].bg,
          touchAction: "manipulation",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="pinkrun" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
