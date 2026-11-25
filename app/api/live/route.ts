import { NextResponse } from "next/server";

// IS PINKMANE LIVE ON TWITCH RIGHT NOW?
//   GET /api/live  ->  { live: true | false }
// The iPod shows a red LIVE dot when this says true (app/components/LiveDot.tsx).
//
// How it knows, without any password or key: Twitch has a preview picture for every channel.
// While the channel is live that picture exists; while it's offline Twitch sends you on to its "404" picture instead.
// If Twitch can't be asked for some reason, a second public service (decapi.me) is asked the same question.
// The answer is kept for a minute, so Twitch is asked at most once a minute no matter how many people are on the site.

// CHANGE THE CHANNEL HERE (the name at the end of twitch.tv/...)
const CHANNEL = "pinkmanee";

export const dynamic = "force-dynamic";

async function ask(url: string, init: RequestInit) {
  const stop = new AbortController();
  const t = setTimeout(() => stop.abort(), 4000);
  try {
    return await fetch(url, { ...init, signal: stop.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

async function fromTwitch(): Promise<boolean | null> {
  try {
    const res = await ask(`https://static-cdn.jtvnw.net/previews-ttv/live_user_${CHANNEL}-320x180.jpg`, { method: "HEAD", redirect: "manual" });
    if (res.status === 200) return true;
    if (res.status >= 300 && res.status < 400) return false; // sent on to the "404" picture = offline
    return null;
  } catch {
    return null;
  }
}

async function fromDecapi(): Promise<boolean | null> {
  try {
    const res = await ask(`https://decapi.me/twitch/uptime/${CHANNEL}`, {});
    if (!res.ok) return null;
    const text = (await res.text()).toLowerCase();
    if (text.includes("offline")) return false;
    if (/\d+\s*(second|minute|hour|day)/.test(text)) return true; // "2 hours, 4 minutes" = live for that long
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  let live = await fromTwitch();
  if (live === null) live = await fromDecapi();
  return NextResponse.json(
    { live: live === true },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=60" } },
  );
}
