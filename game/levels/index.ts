// ALL THE LEVELS, in order. To add a level: make its .json file in this folder, import it here and add it to the list
// (and give it a stop on the map: MAP_NODES in game/engine/game.ts).

import type { LevelData } from "./types";
import l1 from "./1-first-run.json";
import l2 from "./2-spring-valley.json";
import l3 from "./3-tower-town.json";
import l4 from "./4-low-road.json";
import l5 from "./5-pink-rush.json";
import l6 from "./6-bug-street.json";
import l7 from "./7-loop-de-loop.json";
import l8 from "./8-ring-road.json";
import l9 from "./9-wind-tunnel.json";
import l10 from "./10-saw-mill.json";
import l11 from "./11-bubble-bridge.json";
import l12 from "./12-switchback.json";
import l13 from "./13-sky-high.json";
import l14 from "./14-gauntlet.json";
import l15 from "./15-final-run.json";

export const LEVELS: LevelData[] = [l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15] as unknown as LevelData[];
