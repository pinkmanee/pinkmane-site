"use client";

import { useEffect, useRef, useState } from "react";
import { ScorePanel, type ScoreApi, type ScoreEntry } from "./Scoreboard";

// THE GUN (computers only, not phones). A shooter-game view on the main page:
//   - the mouse is a pink aim, and PINKMANE's hand holds the PINKMANE pistol (public/gun/gun.png + gun-logo.png).
//     It slides along the bottom after the mouse, turns smoothly to point right at the aim (with a bit of weight and
//     overshoot), rolls over when you aim to the other side, and kicks back on every shot
//   - every left click is a SHOT: the ammo flies from the gun to where you clicked, and the click happens when it lands
//     (so whatever you shot still opens, blinks etc. like before, just a moment later)
//   - AMMO from the games: BULLET, FIREBALL, SPIKE SHOT (PINKMANE VOID), WEED LEAF (Pink Jetpack), BOMB (Pink Bomber)
//     RIGHT CLICK, the keys 1 - 5, or clicking a box in the ammo bar (under the iPod) = switch ammo
//   - PINK HUNT: shoot the flying PINKMANEs in the background: far away (small) = 20, middle = 15, close (big) = 10.
//     The BOMB gets everything near it, but only 5 points each.
//     The first kill starts a 60 second round; when it ends you can save your score (online Top 10, board "gun").
//     Score + time + the TOP 3 are in the top right corner.
//   - sliders (BASS QUAKE, VOL) and the handheld's D-pad still react instantly
// It switches off inside the games (they use the mouse themselves) and on phones.
//
// Files: public/sounds/shot.mp3, public/gun/gun.png, public/gun/gun-logo.png
// The flyers it can hit are marked with data-target in page.tsx. The iPod / handheld (data-solid) block shots.

// OFF SWITCH: set this to false and the mouse is a normal mouse again
const GUN_ON = true;

const SHOT_SOUND = "/sounds/shot.mp3";
const GUN_PIC = "/gun/gun.png";
const LOGO_PIC = "/gun/gun-logo.png";
const SHOT_VOLUME = 0.1; // the shot is loud, so it plays at 10%
const HIT_VOLUME = 0.09; // the little impact sound
const AIM_SIZE = 34; // how big the aim is (pixels)
const AIM_COLOR = "#ff3bd0";
const AMMO_KEY = "pinkmane-ammo"; // remembers the last ammo you picked
const BEST_KEY = "pinkhunt-best";
const BOARD_ID = "gun"; // the Top 10 board (also in app/api/scores/shared.ts)
const HUNT_TIME = 60; // seconds per round
// points for a flyer: the page gives each one data-points (far away / small = 20, middle = 15, close / big = 10).
// Anything the BOMB gets is only worth BOMB_POINTS (it hits so many at once).
const KILL_POINTS = 10;
const BOMB_POINTS = 5;
const BOMB_RADIUS = 60; // the bomb kills every flyer this close
// clicking these counts as a HIT (buttons, links, the iPod menu rows, the game list)
const HIT_TARGETS = "button, a, [role=button], [data-shoot], .gp-row";
// these get their click straight away (sliders you drag, the D-pad that holds a key down)
const INSTANT = "input, textarea, select, label, [data-instant], [data-noshoot]";
// shots that land on these can't hit the flyers behind them
const SOLID = "[data-solid], .ipod-shell, .hh-device";

// ---------- the gun picture (public/gun/gun.png, 82 x 46 pixels, a Desert Eagle pointing left) ----------
const PIVOT = { x: 57, y: 30 }; // the gun turns around this pixel (the hand)
const MUZZLE = { x: 0, y: 7 }; // where the ammo comes out
const LOGO_BOX = { x: 15, y: 3.4, w: 28, h: 10.9 }; // where the PINKMANE logo sits on the slide
const ARM_FROM = { x: 67, y: 35 }; // where the arm leaves the hand

// ---------- the ammo ----------
type AmmoId = "bullet" | "fire" | "spike" | "leaf" | "bomb";
const AMMO: { id: AmmoId; name: string; speed: number; pitch: number; color: string[] }[] = [
  { id: "bullet", name: "BULLET", speed: 2000, pitch: 1, color: ["#ffd84a", "#ffffff", "#ffb02a"] },
  { id: "fire", name: "FIREBALL", speed: 1250, pitch: 0.78, color: ["#ffd84a", "#ff7a00", "#ff3b1a", "#ffffff"] },
  { id: "spike", name: "SPIKE SHOT", speed: 1500, pitch: 1.25, color: ["#ff3bd0", "#ff8ad8", "#ffffff", "#b0209a"] },
  { id: "leaf", name: "WEED LEAF", speed: 1100, pitch: 1.45, color: ["#3fc24a", "#8affc8", "#1b6b25", "#d8ff8a"] },
  { id: "bomb", name: "BOMB", speed: 850, pitch: 0.6, color: ["#ffd84a", "#ff7a00", "#ff3b1a", "#ffffff"] },
];
// the glow of each explosion (red, green, blue)
const GLOW: Record<AmmoId, string> = { bullet: "255,216,74", fire: "255,122,0", spike: "255,59,208", leaf: "63,194,74", bomb: "255,140,40" };

const INK = "#1a0618";
const MEDALS = ["#ffd700", "#c8ccd6", "#cd7f32"];
const FIREBALL = ["..OOO..", ".OYYYO.", "OYWWWYO", "OYWWWYO", "OYWWWYO", ".OYYYO.", "..OOO.."];
const SPIKE = ["....K....", "...KPK...", "...KPK...", ".KKPLPKK.", "KPPLWLPPK", ".KKPLPKK.", "...KPK...", "...KPK...", "....K...."];
const BOMB = ["...OOOO...", ".OOKKKKOO.", ".OKHHKKKO.", "OKHHKKKKKO", "OKHKKKKKKO", "OKKKKKKKKO", "OKKKKKKKKO", ".OKKKKKKO.", ".OOKKKKOO.", "...OOOO..."];

type Shot = { ammo: AmmoId; x0: number; y0: number; x1: number; y1: number; t: number; dur: number; spin: number; target: Element | null; hit: boolean; solid: boolean; lastX: number; lastY: number };
// leaf = a little spinning weed leaf instead of a square
type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; grav: number; leaf?: boolean; rot?: number };
type Mark = { x: number; y: number; kind: AmmoId; life: number; rot: number };
type Pop = { x: number; y: number; text: string; life: number; color: string; size: number };
type Cross = { x: number; y: number; life: number };
type Flash = { x: number; y: number; w: number; h: number; life: number; rgb: string };
// an explosion's ring (star = pointy rays, for the spike shot) and its glow
type Ring = { x: number; y: number; life: number; max: number; r: number; color: string; star: boolean };
type Glow = { x: number; y: number; life: number; max: number; r: number; rgb: string };

type Props = {
  // on = the mouse is a gun right now
  active: boolean;
  // follows the site's mute button
  muted: boolean;
  // the site's pixel font
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
    const k = size / 3;
    ctx.fillStyle = "rgba(255,216,74,0.5)";
    ctx.fillRect(-26 * k, -1.5 * k, 26 * k, 3 * k);
    ctx.fillStyle = "#ffd84a";
    ctx.fillRect(-12 * k, -2 * k, 12 * k, 4 * k);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-7 * k, -1 * k, 8 * k, 2 * k);
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

// angle difference, always the short way round
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const pad5 = (n: number) => String(Math.floor(n)).padStart(5, "0");

export default function GunCursor({ active, muted, font }: Props) {
  const aimRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const [boardOpen, setBoardOpen] = useState(false);
  const fontName = font ?? "monospace";

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

    const gunImg = new Image();
    gunImg.src = GUN_PIC;
    const logoImg = new Image();
    logoImg.src = LOGO_PIC;

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
    const blip = (from: number, to: number, len: number, vol = 0.05, delay = 0) => {
      if (mutedRef.current || !ac) return;
      wake();
      const o = ac.createOscillator();
      const g = ac.createGain();
      const t0 = ac.currentTime + delay;
      o.type = "square";
      o.frequency.setValueAtTime(from, t0);
      o.frequency.exponentialRampToValueAtTime(to, t0 + len);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      o.connect(g).connect(ac.destination);
      o.start(t0);
      o.stop(t0 + len + 0.02);
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
    let clock = 0;
    // the gun: where it is, which way it points, how fast it turns, and its roll (1 = upright pointing right, -1 = pointing left)
    const gun = { x: vw * 0.8, y: vh, vx: 0, vy: 0, ang: Math.PI * 1.25, spin: 0, roll: -1, kick: 0 };
    let flash = 0; // muzzle flash time left
    let ammoFlash = 0; // the ammo name blinks when you switch
    const shots: Shot[] = [];
    const parts: Part[] = [];
    const marks: Mark[] = [];
    const pops: Pop[] = [];
    const crosses: Cross[] = [];
    const flashes: Flash[] = [];
    const rings: Ring[] = [];
    const glows: Glow[] = [];
    let swallow = false; // eat the rest of this real click (the shot will click when it lands)
    // PINK HUNT
    // lock = the round just ended: no new round until its Top 10 box has been closed
    const hunt = { score: 0, kills: 0, timeLeft: 0, on: false, best: 0, lock: 0 };
    try {
      hunt.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}
    let top3: ScoreEntry[] | null = null;
    const loadTop = () => {
      fetch(`/api/scores?game=${BOARD_ID}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d && Array.isArray(d.scores)) top3 = d.scores.slice(0, 3);
        })
        .catch(() => {});
    };
    loadTop();
    let wasBusy = false;

    const scale = () => (vw < 900 ? 2 : vw < 1500 ? 2.4 : 2.8);
    // where a pixel of the gun picture ends up on the screen
    const gunPoint = (gx: number, gy: number) => {
      const S = scale();
      const lx = -(gx - PIVOT.x) * S;
      const ly = (gy - PIVOT.y) * S * gun.roll;
      const a = gun.ang;
      return { x: gun.x + lx * Math.cos(a) - ly * Math.sin(a), y: gun.y + lx * Math.sin(a) + ly * Math.cos(a) };
    };

    const burst = (x: number, y: number, n: number, colors: string[], power: number, size = 3, grav = 300) => {
      for (let i = 0; i < n; i++) {
        const life = 0.25 + Math.random() * 0.45;
        const a = Math.random() * Math.PI * 2;
        const v = power * (0.4 + Math.random() * 0.8);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.3, life, max: life, color: colors[i % colors.length], size, grav });
      }
    };

    // an explosion in the colours of the ammo (green for the weed leaf, pink for the spike shot ...)
    const explode = (x: number, y: number, id: AmmoId, big: boolean) => {
      const c = AMMO.find((q) => q.id === id)!.color;
      const k = big ? 1.5 : 1;
      glows.push({ x, y, life: 0.18, max: 0.18, r: (id === "bomb" ? 70 : 38) * k, rgb: GLOW[id] });
      rings.push({ x, y, life: 0.35, max: 0.35, r: (id === "bomb" ? 70 : 34) * k, color: c[0], star: id === "spike" });
      if (id === "bomb") {
        crosses.push({ x, y, life: 0.45 });
        burst(x, y, 26, c, 260, 4);
        burst(x, y, 10, ["#9a9aa8", "#c8c8d4"], 60, 6, -40);
      } else if (id === "fire") {
        burst(x, y, Math.round(18 * k), c, 190 * k, 4);
        burst(x, y, 7, ["#5a5a68", "#9a9aa8", "#c8c8d4"], 45, 6, -60);
      } else if (id === "leaf") {
        burst(x, y, Math.round(12 * k), c, 150 * k, 3, 220);
        // little leaves flying out
        for (let i = 0; i < (big ? 7 : 4); i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 80 + Math.random() * 120;
          const life = 0.6 + Math.random() * 0.5;
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life, max: life, color: c[0], size: 1 + Math.random() * 0.5, grav: 260, leaf: true, rot: Math.random() * 6 });
        }
      } else if (id === "spike") {
        burst(x, y, Math.round(16 * k), c, 230 * k, 3, 150);
      } else {
        burst(x, y, Math.round(10 * k), c, 170 * k, 2);
      }
    };

    // ---------- PINK HUNT: the flyers ----------
    const flyers = () => Array.from(document.querySelectorAll<HTMLElement>("[data-target]"));
    const alive = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) return null;
      const op = Number(getComputedStyle(el).opacity);
      if (op < 0.35) return null;
      return r;
    };
    // the flyer breaks into its own pixels
    const kill = (el: HTMLElement, r: DOMRect, ammo: AmmoId) => {
      const img = (el.tagName === "IMG" ? el : el.querySelector("img")) as HTMLImageElement | null;
      const N = 12;
      const cw = r.width / N;
      const ch = r.height / N;
      let data: Uint8ClampedArray | null = null;
      try {
        if (img && img.complete) {
          const off = document.createElement("canvas");
          off.width = N;
          off.height = N;
          const oc = off.getContext("2d");
          if (oc) {
            oc.drawImage(img, 0, 0, N, N);
            data = oc.getImageData(0, 0, N, N).data;
          }
        }
      } catch {
        data = null;
      }
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++) {
          let color = "";
          if (data) {
            const k = (j * N + i) * 4;
            if (data[k + 3] < 90) continue;
            color = `rgb(${data[k]},${data[k + 1]},${data[k + 2]})`;
          } else {
            if ((i - 5.5) ** 2 + (j - 5.5) ** 2 > 30) continue;
            color = ["#d63cc8", "#ffc800", "#111111", "#ffffff"][(i + j) % 4];
          }
          const x = r.left + i * cw + cw / 2;
          const y = r.top + j * ch + ch / 2;
          const dx = x - cx;
          const dy = y - cy;
          const d = Math.hypot(dx, dy) || 1;
          const v = 90 + Math.random() * 200;
          const life = 0.7 + Math.random() * 0.6;
          parts.push({ x, y, vx: (dx / d) * v + (Math.random() - 0.5) * 40, vy: (dy / d) * v - 140 - Math.random() * 80, life, max: life, color, size: Math.max(2, Math.ceil(Math.max(cw, ch))), grav: 650 });
        }
      flashes.push({ x: r.left, y: r.top, w: r.width, h: r.height, life: 0.09, rgb: GLOW[ammo] });
      explode(cx, cy, ammo, true);
      // send it back to the start (it flies in again after a moment)
      el.style.animationName = "none";
      void el.offsetWidth;
      el.style.animationName = "";
      el.style.animationDelay = `${(0.6 + Math.random() * 2).toFixed(2)}s`;
      el.style.animationFillMode = "backwards";
      // points
      if (hunt.lock > 0) return;
      if (!hunt.on) {
        hunt.on = true;
        hunt.timeLeft = HUNT_TIME;
        hunt.score = 0;
        hunt.kills = 0;
      }
      const pts = ammo === "bomb" ? BOMB_POINTS : Number(el.dataset.points) || KILL_POINTS;
      hunt.score += pts;
      hunt.kills += 1;
      pops.push({ x: cx, y: r.top - 6, text: `+${pts}`, life: 0.9, color: pts >= 20 ? "#ff3bd0" : pts >= 15 ? "#8affc8" : "#ffd84a", size: pts >= 20 ? 16 : 14 });
      blip(900, 120, 0.22, 0.05);
      blip(1400, 700, 0.08, 0.03, 0.05);
    };
    const huntOver = () => {
      hunt.on = false;
      hunt.lock = 8; // (seconds, in case the box never opens)
      if (hunt.score > hunt.best) {
        hunt.best = hunt.score;
        try {
          localStorage.setItem(BEST_KEY, String(hunt.best));
        } catch {}
      }
      pops.push({ x: vw / 2, y: vh * 0.3, text: `TIME! ${hunt.kills} KILLS`, life: 1.6, color: "#ffffff", size: 20 });
      for (const [i, f] of [523, 659, 784, 1047].entries()) blip(f, f, 0.1, 0.05, i * 0.09);
      const score = hunt.score;
      setTimeout(() => boardRef.current?.gameOver(score, HUNT_TIME + 0.5), 900);
    };

    // the shot lands
    const land = (s: Shot) => {
      thud(s.ammo === "bomb");
      explode(s.x1, s.y1, s.ammo, false);
      // did it get a flyer? (not through the iPod / handheld, and not when you shot a button)
      let killed = 0;
      if (!s.hit && !s.solid) {
        const padPx = s.ammo === "bomb" ? BOMB_RADIUS : 14;
        let best: { el: HTMLElement; r: DOMRect; d: number } | null = null;
        for (const el of flyers()) {
          const r = alive(el);
          if (!r) continue;
          const nx = Math.max(r.left, Math.min(s.x1, r.right));
          const ny = Math.max(r.top, Math.min(s.y1, r.bottom));
          const d = Math.hypot(s.x1 - nx, s.y1 - ny);
          if (d > padPx) continue;
          if (s.ammo === "bomb") {
            kill(el, r, s.ammo);
            killed++;
          } else if (!best || d < best.d) best = { el, r, d };
        }
        if (best) {
          kill(best.el, best.r, s.ammo);
          killed++;
        }
      }
      if (s.hit) pops.push({ x: s.x1, y: s.y1 - 22, text: "HIT!", life: 0.7, color: "#ffffff", size: 12 });
      else if (!killed) marks.push({ x: s.x1, y: s.y1, kind: s.ammo, life: 1.8, rot: Math.random() * 6 });
      if (killed > 1) pops.push({ x: s.x1, y: s.y1 - 40, text: `${killed}X COMBO!`, life: 1, color: "#ff3bd0", size: 14 });
      if (marks.length > 40) marks.shift();
      // now the real click happens, on whatever you shot
      if (s.target && !killed) {
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
      gun.kick = 1;
      flash = 0.07;
      reticle.animate([{ transform: "scale(1.45) rotate(14deg)" }, { transform: "scale(1) rotate(0deg)" }], { duration: 160, easing: "ease-out" });
      const m = gunPoint(MUZZLE.x, MUZZLE.y);
      const dist = Math.hypot(x - m.x, y - m.y);
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
        hit: !!target?.closest?.(HIT_TARGETS),
        solid: !!target?.closest?.(SOLID),
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
      blip(520 + ammoIx * 90, 520 + ammoIx * 90, 0.08, 0.04);
    };

    // ---------- the ammo bar: centered under the iPod (or the handheld) ----------
    const BOX = 64;
    const GAP = 10;
    const barRect = () => {
      const dev = document.querySelector(".ipod-shell") ?? document.querySelector(".hh-device");
      const r = dev?.getBoundingClientRect();
      const cx = r && r.width > 0 ? r.left + r.width / 2 : vw / 2;
      const w = AMMO.length * BOX + (AMMO.length - 1) * GAP;
      // right under the iPod (with room for the name above it), or at the bottom if there's no room
      const under = r && r.width > 0 ? r.bottom + 36 : vh;
      return { x: Math.round(cx - w / 2), y: Math.round(Math.min(under, vh - BOX - 14)), w, h: BOX };
    };
    let bar = barRect();
    const barHit = (x: number, y: number) => {
      if (y < bar.y || y > bar.y + BOX) return -1;
      const i = Math.floor((x - bar.x) / (BOX + GAP));
      if (i < 0 || i >= AMMO.length || x > bar.x + i * (BOX + GAP) + BOX) return -1;
      return i;
    };

    // ---------- the mouse ----------
    const busy = () => boardRef.current?.busy() ?? false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX;
      my = e.clientY;
      aim.style.transform = `translate(${mx - AIM_SIZE / 2}px, ${my - AIM_SIZE / 2}px)`;
      if (!shown) {
        shown = true;
        if (!busy()) aim.style.opacity = "1";
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
      if (!e.isTrusted || e.pointerType !== "mouse" || busy()) return;
      const target = e.target as Element | null;
      if (e.button === 2) {
        switchAmmo();
        eat(e);
        swallow = true;
        return;
      }
      if (e.button !== 0) return;
      // a box in the ammo bar
      const b = barHit(e.clientX, e.clientY);
      if (b >= 0) {
        switchAmmo(b);
        eat(e);
        swallow = true;
        return;
      }
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
      if (!e.isTrusted || busy()) return;
      eat(e); // no right-click menu: right click switches ammo
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      // the Top 10 is showing: ENTER / SPACE / ESC only close it (and don't also press the iPod)
      if (busy() && ["Enter", " ", "Escape"].includes(e.key)) {
        boardRef.current?.hide();
        eat(e);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= AMMO.length) switchAmmo(n - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, true);
    for (const t of ["mousedown", "pointerup", "mouseup", "click", "dblclick", "auxclick"]) window.addEventListener(t, onRest, true);
    window.addEventListener("contextmenu", onMenu, true);
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerout", onOut);

    // ---------- drawing ----------
    const drawArm = () => {
      const S = scale();
      const from = gunPoint(ARM_FROM.x, ARM_FROM.y);
      // the shoulder is off the bottom right of the screen
      const sx = gun.x + 120 + Math.min(160, vw * 0.1);
      const sy = vh + 200;
      ctx.save();
      ctx.lineCap = "butt";
      ctx.strokeStyle = INK;
      ctx.lineWidth = 18 * S;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.strokeStyle = "#4a4a60";
      ctx.lineWidth = 16 * S;
      ctx.stroke();
      // a fold in the sleeve + the pink cuff at the wrist
      ctx.strokeStyle = "#3e3e52";
      ctx.lineWidth = 2 * S;
      ctx.beginPath();
      ctx.moveTo(from.x + (sx - from.x) * 0.45 - 4 * S, from.y + (sy - from.y) * 0.45);
      ctx.lineTo(from.x + (sx - from.x) * 0.7 - 4 * S, from.y + (sy - from.y) * 0.7);
      ctx.stroke();
      const cuffLen = Math.hypot(sx - from.x, sy - from.y) || 1;
      const ux = (sx - from.x) / cuffLen;
      const uy = (sy - from.y) / cuffLen;
      ctx.strokeStyle = "#d63cc8";
      ctx.lineWidth = 16 * S;
      ctx.beginPath();
      ctx.moveTo(from.x + ux * 2 * S, from.y + uy * 2 * S);
      ctx.lineTo(from.x + ux * 6 * S, from.y + uy * 6 * S);
      ctx.stroke();
      ctx.restore();
    };
    const drawGun = () => {
      if (!gunImg.complete || !gunImg.naturalWidth) return;
      const S = scale();
      drawArm();
      ctx.save();
      ctx.translate(gun.x, gun.y);
      ctx.rotate(gun.ang);
      ctx.scale(1, gun.roll);
      ctx.scale(-S, S);
      ctx.translate(-PIVOT.x, -PIVOT.y);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(gunImg, 0, 0);
      // the PINKMANE logo on the slide (turned so it always reads the right way)
      if (logoImg.complete && logoImg.naturalWidth) {
        ctx.imageSmoothingEnabled = true;
        ctx.save();
        if (gun.roll > 0) {
          ctx.translate(LOGO_BOX.x * 2 + LOGO_BOX.w, 0);
          ctx.scale(-1, 1);
        }
        ctx.drawImage(logoImg, LOGO_BOX.x, LOGO_BOX.y, LOGO_BOX.w, LOGO_BOX.h);
        ctx.restore();
      }
      ctx.restore();
      // muzzle flash
      if (flash > 0) {
        const m = gunPoint(MUZZLE.x - 2, MUZZLE.y);
        const c = AMMO[ammoIx].color;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 34);
        g.addColorStop(0, "rgba(255,255,255,0.95)");
        g.addColorStop(0.35, c[0]);
        g.addColorStop(1, "rgba(255,120,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(m.x - 34, m.y - 34, 68, 68);
        ctx.restore();
      }
    };
    const text = (t: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") => {
      ctx.font = `${size}px ${fontName}`;
      ctx.textAlign = align;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.fillText(t, x + Math.max(1, size / 8), y + Math.max(1, size / 8));
      ctx.fillStyle = color;
      ctx.fillText(t, x, y);
    };
    const drawBar = () => {
      bar = barRect();
      AMMO.forEach((a, i) => {
        const x = bar.x + i * (BOX + GAP);
        const on = i === ammoIx;
        const hover = barHit(mx, my) === i;
        ctx.fillStyle = on ? "rgba(214,60,200,0.95)" : hover ? "rgba(90,30,90,0.85)" : "rgba(26,6,24,0.75)";
        ctx.fillRect(x, bar.y, BOX, BOX);
        ctx.strokeStyle = on ? "#ffffff" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = on ? 3 : 1.5;
        ctx.strokeRect(x + 1.5, bar.y + 1.5, BOX - 3, BOX - 3);
        // the one you're using bobs a little
        const bob = on ? Math.round(Math.sin(clock * 5) * 2) : 0;
        drawAmmo(ctx, a.id, x + BOX / 2 + (a.id === "bullet" ? 20 : 0), bar.y + BOX / 2 + 3 + bob, 0, a.id === "leaf" ? 0.6 : 0, clock, 4.5);
        text(String(i + 1), x + 5, bar.y + 5, 12, on ? "#ffffff" : "rgba(255,255,255,0.65)");
      });
      const label = `${AMMO[ammoIx].name}  ·  RIGHT CLICK = SWITCH`;
      text(label, bar.x + bar.w / 2, bar.y - 24, 15, ammoFlash > 0 && Math.floor(clock * 10) % 2 ? "#ffd84a" : "#ffffff", "center");
    };
    // PINK HUNT, top right
    const drawHunt = () => {
      const x = vw - 16;
      let y = 14;
      text("PINK HUNT", x, y, 12, "#ff3bd0", "right");
      y += 20;
      text(`SCORE ${pad5(hunt.score)}`, x, y, 14, "#ffffff", "right");
      y += 22;
      if (hunt.on) {
        const t = Math.ceil(hunt.timeLeft);
        text(`TIME ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`, x, y, 11, t <= 10 && Math.floor(clock * 4) % 2 ? "#ff6a6a" : "#ffd84a", "right");
        y += 16;
        ctx.fillStyle = "rgba(26,6,24,0.7)";
        ctx.fillRect(x - 150, y, 150, 6);
        ctx.fillStyle = "#ff3bd0";
        ctx.fillRect(x - 150, y, (150 * hunt.timeLeft) / HUNT_TIME, 6);
        y += 14;
      } else {
        text("SHOOT THE FLYING PINKMANES", x, y, 9, "#ffffff", "right");
        y += 13;
        text("FAR = 20 · MID = 15 · CLOSE = 10", x, y, 9, "#ffd84a", "right");
        y += 13;
        text(`BOMB = ${BOMB_POINTS} · ${HUNT_TIME} SECONDS`, x, y, 9, "#ffd84a", "right");
        y += 17;
      }
      text("TOP 3", x, y, 10, "#ff3bd0", "right");
      y += 15;
      if (top3 && top3.length) {
        top3.forEach((e, i) => {
          text(`${i + 1}. ${e.name}  ${pad5(e.score)}`, x, y, 10, MEDALS[i], "right");
          y += 14;
        });
      } else if (top3) text("NO SCORES YET", x, y, 9, "rgba(255,255,255,0.7)", "right");
      else text(hunt.best ? `YOUR BEST ${pad5(hunt.best)}` : "...", x, y, 9, "rgba(255,255,255,0.7)", "right");
    };

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      clock += dt;
      const isBusy = busy();
      if (isBusy !== wasBusy) {
        // the Top 10 box: a normal mouse while it's open
        wasBusy = isBusy;
        setBoardOpen(isBusy);
        document.body.classList.toggle("gun-mode", !isBusy);
        aim.style.opacity = isBusy || !shown ? "0" : "1";
        if (!isBusy) {
          loadTop(); // it just closed: show the new Top 3
          hunt.lock = 0;
          hunt.score = 0;
          hunt.kills = 0;
        }
      }

      // ---- the gun moves ----
      const S = scale();
      // it slides along the bottom after the mouse (a bit behind it, like it has weight)
      // (but it stays right of the ammo bar)
      const minX = Math.min(vw - 60, Math.max(vw * 0.55, bar.x + bar.w + 100));
      const tx = Math.max(minX, Math.min(vw - 50, vw * 0.74 + (mx - vw * 0.5) * 0.34));
      const ty = vh - 30 * S * 0.55 + (my / vh - 0.5) * 30;
      gun.vx += ((tx - gun.x) * 60 - gun.vx * 13) * dt;
      gun.vy += ((ty - gun.y) * 60 - gun.vy * 13) * dt;
      gun.x += gun.vx * dt + Math.sin(clock * 1.7) * 0.05;
      gun.y += gun.vy * dt + Math.sin(clock * 3.4) * 0.05;
      // it points right at the aim (the barrel line goes through it), turning with a spring so it swings + settles
      const dx = mx - gun.x;
      const dy = my - gun.y;
      const dist = Math.hypot(dx, dy) || 1;
      const face = Math.cos(Math.atan2(dy, dx)) < 0 ? -1 : 1;
      gun.roll += (face - gun.roll) * Math.min(1, dt * 10); // rolls over when you aim to the other side
      if (Math.abs(gun.roll) < 0.05) gun.roll = gun.roll < 0 ? -0.05 : 0.05;
      const yb = (MUZZLE.y - PIVOT.y) * S * gun.roll;
      let want = Math.atan2(dy, dx) - Math.asin(Math.max(-0.95, Math.min(0.95, yb / dist)));
      want += -gun.kick * 0.32 * Math.sign(gun.roll); // recoil: the barrel kicks up
      want -= Math.max(-0.3, Math.min(0.3, gun.vx * 0.0006)) * Math.sign(gun.roll); // leans when it slides
      const diff = wrap(want - gun.ang);
      gun.spin += (diff * 230 - gun.spin * 22) * dt;
      gun.ang += gun.spin * dt;
      gun.kick = Math.max(0, gun.kick - dt * 6);
      // the kick also pushes the gun back
      gun.x -= Math.cos(gun.ang) * gun.kick * 1.2;
      gun.y -= Math.sin(gun.ang) * gun.kick * 1.2;
      flash -= dt;
      ammoFlash -= dt;
      if (hunt.lock > 0 && !isBusy) hunt.lock -= dt;
      if (hunt.on) {
        hunt.timeLeft -= dt;
        if (hunt.timeLeft <= 0) huntOver();
      }

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
      // a white flash where a flyer got hit
      for (const f of flashes) {
        f.life -= dt;
        ctx.fillStyle = `rgba(${f.rgb},0.9)`;
        ctx.fillRect(f.x, f.y, f.w, f.h);
      }
      for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].life <= 0) flashes.splice(i, 1);
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
      // explosion glows + rings
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const g of glows) {
        g.life -= dt;
        const a = Math.max(0, g.life / g.max);
        const gr = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, g.r);
        gr.addColorStop(0, `rgba(${g.rgb},${0.85 * a})`);
        gr.addColorStop(1, `rgba(${g.rgb},0)`);
        ctx.fillStyle = gr;
        ctx.fillRect(g.x - g.r, g.y - g.r, g.r * 2, g.r * 2);
      }
      ctx.restore();
      for (let i = glows.length - 1; i >= 0; i--) if (glows[i].life <= 0) glows.splice(i, 1);
      for (const rg of rings) {
        rg.life -= dt;
        const k = 1 - Math.max(0, rg.life / rg.max);
        const r = rg.r * (1 - (1 - k) * (1 - k)); // fast at first, then slows down
        ctx.globalAlpha = Math.max(0, rg.life / rg.max);
        ctx.strokeStyle = rg.color;
        ctx.lineWidth = Math.max(1, 4 * (1 - k));
        ctx.beginPath();
        if (rg.star) {
          // the spike shot: 8 pointy rays
          for (let i = 0; i < 8; i++) {
            const a = (Math.PI / 4) * i + Math.PI / 8;
            ctx.moveTo(rg.x + Math.cos(a) * r * 0.35, rg.y + Math.sin(a) * r * 0.35);
            ctx.lineTo(rg.x + Math.cos(a) * r, rg.y + Math.sin(a) * r);
          }
        } else ctx.arc(rg.x, rg.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
      // the flying ammo
      for (const s of shots) {
        s.t += dt;
        const k = Math.min(1, s.t / s.dur);
        const x = s.x0 + (s.x1 - s.x0) * k;
        let y = s.y0 + (s.y1 - s.y0) * k;
        if (s.ammo === "bomb") y -= Math.sin(Math.PI * k) * Math.min(90, Math.hypot(s.x1 - s.x0, s.y1 - s.y0) * 0.3); // the bomb is thrown in an arc
        s.spin += dt * (s.ammo === "leaf" ? 14 : s.ammo === "bomb" ? 9 : 18);
        const a = Math.atan2(y - s.lastY, x - s.lastX);
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
      // sparks + flyer pixels
      for (const q of parts) {
        q.life -= dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        q.vy += q.grav * dt;
        q.vx *= 1 - 2 * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, (q.life / q.max) * 1.5));
        if (q.leaf) {
          q.rot = (q.rot ?? 0) + dt * 8;
          drawAmmo(ctx, "leaf", q.x, q.y, 0, q.rot, clock, q.size);
          continue;
        }
        ctx.fillStyle = q.color;
        ctx.fillRect(Math.round(q.x - q.size / 2), Math.round(q.y - q.size / 2), q.size, q.size);
      }
      ctx.globalAlpha = 1;
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      if (parts.length > 900) parts.splice(0, parts.length - 900);
      // HIT! / +10 / combos
      for (const p of pops) {
        p.life -= dt;
        p.y -= 40 * dt;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.3));
        text(p.text, p.x, p.y, p.size, p.color, "center");
      }
      ctx.globalAlpha = 1;
      for (let i = pops.length - 1; i >= 0; i--) if (pops[i].life <= 0) pops.splice(i, 1);
      if (!isBusy) {
        drawHunt();
        if (shown) {
          drawGun();
          drawBar();
        }
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
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerout", onOut);
      aim.style.opacity = "0";
      canvas.style.opacity = "0";
      ctx.clearRect(0, 0, vw, vh);
      boardRef.current?.hide();
      ac?.close().catch(() => {});
    };
  }, [active, fontName]);

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
      {/* PINK HUNT's Top 10 (the same box as in the games), in the middle of the screen */}
      <div className="gun-board" style={{ pointerEvents: boardOpen ? "auto" : "none" }}>
        <ScorePanel game={BOARD_ID} title="PINK HUNT" apiRef={boardRef} fontFamily={fontName} width={320} height={150} />
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
          z-index: 2147483645;
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
        .gun-board {
          position: fixed;
          left: 50%;
          top: 50%;
          width: min(640px, 92vw);
          aspect-ratio: 320 / 150;
          transform: translate(-50%, -50%);
          z-index: 2147483646;
          image-rendering: pixelated;
        }
      `}</style>
    </>
  );
}
