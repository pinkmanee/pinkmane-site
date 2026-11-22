// THE GAME: runs the physics 60 times a second (on every screen), moves the camera and draws everything.
// Two looks: ASCII (everything drawn as coloured text characters) and PAPER (hand-drawn style). V switches.

import { CAMERA, FIXED_DT, PHYSICS as P } from "../config/physics";
import { Player, type Pad } from "../entities/player";
import { ASCII_LOOK, drawPlayer, LOOK, type Look } from "../entities/drawPlayer";
import type { LevelData } from "../levels/types";
import { AsciiLayer, PLAYER_STYLE, WORLD_STYLE } from "./ascii";
import { Camera } from "./camera";
import { Input } from "./input";
import { Terrain } from "./terrain";

type LookName = "ascii" | "paper";
const LOOK_KEY = "pinkrush-look"; // the look you picked is remembered

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
    look: LOOK,
  },
  ascii: {
    bg: "#1b1630",
    swirl: "rgba(130, 112, 230, 0.32)",
    ground: "#463d7c",
    groundLip: "#8274d0",
    groundEdge: "#f1ecff",
    block: "#4b4282",
    blockEdge: "#e8e2ff",
    pink: "#ff3bd0",
    springBase: "#d9d2ff",
    boosterBase: "#2e2752",
    signCard: "#0a0812",
    signEdge: "#cfc6ff",
    signText: "#ffffff",
    door: "#0a0812",
    hudText: "#ece6ff",
    look: ASCII_LOOK,
  },
};
const ASCII_SCREEN: [number, number, number] = [7, 6, 12]; // the screen behind the characters
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const ASCII_COLUMNS = 150; // how many world characters fit across the screen (more = smaller characters, slower)
const ASCII_RATIO = 1.55; // a character is this much taller than wide
const PLAYER_FINER = 1.55; // Pinkmane's characters are this much smaller than the world's
const ASCII_MAX_PIXELS = 3_000_000; // big sharp screens draw the ASCII look at fewer real pixels (keeps it at 60 fps)

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

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
  private springCool: number[];
  private springSquash: number[];
  private groundFill: Path2D[] = [];
  private groundTop: Path2D[] = [];
  private viewW = 0;
  private viewH = 0;
  private dpr = 1;
  private touch = false;
  private lookName: LookName = "ascii";
  private worldLayer: AsciiLayer | null = null;
  private playerLayer: AsciiLayer | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private level: LevelData,
    private font: string,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    this.ctx = ctx;
    this.dctx = ctx;
    this.terrain = new Terrain(level);
    this.player = new Player(level.spawn[0], level.spawn[1]);
    this.springCool = level.springs.map(() => 0);
    this.springSquash = level.springs.map(() => 0);
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
    this.touch = !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(any-pointer: fine)").matches;
    try {
      const saved = localStorage.getItem(LOOK_KEY);
      if (saved === "paper" || saved === "ascii") this.lookName = saved;
    } catch {}
  }

  start() {
    this.resize();
    window.addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onHide);
    window.addEventListener("blur", this.onBlur);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    (window as unknown as { pinkRush?: Game }).pinkRush = this; // (for testing from the browser console)
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("blur", this.onBlur);
    this.input.destroy();
  }

  // a quick look at the player (for testing)
  get state() {
    const p = this.player;
    return { x: p.x, y: p.y, gsp: p.gsp, vx: p.vx, vy: p.vy, onGround: p.onGround, pose: p.pose, angle: p.angle, finished: this.finished, time: this.runTime };
  }

  // the tab is hidden or the window lost focus: pause
  private onHide = () => {
    if (document.hidden) this.paused = true;
  };
  private onBlur = () => {
    this.paused = true;
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

  // make (or resize) the ASCII layers, and set the zoom for the look
  private setupLook() {
    this.cam.viewHeight = this.lookName === "ascii" ? CAMERA.asciiViewHeight : CAMERA.viewHeight;
    if (this.lookName !== "ascii") return;
    if (!this.worldLayer) this.worldLayer = new AsciiLayer(WORLD_STYLE);
    if (!this.playerLayer) this.playerLayer = new AsciiLayer(PLAYER_STYLE);
    const cell = Math.max(6, this.viewW / ASCII_COLUMNS);
    this.worldLayer.resize(this.viewW, this.viewH, this.dpr, cell, ASCII_RATIO);
    this.playerLayer.resize(this.viewW, this.viewH, this.dpr, Math.max(3, cell / PLAYER_FINER), ASCII_RATIO);
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
    this.cam.snap(this.player.x, this.player.y, this.viewW, this.viewH);
    this.started = false;
    this.finished = false;
    this.runTime = 0;
    this.visAngle = 0;
  }

  private frame = (now: number) => {
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;
    const inp = this.input;
    inp.pollGamepad();
    if (inp.take("pause")) this.paused = !this.paused;
    if (inp.take("debug")) this.debug = !this.debug;
    if (inp.take("look")) this.switchLook();
    if (inp.take("restart")) this.restart();
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
    }
    this.render(this.acc / FIXED_DT, this.paused ? 0 : dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  // ======================= ONE PHYSICS STEP (1/60 s) =======================
  private step(dt: number) {
    const inp = this.input;
    const p = this.player;
    const lockKeys = this.finished;
    const pad: Pad = {
      dir: lockKeys ? 0 : (inp.held("right") ? 1 : 0) - (inp.held("left") ? 1 : 0),
      down: !lockKeys && inp.held("down"),
      downPressed: inp.take("down") && !lockKeys,
      jump: !lockKeys && inp.held("jump"),
      jumpPressed: inp.take("jump") && !lockKeys,
    };
    p.update(dt, pad, this.terrain);

    // springs
    this.level.springs.forEach((s, i) => {
      this.springCool[i] = Math.max(0, this.springCool[i] - dt);
      this.springSquash[i] = Math.max(0, this.springSquash[i] - dt * 4);
      if (this.springCool[i] > 0) return;
      if (Math.abs(p.x - s.x) < 26 && p.y > s.y - 42 && p.y < s.y + 8) {
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
    // fell out of the level: back to the start
    if (p.y > this.terrain.bottom) {
      p.respawn(this.level.spawn[0], this.level.spawn[1]);
      this.cam.snap(p.x, p.y, this.viewW, this.viewH);
    }
    // the timer starts when you move
    if (!this.started && (p.speed > 1 || !p.onGround)) this.started = true;
    if (this.started && !this.finished) this.runTime += dt;
    // the finish door
    const f = this.level.finish;
    if (!this.finished && Math.abs(p.x - f[0]) < 40 && Math.abs(p.y - f[1]) < 90) this.finished = true;
  }

  // ======================= DRAWING =======================
  // sx, sy = screen px -> the canvas we draw on (dpr for the screen, 1 / cell size for an ASCII layer)
  private worldTransform(c: CanvasRenderingContext2D, sx: number, sy: number) {
    const z = this.cam.zoom;
    c.setTransform(sx * z, 0, 0, sy * z, sx * (this.viewW / 2 - this.cam.x * z), sy * (this.viewH / 2 - this.cam.y * z));
  }

  private render(alpha: number, dt: number) {
    const W = this.viewW;
    const H = this.viewH;
    const p = this.player;
    const th = THEMES[this.lookName];
    // where he is right now, between the last two physics steps (smooth on any screen)
    const px = p.prevX + (p.x - p.prevX) * alpha;
    const py = p.prevY + (p.y - p.prevY) * alpha;
    this.cam.update(dt, px, py, p.vx, p.vy, p.speed, W, H);
    const want = p.onGround ? p.angle : 0;
    this.visAngle += (want - this.visAngle) * ease(p.onGround ? 20 : 8, dt);

    const wl = this.worldLayer;
    const pl = this.playerLayer;
    if (this.lookName === "ascii" && wl && pl) {
      // 1. the world, drawn small, then turned into big characters
      const w = wl.sctx;
      this.dctx = w;
      w.setTransform(1, 0, 0, 1, 0, 0);
      w.fillStyle = th.bg;
      w.fillRect(0, 0, wl.cols, wl.rows);
      w.setTransform(1 / wl.cw, 0, 0, 1 / wl.ch, 0, 0);
      this.drawSwirls(W, H, th);
      this.worldTransform(w, 1 / wl.cw, 1 / wl.ch);
      this.drawWorld(th);
      // 2. Pinkmane, drawn on his own, then turned into small characters
      const pc = pl.sctx;
      pc.setTransform(1, 0, 0, 1, 0, 0);
      pc.clearRect(0, 0, pl.cols, pl.rows);
      this.worldTransform(pc, 1 / pl.cw, 1 / pl.ch);
      drawPlayer(pc, p, px, py, this.visAngle, this.clock, th.look);
      // 3. onto the screen
      const ctx = this.ctx;
      wl.compose(ctx, ASCII_SCREEN);
      const z = this.cam.zoom;
      const sxp = W / 2 + (px - this.cam.x) * z;
      const syp = H / 2 + (py - this.cam.y) * z;
      pl.compose(ctx, undefined, { x0: sxp - 75 * z, y0: syp - 125 * z, x1: sxp + 75 * z, y1: syp + 25 * z });
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
      drawPlayer(ctx, p, px, py, this.visAngle, this.clock, th.look);
    }
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(W, H, th);
  }

  private drawWorld(th: Theme) {
    this.drawSigns(th);
    this.drawGround(th);
    this.drawBlocks(th);
    this.drawFinish(th);
    this.drawBoosters(th);
    this.drawSprings(th);
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
      ctx.lineWidth = 26;
      ctx.lineJoin = "round";
      ctx.stroke(this.groundTop[i]);
      ctx.restore();
      ctx.strokeStyle = th.groundEdge;
      ctx.lineWidth = 6;
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
      ctx.lineWidth = 5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  private drawSprings(th: Theme) {
    const ctx = this.dctx;
    this.level.springs.forEach((s, i) => {
      const a = ((s.angle ?? -90) + 90) * (Math.PI / 180);
      const h = 18 + this.springSquash[i] * 10; // it shoots up when used, then settles
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      ctx.strokeStyle = th.springBase;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(k % 2 === 0 ? -9 : 9, -4 - (k / 4) * h);
      ctx.stroke();
      ctx.fillStyle = th.springBase;
      ctx.fillRect(-14, -5, 28, 5);
      ctx.fillStyle = th.pink;
      ctx.fillRect(-17, -h - 9, 34, 7);
      ctx.strokeRect(-17, -h - 9, 34, 7);
      ctx.restore();
    });
  }

  private drawBoosters(th: Theme) {
    const ctx = this.dctx;
    for (const b of this.level.boosters) {
      ctx.fillStyle = th.boosterBase;
      ctx.fillRect(b.x, b.y - 7, b.w, 7);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y - 7, b.w, 7);
      ctx.clip();
      ctx.fillStyle = th.pink;
      const move = (this.clock * 90 * b.dir) % 22;
      for (let x = b.x - 22; x < b.x + b.w + 22; x += 22) {
        const cx = x + move;
        ctx.beginPath();
        ctx.moveTo(cx - 5 * b.dir, b.y - 6);
        ctx.lineTo(cx + 5 * b.dir, b.y - 3.5);
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
    ctx.font = this.signFont(ascii);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = th.signText;
    for (const s of this.level.signs) ctx.fillText(s.text, s.x, s.y + 1);
    const [fx, fy] = this.level.finish;
    ctx.font = ascii ? `bold 22px ${MONO}` : `22px ${this.font}`;
    ctx.fillStyle = th.pink;
    ctx.fillText("FINISH", fx, fy - 130);
    ctx.restore();
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

  private drawHud(W: number, H: number, th: Theme) {
    const ctx = this.ctx;
    const p = this.player;
    const ascii = this.lookName === "ascii";
    const font = (px: number) => (ascii ? `bold ${Math.round(px * 0.85)}px ${MONO}` : `${px}px ${this.font}`);
    ctx.save();
    ctx.textBaseline = "top";
    ctx.fillStyle = th.hudText;
    // the time
    ctx.font = font(26);
    ctx.textAlign = "right";
    ctx.fillText(fmtTime(this.runTime), W - 20, 16);
    // the speed meter
    const sp = Math.min(1, p.speed / P.maxSpeed);
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
      ctx.fillText("ESC = PLAY    R = RESTART    V = LOOK", W / 2, H / 2 + 16);
    }
    // finished
    if (this.finished) {
      ctx.textAlign = "center";
      const cw = Math.min(480, W - 40);
      ctx.fillStyle = ascii ? "#0a0812" : "#fffaf2";
      ctx.fillRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.strokeStyle = ascii ? th.pink : th.hudText;
      ctx.lineWidth = ascii ? 3 : 5;
      ctx.strokeRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.fillStyle = th.pink;
      ctx.font = font(40);
      ctx.fillText(`${this.level.name} DONE!`, W / 2, H / 2 - 70);
      ctx.fillStyle = th.hudText;
      ctx.font = font(28);
      ctx.fillText(`TIME ${fmtTime(this.runTime)}`, W / 2, H / 2 - 12);
      ctx.font = font(18);
      ctx.fillText("R = RUN IT AGAIN", W / 2, H / 2 + 36);
    }
    ctx.restore();
  }
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? "0" : ""}${s.toFixed(1)}`;
}
