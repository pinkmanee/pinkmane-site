"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, silverGlow, drawOverScreen, drawStartScreen, drawText, makeArcade, type Arcade, type ShopRow } from "./PinkShop";
import { isPhoneOrTablet } from "./device";

// KONG BONG: Donkey Kong, PINKMANE style. BEARMANPIG sits at the top, throws speakers down the girders,
// and after EVERY throw he hits his bong. Climb the ladders, jump over the speakers, reach THE STASH at the very top.
//   ← → (A D) = walk      ↑ ↓ (W S) = climb a ladder      SPACE / OK / tap = jump (and start)
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
//
// HOW THE LEVELS GO:
//   - 6 MAPS take turns: THE GIRDERS (slopes), THE CONVEYORS (belts that carry you), THE GAPS (holes: don't fall in!),
//     THE ZIGZAG (steep slopes), THE MIX (belts + holes), THE BIG GAPS (two holes on every floor)
//   - the background: hills + swaying weed leaves in the level's colours
//   - EVERY level a new colour (10 of them), then two colours mixed: half + half, or striped rows
//   - from level 3: WILD SPEAKERS that bounce straight down through the girders
//   - from level 5: speakers that roll into the bottom corner can turn into FIRE that chases you (it climbs ladders too)
//   - every level BEARMANPIG's BONG gets bigger: more smoke, and the smoke hangs around (harder to see)
//   - THE LIGHTER: grab it and for a few seconds you burn the speakers (and the fire) you touch. No climbing while you hold it.
// Points: jump a speaker = 100, burn one = 300, a nug = 300, THE STASH = the BONUS (it counts down, so be quick).
// MONEY: NUGS. 1 for every speaker you jump / burn, 3 for every nug, 10 for every stash.
// ONLINE TOP 10: board id "kong" (see Scoreboard.tsx and app/api/scores/shared.ts).

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
type Girder = { x1: number; x2: number; yA: number; yB: number; dir: 1 | -1; belt?: number; gaps?: { a: number; b: number }[] };
type GameMap = { name: string; girders: Girder[]; ladders: { x: number; from: number }[]; nugs: { L: number; x: number }[]; lighter: { L: number; x: number } };
type Speaker = { x: number; y: number; L: number; fall: boolean; vy: number; vx: number; spin: number; lastLad: number; scored: boolean; gone: boolean; wild: boolean };
type Flame = { x: number; y: number; L: number; climb: number; dir: number; t: number; gone: boolean; scored: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grow?: number; top?: boolean };
type Popup = { x: number; y: number; text: string; life: number; color: string };

const GAME_TITLE = "KONG BONG";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;

// Girder 4 (BEARMANPIG's) and 5 (THE STASH) are the same in every map
const G4: Girder = { x1: 8, x2: 290, yA: 40, yB: 45, dir: 1 };
const G5: Girder = { x1: 128, x2: 192, yA: 18, yB: 18, dir: 1 };

// THE MAPS (they take turns, one per level). Girder 0 = the bottom. yA = y at the left end, yB = at the right end.
// dir = which way the speakers roll on it. belt = a conveyor that carries you (pixels a second). gaps = holes.
const MAPS: GameMap[] = [
  {
    name: "THE GIRDERS",
    girders: [
      { x1: 8, x2: 312, yA: 145, yB: 141, dir: -1 },
      { x1: 30, x2: 312, yA: 120, yB: 115, dir: -1 },
      { x1: 8, x2: 290, yA: 90, yB: 95, dir: 1 },
      { x1: 30, x2: 312, yA: 70, yB: 65, dir: -1 },
      G4,
      G5,
    ],
    ladders: [
      { x: 250, from: 0 },
      { x: 90, from: 0 },
      { x: 60, from: 1 },
      { x: 200, from: 1 },
      { x: 240, from: 2 },
      { x: 120, from: 2 },
      { x: 80, from: 3 },
      { x: 270, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 150 },
      { L: 2, x: 60 },
      { L: 3, x: 230 },
    ],
    lighter: { L: 1, x: 285 },
  },
  {
    name: "THE CONVEYORS",
    girders: [
      { x1: 8, x2: 312, yA: 143, yB: 143, dir: -1 },
      { x1: 30, x2: 312, yA: 118, yB: 118, dir: -1, belt: -16 },
      { x1: 8, x2: 290, yA: 93, yB: 93, dir: 1, belt: 16 },
      { x1: 30, x2: 312, yA: 68, yB: 68, dir: -1, belt: -16 },
      G4,
      G5,
    ],
    ladders: [
      { x: 200, from: 0 },
      { x: 70, from: 0 },
      { x: 100, from: 1 },
      { x: 250, from: 1 },
      { x: 60, from: 2 },
      { x: 180, from: 2 },
      { x: 230, from: 3 },
      { x: 120, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 290 },
      { L: 2, x: 130 },
      { L: 3, x: 60 },
    ],
    lighter: { L: 2, x: 250 },
  },
  {
    name: "THE GAPS",
    girders: [
      { x1: 8, x2: 312, yA: 145, yB: 141, dir: -1 },
      { x1: 30, x2: 312, yA: 120, yB: 115, dir: -1, gaps: [{ a: 150, b: 164 }] },
      { x1: 8, x2: 290, yA: 90, yB: 95, dir: 1, gaps: [{ a: 160, b: 174 }] },
      { x1: 30, x2: 312, yA: 70, yB: 65, dir: -1, gaps: [{ a: 180, b: 194 }] },
      G4,
      G5,
    ],
    ladders: [
      { x: 250, from: 0 },
      { x: 90, from: 0 },
      { x: 60, from: 1 },
      { x: 200, from: 1 },
      { x: 240, from: 2 },
      { x: 120, from: 2 },
      { x: 80, from: 3 },
      { x: 270, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 120 },
      { L: 2, x: 200 },
      { L: 3, x: 150 },
    ],
    lighter: { L: 0, x: 170 },
  },
  {
    name: "THE ZIGZAG",
    girders: [
      { x1: 8, x2: 312, yA: 146, yB: 140, dir: -1 },
      { x1: 30, x2: 312, yA: 122, yB: 113, dir: -1 },
      { x1: 8, x2: 290, yA: 89, yB: 98, dir: 1 },
      { x1: 30, x2: 312, yA: 70, yB: 61, dir: -1 },
      G4,
      G5,
    ],
    ladders: [
      { x: 270, from: 0 },
      { x: 160, from: 0 },
      { x: 50, from: 1 },
      { x: 220, from: 1 },
      { x: 260, from: 2 },
      { x: 120, from: 2 },
      { x: 60, from: 3 },
      { x: 200, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 100 },
      { L: 2, x: 200 },
      { L: 3, x: 130 },
    ],
    lighter: { L: 0, x: 60 },
  },
  {
    name: "THE MIX",
    girders: [
      { x1: 8, x2: 312, yA: 143, yB: 143, dir: -1 },
      { x1: 30, x2: 312, yA: 118, yB: 118, dir: -1, belt: -16, gaps: [{ a: 200, b: 214 }] },
      { x1: 8, x2: 290, yA: 93, yB: 93, dir: 1, belt: 22, gaps: [{ a: 110, b: 124 }] },
      { x1: 30, x2: 312, yA: 68, yB: 68, dir: -1, belt: -16, gaps: [{ a: 140, b: 154 }] },
      G4,
      G5,
    ],
    ladders: [
      { x: 250, from: 0 },
      { x: 80, from: 0 },
      { x: 60, from: 1 },
      { x: 170, from: 1 },
      { x: 220, from: 2 },
      { x: 90, from: 2 },
      { x: 260, from: 3 },
      { x: 100, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 280 },
      { L: 2, x: 50 },
      { L: 3, x: 200 },
    ],
    lighter: { L: 2, x: 160 },
  },
  {
    name: "THE BIG GAPS",
    girders: [
      { x1: 8, x2: 312, yA: 144, yB: 144, dir: -1 },
      { x1: 30, x2: 312, yA: 120, yB: 116, dir: -1, gaps: [{ a: 90, b: 104 }, { a: 220, b: 234 }] },
      { x1: 8, x2: 290, yA: 92, yB: 96, dir: 1, gaps: [{ a: 60, b: 74 }, { a: 170, b: 184 }] },
      { x1: 30, x2: 312, yA: 70, yB: 66, dir: -1, gaps: [{ a: 120, b: 134 }, { a: 250, b: 264 }] },
      G4,
      G5,
    ],
    ladders: [
      { x: 200, from: 0 },
      { x: 60, from: 0 },
      { x: 140, from: 1 },
      { x: 270, from: 1 },
      { x: 40, from: 2 },
      { x: 230, from: 2 },
      { x: 90, from: 3 },
      { x: 200, from: 3 },
      { x: 176, from: 4 },
    ],
    nugs: [
      { L: 1, x: 160 },
      { L: 2, x: 120 },
      { L: 3, x: 290 },
    ],
    lighter: { L: 1, x: 60 },
  },
];

// THE COLOURS: every level gets its own. background, girder, girder edge, ladders.
type World = { name: string; bg: string; girder: string; edge: string; ladder: string };
const WORLDS: World[] = [
  { name: "PINK", bg: "#1c0f2a", girder: "#d63cc8", edge: "#8a1f86", ladder: "#7fd0ff" },
  { name: "TOXIC", bg: "#0b1d10", girder: "#3fc24a", edge: "#1b6b25", ladder: "#d8ff8a" },
  { name: "ICE", bg: "#0c1a2e", girder: "#7fd0ff", edge: "#2a7ab0", ladder: "#ffffff" },
  { name: "VOLCANO", bg: "#1f0906", girder: "#ff6a1a", edge: "#8a2200", ladder: "#ffd84a" },
  { name: "SILVER", bg: "#14161e", girder: "#d4d8e4", edge: "#6a6e80", ladder: "#ff8ad8" },
  { name: "PURPLE", bg: "#120a26", girder: "#9a5cff", edge: "#4a2a9a", ladder: "#ffd84a" },
  { name: "CHERRY", bg: "#22060e", girder: "#ff3b5c", edge: "#8a1028", ladder: "#ffffff" },
  { name: "OCEAN", bg: "#04161c", girder: "#1ad8c8", edge: "#0a6a64", ladder: "#ff8ad8" },
  { name: "MINT", bg: "#0e1c18", girder: "#8affc8", edge: "#2a8a6a", ladder: "#ff6aa8" },
  { name: "BUBBLEGUM", bg: "#24101e", girder: "#ff9ad8", edge: "#b04a8a", ladder: "#8affc8" },
];
// When the single colours run out: TWO colours mixed. They take turns:
//   "split"  = one colour on the left half, the other on the right half
//   "stripe" = the girders swap colour every row
type Look = { name: string; a: World; b: World; style: "one" | "split" | "stripe" };
const LOOKS: Look[] = (() => {
  const out: Look[] = WORLDS.map((w) => ({ name: w.name, a: w, b: w, style: "one" as const }));
  const pairs: [number, number][] = [];
  for (let i = 0; i < WORLDS.length; i++) for (let j = i + 1; j < WORLDS.length; j++) pairs.push([i, j]);
  // mix the order up (always the same order, so level 11 always looks the same)
  let seed = 7;
  for (let i = pairs.length - 1; i > 0; i--) {
    seed = (seed * 9301 + 49297) % 233280;
    const j = Math.floor((seed / 233280) * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  pairs.forEach(([i, j], n) => out.push({ name: `${WORLDS[i].name} + ${WORLDS[j].name}`, a: WORLDS[i], b: WORLDS[j], style: n % 2 ? "stripe" : "split" }));
  return out;
})();
const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
// blend two colours: t = 0 -> a, t = 1 -> b
const mixHex = (a: string, b: string, t: number) => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
};
const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};
// a weed leaf: x, y = where the stem starts (bottom), size = how tall
const LEAFLETS: [number, number][] = [
  [0, 1],
  [-0.45, 0.85],
  [0.45, 0.85],
  [-0.95, 0.65],
  [0.95, 0.65],
  [-1.5, 0.4],
  [1.5, 0.4],
];
function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, color: string, alpha: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(-0.5, -size * 0.1, 1, size * 0.9);
  for (const [ang, len] of LEAFLETS) {
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, (-len * size) / 2, size * 0.08 + len * size * 0.03, (len * size) / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
const rgbOf = (hex: string) => `${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)}`;

const STASH_X = 160;
const KONG_X = 4; // BEARMANPIG's left edge (he stands on girder 4, drawn 2x big)
const KS = 2; // how big BEARMANPIG is drawn
const SPAWN_X = 56; // where his speakers start rolling

// ---------- EASY TUNING ----------
const START_LIVES = 3;
const WALK = 46; // walking speed (pixels a second)
const CLIMB = 32; // climbing speed
const JUMP = 112; // how hard you jump (higher = higher)
const GRAVITY = 430;
const FALL_DEATH = 14; // falling further than this (into a gap) = you're out
const SPEAKER_SPEED = 50; // how fast the speakers roll on level 1...
const SPEAKER_SPEED_UP = 6; // ...and this much faster every level
const SPEAKER_SPEED_MAX = 92;
const BONG_TIME = 1.3; // how long BEARMANPIG hits the bong after a throw
const BONUS_START = 3000; // the bonus for reaching the stash (it counts down)
const WILD_FROM = 3; // wild speakers (bounce straight down) from this level
const FIRE_FROM = 5; // fire from this level
const MAX_FIRES = 2;
const LIGHTER_TIME = 7; // seconds THE LIGHTER burns

// Saved in the visitor's browser
const BEST_KEY = "pinkkong-best";
const FX_KEY = "pinkkong-fx";
const SHOP_KEY = "pinkkong-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const INK = "#0d0d12";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GOLD = "#ffd700";
const SMOKE = ["#9a9aa8", "#b8b8c4", "#d4d4dc", "#7a7a88"];
const FIRE = ["#ffd84a", "#ff7a00", "#ff3b1a", "#ffffff"];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 60 },
  { id: "ice", name: "ICE", price: 100 },
  { id: "fire", name: "FIRE", price: 150 },
  { id: "ghost", name: "GHOST", price: 200 },
  { id: "gold", name: "SILVER", price: 350 },
  { id: "streak", name: "STREAK", price: 1 }, // only from the 7-day daily reward (shows LOCKED until then)
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:life", name: "EXTRA LIFE", prices: [150, 400], info: ["START WITH ONE MORE LIFE", ""] },
  { kind: "item", id: "up:speed", name: "FAST SHOES", prices: [100, 250], info: ["WALK + CLIMB FASTER", ""] },
  { kind: "item", id: "up:slow", name: "HEAVY SPEAKERS", prices: [120, 300], info: ["THE SPEAKERS ROLL SLOWER", ""] },
  { kind: "item", id: "up:lighter", name: "BIG LIGHTER", prices: [100, 250], info: ["THE LIGHTER BURNS LONGER", "+2 SECONDS EVERY LEVEL"] },
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
// THE LIGHTER (the power-up)
const LIGHTER = ["..F..", ".FYF.", "..S..", "SSSSS", "RRRRR", "RRWRR", "RRRRR", "RRRRR"];
const LIGHTER_COLORS: Record<string, string> = { F: "#ff7a00", Y: "#ffd84a", S: "#c8c8d4", R: "#ff2a6a", W: "#ffffff" };
// fire (from level 5), two frames
const FLAME = [
  ["...Y...", "..YOY..", ".YOROY.", ".ORRRO.", "ORRWRRO", "ORKRKRO", ".ORRRO.", "..OOO.."],
  ["..Y....", "..OY.Y.", ".YORYO.", ".ORRRO.", "ORRWRRO", "ORKRKRO", ".ORRRO.", "..OOO.."],
];
const FLAME_COLORS: Record<string, string> = { Y: "#ffd84a", O: "#ff7a00", R: "#ff3b1a", W: "#ffffff", K: INK };

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
const surfOf = (g: Girder, x: number) => g.yA + ((g.yB - g.yA) * (x - g.x1)) / (g.x2 - g.x1);
// is there girder under x (not off the end, not a hole)?
const solidOf = (g: Girder, x: number) => x >= g.x1 && x <= g.x2 && !(g.gaps ?? []).some((h) => x > h.a && x < h.b);

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
// one speaker box (x = middle, y = bottom), the cone turns as it rolls. wild ones are pink.
function drawSpeaker(ctx: CanvasRenderingContext2D, x: number, y: number, spin: number, wild = false) {
  const X = Math.round(x) - 4;
  const Y = Math.round(y) - 9;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(X + 1, Y + 9, 8, 1);
  ctx.fillStyle = INK;
  ctx.fillRect(X, Y, 8, 9);
  ctx.fillStyle = wild ? "#ff5fd2" : "#33333f";
  ctx.fillRect(X + 1, Y + 1, 6, 7);
  ctx.fillStyle = wild ? "#ffb0ec" : "#55556a";
  ctx.fillRect(X + 1, Y + 1, 6, 1);
  // tweeter
  ctx.fillStyle = wild ? "#ffffff" : "#9a9ab0";
  ctx.fillRect(X + 3, Y + 2, 2, 1);
  // woofer (it pumps)
  const pump = Math.sin(spin * 2) > 0 ? 1 : 0;
  ctx.fillStyle = wild ? "#ffffff" : PINK;
  ctx.fillRect(X + 2 - pump * 0, Y + 4, 4, 3);
  ctx.fillRect(X + 3, Y + 3 + (1 - pump), 2, 5 - (1 - pump) * 2);
  ctx.fillStyle = INK;
  ctx.fillRect(X + 3, Y + 5, 2, 1);
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
  const boardRef = useRef<ScoreApi | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coarse = isPhoneOrTablet(); // a real phone or tablet (a computer with a touch screen still says CLICK)
    const isTouch = () => touchRef.current || coarse;
    const held = { left: false, right: false, up: false, down: false };

    const s = {
      mode: "ready" as Mode,
      t: 0, // seconds in this mode
      clock: 0,
      runT: 0,
      playT: 0, // seconds this whole game has lasted (for the Top 10's cheat check)
      levelT: 0, // seconds into this level
      level: 1,
      lives: START_LIVES,
      score: 0,
      best: 0,
      bonus: BONUS_START,
      bonusT: 0,
      run: 0, // nugs (money) this game
      newBest: false,
      p: { x: 24, y: 0, L: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walkT: 0, takeoff: 0 },
      speakers: [] as Speaker[],
      flames: [] as Flame[],
      nugs: [false, false, false], // taken?
      lighterTaken: false,
      lit: 0, // seconds THE LIGHTER still burns
      throws: 0,
      exits: 0, // speakers that rolled out at the bottom (every 3rd makes fire from level 5)
      haze: 0, // smoke hanging over everything (more every level)
      parts: [] as Particle[],
      pops: [] as Popup[],
      // BEARMANPIG: idle -> grab (a speaker over his head) -> throw -> bong -> idle ...
      kong: { phase: "idle" as "idle" | "grab" | "throw" | "bong", t: 1.2, exhaled: false },
      shake: 0,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // this level's map and world
    const map = () => MAPS[(s.level - 1) % MAPS.length];
    const look = () => LOOKS[(s.level - 1) % LOOKS.length];
    // which colour this spot uses (girder L at x)
    const worldAt = (L: number, x: number) => {
      const lk = look();
      if (lk.style === "split") return x < W / 2 ? lk.a : lk.b;
      if (lk.style === "stripe") return L % 2 ? lk.b : lk.a;
      return lk.a;
    };
    const G = (L: number) => map().girders[L];
    const surf = (L: number, x: number) => surfOf(G(L), x);
    const solid = (L: number, x: number) => solidOf(G(L), x);
    const kongY = () => surfOf(G4, KONG_X + 16) - 17 * KS;
    s.p.y = surf(0, 24);

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
      busy: () => boardRef.current?.busy() ?? false,
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
      // the bong: a low glassy BONG, then bubbles (deeper + longer as the bong gets bigger)
      bong: () => {
        const big = Math.min(s.level - 1, 6);
        beep(196 - big * 12, 190 - big * 12, 0.5 + big * 0.05, 0.08, "sine");
        beep(392, 380, 0.3, 0.03, "sine");
        for (let i = 0; i < 9 + big * 2; i++) beep(rand(80, 180), rand(200, 320), 0.05, 0.05, "sine", 0.25 + i * 0.07);
      },
      exhale: () => beep(260, 120, 0.6, 0.02, "triangle"),
      burn: () => beep(900, 200, 0.15, 0.06, "sawtooth"),
      lighter: () => [440, 660, 880, 1320].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.05)),
      fire: () => beep(150, 400, 0.3, 0.05, "sawtooth"),
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
    const wildChance = () => (s.level < WILD_FROM ? 0 : Math.min(0.4, 0.2 + (s.level - WILD_FROM) * 0.05));
    const walkSpeed = () => WALK * (1 + arc.shop.lvl("speed") * 0.12);
    const bongSize = () => Math.min(s.level - 1, 6); // 0 = the small one

    const placePlayer = () => {
      s.p = { x: 24, y: surf(0, 24), L: 0, vx: 0, vy: 0, air: false, climb: -1, face: 1, walkT: 0, takeoff: 0 };
      s.speakers = [];
      s.flames = [];
      s.kong = { phase: "idle", t: 1.2, exhaled: false };
      s.bonus = BONUS_START;
      s.bonusT = 0;
      s.lit = 0;
    };
    const startLevel = () => {
      placePlayer();
      s.nugs = [false, false, false];
      s.lighterTaken = false;
      s.levelT = 0;
      s.haze = 0;
      s.exits = 0;
    };
    const newGame = () => {
      boardRef.current?.hide();
      s.level = 1;
      s.lives = START_LIVES + arc.shop.lvl("life");
      s.score = 0;
      s.run = 0;
      s.runT = 0;
      s.playT = 0;
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
      p.takeoff = p.y;
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
        if (boardRef.current?.busy()) return; // typing a name for the Top 10
        newGame();
        s.mode = "running";
      }
    };
    pressRef.current = press;

    const hitPlayer = () => {
      if (s.mode !== "running") return;
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
      boardRef.current?.gameOver(Math.floor(s.score), s.playT);
    };

    // BEARMANPIG's routine: grab a speaker, throw it, hit the bong, wait, again
    const updateKong = (dt: number) => {
      const k = s.kong;
      k.t -= dt;
      const kx = KONG_X;
      const ky = kongY();
      const big = bongSize();
      if (k.phase === "bong") {
        // bubbles while he hits it, then he blows the smoke out (more smoke, and it stays longer, the bigger the bong)
        if (k.t > BONG_TIME * 0.45 && Math.random() < 0.5 + big * 0.08) {
          s.parts.push({ x: kx + 19 * KS + rand(-1, 1), y: ky + (11 - big) * KS, vx: rand(-3, 3), vy: rand(-18, -10), life: 0.4, max: 0.4, color: "#c8f0ff", size: 1 });
        }
        if (!k.exhaled && k.t < BONG_TIME * 0.4) {
          k.exhaled = true;
          sfx.exhale();
          const n = 14 + big * 6;
          for (let i = 0; i < n; i++) {
            const life = rand(1.6, 2.6) + big * 0.4;
            s.parts.push({ x: kx + 9 * KS, y: ky + 7 * KS, vx: rand(8, 34 + big * 10), vy: rand(-14, 4), life, max: life, color: SMOKE[Math.floor(Math.random() * SMOKE.length)], size: 2, grow: rand(2, 4) + big * 0.6, top: true });
          }
          // the smoke hangs over the whole screen for a while (from level 2)
          s.haze = Math.min(0.3, s.haze + big * 0.03);
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
          s.throws++;
          const wild = Math.random() < wildChance();
          const sp: Speaker = { x: SPAWN_X, y: surf(4, SPAWN_X), L: 4, fall: false, vy: 0, vx: 0, spin: 0, lastLad: -1, scored: false, gone: false, wild };
          if (wild) {
            // it bounces straight down through the girders, towards where you are
            sp.fall = true;
            sp.vy = -60;
            sp.vx = Math.max(-70, Math.min(70, (s.p.x - SPAWN_X) / 1.6));
          }
          s.speakers.push(sp);
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
      const ladders = map().ladders;
      if (p.climb >= 0) {
        const lad = ladders[p.climb];
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
      const dir = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      // onto a ladder: up (from its bottom) or down (from its top). Not while you hold THE LIGHTER.
      if (!p.air && s.lit <= 0) {
        if (held.up) {
          const i = ladders.findIndex((l) => l.from === p.L && Math.abs(l.x - p.x) < 4);
          if (i >= 0) {
            p.climb = i;
            p.x = ladders[i].x;
            p.y -= 0.5;
            return;
          }
        } else if (held.down) {
          const i = ladders.findIndex((l) => l.from === p.L - 1 && Math.abs(l.x - p.x) < 4);
          if (i >= 0) {
            p.climb = i;
            p.x = ladders[i].x;
            p.y += 0.5;
            return;
          }
        }
      }
      if (dir) p.face = dir;
      const g = G(p.L);
      if (!p.air) {
        p.vx = dir * walkSpeed();
        if (dir) p.walkT += dt;
        p.x += (p.vx + (g.belt ?? 0)) * dt; // a conveyor carries you
      } else p.x += p.vx * dt;
      p.x = Math.max(G(p.L).x1 + 3, Math.min(G(p.L).x2 - 3, p.x));
      if (p.air) {
        p.vy += GRAVITY * dt;
        p.y += p.vy * dt;
        // falling past this girder (a hole): down to the next one
        if (p.vy > 0 && !solid(p.L, p.x) && p.y > surf(p.L, p.x) + 1 && p.L > 0) p.L -= 1;
        const sy = surf(p.L, p.x);
        if (p.vy > 0 && p.y >= sy && solid(p.L, p.x)) {
          p.y = sy;
          p.air = false;
          p.vy = 0;
          if (sy - p.takeoff > FALL_DEATH) hitPlayer(); // fell too far
        }
      } else if (!solid(p.L, p.x)) {
        // walked into a hole
        p.air = true;
        p.vy = 0;
        p.takeoff = p.y;
      } else p.y = surf(p.L, p.x);
    };

    const smash = (x: number, y: number, pts: number) => {
      s.score += pts;
      s.run += 1;
      pop(x, y - 14, String(pts), "#ffd84a");
      burst(x, y - 4, 14, FIRE, 60);
      sfx.burn();
    };

    const updateSpeakers = (dt: number) => {
      const sp0 = speakerSpeed();
      const p = s.p;
      const ladders = map().ladders;
      for (const sp of s.speakers) {
        if (sp.wild) {
          // bounces straight down, through every girder, towards you
          sp.vy += 260 * dt;
          sp.y += sp.vy * dt;
          sp.x = Math.max(12, Math.min(W - 12, sp.x + sp.vx * dt));
          sp.spin += dt * 12;
          if (sp.vy > 0 && sp.L > 0 && sp.x >= G(sp.L - 1).x1 && sp.x <= G(sp.L - 1).x2 && sp.y >= surf(sp.L - 1, sp.x)) {
            sp.L -= 1;
            sp.y = surf(sp.L, sp.x);
            burst(sp.x, sp.y, 5, ["#ff5fd2", "#ffffff"], 30);
            if (sp.L === 0) {
              sp.wild = false;
              sp.fall = false;
            } else sp.vy = -70;
          }
          if (Math.random() < 0.5) s.parts.push({ x: sp.x, y: sp.y - 4, vx: 0, vy: 0, life: 0.25, max: 0.25, color: "#ff5fd2", size: 2 });
        } else if (!sp.fall) {
          const g = G(sp.L);
          sp.x += g.dir * sp0 * dt;
          sp.spin += g.dir * dt * 9;
          // sometimes it goes down a ladder instead of rolling on
          for (const l of ladders) {
            if (l.from !== sp.L - 1 || Math.abs(sp.x - l.x) > 1.5 || sp.lastLad === l.x) continue;
            sp.lastLad = l.x;
            if (Math.random() < dropChance()) {
              sp.fall = true;
              sp.x = l.x;
              sp.vy = 15;
            }
          }
          if (!sp.fall) {
            if (!solid(sp.L, sp.x)) {
              if (sp.L === 0 && (sp.x < g.x1 || sp.x > g.x2)) {
                sp.gone = true;
                // from level 5: every 3rd one that rolls out turns into fire
                s.exits++;
                if (s.level >= FIRE_FROM && s.exits % 3 === 0 && s.flames.length < MAX_FIRES) {
                  s.flames.push({ x: 14, y: surf(0, 14), L: 0, climb: -1, dir: 1, t: 0, gone: false, scored: false });
                  burst(14, surf(0, 14) - 4, 16, FIRE, 50);
                  sfx.fire();
                }
              } else {
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
          if (L2 >= 0 && sp.y >= surf(L2, sp.x)) {
            if (solid(L2, sp.x)) {
              sp.L = L2;
              sp.y = surf(L2, sp.x);
              sp.fall = false;
              sp.lastLad = sp.x; // (so it doesn't go straight down the same ladder again)
              burst(sp.x, sp.y, 4, [PINK, "#ffffff"], 25);
            } else sp.L = L2; // a hole in that one too: keep falling
          }
          if (sp.y > H + 10) sp.gone = true;
        }
        if (s.mode !== "running") continue;
        const touching = Math.abs(sp.x - p.x) < 7 && sp.y - 7 < p.y && sp.y > p.y - 11;
        // THE LIGHTER burns it
        if (s.lit > 0 && Math.abs(sp.x - (p.x + p.face * 5)) < 9 && sp.y - 8 < p.y && sp.y > p.y - 14) {
          sp.gone = true;
          smash(sp.x, sp.y, 300);
          continue;
        }
        if (touching) {
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

    // the fire: it walks towards you, and climbs ladders to get to you
    const updateFlames = (dt: number) => {
      const p = s.p;
      const ladders = map().ladders;
      const speed = 18 + s.level;
      for (const f of s.flames) {
        f.t += dt;
        if (f.climb >= 0) {
          const lad = ladders[f.climb];
          f.y -= 16 * dt;
          if (f.y <= surf(lad.from + 1, lad.x)) {
            f.L = lad.from + 1;
            f.climb = -1;
          }
        } else {
          let target = p.x;
          if (p.L > f.L) {
            // go to the nearest ladder up
            let best = Infinity;
            for (const l of ladders) if (l.from === f.L && Math.abs(l.x - f.x) < Math.abs(best - f.x)) best = l.x;
            if (best !== Infinity) target = best;
            const i = ladders.findIndex((l) => l.from === f.L && Math.abs(l.x - f.x) < 1.5);
            if (i >= 0 && f.L < 4) {
              f.climb = i;
              f.x = ladders[i].x;
              continue;
            }
          }
          f.dir = target > f.x + 1 ? 1 : target < f.x - 1 ? -1 : 0;
          const nx = f.x + f.dir * speed * dt + Math.sin(f.t * 6) * 0.2;
          if (solid(f.L, nx)) f.x = nx;
          f.y = surf(f.L, f.x);
        }
        if (s.mode !== "running") continue;
        if (s.lit > 0 && Math.abs(f.x - (p.x + p.face * 5)) < 9 && Math.abs(f.y - p.y) < 10) {
          f.gone = true;
          smash(f.x, f.y, 500);
          continue;
        }
        if (Math.abs(f.x - p.x) < 6 && f.y - 7 < p.y && f.y > p.y - 11) {
          hitPlayer();
          return;
        }
        if (!f.scored && p.air && Math.abs(f.x - p.x) < 6 && p.y < f.y - 7) {
          f.scored = true;
          s.score += 100;
          pop(p.x, p.y - 16, "100", "#ffffff");
          sfx.over();
        }
      }
      s.flames = s.flames.filter((f) => !f.gone);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      s.haze = Math.max(0, s.haze - dt * 0.02);
      for (const q of s.parts) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.grow) {
          q.vx *= 1 - 0.6 * dt;
          q.vy *= 1 - 0.5 * dt;
          q.size = Math.min(7 + bongSize() * 2, q.size + q.grow * dt);
        } else q.vy += 120 * dt;
        q.life -= dt;
      }
      s.parts = s.parts.filter((q) => q.life > 0);
      for (const q of s.pops) {
        q.y -= 14 * dt;
        q.life -= dt;
      }
      s.pops = s.pops.filter((q) => q.life > 0);

      if (s.mode === "running" || s.mode === "dying" || s.mode === "clear") s.playT += dt;
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
      s.levelT += dt;
      if (s.lit > 0) s.lit -= dt;
      // the bonus counts down
      s.bonusT += dt;
      if (s.bonusT >= 1.5) {
        s.bonusT = 0;
        s.bonus = Math.max(0, s.bonus - 100);
      }
      updatePlayer(dt);
      if (s.mode !== "running") return;
      updateSpeakers(dt);
      updateFlames(dt);
      if (s.mode !== "running") return;
      const p = s.p;
      // nugs
      map().nugs.forEach((n, i) => {
        if (s.nugs[i] || n.L !== p.L || Math.abs(n.x - p.x) > 5 || p.climb >= 0) return;
        s.nugs[i] = true;
        s.score += 300;
        s.run += 3;
        pop(n.x, surf(n.L, n.x) - 16, "300", "#6fdc5a");
        burst(n.x, surf(n.L, n.x) - 4, 10, ["#6fdc5a", "#ffffff"], 40);
        sfx.nug();
      });
      // THE LIGHTER
      const lt = map().lighter;
      if (!s.lighterTaken && lt.L === p.L && Math.abs(lt.x - p.x) < 6 && p.climb < 0) {
        s.lighterTaken = true;
        s.lit = LIGHTER_TIME + arc.shop.lvl("lighter") * 2;
        pop(p.x, p.y - 18, "LIGHT IT UP!", "#ffd84a");
        sfx.lighter();
      }
      // THE STASH
      if (p.L === 5) {
        s.score += s.bonus;
        s.run += 10;
        pop(STASH_X, 4, `+${s.bonus}`, GOLD);
        burst(STASH_X, 12, 30, [GOLD, "#ffffff", "#6fdc5a"], 70);
        s.speakers = [];
        s.flames = [];
        s.mode = "clear";
        s.t = 0;
        sfx.clear();
      }
    };

    // ---------- drawing ----------
    const drawGirders = () => {
      map().girders.forEach((g, L) => {
        for (let x = g.x1; x < g.x2; x++) {
          if (!solidOf(g, x + 0.5)) continue;
          const w = worldAt(L, x);
          const y = Math.round(surfOf(g, x));
          const k = x - g.x1;
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(x + 1, y + 4, 1, 2);
          ctx.fillStyle = mixHex(w.girder, "#ffffff", 0.5);
          ctx.fillRect(x, y, 1, 1);
          ctx.fillStyle = w.girder;
          ctx.fillRect(x, y + 1, 1, 2);
          ctx.fillStyle = w.edge;
          ctx.fillRect(x, y + 3, 1, 1);
          if (g.belt) {
            const off = Math.floor(s.clock * Math.abs(g.belt)) % 8;
            const m = (((g.belt > 0 ? k - off : k + off) % 8) + 8) % 8;
            ctx.fillStyle = INK;
            if (m === 2 || m === 3) ctx.fillRect(x, y + 1, 1, 1);
            if ((g.belt > 0 && m === 1) || (g.belt < 0 && m === 4)) ctx.fillRect(x, y + 2, 1, 1);
            if (k % 6 === 0) {
              ctx.fillStyle = mixHex(w.edge, "#000000", 0.4);
              ctx.fillRect(x, y + 3, 1, 1);
            }
          } else {
            // a little zig-zag truss, like a steel girder
            const m = k % 4;
            ctx.fillStyle = mixHex(w.girder, w.edge, 0.7);
            ctx.fillRect(x, y + 1 + (m === 1 || m === 2 ? 1 : 0), 1, 1);
          }
        }
      });
    };
    const drawLadders = () => {
      for (const l of map().ladders) {
        const col = worldAt(l.from + 1, l.x).ladder;
        const top = Math.round(surf(l.from + 1, l.x)) + 4;
        const bot = Math.round(surf(l.from, l.x));
        ctx.fillStyle = "rgba(0,0,0,0.3)";
        ctx.fillRect(l.x - 2, top + 1, 1, bot - top);
        ctx.fillRect(l.x + 4, top + 1, 1, bot - top);
        ctx.fillStyle = col;
        ctx.fillRect(l.x - 3, top, 1, bot - top);
        ctx.fillStyle = mixHex(col, "#000000", 0.35);
        ctx.fillRect(l.x + 3, top, 1, bot - top);
        for (let y = top + 2; y < bot; y += 4) {
          ctx.fillStyle = "rgba(0,0,0,0.3)";
          ctx.fillRect(l.x - 2, y + 1, 5, 1);
          ctx.fillStyle = col;
          ctx.fillRect(l.x - 2, y, 5, 1);
        }
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
      // THE BONG (in his right hand): a glass tube with green water. It gets taller every level.
      if (k.phase === "bong" || k.phase === "idle") {
        const big = bongSize();
        const bx = 17;
        const tube = 12 + big; // the tube's height
        const by = 16 - tube;
        const hitting = k.phase === "bong" && k.t > BONG_TIME * 0.4;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = "#bfe9ff";
        ctx.fillRect(bx, by, 4, tube); // the tube
        ctx.fillRect(bx - 1, 13, 6, 4); // the bottom
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#3fc24a";
        ctx.fillRect(bx, 13, 4, 3); // the water
        ctx.fillStyle = "#c08a4a";
        ctx.fillRect(bx + 4, 10, 2, 1); // the bowl
        ctx.fillRect(bx + 5, 9, 1, 1);
        if (hitting) {
          // mouth on the tube + the lighter flame on the bowl
          ctx.fillStyle = "#ff8ad8";
          ctx.fillRect(bx - 2, by, 2, 2);
          ctx.fillStyle = Math.floor(s.clock * 20) % 2 ? "#ffd84a" : "#ff7a00";
          ctx.fillRect(bx + 6, 7, 1, 2);
        }
      }
      ctx.restore();
      if (k.phase === "bong" && k.t > BONG_TIME * 0.5) drawText(ctx, fontFamily, bongSize() >= 4 ? "BONNNG!!" : "BONG!", kx + 52, ky + 2, "#c8f0ff", 8, "left");
      if (angry) drawText(ctx, fontFamily, "OINK!", kx + 52, ky + 2, "#ff6a6a", 8, "left");
    };
    const drawDude = (c: CanvasRenderingContext2D, x: number, y: number, skin: string) => {
      const p = s.p;
      const frame = Math.floor(p.walkT * 8) % 2;
      const rows = p.climb >= 0 ? DUDE_CLIMB[frame] : p.air ? DUDE[1] : DUDE[frame];
      if (p.climb < 0) {
        c.fillStyle = "rgba(0,0,0,0.35)";
        c.fillRect(Math.round(x) - 3, Math.round(p.air ? surf(p.L, x) : y), 7, 1);
      }
      c.globalAlpha = skin === "ghost" ? 0.7 : 1;
      drawPixels(c, rows, x - 4, y - 12, dudeColors(skin), p.climb < 0 && p.face < 0);
      c.globalAlpha = 1;
      // SILVER: a little star twinkles on the mohawk when it glints
      if (skin === "gold" && silverGlow(s.clock) > 0.75) {
        c.fillStyle = "#ffffff";
        c.fillRect(Math.round(x) + 1, Math.round(y) - 15, 1, 3);
        c.fillRect(Math.round(x), Math.round(y) - 14, 3, 1);
      }
      // holding THE LIGHTER: a flame in front of him (blinks when it's about to run out)
      if (s.lit > 0 && (s.lit > 1.5 || Math.floor(s.clock * 8) % 2 === 0)) {
        const fx = x + p.face * 6;
        const fy = y - 10 + Math.round(Math.sin(s.clock * 18));
        drawPixels(c, ["..Y..", ".YOY.", "YOROY", ".ORO.", "..S.."], fx - 2, fy, { Y: "#ffd84a", O: "#ff7a00", R: "#ff3b1a", S: "#c8c8d4" });
        if (Math.random() < 0.5) s.parts.push({ x: fx + rand(-2, 2), y: fy, vx: rand(-10, 10), vy: rand(-30, -10), life: 0.3, max: 0.3, color: FIRE[Math.floor(Math.random() * 3)], size: 1 });
      }
    };
    // the shop's preview box + the SHOP panel
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = WORLDS[0].bg;
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
      } else if (id === "up:lighter") {
        drawPixels(c, LIGHTER, -2, -4 + Math.round(Math.sin(t * 4)), LIGHTER_COLORS);
      } else {
        const frame = Math.floor(t * (id === "up:speed" ? 14 : 6)) % 2;
        drawPixels(c, DUDE[frame], -4, -6, dudeColors(skin));
      }
      c.restore();
    };

    const draw = () => {
      const lk = look();
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      const sides: [number, number, World][] = lk.style === "split" ? [[-4, W / 2 + 4, lk.a], [W / 2, W / 2 + 4, lk.b]] : [[-4, W + 8, lk.a]];
      for (const [x0, ww, w] of sides) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, -4, ww, H + 8);
        ctx.clip();
        const sky = ctx.createLinearGradient(0, 0, 0, H);
        sky.addColorStop(0, mixHex(w.bg, "#000000", 0.5));
        sky.addColorStop(0.65, w.bg);
        sky.addColorStop(1, mixHex(w.bg, w.girder, 0.3));
        ctx.fillStyle = sky;
        ctx.fillRect(-4, -4, W + 8, H + 8);
        // fluffy clouds drifting by (like the PINK CLOUDS zone in PINKMANE VOID), in this level's colour
        for (let i = 0; i < 6; i++) {
          const cx = ((((hash(i + 60) * 400 - s.clock * (2 + (i % 3))) % (W + 80)) + W + 80) % (W + 80)) - 60;
          const cy = 14 + Math.floor(hash(i + 70) * 46);
          const sc = 0.7 + hash(i + 80) * 0.5;
          const puff = (col: string, grow: number, dy: number) => {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(cx + 14 * sc, cy + 10 * sc + dy, 10 * sc + grow, 0, Math.PI * 2);
            ctx.arc(cx + 28 * sc, cy + 6 * sc + dy, 13 * sc + grow, 0, Math.PI * 2);
            ctx.arc(cx + 42 * sc, cy + 10 * sc + dy, 10 * sc + grow, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(cx + 12 * sc - grow, cy + 10 * sc + dy, 32 * sc + grow * 2, 10 * sc + grow);
          };
          puff(mixHex(w.bg, w.girder, 0.16), 0, 1); // soft shadow underneath
          puff(mixHex(w.bg, w.girder, 0.24), 0, 0);
          ctx.fillStyle = mixHex(w.bg, w.girder, 0.34); // a little shine on top
          ctx.fillRect(Math.round(cx + 24 * sc), Math.round(cy + 1 * sc), 3, 1);
        }
        // rolling hills + swaying weed leaves (like PINKMANE VOID), in this level's colours
        const leafCol = (i: number) => (lk.style === "stripe" && i % 2 ? lk.b : w).girder;
        const hill = (base: number, amp: number, len: number, speed: number, col: string) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(-4, H + 4);
          for (let x = -4; x <= W + 4; x += 4) ctx.lineTo(x, base + Math.sin((x + s.clock * speed) / len) * amp + Math.sin((x + s.clock * speed) / (len * 0.43)) * amp * 0.4);
          ctx.lineTo(W + 4, H + 4);
          ctx.fill();
        };
        // far leaves (small, faint, slow)
        for (let i = 0; i < 10; i++) {
          const x = ((i * 37 + hash(i) * 20 - s.clock * 3) % (W + 40) + W + 40) % (W + 40) - 20;
          drawLeaf(ctx, x, 98 + hash(i + 3) * 10, 13 + hash(i + 7) * 5, Math.sin(s.clock * 0.9 + i * 1.3) * 0.08, leafCol(i), 0.16);
        }
        hill(100, 6, 46, 3, mixHex(w.bg, w.girder, 0.1));
        // near leaves (bigger, stronger, a bit faster)
        for (let i = 0; i < 7; i++) {
          const x = ((i * 53 + hash(i + 20) * 24 - s.clock * 6) % (W + 60) + W + 60) % (W + 60) - 30;
          drawLeaf(ctx, x, 112 + hash(i + 30) * 10, 20 + hash(i + 40) * 7, Math.sin(s.clock * 1.2 + i * 2.1) * 0.1, leafCol(i + 1), 0.24);
        }
        hill(122, 5, 60, 6, mixHex(w.bg, w.girder, 0.16));
        ctx.restore();
      }
      if (lk.style === "split") {
        for (let y = 0; y < H; y += 2) {
          ctx.fillStyle = (y / 2) % 2 ? lk.a.girder : lk.b.girder;
          ctx.globalAlpha = 0.3;
          ctx.fillRect(W / 2 - 1, y, 2, 2);
        }
        ctx.globalAlpha = 1;
      }
      drawLadders();
      drawGirders();
      drawStash();
      map().nugs.forEach((n, i) => {
        if (s.nugs[i]) return;
        drawPixels(ctx, NUG, n.x - 2, surf(n.L, n.x) - 7 + Math.round(Math.sin(s.clock * 5 + i)), { G: "#6fdc5a", L: "#ffffff" });
      });
      if (!s.lighterTaken) {
        const lt = map().lighter;
        drawPixels(ctx, LIGHTER, lt.x - 2, surf(lt.L, lt.x) - 10 + Math.round(Math.sin(s.clock * 4)), LIGHTER_COLORS);
      }
      drawKong();
      for (const f of s.flames) drawPixels(ctx, FLAME[Math.floor(s.clock * 8) % 2], f.x - 3, f.y - 8, FLAME_COLORS);
      for (const sp of s.speakers) drawSpeaker(ctx, sp.x, sp.y, sp.spin, sp.wild);
      if (s.mode === "running" || s.mode === "clear" || s.mode === "ready") drawDude(ctx, s.p.x, s.p.y, arc.shop.wearingName("skin"));
      // sparks + bubbles first, then BEARMANPIG's smoke on top of everything
      for (const pass of [false, true]) {
        for (const q of s.parts) {
          if (!!q.top !== pass) continue;
          ctx.globalAlpha = Math.max(0, Math.min(1, (q.life / q.max) * (q.grow ? 0.7 : 1)));
          ctx.fillStyle = q.color;
          const sz = Math.round(q.size);
          ctx.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), sz, sz);
        }
      }
      ctx.globalAlpha = 1;
      // the smoke that hangs around (it gets worse every level)
      if (s.haze > 0.01) {
        ctx.fillStyle = `rgba(200,200,215,${s.haze})`;
        ctx.fillRect(0, 0, W, H);
      }
      // glows (light from the stash, nugs, lighter, fire)
      const glow = (x: number, y: number, r: number, rgb: string, a: number) => {
        const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, `rgba(${rgb},${a})`);
        gr.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      };
      ctx.globalCompositeOperation = "lighter";
      glow(STASH_X, 14, 26, "255,215,0", 0.35 + 0.1 * Math.sin(s.clock * 4));
      map().nugs.forEach((n, i) => {
        if (!s.nugs[i]) glow(n.x, surf(n.L, n.x) - 5, 9, "111,220,90", 0.35);
      });
      if (!s.lighterTaken) {
        const lt = map().lighter;
        glow(lt.x, surf(lt.L, lt.x) - 8, 12, "255,140,40", 0.4);
      }
      for (const f of s.flames) glow(f.x, f.y - 4, 18, "255,110,30", 0.5);
      for (const sp of s.speakers) if (sp.wild) glow(sp.x, sp.y - 4, 10, "255,95,210", 0.4);
      if (s.lit > 0) glow(s.p.x + s.p.face * 6, s.p.y - 8, 22, "255,160,40", 0.45);
      ctx.globalCompositeOperation = "source-over";
      // dark corners + old-TV lines
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
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
        // THE LIGHTER's time left
        if (s.lit > 0) {
          const max = LIGHTER_TIME + arc.shop.lvl("lighter") * 2;
          ctx.fillStyle = INK;
          ctx.fillRect(140, 133, 42, 6);
          ctx.fillStyle = "#ff7a00";
          ctx.fillRect(141, 134, Math.round((40 * s.lit) / max), 4);
        }
      }
      // the level's name at the start of a level
      if (s.mode === "running" && s.levelT < 2.2) {
        drawText(ctx, fontFamily, `LEVEL ${s.level}`, W / 2, 52, "#ffffff", 16);
        drawText(ctx, fontFamily, `${map().name}  ·  ${lk.name}`, W / 2, 72, KIT.lilac);
        if (s.level === WILD_FROM) drawText(ctx, fontFamily, "WATCH OUT: WILD SPEAKERS!", W / 2, 84, "#ff5fd2");
        if (s.level === FIRE_FROM) drawText(ctx, fontFamily, "WATCH OUT: FIRE!", W / 2, 84, "#ff7a00");
      }
      if (s.mode === "clear" && s.t > 0.3) {
        drawText(ctx, fontFamily, "STASH SECURED!", W / 2, 54, GOLD, 16);
        drawText(ctx, fontFamily, `LEVEL ${s.level + 1} NEXT`, W / 2, 76, "#ffffff");
      }
      if (s.mode === "running" && s.runT < 4 && s.level === 1 && s.levelT >= 2.2) {
        drawText(ctx, fontFamily, isTouch() ? "PAD = WALK + CLIMB   A / TAP = JUMP" : "← → WALK   ↑ ↓ CLIMB   SPACE = JUMP", W / 2, 100, "#ffffff");
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "CLIMB TO THE STASH",
          lines: [
            [isTouch() ? "PAD = WALK + CLIMB" : "← → WALK  ↑ ↓ CLIMB", "#ffffff"],
            [isTouch() ? "A / TAP = JUMP" : "SPACE = JUMP", KIT.lilac],
            ["GRAB THE LIGHTER!", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${pad(top.score)}` : s.best > 0 ? `BEST ${pad(s.best)}` : undefined,
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
        background: WORLDS[0].bg,
        touchAction: "manipulation",
        cursor: "pointer",
      }}
    />
    <ScorePanel game="kong" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
