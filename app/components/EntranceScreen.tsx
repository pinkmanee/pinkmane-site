"use client";

// CLICK TO ENTER: the first thing you see. Your trippy PINKMANE picture in the middle of the screen
// (the whole picture, nothing cut off, nothing moving on it).
// Clicking (or tapping, or Enter / Space) goes in, and that same click starts the music.
// It shows every time the page opens (so the music always starts with that first click).

import { useEffect, useRef, useState } from "react";

const SEEN_KEY = "pinkmane-entered"; // remembered for this tab only (sessionStorage)
const ART = "/bg/mode4.jpg"; // your trippy PINKMANE picture
// false = it shows every time the page opens.
// true = only the first time in each tab (when you reload, it just fades away quickly)
const ONCE_PER_TAB = false;

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
    if (!ONCE_PER_TAB) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {}
    if (seen) {
      setState("leaving");
      enterRef.current();
      setTimeout(() => setState("gone"), 750);
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
      {/* the same picture, blurred, filling the rest of the screen */}
      <div className="pm-enter-bg" />
      <div className="pm-enter-art">
        <img src={ART} alt="PINKMANE" draggable={false} />
        <div className="pm-enter-words">
          <div className="pm-enter-click">
            <span className="pm-mouse">CLICK TO ENTER</span>
            <span className="pm-touch">TAP TO ENTER</span>
          </div>
          <div className="pm-enter-sound">SOUND ON</div>
        </div>
      </div>

      <style>{`
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
          transform: scale(1.08);
          pointer-events: none;
        }
        .pm-enter-bg {
          position: absolute;
          inset: -8%;
          background: url("${ART}") center / cover no-repeat;
          filter: blur(22px) brightness(0.55);
        }
        .pm-enter-art {
          position: relative;
          width: min(94vh, 96vw);
          aspect-ratio: 1;
          box-shadow: 0 0 60px rgba(0, 0, 0, 0.6);
        }
        .pm-enter-art img {
          display: block;
          width: 100%;
          height: 100%;
          pointer-events: none;
        }
        .pm-enter-words {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 6%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          text-align: center;
        }
        .pm-enter-click {
          font-size: clamp(13px, 2.2vw, 24px);
          color: #ffffff;
          text-shadow: 3px 3px 0 #d63cc8, 5px 5px 0 #000, 0 0 12px rgba(0, 0, 0, 0.9);
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
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 2px 2px 0 #000, 0 0 8px #000;
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
        @media (prefers-reduced-motion: reduce) {
          .pm-enter-click {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
