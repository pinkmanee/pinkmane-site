"use client";

// THE HYPE MAN (computers only): PINKMANE dancing next to the iPod. He bounces on the kicks, gets squished by the 808s,
// his spiral eyes spin faster on the bass, and his joint keeps smoking.
// Shoot him with the gun and he coughs (and gives bonus points during a PINK HUNT round, see GunCursor.tsx).

import { useEffect, useRef, type RefObject } from "react";
import { DUDE, DudeEyes } from "./Spiral";

const HEIGHT = 0.44; // how tall he is, as a part of the screen height
const MIN_H = 230; // never smaller than this (pixels)
const MAX_H = 470; // never bigger than this
const GAP = 22; // space between the iPod and him (pixels)
const FLIP = true; // true = he faces the iPod (the picture is mirrored). false = the way it's drawn.
const DANCE = 1; // how hard he dances (0.5 = chill, 1.5 = wild)
const SMOKE_EVERY = 0.22; // seconds between smoke puffs from the joint
const SMOKE_PIXEL = 4; // how chunky the smoke pixels are

type Beat = { kick: number; sway: number; bass: number; live: boolean };
type Props = {
  show: boolean;
  beatRef: RefObject<Beat>;
  font: string;
};
type Puff = { x: number; y: number; vx: number; vy: number; r: number; grow: number; life: number; max: number; a: number };

export default function HypeMan({ show, beatRef, font }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const smokeRef = useRef<HTMLCanvasElement>(null);
  const wordRef = useRef<HTMLDivElement>(null);
  const eye1 = useRef<SVGGElement>(null);
  const eye2 = useRef<SVGGElement>(null);

  useEffect(() => {
    if (!show) return;
    // only on computers with room next to the iPod (the same as the music video)
    if (window.matchMedia?.("(hover: none)").matches) return;
    const box = boxRef.current;
    const body = bodyRef.current;
    const canvas = smokeRef.current;
    if (!box || !body || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // his outline, so only shots that hit HIM count (not the empty space around him)
    let mask: Uint8ClampedArray | null = null;
    const pic = new Image();
    pic.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = DUDE.w;
        c.height = DUDE.h;
        const cc = c.getContext("2d");
        if (!cc) return;
        cc.drawImage(pic, 0, 0, DUDE.w, DUDE.h);
        mask = cc.getImageData(0, 0, DUDE.w, DUDE.h).data;
      } catch {}
    };
    pic.src = DUDE.src;

    let vw = 0;
    let vh = 0;
    // the smoke is drawn small and blown up, so it comes out in chunky pixels
    const fit = () => {
      vw = window.innerWidth;
      vh = window.innerHeight;
      canvas.width = Math.ceil(vw / SMOKE_PIXEL);
      canvas.height = Math.ceil(vh / SMOKE_PIXEL);
    };
    fit();
    window.addEventListener("resize", fit);

    // where he stands
    const spot = { x: 0, y: 0, w: 0, h: 0, on: false };
    let lastLook = -1;
    const look = (now: number) => {
      if (now - lastLook < 250) return;
      lastLook = now;
      const ipod = document.querySelector<HTMLElement>(".ipod-shell");
      const r = ipod?.getBoundingClientRect();
      let on = !!r && r.width > 100 && vw > 1150;
      if (r && on) {
        const h = Math.max(MIN_H, Math.min(MAX_H, vh * HEIGHT, r.height * 1.05));
        const w = (h * DUDE.w) / DUDE.h;
        spot.w = w;
        spot.h = h;
        spot.x = r.right + GAP;
        spot.y = Math.min(r.bottom, vh - 8) - h;
        // no room on the right? (keeps clear of the key legend in the corner)
        const legend = document.querySelector<HTMLElement>(".ipod-keys")?.getBoundingClientRect();
        const rightEdge = legend && legend.width > 0 && legend.top < spot.y + h && legend.bottom > spot.y ? legend.left - 8 : vw - 8;
        if (spot.x + w > rightEdge) on = false;
      }
      if (on !== spot.on) {
        spot.on = on;
        box.style.display = on ? "block" : "none";
        if (!on) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };

    // ---- moving ----
    let clock = 0;
    let bounce = 0; // smoothed
    let squash = 0;
    let cough = 0; // 1 right after he got shot, fades out
    let trip = false; // TRIP MODE in the PINK HUNT: he goes wild
    let eyeAng = 0;
    let smokeT = 0;
    const puffs: Puff[] = [];
    // his current pose, kept for the hit test + smoke spots
    const pose = { ox: 0, oy: 0, rot: 0, sx: 1, sy: 1, tx: 0, ty: 0 };

    // a point on the picture -> a point on the screen (with his dance moves on)
    const toScreen = (px: number, py: number) => {
      let lx = (px / DUDE.w - 0.5) * spot.w;
      const ly = (py / DUDE.h - 1) * spot.h; // from his feet (negative = up)
      if (FLIP) lx = -lx;
      const x = lx * pose.sx;
      const y = ly * pose.sy;
      const c = Math.cos(pose.rot);
      const s = Math.sin(pose.rot);
      return { x: pose.ox + pose.tx + x * c - y * s, y: pose.oy + pose.ty + x * s + y * c };
    };
    // a point on the screen -> a point on the picture
    const toPic = (x: number, y: number) => {
      const dx = x - pose.ox - pose.tx;
      const dy = y - pose.oy - pose.ty;
      const c = Math.cos(-pose.rot);
      const s = Math.sin(-pose.rot);
      let lx = (dx * c - dy * s) / pose.sx;
      const ly = (dx * s + dy * c) / pose.sy;
      if (FLIP) lx = -lx;
      return { x: (lx / spot.w + 0.5) * DUDE.w, y: (ly / spot.h + 1) * DUDE.h };
    };
    const solidAt = (x: number, y: number, pad: number) => {
      if (!spot.on) return false;
      const step = Math.max(4, pad / 2);
      for (let oy = -pad; oy <= pad; oy += step)
        for (let ox = -pad; ox <= pad; ox += step) {
          if (ox * ox + oy * oy > pad * pad) continue;
          const p = toPic(x + ox, y + oy);
          const ix = Math.round(p.x);
          const iy = Math.round(p.y);
          if (ix < 0 || iy < 0 || ix >= DUDE.w || iy >= DUDE.h) continue;
          if (!mask) return true; // (outline not ready yet: the box counts)
          if (mask[(iy * DUDE.w + ix) * 4 + 3] > 100) return true;
        }
      return false;
    };

    // the gun asks "did this shot hit you?" (see GunCursor.tsx). Saying yes = preventDefault.
    const onShot = (e: Event) => {
      const d = (e as CustomEvent<{ x: number; y: number; pad?: number }>).detail;
      if (!d || !solidAt(d.x, d.y, d.pad ?? 10)) return;
      e.preventDefault();
      cough = 1;
      const m = toScreen(DUDE.mouth.x, DUDE.mouth.y);
      const dir = FLIP ? -1 : 1;
      for (let i = 0; i < 16; i++) {
        const v = 120 + Math.random() * 220;
        const a = (Math.random() - 0.5) * 1.1 - 0.15;
        puffs.push({ x: m.x, y: m.y, vx: Math.cos(a) * v * dir, vy: Math.sin(a) * v - 20, r: 4 + Math.random() * 6, grow: 22 + Math.random() * 18, life: 1.1 + Math.random() * 0.6, max: 1.6, a: 0.5 });
      }
      // *COUGH* pops up over his head
      const word = wordRef.current;
      if (word) {
        const top = toScreen(DUDE.w / 2, 40);
        word.textContent = Math.random() < 0.5 ? "*COUGH*" : "*COUGH COUGH*";
        word.style.left = `${top.x}px`;
        word.style.top = `${top.y}px`;
        word.animate(
          [
            { opacity: 0, transform: "translate(-50%, 0) scale(0.6)" },
            { opacity: 1, transform: "translate(-50%, -14px) scale(1.15)", offset: 0.15 },
            { opacity: 1, transform: "translate(-50%, -30px) scale(1)", offset: 0.7 },
            { opacity: 0, transform: "translate(-50%, -44px) scale(1)" },
          ],
          { duration: 1100, easing: "ease-out" }
        );
      }
    };
    const onTrip = (e: Event) => {
      trip = !!(e as CustomEvent<{ on: boolean }>).detail?.on;
    };
    window.addEventListener("pinkmane-shot", onShot);
    window.addEventListener("pinkmane-trip", onTrip);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      clock += dt;
      look(now);
      if (spot.on) {
        const b = beatRef.current ?? { kick: 0, sway: 0, bass: 0, live: false };
        const wild = (trip ? 1.6 : 1) * DANCE;
        const kick = Math.max(0, Math.min(1, b.kick || 0));
        const bass = Math.max(0, Math.min(1, b.bass || 0));
        const sway = Math.max(-1, Math.min(1, b.sway || 0));
        if (b.live) {
          bounce += (kick - bounce) * Math.min(1, dt * 18);
          squash = Math.max(bass, squash * Math.exp(-dt * 9));
        } else {
          bounce *= Math.exp(-dt * 6);
          squash *= Math.exp(-dt * 6);
        }
        cough = Math.max(0, cough - dt * 1.4);
        const idle = b.live ? 0 : 1;
        const dir = FLIP ? -1 : 1;
        const coughJerk = Math.sin(cough * 26) * cough;
        pose.ox = spot.x + spot.w / 2;
        pose.oy = spot.y + spot.h;
        pose.tx = coughJerk * 4 * dir;
        pose.ty = -bounce * spot.h * 0.045 * wild - Math.sin(clock * 2) * 2 * idle + cough * 6;
        pose.rot =
          ((sway * 4 * wild + Math.sin(clock * (trip ? 9 : 2.2)) * (b.live ? 1.5 * wild : 1) + coughJerk * 6 * dir) * Math.PI) / 180;
        pose.sx = 1 + squash * 0.05 * wild + cough * 0.03;
        pose.sy = 1 - squash * 0.07 * wild - cough * 0.04;
        box.style.transform = `translate(${spot.x}px, ${spot.y}px)`;
        box.style.width = `${spot.w}px`;
        box.style.height = `${spot.h}px`;
        body.style.transform = `translate(${pose.tx.toFixed(1)}px, ${pose.ty.toFixed(1)}px) rotate(${pose.rot.toFixed(4)}rad) scale(${pose.sx.toFixed(3)}, ${pose.sy.toFixed(3)})`;

        // spiral eyes: faster on the bass, crazy in TRIP MODE
        eyeAng += dt * 360 * (0.7 + bass * 2.6 + (trip ? 1.8 : 0) + cough * 3);
        const t = `rotate(${(eyeAng % 360).toFixed(1)} 50 50)`;
        eye1.current?.setAttribute("transform", t);
        eye2.current?.setAttribute("transform", t);

        // ---- smoke ----
        smokeT -= dt;
        if (smokeT <= 0) {
          smokeT = SMOKE_EVERY * (0.7 + Math.random() * 0.6) * (b.live && bass > 0.5 ? 0.5 : 1);
          const tip = toScreen(DUDE.tip.x, DUDE.tip.y);
          puffs.push({ x: tip.x, y: tip.y, vx: (Math.random() - 0.5) * 14, vy: -28 - Math.random() * 22, r: 2 + Math.random() * 2, grow: 7 + Math.random() * 5, life: 2.2 + Math.random() * 1.2, max: 3.2, a: 0.3 });
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = puffs.length - 1; i >= 0; i--) {
          const p = puffs[i];
          p.life -= dt;
          if (p.life <= 0) {
            puffs.splice(i, 1);
            continue;
          }
          p.vx *= Math.exp(-dt * 1.6);
          p.vy = p.vy * Math.exp(-dt * 1.2) - 16 * dt; // keeps rising
          p.x += (p.vx + Math.sin(clock * 1.3 + p.y * 0.03) * 8) * dt;
          p.y += p.vy * dt;
          p.r += p.grow * dt;
          const fade = Math.min(1, p.life / 0.8) * p.a;
          ctx.fillStyle = `rgba(236, 232, 246, ${fade.toFixed(3)})`;
          ctx.beginPath();
          ctx.arc(p.x / SMOKE_PIXEL, p.y / SMOKE_PIXEL, Math.max(0.6, p.r / SMOKE_PIXEL), 0, Math.PI * 2);
          ctx.fill();
        }
        if (puffs.length > 140) puffs.splice(0, puffs.length - 140);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      window.removeEventListener("pinkmane-shot", onShot);
      window.removeEventListener("pinkmane-trip", onTrip);
      box.style.display = "none";
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [show, beatRef, font]);

  return (
    <>
      <canvas ref={smokeRef} className="hype-smoke" aria-hidden />
      <div ref={wordRef} className="hype-word" style={{ fontFamily: font }} aria-hidden />
      <div ref={boxRef} className="hype" style={{ display: "none" }} aria-hidden>
        <div ref={bodyRef} className="hype-body">
          <div className="hype-pic" style={{ transform: FLIP ? "scaleX(-1)" : undefined }}>
            <img src={DUDE.src} alt="" draggable={false} />
            <DudeEyes spinRefs={[eye1, eye2]} />
          </div>
        </div>
      </div>
      <style>{`
        .hype-smoke {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          pointer-events: none;
          z-index: 1;
          image-rendering: pixelated;
        }
        .hype-word {
          position: fixed;
          left: 0;
          top: 0;
          z-index: 2;
          opacity: 0;
          pointer-events: none;
          white-space: nowrap;
          font-size: 12px;
          color: #ffffff;
          text-shadow: 2px 2px 0 #000, -1px -1px 0 #000;
          transform: translate(-50%, 0);
        }
        .hype {
          position: fixed;
          left: 0;
          top: 0;
          width: 200px;
          height: 380px;
          pointer-events: none;
          z-index: 1;
          will-change: transform;
        }
        .hype-body {
          position: absolute;
          inset: 0;
          transform-origin: 50% 100%;
          will-change: transform;
          filter: drop-shadow(0 0 10px rgba(255, 59, 208, 0.45));
        }
        .hype-pic {
          position: absolute;
          inset: 0;
        }
        .hype-pic img {
          display: block;
          width: 100%;
          height: 100%;
          user-select: none;
        }
        @media (hover: none), (max-width: 1150px) {
          .hype,
          .hype-word,
          .hype-smoke {
            display: none !important;
          }
        }
      `}</style>
    </>
  );
}
