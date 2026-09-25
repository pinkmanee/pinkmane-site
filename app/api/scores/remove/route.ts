import { NextResponse } from "next/server";
import { BANNED_KEY, KEY, OWNER_PREFIX, cleanName, getRedis, isOwner, topTen } from "../shared";

// Owner-only tool to remove names from the scoreboard.
//
// Remove + ban a name (it can't be used again):
//   https://pinkmane.site/api/scores/remove?code=YOURCODE&name=THE NAME
//
// Allow a banned name again:
//   https://pinkmane.site/api/scores/remove?code=YOURCODE&name=THE NAME&unban=1

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isOwner(url.searchParams.get("code"))) {
    return NextResponse.json({ error: "wrong code" }, { status: 401 });
  }

  const redis = getRedis();
  if (!redis) return NextResponse.json({ error: "offline" }, { status: 503 });

  const clean = cleanName(url.searchParams.get("name") || "");
  if (!clean) return NextResponse.json({ error: "add &name=... to the address" }, { status: 400 });

  try {
    if (url.searchParams.get("unban")) {
      await redis.srem(BANNED_KEY, clean);
      return NextResponse.json({ unbanned: clean });
    }

    await redis.zrem(KEY, clean);
    await redis.del(OWNER_PREFIX + clean);
    await redis.sadd(BANNED_KEY, clean);
    return NextResponse.json({ removed: clean, banned: true, scores: await topTen(redis) });
  } catch {
    return NextResponse.json({ error: "could not remove" }, { status: 500 });
  }
}
