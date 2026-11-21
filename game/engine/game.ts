// THE GAME: runs the physics 60 times a second (on every screen), moves the camera and draws everything.

import { FIXED_DT, PHYSICS as P } from "../config/physics";
import { Player, type Pad } from "../entities/player";
import { drawPlayer, LOOK } from "../entities/drawPlayer";
import type { LevelData } from "../levels/types";
import { Camera } from "./camera";
import { Input } from "./input";
import { Terrain } from "./terrain";

// colours
const PAPER = "#efe6da"; // the warm paper background
const SWIRL = "rgba(120, 96, 92, 0.075)"; // the soft swirls on it
const GROUND = "#2b2440"; // the ground
const GROUND_LIP = "#3d3358"; // the lighter band along the top of the ground
const BLOCK = "#3a3150";
const PINK = "#ff3bd0";

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class Game {
  private ctx: CanvasRenderingContext2D;
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

  constructor(
    private canvas: HTMLCanvasElement,
    private level: LevelData,
    private font: string,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    this.ctx = ctx;
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
    this.touch = typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches && !window.matchMedia?.("(any-pointer: fine)").matches;
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
  // a quick look at the player (for testing)
  get state() {
    const p = this.player;
    return { x: p.x, y: p.y, gsp: p.gsp, vx: p.vx, vy: p.vy, onGround: p.onGround, pose: p.pose, angle: p.angle, finished: this.finished, time: this.runTime };
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onHide);
    window.removeEventListener("blur", this.onBlur);
    this.input.destroy();
  }

  // the tab is hidden or the window lost focus: pause
  private onHide = () => {
    if (document.hidden) this.paused = true;
  };
  private onBlur = () => {
    this.paused = true;
  };

  private resize = () => {
    this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, r.width);
    this.viewH = Math.max(1, r.height);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
  };

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
  private render(alpha: number, dt: number) {
    const ctx = this.ctx;
    const W = this.viewW;
    const H = this.viewH;
    const p = this.player;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);

    // where he is right now, between the last two physics steps (smooth on any screen)
    const px = p.prevX + (p.x - p.prevX) * alpha;
    const py = p.prevY + (p.y - p.prevY) * alpha;
    this.cam.update(dt, px, py, p.vx, p.vy, p.speed, W, H);
    this.drawSwirls(W, H);

    const z = this.cam.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (W / 2 - this.cam.x * z), this.dpr * (H / 2 - this.cam.y * z));
    this.drawSigns();
    this.drawGround();
    this.drawBlocks();
    this.drawFinish();
    this.drawBoosters();
    this.drawSprings();

    const want = p.onGround ? p.angle : 0;
    this.visAngle += (want - this.visAngle) * ease(p.onGround ? 20 : 8, dt);
    drawPlayer(ctx, p, px, py, this.visAngle, this.clock);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHud(W, H);
  }

  // big soft swirls on the paper (they drift slower than the world: a far-away layer)
  private drawSwirls(W: number, H: number) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = SWIRL;
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

  private drawGround() {
    const ctx = this.ctx;
    for (let i = 0; i < this.groundFill.length; i++) {
      ctx.fillStyle = GROUND;
      ctx.fill(this.groundFill[i]);
      // a lighter band just inside the top edge
      ctx.save();
      ctx.clip(this.groundFill[i]);
      ctx.strokeStyle = GROUND_LIP;
      ctx.lineWidth = 26;
      ctx.lineJoin = "round";
      ctx.stroke(this.groundTop[i]);
      ctx.restore();
      ctx.strokeStyle = LOOK.ink;
      ctx.lineWidth = 6;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke(this.groundTop[i]);
    }
  }

  private drawBlocks() {
    const ctx = this.ctx;
    for (const b of this.terrain.blocks) {
      ctx.fillStyle = BLOCK;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = LOOK.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
    }
  }

  private drawSprings() {
    const ctx = this.ctx;
    this.level.springs.forEach((s, i) => {
      const a = ((s.angle ?? -90) + 90) * (Math.PI / 180);
      const squash = this.springSquash[i];
      const h = 18 + squash * 10; // it shoots up when used, then settles
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      ctx.strokeStyle = LOOK.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let k = 0; k <= 4; k++) ctx.lineTo(k % 2 === 0 ? -9 : 9, -4 - (k / 4) * h);
      ctx.stroke();
      ctx.fillStyle = LOOK.ink;
      ctx.fillRect(-14, -5, 28, 5);
      ctx.fillStyle = PINK;
      ctx.fillRect(-17, -h - 9, 34, 7);
      ctx.strokeRect(-17, -h - 9, 34, 7);
      ctx.restore();
    });
  }

  private drawBoosters() {
    const ctx = this.ctx;
    for (const b of this.level.boosters) {
      ctx.fillStyle = LOOK.ink;
      ctx.fillRect(b.x, b.y - 7, b.w, 7);
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y - 7, b.w, 7);
      ctx.clip();
      ctx.fillStyle = PINK;
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

  private drawSigns() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `20px ${this.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const s of this.level.signs) {
      const w = ctx.measureText(s.text).width + 28;
      ctx.strokeStyle = LOOK.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 20);
      ctx.lineTo(s.x, s.y + 150);
      ctx.stroke();
      ctx.fillStyle = "#fffaf2";
      ctx.fillRect(s.x - w / 2, s.y - 20, w, 40);
      ctx.lineWidth = 4;
      ctx.strokeRect(s.x - w / 2, s.y - 20, w, 40);
      ctx.fillStyle = LOOK.ink;
      ctx.fillText(s.text, s.x, s.y + 1);
    }
    ctx.restore();
  }

  private drawFinish() {
    const ctx = this.ctx;
    const [fx, fy] = this.level.finish;
    ctx.save();
    ctx.fillStyle = LOOK.ink;
    ctx.fillRect(fx - 30, fy - 110, 60, 110);
    ctx.strokeStyle = PINK;
    ctx.lineWidth = 7;
    ctx.strokeRect(fx - 30, fy - 110, 60, 110);
    ctx.font = `22px ${this.font}`;
    ctx.textAlign = "center";
    ctx.fillStyle = PINK;
    ctx.fillText("FINISH", fx, fy - 124);
    ctx.restore();
  }

  private drawHud(W: number, H: number) {
    const ctx = this.ctx;
    const p = this.player;
    ctx.save();
    ctx.textBaseline = "top";
    // the time
    ctx.font = `26px ${this.font}`;
    ctx.textAlign = "right";
    ctx.fillStyle = LOOK.ink;
    ctx.fillText(fmtTime(this.runTime), W - 20, 16);
    // the speed meter
    const bw = Math.min(260, W * 0.4);
    const sp = Math.min(1, p.speed / P.maxSpeed);
    ctx.textAlign = "left";
    ctx.font = `16px ${this.font}`;
    ctx.fillText("SPEED", 20, H - 52);
    ctx.fillStyle = "rgba(22,17,29,0.18)";
    ctx.fillRect(20, H - 30, bw, 12);
    ctx.fillStyle = sp * P.maxSpeed > P.topRunSpeed ? PINK : LOOK.ink;
    ctx.fillRect(20, H - 30, bw * sp, 12);
    ctx.fillStyle = LOOK.ink;
    ctx.fillRect(20 + bw * (P.topRunSpeed / P.maxSpeed), H - 34, 2, 20);
    // the controls (until you've been playing a little)
    if (this.clock < 14 && !this.finished) {
      ctx.globalAlpha = Math.min(1, (14 - this.clock) / 2);
      ctx.font = `16px ${this.font}`;
      ctx.fillText(
        this.touch ? "TOUCH BUTTONS COME IN A LATER STAGE: USE A KEYBOARD OR A GAMEPAD FOR NOW" : "← → RUN   SPACE JUMP   ↓ SLIDE / STOMP   R RESTART   ESC PAUSE   F2 NUMBERS",
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
      ctx.fillStyle = "rgba(255,250,242,0.85)";
      ctx.fillRect(16, 46, 330, lines.length * 17 + 10);
      ctx.fillStyle = LOOK.ink;
      lines.forEach((l, i) => ctx.fillText(l, 22, 52 + i * 17));
    }
    // paused
    if (this.paused) {
      ctx.fillStyle = "rgba(239,230,218,0.75)";
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = "center";
      ctx.fillStyle = LOOK.ink;
      ctx.font = `54px ${this.font}`;
      ctx.fillText("PAUSED", W / 2, H / 2 - 50);
      ctx.font = `20px ${this.font}`;
      ctx.fillText("ESC = PLAY    R = RESTART", W / 2, H / 2 + 16);
    }
    // finished
    if (this.finished) {
      ctx.textAlign = "center";
      const cw = Math.min(460, W - 40);
      ctx.fillStyle = "#fffaf2";
      ctx.fillRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.strokeStyle = LOOK.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(W / 2 - cw / 2, H / 2 - 90, cw, 170);
      ctx.fillStyle = PINK;
      ctx.font = `40px ${this.font}`;
      ctx.fillText(`${this.level.name} DONE!`, W / 2, H / 2 - 70);
      ctx.fillStyle = LOOK.ink;
      ctx.font = `28px ${this.font}`;
      ctx.fillText(`TIME ${fmtTime(this.runTime)}`, W / 2, H / 2 - 12);
      ctx.font = `18px ${this.font}`;
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
