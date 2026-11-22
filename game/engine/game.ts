// THE GAME: runs the physics 60 times a second (on every screen), moves the camera and draws everything.
// Two looks: ASCII (everything drawn as coloured text characters) and PAPER (hand-drawn style). V switches.
// Reaching the door: a vortex twists the world into the door and sucks Pinkmane in like code.
// Starts on the LEVEL SELECT (the chosen level slowly scrolls by behind it). Best times are remembered.

import { CAMERA, FIXED_DT, PHYSICS as P } from "../config/physics";
import { Player, type Pad } from "../entities/player";
import { ASCII_LOOK, drawPlayer, LOOK, type Look } from "../entities/drawPlayer";
import type { LevelData } from "../levels/types";
import { AsciiLayer, PLAYER_STYLE, WORLD_STYLE, type Warp } from "./ascii";
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
type Rect = { x: number; y: number; w: number; h: number };

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
  private cards: Rect[] = []; // where the level cards are (for clicking / tapping)
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
    this.input.clearPresses();
    this.restart();
  }

  // a click / tap: pick a level card, or go on to the next level
  private onPointer = (e: PointerEvent) => {
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (this.mode === "select") {
      const hit = this.cards.findIndex((c) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h);
      if (hit < 0) return;
      if (hit === this.levelIndex) this.startLevel(hit);
      else {
        this.loadLevel(hit);
        this.selectT = 0;
      }
    } else if (this.finished && this.warpT >= VORTEX.card + 0.4) this.nextLevel();
    else if (this.paused) this.paused = false;
  };

  private nextLevel() {
    if (this.levelIndex + 1 < this.levels.length) this.startLevel(this.levelIndex + 1);
    else this.goSelect();
  }

  start() {
    this.resize();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("blur", this.onBlur);
    this.canvas.addEventListener("pointerdown", this.onPointer);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { pinkRush?: Game }).pinkRush = this; // (for testing from the browser console)
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("blur", this.onBlur);
    this.canvas.removeEventListener("pointerdown", this.onPointer);
    this.input.destroy();
  }

  // a quick look at the player (for testing)
  get state() {
    const p = this.player;
    return { x: p.x, y: p.y, gsp: p.gsp, vx: p.vx, vy: p.vy, onGround: p.onGround, pose: p.pose, angle: p.angle, finished: this.finished, time: this.runTime, warp: this.warpT, level: this.levelIndex, mode: this.mode, checkpoint: this.checkpoint, wallDir: p.wallDir };
  }

  // the tab is hidden or the window lost focus: pause
  private onHide = () => {
    if (document.hidden && this.mode === "play") this.paused = true;
  };
  private onBlur = () => {
    if (this.mode === "play") this.paused = true;
  };

  private resize = () => {
    const r = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    const sharp = Math.min(2.5, window.devicePixelRatio || 1);
    this.dpr = this.lookName === "ascii" ? Math.min(sharp, Math.max(1, Math.sqrt(ASCII_MAX_PIXELS / (this.viewW * this.viewH)))) : sharp;
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
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
    this.cam.viewHeight = CAMERA.viewHeight;
    this.cam.snap(this.player.x, this.player.y, this.viewW, this.viewH);
    this.started = false;
    this.finished = false;
    this.warpT = -1;
    this.bits = [];
    this.runTime = 0;
    this.visAngle = 0;
    this.checkpoint = -1;
    this.newBest = false;
    this.levelT = 0;
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
    if (inp.take("debug")) this.debug = !this.debug;
    if (inp.take("look")) this.switchLook();
    if (this.mode === "select") {
      // THE LEVEL SELECT: ← → pick, SPACE / ENTER go
      const n = this.levels.length;
      if (inp.take("left")) {
        this.loadLevel((this.levelIndex + n - 1) % n);
        this.selectT = 0;
      }
      if (inp.take("right")) {
        this.loadLevel((this.levelIndex + 1) % n);
        this.selectT = 0;
      }
      if (inp.take("jump") || inp.take("confirm")) this.startLevel(this.levelIndex);
      inp.take("pause");
      inp.take("restart");
      inp.take("menu");
      inp.take("down");
      this.selectT += dt;
      this.clock += dt;
      this.render(1, dt);
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    if (inp.take("pause")) this.paused = !this.paused;
    if (inp.take("restart")) this.restart();
    if (inp.take("menu")) {
      this.goSelect();
      this.raf = requestAnimationFrame(this.frame);
      return;
    }
    // the done card: SPACE / ENTER = next level
    if (this.finished && this.warpT >= VORTEX.card + 0.4 && (inp.take("jump") || inp.take("confirm"))) this.nextLevel();
    if (this.paused) {
      // (don't save up presses while paused)
      inp.take("jump");
      inp.take("down");
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
    p.update(dt, pad, this.terrain);

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
      if (p.x >= cps[i].x && Math.abs(p.y - cps[i].y) < 300) this.checkpoint = i;
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
      this.cam.viewHeight = CAMERA.viewHeight * VORTEX.zoomIn;
    }
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
    } else if (this.mode === "select") {
      // the level slowly scrolls by behind the level select
      const [ax, ay, wrapped] = this.attractPoint();
      if (wrapped) this.cam.snap(ax, ay, W, H);
      this.cam.update(dt, ax, ay, 0, 0, 0, W, H);
    } else this.cam.update(dt, px, py, p.vx, p.vy, p.speed, W, H);
    const showPlayer = this.mode === "play";
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
      if (this.mode === "select") {
        // the title, in big pink characters
        w.setTransform(wax, 0, 0, way, wbx, wby);
        this.drawTitle(W, H, th, true);
      }
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
      if (this.mode === "play") this.drawSignText(th, true);
    } else {
      const ctx = this.ctx;
      this.dctx = ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.fillStyle = th.bg;
      ctx.fillRect(0, 0, W, H);
      this.drawSwirls(W, H, th);
      this.worldTransform(ctx, this.dpr, this.dpr);
      this.drawWorld(th);
      if (showPlayer) this.drawSignText(th, false);
      if (showPlayer) drawPlayer(ctx, p, px, py, this.visAngle, this.clock, th.look, extra);
      else {
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.drawTitle(W, H, th, false);
      }
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (warping) this.drawBits(th);
    this.drawHud(W, H, th);
  }

  // where the camera looks on the level select: slowly along the level, start to finish, then again
  private lastAttractX = 0;
  private attractPoint(): [number, number, boolean] {
    const x0 = this.level.spawn[0];
    const span = Math.max(1000, this.level.finish[0] - x0);
    const x = x0 + ((this.selectT * 300) % span);
    const hit = this.terrain.groundBelow(x, -6000, 6000);
    const y = (hit ? hit.y : this.level.spawn[1]) - 120;
    const wrapped = x < this.lastAttractX || this.selectT === 0;
    this.lastAttractX = x;
    return [x, y, wrapped];
  }

  // PINK RUSH, big (on the level select)
  private drawTitle(W: number, H: number, th: Theme, ascii: boolean) {
    const ctx = this.dctx === this.ctx ? this.ctx : this.dctx;
    const size = Math.min(W * 0.14, H * 0.2, 170);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = ascii ? `900 ${Math.round(size)}px Impact, "Arial Black", "Helvetica Neue", sans-serif` : `${Math.round(size * 0.8)}px ${this.font}`;
    ctx.fillStyle = ascii ? "#ff7ddf" : th.pink;
    if (!ascii) {
      ctx.fillStyle = th.hudText;
      ctx.fillText("PINK RUSH", W / 2 + 4, H * 0.2 + 4);
      ctx.fillStyle = th.pink;
    }
    ctx.fillText("PINK RUSH", W / 2, H * 0.2);
    ctx.restore();
  }

  private drawWorld(th: Theme) {
    this.drawSigns(th);
    this.drawCheckpoints(th);
    this.drawGround(th);
    this.drawBlocks(th);
    this.drawFinish(th);
    this.drawBoosters(th);
    this.drawSprings(th);
    if (this.warpT >= 0) this.drawVortex(th);
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
      ctx.fillStyle = th.block;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = th.blockEdge;
      ctx.lineWidth = 6;
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

  // THE LEVEL SELECT: a card per level (best time on it), the chosen one lit up pink
  private drawSelect(W: number, H: number, th: Theme, font: FontFn) {
    const ctx = this.ctx;
    const ascii = this.lookName === "ascii";
    const n = this.levels.length;
    const wide = W >= 760;
    this.cards = [];
    if (wide) {
      const gap = 14;
      const cw = Math.min(190, (W - 80 - gap * (n - 1)) / n);
      const ch = 128;
      const x0 = W / 2 - (cw * n + gap * (n - 1)) / 2;
      const y0 = H * 0.5 - ch / 2;
      for (let i = 0; i < n; i++) this.cards.push({ x: x0 + i * (cw + gap), y: y0 - (i === this.levelIndex ? 10 : 0), w: cw, h: ch });
    } else {
      const cw = Math.min(440, W - 36);
      const ch = Math.min(58, (H * 0.56) / n - 8);
      const y0 = H * 0.33;
      for (let i = 0; i < n; i++) this.cards.push({ x: W / 2 - cw / 2 + (i === this.levelIndex ? 0 : 0), y: y0 + i * (ch + 8), w: cw, h: ch });
    }
    ctx.textBaseline = "middle";
    this.cards.forEach((c, i) => {
      const lv = this.levels[i];
      const on = i === this.levelIndex;
      const best = this.best[lv.name];
      ctx.fillStyle = ascii ? "rgba(10,8,18,0.9)" : "rgba(255,250,242,0.95)";
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.strokeStyle = on ? th.pink : ascii ? "rgba(236,230,255,0.45)" : "rgba(22,17,29,0.5)";
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.strokeRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = on ? th.pink : th.hudText;
      if (wide) {
        ctx.textAlign = "center";
        ctx.font = font(44);
        ctx.fillText(String(i + 1), c.x + c.w / 2, c.y + 34);
        ctx.font = font(15);
        ctx.fillStyle = th.hudText;
        ctx.fillText(lv.name, c.x + c.w / 2, c.y + 76, c.w - 12);
        ctx.font = font(13);
        ctx.globalAlpha = 0.8;
        ctx.fillText(best !== undefined ? `BEST ${fmtTime(best)}` : "NOT DONE YET", c.x + c.w / 2, c.y + 104, c.w - 12);
        ctx.globalAlpha = 1;
      } else {
        ctx.textAlign = "left";
        ctx.font = font(24);
        ctx.fillText(String(i + 1), c.x + 14, c.y + c.h / 2);
        ctx.font = font(15);
        ctx.fillStyle = th.hudText;
        ctx.fillText(lv.name, c.x + 48, c.y + c.h / 2);
        ctx.textAlign = "right";
        ctx.font = font(13);
        ctx.globalAlpha = 0.8;
        ctx.fillText(best !== undefined ? fmtTime(best) : "--", c.x + c.w - 14, c.y + c.h / 2);
        ctx.globalAlpha = 1;
      }
    });
    ctx.textAlign = "center";
    ctx.fillStyle = th.hudText;
    ctx.font = font(16);
    const hintY = wide ? H * 0.5 + 100 : this.cards[n - 1].y + this.cards[n - 1].h + 30;
    ctx.fillText(this.touch ? "TAP A LEVEL · TAP IT AGAIN TO GO" : "← → PICK A LEVEL   SPACE / ENTER = GO   V = LOOK", W / 2, hintY, W - 30);
    if (!ascii) {
      ctx.font = font(18);
      ctx.fillText("A PINKMANE GAME", W / 2, H * 0.2 + Math.min(W * 0.14, H * 0.2, 170) * 0.62);
    } else {
      ctx.font = font(18);
      ctx.fillStyle = th.hudText;
      ctx.fillText("A PINKMANE GAME", W / 2, H * 0.2 + Math.min(W * 0.14, H * 0.2, 170) * 0.66);
    }
  }

  private drawHud(W: number, H: number, th: Theme) {
    const ctx = this.ctx;
    const p = this.player;
    const ascii = this.lookName === "ascii";
    const font = (px: number) => (ascii ? `bold ${Math.round(px * 0.85)}px ${MONO}` : `${px}px ${this.font}`);
    ctx.save();
    ctx.textBaseline = "top";
    ctx.fillStyle = th.hudText;
    if (this.mode === "select") {
      this.drawSelect(W, H, th, font);
      ctx.restore();
      return;
    }
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
    // the time
    ctx.font = font(26);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(this.runTime), W - 20, 16);
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
          : "← → RUN   SPACE JUMP   ↓ SLIDE / STOMP   R RESTART   ESC PAUSE   V LOOK   F2 NUMBERS",
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
    // paused
    if (this.paused) {
      ctx.fillStyle = ascii ? "rgba(7,6,12,0.78)" : "rgba(239,230,218,0.75)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = th.hudText;
      ctx.font = font(54);
      ctx.fillText("PAUSED", W / 2, H / 2 - 50);
      ctx.font = font(20);
      ctx.fillText("ESC = PLAY    R = RESTART    L = LEVELS    V = LOOK", W / 2, H / 2 + 16);
    }
    // finished: the card types itself out, like code
    if (this.finished && this.warpT >= VORTEX.card) {
      const typed = Math.floor((this.warpT - VORTEX.card) * 40);
      const last = this.levelIndex + 1 >= this.levels.length;
      const go = this.touch ? "TAP" : "SPACE";
      const lines: [string, number, string][] = [
        [last ? "ALL LEVELS DONE!" : `${this.level.name} DONE!`, 40, th.pink],
        [`TIME ${fmtTime(this.runTime)}${this.newBest ? "  NEW BEST!" : ""}`, 28, th.hudText],
        [last ? `${go} = LEVELS   R = AGAIN` : `${go} = NEXT LEVEL   R = AGAIN   L = LEVELS`, 17, th.hudText],
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
  }
}

type FontFn = (px: number) => string;

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
