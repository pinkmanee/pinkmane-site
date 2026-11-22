"use client";

// PINK RUSH on a web page: a canvas that fills the screen, and the game running in it.
// The game itself lives in the game/ folder (engine, entities, levels, config).
// It opens on the level select. pinkmane.site/games/pink-rush?level=3 jumps straight into level 3.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Game } from "../../../game/engine/game";
import { LEVELS } from "../../../game/levels";

export default function PinkRush({ font }: { font: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const asked = Number(new URLSearchParams(window.location.search).get("level"));
    const start = Number.isInteger(asked) && asked >= 1 && asked <= LEVELS.length ? asked - 1 : undefined;
    const game = new Game(canvas, LEVELS, font, start);
    game.start();
    return () => game.destroy();
  }, [font]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#07060c", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} aria-label="PINK RUSH" />
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
