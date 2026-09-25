import { Redis } from "@upstash/redis";
import { createHash, timingSafeEqual } from "crypto";

// Shared helpers for the PINK RUN scoreboard

export const KEY = "pinkrun:scores";
export const BANNED_KEY = "pinkrun:banned";
export const OWNER_PREFIX = "pinkrun:owner:";
export const MAX_ENTRIES = 100;

// Names nobody can use. Checked after turning numbers into letters
// (N1GG3R -> nigger), removing spaces/symbols (N I G G A -> nigga)
// and squashing repeated letters (NIIIGGA -> niga).
// Add or remove words here if you want (lowercase, letters only).
export const BLOCKED = [
  // racist slurs
  "nigger", "nigga", "nigg", "niger", "niga", "nigr", "negro",
  "chink", "gook", "kike", "wetback", "beaner", "raghead", "towelhead",
  // homophobic / transphobic
  "faggot", "fagot", "fagg", "dyke", "tranny",
  // hate
  "hitler", "nazi", "heil", "kkk", "retard",
  // sexual
  "dick", "cock", "pussy", "pusy", "penis", "porn", "whore", "slut",
];

// Number codes used by hate groups
const BLOCKED_NUMBERS = ["1488", "88 14"];

export type Entry = { name: string; score: number };

export function getRedis() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

// Capitals, numbers and a few symbols, max 12 characters
export function cleanName(name: string) {
  return name.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "").trim().slice(0, 12);
}

const LOOKALIKES: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g",
};

// Turns a name into plain letters for checking, e.g. "N1GG 3R" -> "nigger".
// Returns the normal version and a squashed version (repeated letters removed).
export function lettersOnly(name: string) {
  const plain = name
    .toLowerCase()
    .replace(/[0-9]/g, (d) => LOOKALIKES[d] || "")
    .replace(/[^a-z]/g, "");
  const squashed = plain.replace(/(.)\1+/g, "$1");
  const numbers = BLOCKED_NUMBERS.some((n) => name.replace(/\s+/g, " ").includes(n)) ? " kkk" : "";
  return `${plain} ${squashed}${numbers}`;
}

// Only you can post as PINKMANE (or anything containing it)
export function isReserved(name: string) {
  return lettersOnly(name).includes("pinkmane");
}

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

// Checks the secret owner code from your Vercel settings
export function isOwner(code: unknown) {
  const real = process.env.PINKRUN_OWNER_CODE;
  if (!real || typeof code !== "string" || code.length === 0) return false;
  const a = Buffer.from(hash(code));
  const b = Buffer.from(hash(real));
  return timingSafeEqual(a, b);
}

export async function topTen(redis: Redis): Promise<Entry[]> {
  const raw = (await redis.zrange(KEY, 0, 9, { rev: true, withScores: true })) as (string | number)[];
  const out: Entry[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push({ name: String(raw[i]), score: Number(raw[i + 1]) });
  }
  return out;
}
