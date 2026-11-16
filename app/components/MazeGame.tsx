"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, makeArcade, type Arcade, type ShopRow } from "./PinkShop";

// PINK MAZE: pac-man with Pinkmane's face. Eat every seed, the haters chase you, a WEED LEAF makes them scared (eat them!).
//   ARROWS / W A S D / swipe ANYWHERE on a phone / click wheel = steer      SPACE / OK / tap = start
//   ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// A new maze every 3 levels. From level 2 BEARMANPIG joins the haters (scared, he's worth 1000).
// A GOLDEN NUG shows up under the haters' home twice a level: 500 points + 10 seeds.
// MONEY: SEEDS. 1 for every 10 seeds you eat, 5 for every hater you eat, 20 for clearing a maze, 10 for a golden nug.
// ONLINE TOP 10: board id "maze" (see Scoreboard.tsx).

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // true on phones / tablets: swipe ANYWHERE on the screen to steer (no need to lift your finger), and the game is a bit kinder
  touch?: boolean;
};

type Mode = "ready" | "running" | "caught" | "dying" | "over";
type Dir = { x: number; y: number };
// Something that walks the maze: standing on tile (cx, cy), walking toward the next tile
type Walker = { cx: number; cy: number; prog: number; dir: Dir; next: Dir };
type HaterMode = "home" | "chase" | "scared" | "eyes";
type Hater = Walker & { mode: HaterMode; wait: number; style: number };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };

const GAME_TITLE = "PINK MAZE";

// Game size in pixels (the PSP screen)
const W = 320;
const H = 150;
const T = 8; // one maze tile
const OX = 36; // the maze is in the middle, with a column either side
const OY = 14;

// The mazes: # wall, . seed, o weed leaf, H haters' home, = door (only haters use it), P start.
// All three have the haters' home, the door and the start in the same place.
const MAZES = [
  [
    "###############################",
    "#o..........#.....#..........o#",
    "#.####.####.#.###.#.####.####.#",
    "#.............................#",
    "#.####.#.#####...#####.#.####.#",
    "#......#....###=###....#......#",
    "######.####.#HHHHH#.####.######",
    "######.####.#HHHHH#.####.######",
    "#......#....#######....#......#",
    "#..............P..............#",
    "#.####.######.#.#.######.####.#",
    "#...#.........#.#.........#...#",
    "###.#.#.#####.#.#.#####.#.#.###",
    "#.....#.....#.....#.....#.....#",
    "#.#########.#.###.#.#########.#",
    "#o...........................o#",
    "###############################",
  ],
  [
    "###############################",
    "#o...........................o#",
    "#.##.##.#####.#.#.#####.##.##.#",
    "#.............#.#.............#",
    "#.##.#.###.####.####.###.#.##.#",
    "#....#......###=###......#....#",
    "####.#.####.#HHHHH#.####.#.####",
    "####.#.####.#HHHHH#.####.#.####",
    "#....#......#######......#....#",
    "#..#.....#.....P.....#.....#..#",
    "#.##.#.#####.#.#.#.#####.#.##.#",
    "#....#.......#...#.......#....#",
    "###.##.####.##.#.##.####.##.###",
    "#..............#..............#",
    "#.####.#.#####.#.#####.#.####.#",
    "#o.....#...............#.....o#",
    "###############################",
  ],
  [
    "###############################",
    "#o.........#.......#.........o#",
    "#.###.####.#.##.##.#.####.###.#",
    "#.#...#.................#...#.#",
    "#.#.#.#.#####.....#####.#.#.#.#",
    "#...#...#...###=###...#...#...#",
    "###.###.#.#.#HHHHH#.#.#.###.###",
    "###.###.#.#.#HHHHH#.#.#.###.###",
    "#.......#...#######...#.......#",
    "#.####.......#.P.#.......####.#",
    "#.#....#####.#.#.#.#####....#.#",
    "#...##...#.....#.....#...##...#",
    "##.#...#.#.###.#.###.#.#...#.##",
    "#..#.#.#.....#...#.....#.#.#..#",
    "#.##.#.#####.#.#.#.#####.#.##.#",
    "#o...#...................#...o#",
    "###############################",
  ],
];
const COLS = 31;
const ROWS = 17;
const START = { x: 15, y: 9 };
const DOOR_OUT = { x: 15, y: 4 }; // the tile just outside the haters' door
const HOME = [
  { x: 14, y: 6 },
  { x: 16, y: 6 },
  { x: 14, y: 7 },
  { x: 16, y: 7 },
  { x: 15, y: 7 }, // BEARMANPIG
];
const NUG_AT = { x: 15, y: 9 }; // where the golden nug shows up

// ---------- EASY TUNING ----------
const START_LIVES = 3;
const WHEEL_TURN = 40; // degrees of click wheel = one turn
const LEVELS_PER_MAZE = 3; // a new maze every this many levels
const BEAR_FROM = 2; // BEARMANPIG joins from this level
const NUG_AFTER = [70, 170]; // the golden nug shows up after this many seeds eaten
const NUG_TIME = 9; // seconds it stays
// PHONES
const SWIPE_PX = 14; // how far a finger slides for one turn (in screen pixels, smaller = more sensitive)
const TURN_GRACE = 0.35; // a turn pressed a moment too late (up to this much of a tile past a corner) still takes the corner
const TOUCH_HATER_SPEED = 0.88; // on phones the haters are this much slower (1 = the same as on a computer)
const TOUCH_SCARED_BONUS = 1.5; // ...and they stay scared this many seconds longer

// Saved in the visitor's browser
const BEST_KEY = "pinkmaze-best";
const FX_KEY = "pinkmaze-sfx";
const SHOP_KEY = "pinkmaze-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const PURPLE = "#b04ad8";
const GOLD = "#ffd700";
const BOOM = [PINK, "#ffc800", INK, "#ffffff", DARK_PINK];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "CLASSIC", price: 0 },
  { id: "toxic", name: "TOXIC", price: 50 },
  { id: "ice", name: "ICE", price: 90 },
  { id: "fire", name: "FIRE", price: 140 },
  { id: "ghost", name: "GHOST", price: 200 },
  { id: "gold", name: "GOLD", price: 350 },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "FACES" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} FACE`, prices: [k.price], wear: true, info: [`PINKMANE WITH A ${k.name} MOHAWK`, ""] })),
  { kind: "head", label: "UPGRADES" },
  { kind: "item", id: "up:leaf", name: "LONGER LEAVES", prices: [60, 150, 300], info: ["HATERS STAY SCARED LONGER", "+1 SECOND EVERY LEVEL"] },
  { kind: "item", id: "up:life", name: "EXTRA LIFE", prices: [200, 500], info: ["START WITH ONE MORE LIFE", "TWO MORE AT LEVEL 2"] },
  { kind: "item", id: "up:speed", name: "SPEED SHOES", prices: [100, 250], info: ["YOU WALK FASTER", "A BIT MORE EVERY LEVEL"] },
  { kind: "back" },
];

// You: yellow face with the pink mohawk (two frames: mouth closed / open)
const PLAYER_FRAMES = [
  ["P.P.P..", ".PPP...", ".YYYYY.", "YWKYWKY", "YYYYYYY", "YYKKKYY", ".YYYYY."],
  ["P.P.P..", ".PPP...", ".YYYYY.", "YWKYWKY", "YYKKKYY", "YYKRKYY", ".YKKKY."],
];
// Haters: grumpy grey clouds. Scared ones turn purple and wobbly.
const HATER = [".GG.GG.", "GGGGGGG", "GKKGKKG", "GWKGWKG", "GGGGGGG", "GGKKKGG", ".GGGGG."];
const HATER_SCARED = [".UU.UU.", "UUUUUUU", "UUUUUUU", "UWUUUWU", "UUUUUUU", "UWUWUWU", ".UUUUU."];
const HATER_EYES = [".......", ".......", ".......", "WK.WK..", ".......", ".......", "......."];
const HATER_COLORS = ["#8a8a8a", "#6e6e6e", "#a0a0a0", "#7c7c7c"];
// BEARMANPIG: brown ears, pink snout
const BEAR = ["B.....B", "BBPPPBB", "PKWPWKP", "PPPPPPP", "PPDDDPP", "PPDKDPP", ".PPPPP."];
const LEAF = ["..G..", "G.G.G", "GGGGG", ".GGG.", "..D.."];
const NUG = [".GG.", "GGGG", "GLGG", ".GG."];

const DIRS: Dir[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const pad = (n: number) => String(Math.floor(n)).padStart(5, "0");
const same = (a: Dir, b: Dir) => a.x === b.x && a.y === b.y;
function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, colors: Record<string, string>) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const color = colors[rows[r][c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x) + c, Math.round(y) + r, 1, 1);
      }
    }
  }
}
// your face's colours in a skin
const faceColors = (skin: string): Record<string, string> => {
  const c = SKIN_COLORS[skin] ?? SKIN_COLORS.pink;
  return { P: c[1], Y: skin === "gold" ? "#ffe680" : "#ffc800", W: "#ffffff", K: INK, R: "#d21e1e" };
};
// the money icon: a seed
const seedIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 2, y + 1, 4, 6);
  ctx.fillRect(x + 1, y + 2, 6, 4);
  ctx.fillStyle = "#6fdc5a";
  ctx.fillRect(x + 2, y + 2, 4, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x + 3, y + 3, 1, 1);
};

export default function MazeGame({ actionSignal, spinRef, fontFamily, muted, touch = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const pressRef = useRef<(() => void) | null>(null);
  const arcRef = useRef<Arcade | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const isTouch = () => touchRef.current || coarse;

    let maze = MAZES[0];
    const tileAt = (x: number, y: number) => (y < 0 || y >= ROWS || x < 0 || x >= COLS ? "#" : maze[y][x]);
    const isWall = (x: number, y: number) => {
      const t = tileAt(x, y);
      return t === "#" || t === "H" || t === "=";
    };

    const s = {
      mode: "ready" as Mode,
      player: { cx: START.x, cy: START.y, prog: 0, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } } as Walker,
      haters: [] as Hater[],
      seeds: [] as boolean[][], // true = still there
      leaves: [] as boolean[][],
      left: 0, // seeds + leaves still on the board
      eatenHere: 0, // seeds eaten on this board (for the golden nug)
      nug: 0, // seconds the golden nug stays (0 = not there)
      nugsShown: 0,
      score: 0,
      best: 0,
      lives: START_LIVES,
      level: 1,
      scared: 0, // seconds the haters stay scared
      combo: 0,
      wheelAcc: 0,
      particles: [] as Particle[],
      popups: [] as { x: number; y: number; text: string; life: number }[],
      munch: 0,
      t: 0,
      clock: 0,
      runTime: 0,
      shake: 0,
      flash: 0,
      flashText: "",
      seedCount: 0, // seeds eaten this game (every 10 = 1 money seed)
      run: 0, // money this game
      newBest: false,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}

    // ---------- pause, shop, FX (the same in every game, see PinkShop.ts) ----------
    const playing = () => s.mode === "running" || s.mode === "caught";
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
      moneyName: "SEEDS",
      icon: seedIcon,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, arc.shop.wearing("skin"), cx, cy, t),
      ink: INK,
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
    let munchFlip = false;
    const playMunch = () => {
      munchFlip = !munchFlip;
      beep(munchFlip ? 420 : 340, munchFlip ? 300 : 460, 0.05, 0.03, "triangle");
    };
    const playLeaf = () => [392, 523, 659, 784].forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.06));
    const playEatHater = () => beep(200, 1200, 0.22, 0.07, "sawtooth");
    const playCaught = () => beep(600, 80, 0.6, 0.08, "square");
    const playLevel = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f, 0.09, 0.05, "square", i * 0.07));
    const playNug = () => [1047, 1319, 1568, 2093].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.05));
    const playOink = () => beep(300, 120, 0.25, 0.08, "sawtooth");
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const px = (w: Walker) => OX + (w.cx + w.dir.x * w.prog) * T;
    const py = (w: Walker) => OY + (w.cy + w.dir.y * w.prog) * T;

    const fillBoard = () => {
      maze = MAZES[Math.floor((s.level - 1) / LEVELS_PER_MAZE) % MAZES.length];
      s.seeds = [];
      s.leaves = [];
      s.left = 0;
      s.eatenHere = 0;
      s.nug = 0;
      s.nugsShown = 0;
      for (let y = 0; y < ROWS; y++) {
        s.seeds.push([]);
        s.leaves.push([]);
        for (let x = 0; x < COLS; x++) {
          const t = maze[y][x];
          s.seeds[y].push(t === ".");
          s.leaves[y].push(t === "o");
          if (t === "." || t === "o") s.left += 1;
        }
      }
    };
    const placeEveryone = () => {
      s.player = { cx: START.x, cy: START.y, prog: 0, dir: { x: -1, y: 0 }, next: { x: -1, y: 0 } };
      const count = s.level >= BEAR_FROM ? 5 : 4;
      s.haters = HOME.slice(0, count).map((h, i) => ({
        cx: h.x,
        cy: h.y,
        prog: 0,
        dir: { x: 0, y: -1 },
        next: { x: 0, y: -1 },
        mode: "home" as HaterMode,
        wait: i === 4 ? 14 : 2 + i * 4,
        style: i,
      }));
      s.scared = 0;
    };
    const newGame = () => {
      boardRef.current?.hide();
      s.score = 0;
      s.lives = START_LIVES + arc.shop.lvl("life");
      s.level = 1;
      s.runTime = 0;
      s.particles = [];
      s.popups = [];
      s.seedCount = 0;
      s.run = 0;
      s.newBest = false;
      s.t = 0;
      fillBoard();
      placeEveryone();
    };

    // Steer to an exact direction (arrows, swipes). The turn is remembered until it's possible,
    // so you can swipe a little BEFORE a corner and you'll take it when you get there.
    const steer = (x: number, y: number) => {
      if (s.mode !== "running") return;
      const p = s.player;
      p.next = { x, y };
      // Turning around is allowed any time
      if (p.dir.x === -x && p.dir.y === -y && p.prog > 0) {
        p.cx += p.dir.x;
        p.cy += p.dir.y;
        p.prog = 1 - p.prog;
        p.dir = { x, y };
        return;
      }
      // A turn pressed a moment too LATE: you've only just passed a corner where that way is open, so go back and take it
      const sideways = (x !== 0) !== (p.dir.x !== 0);
      if (sideways && p.prog > 0 && p.prog < TURN_GRACE && !isWall(p.cx + x, p.cy + y)) {
        p.prog = 0;
        p.dir = { x, y };
      }
    };
    // Turn left / right from where you're heading (click wheel)
    const turn = (right: boolean) => {
      const d = s.player.next;
      if (right) steer(-d.y, d.x);
      else steer(d.y, -d.x);
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        s.mode = "running";
      } else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return;
        newGame();
        s.mode = "running";
      }
    };
    pressRef.current = press;

    const hatersSpeed = () => Math.min(6.0, 3.8 + (s.level - 1) * 0.35) * (isTouch() ? TOUCH_HATER_SPEED : 1);
    const playerSpeed = () => Math.min(6.4, 5.4 + (s.level - 1) * 0.2) + arc.shop.lvl("speed") * 0.3;
    const scaredTime = () => Math.max(3, 7 - (s.level - 1) * 0.8) + (isTouch() ? TOUCH_SCARED_BONUS : 0) + arc.shop.lvl("leaf");

    const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
      for (let i = 0; i < count; i++) s.particles.push({ x, y, vx: rand(-power, power), vy: rand(-power, power), color: colors[Math.floor(Math.random() * colors.length)], life: rand(0.4, 1.0) });
    };

    // You arrived in the middle of a tile: eat what's there and pick the next direction
    const playerArrive = () => {
      const p = s.player;
      if (s.seeds[p.cy][p.cx]) {
        s.seeds[p.cy][p.cx] = false;
        s.left -= 1;
        s.score += 10;
        s.eatenHere += 1;
        s.seedCount += 1;
        if (s.seedCount % 10 === 0) s.run += 1;
        playMunch();
        // the golden nug
        if (s.nugsShown < NUG_AFTER.length && s.eatenHere >= NUG_AFTER[s.nugsShown]) {
          s.nugsShown += 1;
          s.nug = NUG_TIME;
        }
      }
      if (s.leaves[p.cy][p.cx]) {
        s.leaves[p.cy][p.cx] = false;
        s.left -= 1;
        s.score += 50;
        s.scared = scaredTime();
        s.combo = 0;
        for (const h of s.haters) {
          if (h.mode === "chase") {
            h.mode = "scared";
            h.dir = { x: -h.dir.x, y: -h.dir.y };
            h.cx += h.prog > 0 ? -h.dir.x : 0;
            h.cy += h.prog > 0 ? -h.dir.y : 0;
            h.prog = h.prog > 0 ? 1 - h.prog : 0;
          }
        }
        burst(OX + p.cx * T + 4, OY + p.cy * T + 4, 12, [GREEN, DARK_GREEN, "#ffffff"], 45);
        playLeaf();
      }
      if (s.nug > 0 && p.cx === NUG_AT.x && p.cy === NUG_AT.y) {
        s.nug = 0;
        s.score += 500;
        s.run += 10;
        s.popups.push({ x: OX + p.cx * T + 4, y: OY + p.cy * T, text: "500", life: 1.2 });
        burst(OX + p.cx * T + 4, OY + p.cy * T + 4, 16, [GOLD, "#ffffff", GREEN], 55);
        playNug();
      }
      if (!isWall(p.cx + p.next.x, p.cy + p.next.y)) p.dir = { ...p.next };
    };

    const moveWalker = (w: Walker, dist: number, onArrive: () => void) => {
      let remaining = dist;
      let guard = 0;
      while (remaining > 0 && guard++ < 10) {
        if (w.prog === 0) {
          onArrive();
          if (isWall(w.cx + w.dir.x, w.cy + w.dir.y)) return; // blocked: stand still
        }
        w.prog += remaining;
        if (w.prog >= 1) {
          remaining = w.prog - 1;
          w.prog = 0;
          w.cx += w.dir.x;
          w.cy += w.dir.y;
        } else remaining = 0;
      }
    };

    // Where each hater wants to go
    const targetFor = (h: Hater) => {
      const p = s.player;
      if (h.mode === "eyes") return DOOR_OUT;
      if (h.mode === "scared") return { x: COLS - 1 - p.cx, y: ROWS - 1 - p.cy };
      switch (h.style) {
        case 0:
          return { x: p.cx, y: p.cy }; // straight at you
        case 1:
          return { x: p.cx + p.dir.x * 4, y: p.cy + p.dir.y * 4 }; // cuts you off
        case 2: {
          // chases when far, wanders off when close
          const d = Math.abs(h.cx - p.cx) + Math.abs(h.cy - p.cy);
          return d > 8 ? { x: p.cx, y: p.cy } : { x: 1, y: ROWS - 2 };
        }
        case 3:
          return { x: p.cx - p.dir.x * 3, y: p.cy - p.dir.y * 3 }; // comes from behind
        default:
          return { x: p.cx, y: p.cy }; // BEARMANPIG: always straight at you
      }
    };
    const haterArrive = (h: Hater) => {
      // Eyes got back to the door: go home and come back out soon
      if (h.mode === "eyes" && h.cx === DOOR_OUT.x && h.cy === DOOR_OUT.y) {
        const home = HOME[h.style];
        h.cx = home.x;
        h.cy = home.y;
        h.prog = 0;
        h.mode = "home";
        h.wait = 2;
        return;
      }
      const target = targetFor(h);
      const options = DIRS.filter((d) => !isWall(h.cx + d.x, h.cy + d.y) && !(d.x === -h.dir.x && d.y === -h.dir.y));
      const choices = options.length ? options : DIRS.filter((d) => !isWall(h.cx + d.x, h.cy + d.y));
      if (!choices.length) return;
      let best = choices[0];
      if (h.mode === "scared" && Math.random() < 0.5) best = choices[Math.floor(Math.random() * choices.length)];
      else {
        let bestD = Infinity;
        for (const d of choices) {
          const dist = (h.cx + d.x - target.x) ** 2 + (h.cy + d.y - target.y) ** 2;
          if (dist < bestD) {
            bestD = dist;
            best = d;
          }
        }
      }
      h.dir = best;
    };

    const loseLife = () => {
      s.lives -= 1;
      s.shake = 0.3;
      burst(px(s.player) + 4, py(s.player) + 4, 30, BOOM, 90);
      playCaught();
      if (s.lives <= 0) {
        s.mode = "dying";
        s.t = 0;
        if (s.score > s.best) {
          s.best = Math.floor(s.score);
          s.newBest = true;
          try {
            localStorage.setItem(BEST_KEY, String(s.best));
          } catch {}
        }
        playDeath();
      } else {
        s.mode = "caught";
        s.t = 0;
      }
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      const got = s.run;
      bankRun();
      s.run = got;
      boardRef.current?.gameOver(Math.floor(s.score), s.runTime);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.flash > 0) s.flash -= dt;
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2 * dt;
        p.vy *= 1 - 2 * dt;
        p.life -= dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const pop of s.popups) {
        pop.y -= 12 * dt;
        pop.life -= dt;
      }
      s.popups = s.popups.filter((p) => p.life > 0);

      // Click wheel turns
      s.wheelAcc += spinRef.current;
      spinRef.current = 0;
      if (s.mode !== "running") s.wheelAcc = 0;
      while (s.wheelAcc >= WHEEL_TURN) {
        turn(true);
        s.wheelAcc -= WHEEL_TURN;
      }
      while (s.wheelAcc <= -WHEEL_TURN) {
        turn(false);
        s.wheelAcc += WHEEL_TURN;
      }

      if (s.mode === "dying") {
        if (s.t > 1.6) gameOver();
        return;
      }
      if (s.mode === "caught") {
        if (s.t > 1.4) {
          placeEveryone();
          s.mode = "running";
        }
        return;
      }
      if (s.mode !== "running") return;

      s.runTime += dt;
      s.munch += dt;
      if (s.nug > 0) s.nug -= dt;
      if (s.scared > 0) {
        s.scared -= dt;
        if (s.scared <= 0) for (const h of s.haters) if (h.mode === "scared") h.mode = "chase";
      }

      // You
      moveWalker(s.player, playerSpeed() * dt, playerArrive);
      // Haters
      for (const h of s.haters) {
        if (h.mode === "home") {
          h.wait -= dt;
          if (h.wait <= 0) {
            h.cx = DOOR_OUT.x;
            h.cy = DOOR_OUT.y;
            h.prog = 0;
            h.dir = { x: Math.random() < 0.5 ? -1 : 1, y: 0 };
            h.mode = s.scared > 0 ? "scared" : "chase";
            if (h.style === 4) playOink();
          }
          continue;
        }
        const base = h.mode === "eyes" ? 11 : h.mode === "scared" ? 3 : hatersSpeed();
        const speed = h.style === 4 && h.mode === "chase" ? base * 0.82 : base; // BEARMANPIG is a bit slower, but never gives up
        moveWalker(h, speed * dt, () => haterArrive(h));
      }

      // Touching a hater
      const ppx = px(s.player);
      const ppy = py(s.player);
      for (const h of s.haters) {
        if (h.mode === "home" || h.mode === "eyes") continue;
        if (Math.abs(px(h) - ppx) < 5 && Math.abs(py(h) - ppy) < 5) {
          if (h.mode === "scared") {
            s.combo += 1;
            const points = h.style === 4 ? 1000 : 200 * 2 ** (s.combo - 1);
            s.score += points;
            s.run += h.style === 4 ? 15 : 5;
            s.popups.push({ x: px(h) + 4, y: py(h), text: String(points), life: 1 });
            burst(px(h) + 4, py(h) + 4, 14, [PURPLE, "#ffffff"], 50);
            h.mode = "eyes";
            playEatHater();
          } else {
            loseLife();
            return;
          }
        }
      }

      // Board cleared: next level (a new maze every few levels)
      if (s.left <= 0) {
        s.score += 500;
        s.run += 20;
        s.level += 1;
        const newMaze = (s.level - 1) % LEVELS_PER_MAZE === 0;
        fillBoard();
        placeEveryone();
        s.flash = 1.6;
        s.flashText = newMaze ? `LEVEL ${s.level}  NEW MAZE!` : `LEVEL ${s.level}`;
        if (s.level === BEAR_FROM) s.flashText = "BEARMANPIG IS COMING";
        playLevel();
      }
    };

    // ---------- drawing ----------
    const textBox = (text: string, y: number) => {
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = SCREEN;
      ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
      ctx.fillStyle = INK;
      ctx.fillText(text, W / 2, y);
    };
    const drawFace = (c: CanvasRenderingContext2D, x: number, y: number, frame: number, skin: string) => {
      c.globalAlpha = skin === "ghost" ? 0.7 : 1;
      drawPixels(c, PLAYER_FRAMES[frame], x, y, faceColors(skin));
      c.globalAlpha = 1;
    };
    // the shop's preview + the SHOP panel: your face munching seeds, or an upgrade's picture
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      c.fillStyle = SCREEN;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      c.save();
      c.translate(cx, cy);
      c.scale(2, 2);
      if (id === "up:leaf") {
        drawPixels(c, HATER_SCARED, -9, -3, { U: PURPLE, W: "#ffffff" });
        drawPixels(c, LEAF, 3, -2, { G: GREEN, D: DARK_GREEN });
      } else if (id === "up:life") {
        for (let i = 0; i < 3; i++) drawFace(c, -12 + i * 8, -3 + Math.round(Math.sin(t * 4 + i)), 0, skin);
      } else {
        const run = id === "up:speed" ? 14 : 8;
        const x = -10 + ((t * run) % 16);
        for (let i = 0; i < 3; i++) {
          const sx = -6 + i * 6;
          if (sx > x + 4) {
            c.fillStyle = DARK_GREEN;
            c.fillRect(sx, 0, 2, 2);
          }
        }
        drawFace(c, x, -3, Math.floor(t * 8) % 2, skin);
      }
      c.restore();
    };

    const draw = () => {
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
      ctx.fillStyle = SCREEN;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      // Maze walls: black blocks with a pink edge where they meet a path
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const t = maze[y][x];
          const X = OX + x * T;
          const Y = OY + y * T;
          if (t === "#") {
            ctx.fillStyle = INK;
            ctx.fillRect(X, Y, T, T);
            ctx.fillStyle = PINK;
            if (!isWall(x, y - 1)) ctx.fillRect(X, Y, T, 1);
            if (!isWall(x, y + 1)) ctx.fillRect(X, Y + T - 1, T, 1);
            if (!isWall(x - 1, y)) ctx.fillRect(X, Y, 1, T);
            if (!isWall(x + 1, y)) ctx.fillRect(X + T - 1, Y, 1, T);
          } else if (t === "=") {
            ctx.fillStyle = DARK_PINK;
            ctx.fillRect(X, Y + 3, T, 2);
          } else if (t === "H") {
            ctx.fillStyle = "#c3e2a3";
            ctx.fillRect(X, Y, T, T);
          }
        }
      }
      // Seeds and weed leaves
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          if (s.seeds[y] && s.seeds[y][x]) {
            ctx.fillStyle = DARK_GREEN;
            ctx.fillRect(OX + x * T + 3, OY + y * T + 3, 2, 2);
          }
          if (s.leaves[y] && s.leaves[y][x] && Math.floor(s.clock * 3) % 2 === 0) drawPixels(ctx, LEAF, OX + x * T + 1, OY + y * T + 1, { G: GREEN, D: DARK_GREEN });
        }
      }
      // the golden nug (blinks before it goes)
      if (s.nug > 0 && (s.nug > 2 || Math.floor(s.clock * 8) % 2 === 0)) {
        drawPixels(ctx, NUG, OX + NUG_AT.x * T + 2, OY + NUG_AT.y * T + 2 + Math.round(Math.sin(s.clock * 5)), { G: GOLD, L: "#ffffff" });
      }
      // Haters (and BEARMANPIG)
      for (const h of s.haters) {
        const x = px(h) + 0.5;
        const y = py(h) + 0.5;
        if (h.mode === "home" && h.style === 4 && s.mode === "ready") continue;
        if (h.mode === "eyes") drawPixels(ctx, HATER_EYES, x, y, { W: "#ffffff", K: INK });
        else if (h.mode === "scared") {
          const ending = s.scared < 1.5 && Math.floor(s.clock * 8) % 2 === 0;
          drawPixels(ctx, HATER_SCARED, x, y, { U: ending ? "#ffffff" : PURPLE, W: ending ? PURPLE : "#ffffff" });
        } else if (h.style === 4) drawPixels(ctx, BEAR, x, y, { B: "#6b3a1e", P: "#ff8ad8", D: DARK_PINK, K: INK, W: "#ffffff" });
        else drawPixels(ctx, HATER, x, y, { G: HATER_COLORS[h.style], K: INK, W: "#ffffff" });
      }
      // The turn you asked for that hasn't happened yet: a little blinking pink arrow on that side of you
      const pl = s.player;
      if (s.mode === "running" && !same(pl.next, pl.dir) && Math.floor(s.clock * 8) % 2 === 0) {
        const ax = Math.round(px(pl) + 3.5 + pl.next.x * 7);
        const ay = Math.round(py(pl) + 3.5 + pl.next.y * 7);
        ctx.fillStyle = PINK;
        ctx.fillRect(ax - 1, ay - 1, 3, 3);
        ctx.fillRect(ax + pl.next.x * 2 - (pl.next.y ? 2 : 0), ay + pl.next.y * 2 - (pl.next.x ? 2 : 0), pl.next.y ? 5 : 1, pl.next.x ? 5 : 1);
      }
      // You (hidden while exploding)
      if (s.mode === "ready" || s.mode === "running") {
        const frame = s.player.prog > 0 && Math.floor(s.munch * 10) % 2 === 1 ? 1 : 0;
        drawFace(ctx, px(s.player) + 0.5, py(s.player) + 0.5, frame, arc.shop.wearingName("skin"));
      }
      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      ctx.restore();

      // HUD: score / level / best on the top strip, lives down the left column, this game's seeds on the right
      ctx.font = `8px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      if (s.mode !== "ready") {
        ctx.textAlign = "left";
        ctx.fillText(pad(s.score), 24, 4);
        ctx.textAlign = "center";
        ctx.fillText(`LV ${s.level}`, W / 2, 4);
        ctx.textAlign = "right";
        ctx.fillText(`HI ${pad(s.best)}`, W - 6, 4);
      }
      if (playing() || s.mode === "dying") {
        for (let i = 0; i < Math.min(s.lives, 8); i++) drawFace(ctx, 14, 70 + i * 10, 0, arc.shop.wearingName("skin"));
        seedIcon(ctx, W - 22, 40);
        ctx.fillStyle = INK;
        ctx.textAlign = "center";
        ctx.fillText(String(s.run), W - 18, 52);
      }
      for (const pop of s.popups) {
        ctx.textAlign = "center";
        ctx.fillStyle = pop.text === "500" ? "#b08800" : PURPLE;
        ctx.fillText(pop.text, pop.x, pop.y);
      }
      ctx.textAlign = "center";
      if (s.mode === "running" && s.flash > 0) textBox(s.flashText, 86);

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "EAT ALL THE SEEDS",
          lines: [
            [isTouch() ? "SWIPE ANYWHERE TO STEER" : "ARROWS = STEER", "#ffffff"],
            ["LEAF = HATERS GET SCARED", KIT.lilac],
            ["WATCH OUT: BEARMANPIG", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${pad(top.score)}` : s.best > 0 ? `BEST ${pad(s.best)}` : undefined,
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS   - / + = FX VOLUME",
        });
        arc.drawPanels(ctx, s.clock);
      }
      if (s.mode === "over") {
        drawOverScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          age: s.t,
          title: "GAME OVER",
          score: `SCORE ${pad(s.score)}`,
          best: `BEST ${pad(s.best)}`,
          newBest: s.newBest,
          stats: `LEVEL ${s.level}`,
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} SEEDS SAVED`,
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
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") steer(0, -1);
      if (k === "ArrowDown" || k === "s" || k === "S") steer(0, 1);
      if (k === "ArrowLeft" || k === "a" || k === "A") steer(-1, 0);
      if (k === "ArrowRight" || k === "d" || k === "D") steer(1, 0);
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);

    // ---------- COMPUTER mouse: click = start / pause menu / shop, drag = steer ----------
    const toGame = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    let mouseSwipe: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return; // (fingers: see the swipe code below)
      const g = toGame(e.clientX, e.clientY);
      if (arc.tap(g.x, g.y)) return;
      if (arc.frozen()) return;
      mouseSwipe = { x: e.clientX, y: e.clientY };
      if (s.mode !== "running") press();
    };
    const onMove = (e: PointerEvent) => {
      if (arc.dragging()) arc.drag(toGame(e.clientX, e.clientY).y);
    };
    const onUp = (e: PointerEvent) => {
      if (arc.dragging()) {
        arc.drag(-1);
        return;
      }
      if (e.pointerType !== "mouse") return;
      const start = mouseSwipe;
      mouseSwipe = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 15) return;
      if (Math.abs(dx) > Math.abs(dy)) steer(dx > 0 ? 1 : -1, 0);
      else steer(0, dy > 0 ? 1 : -1);
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // ---------- PHONES: swipe ANYWHERE on the screen to steer (the small EXIT / PAUSE / music buttons and the round pad still work).
    // The turn happens the moment your finger has slid SWIPE_PX, you don't have to lift it. A tap = start / play again.
    const onUi = (t: EventTarget | null) =>
      t instanceof Element && !!t.closest("button, a, input, select, textarea, [role='button'], [role='slider'], [role='group']");
    const sw = { x: 0, y: 0, on: false, fired: false, id: -1, last: "" };
    const tStart = (e: TouchEvent) => {
      if (sw.on || onUi(e.target)) return;
      if (boardRef.current?.busy()) return; // the Top 10 box: leave the touch alone
      const t = e.changedTouches[0];
      if (!isTouch()) {
        const r = canvas.getBoundingClientRect();
        const M = 40;
        if (t.clientX < r.left - M || t.clientX > r.right + M || t.clientY < r.top - M || t.clientY > r.bottom + M) return;
      }
      const g = toGame(t.clientX, t.clientY);
      if (arc.tap(g.x, g.y) || arc.frozen()) {
        if (e.cancelable) e.preventDefault();
        sw.id = t.identifier;
        sw.on = arc.dragging(); // (dragging the FX slider)
        sw.fired = true;
        return;
      }
      sw.x = t.clientX;
      sw.y = t.clientY;
      sw.on = true;
      sw.fired = false;
      sw.id = t.identifier;
      sw.last = "";
      if (e.cancelable) e.preventDefault(); // no double-tap zoom / page scrolling
    };
    const find = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) if (e.changedTouches[i].identifier === sw.id) return e.changedTouches[i];
      return null;
    };
    const tMove = (e: TouchEvent) => {
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      if (e.cancelable) e.preventDefault();
      if (arc.dragging()) {
        arc.drag(toGame(t.clientX, t.clientY).y);
        return;
      }
      const dx = t.clientX - sw.x;
      const dy = t.clientY - sw.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
      sw.x = t.clientX;
      sw.y = t.clientY;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
      if (dir === sw.last) return; // one long swipe = one turn
      sw.last = dir;
      sw.fired = true;
      if (dir === "right") steer(1, 0);
      else if (dir === "left") steer(-1, 0);
      else if (dir === "down") steer(0, 1);
      else steer(0, -1);
    };
    const tEnd = (e: TouchEvent) => {
      if (!sw.on) return;
      const t = find(e);
      if (!t) return;
      sw.on = false;
      if (arc.dragging()) {
        arc.drag(-1);
        return;
      }
      // a tap (no swipe) on the start / game over screen = play
      if (e.type === "touchend" && !sw.fired && s.mode !== "running") press();
    };
    window.addEventListener("touchstart", tStart, { passive: false });
    window.addEventListener("touchmove", tMove, { passive: false });
    window.addEventListener("touchend", tEnd);
    window.addEventListener("touchcancel", tEnd);
    const onHidden = () => {
      if (document.hidden && playing()) arc.setPause(true);
    };
    document.addEventListener("visibilitychange", onHidden);

    newGame();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (arc.frozen()) spinRef.current = 0;
      else update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyFirst, true);
      window.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("touchstart", tStart);
      window.removeEventListener("touchmove", tMove);
      window.removeEventListener("touchend", tEnd);
      window.removeEventListener("touchcancel", tEnd);
      document.removeEventListener("visibilitychange", onHidden);
      if (playing()) bankRun();
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
          background: SCREEN,
          touchAction: "none",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="maze" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} />
    </>
  );
}
