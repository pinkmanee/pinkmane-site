// SPIRAL EYES: the black + white hypno spiral that spins in PINKMANE's eyes.
// Used by the CLICK TO ENTER screen, the dancing hype man next to the iPod and the "YOU'RE TOO HIGH" 404 page.
// (No React hooks in here, so the 404 page can use it too.)

import type { CSSProperties, Ref } from "react";

// PINKMANE's picture for the hype man / entrance / 404 (the eyes on it are painted white, the spirals go on top)
// The numbers are pixels on that picture (608 x 984). If you redraw it, move the eyes here.
export const DUDE = {
  src: "/hype/pinkmane-dude2.png",
  w: 608,
  h: 984,
  // x, y = the middle of each eye, rx / ry = how wide / tall the spiral is
  eyes: [
    { x: 304, y: 238.5, rx: 18.5, ry: 29 },
    { x: 346, y: 230, rx: 18.5, ry: 29.5 },
  ],
  tip: { x: 470, y: 295 }, // the end of the joint (where the smoke comes out)
  mouth: { x: 380, y: 300 }, // where the cough smoke comes out
};

const TURNS = 3.2; // how many times the line goes round
const LINE = 7.5; // how thick the black line is (out of 100)

// the spiral line, made once
const PATH = (() => {
  let d = "";
  const steps = 180;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const ang = t * TURNS * Math.PI * 2;
    const r = 2 + t * 44;
    d += `${i ? "L" : "M"}${(50 + Math.cos(ang) * r).toFixed(2)} ${(50 + Math.sin(ang) * r).toFixed(2)}`;
  }
  return d;
})();

type SpiralProps = {
  className?: string;
  style?: CSSProperties;
  speed?: number; // seconds for one full turn (CSS spin). Ignored when spinRef is given.
  spinRef?: Ref<SVGGElement>; // give this to spin it yourself (set its transform every frame)
};

// One spiral. It stretches to fill its box, so an oval box makes an oval eye.
export function Spiral({ className, style, speed = 1.4, spinRef }: SpiralProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
      <style>{"@keyframes pm-spiral-spin{to{transform:rotate(360deg)}}"}</style>
      <ellipse cx="50" cy="50" rx="50" ry="50" fill="#ffffff" />
      <g
        ref={spinRef}
        style={
          spinRef
            ? undefined
            : { transformOrigin: "50px 50px", transformBox: "view-box", animation: `pm-spiral-spin ${speed}s linear infinite` }
        }
      >
        <path d={PATH} fill="none" stroke="#000000" strokeWidth={LINE} strokeLinecap="round" />
      </g>
    </svg>
  );
}

// Both eyes, placed on top of the PINKMANE picture. Put this inside a box that's exactly the size of the picture
// (position: relative). spinRefs: optional, to spin them yourself.
export function DudeEyes({ speed = 1.4, spinRefs }: { speed?: number; spinRefs?: Ref<SVGGElement>[] }) {
  return (
    <>
      {DUDE.eyes.map((e, i) => (
        <Spiral
          key={i}
          speed={speed}
          spinRef={spinRefs?.[i]}
          style={{
            position: "absolute",
            left: `${((e.x - e.rx) / DUDE.w) * 100}%`,
            top: `${((e.y - e.ry) / DUDE.h) * 100}%`,
            width: `${((e.rx * 2) / DUDE.w) * 100}%`,
            height: `${((e.ry * 2) / DUDE.h) * 100}%`,
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}
