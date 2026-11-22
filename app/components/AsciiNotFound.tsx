"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { AsciiArt, AsciiBackdrop, liftedPicture } from "./AsciiArt";
import { DUDE, DudeEyes } from "./Spiral";

// THE 404 PAGE in the ASCII look: "YOU'RE TOO HIGH".
// A hypno spiral made of characters slowly turns and twists behind everything, PINKMANE and the 404 are glowing
// characters, and his real spiral eyes spin on top.

const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

// the hypno spiral (two arms, slowly turning)
function drawSpiral(c: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.hypot(w, h) * 0.6;
  c.lineCap = "round";
  for (let arm = 0; arm < 2; arm++) {
    c.strokeStyle = arm === 0 ? "#45317e" : "#7a2572";
    c.lineWidth = Math.max(18, R * 0.07);
    c.beginPath();
    for (let i = 0; i <= 260; i++) {
      const u = i / 260;
      const r = 10 + u * R;
      const a = u * Math.PI * 2 * 3.2 + arm * Math.PI - t * 0.9;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i) c.lineTo(x, y);
      else c.moveTo(x, y);
    }
    c.stroke();
  }
}

export default function AsciiNotFound() {
  const art = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    liftedPicture(DUDE.src, "#5b4fb4", (c) => (art.current = c));
  }, []);
  const calm = typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <main className="nf">
      <AsciiBackdrop
        draw={drawSpiral}
        still={calm}
        warp={(w, h, t) => ({ cx: w / 2, cy: h / 2, radius: Math.max(w, h) * 0.35, twist: Math.sin(t * 0.6) * 1.6, pull: 0.25 + Math.sin(t * 0.43) * 0.2 })}
      />
      <div className="nf-shade" />
      <div className="nf-mid">
        <div className="nf-dude">
          <AsciiArt
            draw={(c, w, h) => {
              if (art.current) c.drawImage(art.current, 0, 0, w, h);
            }}
            cell={(w) => Math.max(3.5, w / 46)}
          />
          <DudeEyes speed={0.9} />
        </div>
        <div className="nf-text">
          <h1>YOU&apos;RE TOO HIGH</h1>
          <div className="nf-404" aria-label="404">
            <AsciiArt
              still={calm}
              draw={(c, w, h, t) => {
                c.fillStyle = "#ff3bd0";
                c.textAlign = "center";
                c.textBaseline = "middle";
                c.font = `900 ${Math.round(h * 0.95)}px Impact, "Arial Black", sans-serif`;
                c.save();
                c.translate(w / 2, h / 2);
                c.transform(1, 0, Math.sin(t * 2.4) * 0.12, 1, 0, 0); // (a slow drunk wobble)
                c.fillText("404", 0, 0);
                c.restore();
              }}
              cell={(w) => Math.max(3, w / 64)}
            />
          </div>
          <p>THIS PAGE DOESN&apos;T EXIST</p>
          <Link href="/" className="nf-home">
            TAKE ME HOME
          </Link>
        </div>
      </div>

      <style>{`
        .nf {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          background: #07050c;
          color: #ffffff;
          font-family: ${MONO};
          z-index: 10;
        }
        .nf-shade {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(7, 5, 12, 0.15) 0%, rgba(7, 5, 12, 0.75) 100%);
          pointer-events: none;
        }
        .nf-mid {
          position: relative;
          display: flex;
          align-items: center;
          gap: clamp(16px, 4vw, 56px);
          padding: 24px;
        }
        .nf-dude {
          position: relative;
          height: min(62vh, 560px);
          aspect-ratio: ${DUDE.w} / ${DUDE.h};
          flex: none;
          animation: nf-wobble 3.2s ease-in-out infinite;
        }
        .nf-text {
          display: flex;
          flex-direction: column;
          gap: 16px;
          max-width: 520px;
        }
        .nf-text h1 {
          margin: 0;
          font-size: clamp(22px, 3.6vw, 44px);
          font-weight: 800;
          line-height: 1.2;
          letter-spacing: 0.04em;
          color: #ff3bd0;
          text-shadow: 0 0 18px rgba(255, 59, 208, 0.6);
          animation: nf-drift 2.6s ease-in-out infinite;
        }
        .nf-404 {
          position: relative;
          width: clamp(220px, 30vw, 420px);
          aspect-ratio: 2.1 / 1;
        }
        .nf-text p {
          margin: 0;
          font-size: clamp(12px, 1.4vw, 16px);
          font-weight: 700;
          letter-spacing: 0.08em;
          color: #ece6ff;
        }
        .nf-home {
          align-self: flex-start;
          margin-top: 6px;
          padding: 12px 16px;
          font-size: clamp(12px, 1.3vw, 15px);
          font-weight: 800;
          letter-spacing: 0.06em;
          color: #ece6ff;
          background: #0a0812;
          border: 2px solid #ece6ff;
          box-shadow: 4px 4px 0 #ff3bd0;
          text-decoration: none;
        }
        .nf-home:hover,
        .nf-home:focus-visible {
          background: #ff3bd0;
          color: #ffffff;
          box-shadow: 4px 4px 0 #ece6ff;
          outline: none;
        }
        @media (max-width: 760px) {
          .nf-mid {
            flex-direction: column;
            text-align: center;
          }
          .nf-dude {
            height: 40vh;
          }
          .nf-text {
            align-items: center;
          }
          .nf-home {
            align-self: center;
          }
        }
        @keyframes nf-wobble {
          0%,
          100% {
            transform: rotate(-3deg) translateY(0);
          }
          50% {
            transform: rotate(3deg) translateY(-8px);
          }
        }
        @keyframes nf-drift {
          0%,
          100% {
            transform: translateX(0) skewX(0deg);
          }
          50% {
            transform: translateX(6px) skewX(-4deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .nf-dude,
          .nf-text h1 {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
