// pinkmane.site/games/pink-rush : the PINK RUSH page.

import type { Metadata } from "next";
import { Permanent_Marker, Press_Start_2P } from "next/font/google";
import PinkRush from "./PinkRush";

const marker = Permanent_Marker({ weight: "400", subsets: ["latin"] });
// the pixel font every PSP game uses (pause menu, level map boxes)
const pixel = Press_Start_2P({ weight: "400", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PINK RUSH · PINKMANE",
  description: "PINK RUSH: a fast, hand-drawn PINKMANE platformer.",
};

export default function PinkRushPage() {
  return <PinkRush font={marker.style.fontFamily} pixelFont={pixel.style.fontFamily} />;
}
