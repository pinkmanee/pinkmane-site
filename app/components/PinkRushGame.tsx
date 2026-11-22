"use client";

// PINK RUSH on the PSP (like every other game): it plays inside the handheld's screen,
// and the PSP's FULLSCREEN button makes it fill the monitor. The game itself lives in the game/ folder.
// Every level has its own online Top 10 of times (rush-l1, rush-l2 ...).
// (pinkmane.site/games/pink-rush still works too: the same game on its own page.)

import { useEffect, useRef } from "react";
import { Permanent_Marker } from "next/font/google";
import { Game } from "../../game/engine/game";
import { LEVELS } from "../../game/levels";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { leaveToGameMenu } from "./PinkShop";

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"] }); // (the paper look's signs)

// a level time is saved on the board as LEVEL_TIME_BASE - milliseconds (faster = higher), like PINKMANE VOID's levels
const LEVEL_TIME_BASE = 10000000;
const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
const fmtScore = (score: number) => fmtTime(LEVEL_TIME_BASE - score);

export default function PinkRushGame({ fontFamily }: { fontFamily: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boards = useRef<{ current: ScoreApi | null }[]>(LEVELS.map(() => ({ current: null })));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, LEVELS, marker.style.fontFamily, undefined, fontFamily);
    const b = boards.current;
    game.onLevelDone = (level, seconds) => b[level]?.current?.gameOver(LEVEL_TIME_BASE - Math.round(seconds * 1000), seconds);
    game.onShowBoard = (level) => b[level]?.current?.show();
    game.isBusy = () => b.some((x) => x.current?.busy());
    game.topOf = (level) => {
      const t = b[level]?.current?.top();
      return t ? { name: t.name, time: (LEVEL_TIME_BASE - t.score) / 1000 } : null;
    };
    game.onGameMenu = leaveToGameMenu; // back to the PSP's game list, like every game
    game.start();
    return () => game.destroy();
  }, [fontFamily]);

  return (
    <div style={{ position: "absolute", inset: 0, background: "#07060c", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} aria-label="PINK RUSH" />
      {LEVELS.map((lv, i) => (
        <ScorePanel
          key={i}
          game={`rush-l${i + 1}`}
          title={`PINK RUSH ${i + 1}: ${lv.name}`}
          apiRef={boards.current[i]}
          fontFamily={fontFamily}
          width={336}
          height={160}
          format={fmtScore}
          minScore={1}
        />
      ))}
    </div>
  );
}
