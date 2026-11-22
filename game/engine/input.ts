// THE CONTROLS: keyboard + gamepad, turned into simple buttons the game asks about.
//   ← → / A D = run      SPACE / Z / ↑ / W = jump      ↓ / S = slide (and stomp in the air)      ESC / P = pause
//   R = back to the start      V = switch the look (ASCII / paper)      F2 = the tuning numbers on screen
// Gamepad: left stick or d-pad = run / slide, A = jump, B = slide, START = pause.

export type Button = "left" | "right" | "down" | "jump" | "pause" | "restart" | "debug" | "look";

const KEYS: Record<string, Button> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowDown: "down",
  KeyS: "down",
  Space: "jump",
  KeyZ: "jump",
  ArrowUp: "jump",
  KeyW: "jump",
  Escape: "pause",
  KeyP: "pause",
  KeyR: "restart",
  F2: "debug",
  KeyV: "look",
  Backquote: "debug",
};

export class Input {
  private keyHeld = new Set<Button>();
  private padHeld = new Set<Button>();
  private pressed = new Set<Button>(); // pressed since the game last asked
  private padWas = new Set<Button>();
  private onDown = (e: KeyboardEvent) => {
    const b = KEYS[e.code];
    if (!b) return;
    e.preventDefault(); // (so the arrows and space don't scroll the page)
    if (!e.repeat && !this.keyHeld.has(b)) this.pressed.add(b);
    this.keyHeld.add(b);
  };
  private onUp = (e: KeyboardEvent) => {
    const b = KEYS[e.code];
    if (!b) return;
    e.preventDefault();
    this.keyHeld.delete(b);
  };
  private onBlur = () => this.keyHeld.clear();

  constructor() {
    window.addEventListener("keydown", this.onDown);
    window.addEventListener("keyup", this.onUp);
    window.addEventListener("blur", this.onBlur);
  }

  destroy() {
    window.removeEventListener("keydown", this.onDown);
    window.removeEventListener("keyup", this.onUp);
    window.removeEventListener("blur", this.onBlur);
  }

  // read the gamepad (called once per screen frame)
  pollGamepad() {
    this.padHeld.clear();
    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      const btn = (i: number) => !!p.buttons[i]?.pressed;
      if (ax < -0.35 || btn(14)) this.padHeld.add("left");
      if (ax > 0.35 || btn(15)) this.padHeld.add("right");
      if (ay > 0.55 || btn(13) || btn(1)) this.padHeld.add("down");
      if (btn(0) || btn(12)) this.padHeld.add("jump");
      if (btn(9)) this.padHeld.add("pause");
      if (btn(8)) this.padHeld.add("restart");
    }
    for (const b of this.padHeld) if (!this.padWas.has(b)) this.pressed.add(b);
    this.padWas = new Set(this.padHeld);
  }

  held(b: Button): boolean {
    return this.keyHeld.has(b) || this.padHeld.has(b);
  }

  // true once per press
  take(b: Button): boolean {
    if (!this.pressed.has(b)) return false;
    this.pressed.delete(b);
    return true;
  }
}
