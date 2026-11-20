"use client";

import { useEffect, useRef } from "react";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, drawText, makeArcade, type Arcade, type ShopRow } from "./PinkShop";

// KONG BONG: Donkey Kong, PINKMANE style. BEARMANPIG sits at the top, throws speakers down the pink girders,
// and after EVERY throw he hits his bong. Climb the ladders, jump over the speakers, reach THE STASH at the very top.
//   ← → (A D) = walk      ↑ ↓ (W S) = climb a ladder      SPACE / OK / tap = jump (and start)
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// Points: jump over a speaker = 100, a nug = 300, THE STASH = the BONUS (it counts down, so be quick).
// MONEY: NUGS. 1 for every speaker you jump, 3 for every nug, 10 for every stash.
// (DEMO: no online Top 10 yet, just your own best on this device.)

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  touch?: boolean;
};

type Mode = "ready" | "running" | "dying" | "clear" | "over";
type Speaker = { x: number; y: number; L: number; fall: boolean; vy: number; spin: number; lastLad: number; scored: boolean; gone: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grow?: number };
type Popup = { x: number; y: number; text: string; life: number; color: string };

const GAME_TITLE = "KONG BONG";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;

// THE GIRDERS (0 = the bottom). y at the left end (yA) and the right end (yB): the speakers roll downhill.
// Number 5 is the little platform at the top with THE STASH.
const GIRDERS = [
  { x1: 8, x2: 312, yA: 145, yB: 141 },
  { x1: 30, x2: 312, yA: 120, yB: 115 },
  { x1: 8, x2: 290, yA: 90, yB: 95 },
  { x1: 30, x2: 312, yA: 70, yB: 65 },
  { x1: 8, x2: 290, yA: 40, yB: 45 },
  { x1: 128, x2: 192, yA: 18, yB: 18 },
];
// THE LADDERS: x, and the girder they start on (they go up to the next one)
const LADDERS = [
  { x: 250, from: 0 },
  { x: 90, from: 0 },
  { x: 60, from: 1 },
  { x: 200, from: 1 },
  { x: 240, from: 2 },
  { x: 120, from: 2 },
  { x: 80, from: 3 },
  { x: 270, from: 3 },
  { x: 176, from: 4 },
];
// nugs to grab on the way up (every level)
const NUGS = [
  { L: 1, x: 150 },
  { L: 2, x: 60 },
  { L: 3, x: 230 },
];
const STASH_X = 160;
const KONG_X = 4; // BEARMANPIG's left edge (he stands on girder 4, drawn 2x big)
const KS = 2; // how big BEARMANPIG is drawn
const kongY = () => surf(4, KONG_X + 16) - 17 * KS; // his top edge
const SPAWN_X = 56; // where his speakers start rolling

// ---------- EASY TUNING ----------
const START_LIVES = 3;
const WALK = 46; // walking speed (pixels a second)
const CLIMB = 32; // climbing speed
const JUMP = 112; // how hard you jump (higher = higher)
const GRAVITY = 430;
const SPEAKER_SPEED = 50; // how fast the speakers roll on level 1...
const SPEAKER_SPEED_UP = 6; // ...and this much faster every level
const SPEAKER_SPEED_MAX = 92;
const BONG_TIME = 1.3; // how long BEARMANPIG hits the bong after a throw
const BONUS_START = 3000; // the bonus for reaching the stash (it counts down)

// Saved in the visitor's browser
const BEST_KEY = "pinkkong-best";
const FX_KEY = "pinkkong-fx";
const SHOP_KEY = "pinkkong-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const BG = "#1c0f2a";
const INK = "#0d0d12";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const LADDER = "#7fd0ff";
const GOLD = "#ffd700";
const SMOKE = ["#9a9aa8", "#b8b8c4", "#d4d4dc", "#7a7a88"];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 60 },
  { id: "ice", name: "ICE", price: 100 },
  { id: "fire", name: "FIRE", price: 150 },
  { id: "ghost", name: "GHOST", price: 200 },
  { id: "gold", name: "GOLD", price: 350 },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:life", name: "EXTRA LIFE", prices: [150, 400], info: ["START WITH ONE MORE LIFE", ""] },
  { kind: "item", id: "up:speed", name: "FAST SHOES", prices: [100, 250], info: ["WALK + CLIMB FASTER", ""] },
  { kind: "item", id: "up:slow", name: "HEAVY SPEAKERS", prices: [120, 300], info: ["THE SPEAKERS ROLL SLOWER", ""] },
  { kind: "head", label: "MOHAWKS" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} MOHAWK`, prices: [k.price], wear: true, info: [`PINKMANE WITH A ${k.name} MOHAWK`, ""] })),
  { kind: "back" },
];

// ---------- pictures (P = mohawk, D = mohawk dark, Y = face, W = white, K = black, B = clothes) ----------
const DUDE = [
  ["..P.P.P..", "..DPPP...", "..YYYYY..", "..YWKYK..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "..BB.BB..", "..BB.BB..", ".BB...BB."],
  ["..P.P.P..", "..DPPP...", "..YYYYY..", "..YWKYK..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "...BBB...", "..BB.BB..", "..B...B.."],
];
// climbing: from the back, arms up
const DUDE_CLIMB = [
  ["Y.P.P.P.Y", "Y.DPPP..Y", "Y.PPPPP.Y", ".BYYYYYB.", "..YYYYY..", "...YYY...", "..BBBBB..", "..BBBBB..", "..BBBBB..", "..BB.BB..", "..BB..B..", "..B...B.."],
  ["Y.P.P.P..", "Y.DPPP...", "Y.PPPPP.Y", ".BYYYYYB.", "..YYYYY.Y", "...YYY...", "..BBBBB..", "..BBBBB..", "..BBBBB..", "..BB.BB..", "..B..BB..", "..B...B.."],
];
// BEARMANPIG (16 x 17): R = brown fur, P = pink skin, D = dark pink snout, K = black, W = white
const PIG = [
  "RR............RR",
  "RRRRRRRRRRRRRRRR",
  "RPPPPPPPPPPPPPPR",
  "PPKWPPPPPPPPWKPP",
  "PPKKPPPPPPPPKKPP",
  "PPPPPDDDDDDPPPPP",
  "PPPPDKDDDDKDPPPP",
  "PPPPPDDDDDDPPPPP",
  ".PPPPPPPPPPPPPP.",
  "..PPPPPPPPPPPP..",
  ".RRRRRRRRRRRRRR.",
  "RRRRRRRRRRRRRRRR",
  "RRPPRRRRRRRRPPRR",
  "RRPPRRRRRRRRPPRR",
  "RRRRRRRRRRRRRRRR",
  ".RRRR......RRRR.",
  ".RRR........RRR.",
];
const PIG_COLORS: Record<string, string> = { R: "#6b3a1e", P: "#ff8ad8", D: DARK_PINK, K: INK, W: "#ffffff" };
const NUG = [".GG.", "GGGG", "GLGG", ".GG."];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
const surf = (L: number, x: number) => {
  const g = GIRDERS[L];
  return g.yA + ((g.yB - g.yA) * (x - g.x1)) / (g.x2 - g.x1);
};
const downhill = (L: number) => (GIRDERS[L].yB > GIRDERS[L].yA ? 1 : -1);

function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, colors: Record<string, string>, flip = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = colors[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x) + (flip ? row.length - 1 - c : c), Math.round(y) + r, 1, 1);
    }
  }
}
const dudeColors = (skin: string): Record<string, string> => {
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.pink;
  return { P: c[1], D: c[0], Y: "#ffc800", W: "#ffffff", K: INK, B: "#4a4a60" };
};
// the money icon: a nug
const nugIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 1, y, 6, 8);
  ctx.fillRect(x, y + 1, 8, 6);
  drawPixels(ctx, NUG, x + 2, y + 2, { G: "#6fdc5a", L: "#ffffff" });
};
// one speaker box (x = middle, y = bottom), the cone turns as it rolls
function drawSpeaker(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number) {
  const X = Math.round(x) - 4;
  const Y = Math.round(y) - 8;
  ctx.fillStyle = INK;
  ctx.fillRect(X, Y, 8, 8);
  ctx.fillStyle = "#2c2c38";
  ctx.fillRect(X + 1, Y + 1, 6, 6);
  ctx.fillStyle = PINK;
  ctx.fillRect(X + 2, Y + 2, 4, 4);
  ctx.fillStyle = INK;
  ctx.fillRect(X + 3, Y + 3, 2, 2);
  // a little shine that goes round
  const a = spin;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(Math.round(X + 3.5 + Math.cos(a) * 2), Math.round(Y + 3.5 + Math.sin(a) * 2), 1, 1);
}

export default function KongGame({ actionSignal, fontFamily, muted, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
    const held = { left: false, right: false, up: false, down: false };

    const s = {
      mode: "ready" as Mode,
      t: 0, // seconds in this mode
      clock: 0,
      runT: 0,
      level: 1,
      lives: START_LIVES,
      score: 0,
      best: 0,
      bonus: BONUS_START,
      bonusT: 0,
      run: 0, // nugs (money) this game
      newBest: false,
      p: { x: 24, y: surf(0, 24), L: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walkT: 0 },
      speakers: [] as Speaker[],
      nugs: NUGS.map(() => false), // taken?
      parts: [] as Particle[],
      pops: [] as Popup[],
      // BEARMANPIG: idle -> grab (a speaker over his head) -> throw -> bong -> idle ...
      kong: { phase: "idle" as "idle" | "grab" | "throw" | "bong", t: 1.2, exhaled: false },
      shake: 0,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- pause, shop, FX (the same in every game, see PinkShop.ts) ----------
    const playing = () => s.mode === "running" || s.mode === "dying" || s.mode === "clear";
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
      ink: "#ffffff",
      muted: () => mutedRef.current,
      touch: isTouch,
      playing,
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      restart: () => {
        newGame();
        s.mode = "running";
      },
      leaving: () => {
        if (playing()) bankRun();
      },
      stats: () => `LV ${s.level}  SCORE ${pad(s.score)}  +${s.run}`,
      pauseBtn: { x: W - 19, y: 18 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    // ---------- sounds ----------
    const sfx = {
      jump: () => beep(300, 600, 0.08, 0.05),
      over: () => [880, 1320].forEach((f, i) => beep(f, f, 0.05, 0.04, "square", i * 0.05)),
      nug: () => [1047, 1319, 1568].forEach((f, i) => beep(f, f, 0.05, 0.04, "square", i * 0.04)),
      throw: () => beep(500, 150, 0.2, 0.06, "sawtooth"),
      land: () => beep(160, 90, 0.06, 0.05, "square"),
      // the bong: a low glassy BONG, then bubbles
      bong: () => {
        beep(196, 190, 0.5, 0.08, "sine");
        beep(392, 380, 0.3, 0.03, "sine");
        for (let i = 0; i < 9; i++) beep(rand(90, 180), rand(200, 320), 0.05, 0.05, "sine", 0.25 + i * 0.07);
      },
      exhale: () => beep(260, 120, 0.5, 0.02, "triangle"),
      hit: () => beep(400, 60, 0.4, 0.1, "square"),
      clear: () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f, 0.09, 0.05, "square", i * 0.08)),
      death: () => {
        const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
        if (g <= 0) return;
        deathSound.volume = g;
        deathSound.currentTime = 0;
        deathSound.play().catch(() => {});
      },
    };

    // ---------- the game ----------
    const speakerSpeed = () => Math.min(SPEAKER_SPEED_MAX, SPEAKER_SPEED + (s.level - 1) * SPEAKER_SPEED_UP) * (1 - arc.shop.lvl("slow") * 0.1);
    const idleGap = () => Math.max(0.25, 1.5 - (s.level - 1) * 0.2) + rand(0, 0.9);
    const dropChance = () => Math.min(0.5, 0.15 + (s.level - 1) * 0.05);
    const walkSpeed = () => WALK * (1 + arc.shop.lvl("speed") * 0.12);

    const placePlayer = () => {
      s.p = { x: 24, y: surf(0, 24), L: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walkT: 0 };
      s.speakers = [];
      s.kong = { phase: "idle", t: 1.2, exhaled: false };
      s.bonus = BONUS_START;
      s.bonusT = 0;
    };
    const startLevel = () => {
      placePlayer();
      s.nugs = NUGS.map(() => false);
    };
    const newGame = () => {
      s.level = 1;
      s.lives = START_LIVES + arc.shop.lvl("life");
      s.score = 0;
      s.run = 0;
      s.runT = 0;
      s.newBest = false;
      s.t = 0;
      s.parts = [];
      s.pops = [];
      startLevel();
    };

    const burst = (x: number, y: number, n: number, colors: string[], power = 60) => {
      for (let i = 0; i < n; i++) {
        const life = rand(0.3, 0.8);
        s.parts.push({ x, y, vx: rand(-power, power), vy: rand(-power * 1.2, power * 0.3), life, max: life, color: colors[Math.floor(Math.random() * colors.length)], size: 2 });
      }
    };
    const pop = (x: number, y: number, text: string, color: string) => s.pops.push({ x, y, text, life: 1, color });

    const jump = () => {
      const p = s.p;
      if (p.air || p.climb >= 0) return;
      p.air = true;
      p.vy = -JUMP;
      sfx.jump();
    };

    // OK / SPACE / tap
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        s.mode = "running";
      } else if (s.mode === "running") jump();
      else if (s.mode === "over" && s.t > 0.8) {
        newGame();
        s.mode = "running";
      }
    };
    pressRef.current = press;

    const hitPlayer = () => {
      s.mode = "dying";
      s.t = 0;
      s.shake = 0.4;
      burst(s.p.x, s.p.y - 6, 30, [PINK, "#ffc800", "#ffffff", "#4a4a60"], 90);
      sfx.hit();
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      if (s.score > s.best) {
        s.best = Math.floor(s.score);
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      const got = s.run;
      bankRun();
      s.run = got; // (shown as "+N NUGS SAVED")
      sfx.death();
    };

    // BEARMANPIG's routine: grab a speaker, throw it, hit the bong, wait, again
    const updateKong = (dt: number) => {
      const k = s.kong;
      k.t -= dt;
      const kx = KONG_X;
      const ky = kongY();
      if (k.phase === "bong") {
        // bubbles while he hits it, then he blows the smoke out
        if (k.t > BONG_TIME * 0.45 && Math.random() < 0.5) {
          s.parts.push({ x: kx + 19 * KS + rand(-1, 1), y: ky + 11 * KS, vx: rand(-3, 3), vy: rand(-18, -10), life: 0.4, max: 0.4, color: "#c8f0ff", size: 1 });
        }
        if (!k.exhaled && k.t < BONG_TIME * 0.4) {
          k.exhaled = true;
          sfx.exhale();
          for (let i = 0; i < 14; i++) {
            const life = rand(1.6, 2.6);
            s.parts.push({ x: kx + 9 * KS, y: ky + 7 * KS, vx: rand(8, 34), vy: rand(-14, -2), life, max: life, color: SMOKE[Math.floor(Math.random() * SMOKE.length)], size: 2, grow: rand(2, 4) });
          }
        }
      }
      if (k.t > 0) return;
      if (k.phase === "idle") {
        k.phase = "grab";
        k.t = 0.5;
      } else if (k.phase === "grab") {
        k.phase = "throw";
        k.t = 0.25;
        if (s.mode === "running") {
          s.speakers.push({ x: SPAWN_X, y: surf(4, SPAWN_X), L: 4, fall: false, vy: 0, spin: 0, lastLad: -1, scored: false, gone: false });
          sfx.throw();
        }
      } else if (k.phase === "throw") {
        k.phase = "bong";
        k.t = BONG_TIME;
        k.exhaled = false;
        sfx.bong();
      } else {
        k.phase = "idle";
        k.t = idleGap();
      }
    };

    const updatePlayer = (dt: number) => {
      const p = s.p;
      const climbSpeed = CLIMB * (1 + arc.shop.lvl("speed") * 0.12);
      if (p.climb >= 0) {
        const lad = LADDERS[p.climb];
        const top = surf(lad.from + 1, lad.x);
        const bot = surf(lad.from, lad.x);
        if (held.up) p.y -= climbSpeed * dt;
        if (held.down) p.y += climbSpeed * dt;
        if (held.up || held.down) p.walkT += dt;
        if (p.y <= top) {
          p.y = top;
          p.L = lad.from + 1;
          p.climb = -1;
        } else if (p.y >= bot) {
          p.y = bot;
          p.L = lad.from;
          p.climb = -1;
        }
        return;
      }
      let dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      if (!p.air) {
        // onto a ladder: up (from its bottom) or down (from its top)
        if (held.up) {
          const i = LADDERS.findIndex((l) => l.from === p.L && Math.abs(l.x - p.x) < 4);
          if (i >= 0) {
            p.climb = i;
            p.x = LADDERS[i].x;
            p.y -= 0.5;
            return;
          }
        } else if (held.down) {
          const i = LADDERS.findIndex((l) => l.from === p.L - 1 && Math.abs(l.x - p.x) < 4);
          if (i >= 0) {
            p.climb = i;
            p.x = LADDERS[i].x;
            p.y += 0.5;
            return;
          }
        }
      }
      if (dir) p.face = dir;
      if (!p.air) {
        p.vx = dir * walkSpeed();
        if (dir) p.walkT += dt;
      } else if (dir === 0) dir = Math.sign(p.vx);
      p.x += p.vx * dt;
      const g = GIRDERS[p.L];
      p.x = Math.max(g.x1 + 3, Math.min(g.x2 - 3, p.x));
      if (p.air) {
        p.vy += GRAVITY * dt;
        p.y += p.vy * dt;
        const sy = surf(p.L, p.x);
        if (p.vy > 0 && p.y >= sy) {
          p.y = sy;
          p.air = false;
          p.vy = 0;
        }
      } else p.y = surf(p.L, p.x);
    };

    const updateSpeakers = (dt: number) => {
      const sp0 = speakerSpeed();
      const p = s.p;
      for (const sp of s.speakers) {
        if (!sp.fall) {
          const g = GIRDERS[sp.L];
          const dir = downhill(sp.L);
          sp.x += dir * sp0 * dt;
          sp.spin += dir * dt * 9;
          // sometimes it goes down a ladder instead of rolling on
          for (const l of LADDERS) {
            if (l.from !== sp.L - 1 || Math.abs(sp.x - l.x) > 1.5 || sp.lastLad === l.x) continue;
            sp.lastLad = l.x;
            if (Math.random() < dropChance()) {
              sp.fall = true;
              sp.x = l.x;
              sp.vy = 15;
            }
          }
          if (!sp.fall) {
            if (sp.x > g.x2 || sp.x < g.x1) {
              if (sp.L === 0) sp.gone = true;
              else {
                sp.fall = true;
                sp.vy = 0;
              }
            } else sp.y = surf(sp.L, sp.x);
          }
        } else {
          sp.vy += 260 * dt;
          sp.y += sp.vy * dt;
          sp.spin += dt * 6;
          const L2 = sp.L - 1;
          if (L2 >= 0) {
            const g2 = GIRDERS[L2];
            if (sp.x >= g2.x1 && sp.x <= g2.x2 && sp.y >= surf(L2, sp.x)) {
              sp.L = L2;
              sp.y = surf(L2, sp.x);
              sp.fall = false;
              sp.lastLad = sp.x; // (so it doesn't go straight down the same ladder again)
              burst(sp.x, sp.y, 4, [PINK, "#ffffff"], 25);
            }
          }
          if (sp.y > H + 10) sp.gone = true;
        }
        // hit you?
        if (s.mode !== "running") continue;
        if (Math.abs(sp.x - p.x) < 7 && sp.y - 7 < p.y && sp.y > p.y - 11) {
          hitPlayer();
          return;
        }
        // jumped over it
        if (!sp.scored && p.air && Math.abs(sp.x - p.x) < 6 && p.y < sp.y - 7 && Math.abs(sp.y - surf(p.L, p.x)) < 3) {
          sp.scored = true;
          s.score += 100;
          s.run += 1;
          pop(p.x, p.y - 16, "100", "#ffffff");
          sfx.over();
        }
      }
      s.speakers = s.speakers.filter((sp) => !sp.gone);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      for (const q of s.parts) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.grow) {
          q.vx *= 1 - 0.8 * dt;
          q.vy *= 1 - 0.5 * dt;
          q.size = Math.min(7, q.size + q.grow * dt);
        } else q.vy += 120 * dt;
        q.life -= dt;
      }
      s.parts = s.parts.filter((q) => q.life > 0);
      for (const q of s.pops) {
        q.y -= 14 * dt;
        q.life -= dt;
      }
      s.pops = s.pops.filter((q) => q.life > 0);

      updateKong(dt);
      if (s.mode === "dying") {
        updateSpeakers(dt);
        if (s.t > 1.4) {
          s.lives -= 1;
          if (s.lives <= 0) gameOver();
          else {
            placePlayer();
            s.mode = "running";
          }
        }
        return;
      }
      if (s.mode === "clear") {
        if (s.t > 2.2) {
          s.level += 1;
          startLevel();
          s.mode = "running";
        }
        return;
      }
      if (s.mode !== "running") return;
      s.runT += dt;
      // the bonus counts down
      s.bonusT += dt;
      if (s.bonusT >= 1.5) {
        s.bonusT = 0;
        s.bonus = Math.max(0, s.bonus - 100);
      }
      updatePlayer(dt);
      updateSpeakers(dt);
      if (s.mode !== "running") return;
      // nugs
      const p = s.p;
      NUGS.forEach((n, i) => {
        if (s.nugs[i] || n.L !== p.L || Math.abs(n.x - p.x) > 5) return;
        s.nugs[i] = true;
        s.score += 300;
        s.run += 3;
        pop(n.x, surf(n.L, n.x) - 16, "300", "#6fdc5a");
        burst(n.x, surf(n.L, n.x) - 4, 10, ["#6fdc5a", "#ffffff"], 40);
        sfx.nug();
      });
      // THE STASH
      if (p.L === 5) {
        s.score += s.bonus;
        s.run += 10;
        pop(STASH_X, 4, `+${s.bonus}`, GOLD);
        burst(STASH_X, 12, 30, [GOLD, "#ffffff", "#6fdc5a"], 70);
        s.speakers = [];
        s.mode = "clear";
        s.t = 0;
        sfx.clear();
      }
    };

    // ---------- drawing ----------
    const drawGirders = () => {
      GIRDERS.forEach((g, L) => {
        ctx.fillStyle = PINK;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.yA);
        ctx.lineTo(g.x2, g.yB);
        ctx.lineTo(g.x2, g.yB + 4);
        ctx.lineTo(g.x1, g.yA + 4);
        ctx.closePath();
        ctx.fill();
        // the dark edge + little rivets, like the girders in the arcade game
        for (let x = g.x1; x < g.x2; x += 1) {
          const y = Math.round(surf(L, x));
          ctx.fillStyle = DARK_PINK;
          ctx.fillRect(x, y + 3, 1, 1);
          if ((x - g.x1) % 8 === 2) {
            ctx.fillStyle = INK;
            ctx.fillRect(x, y + 1, 1, 1);
            ctx.fillRect(x + 1, y + 2, 1, 1);
            ctx.fillRect(x + 2, y + 1, 1, 1);
          }
        }
      });
    };
    const drawLadders = () => {
      for (const l of LADDERS) {
        const top = Math.round(surf(l.from + 1, l.x)) + 4;
        const bot = Math.round(surf(l.from, l.x));
        ctx.fillStyle = LADDER;
        ctx.fillRect(l.x - 3, top, 1, bot - top);
        ctx.fillRect(l.x + 3, top, 1, bot - top);
        for (let y = top + 2; y < bot; y += 4) ctx.fillRect(l.x - 3, y, 7, 1);
      }
    };
    const drawStash = () => {
      const y = 18 - 7 + Math.round(Math.sin(s.clock * 3));
      const glow = 0.25 + Math.sin(s.clock * 4) * 0.15;
      ctx.fillStyle = `rgba(255,215,0,${glow})`;
      ctx.fillRect(STASH_X - 7, y - 3, 14, 12);
      drawPixels(ctx, ["..GGG..", ".GGLGG.", "GGGGGGG", "GGGLGGG", ".GGGGG.", "..GGG.."], STASH_X - 3, y, { G: GOLD, L: "#ffffff" });
      drawText(ctx, fontFamily, "STASH", STASH_X + 24, 4, GOLD, 8);
    };
    const drawKong = () => {
      const k = s.kong;
      const kx = KONG_X;
      let ky = kongY();
      const angry = s.mode === "clear";
      if (angry || k.phase === "throw") ky += Math.round(Math.sin(s.clock * 40));
      ctx.save();
      ctx.translate(kx, Math.round(ky));
      ctx.scale(KS, KS);
      drawPixels(ctx, PIG, 0, 0, PIG_COLORS);
      // a speaker over his head while he grabs it
      if (k.phase === "grab") drawSpeaker(ctx, 8, -1, 0);
      // THE BONG (in his right hand): a glass tube with green water, bubbles while he hits it
      if (k.phase === "bong" || k.phase === "idle") {
        const bx = 17;
        const by = 4;
        const hitting = k.phase === "bong" && k.t > BONG_TIME * 0.4;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#bfe9ff";
        ctx.fillRect(bx, by, 4, 12); // the tube
        ctx.fillRect(bx - 1, by + 9, 6, 4); // the bottom
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#3fc24a";
        ctx.fillRect(bx, by + 9, 4, 3); // the water
        ctx.fillStyle = "#c08a4a";
        ctx.fillRect(bx + 4, by + 6, 2, 1); // the bowl
        ctx.fillRect(bx + 5, by + 5, 1, 1);
        if (hitting) {
          // mouth on the tube + the lighter flame on the bowl
          ctx.fillStyle = "#ff8ad8";
          ctx.fillRect(bx - 2, by, 2, 2);
          ctx.fillStyle = Math.floor(s.clock * 20) % 2 ? "#ffd84a" : "#ff7a00";
          ctx.fillRect(bx + 6, by + 3, 1, 2);
        }
      }
      ctx.restore();
      if (k.phase === "bong" && k.t > BONG_TIME * 0.5) drawText(ctx, fontFamily, "BONG!", kx + 52, ky + 2, "#c8f0ff", 8, "left");
      if (angry) drawText(ctx, fontFamily, "OINK!", kx + 52, ky + 2, "#ff6a6a", 8, "left");
    };
    const drawDude = (c: CanvasRenderingContext2D, x: number, y: number, skin: string) => {
      const p = s.p;
      const frame = Math.floor(p.walkT * 8) % 2;
      const rows = p.climb >= 0 ? DUDE_CLIMB[frame] : p.air ? DUDE[1] : DUDE[frame];
      c.globalAlpha = skin === "ghost" ? 0.7 : 1;
      drawPixels(c, rows, x - 4, y - 12, dudeColors(skin), p.climb < 0 && p.face < 0);
      c.globalAlpha = 1;
    };
    // the shop's preview box + the SHOP panel
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = BG;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      c.save();
      c.translate(cx, cy);
      c.scale(2, 2);
      if (id === "up:slow") {
        drawSpeaker(c, -2, 6, t * 2);
        drawText(c, fontFamily, "Z", 6, -10 + Math.round(Math.sin(t * 3)), "#ffffff");
      } else if (id === "up:life") {
        for (let i = 0; i < 3; i++) drawPixels(c, DUDE[0].slice(0, 6), -14 + i * 9, -3 + Math.round(Math.sin(t * 4 + i)), dudeColors(skin));
      } else {
        const frame = Math.floor(t * (id === "up:speed" ? 14 : 6)) % 2;
        drawPixels(c, DUDE[frame], -4, -6, dudeColors(skin));
      }
      c.restore();
    };

    const draw = () => {
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = BG;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      // a few twinkly dots in the background
      for (let i = 0; i < 30; i++) {
        const x = (i * 97) % W;
        const y = (i * 53) % H;
        ctx.fillStyle = `rgba(214,60,200,${0.15 + 0.15 * Math.sin(s.clock * 2 + i)})`;
        ctx.fillRect(x, y, 1, 1);
      }
      drawLadders();
      drawGirders();
      drawStash();
      NUGS.forEach((n, i) => {
        if (s.nugs[i]) return;
        drawPixels(ctx, NUG, n.x - 2, surf(n.L, n.x) - 7 + Math.round(Math.sin(s.clock * 5 + i)), { G: "#6fdc5a", L: "#ffffff" });
      });
      drawKong();
      for (const sp of s.speakers) drawSpeaker(ctx, sp.x, sp.y, sp.spin);
      if (s.mode === "running" || s.mode === "clear" || s.mode === "ready") drawDude(ctx, s.p.x, s.p.y, arc.shop.wearingName("skin"));
      for (const q of s.parts) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (q.life / q.max) * (q.grow ? 0.7 : 1)));
        ctx.fillStyle = q.color;
        const sz = Math.round(q.size);
        ctx.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), sz, sz);
      }
      ctx.globalAlpha = 1;
      for (const q of s.pops) drawText(ctx, fontFamily, q.text, q.x, q.y, q.color);
      ctx.restore();

      // HUD
      if (s.mode !== "ready" && s.mode !== "over") {
        drawText(ctx, fontFamily, pad(s.score), 60, 2, "#ffffff", 8, "left");
        drawText(ctx, fontFamily, `LV ${s.level}`, 106, 2, KIT.lilac, 8, "left");
        drawText(ctx, fontFamily, `BONUS ${s.bonus}`, W - 6, 2, s.bonus <= 1000 && Math.floor(s.clock * 3) % 2 ? "#ff6a6a" : GOLD, 8, "right");
        for (let i = 0; i < s.lives; i++) drawPixels(ctx, DUDE[0].slice(0, 6), 220 - i * 10, 133, dudeColors(arc.shop.wearingName("skin")));
        nugIcon(ctx, W - 40, 132);
        drawText(ctx, fontFamily, String(s.run), W - 28, 132, "#6fdc5a", 8, "left");
      }
      if (s.mode === "clear" && s.t > 0.3) {
        drawText(ctx, fontFamily, "STASH SECURED!", W / 2, 54, GOLD, 16);
        drawText(ctx, fontFamily, `LEVEL ${s.level + 1} NEXT`, W / 2, 76, "#ffffff");
      }
      if (s.mode === "running" && s.runT < 3 && s.level === 1) {
        drawText(ctx, fontFamily, isTouch() ? "PAD = WALK + CLIMB   A / TAP = JUMP" : "← → WALK   ↑ ↓ CLIMB   SPACE = JUMP", W / 2, 100, "#ffffff");
      }

      if (s.mode === "ready") {
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "CLIMB TO THE STASH",
          lines: [
            [isTouch() ? "PAD = WALK + CLIMB" : "← → WALK  ↑ ↓ CLIMB", "#ffffff"],
            [isTouch() ? "A / TAP = JUMP" : "SPACE = JUMP", KIT.lilac],
            ["DODGE THE SPEAKERS", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: s.best > 0 ? `BEST ${pad(s.best)}` : "DEMO",
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS   - / + = FX VOLUME",
          dim: 0.5,
        });
        arc.drawPanels(ctx, s.clock);
      }
      if (s.mode === "over") {
        drawOverScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          age: s.t,
          title: "BEARMANPIG WINS",
          score: `SCORE ${pad(s.score)}`,
          best: `BEST ${pad(s.best)}`,
          newBest: s.newBest,
          stats: `LEVEL ${s.level}`,
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
    const setHeld = (e: KeyboardEvent, on: boolean) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") held.left = on;
      else if (k === "ArrowRight" || k === "d" || k === "D") held.right = on;
      else if (k === "ArrowUp" || k === "w" || k === "W") held.up = on;
      else if (k === "ArrowDown" || k === "s" || k === "S") held.down = on;
      else return false;
      return true;
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (setHeld(e, true) && s.mode === "running") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      setHeld(e, false);
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    // ---------- taps: jump / start (and the pause menu, shop, FX) ----------
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
    s.mode = "ready";

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000));
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (arc.frozen()) held.left = held.right = held.up = held.down = false;
      else update(dt);
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      document.removeEventListener("visibilitychange", onHidden);
      if (playing()) bankRun(); // leaving with EXIT / BACKSPACE: keep the nugs from this game
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
        background: BG,
        touchAction: "manipulation",
        cursor: "pointer",
      }}
    />
  );
}
