// UNRELEASED SNIPPETS: beat the target score in a game and a snippet joins the iPod's songs.
//
// HOW IT WORKS
//   - every game below has a TARGET score. Beat it in one game = snippet 1 unlocks.
//     (If you add a second snippet, it unlocks when the target is beaten in a second, DIFFERENT game. And so on.)
//   - it's saved on the player's device, like the shop money and the daily rewards.
//   - until a snippet's mp3 file is in public/music/, nobody sees anything about it: put the file there and it switches on.
//
// ADD A SNIPPET: put the mp3 in public/music/ and add a line here (file names must match exactly).
export const SNIPPETS: { title: string; file: string; bpm?: number; offset?: number; link?: string }[] = [
  { title: "unreleased snippet", file: "/music/snippet-1.mp3", bpm: 140, offset: 0, link: "https://soundcloud.com/pinkmanee" },
];

// CHANGE THE TARGETS HERE. (Set from the real Top 10 boards in November 2026: about a 3rd or 4th place score.)
// The name on the left is the game's board id (the same as in app/api/scores/shared.ts).
export const TARGETS: Record<string, number> = {
  super: 15000, // PINKMANE VOID, infinite run
  pinkrun: 3000,
  vortex: 1500,
  snake: 300,
  bird: 40,
  hex: 2500, // hundredths of a second: 2500 = 25 seconds
  maze: 8000,
  hell: 6000,
  jungle: 2500,
  jet: 2000,
  ninja: 60,
  kong: 6000,
  bomber: 2000,
  gun: 500, // PINK HUNT (the gun on the main page)
};

const SAVE_KEY = "pinkmane-snippets";
export const SNIPPET_EVENT = "pinkmane-snippet";
export type SnippetNews =
  | { kind: "unlocked"; file: string; title: string } // a snippet was just unlocked
  | { kind: "close"; score: number; target: number }; // a run ended under the target: show how far it was

// the games whose target this player has beaten
export function beatenGames(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    if (raw && Array.isArray(raw.games)) return raw.games.filter((g: unknown) => typeof g === "string" && g in TARGETS);
  } catch {}
  return [];
}

// which snippet files really exist on the site (asked once, then remembered)
let liveCheck: Promise<string[]> | null = null;
export function liveSnippets(): Promise<string[]> {
  if (!liveCheck)
    liveCheck = Promise.all(
      SNIPPETS.map((s) =>
        fetch(s.file, { method: "HEAD" })
          .then((r) => (r.ok && !(r.headers.get("content-type") || "").includes("text/html") ? s.file : ""))
          .catch(() => ""),
      ),
    ).then((list) => list.filter(Boolean));
  return liveCheck;
}

// the snippets this player has unlocked AND whose file is there
export async function unlockedSnippets(): Promise<string[]> {
  const live = await liveSnippets();
  const n = beatenGames().length;
  return SNIPPETS.slice(0, n)
    .map((s) => s.file)
    .filter((f) => live.includes(f));
}

// Every game calls this when a run ends (the shared Top 10 does it for the mini games).
export function reportScore(game: string, score: number) {
  const target = TARGETS[game];
  if (!target || typeof window === "undefined" || !Number.isFinite(score)) return;
  const games = beatenGames();
  if (games.includes(game) || games.length >= SNIPPETS.length) return; // nothing left to win here
  const next = SNIPPETS[games.length];
  liveSnippets().then((live) => {
    if (!live.includes(next.file)) return; // its file isn't on the site yet: stay quiet
    let news: SnippetNews;
    if (score >= target) {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ games: [...games, game] }));
      } catch {}
      news = { kind: "unlocked", file: next.file, title: next.title };
    } else if (score >= target * 0.25) {
      news = { kind: "close", score: Math.floor(score), target };
    } else return;
    window.dispatchEvent(new CustomEvent<SnippetNews>(SNIPPET_EVENT, { detail: news }));
  });
}
