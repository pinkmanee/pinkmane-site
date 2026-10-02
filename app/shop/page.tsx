"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Press_Start_2P } from "next/font/google";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

// ---------- Background (same as the main page): 3 modes + the wiggle ----------
// The mode you pick here is the same one the main page uses (they share the saved choice).
// The shaking border around the screen: how thick it is (in screen pixels, ~57 = about 1.5 cm)
const EDGE_BAND_PX = 57;
// How far the border shakes on an 808 at level 10 (in screen pixels)
const EDGE_MAX_SHAKE_PX = 10;
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
  { label: "MODE 1", sources: ["/bg/mode1.png", "/shop-bg.png"], focus: 0.15, screen: "#f6d3ee", screenRgb: "246, 211, 238" },
  { label: "MODE 2", sources: ["/bg/mode2.png", "/shop-bg.png"], focus: 0.15, screen: "#d7efbc", screenRgb: "215, 239, 188" },
  { label: "MODE 3", sources: ["/bg/mode3.png", "/shop-bg.png"], focus: 0.15, screen: "#f8d0ca", screenRgb: "248, 208, 202" },
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

// The keys you can use, drawn under the handheld (only on computers), same as the main page
const KEY_LEGEND: [string[], string][] = [
  [["↑", "↓", "W", "S"], "move"],
  [["ENTER"], "ok"],
  [["MOUSE WHEEL"], "scroll"],
  [["BACKSPACE"], "back"],
];

export default function Shop() {
  const router = useRouter();
  const [menu, setMenu] = useState<MenuKey>("main");
  const [selected, setSelected] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // PHONES + TABLETS: on a touch screen you can tap a row on the screen to open it (same as on the iPod page).
  // On a computer the screen doesn't react to clicks. To try it on your computer: http://localhost:3000/shop?touch=1
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).get("touch") !== null;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsTouch(forced || mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  const [showBoot, setShowBoot] = useState(true);
  const [bootFadeOut, setBootFadeOut] = useState(false);
  const [exiting, setExiting] = useState(false);

  // Which background mode is picked (0, 1 or 2), remembered (shared with the main page)
  const [bgMode, setBgMode] = useState(0);
  // The shop has no 808s to shake to, so only the wiggle shows (all beat values stay at 0)
  const beatRef = useRef<BeatState>({ kick: 0, sway: 0, bass: 0, quake: 0 });

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

  // pick = which row to open (when a row is tapped on a phone). Without it: the highlighted row.
  const selectItem = (pick?: unknown) => {
    if (activeCategory) return; // already on a placeholder screen
    playSelectSound();
    const item = items[typeof pick === "number" ? pick : selected];

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

  // Clicking a button with the mouse shouldn't "focus" it,
  // otherwise pressing Enter later would press that button again
  const noFocus = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Load the background mode picked last time
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem("pinkmane-bgmode"));
      if (saved >= 0 && saved < BG_MODES.length) setBgMode(saved);
    } catch {}
  }, []);

  const pickBgMode = (i: number) => {
    playSelectSound();
    setBgMode(i);
    try {
      localStorage.setItem("pinkmane-bgmode", String(i));
    } catch {}
  };

  useEffect(() => {
    const fadeTimer = setTimeout(() => setBootFadeOut(true), 1500);
    const removeTimer = setTimeout(() => setShowBoot(false), 1900);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  // Keyboard: same keys as the main page.  ↑ ↓ (or W S) move, ENTER ok, BACKSPACE back, mouse wheel scrolls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") goUp();
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") goDown();
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
      }}
    >
      {/* The background picture, on its own layer so it can wiggle (same as the main page) */}
      <div
        className="bg-shake"
        aria-hidden="true"
        style={{
          backgroundImage: BG_MODES[bgMode].sources.map((src) => `url('${src}')`).join(", "),
          backgroundPosition: `center ${BG_MODES[bgMode].focus * 100}%`,
        }}
      >
        <LiquidBg sources={BG_MODES[bgMode].sources} beat={beatRef} active={true} focus={BG_MODES[bgMode].focus} />
      </div>

      {/* Column: the 3 background mode buttons, the handheld, then the keys you can use */}
      <div className="shop-col">
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
            onMouseDown={noFocus}
            aria-label={isMuted ? "Unmute music" : "Mute music"}
            className="psp-mute-btn"
          >
            <SpeakerIcon muted={isMuted} />
          </button>

          <div
            className={`${pixelFont.className} psp-screen`}
            style={{
              background: "#0d0d10",
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
                    onClick={
                      isTouch
                        ? () => {
                            setSelected(index);
                            selectItem(index);
                          }
                        : undefined
                    }
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
                onMouseDown={noFocus}
                aria-label="Up"
              >
                <ArrowIcon direction="up" />
              </button>
              <button
                className="psp-dpad-btn psp-dpad-left"
                onClick={goBack}
                onMouseDown={noFocus}
                aria-label="Back"
              >
                <ArrowIcon direction="left" />
              </button>
              <div className="psp-dpad-center" />
              <button
                className="psp-dpad-btn psp-dpad-right"
                onClick={selectItem}
                onMouseDown={noFocus}
                aria-label="Select"
              >
                <ArrowIcon direction="right" />
              </button>
              <button
                className="psp-dpad-btn psp-dpad-down"
                onClick={goDown}
                onMouseDown={noFocus}
                aria-label="Down"
              >
                <ArrowIcon direction="down" />
              </button>
            </div>

            <div className="psp-face-buttons">
              <button
                className={`${pixelFont.className} psp-face-btn psp-btn-x`}
                onClick={selectItem}
                onMouseDown={noFocus}
              >
                X
              </button>
              <button
                className={`${pixelFont.className} psp-face-btn psp-btn-o`}
                onClick={goBack}
                onMouseDown={noFocus}
              >
                O
              </button>
            </div>
          </div>

          {/* Touch screens: a text hint (computers get the key legend under the handheld instead) */}
          <div className={`${pixelFont.className} psp-hint`}>
            <span className="hint-touch">use the D-pad or X / O</span>
          </div>
        </div>

        {/* Keys you can use, drawn as white key outlines (only on computers) */}
        <div className={`hh-keys ${pixelFont.className}`}>
          {KEY_LEGEND.map(([keys, label]) => (
            <span className="hh-keygroup" key={label}>
              {keys.map((k) => (
                <span className="hh-key" key={k}>
                  {k}
                </span>
              ))}
              <span className="hh-keylabel">{label}</span>
            </span>
          ))}
        </div>
      </div>

      <style jsx global>{`
        /* PHONES: holding a finger on a button used to pop up "Copy" and select its text.
           Nothing on the page can be selected any more, no grey flash when you tap,
           and no zooming in by double-tapping. (Same as the iPod page.) */
        main {
          -webkit-user-select: none;
          user-select: none;
          -webkit-touch-callout: none;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }

        /* The handheld's screen. On phones it's a bit taller, so all five rows have room. */
        .psp-screen {
          aspect-ratio: 560 / 340;
        }
        @media (max-width: 480px) {
          .psp-screen {
            aspect-ratio: 560 / 420;
          }
        }

        .shop-col {
          position: relative;
          z-index: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }

        /* The main background picture (the wiggling one is drawn on top of it) */
        .bg-shake {
          position: absolute;
          inset: 0;
          z-index: -1;
          pointer-events: none;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
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

        /* The 3 pixel BACKGROUND MODE buttons above the handheld */
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

        /* Key legend under the handheld */
        .hh-keys {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 8px 18px;
          max-width: min(560px, 96vw);
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
        /* Touch screens: no keyboard, so no key legend */
        @media (hover: none) {
          .hh-keys {
            display: none;
          }
        }

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

        /* The rows share whatever height the screen has, so the last one (Home / Back)
           can never fall off the bottom. On a computer they're as tall as before (41px);
           on a phone they shrink together to fit. */
        .psp-list {
          padding: clamp(10px, 3vw, 16px) clamp(14px, 4vw, 20px);
          flex: 1;
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        .psp-item {
          flex: 1 1 0;
          min-height: 0;
          max-height: 41px;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          padding: 0 10px;
          font-size: clamp(10px, 3vw, 13px);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
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

        /* Computers: the key legend under the handheld explains the controls, so hide the grey text */
        @media (hover: hover) and (pointer: fine) {
          .psp-hint {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
