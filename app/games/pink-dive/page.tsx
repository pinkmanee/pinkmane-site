// pinkmane.site/games/pink-dive : PINK DIVE, the daily word dive.

import type { Metadata } from "next";
import { Press_Start_2P } from "next/font/google";
import PinkDive from "./PinkDive";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

// PILOT (UNLISTED): the page works on the live site for anyone with the link (pinkmane.site/games/pink-dive),
// but it isn't in the games menu and search engines are asked not to list it.
// To make it fully public: change false to true here AND DIVE_SHOWN in app/page.tsx (and add it to app/sitemap.ts).
const DIVE_PUBLIC = false;

export const metadata: Metadata = {
  title: "PINK DIVE · PINKMANE",
  robots: DIVE_PUBLIC ? undefined : { index: false, follow: false },
  description: "PINK DIVE: the daily word dive by PINKMANE. 7 prompts a day, 25 seconds each. The rarer your answer, the deeper you sink.",
};

export default function PinkDivePage() {
  return <PinkDive pixelFont={pixel.style.fontFamily} />;
}
