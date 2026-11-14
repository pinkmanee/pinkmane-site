"use client";

import { useRef } from "react";

// PINK HELL on phones + tablets: two thumb sticks over the game.
//   LEFT stick  = walk (any direction, push further = walk faster)
//   RIGHT stick = aim, and Pinkmane keeps shooting while you hold it (a little aim help points at the nearest demon)
//   GUN button  = switch weapon
// The sticks talk to HellGame with a "pinkmane-hell-stick" event: { stick: "move" | "aim", x, y, on }

type Props = {
  onWeapon: () => void;
};

const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {}
};

function Stick({ which }: { which: "move" | "aim" }) {
  const knob = useRef<HTMLSpanElement>(null);
  const send = (x: number, y: number, on: boolean) => {
    window.dispatchEvent(new CustomEvent("pinkmane-hell-stick", { detail: { stick: which, x, y, on } }));
    if (knob.current) knob.current.style.transform = `translate(calc(-50% + ${x * 32}%), calc(-50% + ${y * 32}%))`;
  };
  const update = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    send(x, y, true);
  };
  const release = () => send(0, 0, false);
  return (
    <div
      className={`hp-stick hp-${which}`}
      role="group"
      aria-label={which === "move" ? "Walk" : "Aim and shoot"}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        buzz();
        update(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) update(e);
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
    >
      <span className="hp-label">{which === "move" ? "MOVE" : "AIM + FIRE"}</span>
      <span className="hp-knob" ref={knob} />
    </div>
  );
}

export default function HellPad({ onWeapon }: Props) {
  return (
    <>
      <Stick which="move" />
      <Stick which="aim" />
      <button
        className="hp-gun"
        aria-label="Switch weapon"
        onPointerDown={(e) => {
          e.preventDefault();
          buzz();
          onWeapon();
        }}
      >
        <span>GUN</span>
      </button>
      <style>{`
        .hp-stick {
          position: absolute;
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(40vh, 150px); /* SIZE of the sticks (sideways) */
          aspect-ratio: 1;
          z-index: 3;
          border-radius: 50%;
          background: rgba(17, 17, 17, 0.32);
          border: 2px solid rgba(255, 255, 255, 0.55);
          touch-action: none;
        }
        .hp-move {
          left: max(10px, env(safe-area-inset-left));
        }
        .hp-aim {
          right: max(10px, env(safe-area-inset-right));
          border-color: rgba(255, 60, 60, 0.75);
        }
        .hp-knob {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 42%;
          aspect-ratio: 1;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: rgba(214, 60, 200, 0.6);
          border: 2px solid rgba(255, 255, 255, 0.8);
          pointer-events: none;
        }
        .hp-aim .hp-knob {
          background: rgba(255, 42, 42, 0.6);
        }
        .hp-label {
          position: absolute;
          left: 0;
          right: 0;
          top: -14px;
          text-align: center;
          font-size: 7px;
          color: #fff;
          text-shadow: 1px 1px 0 #000;
          pointer-events: none;
          white-space: nowrap;
        }
        .hp-gun {
          position: absolute;
          right: max(10px, env(safe-area-inset-right));
          bottom: calc(max(12px, env(safe-area-inset-bottom)) + min(40vh, 150px) + 22px);
          width: min(18vh, 62px);
          aspect-ratio: 1;
          z-index: 3;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          font-size: 8px;
          color: #fff;
          text-shadow: 1px 1px 0 rgba(0, 0, 0, 0.6);
          background: rgba(138, 31, 134, 0.5);
          border: 2px solid rgba(255, 255, 255, 0.65);
          border-radius: 50%;
          touch-action: none;
        }
        .hp-gun:active {
          background: rgba(255, 143, 240, 0.9);
        }
        @media (orientation: portrait) {
          .hp-stick {
            bottom: max(30px, env(safe-area-inset-bottom));
            width: min(40vw, 170px); /* SIZE of the sticks (upright) */
          }
          .hp-move {
            left: 14px;
          }
          .hp-aim {
            right: 14px;
          }
          .hp-gun {
            right: 14px;
            bottom: calc(max(30px, env(safe-area-inset-bottom)) + min(40vw, 170px) + 24px);
            width: min(16vw, 64px);
          }
        }
      `}</style>
    </>
  );
}
