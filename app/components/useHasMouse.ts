"use client";

// Does this device have a mouse or touchpad?
// Laptops with a touch screen sometimes tell the browser they're "touch only" (e.g. Windows tablet mode), which hid the gun,
// the music video and the key legend. So: a computer that says it has a mouse counts, and so does any real mouse move.
// Phones never send mouse moves, so they keep the touch version.
// It also puts the class "has-mouse" on the page (<html>), for the CSS.

import { useEffect, useState } from "react";

export function useHasMouse() {
  const [hasMouse, setHasMouse] = useState(false);
  useEffect(() => {
    const mark = () => {
      setHasMouse(true);
      document.documentElement.classList.add("has-mouse");
    };
    if (document.documentElement.classList.contains("has-mouse") || window.matchMedia?.("(any-pointer: fine)").matches) {
      mark();
      return;
    }
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      window.removeEventListener("pointermove", onMove);
      mark();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);
  return hasMouse;
}
