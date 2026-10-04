"use client";

import { useEffect, useState } from "react";

// A FLIGHT RECORDER for phones. When the game throws you back to the menu, nothing tells us why. This writes down the last few things
// that happened (the page loading, leaving the game and what asked for it, the page being hidden or reloaded, errors, zone changes,
// deaths) and keeps them in the phone's storage, so they survive even if the page is closed or reloaded.
//
//   - It only records on phones and tablets (or anywhere with ?trace=1 on the end of the address). A computer records nothing.
//   - To READ it: open the site with ?trace=1 on the end (pinkmane.site/?trace=1). A small green report shows at the top of the screen,
//     and it's still there after a crash or reload. Take a screenshot of it.
const RING_KEY = "pinksuper-trace";
const ON_KEY = "pinksuper-trace-on";
const SESSION_KEY = "pinksuper-session"; // the game's heartbeat (see SuperGame.tsx)
const PAGE_KEY = "pinksuper-pagebeat"; // the page's heartbeat: how long it's been open and what the music is doing
const RING_MAX = 16;

export type TraceEvent = { t: number; k: string; d?: string };

let enabled = false;
const isOn = () => {
  if (enabled) return true;
  try {
    return localStorage.getItem(ON_KEY) === "1";
  } catch {
    return false;
  }
};

// Writes one thing down (does nothing unless the recorder is on)
export function trace(k: string, d?: string) {
  if (typeof window === "undefined" || !isOn()) return;
  try {
    const arr: TraceEvent[] = JSON.parse(localStorage.getItem(RING_KEY) || "[]");
    arr.push({ t: Date.now(), k, d: d ? d.slice(0, 90) : undefined });
    while (arr.length > RING_MAX) arr.shift();
    localStorage.setItem(RING_KEY, JSON.stringify(arr));
  } catch {}
}

// Is the recorder on? (so callers can skip work when it isn't)
export const traceActive = () => typeof window !== "undefined" && isOn();

// The page's own heartbeat (one line that gets overwritten every second)
export function writePageBeat(info: Record<string, unknown>) {
  if (typeof window === "undefined" || !isOn()) return;
  try {
    localStorage.setItem(PAGE_KEY, JSON.stringify({ ...info, at: Date.now() }));
  } catch {}
}

export function readTrace(): TraceEvent[] {
  try {
    const arr = JSON.parse(localStorage.getItem(RING_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

let installed = false;
// Turns the recorder on and starts listening for the page being hidden, reloaded, frozen, resized, or hit by an error
export function enableTrace() {
  if (typeof window === "undefined") return;
  enabled = true;
  try {
    localStorage.setItem(ON_KEY, "1");
  } catch {}
  if (installed) return;
  installed = true;
  const nav = (typeof performance !== "undefined" && performance.getEntriesByType ? performance.getEntriesByType("navigation")[0] : undefined) as
    | PerformanceNavigationTiming
    | undefined;
  trace("load", `${nav?.type ?? "?"} history=${window.history.length} ${window.innerWidth}x${window.innerHeight}`);
  window.addEventListener("pagehide", (e) => trace("pagehide", `persisted=${(e as PageTransitionEvent).persisted}`));
  window.addEventListener("pageshow", (e) => trace("pageshow", `persisted=${(e as PageTransitionEvent).persisted}`));
  document.addEventListener("visibilitychange", () => trace("visibility", document.visibilityState));
  document.addEventListener("freeze", () => trace("freeze"));
  document.addEventListener("resume", () => trace("resume"));
  window.addEventListener("error", (e) => trace("error", String(e.message || "?")));
  window.addEventListener("unhandledrejection", (e) => trace("rejection", String((e as PromiseRejectionEvent).reason).slice(0, 70)));
  let lastSize = "";
  let lastAt = 0;
  const onSize = () => {
    const size = `${window.innerWidth}x${window.innerHeight}`;
    if (size === lastSize || Date.now() - lastAt < 1500) return; // (not every tiny change, and at most one every 1.5 seconds)
    lastSize = size;
    lastAt = Date.now();
    trace("resize", size);
  };
  window.addEventListener("resize", onSize);
  window.addEventListener("orientationchange", () => trace("orientation", `${window.innerWidth}x${window.innerHeight}`));
}

// Switches the recorder on for phones/tablets (and for ?trace=1). Returns true when the on-screen report should be shown (?trace=1).
export function useTraceSetup(isTouch: boolean): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const forced = new URLSearchParams(window.location.search).has("trace");
    setShow(forced);
    if (isTouch || forced) enableTrace();
  }, [isTouch]);
  return show;
}

// The little green report (only with ?trace=1)
export function TraceOverlay() {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const now = Date.now();
  const ago = (t: number) => {
    const s = (now - t) / 1000;
    return s < 100 ? `${s.toFixed(1)}s` : `${Math.round(s / 60)}m`;
  };
  const lines: string[] = ["FLIGHT RECORDER (oldest first)"];
  for (const e of readTrace()) lines.push(`${ago(e.t).padStart(6)} ago  ${e.k}${e.d ? " " + e.d : ""}`);
  try {
    const b = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (b) {
      lines.push(`GAME ${ago(b.at)} ago: ${b.running ? "RUNNING" : "ended properly"}, zone ${b.zone}, ${b.sec}s, column ${b.col ?? "?"}, ${b.mode ?? "?"}, lives ${b.lives ?? "?"}, score ${b.score ?? "?"}`);
      if (b.fps !== undefined) lines.push(`     frames ${b.fps}ms avg, ${b.worst}ms worst | sounds made ${b.snd} | enemies ${b.ent}, particles ${b.parts}, columns ${b.ncols}`);
    }
  } catch {}
  try {
    const p = JSON.parse(localStorage.getItem(PAGE_KEY) || "null");
    if (p) lines.push(`PAGE ${ago(p.at)} ago: open ${p.up}s, song #${p.song} at ${p.pos}/${p.dur}s ${p.paused ? "PAUSED" : "playing"}${p.muted ? " MUTED" : ""}, ${p.where}`);
  } catch {}
  return (
    <pre
      style={{
        position: "fixed",
        top: 4,
        left: 4,
        zIndex: 99999,
        margin: 0,
        padding: "4px 6px",
        maxWidth: "94vw",
        background: "rgba(0, 0, 0, 0.78)",
        color: "#9f9",
        font: "9px/1.3 monospace",
        pointerEvents: "none",
        whiteSpace: "pre-wrap",
      }}
    >
      {lines.join("\n")}
    </pre>
  );
}
