"use client";

import { useEffect, useRef, useState } from "react";

// DROP ALERTS: the NOTIFY ME card. A visitor types an email and gets on the list for the next song or merch drop.
// The list is saved by app/api/notify. You read it on your private page: pinkmane.site/drops
//
// How a page uses it:
//   const [dropOpen, setDropOpen] = useState(false);
//   <DropAlert open={dropOpen} onClose={() => setDropOpen(false)} font={pixelFont.style.fontFamily} />
// While it's open it takes the keyboard (so typing a "w" doesn't move the iPod menu behind it).

const SAVED_KEY = "pinkmane-notify"; // remembers on this device that you already signed up

const WHY: Record<string, string> = {
  "bad email": "THAT DOESN'T LOOK LIKE AN EMAIL",
  "slow down": "TOO MANY TRIES, WAIT A BIT",
  full: "THE LIST IS FULL RIGHT NOW",
  offline: "COULDN'T SAVE IT, TRY AGAIN LATER",
};

export default function DropAlert({ open, onClose, font }: { open: boolean; onClose: () => void; font: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"form" | "saving" | "done">("form");
  const [msg, setMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const live = useRef({ email, state });
  live.current = { email, state };

  // opening: already on the list (on this device) = say so, otherwise an empty form with the cursor in it
  useEffect(() => {
    if (!open) return;
    let already = false;
    try {
      already = localStorage.getItem(SAVED_KEY) === "1";
    } catch {}
    setState(already ? "done" : "form");
    setMsg("");
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open]);

  const send = async () => {
    const { email: typed, state: now } = live.current;
    if (now !== "form") return;
    const clean = typed.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(clean)) {
      setMsg(WHY["bad email"]);
      return;
    }
    setState("saving");
    setMsg("");
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: clean }),
      });
      if (res.ok) {
        try {
          localStorage.setItem(SAVED_KEY, "1");
        } catch {}
        setEmail("");
        setState("done");
        return;
      }
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      setMsg(WHY[d?.error || "offline"] || WHY.offline);
    } catch {
      setMsg(WHY.offline);
    }
    setState("form");
  };

  // the keyboard belongs to the card while it's open
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (live.current.state === "done") onClose();
        else send();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="da-wrap" style={{ fontFamily: font }} role="dialog" aria-label="Drop alerts" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="da-card">
        <button className="da-x" onClick={onClose} aria-label="Close" data-shoot>
          X
        </button>
        <div className="da-title">DROP ALERTS</div>
        {state === "done" ? (
          <>
            <div className="da-big">YOU&apos;RE ON THE LIST</div>
            <div className="da-text">you&apos;ll get an email when the next song or merch drops.</div>
            <button className="da-btn" onClick={onClose} data-shoot>
              OK
            </button>
            <button
              className="da-link"
              onClick={() => {
                try {
                  localStorage.removeItem(SAVED_KEY);
                } catch {}
                setState("form");
                window.setTimeout(() => inputRef.current?.focus(), 60);
              }}
            >
              add another email
            </button>
          </>
        ) : (
          <>
            <div className="da-text">be the first to know when the next song or merch drops.</div>
            <input
              ref={inputRef}
              className="da-input"
              type="email"
              inputMode="email"
              value={email}
              maxLength={120}
              placeholder="your@email.com"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="send"
              aria-label="Your email"
              onChange={(e) => setEmail(e.target.value)}
              onClick={(e) => e.currentTarget.focus()}
            />
            <button className="da-btn" onClick={send} disabled={state === "saving"} data-shoot>
              {state === "saving" ? "SAVING..." : "NOTIFY ME"}
            </button>
            {msg && <div className="da-msg">{msg}</div>}
          </>
        )}
        <div className="da-note">only used for PINKMANE drop news · never shared · DM @pinkmanee on Instagram to be taken off</div>
      </div>
      <style>{`
        .da-wrap {
          position: fixed; inset: 0; z-index: 9500; display: flex; align-items: center; justify-content: center;
          padding: 16px; background: rgba(10, 2, 16, 0.7); cursor: default;
        }
        .da-card {
          position: relative; width: min(360px, 100%); padding: 20px 16px 14px; text-align: center; color: #fff;
          background: #1a0a24; border: 3px solid #ff5fd2; box-shadow: 6px 6px 0 #000, 0 0 30px rgba(255, 95, 210, 0.35);
          animation: daIn 0.25s ease-out;
        }
        @keyframes daIn { from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .da-x {
          position: absolute; top: 6px; right: 6px; width: 26px; height: 26px; font-family: inherit; font-size: 10px;
          color: #fff; background: #2a1438; border: 2px solid #ff5fd2; cursor: pointer;
        }
        .da-title { font-size: 15px; color: #ff8ff0; text-shadow: 2px 2px 0 #000; }
        .da-big { font-size: 12px; color: #7dffb0; margin: 16px 0 4px; }
        .da-text { font-size: 9px; line-height: 1.7; margin: 12px 0 14px; opacity: 0.92; }
        .da-input {
          display: block; width: 100%; box-sizing: border-box; margin: 0 0 12px; padding: 10px 8px; text-align: center;
          font-family: inherit; font-size: 16px; color: #1a0a24; background: #ffe6f8; border: 2px solid #ff5fd2; outline: none;
          user-select: text; -webkit-user-select: text;
        }
        .da-input:focus { border-color: #fff; box-shadow: 0 0 0 2px #ff5fd2; }
        .da-btn {
          font-family: inherit; font-size: 12px; color: #fff; cursor: pointer;
          padding: 10px 22px; background: #d63cc8; border: 2px solid #fff; box-shadow: 3px 3px 0 #000;
        }
        .da-btn:disabled { opacity: 0.6; }
        .da-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
        .da-link { display: block; margin: 12px auto 0; font-family: inherit; font-size: 7px; color: #b99ac8; background: none; border: 0; text-decoration: underline; cursor: pointer; }
        .da-msg { font-size: 8px; color: #ff8a8a; margin-top: 12px; line-height: 1.5; }
        .da-note { font-size: 7px; margin-top: 14px; opacity: 0.6; line-height: 1.8; }
      `}</style>
    </div>
  );
}
