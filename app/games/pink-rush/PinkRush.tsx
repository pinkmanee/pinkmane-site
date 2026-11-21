"use client";

// PINK RUSH on a web page: a canvas that fills the screen, and the game running in it.
// The game itself lives in the game/ folder (engine, entities, levels, config).

import { useEffect, useRef } from "react";
import { Game } from "../../../game/engine/game";
import type { LevelData } from "../../../game/levels/types";
import testHill from "../../../game/levels/test-hill.json";

export default function PinkRush({ font }: { font: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new Game(canvas, testHill as unknown as LevelData, font);
    game.start();
    return () => game.destroy();
  }, [font]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#efe6da", overflow: "hidden", touchAction: "none" }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} aria-label="PINK RUSH" />
    </div>
  );
}
