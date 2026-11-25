"use client";

import { useEffect, useRef, useState } from "react";
import { reportScore } from "./Snippets"; // unreleased snippets: a run that beats the target score unlocks one
import { buzz } from "../../game/buzz"; // the phone buzz on a hit (game/buzz.ts)

// ONLINE TOP 10 for the mini games. It looks exactly like PINKMANE VOID's Top 10:
// pale green screen, GOLD 1st, SILVER 2nd, BRONZE 3rd, every row wiggles a little, a shine sweeps over the gold one,
// your own row gets a pink frame, and the old-screen effect (scanlines, a rolling band, dark corners) on top.
// It uses the same scoreboard server as PINKMANE VOID (app/api/scores), the same saved name and the same device id,
// so a name you claimed in one game is yours in all of them.
//
// How a game uses it:
//   const board = useRef<ScoreApi | null>(null);
//   ...when the run ends:     board.current?.gameOver(score, secondsTheRunLasted)
//   ...before restarting:     if (board.current?.busy()) return;   (the Top 10 box is still open)
//   ...when a new run starts: board.current?.hide()
//   ...the start screen:      board.current?.top()   = the #1 on the board ({ name, score }) or null
//   ...just look at it:       board.current?.show()  = opens the Top 10 without a new score (OK closes it)
//   <ScorePanel game="hell" title="PINK HELL" apiRef={board} fontFamily={fontFamily} width={W} height={H} />
//   (next to the game's canvas; width / height = the game's own size in pixels, so it lines up exactly)
//
// After every run it covers the game screen:
//   - your score is good enough  -> NEW TOP 10 SCORE! type your name, SAVE (or SKIP)
//   - otherwise                  -> the Top 10
//   OK / ENTER / SPACE / ESC / a tap closes it, then the game's own game over screen is there as before.
// The game's id ("hell", "jungle") must also be in GAMES in app/api/scores/shared.ts, or the server says "unknown game".

// the same keys as PINKMANE VOID (SuperGame.tsx)
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// PINKMANE VOID's colours
const SCREEN = "#d7efbc";
const INK = "#111111";
const PINK = "#d63cc8";
const MEDALS = ["#ffd700", "#c8ccd6", "#cd7f32"]; // gold, silver, bronze

export type ScoreEntry = { name: string; score: number };
export type ScoreApi = {
  gameOver: (score: number, runTime: number) => void;
  hide: () => void;
  busy: () => boolean;
  top: () => ScoreEntry | null;
  show: () => void;
};
type Phase = "hidden" | "loading" | "entry" | "board" | "offline";

// what the server's error words mean, in plain words
const WHY: Record<string, string> = {
  "name reserved": "PINKMANE IS RESERVED, PICK ANOTHER NAME",
  "beat their score to take this name": "THAT NAME HAS A HIGHER SCORE - BEAT IT TO TAKE IT",
  "slow down": "WAIT 10 SECONDS, THEN TRY AGAIN",
  "pick another name": "PICK ANOTHER NAME",
  "score not valid": "SCORE COULD NOT BE CHECKED",
  "name too short": "NAME TOO SHORT",
  offline: "SCOREBOARD IS OFFLINE",
};

function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}
const readLocal = (key: string) => {
  try {
    return localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
// the same name rules as the server: capitals, numbers, space _ . - and max 12 characters
const cleanName = (n: string) => n.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "").slice(0, 12);
const pad5 = (n: number) => String(Math.floor(n)).padStart(5, "0");

async function fetchBoard(game: string): Promise<ScoreEntry[] | null> {
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(`/api/scores?game=${game}`, { cache: "no-store", signal: ctl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.scores) ? data.scores : [];
  } catch {
    return null;
  }
}

export function ScorePanel({
  game,
  title,
  apiRef,
  fontFamily,
  width = 320,
  height = 150,
  format = pad5,
  minScore = 10,
  screen = SCREEN,
}: {
  game: string;
  title: string;
  apiRef: React.MutableRefObject<ScoreApi | null>;
  fontFamily: string;
  accent?: string; // (old: the box colour. Not used any more: every game's Top 10 looks like VOID's now)
  width?: number; // the game's own size in pixels
  height?: number;
  format?: (score: number) => string; // how a score is written (Pink Hexagon: a time)
  minScore?: number; // the lowest score that can get on the board
  screen?: string; // the background colour (PINK HUNT matches the iPod screen of the picked MODE); games keep VOID's green
}) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const scores = useRef<ScoreEntry[]>([]);
  const myName = useRef("");
  const topRef = useRef<ScoreEntry | null>(null);
  const run = useRef({ score: 0, runTime: 0 });
  const viewOnly = useRef(false); // opened with show(): no "YOU" line
  const phaseRef = useRef<Phase>("hidden");
  const closedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const close = () => {
    closedAt.current = performance.now();
    go("hidden");
  };
  const keepScores = (list: ScoreEntry[]) => {
    scores.current = list;
    topRef.current = list[0] ?? null;
  };

  // load the board once, so the start screen can show the #1
  useEffect(() => {
    fetchBoard(game).then((list) => {
      if (list) keepScores(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  apiRef.current = {
    gameOver: (score, runTime) => {
      run.current = { score: Math.floor(score), runTime };
      reportScore(game, Math.floor(score));
      buzz("end"); // the run is over: the long buzz (every mini game ends through here)
      viewOnly.current = false;
      setMessage("");
      go("loading");
      fetchBoard(game).then((list) => {
        if (phaseRef.current !== "loading") return; // a new run started meanwhile
        if (!list) return go("offline");
        keepScores(list);
        const s = run.current.score;
        const good = s >= minScore && (list.length < 10 || s > list[list.length - 1].score);
        if (good) {
          setName(cleanName(readLocal(NAME_KEY)));
          go("entry");
        } else go("board");
      });
    },
    hide: () => go("hidden"),
    show: () => {
      viewOnly.current = true;
      myName.current = cleanName(readLocal(NAME_KEY));
      setMessage("");
      go("loading");
      fetchBoard(game).then((list) => {
        if (phaseRef.current !== "loading") return;
        if (!list) return go("offline");
        keepScores(list);
        go("board");
      });
    },
    // the box is open (or just closed this instant, so the same key press doesn't also restart the game)
    busy: () => phaseRef.current !== "hidden" || performance.now() - closedAt.current < 350,
    top: () => topRef.current,
  };

  // OK / ENTER / SPACE / ESC closes the Top 10 (the name box handles its own keys)
  useEffect(() => {
    if (phase !== "board" && phase !== "offline") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    if (phase === "entry") setTimeout(() => inputRef.current?.focus(), 50);
  }, [phase]);

  // ---------- drawing (PINKMANE VOID's Top 10) ----------
  useEffect(() => {
    if (phase === "hidden" || phase === "loading") return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const W = width;
    const H = height;
    const big = H >= 160;
    const ROW_Y = big ? 22 : 19; // the first row
    const ROW_DY = big ? 11 : 10; // how far apart the rows are
    const start = performance.now();
    const textBox = (text: string, y: number) => {
      const w = ctx.measureText(text).width + 8;
      ctx.fillStyle = screen;
      ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
      ctx.fillStyle = INK;
      ctx.fillText(text, W / 2, y);
    };
    let raf = 0;
    const draw = () => {
      const t = (performance.now() - start) / 1000;
      ctx.fillStyle = screen;
      ctx.fillRect(0, 0, W, H);
      ctx.font = `8px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.fillStyle = INK;
      ctx.textAlign = "center";
      const blink = Math.floor(t * 2) % 2 === 0;

      if (phase === "offline") {
        ctx.fillText(`TOP 10 · ${title}`, W / 2, 30);
        ctx.fillText("THE SCOREBOARD IS OFFLINE", W / 2, 60);
        ctx.fillText("RIGHT NOW", W / 2, 72);
        if (blink) ctx.fillText("OK TO CLOSE", W / 2, H - 12);
      } else if (phase === "entry") {
        ctx.fillText(title, W / 2, 10);
        textBox("NEW TOP 10 SCORE!", 30);
        // the score bounces a little
        const by = 46 + Math.round(Math.sin(t * 4) * 1.5);
        ctx.font = `16px ${fontFamily}`;
        ctx.fillStyle = "#ffffff";
        ctx.fillText(format(run.current.score), W / 2 + 1, by + 1);
        ctx.fillStyle = PINK;
        ctx.fillText(format(run.current.score), W / 2, by);
        ctx.font = `8px ${fontFamily}`;
      } else {
        ctx.fillText(`TOP 10 · ${title}`, W / 2, ROW_Y - 14);
        const b = scores.current;
        if (b.length === 0) ctx.fillText("NO SCORES YET - BE THE FIRST!", W / 2, 60);
        b.slice(0, 10).forEach((e, i) => {
          const y = ROW_Y + i * ROW_DY;
          // every row wiggles a little, like an old screen
          const wob = Math.round(Math.sin(t * 2.2 + i * 0.8) * 1.5);
          ctx.save();
          ctx.translate(wob, 0);
          if (i < 3) {
            ctx.fillStyle = MEDALS[i];
            ctx.fillRect(24, y - 2, W - 48, ROW_DY);
            // a shine sweeping across the gold one
            if (i === 0) {
              const sx = 24 + ((t * 90) % (W + 40)) - 20;
              ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
              ctx.fillRect(Math.round(sx), y - 2, 6, ROW_DY);
              ctx.fillRect(Math.round(sx) + 8, y - 2, 2, ROW_DY);
            }
          }
          if (e.name === myName.current) {
            // your own row: pink frame
            ctx.fillStyle = PINK;
            ctx.fillRect(22, y - 3, W - 44, 1);
            ctx.fillRect(22, y + ROW_DY - 2, W - 44, 1);
            ctx.fillRect(22, y - 3, 1, ROW_DY + 2);
            ctx.fillRect(W - 23, y - 3, 1, ROW_DY + 2);
          }
          ctx.fillStyle = INK;
          ctx.textAlign = "left";
          ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
          ctx.textAlign = "right";
          ctx.fillText(format(e.score), W - 28, y);
          ctx.restore();
        });
        ctx.textAlign = "center";
        if (!viewOnly.current) ctx.fillText(`YOU ${format(run.current.score)}`, W / 2, H - 26);
        if (blink) ctx.fillText("OK TO CONTINUE", W / 2, H - 12);
      }

      // Old screen effect: scanlines, a slow rolling bright band, a little flicker, dark corners
      ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
      const band = ((t * 30) % (H + 30)) - 30;
      ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
      ctx.fillRect(0, Math.round(band), W, 14);
      ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + Math.abs(Math.sin(t * 13)) * 0.03})`;
      ctx.fillRect(0, 0, W, H);
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, "rgba(0,0,0,0)");
      vg.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [phase, width, height, fontFamily, title, format, screen]);

  const save = async () => {
    const clean = name.trim();
    if (clean.length < 2) return setMessage("NAME TOO SHORT");
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game,
          name: clean,
          score: run.current.score,
          runTime: run.current.runTime,
          device: getDeviceId(),
          ownerCode: readLocal(OWNER_KEY),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = String(data.error || "");
        setMessage(WHY[err] ?? (err || "COULD NOT SAVE").toUpperCase());
        return;
      }
      if (Array.isArray(data.scores)) keepScores(data.scores);
      myName.current = data.name || clean;
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {}
      go("board");
    } catch {
      setMessage("COULD NOT SAVE");
    } finally {
      setSaving(false);
    }
  };

  if (phase === "hidden" || phase === "loading") return null;

  const btn: React.CSSProperties = {
    fontFamily,
    fontSize: "clamp(8px, 2.4vw, 11px)",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
    touchAction: "manipulation",
  };

  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 2 }} onPointerDown={(e) => e.stopPropagation()}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        // (closes the moment it's touched: a "click" can get lost on phones when a game is catching the touches)
        onPointerDown={(e) => {
          e.preventDefault();
          if (phase !== "entry") close();
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          cursor: phase === "entry" ? "default" : "pointer",
        }}
      />
      {phase === "entry" && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "12%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <input
            ref={inputRef}
            value={name}
            maxLength={12}
            placeholder="YOUR NAME"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(e) => setName(cleanName(e.target.value))}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") save();
              if (e.key === "Escape") go("board");
            }}
            style={{
              fontFamily,
              fontSize: "max(16px, clamp(10px, 3vw, 13px))", // 16px or more: phones don't zoom in when you tap it
              width: "60%",
              textAlign: "center",
              padding: "6px",
              background: INK,
              color: "#fff",
              border: `2px solid ${PINK}`,
              outline: "none",
              textTransform: "uppercase",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={save} disabled={saving} style={{ ...btn, background: PINK, color: "#fff" }}>
              {saving ? "SAVING..." : "SAVE"}
            </button>
            <button onClick={() => go("board")} style={{ ...btn, background: "#bbb", color: INK }}>
              SKIP
            </button>
          </div>
          {message && (
            <div style={{ fontFamily, fontSize: "clamp(7px, 2vw, 9px)", color: "#b00020", textAlign: "center", padding: "0 8px" }}>
              {message}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
