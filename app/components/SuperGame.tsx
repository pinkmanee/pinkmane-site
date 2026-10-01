"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= jump)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
};

// golden = paused on the golden leaf screen, choose = picking your spell before a boss, paused = Esc
type Mode =
  | "select"
  | "ready"
  | "running"
  | "pipe"
  | "hurt"
  | "dying"
  | "entry"
  | "board"
  | "golden"
  | "choose"
  | "paused"
  | "home" // the pink start screen: PINK RUN INFINITE or PINK LEVELS
  | "levelSelect" // the list of levels
  | "levelDone"; // you hit the bong

// The pause (Esc) menu, top to bottom
const PAUSE_OPTIONS = ["RESUME", "RESTART", "PICK OUTFIT", "GAME TYPE", "HOME"];

// One column of the level
type Column = {
  ground: number; // row where the ground starts, -1 = pit
  block: number; // floating brick floor (one-way), -1 = none
  block2: number; // second brick floor above it
  bonus: number; // bonus block row (bump it from below), -1 = none
  used: boolean;
  bump: number;
  line: number; // thin line to jump on (one-way), -1 = none
  lineTh: number; // how thick the line is drawn (gets thinner the farther you go)
  pipe: number; // 0 = no pipe, 1 = left half, 2 = right half
  pipeOut: boolean; // pipe that leads back out of the bonus room
  pipeUsed: boolean;
  fragile: number; // thin line that vanishes after you touch it: seconds it lasts (0 = normal line)
  crumble: number; // counting down once touched (-1 = not touched)
  zone: number; // which zone look this column has (99 = SoundCloud Void)
};

type Enemy = {
  kind: "walker" | "flyer";
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseY: number;
  phase: number;
  alive: boolean;
  squash: number;
  shoot?: number; // IPOD USER drones: seconds until the next laser
};
type Leaf = { x: number; y: number; taken: boolean; small?: boolean; coin?: boolean }; // small = half size (words), coin = gold coin
type Heart = { x: number; y: number; taken: boolean };
type PowerKind = "fire" | "ice" | "double";
type PowerUp = { x: number; y: number; vx: number; vy: number; kind: PowerKind };
type Fireball = { x: number; y: number; vx: number; vy: number; life: number; ice: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Popup = { x: number; y: number; text: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// Game size in pixels. It gets scaled up to fill the screen.
// Widened to match the aspect ratio of the screen cutout drawn in handheld.png (it's a
// wide PSP-style screen, ~2.1:1) — this used to be a narrower 256, which is why there were
// two empty bars down the sides when this rendered inside the handheld.
const W = 336;
const H = 160;
const T = 16; // one tile
const ROWS = 10;

// Your pixel dude: /public/game/pinkdude.png (2 frames side by side)
const SPRITE_W = 24;
const SPRITE_H = 35;
// Hitbox inside the sprite (hair and arms don't count)
const HB_X = 7;
const HB_Y = 5;
const HB_W = 11;
const HB_H = 30;

// Feel of the game
const GRAVITY = 1150;
const JUMP = -370;
const RUN = 100;
const ACCEL = 900;
const STOMP_BOUNCE = -240;

// Lives are hearts: you start with 2 and can collect up to 4
const START_LIVES = 2;
const MAX_LIVES = 4;

// Zones change every this many tiles, each with its own look and harder jumping
const ZONE_LEN = 150;
const ZONE_NAMES = [
  "PINK FIELDS",
  "SPEAKER HILLS",
  "ROOFTOPS",
  "PINK CLOUDS",
  "TWISTED TREES",
  "SMOKE OCEAN",
  "GAF FIELD",
  "GODS PSP FIELD",
  "IPOD USER FIELD",
  "TRIPPY FIELD",
  "SMALL PRETTY TITTIES FIELD",
  "TOP SHELF FIELD",
  "TWISTED CORAL PEAKS",
];
// The 7 cover-art fields: zone id = FIELD_ZONE_START + index into this list.
// Ground/platforms in these zones use the same plain look as PINK FIELDS —
// only the backdrop changes, to whichever cover this stretch of the level is themed on.
const FIELD_ZONE_START = 6;
const FIELD_IMAGES = [
  "/backgrounds/field-gaf.png",
  "/backgrounds/field-godspsp.png",
  "/backgrounds/field-ipoduser.png",
  "/backgrounds/field-trippy.png",
  "/backgrounds/field-spt.png",
  "/backgrounds/field-topshelf.png",
  "/backgrounds/field-coral.png",
];
const Z_CLOUDS = 3;
// The cover-art fields by name (each one has its own ground, blocks and lines to match its cover)
const F_GAF = 6;
const F_PSP = 7;
const F_IPOD = 8;
const F_TRIPPY = 9;
const F_SPT = 10;
const F_TOP = 11;
const F_CORAL = 12;
// Colours of each zone on the progress line at the bottom
const ZONE_COLORS = [
  "#ff5fe0",
  "#ff9a3c",
  "#8e3fb0",
  "#fbd3f3",
  "#b06ce0",
  "#c6b9d6",
  "#d63cc8", // gaf field
  "#9b8bd6", // gods psp field
  "#5b6fd6", // ipod user field
  "#c68bff", // trippy field
  "#e07ab0", // small pretty titties field
  "#b19cff", // top shelf field
  "#3fb0a8", // twisted coral peaks
];
const Z_TREES = 4;
const Z_SMOKE = 5;
const VOID_ZONE = 99;

// Fire power: 5 fireballs, and a timer bar at the bottom. Picking up another one refills, it doesn't stack.
const FIRE_AMMO = 5;
const FIRE_TIME = 15;
const FIREBALL_SPEED = 170;
// Ice leaf (blue, rarer): 5 ice shots that fly straight, no timer
const ICE_AMMO = 5;
const ICE_SPEED = 230;
// Double-jump leaf (turquoise, rarest): 3 extra jumps in mid-air
const DOUBLE_JUMPS = 3;

// Secret at the very start: walk LEFT instead of right. There's a jetpack and two signs
// (one before the jetpack, one further left behind it). Hold jump to fly. It runs out once you reach this score.
const EGG_COLS = 26; // how many tiles the hidden area has to the left of the start
const JET_UNTIL = 2000;
const JET_THRUST = 1900;
const JET_MAX_UP = -165;
const JET_FUEL_MAX = 5; // seconds of flight on a full tank
const JET_REFUEL_TIME = 2; // seconds on the ground to go from empty to full
const JET_REFUEL_RATE = JET_FUEL_MAX / JET_REFUEL_TIME;
// ---------- Golden leaf (secret Stutters track) ----------
// From this score on, the next SoundCloud Void has a spinning golden leaf (once per game).
const GOLD_AT = 8000;
const PTS_GOLD = 500;
// Put the mp3 in public/sounds/ with this name. It plays while you're in the Void after finding the leaf.
const STUTTERS_TRACK = "/sounds/stutters-remix.mp3";
// Paste your private SoundCloud link between the quotes. Leave it empty to hide the link button.
const STUTTERS_LINK = "";
const GOLD_KEY = "pinksuper-golden"; // remembers you've found it before

// ---------- Boss: the troll ----------
const BOSS_EVERY = 10000; // a troll at 10k, 20k, 30k ...
const BOSS_HP_START = 8; // hits the first troll takes
const BOSS_HP_STEP = 3; // each next troll takes this many more
const BOSS_SPEED_STEP = 0.25; // each next troll is 25% faster
const BOSS_SPARE_SHOTS = 2; // you get this many more shots than he needs
const TROLL_DEATH_SOUND = "/sounds/trolldeath.mp3";
const BOSS_ARENA = 21; // tiles wide (exactly one screen, now that the screen is wider)
const TROLL_SPEED = 38; // slower than you (you run at 100)
const TROLL_JUMP = -330;
const PTS_BOSS = 1000;
// Troll hitbox inside his 44 x 48 picture
const TR_W = 44;
const TR_H = 48;
const TR_HX = 8;
const TR_HY = 10;
const TR_HW = 28;
const TR_HH = 38;
// ---------- Boss: the giant (a bigger, tougher troll) ----------
// Shots alone only bring him to his knees — you have to finish him with a stomp.
const GIANT_HP = 12; // shots needed before he goes down
const GIANT_SCALE = 3; // vs the troll's 2 — noticeably bigger
const GIANT_W = 22 * GIANT_SCALE;
const GIANT_H = 24 * GIANT_SCALE;
const GIANT_HX = Math.round((TR_HX / TR_W) * GIANT_W);
const GIANT_HY = Math.round((TR_HY / TR_H) * GIANT_H);
const GIANT_HW = Math.round((TR_HW / TR_W) * GIANT_W);
const GIANT_HH = Math.round((TR_HH / TR_H) * GIANT_H);
const GIANT_SPEED_MULT = 0.7; // bigger, so a little slower than the regular troll
const GIANT_DAZE_TIME = 3.5; // seconds you have to jump on his head once he's down
const GIANT_DAZE_HP = 3; // miss the window and he gets back up with this much health
const PTS_GIANT = 2000;

const MY_GOATS = ["LIL PEEP", "YUNG LEAN", "GHOSTEMANE", "SMOKEDOPE2016", "DRIPPIN SO PRETTY"];
// Second sign, further left behind the jetpack
const SHOUT_OUTS = ["O1M4DE", "TOMBFELL", "LEOHWASFOUND", "STUTTERS", "SLITFACE", "SALADE", "LIL SAD K", "HELL JEXX"];

// Points
const PTS_LEAF = 10;
const PTS_WALKER = 100;
const PTS_FLYER = 150;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinksuper-best";
const SFX_KEY = "pinksuper-sfx";
// ---------- Test shortcut (only on your own computer, never on the real site) ----------
// Open  http://localhost:3000/?zone=coral  (or a zone number like ?zone=13) and every new game
// starts right at the beginning of that zone. Test runs never go on the scoreboard.
const TEST_ZONES: Record<string, number> = {
  fields: 0, speaker: 1, rooftops: 2, clouds: 3, trees: 4, smoke: 5,
  gaf: 6, psp: 7, ipod: 8, trippy: 9, spt: 10, top: 11, topshelf: 11, coral: 12,
};
function testStartZone() {
  if (typeof window === "undefined") return -1;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return -1;
  const q = (new URLSearchParams(window.location.search).get("zone") || "").toLowerCase();
  if (!q) return -1;
  if (q in TEST_ZONES) return TEST_ZONES[q];
  const n = Number(q);
  return Number.isInteger(n) && n >= 1 && n <= ZONE_NAMES.length ? n - 1 : -1;
}
// =====================================================================================
// PINK LEVELS
// =====================================================================================
// Each level is drawn as 10 rows of text, one character per tile (rows 0-9, top to bottom).
//   #  ground (everything below it is solid)      =  brick (land on it from above)
//   -  thin line (land on it from above)          ?  bonus block (bump it from below)
//   L  weed leaf (points)   C  gold coin   H  heart
//   w  walker               f  flyer
//   S  sign: shows the next line from `signs` when you walk past it
//   A  the boss arena starts here (exactly one screen wide, keep it flat)
//   B  the bong: touch it to finish the level and stop the clock
// Only one of = - ? per column. Edit the rows, keep them all the same length.
const LEVEL_ZONE = 30; // the "weed fantasy" look
// zone = the look (LEVEL_ZONE = Weedland, LEVEL_SNOW = snowy mountains), boss = which boss waits in the arena,
// outfit = a picture PINKMANE wears only in this level (leave it out to wear your own outfit)
type LevelDef = { name: string; map: string[]; signs: string[]; bossHp: number; zone?: number; boss?: "leaf" | "snowman"; outfit?: string };
const LEVEL_SNOW = 31; // the snowy mountain valley look
const LEVELS: LevelDef[] = [
  {
    // Other name ideas: "BONG LVL 1", "THE FIRST HIT", "WEEDLAND", "GREEN DREAM", "HIGH GROUND"
    name: "PINKMANE LIKES WEED",
    bossHp: 10,
    // Lore signs, in order. Change them to whatever you want people to learn about PINKMANE.
    // Max ~40 characters per line; use \n to split a sign into two lines.
    signs: [
      "WELCOME TO WEEDLAND, PINKMANE'S HOME",
      "PINKMANE: PRODUCER FROM SLOVAKIA",
      "HE MAKES HIS OWN BEATS",
      "HIS FAVOURITE ARTISTS:\nLIL PEEP, YUNG LEAN, GHOSTEMANE",
      "FIND PINKMANE ON SOUNDCLOUD",
      "THE EVIL LEAF GUARDS HIS BONG...",
      "PINKMANE LIKES WEED. GO HIT THE BONG!",
    ],
    map: [
      "......................................................................................................................................................................................................................",
      "......................................................................................................................................................................................................................",
      "......................................................................................................................................................................................................................",
      ".......................................................................................H..............f...............................................................................................................",
      "..........................C...........L..L..........f.................................---...................f....................C..........f...L..L.....................===..........................................",
      ".........................===..........=?==.................L........C...........................==?=.....................LL....----.............====.................?.........?......................................",
      "........LLL....LL...............................LLL......-----.....###..................................LLL.............----.............................LLL..................................LLL.....................",
      "...S..........####....w...........S..........w..................#########...S...w...w...........................S...w.......###.........w.............S..........A........................S..........B................",
      "##############################..##########################...#############################...###########################....###....###################################################################################",
      "##############################..##########################...#############################...###########################....###....###################################################################################",
    ],
  },
  {
    // Other name ideas: "SNOWY MOUNTAINS", "COLD HANDS", "FROZEN HIGH", "BRRR"
    name: "SNOWY MOUNTAINS",
    bossHp: 10,
    zone: LEVEL_SNOW,
    boss: "snowman",
    outfit: "/game/pinkdude-winter.png", // pink parka + beanie, only in this level
    signs: [
      "WELCOME TO THE SNOWY MOUNTAINS",
      "PINKMANE'S FAVOURITE SHOW: SOUTH PARK",
      "FAVOURITE CHARACTERS:\nKENNY, CARTMAN, BUTTERS, TWEEK",
      "IT'S COLD UP HERE. KEEP YOUR JOINT LIT",
      "THE EVIL SNOWMAN WANTS YOUR WEED...",
      "WARM UP: GO HIT THE BONG!",
    ],
    map: [
      "........................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................",
      "........................................................................H...f.................................f.........................................................................................................",
      "....................C.........................f........................---..........................L.....................LL............f........C...........................===........................................",
      "...................===...............L......=?==....LL.............................................==?=..................----...................===......................?.........?....................................",
      ".......LLL..........................###...........------......................LLL..........C........................---......---..........................LLL.....................................LLL...................",
      "...S...........w.............S...######...w.................S...w...w.....................###...S.........w............##...........w.......w.........S..............A........................S.........B...............",
      "########################...#######################......############################...#############################...##.......########################################################################################",
      "########################...#######################......############################...#############################...##.......########################################################################################",
    ],
  },
];
// The level map: stops (one per level) joined by a winding path, like a Mario world map.
// icon = the look of that stop. `path` = the corners walked on the way TO that stop from the one before.
// A stop is locked until you beat the level before it. Stops without a level yet say COMING SOON.
type MapIcon = "weed" | "snow" | "speaker" | "roof" | "cloud" | "tree" | "ship" | "coral" | "bong";
const MAP_NODES: { x: number; y: number; icon: MapIcon; path: [number, number][] }[] = [
  { x: 28, y: 128, icon: "weed", path: [] },
  { x: 84, y: 128, icon: "snow", path: [] },
  { x: 84, y: 80, icon: "roof", path: [] },
  { x: 148, y: 80, icon: "cloud", path: [] },
  { x: 148, y: 128, icon: "tree", path: [] },
  { x: 212, y: 128, icon: "ship", path: [] },
  { x: 212, y: 76, icon: "coral", path: [] },
  { x: 296, y: 104, icon: "bong", path: [[296, 76]] }, // the last one: a big bong, BOSS FIGHT
];
const MAP_BADGE: Record<MapIcon, string> = {
  weed: "#6fdc5a",
  snow: "#bfe8ff",
  speaker: "#ff9a3c",
  roof: "#8e3fb0",
  cloud: "#fbd3f3",
  tree: "#b06ce0",
  ship: "#c6b9d6",
  coral: "#3ec6c0",
  bong: "#ff5fe0",
};
const MAP_WALK_SPEED = 95;
const LEVEL_PROGRESS_KEY = "pinksuper-levels"; // { "1": best ms } for every level you finished
const LEVEL_TIME_BASE = 10000000; // a level time is saved on the scoreboard as LEVEL_TIME_BASE - milliseconds
const levelGameId = (n: number) => `super-l${n}`;
const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
// The evil weed leaf (Level 1 boss), drawn 2x bigger
const EVIL_LEAF = [
  ".........KK..........",
  "........KGGK.........",
  "..KK....KGGK....KK...",
  ".KGGK...KGGK...KGGK..",
  ".KGgGK..KGGK..KGgGK..",
  "..KGgGK.KGgK.KGgGK...",
  "K..KGgGKKGgKKGgGK..KK",
  "KGK.KGgGKGgKGgGK.KGGK",
  ".KGGKKGGGGGGGGGKKGgK.",
  "..KGgGGGGGGGGGGGGgK..",
  "...KKGRRGGGGGRRGKK...",
  "....KGKRRGGGRRKGK....",
  "....KGGGGGGGGGGGK....",
  ".....KGKWKWKWKGK.....",
  "......KGKKKKKGK......",
  ".......KKGGGKK.......",
  ".........KgK.........",
  ".........KgK.........",
  "..........K..........",
];
const EVIL_COLORS = { K: "#141e0f", G: "#46aa3c", g: "#1e6428", R: "#ff283c", W: "#ffffff" };
const EL_W = 42;
const EL_H = 38;
// LEVEL 2 (snowy mountains): snowman walkers, crows, and the evil horned snowman boss
const SNOWMAN = ["..WWW..", ".WKWKW.", "..WOW..", "B.WWW.B", ".BWKWB.", "WWWKWWW", ".WWWWW."];
const SNOWMAN_COLORS = { W: "#fafcff", K: "#14141e", O: "#ff8c1e", B: "#6e4628" };
const CROW = [
  ["K.......K", "KK.....KK", ".KKK.KKK.", "..KKKKKOO", "..KRKKK..", "...KKK...", "........."],
  [".........", ".........", "..KKKKKOO", "..KRKKK..", ".KKK.KKK.", "KK.....KK", "K.......K"],
];
const CROW_COLORS = { K: "#1e1e28", O: "#ffaa28", R: "#ff323c" };
const EVIL_SNOWMAN = [
  "......R........R......",
  ".....RR........RR.....",
  ".....R..KKKKKK..R.....",
  ".....RKKKKKKKKKKR.....",
  "......KKKKKKKKKK......",
  ".....KKKKKKKKKKKK.....",
  "....KKKKKKKKKKKKKK....",
  ".....WWWWWWWWWWWW.....",
  "....WWRRWWWWWWRRWW....",
  "....WWWRRWWWWRRWWW....",
  "....WWWWWWOOWWWWWW....",
  "....WWWWWWOOOOWWWW....",
  "....WWKWKWKWKWKWWW....",
  ".....WWWWWWWWWWWW.....",
  "..B...WWWWWWWWWW...B..",
  "...B.WWWWWKWWWWWW.B...",
  "....BWWWWWWWWWWWWB....",
  "....WWWWWWKWWWWWWW....",
  "...WWWWWWWWWWWWWWWW...",
  "...WWWWWWWWKWWWWWWW...",
  "...WWWWWWWWWWWWWWWW...",
  "...WWWWWWWWKWWWWWWW...",
  "....WWWWWWWWWWWWWW....",
  ".....SSSSSSSSSSSS.....",
];
const EVIL_SNOWMAN_COLORS = { W: "#f5f8ff", K: "#14141e", R: "#dc1e28", O: "#ff8c1e", B: "#6e4628", S: "#aac3e1" };
const SN_W = 44;
const SN_H = 48;
const SNOWMAN_DAZE = 4; // seconds you get to jump on his head once he's out of hits
// The bong at the end of every level, drawn 2x bigger
const BONG = [
  "...KKKK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK.KK",
  "...KCcKKOK",
  "..KCCcCKK.",
  ".KCCBBcCK.",
  "KCBBBBBBCK",
  "KCBBWBBBCK",
  "KCBBBBBBCK",
  ".KCBBBBCK.",
  "..KKKKKK..",
];
const BONG_COLORS = { K: "#111111", C: "#b8f0d8", c: "#e8fff4", B: "#58b8ff", W: "#ffffff", O: "#ff7a00" };
const BONG_W = 20;
const BONG_H = 30;
// Weedland colours
const WL_SKY_TOP = "#c8f5b0";
const WL_SKY_BOTTOM = "#78cf6e";
const WL_SOIL = "#2d4a22";
const WL_GRASS = "#6fdc5a";

const SFX_VOL_KEY = "pinksuper-sfx-volume"; // 0..1, set with the slider under the speaker icon
// How much each cover background is washed out (brighter, less contrast) so the level is easy to see.
// Index = field (GAF, PSP, IPOD, TRIPPY, SPT, TOP SHELF, CORAL). 0 = the cover as it is.
const FIELD_WASH = [0.4, 0.38, 0.32, 0, 0.35, 0, 0];
// Covers that gently wiggle like a heat haze / water (all of them; set one to false to keep it still)
const FIELD_WIGGLE = [true, true, true, true, true, true, true];
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// ---------- Outfits (no accounts, everything lives in this browser) ----------
// Coins are just your lifetime grams total, added up every time you die. Some outfits
// cost coins, some unlock from an achievement. Add PNGs at the given paths to use them;
// until you do, that outfit just shows as a flat-colored dude (see OUTFIT_FALLBACK below).
type OutfitId = "classic" | "ghost" | "icy" | "og";
const OUTFITS: { id: OutfitId; name: string; file: string; how: string }[] = [
  { id: "classic", name: "CLASSIC PINKMANE", file: "/game/pinkdude.png", how: "ALWAYS UNLOCKED" },
  { id: "og", name: "TRIPPY PINKMANE", file: "/game/pinkdude-pinkfit.png", how: "REACH SCORE 30000" },
  { id: "ghost", name: "GHOSTY PINKMANE", file: "/game/pinkdude-ghost.png", how: "BEAT A TROLL" },
  { id: "icy", name: "ICY PINKMANE", file: "/game/pinkdude-icy.png", how: "BUY FOR 100 COINS" },
];
const ICY_COST = 100; // gold coins
// Gold coins: some of the weed leaves in the level are gold coins instead (about 1 in 14).
// Leaves are only for your score; coins are what you spend on outfits.
const COIN_CHANCE = 0.07;
const OG_SCORE_UNLOCK = 30000;
const OUTFIT_FALLBACK: Record<OutfitId, string> = {
  classic: "#d63cc8",
  og: "#d63cc8",
  ghost: "#bfe9d8",
  icy: "#8fd9ff",
};
const COINS_KEY = "pinksuper-goldcoins"; // gold coins you have (spent on outfits)
const UNLOCKED_KEY = "pinksuper-outfits"; // JSON array of unlocked outfit ids
const OUTFIT_KEY = "pinksuper-outfit"; // currently worn outfit id

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const HILLS = "#c3e2a3";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const LIGHT_GREEN = "#6fdc5a";
const ROOF = "#6a2a8a";
const ROOF_LINE = "#8e3fb0";
const CLOUD = "#fdeefb";
const CLOUD_SKY = "#f3d3ee";
// A different accent tint for each Void room (index matches buildVoid's "which"), so the
// rooms feel a bit less identical even though the wave pattern is the same
// SoundCloud Void colours: a random one every time you go in (never the same twice in a row)
const VOID_PALETTES: { bg: string; a: string; b: string; ink: string }[] = [
  { bg: "#c23d93", a: "#ff7fd0", b: "#e25cb4", ink: "#ffffff" }, // pink
  { bg: "#1e0c2e", a: "#4a1f6a", b: "#33144d", ink: "#ffffff" }, // dark purple
  { bg: "#0b2414", a: "#1f5a33", b: "#154226", ink: "#ffffff" }, // dark green
  { bg: "#0b1433", a: "#1f3a7a", b: "#152a5c", ink: "#ffffff" }, // dark blue
  { bg: "#e8c22a", a: "#fff07a", b: "#f5d84a", ink: "#111111" }, // yellow
];
// Twisted Trees
const TREE_SKY = "#c9a9e8";
const TREE_FAR = "#a57fcf";
const TREE_NEAR = "#5b3a86";
const TREE_SOIL = "#2a1640";
const TREE_TOP = "#b06ce0";
const TREE_ROOT = "#4a2a6a";
// Smoke Ocean
const SMOKE_SKY = "#a797ba";
const SMOKE_SEA = "#c6b9d6"; // the sea of smoke (you fall through it)
const SMOKE_SEA_DARK = "#b2a2c6";
const SMOKE_STREAK = "#d9cfe6";
const SMOKE_LIGHT = "#fbf8fd"; // smoke you can stand on
const SMOKE_SHADE = "#e6ddf0";
const SMOKE_EDGE = "#7f6a9a";
const BOOM = [PINK, "#ffc800", INK, "#777777", "#ffffff"];
const FIRE = ["#ff7a00", "#ffc800", "#d21e1e", "#ffffff"];
const ICE = ["#4aa3ff", "#bfe3ff", "#1d4fa8", "#ffffff"];
const TURQ = ["#3de0c8", "#b8fff3", "#138a7a", "#ffffff"];
// Leaf colours for each power-up: [main, dark]
const POWER_COLORS: Record<PowerKind, [string, string]> = {
  fire: ["#ff7a00", "#d21e1e"],
  ice: ["#4aa3ff", "#1d4fa8"],
  double: ["#3de0c8", "#138a7a"],
};

// Haters: grumpy grey clouds that walk around (drawn 2x bigger)
const HATER = [
  ".GG.GG.",
  "GGGGGGG",
  "GKKGKKG",
  "GWKGWKG",
  "GGGGGGG",
  "GGKKKGG",
  ".G.G.G.",
];
// Green flying monster (two wing frames, drawn 2x bigger)
const FLYER = [
  [
    "GG.....GG",
    "GGG...GGG",
    ".GGDDDGG.",
    "..DWDWD..",
    "..DDDDD..",
    "...D.D...",
    ".........",
  ],
  [
    ".........",
    "...DDD...",
    "..DWDWD..",
    "GGDDDDDGG",
    "GGG.D.GGG",
    "GG.....GG",
    ".........",
  ],
];
const LEAF = [
  "...G...",
  "..GGG..",
  "G.GGG.G",
  "GGGGGGG",
  ".GGGGG.",
  "...D...",
  "...D...",
];
const HEART = [
  ".PP.PP.",
  "PPPPPPP",
  "PPPPPPP",
  ".PPPPP.",
  "..PPP..",
  "...P...",
];
// The jetpack you can find at the start (drawn 2x bigger). O/Y = flames.
const JETPACK = [
  "..K...K..",
  ".KPK.KPK.",
  "KPPPKPPPK",
  "KPWPKPWPK",
  "KPPPKPPPK",
  "KPPPKPPPK",
  "KpppKpppK",
  "KgggKgggK",
  ".KgK.KgK.",
];
// Small version worn on your back, with its flame
const JET_SMALL = [".KKK.", "KPPPK", "KPWPK", "KPPPK", "KPPPK", "KpppK", "KgggK", ".KgK."];
const JET_SMALL_FLAME = ["..O..", ".OYO.", "..O..", "..Y.."];
// Ghost ship on the Smoke Ocean: a boat full of skeletons (drawn 2x bigger)
const BOAT = [
  "...............M..............",
  "...............MSSSS..........",
  "...............MSSSSS.........",
  "...............MSS.SS.........",
  "...............MSSSS..........",
  "...............MS.SS..........",
  "...............MS..S..........",
  "...............M..............",
  "...WWW.........M.......WWW....",
  "..WKWKW..WWW...M......WKWKW...",
  "..WWWWW.WKWKW..M......WWWWW...",
  "...W.W..WWWWW..M.......W.W....",
  ".W..W....W.W...M........W..W..",
  "..WWWWW...W....M......WWWWW...",
  "....W...WWWWW..M........W.....",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  ".KbbbbbbbbbbbbbbbbbbbbbbbbbbK.",
  "..KBBBBBBBBBBBBBBBBBBBBBBBBK..",
  "...KbbbbbbbbbbbbbbbbbbbbbbK...",
  "....KKKKKKKKKKKKKKKKKKKKKK....",
];
// The troll boss (drawn 2x bigger, faces left). T = his tongue sticking out.
const TROLL = [
  "......KKKKKK..........",
  "....KKGGGGGGKK........",
  "...KGGLLGGGGGGK.......",
  "..KGGLGGGGGGGGGK......",
  ".KGGWWKGGGWWKGGgK.....",
  ".KGGWEKGGGWEKGGgK.....",
  "KgGGGGGGGGGGGGGgK.....",
  "KGGKKKKKKKGGGGgK......",
  "KGKTTTTTTKGGGgKK......",
  ".KTTTTttTKKKKKRRK.....",
  ".KTTTttTKGRRBBBRRK....",
  "..KTTtTKGGRBBbBBRgK...",
  "..KKTTKGGRBBBBBBRGGK..",
  ".KGGKKGGRRBBbBBBRRGGK.",
  ".KGGGGKGRLLLLLLLRRGGK.",
  "KCCKGGKRLLGGGGGLLRRGK.",
  "KCcCKKRRLGGGgGGGLRRK..",
  ".KCcCKRLGGGGGGGgGLRK..",
  "..KCcKNNNNNNNNNNNNNK..",
  "...KCKGGGGGbbbGGGGGK..",
  "...KCcKGGGK...KGGGK...",
  "....KCKGGGK...KGGGK...",
  "....KCKgGGGK..KgGGGK..",
  "....KKKKKKKK..KKKKKK..",
];
const TROLL_RIGHT = TROLL.map((r) => r.split("").reverse().join(""));
const TROLL_COLORS: Record<string, string> = {
  K: "#111111",
  G: "#6aa84f",
  g: "#3e6e30",
  L: "#96cd6e",
  W: "#ffffff",
  E: "#c81428",
  R: "#b02828",
  r: "#781414",
  B: "#5a788c",
  b: "#3c5564",
  T: "#a0e65a",
  t: "#5aaa32",
  C: "#8c5232",
  c: "#5f3720",
  N: "#5a321e",
};
// Tiny letters for spelling words with weed leaves in the SoundCloud Void
const LEAF_FONT: Record<string, string[]> = {
  F: ["###", "#..", "##.", "#..", "#.."],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  L: ["#..", "#..", "#..", "#..", "###"],
  W: ["#.#", "#.#", "#.#", "###", "#.#"],
  M: ["#.#", "###", "#.#", "#.#", "#.#"],
  E: ["###", "#..", "##.", "#..", "###"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  "!": ["#", "#", "#", ".", "#"],
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

// ---------- Cover-field art (every piece has a dark outline so it shows up on any cover) ----------
// GAF FIELD: weed nugs to jump on
const NUG = [
  "....KKKKKK......",
  "..KKGgGGgGKK....",
  ".KGgOGGWGGgGK...",
  "KGGGGgGGOGGgGKK.",
  "KgOGGWGgGGWGGgGK",
  "KGGgGGGGOgGGOGGK",
  ".KGWGgOGGGgGGWK.",
  "..KKGGGgGWGGKK..",
  "....KKKKKKKK....",
];
const NUG_COLORS = { K: "#111111", G: "#5cb84a", g: "#2e6e28", O: "#ff8c28", W: "#ebffeb" };
// GODS PSP FIELD: little handheld consoles
const HANDHELD = [
  "KKKKKKKKKKKKKKKK",
  "KLLLLLLLLLLLLLLK",
  "KLdLKBBBBBBKLoLK",
  "KdddKBSBBBBKLLoK",
  "KLdLKBBBBBBKoLLK",
  "KLLLLLLLLLLLLLLK",
  ".KKKKKKKKKKKKKK.",
];
const HANDHELD_COLORS = { K: "#111111", L: "#3c3c48", d: "#c8c8d2", B: "#4aa3ff", S: "#dcf0ff", o: "#ff5fe0" };
// IPOD USER FIELD: little music players at MAX volume
// IPOD USER FIELD: little white music players with a pink song on the screen and a click wheel
const PLAYER = [
  ".KKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWK",
  "KWKKKKKKKKKKKKWK",
  "KWKssssssssssKWK",
  "KWKsPPPPPPPssKWK",
  "KWKsbbbbbssssKWK",
  "KWKssssssssssKWK",
  "KWKKKKKKKKKKKKWK",
  "KWWWWWggggWWWWWK",
  "KWWWWggWWggWWWWK",
  "KWWWgWWccWWgWWWK",
  "KWWWgWWccWWgWWWK",
  "KWWWWggWWggWWWWK",
  "KWWWWWggggWWWWWK",
  "KWWWWWWWWWWWWWWK",
  ".KKKKKKKKKKKKKK.",
];
const PLAYER_COLORS = { K: "#111111", W: "#f7f7fb", g: "#b4b4c4", c: "#dcdce6", s: "#9fd4ff", P: "#ff5fc8", b: "#3c6ed2" };
// SMALL PRETTY TITTIES FIELD: rainbows to jump on, devil bunnies to stomp, fairies flying over
const RAINBOW = [
  "....KKKKKKKK....",
  "..KKRRRRRRRRKK..",
  ".KRROOOOOOOORRK.",
  "KROOYYYYYYYYOORK",
  "KROYGGGGGGGGYORK",
  "KROYGBBBBBBGYORK",
  "KROYGBK..KBGYORK",
  "KKKKKK....KKKKKK",
];
const RAINBOW_COLORS = { K: "#111111", R: "#eb323c", O: "#ff9628", Y: "#ffe13c", G: "#50c85a", B: "#468cff" };
const RAINBOW_STRIPES = ["#eb323c", "#ff9628", "#ffe13c", "#50c85a", "#468cff", "#9646dc"];
const BUNNY = [".W...W.", ".WR.RW.", ".WWWWW.", "WKWWWKW", "WWWPWWW", "WWKKKWW", ".WWWWW."];
const BUNNY_COLORS = { K: "#111111", W: "#fff0f8", P: "#ff78c8", R: "#dc1e28" };
const FAIRY = [
  ["C..PPP..C", "CCPSSSPCC", "CCPKSKPCC", ".CPSSSPC.", "...VVV...", "..VVVVV..", "...S.S..."],
  ["...PPP...", "..PSSSP..", ".CPKSKPC.", "CCPSSSPCC", "CC.VVV.CC", "C.VVVVV.C", "...S.S..."],
];
const FAIRY_COLORS = { C: "#c8f0ff", P: "#ff5fc8", S: "#ffd6b4", K: "#111111", V: "#9646dc" };
// TOP SHELF FIELD: riveted metal plates
const METAL = [
  "KKKKKKKKKKKKKKKK",
  "KHHHHHHHHHHHHHHK",
  "KHrMMMMMMMMMMrHK",
  "KMMMMMMMMMMMMMMK",
  "KMMMMMMMMMMMMMMK",
  "KMrMMMMMMMMMMrMK",
  "KDDDDDDDDDDDDDDK",
  "KKKKKKKKKKKKKKKK",
];
const METAL_COLORS = { K: "#111111", H: "#d7dce6", M: "#8c94a2", D: "#5a606e", r: "#3c3e46" };
// TWISTED CORAL PEAKS: corals growing out of the sand (the seaweed has two frames so it sways)
const CORALS = [
  ["P..P..P", "P..P..P", ".P.P.P.", ".PPPPP.", "...P...", "...P...", "..DDD.."],
  ["O.....O", "O..O..O", "O..O..O", "OO.O.OO", ".O.O.O.", ".OOOOO.", "..ddd.."],
  [".V...V.", "V...V..", ".V...V.", "..V...V", ".V...V.", "V...V..", ".V...V."],
  ["V...V..", ".V...V.", "..V...V", ".V...V.", "V...V..", ".V...V.", "..V...V"],
];
// coral rock blocks to jump on
const REEF = [
  ".KKKKKKKKKKKKKK.",
  "KPPpPPPPpPPPpPPK",
  "KPpPPoPPPPpPPoPK",
  "KPPPPPPpPPPPPPPK",
  "KpPPoPPPPPoPPpPK",
  "KPPPPPpPPPPPPPPK",
  ".KKKKKKKKKKKKKK.",
];
const REEF_COLORS = { K: "#111111", P: "#ff8a7a", p: "#d85a50", o: "#7a2a30" };
const CORAL_COLORS = { P: "#ff6f91", D: "#b0305a", O: "#ff963c", d: "#aa501e", V: "#aa5aff" };
// GAF FIELD monsters: dark bats flying, red walking bombs (the fuse sparks)
const BAT = [
  ["G.......G", "GG.K.K.GG", "GgGKKKGgG", ".GKRKRKG.", "...KKK...", ".........", "........."],
  [".........", "...K.K...", "...KKK...", ".GKRKRKG.", "GgGKKKGgG", "GG.....GG", "G.......G"],
];
const BAT_COLORS = { G: "#2c2c34", g: "#5a5a68", K: "#0a0a0a", R: "#ff3040" };
const BOMB = ["....S..", "...K...", "..RRR..", ".RWRRR.", "RRKRKRR", "RRRRRRR", ".RRRRR.", ".K...K."];
const BOMB_COLORS = { S: "#ffc800", K: "#111111", R: "#e0283a", W: "#ffb0b8" };
const BOMB_COLORS_2 = { S: "#ff5a00", K: "#111111", R: "#e0283a", W: "#ffb0b8" };
// IPOD USER FIELD monsters: brown walkers with yellow horns, yellow drones that shoot red lasers
const HORNED = ["Y.....Y", ".Y...Y.", ".BBBBB.", "BWWBWWB", "BWKBWKB", "BBBBBBB", "BdddddB", ".K...K."];
const HORNED_COLORS = { Y: "#ffd23c", B: "#8a5a2b", d: "#5a3a1a", W: "#ffffff", K: "#111111" };
const DRONE = [
  ["KKK...KKK", "...K.K...", "..YYYYY..", ".YKRRRKY.", "YYYYYYYYY", ".y.K.K.y.", "...K.K..."],
  [".K.....K.", "...K.K...", "..YYYYY..", ".YKRRRKY.", "YYYYYYYYY", ".y.K.K.y.", "...K.K..."],
];
const DRONE_COLORS = { K: "#111111", Y: "#ffd000", y: "#c89a00", R: "#ff2832" };
const DRONE_COLORS_CHARGING = { K: "#111111", Y: "#ffd000", y: "#c89a00", R: "#ffffff" };
const LASER_SPEED = 150;
// GODS PSP FIELD monster colours (pink walkers, blue flyers)
const PSP_WALKER_COLORS = { G: "#ff5fc8", K: "#5a0a46", W: "#ffffff" };
const PSP_FLYER_COLORS = { G: "#6fc3ff", D: "#1e46b4", W: "#ffffff" };
// TWISTED CORAL PEAKS monsters: spiky sea urchins walking, seahorses swimming
const URCHIN = ["p.P.P.p", ".PPPPP.", "PPKPKPP", "pPPPPPp", "PRPKPRP", ".PPPPP.", "p.P.P.p"];
const URCHIN_COLORS = { P: "#8c5ad2", p: "#502d8c", K: "#111111", R: "#ff96be" };
const SEAHORSE = [
  ["....BBF..", "KBBBKBFF.", "....BBBF.", "...BLBB..", "...BLLB..", "....BBB..", ".b..BB...", "..bbB...."],
  ["....BBFF.", "KBBBKBF..", "....BBBFF", "...BLBB..", "...BLLB..", "....BBB..", ".b..BB...", "..bbB...."],
];
const SEAHORSE_COLORS = { B: "#5a8cff", b: "#2846aa", L: "#c8dcff", K: "#111111", F: "#ff8cc8" };
// TRIPPY FIELD monsters: green bacteria walking, blue dragonflies flying
const BACTERIA = ["G.GGG.G", ".GGGGG.", "GGWGWGG", "gGKGKGg", "GGRRRGG", ".gGGGg.", "g.g.g.g"];
const BACTERIA_COLORS = { G: "#3cd23c", g: "#147846", W: "#e6f5ff", K: "#0a1446", R: "#dc2832" };
const DRAGONFLY = [
  ["..CC.CC..", ".CCC.CCC.", "..CCCCC..", "KBBBBBbbb", ".........", ".........", "........."],
  [".........", ".........", "..CCCCC..", "KBBBBBbbb", ".CCC.CCC.", "..CC.CC..", "........."],
];
const DRAGONFLY_COLORS = { C: "#beebff", B: "#3c82ff", b: "#1e46b4", K: "#111111" };

function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  colors: Record<string, string>,
  scale = 1
) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const color = colors[rows[r][c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }
}

// Draws a picture at whole pixels (keeps pixel art sharp)
function drawImageSafe(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number) {
  ctx.drawImage(img, Math.round(x), Math.round(y));
}

// Small repeatable "random" number for background decorations
function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// A random ID for this browser, so names stay locked to the device that claimed them
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}

// Some browsers (private/incognito windows, strict privacy settings, some in-app
// browsers) block localStorage entirely. Everything that saves progress already
// wraps its calls in try/catch, so nothing crashes either way — this just lets us
// tell the player their unlocks won't stick around, instead of failing silently.
function storageAvailable() {
  try {
    const testKey = "__pinkmane_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function getOwnerCode() {
  try {
    return localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}

export default function SuperGame({ actionSignal, spinRef, fontFamily, muted }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<Partial<Record<OutfitId, HTMLImageElement>>>({});
  const levelSpritesRef = useRef<Record<string, HTMLImageElement>>({}); // outfits worn only in one level
  const shipRef = useRef<HTMLImageElement | null>(null); // your ghost ship drawing: /public/game/ghostship.png
  const fieldImagesRef = useRef<HTMLImageElement[]>([]); // the 7 cover-art field backgrounds
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const stuttersRef = useRef<HTMLAudioElement | null>(null); // the secret Stutters remix
  if (stuttersRef.current) stuttersRef.current.muted = muted; // follows the iPod mute button
  const [showGolden, setShowGolden] = useState(false); // the golden leaf pause screen
  const [goldBefore, setGoldBefore] = useState(false); // found it in an earlier game already
  const sfxOnRef = useRef(true);
  const sfxVolRef = useRef(1); // sound effects volume 0..1 (the slider under the speaker icon)
  const sfxDragRef = useRef(false); // dragging the slider right now
  const heldRef = useRef({ left: false, right: false, up: false }); // up = jump held (for the jetpack)
  const touchRef = useRef(0); // -1 holding left side, 1 holding right side
  const touchUpRef = useRef(false); // holding the middle of the screen (jetpack on phones)
  const wheelRef = useRef({ dir: 0, timer: 0 });

  // Scoreboard (shared online) and name entry
  const [showEntry, setShowEntry] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const boardRef = useRef<Entry[]>([]);
  const boardStatusRef = useRef<BoardStatus>("loading");
  const myNameRef = useRef("");
  const nameRef = useRef("");
  const savingRef = useRef(false);

  const state = useRef({
    mode: "home" as Mode,
    // Pink Levels
    gameMode: "infinite" as "infinite" | "levels",
    homeChoice: 0, // 0 = PINK RUN INFINITE, 1 = PINK LEVELS
    levelMode: false, // playing a level right now
    level: 1,
    levelPick: 0, // which stop on the level map you're standing on
    mapWalk: null as null | { pts: [number, number][]; d: number; to: number }, // walking between stops
    levelTime: 0, // seconds on the clock
    levelMs: 0, // your final time
    levelBest: {} as Record<string, number>, // best time per level (ms), from this browser
    newBest: false,
    doneAt: 0,
    bong: null as null | { x: number; y: number },
    signs: [] as { x: number; text: string }[],
    lboss: null as null | {
      kind: "leaf" | "snowman";
      x: number;
      y: number;
      vx: number;
      vy: number;
      hp: number;
      maxHp: number;
      hit: number;
      dive: number;
      diveTimer: number;
      dead: number;
      facing: number;
      dazed: number; // snowman: out of hits, jump on his head!
      speech: number; // seconds the speech bubble stays up
    },
    lbossState: "none" as "none" | "waiting" | "fight" | "done",
    outfit: "classic" as OutfitId,
    unlocked: ["classic"] as OutfitId[],
    coins: 0,
    selectIndex: 0,
    storageOk: true, // false if this browser blocks localStorage; progress just won't save
    x: 40,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    facing: 1,
    cam: 0,
    cols: [] as Column[],
    genGround: 8,
    genFlat: 0,
    pipeZones: [] as number[], // zones that already got their bonus pipe
    enemies: [] as Enemy[],
    leaves: [] as Leaf[],
    hearts: [] as Heart[],
    powerups: [] as PowerUp[],
    fireballs: [] as Fireball[],
    particles: [] as Particle[],
    testRun: false, // started with the ?zone= test shortcut
    voidPal: 0, // colour of the current SoundCloud Void visit
    bubbles: [] as { x: number; y: number; life: number; r: number; ph: number }[],
    smoke: [] as { x: number; y: number; vx: number; vy: number; r: number; life: number }[], // bong smoke
    lasers: [] as { x: number; y: number; vx: number; ty: number; life: number }[], // drone lasers (jump over them!) // breathing underwater (coral field)
    bubbleTimer: 0,
    popups: [] as Popup[],
    power: "none" as "none" | "fire" | "ice",
    ammo: 0,
    fireTime: 0,
    doubleJumps: 0,
    airJumped: false,
    // Secret area to the left of the start, with the jetpack
    eggCols: [] as Column[],
    eggOpen: true,
    jetItem: null as null | { x: number; y: number },
    jetpack: false,
    flying: false,
    jetFuel: JET_FUEL_MAX, // seconds of flight left in the tank; refills while grounded
    camY: 0, // vertical camera offset: follows you up when you jump/fly higher than the screen
    killStreak: 0, // consecutive stomps without the streak timer running out
    killStreakTimer: 0,
    pauseChoice: 0, // which option is highlighted on the pause menu (see PAUSE_OPTIONS)
    fromPause: false, // true while picking an outfit from the pause menu (OK / Esc goes back to the pause menu)
    lastVoid: -1, // which Void map you saw last, so you get a different one next time
    followShown: false, // the FOLLOW ME ON SOUNDCLOUD room has already shown up once this game
    // Golden leaf
    goldDone: false,
    goldLeaf: null as null | { x: number; y: number },
    stuttersOn: false,
    // Boss
    bossState: "none" as "none" | "placed" | "fight",
    bossCount: 0, // trolls beaten this game
    bossSpell: "fire" as PowerKind, // the spell you picked for this fight
    spellChoice: 0, // 0 = fire, 1 = ice (on the pick screen)
    zoneMarks: [] as { score: number; zone: number }[], // score when you entered each zone (for the progress line)
    bossCol: 0, // first column of the arena
    bossRefill: 0,
    boss: null as null | {
      x: number;
      y: number;
      vx: number;
      vy: number;
      hp: number;
      maxHp: number;
      hit: number; // flashes white after being hit
      jumpTimer: number;
      facing: number;
      dead: number; // counts down while he's falling apart
      kind: "troll" | "giant";
      dazed: number; // giant only: >0 while he's down and waiting for the finishing stomp
    },
    hinted: [] as string[], // which "how to use it" hints were already shown this game
    hintText: "",
    hintTime: 0,
    auraTimer: 0,
    zoneShown: 0,
    flash: 0,
    flashText: "",
    // Bonus room (SoundCloud Void)
    inBonus: false,
    saved: null as null | {
      cols: Column[];
      enemies: Enemy[];
      leaves: Leaf[];
      hearts: Heart[];
      powerups: PowerUp[];
      cam: number;
      pipeCol: number;
    },
    pipeDir: 0 as 0 | 1 | -1, // 1 = going down into the void, -1 = coming out
    pipeTimer: 0,
    pipeCol: 0,
    score: 0,
    farthest: 0,
    bonus: 0,
    best: 0,
    lives: START_LIVES,
    invuln: 0,
    runAnim: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    hurtAt: 0,
    shake: 0,
  });

  // ---------- Sounds (made in code) ----------

  const getAudio = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const beep = (from: number, to: number, time: number, volume: number, type: OscillatorType = "square", delay = 0) => {
    if (mutedRef.current || !sfxOnRef.current || sfxVolRef.current <= 0) return;
    volume *= sfxVolRef.current;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + time);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + time + 0.02);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + time + 0.04);
  };

  const playJump = () => beep(260, 640, 0.12, 0.045, "square");
  const playCoin = () => [988, 1319].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.06));
  // Some leaves are gold coins (same spot = always the same answer). Never in the Void or in words.
  const isCoin = (l: Leaf) =>
    l.coin === true ||
    (!l.small &&
      !state.current.inBonus &&
      !state.current.levelMode &&
      hash(Math.floor(l.x) * 7 + Math.floor(l.y) * 13) < COIN_CHANCE);
  const playLeaf = () => {
    beep(988, 988, 0.05, 0.045);
    beep(1319, 1319, 0.1, 0.045, "square", 0.05);
  };
  const playStomp = () => beep(500, 120, 0.12, 0.07, "square");
  const playHurt = () => beep(500, 70, 0.5, 0.08, "sawtooth");
  const playBump = () => beep(180, 120, 0.08, 0.07, "square");
  const playPowerAppear = () => [330, 440, 554, 659].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.05));
  const playPowerUp = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f * 1.01, 0.08, 0.055, "square", i * 0.06));
  const playFireball = () => beep(900, 300, 0.07, 0.035, "sawtooth");
  const playPowerDown = () => beep(700, 200, 0.35, 0.07, "square");
  const playEmpty = () => beep(140, 110, 0.05, 0.05, "square");
  const playIce = () => beep(1600, 2400, 0.08, 0.03, "triangle");
  const playDoubleJump = () => beep(500, 1100, 0.1, 0.045, "triangle");

  // ---------- The secret Stutters track ----------

  // Starts the remix (and asks the page to pause your music while it plays)
  const startStutters = () => {
    const s = state.current;
    if (s.stuttersOn) return;
    try {
      if (!stuttersRef.current) {
        stuttersRef.current = new Audio(STUTTERS_TRACK);
        stuttersRef.current.loop = true;
        stuttersRef.current.volume = 0.8;
      }
      const a = stuttersRef.current;
      a.muted = mutedRef.current;
      a.currentTime = 0;
      window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "pause" }));
      a.play().catch(() => {});
      s.stuttersOn = true;
    } catch {}
  };

  // Stops it and lets your music carry on
  const stopStutters = () => {
    const s = state.current;
    if (!s.stuttersOn) return;
    s.stuttersOn = false;
    try {
      stuttersRef.current?.pause();
      window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "resume" }));
    } catch {}
  };

  // Closing the golden leaf screen (with the link button or skip)
  const closeGolden = (openLink: boolean) => {
    const s = state.current;
    if (openLink && STUTTERS_LINK) window.open(STUTTERS_LINK, "_blank", "noopener,noreferrer");
    setShowGolden(false);
    if (s.mode === "golden") s.mode = "running";
    s.flash = 3;
    s.flashText = "SHOUT OUT STUTTERS!";
    s.invuln = Math.max(s.invuln, 0.5);
  };
  const playCrumble = () => beep(300, 90, 0.2, 0.05, "sawtooth");
  const playHeart = () => [659, 784, 988, 1319].forEach((f, i) => beep(f, f, 0.09, 0.055, "triangle", i * 0.07));
  const playPipe = () => [520, 390, 260, 180].forEach((f, i) => beep(f, f * 0.9, 0.08, 0.05, "square", i * 0.08));
  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current && sfxOnRef.current && sfxVolRef.current > 0) {
      sound.volume = sfxVolRef.current;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  // Sound effects volume (0..1). Moving the slider up from 0 also turns the sounds back on.
  const setSfxVolume = (v: number) => {
    const vol = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
    sfxVolRef.current = vol;
    if (vol > 0 && !sfxOnRef.current) sfxOnRef.current = true;
    try {
      localStorage.setItem(SFX_VOL_KEY, String(vol));
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // ---------- Scoreboard ----------

  const loadBoard = async (game = "super") => {
    boardStatusRef.current = "loading";
    try {
      const res = await fetch(`/api/scores?game=${game}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      let scores: { name: string; score: number }[] = Array.isArray(data.scores) ? data.scores : [];
      // A level board only holds times (LEVEL_TIME_BASE - ms). If the server hands back something else
      // (an old server that doesn't know the level boards yet), ignore it instead of showing nonsense times.
      if (game !== "super") scores = scores.filter((e) => e.score > LEVEL_TIME_BASE - 3600000 && e.score < LEVEL_TIME_BASE);
      boardRef.current = scores;
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
    if (state.current.testRun) return false; // test runs (?zone=...) never go on the scoreboard
    if (boardStatusRef.current !== "ok" || score < 10) return false;
    const b = boardRef.current;
    return b.length < 10 || score > b[b.length - 1].score;
  };

  const submitName = async () => {
    const s = state.current;
    const clean = nameRef.current.trim();
    if (clean.length < 2) {
      setMessage("NAME TOO SHORT");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: s.levelMode ? levelGameId(s.level) : "super",
          name: clean,
          score: s.levelMode ? LEVEL_TIME_BASE - s.levelMs : Math.floor(s.score),
          runTime: s.levelMode ? s.levelTime + 1 : s.runTime,
          device: getDeviceId(),
          ownerCode: getOwnerCode(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Explain what the scoreboard said, in plain words
        const why: Record<string, string> = {
          "name reserved": "PINKMANE IS RESERVED, PICK ANOTHER NAME",
          "beat their score to take this name": "THAT NAME HAS A HIGHER SCORE - BEAT IT TO TAKE IT",
          "slow down": "WAIT 10 SECONDS, THEN TRY AGAIN",
          "pick another name": "PICK ANOTHER NAME",
          "score not valid": "SCORE COULD NOT BE CHECKED",
          offline: "SCOREBOARD IS OFFLINE",
        };
        const err = String(data.error || "");
        setMessage(why[err] ?? (err || "COULD NOT SAVE").toUpperCase());
        return;
      }
      boardRef.current = Array.isArray(data.scores) ? data.scores : boardRef.current;
      myNameRef.current = data.name || clean;
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {}
      setShowEntry(false);
      s.mode = "board";
      s.deadAt = s.t;
    } catch {
      setMessage("COULD NOT SAVE");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const skipEntry = () => {
    const s = state.current;
    setShowEntry(false);
    setMessage("");
    s.mode = "board";
    s.deadAt = s.t;
  };

  // ---------- Level ----------

  const makeCol = (ground: number, zone: number, extra: Partial<Column> = {}): Column => ({
    ground,
    block: -1,
    block2: -1,
    bonus: -1,
    used: false,
    bump: 0,
    line: -1,
    lineTh: 4,
    pipe: 0,
    pipeOut: false,
    pipeUsed: false,
    fragile: 0,
    crumble: -1,
    zone,
    ...extra,
  });

  const zoneOf = (i: number) => Math.floor(i / ZONE_LEN) % ZONE_NAMES.length;

  // Gets harder at 12k, 15k and 20k: faster monsters, and more of them
  const hardness = () => {
    const sc = state.current.score;
    if (sc >= 20000) return 1.6;
    if (sc >= 15000) return 1.35;
    if (sc >= 12000) return 1.15;
    return 1;
  };

  const addWalker = (i: number, ground: number, progress: number) => {
    state.current.enemies.push({
      kind: "walker",
      x: i * T,
      y: ground * T - 14,
      vx: -(28 + progress * 24) * hardness(),
      vy: 0,
      baseY: 0,
      phase: 0,
      alive: true,
      squash: 0,
    });
  };

  const addFlyer = (i: number, ground: number, progress: number) => {
    const baseY = Math.max(20, (ground - 3) * T + rand(-8, 8));
    state.current.enemies.push({
      kind: "flyer",
      x: i * T,
      y: baseY,
      vx: -(30 + progress * 22) * hardness(),
      vy: 0,
      baseY,
      phase: Math.random() * Math.PI * 2,
      alive: true,
      squash: 0,
    });
  };

  // Floating bricks: sometimes two floors, rarely with a bonus block (orange leaf inside)
  const addPlatforms = (zone: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const g = s.genGround;
    const len = 3 + Math.floor(Math.random() * 3);
    const row = g - 3;
    const twoFloors = g >= 7 && Math.random() < (zone === 1 ? 0.6 : 0.35);
    const bonusAt = Math.random() < 0.15 ? 1 + Math.floor(Math.random() * (len - 2)) : -1;
    for (let k = 0; k < len; k++) {
      const upper = twoFloors && k >= 1 && k < len - 1 ? row - 3 : -1;
      if (k === bonusAt) s.cols.push(makeCol(g, zone, { bonus: row, block2: upper }));
      else s.cols.push(makeCol(g, zone, { block: row, block2: upper }));
      const top = upper >= 0 ? upper : row;
      // Very rarely a heart instead of a leaf
      if (Math.random() < 0.02) {
        s.hearts.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 2, taken: false });
      } else if (Math.random() < (upper >= 0 ? 0.8 : 0.5)) {
        s.leaves.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 1, taken: false });
      }
    }
  };

  // A wide pit with thin lines to hop across. The farther you go, the shorter and thinner they get.
  const addLineBridge = (zone: number, progress: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const gapW = 6 + Math.floor(Math.random() * 4);
    const lineLen = Math.max(1, 3 - Math.floor(progress * 3));
    const th = Math.max(2, 5 - Math.floor(progress * 4));
    // After 10k the lines vanish a few seconds after you touch them (faster after 15k)
    const fragile = s.score >= 15000 ? 0.6 : s.score >= 10000 ? 1.3 : 0;
    for (let k = 0; k < gapW; k++) s.cols.push(makeCol(-1, zone));
    let row = s.genGround - 2;
    let o = 1;
    while (o + lineLen <= gapW - 1) {
      for (let k = 0; k < lineLen; k++) {
        const c = s.cols[i0 + o + k];
        c.line = row;
        c.lineTh = th;
        c.fragile = fragile;
      }
      if (Math.random() < 0.5) s.leaves.push({ x: (i0 + o) * T + 1, y: (row - 1) * T + 1, taken: false });
      o += lineLen + 1 + (Math.random() < progress ? 1 : 0);
      row = Math.max(3, Math.min(s.genGround - 1, row + Math.floor(rand(-1, 1.99))));
    }
  };

  // A pipe down into the SoundCloud Void (one per zone)
  const addPipe = (zone: number) => {
    const s = state.current;
    const g = s.genGround;
    const top = g - 2;
    s.cols.push(makeCol(g, zone));
    s.cols.push(makeCol(top, zone, { pipe: 1 }));
    s.cols.push(makeCol(top, zone, { pipe: 2 }));
    s.cols.push(makeCol(g, zone));
  };

  // Builds the level a bit ahead of the camera. Gets harder the farther you go.
  const generateUpTo = (col: number) => {
    const s = state.current;
    if (s.inBonus || s.levelMode) return; // levels are hand-made, nothing random gets added
    while (s.cols.length <= col) {
      const i = s.cols.length;
      const zone = zoneOf(i);
      const zoneIndex = Math.floor(i / ZONE_LEN);
      const progress = Math.min(1, i / 900); // reaches full difficulty after ~900 tiles

      // Safe start, and a calm flat bit at the start of every new zone
      if (i < 18 || i % ZONE_LEN < 5) {
        if (i >= 18 && i % ZONE_LEN === 0) s.genGround = 8;
        s.cols.push(makeCol(i < 18 ? 8 : s.genGround, zone));
        continue;
      }

      if (s.genFlat > 0) {
        s.genFlat -= 1;
        s.cols.push(makeCol(s.genGround, zone));
        const more = hardness();
        if (s.genFlat > 1 && zone !== Z_CLOUDS && Math.random() < (0.05 + progress * 0.09 + (zone === 1 ? 0.03 : 0)) * more) {
          addWalker(i, s.genGround, progress);
        }
        if (progress > 0.06 && Math.random() < (0.015 + progress * 0.035 + (zone === Z_CLOUDS || zone === Z_TREES ? 0.03 : 0)) * more) {
          addFlyer(i, s.genGround, progress);
        }
        continue;
      }

      // The troll's arena: a flat screen-wide floor with two bonus blocks (they refill during the fight)
      if (s.bossState === "none" && s.score >= BOSS_EVERY * (s.bossCount + 1) - 300) {
        s.bossState = "placed";
        s.genGround = 8;
        for (let k = 0; k < 3; k++) s.cols.push(makeCol(8, zoneOf(s.cols.length)));
        s.bossCol = s.cols.length;
        for (let k = 0; k < BOSS_ARENA; k++) {
          const c = makeCol(8, zoneOf(s.cols.length));
          if (k === 4 || k === 11) c.bonus = 5;
          if (k === 7 || k === 8) c.block = 4;
          s.cols.push(c);
        }
        s.genFlat = 4;
        continue;
      }

      // Bonus pipe halfway through each zone
      if (i % ZONE_LEN > 60 && !s.pipeZones.includes(zoneIndex)) {
        s.pipeZones.push(zoneIndex);
        addPipe(zone);
        s.genFlat = 3;
        continue;
      }

      const r = Math.random();
      const lineChance = progress < 0.1 ? 0 : zone === Z_CLOUDS ? 0.3 : zone === Z_SMOKE ? 0.2 : 0.14;

      if (r < lineChance) {
        addLineBridge(zone, progress);
        s.genFlat = 3 + Math.floor(Math.random() * 3);
        continue;
      }

      if (zone === 2) {
        // ROOFTOPS: narrow pillars at different heights with gaps between
        if (r < 0.75) {
          const count = 3 + Math.floor(Math.random() * 4);
          for (let k = 0; k < count; k++) {
            const gap = Math.random() < 0.35 + progress * 0.3 ? 2 : 1;
            for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
            let delta = Math.floor(rand(-2, 2.99));
            if (gap === 2 && delta < -1) delta = -1;
            s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
            const width = Math.random() < 0.35 ? 1 : 2;
            for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
            if (Math.random() < 0.3) {
              s.leaves.push({ x: (s.cols.length - 1) * T + 1, y: (s.genGround - 2) * T, taken: false });
            }
          }
        } else {
          addPlatforms(zone);
        }
        s.genFlat = 3 + Math.floor(Math.random() * 4);
        continue;
      }

      if (zone === Z_TREES && r < lineChance + 0.3) {
        // TWISTED TREES: a gap with a crooked branch floating in the middle
        const gapW = 3 + Math.floor(Math.random() * (progress > 0.5 ? 3 : 2));
        const i0 = s.cols.length;
        for (let k = 0; k < gapW; k++) s.cols.push(makeCol(-1, zone));
        const mid = i0 + Math.floor(gapW / 2) - 1;
        const row = s.genGround - 1 - Math.floor(Math.random() * 2);
        s.cols[mid].block = row;
        s.cols[mid + 1].block = row;
        if (Math.random() < 0.6) s.leaves.push({ x: mid * T + 9, y: (row - 1) * T + 1, taken: false });
        const delta = Math.floor(rand(-1, 1.99));
        s.genGround = Math.max(6, Math.min(8, s.genGround + delta));
        s.genFlat = 3 + Math.floor(Math.random() * 3);
        continue;
      }

      if (zone === Z_CLOUDS || zone === Z_SMOKE) {
        // PINK CLOUDS: fluffy islands floating in the sky
        // SMOKE OCEAN: puffs of smoke floating on a sea of smoke
        const count = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k++) {
          const gap = 1 + Math.floor(Math.random() * (progress > 0.5 ? 3 : 2));
          for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
          let delta = Math.floor(rand(-1, 1.99));
          if (gap >= 2 && delta < 0) delta = 0;
          s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
          const width = 2 + Math.floor(Math.random() * 4);
          const start = s.cols.length;
          for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
          if (Math.random() < 0.5) {
            s.leaves.push({ x: (start + Math.floor(width / 2)) * T + 1, y: (s.genGround - 2) * T, taken: false });
          }
        }
        s.genFlat = 2 + Math.floor(Math.random() * 3);
        continue;
      }

      if (r < lineChance + 0.24 + progress * 0.12) {
        // A pit, 2 to 3 tiles wide
        const width = Math.random() < 0.3 + progress * 0.4 ? 3 : 2;
        for (let k = 0; k < width; k++) s.cols.push(makeCol(-1, zone));
        if (Math.random() < 0.5) {
          s.leaves.push({ x: (i + width / 2) * T - 7, y: (s.genGround - 3) * T, taken: false });
        }
      } else if (r < (zone === 1 ? 0.62 : 0.5)) {
        // Step up or down (SPEAKER HILLS: bigger steps)
        const size = zone === 1 && Math.random() < 0.5 ? 2 : 1;
        const next = Math.max(zone === 1 ? 5 : 6, Math.min(8, s.genGround + (Math.random() < 0.5 ? -size : size)));
        s.genGround = next;
        s.cols.push(makeCol(next, zone));
      } else {
        addPlatforms(zone);
      }
      s.genFlat = 3 + Math.floor(Math.random() * (7 - progress * 3));
    }
  };

  // Spells a word with small weed leaves. x, y = top-left corner in pixels. Returns the width.
  const spellLeaves = (leaves: Leaf[], text: string, x: number, y: number) => {
    let cx = x;
    for (const ch of text) {
      if (ch === " ") {
        cx += 16;
        continue;
      }
      const glyph = LEAF_FONT[ch];
      if (!glyph) continue;
      for (let r = 0; r < glyph.length; r++) {
        for (let c = 0; c < glyph[r].length; c++) {
          if (glyph[r][c] === "#") leaves.push({ x: cx + c * 8, y: y + r * 8, taken: false, small: true });
        }
      }
      cx += (glyph[0].length + 1) * 8;
    }
    return cx - x;
  };

  const textWidth = (text: string) => {
    let w = 0;
    for (const ch of text) w += ch === " " ? 16 : ((LEAF_FONT[ch]?.[0].length ?? 0) + 1) * 8;
    return w;
  };

  // The bonus room: SoundCloud Void. There are several different rooms, you get a random one
  // (never the same one twice in a row). Each has a pipe out at the end.
  const VOID_MAPS = 5;
  const buildVoid = (which: number) => {
    const cols: Column[] = [];
    const leaves: Leaf[] = [];
    const hearts: Heart[] = [];

    // Empty room: walls at both ends, floor at row 8, and the pipe out near the end
    const room = (len: number) => {
      for (let i = 0; i < len; i++) {
        if (i === 0 || i === len - 1) cols.push(makeCol(0, VOID_ZONE));
        else cols.push(makeCol(8, VOID_ZONE));
      }
      for (const [k, half] of [
        [len - 4, 1],
        [len - 3, 2],
      ]) {
        cols[k].ground = 6;
        cols[k].pipe = half;
        cols[k].pipeOut = true;
      }
    };
    const floorLeaves = (from: number, to: number) => {
      for (let i = from; i < to; i++) leaves.push({ x: i * T + 1, y: 7 * T + 1, taken: false });
    };

    if (which === 1) {
      // THE STAIRS: a staircase up to the heart and back down
      const len = 38;
      room(len);
      const steps = [7, 6, 5, 4, 3, 3, 4, 5, 6, 7];
      steps.forEach((row, k) => {
        for (let j = 0; j < 2; j++) {
          const i = 6 + k * 2 + j;
          cols[i].block = row;
          leaves.push({ x: i * T + 1, y: (row - 1) * T + 1, taken: false });
        }
      });
      floorLeaves(2, 6);
      floorLeaves(27, len - 5);
      hearts.push({ x: 15 * T + 9, y: 1 * T + 4, taken: false });
    } else if (which === 2) {
      // FOLLOW ME ON SOUNDCLOUD! spelled in leaves, jump through the letters to grab them
      const text = "FOLLOW ME ON SOUNDCLOUD!";
      const len = Math.ceil(textWidth(text) / T) + 14;
      room(len);
      spellLeaves(leaves, text, 4 * T, 56);
      // a thin line near the end with the heart on it
      for (let i = len - 9; i <= len - 7; i++) {
        cols[i].line = 4;
        cols[i].lineTh = 3;
      }
      hearts.push({ x: (len - 8) * T + 1, y: 3 * T + 2, taken: false });
    } else if (which === 3) {
      // ZIGZAG: thin lines going up and down like a sound wave
      const len = 40;
      room(len);
      const rows = [6, 5, 4, 3, 2, 3, 4, 5, 6];
      rows.forEach((row, k) => {
        for (let j = 0; j < 3; j++) {
          const i = 5 + k * 3 + j;
          cols[i].line = row;
          cols[i].lineTh = 3;
          leaves.push({ x: i * T + 1, y: (row - 1) * T + 1, taken: false });
        }
      });
      floorLeaves(2, len - 5);
      hearts.push({ x: 18 * T + 1, y: 1 * T + 4, taken: false });
    } else if (which === 4) {
      // Two lines of words: FOLLOW ME up on a ledge, ON SOUNDCLOUD down below
      const low = "ON SOUNDCLOUD";
      const high = "FOLLOW ME";
      const len = Math.ceil(textWidth(low) / T) + 12;
      room(len);
      spellLeaves(leaves, low, 4 * T, 80);
      const hx = 4 * T + Math.floor((textWidth(low) - textWidth(high)) / 2 / 8) * 8;
      spellLeaves(leaves, high, hx, 16);
      // the ledge under FOLLOW ME, with brick steps up to it
      const l0 = Math.floor(hx / T) - 1;
      const l1 = Math.ceil((hx + textWidth(high)) / T);
      for (let i = l0; i <= l1; i++) {
        cols[i].line = 4;
        cols[i].lineTh = 3;
      }
      cols[l0 - 2].block = 6;
      cols[l0 - 3].block = 6;
      hearts.push({ x: (l1 + 2) * T + 1, y: 5 * T + 4, taken: false });
      cols[l1 + 2].block = 6;
    } else {
      // THE CLASSIC: bricks, a thin line up high and a wave of leaves
      const len = 36;
      room(len);
      for (let i = 8; i <= 12; i++) cols[i].block = 5;
      for (let i = 20; i <= 24; i++) cols[i].block = 5;
      for (let i = 14; i <= 18; i++) {
        cols[i].line = 3;
        cols[i].lineTh = 3;
      }
      floorLeaves(3, len - 6);
      for (let i = 8; i <= 12; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
      for (let i = 20; i <= 24; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
      for (let i = 14; i <= 18; i++) leaves.push({ x: i * T + 1, y: 2 * T + 1, taken: false });
      for (let i = 3; i < 7; i++) leaves.push({ x: i * T + 1, y: (5 - Math.abs(i - 5)) * T, taken: false });
      hearts.push({ x: 16 * T + 1, y: 1 * T + 4, taken: false });
    }
    return { cols, leaves, hearts };
  };

  // The secret area left of the start: flat ground, a sign, and the jetpack on a little brick shelf
  const buildEgg = () => {
    const cols: Column[] = [];
    for (let k = 0; k < EGG_COLS; k++) cols.push(makeCol(8, 0)); // index 0 = column -1, 1 = column -2 ...
    cols[12].block = 6; // column -13
    cols[13].block = 6; // column -14
    return cols;
  };

  const colAt = (col: number): Column => {
    const s = state.current;
    if (s.inBonus) return s.cols[col] || makeCol(0, VOID_ZONE);
    if (col < 0) return s.eggCols[-col - 1] || makeCol(0, 0); // secret area, then a wall
    generateUpTo(col + 2);
    return s.cols[col] || makeCol(0, LEVEL_ZONE); // past the end of a level: a wall
  };

  // Ground and bonus blocks are solid. Bricks and thin lines are "one-way": you land on them from above.
  const solidAt = (px: number, py: number) => {
    const col = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (row < 0) return false;
    if (row >= ROWS) return false;
    const c = colAt(col);
    if (c.bonus >= 0 && row === c.bonus) return true;
    return c.ground >= 0 && row >= c.ground;
  };

  const oneWayTopsAt = (px: number) => {
    const c = colAt(Math.floor(px / T));
    const tops: number[] = [];
    if (c.block >= 0) tops.push(c.block * T);
    if (c.block2 >= 0) tops.push(c.block2 * T);
    if (c.line >= 0) tops.push(c.line * T);
    return tops;
  };

  // Is anything solid inside this box?
  const boxHits = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy += 8) {
      for (let xx = x; xx < x + w; xx += 8) {
        if (solidAt(xx, yy)) return true;
      }
      if (solidAt(x + w - 0.01, yy)) return true;
    }
    for (let xx = x; xx < x + w; xx += 8) if (solidAt(xx, y + h - 0.01)) return true;
    return solidAt(x + w - 0.01, y + h - 0.01);
  };

  const groundYAt = (col: number) => {
    const c = colAt(col);
    return c.ground >= 0 && c.pipe === 0 ? c.ground * T : -1;
  };

  const placeOnGroundNear = (x: number) => {
    const s = state.current;
    let col = Math.max(0, Math.floor(x / T));
    for (let k = 0; k < 40; k++) {
      const gy = groundYAt(col + k);
      const gy2 = groundYAt(col + k + 1);
      if (gy >= 0 && gy2 >= 0 && gy === gy2) {
        col = col + k;
        s.x = col * T;
        s.y = gy - SPRITE_H;
        break;
      }
    }
    s.vx = 0;
    s.vy = 0;
    for (const e of s.enemies) if (Math.abs(e.x - s.x) < 60) e.alive = false;
  };

  const newGame = () => {
    const s = state.current;
    s.inBonus = false;
    s.saved = null;
    s.cols = [];
    s.enemies = [];
    s.leaves = [];
    s.hearts = [];
    s.powerups = [];
    s.fireballs = [];
    s.particles = [];
    s.bubbles = [];
    s.smoke = [];
    s.lasers = [];
    s.popups = [];
    s.pipeZones = [];
    s.power = "none";
    s.ammo = 0;
    s.fireTime = 0;
    s.doubleJumps = 0;
    s.airJumped = false;
    s.hinted = [];
    s.hintTime = 0;
    s.eggCols = buildEgg();
    s.eggOpen = true;
    s.jetItem = { x: -14 * T + 7, y: 6 * T - 18 };
    s.jetpack = false;
    s.flying = false;
    s.jetFuel = JET_FUEL_MAX;
    s.camY = 0;
    s.killStreak = 0;
    s.killStreakTimer = 0;
    s.pauseChoice = 0;
    s.followShown = false;
    s.goldDone = false;
    s.goldLeaf = null;
    stopStutters();
    s.bossState = "none";
    s.bossCount = 0;
    s.boss = null;
    s.bossRefill = 0;
    s.zoneMarks = [{ score: 0, zone: 0 }];
    // reset the score first: the level builder looks at it (the old score made the troll appear right away)
    s.score = 0;
    s.farthest = 0;
    s.bonus = 0;
    s.zoneShown = 0;
    s.flash = 0;
    s.genGround = 8;
    s.genFlat = 0;
    generateUpTo(40);
    s.x = 40;
    s.y = 8 * T - SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.cam = 0;
    s.facing = 1;
    s.score = 0;
    s.farthest = 0;
    s.bonus = 0;
    s.lives = START_LIVES;
    s.invuln = 0;
    s.runTime = 0;
    s.testRun = false;
    s.levelMode = false;
    s.levelTime = 0;
    s.bong = null;
    s.signs = [];
    s.lboss = null;
    s.lbossState = "none";

    // Test shortcut: start right at the zone from the address bar (?zone=...), localhost only
    const tz = testStartZone();
    if (tz > 0) {
      const col0 = tz * ZONE_LEN;
      generateUpTo(col0 + 40);
      let c = col0 + 1;
      while (c < col0 + 30 && (colAt(c).ground < 0 || colAt(c).pipe)) c++;
      s.x = c * T;
      s.y = colAt(c).ground * T - SPRITE_H;
      s.cam = s.x - 40;
      s.farthest = s.x;
      s.eggOpen = false;
      s.zoneShown = tz;
      s.zoneMarks = [{ score: 0, zone: tz % ZONE_NAMES.length }];
      s.lives = MAX_LIVES;
      s.testRun = true;
      s.flash = 3;
      s.flashText = `TEST: ${ZONE_NAMES[tz]}`;
    }
  };

  const jump = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (s.onGround || s.coyote > 0) {
      s.vy = JUMP;
      s.onGround = false;
      s.coyote = 0;
      s.airJumped = false;
      playJump();
    } else if ((s.doubleJumps > 0 || s.bossState === "fight") && !s.airJumped) {
      // Double jump (turquoise leaf): one extra jump per time in the air. Free during a boss fight.
      if (s.bossState !== "fight") s.doubleJumps -= 1;
      s.airJumped = true;
      s.vy = JUMP * 0.92;
      burst(s.x + SPRITE_W / 2, s.y + SPRITE_H, 12, TURQ, 50);
      playDoubleJump();
    }
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power * 1.4, power * 0.4),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.4, 1.0),
      });
    }
  };

  const popup = (x: number, y: number, text: string) => {
    state.current.popups.push({ x, y, text, life: 0.9 });
  };

  // Do you have shots right now? (fire needs time left on its timer, ice doesn't have a timer)
  const hasFire = () => {
    const s = state.current;
    if (s.power === "fire") return s.ammo > 0 && s.fireTime > 0;
    if (s.power === "ice") return s.ammo > 0;
    return false;
  };

  const showHint = (key: string, text: string) => {
    const s = state.current;
    if (s.hinted.includes(key)) return;
    s.hinted.push(key);
    s.hintText = text;
    s.hintTime = 4; // seconds the hint stays up
  };

  // Shoot one fireball (F / X / ↓, or the handheld's fire button)
  const shoot = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (!hasFire()) return;
    if (s.fireballs.length >= 2) return;
    const ice = s.power === "ice";
    s.ammo -= 1;
    s.fireballs.push({
      x: s.x + (s.facing > 0 ? SPRITE_W - 4 : 0),
      y: s.y + (ice ? 24 : 16), // ice flies straight at waist height
      vx: s.facing * (ice ? ICE_SPEED : FIREBALL_SPEED),
      vy: ice ? 0 : 40,
      life: ice ? 1.2 : 1.6,
      ice,
    });
    if (ice) playIce();
    else playFireball();
    if (s.ammo <= 0) {
      s.power = "none";
      s.fireTime = 0;
    }
  };

  // Standing on a pipe and pressing down: into the SoundCloud Void (or back out)
  const pipeUnderFeet = () => {
    const s = state.current;
    if (!s.onGround) return -1;
    const cx = s.x + HB_X + HB_W / 2;
    const col = Math.floor(cx / T);
    const c = colAt(col);
    if (c.pipe === 0 || c.pipeUsed) return -1;
    const feet = s.y + HB_Y + HB_H;
    if (Math.abs(feet - c.ground * T) > 2) return -1;
    return c.pipe === 1 ? col : col - 1;
  };

  const down = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    const pipeCol = pipeUnderFeet();
    if (pipeCol >= 0) {
      s.mode = "pipe";
      s.pipeDir = s.inBonus ? -1 : 1;
      s.pipeTimer = 0.7;
      s.pipeCol = pipeCol;
      s.x = pipeCol * T + T - SPRITE_W / 2;
      s.vx = 0;
      s.vy = 0;
      playPipe();
      return;
    }
    shoot();
  };

  const enterVoid = () => {
    const s = state.current;
    s.saved = {
      cols: s.cols,
      enemies: s.enemies,
      leaves: s.leaves,
      hearts: s.hearts,
      powerups: s.powerups,
      cam: s.cam,
      pipeCol: s.pipeCol,
    };
    // Golden leaf time? Then it's one of the rooms without words (0, 1 or 3).
    // Rooms 2 and 4 spell out FOLLOW ME ON SOUNDCLOUD, so once you've seen either one
    // this game, they drop out of the pool (no reason to see the ad twice in one run).
    const gold = !s.goldDone && s.score >= GOLD_AT;
    let which: number;
    if (gold) {
      const plain = [0, 1, 3].filter((m) => m !== s.lastVoid);
      which = plain[Math.floor(Math.random() * plain.length)];
    } else {
      const base = s.followShown ? [0, 1, 3] : [0, 1, 2, 3, 4];
      const pool = base.filter((m) => m !== s.lastVoid);
      which = pool[Math.floor(Math.random() * pool.length)];
    }
    if (which === 2 || which === 4) s.followShown = true;
    s.lastVoid = which;
    // pick a colour for this visit
    let pal = Math.floor(Math.random() * VOID_PALETTES.length);
    if (pal === s.voidPal) pal = (pal + 1 + Math.floor(Math.random() * (VOID_PALETTES.length - 1))) % VOID_PALETTES.length;
    s.voidPal = pal;
    const room = buildVoid(which);
    // where the golden leaf floats in each room (high up, you have to work for it)
    const goldSpot: Record<number, [number, number]> = { 0: [22, 2], 1: [21, 2], 3: [27, 2] };
    s.goldLeaf = gold ? { x: goldSpot[which][0] * T + 1, y: goldSpot[which][1] * T } : null;
    s.inBonus = true;
    s.cols = room.cols;
    s.leaves = room.leaves;
    s.hearts = room.hearts;
    s.enemies = [];
    s.powerups = [];
    s.fireballs = [];
    s.cam = 0;
    s.camY = 0;
    s.x = 2 * T;
    s.y = -SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.flash = which === 4 ? 0 : 2; // the two-line word room skips the title so it doesn't cover FOLLOW ME
    s.flashText = "SOUNDCLOUD VOID";
    s.mode = "running";
  };

  const leaveVoid = () => {
    const s = state.current;
    const saved = s.saved;
    s.inBonus = false;
    s.goldLeaf = null;
    stopStutters(); // the Stutters track only plays inside the Void
    if (!saved) return;
    s.cols = saved.cols;
    s.enemies = saved.enemies;
    s.leaves = saved.leaves;
    s.hearts = saved.hearts;
    s.powerups = saved.powerups;
    s.fireballs = [];
    s.cam = saved.cam;
    s.camY = 0;
    const pc = s.cols[saved.pipeCol];
    const pc2 = s.cols[saved.pipeCol + 1];
    if (pc) pc.pipeUsed = true;
    if (pc2) pc2.pipeUsed = true;
    s.saved = null;
    // Pop out of the pipe you went into
    s.x = saved.pipeCol * T + T - SPRITE_W / 2;
    s.y = (pc ? pc.ground * T : 6 * T) - SPRITE_H - 2;
    s.vy = -260;
    s.invuln = 1;
    s.mode = "running";
  };

  // The fight starts once the camera reaches the arena: the screen locks and the troll walks in
  const startBoss = () => {
    const s = state.current;
    s.bossState = "fight";
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      e.alive = false;
      e.squash = 0;
    }
    // Every other one is the bigger, tougher giant instead of the regular troll
    const kind: "troll" | "giant" = s.bossCount % 2 === 1 ? "giant" : "troll";
    const hp = kind === "giant" ? GIANT_HP : BOSS_HP_START + s.bossCount * BOSS_HP_STEP;
    const bh = kind === "giant" ? GIANT_H : TR_H;
    s.boss = { x: s.cam + W - 50, y: 8 * T - bh, vx: 0, vy: 0, hp, maxHp: hp, hit: 0, jumpTimer: 2.2, facing: -1, dead: 0, kind, dazed: 0 };
    // Freeze and let the player pick a spell
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    s.spellChoice = 0;
    s.mode = "choose";
  };

  // How fast this troll is (each next one is faster)
  const bossSpeed = () => 1 + BOSS_SPEED_STEP * state.current.bossCount;

  // Picked a spell: you get it with a couple more shots than he needs, and free double jumps
  // ---------- Pink Levels ----------

  // Builds a level from its text map and puts you at the start
  const startLevel = (n: number) => {
    const def = LEVELS[n - 1];
    if (!def) return;
    newGame();
    const s = state.current;
    s.levelMode = true;
    s.level = n;
    s.levelTime = 0;
    s.eggCols = [];
    s.eggOpen = false;
    s.jetItem = null;
    s.goldLeaf = null;
    s.cols = [];
    s.enemies = [];
    s.leaves = [];
    s.hearts = [];
    s.signs = [];
    s.bong = null;
    s.lboss = null;
    s.lbossState = "none";
    s.zoneMarks = [{ score: 0, zone: 0 }];
    s.zoneShown = 999; // no zone names in levels
    const map = def.map;
    const len = Math.max(...map.map((r) => r.length));
    let sign = 0;
    for (let c = 0; c < len; c++) {
      let ground = -1;
      for (let r = 0; r < map.length; r++) {
        if (map[r][c] === "#") {
          ground = r;
          break;
        }
      }
      const col = makeCol(ground, def.zone ?? LEVEL_ZONE);
      for (let r = 0; r < map.length; r++) {
        const ch = map[r][c];
        const x = c * T;
        if (ch === "=") col.block = r;
        else if (ch === "-") {
          col.line = r;
          col.lineTh = 3;
        } else if (ch === "?") col.bonus = r;
        else if (ch === "L") s.leaves.push({ x: x + 1, y: r * T + 1, taken: false });
        else if (ch === "C") s.leaves.push({ x: x + 1, y: r * T + 1, taken: false, coin: true });
        else if (ch === "H") s.hearts.push({ x: x + 1, y: r * T + 2, taken: false });
        else if (ch === "w") addWalker(c, r + 1, 0);
        else if (ch === "f") {
          addFlyer(c, r + 3, 0);
          s.enemies[s.enemies.length - 1].baseY = r * T;
          s.enemies[s.enemies.length - 1].y = r * T;
        } else if (ch === "S") s.signs.push({ x, text: def.signs[sign++] ?? "" });
        else if (ch === "A") {
          s.bossCol = c - 1;
          s.lbossState = "waiting";
        } else if (ch === "B") s.bong = { x: x - 2, y: (r + 1) * T - BONG_H };
      }
      s.cols.push(col);
    }
    s.x = 2 * T;
    s.y = 8 * T - SPRITE_H;
    s.cam = 0;
    s.farthest = s.x;
    s.mode = "ready";
    loadBoard(levelGameId(n));
  };

  // Reads your best level times from this browser
  const loadLevelProgress = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LEVEL_PROGRESS_KEY) || "{}");
      if (raw && typeof raw === "object") state.current.levelBest = raw;
    } catch {}
  };

  // The camera reached the arena: lock the screen, bring in the evil leaf, pick a spell
  const startLevelBoss = () => {
    const s = state.current;
    const def = LEVELS[s.level - 1];
    s.lbossState = "fight";
    s.bossState = "fight"; // shares the arena rules: locked screen, free double jumps, keep your spell
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      e.alive = false;
      e.squash = 0;
    }
    const hp = def?.bossHp ?? 10;
    const kind = def?.boss ?? "leaf";
    s.lboss = {
      kind,
      x: s.cam + W - 60,
      y: kind === "snowman" ? 8 * T - SN_H : 30,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      hit: 0,
      dive: 0,
      diveTimer: 2.5,
      dead: 0,
      facing: -1,
      dazed: 0,
      speech: kind === "snowman" ? 3.5 : 0,
    };
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    s.spellChoice = 0;
    s.mode = "choose";
  };

  const hitLevelBoss = (ice: boolean) => {
    const s = state.current;
    const b = s.lboss;
    if (!b || b.dead > 0) return;
    const cx = b.x + (b.kind === "snowman" ? SN_W : EL_W) / 2;
    const cy = b.y + (b.kind === "snowman" ? SN_H : EL_H) / 2;
    b.hp -= 1; // every shot that touches it counts (ammo is tight)
    b.hit = 0.35;
    burst(cx, cy, 16, ice ? ICE : FIRE, 70);
    s.shake = 0.1;
    playStomp();
    if (b.hp <= 0 && b.kind === "snowman") {
      // out of hits: he's dizzy, finish him by jumping on his head
      b.hp = 0;
      b.dazed = SNOWMAN_DAZE;
      b.vx = 0;
      s.flash = 2;
      s.flashText = "NOW JUMP ON HIS HEAD!";
    } else if (b.hp <= 0) {
      b.dead = 1.6;
      popup(cx, b.y - 6, "BYE EVIL LEAF!");
      playTrollDeath();
    } else {
      popup(cx, b.y - 6, `${b.hp} LEFT`);
    }
  };

  // You touched the bong: stop the clock, save your time
  const finishLevel = () => {
    const s = state.current;
    s.levelMs = Math.round(s.levelTime * 1000);
    const key = String(s.level);
    const old = s.levelBest[key];
    s.newBest = !old || s.levelMs < old;
    if (s.newBest) {
      s.levelBest = { ...s.levelBest, [key]: s.levelMs };
      try {
        localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(s.levelBest));
      } catch {}
    }
    s.mode = "levelDone";
    s.doneAt = s.t;
    s.vx = 0;
    heldRef.current = { left: false, right: false, up: false };
    const b = s.bong;
    if (b) {
      // a big cloud of smoke rising out of the bong
      for (let i = 0; i < 26; i++) {
        s.smoke.push({ x: b.x + BONG_W / 2 + rand(-4, 4), y: b.y + rand(-2, 6), vx: rand(-14, 14), vy: rand(-34, -14), r: rand(2, 4), life: rand(1.6, 3) });
      }
    }
    playHeart();
  };

  const pickSpell = (choice: number) => {
    const s = state.current;
    if (s.mode !== "choose" || (!s.boss && !s.lboss)) return;
    const kind: PowerKind = choice === 1 ? "ice" : "fire";
    s.bossSpell = kind;
    s.power = kind;
    s.ammo = (s.boss ? s.boss.maxHp : s.lboss ? s.lboss.maxHp : 10) + BOSS_SPARE_SHOTS;
    s.fireTime = kind === "fire" ? 999 : 0; // no timer in a boss fight
    s.mode = "running";
    s.flash = 1.6;
    const bossLabel = s.boss?.kind === "giant" ? "GIANT" : "TROLL";
    s.flashText = s.lboss
      ? s.lboss.kind === "snowman"
        ? "SHOOT THE EVIL SNOWMAN!"
        : "SHOOT THE EVIL LEAF!"
      : s.bossCount === 0
        ? `FIGHT THE ${bossLabel}!`
        : `${bossLabel} #${s.bossCount + 1}!`;
    s.hinted = s.hinted.filter((h) => h !== "bossjump");
    showHint("bossjump", "FREE DOUBLE JUMPS HERE!");
    s.hintTime = 4;
    playPowerUp();
  };

  // ---------- Pause (Esc) ----------
  const pauseGame = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    s.mode = "paused";
    s.pauseChoice = 0;
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    touchUpRef.current = false;
    if (s.stuttersOn) stuttersRef.current?.pause();
  };
  const resumeGame = () => {
    const s = state.current;
    if (s.mode !== "paused") return;
    s.mode = "running";
    if (s.stuttersOn) stuttersRef.current?.play().catch(() => {});
  };
  // Leaves the game the same way the handheld's own Back button does
  const goHome = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
  };

  // ---------- Outfits ----------
  const unlockOutfit = (id: OutfitId) => {
    const s = state.current;
    if (s.unlocked.includes(id)) return;
    s.unlocked = [...s.unlocked, id];
    try {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify(s.unlocked));
    } catch {}
    s.flash = 2.5;
    s.flashText = `NEW OUTFIT: ${OUTFITS.find((o) => o.id === id)?.name ?? id.toUpperCase()}!`;
  };
  // Coins are just your lifetime grams total; added whenever a run ends
  const addCoins = (n: number) => {
    if (n <= 0) return;
    const s = state.current;
    s.coins += n;
    try {
      localStorage.setItem(COINS_KEY, String(s.coins));
    } catch {}
  };

  const playTrollDeath = () => {
    try {
      const a = new Audio(TROLL_DEATH_SOUND);
      a.volume = sfxVolRef.current;
      a.muted = mutedRef.current;
      const resume = () => window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "resume" }));
      a.addEventListener("ended", resume);
      a.addEventListener("error", resume);
      window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "pause" }));
      a.play().catch(resume);
    } catch {}
  };

  // A fireball or ice shot hits the troll
  const hitBoss = (ice: boolean) => {
    const s = state.current;
    const b = s.boss;
    if (!b || b.dead > 0 || b.dazed > 0) return;
    const isGiant = b.kind === "giant";
    const cx = b.x + (isGiant ? GIANT_W : TR_W) / 2;
    const cy = b.y + (isGiant ? GIANT_H : TR_H) / 2;
    if (b.hit > 0.3) {
      burst(cx, cy, 5, ice ? ICE : FIRE, 30);
      return;
    }
    b.hp -= 1;
    b.hit = 0.5;
    b.vx = -b.facing * 60;
    burst(cx, cy, 18, ice ? ICE : FIRE, 70);
    s.shake = 0.12;
    playStomp();
    if (b.hp <= 0) {
      if (isGiant) {
        // He's down, but shots alone won't finish him — you have to stomp his head
        b.dazed = GIANT_DAZE_TIME;
        b.vx = 0;
        s.shake = 0.2;
        popup(cx, b.y - 10, "STOMP HIM!");
      } else {
        b.dead = 1.6;
        popup(cx, b.y - 6, "BYE TROLL!");
        playTrollDeath();
      }
    } else {
      popup(cx, b.y - 6, `${b.hp} LEFT`);
    }
  };

  const hurt = (pit = false) => {
    const s = state.current;
    const inFight = s.bossState === "fight";
    if (hasFire() && !pit && !inFight) {
      // Getting hit while you have fire or ice only takes the power away
      burst(s.x + SPRITE_W / 2, s.y + 8, 16, s.power === "ice" ? ICE : FIRE, 60);
      s.power = "none";
      s.ammo = 0;
      s.fireTime = 0;
      s.invuln = 1.5;
      s.shake = 0.15;
      playPowerDown();
      return;
    }
    if (!inFight) {
      // (in a boss fight you keep your spell and lose a heart instead)
      s.power = "none";
      s.ammo = 0;
      s.fireTime = 0;
    }
    s.lives -= 1;
    s.shake = 0.3;
    burst(s.x + SPRITE_W / 2, s.y + SPRITE_H / 2, 34, BOOM, 100);
    playHurt();
    if (s.lives <= 0) {
      s.mode = "dying";
      s.deadAt = s.t;
      if (!s.levelMode && s.score > s.best) {
        s.best = Math.floor(s.score);
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    } else {
      s.mode = "hurt";
      s.hurtAt = s.t;
    }
  };

  const finishDeath = () => {
    const s = state.current;
    if (s.levelMode) {
      // no scoreboard for a lost level, just try again
      s.mode = "levelSelect";
      s.flash = 2;
      s.flashText = "TRY AGAIN!";
      return;
    }
    if (qualifies(Math.floor(s.score))) {
      s.mode = "entry";
      setMessage("");
      setShowEntry(true);
    } else {
      s.mode = "board";
      s.deadAt = s.t;
    }
  };

  // Called on OK / Enter / Space / tapping the middle of the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "home") {
      // The pink start screen: pick INFINITE or LEVELS, then your outfit
      s.gameMode = s.homeChoice === 1 ? "levels" : "infinite";
      if (s.gameMode === "infinite") {
        loadBoard("super");
        newGame();
      }
      s.mode = "select";
      return;
    }
    if (s.mode === "levelSelect") {
      if (s.mapWalk) return;
      if (LEVELS[s.levelPick]) startLevel(s.levelPick + 1);
      else {
        s.flash = 1.5;
        s.flashText = "COMING SOON";
      }
      return;
    }
    if (s.mode === "levelDone") {
      if (s.t - s.doneAt < 1) return;
      if (qualifies(LEVEL_TIME_BASE - s.levelMs)) {
        s.mode = "entry";
        setMessage("");
        setShowEntry(true);
      } else {
        s.mode = "board";
        s.deadAt = s.t;
      }
      return;
    }
    if (s.mode === "select") {
      const o = OUTFITS[s.selectIndex];
      if (!s.unlocked.includes(o.id) && o.id === "icy" && s.coins >= ICY_COST) {
        // buy it with gold coins
        s.coins -= ICY_COST;
        try {
          localStorage.setItem(COINS_KEY, String(s.coins));
        } catch {}
        unlockOutfit(o.id);
        playHeart();
      }
      if (s.unlocked.includes(o.id)) {
        s.outfit = o.id;
        try {
          localStorage.setItem(OUTFIT_KEY, o.id);
        } catch {}
        if (s.fromPause) {
          // came here from the pause menu: go back to it, the run is still waiting
          s.fromPause = false;
          s.mode = "paused";
          s.pauseChoice = 0;
        } else {
          s.mode = s.gameMode === "levels" ? "levelSelect" : "ready";
        }
      } else {
        s.flash = 1.2;
        s.flashText = `LOCKED \u2014 ${o.how}`;
      }
    } else if (s.mode === "golden") {
      closeGolden(false);
    } else if (s.mode === "choose") {
      pickSpell(s.spellChoice);
    } else if (s.mode === "paused") {
      const picked = PAUSE_OPTIONS[s.pauseChoice];
      if (picked === "RESTART") {
        // restart this level if you're in one, otherwise a fresh infinite run
        if (s.levelMode) startLevel(s.level);
        else newGame();
        s.mode = "running";
      } else if (picked === "PICK OUTFIT") {
        s.fromPause = true;
        const now = OUTFITS.findIndex((o) => o.id === s.outfit);
        if (now >= 0) s.selectIndex = now;
        s.mode = "select";
      } else if (picked === "GAME TYPE") {
        // back to the pink start screen: PINK RUN INFINITE or PINK LEVELS
        s.fromPause = false;
        s.homeChoice = s.gameMode === "levels" ? 1 : 0;
        s.mode = "home";
      } else if (picked === "HOME") {
        goHome();
      } else {
        resumeGame();
      }
    } else if (s.mode === "ready") {
      s.mode = "running";
    } else if (s.mode === "running") {
      jump();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      if (s.levelMode) {
        s.mode = "levelSelect"; // back to the list of levels
      } else {
        newGame();
        s.mode = "running";
      }
    }
  };

  // Bumping a bonus block from below: a flaming weed leaf pops out and slides away
  const bumpBlock = (col: number) => {
    const s = state.current;
    const c = colAt(col);
    c.bump = 0.15;
    if (c.used) {
      playBump();
      return;
    }
    c.used = true;
    // Fire is the most common, ice is rarer, double jump is the rarest
    const r = Math.random();
    const kind: PowerKind =
      s.bossState === "fight" ? s.bossSpell : r < 0.6 ? "fire" : r < 0.85 ? "ice" : "double";
    s.powerups.push({
      x: col * T + 1,
      y: (c.bonus - 1) * T + 2,
      vx: s.facing >= 0 ? 45 : -45,
      vy: -140,
      kind,
    });
    burst(col * T + 8, c.bonus * T, 8, FIRE, 40);
    playPowerAppear();
  };

  const KILL_STREAK_WINDOW = 1.2; // seconds you have to chain the next stomp
  const killEnemy = (e: Enemy, points: number) => {
    const s = state.current;
    e.alive = false;
    e.squash = 0.35;
    s.killStreak += 1;
    s.killStreakTimer = KILL_STREAK_WINDOW;
    // 2 = DOUBLE, 3 = TRIPLE, 4 = QUADRA, 5+ = PENTAKILL. Points get multiplied by the streak (max x5).
    const streak = Math.min(s.killStreak, 5);
    const finalPoints = points * streak;
    const names = ["", "", "DOUBLE KILL!", "TRIPLE KILL!", "QUADRA KILL!", "PENTAKILL!"];
    s.bonus += finalPoints;
    popup(e.x + 7, e.y - 4, streak >= 2 ? `+${finalPoints} ${names[streak]}` : `+${finalPoints}`);
    if (streak >= 3) {
      s.flash = 1.3;
      s.flashText = names[streak];
      [880, 1175, 1568].slice(0, streak - 1).forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.07));
    }
    burst(e.x + 7, e.y + 7, 12, e.kind === "flyer" ? [LIGHT_GREEN, DARK_GREEN, "#ffffff"] : ["#8a8a8a", "#ffffff", INK], 60);
    playStomp();
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.shake > 0) s.shake -= dt;
    if (s.flash > 0) s.flash -= dt;

    for (const p of s.particles) {
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    // bong smoke rises, spreads and fades
    for (const m of s.smoke) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 1 - dt * 0.8;
      m.r += dt * 4;
      m.life -= dt;
    }
    s.smoke = s.smoke.filter((m) => m.life > 0);
    if (s.mode === "levelSelect") updateMap(dt);

    // TWISTED CORAL PEAKS: bubbles come out of your mouth like you're breathing underwater
    if (s.mode === "running" && !s.inBonus && colAt(Math.floor((s.x + SPRITE_W / 2) / T)).zone === F_CORAL) {
      s.bubbleTimer -= dt;
      if (s.bubbleTimer <= 0) {
        s.bubbleTimer = rand(0.5, 1.1);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          s.bubbles.push({
            x: s.x + (s.facing > 0 ? SPRITE_W - 3 : 3) + rand(-1, 1),
            y: s.y + 15 - i * 4,
            life: rand(1.2, 2),
            r: i === 0 ? 2 : 1 + Math.round(Math.random()),
            ph: Math.random() * 6,
          });
        }
      }
    }
    for (const b of s.bubbles) {
      b.y -= 20 * dt;
      b.x += Math.sin(s.t * 4 + b.ph) * 8 * dt;
      b.life -= dt;
    }
    s.bubbles = s.bubbles.filter((b) => b.life > 0);
    for (const p of s.popups) {
      p.y -= 18 * dt;
      p.life -= dt;
    }
    s.popups = s.popups.filter((p) => p.life > 0);

    // Kill streak: stomping enemies back-to-back within this window keeps the streak alive
    if (s.killStreakTimer > 0) {
      s.killStreakTimer -= dt;
      if (s.killStreakTimer <= 0) s.killStreak = 0;
    }

    // Click wheel: turning it walks you that way for a moment
    const spin = spinRef.current;
    spinRef.current = 0;
    if (spin !== 0) {
      wheelRef.current.dir = spin > 0 ? 1 : -1;
      wheelRef.current.timer = 0.2;
    }
    if (wheelRef.current.timer > 0) {
      wheelRef.current.timer -= dt;
      if (wheelRef.current.timer <= 0) wheelRef.current.dir = 0;
    }

    if (s.mode === "dying") {
      if (s.t - s.deadAt > 3) finishDeath();
      return;
    }
    if (s.mode === "hurt") {
      if (s.t - s.hurtAt > 1.2) {
        placeOnGroundNear(s.cam + 48);
        if (s.boss && s.bossState === "fight") {
          s.boss.x = s.cam + W - 50; // the troll backs off so you get a fair restart
          s.boss.vx = 0;
        }
        if (s.lboss) {
          s.lboss.x = s.cam + W - 60;
          s.lboss.y = s.lboss.kind === "snowman" ? 8 * T - SN_H : 30;
          s.lboss.dive = 0;
        }
        s.invuln = 1.5;
        s.mode = "running";
      }
      return;
    }
    if (s.mode === "pipe") {
      // Sink into the pipe, then switch worlds
      s.y += 45 * dt;
      s.pipeTimer -= dt;
      if (s.pipeTimer <= 0) {
        if (s.pipeDir > 0) enterVoid();
        else leaveVoid();
      }
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;
    if (s.levelMode) s.levelTime += dt;
    if (!s.unlocked.includes("og") && s.score >= OG_SCORE_UNLOCK) unlockOutfit("og");
    if (s.invuln > 0) s.invuln -= dt;

    if (s.hintTime > 0) s.hintTime -= dt;

    // Fire power runs out when the timer bar is empty (ice has no timer)
    if (s.power === "fire" && s.fireTime > 0 && s.bossState !== "fight") {
      s.fireTime -= dt;
      if (s.fireTime <= 0) {
        s.fireTime = 0;
        s.ammo = 0;
        s.power = "none";
        playPowerDown();
      }
    }

    // Which way do you want to go
    let want = 0;
    if (heldRef.current.left || touchRef.current < 0) want -= 1;
    if (heldRef.current.right || touchRef.current > 0) want += 1;
    if (want === 0) want = wheelRef.current.dir;
    if (want !== 0) s.facing = want;

    const target = want * RUN;
    if (s.vx < target) s.vx = Math.min(target, s.vx + ACCEL * dt);
    if (s.vx > target) s.vx = Math.max(target, s.vx - ACCEL * dt);
    s.vy = Math.min(420, s.vy + GRAVITY * dt);

    // Jetpack: hold jump to fly, but only while there's fuel. Land to refuel.
    const wantsFly = s.jetpack && (heldRef.current.up || touchUpRef.current);
    s.flying = wantsFly && s.jetFuel > 0;
    if (s.flying) {
      s.jetFuel = Math.max(0, s.jetFuel - dt);
      s.vy = Math.max(JET_MAX_UP, s.vy - JET_THRUST * dt);
      if (Math.random() < 0.7) {
        s.particles.push({
          x: s.x + (s.facing > 0 ? 5 : SPRITE_W - 7),
          y: s.y + 27,
          vx: rand(-15, 15),
          vy: rand(40, 90),
          color: FIRE[Math.floor(Math.random() * 3)],
          life: rand(0.15, 0.3),
        });
      }
      if (s.jetFuel <= 0) popup(s.x + SPRITE_W / 2, s.y - 6, "OUT OF GAS!");
    } else if (s.jetpack && s.onGround) {
      s.jetFuel = Math.min(JET_FUEL_MAX, s.jetFuel + dt * JET_REFUEL_RATE);
    }

    // Move sideways, then up/down, stopping at solid tiles
    const hx = () => s.x + HB_X;
    const hy = () => s.y + HB_Y;
    s.x += s.vx * dt;
    if (s.x + HB_X < s.cam) s.x = s.cam - HB_X; // can't go back past the left edge
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vx > 0) s.x = Math.floor((hx() + HB_W) / T) * T - HB_W - HB_X - 0.01;
      else if (s.vx < 0) s.x = (Math.floor(hx() / T) + 1) * T - HB_X + 0.01;
      s.vx = 0;
    }
    const prevBottom = hy() + HB_H;
    s.y += s.vy * dt;
    s.onGround = false;
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vy > 0) {
        s.y = Math.floor((hy() + HB_H) / T) * T - HB_H - HB_Y - 0.01;
        s.onGround = true;
      } else {
        // Head hit something: if it's a bonus block, bump it
        const headRow = Math.floor(hy() / T);
        for (const fx of [hx() + HB_W / 2, hx() + 1, hx() + HB_W - 1]) {
          const col = Math.floor(fx / T);
          const c = colAt(col);
          if (c.bonus === headRow) {
            bumpBlock(col);
            break;
          }
        }
        s.y = (headRow + 1) * T - HB_Y + 0.01;
      }
      s.vy = 0;
    }
    // A generous safety ceiling — well above the old fixed wall, and high enough you can
    // fly for a good while, but bounded so the vertical camera below only ever has to
    // scroll a predictable, safe distance (keeps backgrounds fully covered, no edge showing).
    if (s.y < -260) {
      s.y = -260;
      if (s.vy < 0) s.vy = 0;
    }
    // Landing on bricks or thin lines from above
    if (!s.onGround && s.vy >= 0) {
      const bottom = hy() + HB_H;
      let landed = false;
      for (const fx of [hx() + 1, hx() + HB_W - 1]) {
        for (const top of oneWayTopsAt(fx)) {
          if (prevBottom <= top + 1 && bottom >= top) {
            s.y = top - HB_H - HB_Y - 0.01;
            s.vy = 0;
            s.onGround = true;
            landed = true;
            // Touched a vanishing line: the whole line starts blinking
            const col = Math.floor(fx / T);
            const c = colAt(col);
            if (c.fragile > 0 && c.crumble < 0 && c.line * T === top) {
              for (let k = col; colAt(k).line === c.line && colAt(k).fragile > 0; k--) colAt(k).crumble = c.fragile;
              for (let k = col + 1; colAt(k).line === c.line && colAt(k).fragile > 0; k++) colAt(k).crumble = c.fragile;
            }
            break;
          }
        }
        if (landed) break;
      }
    }
    if (s.onGround) {
      s.coyote = 0.09;
      s.airJumped = false;
    }
    else if (s.coyote > 0) s.coyote -= dt;

    if (Math.abs(s.vx) > 5 && s.onGround) s.runAnim += dt;

    // Camera follows you forward only (in the Void it stays inside the room)
    if (s.inBonus) {
      s.cam = Math.max(0, Math.min(s.cols.length * T - W, s.x - 110));
    } else if (s.bossState === "fight") {
      // Boss fight: the screen stays put, you can't leave until he's down
      s.cam = s.bossCol * T;
      if (s.x + HB_X + HB_W > s.cam + W) s.x = s.cam + W - HB_X - HB_W;
    } else if (s.eggOpen) {
      // At the very start you can also walk back left, into the secret area
      if (s.x - s.cam > 90) s.cam = s.x - 90;
      if (s.x - s.cam < 40) s.cam = Math.max(-EGG_COLS * T, s.x - 40);
      if (s.farthest > 30 * T) s.eggOpen = false; // once you've run on, the way back is gone
      generateUpTo(Math.floor((s.cam + W) / T) + 4);
    } else {
      s.cam = Math.max(s.cam, s.x - 90);
      generateUpTo(Math.floor((s.cam + W) / T) + 4);
      if (s.bossState === "placed" && s.cam >= s.bossCol * T) startBoss();
      if (s.levelMode) {
        s.cam = Math.min(s.cam, s.cols.length * T - W);
        if (s.x + HB_X + HB_W > s.cols.length * T) s.x = s.cols.length * T - HB_X - HB_W;
        if (s.lbossState === "waiting" && s.cam >= s.bossCol * T) startLevelBoss();
      }
    }

    // Vertical camera: when a jump or a jetpack flight takes you higher than the screen
    // normally shows, the screen scrolls up with you instead of an invisible ceiling
    // stopping you short. It eases back down once you're back near the ground.
    const VIEW_TOP_MARGIN = 24;
    const desiredCamY = Math.min(0, s.y - VIEW_TOP_MARGIN);
    s.camY += (desiredCamY - s.camY) * Math.min(1, dt * 6);
    if (Math.abs(s.camY - desiredCamY) < 0.05) s.camY = desiredCamY;

    // Score: distance + bonus
    if (!s.inBonus) s.farthest = Math.max(s.farthest, s.x);
    s.score = Math.floor(s.farthest / T) + s.bonus;

    // Picking up the secret jetpack
    const ji = s.jetItem;
    if (ji && hx() + HB_W > ji.x && hx() < ji.x + 18 && hy() + HB_H > ji.y && hy() < ji.y + 18) {
      s.jetItem = null;
      s.jetpack = true;
      s.bonus += 100;
      popup(ji.x + 9, ji.y - 4, "JETPACK!");
      showHint("jet", "HOLD SPACE TO FLY");
      burst(ji.x + 9, ji.y + 9, 22, [PINK, "#ffc800", "#ffffff"], 70);
      playPowerUp();
    }
    // The golden leaf: +500, the game pauses on the Stutters screen and his remix starts playing
    const gl = s.goldLeaf;
    if (gl && hx() + HB_W > gl.x && hx() < gl.x + 14 && hy() + HB_H > gl.y && hy() < gl.y + 14) {
      s.goldLeaf = null;
      s.goldDone = true;
      s.bonus += PTS_GOLD;
      s.score = Math.floor(s.farthest / T) + s.bonus;
      popup(gl.x + 7, gl.y - 4, `+${PTS_GOLD}`);
      burst(gl.x + 7, gl.y + 7, 34, ["#ffd700", "#fff3a0", "#b8860b", "#ffffff"], 90);
      playPowerUp();
      let before = false;
      try {
        before = localStorage.getItem(GOLD_KEY) === "1";
        localStorage.setItem(GOLD_KEY, "1");
      } catch {}
      setGoldBefore(before);
      heldRef.current = { left: false, right: false, up: false };
      touchRef.current = 0;
      s.vx = 0;
      startStutters();
      s.mode = "golden";
      setShowGolden(true);
      return;
    }

    // The jetpack runs out of fuel at 2000
    if (s.jetpack && s.score >= JET_UNTIL) {
      s.jetpack = false;
      s.flying = false;
      popup(s.x + SPRITE_W / 2, s.y - 6, "JETPACK EMPTY");
      burst(s.x + SPRITE_W / 2, s.y + 20, 16, ["#8a8a8a", "#ffffff", INK], 55);
      playPowerDown();
    }

    // Fell in a pit
    if (s.y > H + 10) {
      hurt(true);
      return;
    }

    // Zone name when you enter a new zone
    if (!s.inBonus && !s.levelMode) {
      const zoneIndex = Math.floor(Math.floor(s.x / T) / ZONE_LEN);
      if (zoneIndex > s.zoneShown) {
        s.zoneShown = zoneIndex;
        s.zoneMarks.push({ score: s.score, zone: zoneIndex % ZONE_NAMES.length });
        s.flash = 2;
        s.flashText = `ZONE ${zoneIndex + 1}: ${ZONE_NAMES[zoneIndex % ZONE_NAMES.length]}`;
      }
    }

    // Bonus block bounce animation, and vanishing lines counting down
    let crumbled = false;
    for (let col = Math.floor(s.cam / T); col <= Math.floor((s.cam + W) / T); col++) {
      const c = colAt(col);
      if (c.bump > 0) c.bump -= dt;
      if (c.crumble > 0) {
        c.crumble -= dt;
        if (c.crumble <= 0) {
          burst(col * T + 8, c.line * T, 8, [PINK, "#ffffff", DARK_PINK], 40);
          c.line = -1;
          c.crumble = -1;
          crumbled = true;
        }
      }
    }
    if (crumbled) playCrumble();

    // Flaming weed leaves slide along and bounce off walls
    for (const pu of s.powerups) {
      pu.vy = Math.min(300, pu.vy + GRAVITY * 0.7 * dt);
      pu.x += pu.vx * dt;
      const front = pu.vx > 0 ? pu.x + 14 : pu.x;
      if (solidAt(front, pu.y + 7)) pu.vx = -pu.vx;
      pu.y += pu.vy * dt;
      if (solidAt(pu.x + 7, pu.y + 14)) {
        pu.y = Math.floor((pu.y + 14) / T) * T - 14;
        pu.vy = 0;
      }
      if (hx() + HB_W > pu.x && hx() < pu.x + 14 && hy() + HB_H > pu.y && hy() < pu.y + 14) {
        // Power-ups don't stack: picking one up just refills it
        if (s.bossState === "fight" && pu.kind !== "double") {
          // in the arena the blocks top up your spell
          s.power = pu.kind;
          s.ammo += 3;
          if (pu.kind === "fire") s.fireTime = 999;
          popup(pu.x + 7, pu.y - 4, "+3 SHOTS");
        } else if (pu.kind === "fire") {
          s.power = "fire";
          s.ammo = FIRE_AMMO;
          s.fireTime = FIRE_TIME;
          popup(pu.x + 7, pu.y - 4, "FIRE!");
          showHint("shoot", "PRESS S TO SHOOT");
        } else if (pu.kind === "ice") {
          s.power = "ice";
          s.ammo = ICE_AMMO;
          s.fireTime = 0;
          popup(pu.x + 7, pu.y - 4, "ICE!");
          showHint("shoot", "PRESS S TO SHOOT");
        } else {
          s.doubleJumps = DOUBLE_JUMPS;
          popup(pu.x + 7, pu.y - 4, "DOUBLE JUMP!");
          showHint("double", "JUMP AGAIN IN THE AIR!");
        }
        s.bonus += 100;
        burst(pu.x + 7, pu.y + 7, 20, pu.kind === "fire" ? FIRE : pu.kind === "ice" ? ICE : TURQ, 70);
        playPowerUp();
        pu.y = 999;
      }
    }
    s.powerups = s.powerups.filter((pu) => pu.y < H + 20 && pu.x > s.cam - 40);

    // Little flames around you while you have fire
    if (hasFire()) {
      s.auraTimer -= dt;
      if (s.auraTimer <= 0) {
        s.auraTimer = 0.07;
        s.particles.push({
          x: s.x + rand(6, 18),
          y: s.y + rand(0, 10),
          vx: rand(-10, 10),
          vy: rand(-60, -30),
          color: (s.power === "ice" ? ICE : FIRE)[Math.floor(Math.random() * 3)],
          life: rand(0.2, 0.4),
        });
      }
    }

    // Fireballs bounce along the ground and burn monsters
    for (const f of s.fireballs) {
      f.life -= dt;
      if (!f.ice) f.vy = Math.min(300, f.vy + 900 * dt);
      f.x += f.vx * dt;
      if (solidAt(f.x + (f.vx > 0 ? 4 : 0), f.y + 2)) {
        f.life = 0;
        burst(f.x, f.y, 6, f.ice ? ICE : FIRE, 40);
        continue;
      }
      if (f.ice) {
        // little frost trail
        if (Math.random() < 0.5) {
          s.particles.push({ x: f.x, y: f.y + rand(0, 4), vx: 0, vy: rand(-10, 10), color: ICE[Math.floor(Math.random() * 4)], life: 0.25 });
        }
      } else {
        f.y += f.vy * dt;
        if (solidAt(f.x + 2, f.y + 4)) {
          f.y = Math.floor((f.y + 4) / T) * T - 4;
          f.vy = -170;
        }
      }
      if (f.x < s.cam - 10 || f.x > s.cam + W + 10 || f.y > H) f.life = 0;
      for (const e of s.enemies) {
        if (!e.alive) continue;
        const ew = e.kind === "flyer" ? 18 : 14;
        if (f.x + 4 > e.x && f.x < e.x + ew && f.y + 4 > e.y && f.y < e.y + 14) {
          killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          f.life = 0;
          break;
        }
      }
      const tb = s.boss;
      if (f.life > 0 && tb && tb.dead <= 0 && tb.dazed <= 0) {
        const tbGiant = tb.kind === "giant";
        const bx1 = tb.x + (tbGiant ? GIANT_HX : TR_HX);
        const by1 = tb.y + (tbGiant ? GIANT_HY : TR_HY);
        const bw1 = tbGiant ? GIANT_HW : TR_HW;
        const bh1 = tbGiant ? GIANT_HH : TR_HH;
        if (f.x + 4 > bx1 && f.x < bx1 + bw1 && f.y + 4 > by1 && f.y < by1 + bh1) {
          f.life = 0;
          hitBoss(f.ice);
        }
      }
      const lb = s.lboss;
      if (f.life > 0 && lb && lb.dead <= 0) {
        const bw = lb.kind === "snowman" ? SN_W : EL_W;
        const bh = lb.kind === "snowman" ? SN_H : EL_H;
        if (lb.dazed <= 0 && f.x + 4 > lb.x + 6 && f.x < lb.x + bw - 6 && f.y + 4 > lb.y + 4 && f.y < lb.y + bh - 4) {
          f.life = 0;
          hitLevelBoss(f.ice);
        }
      }
    }
    s.fireballs = s.fireballs.filter((f) => f.life > 0);

    // Drone lasers: swoop down to waist height, then fly straight. Touching one hurts.
    for (const l of s.lasers) {
      l.x += l.vx * dt;
      l.y += (l.ty - l.y) * Math.min(1, dt * 8);
      l.life -= dt;
      if (l.life > 0 && s.invuln <= 0 && hx() + HB_W > l.x && hx() < l.x + 12 && hy() + HB_H > l.y && hy() < l.y + 3) {
        l.life = 0;
        hurt();
        return;
      }
    }
    s.lasers = s.lasers.filter((l) => l.life > 0 && l.x > s.cam - 40 && l.x < s.cam + W + 40);

    // Monsters
    for (const e of s.enemies) {
      if (!e.alive) {
        e.squash -= dt;
        continue;
      }
      if (e.x < s.cam - 60 || e.x > s.cam + W + 40) {
        if (e.x < s.cam - 60) e.alive = false;
        continue;
      }
      if (e.kind === "flyer" && colAt(Math.floor((e.x + 9) / T)).zone === F_IPOD && !s.inBonus) {
        // IPOD USER drone: hovers above head height, drifts, and every few seconds fires a red laser
        // that swoops down to your waist and races along: jump over it
        e.phase += dt * 3;
        e.x += e.vx * 0.6 * dt;
        const g = colAt(Math.floor((e.x + 9) / T)).ground;
        const floor = (g >= 0 ? g : 8) * T;
        e.y += (floor - 58 + Math.sin(e.phase) * 3 - e.y) * Math.min(1, dt * 3);
        if (e.shoot === undefined) e.shoot = rand(1, 2.2);
        const dxp = s.x + SPRITE_W / 2 - (e.x + 9);
        if (Math.abs(dxp) < 230 && e.x > s.cam && e.x < s.cam + W - 10) {
          e.shoot -= dt;
          if (e.shoot <= 0) {
            e.shoot = rand(2.2, 3.4);
            const dir = dxp < 0 ? -1 : 1;
            s.lasers.push({ x: e.x + 4, y: e.y + 12, vx: dir * LASER_SPEED, ty: s.y + SPRITE_H - 16, life: 3 });
            beep(1400, 500, 0.12, 0.035, "sawtooth");
          }
        }
      } else if (e.kind === "flyer") {
        // Green flyer: floats left in a wave
        e.phase += dt * 2.6;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.phase) * 14;
      } else {
        // Walker: walks, turns at edges and walls
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        const front = e.vx < 0 ? e.x : e.x + 14;
        const footRow = Math.floor((e.y + 14) / T);
        const wall = solidAt(front, e.y + 7);
        const edge = !solidAt(front, (footRow + 0.5) * T);
        if (wall || edge) e.vx = -e.vx;
        e.y += e.vy * dt;
        if (solidAt(e.x + 7, e.y + 14)) {
          e.y = Math.floor((e.y + 14) / T) * T - 14;
          e.vy = 0;
        }
        if (e.y > H + 20) e.alive = false;
      }

      // Touching you
      const ew = e.kind === "flyer" ? 18 : 14;
      const px1 = hx();
      const py1 = hy();
      if (px1 + HB_W > e.x + 2 && px1 < e.x + ew - 2 && py1 + HB_H > e.y + 2 && py1 < e.y + 12) {
        const falling = s.vy > 0 && py1 + HB_H - e.y < 10;
        if (falling) {
          killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          s.vy = STOMP_BOUNCE;
        } else if (s.invuln <= 0) {
          hurt();
          return;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.squash > 0);

    // The evil weed leaf: floats around, follows you, and every few seconds dives at you
    const lb = s.lboss;
    if (s.levelMode && lb) {
      if (lb.dead > 0) {
        lb.dead -= dt;
        lb.y += 40 * dt;
        if (Math.random() < 0.6) {
          const snow = lb.kind === "snowman";
          burst(lb.x + rand(4, (snow ? SN_W : EL_W) - 4), lb.y + rand(4, snow ? SN_H : EL_H), 2, snow ? ["#ffffff", "#dff3fb", "#aac3e1"] : [LIGHT_GREEN, GREEN, "#ffffff"], 40);
        }
        if (lb.dead <= 0) {
          s.lboss = null;
          s.lbossState = "done";
          s.bossState = "none";
          s.flash = 2.5;
          s.flashText = lb.kind === "snowman" ? "THE EVIL SNOWMAN MELTED! GO HIT THE BONG" : "EVIL LEAF DOWN! GO HIT THE BONG";
          if (s.power === "fire") s.fireTime = Math.min(s.fireTime, FIRE_TIME);
          s.ammo = Math.min(s.ammo, 5);
        }
      } else if (lb.kind === "snowman") {
        // THE EVIL SNOWMAN: stomps after you and hops. Shots only; once he's out of hits he gets
        // dizzy for a few seconds and you finish him by jumping on his head.
        if (lb.hit > 0) lb.hit -= dt;
        if (lb.speech > 0) lb.speech -= dt;
        const floorY = 8 * T - SN_H;
        const pc = s.x + HB_X + HB_W / 2;
        const bc = lb.x + SN_W / 2;
        const onFloor = lb.y >= floorY - 0.5;
        if (lb.dazed > 0) {
          lb.dazed -= dt;
          lb.vx = 0;
          if (lb.dazed <= 0) {
            lb.hp = 3; // took too long: he shakes it off
            popup(bc, lb.y - 8, "HE'S BACK UP!");
          }
        } else if (onFloor) {
          lb.facing = pc < bc ? -1 : 1;
          lb.vx = lb.facing * 40;
          lb.diveTimer -= dt;
          if (lb.diveTimer <= 0 && Math.abs(pc - bc) < 130) {
            lb.vy = -300;
            lb.vx = lb.facing * 70;
            lb.diveTimer = rand(2, 3.2);
            playBump();
          }
        }
        lb.vy = Math.min(420, lb.vy + GRAVITY * dt);
        lb.x += lb.vx * dt;
        lb.y += lb.vy * dt;
        if (lb.y > floorY) {
          if (lb.vy > 200) s.shake = 0.12;
          lb.y = floorY;
          lb.vy = 0;
        }
        lb.x = Math.max(s.cam, Math.min(s.cam + W - SN_W, lb.x));
        const bx1 = lb.x + 8;
        const by1 = lb.y + 6;
        if (hx() + HB_W > bx1 && hx() < bx1 + SN_W - 16 && hy() + HB_H > by1 && hy() < lb.y + SN_H) {
          const onTop = s.vy > 0 && hy() + HB_H - by1 < 14;
          if (onTop && lb.dazed > 0) {
            // the finishing stomp!
            s.vy = STOMP_BOUNCE;
            lb.dazed = 0;
            lb.dead = 1.6;
            popup(bc, lb.y - 8, "MELTED!");
            playTrollDeath();
          } else if (onTop) {
            s.vy = STOMP_BOUNCE;
            popup(bc, lb.y - 8, "NOPE!");
            playBump();
          } else if (lb.dazed <= 0 && s.invuln <= 0) {
            hurt();
            return;
          }
        }
      } else {
        if (lb.hit > 0) lb.hit -= dt;
        const pc = s.x + HB_X + HB_W / 2;
        const bc = lb.x + EL_W / 2;
        lb.facing = pc < bc ? -1 : 1;
        const floorY = 8 * T - EL_H;
        if (lb.dive > 0) {
          lb.dive -= dt;
          lb.vy = Math.min(lb.vy + 520 * dt, 260);
          lb.y += lb.vy * dt;
          lb.x += lb.vx * dt;
          if (lb.y >= floorY) {
            lb.y = floorY;
            lb.dive = 0;
            s.shake = 0.1;
          }
        } else {
          const hoverY = 46 + Math.sin(s.t * 2) * 10;
          lb.y += (hoverY - lb.y) * Math.min(1, dt * 1.6);
          lb.vx += (lb.facing * 50 - lb.vx) * Math.min(1, dt * 2);
          lb.x += lb.vx * dt;
          lb.diveTimer -= dt;
          if (lb.diveTimer <= 0 && Math.abs(pc - bc) < 100) {
            lb.dive = 1.4;
            lb.vy = 40;
            lb.vx = lb.facing * 60;
            lb.diveTimer = rand(2.4, 3.6);
            playBump();
          }
        }
        lb.x = Math.max(s.cam, Math.min(s.cam + W - EL_W, lb.x));
        // touching it hurts; landing on top just bounces you off
        const bx1 = lb.x + 6;
        const by1 = lb.y + 4;
        if (hx() + HB_W > bx1 && hx() < bx1 + EL_W - 12 && hy() + HB_H > by1 && hy() < by1 + EL_H - 8) {
          if (s.vy > 0 && hy() + HB_H - by1 < 12) {
            s.vy = STOMP_BOUNCE;
            popup(lb.x + EL_W / 2, lb.y - 6, "NOPE!");
            playBump();
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
      }
      // the arena's bonus blocks refill every few seconds
      s.bossRefill += dt;
      if (s.bossRefill > 10) {
        s.bossRefill = 0;
        for (let k = 0; k < 22; k++) {
          const c = colAt(s.bossCol + k);
          if (c.bonus >= 0 && c.used) {
            c.used = false;
            c.bump = 0.15;
          }
        }
      }
    }

    // The bong: touch it to finish the level
    const bg = s.bong;
    if (s.levelMode && bg && s.lbossState !== "fight") {
      if (hx() + HB_W > bg.x + 2 && hx() < bg.x + BONG_W - 2 && hy() + HB_H > bg.y + 4 && hy() < bg.y + BONG_H) {
        finishLevel();
        return;
      }
    }

    // The troll (or, every other fight, the bigger giant): walks at you, sometimes jumps at
    // you. Shots hurt him; the giant additionally needs a finishing stomp once he's down.
    const b = s.boss;
    if (s.bossState === "fight" && b) {
      const isGiant = b.kind === "giant";
      const bw = isGiant ? GIANT_W : TR_W;
      const bh = isGiant ? GIANT_H : TR_H;
      const bhx = isGiant ? GIANT_HX : TR_HX;
      const bhy = isGiant ? GIANT_HY : TR_HY;
      const bhw = isGiant ? GIANT_HW : TR_HW;
      const bhh = isGiant ? GIANT_HH : TR_HH;
      if (b.dead > 0) {
        b.dead -= dt;
        b.y += 30 * dt;
        if (Math.random() < 0.5) burst(b.x + rand(6, bw - 6), b.y + rand(10, bh), 2, [LIGHT_GREEN, GREEN, "#ffffff"], 40);
        if (b.dead <= 0) {
          const kind = b.kind;
          s.boss = null;
          s.bossState = "none";
          s.bossCount += 1; // the next one comes 10k later, faster and tougher
          unlockOutfit("ghost");
          const pts = kind === "giant" ? PTS_GIANT : PTS_BOSS;
          s.bonus += pts;
          s.flash = 2.5;
          s.flashText = `${kind === "giant" ? "GIANT" : "TROLL"} DOWN! +${pts}`;
          // leftover shots stay, but back to normal rules
          if (s.power === "fire") s.fireTime = Math.min(s.fireTime, FIRE_TIME);
          s.ammo = Math.min(s.ammo, 5);
        }
      } else if (b.dazed > 0) {
        // Down but not out: he just lies there while you line up the finishing stomp
        b.dazed -= dt;
        b.vy = Math.min(420, b.vy + GRAVITY * dt);
        b.y += b.vy * dt;
        if (b.y > 8 * T - bh) {
          b.y = 8 * T - bh;
          b.vy = 0;
        }
        const bx1 = b.x + bhx;
        const by1 = b.y + bhy;
        if (hx() + HB_W > bx1 && hx() < bx1 + bhw && hy() + HB_H > by1 && hy() < by1 + bhh) {
          if (s.vy > 0 && hy() + HB_H - by1 < 14) {
            // The finishing move!
            s.vy = STOMP_BOUNCE;
            b.dazed = 0;
            b.dead = 1.6;
            popup(b.x + bw / 2, b.y - 6, "GIANT DOWN!");
            playTrollDeath();
          }
          // Otherwise touching him while he's down is harmless — no hurt() here
        }
        if (b.dazed <= 0 && b.dead <= 0) {
          // Ran out of time without being stomped: he gets back up
          b.hp = GIANT_DAZE_HP;
          popup(b.x + bw / 2, b.y - 10, "GETTING BACK UP!");
        }
      } else {
        if (b.hit > 0) b.hit -= dt;
        const speedMul = isGiant ? GIANT_SPEED_MULT : 1;
        const pc = s.x + HB_X + HB_W / 2;
        const tc = b.x + bhx + bhw / 2;
        const dir = pc < tc ? -1 : 1;
        const onGround = b.y >= 8 * T - bh - 0.5;
        if (onGround && b.hit <= 0.2) {
          b.facing = dir;
          b.vx = dir * TROLL_SPEED * bossSpeed() * speedMul;
          b.jumpTimer -= dt;
          if (b.jumpTimer <= 0 && Math.abs(pc - tc) < 120) {
            b.vy = TROLL_JUMP;
            b.vx = dir * 75 * bossSpeed() * speedMul;
            b.jumpTimer = rand(1.8, 3.2) / bossSpeed();
            playBump();
          }
        }
        b.vy = Math.min(420, b.vy + GRAVITY * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y > 8 * T - bh) {
          if (b.vy > 200) s.shake = 0.12; // heavy landing
          b.y = 8 * T - bh;
          b.vy = 0;
        }
        b.x = Math.max(s.cam - bhx, Math.min(s.cam + W - bw + bhx, b.x));
        // Touching him hurts, unless you land on top of him (he's too big to squash, you just bounce off)
        const bx1 = b.x + bhx;
        const by1 = b.y + bhy;
        if (hx() + HB_W > bx1 && hx() < bx1 + bhw && hy() + HB_H > by1 && hy() < by1 + bhh) {
          if (s.vy > 0 && hy() + HB_H - by1 < 12) {
            s.vy = STOMP_BOUNCE;
            popup(b.x + bw / 2, b.y - 6, "NOPE!");
            playBump();
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
      }
      // The two bonus blocks in the arena refill every few seconds
      s.bossRefill += dt;
      if (s.bossRefill > 10) {
        s.bossRefill = 0;
        for (let k = 0; k < BOSS_ARENA; k++) {
          const c = colAt(s.bossCol + k);
          if (c.bonus >= 0 && c.used) {
            c.used = false;
            c.bump = 0.15;
          }
        }
      }
    }

    // Weed leaves: points. Gold coins: money for outfits.
    for (const l of s.leaves) {
      if (l.taken) continue;
      const size = l.small ? 8 : 14;
      if (hx() + HB_W > l.x && hx() < l.x + size && hy() + HB_H > l.y && hy() < l.y + size) {
        l.taken = true;
        if (isCoin(l)) {
          addCoins(1);
          popup(l.x + 7, l.y - 4, "+1 COIN");
          burst(l.x + 7, l.y + 7, 10, ["#ffd700", "#fff3a0", "#b8860b"], 50);
          playCoin();
          continue;
        }
        s.bonus += PTS_LEAF;
        burst(l.x + 7, l.y + 7, 8, [GREEN, DARK_GREEN, "#ffffff"], 45);
        playLeaf();
      }
    }
    s.leaves = s.leaves.filter((l) => !l.taken && (s.inBonus || l.x > s.cam - 40)); // the Void keeps everything, you can walk back

    // Hearts: an extra life (max 4)
    for (const h of s.hearts) {
      if (h.taken) continue;
      if (hx() + HB_W > h.x && hx() < h.x + 14 && hy() + HB_H > h.y && hy() < h.y + 12) {
        h.taken = true;
        if (s.lives < MAX_LIVES) {
          s.lives += 1;
          popup(h.x + 7, h.y - 4, "+1 LIFE");
        } else {
          s.bonus += 200;
          popup(h.x + 7, h.y - 4, "+200");
        }
        burst(h.x + 7, h.y + 6, 16, [PINK, "#ffffff", DARK_PINK], 60);
        playHeart();
      }
    }
    s.hearts = s.hearts.filter((h) => !h.taken && (s.inBonus || h.x > s.cam - 40));
  };

  // ---------- Drawing ----------

  const drawSfxIcon = (ctx: CanvasRenderingContext2D, color: string) => {
    const x = 6;
    const y = 5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 2, 2, 3);
    ctx.fillRect(x + 2, y + 1, 1, 5);
    ctx.fillRect(x + 3, y, 1, 7);
    if (sfxOnRef.current) {
      ctx.fillRect(x + 5, y + 2, 1, 3);
      ctx.fillRect(x + 7, y + 1, 1, 5);
    } else {
      ctx.fillStyle = PINK;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
        ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
      }
    }
  };

  // The sound effects slider: a thin bar going down from the speaker icon (top = loud, bottom = quiet)
  const SFX_SLIDER = { x: 9, top: 18, bottom: 58 };
  const drawSfxSlider = (ctx: CanvasRenderingContext2D, color: string) => {
    const { x, top, bottom } = SFX_SLIDER;
    const vol = sfxOnRef.current ? sfxVolRef.current : 0;
    const knobY = Math.round(bottom - vol * (bottom - top));
    ctx.globalAlpha = sfxDragRef.current ? 1 : 0.75;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, top - 1, 5, bottom - top + 2);
    ctx.fillStyle = "#6e6478";
    ctx.fillRect(x, top, 3, bottom - top);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, knobY, 3, bottom - knobY);
    // knob
    ctx.fillStyle = INK;
    ctx.fillRect(x - 3, knobY - 2, 9, 5);
    ctx.fillStyle = color === INK ? "#ffffff" : color;
    ctx.fillRect(x - 2, knobY - 1, 7, 3);
    ctx.globalAlpha = 1;
  };
  // Is this canvas point on the slider? (a bit wider than it looks, easier to grab)
  const onSfxSlider = (cx: number, cy: number) => cx < 22 && cy >= SFX_SLIDER.top - 5 && cy <= SFX_SLIDER.bottom + 5;
  const sfxFromY = (cy: number) => setSfxVolume((SFX_SLIDER.bottom - cy) / (SFX_SLIDER.bottom - SFX_SLIDER.top));

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, W / 2, y);
  };

  // Same as textBox, but it flashes pink and white really fast so you can't miss it
  // (used for power-up hints like PRESS S TO SHOOT)
  const flashBox = (ctx: CanvasRenderingContext2D, text: string, y: number, t: number) => {
    const w = ctx.measureText(text).width + 12;
    const x = Math.round(W / 2 - w / 2);
    const pinkTurn = Math.floor(t * 8) % 2 === 0; // swaps 8 times a second
    ctx.fillStyle = INK; // dark outline
    ctx.fillRect(x - 1, y - 4, Math.round(w) + 2, 16);
    ctx.fillStyle = pinkTurn ? PINK : "#ffffff";
    ctx.fillRect(x, y - 3, Math.round(w), 14);
    ctx.fillStyle = pinkTurn ? "#ffffff" : PINK;
    ctx.fillText(text, W / 2, y);
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const status = boardStatusRef.current;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = INK;
    ctx.textAlign = "center";

    if (status !== "ok") {
      ctx.fillText(s.levelMode ? `LVL ${s.level} DONE!` : "GAME OVER", W / 2, 40);
      ctx.fillText(s.levelMode ? `YOUR TIME ${fmtTime(s.levelMs)}` : `YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 58);
      ctx.fillText(status === "loading" ? "LOADING SCORES..." : "SCOREBOARD OFFLINE", W / 2, 80);
    } else {
      ctx.fillText(s.levelMode ? `LVL ${s.level} BEST TIMES` : "TOP 10", W / 2, 8);
      const b = boardRef.current;
      if (b.length === 0) ctx.fillText("NO SCORES YET", W / 2, 60);
      const MEDALS = ["#ffd700", "#c8ccd6", "#cd7f32"]; // gold, silver, bronze
      b.slice(0, 10).forEach((e, i) => {
        const y = 22 + i * 11;
        // every row wiggles a little, like an old screen
        const wob = Math.round(Math.sin(s.t * 2.2 + i * 0.8) * 1.5);
        ctx.save();
        ctx.translate(wob, 0);
        if (i < 3) {
          ctx.fillStyle = MEDALS[i];
          ctx.fillRect(24, y - 2, W - 48, 11);
          // a shine sweeping across the gold one
          if (i === 0) {
            const sx = 24 + ((s.t * 90) % (W + 40)) - 20;
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillRect(Math.round(sx), y - 2, 6, 11);
            ctx.fillRect(Math.round(sx) + 8, y - 2, 2, 11);
          }
        }
        if (e.name === myNameRef.current) {
          // your own row: pink frame
          ctx.fillStyle = PINK;
          ctx.fillRect(22, y - 3, W - 44, 1);
          ctx.fillRect(22, y + 9, W - 44, 1);
          ctx.fillRect(22, y - 3, 1, 13);
          ctx.fillRect(W - 23, y - 3, 1, 13);
        }
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
        ctx.textAlign = "right";
        ctx.fillText(s.levelMode ? fmtTime(LEVEL_TIME_BASE - e.score) : pad(e.score), W - 28, y);
        ctx.restore();
      });
      ctx.textAlign = "center";
      ctx.fillText(s.levelMode ? `YOUR TIME ${fmtTime(s.levelMs)}` : `YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText(s.levelMode ? "OK TO GO ON" : "OK TO PLAY AGAIN", W / 2, 148);

    // Old screen effect: scanlines, a slow rolling bright band, a little flicker, dark corners
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    const band = (s.t * 30) % (H + 30) - 30;
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    ctx.fillRect(0, Math.round(band), W, 14);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + Math.abs(Math.sin(s.t * 13)) * 0.03})`;
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  };

  // One twisted tree, drawn as outlines. Its branches sway a little in the wind.
  const drawTree = (ctx: CanvasRenderingContext2D, x: number, baseY: number, height: number, seed: number, sway: number) => {
    const t = state.current.t;
    const branch = (x1: number, y1: number, len: number, angle: number, depth: number, id: number) => {
      const a = angle + Math.sin(t * 0.9 + seed * 3 + id) * 0.05 * (5 - depth) * sway;
      const x2 = x1 + Math.cos(a) * len;
      const y2 = y1 + Math.sin(a) * len;
      // bend each branch sideways so it looks crooked
      const bend = (hash(seed * 13 + id) - 0.5) * len * 0.8;
      ctx.lineWidth = depth >= 3 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + bend, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
      if (depth <= 0) return;
      const spread = 0.45 + hash(seed + id * 7) * 0.5;
      branch(x2, y2, len * 0.72, a - spread, depth - 1, id * 2 + 1);
      branch(x2, y2, len * 0.66, a + spread * 0.85, depth - 1, id * 2 + 2);
    };
    branch(x, baseY, height, -Math.PI / 2 + (hash(seed) - 0.5) * 0.3, 4, 0);
  };

  // A sign in the secret area at the start. colX is which tile column (negative = left of start)
  // its left edge sits at. header is optional; without one the sign just shows the names.
  const drawSecretSign = (
    ctx: CanvasRenderingContext2D,
    cam: number,
    colX: number,
    names: string[],
    header?: string
  ) => {
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const padX = 16;
    const lineH = 9;
    const measureList = header ? [header, ...names] : names;
    let maxW = 0;
    measureList.forEach((n) => {
      const mw = ctx.measureText(n).width;
      if (mw > maxW) maxW = mw;
    });
    const w = Math.max(124, Math.ceil(maxW) + padX * 2);
    const namesTop = header ? 18 : 8;
    const h = namesTop + names.length * lineH + 8;
    const x = Math.round(colX * T - cam);
    const y = 22;
    ctx.fillStyle = INK;
    ctx.fillRect(x + 14, y + h, 4, 8 * T - y - h);
    ctx.fillRect(x + w - 18, y + h, 4, 8 * T - y - h);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    if (header) {
      ctx.fillStyle = "#ffc800";
      ctx.fillText(header, x + w / 2, y + 6);
    }
    ctx.fillStyle = "#ffffff";
    names.forEach((n, i) => ctx.fillText(n, x + w / 2, y + namesTop + i * lineH));
  };

  // Background for each zone (moves slower than the level, so it feels far away)
  // A big weed leaf (7 fingers), used for the Weedland background
  const drawBigLeaf = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, angle: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    const fingers: [number, number][] = [[-1.35, 0.45], [-0.9, 0.7], [-0.45, 0.9], [0, 1], [0.45, 0.9], [0.9, 0.7], [1.35, 0.45]];
    for (const [a, l] of fingers) {
      const len = l * size;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, size * 0.09, len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillRect(-1, 0, 2, size * 0.45);
    ctx.restore();
  };

  // WEEDLAND (Level 1): a green fantasy sky with giant swaying leaves and glowing spores
  const drawWeedland = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const cam = s.cam;
    const g = ctx.createLinearGradient(0, -200, 0, H);
    g.addColorStop(0, WL_SKY_TOP);
    g.addColorStop(1, WL_SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    // soft sun
    ctx.fillStyle = "rgba(255, 250, 190, 0.8)";
    ctx.beginPath();
    ctx.arc(W - 50, 26, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 250, 190, 0.3)";
    ctx.beginPath();
    ctx.arc(W - 50, 26, 22, 0, Math.PI * 2);
    ctx.fill();
    // far hills
    ctx.fillStyle = "#5fb85a";
    for (let x = -4; x < W + 4; x += 4) {
      const hgt = 26 + Math.sin((x + cam * 0.1) * 0.02) * 10 + Math.sin((x + cam * 0.1) * 0.05) * 5;
      ctx.fillRect(x, H - 44 - hgt, 4, hgt + 60);
    }
    // giant leaves swaying (far = pale, near = darker)
    for (const [par, gap, size, color] of [
      [0.2, 90, 34, "rgba(80, 170, 70, 0.45)"],
      [0.4, 130, 48, "rgba(40, 130, 50, 0.55)"],
    ] as [number, number, number, string][]) {
      const base = Math.floor((cam * par) / gap);
      for (let i = -1; i < W / gap + 2; i++) {
        const idx = base + i;
        const x = idx * gap - cam * par + hash(idx + 17) * 30;
        const sway = Math.sin(s.t * 0.9 + idx) * 0.12;
        drawBigLeaf(ctx, x, H - 40 - hash(idx + 3) * 20, size, sway, color);
      }
    }
    // glowing spores floating up
    for (let k = 0; k < 22; k++) {
      const x = ((((hash(k) * 600 - cam * 0.5 + Math.sin(s.t + k) * 6) % (W + 20)) + W + 20) % (W + 20)) - 10;
      const y = H - ((s.t * (8 + hash(k + 5) * 10) + hash(k + 9) * H) % (H + 20));
      ctx.fillStyle = k % 3 === 0 ? "#fff7a8" : "#eaffc0";
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  };

  // A pixel pine tree with snow on its branches
  const drawPine = (ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, dark: string) => {
    ctx.fillStyle = "#4a3222";
    ctx.fillRect(Math.round(x) - 1, baseY - 4, 3, 4);
    for (let k = 0; k < 3; k++) {
      const w = h * (0.55 - k * 0.13);
      const top = baseY - 4 - h * (0.35 + k * 0.28);
      const bot = baseY - 4 - h * (k * 0.22);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x - w / 2, bot);
      ctx.lineTo(x + w / 2, bot);
      ctx.fill();
      ctx.fillStyle = "#f4f9fc";
      ctx.fillRect(Math.round(x - w / 2), Math.round(bot) - 2, Math.round(w), 2);
    }
    ctx.fillStyle = "#f4f9fc";
    ctx.fillRect(Math.round(x) - 1, Math.round(baseY - 4 - h * 0.91), 3, 2);
  };

  // SNOWY MOUNTAINS (Level 2): blue sky, snowy peaks, pine forest, a little town, snow falling
  const drawSnowland = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const cam = s.cam;
    const g = ctx.createLinearGradient(0, -200, 0, H);
    g.addColorStop(0, "#5fb4d6");
    g.addColorStop(1, "#cfeaf5");
    ctx.fillStyle = g;
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    // clouds
    ctx.fillStyle = "#eef6fa";
    for (let k = 0; k < 5; k++) {
      const cx = ((((hash(k) * 500 - cam * 0.05 - s.t * 3) % (W + 80)) + W + 80) % (W + 80)) - 40;
      const cy = 14 + hash(k + 7) * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.arc(cx + 10, cy - 4, 10, 0, Math.PI * 2);
      ctx.arc(cx + 22, cy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // far mountains with snow caps
    const base = Math.floor((cam * 0.1) / 90);
    for (let i = -1; i < W / 90 + 2; i++) {
      const idx = base + i;
      const mx = idx * 90 - cam * 0.1 + hash(idx) * 30;
      const mh = 50 + hash(idx + 4) * 30;
      const my = 112;
      ctx.fillStyle = idx % 2 ? "#2f5d4a" : "#3a6b56";
      ctx.beginPath();
      ctx.moveTo(mx - 60, my);
      ctx.lineTo(mx, my - mh);
      ctx.lineTo(mx + 60, my);
      ctx.fill();
      ctx.fillStyle = "#f4f9fc";
      ctx.beginPath();
      ctx.moveTo(mx - 16, my - mh + 16);
      ctx.lineTo(mx, my - mh);
      ctx.lineTo(mx + 16, my - mh + 16);
      ctx.lineTo(mx + 6, my - mh + 12);
      ctx.lineTo(mx, my - mh + 17);
      ctx.lineTo(mx - 7, my - mh + 12);
      ctx.fill();
    }
    // a little town far away, with lit windows
    const tb = Math.floor((cam * 0.2) / 160);
    for (let i = -1; i < W / 160 + 2; i++) {
      const idx = tb + i;
      const tx = idx * 160 - cam * 0.2 + 40;
      for (let h = 0; h < 4; h++) {
        const hx2 = Math.round(tx + h * 13);
        const hy2 = 104 - (h % 2) * 3;
        ctx.fillStyle = ["#b0584a", "#6d8ab0", "#c9a14a", "#7c5aa0"][(idx + h) & 3];
        ctx.fillRect(hx2, hy2, 10, 8);
        ctx.fillStyle = "#f4f9fc";
        ctx.beginPath();
        ctx.moveTo(hx2 - 1, hy2);
        ctx.lineTo(hx2 + 5, hy2 - 5);
        ctx.lineTo(hx2 + 11, hy2);
        ctx.fill();
        ctx.fillStyle = "#ffe27a";
        ctx.fillRect(hx2 + 3, hy2 + 3, 2, 2);
      }
    }
    // pine forest
    const pb = Math.floor((cam * 0.35) / 34);
    for (let i = -1; i < W / 34 + 2; i++) {
      const idx = pb + i;
      const px = idx * 34 - cam * 0.35 + hash(idx + 11) * 14;
      drawPine(ctx, px, 128, 30 + hash(idx + 2) * 18, idx % 3 ? "#1f6b3a" : "#175a30");
    }
    // snow falling
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 40; k++) {
      const fx = ((((hash(k) * 700 - cam * 0.6 + Math.sin(s.t + k) * 8) % (W + 10)) + W + 10) % (W + 10)) - 5;
      const fy = ((s.t * (14 + hash(k + 3) * 16) + hash(k + 8) * (H + 10)) % (H + 10)) - 5;
      ctx.fillRect(Math.round(fx), Math.round(fy), k % 4 ? 1 : 2, k % 4 ? 1 : 2);
    }
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, zone: number) => {
    const s = state.current;
    const cam = s.cam;
    if (zone === LEVEL_ZONE) {
      drawWeedland(ctx);
      return;
    }
    if (zone === LEVEL_SNOW) {
      drawSnowland(ctx);
      return;
    }

    if (zone === VOID_ZONE) {
      // SoundCloud Void: dark room with a moving sound wave, tinted a bit differently per room
      const pal = VOID_PALETTES[s.voidPal] || VOID_PALETTES[0];
      ctx.fillStyle = pal.bg;
      // Extended upward so it still fully covers the screen when the vertical camera scrolls up
      ctx.fillRect(-4, -1200, W + 8, H + 1400);
      for (let i = 0; i < W / 4 + 1; i++) {
        const h = 10 + (Math.sin(s.t * 3 + i * 0.5) + 1) * 14 + hash(i) * 12;
        ctx.fillStyle = i % 2 === 0 ? pal.a : pal.b;
        ctx.fillRect(i * 4, 64 - h / 2, 3, h);
      }
      return;
    }

    if (zone >= FIELD_ZONE_START && zone < FIELD_ZONE_START + FIELD_IMAGES.length) {
      // A cover-art field: the backdrop is the pixelated cover, ground/platforms stay plain.
      // Fallback fill first, only shows if the image hasn't loaded yet.
      ctx.fillStyle = SCREEN;
      ctx.fillRect(-4, -1200, W + 8, H + 1400);
      const img = fieldImagesRef.current[zone - FIELD_ZONE_START];
      if (img && img.complete && img.naturalWidth > 0) {
        // Stack extra copies directly above the visible one, so jumping high (which
        // scrolls the screen up) reveals more of the same cover instead of a plain gap.
        const COPIES_ABOVE = 6;
        const wiggle = FIELD_WIGGLE[zone - FIELD_ZONE_START];
        for (let i = -COPIES_ABOVE; i <= 0; i++) {
          const top = i * H;
          if (top > s.camY + H || top + H < s.camY) continue; // not on screen
          if (!wiggle) {
            ctx.drawImage(img, 0, top, W, H);
            continue;
          }
          // Wiggle: draw the cover in thin strips, each one nudged sideways by a slow wave
          const STRIP = 4;
          const sh = img.naturalHeight / (H / STRIP);
          for (let y = 0; y < H; y += STRIP) {
            const off = Math.sin(s.t * 1.6 + (top + y) * 0.07) * 3;
            ctx.drawImage(img, 0, (y / STRIP) * sh, img.naturalWidth, sh, -4 + off, top + y, W + 8, STRIP + 1);
          }
        }
      }
      if (zone - FIELD_ZONE_START === F_CORAL - FIELD_ZONE_START) {
        // Underwater: darker blue water on top of the cover, with light rippling through
        ctx.fillStyle = "rgba(8, 40, 90, 0.38)";
        ctx.fillRect(-4, -1200, W + 8, H + 1400);
        ctx.fillStyle = "rgba(170, 225, 255, 0.22)";
        for (let band = 0; band < 5; band++) {
          const by = 14 + band * 30;
          for (let x = 0; x < W; x += 2) {
            const y = by + Math.sin(s.t * 1.4 + x * 0.05 + band) * 4 + Math.sin(s.t * 0.7 + x * 0.013) * 3;
            ctx.fillRect(x, Math.round(y), 2, 1);
          }
        }
      }
      // Wash out the darker covers a bit so the level on top of them is easy to see
      const wash = FIELD_WASH[zone - FIELD_ZONE_START] ?? 0;
      if (wash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${wash})`;
        ctx.fillRect(-4, -1200, W + 8, H + 1400);
      }
      return;
    }

    ctx.fillStyle = zone === Z_CLOUDS ? CLOUD_SKY : zone === Z_TREES ? TREE_SKY : zone === Z_SMOKE ? SMOKE_SKY : SCREEN;
    // Extended upward so it still fully covers the screen when the vertical camera scrolls up
    ctx.fillRect(-4, -1200, W + 8, H + 1400);

    if (zone === 0) {
      // Rolling hills
      ctx.fillStyle = HILLS;
      const off = -((cam * 0.3) % 120);
      for (let i = -1; i < 4; i++) {
        const x = off + i * 120;
        ctx.beginPath();
        ctx.moveTo(x, 130);
        ctx.quadraticCurveTo(x + 50, 70, x + 100, 130);
        ctx.fill();
      }
    } else if (zone === 1) {
      // Far-away speaker stacks
      const base = Math.floor((cam * 0.3) / 40);
      for (let i = -1; i < W / 40 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 40 - cam * 0.3);
        const h = 40 + Math.floor(hash(idx) * 50);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 130 - h, 30, h);
        ctx.fillStyle = SCREEN;
        for (let yy = 130 - h + 6; yy < 124; yy += 14) {
          ctx.beginPath();
          ctx.arc(x + 15, yy + 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (zone === 2) {
      // City skyline with lit windows
      const base = Math.floor((cam * 0.25) / 24);
      for (let i = -1; i < W / 24 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 24 - cam * 0.25);
        const h = 30 + Math.floor(hash(idx + 7) * 70);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 140 - h, 22, h);
        ctx.fillStyle = "#e7b3e0";
        for (let yy = 140 - h + 4; yy < 134; yy += 8) {
          for (let xx = 3; xx < 20; xx += 6) {
            if (hash(idx * 31 + yy + xx) > 0.55) ctx.fillRect(x + xx, yy, 2, 3);
          }
        }
      }
    } else if (zone === Z_TREES) {
      // Twisted trees: a far row (light) and a near row (dark), both swaying
      ctx.lineCap = "round";
      ctx.strokeStyle = TREE_FAR;
      let base = Math.floor((cam * 0.15) / 46);
      for (let i = -1; i < W / 46 + 2; i++) {
        const idx = base + i;
        const x = idx * 46 - cam * 0.15 + hash(idx + 40) * 16;
        drawTree(ctx, x, 150, 22 + hash(idx + 5) * 14, idx + 100, 1);
      }
      ctx.strokeStyle = TREE_NEAR;
      base = Math.floor((cam * 0.35) / 80);
      for (let i = -1; i < W / 80 + 2; i++) {
        const idx = base + i;
        const x = idx * 80 - cam * 0.35 + hash(idx + 9) * 24;
        drawTree(ctx, x, 160, 30 + hash(idx + 2) * 16, idx, 1.6);
      }
      ctx.lineCap = "butt";
    } else if (zone === Z_SMOKE) {
      // Smoke Ocean: a sea of smoke on the horizon, with the ghost ship drifting by
      const sea = 104;
      const trip = W + 90;
      const bx = Math.round(W + 10 - ((cam * 0.08 + s.t * 7) % trip));
      const bob = Math.round(Math.sin(s.t * 1.6) * 2);
      const ship = shipRef.current;
      if (ship && ship.complete && ship.naturalWidth > 0) {
        // your drawing: the ship sits on its own smoke, which sinks into the sea
        drawImageSafe(ctx, ship, bx, sea - 50 + bob);
      } else {
        // backup boat if the picture isn't there
        drawPixels(ctx, BOAT, bx, sea - 38 + bob, { K: INK, b: "#7a4a3a", B: "#543028", W: "#f5f0e6", S: "#8f8499", M: "#3c2822" }, 2);
      }
      for (let xx = -2; xx < W + 4; xx += 4) {
        const wave = Math.sin(s.t * 1.5 + (xx + cam * 0.3) * 0.08) * 2;
        ctx.fillStyle = SMOKE_SEA_DARK;
        ctx.fillRect(xx, Math.round(sea + wave - 2), 4, H);
        ctx.fillStyle = SMOKE_SEA;
        ctx.fillRect(xx, Math.round(sea + wave), 4, H);
      }
      // slow smoke streaks on the sea
      ctx.fillStyle = SMOKE_STREAK;
      for (let k = 0; k < 6; k++) {
        const sx = Math.round((((hash(k) * 400 - cam * 0.3 - s.t * 12) % 300) + 300) % 300) - 22;
        ctx.fillRect(sx, sea + 10 + k * 8, 18 + Math.round(hash(k + 3) * 14), 2);
      }
    } else {
      // Pink clouds drifting in the sky
      const base = Math.floor((cam * 0.2) / 70);
      for (let i = -1; i < W / 70 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 70 - cam * 0.2 + Math.sin(s.t * 0.3 + idx) * 4);
        const y = 20 + Math.floor(hash(idx + 3) * 60);
        ctx.fillStyle = "#fbe3f6";
        ctx.beginPath();
        ctx.arc(x + 14, y + 10, 10, 0, Math.PI * 2);
        ctx.arc(x + 28, y + 6, 13, 0, Math.PI * 2);
        ctx.arc(x + 42, y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 12, y + 10, 32, 10);
      }
    }
  };

  // One floating cloud island from screen x0 to x1, standing surface at gy.
  // The top puffs slowly breathe and the whole cloud bobs a tiny bit.
  const drawCloud = (ctx: CanvasRenderingContext2D, x0: number, x1: number, gy: number, seed: number) => {
    const t = state.current.t;
    const w = x1 - x0;
    const top = gy + Math.round(Math.sin(t * 1.3 + seed) * 1);
    const thick = Math.min(30, 17 + Math.round(w * 0.12));
    const tops: [number, number, number][] = [];
    const topCount = Math.max(2, Math.round(w / 10));
    for (let k = 0; k < topCount; k++) {
      const cx = x0 + 5 + (k * (w - 10)) / (topCount - 1);
      const r = 6 + hash(seed * 7 + k) * 3 + Math.sin(t * 1.8 + k * 1.3 + seed) * 0.8;
      tops.push([cx, top + r - 1, r]);
    }
    const bottoms: [number, number, number][] = [];
    const botCount = Math.max(1, Math.round(w / 14));
    for (let k = 0; k < botCount; k++) {
      const cx = botCount === 1 ? x0 + w / 2 : x0 + 7 + (k * (w - 14)) / (botCount - 1);
      const r = 5 + hash(seed * 3 + k + 50) * 3 + Math.sin(t * 1.4 + k + seed) * 0.6;
      bottoms.push([cx, top + thick - r, r]);
    }
    const shape = (grow: number) => {
      ctx.beginPath();
      for (const [cx, cy, r] of [...tops, ...bottoms]) {
        ctx.moveTo(cx + r + grow, cy);
        ctx.arc(cx, cy, r + grow, 0, Math.PI * 2);
      }
      ctx.rect(x0 + 2 - grow, top + 5 - grow, w - 4 + grow * 2, thick - 9 + grow * 2);
      ctx.fill();
    };
    ctx.fillStyle = PINK; // outline
    shape(1);
    ctx.fillStyle = CLOUD;
    shape(0);
    // soft pink shadow along the bottom, little white shine on top
    ctx.fillStyle = "#f3c6ec";
    for (const [cx, cy, r] of bottoms) {
      ctx.beginPath();
      ctx.arc(cx, cy + 1, Math.max(1, r - 2), 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < tops.length; k += 2) {
      const [cx, cy, r] = tops[k];
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - r + 3), 2, 2);
    }
  };

  // Finds every cloud island on screen (in PINK CLOUDS) and draws each one as a single cloud
  const drawCloudIslands = (ctx: CanvasRenderingContext2D, cam: number) => {
    const isCloud = (c: Column) => c.zone === Z_CLOUDS && c.ground >= 0 && !c.pipe;
    const first = Math.floor(cam / T);
    const last = first + Math.ceil(W / T) + 1;
    let col = first;
    // start from the beginning of an island that sticks out on the left
    while (col > first - 30 && isCloud(colAt(col - 1)) && colAt(col - 1).ground === colAt(col).ground && isCloud(colAt(col))) col--;
    while (col <= last) {
      const c = colAt(col);
      if (!isCloud(c)) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < col + 40 && isCloud(colAt(end)) && colAt(end).ground === c.ground) end++;
      drawCloud(ctx, col * T - cam, end * T - cam, c.ground * T, col);
      col = end;
    }
  };

  const drawGround = (ctx: CanvasRenderingContext2D, c: Column, col: number, x: number) => {
    const s = state.current;
    const gy = c.ground * T;
    if (c.pipe) return;
    if (c.zone === VOID_ZONE) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = GREEN;
      ctx.fillRect(x, gy, T, 2);
      // weed pattern in the floor
      if (gy < H - 12) drawPixels(ctx, LEAF, x + 4, gy + 6, { G: DARK_GREEN, D: "#10401a" });
      return;
    }
    if (c.zone === Z_TREES) {
      // Dark soil with crooked roots
      ctx.fillStyle = TREE_SOIL;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = TREE_ROOT;
      const o = (col * 5) % 8;
      ctx.fillRect(x + o, gy + 5, 5, 1);
      ctx.fillRect(x + o + 4, gy + 6, 1, 4);
      const o2 = (col * 3) % 9;
      ctx.fillRect(x + o2 + 2, gy + 16, 6, 1);
      ctx.fillRect(x + o2 + 2, gy + 17, 1, 3);
      ctx.fillStyle = TREE_TOP;
      ctx.fillRect(x, gy, T, 2);
      return;
    }
    if (c.zone === Z_SMOKE) {
      // A floor made of smoke, gently puffing
      const wob = Math.sin(s.t * 2 + col * 0.9) * 1.5;
      ctx.fillStyle = SMOKE_SHADE;
      ctx.fillRect(x, gy + 5, T, H - gy);
      ctx.fillStyle = SMOKE_EDGE;
      ctx.beginPath();
      ctx.arc(x + 4, gy + 4 + wob, 5, 0, Math.PI * 2);
      ctx.arc(x + 12, gy + 4 - wob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.beginPath();
      ctx.arc(x + 4, gy + 5 + wob, 5, 0, Math.PI * 2);
      ctx.arc(x + 12, gy + 5 - wob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x, gy + 5, T, 4);
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.fillRect(x + ((col * 7 + Math.floor(s.t * 6)) % 14), gy + 15, 3, 1);
      ctx.fillRect(x + ((col * 11 + Math.floor(s.t * 4)) % 13), gy + 24, 4, 1);
      return;
    }
    if (c.zone === 3) {
      // Cloud islands are drawn as whole floating clouds in drawCloudIslands
      return;
    }
    if (c.zone === 2) {
      ctx.fillStyle = ROOF;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = ROOF_LINE;
      for (let yy = gy + 6; yy < H; yy += 8) ctx.fillRect(x, yy, T, 1);
      ctx.fillRect(x + (col % 2) * 8 + 3, gy + 6, 1, H - gy - 6);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 1);
      return;
    }
    if (c.zone === 1) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 2);
      for (let yy = gy + 5; yy + 8 < H; yy += 14) {
        ctx.fillStyle = DARK_PINK;
        ctx.fillRect(x + 4, yy, 8, 8);
        ctx.fillStyle = INK;
        ctx.fillRect(x + 6, yy + 2, 4, 4);
        ctx.fillStyle = PINK;
        ctx.fillRect(x + 7, yy + 3, 2, 2);
      }
      return;
    }
    if (c.zone === LEVEL_SNOW) {
      // a thick layer of snow on dark earth
      ctx.fillStyle = "#5a4636";
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = "#453427";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 14, 3, 2);
      ctx.fillStyle = "#dfeef6";
      ctx.fillRect(x, gy, T, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#b8d2e2";
      ctx.fillRect(x + ((col * 5) % 10) + 2, gy + 5, 4, 1);
      ctx.fillStyle = "#dfeef6";
      ctx.fillRect(x + ((col * 3) % 12), gy + 7, 3, 2); // drips of snow
      return;
    }
    if (c.zone === LEVEL_ZONE) {
      // rich soil with grass on top and little tufts
      ctx.fillStyle = WL_SOIL;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = "#1e3417";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 9, 2, 2);
      ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 19, 2, 2);
      ctx.fillStyle = WL_GRASS;
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#a6f07e";
      ctx.fillRect(x + ((col * 3) % 12) + 1, gy - 2, 1, 2);
      ctx.fillRect(x + ((col * 7) % 12) + 3, gy - 1, 1, 1);
      ctx.fillStyle = "#3f8a34";
      ctx.fillRect(x, gy + 3, T, 1);
      return;
    }
    if (drawFieldGround(ctx, c, col, x, gy)) return;
    ctx.fillStyle = INK;
    ctx.fillRect(x, gy, T, H - gy);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, gy, T, 2);
    ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 7, 2, 2);
    ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 20, 2, 2);
    void s;
  };

  // A spinning gear (TOP SHELF FIELD, under the ground)
  const drawGear = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number) => {
    ctx.fillStyle = "#5a606e";
    for (let k = 0; k < 8; k++) {
      const a = angle + (k * Math.PI) / 4;
      ctx.fillRect(Math.round(cx + Math.cos(a) * (r + 1) - 1.5), Math.round(cy + Math.sin(a) * (r + 1) - 1.5), 3, 3);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8c94a2";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2d34";
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
    // a spoke so you can see it turning
    ctx.fillRect(Math.round(cx + Math.cos(angle) * (r - 3)) - 1, Math.round(cy + Math.sin(angle) * (r - 3)) - 1, 2, 2);
  };

  // Ground for the cover-art fields. Returns false for fields that keep the plain look.
  const drawFieldGround = (ctx: CanvasRenderingContext2D, c: Column, col: number, x: number, gy: number) => {
    const s = state.current;
    const depth = H - gy;
    if (c.zone === F_GAF) {
      // dark soil with a row of little nugs on top
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#2e6e28";
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#5cb84a";
      ctx.fillRect(x + 1, gy - 1, 5, 3);
      ctx.fillRect(x + 9, gy - 1, 6, 3);
      ctx.fillStyle = "#ff8c28";
      ctx.fillRect(x + 3, gy, 1, 1);
      ctx.fillRect(x + 12, gy, 1, 1);
      ctx.fillStyle = "#2e6e28";
      ctx.fillRect(x + ((col * 7) % 11) + 2, gy + 9, 3, 3);
      ctx.fillStyle = "#5cb84a";
      ctx.fillRect(x + ((col * 7) % 11) + 3, gy + 9, 1, 1);
      return true;
    }
    if (c.zone === F_PSP) {
      // black plastic with d-pads and buttons
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#4aa3ff";
      ctx.fillRect(x, gy, T, 2);
      ctx.fillStyle = "#3c3c48";
      if (col % 2 === 0) {
        ctx.fillRect(x + 4, gy + 8, 7, 3);
        ctx.fillRect(x + 6, gy + 6, 3, 7);
      } else {
        ctx.fillStyle = "#ff5fe0";
        ctx.fillRect(x + 4, gy + 7, 2, 2);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(x + 8, gy + 10, 2, 2);
      }
      return true;
    }
    if (c.zone === F_IPOD) {
      // polished silver, like the back of an old iPod, with a shine sliding across
      ctx.fillStyle = "#c9ced8";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#e9ecf2";
      ctx.fillRect(x, gy + 4, T, 3);
      ctx.fillStyle = "#a9afbb";
      ctx.fillRect(x, gy + 12, T, 2);
      ctx.fillRect(x, gy + 20, T, 1);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, gy + 1, T, 2);
      // moving diagonal shine
      const shine = (((col * T - s.t * 40) % 96) + 96) % 96;
      if (shine < T) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let k = 0; k < 10; k++) ctx.fillRect(x + ((shine + k) % T), gy + 3 + k, 2, 1);
      }
      return true;
    }
    if (c.zone === F_SPT) {
      // a rainbow floor
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      RAINBOW_STRIPES.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, gy + i, T, 1);
      });
      ctx.fillStyle = "#ff78c8";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 11, 2, 2);
      return true;
    }
    if (c.zone === F_TOP) {
      // riveted steel with gears turning underneath
      ctx.fillStyle = "#3a3e48";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#d7dce6";
      ctx.fillRect(x, gy + 1, T, 2);
      ctx.fillStyle = "#8c94a2";
      ctx.fillRect(x, gy + 3, T, 2);
      ctx.fillStyle = INK;
      ctx.fillRect(x + 2, gy + 2, 1, 1);
      ctx.fillRect(x + 13, gy + 2, 1, 1);
      if (depth > 22) drawGear(ctx, x + 8, gy + 15, 5, s.t * 2.2 * (col % 2 === 0 ? 1 : -1) + (col % 2) * 0.4);
      return true;
    }
    if (c.zone === F_CORAL) {
      // sand, with corals growing out of it here and there
      ctx.fillStyle = "#e8cf8f";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#5a3c1e";
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#f7e6b8";
      ctx.fillRect(x, gy + 1, T, 1);
      ctx.fillStyle = "#c2a060";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 6, 1, 1);
      ctx.fillRect(x + ((col * 5) % 10) + 4, gy + 12, 1, 1);
      const pick = hash(col * 3 + 11);
      if (pick < 0.45 && !c.pipe) {
        const which = pick < 0.15 ? 0 : pick < 0.3 ? 1 : 2 + (Math.floor(s.t * 2 + col) % 2);
        drawPixels(ctx, CORALS[which], x + 1 + Math.floor(hash(col) * 2), gy - 14, CORAL_COLORS, 2);
      }
      return true;
    }
    return false;
  };

  const drawBrick = (ctx: CanvasRenderingContext2D, x: number, by: number, zone: number) => {
    // Cover-art fields: each has its own thing to jump on
    if (zone === F_GAF || zone === LEVEL_ZONE) return drawPixels(ctx, NUG, x, by, NUG_COLORS);
    if (zone === LEVEL_SNOW) {
      // an ice block
      ctx.fillStyle = "#3a7fa8";
      ctx.fillRect(x, by, T, T - 3);
      ctx.fillStyle = "#bfe8ff";
      ctx.fillRect(x + 1, by + 1, T - 2, T - 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 1, by + 1, T - 2, 2);
      ctx.fillRect(x + 3, by + 5, 1, 4);
      ctx.fillRect(x + 4, by + 4, 1, 1);
      ctx.fillStyle = "#8fd0f0";
      ctx.fillRect(x + 9, by + 7, 4, 1);
      return;
    }
    if (zone === F_PSP) return drawPixels(ctx, HANDHELD, x, by + 1, HANDHELD_COLORS);
    if (zone === F_IPOD) return drawPixels(ctx, PLAYER, x, by, PLAYER_COLORS);
    if (zone === F_SPT) return drawPixels(ctx, RAINBOW, x, by, RAINBOW_COLORS);
    if (zone === F_TOP) return drawPixels(ctx, METAL, x, by, METAL_COLORS);
    if (zone === F_CORAL) return drawPixels(ctx, REEF, x, by, REEF_COLORS);
    if (zone === Z_TREES) {
      // a crooked branch
      ctx.fillStyle = INK;
      ctx.fillRect(x, by, T, 7);
      ctx.fillStyle = TREE_ROOT;
      ctx.fillRect(x, by + 1, T, 5);
      ctx.fillStyle = TREE_TOP;
      ctx.fillRect(x, by, T, 1);
      ctx.fillStyle = TREE_SOIL;
      ctx.fillRect(x + ((x & 8) ? 3 : 10), by + 2, 2, 2);
      return;
    }
    if (zone === Z_SMOKE) {
      // a puff of smoke
      ctx.fillStyle = SMOKE_EDGE;
      ctx.fillRect(x, by + 1, T, T - 4);
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.fillRect(x, by + 2, T, T - 6);
      return;
    }
    if (zone === 3 || zone === VOID_ZONE) {
      // cloud puffs / void blocks
      ctx.fillStyle = zone === 3 ? CLOUD : "#2d1838";
      ctx.fillRect(x, by + 2, T, T - 4);
      ctx.fillStyle = zone === 3 ? PINK : GREEN;
      ctx.fillRect(x, by + 2, T, 1);
      return;
    }
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by, T, T);
    ctx.fillStyle = PINK;
    ctx.fillRect(x + 1, by + 1, T - 2, T - 2);
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by + 7, T, 1);
    ctx.fillRect(x + 7, by, 1, 7);
    ctx.fillRect(x + 3, by + 8, 1, 8);
    ctx.fillRect(x + 11, by + 8, 1, 8);
  };

  const drawPipe = (ctx: CanvasRenderingContext2D, c: Column, x: number) => {
    const s = state.current;
    const top = c.ground * T;
    const left = c.pipe === 1;
    // body
    ctx.fillStyle = INK;
    ctx.fillRect(x, top + 6, T, H - top);
    ctx.fillStyle = c.pipeUsed ? "#6c6474" : DARK_PINK;
    ctx.fillRect(x + (left ? 2 : 0), top + 6, T - 2, H - top);
    ctx.fillStyle = c.pipeUsed ? "#8a8292" : PINK;
    if (left) ctx.fillRect(x + 4, top + 6, 3, H - top);
    // rim
    ctx.fillStyle = INK;
    ctx.fillRect(x - (left ? 2 : 0), top, T + 2, 7);
    ctx.fillStyle = c.pipeUsed ? "#8a8292" : PINK;
    ctx.fillRect(x - (left ? 1 : 0), top + 1, T + (left ? 1 : -1), 5);
    // the dark opening, with a little glow while it can still be used
    if (!c.pipeUsed && left) {
      const glow = Math.floor(s.t * 3) % 2 === 0 ? "#ff7a00" : "#ffc800";
      ctx.fillStyle = glow;
      ctx.fillRect(x + 10, top - 6, 12, 2);
      ctx.fillStyle = INK;
      ctx.fillRect(x + 15, top - 10, 2, 3);
    }
  };

  // The pink start screen: two big blocks
  const drawHome = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    ctx.fillStyle = "#e05fc8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d24fba";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.fillText("SUPER PINKMANE", W / 2 + 1, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("SUPER PINKMANE", W / 2, 6);
    const blocks = [
      { title: ["PINK RUN", "INFINITE"], text: ["SURVIVE THE", "LONGEST, COLLECT", "THE HIGHEST", "SCORE!"], foot: `HI ${pad(s.best)}` },
      {
        title: ["PINK", "LEVELS"],
        text: ["BEAT THE LEVELS,", "HIT THE BONG,", "SET THE", "FASTEST TIME!"],
        foot: `${Object.keys(s.levelBest).length}/${LEVELS.length} DONE`,
      },
    ];
    blocks.forEach((b, i) => {
      const bx = i === 0 ? 8 : W / 2 + 4;
      const bw = W / 2 - 12;
      const by = 20;
      const bh = 124;
      const picked = s.homeChoice === i;
      const on = Math.floor(s.t * 3) % 2 === 0;
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = picked ? (on ? "#ffffff" : "#ffd6f4") : "#8a1f86";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = picked ? "#ff8ae0" : "#b43aa4";
      ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = INK;
      b.title.forEach((t, k) => ctx.fillText(t, bx + bw / 2, by + 8 + k * 11));
      ctx.fillStyle = picked ? INK : "#f8d8f0";
      b.text.forEach((t, k) => ctx.fillText(t, bx + bw / 2, by + 36 + k * 10));
      // a little picture: you running / the bong
      if (i === 0) {
        const sprite = spritesRef.current[s.outfit];
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          ctx.drawImage(sprite, (Math.floor(s.t * 6) % 2) * SPRITE_W, 0, SPRITE_W, SPRITE_H, bx + bw / 2 - 12, by + 78, SPRITE_W, SPRITE_H);
        }
      } else {
        drawPixels(ctx, BONG, bx + bw / 2 - 10, by + 80, BONG_COLORS, 2);
      }
      ctx.fillStyle = INK;
      ctx.fillText(b.foot, bx + bw / 2, by + bh - 11);
    });
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText("< > TO PICK, OK TO GO", W / 2, H - 12);
    }
  };

  // ---------- The level map ----------
  const mapUnlocked = (i: number) => i === 0 || !!state.current.levelBest[String(i)];

  // The points walked from stop `from` to the next/previous stop `to`
  const mapPath = (from: number, to: number): [number, number][] => {
    const A = MAP_NODES[from];
    const B = MAP_NODES[to];
    if (to === from + 1) return [[A.x, A.y], ...B.path, [B.x, B.y]];
    return [[A.x, A.y], ...[...A.path].reverse(), [B.x, B.y]];
  };

  // Arrow keys / WASD on the map: walk along the path that leaves your stop in that direction
  const mapMove = (dx: number, dy: number) => {
    const s = state.current;
    if (s.mapWalk) return;
    const here = s.levelPick;
    for (const to of [here + 1, here - 1]) {
      if (to < 0 || to >= MAP_NODES.length) continue;
      const pts = mapPath(here, to);
      const [x0, y0] = pts[0];
      const [x1, y1] = pts[1];
      const sx = Math.sign(x1 - x0);
      const sy = Math.sign(y1 - y0);
      if ((dx !== 0 && sx === dx) || (dy !== 0 && sy === dy)) {
        if (!mapUnlocked(to)) {
          s.flash = 1.5;
          s.flashText = `LOCKED - BEAT LVL ${to} FIRST`;
          beep(200, 140, 0.12, 0.05, "square");
          return;
        }
        s.mapWalk = { pts, d: 0, to };
        return;
      }
    }
  };

  const updateMap = (dt: number) => {
    const s = state.current;
    const w = s.mapWalk;
    if (!w) return;
    w.d += MAP_WALK_SPEED * dt;
    let total = 0;
    for (let i = 1; i < w.pts.length; i++) total += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
    if (w.d >= total) {
      s.levelPick = w.to;
      s.mapWalk = null;
      beep(660, 880, 0.06, 0.04, "square");
    }
  };

  // Where you are on the map right now (walking or standing), and which way you face
  const mapPos = (): { x: number; y: number; face: number; moving: boolean } => {
    const s = state.current;
    const w = s.mapWalk;
    if (!w) {
      const n = MAP_NODES[s.levelPick];
      return { x: n.x, y: n.y, face: 1, moving: false };
    }
    let d = w.d;
    for (let i = 1; i < w.pts.length; i++) {
      const [x0, y0] = w.pts[i - 1];
      const [x1, y1] = w.pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (d <= len || i === w.pts.length - 1) {
        const k = len > 0 ? Math.min(1, d / len) : 1;
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, face: x1 < x0 ? -1 : 1, moving: true };
      }
      d -= len;
    }
    const n = MAP_NODES[w.to];
    return { x: n.x, y: n.y, face: 1, moving: true };
  };

  const drawMapIcon = (ctx: CanvasRenderingContext2D, icon: MapIcon, x: number, y: number) => {
    const s = state.current;
    ctx.fillStyle = INK;
    if (icon === "weed") drawPixels(ctx, LEAF, x - 7, y - 7, { G: GREEN, D: DARK_GREEN }, 2);
    else if (icon === "snow") {
      ctx.fillStyle = "#2f5d4a";
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 8, y + 6);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 2);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 3, y - 2);
      ctx.fill();
    } else if (icon === "speaker") {
      ctx.fillRect(x - 6, y - 7, 12, 14);
      ctx.fillStyle = "#777";
      ctx.beginPath();
      ctx.arc(x, y - 3, 2, 0, Math.PI * 2);
      ctx.arc(x, y + 3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon === "roof") {
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.fill();
      ctx.fillStyle = "#5a2a6a";
      ctx.fillRect(x - 6, y, 12, 7);
      ctx.fillStyle = "#ffd23c";
      ctx.fillRect(x - 3, y + 2, 2, 2);
      ctx.fillRect(x + 2, y + 2, 2, 2);
    } else if (icon === "cloud") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 4, y + 1, 4, 0, Math.PI * 2);
      ctx.arc(x + 1, y - 2, 5, 0, Math.PI * 2);
      ctx.arc(x + 5, y + 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon === "tree") {
      ctx.strokeStyle = "#3a1f5a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 7);
      ctx.lineTo(x, y - 1);
      ctx.lineTo(x - 5, y - 6);
      ctx.moveTo(x, y - 1);
      ctx.lineTo(x + 4, y - 7);
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x + 5, y - 1);
      ctx.stroke();
    } else if (icon === "ship") {
      ctx.fillStyle = "#7a4a3a";
      ctx.fillRect(x - 7, y + 1, 14, 4);
      ctx.fillStyle = INK;
      ctx.fillRect(x, y - 7, 1, 8);
      ctx.fillStyle = "#8f8499";
      ctx.fillRect(x + 1, y - 6, 5, 4);
      ctx.fillStyle = "#f5f0e6";
      ctx.fillRect(x - 5, y - 2, 3, 3);
    } else if (icon === "coral") drawPixels(ctx, CORALS[0], x - 7, y - 7, CORAL_COLORS, 2);
    else if (icon === "bong") {
      drawPixels(ctx, BONG, x - 10, y - 20, BONG_COLORS, 2);
      void s;
    }
  };

  // The level map screen
  const drawLevelSelect = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    // grassy map
    ctx.fillStyle = "#7cc86a";
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = k % 2 ? "#6cb85c" : "#8cd87a";
      ctx.fillRect(Math.round(hash(k) * W), Math.round(hash(k + 50) * H), 6 + Math.round(hash(k + 9) * 10), 3);
    }
    for (let k = 0; k < 9; k++) {
      const lx = Math.round(hash(k + 200) * (W - 20));
      const ly = 36 + Math.round(hash(k + 300) * (H - 60));
      drawPixels(ctx, LEAF, lx, ly + Math.round(Math.sin(s.t * 2 + k)), { G: "#4e9e44", D: "#3a7a32" }, 1);
    }
    // the path
    for (let i = 1; i < MAP_NODES.length; i++) {
      const pts = mapPath(i - 1, i);
      const open = mapUnlocked(i);
      for (let j = 1; j < pts.length; j++) {
        const [x0, y0] = pts[j - 1];
        const [x1, y1] = pts[j];
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = 0; d <= len; d += 6) {
          const px = Math.round(x0 + ((x1 - x0) * d) / len);
          const py = Math.round(y0 + ((y1 - y0) * d) / len);
          ctx.fillStyle = INK;
          ctx.fillRect(px - 2, py - 2, 5, 5);
          ctx.fillStyle = open ? "#f2dea0" : "#9aa08a";
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
      }
    }
    // the stops
    MAP_NODES.forEach((n, i) => {
      const open = mapUnlocked(i);
      const done = !!s.levelBest[String(i + 1)];
      const big = n.icon === "bong";
      const r = big ? 14 : 11;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = open ? MAP_BADGE[n.icon] : "#8a8a8a";
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (open) drawMapIcon(ctx, n.icon, n.x, n.y + (big ? 8 : 0));
      else {
        // padlock
        ctx.fillStyle = INK;
        ctx.fillRect(n.x - 4, n.y - 1, 9, 7);
        ctx.fillRect(n.x - 3, n.y - 5, 1, 4);
        ctx.fillRect(n.x + 3, n.y - 5, 1, 4);
        ctx.fillRect(n.x - 3, n.y - 6, 7, 1);
        ctx.fillStyle = "#ffd23c";
        ctx.fillRect(n.x, n.y + 1, 1, 2);
      }
      if (done) {
        // gold star: beaten
        ctx.fillStyle = INK;
        ctx.fillRect(n.x + r - 5, n.y - r - 1, 7, 7);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(n.x + r - 4, n.y - r, 5, 5);
      }
      if (big) {
        ctx.font = `8px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = INK;
        ctx.fillText("BOSS FIGHT", n.x - 12, n.y + r + 4);
        ctx.fillStyle = "#ff2832";
        ctx.fillText("BOSS FIGHT", n.x - 13, n.y + r + 3);
      }
    });
    // you
    const me = mapPos();
    const sprite = spritesRef.current[s.outfit];
    const frame = me.moving ? Math.floor(s.t * 8) % 2 : 0;
    const px = Math.round(me.x - SPRITE_W / 2);
    const py = Math.round(me.y - 8 - SPRITE_H + (me.moving ? 0 : Math.sin(s.t * 3)));
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.save();
      if (me.face < 0) {
        ctx.translate(px + SPRITE_W, py);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
      } else {
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, px, py, SPRITE_W, SPRITE_H);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = PINK;
      ctx.fillRect(px + HB_X, py + HB_Y, HB_W, HB_H);
    }
    // info about the stop you're on
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    if (!s.mapWalk) {
      const i = s.levelPick;
      const lv = LEVELS[i];
      const last = i === MAP_NODES.length - 1;
      textBox(ctx, lv ? `LVL ${i + 1}: ${lv.name}` : last ? `LVL ${i + 1}: THE FINAL BOSS` : `LVL ${i + 1}`, 6);
      const best = s.levelBest[String(i + 1)];
      textBox(ctx, lv ? (best ? `BEST ${fmtTime(best)}  -  OK TO PLAY` : "OK TO PLAY") : "COMING SOON", 18);
    }
    if (s.flash > 0) textBox(ctx, s.flashText, 34);
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = INK;
      ctx.fillText("ARROWS / WASD TO WALK, ESC BACK", W / 2 + 1, H - 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("ARROWS / WASD TO WALK, ESC BACK", W / 2, H - 10);
    }
  };

  // You hit the bong
  const drawLevelDone = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const since = s.t - s.doneAt;
    if (since < 0.6) return; // let the smoke show first
    ctx.fillStyle = "rgba(22, 60, 20, 0.75)";
    ctx.fillRect(0, 0, W, H);
    textBox(ctx, `LVL ${s.level} DONE!`, 20);
    textBox(ctx, LEVELS[s.level - 1]?.name ?? "", 34);
    textBox(ctx, `TIME ${fmtTime(s.levelMs)}`, 56);
    const best = s.levelBest[String(s.level)];
    if (s.newBest) {
      if (Math.floor(s.t * 4) % 2 === 0) textBox(ctx, "NEW BEST TIME!", 70);
    } else if (best) {
      textBox(ctx, `YOUR BEST ${fmtTime(best)}`, 70);
    }
    textBox(ctx, "PINKMANE HIT THE BONG", 92);
    if (since > 1 && Math.floor(s.t * 2) % 2 === 0) textBox(ctx, "OK TO GO ON", 120);
  };

  // Thin line at the bottom: the zones you ran through (solid), the zones coming up (faded),
  // you (pink marker) and the next troll (green face at the end)
  const drawProgress = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    if (s.levelMode) {
      const end = s.bong ? s.bong.x : s.cols.length * T;
      const x0 = 10;
      const x1 = W - 20;
      const y = H - 4;
      const part = Math.max(0, Math.min(1, s.farthest / end));
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 4);
      ctx.fillStyle = "#4a3d55";
      ctx.fillRect(x0, y, x1 - x0, 2);
      ctx.fillStyle = WL_GRASS;
      ctx.fillRect(x0, y, Math.round((x1 - x0) * part), 2);
      // the boss arena
      const ax = x0 + Math.round((x1 - x0) * Math.min(1, (s.bossCol * T) / end));
      ctx.fillStyle = "#ff283c";
      ctx.fillRect(ax, y - 2, 2, 6);
      // you
      const me = x0 + Math.round((x1 - x0) * part);
      ctx.fillStyle = INK;
      ctx.fillRect(me - 2, y - 5, 5, 4);
      ctx.fillStyle = PINK;
      ctx.fillRect(me - 1, y - 4, 3, 2);
      // the bong at the end
      drawPixels(ctx, BONG, x1 + 4, y - 11, BONG_COLORS, 1);
      return;
    }
    const lo = s.bossCount * BOSS_EVERY;
    const hi = lo + BOSS_EVERY;
    const x0 = 10;
    const x1 = W - 20;
    const y = H - 4;
    const px = (v: number) => Math.round(x0 + Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (x1 - x0));
    ctx.fillStyle = INK;
    ctx.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 4);
    ctx.fillStyle = "#4a3d55";
    ctx.fillRect(x0, y, x1 - x0, 2);
    // zones already done
    const marks = s.zoneMarks;
    for (let i = 0; i < marks.length; i++) {
      const from = px(marks[i].score);
      const to = px(Math.min(i + 1 < marks.length ? marks[i + 1].score : s.score, s.score));
      if (to > from) {
        ctx.fillStyle = ZONE_COLORS[marks[i].zone % ZONE_COLORS.length];
        ctx.fillRect(from, y, to - from, 2);
      }
    }
    // zones coming up (a guess: they're far away in distance, your points add on top)
    const curZone = Math.floor(Math.floor(s.farthest / T) / ZONE_LEN);
    let segStart = s.score;
    ctx.globalAlpha = 0.4;
    for (let k = 0; k < 12 && segStart < hi; k++) {
      const zoneIdx = curZone + k;
      const end = Math.min(hi, (zoneIdx + 1) * ZONE_LEN + s.bonus);
      if (end > segStart) {
        ctx.fillStyle = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
        ctx.fillRect(px(segStart), y, px(end) - px(segStart), 2);
        if (end < hi) {
          ctx.fillStyle = INK;
          ctx.fillRect(px(end), y - 1, 1, 4);
        }
      }
      segStart = Math.max(segStart, end);
    }
    ctx.globalAlpha = 1;
    // you
    const me = px(s.score);
    ctx.fillStyle = INK;
    ctx.fillRect(me - 2, y - 5, 5, 4);
    ctx.fillStyle = PINK;
    ctx.fillRect(me - 1, y - 4, 3, 2);
    // the troll waiting at the end
    const tx = x1 + 3;
    ctx.fillStyle = INK;
    ctx.fillRect(tx - 1, y - 5, 9, 8);
    ctx.fillStyle = s.bossState === "fight" && Math.floor(s.t * 6) % 2 === 0 ? "#ffffff" : "#6aa84f";
    ctx.fillRect(tx, y - 4, 7, 6);
    ctx.fillStyle = "#c81428";
    ctx.fillRect(tx + 1, y - 3, 1, 1);
    ctx.fillRect(tx + 4, y - 3, 1, 1);
    ctx.fillStyle = "#a0e65a";
    ctx.fillRect(tx + 1, y, 3, 2);
  };

  // Frozen screen before a boss fight: pick the fireball or the ice ray (shown flying for real)
  const drawSpellPick = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const b = s.boss;
    ctx.fillStyle = "rgba(22, 12, 29, 0.95)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("PICK YOUR SPELL", W / 2, 14);
    ctx.fillStyle = "#ffc800";
    const need = b ? b.maxHp : s.lboss ? s.lboss.maxHp : 0;
    const shots = need + BOSS_SPARE_SHOTS;
    ctx.fillText(`${shots} SHOTS, IT TAKES ${need}`, W / 2, 26);
    for (let i = 0; i < 2; i++) {
      const bx = i === 0 ? W / 2 - 78 : W / 2 + 14;
      const by = 42;
      const bw = 64;
      const bh = 58;
      const picked = s.spellChoice === i;
      ctx.fillStyle = picked ? (Math.floor(s.t * 4) % 2 === 0 ? PINK : "#ff5fe0") : "#555555";
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "#111111";
      ctx.fillRect(bx, by, bw, bh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      // a little floor
      ctx.fillStyle = "#333333";
      ctx.fillRect(bx, by + bh - 8, bw, 8);
      if (i === 0) {
        // the real fireball, bouncing along
        const t = (s.t * 0.9) % 1;
        const fx = Math.round(bx + 4 + t * (bw - 12));
        const fy = Math.round(by + bh - 14 - Math.abs(Math.sin(s.t * 7)) * 22);
        ctx.fillStyle = "#ff7a00";
        ctx.fillRect(fx, fy, 5, 5);
        ctx.fillStyle = "#ffc800";
        ctx.fillRect(fx + 1, fy + 1, 3, 3);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(fx + 2, fy + 2, 1, 1);
      } else {
        // the real ice ray, flying straight
        const t = (s.t * 1.3) % 1;
        const ix = Math.round(bx - 6 + t * (bw + 12));
        const iy = by + bh - 24;
        ctx.fillStyle = "#1d4fa8";
        ctx.fillRect(ix - 3, iy, 10, 4);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(ix - 2, iy + 1, 8, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(ix + 4, iy + 1, 2, 2);
        for (let k = 1; k < 5; k++) {
          ctx.fillStyle = ICE[k % 4];
          ctx.fillRect(ix - 3 - k * 4, iy + ((k * 3) % 4), 2, 1);
        }
      }
      ctx.restore();
      ctx.fillStyle = picked ? "#ffffff" : "#9b8fa6";
      ctx.fillText(i === 0 ? "FIRE" : "ICE", bx + bw / 2, by + bh + 6);
      ctx.fillText(i === 0 ? "BOUNCES" : "STRAIGHT", bx + bw / 2, by + bh + 16);
    }
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText("< > PICK, OK TO FIGHT", W / 2, H - 20);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }
    if (s.mode === "home") {
      drawHome(ctx);
      return;
    }
    if (s.mode === "levelSelect") {
      drawLevelSelect(ctx);
      return;
    }

    const cam = Math.round(s.cam);
    const viewZone = s.inBonus ? VOID_ZONE : colAt(Math.floor((cam + W / 2) / T)).zone;

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
    ctx.translate(0, -Math.round(s.camY));

    drawBackground(ctx, viewZone);
    if (!s.inBonus && cam < 0) {
      drawSecretSign(ctx, cam, -10, MY_GOATS);
      drawSecretSign(ctx, cam, -22, SHOUT_OUTS, "SHOUT OUT:");
    }
    if (!s.inBonus) drawCloudIslands(ctx, cam);

    const firstCol = Math.floor(cam / T);

    // Level: ground, bricks, thin lines, bonus blocks, pipes
    for (let col = firstCol; col <= firstCol + W / T + 1; col++) {
      const c = colAt(col);
      const x = col * T - cam;
      if (c.ground >= 0 && !c.pipe) drawGround(ctx, c, col, x);
      if (c.pipe) drawPipe(ctx, c, x);
      if (c.block >= 0) drawBrick(ctx, x, c.block * T, c.zone);
      if (c.block2 >= 0) drawBrick(ctx, x, c.block2 * T, c.zone);
      if (c.line >= 0) {
        const ly = c.line * T;
        const blinking = c.crumble > 0 && Math.floor(s.t * (c.crumble < 1 ? 16 : 8)) % 2 === 0;
        ctx.fillStyle = INK;
        ctx.fillRect(x, ly, T, c.lineTh + 1);
        const fieldLine: Record<number, string> = {
          [F_GAF]: "#5cb84a",
          [F_PSP]: "#4aa3ff",
          [F_IPOD]: "#f5f5fa",
          [F_TOP]: "#c9ced8",
          [F_CORAL]: "#ff6f91",
          [LEVEL_ZONE]: "#4caa3c",
          [LEVEL_SNOW]: "#9fdcff",
        };
        ctx.fillStyle = blinking
          ? "#ffffff"
          : c.zone === VOID_ZONE
            ? LIGHT_GREEN
            : c.fragile > 0
              ? "#ff5fe0"
              : fieldLine[c.zone] ?? PINK;
        ctx.fillRect(x, ly, T, c.lineTh);
        if (c.zone === F_SPT && !blinking) {
          // rainbow lines
          for (let i = 0; i < c.lineTh; i++) {
            ctx.fillStyle = RAINBOW_STRIPES[i % RAINBOW_STRIPES.length];
            ctx.fillRect(x, ly + i, T, 1);
          }
        }
        if (c.zone === F_TOP && !blinking) {
          ctx.fillStyle = INK;
          ctx.fillRect(x + 7, ly + Math.floor(c.lineTh / 2), 1, 1);
        }
        // vanishing lines get little dashes so you can spot them
        if (c.fragile > 0 && !blinking) {
          ctx.fillStyle = INK;
          ctx.fillRect(x + 4, ly, 1, c.lineTh);
          ctx.fillRect(x + 11, ly, 1, c.lineTh);
        }
      }
      if (c.bonus >= 0) {
        const by = c.bonus * T - (c.bump > 0 ? Math.round(Math.sin((c.bump / 0.15) * Math.PI) * 4) : 0);
        if (c.used) {
          ctx.fillStyle = "#555555";
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = "#777777";
          ctx.fillRect(x + 2, by + 2, T - 4, T - 4);
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = Math.floor(s.t * 3) % 2 === 0 ? "#ff7a00" : PINK;
          ctx.fillRect(x, by, T, 1);
          ctx.fillRect(x, by + T - 1, T, 1);
          ctx.fillRect(x, by, 1, T);
          ctx.fillRect(x + T - 1, by, 1, T);
          drawPixels(ctx, LEAF, x + 4, by + 4, { G: "#ff7a00", D: "#ffc800" }, 1);
        }
      }
    }

    // Leaves and hearts
    for (const l of s.leaves) {
      if (isCoin(l)) {
        // spinning gold coin
        const spin = Math.abs(Math.cos(s.t * 4 + l.x));
        const cw = Math.max(2, Math.round(12 * spin));
        const cx = Math.round(l.x - cam + 7 - cw / 2);
        const cy = l.y + 1 + Math.round(Math.sin(s.t * 4 + l.x) * 2);
        ctx.fillStyle = "#6b4a00";
        ctx.fillRect(cx - 1, cy, cw + 2, 12);
        ctx.fillRect(cx, cy - 1, cw, 14);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(cx, cy, cw, 12);
        ctx.fillStyle = "#b8860b";
        if (cw > 5) ctx.fillRect(cx + Math.floor(cw / 2) - 1, cy + 3, 2, 6);
        ctx.fillStyle = "#fff3a0";
        if (cw > 3) ctx.fillRect(cx + 1, cy + 1, 2, 3);
        continue;
      }
      if (l.small) {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x * 0.05)), { G: LIGHT_GREEN, D: GREEN }, 1);
      } else {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x) * 2), { G: GREEN, D: DARK_GREEN }, 2);
      }
    }
    // Level signs (lore) and the bong at the end
    if (s.levelMode) {
      for (const sg of s.signs) {
        const sx = Math.round(sg.x - cam);
        if (sx < -20 || sx > W + 20) continue;
        const gy = colAt(Math.floor(sg.x / T)).ground * T;
        ctx.fillStyle = "#5a3a1e";
        ctx.fillRect(sx + 7, gy - 14, 2, 14);
        ctx.fillStyle = INK;
        ctx.fillRect(sx, gy - 22, 16, 10);
        ctx.fillStyle = "#c8945a";
        ctx.fillRect(sx + 1, gy - 21, 14, 8);
        ctx.fillStyle = "#5a3a1e";
        ctx.fillRect(sx + 3, gy - 19, 10, 1);
        ctx.fillRect(sx + 3, gy - 16, 7, 1);
      }
      if (s.bong) {
        const bx = Math.round(s.bong.x - cam);
        drawPixels(ctx, BONG, bx, s.bong.y, BONG_COLORS, 2);
        // a little smoke curling out of the top while it waits for you
        if (s.mode !== "levelDone") {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          for (let k = 0; k < 3; k++) {
            const t = (s.t * 0.8 + k / 3) % 1;
            ctx.fillRect(Math.round(bx + 9 + Math.sin(s.t * 3 + k * 2) * 3), Math.round(s.bong.y - 2 - t * 20), 2, 2);
          }
        }
      }
    }

    // The secret jetpack, floating on its shelf
    if (s.jetItem) {
      const ji = s.jetItem;
      const jx = Math.round(ji.x - cam);
      const jy = ji.y - Math.round(Math.abs(Math.sin(s.t * 3)) * 3);
      // Ghostly "MY GOATS" label floating above the jetpack, pulsing like a spirit
      // (kept bright and outlined so it stays readable against any background)
      const ghostAlpha = 0.75 + Math.sin(s.t * 2) * 0.2;
      ctx.save();
      ctx.font = `9px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(190,255,225,0.95)";
      ctx.shadowBlur = 9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(20,10,30,${Math.min(1, ghostAlpha + 0.1)})`;
      ctx.strokeText("MY GOATS", jx + 9, jy - 8);
      ctx.fillStyle = `rgba(230,255,242,${ghostAlpha})`;
      ctx.fillText("MY GOATS", jx + 9, jy - 8);
      ctx.restore();
      // Little reminder that the jetpack's fuel runs out
      ctx.save();
      ctx.font = `6px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`ONLY TILL SCORE ${JET_UNTIL}`, jx + 22, jy + 9);
      ctx.restore();
      drawPixels(ctx, JETPACK, jx, jy, { K: INK, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 2);
      if (Math.floor(s.t * 4) % 2 === 0) {
        ctx.fillStyle = "#ffc800";
        ctx.fillRect(jx - 4, jy + 2, 2, 2);
        ctx.fillRect(jx + 20, jy + 8, 2, 2);
        ctx.fillRect(jx + 8, jy - 5, 2, 2);
      }
    }
    for (const h of s.hearts) {
      const bob = Math.round(Math.sin(s.t * 5 + h.x) * 2);
      drawPixels(ctx, HEART, h.x - cam + 1, h.y + bob + 1, { P: INK }, 2);
      drawPixels(ctx, HEART, h.x - cam, h.y + bob, { P: Math.floor(s.t * 4) % 2 === 0 ? PINK : "#ff5fe0" }, 2);
    }

    // The golden leaf: spins (squashes side to side) and sparkles
    if (s.goldLeaf) {
      const gl = s.goldLeaf;
      const spin = Math.cos(s.t * 3);
      const cx = gl.x - cam + 7;
      const cy = gl.y + 7 + Math.round(Math.sin(s.t * 2.5) * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.15, Math.abs(spin)), 1);
      drawPixels(ctx, LEAF, -8, -8, { G: "#b8860b", D: "#b8860b" }, 2); // dark edge
      drawPixels(ctx, LEAF, -7, -7, { G: spin > 0 ? "#ffd700" : "#ffe866", D: "#b8860b" }, 2);
      ctx.restore();
      ctx.fillStyle = "#fff3a0";
      for (let k = 0; k < 4; k++) {
        const a = s.t * 2 + (k * Math.PI) / 2;
        if ((Math.floor(s.t * 6) + k) % 2 === 0) ctx.fillRect(Math.round(cx + Math.cos(a) * 12), Math.round(cy + Math.sin(a) * 12), 2, 2);
      }
    }

    // Flaming weed leaves (the power-up)
    for (const pu of s.powerups) {
      const x = pu.x - cam;
      const [main, dark] = POWER_COLORS[pu.kind];
      const sparks = pu.kind === "fire" ? FIRE : pu.kind === "ice" ? ICE : TURQ;
      drawPixels(ctx, LEAF, x, pu.y, { G: main, D: dark }, 2);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = sparks[(Math.floor(s.t * 12) + k) % 3];
        ctx.fillRect(Math.round(x + 2 + k * 4 + rand(-1, 1)), Math.round(pu.y - 3 - rand(0, 3)), 2, 2);
      }
    }

    // Fireballs
    for (const f of s.fireballs) {
      const x = Math.round(f.x - cam);
      const y = Math.round(f.y);
      if (f.ice) {
        // a straight icy streak
        ctx.fillStyle = "#1d4fa8";
        ctx.fillRect(x - 3, y, 10, 4);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(x - 2, y + 1, 8, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(f.vx > 0 ? x + 4 : x - 2, y + 1, 2, 2);
        continue;
      }
      ctx.fillStyle = "#ff7a00";
      ctx.fillRect(x, y, 5, 5);
      ctx.fillStyle = "#ffc800";
      ctx.fillRect(x + 1, y + 1, 3, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }

    // Monsters (squashed flat when beaten)
    for (const e of s.enemies) {
      const x = e.x - cam;
      const ez = colAt(Math.floor(e.x / T)).zone;
      if (ez === LEVEL_SNOW) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 8 + e.phase) % 2) || 0;
            const rows = e.vx > 0 ? CROW[frame].map((r) => r.split("").reverse().join("")) : CROW[frame].map((r) => r);
            drawPixels(ctx, e.vx > 0 ? rows : rows.map((r) => r.split("").reverse().join("")), x, e.y, CROW_COLORS, 2);
          } else {
            ctx.fillStyle = "#1e1e28";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, SNOWMAN, x, e.y - bob, SNOWMAN_COLORS, 2);
        } else {
          ctx.fillStyle = "#fafcff";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_IPOD) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 16) % 2) || 0;
            const charging = e.shoot !== undefined && e.shoot < 0.4 && Math.floor(s.t * 16) % 2 === 0;
            drawPixels(ctx, DRONE[frame], x, e.y, charging ? DRONE_COLORS_CHARGING : DRONE_COLORS, 2);
          } else {
            ctx.fillStyle = "#ffd000";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, HORNED, x, e.y - 2 - bob, HORNED_COLORS, 2);
        } else {
          ctx.fillStyle = "#8a5a2b";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_GAF) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 10 + e.phase) % 2) || 0;
            drawPixels(ctx, BAT[frame], x, e.y, BAT_COLORS, 2);
          } else {
            ctx.fillStyle = "#2c2c34";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, BOMB, x, e.y - 2 - bob, Math.floor(s.t * 12) % 2 ? BOMB_COLORS : BOMB_COLORS_2, 2);
        } else {
          // squashed bomb goes poof
          ctx.fillStyle = "#e0283a";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_CORAL || ez === F_TRIPPY) {
        const coral = ez === F_CORAL;
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.floor(s.t * 8 + e.phase) % 2;
            if (coral) {
              // seahorses face the way they swim
              const rows = e.vx > 0 ? SEAHORSE[frame].map((r) => r.split("").reverse().join("")) : SEAHORSE[frame];
              drawPixels(ctx, rows, x, e.y - 2, SEAHORSE_COLORS, 2);
            } else {
              const rows = e.vx > 0 ? DRAGONFLY[frame].map((r) => r.split("").reverse().join("")) : DRAGONFLY[frame];
              drawPixels(ctx, rows, x, e.y, DRAGONFLY_COLORS, 2);
            }
          } else {
            ctx.fillStyle = coral ? "#5a8cff" : "#3c82ff";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, coral ? URCHIN : BACTERIA, x, e.y - bob, coral ? URCHIN_COLORS : BACTERIA_COLORS, 2);
        } else {
          ctx.fillStyle = coral ? "#8c5ad2" : "#3cd23c";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_SPT) {
        // SMALL PRETTY TITTIES FIELD: fairies shitting rainbows, and devil bunnies
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.floor(s.t * 8 + e.phase) % 2;
            // rainbow trail out of her behind, on the side she's flying away from
            const back = e.vx > 0 ? -1 : 1;
            for (let i = 0; i < 6; i++) {
              ctx.fillStyle = RAINBOW_STRIPES[i];
              const wave = Math.round(Math.sin(s.t * 6 + i * 0.3) * 1);
              ctx.fillRect(back > 0 ? x + 12 : x - 14, e.y + 8 + i + wave, 20, 1);
            }
            drawPixels(ctx, FAIRY[frame], x, e.y, FAIRY_COLORS, 2);
          } else {
            ctx.fillStyle = "#9646dc";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, BUNNY, x, e.y - bob, BUNNY_COLORS, 2);
        } else {
          ctx.fillStyle = "#fff0f8";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (e.kind === "flyer") {
        if (e.alive) {
          const frame = Math.abs(Math.floor(s.t * 8 + e.phase) % 2) || 0;
          drawPixels(ctx, FLYER[frame], x, e.y, ez === F_PSP ? PSP_FLYER_COLORS : { G: LIGHT_GREEN, D: DARK_GREEN, W: "#ffffff" }, 2);
        } else {
          ctx.fillStyle = LIGHT_GREEN;
          ctx.fillRect(x + 2, e.y + 10, 14, 3);
        }
      } else if (e.alive) {
        const bob = Math.floor(s.t * 6 + e.x) % 2;
        drawPixels(ctx, HATER, x, e.y - bob, ez === F_PSP ? PSP_WALKER_COLORS : { G: "#8a8a8a", K: INK, W: "#ffffff" }, 2);
      } else {
        ctx.fillStyle = "#8a8a8a";
        ctx.fillRect(x, e.y + 10, 14, 4);
      }
    }

    // The troll (or the bigger giant), with wiggly green stink lines around him
    if (s.boss) {
      const b = s.boss;
      const isGiant = b.kind === "giant";
      const bw = isGiant ? GIANT_W : TR_W;
      const scale = isGiant ? GIANT_SCALE : 2;
      const bx = Math.round(b.x - cam);
      const walking = Math.abs(b.vx) > 5 && b.vy === 0;
      const by = Math.round(b.y) - (walking && Math.floor(s.t * 6) % 2 === 0 ? 1 : 0);
      for (let k = 0; k < (isGiant ? 6 : 4); k++) {
        const lx = bx + 2 + k * (isGiant ? 16 : 13);
        const rise = (s.t * 14 + k * 5) % 10;
        for (let j = 0; j < 7; j++) {
          ctx.fillStyle = j % 2 === 0 ? "#7fc24a" : "#4e8f2a";
          ctx.fillRect(Math.round(lx + Math.sin(s.t * 7 + j * 0.9 + k) * 2), Math.round(by + 4 - rise - j * 2), 1, 2);
        }
      }
      const flash =
        (b.hit > 0 && Math.floor(s.t * 20) % 2 === 0) ||
        (b.dead > 0 && Math.floor(s.t * 14) % 2 === 0) ||
        (b.dazed > 0 && Math.floor(s.t * 10) % 2 === 0);
      const colors = flash ? Object.fromEntries(Object.keys(TROLL_COLORS).map((k) => [k, "#ffffff"])) : TROLL_COLORS;
      drawPixels(ctx, b.facing > 0 ? TROLL_RIGHT : TROLL, bx, by, colors, scale);
      // little health bar over his head
      if (b.dead <= 0 && b.dazed <= 0) {
        const barW = isGiant ? 46 : 30;
        ctx.fillStyle = INK;
        ctx.fillRect(bx + (isGiant ? 9 : 6), by - 7, barW + 2, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(bx + (isGiant ? 10 : 7), by - 6, barW, 2);
        ctx.fillStyle = LIGHT_GREEN;
        ctx.fillRect(bx + (isGiant ? 10 : 7), by - 6, Math.round((barW * Math.max(0, b.hp)) / b.maxHp), 2);
      }
      // a drip hanging off his tongue now and then
      if (!flash && b.dazed <= 0 && Math.floor(s.t * 3) % 2 === 0) {
        ctx.fillStyle = TROLL_COLORS.T;
        const tx = b.facing > 0 ? bx + bw - 12 : bx + 6;
        ctx.fillRect(tx, by + (isGiant ? 39 : 26), 6, 2);
      }
    }

    // On the outfit-select screen, dim everything drawn so far (background, ground, jetpack
    // sign, etc.) so the big character preview below stands out against it
    if (s.mode === "select") {
      ctx.fillStyle = "rgba(10, 6, 14, 0.55)";
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }

    // Bubbles (coral field)
    for (const b of s.bubbles) {
      const bx = Math.round(b.x - cam);
      const by = Math.round(b.y);
      ctx.strokeStyle = "#e8fbff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx + 0.5, by + 0.5, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bx - 1, by - 1, 1, 1);
    }

    // Drone lasers (red, like the ice shot)
    for (const l of s.lasers) {
      const lx = Math.round(l.x - cam);
      const ly = Math.round(l.y);
      ctx.fillStyle = "#96001e";
      ctx.fillRect(lx - 1, ly - 1, 14, 5);
      ctx.fillStyle = "#ff2a3a";
      ctx.fillRect(lx, ly, 12, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(l.vx > 0 ? lx + 9 : lx + 1, ly + 1, 2, 1);
      ctx.fillStyle = "rgba(255, 60, 80, 0.5)";
      ctx.fillRect(l.vx > 0 ? lx - 8 : lx + 13, ly + 1, 7, 1);
    }

    // Bong smoke
    for (const m of s.smoke) {
      ctx.fillStyle = `rgba(245, 245, 250, ${Math.min(0.85, m.life / 2)})`;
      ctx.beginPath();
      ctx.arc(Math.round(m.x - cam), Math.round(m.y), m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The evil weed leaf (Level 1 boss), with a little health bar over it
    if (s.lboss && s.lboss.kind === "snowman") {
      const lb = s.lboss;
      const lx = Math.round(lb.x - cam);
      const walking = Math.abs(lb.vx) > 5 && lb.vy === 0;
      const ly = Math.round(lb.y) - (walking && Math.floor(s.t * 6) % 2 === 0 ? 1 : 0) + (lb.dazed > 0 ? 2 : 0);
      const flash = (lb.hit > 0 && Math.floor(s.t * 20) % 2 === 0) || (lb.dead > 0 && Math.floor(s.t * 14) % 2 === 0);
      const colors = flash ? { W: "#ffffff", K: "#ffffff", R: "#ffffff", O: "#ffffff", B: "#ffffff", S: "#ffffff" } : EVIL_SNOWMAN_COLORS;
      const rows = lb.facing > 0 ? EVIL_SNOWMAN.map((r) => r.split("").reverse().join("")) : EVIL_SNOWMAN;
      drawPixels(ctx, rows, lx, ly, colors, 2);
      if (lb.dazed > 0) {
        // dizzy stars circling his hat
        for (let k = 0; k < 3; k++) {
          const a = s.t * 5 + (k * Math.PI * 2) / 3;
          ctx.fillStyle = k % 2 ? "#ffe27a" : "#ffffff";
          ctx.fillRect(Math.round(lx + SN_W / 2 + Math.cos(a) * 14), Math.round(ly + 2 + Math.sin(a) * 4), 3, 3);
        }
      } else if (lb.dead <= 0) {
        ctx.fillStyle = INK;
        ctx.fillRect(lx + 6, ly - 7, 32, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(lx + 7, ly - 6, 30, 2);
        ctx.fillStyle = "#ff283c";
        ctx.fillRect(lx + 7, ly - 6, Math.round((30 * Math.max(0, lb.hp)) / lb.maxHp), 2);
      }
      // speech bubble when the fight starts
      if (lb.speech > 0 && s.mode === "running") {
        const text = "GIVE ME ALL YOUR WEED!";
        ctx.font = `8px ${fontFamily}`;
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        const tw = ctx.measureText(text).width + 8;
        const bx = Math.max(4, Math.min(W - tw - 4, lx + SN_W / 2 - tw / 2));
        const by = Math.max(24, ly - 26);
        ctx.fillStyle = INK;
        ctx.fillRect(bx - 1, by - 1, tw + 2, 14);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, by, tw, 12);
        ctx.fillStyle = INK;
        ctx.fillRect(Math.round(lx + SN_W / 2) - 2, by + 13, 4, 2);
        ctx.fillRect(Math.round(lx + SN_W / 2) - 1, by + 15, 2, 2);
        ctx.fillText(text, bx + tw / 2, by + 2);
      }
    } else if (s.lboss) {
      const lb = s.lboss;
      const lx = Math.round(lb.x - cam);
      const ly = Math.round(lb.y + (lb.dive > 0 ? 0 : Math.sin(s.t * 6) * 1));
      const flash = (lb.hit > 0 && Math.floor(s.t * 20) % 2 === 0) || (lb.dead > 0 && Math.floor(s.t * 14) % 2 === 0);
      const colors = flash ? { K: "#ffffff", G: "#ffffff", g: "#ffffff", R: "#ffffff", W: "#ffffff" } : EVIL_COLORS;
      // dark aura
      ctx.fillStyle = "rgba(60, 0, 80, 0.25)";
      ctx.beginPath();
      ctx.arc(lx + EL_W / 2, ly + EL_H / 2, EL_W / 2 + 4 + Math.sin(s.t * 4) * 2, 0, Math.PI * 2);
      ctx.fill();
      drawPixels(ctx, EVIL_LEAF, lx, ly, colors, 2);
      if (lb.dead <= 0) {
        ctx.fillStyle = INK;
        ctx.fillRect(lx + 5, ly - 7, 32, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(lx + 6, ly - 6, 30, 2);
        ctx.fillStyle = "#ff283c";
        ctx.fillRect(lx + 6, ly - 6, Math.round((30 * Math.max(0, lb.hp)) / lb.maxHp), 2);
      }
    }

    // You
    const blinking = s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0;
    const showYou = ["select", "ready", "running", "pipe", "golden", "choose", "paused"].includes(s.mode);
    if (showYou && !blinking) {
      const previewOutfit = s.mode === "select" ? OUTFITS[s.selectIndex].id : s.outfit;
      const levelOutfit = s.levelMode ? LEVELS[s.level - 1]?.outfit : undefined;
      const levelSprite = levelOutfit ? levelSpritesRef.current[levelOutfit] : undefined;
      const sprite =
        s.mode !== "select" && levelSprite && levelSprite.complete && levelSprite.naturalWidth > 0
          ? levelSprite
          : spritesRef.current[previewOutfit];
      // Frames: 0 and 1 = walking. Sheets with a 3rd frame (72px wide) use it for standing still
      // (classic + trippy: he raises the joint to his mouth and smoke curls up).
      const hasIdle = !!sprite && sprite.naturalWidth >= SPRITE_W * 3;
      const walking = s.onGround && Math.abs(s.vx) > 5;
      const frame = walking ? Math.floor(s.runAnim * 10) % 2 : hasIdle && (s.onGround || s.mode === "select") ? 2 : 0;

      if (s.mode === "select") {
        // Big centered portrait, so it's obviously the whole point of this screen
        const scale = 2.4;
        const bigW = SPRITE_W * scale;
        const bigH = SPRITE_H * scale;
        const bx = Math.round(W / 2 - bigW / 2);
        const by = 32;
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, bx, by, bigW, bigH);
        } else {
          ctx.fillStyle = OUTFIT_FALLBACK[previewOutfit];
          ctx.fillRect(bx + HB_X * scale, by + HB_Y * scale, HB_W * scale, HB_H * scale);
        }
      } else {
        const x = Math.round(s.x - cam);
        const y = Math.round(s.y);
        ctx.save();
        if (s.mode === "pipe") {
          // Only draw the part above the pipe while sinking in
          const c = colAt(s.pipeCol);
          ctx.beginPath();
          ctx.rect(0, 0, W, c.ground * T);
          ctx.clip();
        }
        // Jetpack on your back
        if (s.jetpack) {
          const bx = s.facing > 0 ? x + 2 : x + SPRITE_W - 7;
          const by = y + 13;
          drawPixels(ctx, JET_SMALL, bx, by, { K: INK, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 1);
          if (s.flying && Math.floor(s.t * 20) % 2 === 0) {
            drawPixels(ctx, JET_SMALL_FLAME, bx, by + 8, { O: "#ff7a00", Y: "#ffc800" }, 1);
          }
        }
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          if (s.facing < 0) {
            ctx.translate(x + SPRITE_W, y);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
          } else {
            ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, SPRITE_W, SPRITE_H);
          }
        } else {
          ctx.fillStyle = OUTFIT_FALLBACK[previewOutfit];
          ctx.fillRect(x + HB_X, y + HB_Y, HB_W, HB_H);
        }
        ctx.restore();
        // IPOD USER FIELD: white earbuds, the wire running down into a little player in his pocket
        if (!s.inBonus && colAt(Math.floor((s.x + SPRITE_W / 2) / T)).zone === F_IPOD) {
          const px = (n: number) => (s.facing > 0 ? x + n : x + SPRITE_W - 1 - n);
          const sway = Math.round(Math.sin(s.t * 5) * 0.6);
          ctx.fillStyle = INK;
          ctx.fillRect(Math.min(px(7), px(9)), y + 11, 3, 3);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(Math.min(px(8), px(9)), y + 12, 2, 2);
          // the wire
          const wire: [number, number][] = [[9, 14], [9, 15], [10, 16], [10, 17], [10 + sway, 18], [10 + sway, 19], [9, 20], [9, 21]];
          for (const [wx, wy] of wire) ctx.fillRect(px(wx), y + wy, 1, 1);
          // the little player in his pocket
          ctx.fillStyle = INK;
          ctx.fillRect(Math.min(px(8), px(10)), y + 22, 3, 4);
          ctx.fillStyle = "#f7f7fb";
          ctx.fillRect(Math.min(px(8), px(10)), y + 22, 3, 3);
          ctx.fillStyle = "#9fd4ff";
          ctx.fillRect(Math.min(px(8), px(10)) + 1, y + 22, 1, 1);
        }
      }
    }

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam), Math.round(p.y), 2, 2);
    }

    ctx.restore();

    // Point popups
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const p of s.popups) {
      ctx.fillStyle = INK;
      ctx.fillText(p.text, Math.round(p.x - cam) + 1, Math.round(p.y - s.camY) + 1);
      ctx.fillStyle = p.text.startsWith("+1") ? PINK : "#ffc800";
      ctx.fillText(p.text, Math.round(p.x - cam), Math.round(p.y - s.camY));
    }

    // HUD (score, lives, powers) — none of it means anything yet on the outfit-select
    // screen, so it stays hidden there and the screen is just the character picker
    const hudInk = viewZone === VOID_ZONE ? (VOID_PALETTES[s.voidPal] || VOID_PALETTES[0]).ink : INK;
    if (s.mode !== "select") {
    drawSfxIcon(ctx, hudInk);
    drawSfxSlider(ctx, hudInk);
    ctx.fillStyle = hudInk;
    ctx.textAlign = "left";
    ctx.fillText(s.levelMode ? fmtTime(s.levelTime * 1000) : pad(s.score), 22, 6);
    ctx.textAlign = "right";
    if (s.levelMode) {
      const best = s.levelBest[String(s.level)];
      ctx.fillText(best ? `BEST ${fmtTime(best)}` : `LVL ${s.level}`, W - 6, 6);
    } else {
      ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);
    }
    // gold coins you have
    ctx.fillStyle = "#6b4a00";
    ctx.fillRect(W - 45, 16, 8, 8);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(W - 44, 17, 6, 6);
    ctx.fillStyle = "#fff3a0";
    ctx.fillRect(W - 43, 18, 2, 2);
    ctx.fillStyle = hudInk;
    ctx.fillText(`${s.coins}`, W - 6, 16);

    // Hearts = lives (max 4)
    for (let i = 0; i < MAX_LIVES; i++) {
      const x = W / 2 - 34 + i * 16;
      drawPixels(ctx, HEART, x + 1, 5, { P: INK }, 1);
      drawPixels(ctx, HEART, x, 4, { P: i < s.lives ? PINK : "#9b8fa6" }, 1);
    }

    // Fire power: 5 fireball icons + a blinking orange timer bar along the bottom
    if (hasFire() && s.ammo > 5) {
      // lots of shots (boss fight): one icon and the number
      const ice = s.power === "ice";
      ctx.fillStyle = ice ? "#4aa3ff" : "#ff7a00";
      ctx.fillRect(W / 2 - 36, 14, 4, 4);
      ctx.fillStyle = ice ? "#ffffff" : "#ffc800";
      ctx.fillRect(W / 2 - 35, 15, 2, 2);
      ctx.fillStyle = hudInk;
      ctx.textAlign = "left";
      ctx.fillText(`x${s.ammo}`, W / 2 - 30, 13);
    } else if (hasFire()) {
      const ice = s.power === "ice";
      for (let i = 0; i < 5; i++) {
        const x = W / 2 - 36 + i * 6;
        ctx.fillStyle = i < s.ammo ? (ice ? "#4aa3ff" : "#ff7a00") : "#9b8fa6";
        ctx.fillRect(x, 14, 4, 4);
        if (i < s.ammo) {
          ctx.fillStyle = ice ? "#ffffff" : "#ffc800";
          ctx.fillRect(x + 1, 15, 2, 2);
        }
      }
    }
    // Double jumps left: turquoise cubes
    for (let i = 0; i < s.doubleJumps; i++) {
      const x = W / 2 + 10 + i * 7;
      ctx.fillStyle = "#138a7a";
      ctx.fillRect(x, 14, 5, 5);
      ctx.fillStyle = "#3de0c8";
      ctx.fillRect(x, 14, 4, 4);
    }
    // Boss health bar
    if (s.boss && s.bossState === "fight") {
      const b = s.boss;
      const label = b.kind === "giant" ? "GIANT" : "TROLL";
      ctx.fillStyle = hudInk;
      ctx.textAlign = "left";
      ctx.fillText(s.bossCount === 0 ? label : `${label} ${s.bossCount + 1}`, W / 2 - 60, 25);
      const bw = 72;
      const bx = W / 2 + 6;
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 1, 25, bw + 2, 8);
      if (b.dazed > 0) {
        ctx.fillStyle = "#ffc800";
        ctx.fillText("STOMP HIM!", bx, 26);
      } else {
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(bx, 26, bw, 6);
        const part = Math.max(0, b.hp) / b.maxHp;
        ctx.fillStyle = part > 0.5 ? LIGHT_GREEN : part > 0.25 ? "#ffc800" : "#e0303a";
        ctx.fillRect(bx, 26, Math.round(bw * part), 6);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(bx, 26, Math.round(bw * part), 1);
      }
    }
    // Jetpack: a little icon + fuel bar under the score while you have it
    if (s.jetpack) {
      drawPixels(ctx, JETPACK, 22, 16, { K: hudInk, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 1);
      const fuelFrac = s.jetFuel / JET_FUEL_MAX;
      const fbx = 38;
      const fby = 20;
      const fbw = 40;
      ctx.fillStyle = hudInk;
      ctx.fillRect(fbx - 1, fby - 1, fbw + 2, 6);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(fbx, fby, fbw, 4);
      ctx.fillStyle = fuelFrac > 0.4 ? "#ffc800" : fuelFrac > 0.15 ? "#ff7a00" : "#e0303a";
      ctx.fillRect(fbx, fby, Math.round(fbw * fuelFrac), 4);
    }
    if (hasFire() && s.power === "fire" && s.bossState !== "fight") {
      const left = s.fireTime / FIRE_TIME;
      const low = s.fireTime < 4;
      const barOn = !low || Math.floor(s.t * 8) % 2 === 0;
      ctx.fillStyle = INK;
      ctx.fillRect(8, H - 12, W - 16, 4);
      if (barOn) {
        ctx.fillStyle = Math.floor(s.t * 6) % 2 === 0 ? "#ff7a00" : "#ffc800";
        ctx.fillRect(9, H - 11, Math.max(0, Math.round((W - 18) * left)), 2);
      }
    }
    } // end of the select-mode HUD gate

    if (s.mode !== "ready" && s.mode !== "select") drawProgress(ctx);

    // Messages
    const blink = Math.floor(s.t * 2) % 2 === 0;
    ctx.textAlign = "center";
    if (s.mode === "select") {
      const o = OUTFITS[s.selectIndex];
      const owned = s.unlocked.includes(o.id);
      textBox(ctx, "CHOOSE YOUR PINKMANE", 8);
      textBox(ctx, o.name, 20);
      // The big portrait itself is drawn further down, right in the middle of the screen
      const canBuy = !owned && o.id === "icy" && s.coins >= ICY_COST;
      textBox(ctx, owned ? "PRESS OK TO WEAR IT" : canBuy ? `PRESS OK TO BUY (${ICY_COST} COINS)` : `LOCKED \u2014 ${o.how}`, 118);
      textBox(ctx, `GOLD COINS: ${s.coins}`, 130);
      if (!s.storageOk) textBox(ctx, "BROWSER STORAGE BLOCKED \u2014 WON'T SAVE", 141);
      if (blink) textBox(ctx, "\u2190 \u2192 BROWSE OUTFITS", 152);
    } else if (s.mode === "ready" && s.levelMode) {
      textBox(ctx, `LVL ${s.level}: ${LEVELS[s.level - 1]?.name ?? ""}`, 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const best = s.levelBest[String(s.level)];
      textBox(ctx, best ? `YOUR BEST: ${fmtTime(best)}` : "REACH THE BONG AS FAST AS YOU CAN", 70);
    } else if (s.mode === "ready") {
      textBox(ctx, "SUPER PINKMANE", 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 70);
      textBox(ctx, "ESC: CHANGE GAME TYPE", 90);
    } else if ((s.mode === "running" || s.mode === "pipe") && s.flash > 0) {
      textBox(ctx, s.flashText, 36);
    } else if (s.mode === "dying") {
      textBox(ctx, "GAME OVER", 40);
      if (s.t - s.deadAt > 0.4) textBox(ctx, "OH MY GOD, THEY KILLED PINKMANE!", 58);
      if (s.t - s.deadAt > 1.2) textBox(ctx, "YOU BASTARDS!", 72);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, `YOU SMOKED ${Math.floor(s.score)} GRAMS`, 44);
    }
    // Hint on top of an unused pipe
    if (s.mode === "running" && pipeUnderFeet() >= 0 && blink) {
      textBox(ctx, s.inBonus ? "PRESS DOWN TO LEAVE" : "PRESS DOWN TO ENTER", 88);
    }

    if (s.mode === "choose") drawSpellPick(ctx);
    // Lore sign you're standing next to
    if (s.levelMode && s.mode === "running" && s.flash <= 0) {
      const near = s.signs.find((sg) => Math.abs(sg.x + 8 - (s.x + SPRITE_W / 2)) < 36);
      if (near && near.text) near.text.split("\n").forEach((line, i) => textBox(ctx, line, 30 + i * 12));
    }
    // "How to use it" hint the first time you get a power-up (PRESS S TO SHOOT etc.)
    // Drawn AFTER the lore signs so it's always on top, and pushed below the sign's text so they don't overlap
    if (s.mode === "running" && s.hintTime > 0 && s.flash <= 0) {
      const sign = s.levelMode ? s.signs.find((sg) => Math.abs(sg.x + 8 - (s.x + SPRITE_W / 2)) < 36) : undefined;
      const signLines = sign && sign.text ? sign.text.split("\n").length : 0;
      const hintY = signLines > 0 ? Math.min(H - 30, 30 + signLines * 12 + 6) : 52;
      flashBox(ctx, s.hintText, hintY, s.t);
    }
    if (s.mode === "levelDone") drawLevelDone(ctx);
    if (s.mode === "paused") {
      ctx.fillStyle = "rgba(22, 12, 29, 0.7)";
      ctx.fillRect(0, 0, W, H);
      textBox(ctx, "PAUSED", 34);
      PAUSE_OPTIONS.forEach((label, i) => {
        const picked = s.pauseChoice === i;
        const text = (picked ? "> " : "") + label;
        const y = 52 + i * 14;
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = picked ? PINK : SCREEN;
        ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
        ctx.fillStyle = picked ? "#ffffff" : INK;
        ctx.fillText(text, W / 2, y);
      });
      if (blink) textBox(ctx, "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", 128);
    }
  };

  // Start the game loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    OUTFITS.forEach((o) => {
      const img = new Image();
      img.src = o.file;
      spritesRef.current[o.id] = img;
    });
    LEVELS.forEach((lv) => {
      if (!lv.outfit || levelSpritesRef.current[lv.outfit]) return;
      const img = new Image();
      img.src = lv.outfit;
      levelSpritesRef.current[lv.outfit] = img;
    });
    const ship = new Image();
    ship.src = "/game/ghostship.png";
    shipRef.current = ship;
    fieldImagesRef.current = FIELD_IMAGES.map((src) => {
      const im = new Image();
      im.src = src;
      return im;
    });
    deathSoundRef.current = new Audio(DEATH_SOUND);

    // Owner code: open the site once with ?owner=YOURCODE on each of your devices
    try {
      const params = new URLSearchParams(window.location.search);
      const ownerParam = params.get("owner");
      if (ownerParam) {
        localStorage.setItem(OWNER_KEY, ownerParam);
        params.delete("owner");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    } catch {}

    state.current.storageOk = storageAvailable();

    try {
      sfxOnRef.current = localStorage.getItem(SFX_KEY) !== "off";
      const savedVol = localStorage.getItem(SFX_VOL_KEY);
      if (savedVol !== null && !Number.isNaN(Number(savedVol))) sfxVolRef.current = Math.max(0, Math.min(1, Number(savedVol)));
      const saved = Number(localStorage.getItem(BEST_KEY));
      if (saved > 0) state.current.best = saved;
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) {
        nameRef.current = savedName;
        setName(savedName);
      }
      const savedCoins = Number(localStorage.getItem(COINS_KEY));
      if (savedCoins > 0) state.current.coins = savedCoins;
      const savedUnlocked = JSON.parse(localStorage.getItem(UNLOCKED_KEY) || "[]");
      if (Array.isArray(savedUnlocked) && savedUnlocked.length) {
        state.current.unlocked = Array.from(new Set(["classic", ...savedUnlocked])) as OutfitId[];
      }
      const savedOutfit = localStorage.getItem(OUTFIT_KEY) as OutfitId | null;
      if (savedOutfit && state.current.unlocked.includes(savedOutfit)) {
        state.current.outfit = savedOutfit;
        state.current.selectIndex = OUTFITS.findIndex((o) => o.id === savedOutfit);
      }
    } catch {}

    loadBoard();
    loadLevelProgress();
    newGame();

    // Keyboard: ← → / A D walk, ↑ / W jump (Space and Enter jump through the iPod),
    // F / X shoot, ↓ / S go down a pipe (or shoot), M = game sounds on/off
    const keyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      const mode = state.current.mode;
      // Esc (or P) pauses / unpauses
      if (k === "Escape" || k === "p" || k === "P") {
        const st = state.current;
        if (mode === "running") pauseGame();
        else if (mode === "paused") resumeGame();
        else if (k === "Escape" && mode === "select" && st.fromPause) {
          // picking an outfit from the pause menu: Esc goes back to the pause menu
          st.fromPause = false;
          st.mode = "paused";
        } else if (k === "Escape" && (mode === "select" || mode === "levelSelect")) st.mode = "home";
        else if (k === "Escape" && mode === "ready") st.mode = st.levelMode ? "levelSelect" : "home";
        return;
      }
      // The pink start screen
      if (mode === "home") {
        if (k === "ArrowLeft" || k === "a" || k === "A") state.current.homeChoice = 0;
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.homeChoice = 1;
        return;
      }
      // The level map: walk with arrows / WASD
      if (mode === "levelSelect") {
        if (k === "ArrowLeft" || k === "a" || k === "A") mapMove(-1, 0);
        if (k === "ArrowRight" || k === "d" || k === "D") mapMove(1, 0);
        if (k === "ArrowUp" || k === "w" || k === "W") mapMove(0, -1);
        if (k === "ArrowDown" || k === "s" || k === "S") mapMove(0, 1);
        return;
      }
      // Browsing outfits before the game starts
      if (mode === "select") {
        if (k === "ArrowLeft" || k === "a" || k === "A")
          state.current.selectIndex = (state.current.selectIndex + OUTFITS.length - 1) % OUTFITS.length;
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.selectIndex = (state.current.selectIndex + 1) % OUTFITS.length;
        return;
      }
      // Picking a spell before a boss fight
      if (mode === "choose") {
        if (k === "ArrowLeft" || k === "a" || k === "A") state.current.spellChoice = 0;
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.spellChoice = 1;
        return;
      }
      // Choosing an option on the pause menu
      if (mode === "paused") {
        const n = PAUSE_OPTIONS.length;
        if (k === "ArrowUp" || k === "w" || k === "W") state.current.pauseChoice = (state.current.pauseChoice + n - 1) % n;
        if (k === "ArrowDown" || k === "s" || k === "S") state.current.pauseChoice = (state.current.pauseChoice + 1) % n;
        return;
      }
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = true;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") heldRef.current.up = true;
      if (k === "ArrowUp" || k === "w" || k === "W") jump();
      if (k === "ArrowDown" || k === "s" || k === "S") down();
      if (k === "f" || k === "F" || k === "x" || k === "X") shoot();
      if (k === "m" || k === "M") toggleSfx();
      if (k === "-" || k === "_") setSfxVolume((sfxOnRef.current ? sfxVolRef.current : 0) - 0.1);
      if (k === "=" || k === "+") setSfxVolume((sfxOnRef.current ? sfxVolRef.current : 0) + 0.1);
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = false;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") heldRef.current.up = false;
    };
    // Let go of everything if the window loses focus (so you don't keep flying or walking)
    // (and pause the game if it was running)
    const releaseAll = () => {
      heldRef.current = { left: false, right: false, up: false };
      touchUpRef.current = false;
      pauseGame();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", releaseAll);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw(ctx);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", releaseAll);
      audioCtxRef.current?.close().catch(() => {});
      stopStutters();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls (jump)
  useEffect(() => {
    if (actionSignal !== firstSignal.current) press();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal]);

  const buttonStyle: React.CSSProperties = {
    fontFamily,
    fontSize: "clamp(8px, 2.4vw, 11px)",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        // Phones: hold the left or right third to walk, tap the middle to jump,
        // swipe down in the middle to shoot / go down a pipe. Speaker icon (top-left) = sounds.
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cx = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          if (cx < 20 && cy < 14) {
            toggleSfx();
            return;
          }
          if (onSfxSlider(cx, cy)) {
            e.currentTarget.setPointerCapture(e.pointerId);
            sfxDragRef.current = true;
            sfxFromY(cy);
            return;
          }
          const mode = state.current.mode;
          if (mode === "entry") return;
          if (mode === "home") {
            state.current.homeChoice = cx < W / 2 ? 0 : 1;
            press();
            return;
          }
          if (mode === "levelSelect") {
            const here = state.current.levelPick;
            const near = (i: number) => i >= 0 && i < MAP_NODES.length && Math.hypot(MAP_NODES[i].x - cx, MAP_NODES[i].y - cy) < 22;
            if (near(here)) press();
            else if (near(here + 1) || near(here - 1)) {
              const to = near(here + 1) ? here + 1 : here - 1;
              const pts = mapPath(here, to);
              mapMove(Math.sign(pts[1][0] - pts[0][0]), Math.sign(pts[1][1] - pts[0][1]));
            }
            return;
          }
          if (mode === "paused") {
            // tap an option on the pause menu to pick it
            const row = Math.floor((cy - 50) / 14);
            if (row >= 0 && row < PAUSE_OPTIONS.length) {
              state.current.pauseChoice = row;
              press();
            }
            return;
          }
          if (mode === "choose") {
            state.current.spellChoice = cx < W / 2 ? 0 : 1;
            pickSpell(state.current.spellChoice);
            return;
          }
          if (mode !== "running") {
            press();
            return;
          }
          if (cx < W * 0.33) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = -1;
          } else if (cx > W * 0.67) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = 1;
          } else if (cy > H * 0.6) {
            down();
          } else {
            // tap = jump, keep holding = fly (with the jetpack)
            e.currentTarget.setPointerCapture(e.pointerId);
            touchUpRef.current = true;
            jump();
          }
        }}
        onPointerMove={(e) => {
          if (!sfxDragRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          sfxFromY(cy);
        }}
        onPointerUp={() => {
          if (sfxDragRef.current) {
            sfxDragRef.current = false;
            beep(520, 780, 0.08, 0.05, "square"); // a little test sound at the new volume
          }
          touchRef.current = 0;
          touchUpRef.current = false;
        }}
        onPointerCancel={() => {
          sfxDragRef.current = false;
          touchRef.current = 0;
          touchUpRef.current = false;
        }}
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

      {showGolden && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 11,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "8px",
            textAlign: "center",
            background: "rgba(22, 12, 29, 0.88)",
            fontFamily,
            color: "#fff",
          }}
        >
          <div style={{ fontSize: "clamp(10px, 3vw, 15px)", color: "#ffd700" }}>YOU FOUND THE GOLDEN LEAF!</div>
          <div style={{ fontSize: "clamp(8px, 2.2vw, 11px)", color: "#ffd700" }}>+{PTS_GOLD} GRAMS</div>
          <div style={{ fontSize: "clamp(8px, 2.2vw, 11px)", lineHeight: 1.6 }}>
            SECRET TRACK: STUTTERS REMIX
            <br />
            NOW PLAYING IN THE VOID
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            {STUTTERS_LINK && (
              <button onClick={() => closeGolden(true)} style={{ ...buttonStyle, background: "#ffd700", color: INK }}>
                GET THE PRIVATE LINK
              </button>
            )}
            <button onClick={() => closeGolden(false)} style={{ ...buttonStyle, background: "#bbb", color: INK }}>
              {goldBefore ? "SKIP, GOT IT ALREADY" : "SKIP"}
            </button>
          </div>
        </div>
      )}

      {showEntry && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "12%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            zIndex: 10,
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={12}
            placeholder="YOUR NAME"
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "");
              nameRef.current = v;
              setName(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") skipEntry();
            }}
            style={{
              fontFamily,
              fontSize: "clamp(10px, 3vw, 13px)",
              width: "60%",
              textAlign: "center",
              padding: "6px",
              background: INK,
              color: "#fff",
              border: `2px solid ${PINK}`,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={submitName} disabled={saving} style={{ ...buttonStyle, background: PINK, color: "#fff" }}>
              {saving ? "SAVING..." : "SAVE"}
            </button>
            <button onClick={skipEntry} style={{ ...buttonStyle, background: "#bbb", color: INK }}>
              SKIP
            </button>
          </div>
          {message && (
            <div style={{ fontFamily, fontSize: "clamp(7px, 2vw, 9px)", color: "#b00020" }}>{message}</div>
          )}
        </div>
      )}
    </>
  );
}
