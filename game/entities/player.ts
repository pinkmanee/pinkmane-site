// PINKMANE (the player): how he runs, sticks to hills, jumps, slides, wall jumps and stomps.
// All the numbers are in game/config/physics.ts.

import { PHYSICS as P } from "../config/physics";
import type { Terrain, GroundHit } from "../engine/terrain";

// what the controls say this physics step
export type Pad = {
  dir: number; // -1 left, 0 nothing, 1 right
  down: boolean;
  downPressed: boolean;
  jump: boolean; // held
  jumpPressed: boolean; // pressed this step
};

export type Pose = "idle" | "run" | "skid" | "jump" | "fall" | "slide" | "crawl" | "wall" | "stomp";

// things that just happened (for sounds, dust and screen shake later)
export type PlayerEvent = "jump" | "walljump" | "land" | "hardland" | "stompstart" | "stompland" | "slide" | "bonk" | "spring" | "boost";

const DEG = Math.PI / 180;

export class Player {
  x: number; // the middle of his feet
  y: number;
  prevX: number; // where he was one physics step ago (the drawing slides smoothly between the two)
  prevY: number;
  vx = 0;
  vy = 0;
  gsp = 0; // speed along the ground (+ = to the right)
  angle = 0; // the ground's angle under him (radians)
  onGround = true;
  facing = 1;
  sliding = false;
  stomping = false;
  jumping = false; // rising from a jump he's still holding
  wallDir = 0; // sliding down a wall on this side (-1 / 1), 0 = no
  lastWallDir = 0;
  pose: Pose = "idle";
  runPhase = 0; // where his legs are in the run cycle
  prevRunPhase = 0; // ...one physics step ago (so the legs move smoothly on fast screens too)
  events: PlayerEvent[] = [];
  private coyote = 0;
  private jumpBuf = 0;
  private wallCoyote = 0;
  private lock = 0; // can't steer (after a wall jump)
  private springTime = 0; // just launched by a spring: letting go of jump doesn't cut it
  private skidding = false;
  private crawling = false; // (stays on until you speed up again, so the pose doesn't flicker)

  constructor(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
  }

  get height() {
    return this.sliding ? P.slideHeight : P.height;
  }
  get speed() {
    return this.onGround ? Math.abs(this.gsp) : Math.hypot(this.vx, this.vy);
  }

  respawn(x: number, y: number) {
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.vx = this.vy = this.gsp = 0;
    this.angle = 0;
    this.onGround = true;
    this.sliding = this.stomping = this.jumping = false;
    this.wallDir = this.lastWallDir = 0;
    this.coyote = this.jumpBuf = this.wallCoyote = this.lock = this.springTime = 0;
  }

  // a spring / launcher: fly off with this speed
  launch(vx: number, vy: number) {
    this.onGround = false;
    this.vx = vx;
    this.vy = vy;
    this.y -= 2;
    this.sliding = this.stomping = this.jumping = false;
    this.springTime = 0.4;
    this.coyote = 0;
    this.events.push("spring");
  }

  // a booster on the ground: shoot this way at (at least) this speed
  boost(dir: number, speed: number) {
    if (!this.onGround) return;
    const now = Math.sign(this.gsp) === dir ? Math.abs(this.gsp) : 0;
    if (now < speed) {
      this.gsp = dir * speed;
      this.facing = dir;
      this.events.push("boost");
    }
  }

  update(dt: number, pad: Pad, t: Terrain) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevRunPhase = this.runPhase;
    this.events.length = 0;
    this.jumpBuf = pad.jumpPressed ? P.jumpBuffer : Math.max(0, this.jumpBuf - dt);
    this.coyote = Math.max(0, this.coyote - dt);
    this.wallCoyote = Math.max(0, this.wallCoyote - dt);
    this.lock = Math.max(0, this.lock - dt);
    this.springTime = Math.max(0, this.springTime - dt);

    if (this.onGround) this.groundStep(dt, pad, t);
    else this.airStep(dt, pad, t);

    this.updatePose(dt, pad);
  }

  // ======================= ON THE GROUND =======================
  private groundStep(dt: number, pad: Pad, t: Terrain) {
    const dir = pad.dir;
    const sin = Math.sin(this.angle);
    const ceiling = this.ceilingAbove(t);

    // ↓ = slide (fast) or crawl (slow). Let go of ↓ = stand up (if there's room)
    if (pad.down && !this.sliding) {
      this.sliding = true;
      if (Math.abs(this.gsp) >= P.slideMinSpeed) this.events.push("slide");
    }
    if (this.sliding && !pad.down && !ceiling) this.sliding = false;

    // hills: downhill speeds you up, uphill slows you down
    const goingDown = this.gsp === 0 ? true : Math.sign(this.gsp) === Math.sign(sin);
    const mul = this.sliding ? (goingDown ? P.slideDownhill : P.slideUphill) : goingDown ? P.slopeDownhill : P.slopeUphill;
    const resting = dir === 0 && Math.abs(this.angle) < P.slopeRest * DEG && Math.abs(this.gsp) < 60;
    if (!resting) this.gsp += P.gravity * sin * mul * dt;

    // running
    this.skidding = false;
    if (!this.sliding || Math.abs(this.gsp) > P.crawlSpeed + 60) this.crawling = false;
    else if (Math.abs(this.gsp) < P.slideMinSpeed * 0.6) this.crawling = true;
    if (this.sliding && ceiling) {
      // under something low: keep sliding through it (never slower than lowScoot)
      const way = dir !== 0 ? dir : this.gsp !== 0 ? Math.sign(this.gsp) : this.facing;
      this.gsp = way * Math.max(Math.abs(this.gsp), P.lowScoot);
      this.crawling = false;
    } else if (this.sliding && !this.crawling) {
      this.slowDown(P.slideFriction * dt);
    } else if (this.crawling) {
      // crawling: slow and steady
      if (dir !== 0) this.gsp = dir * P.crawlSpeed;
      else this.slowDown(P.friction * 2 * dt);
    } else if (dir !== 0) {
      if (this.gsp !== 0 && Math.sign(this.gsp) !== dir) {
        // braking
        const before = this.gsp;
        this.gsp += dir * P.skidDecel * dt;
        if (Math.sign(this.gsp) !== Math.sign(before)) this.gsp = dir * 40; // turned around
        this.skidding = Math.abs(before) > 220;
      } else if (Math.abs(this.gsp) < P.topRunSpeed) {
        const k = Math.abs(this.gsp) / P.topRunSpeed;
        const acc = P.runAccel + (P.runAccelTop - P.runAccel) * k;
        this.gsp += dir * acc * dt;
        if (Math.abs(this.gsp) > P.topRunSpeed) this.gsp = dir * P.topRunSpeed;
      } else if (Math.abs(this.angle) < 8 * DEG) {
        // faster than your legs can go (from a hill or a booster): it drains slowly on flat ground
        this.slowDown(P.overSpeedDrag * dt, P.topRunSpeed);
      }
    } else {
      this.slowDown(P.friction * dt);
    }
    if (dir !== 0 && !this.skidding) this.facing = dir;
    else if (Math.abs(this.gsp) > 60) this.facing = Math.sign(this.gsp);
    this.gsp = Math.max(-P.maxSpeed, Math.min(P.maxSpeed, this.gsp));

    // jump (also right after landing, if you pressed it a moment before)
    if (this.jumpBuf > 0 && !ceiling) {
      this.groundJump();
      return;
    }

    this.moveAlongGround(dt, t);
  }

  private slowDown(amount: number, floor = 0) {
    const s = Math.abs(this.gsp);
    if (s <= floor) return;
    const next = Math.max(floor, s - amount);
    this.gsp = Math.sign(this.gsp) * next;
  }

  private groundJump() {
    const vxg = this.gsp * Math.cos(this.angle);
    const vyg = this.gsp * Math.sin(this.angle);
    this.vx = vxg;
    // running up a hill adds some of that upward speed to the jump
    this.vy = -P.jumpSpeed + Math.min(0, vyg) * P.jumpFromSlope;
    this.onGround = false;
    this.jumping = true;
    this.sliding = false;
    this.jumpBuf = 0;
    this.coyote = 0;
    this.y -= 1;
    this.events.push("jump");
  }

  private moveAlongGround(dt: number, t: Terrain) {
    const dist = this.gsp * dt;
    const steps = Math.max(1, Math.ceil(Math.abs(dist) / 6));
    const step = dist / steps;
    const side = Math.sign(step);
    for (let i = 0; i < steps; i++) {
      const cos = Math.cos(this.angle);
      const sin = Math.sin(this.angle);
      const nx = this.x + step * cos;
      const ey = this.y + step * sin;
      const h = this.height;
      // a wall in front: a block, or ground too steep to run up
      if (
        side !== 0 &&
        (t.boxHitsBlock(nx - P.halfWidth, ey - h + 2, nx + P.halfWidth, ey - P.stepUp) ||
          t.steepAt(nx + side * P.halfWidth, ey - h, ey - 3))
      ) {
        if (Math.abs(this.gsp) > 500) this.events.push("bonk");
        this.gsp = 0;
        break;
      }
      // stay glued to the ground
      const snap = P.groundSnap + Math.abs(this.gsp) * P.groundSnapPerSpeed;
      const hit = t.groundBelow(nx, Math.min(this.y, ey) - P.stepUp, Math.max(this.y, ey) + snap);
      if (!hit) {
        // ran off an edge (or the end of a ramp): fly
        this.x = nx;
        this.y = ey;
        this.leaveGround();
        return;
      }
      // over a sharp edge where the ground drops away, at speed: fly off it
      const turn = (hit.angle - this.angle) * side;
      if (turn > P.launchAngle * DEG && Math.abs(this.gsp) > P.launchSpeed) {
        this.x = nx;
        this.y = ey;
        this.leaveGround();
        return;
      }
      this.x = nx;
      this.y = hit.y;
      this.angle = hit.angle;
    }
    this.vx = this.gsp * Math.cos(this.angle);
    this.vy = this.gsp * Math.sin(this.angle);
  }

  private leaveGround() {
    this.vx = this.gsp * Math.cos(this.angle);
    this.vy = this.gsp * Math.sin(this.angle);
    this.onGround = false;
    this.sliding = false;
    this.coyote = P.coyoteTime;
  }

  private ceilingAbove(t: Terrain): boolean {
    if (!this.sliding) return false;
    return (
      t.boxHitsBlock(this.x - P.halfWidth + 2, this.y - P.height, this.x + P.halfWidth - 2, this.y - P.slideHeight - 1) ||
      t.solidAt(this.x, this.y - P.height + 2)
    );
  }

  // ======================= IN THE AIR =======================
  private airStep(dt: number, pad: Pad, t: Terrain) {
    const dir = pad.dir;

    // jumps in the air: a late jump off an edge, a wall jump, or a stomp
    if (this.jumpBuf > 0) {
      if (this.coyote > 0) {
        this.vy = -P.jumpSpeed;
        this.jumping = true;
        this.coyote = 0;
        this.jumpBuf = 0;
        this.events.push("jump");
      } else if (this.wallDir !== 0 || this.wallCoyote > 0) {
        const away = -(this.wallDir || this.lastWallDir);
        this.vx = away * P.wallJumpX;
        this.vy = -P.wallJumpY;
        this.facing = away;
        this.lock = P.wallJumpLock;
        this.jumping = true;
        this.wallDir = 0;
        this.wallCoyote = 0;
        this.jumpBuf = 0;
        this.stomping = false;
        this.events.push("walljump");
      } else if (pad.down && !this.stomping) {
        this.startStomp();
        this.jumpBuf = 0;
      }
    }
    if (pad.downPressed && pad.jump && !this.stomping && this.wallDir === 0) this.startStomp();

    // steering
    if (!this.stomping && this.lock <= 0) {
      if (dir !== 0) {
        if (Math.sign(this.vx) !== dir || Math.abs(this.vx) < P.airTopSpeed) {
          const before = Math.abs(this.vx);
          this.vx += dir * P.airAccel * dt;
          if (Math.sign(this.vx) === dir && Math.abs(this.vx) > P.airTopSpeed && before <= P.airTopSpeed) this.vx = dir * P.airTopSpeed;
        }
        this.facing = dir;
      } else {
        this.vx *= Math.max(0, 1 - P.airDrag * dt);
      }
    }

    // gravity (and the small hop when you let go of jump early)
    if (this.jumping && !pad.jump && this.vy < -P.jumpCut && this.springTime <= 0) {
      this.vy = -P.jumpCut;
      this.jumping = false;
    }
    if (this.vy >= P.apexWindow || !pad.jump) this.jumping = false;
    let g = P.gravity;
    // holding jump at the very top of the jump = a little hang time; falling pulls harder
    if (this.jumping && Math.abs(this.vy) < P.apexWindow) g *= P.apexGravity;
    else if (this.vy > 0) g *= P.fallGravity;
    if (this.stomping) this.vy = P.stompSpeed;
    else this.vy = Math.min(P.maxFall, this.vy + g * dt);

    // move, a little at a time, so you never go through anything even at top speed
    const dx = this.vx * dt;
    const dy = this.vy * dt;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 6));
    let touching = 0;
    for (let i = 0; i < steps; i++) {
      // sideways
      const nx = this.x + dx / steps;
      const side = Math.sign(dx);
      if (side !== 0 && this.blockedSide(nx, side, t)) {
        touching = side;
        this.vx = 0;
      } else this.x = nx;
      // up / down
      const ny = this.y + dy / steps;
      if (this.vy < 0) {
        if (t.boxHitsBlock(this.x - P.halfWidth + 2, ny - P.height, this.x + P.halfWidth - 2, ny - P.height + 3) || t.solidAt(this.x, ny - P.height)) {
          this.vy = 0;
          this.jumping = false;
          break;
        }
      }
      const hit = t.groundBelow(this.x, Math.min(this.y, ny) - 30, Math.max(this.y, ny) + 0.5);
      if (hit && hit.y <= ny + 0.01 && (this.vy >= 0 || hit.y < this.y - 0.5)) {
        this.land(hit);
        return;
      }
      this.y = ny;
    }

    // stuck inside something (rare): push out sideways
    if (t.solidAt(this.x, this.y - 4)) {
      for (let d = 2; d <= 30; d += 2) {
        if (!t.solidAt(this.x - d, this.y - 4)) {
          this.x -= d;
          break;
        }
        if (!t.solidAt(this.x + d, this.y - 4)) {
          this.x += d;
          break;
        }
      }
    }

    // sliding down a wall (hold toward it)
    if (touching === 0 && dir !== 0 && this.blockedSide(this.x + dir * 2, dir, t)) touching = dir;
    this.wallDir = touching !== 0 && touching === dir && !this.stomping ? touching : 0;
    if (this.wallDir !== 0) {
      this.lastWallDir = this.wallDir;
      this.wallCoyote = P.wallCoyote;
      if (this.vy > P.wallSlideSpeed) this.vy = P.wallSlideSpeed;
      this.jumping = false;
    }
  }

  private startStomp() {
    this.stomping = true;
    this.jumping = false;
    this.vx *= P.stompKeepX;
    this.events.push("stompstart");
  }

  private blockedSide(nx: number, side: number, t: Terrain): boolean {
    const h = P.height;
    return (
      t.boxHitsBlock(nx - P.halfWidth, this.y - h + 2, nx + P.halfWidth, this.y - 4) ||
      t.solidAt(nx + side * P.halfWidth, this.y - h * 0.55) ||
      t.solidAt(nx + side * P.halfWidth, this.y - h + 6)
    );
  }

  private land(hit: GroundHit) {
    const impact = this.vy;
    this.onGround = true;
    this.y = hit.y;
    this.angle = hit.angle;
    // your speed carries into the ground: landing on a downhill keeps (or adds) speed
    this.gsp = this.vx * Math.cos(hit.angle) + this.vy * Math.sin(hit.angle);
    if (this.stomping) {
      this.gsp *= 0.3;
      this.events.push("stompland");
    } else if (impact > 1100) this.events.push("hardland");
    else this.events.push("land");
    this.stomping = false;
    this.jumping = false;
    this.wallDir = 0;
    this.lock = 0;
  }

  // ======================= WHICH POSE TO DRAW =======================
  private updatePose(dt: number, pad: Pad) {
    if (this.onGround) {
      const s = Math.abs(this.gsp);
      if (this.sliding) this.pose = this.crawling ? "crawl" : "slide";
      else if (this.skidding) this.pose = "skid";
      else if (s > 15 || pad.dir !== 0) this.pose = "run";
      else this.pose = "idle";
      // legs go round faster the faster you run (but not so fast they flicker: longer strides instead)
      const rate = this.pose === "crawl" ? Math.min(14, s / 14) : Math.min(19, 3 + s / 62);
      this.runPhase += rate * dt;
    } else {
      if (this.stomping) this.pose = "stomp";
      else if (this.wallDir !== 0 && this.vy > 0) this.pose = "wall";
      else this.pose = this.vy < 0 ? "jump" : "fall";
      this.runPhase += 14 * dt;
    }
  }
}
