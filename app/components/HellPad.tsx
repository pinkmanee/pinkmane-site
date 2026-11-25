"use client";

import { useEffect, useRef, useState } from "react";

// PINK HELL on phones + tablets: the thumb controls over the game.
//   LEFT  = a pink joystick: walk (push it further = walk faster). Pinkmane looks the way you walk.
//   RIGHT = one big button: START before the game, FIRE while you play (hold it, it aims at the nearest demon for you)
//   GUN   = switch weapon (only shows while you play)
// They talk to HellGame with a "pinkmane-hell-stick" event: { stick: "move" | "fire", x, y, on }
// and HellGame tells them what's going on with a "pinkmane-hell-state" event: { mode: "ready" | "play" | "dead", paused }

type Props = {
  onWeapon: () => void;
};

const buzz = () => {
  try {
    navigator.vibrate?.(8);
  } catch {}
};
const send = (stick: "move" | "fire", x: number, y: number, on: boolean) =>
  window.dispatchEvent(new CustomEvent("pinkmane-hell-stick", { detail: { stick, x, y, on } }));

// the joystick. onMove: who gets the stick (Pink Hell by default; Pink Bomber passes its own)
function Joystick({ onMove, label = "Joystick: walk" }: { onMove?: (x: number, y: number, on: boolean) => void; label?: string }) {
  const knob = useRef<HTMLSpanElement>(null);
  const move = (x: number, y: number, on: boolean) => {
    if (onMove) onMove(x, y, on);
    else send("move", x, y, on);
    if (knob.current) {
      knob.current.style.transform = `translate(calc(-50% + ${x * 60}%), calc(-50% + ${y * 60}%))`;
      knob.current.classList.toggle("hp-knob-on", on);
    }
  };
  const update = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width * 0.4);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height * 0.4);
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    move(x, y, true);
  };
  const release = () => move(0, 0, false);
  return (
    <div
      className="hp-joy"
      role="group"
      aria-label={label}
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
      <span className="hp-knob" ref={knob} />
    </div>
  );
}

export default function HellPad({ onWeapon }: Props) {
  const [state, setState] = useState<{ mode: string; paused: boolean }>({ mode: "ready", paused: false });
  const [firing, setFiring] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ mode: string; paused: boolean }>).detail;
      if (d) setState(d);
    };
    window.addEventListener("pinkmane-hell-state", on);
    return () => window.removeEventListener("pinkmane-hell-state", on);
  }, []);
  const playing = state.mode === "play" && !state.paused;
  const label = state.paused ? "PLAY" : state.mode === "play" ? "FIRE" : state.mode === "dead" ? "AGAIN" : "START";
  const fire = (on: boolean) => {
    if (on === firing) return;
    setFiring(on);
    send("fire", 0, 0, on);
    if (on) buzz();
  };

  return (
    <>
      <Joystick />
      <button
        className={`hp-fire ${firing ? "hp-on" : ""} ${playing ? "" : "hp-start"}`}
        aria-label={label}
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          fire(true);
        }}
        onPointerUp={() => fire(false)}
        onPointerCancel={() => fire(false)}
        onLostPointerCapture={() => fire(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span>{label}</span>
      </button>
      {playing && (
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
      )}
      <PadStyle />
    </>
  );
}

// the look of the joystick and the buttons (shared by Pink Hell and Pink Bomber)
function PadStyle() {
  return (
    <>
      <style>{`
        /* the pink joystick, bottom left */
        .hp-joy {
          position: absolute;
          left: max(10px, env(safe-area-inset-left));
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(36vh, 140px); /* SIZE of the joystick (sideways) */
          aspect-ratio: 1;
          z-index: 3;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(60, 10, 50, 0.55) 0%, rgba(20, 4, 18, 0.55) 70%);
          border: 3px solid #ff5fd2;
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.5), inset 0 0 18px rgba(255, 95, 210, 0.35);
          touch-action: none;
        }
        .hp-knob {
          position: absolute;
          left: 50%;
          top: 50%;
          width: 46%;
          aspect-ratio: 1;
          border-radius: 50%;
          transform: translate(-50%, -50%);
          background: radial-gradient(circle at 35% 30%, #ffc2f0 0%, #ff5fd2 35%, #d63cc8 70%, #8a1f86 100%);
          border: 3px solid #111;
          box-shadow: 0 4px 0 rgba(0, 0, 0, 0.55);
          pointer-events: none;
        }
        .hp-knob-on {
          box-shadow: 0 2px 0 rgba(0, 0, 0, 0.55), 0 0 14px rgba(255, 95, 210, 0.8);
        }
        /* the big FIRE (START) button, bottom right */
        .hp-fire {
          position: absolute;
          right: max(10px, env(safe-area-inset-right));
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(30vh, 112px); /* SIZE of the fire button (sideways) */
          aspect-ratio: 1;
          z-index: 3;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          font-size: 12px;
          color: #fff;
          text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.7);
          background: radial-gradient(circle at 35% 30%, #ff8a8a 0%, #ff2a2a 40%, #a80000 100%);
          border: 3px solid #111;
          border-radius: 50%;
          box-shadow: 0 5px 0 rgba(0, 0, 0, 0.55), 0 0 0 3px rgba(255, 255, 255, 0.5);
          touch-action: none;
          -webkit-user-select: none;
          user-select: none;
        }
        .hp-fire.hp-start {
          background: radial-gradient(circle at 35% 30%, #fff3a0 0%, #ffd400 40%, #b88a00 100%);
          color: #111;
          text-shadow: none;
          animation: hpPulse 1s ease-in-out infinite;
        }
        .hp-fire.hp-on {
          transform: translateY(3px);
          box-shadow: 0 2px 0 rgba(0, 0, 0, 0.55), 0 0 0 3px rgba(255, 255, 255, 0.8), 0 0 18px rgba(255, 60, 60, 0.9);
        }
        @keyframes hpPulse {
          50% {
            scale: 1.06;
          }
        }
        /* the small GUN button: left of the fire button (sideways), above it (upright) */
        .hp-gun {
          position: absolute;
          right: calc(max(10px, env(safe-area-inset-right)) + min(30vh, 112px) + 10px);
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(17vh, 56px);
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
          background: rgba(138, 31, 134, 0.75);
          border: 3px solid #111;
          border-radius: 50%;
          box-shadow: 0 3px 0 rgba(0, 0, 0, 0.55), 0 0 0 2px rgba(255, 255, 255, 0.5);
          touch-action: none;
        }
        .hp-gun:active {
          background: #ff5fd2;
        }
        @media (orientation: portrait) {
          .hp-joy {
            left: 18px;
            bottom: max(30px, env(safe-area-inset-bottom));
            width: min(42vw, 170px); /* SIZE of the joystick (upright) */
          }
          .hp-fire {
            right: 18px;
            bottom: max(36px, env(safe-area-inset-bottom));
            width: min(32vw, 130px); /* SIZE of the fire button (upright) */
          }
          .hp-gun {
            right: calc(18px + min(32vw, 130px) - min(8vw, 32px));
            bottom: calc(max(36px, env(safe-area-inset-bottom)) + min(32vw, 130px) + 6px);
            width: min(16vw, 64px);
          }
        }
      `}</style>
    </>
  );
}

// PINK BOMBER on phones + tablets: the same pink joystick (walk on the grid: it goes the way you push the most)
// and one big BOMB button (also START / OK on the menus).
export function BomberPad({ onDir, onBomb }: { onDir: (key: string | null) => void; onBomb: (down: boolean) => void }) {
  const [down, setDown] = useState(false);
  const last = useRef<string | null>(null);
  const stick = (x: number, y: number, on: boolean) => {
    let key: string | null = null;
    // a little dead spot in the middle, then the way you push the most
    if (on && Math.hypot(x, y) > 0.3) key = Math.abs(x) >= Math.abs(y) ? (x > 0 ? "ArrowRight" : "ArrowLeft") : y > 0 ? "ArrowDown" : "ArrowUp";
    if (key === last.current) return;
    last.current = key;
    if (key) buzz();
    onDir(key);
  };
  const bomb = (on: boolean) => {
    if (on === down) return;
    setDown(on);
    onBomb(on);
    if (on) buzz();
  };
  return (
    <>
      <Joystick onMove={stick} label="Joystick: walk" />
      <button
        className={`hp-fire ${down ? "hp-on" : ""}`}
        aria-label="Bomb"
        onPointerDown={(e) => {
          e.preventDefault();
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          bomb(true);
        }}
        onPointerUp={() => bomb(false)}
        onPointerCancel={() => bomb(false)}
        onLostPointerCapture={() => bomb(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <span>BOMB</span>
      </button>
      <PadStyle />
    </>
  );
}
