import { NextResponse } from "next/server";
import { getRedis, hash } from "../scores/shared";

// THE VISIT COUNTER (same database as the scoreboards)
//   GET  /api/visits                    -> { total }            everyone's visits added up
//   POST /api/visits  { device }        -> { total, mine }      counts one visit for this device and returns both numbers
// The page only sends a POST once per browser session, so refreshing doesn't count again.

export const dynamic = "force-dynamic";

const TOTAL_KEY = "pinkmane:visits:total";
const DEVICES_KEY = "pinkmane:visits:devices"; // one counter per device (the device id is scrambled before it's stored)

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function GET() {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  try {
    const total = Number(await redis.get<number>(TOTAL_KEY)) || 0;
    return NextResponse.json({ total });
  } catch {
    return fail("offline", 503);
  }
}

export async function POST(req: Request) {
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  let device = "";
  try {
    const body = (await req.json()) as { device?: unknown };
    if (typeof body.device === "string") device = body.device;
  } catch {}
  if (device.length < 8 || device.length > 100) return fail("bad request");
  try {
    // one counted visit per person every 10 minutes at most (stops someone pumping the number)
    const ip = (req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
    const fresh = await redis.set(`pinkmane:visits:limit:${hash(ip + device)}`, 1, { nx: true, ex: 600 });
    const field = hash(device).slice(0, 32);
    if (!fresh) {
      const [total, mine] = await Promise.all([redis.get<number>(TOTAL_KEY), redis.hget<number>(DEVICES_KEY, field)]);
      return NextResponse.json({ total: Number(total) || 0, mine: Number(mine) || 0 });
    }
    const [total, mine] = await Promise.all([redis.incr(TOTAL_KEY), redis.hincrby(DEVICES_KEY, field, 1)]);
    return NextResponse.json({ total, mine });
  } catch {
    return fail("offline", 503);
  }
}
