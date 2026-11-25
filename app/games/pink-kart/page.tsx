// pinkmane.site/games/pink-kart : the PINK KART demo page.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import PinkKart from "./PinkKart";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PINK KART · PINKMANE",
  description: "PINK KART: a hand-drawn PINKMANE racing game (demo).",
};

export default function PinkKartPage() {
  // HIDDEN FOR NOW: the page only exists on your own computer (localhost). On pinkmane.site it's a 404.
  // To put the game on the site again: delete the next line (and the "kart" bit in MAIN_GAMES in app/page.tsx).
  if (process.env.NODE_ENV !== "development") notFound();
  return <PinkKart pixelFont={pixel.style.fontFamily} />;
}
