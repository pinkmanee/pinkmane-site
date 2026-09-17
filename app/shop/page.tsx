"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

const ArrowIcon = ({ direction }: { direction: "up" | "down" | "left" | "right" }) => {
  const rotation = { up: 0, right: 90, down: 180, left: 270 }[direction];
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 20 20"
      fill="currentColor"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <path d="M10 2 L18 16 L2 16 Z" />
    </svg>
  );
};

const SpeakerIcon = ({ muted }: { muted: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
    <path d="M4 9v6h4l5 5V4L8 9H4z" fill="currentColor" />
    {muted ? (
      <path
        d="M16 9l5 6M21 9l-5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    ) : (
      <path
        d="M16.5 8.5a5 5 0 010 7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    )}
  </svg>
);

const SegmentedBar = ({
  duration,
  active,
}: {
  duration: number;
  active: boolean;
}) => {
  const segmentCount = 10;
  const [filled, setFilled] = useState(0);

  useEffect(() => {
    if (!active) return;
    setFilled(0);
    const stepTime = (duration * 1000) / segmentCount;
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      setFilled(count);
      if (count >= segmentCount) clearInterval(interval);
    }, stepTime);
    return () => clearInterval(interval);
  }, [duration, active]);

  return (
    <div className="segmented-bar">
      {Array.from({ length: segmentCount }).map((_, i) => (
        <span
          key={i}
          className={`segment ${i < filled ? "segment-filled" : ""}`}
        />
      ))}
    </div>
  );
};

type MenuKey = "main" | "clothes";

export default function Shop() {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuKey>("main");
  const [selected, setSelected] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [showBoot, setShowBoot] = useState(true);
  const [bootFadeOut, setBootFadeOut] = useState(false);
  const [exiting, setExiting] = useState(false);

  const songRef = useRef<HTMLAudioElement | null>(null);
  const scrollSoundRef = useRef<HTMLAudioElement | null>(null);
  const selectSoundRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedSong = useRef(false);

  const menus: Record<MenuKey, string[]> = {
    main: ["Merch", "Plugins", "Serum Banks", "iPods", "Home"],
    clothes: ["Hats", "Hoodies", "Shirts", "Jeans", "Back"],
  };

  const items = menus[menu];


  const playScrollSound = () => {
    if (scrollSoundRef.current) {
      scrollSoundRef.current.currentTime = 0;
      scrollSoundRef.current.play().catch(() => {});
    }
  };

  const playSelectSound = () => {
    if (selectSoundRef.current) {
      selectSoundRef.current.currentTime = 0;
      selectSoundRef.current.play().catch(() => {});
    }
  };

  const goUp = () => {
    playScrollSound();
    setSelected((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goDown = () => {
    playScrollSound();
    setSelected((prev) => (prev + 1) % items.length);
  };

  const goBack = () => {
    playSelectSound();
    if (activeCategory) {
      setActiveCategory(null);
      return;
    }
    if (menu === "clothes") {
      setMenu("main");
      setSelected(0);
      return;
    }
    // On main menu, Back exits to the iPod home page
    setExiting(true);
    setTimeout(() => {
      router.push("/");
    }, 3000);
  };

  const selectItem = () => {
    if (activeCategory) return; // already on a placeholder screen
    playSelectSound();
    const item = items[selected];

    if (menu === "main") {
      if (item === "Clothes / Merch") {
        setMenu("clothes");
        setSelected(0);
        return;
      }
      if (item === "Home") {
        setExiting(true);
        setTimeout(() => router.push("/"), 3000);
        return;
      }
      // Plugins / Serum Banks / iPods — no products yet
      setActiveCategory(item);
      return;
    }

    if (menu === "clothes") {
      if (item === "Back") {
        setMenu("main");
        setSelected(0);
        return;
      }
      setActiveCategory(item);
    }
  };

  const toggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (songRef.current) {
        songRef.current.muted = next;
      }
      return next;
    });
  };

  useEffect(() => {
    const fadeTimer = setTimeout(() => setBootFadeOut(true), 1500);
    const removeTimer = setTimeout(() => setShowBoot(false), 1900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") goUp();
      if (e.key === "ArrowDown") goDown();
      if (e.key === "ArrowRight" || e.key === "Enter") selectItem();
      if (e.key === "ArrowLeft" || e.key === "Backspace") goBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  useEffect(() => {
    songRef.current = new Audio("/sounds/shop-song.mp3");
    songRef.current.loop = true;
    songRef.current.volume = 0.5;

    scrollSoundRef.current = new Audio("/sounds/scroll.mp3");
    selectSoundRef.current = new Audio("/sounds/select.mp3");

    const tryStartSong = () => {
      if (hasStartedSong.current || !songRef.current) return;
      songRef.current
        .play()
        .then(() => {
          hasStartedSong.current = true;
        })
        .catch(() => {});
    };

    tryStartSong();

    const handleFirstInteraction = () => {
      tryStartSong();
      if (hasStartedSong.current) {
        window.removeEventListener("click", handleFirstInteraction);
        window.removeEventListener("keydown", handleFirstInteraction);
        window.removeEventListener("touchstart", handleFirstInteraction);
      }
    };

    window.addEventListener("click", handleFirstInteraction);
    window.addEventListener("keydown", handleFirstInteraction);
    window.addEventListener("touchstart", handleFirstInteraction);

    return () => {
      window.removeEventListener("click", handleFirstInteraction);
      window.removeEventListener("keydown", handleFirstInteraction);
      window.removeEventListener("touchstart", handleFirstInteraction);
      songRef.current?.pause();
    };
  }, []);

  return (
    <main
      style={{
        backgroundImage: "url('/shop-bg.png')",
        backgroundSize: "cover",
        backgroundPosition: "center 70",
        backgroundRepeat: "no-repeat",
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        padding: "20px",
        boxSizing: "border-box",
      }}
    >
      <div
        className={`psp-shell ${exiting ? "psp-exit" : ""}`}
        style={{
          background: "#26262a",
          width: "min(560px, 100%)",
          borderRadius: "20px",
          padding: "clamp(18px, 5vw, 34px)",
          position: "relative",
          boxSizing: "border-box",
          border: "1px solid #3a3a40",
        }}
      >
        <button
          onClick={toggleMute}
          aria-label={isMuted ? "Unmute music" : "Mute music"}
          className="psp-mute-btn"
        >
          <SpeakerIcon muted={isMuted} />
        </button>

        <div
          className={pixelFont.className}
          style={{
            background: "#0d0d10",
            aspectRatio: "560 / 340",
            borderRadius: "8px",
            overflow: "hidden",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            position: "relative",
            border: "2px solid #3a3a40",
          }}
        >
          {(showBoot || exiting) && (
            <div
              className={`screen-overlay ${
                bootFadeOut && !exiting ? "screen-overlay-fade" : ""
              }`}
            >
              <div className="screen-overlay-label">
                {exiting ? "POWERING OFF" : "PINKMANE SHOP"}
              </div>
              <div className="screen-overlay-loading">LOADING...</div>
              <SegmentedBar
                duration={exiting ? 3 : 1.4}
                active={exiting || showBoot}
              />
            </div>
          )}

          <div className="psp-header">
            <h2 className="psp-title">
              {activeCategory
                ? activeCategory.toUpperCase()
                : menu === "main"
                ? "SHOP"
                : "CLOTHES"}
            </h2>
          </div>

          {activeCategory ? (
            <div className="psp-placeholder">
              <div className="psp-placeholder-text">COMING SOON</div>
              <div className="psp-placeholder-sub">
                {activeCategory} drop pending
              </div>
            </div>
          ) : (
            <div className="psp-list">
              {items.map((item, index) => (
                <div
                  key={item}
                  className={`psp-item ${
                    selected === index ? "psp-item-active" : ""
                  }`}
                >
                  {selected === index ? "> " : ""}
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="psp-controls">
          <div className="psp-dpad">
            <button
              className="psp-dpad-btn psp-dpad-up"
              onClick={goUp}
              aria-label="Up"
            >
              <ArrowIcon direction="up" />
            </button>
            <button
              className="psp-dpad-btn psp-dpad-left"
              onClick={goBack}
              aria-label="Back"
            >
              <ArrowIcon direction="left" />
            </button>
            <div className="psp-dpad-center" />
            <button
              className="psp-dpad-btn psp-dpad-right"
              onClick={selectItem}
              aria-label="Select"
            >
              <ArrowIcon direction="right" />
            </button>
            <button
              className="psp-dpad-btn psp-dpad-down"
              onClick={goDown}
              aria-label="Down"
            >
              <ArrowIcon direction="down" />
            </button>
          </div>

          <div className="psp-face-buttons">
            <button
              className={`${pixelFont.className} psp-face-btn psp-btn-x`}
              onClick={selectItem}
            >
              X
            </button>
            <button
              className={`${pixelFont.className} psp-face-btn psp-btn-o`}
              onClick={goBack}
            >
              O
            </button>
          </div>
        </div>

        <div className={`${pixelFont.className} psp-hint`}>
          <span className="hint-touch">use the D-pad or X / O</span>
          <span className="hint-keys">
            ↑↓ scroll · → / enter select · ← / backspace back
          </span>
        </div>
      </div>

      <style jsx global>{`
        .psp-shell {
          transition: transform 0.4s ease, opacity 0.4s ease, filter 0.4s ease;
        }

        .psp-exit {
          transform: scale(0.85);
          opacity: 0;
          filter: brightness(0.3);
        }

        .psp-mute-btn {
          position: absolute;
          top: 14px;
          right: 18px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.3);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          z-index: 2;
        }

        .psp-header {
          padding: clamp(12px, 3.5vw, 18px) clamp(14px, 4vw, 20px) 6px;
          flex-shrink: 0;
        }

        .psp-title {
          margin: 0;
          text-align: center;
          font-size: clamp(12px, 3.6vw, 16px);
          color: #ff5fae;
          letter-spacing: 1px;
        }

        .psp-list {
          padding: clamp(10px, 3vw, 16px) clamp(14px, 4vw, 20px);
          flex: 1;
          overflow: hidden;
        }

        .psp-item {
          padding: 9px 10px;
          font-size: clamp(10px, 3vw, 13px);
          line-height: 1.7;
          color: #cfcfd4;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .psp-item:last-child {
          border-bottom: none;
        }

        .psp-item-active {
          background: #ff5fae;
          color: #0d0d10;
          border-radius: 3px;
        }

        .psp-placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 20px;
          text-align: center;
        }

        .psp-placeholder-text {
          color: #ff5fae;
          font-size: clamp(12px, 3.6vw, 18px);
          letter-spacing: 1px;
        }

        .psp-placeholder-sub {
          color: #8a8a90;
          font-size: clamp(8px, 2.6vw, 11px);
        }

        .screen-overlay {
          position: absolute;
          inset: 0;
          z-index: 20;
          background: #000;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 16px;
          box-sizing: border-box;
          transition: opacity 0.4s ease;
          opacity: 1;
        }

        .screen-overlay-fade {
          opacity: 0;
          pointer-events: none;
        }

        .screen-overlay-label {
          color: #ff5fae;
          font-size: clamp(9px, 3vw, 13px);
          letter-spacing: 1.5px;
          text-align: center;
          animation: bootPulse 1s ease-in-out infinite;
        }

        .screen-overlay-loading {
          color: #cfcfd4;
          font-size: clamp(7px, 2.4vw, 11px);
          letter-spacing: 1px;
        }

        @keyframes bootPulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }

        .segmented-bar {
          display: flex;
          gap: 3px;
          padding: 4px;
          border: 2px solid #ff5fae;
          border-radius: 2px;
        }

        .segment {
          width: clamp(9px, 2.4vw, 14px);
          height: clamp(12px, 3.2vw, 18px);
          background: #222;
        }

        .segment-filled {
          background: #ff5fae;
        }

        /* Controls layout: D-pad on the left, X/O face buttons on the right */
        .psp-controls {
          margin-top: 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 clamp(4px, 3vw, 16px);
        }

        .psp-dpad {
          position: relative;
          width: clamp(96px, 24vw, 130px);
          height: clamp(96px, 24vw, 130px);
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-template-rows: 1fr 1fr 1fr;
        }

        .psp-dpad-btn {
          border: none;
          background: #3a3a40;
          color: #cfcfd4;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .psp-dpad-btn:active {
          background: #ff5fae;
          color: #0d0d10;
        }

        .psp-dpad-up {
          grid-column: 2;
          grid-row: 1;
          border-radius: 4px 4px 0 0;
        }
        .psp-dpad-left {
          grid-column: 1;
          grid-row: 2;
          border-radius: 4px 0 0 4px;
        }
        .psp-dpad-center {
          grid-column: 2;
          grid-row: 2;
          background: #26262a;
        }
        .psp-dpad-right {
          grid-column: 3;
          grid-row: 2;
          border-radius: 0 4px 4px 0;
        }
        .psp-dpad-down {
          grid-column: 2;
          grid-row: 3;
          border-radius: 0 0 4px 4px;
        }

        .psp-face-buttons {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .psp-face-btn {
          width: clamp(38px, 9vw, 48px);
          height: clamp(38px, 9vw, 48px);
          border-radius: 50%;
          border: none;
          cursor: pointer;
          font-size: clamp(11px, 3vw, 14px);
        }

        .psp-btn-x {
          background: #3a3a40;
          color: #7ec8ff;
        }

        .psp-btn-o {
          background: #3a3a40;
          color: #ff5fae;
        }

        .psp-btn-x:active,
        .psp-btn-o:active {
          filter: brightness(1.3);
        }

        .psp-hint {
          margin-top: 16px;
          text-align: center;
          font-size: 8px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.25);
        }

        .hint-touch {
          display: inline;
        }

        .hint-keys {
          display: none;
        }

        @media (hover: hover) and (pointer: fine) {
          .hint-touch {
            display: none;
          }
          .hint-keys {
            display: inline;
          }
        }
      `}</style>
    </main>
  );
}