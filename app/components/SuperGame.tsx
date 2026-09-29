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
  | "paused";

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
};
type Leaf = { x: number; y: number; taken: boolean; small?: boolean }; // small = half size, used to spell words
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
  "GIVE A FUCK FIELD",
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
// Colours of each zone on the progress line at the bottom
const ZONE_COLORS = [
  "#ff5fe0",
  "#ff9a3c",
  "#8e3fb0",
  "#fbd3f3",
  "#b06ce0",
  "#c6b9d6",
  "#d63cc8", // give a fuck field
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
const SHOUT_OUTS = ["O1M4DE", "TOMBFELL", "LEOHWASFOUND", "STUTTERS", "SLITFACE", "SALADE", "LIL SAD K"];

// Points
const PTS_LEAF = 10;
const PTS_WALKER = 100;
const PTS_FLYER = 150;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinksuper-best";
const SFX_KEY = "pinksuper-sfx";
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
  { id: "icy", name: "ICY PINKMANE", file: "/game/pinkdude-icy.png", how: "500 LIFETIME GRAMS" },
];
const ICY_COST = 500;
const OG_SCORE_UNLOCK = 30000;
const OUTFIT_FALLBACK: Record<OutfitId, string> = {
  classic: "#d63cc8",
  og: "#d63cc8",
  ghost: "#bfe9d8",
  icy: "#8fd9ff",
};
const COINS_KEY = "pinksuper-coins"; // lifetime grams, never goes down
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
const VOID_PALETTES: { bg: string; a: string; b: string }[] = [
  { bg: "#160c1d", a: "#3a1a44", b: "#2a1234" }, // 0: the classic
  { bg: "#0c1a1d", a: "#1a4044", b: "#123034" }, // 1: the stairs
  { bg: "#1d0c16", a: "#441a34", b: "#341228" }, // 2: FOLLOW ME ON SOUNDCLOUD (one line)
  { bg: "#141a0c", a: "#3a4418", b: "#2a3410" }, // 3: the zigzag
  { bg: "#0c1420", a: "#1a2c48", b: "#122038" }, // 4: FOLLOW ME / ON SOUNDCLOUD (two lines)
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
    mode: "select" as Mode,
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
    pauseChoice: 0, // which option is highlighted on the pause menu: 0 resume, 1 restart, 2 home
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
    if (mutedRef.current || !sfxOnRef.current) return;
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
    if (sound && !mutedRef.current && sfxOnRef.current) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // ---------- Scoreboard ----------

  const loadBoard = async () => {
    try {
      const res = await fetch("/api/scores?game=super", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      boardRef.current = Array.isArray(data.scores) ? data.scores : [];
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
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
          game: "super",
          name: clean,
          score: Math.floor(s.score),
          runTime: s.runTime,
          device: getDeviceId(),
          ownerCode: getOwnerCode(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(String(data.error || "COULD NOT SAVE").toUpperCase());
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
    if (s.inBonus) return;
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
    return s.cols[col];
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
    s.hintTime = 2.8;
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
  const pickSpell = (choice: number) => {
    const s = state.current;
    if (s.mode !== "choose" || !s.boss) return;
    const kind: PowerKind = choice === 1 ? "ice" : "fire";
    s.bossSpell = kind;
    s.power = kind;
    s.ammo = s.boss.maxHp + BOSS_SPARE_SHOTS;
    s.fireTime = kind === "fire" ? 999 : 0; // no timer in a boss fight
    s.mode = "running";
    s.flash = 1.6;
    const bossLabel = s.boss?.kind === "giant" ? "GIANT" : "TROLL";
    s.flashText = s.bossCount === 0 ? `FIGHT THE ${bossLabel}!` : `${bossLabel} #${s.bossCount + 1}!`;
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
    if (s.coins >= ICY_COST) unlockOutfit("icy");
  };

  const playTrollDeath = () => {
    try {
      const a = new Audio(TROLL_DEATH_SOUND);
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
      addCoins(Math.floor(s.score));
      if (s.score > s.best) {
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
    if (s.mode === "select") {
      const o = OUTFITS[s.selectIndex];
      if (s.unlocked.includes(o.id)) {
        s.outfit = o.id;
        try {
          localStorage.setItem(OUTFIT_KEY, o.id);
        } catch {}
        s.mode = "ready";
      } else {
        s.flash = 1.2;
        s.flashText = `LOCKED \u2014 ${o.how}`;
      }
    } else if (s.mode === "golden") {
      closeGolden(false);
    } else if (s.mode === "choose") {
      pickSpell(s.spellChoice);
    } else if (s.mode === "paused") {
      if (s.pauseChoice === 1) {
        newGame();
        s.mode = "running";
      } else if (s.pauseChoice === 2) {
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
      newGame();
      s.mode = "running";
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
    const doubled = s.killStreak >= 2;
    const finalPoints = doubled ? points * 2 : points;
    s.bonus += finalPoints;
    popup(e.x + 7, e.y - 4, doubled ? `+${finalPoints} DOUBLE KILL!` : `+${finalPoints}`);
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
    if (!s.inBonus) {
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
    }
    s.fireballs = s.fireballs.filter((f) => f.life > 0);

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
      if (e.kind === "flyer") {
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

    // Weed leaves: points
    for (const l of s.leaves) {
      if (l.taken) continue;
      const size = l.small ? 8 : 14;
      if (hx() + HB_W > l.x && hx() < l.x + size && hy() + HB_H > l.y && hy() < l.y + size) {
        l.taken = true;
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

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
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
      ctx.fillText("GAME OVER", W / 2, 40);
      ctx.fillText(`YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 58);
      ctx.fillText(status === "loading" ? "LOADING SCORES..." : "SCOREBOARD OFFLINE", W / 2, 80);
    } else {
      ctx.fillText("TOP 10", W / 2, 8);
      const b = boardRef.current;
      if (b.length === 0) ctx.fillText("NO SCORES YET", W / 2, 60);
      b.slice(0, 10).forEach((e, i) => {
        const y = 22 + i * 11;
        if (e.name === myNameRef.current) {
          ctx.fillStyle = PINK;
          ctx.fillRect(24, y - 2, W - 48, 11);
        }
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
        ctx.textAlign = "right";
        ctx.fillText(pad(e.score), W - 28, y);
      });
      ctx.textAlign = "center";
      ctx.fillText(`YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText("OK TO PLAY AGAIN", W / 2, 148);
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
  const drawBackground = (ctx: CanvasRenderingContext2D, zone: number) => {
    const s = state.current;
    const cam = s.cam;

    if (zone === VOID_ZONE) {
      // SoundCloud Void: dark room with a moving sound wave, tinted a bit differently per room
      const pal = VOID_PALETTES[((s.lastVoid % VOID_PALETTES.length) + VOID_PALETTES.length) % VOID_PALETTES.length] || VOID_PALETTES[0];
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
        for (let i = -COPIES_ABOVE; i <= 0; i++) {
          ctx.drawImage(img, 0, i * H, W, H);
        }
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
    ctx.fillStyle = INK;
    ctx.fillRect(x, gy, T, H - gy);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, gy, T, 2);
    ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 7, 2, 2);
    ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 20, 2, 2);
    void s;
  };

  const drawBrick = (ctx: CanvasRenderingContext2D, x: number, by: number, zone: number) => {
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

  // Thin line at the bottom: the zones you ran through (solid), the zones coming up (faded),
  // you (pink marker) and the next troll (green face at the end)
  const drawProgress = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
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
    const shots = b ? b.maxHp + BOSS_SPARE_SHOTS : 0;
    ctx.fillText(`${shots} SHOTS, HE TAKES ${b ? b.maxHp : 0}`, W / 2, 26);
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
        ctx.fillStyle = blinking ? "#ffffff" : c.zone === VOID_ZONE ? LIGHT_GREEN : c.fragile > 0 ? "#ff5fe0" : PINK;
        ctx.fillRect(x, ly, T, c.lineTh);
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
      if (l.small) {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x * 0.05)), { G: LIGHT_GREEN, D: GREEN }, 1);
      } else {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x) * 2), { G: GREEN, D: DARK_GREEN }, 2);
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
      if (e.kind === "flyer") {
        if (e.alive) {
          const frame = Math.floor(s.t * 8 + e.phase) % 2;
          drawPixels(ctx, FLYER[frame], x, e.y, { G: LIGHT_GREEN, D: DARK_GREEN, W: "#ffffff" }, 2);
        } else {
          ctx.fillStyle = LIGHT_GREEN;
          ctx.fillRect(x + 2, e.y + 10, 14, 3);
        }
      } else if (e.alive) {
        const bob = Math.floor(s.t * 6 + e.x) % 2;
        drawPixels(ctx, HATER, x, e.y - bob, { G: "#8a8a8a", K: INK, W: "#ffffff" }, 2);
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

    // You
    const blinking = s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0;
    const showYou = ["select", "ready", "running", "pipe", "golden", "choose", "paused"].includes(s.mode);
    if (showYou && !blinking) {
      const previewOutfit = s.mode === "select" ? OUTFITS[s.selectIndex].id : s.outfit;
      const sprite = spritesRef.current[previewOutfit];
      const frame = s.onGround && Math.abs(s.vx) > 5 ? Math.floor(s.runAnim * 10) % 2 : 0;

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
    const hudInk = viewZone === VOID_ZONE ? "#ffffff" : INK;
    if (s.mode !== "select") {
    drawSfxIcon(ctx, hudInk);
    ctx.fillStyle = hudInk;
    ctx.textAlign = "left";
    ctx.fillText(pad(s.score), 22, 6);
    ctx.textAlign = "right";
    ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);

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
      textBox(ctx, owned ? "PRESS OK TO WEAR IT" : `LOCKED \u2014 ${o.how}`, 118);
      textBox(ctx, `GRAMS SAVED UP: ${s.coins}`, 130);
      if (!s.storageOk) textBox(ctx, "BROWSER STORAGE BLOCKED \u2014 WON'T SAVE", 141);
      if (blink) textBox(ctx, "\u2190 \u2192 BROWSE OUTFITS", 152);
    } else if (s.mode === "ready") {
      textBox(ctx, "SUPER PINKMANE", 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 70);
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
    // "How to use it" hint the first time you get a power-up
    if (s.mode === "running" && s.hintTime > 0 && s.flash <= 0) {
      textBox(ctx, s.hintText, 52);
    }
    // Hint on top of an unused pipe
    if (s.mode === "running" && pipeUnderFeet() >= 0 && blink) {
      textBox(ctx, s.inBonus ? "PRESS DOWN TO LEAVE" : "PRESS DOWN TO ENTER", 88);
    }

    if (s.mode === "choose") drawSpellPick(ctx);
    if (s.mode === "paused") {
      ctx.fillStyle = "rgba(22, 12, 29, 0.7)";
      ctx.fillRect(0, 0, W, H);
      textBox(ctx, "PAUSED", 40);
      const options = ["RESUME", "RESTART", "HOME"];
      options.forEach((label, i) => {
        const picked = s.pauseChoice === i;
        const text = (picked ? "> " : "") + label;
        const y = 62 + i * 16;
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = picked ? PINK : SCREEN;
        ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
        ctx.fillStyle = picked ? "#ffffff" : INK;
        ctx.fillText(text, W / 2, y);
      });
      if (blink) textBox(ctx, "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", 118);
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
        if (mode === "running") pauseGame();
        else if (mode === "paused") resumeGame();
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
      // Choosing Resume / Restart / Home on the pause menu
      if (mode === "paused") {
        if (k === "ArrowUp" || k === "w" || k === "W") state.current.pauseChoice = (state.current.pauseChoice + 2) % 3;
        if (k === "ArrowDown" || k === "s" || k === "S") state.current.pauseChoice = (state.current.pauseChoice + 1) % 3;
        return;
      }
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = true;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") heldRef.current.up = true;
      if (k === "ArrowUp" || k === "w" || k === "W") jump();
      if (k === "ArrowDown" || k === "s" || k === "S") down();
      if (k === "f" || k === "F" || k === "x" || k === "X") shoot();
      if (k === "m" || k === "M") toggleSfx();
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
          if (cx < 20 && cy < 18) {
            toggleSfx();
            return;
          }
          const mode = state.current.mode;
          if (mode === "entry") return;
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
        onPointerUp={() => {
          touchRef.current = 0;
          touchUpRef.current = false;
        }}
        onPointerCancel={() => {
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
