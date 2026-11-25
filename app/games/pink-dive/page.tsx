// pinkmane.site/games/pink-dive : PINK DIVE, the daily word dive.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Press_Start_2P } from "next/font/google";
import PinkDive from "./PinkDive";

// the pixel font every PSP game uses
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

// HIDDEN until it's ready: on the live site this page says "not found". It works when you run the site on your
// own computer (npm run dev). To make it public: change false to true here AND in app/page.tsx (DIVE_PUBLIC).
const DIVE_PUBLIC = false;

export const metadata: Metadata = {
  title: "PINK DIVE · PINKMANE",
  robots: DIVE_PUBLIC ? undefined : { index: false, follow: false },
  description: "PINK DIVE: the daily word dive by PINKMANE. 7 prompts a day, 25 seconds each. The rarer your answer, the deeper you sink.",
};

export default function PinkDivePage() {
  if (!DIVE_PUBLIC && process.env.NODE_ENV !== "development") notFound();
  return <PinkDive pixelFont={pixel.style.fontFamily} />;
}
