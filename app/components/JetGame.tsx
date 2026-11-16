"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import {
  type ShopRow,
  type ShopHooks,
  type ShopBox,
  newShopUi,
  shopMove,
  shopSide,
  shopAct,
  shopTap,
  drawPinkShop,
  drawSidePanels,
  panelShopHit,
  PAUSE_ROWS,
  drawPauseMenu,
  pauseTapRow,
} from "./PinkShop";

// PINK JETPACK (DEMO): an endless side-scrolling jetpack game.
// Pinkmane flies through the night city. His jetpack shoots WEED LEAVES downwards, that's what pushes him up.
//   HOLD  SPACE / UP / W / mouse button / finger on the screen  = fly up
//   LET GO                                                      = fall down
//   ESC / P (or the PAUSE button on phones)                     = pause
// Dodge the ZAPPERS (electric bars) and the ROCKETS (a red ! shows where one is coming from).
// Collect the green gems. The little PIGLETS on the ground don't hurt you: hit one with your weed leaves for bonus gems.
// One hit and the run is over. Score = meters + 5 for every gem. Your best score is saved in the browser,
// and a good score goes on the online Top 10 (the same box as PINK JUNGLE, board id "jet").
// SOUND EFFECTS: the speaker icon top left turns them on / off (or press M), the little slider under it sets how loud
// (drag it, or press - and +). Your choice is saved in the browser.
// PINK SHOP (the same shop screen as the other games, see PinkShop.ts): S / DOWN or tap SHOP on the start / game over screen,
//   or SHOP in the pause menu. Gems you collect are saved and spent there on outfits, jetpack trails and upgrades.
// PAUSE MENU: RESUME / RESTART / SHOP / GAME MENU (back to the PSP game list).

type Props = {
  // Goes up by 1 every time the player presses OK / A on the handheld (= start, or a short puff of the jetpack)
  actionSignal: number;
  // The pixel font from the page, so the game text matches the other games
  fontFamily: string;
  // Follows the mute button
  muted: boolean;
  // true on phones / tablets: you hold a finger anywhere on the screen to fly
  touch?: boolean;
  // The page's beat clock (the same one PINK JUNGLE gets). Leave it out and the game simply doesn't react to the music.
  beatRef?: { current: { kick: number; live: boolean } };
};

// The name of the game on its start screen (the PSP game list has its own copy in page.tsx)
const GAME_TITLE = "PINK JETPACK";
// Where the best score is saved in the browser
const BEST_KEY = "pinkmane-jet-best";
// Where the sound effects settings are saved in the browser
const FX_KEY = "pinkmane-jet-fx"; // "on" / "off"
const FX_VOL_KEY = "pinkmane-jet-fx-volume"; // 0 to 1
// Where your saved gems and the shop things are kept in the browser
const BANK_KEY = "pinkmane-jet-gems";
const SHOP_KEY = "pinkmane-jet-shop";
// Your pixel dude, the same picture PINKMANE VOID uses (walking frames side by side, each 24 x 35, he looks to the right).
// If the picture can't be loaded, a simple drawn Pinkmane is used instead.
const DUDE_IMAGE = "/game/pinkdude.png";

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const START_SPEED = 95; // how fast the world moves at the start (pixels per second, 10 pixels = 1 meter)
const MAX_SPEED = 235; // the fastest it ever gets
const SPEED_GAIN = 0.09; // how much faster it gets for every meter you fly (smaller = easier)
const GRAVITY = 560; // how hard you fall
const THRUST = 620; // how hard the jetpack pushes you up while you hold
const MAX_UP = 175; // fastest you can fly up
const MAX_DOWN = 220; // fastest you can fall
const SAFE_START = 300; // first pixels with nothing in your way (30 meters)
const GAP_START = 190; // pixels between two obstacles at the start (bigger = easier)
const GAP_MIN = 105; // ...and the smallest it ever gets
const ROCKETS_FROM = 150; // meters before the first rocket can come
const SPIN_FROM = 400; // meters before zappers can start to spin
const ROCKET_WARN = 1.1; // seconds the red ! follows you before the rocket is fired
const ROCKET_SPEED = 250; // how fast a rocket flies (on top of the world speed)
const LEAF_EVERY = 0.035; // seconds between two weed leaves while you fly (smaller = more leaves)
const LEAF_FALL = 170; // how fast the leaves fall (smaller = they stay on the screen longer)
const PIG_GEMS = 3; // bonus gems for hitting a piglet with a leaf
const PIG_EVERY = 240; // about how many pixels between two piglets (smaller = more piglets)

// ---------- PINK SHOP ----------
// OUTFITS: price 0 = free. file = the outfit picture PINKMANE VOID uses (the same layout as pinkdude.png).
// If a file is missing, the classic picture is repainted with the 3 colours in recolor (dark, main, light) instead.
// ghost = drawn a bit see-through.
const OUTFITS: { id: string; name: string; price: number; file?: string; recolor?: [string, string, string]; ghost?: boolean }[] = [
  { id: "classic", name: "CLASSIC PINKMANE", price: 0 },
  { id: "trippy", name: "TRIPPY PINKMANE", price: 150, file: "/game/pinkdude-pinkfit.png", recolor: ["#a8287e", "#ff5fd2", "#ffb8ee"] },
  { id: "icy", name: "ICY PINKMANE", price: 250, file: "/game/pinkdude-icy.png", recolor: ["#2a9ad0", "#8fd9ff", "#e8f8ff"] },
  { id: "ghost", name: "GHOSTY PINKMANE", price: 350, file: "/game/pinkdude-ghost.png", recolor: ["#7ab8a8", "#bfe9d8", "#f0fff8"], ghost: true },
  { id: "toxic", name: "TOXIC PINKMANE", price: 450, recolor: ["#2c8a33", "#6fdc5a", "#b8ff9a"] },
  { id: "bloody", name: "BLOODY PINKMANE", price: 550, recolor: ["#7a0c0c", "#d21e1e", "#ff6a6a"] },
  { id: "shadow", name: "SHADOW PINKMANE", price: 650, recolor: ["#1e1230", "#3b2456", "#7a5aa8"] },
  { id: "gold", name: "GOLD PINKMANE", price: 900, recolor: ["#b8860b", "#ffd700", "#fff3a0"] },
];
// JETPACK TRAILS: what comes out of the jetpack (they hit piglets just like the weed leaves)
const TRAILS: { id: string; name: string; price: number; info: [string, string] }[] = [
  { id: "leaves", name: "WEED LEAVES", price: 0, info: ["THE CLASSIC: WEED LEAVES", "THEY POP THE PIGLETS"] },
  { id: "fire", name: "FIRE", price: 120, info: ["YOUR JETPACK SPITS FLAMES", "THEY POP THE PIGLETS TOO"] },
  { id: "ice", name: "ICE", price: 180, info: ["ICE CRYSTALS AND FROSTY LEAVES", "THEY POP THE PIGLETS TOO"] },
  { id: "rainbow", name: "RAINBOW", price: 260, info: ["LEAVES IN EVERY COLOUR", "THEY POP THE PIGLETS TOO"] },
  { id: "gold", name: "GOLD LEAVES", price: 400, info: ["SOLID GOLD WEED LEAVES", "THEY POP THE PIGLETS TOO"] },
];
// UPGRADES: one price per level
const UPGRADES: { id: "magnet" | "shield" | "pigs"; name: string; prices: number[]; info: [string, string] }[] = [
  { id: "magnet", name: "GEM MAGNET", prices: [60, 150, 300], info: ["PULLS NEARBY GEMS TO YOU", "A BIGGER PULL EVERY LEVEL"] },
  { id: "shield", name: "SHIELD", prices: [120, 300], info: ["BLOCKS ONE HIT EVERY RUN", "LEVEL 2 BLOCKS TWO HITS"] },
  { id: "pigs", name: "PIGGY BANK", prices: [50, 120, 250], info: ["MORE GEMS FROM EVERY PIGLET", "+1 GEM PER PIGLET EACH LEVEL"] },
];
const MAGNET_RANGE = [0, 22, 34, 48]; // how far the magnet reaches at each level (pixels)
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "OUTFITS" },
  ...OUTFITS.map((o): ShopRow => ({ kind: "item", id: `outfit:${o.id}`, name: o.name, prices: [o.price], wear: true, info: [o.name, ""] })),
  { kind: "head", label: "JETPACK TRAILS" },
  ...TRAILS.map((t): ShopRow => ({ kind: "item", id: `trail:${t.id}`, name: t.name, prices: [t.price], wear: true, info: t.info })),
  { kind: "head", label: "UPGRADES" },
  ...UPGRADES.map((u): ShopRow => ({ kind: "item", id: `up:${u.id}`, name: u.name, prices: u.prices, info: u.info })),
  { kind: "back" },
];

// ---------- Screen ----------
// wide picture, the same shape as PINK JUNGLE, so it fills the PINKMANE handheld screen
const W = 320;
const H = 150;
const CEIL = 12; // the ceiling (you can't fly higher)
const FLOOR = 134; // the ground (you run on it)
const PX = 56; // where Pinkmane is on the screen (left edge of his picture)
const SW = 24; // his picture: 24 x 35 pixels
const SH = 35;
// the part of him that can be hit (hair, arms and the jetpack don't count, so close calls feel fair)
const HB = { x: 8, y: 6, w: 9, h: 27 };
// the speaker icon (top left, on the ceiling) and the sound effects slider under it
const FX_ICON = { x: 4, y: 2, w: 16, h: 12 }; // the area you can click / tap
const FX_SLIDER = { x: 7, top: 22, bottom: 58 }; // top = loud, bottom = quiet

// ---------- Colours ----------
const PINK = "#ff5fd2";
const GREEN = "#7dff6a";
const YELLOW = "#ffd24a";
const SKY = ["#2a1258", "#40197c", "#5c24a0", "#8433c0"]; // the sky, top to bottom (lighter colours = a brighter game)
const FAR_CITY = "#4c2690"; // the buildings far away
const NEAR_CITY = "#2b1458"; // the buildings close by
const NEAR_CITY_TOP = "#45238a"; // ...and their roof edge
const GROUND = "#2e1852"; // the floor you run on
const ROOF = "#1c0e36"; // the ceiling

// ---------- Pixel sprites ----------
// a weed leaf (7 x 7)
const LEAF_MAP = ["...G...", ".G.G.G.", "..GLG..", "GGLLLGG", "..GLG..", ".G.d.G.", "...d..."];
const LEAF_COLORS: Record<string, string> = { G: "#3ee05a", L: "#b6ff9e", d: "#1d6b2a" };
const LEAF_COLORS_DARK: Record<string, string> = { G: "#2c8a33", L: "#3ee05a", d: "#1d6b2a" };
// the FIRE trail: a little flame (5 x 7)
const FLAME_MAP = ["..Y..", ".YYY.", ".YOY.", "YOOOY", "YORoY", ".ORO.", "..R.."];
const FLAME_COLORS: Record<string, string> = { Y: "#ffe34a", O: "#ff8a1a", R: "#e0301a", o: "#fff3b0" };
// the ICE trail: an ice crystal (5 x 5)
const ICE_MAP = ["..W..", "W.W.W", ".WCW.", "W.W.W", "..W.."];
const ICE_COLORS: Record<string, string> = { W: "#e8f8ff", C: "#6ae0ff" };
// a piglet (11 x 8), looking to the left
const PIG_MAP = [".PP....PP..", "PPPPPPPPPP.", "PKPPPPPPPPc", "NNPPPPPPPP.", "NNPPPPPPPP.", ".PPPPPPPPP.", ".P.P..P.P..", ".A.A..A.A.."];
const PIG_COLORS: Record<string, string> = { P: "#ff8fb8", N: "#ff5f9a", K: "#111111", c: "#ff5f9a", A: "#8a3a5a" };

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

// A simple drawn Pinkmane (only used when /game/pinkdude.png can't be loaded). step = his legs take a step.
function buildDude(step: boolean) {
  const cv = document.createElement("canvas");
  cv.width = SW;
  cv.height = SH;
  const g = cv.getContext("2d")!;
  const r = (c: string, x: number, y: number, w: number, h: number) => {
    g.fillStyle = c;
    g.fillRect(x, y, w, h);
  };
  // pink spiky hair
  r("#d63cc8", 7, 2, 11, 6);
  r("#d63cc8", 8, 0, 2, 2);
  r("#d63cc8", 12, 0, 2, 2);
  r("#d63cc8", 16, 1, 2, 2);
  r("#d63cc8", 6, 4, 2, 5);
  // face (he looks to the right)
  r("#ffc800", 9, 7, 9, 6);
  r("#111111", 15, 9, 2, 2);
  // black tee + arm
  r("#111111", 7, 13, 11, 11);
  r("#ffc800", 17, 17, 3, 3);
  // grey pants + shoes
  r("#787878", 8, 24, 4, step ? 7 : 9);
  r("#787878", 13, 24, 4, step ? 9 : 7);
  r("#111111", 8, step ? 31 : 33, 5, 2);
  r("#111111", 13, step ? 33 : 31, 5, 2);
  return cv;
}

// Number noise, so the city looks the same every time
function hash(a: number, b: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const mod = (a: number, n: number) => ((a % n) + n) % n;

// Everything below has "x" in WORLD pixels (how far along the city it is). On screen it's drawn at x - scroll.
type Zapper = { x: number; y: number; len: number; ang: number; spin: number };
type Gem = { x: number; y: number; taken: boolean };
type Pig = { x: number; dir: number; dead: boolean };
// A rocket is on the SCREEN, not in the world: warn = the ! follows you, lock = the ! stops and blinks fast, fly = it's coming
type Rocket = { stage: "warn" | "lock" | "fly"; t: number; x: number; y: number };
type Leaf = { x: number; y: number; vx: number; vy: number; pic: HTMLCanvasElement; wob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Popup = { x: number; y: number; text: string; life: number; color: string };
type Mode = "ready" | "running" | "dead";

export default function JetGame({ actionSignal, fontFamily, muted, touch = false, beatRef }: Props) {
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const beatSrc = useRef(beatRef);
  beatSrc.current = beatRef;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // what is being held down right now (any of them = the jetpack is on)
  const holdRef = useRef({ key: false, mouse: false, touch: false });
  // a fresh press (start / play again / resume)
  const pressRef = useRef<(() => void) | null>(null);
  // a short puff of the jetpack (for the OK / A button, which can only be tapped)
  const puffRef = useRef<(() => void) | null>(null);
  const lastSignal = useRef(actionSignal);
  const boardRef = useRef<ScoreApi | null>(null); // the online Top 10 box (Scoreboard.tsx), board id "jet"
  // a click / tap on the game picture, in game pixels. Returns true if it hit the speaker icon or the slider.
  const fxTapRef = useRef<((x: number, y: number) => boolean) | null>(null);
  const fxDragRef = useRef<((y: number) => void) | null>(null);
  const fxDragging = useRef(false);
  // true while the shop or the pause menu is open (a tap outside the picture then does nothing, instead of flying / buying)
  const menuOpenRef = useRef<(() => boolean) | null>(null);

  // OK / A from the page = start, or a short puff while flying.
  // (SPACE also arrives here, but the game already handles the keyboard itself, so that one is skipped.)
  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    if (holdRef.current.key) return;
    pressRef.current?.();
    puffRef.current?.();
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const hold = holdRef.current;
    hold.key = hold.mouse = hold.touch = false;

    // ---------- sprites ----------
    const leafImg = [buildMap(LEAF_MAP, LEAF_COLORS), buildMap(LEAF_MAP, LEAF_COLORS_DARK)];
    // the pictures each jetpack trail shoots out (one is picked at random for every particle)
    const recolorLeaf = (G: string, L: string, d: string) => buildMap(LEAF_MAP, { G, L, d });
    const trailPics: Record<string, HTMLCanvasElement[]> = {
      leaves: leafImg,
      fire: [buildMap(FLAME_MAP, FLAME_COLORS), buildMap(FLAME_MAP, { ...FLAME_COLORS, Y: "#ffd24a", o: "#ffffff" })],
      ice: [buildMap(ICE_MAP, ICE_COLORS), recolorLeaf("#6ae0ff", "#e8f8ff", "#2a9ad0"), recolorLeaf("#8fd9ff", "#ffffff", "#2a9ad0")],
      rainbow: ["#ff3b3b", "#ffa23a", "#ffe34a", "#3ee05a", "#6ae0ff", "#b46aff"].map((c) => recolorLeaf(c, "#ffffff", "#111111")),
      gold: [recolorLeaf("#ffd24a", "#fff3b0", "#b8860b"), recolorLeaf("#e0b020", "#ffd24a", "#8a6a0b")],
    };
    const pigImg = buildMap(PIG_MAP, PIG_COLORS);
    const drawnDude = [buildDude(false), buildDude(true)];
    let dudeImg: HTMLImageElement | null = null;
    // the outfits: their own picture if it loads, otherwise the classic picture repainted
    const outfitPics: Record<string, CanvasImageSource | null> = {};
    const repaint = (src: HTMLImageElement, cols: [string, string, string]) => {
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      const g = c.getContext("2d")!;
      g.drawImage(src, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height);
      const a = d.data;
      const rgb = cols.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
      for (let i = 0; i < a.length; i += 4) {
        const r = a[i];
        const gg = a[i + 1];
        const b = a[i + 2];
        if (a[i + 3] === 0 || !(r > 120 && b > 100 && gg < 140 && r - gg > 50)) continue; // only the pink parts (the hair)
        const l = (r + gg + b) / 765;
        const pick = rgb[l < 0.45 ? 0 : l > 0.75 ? 2 : 1];
        a[i] = pick[0];
        a[i + 1] = pick[1];
        a[i + 2] = pick[2];
      }
      g.putImageData(d, 0, 0);
      return c;
    };
    const img = new Image();
    img.onload = () => {
      if (img.width < SW * 2 || img.height < SH) return;
      dudeImg = img;
      for (const o of OUTFITS) {
        if (o.recolor && !outfitPics[o.id]) outfitPics[o.id] = repaint(img, o.recolor);
        if (o.file) {
          const own = new Image();
          own.onload = () => {
            if (own.width >= SW * 2 && own.height >= SH) outfitPics[o.id] = own;
          };
          own.src = o.file;
        }
      }
    };
    img.src = DUDE_IMAGE;

    // the beat of the song: 1 right on the beat, falling to 0. 0 = no music playing right now
    const beatKick = () => {
      const b = beatSrc.current?.current;
      return b && b.live ? Math.max(0, b.kick) : 0;
    };

    // ---------- sound ----------
    let ac: AudioContext | null = null;
    // sound effects on / off + how loud (saved in the browser)
    const fx = { on: true, vol: 1, drag: false };
    try {
      fx.on = localStorage.getItem(FX_KEY) !== "off";
      const v = localStorage.getItem(FX_VOL_KEY);
      if (v !== null && !Number.isNaN(Number(v))) fx.vol = Math.max(0, Math.min(1, Number(v)));
    } catch {}
    const saveFx = () => {
      try {
        localStorage.setItem(FX_KEY, fx.on ? "on" : "off");
        localStorage.setItem(FX_VOL_KEY, String(fx.vol));
      } catch {}
    };
    // moving the slider up from 0 also turns the sounds back on
    const setFxVolume = (v: number) => {
      fx.vol = Math.round(Math.max(0, Math.min(1, v)) * 20) / 20;
      if (fx.vol > 0) fx.on = true;
      saveFx();
    };
    const toggleFx = () => {
      fx.on = !fx.on;
      if (fx.on && fx.vol <= 0) fx.vol = 0.5;
      saveFx();
    };
    const tone = (f1: number, f2: number, dur: number, type: OscillatorType, vol = 0.08, delay = 0) => {
      if (mutedRef.current || !fx.on || fx.vol <= 0) return;
      vol *= fx.vol;
      try {
        if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (ac.state === "suspended") ac.resume();
        const t0 = ac.currentTime + delay;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
        g.gain.setValueAtTime(vol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(ac.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      } catch {}
    };
    const sfx = {
      start: () => {
        tone(330, 660, 0.1, "square", 0.05);
        tone(660, 990, 0.12, "square", 0.05, 0.1);
      },
      jet: () => tone(150 + Math.random() * 50, 80, 0.06, "sawtooth", 0.02),
      gem: () => tone(990, 1480, 0.08, "square", 0.045),
      pig: () => {
        tone(520, 260, 0.12, "sawtooth", 0.06); // oink
        tone(990, 1480, 0.08, "square", 0.04, 0.08);
      },
      warn: () => {
        tone(880, 880, 0.07, "square", 0.05);
        tone(880, 880, 0.07, "square", 0.05, 0.14);
      },
      launch: () => tone(700, 120, 0.35, "sawtooth", 0.06),
      zap: () => {
        tone(1400, 80, 0.3, "sawtooth", 0.1);
        tone(90, 40, 0.5, "square", 0.08, 0.05);
      },
      boom: () => {
        tone(200, 40, 0.5, "sawtooth", 0.12);
        tone(110, 30, 0.6, "square", 0.08, 0.04);
      },
      click: () => tone(420, 380, 0.04, "square", 0.03),
      buy: () => {
        tone(520, 1040, 0.1, "square", 0.06);
        tone(780, 1560, 0.1, "square", 0.06, 0.1);
        tone(1040, 2080, 0.2, "square", 0.06, 0.2);
      },
      no: () => tone(200, 120, 0.18, "square", 0.06),
      shield: () => {
        tone(900, 300, 0.18, "triangle", 0.09);
        tone(1400, 700, 0.1, "square", 0.04, 0.03);
      },
    };

    // ---------- best score ----------
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- saved gems + shop ----------
    let bank = 0;
    let owned: string[] = []; // shop ids of the outfits + trails you bought
    const lv = { magnet: 0, shield: 0, pigs: 0 };
    let outfit = "classic";
    let trail = "leaves";
    try {
      bank = Math.max(0, Math.floor(Number(localStorage.getItem(BANK_KEY)) || 0));
      const d = JSON.parse(localStorage.getItem(SHOP_KEY) || "null") as {
        owned?: string[];
        lv?: Record<string, number>;
        outfit?: string;
        trail?: string;
      } | null;
      if (d) {
        if (Array.isArray(d.owned)) owned = d.owned.filter((x) => typeof x === "string");
        for (const u of UPGRADES) lv[u.id] = Math.max(0, Math.min(u.prices.length, Math.floor(Number(d.lv?.[u.id]) || 0)));
        if (d.outfit && OUTFITS.some((o) => o.id === d.outfit && (o.price === 0 || owned.includes(`outfit:${o.id}`)))) outfit = d.outfit;
        if (d.trail && TRAILS.some((t) => t.id === d.trail && (t.price === 0 || owned.includes(`trail:${t.id}`)))) trail = d.trail;
      }
    } catch {}
    const saveShop = () => {
      try {
        localStorage.setItem(BANK_KEY, String(bank));
        localStorage.setItem(SHOP_KEY, JSON.stringify({ owned, lv, outfit, trail }));
      } catch {}
    };
    const outfitDef = () => OUTFITS.find((o) => o.id === outfit) ?? OUTFITS[0];
    // the picture to draw for an outfit (a canvas / image with the 24 x 35 frames side by side, or the drawn one)
    const outfitPic = (id: string) => outfitPics[id] ?? dudeImg;

    // ---------- game state ----------
    const pause = { on: false, row: 0 };
    const shop = { open: false, from: "ready" as "ready" | "dead" | "pause", ui: newShopUi(SHOP_ROWS) };
    const s = {
      mode: "ready" as Mode,
      t: 0, // seconds in this mode
      runT: 0, // seconds this run has lasted (the scoreboard checks the score is possible for that time)
      scroll: 0, // how far the world has moved (pixels)
      speed: START_SPEED,
      y: FLOOR - SH, // top of Pinkmane's picture
      vy: 0,
      rot: 0, // he spins when he's hit
      puff: 0, // seconds of jetpack left from a tap on OK / A
      leafT: 0,
      jetT: 0,
      gems: 0,
      score: 0,
      newBest: false,
      why: "", // what got you (shown on the game over screen)
      shake: 0,
      nextAt: SAFE_START, // where the next obstacle goes
      nextPig: 200,
      zaps: [] as Zapper[],
      gemList: [] as Gem[],
      pigs: [] as Pig[],
      rockets: [] as Rocket[],
      leaves: [] as Leaf[],
      parts: [] as Particle[],
      pops: [] as Popup[],
      shield: 0, // hits the SHIELD upgrade can still block this run
      invuln: 0, // seconds you can't be hit (just after the shield saved you)
    };
    const meters = () => Math.floor(s.scroll / 10);
    const flying = () => s.mode === "running" && (hold.key || hold.mouse || hold.touch || s.puff > 0);

    let runId = 0; // goes up every run, so a late Top 10 box never opens in the middle of a new run
    const reset = () => {
      boardRef.current?.hide();
      runId++;
      s.mode = "running";
      s.t = 0;
      s.runT = 0;
      s.scroll = 0;
      s.speed = START_SPEED;
      s.y = FLOOR - SH;
      s.vy = 0;
      s.rot = 0;
      s.puff = 0;
      s.leafT = 0;
      s.jetT = 0;
      s.gems = 0;
      s.score = 0;
      s.newBest = false;
      s.why = "";
      s.nextAt = SAFE_START;
      s.nextPig = 200;
      s.zaps = [];
      s.gemList = [];
      s.pigs = [];
      s.rockets = [];
      s.leaves = [];
      s.parts = [];
      s.pops = [];
      s.shield = lv.shield;
      s.invuln = 0;
      // a little line of gems to start with
      for (let i = 0; i < 8; i++) s.gemList.push({ x: 150 + i * 12, y: 80, taken: false });
      sfx.start();
    };

    // ---------- the shop + pause menu ----------
    const openShop = (from: "ready" | "dead" | "pause") => {
      shop.open = true;
      shop.from = from;
      shop.ui.msg = "";
      sfx.click();
    };
    const closeShop = () => {
      shop.open = false;
      sfx.click();
    };
    const shopHooks: ShopHooks = {
      money: () => bank,
      moneyName: "GEMS",
      icon: (c, x, y) => gemIcon(c, x, y),
      level: (id) => {
        const [kind, key] = id.split(":");
        if (kind === "up") return lv[key as keyof typeof lv] ?? 0;
        const free = kind === "outfit" ? OUTFITS.find((o) => o.id === key)?.price === 0 : TRAILS.find((t) => t.id === key)?.price === 0;
        return free || owned.includes(id) ? 1 : 0;
      },
      worn: (id) => id === `outfit:${outfit}` || id === `trail:${trail}`,
      buy: (id, price) => {
        bank -= price;
        const [kind, key] = id.split(":");
        if (kind === "up") lv[key as keyof typeof lv]++;
        else {
          owned.push(id);
          if (kind === "outfit") outfit = key;
          else trail = key;
        }
        saveShop();
      },
      wear: (id) => {
        const [kind, key] = id.split(":");
        if (kind === "outfit") outfit = key;
        else trail = key;
        saveShop();
      },
      preview: (c, id, box, t) => drawPreview(c, id, box, t),
      sound: (w) => (w === "buy" ? sfx.buy() : w === "no" ? sfx.no() : sfx.click()),
    };
    const shopOk = () => {
      if (shopAct(SHOP_ROWS, shop.ui, shopHooks) === "close") closeShop();
    };
    // GAME MENU: back to the PSP game list (the gems from the run you left are kept)
    const toMenu = () => {
      boardRef.current?.hide();
      runId++;
      if (s.mode === "running") {
        bank += s.gems;
        saveShop();
      }
      pause.on = false;
      s.mode = "ready";
      s.t = 0;
      s.zaps = [];
      s.rockets = [];
      s.gemList = [];
      s.pigs = [];
      s.leaves = [];
      s.parts = [];
      s.pops = [];
      s.y = FLOOR - SH;
      s.vy = 0;
      s.rot = 0;
      s.speed = START_SPEED;
      s.puff = 0;
      // then leave to the PSP game list, the same way VOID's pause HOME does
      // (one tiny wait, so the page is listening when the key arrives)
      window.setTimeout(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
      }, 0);
    };
    const pauseChoose = () => {
      const pick = PAUSE_ROWS[pause.row];
      if (pick === "RESUME") {
        pause.on = false;
        sfx.click();
      } else if (pick === "RESTART") {
        pause.on = false;
        reset();
      } else if (pick === "SHOP") openShop("pause");
      else toMenu();
    };
    const setPause = (on: boolean) => {
      if (s.mode !== "running") return;
      pause.on = on;
      pause.row = 0;
      letGo();
      sfx.click();
    };
    // the shop can be opened from the start screen, or the game over screen once the Top 10 box is closed
    const canOpenShop = () => !boardRef.current?.busy() && (s.mode === "ready" || (s.mode === "dead" && s.t > 0.8));

    menuOpenRef.current = () => shop.open || pause.on;
    pressRef.current = () => {
      if (shop.open) {
        shopOk();
        return;
      }
      if (pause.on) {
        pauseChoose();
        return;
      }
      if (boardRef.current?.busy()) return; // the Top 10 / name box is open: close it first (OK)
      if (s.mode === "ready") reset();
      else if (s.mode === "dead" && s.t > 0.8) reset(); // (wait a moment so you don't skip the game over screen by accident)
    };
    puffRef.current = () => {
      if (s.mode === "running" && !pause.on && !shop.open) s.puff = 0.16;
    };

    const burst = (x: number, y: number, n: number, colors: string[], power = 90) => {
      for (let i = 0; i < n; i++)
        s.parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * power,
          vy: -Math.random() * power * 0.9 - 10,
          life: 0.4 + Math.random() * 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
    };

    // ---------- building the city ahead ----------
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const gemLine = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) s.gemList.push({ x: x + i * 11, y, taken: false });
    };
    const gemWave = (x: number, y: number, n: number) => {
      for (let i = 0; i < n; i++) s.gemList.push({ x: x + i * 11, y: y + Math.sin(i * 0.7) * 16, taken: false });
    };
    const gemBlock = (x: number, y: number) => {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) s.gemList.push({ x: x + c * 10, y: y + r * 10, taken: false });
    };
    const generate = (limit: number) => {
      while (s.nextAt < limit) {
        const x = s.nextAt;
        const m = x / 10;
        const gap = Math.max(GAP_MIN, GAP_START - m * 0.05) * rnd(0.85, 1.25);
        const r = Math.random();
        const rocketsOn = m > ROCKETS_FROM;
        if (rocketsOn && r < 0.2 && s.rockets.length < (m > 700 ? 2 : 1)) {
          // a rocket: the ! shows up at the right edge and follows you
          s.rockets.push({ stage: "warn", t: 0, x: W + 20, y: s.y + SH / 2 });
          sfx.warn();
        } else if (r < 0.42) {
          // just gems
          const kind = Math.random();
          if (kind < 0.4) gemLine(x, rnd(CEIL + 16, FLOOR - 16), 6 + Math.floor(Math.random() * 5));
          else if (kind < 0.75) gemWave(x, rnd(CEIL + 34, FLOOR - 34), 10);
          else gemBlock(x, rnd(CEIL + 14, FLOOR - 40));
        } else {
          // a zapper: flat, upright, slanted, or (later) spinning
          const kind = Math.random();
          let ang = 0;
          let spin = 0;
          let len = rnd(34, 50);
          if (m > SPIN_FROM && kind < 0.22) {
            spin = (Math.random() < 0.5 ? -1 : 1) * rnd(1.2, 2);
            len = rnd(32, 42);
          } else if (kind < 0.5) ang = 0;
          else if (kind < 0.78) {
            ang = Math.PI / 2;
            len = rnd(30, 44);
          } else ang = (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 4);
          // (keep the whole bar between the ceiling and the ground, whichever way it points or spins)
          const reach = spin ? len / 2 : Math.abs(Math.sin(ang)) * (len / 2);
          const y = rnd(CEIL + 8 + reach, FLOOR - 8 - reach);
          s.zaps.push({ x: x + 30, y, len, ang, spin });
          // often some gems right after it, on the other half of the screen
          if (Math.random() < 0.5) {
            const mid = (CEIL + FLOOR) / 2;
            gemLine(x + 62, y < mid ? rnd(mid + 14, FLOOR - 14) : rnd(CEIL + 14, mid - 14), 5);
          }
        }
        s.nextAt += gap;
      }
      // piglets walking on the ground
      while (s.nextPig < limit) {
        s.pigs.push({ x: s.nextPig, dir: Math.random() < 0.7 ? -1 : 1, dead: false });
        s.nextPig += PIG_EVERY * rnd(0.6, 1.5);
      }
    };

    // the two ends of a zapper, on screen
    const zapEnds = (z: Zapper) => {
      const cx = z.x - s.scroll;
      const dx = Math.cos(z.ang) * (z.len / 2);
      const dy = Math.sin(z.ang) * (z.len / 2);
      return { ax: cx - dx, ay: z.y - dy, bx: cx + dx, by: z.y + dy };
    };

    const die = (why: string, boom: boolean) => {
      // SHIELD upgrade: it breaks instead of you
      if (s.mode === "running" && s.shield > 0) {
        s.shield--;
        s.invuln = 1.2;
        s.shake = 0.25;
        sfx.shield();
        burst(PX + SW / 2, s.y + SH / 2, 16, ["#6ae0ff", "#2a9ad0", "#ffffff"], 110);
        s.pops.push({ x: PX + SW / 2, y: s.y - 6, text: "SAVED!", life: 0.9, color: "#6ae0ff" });
        return;
      }
      s.mode = "dead";
      s.t = 0;
      s.why = why;
      s.vy = -150;
      s.shake = 0.5;
      s.puff = 0;
      if (boom) sfx.boom();
      else sfx.zap();
      burst(PX + SW / 2, s.y + SH / 2, 22, boom ? ["#ffd24a", "#ff7a1a", "#e0301a", "#ffffff"] : ["#ffffff", "#ffe34a", PINK], 130);
      s.score = meters() + s.gems * 5;
      // the gems from this run go into your saved gems
      bank += s.gems;
      saveShop();
      if (s.score > best) {
        best = s.score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
      // ONLINE TOP 10: after the crash, the name box (good score) or the Top 10 pops up
      const myRun = runId;
      const score = s.score;
      const runT = s.runT;
      setTimeout(() => {
        if (runId === myRun && s.mode === "dead") boardRef.current?.gameOver(score, runT);
      }, 900);
    };

    // ---------- input: keyboard ----------
    const FLY_KEYS = [" ", "ArrowUp", "w", "W"];
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      // THE SHOP: up / down pick, SPACE (or OK / ENTER) buys, ESC goes back
      if (shop.open) {
        if (k === "ArrowUp" || k === "w" || k === "W") shopMove(SHOP_ROWS, shop.ui, -1, shopHooks);
        else if (k === "ArrowDown" || k === "s" || k === "S") shopMove(SHOP_ROWS, shop.ui, 1, shopHooks);
        else if (k === "ArrowLeft" || k === "a" || k === "A") shopSide(SHOP_ROWS, shop.ui, -1, shopHooks);
        else if (k === "ArrowRight" || k === "d" || k === "D") shopSide(SHOP_ROWS, shop.ui, 1, shopHooks);
        else if (k === " ") {
          hold.key = true; // (so the page's OK signal for this SPACE doesn't buy twice)
          shopOk();
        } else if (k === "Escape") closeShop();
        return;
      }
      // THE PAUSE MENU: up / down pick, SPACE (or OK / ENTER) chooses, ESC / P resumes
      if (pause.on) {
        if (k === "ArrowUp" || k === "w" || k === "W") {
          pause.row = (pause.row + PAUSE_ROWS.length - 1) % PAUSE_ROWS.length;
          sfx.click();
        } else if (k === "ArrowDown" || k === "s" || k === "S") {
          pause.row = (pause.row + 1) % PAUSE_ROWS.length;
          sfx.click();
        } else if (k === " ") {
          hold.key = true;
          pauseChoose();
        } else if (k === "Escape" || k === "p" || k === "P") setPause(false);
        return;
      }
      // ESC / P (or the PAUSE button on phones) = pause, only while flying
      if (k === "Escape" || k === "p" || k === "P") {
        setPause(true);
        return;
      }
      // S / DOWN on the start or game over screen = the shop
      if ((k === "ArrowDown" || k === "s" || k === "S") && canOpenShop()) {
        openShop(s.mode === "dead" ? "dead" : "ready");
        return;
      }
      // M = sound effects on / off, - and + = quieter / louder
      if (k === "m" || k === "M") {
        toggleFx();
        return;
      }
      if (k === "-" || k === "_") {
        setFxVolume((fx.on ? fx.vol : 0) - 0.1);
        return;
      }
      if (k === "=" || k === "+") {
        setFxVolume((fx.on ? fx.vol : 0) + 0.1);
        return;
      }
      if (FLY_KEYS.includes(k)) {
        hold.key = true;
        pressRef.current?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (FLY_KEYS.includes(e.key)) hold.key = false;
    };
    const letGo = () => {
      hold.key = hold.mouse = hold.touch = false;
    };
    const onMouseUp = () => {
      hold.mouse = false;
    };
    // switching apps / tabs pauses the run and lets go of the jetpack
    const onHidden = () => {
      if (!document.hidden) return;
      letGo();
      if (s.mode === "running" && !pause.on) {
        pause.on = true;
        pause.row = 0;
      }
    };
    // the speaker icon + slider (clicks / taps come from the canvas and touch code below)
    const onSlider = (x: number, y: number) => x < 18 && y >= FX_SLIDER.top - 5 && y <= FX_SLIDER.bottom + 5;
    const fxFromY = (y: number) => setFxVolume((FX_SLIDER.bottom - y) / (FX_SLIDER.bottom - FX_SLIDER.top));
    // a click / tap on the picture: the shop, the pause menu, the SHOP panel, or the speaker / slider.
    // Returns true when it was used (then it doesn't make you fly).
    fxTapRef.current = (x, y) => {
      if (shop.open) {
        if (shopTap(SHOP_ROWS, shop.ui, shopHooks, x, y) === "close") closeShop();
        return true;
      }
      if (!pause.on && panelShopHit(x, y, W) && canOpenShop()) {
        openShop(s.mode === "dead" ? "dead" : "ready");
        return true;
      }
      if (x >= FX_ICON.x && x < FX_ICON.x + FX_ICON.w && y >= FX_ICON.y && y < FX_ICON.y + FX_ICON.h) {
        toggleFx();
        return true;
      }
      if (onSlider(x, y)) {
        fx.drag = true;
        fxFromY(y);
        return true;
      }
      if (pause.on) {
        const row = pauseTapRow(x, y, W);
        if (row >= 0) {
          pause.row = row;
          pauseChoose();
        }
        return true;
      }
      return false;
    };
    fxDragRef.current = (y) => {
      if (y < 0) fx.drag = false;
      else if (fx.drag) fxFromY(y);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerup", onMouseUp);
    window.addEventListener("blur", letGo);
    document.addEventListener("visibilitychange", onHidden);

    // ---------- drawing helpers ----------
    const text = (str: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center") => {
      ctx.font = `${size}px ${fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    };

    // the night city: sky, stars, moon, two rows of buildings, the ceiling and the ground
    const drawCity = (t: number) => {
      const bh = Math.ceil((FLOOR - CEIL) / SKY.length);
      SKY.forEach((c, i) => {
        ctx.fillStyle = c;
        ctx.fillRect(0, CEIL + i * bh, W, bh);
      });
      // stars + moon (they barely move)
      for (let i = 0; i < 28; i++) {
        if (Math.sin(t * 2 + i * 2.3) < -0.75) continue; // twinkle
        ctx.fillStyle = hash(i, 13) > 0.7 ? "#ffffff" : "#e8c8ff";
        ctx.fillRect(Math.round(mod(hash(i, 11) * W - s.scroll * 0.02, W)), Math.round(CEIL + 3 + hash(i, 12) * 58), 1, 1);
      }
      const mx = Math.round(mod(W * 0.8 - s.scroll * 0.02, W + 20)) - 10;
      ctx.fillStyle = "#ffe0f6";
      ctx.fillRect(mx - 4, 24, 8, 10);
      ctx.fillRect(mx - 5, 25, 10, 8);
      ctx.fillStyle = "#f0a8dc";
      ctx.fillRect(mx - 2, 27, 2, 2);
      ctx.fillRect(mx + 1, 30, 2, 1);
      // far buildings (move slowly)
      const off1 = s.scroll * 0.12;
      ctx.fillStyle = FAR_CITY;
      for (let b = Math.floor(off1 / 16); b * 16 - off1 < W; b++) {
        const h = 18 + hash(b, 5) * 36;
        ctx.fillRect(Math.round(b * 16 - off1), Math.round(FLOOR - h), 16, Math.ceil(h));
      }
      // near buildings with lit windows (the windows glow brighter on the beat)
      const off2 = s.scroll * 0.35;
      const glow = 0.75 + beatKick() * 0.25;
      for (let b = Math.floor(off2 / 26); b * 26 - off2 < W; b++) {
        if (hash(b, 10) < 0.18) continue; // a gap between two buildings
        const h = Math.round(30 + hash(b, 9) * 54);
        const x = Math.round(b * 26 - off2);
        const top = FLOOR - h;
        ctx.fillStyle = NEAR_CITY;
        ctx.fillRect(x, top, 24, h);
        ctx.fillStyle = NEAR_CITY_TOP;
        ctx.fillRect(x, top, 24, 2);
        ctx.globalAlpha = glow;
        for (let wy = top + 5; wy < FLOOR - 6; wy += 7)
          for (let wx = 3; wx < 20; wx += 6) {
            const n = hash(b * 31 + wx, wy - top);
            if (n < 0.55) continue;
            ctx.fillStyle = n > 0.85 ? YELLOW : PINK;
            ctx.fillRect(x + wx, wy, 3, 3);
          }
        ctx.globalAlpha = 1;
      }
      // the ceiling
      ctx.fillStyle = ROOF;
      ctx.fillRect(0, 0, W, CEIL);
      ctx.fillStyle = "#5a2c96";
      ctx.fillRect(0, CEIL - 3, W, 2);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, CEIL - 1, W, 1);
      // the ground
      ctx.fillStyle = GROUND;
      ctx.fillRect(0, FLOOR, W, H - FLOOR);
      ctx.fillStyle = PINK;
      ctx.fillRect(0, FLOOR, W, 1);
      ctx.fillStyle = "#4a2a80";
      ctx.fillRect(0, FLOOR + 1, W, 2);
      const off3 = mod(s.scroll, 20);
      for (let x = -off3; x < W; x += 20) {
        ctx.fillStyle = "#5a2c96";
        ctx.fillRect(Math.round(x), 3, 2, 2); // rivets on the ceiling
        ctx.fillStyle = "#1c0e36";
        ctx.fillRect(Math.round(x), FLOOR + 3, 1, H - FLOOR - 3); // lines between the floor tiles
        ctx.fillStyle = "#4a2a80";
        ctx.fillRect(Math.round(x) + 6, FLOOR + 8, 8, 1);
      }
    };

    const drawGem = (x: number, y: number, t: number) => {
      const size = 3 + (beatKick() > 0.5 ? 1 : 0); // the gems swell on every beat
      const cx = Math.round(x);
      const cy = Math.round(y + Math.sin(t * 5 + x * 0.05) * 1.5);
      for (let i = -size; i <= size; i++) {
        const hw = size - Math.abs(i);
        ctx.fillStyle = "#0b3d14";
        ctx.fillRect(cx - hw - 1, cy + i, hw * 2 + 3, 1);
      }
      for (let i = -size; i <= size; i++) {
        const hw = size - Math.abs(i);
        ctx.fillStyle = i < 0 ? "#b6ff9e" : "#3ee05a";
        ctx.fillRect(cx - hw, cy + i, hw * 2 + 1, 1);
      }
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx - 1, cy - 2, 1, 1);
    };

    const drawZapper = (z: Zapper, t: number) => {
      const e = zapEnds(z);
      const n = Math.ceil(z.len / 2);
      // the electric beam: a soft pink glow with a jumpy white / yellow line on top
      ctx.fillStyle = "rgba(255,95,210,0.28)";
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        ctx.fillRect(Math.round(e.ax + (e.bx - e.ax) * v) - 3, Math.round(e.ay + (e.by - e.ay) * v) - 3, 6, 6);
      }
      for (let i = 0; i <= n; i++) {
        const v = i / n;
        const j = Math.floor(t * 30);
        const jx = (hash(i + j, 3) - 0.5) * 3;
        const jy = (hash(i + j, 4) - 0.5) * 3;
        ctx.fillStyle = (i + j) % 3 === 0 ? "#ffe34a" : "#ffffff";
        ctx.fillRect(Math.round(e.ax + (e.bx - e.ax) * v + jx) - 1, Math.round(e.ay + (e.by - e.ay) * v + jy) - 1, 2, 2);
      }
      // the two metal ends
      for (const [x, y] of [
        [e.ax, e.ay],
        [e.bx, e.by],
      ]) {
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8);
        ctx.fillStyle = "#9a9ab0";
        ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6);
        ctx.fillStyle = Math.floor(t * 8) % 2 ? "#ffe34a" : PINK;
        ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, 2, 2);
      }
    };

    const drawRocket = (r: Rocket, t: number) => {
      if (r.stage !== "fly") {
        // the warning: a red ! at the right edge, at the height the rocket will come from
        const fast = r.stage === "lock";
        const on = Math.floor(t * (fast ? 16 : 6)) % 2 === 0;
        const y = Math.round(r.y);
        ctx.fillStyle = "#000";
        ctx.fillRect(W - 17, y - 8, 14, 16);
        ctx.fillStyle = on ? "#ff2a3c" : fast ? "#ffffff" : "#7a1420";
        ctx.fillRect(W - 16, y - 7, 12, 14);
        ctx.fillStyle = on ? "#ffffff" : "#ff2a3c";
        ctx.fillRect(W - 11, y - 5, 2, 6);
        ctx.fillRect(W - 11, y + 3, 2, 2);
        return;
      }
      const x = Math.round(r.x);
      const y = Math.round(r.y);
      // flame + smoke behind it
      ctx.fillStyle = Math.floor(t * 20) % 2 ? "#ffd24a" : "#ff7a1a";
      ctx.fillRect(x + 15, y - 2, 4 + (Math.floor(t * 20) % 3), 4);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      for (let i = 0; i < 4; i++) ctx.fillRect(x + 22 + i * 7, y - 1 + Math.round(Math.sin(t * 9 + i) * 2), 3, 3);
      // the rocket (it flies to the left)
      ctx.fillStyle = "#111";
      ctx.fillRect(x + 1, y - 4, 15, 8);
      ctx.fillStyle = "#c8c8d8";
      ctx.fillRect(x + 3, y - 3, 12, 6);
      ctx.fillStyle = "#ff2a3c";
      ctx.fillRect(x, y - 2, 4, 4);
      ctx.fillRect(x + 12, y - 5, 3, 2);
      ctx.fillRect(x + 12, y + 3, 3, 2);
      ctx.fillStyle = "#8a8a9a";
      ctx.fillRect(x + 3, y + 1, 12, 2);
    };

    const drawPig = (p: Pig, t: number) => {
      const x = Math.round(p.x - s.scroll);
      const y = FLOOR - 8 - (Math.floor(t * 6 + p.x) % 2); // a tiny hop while it walks
      if (p.dir < 0) ctx.drawImage(pigImg, x, y);
      else {
        // walking to the right: the picture is flipped
        ctx.save();
        ctx.translate(x + 11, y);
        ctx.scale(-1, 1);
        ctx.drawImage(pigImg, 0, 0);
        ctx.restore();
      }
    };

    // the money icon (a little green gem, 7 x 8)
    const gemIcon = (c: CanvasRenderingContext2D, x: number, y: number) => {
      c.fillStyle = "#0b3d14";
      c.fillRect(x + 1, y, 5, 1);
      c.fillRect(x, y + 1, 7, 3);
      c.fillRect(x + 1, y + 4, 5, 2);
      c.fillRect(x + 2, y + 6, 3, 1);
      c.fillStyle = "#3ee05a";
      c.fillRect(x + 2, y + 1, 3, 1);
      c.fillRect(x + 1, y + 2, 5, 2);
      c.fillRect(x + 2, y + 4, 3, 1);
      c.fillRect(x + 3, y + 5, 1, 1);
      c.fillStyle = "#b6ff9e";
      c.fillRect(x + 2, y + 2, 1, 1);
    };
    // Pinkmane in an outfit (x, y = top left), with his jetpack, standing still. scale = how big.
    const drawDude = (c: CanvasRenderingContext2D, id: string, x: number, y: number, scale: number) => {
      c.save();
      c.translate(Math.round(x), Math.round(y));
      c.scale(scale, scale);
      c.fillStyle = "#111";
      c.fillRect(1, 12, 8, 15);
      c.fillStyle = "#8a8a9a";
      c.fillRect(2, 13, 6, 13);
      c.fillStyle = "#3ee05a";
      c.fillRect(2, 17, 6, 3);
      const pic = outfitPic(id);
      if (OUTFITS.find((o) => o.id === id)?.ghost) c.globalAlpha = 0.7;
      if (pic) c.drawImage(pic, 0, 0, SW, SH, 0, 0, SW, SH);
      else c.drawImage(drawnDude[0], 0, 0);
      c.restore();
    };
    // what comes out of a jetpack at (x, y), as a little looping animation
    const drawTrailDemo = (c: CanvasRenderingContext2D, id: string, x: number, y: number, t: number, n = 8, len = 40) => {
      const pics = trailPics[id] ?? leafImg;
      for (let k = 0; k < n; k++) {
        const ph = (t * 1.4 + k / n) % 1;
        const pic = pics[k % pics.length];
        c.globalAlpha = 1 - ph * 0.6;
        c.drawImage(pic, Math.round(x - 3 - ph * 12 + Math.sin(k * 2.3 + t * 5) * 3), Math.round(y + ph * len));
      }
      c.globalAlpha = 1;
    };
    // the picture in the shop's preview box
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, b: ShopBox, t: number) => {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      // a bit of night sky behind
      c.fillStyle = "#2a1258";
      c.fillRect(b.x, b.y + b.h - 14, b.w, 14);
      c.fillStyle = PINK;
      c.fillRect(b.x, b.y + b.h - 14, b.w, 1);
      const [kind, key] = (id ?? "").split(":");
      if (kind === "outfit") {
        drawDude(c, key, cx - SW, b.y + 6, 2);
        return;
      }
      if (kind === "trail") {
        drawDude(c, outfit, cx - SW / 2, b.y + 8, 1);
        drawTrailDemo(c, key, cx - SW / 2 + 5, b.y + 37, t, 9, 44);
        return;
      }
      drawDude(c, outfit, cx - SW / 2, cy - SH / 2 - 6, 1);
      const px = cx;
      const py = cy - 6;
      if (key === "magnet") {
        // gems flying in from all around
        for (let k = 0; k < 7; k++) {
          const a = k * 0.9 + t * 0.6;
          const d = 42 - ((t * 26 + k * 6) % 34);
          gemIcon(c, Math.round(px + Math.cos(a) * d - 3), Math.round(py + Math.sin(a) * d - 4));
        }
      } else if (key === "shield") {
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2 + t * 2;
          c.fillStyle = k % 2 ? "#6ae0ff" : "#ffffff";
          c.fillRect(Math.round(px + Math.cos(a) * 17), Math.round(py + Math.sin(a) * 23), 2, 2);
        }
      } else if (key === "pigs") {
        c.save();
        c.translate(Math.round(cx - 16), b.y + b.h - 14 - 16);
        c.scale(2, 2);
        c.drawImage(pigImg, 0, 0);
        c.restore();
        c.font = `8px ${fontFamily}`;
        c.textAlign = "center";
        c.fillStyle = GREEN;
        const next = Math.min(lv.pigs + 1, 3);
        c.fillText(`+${PIG_GEMS + next}`, cx + 22, b.y + b.h - 34);
      }
    };

    const drawPlayer = (t: number) => {
      const onGround = s.y >= FLOOR - SH - 0.5;
      // shadow on the ground (smaller the higher you are)
      const high = (FLOOR - SH - s.y) / (FLOOR - SH - CEIL);
      const shw = Math.round(9 - high * 5);
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.fillRect(PX + SW / 2 - shw, FLOOR - 1, shw * 2, 2);

      ctx.save();
      ctx.translate(PX + SW / 2, Math.round(s.y) + SH / 2);
      if (s.mode === "dead") ctx.rotate(s.rot);
      else if (!onGround) ctx.rotate(Math.max(-0.12, Math.min(0.16, s.vy / 1400))); // leans a little with the flight
      ctx.translate(-SW / 2, -SH / 2);

      // the jetpack on his back
      ctx.fillStyle = "#111";
      ctx.fillRect(1, 12, 8, 15);
      ctx.fillStyle = "#8a8a9a";
      ctx.fillRect(2, 13, 6, 13);
      ctx.fillStyle = "#c8c8d8";
      ctx.fillRect(2, 13, 2, 13);
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(2, 17, 6, 3); // green stripe: it runs on weed
      ctx.fillStyle = "#111";
      ctx.fillRect(3, 27, 4, 2); // the nozzle
      if (flying()) {
        // a little green + yellow flash where the leaves come out
        ctx.fillStyle = Math.floor(t * 24) % 2 ? "#b6ff9e" : "#ffe34a";
        ctx.fillRect(2, 29, 6, 2 + (Math.floor(t * 24) % 3));
      }

      // Pinkmane in his outfit: running on the ground, legs still in the air (blinking just after the shield saved him)
      const frame = s.mode === "running" && onGround ? Math.floor(s.scroll / 9) % 2 : 0;
      const pic = outfitPic(outfit);
      const blink = s.invuln > 0 && Math.floor(t * 16) % 2 === 0;
      if (outfitDef().ghost) ctx.globalAlpha = 0.7;
      if (blink) ctx.globalAlpha = 0.3;
      if (pic) {
        // each frame in the picture is 24 x 35 (the picture can hold more than 2 of them, only the first 2 are used)
        ctx.drawImage(pic, frame * SW, 0, SW, SH, 0, 0, SW, SH);
      } else ctx.drawImage(drawnDude[frame], 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
      // the SHIELD: a sparkling bubble around him
      if (s.shield > 0 && s.mode === "running") {
        const bx = PX + SW / 2;
        const by = s.y + SH / 2;
        for (let k = 0; k < 20; k++) {
          const a = (k / 20) * Math.PI * 2 + t * 2;
          ctx.fillStyle = k % 2 ? "#6ae0ff" : "#ffffff";
          ctx.fillRect(Math.round(bx + Math.cos(a) * 16), Math.round(by + Math.sin(a) * 21), 2, 2);
        }
      }
    };

    // the speaker icon (on the ceiling, top left) with a pink X when the sounds are off
    const drawFxIcon = () => {
      const x = FX_ICON.x + 3;
      const y = FX_ICON.y + 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y + 2, 2, 3);
      ctx.fillRect(x + 2, y + 1, 1, 5);
      ctx.fillRect(x + 3, y, 1, 7);
      if (fx.on && fx.vol > 0) {
        ctx.fillRect(x + 5, y + 2, 1, 3);
        if (fx.vol > 0.5) ctx.fillRect(x + 7, y + 1, 1, 5);
      } else {
        ctx.fillStyle = PINK;
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
          ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
        }
      }
    };
    // the sound effects slider: a thin bar under the speaker (top = loud, bottom = quiet)
    const drawFxSlider = () => {
      const { x, top, bottom } = FX_SLIDER;
      const vol = fx.on ? fx.vol : 0;
      const knobY = Math.round(bottom - vol * (bottom - top));
      ctx.globalAlpha = fx.drag ? 1 : 0.7;
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 1, top - 1, 5, bottom - top + 2);
      ctx.fillStyle = "#6e5a8a";
      ctx.fillRect(x, top, 3, bottom - top);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, knobY, 3, bottom - knobY);
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 3, knobY - 2, 9, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 2, knobY - 1, 7, 3);
      ctx.globalAlpha = 1;
      text("FX", x + 2, top - 9, "#ffffff", 8);
    };

    const drawHud = () => {
      text(`${meters()}M`, 20, 15, GREEN, 8, "left");
      const gx = W - 12;
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(gx + 2, 15, 3, 1);
      ctx.fillRect(gx + 1, 16, 5, 2);
      ctx.fillRect(gx + 2, 18, 3, 2);
      ctx.fillRect(gx + 3, 20, 1, 2);
      text(String(s.gems), gx - 2, 15, GREEN, 8, "right");
      if (best > 0) text(`BEST ${best}`, W / 2, 15, "#b48ad0");
      // shields left this run
      for (let i = 0; i < s.shield; i++) {
        ctx.fillStyle = "#000";
        ctx.fillRect(W - 60 - i * 9, 15, 7, 8);
        ctx.fillStyle = "#6ae0ff";
        ctx.fillRect(W - 59 - i * 9, 16, 5, 5);
        ctx.fillRect(W - 58 - i * 9, 21, 3, 1);
      }
      // how to play, during the first seconds of a run
      if (s.t < 4.5 && meters() < 60) {
        ctx.globalAlpha = Math.min(1, (4.5 - s.t) / 0.8);
        text(touchRef.current ? "HOLD THE SCREEN = FLY UP" : "HOLD SPACE = FLY UP", W / 2, 44, "#ffffff");
        text("LET GO = FALL", W / 2, 56, "#d8a8ff");
        ctx.globalAlpha = 1;
      }
    };

    // ---------- the game loop ----------
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let pauseClock = 0;

    const step = (dt: number) => {
      clock += dt;
      s.t += dt;
      if (s.puff > 0) s.puff -= dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.invuln > 0) s.invuln -= dt;
      const floorY = FLOOR - SH;

      if (s.mode === "running") {
        s.runT += dt;
        s.speed = Math.min(MAX_SPEED, START_SPEED + (s.scroll / 10) * SPEED_GAIN);
        s.scroll += s.speed * dt;

        // the jetpack
        const on = flying();
        s.vy += (on ? -THRUST : GRAVITY) * dt;
        s.vy = Math.max(-MAX_UP, Math.min(MAX_DOWN, s.vy));
        s.y += s.vy * dt;
        if (s.y < CEIL) {
          s.y = CEIL;
          s.vy = Math.max(0, s.vy);
        }
        if (s.y > floorY) {
          s.y = floorY;
          s.vy = Math.min(0, s.vy);
        }
        // ...shoots weed leaves downwards
        if (on) {
          s.leafT -= dt;
          while (s.leafT <= 0) {
            s.leafT += LEAF_EVERY;
            if (s.leaves.length < 140)
              s.leaves.push({
                x: PX + 5 + (Math.random() - 0.5) * 3,
                y: s.y + 29,
                vx: -s.speed * 0.3 + (Math.random() - 0.5) * 50,
                vy: LEAF_FALL + Math.random() * 60,
                pic: (() => {
                  const pics = trailPics[trail] ?? leafImg;
                  return pics[Math.floor(Math.random() * pics.length)];
                })(),
                wob: Math.random() * 6,
              });
          }
          s.jetT -= dt;
          if (s.jetT <= 0) {
            s.jetT = 0.09;
            sfx.jet();
          }
        } else s.leafT = 0;

        generate(s.scroll + W + 40);

        // the part of Pinkmane that can be hit
        const hx = PX + HB.x;
        const hy = s.y + HB.y;

        // zappers
        for (const z of s.zaps) {
          if (z.spin) z.ang += z.spin * dt;
          const cx = z.x - s.scroll;
          if (s.invuln > 0) continue; // (just saved by the shield: can't be hit for a moment)
          if (cx < PX - 40 || cx > PX + SW + 40) continue;
          const e = zapEnds(z);
          const n = Math.ceil(z.len / 3);
          for (let i = 0; i <= n; i++) {
            const x = e.ax + ((e.bx - e.ax) * i) / n;
            const y = e.ay + ((e.by - e.ay) * i) / n;
            if (x > hx - 2 && x < hx + HB.w + 2 && y > hy - 2 && y < hy + HB.h + 2) {
              die("ZAPPED!", false);
              break;
            }
          }
          if (s.mode !== "running") break;
        }

        // gems (the GEM MAGNET pulls the ones close to you in)
        const reach = MAGNET_RANGE[lv.magnet] ?? 0;
        for (const g of s.gemList) {
          if (g.taken) continue;
          if (reach > 0) {
            const dx = hx + HB.w / 2 - (g.x - s.scroll);
            const dy = hy + HB.h / 2 - g.y;
            if (dx * dx + dy * dy < reach * reach) {
              g.x += dx * Math.min(1, dt * 7);
              g.y += dy * Math.min(1, dt * 7);
            }
          }
          const x = g.x - s.scroll;
          if (x > hx - 7 && x < hx + HB.w + 7 && g.y > hy - 6 && g.y < hy + HB.h + 6) {
            g.taken = true;
            s.gems++;
            sfx.gem();
            burst(x, g.y, 4, ["#b6ff9e", "#3ee05a", "#fff"], 60);
          }
        }

        s.score = meters() + s.gems * 5;
      } else if (s.mode === "dead") {
        // he tumbles to the ground and the world slows to a stop
        s.speed *= Math.max(0, 1 - dt * 2.2);
        s.scroll += s.speed * dt;
        s.vy = Math.min(MAX_DOWN * 1.4, s.vy + GRAVITY * dt);
        s.y += s.vy * dt;
        if (s.y >= floorY) {
          s.y = floorY;
          s.vy = s.vy > 70 ? -s.vy * 0.35 : 0;
        } else s.rot += dt * 9;
        if (s.y >= floorY && s.vy === 0) s.rot = Math.PI / 2; // lying on the ground
      }

      // rockets (they keep flying on the game over screen too)
      const hx = PX + HB.x;
      const hy = s.y + HB.y;
      for (const r of s.rockets) {
        r.t += dt;
        if (r.stage === "warn") {
          r.y += (s.y + SH / 2 - r.y) * Math.min(1, dt * 4); // the ! follows you
          r.y = Math.max(CEIL + 9, Math.min(FLOOR - 9, r.y));
          if (r.t > ROCKET_WARN || s.mode !== "running") {
            r.stage = "lock";
            r.t = 0;
          }
        } else if (r.stage === "lock") {
          if (r.t > 0.35) {
            r.stage = "fly";
            r.t = 0;
            r.x = W + 10;
            sfx.launch();
          }
        } else {
          r.x -= (s.speed + ROCKET_SPEED) * dt;
          if (s.mode === "running" && s.invuln <= 0 && r.x < hx + HB.w && r.x + 16 > hx && r.y + 3 > hy && r.y - 3 < hy + HB.h) {
            r.x = -99;
            die("BOOM!", true);
          }
        }
      }
      s.rockets = s.rockets.filter((r) => r.stage !== "fly" || r.x > -40);

      // piglets walk along the ground
      for (const p of s.pigs) p.x += p.dir * 16 * dt;

      // weed leaves fall, flutter a little, and pop piglets
      for (const l of s.leaves) {
        l.x += (l.vx + Math.sin(clock * 12 + l.wob) * 26) * dt;
        l.y += l.vy * dt;
        if (l.y < FLOOR - 13) continue;
        for (const p of s.pigs) {
          const px = p.x - s.scroll;
          if (p.dead || l.x < px - 4 || l.x > px + 14) continue;
          p.dead = true;
          l.y = 999;
          sfx.pig();
          burst(px + 5, FLOOR - 5, 12, ["#ff8fb8", "#ff5f9a", "#3ee05a", "#ffffff"], 80);
          if (s.mode === "running") {
            const got = PIG_GEMS + lv.pigs; // (the PIGGY BANK upgrade adds 1 per level)
            s.gems += got;
            s.pops.push({ x: px + 5, y: FLOOR - 22, text: `+${got}`, life: 0.9, color: GREEN });
          }
          break;
        }
        if (l.y >= FLOOR - 4 && l.y < 900 && Math.random() < 0.3)
          s.parts.push({ x: l.x, y: FLOOR - 2, vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30, life: 0.25, color: "#3ee05a" });
      }
      s.leaves = s.leaves.filter((l) => l.y < FLOOR - 4);

      // forget things behind us
      s.zaps = s.zaps.filter((z) => z.x > s.scroll - 60);
      s.gemList = s.gemList.filter((g) => !g.taken && g.x > s.scroll - 20);
      s.pigs = s.pigs.filter((p) => !p.dead && p.x > s.scroll - 30);

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 260 * dt;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const p of s.pops) {
        p.y -= 18 * dt;
        p.life -= dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);
    };

    const render = () => {
      const t = clock;
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
      drawCity(t);
      for (const g of s.gemList) {
        const x = g.x - s.scroll;
        if (x > -8 && x < W + 8) drawGem(x, g.y, t);
      }
      for (const z of s.zaps) {
        const x = z.x - s.scroll;
        if (x > -40 && x < W + 40) drawZapper(z, t);
      }
      for (const p of s.pigs) {
        const x = p.x - s.scroll;
        if (x > -14 && x < W + 4) drawPig(p, t);
      }
      for (const l of s.leaves) ctx.drawImage(l.pic, Math.round(l.x) - 3, Math.round(l.y) - 3);
      drawPlayer(t);
      for (const r of s.rockets) drawRocket(r, t);
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      for (const p of s.pops) text(p.text, p.x, p.y, p.color);
      if (s.mode === "running") drawHud();

      if (s.mode === "ready") {
        ctx.fillStyle = "rgba(14,4,24,0.6)";
        ctx.fillRect(0, 0, W, H);
        text(GAME_TITLE, W / 2, 18 - Math.round(beatKick() * 2), PINK, 16); // (bounces to the music)
        text("DEMO", W / 2, 38, YELLOW);
        ctx.drawImage(leafImg[0], W / 2 - 60, 53, 14, 14);
        ctx.drawImage(leafImg[0], W / 2 + 46, 53, 14, 14);
        text("WEED POWERED", W / 2, 56, GREEN);
        text(touchRef.current ? "HOLD THE SCREEN TO FLY" : "HOLD SPACE TO FLY", W / 2, 76, "#ffffff");
        text("DODGE ZAPPERS + ROCKETS", W / 2, 88, "#d8a8ff");
        if (Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP TO START" : "SPACE = START", W / 2, 106, GREEN);
        if (best > 0) text(`BEST ${best}`, W / 2, 122, "#b48ad0");
        text(touchRef.current ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS   - / + = FX VOLUME", W / 2, 136, "#9a7ab8");
        drawPanels(t);
      }

      if (s.mode === "dead") {
        ctx.fillStyle = `rgba(14,4,24,${Math.min(0.72, s.t * 1.2)})`;
        ctx.fillRect(0, 0, W, H);
        if (s.t > 0.4) {
          text(s.why, W / 2, 22, PINK, 16);
          text(`SCORE ${s.score}`, W / 2, 52, GREEN);
          text(s.newBest ? "NEW BEST!" : `BEST ${best}`, W / 2, 64, s.newBest ? PINK : "#b48ad0");
          text(`${meters()}M  ${s.gems} GEMS`, W / 2, 80, "#d8a8ff");
          if (s.t > 0.8 && Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP = AGAIN" : "SPACE = AGAIN", W / 2, 104, GREEN);
          text(`+${s.gems} GEMS SAVED`, W / 2, 118, GREEN);
          drawPanels(t);
        }
      }

      if (!shop.open) {
        drawFxIcon();
        if (s.mode !== "running" || pause.on || fx.drag) drawFxSlider(); // (hidden while you fly, so it never covers the game)
      }

      if (pause.on) {
        drawPauseMenu(ctx, fontFamily, { W, H, row: pause.row, t: pauseClock, touch: touchRef.current, stats: `${meters()}M  ${s.gems} GEMS` });
        drawFxIcon();
        drawFxSlider();
      }
      // the shop covers everything
      if (shop.open)
        drawPinkShop(ctx, fontFamily, SHOP_ROWS, shop.ui, shopHooks, {
          W,
          H,
          touch: touchRef.current,
          backLine: shop.from === "pause" ? "BACK TO YOUR GAME" : "BACK TO THE START SCREEN",
        });
    };
    // the two side panels on the start + game over screens: your gems, and the SHOP
    const drawPanels = (t: number) =>
      drawSidePanels(ctx, fontFamily, {
        W,
        money: bank,
        moneyName: "GEMS",
        icon: gemIcon,
        touch: touchRef.current,
        t,
        preview: (c, cx, cy) => {
          drawDude(c, outfit, cx - SW / 2, cy - SH / 2 - 6, 1);
          drawTrailDemo(c, trail, cx - SW / 2 + 5, cy + 6, t, 6, 18);
        },
      });

    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (shop.open) {
        shop.ui.t += dt; // (the game behind the shop waits)
        pauseClock += dt;
      } else if (pause.on) pauseClock += dt; // only for the blinking text
      else step(dt);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerup", onMouseUp);
      window.removeEventListener("blur", letGo);
      document.removeEventListener("visibilitychange", onHidden);
      pressRef.current = null;
      puffRef.current = null;
      menuOpenRef.current = null;
      fxTapRef.current = null;
      fxDragRef.current = null;
      letGo();
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily]);

  // ---------- touch: hold a finger down to fly ----------
  // PHONES (touch = true): hold ANYWHERE on the screen (the page's small EXIT / PAUSE / music buttons still work).
  //   Other touch screens: the finger has to start on the game picture (or just next to it).
  // a screen point -> game pixels (the picture is fitted inside the canvas box, "contain"). null = outside the picture.
  const toGame = (cx: number, cy: number) => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H);
    const x = (cx - r.left - (r.width - W * sc) / 2) / sc;
    const y = (cy - r.top - (r.height - H * sc) / 2) / sc;
    return x >= 0 && x < W && y >= 0 && y < H ? { x, y } : null;
  };

  useEffect(() => {
    // touches on buttons, sliders and links are left alone
    const onUi = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, [role='button'], [role='slider']");
    const fingers = new Set<number>();
    let fxFinger = -1; // the finger that's dragging the sound slider

    const start = (e: TouchEvent) => {
      if (onUi(e.target)) return;
      const t = e.changedTouches[0];
      // the speaker icon / sound slider: no flying
      const g = toGame(t.clientX, t.clientY);
      if (g && fxTapRef.current?.(g.x, g.y)) {
        fxFinger = t.identifier;
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (menuOpenRef.current?.()) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!touchRef.current) {
        const r = canvasRef.current?.getBoundingClientRect();
        const M = 40;
        if (!r || t.clientX < r.left - M || t.clientX > r.right + M || t.clientY < r.top - M || t.clientY > r.bottom + M) return;
      }
      for (let i = 0; i < e.changedTouches.length; i++) fingers.add(e.changedTouches[i].identifier);
      holdRef.current.touch = true;
      pressRef.current?.();
      if (e.cancelable) e.preventDefault(); // no double-tap zoom / long-press menu
    };
    const move = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier !== fxFinger) continue;
        const c = canvasRef.current?.getBoundingClientRect();
        if (c) {
          const sc = Math.min(c.width / W, c.height / H);
          fxDragRef.current?.((t.clientY - c.top - (c.height - H * sc) / 2) / sc);
        }
      }
      if ((fingers.size || fxFinger >= 0) && e.cancelable) e.preventDefault(); // don't scroll the page while flying
    };
    const end = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++)
        if (e.changedTouches[i].identifier === fxFinger) {
          fxFinger = -1;
          fxDragRef.current?.(-1);
        }
      for (let i = 0; i < e.changedTouches.length; i++) fingers.delete(e.changedTouches[i].identifier);
      if (e.touches.length === 0) fingers.clear();
      holdRef.current.touch = fingers.size > 0;
    };

    window.addEventListener("touchstart", start, { passive: false });
    window.addEventListener("touchmove", move, { passive: false });
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
      window.removeEventListener("touchcancel", end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      // COMPUTER mouse: hold the button down on the game picture = fly (touch is handled above).
      // The speaker icon + the sound slider (top left) don't make you fly.
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        e.stopPropagation();
        const g = toGame(e.clientX, e.clientY);
        if (g && fxTapRef.current?.(g.x, g.y)) {
          fxDragging.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        if (menuOpenRef.current?.()) return;
        holdRef.current.mouse = true;
        pressRef.current?.();
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || !fxDragging.current) return;
        const c = e.currentTarget.getBoundingClientRect();
        const sc = Math.min(c.width / W, c.height / H);
        fxDragRef.current?.((e.clientY - c.top - (c.height - H * sc) / 2) / sc);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse" || !fxDragging.current) return;
        fxDragging.current = false;
        fxDragRef.current?.(-1);
      }}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "#2a1258",
        touchAction: "none",
        cursor: "pointer",
      }}
    />
    <ScorePanel game="jet" title="PINK JETPACK" apiRef={boardRef} fontFamily={fontFamily} accent={PINK} />
    </>
  );
}
