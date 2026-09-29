"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import JumpGame from "./components/JumpGame";
import VortexGame from "./components/VortexGame";
import SnakeGame from "./components/SnakeGame";
import BirdGame from "./components/BirdGame";
import HexGame from "./components/HexGame";
import MazeGame from "./components/MazeGame";
import SuperGame from "./components/SuperGame";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

const GLYPH_IMAGES = ["/glyphs/heart.gif", "/glyphs/sparkle.gif"];

// PINKMANE flying with a jetpack: made from the same pixels as the game character (pinkdude.png),
// with a jetpack on his back. O / Y are the flame.
// These fly across the background behind the handheld (Super Pinkmane / Pink Maze).
const JET_DUDE = [
  ".............A.....A..........",
  ".......A.....AB...AB..........",
  "........AB...ABB.ABB..A.......",
  "...A.....ABB.ABBABBB.AB.......",
  "....AAB...ABBABBBBBBABA.......",
  "......AABBBABBBBBBBBBA........",
  "....ABBBBBBBBBBBBBBBAA........",
  "......AAAABBBBBBAAAA..........",
  "..........ABBAAAAAAA..........",
  "...........AAFFFFFFFA.........",
  "...........AFFCCCFCCCA........",
  "...........AFCCCACCCACA.......",
  "...........AFCCCACCCACA.......",
  "...........AFFCCCFCCCFA.......",
  "..........AFFFFFFFFFAFFA......",
  "..........AFGFGFFFFAAAA.......",
  "...........AGFGFFAAFHHHHH.H...",
  "........AAA.AAAAAA............",
  ".......ABBBA.AIA..............",
  ".......ABCBAAAAAAA............",
  ".......AAAAAAAAAAAAA..........",
  ".......AABBAAACCAAA.AA........",
  "......AABBBAAAJCJAA..AA.......",
  ".....AAADDDAAAACAAA...AA......",
  ".....A.AEEEAAAAAAAA....A......",
  "........AEA.AAAAAAA...........",
  ".........O.IIKKKKKII..........",
  "........OYIKKLKKKKKKI.........",
  ".........OIKKKKI.IKKKI........",
  ".........IKKLKI...IKKKI.......",
  ".........IKKKKI...IKLKKI......",
  "........IKKKKI.....IKKKKI.....",
  "........IKKKKI.....IKKKKI.....",
  "........AAAAAA.....AAAAAAA....",
  ".......AAAAAAA.....AAAAAAA....",
];
const JET_DUDE_COLORS: Record<string, string> = {
  A: "#111111",
  B: "#d63cc8",
  C: "#ffffff",
  D: "#8a1f86",
  E: "#787882",
  F: "#ffc800",
  G: "#c88c00",
  H: "#c8c8c8",
  I: "#3c3c3c",
  J: "#d21e1e",
  K: "#787878",
  L: "#a5a5a5",
  O: "#ff7a00",
  Y: "#ffc800",
};

// Turns the pixel rows into a small animated SVG picture: the flame flickers and smoke rises from the joint
function makeJetDudeImage() {
  const body: string[] = [];
  const flame: string[] = [];
  JET_DUDE.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      const color = JET_DUDE_COLORS[ch];
      if (color) {
        const rect = `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${color}"/>`;
        if (ch === "O" || ch === "Y") flame.push(rect);
        else body.push(rect);
      }
      x = end;
    }
  });
  const puffs = [0, 0.7, 1.4]
    .map(
      (delay) =>
        `<rect x="26" y="14" width="2" height="2" fill="#e8e0ee" opacity="0">` +
        `<animate attributeName="y" values="14;4" dur="2.1s" begin="${delay}s" repeatCount="indefinite"/>` +
        `<animate attributeName="x" values="26;27;29" dur="2.1s" begin="${delay}s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0.9;0" dur="2.1s" begin="${delay}s" repeatCount="indefinite"/>` +
        `</rect>`
    )
    .join("");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -2 32 37" width="32" height="37" shape-rendering="crispEdges">` +
    body.join("") +
    `<g>${flame.join("")}<animate attributeName="opacity" values="1;0.35;1" dur="0.2s" repeatCount="indefinite"/></g>` +
    puffs +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
const JET_DUDE_IMAGE = makeJetDudeImage();

const ITEM_ICONS: Record<string, string> = {
  Music: "/icons/music.gif",
  Socials: "/icons/socials.gif",
  Merch: "/icons/merch.gif",
  Releases: "/icons/releases.gif",
  SoundCloud: "/icons/soundcloud.gif",
  Spotify: "/icons/spotify.gif",
  "Apple Music": "/icons/apple-music.gif",
  Bandcamp: "/icons/bandcamp.gif",
  Instagram: "/icons/instagram.gif",
  Twitch: "/icons/twitch.gif",
  TOPSHELF: "/icons/topshelf.gif",
  Extras: "/icons/extras.gif",
  Games: "/icons/games.gif",
  "Pink Run": "/icons/pinkrun.gif",
  "Super Pinkmane": "/icons/superpinkmane.gif",
  "Pink Hexagon": "/icons/pinkhex.gif",
  "Pink Maze": "/icons/pinkmaze.gif",
  "Pink Vortex": "/icons/pinkvortex.gif",
  "Pink Bird": "/icons/pinkbird.gif",
  "Pink Snake": "/icons/pinksnake.gif",
  Back: "/icons/arrow.gif",
};

// Sync visual effects to your track's tempo
const BPM = 140;
const BEAT_SECONDS = 60 / BPM; // ~0.429s per beat

// Your songs. Files go in public/music/ named 01.mp3, 02.mp3 ...
const TRACKS = [
  { title: "pinkmane's random ass beat", file: "/sounds/song.mp3" },
  { title: "wet socks (w/ o1m4de)", file: "/music/06.mp3" },
  { title: "hurricane of blades", file: "/music/07.mp3" },
  { title: "cat piss kenny", file: "/music/10.mp3" },
  { title: "gaf (ft. TOMBFELL)", file: "/music/05.mp3" },
  { title: "snehulienka", file: "/music/03.mp3" },
  { title: "small pretty titties", file: "/music/01.mp3" },
  { title: "vomit trap", file: "/music/08.mp3" },
  { title: "gods psp (ft. TOMBFELL)", file: "/music/09.mp3" },
];

// How many menu rows fit on the screen at once
const VISIBLE_ROWS = 5;

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

const PauseIcon = () => (
  <svg width="16" height="18" viewBox="0 0 18 20" fill="currentColor">
    <rect x="0" y="0" width="6" height="20" />
    <rect x="12" y="0" width="6" height="20" />
  </svg>
);

const PlayIcon = () => (
  <svg width="16" height="18" viewBox="0 0 18 20" fill="currentColor">
    <path d="M2 0 L18 10 L2 20 Z" />
  </svg>
);

const PrevTrackIcon = () => (
  <svg width="24" height="16" viewBox="0 0 24 16" fill="currentColor">
    <rect x="0" y="0" width="3" height="16" />
    <path d="M13 0 L3 8 L13 16 Z" />
    <path d="M24 0 L14 8 L24 16 Z" />
  </svg>
);

const NextTrackIcon = () => (
  <svg width="24" height="16" viewBox="0 0 24 16" fill="currentColor">
    <path d="M0 0 L10 8 L0 16 Z" />
    <path d="M11 0 L21 8 L11 16 Z" />
    <rect x="21" y="0" width="3" height="16" />
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

// PINKMANE written with little pixel bricks (5x7 letters)
const BRICK_FONT: Record<string, string[]> = {
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
};

const BrickWord = ({ text }: { text: string }) => {
  // Solid chunky pixels with a dark shadow one pixel down-right, like classic blocky game text
  const pixels: { x: number; y: number }[] = [];
  let col = 0;
  for (const ch of text) {
    const rows = BRICK_FONT[ch];
    if (rows) {
      rows.forEach((row, y) =>
        row.split("").forEach((bit, x) => {
          if (bit === "1") pixels.push({ x: col + x, y });
        })
      );
    }
    col += 7;
  }
  const cols = col - 2;
  return (
    <svg
      viewBox={`0 0 ${cols + 1} 8`}
      className="hh-bricks"
      role="img"
      aria-label={text}
      shapeRendering="crispEdges"
    >
      {pixels.map((p, i) => (
        <rect key={`s${i}`} x={p.x + 1} y={p.y + 1} width={1.02} height={1.02} fill="#4a1447" />
      ))}
      {pixels.map((p, i) => (
        <rect key={`p${i}`} x={p.x} y={p.y} width={1.02} height={1.02} fill="#d63cc8" />
      ))}
    </svg>
  );
};

// The handheld is your own pixel drawing: /public/game/handheld.png (94 x 39 pixels).
// Everything below is placed on top of it, measured in the drawing's pixels.
const HH = { w: 94, h: 39 };
const hhBox = (x1: number, y1: number, x2: number, y2: number): React.CSSProperties => ({
  left: `${(x1 / HH.w) * 100}%`,
  top: `${(y1 / HH.h) * 100}%`,
  width: `${((x2 - x1 + 1) / HH.w) * 100}%`,
  height: `${((y2 - y1 + 1) / HH.h) * 100}%`,
});

// Little pixel icons for the handheld's bottom buttons (pink with a dark shadow, like the logo)
const PIXEL_ICONS: Record<string, string[]> = {
  home: ["..1..", ".111.", "11111", ".111.", ".1.1."],
  minus: [".....", ".....", "11111", ".....", "....."],
  plus: ["..1..", "..1..", "11111", "..1..", "..1.."],
  prev: ["1..11", "1.111", "11111", "1.111", "1..11"],
  next: ["11..1", "111.1", "11111", "111.1", "11..1"],
  play: ["1....", "111..", "11111", "111..", "1...."],
  pause: ["11.11", "11.11", "11.11", "11.11", "11.11"],
  sound: ["..1....", ".11..1.", "111...1", ".11..1.", "..1...."],
  muted: ["..1....", ".11.1.1", "111..1.", ".11.1.1", "..1...."],
};

const PixelIcon = ({ name }: { name: string }) => {
  const rows = PIXEL_ICONS[name];
  const w = rows[0].length;
  const px: { x: number; y: number }[] = [];
  rows.forEach((row, y) => row.split("").forEach((c, x) => c === "1" && px.push({ x, y })));
  return (
    <svg viewBox={`0 0 ${w + 1} 6`} className="hh-icon" shapeRendering="crispEdges" aria-hidden="true">
      {px.map((p, i) => (
        <rect key={`s${i}`} x={p.x + 1} y={p.y + 1} width={1.02} height={1.02} fill="#4a1447" />
      ))}
      {px.map((p, i) => (
        <rect key={`p${i}`} x={p.x} y={p.y} width={1.02} height={1.02} fill="#d63cc8" />
      ))}
    </svg>
  );
};

// Equal-size triangles for the handheld's D-pad
const DpadArrow = ({ dir }: { dir: "up" | "down" | "left" | "right" }) => {
  const rot = { up: 0, right: 90, down: 180, left: 270 }[dir];
  return (
    <svg viewBox="0 0 10 10" className="hh-arrow" style={{ transform: `rotate(${rot}deg)` }}>
      <path d="M5 1.5 L9 8 L1 8 Z" fill="currentColor" />
    </svg>
  );
};

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

  // Music player
  const [volume, setVolume] = useState(0.5);
  const [trackIndex, setTrackIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(true);
  const trackRef = useRef(0);
  const errorCountRef = useRef(0);

  const [showBoot, setShowBoot] = useState(true);
  const [bootFadeOut, setBootFadeOut] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Game: whether PINK RUN is open, and a counter that tells the game to jump
  const [playing, setPlaying] = useState(false);
  const [jumpSignal, setJumpSignal] = useState(0);
  // Which game is open, and how far the click wheel was turned (for Pink Vortex)
  const [activeGame, setActiveGame] = useState<"pinkrun" | "vortex" | "snake" | "bird" | "hex" | "maze" | "super">("pinkrun");
  const spinRef = useRef(0);
  // Pink Maze and Super Pinkmane play on a wide handheld instead of the iPod
  const handheld = playing && (activeGame === "maze" || activeGame === "super");
  const [handheldBoot, setHandheldBoot] = useState(false);

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
    main: ["Music", "Socials", "Merch", "Games"],
    music: ["SoundCloud", "Spotify", "Apple Music", "Bandcamp", "Back"],
    socials: ["Instagram", "Twitch", "Releases", "Back"],
    releases: ["TOPSHELF", "Back"],
    games: [
      "Super Pinkmane",
      "Pink Hexagon",
      "Pink Maze",
      "Pink Vortex",
      "Pink Snake",
      "Pink Bird",
      "Pink Run",
      "Back",
    ],
  };

  const items = menus[menu as keyof typeof menus];

  // Which part of a long menu is visible (keeps the selected row on screen)
  const listStart = Math.max(0, Math.min(selected - 2, items.length - VISIBLE_ROWS));
  const visibleItems = items.slice(listStart, listStart + VISIBLE_ROWS);

  const loadAndPlay = (i: number) => {
    const audio = songRef.current;
    if (!audio) return;
    const idx = (i + TRACKS.length) % TRACKS.length;
    trackRef.current = idx;
    setTrackIndex(idx);
    audio.src = TRACKS[idx].file;
    audio
      .play()
      .then(() => {
        hasStartedSong.current = true;
      })
      .catch(() => {});
  };

  const nextTrack = () => loadAndPlay(trackRef.current + 1);

  const prevTrack = () => {
    const audio = songRef.current;
    // Like a real iPod: restart the song if it's been playing a few seconds
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    loadAndPlay(trackRef.current - 1);
  };

  const togglePlay = () => {
    const audio = songRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => {
          hasStartedSong.current = true;
        })
        .catch(() => {});
    } else {
      audio.pause();
    }
  };

  // Super Pinkmane asks the page to pause your music while the secret Stutters track plays, then resume it
  const pausedForGameRef = useRef(false);
  useEffect(() => {
    const onGameMusic = (e: Event) => {
      const audio = songRef.current;
      const what = (e as CustomEvent<string>).detail;
      if (what === "pause") {
        if (audio && !audio.paused) {
          audio.pause();
          pausedForGameRef.current = true;
        }
      } else if (what === "resume") {
        if (audio && pausedForGameRef.current) audio.play().catch(() => {});
        pausedForGameRef.current = false;
      }
    };
    window.addEventListener("pinkmane-music", onGameMusic);
    return () => window.removeEventListener("pinkmane-music", onGameMusic);
  }, []);

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
    if (playing) return;
    playScrollSound();
    setSelected((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const goDown = () => {
    if (playing) return;
    playScrollSound();
    setSelected((prev) => (prev + 1) % items.length);
  };

  const goBack = () => {
    playSelectSound();
    if (playing) {
      setPlaying(false);
      setMenu("games");
      setSelected({ super: 0, hex: 1, maze: 2, vortex: 3, snake: 4, bird: 5, pinkrun: 6 }[activeGame]);
      return;
    }
    // Games lives on the main menu now; Releases lives inside Socials
    if (menu === "games") {
      setMenu("main");
      setSelected(3);
      return;
    }
    if (menu === "releases") {
      setMenu("socials");
      setSelected(2);
      return;
    }
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
    // Inside the game, OK means jump
    if (playing) {
      setJumpSignal((n) => n + 1);
      return;
    }

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
      if (item === "Games") {
        setMenu("games");
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
      if (item === "Releases") {
        setMenu("releases");
        setSelected(0);
      }
      if (item === "Back") goBack();
    }

    if (menu === "releases") {
      if (item === "Back") goBack();
    }

    if (menu === "games") {
      if (item === "Pink Run") {
        setActiveGame("pinkrun");
        setPlaying(true);
      }
      if (item === "Pink Vortex") {
        spinRef.current = 0;
        setActiveGame("vortex");
        setPlaying(true);
      }
      if (item === "Pink Snake") {
        spinRef.current = 0;
        setActiveGame("snake");
        setPlaying(true);
      }
      if (item === "Pink Bird") {
        setActiveGame("bird");
        setPlaying(true);
      }
      if (item === "Pink Hexagon") {
        spinRef.current = 0;
        setActiveGame("hex");
        setPlaying(true);
      }
      if (item === "Pink Maze") {
        spinRef.current = 0;
        setActiveGame("maze");
        setPlaying(true);
      }
      if (item === "Super Pinkmane") {
        spinRef.current = 0;
        setActiveGame("super");
        setPlaying(true);
      }
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
  }, [menu, playing]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore keys while someone is typing their name for the scoreboard
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "TEXTAREA" ||
          (target.tagName === "INPUT" && (target as HTMLInputElement).type !== "range"));
      if (typing) return;

      // Enter / Space / arrows always control the iPod, never a focused button or the slider
      if (["Enter", " ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        if (target && target !== document.body) target.blur();
      }

      // In the game, Space and Arrow Up also jump
      if (playing && (e.key === " " || (e.key === "ArrowUp" && (activeGame === "pinkrun" || activeGame === "bird")))) {
        e.preventDefault();
        setJumpSignal((n) => n + 1);
        return;
      }
      // In Pink Snake the arrow keys steer (the game handles them itself)
      if (
        playing &&
        (activeGame === "snake" || activeGame === "hex" || activeGame === "maze" || activeGame === "super") &&
        e.key.startsWith("Arrow")
      )
        return;

      // Left / right arrows skip songs
      if (e.key === "ArrowLeft") {
        prevTrack();
        return;
      }
      if (e.key === "ArrowRight") {
        nextTrack();
        return;
      }
      if (e.key === "ArrowUp") goUp();
      if (e.key === "ArrowDown") goDown();
      if (e.key === "Enter") selectItem();
      if (e.key === "Backspace") goBack();
    };

    const handleWheel = (e: WheelEvent) => {
      // In Pink Vortex the mouse wheel spins the paddle, in Pink Snake it turns the snake
      if (playing && activeGame === "vortex") {
        spinRef.current += e.deltaY > 0 ? 14 : -14;
        return;
      }
      if (playing && (activeGame === "snake" || activeGame === "maze")) {
        spinRef.current += e.deltaY > 0 ? 45 : -45;
        return;
      }
      if (playing && activeGame === "super") {
        spinRef.current += e.deltaY > 0 ? 14 : -14;
        return;
      }
      if (playing && activeGame === "hex") {
        spinRef.current += e.deltaY > 0 ? 12 : -12;
        return;
      }
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
    const audio = new Audio(TRACKS[0].file);
    let startVolume = 0.5;
    try {
      const saved = Number(localStorage.getItem("pinkmane-volume"));
      if (!Number.isNaN(saved) && saved >= 0 && saved <= 1 && localStorage.getItem("pinkmane-volume") !== null) {
        startVolume = saved;
      }
    } catch {}
    audio.volume = startVolume;
    setVolume(startVolume);
    const onEnded = () => loadAndPlay(trackRef.current + 1);
    const onPlay = () => setIsPaused(false);
    const onPause = () => setIsPaused(true);
    const onPlaying = () => {
      errorCountRef.current = 0;
    };
    // If a song file is missing, skip it (but don't loop forever)
    const onError = () => {
      if (errorCountRef.current < TRACKS.length) {
        errorCountRef.current += 1;
        loadAndPlay(trackRef.current + 1);
      }
    };
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    songRef.current = audio;

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
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      audio.pause();
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

    // In Pink Vortex / Pink Snake, turning the click wheel steers
    if (
      playing &&
      (activeGame === "vortex" ||
        activeGame === "snake" ||
        activeGame === "hex" ||
        activeGame === "maze" ||
        activeGame === "super")
    ) {
      spinRef.current += delta;
      return;
    }
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

  // Clicking a button with the mouse shouldn't "focus" it,
  // otherwise pressing Enter later would press that button again
  const noFocus = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (songRef.current) songRef.current.volume = value;
    try {
      localStorage.setItem("pinkmane-volume", String(value));
    } catch {}
  };

  // The game that's open right now (shown on the iPod, or on the handheld for Maze / Super)
  const gameElement = !playing ? null : (
activeGame === "maze" ? (
                <MazeGame
                  actionSignal={jumpSignal}
                  spinRef={spinRef}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : activeGame === "super" ? (
                <SuperGame
                  actionSignal={jumpSignal}
                  spinRef={spinRef}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : activeGame === "hex" ? (
                <HexGame
                  actionSignal={jumpSignal}
                  spinRef={spinRef}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : activeGame === "bird" ? (
                <BirdGame
                  actionSignal={jumpSignal}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : activeGame === "snake" ? (
                <SnakeGame
                  actionSignal={jumpSignal}
                  spinRef={spinRef}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : activeGame === "vortex" ? (
                <VortexGame
                  actionSignal={jumpSignal}
                  spinRef={spinRef}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                />
              ) : (
                <JumpGame
                  jumpSignal={jumpSignal}
                  fontFamily={pixelFont.style.fontFamily}
                  muted={isMuted}
                  theme="light"
                />
              )
  );

  // Turning the handheld on: show the PINKMANE boot screen for a moment
  useEffect(() => {
    if (!handheld) return;
    setHandheldBoot(true);
    const t = setTimeout(() => setHandheldBoot(false), 1700);
    return () => clearTimeout(t);
  }, [handheld]);

  // HOME on the handheld: leave the game and go all the way back to the main menu
  const goHome = () => {
    playSelectSound();
    setPlaying(false);
    setMenu("main");
    setSelected(0);
  };

  const stepVolume = (delta: number) => {
    changeVolume(Math.round(Math.max(0, Math.min(1, volume + delta)) * 20) / 20);
  };

  // The handheld's D-pad presses the same keys as a keyboard would
  const padKey = (key: string, type: "keydown" | "keyup") => {
    document.body.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  };
  // A quick press + release of one key (for the fire button)
  const tapKey = (key: string) => {
    padKey(key, "keydown");
    padKey(key, "keyup");
  };
  const padProps = (key: string) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      padKey(key, "keydown");
    },
    onPointerUp: () => padKey(key, "keyup"),
    onPointerCancel: () => padKey(key, "keyup"),
    onLostPointerCapture: () => padKey(key, "keyup"),
    onMouseDown: noFocus,
  });

  // Popup on the handheld screen when you change volume, mute or skip
  const [osd, setOsd] = useState<{ kind: "vol" | "text"; value: number; text: string } | null>(null);
  const osdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showOsd = (next: { kind: "vol" | "text"; value: number; text: string }) => {
    setOsd(next);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), 1300);
  };
  const hhVolume = (delta: number) => {
    const v = Math.round(Math.max(0, Math.min(1, volume + delta)) * 20) / 20;
    changeVolume(v);
    showOsd({ kind: "vol", value: v, text: "VOL" });
  };
  const hhMute = () => {
    showOsd({ kind: "text", value: 0, text: isMuted ? "SOUND ON" : "MUTED" });
    toggleMute();
  };
  const hhSong = (dir: 1 | -1) => {
    const idx = (((trackRef.current + dir) % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (dir > 0) nextTrack();
    else prevTrack();
    showOsd({ kind: "text", value: 0, text: `♪ ${TRACKS[dir > 0 ? idx : trackRef.current].title.toUpperCase()}` });
  };
  const hhPlay = () => {
    showOsd({ kind: "text", value: 0, text: isPaused ? "PLAY" : "PAUSE" });
    togglePlay();
  };

  // The drawn analog stick: press and drag, it holds the arrow key in that direction
  const stickKey = useRef<string | null>(null);
  const stickMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let key: string | null = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > r.width * 0.15) {
      key = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : dy > 0 ? "ArrowDown" : "ArrowUp";
    }
    if (key !== stickKey.current) {
      if (stickKey.current) padKey(stickKey.current, "keyup");
      if (key) padKey(key, "keydown");
      stickKey.current = key;
    }
  };
  const stickRelease = () => {
    if (stickKey.current) padKey(stickKey.current, "keyup");
    stickKey.current = null;
  };

  const tickerText = `${isPaused ? "PAUSED" : "NOW PLAYING"}: ${TRACKS[trackIndex].title.toUpperCase()} ✦   `;

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
          <VuBars active={!isMuted && !isPaused} />
          <button
            onClick={toggleMute}
            onMouseDown={noFocus}
            aria-label={isMuted ? "Unmute music" : "Mute music"}
            className="mute-btn"
          >
            <SpeakerIcon muted={isMuted} />
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            aria-label="Music volume"
            className="volume-slider"
            onChange={(e) => changeVolume(Number(e.target.value))}
            onPointerUp={(e) => e.currentTarget.blur()}
            onTouchEnd={(e) => e.currentTarget.blur()}
          />
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
              {playing
                ? activeGame === "vortex"
                  ? "PINK VORTEX"
                  : activeGame === "snake"
                  ? "PINK SNAKE"
                  : activeGame === "bird"
                  ? "PINK BIRD"
                  : activeGame === "hex"
                  ? "PINK HEXAGON"
                  : activeGame === "maze"
                  ? "PINK MAZE"
                  : activeGame === "super"
                  ? "SUPER PINKMANE"
                  : "PINK RUN"
                : menu === "main"
                ? "PINKMANE"
                : menu.toUpperCase()}
            </h2>
          </div>

          {playing ? (
            <div
              style={{
                position: "relative",
                flex: 1,
                width: "100%",
                overflow: "hidden",
              }}
            >
              {handheld ? (
                <div className="hh-note">PLAYING ON THE PINKMANE HANDHELD</div>
              ) : (
                gameElement
              )}
            </div>
          ) : menu === "releases" && selected === 0 ? (
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
                position: "relative",
              }}
            >
              {visibleItems.map((item, i) => {
                const index = listStart + i;
                const isMane = item === "Super Pinkmane";
                return (
                <div
                  key={`${menu}-${index}`}
                  className={isMane ? "mane-highlight" : undefined}
                  style={{
                    position: "relative",
                    padding: "10px",
                    paddingRight: "44px",
                    fontSize: "clamp(11px, 3.2vw, 14px)",
                    lineHeight: "1.6",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    background: selected === index ? "black" : isMane ? "#d63cc8" : "transparent",
                    color: selected === index ? "white" : isMane ? "white" : "black",
                    fontWeight: isMane ? "bold" : "normal",
                    borderBottom:
                      i !== visibleItems.length - 1
                        ? selected === index || selected === index + 1
                          ? "1px solid transparent"
                          : "1px solid rgba(0,0,0,0.15)"
                        : "none",
                  }}
                >
                  {selected === index ? "> " : ""}
                  {isMane ? "✦ " : ""}
                  {item}
                  {isMane ? " ✦" : ""}

                  {selected === index && ITEM_ICONS[item] && (
                    <img
                      key={ITEM_ICONS[item]}
                      src={ITEM_ICONS[item]}
                      alt=""
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (img.src.endsWith(".gif")) img.src = img.src.replace(/\.gif$/, ".png");
                        else img.style.display = "none";
                      }}
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
                );
              })}

              {/* Little scrollbar on the right when the menu is longer than the screen */}
              {items.length > VISIBLE_ROWS && (
                <div className="list-scroll">
                  <div
                    className="list-thumb"
                    style={{
                      height: `${(VISIBLE_ROWS / items.length) * 100}%`,
                      top: `${(listStart / items.length) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Now-playing ticker */}
          <div className="ticker-wrap">
            <div
              className="ticker-track"
              style={{ animationDuration: `${Math.max(8, tickerText.length * 0.28)}s` }}
            >
              <span>{tickerText}</span>
              <span>{tickerText}</span>
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
            className={`click-wheel ${!isMuted && !isPaused ? "wheel-led-pulse" : ""}`}
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
              onMouseDown={noFocus}
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
              onClick={prevTrack}
              onPointerDown={stopWheelDrag}
              onMouseDown={noFocus}
              aria-label="Previous song"
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
              <PrevTrackIcon />
            </button>

            <button
              onClick={nextTrack}
              onPointerDown={stopWheelDrag}
              onMouseDown={noFocus}
              aria-label="Next song"
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
              <NextTrackIcon />
            </button>

            <button
              onClick={togglePlay}
              onPointerDown={stopWheelDrag}
              onMouseDown={noFocus}
              aria-label={isPaused ? "Play music" : "Pause music"}
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
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </button>

            <button
              onClick={selectItem}
              onPointerDown={stopWheelDrag}
              onMouseDown={noFocus}
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
          <span className="hint-touch">
            {playing
              ? activeGame === "maze"
                ? "swipe screen or turn wheel to steer · OK start"
                : activeGame === "super"
                ? "hold left/right side to walk · tap middle or OK to jump"
                : activeGame === "hex"
                ? "turn wheel or hold left/right side · OK start"
                : activeGame === "bird"
                ? "tap screen or OK to flap · tap speaker to mute"
                : activeGame === "snake"
                ? "swipe screen or turn wheel to steer · OK start"
                : activeGame === "vortex"
                ? "turn wheel or drag screen · OK launch · ◀▶ songs"
                : "tap screen or OK to jump · ◀▶ songs"
              : "swipe wheel to scroll · ◀▶ songs"}
          </span>
          <span className="hint-keys">
            {playing
              ? activeGame === "maze"
                ? "arrows / WASD steer · space start · M mute · backspace exit"
                : activeGame === "super"
                ? "← → walk · space / ↑ jump · M mute · backspace exit"
                : activeGame === "hex"
                ? "← → / A D move · space start · M mute · backspace exit"
                : activeGame === "bird"
                ? "space / ↑ flap · M mute · backspace exit"
                : activeGame === "snake"
                ? "arrows / WASD steer · space start · backspace exit"
                : activeGame === "vortex"
                ? "scroll / ↑↓ spin · space launch · backspace exit"
                : "space jump · ◀▶ songs · backspace exit"
              : "scroll or drag wheel · enter select · ◀▶ songs · backspace back"}
          </span>
        </div>
      </div>

      {/* The PINKMANE handheld: a wide screen for Pink Maze and Super Pinkmane */}
      {handheld && (
        <div className="hh-overlay">
          {/* Flying PINKMANEs with jetpacks in the background, some going right, some going left */}
          <div className="hh-glyphs">
            {glyphs.slice(0, 8).map((g) => (
              <div
                key={`hh-${g.id}`}
                className={`hh-jet ${g.id % 2 === 1 ? "hh-jet-left" : ""}`}
                style={{
                  top: `${5 + g.left * 0.8}%`,
                  animationDuration: `${g.duration}s`,
                  animationDelay: `-${g.delay}s`,
                }}
              >
                <img
                  src={JET_DUDE_IMAGE}
                  alt=""
                  className="hh-jet-img"
                  draggable={false}
                  style={{ width: `${Math.round(g.size * 1.4)}px`, animationDuration: `${1.4 + (g.wobble % 10) / 10}s` }}
                />
              </div>
            ))}
          </div>

          <div className={`hh-device ${pixelFont.className}`}>
            {/* Your drawing */}
            <img src="/game/handheld.png" alt="" className="hh-art" draggable={false} />

            {/* The game, inside the screen you drew */}
            <div className="hh-screen" style={hhBox(15, 4, 78, 33)}>
              {gameElement}
              {handheldBoot && (
                <div className="screen-overlay">
                  <div className="hh-boot-dude" />
                  <div className="screen-overlay-label">PINKMANE</div>
                  <div className="screen-overlay-loading">LOADING...</div>
                  <SegmentedBar duration={1.4} active={handheldBoot} />
                </div>
              )}
              {osd && (
                <div className="hh-osd">
                  {osd.kind === "vol" ? (
                    <>
                      <span>VOL</span>
                      <span className="hh-osd-bar">
                        {Array.from({ length: 10 }).map((_, i) => (
                          <span key={i} className={i < Math.round(osd.value * 10) ? "on" : ""} />
                        ))}
                      </span>
                    </>
                  ) : (
                    <span>{osd.text}</span>
                  )}
                </div>
              )}
              <div className="crt-overlay" />
            </div>

            {/* PINKMANE on the bottom edge */}
            <div className="hh-logo" style={hhBox(41.7, 35.82, 50.3, 36.38)}>
              <BrickWord text="PINKMANE" />
            </div>

            {/* Light that pulses to the beat while music plays */}
            <div className={`hh-led2 ${!isPaused && !isMuted ? "hh-led-on" : ""}`} style={hhBox(2, 24, 2, 24)} />

            {/* Invisible buttons on top of the drawn ones */}
            <button className="hh-hit" style={hhBox(5, 9, 10, 13)} aria-label="Up" {...padProps("ArrowUp")} />
            <button className="hh-hit" style={hhBox(5, 16, 10, 21)} aria-label="Down" {...padProps("ArrowDown")} />
            <button className="hh-hit" style={hhBox(1, 12, 6, 17)} aria-label="Left" {...padProps("ArrowLeft")} />
            <button className="hh-hit" style={hhBox(9, 12, 14, 17)} aria-label="Right" {...padProps("ArrowRight")} />
            <button
              className="hh-hit hh-hit-round"
              style={hhBox(2, 23, 11, 31)}
              aria-label="Stick"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                stickMove(e);
              }}
              onPointerMove={(e) => {
                if (e.buttons || e.pointerType === "touch") stickMove(e);
              }}
              onPointerUp={stickRelease}
              onPointerCancel={stickRelease}
              onLostPointerCapture={stickRelease}
              onMouseDown={noFocus}
            />

            <button className="hh-hit hh-hit-round" style={hhBox(83, 8, 89, 13)} onClick={hhPlay} onMouseDown={noFocus} aria-label="Play or pause music" />
            <button
              className="hh-hit hh-hit-round"
              style={hhBox(79, 13, 85, 18)}
              onClick={() => (activeGame === "super" ? tapKey("f") : hhSong(1))}
              onMouseDown={noFocus}
              aria-label={activeGame === "super" ? "Fire" : "Next song"}
            />
            <button className="hh-hit hh-hit-round" style={hhBox(87, 13, 93, 18)} onClick={goBack} onMouseDown={noFocus} aria-label="Back" />
            <button className="hh-hit hh-hit-round" style={hhBox(83, 17, 89, 23)} onClick={selectItem} onMouseDown={noFocus} aria-label="A" />

            <button className="hh-hit" style={hhBox(4, 0, 13, 3)} onClick={() => hhSong(-1)} onMouseDown={noFocus} aria-label="Previous song" />
            <button className="hh-hit" style={hhBox(80, 0, 89, 3)} onClick={() => hhSong(1)} onMouseDown={noFocus} aria-label="Next song" />

            <button className="hh-hit hh-bar" style={hhBox(14, 34, 20, 38)} onClick={goHome} onMouseDown={noFocus} aria-label="Home">
              <PixelIcon name="home" />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(22, 34, 25, 38)} onClick={() => hhVolume(-0.1)} onMouseDown={noFocus} aria-label="Volume down">
              <PixelIcon name="minus" />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(26, 34, 30, 38)} onClick={() => hhVolume(0.1)} onMouseDown={noFocus} aria-label="Volume up">
              <PixelIcon name="plus" />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(60, 34, 63, 38)} onClick={() => hhSong(-1)} onMouseDown={noFocus} aria-label="Previous song">
              <PixelIcon name="prev" />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(64, 34, 67, 38)} onClick={hhPlay} onMouseDown={noFocus} aria-label="Play or pause music">
              <PixelIcon name={isPaused ? "play" : "pause"} />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(68, 34, 72, 38)} onClick={() => hhSong(1)} onMouseDown={noFocus} aria-label="Next song">
              <PixelIcon name="next" />
            </button>
            <button className="hh-hit hh-bar" style={hhBox(73, 34, 78, 38)} onClick={hhMute} onMouseDown={noFocus} aria-label={isMuted ? "Unmute music" : "Mute music"}>
              <PixelIcon name={isMuted ? "muted" : "sound"} />
            </button>
          </div>

          {/* Phones held upright: big thumb controls under the device */}
          <div className="hh-portrait-pad">
            <div className="hh-dpad">
              <button className="hh-d hh-up" aria-label="Up" {...padProps("ArrowUp")}>
                <DpadArrow dir="up" />
              </button>
              <button className="hh-d hh-l" aria-label="Left" {...padProps("ArrowLeft")}>
                <DpadArrow dir="left" />
              </button>
              <div className="hh-d-center" />
              <button className="hh-d hh-r" aria-label="Right" {...padProps("ArrowRight")}>
                <DpadArrow dir="right" />
              </button>
              <button className="hh-d hh-down" aria-label="Down" {...padProps("ArrowDown")}>
                <DpadArrow dir="down" />
              </button>
            </div>
            <div className="hh-face">
              <button className="hh-btn hh-top" onClick={togglePlay} onMouseDown={noFocus} aria-label="Play or pause music">
                <span className="hh-btn-in">♪</span>
              </button>
              <button
                className="hh-btn hh-left-b"
                onClick={() => (activeGame === "super" ? tapKey("f") : nextTrack())}
                onMouseDown={noFocus}
                aria-label={activeGame === "super" ? "Fire" : "Next song"}
              >
                <span className="hh-btn-in">{activeGame === "super" ? "F" : "✦"}</span>
              </button>
              <button className="hh-btn hh-right-b hh-back" onClick={goBack} onMouseDown={noFocus} aria-label="Back">
                <span className="hh-btn-in">B</span>
              </button>
              <button className="hh-btn hh-bottom-b hh-ok" onClick={selectItem} onMouseDown={noFocus} aria-label="A">
                <span className="hh-btn-in">A</span>
              </button>
            </div>
          </div>

          {/* Volume slider + what the buttons do */}
          <div className={`hh-under ${pixelFont.className}`}>
            <span>VOL</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label="Music volume"
              className="volume-slider hh-volume"
              onChange={(e) => changeVolume(Number(e.target.value))}
              onPointerUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
            />
          </div>

          {/* Keys you use, drawn as white key outlines (only on computers) */}
          <div className={`hh-keys ${pixelFont.className}`}>
            {(activeGame === "super"
              ? [
                  [["←", "→"], "walk"],
                  [["SPACE", "↑"], "jump"],
                  [["S"], "shoot / pipe"],
                  [["M"], "sounds"],
                  [["BACKSPACE"], "menu"],
                ]
              : [
                  [["↑", "↓", "←", "→"], "move"],
                  [["SPACE"], "start"],
                  [["M"], "sounds"],
                  [["BACKSPACE"], "menu"],
                ]
            ).map(([keys, label]) => (
              <span className="hh-keygroup" key={label as string}>
                {(keys as string[]).map((k) => (
                  <span className="hh-key" key={k}>
                    {k}
                  </span>
                ))}
                <span className="hh-keylabel">{label as string}</span>
              </span>
            ))}
          </div>

          <div className={`hh-hint ${pixelFont.className}`}>
            best played on a laptop with a keyboard ·{" "}
            {activeGame === "super"
              ? "d-pad / stick = walk · bottom button = jump · left button = fire · d-pad down = go into pipes · right button = back"
              : "d-pad / stick = move · bottom button = start · right button = back · top button = play/pause"}
            <span className="hh-rotate"> · turn your phone sideways for a bigger screen</span>
          </div>
        </div>
      )}

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

        /* ---------- PINKMANE handheld ---------- */
        .hh-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 14px;
          padding: 12px;
          box-sizing: border-box;
          overflow: hidden;
          /* Your handheld background: public/handheld-bg.png (or .jpg). Until it's there, the normal one shows. */
          background-image: url("/handheld-bg.png"), url("/handheld-bg.jpg"), url("/topshelf.png");
          background-size: cover;
          background-position: center;
          animation: hhFadeIn 0.25s ease-out;
        }

        .hh-glyphs {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 0;
        }

        .hh-jet {
          position: absolute;
          left: 0;
          animation-name: hhJetRight;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }

        .hh-jet-left {
          animation-name: hhJetLeft;
        }

        .hh-jet-img {
          display: block;
          height: auto;
          image-rendering: pixelated;
          filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.4));
          animation: hhJetBob ease-in-out infinite alternate;
        }

        /* the ones flying left are mirrored so they face the way they fly */
        .hh-jet-left .hh-jet-img {
          scale: -1 1;
        }

        @keyframes hhJetRight {
          from {
            transform: translateX(-20vw);
          }
          to {
            transform: translateX(110vw);
          }
        }

        @keyframes hhJetLeft {
          from {
            transform: translateX(110vw);
          }
          to {
            transform: translateX(-20vw);
          }
        }

        @keyframes hhJetBob {
          from {
            translate: 0 -10px;
          }
          to {
            translate: 0 10px;
          }
        }

        @keyframes hhFadeIn {
          from {
            opacity: 0;
            transform: scale(0.97);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        /* Your drawing, scaled up with sharp pixels */
        .hh-device {
          position: relative;
          z-index: 1;
          width: min(96vw, 1300px, calc((100dvh - 120px) * 2.41));
          aspect-ratio: 94 / 39;
          filter: drop-shadow(0 12px 0 rgba(0, 0, 0, 0.3)) drop-shadow(0 0 24px rgba(214, 60, 200, 0.45));
        }
        .hh-art {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          image-rendering: pixelated;
          user-select: none;
          pointer-events: none;
        }
        .hh-device > .hh-screen {
          position: absolute;
          aspect-ratio: auto;
          border: none;
          border-radius: 0;
          box-shadow: none;
          background: #242842;
          z-index: 1;
        }
        .hh-logo {
          position: absolute;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1;
          pointer-events: none;
        }
        .hh-logo .hh-bricks {
          width: 100%;
          height: 100%;
        }
        .hh-led2 {
          position: absolute;
          z-index: 1;
          background: transparent;
        }
        .hh-led2.hh-led-on {
          background: #d63cc8;
          box-shadow: 0 0 8px #d63cc8;
          animation: wheelGlow var(--beat) ease-in-out infinite;
        }
        /* Invisible buttons over the drawn ones; they flash pink when pressed */
        .hh-hit {
          position: absolute;
          z-index: 2;
          border: none;
          padding: 0;
          background: transparent;
          cursor: pointer;
          touch-action: none;
        }
        .hh-hit:hover {
          background: rgba(214, 60, 200, 0.18);
        }
        .hh-hit:active {
          background: rgba(214, 60, 200, 0.5);
        }
        .hh-hit-round {
          border-radius: 30%;
        }
        .hh-portrait-pad {
          display: none;
        }
        /* Icons on the drawn bottom bars */
        .hh-bar {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hh-icon {
          height: 50%;
          width: auto;
          display: block;
          pointer-events: none;
          filter: drop-shadow(0.5px 0 0 #fff) drop-shadow(-0.5px 0 0 #fff) drop-shadow(0 0.5px 0 #fff) drop-shadow(0 -0.5px 0 #fff);
        }
        /* Popup on the screen for volume / mute / songs */
        .hh-osd {
          position: absolute;
          left: 50%;
          bottom: 8%;
          transform: translateX(-50%);
          z-index: 25;
          display: flex;
          align-items: center;
          gap: 8px;
          max-width: 90%;
          padding: 6px 10px;
          background: rgba(17, 17, 17, 0.85);
          color: #fff;
          font-size: clamp(7px, 1vw, 12px);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          border: 2px solid #d63cc8;
        }
        .hh-osd-bar {
          display: flex;
          gap: 2px;
        }
        .hh-osd-bar span {
          width: clamp(4px, 0.6vw, 8px);
          height: clamp(8px, 1.1vw, 14px);
          background: #444;
        }
        .hh-osd-bar span.on {
          background: #d63cc8;
        }
        .hh-under {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 8px;
          color: #fff;
          font-size: 8px;
          text-shadow: 1px 1px 0 #000;
        }

        /* Shoulder buttons on top */
        .hh-shoulder {
          position: absolute !important;
          z-index: 0 !important;
          top: -8px;
          width: 20%;
          height: 12px;
          border: 3px solid #111;
          border-bottom: none;
          background: #efe9f3;
          clip-path: polygon(0 4px, 4px 4px, 4px 0, calc(100% - 4px) 0, calc(100% - 4px) 4px, 100% 4px, 100% 100%, 0 100%);
          color: #8a1f86;
          font-family: inherit;
          font-size: 8px;
          cursor: pointer;
        }
        .hh-shoulder:active {
          background: #d63cc8;
          color: #fff;
        }
        .hh-shoulder-l {
          left: 16%;
        }
        .hh-shoulder-r {
          right: 16%;
        }

        .hh-body {
          display: grid;
          grid-template-columns: 15% 1fr 15%;
          grid-template-areas: "left screen right";
          align-items: center;
          gap: 2.5%;
        }
        .hh-left {
          grid-area: left;
        }
        .hh-right {
          grid-area: right;
        }
        .hh-side {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(10px, 2vw, 26px);
        }

        .hh-screen {
          grid-area: screen;
          position: relative;
          width: 100%;
          aspect-ratio: 256 / 160;
          background: #000;
          border: clamp(5px, 1vw, 12px) solid #111;
          border-radius: 0;
          overflow: hidden;
          box-sizing: border-box;
          box-shadow: 0 0 0 2px #6c6474;
        }

        .hh-note {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          font-size: 9px;
          text-align: center;
          padding: 10px;
        }

        .hh-boot-dude {
          width: 48px;
          height: 70px;
          background-image: url("/game/pinkdude.png");
          background-size: 200% 100%;
          background-position: left;
          image-rendering: pixelated;
          animation: bootPulse 1s ease-in-out infinite;
        }

        /* D-pad: four separate arrow buttons in a round dish */
        .hh-dpad {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          gap: 3px;
          width: clamp(70px, 11vw, 150px);
          aspect-ratio: 1;
          padding: 8%;
          box-sizing: border-box;
          background: #b3a9bf;
          clip-path: polygon(30% 0, 70% 0, 70% 8%, 86% 8%, 86% 14%, 92% 14%, 92% 30%, 100% 30%, 100% 70%, 92% 70%, 92% 86%, 86% 86%, 86% 92%, 70% 92%, 70% 100%, 30% 100%, 30% 92%, 14% 92%, 14% 86%, 8% 86%, 8% 70%, 0 70%, 0 30%, 8% 30%, 8% 14%, 14% 14%, 14% 8%, 30% 8%);
        }
        .hh-d {
          border: 3px solid #111;
          background: #efeaf2;
          color: #8a1f86;
          font-size: clamp(8px, 1.2vw, 14px);
          cursor: pointer;
          touch-action: none;
          padding: 0;
          border-radius: 0;
          box-shadow: inset -3px -3px 0 #c7bdd1;
        }
        .hh-d:active {
          background: #d63cc8;
          color: #fff;
        }
        .hh-d {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .hh-arrow {
          width: 55%;
          height: 55%;
          display: block;
        }
        .hh-up {
          grid-column: 2;
          grid-row: 1;
        }
        .hh-l {
          grid-column: 1;
          grid-row: 2;
        }
        .hh-d-center {
          grid-column: 2;
          grid-row: 2;
        }
        .hh-r {
          grid-column: 3;
          grid-row: 2;
        }
        .hh-down {
          grid-column: 2;
          grid-row: 3;
        }

        /* Four face buttons in a diamond */
        .hh-face {
          position: relative;
          width: clamp(70px, 11vw, 150px);
          aspect-ratio: 1;
          margin-top: clamp(20px, 5vw, 80px);
        }
        .hh-btn {
          position: absolute;
          width: 32%;
          aspect-ratio: 1;
          border: none;
          padding: 3px;
          background: #111;
          cursor: pointer;
          touch-action: manipulation;
          clip-path: polygon(30% 0, 70% 0, 70% 10%, 90% 10%, 90% 30%, 100% 30%, 100% 70%, 90% 70%, 90% 90%, 70% 90%, 70% 100%, 30% 100%, 30% 90%, 10% 90%, 10% 70%, 0 70%, 0 30%, 10% 30%, 10% 10%, 30% 10%);
        }
        .hh-btn-in {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          background: #efeaf2;
          color: #8a1f86;
          font-family: inherit;
          font-size: clamp(8px, 1.2vw, 14px);
          box-shadow: inset -4px -4px 0 rgba(0, 0, 0, 0.18);
          clip-path: polygon(30% 0, 70% 0, 70% 10%, 90% 10%, 90% 30%, 100% 30%, 100% 70%, 90% 70%, 90% 90%, 70% 90%, 70% 100%, 30% 100%, 30% 90%, 10% 90%, 10% 70%, 0 70%, 0 30%, 10% 30%, 10% 10%, 30% 10%);
        }
        .hh-btn:active .hh-btn-in {
          box-shadow: inset 4px 4px 0 rgba(0, 0, 0, 0.25);
        }
        .hh-top {
          left: 34%;
          top: 0;
        }
        .hh-left-b {
          left: 0;
          top: 34%;
        }
        .hh-right-b {
          right: 0;
          top: 34%;
        }
        .hh-bottom-b {
          left: 34%;
          bottom: 0;
        }
        .hh-ok .hh-btn-in {
          background: #d63cc8;
          color: #fff;
        }
        .hh-back .hh-btn-in {
          background: #8a1f86;
          color: #fff;
        }

        .hh-led {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #555;
          box-shadow: 0 0 0 2px #111;
        }
        .hh-led-on {
          background: #d63cc8;
          box-shadow: 0 0 0 2px #111, 0 0 8px #d63cc8;
          animation: wheelGlow var(--beat) ease-in-out infinite;
        }

        .hh-grill {
          width: clamp(26px, 4vw, 52px);
          aspect-ratio: 1;
          background-color: #c7bdd1;
          background-image: linear-gradient(90deg, transparent 50%, #c7bdd1 50%),
            linear-gradient(#3d3644 50%, transparent 50%);
          background-size: 6px 6px, 6px 6px;
          clip-path: polygon(25% 0, 75% 0, 75% 12%, 88% 12%, 88% 25%, 100% 25%, 100% 75%, 88% 75%, 88% 88%, 75% 88%, 75% 100%, 25% 100%, 25% 88%, 12% 88%, 12% 75%, 0 75%, 0 25%, 12% 25%, 12% 12%, 25% 12%);
        }

        /* Bottom row */
        .hh-bottom {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          gap: clamp(6px, 1.2vw, 18px);
          margin-top: clamp(6px, 1vw, 12px);
        }
        .hh-bottom-group {
          display: flex;
          align-items: center;
          gap: clamp(4px, 0.7vw, 10px);
          justify-content: center;
          flex-wrap: wrap;
        }
        .hh-small {
          display: flex;
          align-items: center;
          justify-content: center;
          height: clamp(16px, 2vw, 24px);
          min-width: clamp(22px, 2.8vw, 36px);
          padding: 0 6px;
          border: 2px solid #111;
          border-radius: 0;
          background: #efeaf2;
          box-shadow: inset -2px -2px 0 #c7bdd1;
          clip-path: polygon(0 3px, 3px 3px, 3px 0, calc(100% - 3px) 0, calc(100% - 3px) 3px, 100% 3px, 100% calc(100% - 3px), calc(100% - 3px) calc(100% - 3px), calc(100% - 3px) 100%, 3px 100%, 3px calc(100% - 3px), 0 calc(100% - 3px));
          color: #8a1f86;
          font-family: inherit;
          font-size: clamp(8px, 1vw, 12px);
          cursor: pointer;
        }
        .hh-small:active {
          background: #d63cc8;
          color: #fff;
        }
        .hh-home {
          font-size: clamp(6px, 0.8vw, 9px);
          letter-spacing: 0.5px;
          text-transform: lowercase;
        }
        .hh-label {
          color: #5a4f63;
          font-size: clamp(6px, 0.7vw, 8px);
        }
        .hh-volume {
          width: clamp(40px, 6vw, 80px);
        }

        /* PINKMANE wordmark, sleek and wide */
        .hh-wordmark {
          display: flex;
          justify-content: center;
        }
        .hh-bricks {
          width: clamp(110px, 19vw, 280px);
          height: auto;
          display: block;
        }

        .hh-hint {
          position: relative;
          z-index: 1;
          color: rgba(255, 255, 255, 0.85);
          text-shadow: 1px 1px 0 #000;
          font-size: 8px;
          text-align: center;
          line-height: 1.6;
        }
        .hh-rotate {
          display: none;
        }
        /* White key outlines under the handheld */
        .hh-keys {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px 18px;
          max-width: 96vw;
        }
        .hh-keygroup {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .hh-key {
          min-width: 22px;
          padding: 5px 7px;
          border: 2px solid #fff;
          border-radius: 4px;
          box-shadow: 0 3px 0 #fff;
          color: #fff;
          font-size: 9px;
          text-align: center;
          background: rgba(0, 0, 0, 0.35);
        }
        .hh-keylabel {
          color: #fff;
          font-size: 8px;
          margin-left: 4px;
          text-shadow: 1px 1px 0 #000;
        }
        .hh-hint {
          display: none;
        }
        /* Touch screens: no keyboard, so show the text hint instead of keys */
        @media (hover: none) {
          .hh-keys {
            display: none;
          }
          .hh-hint {
            display: block;
          }
        }

        /* Phones held upright: screen on top, controls underneath */
        @media (orientation: portrait) {
          .hh-device {
            width: 96vw;
          }
          .hh-portrait-pad {
            position: relative;
            z-index: 1;
            display: flex;
            width: min(92vw, 420px);
            justify-content: space-between;
            align-items: center;
            padding: 10px 6px;
          }
          .hh-body {
            grid-template-columns: 1fr 1fr;
            grid-template-areas:
              "screen screen"
              "left right";
            row-gap: 14px;
          }
          .hh-bottom {
            grid-template-columns: 1fr;
            justify-items: center;
          }
          /* Bigger D-pad and buttons for thumbs */
          .hh-dpad,
          .hh-face {
            width: min(34vw, 150px);
          }
          .hh-face {
            margin-top: 0;
          }
          .hh-d,
          .hh-btn {
            font-size: 12px;
          }
          .hh-rotate {
            display: inline;
          }
        }

        .list-scroll {
          position: absolute;
          top: clamp(14px, 4vw, 20px);
          bottom: clamp(14px, 4vw, 20px);
          right: 5px;
          width: 4px;
          background: rgba(0, 0, 0, 0.1);
        }

        .list-thumb {
          position: absolute;
          left: 0;
          width: 100%;
          background: rgba(0, 0, 0, 0.45);
        }

        .volume-slider {
          width: 56px;
          height: 12px;
          margin: 0;
          cursor: pointer;
          accent-color: #d63cc8;
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
          color: #d63cc8;
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

        /* The mane game (Super Pinkmane) in the Games menu: pink, glowing, unmissable */
        .mane-highlight::after {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          box-shadow: inset 0 0 0 2px #ff8ff0, 0 0 10px 2px rgba(214, 60, 200, 0.65);
          animation: manePulse 1.4s ease-in-out infinite;
        }
        @keyframes manePulse {
          0%,
          100% {
            opacity: 0.55;
          }
          50% {
            opacity: 1;
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
