import { NextResponse } from "next/server";
import { getRedis, hash } from "../scores/shared";
import { PER_DAY, byName, diveNumber, liveDepth, promptsForDive } from "../../../game/dive/daily";

// PINK DIVE: today's answers from everyone (same database as the scoreboards).
//   POST /api/dive  { dive, device, answers: [7 answers or null] }
//        -> { depths: [7], total, players, hist, better }
//        Counts your answers, then works out your depth with LIVE RARITY: an answer few players gave today sinks deeper,
//        one everybody gave sinks less (game/dive/daily.ts, liveDepth). One dive per device per day; sending it again just
//        returns your result.
//   GET  /api/dive?dive=12  -> { players, hist }   (for the curve on the results screen)
// Everything about a dive is deleted after 4 days.

export const dynamic = "force-dynamic";

const KEEP = 4 * 86400;
const BUCKET = 20; // the curve counts scores in steps of 20

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

type Stored = { answers: (string | null)[]; depths: number[]; total: number };

async function curve(redis: NonNullable<ReturnType<typeof getRedis>>, dive: number) {
  const [n, h] = await Promise.all([redis.get<number>(`dive:${dive}:n`), redis.hgetall<Record<string, number>>(`dive:${dive}:h`)]);
  const hist: Record<string, number> = {};
  for (const [k, v] of Object.entries(h ?? {})) hist[k] = Number(v) || 0;
  return { players: Number(n) || 0, hist };
}

// how many of today's players you beat, in percent (ties count half)
function better(total: number, hist: Record<string, number>, players: number) {
  if (players <= 1) return 100;
  const mine = Math.floor(total / BUCKET);
  let below = 0;
  let same = 0;
  for (const [k, v] of Object.entries(hist)) {
    if (Number(k) < mine) below += v;
    else if (Number(k) === mine) same += v;
  }
  return Math.max(0, Math.min(100, Math.round(((below + Math.max(0, same - 1) / 2) / (players - 1)) * 100)));
}

export async function GET(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  const dive = Number(new URL(req.url).searchParams.get("dive")) || diveNumber();
  try {
    return NextResponse.json(await curve(redis, dive));
  } catch {
    return fail("offline", 503);
  }
}

export async function POST(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  let body: { dive?: unknown; device?: unknown; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail("bad request");
  }
  const dive = Number(body.dive);
  const device = typeof body.device === "string" ? body.device : "";
  const today = diveNumber();
  // today's dive (or yesterday's, for someone who started just before midnight)
  if (!Number.isInteger(dive) || dive < today - 1 || dive > today) return fail("that dive is over");
  if (device.length < 8 || device.length > 100) return fail("bad request");
  if (!Array.isArray(body.answers) || body.answers.length !== PER_DAY) return fail("bad request");

  // only answers that are really on the list count (the server checks them again)
  const prompts = promptsForDive(dive);
  const hits = prompts.map((p, i) => {
    const a = (body.answers as unknown[])[i];
    return typeof a === "string" && a.length <= 60 ? byName(p, a) : null;
  });

  try {
    const devKey = `dive:${dive}:dev:${hash(device).slice(0, 32)}`;
    const before = await redis.get<Stored>(devKey);
    if (before && Array.isArray(before.depths)) {
      const c = await curve(redis, dive);
      return NextResponse.json({ ...before, ...c, better: better(before.total, c.hist, c.players), again: true });
    }
    // count this diver and their answers
    const players = await redis.incr(`dive:${dive}:n`);
    const counts = await Promise.all(hits.map((h, i) => (h ? redis.hincrby(`dive:${dive}:a:${i}`, h.answer, 1) : Promise.resolve(0))));
    const depths = hits.map((h, i) => (h ? liveDepth(h.depth, counts[i], players) : 0));
    const total = depths.reduce((a, b) => a + b, 0);
    const stored: Stored = { answers: hits.map((h) => (h ? h.answer : null)), depths, total };
    await Promise.all([
      redis.hincrby(`dive:${dive}:h`, String(Math.floor(total / BUCKET)), 1),
      redis.set(devKey, stored, { ex: KEEP }),
      redis.expire(`dive:${dive}:n`, KEEP),
      redis.expire(`dive:${dive}:h`, KEEP),
      ...hits.map((h, i) => (h ? redis.expire(`dive:${dive}:a:${i}`, KEEP) : Promise.resolve(0))),
    ]);
    const c = await curve(redis, dive);
    return NextResponse.json({ ...stored, ...c, better: better(total, c.hist, c.players) });
  } catch {
    return fail("offline", 503);
  }
}
