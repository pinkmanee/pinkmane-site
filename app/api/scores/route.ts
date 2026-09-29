import { NextResponse } from "next/server";
import {
  BANNED_KEY,
  BLOCKED,
  MAX_ENTRIES,
  OWNER_PREFIX,
  cleanName,
  gameConfig,
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

// Read a Top 10:  /api/scores  (Pink Run)  or  /api/scores?game=vortex
export async function GET(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  const game = gameConfig(new URL(req.url).searchParams.get("game"));
  try {
    return NextResponse.json({ scores: await topTen(redis, game.key) });
  } catch {
    return fail("offline", 503);
  }
}

export async function POST(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);

  let body: {
    name?: unknown;
    score?: unknown;
    runTime?: unknown;
    device?: unknown;
    ownerCode?: unknown;
    game?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return fail("bad request");
  }

  const { name, score, runTime, device, ownerCode } = body;
  const game = gameConfig(body.game);
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
  if (!Number.isFinite(s) || s < 1 || s > game.max) return fail("score not valid");
  if (!(runTime > 0) || runTime > 7200 || s > runTime * game.rate + game.base) return fail("score not valid");

  try {
    if (await redis.sismember(BANNED_KEY, clean)) return fail("pick another name");

    const owner = isOwner(ownerCode);
    if (isReserved(clean)) {
      // Only you (with the owner code) can use PINKMANE
      if (!owner) return fail("name reserved");
    } else {
      // Every other name belongs to one device (the same across all games).
      // Someone else can take the name over, but only by beating its best score in this game.
      const lockKey = OWNER_PREFIX + clean;
      const deviceHash = hash(device);
      await redis.set(lockKey, deviceHash, { nx: true });
      const lockedTo = await redis.get<string>(lockKey);
      if (lockedTo !== deviceHash && !owner) {
        const theirs = await redis.zscore(game.key, clean);
        if (theirs !== null && s <= Number(theirs)) return fail("beat their score to take this name");
        await redis.set(lockKey, deviceHash); // the name is yours now
      }
    }

    // One save every 10 seconds per visitor
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const allowed = await redis.set(`pinkrun:limit:${ip}`, 1, { nx: true, ex: 10 });
    if (!allowed) return fail("slow down", 429);

    // Each name keeps only its best score
    const current = await redis.zscore(game.key, clean);
    if (current === null || s > Number(current)) {
      await redis.zadd(game.key, { score: s, member: clean });
    }

    // Keep only the top 100 in the database
    await redis.zremrangebyrank(game.key, 0, -(MAX_ENTRIES + 1));

    return NextResponse.json({ scores: await topTen(redis, game.key), name: clean });
  } catch {
    return fail("could not save", 500);
  }
}
