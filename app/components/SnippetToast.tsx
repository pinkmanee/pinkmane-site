"use client";

import { useEffect, useState } from "react";
import { SNIPPET_EVENT, type SnippetNews } from "./Snippets";

// The little message at the top of the screen after a run:
//   "SNIPPET UNLOCKED!" when a target score was beaten (the page adds it to the iPod's songs and plays it),
//   or how close the run was to the target ("1,240 / 2,000 FOR THE UNRELEASED SNIPPET").
// The rules and the target scores are in Snippets.ts.
export default function SnippetToast({ font, onUnlock }: { font: string; onUnlock: (file: string) => void }) {
  const [news, setNews] = useState<SnippetNews | null>(null);

  useEffect(() => {
    let timer = 0;
    const hear = (e: Event) => {
      const d = (e as CustomEvent<SnippetNews>).detail;
      if (!d) return;
      setNews(d);
      if (d.kind === "unlocked") onUnlock(d.file);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setNews(null), d.kind === "unlocked" ? 7000 : 4500);
    };
    window.addEventListener(SNIPPET_EVENT, hear);
    return () => {
      window.removeEventListener(SNIPPET_EVENT, hear);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!news) return null;
  const won = news.kind === "unlocked";
  return (
    <div className={`sn-toast ${won ? "sn-won" : ""}`} style={{ fontFamily: font }} role="status" onClick={() => setNews(null)}>
      {won ? (
        <>
          <div className="sn-big">SNIPPET UNLOCKED!</div>
          <div className="sn-small">{news.title.toUpperCase()} · NOW PLAYING ON THE IPOD</div>
        </>
      ) : (
        <>
          <div className="sn-small">
            {news.score.toLocaleString("en-US")} / {news.target.toLocaleString("en-US")}
          </div>
          <div className="sn-tiny">BEAT {news.target.toLocaleString("en-US")} TO UNLOCK AN UNRELEASED SNIPPET</div>
        </>
      )}
      <style>{`
        .sn-toast {
          position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
          z-index: 9000; max-width: calc(100vw - 24px); padding: 10px 14px; text-align: center;
          color: #fff; background: #1a0a24; border: 2px solid #7ad8ff; box-shadow: 4px 4px 0 #000;
          animation: snIn 0.3s ease-out; cursor: pointer;
        }
        .sn-won { border: 3px solid #ffd84a; box-shadow: 4px 4px 0 #000, 0 0 26px rgba(255, 216, 74, 0.5); }
        .sn-big { font-size: 13px; color: #ffd84a; text-shadow: 2px 2px 0 #000; }
        .sn-small { font-size: 9px; margin-top: 6px; line-height: 1.5; }
        .sn-toast:not(.sn-won) .sn-small { margin-top: 0; color: #7ad8ff; font-size: 11px; }
        .sn-tiny { font-size: 7px; margin-top: 6px; opacity: 0.8; line-height: 1.5; }
        @keyframes snIn { from { transform: translate(-50%, -30px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
      `}</style>
    </div>
  );
}
