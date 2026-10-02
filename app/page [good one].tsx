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

// BEAT SYNC: everything that wiggles on the site moves to the song that's playing.
// For each song, fill in:
//   bpm    = the tempo from your project (use half, e.g. 70 instead of 140, if you want half-time bounce)
//   offset = seconds from the start of the file to the first beat (0 if the song starts right on the beat)
// Songs without a bpm use DEFAULT_BPM.
const DEFAULT_BPM = 140;
// If everything feels a tiny bit early or late on your speakers, change this (in seconds).
// Bigger number = the visuals hit later. Try steps of 0.02. Bluetooth headphones often need about 0.15.
const SYNC_NUDGE = 0;
// BASS QUAKE slider: 0 = off, 10 = max. Visitors can change it, but it always starts here
// every time the website is opened.
const QUAKE_DEFAULT = 3;
// The shaking border around the screen: how thick it is (in screen pixels, ~57 = about 1.5 cm)
const EDGE_BAND_PX = 57;
// How far the border shakes on an 808 at level 10 (in screen pixels)
const EDGE_MAX_SHAKE_PX = 10;

// Your songs. Files go in public/music/ named 01.mp3, 02.mp3 ...
// link: the SoundCloud page of that song. Clicking the "NOW PLAYING" text on the iPod opens it.
//   Paste each song's link between the quotes, e.g. link: "https://soundcloud.com/pinkmanee/wet-socks"
//   If a link is left empty (""), clicking searches SoundCloud for that song instead.
const TRACKS: { title: string; file: string; bpm?: number; offset?: number; link?: string }[] = [
  { title: "pinkmane's random ass beat", file: "/sounds/song.mp3", bpm: 140, offset: 0, link: "https://soundcloud.com/pinkmanee" },
  { title: "wet socks (w/ o1m4de)", file: "/music/06.mp3", bpm: 82, offset: 0, link: "https://soundcloud.com/pinkmanee/wet-socks" },
  { title: "hurricane of blades", file: "/music/07.mp3", bpm: 77, offset: 0, link: "https://soundcloud.com/pinkmanee/hurricane-of-blades" },
  { title: "cat piss kenny", file: "/music/10.mp3", bpm: 142, offset: 0, link: "https://soundcloud.com/pinkmanee/cat-piss-kenny" },
  { title: "gaf (ft. TOMBFELL)", file: "/music/05.mp3", bpm: 138, offset: 0, link: "https://soundcloud.com/pinkmanee/gaf" },
  { title: "snehulienka", file: "/music/03.mp3", bpm: 140, offset: 0, link: "" },
  { title: "small pretty titties", file: "/music/01.mp3", bpm: 140, offset: 0, link: "" },
  { title: "vomit trap", file: "/music/08.mp3", bpm: 140, offset: 0, link: "https://soundcloud.com/pinkmanee/vomit-trap" },
  { title: "gods psp (ft. TOMBFELL)", file: "/music/09.mp3", bpm: 140, offset: 0, link: "https://soundcloud.com/pinkmanee/gods-psp" },
];

// Where clicking the now-playing text goes: the song's own link, or a SoundCloud search for it
function trackLink(track: { title: string; link?: string }) {
  if (track.link) return track.link;
  const name = track.title.replace(/\(.*?\)/g, "").trim(); // drop "(ft. ...)" bits for a cleaner search
  return `https://soundcloud.com/search/sounds?q=${encodeURIComponent(`pinkmane ${name}`)}`;
}

// PHONES: the round pad under your left thumb, and which key each of its arrows holds down
const TP_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" } as const;
// Super Pinkmane on the round pad: left / right win unless your thumb is clearly up or down.
// Bigger = harder to hit up (jump) / down (shoot) by accident. 1 = all four the same.
const TP_WALK_BIAS = 1.7;

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
    "PINKMANE is an artist and producer who codes and makes music in their free time. Cloud rap and trap, made mostly with Serum 2. Music on Spotify, Apple Music, SoundCloud and Bandcamp.",
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
// WIGGLY BACKGROUND: the background picture gently wiggles like heat haze / water
// (the same wiggle as the covers in Super Pinkmane), and a ~1.5 cm border around the
// edge of the screen shakes when an 808 hits. The middle never shakes.
// If a browser can't do it, the normal still picture just shows instead.
// WIGGLE_PX: how far the wiggle moves the picture sideways (0 = no wiggle)
const WIGGLE_PX = 5;
// BACKGROUND MODES: the 3 pixel buttons above the iPod swap the page background.
// Put your pictures in /public/bg/ named mode1.png, mode2.png, mode3.png.
// If one is missing, the normal topshelf.png shows instead.
// focus: which part of the picture stays on screen when it doesn't fit
//   0 = keep the top, 0.5 = keep the middle, 1 = keep the bottom
// screen: the iPod screen colour that goes with that background
//   (mode 1 light pink, mode 2 light green, mode 3 light red)
const BG_MODES = [
  { label: "MODE 1", sources: ["/bg/mode1.png", "/topshelf.png"], focus: 0.15, screen: "#f6d3ee", screenRgb: "246, 211, 238" },
  { label: "MODE 2", sources: ["/bg/mode2.png", "/topshelf.png"], focus: 0.15, screen: "#d7efbc", screenRgb: "215, 239, 188" },
  { label: "MODE 3", sources: ["/bg/mode3.png", "/topshelf.png"], focus: 0.15, screen: "#f8d0ca", screenRgb: "248, 208, 202" },
];
// HANDHELD (PSP) BACKGROUND MODES: 4 pixel buttons above the handheld.
// MODE 1 is the one you had before (handheld-bg.png, or .jpg, or the normal one, whichever exists first).
// MODE 2-4 are the same 3 pictures as the iPod modes (/public/bg/mode1.png, mode2.png, mode3.png).
// focus works the same as the iPod ones: 0 = keep the top, 0.5 = keep the middle.
// glow: the colour of the glow around the handheld (and its beat light) in that mode, as "red, green, blue".
//   MODE 1 keeps the pink it always had. MODE 2-4 use the same colours as the iPod screen in that
//   background (light pink, light green, light red).
const HH_BG_MODES = [
  { label: "MODE 1", sources: ["/handheld-bg.png", "/handheld-bg.jpg", "/topshelf.png"], focus: 0.5, glow: "214, 60, 200" },
  { label: "MODE 2", sources: ["/bg/mode1.png", "/topshelf.png"], focus: 0.15, glow: "246, 211, 238" },
  { label: "MODE 3", sources: ["/bg/mode2.png", "/topshelf.png"], focus: 0.15, glow: "215, 239, 188" },
  { label: "MODE 4", sources: ["/bg/mode3.png", "/topshelf.png"], focus: 0.15, glow: "248, 208, 202" },
];

type BeatState = { kick: number; sway: number; bass: number; quake: number };

const LIQUID_VERT = `
attribute vec2 pos;
varying vec2 uv;
void main() {
  uv = pos * 0.5 + 0.5;
  uv.y = 1.0 - uv.y;
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const LIQUID_FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D img;
uniform vec2 res;
uniform vec2 imgSize;
uniform float t;
uniform float pxScale;
uniform float wiggle;
uniform float band;
uniform vec2 shake;
uniform float focusY;
void main() {
  // work in screen pixels
  vec2 px = uv * res / pxScale;
  vec2 size = res / pxScale;

  // wiggle: every row slides left/right a little on a slow wave (like the game covers)
  vec2 off = vec2(sin(t * 1.6 + px.y * 0.023) * wiggle, 0.0);

  // 808 border: only a band around the edge of the screen shakes, fading out towards the middle
  float edgeDist = min(min(px.x, size.x - px.x), min(px.y, size.y - px.y));
  float mask = 1.0 - smoothstep(band * 0.6, band, edgeDist);
  off += shake * mask;

  vec2 p = uv + off / size;
  // zoom in a hair so the wiggle never shows the picture's edge
  float pad = 1.0 - 2.0 * (wiggle + 12.0) / size.x;
  p = (p - 0.5) * pad + 0.5;

  // fit the picture to fill the screen (like background-size: cover)
  float rs = res.x / res.y;
  float ri = imgSize.x / imgSize.y;
  vec2 sc = rs > ri ? vec2(1.0, ri / rs) : vec2(rs / ri, 1.0);
  vec2 tc = (p - 0.5) * sc + 0.5;
  // when the top/bottom gets cut off, slide towards the part we want to keep (focusY: 0 = top)
  tc.y += (focusY - 0.5) * (1.0 - sc.y);
  gl_FragColor = vec4(texture2D(img, tc).rgb, 1.0);
}`;

function LiquidBg({
  sources,
  beat,
  active,
  focus = 0.5,
}: {
  sources: string[];
  beat: { current: BeatState };
  active: boolean;
  focus?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // A brand new canvas every time, so a closed one is never reused
    // (this is why it didn't show up while testing locally before)
    const canvas = document.createElement("canvas");
    canvas.className = "liquid-canvas";
    wrap.appendChild(canvas);
    const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
    if (!gl) {
      canvas.remove();
      return;
    }

    const compile = (type: number, code: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, code);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, LIQUID_VERT);
    const fs = compile(gl.FRAGMENT_SHADER, LIQUID_FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("res");
    const uImg = u("imgSize");
    const uT = u("t");
    const uScale = u("pxScale");
    const uWiggle = u("wiggle");
    const uBand = u("band");
    const uShake = u("shake");
    gl.uniform1f(u("focusY"), focus);

    let cancelled = false;
    let frame = 0;

    const start = (image: HTMLImageElement) => {
      // Picture too big for this device's graphics chip: keep the normal still picture
      const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
      if (image.naturalWidth > maxSize || image.naturalHeight > maxSize) return;
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
      if (gl.getError() !== gl.NO_ERROR) return;
      gl.uniform2f(uImg, image.naturalWidth, image.naturalHeight);

      let clock = 0;
      let prev = performance.now();
      let shown = false;
      const draw = (now: number) => {
        frame = requestAnimationFrame(draw);
        const dt = Math.min(0.1, (now - prev) / 1000);
        prev = now;
        if (!activeRef.current) return; // hidden behind something else: don't waste battery
        const b = beat.current;
        clock += dt;
        // keep it sharp but light: never draw more pixels than the screen shows
        const w = Math.min(1600, Math.round(canvas.clientWidth * Math.min(1, window.devicePixelRatio || 1)));
        const h = Math.round((w * canvas.clientHeight) / Math.max(1, canvas.clientWidth));
        if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
          canvas.width = w;
          canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uT, clock);
        gl.uniform1f(uScale, canvas.width / Math.max(1, canvas.clientWidth));
        gl.uniform1f(uWiggle, WIGGLE_PX);
        gl.uniform1f(uBand, EDGE_BAND_PX);
        // 808 shake: a new random nudge every frame while the hit lasts
        const amount = b.bass * b.quake * EDGE_MAX_SHAKE_PX;
        gl.uniform2f(uShake, (Math.random() * 2 - 1) * amount, (Math.random() * 2 - 1) * amount);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!shown) {
          shown = true;
          setReady(true);
        }
      };
      frame = requestAnimationFrame(draw);
    };

    // Try each picture in order until one loads
    const load = (i: number) => {
      if (cancelled || i >= sources.length) return;
      // window.Image = the browser picture loader (plain "Image" here means the Next.js <Image> component)
      const image = new window.Image();
      image.onload = () => {
        if (!cancelled) start(image);
      };
      image.onerror = () => load(i + 1);
      image.src = sources[i];
    };
    load(0);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
      setReady(false);
    };
  }, [sources, beat, focus]);

  return <div ref={wrapRef} className={`liquid-bg ${ready ? "liquid-on" : ""}`} aria-hidden="true" />;
}

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
  // A song from a game level (Super Pinkmane Level 3) is playing: the music buttons control that instead
  type GameSong = { title: string; artist: string; paused: boolean };
  const [gameSong, setGameSong] = useState<GameSong | null>(null);
  const gameSongRef = useRef<GameSong | null>(null);
  const gameSongShownRef = useRef<string | null>(null); // last level song shown in the purple box
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
  // PHONES + TABLETS: on a touch screen, Pink Maze and Super Pinkmane get their own full-screen
  // layout with big thumb buttons instead of the drawn handheld.
  // To look at it on your computer, open the site with ?touch=1 at the end: http://localhost:3000/?touch=1
  const [isTouch, setIsTouch] = useState(false);
  const [padDir, setPadDir] = useState<string | null>(null); // which way the round pad is pushed (lights up its arrow)
  const [tpAOn, setTpAOn] = useState(false);
  const [tpBOn, setTpBOn] = useState(false);
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("touch") !== null;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(forced || mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  const [handheldBoot, setHandheldBoot] = useState(false);
  // "CONTROL W THESE!" arrows pointing at the key legend, for 5 seconds after Super Pinkmane starts
  const [keyTip, setKeyTip] = useState(false);
  // Which background mode is picked (0, 1 or 2), remembered for next visit
  const [bgMode, setBgMode] = useState(0);
  // Same thing for the handheld (PSP) view (0-3), remembered separately
  const [hhBgMode, setHhBgMode] = useState(0);

  // TWITCH MODE: only shows on your own computer (localhost), never on the real site.
  // Rate the songs people send you while you play: MIX and OVERALL VIBE from 0 to 100, and a replay-able tick.
  const [twitchMode, setTwitchMode] = useState(false);
  const [twMix, setTwMix] = useState(0);
  const [twVibe, setTwVibe] = useState(0);
  const [twReplay, setTwReplay] = useState(false);
  useEffect(() => {
    const h = window.location.hostname;
    setTwitchMode(h === "localhost" || h === "127.0.0.1" || h === "[::1]" || /^(192\.168\.|10\.)/.test(h));
  }, []);

  // Glitch flicker on menu change
  const [glitch, setGlitch] = useState(false);
  const isFirstRender = useRef(true);

  const songRef = useRef<HTMLAudioElement | null>(null);
  // The whole page; the beat clock writes the beat values onto it
  const mainRef = useRef<HTMLElement>(null);
  // The beat numbers, shared with the liquid background
  const beatRef = useRef<BeatState>({ kick: 0, sway: 0, bass: 0, quake: QUAKE_DEFAULT / 10 });
  // BASS QUAKE level (0-10) from the slider, and when it was last moved (for a test shake)
  const [quake, setQuake] = useState(QUAKE_DEFAULT);
  const quakeRef = useRef(QUAKE_DEFAULT);
  const quakeTestRef = useRef(-10000);
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

  // Sends a music button press to the game (when a level song is playing)
  const gameMusic = (cmd: "next" | "prev" | "toggle") => {
    if (!gameSongRef.current) return false;
    window.dispatchEvent(new CustomEvent("pinkmane-level-control", { detail: cmd }));
    return true;
  };

  const nextTrack = () => {
    if (gameMusic("next")) return;
    loadAndPlay(trackRef.current + 1);
  };

  const prevTrack = () => {
    if (gameMusic("prev")) return;
    const audio = songRef.current;
    // Like a real iPod: restart the song if it's been playing a few seconds
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    loadAndPlay(trackRef.current - 1);
  };

  const togglePlay = () => {
    if (gameMusic("toggle")) return;
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
  // true from the game's "pause" until its "resume" (a level with its own songs, the secret track...):
  // your music must not start by itself during that time
  const gameHoldRef = useRef(false);
  useEffect(() => {
    const onGameMusic = (e: Event) => {
      const audio = songRef.current;
      const what = (e as CustomEvent<string>).detail;
      if (what === "pause") {
        gameHoldRef.current = true;
        if (audio && !audio.paused) {
          audio.pause();
          pausedForGameRef.current = true;
        }
      } else if (what === "resume") {
        gameHoldRef.current = false;
        if (audio && pausedForGameRef.current) {
          audio
            .play()
            .then(() => {
              hasStartedSong.current = true;
            })
            .catch(() => {});
        }
        pausedForGameRef.current = false;
      }
    };
    window.addEventListener("pinkmane-music", onGameMusic);
    return () => window.removeEventListener("pinkmane-music", onGameMusic);
  }, []);

  // The game tells us which level song is on (or null when none): shown on the ticker + handheld
  useEffect(() => {
    const onLevelSong = (e: Event) => {
      const song = (e as CustomEvent<GameSong | null>).detail;
      const wasOff = !gameSongRef.current;
      gameSongRef.current = song;
      setGameSong(song);
      // a new level song started (or the level just began): show its name in the purple box for 3.5s
      if (!song) gameSongShownRef.current = null;
      else if (!song.paused && song.title !== gameSongShownRef.current) {
        gameSongShownRef.current = song.title;
        showOsd({ kind: "text", value: 0, text: `♪ ${song.title}` }, 3500);
      }
      // first time a level song shows up: give it your volume
      if (song && wasOff) {
        window.dispatchEvent(new CustomEvent("pinkmane-level-control", { detail: { volume: songRef.current?.volume ?? 0.5 } }));
      }
    };
    window.addEventListener("pinkmane-level-song", onLevelSong);
    return () => window.removeEventListener("pinkmane-level-song", onLevelSong);
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
      // W / S move up and down in the menus too (in the games they do their own thing)
      if (!playing && (e.key === "w" || e.key === "W")) goUp();
      if (!playing && (e.key === "s" || e.key === "S")) goDown();
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

  // BEAT CLOCK: about 60 times a second, reads exactly where the song is and turns that into
  // numbers the CSS uses to move things:
  //   --kick  jumps to 1 on every beat, then drops back to 0
  //   --hat   same, but twice per beat (8th notes)
  //   --sway  swings from 1 to -1 and back, landing on the beats (for side-to-side / up-down wiggles)
  //   bass    jumps up when the bass actually hits in the song (the browser listens to the low end),
  //           which makes the border around the screen shake
  // When the music is paused or muted, things breathe slowly instead.
  // BASS QUAKE always starts at QUAKE_DEFAULT (3) when the website opens, so nothing is loaded here

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let prev = performance.now();
    let lastAudioTime = -1;
    let lastAudioAt = 0;
    let kick = 0;
    let hat = 0;
    let sway = 0;
    // Smoke puffs: --phase goes 0 -> 1 during each beat (0 = right on the beat)
    let smoke = 0;
    const shown: Record<string, string> = {};

    // Bass listener. It only switches on once the browser allows sound, so the music never goes quiet.
    // If anything about it fails, the background just trembles on the beat instead.
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let bins = new Uint8Array(0);
    let hookedTo: HTMLAudioElement | null = null;
    let hooking = false;
    let giveUp = false;
    let lastTry = -10000;
    let bass = 0;
    // Recent bass loudness, so a hit = "much louder than a split second ago"
    const recent: { at: number; level: number }[] = [];
    // Hits wait here until the moment you actually hear them (speakers lag behind a bit)
    const waiting: { at: number; strength: number }[] = [];
    const hookUpBass = async (audio: HTMLAudioElement) => {
      hooking = true;
      try {
        const AC =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) {
          giveUp = true;
          return;
        }
        if (!ctx) ctx = new AC();
        if (ctx.state !== "running") await ctx.resume();
        // Browser isn't allowing sound yet: don't touch the song, try again in a bit
        if (ctx.state !== "running" || hookedTo) return;
        const source = ctx.createMediaElementSource(audio);
        const node = ctx.createAnalyser();
        node.fftSize = 1024;
        node.smoothingTimeConstant = 0;
        source.connect(node);
        node.connect(ctx.destination);
        analyser = node;
        bins = new Uint8Array(node.frequencyBinCount);
        hookedTo = audio;
      } catch {
        giveUp = true;
      } finally {
        hooking = false;
      }
    };

    // How loud the 808 range (about 30-100 Hz) is right now, 0 to 1
    const bassLevel = () => {
      if (!analyser || !ctx) return 0;
      analyser.getByteFrequencyData(bins);
      const hz = ctx.sampleRate / analyser.fftSize;
      const lo = Math.max(1, Math.floor(30 / hz));
      const hi = Math.max(lo, Math.floor(100 / hz));
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += bins[i];
      return sum / ((hi - lo + 1) * 255);
    };
    const put = (name: string, value: string) => {
      if (shown[name] !== value) {
        shown[name] = value;
        el.style.setProperty(name, value);
      }
    };

    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - prev) / 1000);
      prev = now;
      const audio = songRef.current;
      const track = TRACKS[trackRef.current] ?? TRACKS[0];
      const secondsPerBeat = 60 / (track.bpm && track.bpm > 0 ? track.bpm : DEFAULT_BPM);
      put("--beat", `${secondsPerBeat.toFixed(4)}s`);

      const live = !!audio && !audio.paused && !audio.ended && !audio.muted && audio.readyState >= 2 && !calm.matches;

      // Switch the bass listener on (tries again every 2 seconds until the browser allows it)
      if (audio && !audio.paused && !giveUp && !hooking && hookedTo !== audio && now - lastTry > 2000) {
        lastTry = now;
        if (hookedTo) {
          giveUp = true; // the song player was swapped out; stick with the beat
        } else {
          void hookUpBass(audio);
        }
      }
      // Phones can pause the sound engine (e.g. after a call); wake it back up so the music keeps playing
      if (ctx && hookedTo && audio && !audio.paused && ctx.state !== "running" && now - lastTry > 1000) {
        lastTry = now;
        ctx.resume().catch(() => {});
      }
      if (live && audio) {
        // The browser only updates the song position every few milliseconds, so fill in the gaps smoothly
        if (audio.currentTime !== lastAudioTime) {
          lastAudioTime = audio.currentTime;
          lastAudioAt = now;
        }
        const t = lastAudioTime + ((now - lastAudioAt) / 1000) * audio.playbackRate - (track.offset ?? 0) - SYNC_NUDGE;
        const beats = t / secondsPerBeat;
        if (beats >= 0) {
          const phase = beats - Math.floor(beats); // 0 = right on the beat
          smoke = phase;
          const phase8 = beats * 2 - Math.floor(beats * 2);
          kick = Math.pow(1 - phase, 3);
          hat = Math.pow(1 - phase8, 4);
          sway = Math.cos(beats * Math.PI);
        } else {
          // Before the first beat (intro silence): hold still
          kick += (0 - kick) * Math.min(1, dt * 10);
          hat += (0 - hat) * Math.min(1, dt * 10);
          sway += (0 - sway) * Math.min(1, dt * 4);
        }
      } else if (calm.matches) {
        // Visitor asked their device for less motion: keep everything still
        kick = 0;
        hat = 0;
        sway = 0;
      } else {
        // Paused or muted: slow, gentle breathing
        const s = now / 1000;
        const breathe = (0.5 + 0.5 * Math.sin(s * 4.5)) * 0.35;
        kick += (breathe - kick) * Math.min(1, dt * 6);
        hat += (0 - hat) * Math.min(1, dt * 6);
        sway += (Math.sin(s * 2.2) * 0.6 - sway) * Math.min(1, dt * 4);
      }

      // 808 hits: the low end jumps way up compared to the last ~70 milliseconds = an 808 just hit
      const level10 = calm.matches ? 0 : quakeRef.current;
      let hit = 0;
      if (live && level10 > 0) {
        if (analyser && ctx && hookedTo === audio) {
          const level = bassLevel();
          recent.push({ at: now, level });
          while (recent.length && recent[0].at < now - 70) recent.shift();
          let low = level;
          for (const r of recent) low = Math.min(low, r.level);
          const rise = level - low;
          const strength = level > 0.2 ? Math.min(1, Math.max(0, (rise - 0.07) * 4.5)) : 0;
          // Show it when it reaches your ears, not when the browser first sees it
          const lag = ((ctx.baseLatency || 0) + ((ctx as AudioContext & { outputLatency?: number }).outputLatency || 0) + SYNC_NUDGE) * 1000;
          if (strength > 0) waiting.push({ at: now + Math.min(400, Math.max(0, lag)), strength });
        } else {
          hit = kick * 0.6; // no bass listener: shake on the beat instead
        }
      } else {
        recent.length = 0;
        waiting.length = 0;
      }
      while (waiting.length && waiting[0].at <= now) hit = Math.max(hit, waiting.shift()!.strength);
      // Moving the slider gives one test shake, even with the music paused
      if (now - quakeTestRef.current < 60) hit = 1;
      // kicks in on the hit, then settles quickly
      bass = Math.max(hit, bass * Math.exp(-dt * 8));
      if (bass < 0.01) bass = 0;

      put("--kick", kick.toFixed(3));
      put("--hat", hat.toFixed(3));
      put("--sway", sway.toFixed(3));
      // No music (or before the first beat): the smoke keeps drifting up slowly on its own
      if (!live || !audio || audio.currentTime - (track.offset ?? 0) - SYNC_NUDGE < 0) {
        smoke = calm.matches ? 0.4 : (smoke + dt * 0.5) % 1;
      }
      put("--phase", smoke.toFixed(3));
      put("--phase2", ((smoke + 0.5) % 1).toFixed(3));
      beatRef.current.kick = kick;
      beatRef.current.sway = sway;
      beatRef.current.bass = bass;
      beatRef.current.quake = level10 / 10;
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      ctx?.close().catch(() => {});
    };
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
      // (not while the game is holding your music off, e.g. in a level with its own songs)
      if (hasStartedSong.current || gameHoldRef.current || !songRef.current) return;
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

  const changeQuake = (value: number) => {
    const v = Math.max(0, Math.min(10, Math.round(value)));
    setQuake(v);
    quakeRef.current = v;
    quakeTestRef.current = performance.now(); // shake once so you can feel the new level
    try {
      localStorage.removeItem("pinkmane-quake"); // old saved level from before, not used any more
    } catch {}
  };

  const changeVolume = (value: number) => {
    setVolume(value);
    if (songRef.current) songRef.current.volume = value;
    window.dispatchEvent(new CustomEvent("pinkmane-level-control", { detail: { volume: value } }));
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
                  touchPad={isTouch}
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

  // Super Pinkmane: once the boot screen is gone, point at the keys for 5 seconds
  useEffect(() => {
    if (!handheld || activeGame !== "super" || handheldBoot) {
      setKeyTip(false);
      return;
    }
    setKeyTip(true);
    const t = setTimeout(() => setKeyTip(false), 5000);
    return () => clearTimeout(t);
  }, [handheld, activeGame, handheldBoot]);

  // Load the background mode picked last time
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("pinkmane-bgmode"));
      if (saved >= 0 && saved < BG_MODES.length) setBgMode(saved);
      const savedHh = Number(localStorage.getItem("pinkmane-hh-bgmode"));
      if (savedHh >= 0 && savedHh < HH_BG_MODES.length) setHhBgMode(savedHh);
    } catch {}
  }, []);

  const pickBgMode = (i: number) => {
    playSelectSound();
    setBgMode(i);
    try {
      localStorage.setItem("pinkmane-bgmode", String(i));
    } catch {}
  };

  const pickHhBgMode = (i: number) => {
    playSelectSound();
    setHhBgMode(i);
    try {
      localStorage.setItem("pinkmane-hh-bgmode", String(i));
    } catch {}
  };

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
  const showOsd = (next: { kind: "vol" | "text"; value: number; text: string }, ms = 1300) => {
    setOsd(next);
    if (osdTimer.current) clearTimeout(osdTimer.current);
    osdTimer.current = setTimeout(() => setOsd(null), ms);
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
    if (gameSongRef.current) {
      // a level song is on: skip that one (the new song's name pops up in the purple box by itself)
      gameMusic(dir > 0 ? "next" : "prev");
      return;
    }
    const idx = (((trackRef.current + dir) % TRACKS.length) + TRACKS.length) % TRACKS.length;
    if (dir > 0) nextTrack();
    else prevTrack();
    showOsd({ kind: "text", value: 0, text: `♪ ${TRACKS[dir > 0 ? idx : trackRef.current].title.toUpperCase()}` });
  };
  const hhPlay = () => {
    const paused = gameSongRef.current ? gameSongRef.current.paused : isPaused;
    showOsd({ kind: "text", value: 0, text: paused ? "PLAY" : "PAUSE" });
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

  // ---------- PHONES + TABLETS: the big thumb buttons ----------
  // A tiny buzz when a button is pressed (Android phones; iPhones don't allow it)
  const buzz = () => {
    try {
      navigator.vibrate?.(8);
    } catch {}
  };
  // The round pad under your left thumb. It holds the arrow key for the side your thumb is on,
  // and you can slide from one side to the other without lifting.
  const tpKey = useRef<string | null>(null);
  const tpSet = (key: string | null) => {
    if (key === tpKey.current) return;
    if (tpKey.current) padKey(tpKey.current, "keyup");
    if (key) {
      padKey(key, "keydown");
      buzz();
    }
    tpKey.current = key;
    setPadDir(key);
  };
  const tpMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    let key = tpKey.current; // in the little dead spot in the middle: keep going the way you were
    if (Math.max(Math.abs(dx), Math.abs(dy)) > r.width * 0.1) {
      // Super Pinkmane: left / right win unless your thumb is clearly up or down
      // (so you don't jump or shoot by accident while walking). TP_WALK_BIAS: bigger = harder to hit up / down.
      const sideways = Math.abs(dx) * (activeGame === "super" ? TP_WALK_BIAS : 1) >= Math.abs(dy);
      key = sideways ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : dy > 0 ? "ArrowDown" : "ArrowUp";
    }
    tpSet(key);
  };
  // Leaving the game lets go of everything
  useEffect(() => {
    if (handheld) return;
    tpKey.current = null;
    setPadDir(null);
    setTpAOn(false);
    setTpBOn(false);
  }, [handheld]);
  // A: Super Pinkmane gets it straight away (jump the moment you touch, hold = fly). Pink Maze: start.
  const tpA = (down: boolean) => {
    setTpAOn(down);
    if (activeGame === "super") {
      window.dispatchEvent(new CustomEvent("pinkmane-pad", { detail: { btn: "a", down } }));
    } else if (down) {
      selectItem();
    }
    if (down) buzz();
  };
  // B: the same as the down arrow key (shoot, or go into a pipe you're standing on)
  const tpB = (down: boolean) => {
    setTpBOn(down);
    padKey("ArrowDown", down ? "keydown" : "keyup");
    if (down) buzz();
  };

  // While a game level plays its own song, the ticker and the play/pause buttons show that song
  const musicPaused = gameSong ? gameSong.paused : isPaused;
  const tickerSong = gameSong ? `${gameSong.artist} - ${gameSong.title}` : TRACKS[trackIndex].title.toUpperCase();
  const tickerText = `${musicPaused ? "PAUSED" : "NOW PLAYING"}: ${tickerSong} ✦   `;

  return (
    <main
      ref={mainRef}
      style={{
        minHeight: "100dvh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        position: "relative",
        overflow: "hidden",
        padding: "20px",
        boxSizing: "border-box",
        isolation: "isolate",
        // iPod screen colour for the picked background mode (used by the screen, loading bar and lights)
        "--screen": BG_MODES[bgMode].screen,
        "--screen-rgb": BG_MODES[bgMode].screenRgb,
        // glow colour of the handheld (PSP) for its picked background mode
        "--hh-glow": HH_BG_MODES[hhBgMode].glow,
      } as React.CSSProperties}
    >
      {/* The background picture, on its own layer so it can wiggle and shake */}
      <div
        className="bg-shake"
        aria-hidden="true"
        style={{
          backgroundImage: BG_MODES[bgMode].sources.map((src) => `url('${src}')`).join(", "),
          backgroundPosition: `center ${BG_MODES[bgMode].focus * 100}%`,
        }}
      >
        <LiquidBg sources={BG_MODES[bgMode].sources} beat={beatRef} active={!handheld} focus={BG_MODES[bgMode].focus} />
      </div>

      {/* BASS QUAKE slider on the iPod view too (bottom left) */}
      {!handheld && (
        <div className={`quake quake-page ${pixelFont.className}`}>
          <span className="quake-dude quake-dude-trippy" aria-hidden="true" />
          <div className="quake-main">
            <label className="quake-title" htmlFor="quake-ipod">
              BASS QUAKE <span className="quake-num">{quake === 0 ? "OFF" : quake}</span>
            </label>
            <input
              id="quake-ipod"
              type="range"
              min={0}
              max={10}
              step={1}
              value={quake}
              aria-label="How hard the screen border shakes on the 808s"
              className="quake-slider"
              style={{ "--fill": `${quake * 10}%` } as React.CSSProperties}
              onChange={(e) => changeQuake(Number(e.target.value))}
              onPointerUp={(e) => e.currentTarget.blur()}
              onTouchEnd={(e) => e.currentTarget.blur()}
            />
          </div>
          <span className="quake-dude quake-dude-chill" aria-hidden="true" />
        </div>
      )}

      {/* SEO: "I'm a musician" label for Google (invisible) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />

      {/* SEO: text and links for search engines and screen readers (visually hidden) */}
      <div className="sr-only">
        <h1>PINKMANE</h1>
        <p>
          PINKMANE is an artist and producer who codes and makes music in their
          free time. Cloud rap and trap, made mostly with Serum 2. Releases include TOPSHELF.
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

      {/* iPod column: background mode buttons on top, the iPod, then the keys you can use */}
      <div className="ipod-col">
      <div className={`bg-modes ${pixelFont.className}`} role="group" aria-label="Background mode">
        {BG_MODES.map((m, i) => (
          <button
            key={m.label}
            className={`bg-mode-btn ${bgMode === i ? "bg-mode-on" : ""}`}
            onClick={() => pickBgMode(i)}
            onMouseDown={noFocus}
            aria-pressed={bgMode === i}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div
        className={`ipod-shell ${!playing && !musicPaused && !isMuted ? "beat-thump" : ""}`}
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
          <VuBars active={!isMuted && !musicPaused} />
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
          <button
            onClick={toggleMute}
            onMouseDown={noFocus}
            aria-label={isMuted ? "Unmute music" : "Mute music"}
            className="mute-btn"
          >
            <SpeakerIcon muted={isMuted} />
          </button>
        </div>

        <div
          className={pixelFont.className}
          style={{
            background: "var(--screen, #d7efbc)",
            transition: "background 0.4s ease",
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
                  {menu === "games" && item !== "Back" ? (
                    <span style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: "10px" }}>
                      <span style={{ whiteSpace: "nowrap" }}>
                        {selected === index ? "> " : ""}
                        {isMane ? "✦ " : ""}
                        {item}
                        {isMane ? " ✦" : ""}
                      </span>
                      {/* [ MAIN GAME ] for Super Pinkmane, [mini game] for all the others */}
                      <span style={{ fontSize: "0.55em", opacity: 0.85, whiteSpace: "nowrap" }}>
                        {isMane ? "[ MAIN GAME ]" : "[mini game]"}
                      </span>
                    </span>
                  ) : (
                    <>
                      {selected === index ? "> " : ""}
                      {isMane ? "✦ " : ""}
                      {item}
                      {isMane ? " ✦" : ""}
                    </>
                  )}

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

          {/* Now-playing ticker: click it to open that song on SoundCloud */}
          <a
            className="ticker-wrap"
            href={trackLink(TRACKS[trackIndex])}
            target="_blank"
            rel="noopener noreferrer"
            onMouseDown={noFocus}
            onClick={(e) => e.currentTarget.blur()}
            aria-label={`Listen to ${TRACKS[trackIndex].title} on SoundCloud`}
            title="Listen on SoundCloud"
          >
            <div
              className="ticker-track"
              style={{ animationDuration: `${Math.max(8, tickerText.length * 0.28)}s` }}
            >
              <span>{tickerText}</span>
              <span>{tickerText}</span>
            </div>
          </a>
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
            className={`click-wheel ${!isMuted && !musicPaused ? "wheel-led-pulse" : ""}`}
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
              aria-label={musicPaused ? "Play music" : "Pause music"}
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
              {musicPaused ? <PlayIcon /> : <PauseIcon />}
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

        {/* Grey hint text on the iPod: only on phones/tablets now (computers get the white key legend instead) */}
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
        </div>
      </div>

      {/* Keys you can use, drawn as white key outlines like under the handheld (only on computers) */}
      <div className={`hh-keys ipod-keys ${pixelFont.className}`}>
        {(!playing
          ? [
              [["↑", "↓", "W", "S"], "move"],
              [["ENTER"], "ok"],
              [["MOUSE WHEEL"], "scroll"],
              [["BACKSPACE"], "back"],
              [["←", "→"], "songs"],
            ]
          : activeGame === "hex"
          ? [
              [["←", "→", "A", "D"], "move"],
              [["SPACE"], "start"],
              [["M"], "mute"],
              [["BACKSPACE"], "exit"],
            ]
          : activeGame === "bird"
          ? [
              [["SPACE", "↑"], "flap"],
              [["M"], "mute"],
              [["BACKSPACE"], "exit"],
            ]
          : activeGame === "snake"
          ? [
              [["↑", "↓", "←", "→"], "steer"],
              [["SPACE"], "start"],
              [["BACKSPACE"], "exit"],
            ]
          : activeGame === "vortex"
          ? [
              [["MOUSE WHEEL", "↑", "↓"], "spin"],
              [["SPACE"], "launch"],
              [["BACKSPACE"], "exit"],
            ]
          : [
              [["SPACE"], "jump"],
              [["←", "→"], "songs"],
              [["BACKSPACE"], "exit"],
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
      </div>

      {/* PHONES + TABLETS: the game fills the screen, with big see-through thumb buttons on top */}
      {handheld && isTouch && (
        <div className={`tp-overlay ${pixelFont.className}`} onContextMenu={(e) => e.preventDefault()}>
          {/* Background picture (still, to save battery) */}
          <div
            className="hh-bg"
            aria-hidden="true"
            style={{
              backgroundImage: HH_BG_MODES[hhBgMode].sources.map((src) => `url('${src}')`).join(", "),
              backgroundPosition: `center ${HH_BG_MODES[hhBgMode].focus * 100}%`,
            }}
          />

          {/* The game */}
          <div className="tp-screen">
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
                <span>{osd.kind === "vol" ? `VOL ${Math.round(osd.value * 10)}` : osd.text}</span>
              </div>
            )}
            <div className="crt-overlay" />
          </div>

          {/* Small buttons, top left: leave the game, pause */}
          <div className="tp-corner tp-corner-l">
            <button className="tp-small" onClick={goBack} aria-label="Leave the game">
              EXIT
            </button>
            {activeGame === "super" && (
              <button className="tp-small" onClick={() => tapKey("Escape")} aria-label="Pause">
                PAUSE
              </button>
            )}
          </div>

          {/* Small buttons, top right: your music */}
          <div className="tp-corner tp-corner-r">
            <button className="tp-small" onClick={hhPlay} aria-label="Play or pause music">
              <PixelIcon name={musicPaused ? "play" : "pause"} />
            </button>
            <button className="tp-small" onClick={() => hhSong(1)} aria-label="Next song">
              <PixelIcon name="next" />
            </button>
            <button className="tp-small" onClick={hhMute} aria-label={isMuted ? "Unmute music" : "Mute music"}>
              <PixelIcon name={isMuted ? "muted" : "sound"} />
            </button>
          </div>

          {/* Left thumb: one round pad. Touch it and slide, no need to lift your thumb to change direction */}
          <div
            className={`tp-dpad ${activeGame === "super" ? "tp-dpad-walk" : ""}`}
            role="group"
            aria-label="Direction pad"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              tpMove(e);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) tpMove(e);
            }}
            onPointerUp={() => tpSet(null)}
            onPointerCancel={() => tpSet(null)}
            onLostPointerCapture={() => tpSet(null)}
          >
            {(["up", "down", "left", "right"] as const).map((d) => (
              <span key={d} className={`tp-arrow tp-arrow-${d} ${padDir === TP_KEYS[d] ? "tp-on" : ""}`}>
                <DpadArrow dir={d} />
              </span>
            ))}
          </div>

          {/* Right thumb: A = jump (hold it to fly with the jetpack) / OK in the menus, B = shoot or go down a pipe */}
          {activeGame === "super" && (
            <button
              className={`tp-btn tp-b ${tpBOn ? "tp-on" : ""}`}
              aria-label="Shoot, or go down a pipe"
              onPointerDown={(e) => {
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                tpB(true);
              }}
              onPointerUp={() => tpB(false)}
              onPointerCancel={() => tpB(false)}
              onLostPointerCapture={() => tpB(false)}
            >
              <span>B</span>
              <small>FIRE</small>
            </button>
          )}
          <button
            className={`tp-btn tp-a ${tpAOn ? "tp-on" : ""}`}
            aria-label={activeGame === "super" ? "Jump" : "Start"}
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              tpA(true);
            }}
            onPointerUp={() => tpA(false)}
            onPointerCancel={() => tpA(false)}
            onLostPointerCapture={() => tpA(false)}
          >
            <span>A</span>
            <small>{activeGame === "super" ? "JUMP" : "START"}</small>
          </button>

          <div className="tp-rotate">TURN YOUR PHONE SIDEWAYS FOR A BIGGER SCREEN</div>
        </div>
      )}

      {/* The PINKMANE handheld: a wide screen for Pink Maze and Super Pinkmane */}
      {handheld && !isTouch && (
        <div className={`hh-overlay ${twitchMode ? "hh-twitch-on" : ""}`}>
          {/* Background picture: wiggles, and its border shakes on the 808s */}
          <div
            className="hh-bg"
            aria-hidden="true"
            style={{
              backgroundImage: HH_BG_MODES[hhBgMode].sources.map((src) => `url('${src}')`).join(", "),
              backgroundPosition: `center ${HH_BG_MODES[hhBgMode].focus * 100}%`,
            }}
          >
            <LiquidBg sources={HH_BG_MODES[hhBgMode].sources} beat={beatRef} active focus={HH_BG_MODES[hhBgMode].focus} />
          </div>

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

          {/* Background mode buttons for the handheld view */}
          <div className={`bg-modes hh-bg-modes ${pixelFont.className}`} role="group" aria-label="Background mode">
            {HH_BG_MODES.map((m, i) => (
              <button
                key={m.label}
                className={`bg-mode-btn ${hhBgMode === i ? "bg-mode-on" : ""}`}
                onClick={() => pickHhBgMode(i)}
                onMouseDown={noFocus}
                aria-pressed={hhBgMode === i}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* BASS QUAKE: how hard the screen border shakes on the 808s (above the handheld) */}
          <div className={`quake quake-top ${pixelFont.className}`}>
            <span className="quake-dude quake-dude-trippy" aria-hidden="true" />
            <div className="quake-main">
              <label className="quake-title" htmlFor="quake-hh">
                BASS QUAKE <span className="quake-num">{quake === 0 ? "OFF" : quake}</span>
              </label>
              <input
                id="quake-hh"
                type="range"
                min={0}
                max={10}
                step={1}
                value={quake}
                aria-label="How hard the screen border shakes on the 808s"
                className="quake-slider"
                style={{ "--fill": `${quake * 10}%` } as React.CSSProperties}
                onChange={(e) => changeQuake(Number(e.target.value))}
                onPointerUp={(e) => e.currentTarget.blur()}
                onTouchEnd={(e) => e.currentTarget.blur()}
              />
            </div>
            <span className="quake-dude quake-dude-chill" aria-hidden="true" />
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
            <div className={`hh-led2 ${!musicPaused && !isMuted ? "hh-led-on" : ""}`} style={hhBox(2, 24, 2, 24)} />

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
              <PixelIcon name={musicPaused ? "play" : "pause"} />
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

          {/* TWITCH MODE (localhost only): rate the song you're listening to */}
          {twitchMode && (
            <div className={`twitch-panel ${pixelFont.className}`}>
              <div className="twitch-slider">
                <label className="quake-title" htmlFor="tw-mix">
                  MIX <span className="quake-num">{twMix}%</span>
                </label>
                <input
                  id="tw-mix"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={twMix}
                  aria-label="Mix rating"
                  className="quake-slider"
                  style={{ "--fill": `${twMix}%` } as React.CSSProperties}
                  onChange={(e) => setTwMix(Number(e.target.value))}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                />
              </div>
              <div className="twitch-slider">
                <label className="quake-title" htmlFor="tw-vibe">
                  OVERALL VIBE <span className="quake-num">{twVibe}%</span>
                </label>
                <input
                  id="tw-vibe"
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={twVibe}
                  aria-label="Overall vibe rating"
                  className="quake-slider"
                  style={{ "--fill": `${twVibe}%` } as React.CSSProperties}
                  onChange={(e) => setTwVibe(Number(e.target.value))}
                  onPointerUp={(e) => e.currentTarget.blur()}
                  onTouchEnd={(e) => e.currentTarget.blur()}
                />
              </div>
              <div className="twitch-replay">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={twReplay}
                  className={`twitch-box ${twReplay ? "twitch-box-on" : ""}`}
                  onClick={() => setTwReplay((v) => !v)}
                  onMouseDown={noFocus}
                >
                  {twReplay ? "✔" : ""}
                </button>
                <span className="twitch-replay-text">REPLAY-ABLE?</span>
                {twReplay && <span className="twitch-verified">VERIFIED</span>}
              </div>
              <button
                type="button"
                className="twitch-reset"
                onClick={() => {
                  setTwMix(0);
                  setTwVibe(0);
                  setTwReplay(false);
                }}
                onMouseDown={noFocus}
              >
                NEXT SONG
              </button>
            </div>
          )}

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
          <div className="hh-keys-wrap">
          {keyTip && (
            <div className={`key-tip ${pixelFont.className}`} aria-hidden="true">
              <span className="key-tip-text">CONTROL W THESE!</span>
              <span className="key-tip-arrows">
                <span>▼</span>
                <span>▼</span>
                <span>▼</span>
              </span>
            </div>
          )}
          <div className={`hh-keys ${pixelFont.className}`}>
            {(activeGame === "super"
              ? [
                  [["A", "D", "←", "→"], "walk"],
                  [["W", "↑", "SPACE"], "jump"],
                  [["S", "↓"], "shoot / pipe"],
                  [["M"], "sounds"],
                  [["ESC"], "pause"],
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

        /* PHONES: holding a finger on a button used to pop up "Copy" and select its text.
           Nothing on the site can be selected any more (boxes you type in still work),
           no grey flash when you tap, and no zooming in by double-tapping. */
        main {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        main input,
        main textarea {
          -webkit-user-select: text;
          user-select: text;
        }

        /* ---------- PHONES + TABLETS: full-screen game with thumb buttons ----------
           Sideways: the game fills the screen, buttons sit see-through on top of its corners.
           Upright: the game is across the top, buttons underneath.
           Sizes you might want to change are marked SIZE. */
        .tp-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          overflow: hidden;
          background: #000;
          touch-action: none;
          overscroll-behavior: none;
          animation: hhFadeIn 0.25s ease-out;
        }
        .tp-screen {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          /* as big as fits, leaving a thin strip each side for the small buttons */
          height: min(100vh, calc((100vw - 116px) * 30 / 64));
          height: min(100dvh, calc((100vw - 116px) * 30 / 64));
          width: min(calc(100vh * 64 / 30), calc(100vw - 116px));
          width: min(calc(100dvh * 64 / 30), calc(100vw - 116px));
          background: #242842;
          overflow: hidden;
        }
        .tp-corner {
          position: absolute;
          top: max(6px, env(safe-area-inset-top));
          z-index: 3;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tp-corner-l {
          left: max(6px, env(safe-area-inset-left));
        }
        .tp-corner-r {
          right: max(6px, env(safe-area-inset-right));
          align-items: flex-end;
        }
        .tp-small {
          min-width: 46px;
          height: 32px;
          padding: 0 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
          font-size: 7px;
          color: #fff;
          background: rgba(17, 17, 17, 0.6);
          border: 2px solid rgba(255, 255, 255, 0.75);
          border-radius: 0;
          touch-action: manipulation;
        }
        .tp-small:active {
          background: #d63cc8;
        }
        /* The round pad, bottom left */
        .tp-dpad {
          position: absolute;
          left: max(10px, env(safe-area-inset-left));
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(38vh, 144px); /* SIZE of the round pad (sideways) */
          aspect-ratio: 1;
          z-index: 3;
          border-radius: 50%;
          background: rgba(17, 17, 17, 0.32);
          border: 2px solid rgba(255, 255, 255, 0.55);
          touch-action: none;
        }
        .tp-arrow {
          position: absolute;
          width: 34%;
          height: 34%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.85);
          pointer-events: none;
        }
        .tp-arrow-up {
          left: 33%;
          top: 3%;
        }
        .tp-arrow-down {
          left: 33%;
          bottom: 3%;
        }
        .tp-arrow-left {
          left: 3%;
          top: 33%;
        }
        .tp-arrow-right {
          right: 3%;
          top: 33%;
        }
        .tp-arrow .hh-arrow {
          width: 80%;
          height: 80%;
        }
        /* Super Pinkmane: left / right are the main ones, up / down are small */
        .tp-dpad-walk .tp-arrow-up,
        .tp-dpad-walk .tp-arrow-down {
          opacity: 0.5;
          scale: 0.6;
        }
        .tp-arrow.tp-on {
          color: #ff8ff0;
          opacity: 1;
        }
        /* A and B, bottom right */
        .tp-btn {
          position: absolute;
          z-index: 3;
          aspect-ratio: 1;
          padding: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          font-family: inherit;
          font-size: 16px;
          color: #fff;
          text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.6);
          border: 2px solid rgba(255, 255, 255, 0.65);
          border-radius: 50%;
          touch-action: none;
        }
        .tp-btn small {
          font-size: 7px;
        }
        .tp-a {
          right: max(10px, env(safe-area-inset-right));
          bottom: max(12px, env(safe-area-inset-bottom));
          width: min(26vh, 96px); /* SIZE of the A button (sideways) */
          background: rgba(214, 60, 200, 0.45);
        }
        .tp-b {
          right: calc(max(10px, env(safe-area-inset-right)) + min(15vh, 56px));
          bottom: calc(max(12px, env(safe-area-inset-bottom)) + min(27vh, 100px));
          width: min(19vh, 70px); /* SIZE of the B button (sideways) */
          font-size: 13px;
          background: rgba(138, 31, 134, 0.45);
        }
        .tp-btn.tp-on {
          background: rgba(255, 143, 240, 0.9);
          scale: 0.94;
        }
        .tp-rotate {
          display: none;
        }
        /* Upright phones: game across the top, small buttons in a row above it, thumb buttons at the bottom */
        @media (orientation: portrait) {
          .tp-screen {
            top: calc(max(6px, env(safe-area-inset-top)) + 40px);
            transform: translateX(-50%);
            width: 100vw;
            height: calc(100vw * 30 / 64);
          }
          .tp-corner {
            flex-direction: row;
          }
          .tp-dpad {
            left: 14px;
            bottom: max(30px, env(safe-area-inset-bottom));
            width: min(44vw, 180px); /* SIZE of the round pad (upright) */
          }
          .tp-a {
            right: 14px;
            bottom: max(30px, env(safe-area-inset-bottom));
            width: min(27vw, 108px); /* SIZE of the A button (upright) */
          }
          .tp-b {
            right: calc(14px + min(21vw, 84px));
            bottom: calc(max(30px, env(safe-area-inset-bottom)) + min(24vw, 96px));
            width: min(20vw, 78px); /* SIZE of the B button (upright) */
          }
          .tp-rotate {
            display: block;
            position: absolute;
            left: 10px;
            right: 10px;
            top: calc(max(6px, env(safe-area-inset-top)) + 40px + 100vw * 30 / 64 + 14px);
            text-align: center;
            font-size: 7px;
            line-height: 1.7;
            color: #fff;
            text-shadow: 1px 1px 0 #000;
          }
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
          color: var(--screen, #d7efbc);
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
          background: var(--screen, #d7efbc);
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

        /* Computers: the white key legend under the iPod explains the controls, so hide the grey text */
        @media (hover: hover) and (pointer: fine) {
          .controls-hint {
            display: none;
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
          animation: hhFadeIn 0.25s ease-out;
        }

        /* Your handheld background: public/handheld-bg.png (or .jpg). Until it's there, the normal one shows.
           It sits on its own layer so it can wiggle and shake. */
        .hh-bg {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background-image: url("/handheld-bg.png"), url("/handheld-bg.jpg"), url("/topshelf.png");
          background-size: cover;
          background-position: center;
        }

        /* The wiggling background drawn on top of the still picture (fades in once it's ready) */
        .liquid-bg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          opacity: 0;
          transition: opacity 0.6s ease;
        }
        .liquid-bg.liquid-on {
          opacity: 1;
        }
        .liquid-canvas {
          display: block;
          width: 100%;
          height: 100%;
        }

        /* BASS QUAKE slider, bottom left, with a PINKMANE on each side */
        .quake {
          position: absolute;
          left: clamp(12px, 2.5vw, 32px);
          bottom: clamp(12px, 2.5vh, 28px);
          z-index: 3;
          display: flex;
          align-items: flex-end;
          gap: 10px;
          color: #fff;
          text-shadow: 2px 2px 0 #000;
        }
        .quake-main {
          display: flex;
          flex-direction: column;
          gap: 8px;
          width: clamp(150px, 16vw, 230px);
        }
        /* The little PINKMANEs: as tall as the BASS QUAKE title + slider.
           The sprite sheets have 3 frames side by side; the 3rd one is standing with the joint. */
        .quake-dude {
          flex: none;
          height: 40px;
          width: 27px;
          background-image: url("/game/pinkdude.png");
          background-size: 300% 100%;
          background-position: right;
          background-repeat: no-repeat;
          image-rendering: pixelated;
          filter: drop-shadow(2px 2px 0 #000);
        }
        /* Left one: TRIPPY PINKMANE (the outfit from Super Pinkmane) */
        .quake-dude-trippy {
          background-image: url("/game/pinkdude-pinkfit.png");
        }
        /* Smoke from the joint: a new puff on every beat, rising until the next one.
           If the smoke doesn't start at the joint, move it with --smoke-x / --smoke-y
           (how far across / down the little PINKMANE it starts). */
        .quake-dude {
          position: relative;
          --smoke-x: 78%;
          --smoke-y: 36%;
        }
        .quake-dude::before,
        .quake-dude::after {
          content: "";
          position: absolute;
          left: var(--smoke-x);
          top: var(--smoke-y);
          width: 3px;
          height: 3px;
          background: #e8e0ee;
          pointer-events: none;
        }
        .quake-dude::before {
          translate: calc(var(--phase, 0) * 3px) calc(var(--phase, 0) * -18px);
          scale: calc(1 + var(--phase, 0) * 0.8);
          opacity: calc(0.9 - var(--phase, 0) * 0.9);
        }
        .quake-dude::after {
          translate: calc(var(--phase2, 0) * -2px) calc(var(--phase2, 0) * -18px);
          scale: calc(0.7 + var(--phase2, 0) * 0.8);
          opacity: calc(0.6 - var(--phase2, 0) * 0.6);
        }
        /* Right one: chilling, turned to face the slider */
        .quake-dude-chill {
          scale: -1 1;
        }
        .quake-title {
          display: flex;
          justify-content: space-between;
          font-size: 9px;
          letter-spacing: 1px;
        }
        .quake-num {
          color: #ff8ff0;
        }
        .quake-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 14px;
          margin: 0;
          cursor: pointer;
          border: 2px solid #111;
          background: linear-gradient(90deg, #d63cc8 var(--fill, 50%), rgba(0, 0, 0, 0.45) var(--fill, 50%));
          box-shadow: 0 3px 0 #111;
        }
        .quake-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 24px;
          background: #fff;
          border: 2px solid #111;
          box-shadow: inset -3px -3px 0 #c7bdd1;
        }
        .quake-slider::-moz-range-thumb {
          width: 14px;
          height: 22px;
          border-radius: 0;
          background: #fff;
          border: 2px solid #111;
          box-shadow: inset -3px -3px 0 #c7bdd1;
        }
        .quake-slider:focus-visible {
          outline: 2px solid #ff8ff0;
          outline-offset: 3px;
        }
        /* On the handheld: centred above the device */
        .quake-top {
          position: relative;
          left: auto;
          bottom: auto;
        }
        .quake-top .quake-main {
          width: clamp(180px, 22vw, 280px);
        }
        /* Upright phones: sit in the page flow instead of in the corner */
        @media (orientation: portrait) {
          .quake {
            position: relative;
            left: auto;
            bottom: auto;
          }
          .quake .quake-main,
          .quake-top .quake-main {
            width: min(58vw, 240px);
          }
          .quake-page {
            display: none;
          }
        }

        /* iPod column: mode buttons, iPod, key legend stacked */
        .ipod-col {
          position: relative;
          z-index: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        /* The 3 pixel BACKGROUND MODE buttons above the iPod */
        .bg-modes {
          display: flex;
          gap: 10px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .bg-mode-btn {
          font-family: inherit;
          font-size: 9px;
          padding: 7px 10px;
          color: #fff;
          background: rgba(0, 0, 0, 0.45);
          border: 2px solid #fff;
          border-radius: 0;
          box-shadow: 0 3px 0 #fff;
          text-shadow: 1px 1px 0 #000;
          cursor: pointer;
          image-rendering: pixelated;
        }
        .bg-mode-btn:hover {
          background: rgba(214, 60, 200, 0.5);
        }
        .bg-mode-btn:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 #fff;
        }
        .bg-mode-on {
          background: #d63cc8;
          border-color: #fff;
        }
        .bg-mode-btn:focus-visible {
          outline: 2px solid #ff8ff0;
          outline-offset: 3px;
        }
        /* Mode buttons on the handheld view sit above everything else in the overlay */
        .hh-bg-modes {
          position: relative;
          z-index: 1;
        }
        /* The key legend under the iPod */
        .ipod-keys {
          max-width: min(560px, 96vw);
        }

        /* CONTROL W THESE! arrows pointing at the keys (Super Pinkmane, first 5 seconds) */
        .hh-keys-wrap {
          position: relative;
          z-index: 2;
          display: flex;
          justify-content: center;
        }
        .key-tip {
          position: absolute;
          bottom: 100%;
          left: 50%;
          transform: translateX(-50%);
          margin-bottom: 4px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          pointer-events: none;
          white-space: nowrap;
          animation: keyTipIn 0.3s ease-out;
        }
        .key-tip-text {
          font-size: 11px;
          padding: 4px 8px;
          border: 2px solid #000;
          animation: keyTipBlink 0.25s steps(1) infinite;
        }
        .key-tip-arrows {
          display: flex;
          gap: 60px;
          font-size: 18px;
          color: #fff;
          text-shadow: 2px 2px 0 #000;
          animation: keyTipBounce 0.5s ease-in-out infinite alternate;
        }
        @keyframes keyTipBlink {
          0% {
            background: #d63cc8;
            color: #fff;
          }
          50% {
            background: #fff;
            color: #d63cc8;
          }
        }
        @keyframes keyTipBounce {
          from {
            transform: translateY(0);
          }
          to {
            transform: translateY(6px);
          }
        }
        @keyframes keyTipIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        /* Touch screens have no key legend, so no arrows either */
        @media (hover: none) {
          .key-tip {
            display: none;
          }
        }

        /* The main background picture (wiggles, border shakes on the 808s) */
        .bg-shake {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
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

        @keyframes hhJetBob {
          from {
            translate: 0 -10px;
          }
          to {
            translate: 0 10px;
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
          width: min(96vw, 1300px, calc((100dvh - 170px) * 2.41));
          aspect-ratio: 94 / 39;
          filter: drop-shadow(0 12px 0 rgba(0, 0, 0, 0.3)) drop-shadow(0 0 24px rgba(var(--hh-glow, 214, 60, 200), 0.55));
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
          box-shadow: 0 0 calc(var(--kick, 0) * 14px) calc(var(--kick, 0) * 4px) rgba(var(--hh-glow, 215, 239, 188), calc(var(--kick, 0) * 0.55));
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
        /* TWITCH MODE panel under the handheld (localhost only). The handheld gets a bit smaller to make room. */
        .hh-twitch-on .hh-device {
          width: min(96vw, 1300px, calc((100dvh - 250px) * 2.41));
        }
        .twitch-panel {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: center;
          gap: 12px 26px;
          padding: 10px 16px 12px;
          color: #fff;
          text-shadow: 2px 2px 0 #000;
          background: rgba(0, 0, 0, 0.45);
          border: 2px solid #fff;
          box-shadow: 0 3px 0 #fff;
        }
        .twitch-slider {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: clamp(160px, 22vw, 260px);
        }
        .twitch-replay {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 9px;
          padding-bottom: 2px;
        }
        .twitch-box {
          width: 22px;
          height: 22px;
          padding: 0;
          font-family: inherit;
          font-size: 14px;
          line-height: 1;
          color: #fff;
          background: rgba(0, 0, 0, 0.45);
          border: 2px solid #fff;
          box-shadow: 0 2px 0 #fff;
          cursor: pointer;
        }
        .twitch-box-on {
          background: #1fae4b;
        }
        .twitch-verified {
          color: #5dff8a;
          text-shadow: 1px 1px 0 #000, 0 0 8px rgba(93, 255, 138, 0.8);
        }
        .twitch-reset {
          font-family: inherit;
          font-size: 8px;
          padding: 6px 8px;
          color: #fff;
          background: rgba(214, 60, 200, 0.5);
          border: 2px solid #fff;
          box-shadow: 0 3px 0 #fff;
          cursor: pointer;
        }
        .twitch-reset:active {
          transform: translateY(2px);
          box-shadow: 0 1px 0 #fff;
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
          background-size: 300% 100%;
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
          box-shadow: 0 0 calc(var(--kick, 0) * 14px) calc(var(--kick, 0) * 4px) rgba(var(--hh-glow, 215, 239, 188), calc(var(--kick, 0) * 0.55));
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

        /* the little bars jump with the kick and the hi-hats */
        .vu-active.vu-bar-0 {
          height: calc(3px + var(--kick, 0) * 9px);
        }
        .vu-active.vu-bar-1 {
          height: calc(3px + var(--hat, 0) * 7px);
        }
        .vu-active.vu-bar-2 {
          height: calc(3px + var(--kick, 0) * 5px + var(--hat, 0) * 4px);
        }
        .vu-active.vu-bar-3 {
          height: calc(3px + var(--kick, 0) * 7px + var(--hat, 0) * 2px);
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
          display: block;
          overflow: hidden;
          white-space: nowrap;
          background: rgba(0, 0, 0, 0.06);
          border-top: 1px solid rgba(0, 0, 0, 0.15);
          padding: 4px 0;
          flex-shrink: 0;
          text-decoration: none;
          cursor: pointer;
          position: relative;
          z-index: 3; /* above the scanline overlay so it can be clicked */
          transition: background 0.15s ease;
        }
        .ticker-wrap:hover {
          background: rgba(214, 60, 200, 0.18);
        }
        .ticker-wrap:hover .ticker-track span {
          text-decoration: underline;
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
          opacity: calc(0.55 + var(--kick, 0) * 0.45);
        }

        /* Click wheel LED pulse, synced to the beat */
        .wheel-led-pulse {
          box-shadow: 0 0 calc(var(--kick, 0) * 14px) calc(var(--kick, 0) * 4px) rgba(var(--screen-rgb, 215, 239, 188), calc(var(--kick, 0) * 0.55));
        }

        /* The iPod gives a tiny speaker-thump on every beat (only in the menus, not during games)
           Bigger number = bigger pulse (was 0.008) */
        .beat-thump {
          scale: calc(1 + var(--kick, 0) * 0.004);
        }
      `}</style>
    </main>
  );
}
