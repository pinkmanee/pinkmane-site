// PINK KART online: the rules for names and music links.
// Used in two places: the join form (so people see the problem right away) and the site's server
// (app/api/kart/token/route.ts), which checks again so nobody can skip the form.

// Where a STREAM MODE link may point. Anything else is refused.
const MUSIC_HOSTS = [
  "soundcloud.com",
  "on.soundcloud.com",
  "m.soundcloud.com",
  "youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "open.spotify.com",
  "spotify.link",
];

// Turns what someone typed into a clean https link, or null if it isn't SoundCloud / YouTube / Spotify.
export function cleanMusicLink(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s || s.length > 300) return null;
  if (!/^https?:\/\//i.test(s)) s = "https://" + s;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!MUSIC_HOSTS.includes(host)) return null;
  if (u.pathname.length < 2) return null; // just the front page, not a song
  u.protocol = "https:";
  u.hash = "";
  return u.toString().slice(0, 300);
}

// Which site a link is on, for showing a small label next to it
export function musicSite(link: string): string {
  const h = (() => {
    try {
      return new URL(link).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (h.includes("soundcloud")) return "SOUNDCLOUD";
  if (h.includes("spotify")) return "SPOTIFY";
  if (h.includes("youtu")) return "YOUTUBE";
  return "LINK";
}

// Names: capitals, numbers and a few symbols, max 12 characters (the same rule as the scoreboards)
export function cleanRacerName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "").replace(/\s+/g, " ").trim().slice(0, 12);
}

// Lobby codes: 4 letters, no I or O (they look like 1 and 0)
export const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function cleanCode(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
}
export const isCode = (c: string) => c.length === 4 && [...c].every((ch) => CODE_LETTERS.includes(ch));
