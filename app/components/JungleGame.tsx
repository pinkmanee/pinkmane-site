"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";

// PINK JUNGLE: an endless 3-lane jungle runner. Pinkmane runs down an old mossy temple path
// and BEARMANPIG (half bear, half pig, half man) chases him.
//   ← → (or A / D, click wheel, swipe)  = change lane
//   ↑ / W / SPACE / OK (or swipe up)     = jump
//   ↓ / S (or swipe down)                = slide
// Hit something once = you stumble and BEARMANPIG catches up. Stumble again while he's close = he gets you.
// Every 1000 score the world changes: GREEN JUNGLE -> ORANGE JUNGLE -> BLUE GRASS (no trees, tall grass) -> RED VOLCANO -> BLACK CRYSTALS -> FROZEN LAND -> green again...
// The game is drawn wide (like PINKMANE VOID), so it fills the PINKMANE handheld screen.
// SPELLS lie on the path, run into one to pick it up:
//   MAGNET  = pulls in the gems from all 3 lanes        SHIELD = saves you from one hit
//   BOOST   = super fast, you smash through everything  2X     = every gem counts double
// The gems you collect are saved. On the start / game over screen, DOWN (S, swipe down) opens the SHOP:
//   upgrade the 4 spells (6 levels each) and buy / choose skins, all paid with gems.
//   In the shop: arrows (or swipes) move, SPACE / OK / tap buys or picks, the BACK row closes it.
// BOSS: at the start of every new world BEARMANPIG attacks. A lane blinks red, then he charges down it, 3 times
//   (the last time 2 lanes). Get out of the red lane! Beating him pushes him far back and gives bonus gems.
// MUSIC: when the site's music is playing, the gems pulse to it. Moves made right on the beat fill the GROOVE meter,
//   a full meter = a few seconds where every gem gives a bonus gem too.
// MISSIONS: 3 small goals at a time (LEFT on the start / game over screen shows them). Each one pays gems,
//   and finishing enough of them gives the RAINBOW skin, which can't be bought.
// FX VOLUME: the speaker in the top left corner turns the game sounds on / off (also M), the little slider under it
//   sets how loud they are (drag it, or press - and =). It's saved, like in PINKMANE VOID.
// Bonus gems (boss, groove, missions) go to your saved gems only, never into the score, so the Top 10 stays fair.

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= start / jump)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // true on phones / tablets: no thumb buttons, you swipe anywhere on the screen, and swipe hints show at the start
  touch?: boolean;
  // The page's beat clock (the same one PINKMANE VOID gets): kick jumps to 1 on every beat of the song and falls back to 0,
  // live = the music is really playing right now. Leave it out and the game simply doesn't react to the music.
  beatRef?: { current: { kick: number; live: boolean } };
};

// The name of the game on its start screen (the menu on the iPod has its own copy in page.tsx)
const GAME_TITLE = "PINK JUNGLE";
// Where the best score is saved in the browser
const BEST_KEY = "pinkmane-jungle-best";

// ---------- EASY TUNING (change these to make it easier / harder) ----------
const START_SPEED = 6.5; // how fast you run at the start (meters per second)
const MAX_EXTRA_SPEED = 9.5; // how much faster it can get
const SPEED_RAMP = 200; // meters it takes to get +1 speed (bigger = slower ramp = easier)
const SAFE_START = 45; // first meters with no obstacles at all
const CHASE_DECAY = 0.065; // how fast BEARMANPIG falls back after a stumble (bigger = easier)
const CHASE_DEADLY = 0.3; // stumble while he's closer than this = caught
const START_PIXELS = 4; // how chunky the picture is at the start (it sharpens to 1 in the first seconds)
const ZONE_SCORE = 1000; // every this many points the background changes to the next world
// ---------- SPELLS + SKIN ----------
const SPELL_EVERY = 110; // about how many meters between two spells on the path (smaller = more spells)
const MAGNET_SECONDS = 8; // how long the magnet lasts (before upgrades)
const DOUBLE_SECONDS = 10; // how long gems count double (before upgrades)
const BOOST_SECONDS = 4; // how long the boost lasts (before upgrades)
const BOOST_SPEED = 1.8; // how much faster you run during the boost
// ---------- SHOP: spell upgrades ----------
const SPELL_COSTS = [50, 120, 250, 400, 600, 900]; // gems for upgrade level 1 to 6 (the same for every spell). More numbers = more levels.
const MAGNET_UP = 3; // seconds the magnet gains per level
const DOUBLE_UP = 4; // seconds 2X gains per level
const BOOST_UP = 1.5; // seconds the boost gains per level
// (the shield blocks 1 hit, and 1 more per level)
// ---------- BOSS: BEARMANPIG attacks at the start of every new world ----------
const BOSS_CHARGES = 3; // how many times he charges
const BOSS_WARN = 1.0; // seconds the lane blinks red before he comes (a little shorter in every later world, never under 0.6)
const BOSS_GEMS = 30; // bonus gems for beating him (+10 for every world you've passed). Only half if he hit you.
// ---------- MUSIC ----------
const BEAT_WINDOW = 0.38; // a move counts as "on the beat" while the beat flash is stronger than this (smaller = easier, 0-1)
const GROOVE_MAX = 8; // on-beat moves needed to fill the GROOVE meter
const GROOVE_SECONDS = 8; // how long the bonus lasts once it's full
// ---------- MISSIONS ----------
const MISSION_KEY = "pinkmane-jungle-missions"; // where your missions are saved in the browser
const MISSION_SKIN_AT = 10; // how many missions you must finish to get the RAINBOW skin
// The missions, handed out in this order, 3 at a time (after the last one they start again from the top).
//   type: gemsRun = gems in ONE run, distRun = meters in ONE run, world = get to that world in ONE run (1 = orange, 2 = blue, 3 = red, 4 = black),
//         spells / jumps / slides / boss / beats = counted over all your runs.   n = how many.   reward = gems you get.
type MissionType = "gemsRun" | "distRun" | "world" | "spells" | "jumps" | "slides" | "boss" | "beats";
const MISSIONS: { type: MissionType; n: number; reward: number }[] = [
  { type: "gemsRun", n: 40, reward: 40 },
  { type: "distRun", n: 400, reward: 40 },
  { type: "spells", n: 3, reward: 50 },
  { type: "jumps", n: 10, reward: 50 },
  { type: "world", n: 1, reward: 60 },
  { type: "boss", n: 1, reward: 80 },
  { type: "slides", n: 8, reward: 60 },
  { type: "gemsRun", n: 100, reward: 80 },
  { type: "beats", n: 25, reward: 70 },
  { type: "distRun", n: 900, reward: 90 },
  { type: "world", n: 2, reward: 100 },
  { type: "spells", n: 10, reward: 90 },
  { type: "boss", n: 3, reward: 150 },
  { type: "jumps", n: 30, reward: 100 },
  { type: "slides", n: 25, reward: 100 },
  { type: "gemsRun", n: 180, reward: 130 },
  { type: "world", n: 3, reward: 150 },
  { type: "beats", n: 80, reward: 120 },
  { type: "distRun", n: 1500, reward: 150 },
  { type: "world", n: 4, reward: 200 },
];
// Where the saved gems and the shop things are kept in the browser
const BANK_KEY = "pinkmane-jungle-gems";
const SHOP_KEY = "pinkmane-jungle-shop";
const FX_KEY = "pinkmane-jungle-fx"; // "on" / "off": the game sounds
const FX_VOL_KEY = "pinkmane-jungle-fx-volume"; // 0..1, set with the slider under the speaker icon
const OLD_SKIN_KEY = "pinkmane-jungle-skin"; // from the first version (GOLD MANE only), still read so nobody loses it

// ---------- Screen + camera ----------
// wide picture, the same shape as the handheld screen (64 : 30)
const W = 320;
const H = 150;
const HOR = 46; // horizon line
const F = 196; // focal length (how "zoomed in" the 3D is)
const PZ = 3; // how far in front of the camera the player runs
const LANE = 0.8; // distance between lanes (world units)
const PATHW = 1.25; // half the width of the stone path
const FAR = 42; // how far you can see
const FH = H - HOR;

// ---------- Colours (green theme) ----------
const GREEN = "#7dff6a";
const GREEN_DARK = "#1d6b2a";
const PINK = "#ff5fd2";
const BRICKS: [number, number, number][] = [
  [78, 98, 72],
  [88, 110, 78],
  [68, 88, 64],
  [96, 120, 84],
];
const MORTAR: [number, number, number] = [34, 50, 32];
const EDGE: [number, number, number] = [52, 70, 48];
const EDGE_DARK: [number, number, number] = [40, 56, 38];

// ---------- The 6 worlds (the background changes every ZONE_SCORE points) ----------
// name      = the text that pops up when you get there
// fog       = the colour far away
// ground    = 4 colours for the ground next to the path
// sky       = 4 colour bands of the sky, top to bottom
// far       = the dark line of trees / hills at the horizon
// canopy    = the leaves hanging from the top of the screen (canopyAmt 0 = open sky with stars)
// leaves    = 4 colours for the tree leaves (or the tall grass), dark to light
// vine      = hanging vines + moss on the pillars (dark, light)
// side      = "trees", "grass" (tall grass instead of trees) or "crystals" (crystals instead of trees)
// crystals  = 1 = big glowing crystals at the horizon
// snow      = 1 = a snow mountain at the horizon, and snow falling
// stars     = 1 = stars and a moon in the sky
// volcano   = 1 = a volcano at the horizon, and the rocks on the path are flames instead
// moss      = the colour of the moss + vines on the obstacles (rocks, logs, branches): [bright, dark].
//             Leave it out and they stay green.
// plants    = true = the fallen trees (the log you jump and the branch you slide under) are long plants instead
// lava      = true = the log you jump is a pit full of lava, the branch you slide under is a giant rock
type RGB = [number, number, number];
type Theme = {
  name: string;
  title: string;
  fog: RGB;
  ground: RGB[];
  sky: RGB[];
  far: RGB;
  canopy: RGB;
  canopyAmt: number;
  leaves: string[];
  vine: string;
  vineLight: string;
  firefly: string;
  side: "trees" | "grass" | "crystals";
  stars: number;
  volcano: number;
  crystals: number;
  snow: number;
  moss?: [string, string];
  plants?: boolean;
  lava?: boolean;
};
const GREEN_MOSS: [string, string] = ["#3ee05a", "#2c8a33"];
const THEMES: Theme[] = [
  {
    name: "GREEN JUNGLE",
    title: "#7dff6a",
    fog: [12, 40, 22],
    ground: [
      [20, 62, 28],
      [26, 76, 34],
      [16, 52, 24],
      [34, 92, 40],
    ],
    sky: [
      [5, 20, 10],
      [8, 32, 15],
      [11, 42, 20],
      [12, 48, 24],
    ],
    far: [14, 53, 25],
    canopy: [4, 17, 10],
    canopyAmt: 1,
    leaves: ["#0f3a17", "#17521f", "#1f6b28", "#2c8a33"],
    vine: "#1f6b28",
    vineLight: "#2c8a33",
    firefly: "#d8ff6a",
    side: "trees",
    stars: 0,
    volcano: 0,
    crystals: 0,
    snow: 0,
  },
  {
    name: "ORANGE JUNGLE",
    title: "#ffa23a",
    fog: [52, 24, 8],
    ground: [
      [92, 44, 12],
      [112, 56, 16],
      [78, 36, 10],
      [138, 72, 20],
    ],
    sky: [
      [26, 10, 4],
      [42, 18, 6],
      [58, 26, 8],
      [72, 34, 10],
    ],
    far: [70, 30, 8],
    canopy: [22, 9, 3],
    canopyAmt: 1,
    leaves: ["#5a2408", "#8a3a0c", "#c2560f", "#f08a1c"],
    vine: "#a8480e",
    vineLight: "#e07a1a",
    firefly: "#ffd36a",
    side: "trees",
    stars: 0,
    volcano: 0,
    crystals: 0,
    snow: 0,
    moss: ["#ffa23a", "#e07a1a"],
  },
  {
    name: "BLUE GRASS",
    title: "#6ab4ff",
    fog: [8, 18, 46],
    ground: [
      [14, 34, 78],
      [18, 44, 98],
      [12, 28, 64],
      [26, 62, 128],
    ],
    sky: [
      [3, 8, 24],
      [6, 16, 38],
      [10, 24, 54],
      [12, 32, 70],
    ],
    far: [10, 26, 64],
    canopy: [3, 8, 24],
    canopyAmt: 0,
    leaves: ["#0f2a5a", "#17408a", "#1f5cc2", "#4a8cf0"],
    vine: "#1f5cc2",
    vineLight: "#4a8cf0",
    firefly: "#a8d8ff",
    side: "grass",
    stars: 1,
    volcano: 0,
    crystals: 0,
    snow: 0,
    moss: ["#6ab4ff", "#1f5cc2"],
    plants: true,
  },
  {
    name: "RED VOLCANO",
    title: "#ff5a3a",
    fog: [46, 10, 6],
    ground: [
      [88, 20, 12],
      [110, 28, 14],
      [70, 16, 10],
      [140, 44, 18],
    ],
    sky: [
      [20, 4, 4],
      [36, 8, 6],
      [54, 12, 8],
      [72, 18, 8],
    ],
    far: [50, 12, 8],
    canopy: [20, 4, 4],
    canopyAmt: 0,
    leaves: ["#2a0a08", "#4a100c", "#8a1c10", "#d0401a"],
    vine: "#8a1c10",
    vineLight: "#ff5a1a",
    firefly: "#ff7a2a",
    side: "trees",
    stars: 0,
    volcano: 1,
    crystals: 0,
    snow: 0,
    moss: ["#ff5a3a", "#c2241a"],
    lava: true,
  },
  {
    name: "BLACK CRYSTALS",
    title: "#b46aff",
    fog: [10, 6, 16],
    ground: [
      [14, 10, 20],
      [20, 14, 28],
      [10, 8, 16],
      [30, 18, 44],
    ],
    sky: [
      [2, 2, 4],
      [5, 3, 9],
      [8, 5, 14],
      [12, 7, 20],
    ],
    far: [16, 8, 28],
    canopy: [2, 2, 4],
    canopyAmt: 0,
    leaves: ["#2a0f4a", "#5a1fa0", "#9a4cf0", "#d8a8ff"],
    vine: "#5a1fa0",
    vineLight: "#9a4cf0",
    firefly: "#d8a8ff",
    side: "crystals",
    stars: 0.6,
    volcano: 0,
    crystals: 1,
    snow: 0,
    moss: ["#b46aff", "#6a2ac2"],
  },
  {
    name: "FROZEN LAND",
    title: "#bfe8ff",
    fog: [150, 182, 206],
    ground: [
      [190, 210, 226],
      [212, 229, 241],
      [170, 195, 216],
      [236, 246, 252],
    ],
    sky: [
      [10, 24, 48],
      [22, 48, 84],
      [44, 84, 128],
      [84, 130, 170],
    ],
    far: [112, 146, 178],
    canopy: [10, 24, 48],
    canopyAmt: 0,
    leaves: ["#17403e", "#24605a", "#cfe8f2", "#ffffff"],
    vine: "#9cc4e0",
    vineLight: "#e8f6ff",
    firefly: "#ffffff",
    side: "trees",
    stars: 0.4,
    volcano: 0,
    crystals: 0,
    snow: 1,
    moss: ["#ffffff", "#bfe0f2"],
  },
];

// ---------- Pixel sprites ----------
// Only the LEFT half is drawn here, the right half is mirrored automatically.
// Pinkmane seen from behind (pink spiky hair, black tee, grey pants)
const DUDE_HALF = [
  "....B.",
  "..B.BB",
  ".BBBBB",
  "ABBBBB",
  "ABBBBB",
  ".ABBBB",
  "..AFFF",
  ".AAAAA",
  "AAAAAA",
  "FAAADA",
  "FAAAAA",
  ".AAAAA",
  "..AKKK",
  "..AKKA",
  "..AKKA",
  "..AKKA",
  "..AKKA",
  "..AAAA",
];
const DUDE_COLORS: Record<string, string> = {
  A: "#111111",
  B: "#d63cc8",
  D: "#8a1f86",
  F: "#ffc800",
  K: "#787878",
};
const DUDE_LEGS = 13; // row where the legs start (they move when running)
// ---------- SHOP: skins ----------
// To add a skin: copy one block, give it a new id + name + price and change the colours.
//   B = hair, D = the dark bit on the tee, F = skin, K = pants (A is the black outline + tee, keep it)
//   fire: true = the spiky hair is taken off and moving flames are drawn there instead
//   mission: 10 = it can't be bought, you get it after finishing that many missions
//   rainbow: true = the hair keeps changing colour
const SKINS: { id: string; name: string; price: number; colors: Record<string, string>; fire?: boolean; mission?: number; rainbow?: boolean }[] = [
  { id: "pink", name: "PINKMANE", price: 0, colors: DUDE_COLORS },
  { id: "gold", name: "GOLD MANE", price: 250, colors: { A: "#111111", B: "#ffd24a", D: "#b8860b", F: "#ffc800", K: "#f2f2f2" } },
  { id: "ice", name: "ICE MANE", price: 400, colors: { A: "#111111", B: "#6ae0ff", D: "#2a9ad0", F: "#ffc800", K: "#e8f2ff" } },
  { id: "toxic", name: "TOXIC", price: 600, colors: { A: "#111111", B: "#7dff3a", D: "#2c8a33", F: "#ffc800", K: "#7a3cc8" } },
  { id: "fire", name: "FIRE MANE", price: 1000, fire: true, colors: { A: "#111111", B: "#ff7a1a", D: "#8a1f86", F: "#ffc800", K: "#787878" } },
  { id: "rainbow", name: "RAINBOW", price: 0, mission: MISSION_SKIN_AT, rainbow: true, colors: DUDE_COLORS },
];
// the hair colours the RAINBOW skin runs through
const RAINBOW_HAIR = ["#ff3b3b", "#ffa23a", "#ffd24a", "#3ee05a", "#6ae0ff", "#b46aff"];

// The spell pickups (9 x 9 pixels, drawn whole, not mirrored)
const SPELL_MAPS: Record<string, string[]> = {
  magnet: [".AAA.AAA.", ".AWA.AWA.", ".AWA.AWA.", ".ARA.ARA.", ".ARA.ARA.", ".ARAAARA.", ".ARRRRRA.", "..ARRRA..", "...AAA..."],
  shield: ["AAAAAAAAA", "ACCCCcccA", "ACCCCcccA", "ACCCCcccA", "ACCCCcccA", ".ACCCccA.", ".ACCCccA.", "..ACCcA..", "...AAA..."],
  boost: ["....AAAA.", "...AYYA..", "..AYYA...", ".AYYAAAA.", ".AYYYYYA.", ".AAAAYYA.", "...AYYA..", "..AYYA...", "..AAA...."],
  double: [".........", "..A...A..", ".AgA.AgA.", "AgGGAgGGA", "AGGGAGGGA", ".AGA.AGA.", "..A...A..", ".........", "........."],
};
const SPELL_COLORS: Record<string, string> = {
  A: "#111111",
  R: "#ff3b3b",
  W: "#f2f2f2",
  C: "#6ae0ff",
  c: "#2a9ad0",
  Y: "#ffd400",
  G: "#3ee05a",
  g: "#b6ff9e",
};
// the glow colour + the name that pops up for each spell
const SPELL_INFO: Record<string, { color: string; name: string }> = {
  magnet: { color: "#ff3b3b", name: "MAGNET!" },
  shield: { color: "#6ae0ff", name: "SHIELD!" },
  boost: { color: "#ffd400", name: "BOOST!" },
  double: { color: "#3ee05a", name: "2X GEMS!" },
};
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

// BEARMANPIG from behind: bear ears + fur, a dirty tank top and jeans (the man part), a curly pig tail
const BMP_HALF = [
  "..AA.....",
  ".ANNA....",
  ".ANNNAAAA",
  "..ANNNNNN",
  "..ANNNNNN",
  "..ANNMNNN",
  "...ANNNNN",
  ".AANNNNNN",
  "ANNNAWWWW",
  "ANNAWWWWW",
  "ANNAWWWWW",
  "ANNAWWwWW",
  "ANNAWWWWW",
  "CNNAJJJJJ",
  ".C.AJJJJJ",
  "...AJJJJA",
  "...AJJJJA",
  "...AjJJJA",
  "...AJJJJA",
  "...ANNNNA",
  "..ANNNNNA",
  "..AAAAAA.",
];
const BMP_COLORS: Record<string, string> = {
  A: "#111111",
  N: "#6b3d1f",
  M: "#8a5530",
  W: "#e6e2cc",
  w: "#b8b08a",
  J: "#3a5fa8",
  j: "#2b4680",
  C: "#f2f2f2",
};
const BMP_LEGS = 15;
// the curly pig tail (drawn on top, not mirrored)
const BMP_TAIL: [number, number][] = [
  [9, 12],
  [10, 12],
  [11, 11],
  [11, 10],
  [10, 10],
];

// BEARMANPIG's face (front), for the start and game over screens
const FACE_HALF = [
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
const FACE_COLORS: Record<string, string> = {
  A: "#111111",
  N: "#6b3d1f",
  P: "#ff8fb8",
  R: "#ff2a2a",
  W: "#f2f2f2",
};

// Builds a mirrored sprite. legShift: 0 = standing, 1 = left leg up, 2 = right leg up
function buildSprite(
  half: string[],
  colors: Record<string, string>,
  legStart: number,
  legShift: 0 | 1 | 2,
  extra?: { px: [number, number][]; color: string }
) {
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
      if (legShift === 1 && x < w / 2) yy -= 2;
      if (legShift === 2 && x >= w / 2) yy -= 2;
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
  if (extra) {
    g.fillStyle = extra.color;
    extra.px.forEach(([x, y]) => g.fillRect(x, y, 1, 1));
  }
  return cv;
}

// A small seeded random, so the jungle trees look the same every time
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// Number noise used for the stone bricks and the moss
function hash(a: number, b: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// A jungle tree (24 x 48 pixels). greens = 4 leaf colours (dark to light), vine = the hanging vines
function buildTree(seed: number, greens: string[], vine: string) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 24;
  cv.height = 48;
  const g = cv.getContext("2d")!;
  // trunk
  g.fillStyle = "#111";
  g.fillRect(9, 18, 6, 30);
  g.fillStyle = "#4a2e17";
  g.fillRect(10, 18, 4, 30);
  g.fillStyle = "#6a4423";
  for (let y = 20; y < 48; y += 4) g.fillRect(10 + ((y / 4) % 2), y, 2, 1);
  // leafy blobs
  for (let i = 0; i < 14; i++) {
    const cx = 4 + r() * 16;
    const cy = 3 + r() * 18;
    const rad = 3 + r() * 4;
    const col = greens[Math.floor(r() * greens.length)];
    for (let y = -rad; y <= rad; y++)
      for (let x = -rad; x <= rad; x++) {
        if (x * x + y * y > rad * rad) continue;
        const px = Math.round(cx + x);
        const py = Math.round(cy + y);
        if (px < 0 || px >= 24 || py < 0 || py >= 30) continue;
        g.fillStyle = y < -rad / 2 && col !== greens[3] ? greens[Math.min(3, greens.indexOf(col) + 1)] : col;
        g.fillRect(px, py, 1, 1);
      }
  }
  // hanging vines
  g.fillStyle = vine;
  for (let i = 0; i < 3; i++) {
    const x = 3 + Math.floor(r() * 18);
    const len = 6 + Math.floor(r() * 12);
    for (let y = 18; y < 18 + len; y++) g.fillRect(x + (y % 5 === 0 ? 1 : 0), y, 1, 1);
  }
  return cv;
}

// One crystal: a tall pointed shard. c = 4 colours (dark edge, shaded side, lit side, bright edge)
function shard(g: CanvasRenderingContext2D, cx: number, base: number, w: number, h: number, lean: number, c: string[]) {
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 at the ground .. 1 at the tip
    const hw = (w / 2) * (v < 0.7 ? 1 : (1 - v) / 0.3);
    const x = cx + lean * v;
    const l = Math.round(x - hw);
    const r = Math.round(x + hw);
    const m = Math.round(x - hw * 0.2);
    const yy = Math.round(base - y);
    if (r - l < 2) {
      g.fillStyle = c[3];
      g.fillRect(l, yy, 1, 1);
      continue;
    }
    g.fillStyle = c[2];
    g.fillRect(l, yy, m - l, 1);
    g.fillStyle = c[1];
    g.fillRect(m, yy, r - m, 1);
    g.fillStyle = c[0];
    g.fillRect(r - 1, yy, 1, 1);
    g.fillStyle = c[3];
    g.fillRect(l, yy, 1, 1);
  }
}

// A cluster of crystals (24 x 40 pixels), used instead of trees in the BLACK CRYSTALS world
function buildCrystal(seed: number, colors: string[]) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 24;
  cv.height = 40;
  const g = cv.getContext("2d")!;
  // small ones at the back first, the big one in the middle last
  for (let i = 0; i < 4; i++) shard(g, 4 + r() * 16, 39, 4 + r() * 3, 12 + r() * 14, (r() - 0.5) * 8, colors);
  shard(g, 10 + r() * 4, 39, 7 + r() * 2, 32 + r() * 7, (r() - 0.5) * 4, colors);
  return cv;
}

// A clump of tall grass (28 x 22 pixels), used instead of trees in the BLUE GRASS world
function buildGrass(seed: number, colors: string[]) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 28;
  cv.height = 22;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 26; i++) {
    const x = 2 + r() * 24;
    const h = 9 + r() * 13;
    const lean = (r() - 0.5) * 7;
    const base = Math.floor(r() * 3); // darker blades at the back, lighter at the front
    for (let y = 0; y < h; y++) {
      const v = y / h; // 0 at the ground .. 1 at the tip
      const px = Math.round(x + lean * v * v);
      g.fillStyle = colors[Math.min(3, base + (v > 0.7 ? 1 : 0))];
      g.fillRect(px, 21 - y, v < 0.55 ? 2 : 1, 1);
    }
  }
  return cv;
}

// An old temple pillar with moss (12 x 36 pixels)
function buildPillar(seed: number, moss: string, mossDark: string) {
  const r = seeded(seed);
  const cv = document.createElement("canvas");
  cv.width = 12;
  cv.height = 36;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#111";
  g.fillRect(0, 0, 12, 36);
  const stones = ["#5d6e57", "#6b7d63", "#53634e"];
  for (let y = 1; y < 35; y += 5) {
    const off = (y / 5) % 2 ? 0 : 3;
    for (let x = 1 - off; x < 11; x += 6) {
      g.fillStyle = stones[Math.floor(r() * 3)];
      g.fillRect(Math.max(1, x), y, Math.min(5, 11 - Math.max(1, x)), 4);
    }
  }
  // moss on top + dripping down
  g.fillStyle = moss;
  g.fillRect(0, 0, 12, 3);
  for (let x = 0; x < 12; x++) {
    const len = Math.floor(r() * 9);
    g.fillRect(x, 3, 1, len);
  }
  g.fillStyle = mossDark;
  for (let x = 0; x < 12; x += 2) g.fillRect(x, 3, 1, Math.floor(r() * 5));
  return cv;
}

type Obstacle = { at: number; kind: "rock" | "root" | "branch"; lanes: number[]; hit: boolean; passed?: boolean };
type Gem = { at: number; lane: number; taken: boolean };
type SpellKind = "magnet" | "shield" | "boost" | "double";
type Spell = { at: number; lane: number; kind: SpellKind; taken: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Popup = { x: number; y: number; text: string; life: number; color: string };
type Mode = "ready" | "running" | "caught" | "shop" | "missions";
function missionText(m: { type: MissionType; n: number }) {
  if (m.type === "gemsRun") return `GET ${m.n} GEMS IN ONE RUN`;
  if (m.type === "distRun") return `RUN ${m.n}M IN ONE RUN`;
  if (m.type === "world") return `REACH ${THEMES[m.n % THEMES.length].name}`;
  if (m.type === "spells") return `PICK UP ${m.n} SPELLS`;
  if (m.type === "jumps") return `JUMP OVER ${m.n} LOGS`;
  if (m.type === "slides") return `SLIDE UNDER ${m.n} BRANCHES`;
  if (m.type === "boss") return `BEAT BEARMANPIG ${m.n}X`;
  return `MOVE ON THE BEAT ${m.n}X`;
}
// the spell rows in the shop, top to bottom
const SPELL_ROWS: { kind: SpellKind; name: string }[] = [
  { kind: "magnet", name: "MAGNET" },
  { kind: "shield", name: "SHIELD" },
  { kind: "boost", name: "BOOST" },
  { kind: "double", name: "2X GEM" },
];

export default function JungleGame({ actionSignal, spinRef, fontFamily, muted, touch = false, beatRef }: Props) {
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const beatSrc = useRef(beatRef);
  beatSrc.current = beatRef;
  // a tap / click on the game picture, in game pixels (shop rows, pause menu, start screen)
  const tapRef = useRef<((x: number, y: number) => void) | null>(null);
  // the FX volume slider (top left): what the touch / mouse handlers need from the game loop
  const fxApi = useRef<{
    hit: (x: number, y: number) => "icon" | "slider" | null;
    setFromY: (y: number) => void;
    toggle: () => void;
    done: () => void;
  } | null>(null);
  const fxDrag = useRef(-1); // -1 = not dragging the slider, -2 = dragging with the mouse, otherwise the finger's id
  const boardRef = useRef<ScoreApi | null>(null); // the online Top 10 box (Scoreboard.tsx), board id "jungle"
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // what the input handlers ask the game loop to do
  const inputRef = useRef<((a: "left" | "right" | "jump" | "slide" | "go") => void) | null>(null);
  const lastSignal = useRef(actionSignal);

  // OK / Enter / Space from the page = start, or jump while running
  useEffect(() => {
    if (actionSignal === lastSignal.current) return;
    lastSignal.current = actionSignal;
    inputRef.current?.("go");
  }, [actionSignal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    // ---------- sprites ----------
    const makeFit = (colors: Record<string, string>, fire?: boolean) => {
      // fire skin: the 3 rows of hair spikes are removed (the flames are drawn there, moving)
      const half = fire ? DUDE_HALF.map((row, i) => (i < 3 ? row.replace(/B/g, ".") : row)) : DUDE_HALF;
      return {
        run: [buildSprite(half, colors, DUDE_LEGS, 1), buildSprite(half, colors, DUDE_LEGS, 2)],
        stand: buildSprite(half, colors, DUDE_LEGS, 0),
      };
    };
    const fits = SKINS.map((sk) => makeFit(sk.colors, sk.fire));
    // RAINBOW skin: one set of pictures per hair colour, shown one after the other
    const rainbowFits = RAINBOW_HAIR.map((c) => makeFit({ ...DUDE_COLORS, B: c }));
    const fitNow = (i: number) => (SKINS[i].rainbow ? rainbowFits[Math.floor(clock * 6) % rainbowFits.length] : fits[i]);
    // the beat of the song: 1 right on the beat, falling to 0. -1 = no music playing right now
    const beatKick = () => {
      const b = beatSrc.current?.current;
      return b && b.live ? b.kick : -1;
    };
    const spellImg: Record<string, HTMLCanvasElement> = {};
    for (const k of Object.keys(SPELL_MAPS)) spellImg[k] = buildMap(SPELL_MAPS[k], SPELL_COLORS);
    const tail = { px: BMP_TAIL, color: "#ff8fb8" };
    const bmp = [buildSprite(BMP_HALF, BMP_COLORS, BMP_LEGS, 1, tail), buildSprite(BMP_HALF, BMP_COLORS, BMP_LEGS, 2, tail)];
    const face = buildSprite(FACE_HALF, FACE_COLORS, 99, 0);
    // one set of trees (or tall grass) and pillars for each world
    const trees = THEMES.map((th) =>
      [7, 21, 99].map((seed) =>
        th.side === "grass" ? buildGrass(seed, th.leaves) : th.side === "crystals" ? buildCrystal(seed, th.leaves) : buildTree(seed, th.leaves, th.vineLight)
      )
    );
    const pillars = THEMES.map((th) => [buildPillar(3, th.vineLight, th.vine), buildPillar(11, th.vineLight, th.vine)]);

    // small canvas used for the "pixelated at the start" effect
    const pix = document.createElement("canvas");
    const pctx = pix.getContext("2d")!;

    const floor = ctx.createImageData(W, FH);
    const floor32 = new Uint32Array(floor.data.buffer);

    // ---------- sound ----------
    // FX volume (the game's own sounds, not your music): on / off and how loud, both saved
    let fxOn = true;
    let fxVol = 1;
    try {
      fxOn = localStorage.getItem(FX_KEY) !== "off";
      const v = localStorage.getItem(FX_VOL_KEY);
      if (v !== null && !Number.isNaN(Number(v))) fxVol = Math.max(0, Math.min(1, Number(v)));
    } catch {}
    const saveFx = () => {
      try {
        localStorage.setItem(FX_KEY, fxOn ? "on" : "off");
        localStorage.setItem(FX_VOL_KEY, String(fxVol));
      } catch {}
    };
    // (moving the slider up from 0 also turns the sounds back on)
    const setFxVolume = (v: number) => {
      fxVol = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
      if (fxVol > 0) fxOn = true;
      saveFx();
    };
    const toggleFx = () => {
      fxOn = !fxOn;
      if (fxOn && fxVol <= 0) fxVol = 0.5;
      saveFx();
    };

    let ac: AudioContext | null = null;
    const tone = (f1: number, f2: number, dur: number, type: OscillatorType, vol = 0.08, delay = 0) => {
      if (mutedRef.current || !fxOn || fxVol <= 0) return;
      try {
        if (!ac) ac = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
        if (ac.state === "suspended") ac.resume();
        const t0 = ac.currentTime + delay;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f1, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
        g.gain.setValueAtTime(vol * fxVol, t0);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        o.connect(g).connect(ac.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.02);
      } catch {}
    };
    const sfx = {
      gem: () => tone(990, 1480, 0.08, "square", 0.05),
      jump: () => tone(260, 620, 0.14, "square", 0.05),
      slide: () => tone(500, 160, 0.16, "triangle", 0.07),
      lane: () => tone(420, 380, 0.04, "square", 0.025),
      stumble: () => {
        tone(160, 60, 0.25, "sawtooth", 0.09);
        tone(420, 260, 0.12, "sawtooth", 0.06, 0.05); // oink
      },
      caught: () => {
        tone(480, 240, 0.16, "sawtooth", 0.09); // OINK
        tone(440, 220, 0.16, "sawtooth", 0.09, 0.2);
        tone(90, 45, 0.7, "sawtooth", 0.12, 0.1); // bear roar
      },
      start: () => {
        tone(330, 660, 0.1, "square", 0.05);
        tone(660, 990, 0.12, "square", 0.05, 0.1);
      },
      spell: () => {
        tone(660, 1320, 0.12, "square", 0.06);
        tone(1320, 1760, 0.1, "square", 0.05, 0.1);
      },
      smash: () => tone(220, 90, 0.12, "sawtooth", 0.07),
      shield: () => {
        tone(900, 300, 0.18, "triangle", 0.09);
        tone(1400, 700, 0.1, "square", 0.04, 0.03);
      },
      buy: () => {
        tone(520, 1040, 0.1, "square", 0.06);
        tone(780, 1560, 0.1, "square", 0.06, 0.1);
        tone(1040, 2080, 0.2, "square", 0.06, 0.2);
      },
      no: () => tone(200, 120, 0.18, "square", 0.06),
      warn: () => {
        tone(880, 880, 0.07, "square", 0.05);
        tone(880, 880, 0.07, "square", 0.05, 0.14);
      },
      charge: () => {
        tone(150, 55, 0.5, "sawtooth", 0.11);
        tone(460, 240, 0.14, "sawtooth", 0.07, 0.05); // OINK
      },
      roar: () => {
        tone(95, 45, 0.8, "sawtooth", 0.12);
        tone(480, 240, 0.16, "sawtooth", 0.08, 0.15);
      },
      beat: () => tone(1250, 1600, 0.05, "square", 0.035),
      zone: () => {
        tone(520, 780, 0.1, "square", 0.05);
        tone(780, 1040, 0.1, "square", 0.05, 0.1);
        tone(1040, 1560, 0.16, "square", 0.05, 0.2);
      },
    };

    // The FX slider: a speaker icon in the top left corner with a thin bar going down from it (top = loud, bottom = quiet)
    const FX_SLIDER = { x: 4, top: 18, bottom: 58 };
    const fxShown = () => !pause.on && (s.mode === "ready" || s.mode === "running" || s.mode === "caught"); // (the shop + missions have their X there)
    fxApi.current = {
      hit: (x, y) => {
        if (!fxShown()) return null;
        if (x < 16 && y < 14) return "icon";
        if (x < 16 && y >= FX_SLIDER.top - 5 && y <= FX_SLIDER.bottom + 5) return "slider";
        return null;
      },
      setFromY: (y) => setFxVolume((FX_SLIDER.bottom - y) / (FX_SLIDER.bottom - FX_SLIDER.top)),
      toggle: () => {
        toggleFx();
        tone(520, 780, 0.08, "square", 0.05);
      },
      done: () => tone(520, 780, 0.08, "square", 0.05), // a little test sound at the new volume
    };
    const drawFx = () => {
      // the speaker
      const x = 2;
      const y = 5;
      ctx.fillStyle = "#000";
      ctx.fillRect(x - 1, y - 1, 12, 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y + 2, 2, 3);
      ctx.fillRect(x + 2, y + 1, 1, 5);
      ctx.fillRect(x + 3, y, 1, 7);
      if (fxOn && fxVol > 0) {
        ctx.fillRect(x + 5, y + 2, 1, 3);
        ctx.fillRect(x + 7, y + 1, 1, 5);
      } else {
        ctx.fillStyle = PINK;
        for (let i = 0; i < 5; i++) {
          ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
          ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
        }
      }
      // the slider
      const { x: sx, top, bottom } = FX_SLIDER;
      const vol = fxOn ? fxVol : 0;
      const knobY = Math.round(bottom - vol * (bottom - top));
      ctx.globalAlpha = fxDrag.current !== -1 ? 1 : 0.75;
      ctx.fillStyle = "#111";
      ctx.fillRect(sx - 1, top - 1, 5, bottom - top + 2);
      ctx.fillStyle = "#6e6478";
      ctx.fillRect(sx, top, 3, bottom - top);
      ctx.fillStyle = PINK;
      ctx.fillRect(sx, knobY, 3, bottom - knobY);
      ctx.fillStyle = "#111";
      ctx.fillRect(sx - 3, knobY - 2, 9, 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx - 2, knobY - 1, 7, 3);
      ctx.globalAlpha = 1;
    };

    // ---------- best score ----------
    let best = 0;
    try {
      best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- saved gems + shop ----------
    let bank = 0; // all the gems you ever collected (minus what you spent)
    const lv: Record<SpellKind, number> = { magnet: 0, shield: 0, boost: 0, double: 0 }; // upgrade level of each spell (0-6)
    let owned: string[] = ["pink"]; // ids of the skins you have
    let skinIdx = 0; // which skin you're wearing (its place in SKINS)
    try {
      bank = Math.max(0, Math.floor(Number(localStorage.getItem(BANK_KEY)) || 0));
      const old = localStorage.getItem(OLD_SKIN_KEY);
      if (old === "on" || old === "off") {
        owned.push("gold");
        if (old === "on") skinIdx = 1;
      }
      const raw = localStorage.getItem(SHOP_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { lv?: Record<string, number>; owned?: string[]; on?: string };
        for (const r of SPELL_ROWS) {
          const n = Math.floor(Number(d.lv?.[r.kind]) || 0);
          lv[r.kind] = Math.max(0, Math.min(SPELL_COSTS.length, n));
        }
        if (Array.isArray(d.owned)) owned = SKINS.filter((sk) => (sk.price === 0 && !sk.mission) || d.owned!.includes(sk.id)).map((sk) => sk.id);
        const i = SKINS.findIndex((sk) => sk.id === d.on);
        if (i >= 0 && owned.includes(SKINS[i].id)) skinIdx = i;
      }
    } catch {}
    const saveShop = () => {
      try {
        localStorage.setItem(BANK_KEY, String(bank));
        localStorage.setItem(SHOP_KEY, JSON.stringify({ lv, owned, on: SKINS[skinIdx].id }));
      } catch {}
    };
    // how strong each spell is right now (with its upgrades)
    const magnetSecs = () => MAGNET_SECONDS + lv.magnet * MAGNET_UP;
    const doubleSecs = () => DOUBLE_SECONDS + lv.double * DOUBLE_UP;
    const boostSecs = () => BOOST_SECONDS + lv.boost * BOOST_UP;
    const shieldHits = () => 1 + lv.shield;
    // where the cursor is in the shop: col 0 = spells, col 1 = skins, row 4 = BACK
    const SHOP_BACK = SKINS.length; // the BACK row comes after the longest list (the skins)
    const shopLastRow = () => (shop.col === 0 ? SPELL_ROWS.length : SKINS.length) - 1;
    const shop = { col: 0, row: 0, from: "ready" as "ready" | "caught" };

    // ---------- missions ----------
    let mDone = 0; // how many missions you've finished
    let mNext = 3; // the next mission on the list to hand out
    // the 3 missions you have now: i = its place in MISSIONS, p = progress (for the ones counted over all runs),
    // wait = you got it in the middle of a run, so a "in one run" mission only starts counting from the next run
    let mActive: { i: number; p: number; wait?: boolean }[] = [
      { i: 0, p: 0 },
      { i: 1, p: 0 },
      { i: 2, p: 0 },
    ];
    let missionsFrom: "ready" | "caught" = "ready";
    try {
      const raw = localStorage.getItem(MISSION_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { done?: number; next?: number; active?: { i: number; p: number }[] };
        const ok =
          Array.isArray(d.active) &&
          d.active.length === 3 &&
          d.active.every((a) => Number.isInteger(a.i) && a.i >= 0 && a.i < MISSIONS.length && Number.isFinite(a.p));
        if (ok) {
          mActive = d.active!.map((a) => ({ i: a.i, p: Math.max(0, a.p) }));
          mDone = Math.max(0, Math.floor(Number(d.done) || 0));
          mNext = Math.max(3, Math.floor(Number(d.next) || 3));
        }
      }
    } catch {}
    const saveMissions = () => {
      try {
        localStorage.setItem(MISSION_KEY, JSON.stringify({ done: mDone, next: mNext, active: mActive.map((a) => ({ i: a.i, p: a.p })) }));
      } catch {}
    };
    // skins you get for finishing missions (they can't be bought)
    const unlockMissionSkins = () => {
      let got: string | null = null;
      for (const sk of SKINS)
        if (sk.mission && mDone >= sk.mission && !owned.includes(sk.id)) {
          owned.push(sk.id);
          got = sk.name;
        }
      if (got) saveShop();
      return got;
    };
    unlockMissionSkins();
    // how far a mission is right now
    const missionValue = (a: { i: number; p: number; wait?: boolean }) => {
      const m = MISSIONS[a.i];
      if (m.type === "gemsRun") return a.wait ? 0 : s.gems;
      if (m.type === "distRun") return a.wait ? 0 : Math.floor(s.dist);
      if (m.type === "world") return a.wait ? 0 : s.zone;
      return a.p;
    };
    // finished missions pay out, and the next one on the list takes their place
    const checkMissions = () => {
      for (let k = 0; k < mActive.length; k++) {
        const a = mActive[k];
        const m = MISSIONS[a.i];
        if (missionValue(a) < m.n) continue;
        bank += m.reward;
        mDone++;
        s.pops.push({ x: W / 2, y: 62 + k * 10, text: `MISSION DONE! +${m.reward}`, life: 2.4, color: "#ffd24a" });
        sfx.buy();
        // the next mission that you don't already have
        let ni = mNext % MISSIONS.length;
        for (let tries = 0; tries < MISSIONS.length && mActive.some((x) => x.i === ni); tries++) {
          mNext++;
          ni = mNext % MISSIONS.length;
        }
        mNext++;
        mActive[k] = { i: ni, p: 0, wait: true };
        const skin = unlockMissionSkins();
        if (skin) s.pops.push({ x: W / 2, y: 30, text: `NEW SKIN: ${skin}!`, life: 3, color: "#ffffff" });
        saveShop();
        saveMissions();
      }
    };
    // something happened that missions count (a spell picked up, a log jumped...)
    const missionEvent = (type: MissionType) => {
      let hit = false;
      for (const a of mActive)
        if (MISSIONS[a.i].type === type) {
          a.p++;
          hit = true;
        }
      if (hit) checkMissions();
    };

    // ---------- game state ----------
    // the pause menu (ESC). row 0 = RESUME, 1 = RESTART
    const pause = { on: false, row: 0 };
    let pauseClock = 0;

    let runId = 0; // goes up every run, so a late Top 10 box never opens in the middle of a new run
    const s = {
      mode: "ready" as Mode,
      runT: 0, // seconds this run has lasted (the scoreboard checks the score is possible for that time)
      t: 0, // time in this mode
      dist: 0,
      speedMul: 1,
      lane: 0,
      px: 0, // player x in world units
      jumpY: 0,
      vy: 0,
      slide: 0, // seconds of slide left
      chase: 0.7, // how close BEARMANPIG is (0 = far away, 1 = right behind you)
      chaseVis: 0.7,
      mx: 0, // BEARMANPIG x (follows you a bit late)
      invuln: 0,
      shake: 0,
      gems: 0,
      score: 0,
      nextAt: SAFE_START,
      obs: [] as Obstacle[],
      gemList: [] as Gem[],
      parts: [] as Particle[],
      pops: [] as Popup[],
      curve: 0,
      newBest: false,
      spells: [] as Spell[],
      nextSpell: 70, // where the next spell will be put
      magnet: 0, // seconds left of each spell
      double: 0,
      boost: 0,
      shield: 0, // how many hits the shield can still take
      bonus: 0, // bonus gems this run (boss, groove): they go to your saved gems, not into the score
      groove: 0, // the GROOVE meter (on-beat moves)
      grooveT: 0, // seconds since the last on-beat move
      fever: 0, // seconds of GROOVE bonus left
      beatUsed: false, // this beat already counted a move
      // THE BOSS. stage: off = no fight, wait = he's coming at the next world gate, intro, warn = lane blinks,
      // charge = he runs down the lane, rest = a short break between charges
      boss: {
        stage: "off" as "off" | "wait" | "intro" | "warn" | "charge" | "rest",
        at: 0, // where on the path the fight starts
        zone: 0, // which world change this fight belongs to
        t: 0, // seconds in this stage
        n: 0, // charges done
        hits: 0, // how many times he got you
        lanes: [] as number[], // the lane(s) he charges down
        z: 0, // where he is during a charge (distance from the camera)
        struck: false,
      },
      zone: 0, // how many times the world has changed in this run
      // where each world starts (distance) and which one it is. The new world comes towards you from the horizon.
      zones: [{ from: -1e9, theme: 0 }] as { from: number; theme: number }[],
    };

    const reset = () => {
      boardRef.current?.hide();
      runId++;
      s.mode = "running";
      s.t = 0;
      s.runT = 0;
      s.dist = 0;
      s.speedMul = 1;
      s.lane = 0;
      s.px = 0;
      s.jumpY = 0;
      s.vy = 0;
      s.slide = 0;
      s.chase = 0.7;
      s.mx = 0;
      s.invuln = 0;
      s.gems = 0;
      s.score = 0;
      s.nextAt = SAFE_START;
      s.obs = [];
      s.gemList = [];
      s.parts = [];
      s.pops = [];
      s.newBest = false;
      s.zone = 0;
      s.zones = [{ from: -1e9, theme: 0 }];
      s.spells = [];
      s.nextSpell = 70;
      s.magnet = 0;
      s.double = 0;
      s.boost = 0;
      s.shield = 0;
      s.bonus = 0;
      s.groove = 0;
      s.grooveT = 0;
      s.fever = 0;
      s.beatUsed = false;
      s.boss.stage = "off";
      s.boss.lanes = [];
      for (const a of mActive) a.wait = false; // "in one run" missions count from this run on
      // a little line of gems to start with
      for (let i = 0; i < 8; i++) s.gemList.push({ at: 14 + i * 1.6, lane: 0, taken: false });
      sfx.start();
    };

    const speed = () => (START_SPEED + Math.min(MAX_EXTRA_SPEED, s.dist / SPEED_RAMP)) * s.speedMul * (s.boost > 0 ? BOOST_SPEED : 1);
    const rndLane = () => Math.floor(Math.random() * 3) - 1;

    // Builds the path ahead. The farther you are, the more kinds of obstacles and the closer together.
    const generate = (limit: number) => {
      while (s.nextAt < limit) {
        const d = s.nextAt;
        const tier = d < 250 ? 1 : d < 550 ? 2 : d < 900 ? 3 : 4;
        const gap = Math.max(6.5, 15 - d / 110);
        const r = Math.random();
        let kind: Obstacle["kind"] = "rock";
        let lanes: number[] = [];
        if (tier === 1) kind = "rock";
        else if (tier === 2) kind = r < 0.65 ? "rock" : "root";
        else if (tier === 3) kind = r < 0.45 ? "rock" : r < 0.72 ? "root" : "branch";
        else kind = r < 0.5 ? "rock" : r < 0.75 ? "root" : "branch";
        if (kind === "rock") {
          // from tier 3 on, sometimes two lanes are blocked
          if (tier >= 3 && Math.random() < (tier === 4 ? 0.55 : 0.3)) {
            const free = rndLane();
            lanes = [-1, 0, 1].filter((l) => l !== free);
          } else lanes = [rndLane()];
        } else lanes = [-1, 0, 1];
        s.obs.push({ at: d, kind, lanes, hit: false });

        // a spell every now and then, a few steps after the obstacle
        if (d >= s.nextSpell) {
          const kinds: SpellKind[] = ["magnet", "shield", "boost", "double"];
          s.spells.push({ at: d + 3.2, lane: rndLane(), kind: kinds[Math.floor(Math.random() * kinds.length)], taken: false });
          s.nextSpell = d + SPELL_EVERY * (0.8 + Math.random() * 0.5);
        }

        // gems after the obstacle, in a lane that's free
        if (Math.random() < 0.7) {
          const free = [-1, 0, 1].filter((l) => !lanes.includes(l) || kind !== "rock");
          const lane = free[Math.floor(Math.random() * free.length)];
          const n = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) {
            const at = d + 2 + i * 1.2;
            if (at < d + gap * 0.85 - 1.5) s.gemList.push({ at, lane, taken: false });
          }
        }
        s.nextAt += gap * (0.85 + Math.random() * 0.4);
      }
    };

    const playerScreen = () => ({ x: W / 2 + (s.px * F) / PZ, y: HOR + F / PZ });

    const burst = (x: number, y: number, n: number, colors: string[]) => {
      for (let i = 0; i < n; i++)
        s.parts.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 90,
          vy: -Math.random() * 80 - 10,
          life: 0.4 + Math.random() * 0.4,
          color: colors[Math.floor(Math.random() * colors.length)],
        });
    };

    const stumble = (o: Obstacle) => {
      o.hit = true;
      if (s.invuln > 0) return;
      const p = playerScreen();
      if (o.kind === "rock" && THEMES[themeIndexAt(o.at)].volcano) burst(p.x, p.y - 10, 16, ["#ffd24a", "#ff7a1a", "#e0301a"]);
      else if (o.kind === "rock") burst(p.x, p.y - 10, 14, ["#6b7d63", "#53634e", mossAt(o.at)[1]]);
      else if (THEMES[themeIndexAt(o.at)].lava)
        burst(p.x, p.y - 10, 14, o.kind === "root" ? ["#ffd24a", "#ff7a1a", "#e0301a"] : ["#7a4a3c", "#5a3028", "#ff7a1a"]);
      else if (THEMES[themeIndexAt(o.at)].plants) burst(p.x, p.y - 10, 12, ["#17408a", "#4a8cf0", "#a8d8ff"]);
      else burst(p.x, p.y - 10, 12, ["#6a4423", "#4a2e17", mossAt(o.at)[1]]);
      // BOOST: you smash straight through
      if (s.boost > 0) {
        sfx.smash();
        return;
      }
      // SHIELD: it breaks instead of you stumbling
      if (s.shield > 0) {
        s.shield--;
        s.invuln = 1;
        s.shake = 0.2;
        sfx.shield();
        burst(p.x, p.y - 20, 14, ["#6ae0ff", "#2a9ad0", "#ffffff"]);
        s.pops.push({ x: p.x, y: p.y - 46, text: "SAVED!", life: 0.9, color: "#6ae0ff" });
        return;
      }
      if (s.chase > CHASE_DEADLY) {
        caught();
        return;
      }
      sfx.stumble();
      s.chase = Math.min(1, s.chase + 0.65);
      s.speedMul = 0.55;
      s.invuln = 1.1;
      s.shake = 0.3;
      s.pops.push({ x: p.x, y: p.y - 46, text: "OINK!", life: 0.9, color: PINK });
    };

    const caught = () => {
      sfx.caught();
      s.mode = "caught";
      s.t = 0;
      s.shake = 0.5;
      s.score = Math.floor(s.dist) + s.gems * 5;
      // the gems from this run (and the bonus ones) go into your saved gems
      bank += s.gems + s.bonus;
      saveShop();
      saveMissions();
      if (s.score > best) {
        best = s.score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
      }
      // ONLINE TOP 10: after the GOT YOU moment, the name box (good score) or the Top 10 pops up
      const myRun = runId;
      const score = s.score;
      const runT = s.runT;
      setTimeout(() => {
        if (runId === myRun && s.mode !== "running") boardRef.current?.gameOver(score, runT);
      }, 700);
    };

    // ---------- input ----------
    // The shop: up / down move, left / right switch between SPELLS and SKINS, go (SPACE / OK / tap) buys or picks
    const shopInput = (a: "left" | "right" | "jump" | "slide" | "go") => {
      if (a === "jump" && shop.row > 0) {
        shop.row = shop.row === SHOP_BACK ? shopLastRow() : shop.row - 1;
        sfx.lane();
      } else if (a === "slide" && shop.row < SHOP_BACK) {
        shop.row = shop.row >= shopLastRow() ? SHOP_BACK : shop.row + 1;
        sfx.lane();
      } else if ((a === "left" && shop.col !== 0) || (a === "right" && shop.col !== 1)) {
        shop.col = a === "left" ? 0 : 1;
        if (shop.row !== SHOP_BACK) shop.row = Math.min(shop.row, shopLastRow());
        sfx.lane();
      } else if (a === "go") {
        if (shop.row === SHOP_BACK) {
          // BACK: close the shop
          s.mode = shop.from;
          sfx.lane();
        } else if (shop.col === 0) {
          // upgrade a spell
          const kind = SPELL_ROWS[shop.row].kind;
          const cost = SPELL_COSTS[lv[kind]];
          if (cost === undefined || bank < cost) {
            sfx.no();
            return;
          }
          bank -= cost;
          lv[kind]++;
          sfx.buy();
          saveShop();
        } else {
          // buy a skin, or put on one you already have
          const sk = SKINS[shop.row];
          if (!sk) return;
          if (!owned.includes(sk.id)) {
            if (sk.mission || bank < sk.price) {
              // (a mission skin can't be bought, you earn it)
              sfx.no();
              return;
            }
            bank -= sk.price;
            owned.push(sk.id);
            sfx.buy();
          } else sfx.lane();
          skinIdx = shop.row;
          saveShop();
        }
      }
    };

    inputRef.current = (a) => {
      // PAUSED: up / down picks RESUME or RESTART, OK / SPACE / A / tap picks it
      if (pause.on) {
        if (a === "jump" || a === "slide" || a === "left" || a === "right") {
          pause.row = pause.row === 0 ? 1 : 0;
          sfx.lane();
        }
        if (a === "go") {
          pause.on = false;
          if (pause.row === 1) reset();
          else sfx.lane();
        }
        return;
      }
      if (s.mode === "shop") {
        shopInput(a);
        return;
      }
      if (s.mode === "missions") {
        // SPACE / OK / tap closes the missions
        if (a === "go") {
          s.mode = missionsFrom;
          sfx.lane();
        }
        return;
      }
      if (s.mode !== "running") {
        if (boardRef.current?.busy()) return; // the Top 10 / name box is open: close it first (OK)
        // start / restart (after game over wait a moment so you don't skip the screen by accident)
        if (a === "go" || a === "jump") {
          if (s.mode === "caught" && s.t < 0.9) return;
          reset();
        }
        // DOWN = open the shop
        if (a === "slide" && !(s.mode === "caught" && s.t < 0.9)) {
          shop.from = s.mode === "caught" ? "caught" : "ready";
          shop.col = 0;
          shop.row = 0;
          s.mode = "shop";
          sfx.lane();
        }
        // LEFT = show the missions
        if (a === "left" && !(s.mode === "caught" && s.t < 0.9)) {
          missionsFrom = s.mode === "caught" ? "caught" : "ready";
          s.mode = "missions";
          sfx.lane();
        }
        return;
      }
      if (a === "left" && s.lane > -1) {
        s.lane--;
        sfx.lane();
        onBeatMove();
      }
      if (a === "right" && s.lane < 1) {
        s.lane++;
        sfx.lane();
        onBeatMove();
      }
      if (a === "jump" || a === "go") {
        if (s.jumpY <= 0.001) {
          s.vy = 4.3;
          s.slide = 0;
          sfx.jump();
          onBeatMove();
        }
      }
      if (a === "slide") {
        if (s.jumpY > 0.001) s.vy = -9; // in the air: drop down fast
        s.slide = 0.65;
        sfx.slide();
        onBeatMove();
      }
    };

    // MUSIC: a move made right on the beat fills the GROOVE meter. A full meter = GROOVE_SECONDS of bonus gems.
    const onBeatMove = () => {
      const k = beatKick();
      if (k < BEAT_WINDOW || s.beatUsed) return; // (no music, off the beat, or this beat already counted)
      s.beatUsed = true;
      s.grooveT = 0;
      sfx.beat();
      missionEvent("beats");
      if (s.fever > 0) return;
      const p = playerScreen();
      s.groove++;
      if (s.groove >= GROOVE_MAX) {
        s.groove = 0;
        s.fever = GROOVE_SECONDS;
        sfx.zone();
        s.pops.push({ x: W / 2, y: 30, text: "GROOVE! BONUS GEMS", life: 1.8, color: "#ffd24a" });
      } else s.pops.push({ x: p.x, y: p.y - 48, text: "ON BEAT", life: 0.5, color: "#ffd24a" });
    };

    // BEARMANPIG ran into you during a boss charge (the same as hitting an obstacle)
    const bossHit = () => {
      if (s.invuln > 0 || s.boost > 0) return; // blinking or boosting: he can't touch you
      const p = playerScreen();
      burst(p.x, p.y - 14, 14, ["#6b3d1f", "#8a5530", "#ff8fb8"]);
      if (s.shield > 0) {
        s.shield--;
        s.invuln = 1;
        s.shake = 0.2;
        sfx.shield();
        s.pops.push({ x: p.x, y: p.y - 46, text: "SAVED!", life: 0.9, color: "#6ae0ff" });
        return;
      }
      if (s.chase > CHASE_DEADLY) {
        caught();
        return;
      }
      sfx.stumble();
      s.chase = Math.min(1, s.chase + 0.65);
      s.speedMul = 0.55;
      s.invuln = 1.1;
      s.shake = 0.35;
      s.pops.push({ x: p.x, y: p.y - 46, text: "OINK!", life: 0.9, color: PINK });
    };

    // THE BOSS FIGHT, step by step (called every frame while you run)
    const bossWarn = () => {
      const b = s.boss;
      b.stage = "warn";
      b.t = 0;
      b.lanes = [s.lane]; // he aims at the lane you're in
      if (b.n === BOSS_CHARGES - 1) {
        // the last charge takes two lanes: only one is safe
        const others = [-1, 0, 1].filter((l) => l !== s.lane);
        b.lanes.push(others[Math.floor(Math.random() * others.length)]);
      }
      sfx.warn();
    };
    const bossStep = (dt: number, myLane: number) => {
      const b = s.boss;
      if (b.stage === "off") return;
      b.t += dt;
      if (b.stage === "wait") {
        if (s.dist < b.at) return;
        b.stage = "intro";
        b.t = 0;
        b.n = 0;
        b.hits = 0;
        sfx.roar();
        s.pops.push({ x: W / 2, y: 58, text: "BEARMANPIG ATTACKS!", life: 1.6, color: "#ff3b5c" });
      } else if (b.stage === "intro") {
        if (b.t > 0.9) bossWarn();
      } else if (b.stage === "warn") {
        if (b.t > Math.max(0.6, BOSS_WARN - b.zone * 0.05)) {
          b.stage = "charge";
          b.t = 0;
          b.z = 0.9;
          b.struck = false;
          sfx.charge();
        }
      } else if (b.stage === "charge") {
        const before = b.z;
        b.z = 0.9 + Math.pow(b.t / 0.75, 1.6) * 40; // from right behind the camera to far ahead
        if (!b.struck && before < PZ + 0.4 && b.z >= PZ - 0.4 && b.lanes.includes(myLane)) {
          b.struck = true;
          b.hits++;
          bossHit();
        }
        if (b.t > 0.75) {
          b.stage = "rest";
          b.t = 0;
          b.n++;
        }
      } else if (b.stage === "rest" && b.t > 0.45) {
        if (b.n < BOSS_CHARGES) bossWarn();
        else {
          // beaten: he drops far back, you get bonus gems (half if he hit you), the path fills up again
          let reward = BOSS_GEMS + 10 * b.zone;
          if (b.hits > 0) reward = Math.floor(reward / 2);
          s.bonus += reward;
          s.chase = 0;
          b.stage = "off";
          b.lanes = [];
          s.nextAt = Math.max(s.nextAt, s.dist + FAR);
          sfx.zone();
          s.pops.push({ x: W / 2, y: 58, text: `${b.hits ? "BEARMANPIG BEATEN!" : "PERFECT DODGE!"} +${reward} GEMS`, life: 2.2, color: "#ffd24a" });
          missionEvent("boss");
        }
      }
    };

    // TAPS / CLICKS on the game picture (x, y in game pixels)
    const SHOP_Y0 = 30; // where the first shop row is
    const SHOP_DY = 12; // how far apart the shop rows are
    const SHOP_ROW_Y = (r: number) => SHOP_Y0 + r * SHOP_DY; // the same rows drawShopScreen uses
    tapRef.current = (x, y) => {
      if (pause.on) {
        // tap RESUME or RESTART
        const row = y >= 58 && y < 76 ? 0 : y >= 76 && y < 94 ? 1 : -1;
        if (row >= 0) {
          pause.row = row;
          inputRef.current?.("go");
        }
        return;
      }
      if (s.mode === "shop") {
        // close (X, top left)
        if (x < 30 && y < 16) {
          s.mode = shop.from;
          sfx.lane();
          return;
        }
        // BACK
        const by = SHOP_ROW_Y(SHOP_BACK);
        if (y >= by && y < by + 16 && Math.abs(x - W / 2) < 50) {
          shop.row = SHOP_BACK;
          shopInput("go");
          return;
        }
        // a spell (left) or skin (right) row: first tap picks it, tapping it again buys / puts it on
        const r = Math.floor((y - SHOP_ROW_Y(0) + 3) / SHOP_DY);
        const col = x < 171 ? 0 : 1;
        const last = (col === 0 ? SPELL_ROWS.length : SKINS.length) - 1;
        if (r < 0 || r > last || r >= SHOP_BACK) return;
        if (shop.col === col && shop.row === r) shopInput("go");
        else {
          shop.col = col;
          shop.row = r;
          sfx.lane();
        }
        return;
      }
      if (s.mode === "missions") {
        inputRef.current?.("go"); // a tap anywhere closes the missions
        return;
      }
      if (s.mode === "ready" || (s.mode === "caught" && s.t > 0.9)) {
        // the skin picture on the right = open the shop, your gems on the left = the missions, anywhere else = run
        if (x > W - 92 && y > 24 && y < 96) inputRef.current?.("slide");
        else if (x < 116 && y > 24 && y < 96) inputRef.current?.("left");
        else inputRef.current?.("go");
        return;
      }
      inputRef.current?.("go"); // running: jump
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return; // typing your name for the Top 10
      const k = e.key;
      // ESC (or the PAUSE button on phones) = pause / resume, only while running
      if (k === "Escape" || k === "p" || k === "P") {
        if (s.mode === "running") {
          pause.on = !pause.on;
          pause.row = 0;
          sfx.lane();
        }
        return;
      }
      // FX: M = sounds on / off, - and = make them quieter / louder
      if (k === "m" || k === "M") {
        fxApi.current?.toggle();
        return;
      }
      if (k === "-" || k === "_" || k === "=" || k === "+") {
        setFxVolume((fxOn ? fxVol : 0) + (k === "-" || k === "_" ? -0.1 : 0.1));
        tone(520, 780, 0.08, "square", 0.05);
        return;
      }
      if (k === "ArrowLeft" || k === "a" || k === "A") inputRef.current?.("left");
      else if (k === "ArrowRight" || k === "d" || k === "D") inputRef.current?.("right");
      else if (k === "ArrowUp" || k === "w" || k === "W") inputRef.current?.("jump");
      else if (k === "ArrowDown" || k === "s" || k === "S") inputRef.current?.("slide");
    };
    window.addEventListener("keydown", onKey);
    // switching apps / tabs pauses the run, so BEARMANPIG doesn't get you while you're away
    const onHidden = () => {
      if (document.hidden && s.mode === "running" && !pause.on) {
        pause.on = true;
        pause.row = 0;
      }
    };
    document.addEventListener("visibilitychange", onHidden);

    // ---------- drawing helpers ----------
    const off = (z: number) => (z <= PZ ? 0 : s.curve * (z - PZ) * (z - PZ) * 0.02);
    const proj = (wx: number, z: number) => {
      const sc = F / z;
      return { x: W / 2 + (wx + off(z)) * sc, y: HOR + sc, s: sc };
    };
    const fogAt = (z: number) => Math.min(1, Math.max(0, (z - 4) / (FAR - 4)));

    // ---------- worlds ----------
    // which world a spot on the path belongs to
    const themeIndexAt = (at: number) => {
      let t = s.zones[0].theme;
      for (const z of s.zones) if (z.from <= at) t = z.theme;
      return t;
    };
    // the moss colour of the obstacles in the world at that spot
    const mossAt = (at: number) => THEMES[themeIndexAt(at)].moss ?? GREEN_MOSS;
    const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const css = (c: RGB) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
    // the sky + fog colours right now (they blend slowly while the next world gets closer)
    const look = {
      fog: THEMES[0].fog,
      sky: THEMES[0].sky,
      far: THEMES[0].far,
      canopy: THEMES[0].canopy,
      canopyAmt: THEMES[0].canopyAmt,
      stars: THEMES[0].stars,
      volcano: THEMES[0].volcano,
      crystals: THEMES[0].crystals,
      snow: THEMES[0].snow,
      near: THEMES[0],
    };
    const updateLook = () => {
      const cur = THEMES[themeIndexAt(s.dist)];
      const last = s.zones[s.zones.length - 1];
      const next = THEMES[last.theme];
      const t = next === cur ? 0 : Math.min(1, Math.max(0, 1 - (last.from - s.dist) / FAR));
      look.fog = mix(cur.fog, next.fog, t);
      look.sky = cur.sky.map((c, i) => mix(c, next.sky[i], t));
      look.far = mix(cur.far, next.far, t);
      look.canopy = mix(cur.canopy, next.canopy, t);
      look.canopyAmt = cur.canopyAmt + (next.canopyAmt - cur.canopyAmt) * t;
      look.stars = cur.stars + (next.stars - cur.stars) * t;
      look.volcano = cur.volcano + (next.volcano - cur.volcano) * t;
      look.crystals = cur.crystals + (next.crystals - cur.crystals) * t;
      look.snow = cur.snow + (next.snow - cur.snow) * t;
      look.near = t < 0.5 ? cur : next;
    };

    const text = (str: string, x: number, y: number, color: string, size = 8, align: CanvasTextAlign = "center") => {
      ctx.font = `${size}px ${fontFamily}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      ctx.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
      ctx.fillStyle = color;
      ctx.fillText(str, Math.round(x), Math.round(y));
    };

    // a blocky rounded boulder
    const blob = (cx: number, bottom: number, w: number, h: number, moss: string) => {
      const rows = Math.max(1, Math.round(h));
      for (let i = 0; i < rows; i++) {
        const v = (i + 0.5) / rows; // 0 top .. 1 bottom
        const k = Math.sqrt(Math.max(0, 1 - Math.pow((v - 0.6) / 0.6, 2)));
        const hw = Math.max(1, Math.round((w / 2) * k));
        const y = Math.round(bottom - rows + i);
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(cx - hw - 1), y, hw * 2 + 2, 1);
        ctx.fillStyle = v < 0.2 ? moss : v < 0.4 ? "#b08d62" : v < 0.8 ? "#86684a" : "#5a4630";
        ctx.fillRect(Math.round(cx - hw), y, hw * 2, 1);
      }
    };

    // a fire burning on the path (RED VOLCANO: these take the place of the rocks). Jump over it like a rock.
    const flame = (cx: number, bottom: number, w: number, h: number, seed: number) => {
      const t = clock;
      const cols = Math.max(3, Math.round(w / 2));
      const cw = Math.max(1, Math.ceil(w / cols));
      const b = Math.round(bottom);
      for (let i = 0; i < cols; i++) {
        const mid = 1 - Math.abs(i - (cols - 1) / 2) / (cols / 2 + 0.5); // taller in the middle
        const flick = 0.8 + 0.14 * Math.sin(t * 13 + i * 2.1 + seed) + 0.1 * Math.sin(t * 7 + i * 4.3 + seed * 2);
        const fh = Math.max(2, Math.round(h * (0.4 + 0.75 * mid) * flick));
        const x = Math.round(cx - w / 2 + (i * w) / cols);
        const red = Math.round(fh * 0.4);
        const orange = Math.round(fh * 0.35);
        ctx.fillStyle = "#e0301a";
        ctx.fillRect(x, b - red, cw, red);
        ctx.fillStyle = "#ff7a1a";
        ctx.fillRect(x, b - red - orange, cw, orange);
        ctx.fillStyle = "#ffd24a";
        ctx.fillRect(x, b - fh, cw, fh - red - orange);
      }
      // the bright middle of the fire + glowing coals underneath
      const core = Math.max(1, Math.round(w * 0.3));
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(Math.round(cx - core / 2), b - Math.max(1, Math.round(h * 0.3)), core, Math.max(1, Math.round(h * 0.3)));
      ctx.fillStyle = "#3a0c08";
      ctx.fillRect(Math.round(cx - w / 2) - 1, b, Math.round(w) + 2, Math.max(1, Math.round(h * 0.08)));
      // sparks
      for (let i = 0; i < 3; i++) {
        const ph = (t * 1.3 + i * 0.37 + seed) % 1;
        ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff7a1a";
        ctx.fillRect(Math.round(cx + Math.sin(t * 4 + i * 2 + seed) * w * 0.3), Math.round(b - h - ph * h * 0.6), 1, 1);
      }
    };

    // a log lying across the path (y0 = bottom height, y1 = top height, in world units)
    const log = (z: number, y0: number, y1: number, moss: string) => {
      const a = proj(-PATHW - 0.1, z);
      const b = proj(PATHW + 0.1, z);
      const top = Math.round(a.y - y1 * a.s);
      const bot = Math.round(a.y - y0 * a.s);
      const h = Math.max(2, bot - top);
      const x0 = Math.round(a.x);
      const w = Math.round(b.x - a.x);
      ctx.fillStyle = "#111";
      ctx.fillRect(x0 - 1, top - 1, w + 2, h + 2);
      ctx.fillStyle = "#6a4423";
      ctx.fillRect(x0, top, w, h);
      ctx.fillStyle = "#8a5a2e";
      ctx.fillRect(x0, top, w, Math.max(1, Math.round(h * 0.3)));
      ctx.fillStyle = "#4a2e17";
      ctx.fillRect(x0, top + Math.round(h * 0.7), w, Math.max(1, Math.round(h * 0.3)));
      // knots + moss
      const step = Math.max(4, Math.round(a.s * 0.5));
      for (let x = x0 + step; x < x0 + w - 2; x += step) {
        ctx.fillStyle = "#4a2e17";
        ctx.fillRect(x, top + Math.round(h * 0.35), Math.max(1, Math.round(h * 0.25)), Math.max(1, Math.round(h * 0.25)));
        ctx.fillStyle = moss;
        ctx.fillRect(x + 2, top, Math.max(1, Math.round(step * 0.4)), Math.max(1, Math.round(h * 0.15)));
      }
      return { x0, w, top };
    };

    // a long blue plant lying across the path (BLUE GRASS: these take the place of the fallen trees).
    // Same size and place as the log, so you jump it / slide under it the same way.
    const plant = (z: number, y0: number, y1: number, _moss: string) => {
      const a = proj(-PATHW - 0.1, z);
      const b = proj(PATHW + 0.1, z);
      const top = Math.round(a.y - y1 * a.s);
      const bot = Math.round(a.y - y0 * a.s);
      const h = Math.max(2, bot - top);
      const x0 = Math.round(a.x);
      const w = Math.round(b.x - a.x);
      // the thick stem
      ctx.fillStyle = "#081a3a";
      ctx.fillRect(x0 - 1, top - 1, w + 2, h + 2);
      ctx.fillStyle = "#17408a";
      ctx.fillRect(x0, top, w, h);
      ctx.fillStyle = "#4a8cf0";
      ctx.fillRect(x0, top, w, Math.max(1, Math.round(h * 0.3)));
      ctx.fillStyle = "#0f2a5a";
      ctx.fillRect(x0, top + Math.round(h * 0.7), w, Math.max(1, Math.round(h * 0.3)));
      // leaves along it (pointing up and down in turn) and little glowing buds
      const step = Math.max(4, Math.round(a.s * 0.4));
      const leaf = Math.max(2, Math.round(a.s * 0.14));
      let n = 0;
      for (let x = x0 + Math.round(step / 2); x < x0 + w - 2; x += step, n++) {
        const up = n % 2 === 0;
        for (let k = 0; k < leaf; k++) {
          const lw = Math.max(1, Math.round((leaf - k) * 0.8));
          ctx.fillStyle = k < leaf / 2 ? "#1f5cc2" : "#6ab4ff";
          ctx.fillRect(x - Math.round(lw / 2), up ? top - 1 - k : top + h + k, lw, 1);
        }
        if (n % 3 === 1) {
          ctx.fillStyle = Math.sin(clock * 4 + x) > 0 ? "#ffffff" : "#a8d8ff";
          ctx.fillRect(x + Math.round(step / 2), top + Math.round(h * 0.4), Math.max(1, Math.round(h * 0.25)), Math.max(1, Math.round(h * 0.25)));
        }
      }
      return { x0, w, top };
    };

    // RED VOLCANO: a pit full of lava across the whole path (takes the place of the log on the ground). Jump over it.
    const lavaPit = (z: number) => {
      const y0 = Math.round(HOR + F / (z + 0.38)); // far edge
      const y1 = Math.round(HOR + F / Math.max(1.2, z - 0.38)); // near edge
      for (let y = y0; y <= y1; y++) {
        const zr = F / (y - HOR + 0.5);
        const a = proj(-PATHW, zr);
        const b = proj(PATHW, zr);
        const xl = Math.round(a.x);
        const w = Math.round(b.x - a.x);
        if (y === y0 || y === y1) {
          // the burnt edge of the pit
          ctx.fillStyle = "#1a0604";
          ctx.fillRect(xl - 1, y, w + 2, 1);
          continue;
        }
        if (y - y0 <= Math.max(1, Math.round((y1 - y0) * 0.2))) {
          // the far wall of the pit, glowing from below
          ctx.fillStyle = "#7a1408";
          ctx.fillRect(xl, y, w, 1);
          continue;
        }
        // the lava itself, slowly flowing
        for (let x = 0; x < w; x += 2) {
          const n = Math.sin(x * 0.35 + y * 0.9 + clock * 4) + Math.sin(x * 0.12 - clock * 2.3 + y);
          ctx.fillStyle = n > 0.9 ? "#ffd24a" : n > 0 ? "#ff7a1a" : "#e0301a";
          ctx.fillRect(xl + x, y, 2, 1);
        }
      }
      // sparks jumping out of it
      const p = proj(0, z);
      for (let i = 0; i < 4; i++) {
        const ph = (clock * 1.2 + i * 0.27) % 1;
        ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff7a1a";
        ctx.fillRect(Math.round(p.x + Math.sin(i * 2.4 + Math.floor(clock * 1.2 + i * 0.27) * 1.7) * PATHW * 0.8 * p.s), Math.round(p.y - ph * 0.45 * p.s), 1, 1);
      }
    };

    // RED VOLCANO: a giant rock lying on the two posts (takes the place of the branch up high). Slide under it.
    const giantRock = (z: number, seed: number) => {
      const a = proj(-PATHW - 0.25, z);
      const b = proj(PATHW + 0.25, z);
      const bot = Math.round(a.y - 0.62 * a.s);
      const top = Math.round(a.y - 1.5 * a.s);
      const rows = Math.max(2, bot - top);
      const w = b.x - a.x;
      for (let i = 0; i < rows; i++) {
        const v = i / rows; // 0 = top .. 1 = bottom
        // rounded top corners + a slightly bumpy outline
        const round = v < 0.45 ? 1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - v / 0.45, 2))) : 0;
        const inset = round * w * 0.22 + (Math.sin(i * 1.3 + seed) + 1) * 0.5;
        const xl = Math.round(a.x + inset);
        const ww = Math.max(2, Math.round(w - inset * 2));
        ctx.fillStyle = "#111";
        ctx.fillRect(xl - 1, top + i - (i === 0 ? 1 : 0), ww + 2, i === 0 ? 2 : 1);
        ctx.fillStyle = v < 0.18 ? "#7a4a3c" : v < 0.6 ? "#5a3028" : "#3a1c18";
        ctx.fillRect(xl, top + i, ww, 1);
      }
      ctx.fillStyle = "#111";
      ctx.fillRect(Math.round(a.x) - 1, bot, Math.round(w) + 2, 1);
      // glowing lava cracks running down it
      const cw = Math.max(1, Math.round(a.s * 0.03));
      for (let c = 0; c < 4; c++) {
        let cx = a.x + w * (0.15 + 0.22 * c + hash(c, Math.round(seed)) * 0.1);
        for (let i = Math.round(rows * (0.2 + hash(c, 7) * 0.2)); i < rows - 1; i++) {
          cx += (hash(i + c * 31, Math.round(seed)) - 0.5) * 2.2;
          ctx.fillStyle = Math.sin(clock * 5 + c + i * 0.3) > 0.3 ? "#ffd24a" : "#ff7a1a";
          ctx.fillRect(Math.round(cx), top + i, cw, 1);
        }
      }
    };

    const drawObstacle = (o: Obstacle, z: number) => {
      const p = proj(0, z);
      const [mossBright, moss] = mossAt(o.at);
      const bar = THEMES[themeIndexAt(o.at)].plants ? plant : log; // BLUE GRASS: long plants instead of fallen trees
      const lava = !!THEMES[themeIndexAt(o.at)].lava; // RED VOLCANO: lava pits + giant rocks instead of fallen trees
      if (o.kind === "rock") {
        const fire = THEMES[themeIndexAt(o.at)].volcano > 0; // RED VOLCANO: flames instead of rocks
        for (const l of o.lanes) {
          const q = proj(l * LANE, z);
          if (fire) flame(q.x, q.y + 1, 0.7 * q.s, 0.62 * q.s, o.at + l);
          else blob(q.x, q.y + 1, 0.7 * q.s, 0.52 * q.s, mossBright);
        }
      } else if (o.kind === "root") {
        if (lava) lavaPit(z);
        else bar(z, 0, 0.28, moss);
      } else {
        // a fallen branch up high, held by two posts. Slide under it!
        const a = proj(-PATHW - 0.1, z);
        const b = proj(PATHW + 0.1, z);
        const pw = Math.max(2, Math.round(0.14 * p.s));
        const top = Math.round(p.y - 1.05 * p.s);
        ctx.fillStyle = "#111";
        ctx.fillRect(Math.round(a.x) - pw - 1, top, pw + 2, Math.round(p.y) - top);
        ctx.fillRect(Math.round(b.x) - 1, top, pw + 2, Math.round(p.y) - top);
        ctx.fillStyle = "#5d6e57";
        ctx.fillRect(Math.round(a.x) - pw, top, pw, Math.round(p.y) - top);
        ctx.fillRect(Math.round(b.x), top, pw, Math.round(p.y) - top);
        if (lava) {
          giantRock(z, o.at);
          return;
        }
        const L = bar(z, 0.62, 0.92, moss);
        // vines hanging from it
        ctx.fillStyle = moss;
        const step = Math.max(3, Math.round(p.s * 0.35));
        for (let x = L.x0 + 2; x < L.x0 + L.w; x += step) {
          const len = Math.round(((hash(x, Math.round(o.at)) * 0.18) + 0.05) * p.s);
          ctx.fillRect(x, L.top, 1, Math.round(0.3 * p.s) + len);
        }
      }
    };

    const drawSpell = (sp: Spell, z: number, t: number) => {
      const q = proj(sp.lane * LANE, z);
      const size = Math.max(3, Math.round(0.5 * q.s));
      const cx = Math.round(q.x);
      const cy = Math.round(q.y - (0.42 + Math.sin(t * 4 + sp.at) * 0.07) * q.s);
      // a glowing frame behind it that blinks, so you can tell it apart from the gems
      const pad = Math.max(1, Math.round(size * 0.18));
      ctx.fillStyle = Math.floor(t * 6) % 2 ? SPELL_INFO[sp.kind].color : "#ffffff";
      ctx.fillRect(cx - Math.round(size / 2) - pad, cy - Math.round(size / 2) - pad, size + pad * 2, size + pad * 2);
      ctx.fillStyle = "#1a1030";
      ctx.fillRect(cx - Math.round(size / 2), cy - Math.round(size / 2), size, size);
      ctx.drawImage(spellImg[sp.kind], cx - Math.round(size / 2), cy - Math.round(size / 2), size, size);
    };

    const drawGem = (g: Gem, z: number, t: number) => {
      // MAGNET: the gems close to you fly over to your lane
      let gx = g.lane * LANE;
      if (s.magnet > 0 && s.mode === "running") gx += (s.px - gx) * Math.min(1, Math.max(0, 1 - (z - PZ) / 6));
      const q = proj(gx, z);
      // MUSIC: the gems swell on every beat
      const size = Math.max(1, Math.round(0.13 * q.s * (1 + Math.max(0, beatKick()) * 0.4)));
      const cy = Math.round(q.y - (0.32 + Math.sin(t * 5 + g.at) * 0.06) * q.s);
      const cx = Math.round(q.x);
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
      if (size >= 2) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(cx - 1, cy - Math.round(size / 2), 1, 1);
      }
    };

    const drawFloor = () => {
      const dist = s.dist;
      const FOG = look.fog;
      for (let y = 0; y < FH; y++) {
        const z = F / (y + 0.5);
        const fog = Math.pow(fogAt(z), 0.7);
        const cx = W / 2 + (off(z) * F) / z;
        const inv = z / F;
        const wz = z + dist - PZ;
        const brow = Math.floor(wz * 1.7);
        const bfr = wz * 1.7 - brow;
        const grow = Math.floor(wz * 1.1);
        const mort = Math.min(0.3, 0.1 + z * 0.004);
        const JUNGLE = THEMES[themeIndexAt(wz)].ground; // this row's world
        for (let x = 0; x < W; x++) {
          const wx = (x + 0.5 - cx) * inv;
          const ax = Math.abs(wx);
          let c: [number, number, number];
          if (ax < PATHW) {
            const u = (wx + PATHW) * 2 + (brow & 1) * 0.5;
            const col = Math.floor(u);
            if (bfr < mort || u - col < mort * 0.8) c = MORTAR;
            else c = BRICKS[Math.floor(hash(brow, col) * 4)];
          } else if (ax < PATHW + 0.2) {
            c = brow & 1 ? EDGE : EDGE_DARK;
          } else {
            c = JUNGLE[Math.floor(hash(grow, Math.floor(wx * 1.4)) * 4)];
            if (ax < PATHW + 0.45) c = [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6]; // shadow next to the path
          }
          const r = c[0] + (FOG[0] - c[0]) * fog;
          const gg = c[1] + (FOG[1] - c[1]) * fog;
          const b = c[2] + (FOG[2] - c[2]) * fog;
          floor32[y * W + x] = (255 << 24) | ((b | 0) << 16) | ((gg | 0) << 8) | (r | 0);
        }
      }
      ctx.putImageData(floor, 0, HOR);
    };

    const drawSky = (t: number) => {
      const bands = look.sky;
      const bh = Math.ceil(HOR / bands.length);
      bands.forEach((c, i) => {
        ctx.fillStyle = css(c);
        ctx.fillRect(0, i * bh, W, bh);
      });
      const shift = s.curve * 90;
      // open sky (BLUE GRASS): stars and a moon, fading in as the leaves above go away
      const open = look.stars;
      if (open > 0.02) {
        ctx.globalAlpha = open;
        for (let i = 0; i < 34; i++) {
          const sx = ((hash(i, 11) * W + shift * 0.2) % W + W) % W;
          const sy = 2 + hash(i, 12) * (HOR - 16);
          if (Math.sin(t * 2 + i * 2.3) < -0.75) continue; // twinkle
          ctx.fillStyle = hash(i, 13) > 0.7 ? "#ffffff" : "#9cc4ff";
          ctx.fillRect(Math.round(sx), Math.round(sy), 1, 1);
        }
        const mx = Math.round((((W * 0.78 + shift * 0.2) % W) + W) % W);
        ctx.fillStyle = "#e8f2ff";
        ctx.fillRect(mx - 3, 7, 6, 8);
        ctx.fillRect(mx - 4, 8, 8, 6);
        ctx.fillStyle = "#b8d0f0";
        ctx.fillRect(mx - 1, 9, 2, 2);
        ctx.fillRect(mx + 1, 12, 1, 1);
        ctx.globalAlpha = 1;
      }
      // RED VOLCANO: a volcano at the horizon, with a glowing top, lava running down and sparks flying out
      if (look.volcano > 0.02) {
        ctx.globalAlpha = look.volcano;
        const vx = Math.round(W * 0.3 - shift * 0.3);
        const vh = 38;
        const top = HOR - vh;
        // glow in the sky above it
        for (let r = 3; r >= 1; r--) {
          ctx.fillStyle = `rgba(255,${50 + (3 - r) * 40},20,${0.12 + 0.05 * Math.sin(t * 3)})`;
          ctx.fillRect(vx - r * 10, top - r * 4, r * 20, r * 5);
        }
        // the mountain
        for (let y = 0; y < vh; y++) {
          const hw = Math.round(7 + (y / vh) * 52 + Math.sin(y * 1.7) * 1.5);
          ctx.fillStyle = y < 2 ? "#ffb030" : y < 4 ? "#ff5a1a" : y % 5 === 0 ? "#3a0c08" : "#260705";
          ctx.fillRect(vx - hw, top + y, hw * 2, 1);
        }
        // lava running down (3 streams)
        const lavaCols = ["#ffd24a", "#ff7a1a", "#e0301a"];
        [
          [-4, 0.85],
          [1, 0.55],
          [5, 1],
        ].forEach(([off, len]) => {
          for (let y = 2; y < vh * len; y++) {
            const lx = vx + off + Math.round(Math.sin(y * 0.45 + off) * 2 + y * off * 0.14);
            ctx.fillStyle = lavaCols[(((Math.floor(t * 6) - y) % 3) + 3) % 3];
            ctx.fillRect(lx, top + y, 2, 1);
          }
        });
        // sparks thrown out of the top
        for (let i = 0; i < 9; i++) {
          const ph = (t * 0.6 + hash(i, 31)) % 1;
          const sx = vx + (hash(i, 32) - 0.5) * 46 * ph;
          const sy = top - ph * 30 + ph * ph * 18;
          ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff7a1a";
          ctx.fillRect(Math.round(sx), Math.round(sy), i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
        }
        ctx.globalAlpha = 1;
      }
      // BLACK CRYSTALS: big purple crystals at the horizon, with a soft glow and sparkles
      if (look.crystals > 0.02) {
        ctx.globalAlpha = look.crystals;
        ctx.fillStyle = `rgba(154,76,240,${0.12 + 0.06 * Math.sin(t * 2)})`;
        ctx.fillRect(0, HOR - 10, W, 10);
        const cc = ["#1a0a30", "#4a1a8a", "#8a3ce0", "#d8a8ff"];
        for (let i = 0; i < 11; i++) {
          const cx = (((hash(i, 41) * W * 1.3 - shift * 0.3) % W) + W) % W;
          const ch = 14 + hash(i, 42) * 28;
          const lean = (hash(i, 44) - 0.5) * 10;
          shard(ctx, cx, HOR - 1, 5 + hash(i, 43) * 8, ch, lean, cc);
          if (Math.sin(t * 3 + i * 1.9) > 0.75) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(Math.round(cx + lean * 0.6), Math.round(HOR - ch * 0.6), 1, 1);
          }
        }
        ctx.globalAlpha = 1;
      }
      // FROZEN LAND: a big snow mountain (and a smaller one) at the horizon
      if (look.snow > 0.02) {
        ctx.globalAlpha = look.snow;
        const peak = (px: number, vh: number, base: number) => {
          const top = HOR - vh;
          for (let y = 0; y < vh; y++) {
            const v = y / vh; // 0 = the top .. 1 = the foot
            const hw = Math.max(1, Math.round(v * base * (1 + 0.07 * Math.sin(y * 0.9))));
            const mid = Math.round(px + hw * 0.15 + Math.sin(y * 0.6) * 1.5); // where the light side ends
            const snowy = v < 0.4 + 0.07 * Math.sin(y * 2.1 + px); // the white cap, with a ragged edge
            ctx.fillStyle = snowy ? "#ffffff" : "#5a7490";
            ctx.fillRect(px - hw, top + y, mid - (px - hw), 1);
            ctx.fillStyle = snowy ? "#c4d8e8" : "#384c64";
            ctx.fillRect(mid, top + y, px + hw - mid, 1);
          }
        };
        const mx = Math.round(W * 0.68 - shift * 0.3);
        peak(mx - 62, 26, 46);
        peak(mx, 42, 68);
        ctx.globalAlpha = 1;
      }
      // far tree line
      ctx.fillStyle = css(look.far);
      for (let x = 0; x < W; x++) {
        const xx = x + shift * 0.5;
        const h = 10 + Math.sin(xx * 0.07) * 4 + Math.sin(xx * 0.19) * 2 + Math.sin(xx * 0.5) * 1;
        ctx.fillRect(x, Math.round(HOR - h), 1, Math.round(h));
      }
      // canopy hanging from the top + vines
      for (let x = 0; x < W; x++) {
        const xx = x + shift;
        const h = (7 + Math.sin(xx * 0.11) * 4 + Math.sin(xx * 0.31) * 2) * look.canopyAmt;
        if (h < 1) continue; // no leaves above in the open worlds
        ctx.fillStyle = css(look.canopy);
        ctx.fillRect(x, 0, 1, Math.round(h));
        const xi = Math.floor(xx);
        if (((xi % 13) + 13) % 13 === 0) {
          const len = Math.round((8 + Math.floor(hash(xi, 5) * 22)) * look.canopyAmt);
          ctx.fillStyle = look.near.vine;
          ctx.fillRect(x, Math.round(h), 1, len);
          ctx.fillStyle = look.near.vineLight;
          for (let y = Math.round(h) + 3; y < h + len; y += 4) ctx.fillRect(x + 1, y, 1, 1);
        }
      }
      // FROZEN LAND: snow falling over the whole picture
      if (look.snow > 0.02) {
        ctx.globalAlpha = look.snow;
        ctx.fillStyle = "#ffffff";
        for (let i = 0; i < 46; i++) {
          const fall = 18 + (i % 5) * 7;
          const sy = (hash(i, 52) * H + t * fall) % H;
          const sx = (((hash(i, 51) * W + Math.sin(t * 1.3 + i) * 5 + shift * 0.4 - t * 6) % W) + W) % W;
          const big = i % 4 === 0 ? 2 : 1;
          ctx.fillRect(Math.round(sx), Math.round(sy), big, big);
        }
        ctx.globalAlpha = 1;
      }
      // fireflies
      for (let i = 0; i < 12; i++) {
        const fx = ((hash(i, 1) * W + t * (6 + i) + shift) % W + W) % W;
        const fy = 10 + hash(i, 2) * (HOR - 4) + Math.sin(t * 2 + i) * 3;
        if (Math.sin(t * 3 + i * 1.7) > 0.2) {
          ctx.fillStyle = look.near.firefly;
          ctx.fillRect(Math.round(fx), Math.round(fy), 1, 1);
        }
      }
    };

    // trees + pillars along both sides, obstacles and gems, drawn far to near
    const drawWorld = (t: number) => {
      type Item = { z: number; draw: () => void };
      const items: Item[] = [];
      const SPACING = 2.5;
      const k0 = Math.floor((s.dist - PZ + 1.6) / SPACING);
      const k1 = Math.floor((s.dist - PZ + FAR) / SPACING);
      for (let k = k0; k <= k1; k++) {
        for (const side of [-1, 1]) {
          const h = hash(k, side + 7);
          const z = k * SPACING - s.dist + PZ;
          if (z < 1.6 || z > FAR) continue;
          // which world this spot is in: trees (green / orange) or tall grass (blue)
          const ti = themeIndexAt(k * SPACING);
          const grass = THEMES[ti].side === "grass";
          if (!grass && h < 0.15) continue; // a gap between the trees (the grass has no gaps)
          const isPillar = grass ? h < 0.1 : h < 0.38;
          const wx = side * (PATHW + (isPillar ? 0.45 : grass ? 0.6 : 0.9) + hash(k, side + 3) * 0.8);
          const add = (x: number, img: HTMLCanvasElement, w: number, tall: number) =>
            items.push({
              z,
              draw: () => {
                const q = proj(x, z);
                const ww = w * q.s;
                const hh = tall * q.s;
                ctx.globalAlpha = 1 - Math.pow(fogAt(z), 1.4);
                ctx.drawImage(img, Math.round(q.x - ww / 2), Math.round(q.y - hh), Math.round(ww), Math.round(hh));
                ctx.globalAlpha = 1;
              },
            });
          if (isPillar) add(wx, pillars[ti][k & 1], 0.8, 2.4);
          else if (grass) {
            // tall grass: a clump next to the path and another one behind it
            add(wx + side * 1.3, trees[ti][Math.abs(k + 1) % 3], 1.9, 1.5);
            add(wx, trees[ti][Math.abs(k) % 3], 1.8, 1.3);
          } else if (THEMES[ti].side === "crystals") add(wx, trees[ti][Math.abs(k) % 3], 1.6, 2.7);
          else add(wx, trees[ti][Math.abs(k) % 3], 1.8, 3.6);
        }
      }
      for (const o of s.obs) {
        const z = o.at - s.dist + PZ;
        if (z < 1.7 || z > FAR) continue;
        if (o.hit && o.kind === "rock") continue; // smashed
        items.push({
          z,
          draw: () => {
            ctx.globalAlpha = (1 - Math.pow(fogAt(z), 1.4)) * (o.hit ? 0.45 : 1);
            drawObstacle(o, z);
            ctx.globalAlpha = 1;
          },
        });
      }
      for (const g of s.gemList) {
        if (g.taken) continue;
        const z = g.at - s.dist + PZ;
        if (z < 1.7 || z > FAR * 0.75) continue;
        items.push({
          z,
          draw: () => {
            ctx.globalAlpha = 1 - fogAt(z);
            drawGem(g, z, t);
            ctx.globalAlpha = 1;
          },
        });
      }
      for (const sp of s.spells) {
        if (sp.taken) continue;
        const z = sp.at - s.dist + PZ;
        if (z < 1.7 || z > FAR * 0.75) continue;
        items.push({
          z,
          draw: () => {
            ctx.globalAlpha = 1 - fogAt(z);
            drawSpell(sp, z, t);
            ctx.globalAlpha = 1;
          },
        });
      }
      // BOSS: BEARMANPIG charging down his lane(s), from right behind you into the distance
      if (s.boss.stage === "charge") {
        const bz = s.boss.z;
        for (const l of s.boss.lanes)
          items.push({
            z: bz,
            draw: () => {
              const q = proj(l * LANE, bz);
              const ww = 0.83 * q.s;
              const hh = 1.02 * q.s;
              ctx.globalAlpha = 1 - Math.pow(fogAt(bz), 1.4);
              ctx.drawImage(bmp[Math.floor(t * 14) % 2], Math.round(q.x - ww / 2), Math.round(q.y - hh), Math.round(ww), Math.round(hh));
              ctx.globalAlpha = 1;
            },
          });
      }
      items.sort((a, b) => b.z - a.z);
      // everything farther than the player, then the player, then nearer things
      let i = 0;
      for (; i < items.length && items[i].z >= PZ; i++) items[i].draw();
      drawPlayer(t);
      for (; i < items.length; i++) items[i].draw();
    };

    // FIRE MANE: moving flames where the hair would be. x, y = the top left corner of the 24 x 36 character.
    const fireHair = (x: number, y: number, t: number) => {
      for (let i = 0; i < 9; i++) {
        const mid = 1 - Math.abs(i - 4) / 5; // taller in the middle
        const h = Math.round(4 + mid * 6 + Math.sin(t * 13 + i * 2.1) * 2 + Math.sin(t * 7 + i * 4.3) * 1.5);
        for (let k = 0; k < h; k++) {
          const v = k / h;
          ctx.fillStyle = v < 0.35 ? "#e0301a" : v < 0.7 ? "#ff7a1a" : "#ffd24a";
          ctx.fillRect(x + 3 + i * 2, y + 7 - k, 2, 1);
        }
      }
      // two little sparks floating up
      for (let i = 0; i < 2; i++) {
        const ph = (t * 1.4 + i * 0.5) % 1;
        ctx.fillStyle = "#ffd24a";
        ctx.fillRect(Math.round(x + 8 + i * 7 + Math.sin(t * 5 + i) * 2), Math.round(y - 4 - ph * 9), 1, 1);
      }
    };

    const drawPlayer = (t: number) => {
      const p = playerScreen();
      const sc = F / PZ;
      const lift = Math.round(s.jumpY * sc);
      // shadow
      const shw = Math.max(6, 12 - lift / 4);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(Math.round(p.x - shw), Math.round(p.y - 2), shw * 2, 3);
      if (s.invuln > 0 && Math.floor(t * 16) % 2 === 0) return; // blink after a stumble
      const fit = fitNow(skinIdx);
      const dude = fit.run;
      const dudeStand = fit.stand;
      const onFire = !!SKINS[skinIdx].fire;
      // BOOST: pink speed trail behind you
      if (s.boost > 0 && s.mode === "running") {
        for (let i = 1; i <= 3; i++) {
          ctx.fillStyle = i % 2 ? PINK : "#ffd400";
          ctx.fillRect(Math.round(p.x - 9 + i * 2), Math.round(p.y - lift + i * 5), 18 - i * 4, 3);
        }
      }
      const x = Math.round(p.x - 12);
      if (s.mode === "ready") {
        ctx.drawImage(dudeStand, x, Math.round(p.y - 36), 24, 36);
        if (onFire) fireHair(x, Math.round(p.y - 36), t);
      } else if (s.slide > 0 && s.jumpY <= 0.001) {
        // sliding: only the top half shows, low to the ground
        ctx.drawImage(dudeStand, 0, 0, 12, 12, x, Math.round(p.y - 24), 24, 24);
        if (onFire) fireHair(x, Math.round(p.y - 24), t);
      } else {
        const f = s.jumpY > 0.001 ? dudeStand : dude[Math.floor(s.dist * 2.4) % 2];
        ctx.drawImage(f, x, Math.round(p.y - 36 - lift), 24, 36);
        if (onFire) fireHair(x, Math.round(p.y - 36 - lift), t);
      }
      // SHIELD: a sparkling bubble around you
      if (s.shield > 0 && s.mode === "running") {
        for (let i = 0; i < 20; i++) {
          const a = (i / 20) * Math.PI * 2 + t * 2;
          ctx.fillStyle = i % 2 ? "#6ae0ff" : "#ffffff";
          ctx.fillRect(Math.round(p.x + Math.cos(a) * 17), Math.round(p.y - 18 - lift + Math.sin(a) * 23), 2, 2);
        }
      }
    };

    const drawMonster = (t: number) => {
      const vis = s.chaseVis;
      if (vis < 0.03) return;
      if (s.boss.stage !== "off" && s.boss.stage !== "wait") return; // boss fight: he's busy charging
      const top = H + 2 - vis * (H + 2 - 106) + Math.sin(t * 14) * 2;
      const x = W / 2 + (s.mx * F) / PZ - 27;
      const frame = bmp[Math.floor(t * 8) % 2];
      ctx.drawImage(frame, Math.round(x), Math.round(top), 54, 66);
    };

    const drawHud = () => {
      text(`${Math.floor(s.dist)}M`, 16, 4, GREEN, 8, "left"); // (to the right of the FX speaker)
      // gem icon + count
      const gx = W - 12;
      ctx.fillStyle = "#3ee05a";
      ctx.fillRect(gx + 2, 4, 3, 1);
      ctx.fillRect(gx + 1, 5, 5, 2);
      ctx.fillRect(gx + 2, 7, 3, 2);
      ctx.fillRect(gx + 3, 9, 1, 2);
      text(String(s.gems), gx - 2, 4, GREEN, 8, "right");
      // danger bar: how close BEARMANPIG is
      if (s.chase > 0.02) {
        const w = Math.round(40 * s.chase);
        ctx.fillStyle = "#000";
        ctx.fillRect(W / 2 - 21, 5, 42, 5);
        ctx.fillStyle = s.chase > CHASE_DEADLY ? "#ff3b5c" : PINK;
        ctx.fillRect(W / 2 - 20, 6, w, 3);
      }
    };

    // BOSS: the lane(s) he's about to charge down blink red, with a big ! at the bottom
    const drawBossWarn = () => {
      const b = s.boss;
      if (s.mode !== "running" || (b.stage !== "warn" && b.stage !== "charge")) return;
      const blink = Math.floor(clock * 10) % 2 === 0;
      const zs = [1.8, 3, 5, 8, 12, 18];
      for (const l of b.lanes) {
        ctx.fillStyle = `rgba(255,40,60,${b.stage === "charge" ? 0.5 : blink ? 0.45 : 0.18})`;
        ctx.beginPath();
        zs.forEach((z, i) => {
          const q = proj(l * LANE - LANE * 0.45, z);
          if (i === 0) ctx.moveTo(q.x, q.y);
          else ctx.lineTo(q.x, q.y);
        });
        for (let i = zs.length - 1; i >= 0; i--) {
          const q = proj(l * LANE + LANE * 0.45, zs[i]);
          ctx.lineTo(q.x, q.y);
        }
        ctx.closePath();
        ctx.fill();
        if (b.stage === "warn") text("!", proj(l * LANE, PZ).x, H - 24, blink ? "#ffffff" : "#ff3b5c", 16);
      }
    };

    // BOSS + MUSIC bits of the HUD
    const drawExtraHud = () => {
      const b = s.boss;
      if (b.stage !== "off" && b.stage !== "wait")
        text(`BEARMANPIG ${Math.min(b.n + 1, BOSS_CHARGES)}/${BOSS_CHARGES}`, W / 2, 14, "#ff3b5c");
      const k = beatKick();
      if (k < 0) return; // no music: no groove meter
      if (s.fever > 0) {
        text("GROOVE 2X", W - 6, 15, Math.floor(clock * 6) % 2 ? "#ffd24a" : "#ffffff", 8, "right");
        ctx.fillStyle = "#000";
        ctx.fillRect(W - 80, 25, 74, 4);
        ctx.fillStyle = "#ffd24a";
        ctx.fillRect(W - 79, 26, Math.round((72 * s.fever) / GROOVE_SECONDS), 2);
        return;
      }
      const gx0 = W - 6 - GROOVE_MAX * 5;
      for (let i = 0; i < GROOVE_MAX; i++) {
        ctx.fillStyle = i < s.groove ? "#ffd24a" : "#2a2a2a";
        ctx.fillRect(gx0 + i * 5, 16, 4, 4);
      }
      // a little dot that flashes on the beat (move when it's big)
      const d = 2 + Math.round(k * 4);
      ctx.fillStyle = k > BEAT_WINDOW ? "#ffffff" : "#8a8a8a";
      ctx.fillRect(gx0 - 9 - Math.floor(d / 2), 18 - Math.floor(d / 2), d, d);
    };

    // the spells that are on right now, bottom left, each with a bar that runs out
    const drawSpellHud = () => {
      let y = H - 12;
      const row = (label: string, frac: number, color: string) => {
        text(label, 4, y, color, 8, "left");
        ctx.fillStyle = "#000";
        ctx.fillRect(56, y + 1, 42, 5);
        ctx.fillStyle = color;
        ctx.fillRect(57, y + 2, Math.round(40 * Math.min(1, Math.max(0, frac))), 3);
        y -= 11;
      };
      if (s.shield > 0) row("SHIELD", s.shield / shieldHits(), SPELL_INFO.shield.color);
      if (s.double > 0) row("2X GEM", s.double / doubleSecs(), SPELL_INFO.double.color);
      if (s.magnet > 0) row("MAGNET", s.magnet / magnetSecs(), SPELL_INFO.magnet.color);
      if (s.boost > 0) row("BOOST", s.boost / boostSecs(), SPELL_INFO.boost.color);
    };

    // on the start + game over screens: your gems on the left, your skin + how to open the shop on the right
    const drawShop = () => {
      const lx = 48;
      text("YOUR GEMS", lx, 44, "#b6ffb0");
      text(String(bank), lx, 56, GREEN, 16);
      const rx = W - 48;
      text(touchRef.current ? "TAP: MISSIONS" : "LEFT: MISSIONS", 60, 84, "#ffffff");
      ctx.drawImage(fitNow(skinIdx).stand, rx - 12, 30, 24, 36);
      if (SKINS[skinIdx].fire) fireHair(rx - 12, 30, clock);
      text(SKINS[skinIdx].name, rx, 72, "#ffd24a");
      text(touchRef.current ? "TAP: SHOP" : "DOWN: SHOP", rx, 84, "#ffffff");
    };

    // THE SHOP: spells to upgrade on the left, skins on the right, BACK at the bottom
    const drawShopScreen = () => {
      ctx.fillStyle = "rgba(0,12,6,0.9)";
      ctx.fillRect(0, 0, W, H);
      text("SHOP", W / 2, 4, PINK);
      text(`GEMS ${bank}`, W - 6, 4, GREEN, 8, "right");
      text("SPELLS", 10, 18, "#9ad19a", 8, "left");
      text("SKINS", 178, 18, "#9ad19a", 8, "left");
      const rowY = SHOP_ROW_Y;
      const RED = "#ff7a7a";
      let info = "BACK TO THE GAME";

      SPELL_ROWS.forEach((r, i) => {
        const y = rowY(i);
        const on = shop.col === 0 && shop.row === i;
        if (on) {
          ctx.fillStyle = "#4a1447";
          ctx.fillRect(6, y - 2, 162, SHOP_DY);
        }
        const level = lv[r.kind];
        const cost = SPELL_COSTS[level];
        const color = SPELL_INFO[r.kind].color;
        text(r.name, 10, y, on ? "#ffffff" : color, 8, "left");
        // the little squares = the upgrade level
        for (let p = 0; p < SPELL_COSTS.length; p++) {
          ctx.fillStyle = "#000";
          ctx.fillRect(66 + p * 9, y, 8, 8);
          ctx.fillStyle = p < level ? color : "#3a3a3a";
          ctx.fillRect(67 + p * 9, y + 1, 6, 6);
        }
        if (cost === undefined) text("MAX", 164, y, "#9ad19a", 8, "right");
        else text(String(cost), 164, y, bank >= cost ? GREEN : RED, 8, "right");
        if (on) {
          const max = cost === undefined;
          if (r.kind === "magnet") info = max ? `LASTS ${magnetSecs()} SEC (MAX)` : `LASTS ${magnetSecs()} SEC, NEXT ${magnetSecs() + MAGNET_UP}`;
          else if (r.kind === "double") info = max ? `LASTS ${doubleSecs()} SEC (MAX)` : `LASTS ${doubleSecs()} SEC, NEXT ${doubleSecs() + DOUBLE_UP}`;
          else if (r.kind === "boost") info = max ? `LASTS ${boostSecs()} SEC (MAX)` : `LASTS ${boostSecs()} SEC, NEXT ${boostSecs() + BOOST_UP}`;
          else info = max ? `BLOCKS ${shieldHits()} HITS (MAX)` : `BLOCKS ${shieldHits()} HIT${shieldHits() > 1 ? "S" : ""}, NEXT ${shieldHits() + 1}`;
        }
      });

      SKINS.slice(0, SHOP_BACK).forEach((sk, i) => {
        const y = rowY(i);
        const on = shop.col === 1 && shop.row === i;
        if (on) {
          ctx.fillStyle = "#4a1447";
          ctx.fillRect(174, y - 2, 140, SHOP_DY);
        }
        const have = owned.includes(sk.id);
        text(sk.name, 178, y, on ? "#ffffff" : "#ffd24a", 8, "left");
        if (i === skinIdx) text("ON", 310, y, GREEN, 8, "right");
        else if (have) text("OWNED", 310, y, "#9ad19a", 8, "right");
        else if (sk.mission) text(`${Math.min(mDone, sk.mission)}/${sk.mission}`, 310, y, "#ffd24a", 8, "right"); // missions done / needed
        else text(String(sk.price), 310, y, bank >= sk.price ? GREEN : RED, 8, "right");
        if (on) {
          const k = touchRef.current ? "TAP AGAIN" : "SPACE";
          info =
            i === skinIdx
              ? "YOU'RE WEARING IT"
              : have
              ? `${k} = PUT IT ON`
              : sk.mission
              ? `FINISH ${sk.mission - mDone} MORE MISSIONS`
              : bank >= sk.price
              ? `${k} = BUY IT`
              : `YOU NEED ${sk.price - bank} MORE GEMS`;
        }
      });

      const backOn = shop.row === SHOP_BACK;
      if (backOn) {
        ctx.fillStyle = "#4a1447";
        ctx.fillRect(W / 2 - 40, rowY(SHOP_BACK) + 1, 80, 13);
      }
      text("BACK", W / 2, rowY(SHOP_BACK) + 4, backOn ? "#ffffff" : "#9ad19a");

      // what the picked row does, and the skin it would give you
      text(info, 10, 124, "#b6ffb0", 8, "left");
      const show = shop.col === 1 && shop.row < SHOP_BACK && SKINS[shop.row] ? shop.row : skinIdx;
      ctx.drawImage(fitNow(show).stand, W - 38, 110, 24, 36);
      if (SKINS[show].fire) fireHair(W - 38, 110, clock);
      text(touchRef.current ? "TAP = PICK   TAP AGAIN = BUY" : "ARROWS / CLICK = PICK   SPACE = BUY", W / 2 - 14, 140, "#6f9a6f");
      // close button (top left)
      ctx.fillStyle = "#4a1447";
      ctx.fillRect(4, 2, 22, 12);
      text("X", 15, 4, "#ffffff");
    };

    // THE MISSIONS: your 3 missions with a bar each, and how close the mission skin is
    const drawMissionsScreen = () => {
      ctx.fillStyle = "rgba(0,12,6,0.92)";
      ctx.fillRect(0, 0, W, H);
      text("MISSIONS", W / 2, 4, "#ffd24a");
      text(`GEMS ${bank}`, W - 6, 4, GREEN, 8, "right");
      mActive.forEach((a, k) => {
        const m = MISSIONS[a.i];
        const y = 22 + k * 27;
        const v = Math.max(0, Math.min(m.n, missionValue(a)));
        text(missionText(m), 12, y, "#ffffff", 8, "left");
        text(`+${m.reward}`, W - 12, y, GREEN, 8, "right");
        ctx.fillStyle = "#000";
        ctx.fillRect(12, y + 11, 222, 7);
        ctx.fillStyle = "#3a3a3a";
        ctx.fillRect(13, y + 12, 220, 5);
        ctx.fillStyle = "#ffd24a";
        ctx.fillRect(13, y + 12, Math.round((220 * v) / m.n), 5);
        text(`${v}/${m.n}`, W - 12, y + 10, "#b6ffb0", 8, "right");
      });
      // the skin you only get from missions
      const sk = SKINS.find((x) => x.mission);
      if (sk) {
        const i = SKINS.indexOf(sk);
        const have = owned.includes(sk.id);
        text(`MISSIONS DONE: ${mDone}`, 12, 108, "#b6ffb0", 8, "left");
        text(have ? `YOU HAVE THE ${sk.name} SKIN!` : `${sk.mission! - mDone} MORE = ${sk.name} SKIN`, 12, 120, "#ffd24a", 8, "left");
        ctx.drawImage(fitNow(i).stand, W - 38, 102, 24, 36);
      }
      text(touchRef.current ? "TAP = BACK" : "SPACE = BACK", W / 2 - 14, 140, "#6f9a6f");
      // close button (top left)
      ctx.fillStyle = "#4a1447";
      ctx.fillRect(4, 2, 22, 12);
      text("X", 15, 4, "#ffffff");
    };

    const drawFace = (cx: number, y: number, scale: number) => {
      ctx.drawImage(face, Math.round(cx - 8 * scale), Math.round(y), 16 * scale, 16 * scale);
    };

    const pixelate = (f: number) => {
      if (f <= 1) return;
      const w = Math.round(W / f);
      const h = Math.round(H / f);
      if (pix.width !== w) {
        pix.width = w;
        pix.height = h;
      }
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(canvas, 0, 0, W, H, 0, 0, w, h);
      ctx.drawImage(pix, 0, 0, w, h, 0, 0, W, H);
    };

    // ---------- the game loop ----------
    let raf = 0;
    let last = performance.now();
    let clock = 0;
    let spinAcc = 0;

    const step = (dt: number) => {
      clock += dt;
      s.t += dt;
      if (s.mode === "running") s.runT += dt;

      // click wheel: every 35 degrees = one lane
      spinAcc += spinRef.current;
      spinRef.current = 0;
      while (spinAcc > 35) {
        inputRef.current?.("right");
        spinAcc -= 35;
      }
      while (spinAcc < -35) {
        inputRef.current?.("left");
        spinAcc += 35;
      }

      s.curve += ((Math.sin(s.dist * 0.012) * 0.45 + Math.sin(s.dist * 0.031) * 0.15) - s.curve) * Math.min(1, dt * 2);

      if (s.mode === "running") {
        s.speedMul += (1 - s.speedMul) * Math.min(1, dt * 1.2);
        s.dist += speed() * dt;
        s.px += Math.sign(s.lane * LANE - s.px) * Math.min(Math.abs(s.lane * LANE - s.px), 9 * dt);
        // jump
        if (s.jumpY > 0 || s.vy > 0) {
          s.vy -= 12.5 * dt;
          s.jumpY += s.vy * dt;
          if (s.jumpY <= 0) {
            s.jumpY = 0;
            s.vy = 0;
          }
        }
        if (s.slide > 0) s.slide -= dt;
        if (s.invuln > 0) s.invuln -= dt;
        s.chase = Math.max(0, s.chase - CHASE_DECAY * dt);
        // spell timers
        if (s.magnet > 0) s.magnet -= dt;
        if (s.double > 0) s.double -= dt;
        if (s.boost > 0) {
          s.boost -= dt;
          s.chase = Math.max(0, s.chase - 0.5 * dt); // BEARMANPIG can't keep up
          if (s.boost <= 0) s.invuln = Math.max(s.invuln, 1.2); // a safe moment when the boost ends
        }

        // (no new obstacles while BEARMANPIG is coming or fighting: the fight happens on a clear path)
        if (s.boss.stage === "off") generate(s.dist + FAR + 5);
        // MUSIC: one move per beat counts, the meter slowly empties if you stop moving on the beat
        if (beatKick() < BEAT_WINDOW) s.beatUsed = false;
        if (s.fever > 0) s.fever -= dt;
        s.grooveT += dt;
        if (s.grooveT > 3 && s.groove > 0) {
          s.groove--;
          s.grooveT = 0;
        }

        // hits
        const myLane = Math.round(s.px / LANE);
        for (const o of s.obs) {
          if (o.hit) continue;
          const d = o.at - s.dist;
          if (d > 0.3) break;
          if (d < -0.3) {
            // got past it without touching it: missions count jumps and slides
            if (!o.passed) {
              o.passed = true;
              if (o.kind === "root") missionEvent("jumps");
              else if (o.kind === "branch") missionEvent("slides");
            }
            continue;
          }
          if (o.kind === "rock" && o.lanes.includes(myLane) && s.jumpY < 0.42) stumble(o);
          else if (o.kind === "root" && s.jumpY < 0.22) stumble(o);
          else if (o.kind === "branch" && !(s.slide > 0 && s.jumpY < 0.3)) stumble(o);
          if (s.mode !== "running") break;
        }
        // gems
        for (const g of s.gemList) {
          if (g.taken) continue;
          const d = g.at - s.dist;
          if (d > 0.4) break;
          if (d < -0.4) continue;
          if (s.magnet > 0 || (g.lane === myLane && s.jumpY < 0.9)) {
            g.taken = true;
            s.gems += s.double > 0 ? 2 : 1;
            if (s.fever > 0) s.bonus += s.double > 0 ? 2 : 1; // GROOVE: every gem gives a bonus gem too
            sfx.gem();
            const p = playerScreen();
            burst(p.x, p.y - 20, 5, ["#b6ff9e", "#3ee05a", "#fff"]);
          }
        }
        // spells: run into one to pick it up
        for (const sp of s.spells) {
          if (sp.taken) continue;
          const d = sp.at - s.dist;
          if (d > 0.45 || d < -0.45) continue;
          if (sp.lane !== myLane || s.jumpY > 0.9) continue;
          sp.taken = true;
          if (sp.kind === "magnet") s.magnet = magnetSecs();
          else if (sp.kind === "double") s.double = doubleSecs();
          else if (sp.kind === "boost") s.boost = boostSecs();
          else s.shield = shieldHits();
          missionEvent("spells");
          sfx.spell();
          const p = playerScreen();
          burst(p.x, p.y - 20, 12, [SPELL_INFO[sp.kind].color, "#ffffff"]);
          s.pops.push({ x: p.x, y: p.y - 50, text: SPELL_INFO[sp.kind].name, life: 1.1, color: SPELL_INFO[sp.kind].color });
        }
        s.spells = s.spells.filter((sp) => sp.at > s.dist - 3);
        if (s.mode === "running") bossStep(dt, myLane);
        // forget things behind us
        s.obs = s.obs.filter((o) => o.at > s.dist - 3);
        s.gemList = s.gemList.filter((g) => g.at > s.dist - 3);
        s.gemList.sort((a, b) => a.at - b.at);
        s.score = Math.floor(s.dist) + s.gems * 5;
        // every ZONE_SCORE points: the next world starts at the horizon and comes towards you
        const zone = Math.floor(s.score / ZONE_SCORE);
        if (zone > s.zone) {
          s.zone = zone;
          const ti = zone % THEMES.length;
          s.zones.push({ from: s.dist + FAR, theme: ti });
          if (s.zones.length > 4) s.zones.shift();
          s.pops.push({ x: W / 2, y: 46, text: THEMES[ti].name, life: 2.2, color: THEMES[ti].title });
          sfx.zone();
          // BOSS: BEARMANPIG attacks right where the new world begins (once the obstacles already on the path are behind you)
          if (s.boss.stage === "off") {
            s.boss.stage = "wait";
            s.boss.at = s.dist + FAR + 7;
            s.boss.zone = zone;
            s.boss.t = 0;
          }
        }
        if (s.mode === "running") checkMissions();
      } else if (s.mode === "ready") {
        s.chase = 0.55 + Math.sin(clock * 1.5) * 0.1; // he's lurking
      }

      const gotYou =
        s.mode === "caught" || (s.mode === "shop" && shop.from === "caught") || (s.mode === "missions" && missionsFrom === "caught");
      const target = gotYou ? 1.45 : s.chase;
      s.chaseVis += (target - s.chaseVis) * Math.min(1, dt * (s.mode === "caught" ? 5 : 2.5));
      s.mx += (s.px - s.mx) * Math.min(1, dt * 3);
      if (s.shake > 0) s.shake -= dt;

      for (const p of s.parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 220 * dt;
        p.life -= dt;
      }
      s.parts = s.parts.filter((p) => p.life > 0);
      for (const p of s.pops) {
        p.y -= 18 * dt;
        p.life -= dt;
      }
      s.pops = s.pops.filter((p) => p.life > 0);
    };

    // SWIPE HINTS (phones): during the first seconds of a run, four arrows show what each swipe does.
    // A little finger dot slides along each arrow. They fade away before the first obstacle comes.
    const HINT_START = 0.3; // seconds after you start running
    const HINT_END = 6; // seconds after you start running (the first SAFE_START meters have no obstacles)
    const pixArrow = (cx: number, cy: number, dir: "left" | "right" | "up" | "down", color: string) => {
      // a blocky arrow 21 px long pointing in dir
      const pts: [number, number][] = [];
      for (let i = 0; i < 8; i++) for (let j = -i; j <= i; j++) pts.push([10 - i, j]); // the head
      for (let i = 0; i < 12; i++) for (let j = -2; j <= 2; j++) pts.push([3 - i - 1 + 0, j]); // the stem
      const map = ([a, b]: [number, number]): [number, number] =>
        dir === "right" ? [a, b] : dir === "left" ? [-a, b] : dir === "down" ? [b, a] : [b, -a];
      ctx.fillStyle = "#000";
      for (const p of pts) {
        const [x, y] = map(p);
        ctx.fillRect(Math.round(cx + x) - 1, Math.round(cy + y) - 1, 3, 3);
      }
      ctx.fillStyle = color;
      for (const p of pts) {
        const [x, y] = map(p);
        ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
      }
    };
    const drawSwipeHints = () => {
      if (!touchRef.current || pause.on || s.mode !== "running" || s.t < HINT_START || s.t > HINT_END) return;
      const fade = Math.min(1, (s.t - HINT_START) / 0.4, (HINT_END - s.t) / 0.8);
      ctx.globalAlpha = fade;
      const pulse = Math.floor(clock * 4) % 2 === 0;
      const prog = (clock * 1.4) % 1; // where the finger dot is along the arrow
      const hints: { x: number; y: number; dir: "left" | "right" | "up" | "down"; label: string; ly: number }[] = [
        { x: 70, y: 70, dir: "left", label: "SWIPE", ly: 84 },
        { x: W - 70, y: 70, dir: "right", label: "SWIPE", ly: 84 },
        { x: W / 2, y: 30, dir: "up", label: "JUMP", ly: 14 },
        { x: W / 2 + 62, y: 118, dir: "down", label: "DUCK", ly: 134 },
      ];
      for (const h of hints) {
        pixArrow(h.x, h.y, h.dir, pulse ? "#ffffff" : GREEN);
        const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[h.dir];
        const fx = h.x + d[0] * (-12 + prog * 24);
        const fy = h.y + d[1] * (-12 + prog * 24);
        ctx.fillStyle = "#000";
        ctx.fillRect(Math.round(fx) - 3, Math.round(fy) - 3, 7, 7);
        ctx.fillStyle = PINK;
        ctx.fillRect(Math.round(fx) - 2, Math.round(fy) - 2, 5, 5);
        text(h.label, h.x, h.ly, "#ffffff");
      }
      text("TAP = JUMP TOO", W / 2, 100, "#b6ffb0");
      ctx.globalAlpha = 1;
    };

    const drawPause = () => {
      ctx.fillStyle = "rgba(0,15,5,0.72)";
      ctx.fillRect(0, 0, W, H);
      text("PAUSED", W / 2, 22, GREEN, 16);
      const opts = ["RESUME", "RESTART"];
      opts.forEach((o, i) => {
        const y = 62 + i * 18;
        const on = pause.row === i;
        if (on) {
          ctx.fillStyle = GREEN_DARK;
          ctx.fillRect(W / 2 - 46, y - 4, 92, 15);
        }
        text(on ? `> ${o} <` : o, W / 2, y, on ? "#ffffff" : "#9ad19a");
      });
      text(`${Math.floor(s.dist)}M  ${s.gems} GEMS`, W / 2, 110, "#b6ffb0");
      if (Math.floor(pauseClock * 2) % 2 === 0) text(touchRef.current ? "TAP RESUME TO PLAY" : "ESC / PAUSE = RESUME", W / 2, 128, GREEN);
    };

    const render = () => {
      updateLook();
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 4));
      drawFloor();
      drawSky(clock);
      drawBossWarn();
      drawWorld(clock);
      drawMonster(clock);
      for (const p of s.parts) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      // chunky pixels at the start, getting sharper during the first seconds
      if (s.mode === "ready") pixelate(START_PIXELS);
      else if (s.mode === "running") pixelate(Math.max(1, Math.ceil(START_PIXELS - s.t * 1.5)));

      for (const p of s.pops) text(p.text, p.x, p.y, p.color);

      if (s.mode === "running") {
        // GROOVE: a golden frame around the picture that flashes with the beat
        if (s.fever > 0) {
          ctx.fillStyle = `rgba(255,210,74,${0.14 + Math.max(0, beatKick()) * 0.3})`;
          ctx.fillRect(0, 0, W, 3);
          ctx.fillRect(0, H - 3, W, 3);
          ctx.fillRect(0, 3, 3, H - 6);
          ctx.fillRect(W - 3, 3, 3, H - 6);
        }
        drawHud();
        drawExtraHud();
        drawSpellHud();
        drawSwipeHints();
      }

      if (s.mode === "ready") {
        ctx.fillStyle = "rgba(0,20,8,0.55)";
        ctx.fillRect(0, 0, W, H);
        text(GAME_TITLE, W / 2, 12 - Math.round(Math.max(0, beatKick()) * 2), GREEN, 16); // (bounces to the music)
        drawFace(W / 2, 36, 2);
        text("RUN FROM", W / 2, 72, "#ffffff");
        text("BEARMANPIG!", W / 2, 83, PINK);
        text(touchRef.current ? "SWIPE TO PLAY" : "SWIPE / ARROWS", W / 2, 100, "#b6ffb0");
        if (Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP TO RUN" : "SPACE = RUN", W / 2, 114, GREEN);
        if (best > 0) text(`BEST ${best}`, W / 2, 130, "#9ad19a");
        drawShop();
      }

      if (s.mode === "shop") drawShopScreen();
      if (s.mode === "missions") drawMissionsScreen();

      if (s.mode === "caught") {
        const a = Math.min(0.7, s.t * 1.2);
        ctx.fillStyle = `rgba(0,15,5,${a})`;
        ctx.fillRect(0, 0, W, H);
        if (s.t > 0.4) {
          drawFace(W / 2, 8, 3);
          text("BEARMANPIG", W / 2, 60, PINK);
          text("GOT YOU!", W / 2, 71, "#ffffff");
          text(`SCORE ${s.score}`, W / 2, 88, GREEN);
          text(s.newBest ? "NEW BEST!" : `BEST ${best}`, W / 2, 100, s.newBest ? PINK : "#9ad19a");
          text(`${Math.floor(s.dist)}M  ${s.gems}${s.bonus ? `+${s.bonus}` : ""} GEMS`, W / 2, 112, "#b6ffb0");
          if (s.t > 0.9 && Math.floor(clock * 2) % 2 === 0) text(touchRef.current ? "TAP = AGAIN" : "SPACE = AGAIN", W / 2, 128, GREEN);
          drawShop();
        }
      }
      if (fxShown()) drawFx();
    };

    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      if (pause.on) {
        pauseClock += dt; // only for the blinking text
        spinRef.current = 0; // ignore the click wheel while paused
      } else step(dt);
      render();
      if (pause.on) drawPause();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHidden);
      inputRef.current = null;
      tapRef.current = null;
      fxApi.current = null;
      try {
        ac?.close();
      } catch {}
    };
  }, [fontFamily, spinRef]);

  // ---------- touch: swipe to move, tap to pick / jump ----------
  // PHONES (touch = true): swipe ANYWHERE on the screen (the page's small EXIT / PAUSE / music buttons still work).
  //   Other touch screens: the swipe has to start on the game picture (or just next to it).
  // One swipe = one move (a long swipe still moves only one lane). Without lifting, a swipe in a DIFFERENT direction
  // is another move: swipe left, keep the finger down, swipe up = lane + jump.
  // A tap on the game picture goes to whatever is under the finger (shop row, RESUME...), elsewhere it = jump / start.
  const swipe = useRef({ x: 0, y: 0, on: false, fired: false, id: -1, last: "" });
  const SWIPE_PX = 18; // how far the finger has to slide for one move (in screen pixels)

  // which way a slide went, or null if it's still too short
  const swipeDir = (dx: number, dy: number) => {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
    return dy > 0 ? "slide" : "jump";
  };

  // a screen point in game pixels (the picture is fitted inside the canvas box)
  const toGame = (cx: number, cy: number) => {
    const c = canvasRef.current;
    if (!c) return null;
    const r = c.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H);
    return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
  };
  // FX speaker + slider: did this press land on them? (then it's not a swipe or a tap)
  const fxPress = (cx: number, cy: number, id: number) => {
    const g = toGame(cx, cy);
    const what = g ? fxApi.current?.hit(g.x, g.y) : null;
    if (!g || !what) return false;
    if (what === "icon") fxApi.current?.toggle();
    else {
      fxDrag.current = id;
      fxApi.current?.setFromY(g.y);
    }
    return true;
  };
  const fxMove = (cx: number, cy: number) => {
    const g = toGame(cx, cy);
    if (g) fxApi.current?.setFromY(g.y);
  };
  const fxEnd = () => {
    fxDrag.current = -1;
    fxApi.current?.done();
  };

  // a tap / click at a screen point: inside the picture = tap that spot, outside = OK
  const tapAt = (cx: number, cy: number) => {
    const c = canvasRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const sc = Math.min(r.width / W, r.height / H); // the picture is fitted inside the canvas box ("contain")
    const x = (cx - r.left - (r.width - W * sc) / 2) / sc;
    const y = (cy - r.top - (r.height - H * sc) / 2) / sc;
    if (x >= 0 && x < W && y >= 0 && y < H && tapRef.current) tapRef.current(x, y);
    else inputRef.current?.("go");
  };

  useEffect(() => {
    // touches on buttons, sliders and links are left alone
    const onUi = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, [role='button'], [role='slider']");

    const start = (e: TouchEvent) => {
      if (swipe.current.on || onUi(e.target)) return;
      const t = e.changedTouches[0];
      // the FX speaker / slider
      if (fxDrag.current === -1 && fxPress(t.clientX, t.clientY, t.identifier)) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!touchRef.current) {
        const r = canvasRef.current?.getBoundingClientRect();
        const M = 40;
        if (!r || t.clientX < r.left - M || t.clientX > r.right + M || t.clientY < r.top - M || t.clientY > r.bottom + M) return;
      }
      swipe.current = { x: t.clientX, y: t.clientY, on: true, fired: false, id: t.identifier, last: "" };
      if (e.cancelable) e.preventDefault(); // no double-tap zoom / long-press menu
    };
    const find = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++)
        if (e.changedTouches[i].identifier === swipe.current.id) return e.changedTouches[i];
      return null;
    };
    const move = (e: TouchEvent) => {
      // dragging the FX slider
      if (fxDrag.current >= 0) {
        for (let i = 0; i < e.changedTouches.length; i++)
          if (e.changedTouches[i].identifier === fxDrag.current) {
            fxMove(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
            if (e.cancelable) e.preventDefault();
          }
        return;
      }
      const sw = swipe.current;
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      if (e.cancelable) e.preventDefault(); // don't scroll the page while swiping
      const dir = swipeDir(t.clientX - sw.x, t.clientY - sw.y);
      if (!dir) return;
      // measure again from here, so the same finger can do ANOTHER move...
      sw.x = t.clientX;
      sw.y = t.clientY;
      // ...but only in a different direction: one long swipe = exactly one lane (so you can stop in the middle)
      if (dir === sw.last) return;
      sw.last = dir;
      inputRef.current?.(dir);
      sw.fired = true;
    };
    const end = (e: TouchEvent) => {
      if (fxDrag.current >= 0) {
        for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === fxDrag.current) fxEnd();
        return;
      }
      const sw = swipe.current;
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      if (e.type === "touchend" && !sw.fired) tapAt(t.clientX, t.clientY);
      sw.on = false;
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
      // COMPUTER mouse: click = pick / jump / start, drag = swipe (touch is handled above)
      onPointerDown={(e) => {
        if (e.pointerType !== "mouse") return;
        e.stopPropagation();
        // the FX speaker / slider
        if (fxPress(e.clientX, e.clientY, -2)) {
          if (fxDrag.current === -2) e.currentTarget.setPointerCapture(e.pointerId);
          return;
        }
        swipe.current = { x: e.clientX, y: e.clientY, on: true, fired: false, id: -1, last: "" };
      }}
      onPointerMove={(e) => {
        if (e.pointerType === "mouse" && fxDrag.current === -2) {
          fxMove(e.clientX, e.clientY);
          return;
        }
        const sw = swipe.current;
        if (e.pointerType !== "mouse" || !sw.on || sw.fired) return;
        const dir = swipeDir(e.clientX - sw.x, e.clientY - sw.y);
        if (!dir) return;
        sw.fired = true;
        inputRef.current?.(dir);
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== "mouse") return;
        e.stopPropagation();
        if (fxDrag.current === -2) {
          fxEnd();
          return;
        }
        const sw = swipe.current;
        if (sw.on && !sw.fired) tapAt(e.clientX, e.clientY);
        sw.on = false;
      }}
      onPointerCancel={(e) => {
        if (e.pointerType === "mouse") {
          swipe.current.on = false;
          if (fxDrag.current === -2) fxDrag.current = -1;
        }
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
        imageRendering: "pixelated",
        background: "#05140a",
        touchAction: "none",
        cursor: "pointer",
      }}
    />
    <ScorePanel game="jungle" title="PINK JUNGLE" apiRef={boardRef} fontFamily={fontFamily} accent="#3ee05a" />
    </>
  );
}
