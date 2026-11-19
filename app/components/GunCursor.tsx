"use client";

import { useEffect, useRef } from "react";

// THE GUN CURSOR (computers only, not phones).
// The mouse turns into a pink aim, and every click is a SHOT: the shot sound, a muzzle flash and sparks.
// Shoot a button or a menu item = it gets clicked (a bigger pink hit). Shoot the background = a bullet hole that fades away.
// It switches off inside the games (they use the mouse themselves) and on phones.
//
// The sound: public/sounds/shot.mp3

// OFF SWITCH: set this to false and the mouse is a normal mouse again
const GUN_ON = true;

const SHOT_SOUND = "/sounds/shot.mp3";
const SHOT_VOLUME = 0.35; // the shot is loud, so it plays at 35%
const AIM_SIZE = 34; // how big the aim is (pixels)
const AIM_COLOR = "#ff3bd0";
// clicking these counts as a HIT (buttons, links, the iPod menu rows, the game list)
const HIT_TARGETS = "button, a, [role=button], [data-shoot], .gp-row";

type Props = {
  // on = the mouse is a gun right now
  active: boolean;
  // follows the site's mute button
  muted: boolean;
  // the site's pixel font (for the HIT! text)
  font?: string;
};

export default function GunCursor({ active, muted, font }: Props) {
  const aimRef = useRef<HTMLDivElement>(null);
  const reticleRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!active || !GUN_ON) return;
    // phones and tablets: no gun
    if (window.matchMedia?.("(pointer: coarse)").matches) return;
    const aim = aimRef.current;
    const reticle = reticleRef.current;
    const layer = layerRef.current;
    if (!aim || !reticle || !layer) return;
    document.body.classList.add("gun-mode");

    // ---------- the sound (Web Audio, so fast clicks overlap with no delay) ----------
    let ac: AudioContext | null = null;
    let buf: AudioBuffer | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ac = new AC();
      fetch(SHOT_SOUND)
        .then((r) => r.arrayBuffer())
        .then((b) => ac!.decodeAudioData(b))
        .then((d) => {
          buf = d;
        })
        .catch(() => {});
    } catch {}
    const bang = () => {
      if (mutedRef.current) return;
      if (ac && buf) {
        if (ac.state === "suspended") ac.resume().catch(() => {});
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = 0.92 + Math.random() * 0.16; // every shot a tiny bit different
        const g = ac.createGain();
        g.gain.value = SHOT_VOLUME;
        src.connect(g).connect(ac.destination);
        src.start();
      } else {
        // not loaded yet: the simple way
        const a = new Audio(SHOT_SOUND);
        a.volume = SHOT_VOLUME;
        a.play().catch(() => {});
      }
    };

    // ---------- the aim follows the mouse ----------
    let shown = false;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      aim.style.transform = `translate(${e.clientX - AIM_SIZE / 2}px, ${e.clientY - AIM_SIZE / 2}px)`;
      if (!shown) {
        shown = true;
        aim.style.opacity = "1";
      }
    };
    const onOut = (e: PointerEvent) => {
      if (e.relatedTarget) return; // still inside the page
      shown = false;
      aim.style.opacity = "0";
    };

    // ---------- the shot ----------
    const spark = (x: number, y: number, hit: boolean) => {
      // muzzle flash
      const flash = document.createElement("div");
      flash.className = "gun-flash";
      flash.style.left = `${x}px`;
      flash.style.top = `${y}px`;
      if (hit) flash.style.background = "radial-gradient(circle, #ffffff 0 18%, #ff3bd0 30%, rgba(255,59,208,0) 70%)";
      layer.appendChild(flash);
      flash.animate([{ transform: "translate(-50%,-50%) scale(0.3)", opacity: 1 }, { transform: `translate(-50%,-50%) scale(${hit ? 2.4 : 1.8})`, opacity: 0 }], {
        duration: hit ? 280 : 220,
        easing: "ease-out",
      }).onfinish = () => flash.remove();
      // sparks flying out
      const n = hit ? 10 : 6;
      for (let i = 0; i < n; i++) {
        const s = document.createElement("div");
        s.className = "gun-spark";
        s.style.left = `${x}px`;
        s.style.top = `${y}px`;
        s.style.background = i % 2 ? "#ffd84a" : hit ? AIM_COLOR : "#ffffff";
        layer.appendChild(s);
        const ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
        const dist = (hit ? 26 : 16) + Math.random() * 12;
        s.animate(
          [
            { transform: "translate(-50%,-50%)", opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px))`, opacity: 0 },
          ],
          { duration: 220 + Math.random() * 120, easing: "ease-out" },
        ).onfinish = () => s.remove();
      }
      if (hit) {
        const t = document.createElement("div");
        t.className = "gun-hit";
        t.textContent = "HIT!";
        if (font) t.style.fontFamily = font;
        t.style.left = `${x}px`;
        t.style.top = `${y - 24}px`;
        layer.appendChild(t);
        t.animate([{ transform: "translate(-50%,-50%) scale(0.6)", opacity: 1 }, { transform: "translate(-50%,-160%) scale(1)", opacity: 0 }], { duration: 600, easing: "ease-out" }).onfinish = () => t.remove();
      } else {
        // a bullet hole that fades away
        const hole = document.createElement("div");
        hole.className = "gun-hole";
        hole.style.left = `${x}px`;
        hole.style.top = `${y}px`;
        layer.appendChild(hole);
        hole.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration: 1600 }).onfinish = () => hole.remove();
      }
      // not too many at once if someone spam-clicks
      while (layer.childElementCount > 80) layer.firstElementChild?.remove();
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      bang();
      const hit = !!(e.target as Element | null)?.closest?.(HIT_TARGETS);
      spark(e.clientX, e.clientY, hit);
      // recoil: the aim kicks up
      reticle.animate(
        [
          { transform: "scale(1.45) rotate(14deg)" },
          { transform: "scale(1) rotate(0deg)" },
        ],
        { duration: 160, easing: "ease-out" },
      );
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    document.addEventListener("pointerout", onOut);
    return () => {
      document.body.classList.remove("gun-mode");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown, { capture: true });
      document.removeEventListener("pointerout", onOut);
      aim.style.opacity = "0";
      layer.replaceChildren();
      ac?.close().catch(() => {});
    };
  }, [active, font]);

  return (
    <>
      <div ref={layerRef} className="gun-layer" aria-hidden />
      <div ref={aimRef} className="gun-aim" aria-hidden>
        <div ref={reticleRef} className="gun-reticle">
          {/* the aim: a ring, 4 lines and a dot in the middle (pink with a dark edge so it shows on everything) */}
          <svg width={AIM_SIZE} height={AIM_SIZE} viewBox="0 0 34 34" shapeRendering="crispEdges">
            <g stroke="#1a0618" strokeWidth="4" fill="none">
              <circle cx="17" cy="17" r="10" />
              <path d="M17 1v8M17 25v8M1 17h8M25 17h8" />
            </g>
            <g stroke={AIM_COLOR} strokeWidth="2" fill="none">
              <circle cx="17" cy="17" r="10" />
              <path d="M17 1v8M17 25v8M1 17h8M25 17h8" />
            </g>
            <rect x="15" y="15" width="4" height="4" fill="#1a0618" />
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
          pointer-events: none;
          z-index: 2147483646;
          overflow: hidden;
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
        .gun-flash {
          position: absolute;
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: radial-gradient(circle, #ffffff 0 20%, #ffd84a 35%, rgba(255, 122, 0, 0) 70%);
          pointer-events: none;
        }
        .gun-spark {
          position: absolute;
          width: 3px;
          height: 3px;
          pointer-events: none;
        }
        .gun-hole {
          position: absolute;
          width: 8px;
          height: 8px;
          transform: translate(-50%, -50%);
          border-radius: 50%;
          background: radial-gradient(circle, #000 0 45%, #3a1a36 55%, rgba(0, 0, 0, 0) 75%);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
          pointer-events: none;
        }
        .gun-hit {
          position: absolute;
          font-family: "Press Start 2P", monospace;
          font-size: 12px;
          color: #fff;
          text-shadow: 1px 1px 0 #1a0618, -1px -1px 0 #1a0618, 0 0 6px ${AIM_COLOR};
          pointer-events: none;
          white-space: nowrap;
        }
      `}</style>
    </>
  );
}
