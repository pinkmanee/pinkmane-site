"use client";

import { useCallback, useEffect, useState } from "react";

// FULL SCREEN for phones and tablets.
//
// - Android, iPad and computers: the FULL button really does go full screen (the browser's own full-screen mode).
// - iPhone: Safari does NOT let a web page go full screen. The only way to lose the address bar there is to put the game on the
//   Home Screen and open it from there. So on an iPhone the button shows a little "how to" instead.
// - When the game is already running from the Home Screen there's nothing to do, so the button hides itself.
//
// It also adds the little tags (manifest, icon, "web app capable") that make the Home Screen version open full screen.

type FsDoc = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

const APP_NAME = "PINKMANE";

// Adds the "install it as an app" tags to the page (only the ones that aren't there already)
function addAppTags() {
  const head = document.head;
  const meta = (name: string, content: string) => {
    if (head.querySelector(`meta[name="${name}"]`)) return;
    const m = document.createElement("meta");
    m.name = name;
    m.content = content;
    head.appendChild(m);
  };
  const link = (rel: string, href: string) => {
    if (head.querySelector(`link[rel="${rel}"]`)) return;
    const l = document.createElement("link");
    l.rel = rel;
    l.href = href;
    head.appendChild(l);
  };
  link("manifest", "/manifest.webmanifest");
  link("apple-touch-icon", "/icons/apple-touch-icon.png");
  meta("apple-mobile-web-app-capable", "yes");
  meta("mobile-web-app-capable", "yes");
  meta("apple-mobile-web-app-title", APP_NAME);
  // "black-translucent" = the page goes right up under the status bar, so there is NO reserved black strip at the top. (The old "black"
  // one reserved a strip that could get stuck there after you turn the phone sideways.) A shortcut keeps the style it was made with:
  // delete the old one from your Home Screen and add it again to get this.
  meta("apple-mobile-web-app-status-bar-style", "black-translucent");
  meta("theme-color", "#d63cc8");
}

// When the game runs from the Home Screen: lock the page to the real screen. The page was sized with "100dvh", and in a Home Screen app
// that number can be stale right after turning the phone, which left the page taller than the screen (a black strip you had to
// swipe away). A locked page that is simply "the whole screen" can't get stuck like that.
const STANDALONE_CSS = `
  html.pm-standalone, html.pm-standalone body { position: fixed; inset: 0; width: 100%; height: 100%; overflow: hidden !important; overscroll-behavior: none; }
  html.pm-standalone main { height: 100% !important; min-height: 0 !important; overflow-x: hidden; overflow-y: auto; box-sizing: border-box; -webkit-overflow-scrolling: touch; }
  @media (orientation: portrait) { html.pm-standalone main { padding-top: env(safe-area-inset-top); } }
`;
function applyStandaloneFix() {
  const root = document.documentElement;
  root.classList.add("pm-standalone");
  if (!document.getElementById("pm-standalone-css")) {
    const st = document.createElement("style");
    st.id = "pm-standalone-css";
    st.textContent = STANDALONE_CSS;
    document.head.appendChild(st);
  }
  // go edge to edge (under the status bar and the notch): the page already pads itself with env(safe-area-inset-*)
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp) {
    const c = vp.getAttribute("content") || "";
    if (!/viewport-fit/.test(c)) vp.setAttribute("content", (c ? c + ", " : "width=device-width, initial-scale=1, ") + "viewport-fit=cover");
  } else {
    const m = document.createElement("meta");
    m.name = "viewport";
    m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
    document.head.appendChild(m);
  }
  // after turning the phone iOS can leave things the old size until you scroll: put the page back by hand, a few times
  let timers: number[] = [];
  const settle = () => window.scrollTo(0, 0);
  const onTurn = () => {
    timers.forEach((t) => window.clearTimeout(t));
    timers = [50, 250, 700].map((ms) => window.setTimeout(settle, ms));
  };
  window.addEventListener("orientationchange", onTurn);
  window.addEventListener("resize", onTurn);
  return () => {
    timers.forEach((t) => window.clearTimeout(t));
    window.removeEventListener("orientationchange", onTurn);
    window.removeEventListener("resize", onTurn);
  };
}

export function useFullscreen() {
  const [canFullscreen, setCanFullscreen] = useState(false); // does this browser allow real full screen?
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false); // already running from the Home Screen
  const [isIOS, setIsIOS] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const d = document as FsDoc;
    setCanFullscreen(!!(d.fullscreenEnabled || d.webkitFullscreenEnabled));
    const ua = navigator.userAgent;
    setIsIOS(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1));
    const nav = navigator as Navigator & { standalone?: boolean };
    const standalone =
      nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches;
    setIsStandalone(standalone);
    // (only on a phone or tablet: someone who installs the site as an app on a computer is left exactly as before)
    const undoStandalone = standalone && (navigator.maxTouchPoints > 0 || /iPhone|iPad|iPod/.test(ua)) ? applyStandaloneFix() : undefined;
    const onChange = () => setIsFullscreen(!!(d.fullscreenElement || d.webkitFullscreenElement));
    onChange();
    d.addEventListener("fullscreenchange", onChange);
    d.addEventListener("webkitfullscreenchange", onChange);
    addAppTags();
    return () => {
      d.removeEventListener("fullscreenchange", onChange);
      d.removeEventListener("webkitfullscreenchange", onChange);
      undoStandalone?.();
    };
  }, []);

  // The FULL / SMALL button
  const toggle = useCallback(async () => {
    const d = document as FsDoc;
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        if (d.exitFullscreen) await d.exitFullscreen();
        else if (d.webkitExitFullscreen) await d.webkitExitFullscreen();
        return;
      }
      const el = document.documentElement as FsEl;
      if (d.fullscreenEnabled && el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: "hide" });
      } else if (d.webkitFullscreenEnabled && el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
      } else {
        setHelpOpen(true); // iPhone: no real full screen, so show how to put it on the Home Screen
      }
    } catch {
      setHelpOpen(true); // the browser said no
    }
  }, []);

  return {
    show: !isStandalone, // (nothing to show once it's running from the Home Screen)
    canFullscreen,
    isFullscreen,
    isStandalone,
    isIOS,
    toggle,
    helpOpen,
    closeHelp: () => setHelpOpen(false),
  };
}

// A small FULL / SMALL button in the top-right corner (used on the menu screens; in a game the page's own button row has one)
export function FullscreenCornerButton({ onClick, isFullscreen, className }: { onClick: () => void; isFullscreen: boolean; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={isFullscreen ? "Leave full screen" : "Full screen"}
      style={{
        position: "fixed",
        top: "max(6px, env(safe-area-inset-top))",
        right: "max(6px, env(safe-area-inset-right))",
        zIndex: 60,
        minWidth: 46,
        height: 28,
        padding: "0 8px",
        fontSize: 7,
        color: "#fff",
        background: "rgba(17, 17, 17, 0.6)",
        border: "2px solid rgba(255, 255, 255, 0.75)",
        borderRadius: 0,
        touchAction: "manipulation",
      }}
    >
      {isFullscreen ? "SMALL" : "FULL"}
    </button>
  );
}

// "How to get full screen" (shown where the browser can't do it itself)
export function InstallHelp({ onClose, isIOS, className }: { onClose: () => void; isIOS: boolean; className?: string }) {
  // n = the step number (lines without one are just notes under the step above)
  const steps: { n?: number; t: string }[] = isIOS
    ? [
        { n: 1, t: "TAP THE SHARE BUTTON IN SAFARI" },
        { t: "(THE SQUARE WITH AN ARROW UP)" },
        { n: 2, t: "TAP ADD TO HOME SCREEN" },
        { n: 3, t: "OPEN PINKMANE FROM YOUR HOME SCREEN" },
      ]
    : [
        { n: 1, t: "OPEN YOUR BROWSER MENU (3 DOTS)" },
        { n: 2, t: "TAP ADD TO HOME SCREEN (OR INSTALL APP)" },
        { n: 3, t: "OPEN PINKMANE FROM YOUR HOME SCREEN" },
      ];
  return (
    <div
      className={className}
      role="dialog"
      aria-label="How to play full screen"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(10, 4, 18, 0.88)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        touchAction: "manipulation",
      }}
    >
      <div
        style={{
          maxWidth: "min(92vw, 460px)",
          maxHeight: "94dvh",
          overflow: "auto",
          background: "#16101d",
          border: "3px solid #d63cc8",
          padding: "14px 16px",
          color: "#fff",
          fontSize: 8,
          lineHeight: 1.9,
          textAlign: "center",
        }}
      >
        <div style={{ color: "#ffd700", marginBottom: 8 }}>FULL SCREEN</div>
        <div style={{ color: "#ffc8f0", marginBottom: 8 }}>{isIOS ? "IPHONE SAFARI CAN'T DO IT FROM A BUTTON," : "ADD THE GAME TO YOUR HOME SCREEN:"}</div>
        {isIOS && <div style={{ color: "#ffc8f0", marginBottom: 8 }}>SO PUT THE GAME ON YOUR HOME SCREEN:</div>}
        {steps.map((st, i) => (
          <div key={i} style={{ color: st.n ? "#fff" : "#b9a6c8" }}>
            {st.n ? `${st.n}. ${st.t}` : st.t}
          </div>
        ))}
        <div style={{ color: "#6fdc5a", marginTop: 8 }}>NO ADDRESS BAR THERE!</div>
        <div style={{ color: "#b9a6c8", marginTop: 10 }}>TAP ANYWHERE TO CLOSE</div>
      </div>
    </div>
  );
}
