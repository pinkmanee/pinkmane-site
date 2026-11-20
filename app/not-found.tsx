// THE 404 PAGE: shows when someone opens a link on pinkmane.site that doesn't exist.
// PINKMANE with spinning spiral eyes on the hypno background + a button back home.

import Link from "next/link";
import { Press_Start_2P } from "next/font/google";
import { DUDE, DudeEyes } from "./components/Spiral";

const pixelFont = Press_Start_2P({
  weight: "400",
  subsets: ["latin"],
});

export default function NotFound() {
  return (
    <main className={`nf ${pixelFont.className}`}>
      <div className="nf-bgwrap">
        <div className="nf-bg" />
      </div>
      <div className="nf-shade" />
      <div className="nf-mid">
        <div className="nf-dude">
          <img src={DUDE.src} alt="PINKMANE" draggable={false} />
          <DudeEyes speed={0.9} />
        </div>
        <div className="nf-text">
          <h1>YOU&apos;RE TOO HIGH</h1>
          <p className="nf-404">404</p>
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
          background: #12021a;
          color: #ffffff;
          z-index: 10;
        }
        .nf-bgwrap {
          position: absolute;
          inset: 0;
          animation: nf-hue 12s linear infinite;
        }
        .nf-bg {
          position: absolute;
          inset: -6%;
          background: url("/bg/mode4.jpg") center 22% / cover no-repeat;
          filter: blur(7px);
          animation: nf-breathe 8s ease-in-out infinite;
        }
        .nf-shade {
          position: absolute;
          inset: 0;
          background: radial-gradient(ellipse at center, rgba(10, 0, 16, 0.25) 0%, rgba(10, 0, 16, 0.85) 100%);
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
          filter: drop-shadow(0 0 18px rgba(255, 59, 208, 0.55));
        }
        .nf-dude img {
          display: block;
          width: 100%;
          height: 100%;
        }
        .nf-text {
          display: flex;
          flex-direction: column;
          gap: 18px;
          max-width: 520px;
        }
        .nf-text h1 {
          margin: 0;
          font-size: clamp(20px, 3.4vw, 40px);
          line-height: 1.3;
          color: #ff3bd0;
          text-shadow: 4px 4px 0 #000, 0 0 18px rgba(255, 59, 208, 0.7);
          animation: nf-drift 2.6s ease-in-out infinite;
        }
        .nf-text p {
          margin: 0;
          font-size: clamp(10px, 1.3vw, 14px);
          line-height: 1.8;
          text-shadow: 2px 2px 0 #000;
        }
        .nf-text .nf-404 {
          font-size: clamp(34px, 6vw, 72px);
          color: #ffd84a;
          text-shadow: 5px 5px 0 #000;
        }
        .nf-home {
          align-self: flex-start;
          margin-top: 8px;
          padding: 12px 16px;
          font-size: clamp(10px, 1.2vw, 13px);
          color: #ffffff;
          background: rgba(0, 0, 0, 0.55);
          border: 3px solid #ffffff;
          box-shadow: 4px 4px 0 #d63cc8;
          text-decoration: none;
        }
        .nf-home:hover,
        .nf-home:focus-visible {
          background: #ff3bd0;
          box-shadow: 4px 4px 0 #000;
          outline: none;
        }
        @media (max-width: 760px) {
          .nf-mid {
            flex-direction: column;
            text-align: center;
          }
          .nf-dude {
            height: 38vh;
          }
          .nf-home {
            align-self: center;
          }
        }
        @keyframes nf-hue {
          to {
            filter: hue-rotate(360deg);
          }
        }
        @keyframes nf-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.06);
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
          .nf-bgwrap,
          .nf-bg,
          .nf-dude,
          .nf-text h1 {
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
