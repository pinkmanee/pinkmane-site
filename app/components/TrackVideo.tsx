"use client";

import { useEffect, useRef, useState } from "react";

// THE MUSIC VIDEO (computers with a wide enough screen): a little pixel TV to the left of the iPod.
// While ENDER PEARLS is the song on the iPod, its YouTube video plays in it - muted (the sound is the site's own song),
// and locked to the song: play, pause, skip and scrub on the iPod and the video follows. Other songs: the TV is hidden.
// Clicking WATCH ON YOUTUBE opens the full video on YouTube.
//
// If the video starts a bit earlier or later than the mp3 (an intro, a black screen ...), change VIDEO_OFFSET:
//   the video is AHEAD of the song (shows things too early)  -> a negative number, e.g. -1.5
//   the video is BEHIND the song (shows things too late)     -> a positive number, e.g. 2
const VIDEO_OFFSET = 0;
const DRIFT = 0.35; // if the video drifts this many seconds away from the song, it jumps back in line

type YTPlayer = {
  mute: () => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (s: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  destroy: () => void;
  unloadModule?: (name: string) => void;
  setOption?: (module: string, option: string, value: unknown) => void;
};
type YTNamespace = {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      host?: string;
      width?: string;
      height?: string;
      playerVars?: Record<string, number | string>;
      events?: { onReady?: () => void; onStateChange?: (e: { data: number }) => void };
    },
  ) => YTPlayer;
};
type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

// YouTube's player code, loaded once (only when the TV first shows up)
let apiLoading: Promise<void> | null = null;
function loadYouTube(): Promise<void> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve();
  if (apiLoading) return apiLoading;
  apiLoading = new Promise((resolve) => {
    const before = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      before?.();
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.async = true;
    document.head.appendChild(s);
  });
  return apiLoading;
}

type Props = {
  // the video on YouTube (the part after youtu.be/)
  videoId: string;
  // the full link for the WATCH ON YOUTUBE button
  link: string;
  title: string;
  // the site's song player
  songRef: React.MutableRefObject<HTMLAudioElement | null>;
  // true = this video's song is the one on the iPod right now (and we're on the iPod, not in a game)
  show: boolean;
  fontFamily: string;
};

export default function TrackVideo({ videoId, link, title, songRef, show, fontFamily }: Props) {
  const holderRef = useRef<HTMLDivElement>(null);
  const tvRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);
  const showRef = useRef(show);
  showRef.current = show;
  const [started, setStarted] = useState(false); // the YouTube player is only made the first time the TV shows

  useEffect(() => {
    // phones, tablets and small windows never get the TV, so YouTube isn't even loaded there (saves their data)
    const noRoom = window.matchMedia?.("(max-width: 1150px), (hover: none)").matches ?? false;
    if (show && !noRoom) setStarted(true);
  }, [show]);

  // captions off (YouTube can turn them on by itself, e.g. auto-generated ones)
  const noCaptions = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setOption?.("captions", "track", {});
      p.unloadModule?.("captions");
      p.unloadModule?.("cc");
    } catch {}
  };

  // make the YouTube player (once)
  useEffect(() => {
    if (!started) return;
    let gone = false;
    loadYouTube().then(() => {
      const w = window as YTWindow;
      if (gone || !w.YT?.Player || !holderRef.current || playerRef.current) return;
      const spot = document.createElement("div");
      holderRef.current.appendChild(spot);
      playerRef.current = new w.YT.Player(spot, {
        videoId,
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 0,
          mute: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          rel: 0,
          playsinline: 1,
          modestbranding: 1,
          iv_load_policy: 3,
          cc_load_policy: 0, // no captions
        },
        events: {
          onReady: () => {
            readyRef.current = true;
            playerRef.current?.mute();
            noCaptions();
          },
          // YouTube switches captions on when the video starts playing, so switch them off again every time it starts
          onStateChange: (e) => {
            if (e.data === 1 || e.data === 3) noCaptions();
          },
        },
      });
    });
    return () => {
      gone = true;
    };
  }, [started, videoId]);

  // keep the video locked to the song, 5 times a second
  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current;
      const audio = songRef.current;
      if (!p || !readyRef.current || !audio) return;
      let state = -1;
      try {
        state = p.getPlayerState(); // 1 = playing, 3 = loading
      } catch {
        return;
      }
      const target = Math.max(0, audio.currentTime + VIDEO_OFFSET);
      if (!showRef.current || audio.paused) {
        if (state === 1 || state === 3) p.pauseVideo();
        // paused: still show the frame of where the song is
        if (showRef.current && Math.abs(p.getCurrentTime() - target) > DRIFT) p.seekTo(target, true);
        return;
      }
      p.mute();
      if (state !== 1 && state !== 3) {
        p.seekTo(target, true);
        p.playVideo();
      } else if (Math.abs(p.getCurrentTime() - target) > DRIFT) {
        p.seekTo(target, true);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [songRef]);

  useEffect(
    () => () => {
      try {
        playerRef.current?.destroy();
      } catch {}
      playerRef.current = null;
    },
    [],
  );

  // The TV sits BEHIND the flying PINKMANEs (so you can shoot them over the video), but its button has to be in front
  // to be clickable, so the button is its own piece that's kept right under the TV
  useEffect(() => {
    const place = () => {
      const tv = tvRef.current;
      const a = linkRef.current;
      if (!tv || !a) return;
      const r = tv.getBoundingClientRect();
      a.style.left = `${r.left}px`;
      a.style.top = `${r.bottom - 4}px`;
      a.style.width = `${r.width}px`;
    };
    place();
    const id = window.setInterval(place, 250);
    window.addEventListener("resize", place);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", place);
    };
  }, []);

  return (
    <>
    <div ref={tvRef} className={`tv ${show ? "tv-on" : ""}`} aria-hidden={!show}>
      <div className="tv-head" style={{ fontFamily }}>
        <span className="tv-dot" /> NOW PLAYING · {title}
      </div>
      <div className="tv-screen">
        <div ref={holderRef} className="tv-player" />
        <div className="tv-scan" />
      </div>
    </div>
    <a
      ref={linkRef}
      className={`tv-link ${show ? "tv-on-link" : ""}`}
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      style={{ fontFamily }}
      tabIndex={show ? 0 : -1}
    >
      ▶ WATCH ON YOUTUBE
    </a>
      <style>{`
        .tv {
          /* centred in the space left of the iPod */
          --tvw: min(420px, calc((100vw - 640px) / 2 - 48px));
          position: fixed;
          left: max(24px, calc((100vw - 540px) / 4 - var(--tvw) / 2));
          top: 50%;
          width: var(--tvw);
          transform: translateY(-50%) scale(0.96);
          /* behind the flying PINKMANEs (they're on layer 0), in front of the background picture (layer -1) */
          z-index: -1;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.4s ease, transform 0.4s ease;
          background: #111;
          border: 4px solid #111;
          box-shadow: 0 0 0 3px #fff, 0 0 22px rgba(214, 60, 200, 0.65);
        }
        .tv-on {
          opacity: 1;
          transform: translateY(-50%) scale(1);
        }
        .tv-head {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 8px;
          color: #ff8ad8;
          font-size: 10px;
          letter-spacing: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-transform: uppercase;
        }
        .tv-dot {
          width: 8px;
          height: 8px;
          background: #ff3b3b;
          box-shadow: 0 0 6px #ff3b3b;
          animation: tvBlink 1s steps(2) infinite;
          flex: none;
        }
        @keyframes tvBlink {
          50% {
            opacity: 0.2;
          }
        }
        .tv-screen {
          position: relative;
          width: 100%;
          aspect-ratio: 16 / 9;
          background: #000;
          overflow: hidden;
        }
        .tv-player,
        .tv-player iframe {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          /* the video can't be clicked: the iPod controls it (the button below opens YouTube) */
          pointer-events: none;
        }
        .tv-scan {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px);
          box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.6);
        }
        .tv-link {
          position: fixed;
          z-index: 2;
          box-sizing: border-box;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.4s ease;
          border: 4px solid #111;
          border-top: 0;
          box-shadow: 0 0 0 3px #fff;
          display: block;
          padding: 8px;
          text-align: center;
          color: #fff;
          background: #d63cc8;
          font-size: 10px;
          text-decoration: none;
          letter-spacing: 1px;
        }
        .tv-on-link {
          opacity: 1;
          pointer-events: auto;
        }
        .tv-link:hover {
          background: #ff3bd0;
        }
        /* small windows (no room next to the iPod) and phones: no TV */
        @media (max-width: 1150px), (hover: none) {
          .tv,
          .tv-link {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
