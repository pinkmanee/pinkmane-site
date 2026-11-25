"use client";

import { useState } from "react";
import { Press_Start_2P } from "next/font/google";

// YOUR PRIVATE PAGE: pinkmane.site/drops
// Type your owner code (the same secret as for the scoreboards) and you see everyone who pressed NOTIFY ME.
// COPY ALL puts every email on your clipboard: paste them into the BCC line of an email, so nobody sees the others.
// Without the right code this page shows nothing. The code is only sent to your own site, never kept in a link.

const pixelFont = Press_Start_2P({ weight: "400", subsets: ["latin"] });
type Row = { email: string; at: number };

export default function DropsPage() {
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const ask = async (remove?: string) => {
    if (busy || !code) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(remove ? { code, remove } : { code }),
      });
      const d = (await res.json().catch(() => null)) as { emails?: Row[]; error?: string } | null;
      if (res.ok && d && Array.isArray(d.emails)) setRows(d.emails);
      else setMsg(d?.error === "wrong code" ? "WRONG CODE" : d?.error === "slow down" ? "TOO MANY TRIES, WAIT AN HOUR" : "COULDN'T LOAD IT, TRY AGAIN LATER");
    } catch {
      setMsg("COULDN'T LOAD IT, TRY AGAIN LATER");
    }
    setBusy(false);
  };

  const copyAll = async () => {
    if (!rows) return;
    try {
      await navigator.clipboard.writeText(rows.map((r) => r.email).join(", "));
      setMsg(`COPIED ${rows.length} EMAILS · PASTE THEM INTO BCC`);
    } catch {
      setMsg("COULDN'T COPY, SELECT THEM BY HAND");
    }
  };

  const day = (at: number) => (at ? new Date(at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

  return (
    <main className={`${pixelFont.className} dl-page`}>
      <h1 className="dl-title">DROP LIST</h1>
      {rows === null ? (
        <form
          className="dl-form"
          onSubmit={(e) => {
            e.preventDefault();
            ask();
          }}
        >
          <label className="dl-label" htmlFor="dl-code">
            OWNER CODE
          </label>
          <input id="dl-code" className="dl-input" type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="current-password" />
          <button className="dl-btn" type="submit" disabled={busy || !code}>
            {busy ? "..." : "SHOW THE LIST"}
          </button>
        </form>
      ) : (
        <>
          <div className="dl-count">
            {rows.length} {rows.length === 1 ? "PERSON" : "PEOPLE"} ON THE LIST
          </div>
          <button className="dl-btn" onClick={copyAll} disabled={!rows.length}>
            COPY ALL
          </button>
          <ul className="dl-list">
            {rows.map((r) => (
              <li key={r.email} className="dl-row">
                <span className="dl-email">{r.email}</span>
                <span className="dl-day">{day(r.at)}</span>
                <button
                  className="dl-x"
                  aria-label={`Remove ${r.email}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Take ${r.email} off the list?`)) ask(r.email);
                  }}
                >
                  X
                </button>
              </li>
            ))}
          </ul>
          <p className="dl-tip">Mailing them: put the emails in BCC (not TO), so nobody sees anyone else&apos;s address. If someone asks to be taken off, press the X next to their email.</p>
        </>
      )}
      {msg && <div className="dl-msg">{msg}</div>}
      <a className="dl-back" href="/">
        ← BACK TO THE SITE
      </a>
      <style>{`
        body { margin: 0; background: #12061a; }
        .dl-page { min-height: 100vh; box-sizing: border-box; padding: 40px 16px; color: #fff; text-align: center; max-width: 560px; margin: 0 auto; }
        .dl-title { font-size: 20px; color: #ff8ff0; text-shadow: 3px 3px 0 #000; margin: 0 0 28px; }
        .dl-form { display: flex; flex-direction: column; align-items: center; gap: 12px; }
        .dl-label { font-size: 9px; opacity: 0.8; }
        .dl-input { width: min(300px, 100%); box-sizing: border-box; padding: 10px; font-size: 16px; text-align: center; color: #1a0a24; background: #ffe6f8; border: 2px solid #ff5fd2; outline: none; user-select: text; -webkit-user-select: text; }
        .dl-btn { font-family: inherit; font-size: 11px; color: #fff; cursor: pointer; padding: 10px 18px; background: #d63cc8; border: 2px solid #fff; box-shadow: 3px 3px 0 #000; }
        .dl-btn:disabled { opacity: 0.5; cursor: default; }
        .dl-count { font-size: 11px; margin-bottom: 16px; color: #7dffb0; }
        .dl-list { list-style: none; padding: 0; margin: 22px 0 0; text-align: left; }
        .dl-row { display: flex; align-items: center; gap: 10px; padding: 9px 4px; border-bottom: 1px dashed #4a2c5a; }
        .dl-email { flex: 1; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
        .dl-day { font-size: 7px; opacity: 0.6; white-space: nowrap; }
        .dl-x { font-family: inherit; font-size: 8px; color: #fff; background: #2a1438; border: 2px solid #ff5fd2; width: 24px; height: 24px; cursor: pointer; }
        .dl-tip { font-size: 7px; line-height: 2; opacity: 0.65; margin-top: 22px; }
        .dl-msg { font-size: 9px; color: #ffd84a; margin-top: 18px; line-height: 1.6; }
        .dl-back { display: inline-block; margin-top: 30px; font-size: 8px; color: #b99ac8; }
      `}</style>
    </main>
  );
}
