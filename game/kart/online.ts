// PINK KART online: the lobby.
//
// One player CREATES a lobby (the host) and gets a 4-letter code. Others JOIN with the code.
// The host's screen keeps the list of who's in and decides when races start and end; everybody else follows it.
//
// STREAM MODE: everybody who joins must give a name and a SoundCloud / YouTube / Spotify link.
// Up to 8 race at once (the host always races); the rest wait in line and race in the next heat.
// After each race the winner's name and link come up big on the host's screen, ready to play.
//
// The lobby only goes through the site and Ably while it's open. Nothing is saved afterwards
// except the code itself, which the site forgets after 6 hours.

import { AblyWire, LocalWire, Pass, type Packet, type Wire } from "./net";
import { cleanMusicLink, cleanRacerName } from "./links";
import type { ItemEvent, KartGame, OnlineLink, ResultRow, Seat } from "./kart";

export const MAX_RACERS = 8; // karts in one race
export const MIN_GRID = 6; // with BOTS on, empty seats are filled with bots up to this many karts
const MAX_LOBBY = 60; // people in a lobby at once (the rest get "LOBBY FULL")
const BOT_NAMES = ["808", "SERUM", "VOID", "HEX", "KONG", "JUNGLE", "BOMBER"];

export type LobbyPlayer = { id: string; name: string; host: boolean; link?: string };
export type Winner = { name: string; link?: string; time: number | null };
export type View = {
  phase: "lobby" | "race" | "results" | "kicked" | "full" | "gone";
  code: string;
  me: string;
  isHost: boolean;
  stream: boolean;
  bots: boolean;
  live: boolean; // connected right now
  players: LobbyPlayer[]; // in line order: the host first, then who races next
  racing: string[]; // who is in the current (or last) race
  results: ResultRow[] | null;
  winner: Winner | null; // stream mode: the fastest player (and their link, the song to play)
};

type Info = { name: string; link?: string; seen: number };

const newId = () => {
  let s = "";
  const a = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 14; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

export type OpenOptions = {
  mode: "create" | "join";
  name: string;
  link?: string;
  code?: string;
  stream?: boolean;
  bots?: boolean;
  owner?: string; // the owner code, only needed to race as PINKMANE
  local?: boolean; // test mode: tabs of one browser, no Ably
};

export class Session {
  view: View;
  private lobbyWire: Wire;
  private raceWire: Wire | null = null;
  private listeners = new Set<(v: View) => void>();
  private game: KartGame | null = null;
  private timer = 0;
  private pass: Pass | null;
  private hostId: string | null;
  private hostSeen = Date.now();
  private lastHi = 0;
  private hb = 6; // seconds between "I'm still here" messages (the host raises it when the lobby is big)
  // ---- host only
  private line: string[] = []; // everybody, in the order they'll race
  private info = new Map<string, Info>();
  private kicked = new Set<string>();
  private lastL = 0;
  private lDirty = false;
  private closed = false;
  private onUnload = () => this.leave();

  // ---------------------------------------------------------------- opening a lobby
  static async open(o: OpenOptions): Promise<Session> {
    const id = newId();
    const name = cleanRacerName(o.name);
    if (!name) throw new Error("TYPE A NAME");
    const link = o.link ? cleanMusicLink(o.link) ?? undefined : undefined;
    if (o.local) {
      // test mode: no site, no Ably
      const code = o.mode === "create" ? Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("") : (o.code ?? "").toUpperCase();
      return new Session(id, name, link, code, o.mode === "create", o.stream === true, o.bots !== false, null, o.mode === "create" ? id : null, true);
    }
    const ask = async (action: string, extra: Record<string, unknown>) => {
      const res = await fetch("/api/kart/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id, name, link: o.link, owner: o.owner, ...extra }),
      });
      let j: any = {};
      try {
        j = await res.json();
      } catch {}
      if (!res.ok) throw new Error(j.error || `SOMETHING WENT WRONG (${res.status})`);
      return j as { code: string; token: string; expires: number; host: string; stream: boolean; name: string };
    };
    const j = await ask(o.mode, { code: o.code, stream: o.stream === true });
    const pass = new Pass(j.token, j.expires, () => ask("renew", { code: j.code }));
    return new Session(id, j.name || name, link, j.code, j.host === id, j.stream, o.bots !== false, pass, j.host, false);
  }

  private constructor(
    private myId: string,
    private myName: string,
    private myLink: string | undefined,
    code: string,
    isHost: boolean,
    stream: boolean,
    bots: boolean,
    pass: Pass | null,
    hostId: string | null,
    private local: boolean,
  ) {
    this.pass = pass;
    this.hostId = hostId;
    this.view = { phase: "lobby", code, me: myId, isHost, stream, bots: isHost ? bots && !stream : false, live: false, players: [], racing: [], results: null, winner: null };
    this.lobbyWire = this.wire(`kart:${code}`);
    this.lobbyWire.onPacket = (p) => this.packet(p);
    this.lobbyWire.onStatus = (live) => this.set({ live });
    if (isHost) {
      this.info.set(myId, { name: myName, seen: Date.now() });
      this.line = [myId];
      this.lDirty = true;
    } else window.setTimeout(() => this.hi(), 300);
    this.refreshPlayers();
    this.timer = window.setInterval(() => this.tick(), 500);
    window.addEventListener("pagehide", this.onUnload);
  }

  private wire(channel: string): Wire {
    return this.local ? new LocalWire(channel, this.myId) : new AblyWire(channel, this.myId, this.pass!);
  }

  // ---------------------------------------------------------------- for the page
  subscribe(f: (v: View) => void) {
    this.listeners.add(f);
    f(this.view);
    return () => {
      this.listeners.delete(f);
    };
  }

  private set(p: Partial<View>) {
    this.view = { ...this.view, ...p };
    this.listeners.forEach((f) => f(this.view));
  }

  attach(game: KartGame) {
    this.game = game;
    game.myName = this.myName;
  }

  get joinLink() {
    return `${window.location.origin}/games/pink-kart?join=${this.view.code}${this.local ? "&local" : ""}`;
  }

  leave() {
    if (this.closed) return;
    this.lobbyWire.send("bye", {});
    this.close();
  }

  private close() {
    this.closed = true;
    window.clearInterval(this.timer);
    window.removeEventListener("pagehide", this.onUnload);
    // give the goodbye a moment to leave before the wires shut
    window.setTimeout(() => {
      this.lobbyWire.close();
      this.raceWire?.close();
    }, 300);
    this.raceWire = null;
    this.game?.toLobby();
  }

  // ---------------------------------------------------------------- host buttons
  setBots(on: boolean) {
    if (!this.view.isHost) return;
    this.set({ bots: on });
    this.lDirty = true;
  }

  start() {
    if (!this.view.isHost || this.view.phase !== "lobby" || !this.game?.isReady) return;
    this.dropQuiet();
    const racers = this.line.filter((id) => this.info.has(id)).slice(0, MAX_RACERS);
    // shuffle the grid (the host isn't always at the front)
    const order = [...racers].sort(() => Math.random() - 0.5);
    const seats: Seat[] = order.map((id, i) => ({ id, name: this.info.get(id)!.name, skin: i, bot: false }));
    if (this.view.bots)
      for (let i = seats.length, b = 0; i < MIN_GRID; i++, b++) seats.push({ id: `bot${b}`, name: BOT_NAMES[b % BOT_NAMES.length], skin: i, bot: true });
    this.lobbyWire.send("go", { s: seats });
    this.go(seats);
    this.lDirty = true;
  }

  kick(id: string) {
    if (!this.view.isHost || id === this.myId) return;
    this.kicked.add(id);
    this.remove(id);
    this.lobbyWire.send("k", { id });
  }

  /** after the results: everybody back to the lobby (stream mode: the next people in line are up) */
  next() {
    if (!this.view.isHost || this.view.phase !== "results") return;
    this.lobbyWire.send("n", {});
    this.backToLobby();
    this.lDirty = true;
  }

  // ---------------------------------------------------------------- the race
  private go(seats: Seat[]) {
    const racing = seats.filter((s) => !s.bot).map((s) => s.id);
    this.set({ phase: "race", racing, results: null, winner: null });
    if (!racing.includes(this.myId) || !this.game) return; // waiting in line: just watch the lobby
    this.raceWire?.close();
    const rw = this.wire(`kart:${this.view.code}:race`);
    rw.onPacket = (p) => this.racePacket(p);
    this.raceWire = rw;
    const link: OnlineLink = {
      myId: this.myId,
      isHost: this.view.isHost,
      sendState: (rows) => rw.send("s", { k: rows }, { latest: true }),
      sendItem: (ev) => rw.send("i", ev),
      sendGone: (id) => rw.send("x", { id }),
      sendFinish: (t) => rw.send("f", { t }),
      hostResults: (rows) => this.hostResults(rows),
    };
    this.game.onlineGo(seats, link);
  }

  private racePacket(p: Packet) {
    const g = this.game;
    if (!g) return;
    if (this.view.isHost) this.seen(p.from);
    if (p.from === this.hostId) this.hostSeen = Date.now();
    if (p.n === "s") g.remoteState(p.from, p.d?.k);
    else if (p.n === "i") g.remoteItem(p.from, p.d as ItemEvent);
    else if (p.n === "x" && typeof p.d?.id === "string") g.remoteGone(p.d.id);
    else if (p.n === "f") g.remoteFinish(p.from, Number(p.d?.t));
  }

  private hostResults(rows: ResultRow[]) {
    // the song to play: the fastest racer who isn't a bot and has a link
    let winner: Winner | null = null;
    const top = rows.find((r) => !r.bot);
    if (top) {
      const withLink = rows.find((r) => !r.bot && r.time !== null && this.info.get(r.id)?.link);
      const pick = this.view.stream && withLink ? withLink : top;
      winner = { name: pick.name, link: this.info.get(pick.id)?.link, time: pick.time };
    }
    this.lobbyWire.send("r", { r: rows, w: winner });
    this.showResults(rows, winner);
    // stream mode: everybody who just raced goes to the back of the line (the host stays at the front)
    if (this.view.stream) {
      const raced = new Set(this.view.racing);
      this.line = [this.myId, ...this.line.filter((id) => id !== this.myId && !raced.has(id)), ...this.line.filter((id) => id !== this.myId && raced.has(id))];
      this.refreshPlayers();
    }
    this.lDirty = true;
  }

  private showResults(rows: ResultRow[], winner: Winner | null) {
    this.set({ phase: "results", results: rows, winner });
    this.game?.onlineResults(rows);
    // the race channel isn't needed any more
    window.setTimeout(() => {
      if (this.view.phase !== "race") {
        this.raceWire?.close();
        this.raceWire = null;
      }
    }, 1500);
  }

  private backToLobby() {
    this.raceWire?.close();
    this.raceWire = null;
    this.set({ phase: "lobby", results: null, winner: null, racing: [] });
    this.game?.toLobby();
  }

  // ---------------------------------------------------------------- messages in the lobby
  private packet(p: Packet) {
    const d = p.d ?? {};
    // test mode only: the first lobby list that comes in tells us who the host is
    if (!this.hostId && this.local && p.n === "L") this.hostId = p.from;
    const fromHost = p.from === this.hostId;
    if (fromHost) this.hostSeen = Date.now();

    if (this.view.isHost) {
      if (p.n === "hi") this.hello(p.from, d);
      else if (p.n === "bye") this.remove(p.from);
      return;
    }
    if (!fromHost) return; // only the host runs the lobby
    if (p.n === "L") this.lobbyList(d);
    else if (p.n === "go" && Array.isArray(d.s)) this.go(this.cleanSeats(d.s));
    else if (p.n === "r" && Array.isArray(d.r)) this.showResults(d.r as ResultRow[], (d.w as Winner) ?? null);
    else if (p.n === "n") this.backToLobby();
    else if (p.n === "k" && d.id === this.myId) {
      this.set({ phase: "kicked" });
      this.close();
    } else if (p.n === "full" && d.id === this.myId) {
      this.set({ phase: "full" });
      this.close();
    } else if (p.n === "k" && typeof d.id === "string") this.game?.remoteLeft(d.id);
    else if (p.n === "bye") {
      this.set({ phase: "gone" });
      this.close();
    }
  }

  private cleanSeats(raw: unknown[]): Seat[] {
    return raw
      .slice(0, MAX_RACERS)
      .filter((s): s is Seat => !!s && typeof (s as Seat).id === "string" && typeof (s as Seat).skin === "number")
      .map((s) => ({ id: s.id.slice(0, 24), name: cleanRacerName(s.name) || "?", skin: Math.max(0, Math.min(7, Math.floor(s.skin))), bot: !!s.bot }));
  }

  // (everybody but the host) the host's list of who's in
  private lobbyList(d: any) {
    if (Array.isArray(d.p)) {
      const players: LobbyPlayer[] = d.p
        .filter((r: unknown) => Array.isArray(r) && typeof r[0] === "string")
        .map((r: [string, string]) => ({ id: r[0], name: cleanRacerName(r[1]) || "?", host: r[0] === this.hostId }));
      this.set({ players, stream: !!d.s, bots: !!d.b, racing: Array.isArray(d.r) ? d.r : this.view.racing });
      // the host hasn't heard from us yet: say hi again
      if (!players.some((pl) => pl.id === this.myId) && this.view.phase === "lobby") this.hi();
    }
    if (typeof d.hb === "number") this.hb = Math.max(4, Math.min(60, d.hb));
    // someone joined in the middle of a race and missed the start
    if (d.ph === "race" && this.view.phase === "lobby") this.set({ phase: "race", racing: Array.isArray(d.r) ? d.r : [] });
  }

  // (host) someone said hi
  private hello(id: string, d: any) {
    if (this.kicked.has(id)) {
      this.lobbyWire.send("k", { id });
      return;
    }
    const now = Date.now();
    const known = this.info.get(id);
    if (!known && this.info.size >= MAX_LOBBY) {
      this.lobbyWire.send("full", { id });
      return;
    }
    const name = cleanRacerName(d.name) || "?";
    const link = this.view.stream ? cleanMusicLink(d.link) ?? undefined : undefined;
    if (this.view.stream && !link) return; // stream mode: no link, no entry
    this.info.set(id, { name, link, seen: now });
    if (!this.line.includes(id)) this.line.push(id);
    if (!known || known.name !== name || known.link !== link) {
      this.refreshPlayers();
      this.lDirty = true;
    }
  }

  private seen(id: string) {
    const i = this.info.get(id);
    if (i) i.seen = Date.now();
  }

  private remove(id: string) {
    if (!this.info.has(id)) return;
    this.info.delete(id);
    this.line = this.line.filter((x) => x !== id);
    if (this.view.phase === "race") this.game?.remoteLeft(id);
    this.refreshPlayers();
    this.lDirty = true;
  }

  // (host) people who stopped answering (closed the tab without a goodbye, lost the internet)
  private dropQuiet() {
    const now = Date.now();
    for (const [id, i] of this.info) {
      if (id === this.myId) continue;
      const racing = this.view.phase === "race" && this.view.racing.includes(id);
      const limit = racing ? 15000 : this.view.phase === "race" ? 120000 : Math.max(20000, this.hb * 3500);
      if (now - i.seen > limit) this.remove(id);
    }
  }

  private refreshPlayers() {
    if (!this.view.isHost) return;
    const players = this.line
      .filter((id) => this.info.has(id))
      .map((id) => ({ id, name: this.info.get(id)!.name, host: id === this.myId, link: this.info.get(id)!.link }));
    this.set({ players });
  }

  private hi() {
    this.lastHi = Date.now();
    this.lobbyWire.send("hi", { name: this.myName, link: this.myLink });
  }

  // twice a second
  private tick() {
    if (this.closed) return;
    const now = Date.now();
    if (this.view.isHost) {
      this.dropQuiet();
      // bigger lobby = people check in less often (every message goes to everybody in the lobby)
      this.hb = Math.max(6, Math.min(40, Math.round(this.info.size / 2)));
      const every = this.view.phase === "race" ? 6000 : 2500;
      if ((this.lDirty && now - this.lastL > 1200) || now - this.lastL > every) {
        this.lastL = now;
        this.lDirty = false;
        this.lobbyWire.send("L", {
          p: this.line.filter((id) => this.info.has(id)).map((id) => [id, this.info.get(id)!.name]),
          s: this.view.stream,
          b: this.view.bots,
          ph: this.view.phase,
          r: this.view.racing,
          hb: this.hb,
        });
      }
      return;
    }
    // everybody else: check in (not while racing: the race updates do that), and notice if the host is gone
    const racingNow = this.view.phase === "race" && this.view.racing.includes(this.myId);
    if (!racingNow && now - this.lastHi > this.hb * 1000) this.hi();
    const quiet = now - this.hostSeen;
    if (quiet > (this.view.phase === "race" ? 30000 : Math.max(20000, this.hb * 4000))) {
      this.set({ phase: "gone" });
      this.close();
    }
  }
}
