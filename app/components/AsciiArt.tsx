"use client";

import { useEffect, useRef, type RefObject } from "react";
import { AsciiLayer, type AsciiStyle, type Warp } from "../../game/engine/ascii";

// ASCII PICTURES for the site (the 404 page uses these): anything drawn on a canvas, shown as glowing text characters.
// <AsciiArt draw={...} /> fills its box. draw(ctx, width, height, seconds) draws the picture in normal css pixels.
// <AsciiBackdrop draw={...} /> is the same, for the whole screen behind everything (with a solid dark background).

export const ART_STYLE: AsciiStyle = {
  levels: [".", ":", "-=", "+=", "*x", "zs", "ZS", "#%", "%&#", "@#"],
  edges: true,
  edgeStrength: 0.34,
  threshold: 0.07,
  gamma: 0.7,
  boost: 1.4,
  solid: true,
  tint: 0,
  halo: 0.6,
  crisp: 1.5,
};
export const BACKDROP_STYLE: AsciiStyle = {
  levels: [".", ":", ";", "-~", "+", "=+", "<>", "*x", "#"],
  edges: true,
  edgeStrength: 0.3,
  threshold: 0.05,
  gamma: 0.85,
  boost: 1.3,
  solid: false,
  tint: 0.3,
  halo: 0,
  crisp: 1.35,
};

type Draw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number) => void;
type WarpFn = (w: number, h: number, t: number) => Warp | null;

function useAscii(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  draw: Draw,
  opts: { style: AsciiStyle; cell: number | ((w: number, h: number) => number); background?: [number, number, number]; warp?: WarpFn; still?: boolean },
) {
  const drawRef = useRef(draw);
  const optsRef = useRef(opts);
  useEffect(() => {
    drawRef.current = draw;
    optsRef.current = opts;
  });
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const layer = new AsciiLayer(optsRef.current.style);
    let W = 1;
    let H = 1;
    let dpr = 1;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      dpr = Math.min(2.5, window.devicePixelRatio || 1, Math.max(1, Math.sqrt(2_400_000 / (W * H))));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      const c = optsRef.current.cell;
      layer.resize(W, H, dpr, typeof c === "function" ? c(W, H) : c, 1.55);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    const start = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const t = (now - start) / 1000;
      const o = optsRef.current;
      const s = layer.sctx;
      const [ax, ay, bx, by] = layer.sceneMatrix();
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.clearRect(0, 0, layer.cols, layer.rows);
      s.setTransform(ax, 0, 0, ay, bx, by);
      drawRef.current(s, W, H, t);
      if (!o.background) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      layer.compose(ctx, { background: o.background, warp: o.warp ? o.warp(W, H, t) : null });
      if (!o.still) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [canvasRef]);
}

export function AsciiArt({ draw, cell = 5, style = ART_STYLE, still = false }: { draw: Draw; cell?: number | ((w: number, h: number) => number); style?: AsciiStyle; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useAscii(ref, draw, { style, cell, still });
  return <canvas ref={ref} aria-hidden style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

export function AsciiBackdrop({ draw, warp, still = false }: { draw: Draw; warp?: WarpFn; still?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useAscii(ref, draw, { style: BACKDROP_STYLE, cell: (w) => Math.min(11, Math.max(7, w / 150)), background: [7, 5, 12], warp, still });
  return <canvas ref={ref} aria-hidden style={{ position: "fixed", inset: 0, width: "100%", height: "100%", display: "block" }} />;
}

// a picture with its black parts lifted to purple (black disappears on the dark ASCII screen). Ready = onReady
export function liftedPicture(src: string, lift: string, onReady: (c: HTMLCanvasElement) => void) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const a = c.getContext("2d");
    if (!a) return;
    a.drawImage(img, 0, 0);
    a.globalCompositeOperation = "lighten";
    a.fillStyle = lift;
    a.fillRect(0, 0, c.width, c.height);
    a.globalCompositeOperation = "destination-in";
    a.drawImage(img, 0, 0);
    onReady(c);
  };
  img.src = src;
}
