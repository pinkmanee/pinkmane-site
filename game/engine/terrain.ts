// THE GROUND: turns a level file into lines you can run on, and answers "where's the floor?" and "is this spot solid?".

import { PHYSICS } from "../config/physics";
import type { LevelData, PathCmd } from "../levels/types";

// one straight bit of ground (curves are cut into lots of these)
export type Seg = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  slope: number; // how much y changes per 1 px of x
  angle: number; // radians. Positive = going DOWN to the right
  walkable: boolean; // false = too steep: it's a wall
  fill: boolean; // true = everything under it is solid (ground). false = the top of a block
};
export type Block = { x: number; y: number; w: number; h: number };
export type GroundHit = { y: number; angle: number };

const CELL = 256; // the level is split into strips this wide, so we only check the ground near you
const CURVE_STEP = 10; // a curve is cut into straight bits about this long (px). Smaller = smoother, slower

// a path (M / L / Q commands) -> a list of points
export function flattenPath(path: PathCmd[]): [number, number][] {
  const pts: [number, number][] = [];
  let cx = 0;
  let cy = 0;
  for (const c of path) {
    if (c[0] === "M" || c[0] === "L") {
      cx = c[1];
      cy = c[2];
      pts.push([cx, cy]);
    } else {
      const [, qx, qy, x, y] = c as ["Q", number, number, number, number];
      const len = Math.hypot(qx - cx, qy - cy) + Math.hypot(x - qx, y - qy);
      const n = Math.max(2, Math.ceil(len / CURVE_STEP));
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        pts.push([u * u * cx + 2 * u * t * qx + t * t * x, u * u * cy + 2 * u * t * qy + t * t * y]);
      }
      cx = x;
      cy = y;
    }
  }
  return pts;
}

export class Terrain {
  segs: Seg[] = [];
  blocks: Block[];
  paths: [number, number][][] = []; // the ground's outline, for drawing
  bottom: number;
  private grid = new Map<number, Seg[]>();

  constructor(level: LevelData) {
    this.bottom = level.bounds.bottom;
    this.blocks = level.blocks.map((b) => ({ ...b }));
    const maxA = (PHYSICS.maxWalkAngle * Math.PI) / 180;
    for (const g of level.ground) {
      const pts = flattenPath(g.path);
      this.paths.push(pts);
      for (let i = 0; i < pts.length - 1; i++) this.add(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], true, maxA);
    }
    // the tops of blocks are ground too
    for (const b of this.blocks) this.add(b.x, b.y, b.x + b.w, b.y, false, maxA);
  }

  private add(x1: number, y1: number, x2: number, y2: number, fill: boolean, maxA: number) {
    if (x2 - x1 < 0.01) return; // straight up or going backwards: not ground (use a block for a wall)
    const slope = (y2 - y1) / (x2 - x1);
    const angle = Math.atan(slope);
    const seg: Seg = { x1, y1, x2, y2, slope, angle, walkable: Math.abs(angle) <= maxA, fill };
    this.segs.push(seg);
    for (let c = Math.floor(x1 / CELL); c <= Math.floor(x2 / CELL); c++) {
      let list = this.grid.get(c);
      if (!list) {
        list = [];
        this.grid.set(c, list);
      }
      list.push(seg);
    }
  }

  private near(x: number): Seg[] {
    return this.grid.get(Math.floor(x / CELL)) ?? [];
  }

  // the highest ground you could stand on at x, somewhere between yTop and yBottom (null = nothing there)
  groundBelow(x: number, yTop: number, yBottom: number): GroundHit | null {
    let best: GroundHit | null = null;
    for (const s of this.near(x)) {
      if (!s.walkable || x < s.x1 || x > s.x2) continue;
      const y = s.y1 + (x - s.x1) * s.slope;
      if (y < yTop || y > yBottom) continue;
      if (!best || y < best.y) best = { y, angle: s.angle };
    }
    return best;
  }

  // ground too steep to stand on at x, somewhere between yTop and yBottom (= a wall made of ground)
  steepAt(x: number, yTop: number, yBottom: number): boolean {
    for (const s of this.near(x)) {
      if (s.walkable || x < s.x1 || x > s.x2) continue;
      const y = s.y1 + (x - s.x1) * s.slope;
      if (y >= yTop && y <= yBottom) return true;
    }
    return false;
  }

  // is this spot inside the ground or a block?
  solidAt(x: number, y: number): boolean {
    for (const s of this.near(x)) {
      if (!s.fill || x < s.x1 || x >= s.x2) continue;
      if (s.y1 + (x - s.x1) * s.slope <= y) return true;
    }
    for (const b of this.blocks) if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) return true;
    return false;
  }

  // does this box (left, top, right, bottom) touch a block?
  boxHitsBlock(l: number, t: number, r: number, btm: number): boolean {
    for (const b of this.blocks) if (r > b.x && l < b.x + b.w && btm > b.y && t < b.y + b.h) return true;
    return false;
  }
}
