"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, drawText, makeArcade, type Arcade, type ShopRow } from "./PinkShop";
import { isPhoneOrTablet } from "./device";

// PINK BIRD: flappy bird with a pink mohawk, flying between towers of speakers.
//   SPACE / OK / ↑ / tap = flap
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// The sky goes from DAY to SUNSET to NIGHT (stars!) to SUNRISE as you fly.
// GEMS float between the speakers: grab them, they're your money. A WEED LEAF = +5 points.
// ONLINE TOP 10: board id "bird" (see Scoreboard.tsx).

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  touch?: boolean;
};

type Mode = "ready" | "running" | "dying" | "over";
type Tower = { x: number; gapY: number; gap: number; passed: boolean };
type Thing = { x: number; y: number; taken: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number; size: number };

const GAME_TITLE = "PINK BIRD";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;
const GROUND = 140;
const BIRD_X = 70;
const BIRD_W = 16;
const BIRD_H = 12;

// ---------- EASY TUNING ----------
const GRAVITY = 520;
const FLAP = -165;
const START_SPEED = 68;
const MAX_SPEED = 115;
const TOWER_W = 22;
const TOWER_SPACING = 120;
const START_GAP = 58;
const MIN_GAP = 42;
const GEM_CHANCE = 0.55; // chance a gem floats in a gap
const DAY_LENGTH = 12; // towers per part of the day (day, sunset, night, sunrise)
const MAGNET_RANGE = [0, 18, 28, 40];

// Saved in the visitor's browser
const BEST_KEY = "pinkbird-best";
const FX_KEY = "pinkbird-sfx";
const SHOP_KEY = "pinkbird-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const GEM = "#3ee05a";
const FEATHERS = [PINK, DARK_PINK, "#ffc800", "#ffffff", INK];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 50 },
  { id: "ice", name: "ICE", price: 90 },
  { id: "fire", name: "FIRE", price: 140 },
  { id: "ghost", name: "GHOST", price: 200 },
  { id: "shadow", name: "SHADOW", price: 260 },
  { id: "gold", name: "SILVER", price: 350 },
  { id: "streak", name: "STREAK", price: 1 }, // only from the 7-day daily reward (shows LOCKED until then)
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "BIRDS" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} BIRD`, prices: [k.price], wear: true, info: [`A ${k.name} BIRD`, ""] })),
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:magnet", name: "GEM MAGNET", prices: [60, 150, 300], info: ["PULLS NEARBY GEMS TO YOU", "A BIGGER PULL EVERY LEVEL"] },
  { kind: "item", id: "up:gap", name: "WIDER GAPS", prices: [80, 200], info: ["MORE ROOM BETWEEN THE SPEAKERS", "A BIT MORE EVERY LEVEL"] },
  { kind: "item", id: "up:shield", name: "SECOND CHANCE", prices: [250], info: ["SURVIVE ONE CRASH EVERY RUN", "YOU BLINK AND FLY ON"] },
  { kind: "back" },
];

// The bird: two frames (wing up, wing down). P = main colour, D = dark (the skin), K black, W white, Y beak
const BIRD_FRAMES = [
  [
    "...P..P..P......",
    "...PP.PP.PP.....",
    "....PPPPPPP.....",
    "...KKKKKKKKK....",
    "..KDDPPPPWWWK...",
    ".KDDDDPPWWKWK...",
    ".KPDDPPPPWWWKYY.",
    "KPPPPPPPPPPPKYYY",
    "KPPPPPPPPPPKYYY.",
    ".KPPPPPPPPPPKK..",
    "..KKPPPPPPPKK...",
    "....KKKKKKK.....",
  ],
  [
    "...P..P..P......",
    "...PP.PP.PP.....",
    "....PPPPPPP.....",
    "...KKKKKKKKK....",
    "..KPPPPPPWWWK...",
    ".KPPPPPPWWKWK...",
    ".KPPPPPPPWWWKYY.",
    "KPPPPPPPPPPPKYYY",
    "KDDDDDPPPPPKYYY.",
    ".KDDDDPPPPPPKK..",
    "..KDDPPPPPPKK...",
    "....KKKKKKK.....",
  ],
];
const LEAF_PIXELS = ["...G...", "..GGG..", "G.GGG.G", "GGGGGGG", ".GGGGG.", "...D...", "...D..."];

// the sky through the day: [how dark (0..1), tint colour]
const SKY = [
  { dark: 0, tint: "rgba(0,0,0,0)" }, // day
  { dark: 0.28, tint: "rgba(255,120,40,1)" }, // sunset
  { dark: 0.62, tint: "rgba(14,10,48,1)" }, // night
  { dark: 0.22, tint: "rgba(255,150,190,1)" }, // sunrise
];
const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % (GROUND - 20), tw: i * 0.7 }));

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");

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
const birdColors = (skin: string): Record<string, string> => {
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.pink;
  return { P: c[1], D: c[0], K: INK, W: "#ffffff", Y: "#ffc800" };
};
// a gem (also the money icon)
const drawGem = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y, 5, 1);
  ctx.fillRect(x, y + 1, 7, 3);
  ctx.fillRect(x + 1, y + 4, 5, 1);
  ctx.fillRect(x + 2, y + 5, 3, 1);
  ctx.fillRect(x + 3, y + 6, 1, 1);
  ctx.fillStyle = GEM;
  ctx.fillRect(x + 1, y + 1, 5, 3);
  ctx.fillRect(x + 2, y + 4, 3, 1);
  ctx.fillStyle = "#c8ffd0";
  ctx.fillRect(x + 2, y + 1, 2, 1);
};

export default function BirdGame({ actionSignal, fontFamily, muted, touch = false }: Props) {
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
    const coarse = isPhoneOrTablet(); // a real phone or tablet (a computer with a touch screen still says CLICK)
    const isTouch = () => touchRef.current || coarse;

    const s = {
      mode: "ready" as Mode,
      y: 70,
      vy: 0,
      flapTime: 0,
      towers: [] as Tower[],
      leaves: [] as Thing[],
      gems: [] as Thing[],
      particles: [] as Particle[],
      speed: START_SPEED,
      score: 0,
      best: 0,
      passed: 0,
      groundOffset: 0,
      t: 0,
      clock: 0,
      runTime: 0,
      shake: 0,
      flash: 0,
      saves: 0, // SECOND CHANCE left this run
      invuln: 0,
      run: 0, // gems this run
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
      moneyName: "GEMS",
      icon: drawGem,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, arc.shop.wearing("skin"), cx, cy, t),
      ink: INK,
      muted: () => mutedRef.current,
      touch: isTouch,
      playing: () => s.mode === "running",
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      busy: () => boardRef.current?.busy() ?? false,
      restart: () => {
        newGame();
        s.mode = "ready";
      },
      leaving: () => {
        if (s.mode === "running") bankRun();
      },
      stats: () => `SCORE ${s.score}  +${s.run} GEMS`,
      pauseBtn: { x: W - 19, y: 18 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    // ---------- sounds ----------
    const playFlap = () => beep(420, 560, 0.04, 0.03, "sine"); // soft and quiet, since it plays on every flap
    const playPoint = () => {
      beep(880, 880, 0.05, 0.045);
      beep(1320, 1320, 0.07, 0.045, "square", 0.05);
    };
    const playLeaf = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.06));
    const playGem = () => beep(1200, 1800, 0.05, 0.04);
    const playHit = () => beep(200, 60, 0.18, 0.18, "square");
    const playSave = () => [880, 660, 990].forEach((f, i) => beep(f, f, 0.08, 0.07, "square", i * 0.06));
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const currentGap = () => Math.max(MIN_GAP, START_GAP - s.passed * 0.6) + arc.shop.lvl("gap") * 4;
    const addTower = (x: number) => {
      const gap = currentGap();
      const gapY = rand(22 + gap / 2, GROUND - 16 - gap / 2);
      s.towers.push({ x, gapY, gap, passed: false });
      // Sometimes a weed leaf floats in the gap (+5 points), otherwise often a gem
      if (s.passed >= 2 && Math.random() < 0.18) s.leaves.push({ x: x + TOWER_W / 2 - 3, y: gapY - 3, taken: false });
      else if (Math.random() < GEM_CHANCE) s.gems.push({ x: x + TOWER_W / 2 - 3, y: gapY - 3 + rand(-gap / 4, gap / 4), taken: false });
    };

    const newGame = () => {
      boardRef.current?.hide();
      s.y = 70;
      s.vy = 0;
      s.towers = [];
      s.leaves = [];
      s.gems = [];
      s.particles = [];
      s.speed = START_SPEED;
      s.score = 0;
      s.passed = 0;
      s.runTime = 0;
      s.shake = 0;
      s.saves = arc.shop.lvl("shield");
      s.invuln = 0;
      s.run = 0;
      s.newBest = false;
      s.t = 0;
      addTower(W + 40);
    };

    const flap = () => {
      s.vy = FLAP;
      s.flapTime = 0.15;
      // Little puff of feathers under the bird
      for (let i = 0; i < 3; i++) {
        s.particles.push({ x: BIRD_X + 4, y: s.y + BIRD_H, vx: rand(-30, -10), vy: rand(10, 30), color: Math.random() < 0.5 ? PINK : "#ffffff", life: rand(0.2, 0.4), size: 1 });
      }
      playFlap();
    };
    const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
      for (let i = 0; i < count; i++) {
        s.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power * 1.4, power * 0.4), color: colors[Math.floor(Math.random() * colors.length)], life: rand(0.5, 1.2), size: 2 });
      }
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        s.mode = "running";
        flap();
      } else if (s.mode === "running") flap();
      else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return;
        newGame();
        s.mode = "running";
        flap();
      }
    };
    pressRef.current = press;

    const die = () => {
      s.mode = "dying";
      s.t = 0;
      s.shake = 0.35;
      s.flash = 0.08;
      burst(BIRD_X + BIRD_W / 2, s.y + BIRD_H / 2, 40, FEATHERS, 90);
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playHit();
      playDeath();
    };
    // a crash: SECOND CHANCE saves you once, otherwise it's over
    const crash = () => {
      if (s.invuln > 0) return false;
      if (s.saves > 0) {
        s.saves -= 1;
        s.invuln = 1.5;
        s.vy = FLAP;
        burst(BIRD_X + BIRD_W / 2, s.y + BIRD_H / 2, 16, ["#ffffff", PINK], 60);
        playSave();
        return false;
      }
      die();
      return true;
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      const got = s.run;
      bankRun();
      s.run = got;
      boardRef.current?.gameOver(Math.floor(s.score), s.runTime);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.flash > 0) s.flash -= dt;
      if (s.flapTime > 0) s.flapTime -= dt;
      if (s.invuln > 0) s.invuln -= dt;
      for (const p of s.particles) {
        p.vy += 300 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      if (s.mode === "dying") {
        if (s.t > 1.5) gameOver();
        return;
      }
      // Bobbing on the start screen
      if (s.mode === "ready" || s.mode === "over") {
        if (s.mode === "ready") s.y = 70 + Math.sin(s.clock * 3) * 4;
        s.groundOffset += START_SPEED * dt * 0.5;
        return;
      }
      s.runTime += dt;

      // Falling and flapping
      s.vy = Math.min(260, s.vy + GRAVITY * dt);
      s.y += s.vy * dt;
      if (s.y < -4) {
        s.y = -4;
        s.vy = 0;
      }

      // Move the world
      const move = s.speed * dt;
      s.groundOffset += move;
      for (const t of s.towers) t.x -= move;
      for (const l of s.leaves) l.x -= move;
      for (const g of s.gems) g.x -= move;
      s.towers = s.towers.filter((t) => t.x + TOWER_W > -4);
      s.leaves = s.leaves.filter((l) => l.x > -10 && !l.taken);
      s.gems = s.gems.filter((g) => g.x > -10 && !g.taken);
      const lastTower = s.towers[s.towers.length - 1];
      if (!lastTower || lastTower.x < W - TOWER_SPACING) addTower(W + 4);

      // Hitbox a bit smaller than the drawing (mohawk and beak tip don't count)
      const bx1 = BIRD_X + 2;
      const bx2 = BIRD_X + BIRD_W - 2;
      const by1 = s.y + 4;
      const by2 = s.y + BIRD_H - 1;

      // Ground
      if (by2 >= GROUND) {
        s.y = GROUND - BIRD_H;
        if (crash()) return;
      }
      for (const t of s.towers) {
        // Score when the bird passes a tower
        if (!t.passed && t.x + TOWER_W < bx1) {
          t.passed = true;
          s.passed += 1;
          s.score += 1;
          s.speed = Math.min(MAX_SPEED, START_SPEED + s.passed * 1.5);
          playPoint();
        }
        const top = t.gapY - t.gap / 2;
        const bottom = t.gapY + t.gap / 2;
        if (bx2 > t.x && bx1 < t.x + TOWER_W && (by1 < top || by2 > bottom)) {
          if (crash()) return;
        }
      }
      // Weed leaves: +5
      for (const l of s.leaves) {
        if (!l.taken && bx2 > l.x && bx1 < l.x + 7 && by2 > l.y && by1 < l.y + 7) {
          l.taken = true;
          s.score += 5;
          burst(l.x + 3, l.y + 3, 12, [GREEN, DARK_GREEN, "#ffffff"], 45);
          playLeaf();
        }
      }
      // Gems (the GEM MAGNET pulls them in)
      const pull = MAGNET_RANGE[arc.shop.lvl("magnet")] ?? 0;
      const bcx = BIRD_X + BIRD_W / 2;
      const bcy = s.y + BIRD_H / 2;
      for (const g of s.gems) {
        if (g.taken) continue;
        const dx = bcx - (g.x + 3);
        const dy = bcy - (g.y + 3);
        const d = Math.hypot(dx, dy);
        if (pull > 0 && d < pull) {
          g.x += (dx / d) * 160 * dt;
          g.y += (dy / d) * 160 * dt;
        }
        if (bx2 > g.x && bx1 < g.x + 7 && by2 > g.y && by1 < g.y + 7) {
          g.taken = true;
          s.run += 1;
          burst(g.x + 3, g.y + 3, 8, [GEM, "#ffffff"], 40);
          playGem();
        }
      }
    };

    // ---------- drawing ----------
    // A tower of stacked speakers
    const drawTower = (x: number, y1: number, y2: number, capAtBottom: boolean) => {
      const rx = Math.round(x);
      const h = Math.round(y2 - y1);
      if (h <= 0) return;
      ctx.fillStyle = INK;
      ctx.fillRect(rx, Math.round(y1), TOWER_W, h);
      for (let yy = Math.round(y1) + 3; yy + 12 < y2; yy += 16) {
        ctx.fillStyle = PINK;
        ctx.fillRect(rx + 7, yy + 2, 8, 8);
        ctx.fillStyle = INK;
        ctx.fillRect(rx + 9, yy + 4, 4, 4);
        ctx.fillStyle = PINK;
        ctx.fillRect(rx + 10, yy + 5, 2, 2);
      }
      // Lip at the open end
      ctx.fillStyle = DARK_PINK;
      const lipY = capAtBottom ? Math.round(y2) - 5 : Math.round(y1);
      ctx.fillRect(rx - 2, lipY, TOWER_W + 4, 5);
      ctx.fillStyle = INK;
      ctx.fillRect(rx - 2, capAtBottom ? lipY + 4 : lipY, TOWER_W + 4, 1);
    };
    // how far through the day we are: the sky part now, the next one, and how far between them (0..1)
    const skyNow = () => {
      const f = s.mode === "ready" ? 0 : s.passed / DAY_LENGTH;
      const i = Math.floor(f) % SKY.length;
      const k = Math.min(1, Math.max(0, (f % 1) * 4 - 3)); // the last quarter of each part fades into the next
      return { a: SKY[i], b: SKY[(i + 1) % SKY.length], k };
    };
    const drawSkyTint = () => {
      const { a, b, k } = skyNow();
      const layer = (p: (typeof SKY)[number], amount: number) => {
        if (p.dark <= 0 || amount <= 0) return;
        ctx.globalAlpha = p.dark * amount;
        ctx.fillStyle = p.tint;
        ctx.fillRect(0, 0, W, H);
      };
      layer(a, 1 - k);
      layer(b, k);
      ctx.globalAlpha = 1;
      // stars at night
      const night = (a === SKY[2] ? 1 - k : 0) + (b === SKY[2] ? k : 0);
      if (night > 0) {
        for (const st of STARS) {
          ctx.globalAlpha = night * (0.5 + Math.sin(s.clock * 3 + st.tw) * 0.5);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(st.x, st.y, 1, 1);
        }
        ctx.globalAlpha = 1;
      }
      return night;
    };
    const drawBird = (c: CanvasRenderingContext2D, x: number, y: number, frame: number, skin: string) => {
      c.globalAlpha = skin === "ghost" ? 0.7 : 1;
      drawPixels(c, BIRD_FRAMES[frame], x, y, birdColors(skin));
      c.globalAlpha = 1;
    };
    // the shop's preview + the SHOP panel
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = SCREEN;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      const by = cy - 6 + Math.round(Math.sin(t * 3) * 3);
      if (id === "up:magnet") {
        drawBird(c, cx - 20, by, Math.floor(t * 6) % 2, skin);
        for (let i = 0; i < 3; i++) drawGem(c, cx + 2 + ((t * 30 + i * 9) % 26), cy - 3);
        return;
      }
      if (id === "up:gap") {
        const gap = 26 + Math.sin(t * 2) * 6;
        c.fillStyle = INK;
        c.fillRect(cx - 6, cy - 40, 12, 40 - gap / 2);
        c.fillRect(cx - 6, cy + gap / 2, 12, 40 - gap / 2);
        return;
      }
      if (id === "up:shield") {
        c.strokeStyle = PINK;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx, by + 6, 14 + Math.sin(t * 5) * 2, 0, Math.PI * 2);
        c.stroke();
      }
      drawBird(c, cx - 8, by, Math.floor(t * 6) % 2, skin);
    };

    const draw = () => {
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = SCREEN;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      for (const t of s.towers) {
        drawTower(t.x, -4, t.gapY - t.gap / 2, true);
        drawTower(t.x, t.gapY + t.gap / 2, GROUND, false);
      }
      for (const l of s.leaves) drawPixels(ctx, LEAF_PIXELS, l.x, l.y + Math.round(Math.sin(s.clock * 5)), { G: GREEN, D: DARK_GREEN });
      for (const g of s.gems) drawGem(ctx, g.x, g.y + Math.round(Math.sin(s.clock * 6 + g.x) * 1.5));
      // Ground
      ctx.fillStyle = INK;
      ctx.fillRect(-4, GROUND, W + 8, 1);
      for (let i = 0; i < W / 16 + 1; i++) {
        const gx = Math.round((((i * 16 - s.groundOffset) % W) + W) % W);
        ctx.fillRect(gx, GROUND + 4, 5, 1);
        ctx.fillRect((gx + 9) % W, GROUND + 7, 3, 1);
      }
      // the sky changes through the day (drawn over the world, the bird stays bright)
      const night = drawSkyTint();
      // Bird (flaps its wing after each press, and while floating on the start screen; blinks after a save)
      const blink = s.invuln > 0 && Math.floor(s.clock * 12) % 2 === 0;
      if ((s.mode === "ready" || s.mode === "running") && !blink) {
        const frame = s.flapTime > 0 || (s.mode === "ready" && Math.floor(s.clock * 6) % 2 === 0) ? 1 : 0;
        drawBird(ctx, BIRD_X, s.y, frame, arc.shop.wearingName("skin"));
      }
      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      if (s.flash > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.fillRect(-4, -4, W + 8, H + 8);
      }
      ctx.restore();

      // HUD: the score big in the middle while playing, like the original
      const light = night > 0.4;
      if (s.mode === "running" || s.mode === "dying") {
        drawText(ctx, fontFamily, String(s.score), W / 2, 12, "#ffffff", 16);
        drawText(ctx, fontFamily, `${s.run}`, W - 30, 5, GEM, 8, "right");
        drawGem(ctx, W - 27, 5);
        if (s.saves > 0) {
          ctx.fillStyle = PINK;
          ctx.fillRect(24, 6, 4, 4);
        }
      }
      if (s.mode === "running" || s.mode === "dying") {
        ctx.font = `8px ${fontFamily}`;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = light ? "#ffffff" : INK;
        ctx.fillText(`HI ${s.best}`, 34, 5);
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "FLY THROUGH THE SPEAKERS",
          lines: [
            [isTouch() ? "TAP = FLAP" : "SPACE / ↑ = FLAP", "#ffffff"],
            ["GRAB THE GEMS", KIT.lilac],
            ["FLY INTO THE NIGHT", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${top.score}` : s.best > 0 ? `BEST ${s.best}` : undefined,
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS   - / + = FX VOLUME",
          dim: 0.55,
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
          score: `SCORE ${s.score}`,
          best: `BEST ${s.best}`,
          newBest: s.newBest,
          stats: `${s.passed} SPEAKERS`,
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} GEMS SAVED`,
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

    newGame();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
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
          touchAction: "manipulation",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="bird" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} minScore={1} />
    </>
  );
}
