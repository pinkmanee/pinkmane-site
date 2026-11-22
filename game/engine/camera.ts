// THE CAMERA: follows Pinkmane smoothly, looks ahead where he's going and zooms out a little at high speed.
// The numbers are in game/config/physics.ts (CAMERA).

import { CAMERA as C, PHYSICS } from "../config/physics";

const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  private look = 0;
  private ready = false;
  viewHeight: number = C.viewHeight; // how much of the world fits top to bottom (the ASCII look zooms in more)

  // how much to zoom so the right amount of the world fits on this screen
  baseZoom(viewW: number, viewH: number) {
    return Math.min(viewH / this.viewHeight, viewW / C.minViewWidth);
  }

  snap(x: number, y: number, viewW: number, viewH: number) {
    this.x = x;
    this.y = y - C.heightOffset;
    this.look = 0;
    this.zoom = this.baseZoom(viewW, viewH);
    this.ready = true;
  }

  // dt = real time since the last screen frame (the camera moves every frame, so it never jitters)
  update(dt: number, x: number, y: number, vx: number, vy: number, speed: number, viewW: number, viewH: number) {
    if (!this.ready) this.snap(x, y, viewW, viewH);
    const fast = Math.min(1, speed / PHYSICS.maxSpeed);
    const wantZoom = this.baseZoom(viewW, viewH) * (1 - C.zoomOutAtSpeed * fast);
    this.zoom += (wantZoom - this.zoom) * ease(C.zoomFollow, dt);
    const wantLook = Math.max(-C.lookAheadMax, Math.min(C.lookAheadMax, vx * C.lookAhead));
    this.look += (wantLook - this.look) * ease(C.lookAheadFollow, dt);
    this.x += (x + this.look - this.x) * ease(C.followX, dt);
    // falling fast: look down a bit so you see where you'll land
    const lookY = Math.max(-60, Math.min(180, vy * 0.14));
    this.y += (y - C.heightOffset + lookY - this.y) * ease(C.followY, dt);
  }
}
