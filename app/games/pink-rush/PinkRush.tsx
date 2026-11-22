"use client";

// PINK RUSH on a web page: a canvas that fills the screen, and the game running in it.
// The game itself lives in the game/ folder (engine, entities, levels, config).
// It opens on the level map. pinkmane.site/games/pink-rush?level=3 jumps straight into level 3.
// Every level has its own online Top 10 of times (the same scoreboard as the other games: rush-l1, rush-l2 ...).

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Game } from "../../../game/engine/game";
import { LEVELS } from "../../../game/levels";
import { ScorePanel, type ScoreApi } from "../../components/Scoreboard";

// a level time is saved on the board as LEVEL_TIME_BASE - milliseconds (faster = higher), like PINKMANE VOID's levels
const LEVEL_TIME_BASE = 10000000;
const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
const fmtScore = (score: number) => fmtTime(LEVEL_TIME_BASE - score);

export default function PinkRush({ font, pixelFont }: { font: string; pixelFont: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // one Top 10 box per level
  const boards = useRef<{ current: ScoreApi | null }[]>(LEVELS.map(() => ({ current: null })));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const asked = Number(new URLSearchParams(window.location.search).get("level"));
    const start = Number.isInteger(asked) && asked >= 1 && asked <= LEVELS.length ? asked - 1 : undefined;
    const game = new Game(canvas, LEVELS, font, start, pixelFont);
    const b = boards.current;
    game.onLevelDone = (level, seconds) => b[level]?.current?.gameOver(LEVEL_TIME_BASE - Math.round(seconds * 1000), seconds);
    game.onShowBoard = (level) => b[level]?.current?.show();
    game.isBusy = () => b.some((x) => x.current?.busy());
    game.topOf = (level) => {
      const t = b[level]?.current?.top();
      return t ? { name: t.name, time: (LEVEL_TIME_BASE - t.score) / 1000 } : null;
    };
    game.start();
    return () => game.destroy();
  }, [font, pixelFont]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#07060c", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} aria-label="PINK RUSH" />
      {/* the Top 10 boxes (each one only shows while it's open) */}
      {LEVELS.map((lv, i) => (
        <ScorePanel
          key={i}
          game={`rush-l${i + 1}`}
          title={`PINK RUSH ${i + 1}: ${lv.name}`}
          apiRef={boards.current[i]}
          fontFamily={pixelFont}
          width={336}
          height={160}
          format={fmtScore}
          minScore={1}
        />
      ))}
      {/* back to the main site */}
      <Link
        href="/"
        style={{
          position: "absolute",
          right: 16,
          bottom: 14,
          padding: "8px 12px",
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontWeight: 700,
          fontSize: 14,
          color: "#ece6ff",
          background: "#0a0812",
          border: "2px solid #ece6ff",
          boxShadow: "3px 3px 0 #ff3bd0",
          textDecoration: "none",
        }}
      >
        ← PINKMANE.SITE
      </Link>
    </div>
  );
}
