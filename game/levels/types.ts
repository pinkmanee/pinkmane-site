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
//   w = how wide it is (leave it out for a normal small spring; pit floors are one wide trampoline).
// BOOSTERS: lie on the ground from x to x + w at height y. dir = 1 (right) or -1 (left).
// SIGNS: little text signs floating above the ground (the tutorial).
// LOOPS: a big ring standing on the ground at (x, y), r = how big. Run into it fast and you run all the way round, upside down.
// RINGS: gold rings in the air. Touch one and it shoots you where its arrow points (angle like springs).
// BUBBLES: blue bubbles in the air. Touch one and you bounce up (you keep your speed sideways).
// FANS: a column of wind (x, y = its top left corner, w wide, h tall) that carries you up.
// SPIKES: on the ground from x to x + w at height y (ceil: true = hanging down from y). Touch = back to the last flag.
// SAWS: a spinning blade going back and forth between (x1, y1) and (x2, y2). Touch = back to the last flag.
// ENEMIES: x, y = where it starts, range = how far it walks / flies each way.
//   "walker" = a bug: jump on it, stomp it or slide into it.   "spiker" = spikes on top: only a slide (or a stomp) beats it.
//   "bat" = flies up and down: jump on it for a big bounce.
// CHECKPOINTS: flags on the ground. Fall out of the level = you come back at the last flag you passed.

export type PathCmd = ["M", number, number] | ["L", number, number] | ["Q", number, number, number, number];

export type LevelData = {
  name: string;
  spawn: [number, number];
  finish: [number, number];
  bounds: { left: number; right: number; bottom: number };
  ground: { path: PathCmd[] }[];
  blocks: { x: number; y: number; w: number; h: number }[];
  springs: { x: number; y: number; angle?: number; power?: number; w?: number }[];
  boosters: { x: number; y: number; w: number; dir: number; speed?: number }[];
  signs: { x: number; y: number; text: string }[];
  checkpoints?: { x: number; y: number }[];
  loops?: { x: number; y: number; r: number }[];
  rings?: { x: number; y: number; angle: number; power?: number }[];
  bubbles?: { x: number; y: number }[];
  fans?: { x: number; y: number; w: number; h: number; power?: number }[];
  spikes?: { x: number; y: number; w: number; ceil?: boolean }[];
  saws?: { x1: number; y1: number; x2: number; y2: number; r?: number; speed?: number; phase?: number }[];
  enemies?: { type: "walker" | "spiker" | "bat"; x: number; y: number; range?: number; speed?: number }[];
};
