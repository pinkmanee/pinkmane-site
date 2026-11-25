"use client";

// PINK DIVE: the daily word dive.
// 7 prompts a day (the same for everyone), 25 seconds each. Type an answer: the RARER it is, the DEEPER your pink sub sinks.
// At the end you see how deep you got, how you did against today's other divers, and you can share it.
//
//   the prompts + answers ......... game/dive/prompts.ts   (add your own there)
//   which prompts today, checking . game/dive/daily.ts
//   today's players (live rarity) . app/api/dive/route.ts  (same database as the scoreboards)
//
// The sea behind the cards is drawn on a small canvas (chunky pixels), everything you read and tap is normal page text.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { TIERS, type Prompt } from "../../../game/dive/prompts";
import { BANDS, PER_DAY, SECONDS, bandOf, check, diveNumber, practicePrompts, promptsForDive, type Hit } from "../../../game/dive/daily";
import { buzz } from "../../../game/buzz"; // the phone buzz on a hit (game/buzz.ts)

const PINK = "#ff5fd2";
const INK = "#0b0614";
const SAVE_KEY = "pinkdive-save";
const SOUND_KEY = "pinkmane-dive-sound";
const DEVICE_KEY = "pinkrun-device"; // the same "you" as the scoreboards

type Slot = { answer: string | null; tier: number; depth: number }; // tier -1 = no answer
type Result = { dive: number; slots: Slot[]; total: number; players: number; hist: Record<string, number>; better: number | null; live: boolean; off?: boolean };
type Screen = "intro" | "play" | "results";

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

const metres = (score: number) => `-${(score * 10).toLocaleString("en-US")} m`;

// ---------------------------------------------------------------- sound (tiny beeps made in code)
function useBeeps() {
  const ctxRef = useRef<AudioContext | null>(null);
  const [on, setOn] = useState(true);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(SOUND_KEY) !== "off");
    } catch {}
  }, []);
  const beep = useCallback(
    (from: number, to: number, dur: number, type: OscillatorType = "square", vol = 0.12, delay = 0) => {
      if (!on) return;
      try {
        if (!ctxRef.current) {
          const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return;
          ctxRef.current = new AC();
        }
        const ctx = ctxRef.current;
        if (ctx.state === "suspended") void ctx.resume();
        const t = ctx.currentTime + delay;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(from, t);
        if (to !== from) o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t);
        o.stop(t + dur + 0.05);
      } catch {}
    },
    [on],
  );
  const toggle = () => {
    setOn((v) => {
      try {
        localStorage.setItem(SOUND_KEY, v ? "off" : "on");
      } catch {}
      return !v;
    });
  };
  return { on, toggle, beep };
}

// ---------------------------------------------------------------- the sea (canvas)
// depth = how far down the camera is, in score points (0 = at the surface, 700 = the trench)
function Sea({ depth }: { depth: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useRef(depth);
  target.current = depth;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const W = 240, H = 135;
    cv.width = W;
    cv.height = H;
    const c = cv.getContext("2d")!;
    let raf = 0;
    let cam = target.current;
    const start = performance.now();
    // fixed "random" things in the water, so they don't jump around between frames
    const rnd = (n: number) => {
      const x = Math.sin(n * 127.1) * 43758.5453;
      return x - Math.floor(x);
    };
    const fish = Array.from({ length: 46 }, (_, i) => ({ y: 40 + rnd(i) * 2300, x: rnd(i + 50) * W, s: rnd(i + 99) < 0.5 ? -1 : 1, v: 4 + rnd(i + 7) * 10, kind: Math.floor(rnd(i + 3) * 3) }));
    const specks = Array.from({ length: 60 }, (_, i) => ({ y: rnd(i + 200) * 2400, x: rnd(i + 300) * W, v: 0.5 + rnd(i + 400) }));
    const rect = (x: number, y: number, w: number, h: number, col: string) => {
      c.fillStyle = col;
      c.fillRect(Math.round(x), Math.round(y), w, h);
    };
    const lerp = (a: number[], b: number[], t: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
    const draw = (now: number) => {
      const t = (now - start) / 1000;
      cam += (target.current - cam) * 0.045;
      // The picture is cut to fit the screen (sides on a phone held upright, top/bottom on a wide screen): "seenW" is the part
      // you can see. On a wide screen the sub floats on the LEFT, next to the card; upright it floats BELOW the card.
      const box = cv.getBoundingClientRect();
      const upright = box.height > box.width * 1.1;
      const seenW = Math.min(W, Math.max(40, (H * box.width) / Math.max(1, box.height)));
      const seenX = (W - seenW) / 2;
      // 1 score point = 3 pixels of water.
      const camY = cam * 3; // pixels of water above the sub
      const subY = upright ? 100 : 62;
      const surface = subY - camY - 2; // where the waterline is on screen
      // sky (dusk pink) above the water
      if (surface > 0) {
        for (let y = 0; y < Math.min(H, surface); y++) rect(0, y, W, 1, lerp([54, 18, 74], [255, 122, 200], Math.max(0, Math.min(1, y / 60))));
        // the sun, half sunk in the sea
        const sunX = seenX + seenW * 0.72;
        for (let dy = 0; dy < 13; dy++) {
          const hw = Math.round(Math.sqrt(13 * 13 - dy * dy));
          rect(sunX - hw, surface - 1 - dy, hw * 2, 1, dy < 4 ? "#ffd0ee" : "#ffeaf8");
        }
        // clouds
        for (let i = 0; i < 4; i++) {
          const cx = ((i * 73 + t * (3 + i)) % (W + 60)) - 30, cy = 10 + i * 9 + surface - 60;
          rect(cx, cy, 26, 4, "rgba(255,255,255,0.22)");
          rect(cx + 6, cy - 3, 14, 3, "rgba(255,255,255,0.22)");
        }
      }
      // water: gets darker the deeper you are
      const from = Math.max(0, Math.ceil(surface));
      for (let y = from; y < H; y += 3) {
        // how deep this row is (0 at the top, 1 at the trench); rows lower on the screen are a touch darker
        const k = Math.min(1, Math.max(0, (y - surface) / 3) / 700 + (y / H) * 0.1);
        rect(0, y, W, 3, k < 0.3 ? lerp([214, 74, 178], [98, 38, 140], k / 0.3) : lerp([98, 38, 140], [8, 4, 18], Math.min(1, (k - 0.3) / 0.5)));
      }
      // the waterline: little waves
      if (surface > -4 && surface < H) for (let x = 0; x < W; x += 4) rect(x, surface + Math.round(Math.sin(x * 0.2 + t * 2)), 4, 2, "#ffc4ee");
      // light rays near the top
      if (camY < 500) {
        c.globalAlpha = Math.max(0, 0.07 - camY / 7000);
        for (let i = 0; i < 9; i++) rect(8 + i * 27 + Math.sin(t * 0.4 + i) * 5, Math.max(0, surface + 2), 3 + (i % 3) * 2, H, "#ffe6f7");
        c.globalAlpha = 1;
      }
      // specks drifting up
      for (const s of specks) {
        const y = ((s.y - t * 6 * s.v) % 2400 + 2400) % 2400;
        const sy = y - camY + subY;
        if (sy > Math.max(0, surface + 3) && sy < H) rect(s.x, sy, 1, 1, "rgba(255,220,250,0.35)");
      }
      // fish shadows swimming by
      for (const f of fish) {
        const sy = f.y - camY + subY;
        if (sy < Math.max(0, surface + 6) || sy > H) continue;
        const x = (((f.x + t * f.v * f.s) % (W + 30)) + W + 30) % (W + 30) - 15;
        const col = f.y > 1200 ? "rgba(255,95,210,0.5)" : "rgba(20,6,32,0.55)";
        const L = f.kind === 2 ? 9 : 6;
        rect(x, sy, L, f.kind === 1 ? 3 : 2, col);
        rect(x + (f.s > 0 ? -2 : L), sy - 1, 2, f.kind === 1 ? 5 : 4, col);
        if (f.y > 1200) rect(x + (f.s > 0 ? L - 2 : 1), sy, 1, 1, "#fff"); // deep ones glow
      }
      // the sea floor, at the very bottom
      const floor = 700 * 3 - camY + subY + 40;
      if (floor < H) {
        rect(0, floor, W, H - floor, "#05020a");
        for (let x = 0; x < W; x += 9) rect(x, floor - (rnd(x) * 5) | 0, 5, 6, "#0c0518");
        for (let x = 6; x < W; x += 31) rect(x, floor - 9 - ((rnd(x + 1) * 6) | 0), 2, 10, PINK);
      }
      // THE PINK SUB (bobs a little; a headlight once it's dark)
      const bob = Math.round(Math.sin(t * 2) * 1.5);
      const sx = Math.round(upright ? W / 2 - 14 : seenX + seenW * 0.1), sy2 = subY + bob;
      if (cam > 250) {
        c.globalAlpha = 0.16;
        for (let i = 0; i < 26; i++) rect(sx + 30 + i * 3, sy2 + 5 - i * 0.5, 3, 4 + i, "#fff0a8");
        c.globalAlpha = 1;
      }
      rect(sx + 4, sy2 + 2, 24, 10, "#ff46c8");
      rect(sx + 2, sy2 + 4, 28, 6, "#ff46c8");
      rect(sx + 4, sy2 + 2, 24, 2, "#ff9be8");
      rect(sx + 4, sy2 + 10, 24, 2, "#b0208c");
      rect(sx + 12, sy2 - 3, 8, 5, "#ff46c8"); // tower
      rect(sx + 15, sy2 - 7, 2, 4, "#ffd6ef"); // periscope
      rect(sx + 15, sy2 - 7, 5, 2, "#ffd6ef");
      rect(sx + 20, sy2 + 4, 5, 5, "#12041c"); // window
      rect(sx + 21, sy2 + 5, 2, 2, "#9fe8ff");
      rect(sx + 10, sy2 + 5, 4, 4, "#12041c");
      rect(sx + 11, sy2 + 6, 1, 1, "#9fe8ff");
      rect(sx - 2, sy2 + 3, 4, 8, "#b0208c"); // tail
      const spin = Math.floor(t * 12) % 2;
      rect(sx - 5, sy2 + (spin ? 2 : 5), 3, spin ? 10 : 4, "#ffd6ef"); // propeller
      // bubbles from the propeller
      for (let i = 0; i < 5; i++) {
        const bt = (t * 1.2 + i * 0.2) % 1;
        rect(sx - 8 - bt * 14, sy2 + 6 - bt * 16 + Math.sin(i + t * 3) * 2, 2, 2, `rgba(255,255,255,${0.7 * (1 - bt)})`);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="pd-sea" aria-hidden="true" />;
}

// ---------------------------------------------------------------- the curve of today's players
function Curve({ hist, mine }: { hist: Record<string, number>; mine: number }) {
  // counts per 20 points, smoothed into a hill
  const N = 36; // 0 .. 700 in steps of 20
  const raw = Array.from({ length: N }, (_, i) => hist[String(i)] ?? 0);
  const smooth = raw.map((_, i) => {
    let s = 0, w = 0;
    for (let k = -3; k <= 3; k++) {
      const v = raw[i + k];
      if (v === undefined) continue;
      const g = Math.exp(-(k * k) / 4);
      s += v * g;
      w += g;
    }
    return s / w;
  });
  const top = Math.max(...smooth, 0.001);
  const W = 320, H = 90;
  const x = (score: number) => (score / 700) * W;
  const pts = smooth.map((v, i) => `${x(i * 20 + 10).toFixed(1)},${(H - 6 - (v / top) * (H - 16)).toFixed(1)}`);
  const mx = x(Math.min(700, mine));
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="pd-curve" role="img" aria-label="How today's divers scored">
      <polygon points={`0,${H - 6} ${pts.join(" ")} ${W},${H - 6}`} fill="rgba(86,200,255,0.25)" />
      <polyline points={pts.join(" ")} fill="none" stroke="#56c8ff" strokeWidth="2" />
      <line x1="0" y1={H - 6} x2={W} y2={H - 6} stroke="rgba(255,255,255,0.3)" />
      <line x1={mx} y1="8" x2={mx} y2={H - 6} stroke={PINK} strokeWidth="2" />
      <rect x={mx - 3} y="5" width="6" height="6" fill={PINK} />
      <text x={Math.max(12, Math.min(W - 12, mx))} y={H + 9} fill={PINK} fontSize="8" textAnchor="middle">
        YOU
      </text>
      {[0, 350, 700].map((v) => (
        <text key={v} x={v === 0 ? 2 : v === 700 ? W - 2 : W / 2} y={H + 9} fill="rgba(255,255,255,0.45)" fontSize="7" textAnchor={v === 0 ? "start" : v === 700 ? "end" : "middle"}>
          {Math.abs(mx - x(v)) < 26 ? "" : v}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------- the game
export default function PinkDive({ pixelFont }: { pixelFont: string }) {
  const [screen, setScreen] = useState<Screen>("intro");
  const [dive, setDive] = useState(1);
  const [practice, setPractice] = useState(false);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [at, setAt] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [typed, setTyped] = useState("");
  const [left, setLeft] = useState(SECONDS);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const [reveal, setReveal] = useState<Hit | "none" | null>(null); // the answer card between two prompts
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);
  const [nextIn, setNextIn] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const deadline = useRef(0);
  const lockedAt = useRef(-1); // the prompt that's already been answered (so the clock can't end it twice)
  const { on: soundOn, toggle: toggleSound, beep } = useBeeps();

  // today's dive; if you already dove today, straight to your result
  useEffect(() => {
    const d = diveNumber();
    setDive(d);
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as Result | null;
      if (saved && saved.dive === d && Array.isArray(saved.slots)) {
        setPrompts(promptsForDive(d));
        setSlots(saved.slots);
        setResult(saved);
        setScreen("results");
        // the curve keeps filling up during the day: get the newest one
        fetch(`/api/dive?dive=${d}`)
          .then((r) => r.json())
          .then((c) => {
            if (c && typeof c.players === "number") setResult((r) => (r && !practice ? { ...r, players: c.players, hist: c.hist ?? r.hist } : r));
          })
          .catch(() => {});
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the clock to the next dive (midnight UTC)
  useEffect(() => {
    if (screen !== "results") return;
    const tick = () => {
      const ms = 86400000 - (Date.now() % 86400000);
      const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
      setNextIn(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [screen]);

  const total = slots.reduce((a, s) => a + s.depth, 0);

  const begin = (isPractice: boolean) => {
    const d = diveNumber();
    setDive(d);
    setPractice(isPractice);
    const today = promptsForDive(d);
    setPrompts(isPractice ? practicePrompts(today) : today);
    setSlots([]);
    setAt(0);
    setTyped("");
    setNote(null);
    setReveal(null);
    setResult(null);
    setCopied(false);
    lockedAt.current = -1;
    deadline.current = Date.now() + SECONDS * 1000;
    setLeft(SECONDS);
    setScreen("play");
    beep(300, 90, 0.5, "sine", 0.2);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  // the dive is over: save it, and ask the server for the live depths + today's curve
  const finish = (all: Slot[], isPractice: boolean, d: number) => {
    const base: Result = { dive: d, slots: all, total: all.reduce((a, s) => a + s.depth, 0), players: 0, hist: {}, better: null, live: false };
    setResult(base);
    setScreen("results");
    [523, 659, 784, 1046].forEach((f, i) => beep(f, f, i === 3 ? 0.4 : 0.12, "square", 0.1, i * 0.11));
    if (isPractice) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(base));
    } catch {}
    fetch("/api/dive", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dive: d, device: deviceId(), answers: all.map((s) => s.answer) }),
    })
      .then((r) => r.json())
      .then((res) => {
        if (!res || !Array.isArray(res.depths)) {
          setResult((r) => (r ? { ...r, off: true } : r)); // the database is offline: your own depths still count
          return;
        }
        const live: Result = {
          dive: d,
          slots: all.map((s, i) => ({ ...s, depth: Number(res.depths[i]) || 0 })),
          total: Number(res.total) || 0,
          players: Number(res.players) || 0,
          hist: res.hist ?? {},
          better: typeof res.better === "number" ? res.better : null,
          live: true,
        };
        setSlots(live.slots);
        setResult(live);
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(live));
        } catch {}
      })
      .catch(() => setResult((r) => (r ? { ...r, off: true } : r)));
  };

  // one prompt is done (with an answer, or without)
  const lock = (hit: Hit | null) => {
    if (reveal || lockedAt.current === at) return;
    lockedAt.current = at;
    const slot: Slot = hit ? { answer: hit.answer, tier: hit.tier, depth: hit.depth } : { answer: null, tier: -1, depth: 0 };
    const all = [...slots, slot];
    setSlots(all);
    setReveal(hit ?? "none");
    setNote(null);
    if (hit) [0, 1, 2].slice(0, 1 + Math.min(2, hit.tier)).forEach((i) => beep(500 + hit.tier * 120 + i * 160, 500 + hit.tier * 120 + i * 160, 0.1, "square", 0.1, i * 0.08));
    else beep(180, 70, 0.4, "sawtooth", 0.1);
    const isPractice = practice, d = dive, n = at;
    window.setTimeout(
      () => {
        setReveal(null);
        setTyped("");
        if (n + 1 >= PER_DAY) finish(all, isPractice, d);
        else {
          setAt(n + 1);
          deadline.current = Date.now() + SECONDS * 1000;
          setLeft(SECONDS);
          window.setTimeout(() => inputRef.current?.focus(), 30);
        }
      },
      hit ? 1500 : 1100,
    );
  };

  // the 25 second clock
  useEffect(() => {
    if (screen !== "play" || reveal) return;
    const id = window.setInterval(() => {
      const s = Math.max(0, (deadline.current - Date.now()) / 1000);
      setLeft((prev) => {
        if (Math.ceil(s) !== Math.ceil(prev) && s <= 5 && s > 0) beep(880, 880, 0.05, "square", 0.05);
        return s;
      });
      if (s <= 0) lock(null);
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, reveal, at, slots]);

  const submit = () => {
    if (screen !== "play" || reveal) return;
    const p = prompts[at];
    if (!p || !typed.trim()) return;
    const hit = check(p, typed);
    if (hit) lock(hit);
    else {
      buzz("soft");
      setNote({ text: `"${typed.trim().toUpperCase().slice(0, 24)}" ISN'T ON THE LIST - TRY ANOTHER`, bad: true });
      setTyped("");
      beep(160, 110, 0.18, "square", 0.08);
      inputRef.current?.focus();
    }
  };

  // ENTER starts the dive on the first screen
  useEffect(() => {
    if (screen !== "intro") return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        begin(false);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const shareText = () => {
    if (!result) return "";
    const squares = result.slots.map((s) => ["⬛", "⬜", "🟦", "🟥", "🟪", "🟨"][s.tier + 1]).join("");
    return `PINK DIVE #${result.dive}\n${metres(result.total)} · ${BANDS[bandOf(result.total)].name}\n${squares}\npinkmane.site/games/pink-dive`;
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {}
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ text: shareText() });
      else await copy();
    } catch {}
  };

  const p = prompts[at];
  const band = result ? bandOf(result.total) : 0;
  // where the camera is: the depth so far while playing, your total on the results, the surface on the first screen
  const camDepth = screen === "intro" ? 0 : screen === "play" ? total : (result?.total ?? 0);

  return (
    <div className="pd-root" style={{ fontFamily: pixelFont }}>
      <Sea depth={camDepth} />

      <Link
        href="/"
        className="pd-back"
        onClick={() => {
          try {
            sessionStorage.setItem("pinkmane-open-games", "1");
          } catch {}
        }}
      >
        ← GAMES
      </Link>
      <button className="pd-sound" onClick={toggleSound} aria-label={soundOn ? "Sound off" : "Sound on"}>
        {soundOn ? "SOUND ON" : "SOUND OFF"}
      </button>

      {screen === "intro" && (
        <div className="pd-panel pd-intro">
          <h1 className="pd-title">PINK DIVE</h1>
          <div className="pd-sub">THE DAILY DIVE · #{dive}</div>
          <p className="pd-how">
            7 prompts · {SECONDS} seconds each
            <br />
            the rarer your answer, the deeper you sink
          </p>
          <button className="pd-btn pd-big" onClick={() => begin(false)}>
            DIVE
          </button>
          <div className="pd-tiers">
            {TIERS.map((t) => (
              <span key={t.name} style={{ color: t.color }}>
                {t.name} {t.depth}
              </span>
            ))}
          </div>
        </div>
      )}

      {screen === "play" && p && (
        <div className="pd-panel pd-play">
          <div className="pd-top">
            <span>
              {at + 1}/{PER_DAY} · {p.cat}
              {practice ? " · PRACTICE" : ""}
            </span>
            <span className="pd-depth">{metres(total)}</span>
          </div>
          <div className="pd-bar" aria-hidden="true">
            <div className={`pd-bar-in ${left <= 5 ? "pd-low" : ""}`} style={{ width: `${(left / SECONDS) * 100}%` }} />
          </div>
          <h2 className="pd-q">{p.q}</h2>
          {reveal ? (
            reveal === "none" ? (
              <div className="pd-reveal pd-miss">NO ANSWER · 0 m</div>
            ) : (
              <div className="pd-reveal" style={{ borderColor: TIERS[reveal.tier].color, color: TIERS[reveal.tier].color }}>
                <div className="pd-reveal-a">{reveal.answer}</div>
                <div>
                  {TIERS[reveal.tier].name} · -{reveal.depth * 10} m
                </div>
              </div>
            )
          ) : (
            <form
              className="pd-form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <input
                ref={inputRef}
                className="pd-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="TYPE YOUR ANSWER"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={40}
                enterKeyHint="go"
                aria-label={p.q}
              />
              <button className="pd-btn" type="submit">
                OK
              </button>
            </form>
          )}
          <div className={`pd-note ${note?.bad ? "pd-bad" : ""}`}>{note ? note.text : reveal ? "" : `${Math.ceil(left)} SECONDS · ONE ANSWER COUNTS`}</div>
          {!reveal && (
            <button className="pd-skip" onClick={() => lock(null)}>
              SKIP
            </button>
          )}
        </div>
      )}

      {screen === "results" && result && (
        <div className="pd-panel pd-results">
          <div className="pd-top">
            <span>
              {practice ? "PRACTICE DIVE" : `DIVE #${result.dive} COMPLETE`}
            </span>
            <span>{practice || !result.live ? "" : `${result.players} DIVER${result.players === 1 ? "" : "S"} TODAY`}</span>
          </div>
          <div className="pd-score">
            {result.total}
            <span className="pd-score-m">{metres(result.total)}</span>
          </div>
          <div className="pd-band" style={{ color: TIERS[band].color }}>
            {BANDS[band].name}. <span>{BANDS[band].line}</span>
          </div>

          {!practice && result.live && result.players > 1 && (
            <>
              <Curve hist={result.hist} mine={result.total} />
              {result.better !== null && <div className="pd-better">DEEPER THAN {result.better}% OF TODAY&apos;S DIVERS</div>}
            </>
          )}
          {!practice && result.live && result.players <= 1 && <div className="pd-better">YOU&apos;RE THE FIRST DIVER TODAY</div>}
          {!practice && !result.live && <div className="pd-wait">{result.off ? "today's divers aren't reachable right now: these are your own depths" : "checking today's divers..."}</div>}

          <div className="pd-log">
            {result.slots.map((s, i) => (
              <div className="pd-row" key={i}>
                <span className="pd-row-q">{prompts[i]?.q ?? ""}</span>
                <span className="pd-row-a" style={{ color: s.tier >= 0 ? TIERS[s.tier].color : "rgba(255,255,255,0.4)" }}>
                  {s.answer ?? "-"}
                </span>
                <span className="pd-row-d">{s.depth}</span>
              </div>
            ))}
          </div>

          <div className="pd-actions">
            {!practice && (
              <>
                <button className="pd-btn pd-big" onClick={copy}>
                  {copied ? "COPIED!" : "COPY RESULT"}
                </button>
                <button className="pd-btn" onClick={share}>
                  SHARE
                </button>
              </>
            )}
            <button className="pd-btn" onClick={() => begin(true)}>
              {practice ? "PRACTICE AGAIN" : "PRACTICE"}
            </button>
          </div>
          <div className="pd-next">
            {practice ? "practice doesn't count for today" : "next dive in"} {practice ? "" : nextIn}
          </div>
        </div>
      )}

      <style>{`
        .pd-root {
          position: fixed; inset: 0; overflow-y: auto; overflow-x: hidden; background: ${INK}; color: #fff;
          display: flex; justify-content: center; align-items: flex-start;
          -webkit-text-stroke: 0.4px currentColor;
        }
        .pd-sea { position: fixed; inset: 0; width: 100%; height: 100%; image-rendering: pixelated; object-fit: cover; }
        .pd-back, .pd-sound {
          position: fixed; top: max(10px, env(safe-area-inset-top)); z-index: 5; font-family: inherit; font-size: 9px; color: #fff;
          padding: 7px 10px; background: rgba(11, 6, 20, 0.6); border: 2px solid rgba(255, 255, 255, 0.7); text-decoration: none;
          text-shadow: 1px 1px 0 #000; cursor: pointer;
        }
        .pd-back { left: max(12px, env(safe-area-inset-left)); }
        .pd-sound { right: max(12px, env(safe-area-inset-right)); font-size: 7px; }
        .pd-panel {
          position: relative; z-index: 2; width: min(520px, 94vw); margin: 0 auto; text-align: center;
          padding: 18px 16px 16px; text-shadow: 1px 1px 0 #000;
        }
        .pd-intro { margin-top: 20vh; }
        .pd-play { margin-top: max(64px, 14vh); background: rgba(11, 6, 20, 0.78); border: 3px solid ${PINK}; box-shadow: 6px 6px 0 #000; }
        .pd-results { margin: 58px auto 40px; background: rgba(11, 6, 20, 0.82); border: 3px solid ${PINK}; box-shadow: 6px 6px 0 #000; }
        .pd-title { margin: 0; font-size: clamp(30px, 9vw, 56px); color: ${PINK}; text-shadow: 4px 4px 0 #12041c; letter-spacing: 2px; }
        .pd-sub { margin-top: 14px; font-size: 10px; color: #9fe8ff; }
        .pd-how { margin: 22px 0; font-size: 9px; line-height: 2.1; }
        .pd-tiers { margin-top: 26px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 12px; font-size: 7px; }
        .pd-btn {
          font-family: inherit; font-size: 10px; color: #fff; cursor: pointer; padding: 10px 14px;
          background: #2a1438; border: 2px solid #fff; box-shadow: 3px 3px 0 #000; text-shadow: 1px 1px 0 #000;
        }
        .pd-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
        .pd-big { background: #d63cc8; font-size: 13px; padding: 13px 26px; }
        .pd-top { display: flex; justify-content: space-between; gap: 10px; font-size: 8px; color: #9fe8ff; }
        .pd-depth { color: #fff; }
        .pd-bar { height: 8px; margin: 10px 0 16px; background: #2a1438; border: 2px solid #fff; }
        .pd-bar-in { height: 100%; background: #56c8ff; transition: width 0.1s linear; }
        .pd-low { background: #ff4a6a; }
        .pd-q { margin: 0 0 16px; font-size: clamp(12px, 3.6vw, 17px); line-height: 1.6; color: #fff; }
        .pd-form { display: flex; gap: 8px; }
        .pd-input {
          flex: 1; min-width: 0; font-family: inherit; font-size: 16px; color: #12041c; background: #ffe6f7;
          border: 3px solid #fff; padding: 10px; text-transform: uppercase; outline: none; -webkit-text-stroke: 0;
        }
        .pd-input:focus { border-color: ${PINK}; }
        .pd-input::placeholder { color: rgba(18, 4, 28, 0.35); font-size: 10px; }
        .pd-note { min-height: 28px; margin-top: 12px; font-size: 7px; line-height: 1.7; color: rgba(255, 255, 255, 0.7); }
        .pd-bad { color: #ff8ea0; animation: pdShake 0.25s; }
        @keyframes pdShake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .pd-skip { font-family: inherit; font-size: 7px; color: rgba(255, 255, 255, 0.6); background: none; border: none; cursor: pointer; padding: 6px; text-decoration: underline; }
        .pd-reveal { border: 3px solid; padding: 12px 8px; font-size: 9px; line-height: 2; background: rgba(0, 0, 0, 0.35); animation: pdPop 0.25s ease-out; }
        .pd-reveal-a { font-size: 14px; color: #fff; }
        .pd-miss { border-color: rgba(255, 255, 255, 0.4); color: rgba(255, 255, 255, 0.6); }
        @keyframes pdPop { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .pd-score { margin-top: 12px; font-size: clamp(40px, 13vw, 64px); line-height: 1; text-align: left; }
        .pd-score-m { margin-left: 12px; font-size: 10px; color: #56c8ff; }
        .pd-band { margin: 10px 0 12px; font-size: 9px; line-height: 1.8; text-align: left; }
        .pd-band span { color: rgba(255, 255, 255, 0.75); }
        .pd-curve { width: 100%; height: auto; display: block; font-family: inherit; }
        .pd-better { margin: 8px 0 4px; font-size: 8px; color: #9fe8ff; text-align: left; }
        .pd-wait { margin: 8px 0; font-size: 7px; color: rgba(255, 255, 255, 0.5); text-align: left; }
        .pd-log { margin: 14px 0; border-top: 1px dashed rgba(255, 255, 255, 0.3); }
        .pd-row { display: flex; gap: 8px; align-items: baseline; padding: 7px 0; border-bottom: 1px dashed rgba(255, 255, 255, 0.18); font-size: 7px; line-height: 1.6; text-align: left; }
        .pd-row-q { flex: 1.3; color: rgba(255, 255, 255, 0.6); }
        .pd-row-a { flex: 1; text-align: right; font-size: 8px; }
        .pd-row-d { width: 34px; text-align: right; color: #fff; }
        .pd-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
        .pd-actions .pd-big { font-size: 11px; padding: 11px 18px; }
        .pd-next { margin-top: 12px; font-size: 7px; color: rgba(255, 255, 255, 0.6); }
        @media (max-height: 520px) { .pd-intro { margin-top: 12vh; } .pd-play { margin-top: 52px; } }
        @media (prefers-reduced-motion: reduce) { .pd-bad, .pd-reveal { animation: none; } }
      `}</style>
    </div>
  );
}
