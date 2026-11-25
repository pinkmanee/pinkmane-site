// PHONE BUZZ: a tiny vibration when you get hit, a longer one when the run ends.
// Every game calls this from the spot where it takes a hit, so they all feel the same.
// It only does something on phones that allow it: Android does, iPhones don't let websites vibrate at all.
// On a computer it does nothing.
//
// CHANGE THE FEEL HERE (numbers are milliseconds; a list = buzz, pause, buzz ...)
const PATTERNS = {
  hit: 35, // took a hit / lost a life / crashed
  end: [45, 50, 110], // the run is over
  soft: 15, // a wrong answer, a small bump
};

let last = 0;
export function buzz(kind: keyof typeof PATTERNS = "hit") {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    // (not more than one every 80 ms, so a pile of hits in one moment is one buzz, not a drill.
    //  The long "run over" buzz always goes through.)
    const now = Date.now();
    if (kind !== "end" && now - last < 80) return;
    last = now;
    navigator.vibrate(PATTERNS[kind]);
  } catch {}
}
