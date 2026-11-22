// THE GAME: runs the physics 60 times a second (on every screen), moves the camera and draws everything.
// Two looks: ASCII (everything drawn as coloured text characters) and PAPER (hand-drawn style). V switches.
// Reaching the door: a vortex twists the world into the door and sucks Pinkmane in like code.
// Starts on the LEVEL MAP (the same map as PINKMANE VOID's PINK LEVELS, in the ASCII look): walk to a stop, play it.
// A level opens when you beat the one before it. Best times are remembered. ESC = the same pause menu as every game.

import { CAMERA, FIXED_DT, PHYSICS as P } from "../config/physics";
import { Player, type Pad } from "../entities/player";
import { ASCII_LOOK, drawPlayer, LOOK, type Look } from "../entities/drawPlayer";
import type { LevelData } from "../levels/types";
import { AsciiLayer, PLAYER_STYLE, WORLD_STYLE, type Liquid, type Warp } from "./ascii";
import { Camera } from "./camera";
import { Input } from "./input";
import { Terrain } from "./terrain";

type LookName = "ascii" | "paper";
const LOOK_KEY = "pinkrush-look"; // the look you picked is remembered
const BEST_KEY = "pinkrush-best"; // your best time on each level

// the colours of each look. In the ASCII look, brightness decides the character (dark = empty, bright = #)
type Theme = {
  bg: string; // behind everything
  swirl: string; // the soft swirls in the background
  ground: string;
  groundLip: string; // the band along the top of the ground
  groundEdge: string; // the line on top
  block: string;
  blockEdge: string;
  crate: string; // boxes you jump over
  danger: string; // spikes, saws, enemies
  gold: string; // launch rings
  bubble: string;
  wind: string;
  pink: string;
  springBase: string;
  boosterBase: string;
  signCard: string;
  signEdge: string;
  signText: string;
  door: string;
  hudText: string;
  code: string[]; // the colours of the code flying into the vortex
  look: Look;
};
const THEMES: Record<LookName, Theme> = {
  paper: {
    bg: "#efe6da",
    swirl: "rgba(120, 96, 92, 0.075)",
    ground: "#2b2440",
    groundLip: "#3d3358",
    groundEdge: "#16111d",
    block: "#3a3150",
    blockEdge: "#16111d",
    crate: "#5a4a3a",
    danger: "#e0303a",
    gold: "#e0a800",
    bubble: "#38b6e8",
    wind: "rgba(56, 182, 232, 0.5)",
    pink: "#ff3bd0",
    springBase: "#16111d",
    boosterBase: "#16111d",
    signCard: "#fffaf2",
    signEdge: "#16111d",
    signText: "#16111d",
    door: "#16111d",
    hudText: "#16111d",
    code: ["#ff3bd0", "#16111d", "#7a5cff"],
    look: LOOK,
  },
  ascii: {
    bg: "#0d0a18", // (dark enough that the sky stays empty: only things you can touch get characters)
    swirl: "rgba(120, 100, 220, 0.28)",
    ground: "#3a3270",
    groundLip: "#7466c8",
    groundEdge: "#f4f0ff",
    block: "#3b3274",
    blockEdge: "#efeaff",
    crate: "#2a2040",
    danger: "#ff4a4a",
    gold: "#ffd23c",
    bubble: "#7df9ff",
    wind: "rgba(125, 249, 255, 0.55)",
    pink: "#ff3bd0",
    springBase: "#e2dcff",
    boosterBase: "#2e2752",
    signCard: "#0a0812",
    signEdge: "#cfc6ff",
    signText: "#ffffff",
    door: "#0a0812",
    hudText: "#ece6ff",
    code: ["#ff3bd0", "#ffffff", "#a99cff", "#ff8be6"],
    look: ASCII_LOOK,
  },
};
const ASCII_SCREEN: [number, number, number] = [7, 6, 12]; // the screen behind the characters
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const ASCII_RATIO = 1.55; // a character is this much taller than wide
const WORLD_COLUMNS = 165; // about how many world characters fit across the screen
const PLAYER_ROWS = 12; // Pinkmane is about this many characters tall
const ASCII_MAX_PIXELS = 3_000_000; // big sharp screens draw the ASCII look at fewer real pixels (keeps it at 60 fps)

// THE DOOR VORTEX (seconds)
const VORTEX = {
  suck: 1.15, // how long Pinkmane takes to get pulled in
  build: 1.4, // how long the swirl takes to reach full strength
  card: 1.55, // when the "done" card starts typing
  radius: 210, // how far the swirl reaches (world px)
  twist: 7, // how tightly it twists (radians in the middle)
  pull: 2.3, // how hard it pulls everything in
  zoomIn: 0.78, // the camera moves in this much
};
const CODE_CHARS = "01<>/\\{}[];=+*#$&%01010110";

type Bit = { a: number; r: number; c: string; col: string; age: number }; // one flying code character

// THE LEVEL MAP (like PINKMANE VOID's): stops joined by a winding path, on a 336 x 160 map.
// path = the corners walked on the way TO that stop from the one before. (On a tall phone screen the map turns on its side.)
type MapIcon = "leaf" | "spring" | "tower" | "tunnel" | "bolt" | "bug" | "loop" | "ring" | "fan" | "saw" | "bubble" | "arrows" | "cloud" | "skull" | "vortex";
const MAP_W = 336; // how much of the map fits on the screen
const MAP_H = 160;
const MAP_TOTAL_W = 1116; // the whole map (it scrolls along with you)
const MAP_NODES: { x: number; y: number; icon: MapIcon; badge: string; path: [number, number][] }[] = [
  { x: 36, y: 124, icon: "leaf", badge: "#6fdc5a", path: [] },
  { x: 104, y: 124, icon: "spring", badge: "#bfe8ff", path: [] },
  { x: 104, y: 64, icon: "tower", badge: "#b06ce0", path: [] },
  { x: 176, y: 64, icon: "tunnel", badge: "#ff9a3c", path: [] },
  { x: 176, y: 124, icon: "bolt", badge: "#ffd23c", path: [] },
  { x: 248, y: 124, icon: "bug", badge: "#ffb0b0", path: [] },
  { x: 248, y: 58, icon: "loop", badge: "#8fe0c8", path: [] },
  { x: 320, y: 58, icon: "ring", badge: "#5a4fb4", path: [] },
  { x: 320, y: 118, icon: "fan", badge: "#bfe8ff", path: [] },
  { x: 392, y: 118, icon: "saw", badge: "#c6b9d6", path: [] },
  { x: 392, y: 54, icon: "bubble", badge: "#2f6fd0", path: [] },
  { x: 464, y: 54, icon: "arrows", badge: "#6fdc5a", path: [] },
  { x: 464, y: 120, icon: "cloud", badge: "#7ab8ff", path: [] },
  { x: 536, y: 120, icon: "skull", badge: "#8a1820", path: [] },
  { x: 622, y: 84, icon: "vortex", badge: "#ff5fe0", path: [[622, 120]] }, // big: FINAL RUN
  { x: 700, y: 40, icon: "bolt", badge: "#ff3bd0", path: [[622, 40]] }, // EXTRA (opens when you've beaten the final run)
  // PART 2: levels 17 - 26, harder
  { x: 700, y: 120, icon: "bolt", badge: "#ffd23c", path: [] },
  { x: 772, y: 120, icon: "cloud", badge: "#7ab8ff", path: [] },
  { x: 772, y: 56, icon: "saw", badge: "#c6b9d6", path: [] },
  { x: 844, y: 56, icon: "bubble", badge: "#2f6fd0", path: [] },
  { x: 844, y: 124, icon: "tower", badge: "#b06ce0", path: [] },
  { x: 916, y: 124, icon: "arrows", badge: "#6fdc5a", path: [] },
  { x: 916, y: 56, icon: "ring", badge: "#5a4fb4", path: [] },
  { x: 988, y: 56, icon: "skull", badge: "#8a1820", path: [] },
  { x: 988, y: 120, icon: "tower", badge: "#3a1f5a", path: [] },
  { x: 1074, y: 84, icon: "vortex", badge: "#ff2fc8", path: [[1074, 120]] }, // big: PINK APOCALYPSE
];
const MAP_WALK_SPEED = 95; // map units per second (like VOID)
// the boxes / menus every game shares (PinkShop.ts): VOID's pale green, ink and pink
const UI = { screen: "#d7efbc", ink: "#111111", pink: "#d63cc8" };
const PAUSE_ROWS = ["RESUME", "RESTART", "LEVEL MAP", "GAME MENU"] as const;
const OPEN_GAMES_KEY = "pinkmane-open-games"; // GAME MENU: the site opens its game list when you go back
const hash = (k: number) => {
  const v = Math.sin(k * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const smooth = (u: number) => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

export class Game {
  private ctx: CanvasRenderingContext2D;
  private dctx: CanvasRenderingContext2D; // what we're drawing on right now (the screen, or an ASCII layer)
  private input = new Input();
  private terrain: Terrain;
  private player: Player;
  private cam = new Camera();
  private raf = 0;
  private last = 0;
  private acc = 0;
  private clock = 0; // real seconds the game has been playing
  private paused = false;
  private debug = false;
  private visAngle = 0; // the drawn tilt (eases toward the ground's angle)
  private fps = 60;
  private started = false;
  private runTime = 0;
  private finished = false;
  private warpT = -1; // seconds since you touched the door (-1 = not yet)
  private warpFrom: [number, number] = [0, 0];
  private bits: Bit[] = [];
  private levels: LevelData[];
  private levelIndex = 0;
  private level!: LevelData;
  private mode: "select" | "play" = "select";
  private selectT = 0; // (the level scrolling by behind the level select)
  private mapWalk: { pts: [number, number][]; d: number; to: number } | null = null;
  private mapTarget = -1; // tapped a stop further away: keep walking until you get there
  private mapGuy = new Player(0, 0); // Pinkmane on the map
  private mapCamX = 0; // how far the map has scrolled
  private flash = 0; // a message on the map / in the game ("LOCKED ...")
  private flashText = "";
  private pauseRow = 0;
  private stuckT = 0; // pushing against something for this long: show a tip
  private stuckTip = "";
  private boardShown = false; // this run's time has gone to the scoreboard
  // the moving things of the level
  private foes: { x: number; y: number; dir: number; dead: number; t: number }[] = [];
  private ringCool: number[] = [];
  private bubbleCool: number[] = [];
  private ride: { i: number; a: number; s: number } | null = null; // running round a loop (a = how far round, s = speed)
  private pops: { x: number; y: number; t: number }[] = []; // little bursts (an enemy beaten, a bubble popped)
  private hurtT = 0; // just got hurt: a red flash, and nothing can hurt you for a moment
  private mouse: { x: number; y: number } | null = null; // the mouse over the map (the liquid code follows it)
  private mouseIn = false;
  private mouseK = 0; // how strong the liquid is right now (fades in / out)
  // THE SCOREBOARD (the page connects these to the Top 10 boxes, one per level)
  onLevelDone: (level: number, seconds: number) => void = () => {}; // a level was beaten: offer its Top 10
  onShowBoard: (level: number) => void = () => {}; // just look at a level's Top 10
  isBusy: () => boolean = () => false; // a Top 10 box is open: the game ignores keys
  // GAME MENU on the pause menu (on its own page: back to the site and open the game list; on the PSP: the page swaps this)
  onGameMenu: () => void = () => {
    try {
      sessionStorage.setItem(OPEN_GAMES_KEY, "1");
    } catch {}
    window.location.href = "/";
  };
  private ro: ResizeObserver | null = null;
  private viewBase: number = CAMERA.viewHeight; // how much world fits top to bottom (less on small screens, so Pinkmane isn't tiny)
  topOf: (level: number) => { name: string; time: number } | null = () => null; // the #1 on a level's board
  private best: Record<string, number> = {};
  private newBest = false;
  private checkpoint = -1; // the last flag you passed (-1 = none)
  private levelT = 0; // seconds since this level started (for the level name banner)
  private springCool: number[] = [];
  private springSquash: number[] = [];
  private groundFill: Path2D[] = [];
  private groundTop: Path2D[] = [];
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;
  private touch = false;
  private lookName: LookName = "ascii";
  private worldLayer: AsciiLayer | null = null;
  private playerLayer: AsciiLayer | null = null;

  // startLevel = jump straight into that level (0 = the first); leave it out to start on the level select
  constructor(
    private canvas: HTMLCanvasElement,
    levels: LevelData[],
    private font: string,
    startLevel?: number,
    private pixelFont: string = "monospace", // the games' pixel font (menus, map boxes)
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    this.ctx = ctx;
    this.dctx = ctx;
    this.levels = levels;
    const first = startLevel !== undefined && startLevel >= 0 && startLevel < levels.length ? startLevel : 0;
    this.mode = startLevel !== undefined ? "play" : "select";
    this.terrain = new Terrain(levels[first]);
    this.player = new Player(levels[first].spawn[0], levels[first].spawn[1]);
    this.loadLevel(first);
    this.touch = !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(any-pointer: fine)").matches;
    try {
      const saved = localStorage.getItem(LOOK_KEY);
      if (saved === "paper" || saved === "ascii") this.lookName = saved;
      const b = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
      if (b && typeof b === "object") this.best = b;
    } catch {}
  }

  // set up a level: its ground, springs, flags ... (and put Pinkmane at its start)
  private loadLevel(i: number) {
    this.levelIndex = i;
    const level = this.levels[i];
    this.level = level;
    this.terrain = new Terrain(level);
    this.player = new Player(level.spawn[0], level.spawn[1]);
    this.springCool = level.springs.map(() => 0);
    this.springSquash = level.springs.map(() => 0);
    this.groundFill = [];
    this.groundTop = [];
    // the ground's shapes, made once
    for (const pts of this.terrain.paths) {
      const fill = new Path2D();
      const top = new Path2D();
      fill.moveTo(pts[0][0], pts[0][1]);
      top.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        fill.lineTo(pts[i][0], pts[i][1]);
        top.lineTo(pts[i][0], pts[i][1]);
      }
      const deep = level.bounds.bottom + 600;
      fill.lineTo(pts[pts.length - 1][0], deep);
      fill.lineTo(pts[0][0], deep);
      fill.closePath();
      this.groundFill.push(fill);
      this.groundTop.push(top);
    }
    this.restart();
  }

  private startLevel(i: number) {
    this.loadLevel(i);
    this.mode = "play";
    this.input.clearPresses();
  }

  private goSelect() {
    this.mode = "select";
    this.paused = false;
    this.selectT = 0;
    this.mapWalk = null;
    this.mapTarget = -1;
    this.input.clearPresses();
    this.restart();
  }

  // a level is open when you've beaten the one before it
  private isOpen(i: number) {
    return i === 0 || this.best[this.levels[i - 1].name] !== undefined;
  }

  // a click / tap: pick a level card, or go on to the next level
  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.isBusy()) return;
    if (this.mode === "select") {
      const tb = this.topBtn();
      if (x >= tb.x && x <= tb.x + tb.w && y >= tb.y && y <= tb.y + tb.h) return this.onShowBoard(this.levelIndex);
      // tap a stop: walk there (tap the one you're on = play it)
      const m = this.mapFrame();
      const hit = MAP_NODES.findIndex((n) => {
        const [sx, sy] = this.m2s(m, n.x, n.y);
        return Math.hypot(x - sx, y - sy) < (n.icon === "vortex" ? 20 : 16) * m.u;
      });
      if (hit < 0 || this.mapWalk) return;
      if (hit === this.levelIndex) this.playPick();
      else {
        this.mapTarget = hit;
        this.walkToward(hit);
      }
      return;
    }
    if (this.paused) {
      const row = this.pauseTapRow(y);
      if (row >= 0) {
        this.pauseRow = row;
        this.pauseChoose();
      }
      return;
    }
    if (this.finished && this.warpT >= VORTEX.card + 0.4) return this.nextLevel();
    const b = this.pauseBtn();
    if (x >= b.x - 8 && x <= b.x + b.w + 8 && y >= b.y - 8 && y <= b.y + b.h + 8) this.pause();
  };

  // the mouse moving over the map
  private onMove = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
    this.mouseIn = e.pointerType === "mouse"; // (a finger lifting off shouldn't leave a puddle behind)
  };
  private onLeave = () => {
    this.mouseIn = false;
  };

  private pause() {
    if (this.mode !== "play" || this.paused) return;
    this.paused = true;
    this.pauseRow = 0;
    this.input.clearPresses();
  }

  // the pause menu (the same one as every game): RESUME / RESTART / LEVEL MAP / GAME MENU
  private pauseChoose() {
    const pick = PAUSE_ROWS[this.pauseRow];
    this.paused = false;
    this.input.clearPresses();
    if (pick === "RESTART") this.restart();
    else if (pick === "LEVEL MAP") this.goSelect();
    else if (pick === "GAME MENU") this.onGameMenu();
  }

  // after the done card: back to the map, standing on the stop you just beat (walk on to the next one yourself, like VOID)
  private nextLevel() {
    this.goSelect();
    if (this.levelIndex + 1 < this.levels.length) {
      this.flash = 2.2;
      this.flashText = `LVL ${this.levelIndex + 2} IS OPEN!`;
    }
  }

  start() {
    this.resize();
    window.addEventListener("resize", this.resize);
    // (inside the PSP the screen changes size without the window changing: FULL SCREEN)
    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(this.canvas);
    }
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointerdown", this.onPointer);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { pinkRush?: Game }).pinkRush = this; // (for testing from the browser console)
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.ro?.disconnect();
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.input.destroy();
  }

  // a quick look at the player (for testing)
  get state() {
    const p = this.player;
    return { x: p.x, y: p.y, gsp: p.gsp, vx: p.vx, vy: p.vy, onGround: p.onGround, pose: p.pose, angle: p.angle, finished: this.finished, time: this.runTime, warp: this.warpT, level: this.levelIndex, mode: this.mode, checkpoint: this.checkpoint, wallDir: p.wallDir };
  }

  // the tab is hidden or the window lost focus: pause
  private onHide = () => {
    if (document.hidden) this.pause();
  };
  private onBlur = () => {
    this.pause();
  };

  private resize = () => {
    const r = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    const sharp = Math.min(2.5, window.devicePixelRatio || 1);
    this.dpr = this.lookName === "ascii" ? Math.min(sharp, Math.max(1, Math.sqrt(ASCII_MAX_PIXELS / (this.viewW * this.viewH)))) : sharp;
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    // a small screen (a phone, the PSP's screen): zoom in, so Pinkmane is at least ~26 px tall
    const was = this.viewBase;
    this.viewBase = Math.max(380, Math.min(CAMERA.viewHeight, (this.viewH / 26) * P.height));
    if (this.cam.viewHeight === was || this.warpT < 0) this.cam.viewHeight = this.warpT >= 0 ? this.viewBase * VORTEX.zoomIn : this.viewBase;
    this.setupLook();
  };

  // make (or resize) the ASCII layers
  private setupLook() {
    if (this.lookName !== "ascii") return;
    if (!this.worldLayer) this.worldLayer = new AsciiLayer(WORLD_STYLE);
    if (!this.playerLayer) this.playerLayer = new AsciiLayer(PLAYER_STYLE);
    const W = this.viewW;
    const H = this.viewH;
    const cell = Math.min(11, Math.max(6.5, W / WORLD_COLUMNS));
    this.worldLayer.resize(W, H, this.dpr, cell, ASCII_RATIO);
    // Pinkmane's characters: small enough that he's always about PLAYER_ROWS characters tall
    const heightOnScreen = P.height * this.cam.baseZoom(W, H);
    const pcell = Math.min(cell / 1.3, Math.max(2.6, heightOnScreen / PLAYER_ROWS / ASCII_RATIO));
    this.playerLayer.resize(W, H, this.dpr, pcell, ASCII_RATIO);
  }

  private switchLook() {
    this.lookName = this.lookName === "ascii" ? "paper" : "ascii";
    try {
      localStorage.setItem(LOOK_KEY, this.lookName);
    } catch {}
    this.resize();
  }

  private restart() {
    this.player.respawn(this.level.spawn[0], this.level.spawn[1]);
    this.cam.viewHeight = this.viewBase;
    this.cam.snap(this.player.x, this.player.y, this.viewW, this.viewH);
    this.started = false;
    this.finished = false;
    this.warpT = -1;
    this.bits = [];
    this.runTime = 0;
    this.visAngle = 0;
    this.checkpoint = -1;
    this.newBest = false;
    this.boardShown = false;
    this.levelT = 0;
    this.runClock = 0;
    this.foes = (this.level.enemies ?? []).map((e, i) => ({ x: e.x, y: e.y, dir: i % 2 ? 1 : -1, dead: 0, t: i * 1.7 }));
    this.ringCool = (this.level.rings ?? []).map(() => 0);
    this.bubbleCool = (this.level.bubbles ?? []).map(() => 0);
    this.ride = null;
    this.pops = [];
    this.hurtT = 0;
  }

  // touched something nasty: back to the last flag
  private hurt() {
    if (this.hurtT > 0) return;
    this.ride = null;
    this.respawn();
    this.hurtT = 1;
  }
  private sawPos(s: NonNullable<LevelData["saws"]>[number]): [number, number] {
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
    const u = (((this.runClock * (s.speed ?? 260)) / len + (s.phase ?? 0)) % 2 + 2) % 2;
    const k = u < 1 ? u : 2 - u;
    return [s.x1 + (s.x2 - s.x1) * k, s.y1 + (s.y2 - s.y1) * k];
  }
  private loopCool = 0; // (just came out of a loop: don't go straight back in)
  private runClock = 0; // seconds of physics since the level was loaded (the saws and bats move by this)

  // running round a loop, upside down at the top
  private rideLoop(dt: number) {
    const r = this.ride;
    const p = this.player;
    const L = this.level.loops?.[r?.i ?? -1];
    if (!r || !L) return;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevRunPhase = p.runPhase;
    r.s = Math.max(460, Math.min(P.maxSpeed, r.s - P.gravity * 0.5 * Math.sin(r.a) * dt));
    r.a += (r.s / L.r) * dt;
    p.gsp = r.s;
    p.onGround = true;
    p.sliding = false;
    p.pose = "run";
    p.facing = 1;
    p.runPhase += Math.min(19, 3 + r.s / 62) * dt;
    if (r.a >= Math.PI * 2) {
      p.x = L.x + 2;
      p.y = L.y;
      p.angle = 0;
      p.vx = r.s;
      p.vy = 0;
      this.visAngle += Math.PI * 2;
      this.ride = null;
      this.loopCool = 0.25;
      return;
    }
    p.x = L.x + L.r * Math.sin(r.a);
    p.y = L.y - L.r + L.r * Math.cos(r.a);
    p.angle = -r.a;
    p.vx = r.s * Math.cos(r.a);
    p.vy = -r.s * Math.sin(r.a);
  }

  // loops, rings, bubbles, wind, spikes, saws and enemies
  private stepThings(dt: number, jumpHeld: boolean) {
    const p = this.player;
    const lv = this.level;
    const h = p.sliding ? P.slideHeight : P.height;
    const cy = p.y - h / 2;
    this.hurtT = Math.max(0, this.hurtT - dt);
    for (const q of this.pops) q.t += dt;
    this.pops = this.pops.filter((q) => q.t < 0.35);
    // loops: fast enough = round you go
    this.loopCool = Math.max(0, this.loopCool - dt);
    (lv.loops ?? []).forEach((L, i) => {
      if (!this.ride && this.loopCool <= 0 && p.onGround && p.gsp >= 480 && p.prevX < L.x && p.x >= L.x && Math.abs(p.y - L.y) < 26) this.ride = { i, a: 0, s: p.gsp };
    });
    if (this.ride) return;
    // rings: shot where the arrow points
    (lv.rings ?? []).forEach((r, i) => {
      this.ringCool[i] = Math.max(0, this.ringCool[i] - dt);
      if (this.ringCool[i] > 0 || Math.hypot(p.x - r.x, cy - r.y) > 62) return;
      const a = (r.angle * Math.PI) / 180;
      const pw = r.power ?? 1250;
      p.x = r.x;
      p.y = r.y + P.height / 2;
      p.launch(Math.cos(a) * pw, Math.sin(a) * pw);
      this.ringCool[i] = 0.45;
    });
    // bubbles: a bounce
    (lv.bubbles ?? []).forEach((b, i) => {
      this.bubbleCool[i] = Math.max(0, this.bubbleCool[i] - dt);
      if (this.bubbleCool[i] > 0 || Math.hypot(p.x - b.x, cy - b.y) > 56) return;
      p.x = b.x;
      p.y = b.y + P.height / 2;
      p.launch(p.vx, -900);
      this.bubbleCool[i] = 0.9;
      this.pops.push({ x: b.x, y: b.y, t: 0 });
    });
    // wind: carries you up
    for (const f of lv.fans ?? []) {
      if (p.x < f.x || p.x > f.x + f.w || cy < f.y || cy > f.y + f.h) continue;
      if (p.onGround) p.launch(p.gsp * Math.cos(p.angle), -280);
      p.vy = Math.max(-760, p.vy - (f.power ?? 4300) * dt);
    }
    // spikes
    for (const sp of lv.spikes ?? []) {
      const top = sp.ceil ? sp.y : sp.y - 22;
      if (p.x + P.halfWidth - 3 > sp.x && p.x - P.halfWidth + 3 < sp.x + sp.w && p.y > top + 3 && p.y - h < top + 22 - 3) this.hurt();
    }
    // saws
    for (const sw of lv.saws ?? []) {
      const [sx, sy] = this.sawPos(sw);
      const nx = Math.max(p.x - P.halfWidth, Math.min(sx, p.x + P.halfWidth));
      const ny = Math.max(p.y - h, Math.min(sy, p.y));
      if (Math.hypot(nx - sx, ny - sy) < (sw.r ?? 34) - 5) this.hurt();
    }
    // enemies
    (lv.enemies ?? []).forEach((e, i) => {
      const f = this.foes[i];
      f.t += dt;
      if (f.dead > 0) {
        f.dead -= dt;
        if (f.dead <= 0 && e.type !== "bat") f.dead = 1e9; // (only bats come back: you may need them to get across)
        return;
      }
      const range = e.range ?? 0;
      if (e.type === "bat") {
        f.x = e.x + Math.sin(f.t * 1.3) * range;
        f.y = e.y + Math.sin(f.t * 2.2) * 26;
      } else {
        f.x += f.dir * (e.speed ?? 110) * dt;
        if (f.x > e.x + range) f.dir = -1;
        if (f.x < e.x - range) f.dir = 1;
        const g = this.terrain.groundBelow(f.x, f.y - 40, f.y + 40);
        if (g) f.y = g.y;
        else f.dir = -f.dir;
      }
      const bat = e.type === "bat";
      const top = bat ? f.y - 18 : f.y - 42;
      const bottom = bat ? f.y + 18 : f.y;
      if (p.x + P.halfWidth < f.x - 24 || p.x - P.halfWidth > f.x + 24 || p.y < top || p.y - h > bottom) return;
      const smash = Math.abs(p.onGround ? p.gsp : p.vx) > 1150;
      const fromAbove = !p.onGround && p.vy > 0 && p.prevY <= top + 16;
      const beat = () => {
        f.dead = bat ? 2.5 : 1e9;
        this.pops.push({ x: f.x, y: (top + bottom) / 2, t: 0 });
      };
      if (p.stomping || smash || (p.sliding && p.onGround && !bat)) beat();
      else if (fromAbove && e.type !== "spiker") {
        beat();
        p.launch(p.vx, bat ? (jumpHeld ? -980 : -820) : jumpHeld ? -P.jumpSpeed : -560);
      } else this.hurt();
    });
  }

  // fell out of the level: back at the last flag you passed (or the start)
  private respawn() {
    const cp = this.level.checkpoints?.[this.checkpoint];
    const [x, y] = cp ? [cp.x, cp.y] : this.level.spawn;
    this.player.respawn(x, y);
    this.cam.snap(x, y, this.viewW, this.viewH);
  }

  private saveBest() {
    const name = this.level.name;
    const old = this.best[name];
    if (old === undefined || this.runTime < old - 1e-6) {
      this.best[name] = this.runTime;
      this.newBest = true;
      try {
        localStorage.setItem(BEST_KEY, JSON.stringify(this.best));
      } catch {}
    }
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const inp = this.input;
    inp.pollGamepad();
    if (this.isBusy()) {
      // a Top 10 box is open on top: keys belong to it
      inp.clearPresses();
      this.clock += dt;
      this.render(1, this.mode === "play" ? dt : 0);
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    if (inp.take("debug")) this.debug = !this.debug;
    if (inp.take("look")) this.switchLook();
    this.flash = Math.max(0, this.flash - dt);
    if (this.mode === "select") {
      // THE LEVEL MAP: arrows / WASD walk along the path, SPACE / ENTER play the stop you're on
      for (const k of inp.takeKeys()) {
        if (k === "ArrowLeft" || k === "a" || k === "A") this.mapMove(-1, 0);
        else if (k === "ArrowRight" || k === "d" || k === "D") this.mapMove(1, 0);
        else if (k === "ArrowUp" || k === "w" || k === "W") this.mapMove(0, -1);
        else if (k === "ArrowDown" || k === "s" || k === "S") this.mapMove(0, 1);
        else if (k === "Enter" || k === " " || k === "z" || k === "Z") this.playPick();
        else if (k === "t" || k === "T") this.onShowBoard(this.levelIndex);
      }
      inp.clearPresses();
      this.updateMap(dt);
      this.selectT += dt;
      this.clock += dt;
      this.render(1, dt);
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    const keys = inp.takeKeys();
    if (this.paused) {
      // THE PAUSE MENU: ↑ ↓ pick, OK / SPACE choose, ESC / P = back to the game
      for (const k of keys) {
        if (k === "ArrowUp" || k === "w" || k === "W") this.pauseRow = (this.pauseRow + PAUSE_ROWS.length - 1) % PAUSE_ROWS.length;
        else if (k === "ArrowDown" || k === "s" || k === "S") this.pauseRow = (this.pauseRow + 1) % PAUSE_ROWS.length;
        else if (k === "Enter" || k === " ") {
          this.pauseChoose();
          break;
        } else if (k === "Escape" || k === "p" || k === "P") {
          this.paused = false;
          inp.clearPresses();
          break;
        }
      }
      if (this.paused) inp.clearPresses();
      this.acc = 0;
      this.render(0, 0);
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    if (inp.take("pause")) this.pause();
    if (inp.take("restart")) this.restart();
    if (inp.take("menu")) {
      this.goSelect();
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    // the time goes to the level's Top 10 once the done card is up
    if (this.finished && !this.boardShown && this.warpT >= VORTEX.card + 1.1) {
      this.boardShown = true;
      this.onLevelDone(this.levelIndex, this.runTime);
    }
    // the done card: SPACE / ENTER = back to the map
    if (this.finished && this.warpT >= VORTEX.card + 0.4 && (inp.take("jump") || inp.take("confirm"))) this.nextLevel();
    if (this.paused) {
      this.acc = 0;
    } else {
      this.acc += dt;
      let n = 0;
      while (this.acc >= FIXED_DT && n < 8) {
        this.step(FIXED_DT);
        this.acc -= FIXED_DT;
        n++;
      }
      if (n === 8) this.acc = 0; // (the computer fell way behind: skip ahead rather than run in slow motion)
      this.clock += dt;
      this.levelT += dt;
    }
    this.render(this.acc / FIXED_DT, this.paused ? 0 : dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  // ======================= ONE PHYSICS STEP (1/60 s) =======================
  private step(dt: number) {
    const inp = this.input;
    const p = this.player;
    if (this.finished) {
      // in the vortex: he's not running any more (presses are thrown away)
      inp.take("jump");
      inp.take("down");
      p.prevX = p.x;
      p.prevY = p.y;
      p.prevRunPhase = p.runPhase;
      return;
    }
    const pad: Pad = {
      dir: (inp.held("right") ? 1 : 0) - (inp.held("left") ? 1 : 0),
      down: inp.held("down"),
      downPressed: inp.take("down"),
      jump: inp.held("jump"),
      jumpPressed: inp.take("jump"),
    };
    this.runClock += dt;
    if (this.ride) this.rideLoop(dt);
    else p.update(dt, pad, this.terrain);
    this.stepThings(dt, pad.jump);
    // pushing against something and not moving: work out what to do and show a tip
    if (pad.dir !== 0 && Math.abs(p.gsp) < 5 && p.onGround && !p.sliding) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) this.stuckTip = this.tipFor(p.x + pad.dir * (P.halfWidth + 8), p.y);
    } else if (pad.dir !== 0 && p.wallDir !== 0 && p.vy > 0) {
      this.stuckT += dt;
      if (this.stuckT > 1.2 && !this.stuckTip) this.stuckTip = "JUMP AGAIN WHILE ON THE WALL = WALL JUMP";
    } else {
      this.stuckT = Math.max(0, this.stuckT - dt * 2);
      if (this.stuckT === 0) this.stuckTip = "";
    }

    // springs
    this.level.springs.forEach((s, i) => {
      this.springCool[i] = Math.max(0, this.springCool[i] - dt);
      this.springSquash[i] = Math.max(0, this.springSquash[i] - dt * 4);
      if (this.springCool[i] > 0) return;
      if (Math.abs(p.x - s.x) < (s.w ?? 52) / 2 && p.y > s.y - 42 && p.y < s.y + 8) {
        const a = ((s.angle ?? -90) * Math.PI) / 180;
        const power = s.power ?? P.springPower;
        const straightUp = Math.abs((s.angle ?? -90) + 90) < 5;
        const keepX = p.onGround ? p.gsp * Math.cos(p.angle) : p.vx;
        p.launch(straightUp ? keepX : Math.cos(a) * power, Math.sin(a) * power);
        this.springCool[i] = 0.3;
        this.springSquash[i] = 1;
      }
    });
    // boosters
    for (const b of this.level.boosters) {
      if (p.onGround && p.x >= b.x && p.x <= b.x + b.w && Math.abs(p.y - b.y) < 26) p.boost(b.dir, b.speed ?? P.boosterSpeed);
    }
    // flags: passing one = that's where you come back if you fall out
    const cps = this.level.checkpoints ?? [];
    for (let i = this.checkpoint + 1; i < cps.length; i++) {
      if (Math.abs(p.x - cps[i].x) < 70 && Math.abs(p.y - cps[i].y) < 300) this.checkpoint = i;
    }
    // fell out of the level
    if (p.y > this.terrain.bottom) this.respawn();
    // the timer starts when you move
    if (!this.started && (p.speed > 1 || !p.onGround)) this.started = true;
    if (this.started) this.runTime += dt;
    // the finish door: the time stops and the vortex starts
    const f = this.level.finish;
    if (Math.abs(p.x - f[0]) < 40 && p.y > f[1] - 320 && p.y < f[1] + 40) {
      this.finished = true;
      this.saveBest();
      this.warpT = 0;
      this.warpFrom = [p.x, p.y];
      p.pose = "fall"; // (arms flailing)
      this.cam.viewHeight = this.viewBase * VORTEX.zoomIn;
    }
  }

  // what's in front of him: a gap under it (slide), something low (jump over) or a tall wall (wall jump)
  private tipFor(fx: number, y: number) {
    const t = this.terrain;
    if (!t.solidAt(fx, y - 12) && t.solidAt(fx, y - 52)) return "↓ = SLIDE UNDER IT";
    let h = 20;
    while (h <= 420 && t.solidAt(fx, y - h)) h += 10;
    if (h <= 230) return "HOLD JUMP = HIGHER · JUMP OVER IT";
    return "JUMP AT THE WALL, THEN JUMP AGAIN OFF IT";
  }

  // ======================= THE LEVEL MAP =======================
  // where the map goes on the screen (u = screen px per map unit). On a tall screen it turns on its side.
  private mapFrame() {
    const W = this.viewW;
    const H = this.viewH;
    const tall = H > W * 1.15;
    if (tall) {
      const u = Math.min(W / MAP_H, (H - 70) / MAP_W);
      return { u, tall, ox: (W - MAP_H * u) / 2, oy: H - MAP_W * u - 12 };
    }
    const u = Math.min(W / MAP_W, H / MAP_H);
    return { u, tall, ox: (W - MAP_W * u) / 2, oy: (H - MAP_H * u) / 2 };
  }
  private m2s(m: { u: number; tall: boolean; ox: number; oy: number }, x0: number, y: number): [number, number] {
    const x = x0 - this.mapCamX;
    return m.tall ? [m.ox + y * m.u, m.oy + x * m.u] : [m.ox + x * m.u, m.oy + y * m.u];
  }
  // the points walked from stop `from` to the next / previous stop `to` (map units)
  private mapPath(from: number, to: number): [number, number][] {
    const A = MAP_NODES[from];
    const B = MAP_NODES[to];
    if (to === from + 1) return [[A.x, A.y], ...B.path, [B.x, B.y]];
    return [[A.x, A.y], ...[...A.path].reverse(), [B.x, B.y]];
  }
  private lockedFlash(i: number) {
    this.flash = 1.6;
    this.flashText = `LOCKED - BEAT LVL ${i} FIRST`;
  }
  // arrows on the map: walk along the path that leaves your stop that way (→ / ← also just mean next / back)
  private mapMove(dx: number, dy: number) {
    if (this.mapWalk) return;
    this.mapTarget = -1;
    const here = this.levelIndex;
    const tall = this.mapFrame().tall;
    let go = -1;
    for (const to of [here + 1, here - 1]) {
      if (to < 0 || to >= MAP_NODES.length) continue;
      const pts = this.mapPath(here, to);
      let sx = Math.sign(pts[1][0] - pts[0][0]);
      let sy = Math.sign(pts[1][1] - pts[0][1]);
      if (tall) [sx, sy] = [sy, sx];
      if ((dx !== 0 && sx === dx) || (dy !== 0 && sy === dy)) go = to;
    }
    if (go < 0 && dx !== 0) go = here + dx;
    if (go < 0 || go >= MAP_NODES.length) return;
    this.walkTo(go);
  }
  private walkTo(to: number) {
    if (!this.isOpen(to)) {
      this.mapTarget = -1;
      return this.lockedFlash(to);
    }
    this.mapWalk = { pts: this.mapPath(this.levelIndex, to), d: 0, to };
  }
  private walkToward(target: number) {
    if (target === this.levelIndex) return;
    this.walkTo(this.levelIndex + (target > this.levelIndex ? 1 : -1));
  }
  private playPick() {
    if (this.mapWalk) return;
    if (this.isOpen(this.levelIndex)) this.startLevel(this.levelIndex);
    else this.lockedFlash(this.levelIndex);
  }
  private updateMap(dt: number) {
    const w = this.mapWalk;
    const g = this.mapGuy;
    g.prevRunPhase = g.runPhase;
    // the map scrolls so you stay in view
    const camTo = Math.max(0, Math.min(MAP_TOTAL_W - MAP_W, this.mapPos().x - MAP_W / 2));
    this.mapCamX = this.selectT === 0 ? camTo : this.mapCamX + (camTo - this.mapCamX) * ease(5, dt);
    if (!w) {
      g.pose = "idle";
      g.gsp = 0;
      return;
    }
    g.pose = "run";
    g.gsp = 520;
    g.runPhase += 13 * dt;
    w.d += MAP_WALK_SPEED * dt;
    let total = 0;
    for (let i = 1; i < w.pts.length; i++) total += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
    if (w.d >= total) {
      this.levelIndex = w.to;
      this.mapWalk = null;
      if (this.mapTarget >= 0 && this.mapTarget !== this.levelIndex) this.walkToward(this.mapTarget);
      else this.mapTarget = -1;
    }
  }
  // where you are on the map (walking or standing), and which way you're going (screen direction)
  private mapPos(): { x: number; y: number; face: number } {
    const w = this.mapWalk;
    const tall = this.mapFrame().tall;
    if (!w) {
      const n = MAP_NODES[this.levelIndex];
      return { x: n.x, y: n.y, face: this.mapGuy.facing || 1 };
    }
    let d = w.d;
    for (let i = 1; i < w.pts.length; i++) {
      const [x0, y0] = w.pts[i - 1];
      const [x1, y1] = w.pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (d <= len || i === w.pts.length - 1) {
        const k = len > 0 ? Math.min(1, d / len) : 1;
        const along = tall ? y1 - y0 : x1 - x0;
        const face = along < 0 ? -1 : along > 0 ? 1 : this.mapGuy.facing || 1;
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, face };
      }
      d -= len;
    }
    const n = MAP_NODES[w.to];
    return { x: n.x, y: n.y, face: 1 };
  }

  // the grass, the path (drawn on ctx in screen px)
  private drawMapGround(ctx: CanvasRenderingContext2D, ascii: boolean) {
    const W = this.viewW;
    const H = this.viewH;
    const m = this.mapFrame();
    const u = m.u;
    ctx.fillStyle = ascii ? "#123a1d" : "#7cc86a";
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 90; k++) {
      ctx.fillStyle = ascii ? (k % 2 ? "#215f2c" : "#1a4d25") : k % 2 ? "#6cb85c" : "#8cd87a";
      ctx.fillRect(Math.round((((hash(k) * W - this.mapCamX * u * (m.tall ? 0 : 1)) % W) + W) % W), Math.round((((hash(k + 50) * H - this.mapCamX * u * (m.tall ? 1 : 0)) % H) + H) % H), (6 + Math.round(hash(k + 9) * 10)) * u * 0.6, 3 * u * 0.6);
    }
    // little weed leaves bobbing in the grass
    for (let k = 0; k < 12; k++) {
      const lx = hash(k + 200) * W;
      const ly = hash(k + 300) * H + Math.sin(this.clock * 2 + k) * u;
      this.drawLeaf(ctx, lx, ly, 5 * u, ascii ? "#2f7d36" : "#4e9e44");
    }
    // the path: dots, pale when you can walk it, grey when it's locked
    for (let i = 1; i < MAP_NODES.length; i++) {
      const pts = this.mapPath(i - 1, i);
      const open = this.isOpen(i);
      for (let j = 1; j < pts.length; j++) {
        const [x0, y0] = pts[j - 1];
        const [x1, y1] = pts[j];
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = 0; d <= len; d += 6) {
          const [px, py] = this.m2s(m, x0 + ((x1 - x0) * d) / len, y0 + ((y1 - y0) * d) / len);
          ctx.fillStyle = UI.ink;
          ctx.fillRect(px - 2.5 * u, py - 2.5 * u, 5 * u, 5 * u);
          ctx.fillStyle = open ? "#f2dea0" : "#7d8270";
          ctx.fillRect(px - 1.5 * u, py - 1.5 * u, 3 * u, 3 * u);
        }
      }
    }
  }

  private drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string) {
    ctx.fillStyle = col;
    for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) {
      const len = r * (1 - Math.abs(a) * 0.35);
      ctx.beginPath();
      ctx.ellipse(x + Math.sin(a) * len * 0.55, y - Math.cos(a) * len * 0.55, len * 0.18, len * 0.55, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillRect(x - r * 0.06, y, r * 0.12, r * 0.45);
  }

  // the stops: a round badge with the level's picture (grey + a padlock when it's locked, a gold star when beaten)
  private drawMapStops(ctx: CanvasRenderingContext2D) {
    const m = this.mapFrame();
    const u = m.u;
    MAP_NODES.forEach((n, i) => {
      const [x, y] = this.m2s(m, n.x, n.y);
      const open = this.isOpen(i);
      const done = this.best[this.levels[i]?.name ?? ""] !== undefined;
      const big = n.icon === "vortex";
      const r = (big ? 14 : 11) * u;
      ctx.fillStyle = UI.ink;
      ctx.beginPath();
      ctx.arc(x, y, r + u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = open ? n.badge : "#8a8a8a";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (open) this.drawMapIcon(ctx, n.icon, x, y, u);
      else {
        // padlock
        ctx.fillStyle = UI.ink;
        ctx.fillRect(x - 4.5 * u, y - u, 9 * u, 7 * u);
        ctx.strokeStyle = UI.ink;
        ctx.lineWidth = 1.6 * u;
        ctx.beginPath();
        ctx.arc(x, y - 1.5 * u, 3.2 * u, Math.PI, 0);
        ctx.stroke();
        ctx.fillStyle = "#ffd23c";
        ctx.fillRect(x - 0.6 * u, y + u, 1.2 * u, 2.5 * u);
      }
      if (done) {
        // gold star: beaten
        const sx = x + r * 0.75;
        const sy = y - r * 0.8;
        ctx.fillStyle = UI.ink;
        this.star(ctx, sx, sy, 5 * u);
        ctx.fillStyle = "#ffd700";
        this.star(ctx, sx, sy, 3.6 * u);
      }
    });
  }

  private star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  private drawMapIcon(ctx: CanvasRenderingContext2D, icon: MapIcon, x: number, y: number, u: number) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (icon === "leaf") this.drawLeaf(ctx, x, y + 2 * u, 8 * u, "#1f6b2a");
    else if (icon === "spring") {
      ctx.strokeStyle = UI.ink;
      ctx.lineWidth = 1.6 * u;
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(x + (k % 2 ? 4 : -4) * u, y + (5 - k * 2.4) * u);
      ctx.stroke();
      ctx.fillStyle = "#ff3bd0";
      ctx.fillRect(x - 6 * u, y - 7.5 * u, 12 * u, 3 * u);
      ctx.fillStyle = UI.ink;
      ctx.fillRect(x - 5 * u, y + 5 * u, 10 * u, 2 * u);
    } else if (icon === "tower") {
      ctx.fillStyle = "#3a1f5a";
      ctx.fillRect(x - 4 * u, y - 5 * u, 8 * u, 13 * u);
      for (let k = 0; k < 3; k++) ctx.fillRect(x - 5 * u + k * 4 * u, y - 8 * u, 2 * u, 3 * u);
      ctx.fillStyle = "#ffd23c";
      ctx.fillRect(x - u, y - 2 * u, 2 * u, 3 * u);
    } else if (icon === "tunnel") {
      ctx.fillStyle = "#6b3a12";
      ctx.fillRect(x - 8 * u, y - 6 * u, 16 * u, 13 * u);
      ctx.fillStyle = UI.ink;
      ctx.beginPath();
      ctx.moveTo(x - 5 * u, y + 7 * u);
      ctx.lineTo(x - 5 * u, y);
      ctx.arc(x, y, 5 * u, Math.PI, 0);
      ctx.lineTo(x + 5 * u, y + 7 * u);
      ctx.fill();
    } else if (icon === "bolt") {
      ctx.fillStyle = UI.ink;
      ctx.beginPath();
      ctx.moveTo(x + 2 * u, y - 8 * u);
      ctx.lineTo(x - 5 * u, y + u);
      ctx.lineTo(x - u, y + u);
      ctx.lineTo(x - 2 * u, y + 8 * u);
      ctx.lineTo(x + 5 * u, y - u);
      ctx.lineTo(x + u, y - u);
      ctx.closePath();
      ctx.fill();
    } else if (icon === "bug") {
      ctx.fillStyle = "#c01828";
      ctx.beginPath();
      ctx.ellipse(x, y, 7 * u, 5.5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x - 4 * u, y - 3 * u, 2.5 * u, 3 * u);
      ctx.fillRect(x + 1.5 * u, y - 3 * u, 2.5 * u, 3 * u);
    } else if (icon === "loop" || icon === "ring" || icon === "bubble") {
      ctx.strokeStyle = icon === "ring" ? "#ffd23c" : icon === "bubble" ? "#7df9ff" : UI.ink;
      ctx.lineWidth = 2.4 * u;
      ctx.beginPath();
      ctx.arc(x, y, 6 * u, 0, Math.PI * 2);
      ctx.stroke();
      if (icon === "loop") ctx.fillRect(x - 9 * u, y + 6 * u, 18 * u, 1.6 * u);
    } else if (icon === "fan") {
      ctx.strokeStyle = "#2f6fd0";
      ctx.lineWidth = 2 * u;
      for (const k of [-4, 0, 4]) {
        ctx.beginPath();
        ctx.moveTo(x + k * u, y + 7 * u);
        ctx.lineTo(x + k * u, y - 5 * u + Math.abs(k) * 0.5 * u);
        ctx.stroke();
      }
    } else if (icon === "saw") {
      ctx.fillStyle = "#c01828";
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + this.clock * 3;
        const rr = (k % 2 ? 5 : 8) * u;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
    } else if (icon === "arrows") {
      ctx.fillStyle = UI.ink;
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x + d * 8 * u, y + d * 3 * u);
        ctx.lineTo(x + d * 2 * u, y + d * 3 * u - 4 * u);
        ctx.lineTo(x + d * 2 * u, y + d * 3 * u + 4 * u);
        ctx.fill();
        ctx.fillRect(x - 6 * u, y + d * 3 * u - u, 12 * u, 2 * u);
      }
    } else if (icon === "cloud") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 4 * u, y + u, 4 * u, 0, Math.PI * 2);
      ctx.arc(x + u, y - 2 * u, 5 * u, 0, Math.PI * 2);
      ctx.arc(x + 5 * u, y + 2 * u, 3 * u, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon === "skull") {
      ctx.fillStyle = "#ece6d6";
      ctx.beginPath();
      ctx.arc(x, y - u, 6.5 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 4 * u, y + 3 * u, 8 * u, 4 * u);
      ctx.fillStyle = UI.ink;
      ctx.fillRect(x - 4 * u, y - 3 * u, 3 * u, 3.5 * u);
      ctx.fillRect(x + u, y - 3 * u, 3 * u, 3.5 * u);
    } else {
      // the vortex
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      for (let k = 0; k <= 60; k++) {
        const a = k * 0.32 - this.clock * 3;
        const rr = (k / 60) * 10 * u;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Pinkmane standing / walking on the map (ctx already set up so that 1 = 1 screen px)
  private drawMapGuy(ctx: CanvasRenderingContext2D, look: Look) {
    const m = this.mapFrame();
    const me = this.mapPos();
    const [x, y] = this.m2s(m, me.x, me.y);
    const g = this.mapGuy;
    g.facing = me.face;
    const sc = (27 * m.u) / 84;
    ctx.save();
    ctx.translate(x, y - 4 * m.u + (this.mapWalk ? 0 : Math.sin(this.clock * 3) * m.u * 0.6));
    ctx.scale(sc, sc);
    drawPlayer(ctx, g, 0, 0, 0, this.clock, look, { phase: g.runPhase });
    ctx.restore();
  }

  // the whole map screen
  private renderMap(dt: number) {
    const W = this.viewW;
    const H = this.viewH;
    const th = THEMES[this.lookName];
    const m = this.mapFrame();
    const wl = this.worldLayer;
    const pl = this.playerLayer;
    if (this.lookName === "ascii" && wl && pl) {
      // Pinkmane's characters: about 13 rows tall on the map
      const want = Math.max(2.6, (27 * m.u) / 13 / ASCII_RATIO);
      if (Math.abs(want - pl.cell) / pl.cell > 0.12) pl.resize(W, H, this.dpr, want, ASCII_RATIO);
      // the grass + path in big characters
      wl.anchor(0, 0);
      const [wax, way, wbx, wby] = wl.sceneMatrix();
      wl.sctx.setTransform(wax, 0, 0, way, wbx, wby);
      this.drawMapGround(wl.sctx, true);
      // the stops + Pinkmane in small, sharp characters
      pl.anchor(0, 0);
      const [pax, pay, pbx, pby] = pl.sceneMatrix();
      const pc = pl.sctx;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, pl.cols, pl.rows);
      pc.setTransform(pax, 0, 0, pay, pbx, pby);
      this.drawMapStops(pc);
      this.drawMapGuy(pc, th.look);
      // the green code spells PINKMANE (rows scrolling both ways); around the mouse it turns to liquid
      this.mouseK += ((this.mouseIn ? 1 : 0) - this.mouseK) * ease(this.mouseIn ? 6 : 3, Math.max(dt, 1 / 60));
      const liquid: Liquid | null = this.mouse && this.mouseK > 0.01 ? { x: this.mouse.x, y: this.mouse.y, r: Math.max(90, 26 * m.u), t: this.clock, k: this.mouseK, maxLum: 0.3 } : null;
      wl.compose(this.ctx, { background: ASCII_SCREEN, text: { chars: "PINKMANE", maxLum: 0.3, shift: Math.floor(this.clock * 4) }, liquid });
      pl.compose(this.ctx, {});
    } else {
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawMapGround(ctx, false);
      this.drawMapStops(ctx);
      this.drawMapGuy(ctx, th.look);
    }
    // the boxes on top (VOID style)
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ui = this.uiScale();
    for (const [ni, label] of [[14, "FINAL RUN"], [MAP_NODES.length - 1, "APOCALYPSE"]] as [number, string][]) {
      const big = MAP_NODES[ni];
      const [bx, by] = this.m2s(m, big.x, big.y);
      ctx.font = `${Math.round(7 * ui)}px ${this.pixelFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = UI.ink;
      ctx.fillText(label, bx + ui, by + 17 * m.u + ui);
      ctx.fillStyle = "#ff2fc8";
      ctx.fillText(label, bx, by + 17 * m.u);
    }
    if (!this.mapWalk) {
      const i = this.levelIndex;
      const lv = this.levels[i];
      const best = this.best[lv.name];
      this.uiBox(`LVL ${i + 1}: ${lv.name}`, 6 * ui, false);
      const narrow = this.viewW < 560; // (a phone: keep the boxes short so they don't run into the TOP 10 button)
      this.uiBox(best !== undefined ? (narrow ? `BEST ${fmtTime(best)}` : `BEST ${fmtTime(best)}  -  OK TO PLAY`) : "OK TO PLAY", 18 * ui, false);
    }
    if (this.flash > 0) this.uiBox(this.flashText, 34 * ui, true);
    // TOP 10 button (top right) + the #1 on this level's board
    {
      const tb = this.topBtn();
      ctx.fillStyle = UI.ink;
      ctx.fillRect(tb.x, tb.y, tb.w, tb.h);
      ctx.fillStyle = UI.pink;
      ctx.fillRect(tb.x + ui, tb.y + ui, tb.w - 2 * ui, tb.h - 2 * ui);
      ctx.font = `${Math.round(7 * ui)}px ${this.pixelFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(this.touch ? "TOP 10" : "T: TOP 10", tb.x + tb.w / 2, tb.y + tb.h / 2 + ui * 0.5);
      const top = this.topOf(this.levelIndex);
      if (top && !this.mapWalk && this.viewW >= 560) {
        ctx.font = `${Math.round(6 * ui)}px ${this.pixelFont}`;
        ctx.textAlign = "right";
        ctx.textBaseline = "top";
        const line = `#1 ${top.name} ${fmtTime(top.time)}`;
        ctx.fillStyle = UI.ink;
        ctx.fillText(line, tb.x + tb.w + ui, tb.y + tb.h + 4 * ui + ui);
        ctx.fillStyle = "#ffd700";
        ctx.fillText(line, tb.x + tb.w, tb.y + tb.h + 4 * ui);
      }
    }
    if (Math.floor(this.clock * 2) % 2 === 0) {
      const tip = this.touch ? "TAP A STOP TO WALK, TAP AGAIN TO PLAY" : "ARROWS / WASD TO WALK, SPACE TO PLAY";
      ctx.font = `${Math.round(7 * ui)}px ${this.pixelFont}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = UI.ink;
      ctx.fillText(tip, W / 2 + ui, H - 14 * ui + ui, W - 20);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(tip, W / 2, H - 14 * ui, W - 20);
    }
  }

  // the TOP 10 button on the map (top right)
  private topBtn() {
    const ui = this.uiScale();
    const w = (this.touch ? 52 : 66) * ui;
    return { x: this.viewW - w - 12, y: 12, w, h: 14 * ui };
  }

  // the size of the shared menus / boxes (they're drawn for a 336 x 160 screen, like the other games)
  private uiScale() {
    return Math.max(1.05, Math.min(4, Math.min(this.viewW / MAP_W, this.viewH / MAP_H)));
  }
  // a little box with text in it, centred (pink when it's the picked row) - the same as every game's
  private uiBox(text: string, y: number, picked: boolean, pad = 10) {
    const ctx = this.ctx;
    const ui = this.uiScale();
    ctx.font = `${Math.round(8 * ui)}px ${this.pixelFont}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const w = Math.min(this.viewW - 8, ctx.measureText(text).width + pad * ui);
    ctx.fillStyle = picked ? UI.pink : UI.screen;
    ctx.fillRect(Math.round(this.viewW / 2 - w / 2), y - 2 * ui, Math.round(w), 12 * ui);
    ctx.fillStyle = picked ? "#ffffff" : UI.ink;
    ctx.fillText(text, this.viewW / 2, y, w - 4);
  }
  // the pause menu's top (it sits in a 160-tall box in the middle of the screen)
  private pauseTop() {
    return (this.viewH - MAP_H * this.uiScale()) / 2;
  }
  private pauseTapRow(y: number) {
    const ui = this.uiScale();
    const r = Math.floor((y - this.pauseTop() - 40 * ui) / (14 * ui));
    return r >= 0 && r < PAUSE_ROWS.length ? r : -1;
  }
  private drawPauseMenu() {
    const ctx = this.ctx;
    const W = this.viewW;
    const H = this.viewH;
    const ui = this.uiScale();
    const top = this.pauseTop();
    ctx.fillStyle = "rgba(22, 12, 29, 0.7)";
    ctx.fillRect(0, 0, W, H);
    this.uiBox("PAUSED", top + 26 * ui, false, 8);
    PAUSE_ROWS.forEach((label, i) => {
      const picked = i === this.pauseRow;
      this.uiBox((picked ? "> " : "") + label, top + (42 + i * 14) * ui, picked);
    });
    const stats = `LVL ${this.levelIndex + 1} ${this.level.name}  ${fmtTime(this.runTime)}`;
    const sy = top + (42 + PAUSE_ROWS.length * 14 + 4) * ui;
    ctx.font = `${Math.round(8 * ui)}px ${this.pixelFont}`;
    ctx.fillStyle = UI.ink;
    ctx.fillText(stats, W / 2 + ui, sy + ui, W - 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(stats, W / 2, sy, W - 20);
    if (Math.floor(this.clock * 2) % 2 === 0) this.uiBox(this.touch ? "TAP TO CHOOSE" : "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", top + (160 - 28) * ui, false, 8);
  }
  // the little II button (top right): tap / click = pause
  private pauseBtn() {
    const k = this.uiScale() * 0.85;
    const w = 13 * k;
    return { x: this.viewW - 14 - w, y: 12, w, h: 11 * k, k };
  }
  private drawPauseButton() {
    const ctx = this.ctx;
    const b = this.pauseBtn();
    ctx.fillStyle = UI.ink;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = UI.pink;
    ctx.fillRect(b.x + b.k, b.y + b.k, b.w - 2 * b.k, b.h - 2 * b.k);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(b.x + 4 * b.k, b.y + 3 * b.k, 2 * b.k, 5 * b.k);
    ctx.fillRect(b.x + 7 * b.k, b.y + 3 * b.k, 2 * b.k, 5 * b.k);
  }

  // ======================= DRAWING =======================
  // the world -> the canvas we draw on. a, b = screen px -> that canvas (scale, offset)
  private worldTransform(c: CanvasRenderingContext2D, ax: number, ay: number, bx = 0, by = 0) {
    const z = this.cam.zoom;
    c.setTransform(ax * z, 0, 0, ay * z, ax * (this.viewW / 2 - this.cam.x * z) + bx, ay * (this.viewH / 2 - this.cam.y * z) + by);
  }
  private toScreen(x: number, y: number): [number, number] {
    const z = this.cam.zoom;
    return [this.viewW / 2 + (x - this.cam.x) * z, this.viewH / 2 + (y - this.cam.y) * z];
  }
  private doorCentre(): [number, number] {
    const [fx, fy] = this.level.finish;
    return [fx, fy - 55];
  }

  private render(alpha: number, dt: number) {
    if (this.mode === "select") return this.renderMap(dt);
    const W = this.viewW;
    const H = this.viewH;
    const p = this.player;
    const th = THEMES[this.lookName];
    const z0 = this.cam.zoom;
    // where he is right now, between the last two physics steps (smooth on any screen)
    let px = p.prevX + (p.x - p.prevX) * alpha;
    let py = p.prevY + (p.y - p.prevY) * alpha;
    const phase = p.prevRunPhase + (p.runPhase - p.prevRunPhase) * alpha;
    const want = p.onGround ? p.angle : 0;
    this.visAngle += (want - this.visAngle) * ease(p.onGround ? 20 : 8, dt);

    // the vortex: he gets pulled into the door, shrinking and spinning
    let scale = 1;
    let spin = 0;
    const warping = this.warpT >= 0;
    if (warping) {
      this.warpT += dt;
      this.updateBits(dt);
      const [cx, cy] = this.doorCentre();
      const q = smooth(this.warpT / VORTEX.suck);
      px = this.warpFrom[0] + (cx - this.warpFrom[0]) * q;
      py = this.warpFrom[1] + (cy + 30 - this.warpFrom[1]) * q;
      scale = 1 - smooth((this.warpT - 0.12) / (VORTEX.suck - 0.12));
      spin = this.warpT * this.warpT * 9;
      this.cam.update(dt, cx, cy + 40, 0, 0, 0, W, H);
    } else this.cam.update(dt, px, py, p.vx, p.vy, p.speed, W, H);
    const showPlayer = true;
    const z = this.cam.zoom;
    if (this.lookName === "ascii" && Math.abs(z - z0) > 1e-4 && this.worldLayer && this.playerLayer) {
      // (the camera zooms out at speed: keep Pinkmane's characters about the same count)
      const want2 = Math.min(this.worldLayer.cell / 1.3, Math.max(2.6, (P.height * z) / PLAYER_ROWS / ASCII_RATIO));
      if (Math.abs(want2 - this.playerLayer.cell) / this.playerLayer.cell > 0.12) this.playerLayer.resize(W, H, this.dpr, want2, ASCII_RATIO);
    }
    const extra = { phase, scale, spin };

    const wl = this.worldLayer;
    const pl = this.playerLayer;
    if (this.lookName === "ascii" && wl && pl) {
      // the swirl (screen px)
      let warp: Warp | null = null;
      if (warping) {
        const [cx, cy] = this.toScreen(...this.doorCentre());
        const e = smooth(this.warpT / VORTEX.build);
        warp = { cx, cy, radius: VORTEX.radius * z, twist: VORTEX.twist * e, pull: VORTEX.pull * e };
      }
      // 1. the world, drawn small (its grid moves with the world), then turned into big characters
      wl.anchor(W / 2 - this.cam.x * z, H / 2 - this.cam.y * z);
      const [wax, way, wbx, wby] = wl.sceneMatrix();
      const w = wl.sctx;
      this.dctx = w;
      w.setTransform(1, 0, 0, 1, 0, 0);
      w.fillStyle = th.bg;
      w.fillRect(0, 0, wl.cols, wl.rows);
      w.setTransform(wax, 0, 0, way, wbx, wby);
      this.drawSwirls(W, H, th);
      this.worldTransform(w, wax, way, wbx, wby);
      this.drawWorld(th);
      // 2. Pinkmane, drawn on his own (his grid moves with him), then turned into small characters
      const [sxp, syp] = this.toScreen(px, py);
      pl.anchor(sxp, syp);
      const [pax, pay, pbx, pby] = pl.sceneMatrix();
      const pc = pl.sctx;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, pl.cols, pl.rows);
      this.worldTransform(pc, pax, pay, pbx, pby);
      drawPlayer(pc, p, px, py, this.visAngle, this.clock, th.look, extra);
      // 3. onto the screen
      const ctx = this.ctx;
      wl.compose(ctx, { background: ASCII_SCREEN, warp });
      if (showPlayer) pl.compose(ctx, { region: { x0: sxp - 80 * z, y0: syp - 130 * z, x1: sxp + 80 * z, y1: syp + 28 * z }, warp: warping ? warp : null });
      // 4. the words on signs stay sharp, on top
      this.dctx = ctx;
      this.worldTransform(ctx, this.dpr, this.dpr);
      this.drawSignText(th, true);
    } else {
      const ctx = this.ctx;
      this.dctx = ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, W, H);
      this.drawSwirls(W, H, th);
      this.worldTransform(ctx, this.dpr, this.dpr);
      this.drawWorld(th);
      this.drawSignText(th, false);
      drawPlayer(ctx, p, px, py, this.visAngle, this.clock, th.look, extra);
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (this.hurtT > 0.6) {
      this.ctx.fillStyle = `rgba(255, 60, 70, ${(this.hurtT - 0.6) * 1.1})`;
      this.ctx.fillRect(0, 0, W, H);
    }
    if (warping) this.drawBits(th);
    this.drawHud(W, H, th);
  }

  private drawWorld(th: Theme) {
    this.drawSigns(th);
    this.drawCheckpoints(th);
    this.drawGround(th);
    this.drawBlocks(th);
    this.drawFinish(th);
    this.drawBoosters(th);
    this.drawSprings(th);
    this.drawThings(th);
    if (this.warpT >= 0) this.drawVortex(th);
  }

  // loops, wind, rings, bubbles, spikes, saws, enemies
  private drawThings(th: Theme) {
    const ctx = this.dctx;
    const lv = this.level;
    const t = this.clock;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const L of lv.loops ?? []) {
      ctx.strokeStyle = th.groundLip;
      ctx.lineWidth = 26;
      ctx.beginPath();
      ctx.arc(L.x, L.y - L.r, L.r + 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = th.groundEdge;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(L.x, L.y - L.r, L.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const f of lv.fans ?? []) {
      // streaks of wind going up
      ctx.strokeStyle = th.wind;
      ctx.lineWidth = 7;
      const n = Math.max(2, Math.round(f.w / 70));
      for (let i = 0; i < n; i++) {
        const x = f.x + ((i + 0.5) * f.w) / n;
        for (let k = 0; k < 4; k++) {
          const u = ((t * 0.9 + i * 0.37 + k * 0.25) % 1 + 1) % 1;
          const y = f.y + f.h - u * f.h;
          ctx.globalAlpha = Math.sin(u * Math.PI) * 0.8;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y - 90);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = th.springBase;
      ctx.fillRect(f.x, f.y + f.h - 10, f.w, 10);
    }
    (lv.rings ?? []).forEach((r, i) => {
      const a = (r.angle * Math.PI) / 180;
      const k = 1 + (this.ringCool[i] > 0 ? this.ringCool[i] : 0);
      ctx.strokeStyle = th.gold;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 34 * k, 0, Math.PI * 2);
      ctx.stroke();
      // the arrow
      ctx.fillStyle = th.gold;
      ctx.beginPath();
      ctx.moveTo(r.x + Math.cos(a) * 24, r.y + Math.sin(a) * 24);
      ctx.lineTo(r.x + Math.cos(a + 2.4) * 16, r.y + Math.sin(a + 2.4) * 16);
      ctx.lineTo(r.x + Math.cos(a - 2.4) * 16, r.y + Math.sin(a - 2.4) * 16);
      ctx.closePath();
      ctx.fill();
    });
    (lv.bubbles ?? []).forEach((b, i) => {
      const c = this.bubbleCool[i];
      const k = c > 0 ? Math.max(0.15, 1 - c / 0.9) : 1;
      const y = b.y + Math.sin(t * 2 + i) * 4;
      ctx.fillStyle = th.bubble;
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.arc(b.x, y, 30 * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = th.bubble;
      ctx.lineWidth = 6;
      ctx.stroke();
    });
    for (const sp of lv.spikes ?? []) {
      ctx.fillStyle = th.danger;
      const n = Math.max(1, Math.round(sp.w / 26));
      const w = sp.w / n;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.moveTo(sp.x + i * w, sp.y);
        ctx.lineTo(sp.x + (i + 0.5) * w, sp.y + (sp.ceil ? 26 : -26));
        ctx.lineTo(sp.x + (i + 1) * w, sp.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const sw of lv.saws ?? []) {
      const [x, y] = this.sawPos(sw);
      const r = sw.r ?? 34;
      // the rail it rides on
      ctx.strokeStyle = th.groundLip;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(sw.x1, sw.y1);
      ctx.lineTo(sw.x2, sw.y2);
      ctx.stroke();
      ctx.fillStyle = th.danger;
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2 + t * 9;
        const rr = i % 2 ? r * 0.72 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = th.door;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.25, 0, Math.PI * 2);
      ctx.fill();
    }
    (lv.enemies ?? []).forEach((e, i) => {
      const f = this.foes[i];
      if (!f || f.dead > 0) return;
      if (e.type === "bat") {
        const flap = Math.sin(t * 16 + i) * 12;
        ctx.fillStyle = th.danger;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y, 16, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(f.x - 10, f.y);
        ctx.lineTo(f.x - 40, f.y - 8 + flap);
        ctx.lineTo(f.x - 22, f.y + 10);
        ctx.moveTo(f.x + 10, f.y);
        ctx.lineTo(f.x + 40, f.y - 8 + flap);
        ctx.lineTo(f.x + 22, f.y + 10);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(f.x - 9, f.y - 5, 6, 6);
        ctx.fillRect(f.x + 3, f.y - 5, 6, 6);
      } else {
        const step = Math.sin(f.t * 14) * 3;
        ctx.fillStyle = th.danger;
        ctx.beginPath();
        ctx.ellipse(f.x, f.y - 22, 24, 18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(f.x - 16, f.y - 8 + step, 9, 8);
        ctx.fillRect(f.x + 7, f.y - 8 - step, 9, 8);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(f.x + f.dir * 8 - 8, f.y - 30, 7, 8);
        ctx.fillRect(f.x + f.dir * 8 + 3, f.y - 30, 7, 8);
        if (e.type === "spiker") {
          ctx.fillStyle = "#ffffff";
          for (let k = -1; k <= 1; k++) {
            ctx.beginPath();
            ctx.moveTo(f.x + k * 14 - 7, f.y - 36);
            ctx.lineTo(f.x + k * 14, f.y - 58);
            ctx.lineTo(f.x + k * 14 + 7, f.y - 36);
            ctx.fill();
          }
        }
      }
    });
    for (const q of this.pops) {
      ctx.strokeStyle = th.pink;
      ctx.globalAlpha = 1 - q.t / 0.35;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(q.x, q.y, 14 + q.t * 220, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // big soft swirls in the background (they drift slower than the world: a far-away layer)
  private drawSwirls(W: number, H: number, th: Theme) {
    const ctx = this.dctx;
    ctx.save();
    ctx.strokeStyle = th.swirl;
    ctx.lineCap = "round";
    const period = 1400;
    const shift = (((-this.cam.x * 0.12) % period) + period) % period;
    for (let rep = -1; rep <= Math.ceil(W / period) + 1; rep++) {
      const ox = rep * period + shift - period;
      for (let i = 0; i < 4; i++) {
        const y0 = H * (0.15 + i * 0.22) - this.cam.y * 0.06;
        ctx.lineWidth = 46 + i * 14;
        ctx.beginPath();
        ctx.moveTo(ox + i * 160, y0);
        ctx.bezierCurveTo(ox + 350 + i * 90, y0 - 120, ox + 650, y0 + 140, ox + 1050 - i * 60, y0 - 30);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawGround(th: Theme) {
    const ctx = this.dctx;
    for (let i = 0; i < this.groundFill.length; i++) {
      ctx.fillStyle = th.ground;
      ctx.fill(this.groundFill[i]);
      // a lighter band just inside the top edge
      ctx.save();
      ctx.clip(this.groundFill[i]);
      ctx.strokeStyle = th.groundLip;
      ctx.lineWidth = 30;
      ctx.lineJoin = "round";
      ctx.stroke(this.groundTop[i]);
      ctx.restore();
      ctx.strokeStyle = th.groundEdge;
      ctx.lineWidth = 7;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(this.groundTop[i]);
    }
  }

  private drawBlocks(th: Theme) {
    const ctx = this.dctx;
    for (const b of this.terrain.blocks) {
      // a box standing on the ground (jump over it) looks like a crate with a pink X, so it never looks like a tunnel
      const crate = b.h <= 200 && b.w <= 260 && !!this.terrain.groundBelow(b.x + b.w / 2, b.y + b.h - 2, b.y + b.h + 12);
      ctx.fillStyle = crate ? th.crate : th.block;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      if (crate) {
        ctx.strokeStyle = th.pink;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(b.x + 8, b.y + 8);
        ctx.lineTo(b.x + b.w - 8, b.y + b.h - 8);
        ctx.moveTo(b.x + b.w - 8, b.y + 8);
        ctx.lineTo(b.x + 8, b.y + b.h - 8);
        ctx.stroke();
      }
      ctx.strokeStyle = crate ? th.pink : th.blockEdge;
      ctx.lineWidth = crate ? 8 : 6;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  private drawSprings(th: Theme) {
    const ctx = this.dctx;
    this.level.springs.forEach((s, i) => {
      const h = 18 + this.springSquash[i] * 10; // it shoots up when used, then settles
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.strokeStyle = th.springBase;
      ctx.lineWidth = 3.5;
      if (s.w) {
        // a wide trampoline (pit floors): a long pink pad on a row of springs
        const half = s.w / 2;
        const n = Math.max(2, Math.round(s.w / 70));
        for (let j = 0; j <= n; j++) {
          const cx = -half + 10 + ((s.w - 20) * j) / n;
          ctx.beginPath();
          for (let k = 0; k <= 4; k++) ctx.lineTo(cx + (k % 2 === 0 ? -7 : 7), -2 - (k / 4) * h);
          ctx.stroke();
        }
        ctx.fillStyle = th.pink;
        ctx.fillRect(-half, -h - 9, s.w, 8);
        ctx.strokeRect(-half, -h - 9, s.w, 8);
      } else {
        ctx.rotate(((s.angle ?? -90) + 90) * (Math.PI / 180));
        ctx.beginPath();
        for (let k = 0; k <= 4; k++) ctx.lineTo(k % 2 === 0 ? -9 : 9, -4 - (k / 4) * h);
        ctx.stroke();
        ctx.fillStyle = th.springBase;
        ctx.fillRect(-14, -5, 28, 5);
        ctx.fillStyle = th.pink;
        ctx.fillRect(-18, -h - 10, 36, 9);
        ctx.strokeRect(-18, -h - 10, 36, 9);
      }
      ctx.restore();
    });
  }

  private drawBoosters(th: Theme) {
    const ctx = this.dctx;
    for (const b of this.level.boosters) {
      ctx.fillStyle = th.boosterBase;
      ctx.fillRect(b.x, b.y - 8, b.w, 8);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y - 8, b.w, 8);
      ctx.clip();
      ctx.fillStyle = th.pink;
      const move = (this.clock * 90 * b.dir) % 22;
      for (let x = b.x - 22; x < b.x + b.w + 22; x += 22) {
        const cx = x + move;
        ctx.beginPath();
        ctx.moveTo(cx - 5 * b.dir, b.y - 7);
        ctx.lineTo(cx + 5 * b.dir, b.y - 4);
        ctx.lineTo(cx - 5 * b.dir, b.y - 1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private signFont(ascii: boolean) {
    return ascii ? `bold 17px ${MONO}` : `20px ${this.font}`;
  }

  // the sign boards (the words are drawn by drawSignText)
  private drawSigns(th: Theme) {
    const ctx = this.dctx;
    ctx.save();
    ctx.font = this.signFont(this.lookName === "ascii");
    for (const s of this.level.signs) {
      const w = ctx.measureText(s.text).width + 28;
      ctx.strokeStyle = th.signEdge;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 20);
      ctx.lineTo(s.x, s.y + 150);
      ctx.stroke();
      ctx.fillStyle = th.signCard;
      ctx.fillRect(s.x - w / 2, s.y - 20, w, 40);
      ctx.lineWidth = 4;
      ctx.strokeRect(s.x - w / 2, s.y - 20, w, 40);
    }
    ctx.restore();
  }

  private drawSignText(th: Theme, ascii: boolean) {
    const ctx = this.dctx;
    ctx.save();
    // (in the vortex the sharp words fade: the world is getting twisted under them)
    ctx.globalAlpha = this.warpT >= 0 ? 1 - smooth(this.warpT / 0.5) : 1;
    if (ctx.globalAlpha > 0.01) {
      ctx.font = this.signFont(ascii);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = th.signText;
      for (const s of this.level.signs) ctx.fillText(s.text, s.x, s.y + 1);
      const [fx, fy] = this.level.finish;
      ctx.font = ascii ? `bold 22px ${MONO}` : `22px ${this.font}`;
      ctx.fillStyle = th.pink;
      ctx.fillText("FINISH", fx, fy - 130);
    }
    ctx.restore();
  }

  // the flags (pink once you've passed them)
  private drawCheckpoints(th: Theme) {
    const ctx = this.dctx;
    const cps = this.level.checkpoints ?? [];
    cps.forEach((c, i) => {
      const on = i <= this.checkpoint && this.mode === "play";
      const wave = Math.sin(this.clock * 6 + i) * 5;
      ctx.strokeStyle = th.signEdge;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(c.x, c.y - 120);
      ctx.stroke();
      ctx.fillStyle = on ? th.pink : th.groundLip;
      ctx.beginPath();
      ctx.moveTo(c.x + 2, c.y - 120);
      ctx.lineTo(c.x + 48, c.y - 104 + wave);
      ctx.lineTo(c.x + 2, c.y - 86);
      ctx.closePath();
      ctx.fill();
    });
  }

  private drawFinish(th: Theme) {
    const ctx = this.dctx;
    const [fx, fy] = this.level.finish;
    ctx.fillStyle = th.door;
    ctx.fillRect(fx - 30, fy - 110, 60, 110);
    ctx.strokeStyle = th.pink;
    ctx.lineWidth = 7;
    ctx.strokeRect(fx - 30, fy - 110, 60, 110);
  }

  // the spinning arms of the vortex, around the door (in the ASCII look the whole picture also gets twisted)
  private drawVortex(th: Theme) {
    const ctx = this.dctx;
    const [cx, cy] = this.doorCentre();
    const t = this.warpT;
    const grow = smooth(t / 0.6);
    const arms = 6;
    const reach = VORTEX.radius * 1.35 * grow;
    ctx.save();
    ctx.lineCap = "round";
    for (let j = 0; j < arms; j++) {
      ctx.strokeStyle = j % 2 === 0 ? th.pink : th.code[1];
      let prev: [number, number] | null = null;
      for (let s = 0; s <= 1.0001; s += 0.05) {
        const r = 10 + s * reach;
        const a = (j / arms) * Math.PI * 2 + s * 3.4 - t * 5.5;
        const pt: [number, number] = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
        if (prev) {
          ctx.globalAlpha = grow * (1 - s * 0.75);
          ctx.lineWidth = 3 + 11 * (1 - s);
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(pt[0], pt[1]);
          ctx.stroke();
        }
        prev = pt;
      }
    }
    // the bright middle
    ctx.globalAlpha = grow;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 34);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.45, th.pink);
    g.addColorStop(1, "rgba(255, 59, 208, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // the code characters: they appear around the door and spiral in, faster and faster
  private updateBits(dt: number) {
    const th = THEMES[this.lookName];
    if (this.warpT < 1.3) {
      const n = Math.round(150 * dt + Math.random());
      for (let i = 0; i < n; i++)
        this.bits.push({
          a: Math.random() * Math.PI * 2,
          r: 230 + Math.random() * 380,
          c: CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0],
          col: th.code[(Math.random() * th.code.length) | 0],
          age: 0,
        });
    }
    for (const b of this.bits) {
      b.age += dt;
      const r = Math.max(1, b.r);
      b.a += (1.4 + 190 / (r + 20)) * dt;
      b.r -= (70 + 560 * (1 - Math.min(600, r) / 600) + 260 * smooth(this.warpT / 1.2)) * dt;
      if (Math.random() < dt * 4) b.c = CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; // (they flicker like code)
    }
    this.bits = this.bits.filter((b) => b.r > 8);
  }

  private drawBits(th: Theme) {
    const ctx = this.ctx;
    const [cx, cy] = this.doorCentre();
    const z = this.cam.zoom;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const b of this.bits) {
      const [x, y] = this.toScreen(cx + Math.cos(b.a) * b.r, cy + Math.sin(b.a) * b.r);
      const size = Math.max(7, (9 + 9 * Math.min(1, b.r / 300)) * Math.max(0.8, z));
      ctx.globalAlpha = Math.min(1, b.r / 70) * Math.min(1, b.age * 5);
      ctx.font = `bold ${Math.round(size)}px ${MONO}`;
      ctx.fillStyle = b.col;
      ctx.fillText(b.c, x, y);
    }
    // the flash when he's gone
    const fl = this.warpT - VORTEX.suck;
    if (fl > -0.1 && fl < 0.45) {
      const [sx, sy] = this.toScreen(cx, cy);
      const k = fl < 0 ? (fl + 0.1) / 0.1 : 1 - fl / 0.45;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, Math.max(this.viewW, this.viewH) * 0.7);
      g.addColorStop(0, `rgba(255,255,255,${0.75 * k})`);
      g.addColorStop(0.25, `rgba(255,59,208,${0.35 * k})`);
      g.addColorStop(1, "rgba(255,59,208,0)");
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    ctx.restore();
  }

  private drawHud(W: number, H: number, th: Theme) {
    const ctx = this.ctx;
    const p = this.player;
    const ascii = this.lookName === "ascii";
    const font = (px: number) => (ascii ? `bold ${Math.round(px * 0.85)}px ${MONO}` : `${px}px ${this.font}`);
    ctx.save();
    // on a small screen (the PSP) everything here is drawn as if the screen were bigger, then shrunk to fit
    const hs = Math.max(0.45, Math.min(1, W / 1100, H / 600));
    if (hs < 1) {
      ctx.scale(hs, hs);
      W /= hs;
      H /= hs;
    }
    ctx.textBaseline = "top";
    ctx.fillStyle = th.hudText;
    // the level's name, typed out when it starts
    if (this.levelT < 3.2 && !this.finished) {
      const text = `LEVEL ${this.levelIndex + 1} · ${this.level.name}`;
      const shown = text.slice(0, Math.floor(this.levelT * 32));
      ctx.globalAlpha = Math.min(1, (3.2 - this.levelT) / 0.6);
      ctx.font = font(30);
      ctx.textAlign = "center";
      ctx.fillStyle = th.pink;
      ctx.fillText(shown + (shown.length < text.length ? "_" : ""), W / 2, Math.max(56, H * 0.12));
      ctx.globalAlpha = 1;
      ctx.fillStyle = th.hudText;
    }
    // the time (left of the II button)
    const pb = this.pauseBtn();
    ctx.font = font(26);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(this.runTime), (pb.x - 10) / hs, 16);
    // the speed meter
    const sp = this.finished ? 0 : Math.min(1, p.speed / P.maxSpeed);
    const over = sp * P.maxSpeed > P.topRunSpeed;
    ctx.textAlign = "left";
    if (ascii) {
      const n = 24;
      const k = Math.round(sp * n);
      ctx.font = font(18);
      ctx.fillText("SPEED [", 20, H - 38);
      const x0 = 20 + ctx.measureText("SPEED [").width;
      ctx.fillStyle = over ? th.pink : th.hudText;
      ctx.fillText("#".repeat(k), x0, H - 38);
      ctx.fillStyle = "rgba(236,230,255,0.35)";
      const xk = x0 + ctx.measureText("#".repeat(k)).width;
      ctx.fillText("-".repeat(n - k), xk, H - 38);
      ctx.fillStyle = th.hudText;
      ctx.fillText("]", xk + ctx.measureText("-".repeat(n - k)).width, H - 38);
    } else {
      const bw = Math.min(260, W * 0.4);
      ctx.font = font(16);
      ctx.fillText("SPEED", 20, H - 52);
      ctx.fillStyle = "rgba(22,17,29,0.18)";
      ctx.fillRect(20, H - 30, bw, 12);
      ctx.fillStyle = over ? th.pink : th.hudText;
      ctx.fillRect(20, H - 30, bw * sp, 12);
      ctx.fillStyle = th.hudText;
      ctx.fillRect(20 + bw * (P.topRunSpeed / P.maxSpeed), H - 34, 2, 20);
    }
    // the controls (until you've been playing a little)
    ctx.fillStyle = th.hudText;
    if (this.clock < 14 && !this.finished) {
      ctx.globalAlpha = Math.min(1, (14 - this.clock) / 2);
      ctx.font = font(16);
      ctx.fillText(
        this.touch
          ? "TOUCH BUTTONS COME IN A LATER STAGE: USE A KEYBOARD OR A GAMEPAD FOR NOW"
          : "← → RUN   SPACE JUMP   ↓ SLIDE / STOMP   R RESTART   ESC MENU   V LOOK",
        20,
        18,
      );
      ctx.globalAlpha = 1;
    }
    // the tuning numbers (F2)
    if (this.debug) {
      const lines = [
        `fps ${this.fps.toFixed(0)}`,
        `speed ${p.speed.toFixed(0)}  (top run ${P.topRunSpeed}, max ${P.maxSpeed})`,
        `ground speed ${p.gsp.toFixed(0)}`,
        `vx ${p.vx.toFixed(0)}  vy ${p.vy.toFixed(0)}`,
        `angle ${((p.angle * 180) / Math.PI).toFixed(1)}°  ${p.onGround ? "on the ground" : "in the air"}`,
        `pose ${p.pose}`,
        `x ${p.x.toFixed(0)}  y ${p.y.toFixed(0)}`,
      ];
      ctx.font = "13px monospace";
      ctx.fillStyle = ascii ? "rgba(10,8,18,0.85)" : "rgba(255,250,242,0.85)";
      ctx.fillRect(16, 46, 330, lines.length * 17 + 10);
      ctx.fillStyle = th.hudText;
      lines.forEach((l, i) => ctx.fillText(l, 22, 52 + i * 17));
    }
    // a tip when you're stuck against something
    if (this.stuckTip && !this.finished && !this.paused) {
      const [sx0, sy0] = this.toScreen(p.x, p.y);
      const sx = sx0 / hs;
      const sy = sy0 / hs;
      ctx.font = font(17);
      ctx.textAlign = "center";
      const tw = ctx.measureText(this.stuckTip).width + 22;
      const ty = Math.max(70, sy - P.height * this.cam.zoom - 64);
      const tx = Math.min(W - tw / 2 - 8, Math.max(tw / 2 + 8, sx));
      ctx.globalAlpha = Math.min(1, (this.stuckT - 0.7) * 4);
      ctx.fillStyle = ascii ? "rgba(10,8,18,0.92)" : "#fffaf2";
      ctx.fillRect(tx - tw / 2, ty - 6, tw, 34);
      ctx.strokeStyle = th.pink;
      ctx.lineWidth = 2;
      ctx.strokeRect(tx - tw / 2, ty - 6, tw, 34);
      ctx.fillStyle = th.hudText;
      ctx.fillText(this.stuckTip, tx, ty + 2);
      ctx.globalAlpha = 1;
    }
    // finished: the card types itself out, like code
    if (this.finished && this.warpT >= VORTEX.card) {
      const typed = Math.floor((this.warpT - VORTEX.card) * 40);
      const last = this.levelIndex + 1 >= this.levels.length;
      const go = this.touch ? "TAP" : "SPACE";
      const lines: [string, number, string][] = [
        [last ? "ALL LEVELS DONE!" : `${this.level.name} DONE!`, 40, th.pink],
        [`TIME ${fmtTime(this.runTime)}${this.newBest ? "  NEW BEST!" : ""}`, 28, th.hudText],
        [`${go} = BACK TO THE MAP   R = AGAIN`, 17, th.hudText],
      ];
      const cw = Math.min(480, W - 40);
      const appear = smooth((this.warpT - VORTEX.card) / 0.2);
      ctx.globalAlpha = appear;
      ctx.fillStyle = ascii ? "rgba(10,8,18,0.92)" : "#fffaf2";
      ctx.fillRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.strokeStyle = ascii ? th.pink : th.hudText;
      ctx.lineWidth = ascii ? 3 : 5;
      ctx.strokeRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.globalAlpha = 1;
      ctx.textAlign = "left";
      let left = typed;
      const ys = [H / 2 - 70, H / 2 - 12, H / 2 + 36];
      lines.forEach(([text, size, col], i) => {
        ctx.font = font(size);
        const full = ctx.measureText(text).width;
        const shown = text.slice(0, Math.max(0, Math.min(text.length, left)));
        const x = W / 2 - full / 2;
        ctx.fillStyle = col;
        ctx.fillText(shown, x, ys[i]);
        // the blinking cursor at the end of what's typed so far
        const typing = left >= 0 && left < text.length;
        const lastLine = i === lines.length - 1 && left >= text.length;
        if ((typing || lastLine) && Math.floor(this.clock * 3) % 2 === 0) ctx.fillText("_", x + ctx.measureText(shown).width, ys[i]);
        left -= text.length;
      });
    }
    ctx.restore();
    // (the II button and the pause menu size themselves like every game's, so they're drawn unscaled)
    if (!this.finished) this.drawPauseButton();
    if (this.paused) this.drawPauseMenu();
  }
}


function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
