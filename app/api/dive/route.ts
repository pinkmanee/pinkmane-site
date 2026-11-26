import { NextResponse } from "next/server";
import { BANNED_KEY, BLOCKED, OWNER_PREFIX, cleanName, getRedis, hash, isOwner, isReserved, lettersOnly } from "../scores/shared";
import { PER_DAY, byName, diveNumber, liveDepth, norm, promptsForDive, type Hit } from "../../../game/dive/daily";
import { PROMPTS, TIERS } from "../../../game/dive/prompts";
import { RULES, wikidataLookup } from "../../../game/dive/lookup";

// PINK DIVE: today's answers from everyone (same database as the scoreboards).
//   POST /api/dive  { dive, device, answers: [7 answers or null] }
//        -> { depths: [7], total, players, hist, better }
//        Counts your answers, then works out your depth with LIVE RARITY: an answer few players gave today sinks deeper,
//        one everybody gave sinks less (game/dive/daily.ts, liveDepth). One dive per device per day; sending it again just
//        returns your result.
//   GET  /api/dive?dive=12  -> { players, hist }   (for the curve on the results screen)
//   GET  /api/dive?look=fish&q=bluefin+trevally -> { answer: "bluefin trevally" | null }
//        THE BIG LOOKUP: an answer that isn't on our lists gets checked on Wikidata (game/dive/lookup.ts). If it's real and
//        fits, it counts as a DEEP CUT. The result is remembered for 30 days, so the final count (POST) can trust it.
//   POST /api/dive  { act: "name", dive, device, name, owner? } -> { top, rank, name }
//        Puts your name on TODAY'S BOARD (the deepest divers of the day) with the depth you already dove. Only someone who
//        dove today can, one name per device per day (sending another name just renames you). The same name rules as
//        the scoreboards: no slurs, PINKMANE is yours only, and a name belongs to the device that used it first.
//   GET  /api/dive?dive=12&board=1&me=<device> -> { players, hist, top, ghosts }
//        top = today's board (top 10 names), ghosts = up to 10 other divers' 7 depths (named ones show their name),
//        drawn as GHOST SUBS sinking next to yours.
// Everything about a dive is deleted after 4 days.

export const dynamic = "force-dynamic";

// PINK DIVE is live, so the server is on (false = it answers "not found" on the live site).
const DIVE_PUBLIC = true;
const off = () => !DIVE_PUBLIC && process.env.NODE_ENV !== "development";

const KEEP = 4 * 86400;
const BUCKET = 20; // the curve counts scores in steps of 20

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

type Stored = { answers: (string | null)[]; depths: number[]; total: number };
type Ghost = { k: string; d: number[]; t: number }; // k = the first 12 letters of the diver's device hash

const short = (device: string) => hash(device).slice(0, 12);

// today's board: the 10 deepest named divers
async function board(redis: NonNullable<ReturnType<typeof getRedis>>, dive: number) {
  const raw = (await redis.zrange(`dive:${dive}:top`, 0, 9, { rev: true, withScores: true })) as (string | number)[];
  const top: { name: string; score: number }[] = [];
  for (let i = 0; i < raw.length; i += 2) top.push({ name: String(raw[i]), score: Number(raw[i + 1]) });
  return top;
}

// up to 10 other divers for the ghost subs: the 5 deepest, and 5 picked at random from the rest
async function ghosts(redis: NonNullable<ReturnType<typeof getRedis>>, dive: number, me: string) {
  const [list, names] = await Promise.all([
    redis.lrange<Ghost>(`dive:${dive}:g`, 0, 299),
    redis.hgetall<Record<string, string>>(`dive:${dive}:nm`),
  ]);
  const others = (list ?? []).filter((g) => g && Array.isArray(g.d) && g.k !== me);
  others.sort((a, b) => b.t - a.t);
  const pick = others.slice(0, 5);
  const rest = others.slice(5);
  for (let i = 0; i < 5 && rest.length; i++) pick.push(rest.splice(Math.floor(Math.random() * rest.length), 1)[0]);
  return pick.map((g) => ({ name: names?.[g.k] ?? null, depths: g.d.slice(0, PER_DAY).map((n) => Number(n) || 0) }));
}

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

// ---- THE BIG LOOKUP (remembered in the database, so each word is only asked about once a month)
const LOOK_KEEP = 30 * 86400;
const DEEP = 3; // the tier an answer found this way gets: DEEP CUT
async function lookUp(promptId: string, typed: string): Promise<string | null> {
  if (!RULES[promptId] || !PROMPTS.some((p) => p.id === promptId)) return null;
  const k = norm(typed);
  if (k.length < 2 || k.length > 50) return null;
  const redis = getRedis();
  const key = `dive:look:${promptId}:${k}`;
  try {
    const saved = redis ? await redis.get<string>(key) : null;
    if (typeof saved === "string") return saved || null;
  } catch {}
  const found = await wikidataLookup(promptId, typed);
  try {
    if (redis) {
      await redis.set(key, found ?? "", { ex: LOOK_KEEP });
      if (found) await redis.set(`dive:look:${promptId}:${norm(found)}`, found, { ex: LOOK_KEEP });
    }
  } catch {}
  return found;
}
const deepHit = (answer: string): Hit => ({ answer: answer.toUpperCase(), tier: DEEP, depth: TIERS[DEEP].depth });

export async function GET(req: Request) {
  if (off()) return fail("not found", 404);
  const params = new URL(req.url).searchParams;
  const look = params.get("look");
  if (look) {
    const q = params.get("q") ?? "";
    const found = await lookUp(look, q);
    return NextResponse.json({ answer: found ? deepHit(found).answer : null });
  }
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  const dive = Number(params.get("dive")) || diveNumber();
  try {
    if (params.get("board")) {
      const me = params.get("me") ?? "";
      const [c, top, g] = await Promise.all([curve(redis, dive), board(redis, dive), ghosts(redis, dive, me.length >= 8 ? short(me) : "")]);
      return NextResponse.json({ ...c, top, ghosts: g });
    }
    return NextResponse.json(await curve(redis, dive));
  } catch {
    return fail("offline", 503);
  }
}

export async function POST(req: Request) {
  if (off()) return fail("not found", 404);
  const redis = getRedis();
  if (!redis) return fail("offline", 503);
  let body: { dive?: unknown; device?: unknown; answers?: unknown; act?: unknown; name?: unknown; owner?: unknown };
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
  if (body.act === "name") return putName(redis, dive, device, body.name, body.owner);
  if (!Array.isArray(body.answers) || body.answers.length !== PER_DAY) return fail("bad request");

  // only answers that are really on the list count (the server checks them again)
  const prompts = promptsForDive(dive);
  const hits = await Promise.all(
    prompts.map(async (p, i) => {
      const a = (body.answers as unknown[])[i];
      if (typeof a !== "string" || a.length > 60) return null;
      const listed = byName(p, a);
      if (listed) return listed;
      // not on our lists: was it found by THE BIG LOOKUP? (remembered, or asked again)
      const found = await lookUp(p.id, a);
      return found ? deepHit(found) : null;
    }),
  );

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
      // for the ghost subs
      redis.lpush<Ghost>(`dive:${dive}:g`, { k: short(device), d: depths, t: total }),
    ]);
    await Promise.all([redis.ltrim(`dive:${dive}:g`, 0, 299), redis.expire(`dive:${dive}:g`, KEEP)]);
    const c = await curve(redis, dive);
    return NextResponse.json({ ...stored, ...c, better: better(total, c.hist, c.players) });
  } catch {
    return fail("offline", 503);
  }
}

// ---- TODAY'S BOARD: put your name next to the depth you already dove today
async function putName(redis: NonNullable<ReturnType<typeof getRedis>>, dive: number, device: string, name: unknown, ownerCode: unknown) {
  if (typeof name !== "string") return fail("bad request");
  const clean = cleanName(name);
  if (clean.length < 2) return fail("name too short");
  if (BLOCKED.some((w) => lettersOnly(clean).includes(w))) return fail("pick another name");
  try {
    // one name change every few seconds per device is plenty
    const allowed = await redis.set(`dive:limit:${short(device)}`, 1, { nx: true, ex: 4 });
    if (!allowed) return fail("slow down", 429);
    const mine = await redis.get<Stored>(`dive:${dive}:dev:${hash(device).slice(0, 32)}`);
    if (!mine || !Array.isArray(mine.depths)) return fail("dive first");
    if (await redis.sismember(BANNED_KEY, clean)) return fail("pick another name");
    const owner = isOwner(ownerCode);
    if (isReserved(clean)) {
      if (!owner) return fail("name reserved");
    } else {
      // the same name lock as the scoreboards: a name belongs to the device that used it first
      const lockKey = OWNER_PREFIX + clean;
      const deviceHash = hash(device);
      await redis.set(lockKey, deviceHash, { nx: true });
      const lockedTo = await redis.get<string>(lockKey);
      if (lockedTo !== deviceHash && !owner) return fail("name taken");
    }
    const k = short(device);
    const before = await redis.hget<string>(`dive:${dive}:nm`, k);
    if (before && before !== clean) await redis.zrem(`dive:${dive}:top`, before);
    await Promise.all([
      redis.zadd(`dive:${dive}:top`, { score: mine.total, member: clean }),
      redis.hset(`dive:${dive}:nm`, { [k]: clean }),
    ]);
    await Promise.all([redis.expire(`dive:${dive}:top`, KEEP), redis.expire(`dive:${dive}:nm`, KEEP)]);
    const deeper = await redis.zcount(`dive:${dive}:top`, `(${mine.total}`, "+inf"); // names deeper than you
    return NextResponse.json({ top: await board(redis, dive), rank: Number(deeper) + 1, name: clean });
  } catch {
    return fail("offline", 503);
  }
}
