// PINK RUSH: every number that decides how the game FEELS lives in this one file.
// Units: pixels (Pinkmane is about 64 tall) and seconds. Change a number, save, push, play.
// If something feels off, the "what to tweak" list that came with this file says which number to try.

export const PHYSICS = {
  // ---------- running on the ground ----------
  runAccel: 1250, // how fast you speed up from standing (px/s²)
  runAccelTop: 520, // ...speeding up gets gentler as you get close to top speed, so it keeps building
  topRunSpeed: 880, // the fastest you go by just holding a direction on flat ground (px/s)
  maxSpeed: 2100, // the absolute limit (downhill, boosters, springs)
  skidDecel: 3300, // pressing the other way: how hard you brake (px/s²)
  friction: 620, // letting go of the keys: how fast you slow down (px/s²). Lower = you slide further
  overSpeedDrag: 180, // going faster than topRunSpeed on flat ground slowly drains back down to it (px/s²)

  // ---------- slopes ----------
  slopeUphill: 0.82, // how much a hill slows you going up (1 = the full pull of gravity)
  slopeDownhill: 1.22, // how much a hill speeds you up going down
  slopeRest: 16, // standing still on a slope flatter than this (degrees) won't slide you down
  maxWalkAngle: 72, // ground steeper than this (degrees) is a wall
  groundSnap: 16, // how far below your feet we look for ground, to keep you glued to it (px)...
  groundSnapPerSpeed: 0.02, // ...plus this much per px/s of speed (so fast runs stay glued over hill tops)
  stepUp: 14, // little ledges up to this tall are run up without jumping (px)
  launchAngle: 34, // going over a sharp edge where the ground drops away by more than this (degrees)...
  launchSpeed: 520, // ...faster than this = you fly off it instead of sticking to it

  // ---------- in the air ----------
  gravity: 1950, // the pull down (px/s²)
  fallGravity: 1.2, // falling pulls this much harder than rising: snappy, not floaty
  apexGravity: 0.45, // at the top of a held jump gravity is softer: a little hang time
  apexWindow: 190, // "the top of the jump" = moving up or down slower than this (px/s)
  maxFall: 1550, // fastest fall (px/s)
  airAccel: 1000, // steering in the air (px/s²)
  airTopSpeed: 880, // steering in the air speeds you up to this (you keep more if you were already faster)
  airDrag: 0.3, // no keys in the air: sideways speed fades by this much per second (0 = never, 1 = fast)

  // ---------- jumping ----------
  jumpSpeed: 930, // jump power (px/s). A full held jump goes about 3.5 x your height
  jumpCut: 380, // let go of jump early: your upward speed is cut to this = a small hop
  jumpFromSlope: 0.6, // jumping while running up a hill adds this much of your upward speed
  coyoteTime: 0.1, // you can still jump this long after running off an edge (s)
  jumpBuffer: 0.12, // pressing jump this long before you land still jumps when you land (s)

  // ---------- walls ----------
  wallSlideSpeed: 230, // sliding down a wall: the fastest you slide (px/s)
  wallJumpX: 640, // wall jump: push away from the wall (px/s)
  wallJumpY: 860, // wall jump: push up (px/s)
  wallJumpLock: 0.15, // after a wall jump, your keys don't steer for this long, so it's snappy (s)
  wallCoyote: 0.09, // you can still wall jump this long after leaving the wall (s)

  // ---------- slide / roll (↓ while running) ----------
  slideMinSpeed: 240, // faster than this, ↓ = a slide. Slower = you crawl
  slideFriction: 220, // how fast a slide slows down on flat ground (px/s²)
  slideDownhill: 1.5, // a slide speeds up more going downhill...
  slideUphill: 0.6, // ...and loses less going uphill
  crawlSpeed: 300, // crawling (↓ + left/right when slow) (px/s)
  lowScoot: 480, // under something low you always keep at least this speed, so you slide right through (px/s)

  // ---------- stomp (↓ + jump in the air) ----------
  stompSpeed: 1600, // how fast you slam down (px/s)
  stompKeepX: 0.2, // how much sideways speed you keep when you start a stomp (0..1)

  // ---------- springs and boosters (a level can give each one its own power) ----------
  springPower: 1450, // px/s
  boosterSpeed: 1550, // px/s

  // ---------- body ----------
  height: 64, // standing (px)
  slideHeight: 30, // sliding / crawling (px)
  halfWidth: 11, // half the body's width (px)
} as const;

// The physics runs exactly this many times a second on every screen (60 Hz, 120 Hz, 144 Hz...), so it plays the same everywhere.
export const FIXED_DT = 1 / 60;

// THE CAMERA
export const CAMERA = {
  viewHeight: 680, // how much of the world fits from top to bottom of the screen (px). Bigger = see more
  minViewWidth: 620, // on narrow screens (phones held upright) at least this much fits side to side (px)
  lookAhead: 0.33, // the camera looks ahead in the direction you're moving: this much of your speed...
  lookAheadMax: 320, // ...up to this many pixels
  lookAheadFollow: 2.2, // how quickly the look-ahead swings when you turn around (bigger = quicker)
  followX: 8, // how tightly the camera follows you side to side (bigger = tighter)
  followY: 5, // ...and up and down
  heightOffset: 70, // the camera aims this far above your feet (px)
  zoomOutAtSpeed: 0.2, // at full speed the camera zooms out this much (0.2 = 20%)
  zoomFollow: 2.4, // how quickly it zooms in and out
} as const;
