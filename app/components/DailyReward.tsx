"use client";

import { useEffect, useState } from "react";

// DAILY REWARDS: come back every day for a 7-day streak.
// A card pops up after CLICK TO START (once a day). Tap COLLECT and you get:
//   - money in EVERY game's shop (gems, kief, gold coins...), more each day of the streak
//   - day 3 and day 7: one of the beats unlocks and joins the iPod's songs (and starts playing)
//   - day 7: the STREAK skin, which you can only get here (it shows in the mini games' shops)
// Miss a day and the streak starts again at day 1. After day 7 it starts a new week.
// Everything is saved on this device (like the shop money it adds to).

// CHANGE THE REWARDS HERE: the money for day 1 - 7
const DAY_MONEY = [25, 40, 60, 80, 100, 130, 250];
const BEAT_DAYS = [3, 7]; // days that unlock a beat
const SKIN_DAY = 7; // the day that gives the STREAK skin

const SAVE_KEY = "pinkmane-daily";
// every game's money: the mini games keep it inside their shop save, the bigger games as a plain number
const SHOP_SAVES = [
  "pinkbird-shop",
  "pinkhex-shop",
  "pinkbomber-shop",
  "pinkrun-shop",
  "pinkkong-shop",
  "pinksnake-shop",
  "pinkmaze-shop",
  "pinkvortex-shop",
  "pinkmane-hell-shop",
];
const PLAIN_BANKS = ["pinkmane-jet-gems", "pinkmane-ninja-kief", "pinkmane-jungle-gems", "pinksuper-goldcoins"];
// the mini games whose shop has the STREAK skin
const SKIN_SAVES = ["pinkbird-shop", "pinkhex-shop", "pinkbomber-shop", "pinkkong-shop", "pinksnake-shop", "pinkmaze-shop", "pinkvortex-shop"];
export const STREAK_SKIN = "skin:streak";

type Save = { last: string; streak: number; beats: string[]; skin: boolean; days: number };

const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return today(d);
};

export function readDaily(): Save {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (raw && typeof raw === "object")
      return {
        last: typeof raw.last === "string" ? raw.last : "",
        streak: Math.max(0, Math.min(7, Number(raw.streak) || 0)),
        beats: Array.isArray(raw.beats) ? raw.beats.filter((b: unknown) => typeof b === "string") : [],
        skin: !!raw.skin,
        days: Number(raw.days) || 0,
      };
  } catch {}
  return { last: "", streak: 0, beats: [], skin: false, days: 0 };
}

function addMoney(n: number) {
  for (const key of SHOP_SAVES) {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null") || { bank: 0, owned: [], lv: {}, wear: {} };
      d.bank = Math.max(0, Math.floor(Number(d.bank) || 0)) + n;
      localStorage.setItem(key, JSON.stringify(d));
    } catch {}
  }
  for (const key of PLAIN_BANKS) {
    try {
      localStorage.setItem(key, String(Math.max(0, Math.floor(Number(localStorage.getItem(key)) || 0)) + n));
    } catch {}
  }
}

function giveSkin() {
  for (const key of SKIN_SAVES) {
    try {
      const d = JSON.parse(localStorage.getItem(key) || "null") || { bank: 0, owned: [], lv: {}, wear: {} };
      if (!Array.isArray(d.owned)) d.owned = [];
      if (!d.owned.includes(STREAK_SKIN)) d.owned.push(STREAK_SKIN);
      localStorage.setItem(key, JSON.stringify(d));
    } catch {}
  }
}

type Props = {
  show: boolean; // the start screen is done and no game is open
  font: string;
  beats: { file: string; title: string }[]; // the beats that can be unlocked, in order
  onBeat: (file: string) => void; // a beat was unlocked (the page adds it to the songs and plays it)
};

export default function DailyReward({ show, font, beats, onBeat }: Props) {
  // what today's card offers (null = nothing today / already collected)
  const [offer, setOffer] = useState<{ day: number; money: number; beat: { file: string; title: string } | null; skin: boolean } | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!show || offer) return;
    const s = readDaily();
    if (s.last === today()) return; // already collected today
    const day = s.last === yesterday() ? (s.streak % 7) + 1 : 1;
    const beat = BEAT_DAYS.includes(day) ? beats.find((b) => !s.beats.includes(b.file)) ?? null : null;
    const skin = day === SKIN_DAY && !s.skin;
    // a beat day with every beat already unlocked, or day 7 with the skin already yours: extra money instead
    const extra = (BEAT_DAYS.includes(day) && !beat ? 50 : 0) + (day === SKIN_DAY && s.skin ? 100 : 0);
    const t = window.setTimeout(() => setOffer({ day, money: DAY_MONEY[day - 1] + extra, beat, skin }), 700);
    return () => window.clearTimeout(t);
  }, [show, offer, beats]);

  const collect = () => {
    if (!offer || done) return;
    const s = readDaily();
    addMoney(offer.money);
    if (offer.skin) {
      giveSkin();
      s.skin = true;
    }
    if (offer.beat) s.beats.push(offer.beat.file);
    s.last = today();
    s.streak = offer.day;
    s.days += 1;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(s));
    } catch {}
    setDone(true);
    if (offer.beat) onBeat(offer.beat.file);
    window.setTimeout(() => setOffer(null), 900);
  };

  // Enter / Space collect while the card is up (and don't also press anything on the iPod behind it)
  useEffect(() => {
    if (!offer) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        collect();
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  });

  if (!offer || !show) return null;
  return (
    <div className="dr-wrap" style={{ fontFamily: font }} role="dialog" aria-label="Daily reward">
      <div className={`dr-card ${done ? "dr-done" : ""}`}>
        <div className="dr-title">DAILY REWARD</div>
        <div className="dr-day">DAY {offer.day} OF 7</div>
        <div className="dr-row" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6, 7].map((d) => (
            <span key={d} className={`dr-box ${d < offer.day || (done && d === offer.day) ? "dr-got" : ""} ${d === offer.day ? "dr-now" : ""} ${d === 7 ? "dr-big" : ""}`}>
              {d}
            </span>
          ))}
        </div>
        <ul className="dr-list">
          <li>+{offer.money} MONEY IN EVERY GAME</li>
          {offer.beat && <li className="dr-beat">NEW BEAT: {offer.beat.title.toUpperCase()}</li>}
          {offer.skin && <li className="dr-skin">STREAK SKIN (ONLY HERE)</li>}
        </ul>
        <button className="dr-btn" onClick={collect} data-shoot>
          {done ? "COLLECTED!" : "COLLECT"}
        </button>
        <div className="dr-note">{offer.day === 7 ? "a new week starts tomorrow" : `come back tomorrow for day ${offer.day + 1}`} · miss a day = back to day 1</div>
      </div>
      <style>{`
        .dr-wrap {
          position: fixed;
          inset: 0;
          z-index: 70;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(10, 2, 16, 0.55);
        }
        .dr-card {
          width: min(380px, 100%);
          padding: 18px 16px 14px;
          text-align: center;
          color: #fff;
          background: #1a0a24;
          border: 3px solid #ff5fd2;
          box-shadow: 6px 6px 0 #000, 0 0 30px rgba(255, 95, 210, 0.35);
          animation: drIn 0.35s ease-out;
        }
        .dr-done { animation: drOut 0.9s ease-in forwards; }
        @keyframes drIn { from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes drOut { 0% { transform: scale(1); } 30% { transform: scale(1.06); } 100% { transform: scale(0.9); opacity: 0; } }
        .dr-title { font-size: 16px; color: #ff8ff0; text-shadow: 2px 2px 0 #000; }
        .dr-day { font-size: 9px; margin-top: 8px; opacity: 0.9; }
        .dr-row { display: flex; justify-content: center; gap: 5px; margin: 14px 0 12px; }
        .dr-box {
          width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;
          font-size: 10px; color: #b99ac8; background: #2a1438; border: 2px solid #4a2c5a;
        }
        .dr-box.dr-big { border-color: #c9a227; color: #ffd84a; }
        .dr-box.dr-got { background: #d63cc8; border-color: #fff; color: #fff; }
        .dr-box.dr-now { outline: 2px solid #ffd84a; outline-offset: 2px; }
        .dr-list { list-style: none; margin: 0 0 14px; padding: 0; font-size: 9px; line-height: 2; }
        .dr-beat { color: #7ad8ff; }
        .dr-skin { color: #ffd84a; }
        .dr-btn {
          font-family: inherit; font-size: 12px; color: #fff; cursor: pointer;
          padding: 10px 22px; background: #d63cc8; border: 2px solid #fff; box-shadow: 3px 3px 0 #000;
        }
        .dr-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
        .dr-note { font-size: 7px; margin-top: 12px; opacity: 0.65; line-height: 1.6; }
      `}</style>
    </div>
  );
}
