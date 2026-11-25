"use client";

import { useEffect, useRef, useState } from "react";

// GAME CONTROLLERS (Xbox, PlayStation, Switch Pro, any pad a browser can see: USB or Bluetooth).
// The controller simply presses the same keys the keyboard would, so every game works without knowing about it:
//   d-pad / left stick = the arrow keys      A (X on PlayStation) = OK / jump / the game's main button
//   B (circle) = back in the menus, the second button in a game      START = pause      SELECT = leave the game
// Each game can have its own buttons: see PROFILES below.
//
// How a page uses it:
//   <GamepadBridge mode={playing ? activeGame : "menu"} ready={entered} font={pixelFont.style.fontFamily} />
//   mode  = which set of buttons is on ("menu", a game's id, or a function that answers that every frame)
//   ready = false while the controller should do nothing (the CLICK TO START screen: browsers only let sound
//           start after a real click or key press, a controller button doesn't count)
// It does nothing at all until a controller is plugged in and a button on it is pressed.

type Btn = "a" | "b" | "x" | "y" | "lb" | "rb" | "lt" | "rt" | "select" | "start";
// what a button does: a key name ("Enter", " ", "ArrowUp", "f"...), or a special job starting with @
type Profile = Partial<Record<Btn, string>> & {
  stick?: "arrows" | "sideways" | "hell"; // what the left stick does (default: the arrow keys)
  off?: boolean; // the game reads the controller itself: stay out of the way
};

// CHANGE THE BUTTONS HERE.  " " = the space bar.
const MENU: Profile = { a: "Enter", start: "Enter", b: "Backspace", select: "Backspace", lb: "ArrowLeft", rb: "ArrowRight" };
// every game that isn't listed below: A / B / X / RT = space (jump, flap, fly, drop a bomb), START = pause, SELECT = leave
const GAME: Profile = { a: " ", b: " ", x: " ", rt: " ", start: "Escape", select: "Backspace" };
const PROFILES: Record<string, Profile> = {
  menu: MENU,
  // PINKMANE VOID: A = jump (hold = fly) and OK in its menus, B / X / RT = shoot (down), Y = fire
  super: { a: "@voidA", b: "ArrowDown", x: "ArrowDown", rt: "ArrowDown", y: "f", start: "Escape", select: "Backspace" },
  // PINK HELL: left stick = walk, hold A or RT = fire (aims at the nearest demon, like on a phone), X / Y = next weapon
  hell: { stick: "hell", a: "@hellFire", rt: "@hellFire", b: "@hellFire", x: "q", y: "q", start: "Escape", select: "Backspace" },
  // PINK KART while driving: A / RT = gas, B / LT = brake, X / LB / RB = use your item, Y = back on the road, START = pause menu.
  // The stick only steers (so pulling it down a little in a corner doesn't brake); the d-pad does all four.
  kart: { stick: "sideways", a: "ArrowUp", rt: "ArrowUp", b: "ArrowDown", lt: "ArrowDown", x: " ", lb: " ", rb: " ", y: "r", start: "Escape" },
  // PINK RUSH reads the controller itself (game/engine/input.ts)
  rush: { off: true },
};

// which numbered button on a standard controller is which
const BTN_AT: Record<Btn, number> = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, lt: 6, rt: 7, select: 8, start: 9 };
const DPAD: [number, string][] = [
  [12, "ArrowUp"],
  [13, "ArrowDown"],
  [14, "ArrowLeft"],
  [15, "ArrowRight"],
];
const STICK_ON = 0.5; // how far the stick must be pushed to count as an arrow key
const REPEAT_FIRST = 380; // menus: holding a direction repeats after this long (ms)...
const REPEAT_NEXT = 130; // ...and then this often

const CODES: Record<string, string> = { " ": "Space", Enter: "Enter", Escape: "Escape", Backspace: "Backspace" };
const codeOf = (key: string) => CODES[key] ?? (key.startsWith("Arrow") ? key : key.length === 1 ? `Key${key.toUpperCase()}` : key);

function sendKey(type: "keydown" | "keyup", key: string, repeat = false) {
  const where = (document.activeElement as HTMLElement | null) ?? document.body;
  const passed = where.dispatchEvent(new KeyboardEvent(type, { key, code: codeOf(key), bubbles: true, cancelable: true, repeat }));
  // a real ENTER on a highlighted button also clicks it; a pretend one has to do that itself
  // (unless the page already used the key for something else, as the iPod and the shop do)
  if (type === "keydown" && key === "Enter" && passed && !repeat && where !== document.body && where.matches("button, a[href], [role=button]")) where.click();
}

export default function GamepadBridge({ mode, ready = true, font }: { mode: string | (() => string); ready?: boolean; font?: string }) {
  const [toast, setToast] = useState("");
  const live = useRef({ mode, ready });
  live.current = { mode, ready };

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return;
    let raf = 0;
    let toastTimer = 0;
    let awake = false; // a button has been pressed on a controller (browsers hide controllers until then)
    let lastMode = "";
    const held = new Map<string, number>(); // what's "pressed" right now -> when it next repeats (menus)
    const stale = new Set<string>(); // buttons still down from before the buttons changed meaning: ignored until let go
    let hellMoving = false;
    let hellFiring = false;

    const say = (text: string) => {
      setToast(text);
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(""), 2600);
    };

    // the special jobs
    const special = (job: string, down: boolean) => {
      if (job === "@voidA") window.dispatchEvent(new CustomEvent("pinkmane-pad", { detail: { btn: "a", down } }));
      else if (job === "@hellFire") {
        hellFiring = down;
        window.dispatchEvent(new CustomEvent("pinkmane-hell-stick", { detail: { stick: "fire", x: 0, y: 0, on: down } }));
      }
    };
    const press = (what: string) => {
      if (what.startsWith("@")) special(what, true);
      else sendKey("keydown", what);
    };
    const release = (what: string) => {
      if (what.startsWith("@")) special(what, false);
      else sendKey("keyup", what);
    };
    const releaseAll = () => {
      for (const what of held.keys()) release(what);
      held.clear();
      if (hellMoving) window.dispatchEvent(new CustomEvent("pinkmane-hell-stick", { detail: { stick: "move", x: 0, y: 0, on: false } }));
      hellMoving = false;
      if (hellFiring) special("@hellFire", false);
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const pads = Array.from(navigator.getGamepads()).filter((p): p is Gamepad => !!p && p.connected);
      if (!pads.length) {
        if (held.size || hellMoving) releaseAll();
        return;
      }
      const down = (i: number) => pads.some((p) => !!p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      if (!awake) {
        if (!pads.some((p) => p.buttons.some((b) => b.pressed))) return;
        awake = true;
        say("CONTROLLER ON");
      }
      // the left stick (the strongest push of any connected controller)
      let sx = 0;
      let sy = 0;
      for (const p of pads) {
        if (Math.abs(p.axes[0] ?? 0) > Math.abs(sx)) sx = p.axes[0];
        if (Math.abs(p.axes[1] ?? 0) > Math.abs(sy)) sy = p.axes[1];
      }
      const pushed = Math.max(Math.abs(sx), Math.abs(sy)) > STICK_ON;
      const { mode: m, ready: ok } = live.current;
      const modeNow = typeof m === "function" ? m() : m;
      const profile: Profile = PROFILES[modeNow] ?? GAME;

      // the buttons just changed meaning (a game opened or closed): let go of everything, and whatever is still
      // held down doesn't count until it's released (so the A that opened a game doesn't also jump in it)
      if (modeNow !== lastMode) {
        releaseAll();
        stale.clear();
        for (const b of Object.keys(BTN_AT) as Btn[]) if (down(BTN_AT[b])) stale.add(b);
        for (const [i, key] of DPAD) if (down(i)) stale.add(key);
        if (pushed) stale.add("stick");
        lastMode = modeNow;
      }
      if (!ok || profile.off || document.hidden) {
        if (held.size || hellMoving) releaseAll();
        return;
      }

      // ---- what should be "pressed" this frame ----
      const want = new Set<string>();
      for (const b of Object.keys(BTN_AT) as Btn[]) {
        const isDown = down(BTN_AT[b]);
        if (!isDown) stale.delete(b);
        let job = profile[b];
        if (!job || !isDown || stale.has(b)) continue;
        // a card is open on top (daily reward, drop alerts): B closes it
        if (job === "Backspace" && document.querySelector('[role="dialog"]')) job = "Escape";
        want.add(job);
      }
      for (const [i, key] of DPAD) {
        const isDown = down(i);
        if (!isDown) stale.delete(key);
        if (isDown && !stale.has(key)) want.add(key);
      }
      if (!pushed) stale.delete("stick");
      if (stale.has("stick")) {
        // (still pushed from before the buttons changed meaning: wait until it's back in the middle)
      } else if (profile.stick === "hell") {
        const on = Math.hypot(sx, sy) > 0.25;
        if (on || hellMoving) window.dispatchEvent(new CustomEvent("pinkmane-hell-stick", { detail: { stick: "move", x: sx, y: sy, on } }));
        hellMoving = on;
      } else {
        if (sx < -STICK_ON) want.add("ArrowLeft");
        if (sx > STICK_ON) want.add("ArrowRight");
        if (profile.stick !== "sideways") {
          if (sy < -STICK_ON) want.add("ArrowUp");
          if (sy > STICK_ON) want.add("ArrowDown");
        }
      }

      // ---- press what's new, let go of what's gone, repeat held directions in the menus ----
      const now = performance.now();
      for (const what of Array.from(held.keys())) {
        if (!want.has(what)) {
          held.delete(what);
          release(what);
        }
      }
      for (const what of want) {
        const next = held.get(what);
        if (next === undefined) {
          held.set(what, now + REPEAT_FIRST);
          press(what);
        } else if (modeNow === "menu" && (what === "ArrowUp" || what === "ArrowDown") && now >= next) {
          held.set(what, now + REPEAT_NEXT);
          sendKey("keydown", what, true);
        }
      }
    };

    const start = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const gone = () => {
      if (Array.from(navigator.getGamepads()).some((p) => p && p.connected)) return;
      releaseAll();
      if (awake) say("CONTROLLER OFF");
      awake = false;
    };
    window.addEventListener("gamepadconnected", start);
    window.addEventListener("gamepaddisconnected", gone);
    if (Array.from(navigator.getGamepads()).some((p) => p)) start();
    return () => {
      window.removeEventListener("gamepadconnected", start);
      window.removeEventListener("gamepaddisconnected", gone);
      cancelAnimationFrame(raf);
      window.clearTimeout(toastTimer);
      releaseAll();
    };
  }, []);

  if (!toast) return null;
  return (
    <div
      role="status"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 9200,
        padding: "8px 12px",
        fontFamily: font,
        fontSize: 9,
        color: "#fff",
        background: "#1a0a24",
        border: "2px solid #ff5fd2",
        boxShadow: "3px 3px 0 #000",
        pointerEvents: "none",
        whiteSpace: "nowrap",
      }}
    >
      {toast}
    </div>
  );
}
