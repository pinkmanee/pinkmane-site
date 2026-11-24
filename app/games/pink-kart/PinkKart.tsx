"use client";

// PINK KART on a web page: a canvas that fills the screen, and the game running in it.
// The game itself lives in game/kart/kart.ts, its pictures in public/kart/.

import Link from "next/link";
import { useEffect, useRef } from "react";
import { KartGame } from "../../../game/kart/kart";

export default function PinkKart({ pixelFont }: { pixelFont: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new KartGame(canvas, pixelFont);
    game.start();
    return () => game.destroy();
  }, [pixelFont]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#07060c", overflow: "hidden", touchAction: "none", userSelect: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} aria-label="PINK KART" />
      {/* back to the main site, straight into its game list */}
      <Link
        href="/"
        onClick={() => {
          try {
            sessionStorage.setItem("pinkmane-open-games", "1");
          } catch {}
        }}
        style={{
          position: "absolute",
          left: 12,
          top: 10,
          padding: "6px 10px",
          fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
          fontWeight: 700,
          fontSize: 12,
          color: "#ece6ff",
          background: "rgba(10,8,18,0.6)",
          border: "2px solid #ece6ff",
          textDecoration: "none",
          opacity: 0.7,
        }}
      >
        ← GAMES
      </Link>
    </div>
  );
}
