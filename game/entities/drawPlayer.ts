// HOW PINKMANE IS DRAWN (for now): a stick figure made in code with no face, a pink mohawk and baggy grey pants.
// Every pose is a few joint angles, so it moves smoothly. When your drawn sprite sheets are ready
// (the sizes are in the notes that came with this), they replace this.

import { PHYSICS as P } from "../config/physics";
import type { Player, Pose } from "./player";

export const LOOK = {
  ink: "#16111d", // outlines
  skin: "#fff8ee", // the head
  mohawk: "#ff3bd0", // the pink mohawk
  mohawkDark: "#b8188f",
  pants: "#6d6a78", // baggy grey pants
  shirt: "#1d1824", // black shirt
};

type Rig = {
  hipY: number; // how high the hips are (negative = up)
  lean: number; // body tilt (radians, + = forward)
  legF: [number, number]; // front leg: thigh angle, knee bend (radians; 0 = straight down, + = forward)
  legB: [number, number];
  armF: [number, number]; // front arm: upper arm angle, elbow bend
  armB: [number, number];
  hair: number; // how far the mohawk sweeps back
};

const polar = (a: number, len: number): [number, number] => [Math.sin(a) * len, Math.cos(a) * len];

function rigFor(pose: Pose, p: Player, t: number): Rig {
  const s = p.speed;
  const k = Math.min(1, s / P.topRunSpeed);
  const fast = Math.min(1, Math.max(0, (s - P.topRunSpeed) / (P.maxSpeed - P.topRunSpeed)));
  const ph = p.runPhase;
  switch (pose) {
    case "run": {
      const A = 0.32 + 0.6 * k;
      // thigh swings back and forth; the knee bends most just after the leg passes under you (heel kicks up)
      const leg = (o: number): [number, number] => [Math.sin(ph + o) * A + 0.1 * k, -(0.15 + 1.55 * Math.max(0, Math.cos(ph + o - 0.4))) * (0.5 + 0.5 * k)];
      const arm = (o: number): [number, number] => [-Math.sin(ph + o) * A * 1.15, 0.6 + 0.9 * k];
      return {
        hipY: -26 - Math.abs(Math.cos(ph)) * 3 * k + 2 * k,
        lean: 0.06 + 0.3 * k + 0.25 * fast,
        legF: leg(0),
        legB: leg(Math.PI),
        armF: arm(0),
        armB: arm(Math.PI),
        hair: 0.2 + 0.7 * k + 0.4 * fast,
      };
    }
    case "skid":
      return { hipY: -22, lean: -0.38, legF: [0.75, -0.05], legB: [-0.25, -0.7], armF: [-1.4, 0.4], armB: [2.4, 0.5], hair: 0.9 };
    case "jump":
      return { hipY: -27, lean: 0.12, legF: [1.0, -1.4], legB: [-0.2, -0.7], armF: [2.6, 0.3], armB: [-0.6, 0.6], hair: 0.6 };
    case "fall": {
      const w = Math.sin(t * 13) * 0.35;
      return { hipY: -27, lean: 0, legF: [0.35, -0.45], legB: [-0.15, -0.25], armF: [2.4 + w, 0.4], armB: [2.8 - w, 0.4], hair: -0.3 };
    }
    case "slide":
      return { hipY: -12, lean: -1.05, legF: [1.45, -0.05], legB: [1.05, -0.8], armF: [1.5, 0.2], armB: [-1.0, 0.1], hair: 1.2 };
    case "crawl": {
      const c = Math.sin(ph);
      return { hipY: -15, lean: 1.25, legF: [0.2 + c * 0.4, -1.7], legB: [0.2 - c * 0.4, -1.7], armF: [0.9 - c * 0.5, -0.4], armB: [0.9 + c * 0.5, -0.4], hair: 0.4 };
    }
    case "wall":
      return { hipY: -26, lean: -0.15, legF: [0.75, -1.25], legB: [0.15, -0.45], armF: [2.7, 0.3], armB: [1.4, 0.6], hair: -0.2 };
    case "stomp":
      return { hipY: -32, lean: 0.25, legF: [1.65, -2.3], legB: [1.4, -2.1], armF: [0.5, 1.0], armB: [0.2, 1.2], hair: -0.8 };
    default: {
      const b = Math.sin(t * 2.2);
      return { hipY: -26 + b * 0.6, lean: 0.02, legF: [0.08, -0.06], legB: [-0.08, -0.04], armF: [0.15 + b * 0.04, 0.3], armB: [-0.12 - b * 0.04, 0.25], hair: 0.1 + b * 0.05 };
    }
  }
}

// draw him at (x, y) = the middle of his feet, tilted by angle, facing left (-1) or right (1)
export function drawPlayer(ctx: CanvasRenderingContext2D, p: Player, x: number, y: number, angle: number, t: number) {
  const r = rigFor(p.pose, p, t);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(p.facing, 1);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const hip: [number, number] = [0, r.hipY];
  const up = (a: number, len: number): [number, number] => [Math.sin(a) * len, -Math.cos(a) * len];
  const sh = up(r.lean, 17);
  const shoulder: [number, number] = [hip[0] + sh[0], hip[1] + sh[1]];
  const hd = up(r.lean * 0.7, 12);
  const head: [number, number] = [shoulder[0] + hd[0], shoulder[1] + hd[1]];

  const limb = (from: [number, number], a1: number, bend: number, l1: number, l2: number) => {
    const m = polar(a1, l1);
    const mid: [number, number] = [from[0] + m[0], from[1] + m[1]];
    const e = polar(a1 + bend, l2);
    return { mid, end: [mid[0] + e[0], mid[1] + e[1]] as [number, number] };
  };
  const line = (pts: [number, number][], w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  };
  const leg = (rig: [number, number], back: boolean) => {
    const l = limb(hip, rig[0] + r.lean * 0.3, rig[1], 13, 13);
    // baggy pants: a thick grey line with an ink outline
    line([hip, l.mid, l.end], 11, LOOK.ink);
    line([hip, l.mid, l.end], 7, back ? "#57545f" : LOOK.pants);
    // shoe
    ctx.fillStyle = LOOK.ink;
    ctx.beginPath();
    ctx.ellipse(l.end[0] + 3, l.end[1] + 1, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  const arm = (rig: [number, number]) => {
    const a = limb(shoulder, rig[0] + r.lean, rig[1], 10, 10);
    line([shoulder, a.mid, a.end], 4, LOOK.ink);
    ctx.fillStyle = LOOK.ink;
    ctx.beginPath();
    ctx.arc(a.end[0], a.end[1], 2.6, 0, Math.PI * 2);
    ctx.fill();
  };

  leg(r.legB, true);
  arm(r.armB);
  // body (black shirt)
  line([hip, shoulder], 7, LOOK.ink);
  // head: no face
  ctx.fillStyle = LOOK.skin;
  ctx.strokeStyle = LOOK.ink;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.arc(head[0], head[1], 9.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // the pink mohawk: chunky spikes along the top of the head, swept back when you're fast
  const tilt = r.lean * 0.7;
  ctx.fillStyle = LOOK.mohawk;
  ctx.strokeStyle = LOOK.ink;
  ctx.lineWidth = 1.6;
  const spikes = 6;
  for (let i = 0; i < spikes; i++) {
    const f = i / (spikes - 1); // 0 = back of the head, 1 = front
    const a = tilt + (-1.05 + f * 1.75); // where on the head (0 = straight up)
    const len = 8 + Math.sin(f * Math.PI) * 8;
    const sweep = -r.hair * (0.3 + 0.25 * (1 - f));
    const base1 = up(a - 0.26, 8);
    const base2 = up(a + 0.26, 8);
    const tip = up(a + sweep, 8 + len);
    ctx.beginPath();
    ctx.moveTo(head[0] + base1[0], head[1] + base1[1]);
    ctx.lineTo(head[0] + tip[0], head[1] + tip[1]);
    ctx.lineTo(head[0] + base2[0], head[1] + base2[1]);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  leg(r.legF, false);
  arm(r.armF);
  ctx.restore();
}
