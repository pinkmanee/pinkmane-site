// What a level file (game/levels/*.json) looks like.
//
// GROUND: each "path" is the top of a piece of ground. Everything under it is solid.
//   Paths always go left to right. Commands, like drawing with a pen:
//     ["M", x, y]               = put the pen down here (the start of the path)
//     ["L", x, y]               = a straight line to here
//     ["Q", cx, cy, x, y]       = a smooth curve to (x, y), pulled toward (cx, cy)
//   y goes DOWN: a bigger y is lower on the screen.
// BLOCKS: solid boxes (walls, platforms, low ceilings). x, y = the top left corner.
// SPRINGS: angle in degrees (-90 = straight up, -60 = up and to the right, -120 = up and to the left).
// BOOSTERS: lie on the ground from x to x + w at height y. dir = 1 (right) or -1 (left).
// SIGNS: little text signs floating above the ground (the tutorial).

export type PathCmd = ["M", number, number] | ["L", number, number] | ["Q", number, number, number, number];

export type LevelData = {
  name: string;
  spawn: [number, number];
  finish: [number, number];
  bounds: { left: number; right: number; bottom: number };
  ground: { path: PathCmd[] }[];
  blocks: { x: number; y: number; w: number; h: number }[];
  springs: { x: number; y: number; angle?: number; power?: number }[];
  boosters: { x: number; y: number; w: number; dir: number; speed?: number }[];
  signs: { x: number; y: number; text: string }[];
};
