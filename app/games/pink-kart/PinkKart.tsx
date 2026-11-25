"use client";

// PINK KART on a web page: the race runs on a canvas that fills the screen (game/kart/kart.ts),
// and the menus are drawn on top of it here: SOLO, CREATE LOBBY, JOIN LOBBY, the lobby itself,
// and in STREAM MODE the winner's song.
//
// Online goes through the site (app/api/kart/token) and Ably (game/kart/net.ts + online.ts).
// To try online on one computer without Ably: pinkmane.site/games/pink-kart?local (then open a second tab).

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { KartGame, TRACKS } from "../../../game/kart/kart";
import { Session, MAX_RACERS, type View } from "../../../game/kart/online";
import { cleanCode, cleanMusicLink, cleanRacerName, musicSite } from "../../../game/kart/links";

type Screen = "menu" | "create" | "join" | "online" | "none";

const PINK = "#ff46c8";
const INK = "#12041c";
const PALE = "#ece6ff";

export default function PinkKart({ pixelFont }: { pixelFont: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<KartGame | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [local, setLocal] = useState(false);
  // the forms (the name and link are remembered for next time)
  const [name, setName] = useState("");
  const [link, setLink] = useState("");
  const [code, setCode] = useState("");
  const [owner, setOwner] = useState("");
  const [stream, setStream] = useState(false);
  const [bots, setBots] = useState(true);
  const [track, setTrack] = useState(0); // which track: solo, and the lobby you host
  const [needLink, setNeedLink] = useState(false); // the song box only shows after a stream lobby asked for it

  // ---- start the game, read ?join=CODE and ?local
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const game = new KartGame(canvas, pixelFont);
    game.overlay = true;
    // the rows of the game's pause menu (Esc): KART MENU, LEAVE / CLOSE LOBBY, GAME MENU
    const leaveLobby = () => {
      sessionRef.current?.leave();
      sessionRef.current = null;
      setView(null);
    };
    game.onMenu = () => {
      game.toLobby();
      setScreen("menu");
    };
    game.onLeave = () => {
      leaveLobby();
      game.toLobby();
      setScreen("menu");
    };
    game.onGameMenu = () => {
      leaveLobby();
      try {
        sessionStorage.setItem("pinkmane-open-games", "1");
      } catch {}
      window.location.href = "/";
    };
    gameRef.current = game;
    game.start();
    const q = new URLSearchParams(window.location.search);
    setLocal(q.has("local"));
    // local test mode only: lets a test script reach the game
    if (q.has("local")) (window as unknown as { pinkKart: unknown }).pinkKart = { game, session: () => sessionRef.current };
    try {
      setName(localStorage.getItem("pinkkart-name") ?? "");
      setLink(localStorage.getItem("pinkkart-link") ?? "");
    } catch {}
    const j = cleanCode(q.get("join") ?? "");
    if (j) {
      setCode(j);
      setScreen("join");
    }
    return () => {
      sessionRef.current?.leave();
      game.destroy();
    };
  }, [pixelFont]);

  // the map picker (and the game shows the picked map behind the menu)
  const pickTrack = (t: number) => {
    setTrack(t);
    gameRef.current?.setTrack(t);
    sessionRef.current?.setTrack(t);
  };
  // in somebody else's lobby: show the track the host picked
  const hostTrack = view && !view.isHost && view.phase === "lobby" ? view.track : -1;
  useEffect(() => {
    if (hostTrack >= 0) gameRef.current?.setTrack(hostTrack);
  }, [hostTrack]);

  const remember = () => {
    try {
      localStorage.setItem("pinkkart-name", cleanRacerName(name));
      if (link) localStorage.setItem("pinkkart-link", link);
    } catch {}
  };

  const openSession = async (mode: "create" | "join") => {
    const game = gameRef.current;
    if (!game || busy) return;
    setError("");
    const n = cleanRacerName(name);
    if (!n) return setError("TYPE A NAME");
    if (mode === "join" && cleanCode(code).length !== 4) return setError("THE CODE IS 4 LETTERS");
    // the song link is only sent when the song box is showing (a stream lobby asked for it)
    const song = mode === "join" && (needLink || local) ? link : "";
    if (song && !cleanMusicLink(song)) return setError("THAT LINK ISN'T SOUNDCLOUD, YOUTUBE OR SPOTIFY");
    setBusy(true);
    try {
      const s = await Session.open({ mode, name: n, link: song || undefined, code: cleanCode(code), stream, bots, owner: owner || undefined, local });
      remember();
      s.attach(game);
      if (mode === "create") s.setTrack(track);
      sessionRef.current = s;
      s.subscribe((v) => setView(v));
      setScreen("online");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SOMETHING WENT WRONG";
      if (mode === "join" && msg.includes("LINK") && !needLink) {
        // a stream lobby: now the song box appears
        setNeedLink(true);
        setError("THIS IS A STREAM LOBBY: PASTE YOUR SONG LINK");
      } else setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    sessionRef.current?.leave();
    sessionRef.current = null;
    setView(null);
    gameRef.current?.toLobby();
    setScreen("menu");
  };

  const copy = (what: string, label: string) => {
    navigator.clipboard?.writeText(what).then(
      () => {
        setCopied(label);
        window.setTimeout(() => setCopied(""), 1500);
      },
      () => {},
    );
  };

  // ---- the solo race hides the menu; the pause menu's KART MENU row brings it back (game.onMenu)
  const solo = () => {
    gameRef.current?.startSolo(track);
    setScreen("none");
  };

  const s = sessionRef.current;
  const isHost = !!view?.isHost;
  const inRace = !!view && view.phase === "race" && view.racing.includes(view.me);
  const myLine = view ? view.players.findIndex((p) => p.id === view.me) : -1;

  // ---------------------------------------------------------------- pieces of the menus
  const font = `${pixelFont}, ui-monospace, monospace`;
  const btn = (label: string, onClick: () => void, opts: { big?: boolean; off?: boolean; dim?: boolean } = {}) => (
    <button
      onClick={onClick}
      disabled={opts.off}
      style={{
        fontFamily: font,
        fontSize: opts.big ? 14 : 10,
        padding: opts.big ? "12px 16px" : "8px 10px",
        color: opts.dim ? PALE : INK,
        background: opts.off ? "#5a4a66" : opts.dim ? "transparent" : PINK,
        border: `2px solid ${opts.dim ? PALE : PINK}`,
        boxShadow: opts.dim ? "none" : `0 3px 0 ${PALE}`,
        cursor: opts.off ? "default" : "pointer",
        width: opts.big ? "100%" : undefined,
        letterSpacing: 1,
      }}
    >
      {label}
    </button>
  );
  const field = (label: string, value: string, set: (v: string) => void, opts: { place?: string; max?: number; upper?: boolean; type?: string } = {}) => (
    <label style={{ display: "block", marginTop: 12 }}>
      <div style={{ fontSize: 8, color: PALE, marginBottom: 6, opacity: 0.85 }}>{label}</div>
      <input
        value={value}
        type={opts.type ?? "text"}
        maxLength={opts.max ?? 300}
        placeholder={opts.place}
        onChange={(e) => set(opts.upper ? e.target.value.toUpperCase() : e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        autoCapitalize={opts.upper ? "characters" : "off"}
        autoComplete="off"
        spellCheck={false}
        style={{
          width: "100%",
          boxSizing: "border-box",
          fontFamily: font,
          fontSize: 12,
          padding: "9px 10px",
          color: PALE,
          background: "rgba(0,0,0,0.5)",
          border: `2px solid ${PALE}`,
          outline: "none",
        }}
      />
    </label>
  );
  const toggle = (label: string, note: string, on: boolean, set: (v: boolean) => void) => (
    <button
      onClick={() => set(!on)}
      style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", fontFamily: font, color: PALE }}
    >
      <span style={{ flex: "none", width: 16, height: 16, border: `2px solid ${PALE}`, background: on ? PINK : "transparent", marginTop: 1 }} />
      <span>
        <span style={{ fontSize: 10 }}>{label}</span>
        <span style={{ display: "block", fontSize: 7, opacity: 0.7, marginTop: 4, lineHeight: 1.6 }}>{note}</span>
      </span>
    </button>
  );
  const panel = (children: ReactNode, wide = false) => (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: wide ? "min(560px, 94vw)" : "min(380px, 92vw)",
        maxHeight: "90vh",
        overflowY: "auto",
        padding: 18,
        boxSizing: "border-box",
        background: "rgba(14,4,26,0.88)",
        border: `2px solid ${PINK}`,
        boxShadow: `0 0 0 2px ${INK}, 0 6px 0 ${INK}`,
        fontFamily: font,
        color: PALE,
      }}
    >
      {children}
    </div>
  );
  // CHOOSE THE MAP: one little screen per map with a moving preview (public/kart/preview-trackN.gif)
  const maps = (picked: number, onPick?: (i: number) => void) => (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 9, textAlign: "center", marginBottom: 8, color: PALE }}>{onPick ? "CHOOSE THE MAP" : "THE MAP"}</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${TRACKS.length}, 1fr)`, gap: 8 }}>
        {TRACKS.map((t, i) => (
          <button
            key={t.id}
            onClick={onPick ? () => onPick(i) : undefined}
            disabled={!onPick}
            style={{
              padding: 0,
              background: INK,
              border: `3px solid ${i === picked ? PINK : "rgba(236,230,255,0.35)"}`,
              boxShadow: i === picked ? `0 3px 0 ${PALE}` : "none",
              cursor: onPick ? "pointer" : "default",
              opacity: i === picked || onPick ? 1 : 0.45,
              fontFamily: font,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/kart/preview-${t.id}.gif`} alt={t.name} draggable={false} style={{ display: "block", width: "100%", aspectRatio: "16 / 9", imageRendering: "pixelated", filter: i === picked ? "none" : "brightness(0.6)" }} />
            <div style={{ fontSize: 7, padding: "6px 2px", color: i === picked ? INK : PALE, background: i === picked ? PINK : "transparent" }}>{t.name}</div>
          </button>
        ))}
      </div>
    </div>
  );
  const title = (t: string, sub?: string) => (
    <div style={{ textAlign: "center", marginBottom: 14 }}>
      <div style={{ fontSize: 18, color: PINK, textShadow: `2px 2px 0 ${INK}` }}>{t}</div>
      {sub && <div style={{ fontSize: 7, marginTop: 8, opacity: 0.75, lineHeight: 1.7 }}>{sub}</div>}
    </div>
  );
  const errorLine = error && <div style={{ marginTop: 12, fontSize: 8, color: "#ff7a7a", lineHeight: 1.6 }}>{error}</div>;
  const needsOwner = cleanRacerName(name).replace(/[^A-Z]/g, "").includes("PINKMANE");

  // ---------------------------------------------------------------- what's on screen
  let overlay: ReactNode = null;

  if (screen === "menu")
    overlay = panel(
      <>
        {title("PINK KART", local ? "LOCAL TEST MODE" : undefined)}
        {maps(track, pickTrack)}
        <div style={{ display: "grid", gap: 10 }}>
          {btn("SOLO RACE", solo, { big: true })}
          {btn("CREATE LOBBY", () => (setError(""), setScreen("create")), { big: true })}
          {btn("JOIN LOBBY", () => (setError(""), setScreen("join")), { big: true })}
        </div>
        <div style={{ fontSize: 7, marginTop: 16, lineHeight: 1.9, opacity: 0.75, textAlign: "center" }}>
          ARROWS / WASD DRIVE · SPACE ITEM · R BACK ON THE ROAD
          <br />
          HOLD GAS WHEN 2 SHOWS = ROCKET START
        </div>
      </>,
      true,
    );

  if (screen === "create")
    overlay = panel(
      <>
        {title("CREATE LOBBY", "YOU GET A 4-LETTER CODE. SEND IT TO YOUR FRIENDS.")}
        {field("YOUR NAME", name, setName, { max: 12, upper: true, place: "NAME" })}
        {needsOwner && field("OWNER CODE (TO RACE AS PINKMANE)", owner, setOwner, { type: "password" })}
        {toggle("STREAM MODE", "VIEWERS MUST GIVE A NAME + A SOUNDCLOUD, YOUTUBE OR SPOTIFY LINK. 8 RACE AT A TIME, THE REST WAIT IN LINE. THE WINNER'S SONG COMES UP AFTER EACH RACE.", stream, (v) => {
          setStream(v);
          if (v) setBots(false);
        })}
        {toggle("FILL WITH BOTS", `EMPTY SEATS GET A BOT, UP TO 6 KARTS.`, bots, setBots)}
        {errorLine}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {btn(busy ? "..." : "CREATE", () => openSession("create"), { big: true, off: busy })}
          {btn("BACK", () => setScreen("menu"), { dim: true })}
        </div>
      </>,
    );

  if (screen === "join")
    overlay = panel(
      <>
        {title("JOIN LOBBY")}
        {field("LOBBY CODE", code, (v) => setCode(cleanCode(v)), { max: 4, upper: true, place: "ABCD" })}
        {field("YOUR NAME", name, setName, { max: 12, upper: true, place: "NAME" })}
        {(needLink || local) && field("YOUR SONG", link, setLink, { place: "SOUNDCLOUD / YOUTUBE / SPOTIFY LINK" })}
        {needsOwner && field("OWNER CODE (TO RACE AS PINKMANE)", owner, setOwner, { type: "password" })}
        {errorLine}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {btn(busy ? "..." : "JOIN", () => openSession("join"), { big: true, off: busy })}
          {btn("BACK", () => setScreen("menu"), { dim: true })}
        </div>
      </>,
    );

  if (screen === "online" && view && s) {
    const ended = view.phase === "kicked" || view.phase === "full" || view.phase === "gone";
    if (ended)
      overlay = panel(
        <>
          {title(view.phase === "kicked" ? "YOU GOT KICKED" : view.phase === "full" ? "LOBBY FULL" : "THE LOBBY CLOSED", view.phase === "gone" ? "THE HOST LEFT OR LOST THE CONNECTION." : undefined)}
          {btn("BACK TO MENU", leave, { big: true })}
        </>,
      );
    else if (view.phase === "lobby")
      overlay = panel(
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 8, opacity: 0.75 }}>{view.stream ? "STREAM LOBBY" : "LOBBY"} CODE</div>
              <div style={{ fontSize: 34, color: PINK, letterSpacing: 6, textShadow: `3px 3px 0 ${INK}`, marginTop: 6 }}>{view.code}</div>
              <div style={{ fontSize: 7, opacity: 0.7, marginTop: 6 }}>PINKMANE.SITE/GAMES/PINK-KART</div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {btn(copied === "join" ? "COPIED!" : "COPY JOIN LINK", () => copy(s.joinLink, "join"), { dim: true })}
              <div style={{ fontSize: 7, opacity: 0.7, textAlign: "right" }}>{view.live ? "● CONNECTED" : "○ CONNECTING..."}</div>
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 8, opacity: 0.75 }}>
            {view.players.length} IN THE LOBBY{view.players.length > MAX_RACERS ? ` · ${MAX_RACERS} RACE NEXT, THE REST WAIT` : ""}
          </div>
          <div style={{ marginTop: 8, maxHeight: "34vh", overflowY: "auto", border: `2px solid rgba(236,230,255,0.25)` }}>
            {view.players.map((p, i) => (
              <div key={p.id}>
                {i === MAX_RACERS && <div style={{ fontSize: 7, padding: "6px 8px", background: "rgba(255,70,200,0.18)" }}>── IN LINE FOR THE NEXT RACE ──</div>}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", fontSize: 10, background: p.id === view.me ? "rgba(255,70,200,0.15)" : "transparent" }}>
                  <span style={{ width: 22, opacity: 0.6, fontSize: 8 }}>{i + 1}</span>
                  <span style={{ flex: 1, color: p.host ? PINK : PALE }}>
                    {p.name}
                    {p.host ? " ★" : ""}
                    {p.id === view.me ? " (YOU)" : ""}
                  </span>
                  {isHost && p.link && (
                    <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 7, color: PALE, opacity: 0.8 }}>
                      {musicSite(p.link)}
                    </a>
                  )}
                  {isHost && !p.host && btn("KICK", () => s.kick(p.id), { dim: true })}
                </div>
              </div>
            ))}
          </div>

          {isHost ? (
            <>
              <div style={{ marginTop: 14 }}>{maps(view.track, pickTrack)}</div>
              {!view.stream && toggle("FILL WITH BOTS", "EMPTY SEATS GET A BOT, UP TO 6 KARTS.", view.bots, (v) => s.setBots(v))}
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                {btn("START RACE", () => s.start(), { big: true, off: view.players.length < 2 && !view.bots })}
                {btn("CLOSE LOBBY", leave, { dim: true })}
              </div>
              {view.players.length < 2 && !view.bots && <div style={{ fontSize: 7, marginTop: 10, opacity: 0.7 }}>WAITING FOR SOMEONE TO JOIN (OR TURN ON BOTS)</div>}
            </>
          ) : (
            <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
              <div style={{ flex: 1, fontSize: 8, lineHeight: 1.7 }}>
                WAITING FOR THE HOST TO START
                <div style={{ opacity: 0.75 }}>TRACK: {TRACKS[view.track]?.name ?? "?"}</div>
                {myLine >= MAX_RACERS && <div style={{ color: PINK }}>YOU'RE #{myLine + 1} IN LINE</div>}
              </div>
              {btn("LEAVE", leave, { dim: true })}
            </div>
          )}
        </>,
        true,
      );
    else if (view.phase === "race" && !inRace)
      overlay = panel(
        <>
          {title("RACE ON NOW", "YOU'RE IN LINE FOR THE NEXT ONE. STAY ON THIS PAGE.")}
          <div style={{ fontSize: 8, textAlign: "center", opacity: 0.8 }}>{myLine >= 0 ? `YOU'RE #${myLine + 1} IN LINE` : ""}</div>
          <div style={{ marginTop: 14 }}>{btn("LEAVE", leave, { dim: true })}</div>
        </>,
      );
    else if (view.phase === "results") {
      // one strip along the bottom, so the results list above stays readable
      const w = view.stream ? view.winner : null;
      overlay = (
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 10,
            transform: "translateX(-50%)",
            width: "min(620px, 96vw)",
            display: "flex",
            gap: 12,
            alignItems: "center",
            padding: w ? 10 : 0,
            boxSizing: "border-box",
            background: w ? "rgba(14,4,26,0.94)" : "transparent",
            border: w ? "2px solid #ffe23c" : "none",
            boxShadow: w ? `0 4px 0 ${INK}` : "none",
            fontFamily: font,
            color: PALE,
          }}
        >
          {w && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 7, opacity: 0.8 }}>NEXT SONG</div>
              <div style={{ fontSize: 16, color: "#ffe23c", marginTop: 5, textShadow: `2px 2px 0 ${INK}`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</div>
              <div style={{ fontSize: 7, marginTop: 5, opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.link ?? "NO LINK"}</div>
            </div>
          )}
          {w?.link && (
            <div style={{ display: "grid", gap: 6 }}>
              {btn(`OPEN ON ${musicSite(w.link)}`, () => window.open(w.link, "_blank", "noopener,noreferrer"))}
              {btn(copied === "song" ? "COPIED!" : "COPY LINK", () => copy(w.link!, "song"), { dim: true })}
            </div>
          )}
          <div style={{ flex: w ? "none" : 1, display: "flex", justifyContent: "center" }}>
            {isHost ? (
              btn(view.stream ? "NEXT HEAT" : "BACK TO LOBBY", () => s.next(), { big: !w })
            ) : (
              <div style={{ fontSize: 8, padding: 10, background: "rgba(14,4,26,0.85)" }}>WAITING FOR THE HOST...</div>
            )}
          </div>
        </div>
      );
    }
  }

  // a small MENU button at the bottom while racing (phones have no Esc key)
  const racing = screen === "none" || (screen === "online" && inRace);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#07060c", overflow: "hidden", touchAction: "none", userSelect: "none", fontFamily: font }}>
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%", imageRendering: "pixelated" }} aria-label="PINK KART" />
      <div style={{ touchAction: "auto", userSelect: "text" }}>{overlay}</div>
      {/* back to the main site, straight into its game list (hidden while racing: it would cover the lap counter) */}
      {!racing && (
      <Link
        href="/"
        onClick={() => {
          try {
            sessionStorage.setItem("pinkmane-open-games", "1");
          } catch {}
        }}
        style={{
          position: "absolute",
          left: 12,
          top: 10,
          padding: "6px 10px",
          fontFamily: font,
          fontSize: 9,
          textShadow: `1px 1px 0 ${INK}`,
          color: PALE,
          background: "rgba(10,8,18,0.6)",
          border: `2px solid ${PALE}`,
          textDecoration: "none",
          opacity: 0.7,
        }}
      >
        ← GAMES
      </Link>
      )}
      {racing && (
        <button
          onClick={() => gameRef.current?.openMenu()}
          style={{
            position: "absolute",
            left: "50%",
            bottom: 8,
            transform: "translateX(-50%)",
            padding: "6px 10px",
            fontFamily: font,
            fontSize: 9,
            textShadow: `1px 1px 0 ${INK}`,
            color: PALE,
            background: "rgba(10,8,18,0.6)",
            border: `2px solid ${PALE}`,
            opacity: 0.7,
            cursor: "pointer",
          }}
        >
          MENU
        </button>
      )}
    </div>
  );
}
