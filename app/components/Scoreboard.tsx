"use client";

import { useEffect, useRef, useState } from "react";

// ONLINE TOP 10 for the mini games (Pink Hell, Pink Jungle, ...).
// It uses the same scoreboard server as PINKMANE VOID (app/api/scores), the same saved name and the same device id,
// so a name you claimed in one game is yours in all of them.
//
// How a game uses it:
//   const board = useRef<ScoreApi | null>(null);
//   ...when the run ends:   board.current?.gameOver(score, secondsTheRunLasted)
//   ...before restarting:   if (board.current?.busy()) return;   (the Top 10 box is still open)
//   ...when a new run starts: board.current?.hide()
//   <ScorePanel game="hell" title="PINK HELL" apiRef={board} fontFamily={fontFamily} />   (next to the game's canvas)
//
// After every run a box pops up in the middle of the screen:
//   - your score is good enough  -> type your name, SAVE (or SKIP)
//   - otherwise                  -> the Top 10
//   OK / ENTER / SPACE / a tap closes it, then the game's own game over screen is there as before.
// The game's id ("hell", "jungle") must also be in GAMES in app/api/scores/shared.ts, or the server saves it on Pink Run's board.

// the same keys as PINKMANE VOID (SuperGame.tsx)
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

export type ScoreApi = {
  gameOver: (score: number, runTime: number) => void;
  hide: () => void;
  busy: () => boolean;
};
type Entry = { name: string; score: number };
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

async function fetchBoard(game: string): Promise<Entry[] | null> {
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
  accent = "#ff5fd2",
}: {
  game: string;
  title: string;
  apiRef: React.MutableRefObject<ScoreApi | null>;
  fontFamily: string;
  accent?: string;
}) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [scores, setScores] = useState<Entry[]>([]);
  const [myName, setMyName] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const run = useRef({ score: 0, runTime: 0 });
  const phaseRef = useRef<Phase>("hidden");
  const closedAt = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  const close = () => {
    closedAt.current = performance.now();
    go("hidden");
  };

  apiRef.current = {
    gameOver: (score, runTime) => {
      run.current = { score: Math.floor(score), runTime };
      setMessage("");
      go("loading");
      fetchBoard(game).then((list) => {
        if (phaseRef.current !== "loading") return; // a new run started meanwhile
        if (!list) return go("offline");
        setScores(list);
        const s = run.current.score;
        const good = s >= 10 && (list.length < 10 || s > list[list.length - 1].score);
        if (good) {
          setName(cleanName(readLocal(NAME_KEY)));
          go("entry");
        } else go("board");
      });
    },
    hide: () => go("hidden"),
    // the box is open (or just closed this instant, so the same key press doesn't also restart the game)
    busy: () => phaseRef.current !== "hidden" || performance.now() - closedAt.current < 350,
  };

  // OK / ENTER / SPACE / ESC closes the Top 10 (the name box handles its own keys)
  useEffect(() => {
    if (phase !== "board" && phase !== "offline") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  useEffect(() => {
    if (phase === "entry") setTimeout(() => inputRef.current?.focus(), 50);
  }, [phase]);

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
      if (Array.isArray(data.scores)) setScores(data.scores);
      setMyName(data.name || clean);
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
    fontSize: "max(10px, 4cqh)",
    padding: "1.6cqh 3cqh",
    color: "#fff",
    background: accent,
    border: "0.6cqh solid #111",
    boxShadow: "0 0.8cqh 0 rgba(0,0,0,0.6)",
    cursor: "pointer",
    touchAction: "manipulation",
  };

  return (
    <div style={{ position: "absolute", inset: 0, containerType: "size", pointerEvents: "none", zIndex: 2 }}>
      <div
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => phase !== "entry" && close()}
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(150cqh, 92%)",
          maxHeight: "92%",
          boxSizing: "border-box",
          padding: "3cqh 4cqh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.6cqh",
          fontFamily,
          color: "#fff",
          background: "rgb(16, 4, 14)",
          border: `0.8cqh solid ${accent}`,
          boxShadow: "0 0 0 0.6cqh #111",
          pointerEvents: "auto",
          textShadow: "0.4cqh 0.4cqh 0 #000",
        }}
      >
        {phase === "offline" ? (
          <>
            <div style={{ fontSize: "5cqh", color: accent }}>TOP 10</div>
            <div style={{ fontSize: "3.6cqh", textAlign: "center", lineHeight: 1.6 }}>THE SCOREBOARD IS OFFLINE RIGHT NOW</div>
            <button style={btn} onClick={close}>
              OK
            </button>
          </>
        ) : phase === "entry" ? (
          <>
            <div style={{ fontSize: "5.5cqh", color: "#ffd400" }}>NEW TOP 10 SCORE!</div>
            <div style={{ fontSize: "4.5cqh" }}>{run.current.score}</div>
            <div style={{ fontSize: "3.4cqh", color: "#ffb0ec" }}>TYPE YOUR NAME</div>
            <input
              ref={inputRef}
              value={name}
              maxLength={12}
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
                fontSize: "max(16px, 5cqh)", // 16px or more: phones don't zoom in when you tap it
                width: "13ch",
                textAlign: "center",
                padding: "1.2cqh 1cqh",
                color: "#fff",
                background: "#000",
                border: `0.6cqh solid ${accent}`,
                outline: "none",
                textTransform: "uppercase",
              }}
            />
            <div style={{ display: "flex", gap: "3cqh" }}>
              <button style={btn} onClick={save} disabled={saving}>
                {saving ? "..." : "SAVE"}
              </button>
              <button style={{ ...btn, background: "#444" }} onClick={() => go("board")}>
                SKIP
              </button>
            </div>
            {message && <div style={{ fontSize: "3.2cqh", color: "#ff6a6a", textAlign: "center", lineHeight: 1.5 }}>{message}</div>}
          </>
        ) : (
          <>
            <div style={{ fontSize: "4.6cqh", color: accent }}>TOP 10 · {title}</div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.9cqh", fontSize: "3.8cqh" }}>
              {scores.length === 0 && <div style={{ textAlign: "center", color: "#aaa" }}>NO SCORES YET - BE THE FIRST!</div>}
              {scores.slice(0, 10).map((e, i) => {
                const me = e.name === myName;
                return (
                  <div key={e.name} style={{ display: "flex", gap: "2cqh", color: me ? "#ffd400" : i === 0 ? "#ffb0ec" : "#fff" }}>
                    <span style={{ width: "3ch", textAlign: "right", opacity: 0.8 }}>{i + 1}.</span>
                    <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>{e.name}</span>
                    <span>{e.score}</span>
                  </div>
                );
              })}
            </div>
            <button style={btn} onClick={close}>
              OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}
