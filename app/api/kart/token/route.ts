// PINK KART online: the site's side of a lobby.
//
// A player's browser calls this to CREATE a lobby or JOIN one. It answers with a short pass (an Ably token)
// that only works for that one lobby, so the real key in your Vercel settings (ABLY_API_KEY) never leaves the site.
//
// It also remembers, for 6 hours, who created each lobby (in the same database as the scoreboards).
// The game only obeys "start", "kick" and "results" from that player, and Ably stamps every message
// with who sent it, so nobody can pretend to be the host.
//
// It checks names (the scoreboard's word filter, and PINKMANE needs your owner code) and,
// in STREAM MODE, that the music link is SoundCloud, YouTube or Spotify.

import { NextResponse } from "next/server";
import { BLOCKED, getRedis, isOwner, isReserved, lettersOnly } from "../../scores/shared";
import { CODE_LETTERS, cleanCode, cleanMusicLink, cleanRacerName, isCode } from "../../../../game/kart/links";

export const dynamic = "force-dynamic";

const ABLY = "https://main.realtime.ably.net";
const LOBBY_HOURS = 6; // a lobby code works for this long after it's made
const PASS_HOURS = 3; // a pass works this long (the game asks for a new one before it runs out)

type Lobby = { host: string; stream: boolean };

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

function nameProblem(name: string, owner: unknown): string | null {
  if (!name) return "TYPE A NAME";
  const letters = lettersOnly(name);
  if (BLOCKED.some((w) => letters.includes(w))) return "PICK ANOTHER NAME";
  if (isReserved(name) && !isOwner(owner)) return "THAT NAME IS PINKMANE'S";
  return null;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, "BAD REQUEST");
  }
  const action = body.action;
  const id = typeof body.id === "string" ? body.id : "";
  if (!/^[a-z0-9]{8,24}$/.test(id)) return fail(400, "BAD PLAYER ID");

  const key = process.env.ABLY_API_KEY?.trim();
  const redis = getRedis();
  if (!key) return fail(503, "ABLY KEY MISSING (THE SITE CAN'T SEE IT)");
  if (!key.includes(":")) return fail(503, "ABLY KEY LOOKS WRONG (COPY THE WHOLE KEY)");
  if (!redis) return fail(503, "ONLINE ISN'T SET UP YET (DATABASE)");

  const name = cleanRacerName(body.name);
  let code = "";
  let lobby: Lobby | null = null;

  if (action === "create") {
    const problem = nameProblem(name, body.owner);
    if (problem) return fail(400, problem);
    const stream = body.stream === true;
    // a fresh 4-letter code nobody is using
    for (let tries = 0; tries < 12 && !lobby; tries++) {
      let c = "";
      for (let i = 0; i < 4; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
      const ok = await redis.set(`kart:lobby:${c}`, JSON.stringify({ host: id, stream }), { nx: true, ex: LOBBY_HOURS * 3600 });
      if (ok) {
        code = c;
        lobby = { host: id, stream };
      }
    }
    if (!lobby) return fail(503, "TRY AGAIN");
  } else if (action === "join" || action === "renew") {
    code = cleanCode(body.code);
    if (!isCode(code)) return fail(400, "THE CODE IS 4 LETTERS");
    const raw = await redis.get(`kart:lobby:${code}`);
    if (!raw) return fail(404, "NO LOBBY WITH THAT CODE");
    lobby = (typeof raw === "string" ? JSON.parse(raw) : raw) as Lobby;
    if (action === "join" && id !== lobby.host) {
      const problem = nameProblem(name, body.owner);
      if (problem) return fail(400, problem);
      if (lobby.stream && !cleanMusicLink(body.link)) return fail(400, "PASTE A SOUNDCLOUD, YOUTUBE OR SPOTIFY LINK");
    }
  } else return fail(400, "BAD REQUEST");

  // ask Ably for a pass that can only send and receive in this one lobby, as this one player
  const [keyName] = key.split(":");
  const res = await fetch(`${ABLY}/keys/${encodeURIComponent(keyName)}/requestToken`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(key).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      keyName,
      ttl: PASS_HOURS * 3600 * 1000,
      // two channels: the lobby, and the race (only the racers listen to that one)
      capability: JSON.stringify({ [`kart:${code}`]: ["publish", "subscribe"], [`kart:${code}:race`]: ["publish", "subscribe"] }),
      clientId: id,
      timestamp: Date.now(),
    }),
  });
  if (!res.ok) {
    let why = "";
    try {
      why = JSON.stringify(await res.json()).slice(0, 160);
    } catch {}
    console.error("PINK KART: Ably refused the pass", res.status, why);
    return fail(502, `ABLY SAID NO (${res.status})`);
  }
  const pass = (await res.json()) as { token: string; expires: number };
  return NextResponse.json({ code, token: pass.token, expires: pass.expires, host: lobby.host, stream: lobby.stream, name });
}
