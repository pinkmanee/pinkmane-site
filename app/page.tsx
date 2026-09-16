"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

const GLYPH_IMAGES = [
  "/glyphs/heart.gif",
  "/glyphs/sparkle.gif",
];

type Glyph = {
  id: number;
  src: string;
  left: number;
  duration: number;
  delay: number;
  size: number;
};

const ArrowIcon = ({ direction }: { direction: "left" | "right" }) => (
  <svg width="18" height="22" viewBox="0 0 20 24" fill="currentColor">
    <path
      d={
        direction === "left"
          ? "M20 0 L0 12 L20 24 Z"
          : "M0 0 L20 12 L0 24 Z"
      }
    />
  </svg>
);

const PauseIcon = () => (
  <svg width="16" height="18" viewBox="0 0 18 20" fill="currentColor">
    <rect x="0" y="0" width="6" height="20" />
    <rect x="12" y="0" width="6" height="20" />
  </svg>
);

export default function Home() {
  const [menu, setMenu] = useState("main");
  const [selected, setSelected] = useState(0);
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);

  const songRef = useRef<HTMLAudioElement | null>(null);
  const scrollSoundRef = useRef<HTMLAudioElement | null>(null);
  const selectSoundRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedSong = useRef(false);

  const menus = {
    main: ["Music", "Socials", "Twitch", "Releases"],
    music: ["SoundCloud", "Spotify", "Apple Music", "Back"],
    socials: ["Instagram", "Back"],
    releases: ["TOPSHELF", "Back"],
  };

  const items = menus[menu as keyof typeof menus];

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
    setMenu("main");
    setSelected(0);
  };

  const selectItem = () => {
    playSelectSound();
    const item = items[selected];

    if (menu === "main") {
      if (item === "Music") {
        setMenu("music");
        setSelected(0);
      }

      if (item === "Socials") {
        setMenu("socials");
        setSelected(0);
      }

      if (item === "Releases") {
        setMenu("releases");
        setSelected(0);
      }

      if (item === "Twitch") {
        window.open("https://www.twitch.tv/pinkmanee", "_blank");
      }
    }

    if (menu === "music") {
      if (item === "Spotify") {
        window.open(
          "https://open.spotify.com/artist/1fH0OQSGa851zXYDKeWvnb?si=Q4FugsHUSbup63vp4j0XEA",
          "_blank"
        );
      }

      if (item === "SoundCloud") {
        window.open("https://soundcloud.com/pinkmanee", "_blank");
      }

      if (item === "Apple Music") {
        window.open(
          "https://music.apple.com/us/artist/pinkmane/1879203655",
          "_blank"
        );
      }

      if (item === "Back") {
        goBack();
      }
    }

    if (menu === "socials") {
      if (item === "Instagram") {
        window.open("https://www.instagram.com/pinkmanee/", "_blank");
      }

      if (item === "Back") {
        goBack();
      }
    }

    if (menu === "releases") {
      if (item === "Back") {
        goBack();
      }
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") goUp();
      if (e.key === "ArrowDown") goDown();
      if (e.key === "Enter") selectItem();
      if (e.key === "Backspace") goBack();
    };

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY > 0) goDown();
      if (e.deltaY < 0) goUp();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("wheel", handleWheel);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("wheel", handleWheel);
    };
  });

  // Generate floating glyph images client-side only (avoids SSR/client mismatch)
  useEffect(() => {
    const generated: Glyph[] = Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      src: GLYPH_IMAGES[Math.floor(Math.random() * GLYPH_IMAGES.length)],
      left: Math.random() * 100,
      duration: 10 + Math.random() * 12,
      delay: Math.random() * 12,
      size: 26 + Math.random() * 28,
    }));
    setGlyphs(generated);
  }, []);

  // Set up audio elements
  useEffect(() => {
    songRef.current = new Audio("/sounds/song.mp3");
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
        .catch(() => {
          // Autoplay blocked — will retry on first user interaction
        });
    };

    // Attempt autoplay immediately
    tryStartSong();

    // Fallback: start on the very first user interaction if autoplay was blocked
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
        backgroundImage: "url('/topshelf.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        minHeight: "100vh",
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
      {/* Floating glyphs layer */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        {glyphs.map((g) => (
          <img
            key={g.id}
            src={g.src}
            alt=""
            className="floating-glyph"
            style={{
              left: `${g.left}%`,
              width: `${g.size}px`,
              height: `${g.size}px`,
              animationDuration: `${g.duration}s`,
              animationDelay: `${g.delay}s`,
            }}
          />
        ))}
      </div>

      <div
        className="ipod-shell"
        style={{
          background: "#cfcfcf",
          width: "min(540px, 100%)",
          borderRadius: "40px",
          padding: "clamp(18px, 5vw, 40px)",
          position: "relative",
          zIndex: 1,
          boxSizing: "border-box",
        }}
      >
        <div
          className={pixelFont.className}
          style={{
            background: menu === "releases" ? "#d7efbc" : "#d7efbc",
            aspectRatio: "540 / 420",
            borderRadius: "8px",
            overflow: "hidden",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              backgroundImage: "url('/banner.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
              padding: "clamp(14px, 4vw, 20px) 0",
              flexShrink: 0,
            }}
          >
            <h2
              style={{
                textAlign: "center",
                margin: 0,
                fontSize: "clamp(13px, 4vw, 18px)",
                color: "#fff",
                textShadow: "2px 2px 0 rgba(0,0,0,0.6)",
              }}
            >
              {menu === "main" ? "PINKMANE" : menu.toUpperCase()}
            </h2>
          </div>

          {menu === "releases" && selected === 0 ? (
            <div
              onClick={() =>
                window.open(
                  "https://soundcloud.com/pinkmanee/top-shelf",
                  "_blank"
                )
              }
              style={{
                position: "relative",
                flex: 1,
                width: "100%",
                cursor: "pointer",
                overflow: "hidden",
              }}
            >
              {/* Blurred duplicate filling the background */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: "url('/topshelf.png')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  filter: "blur(20px) saturate(1.4) brightness(0.9)",
                  transform: "scale(1.2)",
                }}
              />

              {/* Sharp image on top, fully visible */}
              <Image
                src="/topshelf.png"
                alt="TOPSHELF"
                fill
                style={{
                  objectFit: "contain",
                  zIndex: 1,
                }}
              />
            </div>
          ) : (
            <div
              style={{
                padding: "clamp(14px, 4vw, 20px)",
                overflow: "hidden",
              }}
            >
              {items.map((item, index) => (
                <div
                  key={item}
                  style={{
                    padding: "10px",
                    marginBottom: "8px",
                    fontSize: "clamp(11px, 3.2vw, 14px)",
                    lineHeight: "1.6",
                    background:
                      selected === index ? "black" : "transparent",
                    color: selected === index ? "white" : "black",
                  }}
                >
                  {selected === index ? "> " : ""}
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "25px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            className="click-wheel"
            style={{
              borderRadius: "50%",
              background: "#efefef",
              border: "8px solid gray",
              position: "relative",
            }}
          >
            <button
              onClick={goBack}
              style={{
                position: "absolute",
                top: "18px",
                left: "50%",
                transform: "translateX(-50%)",
                border: "none",
                background: "transparent",
                fontWeight: "bold",
                fontSize: "clamp(12px, 3.5vw, 16px)",
                color: "#333",
                cursor: "pointer",
              }}
            >
              MENU
            </button>

            <button
              onClick={goUp}
              style={{
                position: "absolute",
                left: "22px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#333",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ArrowIcon direction="left" />
            </button>

            <button
              onClick={goDown}
              style={{
                position: "absolute",
                right: "22px",
                top: "50%",
                transform: "translateY(-50%)",
                border: "none",
                background: "transparent",
                color: "#333",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <ArrowIcon direction="right" />
            </button>

            <button
              onClick={goDown}
              style={{
                position: "absolute",
                bottom: "15px",
                left: "50%",
                transform: "translateX(-50%)",
                border: "none",
                background: "transparent",
                color: "#333",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
            >
              <PauseIcon />
            </button>

            <button
              onClick={selectItem}
              style={{
                width: "41%",
                height: "41%",
                borderRadius: "50%",
                border: "none",
                background: "#d8d8d8",
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "clamp(11px, 3vw, 14px)",
              }}
            >
              OK
            </button>
          </div>
        </div>
      </div>

      <style jsx global>{`
        html,
        body {
          overflow-x: hidden;
          margin: 0;
        }

        .click-wheel {
          width: clamp(160px, 42vw, 220px);
          height: clamp(160px, 42vw, 220px);
        }

        .floating-glyph {
          position: absolute;
          bottom: -10%;
          filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.4));
          animation-name: floatUp;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }

        @keyframes floatUp {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translateY(-115vh) rotate(25deg);
            opacity: 0;
          }
        }
      `}</style>
    </main>
  );
}