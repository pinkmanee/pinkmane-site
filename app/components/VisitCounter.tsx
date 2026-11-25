"use client";

import { useEffect, useState } from "react";

// THE VISIT COUNTER: bottom right, small. "VISITS" = everyone's visits added up, "YOU" = how many times you've been here.
// One visit is counted per browser session (refreshing doesn't count again). The numbers live in the same database as the
// scoreboards (app/api/visits). Uses the same device id as the scoreboards, so it's the same "you" everywhere.

const DEVICE_KEY = "pinkrun-device";

function deviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

const fmt = (n: number) => n.toLocaleString("en-US").replace(/,/g, " ");

export default function VisitCounter({ font, hidden = false }: { font: string; hidden?: boolean }) {
  const [nums, setNums] = useState<{ total: number; mine: number } | null>(null);
  useEffect(() => {
    let gone = false;
    const id = deviceId();
    let counted = false;
    try {
      counted = sessionStorage.getItem("pinkmane-visit-counted") === "1";
    } catch {}
    const mineSaved = (() => {
      try {
        return Number(localStorage.getItem("pinkmane-my-visits")) || 0;
      } catch {
        return 0;
      }
    })();
    const req =
      counted || !id
        ? fetch("/api/visits").then((r) => r.json()).then((d) => ({ total: Number(d.total) || 0, mine: mineSaved }))
        : fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device: id }) })
            .then((r) => r.json())
            .then((d) => {
              try {
                sessionStorage.setItem("pinkmane-visit-counted", "1");
                localStorage.setItem("pinkmane-my-visits", String(Number(d.mine) || 0));
              } catch {}
              return { total: Number(d.total) || 0, mine: Number(d.mine) || 0 };
            });
    req
      .then((n) => {
        if (!gone && n.total > 0) setNums(n);
      })
      .catch(() => {}); // database offline: just don't show it
    return () => {
      gone = true;
    };
  }, []);

  if (!nums || hidden) return null;
  return (
    <div className="visit-count" style={{ fontFamily: font }} aria-label={`${nums.total} visits, ${nums.mine} of them yours`}>
      VISITS {fmt(nums.total)}
      {nums.mine > 0 && <span className="visit-you"> · YOU {fmt(nums.mine)}</span>}
      <style>{`
        .visit-count {
          position: fixed;
          right: max(10px, env(safe-area-inset-right));
          bottom: max(8px, env(safe-area-inset-bottom));
          z-index: 2;
          font-size: 8px;
          letter-spacing: 1px;
          color: #fff;
          background: rgba(14, 4, 20, 0.6);
          border: 1px solid rgba(255, 95, 210, 0.7);
          padding: 5px 7px;
          text-shadow: 1px 1px 0 #000;
          pointer-events: none;
          -webkit-user-select: none;
          user-select: none;
        }
        .visit-you {
          color: #ff8ff0;
        }
      `}</style>
    </div>
  );
}
