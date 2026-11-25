"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, silverGlow, drawOverScreen, drawStartScreen, drawText, makeArcade, type Arcade, type ShopRow } from "./PinkShop";
import { isPhoneOrTablet } from "./device";

// PINK BOMBER: Bomberman, PINKMANE style. Drop BOMBS, blow up the speaker boxes, blow up the piglets + haters.
// When every enemy is gone THE STASH opens (it's hidden under one of the speakers): walk onto it = next level.
// The little piglet top right shows how many enemies are still alive.
//   ← → ↑ ↓ (W A S D) = walk      SPACE / OK / A / tap = drop a bomb (and start)
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
//
// POWER-UPS (inside some speakers):  +BOMB = one more bomb at once   FIRE = bigger blast   SHOES = faster   NUG = money
// ENEMIES:  PIGLET = walks around   HATER (grey cloud, from level 3) = follows you   BOAR (from level 5) = fast
// Every level gets a new colour, more enemies and more speakers. Don't stand in your own blast!
// Points: speaker 10, piglet 100, hater 200, boar 400, power-up 50, the time left x10 when you clear a level.
// MONEY: NUGS. 2 a piglet, 3 a hater, 5 a boar, 5 a nug power-up, 10 a cleared level.
// ONLINE TOP 10: board id "bomber" (see Scoreboard.tsx and app/api/scores/shared.ts).

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
type Bomb = { x: number; y: number; t: number; range: number; pass: boolean; gone: boolean };
type Flame = { x: number; y: number; t: number; kind: "c" | "h" | "v" };
type Kind = "piglet" | "hater" | "boar";
// dead: 0 = alive, above 0 = blowing up (counts down), gone = finished blowing up
type Enemy = { kind: Kind; x: number; y: number; tx: number; ty: number; dx: number; dy: number; wait: number; dead: number; gone: boolean; face: number };
type PowerId = "bomb" | "fire" | "speed" | "nug";
type Power = { x: number; y: number; id: PowerId; t: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; smoke?: boolean };
type Popup = { x: number; y: number; text: string; life: number; color: string };

const GAME_TITLE = "PINK BOMBER";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;
// The board: 21 x 9 tiles of 14 pixels (the outside ring + every 2nd tile inside are walls)
const T = 14;
const COLS = 21;
const ROWS = 9;
const OX = Math.floor((W - COLS * T) / 2); // where the board starts
const OY = H - ROWS * T - 4;

// ---------- EASY TUNING ----------
const START_LIVES = 3;
const START_BOMBS = 1; // bombs you can have out at once
const START_FIRE = 1; // how many tiles the blast reaches
const SPEED = 3.4; // tiles a second (each SHOES adds 0.5)
const MAX_BOMBS = 8;
const MAX_FIRE = 8;
const MAX_SPEED_UPS = 4;
const FUSE = 2.2; // seconds until a bomb goes off
const FLAME_TIME = 0.5;
const LEVEL_TIME = 160; // seconds per level
const BOX_CHANCE = 0.5; // how full of speakers the board is on level 1 (a bit more every level)
const POWER_CHANCE = 0.28; // chance a speaker has a power-up inside
const ENEMY_SPEED: Record<Kind, number> = { piglet: 1.6, hater: 1.8, boar: 2.8 };
const ENEMY_POINTS: Record<Kind, number> = { piglet: 100, hater: 200, boar: 400 };
const ENEMY_NUGS: Record<Kind, number> = { piglet: 2, hater: 3, boar: 5 };

// Saved in the visitor's browser
const BEST_KEY = "pinkbomber-best";
const FX_KEY = "pinkbomber-fx";
const SHOP_KEY = "pinkbomber-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const INK = "#0d0d12";
const PINK = "#d63cc8";
const GOLD = "#ffd700";
const FIRE = ["#ffd84a", "#ff7a00", "#ff3b1a", "#ffffff"];
const SMOKE = ["#9a9aa8", "#b8b8c4", "#d4d4dc"];

// A new colour every level: floor, wall, wall edge, wall shine
type World = { name: string; floor: string; wall: string; edge: string };
const WORLDS: World[] = [
  { name: "PINK", floor: "#1c0f2a", wall: "#d63cc8", edge: "#8a1f86" },
  { name: "TOXIC", floor: "#0b1d10", wall: "#3fc24a", edge: "#1b6b25" },
  { name: "ICE", floor: "#0c1a2e", wall: "#7fd0ff", edge: "#2a7ab0" },
  { name: "VOLCANO", floor: "#1f0906", wall: "#ff6a1a", edge: "#8a2200" },
  { name: "SILVER", floor: "#14161e", wall: "#d4d8e4", edge: "#6a6e80" },
  { name: "PURPLE", floor: "#120a26", wall: "#9a5cff", edge: "#4a2a9a" },
  { name: "CHERRY", floor: "#22060e", wall: "#ff3b5c", edge: "#8a1028" },
  { name: "OCEAN", floor: "#04161c", wall: "#1ad8c8", edge: "#0a6a64" },
  { name: "MINT", floor: "#0e1c18", wall: "#8affc8", edge: "#2a8a6a" },
  { name: "BUBBLEGUM", floor: "#24101e", wall: "#ff9ad8", edge: "#b04a8a" },
];

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
  { kind: "item", id: "up:bombs", name: "EXTRA BOMB", prices: [150, 400], info: ["START WITH ONE MORE BOMB", ""] },
  { kind: "item", id: "up:fire", name: "BIG BLAST", prices: [120, 300], info: ["YOUR BLAST STARTS BIGGER", ""] },
  { kind: "item", id: "up:life", name: "EXTRA LIFE", prices: [150, 400], info: ["START WITH ONE MORE LIFE", ""] },
  { kind: "item", id: "up:speed", name: "FAST SHOES", prices: [100, 250], info: ["START A BIT FASTER", ""] },
  { kind: "head", label: "MOHAWKS" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} MOHAWK`, prices: [k.price], wear: true, info: [`PINKMANE WITH A ${k.name} MOHAWK`, ""] })),
  { kind: "back" },
];

// ---------- pictures (P = mohawk, D = mohawk dark, Y = face, W = white, K = black, B = clothes) ----------
const DUDE = [
  ["..P.P.P..", "..DPPP...", "..YYYYY..", "..YWKYK..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "..BB.BB..", "..BB.BB..", ".BB...BB."],
  ["..P.P.P..", "..DPPP...", "..YYYYY..", "..YWKYK..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "...BBB...", "..BB.BB..", "..B...B.."],
];
// walking up: from the back
const DUDE_BACK = [
  ["..P.P.P..", "..DPPP...", "..PPPPP..", "..YYYYY..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "..BB.BB..", "..BB.BB..", ".BB...BB."],
  ["..P.P.P..", "..DPPP...", "..PPPPP..", "..YYYYY..", "..YYYYY..", "...YYY...", "..BBBBB..", ".YBBBBBY.", "..BBBBB..", "...BBB...", "..BB.BB..", "..B...B.."],
];
// PIGLET (10 x 9): P = pink, D = dark pink, K = black, W = white
const PIGLET = [
  [".P......P.", ".PPPPPPPP.", "PPKWPPWKPP", "PPPPPPPPPP", "PPPDDDDPPP", "PPPDKKDPPP", ".PPPPPPPP.", ".PP....PP.", ".D......D."],
  [".P......P.", ".PPPPPPPP.", "PPKWPPWKPP", "PPPPPPPPPP", "PPPDDDDPPP", "PPPDKKDPPP", ".PPPPPPPP.", "..PP..PP..", "..D....D.."],
];
const PIGLET_COLORS: Record<string, string> = { P: "#ff8ad8", D: "#b04a8a", K: INK, W: "#ffffff" };
// BOAR (fast): brown fur with tusks
const BOAR_COLORS: Record<string, string> = { P: "#8a5230", D: "#ffffff", K: INK, W: "#ff3b3b" };
// HATER: a grumpy grey cloud (like in PINKMANE VOID)
const HATER = [
  ["...GGGG...", ".GGGGGGGG.", "GGGLGGGLGG", "GGKKGGKKGG", "GGGGGGGGGG", "GGGKKKKGGG", "GGKGGGGKGG", ".GGGGGGGG.", "..G.GG.G.."],
  ["...GGGG...", ".GGGGGGGG.", "GGGLGGGLGG", "GGKKGGKKGG", "GGGGGGGGGG", "GGGKKKKGGG", "GGKGGGGKGG", ".GGGGGGGG.", ".G..GG..G."],
];
const HATER_COLORS: Record<string, string> = { G: "#9a9aa8", L: "#c8c8d4", K: INK };
const NUG = [".GG.", "GGGG", "GLGG", ".GG."];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
const hexRgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixHex = (a: string, b: string, t: number) => {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(",")})`;
};

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
// a round black bomb (x, y = the middle of its tile). It flashes red faster and faster as the fuse burns down.
const BOMB = [
  "...OOOO...",
  ".OOKKKKOO.",
  ".OKHHKKKO.",
  "OKHHKKKKKO",
  "OKHKKKKKKO",
  "OKKKKKKKKO",
  "OKKKKKKKKO",
  ".OKKKKKKO.",
  ".OOKKKKOO.",
  "...OOOO...",
];
function drawBomb(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, fuse: number) {
  const left = fuse / FUSE; // 1 = just dropped, 0 = about to blow
  const flash = Math.sin(t * (8 + (1 - left) * 30)) > 0.3 && left < 0.95;
  const bounce = flash ? 1 : 0;
  const X = Math.round(x) - 5;
  const Y = Math.round(y) - 4 - bounce;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(X + 1, Math.round(y) + 6, 9, 1);
  drawPixels(ctx, BOMB, X, Y, { O: INK, K: flash ? "#8a1f2a" : "#2a2a36", H: flash ? "#ff8a8a" : "#9a9ab0" });
  // the cap + the fuse
  ctx.fillStyle = "#8a8aa0";
  ctx.fillRect(X + 4, Y - 1, 3, 1);
  ctx.fillStyle = "#c08a4a";
  ctx.fillRect(X + 6, Y - 2, 1, 1);
  ctx.fillRect(X + 7, Y - 3, 1, 1);
  // the spark
  ctx.fillStyle = Math.floor(t * 20) % 2 ? "#ffd84a" : "#ff7a00";
  ctx.fillRect(X + 7 + (Math.floor(t * 14) % 2), Y - 5, 2, 2);
  if (Math.floor(t * 10) % 3 === 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(X + 9, Y - 6, 1, 1);
  }
}
// a speaker box (the breakable blocks). x, y = top left of the tile.
function drawBox(ctx: CanvasRenderingContext2D, x: number, y: number, w: World, crack = 0) {
  ctx.fillStyle = INK;
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = "#2c2c38";
  ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
  ctx.fillStyle = "#44445a";
  ctx.fillRect(x + 1, y + 1, T - 2, 1);
  // tweeter + woofer (in the level's colour)
  ctx.fillStyle = w.wall;
  ctx.fillRect(x + 6, y + 2, 2, 2);
  ctx.fillRect(x + 4, y + 6, 6, 5);
  ctx.fillRect(x + 3, y + 7, 8, 3);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 6, y + 7, 2, 3);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 5, y + 7, 1, 1);
  if (crack > 0) {
    ctx.fillStyle = `rgba(255,216,74,${crack})`;
    ctx.fillRect(x, y, T, T);
  }
}

export default function BomberGame({ actionSignal, fontFamily, muted, touch = false }: Props) {
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
    // the direction pressed last wins (so turning a corner while holding two keys feels right)
    let lastDir: "left" | "right" | "up" | "down" | null = null;

    const s = {
      mode: "ready" as Mode,
      t: 0,
      clock: 0,
      levelT: 0,
      playT: 0, // seconds this whole game has lasted (for the Top 10's cheat check)
      time: LEVEL_TIME,
      level: 1,
      lives: START_LIVES,
      score: 0,
      best: 0,
      run: 0, // nugs (money) this game
      newBest: false,
      grid: [] as number[][], // 0 = floor, 1 = wall, 2 = speaker box
      cracking: [] as { x: number; y: number; t: number }[], // speakers being blown up
      p: { x: 1, y: 1, face: 1, dir: "down" as "left" | "right" | "up" | "down", walkT: 0 },
      bombsMax: START_BOMBS,
      fire: START_FIRE,
      speedUps: 0,
      bombs: [] as Bomb[],
      flames: [] as Flame[],
      enemies: [] as Enemy[],
      powers: [] as Power[],
      exit: { x: 0, y: 0, shown: false },
      parts: [] as Particle[],
      pops: [] as Popup[],
      shake: 0,
      onLocked: false, // standing on THE STASH while it's still locked
      lockedMsg: 0, // seconds the "KILL ALL ENEMIES FIRST" message still shows
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}
    const world = () => WORLDS[(s.level - 1) % WORLDS.length];

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
      drop: () => beep(220, 330, 0.06, 0.05, "square"),
      boom: () => {
        beep(160, 40, 0.45, 0.12, "sawtooth");
        beep(90, 30, 0.5, 0.1, "square", 0.02);
      },
      enemy: () => [700, 500, 300].forEach((f, i) => beep(f, f * 0.8, 0.06, 0.05, "square", i * 0.05)),
      power: () => [660, 880, 1320].forEach((f, i) => beep(f, f, 0.06, 0.05, "square", i * 0.05)),
      exit: () => [523, 784, 1047].forEach((f, i) => beep(f, f, 0.1, 0.05, "triangle", i * 0.09)),
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

    // ---------- the board ----------
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    const bombAt = (x: number, y: number) => s.bombs.find((b) => !b.gone && b.x === x && b.y === y);
    // can an enemy walk onto this tile?
    const open = (x: number, y: number) => inside(x, y) && s.grid[y][x] === 0 && !bombAt(x, y);
    // can the player walk onto this tile? (the bomb you just dropped doesn't block you until you've left it)
    const openForPlayer = (x: number, y: number) => {
      if (!inside(x, y) || s.grid[y][x] !== 0) return false;
      const b = bombAt(x, y);
      return !b || b.pass;
    };
    const tileX = (x: number) => OX + x * T;
    const tileY = (y: number) => OY + y * T;

    const buildLevel = () => {
      const L = s.level;
      const g: number[][] = [];
      for (let y = 0; y < ROWS; y++) {
        const row: number[] = [];
        for (let x = 0; x < COLS; x++) {
          const wall = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1 || (x % 2 === 0 && y % 2 === 0);
          row.push(wall ? 1 : 0);
        }
        g.push(row);
      }
      // speakers everywhere, except right around the start
      const fill = Math.min(0.7, BOX_CHANCE + (L - 1) * 0.02);
      const free: [number, number][] = [];
      for (let y = 1; y < ROWS - 1; y++)
        for (let x = 1; x < COLS - 1; x++) {
          if (g[y][x]) continue;
          if (x + y <= 3) continue; // the start corner stays empty
          if (Math.random() < fill) g[y][x] = 2;
          else free.push([x, y]);
        }
      s.grid = g;
      s.bombs = [];
      s.flames = [];
      s.powers = [];
      s.cracking = [];
      // THE STASH hides under one speaker, far from the start
      const boxes: [number, number][] = [];
      for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (g[y][x] === 2 && x + y > 8) boxes.push([x, y]);
      const e = boxes[Math.floor(Math.random() * boxes.length)] ?? [COLS - 2, ROWS - 2];
      if (g[e[1]][e[0]] !== 2) g[e[1]][e[0]] = 2;
      s.exit = { x: e[0], y: e[1], shown: false };
      // enemies, on empty tiles far from you
      const far = free.filter(([x, y]) => x + y >= 9);
      const count = Math.min(14, 3 + L);
      s.enemies = [];
      for (let i = 0; i < count && far.length; i++) {
        const k = Math.floor(Math.random() * far.length);
        const [x, y] = far.splice(k, 1)[0];
        let kind: Kind = "piglet";
        if (L >= 5 && i % 4 === 3) kind = "boar";
        else if (L >= 3 && i % 2 === 1) kind = "hater";
        s.enemies.push({ kind, x, y, tx: x, ty: y, dx: 0, dy: 0, wait: rand(0.3, 1), dead: 0, gone: false, face: 1 });
      }
      s.p = { x: 1, y: 1, face: 1, dir: "down", walkT: 0 };
      s.time = LEVEL_TIME;
      s.levelT = 0;
    };
    const newGame = () => {
      boardRef.current?.hide();
      s.level = 1;
      s.lives = START_LIVES + arc.shop.lvl("life");
      s.score = 0;
      s.run = 0;
      s.playT = 0;
      s.newBest = false;
      s.t = 0;
      s.parts = [];
      s.pops = [];
      s.bombsMax = START_BOMBS + arc.shop.lvl("bombs");
      s.fire = START_FIRE + arc.shop.lvl("fire");
      s.speedUps = arc.shop.lvl("speed");
      buildLevel();
    };

    const burst = (x: number, y: number, n: number, colors: string[], power = 60) => {
      for (let i = 0; i < n; i++) {
        const life = rand(0.3, 0.8);
        s.parts.push({ x, y, vx: rand(-power, power), vy: rand(-power * 1.2, power * 0.3), life, max: life, color: colors[Math.floor(Math.random() * colors.length)], size: 2 });
      }
    };
    const pop = (x: number, y: number, text: string, color: string) => s.pops.push({ x, y, text, life: 1, color });

    // drop a bomb where you stand
    const dropBomb = () => {
      const x = Math.round(s.p.x);
      const y = Math.round(s.p.y);
      if (s.bombs.filter((b) => !b.gone).length >= s.bombsMax || bombAt(x, y) || s.grid[y][x] !== 0) return;
      s.bombs.push({ x, y, t: FUSE, range: s.fire, pass: true, gone: false });
      sfx.drop();
    };

    // OK / SPACE / tap
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        s.mode = "running";
      } else if (s.mode === "running") dropBomb();
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
      burst(tileX(s.p.x) + T / 2, tileY(s.p.y) + T / 2, 30, [PINK, "#ffc800", "#ffffff", "#4a4a60"], 90);
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

    // a bomb goes off: a cross of fire. Speakers break, other bombs go off too (chain!)
    const explode = (b: Bomb) => {
      b.gone = true;
      sfx.boom();
      s.shake = Math.max(s.shake, 0.18);
      s.flames.push({ x: b.x, y: b.y, t: FLAME_TIME, kind: "c" });
      const cx = tileX(b.x) + T / 2;
      const cy = tileY(b.y) + T / 2;
      for (let i = 0; i < 10; i++) {
        const life = rand(0.8, 1.6);
        s.parts.push({ x: cx + rand(-4, 4), y: cy + rand(-4, 4), vx: rand(-14, 14), vy: rand(-22, -6), life, max: life, color: SMOKE[i % SMOKE.length], size: 3, smoke: true });
      }
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        for (let k = 1; k <= b.range; k++) {
          const x = b.x + dx * k;
          const y = b.y + dy * k;
          if (!inside(x, y) || s.grid[y][x] === 1) break;
          if (s.grid[y][x] >= 2) {
            // a speaker: it breaks (the fire stops here)
            if (s.grid[y][x] === 2) {
              s.grid[y][x] = 3; // 3 = breaking
              s.cracking.push({ x, y, t: 0.35 });
            }
            break;
          }
          s.flames.push({ x, y, t: FLAME_TIME, kind: dx ? "h" : "v" });
          const other = bombAt(x, y);
          if (other) {
            other.t = Math.min(other.t, 0.06);
            break;
          }
          // power-ups lying around burn up (THE STASH doesn't)
          s.powers = s.powers.filter((q) => !(q.x === x && q.y === y && q.t > 0.5));
        }
      }
    };

    const breakBox = (x: number, y: number) => {
      s.grid[y][x] = 0;
      s.score += 10;
      burst(tileX(x) + T / 2, tileY(y) + T / 2, 10, [world().wall, "#2c2c38", INK], 50);
      if (s.exit.x === x && s.exit.y === y) {
        s.exit.shown = true;
        return;
      }
      if (Math.random() < POWER_CHANCE) {
        const r = Math.random();
        const id: PowerId = r < 0.32 ? "bomb" : r < 0.64 ? "fire" : r < 0.8 ? "speed" : "nug";
        s.powers.push({ x, y, id, t: 0 });
      }
    };

    const killEnemy = (e: Enemy) => {
      e.dead = 0.6;
      s.score += ENEMY_POINTS[e.kind];
      s.run += ENEMY_NUGS[e.kind];
      const px = tileX(e.x) + T / 2;
      const py = tileY(e.y);
      pop(px, py, String(ENEMY_POINTS[e.kind]), "#ffffff");
      burst(px, py + 7, 14, e.kind === "hater" ? ["#9a9aa8", "#ffffff"] : e.kind === "boar" ? ["#8a5230", "#ffffff"] : ["#ff8ad8", "#ffffff"], 60);
      sfx.enemy();
    };

    const updatePlayer = (dt: number) => {
      const p = s.p;
      const dirs = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const;
      let want: keyof typeof dirs | null = null;
      if (lastDir && held[lastDir]) want = lastDir;
      else if (held.left) want = "left";
      else if (held.right) want = "right";
      else if (held.up) want = "up";
      else if (held.down) want = "down";
      if (!want) return;
      p.dir = want;
      const [dx, dy] = dirs[want];
      if (dx) p.face = dx;
      let step = (SPEED + Math.min(MAX_SPEED_UPS, s.speedUps) * 0.5) * dt;
      p.walkT += dt;
      if (dx) {
        const row = Math.round(p.y);
        const col = Math.round(p.x);
        // not lined up with the row: slide into it first (that's what makes corners easy)
        if (Math.abs(p.y - row) > 0.001) {
          if (!openForPlayer(col + dx, row) && Math.abs(p.x - col) < 0.01) return;
          const m = Math.min(step, Math.abs(p.y - row));
          p.y += Math.sign(row - p.y) * m;
          step -= m;
        }
        let nx = p.x + dx * step;
        if (!openForPlayer(col + dx, row)) nx = dx > 0 ? Math.min(nx, col) : Math.max(nx, col);
        p.x = nx;
      } else {
        const col = Math.round(p.x);
        const row = Math.round(p.y);
        if (Math.abs(p.x - col) > 0.001) {
          if (!openForPlayer(col, row + dy) && Math.abs(p.y - row) < 0.01) return;
          const m = Math.min(step, Math.abs(p.x - col));
          p.x += Math.sign(col - p.x) * m;
          step -= m;
        }
        let ny = p.y + dy * step;
        if (!openForPlayer(col, row + dy)) ny = dy > 0 ? Math.min(ny, row) : Math.max(ny, row);
        p.y = ny;
      }
    };

    const updateEnemies = (dt: number) => {
      const p = s.p;
      for (const e of s.enemies) {
        if (e.dead > 0) {
          e.dead -= dt;
          if (e.dead <= 0) e.gone = true;
          continue;
        }
        if (e.wait > 0) {
          e.wait -= dt;
          continue;
        }
        const sp = ENEMY_SPEED[e.kind] * (1 + Math.min(0.4, (s.level - 1) * 0.03)) * dt;
        const ddx = e.tx - e.x;
        const ddy = e.ty - e.y;
        const dist = Math.abs(ddx) + Math.abs(ddy);
        if (dist > sp) {
          e.x += Math.sign(ddx) * Math.min(sp, Math.abs(ddx));
          e.y += Math.sign(ddy) * Math.min(sp, Math.abs(ddy));
          continue;
        }
        // reached its tile: pick where to go next
        e.x = e.tx;
        e.y = e.ty;
        const opts = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].filter(([dx, dy]) => open(e.x + dx, e.y + dy));
        if (!opts.length) {
          e.wait = 0.3;
          continue;
        }
        let pick = opts[Math.floor(Math.random() * opts.length)];
        const straight = opts.find(([dx, dy]) => dx === e.dx && dy === e.dy);
        if (e.kind === "hater" && Math.random() < 0.65) {
          // haters come after you
          const tx = Math.round(p.x);
          const ty = Math.round(p.y);
          pick = opts.reduce((a, b) => (Math.abs(e.x + a[0] - tx) + Math.abs(e.y + a[1] - ty) <= Math.abs(e.x + b[0] - tx) + Math.abs(e.y + b[1] - ty) ? a : b));
        } else if (straight && Math.random() < 0.75) pick = straight;
        else if (opts.length > 1 && Math.random() < 0.8) {
          // don't just turn around (unless it has to)
          const notBack = opts.filter(([dx, dy]) => !(dx === -e.dx && dy === -e.dy));
          if (notBack.length) pick = notBack[Math.floor(Math.random() * notBack.length)];
        }
        e.dx = pick[0];
        e.dy = pick[1];
        if (e.dx) e.face = e.dx;
        e.tx = e.x + e.dx;
        e.ty = e.y + e.dy;
      }
      s.enemies = s.enemies.filter((e) => !e.gone);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      for (const q of s.parts) {
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        if (q.smoke) {
          q.vx *= 1 - 1.5 * dt;
          q.size = Math.min(7, q.size + dt * 4);
        } else q.vy += 120 * dt;
        q.life -= dt;
      }
      s.parts = s.parts.filter((q) => q.life > 0);
      for (const q of s.pops) {
        q.y -= 14 * dt;
        q.life -= dt;
      }
      s.pops = s.pops.filter((q) => q.life > 0);
      for (const c of s.cracking) {
        c.t -= dt;
        if (c.t <= 0) breakBox(c.x, c.y);
      }
      s.cracking = s.cracking.filter((c) => c.t > 0);
      for (const f of s.flames) f.t -= dt;
      s.flames = s.flames.filter((f) => f.t > 0);
      for (const q of s.powers) q.t += dt;

      if (s.mode === "running" || s.mode === "dying" || s.mode === "clear") s.playT += dt;
      if (s.mode === "dying") {
        if (s.t > 1.4) {
          s.lives -= 1;
          if (s.lives <= 0) gameOver();
          else {
            buildLevel();
            s.mode = "running";
          }
        }
        return;
      }
      if (s.mode === "clear") {
        if (s.t > 2.4) {
          s.level += 1;
          buildLevel();
          s.mode = "running";
        }
        return;
      }
      if (s.mode !== "running") return;
      s.levelT += dt;
      s.time -= dt;
      if (s.time <= 0) {
        s.time = 0;
        pop(W / 2, 60, "TIME UP!", "#ff6a6a");
        hitPlayer();
        return;
      }

      // bombs: the fuse burns down. Once you've walked off your bomb it blocks you too.
      for (const b of s.bombs) {
        if (b.gone) continue;
        if (b.pass && (Math.abs(s.p.x - b.x) >= 0.85 || Math.abs(s.p.y - b.y) >= 0.85)) b.pass = false;
        b.t -= dt;
        if (b.t <= 0) explode(b);
      }
      s.bombs = s.bombs.filter((b) => !b.gone);

      updatePlayer(dt);
      updateEnemies(dt);

      const p = s.p;
      const ptx = Math.round(p.x);
      const pty = Math.round(p.y);
      // fire
      for (const f of s.flames) {
        if (f.x === ptx && f.y === pty) {
          hitPlayer();
          return;
        }
        for (const e of s.enemies) if (e.dead === 0 && Math.round(e.x) === f.x && Math.round(e.y) === f.y) killEnemy(e);
      }
      // touching an enemy
      for (const e of s.enemies) {
        if (e.dead === 0 && Math.abs(e.x - p.x) < 0.62 && Math.abs(e.y - p.y) < 0.62) {
          hitPlayer();
          return;
        }
      }
      // power-ups
      for (const q of s.powers) {
        if (q.x !== ptx || q.y !== pty) continue;
        q.t = -99;
        s.score += 50;
        const px = tileX(q.x) + T / 2;
        const py = tileY(q.y);
        if (q.id === "bomb") {
          s.bombsMax = Math.min(MAX_BOMBS, s.bombsMax + 1);
          pop(px, py, "+BOMB", "#bfe9ff");
        } else if (q.id === "fire") {
          s.fire = Math.min(MAX_FIRE, s.fire + 1);
          pop(px, py, "FIRE+", "#ff7a00");
        } else if (q.id === "speed") {
          s.speedUps = Math.min(MAX_SPEED_UPS, s.speedUps + 1);
          pop(px, py, "SPEED+", "#7fd0ff");
        } else {
          s.run += 5;
          pop(px, py, "+5 NUGS", "#6fdc5a");
        }
        sfx.power();
      }
      s.powers = s.powers.filter((q) => q.t > -1);
      // THE STASH: open once every enemy is gone
      const alive = s.enemies.filter((e) => e.dead === 0).length;
      const onStash = s.exit.shown && ptx === s.exit.x && pty === s.exit.y;
      if (onStash && alive > 0 && !s.onLocked) {
        s.lockedMsg = 2;
        beep(200, 150, 0.12, 0.05, "square");
      }
      s.onLocked = onStash && alive > 0;
      if (s.lockedMsg > 0) s.lockedMsg -= dt;
      if (s.exit.shown && alive === 0 && ptx === s.exit.x && pty === s.exit.y) {
        const bonus = Math.floor(s.time) * 10;
        s.score += bonus;
        s.run += 10;
        pop(W / 2, 40, `TIME BONUS +${bonus}`, GOLD);
        burst(tileX(s.exit.x) + T / 2, tileY(s.exit.y) + T / 2, 30, [GOLD, "#ffffff", "#6fdc5a"], 70);
        s.mode = "clear";
        s.t = 0;
        sfx.clear();
      }
    };

    // ---------- drawing ----------
    const drawBoard = () => {
      const w = world();
      // floor: a soft checker
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const X = tileX(x);
          const Y = tileY(y);
          ctx.fillStyle = (x + y) % 2 ? w.floor : mixHex(w.floor, w.wall, 0.06);
          ctx.fillRect(X, Y, T, T);
        }
      // walls (with a shadow on the floor under them)
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          if (s.grid[y][x] !== 1) continue;
          const X = tileX(x);
          const Y = tileY(y);
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.fillRect(X + 2, Y + T, T - 2, 2);
          ctx.fillStyle = w.edge;
          ctx.fillRect(X, Y, T, T);
          ctx.fillStyle = w.wall;
          ctx.fillRect(X, Y, T, T - 3);
          ctx.fillStyle = mixHex(w.wall, "#ffffff", 0.45);
          ctx.fillRect(X, Y, T, 1);
          ctx.fillRect(X, Y, 1, T - 3);
          ctx.fillStyle = mixHex(w.wall, w.edge, 0.6);
          ctx.fillRect(X + 3, Y + 4, T - 6, 1);
          ctx.fillRect(X + 3, Y + 7, T - 6, 1);
        }
      // THE STASH (once it's out from under its speaker)
      if (s.exit.shown) {
        const open = s.enemies.every((e) => e.dead !== 0);
        const X = tileX(s.exit.x);
        const Y = tileY(s.exit.y);
        ctx.fillStyle = open ? `rgba(255,215,0,${0.35 + 0.2 * Math.sin(s.clock * 6)})` : "rgba(255,215,0,0.12)";
        ctx.fillRect(X + 1, Y + 1, T - 2, T - 2);
        drawPixels(ctx, ["..GGG..", ".GGLGG.", "GGGGGGG", "GGGLGGG", ".GGGGG.", "..GGG.."], X + 3, Y + 4 + (open ? Math.round(Math.sin(s.clock * 4)) : 0), { G: open ? GOLD : "#8a7a30", L: open ? "#ffffff" : "#b8a860" });
        if (!open && Math.floor(s.clock * 2) % 2) drawText(ctx, fontFamily, "!", X + T / 2, Y - 8, "#ff6a6a");
      }
      // speaker boxes
      for (let y = 0; y < ROWS; y++)
        for (let x = 0; x < COLS; x++) {
          const v = s.grid[y][x];
          if (v === 2) drawBox(ctx, tileX(x), tileY(y), w);
          else if (v === 3) {
            const c = s.cracking.find((q) => q.x === x && q.y === y);
            drawBox(ctx, tileX(x) + rand(-1, 1), tileY(y) + rand(-1, 1), w, c ? 1 - c.t / 0.35 : 1);
          }
        }
    };
    const drawPower = (q: Power) => {
      const X = tileX(q.x);
      const Y = tileY(q.y);
      const bob = Math.round(Math.sin(s.clock * 5 + q.x));
      ctx.fillStyle = INK;
      ctx.fillRect(X + 1, Y + 1 + bob, T - 2, T - 2);
      ctx.fillStyle = q.id === "bomb" ? "#2a7ab0" : q.id === "fire" ? "#8a2200" : q.id === "speed" ? "#4a2a9a" : "#1b6b25";
      ctx.fillRect(X + 2, Y + 2 + bob, T - 4, T - 4);
      if (q.id === "bomb") drawBomb(ctx, X + T / 2, Y + T / 2 + 1 + bob, s.clock, FUSE);
      else if (q.id === "fire")
        drawPixels(ctx, ["...Y...", "..YOY..", ".YOROY.", ".ORRRO.", "ORRWRRO", ".ORRRO.", "..OOO.."], X + 3, Y + 3 + bob, { Y: "#ffd84a", O: "#ff7a00", R: "#ff3b1a", W: "#ffffff" });
      else if (q.id === "speed")
        drawPixels(ctx, ["..WW....", ".WWWW...", ".WWWWW..", "WWWWWWWW", "WWWWWWWW", "KKKKKKKK"], X + 3, Y + 4 + bob, { W: "#7fd0ff", K: "#ffffff" });
      else drawPixels(ctx, NUG, X + 5, Y + 5 + bob, { G: "#6fdc5a", L: "#ffffff" });
      // a little shine
      if (Math.floor(s.clock * 3 + q.x) % 3 === 0) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(X + 2, Y + 2 + bob, 2, 1);
      }
    };
    const drawFlames = () => {
      for (const f of s.flames) {
        const X = tileX(f.x);
        const Y = tileY(f.y);
        const k = f.t / FLAME_TIME; // 1 = fresh, 0 = gone
        const wob = Math.sin(s.clock * 40 + f.x + f.y) > 0 ? 1 : 0;
        const thick = Math.round(4 + k * 6) + wob;
        ctx.globalAlpha = Math.min(1, k * 2);
        const band = (col: string, th: number) => {
          ctx.fillStyle = col;
          if (f.kind === "h" || f.kind === "c") ctx.fillRect(X, Y + (T - th) / 2, T, th);
          if (f.kind === "v" || f.kind === "c") ctx.fillRect(X + (T - th) / 2, Y, th, T);
        };
        band("#ff3b1a", thick + 2);
        band("#ff7a00", thick);
        band("#ffd84a", Math.max(2, thick - 4));
        band("#ffffff", Math.max(1, thick - 7));
        ctx.globalAlpha = 1;
      }
    };
    const drawEnemy = (e: Enemy) => {
      const X = tileX(e.x) + T / 2;
      const Y = tileY(e.y) + T - 2;
      const frame = Math.floor(s.clock * 6 + e.x) % 2;
      if (e.dead > 0) {
        ctx.globalAlpha = Math.max(0, e.dead / 0.6);
        if (Math.floor(e.dead * 20) % 2) {
          ctx.globalAlpha = 1;
          return;
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(Math.round(X) - 4, Math.round(Y) + 1, 9, 1);
      if (e.kind === "hater") drawPixels(ctx, HATER[frame], X - 5, Y - 9 - (frame ? 1 : 0), HATER_COLORS, e.face < 0);
      else drawPixels(ctx, PIGLET[frame], X - 5, Y - 9, e.kind === "boar" ? BOAR_COLORS : PIGLET_COLORS, e.face < 0);
      ctx.globalAlpha = 1;
    };
    const drawDude = (c: CanvasRenderingContext2D, x: number, y: number, skin: string, dir: string, walk: number, face: number) => {
      const frame = Math.floor(walk * 8) % 2;
      const rows = dir === "up" ? DUDE_BACK[frame] : DUDE[frame];
      c.fillStyle = "rgba(0,0,0,0.35)";
      c.fillRect(Math.round(x) - 3, Math.round(y), 7, 1);
      c.globalAlpha = skin === "ghost" ? 0.7 : 1;
      drawPixels(c, rows, x - 4, y - 12, dudeColors(skin), face < 0);
      c.globalAlpha = 1;
      // SILVER: a little star twinkles on the mohawk when it glints
      if (skin === "gold" && silverGlow(s.clock) > 0.75) {
        c.fillStyle = "#ffffff";
        c.fillRect(Math.round(x) + 1, Math.round(y) - 15, 1, 3);
        c.fillRect(Math.round(x), Math.round(y) - 14, 3, 1);
      }
    };
    // the shop's preview box + the SHOP panel
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = WORLDS[0].floor;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      c.save();
      c.translate(cx, cy);
      c.scale(2, 2);
      if (id === "up:bombs") {
        drawBomb(c, -5, 2, t, FUSE * (0.5 + 0.5 * Math.sin(t)));
        drawBomb(c, 5, 2, t + 0.3, FUSE);
      } else if (id === "up:fire") {
        drawPixels(c, ["...Y...", "..YOY..", ".YOROY.", ".ORRRO.", "ORRWRRO", ".ORRRO.", "..OOO.."], -3, -4 + Math.round(Math.sin(t * 6)), { Y: "#ffd84a", O: "#ff7a00", R: "#ff3b1a", W: "#ffffff" });
      } else if (id === "up:life") {
        for (let i = 0; i < 3; i++) drawPixels(c, DUDE[0].slice(0, 6), -14 + i * 9, -3 + Math.round(Math.sin(t * 4 + i)), dudeColors(skin));
      } else {
        const frame = Math.floor(t * (id === "up:speed" ? 14 : 6)) % 2;
        drawPixels(c, DUDE[frame], -4, -6, dudeColors(skin));
      }
      c.restore();
    };

    const draw = () => {
      const w = world();
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = mixHex(w.floor, "#000000", 0.4);
      ctx.fillRect(-4, -4, W + 8, H + 8);
      drawBoard();
      for (const q of s.powers) drawPower(q);
      for (const b of s.bombs) drawBomb(ctx, tileX(b.x) + T / 2, tileY(b.y) + T / 2 + 1, s.clock, b.t);
      drawFlames();
      // everyone sorted by how far down they are, so the lower one is drawn in front
      const people: { y: number; draw: () => void }[] = s.enemies.map((e) => ({ y: e.y, draw: () => drawEnemy(e) }));
      if (s.mode === "running" || s.mode === "clear" || s.mode === "ready")
        people.push({ y: s.p.y, draw: () => drawDude(ctx, tileX(s.p.x) + T / 2, tileY(s.p.y) + T - 1, arc.shop.wearingName("skin"), s.p.dir, s.p.walkT, s.p.face) });
      people.sort((a, b) => a.y - b.y).forEach((q) => q.draw());
      for (const q of s.parts) {
        ctx.globalAlpha = Math.max(0, Math.min(1, (q.life / q.max) * (q.smoke ? 0.6 : 1)));
        ctx.fillStyle = q.color;
        const sz = Math.round(q.size);
        ctx.fillRect(Math.round(q.x - sz / 2), Math.round(q.y - sz / 2), sz, sz);
      }
      ctx.globalAlpha = 1;
      // light from the fire
      ctx.globalCompositeOperation = "lighter";
      for (const f of s.flames) {
        if (f.kind !== "c") continue;
        const x = tileX(f.x) + T / 2;
        const y = tileY(f.y) + T / 2;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 30);
        g.addColorStop(0, `rgba(255,140,40,${0.45 * (f.t / FLAME_TIME)})`);
        g.addColorStop(1, "rgba(255,140,40,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - 30, y - 30, 60, 60);
      }
      ctx.globalCompositeOperation = "source-over";
      for (const q of s.pops) drawText(ctx, fontFamily, q.text, q.x, q.y, q.color);
      // dark corners + old-TV lines
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
      ctx.restore();

      // HUD (on the strip above the board)
      if (s.mode !== "ready" && s.mode !== "over") {
        drawText(ctx, fontFamily, pad(s.score), 20, 4, "#ffffff", 8, "left");
        drawText(ctx, fontFamily, `LV${s.level}`, 64, 4, KIT.lilac, 8, "left");
        // the clock
        const late = s.time < 30 && Math.floor(s.clock * 3) % 2 === 1;
        drawPixels(ctx, [".KKK.", "KWWWK", "KWKWK", "KWWKK", ".KKK."], 100, 5, { K: late ? "#ff6a6a" : GOLD, W: INK });
        drawText(ctx, fontFamily, String(Math.ceil(s.time)), 107, 4, late ? "#ff6a6a" : GOLD, 8, "left");
        // bombs + fire + lives
        drawBomb(ctx, 146, 10, s.clock, FUSE);
        drawText(ctx, fontFamily, String(s.bombsMax), 153, 4, "#bfe9ff", 8, "left");
        drawPixels(ctx, ["..Y..", ".YOY.", "YOROY", ".ORO."], 166, 5, { Y: "#ffd84a", O: "#ff7a00", R: "#ff3b1a" });
        drawText(ctx, fontFamily, String(s.fire), 173, 4, "#ff7a00", 8, "left");
        // lives
        drawPixels(ctx, DUDE[0].slice(0, 6), 188, 3, dudeColors(arc.shop.wearingName("skin")));
        drawText(ctx, fontFamily, `x${s.lives}`, 198, 4, "#ffffff", 8, "left");
        // money
        nugIcon(ctx, 216, 3);
        drawText(ctx, fontFamily, String(s.run), 227, 4, "#6fdc5a", 8, "left");
        // ENEMIES LEFT (a little piglet + how many are still alive). Turns gold when they're all gone.
        const left = s.enemies.filter((e) => e.dead === 0).length;
        drawPixels(ctx, PIGLET[0], 260, 3, PIGLET_COLORS);
        drawText(ctx, fontFamily, String(left), 272, 4, left === 0 ? GOLD : "#ff8ad8", 8, "left");
        const alive = s.enemies.filter((e) => e.dead === 0).length;
        if (s.lockedMsg > 0 && s.mode === "running") drawText(ctx, fontFamily, `KILL ALL ENEMIES FIRST! (${alive} LEFT)`, W / 2, 128, "#ff6a6a");
        if (alive === 0 && !s.exit.shown && s.mode === "running" && Math.floor(s.clock * 2) % 2) drawText(ctx, fontFamily, "FIND THE STASH!", W / 2, 128, GOLD);
        if (alive === 0 && s.exit.shown && s.mode === "running" && Math.floor(s.clock * 2) % 2) drawText(ctx, fontFamily, "THE STASH IS OPEN!", W / 2, 128, GOLD);
      }
      if (s.mode === "running" && s.levelT < 2) {
        drawText(ctx, fontFamily, `LEVEL ${s.level}`, W / 2, 52, "#ffffff", 16);
        drawText(ctx, fontFamily, `${w.name}  ·  ${s.enemies.length} ENEMIES`, W / 2, 72, KIT.lilac);
        if (s.level === 3) drawText(ctx, fontFamily, "HATERS FOLLOW YOU!", W / 2, 84, "#c8c8d4");
        if (s.level === 5) drawText(ctx, fontFamily, "BOARS ARE FAST!", W / 2, 84, "#ff8a5a");
      }
      if (s.mode === "running" && s.level === 1 && s.levelT >= 2 && s.levelT < 6) {
        drawText(ctx, fontFamily, isTouch() ? "STICK = WALK   BOMB / TAP = BOMB" : "ARROWS = WALK   SPACE = BOMB", W / 2, 100, "#ffffff");
      }
      if (s.mode === "clear" && s.t > 0.3) {
        drawText(ctx, fontFamily, "STASH SECURED!", W / 2, 54, GOLD, 16);
        drawText(ctx, fontFamily, `LEVEL ${s.level + 1} NEXT`, W / 2, 76, "#ffffff");
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "BLOW UP THE PIGLETS",
          lines: [
            [isTouch() ? "STICK = WALK" : "ARROWS = WALK", "#ffffff"],
            [isTouch() ? "BOMB / TAP = BOMB" : "SPACE = BOMB", KIT.lilac],
            ["CLEAR THEM ALL, FIND THE STASH", KIT.lilac],
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
          title: "BLOWN UP",
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
    const dirOf = (k: string): "left" | "right" | "up" | "down" | null => {
      if (k === "ArrowLeft" || k === "a" || k === "A") return "left";
      if (k === "ArrowRight" || k === "d" || k === "D") return "right";
      if (k === "ArrowUp" || k === "w" || k === "W") return "up";
      if (k === "ArrowDown" || k === "s" || k === "S") return "down";
      return null;
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const d = dirOf(e.key);
      if (!d) return;
      if (!held[d]) lastDir = d;
      held[d] = true;
      if (s.mode === "running") e.preventDefault();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const d = dirOf(e.key);
      if (d) held[d] = false;
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    // ---------- taps: bomb / start (and the pause menu, shop, FX) ----------
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
          background: WORLDS[0].floor,
          touchAction: "manipulation",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="bomber" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
