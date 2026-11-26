"use client";

// PINK DIVE: the daily word dive.
// 7 prompts a day (the same for everyone), 25 seconds each. Type an answer: the RARER it is, the DEEPER your pink sub sinks.
// At the end you see how deep you got, how you did against today's other divers, and you can share it.
//
//   the prompts + answers ......... game/dive/prompts.ts   (add your own there)
//   which prompts today, checking . game/dive/daily.ts
//   today's players (live rarity) . app/api/dive/route.ts  (same database as the scoreboards)
//
// The sea behind the cards is drawn on a small canvas (chunky pixels), everything you read and tap is normal page text.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TIERS, type Prompt } from "../../../game/dive/prompts";
import { BANDS, PER_DAY, SECONDS, bandOf, check, diveNumber, norm, practicePrompts, promptsForDive, suggest, type Hit } from "../../../game/dive/daily";
import { buzz } from "../../../game/buzz"; // the phone buzz on a hit (game/buzz.ts)

const PINK = "#ff5fd2";
const INK = "#0b0614";
const SAVE_KEY = "pinkdive-save";
const SEEN_KEY = "pinkdive-seen"; // the prompts you've had lately (practice picks ones you haven't)
const SOUND_KEY = "pinkmane-dive-sound";
const VOL_KEY = "pinkmane-dive-vol"; // how loud the beeps are (0-1)
const OPTS_KEY = "pinkmane-dive-options"; // the other settings from the ESC menu
const NAME_KEY = "pinkrun-name"; // the same name as on every other scoreboard
const NAMED_KEY = "pinkdive-named"; // the name you put on today's board
const REPLAY_KEY = "pinkdive-replay"; // the dive number you used your one REPLAY on
// WEED LEAVES: every daily dive pays some (more the deeper you got), spend them on sub skins in the SUB SHOP.
// Kept in this browser only (like the best scores in the other games).
const LEAVES_KEY = "pinkdive-leaves";
const PAID_KEY = "pinkdive-paid"; // the last dive that paid out (so a dive only pays once)
const OWNED_KEY = "pinkdive-skins";
const SKIN_KEY = "pinkdive-skin";
const leavesFor = (total: number) => 5 + Math.round(total / 10); // 5 for diving at all, +1 for every 100 m
// THE SUB SKINS: hull colour, the light top edge, the dark bottom edge, the propeller. rainbow = the colours run along the
// hull, ghost = see-through. To add one: copy a line, give it a new id, name, price and colours.
type Skin = { id: string; name: string; price: number; hull: string; light: string; dark: string; prop: string; rainbow?: boolean; ghost?: boolean };
const SKINS: Skin[] = [
  { id: "pink", name: "PINK SUB", price: 0, hull: "#ff46c8", light: "#ff9be8", dark: "#b0208c", prop: "#ffd6ef" },
  { id: "toxic", name: "TOXIC", price: 60, hull: "#5adc3c", light: "#b4ff8c", dark: "#2a8a1c", prop: "#e6ffd0" },
  { id: "ice", name: "ICE", price: 90, hull: "#7ad8ff", light: "#d8f6ff", dark: "#3a8cc0", prop: "#ffffff" },
  { id: "void", name: "VOID", price: 120, hull: "#2a1c3c", light: "#6a4c8c", dark: "#0c0614", prop: "#b48cff" },
  { id: "gold", name: "GOLD RUSH", price: 160, hull: "#f0b828", light: "#ffe48a", dark: "#a8700c", prop: "#fff2c0" },
  { id: "bone", name: "BONE", price: 220, hull: "#ece4d4", light: "#ffffff", dark: "#a89c88", prop: "#ffffff" },
  { id: "lava", name: "LAVA", price: 280, hull: "#e8401c", light: "#ffa040", dark: "#8a1808", prop: "#ffd080" },
  { id: "rainbow", name: "RAINBOW", price: 420, hull: "#ff46c8", light: "#ffffff", dark: "#6a2c8c", prop: "#ffffff", rainbow: true },
  { id: "ghost", name: "GHOST SHIP", price: 650, hull: "#d6ccf0", light: "#ffffff", dark: "#8a7cb0", prop: "#ffffff", ghost: true },
];
const skinOf = (id: string) => SKINS.find((k) => k.id === id) ?? SKINS[0];

// a little pixel weed leaf (7 leaflets) for the WEED LEAVES counter
function Leaf({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 13 13" style={{ verticalAlign: "-2px", imageRendering: "pixelated" }} aria-hidden="true">
      <path fill="#3ee05a" d="M6 0h1v8H6zM5 2h1v5H5zM7 2h1v5H7zM2 3h1v1H2zM3 4h1v1H3zM4 5h1v2H4zM10 3h1v1h-1zM9 4h1v1H9zM8 5h1v2H8zM0 7h2v1H0zM2 7h2v1H2zM9 7h2v1H9zM11 7h2v1h-2zM1 8h3v1H1zM9 8h3v1H9z" />
      <path fill="#1c8a2c" d="M6 8h1v5H6z" />
    </svg>
  );
}
// a small picture of a sub in a skin's colours (for the shop)
function SubPic({ skin, w = 60 }: { skin: Skin; w?: number }) {
  const col = (x: number) => (skin.rainbow ? `hsl(${(x * 9) % 360}, 90%, 62%)` : skin.hull);
  return (
    <svg width={w} height={(w * 24) / 46} viewBox="-4 -12 46 24" style={{ imageRendering: "pixelated", opacity: skin.ghost ? 0.6 : 1 }} aria-hidden="true">
      <path fill="rgba(170,240,255,0.35)" d="M10 0h12v-3h-2v-2h-2v-1h-4v1h-2v2h-2z" />
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={1 + i * 4} y={2} width={4} height={8} fill={col(i * 4)} />
      ))}
      <rect x={3} y={0} width={36} height={2} fill={skin.light} />
      <rect x={3} y={10} width={36} height={2} fill={skin.dark} />
      <rect x={-2} y={2} width={4} height={8} fill={skin.dark} />
      <rect x={30} y={4} width={4} height={4} fill="#12041c" />
      <rect x={-5} y={1} width={3} height={10} fill={skin.prop} />
    </svg>
  );
}
const DEVICE_KEY = "pinkrun-device"; // the same "you" as the scoreboards

type Slot = { answer: string | null; tier: number; depth: number }; // tier -1 = no answer
type Result = { dive: number; slots: Slot[]; total: number; players: number; hist: Record<string, number>; better: number | null; live: boolean; off?: boolean };
type Screen = "intro" | "play" | "results";

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

// how many of today's divers you're deeper than, in percent (the same sum as the server: steps of 20, ties count half)
function betterThan(total: number, hist: Record<string, number>, players: number) {
  if (players <= 1) return 100;
  const mine = Math.floor(total / 20);
  let below = 0, same = 0;
  for (const [k, v] of Object.entries(hist)) {
    if (Number(k) < mine) below += Number(v) || 0;
    else if (Number(k) === mine) same += Number(v) || 0;
  }
  return Math.max(0, Math.min(100, Math.round(((below + Math.max(0, same - 1) / 2) / (players - 1)) * 100)));
}

const metres = (score: number) => `-${(score * 10).toLocaleString("en-US")} m`;

// ---------------------------------------------------------------- sound (tiny beeps made in code)
function useBeeps() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(true);
  const [level, setLevel] = useState(0.8);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(SOUND_KEY) !== "off");
      const v = parseFloat(localStorage.getItem(VOL_KEY) ?? "");
      if (v >= 0 && v <= 1) setLevel(v);
    } catch {}
  }, []);
  const beep = useCallback(
    (from: number, to: number, dur: number, type: OscillatorType = "square", vol = 0.12, delay = 0) => {
      if (!on || level <= 0) return;
      vol *= level;
      try {
        if (!ctxRef.current) {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return;
          ctxRef.current = new AC();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") void ctx.resume();
        const t = ctx.currentTime + delay;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(from, t);
        if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
      } catch {}
    },
    [on, level],
  );
  const toggle = () => {
    setOn((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? "off" : "on");
      } catch {}
      return !v;
    });
  };
  const setVolume = (v: number) => {
    const n = Math.round(Math.max(0, Math.min(1, v)) * 10) / 10;
    setLevel(n);
    try {
      localStorage.setItem(VOL_KEY, String(n));
    } catch {}
  };
  return { on, toggle, beep, level, setVolume };
}

// ---------------------------------------------------------------- the sea (canvas)
// depth = how far down the camera is, in score points (0 = at the surface, 700 = the trench)
// THE DIVE SCENE, made from PINKMANE's own game art:
//   at the surface: the VOID ghost ship (public/game/ghostship.png) sails past the sunset
//   PINKMANE himself (public/game/pinkdude.png) drives the pink sub, smoking under a glass dome
//   the deeper you sink, the stranger it gets:
//     ~110-320  the weed forest (the plants from Pink Kart, public/kart/props.png)
//     ~250-450  skeletons swimming around (the ship's crew)
//     ~380-560  lost Pink Kart items drifting down (skull bomb, lightning bolt, the eye, a sigil)
//     ~215-475  PINKMANE scuba divers swimming past
//     ~500+     PINKMANE in full armoured hard-hat diving suits, down in the deep
//     the floor: a sunken Pink Kart between the weed plants
// (the numbers are scores: 1 point = 3 pixels of water)
// the little fish (facing right): a proper fish shape, rounded body, forked tail, an eye near the front
const FISH = [
  ["....xx....", "x..xxxxx..", "xxxxxxxxox", "x..xxxxx..", ".....x...."],
  ["...xx...", "x.xxxxx.", "xxxxxxox", "x.xxxx..", "....x..."],
  ["....xxx.....", "x..xxxxxxx..", "xxxxxxxxxxox", "xxxxxxxxxxx.", "x..xxxxxx...", ".....xx....."],
];
const SKELETON = [
  ["..www..", ".wkwkw.", "..www..", "...w...", "w.www.w", ".wwwww.", "...w...", "..www..", "..w.w..", ".w...w."],
  ["..www..", ".wkwkw.", "..www..", "...w...", "..www..", ".wwwww.", "w..w..w", "..www..", "..w.w..", "..w.w.."],
];
// PINKMANE DIVERS (13 wide, drawn pixel by pixel, facing right). Letters = colours, see DIVER_COL.
// SCUBA: wetsuit with pink stripes, goggles, a tank on his back, fins, and his pink mohawk sticking up.
// ARMOR (the deep ones): a full copper hard-hat diving suit, his face behind the round porthole, the mohawk on top.
const SCUBA = [
  "....p.p......", "...ppppp.....", "..kkkkkkk.TT.", "..kyyyyyk.tT.", "..kgggggk.tT.", "..kgwggyk.tT.", "..kyyrrrk.tT.",
  "...kkkkkr.tT.", ".kbbbbbbbktT.", "kbbBbbbBbbkk.", "kb.bbbbb.bk..", "yk.bbbbb.ky..", "...bBbbBb....", "...bb.bbb....",
  "...bb..bb....", "..ffk..kff...", ".fff....fff..",
];
const ARMOR = [
  "......p......", ".....ppp.....", "....kpppk....", "...kcccccc...", "..kcccooocck.", ".kccoyyyyocck", "kCcoygwggyocC",
  "kCcoyyyyyyocC", ".kccoyrryocck", "..kccooocck..", "...kCcccCk...", ".kssssssssk..", "kssSssssSssk.", "ks.sssssss.sk",
  "GG.sSsssSs.GG", "GG.LLLLLLL.GG", "...sssksss...", "...sss.sss...", "...sSs.sSs...", "...sss.sss...", "..DDDk.kDDD..",
  ".DDDD...DDDD.",
];
const DIVER_COL: Record<string, string> = {
  k: "#12041c", y: "#ffd84a", p: "#ff46c8", g: "#7ae0ff", w: "#ffffff", r: "#3a2a40", b: "#1c1832", B: "#ff46c8",
  t: "#a8a8c0", T: "#6c6c86", f: "#3ad0e0", c: "#e2803a", C: "#9c4a1e", o: "#ffc77a", s: "#d4702e", S: "#8e3e18",
  G: "#3ab4cc", L: "#6ad8ee", D: "#3ab4cc",
};
// THE ZONES of the sea (in points: 1 point = 10 m), about 700 m apart. A dotted line with the name where each starts; in
// between, a faint line every 100 m. Crossing into a new zone flashes its name.
const ZONES: [number, string][] = [
  [40, "SUNLIGHT ZONE"], [110, "WEED FOREST"], [180, "THE HAZE"], [250, "TWILIGHT ZONE"], [320, "SHIPWRECK ALLEY"],
  [390, "KART GRAVEYARD"], [460, "MIDNIGHT ZONE"], [530, "THE ABYSS"], [600, "HADAL ZONE"], [680, "THE TRENCH"],
];

// a GHOST SUB: another diver from today, at the depth they had reached at the same point of the dive
type GhostSub = { name: string | null; depth: number };

function Sea({ depth, font, ghosts = [], skin = SKINS[0] }: { depth: number; font: string; ghosts?: GhostSub[]; skin?: Skin }) {
  const skinRef = useRef(skin);
  skinRef.current = skin;
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(depth);
  target.current = depth;
  const ghostRef = useRef(ghosts);
  ghostRef.current = ghosts;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    // drawn at 480 x 270 "big pixels" (zoomed out: a lot of sea on screen); the canvas itself is twice that, so the game
    // sprites keep their own detail
    const W = 480, H = 270;
    cv.width = W * 2;
    cv.height = H * 2;
    const c = cv.getContext("2d")!;
    c.imageSmoothingEnabled = false;
    c.setTransform(2, 0, 0, 2, 0, 0);
    const load = (src: string) => {
      const im = new Image();
      im.src = src;
      return im;
    };
    const DUDE = load("/game/pinkdude.png");
    const SHIP = load("/game/ghostship.png");
    const PROPS = load("/kart/props.png");
    const KART = load("/kart/kart-mane-side.png");
    const JUNK = ["bomb", "bolt", "mute", "vinyl"].map((n) => load(`/kart/item-${n}.png`)); // skull bomb, lightning, the eye, a sigil
    const ready = (im: HTMLImageElement) => im.complete && im.naturalWidth > 0;
    // a picture from a sheet: (sx, sy, sw, sh) on the sheet -> (x, y, w, h) on screen, optionally mirrored
    const spr = (im: HTMLImageElement, sx: number, sy: number, sw: number, sh: number, x: number, y: number, w: number, h: number, flip = false) => {
      if (!ready(im)) return;
      if (!flip) {
        c.drawImage(im, sx, sy, sw, sh, Math.round(x), Math.round(y), w, h);
        return;
      }
      c.save();
      c.translate(Math.round(x) + w, Math.round(y));
      c.scale(-1, 1);
      c.drawImage(im, sx, sy, sw, sh, 0, 0, w, h);
      c.restore();
    };
    let raf = 0;
    let cam = target.current;
    const start = performance.now();
    // fixed "random" things in the water, so they don't jump around between frames
    const rnd = (n: number) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const fish = Array.from({ length: 40 }, (_, i) => ({ y: 40 + rnd(i) * 2300, x: rnd(i + 50) * W, s: rnd(i + 99) < 0.5 ? -1 : 1, v: 4 + rnd(i + 7) * 10, kind: Math.floor(rnd(i + 3) * 3) }));
    const specks = Array.from({ length: 60 }, (_, i) => ({ y: rnd(i + 200) * 2400, x: rnd(i + 300) * W, v: 0.5 + rnd(i + 400) }));
    const weeds = Array.from({ length: 16 }, (_, i) => ({ y: 330 + i * 40 + rnd(i + 500) * 20, left: i % 2 === 0, pic: 3 + (i % 3), off: rnd(i + 600), back: i % 4 === 3 }));
    const skels = Array.from({ length: 7 }, (_, i) => ({ y: 760 + i * 80 + rnd(i + 700) * 40, x: rnd(i + 710), v: 3 + rnd(i + 720) * 5, s: i % 2 ? 1 : -1 }));
    const junk = Array.from({ length: 6 }, (_, i) => ({ y: 1150 + i * 85, x: 0.15 + rnd(i + 800) * 0.7, pic: i % 4 }));
    const scubas = Array.from({ length: 6 }, (_, i) => ({ y: 650 + i * 130 + rnd(i + 900) * 50, x: rnd(i + 910), v: 2 + rnd(i + 920) * 3, s: i % 2 ? 1 : -1 }));
    const armors = Array.from({ length: 5 }, (_, i) => ({ y: 1500 + i * 130 + rnd(i + 930) * 40, x: 0.15 + rnd(i + 940) * 0.7, flip: i % 2 === 1 }));
    // draw a diver from its letters (1 letter = 1 pixel), mirrored when going left
    const diver = (rows: string[], x: number, y: number, flip: boolean) => {
      rows.forEach((row, ry) => {
        for (let rx = 0; rx < row.length; rx++) {
          const ch = row[flip ? row.length - 1 - rx : rx];
          if (ch !== ".") rect(x + rx, y + ry, 1, 1, DIVER_COL[ch] ?? "#fff");
        }
      });
    };
    let lastZone = -1, flashName = "", flashAt = -10;
    const rect = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const lerp = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      cam += (target.current - cam) * 0.045;
      // The picture is cut to fit the screen (sides on a phone held upright, top/bottom on a wide screen): "seenW" is the part
      // you can see. On a wide screen the sub floats on the LEFT, next to the card; upright it floats BELOW the card.
      const box = cv.getBoundingClientRect();
      const upright = box.height > box.width * 1.1;
      const seenW = Math.min(W, Math.max(40, (H * box.width) / Math.max(1, box.height)));
      const seenX = (W - seenW) / 2;
      const camY = cam * 3; // pixels of water above the sub
      const subY = upright ? 200 : 118;
      const surface = subY - camY - 2; // where the waterline is on screen
      const at = (worldY: number) => worldY - camY + subY; // a depth in the sea -> a height on the screen
      c.clearRect(0, 0, W, H);
      // ---- sky (dusk pink), the sun and the ghost ship ----
      if (surface > 0) {
        for (let y = 0; y < Math.min(H, surface); y++) rect(0, y, W, 1, lerp([54, 18, 74], [255, 122, 200], Math.max(0, Math.min(1, y / 60))));
        const sunX = seenX + seenW * (upright ? 0.18 : 0.93);
        for (let dy = 0; dy < 13; dy++) {
          const hw = Math.round(Math.sqrt(13 * 13 - dy * dy));
          rect(sunX - hw, surface - 1 - dy, hw * 2, 1, dy < 4 ? "#ffd0ee" : "#ffeaf8");
        }
        for (let i = 0; i < 4; i++) {
          const cx = ((i * 73 + t * (3 + i)) % (W + 60)) - 30, cy = 10 + i * 9 + surface - 60;
          rect(cx, cy, 26, 4, "rgba(255,255,255,0.22)");
          rect(cx + 6, cy - 3, 14, 3, "rgba(255,255,255,0.22)");
        }
        // the VOID ghost ship, rocking on the waves (only the ship: the cloud it sails on in VOID is left off)
        // (upright, the sub is in the middle: the ship stays out at the right edge, partly cut off)
        const shipX = upright ? seenX + seenW - 8 + Math.sin(t * 0.15) * 3 : seenX + seenW * 0.8 + Math.sin(t * 0.15) * 6;
        const rock = Math.round(Math.sin(t * 1.3) * 0.8);
        spr(SHIP, 0, 0, 72, 46, shipX - 18, surface - 20 + rock, 36, 23);
      }
      // ---- water: darker the deeper you are ----
      const from = Math.max(0, Math.ceil(surface));
      for (let y = from; y < H; y += 3) {
        const k = Math.min(1, Math.max(0, (y - surface) / 3) / 700 + (y / H) * 0.1);
        rect(0, y, W, 3, k < 0.3 ? lerp([214, 74, 178], [98, 38, 140], k / 0.3) : lerp([98, 38, 140], [8, 4, 18], Math.min(1, (k - 0.3) / 0.5)));
      }
      if (surface > -4 && surface < H) for (let x = 0; x < W; x += 4) rect(x, surface + Math.round(Math.sin(x * 0.2 + t * 2)), 4, 2, "#ffc4ee");
      if (camY < 500) {
        c.globalAlpha = Math.max(0, 0.07 - camY / 7000);
        for (let i = 0; i < 9; i++) rect(8 + i * 27 + Math.sin(t * 0.4 + i) * 5, Math.max(0, surface + 2), 3 + (i % 3) * 2, H, "#ffe6f7");
        c.globalAlpha = 1;
      }
      const wet = (y: number, h: number) => y + h > Math.max(0, surface + 3) && y < H; // on screen and under water
      for (const sp of specks) {
        const y = (((sp.y - t * 6 * sp.v) % 2400) + 2400) % 2400;
        const sy = at(y);
        if (wet(sy, 1)) rect(sp.x, sy, 1, 1, "rgba(255,220,250,0.35)");
      }
      // ---- the weed forest (back row first, dimmer) ----
      const weed = (back: boolean) => {
        for (const w of weeds) {
          if (w.back !== back) continue;
          const base = at(w.y);
          if (!wet(base - 32, 34)) continue;
          const sway = Math.sin(t * 0.9 + w.off * 6) * 1.2;
          const x = back ? seenX + seenW * (0.25 + w.off * 0.5) : w.left ? seenX - 3 + w.off * 6 : seenX + seenW - 17 - w.off * 6;
          c.globalAlpha = back ? 0.45 : 1;
          spr(PROPS, w.pic * 80, 0, 80, 128, x + sway, base - 32, 20, 32, !w.left);
          c.globalAlpha = 1;
          if (!back) rect(x - 2, base - 1, 24, 3, "#14061f"); // the rock it grows on
        }
      };
      weed(true);
      // ---- fish ----
      for (const f of fish) {
        const sy = at(f.y);
        if (!wet(sy, 4)) continue;
        const x = ((((f.x + t * f.v * f.s) % (W + 30)) + W + 30) % (W + 30)) - 15;
        const col = f.y > 1200 ? "rgba(255,95,210,0.5)" : "rgba(20,6,32,0.55)";
        const rows = FISH[f.kind];
        rows.forEach((row, ry) => {
          for (let rx = 0; rx < row.length; rx++) {
            const ch = row[f.s > 0 ? rx : row.length - 1 - rx];
            if (ch === "x") rect(x + rx, sy + ry - 2, 1, 1, col);
            else if (ch === "o") rect(x + rx, sy + ry - 2, 1, 1, f.y > 1200 ? "#fff" : "rgba(255,230,250,0.6)");
          }
        });
      }
      // ---- the ship's crew: skeletons swimming ----
      for (const k of skels) {
        const sy = at(k.y) + Math.sin(t * 1.5 + k.x * 9) * 2;
        if (!wet(sy, 10)) continue;
        const x = seenX + ((((k.x * seenW + t * k.v * k.s) % (seenW + 20)) + seenW + 20) % (seenW + 20)) - 10;
        const rows = SKELETON[Math.floor(t * 2 + k.x * 5) % 2];
        rows.forEach((row, ry) => {
          for (let rx = 0; rx < row.length; rx++) {
            const ch = row[k.s > 0 ? rx : row.length - 1 - rx];
            if (ch !== ".") rect(x + rx, sy + ry, 1, 1, ch === "w" ? "#efe6f4" : "#14061f");
          }
        });
      }
      // ---- lost Pink Kart items drifting down ----
      for (const j of junk) {
        const sy = at(j.y + Math.sin(t * 0.7 + j.pic) * 4);
        if (!wet(sy, 20)) continue;
        spr(JUNK[j.pic], 0, 0, 96, 96, seenX + seenW * j.x + Math.sin(t * 0.5 + j.x * 7) * 3, sy, 20, 20);
      }
      // ---- PINKMANE divers: scuba gear in the middle of the sea, full armoured hard-hat suits down in the deep ----
      for (const d of scubas) {
        const sy = at(d.y) + Math.sin(t * 1.3 + d.x * 9) * 2;
        if (!wet(sy, 17)) continue;
        const x = seenX + ((((d.x * seenW + t * d.v * d.s) % (seenW + 30)) + seenW + 30) % (seenW + 30)) - 15;
        diver(SCUBA, x, sy, d.s < 0);
        for (let i = 0; i < 3; i++) {
          const bt = (t * 0.8 + i / 3 + d.x) % 1; // bubbles from the regulator
          rect(x + (d.s < 0 ? 4 : 8) + Math.sin(t * 3 + i) , sy + 6 - bt * 22, 1, 1, `rgba(220,245,255,${0.8 * (1 - bt)})`);
        }
      }
      for (const d of armors) {
        const sy = at(d.y) + Math.sin(t * 0.7 + d.x * 8) * 1.5; // heavy: they bob slowly
        if (!wet(sy, 22)) continue;
        const ax = seenX + seenW * d.x + Math.sin(t * 0.25 + d.x * 4) * 6;
        diver(ARMOR, ax, sy, d.flip);
        for (let i = 0; i < 4; i++) {
          const bt = (t * 0.6 + i / 4 + d.x) % 1; // bubbles out of the helmet
          rect(ax + 6 + Math.sin(t * 2 + i * 2) * 2, sy - 1 - bt * 30, i % 2 ? 1 : 2, i % 2 ? 1 : 2, `rgba(220,245,255,${0.7 * (1 - bt)})`);
        }
      }
      weed(false);
      // ---- THE DEPTH LINES: a faint dotted line every 100 m (with its depth on the left), and a brighter one with the
      // name where each ZONE starts (on the right)
      c.textBaseline = "bottom";
      c.font = `5px ${font}, monospace`;
      const fromPts = Math.max(1, Math.floor((camY - subY) / 3)), toPts = Math.ceil((camY - subY + H) / 3);
      for (let pts = fromPts; pts <= Math.min(720, toPts); pts++) {
        if (pts % 10) continue;
        const ly = Math.round(at(pts * 3));
        if (ly < 3 || ly > H - 1 || ly < surface + 4) continue;
        for (let x = Math.round(seenX) + 2; x < seenX + seenW - 2; x += 6) rect(x, ly, 2, 1, "rgba(255,255,255,0.13)");
        c.textAlign = "left";
        c.fillStyle = "rgba(255,255,255,0.32)";
        c.fillText(`-${(pts * 10).toLocaleString("en-US")} m`, seenX + 3, ly - 1);
      }
      ZONES.forEach(([pts, name], i) => {
        const ly = Math.round(at(pts * 3));
        if (ly < 4 || ly > H - 1 || ly < surface + 4) return;
        const col = ["#9fe8ff", "#56c8ff", "#ff5fd2", "#b77cff", "#ffd84a"][i % 5];
        for (let x = Math.round(seenX) + 4; x < seenX + seenW - 4; x += 5) rect(x, ly, 3, 1, "rgba(255,255,255,0.38)");
        rect(seenX + seenW - 6, ly - 6, 3, 3, col);
        c.textAlign = "right";
        c.fillStyle = "rgba(255,255,255,0.8)";
        c.fillText(`${name} · -${(pts * 10).toLocaleString("en-US")} m`, seenX + seenW - 9, ly - 2);
      });
      // crossing into a new zone: its name flashes big at the top for a moment
      const zoneNow = ZONES.reduce((z, [pts], i) => (cam >= pts ? i : z), -1);
      if (zoneNow !== lastZone) {
        if (zoneNow > lastZone && zoneNow >= 0 && lastZone >= -1 && t > 1) {
          flashName = ZONES[zoneNow][1];
          flashAt = t;
        }
        lastZone = zoneNow;
      }
      const ft = t - flashAt;
      if (ft < 2.6) {
        c.globalAlpha = ft < 0.3 ? ft / 0.3 : ft > 2 ? (2.6 - ft) / 0.6 : 1;
        c.textAlign = "center";
        c.textBaseline = "top";
        c.font = `7px ${font}, monospace`;
        c.fillStyle = "#12041c";
        c.fillText(flashName, seenX + seenW / 2 + 1, 9);
        c.fillStyle = "#ffffff";
        c.fillText(flashName, seenX + seenW / 2, 8);
        c.font = `4px ${font}, monospace`;
        c.fillStyle = "#9fe8ff";
        c.fillText("NOW ENTERING", seenX + seenW / 2, 2);
        c.globalAlpha = 1;
      }
      // ---- the sea floor: a sunken Pink Kart between the plants ----
      const floor = at(700 * 3 + 40);
      if (floor < H) {
        rect(0, floor, W, H - floor, "#05020a");
        for (let x = 0; x < W; x += 9) rect(x, floor - ((rnd(x) * 5) | 0), 5, 6, "#0c0518");
        spr(KART, 2, 0, 116, 67, seenX + seenW * 0.55, floor - 14, 29, 17);
        for (let i = 0; i < 3; i++) spr(PROPS, (3 + i) * 80, 0, 80, 128, seenX + seenW * (0.08 + i * 0.3), floor - 30, 18, 29, i === 1);
      }
      // ---- PINKMANE in the pink sub ----
      const bob = Math.round(Math.sin(t * 2) * 1.5);
      const sx = Math.round(upright ? W / 2 - 21 : seenX + seenW * 0.08), sy2 = subY - 6 + bob;
      // ---- THE SOULS (today's other divers): each one's ghost floats on the line where their dive ended, wiggling and
      // waving, with their name (or "DIVER" for one without a name). You see them as you sink past them.
      const gs = ghostRef.current;
      for (let i = 0; i < gs.length; i++) {
        const g = gs[i];
        const lineY = Math.round(at(g.depth * 3));
        if (lineY < -30 || lineY > H + 30) continue;
        let gx2: number;
        if (upright) {
          const spots = [seenX + 6, seenX + seenW - 22, seenX + seenW * 0.5 - 8, seenX + seenW * 0.25 - 4, seenX + seenW * 0.75 - 12];
          gx2 = spots[i % spots.length] + (i >= spots.length ? 9 : 0);
        } else {
          const half = (Math.min(520, box.width * 0.94) / 2) * (seenW / Math.max(1, box.width)) + 6; // half the card, in sea pixels
          const leftFrom = sx + 52, leftTo = W / 2 - half - 18, rightFrom = W / 2 + half + 10, rightTo = seenX + seenW - 20;
          const spots: number[] = [];
          for (let x = rightFrom; x <= rightTo; x += 30) spots.push(x);
          for (let x = leftFrom; x <= leftTo; x += 30) spots.push(x);
          if (!spots.length) spots.push(sx + 52);
          gx2 = spots[i % spots.length] + (i >= spots.length ? 12 : 0);
        }
        // the line where they stopped
        c.globalAlpha = 0.5;
        for (let x = -10; x < 24; x += 4) rect(gx2 + x, lineY, 2, 1, "#e6dcff");
        // the soul: a little ghost, bobbing and wiggling side to side, one arm waving
        const wx = Math.round(gx2 + Math.sin(t * 2.6 + i * 1.3) * 2);
        const wy = Math.round(lineY - 17 + Math.sin(t * 1.9 + i) * 2);
        c.globalAlpha = 0.72;
        const SOUL = ["....wwwwww....", "..wwwwwwwwww..", ".wwwwwwwwwwww.", ".wwkkwwwwkkww.", ".wwkkwwwwkkww.", "wwwwwwwwwwwwww", "wwwwwwkkwwwwww", "wwwwwwkkwwwwww", "wwwwwwwwwwwwww", "wwwwwwwwwwwwww", "wwwwwwwwwwwwww"];
        SOUL.forEach((row, ry) => {
          for (let rx = 0; rx < row.length; rx++) if (row[rx] !== ".") rect(wx + rx, wy + ry, 1, 1, row[rx] === "k" ? "#2a1a40" : "#f2eaff");
        });
        const hem = Math.floor(t * 5 + i) % 2 ? "w.ww.ww.ww.ww." : ".ww.ww.ww.ww.w";
        for (let rx = 0; rx < hem.length; rx++) if (hem[rx] !== ".") rect(wx + rx, wy + 11, 1, 1, "#f2eaff");
        // the waving arm (up, down, up...)
        if (Math.floor(t * 3.2 + i) % 2) {
          rect(wx + 14, wy + 4, 1, 1, "#f2eaff");
          rect(wx + 15, wy + 3, 1, 1, "#f2eaff");
          rect(wx + 15, wy + 1, 2, 2, "#f2eaff");
        } else {
          rect(wx + 14, wy + 6, 1, 1, "#f2eaff");
          rect(wx + 15, wy + 6, 2, 1, "#f2eaff");
          rect(wx + 16, wy + 4, 2, 2, "#f2eaff");
        }
        rect(wx - 1, wy + 6, 1, 2, "#f2eaff"); // the other arm, hanging
        c.globalAlpha = 0.8;
        const label = (g.name ?? "DIVER").slice(0, 12);
        c.font = `5px ${font}`;
        c.textAlign = "center";
        c.fillStyle = "#000";
        c.fillText(label, wx + 7 + 0.5, wy - 3.5);
        c.fillStyle = g.name ? "#ffe6f7" : "#c8bce8";
        c.fillText(label, wx + 7, wy - 4);
        c.globalAlpha = 1;
      }
      if (cam > 250) {
        // the headlight once it's dark
        c.globalAlpha = 0.14;
        for (let i = 0; i < 28; i++) rect(sx + 44 + i * 3, sy2 + 11 - i * 0.5, 3, 4 + i, "#fff0a8");
        c.globalAlpha = 1;
      }
      // the glass dome: a half circle (radius 11) sitting on the hull. Everything inside it is cut to its exact shape.
      const gx = sx + 18, gy = sy2 + 8;
      const dome = () => {
        c.beginPath();
        for (let dy = 0; dy <= 10; dy++) {
          const hw = Math.round(Math.sqrt(10.5 * 10.5 - dy * dy));
          c.rect(gx - hw, gy - dy - 1, hw * 2, 1);
        }
      };
      c.save();
      dome();
      c.clip();
      // PINKMANE (the third picture has the smoke coming off the joint), sitting low enough that his hair stays inside
      const frame = Math.floor(t * 1.6) % 4 === 3 ? 2 : Math.floor(t * 1.6) % 2;
      spr(DUDE, frame * 24, 0, 24, 23, sx + 12, gy - 10, 12, 11.5);
      // HOTBOXED: the smoke fills the dome, thicker and thinner in slow waves (it builds up, then clears a bit)
      const fill = 0.5 + 0.5 * Math.sin(t * 0.35);
      c.fillStyle = `rgba(206, 198, 218, ${0.2 + fill * 0.3})`;
      c.fillRect(gx - 11, gy - 12, 22, 12);
      for (let i = 0; i < 9; i++) {
        // puffs drifting round and round inside the glass
        const ph = t * (0.25 + (i % 3) * 0.08) + i * 1.7;
        const px = gx + Math.sin(ph) * (4 + (i % 4) * 1.5);
        const py = gy - 4 - ((i * 2.3 + t * 1.2) % 7);
        const size = 4 + (i % 3);
        c.fillStyle = `rgba(238, 234, 246, ${(0.3 + fill * 0.4) * (0.6 + 0.4 * Math.sin(ph * 2))})`;
        c.fillRect(Math.round(px - size / 2), Math.round(py - size / 2), size, size - 1);
        c.fillRect(Math.round(px - size / 2) + 1, Math.round(py - size / 2) - 1, size - 2, 1);
      }
      c.restore();
      // the glass on top: a faint tint, a bright rim and a shine
      for (let dy = 0; dy <= 11; dy++) {
        const hw = Math.round(Math.sqrt(11 * 11 - dy * dy));
        rect(gx - hw, gy - dy, hw * 2, 1, "rgba(170,240,255,0.1)");
        rect(gx - hw, gy - dy, 1, 1, "rgba(220,250,255,0.8)");
        rect(gx + hw - 1, gy - dy, 1, 1, "rgba(220,250,255,0.8)");
      }
      rect(gx - 6, gy - 8, 2, 1, "#ffffff"); // a shine on the glass
      rect(gx - 7, gy - 7, 1, 2, "#ffffff");
      // (where the sub is, for the SHARE TO INSTAGRAM picture: it frames the sea around your sub)
      cv.dataset.subx = String((sx + 20) * 2);
      cv.dataset.suby = String((sy2 + 12) * 2);
      // the hull (in the skin from the SUB SHOP)
      const sk = skinRef.current;
      if (sk.ghost) c.globalAlpha = 0.6;
      rect(sx + 3, sy2 + 8, 36, 12, sk.hull);
      rect(sx + 1, sy2 + 10, 40, 8, sk.hull);
      if (sk.rainbow) for (let x = 0; x < 40; x += 4) rect(sx + 1 + x, sy2 + (x < 2 || x > 37 ? 10 : 8), 4, x < 2 || x > 37 ? 8 : 12, `hsl(${(x * 9 + t * 80) % 360}, 90%, 62%)`);
      rect(sx + 3, sy2 + 8, 36, 2, sk.light);
      rect(sx + 3, sy2 + 18, 36, 2, sk.dark);
      rect(sx + 41, sy2 + 12, 2, 4, sk.hull); // nose
      rect(sx + 30, sy2 + 12, 4, 4, "#12041c"); // porthole
      rect(sx + 31, sy2 + 13, 2, 1, "#9fe8ff");
      rect(sx + 8, sy2 + 13, 3, 3, "#12041c");
      rect(sx + 9, sy2 + 13, 1, 1, "#9fe8ff");
      rect(sx - 2, sy2 + 10, 4, 8, sk.dark); // tail
      const spin = Math.floor(t * 12) % 2;
      rect(sx - 5, sy2 + (spin ? 9 : 12), 3, spin ? 10 : 4, sk.prop); // propeller
      c.globalAlpha = 1;
      for (let i = 0; i < 5; i++) {
        const bt = (t * 1.2 + i * 0.2) % 1;
        rect(sx - 8 - bt * 14, sy2 + 13 - bt * 16 + Math.sin(i + t * 3) * 2, 2, 2, `rgba(255,255,255,${0.7 * (1 - bt)})`);
      }
      // a little smoke leaking out of the top of the dome
      for (let i = 0; i < 3; i++) {
        const bt = (t * 0.5 + i / 3) % 1;
        if (surface < sy2 - 4 - bt * 30) rect(gx + 2 + Math.sin(t * 2 + i * 2) * 2, sy2 - 4 - bt * 30, 2, 2, `rgba(230,220,240,${0.6 * (1 - bt)})`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pd-sea" aria-hidden="true" />;
}

// ---------------------------------------------------------------- the curve of today's players
function Curve({ hist, mine }: { hist: Record<string, number>; mine: number }) {
  // counts per 20 points, smoothed into a hill
  const N = 36; // 0 .. 700 in steps of 20
  const raw = Array.from({ length: N }, (_, i) => hist[String(i)] ?? 0);
  const smooth = raw.map((_, i) => {
    let s = 0, w = 0;
    for (let k = -3; k <= 3; k++) {
      const v = raw[i + k];
      if (v === undefined) continue;
      const g = Math.exp(-(k * k) / 4);
      s += v * g;
      w += g;
    }
    return s / w;
  });
  const top = Math.max(...smooth, 0.001);
  const W = 320, H = 90;
  const x = (score: number) => (score / 700) * W;
  const pts = smooth.map((v, i) => `${x(i * 20 + 10).toFixed(1)},${(H - 6 - (v / top) * (H - 16)).toFixed(1)}`);
  const mx = x(Math.min(700, mine));
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="pd-curve" role="img" aria-label="How today's divers scored">
      <polygon points={`0,${H - 6} ${pts.join(" ")} ${W},${H - 6}`} fill="rgba(86,200,255,0.25)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#56c8ff" strokeWidth="2" />
      <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="rgba(255,255,255,0.3)" />
      <line x1={mx} y1="8" x2={mx} y2={H - 6} stroke={PINK} strokeWidth="2" />
      <rect x={mx - 3} y="5" width="6" height="6" fill={PINK} />
      <text x={Math.max(12, Math.min(W - 12, mx))} y={H + 9} fill={PINK} fontSize="8" textAnchor="middle">
        YOU
      </text>
      {[0, 350, 700].map((v) => (
        <text key={v} x={v === 0 ? 2 : v === 700 ? W - 2 : W / 2} y={H + 9} fill="rgba(255,255,255,0.45)" fontSize="7" textAnchor={v === 0 ? "start" : v === 700 ? "end" : "middle"}>
          {Math.abs(mx - x(v)) < 26 ? "" : v}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- the game
export default function PinkDive({ pixelFont }: { pixelFont: string }) {
  const [screen, setScreen] = useState<Screen>("intro");
  // TEST MODE (for trying a coming day on the live site): pinkmane.site/games/pink-dive?test=tomorrow (or ?test=3 = DIVE #3,
  // up to 7 days ahead). It plays that day's 7 prompts like a practice: nothing is saved or sent, so it never counts.
  const [testDive, setTestDive] = useState(0);
  // ONE REPLAY A DAY: after today's dive you can play the same 7 prompts once more, just for fun (it never counts)
  const [replay, setReplay] = useState(false); // this run is the replay
  const [replayUsed, setReplayUsed] = useState(false);
  const [realTotal, setRealTotal] = useState<number | null>(null); // today's real result (the one that counts)
  const [realAnswers, setRealAnswers] = useState<(string | null)[]>([]); // its answers: the replay can't use them again
  // WEED LEAVES + THE SUB SHOP
  const [leaves, setLeaves] = useState(0);
  const [earned, setEarned] = useState(0); // what this dive paid
  const [owned, setOwned] = useState<string[]>(["pink"]);
  const [skinId, setSkinId] = useState("pink");
  const [shop, setShop] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  // TODAY'S BOARD + THE GHOST SUBS (other divers of the day, from app/api/dive)
  const [board, setBoard] = useState<{ top: { name: string; score: number }[]; ghosts: { name: string | null; depths: number[] }[] } | null>(null);
  const [ghostsOn, setGhostsOn] = useState(false); // this dive has today's real prompts, so the ghosts fit
  const [myName, setMyName] = useState("");
  const [named, setNamed] = useState<{ name: string; rank: number | null } | null>(null);
  const [nameMsg, setNameMsg] = useState("");
  const [saving, setSaving] = useState(false);
  const [dive, setDive] = useState(1);
  const [practice, setPractice] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [at, setAt] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(SECONDS);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [sugg, setSugg] = useState<Hit[]>([]);
  const [canGo, setCanGo] = useState(false); // the answer card is up and waiting for you to carry on
  const nextRef = useRef<(() => void) | null>(null); // "DID YOU MEAN ...?" after a word that didn't count
  const [reveal, setReveal] = useState<Hit | "none" | null>(null); // the answer card between two prompts
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [nextIn, setNextIn] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const deadline = useRef(0);
  const lockedAt = useRef(-1); // the prompt that's already been answered (so the clock can't end it twice)
  const { on: soundOn, toggle: toggleSound, beep, level, setVolume } = useBeeps();
  // THE ESC MENU (ESC, or the MENU button on phones): pauses the clock and hides the prompt (no peeking), and holds the settings
  const [menu, setMenu] = useState(false);
  const [row, setRow] = useState(0);
  const [help, setHelp] = useState(false); // HOW TO PLAY shown inside the menu
  const [confirmQuit, setConfirmQuit] = useState(false);
  const [opts, setOpts] = useState({ spellHelp: true, bigText: false, clockBeeps: true });
  const pausedLeft = useRef(-1); // seconds that were left on the clock when the menu opened
  useEffect(() => {
    try {
      const o = JSON.parse(localStorage.getItem(OPTS_KEY) || "null");
      if (o && typeof o === "object") setOpts((d) => ({ ...d, ...o }));
    } catch {}
  }, []);
  const setOpt = (k: keyof typeof opts) => {
    setOpts((o) => {
      const n = { ...o, [k]: !o[k] };
      try {
        localStorage.setItem(OPTS_KEY, JSON.stringify(n));
      } catch {}
      return n;
    });
  };

  const loadBoard = (d: number) => {
    fetch(`/api/dive?dive=${d}&board=1&me=${encodeURIComponent(deviceId())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => {
        if (b && Array.isArray(b.top)) setBoard({ top: b.top, ghosts: Array.isArray(b.ghosts) ? b.ghosts : [] });
        // the newest count of today's divers: "DEEPER THAN X%" keeps up as more people dive (it was only worked out once)
        if (b && typeof b.players === "number" && b.hist)
          setResult((r) => (r && r.live && r.dive === d ? { ...r, players: b.players, hist: b.hist, better: betterThan(r.total, b.hist, b.players) } : r));
      })
      .catch(() => {});
  };
  useEffect(() => {
    try {
      setReplayUsed(Number(localStorage.getItem(REPLAY_KEY)) === diveNumber());
      const sv = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as Result | null;
      if (sv && sv.dive === diveNumber() && typeof sv.total === "number") {
        setRealTotal(sv.total);
        setRealAnswers(sv.slots.map((x) => x.answer));
      }
    } catch {}
    try {
      setLeaves(Math.max(0, Number(localStorage.getItem(LEAVES_KEY)) || 0));
      const o = JSON.parse(localStorage.getItem(OWNED_KEY) || "[]");
      if (Array.isArray(o)) setOwned(["pink", ...o.filter((x: unknown) => typeof x === "string" && x !== "pink")]);
      const k = localStorage.getItem(SKIN_KEY);
      if (k) setSkinId(k);
    } catch {}
    try {
      setMyName(localStorage.getItem(NAME_KEY) || "");
      const n = JSON.parse(localStorage.getItem(NAMED_KEY) || "null") as { dive: number; name: string; rank: number | null } | null;
      if (n && n.dive === diveNumber()) setNamed({ name: n.name, rank: n.rank });
    } catch {}
  }, []);

  // today's dive; if you already dove today, straight to your result
  useEffect(() => {
    const d = diveNumber();
    setDive(d);
    try {
      const t = new URLSearchParams(window.location.search).get("test");
      if (t) {
        const n = t === "tomorrow" ? d + 1 : t === "today" ? d : parseInt(t, 10);
        if (n >= 1 && n <= d + 7) {
          setTestDive(n);
          setDive(n);
          return; // test mode: don't jump to today's saved result
        }
      }
    } catch {}
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as Result | null;
      if (saved && saved.dive === d && Array.isArray(saved.slots)) {
        setPrompts(promptsForDive(d));
        setSlots(saved.slots);
        setResult(saved);
        setScreen("results");
        setGhostsOn(true);
        loadBoard(d);
        // the curve keeps filling up during the day: get the newest one
        fetch(`/api/dive?dive=${d}`)
          .then((r) => r.json())
          .then((c) => {
            if (c && typeof c.players === "number") setResult((r) => (r && !practice ? { ...r, players: c.players, hist: c.hist ?? r.hist } : r));
          })
          .catch(() => {});
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock to the next dive (midnight UTC)
  useEffect(() => {
    if (screen !== "results") return;
    const tick = () => {
      const ms = 86400000 - (Date.now() % 86400000);
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      setNextIn(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [screen]);

  const total = slots.reduce((a, s) => a + s.depth, 0);

  const begin = (isPracticeAsked: boolean, isReplay = false) => {
    const d = testDive && !isPracticeAsked && !isReplay ? testDive : diveNumber();
    const isPractice = isPracticeAsked || isReplay || testDive > 0; // a test dive or the replay counts like a practice (never saved or sent)
    setReplay(isReplay);
    if (isReplay) {
      setReplayUsed(true);
      try {
        localStorage.setItem(REPLAY_KEY, String(d));
      } catch {}
    }
    setDive(d);
    setPractice(isPractice);
    const today = promptsForDive(d);
    // practice remembers the prompts you've had (today's dive counts too), so they don't keep coming back
    let seen: string[] = [];
    try {
      seen = JSON.parse(localStorage.getItem(SEEN_KEY) || "[]");
      if (!Array.isArray(seen)) seen = [];
    } catch {}
    const these = isPracticeAsked && !isReplay ? practicePrompts(today, seen) : today;
    try {
      const next = [...seen.filter((id) => !these.some((p) => p.id === id)), ...these.map((p) => p.id)].slice(-500);
      localStorage.setItem(SEEN_KEY, JSON.stringify(next));
    } catch {}
    setPrompts(these);
    // the ghost subs: only when these are today's real prompts (the daily dive, or a test of today's)
    const realToday = (!isPracticeAsked || isReplay) && d === diveNumber();
    setGhostsOn(realToday);
    if (realToday) loadBoard(d);
    else setBoard(null);
    setSlots([]);
    setAt(0);
    setTyped("");
    setNote(null);
    setSugg([]);
    setReveal(null);
    setResult(null);
    setCopied(false);
    setEarned(0);
    setShareMsg("");
    lockedAt.current = -1;
    deadline.current = Date.now() + SECONDS * 1000;
    setLeft(SECONDS);
    setScreen("play");
    beep(300, 90, 0.5, "sine", 0.2);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  // the dive is over: save it, and ask the server for the live depths + today's curve
  const finish = (all: Slot[], isPractice: boolean, d: number) => {
    const base: Result = { dive: d, slots: all, total: all.reduce((a, s) => a + s.depth, 0), players: 0, hist: {}, better: null, live: false };
    setResult(base);
    setScreen("results");
    [523, 659, 784, 1046].forEach((f, i) => beep(f, f, i === 3 ? 0.4 : 0.12, "square", 0.1, i * 0.11));
    if (isPractice) return;
    setRealTotal(base.total);
    setRealAnswers(all.map((x) => x.answer));
    // WEED LEAVES: today's dive pays once
    try {
      if (Number(localStorage.getItem(PAID_KEY)) !== d) {
        const pay = leavesFor(base.total);
        const now = Math.max(0, Number(localStorage.getItem(LEAVES_KEY)) || 0) + pay;
        localStorage.setItem(LEAVES_KEY, String(now));
        localStorage.setItem(PAID_KEY, String(d));
        setLeaves(now);
        setEarned(pay);
      }
    } catch {}
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(base));
    } catch {}
    fetch("/api/dive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dive: d, device: deviceId(), answers: all.map((s) => s.answer) }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res || !Array.isArray(res.depths)) {
          setResult((r) => (r ? { ...r, off: true } : r)); // the database is offline: your own depths still count
          return;
        }
        const live: Result = {
          dive: d,
          slots: all.map((s, i) => ({ ...s, depth: Number(res.depths[i]) || 0 })),
          total: Number(res.total) || 0,
          players: Number(res.players) || 0,
          hist: res.hist ?? {},
          better: typeof res.better === "number" ? res.better : null,
          live: true,
        };
        setSlots(live.slots);
        setResult(live);
        setRealTotal(live.total);
        loadBoard(d);
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(live));
        } catch {}
      })
      .catch(() => setResult((r) => (r ? { ...r, off: true } : r)));
  };

  // one prompt is done (with an answer, or without)
  const lock = (hit: Hit | null) => {
    if (reveal || lockedAt.current === at) return;
    lockedAt.current = at;
    const slot: Slot = hit ? { answer: hit.answer, tier: hit.tier, depth: hit.depth } : { answer: null, tier: -1, depth: 0 };
    const all = [...slots, slot];
    setSlots(all);
    setReveal(hit ?? "none");
    setNote(null);
    setSugg([]);
    if (hit) [0, 1, 2].slice(0, 1 + Math.min(2, hit.tier)).forEach((i) => beep(500 + hit.tier * 120 + i * 160, 500 + hit.tier * 120 + i * 160, 0.1, "square", 0.1, i * 0.08));
    else beep(180, 70, 0.4, "sawtooth", 0.1);
    const isPractice = practice, d = dive, n = at;
    // the answer card stays up (enjoy it) until you type, press a key or tap: then the next prompt starts
    window.setTimeout(() => setCanGo(true), hit ? 700 : 500);
    nextRef.current = () => {
        nextRef.current = null;
        setCanGo(false);
        setReveal(null);
        setTyped("");
        if (n + 1 >= PER_DAY) finish(all, isPractice, d);
        else {
          setAt(n + 1);
          deadline.current = Date.now() + SECONDS * 1000;
          setLeft(SECONDS);
          window.setTimeout(() => inputRef.current?.focus(), 30);
        }
    };
  };
  const goOn = () => {
    if (canGo && nextRef.current) nextRef.current();
  };
  // typing (any letter) or ENTER / SPACE carries on; the letter you typed becomes the start of your next answer
  useEffect(() => {
    if (screen !== "play" || !reveal || !canGo) return;
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const letter = e.key.length === 1 && e.key !== " " ? e.key : "";
      if (!letter && e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      const last = at + 1 >= PER_DAY; // (after the last one comes the results screen: nothing to type there)
      goOn();
      if (letter && !last) setTyped(letter);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, reveal, canGo, at]);

  // the 25 second clock
  useEffect(() => {
    if (screen !== "play" || reveal || menu) return;
    const id = window.setInterval(() => {
      const s = Math.max(0, (deadline.current - Date.now()) / 1000);
      setLeft((prev) => {
        if (opts.clockBeeps && Math.ceil(s) !== Math.ceil(prev) && s <= 5 && s > 0) beep(880, 880, 0.05, "square", 0.05);
        return s;
      });
      if (s <= 0) lock(null);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, reveal, at, slots, menu, opts.clockBeeps]);

  const checking = useRef(false);
  const submit = async () => {
    if (screen !== "play" || reveal || checking.current) return;
    const p = prompts[at];
    if (!p || !typed.trim()) return;
    let hit = check(p, typed);
    if (!hit) {
      // not on our lists: ask THE BIG LOOKUP (the server checks it on Wikidata, app/api/dive + game/dive/lookup.ts)
      checking.current = true;
      setNote({ text: "CHECKING...", bad: false });
      const here = at;
      try {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 5000);
        const r = await fetch(`/api/dive?look=${encodeURIComponent(p.id)}&q=${encodeURIComponent(typed.trim().slice(0, 50))}`, { signal: ctrl.signal });
        window.clearTimeout(timer);
        const j = r.ok ? ((await r.json()) as { answer?: string | null }) : null;
        if (j?.answer) hit = { answer: j.answer, tier: 3, depth: TIERS[3].depth };
      } catch {}
      checking.current = false;
      if (lockedAt.current === here) return; // the clock ran out while checking
    }
    // THE REPLAY: an answer you already gave in today's real dive doesn't count again
    const usedBefore = (h: Hit | null) => !!h && replay && !!realAnswers[at] && norm(realAnswers[at] ?? "") === norm(h.answer);
    if (hit && usedBefore(hit)) {
      buzz("soft");
      setSugg([]);
      setNote({ text: `YOU ALREADY USED ${hit.answer.toUpperCase()} IN TODAY'S DIVE - PICK ANOTHER`, bad: true });
      beep(160, 110, 0.18, "square", 0.08);
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }
    if (hit) lock(hit);
    else {
      // didn't count: keep what was typed (so a typo is quick to fix) and offer the closest answers to tap
      buzz("soft");
      const close = (opts.spellHelp ? suggest(p, typed) : []).filter((h) => !usedBefore(h));
      setSugg(close);
      setNote({ text: close.length ? "NOT QUITE - DID YOU MEAN:" : `"${typed.trim().toUpperCase().slice(0, 24)}" ISN'T ON THE LIST - FIX IT OR TRY ANOTHER`, bad: true });
      beep(160, 110, 0.18, "square", 0.08);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  // ENTER starts the dive on the first screen
  useEffect(() => {
    if (screen !== "intro" || shop) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        begin(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, shop]);

  // ---------------- TODAY'S BOARD: put your name next to your depth
  const NAME_WHY: Record<string, string> = {
    "name too short": "NAME TOO SHORT",
    "pick another name": "PICK ANOTHER NAME",
    "name reserved": "THAT NAME IS RESERVED",
    "name taken": "THAT NAME BELONGS TO SOMEONE ELSE",
    "slow down": "WAIT A FEW SECONDS",
    "dive first": "DIVE FIRST",
    offline: "THE BOARD IS OFFLINE RIGHT NOW",
  };
  const saveName = async () => {
    const n = myName.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "").trim().slice(0, 12);
    if (n.length < 2) {
      setNameMsg("NAME TOO SHORT");
      return;
    }
    if (saving || !result) return;
    setSaving(true);
    setNameMsg("");
    try {
      let owner = "";
      try {
        owner = localStorage.getItem("pinkrun-owner") || "";
      } catch {}
      const r = await fetch("/api/dive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ act: "name", dive: result.dive, device: deviceId(), name: n, owner }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !Array.isArray(j.top)) {
        setNameMsg(NAME_WHY[j?.error] ?? "COULDN'T SAVE, TRY AGAIN");
      } else {
        setBoard((b) => ({ top: j.top, ghosts: b?.ghosts ?? [] }));
        setNamed({ name: j.name, rank: j.rank });
        setMyName(j.name);
        try {
          localStorage.setItem(NAME_KEY, j.name);
          localStorage.setItem(NAMED_KEY, JSON.stringify({ dive: result.dive, name: j.name, rank: j.rank }));
        } catch {}
        [660, 880].forEach((f, i) => beep(f, f, 0.1, "square", 0.08, i * 0.09));
      }
    } catch {
      setNameMsg("THE BOARD IS OFFLINE RIGHT NOW");
    }
    setSaving(false);
  };

  // ---------------- the ESC menu
  const openMenu = () => {
    if (screen === "play" && !reveal) pausedLeft.current = Math.max(0, (deadline.current - Date.now()) / 1000);
    else pausedLeft.current = -1;
    inputRef.current?.blur();
    setRow(0);
    setHelp(false);
    setConfirmQuit(false);
    setMenu(true);
    beep(400, 300, 0.08, "square", 0.06);
  };
  const closeMenu = () => {
    if (pausedLeft.current >= 0) {
      deadline.current = Date.now() + pausedLeft.current * 1000; // the clock carries on where it stopped
      setLeft(pausedLeft.current);
    }
    pausedLeft.current = -1;
    setMenu(false);
    beep(300, 400, 0.08, "square", 0.06);
    if (screen === "play" && !reveal) window.setTimeout(() => inputRef.current?.focus(), 30);
  };
  // quitting: a daily dive ends right there (the prompts you didn't get to count as 0 m, so it stays fair),
  // a practice dive just goes back to the start
  const quitDive = () => {
    setMenu(false);
    pausedLeft.current = -1;
    nextRef.current = null;
    setCanGo(false);
    setReveal(null);
    if (practice) {
      setScreen("intro");
      return;
    }
    const all = [...slots];
    while (all.length < PER_DAY) all.push({ answer: null, tier: -1, depth: 0 });
    setSlots(all);
    finish(all, false, dive);
  };
  type Row = { label: string; value?: string; act: () => void; side?: (d: number) => void };
  const rows: Row[] = [
    { label: "RESUME", act: closeMenu },
    { label: "SOUND", value: soundOn ? "ON" : "OFF", act: toggleSound, side: () => toggleSound() },
    {
      label: "VOLUME",
      value: `${"■".repeat(Math.round(level * 10))}${"□".repeat(10 - Math.round(level * 10))}`,
      act: () => setVolume(level >= 1 ? 0 : level + 0.1),
      side: (d) => setVolume(level + d * 0.1),
    },
    { label: "SPELL HELP", value: opts.spellHelp ? "ON" : "OFF", act: () => setOpt("spellHelp"), side: () => setOpt("spellHelp") },
    { label: "CLOCK BEEPS", value: opts.clockBeeps ? "ON" : "OFF", act: () => setOpt("clockBeeps"), side: () => setOpt("clockBeeps") },
    { label: "BIG TEXT", value: opts.bigText ? "ON" : "OFF", act: () => setOpt("bigText"), side: () => setOpt("bigText") },
    { label: "HOW TO PLAY", act: () => setHelp((h) => !h) },
    ...(screen === "play" ? [] : [
          {
            label: "SUB SHOP",
            act: () => {
              setMenu(false);
              setShop(true);
            },
          },
        ]),
  ];
  if (screen === "play")
    rows.push({
      label: practice ? "QUIT PRACTICE" : confirmQuit ? "SURE? ENDS TODAY'S DIVE" : "END DIVE",
      act: () => (practice || confirmQuit ? quitDive() : setConfirmQuit(true)),
    });
  rows.push({
    label: "← BACK TO GAMES",
    act: () => {
      try {
        sessionStorage.setItem("pinkmane-open-games", "1");
      } catch {}
      window.location.href = "/";
    },
  });
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const rowRef = useRef(row);
  rowRef.current = row;
  // ESC opens / closes it. While it's open it takes every key first (so typing doesn't carry on behind it):
  // UP / DOWN pick, ENTER / SPACE press, LEFT / RIGHT change a setting
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && shop) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setShop(false);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (menu) closeMenu();
        else openMenu();
        return;
      }
      if (!menu) return;
      e.stopImmediatePropagation();
      const list = rowsRef.current, r = Math.min(rowRef.current, list.length - 1);
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        setRow((r + 1) % list.length);
        setConfirmQuit(false);
        beep(600, 600, 0.03, "square", 0.04);
      } else if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        setRow((r - 1 + list.length) % list.length);
        setConfirmQuit(false);
        beep(600, 600, 0.03, "square", 0.04);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "a" || e.key === "d" || e.key === "A" || e.key === "D") {
        e.preventDefault();
        list[r].side?.(e.key === "ArrowLeft" || e.key === "a" || e.key === "A" ? -1 : 1);
        beep(700, 700, 0.03, "square", 0.04);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        list[r].act();
        beep(800, 800, 0.04, "square", 0.05);
      }
    };
    window.addEventListener("keydown", key, { capture: true });
    return () => window.removeEventListener("keydown", key, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu, shop, screen, reveal, practice, slots, dive, beep]);

  // ---------------- THE SUB SHOP
  const buySkin = (k: Skin) => {
    if (owned.includes(k.id)) {
      setSkinId(k.id);
      try {
        localStorage.setItem(SKIN_KEY, k.id);
      } catch {}
      beep(700, 900, 0.08, "square", 0.06);
      return;
    }
    if (leaves < k.price) {
      beep(160, 110, 0.15, "square", 0.06);
      return;
    }
    const left = leaves - k.price;
    const now = [...owned, k.id];
    setLeaves(left);
    setOwned(now);
    setSkinId(k.id);
    try {
      localStorage.setItem(LEAVES_KEY, String(left));
      localStorage.setItem(OWNED_KEY, JSON.stringify(now));
      localStorage.setItem(SKIN_KEY, k.id);
    } catch {}
    [523, 784, 1046].forEach((f, i) => beep(f, f, 0.1, "square", 0.08, i * 0.08));
  };

  // ---------------- SHARE TO INSTAGRAM: a story-sized picture (1080 x 1920) of the sea right now (your sub and the souls
  // around it) with your score on top. On a phone it opens the share menu (pick Instagram), on a computer it downloads.
  const storyPicture = async (): Promise<Blob | null> => {
    if (!result) return null;
    try {
      await document.fonts?.ready;
    } catch {}
    const cv = document.createElement("canvas");
    cv.width = 1080;
    cv.height = 1920;
    const g = cv.getContext("2d");
    if (!g) return null;
    g.imageSmoothingEnabled = false;
    g.fillStyle = INK;
    g.fillRect(0, 0, 1080, 1920);
    const sea = document.querySelector(".pd-sea") as HTMLCanvasElement | null;
    if (sea && sea.width) {
      // the sea around your sub: a tall slice of it, with your sub in the lower part of the picture (below the card)
      const sc = 1920 / sea.height; // the sea's full height fills the picture
      const cw = 1080 / sc; // how wide a slice that is
      const subX = Number(sea.dataset.subx) || sea.width / 2, subY = Number(sea.dataset.suby) || sea.height / 2;
      const srcX = Math.max(0, Math.min(sea.width - cw, subX - cw * 0.35));
      const dy = 1420 - subY * sc;
      g.drawImage(sea, srcX, 0, cw, sea.height, 0, dy, 1080, sea.height * sc);
      if (dy > 0) g.drawImage(sea, srcX, 0, cw, 1, 0, 0, 1080, dy + 1); // above it: the top of the sea, stretched
      if (dy < 0) g.drawImage(sea, srcX, sea.height - 1, cw, 1, 0, dy + sea.height * sc - 1, 1080, -dy + 2);
    }
    const fam = pixelFont;
    const text = (t: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign = "center") => {
      g.font = `${size}px ${fam}`;
      g.textAlign = align;
      g.fillStyle = "#000";
      g.fillText(t, x + size / 8, y + size / 8);
      g.fillStyle = col;
      g.fillText(t, x, y);
    };
    // the card
    g.fillStyle = "rgba(11, 6, 20, 0.84)";
    g.fillRect(90, 170, 900, 760);
    g.fillStyle = PINK;
    g.fillRect(90, 170, 900, 10);
    g.fillRect(90, 920, 900, 10);
    g.fillRect(90, 170, 10, 760);
    g.fillRect(980, 170, 10, 760);
    text("PINK DIVE", 540, 300, 84, PINK);
    text(replay ? `REPLAY OF DIVE #${result.dive}` : `DAILY DIVE #${result.dive}`, 540, 380, 30, "#9fe8ff");
    text(metres(result.total), 540, 540, 92, "#ffffff");
    const b = BANDS[bandOf(result.total)];
    text(b.name, 540, 630, 40, TIERS[bandOf(result.total)].color);
    // the 7 squares (how rare each answer was)
    result.slots.forEach((sl, i) => {
      g.fillStyle = sl.tier >= 0 ? TIERS[sl.tier].color : "#3a2a4a";
      g.fillRect(540 - 7 * 50 + i * 100 + 10, 690, 80, 80);
    });
    if (!practice && result.better !== null && result.players > 1) text(`DEEPER THAN ${result.better}% OF TODAY'S DIVERS`, 540, 850, 26, "#ffd84a");
    else text("HOW DEEP CAN YOU GO?", 540, 850, 28, "#ffd84a");
    text("pinkmane.site/games/pink-dive", 540, 1830, 34, "#ffe6f7");
    return await new Promise((res) => cv.toBlob((bl) => res(bl), "image/png"));
  };
  const shareStory = async () => {
    if (!result) return;
    setShareMsg("MAKING YOUR PICTURE...");
    const blob = await storyPicture();
    if (!blob) {
      setShareMsg("COULDN'T MAKE THE PICTURE");
      return;
    }
    const file = new File([blob], `pink-dive-${result.dive}.png`, { type: "image/png" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: "pinkmane.site/games/pink-dive" });
        setShareMsg("");
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        setShareMsg("");
        return;
      }
    }
    // no share menu here (a computer): download it instead
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    setShareMsg("SAVED! POST IT ON YOUR INSTAGRAM STORY");
  };

  const shareText = () => {
    if (!result) return "";
    const squares = result.slots.map((s) => ["⬛", "⬜", "🟦", "🟥", "🟪", "🟨"][s.tier + 1]).join("");
    return `PINK DIVE #${result.dive}\n${metres(result.total)} · ${BANDS[bandOf(result.total)].name}\n${squares}\npinkmane.site/games/pink-dive`;
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareText() });
      else await copy();
    } catch {}
  };

  const p = prompts[at];
  const band = result ? bandOf(result.total) : 0;
  // where the camera is: the depth so far while playing, your total on the results, the surface on the first screen
  const camDepth = screen === "intro" ? 0 : screen === "play" ? total : (result?.total ?? 0);
  // the souls: each other diver's ghost floats where their dive ended
  const ghostSubs: GhostSub[] =
    ghostsOn && board && screen !== "intro" ? board.ghosts.map((g) => ({ name: g.name, depth: g.depths.slice(0, PER_DAY).reduce((a, b) => a + b, 0) })) : [];

  return (
    <div className={`pd-root ${opts.bigText ? "pd-bigtext" : ""}`} style={{ fontFamily: pixelFont }}>
      <Sea depth={camDepth} font={pixelFont} ghosts={ghostSubs} skin={skinOf(skinId)} />

      <Link
        href="/"
        className="pd-back"
        onClick={() => {
          try {
            sessionStorage.setItem("pinkmane-open-games", "1");
          } catch {}
        }}
      >
        ← GAMES
      </Link>
      <button className="pd-sound" onClick={() => (menu ? closeMenu() : openMenu())} aria-label="Menu and settings">
        {menu ? "✕ CLOSE" : "☰ MENU · ESC"}
      </button>

      {menu && (
        <div className="pd-menu-wrap" onClick={(e) => e.target === e.currentTarget && closeMenu()}>
          <div className="pd-panel pd-menu" role="dialog" aria-label="Menu">
            <h2 className="pd-menu-title">{screen === "play" ? "PAUSED" : "MENU"}</h2>
            {screen === "play" && pausedLeft.current >= 0 && <div className="pd-menu-sub">the clock is stopped · 0:{String(Math.ceil(pausedLeft.current)).padStart(2, "0")} left</div>}
            <div className="pd-menu-list">
              {rows.map((r, i) => (
                <button
                  key={r.label}
                  className={`pd-menu-row ${i === row ? "pd-menu-on" : ""} ${r.label.startsWith("SURE") ? "pd-menu-warn" : ""}`}
                  onMouseEnter={() => setRow(i)}
                  onClick={() => {
                    setRow(i);
                    r.act();
                  }}
                >
                  <span>{i === row ? "▶ " : ""}{r.label}</span>
                  {r.value !== undefined && <span className="pd-menu-val">{r.side ? "◀ " : ""}{r.value}{r.side ? " ▶" : ""}</span>}
                </button>
              ))}
            </div>
            {help && (
              <div className="pd-menu-help">
                7 prompts a day, the same for everyone. You get {SECONDS} seconds for each one.
                <br />
                Type an answer that fits: the RARER it is, the DEEPER your sub sinks.
                <br />
                Typo? It still counts if it&apos;s close, and SPELL HELP offers the nearest answers to tap.
                <br />
                Practice dives don&apos;t count. A new daily dive comes at midnight (UTC).
              </div>
            )}
            <div className="pd-menu-keys">↑ ↓ PICK · ← → CHANGE · ENTER PRESS · ESC BACK</div>
          </div>
        </div>
      )}

      {shop && (
        <div className="pd-menu-wrap" onClick={(e) => e.target === e.currentTarget && setShop(false)}>
          <div className="pd-panel pd-menu pd-shop" role="dialog" aria-label="Sub shop">
            <h2 className="pd-menu-title">SUB SHOP</h2>
            <div className="pd-menu-sub">
              <Leaf /> {leaves} WEED LEAVES · every daily dive pays 5, +1 for every 100 m
            </div>
            <div className="pd-shop-grid">
              {SKINS.map((k) => {
                const has = owned.includes(k.id), on = skinId === k.id, can = leaves >= k.price;
                return (
                  <button key={k.id} className={`pd-shop-item ${on ? "pd-shop-on" : ""}`} onClick={() => buySkin(k)} disabled={!has && !can}>
                    <SubPic skin={k} />
                    <span className="pd-shop-name">{k.name}</span>
                    <span className="pd-shop-price">
                      {on ? "ON" : has ? "USE" : (
                        <>
                          <Leaf size={10} /> {k.price}
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <button className="pd-btn" style={{ marginTop: 14 }} onClick={() => setShop(false)}>
              BACK
            </button>
          </div>
        </div>
      )}

      {screen === "intro" && (
        <div className="pd-panel pd-intro">
          <h1 className="pd-title">PINK DIVE</h1>
          <div className="pd-sub">THE DAILY DIVE · #{dive}</div>
          {testDive > 0 && <div className="pd-sub" style={{ color: "#ffd84a" }}>TEST MODE · DIVE #{testDive} · NOTHING IS SAVED</div>}
          <p className="pd-how">
            7 prompts · {SECONDS} seconds each
            <br />
            the rarer your answer, the deeper you sink
          </p>
          <button className="pd-btn pd-big" onClick={() => begin(false)}>
            DIVE
          </button>
          <div className="pd-shop-row">
            <span className="pd-leaves">
              <Leaf /> {leaves}
            </span>
            <button className="pd-btn pd-shop-btn" onClick={() => setShop(true)}>
              SUB SHOP
            </button>
          </div>
          <div className="pd-tiers">
            {TIERS.map((t) => (
              <span key={t.name} style={{ color: t.color }}>
                {t.name} {t.depth}
              </span>
            ))}
          </div>
        </div>
      )}

      {screen === "play" && p && !menu && (
        <div className="pd-panel pd-play">
          <div className="pd-top">
            <span>
              {at + 1}/{PER_DAY} · {p.cat}
              {replay ? " · REPLAY" : testDive && practice ? ` · TEST #${dive}` : practice ? " · PRACTICE" : ""}
            </span>
            <span className="pd-depth">{metres(total)}</span>
          </div>
          <div className={`pd-clock ${left <= 5 ? "pd-clock-low" : ""}`} aria-label={`${Math.ceil(left)} seconds left`}>
            0:{String(Math.ceil(left)).padStart(2, "0")}
          </div>
          <div className="pd-bar" aria-hidden="true">
            <div className={`pd-bar-in ${left <= 5 ? "pd-low" : ""}`} style={{ width: `${(left / SECONDS) * 100}%` }} />
          </div>
          <h2 className="pd-q">{p.q}</h2>
          {reveal ? (
            reveal === "none" ? (
              <div className="pd-reveal pd-miss" onClick={goOn}>
                NO ANSWER · 0 m
              </div>
            ) : (
              <div className="pd-reveal" onClick={goOn} style={{ borderColor: TIERS[reveal.tier].color, color: TIERS[reveal.tier].color }}>
                <div className="pd-reveal-a">{reveal.answer}</div>
                <div>
                  {TIERS[reveal.tier].name} · -{reveal.depth * 10} m
                </div>
              </div>
            )
          ) : (
            <form
              className="pd-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <input
                ref={inputRef}
                className="pd-input"
                value={typed}
                onChange={(e) => {
                  setTyped(e.target.value);
                  if (sugg.length || note) {
                    setSugg([]);
                    setNote(null);
                  }
                }}
                placeholder="TYPE YOUR ANSWER"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={40}
                enterKeyHint="go"
                aria-label={p.q}
              />
              <button className="pd-btn" type="submit">
                OK
              </button>
            </form>
          )}
          <div className={`pd-note ${note?.bad ? "pd-bad" : ""}`}>{note ? note.text : reveal ? "" : "ONE ANSWER COUNTS"}</div>
          {reveal && canGo && (
            <button className="pd-btn pd-next-btn" onClick={goOn}>
              {at + 1 >= PER_DAY ? "SEE HOW DEEP ▶" : "DIVE ON ▶"}
              <span className="pd-next-hint">or just start typing</span>
            </button>
          )}
          {!reveal && sugg.length > 0 && (
            <div className="pd-sugg">
              {sugg.map((h) => (
                <button key={h.answer} className="pd-btn pd-sugg-btn" onClick={() => lock(h)}>
                  {h.answer}?
                </button>
              ))}
            </div>
          )}
          {!reveal && (
            <button className="pd-skip" onClick={() => lock(null)}>
              SKIP
            </button>
          )}
        </div>
      )}

      {screen === "results" && result && (
        <div className="pd-panel pd-results">
          <div className="pd-top">
            <span>
              {replay
                ? `REPLAY OF DIVE #${result.dive} (DOESN'T COUNT)`
                : testDive && practice
                  ? `TEST OF DIVE #${result.dive} (DOESN'T COUNT)`
                  : practice
                    ? "PRACTICE DIVE"
                    : `DIVE #${result.dive} COMPLETE`}
            </span>
            <span>{practice || !result.live ? "" : `${result.players} DIVER${result.players === 1 ? "" : "S"} TODAY`}</span>
          </div>
          <div className="pd-score">
            {result.total}
            <span className="pd-score-m">{metres(result.total)}</span>
          </div>
          <div className="pd-band" style={{ color: TIERS[band].color }}>
            {BANDS[band].name}. <span>{BANDS[band].line}</span>
          </div>

          {!practice && result.live && result.players > 1 && (
            <>
              <Curve hist={result.hist} mine={result.total} />
              {result.better !== null && <div className="pd-better">DEEPER THAN {result.better}% OF TODAY&apos;S DIVERS</div>}
            </>
          )}
          {!practice && result.live && result.players <= 1 && <div className="pd-better">YOU&apos;RE THE FIRST DIVER TODAY</div>}
          {!practice && !result.live && <div className="pd-wait">{result.off ? "today's divers aren't reachable right now: these are your own depths" : "checking today's divers..."}</div>}

          {!practice && result.live && (
            <div className="pd-board">
              <div className="pd-board-title">TODAY&apos;S DEEPEST DIVERS</div>
              {board && board.top.length > 0 ? (
                board.top.map((e, i) => (
                  <div key={e.name} className={`pd-board-row ${named && e.name === named.name ? "pd-board-me" : ""}`}>
                    <span className="pd-board-rank" style={{ color: i < 3 ? ["#ffd84a", "#d8dce8", "#e0a060"][i] : undefined }}>
                      {i + 1}.
                    </span>
                    <span className="pd-board-name">{e.name}</span>
                    <span>{metres(e.score)}</span>
                  </div>
                ))
              ) : (
                <div className="pd-board-empty">{board ? "NO NAMES YET - BE THE FIRST" : "LOADING..."}</div>
              )}
              {named &&
                (() => {
                  // your place right now (from the board as it is now, not from when you put your name on it)
                  const i = board ? board.top.findIndex((e) => e.name === named.name) : -1;
                  const rank = i >= 0 ? i + 1 : board && board.top.length >= 10 ? null : named.rank;
                  return <div className="pd-board-you">{rank ? `YOU'RE #${rank} ON TODAY'S BOARD` : "YOU'RE ON TODAY'S BOARD (OUTSIDE THE TOP 10)"}</div>;
                })()}
              <form
                className="pd-form pd-board-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveName();
                }}
              >
                <input
                  className="pd-input"
                  value={myName}
                  onChange={(e) => {
                    setMyName(e.target.value.toUpperCase().slice(0, 12));
                    setNameMsg("");
                  }}
                  placeholder="YOUR NAME"
                  maxLength={12}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label="Your name for today's board"
                />
                <button className="pd-btn" type="submit" disabled={saving}>
                  {saving ? "..." : named ? "RENAME" : "ADD MY SCORE"}
                </button>
              </form>
              {nameMsg && <div className="pd-note pd-bad">{nameMsg}</div>}
              {board && board.ghosts.length > 0 && <div className="pd-board-ghosts">the little ghosts in the sea are today&apos;s other divers, on the line where their dive ended</div>}
            </div>
          )}

          <div className="pd-log">
            {result.slots.map((s, i) => (
              <div className="pd-row" key={i}>
                <span className="pd-row-q">{prompts[i]?.q ?? ""}</span>
                <span className="pd-row-a" style={{ color: s.tier >= 0 ? TIERS[s.tier].color : "rgba(255,255,255,0.4)" }}>
                  {s.answer ?? "-"}
                </span>
                <span className="pd-row-d">{s.depth}</span>
              </div>
            ))}
          </div>

          {replay && realTotal !== null && (
            <div className="pd-better">
              YOUR REAL DIVE TODAY: {realTotal} ({metres(realTotal)}) · {result.total > realTotal ? "DEEPER THIS TIME!" : result.total === realTotal ? "THE SAME DEPTH" : "NOT AS DEEP THIS TIME"}
            </div>
          )}

          {earned > 0 && (
            <div className="pd-earned">
              +{earned} <Leaf size={14} /> WEED LEAVES · YOU HAVE {leaves} ·{" "}
              <button className="pd-link" onClick={() => setShop(true)}>
                SUB SHOP
              </button>
            </div>
          )}

          <div className="pd-actions">
            {!testDive && (
              <button className="pd-btn pd-insta" onClick={() => void shareStory()}>
                SHARE TO INSTAGRAM
              </button>
            )}
            {!practice && (
              <>
                <button className="pd-btn pd-big" onClick={copy}>
                  {copied ? "COPIED!" : "COPY RESULT"}
                </button>
                <button className="pd-btn" onClick={share}>
                  SHARE
                </button>
              </>
            )}
            {realTotal !== null && !testDive && (
              <button className="pd-btn" onClick={() => !replayUsed && begin(false, true)} disabled={replayUsed} style={replayUsed ? { opacity: 0.45, cursor: "default" } : undefined}>
                {replayUsed ? "REPLAY USED" : "↻ REPLAY TODAY (1 LEFT)"}
              </button>
            )}
            <button className="pd-btn" onClick={() => begin(true)}>
              {practice && !replay ? "PRACTICE AGAIN" : "PRACTICE"}
            </button>
            <button className="pd-btn" onClick={() => setShop(true)}>
              SUB SHOP
            </button>
          </div>
          {shareMsg && <div className="pd-better" style={{ textAlign: "center" }}>{shareMsg}</div>}
          {realTotal !== null && !testDive ? (
            <div className="pd-tomorrow">
              <div className="pd-tomorrow-big">✓ TODAY&apos;S DIVE IS DONE</div>
              <div>COME BACK TOMORROW FOR 7 NEW QUESTIONS</div>
              <div className="pd-tomorrow-clock">NEW DIVE IN {nextIn}</div>
              {practice && <div className="pd-tomorrow-small">{replay ? "the replay" : "practice"} doesn&apos;t count, your real dive stays on the board</div>}
            </div>
          ) : (
            <div className="pd-next">{practice ? "practice doesn't count for today" : `next dive in ${nextIn}`}</div>
          )}
        </div>
      )}

      <style>{`
        .pd-root {
          position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; background: ${INK}; color: #fff;
          display: flex; justify-content: center; align-items: flex-start;
          -webkit-text-stroke: 0.4px currentColor;
        }
        .pd-sea { position: fixed; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; object-fit: cover; }
        .pd-back, .pd-sound {
          position: fixed; top: max(10px, env(safe-area-inset-top)); z-index: 5; font-family: inherit; font-size: 9px; color: #fff;
          padding: 7px 10px; background: rgba(11, 6, 20, 0.6); border: 2px solid rgba(255, 255, 255, 0.7); text-decoration: none;
          text-shadow: 1px 1px 0 #000; cursor: pointer;
        }
        .pd-back { left: max(12px, env(safe-area-inset-left)); }
        .pd-sound { right: max(12px, env(safe-area-inset-right)); font-size: 7px; }
        .pd-panel {
          position: relative; z-index: 2; width: min(520px, 94vw); margin: 0 auto; text-align: center;
          padding: 18px 16px 16px; text-shadow: 1px 1px 0 #000;
        }
        .pd-intro { margin-top: 20vh; }
        .pd-play { margin-top: max(64px, 14vh); background: rgba(11, 6, 20, 0.78); border: 3px solid ${PINK}; box-shadow: 6px 6px 0 #000; }
        .pd-results { margin: 58px auto 40px; background: rgba(11, 6, 20, 0.82); border: 3px solid ${PINK}; box-shadow: 6px 6px 0 #000; }
        .pd-title { margin: 0; font-size: clamp(30px, 9vw, 56px); color: ${PINK}; text-shadow: 4px 4px 0 #12041c; letter-spacing: 2px; }
        .pd-sub { margin-top: 14px; font-size: 10px; color: #9fe8ff; }
        .pd-how { margin: 22px 0; font-size: 9px; line-height: 2.1; }
        .pd-tiers { margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 12px; font-size: 7px; }
        .pd-btn {
          font-family: inherit; font-size: 10px; color: #fff; cursor: pointer; padding: 10px 14px;
          background: #2a1438; border: 2px solid #fff; box-shadow: 3px 3px 0 #000; text-shadow: 1px 1px 0 #000;
        }
        .pd-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
        .pd-big { background: #d63cc8; font-size: 13px; padding: 13px 26px; }
        .pd-top { display: flex; justify-content: space-between; gap: 10px; font-size: 8px; color: #9fe8ff; }
        .pd-depth { color: #fff; }
        .pd-clock { margin-top: 10px; font-size: 22px; color: #fff; text-shadow: 2px 2px 0 #000; letter-spacing: 2px; }
        .pd-clock-low { color: #ff4a6a; animation: pdTick 1s steps(2) infinite; }
        @keyframes pdTick { 50% { transform: scale(1.12); } }
        .pd-bar { height: 8px; margin: 8px 0 16px; background: #2a1438; border: 2px solid #fff; }
        .pd-bar-in { height: 100%; background: #56c8ff; transition: width 0.1s linear; }
        .pd-low { background: #ff4a6a; }
        .pd-q { margin: 0 0 16px; font-size: clamp(12px, 3.6vw, 17px); line-height: 1.6; color: #fff; }
        .pd-form { display: flex; gap: 8px; }
        .pd-input {
          flex: 1; min-width: 0; font-family: inherit; font-size: 16px; color: #12041c; background: #ffe6f7;
          border: 3px solid #fff; padding: 10px; text-transform: uppercase; outline: none; -webkit-text-stroke: 0;
        }
        .pd-input:focus { border-color: ${PINK}; }
        .pd-input::placeholder { color: rgba(18, 4, 28, 0.35); font-size: 10px; }
        .pd-note { min-height: 28px; margin-top: 12px; font-size: 7px; line-height: 1.7; color: rgba(255, 255, 255, 0.7); }
        .pd-bad { color: #ff8ea0; animation: pdShake 0.25s; }
        @keyframes pdShake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .pd-sugg { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: -4px 0 8px; }
        .pd-sugg-btn { font-size: 9px; padding: 8px 10px; background: #3a1850; border-color: ${PINK}; }
        .pd-next-btn { margin-top: 2px; background: #d63cc8; animation: pdPop 0.25s ease-out; }
        .pd-next-hint { display: block; margin-top: 6px; font-size: 6px; color: rgba(255, 255, 255, 0.75); }
        .pd-reveal { cursor: pointer; }
        .pd-skip { font-family: inherit; font-size: 7px; color: rgba(255, 255, 255, 0.6); background: none; border: none; cursor: pointer; padding: 6px; text-decoration: underline; }
        .pd-reveal { border: 3px solid; padding: 12px 8px; font-size: 9px; line-height: 2; background: rgba(0, 0, 0, 0.35); animation: pdPop 0.25s ease-out; }
        .pd-reveal-a { font-size: 14px; color: #fff; }
        .pd-miss { border-color: rgba(255, 255, 255, 0.4); color: rgba(255, 255, 255, 0.6); }
        @keyframes pdPop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .pd-score { margin-top: 12px; font-size: clamp(40px, 13vw, 64px); line-height: 1; text-align: left; }
        .pd-score-m { margin-left: 12px; font-size: 10px; color: #56c8ff; }
        .pd-band { margin: 10px 0 12px; font-size: 9px; line-height: 1.8; text-align: left; }
        .pd-band span { color: rgba(255, 255, 255, 0.75); }
        .pd-curve { width: 100%; height: auto; display: block; font-family: inherit; }
        .pd-better { margin: 8px 0 4px; font-size: 8px; color: #9fe8ff; text-align: left; }
        .pd-wait { margin: 8px 0; font-size: 7px; color: rgba(255, 255, 255, 0.5); text-align: left; }
        .pd-log { margin: 14px 0; border-top: 1px dashed rgba(255, 255, 255, 0.3); }
        .pd-row { display: flex; gap: 8px; align-items: baseline; padding: 7px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.18); font-size: 7px; line-height: 1.6; text-align: left; }
        .pd-row-q { flex: 1.3; color: rgba(255, 255, 255, 0.6); }
        .pd-row-a { flex: 1; text-align: right; font-size: 8px; }
        .pd-row-d { width: 34px; text-align: right; color: #fff; }
        .pd-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .pd-actions .pd-big { font-size: 11px; padding: 11px 18px; }
        .pd-next { margin-top: 12px; font-size: 7px; color: rgba(255, 255, 255, 0.6); }
        .pd-shop-row { margin-top: 16px; display: flex; gap: 12px; justify-content: center; align-items: center; }
        .pd-leaves { font-size: 10px; color: #b4ff8c; }
        .pd-shop-btn { font-size: 9px; padding: 8px 12px; }
        .pd-earned { margin: 10px 0 2px; font-size: 8px; color: #b4ff8c; text-align: left; line-height: 2; }
        .pd-link { font-family: inherit; font-size: 8px; color: #ffd84a; background: none; border: none; text-decoration: underline; cursor: pointer; padding: 0; }
        .pd-insta { background: linear-gradient(45deg, #f9a43a, #e4405f 45%, #b02cc0); }
        .pd-shop { width: min(520px, 94vw); }
        .pd-shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px; margin-top: 14px; }
        .pd-shop-item {
          display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px; font-family: inherit; color: #fff;
          background: #2a1438; border: 2px solid rgba(255, 255, 255, 0.35); cursor: pointer; text-shadow: 1px 1px 0 #000;
        }
        .pd-shop-item:disabled { opacity: 0.45; cursor: default; }
        .pd-shop-on { border-color: #ffd84a; background: #4a1c5e; box-shadow: 3px 3px 0 #000; }
        .pd-shop-name { font-size: 8px; }
        .pd-shop-price { font-size: 8px; color: #b4ff8c; }
        .pd-tomorrow { margin-top: 14px; padding: 12px 10px; border: 2px dashed #ffd84a; font-size: 8px; line-height: 2; color: #fff; }
        .pd-tomorrow-big { font-size: 11px; color: #ffd84a; }
        .pd-tomorrow-clock { margin-top: 2px; font-size: 13px; color: #9fe8ff; letter-spacing: 1px; }
        .pd-tomorrow-small { font-size: 6px; color: rgba(255, 255, 255, 0.6); }
        .pd-board { margin: 14px 0 4px; padding: 10px; border: 2px solid rgba(255, 255, 255, 0.35); background: rgba(0, 0, 0, 0.25); text-align: left; }
        .pd-board-title { font-size: 9px; color: ${PINK}; margin-bottom: 8px; }
        .pd-board-row { display: flex; gap: 8px; font-size: 8px; padding: 4px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.15); }
        .pd-board-rank { width: 22px; color: rgba(255, 255, 255, 0.6); }
        .pd-board-name { flex: 1; }
        .pd-board-me { color: #ffd84a; }
        .pd-board-empty { font-size: 7px; color: rgba(255, 255, 255, 0.6); padding: 4px 0; }
        .pd-board-you { margin-top: 8px; font-size: 8px; color: #ffd84a; }
        .pd-board-form { margin-top: 10px; }
        .pd-board-form .pd-input { font-size: 13px; padding: 8px; }
        .pd-board-form .pd-btn { font-size: 8px; padding: 8px 10px; }
        .pd-board-ghosts { margin-top: 8px; font-size: 6px; color: rgba(255, 255, 255, 0.5); }
        .pd-menu-wrap { position: fixed; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; background: rgba(5, 2, 12, 0.55); overflow-y: auto; }
        .pd-menu { margin: max(56px, 10vh) auto 30px; background: rgba(11, 6, 20, 0.92); border: 3px solid ${PINK}; box-shadow: 6px 6px 0 #000; width: min(400px, 92vw); }
        .pd-menu-title { margin: 0 0 6px; font-size: 20px; color: ${PINK}; text-shadow: 3px 3px 0 #12041c; letter-spacing: 2px; }
        .pd-menu-sub { font-size: 7px; color: #9fe8ff; margin-bottom: 4px; }
        .pd-menu-list { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
        .pd-menu-row {
          display: flex; justify-content: space-between; align-items: center; gap: 10px; font-family: inherit; font-size: 9px; color: #fff;
          padding: 10px 12px; background: #2a1438; border: 2px solid rgba(255, 255, 255, 0.35); cursor: pointer; text-shadow: 1px 1px 0 #000; text-align: left;
        }
        .pd-menu-on { border-color: #fff; background: #4a1c5e; box-shadow: 3px 3px 0 #000; }
        .pd-menu-warn { background: #7a1430; border-color: #ff8ea0; }
        .pd-menu-val { color: #9fe8ff; white-space: nowrap; font-size: 8px; }
        .pd-menu-help { margin-top: 12px; padding: 10px; border: 2px dashed rgba(255, 255, 255, 0.35); font-size: 7px; line-height: 2; text-align: left; color: rgba(255, 255, 255, 0.85); }
        .pd-menu-keys { margin-top: 12px; font-size: 6px; color: rgba(255, 255, 255, 0.5); }
        .pd-bigtext .pd-panel { zoom: 1.25; }
        .pd-bigtext .pd-menu { width: min(400px, 74vw); }
        @media (hover: none) { .pd-menu-keys { display: none; } }
        @media (max-height: 520px) { .pd-intro { margin-top: 12vh; } .pd-play { margin-top: 52px; } }
        @media (prefers-reduced-motion: reduce) { .pd-bad, .pd-reveal, .pd-clock-low { animation: none; } }
      `}</style>
    </div>
  );
}
