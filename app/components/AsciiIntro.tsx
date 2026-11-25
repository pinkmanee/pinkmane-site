"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiLayer, type AsciiStyle, type Warp } from "../../game/engine/ascii";
import { DUDE } from "./Spiral";
import { isPhoneOrTablet } from "./device";

// THE INTRO: the first thing you see on pinkmane.site (once per visit).
// Code rain falls, PINKMANE prints himself line by line in glowing text characters with the name under him,
// then a vortex sucks everything into the middle and the site appears.
// Click / tap / any key = skip (it jumps to the vortex). People who turned off animations on their device don't get it.

const SEEN_KEY = "pinkmane-intro-seen"; // (remembered until the browser tab is closed)
const T = { print: 0.45, printed: 1.6, vortex: 2.55, flash: 3.25, gone: 3.6 }; // seconds
const SCREEN: [number, number, number] = [6, 4, 10];
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const CODE = "01<>/\\{}[];=+*#$&%0101";

// the falling code: flickering digits and symbols
const RAIN: AsciiStyle = {
  levels: [".", ":", "1", "0", "01", "<>", "{}", "#$"],
  edges: false,
  edgeStrength: 1,
  threshold: 0.06,
  gamma: 0.8,
  boost: 1.35,
  solid: false,
  tint: 0.18,
  halo: 0,
  crisp: 1.4,
};
// Pinkmane and his name
const LOGO: AsciiStyle = {
  levels: [".", ":", "-=", "+=", "*x", "zs", "ZS", "#%", "%&#", "@#"],
  edges: true,
  edgeStrength: 0.34,
  threshold: 0.07,
  gamma: 0.7,
  boost: 1.45,
  solid: true,
  tint: 0,
  halo: 0.7,
  crisp: 1.5,
};

type Drop = { x: number; y: number; v: number; len: number; col: string };
type Bit = { a: number; r: number; c: string; col: string };

const smooth = (u: number) => {
  const v = Math.min(1, Math.max(0, u));
  return v * v * (3 - 2 * v);
};

export default function AsciiIntro() {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (seen || calm || !canvas || !ctx) {
      setShow(false);
      return;
    }

    const rain = new AsciiLayer(RAIN);
    const logo = new AsciiLayer(LOGO);
    let W = 1;
    let H = 1;
    let dpr = 1;
    let drops: Drop[] = [];
    let bits: Bit[] = [];
    // Pinkmane's picture with the black parts lifted to purple (black would disappear on the dark screen)
    const art = document.createElement("canvas");
    const img = new Image();
    let artReady = false;
    img.onload = () => {
      art.width = img.naturalWidth;
      art.height = img.naturalHeight;
      const a = art.getContext("2d");
      if (!a) return;
      a.drawImage(img, 0, 0);
      a.globalCompositeOperation = "lighten";
      a.fillStyle = "#5b4fb4";
      a.fillRect(0, 0, art.width, art.height);
      a.globalCompositeOperation = "destination-in";
      a.drawImage(img, 0, 0);
      artReady = true;
    };
    img.src = DUDE.src;

    const resize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      dpr = Math.min(2.5, window.devicePixelRatio || 1, Math.max(1, Math.sqrt(2_600_000 / (W * H))));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const cell = Math.min(9, Math.max(5, W / 190));
      rain.resize(W, H, dpr, Math.min(11, cell * 1.35), 1.55);
      logo.resize(W, H, dpr, cell, 1.55);
      drops = [];
      const n = Math.round(W / 14);
      for (let i = 0; i < n; i++) drops.push(newDrop(true));
    };
    const newDrop = (anywhere: boolean): Drop => ({
      x: Math.random() * W,
      y: anywhere ? Math.random() * H * 1.3 - H * 0.3 : -Math.random() * 300,
      v: 260 + Math.random() * 700,
      len: 60 + Math.random() * 220,
      col: Math.random() < 0.3 ? "#ff3bd0" : Math.random() < 0.5 ? "#9c8cff" : "#6e5fd0",
    });

    // where Pinkmane and his name go
    const layout = () => {
      const wide = W > H * 1.05;
      const dh = Math.min(H * (wide ? 0.62 : 0.5), (W * 0.8 * DUDE.h) / DUDE.w);
      const dw = (dh * DUDE.w) / DUDE.h;
      const name = Math.min(W * 0.15, H * 0.14);
      const top = (H - dh - name * 1.1) / 2;
      return { dx: W / 2 - dw / 2, dy: top, dw, dh, nameY: top + dh + name * 0.62, name };
    };

    let t = 0;
    let last = performance.now();
    let raf = 0;
    let finished = false;
    const skip = () => {
      if (t < T.vortex) t = T.vortex;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return; // (browser shortcuts still work)
      // (the site underneath shouldn't get this key too)
      e.stopPropagation();
      if ([" ", "Enter", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      skip();
    };
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("pointerdown", skip);
    };
    window.addEventListener("keydown", onKey, true);
    canvas.addEventListener("pointerdown", skip);
    window.addEventListener("resize", resize);
    resize();

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const L = layout();
      const cx = W / 2;
      const cy = L.dy + L.dh * 0.45;
      // the swirl at the end
      const e = smooth((t - T.vortex) / (T.flash - T.vortex));
      const warp: Warp | null = t > T.vortex ? { cx, cy, radius: Math.max(W, H) * 0.32, twist: 9 * e, pull: 3.2 * e } : null;

      // 1. the code rain (fades back once Pinkmane has printed)
      const rainK = t < T.printed ? 1 : 0.35 + 0.65 * (1 - smooth((t - T.printed) / 0.6));
      const r = rain.sctx;
      const [rax, ray, rbx, rby] = rain.sceneMatrix();
      r.setTransform(1, 0, 0, 1, 0, 0);
      r.fillStyle = "rgb(6,4,10)";
      r.fillRect(0, 0, rain.cols, rain.rows);
      r.setTransform(rax, 0, 0, ray, rbx, rby);
      r.lineCap = "round";
      for (const d of drops) {
        d.y += d.v * dt;
        if (d.y - d.len > H) Object.assign(d, newDrop(false));
        const g = r.createLinearGradient(0, d.y - d.len, 0, d.y);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, d.col);
        r.strokeStyle = g;
        r.globalAlpha = rainK;
        r.lineWidth = rain.cw * 0.9;
        r.beginPath();
        r.moveTo(d.x, d.y - d.len);
        r.lineTo(d.x, d.y);
        r.stroke();
        // the bright head of each drop
        r.fillStyle = "#ffffff";
        r.fillRect(d.x - rain.cw * 0.45, d.y - rain.ch * 0.5, rain.cw * 0.9, rain.ch);
      }
      r.globalAlpha = 1;

      // 2. Pinkmane + PINKMANE, printed top to bottom
      const l = logo.sctx;
      const [lax, lay, lbx, lby] = logo.sceneMatrix();
      l.setTransform(1, 0, 0, 1, 0, 0);
      l.clearRect(0, 0, logo.cols, logo.rows);
      l.setTransform(lax, 0, 0, lay, lbx, lby);
      const total = L.nameY + L.name * 0.6 - L.dy;
      const printedTo = L.dy + total * smooth((t - T.print) / (T.printed - T.print));
      if (t > T.print) {
        l.save();
        l.beginPath();
        l.rect(0, 0, W, printedTo);
        l.clip();
        if (artReady) {
          // (a little wobble, like he's dancing)
          l.translate(L.dx + L.dw / 2, L.dy + L.dh);
          l.rotate(Math.sin(t * 2.6) * 0.035);
          l.drawImage(art, -L.dw / 2, -L.dh, L.dw, L.dh);
          l.setTransform(lax, 0, 0, lay, lbx, lby);
        }
        l.fillStyle = "#ff3bd0";
        l.textAlign = "center";
        l.textBaseline = "middle";
        l.font = `900 ${Math.round(L.name)}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
        l.fillText("PINKMANE", W / 2, L.nameY);
        l.restore();
        // the bright printing line
        if (t < T.printed + 0.1) {
          l.fillStyle = "#ffffff";
          l.fillRect(W * 0.12, printedTo - logo.ch * 0.6, W * 0.76, logo.ch * 1.2);
        }
      }

      // 3. onto the screen
      rain.compose(ctx, { background: SCREEN, warp, seed: Math.floor(t * 30) });
      logo.compose(ctx, { warp, region: { x0: 0, y0: L.dy - 30, x1: W, y1: L.nameY + L.name } });

      // 4. code spiralling into the vortex, then the flash
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (t > T.vortex && t < T.flash) {
        for (let i = 0; i < Math.round(220 * dt + Math.random()); i++)
          bits.push({ a: Math.random() * Math.PI * 2, r: Math.max(W, H) * (0.3 + Math.random() * 0.4), c: CODE[(Math.random() * CODE.length) | 0], col: Math.random() < 0.5 ? "#ff3bd0" : "#ffffff" });
      }
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const b of bits) {
        b.a += (1.4 + 260 / (b.r + 30)) * dt;
        b.r -= (240 + 900 * e) * dt;
        ctx.globalAlpha = Math.min(1, b.r / 80);
        ctx.font = `bold ${Math.round(10 + Math.min(10, b.r / 40))}px ${MONO}`;
        ctx.fillStyle = b.col;
        ctx.fillText(b.c, cx + Math.cos(b.a) * b.r, cy + Math.sin(b.a) * b.r);
      }
      bits = bits.filter((b) => b.r > 6);
      ctx.globalAlpha = 1;
      const fl = t - T.flash;
      if (fl > -0.12) {
        const k = fl < 0 ? (fl + 0.12) / 0.12 : Math.max(0, 1 - fl / 0.35);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * k})`);
        g.addColorStop(0.3, `rgba(255,59,208,${0.45 * k})`);
        g.addColorStop(1, "rgba(255,59,208,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // the skip hint
      if (t < T.vortex) {
        ctx.globalAlpha = 0.55 * smooth(t / 0.6);
        ctx.fillStyle = "#cfc6ff";
        ctx.font = `bold 12px ${MONO}`;
        ctx.fillText(isPhoneOrTablet() ? "TAP TO SKIP" : "CLICK TO SKIP", W / 2, H - 22);
        ctx.globalAlpha = 1;
      }

      if (t >= T.flash && !finished) {
        finished = true;
        setFading(true);
      }
      if (t >= T.gone) {
        stop();
        setShow(false);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return stop;
  }, []);

  if (!show) return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "#06040a",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.35s ease",
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", cursor: "pointer" }} />
    </div>
  );
}
