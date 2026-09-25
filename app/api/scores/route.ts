import { NextResponse } from "next/server";
import {
  BANNED_KEY,
  BLOCKED,
  KEY,
  MAX_ENTRIES,
  OWNER_PREFIX,
  cleanName,
  getRedis,
  hash,
  isOwner,
  isReserved,
  lettersOnly,
  topTen,
} from "./shared";

// Always run fresh (never cache the scoreboard)
export const dynamic = "force-dynamic";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  try {
    return NextResponse.json({ scores: await topTen(redis) });
  } catch {
    return fail("offline", 503);
  }
}

export async function POST(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);

  let body: { name?: unknown; score?: unknown; runTime?: unknown; device?: unknown; ownerCode?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("bad request");
  }

  const { name, score, runTime, device, ownerCode } = body;
  if (
    typeof name !== "string" ||
    typeof score !== "number" ||
    typeof runTime !== "number" ||
    typeof device !== "string" ||
    device.length < 8 ||
    device.length > 100
  ) {
    return fail("bad request");
  }

  const clean = cleanName(name);
  if (clean.length < 2) return fail("name too short");
  if (BLOCKED.some((w) => lettersOnly(clean).includes(w))) return fail("pick another name");

  // Simple cheat check: the score has to be possible for how long the run lasted
  const s = Math.floor(score);
  if (!Number.isFinite(s) || s < 1 || s > 100000) return fail("score not valid");
  if (!(runTime > 0) || runTime > 3600 || s > runTime * 60 + 100) return fail("score not valid");

  try {
    if (await redis.sismember(BANNED_KEY, clean)) return fail("pick another name");

    const owner = isOwner(ownerCode);
    if (isReserved(clean)) {
      // Only you (with the owner code) can use PINKMANE
      if (!owner) return fail("name reserved");
    } else {
      // Every other name belongs to the first device that used it
      const lockKey = OWNER_PREFIX + clean;
      const deviceHash = hash(device);
      await redis.set(lockKey, deviceHash, { nx: true });
      const lockedTo = await redis.get<string>(lockKey);
      if (lockedTo !== deviceHash && !owner) return fail("name taken");
    }

    // One save every 10 seconds per visitor
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const allowed = await redis.set(`pinkrun:limit:${ip}`, 1, { nx: true, ex: 10 });
    if (!allowed) return fail("slow down", 429);

    // Each name keeps only its best score
    const current = await redis.zscore(KEY, clean);
    if (current === null || s > Number(current)) {
      await redis.zadd(KEY, { score: s, member: clean });
    }

    // Keep only the top 100 in the database
    await redis.zremrangebyrank(KEY, 0, -(MAX_ENTRIES + 1));

    return NextResponse.json({ scores: await topTen(redis), name: clean });
  } catch {
    return fail("could not save", 500);
  }
}
