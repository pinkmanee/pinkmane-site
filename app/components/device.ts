// Is this a real phone or tablet? (the same check everywhere on the site)
// A touch screen alone isn't enough: many computers have one, or Windows reports "touch", and a computer should still say
// CLICK and get the mouse/keyboard version. iPads call themselves a Mac, but a Mac with a touch screen is an iPad.
// (Add ?touch=1 to the address to try the phone version on a computer.)
export function isPhoneOrTablet(): boolean {
  if (typeof window === "undefined") return false;
  if (new URLSearchParams(window.location.search).get("touch") !== null) return true;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const ua = navigator.userAgent;
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  return coarse && mobile;
}
