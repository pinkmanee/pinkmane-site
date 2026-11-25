"use client";

import { useEffect, useState } from "react";

// THE LIVE DOT: a red blinking "LIVE" on the iPod while PINKMANE is streaming on Twitch. A tap opens the stream.
// It asks the site (app/api/live) when the page opens and then every 2 minutes; nothing shows while offline.
const TWITCH = "https://www.twitch.tv/pinkmanee";
const EVERY_MS = 120000;

export default function LiveDot({ font }: { font: string }) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let gone = false;
    const check = () => {
      if (document.hidden) return; // the tab isn't being looked at: don't ask
      fetch("/api/live")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (!gone && d) setLive(d.live === true);
        })
        .catch(() => {});
    };
    check();
    const t = window.setInterval(check, EVERY_MS);
    document.addEventListener("visibilitychange", check);
    return () => {
      gone = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!live) return null;
  return (
    <a
      className="live-dot"
      href={TWITCH}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontFamily: font }}
      aria-label="PINKMANE is live on Twitch right now. Watch the stream"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="live-dot-led" aria-hidden="true" />
      LIVE
      <style>{`
        .live-dot {
          position: absolute; top: 50%; right: 6px; transform: translateY(-50%); z-index: 3;
          display: flex; align-items: center; gap: 5px; padding: 4px 6px 4px 5px;
          font-size: 8px; line-height: 1; color: #fff; text-decoration: none;
          background: #e0142c; border: 2px solid #fff; box-shadow: 2px 2px 0 #000;
        }
        .live-dot:hover { background: #ff2a44; }
        .live-dot-led { width: 6px; height: 6px; background: #fff; animation: liveBlink 1s steps(2, start) infinite; }
        @keyframes liveBlink { to { visibility: hidden; } }
      `}</style>
    </a>
  );
}
