"use client";

// CLICK TO ENTER: the first thing you see. PINKMANE with spinning spiral eyes on the hypno background.
// Clicking (or tapping, or Enter / Space) goes in, and that same click starts the music.
// It shows once per visit: reloading the page in the same tab skips it.

import { useEffect, useRef, useState } from "react";
import { DUDE, DudeEyes } from "./Spiral";

const SEEN_KEY = "pinkmane-entered"; // remembered for this tab only (sessionStorage)
const BG = "/bg/mode5.jpg"; // the glitch art behind him
const SHOW_EVERY_TIME = false; // true = show it on every page load (handy for testing)

type Props = {
  onEnter: () => void;
  font: string;
};

export default function EntranceScreen({ onEnter, font }: Props) {
  // show = waiting for the click, leaving = fading out, gone = not there
  const [state, setState] = useState<"show" | "leaving" | "gone">("show");
  const enterRef = useRef(onEnter);
  enterRef.current = onEnter;

  useEffect(() => {
    let seen = false;
    try {
      seen = !SHOW_EVERY_TIME && sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen) {
      setState("gone");
      enterRef.current();
    }
  }, []);

  const enter = () => {
    if (state !== "show") return;
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch {}
    setState("leaving");
    enterRef.current();
    setTimeout(() => setState("gone"), 750);
  };

  // Enter or Space also go in (the page's own key listener starts the music on the same key press)
  useEffect(() => {
    if (state !== "show") return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") enter();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });

  if (state === "gone") return null;

  return (
    <div
      className={`pm-enter ${state === "leaving" ? "pm-enter-out" : ""}`}
      onClick={enter}
      role="button"
      tabIndex={0}
      aria-label="Click to enter"
      style={{ fontFamily: font }}
    >
      {/* when you already went in this visit, hide it before it can flash up (runs before React starts) */}
      <script
        dangerouslySetInnerHTML={{
          __html: SHOW_EVERY_TIME
            ? ""
            : `try{if(sessionStorage.getItem("${SEEN_KEY}")==="1")document.documentElement.classList.add("pm-entered")}catch(e){}`,
        }}
      />
      <div className="pm-enter-bg" />
      <div className="pm-enter-shade" />
      <div className="pm-enter-mid">
        <div className="pm-enter-dude">
          <img src={DUDE.src} alt="PINKMANE" draggable={false} />
          <DudeEyes speed={state === "leaving" ? 0.25 : 1.3} />
          {/* smoke from the joint */}
          <span className="pm-puff p1" />
          <span className="pm-puff p2" />
          <span className="pm-puff p3" />
        </div>
        <div className="pm-enter-title">PINKMANE</div>
        <div className="pm-enter-click">
          <span className="pm-mouse">CLICK TO ENTER</span>
          <span className="pm-touch">TAP TO ENTER</span>
        </div>
        <div className="pm-enter-sound">SOUND ON</div>
      </div>

      <style>{`
        html.pm-entered .pm-enter {
          display: none;
        }
        .pm-enter {
          position: fixed;
          inset: 0;
          z-index: 2147483600;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          cursor: pointer;
          background: #12021a;
          color: #fff;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .pm-enter:focus {
          outline: none;
        }
        .pm-enter-out {
          opacity: 0;
          transform: scale(1.12);
          pointer-events: none;
        }
        .pm-enter-bg {
          position: absolute;
          inset: -6%;
          background: url("${BG}") center 40% / cover no-repeat;
          image-rendering: pixelated;
          animation: pm-enter-breathe 9s ease-in-out infinite, pm-enter-hue 14s linear infinite;
        }
        .pm-enter-shade {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(10, 0, 16, 0.15) 0%, rgba(10, 0, 16, 0.55) 55%, rgba(10, 0, 16, 0.9) 100%);
        }
        .pm-enter-mid {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(10px, 2vh, 18px);
        }
        .pm-enter-dude {
          position: relative;
          height: min(52vh, 520px);
          aspect-ratio: ${DUDE.w} / ${DUDE.h};
          animation: pm-enter-bob 2.4s ease-in-out infinite;
          filter: drop-shadow(0 0 18px rgba(255, 59, 208, 0.55));
        }
        .pm-enter-dude img {
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .pm-puff {
          position: absolute;
          left: ${(DUDE.tip.x / DUDE.w) * 100}%;
          top: ${(DUDE.tip.y / DUDE.h) * 100}%;
          width: 14%;
          aspect-ratio: 1;
          margin: -7% 0 0 -7%;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(235, 230, 245, 0.75) 0%, rgba(235, 230, 245, 0) 70%);
          opacity: 0;
          animation: pm-puff 3s ease-out infinite;
        }
        .pm-puff.p2 {
          animation-delay: 1s;
        }
        .pm-puff.p3 {
          animation-delay: 2s;
        }
        .pm-enter-title {
          font-size: clamp(22px, 4.2vw, 46px);
          color: #ff3bd0;
          text-shadow: 3px 3px 0 #000, -1px -1px 0 #000, 0 0 18px rgba(255, 59, 208, 0.7);
          letter-spacing: 2px;
        }
        .pm-enter-click {
          font-size: clamp(13px, 2vw, 22px);
          color: #ffffff;
          text-shadow: 3px 3px 0 #d63cc8, 5px 5px 0 #000;
          animation: pm-enter-blink 1.1s steps(1) infinite;
        }
        .pm-touch {
          display: none;
        }
        @media (hover: none) {
          .pm-touch {
            display: inline;
          }
          .pm-mouse {
            display: none;
          }
        }
        .pm-enter-sound {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.75);
          text-shadow: 2px 2px 0 #000;
        }
        @keyframes pm-enter-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }
        @keyframes pm-enter-hue {
          to {
            filter: hue-rotate(360deg);
          }
        }
        @keyframes pm-enter-bob {
          0%,
          100% {
            transform: translateY(0) rotate(-1.5deg);
          }
          50% {
            transform: translateY(-10px) rotate(1.5deg);
          }
        }
        @keyframes pm-enter-blink {
          0%,
          70% {
            opacity: 1;
          }
          71%,
          100% {
            opacity: 0.25;
          }
        }
        @keyframes pm-puff {
          0% {
            opacity: 0;
            transform: translate(0, 0) scale(0.4);
          }
          15% {
            opacity: 0.9;
          }
          100% {
            opacity: 0;
            transform: translate(-18%, -260%) scale(2.2);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .pm-enter-bg,
          .pm-enter-dude,
          .pm-puff {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
