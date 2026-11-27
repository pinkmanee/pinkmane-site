// PINK KART (demo, track 1): a behind-the-kart racing game drawn on a pixel screen and blown up.
// The ground is one big flat picture (public/kart/track1-ground.png) tilted into 3D, like old SNES racers.
// Everything you see comes from the pictures in public/kart/ : swap a picture, the game changes.

import { KartSound } from "./sound";
import { cobblePixel, fieldPixel, makePsyProps, makePsySky, makeTempleWall, plankPixel, psyColours, seaHeight, tilePixel, waterPixel, type PsyTheme } from "./psy"; // the psychedelic look
import { buzz } from "../buzz"; // the phone buzz on a hit (game/buzz.ts)

// THE MUSIC IN PINK KART: which of your beats plays where (files in public/music). Change a file name to change the song.
const MUSIC: Record<string, string> = {
  menu: "/music/beat-4.mp3", // the kart menu and the lobby
  track1: "/music/beat-2.mp3", // NIGHT FIELD
  track2: "/music/beat-3.mp3", // VOID HIGHWAY
  track3: "/music/beat-5.mp3", // HIGH HILLS
  track4: "/music/06.mp3", // SMOKE OCEAN
  track6: "/music/09.mp3", // HOTBOX HIGHWAY
  track7: "/music/10.mp3", // TATRA TRIP
  track5: "/music/05.mp3", // 808 TEMPLE (its speakers bounce on this song's beat: "beat" in track5.json)
};

type Img = HTMLImageElement | HTMLCanvasElement;
// DETAIL: pictures can be drawn at double detail (the items are 96×96 instead of 48×48, the plants 80×128 instead of
// 40×64). They still show at the same size in the game, just with finer pixels. The game works it out from the size.
const resOf = (im: Img) => (im as { pkRes?: number }).pkRes ?? 1;
type TrackData = {
  size: number;
  center: [number, number][];
  halfw: number[];
  boosts: { x: number; y: number; a: number }[];
  boxes: [number, number][];
  props: [number, number, number][];
  lap: number;
  // only on tracks that need them:
  name?: string;
  zone?: number[]; // for every centre point: 0 = the field, 1 = the void
  spawnIdx?: number[]; // where a kart is put back after falling (before the jump if it fell into the gap)
  spawnOff?: number[]; // ...and how far to the side (the split has a hole in the middle)
  water?: boolean; // the "void" around the road is the sea (SMOKE OCEAN): it's drawn as rolling waves
  seaSplit?: number; // SMOKE OCEAN: west of this x the sea is water, east of it the waves are smoke
  fallText?: string; // what it says when you fall off (default: INTO THE VOID)
  decor?: [number, number, string, number][]; // big things standing around: [x, y, "ship" | "tentacle" | "speaker" | "eq", size]
  beat?: { bpm: number; at: number }; // the map song's tempo and where its first beat is (s): speakers and equalizers move on it
  jumpText?: string; // what it says on a jump (default: JUMP!)
  tunnel?: number[]; // for every centre point: 1 = inside a building (808 TEMPLE): the sky turns into its walls
  fog?: [number, number]; // how thick the haze is: [where it starts, how far until it's full] (default [500, 2600])
  smokeRings?: [number, number][]; // HOTBOX HIGHWAY: smoke rings floating over the road; drive through one = a boost
  terrain?: boolean; // A REAL MOUNTAIN (TATRA TRIP): the land has its own height map (trackN-height.png) and is drawn by the terrain renderer
  tgrid?: number; // how many squares across that height map is
  grass?: number[][]; // the grass along the road on a mountain map: dark, middle, tip colours (r, g, b)
  painted?: boolean; // the ground picture already has the land's colours and light painted in (TATRA TRIP): keep them as they are
  hill?: number[]; // HILLS: how high the road is at every centre point (0 = flat; the land around follows, fading out)
  slaps?: [number, number][]; // SLAPPING TENTACLES (SMOKE OCEAN): [centre point, which side it comes from: 1 / -1]
  outside?: number; // what's past the edge of the map (3 = void)
  alt?: number[]; // the flying part: how high the karts fly at every centre point (0 = on the ground)
  peaks?: [number, number][]; // mountain tops to dodge while flying
  rings?: [number, number, number][]; // rings to fly through for a boost: x, y, height
};
type TrackPack = { track: TrackData; ground: Uint32Array; gsize: number; gs: number; types: Uint8Array; mini: HTMLCanvasElement; pal?: Pal; hillGrid?: Float32Array; shade?: Float32Array };
// THE TRACKS: each is trackN.json + trackN-ground.png + trackN-map.png in public/kart/
// (Next fills this in when it builds the site: "development" on your own computer, "production" on pinkmane.site)
declare const process: { env: { NODE_ENV?: string } };
const ALL_TRACKS = [
  { id: "track1", name: "NIGHT FIELD", hue: 0, road: "cobble", psy: "candy" },
  { id: "track2", name: "VOID HIGHWAY", hue: -75, road: "neon", psy: "glitter" },
  { id: "track3", name: "HIGH HILLS", hue: 68, greenPlants: true, road: "cobble", psy: "lava" },
  { id: "track4", name: "SMOKE OCEAN", hue: 0, road: "planks", psy: "ocean" },
  { id: "track5", name: "808 TEMPLE", hue: 0, road: "tiles", psy: "gold" },
  { id: "track6", name: "HOTBOX HIGHWAY", hue: 0, road: "cobble", psy: "smoke" },
  { id: "track7", name: "TATRA TRIP", hue: 0, road: "cobble", psy: "alpine" },
];
// NOT READY YET: maps with wip: true only show when you run the site on your own computer (npm run dev).
// On pinkmane.site they're hidden and not even loaded. To make one public, take its "wip: true" out.
export const TRACKS = ALL_TRACKS.filter((t) => !(t as { wip?: boolean }).wip || process.env.NODE_ENV === "development");

// SOLO DIFFICULTY: how the computer racers drive. speed = their top speed, chase = how much faster they get when
// you're ahead of them, wait = how much they ease off when they're far ahead of you, items = how soon they use an item.
export type Difficulty = "EASY" | "MEDIUM" | "HARD";
// floor = HARD only: no racer is slower than this (so they're ALL fast, not just the best one); pull = how much harder
// they chase the further you get ahead (on top of chase, up to +pull at a big lead).
const DIFFICULTY: Record<Difficulty, { speed: number; chase: number; wait: number; items: number; floor: number; pull: number }> = {
  EASY: { speed: 0.9, chase: 1.0, wait: 0.85, items: 1.8, floor: 0, pull: 0 },
  MEDIUM: { speed: 1.0, chase: 1.07, wait: 0.9, items: 1.0, floor: 0, pull: 0 }, // (how it always was)
  HARD: { speed: 1.1, chase: 1.12, wait: 1.0, items: 0.35, floor: 0.97, pull: 0.3 },
};
// EACH MAP HAS ITS OWN COLOURS. "hue" turns the colour wheel for that map's ground, sky and haze (in degrees):
// 0 = the original pink and purple, -75 = cold blue, 68 = sunset orange and red. Change a number to recolour a map.
// The karts, items, trees and the light-blue boost pads keep their own colours on every map.
// road: how the road itself looks. none = the original grey road with pink and white curbs,
//   "neon" = a dark glassy road with a glowing blue grid and blue curbs, "brick" = a road of warm bricks with orange curbs.
// greenPlants: the pink outlines of the weed plants and trees by the road turn light green on that map.
// psy: THE PSYCHEDELIC LOOK (game/kart/psy.ts): "candy" = pink and purple marble, "glitter" = deep blue full of glitter,
//   "lava" = orange and black marble. It draws that map's sky, the ground beside the road, the cobblestones and the
//   twisted towers / mushrooms / candy trees by the road. Take the psy line out to get the old flat look back.
//   road: "cobble" = shaded cobblestones in the map's psy colours.
function hueMatrix(deg: number): number[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), n = Math.sin(a);
  return [
    0.213 + c * 0.787 - n * 0.213, 0.715 - c * 0.715 - n * 0.715, 0.072 - c * 0.072 + n * 0.928,
    0.213 - c * 0.213 + n * 0.143, 0.715 + c * 0.285 + n * 0.14, 0.072 - c * 0.072 - n * 0.283,
    0.213 - c * 0.213 - n * 0.787, 0.715 - c * 0.715 + n * 0.715, 0.072 + c * 0.928 + n * 0.072,
  ];
}
const cap = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** recolour one pixel (stored as alpha-blue-green-red). keepSun leaves yellow and orange alone, so the sun stays a sun */
function tint(c: number, m: number[], keepSun = false): number {
  const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
  if (keepSun && r > 140 && g > 90 && g > b * 1.25 && r >= g * 0.9) return c;
  return ((c & 0xff000000) | (cap(m[6] * r + m[7] * g + m[8] * b) << 16) | (cap(m[3] * r + m[4] * g + m[5] * b) << 8) | cap(m[0] * r + m[1] * g + m[2] * b)) >>> 0;
}
// THE ROAD STYLES. The road picture is painted with a few fixed colours: three greys for the tarmac, white and pink
// for the curbs, a dark edge line and the pale centre dashes. Each style swaps those for its own colours and patterns.
const ROAD_KEYS: Record<number, string> = {
  [abgrKey(70, 58, 98)]: "t0", [abgrKey(78, 66, 108)]: "t1", [abgrKey(88, 76, 120)]: "t2",
  [abgrKey(244, 240, 252)]: "cw", [abgrKey(255, 70, 200)]: "cp", [abgrKey(40, 26, 60)]: "edge", [abgrKey(226, 214, 255)]: "dash",
};
function abgrKey(r: number, g: number, b: number) {
  return (b << 16) | (g << 8) | r;
}
function hash2(a: number, b: number) {
  let h = Math.imul(a, 374761393) + Math.imul(b, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
/** one road pixel in a style (or 0 = leave it as it is). x, y are world positions */
function roadPixel(style: string, c: number, x: number, y: number, psy?: PsyTheme): number {
  const key = ROAD_KEYS[c & 0xffffff];
  if (!key) return 0;
  const shade = key === "t0" ? 0 : key === "t1" ? 1 : 2;
  if (style === "planks") return plankPixel(key, x, y); // wooden piers, ship decks and boardwalks
  if (style === "tiles") return tilePixel(key, x, y); // black marble tiles with gold seams
  if (style === "cobble") {
    // cobblestones; the curbs, edge line and centre dashes keep the map's own colours
    if (key === "t0" || key === "t1" || key === "t2") return cobblePixel(psy ?? "candy", x, y, shade);
    return 0;
  }
  if (style === "neon") {
    // dark glass with a glowing blue grid; curbs blue and white
    if (key === "cw") return abgr(230, 250, 255);
    if (key === "cp") return abgr(40, 196, 255);
    if (key === "edge") return abgr(8, 12, 28);
    if (key === "dash") return abgr(130, 236, 255);
    const gx = (x | 0) % 32 === 0, gy = (y | 0) % 32 === 0;
    if (gx && gy) return abgr(150, 230, 255);
    if (gx || gy) return abgr(34, 96, 150);
    return [abgr(18, 22, 42), abgr(22, 27, 50), abgr(26, 32, 58)][shade];
  }
  if (style === "brick") {
    // warm bricks in rows, with dark mortar between them; curbs orange and cream
    if (key === "cw") return abgr(255, 230, 184);
    if (key === "cp") return abgr(255, 132, 36);
    if (key === "edge") return abgr(46, 20, 24);
    if (key === "dash") return abgr(255, 210, 110);
    const BW2 = 16, BH2 = 8;
    const ry = Math.floor(y / BH2), off = ry % 2 ? BW2 / 2 : 0, rx = Math.floor((x + off) / BW2);
    if ((y | 0) % BH2 === 0 || ((x + off) | 0) % BW2 === 0) return abgr(66, 30, 34);
    const pick = hash2(rx, ry) % 3;
    const base = [[124, 62, 52], [138, 74, 58], [112, 54, 48]][pick];
    const lift = (shade - 1) * 5;
    return abgr(base[0] + lift, base[1] + lift, base[2] + lift);
  }
  return 0;
}

type Pal = { fog: number[]; vfog: number[]; vdeep: number[]; farLine: number; farDark: number; lip: number; side: number; rib: number; gDark: number; gMid: number; gTip: number; gBank: number; sky: HTMLCanvasElement; skyVoid: HTMLCanvasElement; skyTop?: string; trip?: boolean; props: Img };
const rgbOf = (c: number) => [c & 255, (c >> 8) & 255, (c >> 16) & 255];
const abgr = (r: number, g: number, b: number) => (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
const BOLD = 0.07; // how much fatter the game's letters are drawn (0 = normal)
// the phone buttons that sit on the race picture: [x, y, width, height] in game pixels
const PAUSE_BTN = [6, 22, 40, 24] as const;
const RESET_BTN = [170, 104, 140, 30] as const;
const inBox = (p: { x: number; y: number }, b: readonly [number, number, number, number]) => p.x >= b[0] && p.x <= b[0] + b[2] && p.y >= b[1] && p.y <= b[1] + b[3];
const AIR_TIME = 0.9; // seconds in the air after a jump
const FALL_TIME = 1.5; // seconds a kart falls (and tumbles) into the void...
const BURST_TIME = 0.85; // ...then it bursts into pixels at the bottom, and after that it's put back
const FALL_DEPTH = 85; // how deep it falls (world units)
const SLAB_THICK = 7; // how thick the floating road looks from the side (world units)
const SLAB_LIP = 0xffc846ff, SLAB_SIDE = 0xff2a0a1e, SLAB_RIB = 0xff48143a;

const BW = 480; // the small pixel screen the race is drawn on (the chunky arcade look)
const BH = 270;
const UW = 480; // the menus, numbers and buttons are laid out on a 480 x 270 grid, stretched over the same screen
const UH = 270;
const HORIZON = 100;
const FOCAL = 260;
const CAM_H = 34;
const SMOKE_TALL = 9; // SMOKE OCEAN: how high the waves rise (world units; a kart is about 19 tall)
const CAM_BACK = 65; // how far the camera sits behind your kart
const PITCH_UP = 60; // HILLS: how far the camera may tilt down over a crest (pixels the horizon moves up)
const MAX_ROWS = BH - HORIZON + PITCH_UP; // the most ground rows there can be on screen
const HG = 256; // HILLS: the height map is this many squares across
const OCC_LEVELS = 48; // THE TERRAIN RENDERER: distances at which it remembers how high the land reaches (for hiding things behind it)
const OCC_Z = Array.from({ length: OCC_LEVELS }, (_, i) => 6 * Math.pow(1.16, i));
const TERRAIN_FAR = 6500; // how far away a mountain can still be seen
const LAPS = 3;
// KARTS: every kart is 3 pictures (back, side, front) in public/kart/kart-<kart>-<view>.png, each with 3 frames side by side:
// no flame, flame, flame (the flames only show while boosting or revving at the start).
// k = world units per picture pixel. "mane" is PINKMANE's own drawn kart; for now every racer drives it in his own colour.
// To add a new drawn kart: put its 3 pictures in public/kart/, add it here, and give it to a racer in BOTS.
const CARS: Record<string, { k: number }> = {
  mane: { k: 0.25 }, // with the camera 65 behind, your own kart is drawn at exactly its drawn size
  tomb: { k: 0.25 }, // TOMBFELL the backwood wizard (kart3d-tomb.png), in his own colours
  bmp: { k: 0.25 }, // BEARMANPIG from PINK JUNGLE (kart3d-bmp.png)
  bobo: { k: 0.25 }, // BOBO the dog from PINKMANE VOID (kart3d-bobo.png)
};
// THE DRIVERS you can pick (the kart menu). "mane" comes in a colour per racer; the others always look like themselves.
// To add one: render its 3D kart sheet into public/kart/kart3d-<id>.png, add it to CARS and here.
export const DRIVERS: { id: string; name: string }[] = [
  { id: "mane", name: "PINKMANE" },
  { id: "tomb", name: "TOMBFELL" },
  { id: "bmp", name: "BEARMANPIG" },
  { id: "bobo", name: "BOBO" },
];
export const isDriver = (id: unknown): id is string => typeof id === "string" && DRIVERS.some((d) => d.id === id);
const KART_ANGLES = 16; // the 3D kart is drawn from this many angles all the way around
// the slapping tentacles' rhythm (seconds): waiting, then rearing up (warning) until SLAP_DOWN, lying across the road, sliding back
const SLAP_CYCLE = 3.4, SLAP_RISE = 1.2, SLAP_DOWN = 2.0, SLAP_BACK = 2.7;
const KART_DIR = -1;
function makeSlapSeg() {
  const c = document.createElement("canvas");
  c.width = 18;
  c.height = 12;
  const x = c.getContext("2d")!;
  for (let y = 0; y < 12; y++)
    for (let i = 0; i < 18; i++) {
      const dx = (i - 8.5) / 9, dy = (y - 6.5) / 6;
      const r = dx * dx + dy * dy;
      if (r > 1) continue;
      x.fillStyle = r > 0.72 ? "#1e0628" : dy < -0.35 ? "#ff8ce6" : "#dc3cbe";
      x.fillRect(i, y, 1, 1);
    }
  x.fillStyle = "#ffd2f2"; // the suckers
  x.fillRect(5, 8, 2, 2);
  x.fillRect(11, 8, 2, 2);
  return c;
}
function makeSlapShade() {
  const c = document.createElement("canvas");
  c.width = 36;
  c.height = 6;
  const x = c.getContext("2d")!;
  for (const [f, a] of [[0, 0.4], [1, 0.75]]) {
    x.fillStyle = `rgba(4,2,20,${a})`;
    x.beginPath();
    x.ellipse(f * 18 + 9, 3, 9, 3, 0, 0, Math.PI * 2);
    x.fill();
  }
  return c;
} // which way round the 16 views go (1 or -1)
// THE GRASS EDGE: how tall the grass along the road stands (in world units; a kart is about 19 tall), and its colours (0xAABBGGRR)
const GRASS_TALL = 4.5;
const GRASS_DARK = 0xff180612, GRASS_MID = 0xff96288c, GRASS_TIP = 0xffc846ff, GRASS_BANK = 0xff10040c;
const MENU_TOP = (UH - 160) / 2; // the pause menu sits in a 160-tall block in the middle of the screen
const SPIN_TIME = 1.0; // a spin-out: two full turns, always this long
const GO_TIME = 3; // the countdown: 3 (0s) 2 (1s) 1 (2s) GO (3s)
const REV_FROM = 1; // hold the gas from when the 2 shows = ROCKET START. Earlier = TOO EARLY, the engine chokes
const MAX_SPEED = 235;
const ITEMS = ["bolt", "bomb", "vinyl", "mic", "bass", "mute", "wall"] as const;
type ItemName = (typeof ITEMS)[number];
const ITEM_LABEL: Record<ItemName, string> = {
  bolt: "SAMPLE SKIP",
  bomb: "808 BOMB",
  vinyl: "VINYL",
  mic: "AUTOTUNE",
  bass: "BASS DROP",
  mute: "MUTE",
  wall: "REVERB WALL",
};
// kart colours: the player keeps the drawn pink, the bots get these instead of pink
const BOTS: { name: string; car: string; color: [number, number, number] }[] = [
  { name: "808", car: "mane", color: [60, 220, 255] },
  { name: "SERUM", car: "mane", color: [150, 255, 80] },
  { name: "VOID", car: "mane", color: [255, 150, 40] },
  { name: "HEX", car: "mane", color: [150, 100, 255] },
  { name: "KONG", car: "mane", color: [255, 70, 90] },
  { name: "JUNGLE", car: "mane", color: [80, 255, 200] },
  { name: "BOMBER", car: "mane", color: [255, 230, 60] },
];
// a racer's colour (skin 0 = the pink of the drawing)
const skinColor = (skin: number): [number, number, number] => (skin === 0 ? [255, 70, 200] : BOTS[(skin - 1) % BOTS.length].color);

// ---------------- ONLINE: what the game and the lobby (game/kart/online.ts) say to each other
export type Seat = { id: string; name: string; skin: number; bot: boolean; car?: string };
export type ResultRow = { id: string; name: string; time: number | null; bot: boolean };
export type ItemEvent = { id: string; k: number; kind: ItemName; x: number; y: number; vx: number; vy: number; h?: number };
export interface OnlineLink {
  myId: string;
  isHost: boolean;
  sendState(rows: number[][]): void; // where my kart is (and the bots, from the host), 5 times a second
  sendItem(ev: ItemEvent): void;
  sendGone(id: string): void; // a vinyl / mic hit one of my karts and is gone
  sendFinish(time: number): void;
  hostResults(rows: ResultRow[]): void; // the host decides the race is over
}
const SEND_EVERY = 0.2; // seconds between position updates (5 a second)
const REMOTE_DELAY = 220; // other karts are shown this many ms in the past, so their movement is smooth
const LAST_CALL = 25; // seconds after the first player finishes before the race ends for everyone

type Kart = {
  name: string;
  player: boolean; // the kart this screen drives
  id: string; // online: the player's id ("" in solo)
  ctl: "me" | "bot" | "remote"; // who moves it: this screen's driver, this screen's computer, or another player's screen
  isBot: boolean;
  left: boolean; // online: the player left in the middle of the race
  buf: { t: number; s: number[] }[]; // online: the last positions that came in for this kart
  skin: number;
  car: string;
  rev: number; // when the gas went down during the countdown (-1 = not held)
  stall: number; // the engine choked (pressed too early): seconds until it runs again
  x: number;
  y: number;
  a: number;
  vx: number;
  vy: number;
  speed: number;
  idx: number;
  total: number;
  item: ItemName | null;
  roulette: number;
  useIn: number;
  spin: number;
  spinA: number;
  boost: number;
  blind: number;
  safe: number;
  off: number;
  lane: number;
  skill: number;
  finished: boolean;
  time: number;
  place: number;
  lost: number;
  air: number; // seconds left in the air (after a jump)
  fall: number; // seconds left of falling into the void (the last BURST_TIME of it is the pixel burst)
  alt: number; // how high it's flying right now (0 = on the ground)
  tilt: number; // flying: banking into the turn
  steerVis?: number; // how hard it's turning right now (-1 left .. 1 right), for the front wheels in the picture
  lastA?: number;
};
type Thing = {
  kind: "vinyl" | "wall" | "bomb" | "mic" | "boom" | "wave";
  x: number;
  y: number;
  vx: number;
  vy: number;
  z: number;
  alt: number; // how high it was used (things thrown while flying stay up there)
  t: number;
  life: number;
  owner: Kart;
  idx: number;
  id: string; // online: the same item has the same id on every screen
};
type Sprite = { far?: boolean; img: Img; sx: number; sw: number; sh: number; x: number; y: number; k: number; lift: number; flip: boolean; shadow: boolean; squash?: number; kart?: boolean; rot?: number };

const wrapAngle = (a: number) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const PLACE = ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH"];
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export class KartGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private buf: HTMLCanvasElement;
  private bctx: CanvasRenderingContext2D;
  private frame: ImageData;
  private frame32: Uint32Array;
  private font: string;
  private base: string;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private dead = false;
  private ready = false;
  // the slapping tentacles' pieces: one round piece of tentacle lying on the road, and its shadow (faint / dark)
  private slapSeg = makeSlapSeg();
  private slapShade = makeSlapShade();
  private pendingSolo: number | null = null; // SOLO RACE was pressed while the maps were still loading: start it when they are
  private loadError = "";

  private packs: TrackPack[] = [];
  private trackNo = 0;
  private fallCam = 0;
  private zoneF = 0; // 0 = the field's sky and haze, 1 = the void's (it fades between them)
  private track!: TrackData;
  private ground!: Uint32Array;
  private gsize = 0; // the ground picture's size in pixels
  private gs = 1; // ground pixels per world unit
  private mask = new Uint8Array(BW * MAX_ROWS); // this frame: which screen pixels are field (1) and which are road (0)
  private seedMap = new Uint8Array(BW * MAX_ROWS);
  // HILLS: the height map of this map (null = flat), and for every screen row: how far away its ground is, and how high
  private hillGrid: Float32Array | null = null;
  private hgN = HG; // how many squares across the height map is (HG, or a mountain map's own size)
  private shade: Float32Array | null = null; // how lit each square of the height map is (the sun on the slopes)
  // THE TERRAIN RENDERER's own full-screen picture, and for every screen column how far up the land reaches at each distance
  private tframe = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d")!.createImageData(BW, BH) : null;
  private tframe32 = this.tframe ? new Uint32Array(this.tframe.data.buffer) : new Uint32Array(0);
  private tcanvas: HTMLCanvasElement | null = null;
  private occ = new Int16Array(BW * OCC_LEVELS);
  private rowZ = new Float32Array(MAX_ROWS);
  private rowH = new Float32Array(MAX_ROWS);
  private camG = 0; // the ground height under the camera (smoothed)
  private pitch = 0; // how far the camera is tilted (pixels the horizon moves down)
  private slope = 0; // how steep the road ahead is (smoothed)
  private types!: Uint8Array;
  private img: Record<string, HTMLImageElement> = {};
  private kartSkins: Record<string, HTMLCanvasElement>[] = [];
  private carSkins: Record<string, Record<string, HTMLCanvasElement>> = {}; // the drivers with their own look (TOMBFELL)
  driver = "mane"; // who you drive as (picked in the kart menu)
  private seaHt = new Uint8Array(0);
  private seaCol = new Uint32Array(0); // SMOKE OCEAN: each sea pixel's own colour (the waves are drawn from it)
  private seaTop = new Int16Array(BW); // SMOKE OCEAN: per column, how high the nearer waves already reach // SMOKE OCEAN: how high the smoke stands at each pixel of the ground picture
  private mini!: HTMLCanvasElement;
  private pal!: Pal;
  private boom!: HTMLCanvasElement;

  private karts: Kart[] = [];
  private me!: Kart;
  private things: Thing[] = [];
  private boxes: { x: number; y: number; back: number }[] = [];
  private state: "title" | "count" | "race" | "done" = "title";
  private clock = 0;
  private stateT = 0;
  private paused = false;
  private flash = "";
  private flashT = 0;
  private camA = 0;

  // ---- online
  private online: OnlineLink | null = null;
  private sendT = 0;
  private itemN = 0;
  private firstFin = -1; // (host) when the first player crossed the line
  private resultsSent = false;
  private results: ResultRow[] | null = null;
  private tags: { x: number; y: number; name: string; col: [number, number, number] }[] = [];
  /** set by the page: the player wants the menu (solo) or pressed Esc (online) */
  onMenu: () => void = () => {};
  /** set by the page: LEAVE LOBBY / CLOSE LOBBY in the pause menu (online) */
  onLeave: () => void = () => {};
  /** set by the page: GAME MENU in the pause menu (back to the site's game list) */
  onGameMenu: () => void = () => {};
  private menuOpen = false;
  private menuRow = 0;
  /** the page shows its own menu over the game, so the canvas doesn't draw a title screen */
  overlay = true;
  /** online: the name this player raced under (for the host's results) */
  myName = "YOU";

  private keys = new Set<string>();
  private touch = false;
  private pointers = new Map<number, { x: number; y: number }>();
  private tapItem = false;
  private lay = { ox: 0, oy: 0, u: 1 };
  private cleanup: (() => void)[] = [];
  /** music + sound effects (game/kart/sound.ts) */
  readonly snd = new KartSound();
  private lastBeep = -1;

  constructor(canvas: HTMLCanvasElement, pixelFont: string, base = "/kart/") {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.font = pixelFont;
    // make sure the pixel font is loaded before the game draws its text (otherwise the first screens use a plain font)
    try {
      void document.fonts.load(`12px ${pixelFont}`);
    } catch {}
    this.base = base;
    this.buf = document.createElement("canvas");
    this.buf.width = BW;
    this.buf.height = BH;
    this.bctx = this.buf.getContext("2d")!;
    this.bctx.imageSmoothingEnabled = false;
    this.frame = this.bctx.createImageData(BW, MAX_ROWS);
    this.frame32 = new Uint32Array(this.frame.data.buffer);
    // the on-screen buttons are for phones and tablets only: a device whose MAIN input is a finger and that has no mouse.
    // (A laptop with a touch screen still counts as a computer.) Touching the screen turns them on, pressing a key turns them off.
    this.touch = typeof window !== "undefined" && (/[?&]touch\b/.test(window.location.search) || window.matchMedia("(hover: none) and (pointer: coarse)").matches);
  }

  // ------------------------------------------------------------ start / stop
  start() {
    this.listen();
    this.load()
      .then(() => {
        this.ready = true;
        this.reset();
        this.snd.setMusic(MUSIC.menu);
        if (this.pendingSolo !== null) {
          const t = this.pendingSolo;
          this.pendingSolo = null;
          this.startSolo(t);
        }
      })
      .catch((e) => {
        this.loadError = String(e);
      });
    this.last = performance.now();
    const loop = (now: number) => {
      if (this.dead) return;
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.ready && !this.paused) {
        this.acc += dt;
        while (this.acc >= 1 / 60) {
          this.step(1 / 60);
          this.acc -= 1 / 60;
        }
      }
      // the engine hum follows your kart's speed (quiet in menus, paused, falling or after the finish)
      if (this.ready) {
        const me = this.me;
        const racing = this.state === "race" && !this.paused && !this.menuOpen && !!me && me.fall <= 0 && !me.finished;
        this.snd.engine(racing, me ? Math.abs(me.speed) / MAX_SPEED : 0, !!me && me.boost > 0);
      }
      this.draw();
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.snd.destroy();
    this.dead = true;
    cancelAnimationFrame(this.raf);
    this.cleanup.forEach((f) => f());
  }

  private loadImg(name: string) {
    return new Promise<void>((res, rej) => {
      const im = new Image();
      im.onload = () => {
        this.img[name] = im;
        res();
      };
      im.onerror = () => rej(`missing picture ${name}`);
      im.src = `${this.base}${name}.png`;
    });
  }

  // the trippy PINKMANE picture from the main page (inside 808 TEMPLE the sky turns into it). Never stops the game loading.
  private tripImg: HTMLImageElement | null = null;
  private loadTrip() {
    return new Promise<void>((res) => {
      const im = new Image();
      im.onload = () => {
        this.tripImg = im;
        res();
      };
      im.onerror = () => res();
      im.src = "/bg/mode4.jpg";
    });
  }
  private makeTripSky(W: number, H: number): HTMLCanvasElement | null {
    const im = this.tripImg;
    if (!im) return null;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d")!;
    // the picture, tiled all the way round; every other copy mirrored so the joins don't show
    const th = H, tw = Math.round((im.width / im.height) * th);
    for (let i = 0, px = 0; px < W; i++, px += tw) {
      x.save();
      if (i % 2) {
        x.translate(px + tw, 0);
        x.scale(-1, 1);
        x.drawImage(im, 0, 0, tw, th);
      } else x.drawImage(im, px, 0, tw, th);
      x.restore();
    }
    return c;
  }

  private async load() {
    const names = ["sky", "sky-void", "props", "itembox", "peak", "ring", "wings", "kart3d-mane", "ghostship", "tentacle", "speaker", "eq", "gate", "pillar", "smokering", "puff", "alp", "cave", "crystal", "pine", "goat", "bear", "cabin", "kart3d-tomb", "kart3d-bmp", "kart3d-bobo", ...ITEMS.map((i) => `item-${i}`)];
    const [packs] = await Promise.all([Promise.all(TRACKS.map((t) => this.loadTrack(t.id))), ...names.map((n) => this.loadImg(n)), this.loadTrip()]);
    this.packs = packs;
    for (const it of ITEMS) (this.img[`item-${it}`] as { pkRes?: number }).pkRes = this.img[`item-${it}`].width / 48;
    (this.img["props"] as { pkRes?: number }).pkRes = this.img["props"].height / 64;
    this.useTrack(0);
    // kart colours
    // skin 0 = the drawing as it is, skins 1 - 7 = the same kart in another colour
    // THE 3D PINKMANE KART: one sheet (kart3d-mane.png) with 16 views all the way around (rows: 0 = from behind,
    // 4 = from his right, 8 = from the front, 12 = from his left) and 3 pictures per view (plain, flames, bigger flames).
    // It was rendered from a low-poly 3D model; each racer gets it in their own colour.
    this.kartSkins = [{ car: "mane", color: null }, ...BOTS].map((b) => {
      const sheet = this.tint(this.img["kart3d-mane"], b.color as [number, number, number] | null);
      const fh = sheet.height / KART_ANGLES;
      const set: Record<string, HTMLCanvasElement> = {};
      for (let i = 0; i < KART_ANGLES; i++) {
        const v = document.createElement("canvas");
        v.width = sheet.width;
        v.height = fh;
        v.getContext("2d")!.drawImage(sheet, 0, i * fh, sheet.width, fh, 0, 0, sheet.width, fh);
        set[`a${i}`] = v;
      }
      return set;
    });
    // the drivers with their own look: their sheet cut into the 16 views, not recoloured
    for (const d of DRIVERS) {
      if (d.id === "mane" || !this.img[`kart3d-${d.id}`]) continue;
      const sheet = this.img[`kart3d-${d.id}`];
      const fh = sheet.height / KART_ANGLES;
      const set: Record<string, HTMLCanvasElement> = {};
      for (let i = 0; i < KART_ANGLES; i++) {
        const v = document.createElement("canvas");
        v.width = sheet.width;
        v.height = fh;
        v.getContext("2d")!.drawImage(sheet, 0, i * fh, sheet.width, fh, 0, 0, sheet.width, fh);
        set[`a${i}`] = v;
      }
      this.carSkins[d.id] = set;
    }
    // the explosion: 6 clean frames side by side (a ball of fire that opens into a ring)
    const BF = 64;
    this.boom = document.createElement("canvas");
    this.boom.width = BF * 6;
    this.boom.height = BF;
    const bc = this.boom.getContext("2d")!;
    const cols = ["#ffffff", "#ffe23c", "#ff9628", "#ff46c8"];
    for (let f = 0; f < 6; f++) {
      const outer = 11 + f * 4;
      const inner = f < 2 ? 0 : f < 4 ? (f - 1) * 6 : outer - (7 - f) * 2; // the last two frames: just a thin ring
      for (let y = 0; y < BF; y++)
        for (let x = 0; x < BF; x++) {
          const ex = x - BF / 2 + 0.5, ey = y - BF / 2 + 0.5;
          const r = Math.hypot(ex, ey) + Math.sin(Math.atan2(ey, ex) * 8) * 1.7;
          if (r >= outer || r < inner) continue;
          bc.fillStyle = cols[Math.min(3, Math.floor(((r - inner) / (outer - inner)) * 4))];
          bc.fillRect(x, y, 1, 1);
        }
    }
  }

  // swap the pink in a kart picture for another colour (and tint the white body a little)
  private tint(src: HTMLImageElement, col: [number, number, number] | null) {
    const c = document.createElement("canvas");
    c.width = src.width;
    c.height = src.height;
    const x = c.getContext("2d")!;
    x.drawImage(src, 0, 0);
    if (!col) return c;
    const d = x.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i + 1], b = p[i + 2];
      if (r > 80 && r > g * 1.8 && b > g * 1.35) {
        const f = r / 255;
        p[i] = col[0] * f;
        p[i + 1] = col[1] * f;
        p[i + 2] = col[2] * f;
      } else if (r > 195 && g > 190 && b > 220) {
        p[i] = r * 0.72 + col[0] * 0.28;
        p[i + 1] = g * 0.72 + col[1] * 0.28;
        p[i + 2] = b * 0.72 + col[2] * 0.28;
      }
    }
    x.putImageData(d, 0, 0);
    return c;
  }

  // ------------------------------------------------------------ input
  private listen() {
    // typing in the page's boxes (name, code, link) doesn't drive the kart
    const typing = (e: Event) => !!(e.target as HTMLElement | null)?.closest?.("input, textarea, select");
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      this.snd.unlock();
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (k === "m" && !e.repeat) {
        this.say(this.snd.toggleMute() ? "SOUND OFF" : "SOUND ON", 1);
        return;
      }
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(k)) e.preventDefault();
      // driving with the keyboard: the on-screen phone buttons go away
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d", " "].includes(k)) this.touch = false;
      if (e.repeat) return;
      // the pause menu is open: up / down pick a row, Enter or Space choose, Esc closes it
      if (this.menuOpen) {
        const rows = this.menuRows();
        if (k === "ArrowUp" || k === "w") this.menuRow = (this.menuRow + rows.length - 1) % rows.length;
        else if (k === "ArrowDown" || k === "s") this.menuRow = (this.menuRow + 1) % rows.length;
        else if (k === "Enter" || k === " ") this.menuChoose();
        else if (k === "Escape" || k === "p") this.closeMenu();
        return;
      }
      this.keys.add(k);
      if (k === "Enter") this.confirm();
      if (k === "Escape" || k === "p") {
        if (this.state === "race" || this.state === "count" || (this.online && this.state === "done")) this.openMenu();
        else if (this.state === "done" && k === "Escape") this.onMenu();
      }
      if (k === " " || k === "x") this.tapItem = true;
      if (k === "r" && this.state === "race") this.rescue(this.me);
    };
    const up = (e: KeyboardEvent) => {
      if (!typing(e)) this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    const pos = (e: PointerEvent) => {
      // where the finger is, in game pixels (0..480 across, 0..270 down)
      const r = this.canvas.getBoundingClientRect();
      const px = ((e.clientX - r.left) / r.width) * this.canvas.width, py = ((e.clientY - r.top) / r.height) * this.canvas.height;
      return { x: (px - this.lay.ox) / this.lay.u, y: (py - this.lay.oy) / this.lay.u };
    };
    const pd = (e: PointerEvent) => {
      if (e.pointerType === "touch") this.touch = true;
      this.snd.unlock();
      const p = pos(e);
      // PHONES: the PAUSE button (top left) and the BACK ON THE ROAD button (shows when you're lost) are checked first,
      // so the same tap doesn't also steer or fire an item
      if (this.touch && !this.menuOpen && (this.state === "race" || this.state === "count")) {
        if (inBox(p, PAUSE_BTN)) {
          this.openMenu();
          return;
        }
        if (this.state === "race" && this.me.lost > 1 && inBox(p, RESET_BTN)) {
          this.rescue(this.me);
          return;
        }
      }
      this.pointers.set(e.pointerId, p);
      if (this.menuOpen) {
        // tap a row of the pause menu
        const r = Math.floor((p.y - MENU_TOP - 40) / 14);
        if (r >= 0 && r < this.menuRows().length) {
          this.menuRow = r;
          this.menuChoose();
        }
        this.pointers.delete(e.pointerId);
      } else if (this.state === "done" || (this.state === "title" && !this.overlay)) this.confirm();
      else if (this.touch && p.x > UW / 2 && (p.y < 165 || p.x >= UW - 68)) this.tapItem = true;
    };
    const pm = (e: PointerEvent) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, pos(e));
    };
    const pu = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    this.canvas.addEventListener("pointerdown", pd);
    this.canvas.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("pointercancel", pu);
    const blur = () => {
      this.keys.clear();
      this.pointers.clear();
    };
    window.addEventListener("blur", blur);
    // another tab or the phone's home screen: the music goes quiet (and comes back when you return)
    const vis = () => this.snd.setHidden(document.hidden);
    document.addEventListener("visibilitychange", vis);
    this.cleanup.push(() => document.removeEventListener("visibilitychange", vis));
    this.cleanup.push(() => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      this.canvas.removeEventListener("pointerdown", pd);
      this.canvas.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      window.removeEventListener("pointercancel", pu);
      window.removeEventListener("blur", blur);
    });
  }

  // ---- THE PAUSE MENU (the same one as every game). Solo: the race stops. Online: the others keep racing.
  private menuRows(): string[] {
    const sound = this.snd.muted ? "SOUND: OFF" : "SOUND: ON";
    return this.online ? ["RESUME", this.online.isHost ? "CLOSE LOBBY" : "LEAVE LOBBY", sound, "GAME MENU"] : ["RESUME", "RESTART", "KART MENU", sound, "GAME MENU"];
  }

  /** Esc, P, or the page's little MENU button */
  // For game controllers (app/components/GamepadBridge.tsx): "kart" = driving (A is gas),
  // "menu" = a menu or the results are showing (A is OK).
  padMode(): "kart" | "menu" {
    return (this.state === "race" || this.state === "count") && !this.menuOpen ? "kart" : "menu";
  }

  openMenu() {
    if (!this.ready || this.state === "title") return;
    if (this.menuOpen) return this.closeMenu();
    if (this.state === "done" && !this.online) return this.onMenu();
    this.menuOpen = true;
    this.menuRow = 0;
    this.paused = !this.online;
    this.keys.clear();
    this.snd.setDuck(true);
  }

  private closeMenu() {
    this.snd.setDuck(false);
    this.menuOpen = false;
    this.paused = false;
    this.keys.clear();
    this.tapItem = false;
  }

  private menuChoose() {
    const pick = this.menuRows()[this.menuRow];
    // SOUND: ON / OFF flips right there, and the menu stays open
    if (pick.startsWith("SOUND")) {
      this.snd.toggleMute();
      return;
    }
    this.closeMenu();
    if (pick === "RESTART") this.startSolo();
    else if (pick === "KART MENU") this.onMenu();
    else if (pick === "LEAVE LOBBY" || pick === "CLOSE LOBBY") this.onLeave();
    else if (pick === "GAME MENU") this.onGameMenu();
  }

  private confirm() {
    if (!this.ready) return;
    if (this.online) return; // online the host starts races (on the page's buttons)
    if (this.state === "title") {
      if (this.overlay) return; // the page's menu starts the race
      this.state = "count";
      this.stateT = 0;
    } else if (this.state === "done" && this.stateT > 1.5) {
      this.reset();
      this.state = "count";
    }
  }

  // phone: the two arrows on the left steer; on the right, the far right edge is ITEM and the rest of the bottom is BRAKE
  private touchSteer() {
    let s = 0;
    let brake = false;
    for (const p of this.pointers.values()) {
      if (p.x < 200 && p.y > 90) s += p.x < 97 ? -1 : 1;
      if (p.x >= UW / 2 && p.x < UW - 68 && p.y >= 165) brake = true;
    }
    return { s: clamp(s, -1, 1), brake };
  }

  // ------------------------------------------------------------ race setup
  private reset() {
    const C = this.track.center;
    const N = C.length;
    this.karts = [];
    this.things = [];
    this.boxes = this.track.boxes.map(([x, y]) => ({ x, y, back: 0 }));
    for (let i = 0; i < 6; i++) {
      const row = Math.floor(i / 2);
      const idx = (N - 5 - row * 4 + N) % N;
      const [cx, cy] = C[idx];
      const [nx, ny] = C[(idx + 1) % N];
      const a = Math.atan2(ny - cy, nx - cx);
      const side = (i % 2 ? 1 : -1) * 16;
      const player = i === 5;
      // the first computer racers are the other drivers (TOMBFELL, BEARMANPIG, BOBO), apart from the one you picked
      const others = DRIVERS.filter((d) => d.id !== "mane" && d.id !== this.driver);
      const special = !player && i < others.length ? others[i] : null;
      this.karts.push({
        name: player ? "YOU" : special ? special.name : BOTS[i].name,
        player,
        id: "",
        ctl: player ? "me" : "bot",
        isBot: !player,
        left: false,
        buf: [],
        skin: player ? 0 : i + 1,
        car: player ? (CARS[this.driver] ? this.driver : "mane") : special ? special.id : BOTS[i].car,
        rev: -1,
        stall: 0,
        x: cx - Math.sin(a) * side,
        y: cy + Math.cos(a) * side,
        a,
        vx: 0,
        vy: 0,
        speed: 0,
        idx,
        total: idx - N,
        item: null,
        roulette: 0,
        useIn: 0,
        spin: 0,
        spinA: 0,
        boost: 0,
        blind: 0,
        safe: 0,
        off: 0,
        lane: (Math.random() * 2 - 1) * 0.45,
        skill: 0.86 + i * 0.028,
        finished: false,
        time: 0,
        place: i + 1,
        lost: 0,
        air: 0,
        fall: 0,
        alt: 0,
        tilt: 0,
      });
    }
    this.me = this.karts[5];
    this.online = null;
    this.results = null;
    this.camA = this.me.a;
    this.clock = 0;
    this.stateT = 0;
    this.state = "title";
    this.flash = "";
  }

  // one track: its numbers (trackN.json), its ground picture, its surface map and its little map
  private async loadTrack(id: string): Promise<TrackPack> {
    const [data] = await Promise.all([fetch(`${this.base}${id}.json`).then((r) => r.json()), this.loadImg(`${id}-ground`), this.loadImg(`${id}-map`)]);
    const track = data as TrackData;
    // A REAL MOUNTAIN: its height map is a picture too (16 bits in red + green: height = (r * 256 + g) / 40 - 100)
    let terrainGrid: Float32Array | undefined;
    if (track.terrain && track.tgrid) {
      await this.loadImg(`${id}-height`);
      const TGN = track.tgrid;
      const hc = document.createElement("canvas");
      hc.width = TGN;
      hc.height = TGN;
      const hx = hc.getContext("2d", { willReadFrequently: true })!;
      hx.drawImage(this.img[`${id}-height`], 0, 0);
      const hd = hx.getImageData(0, 0, TGN, TGN).data;
      terrainGrid = new Float32Array(TGN * TGN);
      for (let i = 0; i < terrainGrid.length; i++) terrainGrid[i] = (hd[i * 4] * 256 + hd[i * 4 + 1]) / 40 - 100;
    }
    const S = track.size;
    // the ground picture as raw pixels
    const gimg = this.img[`${id}-ground`];
    const GZ = gimg.width;
    const g = document.createElement("canvas");
    g.width = GZ;
    g.height = GZ;
    const gc = g.getContext("2d", { willReadFrequently: true })!;
    gc.drawImage(gimg, 0, 0);
    const ground = new Uint32Array(gc.getImageData(0, 0, GZ, GZ).data.buffer);
    // the surface map (half the size of the ground): 0 field (slow), 1 road, 2 boost pad, 3 void (you fall), 4 jump
    const m = document.createElement("canvas");
    m.width = S / 2;
    m.height = S / 2;
    const mc = m.getContext("2d", { willReadFrequently: true })!;
    mc.drawImage(this.img[`${id}-map`], 0, 0);
    const md = mc.getImageData(0, 0, S / 2, S / 2).data;
    const types = new Uint8Array((S / 2) * (S / 2));
    for (let i = 0; i < types.length; i++) types[i] = Math.round(md[i * 4] / 40);
    // minimap: the road
    const MS = 96;
    const mini = document.createElement("canvas");
    mini.width = MS;
    mini.height = MS;
    const nc = mini.getContext("2d")!;
    const nd = nc.createImageData(MS, MS);
    for (let y = 0; y < MS; y++)
      for (let x = 0; x < MS; x++) {
        const t = types[Math.floor(((y + 0.5) / MS) * (S / 2)) * (S / 2) + Math.floor(((x + 0.5) / MS) * (S / 2))];
        const o = (y * MS + x) * 4;
        if (t === 1 || t === 2 || t === 4) {
          nd.data[o] = 236;
          nd.data[o + 1] = 230;
          nd.data[o + 2] = 255;
          nd.data[o + 3] = 230;
        }
      }
    nc.putImageData(nd, 0, 0);
    // this map's own colours: turn the ground's colours (but not the boost pads: they stay light blue everywhere)
    const info = TRACKS.find((t) => t.id === id) as { hue: number; road?: string; psy?: PsyTheme } | undefined;
    const hue = info?.hue ?? 0, style = info?.road ?? "", psy = info?.psy;
    if (hue || style || psy) {
      const M = hueMatrix(hue), TH = S / 2, k = S / GZ / 2, wk = S / GZ;
      for (let y = 0; y < GZ; y++) {
        const row = Math.min(TH - 1, (y * k) | 0) * TH;
        for (let x = 0; x < GZ; x++) {
          const t = types[row + Math.min(TH - 1, (x * k) | 0)];
          if (t === 2) continue; // boost pads stay light blue everywhere
          const o = y * GZ + x;
          if (psy && (t === 0 || (t === 5 && track.terrain)) && !track.painted) { // (on a mountain map the flying zone is land too)
            ground[o] = fieldPixel(psy, x * wk, y * wk); // the glowing marble beside the road
            continue;
          }
          if (style && (t === 1 || t === 4)) {
            const c = roadPixel(style, ground[o], x * wk, y * wk, psy);
            if (c) {
              ground[o] = c;
              continue;
            }
          }
          if (hue && !track.painted) ground[o] = tint(ground[o], M); // (painted land keeps its own colours)
        }
      }
    }
    return { track, ground, gsize: GZ, gs: GZ / S, types, mini, hillGrid: terrainGrid };
  }

  /** the sky, haze and edge colours of one map, turned to that map's hue */
  private makePal(hue: number, greenPlants = false, psy?: PsyTheme, indoors = false): Pal {
    const M = hueMatrix(hue);
    const sky = (name: string) => {
      const im = this.img[name];
      const c = document.createElement("canvas");
      c.width = im.width;
      c.height = im.height;
      const x = c.getContext("2d", { willReadFrequently: true })!;
      x.drawImage(im, 0, 0);
      if (hue) {
        const d = x.getImageData(0, 0, c.width, c.height);
        const px = new Uint32Array(d.data.buffer);
        for (let i = 0; i < px.length; i++) if (px[i] >>> 24) px[i] = tint(px[i], M, true);
        x.putImageData(d, 0, 0);
      }
      return c;
    };
    const t = (c: number) => (hue ? tint(c, M) : c);
    if (psy) {
      // THE PSYCHEDELIC LOOK: this map's sky, haze, grass fringe and roadside things all come from game/kart/psy.ts
      const P = psyColours(psy);
      const A = (c: number[]) => abgr(c[0], c[1], c[2]);
      const sk = this.img["sky"];
      const psySky = makePsySky(psy, sk.width, sk.height); // (the void parts of a map use the same sky)
      // a map with a building (808 TEMPLE): inside, the sky turns into the trippy picture (wobbling, see drawWorld)
      const tripSky = indoors ? this.makeTripSky(sk.width, sk.height) : null;
      const inside = tripSky ?? (indoors ? makeTempleWall(sk.width, sk.height) : psySky);
      return {
        fog: P.fog, vfog: rgbOf(t(abgr(52, 14, 84))), vdeep: rgbOf(t(abgr(6, 2, 14))),
        farLine: A(P.field[2].map((v) => v * 0.45)), farDark: A(P.field[0]),
        lip: t(SLAB_LIP), side: t(SLAB_SIDE), rib: t(SLAB_RIB),
        gDark: A(P.grass[0]), gMid: A(P.grass[1]), gTip: A(P.grass[2]), gBank: A(P.grass[3]),
        sky: psySky, skyVoid: inside, skyTop: `rgb(${P.sky[0].join(",")})`, trip: !!tripSky,
        props: makePsyProps(psy, this.img["props"], greenPlants),
      };
    }
    return {
      fog: rgbOf(t(abgr(235, 50, 170))), vfog: rgbOf(t(abgr(52, 14, 84))), vdeep: rgbOf(t(abgr(6, 2, 14))),
      farLine: t(0xff4a103a), farDark: t(0xff200914),
      lip: t(SLAB_LIP), side: t(SLAB_SIDE), rib: t(SLAB_RIB),
      gDark: t(GRASS_DARK), gMid: t(GRASS_MID), gTip: t(GRASS_TIP), gBank: t(GRASS_BANK),
      sky: sky("sky"), skyVoid: sky("sky-void"),
      props: greenPlants ? this.greenProps() : this.img["props"],
    };
  }

  /** the plants by the road with light-green outlines instead of pink (the black stays black) */
  private greenProps(): HTMLCanvasElement {
    const im = this.img["props"];
    const c = document.createElement("canvas");
    c.width = im.width;
    c.height = im.height;
    const x = c.getContext("2d", { willReadFrequently: true })!;
    x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) {
      const r = px[i], g = px[i + 1], b = px[i + 2];
      if (!px[i + 3] || r < 90 || g > r * 0.65 || b < 50) continue; // not pink or purple: leave it
      const L = Math.max(r, b);
      px[i] = Math.round(L * 0.5);
      px[i + 1] = Math.round(L * 0.86);
      px[i + 2] = Math.round(L * 0.42);
    }
    x.putImageData(d, 0, 0);
    (c as { pkRes?: number }).pkRes = resOf(im);
    return c;
  }

  private useTrack(i: number) {
    const p = this.packs[clamp(Math.floor(i) || 0, 0, this.packs.length - 1)];
    this.trackNo = this.packs.indexOf(p);
    this.track = p.track;
    this.hillGrid = p.track.terrain ? p.hillGrid ?? null : p.track.hill ? (p.hillGrid ??= this.makeHillGrid(p.track)) : null;
    this.hgN = p.track.terrain ? p.track.tgrid ?? HG : HG;
    // the sun on the hills: every square of the height map gets lit or shaded by which way its slope faces
    // (not on a map whose picture has the light painted in already)
    this.shade = this.hillGrid && !p.track.painted ? (p.shade ??= this.makeShade(this.hillGrid, this.hgN, p.track.size / this.hgN)) : null;
    this.camG = 0;
    this.pitch = 0;
    this.slope = 0;
    this.ground = p.ground;
    this.gsize = p.gsize;
    this.gs = p.gs;
    this.types = p.types;
    this.mini = p.mini;
    const info = TRACKS[this.trackNo] as { hue: number; greenPlants?: boolean; psy?: PsyTheme };
    this.pal = p.pal ?? (p.pal = this.makePal(info.hue, !!info.greenPlants, info.psy, !!p.track?.tunnel));
    this.zoneF = 0;
  }

  /** the menu picked a track: show it behind the menu */
  setTrack(i: number) {
    if (!this.ready || this.state !== "title") return;
    this.useTrack(i);
    this.reset();
  }

  get trackIndex() {
    return this.trackNo;
  }

  private typeAt(x: number, y: number) {
    const h = this.track.size / 2;
    const ix = x >> 1, iy = y >> 1;
    if (ix < 0 || iy < 0 || ix >= h || iy >= h) return this.track.outside ?? 0;
    return this.types[iy * h + ix];
  }

  private rescue(k: Kart) {
    const C = this.track.center;
    const N = C.length;
    // back on the road: usually right where it is on the lap; before the jump if it fell into the gap
    const j = this.track.spawnIdx ? this.track.spawnIdx[k.idx] ?? k.idx : k.idx;
    let back = k.idx - j;
    if (back > N / 2) back -= N;
    if (back < -N / 2) back += N;
    k.total -= back;
    k.idx = j;
    const [cx, cy] = C[j];
    const [nx, ny] = C[(j + 1) % N];
    k.a = Math.atan2(ny - cy, nx - cx);
    // where the road splits around a hole: put it on one of the two sides (its own lane's side). If the hole starts just
    // ahead, it goes on that side already, not in the middle (it used to land right in front of the hole and fall again)
    const offs = this.track.spawnOff;
    let side = offs ? offs[j] ?? 0 : 0;
    if (offs && !side) for (let d = 1; d <= 10; d++) side = Math.max(side, offs[(j + d) % N] ?? 0);
    if (side && k.lane < 0) side = -side;
    k.x = cx - Math.sin(k.a) * side;
    k.y = cy + Math.cos(k.a) * side;
    k.vx = k.vy = k.speed = 0;
    k.spin = 0;
    k.lost = 0;
    k.air = 0;
    k.fall = 0;
    k.safe = 1.5;
  }

  // ------------------------------------------------------------ one step of the game
  private step(dt: number) {
    this.stateT += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.state === "title") return;
    if (this.state === "count") {
      // revving: hold the gas during the countdown. From the 2 on = ROCKET START, earlier = TOO EARLY
      const me = this.me;
      const held = !this.menuOpen && (this.keys.has("ArrowUp") || this.keys.has("w") || (this.touch && this.pointers.size > 0));
      if (!held) me.rev = -1;
      else if (me.rev < 0) me.rev = this.stateT;
      // 3, 2, 1: a beep on each number
      const beat = Math.floor(this.stateT);
      if (beat !== this.lastBeep && beat < 3) {
        this.lastBeep = beat;
        this.snd.play("beep");
      }
      if (this.stateT >= GO_TIME) {
        this.state = "race";
        this.stateT = 0;
        for (const k of this.karts) {
          if (k.ctl === "remote") continue; // other players start their own karts
          if (k.ctl === "bot") {
            const r = Math.random();
            k.rev = r < 0.3 ? 2 : r < 0.38 ? 0 : -1; // some bots get it right, a few choke
          }
          if (k.rev >= REV_FROM) k.boost = 1.3;
          else if (k.rev >= 0) k.stall = 1.2;
        }
        this.say(me.rev >= REV_FROM ? "ROCKET START!" : me.rev >= 0 ? "TOO EARLY!" : "GO!", 1.2);
        this.lastBeep = -1;
        this.snd.play("go");
        if (me.rev >= REV_FROM) this.snd.play("boost");
        else if (me.rev >= 0) this.snd.play("stall");
        for (const k of this.karts) if (k.ctl !== "remote") k.rev = -1;
      }
      for (const k of this.karts) if (k.ctl === "remote") this.stepRemote(k);
      this.stepOnline(1 / 60);
      return;
    }
    if (this.state === "race") this.clock += dt;
    const C = this.track.center;
    const N = C.length;

    for (const k of this.karts) {
      if (k.ctl === "remote") {
        this.stepRemote(k);
        continue;
      }
      // ---- falling into the void: down it goes, then it's put back on the road
      if (k.fall > 0) {
        k.fall -= dt;
        k.speed = k.vx = k.vy = 0;
        if (k.fall <= 0) this.rescue(k);
        continue;
      }
      // ---- what the driver wants
      let steer = 0, gas = 0, brake = false;
      if (k.finished || !k.player) {
        // (on the floating road the bots look less far ahead, so they don't cut a corner into the void)
        const look = Math.round((9 + Math.floor(Math.abs(k.speed) / 22)) * (this.track.zone?.[k.idx] ? 0.55 : 1));
        const ti = (k.idx + look) % N;
        const [tx, ty] = C[ti];
        const [ux, uy] = C[(ti + 1) % N];
        const ta = Math.atan2(uy - ty, ux - tx);
        // their lane; where the road splits around a hole they pick a side and stay on it
        const hole = this.track.spawnOff?.[ti] ?? 0;
        const w = hole ? (k.lane < 0 ? -hole : hole) : Math.max(0, this.track.halfw[ti] - 20) * k.lane;
        let px = tx - Math.sin(ta) * w, py = ty + Math.cos(ta) * w;
        // on the floating road, close to the edge: forget the lane, head for the middle of the road just ahead, and ease off
        const edgeGap = this.track.halfw[k.idx] - k.off;
        const nearEdge = !!this.track.zone?.[k.idx] && k.air <= 0 && edgeGap < 12;
        if (nearEdge) {
          [px, py] = C[(k.idx + 5) % N];
        }
        // where the road splits around a hole: a bot drifting toward the hole picks the side it's already on and heads there
        const holeAhead = Math.max(this.track.spawnOff?.[k.idx] ?? 0, this.track.spawnOff?.[(k.idx + 6) % N] ?? 0);
        const nearHole = holeAhead > 0 && k.air <= 0 && !nearEdge && k.off < 40;
        if (nearHole) {
          const [cx, cy] = C[k.idx], [dx2, dy2] = C[(k.idx + 1) % N];
          const da = Math.atan2(dy2 - cy, dx2 - cx);
          const side = (k.x - cx) * -Math.sin(da) + (k.y - cy) * Math.cos(da);
          const sgn = Math.abs(side) > 2 ? Math.sign(side) : k.lane < 0 ? -1 : 1;
          k.lane = sgn * Math.max(0.2, Math.abs(k.lane));
          const [fx, fy] = C[(k.idx + 5) % N], [gx, gy] = C[(k.idx + 6) % N];
          const fa = Math.atan2(gy - fy, gx - fx);
          px = fx - Math.sin(fa) * 58 * sgn;
          py = fy + Math.cos(fa) * 58 * sgn;
        }
        let want = wrapAngle(Math.atan2(py - k.y, px - k.x) - k.a);
        if (k.blind > 0) want += Math.sin(this.clock * 7 + k.skin) * 0.5;
        steer = clamp(want * (nearEdge || nearHole ? 4 : 3), -1, 1);
        gas = Math.abs(want) > 0.7 ? 0.55 : 1;
        if (nearEdge) gas = Math.min(gas, edgeGap < 6 ? 0.3 : 0.6);
        if (nearHole) gas = Math.min(gas, k.off < 30 ? 0.3 : 0.7);
        if (Math.random() < 0.004) k.lane = (Math.random() * 2 - 1) * 0.45;
        // on the floating road they lift off the gas before a sharp corner
        if (this.track.zone?.[k.idx] && k.air <= 0) {
          const [ax, ay] = C[(k.idx + 16) % N], [bx, by] = C[(k.idx + 18) % N];
          const turn = Math.abs(wrapAngle(Math.atan2(by - ay, bx - ax) - k.a));
          if (turn > 0.55 && k.speed > 150) {
            gas = 0;
            brake = k.speed > 185;
          }
        }
      } else {
        const t = this.touchSteer();
        if (this.keys.has("ArrowLeft") || this.keys.has("a")) steer -= 1;
        if (this.keys.has("ArrowRight") || this.keys.has("d")) steer += 1;
        steer = clamp(steer + t.s, -1, 1);
        brake = this.keys.has("ArrowDown") || this.keys.has("s") || t.brake;
        gas = this.keys.has("ArrowUp") || this.keys.has("w") || (this.touch && !brake) ? 1 : 0;
        if (this.menuOpen) {
          // online with the menu open: hands off, the kart rolls out
          steer = 0;
          gas = 0;
          brake = false;
        }
      }

      // ---- timers
      if (k.stall > 0) {
        k.stall -= dt;
        gas = 0;
        brake = false;
      }
      if (k.boost > 0) k.boost -= dt;
      if (k.blind > 0) k.blind -= dt;
      if (k.safe > 0) k.safe -= dt;
      if (k.air > 0) {
        k.air -= dt;
        steer *= 0.3; // not much steering in the air
        // a kart in the air keeps its jump speed (a bump or an item mid-air used to drop it into the gap)
        k.speed = Math.max(k.speed, 265);
      }
      // FLYING: over the hills the kart grows wings and rises to the flight path's height (which goes up and down)
      const under = this.typeAt(k.x, k.y);
      const altT = under === 5 ? this.track.alt?.[k.idx] || 70 : 0;
      k.alt += (altT - k.alt) * Math.min(1, (altT > k.alt ? 2.2 : 3.2) * dt);
      if (altT === 0 && k.alt < 0.5) k.alt = 0;
      const flying = k.alt > 6;
      k.tilt += ((flying ? steer * 0.45 : 0) - k.tilt) * Math.min(1, 8 * dt);
      const type = k.air > 0 || flying ? 1 : under;
      if (type === 2 && k.boost < 0.9) {
        if (k.player) this.snd.play("boost");
        k.boost = 1.1;
      }
      if (type === 4) {
        // the jump: everybody gets launched fast enough to make it across
        k.air = AIR_TIME;
        k.speed = Math.max(k.speed, 265);
        // (straight away, not after the usual little slide, so a slow kart still clears the gap)
        k.vx = Math.cos(k.a) * k.speed;
        k.vy = Math.sin(k.a) * k.speed;
        if (k.player) this.say(this.track.jumpText ?? "JUMP!", 0.8);
      }
      if (type === 3) {
        if (k.player) buzz();
        k.fall = FALL_TIME + BURST_TIME;
        k.boost = 0;
        k.spin = 0;
        k.spinA = 0;
        if (k.player) this.say(this.track.seaSplit ? (k.x < this.track.seaSplit ? "SPLASH!" : "POOF!") : (this.track.fallText ?? "INTO THE VOID"), 1);
        continue;
      }

      // ---- speed
      const df = DIFFICULTY[this.online ? "MEDIUM" : this.difficulty];
      const human = k.player || k === this.me; // (your kart, even while the autopilot drives it)
      let top = MAX_SPEED * (human ? 1 : Math.max(df.floor, k.skill) * df.speed);
      if (!human && !k.finished) {
        const gap = k.total - this.me.total;
        if (gap > 55) top *= df.wait;
        if (gap < -55) top *= df.chase * (1 + Math.min(df.pull, (-gap - 55) / 900));
        if (k.blind > 0) top *= 0.8;
      }
      if (type === 0 || type === 6) top *= 0.42; // off the road (6 = painted ground like the vinyl record: slow too, so it's no shortcut)
      if (flying) top *= 1.12;
      if (k.boost > 0) top = MAX_SPEED * 1.5;
      if (k.spin > 0) {
        // a spin-out: exactly two full turns, fast at first and easing out, so it always ends facing forward
        k.spin -= dt;
        const p = 1 - Math.max(0, k.spin) / SPIN_TIME;
        k.spinA = Math.PI * 4 * (1 - (1 - p) * (1 - p));
        k.speed *= 0.96;
        if (k.spin <= 0) k.spinA = 0;
      } else {
        if (brake) k.speed -= (k.speed > 0 ? 330 : 120) * dt;
        else if (gas) k.speed += (top - k.speed) * (k.boost > 0 ? 3.2 : k.speed > top ? 2.4 : 1.25) * gas * dt + 18 * dt;
        else k.speed -= k.speed * 0.9 * dt;
        if (!brake && k.speed > top) k.speed -= (k.speed - top) * 2.5 * dt;
        k.speed = clamp(k.speed, -80, MAX_SPEED * 1.6);
        const grip = clamp(k.speed / 80, -1, 1);
        k.a += steer * (2.5 - 0.7 * Math.min(1, Math.abs(k.speed) / MAX_SPEED)) * grip * dt;
      }
      // a little slide: the kart keeps some of where it was going
      const wx = Math.cos(k.a) * k.speed, wy = Math.sin(k.a) * k.speed;
      const g = Math.min(1, 9 * dt);
      k.vx += (wx - k.vx) * g;
      k.vy += (wy - k.vy) * g;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const S = this.track.size;
      if (k.x < 12 || k.y < 12 || k.x > S - 12 || k.y > S - 12) {
        k.x = clamp(k.x, 12, S - 12);
        k.y = clamp(k.y, 12, S - 12);
        k.speed *= 0.5;
      }

      // ---- where on the lap
      let best = k.idx, bd = 1e18;
      for (let o = -12; o <= 26; o++) {
        const i = (k.idx + o + N) % N;
        const dx = C[i][0] - k.x, dy = C[i][1] - k.y;
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      let delta = best - k.idx;
      if (delta > N / 2) delta -= N;
      if (delta < -N / 2) delta += N;
      k.idx = best;
      k.total += delta;
      k.off = Math.sqrt(bd);
      if (flying) {
        // the wind keeps you on the flight path
        const hw = this.track.halfw[k.idx];
        if (k.off > hw) {
          k.x += (C[k.idx][0] - k.x) * 0.05;
          k.y += (C[k.idx][1] - k.y) * 0.05;
          k.speed *= 0.99;
        }
        // mountain tops spin you out, rings give a boost
        for (const pk of this.track.peaks ?? [])
          if (Math.abs(pk[0] - k.x) < 17 && Math.abs(pk[1] - k.y) < 17 && k.safe <= 0) {
            this.hit(k, 0.8);
            k.speed *= 0.4;
          }
        for (const rg of this.track.rings ?? [])
          if (k.boost < 0.6 && Math.abs(rg[0] - k.x) < 19 && Math.abs(rg[1] - k.y) < 19) {
            k.boost = 1.3;
            if (k.player) this.say("RING!", 0.6);
          }
      }
      // lost far away from the road (or a stuck bot): put back
      k.lost = k.off > this.track.halfw[k.idx] + 150 || (!k.player && Math.abs(k.speed) < 25 && k.spin <= 0) ? k.lost + dt : 0;
      if (k.lost > (k.player ? 3 : 2.5)) this.rescue(k);

      if (!k.finished && k.total >= N * LAPS) {
        k.finished = true;
        k.time = this.clock;
        k.place = this.karts.filter((o) => o.finished).length;
        if (k.player) {
          this.state = "done";
          this.stateT = 0;
          this.snd.play("finish");
          this.online?.sendFinish(k.time);
        }
        if (!k.isBot && this.firstFin < 0) this.firstFin = this.clock;
      } else if (k.player && !k.finished && delta > 0 && k.total >= N * (LAPS - 1) && k.total - delta < N * (LAPS - 1)) this.say("FINAL LAP", 2);

      // ---- item boxes
      if (k.roulette > 0) {
        k.roulette -= dt;
        if (k.roulette <= 0) {
          const first = this.rank(k) === 1;
          const pool: ItemName[] = first ? ["vinyl", "wall", "bolt", "bomb", "vinyl"] : ["bolt", "bomb", "vinyl", "mic", "bass", "mute", "wall", "bolt", "mic"];
          k.item = pool[Math.floor(Math.random() * pool.length)];
          k.useIn = (1 + Math.random() * 3.5) * DIFFICULTY[this.online ? "MEDIUM" : this.difficulty].items;
        }
      } else if (!k.item && !k.finished) {
        for (const b of this.boxes)
          if (b.back <= 0 && Math.abs(b.x - k.x) < 15 && Math.abs(b.y - k.y) < 15) {
            b.back = 2.5;
            k.roulette = 0.9;
            if (k.player) this.snd.play("pick");
          }
      }
      if (k.item && k.spin <= 0) {
        if (k.player && !k.finished) {
          if (this.tapItem) this.useItem(k);
        } else {
          k.useIn -= dt;
          if (k.useIn <= 0) this.useItem(k);
        }
      }
    }
    this.tapItem = false;
    for (const b of this.boxes) if (b.back > 0) b.back -= dt;

    // ---- karts bump each other
    for (let i = 0; i < this.karts.length; i++)
      for (let j = i + 1; j < this.karts.length; j++) {
        const a = this.karts[i], b = this.karts[j];
        if (a.left || b.left || Math.abs(a.alt - b.alt) > 20) continue;
        const ra = a.ctl === "remote", rb = b.ctl === "remote";
        if (ra && rb) continue; // two other players' karts: their own screens sort that out
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < 15 && d > 0.01) {
          // only karts this screen drives get pushed (a kart from another screen is a wall here)
          const push = ra || rb ? 15 - d : (15 - d) / 2;
          if (!ra) {
            a.x -= (dx / d) * push;
            a.y -= (dy / d) * push;
          }
          if (!rb) {
            b.x += (dx / d) * push;
            b.y += (dy / d) * push;
          }
        }
      }

    this.stepThings(dt);
    this.stepOnline(dt);

    // places
    const order = [...this.karts].filter((k) => !k.left).sort((a, b) => (a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.time - b.time : b.total - a.total));
    order.forEach((k, i) => (k.place = i + 1));
  }

  private rank(k: Kart) {
    return this.karts.filter((o) => !o.left && o.total > k.total).length + 1;
  }

  private say(text: string, secs: number) {
    this.flash = text;
    this.flashT = secs;
    // the sound that goes with the message
    if (text === "JUMP!") this.snd.play("jump");
    else if (text === "INTO THE VOID") this.snd.play("fall");
    else if (text === "RING!") this.snd.play("ring");
    else if (text === "FINAL LAP") this.snd.play("lap");
    else if (text === "OUCH") this.snd.play("hit");
    else if (text.endsWith("MUTED!") || text.endsWith("MUTED YOU!")) this.snd.play("muted");
  }

  // does this screen decide what happens to this kart? (solo: every kart; online: mine, and the bots on the host's screen)
  private mine(k: Kart) {
    return k.ctl !== "remote";
  }

  private hit(k: Kart, secs: number) {
    if (!this.mine(k) || k.left || k.safe > 0 || k.finished) return;
    if (k.player) buzz();
    k.spin = SPIN_TIME;
    k.spinA = 0;
    k.boost = 0;
    k.safe = SPIN_TIME + secs;
    if (k.player) this.say("OUCH", 0.8);
  }

  private useItem(k: Kart) {
    const it = k.item!;
    k.item = null;
    const dx = Math.cos(k.a), dy = Math.sin(k.a);
    const fast = Math.max(0, k.speed) + 230;
    const ev: ItemEvent = { id: `${this.online?.myId ?? "s"}-${++this.itemN}`, k: k.skin, kind: it, x: k.x, y: k.y, vx: 0, vy: 0, h: Math.round(k.alt) };
    if (it === "bomb") Object.assign(ev, { x: k.x + dx * 12, y: k.y + dy * 12, vx: dx * fast, vy: dy * fast });
    if (it === "vinyl") Object.assign(ev, { x: k.x - dx * 20, y: k.y - dy * 20 });
    if (it === "wall") Object.assign(ev, { x: k.x - dx * 24, y: k.y - dy * 24 });
    if (it === "mic") Object.assign(ev, { x: k.x + dx * 14, y: k.y + dy * 14, vx: dx, vy: dy });
    if (it === "bolt") k.boost = 1.7;
    if (k.player) this.snd.play(it === "bolt" ? "boost" : "use");
    this.applyItem(k, ev);
    if (this.online && it !== "bolt") this.online.sendItem(ev);
  }

  // an item goes off (one of mine, or one that came in from another player's screen)
  private applyItem(k: Kart, ev: ItemEvent) {
    const add = (kind: Thing["kind"], life: number) =>
      this.things.push({ kind, x: ev.x, y: ev.y, vx: ev.vx, vy: ev.vy, z: 0, alt: typeof ev.h === "number" && isFinite(ev.h) ? clamp(ev.h, 0, 200) : 0, t: 0, life, owner: k, idx: k.idx, id: ev.id });
    if (ev.kind === "bomb") add("bomb", 0.8);
    if (ev.kind === "vinyl") add("vinyl", 30);
    if (ev.kind === "wall") add("wall", 10);
    if (ev.kind === "mic") add("mic", 7);
    if (ev.kind === "bass") {
      add("wave", 0.5);
      if (this.me && Math.hypot(this.me.x - ev.x, this.me.y - ev.y) < 400) this.snd.play("wave");
      for (const o of this.karts) if (o !== k && Math.abs(o.alt - k.alt) < 30 && Math.hypot(o.x - ev.x, o.y - ev.y) < 150) this.hit(o, 1.1);
    }
    if (ev.kind === "mute") {
      for (const o of this.karts) if (o !== k && !o.finished && this.mine(o)) o.blind = 3.5;
      if (!k.player) this.say(this.online ? `${k.name} MUTED YOU!` : "MUTED!", 1.2);
    }
  }

  // a vinyl or mic is used up: gone here, and on every other screen too
  private used(t: Thing) {
    t.t = t.life;
    this.online?.sendGone(t.id);
  }

  // ------------------------------------------------------------ THE SLAPPING TENTACLES (SMOKE OCEAN)
  // Each one waits beside the road, rears up (its shadow darkens across the road: the warning), SLAMS down across the
  // road, then slides back into the water. Caught under it = you spin out. Jumping over it or being past it = safe.
  // Every tentacle is on its own beat of the same rhythm, so they don't all slap at once.
  private slapPhase(n: number) {
    const clock = this.state === "race" ? this.stateT : performance.now() / 1000;
    return (((clock + n * 0.9) % SLAP_CYCLE) + SLAP_CYCLE) % SLAP_CYCLE;
  }
  private slapLine(i: number, side: number) {
    const C = this.track.center, N = C.length;
    const a = C[(i + N - 1) % N], b = C[(i + 1) % N], c = C[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l;
    const hw = this.track.halfw[i];
    // from out in the water on its side, across the whole road
    return { ex: c[0] + nx * side * (hw + 18), ey: c[1] + ny * side * (hw + 18), fx: c[0] - nx * side * (hw + 6), fy: c[1] - ny * side * (hw + 6) };
  }
  // SMOKE RINGS (HOTBOX HIGHWAY): drive through one and it blows you forwards
  private stepRings() {
    const rings = this.track.smokeRings;
    if (!rings || this.state !== "race") return;
    for (const k of this.karts) {
      if (!this.mine(k) || k.fall > 0 || k.boost > 0.9) continue;
      for (const r of rings)
        if (Math.hypot(k.x - r[0], k.y - r[1]) < 30) {
          k.boost = 1.1;
          if (k.player) {
            this.snd.play("boost");
            this.say("PUFF PUFF", 0.7);
          }
          break;
        }
    }
  }
  private stepSlaps() {
    this.stepRings();
    const slaps = this.track.slaps;
    if (!slaps || this.state !== "race") return;
    slaps.forEach(([i, side], n) => {
      const p = this.slapPhase(n);
      if (p < SLAP_DOWN || p > SLAP_DOWN + 0.4) return; // it only hurts right after it lands
      const { ex, ey, fx, fy } = this.slapLine(i, side);
      const lx = fx - ex, ly = fy - ey, ll = lx * lx + ly * ly;
      for (const k of this.karts) {
        if (k.fall > 0 || k.air > 0 || k.alt > 8 || k.spin > 0) continue;
        const t = Math.max(0, Math.min(1, ((k.x - ex) * lx + (k.y - ey) * ly) / ll));
        if (Math.hypot(k.x - (ex + lx * t), k.y - (ey + ly * t)) < 13) {
          const before = k.spin;
          this.hit(k, 0.8);
          if (k.player && k.spin > before) this.say("SLAPPED!", 1);
        }
      }
    });
  }

  private stepThings(dt: number) {
    this.stepSlaps();
    const C = this.track.center;
    const N = C.length;
    for (const t of this.things) {
      t.t += dt;
      if (t.kind === "bomb") {
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.z = Math.sin((t.t / t.life) * Math.PI) * 26;
        if (t.t >= t.life) {
          t.kind = "boom";
          if (this.me && Math.hypot(this.me.x - t.x, this.me.y - t.y) < 450) this.snd.play("boom");
          t.t = 0;
          t.life = 0.42;
          t.z = 0;
          for (const k of this.karts) if (Math.abs(k.alt - t.alt) < 30 && Math.hypot(k.x - t.x, k.y - t.y) < 46) this.hit(k, 1.3);
        }
      } else if (t.kind === "mic") {
        // chase the kart in front, along the road
        let target: Kart | null = null;
        for (const k of this.karts)
          if (k !== t.owner && !k.finished && k.total > t.owner.total - 6 && (!target || k.total < target.total)) target = k;
        let tx: number, ty: number;
        if (target && Math.hypot(target.x - t.x, target.y - t.y) < 170) {
          tx = target.x;
          ty = target.y;
        } else {
          let best = t.idx, bd = 1e18;
          for (let o = 0; o <= 20; o++) {
            const i = (t.idx + o) % N;
            const d = (C[i][0] - t.x) ** 2 + (C[i][1] - t.y) ** 2;
            if (d < bd) {
              bd = d;
              best = i;
            }
          }
          t.idx = best;
          [tx, ty] = C[(best + 8) % N];
        }
        const a = Math.atan2(ty - t.y, tx - t.x);
        t.vx = Math.cos(a);
        t.vy = Math.sin(a);
        t.x += t.vx * 430 * dt;
        t.y += t.vy * 430 * dt;
        for (const k of this.karts)
          if (k !== t.owner && this.mine(k) && !k.left && Math.abs(k.alt - t.alt) < 30 && Math.hypot(k.x - t.x, k.y - t.y) < 15) {
            this.hit(k, 1.2);
            this.used(t);
            break;
          }
      } else if (t.kind === "vinyl") {
        for (const k of this.karts)
          if ((k !== t.owner || t.t > 1) && this.mine(k) && !k.left && Math.abs(k.alt - t.alt) < 30 && Math.hypot(k.x - t.x, k.y - t.y) < 14) {
            if (k.safe <= 0) {
              this.hit(k, 1.2);
              this.used(t);
            }
            break;
          }
      } else if (t.kind === "wall") {
        for (const k of this.karts) {
          if (!this.mine(k) || Math.abs(k.alt - t.alt) > 30) continue;
          const dx = k.x - t.x, dy = k.y - t.y;
          const d = Math.hypot(dx, dy);
          if ((k !== t.owner || t.t > 1) && d < 22 && d > 0.01) {
            k.x = t.x + (dx / d) * 23;
            k.y = t.y + (dy / d) * 23;
            k.speed = -Math.abs(k.speed) * 0.35;
            k.vx = (dx / d) * 60;
            k.vy = (dy / d) * 60;
            k.boost = 0;
          }
        }
      }
    }
    this.things = this.things.filter((t) => t.t < t.life);
  }

  // ------------------------------------------------------------ the page's menu buttons
  /** SOLO: a race against 5 bots */
  difficulty: Difficulty = "MEDIUM"; // solo races only (online races are always MEDIUM)
  startSolo(track = this.trackNo, difficulty?: Difficulty) {
    if (difficulty) this.difficulty = difficulty;
    if (!this.ready) {
      this.pendingSolo = track; // still loading: the race starts the moment it's done
      return;
    }
    this.snd.unlock();
    this.useTrack(track);
    this.snd.setMusic(MUSIC[TRACKS[this.trackNo].id] ?? MUSIC.menu);
    this.reset();
    this.state = "count";
    this.stateT = 0;
  }

  /** back to the menu / lobby: the camera circles your kart */
  toLobby() {
    if (!this.ready) return;
    this.online = null;
    this.things = [];
    this.menuOpen = false;
    this.paused = false;
    this.snd.setDuck(false);
    this.snd.setMusic(MUSIC.menu);
    this.state = "title";
    this.stateT = 0;
  }

  get isReady() {
    return this.ready;
  }

  /** what the game is doing right now (the page shows its menu on "title") */
  get mode() {
    return this.state;
  }

  get isOnline() {
    return !!this.online;
  }

  // ------------------------------------------------------------ ONLINE
  /** the host pressed START: everybody's grid is built from the same seats */
  onlineGo(seats: Seat[], link: OnlineLink, track = 0) {
    if (!this.ready) return;
    this.useTrack(track);
    this.snd.setMusic(MUSIC[TRACKS[this.trackNo].id] ?? MUSIC.menu);
    const C = this.track.center;
    const N = C.length;
    this.karts = [];
    this.things = [];
    this.boxes = this.track.boxes.map(([x, y]) => ({ x, y, back: 0 }));
    seats.forEach((st, i) => {
      // the grid: two by two, the first seat at the front
      const row = Math.floor(i / 2);
      const idx = (N - 5 - row * 4 + N) % N;
      const [cx, cy] = C[idx];
      const [nx, ny] = C[(idx + 1) % N];
      const a = Math.atan2(ny - cy, nx - cx);
      const side = (i % 2 ? 1 : -1) * 16;
      const mine = st.id === link.myId;
      const ctl: Kart["ctl"] = mine ? "me" : st.bot && link.isHost ? "bot" : "remote";
      this.karts.push({
        name: mine ? "YOU" : st.name,
        player: mine,
        id: st.id,
        ctl,
        isBot: st.bot,
        left: false,
        buf: [],
        skin: st.skin,
        car: st.car && CARS[st.car] ? st.car : "mane",
        rev: -1,
        stall: 0,
        x: cx - Math.sin(a) * side,
        y: cy + Math.cos(a) * side,
        a,
        vx: 0,
        vy: 0,
        speed: 0,
        idx,
        total: idx - N,
        item: null,
        roulette: 0,
        useIn: 0,
        spin: 0,
        spinA: 0,
        boost: 0,
        blind: 0,
        safe: 0,
        off: 0,
        lane: (Math.random() * 2 - 1) * 0.45,
        skill: 0.88 + Math.random() * 0.08,
        finished: false,
        time: 0,
        place: i + 1,
        lost: 0,
        air: 0,
        fall: 0,
        alt: 0,
        tilt: 0,
      });
    });
    this.me = this.karts.find((k) => k.player) ?? this.karts[0];
    this.online = link;
    this.results = null;
    this.menuOpen = false;
    this.resultsSent = false;
    this.firstFin = -1;
    this.sendT = 0;
    this.camA = this.me.a;
    this.clock = 0;
    this.paused = false;
    this.flash = "";
    this.state = "count";
    this.stateT = 0;
  }

  /** where another screen's karts are: [skin, x, y, angle, speed, lap progress, flags, spin left, fall left, air left] */
  remoteState(from: string, rows: unknown) {
    if (!this.online || !Array.isArray(rows)) return;
    const t = performance.now();
    for (const r of rows) {
      if (!Array.isArray(r) || r.length < 8 || !r.every((v) => typeof v === "number" && isFinite(v))) continue;
      const k = this.karts.find((o) => o.skin === r[0]);
      // only the player who drives a kart may move it (bots: only the host, who is the one sending them)
      if (!k || k.ctl !== "remote" || (!k.isBot && k.id !== from)) continue;
      k.buf.push({ t, s: r as number[] });
      if (k.buf.length > 12) k.buf.shift();
    }
  }

  remoteItem(from: string, ev: ItemEvent) {
    if (!this.online || !ev || typeof ev.kind !== "string" || !ITEMS.includes(ev.kind)) return;
    const k = this.karts.find((o) => o.skin === ev.k && o.ctl === "remote");
    if (!k || (!k.isBot && k.id !== from)) return;
    if (![ev.x, ev.y, ev.vx, ev.vy].every((v) => typeof v === "number" && isFinite(v))) return;
    this.applyItem(k, { ...ev, id: String(ev.id).slice(0, 40) });
  }

  remoteGone(id: string) {
    for (const t of this.things) if (t.id === id) t.t = t.life;
  }

  remoteFinish(from: string, time: number) {
    const k = this.karts.find((o) => o.id === from && o.ctl === "remote");
    if (!k || k.finished || typeof time !== "number" || !isFinite(time)) return;
    k.finished = true;
    k.time = time;
    if (this.firstFin < 0) this.firstFin = this.clock;
  }

  /** a player left the race (closed the tab, lost the internet, or got kicked) */
  remoteLeft(id: string) {
    for (const k of this.karts) if (k.id === id && k.ctl === "remote") k.left = true;
  }

  /** the host says the race is over: this is the final order */
  onlineResults(rows: ResultRow[]) {
    if (!this.online) return;
    this.results = rows;
    if (this.state !== "done") {
      this.state = "done";
      this.stateT = 0;
    }
  }

  // smooth another screen's kart: show it a little in the past, between two updates that came in
  private stepRemote(k: Kart) {
    if (k.left) return;
    const buf = k.buf;
    if (!buf.length) return;
    const t = performance.now() - REMOTE_DELAY;
    while (buf.length > 2 && buf[1].t <= t) buf.shift();
    const A = buf[0].s, B = buf.length > 1 ? buf[1].s : null;
    let x = A[1], y = A[2], a = A[3], total = A[5];
    const last = buf[buf.length - 1].s;
    if (B && t >= buf[0].t) {
      const f = clamp((t - buf[0].t) / Math.max(1, buf[1].t - buf[0].t), 0, 1);
      x = A[1] + (B[1] - A[1]) * f;
      y = A[2] + (B[2] - A[2]) * f;
      a = A[3] + wrapAngle(B[3] - A[3]) * f;
      total = f < 0.5 ? A[5] : B[5];
    } else if (!B) {
      // nothing newer yet: keep it rolling for a moment
      const e = clamp((t - buf[0].t) / 1000, 0, 0.25);
      x += Math.cos(a) * A[4] * e;
      y += Math.sin(a) * A[4] * e;
    }
    const N = this.track.center.length;
    k.x = x;
    k.y = y;
    k.a = a;
    k.speed = last[4];
    k.total = total;
    k.idx = ((Math.round(total) % N) + N) % N;
    const flags = last[6];
    k.boost = flags & 1 ? 0.1 : 0;
    k.rev = flags & 8 ? 0 : -1;
    if (flags & 2 && !k.finished) k.finished = true;
    // flying: the same rise and dip as on that player's own screen
    const altT = this.typeAt(k.x, k.y) === 5 ? this.track.alt?.[k.idx] || 70 : 0;
    k.alt += (altT - k.alt) * Math.min(1, (altT > k.alt ? 2.2 : 3.2) / 60);
    if (altT === 0 && k.alt < 0.5) k.alt = 0;
    // falling and jumping play here too
    if ((last[8] ?? 0) > 0 && k.fall <= 0) k.fall = Math.min(FALL_TIME + BURST_TIME, last[8]);
    if (k.fall > 0) k.fall = Math.max(0, k.fall - 1 / 60);
    if ((last[9] ?? 0) > 0 && k.air <= 0) k.air = Math.min(AIR_TIME, last[9]);
    if (k.air > 0) k.air = Math.max(0, k.air - 1 / 60);
    // the spin-out plays here too (it starts when an update says the kart is spinning)
    const spin = last[7];
    if (spin > 0 && k.spin <= 0) k.spin = Math.min(SPIN_TIME, spin);
    if (k.spin > 0) {
      k.spin = Math.max(0, k.spin - 1 / 60);
      const p = 1 - k.spin / SPIN_TIME;
      k.spinA = k.spin > 0 ? Math.PI * 4 * (1 - (1 - p) * (1 - p)) : 0;
    }
  }

  // send my kart (and the host's bots) 5 times a second; the host ends the race when everybody's in
  private stepOnline(dt: number) {
    const on = this.online;
    if (!on) return;
    this.sendT += dt;
    if (this.sendT >= SEND_EVERY) {
      this.sendT = 0;
      const rows: number[][] = [];
      for (const k of this.karts) {
        if (k.ctl === "remote" || k.left) continue;
        const flags = (k.boost > 0 ? 1 : 0) | (k.finished ? 2 : 0) | (this.state === "count" && k.rev >= 0 ? 8 : 0);
        rows.push([
          k.skin,
          Math.round(k.x * 10) / 10,
          Math.round(k.y * 10) / 10,
          Math.round(k.a * 1000) / 1000,
          Math.round(k.speed),
          Math.round(k.total),
          flags,
          Math.round(Math.max(0, k.spin) * 100) / 100,
          Math.round(Math.max(0, k.fall) * 100) / 100,
          Math.round(Math.max(0, k.air) * 100) / 100,
        ]);
      }
      on.sendState(rows);
    }
    if (on.isHost && !this.resultsSent && this.state !== "count") {
      const humans = this.karts.filter((k) => !k.isBot && !k.left);
      const done = humans.filter((k) => k.finished).length;
      if (done > 0 && (done === humans.length || this.clock - this.firstFin > LAST_CALL)) {
        this.resultsSent = true;
        const order = [...this.karts]
          .filter((k) => !k.left)
          .sort((a, b) => (a.finished !== b.finished ? (a.finished ? -1 : 1) : a.finished ? a.time - b.time : b.total - a.total));
        on.hostResults(
          order.map((k) => ({ id: k.id, name: k.player ? this.myName : k.name, time: k.finished ? Math.round(k.time * 100) / 100 : null, bot: k.isBot })),
        );
      }
    }
  }

  // ------------------------------------------------------------ drawing
  private draw() {
    const cv = this.canvas;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const ctx = this.ctx;
    ctx.fillStyle = "#07060c";
    ctx.fillRect(0, 0, w, h);
    const u = Math.min(w / UW, h / UH);
    const ox = Math.round((w - UW * u) / 2), oy = Math.round((h - UH * u) / 2);
    this.lay = { ox, oy, u };
    const text = (s: string, x: number, y: number, size: number, col = "#fff", align: CanvasTextAlign = "left") => {
      ctx.font = `${Math.round(size * u)}px ${this.font}, monospace`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#12041c";
      ctx.fillText(s, ox + (x + size * 0.14) * u, oy + (y + size * 0.14) * u);
      ctx.fillStyle = col;
      ctx.fillText(s, ox + x * u, oy + y * u);
      // BOLD: the same letters once more, a hair to the right. Set BOLD to 0 for the thin letters, bigger = fatter.
      if (BOLD) ctx.fillText(s, ox + x * u + Math.max(1, size * u * BOLD), oy + y * u);
    };
    if (!this.ready) {
      text(this.loadError ? "COULD NOT LOAD THE GAME" : "LOADING...", UW / 2, UH / 2 - 6, 12, "#ff46c8", "center");
      if (this.loadError) text(this.loadError.slice(0, 50), UW / 2, UH / 2 + 14, 6, "#fff", "center");
      return;
    }
    this.drawWorld();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.buf, ox, oy, UW * u, UH * u);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, UW * u, UH * u);
    ctx.clip();
    const me = this.me;
    const pic = (im: Img, x: number, y: number, s: number, sx = 0, sw = im.width / resOf(im)) => {
      const r = resOf(im);
      ctx.drawImage(im, sx * r, 0, sw * r, im.height, ox + x * u, oy + y * u, sw * s * u, (im.height / r) * s * u);
    };

    // blinded by MUTE
    if (me.blind > 0 && this.state === "race") {
      ctx.fillStyle = `rgba(18,4,28,${Math.min(0.5, me.blind)})`;
      ctx.fillRect(ox, oy, UW * u, UH * u);
      const eye = this.img["item-mute"];
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 4; i++) {
        const s = 1.8 + (i % 3) * 0.7;
        pic(eye, 40 + ((i * 83 + this.clock * 30) % 420) - 24 * s, 34 + ((i * 59) % 150) + Math.sin(this.clock * 3 + i) * 10, s);
      }
      ctx.globalAlpha = 1;
    }
    // speed lines
    if (me.boost > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + this.clock * 9;
        const r1 = 150 + ((i * 37 + this.clock * 400) % 60), r2 = r1 + 40;
        const cx = UW / 2, cy = UH * 0.62;
        ctx.beginPath();
        ctx.moveTo(ox + (cx + Math.cos(a) * r1) * u, oy + (cy + Math.sin(a) * r1 * 0.6) * u);
        ctx.lineTo(ox + (cx + Math.cos(a) * r2) * u, oy + (cy + Math.sin(a) * r2 * 0.6) * u);
        ctx.lineTo(ox + (cx + Math.cos(a + 0.02) * r2) * u, oy + (cy + Math.sin(a + 0.02) * r2 * 0.6) * u);
        ctx.fill();
      }
    }

    if (this.state === "race" || this.state === "count" || this.state === "done") {
      const N = this.track.center.length;
      const lap = clamp(Math.floor(me.total / N) + 1, 1, LAPS);
      text(`LAP ${lap}/${LAPS}`, 8, 8, 9, "#fff");
      text(fmtTime(this.clock), UW - 8, 8, 9, "#fff", "right");
      text(PLACE[me.place - 1], 8, UH - 34, 22, me.place === 1 ? "#ffe23c" : "#ff46c8");
      text(`/${this.karts.filter((k) => !k.left).length}`, 8 + 22 * 3.1, UH - 20, 8, "#fff");
      // online: the other players' names over their karts
      for (const tg of this.tags) text(tg.name, tg.x, tg.y, 5, `rgb(${tg.col[0]},${tg.col[1]},${tg.col[2]})`, "center");
      // item slot
      const bx = UW / 2 - 17, by = 6;
      ctx.fillStyle = "rgba(18,4,28,0.75)";
      ctx.fillRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      ctx.strokeStyle = "#ff46c8";
      ctx.lineWidth = Math.max(1, u);
      ctx.strokeRect(ox + bx * u, oy + by * u, 34 * u, 34 * u);
      const show: ItemName | null = me.roulette > 0 ? ITEMS[Math.floor(this.clock * 14) % ITEMS.length] : me.item;
      if (show) {
        pic(this.img[`item-${show}`], bx + 1, by + 1, 32 / 48);
        if (me.item) text(ITEM_LABEL[me.item], UW / 2, by + 38, 6, "#ffe23c", "center");
      }
      // minimap
      // (on a phone it sits top right, under the clock: the bottom corners are where your thumbs are)
      const mx = UW - 78, my = this.touch ? 22 : UH - 78, ms = 70 / 96;
      ctx.globalAlpha = 0.85;
      pic(this.mini, mx, my, ms);
      ctx.globalAlpha = 1;
      const S = this.track.size;
      for (const k of [...this.karts].sort((a) => (a.player ? 1 : -1))) {
        if (k.left) continue;
        const c = skinColor(k.skin);
        const r = k.player ? 3 : 2;
        ctx.fillStyle = "#12041c";
        ctx.fillRect(ox + (mx + (k.x / S) * 70 - r - 0.6) * u, oy + (my + (k.y / S) * 70 - r - 0.6) * u, (r * 2 + 1.2) * u, (r * 2 + 1.2) * u);
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(ox + (mx + (k.x / S) * 70 - r) * u, oy + (my + (k.y / S) * 70 - r) * u, r * 2 * u, r * 2 * u);
      }
      // phone: the PAUSE button, top left under LAP (pause = the menu with RESUME / RESTART / back to the games)
      if (this.touch && this.state !== "done" && !this.menuOpen) {
        const [px, py, pw, ph] = PAUSE_BTN;
        ctx.fillStyle = "rgba(18,4,28,0.6)";
        ctx.fillRect(ox + px * u, oy + py * u, pw * u, ph * u);
        ctx.strokeStyle = "#ece6ff";
        ctx.lineWidth = Math.max(1, u);
        ctx.strokeRect(ox + px * u, oy + py * u, pw * u, ph * u);
        ctx.fillStyle = "#fff";
        ctx.fillRect(ox + (px + 14) * u, oy + (py + 6) * u, 4 * u, 12 * u);
        ctx.fillRect(ox + (px + 22) * u, oy + (py + 6) * u, 4 * u, 12 * u);
      }
      // phone buttons
      if (this.touch && this.state !== "done") {
        // big see-through thumb buttons: you see the road through them, they light up pink while held
        const btn = (label: string, x: number, y: number, bw: number, bh: number, on: boolean) => {
          ctx.fillStyle = on ? "rgba(255,70,200,0.5)" : "rgba(18,4,28,0.22)";
          ctx.fillRect(ox + x * u, oy + y * u, bw * u, bh * u);
          ctx.strokeStyle = on ? "#ffffff" : "rgba(236,230,255,0.7)";
          ctx.lineWidth = Math.max(1, 2 * u);
          ctx.strokeRect(ox + x * u, oy + y * u, bw * u, bh * u);
          ctx.lineWidth = Math.max(1, u);
          text(label, x + bw / 2, y + bh / 2 - 6, 12, on ? "#fff" : "rgba(255,255,255,0.85)", "center");
        };
        const t = this.touchSteer();
        btn("<", 6, UH - 112, 88, 70, t.s < 0);
        btn(">", 100, UH - 112, 88, 70, t.s > 0);
        // BRAKE and ITEM sit right at the right edge, under your right thumb
        btn("BRAKE", UW - 146, UH - 78, 76, 52, t.brake);
        btn("ITEM", UW - 64, UH - 146, 58, 58, false);
      }
    }
    if (this.state === "count") {
      const n = 3 - Math.floor(this.stateT);
      if (n >= 1) text(String(n), UW / 2, 62, 48, "#ffe23c", "center");
      // the rev bar: fills up while you hold the gas (red = pressed too early)
      const bw = 90, bx2 = UW / 2 - bw / 2, by2 = 122;
      ctx.fillStyle = "rgba(18,4,28,0.75)";
      ctx.fillRect(ox + (bx2 - 2) * u, oy + (by2 - 2) * u, (bw + 4) * u, 12 * u);
      if (me.rev >= 0) {
        const fill = clamp((this.stateT - me.rev) / Math.max(0.2, GO_TIME - me.rev), 0, 1);
        ctx.fillStyle = me.rev < REV_FROM ? "#ff3b3b" : "#ffe23c";
        ctx.fillRect(ox + bx2 * u, oy + by2 * u, bw * fill * u, 8 * u);
      }
      text(this.touch ? "HOLD THE SCREEN ON 2" : "HOLD W / UP ON 2", UW / 2, by2 + 14, 6, "#fff", "center");
    }
    if (this.flashT > 0 && this.state === "race") text(this.flash, UW / 2, 74, 22, "#ffe23c", "center");
    if (this.state === "race" && me.lost > 1) {
      if (this.touch) {
        // phones have no R key: a button instead
        const [bx, by, bw, bh] = RESET_BTN;
        ctx.fillStyle = "rgba(255,70,200,0.8)";
        ctx.fillRect(ox + bx * u, oy + by * u, bw * u, bh * u);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = Math.max(1, u);
        ctx.strokeRect(ox + bx * u, oy + by * u, bw * u, bh * u);
        text("TAP: BACK ON THE ROAD", bx + bw / 2, by + bh / 2 - 4, 7, "#fff", "center");
      } else text("WRONG WAY? PRESS R", UW / 2, 120, 8, "#fff", "center");
    }

    if (this.state === "title" && !this.overlay) {
      ctx.fillStyle = "rgba(10,3,18,0.62)";
      ctx.fillRect(ox, oy, UW * u, UH * u);
      text("PINK KART", UW / 2, 44, 34, "#ff46c8", "center");
      text(TRACKS[this.trackNo].name, UW / 2, 88, 10, "#ffe23c", "center");
      ITEMS.forEach((it, i) => pic(this.img[`item-${it}`], UW / 2 - 7 * 19 + i * 38 + 3, 112, 32 / 48));
      if (this.touch) {
        text("LEFT THUMB: STEER   RIGHT: ITEM / BRAKE", UW / 2, 160, 7, "#fff", "center");
        text("THE KART DRIVES BY ITSELF", UW / 2, 174, 7, "#fff", "center");
        text("HOLD THE SCREEN WHEN 2 SHOWS = ROCKET START", UW / 2, 188, 7, "#ffe23c", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("TAP TO RACE", UW / 2, 214, 14, "#fff", "center");
      } else {
        text("ARROWS OR WASD: DRIVE     SPACE: USE ITEM", UW / 2, 160, 7, "#fff", "center");
        text("R: BACK ON THE ROAD     ESC: PAUSE", UW / 2, 174, 7, "#fff", "center");
        text("HOLD W / UP WHEN 2 SHOWS = ROCKET START", UW / 2, 188, 7, "#ffe23c", "center");
        if (Math.floor(this.stateT * 2) % 2 === 0) text("PRESS ENTER", UW / 2, 214, 14, "#fff", "center");
      }
    }
    if (this.state === "done") {
      ctx.fillStyle = `rgba(10,3,18,${Math.min(0.72, this.stateT)})`;
      ctx.fillRect(ox, oy, UW * u, UH * u);
      if (this.online && !this.results) {
        // online, crossed the line: the others are still racing
        text(`YOU FINISHED ${PLACE[me.place - 1]}`, UW / 2, 30, 20, "#ffe23c", "center");
        text(fmtTime(me.time), UW / 2, 58, 10, "#fff", "center");
        const still = this.karts.filter((k) => !k.left && !k.finished && !k.isBot).length;
        text(still ? `WAITING FOR ${still} MORE...` : "WAITING FOR THE RESULTS...", UW / 2, 90, 9, "#ff46c8", "center");
      } else {
        const myId = this.online?.myId ?? "";
        const rows: { name: string; time: number | null; me: boolean }[] = this.results
          ? this.results.map((r) => ({ name: myId && r.id === myId ? "YOU" : r.name, time: r.time, me: !!myId && r.id === myId }))
          : [...this.karts]
              .filter((k) => !k.left)
              .sort((a, b) => a.place - b.place)
              .map((k) => ({ name: k.name, time: k.finished ? k.time : null, me: k.player }));
        const mine = rows.findIndex((r) => r.me);
        text(mine === 0 ? "YOU WIN!" : mine > 0 ? `YOU FINISHED ${PLACE[mine]}` : "RESULTS", UW / 2, 22, 20, "#ffe23c", "center");
        const gap = rows.length > 6 ? 19 : 22;
        rows.forEach((r, i) => {
          const col = r.me ? "#ff46c8" : "#fff";
          text(PLACE[i] ?? `${i + 1}TH`, 116, 60 + i * gap, 10, col);
          text(r.name, 176, 60 + i * gap, 10, col);
          text(r.time !== null ? fmtTime(r.time) : "DNF", 372, 60 + i * gap, 10, col, "right");
        });
        if (!this.online && this.stateT > 1.5 && Math.floor(this.stateT * 2) % 2 === 0)
          text(this.touch ? "TAP TO RACE AGAIN" : "ENTER: RACE AGAIN   ESC: MENU", UW / 2, 236, 9, "#fff", "center");
      }
    }
    if (this.menuOpen) {
      // the pause menu: the same pale green boxes as every other game, pink = the picked row
      ctx.fillStyle = "rgba(22,12,29,0.7)";
      ctx.fillRect(ox, oy, UW * u, UH * u);
      const box = (label: string, y: number, picked: boolean, pad = 10) => {
        ctx.font = `${Math.round(8 * u)}px ${this.font}, monospace`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const bw = ctx.measureText(label).width + pad * u;
        ctx.fillStyle = picked ? "#d63cc8" : "#d7efbc";
        ctx.fillRect(Math.round(ox + (UW / 2) * u - bw / 2), oy + (y - 2) * u, Math.round(bw), 12 * u);
        ctx.fillStyle = picked ? "#ffffff" : "#111111";
        ctx.fillText(label, ox + (UW / 2) * u, oy + y * u);
      };
      box(this.online ? "MENU" : "PAUSED", MENU_TOP + 26, false, 8);
      const rows = this.menuRows();
      rows.forEach((label, i) => box((i === this.menuRow ? "> " : "") + label, MENU_TOP + 42 + i * 14, i === this.menuRow));
      const N = this.track.center.length;
      const stats = this.online ? "THE RACE KEEPS GOING" : `LAP ${clamp(Math.floor(me.total / N) + 1, 1, LAPS)}/${LAPS}  ${fmtTime(this.clock)}`;
      text(stats, UW / 2, MENU_TOP + 42 + rows.length * 14 + 4, 8, "#fff", "center");
      if (Math.floor(performance.now() / 500) % 2 === 0) box(this.touch ? "TAP TO CHOOSE" : "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", MENU_TOP + 132, false, 8);
    }
    ctx.restore();
  }

  // ------------------------------------------------------------ HILLS
  // The height map: every square gets the height of the nearest bit of road, fading back down to flat land further away
  // (so the road runs along a ridge with slopes on both sides). Then it's smoothed so there are no steps.
  private makeHillGrid(t: TrackData): Float32Array {
    const hill = t.hill!, C = t.center, HW = t.halfw, N = C.length, cell = t.size / HG;
    const g = new Float32Array(HG * HG);
    for (let gy = 0; gy < HG; gy++)
      for (let gx = 0; gx < HG; gx++) {
        const x = (gx + 0.5) * cell, y = (gy + 0.5) * cell;
        let best = 1e12, bi = 0;
        for (let i = 0; i < N; i += 2) {
          const d = (C[i][0] - x) ** 2 + (C[i][1] - y) ** 2;
          if (d < best) {
            best = d;
            bi = i;
          }
        }
        const e = Math.sqrt(best) - HW[bi]; // how far past the road's edge
        const f = e < 40 ? 1 : e > 420 ? 0 : 1 - (e - 40) / 380;
        g[gy * HG + gx] = (hill[bi] ?? 0) * f * f * (3 - 2 * f);
      }
    for (let pass = 0; pass < 4; pass++) {
      const s = g.slice();
      for (let gy = 1; gy < HG - 1; gy++)
        for (let gx = 1; gx < HG - 1; gx++) {
          let sum = 0;
          for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += s[(gy + j) * HG + gx + i];
          g[gy * HG + gx] = sum / 9;
        }
    }
    return g;
  }
  // the sun comes from the far left: slopes facing it are bright, slopes facing away are in shade (flat ground stays as it is)
  private makeShade(g: Float32Array, n: number, cell: number): Float32Array {
    const out = new Float32Array(n * n);
    const lx = -0.5, ly = -0.45, lz = 0.74;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const dzx = (g[y * n + Math.min(n - 1, x + 1)] - g[y * n + Math.max(0, x - 1)]) / (2 * cell);
        const dzy = (g[Math.min(n - 1, y + 1) * n + x] - g[Math.max(0, y - 1) * n + x]) / (2 * cell);
        const len = Math.sqrt(dzx * dzx + dzy * dzy + 1);
        const lit = Math.max(0, (-dzx * lx - dzy * ly + lz) / len);
        out[y * n + x] = 0.42 + 0.78 * lit;
      }
    return out;
  }
  /** how high the ground is at a world position (0 on flat maps) */
  private groundH(x: number, y: number) {
    const g = this.hillGrid;
    if (!g) return 0;
    const n = this.hgN, cell = this.track.size / n;
    let fx = x / cell - 0.5, fy = y / cell - 0.5;
    if (this.track.terrain) {
      // a mountain map carries on past its edge (the edge squares repeat), so the far peaks don't drop away
      fx = clamp(fx, 0, n - 1.001);
      fy = clamp(fy, 0, n - 1.001);
    }
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= n - 1 || iy >= n - 1) return 0;
    const ax = fx - ix, ay = fy - iy, o = iy * n + ix;
    return (g[o] * (1 - ax) + g[o + 1] * ax) * (1 - ay) + (g[o + n] * (1 - ax) + g[o + n + 1] * ax) * ay;
  }

  // ------------------------------------------------------------ THE TERRAIN RENDERER (A REAL MOUNTAIN: TATRA TRIP)
  // For every column of the screen, walk away from the camera along that column's line of sight. At each step look up
  // how high the land is there, work out where that lands on screen, and if it's higher up the screen than anything
  // nearer, paint the column up to it in that spot's colour. So slopes rise, peaks stand up into the sky and a ridge
  // hides whatever is behind it, just like a real mountain. Far away it all fades into the haze.
  private drawTerrain(camX: number, camY: number, camZ: number, dx: number, dy: number, rx: number, ry: number, hz: number) {
    const g = this.hillGrid;
    if (!g || !this.tframe) return;
    const out = this.tframe32;
    out.fill(0);
    const n = this.hgN, cell = this.track.size / n, inv = 1 / cell, top = n - 1.001;
    const G = this.ground, S = this.gsize, gs = this.gs;
    const fog = this.pal.fog;
    const [fogAt, fogLen] = this.track.fog ?? [900, 4200];
    const occ = this.occ, shade = this.shade;
    // THE GRASS along the road's edges: where the line of sight crosses from road to grass (or back), a tuft of blades
    // stands up there, taller than the road, swaying in the wind
    const types = this.types, TH = this.track.size / 2, pal = this.pal, sway = performance.now() / 1000;
    const roadish = (t: number) => t === 1 || t === 2 || t === 4;
    const gc = this.track.grass, abgrOf = (c: number[]) => 0xff000000 | (c[2] << 16) | (c[1] << 8) | c[0];
    const gDark = gc ? abgrOf(gc[0]) : pal.gDark, gMid = gc ? abgrOf(gc[1]) : pal.gMid, gTip = gc ? abgrOf(gc[2]) : pal.gTip;
    for (let x = 0; x < BW; x++) {
      const k = (x - BW / 2) / FOCAL;
      const vx = dx + rx * k, vy = dy + ry * k;
      let ybuf = BH, lv = 0, z = 4, zp = 4, syp = 1e6, hp = -1e6, tPrev = -1, lastTuft = 0;
      while (z < TERRAIN_FAR && ybuf > 0) {
        const wx = camX + vx * z, wy = camY + vy * z;
        // the height here (blended between the 4 nearest squares)
        let fx = wx * inv - 0.5, fy = wy * inv - 0.5;
        fx = fx < 0 ? 0 : fx > top ? top : fx;
        fy = fy < 0 ? 0 : fy > top ? top : fy;
        const ix = fx | 0, iy = fy | 0, ax = fx - ix, ay = fy - iy, o = iy * n + ix;
        const h = (g[o] * (1 - ax) + g[o + 1] * ax) * (1 - ay) + (g[o + n] * (1 - ax) + g[o + n + 1] * ax) * ay;
        const sy = hz + ((camZ - h) * FOCAL) / z;
        const yi = sy < 0 ? 0 : sy | 0;
        if (yi < ybuf) {
          const sh = shade ? (shade[o] * (1 - ax) + shade[o + 1] * ax) * (1 - ay) + (shade[o + n] * (1 - ax) + shade[o + n + 1] * ax) * ay : 1;
          // every screen row between this step and the one before gets its own spot of ground (so flat ground near you
          // keeps its detail); a face that rises steeply is a little darker (so cliffs read as cliffs)
          const span = syp - sy, steep = h - hp > (z - zp) * 0.9;
          for (let y = yi; y < ybuf; y++) {
            let tt = span > 0.01 ? (y + 0.5 - sy) / span : 0;
            tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            const zr = z + (zp - z) * tt;
            let gx = ((camX + vx * zr) * gs) | 0, gy = ((camY + vy * zr) * gs) | 0;
            gx = gx < 0 ? 0 : gx >= S ? S - 1 : gx;
            gy = gy < 0 ? 0 : gy >= S ? S - 1 : gy;
            let c = G[gy * S + gx];
            const m = ((steep && y > yi ? 205 : 256) * sh) | 0;
            let f256 = 0;
            if (zr > fogAt) f256 = (Math.min(0.82, (zr - fogAt) / fogLen) * 256) | 0;
            if (m !== 256 || f256) {
              const i256 = 256 - f256;
              const cr = Math.min(255, ((c & 255) * m) >> 8) * i256 + fog[0] * f256, cg = Math.min(255, (((c >> 8) & 255) * m) >> 8) * i256 + fog[1] * f256, cb = Math.min(255, (((c >> 16) & 255) * m) >> 8) * i256 + fog[2] * f256;
              c = 0xff000000 | ((cb >> 8) << 16) | ((cg >> 8) << 8) | (cr >> 8);
            }
            out[y * BW + x] = c;
          }
          ybuf = yi;
        }
        // the grass edge
        if (z < 700) {
          const tx = (wx | 0) >> 1, ty = (wy | 0) >> 1;
          const t = tx >= 0 && ty >= 0 && tx < TH && ty < TH ? types[ty * TH + tx] : 0;
          // (one tuft per column within a short distance: looking straight along an edge would stack them into a pole)
          if (tPrev >= 0 && t !== tPrev && roadish(t) !== roadish(tPrev) && t !== 3 && tPrev !== 3 && z > lastTuft * 1.25 + 6) {
            lastTuft = z;
            const seedG = ((tx >> 1) * 7 + (ty >> 1) * 13) & 255;
            const wave = 0.72 + 0.28 * Math.sin(sway * 3.6 + seedG * 0.7 + x * 0.06);
            const tall = Math.max(1, Math.min(14, Math.round(((GRASS_TALL * 1.6 * FOCAL) / z) * (0.5 + (seedG & 7) / 10) * wave)));
            const base = Math.min(ybuf, yi + 1);
            for (let k = 1; k <= tall; k++) {
              const yy = base - k;
              if (yy < 0) break;
              out[yy * BW + x] = k >= tall ? gTip : k >= tall - 2 && tall > 3 ? gMid : gDark;
            }
            ybuf = Math.max(0, Math.min(ybuf, base - tall));
          }
          tPrev = t;
        }
        zp = z;
        syp = sy;
        hp = h;
        while (lv < OCC_LEVELS && OCC_Z[lv] <= z) occ[x * OCC_LEVELS + lv++] = ybuf;
        z += z < 120 ? 1.5 : z * 0.0125;
      }
      while (lv < OCC_LEVELS) occ[x * OCC_LEVELS + lv++] = ybuf;
    }
    if (!this.tcanvas) {
      this.tcanvas = document.createElement("canvas");
      this.tcanvas.width = BW;
      this.tcanvas.height = BH;
    }
    this.tcanvas.getContext("2d")!.putImageData(this.tframe, 0, 0);
    this.bctx.drawImage(this.tcanvas, 0, 0);
  }

  private drawWorld() {
    const me = this.me;
    const camH = CAM_H + me.alt * 0.92; // when you fly, the camera goes up with you and the ground drops away
    const b = this.bctx;
    // the camera swings smoothly behind the kart (on the title screen it circles)
    const wantA = this.state === "title" ? me.a + Math.sin(this.stateT * 0.5) * 0.5 : me.a;
    this.camA += wrapAngle(wantA - this.camA) * 0.14;
    const ca = this.camA;
    const dx = Math.cos(ca), dy = Math.sin(ca);
    const rx = -dy, ry = dx;
    // when you fall into the void the camera slowly pulls back a little and tilts down, so you watch your kart drop
    // and burst below the road (gently: the road always stays on screen)
    this.fallCam += ((me.fall > 0 ? 1 : 0) - this.fallCam) * (me.fall > 0 ? 0.035 : 0.08);
    const back = CAM_BACK + 120 * this.fallCam;
    const camX = me.x - dx * back, camY = me.y - dy * back;
    // HILLS: the camera rides at the height of the ground under your kart, and tilts with the slope ahead:
    // up a climb the horizon moves down (you look up the hill), over a crest it moves up (you look down the other side)
    const hills = !!this.hillGrid;
    const gh = (x: number, y: number) => (hills ? this.groundH(x, y) : 0);
    if (hills) {
      const g0 = gh(me.x, me.y);
      this.camG += (g0 - this.camG) * 0.35;
      this.camG = Math.max(this.camG, gh(camX, camY), g0 - 6); // never inside the hill
      // the slope of the road ahead, judged over a long stretch (so it doesn't twitch at every little bump)
      let sl = 0;
      for (const ahead of [90, 180, 300, 440]) sl += (gh(me.x + dx * ahead, me.y + dy * ahead) - g0) / ahead;
      sl /= 4;
      this.slope += (sl - this.slope) * 0.08;
      this.pitch += (clamp(this.slope * FOCAL * 1.05, -PITCH_UP, 50) - this.pitch) * 0.08;
    }
    // going downhill the camera rises a little, so you can see down the slope
    const camZ = this.camG + camH + (hills ? Math.max(0, -this.slope) * 45 : 0); // how high the camera is
    // where the horizon is on screen this frame (falling: it rises a bit = the camera looks down after your kart)
    const hz = Math.max(HORIZON - PITCH_UP, HORIZON + Math.round(this.pitch) - Math.round(this.fallCam * 40));

    // ---- which zone you're in (0 = the field, 1 = the void): the sky and the haze fade from one to the other
    const zoneNow = this.track.tunnel ? this.track.tunnel[me.idx] ?? 0 : this.track.zone ? this.track.zone[me.idx] ?? 0 : 0;
    this.zoneF += (zoneNow - this.zoneF) * 0.04;
    if (Math.abs(zoneNow - this.zoneF) < 0.01) this.zoneF = zoneNow;
    const zf = this.zoneF;

    // ---- sky: one full turn per picture, so it wraps around exactly once (one sun; in the void: one spiral)
    const pal = this.pal;
    const sky = pal.sky;
    let off = (((ca / (Math.PI * 2)) * sky.width) % sky.width + sky.width) % sky.width;
    off = Math.round(off);
    const skyY = hz + 4 - sky.height;
    b.fillStyle = zf > 0.5 ? "#060210" : "#100628";
    b.fillRect(0, 0, BW, hz);
    b.drawImage(sky, -off, skyY);
    b.drawImage(sky, sky.width - off, skyY);
    if (skyY > 0) {
      // HILLS: looking up a climb shows more sky than the picture has: fill it with the sky's own top colour
      b.fillStyle = pal.skyTop ?? "#100628";
      b.fillRect(0, 0, BW, skyY);
    }
    if (zf > 0) {
      const vs = pal.skyVoid;
      b.globalAlpha = zf;
      b.fillRect(0, 0, BW, hz);
      if (pal.trip) {
        // THE TRIP: the picture wobbles like liquid (every pair of rows slides sideways on its own wave)...
        const t = performance.now() / 1000;
        for (let y = 0; y < vs.height; y += 2) {
          const sx = ((((-off + Math.sin(y * 0.11 + t * 2.4) * 7 + Math.sin(y * 0.045 - t * 1.6) * 5) % vs.width) - vs.width) % vs.width);
          for (let k = 0; sx + k * vs.width < BW; k++) b.drawImage(vs, 0, y, vs.width, 2, sx + k * vs.width, skyY + y, vs.width, 2);
        }
        if (skyY > 0) {
          b.fillStyle = "#14061e";
          b.fillRect(0, 0, BW, skyY);
        }
        // ...and flashes pink on the beat of the song
        const bt = this.track.beat, mt = this.snd.musicTime();
        const ph = bt ? (((((mt >= 0 ? mt : t) - bt.at) * bt.bpm) / 60) % 1 + 1) % 1 : 1;
        if (ph < 0.18) {
          b.globalAlpha = zf * 0.28 * (1 - ph / 0.18);
          b.fillStyle = "#ff5fd2";
          b.fillRect(0, 0, BW, hz);
        }
        b.globalAlpha = zf;
      } else {
        b.drawImage(vs, -off, skyY);
        b.drawImage(vs, vs.width - off, skyY);
      }
      b.globalAlpha = 1;
    }

    // ---- ground
    const terrain = !!this.track.terrain || !!this.track.hill; // (the old hill maps are drawn by the terrain renderer too)
    if (terrain) this.drawTerrain(camX, camY, camZ, dx, dy, rx, ry, hz);
    const S = this.gsize;
    const gs = this.gs;
    const out = this.frame32;
    const G = this.ground;
    const rows = BH - hz;
    // which distance every screen row shows. Flat: the closer to the bottom, the nearer. With HILLS: walk away from the
    // camera along the view and see which row each bit of ground lands on; a crest hides the ground behind it.
    const rowZ = this.rowZ, rowH = this.rowH;
    if (!hills) for (let r = 0; r < rows; r++) rowZ[r] = (camH * FOCAL) / (r + 0.5);
    else {
      let next = rows - 1;
      let lastH = 0, pd = 5, prr = 1e9, ph = 0;
      for (let d = 5; d < 6000 && next >= 0; d += 1.5 + d * 0.012) {
        const h = gh(camX + dx * d, camY + dy * d);
        lastH = h;
        const rr = ((camZ - h) * FOCAL) / d - 0.5;
        while (next >= 0 && rr <= next) {
          // (blend between this sample and the one before, so the rows in between don't repeat)
          const t = prr > rr && prr < 1e8 ? clamp((next - rr) / (prr - rr), 0, 1) : 0;
          rowZ[next] = d + (pd - d) * t;
          rowH[next] = h + (ph - h) * t;
          next--;
        }
        pd = d;
        prr = rr;
        ph = h;
      }
      for (; next >= 0; next--) {
        rowZ[next] = camZ - lastH > 1 ? ((camZ - lastH) * FOCAL) / (next + 0.5) : 6000;
        rowH[next] = lastH;
      }
    }
    const types = this.types, TH = this.track.size / 2;
    const mask = this.mask, seed = this.seedMap;
    const outside = this.track.outside ?? 0; // what's past the edge of the map: more field (0) or the void (3)
    // far away the ground fades into the haze: pink over the field, deep purple in the void
    const FOG_R = Math.round(pal.fog[0] + (pal.vfog[0] - pal.fog[0]) * zf), FOG_G = Math.round(pal.fog[1] + (pal.vfog[1] - pal.fog[1]) * zf), FOG_B = Math.round(pal.fog[2] + (pal.vfog[2] - pal.fog[2]) * zf);
    const water = !!this.track.water, seaT = performance.now() / 1000, seaSplit = this.track.seaSplit ?? 0;
    // SMOKE OCEAN: how high the smoke stands at each pixel (filled in below, used for the smoke waves)
    if (water && this.seaHt.length !== out.length) this.seaHt = new Uint8Array(out.length);
    const seaHt = this.seaHt;
    if (water) seaHt.fill(0);
    let seaLast = -2, seaC = 0;
    if (water && this.seaCol.length !== out.length) this.seaCol = new Uint32Array(out.length);
    const seaCol = this.seaCol;
    const [fogAt, fogLen] = this.track.fog ?? [500, 2600]; // (HOTBOX HIGHWAY: thick smoke, so the haze starts close)
    for (let r = 0; r < (terrain ? 0 : rows); r++) {
      const z = rowZ[r];
      const stepX = (rx * z) / FOCAL, stepY = (ry * z) / FOCAL;
      let wx = camX + dx * z - stepX * (BW / 2), wy = camY + dy * z - stepY * (BW / 2);
      const fog = z > fogAt ? Math.min(0.85, (z - fogAt) / fogLen) : 0;
      const f256 = (fog * 256) | 0, inv = 256 - f256;
      // THE VOID has no ground: it's the haze at the horizon, getting darker towards your feet
      const vd = Math.min(1, r / 70);
      const voidC = 0xff000000 | (Math.round(FOG_B + (pal.vdeep[2] - FOG_B) * vd) << 16) | (Math.round(FOG_G + (pal.vdeep[1] - FOG_G) * vd) << 8) | Math.round(FOG_R + (pal.vdeep[0] - FOG_R) * vd);
      let o = r * BW;
      for (let x = 0; x < BW; x++, o++) {
        const ix = (wx * gs) | 0, iy = (wy * gs) | 0;
        let c: number;
        let field = 1;
        let t = outside;
        const inside = ix >= 0 && iy >= 0 && ix < S && iy < S;
        if (inside) t = types[((wy | 0) >> 1) * TH + ((wx | 0) >> 1)];
        if (t === 3) {
          field = 2;
          if (water) {
            // the sea: moving waves, fading into the haze far away
            // west: water, east: smoke (mixed pixel by pixel over a wide band, so the change is soft)
            // (worked out on every other pixel only: the one in between copies its neighbour, half the work, same look)
            if (x & 1 && seaLast === o - 1) {
              c = seaC;
              seaHt[o] = seaHt[o - 1];
            } else if (r & 1 && r > 0 && mask[o - BW] === 2 && seaHt[o - BW]) {
              // (and every other row copies the row above, haze and all: a quarter of the work in all)
              out[o] = seaCol[o] = seaCol[o - BW];
              seaHt[o] = seaHt[o - BW];
              mask[o] = field;
              seed[o] = 0;
              seaLast = -2;
              wx += stepX;
              wy += stepY;
              continue;
            } else {
              const sm = seaSplit ? (wx - seaSplit) / 420 + 0.5 : 1;
              c = seaC = waterPixel(wx, wy, seaT, sm >= 1 || (sm > 0 && ((((wx | 0) * 73856093) ^ ((wy | 0) * 19349663)) & 1023) < sm * 1024));
              seaHt[o] = (seaHeight() * 255) | 0;
            }
            seaLast = o;
            if (f256) {
              const cr = ((c & 255) * inv + FOG_R * f256) >> 8;
              const cg = (((c >> 8) & 255) * inv + FOG_G * f256) >> 8;
              const cb = (((c >> 16) & 255) * inv + FOG_B * f256) >> 8;
              c = 0xff000000 | (cb << 16) | (cg << 8) | cr;
            }
            out[o] = c;
            seaCol[o] = c;
            mask[o] = field;
            seed[o] = 0;
            wx += stepX;
            wy += stepY;
            continue;
          }
          // void: far-away stars that turn with you but never come closer
          let h = Math.imul(x + off, 374761393) + Math.imul(r, 668265263);
          h = Math.imul(h ^ (h >>> 13), 1274126177);
          c = r > 6 && ((h ^ (h >>> 16)) & 1023) === 0 ? ((h >>> 20) & 1 ? 0xffdc96ff : 0xffb4ffaa) : voidC;
        } else {
          if (inside) {
            c = G[iy * S + ix];
            if (t) field = 0;
          } else c = ((ix % 96) + 96) % 96 < 3 || ((iy % 96) + 96) % 96 < 3 ? pal.farLine : pal.farDark; // past the map: more dark field
          if (f256) {
            const cr = ((c & 255) * inv + FOG_R * f256) >> 8;
            const cg = (((c >> 8) & 255) * inv + FOG_G * f256) >> 8;
            const cb = (((c >> 16) & 255) * inv + FOG_B * f256) >> 8;
            c = 0xff000000 | (cb << 16) | (cg << 8) | cr;
          }
        }
        out[o] = c;
        mask[o] = field;
        seed[o] = ((ix >> 2) * 7 + (iy >> 2) * 13) & 255; // which clump of grass this spot belongs to
        wx += stepX;
        wy += stepY;
      }
      // HILLS: slopes facing you are lit, slopes facing away are in shade
      if (hills && r > 0) {
        const sl = (rowH[r - 1] - rowH[r]) / Math.max(1, rowZ[r - 1] - rowZ[r]);
        const f = Math.round(clamp(1 + sl * 2.4, 0.6, 1.35) * 256);
        if (f !== 256)
          for (let o2 = r * BW, end = o2 + BW; o2 < end; o2++) {
            const c = out[o2];
            out[o2] = 0xff000000 | (Math.min(255, (((c >> 16) & 255) * f) >> 8) << 16) | (Math.min(255, (((c >> 8) & 255) * f) >> 8) << 8) | Math.min(255, ((c & 255) * f) >> 8);
          }
      }
    }
    // ---- EDGES. The field sits higher than the road: a fringe of dark grass with pink tips stands up along the edge and sways.
    // Over the void the road (and the field) is a floating slab: you see its dark side wherever it ends towards you.
    const sway = performance.now() / 1000;
    for (let r = 2; r < (terrain ? 0 : rows); r++) {
      const z = rowZ[r];
      const tall = (GRASS_TALL * FOCAL) / z; // how tall a blade is on screen at this distance
      const thick = Math.max(1, Math.round((SLAB_THICK * FOCAL) / z)); // how thick the slab looks at this distance
      const row = r * BW;
      for (let x = 0; x < BW; x++) {
        const o = row + x;
        const here = mask[o], above = mask[o - BW];
        if (here === above) continue;
        if (here === 2 || above === 2) {
          if (here === 2)
            for (let k = 0; k < thick && r + k < rows; k++) out[o + k * BW] = k === 0 ? pal.lip : (seed[o - BW] & 3) === 0 ? pal.rib : pal.side;
          continue;
        }
        if (z > 620) continue; // too far away to see blades
        // the field pixel right at the edge decides how its clump looks
        const sd = here ? seed[o] : seed[o - BW];
        const wave = 0.75 + 0.25 * Math.sin(sway * 4 + sd * 0.7 + x * 0.05);
        const h = Math.max(1, Math.round(tall * (0.45 + (sd & 7) / 9) * wave));
        if (!here) {
          // field behind the road: a dark bank facing you, grass on top of it
          const bank = Math.max(1, Math.round(tall * 0.35));
          for (let k = 0; k < bank && r + k < rows; k++) out[o + k * BW] = pal.gBank;
        }
        for (let k = 1; k <= h && r - k >= 0; k++) out[o - k * BW] = k >= h ? pal.gTip : k >= h - 1 && h > 3 ? pal.gMid : pal.gDark;
      }
    }
    // ---- SMOKE WAVES (SMOKE OCEAN): every bit of smoke stands up out of the sea by its height, far rows first, so nearer
    // waves hide the ones (and the road) behind them. Its top edge catches the light.
    // (nearest rows first: each column remembers how high the nearer waves already reach, so every pixel is painted once)
    if (water) {
      const colTop = this.seaTop;
      colTop.fill(rows);
      for (let r = rows - 1; r >= 1; r--) {
        const z = rowZ[r];
        const scale = (SMOKE_TALL * FOCAL) / z;
        if (scale < 0.6) break;
        const row = r * BW;
        for (let x = 0; x < BW; x++) {
          const o = row + x;
          const h = seaHt[o];
          if (!h) continue;
          const up = Math.min(20, Math.round((h / 255) * scale));
          if (up < 1) continue;
          const top = r - up, upto = Math.min(r, colTop[x]);
          if (top >= upto) continue;
          const c = seaCol[o];
          const cr = c & 255, cg = (c >> 8) & 255, cb = (c >> 16) & 255;
          // the side of the wave is in shadow at the bottom and lights up towards its rounded top
          for (let yy = Math.max(0, top); yy < upto; yy++) {
            const k = r - yy;
            const f = k === up ? 1.18 : 0.72 + 0.3 * (k / up);
            out[yy * BW + x] = 0xff000000 | (Math.min(255, (cb * f) | 0) << 16) | (Math.min(255, (cg * f) | 0) << 8) | Math.min(255, (cr * f) | 0);
            mask[yy * BW + x] = 2;
          }
          colTop[x] = top < 0 ? 0 : top;
        }
      }
    }
    if (!terrain) b.putImageData(this.frame, 0, hz, 0, 0, BW, rows);

    // ---- BASS DROP: a ring of dots racing outwards over the ground
    for (const t of this.things) {
      if (t.kind !== "wave") continue;
      const g = t.t / t.life;
      const rad = 150 * (1 - (1 - g) * (1 - g));
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const ex = t.x + Math.cos(a) * rad - camX, ey = t.y + Math.sin(a) * rad - camY;
        const z = ex * dx + ey * dy;
        if (z < 12) continue;
        const sc = FOCAL / z;
        const size = Math.max(1, Math.round(5 * sc * (1 - g * 0.5)));
        b.fillStyle = i % 2 ? "#ff46c8" : "#ffffff";
        b.fillRect(Math.round(BW / 2 + (ex * rx + ey * ry) * sc - size / 2), Math.round(hz + camZ * sc - size), size, size);
      }
    }

    // ---- everything standing on the ground
    // ---- THE FLIGHT PATH: where you fly, the way is marked in the air. Two dotted rails show the lane,
    // and arrows down the middle point the way and run forwards. (Only on maps with a flying part.)
    const altOf = this.track.alt;
    if (altOf) {
      const C = this.track.center, NC = C.length;
      const run = Math.floor(performance.now() / 90);
      const dot = (wx: number, wy: number, h: number, col: string, big: number) => {
        const ex = wx - camX, ey = wy - camY;
        const z = ex * dx + ey * dy;
        if (z < 30 || z > 900) return;
        const sc = FOCAL / z;
        const size = Math.max(1, Math.round(big * sc));
        b.fillStyle = col;
        // (the flight path rides above the land, like the karts do)
        b.fillRect(Math.round(BW / 2 + (ex * rx + ey * ry) * sc - size / 2), Math.round(hz + (camZ - gh(wx, wy) - h) * sc - size / 2), size, size);
      };
      for (let i = 0; i < NC; i++) {
        const h = altOf[i] || 0;
        if (h < 6) continue;
        const p = C[i], q = C[(i + 1) % NC];
        let tx = q[0] - p[0], ty = q[1] - p[1];
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const nx = -ty, ny = tx;
        const lane = this.track.halfw[i] * 0.8;
        // the rails: one light-blue dot each side
        dot(p[0] + nx * lane, p[1] + ny * lane, h - 6, "#7ad8ff", 2.4);
        dot(p[0] - nx * lane, p[1] - ny * lane, h - 6, "#7ad8ff", 2.4);
        // the arrows: a "V" of dots pointing forwards, every 5th point; they light up one after the other
        if (i % 5 === 0) {
          const lit = (((i / 5 - run) % 3) + 3) % 3 === 0;
          const col = lit ? "#ffffff" : "#ffe23c";
          for (let k = 0; k <= 4; k++) {
            const back = k * 4.5, out = k * 5;
            dot(p[0] + tx * (12 - back) + nx * out, p[1] + ty * (12 - back) + ny * out, h - 6, col, lit ? 2.6 : 2);
            if (k) dot(p[0] + tx * (12 - back) - nx * out, p[1] + ty * (12 - back) - ny * out, h - 6, col, lit ? 2.6 : 2);
          }
        }
      }
    }

    const list: Sprite[] = [];
    const bursts: { x: number; y: number; t: number; col: [number, number, number] }[] = [];
    const now = performance.now();
    this.tags = [];
    for (const k of this.karts) {
      if (k.left) continue;
      if (this.online && k !== me) {
        // a name tag over every other kart that's close enough to read
        const ex = k.x - camX, ey = k.y - camY;
        const z = ex * dx + ey * dy;
        if (z > 30 && z < 420) {
          const sc = FOCAL / z;
          const px = BW / 2 + (ex * rx + ey * ry) * sc;
          const top = hz + (camZ - gh(k.x, k.y)) * sc - (78 * CARS[k.car].k + k.alt) * sc;
          // drawn on the menu grid (480 x 270), which matches the race screen here
          this.tags.push({ x: (px * UW) / BW, y: ((top - 8) * UH) / BH, name: k.name, col: skinColor(k.skin) });
        }
      }
      let rel = wrapAngle(k.a + k.spinA - ca);
      // your own kart is always seen straight from behind (it stays put on screen): only its front wheels turn when you steer
      if (k === me && k.spin <= 0) rel = 0;
      // which of the 16 views of the 3D kart: 0 = from behind, 4 / 12 = from the sides, 8 = from the front
      const STEP = (Math.PI * 2) / KART_ANGLES;
      const angle = (((Math.round(rel / STEP) * KART_DIR) % KART_ANGLES) + KART_ANGLES) % KART_ANGLES;
      const im = (this.carSkins[k.car] ?? this.kartSkins[k.skin])[`a${angle}`];
      const fw = im.width / 9;
      // flames only while boosting, or while revving on the start line
      const fire = k.boost > 0 || (this.state === "count" && k.rev >= 0);
      // THE FRONT WHEELS: worked out from how fast the kart is turning (so it works for everyone: you, the computer
      // racers and online players). The picture sheet has steering left / straight / steering right, 3 flame frames each.
      const da = wrapAngle(k.a - (k.lastA ?? k.a));
      k.lastA = k.a;
      k.steerVis = (k.steerVis ?? 0) + (clamp(da * 28, -1, 1) - (k.steerVis ?? 0)) * 0.3;
      const steerGroup = k.spin > 0 ? 1 : k.steerVis < -0.3 ? 0 : k.steerVis > 0.3 ? 2 : 1;
      const frame = steerGroup * 3 + (fire ? 1 + (Math.floor(now / 50) % 2) : 0);
      // spinning out: each side squeezes thin and opens into the next one, like a turning card, with a little hop
      const spinning = k.spin > 0;
      const squash = 1; // (the 3D kart really turns, so it doesn't need squeezing any more)
      const hop = spinning ? Math.sin((1 - k.spin / SPIN_TIME) * Math.PI) * 9 : 0;
      // a jump is an arc; falling into the void = sinking and shrinking
      const jumpZ = k.air > 0 ? Math.sin((1 - k.air / AIR_TIME) * Math.PI) * 16 : 0;
      // falling into the void: it tumbles down and shrinks, then bursts into pixels at the bottom
      if (k.fall > 0 && k.fall <= BURST_TIME) {
        bursts.push({ x: k.x, y: k.y, t: 1 - k.fall / BURST_TIME, col: skinColor(k.skin) });
        continue;
      }
      const drop = k.fall > 0 ? 1 - (k.fall - BURST_TIME) / FALL_TIME : 0;
      const tumble = drop > 0 ? Math.max(0.15, Math.abs(Math.cos(drop * 9))) : 1;
      if (k.alt > 2) {
        // the wings (behind the kart), opening as it takes off
        const open = Math.min(1, k.alt / 30);
        const wg = this.img["wings"];
        list.push({ img: wg, sx: 0, sw: wg.width, sh: wg.height, x: k.x, y: k.y, k: 0.3 * open, lift: k.alt + 7, flip: false, shadow: false, kart: true, rot: k.tilt });
      }
      const shake = k.stall > 0 || (this.state === "count" && k.rev >= 0) ? (Math.floor(now / 40) % 2) * 0.5 : 0;
      list.push({ img: im, sx: frame * fw, sw: fw, sh: im.height, x: k.x, y: k.y, k: CARS[k.car].k * (1 - 0.65 * drop), lift: hop + shake + jumpZ + k.alt - drop * drop * FALL_DEPTH, flip: false, shadow: k.fall <= 0 && k.air <= 0 && k.alt <= 6, squash: squash * tumble, kart: true, rot: k.tilt });
    }
    for (const bx of this.boxes)
      if (bx.back <= 0) {
        const im = this.img["itembox"];
        list.push({ img: im, sx: (Math.floor(now / 250) % 2) * 28, sw: 28, sh: 28, x: bx.x, y: bx.y, k: 0.55, lift: 5 + Math.sin(now / 300 + bx.x) * 2, flip: false, shadow: true });
      }
    // beside the track: the black sigil trees (pictures 0-2 in props.png) and black weed plants (3-5), about half and half
    for (const p of this.track.props) list.push({ img: this.pal.props, sx: (p[2] + ((p[0] + p[1]) % 2) * 3) * 40, sw: 40, sh: 64, x: p[0], y: p[1], k: 1.1, lift: 0, flip: false, shadow: false });
    // where we are in the beat: 0 = right on it .. 1 = just before the next one (follows the song when it's playing)
    const bt = this.track.beat, mt = this.snd.musicTime();
    const beat = bt ? (((((mt >= 0 ? mt : now / 1000) - bt.at) * bt.bpm) / 60) % 1 + 1) % 1 : 0;
    // big things standing around: ghost ships and tentacles (SMOKE OCEAN), speakers and equalizer towers (808 TEMPLE)
    for (const d of this.track.decor ?? []) {
      if (d[2] === "ship") list.push({ img: this.img["ghostship"], sx: 0, sw: 72, sh: 46, x: d[0], y: d[1], k: d[3], lift: -5 + Math.sin(now / 700 + d[0]) * 3, flip: d[0] % 2 === 0, shadow: false });
      else if (d[2] === "speaker") list.push({ img: this.img["speaker"], sx: beat < 0.2 ? 80 : 0, sw: 80, sh: 112, x: d[0], y: d[1], k: d[3] / 2, lift: 0, flip: false, shadow: true });
      // (808 TEMPLE's speakers, towers, gates and pillars are 3D renders at double detail: public/kart/speaker.png etc.)
      // TATRA TRIP: mountain goats up on the rock (now and then one looks up from grazing), a bear sitting at the forest edge
      // (sniffing the air), and the log cabin with smoke coming out of its chimney
      else if (d[2] === "goat" || d[2] === "bear") {
        // they walk back and forth along the slope (d[3] = which way), slowing down at each end; a goat stops to graze
        // there, a bear sits down for a rest before it walks back
        const goat = d[2] === "goat";
        const range = goat ? 55 : 85, speed = goat ? 0.13 : 0.09;
        const ph = (now / 1000) * speed + d[0] * 0.013;
        const off = Math.sin(ph) * range, vel = Math.cos(ph);
        const wx = d[0] + Math.cos(d[3]) * off, wy = d[1] + Math.sin(d[3]) * off;
        const walking = Math.abs(vel) > (goat ? 0.35 : 0.3);
        // facing: which way it's going across the screen
        const right = (Math.cos(d[3]) * rx + Math.sin(d[3]) * ry) * vel > 0;
        const step = Math.floor(now / (goat ? 230 : 320)) % 2;
        if (goat) {
          const fr = walking ? 2 + step : Math.floor(now / 1800 + d[0]) % 3 === 0 ? 0 : 1;
          list.push({ far: true, img: this.img["goat"], sx: fr * 24, sw: 24, sh: 20, x: wx, y: wy, k: 1.8, lift: -1, flip: right, shadow: false });
        } else {
          const fr = walking ? 2 + step : Math.floor(now / 900 + d[0]) % 4 === 0 ? 1 : 0;
          list.push({ img: this.img["bear"], sx: fr * 40, sw: 40, sh: 30, x: wx, y: wy, k: 0.95, lift: -1, flip: walking ? !right : false, shadow: true });
        }
      }
      else if (d[2] === "cabin") list.push({ far: true, img: this.img["cabin"], sx: Math.floor(now / 500) % 2 ? 120 : 0, sw: 120, sh: 100, x: d[0], y: d[1], k: d[3], lift: -3, flip: false, shadow: false });
      else if (d[2] === "pine") list.push({ img: this.img["pine"], sx: 0, sw: 40, sh: 64, x: d[0], y: d[1], k: d[3] * 0.55, lift: -2, flip: d[0] % 2 === 0, shadow: false });
      else if (d[2] === "alp") list.push({ far: true, img: this.img["alp"], sx: 0, sw: 240, sh: 200, x: d[0], y: d[1], k: d[3] / 2.6, lift: -10, flip: d[0] % 2 === 0, shadow: false });
      else if (d[2] === "cave") list.push({ img: this.img["cave"], sx: beat < 0.2 ? 240 : 0, sw: 240, sh: 192, x: d[0], y: d[1], k: d[3] * 0.7, lift: 0, flip: false, shadow: false });
      else if (d[2] === "crystal") list.push({ img: this.img["crystal"], sx: Math.floor(now / 400 + d[0]) % 3 === 0 ? 60 : 0, sw: 60, sh: 180, x: d[0], y: d[1], k: d[3] * 0.28, lift: 0, flip: d[1] % 2 === 0, shadow: false });
      else if (d[2] === "puff") list.push({ img: this.img["puff"], sx: (Math.floor(now / 900 + d[0]) % 2) * 96, sw: 96, sh: 80, x: d[0], y: d[1], k: d[3] / 2, lift: 4 + Math.sin(now / 1100 + d[1]) * 4, flip: d[0] % 2 === 0, shadow: false });
      else if (d[2] === "gate") list.push({ img: this.img["gate"], sx: beat < 0.2 ? 240 : 0, sw: 240, sh: 192, x: d[0], y: d[1], k: d[3] * 0.7, lift: 0, flip: false, shadow: false });
      else if (d[2] === "pillar") list.push({ img: this.img["pillar"], sx: beat < 0.2 ? 60 : 0, sw: 60, sh: 180, x: d[0], y: d[1], k: d[3] * 0.38, lift: 0, flip: false, shadow: false });
      else if (d[2] === "eq") {
        // loud right on the beat, then dropping; every tower a little different
        const lvl = Math.max(0, Math.min(7, Math.round(7 * Math.pow(1 - beat, 1.3)) - (d[0] % 3) + (beat > 0.5 && beat < 0.62 ? 2 : 0)));
        list.push({ img: this.img["eq"], sx: lvl * 64, sw: 64, sh: 128, x: d[0], y: d[1], k: d[3] / 2, lift: 0, flip: d[1] % 2 === 0, shadow: true });
      } else if (d[2] === "tentacle") list.push({ img: this.img["tentacle"], sx: (Math.floor(now / 380 + d[1]) % 2) * 24, sw: 24, sh: 64, x: d[0], y: d[1], k: d[3], lift: -6, flip: d[1] % 2 === 0, shadow: false });
    }
    // the smoke rings, floating over the road and slowly wobbling
    for (const r of this.track.smokeRings ?? []) list.push({ img: this.img["smokering"], sx: (Math.floor(now / 500 + r[0]) % 2) * 96, sw: 96, sh: 96, x: r[0], y: r[1], k: 0.72, lift: 6 + Math.sin(now / 600 + r[1]) * 3, flip: false, shadow: false });
    // the slapping tentacles
    (this.track.slaps ?? []).forEach(([i, side], n) => {
      const p = this.slapPhase(n);
      const { ex, ey, fx, fy } = this.slapLine(i, side);
      const wave = (Math.floor(now / 380 + n) % 2) * 24;
      if (p < SLAP_RISE) list.push({ img: this.img["tentacle"], sx: wave, sw: 24, sh: 64, x: ex, y: ey, k: 2.1, lift: -6, flip: side < 0, shadow: false });
      else if (p < SLAP_DOWN) {
        // rearing up, taller and taller, while its shadow darkens across the road
        const f = (p - SLAP_RISE) / (SLAP_DOWN - SLAP_RISE);
        list.push({ img: this.img["tentacle"], sx: wave, sw: 24, sh: 64, x: ex, y: ey, k: 2.1 + f * 1.3, lift: -6 + f * 8, flip: side < 0, shadow: false });
        for (let s = 0; s <= 1.001; s += 0.12) list.push({ img: this.slapShade, sx: f > 0.55 ? 18 : 0, sw: 18, sh: 6, x: ex + (fx - ex) * s, y: ey + (fy - ey) * s, k: 1.5, lift: -2, flip: false, shadow: false });
      } else {
        // down across the road, then sliding back into the water from the far end
        const reach = p < SLAP_BACK ? 1 : 1 - (p - SLAP_BACK) / (SLAP_CYCLE - SLAP_BACK);
        for (let s = 0; s <= reach + 0.001; s += 0.08) list.push({ img: this.slapSeg, sx: 0, sw: 18, sh: 12, x: ex + (fx - ex) * s, y: ey + (fy - ey) * s, k: 1.55 - s * 0.45, lift: -1, flip: false, shadow: false });
      }
    });
    // the flying part: mountain tops standing in the hills, and rings hanging in the air
    for (const pk of this.track.peaks ?? []) list.push({ img: this.img["peak"], sx: 0, sw: 64, sh: 100, x: pk[0], y: pk[1], k: 1.05, lift: 0, flip: false, shadow: false });
    for (const rg of this.track.rings ?? []) list.push({ img: this.img["ring"], sx: (Math.floor(now / 200) % 2) * 48, sw: 48, sh: 48, x: rg[0], y: rg[1], k: 0.9, lift: rg[2] - 12, flip: false, shadow: false });
    for (const t of this.things) {
      if (t.kind === "wave") continue;
      if (t.kind === "boom") {
        // the blast: 6 frames, always the same size, sitting on the ground
        const f = Math.min(5, Math.floor((t.t / t.life) * 6));
        list.push({ img: this.boom, sx: f * 64, sw: 64, sh: 64, x: t.x, y: t.y, k: 1.08, lift: t.alt - 12, flip: false, shadow: false });
      } else {
        const name = t.kind === "bomb" ? "item-bomb" : t.kind === "mic" ? "item-mic" : t.kind === "vinyl" ? "item-vinyl" : "item-wall";
        list.push({ img: this.img[name], sx: 0, sw: 48, sh: 48, x: t.x, y: t.y, k: t.kind === "wall" ? 0.95 : 0.42, lift: t.z + t.alt + (t.kind === "mic" ? 4 : 0), flip: false, shadow: t.kind !== "wall" });
      }
    }
    const proj: { s: Sprite; z: number; px: number; py: number; sc: number }[] = [];
    for (const s of list) {
      const ex = s.x - camX, ey = s.y - camY;
      const z = ex * dx + ey * dy;
      if (z < 12 || z > (s.far ? 3400 : 1500)) continue; // (mountains can be seen from much further away)
      if (!s.kart && z < 58) continue; // things right in front of the camera (behind your own kart) would fill the screen
      const side = ex * rx + ey * ry;
      const sc = FOCAL / z;
      const px = BW / 2 + side * sc;
      if (px < -200 || px > BW + 200) continue;
      proj.push({ s, z, px, py: hz + (camZ - gh(s.x, s.y)) * sc, sc });
    }
    proj.sort((a, c) => c.z - a.z);
    for (const p of proj) {
      const s = p.s;
      const fullW = s.sw * s.k * p.sc;
      const w = fullW * (s.squash ?? 1), h = s.sh * s.k * p.sc;
      if (fullW < 1.5) continue;
      const x = Math.round(p.px - w / 2), y = Math.round(p.py - h - s.lift * p.sc);
      if (s.shadow) {
        b.fillStyle = "rgba(10,2,16,0.4)";
        b.fillRect(Math.round(p.px - fullW * 0.42), Math.round(p.py - Math.max(1, h * 0.05)), Math.round(fullW * 0.84), Math.max(1, Math.round(h * 0.1)));
      }
      // HILLS: hidden behind a crest? Only the part above the hilltop shows
      let clipped = false;
      if (terrain) {
        // A REAL MOUNTAIN: every screen column knows how high the land in front of this thing reaches: hide what's below that
        let lv = 0;
        while (lv < OCC_LEVELS - 1 && OCC_Z[lv + 1] <= p.z * 0.96) lv++;
        const x0 = Math.max(0, x), x1 = Math.min(BW - 1, x + Math.round(w));
        let anyShow = false, anyHide = false;
        for (let cx = x0; cx <= x1; cx++) {
          const cy = this.occ[cx * OCC_LEVELS + lv];
          if (cy > y) anyShow = true;
          if (cy < p.py) anyHide = true;
        }
        if (!anyShow) continue;
        if (anyHide) {
          clipped = true;
          b.save();
          b.beginPath();
          let runX = x0, runY = this.occ[x0 * OCC_LEVELS + lv];
          for (let cx = x0 + 1; cx <= x1 + 1; cx++) {
            const cy = cx <= x1 ? this.occ[cx * OCC_LEVELS + lv] : -999;
            if (cy !== runY) {
              if (runY > 0) b.rect(runX, 0, cx - runX, runY);
              runX = cx;
              runY = cy;
            }
          }
          b.clip();
        }
      } else if (hills) {
        let cr = Math.min(rows - 1, Math.floor(p.py - hz));
        while (cr >= 0 && rowZ[cr] < p.z * 0.97) cr--;
        const clipY = hz + cr + 1;
        if (clipY <= y) continue;
        if (clipY < p.py) {
          clipped = true;
          b.save();
          b.beginPath();
          b.rect(0, 0, BW, clipY);
          b.clip();
        }
      }
      const [fa, fl] = this.track.fog ?? [500, 2600];
      if (p.z > fa) b.globalAlpha = Math.max(0.2, 1 - (p.z - fa) / (fl / 2));
      if (s.rot) {
        // banking while flying
        b.save();
        b.translate(Math.round(p.px), y + Math.round(h / 2));
        b.rotate(s.rot);
        b.drawImage(s.img, s.sx * resOf(s.img), 0, s.sw * resOf(s.img), s.sh * resOf(s.img), -Math.round(w / 2), -Math.round(h / 2), Math.round(w), Math.round(h));
        b.restore();
      } else if (s.flip) {
        b.save();
        b.translate(x + Math.round(w), y);
        b.scale(-1, 1);
        b.drawImage(s.img, s.sx * resOf(s.img), 0, s.sw * resOf(s.img), s.sh * resOf(s.img), 0, 0, Math.round(w), Math.round(h));
        b.restore();
      } else b.drawImage(s.img, s.sx * resOf(s.img), 0, s.sw * resOf(s.img), s.sh * resOf(s.img), x, y, Math.round(w), Math.round(h));
      b.globalAlpha = 1;
      if (clipped) b.restore();
    }
    // ---- the pixel burst at the bottom of a fall: a white flash, then squares flying apart
    for (const bu of bursts) {
      const ex = bu.x - camX, ey = bu.y - camY;
      const z = ex * dx + ey * dy;
      if (z < 12 || z > 1200) continue;
      const sc = FOCAL / z;
      const cx = BW / 2 + (ex * rx + ey * ry) * sc, cy = hz + (camZ - gh(bu.x, bu.y)) * sc + (FALL_DEPTH - 4) * sc;
      const cols = ["#ff46c8", "#ffffff", `rgb(${bu.col[0]},${bu.col[1]},${bu.col[2]})`, "#7a3ce0", "#ffe23c"];
      if (bu.t < 0.12) {
        const f = Math.max(4, Math.round(40 * sc));
        b.fillStyle = "#ffffff";
        b.fillRect(Math.round(cx - f / 2), Math.round(cy - f / 2), f, f);
      }
      const out2 = bu.t * (2 - bu.t); // fast at first, slowing down
      for (let i = 0; i < 46; i++) {
        const a = i * 2.399, sp = 26 + ((i * 37) % 62);
        const size = Math.max(1, Math.round((7.5 - 6.5 * bu.t) * sc * (1 + (i % 3) * 0.5)));
        if (bu.t > 0.55 && i % 2) continue; // half of them are gone by the end
        b.fillStyle = cols[i % cols.length];
        b.fillRect(Math.round(cx + Math.cos(a) * sp * out2 * sc - size / 2), Math.round(cy + (Math.sin(a) * sp * out2 * 0.7 + 14 * bu.t * bu.t) * sc - size / 2), size, size);
      }
    }
  }
}