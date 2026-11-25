import { NextResponse } from "next/server";
import { getRedis, hash, isOwner } from "../scores/shared";

// DROP ALERTS: the email list behind the NOTIFY ME button (same database as the scoreboards)
//   POST /api/notify  { email }                       -> { ok: true }     adds an email to the list
//   POST /api/notify  { code }                        -> { emails: [...] } the whole list, ONLY with the owner code
//   POST /api/notify  { code, remove: "a@b.com" }     -> { emails: [...] } takes one email off the list (owner code)
// The owner code is the same secret as for the scoreboards (PINKRUN_OWNER_CODE in Vercel). It is never put in a link.
// Your private page that uses this: pinkmane.site/drops

export const dynamic = "force-dynamic";

const LIST_KEY = "pinkmane:notify"; // email -> the moment it signed up
const MAX_EMAILS = 20000;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

const cleanEmail = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : "");
const looksReal = (e: string) => e.length >= 6 && e.length <= 120 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(e);

export async function POST(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  let body: { email?: unknown; code?: unknown; remove?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return fail("bad request");
  }
  const ip = hash((req.headers.get("x-forwarded-for") || "local").split(",")[0].trim()).slice(0, 32);

  try {
    // ----- the owner: read the list / take an email off -----
    if (body.code !== undefined) {
      // 10 tries an hour, so nobody can sit there guessing the code
      const tries = await redis.incr(`pinkmane:notify:tries:${ip}`);
      if (tries === 1) await redis.expire(`pinkmane:notify:tries:${ip}`, 3600);
      if (tries > 10) return fail("slow down", 429);
      if (!isOwner(body.code)) return fail("wrong code", 403);
      await redis.del(`pinkmane:notify:tries:${ip}`);
      const gone = cleanEmail(body.remove);
      if (gone) await redis.hdel(LIST_KEY, gone);
      const all = ((await redis.hgetall(LIST_KEY)) || {}) as Record<string, unknown>;
      const emails = Object.entries(all)
        .map(([email, at]) => ({ email, at: Number(at) || 0 }))
        .sort((a, b) => b.at - a.at);
      return NextResponse.json({ emails });
    }

    // ----- a visitor: sign up -----
    const email = cleanEmail(body.email);
    if (!looksReal(email)) return fail("bad email");
    // 5 sign-ups an hour from one place
    const n = await redis.incr(`pinkmane:notify:limit:${ip}`);
    if (n === 1) await redis.expire(`pinkmane:notify:limit:${ip}`, 3600);
    if (n > 5) return fail("slow down", 429);
    if ((await redis.hlen(LIST_KEY)) >= MAX_EMAILS) return fail("full", 503);
    await redis.hsetnx(LIST_KEY, email, Date.now()); // (already on the list = stays as it was)
    return NextResponse.json({ ok: true });
  } catch {
    return fail("offline", 503);
  }
}
