// PINK DIVE: which prompts today, and whether an answer counts. Used by the game page AND the server (app/api/dive),
// so both always agree.

import { PROMPTS, TIERS, type Prompt } from "./prompts";

/** DIVE #1 is this day (UTC). Every day after is the next number. */
export const LAUNCH = Date.UTC(2026, 10, 26);
export const PER_DAY = 7;
export const SECONDS = 25;

/** today's dive number (the day changes at midnight UTC = 1 am in Slovakia in winter, 2 am in summer) */
export const diveNumber = (now = Date.now()) => Math.max(1, Math.floor((now - LAUNCH) / 86400000) + 1);

// a small seeded random, so everyone gets the same shuffle
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled<T>(list: T[], seed: number): T[] {
  const out = list.slice();
  const r = rng(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// One long running order of every prompt, with the categories taking turns (animals, food, music, earth, film...),
// so any 7 in a row are a mix. Each day takes the next 7; when the list runs out it starts again, reshuffled.
function order(round: number): Prompt[] {
  const cats = Array.from(new Set(PROMPTS.map((p) => p.cat)));
  const piles = cats.map((c, i) => shuffled(PROMPTS.filter((p) => p.cat === c), 1000 + round * 97 + i));
  const out: Prompt[] = [];
  for (let k = 0; piles.some((pile) => pile.length > k); k++) for (const pile of shuffled(piles, 5000 + round * 31 + k)) if (pile[k]) out.push(pile[k]);
  return out;
}

/** the 7 prompts of a dive (the same for everyone) */
export function promptsForDive(dive: number): Prompt[] {
  const perRound = Math.floor(PROMPTS.length / PER_DAY);
  const round = Math.floor((dive - 1) / perRound);
  const at = ((dive - 1) % perRound) * PER_DAY;
  return order(round).slice(at, at + PER_DAY);
}

/** 7 random prompts for PRACTICE (not today's ones) */
export function practicePrompts(notThese: Prompt[], seed = Date.now()): Prompt[] {
  const skip = new Set(notThese.map((p) => p.id));
  return shuffled(PROMPTS.filter((p) => !skip.has(p.id)), seed).slice(0, PER_DAY);
}

// ------------------------------------------------------------------ checking an answer
/** lower case, no accents, no punctuation, no "the" in front: "The Beatles!" = "beatles" */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "");
}

export type Hit = { answer: string; tier: number; depth: number };

const indexes = new Map<string, Map<string, Hit>>();
/** every way of writing every answer of a prompt -> the answer and its tier */
export function indexOf(p: Prompt): Map<string, Hit> {
  let m = indexes.get(p.id);
  if (m) return m;
  m = new Map();
  p.t.forEach((line, tier) => {
    for (const entry of line.split(",")) {
      const names = entry.split("|").map((n) => n.trim()).filter(Boolean);
      if (!names.length) continue;
      const hit: Hit = { answer: names[0].toUpperCase(), tier, depth: TIERS[tier].depth };
      for (const n of names) {
        const k = norm(n);
        if (!k) continue;
        // (an answer that is in two tiers by mistake counts as the more common one: the first)
        if (!m!.has(k)) m!.set(k, hit);
        const tight = k.replace(/ /g, "");
        if (!m!.has(tight)) m!.set(tight, hit);
      }
    }
  });
  indexes.set(p.id, m);
  return m;
}

function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** does this count for this prompt? Forgives plurals and small typos. null = not on the list */
export function check(p: Prompt, typed: string): Hit | null {
  const m = indexOf(p);
  const k = norm(typed);
  if (!k) return null;
  const tries = [k, k.replace(/ /g, "")];
  if (k.endsWith("es")) tries.push(k.slice(0, -2));
  if (k.endsWith("s")) tries.push(k.slice(0, -1));
  else tries.push(k + "s");
  for (const t of tries) {
    const hit = m.get(t);
    if (hit) return hit;
  }
  // a typo: 1 letter off for 5 - 8 letters, 2 off for longer words (only if exactly one answer is that close)
  const max = k.length >= 9 ? 2 : k.length >= 5 ? 1 : 0;
  if (!max) return null;
  let found: Hit | null = null;
  let bestD = max + 1;
  let tie = false;
  for (const [key, hit] of m) {
    if (key.length < 4) continue;
    const d = editDistance(k, key, max);
    if (d < bestD) {
      bestD = d;
      found = hit;
      tie = false;
    } else if (d === bestD && found && hit !== found) tie = true;
  }
  return found && !tie ? found : null;
}

/** the answer by its exact name (what the page sends to the server) */
export function byName(p: Prompt, answer: string): Hit | null {
  return indexOf(p).get(norm(answer)) ?? null;
}

// ------------------------------------------------------------------ the total
/** the name for a total score (max 700) */
export const BANDS = [
  { from: 0, name: "PLANKTON", line: "Plenty of ocean left down there." },
  { from: 121, name: "SCHOOL FISH", line: "Swimming with everyone else." },
  { from: 241, name: "RARE", line: "Past the reef. Nice." },
  { from: 361, name: "DEEP CUT", line: "A seriously deep dive." },
  { from: 481, name: "ONE IN A MILLION", line: "Trench dweller. Absurd." },
] as const;
export const bandOf = (score: number) => BANDS.reduce((b, x, i) => (score >= x.from ? i : b), 0);

/**
 * LIVE RARITY: how today's players change an answer's depth.
 * share = how many of today's players gave this answer (0 - 1). Nobody else said it: up to +25%. Everybody said it: down to half.
 * (With only a few players the built-in depth counts most, so the first divers of the day aren't punished.)
 */
export function liveDepth(base: number, count: number, players: number): number {
  const share = count / (players + 10);
  const m = Math.max(0.5, Math.min(1.25, 1.25 - 1.5 * share));
  return Math.round(base * m);
}
