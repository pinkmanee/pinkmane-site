// pinkmane.site/games/pink-dive : PINK DIVE, the daily word dive.

import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import PinkDive from "./PinkDive";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

// PUBLIC: in the games list and findable on Google. (false = the page still works by link, but Google is asked not to list it)
const DIVE_PUBLIC = true;

export const metadata: Metadata = {
  title: "PINK DIVE · PINKMANE",
  robots: DIVE_PUBLIC ? undefined : { index: false, follow: false },
  description: "PINK DIVE: the daily word dive by PINKMANE. 7 prompts a day, 25 seconds each. The rarer your answer, the deeper you sink.",
};

export default function PinkDivePage() {
  return <PinkDive pixelFont={pixel.style.fontFamily} />;
}
