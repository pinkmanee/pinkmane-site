// PINK DIVE: which prompts today, and whether an answer counts. Used by the game page AND the server (app/api/dive),
// so both always agree.

import { FIRST_SET, PROMPTS, TIERS, type Prompt } from "./prompts";
import { MORE } from "./more";
import { MORE2 } from "./more2";
import { MORE3 } from "./more3";

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

// One long running order of every prompt, with the categories taking turns (animals, food, music, earth, film, sports, stuff...),
// so any 7 in a row are a mix. Each day takes the next 7; when the list runs out it starts again, reshuffled.
function order(list: Prompt[], round: number): Prompt[] {
  const cats = Array.from(new Set(list.map((p) => p.cat)));
  const piles = cats.map((c, i) => shuffled(list.filter((p) => p.cat === c), 1000 + round * 97 + i));
  const out: Prompt[] = [];
  for (let k = 0; piles.some((pile) => pile.length > k); k++) for (const pile of shuffled(piles, 5000 + round * 31 + k)) if (pile[k]) out.push(pile[k]);
  return out;
}

// each new round: the prompts of the last 6 days of the round before go to the end, so nothing comes back within a week
// (`before` = the prompts of the days just before round 0, they go to the end of round 0 the same way)
function makeRounds(list: Prompt[], before: string[] = []) {
  const perRound = Math.floor(list.length / PER_DAY);
  const rounds: Prompt[][] = [];
  return {
    perRound,
    get(round: number): Prompt[] {
      for (let r = rounds.length; r <= round; r++) {
        let o = order(list, r);
        const recent = new Set(r > 0 ? rounds[r - 1].slice(Math.max(0, perRound - 6) * PER_DAY, perRound * PER_DAY).map((p) => p.id) : before);
        o = [...o.filter((p) => !recent.has(p.id)), ...o.filter((p) => recent.has(p.id))];
        rounds.push(o);
      }
      return rounds[round];
    },
  };
}

// DIVE #1 was played with the first set of prompts only (before prompts-extra.ts), so it stays exactly as it was.
// From DIVE #2 on every prompt takes part (and nothing from DIVE #1 comes back in the first days).
const OLD_DIVES = 1;
const firstSet = makeRounds(PROMPTS.slice(0, FIRST_SET));
const oldDive = (dive: number) => {
  const round = Math.floor((dive - 1) / firstSet.perRound);
  const at = ((dive - 1) % firstSet.perRound) * PER_DAY;
  return firstSet.get(round).slice(at, at + PER_DAY);
};
const allSet = makeRounds(PROMPTS, Array.from({ length: OLD_DIVES }, (_, i) => oldDive(i + 1).map((p) => p.id)).flat());

// MUSIC FRIDAY: every Friday (from 4 Dec 2026, DIVE #9) the 7 prompts are all MUSIC ones, and the dive pays double
// weed leaves (PinkDive.tsx). The music prompts take turns in their own shuffled order, skipping any from the days around it.
const FIRST_MUSIC_FRIDAY = 9;
export const isMusicFriday = (dive: number) => dive >= FIRST_MUSIC_FRIDAY && (dive - FIRST_MUSIC_FRIDAY) % 7 === 0;
const musicSet = makeRounds(PROMPTS.filter((p) => p.cat === "MUSIC"));

function normalDive(dive: number): Prompt[] {
  if (dive <= OLD_DIVES) return oldDive(dive);
  const n = dive - OLD_DIVES;
  const round = Math.floor((n - 1) / allSet.perRound);
  const at = ((n - 1) % allSet.perRound) * PER_DAY;
  return allSet.get(round).slice(at, at + PER_DAY);
}

/** the 7 prompts of a dive (the same for everyone) */
export function promptsForDive(dive: number): Prompt[] {
  if (!isMusicFriday(dive)) return normalDive(dive);
  const k = (dive - FIRST_MUSIC_FRIDAY) / 7; // the how-manyth MUSIC FRIDAY this is
  const recent = new Set<string>();
  // (none from the 6 days before or the 6 days after, so nothing comes back within a week)
  const gap = new Map<string, number>(); // how many days away the nearest other use of each prompt is
  for (let d = dive - 6; d <= dive + 6; d++)
    if (d >= 1 && d !== dive && !isMusicFriday(d))
      for (const p of normalDive(d)) {
        recent.add(p.id);
        gap.set(p.id, Math.min(gap.get(p.id) ?? 99, Math.abs(d - dive)));
      }
  const order = musicSet.get(Math.floor(k / Math.max(1, musicSet.perRound)));
  const start = (k * PER_DAY) % Math.max(1, order.length);
  const out: Prompt[] = [];
  for (let i = 0; i < order.length && out.length < PER_DAY; i++) {
    const p = order[(start + i) % order.length];
    if (!recent.has(p.id) && !out.includes(p)) out.push(p);
  }
  // (if too few are free: the ones whose other use is the furthest away)
  const spare = order.filter((p) => !out.includes(p)).sort((a, b) => (gap.get(b.id) ?? 99) - (gap.get(a.id) ?? 99));
  while (out.length < PER_DAY && spare.length) out.push(spare.shift()!);
  return out;
}

/** 7 random prompts for PRACTICE (not today's ones) */
/**
 * 7 prompts for PRACTICE (never today's ones). `seen` = the prompts you've had lately, oldest first: the ones you haven't
 * had come first, so you go through all of them before any comes back; and no two of the same category in a row.
 */
export function practicePrompts(notThese: Prompt[], seen: string[] = [], seed = Date.now()): Prompt[] {
  const skip = new Set(notThese.map((p) => p.id));
  const pool = shuffled(PROMPTS.filter((p) => !skip.has(p.id)), seed);
  const when = new Map(seen.map((id, i) => [id, i])); // (later = seen more recently)
  pool.sort((a, b) => (when.get(a.id) ?? -1) - (when.get(b.id) ?? -1)); // never seen first, then the longest ago
  const out: Prompt[] = [];
  const left = pool.slice(0, PER_DAY * 2);
  while (out.length < PER_DAY && left.length) {
    const last = out[out.length - 1]?.cat;
    const i = left.findIndex((p) => p.cat !== last);
    out.push(left.splice(i < 0 ? 0 : i, 1)[0]);
  }
  return out;
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
/** every way of writing every answer of a prompt -> the answer and its tier (the extra answers in more.ts count too) */
export function indexOf(p: Prompt): Map<string, Hit> {
  let m = indexes.get(p.id);
  if (m) return m;
  m = new Map();
  const lines: string[][] = [p.t, MORE[p.id] ?? [], MORE2[p.id] ?? [], MORE3[p.id] ?? []];
  for (const tiers of lines)
    tiers.forEach((line, tier) => {
      for (const entry of line.split(",")) {
        const names = entry.split("|").map((n) => n.trim()).filter(Boolean);
        if (!names.length) continue;
        const k0 = norm(names[0]);
        // (an answer that is in the list twice counts the first time it's written: prompts.ts first, then more.ts)
        const hit: Hit = (k0 && m!.get(k0)) || { answer: names[0].toUpperCase(), tier, depth: TIERS[tier].depth };
        for (const n of names) {
          const k = norm(n);
          if (!k) continue;
          if (!m!.has(k)) m!.set(k, hit);
          const tight = k.replace(/ /g, "");
          if (!m!.has(tight)) m!.set(tight, hit);
        }
      }
    });
  indexes.set(p.id, m);
  return m;
}

// ------------------------------------------------------------------ forgiving typos
// A wrong key right next to the right one (on a phone or a laptop keyboard) costs half a mistake, so "lyon" -> lion.
// Two letters swapped ("lino") and a doubled / missing double letter ("salmmon", "rabit") also cost half.
const KEYROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEYPOS = new Map<string, [number, number]>();
KEYROWS.forEach((row, r) => [...row].forEach((ch, c) => KEYPOS.set(ch, [r, c + r * 0.5])));
function nextTo(a: string, b: string) {
  const pa = KEYPOS.get(a), pb = KEYPOS.get(b);
  return !!pa && !!pb && Math.abs(pa[0] - pb[0]) <= 1 && Math.abs(pa[1] - pb[1]) <= 1;
}
function typoDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max * 2) return max + 1;
  const n = a.length, mm = b.length;
  const d: number[][] = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: mm + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= n; i++) {
    let best = Infinity;
    for (let j = 1; j <= mm; j++) {
      const x = a[i - 1], y = b[j - 1];
      const sub = x === y ? 0 : nextTo(x, y) ? 0.5 : 1;
      const del = i > 1 && a[i - 2] === x ? 0.5 : 1; // an extra double letter
      const ins = j > 1 && b[j - 2] === y ? 0.5 : 1; // a missing double letter
      let v = Math.min(d[i - 1][j] + del, d[i][j - 1] + ins, d[i - 1][j - 1] + sub);
      if (i > 1 && j > 1 && x === b[j - 2] && a[i - 2] === y) v = Math.min(v, d[i - 2][j - 2] + 0.5); // two letters swapped
      d[i][j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
  }
  return d[n][mm];
}
/** how many mistakes a word of this length may have */
const allowance = (len: number) => (len <= 2 ? 0 : len === 3 ? 0.5 : len <= 5 ? 1 : len <= 8 ? 1.5 : len <= 12 ? 2 : 3);

// words people add around an answer that don't change it: "mt everest", "lake como", "salmon fish", "pug dog", "the beatles band"
const BEFORE = /^(mount|mt|mont|monte|lake|loch|lago|river|rio|isle of|island of|isla|cape|dj|mc|saint|st|sankt)\s+/;
const AFTER = /\s+(fish|bird|dog|breed|puppy|cat|snake|lizard|bug|insect|fruit|berry|veg|vegetable|cheese|pasta|noodles|topping|pizza|candy|bar|chocolate|strain|weed|river|lake|sea|ocean|bay|gulf|mountain|mountains|mount|range|peak|volcano|island|islands|isle|band|group|crew|song|track|movie|film|anime|series|show|cartoon|character|pokemon|state|country|city)$/;
function variants(typed: string): string[] {
  const k = norm(typed);
  if (!k) return [];
  const bases = new Set([k]);
  // take the extra words off, both ends, as long as something is left
  let x = k;
  for (let i = 0; i < 2; i++) {
    const y = x.replace(BEFORE, "").replace(AFTER, "");
    if (y && y !== x) bases.add((x = y));
  }
  const tries: string[] = [];
  for (const b of bases) {
    tries.push(b, b.replace(/ /g, ""));
    if (b.endsWith("ies")) tries.push(b.slice(0, -3) + "y");
    if (b.endsWith("es")) tries.push(b.slice(0, -2));
    if (b.endsWith("s")) tries.push(b.slice(0, -1));
    else tries.push(b + "s");
  }
  return tries;
}

// every answer that's close to what was typed, closest first
function near(p: Prompt, typed: string, extra: number): { hit: Hit; d: number }[] {
  const m = indexOf(p);
  const k = norm(typed);
  const max = allowance(k.replace(/ /g, "").length) + extra;
  if (max <= 0) return [];
  const best = new Map<Hit, number>();
  for (const [key, hit] of m) {
    if (key.length < 3) continue;
    let d = max + 1;
    for (const t of variants(typed)) d = Math.min(d, typoDistance(t, key, max));
    if (d <= max && d < (best.get(hit) ?? Infinity)) best.set(hit, d);
  }
  return [...best].map(([hit, d]) => ({ hit, d })).sort((a, b) => a.d - b.d || a.hit.tier - b.hit.tier);
}

/** does this count for this prompt? Forgives plurals, "the", spaces and typos. null = not on the list */
export function check(p: Prompt, typed: string): Hit | null {
  const m = indexOf(p);
  for (const t of variants(typed)) {
    const hit = m.get(t);
    if (hit) return hit;
  }
  // a kind of something that's on the list: "atlantic salmon" -> SALMON, "giant red tortoise" -> TORTOISE (scores like it)
  const words = norm(typed).split(" ");
  // an extra word at the end: "granny smith apple" -> GRANNY SMITH, "black widow spider" -> BLACK WIDOW
  for (let i = 1; i < words.length && i <= 2; i++) {
    const front = words.slice(0, words.length - i).join(" ");
    if (front.length < 4 || !front.includes(" ")) break;
    const hit = m.get(front) ?? m.get(front.replace(/ /g, ""));
    if (hit) return hit;
  }
  for (let i = 1; i < words.length && i <= 2; i++) {
    const rest = words.slice(i).join(" ");
    if (rest.length < 3) break;
    for (const t of variants(rest)) {
      const hit = m.get(t);
      if (hit) return hit;
    }
  }
  const close = near(p, typed, 0);
  if (!close.length) return null;
  // the closest one counts, unless a different answer is just as close (then the player picks: see suggest)
  if (close.length > 1 && close[1].d <= close[0].d) return null;
  return close[0].hit;
}

/** "DID YOU MEAN ...?": up to 3 answers close to a word that didn't count (a bigger typo, or a part of a longer name) */
export function suggest(p: Prompt, typed: string): Hit[] {
  const k = norm(typed);
  if (k.replace(/ /g, "").length < 3) return [];
  const out: Hit[] = [];
  // the start of an answer, at least 4 letters and half of it (so it helps with a cut-off word, but can't be used to fish
  // for answers): "hammer" -> HAMMERHEAD SHARK, "guin" -> GUINEA
  if (k.length >= 4)
    for (const [key, hit] of indexOf(p)) if (!out.includes(hit) && key.length > k.length && key.length <= k.length * 2 && key.startsWith(k)) out.push(hit);
  out.sort((x, y) => x.tier - y.tier);
  for (const c of near(p, typed, 1)) if (!out.includes(c.hit)) out.push(c.hit);
  // a part of a longer answer: "romagnolo" -> LAGOTTO ROMAGNOLO, "fringehead" -> SARCASTIC FRINGEHEAD
  if (k.length >= 4)
    for (const [key, hit] of indexOf(p))
      if (!out.includes(hit) && key.includes(" ") && key.split(" ").some((w) => w === k || (k.length >= 5 && w.startsWith(k)))) out.push(hit);
  return out.slice(0, 3);
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
