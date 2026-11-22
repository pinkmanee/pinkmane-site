// ALL THE LEVELS, in order. To add a level: make its .json file in this folder, import it here and add it to the list.

import type { LevelData } from "./types";
import l1 from "./1-first-run.json";
import l2 from "./2-spring-valley.json";
import l3 from "./3-tower-town.json";
import l4 from "./4-low-road.json";
import l5 from "./5-pink-rush.json";

export const LEVELS: LevelData[] = [l1, l2, l3, l4, l5] as unknown as LevelData[];
