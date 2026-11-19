"use client";

import { useEffect, useRef } from "react";

// THE GUN (computers only, not phones). A shooter-game view on the main page:
//   - the mouse is a pink aim, and PINKMANE's hand holds a pink pistol in the bottom right corner that follows it
//   - every left click is a SHOT: the ammo flies from the gun to where you clicked, and the click happens when it lands
//     (so whatever you shot still opens, blinks etc. like before, just a moment later)
//   - AMMO from the games: BULLET, FIREBALL, SPIKE SHOT (PINKMANE VOID), WEED LEAF (Pink Jetpack), BOMB (Pink Bomber)
//     RIGHT CLICK or the keys 1 - 5 = switch ammo
//   - shoot something you can click = a HIT; shoot the background = a bullet hole / burn mark that fades away
//   - sliders (BASS QUAKE, VOL) and the handheld's D-pad still react instantly
// It switches off inside the games (they use the mouse themselves) and on phones.
//
// The sound: public/sounds/shot.mp3

// OFF SWITCH: set this to false and the mouse is a normal mouse again
const GUN_ON = true;

const SHOT_SOUND = "/sounds/shot.mp3";
const SHOT_VOLUME = 0.35; // the shot is loud, so it plays at 35%
const HIT_VOLUME = 0.18; // the little impact sound
const AIM_SIZE = 34; // how big the aim is (pixels)
const AIM_COLOR = "#ff3bd0";
const AMMO_KEY = "pinkmane-ammo"; // remembers the last ammo you picked
// clicking these counts as a HIT (buttons, links, the iPod menu rows, the game list)
const HIT_TARGETS = "button, a, [role=button], [data-shoot], .gp-row";
// these get their click straight away (sliders you drag, the D-pad that holds a key down)
const INSTANT = "input, textarea, select, label, [data-instant], [data-noshoot]";

// ---------- the ammo ----------
type AmmoId = "bullet" | "fire" | "spike" | "leaf" | "bomb";
const AMMO: { id: AmmoId; name: string; speed: number; pitch: number; color: string[] }[] = [
  { id: "bullet", name: "BULLET", speed: 2000, pitch: 1, color: ["#ffd84a", "#ffffff"] },
  { id: "fire", name: "FIREBALL", speed: 1250, pitch: 0.78, color: ["#ffd84a", "#ff7a00", "#ff3b1a"] },
  { id: "spike", name: "SPIKE SHOT", speed: 1500, pitch: 1.25, color: ["#ff3bd0", "#ff8ad8", "#ffffff"] },
  { id: "leaf", name: "WEED LEAF", speed: 1100, pitch: 1.45, color: ["#3fc24a", "#8affc8", "#1b6b25"] },
  { id: "bomb", name: "BOMB", speed: 850, pitch: 0.6, color: ["#ffd84a", "#ff7a00", "#ff3b1a", "#ffffff"] },
];

// ---------- pictures (1 letter = 1 pixel) ----------
const INK = "#1a0618";
// the pistol, pointing left (the muzzle is on the left)
const GUN = [
  "...KKKKKKKKKKKKKKKKKKKKKKKK...",
  "..KLLLLLLLLLLLLLLLLLLLLLLLLK..",
  "KKKLPPPPPPPPPPPPPPPPPPPPPPPPK.",
  "KGKPPWPPPPPPPPPPPPPPPKDKDKDPK.",
  "KKKPPPPPPPPPPPPPPPPPPPPPPPPPK.",
  "..KDDDDDDDDDDDDDDDDDDDDDDDDDK.",
  "...KKKKKKKKKKKKDDDDDDDDDDDDK..",
  "............KDDK.KDDDDDDDDDK..",
  "............KD.K.KDDDDDDDDK...",
  ".............KKK.KDDDDDDDDK...",
  ".................KDDDDDDDK....",
  "................KDDDDDDDDK....",
  "................KDDDDDDDK.....",
  "................KKKKKKKKK.....",
];
// PINKMANE's hand around the grip (drawn on top of the gun, starting at column 15, row 6)
const HAND = [
  "..KKKKKKKKKKK.",
  ".KYYYYYYYYYYYK",
  "KYyYYYYYYYYYYK",
  "KYYYYYYYYYYYYK",
  "KyYYYYYYYYYYYK",
  "KYYYYYYYYYYYK.",
  "KyYYYYYYYYYYK.",
  ".KKKKKKKKKKK..",
];
const GUN_COLORS: Record<string, string> = {
  K: INK,
  L: "#ff8ad8",
  P: "#d63cc8",
  D: "#8a1f86",
  G: "#4a4a60",
  W: "#ffffff",
  Y: "#ffc800",
  y: "#c89400",
};
const PIVOT = { x: 21, y: 10 }; // the gun turns around this pixel (the grip)
const MUZZLE = { x: -1, y: 3.5 }; // where the ammo comes out
// ammo pictures
const FIREBALL = ["..OOO..", ".OYYYO.", "OYWWWYO", "OYWWWYO", "OYWWWYO", ".OYYYO.", "..OOO.."];
const SPIKE = ["....K....", "...KPK...", "...KPK...", ".KKPLPKK.", "KPPLWLPPK", ".KKPLPKK.", "...KPK...", "...KPK...", "....K...."];
const BOMB = ["...OOOO...", ".OOKKKKOO.", ".OKHHKKKO.", "OKHHKKKKKO", "OKHKKKKKKO", "OKKKKKKKKO", "OKKKKKKKKO", ".OKKKKKKO.", ".OOKKKKOO.", "...OOOO..."];

type Shot = { ammo: AmmoId; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; spin: number; target: Element | null; hit: boolean; lastX: number; lastY: number };
type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number };
type Mark = { x: number; y: number; kind: AmmoId; life: number; rot: number };
type Pop = { x: number; y: number; text: string; life: number };
type Cross = { x: number; y: number; life: number };

type Props = {
  // on = the mouse is a gun right now
  active: boolean;
  // follows the site's mute button
  muted: boolean;
  // the site's pixel font (for the HIT! text and the ammo name)
  font?: string;
};

function drawPixels(ctx: CanvasRenderingContext2D, rows: string[], ox: number, oy: number, colors: Record<string, string>) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const col = colors[row[c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(ox + c, oy + r, 1.02, 1.02); // a hair bigger so no gaps show when it's turned
    }
  }
}

// one piece of ammo (x, y = its middle on the screen, ang = the way it flies)
function drawAmmo(ctx: CanvasRenderingContext2D, id: AmmoId, x: number, y: number, ang: number, spin: number, t: number, size = 3) {
  ctx.save();
  ctx.translate(x, y);
  if (id === "bullet") {
    ctx.rotate(ang);
    ctx.fillStyle = "rgba(255,216,74,0.5)";
    ctx.fillRect(-26, -1.5, 26, 3);
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(-12, -2, 12, 4);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-7, -1, 8, 2);
  } else if (id === "fire") {
    const f = Math.floor(t * 20) % 2;
    ctx.scale(size, size);
    drawPixels(ctx, FIREBALL, -3.5, -3.5, { O: f ? "#ff3b1a" : "#ff7a00", Y: f ? "#ffd84a" : "#ffb02a", W: "#ffffff" });
  } else if (id === "spike") {
    ctx.rotate(spin);
    ctx.scale(size * 0.8, size * 0.8);
    drawPixels(ctx, SPIKE, -4.5, -4.5, { K: INK, P: "#ff3bd0", L: "#ff8ad8", W: "#ffffff" });
  } else if (id === "leaf") {
    ctx.rotate(spin);
    const s = size * 6;
    for (const [a, len] of [
      [0, 1],
      [-0.5, 0.82],
      [0.5, 0.82],
      [-1.0, 0.62],
      [1.0, 0.62],
      [-1.5, 0.38],
      [1.5, 0.38],
    ]) {
      ctx.save();
      ctx.rotate(a);
      ctx.fillStyle = "#1b6b25";
      ctx.beginPath();
      ctx.ellipse(0, (-len * s) / 2, s * 0.13 + 1, (len * s) / 2 + 1, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3fc24a";
      ctx.beginPath();
      ctx.ellipse(0, (-len * s) / 2, s * 0.13, (len * s) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "#1b6b25";
    ctx.fillRect(-1, 0, 2, s * 0.35);
  } else {
    ctx.rotate(spin);
    ctx.scale(size * 0.8, size * 0.8);
    drawPixels(ctx, BOMB, -5, -5, { O: INK, K: "#2a2a36", H: "#9a9ab0" });
    ctx.fillStyle = "#8a8aa0";
    ctx.fillRect(-1, -6, 3, 1);
    ctx.fillStyle = "#c08a4a";
    ctx.fillRect(1, -7, 1, 1);
    ctx.fillRect(2, -8, 1, 1);
    ctx.fillStyle = Math.floor(t * 20) % 2 ? "#ffd84a" : "#ff7a00";
    ctx.fillRect(2, -10, 2, 2);
  }
  ctx.restore();
}

export default function GunCursor({ active, muted, font }: Props) {
  const aimRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!active || !GUN_ON) return;
    // phones and tablets: no gun
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const aim = aimRef.current;
    const reticle = reticleRef.current;
    const canvas = canvasRef.current;
    if (!aim || !reticle || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    document.body.classList.add("gun-mode");
    const fontName = font ?? "monospace";

    // ---------- the screen-sized drawing layer ----------
    let vw = 0;
    let vh = 0;
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = Math.round(vw * dpr);
      canvas.height = Math.round(vh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
    };
    fit();
    window.addEventListener("resize", fit);

    // ---------- sounds (Web Audio, so fast clicks overlap with no delay) ----------
    let ac: AudioContext | null = null;
    let shotBuf: AudioBuffer | null = null;
    let noise: AudioBuffer | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      fetch(SHOT_SOUND)
        .then((r) => r.arrayBuffer())
        .then((b) => ac!.decodeAudioData(b))
        .then((b) => {
          shotBuf = b;
        })
        .catch(() => {});
    } catch {}
    const wake = () => {
      if (ac && ac.state === "suspended") ac.resume().catch(() => {});
    };
    const bang = (pitch: number) => {
      if (mutedRef.current) return;
      wake();
      if (ac && shotBuf) {
        const src = ac.createBufferSource();
        src.buffer = shotBuf;
        src.playbackRate.value = pitch * (0.94 + Math.random() * 0.12);
        const g = ac.createGain();
        g.gain.value = SHOT_VOLUME;
        src.connect(g).connect(ac.destination);
        src.start();
      } else {
        const a = new Audio(SHOT_SOUND);
        a.volume = SHOT_VOLUME;
        a.play().catch(() => {});
      }
    };
    // impact: a short burst of noise (deep + long for the bomb)
    const thud = (big: boolean) => {
      if (mutedRef.current || !ac || !noise) return;
      const src = ac.createBufferSource();
      src.buffer = noise;
      const f = ac.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = big ? 500 : 1800;
      const g = ac.createGain();
      const now = ac.currentTime;
      g.gain.setValueAtTime(big ? HIT_VOLUME * 2.2 : HIT_VOLUME, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + (big ? 0.45 : 0.12));
      src.connect(f).connect(g).connect(ac.destination);
      src.start(now, 0, big ? 0.5 : 0.15);
    };

    // ---------- state ----------
    let ammoIx = 0;
    try {
      const saved = AMMO.findIndex((a) => a.id === localStorage.getItem(AMMO_KEY));
      if (saved >= 0) ammoIx = saved;
    } catch {}
    let mx = vw * 0.5;
    let my = vh * 0.45;
    let shown = false;
    let ang = 0.5; // which way the gun points
    let kick = 0; // recoil (0 = none)
    let flash = 0; // muzzle flash time left
    let ammoFlash = 0; // the ammo name pops when you switch
    let clock = 0;
    const shots: Shot[] = [];
    const parts: Part[] = [];
    const marks: Mark[] = [];
    const pops: Pop[] = [];
    const crosses: Cross[] = [];
    let swallow = false; // eat the rest of this real click (the shot will click when it lands)

    const scale = () => (vw < 900 ? 4 : vw < 1500 ? 5 : 6);
    const pivotXY = () => {
      const S = scale();
      return {
        x: vw - 24 * S + Math.sin(clock * 1.6) * 1.5 + Math.cos(ang) * kick * 14,
        y: vh - 8 * S + Math.sin(clock * 3.2) * 1.5 + Math.sin(ang) * kick * 14,
      };
    };
    // where on the screen a pixel of the gun picture ends up
    const gunPoint = (gx: number, gy: number) => {
      const S = scale();
      const p = pivotXY();
      const a = ang + kick * 0.35;
      const lx = (gx - PIVOT.x) * S;
      const ly = (gy - PIVOT.y) * S;
      return { x: p.x + lx * Math.cos(a) - ly * Math.sin(a), y: p.y + lx * Math.sin(a) + ly * Math.cos(a) };
    };

    const burst = (x: number, y: number, n: number, colors: string[], power: number, size = 3, grav = 300) => {
      for (let i = 0; i < n; i++) {
        const life = 0.25 + Math.random() * 0.45;
        const a = Math.random() * Math.PI * 2;
        const v = power * (0.4 + Math.random() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, life, max: life, color: colors[i % colors.length], size, grav });
      }
    };

    // the shot lands
    const land = (s: Shot) => {
      const a = AMMO.find((q) => q.id === s.ammo)!;
      thud(s.ammo === "bomb");
      if (s.ammo === "bomb") {
        crosses.push({ x: s.x1, y: s.y1, life: 0.45 });
        burst(s.x1, s.y1, 26, a.color, 260, 4);
        burst(s.x1, s.y1, 10, ["#9a9aa8", "#c8c8d4"], 60, 6, -40);
      } else if (s.ammo === "fire") {
        burst(s.x1, s.y1, 18, a.color, 180, 3);
        burst(s.x1, s.y1, 6, ["#9a9aa8", "#c8c8d4"], 40, 5, -50);
      } else if (s.ammo === "leaf") burst(s.x1, s.y1, 14, a.color, 140, 3, 200);
      else if (s.ammo === "spike") burst(s.x1, s.y1, 16, a.color, 200, 3);
      else burst(s.x1, s.y1, 10, a.color, 170, 2);
      if (s.hit) pops.push({ x: s.x1, y: s.y1 - 22, text: "HIT!", life: 0.7 });
      else marks.push({ x: s.x1, y: s.y1, kind: s.ammo, life: 1.8, rot: Math.random() * 6 });
      if (marks.length > 40) marks.shift();
      // now the real click happens, on whatever you shot
      if (s.target) {
        let el: Element | null = s.target;
        if (!el.isConnected) el = document.elementFromPoint(s.x1, s.y1);
        if (el) {
          el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window, clientX: s.x1, clientY: s.y1, button: 0 }));
          // a quick blink on what got hit
          const hitEl = el.closest(HIT_TARGETS) as HTMLElement | null;
          hitEl?.animate?.([{ filter: "brightness(1.8) saturate(1.4)" }, { filter: "none" }], { duration: 180 });
        }
      }
    };

    const fire = (x: number, y: number, target: Element | null, instant: boolean) => {
      const a = AMMO[ammoIx];
      bang(a.pitch);
      kick = 1;
      flash = 0.07;
      reticle.animate([{ transform: "scale(1.45) rotate(14deg)" }, { transform: "scale(1) rotate(0deg)" }], { duration: 160, easing: "ease-out" });
      const m = gunPoint(MUZZLE.x, MUZZLE.y);
      const dist = Math.hypot(x - m.x, y - m.y);
      const hit = !!target?.closest?.(HIT_TARGETS);
      shots.push({
        ammo: a.id,
        x0: m.x,
        y0: m.y,
        x1: x,
        y1: y,
        t: 0,
        dur: Math.max(0.14, Math.min(0.5, dist / a.speed)),
        spin: 0,
        target: instant ? null : target, // instant ones already got their click
        hit,
        lastX: m.x,
        lastY: m.y,
      });
      burst(m.x, m.y, 5, ["#ffffff", "#ffd84a"], 90, 2, 0);
    };

    const switchAmmo = (to?: number) => {
      ammoIx = to ?? (ammoIx + 1) % AMMO.length;
      ammoFlash = 1.2;
      try {
        localStorage.setItem(AMMO_KEY, AMMO[ammoIx].id);
      } catch {}
      if (!mutedRef.current && ac) {
        wake();
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = "square";
        o.frequency.value = 520 + ammoIx * 90;
        g.gain.setValueAtTime(0.04, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.08);
        o.connect(g).connect(ac.destination);
        o.start();
        o.stop(ac.currentTime + 0.1);
      }
    };

    // ---------- the mouse ----------
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      aim.style.transform = `translate(${mx - AIM_SIZE / 2}px, ${my - AIM_SIZE / 2}px)`;
      if (!shown) {
        shown = true;
        aim.style.opacity = "1";
        canvas.style.opacity = "1";
      }
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return; // still inside the page
      shown = false;
      aim.style.opacity = "0";
    };
    const eat = (e: Event) => {
      e.stopImmediatePropagation();
      e.preventDefault();
    };
    const onDown = (e: PointerEvent) => {
      if (!e.isTrusted || e.pointerType !== "mouse") return;
      const target = e.target as Element | null;
      if (e.button === 2) {
        switchAmmo();
        eat(e);
        swallow = true;
        return;
      }
      if (e.button !== 0) return;
      const instant = !!target?.closest?.(INSTANT);
      // sliders: just let you drag them (no shot)
      if (target?.closest?.("input, textarea, select")) {
        swallow = false;
        return;
      }
      fire(e.clientX, e.clientY, target, instant);
      if (instant) {
        swallow = false; // the D-pad etc. reacts right away
        return;
      }
      eat(e);
      swallow = true;
    };
    // the rest of the real click (mouse down / up / click) is eaten, the shot clicks when it lands
    const onRest = (e: Event) => {
      if (!e.isTrusted || !swallow) return;
      eat(e);
      if (e.type === "click" || e.type === "contextmenu") swallow = false;
    };
    const onMenu = (e: MouseEvent) => {
      if (!e.isTrusted) return;
      eat(e); // no right-click menu: right click switches ammo
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const n = Number(e.key);
      if (n >= 1 && n <= AMMO.length) switchAmmo(n - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    for (const t of ["mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"]) window.addEventListener(t, onRest, true);
    window.addEventListener("contextmenu", onMenu, true);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerout", onOut);

    // ---------- every frame ----------
    const drawGun = () => {
      const S = scale();
      const p = pivotXY();
      const a = ang + kick * 0.35;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(a);
      ctx.scale(S, S);
      ctx.translate(-PIVOT.x, -PIVOT.y);
      // the arm (a grey sleeve with a pink cuff) going off the bottom right of the screen
      for (let r = 0; r < 44; r++) {
        const x0 = 18 + r * 0.62;
        ctx.fillStyle = INK;
        ctx.fillRect(x0 - 1, 12 + r, 15, 1.02);
        ctx.fillStyle = r < 3 ? "#d63cc8" : r % 7 === 3 ? "#3e3e52" : "#4a4a60";
        ctx.fillRect(x0, 12 + r, 13, 1.02);
      }
      drawPixels(ctx, GUN, 0, 0, GUN_COLORS);
      drawPixels(ctx, HAND, 15, 6, GUN_COLORS);
      // the trigger finger
      drawPixels(ctx, ["KKK", "YYK", "KKK"], 13, 7, GUN_COLORS);
      ctx.restore();
      // muzzle flash
      if (flash > 0) {
        const m = gunPoint(MUZZLE.x - 1, MUZZLE.y);
        const c = AMMO[ammoIx].color;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 30);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.35, c[0]);
        g.addColorStop(1, "rgba(255,120,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 30, m.y - 30, 60, 60);
        ctx.restore();
      }
    };
    const drawHud = () => {
      // the ammo picker, left of the gun: 5 boxes, the one you're using is lit up
      const S = scale();
      const box = 26;
      const x0 = vw - 38 * S - AMMO.length * (box + 4);
      const y0 = vh - box - 14;
      AMMO.forEach((a, i) => {
        const x = x0 + i * (box + 4);
        const on = i === ammoIx;
        ctx.fillStyle = on ? "rgba(214,60,200,0.9)" : "rgba(26,6,24,0.7)";
        ctx.fillRect(x, y0, box, box);
        ctx.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y0 + 0.5, box - 1, box - 1);
        drawAmmo(ctx, a.id, x + box / 2 + (a.id === "bullet" ? 9 : 0), y0 + box / 2, 0, a.id === "leaf" ? 0.6 : 0, clock, 2);
        ctx.font = `8px ${fontName}`;
        ctx.fillStyle = on ? "#ffffff" : "rgba(255,255,255,0.5)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(String(i + 1), x + 2, y0 + 2);
      });
      ctx.font = `8px ${fontName}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const label = `${AMMO[ammoIx].name}  ·  RIGHT CLICK = SWITCH`;
      ctx.fillStyle = INK;
      ctx.fillText(label, x0 + 1, y0 - 4);
      ctx.fillStyle = ammoFlash > 0 && Math.floor(clock * 10) % 2 ? "#ffd84a" : "#ffffff";
      ctx.fillText(label, x0, y0 - 5);
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      clock += dt;
      // the gun turns towards the aim (with a bit of weight)
      const S = scale();
      const px = vw - 24 * S;
      const py = vh - 8 * S;
      const want = Math.max(-0.25, Math.min(1.25, Math.atan2(py - my, px - mx)));
      ang += (want - ang) * Math.min(1, dt * 16);
      kick = Math.max(0, kick - dt * 7);
      flash -= dt;
      ammoFlash -= dt;

      ctx.clearRect(0, 0, vw, vh);
      // marks left behind
      for (const m of marks) {
        m.life -= dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, m.life / 0.6));
        if (m.kind === "bullet") {
          ctx.fillStyle = "#000";
          ctx.fillRect(m.x - 3, m.y - 3, 6, 6);
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(m.x - 4, m.y - 1, 1, 2);
          ctx.fillRect(m.x + 3, m.y - 1, 1, 2);
        } else if (m.kind === "leaf") {
          drawAmmo(ctx, "leaf", m.x, m.y, 0, m.rot, clock, 1.6);
        } else if (m.kind === "spike") {
          ctx.fillStyle = "#ff3bd0";
          for (let i = 0; i < 6; i++) ctx.fillRect(m.x + Math.cos(m.rot + i) * 7 - 2, m.y + Math.sin(m.rot + i) * 7 - 2, 4, 4);
          ctx.fillRect(m.x - 4, m.y - 4, 8, 8);
        } else {
          const r = m.kind === "bomb" ? 22 : 12;
          const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, r);
          g.addColorStop(0, "rgba(0,0,0,0.8)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(m.x - r, m.y - r, r * 2, r * 2);
        }
      }
      ctx.globalAlpha = 1;
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i].life <= 0) marks.splice(i, 1);
      // bomb blasts: a cross of fire like in Pink Bomber
      for (const c of crosses) {
        c.life -= dt;
        const k = Math.max(0, c.life / 0.45);
        ctx.globalAlpha = Math.min(1, k * 2);
        const len = 46;
        for (const [col, th] of [
          ["#ff3b1a", 22],
          ["#ff7a00", 16],
          ["#ffd84a", 10],
          ["#ffffff", 4],
        ] as [string, number][]) {
          const t = th * (0.5 + k * 0.5);
          ctx.fillStyle = col;
          ctx.fillRect(c.x - len, c.y - t / 2, len * 2, t);
          ctx.fillRect(c.x - t / 2, c.y - len, t, len * 2);
        }
      }
      ctx.globalAlpha = 1;
      for (let i = crosses.length - 1; i >= 0; i--) if (crosses[i].life <= 0) crosses.splice(i, 1);
      // the flying ammo
      for (const s of shots) {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        const x = s.x0 + (s.x1 - s.x0) * k;
        let y = s.y0 + (s.y1 - s.y0) * k;
        if (s.ammo === "bomb") y -= Math.sin(Math.PI * k) * Math.min(90, Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 0.3); // the bomb is thrown in an arc
        s.spin += dt * (s.ammo === "leaf" ? 14 : s.ammo === "bomb" ? 9 : 18);
        const a = Math.atan2(y - s.lastY, x - s.lastX);
        // trails
        const c = AMMO.find((q) => q.id === s.ammo)!.color;
        if (s.ammo !== "bullet") {
          const life = 0.25 + Math.random() * 0.2;
          parts.push({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life, max: life, color: c[Math.floor(Math.random() * c.length)], size: s.ammo === "fire" ? 4 : 3, grav: 0 });
        }
        drawAmmo(ctx, s.ammo, x, y, a, s.spin, clock);
        s.lastX = x;
        s.lastY = y;
        if (k >= 1) land(s);
      }
      for (let i = shots.length - 1; i >= 0; i--) if (shots[i].t >= shots[i].dur) shots.splice(i, 1);
      // sparks
      for (const q of parts) {
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += q.grav * dt;
        q.vx *= 1 - 2 * dt;
        ctx.globalAlpha = Math.max(0, q.life / q.max);
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x - q.size / 2), Math.round(q.y - q.size / 2), q.size, q.size);
      }
      ctx.globalAlpha = 1;
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      if (parts.length > 400) parts.splice(0, parts.length - 400);
      // HIT!
      for (const p of pops) {
        p.life -= dt;
        p.y -= 40 * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3));
        ctx.font = `12px ${fontName}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = INK;
        ctx.fillText(p.text, p.x + 2, p.y + 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].life <= 0) pops.splice(i, 1);
      if (shown) {
        drawHud();
        drawGun();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      document.body.classList.remove("gun-mode");
      window.removeEventListener("resize", fit);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, true);
      for (const t of ["mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"]) window.removeEventListener(t, onRest, true);
      window.removeEventListener("contextmenu", onMenu, true);
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerout", onOut);
      aim.style.opacity = "0";
      canvas.style.opacity = "0";
      ctx.clearRect(0, 0, vw, vh);
      ac?.close().catch(() => {});
    };
  }, [active, font]);

  return (
    <>
      <canvas ref={canvasRef} className="gun-layer" aria-hidden />
      <div ref={aimRef} className="gun-aim" aria-hidden>
        <div ref={reticleRef} className="gun-reticle">
          {/* the aim: a ring, 4 lines and a dot in the middle (pink with a dark edge so it shows on everything) */}
          <svg width={AIM_SIZE} height={AIM_SIZE} viewBox="0 0 34 34" shapeRendering="crispEdges">
            <g stroke={INK} strokeWidth="4" fill="none">
              <circle cx="17" cy="17" r="10" />
              <path d="M17 1v8M17 25v8M1 17h8M25 17h8" />
            </g>
            <g stroke={AIM_COLOR} strokeWidth="2" fill="none">
              <circle cx="17" cy="17" r="10" />
              <path d="M17 1v8M17 25v8M1 17h8M25 17h8" />
            </g>
            <rect x="15" y="15" width="4" height="4" fill={INK} />
            <rect x="16" y="16" width="2" height="2" fill="#ffffff" />
          </svg>
        </div>
      </div>
      <style>{`
        body.gun-mode,
        body.gun-mode * {
          cursor: none !important;
        }
        .gun-layer {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 2147483646;
          opacity: 0;
        }
        .gun-aim {
          position: fixed;
          left: 0;
          top: 0;
          width: ${AIM_SIZE}px;
          height: ${AIM_SIZE}px;
          pointer-events: none;
          z-index: 2147483647;
          opacity: 0;
          will-change: transform;
        }
        .gun-reticle {
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 3px rgba(255, 59, 208, 0.7));
        }
        .gun-reticle svg {
          display: block;
        }
      `}</style>
    </>
  );
}
