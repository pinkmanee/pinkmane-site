// PINK KART online: the wires between players.
//
// Every lobby has two channels on Ably:
//   kart:CODE        the lobby: who's in, start, results, kick (everyone in the lobby listens)
//   kart:CODE:race   the race itself: where every kart is, items, finishing (only the racers listen,
//                    so people waiting in the queue on a stream don't burn through the free message allowance)
//
// No Ably library needed: messages come in through Ably's web stream (Server-Sent Events) and go out as
// small web requests. Only one request is on its way at a time; if the game sends a newer kart position
// before the last one left, the older one is simply replaced.
//
// LOCAL TEST MODE (pinkmane.site/games/pink-kart?local): the same thing between tabs of one browser,
// without Ably. Only useful for testing on one computer.

const ABLY = "https://main.realtime.ably.net";

export type Packet = { n: string; d: any; from: string };

// The pass from the site (app/api/kart/token). It runs out after a few hours, so it can be renewed.
export class Pass {
  token: string;
  expires: number;
  private listeners = new Set<() => void>();
  private renewing: Promise<void> | null = null;
  constructor(token: string, expires: number, private renewer: () => Promise<{ token: string; expires: number }>) {
    this.token = token;
    this.expires = expires;
  }
  onChange(f: () => void) {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }
  renew() {
    if (!this.renewing)
      this.renewing = this.renewer()
        .then((p) => {
          this.token = p.token;
          this.expires = p.expires;
          this.listeners.forEach((f) => f());
        })
        .catch(() => {})
        .finally(() => (this.renewing = null));
    return this.renewing;
  }
}

export interface Wire {
  send(n: string, d: unknown, opts?: { latest?: boolean }): void;
  onPacket: (p: Packet) => void;
  onStatus: (live: boolean) => void;
  close(): void;
}

type Out = { name: string; data: string; latest?: boolean };

// ---------------------------------------------------------------- the real one: Ably
export class AblyWire implements Wire {
  onPacket: (p: Packet) => void = () => {};
  onStatus: (live: boolean) => void = () => {};
  private es: EventSource | null = null;
  private lastEvent = "";
  private queue: Out[] = [];
  private busy = false;
  private closed = false;
  private offPass: () => void;
  private renewTimer = 0;
  private lastSend = 0;

  constructor(private channel: string, private me: string, private pass: Pass) {
    this.offPass = pass.onChange(() => this.open());
    this.open();
  }

  private open() {
    if (this.closed) return;
    this.es?.close();
    const q = new URLSearchParams({ v: "1.2", channels: this.channel, accessToken: this.pass.token });
    if (this.lastEvent) q.set("lastEvent", this.lastEvent);
    const es = new EventSource(`${ABLY}/sse?${q}`);
    this.es = es;
    es.onopen = () => this.onStatus(true);
    es.onerror = () => {
      this.onStatus(false);
      // a pass that ran out can't reconnect: get a new one
      if (Date.now() > this.pass.expires - 60000) this.pass.renew();
    };
    es.onmessage = (ev) => {
      if (ev.lastEventId) this.lastEvent = ev.lastEventId;
      this.take(ev.data);
    };
    // get a new pass 10 minutes before this one runs out
    clearTimeout(this.renewTimer);
    this.renewTimer = window.setTimeout(() => this.pass.renew(), Math.max(60000, this.pass.expires - Date.now() - 600000));
  }

  private take(raw: string) {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m.name !== "string") return;
    let d = m.data;
    if (typeof d === "string") {
      try {
        d = JSON.parse(d);
      } catch {}
    }
    // who sent it: Ably fills this in from the sender's pass, so it can't be faked
    const from = typeof m.clientId === "string" && m.clientId ? m.clientId : d && typeof d.f === "string" ? d.f : "";
    if (!from || from === this.me) return;
    this.onPacket({ n: m.name, d, from });
  }

  send(n: string, d: unknown, opts?: { latest?: boolean }) {
    if (this.closed) return;
    const out: Out = { name: n, data: JSON.stringify({ f: this.me, ...(d as object) }), latest: opts?.latest };
    if (opts?.latest) {
      const i = this.queue.findIndex((o) => o.latest && o.name === n);
      if (i >= 0) {
        this.queue[i] = out;
        return;
      }
    }
    this.queue.push(out);
    this.flush();
  }

  private flush() {
    if (this.busy || this.closed || !this.queue.length) return;
    // at most ~12 requests a second
    const wait = this.lastSend + 80 - performance.now();
    if (wait > 0) {
      this.busy = true;
      window.setTimeout(() => {
        this.busy = false;
        this.flush();
      }, wait);
      return;
    }
    const batch = this.queue.splice(0, 20).map(({ name, data }) => ({ name, data }));
    this.busy = true;
    this.lastSend = performance.now();
    fetch(`${ABLY}/channels/${encodeURIComponent(this.channel)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${btoa(this.pass.token)}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch),
      keepalive: batch.length < 4,
    })
      .then((r) => {
        if (r.status === 401) this.pass.renew();
      })
      .catch(() => {})
      .finally(() => {
        this.busy = false;
        this.flush();
      });
  }

  close() {
    this.closed = true;
    clearTimeout(this.renewTimer);
    this.offPass();
    this.es?.close();
    this.es = null;
  }
}

// ---------------------------------------------------------------- the test one: tabs of the same browser
export class LocalWire implements Wire {
  onPacket: (p: Packet) => void = () => {};
  onStatus: (live: boolean) => void = () => {};
  private bc: BroadcastChannel;
  private closed = false;
  constructor(channel: string, private me: string) {
    this.bc = new BroadcastChannel(`pinkkart-test:${channel}`);
    this.bc.onmessage = (ev) => {
      const { n, d } = ev.data as { n: string; d: any };
      if (!d || d.f === this.me) return;
      // pretend the internet is in between: 40 - 110 ms late
      window.setTimeout(() => !this.closed && this.onPacket({ n, d, from: d.f }), 40 + Math.random() * 70);
    };
    window.setTimeout(() => this.onStatus(true), 50);
  }
  send(n: string, d: unknown) {
    if (this.closed) return;
    this.bc.postMessage({ n, d: { f: this.me, ...(d as object) } });
  }
  close() {
    this.closed = true;
    this.bc.close();
  }
}
