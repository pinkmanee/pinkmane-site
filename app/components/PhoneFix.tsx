"use client";

import { useEffect } from "react";

// PHONES + TABLETS: small fixes for the whole site, on every page.
//
// - Pinch zoom is off. iPhones ignore the "no zoom" setting in Safari, and in the Home Screen app a zoomed-in page had no way back
//   (the games catch your fingers, so you couldn't pinch out again). Here the pinch is simply stopped before it starts.
// - Holding a finger down doesn't start selecting text (that turned the screen blue mid-game). Boxes you type in still work.
// Computers aren't touched by any of this.
export default function PhoneFix() {
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    // iPhone / iPad pinch (Safari's own "gesture" events)
    document.addEventListener("gesturestart", stop, { passive: false });
    document.addEventListener("gesturechange", stop, { passive: false });
    document.addEventListener("gestureend", stop, { passive: false });
    // no text selection by holding a finger down (unless it's in a box you type in)
    const noSelect = (e: Event) => {
      if (!window.matchMedia("(any-hover: none)").matches) return;
      const t = e.target as HTMLElement | null;
      const el = t && t.nodeType === 1 ? t : (t?.parentElement ?? null);
      if (el?.closest("input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    };
    document.addEventListener("selectstart", noSelect);
    return () => {
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      document.removeEventListener("gestureend", stop);
      document.removeEventListener("selectstart", noSelect);
    };
  }, []);
  return null;
}
