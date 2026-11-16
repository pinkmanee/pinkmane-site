"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import {
  KIT,
  PAUSE_ROWS,
  SKIN_COLORS,
  drawFxIcon,
  drawFxSlider,
  drawOverScreen,
  drawPauseMenu,
  drawPinkShop,
  drawSidePanels,
  drawStartScreen,
  fxDrag,
  fxGain,
  fxKey,
  fxTap,
  leaveToGameMenu,
  loadFx,
  makeShop,
  newShopUi,
  panelShopHit,
  pauseKey,
  pauseTapRow,
  shopKey,
  shopTap,
  type ShopHooks,
  type ShopRow,
} from "./PinkShop";

// PINK HELL: a top-down 2D shooter, a bit like the old 90s demon shooters.
// Pinkmane is stuck in a hell dungeon and the demons come out of the glowing portals in waves.
//   W A S D / arrows   = move
//   MOUSE              = aim (the red crosshair), Pinkmane always looks where you aim
//   CLICK (hold)       = shoot
//   1 / 2 / 3, Q, wheel = switch weapon (PISTOL never runs out, SHOTGUN needs shells, the SMG from the shop never runs out)
//   ESC / P            = pause menu: RESUME / RESTART / SHOP / GAME MENU (it also pauses by itself if you switch to another tab or window)
//   ← → on the start screen = pick the map: THE DUNGEON or THE LAVA PIT
//   S / DOWN on the start + game over screen = PINK SHOP (skins, the SMG, upgrades). M = sounds, - / + = FX volume
// MONEY: SOULS. 1 for every demon you kill, 25 for BEARMANPIG.
// On phones + tablets (see HellPad.tsx): pink joystick = walk (Pinkmane looks the way he walks),
// FIRE button = shoot (hold it, it aims at the nearest demon by itself), GUN = switch weapon, PAUSE button at the top.
// You can also touch the game screen where you want to shoot.
// Demons:
//   IMP        = throws fireballs from far away (its eyes light up just before it throws)
//   PIG DEMON  = pink, fat, fast. Runs at you and bites
//   FIRE SKULL = small flying skull, dashes at you
//   BEARMANPIG = the boss every 5 waves, a giant floating head that flies through walls
// Dead demons sometimes drop SHELLS (yellow) or a MEDKIT (white with a red cross).
// ONLINE TOP 10: when you die, a good score lets you type your name (see Scoreboard.tsx). Board id: "hell".

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= start)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (here: switches weapon)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  muted: boolean;
};

const GAME_TITLE = "PINK HELL";
const BEST_KEY = "pinkmane-hell-best";
const MAP_KEY = "pinkmane-hell-map"; // which map you picked last
const FX_KEY = "pinkmane-hell-fx";
const SHOP_KEY = "pinkmane-hell-shop";
const SMG_COOLDOWN = 0.09; // the SMG from the shop: fast, a bit wild, never runs out

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const PLAYER_SPEED = 70; // pixels per second
const PLAYER_HP = 100;
const START_SHELLS = 16;
const PISTOL_COOLDOWN = 0.26; // seconds between pistol shots (smaller = faster)
const SHOTGUN_COOLDOWN = 0.75;
const SHOTGUN_PELLETS = 7;
const BULLET_SPEED = 380;
const LAVA_DAMAGE = 30; // per second while standing in lava
const DROP_CHANCE = 0.35; // chance a dead demon drops something
const SHELLS_PICKUP = 8;
const MEDKIT_HP = 20;
const DEMON_GAP = 14; // pigs + imps stay this far from you (they don't sit right on top of you any more)
const BITE_BOUNCE = 110; // how hard a pig bounces back after a bite (so you get a moment to run)
const BOSS_EVERY = 5; // the boss comes every this many waves
const DARKNESS = 0.62; // 0 = no darkness, 1 = pitch black outside your light
const LIGHT_RADIUS = 95; // how far your light reaches
const AUTO_AIM_RANGE = 200; // phones: while you hold FIRE, Pinkmane aims at the nearest demon he can see this close (pixels)

// ---------- Screen ----------
const W = 320;
const H = 150; // same 64:30 shape as the handheld screen
const BAR = 14; // the status bar at the bottom
const VW = W;
const VH = H - BAR; // the part of the screen that shows the game world
const T = 10; // size of one map tile in pixels

// ---------- The map ----------
// # = wall   . = floor   ~ = lava (hurts!)   S = demon portal   P = where you start
const MAP = [
  "########################################",
  "#S..........#..............#..........S#",
  "#...........#..............#...........#",
  "#..##.......#....~~~~~~....#.......##..#",
  "#..##............~~~~~~............##..#",
  "#...........#....~~~~~~....#...........#",
  "#...........#..............#...........#",
  "####....##########....##########....####",
  "#......................................#",
  "#....##......##..........##......##....#",
  "#....##......##..........##......##....#",
  "#......................................#",
  "#.........~~~~............~~~~.........#",
  "#S..................P.................S#",
  "#.........~~~~............~~~~.........#",
  "#......................................#",
  "#....##......##..........##......##....#",
  "#....##......##..........##......##....#",
  "#......................................#",
  "####....##########....##########....####",
  "#...........#..............#...........#",
  "#..##..............................##..#",
  "#..##.......#....######....#.......##..#",
  "#...........#..............#...........#",
  "#S..........#..............#..........S#",
  "########################################",
];
// THE LAVA PIT: the second map (pick it on the start screen). The same size as the first one.
const MAP2 = [
"########################################",
"#S.......~~~~..........~~~~..........S.#",
"#........~~~~..........~~~~............#",
"#...##...~~~~...####...~~~~...##.......#",
"#...##..........####..........##.......#",
"#......................................#",
"#..~~~~~~~...............~~~~~~~~......#",
"#..~~~~~~~...####...##...~~~~~~~~......#",
"#............####...##.................#",
"#.....##...............##....###.......#",
"#.....##.....~~~~~~....##....###.......#",
"#............~~~~~~....................#",
"#S......#....~~~~~~.....P......#......S#",
"#.......#....~~~~~~............#.......#",
"#............~~~~~~....................#",
"#....###...............###.....~~~~....#",
"#....###.......##......###.....~~~~....#",
"#..............##..............~~~~....#",
"#..~~~~...................~~~~.........#",
"#..~~~~.....###.....###...~~~~...##....#",
"#...........###.....###..........##....#",
"#......................................#",
"#...##.....~~~~~~.......~~~~~~...##....#",
"#...##.....~~~~~~.......~~~~~~...##....#",
"#S...................................S.#",
"########################################",
];
const MAPS = [
  { name: "THE DUNGEON", rows: MAP },
  { name: "THE LAVA PIT", rows: MAP2 },
];
const MW = MAP[0].length;
const MH = MAP.length;
const WW = MW * T; // world size in pixels
const WH = MH * T;

// ---------- Colours ----------
const RED = "#ff2a2a";
const PINK = "#ff5fd2";
const YELLOW = "#ffd400";

// ---------- Pixel sprites ----------
// Pinkmane from ABOVE, facing right (it gets turned towards the crosshair automatically)
// B = pink hair, D = dark pink, T = tee (shoulders), F = skin (arms), G = gun, A = black outline
const PLAYER_MAP = [
  "................",
  "...AAAA.........",
  "..ATTTTA........",
  "..ATTTTTAA......",
  ".ATTAAAATFFA....",
  ".ATABBDBAAFFA...",
  ".ATABDBBBBAFAAAA",
  ".ATABBBDBBAFGGGA",
  ".ATABDBBBBAFAAAA",
  ".ATABBDBAAFFA...",
  ".ATTAAAATFFA....",
  "..ATTTTTAA......",
  "..ATTTTA........",
  "...AAAA.........",
];
const PLAYER_COLORS: Record<string, string> = {
  A: "#111111",
  T: "#3a3a3a",
  B: "#d63cc8",
  D: "#8a1f86",
  F: "#ffc800",
  G: "#a0a0a0",
};
// Pinkmane's face for the status bar (front, eyes are drawn live so they can look left / right)
const FACE_HALF = [
  "..B.B.",
  ".BBBBB",
  "BBBDBB",
  "BBBBBB",
  "BBFFFF",
  "BFFFFF",
  "BFFFFF",
  "BFFFFF",
  ".FFFFF",
  ".FFFAA",
  ".AFFFF",
  "..AAAA",
];
const FACE_COLORS: Record<string, string> = { A: "#111111", B: "#d63cc8", D: "#8a1f86", F: "#ffc800" };

// ---------- the PINK SHOP ----------
type Weapon = 0 | 1 | 2; // 0 = pistol, 1 = shotgun, 2 = SMG (from the shop)
const HELL_SKINS = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 150 },
  { id: "ice", name: "ICE", price: 250 },
  { id: "fire", name: "FIRE", price: 400 },
  { id: "shadow", name: "SHADOW", price: 600 },
  { id: "gold", name: "GOLD", price: 800 },
];
const HELL_SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "SKINS" },
  ...HELL_SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} PINKMANE`, prices: [k.price], wear: true, info: [`${k.name} HAIR`, ""] })),
  { kind: "head", label: "GUNS" },
  { kind: "item", id: "gun:smg", name: "SMG", prices: [500], info: ["A MACHINE GUN: KEY 3 / Q / GUN", "SUPER FAST, NEVER RUNS OUT"] },
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:hp", name: "MORE HEALTH", prices: [100, 250, 500], info: ["+25 HEALTH EVERY LEVEL", ""] },
  { kind: "item", id: "up:shells", name: "MORE SHELLS", prices: [80, 200], info: ["START WITH MORE SHELLS", "AND SHELL BOXES GIVE MORE"] },
  { kind: "item", id: "up:fast", name: "FAST PISTOL", prices: [120, 300], info: ["THE PISTOL SHOOTS FASTER", "A BIT MORE EVERY LEVEL"] },
  { kind: "item", id: "up:med", name: "BIG MEDKITS", prices: [100, 250], info: ["MEDKITS HEAL MORE", "+10 HEALTH EVERY LEVEL"] },
  { kind: "back" },
];
// the money icon: a little white soul
const soulIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = "#111111";
  ctx.fillRect(x + 1, y, 6, 7);
  ctx.fillRect(x, y + 1, 8, 5);
  ctx.fillStyle = "#e8f4ff";
  ctx.fillRect(x + 2, y + 1, 4, 5);
  ctx.fillRect(x + 1, y + 2, 6, 3);
  ctx.fillRect(x + 2, y + 6, 1, 1);
  ctx.fillRect(x + 5, y + 6, 1, 1);
  ctx.fillStyle = "#111111";
  ctx.fillRect(x + 3, y + 3, 1, 1);
  ctx.fillRect(x + 5, y + 3, 1, 1);
};

// The demons (front view, only the LEFT half, the right half is mirrored)
const IMP_HALF = [
  "..W...",
  "..WA..",
  "..ANAA",
  "..ANNN",
  "..ANRN",
  "..ANNN",
  "..ANMM",
  "WAANNN",
  "ANNANN",
  "ANnANN",
  "WAAnNN",
  "..ANA.",
  "..ANA.",
  "..AA..",
];
const IMP_COLORS: Record<string, string> = {
  A: "#111111",
  N: "#9a5230",
  n: "#5e2e18",
  W: "#e8dcc0",
  R: "#ff3030",
  M: "#3a0000",
};
const PIG_HALF = [
  "..AA....",
  ".APPAAAA",
  ".APPPPPP",
  "APPPRPPP",
  "APPPPPPP",
  "APAAAAAA",
  "APMWMWMW",
  "APMMMMMM",
  "APMWMWMW",
  "APAAAAAA",
  "APpPPPPP",
  ".AppA...",
  ".AppA...",
  ".AAAA...",
];
const PIG_COLORS: Record<string, string> = {
  A: "#111111",
  P: "#e86a9a",
  p: "#a83a6a",
  W: "#f2f2f2",
  R: "#ffea00",
  M: "#4a0010",
};
const SKULL_HALF = [".AAAA", "AWWWW", "AWWWW", "AWAAW", "AWARW", "AWWWA", ".AwWW", ".AWAW", "..AAA"];
const SKULL_COLORS: Record<string, string> = { A: "#111111", W: "#ece6d2", w: "#a8a090", R: "#ff3030" };
// BEARMANPIG's face (the same one as in PINK JUNGLE), used for the boss
const BOSS_HALF = [
  "AA......",
  "APA.....",
  "ANNAAAAA",
  "ANNNNNNN",
  ".ANNNNNN",
  ".ANNNNNN",
  ".ANRRNNN",
  ".ANRANNN",
  ".ANNNPPP",
  ".ANNPPAP",
  ".ANNPPAP",
  ".ANNNPPP",
  "..ANNNNN",
  "..ANWAAA",
  "...ANNNN",
  "....AAAA",
];
const BOSS_COLORS: Record<string, string> = { A: "#111111", N: "#6b3d1f", P: "#ff8fb8", R: "#ff2a2a", W: "#f2f2f2" };

type Kind = "imp" | "pig" | "skull" | "boss";
// hp, speed, body radius, score, contact damage
const DEMONS: Record<Kind, { hp: number; speed: number; r: number; score: number; bite: number }> = {
  imp: { hp: 3, speed: 26, r: 5, score: 100, bite: 8 },
  pig: { hp: 7, speed: 40, r: 7, score: 150, bite: 15 },
  skull: { hp: 1, speed: 32, r: 4, score: 50, bite: 8 },
  boss: { hp: 60, speed: 15, r: 14, score: 2000, bite: 25 },
};

// ---------- helpers ----------
function buildMap(rows: string[], colors: Record<string, string>) {
  const cv = document.createElement("canvas");
  cv.width = rows[0].length;
  cv.height = rows.length;
  const g = cv.getContext("2d")!;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const col = colors[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  });
  return cv;
}
// legShift: 0 = standing, 1 = left leg up, 2 = right leg up
function buildSprite(half: string[], colors: Record<string, string>, legStart: number, legShift: 0 | 1 | 2) {
  const w = half[0].length * 2;
  const h = half.length;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d")!;
  const put = (x: number, y: number, ch: string) => {
    const col = colors[ch];
    if (!col) return;
    let yy = y;
    if (y >= legStart) {
      if (legShift === 1 && x < w / 2) yy -= 1;
      if (legShift === 2 && x >= w / 2) yy -= 1;
    }
    g.fillStyle = col;
    g.fillRect(x, yy, 1, 1);
  };
  half.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      put(x, y, row[x]);
      put(w - 1 - x, y, row[x]);
    }
  });
  return cv;
}
// a pure white copy of a sprite (the "you hit it" flash)
function whiteCopy(src: HTMLCanvasElement) {
  const cv = document.createElement("canvas");
  cv.width = src.width;
  cv.height = src.height;
  const g = cv.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = "#ffffff";
  g.fillRect(0, 0, cv.width, cv.height);
  return cv;
}
// Turns a sprite into n rotated copies, pixel by pixel, so it stays crisp (no blur)
function bakeRotations(src: HTMLCanvasElement, n: number, cx: number, cy: number, size: number) {
  const sd = src.getContext("2d")!.getImageData(0, 0, src.width, src.height).data;
  const out: HTMLCanvasElement[] = [];
  const h = size / 2;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const cv = document.createElement("canvas");
    cv.width = size;
    cv.height = size;
    const g = cv.getContext("2d")!;
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - h;
        const dy = y + 0.5 - h;
        const sx = Math.floor(cx + dx * cos + dy * sin);
        const sy = Math.floor(cy - dx * sin + dy * cos);
        if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
        const si = (sy * src.width + sx) * 4;
        if (sd[si + 3] === 0) continue;
        const di = (y * size + x) * 4;
        img.data[di] = sd[si];
        img.data[di + 1] = sd[si + 1];
        img.data[di + 2] = sd[si + 2];
        img.data[di + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    out.push(cv);
  }
  return out;
}
function hash(a: number, b: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const rgb = (c: number[], k = 0) =>
  `rgb(${Math.max(0, Math.min(255, Math.round(c[0] + k)))},${Math.max(0, Math.min(255, Math.round(c[1] + k)))},${Math.max(0, Math.min(255, Math.round(c[2] + k)))})`;

type Enemy = {
  kind: Kind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  kx: number; // knockback
  ky: number;
  flash: number;
  atk: number; // attack timer
  wind: number; // imp: winding up a fireball / skull: dashing
  dx: number;
  dy: number;
  biteCd: number;
  walk: number;
  face: number; // 1 = looking right, -1 = left
  los: boolean;
  losT: number;
  spawnT: number; // fades in out of the portal
};
type Bullet = { x: number; y: number; vx: number; vy: number; life: number; dmg: number; push: number };
type Fireball = { x: number; y: number; vx: number; vy: number; life: number; dmg: number; big: boolean };
type Part = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number; stain: boolean };
type Pickup = { x: number; y: number; kind: "shells" | "medkit"; t: number };
type Pop = { x: number; y: number; text: string; color: string; life: number };

export default function HellGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const goRef = useRef<(() => void) | null>(null);
  const boardRef = useRef<ScoreApi | null>(null); // the online Top 10 box (Scoreboard.tsx)
  const lastSignal = useRef(actionSignal);

  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    goRef.current?.();
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // ---------- sprites ----------
    // Pinkmane in every skin (made the first time a skin is needed)
    const skinCols = (skin: string) => {
      const c = SKIN_COLORS[skin] ?? SKIN_COLORS.pink;
      return { B: c[1], D: c[0] };
    };
    const playerFramesBySkin: Record<string, HTMLCanvasElement[]> = {};
    const faceBySkin: Record<string, HTMLCanvasElement> = {};
    const playerFramesFor = (skin: string) =>
      (playerFramesBySkin[skin] ??= bakeRotations(buildMap(PLAYER_MAP, { ...PLAYER_COLORS, ...skinCols(skin) }), 32, 6.5, 7, 20));
    const faceFor = (skin: string) => (faceBySkin[skin] ??= buildSprite(FACE_HALF, { ...FACE_COLORS, ...skinCols(skin) }, 99, 0));

    // ---------- saved money + the PINK SHOP + FX (the same as every game, see PinkShop.ts) ----------
    const shop = makeShop(SHOP_KEY, HELL_SHOP_ROWS);
    const fx = loadFx(FX_KEY);
    const shopUi = { open: false, fromPause: false, ui: newShopUi(HELL_SHOP_ROWS) };
    const skin = () => shop.wearingName("skin");
    const hasSmg = () => shop.level("gun:smg") > 0;
    const maxHp = () => PLAYER_HP + shop.lvl("hp") * 25;
    const mk = (half: string[], colors: Record<string, string>, legs: number) => {
      const frames = [buildSprite(half, colors, legs, 1), buildSprite(half, colors, legs, 2)];
      return { frames, white: frames.map(whiteCopy) };
    };
    const sprites: Record<Kind, { frames: HTMLCanvasElement[]; white: HTMLCanvasElement[] }> = {
      imp: mk(IMP_HALF, IMP_COLORS, 11),
      pig: mk(PIG_HALF, PIG_COLORS, 11),
      skull: mk(SKULL_HALF, SKULL_COLORS, 99),
      boss: mk(BOSS_HALF, BOSS_COLORS, 99),
    };

    // ---------- the map, drawn once onto its own canvas (blood stains get painted onto it too) ----------
    let mapIdx = 0;
    try {
      mapIdx = Math.max(0, Math.min(MAPS.length - 1, Number(localStorage.getItem(MAP_KEY)) || 0));
    } catch {}
    const grid: string[][] = MAPS[mapIdx].rows.map((r) => r.split(""));
    const tileAt = (tx: number, ty: number) => (tx < 0 || ty < 0 || tx >= MW || ty >= MH ? "#" : grid[ty][tx]);
    const wallAt = (tx: number, ty: number) => tileAt(tx, ty) === "#";
    const solid = (x: number, y: number) => wallAt(Math.floor(x / T), Math.floor(y / T));
    const lavaAt = (x: number, y: number) => tileAt(Math.floor(x / T), Math.floor(y / T)) === "~";
    const portals: { x: number; y: number }[] = [];
    const lava: { tx: number; ty: number }[] = [];
    let startX = WW / 2;
    let startY = WH / 2;
    // find the portals, the lava and the start on the map
    const scanMap = () => {
      portals.length = 0;
      lava.length = 0;
      grid.forEach((row, ty) =>
        row.forEach((c, tx) => {
          if (c === "S") portals.push({ x: tx * T + T / 2, y: ty * T + T / 2 });
          if (c === "~") lava.push({ tx, ty });
          if (c === "P") {
            startX = tx * T + T / 2;
            startY = ty * T + T / 2;
          }
        })
      );
    };
    scanMap();

    const mapCv = document.createElement("canvas");
    mapCv.width = WW;
    mapCv.height = WH;
    const mctx = mapCv.getContext("2d")!;
    const bakeMap = () => {
      const img = mctx.createImageData(WW, WH);
      const d = img.data;
      const put = (x: number, y: number, c: number[]) => {
        const i = (y * WW + x) * 4;
        d[i] = Math.max(0, Math.min(255, c[0]));
        d[i + 1] = Math.max(0, Math.min(255, c[1]));
        d[i + 2] = Math.max(0, Math.min(255, c[2]));
        d[i + 3] = 255;
      };
      for (let ty = 0; ty < MH; ty++) {
        for (let tx = 0; tx < MW; tx++) {
          const wall = wallAt(tx, ty);
          const faceBelow = wall && !wallAt(tx, ty + 1);
          const tv = (hash(tx, ty) - 0.5) * 14;
          const cracked = hash(tx + 99, ty) < 0.18;
          for (let py = 0; py < T; py++) {
            for (let px = 0; px < T; px++) {
              const x = tx * T + px;
              const y = ty * T + py;
              const n = (hash(x, y) - 0.5) * 8;
              if (!wall) {
                // dark stone floor slabs
                let c = [48 + tv + n, 34 + tv * 0.7 + n, 34 + tv * 0.7 + n];
                if (px === T - 1 || py === T - 1) c = [26, 18, 18];
                else if (px === 0 || py === 0) c = [c[0] + 10, c[1] + 8, c[2] + 8];
                if (cracked && Math.abs(px - py - 1) < 1 && px > 2 && px < 8) c = [24, 16, 16];
                // shadow right under a wall
                if (wallAt(tx, ty - 1) && py < 3) c = c.map((v) => v * (0.45 + py * 0.15));
                put(x, y, c);
              } else if (faceBelow && py >= 5) {
                // the front of the wall: red bricks
                const row = py - 5;
                const off = row % 2 === 0 ? 0 : 3;
                const mortar = row === 0 || (px + off) % 5 === 0;
                let c = mortar ? [44, 14, 12] : [128 + tv + n, 38 + n, 30 + n];
                if (row === 4) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6];
                put(x, y, c);
              } else {
                // the top of the wall: grey-brown stone
                let c = [88 + tv + n, 74 + tv + n, 70 + tv + n];
                const edgeUp = !wallAt(tx, ty - 1) && py === 0;
                const edgeL = !wallAt(tx - 1, ty) && px === 0;
                const edgeR = !wallAt(tx + 1, ty) && px === T - 1;
                if (edgeUp) c = [130, 116, 110];
                if (edgeL || edgeR) c = [40, 30, 28];
                if ((px + Math.floor(py / 4) * 3) % 7 === 0 && py % 4 !== 0) c = [c[0] - 14, c[1] - 14, c[2] - 14];
                put(x, y, c);
              }
            }
          }
        }
      }
      mctx.putImageData(img, 0, 0);
      // some old dried blood + bones lying around
      for (let i = 0; i < 60; i++) {
        const x = hash(i, 7) * WW;
        const y = hash(i, 13) * WH;
        if (solid(x, y)) continue;
        const r = 1 + hash(i, 3) * 3;
        mctx.fillStyle = "rgba(90,0,0,0.5)";
        for (let k = 0; k < 8; k++) mctx.fillRect(Math.round(x + (hash(i, k) - 0.5) * r * 2), Math.round(y + (hash(k, i) - 0.5) * r * 2), 2, 1);
        if (hash(i, 21) < 0.3) {
          mctx.fillStyle = "#cfc6b0";
          mctx.fillRect(Math.round(x), Math.round(y), 3, 1);
          mctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 1, 1);
          mctx.fillRect(Math.round(x) + 3, Math.round(y) + 1, 1, 1);
        }
      }
    };
    bakeMap();
    // the other map (on the start screen)
    const switchMap = (dir: 1 | -1) => {
      mapIdx = (mapIdx + dir + MAPS.length) % MAPS.length;
      grid.length = 0;
      grid.push(...MAPS[mapIdx].rows.map((r) => r.split("")));
      scanMap();
      bakeMap();
      s.px = startX;
      s.py = startY;
      s.camX = startX - VW / 2;
      s.camY = startY - VH / 2;
      tone(500, 750, 0.06, "square", 0.05);
      try {
        localStorage.setItem(MAP_KEY, String(mapIdx));
      } catch {}
    };
    // paints a blood drop onto the floor for good
    const stain = (x: number, y: number, color: string, size: number) => {
      if (solid(x, y)) return;
      mctx.fillStyle = color;
      mctx.fillRect(Math.round(x), Math.round(y), size, size);
    };

    // darkness layer
    const darkCv = document.createElement("canvas");
    darkCv.width = VW;
    darkCv.height = VH;
    const dctx = darkCv.getContext("2d")!;

    // ---------- sound ----------
    let ac: AudioContext | null = null;
    let noiseBuf: AudioBuffer | null = null;
    const audio = () => {
      if (fxGain(fx, mutedRef.current) <= 0) return null;
      try {
        if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (ac.state === "suspended") ac.resume();
        return ac;
      } catch {
        return null;
      }
    };
    const tone = (f1: number, f2: number, dur: number, type: OscillatorType, vol = 0.08, delay = 0) => {
      const a = audio();
      if (!a) return;
      const t0 = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f1, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      g.gain.setValueAtTime(vol * fx.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(a.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
    };
    // a burst of static (gunshots, explosions)
    const noise = (dur: number, vol: number, f1: number, f2: number, delay = 0) => {
      const a = audio();
      if (!a) return;
      if (!noiseBuf) {
        noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
        const ch = noiseBuf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
      }
      const t0 = a.currentTime + delay;
      const src = a.createBufferSource();
      src.buffer = noiseBuf;
      const f = a.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.setValueAtTime(f1, t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(40, f2), t0 + dur);
      const g = a.createGain();
      g.gain.setValueAtTime(vol * fx.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(a.destination);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + 0.02);
    };
    const sfx = {
      pistol: () => {
        noise(0.08, 0.12, 4000, 600);
        tone(700, 120, 0.07, "square", 0.04);
      },
      shotgun: () => {
        noise(0.35, 0.3, 2500, 100);
        tone(140, 40, 0.25, "sawtooth", 0.1);
        tone(900, 700, 0.03, "square", 0.03, 0.4); // the pump
        tone(600, 500, 0.03, "square", 0.03, 0.5);
      },
      empty: () => tone(1500, 1400, 0.03, "square", 0.03),
      hit: () => tone(260, 140, 0.05, "square", 0.03),
      die: (k: Kind) => {
        if (k === "skull") {
          noise(0.2, 0.12, 3000, 200);
          tone(900, 200, 0.15, "square", 0.04);
        } else if (k === "boss") {
          noise(1.2, 0.3, 1500, 60);
          tone(200, 30, 1.2, "sawtooth", 0.14);
        } else {
          tone(k === "pig" ? 260 : 420, 50, 0.4, "sawtooth", 0.09);
          noise(0.18, 0.1, 1200, 200);
        }
      },
      fireball: () => {
        tone(180, 420, 0.2, "triangle", 0.05);
        noise(0.25, 0.05, 1800, 400);
      },
      boom: () => noise(0.25, 0.1, 1500, 100),
      hurt: () => {
        tone(240, 120, 0.18, "square", 0.08);
        tone(180, 90, 0.18, "sawtooth", 0.05, 0.03);
      },
      pickup: () => {
        tone(660, 1320, 0.08, "square", 0.05);
        tone(990, 1760, 0.08, "square", 0.04, 0.07);
      },
      spawn: () => tone(70, 320, 0.4, "sawtooth", 0.035),
      switch: () => tone(500, 700, 0.04, "square", 0.03),
      wave: () => {
        tone(220, 220, 0.15, "square", 0.05);
        tone(330, 330, 0.15, "square", 0.05, 0.15);
        tone(440, 440, 0.3, "square", 0.05, 0.3);
      },
      dead: () => {
        tone(300, 40, 1.2, "sawtooth", 0.12);
        noise(0.6, 0.15, 1000, 80);
      },
      start: () => {
        tone(110, 110, 0.12, "square", 0.06);
        tone(165, 165, 0.12, "square", 0.06, 0.12);
        tone(220, 330, 0.25, "square", 0.06, 0.24);
      },
    };

    // ---------- best score ----------
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- game state ----------
    const fresh = () => ({
      mode: "ready" as "ready" | "play" | "dead",
      t: 0, // time in this mode
      px: startX,
      py: startY,
      angle: -Math.PI / 2,
      hp: maxHp(),
      weapon: 1 as Weapon, // 0 = pistol, 1 = shotgun, 2 = SMG
      shells: START_SHELLS + shop.lvl("shells") * 12,
      souls: 0, // money from this run
      cd: 0,
      recoil: 0,
      muzzle: 0,
      hurt: 0,
      lavaT: 0,
      runT: 0, // seconds this run has lasted (the scoreboard checks the score is possible for that time)
      walk: 0,
      enemies: [] as Enemy[],
      bullets: [] as Bullet[],
      fballs: [] as Fireball[],
      parts: [] as Part[],
      pickups: [] as Pickup[],
      pops: [] as Pop[],
      wave: 0,
      toSpawn: [] as Kind[],
      spawnT: 0,
      clearT: 0, // counts down between waves
      banner: "",
      bannerT: 0,
      bannerColor: RED,
      score: 0,
      kills: 0,
      shake: 0,
      camX: startX - VW / 2,
      camY: startY - VH / 2,
      newBest: false,
      needRelease: false,
      paused: false,
    });
    let s = fresh();

    // ---------- input ----------
    const keys = new Set<string>();
    const mouse = { x: W / 2, y: VH / 2 - 30, down: false };
    // phones: the joystick (x / y from -1 to 1) and the FIRE button from HellPad.tsx
    const stick = { mx: 0, my: 0, fire: false, pad: false };
    let canvasTouch = -1; // the finger that touched the game screen itself (other fingers are on the joystick / buttons)
    const touchy = window.matchMedia?.("(pointer: coarse)").matches ?? false; // a phone / tablet: the start screen says TAP
    const setPause = (on: boolean) => {
      if (s.mode !== "play" || s.paused === on) return;
      s.paused = on;
      keys.clear();
      mouse.down = false;
      stick.mx = stick.my = 0;
      stick.fire = false;
      s.needRelease = false;
      pauseRow = 0;
      tone(on ? 600 : 400, on ? 300 : 800, 0.12, "square", 0.04);
    };
    // the pause menu (the same one in every game, see PinkShop.ts)
    let pauseRow = 0;
    // the shop (from the start / game over screen, or from the pause menu)
    const openShop = (fromPause: boolean) => {
      shopUi.open = true;
      shopUi.fromPause = fromPause;
      shopUi.ui.msg = "";
      keys.clear();
      mouse.down = false;
      tone(700, 700, 0.03, "square", 0.03);
    };
    const closeShop = () => {
      shopUi.open = false;
      mouse.down = false;
      s.needRelease = true;
      tone(700, 700, 0.03, "square", 0.03);
    };
    const shopHooks: ShopHooks = {
      money: shop.money,
      moneyName: "SOULS",
      icon: soulIcon,
      level: shop.level,
      worn: shop.worn,
      buy: shop.buy,
      wear: shop.wear,
      preview: (c, id, box, t) => drawShopPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      sound: (w) => (w === "buy" ? sfx.pickup() : w === "no" ? sfx.empty() : w === "wear" ? sfx.switch() : tone(700, 700, 0.03, "square", 0.03)),
    };
    const canShop = () => !boardRef.current?.busy() && (s.mode === "ready" || (s.mode === "dead" && s.t > 1.3));
    const pauseChoose = () => {
      const pick = PAUSE_ROWS[pauseRow];
      if (pick === "SHOP") {
        openShop(true);
        return;
      }
      if (pick !== "RESUME" && s.mode === "play") shop.add(s.souls); // leaving the run: keep its souls
      if (pick === "RESUME") setPause(false);
      else if (pick === "RESTART") {
        // a brand new run, blood washed away
        s.paused = false;
        s.mode = "ready";
        bakeMap();
        go();
      } else {
        s.paused = false;
        leaveToGameMenu();
      }
    };
    const toCanvas = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H); // the canvas uses objectFit: contain
      const ox = (r.width - W * sc) / 2;
      const oy = (r.height - H * sc) / 2;
      return { x: (cx - r.left - ox) / sc, y: (cy - r.top - oy) / sc };
    };
    const onMove = (e: PointerEvent) => {
      // a finger on the joystick or a button must not move the crosshair
      if (e.pointerType !== "mouse" && e.pointerId !== canvasTouch) return;
      if (e.pointerType === "mouse") stick.pad = false;
      const p = toCanvas(e.clientX, e.clientY);
      mouse.x = Math.max(0, Math.min(W - 1, p.x));
      mouse.y = Math.max(0, Math.min(H - 1, p.y));
      if (fx.drag) fxDrag(fx, p.y);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerId !== canvasTouch) return;
      canvasTouch = -1;
      mouse.down = false;
      s.needRelease = false;
      fxDrag(fx, -1);
    };
    const switchWeapon = (w?: Weapon) => {
      const guns: Weapon[] = hasSmg() ? [0, 1, 2] : [0, 1];
      const next = w ?? guns[(guns.indexOf(s.weapon) + 1) % guns.length];
      if (next === s.weapon || !guns.includes(next)) return;
      s.weapon = next;
      s.cd = Math.max(s.cd, 0.15);
      sfx.switch();
    };
    const go = () => {
      if (boardRef.current?.busy()) return; // the Top 10 / name box is still open
      if (shopUi.open || s.paused) return;
      if (s.mode === "ready" || (s.mode === "dead" && s.t > 1.3)) {
        boardRef.current?.hide();
        const wasDead = s.mode === "dead";
        s = fresh();
        if (wasDead) bakeMap(); // wash the blood away
        s.mode = "play";
        s.needRelease = mouse.down;
        sfx.start();
        nextWave();
      }
    };
    goRef.current = go;
    const onDown = (e: PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) return;
      if (e.pointerType !== "mouse") {
        canvasTouch = e.pointerId;
        stick.pad = false; // aim at the finger
      }
      onMove(e);
      // the FX speaker + slider (top left)
      if (fxTap(fx, mouse.x, mouse.y, s.mode !== "play" || s.paused)) return;
      if (shopUi.open) {
        if (shopTap(HELL_SHOP_ROWS, shopUi.ui, shopHooks, mouse.x, mouse.y) === "close") closeShop();
        return;
      }
      if (canShop() && panelShopHit(mouse.x, mouse.y, W)) {
        openShop(false);
        return;
      }
      // the map's name on the start screen = the other map
      if (s.mode === "ready" && mouse.y >= 32 && mouse.y < 48 && Math.abs(mouse.x - W / 2) < 80) {
        switchMap(1);
        return;
      }
      if (s.paused) {
        // a click / tap on a pause menu row picks it
        const r = pauseTapRow(mouse.x, mouse.y, W, PAUSE_ROWS.length);
        if (r >= 0) {
          pauseRow = r;
          pauseChoose();
        }
        return;
      }
      mouse.down = true;
      if (s.mode !== "play") go();
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // typing your name for the Top 10
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      // the shop: up / down / OK / ESC
      if (shopUi.open) {
        if (fxKey(fx, e.key)) return;
        if (e.repeat && (e.key === "Enter" || e.key === " ")) return;
        if (shopKey(HELL_SHOP_ROWS, shopUi.ui, shopHooks, e.key) === "close") closeShop();
        return;
      }
      // M = sounds on / off, - and + = FX volume
      if (fxKey(fx, e.key)) return;
      if (s.paused) {
        // UP / DOWN / OK / SPACE move and pick on the pause menu, ESC / P = back to the game
        const pm = { row: pauseRow };
        const did = pauseKey(pm, PAUSE_ROWS.length, e.key);
        pauseRow = pm.row;
        if (did === "move") sfx.switch();
        else if (!e.repeat && did === "choose") pauseChoose();
        else if (!e.repeat && did === "resume") setPause(false);
        return;
      }
      if (e.repeat) return;
      if (k === "escape" || k === "p") {
        setPause(true);
        return;
      }
      // the start / game over screen: S / DOWN = the shop, ← → = the other map
      if (canShop() && (k === "s" || k === "arrowdown")) {
        openShop(false);
        return;
      }
      if (s.mode === "ready" && (k === "arrowleft" || k === "a" || k === "arrowright" || k === "d")) {
        switchMap(k === "arrowleft" || k === "a" ? -1 : 1);
        return;
      }
      keys.add(k);
      if (k === "1") switchWeapon(0);
      if (k === "2") switchWeapon(1);
      if (k === "3") switchWeapon(2);
      if (k === "q" && s.mode === "play") switchWeapon();
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onBlur = () => {
      keys.clear();
      mouse.down = false;
      setPause(true);
    };
    const onHidden = () => {
      if (document.hidden) setPause(true);
    };
    const onStick = (e: Event) => {
      const d = (e as CustomEvent<{ stick: "move" | "fire"; x: number; y: number; on: boolean }>).detail;
      if (!d) return;
      stick.pad = true;
      if (d.stick === "move") {
        stick.mx = d.on ? d.x : 0;
        stick.my = d.on ? d.y : 0;
        return;
      }
      if (shopUi.open) return;
      const wasOn = stick.fire;
      stick.fire = d.on;
      if (!d.on) s.needRelease = false;
      if (d.on && !wasOn) {
        if (s.paused) setPause(false);
        else if (s.mode !== "play") {
          go();
          s.needRelease = true; // the touch that starts the game doesn't shoot yet
        }
      }
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (s.mode === "play" && !s.paused) switchWeapon();
    };
    const onMenu = (e: Event) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pinkmane-hell-stick", onStick);
    document.addEventListener("visibilitychange", onHidden);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("contextmenu", onMenu);

    // ---------- world helpers ----------
    // does a box of radius r at (x, y) touch a wall?
    const hitsWall = (x: number, y: number, r: number) => {
      const x0 = Math.floor((x - r) / T);
      const x1 = Math.floor((x + r - 0.001) / T);
      const y0 = Math.floor((y - r) / T);
      const y1 = Math.floor((y + r - 0.001) / T);
      for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (wallAt(tx, ty)) return true;
      return false;
    };
    // moves something but stops it at walls (slides along them)
    const move = (o: { x: number; y: number }, dx: number, dy: number, r: number) => {
      if (!hitsWall(o.x + dx, o.y, r)) o.x += dx;
      if (!hitsWall(o.x, o.y + dy, r)) o.y += dy;
    };
    const movePlayer = (dx: number, dy: number) => {
      const o = { x: s.px, y: s.py };
      move(o, dx, dy, 4);
      s.px = o.x;
      s.py = o.y;
    };
    // can (x1,y1) see (x2,y2)?
    const sees = (x1: number, y1: number, x2: number, y2: number) => {
      const d = Math.hypot(x2 - x1, y2 - y1);
      const n = Math.ceil(d / 4);
      for (let i = 1; i < n; i++) if (solid(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n)) return false;
      return true;
    };

    // the "path to Pinkmane" map: every tile knows how many steps away the player is
    const flow = new Int16Array(MW * MH);
    let flowTile = -1;
    const updateFlow = () => {
      const ptx = Math.floor(s.px / T);
      const pty = Math.floor(s.py / T);
      const id = pty * MW + ptx;
      if (id === flowTile) return;
      flowTile = id;
      flow.fill(-1);
      const q = new Int16Array(MW * MH);
      let qh = 0;
      let qt = 0;
      flow[id] = 0;
      q[qt++] = id;
      while (qh < qt) {
        const c = q[qh++];
        const cx = c % MW;
        const cy = (c / MW) | 0;
        const nb = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];
        for (const [nx, ny] of nb) {
          if (wallAt(nx, ny)) continue;
          const ni = ny * MW + nx;
          if (flow[ni] !== -1) continue;
          flow[ni] = flow[c] + 1;
          q[qt++] = ni;
        }
      }
    };
    // which way should a demon at (x, y) walk to reach Pinkmane?
    const pathDir = (x: number, y: number) => {
      const tx = Math.floor(x / T);
      const ty = Math.floor(y / T);
      const here = flow[ty * MW + tx];
      let bx = 0;
      let by = 0;
      let bd = here < 0 ? 9999 : here;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = tx + ox;
          const ny = ty + oy;
          if (wallAt(nx, ny)) continue;
          if (ox && oy && (wallAt(tx + ox, ty) || wallAt(tx, ty + oy))) continue; // no cutting corners
          const v = flow[ny * MW + nx];
          if (v >= 0 && v < bd) {
            bd = v;
            bx = nx * T + T / 2 - x;
            by = ny * T + T / 2 - y;
          }
        }
      }
      const l = Math.hypot(bx, by) || 1;
      return { x: bx / l, y: by / l };
    };

    const burst = (x: number, y: number, n: number, colors: string[], speed: number, stainChance = 0, size = 1) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random());
        s.parts.push({
          x,
          y,
          vx: Math.cos(a) * v,
          vy: Math.sin(a) * v,
          life: 0.3 + Math.random() * 0.5,
          color: colors[(Math.random() * colors.length) | 0],
          size: size + (Math.random() < 0.3 ? 1 : 0),
          stain: Math.random() < stainChance,
        });
      }
    };
    const pop = (x: number, y: number, text: string, color: string) => s.pops.push({ x, y, text, color, life: 0.9 });
    const banner = (text: string, color: string, t = 2) => {
      s.banner = text;
      s.bannerColor = color;
      s.bannerT = t;
    };

    // ---------- waves ----------
    const nextWave = () => {
      s.wave++;
      const n = s.wave;
      const list: Kind[] = [];
      const boss = n % BOSS_EVERY === 0;
      const count = boss ? 2 + n : 3 + n * 2;
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        if (n >= 2 && r < 0.25) list.push("skull");
        else if (n >= 2 && r < 0.5) list.push("pig");
        else if (n >= 4 && r < 0.6) list.push("pig");
        else list.push("imp");
      }
      if (boss) list.splice(1, 0, "boss");
      s.toSpawn = list;
      s.spawnT = 1;
      banner(boss ? "BOSS WAVE!" : `WAVE ${n}`, boss ? PINK : RED);
      sfx.wave();
      // a few goodies on the floor every wave
      for (let i = 0; i < 2; i++) dropRandom(i === 0 ? "medkit" : "shells");
    };
    const dropRandom = (kind: Pickup["kind"]) => {
      for (let tries = 0; tries < 50; tries++) {
        const tx = 1 + Math.floor(Math.random() * (MW - 2));
        const ty = 1 + Math.floor(Math.random() * (MH - 2));
        if (tileAt(tx, ty) !== "." || wallAt(tx + 1, ty) || wallAt(tx - 1, ty) || wallAt(tx, ty + 1) || wallAt(tx, ty - 1)) continue;
        s.pickups.push({ x: tx * T + T / 2, y: ty * T + T / 2, kind, t: Math.random() * 6 });
        return;
      }
    };
    const spawn = (kind: Kind) => {
      const far = portals.filter((p) => Math.hypot(p.x - s.px, p.y - s.py) > 90);
      const p = (far.length ? far : portals)[(Math.random() * (far.length || portals.length)) | 0];
      const def = DEMONS[kind];
      const hp = kind === "boss" ? def.hp + s.wave * 8 : def.hp;
      s.enemies.push({
        kind,
        x: p.x,
        y: p.y,
        hp,
        maxHp: hp,
        r: def.r,
        kx: 0,
        ky: 0,
        flash: 0,
        atk: 1.5 + Math.random() * 2,
        wind: 0,
        dx: 0,
        dy: 0,
        biteCd: 0,
        walk: Math.random() * 10,
        face: 1,
        los: false,
        losT: 0,
        spawnT: 0.5,
      });
      burst(p.x, p.y, 16, ["#ff2a2a", "#ff7a1a", "#ffd400"], 50);
      sfx.spawn();
      if (kind === "boss") {
        banner("BEARMANPIG!", PINK, 2.5);
        s.shake = 0.6;
      }
    };

    // ---------- shooting ----------
    const shoot = () => {
      const tipX = s.px + Math.cos(s.angle) * 9;
      const tipY = s.py + Math.sin(s.angle) * 9;
      // don't shoot through a wall you're standing right against
      const ox = solid(tipX, tipY) ? s.px : tipX;
      const oy = solid(tipX, tipY) ? s.py : tipY;
      if (s.weapon === 1 && s.shells <= 0) {
        sfx.empty();
        pop(s.px, s.py - 12, "NO SHELLS", YELLOW);
        s.weapon = 0;
        s.cd = 0.3;
        return;
      }
      if (s.weapon === 2) {
        // the SMG: fast and a bit wild
        const a = s.angle + (Math.random() - 0.5) * 0.18;
        s.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 0.6, dmg: 1, push: 12 });
        s.cd = SMG_COOLDOWN;
        s.recoil = 0.04;
        s.muzzle = 0.04;
        sfx.pistol();
      } else if (s.weapon === 0) {
        const a = s.angle + (Math.random() - 0.5) * 0.06;
        s.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * BULLET_SPEED, vy: Math.sin(a) * BULLET_SPEED, life: 0.8, dmg: 1, push: 25 });
        s.cd = PISTOL_COOLDOWN * (1 - shop.lvl("fast") * 0.18);
        s.recoil = 0.06;
        s.muzzle = 0.05;
        sfx.pistol();
      } else {
        s.shells--;
        for (let i = 0; i < SHOTGUN_PELLETS; i++) {
          const a = s.angle + (Math.random() - 0.5) * 0.42;
          const v = BULLET_SPEED * (0.85 + Math.random() * 0.3);
          s.bullets.push({ x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35, dmg: 1, push: 40 });
        }
        s.cd = SHOTGUN_COOLDOWN;
        s.recoil = 0.12;
        s.muzzle = 0.08;
        s.shake = Math.max(s.shake, 0.15);
        sfx.shotgun();
        // a little push back
        movePlayer(-Math.cos(s.angle) * 2, -Math.sin(s.angle) * 2);
      }
      burst(tipX, tipY, 3, ["#fff6a0", YELLOW], 40);
    };

    const hurtPlayer = (dmg: number, fromX: number, fromY: number) => {
      if (s.mode !== "play") return;
      s.hp -= dmg;
      s.hurt = 0.35;
      s.shake = Math.max(s.shake, 0.2);
      const a = Math.atan2(s.py - fromY, s.px - fromX);
      movePlayer(Math.cos(a) * 4, Math.sin(a) * 4);
      burst(s.px, s.py, 6, ["#c00000", "#ff2a2a"], 40, 0.4);
      sfx.hurt();
      if (s.hp <= 0) {
        s.hp = 0;
        s.mode = "dead";
        s.t = 0;
        shop.add(s.souls); // the souls from this run are saved
        burst(s.px, s.py, 40, ["#c00000", "#ff2a2a", "#7a0000", "#d63cc8"], 70, 0.6, 2);
        sfx.dead();
        const score = s.score;
        const runT = s.runT;
        const deadRun = s;
        // after the YOU DIED moment (and only if you haven't started a new run meanwhile)
        setTimeout(() => {
          if (s === deadRun) boardRef.current?.gameOver(score, runT);
        }, 1200);
        if (s.score > best) {
          best = s.score;
          s.newBest = true;
          try {
            localStorage.setItem(BEST_KEY, String(best));
          } catch {}
        }
      }
    };

    const killEnemy = (e: Enemy) => {
      s.kills++;
      s.souls += e.kind === "boss" ? 25 : 1;
      const def = DEMONS[e.kind];
      s.score += def.score;
      pop(e.x, e.y - e.r - 6, `+${def.score}`, YELLOW);
      sfx.die(e.kind);
      if (e.kind === "skull") burst(e.x, e.y, 18, ["#ece6d2", "#ff7a1a", "#ffd400"], 70, 0, 1);
      else burst(e.x, e.y, e.kind === "boss" ? 120 : 26, ["#c00000", "#ff2a2a", "#7a0000", "#5a0000"], e.kind === "boss" ? 120 : 75, 0.7, 2);
      if (e.kind === "boss") {
        s.shake = 1;
        banner("BOSS DOWN!", YELLOW, 2.5);
        for (let i = 0; i < 4; i++) s.pickups.push({ x: e.x + (i - 1.5) * 8, y: e.y, kind: i % 2 ? "medkit" : "shells", t: i });
      } else if (Math.random() < DROP_CHANCE) {
        const kind = s.hp < 50 && Math.random() < 0.6 ? "medkit" : Math.random() < 0.65 ? "shells" : "medkit";
        if (!solid(e.x, e.y)) s.pickups.push({ x: e.x, y: e.y, kind, t: 0 });
      }
    };

    // ---------- update ----------
    const step = (dt: number) => {
      if (s.paused) return; // everything stands still
      s.t += dt;
      s.shake = Math.max(0, s.shake - dt);
      s.bannerT = Math.max(0, s.bannerT - dt);

      // particles (blood that lands stains the floor for good)
      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const f = Math.exp(-5 * dt);
        p.vx *= f;
        p.vy *= f;
        p.life -= dt;
        if (p.life <= 0 && p.stain) stain(p.x, p.y, p.color, p.size);
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const p of s.pops) {
        p.y -= 14 * dt;
        p.life -= dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);

      if (s.mode !== "play") return;
      s.runT += dt;

      // weapon wheel on the handheld
      if (Math.abs(spinRef.current) > 40) {
        switchWeapon();
        spinRef.current = 0;
      }

      // --- move Pinkmane ---
      let ix = 0;
      let iy = 0;
      if (keys.has("a") || keys.has("arrowleft")) ix--;
      if (keys.has("d") || keys.has("arrowright")) ix++;
      if (keys.has("w") || keys.has("arrowup")) iy--;
      if (keys.has("s") || keys.has("arrowdown")) iy++;
      let power = 1; // the stick can walk slower if you only push it a little
      const sl = Math.hypot(stick.mx, stick.my);
      if (sl > 0.15) {
        ix = stick.mx;
        iy = stick.my;
        power = Math.min(1, (sl - 0.15) / 0.6 + 0.35);
      }
      const inLava = lavaAt(s.px, s.py);
      if (ix || iy) {
        const l = Math.hypot(ix, iy);
        const sp = PLAYER_SPEED * power * (inLava ? 0.6 : 1) * dt;
        movePlayer((ix / l) * sp, (iy / l) * sp);
        s.walk += dt * 10;
      }
      if (inLava) {
        s.lavaT -= dt;
        if (s.lavaT <= 0) {
          s.lavaT = 0.3;
          hurtPlayer(LAVA_DAMAGE * 0.3, s.px, s.py);
          burst(s.px, s.py, 4, ["#ff7a1a", YELLOW], 30);
        }
      } else s.lavaT = 0;
      if (s.mode !== "play") return;

      // --- aim: Pinkmane looks at the crosshair ---
      if (stick.pad) {
        // phones: look the way you walk...
        let a = s.angle;
        if (Math.hypot(stick.mx, stick.my) > 0.15) a = Math.atan2(stick.my, stick.mx);
        // ...and while FIRE is held, aim at the nearest demon you can see
        let target: Enemy | null = null;
        if (stick.fire) {
          let bd = AUTO_AIM_RANGE;
          for (const e of s.enemies) {
            if (e.spawnT > 0 || !e.los) continue;
            const d = Math.hypot(e.x - s.px, e.y - s.py);
            if (d < bd) {
              bd = d;
              target = e;
            }
          }
          if (target) a = Math.atan2(target.y + (target.kind === "boss" ? 0 : 2) - s.py, target.x - s.px);
        }
        s.angle = a;
        // the crosshair sits on the demon you're shooting, or in front of Pinkmane
        const cx = target ? target.x : s.px + Math.cos(a) * 45;
        const cy = target ? target.y : s.py + Math.sin(a) * 45;
        mouse.x = Math.max(0, Math.min(VW - 1, cx - s.camX));
        mouse.y = Math.max(0, Math.min(VH - 1, cy - s.camY));
      } else {
        const mx = mouse.x + s.camX;
        const my = mouse.y + s.camY;
        s.angle = Math.atan2(my - s.py, mx - s.px);
      }

      // --- shoot ---
      s.cd -= dt;
      s.recoil = Math.max(0, s.recoil - dt);
      s.muzzle = Math.max(0, s.muzzle - dt);
      s.hurt = Math.max(0, s.hurt - dt);
      if ((mouse.down || stick.fire) && !s.needRelease && s.cd <= 0) shoot();

      // --- bullets ---
      for (const b of s.bullets) {
        const sub = 3;
        for (let i = 0; i < sub && b.life > 0; i++) {
          b.x += (b.vx * dt) / sub;
          b.y += (b.vy * dt) / sub;
          if (solid(b.x, b.y)) {
            b.life = 0;
            burst(b.x - (b.vx * dt) / sub, b.y - (b.vy * dt) / sub, 3, ["#ffd400", "#ffffff", "#8a7a70"], 40);
            break;
          }
          for (const e of s.enemies) {
            if (e.hp <= 0 || e.spawnT > 0.25) continue;
            if (Math.hypot(e.x - b.x, e.y - (b.y + (e.kind === "boss" ? 0 : 3))) < e.r + 2) {
              b.life = 0;
              e.hp -= b.dmg;
              e.flash = 0.08;
              const l = Math.hypot(b.vx, b.vy);
              const push = e.kind === "boss" ? b.push * 0.15 : b.push;
              e.kx += (b.vx / l) * push;
              e.ky += (b.vy / l) * push;
              burst(b.x, b.y, 4, e.kind === "skull" ? ["#ece6d2", "#ff7a1a"] : ["#c00000", "#ff2a2a"], 50, 0.5);
              sfx.hit();
              if (e.hp <= 0) killEnemy(e);
              break;
            }
          }
        }
        b.life -= dt;
      }
      s.bullets = s.bullets.filter((b) => b.life > 0);

      // --- demons ---
      updateFlow();
      for (const e of s.enemies) {
        if (e.hp <= 0) continue;
        if (e.spawnT > 0) {
          e.spawnT -= dt;
          continue;
        }
        const def = DEMONS[e.kind];
        const dx = s.px - e.x;
        const dy = s.py - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.losT -= dt;
        if (e.losT <= 0) {
          e.losT = 0.2 + Math.random() * 0.1;
          e.los = e.kind === "boss" || sees(e.x, e.y, s.px, s.py);
        }
        e.flash = Math.max(0, e.flash - dt);
        e.biteCd = Math.max(0, e.biteCd - dt);
        e.atk -= dt;

        // which way to walk
        let wx = 0;
        let wy = 0;
        if (e.kind === "boss" || (e.los && dist < 140)) {
          wx = dx / dist;
          wy = dy / dist;
        } else {
          const p = pathDir(e.x, e.y);
          wx = p.x;
          wy = p.y;
        }
        let speed = def.speed;

        if (e.kind === "imp") {
          if (e.los && dist < 60) speed *= 0.25; // likes to keep its distance
          if (e.wind > 0) {
            speed = 0;
            e.wind -= dt;
            if (e.wind <= 0) {
              const a = Math.atan2(dy, dx);
              s.fballs.push({ x: e.x, y: e.y - 4, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, life: 3, dmg: 10, big: false });
              sfx.fireball();
            }
          } else if (e.atk <= 0 && e.los && dist < 180) {
            e.wind = 0.45;
            e.atk = 2 + Math.random() * 1.8;
          }
        } else if (e.kind === "pig") {
          if (e.los && dist < 80) speed *= 1.9; // CHARGE
        } else if (e.kind === "skull") {
          if (e.wind > 0) {
            e.wind -= dt;
            wx = e.dx;
            wy = e.dy;
            speed = 150;
          } else if (e.atk <= 0 && e.los && dist < 110) {
            e.wind = 0.45;
            e.dx = dx / dist;
            e.dy = dy / dist;
            e.atk = 1.6 + Math.random();
            tone(500, 1100, 0.2, "square", 0.025);
          }
        } else if (e.kind === "boss") {
          if (e.atk <= 0) {
            const a0 = Math.atan2(dy, dx);
            const rage = e.hp < e.maxHp / 2;
            const n = rage ? 9 : 5;
            const spread = rage ? 1.6 : 0.7;
            for (let i = 0; i < n; i++) {
              const a = a0 + (i / (n - 1) - 0.5) * spread;
              s.fballs.push({ x: e.x, y: e.y + 4, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, life: 4, dmg: 14, big: true });
            }
            e.atk = rage ? 1.6 : 2.4;
            sfx.fireball();
            tone(120, 60, 0.4, "sawtooth", 0.08); // OINK
          }
        }

        // keep a gap: a pig / imp that's right next to you backs off a little instead of sitting on top of you
        if ((e.kind === "pig" || e.kind === "imp") && dist < e.r + DEMON_GAP) {
          const push = 1 - dist / (e.r + DEMON_GAP);
          wx = (-dx / dist) * (0.4 + push);
          wy = (-dy / dist) * (0.4 + push);
          speed = Math.max(speed, def.speed);
        }

        // keep away from the other demons a bit
        for (const o of s.enemies) {
          if (o === e || o.hp <= 0 || o.kind === "boss" || e.kind === "boss") continue;
          const ox = e.x - o.x;
          const oy = e.y - o.y;
          const od = Math.hypot(ox, oy);
          const min = e.r + o.r - 2;
          if (od > 0 && od < min) {
            wx += (ox / od) * 0.8;
            wy += (oy / od) * 0.8;
          }
        }

        const mvx = wx * speed * dt + e.kx * dt;
        const mvy = wy * speed * dt + e.ky * dt;
        if (e.kind === "boss") {
          e.x = Math.max(e.r, Math.min(WW - e.r, e.x + mvx));
          e.y = Math.max(e.r, Math.min(WH - e.r, e.y + mvy));
        } else move(e, mvx, mvy, 4);
        const kf = Math.exp(-9 * dt);
        e.kx *= kf;
        e.ky *= kf;
        if (Math.abs(wx) > 0.1) e.face = wx > 0 ? 1 : -1;
        e.walk += dt * (speed / 6);

        // bite (pigs + imps bite from their gap, then bounce back)
        const reach = e.kind === "pig" || e.kind === "imp" ? e.r + DEMON_GAP + 3 : e.r + 5;
        if (dist < reach && e.biteCd <= 0) {
          e.biteCd = e.kind === "pig" ? 1.1 : 0.9;
          hurtPlayer(def.bite, e.x, e.y);
          if (e.kind === "pig" || e.kind === "imp") {
            e.kx = (-dx / dist) * BITE_BOUNCE;
            e.ky = (-dy / dist) * BITE_BOUNCE;
          }
          if (e.kind === "skull") {
            e.wind = 0;
            e.kx = (-dx / dist) * 80;
            e.ky = (-dy / dist) * 80;
          }
        }
      }
      s.enemies = s.enemies.filter((e) => e.hp > 0);

      // --- fireballs ---
      for (const f of s.fballs) {
        f.x += f.vx * dt;
        f.y += f.vy * dt;
        f.life -= dt;
        if (Math.random() < 0.5) s.parts.push({ x: f.x, y: f.y, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, life: 0.25, color: Math.random() < 0.5 ? "#ff7a1a" : "#ff2a2a", size: 1, stain: false });
        if (solid(f.x, f.y)) {
          f.life = 0;
          burst(f.x, f.y, 10, ["#ff7a1a", YELLOW, "#ff2a2a"], 50);
          sfx.boom();
        } else if (Math.hypot(f.x - s.px, f.y - s.py) < (f.big ? 7 : 5)) {
          f.life = 0;
          burst(f.x, f.y, 12, ["#ff7a1a", YELLOW, "#ff2a2a"], 60);
          hurtPlayer(f.dmg, f.x - f.vx, f.y - f.vy);
        }
      }
      s.fballs = s.fballs.filter((f) => f.life > 0);

      // --- pickups ---
      for (const p of s.pickups) {
        p.t += dt;
        if (Math.hypot(p.x - s.px, p.y - s.py) < 9) {
          if (p.kind === "shells") {
            const got = SHELLS_PICKUP + shop.lvl("shells") * 4;
            s.shells += got;
            pop(p.x, p.y - 8, `+${got} SHELLS`, YELLOW);
          } else {
            if (s.hp >= maxHp()) continue; // leave it for later
            const got = MEDKIT_HP + shop.lvl("med") * 10;
            s.hp = Math.min(maxHp(), s.hp + got);
            pop(p.x, p.y - 8, `+${got} HP`, "#7dff6a");
          }
          p.t = -1;
          sfx.pickup();
        }
      }
      s.pickups = s.pickups.filter((p) => p.t >= 0);

      // --- waves ---
      if (s.toSpawn.length) {
        s.spawnT -= dt;
        if (s.spawnT <= 0) {
          spawn(s.toSpawn.shift()!);
          s.spawnT = Math.max(0.35, 1.1 - s.wave * 0.06);
        }
      } else if (s.enemies.length === 0) {
        if (s.clearT === 0) {
          s.clearT = 2.5;
          const bonus = 250 * s.wave;
          s.score += bonus;
          banner("WAVE CLEAR!", "#7dff6a");
          pop(s.px, s.py - 14, `+${bonus}`, "#7dff6a");
          tone(523, 523, 0.1, "square", 0.05);
          tone(659, 659, 0.1, "square", 0.05, 0.1);
          tone(784, 1046, 0.25, "square", 0.05, 0.2);
        } else {
          s.clearT -= dt;
          if (s.clearT <= 0) {
            s.clearT = 0;
            nextWave();
          }
        }
      }

      // --- camera: follows you, and leans a bit towards where you aim ---
      const tx = s.px - VW / 2 + (mouse.x - VW / 2) * 0.3;
      const ty = s.py - VH / 2 + (mouse.y - VH / 2) * 0.3;
      const k = 1 - Math.exp(-8 * dt);
      s.camX += (Math.max(0, Math.min(WW - VW, tx)) - s.camX) * k;
      s.camY += (Math.max(0, Math.min(WH - VH, ty)) - s.camY) * k;
    };

    // ---------- drawing ----------
    const text = (str: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center") => {
      ctx.font = `${size}px ${fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    };
    const shadow = (x: number, y: number, w: number) => {
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.round(w), 2);
      ctx.fillRect(Math.round(x - w / 2 + 1), Math.round(y - 1), Math.round(w - 2), 4);
    };

    const eyes: { x: number; y: number; c: string }[] = []; // glowing eyes, drawn on top of the darkness

    const drawLava = (clock: number) => {
      for (const l of lava) {
        const x0 = l.tx * T;
        const y0 = l.ty * T;
        if (x0 + T < s.camX || x0 > s.camX + VW || y0 + T < s.camY || y0 > s.camY + VH) continue;
        for (let y = 0; y < T; y += 2) {
          for (let x = 0; x < T; x += 2) {
            const v = Math.sin((x0 + x) * 0.35 + clock * 2.2) + Math.sin((y0 + y) * 0.42 - clock * 1.7) + Math.sin((x0 + y0 + x + y) * 0.2 + clock);
            ctx.fillStyle = v > 1.6 ? "#ffe066" : v > 0.6 ? "#ff9a1a" : v > -0.6 ? "#e8420a" : "#a81a06";
            ctx.fillRect(x0 + x, y0 + y, 2, 2);
          }
        }
      }
    };

    const drawPortal = (x: number, y: number, clock: number) => {
      const p = 0.5 + 0.5 * Math.sin(clock * 3 + x);
      ctx.strokeStyle = `rgba(255,${Math.round(40 + p * 40)},30,${0.5 + p * 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.stroke();
      // the star
      ctx.beginPath();
      for (let i = 0; i <= 5; i++) {
        const a = -Math.PI / 2 + ((i * 2) % 5) * ((Math.PI * 2) / 5) + clock * 0.3;
        const px = x + Math.cos(a) * 7;
        const py = y + Math.sin(a) * 7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    };

    const drawPickup = (p: Pickup) => {
      const bob = Math.round(Math.sin(p.t * 4) * 1);
      const x = Math.round(p.x);
      const y = Math.round(p.y) + bob;
      shadow(p.x, p.y + 4, 6);
      ctx.fillStyle = "#111";
      if (p.kind === "shells") {
        ctx.fillRect(x - 4, y - 3, 8, 6);
        ctx.fillStyle = "#c2241a";
        ctx.fillRect(x - 3, y - 2, 2, 4);
        ctx.fillRect(x + 1, y - 2, 2, 4);
        ctx.fillStyle = YELLOW;
        ctx.fillRect(x - 3, y + 1, 2, 1);
        ctx.fillRect(x + 1, y + 1, 2, 1);
      } else {
        ctx.fillRect(x - 4, y - 4, 8, 7);
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(x - 3, y - 3, 6, 5);
        ctx.fillStyle = "#e01010";
        ctx.fillRect(x - 1, y - 3, 2, 5);
        ctx.fillRect(x - 3, y - 1, 6, 1);
      }
    };

    const drawEnemy = (e: Enemy, clock: number) => {
      const spr = sprites[e.kind];
      const fi = Math.floor(e.walk) % 2;
      const img = e.flash > 0 ? spr.white[fi] : spr.frames[fi];
      if (e.spawnT > 0) ctx.globalAlpha = 1 - e.spawnT / 0.5;
      if (e.kind === "boss") {
        const bob = Math.sin(clock * 2) * 2;
        const sz = 32;
        shadow(e.x, e.y + 16, 20);
        const x = Math.round(e.x - sz / 2);
        const y = Math.round(e.y - sz / 2 + bob);
        ctx.drawImage(img, x, y, sz, sz);
        eyes.push({ x: x + 6, y: y + 12, c: RED }, { x: x + 24, y: y + 12, c: RED });
        // health bar
        ctx.fillStyle = "#111";
        ctx.fillRect(x, y - 5, sz, 3);
        ctx.fillStyle = PINK;
        ctx.fillRect(x + 1, y - 4, Math.round((sz - 2) * (e.hp / e.maxHp)), 1);
      } else if (e.kind === "skull") {
        const bob = Math.round(Math.sin(clock * 6 + e.walk) * 1.5);
        shadow(e.x, e.y + 6, 6);
        // flames behind the skull
        for (let i = 0; i < 6; i++) {
          const fx = e.x - 4 + i * 1.6 + Math.sin(clock * 20 + i) * 1;
          const fh = 3 + ((Math.sin(clock * 15 + i * 2) + 1) * 2) | 0;
          ctx.fillStyle = i % 2 ? "#ff7a1a" : YELLOW;
          ctx.fillRect(Math.round(fx), Math.round(e.y - 6 + bob - fh), 1, fh);
        }
        const x = Math.round(e.x - img.width / 2);
        const y = Math.round(e.y - img.height / 2 - 2 + bob);
        if (e.face < 0) {
          ctx.save();
          ctx.scale(-1, 1);
          ctx.drawImage(img, -x - img.width, y);
          ctx.restore();
        } else ctx.drawImage(img, x, y);
        eyes.push({ x: x + 3, y: y + 4, c: RED }, { x: x + 6, y: y + 4, c: RED });
      } else {
        shadow(e.x, e.y + e.r - 1, e.r * 1.6);
        const x = Math.round(e.x - img.width / 2);
        const y = Math.round(e.y + e.r - img.height);
        ctx.drawImage(img, x, y);
        if (e.kind === "imp") {
          const c = e.wind > 0 ? YELLOW : RED;
          eyes.push({ x: x + 4, y: y + 4, c }, { x: x + 7, y: y + 4, c });
          if (e.wind > 0) {
            // a fireball growing in its hands
            const g = 1 + Math.round((0.45 - e.wind) * 6);
            ctx.fillStyle = "#ff7a1a";
            ctx.fillRect(x + 6 - g, y - 2 - g, g * 2, g * 2);
            ctx.fillStyle = YELLOW;
            ctx.fillRect(x + 6 - Math.ceil(g / 2), y - 2 - Math.ceil(g / 2), Math.ceil(g / 2) * 2, Math.ceil(g / 2) * 2);
          }
        } else eyes.push({ x: x + 4, y: y + 3, c: YELLOW }, { x: x + 11, y: y + 3, c: YELLOW });
      }
      ctx.globalAlpha = 1;
    };

    const drawPlayer = () => {
      if (s.mode === "dead") {
        // what's left of Pinkmane
        const x = Math.round(s.px);
        const y = Math.round(s.py);
        ctx.fillStyle = "#7a0000";
        ctx.fillRect(x - 6, y - 3, 12, 7);
        ctx.fillStyle = "#c00000";
        ctx.fillRect(x - 4, y - 2, 8, 5);
        ctx.fillStyle = "#d63cc8";
        ctx.fillRect(x - 2, y - 2, 4, 3);
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(x + 2, y + 1, 4, 2);
        return;
      }
      const playerFrames = playerFramesFor(skin());
      const n = playerFrames.length;
      let idx = Math.round((s.angle / (Math.PI * 2)) * n) % n;
      if (idx < 0) idx += n;
      const rx = s.recoil > 0 ? -Math.cos(s.angle) * 1.5 : 0;
      const ry = s.recoil > 0 ? -Math.sin(s.angle) * 1.5 : 0;
      shadow(s.px, s.py + 5, 10);
      const img = playerFrames[idx];
      if (s.hurt > 0.2) ctx.globalAlpha = 0.6;
      ctx.drawImage(img, Math.round(s.px - 10 + rx), Math.round(s.py - 10 + ry));
      ctx.globalAlpha = 1;
      if (s.muzzle > 0) {
        const mx = s.px + Math.cos(s.angle) * 11;
        const my = s.py + Math.sin(s.angle) * 11;
        const big = s.weapon === 1 ? 3 : 2;
        ctx.fillStyle = YELLOW;
        ctx.fillRect(Math.round(mx - big), Math.round(my - big), big * 2, big * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(Math.round(mx - 1), Math.round(my - 1), 2, 2);
      }
    };

    const light = (x: number, y: number, r: number, a = 1) => {
      const g = dctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(0.55, `rgba(0,0,0,${a * 0.6})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      dctx.fillStyle = g;
      dctx.fillRect(x - r, y - r, r * 2, r * 2);
    };
    const glow = (x: number, y: number, r: number, color: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    };

    const drawDarkness = (clock: number) => {
      const cx = Math.round(s.camX);
      const cy = Math.round(s.camY);
      dctx.globalCompositeOperation = "source-over";
      dctx.clearRect(0, 0, VW, VH);
      dctx.fillStyle = `rgba(6,0,2,${DARKNESS})`;
      dctx.fillRect(0, 0, VW, VH);
      dctx.globalCompositeOperation = "destination-out";
      const flick = 1 + Math.sin(clock * 13) * 0.02 + Math.sin(clock * 7.3) * 0.03;
      light(s.px - cx, s.py - cy, LIGHT_RADIUS * flick);
      if (s.muzzle > 0) light(s.px - cx + Math.cos(s.angle) * 12, s.py - cy + Math.sin(s.angle) * 12, s.weapon === 1 ? 170 : 120);
      for (const f of s.fballs) light(f.x - cx, f.y - cy, f.big ? 34 : 26);
      for (const l of lava) light(l.tx * T + T / 2 - cx, l.ty * T + T / 2 - cy, 18, 0.7);
      for (const p of portals) light(p.x - cx, p.y - cy, 24 + Math.sin(clock * 3 + p.x) * 4, 0.8);
      ctx.drawImage(darkCv, 0, 0);
      // coloured glows on top
      ctx.globalCompositeOperation = "lighter";
      for (const f of s.fballs) glow(f.x - cx, f.y - cy, f.big ? 16 : 12, "rgba(255,110,20,0.55)");
      for (const p of portals) glow(p.x - cx, p.y - cy, 16, "rgba(255,20,20,0.25)");
      if (s.muzzle > 0) glow(s.px - cx + Math.cos(s.angle) * 12, s.py - cy + Math.sin(s.angle) * 12, 30, "rgba(255,210,80,0.45)");
      ctx.globalCompositeOperation = "source-over";
      for (const e of eyes) {
        ctx.fillStyle = e.c;
        ctx.fillRect(e.x - cx, e.y - cy, 1, 1);
      }
    };

    const drawCrosshair = () => {
      const x = Math.round(mouse.x);
      const y = Math.round(mouse.y);
      const gap = 2 + (s.recoil > 0 ? (s.weapon === 1 ? 3 : 1) : 0); // (the SMG: like the pistol)
      const len = 3;
      const segs: [number, number, number, number][] = [
        [x - gap - len, y, len, 1],
        [x + gap + 1, y, len, 1],
        [x, y - gap - len, 1, len],
        [x, y + gap + 1, 1, len],
        [x, y, 1, 1],
      ];
      ctx.fillStyle = "#000";
      for (const [a, b, w, h] of segs) ctx.fillRect(a - 1, b - 1, w + 2, h + 2);
      ctx.fillStyle = RED;
      for (const [a, b, w, h] of segs) ctx.fillRect(a, b, w, h);
    };

    const drawFace = (x: number, y: number) => {
      ctx.drawImage(faceFor(skin()), x, y);
      // eyes look towards the crosshair
      const look = mouse.x < W / 2 - 40 ? -1 : mouse.x > W / 2 + 40 ? 1 : 0;
      ctx.fillStyle = "#111";
      if (s.mode === "dead") {
        ctx.fillRect(x + 3, y + 6, 2, 1);
        ctx.fillRect(x + 7, y + 6, 2, 1);
      } else {
        ctx.fillRect(x + 3 + look, y + 5, 1, 2);
        ctx.fillRect(x + 8 + look, y + 5, 1, 2);
      }
      // the more hurt, the more blood
      const blood = s.mode === "dead" ? 6 : Math.floor((1 - s.hp / maxHp()) * 6);
      ctx.fillStyle = "#c00000";
      const spots = [
        [2, 8],
        [9, 4],
        [4, 10],
        [10, 7],
        [6, 3],
        [1, 6],
      ];
      for (let i = 0; i < blood; i++) ctx.fillRect(x + spots[i][0], y + spots[i][1], 1, 2);
      if (s.hurt > 0) {
        ctx.fillStyle = "rgba(255,0,0,0.4)";
        ctx.fillRect(x, y, 12, 12);
      }
    };

    const drawHud = () => {
      const y = VH;
      ctx.fillStyle = "#1a1414";
      ctx.fillRect(0, y, W, BAR);
      ctx.fillStyle = "#3a3030";
      ctx.fillRect(0, y, W, 1);
      ctx.fillStyle = "#0a0808";
      ctx.fillRect(0, y + 1, W, 1);
      // weapon + ammo
      ctx.fillStyle = s.weapon === 1 ? "#c2241a" : s.weapon === 2 ? "#6e6e6e" : "#a0a0a0";
      ctx.fillRect(6, y + 5, s.weapon === 1 ? 12 : s.weapon === 2 ? 10 : 7, 3);
      ctx.fillRect(6, y + 8, 3, 3);
      text(s.weapon === 1 ? `${s.shells}` : "--", 22, y + 4, s.weapon === 1 && s.shells < 4 ? RED : YELLOW, 8, "left");
      // health
      const hx = 70;
      ctx.fillStyle = "#e01010";
      ctx.fillRect(hx + 1, y + 4, 2, 1);
      ctx.fillRect(hx + 4, y + 4, 2, 1);
      ctx.fillRect(hx, y + 5, 7, 2);
      ctx.fillRect(hx + 1, y + 7, 5, 1);
      ctx.fillRect(hx + 2, y + 8, 3, 1);
      ctx.fillRect(hx + 3, y + 9, 1, 1);
      text(`${Math.ceil(s.hp)}`, hx + 11, y + 4, s.hp < 30 ? (Math.floor(clockNow * 4) % 2 ? RED : "#ffffff") : RED, 8, "left");
      // face in the middle
      ctx.fillStyle = "#0a0808";
      ctx.fillRect(W / 2 - 8, y + 1, 16, BAR - 1);
      drawFace(W / 2 - 6, y + 2);
      text(`WAVE ${s.wave}`, 190, y + 4, "#ff8a8a", 8, "left");
      text(`${s.score}`, W - 4, y + 4, "#ffffff", 8, "right");
    };

    let clockNow = 0;
    const render = (clock: number) => {
      eyes.length = 0;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VW, VH);
      ctx.clip();
      let sx = 0;
      let sy = 0;
      if (s.shake > 0) {
        const m = Math.min(4, s.shake * 10);
        sx = Math.round((Math.random() - 0.5) * m);
        sy = Math.round((Math.random() - 0.5) * m);
      }
      ctx.translate(-Math.round(s.camX) + sx, -Math.round(s.camY) + sy);
      ctx.drawImage(mapCv, 0, 0);
      drawLava(clock);
      for (const p of portals) drawPortal(p.x, p.y, clock);
      for (const p of s.pickups) drawPickup(p);
      // demons + Pinkmane, sorted so the lower ones are drawn in front
      const things: { y: number; draw: () => void }[] = s.enemies.map((e) => ({ y: e.y + (e.kind === "boss" ? 100 : 0), draw: () => drawEnemy(e, clock) }));
      things.push({ y: s.py, draw: drawPlayer });
      things.sort((a, b) => a.y - b.y);
      for (const th of things) th.draw();
      // bullets
      for (const b of s.bullets) {
        const l = Math.hypot(b.vx, b.vy);
        ctx.fillStyle = "#fff6a0";
        ctx.fillRect(Math.round(b.x), Math.round(b.y), 1, 1);
        ctx.fillStyle = YELLOW;
        ctx.fillRect(Math.round(b.x - (b.vx / l) * 2), Math.round(b.y - (b.vy / l) * 2), 1, 1);
      }
      for (const f of s.fballs) {
        const r = f.big ? 3 : 2;
        ctx.fillStyle = "#ff2a2a";
        ctx.fillRect(Math.round(f.x - r - 1), Math.round(f.y - r), r * 2 + 2, r * 2);
        ctx.fillRect(Math.round(f.x - r), Math.round(f.y - r - 1), r * 2, r * 2 + 2);
        ctx.fillStyle = "#ff9a1a";
        ctx.fillRect(Math.round(f.x - r), Math.round(f.y - r), r * 2, r * 2);
        ctx.fillStyle = "#fff6a0";
        ctx.fillRect(Math.round(f.x - 1), Math.round(f.y - 1), 2, 2);
      }
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, VW, VH);
      ctx.clip();
      drawDarkness(clock);
      for (const p of s.pops) text(p.text, p.x - s.camX, p.y - s.camY, p.color);
      // red flash when you get hurt
      if (s.hurt > 0) {
        ctx.fillStyle = `rgba(255,0,0,${(s.hurt / 0.35) * 0.3})`;
        ctx.fillRect(0, 0, VW, VH);
      }
      if (s.mode === "play" && s.hp < 30) {
        ctx.fillStyle = `rgba(160,0,0,${0.12 + Math.sin(clock * 6) * 0.06})`;
        ctx.fillRect(0, 0, VW, VH);
      }
      ctx.restore();

      if (s.mode !== "ready") drawHud(); // (the start screen has its own text down there)

      if (s.bannerT > 0 && s.mode === "play") {
        const a = Math.min(1, s.bannerT * 2);
        ctx.globalAlpha = a;
        text(s.banner, W / 2, 30, s.bannerColor, 16);
        ctx.globalAlpha = 1;
      }

      // the side panels on the start + game over screens: your souls, and the SHOP
      const drawPanels = () =>
        drawSidePanels(ctx, fontFamily, {
          W,
          money: shop.money(),
          moneyName: "SOULS",
          icon: soulIcon,
          touch: touchy,
          t: clock,
          preview: (c, cx, cy) => drawShopPreview(c, shop.wearing("skin"), cx, cy, clock),
        });
      if (s.mode === "ready") {
        // the start screen every game shares
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: clock,
          title: GAME_TITLE,
          sub: `< ${MAPS[mapIdx].name} >`,
          lines: touchy
            ? [
                ["JOYSTICK = MOVE", "#ffffff"],
                ["HOLD FIRE = SHOOT", KIT.lilac],
                ["GUN = SWITCH WEAPON", KIT.lilac],
              ]
            : [
                ["WSAD = MOVE  MOUSE = AIM", "#ffffff"],
                ["CLICK = SHOOT", KIT.lilac],
                ["1 2 3 / Q = WEAPON", KIT.lilac],
              ],
          start: touchy ? "PRESS START" : "CLICK TO START",
          best: top ? `#1 ${top.name} ${top.score}` : best > 0 ? `BEST ${best}` : undefined,
          hint: touchy ? "TAP THE MAP NAME = OTHER MAP" : "\u2190 \u2192 = MAP   M = SOUNDS   - / + = FX",
          dim: 0.62,
        });
        drawPanels();
      }
      if (s.mode === "dead") {
        // the game over screen every game shares
        drawOverScreen(ctx, fontFamily, {
          W,
          H,
          t: clock,
          age: s.t,
          title: "YOU DIED",
          score: `SCORE ${s.score}`,
          best: `BEST ${best}`,
          newBest: s.newBest,
          stats: `WAVE ${s.wave}   ${s.kills} KILLS`,
          again: touchy ? "PRESS AGAIN" : "CLICK = AGAIN",
          saved: `+${s.souls} SOULS SAVED`,
        });
        if (s.t > 0.4) drawPanels();
      }
      if (s.paused && !shopUi.open) {
        drawPauseMenu(ctx, fontFamily, { W, H, row: pauseRow, t: clock, touch: touchy, stats: `WAVE ${s.wave}  SCORE ${s.score}  +${s.souls}` });
      }
      if (shopUi.open) {
        shopUi.ui.t = clock;
        drawPinkShop(ctx, fontFamily, HELL_SHOP_ROWS, shopUi.ui, shopHooks, {
          W,
          H,
          touch: touchy,
          backLine: shopUi.fromPause ? "BACK TO YOUR GAME" : "BACK TO THE START SCREEN",
        });
      } else {
        // the FX speaker (+ the slider when you're not playing)
        drawFxIcon(ctx, fx, "#ffffff");
        if (s.mode !== "play" || s.paused || fx.drag) drawFxSlider(ctx, fontFamily, fx);
      }
      // (the crosshair stays on the menus too: it's your mouse pointer)
      if (!touchy || (s.mode === "play" && !s.paused && !shopUi.open)) drawCrosshair();
    };

    // the shop's preview box + the SHOP panel: Pinkmane in a skin (turning round), the SMG, or an upgrade's picture
    const drawShopPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = "#1a0e0e";
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const sk = id && id.startsWith("skin:") ? id.split(":")[1] : skin();
      const frames = playerFramesFor(sk);
      const spin = frames[Math.floor(Math.max(0, t) * 6) % frames.length];
      if (id === "gun:smg") {
        c.fillStyle = "#6e6e6e";
        c.fillRect(cx - 14, cy - 3, 26, 5);
        c.fillRect(cx - 14, cy + 2, 6, 8);
        c.fillRect(cx - 2, cy + 2, 4, 9);
        c.fillStyle = "#3a3a3a";
        c.fillRect(cx + 12, cy - 2, 6, 3);
        if (Math.floor(t * 12) % 2 === 0) {
          c.fillStyle = YELLOW;
          c.fillRect(cx + 19, cy - 3, 3, 5);
        }
        return;
      }
      if (id === "up:hp" || id === "up:med") {
        c.fillStyle = id === "up:med" ? "#ffffff" : "#e01010";
        c.fillRect(cx - 9, cy - 9, 18, 18);
        c.fillStyle = id === "up:med" ? "#e01010" : "#ffffff";
        c.fillRect(cx - 2, cy - 7, 4, 14);
        c.fillRect(cx - 7, cy - 2, 14, 4);
        return;
      }
      if (id === "up:shells") {
        for (let i = 0; i < 4; i++) {
          c.fillStyle = "#c2241a";
          c.fillRect(cx - 12 + i * 7, cy - 6, 5, 10);
          c.fillStyle = YELLOW;
          c.fillRect(cx - 12 + i * 7, cy + 4, 5, 3);
        }
        return;
      }
      c.drawImage(spin, Math.round(cx - spin.width), Math.round(cy - spin.height), spin.width * 2, spin.height * 2);
    };

    let raf = 0;
    let last = performance.now();
    let lastState = "";
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      clockNow = now / 1000;
      step(dt);
      render(clockNow);
      // tell the phone buttons (HellPad) when the game starts / ends / pauses, so START turns into FIRE
      const held = s.paused || shopUi.open; // (the shop counts as paused for the phone buttons)
      const st = `${s.mode}|${held}|${s.mode === "dead" && s.t > 1}`;
      if (st !== lastState) {
        lastState = st;
        window.dispatchEvent(new CustomEvent("pinkmane-hell-state", { detail: { mode: s.mode === "dead" && s.t <= 1 ? "play" : s.mode, paused: held } }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (s.mode === "play") shop.add(s.souls); // leaving with EXIT / BACKSPACE: keep the souls from this run
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pinkmane-hell-stick", onStick);
      document.removeEventListener("visibilitychange", onHidden);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onMenu);
      goRef.current = null;
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily, spinRef]);

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
        background: "#0a0204",
        touchAction: "none",
        cursor: "none",
      }}
    />
    <ScorePanel game="hell" title="PINK HELL" apiRef={boardRef} fontFamily={fontFamily} accent="#ff2a2a" />
    </>
  );
}
