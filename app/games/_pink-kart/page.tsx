// pinkmane.site/games/pink-kart : the PINK KART demo page.

import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import PinkKart from "./PinkKart";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PINK KART · PINKMANE",
  description: "PINK KART: a hand-drawn PINKMANE racing game (demo).",
};

export default function PinkKartPage() {
  return <PinkKart pixelFont={pixel.style.fontFamily} />;
}
