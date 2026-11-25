// pinkmane.site/games/pink-dive : PINK DIVE, the daily word dive.

import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import PinkDive from "./PinkDive";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PINK DIVE · PINKMANE",
  description: "PINK DIVE: the daily word dive by PINKMANE. 7 prompts a day, 25 seconds each. The rarer your answer, the deeper you sink.",
};

export default function PinkDivePage() {
  return <PinkDive pixelFont={pixel.style.fontFamily} />;
}
