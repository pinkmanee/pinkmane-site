"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

const GLYPH_IMAGES = ["/glyphs/heart.gif", "/glyphs/sparkle.gif"];

const ITEM_ICONS: Record<string, string> = {
  Music: "/icons/music.gif",
  Socials: "/icons/socials.gif",
  Merch: "/icons/merch.gif",
  Releases: "/icons/releases.gif",
  SoundCloud: "/icons/soundcloud.gif",
  Spotify: "/icons/spotify.gif",
  "Apple Music": "/icons/apple-music.gif",
  Instagram: "/icons/instagram.gif",
  Twitch: "/icons/twitch.gif",
  TOPSHELF: "/icons/topshelf.gif",
  Back: "/icons/arrow.gif",
};

// Sync visual effects to your track's tempo
const BPM = 140;
const BEAT_SECONDS = 60 / BPM; // ~0.429s per beat

const TICKER_TEXT = "NOW PLAYING: PINKMANE'S RANDOM ASS BEAT ✦   ";

// SEO: official profile links, readable by search engines
const ARTIST_LINKS = [
  { label: "PINKMANE on Spotify", url: "https://open.spotify.com/artist/1fH0OQSGa851zXYDKeWvnb" },
  { label: "PINKMANE on Apple Music", url: "https://music.apple.com/us/artist/pinkmane/1879203655" },
  { label: "PINKMANE on SoundCloud", url: "https://soundcloud.com/pinkmanee" },
  { label: "PINKMANE on Bandcamp", url: "https://pinkmane.bandcamp.com/" },
  { label: "PINKMANE on Instagram", url: "https://www.instagram.com/pinkmanee/" },
  { label: "PINKMANE on Twitch", url: "https://www.twitch.tv/pinkmanee" },
];

// SEO: tells Google this site belongs to the music artist PINKMANE
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "MusicGroup",
  name: "PINKMANE",
  url: "https://pinkmane.site",
  genre: ["Cloud rap", "Trap"],
  description:
    "PINKMANE is a cloud rap and trap artist. Music on Spotify, Apple Music, SoundCloud and Bandcamp.",
  sameAs: ARTIST_LINKS.map((link) => link.url),
};

type Glyph = {
  id: number;
  src: string;
  left: number;
  duration: number;
  delay: number;
  size: number;
  wobble: number;
};

const ArrowIcon = ({ direction }: { direction: "left" | "right" }) => (
  <svg width="18" height="22" viewBox="0 0 20 24" fill="currentColor">
    <path
      d={
        direction === "left" ? "M20 0 L0 12 L20 24 Z" : "M0 0 L20 12 L0 24 Z"
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

const BatteryIcon = () => (
  <svg width="20" height="12" viewBox="0 0 22 12" fill="none">
    <rect
      x="0.5"
      y="0.5"
      width="18"
      height="11"
      rx="1.5"
      stroke="currentColor"
      strokeWidth="1"
    />
    <rect x="19.5" y="3.5" width="2" height="5" rx="0.5" fill="currentColor" />
    <rect x="2" y="2" width="15" height="8" fill="currentColor" />
  </svg>
);

// Small dancing bars next to the mute button, pulsing on the beat
const VuBars = ({ active }: { active: boolean }) => (
  <div className="vu-bars">
    {[0, 1, 2, 3].map((i) => (
      <span
        key={i}
        className={`vu-bar vu-bar-${i} ${active ? "vu-active" : ""}`}
      />
    ))}
  </div>
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

function getAngleFromCenter(clientX: number, clientY: number, rect: DOMRect) {
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const dx = clientX - centerX;
  const dy = clientY - centerY;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function normalizeAngleDelta(delta: number) {
  let d = delta;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

export default function Home() {
  const router = useRouter();
  const [menu, setMenu] = useState("main");
  const [selected, setSelected] = useState(0);
  const [glyphs, setGlyphs] = useState<Glyph[]>([]);
  const [isMuted, setIsMuted] = useState(false);

  const [showBoot, setShowBoot] = useState(true);
  const [bootFadeOut, setBootFadeOut] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Glitch flicker on menu change
  const [glitch, setGlitch] = useState(false);
  const isFirstRender = useRef(true);

  const songRef = useRef<HTMLAudioElement | null>(null);
  const scrollSoundRef = useRef<HTMLAudioElement | null>(null);
  const selectSoundRef = useRef<HTMLAudioElement | null>(null);
  const hasStartedSong = useRef(false);

  const wheelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastAngle = useRef<number | null>(null);
  const rotationAccum = useRef(0);

  const menus = {
    main: ["Music", "Socials", "Merch", "Releases"],
    music: ["SoundCloud", "Spotify", "Apple Music", "Bandcamp", "Back"],
    socials: ["Instagram", "Twitch", "Back"],
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

  const navigateToShop = () => {
    playSelectSound();
    setExiting(true);
    setTimeout(() => {
      router.push("/shop");
    }, 3000);
  };

  const selectItem = () => {
    const item = items[selected];

    if (menu === "main" && item === "Merch") {
      navigateToShop();
      return;
    }

    playSelectSound();

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
      if (item === "Bandcamp") {
        window.open("https://pinkmane.bandcamp.com/", "_blank");
      }
      if (item === "Back") goBack();
    }

    if (menu === "socials") {
      if (item === "Instagram") {
        window.open("https://www.instagram.com/pinkmanee/", "_blank");
      }
      if (item === "Twitch") {
        window.open("https://www.twitch.tv/pinkmanee", "_blank");
      }
      if (item === "Back") goBack();
    }

    if (menu === "releases") {
      if (item === "Back") goBack();
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

  // Boot animation timing
  useEffect(() => {
    const fadeTimer = setTimeout(() => setBootFadeOut(true), 1500);
    const removeTimer = setTimeout(() => setShowBoot(false), 1900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // Glitch flicker whenever the menu screen changes
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setGlitch(true);
    const t = setTimeout(() => setGlitch(false), 120);
    return () => clearTimeout(t);
  }, [menu]);

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

  useEffect(() => {
    const generated: Glyph[] = Array.from({ length: 14 }).map((_, i) => ({
      id: i,
      src: GLYPH_IMAGES[Math.floor(Math.random() * GLYPH_IMAGES.length)],
      left: Math.random() * 100,
      duration: 10 + Math.random() * 12,
      delay: Math.random() * 12,
      size: 26 + Math.random() * 28,
      wobble: 15 + Math.random() * 35,
    }));
    setGlyphs(generated);
  }, []);

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

  const handleWheelPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!wheelRef.current) return;
    isDragging.current = true;
    rotationAccum.current = 0;
    const rect = wheelRef.current.getBoundingClientRect();
    lastAngle.current = getAngleFromCenter(e.clientX, e.clientY, rect);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleWheelPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current || !wheelRef.current || lastAngle.current === null)
      return;

    const rect = wheelRef.current.getBoundingClientRect();
    const angle = getAngleFromCenter(e.clientX, e.clientY, rect);
    const delta = normalizeAngleDelta(angle - lastAngle.current);
    lastAngle.current = angle;
    rotationAccum.current += delta;

    const STEP = 26;

    while (rotationAccum.current > STEP) {
      goDown();
      rotationAccum.current -= STEP;
    }
    while (rotationAccum.current < -STEP) {
      goUp();
      rotationAccum.current += STEP;
    }
  };

  const handleWheelPointerUp = () => {
    isDragging.current = false;
    lastAngle.current = null;
    rotationAccum.current = 0;
  };

  const stopWheelDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  return (
    <main
      style={{
        backgroundImage: "url('/topshelf.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
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
        "--beat": `${BEAT_SECONDS}s`,
      } as React.CSSProperties}
    >
      {/* SEO: "I'm a musician" label for Google (invisible) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      {/* SEO: text and links for search engines and screen readers (visually hidden) */}
      <div className="sr-only">
        <h1>PINKMANE</h1>
        <p>
          PINKMANE is a cloud rap and trap artist. Releases include TOPSHELF.
          Stream PINKMANE on Spotify, Apple Music and SoundCloud, get the music
          on Bandcamp, follow on Instagram and Twitch, and shop official merch.
        </p>
        <nav aria-label="PINKMANE links">
          <ul>
            {ARTIST_LINKS.map((link) => (
              <li key={link.url}>
                <a href={link.url} rel="me">
                  {link.label}
                </a>
              </li>
            ))}
            <li>
              <a href="https://soundcloud.com/pinkmanee/top-shelf">
                TOPSHELF by PINKMANE
              </a>
            </li>
            <li>
              <a href="/shop">PINKMANE merch shop</a>
            </li>
          </ul>
        </nav>
      </div>

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
            style={
              {
                left: `${g.left}%`,
                width: `${g.size}px`,
                height: `${g.size}px`,
                animationDuration: `${g.duration}s`,
                animationDelay: `${g.delay}s`,
                "--wobble": `${g.wobble}px`,
              } as React.CSSProperties
            }
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
        <div className="top-controls">
          <BatteryIcon />
          <VuBars active={!isMuted} />
          <button
            onClick={toggleMute}
            aria-label={isMuted ? "Unmute music" : "Mute music"}
            className="mute-btn"
          >
            <SpeakerIcon muted={isMuted} />
          </button>
        </div>

        <div
          className={pixelFont.className}
          style={{
            background: "#d7efbc",
            aspectRatio: "540 / 420",
            borderRadius: "8px",
            overflow: "hidden",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {/* CRT scanline + vignette overlay */}
          <div className="crt-overlay" />

          {/* Glitch flicker on menu change */}
          {glitch && <div className="glitch-flash" />}

          {(showBoot || exiting) && (
            <div
              className={`screen-overlay ${
                bootFadeOut && !exiting ? "screen-overlay-fade" : ""
              }`}
            >
              <div className="screen-overlay-label">
                {exiting ? "POWERING OFF" : "PINKMANE"}
              </div>
              <div className="screen-overlay-loading">LOADING...</div>
              <SegmentedBar
                duration={exiting ? 3 : 1.4}
                active={exiting || showBoot}
              />
            </div>
          )}

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
              <Image
                src="/topshelf.png"
                alt="TOPSHELF"
                fill
                style={{ objectFit: "contain", zIndex: 1 }}
              />
            </div>
          ) : (
            <div
              style={{
                padding: "clamp(14px, 4vw, 20px)",
                overflow: "hidden",
                flex: 1,
              }}
            >
              {items.map((item, index) => (
                <div
                  key={item}
                  style={{
                    position: "relative",
                    padding: "10px",
                    fontSize: "clamp(11px, 3.2vw, 14px)",
                    lineHeight: "1.6",
                    background: selected === index ? "black" : "transparent",
                    color: selected === index ? "white" : "black",
                    borderBottom:
                      index !== items.length - 1
                        ? selected === index || selected === index + 1
                          ? "1px solid transparent"
                          : "1px solid rgba(0,0,0,0.15)"
                        : "none",
                  }}
                >
                  {selected === index ? "> " : ""}
                  {item}

                  {selected === index && ITEM_ICONS[item] && (
                    <img
                      src={ITEM_ICONS[item]}
                      alt=""
                      style={{
                        position: "absolute",
                        right: "10px",
                        top: "50%",
                        transform: "translateY(-50%)",
                        height: "70%",
                        maxHeight: "28px",
                        width: "auto",
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Now-playing ticker */}
          <div className="ticker-wrap">
            <div className="ticker-track">
              <span>{TICKER_TEXT}</span>
              <span>{TICKER_TEXT}</span>
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: "25px",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            ref={wheelRef}
            className={`click-wheel ${!isMuted ? "wheel-led-pulse" : ""}`}
            onPointerDown={handleWheelPointerDown}
            onPointerMove={handleWheelPointerMove}
            onPointerUp={handleWheelPointerUp}
            onPointerCancel={handleWheelPointerUp}
            style={{
              borderRadius: "50%",
              background: "#efefef",
              border: "8px solid gray",
              position: "relative",
              touchAction: "none",
            }}
          >
            <button
              onClick={goBack}
              onPointerDown={stopWheelDrag}
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
              onPointerDown={stopWheelDrag}
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
              onPointerDown={stopWheelDrag}
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
              onPointerDown={stopWheelDrag}
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
              onPointerDown={stopWheelDrag}
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

        <div className={`${pixelFont.className} controls-hint`}>
          <span className="hint-touch">swipe wheel to scroll</span>
          <span className="hint-keys">
            ↑↓ scroll · enter select · backspace back
          </span>
        </div>
      </div>

      <style jsx global>{`
        html,
        body {
          overflow-x: hidden;
          margin: 0;
        }

        /* SEO: hides content visually but keeps it readable for Google and screen readers */
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        .click-wheel {
          width: clamp(160px, 42vw, 220px);
          height: clamp(160px, 42vw, 220px);
        }

        .floating-glyph {
          position: absolute;
          bottom: -10%;
          filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.4));
          animation-name: floatWobble;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        @keyframes floatWobble {
          0% {
            transform: translate(0, 0) rotate(0deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          25% {
            transform: translate(var(--wobble), -25vh) rotate(8deg);
          }
          50% {
            transform: translate(calc(var(--wobble) * -1), -55vh) rotate(-8deg);
          }
          75% {
            transform: translate(var(--wobble), -85vh) rotate(8deg);
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(0, -115vh) rotate(0deg);
            opacity: 0;
          }
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
          color: #fff;
          font-size: clamp(10px, 3.2vw, 15px);
          letter-spacing: 1.5px;
          text-align: center;
          animation: bootPulse 1s ease-in-out infinite;
        }

        .screen-overlay-loading {
          color: #d7efbc;
          font-size: clamp(8px, 2.6vw, 12px);
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
          border: 2px solid #fff;
          border-radius: 2px;
        }

        .segment {
          width: clamp(10px, 2.6vw, 16px);
          height: clamp(14px, 3.6vw, 20px);
          background: #222;
        }

        .segment-filled {
          background: #d7efbc;
        }

        .controls-hint {
          margin-top: 14px;
          text-align: center;
          font-size: 8px;
          line-height: 1.6;
          color: rgba(0, 0, 0, 0.28);
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

        /* Top controls row: battery, VU bars, mute */
        .top-controls {
          position: absolute;
          top: 14px;
          right: 18px;
          display: flex;
          align-items: center;
          gap: 8px;
          color: rgba(0, 0, 0, 0.28);
          z-index: 2;
        }

        .mute-btn {
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 2px;
          display: flex;
          align-items: center;
        }

        /* VU meter bars, pulsing on the beat */
        .vu-bars {
          display: flex;
          align-items: flex-end;
          gap: 2px;
          height: 12px;
        }

        .vu-bar {
          width: 2.5px;
          height: 3px;
          background: currentColor;
          border-radius: 1px;
        }

        .vu-active.vu-bar-0 {
          animation: vuPulse var(--beat) ease-in-out infinite;
        }
        .vu-active.vu-bar-1 {
          animation: vuPulse var(--beat) ease-in-out infinite;
          animation-delay: calc(var(--beat) * 0.15);
        }
        .vu-active.vu-bar-2 {
          animation: vuPulse var(--beat) ease-in-out infinite;
          animation-delay: calc(var(--beat) * 0.3);
        }
        .vu-active.vu-bar-3 {
          animation: vuPulse var(--beat) ease-in-out infinite;
          animation-delay: calc(var(--beat) * 0.08);
        }

        @keyframes vuPulse {
          0%,
          100% {
            height: 3px;
          }
          50% {
            height: 12px;
          }
        }

        /* CRT scanlines + vignette */
        .crt-overlay {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 5;
          background-image: repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.06) 0px,
            rgba(0, 0, 0, 0.06) 1px,
            transparent 1px,
            transparent 3px
          );
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.25);
        }

        /* Glitch flicker on menu transition */
        .glitch-flash {
          position: absolute;
          inset: 0;
          z-index: 15;
          pointer-events: none;
          background: rgba(255, 255, 255, 0.5);
          mix-blend-mode: overlay;
          animation: glitchFlicker 0.12s steps(2) forwards;
        }

        @keyframes glitchFlicker {
          0% {
            opacity: 1;
            transform: translateX(0);
          }
          40% {
            opacity: 0.6;
            transform: translateX(-2px);
          }
          70% {
            opacity: 0.3;
            transform: translateX(2px);
          }
          100% {
            opacity: 0;
            transform: translateX(0);
          }
        }

        /* Now-playing ticker */
        .ticker-wrap {
          overflow: hidden;
          white-space: nowrap;
          background: rgba(0, 0, 0, 0.06);
          border-top: 1px solid rgba(0, 0, 0, 0.15);
          padding: 4px 0;
          flex-shrink: 0;
        }

        .ticker-track {
          display: inline-flex;
          animation: tickerScroll 10s linear infinite;
        }

        .ticker-track span {
          font-size: 7.5px;
          letter-spacing: 0.5px;
          padding-right: 20px;
        }

        @keyframes tickerScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }

        /* Click wheel LED pulse, synced to the beat */
        .wheel-led-pulse {
          animation: wheelGlow var(--beat) ease-in-out infinite;
        }

        @keyframes wheelGlow {
          0%,
          100% {
            box-shadow: 0 0 0px rgba(215, 239, 188, 0);
          }
          50% {
            box-shadow: 0 0 14px 4px rgba(215, 239, 188, 0.55);
          }
        }
      `}</style>
    </main>
  );
}
