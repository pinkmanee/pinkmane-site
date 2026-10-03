"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space (= jump)
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  // true on phones / tablets: the page shows its own big thumb buttons, so touching the game
  // screen itself no longer walks or jumps (menus can still be tapped)
  touchPad?: boolean;
  // The page's beat clock (optional): kick = 1 right on each beat and fades through it, sway swings left/right each beat,
  // live = the music is really playing. The painted zone backgrounds wiggle to it. Without it the picture just stays still.
  beatRef?: React.MutableRefObject<{ kick: number; sway: number; live: boolean }>;
};

// golden = paused on the golden leaf screen, choose = picking your spell before a boss, paused = Esc
type Mode =
  | "select"
  | "ready"
  | "running"
  | "pipe"
  | "hurt"
  | "dying"
  | "entry"
  | "board"
  | "golden"
  | "choose"
  | "paused"
  | "home" // the pink start screen: PINK RUN INFINITE or PINK LEVELS
  | "levelSelect" // the list of levels
  | "levelDone" // you hit the bong
  | "shop" // the PINK SHOP (from the pink start screen)
  | "cards" // your BOSS CARDS (from the pink start screen)
  | "bossIntro" // frozen on a boss's card right before his fight
  | "spin" // the STASH SPIN prize machine (PINK RUN INFINITE only): the run is frozen while you pick a prize
  | "wax"; // the wax moment (PINK RUN INFINITE only): frozen on the wax bong hit after the 20k boss

// The pause (Esc) menu, top to bottom
const PAUSE_OPTIONS = ["RESUME", "RESTART", "PICK OUTFIT", "SHOP", "GAME TYPE", "HOME"];

// One column of the level
type Column = {
  ground: number; // row where the ground starts, -1 = pit
  block: number; // floating brick floor (one-way), -1 = none
  block2: number; // second brick floor above it
  bonus: number; // bonus block row (bump it from below), -1 = none
  used: boolean;
  bump: number;
  line: number; // thin line to jump on (one-way), -1 = none
  lineTh: number; // how thick the line is drawn (gets thinner the farther you go)
  pipe: number; // 0 = no pipe, 1 = left half, 2 = right half
  pipeOut: boolean; // pipe that leads back out of the bonus room
  pipeUsed: boolean;
  fragile: number; // thin line that vanishes after you touch it: seconds it lasts (0 = normal line)
  crumble: number; // counting down once touched (-1 = not touched)
  zone: number; // which zone look this column has (99 = SoundCloud Void)
  spring: boolean; // a trampoline pad on top of this column (Void rooms): landing on it throws you up
};

type Enemy = {
  // eye = the walking eye (Pink Run only): jump on it and it turns into a little bong (kind "bong").
  // Walk into the bong to kick it, a sliding bong knocks out every monster it touches.
  // bear = a black bear (Level 4 only): two jumps on its back
  kind: "walker" | "flyer" | "eye" | "bong" | "bear";
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseY: number;
  phase: number;
  alive: boolean;
  squash: number;
  shoot?: number; // IPOD USER drones: seconds until the next laser
  kick?: number; // bong: short pause after a kick/stop so you can't re-kick it in the same frame
  idle?: number; // bong: seconds it has been sitting still (it fades away after BONG_IDLE_LIFE)
  // Level 4 animals
  hp?: number; // bear: hits it still takes
  act?: "walk" | "crouch" | "leap" | "wind" | "slash"; // cat: sneaking, crouching (about to pounce), pouncing. Skeleton: wind = the red "!", slash = the knife
  timer?: number; // cat: seconds left crouching / until it can pounce again. bear: just got hit
  dir?: number; // cat: which way it looks (-1 = left)
  home?: number; // dove: the height it flies at when it isn't swooping
  swooper?: boolean; // dove: this one dives at your head
  summoned?: boolean; // called in by a boss: it goes away when the fight ends (or you start over)
  sv?: number; // Level 3 skeleton: its walking speed (it stops to telegraph, then walks again)
};
type Leaf = { x: number; y: number; taken: boolean; small?: boolean; coin?: boolean }; // small = half size (words), coin = gold coin
type Heart = { x: number; y: number; taken: boolean };
type PowerKind = "fire" | "ice" | "double" | "spike";
type PowerUp = { x: number; y: number; vx: number; vy: number; kind: PowerKind };
// spike = one spike of a SPIKE SHOT, volley = which burst it belongs to (a burst can only hurt a boss once)
// pierced = how many monsters this shot already went through (PIERCING SHOTS prize), pet = a little shot from your dog
type Fireball = { x: number; y: number; vx: number; vy: number; life: number; ice: boolean; spike?: boolean; volley?: number; pierced?: number; pet?: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };
type Popup = { x: number; y: number; text: string; life: number };
type Entry = { name: string; score: number };
type BoardStatus = "loading" | "ok" | "offline";

// The name of the game, shown on its start screens. Change it here and it changes everywhere in the game.
// (The Games menu on the iPod has its own copy of the name: search page.tsx for "Pinkmane Void".)
const GAME_TITLE = "PINKMANE VOID";

// Game size in pixels. It gets scaled up to fill the screen.
// Widened to match the aspect ratio of the screen cutout drawn in handheld.png (it's a
// wide PSP-style screen, ~2.1:1) — this used to be a narrower 256, which is why there were
// two empty bars down the sides when this rendered inside the handheld.
const W = 336;
const H = 160;
const T = 16; // one tile
const ROWS = 10;

// Your pixel dude: /public/game/pinkdude.png (2 frames side by side)
const SPRITE_W = 24;
const SPRITE_H = 35;
// Hitbox inside the sprite (hair and arms don't count)
const HB_X = 7;
const HB_Y = 5;
const HB_W = 11;
const HB_H = 30;

// Feel of the game
const GRAVITY = 1150;
const JUMP = -370;
const RUN = 100;
const ACCEL = 900;
const STOMP_BOUNCE = -240;

// Lives are hearts: you start with 2 and can collect up to 4
const START_LIVES = 2;
const MAX_LIVES = 4;
// (those two are for the PINK LEVELS.) PINK RUN INFINITE: you start with 3 hearts and 3 is also the most
// you can hold. The EXTRA HEART spin prize makes it 4.
const RUN_LIVES = 3;

// Zones change every this many tiles, each with its own look and harder jumping
const ZONE_LEN = 150;
const ZONE_NAMES = [
  "PINK FIELDS",
  "SPEAKER HILLS",
  "ROOFTOPS",
  "PINK CLOUDS",
  "TWISTED TREES",
  "SMOKE OCEAN",
  "GAF FIELD",
  "GODS PSP FIELD",
  "IPOD USER FIELD",
  "TRIPPY FIELD",
  "SMALL PRETTY TITTIES FIELD",
  "TOP SHELF FIELD",
  "TWISTED CORAL PEAKS",
];
// The 7 cover-art fields: zone id = FIELD_ZONE_START + index into this list.
// Ground/platforms in these zones use the same plain look as PINK FIELDS —
// only the backdrop changes, to whichever cover this stretch of the level is themed on.
const FIELD_ZONE_START = 6;
const FIELD_IMAGES = [
  "/backgrounds/field-gaf.png",
  "/backgrounds/field-godspsp.png",
  "/backgrounds/field-ipoduser.png",
  "/backgrounds/field-trippy.png",
  "/backgrounds/field-spt.png",
  "/backgrounds/field-topshelf.png",
  "/backgrounds/field-coral.png",
];
const Z_CLOUDS = 3;
// The cover-art fields by name (each one has its own ground, blocks and lines to match its cover)
const F_GAF = 6;
const F_PSP = 7;
const F_IPOD = 8;
const F_TRIPPY = 9;
const F_SPT = 10;
const F_TOP = 11;
const F_CORAL = 12;
// Colours of each zone on the progress line at the bottom
const ZONE_COLORS = [
  "#ff5fe0",
  "#ff9a3c",
  "#8e3fb0",
  "#fbd3f3",
  "#b06ce0",
  "#c6b9d6",
  "#d63cc8", // gaf field
  "#9b8bd6", // gods psp field
  "#5b6fd6", // ipod user field
  "#c68bff", // trippy field
  "#e07ab0", // small pretty titties field
  "#b19cff", // top shelf field
  "#3fb0a8", // twisted coral peaks
];
const Z_TREES = 4;
const Z_SMOKE = 5;
const VOID_ZONE = 99;
const SPRING_VY = -510; // a trampoline throws you up this fast (about 7 tiles high; a normal jump is about 3.7)

// Fire power: 5 fireballs, and a timer bar at the bottom. Picking up another one refills, it doesn't stack.
const FIRE_AMMO = 5;
const FIRE_TIME = 15;
const FIREBALL_SPEED = 170;
// Ice leaf (blue, rarer): 5 ice shots that fly straight, no timer
const ICE_AMMO = 5;
const ICE_SPEED = 230;
// Double-jump leaf (turquoise, rarest): 3 extra jumps in mid-air
const DOUBLE_JUMPS = 3;
// SPIKE SHOT (purple, bought in the shop): every shot throws spikes in every direction at once.
// They fly straight and only about half as far as fire or ice.
const SPIKE_AMMO = 4; // shots you get from one purple leaf
const SPIKE_COUNT = 8; // spikes per shot (8 = every 45 degrees)
const SPIKE_SPEED = 210;
const SPIKE_LIFE = 0.6; // seconds a spike flies before it fades

// Secret at the very start: walk LEFT instead of right. There's a jetpack and two signs
// (one before the jetpack, one further left behind it). Hold jump to fly. It runs out once you reach this score.
const EGG_COLS = 26; // how many tiles the hidden area has to the left of the start
const JET_UNTIL = 2000;
const JET_THRUST = 1900;
const JET_MAX_UP = -165;
const JET_FUEL_MAX = 5; // seconds of flight on a full tank
const JET_REFUEL_TIME = 2; // seconds on the ground to go from empty to full
const JET_REFUEL_RATE = JET_FUEL_MAX / JET_REFUEL_TIME;
// ---------- Golden leaf (secret Stutters track) ----------
// From this score on, the next SoundCloud Void has a spinning golden leaf (once per game).
const GOLD_LEAF_LIVE = false; // false = the golden Stutters leaf never shows up (all the code is still here: set to true to bring it back)
const GOLD_AT = 8000;
const PTS_GOLD = 500;
// Put the mp3 in public/sounds/ with this name. It plays while you're in the Void after finding the leaf.
const STUTTERS_TRACK = "/sounds/stutters-remix.mp3";
// Paste your private SoundCloud link between the quotes. Leave it empty to hide the link button.
const STUTTERS_LINK = "";
const GOLD_KEY = "pinksuper-golden"; // remembers you've found it before

// ---------- Boss: the troll ----------
const BOSS_EVERY = 5000; // a boss every 5,000 grams: 5k, 10k, 15k, 20k ...
// ... and they take turns: the green troll (5k), the EVIL SNOWMAN (10k), the purple giant (15k), the RED SKELETON KNIGHT (20k),
// TOMBFELL (25k), then the troll again (30k) ... (To change the order, just reorder the names in RUN_BOSSES_ALL.)
type RunBoss = "troll" | "snowman" | "giant" | "skeleton" | "tombfell";
const RUN_SKELETON_LIVE = true; // false = leave the skeleton knight out of the infinite run (he's from the hidden WARLORD level)
const RUN_BOSSES_ALL: RunBoss[] = ["troll", "snowman", "giant", "skeleton", "tombfell"];
const RUN_BOSSES: RunBoss[] = RUN_BOSSES_ALL.filter((b) => RUN_SKELETON_LIVE || b !== "skeleton");
const bossKindAt = (count: number): RunBoss => RUN_BOSSES[count % RUN_BOSSES.length];
// A sign stands just before every boss arena in the infinite run, like in the pink levels: it says who's waiting and how to beat him.
// (max ~40 characters a line, \n = new line)
const RUN_BOSS_SIGNS: Record<RunBoss, string> = {
  troll: "THE TROLL CHASES AND JUMPS AT YOU.\nSHOOT HIM! RELOAD AT THE ? BOXES",
  snowman: "THE EVIL SNOWMAN BRINGS A BLIZZARD.\nDODGE THE ICE. SHOOT HIM, THEN STOMP",
  giant: "THE GIANT IS TOUGH. SHOOT HIM DOWN,\nTHEN STOMP HIS HEAD BEFORE HE RISES",
  skeleton: "THE RED SKELETON KNIGHT: SHOTS BOUNCE.\nJUMP THE SLASH AND STOMP HIS HEAD",
  tombfell: "TOMBFELL'S SHIELD EATS YOUR SHOTS.\nSTOMP A CAT, THEN KICK IT AT HIM",
};
const BOSS_SIGN_RANGE = 95; // you can read a boss sign from this far away (a normal lore sign: 36)
// The EVIL SNOWMAN and the SKELETON KNIGHT in the infinite run: the same fights as Level 2 and Level 3, a bit shorter.
const RUN_SNOWMAN_HP = 7; // shots he takes (+3 every lap round the bosses, plus the prize bonus like the troll)
const RUN_SKELETON_HP = 4; // stomps he takes
const RUN_SKELETON_REACH = 44; // how far his sword reaches in the infinite run (Level 3: SKELETON_REACH = 58)
const RUN_SKELETON_TRIGGER = 76; // he starts his swing when you're this close in the infinite run (Level 3: 95)
const RUN_SKELETON_LAP_CAP = 2; // +1 stomp every lap round the bosses, up to this many extra
const RUN_SKELETON_PERK_CAP = 2; // prizes make him take extra stomps too, but never more than this (a stomp fight is risky enough)
const PTS_SNOWMAN = 1500;
const PTS_SKELETON = 1500;
// ---------- The snowman's blizzard (the infinite run AND Level 2) ----------
// While the evil snowman is up it snows all over the screen, and ice spikes form up on the ceiling, hang there glittering for a moment,
// then drop. One that hits you costs a heart. Your shots (and bricks over your head) break them.
const BLIZZARD_FLAKES = 150; // snowflakes on screen at full blizzard
const ICICLE_FIRST = 1.8; // seconds after the fight starts until the first spike begins to form
const ICICLE_EVERY: [number, number] = [3.6, 2.2]; // seconds between volleys: at the start of the fight .. when he's nearly beaten (he gets angrier)
const ICICLE_GROW = 0.9; // seconds a spike takes to form (it glitters and shakes) before it drops: your time to get out from under it
const ICICLE_LEN = 24;
const ICICLE_MAX = 5; // never more than this many at once (a volley is 2 spikes, 3 once he's hurt)
// TOMBFELL in the infinite run is the quick version of his Level 4 fight: only the cats part.
// Cats drop in, you jump on one so it curls up, then kick the ball into him.
const RUN_TOMB_HP = 3; // kicked cats it takes
const PTS_TOMB = 1500;
// ---------- The wax moment ----------
// Right after the boss at 20,000 grams falls, the game stops for a big wax rip (once per run). It's only a moment:
// text, a torch, a bubbling pull and a huge smoke exhale. It does NOT change the score or anything else in the run.
const WAX_AT = 20000;
const WAX_DELAY = 1.4; // seconds after the boss falls before the wax moment starts (so you can read TROLL DOWN)
const WAX_LINE_1 = "YOU SMOKED 20K GRAMS.";
const WAX_LINE_2 = "U NEED SOME WAX AT THIS POINT";
const WAX_LINE_3 = "THAT WAS A BIG ONE.";
// when things happen in the wax moment (seconds). It starts with a freeze-frame that zooms in on you:
const WAX_T_ZOOM = 1.1; // the frozen screen zooms in on you for this long
const WAX_ZOOM = 3; // how far it zooms in (3 = three times bigger. Whole numbers keep him sharp)
const WAX_T_INTRO = 1.7; // ... and the world dims down to the dark stage (the words start here)
const WAX_T_OUT = 0.6; // at the very end it zooms back out into the game
const WAX_T_LINE2 = WAX_T_INTRO + 1.3;
const WAX_T_HEAT = WAX_T_INTRO + 2.6; // the torch
const WAX_T_HIT = WAX_T_INTRO + 3.4; // he leans in and the bubbling starts (the screen stays frozen until he takes it)
const WAX_T_EXHALE = WAX_T_INTRO + 5.2; // the smoke (from here on jump / OK skips the rest)
const WAX_T_END = WAX_T_INTRO + 8.6;
// Where things are on the dark stage (screen pixels). He stands left of the middle so the bong fits beside him.
const WAX_STAGE_X = W / 2 - 34; // the middle of his picture
const WAX_STAGE_Y = 80;
const WAX_BONG_SC = 3; // how big the bong is
const WAX_LEAN = 14; // how far he leans in to the bong (screen pixels)
// Where his mouth is on his 24 x 35 picture, facing right (the smoke comes out of here). If it comes out of the wrong spot, change these.
const WAX_MOUTH_X = 17;
const WAX_MOUTH_Y = 10;
// After the rip the whole screen wobbles and slides through crazy colours, in three parts. The clock only runs while you're
// really playing (the prize machine, pauses and boss cards don't use it up):
//   1) WAX_TRIP_FULL seconds at full strength
//   2) WAX_TRIP_MID seconds a bit calmer (the wobble eases down to WAX_TRIP_MID_WIGGLE of full, the colours to WAX_TRIP_MID_COLOUR)
//   3) the rest of WAX_TRIP_SECONDS: it all comes down, slowly and smoothly, to nothing
const WAX_TRIP_SECONDS = 20;
const WAX_TRIP_FULL = 5;
const WAX_TRIP_MID = 5;
const WAX_TRIP_MID_WIGGLE = 0.6;
const WAX_TRIP_MID_COLOUR = 0.85;
const WAX_TRIP_WIGGLE = 7; // how far (pixels) the picture sways at its wildest
const WAX_TRIP_HUE_SPEED = 220; // how fast the colours turn (degrees a second: 220 = a full turn every 1.6 seconds, smooth, never a flash)
const WAX_AFTERGLOW = false; // true = after the rip the colours keep slowly breathing brighter and darker (looks only, no gameplay)
const WAX_PULSE_SECONDS = 6; // the afterglow: one slow breath of the colours takes this long
const WAX_PULSE_BRIGHT = 0.16; // how strong the bright half is (0 = off)
const WAX_PULSE_DARK = 0.3; // how strong the dark half is (0 = off)
const BOSS_HP_START = 8; // hits the first troll takes
const BOSS_HP_STEP = 3; // each next troll takes this many more
const BOSS_SPEED_STEP = 0.25; // each next troll is 25% faster
const BOSS_SPARE_SHOTS = 2; // Level 1 + 2 bosses only: you get this many more shots than they need
// Troll + giant fights: you only START with this many shots, so you can't just stand there and spam.
// The rest come from the two ? stash boxes, one at each end of the arena (+3 shots each).
// He stands between you and the other box, so you have to jump over him to reload.
const BOSS_START_SHOTS = 3;
const BOSS_BOX_REFILL = 10; // seconds until the used stash boxes fill up again
const TROLL_DEATH_SOUND = "/sounds/trolldeath.mp3";
const BOSS_ARENA = 21; // tiles wide (exactly one screen, now that the screen is wider)
const TROLL_SPEED = 38; // slower than you (you run at 100)
const TROLL_JUMP = -330;
const PTS_BOSS = 1000;
// Troll hitbox inside his 44 x 48 picture
const TR_W = 44;
const TR_H = 48;
const TR_HX = 8;
const TR_HY = 10;
const TR_HW = 28;
const TR_HH = 38;
// ---------- Boss: the giant (a bigger, tougher troll) ----------
// Shots alone only bring him to his knees — you have to finish him with a stomp.
const GIANT_HP = 12; // shots needed before he goes down
const GIANT_SCALE = 3; // vs the troll's 2 — noticeably bigger
const GIANT_W = 22 * GIANT_SCALE;
const GIANT_H = 24 * GIANT_SCALE;
const GIANT_HX = Math.round((TR_HX / TR_W) * GIANT_W);
const GIANT_HY = Math.round((TR_HY / TR_H) * GIANT_H);
const GIANT_HW = Math.round((TR_HW / TR_W) * GIANT_W);
const GIANT_HH = Math.round((TR_HH / TR_H) * GIANT_H);
const GIANT_SPEED_MULT = 0.7; // bigger, so a little slower than the regular troll
const GIANT_DAZE_TIME = 3.5; // seconds you have to jump on his head once he's down
const GIANT_DAZE_HP = 3; // miss the window and he gets back up with this much health
const PTS_GIANT = 2000;

// =====================================================================================
// STASH SPIN: the prize machine (PINK RUN INFINITE only, the levels never see it)
// =====================================================================================
// After every second zone the run freezes, three reels spin and you keep ONE of the three prizes.
// After a troll or giant you get a BOSS SPIN: the rarer prizes show up more often there.
// Three matching reels = JACKPOT: that prize counts twice.
// Every prize stacks up to 3 times, shows as a little icon at the bottom left, and is gone when the run ends.
type PerkId =
  | "speed" | "leafLuck" | "shield" | "heart" | "stash" | "magnet" // the first six
  | "pierce" | "airJump" | "coinLuck" | "jetSip" | "revive" | "pet" // piece 3
  | "swarm" | "greed"; // the curses: a downside with an upside
type ReelId = PerkId | "snack"; // snack = the brownie, only shown when there are fewer than 3 prizes left to offer
const PERK_MAX = 3; // how many times one prize can stack (a few rare ones say max: 1 in the list below)
const SPIN_AT_START = true; // one free spin a few seconds into every run, so new players meet the machine early
const SPIN_START_DELAY = 3; // seconds of running before that first spin opens
const SPIN_EVERY_ZONES = 3; // a spin every this many zones (on top of the opening spin and the boss spins). 2 was too much; 4 = a bit fewer. 0 = none
const SPIN_JACKPOT = 0.06; // chance that all three reels match (0.06 = 6%)
const SPIN_JACKPOT_BOSS = 0.18; // the same chance on a BOSS SPIN
const SPIN_REEL_STOPS = [1.0, 1.6, 2.2]; // seconds until the 1st, 2nd and 3rd reel stop
const SPIN_LOCK = 0.45; // after the last reel stops the buttons are ignored this long (a held jump can't pick by accident)
const SPIN_TAKE_TIME = 0.9; // the prize you took glows this long, then the run carries on
const SPIN_BOSS_DELAY = 1.6; // seconds after the boss falls before the BOSS SPIN opens (so you can read TROLL DOWN)
// What one stack of each prize does
const SPEED_STEP = 0.15; // SPEED: +15% run speed per stack
const LEAF_LUCK_STEP = 0.08; // LEAF LUCK: floating bricks hold a ? stash box 15% of the time, +8% per stack
const STASH_AMMO_STEP = 2; // BIGGER STASH: +2 shots per power leaf per stack (spikes and boss stash boxes: +1)
const STASH_TIME_STEP = 5; // BIGGER STASH: +5 seconds on the fire timer per stack
const MAGNET_RANGE = [0, 44, 66, 90]; // MAGNET: how far away (pixels) leaves and coins get pulled in, for 0 / 1 / 2 / 3 stacks
const MAGNET_PULL = 190; // how fast they fly to you
// Balance: every prize you take makes the rest of the run a bit harder
const PERK_ENEMY_STEP = 0.05; // +5% monsters per prize you hold ...
const PERK_ENEMY_CAP = 1; // ... up to +100% (double)
const PERK_BOSS_HP = 0.5; // trolls and giants: +1 hit for every 2 prizes you hold ...
const PERK_BOSS_HP_CAP = 8; // ... up to +8 hits
const MONSTER_MAX = 4; // monsters never get more than this many times denser than at the very start, whatever you hold
// The run keeps getting harder after 20k grams (it used to stop there):
const HARD_STEP = 0.2; // every 10,000 grams past 20k: this much more monsters and monster speed ...
const HARD_MAX = 2.4; // ... up to this (reached at 60k). 1 = the very start, 1.6 = what 20k was already
const HARD_SPEED_MAX = 2; // monsters never walk or fly faster than this many times their starting speed
// The second batch of prizes
const COIN_LUCK_STEP = 0.03; // COIN LUCK: 7% of leaves are gold coins, +3% per stack
const JET_SIP_SECONDS = 2; // JETPACK SIP: seconds of fuel per stack, refilled in every new zone
const REVIVE_LIVES = 2; // SECOND WIND: hearts you get back up with
// The curses
const SWARM_MONSTERS = 1.4; // SWARM: 40% more monsters ...
const SWARM_PAY = 2; // ... but every monster pays double grams
const GREED_COINS = 2; // GREED: no new hearts appear in the run, but every gold coin counts as 2
// ---------- The pet: BOBO, a small fluffy white dog (the BOBO prize) ----------
// Level 1: follows you and fires a little shot whenever you shoot. Level 2: also shoots by itself.
// Level 3: also fetches leaves. Its shots only hurt normal monsters, never a troll or giant.
const PET_W = 16;
const PET_H = 13;
const PET_TRAIL = 10; // how far behind you it runs (bigger = further back)
const PET_SHOT_SPEED = 220;
const PET_SHOT_LIFE = 0.9; // seconds a pet shot flies
const PET_AUTO = 3; // level 2: seconds between the shots it fires by itself
const PET_AUTO_RANGE = 130; // ... at a monster this close (pixels)
const PET_FETCH_RANGE = 80; // level 3: how far away it spots a leaf
const PET_FETCH_SPEED = 230;
// two frames (the legs move). W = white fur, g = grey shading, P = tongue
const BOBO = [
  [
    ".........KKKKK..",
    "........KWWWWWK.",
    ".KK....KWWWWWWWK",
    "KWWK...KWWKWWKWK",
    "KWWWK..KWWWWKWWK",
    ".KWWKKKKgWWWPWgK",
    "..KWWWWWKgWWWgK.",
    ".KWWWWWWWKKKKK..",
    ".KWWWWWWWWWWK...",
    ".KgWWWWWWWWgK...",
    "..KgWKKKKKWgK...",
    "..KWWK...KWWK...",
    "..KKKK...KKKK...",
  ],
  [
    ".........KKKKK..",
    "........KWWWWWK.",
    ".KK....KWWWWWWWK",
    "KWWK...KWWKWWKWK",
    "KWWWK..KWWWWKWWK",
    ".KWWKKKKgWWWPWgK",
    "..KWWWWWKgWWWgK.",
    ".KWWWWWWWKKKKK..",
    ".KWWWWWWWWWWK...",
    ".KgWWWWWWWWgK...",
    "..KWgKKKKKgWK...",
    "...KWWK.KWWK....",
    "...KKKK.KKKK....",
  ],
];
const BOBO_LEFT = BOBO.map((frame) => frame.map((row) => row.split("").reverse().join("")));
const BOBO_LEVELS = [1]; // the levels where BOBO is with you from the start (1 = PINKMANE LIKES WEED)
const BOBO_COLORS = { K: "#111111", W: "#ffffff", g: "#d9d9e6", P: "#ff5fc8" };
const PET_SPARKS = ["#ffffff", "#ffd6f0", "#ff5fc8", "#ffffff"];

// art = the 9 x 9 pixel icon. weight = how often it shows up on a normal spin, bossWeight = on a BOSS SPIN
// (a bigger number = more often). To make a prize rarer, lower its weight.
// max = how many times it stacks (left out = 3). curse = a prize with a downside (shown in red, never a jackpot).
// bossFrom = see below (the SHIELD uses it).
// infoAt = a different description for each level (BOBO learns something new each time).
type PerkDef = {
  id: ReelId;
  name: string;
  info: [string, string];
  weight: number;
  bossWeight: number;
  art: string[];
  colors: Record<string, string>;
  max?: number;
  bossFrom?: number; // once you hold this many, more of it only comes from the gold BOSS SPIN
  curse?: boolean;
  infoAt?: [string, string][];
};
const PERKS: PerkDef[] = [
  {
    id: "speed",
    name: "SPEED",
    info: ["RUN FASTER.", "RISKY: LESS TIME TO REACT"],
    weight: 10,
    bossWeight: 4,
    art: ["....KKKKK", "...KYYYK.", "..KYYYK..", ".KYYYKKK.", ".KYYYYYK.", "..KKKYYK.", "...KYYK..", "...KYK...", "...KK...."],
    colors: { K: "#111111", Y: "#ffc800" },
  },
  {
    id: "leafLuck",
    name: "LEAF LUCK",
    info: ["MORE ? STASH BOXES", "WITH POWER LEAVES"],
    weight: 10,
    bossWeight: 6,
    art: ["....K....", "...KGK...", ".K.KGK.K.", "KGKGGGKGK", "KGGGYGGGK", ".KGGGGGK.", "..KKDKK..", "....D....", "....D...."],
    colors: { K: "#111111", G: "#ff7a00", Y: "#ffc800", D: "#8a4a00" },
  },
  {
    id: "shield",
    name: "SHIELD",
    info: ["A BUBBLE BLOCKS 1 HIT.", "COMES BACK EVERY ZONE"],
    weight: 5,
    bossWeight: 12,
    max: 2,
    bossFrom: 1, // the 2nd bubble only comes out of the gold BOSS SPIN
    art: ["..CCCCC..", ".CcccccC.", "CcWWccccC", "CcWcccccC", "CcccccccC", "CcccccccC", "CccccccbC", ".CcccbbC.", "..CCCCC.."],
    colors: { C: "#1d4fa8", c: "#bfe3ff", W: "#ffffff", b: "#4aa3ff" },
  },
  {
    id: "heart",
    name: "EXTRA HEART",
    info: ["A 4TH HEART,", "AND IT COMES FILLED"],
    weight: 4,
    bossWeight: 12,
    max: 1,
    art: [".KK...KK.", "KPPK.KPPK", "KPPPKPPPK", "KPPPWPPPK", "KPPWWWPPK", ".KPPWPPK.", "..KPPPK..", "...KPK...", "....K...."],
    colors: { K: "#111111", P: "#d63cc8", W: "#ffffff" },
  },
  {
    id: "stash",
    name: "BIGGER STASH",
    info: ["MORE SHOTS PER LEAF,", "LONGER FIRE TIMER"],
    weight: 8,
    bossWeight: 8,
    art: ["..KKKKK..", "..KLLLK..", ".KKKKKKK.", ".KWGgGgK.", ".KWgGgGK.", ".KGGgGgK.", ".KGgGgGK.", ".KgGgGgK.", ".KKKKKKK."],
    colors: { K: "#111111", L: "#d63cc8", G: "#5cb84a", g: "#2e6e28", W: "#ebffeb" },
  },
  {
    id: "magnet",
    name: "MAGNET",
    info: ["LEAVES AND COINS", "FLY TO YOU"],
    weight: 10,
    bossWeight: 6,
    art: ["KKK...KKK", "KWK...KWK", "KKK...KKK", "KRK...KRK", "KRK...KRK", "KRKK.KKRK", "KRRKKKRRK", ".KRRRRRK.", "..KKKKK.."],
    colors: { K: "#111111", R: "#e0303a", W: "#f7f7fb" },
  },
  {
    id: "pierce",
    name: "PIERCING SHOTS",
    info: ["SHOTS GO THROUGH MONSTERS:", "1 MORE MONSTER PER LEVEL"],
    weight: 7,
    bossWeight: 8,
    art: ["....K....", "....KK...", "KKKKKOK..", "KOOOOOOK.", "KOYYYYYOK", "KOOOOOOK.", "KKKKKOK..", "....KK...", "....K...."],
    colors: { K: "#111111", O: "#ff7a00", Y: "#ffc800" },
  },
  {
    id: "airJump",
    name: "AIR JUMP",
    info: ["ONE FREE EXTRA JUMP", "EVERY TIME YOU'RE IN THE AIR"],
    weight: 2,
    bossWeight: 9,
    max: 1,
    art: ["....K....", "...KTK...", "..KTTTK..", ".KTTTTTK.", "KKKTTTKKK", "..KTTTK..", "..KTTTK..", "..KKKKK..", ".W..W..W."],
    colors: { K: "#111111", T: "#3de0c8", W: "#ffffff" },
  },
  {
    id: "coinLuck",
    name: "COIN LUCK",
    info: ["MORE GOLD COINS", "FOR THE SHOP"],
    weight: 8,
    bossWeight: 4,
    art: ["..KKKKK..", ".KYYYYYK.", "KYWYYYYYK", "KYWYDDYYK", "KYYYDDYYK", "KYYYDDYYK", "KYYYYYYYK", ".KYYYYYK.", "..KKKKK.."],
    colors: { K: "#111111", Y: "#ffd700", W: "#fff3a0", D: "#b8860b" },
  },
  {
    id: "jetSip",
    name: "JETPACK SIP",
    info: ["A SIP OF JETPACK FUEL", "EVERY ZONE. HOLD JUMP!"],
    weight: 6,
    bossWeight: 8,
    art: ["..KKKKK..", ".KPPPPPK.", ".KPWWPPK.", ".KPPPPPK.", ".KPPPPPK.", ".KpppppK.", ".KgKKKgK.", "..O...O..", "..Y...Y.."],
    colors: { K: "#111111", P: "#d63cc8", p: "#8a1f86", W: "#ffffff", g: "#78788a", O: "#ff7a00", Y: "#ffc800" },
  },
  {
    id: "revive",
    name: "SECOND WIND",
    info: ["DIE ONCE AND GET BACK UP", "WITH 2 HEARTS"],
    weight: 2,
    bossWeight: 9,
    max: 1,
    art: [".........", "WW.K.K.WW", "WWKPKPKWW", ".WKPPPKW.", "..KPWPK..", "..KPPPK..", "...KPK...", "....K....", "........."],
    colors: { K: "#111111", P: "#d63cc8", W: "#ffffff" },
  },
  {
    id: "pet",
    name: "BOBO",
    info: ["BOBO THE DOG FOLLOWS YOU", "AND SHOOTS WHEN YOU SHOOT"],
    infoAt: [
      ["BOBO THE DOG FOLLOWS YOU", "AND SHOOTS WHEN YOU SHOOT"],
      ["BOBO NOW ALSO SHOOTS", "BY HIMSELF"],
      ["BOBO NOW ALSO", "FETCHES LEAVES"],
    ],
    weight: 10, // (was 4: BOBO shows up on about 1 in 3 normal spins now)
    bossWeight: 20, // (was 10: and on about 1 in 2 BOSS SPINS)
    art: [".KK.K.KK.", "KWWKWKWWK", "KWWWWWWWK", "KWKWWWKWK", "KWWWKWWWK", "KgWWPWWgK", "KgWWWWWgK", ".KgWWWgK.", "..KKKKK.."],
    colors: { K: "#111111", W: "#ffffff", g: "#d9d9e6", P: "#ff5fc8" },
  },
  {
    id: "swarm",
    name: "SWARM",
    info: ["40% MORE MONSTERS, BUT", "KILLS PAY DOUBLE GRAMS"],
    weight: 3,
    bossWeight: 3,
    max: 1,
    curse: true,
    art: ["..KKKKK..", ".KWWWWWK.", "KWWWWWWWK", "KWRRWRRWK", "KWRRWRRWK", "KWWWKWWWK", ".KWWWWWK.", ".KWKWKWK.", "..K.K.K.."],
    colors: { K: "#111111", W: "#e8e0f0", R: "#e0303a" },
  },
  {
    id: "greed",
    name: "GREED",
    info: ["NO NEW HEARTS APPEAR, BUT", "GOLD COINS COUNT DOUBLE"],
    weight: 3,
    bossWeight: 3,
    max: 1,
    curse: true,
    art: ["..KKKKK..", ".KYYYYYK.", "KYKKYKKYK", "KYKKKKKYK", "KYKKKKKYK", "KYYKKKYYK", "KYYYKYYYK", ".KYYYYYK.", "..KKKKK.."],
    colors: { K: "#111111", Y: "#ffd700" },
  },
];
// The filler: only on the reels once fewer than 3 prizes are left to offer (everything else is maxed out)
const SNACK: PerkDef = {
  id: "snack",
  name: "BROWNIE",
  info: ["+1 HEART RIGHT NOW", ""],
  weight: 0,
  bossWeight: 0,
  art: [".........", ".KKKKKKK.", "KBBBBBBBK", "KBGBBBGBK", "KBBBBBBBK", "KBBGBBBBK", "KbbbbbbbK", ".KKKKKKK.", "........."],
  colors: { K: "#111111", B: "#8a5a2b", b: "#5a3a1a", G: "#6fdc5a" },
};
const perkDef = (id: ReelId): PerkDef => PERKS.find((p) => p.id === id) ?? SNACK;
const perkMax = (p: PerkDef) => p.max ?? PERK_MAX;
// A run starts with none of them
const noPerks = (): Record<PerkId, number> => ({
  speed: 0, leafLuck: 0, shield: 0, heart: 0, stash: 0, magnet: 0,
  pierce: 0, airJump: 0, coinLuck: 0, jetSip: 0, revive: 0, pet: 0,
  swarm: 0, greed: 0,
});
// The machine's place on the screen (the three reel windows)
const SPIN_WIN = { x: 64, y: 35, w: 60, h: 44, step: 74 };
const SHIELD_COLORS = ["#9fe8ff", "#bfe3ff", "#4aa3ff", "#ffffff"];

const MY_GOATS = ["LIL PEEP", "YUNG LEAN", "GHOSTEMANE", "WARLORD COLOSSUS", "SMOKEDOPE2016", "DRIPPIN SO PRETTY"];
// Second sign, further left behind the jetpack
const SHOUT_OUTS = ["O1M4DE", "TOMBFELL", "LEOHWASFOUND", "STUTTERS", "SLITFACE", "SALADE", "LIL SAD K", "HELL JEXX"];

// Points
const PTS_LEAF = 10;
const PTS_WALKER = 100;
const PTS_FLYER = 150;

// Saved in the visitor's browser (name, device and owner code are shared with the other games)
const BEST_KEY = "pinksuper-best";
const SFX_KEY = "pinksuper-sfx";
// ---------- Test shortcut (only on your own computer, never on the real site) ----------
// Open  http://localhost:3000/?zone=coral  (or a zone number like ?zone=13) and every new game
// starts right at the beginning of that zone. Test runs never go on the scoreboard.
const TEST_ZONES: Record<string, number> = {
  fields: 0, speaker: 1, rooftops: 2, clouds: 3, trees: 4, smoke: 5,
  gaf: 6, psp: 7, ipod: 8, trippy: 9, spt: 10, top: 11, topshelf: 11, coral: 12,
};
function testStartZone() {
  if (typeof window === "undefined") return -1;
  const host = window.location.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return -1;
  const q = (new URLSearchParams(window.location.search).get("zone") || "").toLowerCase();
  if (!q) return -1;
  if (q in TEST_ZONES) return TEST_ZONES[q];
  const n = Number(q);
  return Number.isInteger(n) && n >= 1 && n <= ZONE_NAMES.length ? n - 1 : -1;
}
// On your own computer (localhost) every level is open, so you can test new ones straight away
function localTesting() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}
// =====================================================================================
// PINK LEVELS
// =====================================================================================
// Each level is drawn as 10 rows of text, one character per tile (rows 0-9, top to bottom).
//   #  ground (everything below it is solid)      =  brick (land on it from above)
//   -  thin line (land on it from above)          ?  bonus block (bump it from below)
//   L  weed leaf (points)   C  gold coin   H  heart
//   w  walker               f  flyer
//   S  sign: shows the next line from `signs` when you walk past it
//   (Level 3 and Level 4 have a few letters of their own: see LEVEL 3 and LEVEL 4 further down)
//   A  the boss arena starts here (exactly one screen wide, keep it flat)
//   B  the bong: touch it to finish the level and stop the clock
// Only one of = - ? per column. Edit the rows, keep them all the same length.
const LEVEL_ZONE = 30; // the "weed fantasy" look
// zone = the look (LEVEL_ZONE = Weedland, LEVEL_SNOW = snowy mountains), boss = which boss waits in the arena,
// outfit = a picture PINKMANE wears only in this level (leave it out to wear your own outfit)
// music = songs that play through the whole level, one after another (mp3s in public/sounds/)
type LevelDef = { name: string; map: string[]; signs: string[]; bossHp: number; zone?: number; boss?: "leaf" | "snowman"; outfit?: string; music?: LevelSong[] };
const LEVEL_SNOW = 31; // the snowy mountain valley look
const LEVEL_KEEP = 32; // LEVEL 3: Warlord's Keep (the dark cathedral with the wiggly drawings)
// The songs for Level 3, played one after another (then back to the first).
// Put each mp3 in public/sounds/ with exactly this file name. The title is what the little
// purple box on the handheld shows for a few seconds when a song starts. A song whose file is
// missing just gets skipped.
// The handheld's music buttons (play/pause, next, previous, volume) control these while you play.
type LevelSong = { file: string; title: string; artist: string };
const KEEP_MUSIC: LevelSong[] = [
  { file: "/sounds/king-baldwin-iv.mp3", title: "KING BALDWIN IV", artist: "WARLORD COLOSSUS" },
  { file: "/sounds/stressin.mp3", title: "STRESSIN", artist: "WARLORD COLOSSUS" },
  { file: "/sounds/dont-fight-skeletons.mp3", title: "DON'T FIGHT SKELETONS", artist: "WARLORD COLOSSUS" },
  { file: "/sounds/hounskull.mp3", title: "HOUNSKULL", artist: "WARLORD COLOSSUS" },
  { file: "/sounds/no-mana-no-health.mp3", title: "NO MANA, NO HEALTH", artist: "WARLORD COLOSSUS" },
  { file: "/sounds/hexed-up.mp3", title: "HEXED UP", artist: "WARLORD COLOSSUS" },
];
const LEVEL_WOODS = 33; // LEVEL 4: Painted World (TOMBFELL's glitchy backwoods)
// The songs for Level 4 (TOMBFELL), played one after another. Same rules as Level 3:
// put each mp3 in public/sounds/ with exactly this file name. A song whose file is missing just
// gets skipped. Add, remove or rename lines here whenever you want.
const WOODS_MUSIC: LevelSong[] = [
  { file: "/sounds/painted-world.mp3", title: "PAINTED WORLD", artist: "TOMBFELL" },
  { file: "/sounds/bring-your-own-beer.mp3", title: "BRING YOUR OWN BEER", artist: "TOMBFELL" },
  { file: "/sounds/like-violins.mp3", title: "LIKE VIOLINS", artist: "TOMBFELL" },
];
const ALL_LEVELS: LevelDef[] = [
  {
    // Other name ideas: "BONG LVL 1", "THE FIRST HIT", "WEEDLAND", "GREEN DREAM", "HIGH GROUND"
    name: "PINKMANE LIKES WEED",
    bossHp: 10,
    // Lore signs, in order. Change them to whatever you want people to learn about PINKMANE.
    // Max ~40 characters per line; use \n to split a sign into two lines.
    signs: [
      "WELCOME TO WEEDLAND, PINKMANE'S HOME",
      "HIS BEST FRIEND IS HIS DOG BOBO.\nHE LOVES HIM MORE THAN ANYTHING",
      "HE MOSTLY MAKES CLOUD RAP/TRAP MUSIC\nWITH A LOT OF ARCADE INSPIRED SOUNDS",
      "HIS FAVOURITE ARTISTS:\nLIL PEEP, YUNG LEAN, GHOSTEMANE",
      "FIND PINKMANE ON SOUNDCLOUD",
      "THE EVIL LEAF GUARDS HIS BONG...",
      "PINKMANE LIKES WEED. GO HIT THE BONG!",
    ],
    map: [
      "......................................................................................................................................................................................................................",
      "......................................................................................................................................................................................................................",
      "......................................................................................................................................................................................................................",
      ".......................................................................................H..............f...............................................................................................................",
      "..........................C...........L..L..........f.................................---...................f....................C..........f...L..L.....................===..........................................",
      ".........................===..........=?==.................L........C...........................==?=.....................LL....----.............====.................?.........?......................................",
      "........LLL....LL...............................LLL......-----.....###..................................LLL.............----.............................LLL..................................LLL.....................",
      "...S..........####....w...........S..........w..................#########...S...w...w...........................S...w.......###.........w.............S..........A........................S..........B................",
      "##############################..##########################...#############################...###########################....###....###################################################################################",
      "##############################..##########################...#############################...###########################....###....###################################################################################",
    ],
  },
  {
    // Other name ideas: "SNOWY MOUNTAINS", "COLD HANDS", "FROZEN HIGH", "BRRR"
    name: "SNOWY MOUNTAINS",
    bossHp: 10,
    zone: LEVEL_SNOW,
    boss: "snowman",
    outfit: "/game/pinkdude-winter.png", // pink parka + beanie, only in this level
    signs: [
      "WELCOME TO THE SNOWY MOUNTAINS",
      "PINKMANE'S FAVOURITE SHOW: SOUTH PARK",
      "FAVOURITE CHARACTERS:\nKENNY, CARTMAN, BUTTERS, TWEEK",
      "IT'S COLD UP HERE. KEEP YOUR JOINT LIT",
      "THE EVIL SNOWMAN WANTS YOUR WEED...",
      "WARM UP: GO HIT THE BONG!",
    ],
    map: [
      "........................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................",
      "........................................................................H...f.................................f.........................................................................................................",
      "....................C.........................f........................---..........................L.....................LL............f........C...........................===........................................",
      "...................===...............L......=?==....LL.............................................==?=..................----...................===......................?.........?....................................",
      ".......LLL..........................###...........------......................LLL..........C........................---......---..........................LLL.....................................LLL...................",
      "...S...........w.............S...######...w.................S...w...w.....................###...S.........w............##...........w.......w.........S..............A........................S.........B...............",
      "########################...#######################......############################...#############################...##.......########################################################################################",
      "########################...#######################......############################...#############################...##.......########################################################################################",
    ],
  },
  {
    // LEVEL 3: the boss level for WARLORD COLOSSUS (3 fights: horned warrior, skeleton knight, WARLORD)
    // Other name ideas: "THE KEEP", "KING BALDWIN'S HALL", "NEPHILIM KEEP"
    name: "WARLORD'S KEEP",
    bossHp: 0, // not used here: this level has its own knights (see LEVEL 3 below)
    zone: LEVEL_KEEP,
    music: KEEP_MUSIC,
    // Lore signs, in order (one per S on the map). Max ~40 characters per line, \n = new line.
    signs: [
      "WELCOME TO WARLORD'S KEEP",
      "PINKMANE FOUND WARLORD COLOSSUS WHEN\nHEXED UP (2020) DROPPED. FAN EVER SINCE",
      "WARLORD MAKES SHADOW RAP",
      "THE HORNED WARRIOR: 3 SHOTS, THEN HE\nRAGES. JUMP HIM, GET AMMO FROM THE BOX",
      "INFLUENCES: DMX, FLATBUSH\nZOMBIES AND $UICIDEBOY$",
      "THE SKELETON KNIGHT IS NEXT.\nSHOTS WON'T WORK: JUMP ON HIM!",
      "WARLORD LEADS THE NEPHILIM GANG\nAND RUNS NEPHILIM RECORDS",
      "FIND WARLORD COLOSSUS ON\nSPOTIFY AND SOUNDCLOUD",
      "HIS SHIELD BLOCKS SHOTS. JUMP ON HIS\nHEAD AND DODGE THE WAVE FROM HIS EYES!",
      "YOU BEAT THE WARLORD!\nGO HIT THE BONG",
    ],
    map: [
      "........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
      "........................................................................................................................................................................................................................................................................................................................................................................................................................................................................................................",
      "....................................................................................C...................................................................................................f..........................L..f....................C.......................................................................................................................C......f.............................................................................................................................",
      "...................C..............................L..L................f...............................H...f...................................................L..L....................C...................................................---.................f............H.........................................................f.............LLL................f.........................L..L...........H........f...............................................................................",
      "..................=?==............................----....................LLL......=?=...............---.................................?......?.............=?==..................----...........LLL............=?=.................---.................................==?=.....................................................................###............=?=...........................----..........=?==......................................................................................",
      "........LLL...........................LLLLLL..............................###.....................................LLL..........................................................w...................###............................---.....................LLL.................................................................LLL...............######......w...................................................................LLL.....................................................................",
      "...S..........S.........w.............######..w..........S........w.......######........w...w.................S.........w......H...M................................w.......######t.........S......###.....w...w....t...................t.....w........P...t......w...w.........S...w........t.....K......................S.......w..........#########...######...................w..w..w.................S....X....w...............w...X.......S........W........................S.......B.............",
      "############################..###############################...################################..##########################..##########################################...#####################..####..######################...################..#####################################..##############################################...###########...###################################..#######...####################..##########################################################################",
      "############################..###############################...################################..##########################..##########################################...#####################..####..######################...################..#####################################..##############################################...###########...###################################..#######...####################..##########################################################################",
    ],
  },
  {
    // LEVEL 4: the boss level for TOMBFELL (one long fight in 3 parts: doves, cats, the bear)
    // Other name ideas: "THE BACKWOODS", "BACKWOOD WIZARDS", "FARGONE"
    name: "PAINTED WORLD",
    bossHp: 0, // not used here: TOMBFELL has his own fight (see LEVEL 4 below)
    zone: LEVEL_WOODS,
    music: WOODS_MUSIC,
    // Lore signs, in order (one per S on the map). Max ~40 characters per line, \n = new line.
    signs: [
      "WELCOME TO THE PAINTED WORLD",
      "TOMBFELL IS FROM TENNESSEE",
      "TOMBFELL IS PINKMANE'S HOMIE",
      "HE PRODUCES ALL HIS OWN BEATS\n[PROD. ME]",
      "TOMBFELL MAKES CLOUD RAP,\nTRAP AND WITCH TRAP",
      "HE REPS BACKWOODWIZARDS",
      "TOMBFELL LOVES BIRDS AND CATS",
      "FIND TOMBFELL ON SOUNDCLOUD",
      "YOU CAN'T JUMP ON A WIZARD.\nSEND HIS ANIMALS BACK AT HIM!",
      "YOU BEAT TOMBFELL!\nGO HIT THE BONG",
    ],
    // w = cat, f = dove, b = black bear, T = TOMBFELL's arena
    map: [
      "............................................................................................................................................................................................................................................................................",
      "............................................................................................................................................................................................................................................................................",
      "............................................................................................................................................................................................................................................................................",
      ".................................................f..................................H.................................f.....f........................................................f............................H.........................................................",
      "....................C.........................f....LL..............................---....................C..............f......................L.................................f.....LLL.....C................---........................................................",
      "...................=?=............................----..................................==...................w................................=?==.....................................-----................................................................................",
      "........LLL............................LL..............................LLL.................................######......LLL..............................LL...............................................-----...........LLL................................LLL.............",
      "...S..........S..........w........S.....................w.........S...........b.............w.......S......######...............b........S............w....w......b........S...............S.....w...b...............S..........T........................S.......B..........",
      "##############################..#############################...################################..##################################...################################..#################################...###############################################################",
      "##############################..#############################...################################..##################################...################################..#################################...###############################################################",
    ],
  },
];

// =====================================================================================
// LEVEL 3: WARLORD'S KEEP
// =====================================================================================
// Map letters only this level uses (each one starts an arena, exactly one screen wide, keep it flat):
//   M  the HORNED WARRIOR: fast! You start with HORNED_AMMO shots and ONE double jump. After those
//      shots he RAGES (even faster): double jump over him and bump the ? boxes for more ammo.
//      Jumping on him just bounces you off.
//   K  the SKELETON KNIGHT: quick, long sword swings. Shots bounce off, jump on his head.
//   W  WARLORD COLOSSUS: huge sword + shield. The shield blocks every shot, jump on his head.
//      He throws you off after every hit, and shoots sound waves out of his eyes.
// Which Warlord to use: "A" = beaked helmet + crown, "B" = the photo version (face mask + gold cross)
const WARLORD_LOOK: "A" | "B" = "A";
const HORNED_HP = 6; // shots to beat the horned warrior
const HORNED_AMMO = 3; // shots you start the fight with (the ? boxes give +3 and a double jump)
const HORNED_SPEED = 72; // how fast he runs at you (you run at 100)
const HORNED_RAGE_SPEED = 108; // once he rages: faster than you, so you have to jump over him
// His spiked ball never swings higher than his own head, and the chain doesn't go out as far as it
// used to: a double jump over him now clears the ball. He also never starts a big swing while you're in the air.
const HORNED_BALL_UP = 28; // how high the ball can rise above his hand
const HORNED_SWING_REACH = 26; // extra chain he lets out on a big swing (was 44)
const SKELETON_HP = 5; // stomps to beat the skeleton knight
const SKELETON_REACH = 58; // how far his sword reaches in front of him
const WARLORD_HP = 6; // stomps to beat WARLORD COLOSSUS (he gets faster + angrier at half)
const KEEP_TILE = 318; // the cathedral backdrop repeats every 318px (pillar to pillar)
// ---------- Level 3 upgrades ----------
// ONE checkpoint, in the middle of the level (the P on the map). Run out of hearts after you've touched it and you come back there
// (with this many hearts) instead of at the very start. The level clock keeps running, so a death costs you the time you lose.
const KEEP_CHECKPOINT_HEARTS = 2;
// The three wings of the Keep. Each has its own colour wash over the backdrop and shows its name when you walk in.
// from = the first tile of the wing (the gates are the three knights).
type Wing = { name: string; from: number; tint: [number, number, number, number] };
const KEEP_WINGS: Wing[] = [
  { name: "THE ARMORY", from: 0, tint: [255, 120, 40, 0.14] },
  { name: "THE CRYPT", from: 151, tint: [70, 150, 220, 0.2] },
  { name: "THE THRONE ROOM", from: 312, tint: [235, 190, 60, 0.14] },
];
const wingAt = (col: number) => {
  let w = 0;
  KEEP_WINGS.forEach((x, i) => {
    if (col >= x.from) w = i;
  });
  return w;
};
// The Warlord fights to a beat. His slams LAND on a beat and his eye waves fire on a beat, with a little ring pulsing on his health bar so
// you can feel it. PLACEHOLDER tempo: set WARLORD_BPM to the real tempo of the song playing in the Keep and the fight will sit in time with it.
const WARLORD_BPM = 110;
const WARLORD_BEAT_OFFSET = 0; // seconds: nudge it if the beat feels a little early or late
// The stone statues that wake up before the Warlord (the lesson for his floor shockwaves)
const STATUE_COLORS: Record<string, string> = { A: "#2a2c33", B: "#2a2c33", C: "#2a2c33", D: "#aab0ba", E: "#5d626d", F: "#7d838f", G: "#c5cad3", H: "#9097a3", I: "#767c88", J: "#aab0ba", K: "#5d626d", L: "#3a3d46", M: "#6b707c" };
// The CRYPT is dark: you only see a circle around you and around the torches you've lit (shoot a torch with a fire shot to light it:
// it also drops a gold coin). DARK_MAX = how dark it gets (1 = pitch black); the lights are radii in pixels.
const DARK_MAX = 0.66;
const PLAYER_LIGHT = 62;
const TORCH_LIGHT = 76;
const TORCH_EMBER = 14; // an unlit torch still glows a tiny bit, so you can find it
// ---------- Medals ----------
// Par times in seconds for each level: [gold, silver, bronze]. These are first guesses: change them once you know how fast people really are.
const LEVEL_PAR: Record<number, [number, number, number]> = { 1: [60, 80, 110], 2: [60, 80, 110], 3: [150, 200, 280], 4: [80, 110, 150] };
const LEVEL_MEDALS_KEY = "pinksuper-medals"; // JSON { "3": { time: "gold" | "silver" | "bronze" | null, nohit: boolean } }
type MedalTime = "gold" | "silver" | "bronze";
const MEDAL_RANK: (MedalTime | null)[] = [null, "bronze", "silver", "gold"];
const medalForTime = (level: number, ms: number): MedalTime | null => {
  const par = LEVEL_PAR[level];
  if (!par) return null;
  const sec = ms / 1000;
  return sec <= par[0] ? "gold" : sec <= par[1] ? "silver" : sec <= par[2] ? "bronze" : null;
};
// How Level 3's WARLORD skin can be EARNED (you can still buy it in the shop): a gold medal or a no-hit run in Level 3
const WARLORD_SKIN_LEVEL = 3;
type KnightKind = "horned" | "skeleton" | "warlord";
type Knight = {
  kind: KnightKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  hit: number; // flashes white after a hit
  inv: number; // can't be stomped again until this runs out
  dead: number; // counts down while he falls apart
  facing: number; // -1 = looking left
  act: "walk" | "wind" | "swing" | "rest" | "stagger" | "hop" | "beam";
  timer: number;
  cool: number; // time until the next attack
  ang: number; // horned: where the mace is on its circle. warlord: sword angle
  reach: number; // horned: chain length
  waves: number; // warlord: sound waves still to fire in this blast
  p2?: boolean; // warlord: phase 2 has started (pillars + skeletons)
};
// w/h = size on screen, scale = pixel size, foot = how far down his feet are, hb = his body (left..right),
// top = top of his head (where you land on him)
const KN_DIM: Record<KnightKind, { w: number; h: number; scale: number; foot: number; hb: [number, number]; top: number }> = {
  horned: { w: 48, h: 52, scale: 2, foot: 52, hb: [8, 40], top: 6 },
  skeleton: { w: 56, h: 66, scale: 2, foot: 58, hb: [18, 42], top: 10 },
  warlord: { w: 108, h: 102, scale: 3, foot: 102, hb: [30, 96], top: 8 },
};
const KN_NAMES: Record<KnightKind, string> = { horned: "HORNED WARRIOR", skeleton: "SKELETON KNIGHT", warlord: "WARLORD COLOSSUS" };
// Warlord's giant sword: where his back hand holds it, and the angles of the swing (radians, 0 = pointing right)
const WL_PIVOT = WARLORD_LOOK === "A" ? { x: 85, y: 81 } : { x: 88, y: 79 };
const SW_IDLE = (-65 * Math.PI) / 180; // resting over his shoulder
const SW_BACK = (-15 * Math.PI) / 180; // pulled back before the swing
const SW_SLAM = (-190 * Math.PI) / 180; // smashed into the floor in front of him
const SW_GRIP = 52; // which row of WL_SWORD sits in his hand
const KNIGHT_DUST = ["#2c3038", "#5c636f", "#a9b2bf", "#ffffff"];
// WARLORD's eyes (where the sound waves come out), measured on his picture facing left
const WL_EYES = WARLORD_LOOK === "A" ? { x: 52, y: 22 } : { x: 54, y: 22 };
const EYE_WAVE_SPEED = 120; // how fast his sound waves fly
const EYE_WAVES = 2; // sound waves per blast (fired one after the other, each aimed at you)

// Mirrors a picture left-to-right (kept, so it isn't redone every frame)
const flipCache = new Map<string[], string[]>();
// A modulo that never goes negative (a plain % does when the number is negative, which gave an index of -1 and froze the game)
const pmod = (n: number, m: number) => ((n % m) + m) % m;
const flipRows = (rows: string[]) => {
  let f = flipCache.get(rows);
  if (!f) {
    f = rows.map((r) => r.split("").reverse().join(""));
    flipCache.set(rows, f);
  }
  return f;
};
// Same picture, every colour white (for the hit flash)
const whiteCache = new Map<Record<string, string>, Record<string, string>>();
const whiteOf = (colors: Record<string, string>) => {
  let w = whiteCache.get(colors);
  if (!w) {
    w = Object.fromEntries(Object.keys(colors).map((k) => [k, "#ffffff"]));
    whiteCache.set(colors, w);
  }
  return w;
};

// ---- Level 3 art (made from your Procreate edits). Frames with 8 pictures = the wiggly drawings moving ----
const KN_SKEL = [["............................", "............................", "............................", "............................", ".........AAAABBBCCCB........", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "........AAAAABBBCCCB........", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "........AAAAABBBBCCCB.......", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "........AABAAABBBBCCCB......", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", ".........AAAAAABBBCCCB......", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "..........AAAAABBBCCCB......", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "..........AAAAABBCCCB.......", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"], ["............................", "............................", "............................", "............................", "..........AAAABBBCCB........", "....DA...AEFEFEFEFEAA.......", "....DGA..AFEFEFEFEFEA.......", "....DGA..AEFEFEFEFEFA.......", "....DGA..AFEHHHHHHFEA.......", "....DGA..AEFAAHHAAEFA.......", "....DGAA.AFEAAHHAAFEA.......", "....DGAA.AEFHIAAIHEFA.......", "....DGAA.AFEHHHHHHFEA.......", "....DGAA.AEFHAHAHAEFA.......", "....DGAA.AFEAHAHAHFEA.......", "....DGAA.AEFHIHHIHEFAAA.....", "....DGAAAAFEFEFEFEFEAAAA....", "....DGAHHFEFEFEFEFEFEHHA....", "....DGAAHEFEFEFEFEFEFHHA....", "....DGAAHFEFEFEFEFEFEHHA....", "....JJAAHEFEFEFEFEFEFHHA....", "....KKHHHFEFELELLLLLLAAA....", "....KKHHHLLLLLMLLLLLLAA.....", "....JJAAAAEFEFEFEFEFEA......", "....AAA.AAFEFEFEFEFEFA......", "........AAEFEFEFEFEFEA......", "........AAAEFAAAAEFAAA......", ".........AAAHAAAAHHAA.......", "..........AAHAA.AHHA........", "............................", "............................", "............................", "............................"]];
const KN_SKEL_COLORS: Record<string, string> = {"A": "#121216", "B": "#121215", "C": "#111116", "D": "#eef2f6", "E": "#41454e", "F": "#7a808b", "G": "#a9b2bf", "H": "#ece6d6", "I": "#b9b0a0", "J": "#f0c030", "K": "#5a3a22", "L": "#26262a", "M": "#8c8c90"};
// The skeleton knight of the infinite run: the same picture, repainted. A = outline, E/F = armour, G = blade,
// D = blade shine, H/I = bone, J = trim, K = handle, L/M = belt and metal. Change any colour here.
const KN_SKEL_RUN_COLORS: Record<string, string> = { A: "#121216", B: "#121215", C: "#111116", D: "#fff0c8", E: "#5e1824", F: "#b03844", G: "#ff9a3c", H: "#ece6d6", I: "#b9b0a0", J: "#3cf0e0", K: "#5a3a22", L: "#2a1016", M: "#c0707a" };
const KN_ONI = [["...................", "...................", "...................", "...................", "...................", "...A.A....BBBBC....", "...AADEE...B.BDC...", ".....FG.....G......", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...................", "...A........BC.....", "...AAAE.....BBBC...", "...ADDG.....G......", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "....A..............", "...A..E.....B......", "...A..E.....BBBC...", "...AADG.....GDB....", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", ".....A.............", "....A..............", "....A..E....B.B....", "...AA.E.....BBC....", "...AAAG.....GBB....", ".....DGHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", ".....A.............", ".....A..E....C.....", "....AA.E....BB.....", "....AA.E....BB.....", "....DAG.....GB.....", ".....DGHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", ".....A.............", ".....A..E...BC.....", ".....A..E.BBBD.....", ".....A..E...BB.....", ".....DGB....G......", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "....AA.....BBC.....", ".....AA.E.BBB......", ".....DAB....B......", ".....DG.....G......", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........B.......", "...AAAAE..BBBCC....", ".....DA.E..BD......", ".....FGB....G......", "......GHHHHHG......", "......HIJHJIH......", "......HHHJHHH......", "......HGGGGGH......", "......HKHHHKH......", ".......LLLLL.......", ".......L...L.......", "...................", "...................", "...................", "..................."]];
const KN_ONI_COLORS: Record<string, string> = {"A": "#3a0c1a", "B": "#3a0b1a", "C": "#3a0c19", "D": "#3b0c1a", "E": "#3b0b1a", "F": "#3b0c19", "G": "#121216", "H": "#c4282e", "I": "#ffe14a", "J": "#7a1418", "K": "#eef2f6", "L": "#26262a"};
const KN_CROW = [["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAA......", "....AAAA.AAAB......", ".....AAAAAACCB.....", "......AAAAAA.BB....", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAA......", "....AAAA.AAAB......", ".....AAAAAACCB.....", "......AAAAAA.BB....", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAA......", "....AAAA.AAAB......", ".....AAAAAACCBB....", "......AAAAAA.......", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAA......", "....AAAA.AAABBB....", ".....AAAAAACCB.....", "......AAAAAA.......", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAAB.....", "....AAAA.AAABBB....", ".....AAAAAACC......", "......AAAAAA.......", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAAB.....", "....AAAA.AAABBB....", ".....AAAAAACC......", "......AAAAAA.......", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAAB.....", "....AAAA.AAABB.....", ".....AAAAAACCBB....", "......AAAAAA.......", "......AAAAA........", "...................", "...................", "...................", "..................."], ["...................", "...................", "...................", "...................", "...........AA......", "....A......AA......", "....AA...AAAA......", "....AAAA.AAABB.....", ".....AAAAAACCB.....", "......AAAAAA..B....", "......AAAAA........", "...................", "...................", "...................", "..................."]];
const KN_CROW_COLORS: Record<string, string> = {"A": "#1e1e28", "B": "#511d1b", "C": "#ffaa28"};
const KN_MACE = [["..........................", "..........................", "..........................", "..........................", "...............A..........", "...............B..........", ".............BB...........", "......C....BBB............", "......C....AA.............", "......C.....A..AADDDD.....", ".......BCCC.AAAA.DDD......", "..........A.AEA.A.........", "..........AAEEEA.....A....", "....C.CDD.AEEFEEA...BA....", ".....A..DAEEFAFEEA.AA.....", ".........DAEEFEEA.A.A.....", "...........AEEEA..........", "..........AAAEAAA.........", ".........AAA.AA.AAACC.....", ".......BBBBA..A.....C.....", ".......B......A.....A.....", ".......A......C.....A.....", "........A...CC............", "..........................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "..............A...........", "...............B..........", ".......C......BB..........", "......CC.....BB...........", ".......C...AA......D......", ".......A....A......D......", ".......BCC.AAA..ADDD......", ".......CCCA.AEAAA....A....", "..........CAEEEA....AA....", "....C.CDD.AEEFEEA..AA.....", ".....A...AEEFAFEEA.A......", "..........AEEFEEA.A.......", "...........AEEEAA.........", "..........AAAEA.AA........", "........BAA..AAA.AACC.....", ".......BBBB...A....C......", ".......B......A....C......", "........B....C.....A......", "........A..CC......A......", "........AA................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "............AA............", "..............B...........", ".......C......BB..........", ".......CC.....B...D.......", "........A...AA....D.......", ".......A....A.....DD......", ".......B...AAA...ADD......", ".......CCCA.AEAAAAD.AA....", "..........CAEEEA...AAA....", "....C.C.D.AEEFEEA..A......", ".....A.D.AEEFAFEEAA.......", "..........AEEFEEA.A.......", "...........AEEEAAA........", "........AAAAAEA.AAA.......", "........BBA..AAA...C......", "........B.....A....C......", "........B....A....C.......", "........AB..C.....C.......", ".........B.CC......A......", "........AAA...............", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "...........A..............", "............BB............", ".......C.....BB...........", ".......CC.....BB.DD.......", "........A....AA..DD.......", "........B....A...DD.......", "........B...AA...AD.......", "........CCA.AEAAAAD.A.....", "........CCAAEEEAA..AA.....", "..........AEEFEEAAA..A....", "....CAC.DAEEFAFEEAA.......", ".......D..AEEFEEAA........", "...........AEEEAA.A.......", "........AAAAAEA.AAA.......", "........AB...AA...A.......", "........BB...A....C.......", "........BB..A.....C.......", ".........B.CC.....C.......", "........AB..CC.....A......", ".........A................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "...........A..............", "...........B..............", "...........BBB............", "......CCC....BB..DD.......", ".........B...AA..D........", "........BC....A..D........", "........CC..AA...D........", "........C.A.AEAAAA........", "........CCAAEEEAAA.AA.....", "..........AEEFEEAAA.A.....", ".....A...AEEFAFEEA..AA....", "....C.CDDDAEEFEEAA...A....", "...........AEEEAA.A.......", ".........AAAAEA.AA........", ".........A...AA..A........", ".........BB.AA...A........", ".........BB.A....CC.......", ".........BB.CC....CAA.....", "......AAAB....CC..........", "..........................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "............A.............", "...........B..............", "..........BBB.............", "...........BAB...DA.......", ".....CCCAB...AA.DDDD......", "......C..C....A.AD........", ".........C...A..AD........", ".........CA.AEAAA.........", "..........CAEEEA.A.A......", "..........AEEFEEAAAA......", ".....A...AEEFAFEEA..A.....", "....C.CDDAAEEFEEA...AA....", ".........D.AEEEAA....A....", "..........AAAEA.AA........", ".........AA..A...A........", ".........AB.A....A........", "..........B.A....CCCAA....", "......AABBBB.CC...........", "...............CC.........", "..........................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "..............A...........", "............BA............", "..........BB..............", "..........BAB.............", ".....C..AB..AA..DDDA......", ".....CCA.CC...ACD..DD.....", ".........CC..A.AA.........", ".........CA.AEAAA.........", "..........CAEEEA.A........", "..........AEEFEEAAA.......", ".....A.D.AEEFAFEEA.A......", "....C.C.DAAEEFEEA..AAA....", ".........D.AEEEAA...AA....", "..........AAAEA.A.........", "..........A..A..AA........", "..........A.A...A..CC.....", ".......BBBBB.A...CC..A....", "......A..BB...CC..........", "...............CC.........", "..........................", "..........................", "..........................", ".........................."], ["..........................", "..........................", "..........................", "..........................", "...............A..........", ".............BB...........", "...........BBB............", "..........BB..............", ".....C.....AA.............", ".....CCACCC..A.ADDDDD.....", "..........C.AAAAA.........", "..........A.AEA.A.........", "..........AAEEEA..........", ".......D..AEEFEEAA...A....", "....CAC.DAEEFAFEEAAABA....", "........DAAEEFEEA..AAA....", ".........D.AEEEA....A.....", "..........AAAEAAA.........", "..........AA.AA.A...C.....", ".......BBBBA.A..AACCC.....", ".......BBBBB..A......A....", "......AA.......C..........", "......A.......CC..........", "..........................", "..........................", "..........................", ".........................."]];
const KN_MACE_COLORS: Record<string, string> = {"A": "#121216", "B": "#111116", "C": "#121215", "D": "#111115", "E": "#cfd6df", "F": "#8a93a1"};
const KN_HORNED = ["..ABAA............AACAA.", "..ADDAAAAAAAAAAAA.ADDAA.", "..ADDAAAAAAAAAAAAEADDAA.", "...ADDBDDBDDBDDBDADDAA..", "....ADBDDBDDBDDBDDDAA...", ".....ABDDBDDBDDBDDAA....", ".....ADDFGFGFGFGDDAH....", "....ABBDGFGFGFGFDBBAA...", "....ABBDFGFGFGFGDBBAA...", "....ABBDGFGFGFGFDBBAA...", "....ABBDIIJIIJIIDBBAA...", "....ABBDDJJJJJJDDBBAA...", "....ABBAAJJJJJJAABBAA...", ".AAAKKLLLLLLLLLLLLKKAAA.", "AMIILLLLLLLKKLLLLLLLLLAA", "AMNMLLLLLLLKKLLLLLLLLLAA", "AMMILLLLLLLKKLLOLLLLLLAA", "ANMILLLOLLLKKLLLLLLLLLAA", "APNILLLLOLLKKLLLLLLLLLAA", "AMQMLLLLLLLKKLOLLLLLLLAA", "AIMMLLLLLLLKKLLLLLLLMMAA", "AIMMLLKKKKKKKKKKKKLLMMAA", ".ARAAAKKKKKKKKKKKKAAAAS.", ".ARAAAADDDAAAADDDATAAA..", ".ARA..ADDDAAAADDDAA.....", ".AAA..ADDDA..ADDDAA....."];
const KN_HORNED_COLORS: Record<string, string> = {"A": "#121216", "B": "#8c8c90", "C": "#1a1a1e", "D": "#26262a", "E": "#131317", "F": "#41454e", "G": "#7a808b", "H": "#151519", "I": "#d9a07a", "J": "#3a2418", "K": "#8a93a1", "L": "#cfd6df", "M": "#3b0c1a", "N": "#2f3a4a", "O": "#8a5530", "P": "#3a0f1d", "Q": "#391220", "R": "#5a3a22", "S": "#181619", "T": "#18181d"};
const KN_SKEL_WALK = [[".AAAA..", ".BABA..", ".AAAA..", "..BAB.C", "ABAAABD", "..ABA..", ".A...A."], [".AAAA..", ".BABA..", ".AAAA..", "..BAB.C", "ABAAABD", "..ABA..", "..A.A.."]];
const KN_SKEL_WALK_COLORS: Record<string, string> = {"A": "#ece6d6", "B": "#121216", "C": "#eef2f6", "D": "#5a3a22"};
const WARLORD_A = [[".................ABABABABA..........", ".................ABBBBBBBA..........", ".................ACBDBDBCA..........", ".................AEEEEEEEA..........", "................AEFFFEEEEEA.........", "...............AEFFFFEEEEEEA........", ".............AAFEEGEEEEEEHHA........", "...........AAFAIIAAIAAEEEHHA........", ".........AAFFEEEEEEEEEEEEHHA........", ".......AAFFEEEAEEEEEEEEEEHHA........", "......AFFEEEAEEEEEEEEEEEEHHA........", ".....AFHAHAEEEAEEEEEEEEEEHHA........", "......AA.AHHAEEEEEEEEEEEEHHA........", "..........AAAHHHEEEEEEEEEHHA........", "..........AAAAAJKJKJKJKJKJKAAAAA....", ".........AEFFFEKJKJKJKJKJKJEFFFEA...", ".........AEEEEEJKJKJKJKJKJKEEEEEA...", "..........AAAAEEEEEEFHEEEEEAAAAA....", ".........AEFEEEEFFEEFHEEHHHEFEEEA...", ".........AEEEEEEFFEEFHEEHHHEEEEEA...", ".........AEEEEEEFFEEFHEEHHHEEEEA....", ".........AEFEEEEFFEEFHEEHHHEEFEA....", "..........AAAAAAAAAAAAAAAAAAAAA.....", ".........AEEEEEEEEEEFHEEHHHEEEEA....", ".........AEEEEEEEEEEFHEEHHHEEEEA....", "........AHHHHHADDDDDBBDDDDAEEEEA....", "........AHHHHHEFFEEEEEEEHHHHHHHA....", ".........AAAAAAAAAAAAAAAHHHHHHHA....", ".............AEFFEEEEEEEHHHAAAA.....", ".............AEEEEEEEEEEHHHA........", "..............AEFEEAAAEFEEA.........", "...............AAAA...AAAA..........", "..............AEEEEA.AEEEEA.........", ".............AHHHHHA.AHHHHHA........"], [".................ABABABABA..........", ".................ABBBBBBBA..........", ".................ACBDBDBCA..........", ".................AEEEEEEEA..........", "................AEFFFEEEEEA.........", "...............AEFFFFEEEEEEA........", ".............AAIEEGIEEEEEHHA........", "...........AAFILIIILIIEEEHHA........", ".........AAFFEEDEEEDEEEEEHHA........", ".......AAFFEEEAEEEEEEEEEEHHA........", "......AFFEEEAEEEEEEEEEEEEHHA........", ".....AFHAHAEEEAEEEEEEEEEEHHA........", "......AA.AHHAEEEEEEEEEEEEHHA........", "..........AAAHHHEEEEEEEEEHHA........", "..........AAAAAJKJKJKJKJKJKAAAAA....", ".........AEFFFEKJKJKJKJKJKJEFFFEA...", ".........AEEEEEJKJKJKJKJKJKEEEEEA...", "..........AAAAEEEEEEFHEEEEEAAAAA....", ".........AEFEEEEFFEEFHEEHHHEFEEEA...", ".........AEEEEEEFFEEFHEEHHHEEEEEA...", ".........AEEEEEEFFEEFHEEHHHEEEEA....", ".........AEFEEEEFFEEFHEEHHHEEFEA....", "..........AAAAAAAAAAAAAAAAAAAAA.....", ".........AEEEEEEEEEEFHEEHHHEEEEA....", ".........AEEEEEEEEEEFHEEHHHEEEEA....", "........AHHHHHADDDDDBBDDDDAEEEEA....", "........AHHHHHEFFEEEEEEEHHHHHHHA....", ".........AAAAAAAAAAAAAAAHHHHHHHA....", ".............AEFFEEEEEEEHHHAAAA.....", ".............AEEEEEEEEEEHHHA........", "..............AEFEEAAAEFEEA.........", "...............AAAA...AAAA..........", "..............AEEEEA.AEEEEA.........", ".............AHHHHHA.AHHHHHA........"]];
const WARLORD_A_COLORS: Record<string, string> = {"A": "#0c0c10", "B": "#f0c030", "C": "#a8800f", "D": "#8a1820", "E": "#3b404b", "F": "#7d8695", "G": "#a8b0bd", "H": "#22252c", "I": "#ff2a2a", "J": "#565c67", "K": "#2a2d34", "L": "#ffb0a0"};
const WARLORD_B = [["................AABAABAABA..........", "...............ABBBCBBBCBBA.........", "..............ABBCBBBCBBBBBA........", "..............ABBBBBBBBBCBBA........", ".............ABBBBBBBBBBBBBBA.......", ".............ABCDDDDDDDDEECBA.......", "............ABBBAADDAADDEEBBBA......", ".............ABBDADDDADDEEBBA.......", "............ABBBFFFFFFFFFEBBA.......", ".............AAFFGGGFFFFFFBBBA......", ".............AAFFGGGFFFFFFBBA.......", "............AHAFFFFFFFFFFHAA........", "............AHIIHHHHJJJJJJJA........", "............AHHHHHHHJJJJJJJA........", ".........AAAAJJJJJJJJJJJJJJAAAAA....", "........AKLKLHHHHHHHHHHHHJJJLKLKA...", "........ALKLKHHIIIMNNMHHHJJJKLKLA...", "........AKLKLHHIIHHMMHHHHJJJLKLKA...", "........ALKLKHHIIHHMNHHHHJJJKLKLA...", "........AKLKLHMIIHHMMHHHHMJJLKLKA...", "........ALKLKHMMMMMMMMMMMMJJKLKLA...", "........AKLKLHMMNMMMMMMNMMJJLKLKA...", "........ALKLKHMIIHHMMHHHHMJJKLKLA...", "........AKLKLHHHHHHMMHHHHJJJLKLKA...", ".......ADDDODJJJJJJMMJJJJJJJKLKLA...", ".......ADPODDJJJJJMNNMJJJJJJQQQQA...", ".......ADDDDDLKLKLKLKLKLKLKLDODDA...", "........AAAAAKLKLKLKLKLKLKLKPDODA...", "............ALKLKLKLKLKLKLKLAAAA....", "............AKLKLKLKLKLKLKLKA.......", ".............AGGGGGAAAGGGGGA........", ".............AGGGGGA.AGGGGGA........", "............AFFFFFFA.AFFFFFFA.......", "............AFFFFFFA.AFFFFFFA......."], ["................AABAABAABA..........", "...............ABBBCBBBCBBA.........", "..............ABBCBBBCBBBBBA........", "..............ABBBBBBBBBCBBA........", ".............ABBBBBBBBBBBBBBA.......", ".............ABCDDDDDDDDEECBA.......", "............ABBBAADDAADDEEBBBA......", ".............ABBRADDRADDEEBBA.......", "............ABBBFFFFFFFFFEBBA.......", ".............AAFFGGGFFFFFFBBBA......", ".............AAFFGGGFFFFFFBBA.......", "............AHAFFFFFFFFFFHAA........", "............AHIIHHHHJJJJJJJA........", "............AHHHHHHHJJJJJJJA........", ".........AAAAJJJJJJJJJJJJJJAAAAA....", "........AKLKLHHHHHHHHHHHHJJJLKLKA...", "........ALKLKHHIIIMNNMHHHJJJKLKLA...", "........AKLKLHHIIHHMMHHHHJJJLKLKA...", "........ALKLKHHIIHHMNHHHHJJJKLKLA...", "........AKLKLHMIIHHMMHHHHMJJLKLKA...", "........ALKLKHMMMMMMMMMMMMJJKLKLA...", "........AKLKLHMMNMMMMMMNMMJJLKLKA...", "........ALKLKHMIIHHMMHHHHMJJKLKLA...", "........AKLKLHHHHHHMMHHHHJJJLKLKA...", ".......ADDDODJJJJJJMMJJJJJJJKLKLA...", ".......ADPODDJJJJJMNNMJJJJJJQQQQA...", ".......ADDDDDLKLKLKLKLKLKLKLDODDA...", "........AAAAAKLKLKLKLKLKLKLKPDODA...", "............ALKLKLKLKLKLKLKLAAAA....", "............AKLKLKLKLKLKLKLKA.......", ".............AGGGGGAAAGGGGGA........", ".............AGGGGGA.AGGGGGA........", "............AFFFFFFA.AFFFFFFA.......", "............AFFFFFFA.AFFFFFFA......."]];
const WARLORD_B_COLORS: Record<string, string> = {"A": "#0c0c10", "B": "#1c1712", "C": "#3a2c22", "D": "#d9a07a", "E": "#a8714f", "F": "#18181c", "G": "#2c2c32", "H": "#8fa4bd", "I": "#d4e0ee", "J": "#566a82", "K": "#26292f", "L": "#4c515b", "M": "#e2b33a", "N": "#9a7516", "O": "#c8323c", "P": "#3a6a3a", "Q": "#c9ced6", "R": "#ff2a2a"};
const WL_SHIELD = [".KKKKKKKK.", "KggggggggK", "KgRRGGRRgK", "KgRRGGRRgK", "KgRRGGRRgK", "KgGGGGGGgK", "KgGGGGGGgK", "KgRRGGRRgK", "KgRrGGrRgK", ".KgRGGRgK.", ".KgrGGrgK.", "..KgGGgK..", "..KgggK...", "...KggK...", "....KK...."];
const WL_SHIELD_COLORS: Record<string, string> = {"K": "#0c0c10", "g": "#a8800f", "G": "#f0c030", "R": "#b8202c", "r": "#6e1218"};
const WL_SWORD = ["...K...", "..KWK..", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", ".KWWwK.", "KKKKKKK", "GGGGGGG", "KKKKKKK", "..KLK..", "..KLK..", "..KLK..", "..KLK..", ".KGGGK.", "..KKK.."];
const WL_SWORD_COLORS: Record<string, string> = {"K": "#0c0c10", "W": "#eef2f6", "w": "#9aa3b0", "G": "#f0c030", "L": "#4a2e1a"};
// =====================================================================================
// LEVEL 4: PAINTED WORLD (TOMBFELL)
// =====================================================================================
// Map letters only this level uses:
//   b  a BLACK BEAR: big and slow, takes two jumps on its back (the first one makes it angry and fast)
//   T  TOMBFELL's arena starts here (exactly one screen wide, keep it flat)
// In this level the w monsters are CATS (they crouch, then pounce at you) and the f monsters are
// DOVES (every second one swoops down at your head).
//
// TOMBFELL is a wizard: you can't jump on him and his spell shield eats your shots. It's ONE long
// fight in three parts, and every time he's hit the world gets "repainted" (new colours, new vines):
//   1. DOVES  he sends walls of doves across the screen. One dove in each wall is PINK: jump on it
//             and it flies back into him.
//   2. CATS   he stands on the ground while cats drop out of the trees. Jump on a cat and it curls
//             into a ball: walk into the ball to kick it at him.
//   3. BEAR   he rides a giant bear that charges across the screen. Jump over it: it crashes into
//             the tree, he falls off, and that's the only moment your shots hurt him.
const TOMB_PART_HP = 3; // hits he takes in each of the 3 parts (so 9 in total)
const TOMB_HP = TOMB_PART_HP * 3;
const TOMB_W = 36; // his picture on screen (18 x 24 pixels, drawn 2x)
const TOMB_H = 48;
const TOMB_AMMO = 4; // shots you get when the bear part starts (every crash drops more if you run low)
// Part 1: doves
const DOVE_WALL_GAP = 0.4; // seconds of rest once a wall has left the screen (only one wall flies at a time)
const DOVE_WALL_SPEED = 120; // how fast a wall flies (you run at 100)
const DOVE_WALL_SPEED_UP = 15; // faster after every hit
const DOVE_WALL_WARN = 0.7; // seconds the "!" blinks at the edge before a wall comes in
const DOVE_WALL_LOW = [98, 114]; // heights of a low wall (jump over it). The first one is the pink dove
const DOVE_WALL_HIGH = [62, 78]; // heights of a high wall (stay on the ground, or double jump onto the pink one)
// Part 2: cats
const TOMB_CAT_EVERY = 2; // seconds between cats dropping out of the trees
const TOMB_CAT_MAX = 2; // cats awake at the same time
const CAT_BALL_LIFE = 7; // seconds a curled-up cat waits to be kicked
const CAT_BALL_SPEED = 200; // how fast a kicked cat rolls
// Part 3: the giant bear
const GBEAR_W = 64; // the giant bear on screen (the bear picture drawn 4x)
const GBEAR_H = 40;
const GBEAR_SPEED = 150; // how fast it charges (you run at 100)
const GBEAR_SPEED_UP = 25; // faster after every hit
const GBEAR_PAW = 1; // seconds it stamps the ground before it runs (your warning)
const GBEAR_DIZZY = 3; // seconds they stay dizzy after a crash (your time to shoot)
// The animals on the way to him
const CAT_SPEED = 30; // sneaking
const CAT_SEE = 66; // how close you have to be before a cat crouches
const CAT_CROUCH = 0.45; // seconds it crouches before it pounces (your warning: its eyes turn red)
const CAT_LEAP_UP = -250;
const CAT_LEAP_SPEED = 130;
const CAT_REST = 1.3; // seconds between pounces
const BEAR_W = 32; // a black bear on screen (16 x 10 pixels, drawn 2x)
const BEAR_H = 20;
const BEAR_HP = 2; // jumps on its back (or shots) it takes
const BEAR_SPEED = 20;
const BEAR_ANGRY_SPEED = 62; // after the first hit
const PTS_BEAR = 300;
// The colours of his glitch (his robe, his shield, the sparks)
const GLITCH = ["#ff4fd8", "#3cf0ff", "#b6ff3c", "#ffb03c", "#7a5cff", "#ffffff"];
// The "painted" sky: the colours of his cover art. Every repaint slides along this list.
const WOODS_SKY = ["#1b1464", "#3a1d8a", "#6a2fb8", "#c63cc0", "#ff5a4a", "#ffb03c", "#d8ff6a", "#58e0c8", "#2a6ad8", "#e8d8ff"];
// Where the vines hang in his arena: [first column, how many columns, row]. Every hit picks the
// next set. (The bear part has no vines: nowhere to hide from it.)
const TOMB_VINES_DOVES: [number, number, number][][] = [
  [[3, 4, 5], [14, 4, 5]],
  [[8, 5, 5]],
  [[2, 3, 6], [9, 3, 4], [16, 3, 6]],
];
const TOMB_VINES_CATS: [number, number, number][][] = [
  [[6, 3, 6], [12, 3, 6]],
  [[9, 3, 5]],
  [[5, 4, 6], [12, 4, 6]],
];
type TombDove = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pink: boolean; // the one to jump on
  // fly = crossing the screen, home = flying back into him, flee = scared off (harmless), gone = remove it
  state: "fly" | "home" | "flee" | "gone";
  wait: number; // seconds until it comes in (the "!" blinks at the edge meanwhile)
  from: number; // 1 = comes in from the right edge, -1 = from the left
};
type TombCat = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dir: number; // -1 = looking left
  // drop = falling out of the tree, ball = curled up (kick it!), roll = kicked, gone = remove it
  act: "drop" | "walk" | "crouch" | "leap" | "ball" | "roll" | "gone";
  timer: number;
  kick: number; // a fresh ball can't be kicked for a moment
  bounces: number; // times a rolling ball has bounced off the edge of the screen
};
type Tomb = {
  x: number; // top-left of his picture
  y: number;
  hp: number;
  maxHp: number;
  part: 1 | 2 | 3; // 1 = doves, 2 = cats, 3 = bear
  hit: number; // flashes white after a hit
  dead: number; // counts down while he glitches away
  facing: number; // -1 = looking left
  busy: number; // short break after a hit (no new spell)
  cast: number; // seconds until his next spell (a dove wall / a cat)
  bump: number; // so the SHIELD! pop-up doesn't repeat every frame
  wallN: number; // counts his dove walls
  side: number; // part 2: where he stands (1 = right, -1 = left)
  doves: TombDove[];
  cats: TombCat[];
  // the giant bear: enter = walking in, paw = stamping (warning), charge = running, dizzy = crashed
  bear: null | { x: number; dir: number; act: "enter" | "paw" | "charge" | "dizzy"; timer: number };
  fallen: boolean; // part 3: he fell off the bear (now your shots hurt him)
  short?: boolean; // the quick fight in PINK RUN INFINITE: cats only, he never moves on to the bear
};

// ---- Level 4 pixel art. One letter = one pixel, the colours are listed right below each picture. ----
// TOMBFELL the backwood wizard (looking left). G and g are the glitch colours: they keep changing.
const TOMB_WIZ = [
  "........K.........",
  ".......KHK........",
  ".......KHHK.......",
  "......KHHHK.......",
  "......KHSHHK......",
  ".....KSSSSSK......",
  ".....KHSHSHHK.....",
  "..KKKKHHHHHHKKKK..",
  ".KGgGgGgGgGgGgGgK.",
  "..KKKFFFFFFFFKKK..",
  "....KFEEFFEEFK....",
  "....KFFFFFFFFK....",
  ".O..KhFFFFFFhK....",
  "OoO.KhhhhhhhhhK...",
  ".O.KhhGhhhhhghK...",
  ".B.KhhhGhhhghhK...",
  ".BKKhhhhGhghhhK...",
  ".BhhhhhhhghhhhK...",
  ".BKKhhhhGhhhhhK...",
  ".B.KhhhGhhghhhhK..",
  ".B.KhhGhhhhghhhK..",
  ".B.KhGhhhhhhghhK..",
  ".B.KhhhhhhhhhhhK..",
  ".B..KKKKKKKKKKK...",
];
const TOMB_WIZ_COLORS: Record<string, string> = { K: "#14101c", H: "#3b1f5a", h: "#5a2f8a", G: "#ff4fd8", g: "#3cf0ff", S: "#ffe14a", F: "#0c0812", E: "#7dffb0", B: "#6a4a2a", O: "#ffffff", o: "#ff4fd8" };
// A dove (looking left): wings up, wings down
const DOVE = [
  ["....WW.....", "...WWWW....", "...WWWWW...", "OWWWWWWWW..", ".WKWWWWWWWW", "..WWWWWWgg.", "...WWWWg...", "..........."],
  ["...........", "...........", "...........", "OWWWWWWWW..", ".WKWWWWWWWW", "..WWWWWWWg.", "...WWWWWg..", "....WWWg..."],
];
const DOVE_COLORS: Record<string, string> = { W: "#ffffff", g: "#c9d2e6", K: "#14101c", O: "#ffaa28" };
const DOVE_PINK_COLORS: Record<string, string> = { W: "#ff7ad9", g: "#ff2bd6", K: "#14101c", O: "#ffffff" };
// A cat (looking left): 2 walking pictures, crouching (red eyes), curled into a ball
const CAT = [
  [".K.K......K", ".KKK.....K.", ".YKY.....K.", ".KKKKKKKKK.", "..KKKKKKKK.", "..KKKKKKKK.", "..K.K..K.K.", "..K.K..K.K."],
  [".K.K.....K.", ".KKK.....K.", ".YKY....K..", ".KKKKKKKKK.", "..KKKKKKKK.", "..KKKKKKKK.", ".K..K.K..K.", "K...K.K...K"],
  ["...........", "...........", ".K.K.......", ".KKK....KK.", ".RKR...K...", ".KKKKKKKK..", "KKKKKKKKKK.", "KK.KK.KK.K."],
  ["...........", "...KKKK....", "..KKKKKK...", ".KKKKKKKK..", ".KKYKKYKK..", ".KKKKKKKK..", "..KKKKKK...", "...KKKK...."],
];
const CAT_COLORS: Record<string, string> = { K: "#1a1622", Y: "#ffe14a", R: "#ff3b3b" };
// A black bear (looking left): 2 walking pictures. The giant bear is the same picture drawn bigger.
const BEAR = [
  [".KK.K....KKKKK..", ".KKKK.KKKKKKKKK.", "KKWKKKKKKKKKKKKK", "BBKKKKKKKKKKKKKK", "BBKKKKKKKKKKKKKK", ".KKKKKKKKKKKKKKK", "..KKKKKKKKKKKKK.", "..KKKKKKKKKKKKK.", "..KKK.KK..KK.KK.", "..KK..KK..KK.KK."],
  [".KK.K....KKKKK..", ".KKKK.KKKKKKKKK.", "KKWKKKKKKKKKKKKK", "BBKKKKKKKKKKKKKK", "BBKKKKKKKKKKKKKK", ".KKKKKKKKKKKKKKK", "..KKKKKKKKKKKKK.", "..KKKKKKKKKKKKK.", ".KKK..KKKKK..KK.", ".KK....KKK...KKK"],
];
const BEAR_COLORS: Record<string, string> = { K: "#231a16", B: "#a8743c", W: "#ffffff" };
const BEAR_ANGRY_COLORS: Record<string, string> = { K: "#4a1a14", B: "#a8743c", W: "#ff2a2a" };
// Draws a picture with a thin light edge round it, so the dark animals still show against the dark woods
const RIM = "#9a8fb8";
const rimCache = new Map<Record<string, string>, Record<string, string>>();
function drawRimmed(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, colors: Record<string, string>, scale: number) {
  let rim = rimCache.get(colors);
  if (!rim) {
    rim = Object.fromEntries(Object.keys(colors).map((k) => [k, RIM]));
    rimCache.set(colors, rim);
  }
  drawPixels(ctx, rows, x - 1, y, rim, scale);
  drawPixels(ctx, rows, x + 1, y, rim, scale);
  drawPixels(ctx, rows, x, y - 1, rim, scale);
  drawPixels(ctx, rows, x, y, colors, scale);
}
// How big a monster is (for getting hit by shots)
const enemyW = (e: Enemy) => (e.kind === "bear" ? BEAR_W : e.kind === "flyer" ? 18 : 14);
const enemyH = (e: Enemy) => (e.kind === "bear" ? BEAR_H : 14);

// =====================================================================================
// THE WARLORD SWITCH
// =====================================================================================
// false = visitors of the real site see nothing of WARLORD COLOSSUS: Level 3 says "coming soon"
//         on the map and can't be played, and his skin and the three Level 3 boss cards are gone.
//         On your own computer (localhost) everything still shows, so you can keep working on it.
//         To see exactly what visitors see, open  http://localhost:3000/?visitor=1
// true  = everything is live for everyone. Change false to true the day he says yes.
const WARLORD_LIVE = false;
// What the map says on the Level 3 stop while it's hidden
const WARLORD_SOON_TEXT = "WARLORD LEVEL COMING SOON";
function warlordShown() {
  if (WARLORD_LIVE) return true;
  if (!localTesting()) return false;
  return new URLSearchParams(window.location.search).get("visitor") === null;
}
const WARLORD_SHOWN = warlordShown();
const WARLORD_STOP = ALL_LEVELS.findIndex((lv) => lv.zone === LEVEL_KEEP); // his stop on the map
// =====================================================================================
// THE TOMBFELL LEVEL SWITCH
// =====================================================================================
// false = visitors of the real site can't see or play Level 4 (Painted World): its stop on the map
//         is a plain "coming soon" cloud. On your own computer (localhost) it still shows, so you can
//         keep working on it. To see exactly what visitors see, open  http://localhost:3000/?visitor=1
// true  = the level is live for everyone. Change false to true the day it's ready.
// This is only about the LEVEL. TOMBFELL as a boss in PINK RUN INFINITE (at 15k grams) is live either way.
const TOMBFELL_LEVEL_LIVE = false;
function tombfellLevelShown() {
  if (TOMBFELL_LEVEL_LIVE) return true;
  if (!localTesting()) return false;
  return new URLSearchParams(window.location.search).get("visitor") === null;
}
const TOMBFELL_LEVEL_SHOWN = tombfellLevelShown();
const TOMBFELL_STOP = ALL_LEVELS.findIndex((lv) => lv.zone === LEVEL_WOODS); // its stop on the map
// The levels the game actually uses. Every level keeps its own number and its own stop on the map:
// while a level is hidden its place is simply empty ("coming soon").
const LEVELS: (LevelDef | undefined)[] = ALL_LEVELS.map((lv) =>
  (lv.zone === LEVEL_KEEP && !WARLORD_SHOWN) || (lv.zone === LEVEL_WOODS && !TOMBFELL_LEVEL_SHOWN) ? undefined : lv
);
const LEVELS_PLAYABLE = LEVELS.filter((lv) => !!lv).length;

const KEEP_IMAGES: Record<string, string> = {
  back: "data:image/png;base64,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",
  vines: "data:image/png;base64,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",
  grey: "data:image/png;base64,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",
  candles: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAVAAAACACAYAAABdoTFCAAABvElEQVR42u3YO0oDYRiG0S+Ti4iKQQsvIGJlYa0GtHIJgthbuAI3Y+MG3INVBMUVWNqIjaKEGMzVLigyGAbNCJ5TpfhJMQ95J/wRAAAAAAAAAAD/2uBid/ATZ9CJ7AppIQt79cJ3sdPOML4fpU46kV+nxJvSPxp0I1unxCMDyMaAAoxjQN3R5G+UBjrpxniUPsZrXx8Nkm4jSjvnqSE70xuRdJ6iN7kaEXVPMAethf1IOo/Rnt1MbfC6dBjFt4foTq3rlJPmynGUmrfRm1hMbdBYO4nKy030y/M65aRdrUWxdRf98lxUtk4LaS+37uXBoF+aicr22fDM8MPz/dWny9Pqcu3LF41yht+lk1b8nU7uQAEyMqAABhTAgAIYUAADCoABBTCgAAYUwIACGFAADCiAAQUwoAAGFAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAU7z7AlOmqMd6lAAAAAElFTkSuQmCC",
  title: "data:image/png;base64,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",
  echo: "data:image/png;base64,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",
};
const WARLORD_ROWS = WARLORD_LOOK === "A" ? WARLORD_A : WARLORD_B; // [0] = normal, [1] = angry (eyes glow)
const WARLORD_ROW_COLORS = WARLORD_LOOK === "A" ? WARLORD_A_COLORS : WARLORD_B_COLORS;

// The level map: stops (one per level) joined by a winding path, like a Mario world map.
// icon = the look of that stop. `path` = the corners walked on the way TO that stop from the one before.
// A stop is locked until you beat the level before it. Stops without a level yet say COMING SOON.
type MapIcon = "weed" | "snow" | "speaker" | "roof" | "cloud" | "tree" | "ship" | "coral" | "bong" | "skull" | "dove";
// The skull on the map (Level 3: Warlord's Keep), drawn 2x bigger
const MAP_SKULL = [".WWWWW.", "WWWWWWW", "WKKWKKW", "WKKWKKW", "WWWKWWW", ".WWWWW.", ".WKWKW."];
const MAP_NODES: { x: number; y: number; icon: MapIcon; path: [number, number][] }[] = [
  { x: 28, y: 128, icon: "weed", path: [] },
  { x: 84, y: 128, icon: "snow", path: [] },
  { x: 84, y: 80, icon: "skull", path: [] }, // Level 3: Warlord's Keep
  { x: 148, y: 80, icon: "dove", path: [] }, // Level 4: Painted World (TOMBFELL)
  { x: 148, y: 128, icon: "tree", path: [] },
  { x: 212, y: 128, icon: "ship", path: [] },
  { x: 212, y: 76, icon: "coral", path: [] },
  { x: 296, y: 104, icon: "bong", path: [[296, 76]] }, // the last one: a big bong, BOSS FIGHT
];
const MAP_BADGE: Record<MapIcon, string> = {
  weed: "#6fdc5a",
  snow: "#bfe8ff",
  speaker: "#ff9a3c",
  roof: "#8e3fb0",
  cloud: "#fbd3f3",
  tree: "#b06ce0",
  ship: "#c6b9d6",
  coral: "#3ec6c0",
  bong: "#ff5fe0",
  skull: "#8a1820",
  dove: "#6a3fb0",
};
const MAP_WALK_SPEED = 95;
const LEVEL_PROGRESS_KEY = "pinksuper-levels"; // { "1": best ms } for every level you finished
const LEVEL_TIME_BASE = 10000000; // a level time is saved on the scoreboard as LEVEL_TIME_BASE - milliseconds
const levelGameId = (n: number) => `super-l${n}`;
const fmtTime = (ms: number) => {
  const m = Math.floor(ms / 60000);
  const sec = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return `${m}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};
// The evil weed leaf (Level 1 boss), drawn 2x bigger
const EVIL_LEAF = [
  ".........KK..........",
  "........KGGK.........",
  "..KK....KGGK....KK...",
  ".KGGK...KGGK...KGGK..",
  ".KGgGK..KGGK..KGgGK..",
  "..KGgGK.KGgK.KGgGK...",
  "K..KGgGKKGgKKGgGK..KK",
  "KGK.KGgGKGgKGgGK.KGGK",
  ".KGGKKGGGGGGGGGKKGgK.",
  "..KGgGGGGGGGGGGGGgK..",
  "...KKGRRGGGGGRRGKK...",
  "....KGKRRGGGRRKGK....",
  "....KGGGGGGGGGGGK....",
  ".....KGKWKWKWKGK.....",
  "......KGKKKKKGK......",
  ".......KKGGGKK.......",
  ".........KgK.........",
  ".........KgK.........",
  "..........K..........",
];
const EVIL_COLORS = { K: "#141e0f", G: "#46aa3c", g: "#1e6428", R: "#ff283c", W: "#ffffff" };
const EL_W = 42;
const EL_H = 38;
// LEVEL 2 (snowy mountains): snowman walkers, crows, and the evil horned snowman boss
const SNOWMAN = ["..WWW..", ".WKWKW.", "..WOW..", "B.WWW.B", ".BWKWB.", "WWWKWWW", ".WWWWW."];
const SNOWMAN_COLORS = { W: "#fafcff", K: "#14141e", O: "#ff8c1e", B: "#6e4628" };
const CROW = [
  ["K.......K", "KK.....KK", ".KKK.KKK.", "..KKKKKOO", "..KRKKK..", "...KKK...", "........."],
  [".........", ".........", "..KKKKKOO", "..KRKKK..", ".KKK.KKK.", "KK.....KK", "K.......K"],
];
const CROW_COLORS = { K: "#1e1e28", O: "#ffaa28", R: "#ff323c" };
const EVIL_SNOWMAN = [
  "......R........R......",
  ".....RR........RR.....",
  ".....R..KKKKKK..R.....",
  ".....RKKKKKKKKKKR.....",
  "......KKKKKKKKKK......",
  ".....KKKKKKKKKKKK.....",
  "....KKKKKKKKKKKKKK....",
  ".....WWWWWWWWWWWW.....",
  "....WWRRWWWWWWRRWW....",
  "....WWWRRWWWWRRWWW....",
  "....WWWWWWOOWWWWWW....",
  "....WWWWWWOOOOWWWW....",
  "....WWKWKWKWKWKWWW....",
  ".....WWWWWWWWWWWW.....",
  "..B...WWWWWWWWWW...B..",
  "...B.WWWWWKWWWWWW.B...",
  "....BWWWWWWWWWWWWB....",
  "....WWWWWWKWWWWWWW....",
  "...WWWWWWWWWWWWWWWW...",
  "...WWWWWWWWKWWWWWWW...",
  "...WWWWWWWWWWWWWWWW...",
  "...WWWWWWWWKWWWWWWW...",
  "....WWWWWWWWWWWWWW....",
  ".....SSSSSSSSSSSS.....",
];
const EVIL_SNOWMAN_COLORS = { W: "#f5f8ff", K: "#14141e", R: "#dc1e28", O: "#ff8c1e", B: "#6e4628", S: "#aac3e1" };
const SN_W = 44;
const SN_H = 48;
const SNOWMAN_DAZE = 4; // seconds you get to jump on his head once he's out of hits
// The bong at the end of every level, drawn 2x bigger
const BONG = [
  "...KKKK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK.KK",
  "...KCcKKOK",
  "..KCCcCKK.",
  ".KCCBBcCK.",
  "KCBBBBBBCK",
  "KCBBWBBBCK",
  "KCBBBBBBCK",
  ".KCBBBBCK.",
  "..KKKKKK..",
];
const BONG_COLORS = { K: "#111111", C: "#b8f0d8", c: "#e8fff4", B: "#58b8ff", W: "#ffffff", O: "#ff7a00" };
const BONG_W = 20;
const BONG_H = 30;

// ---- The walking EYE (Pink Run only) and the little BONG it turns into when you stomp it ----
// The eye is your drawing from the Warlord level (the one with the black tentacles): 24 frames of it wiggling,
// 18x20 pixels, drawn at 1x. It looks the way it was drawn when he walks left, and gets flipped when he walks right.
const EYE_FRAMES: string[][] = [
  ["...........A......", "...........A......", ".........AA.......", "..A....AAA........", "..A....AA.........", "..A.....A..AAAAAA.", "...AAAA.AAAA.AAA..", "......A.ABA.A.....", "......AABBBA.....A", "A.AAA.ABBFBBA...AA", ".A..AABBFAFBBA.AA.", ".....AABBFBBA.A.A.", ".......ABBBA......", "......AAABAAA.....", ".....AAA.AA.AAAAA.", "...AAAAA..A.....A.", "...A......A.....A.", "...A......A.....A.", "....A...AA........", ".................."],
  ["..........A.......", "...........A......", "..A......AA.......", "..A.....AA........", "..A....AA.........", "..A.....A......AA.", "...AAA.AAA..AAAA..", "....A.A.ABAAA.....", "......AABBBA.....A", "A.AAA.ABBFBBA...AA", ".A..AABBFAFBBA.AA.", ".....AABBFBBA.A...", ".......ABBBAA.....", "......AAABA.AA....", ".....AAA.AAA.AAAA.", "...AAAA...A.....A.", "...A......A.....A.", "...A......A....A..", "....A...AA.....A..", "....A............."],
  ["..........A.......", "...........A......", "...A.....AA.......", "..AA....AA........", "..A....AA.........", "..A.....A......A..", "...AAA.AAA..AAAA..", "...AA.A.ABAAA....A", "......AABBBA....AA", "A.AAA.ABBFBBA...AA", ".A...ABBFAFBBA.AA.", "......ABBFBBA.A...", ".......ABBBAA.....", "......AAABA.AA....", "....AAAA.AAA.AAAA.", "...AAAA...A....AA.", "...A......A.....A.", "...AA....A.....A..", "...A.A..AA.....A..", "....A............."],
  ["..........A.......", "...........A......", "...A......AA......", "..AA.....AA.......", "...A...AA......A..", "...A....A......A..", "...AAA.AAA..AAAA..", "...AAAA.ABAAA....A", "......AABBBA....AA", "A.AAA.ABBFBBA..AA.", ".A...ABBFAFBBA.A..", "......ABBFBBA.A...", ".......ABBBAA.....", "......AAABA.AA....", "....AAA..AAA.AAAA.", "...AAAA...A....A..", "...A......A....A..", "....A....A.....A..", "....A..AA......A..", "....AA............"],
  [".........A........", "..........A.......", "...A......AA......", "...A.....AA.......", "...A...AAA.....A..", "...A....A......A..", "...AAA.AAA..AAAA..", "...AAAA.ABAAAAA..A", "......AABBBA....AA", "A.AAA.ABBFBBA..AA.", ".A...ABBFAFBBAA...", "......ABBFBBA.A...", ".......ABBBAA.....", "......AAABA.AAA...", "....AAA..AAA...AA.", "...AAA....A....A..", "...AA.....A....A..", "....A...AA.....A..", "....A..AA......A..", "....AA............"],
  [".........A........", "..........A.......", "...A......AA......", "...A.....AA.......", "...A....AA....AA..", "...A....A.....AA..", "...A...AAA..AAAA..", "...AAAA.ABAAAAA..A", "......AABBBA....AA", "A.A.A.ABBFBBA..AA.", ".A.A.ABBFAFBBAA...", "......ABBFBBA.A...", ".......ABBBAA.....", "....AAAAABA.AAA...", "....AAA..AAA...A..", "....A.....A....A..", "....A....A.....A..", ".....A..A......A..", "....AA.AA......A..", "....AA............"],
  ["........AA........", "..........A.......", "...A......AA......", "...AA.....A...A...", "....A...AA....A...", "...A....A.....AA..", "...A...AAA...AAA..", "...AAAA.ABAAAAA.AA", "......AABBBA...AAA", "A.A.A.ABBFBBA..A..", ".A.A.ABBFAFBBAA...", "......ABBFBBA.A...", ".......ABBBAAA....", "....AAAAABA.AAA...", "....AAA..AAA...A..", "....A.....A....A..", "....A....A....A...", "....AA..A.....A...", ".....A.AA......A..", "....AAA..........."],
  ["........A.........", ".........AA.......", "...A.....AAA......", "...AA.....AA..A...", "....A....AA...A...", "...A.....A....A...", "...A...AAA....A...", "...AAAA.ABAAAAA.A.", ".....AAABBBAA..AAA", "A.A.A.ABBFBBA.A..A", ".A.A.ABBFAFBBAA...", "......ABBFBBAA....", ".......ABBBAA.A...", "....AAAAABA.AAA...", "....AAA..AAA..A...", "....A....AA...AA..", "....A...A.....A...", "....A..AA.....A...", ".....A.AAA.....A..", "....AAA..........."],
  ["........A.........", ".........A........", "...A.....AA.......", "...AA.....AA.AA...", "....A....AA..AA...", "....A....A....A...", "...AA..AAA....A...", "...AAAA.ABAAAAA.A.", ".....AAABBBAA..AAA", "......ABBFBBAAA..A", "AAA.AABBFAFBBAA...", "...A..ABBFBBAA....", ".......ABBBAA.A...", "....AAAAABA.AAA...", "....AA...AAA..A...", "....AA...AA...A...", ".....A..A.....A...", ".....A.AA.....A...", ".....A..AA.....A..", "....AA............"],
  [".......A..........", "........AA........", "...A.....AA.......", "...AA.....AA.AA...", "....A....AA..AA...", "....A....A...AA...", "....A...AA...AA...", "....AAA.ABAAAAA.A.", "....AAAABBBAA..AA.", "......ABBFBBAAA..A", "AAA.AABBFAFBBAA...", "...A..ABBFBBAA....", ".......ABBBAA.A...", "....AAAAABA.AAA...", "....AA...AA...A...", "....AA...A....A...", "....AA..A.....A...", ".....A.AA.....A...", "....AA..AA.....A..", ".....A............"],
  [".......A..........", "........A.........", "........AAA.......", "..AAA.....AA.AA...", "....A....AA..A....", "....A....A...A....", "....A...AA...AA...", "....AAA.ABAAAAA...", "....AAAABBBAA..AA.", "......ABBFBBAAA.AA", "AAA.AABBFAFBBA...A", "...A.AABBFBBAA....", "......AABBBAA.A...", "....AAA.ABA.AAA...", "....AA...AA...A...", ".....A...A...A....", ".....AA.A....AA...", ".....A.AA.....AAA.", "...AAA...AA.......", ".....A............"],
  [".......A..........", "........A.........", "........AA........", "..AAA....AA..AA...", ".....A...AA..A....", "....AA....A..A....", "....A...AA...A....", "....AAA.ABAAAA.A..", "....AAAABBBAA.AAA.", "......ABBFBBAAA.A.", "AAA.AABBFAFBBA...A", "...A.AABBFBBAA....", "......AABBBAA.A...", "....AAA.ABA.AA....", "....AA...AA..A....", ".....A..AA...A....", ".....A..A....AA...", ".....AA.AA....AAA.", "...AAA...AA.......", ".................."],
  [".......A..........", ".......A..........", ".......AAA........", "..AAA....AA..AA...", ".....A...AA..A....", "....AA....A..A....", "....AA..AA...A....", "....A.A.ABAAAA....", "....AAAABBBAAA.AA.", "......ABBFBBAAA.A.", ".A...ABBFAFBBA..AA", "A.AAAAABBFBBAA...A", ".......ABBBAA.A...", ".....AAAABA.AA....", ".....A...AA..A....", ".....AA.AA...A....", ".....AA.A....AA...", ".....AA.AA....AAA.", "..AAAA....AA......", ".................."],
  ["........A.........", ".......A..........", ".......AAA........", "....A...AAA..AA...", "..AA.A...AA.AA....", "....AA....A.AA....", "....AA...A..AA....", ".....AA.ABAAA.....", ".....AAABBBA.A.A..", "......ABBFBBAAAAA.", ".A...ABBFAFBBA..AA", "A.AAAAABBFBBA....A", ".......ABBBAA.....", "......AAABA.AA....", ".....A...A...A....", "......A.A....A....", ".....AA.A....AA.AA", "..AA.AA.AA....AA..", "....AA....AA......", ".................."],
  ["........A.........", ".......A..........", ".......AA.........", "...AA...AA...AAA..", ".AAA.A...AA.AAA...", ".....A....A.AA....", ".....A...A..AA....", ".....AA.ABAAA.....", ".....AAABBBA.A.A..", "......ABBFBBAAAAA.", ".A...ABBFAFBBA..A.", "A.AAAAABBFBBA....A", ".....A.ABBBAA.....", "......AAABA.AA....", ".....AA..A...A....", ".....AA.A....A....", "......A.A....AAAAA", "..AAAAAA.AA.......", "...AA.....AA......", ".................."],
  ["........A.........", ".......A..........", "......AAA.........", ".......AAA...AA...", ".AAAAA...AA.AAAA..", "..A..A....A.AA....", ".....A...A..AA....", ".....AA.ABAAA.....", "......AABBBA.A.A..", "......ABBFBBAAAA..", ".A...ABBFAFBBA..A.", "A.AAAAABBFBBA...AA", ".....A.ABBBAA....A", "......AAABA.AA....", ".....AA..A...A....", ".....AA.A....A....", "......A.A....AAAAA", "..AAAAAA.AA.......", "...........AA.....", ".................."],
  [".........A........", "........A.........", "......AA..........", ".......AAA...AA...", ".AAAAA...AA.AAAA..", ".AA..A....A.A.....", ".....A...A..A.....", ".....AA.ABAAA.....", "......AABBBA.A....", "......ABBFBBAAAA..", ".A...ABBFAFBBA.AA.", "A.AAAAABBFBBA...AA", ".....A.ABBBAA....A", "......AAABA.AA....", ".....AA..A..A.....", ".....AAAA...A.....", "......A.AA...AAAAA", "..AAAAA...AA......", "...........AA.....", ".................."],
  [".........A........", "........A.........", "......AA..........", ".......AA.........", ".AAAAA..AA..AAAA..", ".AA..AA...A.A.....", ".....AA..A..A.....", ".....AA.ABAAA.....", "......AABBBA.A....", "......ABBFBBAAAA..", ".A.A.ABBFAFBBA.AA.", "A.A.AAABBFBBA...AA", ".....A.ABBBAA....A", "......AAABA.AA....", "......A..A..A.....", "......A.A...A..A..", "....AAAA.A...AAAAA", "..AAAAA...AA......", "...........AA.....", ".................."],
  ["..........A.......", "........AA........", "......AA..........", "......AAA.........", ".A..AA..AA..AAAA..", ".AAA.AA...AAA..AA.", ".....AA..A.AA.....", ".....AA.ABAAA.....", "......AABBBA.A....", "......ABBFBBAAA...", ".A.A.ABBFAFBBA.A..", "A.A.AAABBFBBA..AAA", ".....A.ABBBAA...AA", "......AAABA.A.....", "......A..A..AA....", "......A.A...A..AA.", "...AAAAA.A...AA..A", "..A..AA...AA......", "...........AA.....", ".................."],
  ["..........A.......", ".........A........", ".......AA.........", "......AA..........", ".A..AA.AA...AAAA..", ".AAA.AA..A.AAAAAA.", ".....AA..AAAA.....", ".....AA.ABA.A.....", "......AABBBA.A....", "......ABBFBBAA....", ".A.A.ABBFAFBBAAA.A", "A.A.AAABBFBBA..AAA", ".....A.ABBBA....A.", "......AAABAAA.....", "......AA.A..A.....", "......AA.A..AAAAA.", "...AAAAA..A......A", "..A........A......", "...........A......", ".................."],
  ["..........A.......", ".........A........", ".......AA.........", "......AA..........", ".A.....AA...AA....", ".AAAAAA..A.AAAAAA.", ".....AA..AAAA.....", "......A.ABA.A.....", "......AABBBA......", "...A..ABBFBBAA....", "AAA.AABBFAFBBAAA.A", "....AAABBFBBA..AAA", ".....A.ABBBA....A.", "......AAABAAA.....", "......AA.A..A...A.", "......AA.A..AAAAA.", "...AAAAA..A......A", "..AA.......A......", "..........AA......", ".................."],
  ["...........A......", ".........AA.......", ".......AAA........", "......AA..........", ".A.....AA.........", ".AAAAAA..A.AAAAAA.", "......A.AAAAA.....", "......A.ABA.A.....", "......AABBBA......", "...A..ABBFBBAA...A", "AAA.AABBFAFBBAAAAA", "....AAABBFBBA..AAA", ".....A.ABBBA....A.", "......AAABAAA.....", "......AA.AA.A...A.", "...AAAAA.A..AAAAA.", "...AAAAA..A......A", "..AA.......A......", "..A.......AA......", ".................."],
  ["...........A......", "..........A.......", "........AA........", "..A...AAA.........", ".AA....AA.........", ".AAAAAA..A.AAAAAA.", "....AAA.AAAAA.AA..", "......A.ABA.A.....", "......AABBBA......", "...A..ABBFBBAA...A", "AAA.AABBFAFBBA.AAA", ".....AABBFBBA.A.A.", ".......ABBBA......", "......AAABAAA.....", "......A.AAA.A.AAA.", "...AAAAA.A..AA..A.", "...AAAAA..A.....A.", "...A.......A....A.", "...A.....AA.......", ".................."],
  ["...........A......", "..........A.......", "........AA........", "..A....AA.........", ".AA....AA.........", ".AA..AA.A..AAAAAA.", "...AAAA.AAAA.AAA..", "......A.ABA.A.....", "......AABBBA.....A", "...A..ABBFBBAA..AA", "AAA.AABBFAFBBA..AA", ".....AABBFBBA.AAA.", ".......ABBBA......", "......AAABAAA.....", "......A.AAA.AAAAA.", "...AAAAA..A.....A.", "...A......A.....A.", "...A......A.....A.", "...A.....AA.......", ".................."],
];
const EYE_COLORS: Record<string, string> = { A: "#121216", B: "#cfd6df", F: "#8a93a1" };
const EYE_FPS = 12; // how fast the tentacles wiggle
// The little bong: the same bong as at the end of every level (tall glass tube, bowl on the side with the glowing ember, water bulb)
const MINI_BONG = [
  "...KKKK...",
  "...KCcK...",
  "...KCcK...",
  "...KCcK.KK",
  "...KCcKKOK",
  "..KCCcCKK.",
  ".KCCBBcCK.",
  "KCBBBBBBCK",
  "KCBBWBBBCK",
  ".KCBBBBCK.",
  "..KKKKKK..",
];
const EYE_PERCENT = 0.22; // how many of the walkers in Pink Run are eyes instead (0.22 = about 1 in 5)
const BONG_KICK_SPEED = 190; // how fast a kicked bong slides
const BONG_IDLE_LIFE = 14; // seconds a bong waits for a kick before it disappears
// Weedland colours
// Your own Weedland background. Put the picture at public/game/weedland-bg.png and it replaces the drawn sky,
// sun, hills and leaves. No file there = the game keeps using the drawn one. The picture is 4.2 times as wide
// as it is tall (like 2688x640) and wraps around, so make its left and right edges match.
const WEEDLAND_BG = "/game/weedland-bg.png";
// Your painted zone backgrounds. Each is a picture in public/game/ that replaces that zone's drawn background. It's scaled to the screen
// height, tiled and scrolled slowly, and it WIGGLES TO THE MUSIC: the page's beat makes it ripple and sway. To add another zone, put its
// picture in public/game/ and add a line here (the number is the zone: 0 = PINK FIELDS, 1 = SPEAKER HILLS, 2 = ROOFTOPS, 3 = PINK CLOUDS).
// If a picture file isn't there, that zone just keeps its drawn background.
//   sky = the sky colour of the painting (shows above and below it when the camera moves), parallax = how fast it scrolls (smaller = farther)
const PAINTED_BGS: Record<number, { src: string; sky: string; parallax: number }> = {
  0: { src: "/game/pinkfields-bg.png", sky: "#dceec1", parallax: 0.3 },
  1: { src: "/game/speakerhills-bg.png", sky: "#dceec1", parallax: 0.3 },
};
const FIELD_WIGGLE_BASE = 0.5; // pixels of sway while music plays, even between beats
const FIELD_WIGGLE_KICK = 2.6; // extra pixels on each beat (it settles back before the next one)
const FIELD_WIGGLE_RIPPLE = 0.11; // how tight the ripple is going down the picture (bigger = more waves)
const WEEDLAND_BG_PARALLAX = 0.3; // how fast it scrolls compared to the level (smaller = farther away)
const WL_SKY_TOP = "#c8f5b0";
const WL_SKY_BOTTOM = "#78cf6e";
const WL_SOIL = "#2d4a22";
const WL_GRASS = "#6fdc5a";

const SFX_VOL_KEY = "pinksuper-sfx-volume"; // 0..1, set with the slider under the speaker icon
// How much each cover background is washed out (brighter, less contrast) so the level is easy to see.
// Index = field (GAF, PSP, IPOD, TRIPPY, SPT, TOP SHELF, CORAL). 0 = the cover as it is.
const FIELD_WASH = [0.4, 0.38, 0.32, 0, 0.35, 0, 0];
// Covers that gently wiggle like a heat haze / water (all of them; set one to false to keep it still)
const FIELD_WIGGLE = [true, true, true, true, true, true, true];
const NAME_KEY = "pinkrun-name";
const DEVICE_KEY = "pinkrun-device";
const OWNER_KEY = "pinkrun-owner";

// ---------- Outfits (no accounts, everything lives in this browser) ----------
// Coins are just your lifetime grams total, added up every time you die. Some outfits
// cost coins, some unlock from an achievement. Add PNGs at the given paths to use them;
// until you do, that outfit just shows as a flat-colored dude (see OUTFIT_FALLBACK below).
type OutfitId = "classic" | "ghost" | "icy" | "og" | "toxic" | "bloody" | "shadow" | "gold" | "warlord";
// cost = price in gold coins (those outfits are sold in the shop and on the outfit screen).
// recolor = no PNG needed: the game repaints the classic picture by itself (see RECOLOR below).
//           If you ever draw your own, save it at the `file` path and your drawing is used instead.
type RecolorId = "toxic" | "bloody" | "shadow" | "gold";
type OutfitDef = { id: OutfitId; name: string; file: string; how: string; cost?: number; recolor?: RecolorId };
const ALL_OUTFITS: OutfitDef[] = [
  { id: "classic", name: "CLASSIC PINKMANE", file: "/game/pinkdude.png", how: "ALWAYS UNLOCKED" },
  { id: "og", name: "TRIPPY PINKMANE", file: "/game/pinkdude-pinkfit.png", how: "REACH SCORE 30000" },
  { id: "ghost", name: "GHOSTY PINKMANE", file: "/game/pinkdude-ghost.png", how: "BEAT A TROLL" },
  { id: "icy", name: "ICY PINKMANE", file: "/game/pinkdude-icy.png", how: "", cost: 100 },
  { id: "toxic", name: "TOXIC PINKMANE", file: "/game/pinkdude-toxic.png", how: "", cost: 150, recolor: "toxic" },
  { id: "bloody", name: "BLOODY PINKMANE", file: "/game/pinkdude-bloody.png", how: "", cost: 200, recolor: "bloody" },
  { id: "shadow", name: "SHADOW PINKMANE", file: "/game/pinkdude-shadow.png", how: "", cost: 300, recolor: "shadow" },
  { id: "gold", name: "GOLD PINKMANE", file: "/game/pinkdude-gold.png", how: "", cost: 500, recolor: "gold" },
  // Play as WARLORD (the look with his hair and mask). Made from pixel art in this file (see makeWarlordSprite), no PNG needed.
  { id: "warlord", name: "WARLORD COLOSSUS", file: "/game/pinkdude-warlord.png", how: "", cost: 700 },
];
// The outfits the game actually uses (without the WARLORD skin while he's hidden, see THE WARLORD SWITCH)
const OUTFITS: OutfitDef[] = ALL_OUTFITS.filter((o) => WARLORD_SHOWN || o.id !== "warlord");
// What the outfit screen says when it's still locked
const howToGet = (o: OutfitDef) => (o.id === "warlord" ? `${o.cost} COINS OR GOLD IN LVL ${WARLORD_SKIN_LEVEL}` : o.cost ? `BUY FOR ${o.cost} COINS` : o.how);
// Gold coins: some of the weed leaves in the level are gold coins instead (about 1 in 14).
// Leaves are only for your score; coins are what you spend on outfits.
const COIN_CHANCE = 0.07;
const OG_SCORE_UNLOCK = 30000;
const OUTFIT_FALLBACK: Record<OutfitId, string> = {
  classic: "#d63cc8",
  og: "#d63cc8",
  ghost: "#bfe9d8",
  icy: "#8fd9ff",
  toxic: "#6fdc5a",
  bloody: "#d21e1e",
  shadow: "#3b2456",
  gold: "#ffd700",
  warlord: "#3b404b",
};
// ---------- BOBO's skins (the same looks Pinkmane has, just for his dog) ----------
// Every outfit has a BOBO version. The ones Pinkmane BUYS cost BOBO_SKIN_COST_MULT times as much for BOBO; the ones Pinkmane EARNS
// (TRIPPY, GHOSTY) unlock for BOBO by themselves once you have them. The colours are BOBO's picture recoloured:
// W = his main fur, g = his shading, P = his tongue, K = his outline and eyes.
const BOBO_SKIN_COST_MULT = 0.5;
const PET_SKIN_KEY = "pinksuper-bobo-skin"; // which skin BOBO is wearing
const PET_SKINS_KEY = "pinksuper-bobo-skins"; // JSON array of the BOBO skins you bought
const BOBO_SKIN_COLORS: Partial<Record<OutfitId, Record<string, string>>> = {
  classic: { K: "#111111", W: "#ffffff", g: "#d9d9e6", P: "#ff5fc8" },
  og: { K: "#111111", W: "#ffc2ee", g: "#e08fd0", P: "#8a1f86" },
  ghost: { K: "#111111", W: "#d6fff0", g: "#a9e3cf", P: "#ff9fd8" },
  icy: { K: "#111111", W: "#dff5ff", g: "#8fd9ff", P: "#ff8fd0" },
  toxic: { K: "#111111", W: "#b8ff9a", g: "#6fdc5a", P: "#ff5fc8" },
  bloody: { K: "#111111", W: "#ff6a6a", g: "#b01818", P: "#ffd0d0" },
  shadow: { K: "#0a0612", W: "#7a5aa8", g: "#3b2456", P: "#ff5fc8" },
  gold: { K: "#111111", W: "#ffe680", g: "#e0b020", P: "#ff5fc8" },
  warlord: { K: "#0a0a0e", W: "#5a606e", g: "#3b404b", P: "#c8323a" },
};
const boboSkinName = (o: OutfitDef) => (o.id === "warlord" ? "WARLORD BOBO" : o.name.replace("PINKMANE", "BOBO"));
const boboSkinCost = (o: OutfitDef) => Math.max(1, Math.round((o.cost ?? 0) * BOBO_SKIN_COST_MULT));
const COINS_KEY = "pinksuper-goldcoins"; // gold coins you have (spent in the shop)
const UNLOCKED_KEY = "pinksuper-outfits"; // JSON array of unlocked outfit ids
const OUTFIT_KEY = "pinksuper-outfit"; // currently worn outfit id

// ---------- PINK SHOP (on the pink start screen: press UP, then OK) ----------
// Spells you can buy with gold coins. Once you own one, its leaf can pop out of the ? boxes and
// you can pick it before a boss fight. Change `cost` to change the price.
type SpellId = "spike";
type SpellDef = { id: SpellId; name: string; cost: number; info: [string, string] };
const SHOP_SPELLS: SpellDef[] = [
  { id: "spike", name: "SPIKE SHOT", cost: 200, info: ["SHOOTS SPIKES IN EVERY DIRECTION", "IN THE STASH BOXES + AT BOSS FIGHTS"] },
];
// Greyed-out lines under the spells (just text for now: add or remove names as you like)
const SHOP_SOON = ["MORE SPELLS"];
const SPELLS_KEY = "pinksuper-spells"; // JSON array of the spells you bought
// The shop's list, top to bottom. Every outfit with a `cost` shows up under SKINS by itself.
type ShopRow =
  | { kind: "head"; label: string }
  | { kind: "spell"; spell: SpellDef }
  | { kind: "soon"; label: string }
  | { kind: "skin"; outfit: OutfitDef }
  | { kind: "bskin"; outfit: OutfitDef }
  | { kind: "back" };
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "SPELLS" },
  ...SHOP_SPELLS.map((spell): ShopRow => ({ kind: "spell", spell })),
  ...SHOP_SOON.map((label): ShopRow => ({ kind: "soon", label })),
  { kind: "head", label: "SKINS" },
  ...OUTFITS.filter((o) => !!o.cost).map((outfit): ShopRow => ({ kind: "skin", outfit })),
  { kind: "head", label: "BOBO SKINS" },
  ...OUTFITS.map((outfit): ShopRow => ({ kind: "bskin", outfit })),
  { kind: "back" },
];
const SHOP_VISIBLE = 11; // rows that fit on the screen (a longer list scrolls)
const SHOP_TOP = 18; // y of the first row
const SHOP_ROW_H = 9;

// ---------- BOSS CARDS ----------
// Every boss has a card. It pops up (and freezes the game) right before his fight, and once you
// beat him the card is yours: see them all under CARDS on the pink start screen.
// name = on top of the card, moves = the lines under his picture (max 3, about 17 letters each),
// weak = how you beat him, where = shown on the grey locked card.
// color / sky / ground = the card's colours.
// main: true = a MAIN BOSS: his card blinks and a light runs round its gold edge.
type BossId = "troll" | "giant" | "leaf" | "snowman" | "horned" | "skeleton" | "runknight" | "warlord" | "tombfell"; // runknight = the red skeleton of the infinite run
type BossCard = { id: BossId; main?: boolean; name: string; moves: string[]; weak: string; where: string; color: string; sky: string; ground: string };
const ALL_BOSS_CARDS: BossCard[] = [
  { id: "troll", name: "TROLL", moves: ["CHASES YOU DOWN", "JUMPS AT YOU"], weak: "WEAK: YOUR SHOTS", where: "INFINITE RUN", color: "#8fce5a", sky: "#d7efbc", ground: "#2e9e3a" },
  { id: "giant", name: "GIANT", moves: ["BIGGER + TOUGHER", "GETS BACK UP"], weak: "WEAK: SHOTS+STOMP", where: "INFINITE RUN", color: "#b06ce0", sky: "#e6d3f7", ground: "#4a2a6a" },
  { id: "leaf", main: true, name: "EVIL LEAF", moves: ["FLIES ABOVE YOU", "DIVES AT YOU"], weak: "WEAK: YOUR SHOTS", where: "LEVEL 1", color: "#5ab85a", sky: "#c8f5b0", ground: "#2d4a22" },
  { id: "snowman", main: true, name: "EVIL SNOWMAN", moves: ["COLD HORNED BRUTE", "GETS DIZZY"], weak: "WEAK: SHOTS+STOMP", where: "LEVEL 2 + INFINITE RUN", color: "#8fc8ee", sky: "#dff2ff", ground: "#ffffff" },
  { id: "horned", name: "HORNED WARRIOR", moves: ["SWINGS HIS MACE", "RAGES WHEN HURT"], weak: "WEAK: YOUR SHOTS", where: "LEVEL 3", color: "#c8684a", sky: "#3a1418", ground: "#55505a" },
  { id: "skeleton", name: "SKELETON KNIGHT", moves: ["LONG SWORD SLASH", "ARMOUR EATS SHOTS"], weak: "WEAK: HEAD STOMP", where: "LEVEL 3", color: "#b9b2c8", sky: "#2a1a2e", ground: "#55505a" },
  { id: "runknight", name: "RED SKELETON", moves: ["LONG SWORD SLASH", "ARMOUR EATS SHOTS"], weak: "WEAK: HEAD STOMP", where: "INFINITE RUN", color: "#d0505a", sky: "#2a0d14", ground: "#55303a" },
  { id: "warlord", main: true, name: "WARLORD COLOSSUS", moves: ["GIANT SWORD SLAM", "FLOOR SHOCKWAVES", "EYE SOUND WAVES"], weak: "WEAK: HEAD STOMP", where: "LEVEL 3", color: "#d23a3a", sky: "#200a10", ground: "#55505a" },
  { id: "tombfell", main: true, name: "TOMBFELL", moves: TOMBFELL_LEVEL_SHOWN ? ["WALLS OF DOVES", "POUNCING CATS", "RIDES A GIANT BEAR"] : ["SPELL SHIELD EATS SHOTS", "POUNCING CATS"], weak: "WEAK: HIS OWN PETS", where: TOMBFELL_LEVEL_SHOWN ? "LEVEL 4" : "INFINITE RUN", color: "#b06ce0", sky: "#241446", ground: "#3f6b3a" },
];
// The cards the game actually uses (without the three Level 3 bosses while WARLORD is hidden)
const BOSS_CARDS: BossCard[] = ALL_BOSS_CARDS.filter((c) => WARLORD_SHOWN || !["horned", "skeleton", "warlord"].includes(c.id));
const CARDS_KEY = "pinksuper-cards"; // JSON array of the boss cards you won
const CARD_W = 164;
const CARD_H = 148;
// The boss's own pixel picture (the giant is the troll drawn bigger)
function bossArt(id: BossId): { rows: string[]; colors: Record<string, string>; scale: number } {
  if (id === "troll") return { rows: TROLL, colors: TROLL_COLORS, scale: 2 };
  if (id === "giant") return { rows: GIANT_ROWS, colors: GIANT_COLORS, scale: 3 };
  if (id === "leaf") return { rows: EVIL_LEAF, colors: EVIL_COLORS, scale: 2 };
  if (id === "snowman") return { rows: EVIL_SNOWMAN, colors: EVIL_SNOWMAN_COLORS, scale: 2 };
  if (id === "horned") return { rows: KN_HORNED, colors: KN_HORNED_COLORS, scale: 2 };
  if (id === "skeleton") return { rows: KN_SKEL[0], colors: KN_SKEL_COLORS, scale: 2 };
  if (id === "runknight") return { rows: KN_SKEL[0], colors: KN_SKEL_RUN_COLORS, scale: 2 };
  if (id === "tombfell") return { rows: TOMB_WIZ, colors: TOMB_WIZ_COLORS, scale: 2 };
  return { rows: WARLORD_ROWS[0], colors: WARLORD_ROW_COLORS, scale: 2 };
}
// Writes text centred on cx. If it's wider than maxW it gets squeezed until it fits,
// so a long line can never stick out of its box.
function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number) {
  const w = ctx.measureText(text).width;
  if (w <= maxW) {
    ctx.fillText(text, cx, y);
    return;
  }
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(maxW / w, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
// Draws one card with its top-left corner at x, y. owned = false draws the grey locked card.
// t = the game clock (for the main bosses' shine).
function drawBossCard(ctx: CanvasRenderingContext2D, card: BossCard, x: number, y: number, owned: boolean, t = 0) {
  const shiny = owned && !!card.main;
  const ink = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = ink;
  ctx.fillRect(x - 1, y - 1, CARD_W + 2, CARD_H + 2);
  ctx.fillStyle = owned ? (shiny && Math.floor(t * 4) % 2 === 0 ? "#ffe27a" : "#f0c030") : "#8a8a8a"; // the border
  ctx.fillRect(x, y, CARD_W, CARD_H);
  ctx.fillStyle = owned ? card.color : "#5a5a5a";
  ctx.fillRect(x + 4, y + 4, CARD_W - 8, CARD_H - 8);
  // his name
  ctx.fillStyle = owned ? ink : "#2a2a2a";
  fitText(ctx, owned ? card.name : "? ? ?", x + CARD_W / 2, y + 7, CARD_W - 14);
  // his picture
  const wx = x + 8;
  const wy = y + 18;
  const ww = CARD_W - 16;
  const wh = 68;
  ctx.fillStyle = ink;
  ctx.fillRect(wx - 1, wy - 1, ww + 2, wh + 2);
  ctx.fillStyle = owned ? card.sky : "#6e6e6e";
  ctx.fillRect(wx, wy, ww, wh);
  ctx.fillStyle = owned ? card.ground : "#606060";
  ctx.fillRect(wx, wy + wh - 6, ww, 6);
  ctx.save();
  ctx.beginPath();
  ctx.rect(wx, wy, ww, wh);
  ctx.clip();
  const art = bossArt(card.id);
  const aw = art.rows[0].length * art.scale;
  const ah = art.rows.length * art.scale;
  const ax = Math.round(wx + ww / 2 - aw / 2);
  // stands on the ground strip; if he's too tall for the window you see him from the head down
  const ay = ah > wh - 4 ? wy + 2 : wy + wh - 4 - ah;
  const shadow: Record<string, string> = {};
  Object.keys(art.colors).forEach((k) => (shadow[k] = "#2c2c2c"));
  drawPixels(ctx, art.rows, ax, ay, owned ? art.colors : shadow, art.scale);
  ctx.restore();
  // his moves
  ctx.fillStyle = owned ? "rgba(255, 255, 255, 0.72)" : "#4a4a4a";
  ctx.fillRect(x + 8, y + 90, CARD_W - 16, 33);
  ctx.fillStyle = owned ? ink : "#a0a0a0";
  (owned ? card.moves : ["BEAT THIS BOSS", "TO GET HIS CARD"]).slice(0, 3).forEach((m, i) => fitText(ctx, m, x + CARD_W / 2, y + 93 + i * 10, CARD_W - 22));
  // how to beat him (or, on a locked card, where he lives)
  ctx.fillStyle = owned ? ink : "#2a2a2a";
  fitText(ctx, owned ? card.weak : card.where, x + CARD_W / 2, y + 129, CARD_W - 14);
  if (shiny) {
    // MAIN BOSS: two lights chase each other round the gold edge, and the corners sparkle
    const w = CARD_W - 4;
    const h = CARD_H - 4;
    const round = 2 * (w + h);
    const edge = (d: number): [number, number] => {
      let p = ((d % round) + round) % round;
      if (p < w) return [x + p, y];
      p -= w;
      if (p < h) return [x + w, y + p];
      p -= h;
      if (p < w) return [x + w - p, y + h];
      return [x, y + h - (p - w)];
    };
    for (const start of [0, round / 2]) {
      for (let d = 0; d < 44; d += 4) {
        const [ex, ey] = edge(t * 170 + start + d);
        ctx.fillStyle = d > 30 ? "#ffffff" : "#fff3a0";
        ctx.fillRect(Math.round(ex), Math.round(ey), 4, 4);
      }
    }
    const corners: [number, number][] = [[x - 2, y - 2], [x + CARD_W + 1, y - 2], [x - 2, y + CARD_H + 1], [x + CARD_W + 1, y + CARD_H + 1]];
    corners.forEach(([sx, sy], i) => {
      if (Math.floor(t * 6 + i * 1.5) % 3 !== 0) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx - 3, sy, 7, 1);
      ctx.fillRect(sx, sy - 3, 1, 7);
    });
  }
}

// ---------- Skins made from the classic picture ----------
// Colour maths: red/green/blue (0-255) <-> hue (0-360), saturation (0-1), lightness (0-1)
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] = hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}
function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}
// Picks a colour from a list of colours going from dark to light (t = 0..1)
function colorRamp(stops: string[], t: number): [number, number, number] {
  const p = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(p));
  const a = hexToRgb(stops[i]);
  const b = hexToRgb(stops[i + 1]);
  const k = p - i;
  return [Math.round(a[0] + (b[0] - a[0]) * k), Math.round(a[1] + (b[1] - a[1]) * k), Math.round(a[2] + (b[2] - a[2]) * k)];
}
// RECOLOR: what each made-up skin does to one pixel of the classic picture.
// "hair" = the pink mane, "skin" = the yellow face and hands. Everything else stays as it is
// (except SHADOW and GOLD, which repaint the whole dude).
function recolorPixel(kind: RecolorId, r: number, g: number, b: number): [number, number, number] {
  const [h, s, l] = rgbToHsl(r, g, b);
  const hair = s > 0.25 && h >= 270 && h <= 345;
  const skin = s > 0.5 && h >= 30 && h <= 65;
  if (kind === "toxic") {
    // slime-green mane, sickly green face
    if (hair) return hslToRgb(105, Math.min(1, s * 1.05), l);
    if (skin) return hslToRgb(80, s * 0.7, Math.min(0.82, l * 1.3));
    return [r, g, b];
  }
  if (kind === "bloody") {
    // blood-red mane, pale face
    if (hair) return hslToRgb(355, Math.min(1, s * 1.2), l * 0.88);
    if (skin) return hslToRgb(28, 0.3, Math.min(0.9, l * 1.65));
    return [r, g, b];
  }
  if (kind === "shadow") {
    // a dark purple shadow with glowing pink eyes
    if (l > 0.9) return hexToRgb("#ff5fe0");
    return colorRamp(["#0a0510", "#3b2456", "#6a4a8c"], l);
  }
  // gold: a golden statue
  if (l < 0.12) return hexToRgb("#3a2600");
  return colorRamp(["#6b4a00", "#c89400", "#ffd700", "#fff3a0"], l);
}
// Repaints a whole picture and hands back the new one (null if the browser won't allow it)
function recolorSprite(src: HTMLImageElement, kind: RecolorId): HTMLImageElement | null {
  try {
    const c = document.createElement("canvas");
    c.width = src.naturalWidth;
    c.height = src.naturalHeight;
    const cx = c.getContext("2d");
    if (!cx) return null;
    cx.drawImage(src, 0, 0);
    const data = cx.getImageData(0, 0, c.width, c.height);
    const d = data.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue; // see-through pixel
      const [r, g, b] = recolorPixel(kind, d[i], d[i + 1], d[i + 2]);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    cx.putImageData(data, 0, 0);
    const out = new Image();
    out.src = c.toDataURL("image/png");
    return out;
  } catch {
    return null;
  }
}
// ---------- WARLORD skin ----------
// Built from WARLORD_B (the one with his hair, face mask and gold cross), at your size. The armoured
// one with the crown stays the boss only. It makes the same kind of picture as pinkdude.png: 2 walking frames side by side.
// If you ever draw your own, save it as /game/pinkdude-warlord.png and that one is used instead.
function makeWarlordSprite(): HTMLImageElement | null {
  try {
    // he's drawn facing left and you face right, so mirror him
    const rows = WARLORD_B[0].map((r) => r.split("").reverse().join(""));
    // he's a bit wider than you: keep the 24 columns that have the most of him in them
    let from = 0;
    let best = -1;
    for (let start = 0; start + SPRITE_W <= rows[0].length; start++) {
      let n = 0;
      for (const r of rows) for (let col = start; col < start + SPRITE_W; col++) if (r[col] !== ".") n++;
      if (n > best) {
        best = n;
        from = start;
      }
    }
    const stand = rows.map((r) => r.slice(from, from + SPRITE_W));
    // second walking frame: his feet take a small step
    const step = stand.map((r, i) => (i >= stand.length - 3 ? "." + r.slice(0, SPRITE_W - 1) : r));
    const c = document.createElement("canvas");
    c.width = SPRITE_W * 2;
    c.height = SPRITE_H;
    const cx = c.getContext("2d");
    if (!cx) return null;
    const top = SPRITE_H - stand.length; // feet on the bottom edge, like yours
    drawPixels(cx, stand, 0, top, WARLORD_B_COLORS, 1);
    drawPixels(cx, step, SPRITE_W, top, WARLORD_B_COLORS, 1);
    const out = new Image();
    out.src = c.toDataURL("image/png");
    return out;
  } catch {
    return null;
  }
}

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

const SCREEN = "#d7efbc";
const HILLS = "#c3e2a3";
const INK = "#111111";
const PINK = "#d63cc8";
const DARK_PINK = "#8a1f86";
const GREEN = "#2e9e3a";
const DARK_GREEN = "#1b6b25";
const LIGHT_GREEN = "#6fdc5a";
const ROOF = "#6a2a8a";
const ROOF_LINE = "#8e3fb0";
const CLOUD = "#fdeefb";
const CLOUD_SKY = "#f3d3ee";
// A different accent tint for each Void room (index matches buildVoid's "which"), so the
// rooms feel a bit less identical even though the wave pattern is the same
// SoundCloud Void colours: a random one every time you go in (never the same twice in a row)
const VOID_PALETTES: { bg: string; a: string; b: string; ink: string }[] = [
  { bg: "#c23d93", a: "#ff7fd0", b: "#e25cb4", ink: "#ffffff" }, // pink
  { bg: "#1e0c2e", a: "#4a1f6a", b: "#33144d", ink: "#ffffff" }, // dark purple
  { bg: "#0b2414", a: "#1f5a33", b: "#154226", ink: "#ffffff" }, // dark green
  { bg: "#0b1433", a: "#1f3a7a", b: "#152a5c", ink: "#ffffff" }, // dark blue
];
// Twisted Trees
const TREE_SKY = "#c9a9e8";
const TREE_FAR = "#a57fcf";
const TREE_NEAR = "#5b3a86";
const TREE_SOIL = "#2a1640";
const TREE_TOP = "#b06ce0";
const TREE_ROOT = "#4a2a6a";
// Smoke Ocean
const SMOKE_SKY = "#a797ba";
const SMOKE_SEA = "#c6b9d6"; // the sea of smoke (you fall through it)
const SMOKE_SEA_DARK = "#b2a2c6";
const SMOKE_STREAK = "#d9cfe6";
const SMOKE_LIGHT = "#fbf8fd"; // smoke you can stand on
const SMOKE_SHADE = "#e6ddf0";
const SMOKE_EDGE = "#7f6a9a";
const BOOM = [PINK, "#ffc800", INK, "#777777", "#ffffff"];
const FIRE = ["#ff7a00", "#ffc800", "#d21e1e", "#ffffff"];
const ICE = ["#4aa3ff", "#bfe3ff", "#1d4fa8", "#ffffff"];
const TURQ = ["#3de0c8", "#b8fff3", "#138a7a", "#ffffff"];
const SPIKE = ["#c070ff", "#f0d8ff", "#6a2a9a", "#ffffff"];
// Leaf colours for each power-up: [main, dark]
const POWER_COLORS: Record<PowerKind, [string, string]> = {
  fire: ["#ff7a00", "#d21e1e"],
  ice: ["#4aa3ff", "#1d4fa8"],
  double: ["#3de0c8", "#138a7a"],
  spike: ["#b050f0", "#5a1a8a"],
};
// The spark colours that go with a spell / a shot
const powerSparks = (kind: string) => (kind === "spike" ? SPIKE : kind === "ice" ? ICE : kind === "double" ? TURQ : FIRE);
const shotSparks = (f: Fireball) => (f.pet ? PET_SPARKS : f.spike ? SPIKE : f.ice ? ICE : FIRE);
// The little shot icons at the top of the screen: [main colour, shine]
const hudShot = (power: string): [string, string] =>
  power === "spike" ? ["#b050f0", "#ffffff"] : power === "ice" ? ["#4aa3ff", "#ffffff"] : ["#ff7a00", "#ffc800"];

// Haters: grumpy grey clouds that walk around (drawn 2x bigger)
const HATER = [
  ".GG.GG.",
  "GGGGGGG",
  "GKKGKKG",
  "GWKGWKG",
  "GGGGGGG",
  "GGKKKGG",
  ".G.G.G.",
];
// Green flying monster (two wing frames, drawn 2x bigger)
const FLYER = [
  [
    "GG.....GG",
    "GGG...GGG",
    ".GGDDDGG.",
    "..DWDWD..",
    "..DDDDD..",
    "...D.D...",
    ".........",
  ],
  [
    ".........",
    "...DDD...",
    "..DWDWD..",
    "GGDDDDDGG",
    "GGG.D.GGG",
    "GG.....GG",
    ".........",
  ],
];
const LEAF = [
  "...G...",
  "..GGG..",
  "G.GGG.G",
  "GGGGGGG",
  ".GGGGG.",
  "...D...",
  "...D...",
];
const HEART = [
  ".PP.PP.",
  "PPPPPPP",
  "PPPPPPP",
  ".PPPPP.",
  "..PPP..",
  "...P...",
];
// The jetpack you can find at the start (drawn 2x bigger). O/Y = flames.
const JETPACK = [
  "..K...K..",
  ".KPK.KPK.",
  "KPPPKPPPK",
  "KPWPKPWPK",
  "KPPPKPPPK",
  "KPPPKPPPK",
  "KpppKpppK",
  "KgggKgggK",
  ".KgK.KgK.",
];
// Small version worn on your back, with its flame
const JET_SMALL = [".KKK.", "KPPPK", "KPWPK", "KPPPK", "KPPPK", "KpppK", "KgggK", ".KgK."];
const JET_SMALL_FLAME = ["..O..", ".OYO.", "..O..", "..Y.."];
// Ghost ship on the Smoke Ocean: a boat full of skeletons (drawn 2x bigger)
const BOAT = [
  "...............M..............",
  "...............MSSSS..........",
  "...............MSSSSS.........",
  "...............MSS.SS.........",
  "...............MSSSS..........",
  "...............MS.SS..........",
  "...............MS..S..........",
  "...............M..............",
  "...WWW.........M.......WWW....",
  "..WKWKW..WWW...M......WKWKW...",
  "..WWWWW.WKWKW..M......WWWWW...",
  "...W.W..WWWWW..M.......W.W....",
  ".W..W....W.W...M........W..W..",
  "..WWWWW...W....M......WWWWW...",
  "....W...WWWWW..M........W.....",
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  ".KbbbbbbbbbbbbbbbbbbbbbbbbbbK.",
  "..KBBBBBBBBBBBBBBBBBBBBBBBBK..",
  "...KbbbbbbbbbbbbbbbbbbbbbbK...",
  "....KKKKKKKKKKKKKKKKKKKKKK....",
];
// The troll boss (drawn 2x bigger, faces left). T = his tongue sticking out.
const TROLL = [
  "......KKKKKK..........",
  "....KKGGGGGGKK........",
  "...KGGLLGGGGGGK.......",
  "..KGGLGGGGGGGGGK......",
  ".KGGWWKGGGWWKGGgK.....",
  ".KGGWEKGGGWEKGGgK.....",
  "KgGGGGGGGGGGGGGgK.....",
  "KGGKKKKKKKGGGGgK......",
  "KGKTTTTTTKGGGgKK......",
  ".KTTTTttTKKKKKRRK.....",
  ".KTTTttTKGRRBBBRRK....",
  "..KTTtTKGGRBBbBBRgK...",
  "..KKTTKGGRBBBBBBRGGK..",
  ".KGGKKGGRRBBbBBBRRGGK.",
  ".KGGGGKGRLLLLLLLRRGGK.",
  "KCCKGGKRLLGGGGGLLRRGK.",
  "KCcCKKRRLGGGgGGGLRRK..",
  ".KCcCKRLGGGGGGGgGLRK..",
  "..KCcKNNNNNNNNNNNNNK..",
  "...KCKGGGGGbbbGGGGGK..",
  "...KCcKGGGK...KGGGK...",
  "....KCKGGGK...KGGGK...",
  "....KCKgGGGK..KgGGGK..",
  "....KKKKKKKK..KKKKKK..",
];
const TROLL_RIGHT = TROLL.map((r) => r.split("").reverse().join(""));
const TROLL_COLORS: Record<string, string> = {
  K: "#111111",
  G: "#6aa84f",
  g: "#3e6e30",
  L: "#96cd6e",
  W: "#ffffff",
  E: "#c81428",
  R: "#b02828",
  r: "#781414",
  B: "#5a788c",
  b: "#3c5564",
  T: "#a0e65a",
  t: "#5aaa32",
  C: "#8c5232",
  c: "#5f3720",
  N: "#5a321e",
};
// The giant (every second boss) is the same body in purple, with a pair of horns on top.
const GIANT_COLORS: Record<string, string> = {
  ...TROLL_COLORS,
  G: "#8a4fc0",
  g: "#56288a",
  L: "#b98ae6",
  T: "#ff7ad9",
  t: "#c83ca8",
  H: "#f3e9c8",
  s: "#c4b184",
};
const GIANT_HORNS = [
  ".KK............KK.....",
  ".KHK..........KHK.....",
  ".KHsK........KsHK.....",
  "..KHsK......KsHK......",
  "...KHsK....KsHK.......",
];
const GIANT_HORN_ROWS = GIANT_HORNS.length - 1; // how many rows stick out above his head
// the last horn row sits on the top row of his head
const GIANT_ROWS = [
  ...GIANT_HORNS.slice(0, GIANT_HORN_ROWS),
  TROLL[0].split("").map((ch, i) => (GIANT_HORNS[GIANT_HORN_ROWS][i] !== "." ? GIANT_HORNS[GIANT_HORN_ROWS][i] : ch)).join(""),
  ...TROLL.slice(1),
];
const GIANT_ROWS_RIGHT = GIANT_ROWS.map((r) => r.split("").reverse().join(""));
// Tiny letters for spelling words with weed leaves in the SoundCloud Void
const LEAF_FONT: Record<string, string[]> = {
  F: ["###", "#..", "##.", "#..", "#.."],
  O: [".#.", "#.#", "#.#", "#.#", ".#."],
  L: ["#..", "#..", "#..", "#..", "###"],
  W: ["#.#", "#.#", "#.#", "###", "#.#"],
  M: ["#.#", "###", "#.#", "#.#", "#.#"],
  E: ["###", "#..", "##.", "#..", "###"],
  N: ["##.", "#.#", "#.#", "#.#", "#.#"],
  S: [".##", "#..", ".#.", "..#", "##."],
  U: ["#.#", "#.#", "#.#", "#.#", "###"],
  D: ["##.", "#.#", "#.#", "#.#", "##."],
  C: [".##", "#..", "#..", "#..", ".##"],
  "!": ["#", "#", "#", ".", "#"],
};

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function pad(n: number) {
  return String(Math.floor(n)).padStart(5, "0");
}

// ---------- Cover-field art (every piece has a dark outline so it shows up on any cover) ----------
// GAF FIELD: weed nugs to jump on
const NUG = [
  "....KKKKKK......",
  "..KKGgGGgGKK....",
  ".KGgOGGWGGgGK...",
  "KGGGGgGGOGGgGKK.",
  "KgOGGWGgGGWGGgGK",
  "KGGgGGGGOgGGOGGK",
  ".KGWGgOGGGgGGWK.",
  "..KKGGGgGWGGKK..",
  "....KKKKKKKK....",
];
const NUG_COLORS = { K: "#111111", G: "#5cb84a", g: "#2e6e28", O: "#ff8c28", W: "#ebffeb" };
// GODS PSP FIELD: little handheld consoles
const HANDHELD = [
  "KKKKKKKKKKKKKKKK",
  "KLLLLLLLLLLLLLLK",
  "KLdLKBBBBBBKLoLK",
  "KdddKBSBBBBKLLoK",
  "KLdLKBBBBBBKoLLK",
  "KLLLLLLLLLLLLLLK",
  ".KKKKKKKKKKKKKK.",
];
const HANDHELD_COLORS = { K: "#111111", L: "#3c3c48", d: "#c8c8d2", B: "#4aa3ff", S: "#dcf0ff", o: "#ff5fe0" };
// IPOD USER FIELD: little music players at MAX volume
// IPOD USER FIELD: little white music players with a pink song on the screen and a click wheel
const PLAYER = [
  ".KKKKKKKKKKKKKK.",
  "KWWWWWWWWWWWWWWK",
  "KWKKKKKKKKKKKKWK",
  "KWKssssssssssKWK",
  "KWKsPPPPPPPssKWK",
  "KWKsbbbbbssssKWK",
  "KWKssssssssssKWK",
  "KWKKKKKKKKKKKKWK",
  "KWWWWWggggWWWWWK",
  "KWWWWggWWggWWWWK",
  "KWWWgWWccWWgWWWK",
  "KWWWgWWccWWgWWWK",
  "KWWWWggWWggWWWWK",
  "KWWWWWggggWWWWWK",
  "KWWWWWWWWWWWWWWK",
  ".KKKKKKKKKKKKKK.",
];
const PLAYER_COLORS = { K: "#111111", W: "#f7f7fb", g: "#b4b4c4", c: "#dcdce6", s: "#9fd4ff", P: "#ff5fc8", b: "#3c6ed2" };
// SMALL PRETTY TITTIES FIELD: rainbows to jump on, devil bunnies to stomp, fairies flying over
const RAINBOW = [
  "....KKKKKKKK....",
  "..KKRRRRRRRRKK..",
  ".KRROOOOOOOORRK.",
  "KROOYYYYYYYYOORK",
  "KROYGGGGGGGGYORK",
  "KROYGBBBBBBGYORK",
  "KROYGBK..KBGYORK",
  "KKKKKK....KKKKKK",
];
const RAINBOW_COLORS = { K: "#111111", R: "#eb323c", O: "#ff9628", Y: "#ffe13c", G: "#50c85a", B: "#468cff" };
const RAINBOW_STRIPES = ["#eb323c", "#ff9628", "#ffe13c", "#50c85a", "#468cff", "#9646dc"];
const BUNNY = [".W...W.", ".WR.RW.", ".WWWWW.", "WKWWWKW", "WWWPWWW", "WWKKKWW", ".WWWWW."];
const BUNNY_COLORS = { K: "#111111", W: "#fff0f8", P: "#ff78c8", R: "#dc1e28" };
const FAIRY = [
  ["C..PPP..C", "CCPSSSPCC", "CCPKSKPCC", ".CPSSSPC.", "...VVV...", "..VVVVV..", "...S.S..."],
  ["...PPP...", "..PSSSP..", ".CPKSKPC.", "CCPSSSPCC", "CC.VVV.CC", "C.VVVVV.C", "...S.S..."],
];
const FAIRY_COLORS = { C: "#c8f0ff", P: "#ff5fc8", S: "#ffd6b4", K: "#111111", V: "#9646dc" };
// TOP SHELF FIELD: riveted metal plates
const METAL = [
  "KKKKKKKKKKKKKKKK",
  "KHHHHHHHHHHHHHHK",
  "KHrMMMMMMMMMMrHK",
  "KMMMMMMMMMMMMMMK",
  "KMMMMMMMMMMMMMMK",
  "KMrMMMMMMMMMMrMK",
  "KDDDDDDDDDDDDDDK",
  "KKKKKKKKKKKKKKKK",
];
const METAL_COLORS = { K: "#111111", H: "#d7dce6", M: "#8c94a2", D: "#5a606e", r: "#3c3e46" };
// TWISTED CORAL PEAKS: corals growing out of the sand (the seaweed has two frames so it sways)
const CORALS = [
  ["P..P..P", "P..P..P", ".P.P.P.", ".PPPPP.", "...P...", "...P...", "..DDD.."],
  ["O.....O", "O..O..O", "O..O..O", "OO.O.OO", ".O.O.O.", ".OOOOO.", "..ddd.."],
  [".V...V.", "V...V..", ".V...V.", "..V...V", ".V...V.", "V...V..", ".V...V."],
  ["V...V..", ".V...V.", "..V...V", ".V...V.", "V...V..", ".V...V.", "..V...V"],
];
// coral rock blocks to jump on
const REEF = [
  ".KKKKKKKKKKKKKK.",
  "KPPpPPPPpPPPpPPK",
  "KPpPPoPPPPpPPoPK",
  "KPPPPPPpPPPPPPPK",
  "KpPPoPPPPPoPPpPK",
  "KPPPPPpPPPPPPPPK",
  ".KKKKKKKKKKKKKK.",
];
const REEF_COLORS = { K: "#111111", P: "#ff8a7a", p: "#d85a50", o: "#7a2a30" };
const CORAL_COLORS = { P: "#ff6f91", D: "#b0305a", O: "#ff963c", d: "#aa501e", V: "#aa5aff" };
// GAF FIELD monsters: dark bats flying, red walking bombs (the fuse sparks)
const BAT = [
  ["G.......G", "GG.K.K.GG", "GgGKKKGgG", ".GKRKRKG.", "...KKK...", ".........", "........."],
  [".........", "...K.K...", "...KKK...", ".GKRKRKG.", "GgGKKKGgG", "GG.....GG", "G.......G"],
];
const BAT_COLORS = { G: "#2c2c34", g: "#5a5a68", K: "#0a0a0a", R: "#ff3040" };
const BOMB = ["....S..", "...K...", "..RRR..", ".RWRRR.", "RRKRKRR", "RRRRRRR", ".RRRRR.", ".K...K."];
const BOMB_COLORS = { S: "#ffc800", K: "#111111", R: "#e0283a", W: "#ffb0b8" };
const BOMB_COLORS_2 = { S: "#ff5a00", K: "#111111", R: "#e0283a", W: "#ffb0b8" };
// IPOD USER FIELD monsters: brown walkers with yellow horns, yellow drones that shoot red lasers
const HORNED = ["Y.....Y", ".Y...Y.", ".BBBBB.", "BWWBWWB", "BWKBWKB", "BBBBBBB", "BdddddB", ".K...K."];
const HORNED_COLORS = { Y: "#ffd23c", B: "#8a5a2b", d: "#5a3a1a", W: "#ffffff", K: "#111111" };
const DRONE = [
  ["KKK...KKK", "...K.K...", "..YYYYY..", ".YKRRRKY.", "YYYYYYYYY", ".y.K.K.y.", "...K.K..."],
  [".K.....K.", "...K.K...", "..YYYYY..", ".YKRRRKY.", "YYYYYYYYY", ".y.K.K.y.", "...K.K..."],
];
const DRONE_COLORS = { K: "#111111", Y: "#ffd000", y: "#c89a00", R: "#ff2832" };
const DRONE_COLORS_CHARGING = { K: "#111111", Y: "#ffd000", y: "#c89a00", R: "#ffffff" };
const LASER_SPEED = 150;
// GODS PSP FIELD monster colours (pink walkers, blue flyers)
const PSP_WALKER_COLORS = { G: "#ff5fc8", K: "#5a0a46", W: "#ffffff" };
const PSP_FLYER_COLORS = { G: "#6fc3ff", D: "#1e46b4", W: "#ffffff" };
// TWISTED CORAL PEAKS monsters: spiky sea urchins walking, seahorses swimming
const URCHIN = ["p.P.P.p", ".PPPPP.", "PPKPKPP", "pPPPPPp", "PRPKPRP", ".PPPPP.", "p.P.P.p"];
const URCHIN_COLORS = { P: "#8c5ad2", p: "#502d8c", K: "#111111", R: "#ff96be" };
const SEAHORSE = [
  ["....BBF..", "KBBBKBFF.", "....BBBF.", "...BLBB..", "...BLLB..", "....BBB..", ".b..BB...", "..bbB...."],
  ["....BBFF.", "KBBBKBF..", "....BBBFF", "...BLBB..", "...BLLB..", "....BBB..", ".b..BB...", "..bbB...."],
];
const SEAHORSE_COLORS = { B: "#5a8cff", b: "#2846aa", L: "#c8dcff", K: "#111111", F: "#ff8cc8" };
// TRIPPY FIELD monsters: green bacteria walking, blue dragonflies flying
const BACTERIA = ["G.GGG.G", ".GGGGG.", "GGWGWGG", "gGKGKGg", "GGRRRGG", ".gGGGg.", "g.g.g.g"];
const BACTERIA_COLORS = { G: "#3cd23c", g: "#147846", W: "#e6f5ff", K: "#0a1446", R: "#dc2832" };
const DRAGONFLY = [
  ["..CC.CC..", ".CCC.CCC.", "..CCCCC..", "KBBBBBbbb", ".........", ".........", "........."],
  [".........", ".........", "..CCCCC..", "KBBBBBbbb", ".CCC.CCC.", "..CC.CC..", "........."],
];
const DRAGONFLY_COLORS = { C: "#beebff", B: "#3c82ff", b: "#1e46b4", K: "#111111" };

function drawPixels(
  ctx: CanvasRenderingContext2D,
  rows: string[],
  x: number,
  y: number,
  colors: Record<string, string>,
  scale = 1
) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const color = colors[rows[r][c]];
      if (color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.round(x + c * scale), Math.round(y + r * scale), scale, scale);
      }
    }
  }
}

// Draws a picture at whole pixels (keeps pixel art sharp)
function drawImageSafe(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number) {
  ctx.drawImage(img, Math.round(x), Math.round(y));
}

// Small repeatable "random" number for background decorations
function hash(n: number) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// A random ID for this browser, so names stay locked to the device that claimed them
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage-device";
  }
}

// Some browsers (private/incognito windows, strict privacy settings, some in-app
// browsers) block localStorage entirely. Everything that saves progress already
// wraps its calls in try/catch, so nothing crashes either way — this just lets us
// tell the player their unlocks won't stick around, instead of failing silently.
function storageAvailable() {
  try {
    const testKey = "__pinkmane_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function getOwnerCode() {
  try {
    return localStorage.getItem(OWNER_KEY) || "";
  } catch {
    return "";
  }
}

export default function SuperGame({ actionSignal, spinRef, fontFamily, muted, touchPad, beatRef }: Props) {
  // The page's beat clock (kick = 1 right on each beat, fading through it; sway swings left/right each beat; live = music really playing).
  // It's read through a ref because the game's loop is set up once.
  const beatPropRef = useRef(beatRef);
  beatPropRef.current = beatRef;
  const touchPadRef = useRef(false);
  touchPadRef.current = !!touchPad;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spritesRef = useRef<Partial<Record<OutfitId, HTMLImageElement>>>({});
  const levelSpritesRef = useRef<Record<string, HTMLImageElement>>({}); // outfits worn only in one level
  const shipRef = useRef<HTMLImageElement | null>(null); // your ghost ship drawing: /public/game/ghostship.png
  const fieldImagesRef = useRef<HTMLImageElement[]>([]); // the 7 cover-art field backgrounds
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null); // one shared buffer of white noise for all the "shhh" sounds
  const hitboxesRef = useRef(false); // ?hitboxes=1 in the address: show the danger zones
  const tripBufRef = useRef<HTMLCanvasElement | null>(null); // a copy of the screen for the wobble
  const trollSoundRef = useRef<HTMLAudioElement | null>(null); // the boss-down sound, loaded once (not on the first kill)
  const deathSoundRef = useRef<HTMLAudioElement | null>(null);
  const stuttersRef = useRef<HTMLAudioElement | null>(null); // the secret Stutters remix
  if (stuttersRef.current) stuttersRef.current.muted = muted; // follows the iPod mute button
  const keepImgsRef = useRef<Record<string, HTMLImageElement>>({}); // Level 3 backdrop pictures
  // your painted zone backgrounds (PAINTED_BGS), each with a copy at exactly the game's size so every wiggle strip is a plain copy
  const paintedBgRef = useRef<Record<number, { img: HTMLImageElement; cache: HTMLCanvasElement | null }>>({});
  const weedBgRef = useRef<HTMLImageElement | null>(null); // your own Weedland background (public/game/weedland-bg.png)
  const levelMusicRef = useRef<HTMLAudioElement | null>(null); // Level 3 song
  const levelMusicOnRef = useRef(false); // told the page to pause its own music
  // Everything in the game that wants your own (PINKMANE) music off right now: "level" (a level with
  // its own songs) and "stutters" (the secret track). Your music only comes back when ALL of them
  // are done. Death sounds are not in here: they play on top of the music.
  const pageMusicHoldsRef = useRef(new Set<string>());
  const levelMusicTryRef = useRef(0);
  const levelMusicIdxRef = useRef(0); // which song of the level is playing
  const levelMusicBadRef = useRef(new Set<string>()); // songs whose file is missing (skipped)
  const levelMusicUserPausedRef = useRef(false); // paused with the handheld's play/pause button
  const levelMusicVolRef = useRef(0.8); // follows the handheld's volume
  const levelMusicReportRef = useRef(""); // last song we told the page about
  const [showGolden, setShowGolden] = useState(false); // the golden leaf pause screen
  const [goldBefore, setGoldBefore] = useState(false); // found it in an earlier game already
  const sfxOnRef = useRef(true);
  const sfxVolRef = useRef(1); // sound effects volume 0..1 (the slider under the speaker icon)
  const sfxDragRef = useRef(false); // dragging the slider right now
  const heldRef = useRef({ left: false, right: false, up: false }); // up = jump held (for the jetpack)
  const touchRef = useRef(0); // -1 holding left side, 1 holding right side
  const touchUpRef = useRef(false); // holding the middle of the screen (jetpack on phones)
  const wheelRef = useRef({ dir: 0, timer: 0 });
  const okRepeatRef = useRef(false); // the last Space / Enter was the key repeating because it's held down (the prize machine ignores those)

  // Scoreboard (shared online) and name entry
  const [showEntry, setShowEntry] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const boardRef = useRef<Entry[]>([]);
  const boardStatusRef = useRef<BoardStatus>("loading");
  const myNameRef = useRef("");
  const nameRef = useRef("");
  const savingRef = useRef(false);

  const state = useRef({
    mode: "home" as Mode,
    // Pink Levels
    gameMode: "infinite" as "infinite" | "levels",
    homeChoice: 0, // 0 = PINK RUN INFINITE, 1 = PINK LEVELS, 2 = the SHOP button (top right)
    levelMode: false, // playing a level right now
    level: 1,
    levelPick: 0, // which stop on the level map you're standing on
    mapWalk: null as null | { pts: [number, number][]; d: number; to: number }, // walking between stops
    levelTime: 0, // seconds on the clock
    levelMs: 0, // your final time
    levelBest: {} as Record<string, number>, // best time per level (ms), from this browser
    newBest: false,
    doneAt: 0,
    bong: null as null | { x: number; y: number },
    signs: [] as { x: number; text: string; r?: number }[],
    lboss: null as null | {
      kind: "leaf" | "snowman";
      x: number;
      y: number;
      vx: number;
      vy: number;
      hp: number;
      maxHp: number;
      hit: number;
      dive: number;
      diveTimer: number;
      dead: number;
      facing: number;
      dazed: number; // snowman: out of hits, jump on his head!
      speech: number; // seconds the speech bubble stays up
    },
    lbossState: "none" as "none" | "waiting" | "fight" | "done",
    // Level 3 knights
    kboss: null as null | Knight,
    karenas: [] as { col: number; kind: KnightKind }[], // arenas still ahead of you, in order
    kwaves: [] as { x: number; dir: number; life: number }[], // WARLORD's shockwaves
    kfinalCol: 0, // first column of the WARLORD arena (lines up the backdrop)
    kshots: [] as { x: number; y: number; vx: number; vy: number; life: number }[], // WARLORD's eye waves
    knockT: 0, // thrown off by WARLORD: seconds until you can steer again
    // Level 4: TOMBFELL
    tboss: null as null | Tomb,
    tarena: -1, // first column of his arena while it's still ahead of you (-1 = none, or you're in it)
    tfinalCol: 0, // first column of his arena (the big title hangs there)
    woodsPaint: 0, // how many times the world was "repainted" (picks the sky colours and where the vines hang)
    woodsGlitch: 0, // seconds the whole screen glitches for (after every hit on him)
    outfit: "classic" as OutfitId,
    unlocked: ["classic"] as OutfitId[],
    coins: 0,
    spells: [] as SpellId[], // spells you bought in the shop
    shopIndex: 1, // which line of the shop is highlighted (see SHOP_ROWS)
    shopFromPause: false, // opened the shop from the Esc menu (BACK / Esc returns to the Esc menu, the run is waiting)
    cards: [] as BossId[], // boss cards you won
    cardIndex: 0, // which card you're looking at on the BOSS CARDS screen
    intro: null as null | { id: BossId; next: "choose" | "running"; at: number }, // the card shown before a fight
    shopMsg: "", // "SPIKE SHOT UNLOCKED!" etc, shown for a moment at the bottom of the shop
    shopMsgAt: -10,
    spikeVolley: 0, // counts your spike shots
    spikeHitVolley: -1, // the last spike shot that hurt a boss (the same burst can't hurt him twice)
    selectIndex: 0,
    storageOk: true, // false if this browser blocks localStorage; progress just won't save
    x: 40,
    y: 0,
    vx: 0,
    vy: 0,
    onGround: false,
    coyote: 0,
    facing: 1,
    cam: 0,
    cols: [] as Column[],
    genGround: 8,
    genFlat: 0,
    pipeZones: [] as number[], // zones that already got their bonus pipe
    enemies: [] as Enemy[],
    leaves: [] as Leaf[],
    hearts: [] as Heart[],
    powerups: [] as PowerUp[],
    fireballs: [] as Fireball[],
    particles: [] as Particle[],
    testRun: false, // started with the ?zone= test shortcut
    voidPal: 0, // colour of the current SoundCloud Void visit
    bubbles: [] as { x: number; y: number; life: number; r: number; ph: number }[],
    smoke: [] as { x: number; y: number; vx: number; vy: number; r: number; life: number }[], // bong smoke
    lasers: [] as { x: number; y: number; vx: number; ty: number; life: number }[], // drone lasers (jump over them!) // breathing underwater (coral field)
    bubbleTimer: 0,
    popups: [] as Popup[],
    power: "none" as "none" | "fire" | "ice" | "spike",
    ammo: 0,
    fireTime: 0,
    doubleJumps: 0,
    airJumped: false,
    // Secret area to the left of the start, with the jetpack
    eggCols: [] as Column[],
    eggOpen: true,
    jetItem: null as null | { x: number; y: number },
    jetpack: false,
    flying: false,
    jetFuel: JET_FUEL_MAX, // seconds of flight left in the tank; refills while grounded
    camY: 0, // vertical camera offset: follows you up when you jump/fly higher than the screen
    killStreak: 0, // consecutive stomps without the streak timer running out
    killStreakTimer: 0,
    pauseChoice: 0, // which option is highlighted on the pause menu (see PAUSE_OPTIONS)
    fromPause: false, // true while picking an outfit from the pause menu (OK / Esc goes back to the pause menu)
    lastVoid: -1, // which Void map you saw last, so you get a different one next time
    followShown: false, // the FOLLOW ME ON SOUNDCLOUD room has already shown up once this game
    // Golden leaf
    goldDone: false,
    goldLeaf: null as null | { x: number; y: number },
    stuttersOn: false,
    // Boss
    bossState: "none" as "none" | "placed" | "fight",
    bossCount: 0, // trolls beaten this game
    bossSpell: "fire" as PowerKind, // the spell you picked for this fight
    spellChoice: 0, // 0 = fire, 1 = ice, 2 = spike if you own it (on the pick screen)
    zoneMarks: [] as { score: number; zone: number }[], // score when you entered each zone (for the progress line)
    bossCol: 0, // first column of the arena
    bossRefill: 0,
    boss: null as null | {
      x: number;
      y: number;
      vx: number;
      vy: number;
      hp: number;
      maxHp: number;
      hit: number; // flashes white after being hit
      jumpTimer: number;
      facing: number;
      dead: number; // counts down while he's falling apart
      kind: "troll" | "giant";
      dazed: number; // giant only: >0 while he's down and waiting for the finishing stomp
    },
    // STASH SPIN (the prize machine, infinite run only)
    perks: noPerks(), // stacks of each prize, this run
    shield: 0, // SHIELD: bubble hits left in this zone
    sipFuel: 0, // JETPACK SIP: seconds of fuel left in this zone
    freeJumped: false, // AIR JUMP: the free jump was used since you last stood on something
    reviveUsed: false, // SECOND WIND already saved you this run
    testSpin: 0, // test key 8: which prizes the next test spin shows
    // The wax moment
    wax: false, // the wax rip already happened in this run (it only happens once)
    waxWait: 0, // seconds until the wax moment starts (0 = not waiting)
    waxT: 0, // seconds into the wax moment
    waxAt: 0, // when the rip ended (only used by the optional afterglow)
    waxSnap: null as null | HTMLCanvasElement, // a picture of the frozen world (without you) for the zoom
    waxFx: 0, // where you are on the frozen screen (the middle of your picture)
    waxFy: 0,
    waxHide: false, // true only while that picture is being taken: you and your dog are left out of it
    waxTest: false, // started with the localhost 7 key: doesn't use up the once-per-run rip
    waxTrip: 0, // seconds left of the wobble + colours after the rip (0 = not on)
    bgWiggle: 0, // 0 -> 1: how much the painted background is wiggling to the music (it eases in and out when music starts/stops)
    waxHue: 0, // where the colours have got to in their turn (it slows down as the effect fades)
    petSkin: "classic" as OutfitId, // the skin BOBO is wearing
    petSkins: [] as OutfitId[], // the BOBO skins you bought
    // BOBO (null until you win him)
    pet: null as null | {
      x: number;
      y: number;
      facing: number;
      trail: { x: number; y: number }[]; // where you've just been: it runs along this
      still: number; // seconds you've been standing still
      auto: number; // level 2: seconds until it may shoot by itself again
      fetch: Leaf | null; // level 3: the leaf it's running to
      fetchCool: number;
      moving: boolean;
    },
    spinQueue: [] as boolean[], // spins waiting to open (true = a BOSS SPIN)
    spinWait: 0, // seconds until the next waiting spin opens
    startSpinDone: false, // the opening spin of this run already happened
    // Level 3 upgrades + medals
    cp: null as null | { x: number; cam: number; arenas: { col: number; kind: KnightKind }[] }, // the checkpoint you touched
    cpCol: -1, // the column of the checkpoint flag on this level's map (-1 = none)
    hitsTaken: 0, // times you got hit in this level (0 at the end = the NO-HIT star)
    cpDeaths: 0, // times you ran out of hearts and came back at the checkpoint
    wing: -1, // which wing of the Keep you're in
    statues: [] as { x: number; timer: number; act: "idle" | "wind" | "slam" }[], // shockwave statues (the X on the map)
    torches: [] as { x: number; y: number; lit: boolean }[], // the crypt's wall torches (the t on the map)
    dark: 0, // how dark the screen is right now (0 = normal, 1 = full darkness): it fades in as you enter the crypt
    blizzard: 0, // 0 -> 1 while the evil snowman is up (it snows all over the screen)
    flakes: [] as { x: number; y: number; vy: number; ph: number; big: boolean }[], // the snowflakes (screen coordinates)
    icicles: [] as { x: number; y: number; len: number; vy: number; grow: number; act: "grow" | "fall"; dead?: boolean }[], // the ice spikes (dead = a shot broke it)
    icicleTimer: 0, // seconds until the next spike starts to form
    cover: [] as { x: number; rise: number }[], // the pillars that rise in the Warlord's phase 2 (rise 0 -> 1)
    medals: {} as Record<string, { time: MedalTime | null; nohit: boolean }>, // your best medals, per level
    medal: null as null | { time: MedalTime | null; nohit: boolean; newTime: boolean; newNoHit: boolean; skin: boolean }, // what you just earned
    spin: null as null | {
      boss: boolean; // the gold BOSS SPIN (rarer prizes)
      reels: ReelId[]; // what each of the three reels lands on
      strips: ReelId[][]; // the icons that roll past on each reel before it lands
      stops: number[]; // when each reel stops (seconds)
      t: number; // seconds since the machine opened
      landed: number; // how many reels have stopped
      tick: number; // timer for the ticking sound
      jackpot: boolean; // all three match: the prize counts twice
      pick: number; // which reel is highlighted (0, 1, 2)
      took: number; // which reel you took (-1 = still choosing)
      tookAt: number;
      flashWas: number; // the message that was on screen when it opened (put back afterwards)
    },
    hinted: [] as string[], // which "how to use it" hints were already shown this game
    hintText: "",
    hintTime: 0,
    auraTimer: 0,
    zoneShown: 0,
    flash: 0,
    flashText: "",
    // Bonus room (SoundCloud Void)
    inBonus: false,
    saved: null as null | {
      cols: Column[];
      enemies: Enemy[];
      leaves: Leaf[];
      hearts: Heart[];
      powerups: PowerUp[];
      cam: number;
      pipeCol: number;
    },
    pipeDir: 0 as 0 | 1 | -1, // 1 = going down into the void, -1 = coming out
    pipeTimer: 0,
    pipeCol: 0,
    score: 0,
    farthest: 0,
    bonus: 0,
    best: 0,
    lives: START_LIVES,
    invuln: 0,
    runAnim: 0,
    t: 0,
    runTime: 0,
    deadAt: 0,
    hurtAt: 0,
    shake: 0,
  });

  // ---------- Sounds (made in code) ----------

  const getAudio = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      audioCtxRef.current = new AC();
    }
    if (audioCtxRef.current.state === "suspended") audioCtxRef.current.resume();
    return audioCtxRef.current;
  };

  const beep = (from: number, to: number, time: number, volume: number, type: OscillatorType = "square", delay = 0) => {
    if (mutedRef.current || !sfxOnRef.current || sfxVolRef.current <= 0) return;
    volume *= sfxVolRef.current;
    const ac = getAudio();
    if (!ac) return;
    const now = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + time);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, ac.currentTime);
    g.gain.setValueAtTime(volume, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + time + 0.02);
    osc.connect(g).connect(ac.destination);
    osc.start(now);
    osc.stop(now + time + 0.04);
  };

  const playJump = () => beep(260, 640, 0.12, 0.045, "square");
  const playCoin = () => [988, 1319].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.06));
  // Some leaves are gold coins (same spot = always the same answer). Never in the Void or in words.
  const isCoin = (l: Leaf): boolean => {
    if (l.coin !== undefined) return l.coin; // set by hand in a level, or remembered by the MAGNET prize
    return (
      !l.small &&
      !state.current.inBonus &&
      !state.current.levelMode &&
      hash(Math.floor(l.x) * 7 + Math.floor(l.y) * 13) < COIN_CHANCE + COIN_LUCK_STEP * state.current.perks.coinLuck
    );
  };
  const playLeaf = () => {
    beep(988, 988, 0.05, 0.045);
    beep(1319, 1319, 0.1, 0.045, "square", 0.05);
  };
  const playStomp = () => beep(500, 120, 0.12, 0.07, "square");
  const playHurt = () => beep(500, 70, 0.5, 0.08, "sawtooth");
  const playBump = () => beep(180, 120, 0.08, 0.07, "square");
  const playPowerAppear = () => [330, 440, 554, 659].forEach((f, i) => beep(f, f, 0.07, 0.05, "square", i * 0.05));
  const playPowerUp = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, f * 1.01, 0.08, 0.055, "square", i * 0.06));
  const playFireball = () => beep(900, 300, 0.07, 0.035, "sawtooth");
  const playPowerDown = () => beep(700, 200, 0.35, 0.07, "square");
  const playEmpty = () => beep(140, 110, 0.05, 0.05, "square");
  const playIce = () => beep(1600, 2400, 0.08, 0.03, "triangle");
  const playSpike = () => [1300, 1000, 760].forEach((f, i) => beep(f, f * 0.45, 0.06, 0.035, "sawtooth", i * 0.025));
  const playDoubleJump = () => beep(500, 1100, 0.1, 0.045, "triangle");

  // ---------- Your own (PINKMANE) music on the page ----------
  // The game never tells the page "pause" / "resume" directly, it goes through these two.
  // holdPageMusic("x") = pause your music because of x. releasePageMusic("x") = x is done.
  // Your music only resumes when nothing is holding it any more.
  const holdPageMusic = (why: string) => {
    const holds = pageMusicHoldsRef.current;
    const first = holds.size === 0;
    holds.add(why);
    if (first) window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "pause" }));
  };
  const releasePageMusic = (why: string) => {
    const holds = pageMusicHoldsRef.current;
    if (!holds.delete(why)) return;
    if (holds.size === 0) window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "resume" }));
  };
  // Leaving the game: let go of everything at once
  const releaseAllPageMusic = () => {
    const holds = pageMusicHoldsRef.current;
    if (holds.size === 0) return;
    holds.clear();
    window.dispatchEvent(new CustomEvent("pinkmane-music", { detail: "resume" }));
  };

  // ---------- The secret Stutters track ----------

  // Starts the remix (and asks the page to pause your music while it plays)
  const startStutters = () => {
    const s = state.current;
    if (s.stuttersOn) return;
    try {
      if (!stuttersRef.current) {
        stuttersRef.current = new Audio(STUTTERS_TRACK);
        stuttersRef.current.loop = true;
        stuttersRef.current.volume = 0.8;
      }
      const a = stuttersRef.current;
      a.muted = mutedRef.current;
      a.currentTime = 0;
      holdPageMusic("stutters");
      a.play().catch(() => {});
      s.stuttersOn = true;
    } catch {}
  };

  // ---------- Level music (Level 3: WARLORD COLOSSUS songs, one after another) ----------
  // Plays while you're in a level that has `music`. When a song ends the next one starts; a song
  // whose file is missing is skipped. The handheld's music buttons control it (see levelMusicControl).
  // Your own music stays OFF the whole time: from the moment the level starts until you're back on
  // the list of levels (that includes dying, the bong, typing your name and the Top 10).
  const levelSongList = () => {
    const s = state.current;
    return s.levelMode ? LEVELS[s.level - 1]?.music : undefined;
  };
  // Are we inside a level that has its own songs right now?
  const inMusicLevel = () => {
    const s = state.current;
    const list = levelSongList();
    if (!list || list.length === 0) return false;
    if (s.mode === "home" || s.mode === "levelSelect" || s.mode === "cards") return false; // left the level
    if (s.mode === "shop" && !s.shopFromPause) return false; // the shop from the start screen
    if (s.mode === "select" && !s.fromPause) return false; // picking an outfit before a run
    return true;
  };
  // The Esc menu (and picking an outfit from it): the level song waits, like the rest of the game
  const levelMusicWaiting = () => {
    const m = state.current.mode;
    return m === "paused" || m === "select" || m === "shop";
  };
  // Makes song number i of this level the current one (skipping songs whose file is missing)
  const loadLevelSong = (i: number) => {
    const list = levelSongList();
    try {
      levelMusicRef.current?.pause();
    } catch {}
    levelMusicRef.current = null;
    if (!list || list.length === 0) return null;
    let idx = ((i % list.length) + list.length) % list.length;
    let tries = 0;
    while (levelMusicBadRef.current.has(list[idx].file) && tries < list.length) {
      idx = (idx + 1) % list.length;
      tries++;
    }
    if (tries >= list.length) return null; // none of the songs are there
    levelMusicIdxRef.current = idx;
    const a = new Audio(list[idx].file);
    a.volume = levelMusicVolRef.current;
    a.muted = mutedRef.current;
    a.dataset.src = list[idx].file;
    levelMusicRef.current = a;
    levelMusicTryRef.current = 0;
    return a;
  };
  // Tells the page which song is on, so the handheld's ticker shows it (only when it changes)
  const reportLevelSong = (active: boolean) => {
    const list = levelSongList();
    const a = levelMusicRef.current;
    const song = active && list && a ? list.find((m) => m.file === a.dataset.src) : undefined;
    const paused = !a || a.paused;
    const key = song ? `${song.file}|${paused}` : "";
    if (key === levelMusicReportRef.current) return;
    levelMusicReportRef.current = key;
    window.dispatchEvent(
      new CustomEvent("pinkmane-level-song", { detail: song ? { title: song.title, artist: song.artist, paused } : null })
    );
  };
  const syncLevelMusic = () => {
    const s = state.current;
    const list = levelSongList();
    const active = inMusicLevel();
    const want = active && !levelMusicWaiting() && !levelMusicUserPausedRef.current;
    try {
      let a = levelMusicRef.current;
      if (active && list) {
        if (a && (a.ended || a.error || !list.some((m) => m.file === a!.dataset.src))) {
          // this song finished (or its file is missing): on to the next one
          if (a.error && a.dataset.src) levelMusicBadRef.current.add(a.dataset.src);
          a = loadLevelSong(levelMusicIdxRef.current + 1);
        }
        if (!a) a = loadLevelSong(levelMusicIdxRef.current);
        if (a) {
          a.muted = mutedRef.current;
          const now = performance.now();
          if (want) {
            if (a.paused && !a.ended && !a.error && now - levelMusicTryRef.current > 1000) {
              levelMusicTryRef.current = now; // (browsers only allow sound after a click, so keep trying)
              a.play().catch(() => {});
            }
          } else if (!a.paused) a.pause();
        }
        if (!levelMusicOnRef.current) {
          levelMusicOnRef.current = true;
          holdPageMusic("level");
        }
      } else {
        if (a && !a.paused) a.pause();
        if (levelMusicOnRef.current) {
          levelMusicOnRef.current = false;
          releasePageMusic("level");
        }
      }
      reportLevelSong(active);
    } catch {}
  };
  // The handheld's music buttons while a level song is on: "toggle", "next", "prev" or { volume }
  const levelMusicControl = (e: Event) => {
    const d = (e as CustomEvent<unknown>).detail;
    if (d && typeof d === "object" && typeof (d as { volume?: unknown }).volume === "number") {
      levelMusicVolRef.current = Math.max(0, Math.min(1, (d as { volume: number }).volume));
      if (levelMusicRef.current) levelMusicRef.current.volume = levelMusicVolRef.current;
      return;
    }
    if (!levelMusicOnRef.current) return;
    const playing = !levelMusicWaiting();
    let a = levelMusicRef.current;
    try {
      if (d === "toggle") {
        levelMusicUserPausedRef.current = !levelMusicUserPausedRef.current;
        if (a) {
          if (levelMusicUserPausedRef.current) a.pause();
          else if (playing) a.play().catch(() => {});
        }
      } else if (d === "next" || d === "prev") {
        if (d === "prev" && a && a.currentTime > 3) a.currentTime = 0; // like an iPod: back to the start first
        else a = loadLevelSong(levelMusicIdxRef.current + (d === "next" ? 1 : -1));
        levelMusicUserPausedRef.current = false;
        if (a && playing) a.play().catch(() => {});
      }
    } catch {}
    reportLevelSong(true);
  };


  // Stops it and lets your music carry on
  const stopStutters = () => {
    const s = state.current;
    if (!s.stuttersOn) return;
    s.stuttersOn = false;
    try {
      stuttersRef.current?.pause();
    } catch {}
    releasePageMusic("stutters");
  };

  // Closing the golden leaf screen (with the link button or skip)
  const closeGolden = (openLink: boolean) => {
    const s = state.current;
    if (openLink && STUTTERS_LINK) window.open(STUTTERS_LINK, "_blank", "noopener,noreferrer");
    setShowGolden(false);
    if (s.mode === "golden") s.mode = "running";
    s.flash = 3;
    s.flashText = "SHOUT OUT STUTTERS!";
    s.invuln = Math.max(s.invuln, 0.5);
  };
  const playCrumble = () => beep(300, 90, 0.2, 0.05, "sawtooth");
  const playHeart = () => [659, 784, 988, 1319].forEach((f, i) => beep(f, f, 0.09, 0.055, "triangle", i * 0.07));
  const playPipe = () => [520, 390, 260, 180].forEach((f, i) => beep(f, f * 0.9, 0.08, 0.05, "square", i * 0.08));
  const playDeath = () => {
    const sound = deathSoundRef.current;
    if (sound && !mutedRef.current && sfxOnRef.current && sfxVolRef.current > 0) {
      sound.volume = sfxVolRef.current;
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  };

  // Sound effects volume (0..1). Moving the slider up from 0 also turns the sounds back on.
  const setSfxVolume = (v: number) => {
    const vol = Math.max(0, Math.min(1, Math.round(v * 20) / 20));
    sfxVolRef.current = vol;
    if (vol > 0 && !sfxOnRef.current) sfxOnRef.current = true;
    try {
      localStorage.setItem(SFX_VOL_KEY, String(vol));
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  const toggleSfx = () => {
    sfxOnRef.current = !sfxOnRef.current;
    try {
      localStorage.setItem(SFX_KEY, sfxOnRef.current ? "on" : "off");
    } catch {}
  };

  // ---------- Scoreboard ----------

  const loadBoard = async (game = "super") => {
    boardStatusRef.current = "loading";
    try {
      const res = await fetch(`/api/scores?game=${game}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      let scores: { name: string; score: number }[] = Array.isArray(data.scores) ? data.scores : [];
      // A level board only holds times (LEVEL_TIME_BASE - ms). If the server hands back something else
      // (an old server that doesn't know the level boards yet), ignore it instead of showing nonsense times.
      if (game !== "super") scores = scores.filter((e) => e.score > LEVEL_TIME_BASE - 3600000 && e.score < LEVEL_TIME_BASE);
      boardRef.current = scores;
      boardStatusRef.current = "ok";
    } catch {
      boardStatusRef.current = "offline";
    }
  };

  const qualifies = (score: number) => {
    if (state.current.testRun) return false; // test runs (?zone=...) never go on the scoreboard
    if (boardStatusRef.current !== "ok" || score < 10) return false;
    const b = boardRef.current;
    return b.length < 10 || score > b[b.length - 1].score;
  };

  const submitName = async () => {
    const s = state.current;
    const clean = nameRef.current.trim();
    if (clean.length < 2) {
      setMessage("NAME TOO SHORT");
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setMessage("");
    try {
      const res = await fetch("/api/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: s.levelMode ? levelGameId(s.level) : "super",
          name: clean,
          score: s.levelMode ? LEVEL_TIME_BASE - s.levelMs : Math.floor(s.score),
          runTime: s.levelMode ? s.levelTime + 1 : s.runTime,
          device: getDeviceId(),
          ownerCode: getOwnerCode(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Explain what the scoreboard said, in plain words
        const why: Record<string, string> = {
          "name reserved": "PINKMANE IS RESERVED, PICK ANOTHER NAME",
          "beat their score to take this name": "THAT NAME HAS A HIGHER SCORE - BEAT IT TO TAKE IT",
          "slow down": "WAIT 10 SECONDS, THEN TRY AGAIN",
          "pick another name": "PICK ANOTHER NAME",
          "score not valid": "SCORE COULD NOT BE CHECKED",
          offline: "SCOREBOARD IS OFFLINE",
        };
        const err = String(data.error || "");
        setMessage(why[err] ?? (err || "COULD NOT SAVE").toUpperCase());
        return;
      }
      boardRef.current = Array.isArray(data.scores) ? data.scores : boardRef.current;
      myNameRef.current = data.name || clean;
      try {
        localStorage.setItem(NAME_KEY, clean);
      } catch {}
      setShowEntry(false);
      s.mode = "board";
      s.deadAt = s.t;
    } catch {
      setMessage("COULD NOT SAVE");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const skipEntry = () => {
    const s = state.current;
    setShowEntry(false);
    setMessage("");
    s.mode = "board";
    s.deadAt = s.t;
  };

  // ---------- Level ----------

  const makeCol = (ground: number, zone: number, extra: Partial<Column> = {}): Column => ({
    ground,
    block: -1,
    block2: -1,
    bonus: -1,
    used: false,
    bump: 0,
    line: -1,
    lineTh: 4,
    pipe: 0,
    pipeOut: false,
    pipeUsed: false,
    fragile: 0,
    crumble: -1,
    zone,
    spring: false,
    ...extra,
  });

  const zoneOf = (i: number) => Math.floor(i / ZONE_LEN) % ZONE_NAMES.length;

  // Gets harder at 12k, 15k and 20k: faster monsters, and more of them
  const hardness = () => {
    const sc = state.current.score;
    if (sc >= 20000) return Math.min(HARD_MAX, 1.6 + Math.floor((sc - 20000) / 10000) * HARD_STEP); // 30k: 1.8, 40k: 2 ...
    if (sc >= 15000) return 1.35;
    if (sc >= 12000) return 1.15;
    return 1;
  };

  // ---------- STASH SPIN: what the prizes change ----------
  // (all of these give the normal numbers in the levels: a level never has prizes)
  // how many prizes you hold (curses don't count: they bring their own trouble)
  const perkTotal = () => PERKS.reduce((n, p) => n + (p.curse ? 0 : state.current.perks[p.id as PerkId]), 0);
  // More prizes = more monsters (on top of the 12k / 15k / 20k steps above)
  const perkPressure = () => 1 + Math.min(PERK_ENEMY_CAP, PERK_ENEMY_STEP * perkTotal());
  const bossHpBonus = () => Math.min(PERK_BOSS_HP_CAP, Math.floor(perkTotal() * PERK_BOSS_HP));
  const sipMax = () => JET_SIP_SECONDS * state.current.perks.jetSip;
  const runSpeed = () => RUN * (1 + SPEED_STEP * state.current.perks.speed);
  const maxLives = () => (state.current.levelMode ? MAX_LIVES : RUN_LIVES + state.current.perks.heart);
  const fireAmmo = () => FIRE_AMMO + STASH_AMMO_STEP * state.current.perks.stash;
  const iceAmmo = () => ICE_AMMO + STASH_AMMO_STEP * state.current.perks.stash;
  const spikeAmmo = () => SPIKE_AMMO + state.current.perks.stash;
  const fireTimeMax = () => FIRE_TIME + STASH_TIME_STEP * state.current.perks.stash;
  const boxShots = () => 3 + state.current.perks.stash; // shots from one stash box in a boss arena

  const addWalker = (i: number, ground: number, progress: number) => {
    state.current.enemies.push({
      kind: "walker",
      x: i * T,
      y: ground * T - 14,
      vx: -(28 + progress * 24) * Math.min(HARD_SPEED_MAX, hardness()),
      vy: 0,
      baseY: 0,
      phase: 0,
      alive: true,
      squash: 0,
    });
  };

  // The walking eye: same walk as a walker, but stomping it leaves a little bong you can kick
  const addEye = (i: number, ground: number, progress: number) => {
    addWalker(i, ground, progress);
    const list = state.current.enemies;
    list[list.length - 1].kind = "eye";
  };

  const addFlyer = (i: number, ground: number, progress: number) => {
    const baseY = Math.max(20, (ground - 3) * T + rand(-8, 8));
    state.current.enemies.push({
      kind: "flyer",
      x: i * T,
      y: baseY,
      vx: -(30 + progress * 22) * Math.min(HARD_SPEED_MAX, hardness()),
      vy: 0,
      baseY,
      phase: Math.random() * Math.PI * 2,
      alive: true,
      squash: 0,
    });
  };

  // Floating bricks: sometimes two floors, rarely with a bonus block (orange leaf inside)
  const addPlatforms = (zone: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const g = s.genGround;
    const len = 3 + Math.floor(Math.random() * 3);
    const row = g - 3;
    const twoFloors = g >= 7 && Math.random() < (zone === 1 ? 0.6 : 0.35);
    // LEAF LUCK (a spin prize) makes the ? stash boxes show up more often
    const bonusAt = Math.random() < 0.15 + LEAF_LUCK_STEP * s.perks.leafLuck ? 1 + Math.floor(Math.random() * (len - 2)) : -1;
    for (let k = 0; k < len; k++) {
      const upper = twoFloors && k >= 1 && k < len - 1 ? row - 3 : -1;
      if (k === bonusAt) s.cols.push(makeCol(g, zone, { bonus: row, block2: upper }));
      else s.cols.push(makeCol(g, zone, { block: row, block2: upper }));
      const top = upper >= 0 ? upper : row;
      // Very rarely a heart instead of a leaf
      if (Math.random() < 0.02) {
        // (the GREED curse: no new hearts)
        if (!s.perks.greed) s.hearts.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 2, taken: false });
      } else if (Math.random() < (upper >= 0 ? 0.8 : 0.5)) {
        s.leaves.push({ x: (i0 + k) * T + 1, y: (top - 1) * T + 1, taken: false });
      }
    }
  };

  // A wide pit with thin lines to hop across. The farther you go, the shorter and thinner they get.
  const addLineBridge = (zone: number, progress: number) => {
    const s = state.current;
    const i0 = s.cols.length;
    const gapW = 6 + Math.floor(Math.random() * 4);
    const lineLen = Math.max(1, 3 - Math.floor(progress * 3));
    const th = Math.max(2, 5 - Math.floor(progress * 4));
    // After 10k the lines vanish a few seconds after you touch them (faster after 15k)
    const fragile = s.score >= 15000 ? 0.6 : s.score >= 10000 ? 1.3 : 0;
    for (let k = 0; k < gapW; k++) s.cols.push(makeCol(-1, zone));
    let row = s.genGround - 2;
    let o = 1;
    while (o + lineLen <= gapW - 1) {
      for (let k = 0; k < lineLen; k++) {
        const c = s.cols[i0 + o + k];
        c.line = row;
        c.lineTh = th;
        c.fragile = fragile;
      }
      if (Math.random() < 0.5) s.leaves.push({ x: (i0 + o) * T + 1, y: (row - 1) * T + 1, taken: false });
      o += lineLen + 1 + (Math.random() < progress ? 1 : 0);
      row = Math.max(3, Math.min(s.genGround - 1, row + Math.floor(rand(-1, 1.99))));
    }
  };

  // A pipe down into the SoundCloud Void (one per zone)
  const addPipe = (zone: number) => {
    const s = state.current;
    const g = s.genGround;
    const top = g - 2;
    s.cols.push(makeCol(g, zone));
    s.cols.push(makeCol(top, zone, { pipe: 1 }));
    s.cols.push(makeCol(top, zone, { pipe: 2 }));
    s.cols.push(makeCol(g, zone));
  };

  // Builds the level a bit ahead of the camera. Gets harder the farther you go.
  const generateUpTo = (col: number) => {
    const s = state.current;
    if (s.inBonus || s.levelMode) return; // levels are hand-made, nothing random gets added
    while (s.cols.length <= col) {
      const i = s.cols.length;
      const zone = zoneOf(i);
      const zoneIndex = Math.floor(i / ZONE_LEN);
      const progress = Math.min(1, i / 900); // reaches full difficulty after ~900 tiles

      // Safe start, and a calm flat bit at the start of every new zone
      if (i < 18 || i % ZONE_LEN < 5) {
        if (i >= 18 && i % ZONE_LEN === 0) s.genGround = 8;
        s.cols.push(makeCol(i < 18 ? 8 : s.genGround, zone));
        continue;
      }

      if (s.genFlat > 0) {
        s.genFlat -= 1;
        s.cols.push(makeCol(s.genGround, zone));
        // every spin prize you hold adds monsters, and the SWARM curse adds a lot more
        const more = Math.min(MONSTER_MAX, hardness() * perkPressure() * (s.perks.swarm ? SWARM_MONSTERS : 1));
        if (s.genFlat > 1 && zone !== Z_CLOUDS && Math.random() < (0.05 + progress * 0.09 + (zone === 1 ? 0.03 : 0)) * more) {
          if (progress > 0.02 && Math.random() < EYE_PERCENT) addEye(i, s.genGround, progress);
          else addWalker(i, s.genGround, progress);
        }
        if (progress > 0.06 && Math.random() < (0.015 + progress * 0.035 + (zone === Z_CLOUDS || zone === Z_TREES ? 0.03 : 0)) * more) {
          addFlyer(i, s.genGround, progress);
        }
        continue;
      }

      // The troll's arena: a flat screen-wide floor with a ? stash box at each end (they refill during the fight)
      if (s.bossState === "none" && s.score >= BOSS_EVERY * (s.bossCount + 1) - 300) {
        s.bossState = "placed";
        s.genGround = 8;
        // a flat run-up to the arena with the boss's sign in it (the camera locks once the arena is on screen)
        const runUp = s.cols.length;
        for (let k = 0; k < 9; k++) s.cols.push(makeCol(8, zoneOf(s.cols.length)));
        s.signs = s.signs.filter((sg) => sg.x > s.cam - 800);
        s.signs.push({ x: (runUp + 2) * T, text: RUN_BOSS_SIGNS[bossKindAt(s.bossCount)], r: BOSS_SIGN_RANGE });
        s.bossCol = s.cols.length;
        for (let k = 0; k < BOSS_ARENA; k++) {
          const c = makeCol(8, zoneOf(s.cols.length));
          // (TOMBFELL's and the skeleton knight's arenas are a bare floor: their armour eats every shot, so no stash boxes.)
          const nextKind = bossKindAt(s.bossCount);
          const bare = nextKind === "tombfell" || nextKind === "skeleton";
          if (!bare && (k === 2 || k === 18)) c.bonus = 5;
          if (!bare && (k === 7 || k === 8)) c.block = 4;
          s.cols.push(c);
        }
        s.genFlat = 4;
        continue;
      }

      // Bonus pipe halfway through each zone
      if (i % ZONE_LEN > 60 && !s.pipeZones.includes(zoneIndex)) {
        s.pipeZones.push(zoneIndex);
        addPipe(zone);
        s.genFlat = 3;
        continue;
      }

      const r = Math.random();
      const lineChance = progress < 0.1 ? 0 : zone === Z_CLOUDS ? 0.3 : zone === Z_SMOKE ? 0.2 : 0.14;

      if (r < lineChance) {
        addLineBridge(zone, progress);
        s.genFlat = 3 + Math.floor(Math.random() * 3);
        continue;
      }

      if (zone === 2) {
        // ROOFTOPS: narrow pillars at different heights with gaps between
        if (r < 0.75) {
          const count = 3 + Math.floor(Math.random() * 4);
          for (let k = 0; k < count; k++) {
            const gap = Math.random() < 0.35 + progress * 0.3 ? 2 : 1;
            for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
            let delta = Math.floor(rand(-2, 2.99));
            if (gap === 2 && delta < -1) delta = -1;
            s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
            const width = Math.random() < 0.35 ? 1 : 2;
            for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
            if (Math.random() < 0.3) {
              s.leaves.push({ x: (s.cols.length - 1) * T + 1, y: (s.genGround - 2) * T, taken: false });
            }
          }
        } else {
          addPlatforms(zone);
        }
        s.genFlat = 3 + Math.floor(Math.random() * 4);
        continue;
      }

      if (zone === Z_TREES && r < lineChance + 0.3) {
        // TWISTED TREES: a gap with a crooked branch floating in the middle
        const gapW = 3 + Math.floor(Math.random() * (progress > 0.5 ? 3 : 2));
        const i0 = s.cols.length;
        for (let k = 0; k < gapW; k++) s.cols.push(makeCol(-1, zone));
        const mid = i0 + Math.floor(gapW / 2) - 1;
        const row = s.genGround - 1 - Math.floor(Math.random() * 2);
        s.cols[mid].block = row;
        s.cols[mid + 1].block = row;
        if (Math.random() < 0.6) s.leaves.push({ x: mid * T + 9, y: (row - 1) * T + 1, taken: false });
        const delta = Math.floor(rand(-1, 1.99));
        s.genGround = Math.max(6, Math.min(8, s.genGround + delta));
        s.genFlat = 3 + Math.floor(Math.random() * 3);
        continue;
      }

      if (zone === Z_CLOUDS || zone === Z_SMOKE) {
        // PINK CLOUDS: fluffy islands floating in the sky
        // SMOKE OCEAN: puffs of smoke floating on a sea of smoke
        const count = 2 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k++) {
          const gap = 1 + Math.floor(Math.random() * (progress > 0.5 ? 3 : 2));
          for (let g2 = 0; g2 < gap; g2++) s.cols.push(makeCol(-1, zone));
          let delta = Math.floor(rand(-1, 1.99));
          if (gap >= 2 && delta < 0) delta = 0;
          s.genGround = Math.max(5, Math.min(8, s.genGround + delta));
          const width = 2 + Math.floor(Math.random() * 4);
          const start = s.cols.length;
          for (let w2 = 0; w2 < width; w2++) s.cols.push(makeCol(s.genGround, zone));
          if (Math.random() < 0.5) {
            s.leaves.push({ x: (start + Math.floor(width / 2)) * T + 1, y: (s.genGround - 2) * T, taken: false });
          }
        }
        s.genFlat = 2 + Math.floor(Math.random() * 3);
        continue;
      }

      if (r < lineChance + 0.24 + progress * 0.12) {
        // A pit, 2 to 3 tiles wide
        const width = Math.random() < 0.3 + progress * 0.4 ? 3 : 2;
        for (let k = 0; k < width; k++) s.cols.push(makeCol(-1, zone));
        if (Math.random() < 0.5) {
          s.leaves.push({ x: (i + width / 2) * T - 7, y: (s.genGround - 3) * T, taken: false });
        }
      } else if (r < (zone === 1 ? 0.62 : 0.5)) {
        // Step up or down (SPEAKER HILLS: bigger steps)
        const size = zone === 1 && Math.random() < 0.5 ? 2 : 1;
        const next = Math.max(zone === 1 ? 5 : 6, Math.min(8, s.genGround + (Math.random() < 0.5 ? -size : size)));
        s.genGround = next;
        s.cols.push(makeCol(next, zone));
      } else {
        addPlatforms(zone);
      }
      s.genFlat = 3 + Math.floor(Math.random() * (7 - progress * 3));
    }
  };

  // Spells a word with small weed leaves. x, y = top-left corner in pixels. Returns the width.
  const spellLeaves = (leaves: Leaf[], text: string, x: number, y: number) => {
    let cx = x;
    for (const ch of text) {
      if (ch === " ") {
        cx += 16;
        continue;
      }
      const glyph = LEAF_FONT[ch];
      if (!glyph) continue;
      for (let r = 0; r < glyph.length; r++) {
        for (let c = 0; c < glyph[r].length; c++) {
          if (glyph[r][c] === "#") leaves.push({ x: cx + c * 8, y: y + r * 8, taken: false, small: true });
        }
      }
      cx += (glyph[0].length + 1) * 8;
    }
    return cx - x;
  };

  const textWidth = (text: string) => {
    let w = 0;
    for (const ch of text) w += ch === " " ? 16 : ((LEAF_FONT[ch]?.[0].length ?? 0) + 1) * 8;
    return w;
  };

  // The bonus room: SoundCloud Void. There are several different rooms, you get a random one
  // (never the same one twice in a row). Each has a pipe out at the end.
  const VOID_MAPS = 7;
  const buildVoid = (which: number) => {
    const cols: Column[] = [];
    const leaves: Leaf[] = [];
    const hearts: Heart[] = [];

    // Empty room: walls at both ends, floor at row 8, and the pipe out near the end
    const room = (len: number) => {
      for (let i = 0; i < len; i++) {
        if (i === 0 || i === len - 1) cols.push(makeCol(0, VOID_ZONE));
        else cols.push(makeCol(8, VOID_ZONE));
      }
      for (const [k, half] of [
        [len - 4, 1],
        [len - 3, 2],
      ]) {
        cols[k].ground = 6;
        cols[k].pipe = half;
        cols[k].pipeOut = true;
      }
    };
    const floorLeaves = (from: number, to: number) => {
      for (let i = from; i < to; i++) leaves.push({ x: i * T + 1, y: 7 * T + 1, taken: false });
    };

    if (which === 1) {
      // THE STAIRS: a staircase up to the heart and back down
      const len = 38;
      room(len);
      const steps = [7, 6, 5, 4, 3, 3, 4, 5, 6, 7];
      steps.forEach((row, k) => {
        for (let j = 0; j < 2; j++) {
          const i = 6 + k * 2 + j;
          cols[i].block = row;
          leaves.push({ x: i * T + 1, y: (row - 1) * T + 1, taken: false });
        }
      });
      floorLeaves(2, 6);
      floorLeaves(27, len - 5);
      hearts.push({ x: 15 * T + 9, y: 1 * T + 4, taken: false });
    } else if (which === 2) {
      // FOLLOW ME ON SOUNDCLOUD! spelled in leaves, jump through the letters to grab them
      const text = "FOLLOW ME ON SOUNDCLOUD!";
      const len = Math.ceil(textWidth(text) / T) + 14;
      room(len);
      spellLeaves(leaves, text, 4 * T, 56);
      // a thin line near the end with the heart on it
      for (let i = len - 9; i <= len - 7; i++) {
        cols[i].line = 4;
        cols[i].lineTh = 3;
      }
      hearts.push({ x: (len - 8) * T + 1, y: 3 * T + 2, taken: false });
    } else if (which === 3) {
      // ZIGZAG: thin lines going up and down like a sound wave
      const len = 40;
      room(len);
      const rows = [6, 5, 4, 3, 2, 3, 4, 5, 6];
      rows.forEach((row, k) => {
        for (let j = 0; j < 3; j++) {
          const i = 5 + k * 3 + j;
          cols[i].line = row;
          cols[i].lineTh = 3;
          leaves.push({ x: i * T + 1, y: (row - 1) * T + 1, taken: false });
        }
      });
      floorLeaves(2, len - 5);
      hearts.push({ x: 18 * T + 1, y: 1 * T + 4, taken: false });
    } else if (which === 4) {
      // Two lines of words: FOLLOW ME up on a ledge, ON SOUNDCLOUD down below
      const low = "ON SOUNDCLOUD";
      const high = "FOLLOW ME";
      const len = Math.ceil(textWidth(low) / T) + 12;
      room(len);
      spellLeaves(leaves, low, 4 * T, 80);
      const hx = 4 * T + Math.floor((textWidth(low) - textWidth(high)) / 2 / 8) * 8;
      spellLeaves(leaves, high, hx, 16);
      // the ledge under FOLLOW ME, with brick steps up to it
      const l0 = Math.floor(hx / T) - 1;
      const l1 = Math.ceil((hx + textWidth(high)) / T);
      for (let i = l0; i <= l1; i++) {
        cols[i].line = 4;
        cols[i].lineTh = 3;
      }
      cols[l0 - 2].block = 6;
      cols[l0 - 3].block = 6;
      hearts.push({ x: (l1 + 2) * T + 1, y: 5 * T + 4, taken: false });
      cols[l1 + 2].block = 6;
    } else if (which === 5) {
      // THE LAUNCH: trampolines shoot you up a tower of ledges, right up past the top of the screen.
      // Leaves all the way up, a heart on the top ledge, and the pipe out is at the very top.
      // (A jump reaches about 3 tiles, a trampoline about 7: every step below is made to fit that.)
      const len = 36;
      for (let i = 0; i < len; i++) cols.push(makeCol(i === 0 ? 0 : 8, VOID_ZONE));
      cols[8].spring = true; // the first trampoline: it throws you onto the first tower
      cols[9].spring = true;
      for (let i = 12; i <= 14; i++) cols[i].ground = 3; // the first tower
      cols[14].spring = true; // its trampoline: it throws you up to the first ledge
      cols[15].spring = true; // (a second one down on the floor, so you can always get back up if you fall)
      cols[16].spring = true;
      for (let i = 17; i <= 21; i++) {
        cols[i].line = -3; // the first ledge (above the top of the screen)
        cols[i].lineTh = 3;
      }
      for (let i = 24; i <= 28; i++) {
        cols[i].line = -6; // the second ledge
        cols[i].lineTh = 3;
      }
      cols[29].ground = -9; // the top: a pillar with the pipe out on it
      cols[30].ground = -9;
      cols[30].pipe = 1;
      cols[30].pipeOut = true;
      cols[31].ground = -9;
      cols[31].pipe = 2;
      cols[31].pipeOut = true;
      for (let i = 32; i < len; i++) cols[i].ground = -14; // a tall wall at the end, so nobody can walk off the top
      const leaf = (col: number, row: number) => leaves.push({ x: col * T + 1, y: row * T + 1, taken: false });
      for (let i = 2; i <= 6; i++) leaf(i, 7); // warm-up leaves on the floor
      [[9, 5], [10, 3], [11, 2], [12, 1], [13, 1]].forEach(([c, r]) => leaf(c, r)); // the arc over to the tower
      leaf(12, 2);
      leaf(13, 2);
      [[15, 0], [16, -2], [17, -3]].forEach(([c, r]) => leaf(c, r)); // the arc up to the first ledge
      for (let i = 18; i <= 20; i++) leaf(i, -4); // on the first ledge
      for (let i = 25; i <= 27; i++) leaf(i, i === 26 ? -9 : -7); // on the second ledge
      hearts.push({ x: 26 * T + 1, y: -8 * T + 4, taken: false });
    } else if (which === 6) {
      // BOUNCE HOUSE: a floor of trampolines. Bounce along, grab the leaves hanging in the air, land on the ledge for the heart.
      const len = 34;
      room(len);
      for (const p of [5, 11, 17, 23]) {
        cols[p].spring = true;
        cols[p + 1].spring = true;
        [[2, 5], [3, 3], [4, 2], [5, 3]].forEach(([dx, r]) => leaves.push({ x: (p + dx) * T + 1, y: r * T + 1, taken: false }));
      }
      for (let i = 14; i <= 16; i++) {
        cols[i].line = 3;
        cols[i].lineTh = 3;
      }
      hearts.push({ x: 15 * T + 1, y: 1 * T + 4, taken: false });
      for (let i = 2; i < 5; i++) leaves.push({ x: i * T + 1, y: 7 * T + 1, taken: false });
    } else {
      // THE CLASSIC: bricks, a thin line up high and a wave of leaves
      const len = 36;
      room(len);
      for (let i = 8; i <= 12; i++) cols[i].block = 5;
      for (let i = 20; i <= 24; i++) cols[i].block = 5;
      for (let i = 14; i <= 18; i++) {
        cols[i].line = 3;
        cols[i].lineTh = 3;
      }
      floorLeaves(3, len - 6);
      for (let i = 8; i <= 12; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
      for (let i = 20; i <= 24; i++) leaves.push({ x: i * T + 1, y: 4 * T + 1, taken: false });
      for (let i = 14; i <= 18; i++) leaves.push({ x: i * T + 1, y: 2 * T + 1, taken: false });
      for (let i = 3; i < 7; i++) leaves.push({ x: i * T + 1, y: (5 - Math.abs(i - 5)) * T, taken: false });
      hearts.push({ x: 16 * T + 1, y: 1 * T + 4, taken: false });
    }
    return { cols, leaves, hearts };
  };

  // The secret area left of the start: flat ground, a sign, and the jetpack on a little brick shelf
  const buildEgg = () => {
    const cols: Column[] = [];
    for (let k = 0; k < EGG_COLS; k++) cols.push(makeCol(8, 0)); // index 0 = column -1, 1 = column -2 ...
    cols[12].block = 6; // column -13
    cols[13].block = 6; // column -14
    return cols;
  };

  const colAt = (col: number): Column => {
    const s = state.current;
    if (s.inBonus) return s.cols[col] || makeCol(0, VOID_ZONE);
    if (col < 0) return s.eggCols[-col - 1] || makeCol(0, 0); // secret area, then a wall
    generateUpTo(col + 2);
    return s.cols[col] || makeCol(0, LEVEL_ZONE); // past the end of a level: a wall
  };

  // Ground and bonus blocks are solid. Bricks and thin lines are "one-way": you land on them from above.
  const solidAt = (px: number, py: number) => {
    const col = Math.floor(px / T);
    const row = Math.floor(py / T);
    if (row >= ROWS) return false;
    if (row < 0) {
      // Above the top of the screen nothing is solid, except the tall pillars of the Void rooms that
      // climb up there (a column whose ground is -2 or less starts that many rows up).
      if (!state.current.inBonus) return false;
      const hc = colAt(col);
      return hc.ground <= -2 && row >= hc.ground;
    }
    const c = colAt(col);
    if (c.bonus >= 0 && row === c.bonus) return true;
    return (c.ground >= 0 || c.ground <= -2) && row >= c.ground; // (-1 = a pit)
  };

  const oneWayTopsAt = (px: number) => {
    const c = colAt(Math.floor(px / T));
    const tops: number[] = [];
    if (c.block >= 0) tops.push(c.block * T);
    if (c.block2 >= 0) tops.push(c.block2 * T);
    if (c.line !== -1) tops.push(c.line * T); // (-1 = none; a Void ledge can sit above the screen, at a row below -1)
    return tops;
  };

  // Is anything solid inside this box?
  const boxHits = (x: number, y: number, w: number, h: number) => {
    for (let yy = y; yy < y + h; yy += 8) {
      for (let xx = x; xx < x + w; xx += 8) {
        if (solidAt(xx, yy)) return true;
      }
      if (solidAt(x + w - 0.01, yy)) return true;
    }
    for (let xx = x; xx < x + w; xx += 8) if (solidAt(xx, y + h - 0.01)) return true;
    return solidAt(x + w - 0.01, y + h - 0.01);
  };

  const groundYAt = (col: number) => {
    const c = colAt(col);
    return c.ground >= 0 && c.pipe === 0 ? c.ground * T : -1;
  };

  const placeOnGroundNear = (x: number) => {
    const s = state.current;
    let col = Math.max(0, Math.floor(x / T));
    for (let k = 0; k < 40; k++) {
      const gy = groundYAt(col + k);
      const gy2 = groundYAt(col + k + 1);
      if (gy >= 0 && gy2 >= 0 && gy === gy2) {
        col = col + k;
        s.x = col * T;
        s.y = gy - SPRITE_H;
        break;
      }
    }
    s.vx = 0;
    s.vy = 0;
    for (const e of s.enemies) if (Math.abs(e.x - s.x) < 60) e.alive = false;
  };

  const newGame = () => {
    const s = state.current;
    s.inBonus = false;
    s.saved = null;
    s.cols = [];
    s.enemies = [];
    s.leaves = [];
    s.hearts = [];
    s.powerups = [];
    s.fireballs = [];
    s.particles = [];
    s.bubbles = [];
    s.smoke = [];
    s.lasers = [];
    s.popups = [];
    s.pipeZones = [];
    s.power = "none";
    s.ammo = 0;
    s.fireTime = 0;
    s.doubleJumps = 0;
    s.airJumped = false;
    s.hinted = [];
    s.hintTime = 0;
    s.eggCols = buildEgg();
    s.eggOpen = true;
    s.jetItem = { x: -14 * T + 7, y: 6 * T - 18 };
    s.jetpack = false;
    s.flying = false;
    s.jetFuel = JET_FUEL_MAX;
    s.camY = 0;
    s.killStreak = 0;
    s.killStreakTimer = 0;
    s.pauseChoice = 0;
    s.followShown = false;
    s.goldDone = false;
    s.goldLeaf = null;
    stopStutters();
    s.bossState = "none";
    s.bossCount = 0;
    s.boss = null;
    s.bossRefill = 0;
    // spin prizes only last one run
    s.perks = noPerks();
    s.shield = 0;
    s.sipFuel = 0;
    s.freeJumped = false;
    s.reviveUsed = false;
    s.pet = null;
    s.wax = false;
    s.waxWait = 0;
    s.waxT = 0;
    s.waxSnap = null;
    s.waxTest = false;
    s.waxTrip = 0;
    s.spin = null;
    s.spinQueue = [];
    s.spinWait = 0;
    s.startSpinDone = false;
    s.cp = null;
    s.cpCol = -1;
    s.hitsTaken = 0;
    s.cpDeaths = 0;
    s.wing = -1;
    s.statues = [];
    s.torches = [];
    s.dark = 0;
    s.blizzard = 0;
    s.flakes = [];
    s.icicles = [];
    s.icicleTimer = 0;
    s.cover = [];
    s.medal = null;
    s.zoneMarks = [{ score: 0, zone: 0 }];
    // reset the score first: the level builder looks at it (the old score made the troll appear right away)
    s.score = 0;
    s.farthest = 0;
    s.bonus = 0;
    s.zoneShown = 0;
    s.flash = 0;
    s.genGround = 8;
    s.genFlat = 0;
    generateUpTo(40);
    s.x = 40;
    s.y = 8 * T - SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.cam = 0;
    s.facing = 1;
    s.score = 0;
    s.farthest = 0;
    s.bonus = 0;
    s.lives = RUN_LIVES; // (a level sets its own 2 hearts right after this)
    s.invuln = 0;
    s.runTime = 0;
    s.testRun = false;
    s.levelMode = false;
    s.levelTime = 0;
    s.bong = null;
    s.signs = [];
    s.lboss = null;
    s.lbossState = "none";
    s.kboss = null;
    s.karenas = [];
    s.kwaves = [];
    s.kshots = [];
    s.knockT = 0;
    s.kfinalCol = 0;
    s.tboss = null;
    s.tarena = -1;
    s.tfinalCol = 0;
    s.woodsPaint = 0;
    s.woodsGlitch = 0;

    // Test shortcut: start right at the zone from the address bar (?zone=...), localhost only
    const tz = testStartZone();
    if (tz > 0) {
      const col0 = tz * ZONE_LEN;
      generateUpTo(col0 + 40);
      let c = col0 + 1;
      while (c < col0 + 30 && (colAt(c).ground < 0 || colAt(c).pipe)) c++;
      s.x = c * T;
      s.y = colAt(c).ground * T - SPRITE_H;
      s.cam = s.x - 40;
      s.farthest = s.x;
      s.eggOpen = false;
      s.zoneShown = tz;
      s.zoneMarks = [{ score: 0, zone: tz % ZONE_NAMES.length }];
      s.lives = RUN_LIVES;
      s.testRun = true;
      s.flash = 3;
      s.flashText = `TEST: ${ZONE_NAMES[tz]}`;
    }
  };

  const jump = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (s.onGround || s.coyote > 0) {
      s.vy = JUMP;
      s.onGround = false;
      s.coyote = 0;
      s.airJumped = false;
      s.freeJumped = false;
      playJump();
    } else if (s.perks.airJump > 0 && !s.freeJumped) {
      // AIR JUMP (a spin prize): one free extra jump every time you're in the air.
      // (A turquoise leaf or a boss fight still gives you one more on top of it.)
      s.freeJumped = true;
      s.vy = JUMP * 0.92;
      burst(s.x + SPRITE_W / 2, s.y + SPRITE_H, 12, TURQ, 50);
      playDoubleJump();
    } else if ((s.doubleJumps > 0 || (s.bossState === "fight" && !(s.kboss && s.kboss.kind === "horned"))) && !s.airJumped) {
      // Double jump (turquoise leaf): one extra jump per time in the air. Free during a boss fight
      // (except the horned warrior in Level 3: there you only get the ones you have).
      if (s.bossState !== "fight" || (s.kboss && s.kboss.kind === "horned")) s.doubleJumps -= 1;
      s.airJumped = true;
      s.vy = JUMP * 0.92;
      burst(s.x + SPRITE_W / 2, s.y + SPRITE_H, 12, TURQ, 50);
      playDoubleJump();
    }
  };

  const burst = (x: number, y: number, count: number, colors: string[], power: number) => {
    const s = state.current;
    if (s.particles.length > 700) return; // (never let them pile up)
    for (let i = 0; i < count; i++) {
      s.particles.push({
        x,
        y,
        vx: rand(-power, power),
        vy: rand(-power * 1.4, power * 0.4),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: rand(0.4, 1.0),
      });
    }
  };

  const popup = (x: number, y: number, text: string) => {
    state.current.popups.push({ x, y, text, life: 0.9 });
  };

  // Do you have shots right now? (fire needs time left on its timer, ice doesn't have a timer)
  const hasFire = () => {
    const s = state.current;
    if (s.power === "fire") return s.ammo > 0 && s.fireTime > 0;
    if (s.power === "ice" || s.power === "spike") return s.ammo > 0;
    return false;
  };

  const showHint = (key: string, text: string) => {
    const s = state.current;
    if (s.hinted.includes(key)) return;
    s.hinted.push(key);
    s.hintText = text;
    s.hintTime = 4; // seconds the hint stays up
  };

  // Shoot one fireball (F / X / ↓, or the handheld's fire button)
  const shoot = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    if (!hasFire()) return;
    if (s.power === "spike") {
      // SPIKE SHOT: one burst of spikes flying out in every direction
      if (s.fireballs.some((f) => f.spike)) return; // wait until the last burst is gone
      s.ammo -= 1;
      s.spikeVolley += 1;
      const cx = s.x + SPRITE_W / 2 - 2;
      const cy = s.y + 22;
      for (let i = 0; i < SPIKE_COUNT; i++) {
        const a = (i / SPIKE_COUNT) * Math.PI * 2;
        s.fireballs.push({
          x: cx + Math.cos(a) * 6,
          y: cy + Math.sin(a) * 6,
          vx: Math.cos(a) * SPIKE_SPEED,
          vy: Math.sin(a) * SPIKE_SPEED,
          life: SPIKE_LIFE,
          ice: false,
          spike: true,
          volley: s.spikeVolley,
        });
      }
      burst(cx + 2, cy + 2, 10, SPIKE, 50);
      playSpike();
      petShoot(s.facing * PET_SHOT_SPEED, 0); // your dog shoots along
      if (s.ammo <= 0) {
        s.power = "none";
        s.fireTime = 0;
      }
      return;
    }
    if (s.fireballs.filter((f) => !f.pet).length >= 2) return; // (the dog's shots don't count)
    const ice = s.power === "ice";
    s.ammo -= 1;
    s.fireballs.push({
      x: s.x + (s.facing > 0 ? SPRITE_W - 4 : 0),
      y: s.y + (ice ? 24 : 16), // ice flies straight at waist height
      vx: s.facing * (ice ? ICE_SPEED : FIREBALL_SPEED),
      vy: ice ? 0 : 40,
      life: ice ? 1.2 : 1.6,
      ice,
    });
    if (ice) playIce();
    else playFireball();
    petShoot(s.facing * PET_SHOT_SPEED, 0); // your dog shoots along
    if (s.ammo <= 0) {
      s.power = "none";
      s.fireTime = 0;
    }
  };

  // Standing on a pipe and pressing down: into the SoundCloud Void (or back out)
  const pipeUnderFeet = () => {
    const s = state.current;
    if (!s.onGround) return -1;
    const cx = s.x + HB_X + HB_W / 2;
    const col = Math.floor(cx / T);
    const c = colAt(col);
    if (c.pipe === 0 || c.pipeUsed) return -1;
    const feet = s.y + HB_Y + HB_H;
    if (Math.abs(feet - c.ground * T) > 2) return -1;
    return c.pipe === 1 ? col : col - 1;
  };

  const down = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    const pipeCol = pipeUnderFeet();
    if (pipeCol >= 0) {
      s.mode = "pipe";
      s.pipeDir = s.inBonus ? -1 : 1;
      s.pipeTimer = 0.7;
      s.pipeCol = pipeCol;
      s.x = pipeCol * T + T - SPRITE_W / 2;
      s.vx = 0;
      s.vy = 0;
      playPipe();
      return;
    }
    shoot();
  };

  const enterVoid = () => {
    const s = state.current;
    s.saved = {
      cols: s.cols,
      enemies: s.enemies,
      leaves: s.leaves,
      hearts: s.hearts,
      powerups: s.powerups,
      cam: s.cam,
      pipeCol: s.pipeCol,
    };
    // Golden leaf time? Then it's one of the rooms without words (0, 1 or 3).
    // Rooms 2 and 4 spell out FOLLOW ME ON SOUNDCLOUD, so once you've seen either one
    // this game, they drop out of the pool (no reason to see the ad twice in one run).
    const gold = GOLD_LEAF_LIVE && !s.goldDone && s.score >= GOLD_AT;
    let which: number;
    if (gold) {
      const plain = [0, 1, 3].filter((m) => m !== s.lastVoid);
      which = plain[Math.floor(Math.random() * plain.length)];
    } else {
      const base = s.followShown ? [0, 1, 3, 5, 6] : [0, 1, 2, 3, 4, 5, 6];
      const pool = base.filter((m) => m !== s.lastVoid);
      which = pool[Math.floor(Math.random() * pool.length)];
    }
    if (which === 2 || which === 4) s.followShown = true;
    s.lastVoid = which;
    // pick a colour for this visit
    let pal = Math.floor(Math.random() * VOID_PALETTES.length);
    if (pal === s.voidPal) pal = (pal + 1 + Math.floor(Math.random() * (VOID_PALETTES.length - 1))) % VOID_PALETTES.length;
    s.voidPal = pal;
    const room = buildVoid(which);
    // where the golden leaf floats in each room (high up, you have to work for it)
    const goldSpot: Record<number, [number, number]> = { 0: [22, 2], 1: [21, 2], 3: [27, 2] };
    s.goldLeaf = gold ? { x: goldSpot[which][0] * T + 1, y: goldSpot[which][1] * T } : null;
    s.inBonus = true;
    s.cols = room.cols;
    s.leaves = room.leaves;
    s.hearts = s.perks.greed ? [] : room.hearts; // (the GREED curse: no hearts down here either)
    s.enemies = [];
    s.powerups = [];
    s.fireballs = [];
    s.cam = 0;
    s.camY = 0;
    s.x = 2 * T;
    s.y = -SPRITE_H;
    s.vx = 0;
    s.vy = 0;
    s.flash = which === 4 ? 0 : 2; // the two-line word room skips the title so it doesn't cover FOLLOW ME
    s.flashText = "SOUNDCLOUD VOID";
    s.mode = "running";
  };

  const leaveVoid = () => {
    const s = state.current;
    const saved = s.saved;
    s.inBonus = false;
    s.goldLeaf = null;
    stopStutters(); // the Stutters track only plays inside the Void
    if (!saved) return;
    s.cols = saved.cols;
    s.enemies = saved.enemies;
    s.leaves = saved.leaves;
    s.hearts = saved.hearts;
    s.powerups = saved.powerups;
    s.fireballs = [];
    s.cam = saved.cam;
    s.camY = 0;
    const pc = s.cols[saved.pipeCol];
    const pc2 = s.cols[saved.pipeCol + 1];
    if (pc) pc.pipeUsed = true;
    if (pc2) pc2.pipeUsed = true;
    s.saved = null;
    // Pop out of the pipe you went into
    s.x = saved.pipeCol * T + T - SPRITE_W / 2;
    s.y = (pc ? pc.ground * T : 6 * T) - SPRITE_H - 2;
    s.vy = -260;
    s.invuln = 1;
    s.mode = "running";
  };

  // The fight starts once the camera reaches the arena: the screen locks and the troll walks in
  const startBoss = () => {
    const s = state.current;
    s.bossState = "fight";
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      e.alive = false;
      e.squash = 0;
    }
    // The bosses take turns: the green troll, the purple giant, TOMBFELL, the troll again ...
    const next = bossKindAt(s.bossCount);
    if (next === "tombfell") {
      startRunTombfell();
      return;
    }
    if (next === "skeleton") {
      startRunSkeleton();
      return;
    }
    if (next === "snowman") {
      startRunSnowman();
      return;
    }
    const kind: "troll" | "giant" = next;
    // (the troll takes more hits every time round, and both get tougher with every spin prize you hold)
    const hp = (kind === "giant" ? GIANT_HP : BOSS_HP_START + bossRound() * 2 * BOSS_HP_STEP) + bossHpBonus();
    const bh = kind === "giant" ? GIANT_H : TR_H;
    s.boss = { x: s.cam + W - 50, y: 8 * T - bh, vx: 0, vy: 0, hp, maxHp: hp, hit: 0, jumpTimer: 2.2, facing: -1, dead: 0, kind, dazed: 0 };
    // Freeze and let the player pick a spell
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    s.spellChoice = 0;
    bossIntro(kind, "choose"); // his card first, then you pick your spell
  };

  // Which lap of the three bosses you're on: 0 = the first troll / giant / TOMBFELL, 1 = the second time round ...
  const bossRound = () => Math.floor(state.current.bossCount / RUN_BOSSES.length);
  // How fast this troll is (every time round they're faster)
  const bossSpeed = () => 1 + BOSS_SPEED_STEP * 2 * bossRound();

  // Picked a spell: you get it with a couple more shots than he needs, and free double jumps
  // ---------- Pink Levels ----------

  // Builds a level from its text map and puts you at the start
  const startLevel = (n: number) => {
    const def = LEVELS[n - 1];
    if (!def) return;
    newGame();
    const s = state.current;
    s.levelMode = true;
    s.lives = START_LIVES; // levels keep their own hearts: start with 2, collect up to 4
    s.level = n;
    s.levelTime = 0;
    s.eggCols = [];
    s.eggOpen = false;
    s.jetItem = null;
    s.goldLeaf = null;
    s.cols = [];
    s.enemies = [];
    s.leaves = [];
    s.hearts = [];
    s.signs = [];
    s.bong = null;
    s.lboss = null;
    s.lbossState = "none";
    s.kboss = null;
    s.karenas = [];
    s.kwaves = [];
    s.kshots = [];
    s.knockT = 0;
    s.kfinalCol = 0;
    s.tboss = null;
    s.tarena = -1;
    s.tfinalCol = 0;
    s.woodsPaint = 0;
    s.woodsGlitch = 0;
    try {
      levelMusicRef.current?.pause(); // every try starts from the first song again
    } catch {}
    levelMusicRef.current = null;
    levelMusicIdxRef.current = 0;
    levelMusicUserPausedRef.current = false;
    s.zoneMarks = [{ score: 0, zone: 0 }];
    s.zoneShown = 999; // no zone names in levels
    const map = def.map;
    const len = Math.max(...map.map((r) => r.length));
    let sign = 0;
    for (let c = 0; c < len; c++) {
      let ground = -1;
      for (let r = 0; r < map.length; r++) {
        if (map[r][c] === "#") {
          ground = r;
          break;
        }
      }
      const col = makeCol(ground, def.zone ?? LEVEL_ZONE);
      for (let r = 0; r < map.length; r++) {
        const ch = map[r][c];
        const x = c * T;
        if (ch === "=") col.block = r;
        else if (ch === "-") {
          col.line = r;
          col.lineTh = 3;
        } else if (ch === "?") col.bonus = r;
        else if (ch === "L") s.leaves.push({ x: x + 1, y: r * T + 1, taken: false });
        else if (ch === "C") s.leaves.push({ x: x + 1, y: r * T + 1, taken: false, coin: true });
        else if (ch === "H") s.hearts.push({ x: x + 1, y: r * T + 2, taken: false });
        else if (ch === "w") {
          addWalker(c, r + 1, 0);
          s.enemies[s.enemies.length - 1].phase = c % 2; // Level 3: 0 = skeleton, 1 = oni
        }
        else if (ch === "f") {
          addFlyer(c, r + 3, 0);
          s.enemies[s.enemies.length - 1].baseY = r * T;
          s.enemies[s.enemies.length - 1].y = r * T;
          if (def.zone === LEVEL_WOODS) s.enemies[s.enemies.length - 1].swooper = c % 2 === 0; // Level 4: every second dove dives at you
        } else if (ch === "b") addBear(c, r + 1);
        else if (ch === "T") {
          // TOMBFELL's arena
          s.tarena = c - 1;
          s.tfinalCol = c - 1;
          s.bossCol = c - 1; // the red mark on the progress line
        } else if (ch === "S") s.signs.push({ x, text: def.signs[sign++] ?? "" });
        else if (ch === "P") s.cpCol = c; // the checkpoint flag
        else if (ch === "X") s.statues.push({ x, timer: 1.6 + (s.statues.length % 2) * 1.2, act: "idle" }); // a shockwave statue
        else if (ch === "t") s.torches.push({ x, y: r * T, lit: false }); // a wall torch
        else if (ch === "A") {
          s.bossCol = c - 1;
          s.lbossState = "waiting";
        } else if (ch === "B") s.bong = { x: x - 2, y: (r + 1) * T - BONG_H };
        else if (ch === "M" || ch === "K" || ch === "W") {
          const kind: KnightKind = ch === "M" ? "horned" : ch === "K" ? "skeleton" : "warlord";
          s.karenas.push({ col: c - 1, kind });
          if (kind === "warlord") s.kfinalCol = c - 1;
          if (s.karenas.length === 1) s.bossCol = c - 1; // first red mark on the progress line
        }
      }
      s.cols.push(col);
    }
    s.x = 2 * T;
    s.y = 8 * T - SPRITE_H;
    s.cam = 0;
    s.farthest = s.x;
    // Level 1: BOBO, Pinkmane's real dog, is with you the whole way (he follows you and shoots when you shoot)
    if (BOBO_LEVELS.includes(n)) {
      s.perks.pet = 1;
      s.pet = newPet();
    }
    s.mode = "ready";
    loadBoard(levelGameId(n));
  };

  // ---------- LEVEL 3: the knights (horned warrior, skeleton knight, WARLORD COLOSSUS) ----------

  // His body box (where you can hit him / land on him)
  const knightBox = (kn: Knight) => {
    const d = KN_DIM[kn.kind];
    const a = kn.facing < 0 ? d.hb[0] : d.w - d.hb[1];
    const b = kn.facing < 0 ? d.hb[1] : d.w - d.hb[0];
    return { x1: kn.x + a, x2: kn.x + b, y1: kn.y + d.top, y2: kn.y + d.foot };
  };
  // The horned warrior's spiked ball, swinging round his hand on its chain
  const hornedHand = (kn: Knight) => ({ x: kn.x + (kn.facing < 0 ? 5 : KN_DIM.horned.w - 5), y: kn.y + 44 });
  const maceBall = (kn: Knight) => {
    const h = hornedHand(kn);
    const up = Math.min(kn.reach * 0.8, HORNED_BALL_UP);
    return { x: h.x + Math.cos(kn.ang) * kn.reach, y: Math.min(8 * T - 8, h.y + Math.sin(kn.ang) * up) };
  };
  // The skeleton knight's sword swing (the area in front of him). In the infinite run it doesn't reach as far.
  const skeletonReach = () => (state.current.levelMode ? SKELETON_REACH : RUN_SKELETON_REACH);
  const skeletonSwordBox = (kn: Knight) => {
    const b = knightBox(kn);
    const reach = skeletonReach();
    return kn.facing < 0
      ? { x1: b.x1 - reach, x2: b.x1 + 6, y1: kn.y + 16, y2: kn.y + 54 }
      : { x1: b.x2 - 6, x2: b.x2 + reach, y1: kn.y + 16, y2: kn.y + 54 };
  };
  // WARLORD's giant sword: k = 0 at his hand, 1 at the tip
  const warlordPivot = (kn: Knight) => ({ x: kn.x + (kn.facing < 0 ? WL_PIVOT.x : KN_DIM.warlord.w - WL_PIVOT.x), y: kn.y + WL_PIVOT.y });
  const swordAngle = (kn: Knight, a = kn.ang) => (kn.facing < 0 ? a : Math.PI - a);
  const knightSwordPoint = (kn: Knight, k: number) => {
    const p = warlordPivot(kn);
    const a = swordAngle(kn);
    const len = SW_GRIP * 2 * k;
    return { x: p.x + Math.cos(a) * len, y: p.y + Math.sin(a) * len };
  };

  // WARLORD's eyes, and one sound wave aimed right at you
  const warlordEye = (kn: Knight) => ({ x: kn.x + (kn.facing < 0 ? WL_EYES.x : KN_DIM.warlord.w - WL_EYES.x), y: kn.y + WL_EYES.y });
  const fireEyeWaves = (kn: Knight) => {
    const s = state.current;
    const e = warlordEye(kn);
    const tx = s.x + HB_X + HB_W / 2;
    const ty = s.y + HB_Y + HB_H / 2;
    const aim = Math.atan2(ty - e.y, tx - e.x);
    s.kshots.push({ x: e.x, y: e.y, vx: Math.cos(aim) * EYE_WAVE_SPEED, vy: Math.sin(aim) * EYE_WAVE_SPEED, life: 4 });
    beep(300, 1200, 0.35, 0.06, "sawtooth");
  };

  // How long until the next beat, if you start counting `lead` seconds from now (the Warlord's slams and eye waves land on it)
  const warlordBeatLen = () => 60 / WARLORD_BPM;
  const untilBeat = (lead: number) => {
    const b = warlordBeatLen();
    const t = state.current.t - WARLORD_BEAT_OFFSET;
    return Math.ceil((t + lead) / b) * b - t;
  };
  // PHASE 2 (at half health): two stone pillars rise out of the floor to hide behind, and he calls two skeletons in from the sides
  const startWarlordPhase2 = (kn: Knight) => {
    const s = state.current;
    kn.p2 = true;
    s.cover = [
      { x: s.cam + 78, rise: 0 },
      { x: s.cam + W - 96, rise: 0 },
    ];
    for (const side of [-1, 1]) {
      s.enemies.push({ kind: "walker", x: side < 0 ? s.cam + 6 : s.cam + W - 22, y: 8 * T - 14, vx: -side * 28, vy: 0, baseY: 0, phase: 0, alive: true, squash: 0, summoned: true, sv: 28 });
    }
    s.flash = 2.8;
    s.flashText = "HE CALLS THE SKELETONS! HIDE BEHIND THE PILLARS";
    s.shake = 0.3;
    playBump();
  };

  // The camera reached a knight's arena: lock the screen and bring him in
  const startKnight = () => {
    const s = state.current;
    const a = s.karenas.shift();
    if (!a) return;
    s.bossCol = a.col;
    s.bossState = "fight"; // locked screen + free double jumps, same as the other boss fights
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      // clear out the monsters on this screen only (the rest of the level keeps its monsters)
      if (e.x > s.cam - 2 * T && e.x < s.cam + W + 2 * T) {
        e.alive = false;
        e.squash = 0;
      }
    }
    const d = KN_DIM[a.kind];
    const hp = a.kind === "horned" ? HORNED_HP : a.kind === "skeleton" ? SKELETON_HP : WARLORD_HP;
    s.kboss = {
      kind: a.kind,
      x: s.cam + W - d.w - 16,
      y: 8 * T - d.foot,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      hit: 0,
      inv: 0,
      dead: 0,
      facing: -1,
      act: "walk",
      timer: 0,
      cool: 1.6,
      ang: a.kind === "warlord" ? SW_IDLE : 0,
      reach: 20,
      waves: 0,
    };
    s.kwaves = [];
    s.kshots = [];
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    if (a.kind === "horned") {
      // pick fire or ice first, like the other shooting bosses
      s.spellChoice = 0;
      bossIntro(a.kind, "choose"); // his card first, then you pick your spell
    } else {
      bossIntro(a.kind, "running"); // his card first, then the fight
      s.flash = 2.4;
      s.flashText = a.kind === "skeleton" ? "JUMP ON THE SKELETON KNIGHT!" : "WARLORD COLOSSUS! JUMP ON HIS HEAD!";
      s.hinted = s.hinted.filter((h) => h !== "bossjump");
      showHint("bossjump", "FREE DOUBLE JUMPS HERE!");
      s.hintTime = 4;
      playPowerUp();
    }
  };

  // ---------- LEVEL 4: PAINTED WORLD (TOMBFELL) ----------

  // A black bear standing on the ground of column i
  const addBear = (i: number, ground: number) => {
    state.current.enemies.push({
      kind: "bear",
      x: i * T,
      y: ground * T - BEAR_H,
      vx: -BEAR_SPEED,
      vy: 0,
      baseY: 0,
      phase: 0,
      alive: true,
      squash: 0,
      hp: BEAR_HP,
      timer: 0,
    });
  };
  // A jump on a bear's back (or a shot): the first one makes it angry, the second one beats it
  const hitBear = (e: Enemy) => {
    const s = state.current;
    e.hp = (e.hp ?? BEAR_HP) - 1;
    if (e.hp <= 0) {
      killEnemy(e, PTS_BEAR);
      return;
    }
    e.timer = 0.4; // can't be hit again for a moment
    e.vx = (s.x + SPRITE_W / 2 < e.x + BEAR_W / 2 ? -1 : 1) * BEAR_ANGRY_SPEED; // it turns on you
    popup(e.x + BEAR_W / 2, e.y - 6, "ANGRY!");
    burst(e.x + BEAR_W / 2, e.y + 6, 10, ["#ff2a2a", "#ff8f40", "#ffffff"], 60);
    playStomp();
    beep(160, 70, 0.3, 0.06, "sawtooth");
  };

  // Hangs the vines in TOMBFELL's arena (and takes the old ones down). Called when the fight
  // starts and after every hit: that's the world being "repainted".
  const paintVines = () => {
    const s = state.current;
    const tb = s.tboss;
    for (let k = 0; k < 21; k++) {
      const c = s.cols[s.bossCol + k];
      if (c) c.line = -1;
    }
    if (!tb || tb.dead > 0 || tb.part === 3) return; // no vines in the bear part: nowhere to hide
    const sets = tb.part === 1 ? TOMB_VINES_DOVES : TOMB_VINES_CATS;
    for (const [first, count, row] of sets[s.woodsPaint % sets.length]) {
      for (let k = first; k < first + count; k++) {
        const c = s.cols[s.bossCol + k];
        if (!c) continue;
        c.line = row;
        c.lineTh = 3;
        c.fragile = 0;
        c.crumble = -1;
      }
    }
  };

  // TOMBFELL in PINK RUN INFINITE (the boss at 15k): the quick version. He stands on the ground behind his
  // shield while cats drop in. Jump on a cat, kick the ball into him, 3 times.
  const startRunTombfell = () => {
    const s = state.current;
    s.tboss = {
      x: s.cam + W - TOMB_W - 12,
      y: -TOMB_H,
      hp: RUN_TOMB_HP,
      maxHp: RUN_TOMB_HP,
      part: 2,
      hit: 0,
      dead: 0,
      facing: -1,
      busy: 0,
      cast: 1.8,
      bump: 0,
      wallN: 0,
      side: 1,
      doves: [],
      cats: [],
      bear: null,
      fallen: false,
      short: true,
    };
    paintVines();
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    bossIntro("tombfell", "running"); // his card first, then the fight
    s.flash = 3;
    s.flashText = "JUMP ON A CAT, THEN KICK IT AT HIM!";
    s.hinted = s.hinted.filter((h) => h !== "bossjump");
    showHint("bossjump", "FREE DOUBLE JUMPS HERE!");
    s.hintTime = 4;
    playPowerUp();
  };

  // The EVIL SNOWMAN in PINK RUN INFINITE: the Level 2 fight. He stomps after you and hops; shots hurt him, and
  // once he's out of hits he gets dizzy and you finish him with a stomp. Like the troll you start with a few
  // shots and reload from the two ? stash boxes at the ends of the arena.
  const startRunSnowman = () => {
    const s = state.current;
    const hp = RUN_SNOWMAN_HP + bossRound() * BOSS_HP_STEP + bossHpBonus();
    s.lboss = {
      kind: "snowman",
      x: s.cam + W - 60,
      y: 8 * T - SN_H,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      hit: 0,
      dive: 0,
      diveTimer: 2.5,
      dead: 0,
      facing: -1,
      dazed: 0,
      speech: 3.5,
    };
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    s.spellChoice = 0;
    s.icicles = [];
    s.icicleTimer = ICICLE_FIRST;
    bossIntro("snowman", "choose"); // his card first, then you pick your spell
  };

  // The RED SKELETON KNIGHT in PINK RUN INFINITE: the Level 3 fight in new colours. Shots bounce off his
  // armour, so you jump over the slash and land on his head. Fewer stomps than in the level.
  const startRunSkeleton = () => {
    const s = state.current;
    const d = KN_DIM.skeleton;
    const hp = RUN_SKELETON_HP + Math.min(RUN_SKELETON_LAP_CAP, bossRound()) + Math.min(RUN_SKELETON_PERK_CAP, Math.ceil(bossHpBonus() / 4));
    s.kboss = {
      kind: "skeleton",
      x: s.cam + W - d.w - 16,
      y: 8 * T - d.foot,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      hit: 0,
      inv: 0,
      dead: 0,
      facing: -1,
      act: "walk",
      timer: 0,
      cool: 1.6,
      ang: 0,
      reach: 20,
      waves: 0,
    };
    s.kwaves = [];
    s.kshots = [];
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    bossIntro("runknight", "running"); // his card first, then the fight
    s.flash = 2.4;
    s.flashText = "JUMP ON THE SKELETON KNIGHT!";
    s.hinted = s.hinted.filter((h) => h !== "bossjump");
    showHint("bossjump", "FREE DOUBLE JUMPS HERE!");
    s.hintTime = 4;
    playPowerUp();
  };

  // You beat a boss in PINK RUN INFINITE (troll, snowman, giant, skeleton or TOMBFELL): points, the BOSS SPIN,
  // and after the one at 20k the wax moment.
  const runBossBeaten = (kind: RunBoss) => {
    const s = state.current;
    s.bossCount += 1; // the next one comes 5k later
    unlockOutfit("ghost");
    const pts =
      kind === "giant" ? PTS_GIANT : kind === "tombfell" ? PTS_TOMB : kind === "snowman" ? PTS_SNOWMAN : kind === "skeleton" ? PTS_SKELETON : PTS_BOSS;
    s.bonus += pts;
    s.flash = 2.5;
    s.flashText = `${kind.toUpperCase()} DOWN! +${pts}`;
    // leftover shots stay, but back to normal rules
    if (s.power === "fire") s.fireTime = Math.min(s.fireTime, fireTimeMax());
    s.ammo = Math.min(s.ammo, fireAmmo());
    // BOSS SPIN: a bonus turn on the prize machine, with the rarer prizes
    s.spinQueue.push(true);
    s.spinWait = Math.max(s.spinWait, SPIN_BOSS_DELAY);
    // the boss at 20,000 grams: time for some wax (once per run, and it comes before the spin)
    if (!s.wax && s.bossCount * BOSS_EVERY >= WAX_AT) s.waxWait = WAX_DELAY;
  };

  // The camera reached TOMBFELL's arena: lock the screen and bring him in
  const startTombfell = () => {
    const s = state.current;
    if (s.tarena < 0) return;
    s.bossCol = s.tarena;
    s.tarena = -1;
    s.bossState = "fight"; // locked screen + free double jumps, same as the other boss fights
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      // clear out the animals on this screen
      if (e.x > s.cam - 2 * T && e.x < s.cam + W + 2 * T) {
        e.alive = false;
        e.squash = 0;
      }
    }
    s.tboss = {
      x: s.cam + W / 2 - TOMB_W / 2,
      y: 50,
      hp: TOMB_HP,
      maxHp: TOMB_HP,
      part: 1,
      hit: 0,
      dead: 0,
      facing: -1,
      busy: 0,
      cast: 1.8,
      bump: 0,
      wallN: 0,
      side: 1,
      doves: [],
      cats: [],
      bear: null,
      fallen: false,
    };
    paintVines();
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    bossIntro("tombfell", "running"); // his card first, then the fight
    s.flash = 2.4;
    s.flashText = "DODGE THE DOVES, JUMP ON THE PINK ONE!";
    s.hinted = s.hinted.filter((h) => h !== "bossjump");
    showHint("bossjump", "FREE DOUBLE JUMPS HERE!");
    s.hintTime = 4;
    playPowerUp();
  };

  // Part 1: a wall of doves comes in from one edge (the "!" blinks there first). Low walls you
  // jump over, high walls you stay under. The top dove of every wall is the pink one.
  const sendDoveWall = (tb: Tomb) => {
    const s = state.current;
    tb.wallN += 1;
    const from = tb.wallN % 2 === 1 ? 1 : -1;
    const speed = DOVE_WALL_SPEED + (tb.maxHp - tb.hp) * DOVE_WALL_SPEED_UP;
    const ys = Math.random() < 0.5 ? DOVE_WALL_HIGH : DOVE_WALL_LOW;
    ys.forEach((y, i) =>
      tb.doves.push({ x: from > 0 ? s.cam + W + 2 : s.cam - 24, y, vx: -from * speed, vy: 0, pink: i === 0, state: "fly", wait: DOVE_WALL_WARN, from })
    );
    beep(900, 1500, 0.1, 0.03, "triangle");
    beep(900, 1500, 0.1, 0.03, "triangle", 0.14);
  };
  // The doves that are still flying get scared off (they can't hurt you any more)
  const scareDoves = (tb: Tomb) => {
    for (const d of tb.doves) {
      if (d.state !== "fly") continue;
      if (d.wait > 0) d.state = "gone";
      else {
        d.state = "flee";
        d.vy = -150;
      }
    }
  };

  // He's out of hits for this part: on to the cats (2) or the bear (3)
  const startTombPart = (part: 2 | 3) => {
    const s = state.current;
    const tb = s.tboss;
    if (!tb) return;
    tb.part = part;
    const youLeft = s.x + HB_X + HB_W / 2 < s.cam + W / 2;
    scareDoves(tb);
    if (part === 2) {
      tb.side = youLeft ? 1 : -1; // he lands on the far side from you
      tb.cast = 1.8;
      s.flash = 3;
      s.flashText = "JUMP ON A CAT, THEN KICK IT AT HIM!";
      return;
    }
    for (const c of tb.cats) burst(c.x + 7, c.y + 7, 8, GLITCH, 50);
    tb.cats = [];
    // the bear walks in on the far side from you, then runs at you
    const dir = youLeft ? -1 : 1;
    tb.bear = { x: dir < 0 ? s.cam + W + 8 : s.cam - GBEAR_W - 8, dir, act: "enter", timer: 0 };
    tb.fallen = false;
    // you pick your spell now: shots only hurt him once he's off the bear
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.spellChoice = 0;
    s.mode = "choose";
  };

  // TOMBFELL takes a hit (a pink dove, a kicked cat, or a shot once he's off the bear).
  // Every hit repaints the world: the screen glitches, the sky changes colour, the vines move.
  const hitTombfell = (sparks: string[]) => {
    const s = state.current;
    const tb = s.tboss;
    if (!tb || tb.dead > 0) return;
    const cx = tb.x + TOMB_W / 2;
    tb.hp -= 1;
    tb.hit = 0.6;
    tb.busy = 1.2;
    s.woodsPaint += 1;
    s.woodsGlitch = 0.5;
    burst(cx, tb.y + 22, 22, sparks, 90);
    burst(cx, tb.y + 22, 12, GLITCH, 110);
    s.shake = 0.2;
    playStomp();
    beep(80, 1600, 0.22, 0.05, "sawtooth");
    beep(1600, 80, 0.22, 0.04, "square", 0.1);
    if (tb.hp <= 0) {
      tb.hp = 0;
      tb.dead = 2;
      tb.doves = [];
      tb.cats = [];
      if (tb.bear) burst(tb.bear.x + GBEAR_W / 2, 8 * T - GBEAR_H / 2, 26, ["#231a16", "#a8743c", "#ffffff"], 90);
      tb.bear = null;
      paintVines();
      popup(cx, tb.y - 10, "GLITCHED OUT!");
      playTrollDeath();
      return;
    }
    popup(cx, tb.y - 10, `${tb.hp} LEFT`);
    const part = tb.short ? 2 : tb.hp > 2 * TOMB_PART_HP ? 1 : tb.hp > TOMB_PART_HP ? 2 : 3; // (the quick run fight stays on the cats)
    if (part !== tb.part && part !== 1) startTombPart(part);
    else if (tb.part === 1) {
      scareDoves(tb);
      tb.cast = 1.6;
    } else if (tb.part === 2) {
      tb.side = -tb.side; // he blinks over to the other side
      tb.x = tb.side > 0 ? s.cam + W - TOMB_W - 12 : s.cam + 12;
      tb.cast = 1.4;
    } else if (tb.bear) {
      // straight back on the bear, and it turns round for the next run
      tb.fallen = false;
      tb.bear.dir = -tb.bear.dir;
      tb.bear.act = "paw";
      tb.bear.timer = GBEAR_PAW + 0.5;
    }
    paintVines();
  };

  // You got hurt in his arena: his animals back off so you get a fair restart
  const resetTombfell = () => {
    const s = state.current;
    const tb = s.tboss;
    if (!tb || tb.dead > 0) return;
    tb.doves = [];
    tb.cats = [];
    tb.cast = 1.6;
    tb.busy = 0;
    if (tb.part === 2) {
      tb.side = 1;
      tb.x = s.cam + W - TOMB_W - 12;
    }
    if (tb.part === 3 && tb.bear) {
      tb.fallen = false;
      tb.bear.dir = -1;
      tb.bear.x = s.cam + W - GBEAR_W - 4;
      tb.bear.act = "paw";
      tb.bear.timer = GBEAR_PAW + 0.8;
    }
  };

  // Reads your best level times from this browser
  const loadLevelProgress = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(LEVEL_PROGRESS_KEY) || "{}");
      if (raw && typeof raw === "object") state.current.levelBest = raw;
    } catch {}
  };

  // The camera reached the arena: lock the screen, bring in the evil leaf, pick a spell
  const startLevelBoss = () => {
    const s = state.current;
    const def = LEVELS[s.level - 1];
    s.lbossState = "fight";
    s.bossState = "fight"; // shares the arena rules: locked screen, free double jumps, keep your spell
    s.cam = s.bossCol * T;
    s.bossRefill = 0;
    for (const e of s.enemies) {
      e.alive = false;
      e.squash = 0;
    }
    const hp = def?.bossHp ?? 10;
    const kind = def?.boss ?? "leaf";
    s.lboss = {
      kind,
      x: s.cam + W - 60,
      y: kind === "snowman" ? 8 * T - SN_H : 30,
      vx: 0,
      vy: 0,
      hp,
      maxHp: hp,
      hit: 0,
      dive: 0,
      diveTimer: 2.5,
      dead: 0,
      facing: -1,
      dazed: 0,
      speech: kind === "snowman" ? 3.5 : 0,
    };
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    s.spellChoice = 0;
    s.icicles = [];
    s.icicleTimer = ICICLE_FIRST;
    bossIntro(kind, "choose"); // his card first, then you pick your spell
  };

  const hitLevelBoss = (sparks: string[]) => {
    const s = state.current;
    const b = s.lboss;
    if (!b || b.dead > 0) return;
    const cx = b.x + (b.kind === "snowman" ? SN_W : EL_W) / 2;
    const cy = b.y + (b.kind === "snowman" ? SN_H : EL_H) / 2;
    b.hp -= 1; // every shot that touches it counts (ammo is tight)
    b.hit = 0.35;
    burst(cx, cy, 16, sparks, 70);
    s.shake = 0.1;
    playStomp();
    if (b.hp <= 0 && b.kind === "snowman") {
      // out of hits: he's dizzy, finish him by jumping on his head
      b.hp = 0;
      b.dazed = SNOWMAN_DAZE;
      b.vx = 0;
      s.flash = 2;
      s.flashText = "NOW JUMP ON HIS HEAD!";
    } else if (b.hp <= 0) {
      b.dead = 1.6;
      popup(cx, b.y - 6, "BYE EVIL LEAF!");
      playTrollDeath();
    } else {
      popup(cx, b.y - 6, `${b.hp} LEFT`);
    }
  };

  // You touched the bong: stop the clock, save your time
  const finishLevel = () => {
    const s = state.current;
    s.levelMs = Math.round(s.levelTime * 1000);
    const key = String(s.level);
    const old = s.levelBest[key];
    s.newBest = !old || s.levelMs < old;
    if (s.newBest) {
      s.levelBest = { ...s.levelBest, [key]: s.levelMs };
      try {
        localStorage.setItem(LEVEL_PROGRESS_KEY, JSON.stringify(s.levelBest));
      } catch {}
    }
    // medals: a time medal from the par times, and the NO-HIT star if nothing touched you the whole level
    {
      const timeMedal = medalForTime(s.level, s.levelMs);
      const nohit = s.hitsTaken === 0;
      const old = s.medals[key] ?? { time: null, nohit: false };
      const newTime = MEDAL_RANK.indexOf(timeMedal) > MEDAL_RANK.indexOf(old.time);
      const newNoHit = nohit && !old.nohit;
      s.medals = { ...s.medals, [key]: { time: newTime ? timeMedal : old.time, nohit: old.nohit || nohit } };
      try {
        localStorage.setItem(LEVEL_MEDALS_KEY, JSON.stringify(s.medals));
      } catch {}
      let skin = false;
      if (s.level === WARLORD_SKIN_LEVEL && (timeMedal === "gold" || nohit) && !s.unlocked.includes("warlord")) {
        unlockOutfit("warlord");
        skin = true;
      }
      s.medal = { time: timeMedal, nohit, newTime, newNoHit, skin };
    }
    s.mode = "levelDone";
    s.doneAt = s.t;
    s.vx = 0;
    heldRef.current = { left: false, right: false, up: false };
    const b = s.bong;
    if (b) {
      // a big cloud of smoke rising out of the bong
      for (let i = 0; i < 26; i++) {
        s.smoke.push({ x: b.x + BONG_W / 2 + rand(-4, 4), y: b.y + rand(-2, 6), vx: rand(-14, 14), vy: rand(-34, -14), r: rand(2, 4), life: rand(1.6, 3) });
      }
    }
    playHeart();
  };

  const pickSpell = (choice: number) => {
    const s = state.current;
    if (s.mode !== "choose" || (!s.boss && !s.lboss && !s.kboss && !s.tboss)) return;
    const kind: "fire" | "ice" | "spike" = choice === 2 && s.spells.includes("spike") ? "spike" : choice === 1 ? "ice" : "fire";
    s.bossSpell = kind;
    s.power = kind;
    s.ammo = s.tboss ? TOMB_AMMO : s.kboss ? HORNED_AMMO : s.boss || (s.lboss && !s.levelMode) ? BOSS_START_SHOTS : (s.lboss ? s.lboss.maxHp : 10) + BOSS_SPARE_SHOTS;
    if (s.kboss) s.doubleJumps = 1; // the horned warrior fight: just one double jump (the ? boxes give more)
    s.fireTime = kind === "fire" ? 999 : 0; // no timer in a boss fight
    s.mode = "running";
    s.flash = 1.6;
    const bossLabel = s.boss?.kind === "giant" ? "GIANT" : "TROLL";
    s.flashText = s.tboss
      ? "JUMP THE BEAR! SHOOT HIM WHEN HE FALLS"
      : s.kboss
      ? "SHOOT THE HORNED WARRIOR!"
      : s.lboss
      ? s.lboss.kind === "snowman"
        ? "SHOOT THE EVIL SNOWMAN!"
        : "SHOOT THE EVIL LEAF!"
      : bossRound() === 0
        ? `FIGHT THE ${bossLabel}!`
        : `${bossLabel} #${bossRound() + 1}!`;
    s.hinted = s.hinted.filter((h) => h !== "bossjump");
    showHint("bossjump", s.kboss ? "1 DOUBLE JUMP! MORE IN THE STASH BOXES" : s.boss ? "FREE DOUBLE JUMPS! JUMP OVER HIM" : "FREE DOUBLE JUMPS HERE!");
    s.hintTime = 4;
    playPowerUp();
  };

  // ---------- Pause (Esc) ----------
  const pauseGame = () => {
    const s = state.current;
    if (s.mode !== "running") return;
    s.mode = "paused";
    s.pauseChoice = 0;
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    touchUpRef.current = false;
    if (s.stuttersOn) stuttersRef.current?.pause();
  };
  const resumeGame = () => {
    const s = state.current;
    if (s.mode !== "paused") return;
    s.mode = "running";
    if (s.stuttersOn) stuttersRef.current?.play().catch(() => {});
  };
  // Leaves the game the same way the handheld's own Back button does.
  // (It waits one tiny moment first: when you pick HOME with Enter / OK, the page isn't listening
  // for keys at that exact instant, so the "leave" used to get lost and nothing happened.)
  const goHome = () => {
    window.setTimeout(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Backspace" }));
    }, 0);
  };

  // ---------- Outfits ----------
  // Does BOBO own this skin? (the free one, one you bought, or the Pinkmane one you earned)
  const boboOwns = (id: OutfitId) => {
    const s = state.current;
    const o = OUTFITS.find((x) => x.id === id);
    if (!o) return false;
    if (id === "classic" || s.petSkins.includes(id)) return true;
    return !o.cost && s.unlocked.includes(id);
  };
  const unlockOutfit = (id: OutfitId) => {
    const s = state.current;
    if (s.unlocked.includes(id)) return;
    s.unlocked = [...s.unlocked, id];
    try {
      localStorage.setItem(UNLOCKED_KEY, JSON.stringify(s.unlocked));
    } catch {}
    s.flash = 2.5;
    s.flashText = `NEW OUTFIT: ${OUTFITS.find((o) => o.id === id)?.name ?? id.toUpperCase()}!`;
  };
  // Coins are just your lifetime grams total; added whenever a run ends
  const addCoins = (n: number) => {
    if (n <= 0) return;
    const s = state.current;
    s.coins += n;
    try {
      localStorage.setItem(COINS_KEY, String(s.coins));
    } catch {}
  };

  // Freezes the game on the boss's card. OK carries on to `next`: the spell pick, or straight into the fight.
  const bossIntro = (id: BossId, next: "choose" | "running") => {
    const s = state.current;
    s.intro = { id, next, at: s.t };
    s.mode = "bossIntro";
    [196, 185, 175, 131].forEach((f, i) => beep(f, f * 0.97, 0.16, 0.06, "sawtooth", i * 0.14));
  };
  // You beat a boss: his card is yours now (kept in this browser)
  const awardBossCard = () => {
    const s = state.current;
    const id: BossId | null = s.tboss ? "tombfell" : s.kboss ? (s.levelMode ? s.kboss.kind : "runknight") : s.lboss ? s.lboss.kind : s.boss ? s.boss.kind : null;
    if (!id || s.cards.includes(id)) return;
    s.cards = [...s.cards, id];
    try {
      localStorage.setItem(CARDS_KEY, JSON.stringify(s.cards));
    } catch {}
    popup(s.x + SPRITE_W / 2, s.y - 14, "NEW BOSS CARD!");
  };
  const cardMove = (dir: number) => {
    const s = state.current;
    s.cardIndex = (s.cardIndex + dir + BOSS_CARDS.length) % BOSS_CARDS.length;
  };

  const playTrollDeath = () => {
    awardBossCard(); // every boss plays this sound when he goes down, so this is where you win his card
    try {
      // (the same sound element every time, loaded when the game opens: making a new one on the first
      // kill made the game hitch while the file loaded)
      let a = trollSoundRef.current;
      if (!a) {
        a = new Audio(TROLL_DEATH_SOUND);
        trollSoundRef.current = a;
      }
      a.volume = sfxVolRef.current;
      a.muted = mutedRef.current;
      try {
        a.currentTime = 0;
      } catch {}
      // it just plays on top of whatever song is on: no death sound ever stops the music
      a.play().catch(() => {});
    } catch {}
  };

  // A fireball or ice shot hits the troll
  const hitBoss = (sparks: string[]) => {
    const s = state.current;
    const b = s.boss;
    if (!b || b.dead > 0 || b.dazed > 0) return;
    const isGiant = b.kind === "giant";
    const cx = b.x + (isGiant ? GIANT_W : TR_W) / 2;
    const cy = b.y + (isGiant ? GIANT_H : TR_H) / 2;
    if (b.hit > 0.3) {
      burst(cx, cy, 5, sparks, 30);
      return;
    }
    b.hp -= 1;
    b.hit = 0.5;
    b.vx = -b.facing * 60;
    burst(cx, cy, 18, sparks, 70);
    s.shake = 0.12;
    playStomp();
    if (b.hp <= 0) {
      if (isGiant) {
        // He's down, but shots alone won't finish him — you have to stomp his head
        b.dazed = GIANT_DAZE_TIME;
        b.vx = 0;
        s.shake = 0.2;
        popup(cx, b.y - 10, "STOMP HIM!");
      } else {
        b.dead = 1.6;
        popup(cx, b.y - 6, "BYE TROLL!");
        playTrollDeath();
      }
    } else {
      popup(cx, b.y - 6, `${b.hp} LEFT`);
    }
  };

  // ---------- The wax moment ----------

  // A soft "shhh" (the torch, the pull, the exhale). from / to = how bright it sounds at the start and the end.
  const playNoise = (time: number, volume: number, from: number, to: number, delay = 0) => {
    if (mutedRef.current || !sfxOnRef.current || sfxVolRef.current <= 0) return;
    const ac = getAudio();
    if (!ac) return;
    try {
      const now = ac.currentTime + delay;
      // One 4-second buffer of noise is made once and reused (making a fresh one for every sound filled
      // hundreds of thousands of numbers in a single frame, right when the wax moment starts).
      let buffer = noiseBufRef.current;
      if (!buffer || buffer.sampleRate !== ac.sampleRate) {
        buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * 4), ac.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        noiseBufRef.current = buffer;
      }
      const noise = ac.createBufferSource();
      noise.buffer = buffer;
      const startAt = Math.random() * Math.max(0, buffer.duration - time - 0.1); // (a different slice every time)
      const filter = ac.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(from, now);
      filter.frequency.exponentialRampToValueAtTime(to, now + time);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(volume * sfxVolRef.current, now + time * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0005, now + time);
      noise.connect(filter).connect(g).connect(ac.destination);
      noise.start(now, startAt);
      noise.stop(now + time + 0.05);
    } catch {}
  };

  // Freezes the run on the wax bong hit
  const openWax = (test = false) => {
    const s = state.current;
    s.mode = "wax";
    s.waxT = 0;
    s.waxSnap = null; // (the first frame of the wax moment takes the picture)
    s.waxTest = test;
    s.waxFx = Math.round(s.x - s.cam) + 12; // the point 12 px across and 18 px down his picture
    s.waxFy = Math.round(s.y - s.camY) + 18;
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.vx = 0;
    beep(90, 40, 0.5, 0.09, "sine"); // the freeze: a low thump...
    beep(110, 520, WAX_T_ZOOM, 0.04, "sawtooth"); // ...and a riser while it zooms in
    // the sounds, all lined up now: the torch, the bubbling pull, the exhale, a little jingle
    playNoise(0.8, 0.035, 6000, 3000, WAX_T_HEAT);
    for (let i = 0; i < 6; i++) playNoise(0.05, 0.03, 5500, 2000, WAX_T_HEAT + 0.15 + i * 0.12 + rand(0, 0.05)); // the dab crackling
    const bubbles = Math.floor((WAX_T_EXHALE - WAX_T_HIT) / 0.075);
    for (let i = 0; i < bubbles; i++) {
      const f = rand(90, 230);
      beep(f, f * 1.7, 0.05, 0.05, "sine", WAX_T_HIT + i * 0.075 + rand(0, 0.03));
    }
    playNoise(WAX_T_EXHALE - WAX_T_HIT, 0.02, 500, 900, WAX_T_HIT);
    beep(130, 40, 0.4, 0.1, "sine", WAX_T_EXHALE); // the cough: a low thump as it all comes out
    playNoise(2.2, 0.08, 1800, 350, WAX_T_EXHALE);
    playNoise(3, 0.05, 900, 200, WAX_T_EXHALE + 0.25); // and a long soft whoosh under it
    [392, 494, 587, 784].forEach((f, i) => beep(f, f, 0.14, 0.045, "triangle", WAX_T_EXHALE + 1.4 + i * 0.12));
  };

  // Back to the run (nothing about it has changed)
  const closeWax = () => {
    const s = state.current;
    if (!s.waxTest) s.wax = true; // (a test rip from the 7 key doesn't use up the real one)
    s.waxTest = false;
    s.waxSnap = null;
    s.waxAt = s.t;
    s.waxTrip = WAX_TRIP_SECONDS; // the wobble and the colours start as the game comes back
    s.waxHue = 0;
    s.mode = "running";
    s.invuln = Math.max(s.invuln, 1.2);
    s.flash = 2.4;
    s.flashText = "NICE RIP! KEEP GOING";
    if (s.spinQueue.length > 0) s.spinWait = 1.6; // the boss spin is still waiting
  };

  // ---------- STASH SPIN: the prize machine ----------

  // A trade-off: with an EXTRA HEART you can't take the shot-power prizes (BIGGER STASH, PIERCING SHOTS) past level 1,
  // and once one of those is at level 2 the machine stops offering the extra heart. (Too many hearts + strong shots was too much.)
  const LIFE_PRIZES: string[] = ["heart"];
  const POWER_PRIZES: string[] = ["stash", "pierce"];
  const lifeHeld = () => LIFE_PRIZES.some((k) => state.current.perks[k as PerkId] > 0);
  const spinBlocked = (id: ReelId) => {
    const s = state.current;
    if (POWER_PRIZES.includes(id) && lifeHeld() && s.perks[id as PerkId] >= 1) return true;
    if (LIFE_PRIZES.includes(id) && POWER_PRIZES.some((k) => s.perks[k as PerkId] >= 2)) return true;
    return false;
  };

  // Picks what the three reels land on. Prizes you already have 3 times are left out.
  const rollSpin = (boss: boolean): ReelId[] => {
    const s = state.current;
    const w = (p: PerkDef) => (boss ? p.bossWeight : p.weight);
    const pickFrom = (list: PerkDef[]) => {
      let r = Math.random() * list.reduce((sum, p) => sum + w(p), 0);
      for (const p of list) {
        r -= w(p);
        if (r <= 0) return p;
      }
      return list[list.length - 1];
    };
    // (SECOND WIND is gone for good once it has saved you)
    // (and a prize with bossFrom stops showing up on normal spins once you hold that many)
    const open = PERKS.filter(
      (p) =>
        s.perks[p.id as PerkId] < perkMax(p) &&
        !(p.id === "revive" && s.reviveUsed) &&
        !(p.bossFrom !== undefined && !boss && s.perks[p.id as PerkId] >= p.bossFrom) &&
        !spinBlocked(p.id)
    );
    // JACKPOT: all three the same (only with a prize that still has room for both stacks, never a curse)
    const room = open.filter((p) => !p.curse && s.perks[p.id as PerkId] <= perkMax(p) - 2 && (p.bossFrom === undefined || boss) && !(POWER_PRIZES.includes(p.id) && lifeHeld())); // (a jackpot would give 2 stacks)
    if (room.length > 0 && Math.random() < (boss ? SPIN_JACKPOT_BOSS : SPIN_JACKPOT)) {
      const p = pickFrom(room);
      return [p.id, p.id, p.id];
    }
    // otherwise three different prizes (a brownie fills the gap when there aren't three left)
    const left = [...open];
    const out: ReelId[] = [];
    while (out.length < 3 && left.length > 0) {
      const p = pickFrom(left);
      out.push(p.id);
      left.splice(left.indexOf(p), 1);
    }
    while (out.length < 3) out.push("snack");
    return out;
  };

  // Freezes the run and starts the reels
  // (forced = the test key: these three prizes instead of random ones)
  const openSpin = (boss: boolean, forced?: ReelId[]) => {
    const s = state.current;
    const reels = forced ?? rollSpin(boss);
    const jackpot = reels[0] === reels[1] && reels[1] === reels[2];
    const all: ReelId[] = PERKS.map((p) => p.id);
    // the icons that roll past before each reel lands ([0] is the one it lands on)
    const strips = reels.map((id, r) => {
      const strip: ReelId[] = [id];
      const len = 10 + r * 4;
      while (strip.length < len) {
        const next = all[Math.floor(Math.random() * all.length)];
        if (next !== strip[strip.length - 1]) strip.push(next);
      }
      return strip;
    });
    const stops = [...SPIN_REEL_STOPS];
    if (jackpot) stops[2] += 0.7; // two the same already... the last reel takes its time
    s.spin = { boss, reels, strips, stops, t: 0, landed: 0, tick: 0, jackpot, pick: 1, took: -1, tookAt: 0, flashWas: s.flash };
    s.mode = "spin";
    beep(240, 90, 0.18, 0.06, "square"); // the lever
  };

  // How far reel r still has to roll (in icons). 0 = it has landed.
  const reelLeft = (r: number) => {
    const sp = state.current.spin;
    if (!sp || sp.t >= sp.stops[r]) return 0;
    const k = 1 - sp.t / sp.stops[r];
    return (sp.strips[r].length - 2) * k * k;
  };

  // The reels have stopped and the short "hands off" moment is over
  const spinCanPick = () => {
    const sp = state.current.spin;
    return !!sp && sp.took < 0 && sp.t >= sp.stops[2] + SPIN_LOCK;
  };

  const spinMove = (dir: number) => {
    const sp = state.current.spin;
    if (!sp || !spinCanPick() || sp.jackpot) return;
    sp.pick = (sp.pick + dir + 3) % 3;
    beep(520, 520, 0.04, 0.04, "square");
  };

  // Gives you a prize (times = 2 on a jackpot, boss = it came out of the gold BOSS SPIN)
  const applyPerk = (id: ReelId, times: number, boss: boolean) => {
    const s = state.current;
    for (let i = 0; i < times; i++) {
      if (id === "snack") {
        s.lives = Math.min(maxLives(), s.lives + 1);
        continue;
      }
      const d = perkDef(id);
      const most = !boss && d.bossFrom !== undefined ? Math.min(d.bossFrom, perkMax(d)) : perkMax(d);
      if (s.perks[id] >= most) break;
      if (spinBlocked(id)) break;
      s.perks[id] += 1;
      if (id === "heart") s.lives = Math.min(maxLives(), s.lives + 1);
      if (id === "shield") s.shield = s.perks.shield; // the bubble is up straight away
      if (id === "jetSip") {
        s.sipFuel = sipMax(); // a full sip straight away
        showHint("sip", touchPadRef.current ? "HOLD A IN THE AIR TO FLY" : "HOLD JUMP IN THE AIR TO FLY");
      }
      if (id === "airJump") showHint("airjump", "JUMP AGAIN IN THE AIR!");
      if (id === "pet" && !s.pet) s.pet = newPet();
    }
  };

  const spinTake = () => {
    const s = state.current;
    const sp = s.spin;
    if (!sp || !spinCanPick()) return;
    sp.took = sp.jackpot ? 1 : sp.pick;
    sp.tookAt = sp.t;
    applyPerk(sp.reels[sp.took], sp.jackpot ? 2 : 1, sp.boss);
    playPowerUp();
  };

  // Back to the run
  const closeSpin = () => {
    const s = state.current;
    const sp = s.spin;
    s.spin = null;
    s.mode = "running";
    s.invuln = Math.max(s.invuln, 1.2); // a moment to find your feet again
    if (sp) {
      s.flash = sp.flashWas;
      if (sp.took >= 0) {
        const d = perkDef(sp.reels[sp.took]);
        popup(s.x + SPRITE_W / 2, s.y - 8, sp.jackpot ? `${d.name} X2!` : `${d.name}!`);
        burst(s.x + SPRITE_W / 2, s.y + SPRITE_H / 2, 18, sp.boss ? ["#ffd700", "#fff3a0", "#ffffff"] : [PINK, "#ff5fe0", "#ffffff"], 70);
      }
    }
    if (s.spinQueue.length > 0) s.spinWait = 0.8; // another spin is waiting (a zone spin and a boss spin together)
  };

  // Runs while the machine is open (the rest of the game stands still)
  const updateSpin = (dt: number) => {
    const s = state.current;
    const sp = s.spin;
    if (!sp) {
      s.mode = "running";
      return;
    }
    const before = sp.t;
    sp.t += dt;
    // ticking while the reels turn
    if (sp.landed < 3) {
      sp.tick -= dt;
      if (sp.tick <= 0) {
        sp.tick = 0.09;
        beep(620 + sp.landed * 90, 600 + sp.landed * 90, 0.02, 0.018, "square");
      }
    }
    for (let r = 0; r < 3; r++) {
      if (before < sp.stops[r] && sp.t >= sp.stops[r]) {
        sp.landed = r + 1;
        beep(300 + r * 90, 200 + r * 60, 0.09, 0.06, "square"); // clack
        if (r === 2 && sp.jackpot) [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, f * 1.01, 0.09, 0.055, "square", 0.1 + i * 0.07));
      }
    }
    if (sp.took >= 0 && sp.t - sp.tookAt > SPIN_TAKE_TIME) closeSpin();
  };

  // Out of hearts after the checkpoint: back to the flag, fresh hearts, the fight you were in starts again
  const respawnAtCheckpoint = () => {
    const s = state.current;
    const cp = s.cp;
    if (!cp) return;
    s.cpDeaths += 1;
    s.lives = Math.min(maxLives(), KEEP_CHECKPOINT_HEARTS);
    s.kboss = null;
    s.kwaves = [];
    s.kshots = [];
    s.bossState = "none";
    s.knockT = 0;
    s.karenas = cp.arenas.map((a) => ({ ...a }));
    if (s.karenas.length) s.bossCol = s.karenas[0].col;
    for (const a of cp.arenas) {
      // the ? boxes in the arenas that are still ahead fill up again
      for (let k = 0; k < 22; k++) {
        const c = s.cols[a.col + k];
        if (c && c.bonus >= 0) c.used = false;
      }
    }
    s.enemies = s.enemies.filter((e) => !e.summoned); // (anything a boss called in is gone)
    s.cover = [];
    s.power = "none";
    s.ammo = 0;
    s.fireTime = 0;
    s.doubleJumps = 0;
    s.flying = false;
    s.x = cp.x;
    s.y = 8 * T - SPRITE_H - 1;
    s.vx = 0;
    s.vy = 0;
    s.onGround = false;
    s.airJumped = false;
    s.cam = cp.cam;
    s.camY = 0;
    heldRef.current = { left: false, right: false, up: false };
    touchRef.current = 0;
    s.invuln = 2;
    s.mode = "running";
    s.flash = 2.8;
    s.flashText = "BACK AT THE CHECKPOINT";
    [392, 523, 659].forEach((f, i) => beep(f, f * 1.01, 0.1, 0.05, "triangle", i * 0.09));
  };

  const hurt = (pit = false) => {
    const s = state.current;
    if (s.levelMode) s.hitsTaken += 1; // (any hit at all: it ends the NO-HIT star)
    const inFight = s.bossState === "fight";
    if (!pit && s.shield > 0) {
      // SHIELD (a spin prize): the bubble takes the hit and pops. Falling in a pit still costs a heart.
      s.shield -= 1;
      s.invuln = 1.5;
      s.shake = 0.15;
      burst(s.x + SPRITE_W / 2, s.y + SPRITE_H / 2, 22, SHIELD_COLORS, 80);
      popup(s.x + SPRITE_W / 2, s.y - 8, "SHIELD!");
      beep(1200, 300, 0.18, 0.06, "triangle");
      return;
    }
    if (hasFire() && !pit && !inFight) {
      // Getting hit while you have fire or ice only takes the power away
      burst(s.x + SPRITE_W / 2, s.y + 8, 16, powerSparks(s.power), 60);
      s.power = "none";
      s.ammo = 0;
      s.fireTime = 0;
      s.invuln = 1.5;
      s.shake = 0.15;
      playPowerDown();
      return;
    }
    if (!inFight) {
      // (in a boss fight you keep your spell and lose a heart instead)
      s.power = "none";
      s.ammo = 0;
      s.fireTime = 0;
    }
    s.lives -= 1;
    s.shake = 0.3;
    burst(s.x + SPRITE_W / 2, s.y + SPRITE_H / 2, 34, BOOM, 100);
    playHurt();
    if (s.lives <= 0 && s.perks.revive > 0 && !s.reviveUsed) {
      // SECOND WIND (a spin prize): instead of dying you get back up, once per run
      s.reviveUsed = true;
      s.lives = Math.min(maxLives(), REVIVE_LIVES);
      s.flash = 3.4;
      s.flashText = "SECOND WIND!";
      [392, 523, 659, 784, 1047].forEach((f, i) => beep(f, f * 1.01, 0.1, 0.055, "triangle", 0.25 + i * 0.08));
    }
    if (s.lives <= 0 && s.levelMode && s.cp) {
      respawnAtCheckpoint();
      return;
    }
    if (s.lives <= 0) {
      s.mode = "dying";
      s.deadAt = s.t;
      if (!s.levelMode && s.score > s.best) {
        s.best = Math.floor(s.score);
        try {
          localStorage.setItem(BEST_KEY, String(s.best));
        } catch {}
      }
      playDeath();
    } else {
      s.mode = "hurt";
      s.hurtAt = s.t;
    }
  };

  const finishDeath = () => {
    const s = state.current;
    if (s.levelMode) {
      // no scoreboard for a lost level, just try again
      s.mode = "levelSelect";
      s.flash = 2;
      s.flashText = "TRY AGAIN!";
      return;
    }
    if (qualifies(Math.floor(s.score))) {
      s.mode = "entry";
      setMessage("");
      setShowEntry(true);
    } else {
      s.mode = "board";
      s.deadAt = s.t;
    }
  };

  // ---------- PINK SHOP: buying things ----------
  const shopSay = (text: string) => {
    const s = state.current;
    s.shopMsg = text;
    s.shopMsgAt = s.t;
  };
  // First line on screen (the list scrolls once it's longer than the screen)
  const shopFirstRow = () =>
    Math.max(0, Math.min(state.current.shopIndex - Math.floor(SHOP_VISIBLE / 2), SHOP_ROWS.length - SHOP_VISIBLE));
  // Up / down in the list (the SPELLS / SKINS titles are skipped)
  const shopMove = (dir: number) => {
    const s = state.current;
    let i = s.shopIndex;
    for (let n = 0; n < SHOP_ROWS.length; n++) {
      i = (i + dir + SHOP_ROWS.length) % SHOP_ROWS.length;
      if (SHOP_ROWS[i].kind !== "head") break;
    }
    s.shopIndex = i;
    s.shopMsg = "";
  };
  // Takes the coins if you have enough (and says how many you're short if you don't)
  const shopPay = (cost: number) => {
    const s = state.current;
    if (s.coins < cost) {
      shopSay(`YOU NEED ${cost - s.coins} MORE COINS`);
      playBump();
      return false;
    }
    s.coins -= cost;
    try {
      localStorage.setItem(COINS_KEY, String(s.coins));
    } catch {}
    return true;
  };
  // OK on the highlighted line: buy it, wear it, or go back
  const shopPick = () => {
    const s = state.current;
    const row = SHOP_ROWS[s.shopIndex];
    if (!row || row.kind === "head") return;
    if (row.kind === "back") {
      // back to where you came from: the Esc menu (your run is waiting) or the start screen
      s.mode = s.shopFromPause ? "paused" : "home";
      s.shopFromPause = false;
      return;
    }
    if (row.kind === "soon") {
      shopSay("COMING SOON!");
      playBump();
      return;
    }
    if (row.kind === "spell") {
      const sp = row.spell;
      if (s.spells.includes(sp.id)) {
        shopSay("YOU ALREADY HAVE IT");
        playBump();
        return;
      }
      if (!shopPay(sp.cost)) return;
      s.spells = [...s.spells, sp.id];
      try {
        localStorage.setItem(SPELLS_KEY, JSON.stringify(s.spells));
      } catch {}
      shopSay(`${sp.name} UNLOCKED!`);
      playHeart();
      return;
    }
    if (row.kind === "bskin") {
      // a skin for BOBO: buy it if he doesn't have it yet, then he wears it
      const bo = row.outfit;
      const owned = boboOwns(bo.id);
      if (!owned && !bo.cost) {
        shopSay("GET THE PINKMANE ONE FIRST");
        playBump();
        return;
      }
      if (owned && s.petSkin === bo.id) {
        shopSay("BOBO IS WEARING IT");
        return;
      }
      if (!owned) {
        if (!shopPay(boboSkinCost(bo))) return;
        s.petSkins = [...s.petSkins, bo.id];
        try {
          localStorage.setItem(PET_SKINS_KEY, JSON.stringify(s.petSkins));
        } catch {}
        playHeart();
      }
      s.petSkin = bo.id;
      try {
        localStorage.setItem(PET_SKIN_KEY, bo.id);
      } catch {}
      shopSay(owned ? "BOBO IS WEARING IT NOW" : `${boboSkinName(bo)} IS HIS!`);
      return;
    }
    // a skin: buy it if you don't have it yet, then put it on
    const o = row.outfit;
    const isNew = !s.unlocked.includes(o.id);
    if (isNew) {
      if (!shopPay(o.cost ?? 0)) return;
      unlockOutfit(o.id);
      playHeart();
    } else if (s.outfit === o.id) {
      shopSay("YOU'RE WEARING IT");
      return;
    }
    s.outfit = o.id;
    s.selectIndex = Math.max(0, OUTFITS.findIndex((x) => x.id === o.id));
    try {
      localStorage.setItem(OUTFIT_KEY, o.id);
    } catch {}
    shopSay(isNew ? `${o.name} IS YOURS!` : "WEARING IT NOW");
  };

  // Called on OK / Enter / Space / tapping the middle of the screen
  const press = () => {
    const s = state.current;
    getAudio(); // browsers only allow sound after a click, so wake it up here
    if (s.mode === "wax") {
      // the wax moment: OK / jump skips the rest once the hit is done
      // (skipping doesn't cut away: it zooms back out into the game)
      if (!okRepeatRef.current && s.waxT >= WAX_T_EXHALE && s.waxT < WAX_T_END - WAX_T_OUT) s.waxT = WAX_T_END - WAX_T_OUT;
      return;
    }
    if (s.mode === "spin") {
      // the prize machine: OK / jump takes the highlighted prize.
      // (A key that was simply still held down from before doesn't count, it has to be a fresh press.)
      if (!okRepeatRef.current) spinTake();
      return;
    }
    if (s.mode === "shop") {
      shopPick();
      return;
    }
    if (s.mode === "bossIntro") {
      // the boss card: OK starts the fight (not in the first moment, so you can't skip it by accident)
      if (s.intro && s.t - s.intro.at < 0.7) return;
      const next = s.intro ? s.intro.next : "running";
      s.intro = null;
      s.mode = next;
      if (next === "running") s.flash = 2.4;
      return;
    }
    if (s.mode === "cards") {
      s.mode = "home";
      return;
    }
    if (s.mode === "home") {
      if (s.homeChoice === 3) {
        // the CARDS button
        s.mode = "cards";
        return;
      }
      if (s.homeChoice === 2) {
        // the SHOP button
        s.shopFromPause = false;
        s.mode = "shop";
        s.shopMsg = "";
        if (!SHOP_ROWS[s.shopIndex] || SHOP_ROWS[s.shopIndex].kind === "head") s.shopIndex = 1;
        return;
      }
      // The pink start screen: pick INFINITE or LEVELS, then your outfit
      s.gameMode = s.homeChoice === 1 ? "levels" : "infinite";
      if (s.gameMode === "infinite") {
        loadBoard("super");
        newGame();
      }
      s.mode = "select";
      return;
    }
    if (s.mode === "levelSelect") {
      if (s.mapWalk) return;
      if (LEVELS[s.levelPick]) startLevel(s.levelPick + 1);
      else {
        s.flash = 1.5;
        s.flashText = s.levelPick === WARLORD_STOP && !WARLORD_SHOWN ? WARLORD_SOON_TEXT : "COMING SOON";
      }
      return;
    }
    if (s.mode === "levelDone") {
      if (s.t - s.doneAt < 1) return;
      if (qualifies(LEVEL_TIME_BASE - s.levelMs)) {
        s.mode = "entry";
        setMessage("");
        setShowEntry(true);
      } else {
        s.mode = "board";
        s.deadAt = s.t;
      }
      return;
    }
    if (s.mode === "select") {
      const o = OUTFITS[s.selectIndex];
      if (!s.unlocked.includes(o.id) && !!o.cost && s.coins >= o.cost) {
        // buy it with gold coins
        s.coins -= o.cost;
        try {
          localStorage.setItem(COINS_KEY, String(s.coins));
        } catch {}
        unlockOutfit(o.id);
        playHeart();
      }
      if (s.unlocked.includes(o.id)) {
        s.outfit = o.id;
        try {
          localStorage.setItem(OUTFIT_KEY, o.id);
        } catch {}
        if (s.fromPause) {
          // came here from the pause menu: go back to it, the run is still waiting
          s.fromPause = false;
          s.mode = "paused";
          s.pauseChoice = 0;
        } else {
          s.mode = s.gameMode === "levels" ? "levelSelect" : "ready";
        }
      } else {
        s.flash = 1.2;
        s.flashText = `LOCKED \u2014 ${howToGet(o)}`;
      }
    } else if (s.mode === "golden") {
      closeGolden(false);
    } else if (s.mode === "choose") {
      pickSpell(s.spellChoice);
    } else if (s.mode === "paused") {
      const picked = PAUSE_OPTIONS[s.pauseChoice];
      if (picked === "RESTART") {
        // restart this level if you're in one, otherwise a fresh infinite run
        if (s.levelMode) startLevel(s.level);
        else newGame();
        s.mode = "running";
      } else if (picked === "PICK OUTFIT") {
        s.fromPause = true;
        const now = OUTFITS.findIndex((o) => o.id === s.outfit);
        if (now >= 0) s.selectIndex = now;
        s.mode = "select";
      } else if (picked === "SHOP") {
        // the run stays paused while you shop; BACK / Esc brings you back to this menu
        s.shopFromPause = true;
        s.shopMsg = "";
        if (!SHOP_ROWS[s.shopIndex] || SHOP_ROWS[s.shopIndex].kind === "head") s.shopIndex = 1;
        s.mode = "shop";
      } else if (picked === "GAME TYPE") {
        // back to the pink start screen: PINK RUN INFINITE or PINK LEVELS
        s.fromPause = false;
        s.homeChoice = s.gameMode === "levels" ? 1 : 0;
        s.mode = "home";
      } else if (picked === "HOME") {
        goHome();
      } else {
        resumeGame();
      }
    } else if (s.mode === "ready") {
      s.mode = "running";
    } else if (s.mode === "running") {
      jump();
    } else if (s.mode === "entry") {
      submitName();
    } else if (s.mode === "board" && s.t - s.deadAt > 0.6) {
      if (s.levelMode) {
        s.mode = "levelSelect"; // back to the list of levels
      } else {
        newGame();
        s.mode = "running";
      }
    }
  };

  // Bumping a bonus block from below: a flaming weed leaf pops out and slides away
  const bumpBlock = (col: number) => {
    const s = state.current;
    const c = colAt(col);
    c.bump = 0.15;
    if (c.used) {
      playBump();
      return;
    }
    c.used = true;
    // Fire is the most common, ice is rarer, double jump is the rarest.
    // Once you've bought SPIKE SHOT in the shop, its purple leaf is in there too.
    const r = Math.random();
    const kind: PowerKind =
      s.bossState === "fight"
        ? s.bossSpell
        : s.spells.includes("spike")
          ? r < 0.5 ? "fire" : r < 0.7 ? "ice" : r < 0.87 ? "spike" : "double"
          : r < 0.6 ? "fire" : r < 0.85 ? "ice" : "double";
    s.powerups.push({
      x: col * T + 1,
      y: (c.bonus - 1) * T + 2,
      vx: s.facing >= 0 ? 45 : -45,
      vy: -140,
      kind,
    });
    burst(col * T + 8, c.bonus * T, 8, FIRE, 40);
    playPowerAppear();
  };

  // Picking up a leaf or a gold coin (you, or your dog fetching it for you)
  const collectLeaf = (l: Leaf) => {
    const s = state.current;
    l.taken = true;
    if (isCoin(l)) {
      const n = s.perks.greed ? GREED_COINS : 1; // the GREED curse: coins count double
      addCoins(n);
      popup(l.x + 7, l.y - 4, n > 1 ? `+${n} COINS` : "+1 COIN");
      burst(l.x + 7, l.y + 7, 10, ["#ffd700", "#fff3a0", "#b8860b"], 50);
      playCoin();
      return;
    }
    s.bonus += PTS_LEAF;
    burst(l.x + 7, l.y + 7, 8, [GREEN, DARK_GREEN, "#ffffff"], 45);
    playLeaf();
  };

  // ---------- BOBO ----------
  const newPet = () => {
    const s = state.current;
    return {
      x: s.x + (SPRITE_W - PET_W) / 2 - s.facing * 22,
      y: s.y + SPRITE_H - PET_H,
      facing: s.facing,
      trail: [{ x: s.x - s.facing * 22, y: s.y }],
      still: 0,
      auto: PET_AUTO,
      fetch: null as Leaf | null,
      fetchCool: 0,
      moving: false,
    };
  };

  // One little shot from the dog
  const petShoot = (vx: number, vy: number) => {
    const s = state.current;
    const p = s.pet;
    if (!p) return;
    s.fireballs.push({ x: p.x + PET_W / 2 - 2, y: p.y + 4, vx, vy, life: PET_SHOT_LIFE, ice: false, pet: true });
    beep(1500, 2100, 0.05, 0.03, "square"); // yip
  };

  // The top of whatever is right under the dog (ground, a brick, a thin line). null = nothing there (a pit)
  const petFloor = (px: number, feet: number) => {
    const c = colAt(Math.floor(px / T));
    const tops = oneWayTopsAt(px);
    if (c.ground >= 0) tops.push(c.ground * T);
    let best = Infinity;
    for (const top of tops) if (top >= feet - 3 && top < best) best = top;
    return best === Infinity ? null : best;
  };

  const updatePet = (dt: number) => {
    const s = state.current;
    const p = s.pet;
    if (!p) return;
    const lvl = s.perks.pet;
    // lost you (a pipe, a fall): pop back to your side
    const homeX = s.x + (SPRITE_W - PET_W) / 2 - s.facing * 22;
    const homeY = s.y + SPRITE_H - PET_H;
    if (Math.abs(p.x - homeX) > 150 || Math.abs(p.y - homeY) > 130) {
      p.x = homeX;
      p.y = homeY;
      p.trail = [{ x: s.x - s.facing * 22, y: s.y }];
      p.fetch = null;
    }
    // remember where you've just been: the dog runs along that path, a little behind you
    const last = p.trail[p.trail.length - 1];
    if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= 3) {
      p.trail.push({ x: s.x, y: s.y });
      if (p.trail.length > PET_TRAIL) p.trail.shift();
      p.still = 0;
    } else {
      p.still += dt;
    }
    const xBefore = p.x;

    // LEVEL 3: spots a leaf (or coin) nearby and runs to fetch it
    if (p.fetchCool > 0) p.fetchCool -= dt;
    if (p.fetch && (lvl < 3 || p.fetch.taken || !s.leaves.includes(p.fetch))) p.fetch = null;
    if (lvl >= 3 && !p.fetch && p.fetchCool <= 0) {
      let bestD = PET_FETCH_RANGE;
      for (const l of s.leaves) {
        if (l.taken || l.x < s.cam - 8 || l.x > s.cam + W) continue;
        const half = l.small ? 4 : 7;
        const d = Math.hypot(l.x + half - (p.x + PET_W / 2), l.y + half - (p.y + PET_H / 2));
        if (d < bestD) {
          bestD = d;
          p.fetch = l;
        }
      }
    }
    if (p.fetch) {
      const half = p.fetch.small ? 4 : 7;
      const dx = p.fetch.x + half - (p.x + PET_W / 2);
      const dy = p.fetch.y + half - (p.y + PET_H / 2);
      const d = Math.hypot(dx, dy);
      if (d < 6) {
        collectLeaf(p.fetch);
        p.fetch = null;
        p.fetchCool = 0.25;
      } else {
        const step = Math.min(d, PET_FETCH_SPEED * dt);
        p.x += (dx / d) * step;
        p.y += (dy / d) * step;
      }
    } else {
      // follow you: head for the oldest spot on your path
      const tp = p.trail[0];
      const k = Math.min(1, dt * 12);
      p.x += (tp.x + (SPRITE_W - PET_W) / 2 - p.x) * k;
      if (p.still > 0.12) {
        // you stopped: it drops onto whatever is under it
        const floor = petFloor(p.x + PET_W / 2, p.y + PET_H);
        if (floor !== null) p.y = Math.min(floor - PET_H, p.y + 260 * dt);
      } else {
        p.y += (tp.y + SPRITE_H - PET_H - p.y) * k;
      }
    }
    const moved = p.x - xBefore;
    p.moving = Math.abs(moved) > 0.2;
    if (p.moving) p.facing = moved > 0 ? 1 : -1;
    else if (p.still > 0.3) p.facing = s.facing;

    // LEVEL 2: every few seconds it shoots by itself at a monster that's close
    if (lvl >= 2) {
      p.auto -= dt;
      if (p.auto <= 0) {
        let target: Enemy | null = null;
        let bestD = PET_AUTO_RANGE;
        for (const e of s.enemies) {
          if (!e.alive || e.kind === "bong" || e.x < s.cam || e.x > s.cam + W) continue;
          const d = Math.hypot(e.x + 7 - (p.x + PET_W / 2), e.y + 7 - (p.y + 6));
          if (d < bestD) {
            bestD = d;
            target = e;
          }
        }
        if (target) {
          const dx = target.x + 7 - (p.x + PET_W / 2);
          const dy = target.y + 5 - (p.y + 6);
          const d = Math.max(1, Math.hypot(dx, dy));
          p.facing = dx >= 0 ? 1 : -1;
          petShoot((dx / d) * PET_SHOT_SPEED, (dy / d) * PET_SHOT_SPEED);
          p.auto = PET_AUTO;
        }
      }
    }
  };

  const drawPet = (ctx: CanvasRenderingContext2D, cam: number) => {
    const s = state.current;
    const p = s.pet;
    if (!p) return;
    const frame = p.moving && s.mode === "running" ? Math.floor(s.t * 10) % 2 : 0;
    const skin = BOBO_SKIN_COLORS[s.petSkin] ?? BOBO_COLORS;
    if (s.petSkin === "ghost") ctx.globalAlpha = 0.7;
    drawPixels(ctx, (p.facing < 0 ? BOBO_LEFT : BOBO)[frame], Math.round(p.x - cam), Math.round(p.y), skin, 1);
    ctx.globalAlpha = 1;
  };

  const KILL_STREAK_WINDOW = 1.2; // seconds you have to chain the next stomp
  const killEnemy = (e: Enemy, points: number) => {
    const s = state.current;
    e.alive = false;
    e.squash = 0.35;
    s.killStreak += 1;
    s.killStreakTimer = KILL_STREAK_WINDOW;
    // 2 = DOUBLE, 3 = TRIPLE, 4 = QUADRA, 5+ = PENTAKILL. Points get multiplied by the streak (max x5).
    const streak = Math.min(s.killStreak, 5);
    const finalPoints = points * streak * (s.perks.swarm ? SWARM_PAY : 1); // (the SWARM curse: kills pay double)
    const names = ["", "", "DOUBLE KILL!", "TRIPLE KILL!", "QUADRA KILL!", "PENTAKILL!"];
    s.bonus += finalPoints;
    popup(e.x + 7, e.y - 4, streak >= 2 ? `+${finalPoints} ${names[streak]}` : `+${finalPoints}`);
    if (streak >= 3) {
      s.flash = 1.3;
      s.flashText = names[streak];
      [880, 1175, 1568].slice(0, streak - 1).forEach((f, i) => beep(f, f, 0.08, 0.05, "square", i * 0.07));
    }
    burst(e.x + 7, e.y + 7, 12, e.kind === "flyer" ? [LIGHT_GREEN, DARK_GREEN, "#ffffff"] : ["#8a8a8a", "#ffffff", INK], 60);
    playStomp();
  };

  // The blizzard: snow all over the screen and ice spikes that form on the ceiling and fall. Returns true if a spike hurt you.
  const updateBlizzard = (dt: number): boolean => {
    const s = state.current;
    const sm = s.lboss && s.lboss.kind === "snowman" && s.lboss.dead <= 0 ? s.lboss : null;
    s.blizzard += ((sm ? 1 : 0) - s.blizzard) * Math.min(1, dt * (sm ? 1.2 : 1.3)); // (in 1.2/s, out 1.3/s)
    if (!sm && s.blizzard < 0.01) {
      s.blizzard = 0;
      s.flakes = [];
    }
    // the snowflakes: they drift left on a little wind and sway as they fall
    const want = Math.round(BLIZZARD_FLAKES * s.blizzard);
    while (s.flakes.length < want) s.flakes.push({ x: rand(0, W), y: rand(-24, -2), vy: rand(34, 78), ph: rand(0, 6.3), big: Math.random() < 0.4 });
    for (const fl of s.flakes) {
      fl.y += fl.vy * dt;
      fl.x += (-16 + Math.sin(s.t * 1.6 + fl.ph) * 12) * dt;
      if (fl.x < -4) fl.x += W + 8;
      if (fl.y > H + 3) {
        fl.y = -3;
        fl.x = rand(0, W);
      }
    }
    if (s.flakes.length > want + 3) s.flakes.length = want + 3; // (it eases off when the fight ends)
    // the ice spikes
    if (sm) {
      if (sm.dazed <= 0) {
        s.icicleTimer -= dt; // (none while he's dizzy: go and stomp him)
        const mood = 1 - Math.max(0, sm.hp) / Math.max(1, sm.maxHp);
        const volley = mood > 0.5 ? 3 : 2;
        if (s.icicleTimer <= 0 && s.icicles.length <= ICICLE_MAX - volley) {
          s.icicleTimer = ICICLE_EVERY[0] + (ICICLE_EVERY[1] - ICICLE_EVERY[0]) * mood;
          const px = s.x + SPRITE_W / 2;
          for (let k = 0; k < volley; k++) {
            // a volley: the first one over you (give or take), the rest anywhere, each starting a moment after the last
            const x = k === 0 ? px + rand(-45, 45) : s.cam + rand(14, W - 14);
            s.icicles.push({ x: Math.max(s.cam + 10, Math.min(s.cam + W - 10, x)), y: 0, len: 0, vy: 0, grow: -k * 0.2, act: "grow" });
          }
        }
      }
    } else if (s.icicles.length > 0) {
      for (const ic of s.icicles) burst(ic.x, ic.y + ic.len, 6, ["#e6f6ff", "#9fd8ff", "#ffffff"], 40); // (the fight's over: they all crack)
      s.icicles = [];
    }
    const kept: typeof s.icicles = [];
    for (const ic of s.icicles) {
      if (ic.dead) continue; // (a shot broke it: it's just dropped from the list)
      if (ic.act === "grow") {
        ic.grow += dt;
        ic.len = ICICLE_LEN * Math.max(0, Math.min(1, ic.grow / ICICLE_GROW));
        if (ic.grow >= ICICLE_GROW) {
          ic.act = "fall";
          ic.vy = 40;
          beep(1300, 500, 0.08, 0.03, "triangle");
        }
        kept.push(ic);
        continue;
      }
      ic.vy = Math.min(380, ic.vy + 900 * dt);
      ic.y += ic.vy * dt;
      const tip = ic.y + ic.len;
      if (s.invuln <= 0 && s.x + HB_X + HB_W > ic.x - 3 && s.x + HB_X < ic.x + 3 && s.y + HB_Y + HB_H > ic.y && s.y + HB_Y < tip) {
        burst(ic.x, tip, 10, ["#e6f6ff", "#9fd8ff", "#ffffff"], 60);
        hurt();
        s.icicles = kept.concat(s.icicles.slice(s.icicles.indexOf(ic) + 1));
        return true;
      }
      if (solidAt(ic.x, tip + 1) || tip >= 8 * T) {
        // it hits the floor, a block or a pillar and shatters
        burst(ic.x, Math.min(tip, 8 * T - 2), 9, ["#e6f6ff", "#9fd8ff", "#ffffff"], 55);
        s.shake = Math.max(s.shake, 0.06);
        beep(900, 300, 0.07, 0.03, "triangle");
        continue;
      }
      kept.push(ic);
    }
    s.icicles = kept;
    return false;
  };

  const update = (dt: number) => {
    const s = state.current;
    s.t += dt;
    if (s.levelMode && LEVELS[s.level - 1]?.zone === LEVEL_KEEP) {
      // the crypt wing is dark (not during a fight: you need to see the knight)
      const dc = (s.cam + W / 2) / T;
      const inCrypt = Math.max(0, Math.min(1, (dc - KEEP_WINGS[1].from) / 10)) * Math.max(0, Math.min(1, (KEEP_WINGS[2].from - dc) / 10));
      s.dark += ((s.bossState === "fight" ? 0 : inCrypt) - s.dark) * Math.min(1, dt * 3);
    } else s.dark = 0;
    // the painted background only wiggles while the music is really playing
    s.bgWiggle += ((beatPropRef.current?.current.live ? 1 : 0) - s.bgWiggle) * Math.min(1, dt * 3);
    if (s.waxTrip > 0 && s.mode === "running") {
      // (only while you're really playing: the prize machine that opens right after the wax used to eat all of it)
      s.waxTrip = Math.max(0, s.waxTrip - dt);
      s.waxHue = (s.waxHue + dt * WAX_TRIP_HUE_SPEED * (0.35 + 0.65 * waxTripLevels().col)) % 360;
    }
    if (s.shake > 0) s.shake -= dt;
    if (s.flash > 0) s.flash -= dt;

    for (const p of s.particles) {
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    s.particles = s.particles.filter((p) => p.life > 0);
    // bong smoke rises, spreads and fades
    for (const m of s.smoke) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vx *= 1 - dt * 0.8;
      m.r += dt * 4;
      m.life -= dt;
    }
    s.smoke = s.smoke.filter((m) => m.life > 0);
    if (s.mode === "levelSelect") updateMap(dt);

    // TWISTED CORAL PEAKS: bubbles come out of your mouth like you're breathing underwater
    if (s.mode === "running" && !s.inBonus && colAt(Math.floor((s.x + SPRITE_W / 2) / T)).zone === F_CORAL) {
      s.bubbleTimer -= dt;
      if (s.bubbleTimer <= 0) {
        s.bubbleTimer = rand(0.5, 1.1);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          s.bubbles.push({
            x: s.x + (s.facing > 0 ? SPRITE_W - 3 : 3) + rand(-1, 1),
            y: s.y + 15 - i * 4,
            life: rand(1.2, 2),
            r: i === 0 ? 2 : 1 + Math.round(Math.random()),
            ph: Math.random() * 6,
          });
        }
      }
    }
    for (const b of s.bubbles) {
      b.y -= 20 * dt;
      b.x += Math.sin(s.t * 4 + b.ph) * 8 * dt;
      b.life -= dt;
    }
    s.bubbles = s.bubbles.filter((b) => b.life > 0);
    for (const p of s.popups) {
      p.y -= 18 * dt;
      p.life -= dt;
    }
    s.popups = s.popups.filter((p) => p.life > 0);

    // Kill streak: stomping enemies back-to-back within this window keeps the streak alive
    if (s.killStreakTimer > 0) {
      s.killStreakTimer -= dt;
      if (s.killStreakTimer <= 0) s.killStreak = 0;
    }

    // Click wheel: turning it walks you that way for a moment
    const spin = spinRef.current;
    spinRef.current = 0;
    if (spin !== 0) {
      wheelRef.current.dir = spin > 0 ? 1 : -1;
      wheelRef.current.timer = 0.2;
    }
    if (wheelRef.current.timer > 0) {
      wheelRef.current.timer -= dt;
      if (wheelRef.current.timer <= 0) wheelRef.current.dir = 0;
    }

    if (s.mode === "spin") {
      updateSpin(dt); // the prize machine: everything else stands still
      return;
    }
    if (s.mode === "wax") {
      // the wax moment: everything else stands still
      s.waxT += dt;
      if (s.waxT >= WAX_T_END) closeWax();
      return;
    }
    if (s.mode === "dying") {
      if (s.t - s.deadAt > 3) finishDeath();
      return;
    }
    if (s.mode === "hurt") {
      if (s.t - s.hurtAt > 1.2) {
        placeOnGroundNear(s.cam + 48);
        if (s.boss && s.bossState === "fight") {
          s.boss.x = s.cam + W - 50; // the troll backs off so you get a fair restart
          s.boss.vx = 0;
        }
        if (s.lboss) {
          s.lboss.x = s.cam + W - 60;
          s.lboss.y = s.lboss.kind === "snowman" ? 8 * T - SN_H : 30;
          s.lboss.dive = 0;
        }
        if (s.kboss) {
          // the knight backs off so you get a fair restart
          const kd = KN_DIM[s.kboss.kind];
          s.kboss.x = s.cam + W - kd.w - 16;
          s.kboss.y = 8 * T - kd.foot;
          s.kboss.vx = 0;
          s.kboss.vy = 0;
          s.kboss.act = "walk";
          s.kboss.cool = 1.5;
          s.kboss.reach = 20;
          if (s.kboss.kind === "warlord") s.kboss.ang = SW_IDLE;
        }
        s.kwaves = [];
        s.kshots = [];
        resetTombfell();
        s.invuln = 1.5;
        s.mode = "running";
      }
      return;
    }
    if (s.mode === "pipe") {
      // Sink into the pipe, then switch worlds
      s.y += 45 * dt;
      s.pipeTimer -= dt;
      if (s.pipeTimer <= 0) {
        if (s.pipeDir > 0) enterVoid();
        else leaveVoid();
      }
      return;
    }
    if (s.mode !== "running") return;

    s.runTime += dt;
    if (s.levelMode) s.levelTime += dt;
    if (!s.unlocked.includes("og") && s.score >= OG_SCORE_UNLOCK) unlockOutfit("og");
    if (s.invuln > 0) s.invuln -= dt;

    if (s.hintTime > 0) s.hintTime -= dt;

    // Fire power runs out when the timer bar is empty (ice has no timer)
    if (s.power === "fire" && s.fireTime > 0 && s.bossState !== "fight") {
      s.fireTime -= dt;
      if (s.fireTime <= 0) {
        s.fireTime = 0;
        s.ammo = 0;
        s.power = "none";
        playPowerDown();
      }
    }

    // Which way do you want to go
    let want = 0;
    if (heldRef.current.left || touchRef.current < 0) want -= 1;
    if (heldRef.current.right || touchRef.current > 0) want += 1;
    if (want === 0) want = wheelRef.current.dir;
    if (want !== 0) s.facing = want;

    const target = want * runSpeed(); // (faster with the SPEED prize)
    if (s.knockT > 0) {
      s.knockT -= dt; // thrown off by WARLORD: no steering for a moment
    } else {
      if (s.vx < target) s.vx = Math.min(target, s.vx + ACCEL * dt);
      if (s.vx > target) s.vx = Math.max(target, s.vx - ACCEL * dt);
    }
    s.vy = Math.min(420, s.vy + GRAVITY * dt);

    // Jetpack: hold jump to fly, but only while there's fuel. Land to refuel.
    const holdingUp = heldRef.current.up || touchUpRef.current;
    const wantsFly = s.jetpack && holdingUp;
    // JETPACK SIP (a spin prize): a small tank that only refills in a new zone. It kicks in when you keep
    // holding jump in the air, once you've stopped rising, so an ordinary jump doesn't waste any of it.
    const sipFly = !s.jetpack && s.sipFuel > 0 && holdingUp && !s.onGround && (s.vy >= 0 || s.flying);
    s.flying = (wantsFly && s.jetFuel > 0) || sipFly;
    if (s.flying) {
      if (sipFly) s.sipFuel = Math.max(0, s.sipFuel - dt);
      else s.jetFuel = Math.max(0, s.jetFuel - dt);
      s.vy = Math.max(JET_MAX_UP, s.vy - JET_THRUST * dt);
      if (Math.random() < 0.7) {
        s.particles.push({
          x: s.x + (s.facing > 0 ? 5 : SPRITE_W - 7),
          y: s.y + 27,
          vx: rand(-15, 15),
          vy: rand(40, 90),
          color: FIRE[Math.floor(Math.random() * 3)],
          life: rand(0.15, 0.3),
        });
      }
      if (sipFly ? s.sipFuel <= 0 : s.jetFuel <= 0) popup(s.x + SPRITE_W / 2, s.y - 6, "OUT OF GAS!");
    } else if (s.jetpack && s.onGround) {
      s.jetFuel = Math.min(JET_FUEL_MAX, s.jetFuel + dt * JET_REFUEL_RATE);
    }

    // Move sideways, then up/down, stopping at solid tiles
    const hx = () => s.x + HB_X;
    const hy = () => s.y + HB_Y;
    s.x += s.vx * dt;
    if (s.x + HB_X < s.cam) s.x = s.cam - HB_X; // can't go back past the left edge
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vx > 0) s.x = Math.floor((hx() + HB_W) / T) * T - HB_W - HB_X - 0.01;
      else if (s.vx < 0) s.x = (Math.floor(hx() / T) + 1) * T - HB_X + 0.01;
      s.vx = 0;
    }
    const prevBottom = hy() + HB_H;
    // Did you come DOWN onto it? Yes if you're falling (or just at the top of a jump) and either your feet are only just below its top, or
    // they were ABOVE its top a moment ago. (The old rule only looked at how far your feet had sunk at the moment of contact. On a phone with
    // a hiccup you fall further in one step, so a jump that clearly landed on an enemy could count as the enemy hitting you.)
    const cameDown = (top: number, tol: number) => s.vy > -40 && (hy() + HB_H - top < tol || prevBottom <= top + 6);
    s.y += s.vy * dt;
    s.onGround = false;
    if (boxHits(hx(), hy(), HB_W, HB_H)) {
      if (s.vy > 0) {
        s.y = Math.floor((hy() + HB_H) / T) * T - HB_H - HB_Y - 0.01;
        s.onGround = true;
      } else {
        // Head hit something: if it's a bonus block, bump it
        const headRow = Math.floor(hy() / T);
        for (const fx of [hx() + HB_W / 2, hx() + 1, hx() + HB_W - 1]) {
          const col = Math.floor(fx / T);
          const c = colAt(col);
          if (c.bonus === headRow) {
            bumpBlock(col);
            break;
          }
        }
        s.y = (headRow + 1) * T - HB_Y + 0.01;
      }
      s.vy = 0;
    }
    // A generous safety ceiling — well above the old fixed wall, and high enough you can
    // fly for a good while, but bounded so the vertical camera below only ever has to
    // scroll a predictable, safe distance (keeps backgrounds fully covered, no edge showing).
    if (s.y < -260) {
      s.y = -260;
      if (s.vy < 0) s.vy = 0;
    }
    // Landing on bricks or thin lines from above
    if (!s.onGround && s.vy >= 0) {
      const bottom = hy() + HB_H;
      let landed = false;
      for (const fx of [hx() + 1, hx() + HB_W - 1]) {
        for (const top of oneWayTopsAt(fx)) {
          if (prevBottom <= top + 1 && bottom >= top) {
            s.y = top - HB_H - HB_Y - 0.01;
            s.vy = 0;
            s.onGround = true;
            landed = true;
            // Touched a vanishing line: the whole line starts blinking
            const col = Math.floor(fx / T);
            const c = colAt(col);
            if (c.fragile > 0 && c.crumble < 0 && c.line * T === top) {
              for (let k = col; colAt(k).line === c.line && colAt(k).fragile > 0; k--) colAt(k).crumble = c.fragile;
              for (let k = col + 1; colAt(k).line === c.line && colAt(k).fragile > 0; k++) colAt(k).crumble = c.fragile;
            }
            break;
          }
        }
        if (landed) break;
      }
    }
    // Trampolines (Void rooms): land on a pad and it throws you up
    if (s.onGround && s.inBonus) {
      const pad = colAt(Math.floor((hx() + HB_W / 2) / T));
      if (pad.spring && Math.abs(hy() + HB_H - pad.ground * T) < 3) {
        s.vy = SPRING_VY;
        s.onGround = false;
        s.coyote = 0; // (no extra jump on top of the bounce)
        pad.bump = 0.25;
        burst(s.x + SPRITE_W / 2, s.y + SPRITE_H, 10, [PINK, "#ffffff", "#ff8ff0"], 60);
        beep(180, 760, 0.16, 0.05, "square");
      }
    }
    if (s.onGround) {
      s.coyote = 0.09;
      s.airJumped = false;
      s.freeJumped = false;
    }
    else if (s.coyote > 0) s.coyote -= dt;

    if (Math.abs(s.vx) > 5 && s.onGround) s.runAnim += dt;

    // Camera follows you forward only (in the Void it stays inside the room)
    if (s.inBonus) {
      s.cam = Math.max(0, Math.min(s.cols.length * T - W, s.x - 110));
    } else if (s.bossState === "fight") {
      // Boss fight: the screen stays put, you can't leave until he's down
      s.cam = s.bossCol * T;
      if (s.x + HB_X + HB_W > s.cam + W) s.x = s.cam + W - HB_X - HB_W;
    } else if (s.eggOpen) {
      // At the very start you can also walk back left, into the secret area
      if (s.x - s.cam > 90) s.cam = s.x - 90;
      if (s.x - s.cam < 40) s.cam = Math.max(-EGG_COLS * T, s.x - 40);
      if (s.farthest > 30 * T) s.eggOpen = false; // once you've run on, the way back is gone
      generateUpTo(Math.floor((s.cam + W) / T) + 4);
    } else {
      s.cam = Math.max(s.cam, s.x - 90);
      generateUpTo(Math.floor((s.cam + W) / T) + 4);
      if (s.bossState === "placed" && s.cam >= s.bossCol * T) startBoss();
      if (s.levelMode) {
        s.cam = Math.min(s.cam, s.cols.length * T - W);
        if (s.x + HB_X + HB_W > s.cols.length * T) s.x = s.cols.length * T - HB_X - HB_W;
        if (s.lbossState === "waiting" && s.cam >= s.bossCol * T) startLevelBoss();
        if (s.karenas.length > 0 && s.bossState === "none" && s.cam >= s.karenas[0].col * T) startKnight();
        if (s.tarena >= 0 && s.bossState === "none" && s.cam >= s.tarena * T) startTombfell();
        // the wings of the Keep: their name shows when you walk into a new one
        if (LEVELS[s.level - 1]?.zone === LEVEL_KEEP) {
          const wi = wingAt(Math.floor((s.x + SPRITE_W / 2) / T));
          if (wi !== s.wing) {
            s.wing = wi;
            s.flash = 2.6; // (always announced, whatever message was up)
            s.flashText = KEEP_WINGS[wi].name;
          }
        }
        // the checkpoint flag: touch it once and it's saved
        if (s.cpCol >= 0 && !s.cp && s.bossState === "none" && s.x + SPRITE_W / 2 >= s.cpCol * T) {
          s.cp = { x: s.cpCol * T, cam: s.cam, arenas: s.karenas.map((a) => ({ ...a })) };
          s.flash = 2.4;
          s.flashText = "CHECKPOINT!";
          playPowerUp();
          burst(s.cpCol * T + 8, 8 * T - 24, 22, ["#ffd700", "#ffffff", "#ff5fe0"], 70);
        }
      }
    }

    // Vertical camera: when a jump or a jetpack flight takes you higher than the screen
    // normally shows, the screen scrolls up with you instead of an invisible ceiling
    // stopping you short. It eases back down once you're back near the ground.
    const VIEW_TOP_MARGIN = 24;
    const desiredCamY = Math.min(0, s.y - VIEW_TOP_MARGIN);
    s.camY += (desiredCamY - s.camY) * Math.min(1, dt * 6);
    if (Math.abs(s.camY - desiredCamY) < 0.05) s.camY = desiredCamY;

    // Score: distance + bonus
    if (!s.inBonus) s.farthest = Math.max(s.farthest, s.x);
    s.score = Math.floor(s.farthest / T) + s.bonus;

    // Picking up the secret jetpack
    const ji = s.jetItem;
    if (ji && hx() + HB_W > ji.x && hx() < ji.x + 18 && hy() + HB_H > ji.y && hy() < ji.y + 18) {
      s.jetItem = null;
      s.jetpack = true;
      s.bonus += 100;
      popup(ji.x + 9, ji.y - 4, "JETPACK!");
      showHint("jet", touchPadRef.current ? "HOLD A TO FLY" : "HOLD SPACE TO FLY");
      burst(ji.x + 9, ji.y + 9, 22, [PINK, "#ffc800", "#ffffff"], 70);
      playPowerUp();
    }
    // The golden leaf: +500, the game pauses on the Stutters screen and his remix starts playing
    const gl = s.goldLeaf;
    if (gl && hx() + HB_W > gl.x && hx() < gl.x + 14 && hy() + HB_H > gl.y && hy() < gl.y + 14) {
      s.goldLeaf = null;
      s.goldDone = true;
      s.bonus += PTS_GOLD;
      s.score = Math.floor(s.farthest / T) + s.bonus;
      popup(gl.x + 7, gl.y - 4, `+${PTS_GOLD}`);
      burst(gl.x + 7, gl.y + 7, 34, ["#ffd700", "#fff3a0", "#b8860b", "#ffffff"], 90);
      playPowerUp();
      let before = false;
      try {
        before = localStorage.getItem(GOLD_KEY) === "1";
        localStorage.setItem(GOLD_KEY, "1");
      } catch {}
      setGoldBefore(before);
      heldRef.current = { left: false, right: false, up: false };
      touchRef.current = 0;
      s.vx = 0;
      startStutters();
      s.mode = "golden";
      setShowGolden(true);
      return;
    }

    // The jetpack runs out of fuel at 2000
    if (s.jetpack && s.score >= JET_UNTIL) {
      s.jetpack = false;
      s.flying = false;
      popup(s.x + SPRITE_W / 2, s.y - 6, "JETPACK EMPTY");
      burst(s.x + SPRITE_W / 2, s.y + 20, 16, ["#8a8a8a", "#ffffff", INK], 55);
      playPowerDown();
    }

    // Fell in a pit
    if (s.y > H + 10) {
      hurt(true);
      return;
    }

    // Zone name when you enter a new zone
    if (!s.inBonus && !s.levelMode) {
      const zoneIndex = Math.floor(Math.floor(s.x / T) / ZONE_LEN);
      if (zoneIndex > s.zoneShown) {
        s.zoneShown = zoneIndex;
        s.zoneMarks.push({ score: s.score, zone: zoneIndex % ZONE_NAMES.length });
        s.flash = 2;
        s.flashText = `ZONE ${zoneIndex + 1}: ${ZONE_NAMES[zoneIndex % ZONE_NAMES.length]}`;
        // SHIELD: the bubble comes back in every new zone
        if (s.shield < s.perks.shield) {
          s.shield = s.perks.shield;
          popup(s.x + SPRITE_W / 2, s.y - 8, "SHIELD BACK!");
          beep(500, 1100, 0.12, 0.04, "triangle");
        }
        // JETPACK SIP: a fresh sip in every new zone
        if (s.sipFuel < sipMax()) {
          s.sipFuel = sipMax();
          popup(s.x + SPRITE_W / 2, s.y - 20, "JETPACK FULL!");
        }
        // STASH SPIN every few zones (SPIN_EVERY_ZONES)
        if (SPIN_EVERY_ZONES > 0 && zoneIndex % SPIN_EVERY_ZONES === 0) {
          s.spinQueue.push(false);
          s.spinWait = Math.max(s.spinWait, 0.3);
        }
      }
      // The opening spin: a few seconds into the run, so everybody finds out what the machine is
      if (SPIN_AT_START && !s.startSpinDone && s.runTime >= SPIN_START_DELAY && s.bossState === "none") {
        s.startSpinDone = true;
        s.spinQueue.push(false);
        s.spinWait = Math.max(s.spinWait, 0);
      }
      // The wax moment comes first (right after the 20k boss), the boss spin after it.
      // A spin is waiting: it opens once you're standing on the ground (never in the Void or during a boss fight)
      if (s.waxWait > 0) {
        s.waxWait -= dt;
        if (s.waxWait <= 0) {
          s.waxWait = 0;
          openWax();
          return;
        }
      } else if (s.spinQueue.length > 0 && s.bossState !== "fight") {
        s.spinWait -= dt;
        if (s.spinWait <= 0 && (s.onGround || s.spinWait < -2.5)) {
          openSpin(s.spinQueue.shift() === true);
          return;
        }
      }
    }

    // Bonus block bounce animation, and vanishing lines counting down
    let crumbled = false;
    for (let col = Math.floor(s.cam / T); col <= Math.floor((s.cam + W) / T); col++) {
      const c = colAt(col);
      if (c.bump > 0) c.bump -= dt;
      if (c.crumble > 0) {
        c.crumble -= dt;
        if (c.crumble <= 0) {
          burst(col * T + 8, c.line * T, 8, [PINK, "#ffffff", DARK_PINK], 40);
          c.line = -1;
          c.crumble = -1;
          crumbled = true;
        }
      }
    }
    if (crumbled) playCrumble();

    // Flaming weed leaves slide along and bounce off walls
    for (const pu of s.powerups) {
      pu.vy = Math.min(300, pu.vy + GRAVITY * 0.7 * dt);
      pu.x += pu.vx * dt;
      const front = pu.vx > 0 ? pu.x + 14 : pu.x;
      if (solidAt(front, pu.y + 7)) pu.vx = -pu.vx;
      pu.y += pu.vy * dt;
      if (solidAt(pu.x + 7, pu.y + 14)) {
        pu.y = Math.floor((pu.y + 14) / T) * T - 14;
        pu.vy = 0;
      }
      if (hx() + HB_W > pu.x && hx() < pu.x + 14 && hy() + HB_H > pu.y && hy() < pu.y + 14) {
        // Power-ups don't stack: picking one up just refills it
        if (s.bossState === "fight" && pu.kind !== "double") {
          // in the arena the blocks top up your spell
          s.power = pu.kind;
          s.ammo += boxShots(); // 3 (more with the BIGGER STASH prize)
          if (pu.kind === "fire") s.fireTime = 999;
          if (s.kboss && s.kboss.kind === "horned") {
            s.doubleJumps = Math.max(s.doubleJumps, 1);
            popup(pu.x + 7, pu.y - 4, "+3 SHOTS +1 JUMP");
          } else popup(pu.x + 7, pu.y - 4, `+${boxShots()} SHOTS`);
        } else if (pu.kind === "fire") {
          s.power = "fire";
          s.ammo = fireAmmo();
          s.fireTime = fireTimeMax();
          popup(pu.x + 7, pu.y - 4, "FIRE!");
          showHint("shoot", "PRESS S TO SHOOT");
        } else if (pu.kind === "ice") {
          s.power = "ice";
          s.ammo = iceAmmo();
          s.fireTime = 0;
          popup(pu.x + 7, pu.y - 4, "ICE!");
          showHint("shoot", "PRESS S TO SHOOT");
        } else if (pu.kind === "spike") {
          s.power = "spike";
          s.ammo = spikeAmmo();
          s.fireTime = 0;
          popup(pu.x + 7, pu.y - 4, "SPIKES!");
          showHint("shoot", "PRESS S TO SHOOT");
        } else {
          s.doubleJumps = DOUBLE_JUMPS;
          popup(pu.x + 7, pu.y - 4, "DOUBLE JUMP!");
          showHint("double", "JUMP AGAIN IN THE AIR!");
        }
        s.bonus += 100;
        burst(pu.x + 7, pu.y + 7, 20, powerSparks(pu.kind), 70);
        playPowerUp();
        pu.y = 999;
      }
    }
    s.powerups = s.powerups.filter((pu) => pu.y < H + 20 && pu.x > s.cam - 40);

    // Little flames around you while you have fire
    if (hasFire()) {
      s.auraTimer -= dt;
      if (s.auraTimer <= 0) {
        s.auraTimer = 0.07;
        s.particles.push({
          x: s.x + rand(6, 18),
          y: s.y + rand(0, 10),
          vx: rand(-10, 10),
          vy: rand(-60, -30),
          color: powerSparks(s.power)[Math.floor(Math.random() * 3)],
          life: rand(0.2, 0.4),
        });
      }
    }

    // Fireballs bounce along the ground and burn monsters
    for (const f of s.fireballs) {
      f.life -= dt;
      if (!f.ice && !f.spike && !f.pet) f.vy = Math.min(300, f.vy + 900 * dt);
      f.x += f.vx * dt;
      if (f.spike || f.pet) f.y += f.vy * dt; // spikes (and the dog's shots) fly dead straight, whichever way they were thrown
      if (solidAt(f.x + (f.vx > 0 ? 4 : 0), f.y + 2)) {
        f.life = 0;
        burst(f.x, f.y, f.spike ? 3 : 6, shotSparks(f), 40);
        continue;
      }
      if (f.spike) {
        // little purple trail
        if (Math.random() < 0.4) {
          s.particles.push({ x: f.x + 1, y: f.y + 1, vx: 0, vy: 0, color: SPIKE[Math.floor(Math.random() * 3)], life: 0.15 });
        }
        if (f.y < -40) f.life = 0;
      } else if (f.pet) {
        // the dog's shot: a tiny white trail
        if (Math.random() < 0.4) s.particles.push({ x: f.x + 1, y: f.y + 1, vx: 0, vy: 0, color: PET_SPARKS[Math.floor(Math.random() * 3)], life: 0.12 });
        if (f.y < -40) f.life = 0;
      } else if (f.ice) {
        // little frost trail
        if (Math.random() < 0.5) {
          s.particles.push({ x: f.x, y: f.y + rand(0, 4), vx: 0, vy: rand(-10, 10), color: ICE[Math.floor(Math.random() * 4)], life: 0.25 });
        }
      } else {
        f.y += f.vy * dt;
        if (solidAt(f.x + 2, f.y + 4)) {
          f.y = Math.floor((f.y + 4) / T) * T - 4;
          f.vy = -170;
        }
      }
      if (f.x < s.cam - 10 || f.x > s.cam + W + 10 || f.y > H) f.life = 0;
      for (const e of s.enemies) {
        if (!e.alive || e.kind === "bong") continue;
        if (f.x + 4 > e.x && f.x < e.x + enemyW(e) && f.y + 4 > e.y && f.y < e.y + enemyH(e)) {
          if (e.kind === "bear") hitBear(e); // a bear takes two
          else killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          // PIERCING SHOTS (a spin prize): your shot carries on through one more monster per level
          if (!f.pet && (f.pierced ?? 0) < s.perks.pierce) {
            f.pierced = (f.pierced ?? 0) + 1;
            continue;
          }
          f.life = 0;
          break;
        }
      }
      // SPIKE SHOT: only the first spike of a burst hurts a boss, the others just pop on him
      const spent = !!f.spike && f.volley === s.spikeHitVolley;
      const tb = s.boss;
      if (f.life > 0 && tb && tb.dead <= 0 && tb.dazed <= 0) {
        const tbGiant = tb.kind === "giant";
        const bx1 = tb.x + (tbGiant ? GIANT_HX : TR_HX);
        const by1 = tb.y + (tbGiant ? GIANT_HY : TR_HY);
        const bw1 = tbGiant ? GIANT_HW : TR_HW;
        const bh1 = tbGiant ? GIANT_HH : TR_HH;
        if (f.x + 4 > bx1 && f.x < bx1 + bw1 && f.y + 4 > by1 && f.y < by1 + bh1) {
          f.life = 0;
          if (f.pet) {
            burst(f.x, f.y, 4, PET_SPARKS, 30); // the dog's shots are too small to hurt him
          } else if (!spent) {
            if (f.spike) s.spikeHitVolley = f.volley ?? -1;
            hitBoss(shotSparks(f));
          }
        }
      }
      const lb = s.lboss;
      if (f.life > 0 && lb && lb.dead <= 0) {
        const bw = lb.kind === "snowman" ? SN_W : EL_W;
        const bh = lb.kind === "snowman" ? SN_H : EL_H;
        if (lb.dazed <= 0 && f.x + 4 > lb.x + 6 && f.x < lb.x + bw - 6 && f.y + 4 > lb.y + 4 && f.y < lb.y + bh - 4) {
          f.life = 0;
          if (f.pet) {
            burst(f.x, f.y, 4, PET_SPARKS, 30); // BOBO's shots are too small to hurt a boss
          } else if (!spent) {
            if (f.spike) s.spikeHitVolley = f.volley ?? -1;
            hitLevelBoss(shotSparks(f));
          }
        }
      }
      // LEVEL 3 knights: the horned warrior takes shots, the skeleton's armour shrugs them off,
      // and WARLORD's shield knocks them straight back
      const kf = s.kboss;
      if (f.life > 0 && kf && kf.dead <= 0) {
        const kbx = knightBox(kf);
        if (f.x + 4 > kbx.x1 && f.x < kbx.x2 && f.y + 4 > kbx.y1 && f.y < kbx.y2) {
          if (spent) {
            f.life = 0;
          } else if (kf.kind === "horned") {
            f.life = 0;
            if (f.spike) s.spikeHitVolley = f.volley ?? -1;
            kf.hp -= 1;
            kf.hit = 0.35;
            burst((kbx.x1 + kbx.x2) / 2, kf.y + 24, 16, shotSparks(f), 70);
            s.shake = 0.1;
            playStomp();
            if (kf.hp <= 0) {
              kf.dead = 1.6;
              kf.vx = 0;
              popup((kbx.x1 + kbx.x2) / 2, kbx.y1 - 10, "BYE HORNS!");
              playTrollDeath();
            } else {
              popup((kbx.x1 + kbx.x2) / 2, kbx.y1 - 10, `${kf.hp} LEFT`);
              if (kf.hp === kf.maxHp - HORNED_AMMO) {
                s.flash = 2.5;
                s.flashText = "HE'S RAGING! JUMP HIM, HIT THE BOX";
              }
            }
          } else if (kf.kind === "warlord") {
            f.vx = -f.vx;
            f.x = f.vx < 0 ? kbx.x1 - 8 : kbx.x2 + 4;
            f.life = Math.min(f.life, 0.5);
            burst(f.x, f.y, 6, ["#f0c030", "#ffffff"], 60);
            popup(f.x, f.y - 10, "BLOCKED!");
            playBump();
          } else {
            f.life = 0;
            burst(f.x, f.y, 6, KNIGHT_DUST, 50);
            popup(f.x, f.y - 10, "CLANG!");
            playBump();
          }
        }
      }
      // LEVEL 4: TOMBFELL's shield eats every shot, until he's fallen off the bear. His cats and
      // plain doves can be shot away (never the pink dove: that one you have to jump on).
      const tf = s.tboss;
      if (f.life > 0 && tf && tf.dead <= 0) {
        for (const c of tf.cats) {
          if (c.act === "gone" || c.act === "ball" || c.act === "roll") continue;
          if (f.x + 4 > c.x && f.x < c.x + 14 && f.y + 4 > c.y && f.y < c.y + 14) {
            c.act = "gone";
            f.life = 0;
            s.bonus += PTS_WALKER;
            burst(c.x + 7, c.y + 7, 10, shotSparks(f), 55);
            playStomp();
            break;
          }
        }
        for (const d of tf.doves) {
          if (f.life <= 0) break;
          if (d.state !== "fly" || d.wait > 0 || d.pink) continue;
          if (f.x + 4 > d.x && f.x < d.x + 18 && f.y + 4 > d.y && f.y < d.y + 12) {
            d.state = "gone";
            f.life = 0;
            s.bonus += PTS_FLYER;
            burst(d.x + 8, d.y + 5, 10, ["#ffffff", "#c9d2e6"], 60);
            playStomp();
          }
        }
        if (f.life > 0 && f.x + 4 > tf.x + 5 && f.x < tf.x + TOMB_W - 5 && f.y + 4 > tf.y + 6 && f.y < tf.y + TOMB_H) {
          f.life = 0;
          if (tf.fallen) {
            if (!spent && tf.hit <= 0) {
              if (f.spike) s.spikeHitVolley = f.volley ?? -1;
              hitTombfell(shotSparks(f));
            }
          } else {
            burst(f.x, f.y, 6, GLITCH, 60);
            popup(f.x, f.y - 10, "SHIELD!");
            playBump();
          }
        }
      }
    }
    // Your shots (not the dog's) break the ice spikes, whether they're still forming or already falling
    for (const ic of s.icicles) {
      for (const f of s.fireballs) {
        if (f.life > 0 && !f.pet && f.x + 4 > ic.x - 4 && f.x < ic.x + 4 && f.y + 4 > 0 && f.y < ic.y + Math.max(ic.len, 6)) {
          f.life = 0;
          ic.dead = true;
          burst(ic.x, Math.min(f.y, 120), 10, ["#e6f6ff", "#9fd8ff", "#ffffff"], 60);
          beep(1100, 350, 0.06, 0.03, "triangle");
          break;
        }
      }
    }
    // Crypt torches (standing on the floor, where a normal shot reaches them): a fire shot lights one. It lights the way (the crypt is dark) and drops a gold coin.
    for (const tc of s.torches) {
      if (tc.lit) continue;
      for (const f of s.fireballs) {
        if (f.life > 0 && !f.ice && f.x + 4 > tc.x - 2 && f.x < tc.x + 14 && f.y + 4 > tc.y - 20 && f.y < tc.y + 18) {
          tc.lit = true;
          f.life = 0;
          burst(tc.x + 6, tc.y + 4, 16, ["#ffd23c", "#ff8c1e", "#ffffff"], 70);
          s.leaves.push({ x: tc.x + 2, y: tc.y - 16, taken: false, coin: true });
          popup(tc.x + 6, tc.y - 6, "LIT!");
          playPowerUp();
          break;
        }
      }
    }
    s.fireballs = s.fireballs.filter((f) => f.life > 0);

    // Drone lasers: swoop down to waist height, then fly straight. Touching one hurts.
    for (const l of s.lasers) {
      l.x += l.vx * dt;
      l.y += (l.ty - l.y) * Math.min(1, dt * 8);
      l.life -= dt;
      if (l.life > 0 && s.invuln <= 0 && hx() + HB_W > l.x && hx() < l.x + 12 && hy() + HB_H > l.y && hy() < l.y + 3) {
        l.life = 0;
        hurt();
        return;
      }
    }
    s.lasers = s.lasers.filter((l) => l.life > 0 && l.x > s.cam - 40 && l.x < s.cam + W + 40);

    // Monsters
    const woodsLevel = s.levelMode && LEVELS[s.level - 1]?.zone === LEVEL_WOODS; // Level 4: cats, doves and bears
    const keepLevel = s.levelMode && LEVELS[s.level - 1]?.zone === LEVEL_KEEP; // Level 3: skeletons and oni
    for (const e of s.enemies) {
      if (!e.alive) {
        e.squash -= dt;
        continue;
      }
      if (e.x < s.cam - 60 || e.x > s.cam + W + 40) {
        if (e.x < s.cam - 60) e.alive = false;
        continue;
      }
      if (e.kind === "bear") {
        // BLACK BEAR (Level 4): big and slow, takes two jumps on its back. The first one makes it
        // angry: it turns on you and gets a lot faster.
        if ((e.timer ?? 0) > 0) e.timer = (e.timer ?? 0) - dt;
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        const bearFront = e.vx < 0 ? e.x : e.x + BEAR_W;
        const bearFootRow = Math.floor((e.y + BEAR_H) / T);
        if (solidAt(bearFront, e.y + BEAR_H - 6) || !solidAt(bearFront, (bearFootRow + 0.5) * T)) e.vx = -e.vx;
        e.y += e.vy * dt;
        if (solidAt(e.x + BEAR_W / 2, e.y + BEAR_H)) {
          e.y = Math.floor((e.y + BEAR_H) / T) * T - BEAR_H;
          e.vy = 0;
        }
        if (e.y > H + 20) e.alive = false;
        if (hx() + HB_W > e.x + 3 && hx() < e.x + BEAR_W - 3 && hy() + HB_H > e.y + 3 && hy() < e.y + BEAR_H) {
          if (cameDown(e.y, 12)) {
            s.vy = STOMP_BOUNCE;
            if ((e.timer ?? 0) <= 0) hitBear(e);
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
        continue;
      }
      if (e.kind === "flyer" && colAt(Math.floor((e.x + 9) / T)).zone === F_IPOD && !s.inBonus) {
        // IPOD USER drone: hovers above head height, drifts, and every few seconds fires a red laser
        // that swoops down to your waist and races along: jump over it
        e.phase += dt * 3;
        e.x += e.vx * 0.6 * dt;
        const g = colAt(Math.floor((e.x + 9) / T)).ground;
        const floor = (g >= 0 ? g : 8) * T;
        e.y += (floor - 58 + Math.sin(e.phase) * 3 - e.y) * Math.min(1, dt * 3);
        if (e.shoot === undefined) e.shoot = rand(1, 2.2);
        const dxp = s.x + SPRITE_W / 2 - (e.x + 9);
        if (Math.abs(dxp) < 230 && e.x > s.cam && e.x < s.cam + W - 10) {
          e.shoot -= dt;
          if (e.shoot <= 0) {
            e.shoot = rand(2.2, 3.4);
            const dir = dxp < 0 ? -1 : 1;
            s.lasers.push({ x: e.x + 4, y: e.y + 12, vx: dir * LASER_SPEED, ty: s.y + SPRITE_H - 16, life: 3 });
            beep(1400, 500, 0.12, 0.035, "sawtooth");
          }
        }
      } else if (e.kind === "flyer" && woodsLevel) {
        // DOVE (Level 4): glides left in a gentle wave. A swooper dives down at your head when
        // you get close, then climbs back up.
        e.phase += dt * 2.6;
        e.x += e.vx * dt;
        if (e.home === undefined) e.home = e.baseY;
        const doveDx = e.x + 9 - (s.x + SPRITE_W / 2);
        const diving = !!e.swooper && doveDx > -24 && doveDx < 110;
        const doveGoal = diving ? Math.min(s.y + 6, 8 * T - 30) : e.home;
        e.baseY += (doveGoal - e.baseY) * Math.min(1, dt * (diving ? 2.6 : 1.6));
        e.y = e.baseY + Math.sin(e.phase) * (diving ? 4 : 12);
      } else if (e.kind === "flyer") {
        // Green flyer: floats left in a wave
        e.phase += dt * 2.6;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.phase) * 14;
      } else if (e.kind === "bong") {
        // Little bong: sits still until you walk into it. Kicked, it slides along, bounces off walls
        // and knocks out every monster it touches (the kill streak multiplies the points).
        e.kick = Math.max(0, (e.kick ?? 0) - dt);
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        if (e.vx !== 0) {
          const front = e.vx < 0 ? e.x : e.x + 14;
          if (solidAt(front, e.y + 7)) e.vx = -e.vx;
          if (Math.random() < 0.5) {
            s.smoke.push({ x: e.x + 7 + rand(-3, 3), y: e.y + 2, vx: rand(-8, 8), vy: rand(-22, -8), r: rand(1, 2), life: rand(0.35, 0.7) });
          }
          for (const o of s.enemies) {
            if (o === e || !o.alive || o.kind === "bong") continue;
            const ow = o.kind === "flyer" ? 18 : 14;
            if (e.x + 14 > o.x && e.x < o.x + ow && e.y + 14 > o.y && e.y < o.y + 14) {
              killEnemy(o, o.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
            }
          }
        } else {
          e.idle = (e.idle ?? 0) + dt;
          if (Math.random() < dt * 3) {
            s.smoke.push({ x: e.x + 12, y: e.y, vx: rand(-4, 4), vy: rand(-18, -8), r: rand(1, 2), life: rand(0.5, 1) });
          }
          if (e.idle > BONG_IDLE_LIFE) e.alive = false;
        }
        e.y += e.vy * dt;
        if (solidAt(e.x + 7, e.y + 14)) {
          e.y = Math.floor((e.y + 14) / T) * T - 14;
          e.vy = 0;
        }
        if (e.y > H + 20) e.alive = false;
      } else if (e.kind === "walker" && woodsLevel) {
        // CAT (Level 4): sneaks along like any walker. When you get close it crouches (its eyes
        // turn red: your warning), then pounces at you.
        e.timer = (e.timer ?? 0) - dt;
        let catDir = e.dir ?? (e.vx < 0 ? -1 : 1);
        const catDx = s.x + SPRITE_W / 2 - (e.x + 7);
        const catOnFloor = e.vy === 0;
        if (e.act === "crouch") {
          e.vx = 0;
          if (e.timer <= 0) {
            e.act = "leap";
            e.vy = CAT_LEAP_UP;
            e.vx = catDir * CAT_LEAP_SPEED;
            beep(700, 1100, 0.08, 0.03, "triangle");
          }
        } else if (e.act !== "leap") {
          e.vx = catDir * CAT_SPEED;
          if (e.timer <= 0 && catOnFloor && Math.abs(catDx) < CAT_SEE && Math.abs(catDx) > 12 && Math.abs(s.y + SPRITE_H - (e.y + 14)) < 44) {
            e.act = "crouch";
            e.timer = CAT_CROUCH;
            catDir = catDx < 0 ? -1 : 1;
            e.vx = 0;
          }
        }
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        if (e.act === "leap") {
          // in the air: a wall just stops it
          if (e.vx !== 0 && solidAt(e.vx < 0 ? e.x : e.x + 14, e.y + 7)) e.vx = 0;
        } else if (e.vx !== 0) {
          const catFront = e.vx < 0 ? e.x : e.x + 14;
          const catFootRow = Math.floor((e.y + 14) / T);
          if (solidAt(catFront, e.y + 7) || !solidAt(catFront, (catFootRow + 0.5) * T)) catDir = -catDir;
        }
        e.dir = catDir;
        e.y += e.vy * dt;
        if (e.vy >= 0 && solidAt(e.x + 7, e.y + 14)) {
          e.y = Math.floor((e.y + 14) / T) * T - 14;
          e.vy = 0;
          if (e.act === "leap") {
            e.act = "walk";
            e.timer = CAT_REST;
          }
        }
        if (e.y > H + 20) e.alive = false;
      } else {
        // SKELETON (Level 3): walks like any walker, but when you're close in front of it, it stops and a red "!" shows over its head
        // (the exact warning the SKELETON KNIGHT gives), then it slashes its knife. Jump the slash, or stomp it while it winds up.
        if (keepLevel && e.kind === "walker" && e.phase === 0) {
          if (e.sv === undefined) e.sv = Math.abs(e.vx) || 30;
          e.timer = (e.timer ?? 0) - dt;
          const sdx = s.x + SPRITE_W / 2 - (e.x + 7);
          if (e.act === "wind") {
            e.vx = 0;
            if (e.timer <= 0) {
              e.act = "slash";
              e.timer = 0.22;
              beep(900, 200, 0.1, 0.04, "sawtooth");
            }
          } else if (e.act === "slash") {
            e.vx = 0;
            const kx1 = (e.dir ?? -1) < 0 ? e.x - 24 : e.x + 14; // the knife reaches 24px in front of it
            if (s.invuln <= 0 && hx() + HB_W > kx1 && hx() < kx1 + 24 && hy() + HB_H > e.y - 4 && hy() < e.y + 14) {
              hurt();
              return;
            }
            if (e.timer <= 0) {
              e.act = "walk";
              e.timer = 1;
              e.vx = (sdx < 0 ? -1 : 1) * e.sv;
            }
          } else if (e.timer <= 0 && e.vy === 0 && Math.abs(sdx) < 50 && Math.abs(s.y + SPRITE_H - (e.y + 14)) < 24) {
            e.act = "wind";
            e.timer = 0.5;
            e.dir = sdx < 0 ? -1 : 1;
            e.vx = 0;
          }
        }
        // Walker (and the walking eye): walks, turns at edges and walls
        e.vy = Math.min(420, e.vy + GRAVITY * dt);
        e.x += e.vx * dt;
        if (e.summoned) {
          // (a skeleton the Warlord called in stays in the arena)
          if (e.x < s.cam + 2) {
            e.x = s.cam + 2;
            e.vx = Math.abs(e.vx);
          } else if (e.x > s.cam + W - 16) {
            e.x = s.cam + W - 16;
            e.vx = -Math.abs(e.vx);
          }
        }
        const front = e.vx < 0 ? e.x : e.x + 14;
        const footRow = Math.floor((e.y + 14) / T);
        const wall = solidAt(front, e.y + 7);
        const edge = !solidAt(front, (footRow + 0.5) * T);
        if (wall || edge) e.vx = -e.vx;
        e.y += e.vy * dt;
        if (solidAt(e.x + 7, e.y + 14)) {
          e.y = Math.floor((e.y + 14) / T) * T - 14;
          e.vy = 0;
        }
        if (e.y > H + 20) e.alive = false;
      }

      // Touching you
      const ew = e.kind === "flyer" ? 18 : 14;
      const px1 = hx();
      const py1 = hy();
      if (px1 + HB_W > e.x + 2 && px1 < e.x + ew - 2 && py1 + HB_H > e.y + 2 && py1 < e.y + 12) {
        const falling = cameDown(e.y, 10);
        if (e.kind === "bong") {
          // A bong never hurts you
          if (e.vx !== 0) {
            if (falling) {
              // jump on a sliding bong: it stops
              e.vx = 0;
              e.idle = 0;
              e.kick = 0.3;
              s.vy = STOMP_BOUNCE;
              beep(260, 180, 0.08, 0.04, "square");
            }
          } else if ((e.kick ?? 0) <= 0) {
            // walk into it: it flies off the way you were going
            const fromLeft = px1 + HB_W / 2 < e.x + 7;
            const dir = falling ? (s.facing >= 0 ? 1 : -1) : fromLeft ? 1 : -1;
            e.vx = dir * BONG_KICK_SPEED;
            e.kick = 0.25;
            if (falling) s.vy = STOMP_BOUNCE;
            beep(300, 700, 0.1, 0.05, "square");
          }
        } else if (falling) {
          const wasEye = e.kind === "eye";
          killEnemy(e, e.kind === "flyer" ? PTS_FLYER : PTS_WALKER);
          if (wasEye) {
            // the eye pops and leaves a little bong behind
            e.kind = "bong";
            e.alive = true;
            e.squash = 0;
            e.vx = 0;
            e.vy = 0;
            e.idle = 0;
            e.kick = 0.3;
          }
          s.vy = STOMP_BOUNCE;
        } else if (s.invuln <= 0) {
          hurt();
          return;
        }
      }
    }
    s.enemies = s.enemies.filter((e) => e.alive || e.squash > 0);

    // The evil weed leaf: floats around, follows you, and every few seconds dives at you
    const lb = s.lboss;
    if (lb) {
      if (lb.dead > 0) {
        lb.dead -= dt;
        lb.y += 40 * dt;
        if (Math.random() < 0.6) {
          const snow = lb.kind === "snowman";
          burst(lb.x + rand(4, (snow ? SN_W : EL_W) - 4), lb.y + rand(4, snow ? SN_H : EL_H), 2, snow ? ["#ffffff", "#dff3fb", "#aac3e1"] : [LIGHT_GREEN, GREEN, "#ffffff"], 40);
        }
        if (lb.dead <= 0) {
          s.lboss = null;
          s.lbossState = "done";
          s.bossState = "none";
          if (!s.levelMode) {
            runBossBeaten("snowman"); // the infinite run: points, the boss spin, on you go
          } else {
            s.flash = 2.5;
            s.flashText = lb.kind === "snowman" ? "THE EVIL SNOWMAN MELTED! GO HIT THE BONG" : "EVIL LEAF DOWN! GO HIT THE BONG";
            if (s.power === "fire") s.fireTime = Math.min(s.fireTime, FIRE_TIME);
            s.ammo = Math.min(s.ammo, 5);
          }
        }
      } else if (lb.kind === "snowman") {
        // THE EVIL SNOWMAN: stomps after you and hops. Shots only; once he's out of hits he gets
        // dizzy for a few seconds and you finish him by jumping on his head.
        if (lb.hit > 0) lb.hit -= dt;
        if (lb.speech > 0) lb.speech -= dt;
        const floorY = 8 * T - SN_H;
        const pc = s.x + HB_X + HB_W / 2;
        const bc = lb.x + SN_W / 2;
        const onFloor = lb.y >= floorY - 0.5;
        if (lb.dazed > 0) {
          lb.dazed -= dt;
          lb.vx = 0;
          if (lb.dazed <= 0) {
            lb.hp = 3; // took too long: he shakes it off
            popup(bc, lb.y - 8, "HE'S BACK UP!");
          }
        } else if (onFloor) {
          lb.facing = pc < bc ? -1 : 1;
          lb.vx = lb.facing * 40;
          lb.diveTimer -= dt;
          if (lb.diveTimer <= 0 && Math.abs(pc - bc) < 130) {
            lb.vy = -300;
            lb.vx = lb.facing * 70;
            lb.diveTimer = rand(2, 3.2);
            playBump();
          }
        }
        lb.vy = Math.min(420, lb.vy + GRAVITY * dt);
        lb.x += lb.vx * dt;
        lb.y += lb.vy * dt;
        if (lb.y > floorY) {
          if (lb.vy > 200) s.shake = 0.12;
          lb.y = floorY;
          lb.vy = 0;
        }
        lb.x = Math.max(s.cam, Math.min(s.cam + W - SN_W, lb.x));
        const bx1 = lb.x + 8;
        const by1 = lb.y + 6;
        if (hx() + HB_W > bx1 && hx() < bx1 + SN_W - 16 && hy() + HB_H > by1 && hy() < lb.y + SN_H) {
          const onTop = cameDown(by1, 14);
          // while he's dizzy any landing on him counts (a jump from the side used to do nothing)
          const dazedStomp = lb.dazed > 0 && s.vy > 0 && hy() + HB_H - by1 < (SN_H - 6) * 0.7;
          if (dazedStomp) {
            // the finishing stomp!
            s.vy = STOMP_BOUNCE;
            lb.dazed = 0;
            lb.dead = 1.6;
            popup(bc, lb.y - 8, "MELTED!");
            playTrollDeath();
          } else if (onTop) {
            s.vy = STOMP_BOUNCE;
            popup(bc, lb.y - 8, "NOPE!");
            playBump();
          } else if (lb.dazed <= 0 && s.invuln <= 0) {
            hurt();
            return;
          }
        }
      } else {
        if (lb.hit > 0) lb.hit -= dt;
        const pc = s.x + HB_X + HB_W / 2;
        const bc = lb.x + EL_W / 2;
        lb.facing = pc < bc ? -1 : 1;
        const floorY = 8 * T - EL_H;
        if (lb.dive > 0) {
          lb.dive -= dt;
          lb.vy = Math.min(lb.vy + 520 * dt, 260);
          lb.y += lb.vy * dt;
          lb.x += lb.vx * dt;
          if (lb.y >= floorY) {
            lb.y = floorY;
            lb.dive = 0;
            s.shake = 0.1;
          }
        } else {
          const hoverY = 46 + Math.sin(s.t * 2) * 10;
          lb.y += (hoverY - lb.y) * Math.min(1, dt * 1.6);
          lb.vx += (lb.facing * 50 - lb.vx) * Math.min(1, dt * 2);
          lb.x += lb.vx * dt;
          lb.diveTimer -= dt;
          if (lb.diveTimer <= 0 && Math.abs(pc - bc) < 100) {
            lb.dive = 1.4;
            lb.vy = 40;
            lb.vx = lb.facing * 60;
            lb.diveTimer = rand(2.4, 3.6);
            playBump();
          }
        }
        lb.x = Math.max(s.cam, Math.min(s.cam + W - EL_W, lb.x));
        // touching it hurts; landing on top just bounces you off
        const bx1 = lb.x + 6;
        const by1 = lb.y + 4;
        if (hx() + HB_W > bx1 && hx() < bx1 + EL_W - 12 && hy() + HB_H > by1 && hy() < by1 + EL_H - 8) {
          if (cameDown(by1, 12)) {
            s.vy = STOMP_BOUNCE;
            popup(lb.x + EL_W / 2, lb.y - 6, "NOPE!");
            playBump();
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
      }
      // the arena's bonus blocks refill every few seconds
      s.bossRefill += dt;
      if (s.bossRefill > 10) {
        s.bossRefill = 0;
        for (let k = 0; k < 22; k++) {
          const c = colAt(s.bossCol + k);
          if (c.bonus >= 0 && c.used) {
            c.used = false;
            c.bump = 0.15;
          }
        }
      }
    }

    // ---------- LEVEL 3 knights ----------
    const kn = s.kboss;
    if (kn) {
      const d = KN_DIM[kn.kind];
      const floorY = 8 * T - d.foot;
      if (kn.hit > 0) kn.hit -= dt;
      if (kn.inv > 0) kn.inv -= dt;
      const pc = s.x + HB_X + HB_W / 2;
      const bc = kn.x + d.w / 2;
      const towards = pc < bc ? -1 : 1;
      if (kn.dead > 0) {
        // falling apart
        kn.dead -= dt;
        kn.y += 26 * dt;
        if (Math.random() < 0.7) burst(kn.x + rand(10, d.w - 10), kn.y + rand(10, d.foot), 2, KNIGHT_DUST, 50);
        if (kn.dead <= 0) {
          s.kboss = null;
          s.bossState = "none"; // the screen scrolls again
          s.kwaves = [];
          s.kshots = [];
          s.cover = [];
          s.enemies = s.enemies.filter((e) => !e.summoned);
          if (!s.levelMode) {
            runBossBeaten("skeleton"); // the infinite run: points, the boss spin, on you go
          } else {
            s.flash = 2.5;
            s.flashText =
              kn.kind === "warlord" ? "WARLORD IS DOWN! GO HIT THE BONG" : kn.kind === "horned" ? "HORNED WARRIOR DOWN! KEEP GOING" : "SKELETON KNIGHT DOWN! KEEP GOING";
            if (s.power === "fire") s.fireTime = Math.min(s.fireTime, FIRE_TIME);
            s.ammo = Math.min(s.ammo, 5);
          }
        }
      } else {
        const angry = kn.kind === "warlord" && kn.hp <= Math.ceil(kn.maxHp / 2);
        const onFloor = kn.y >= floorY - 0.5;
        if (kn.act === "stagger") {
          // just got stomped: slides back a bit
          kn.timer -= dt;
          kn.vx *= Math.max(0, 1 - dt * 5);
          if (kn.timer <= 0) {
            if (kn.kind === "warlord") {
              // he gets straight back up and blasts you with his eyes
              kn.act = "beam";
              kn.timer = 0.45;
              kn.waves = EYE_WAVES;
            } else {
              kn.act = "walk";
              kn.cool = Math.max(kn.cool, 0.6);
            }
          }
        } else if (kn.kind === "horned") {
          // THE HORNED WARRIOR: runs at you (fast!) swinging his chain mace round and round.
          // Every few seconds he lets the chain out wide. Only shots hurt him.
          kn.facing = towards;
          const rage = kn.hp <= kn.maxHp - HORNED_AMMO;
          kn.ang += dt * (kn.act === "swing" ? 11 : rage ? 10 : 7) * (kn.facing < 0 ? -1 : 1);
          if (rage && Math.random() < 0.3) burst(kn.x + rand(10, 38), kn.y + rand(0, 12), 1, ["#ff2a2a", "#ff8f40"], 30);
          if (kn.act === "swing") {
            kn.vx = 0;
            kn.timer -= dt;
            const k = 1 - Math.abs((kn.timer / 1.3) * 2 - 1);
            kn.reach = 20 + HORNED_SWING_REACH * Math.max(0, k);
            if (kn.timer <= 0) {
              kn.act = "walk";
              kn.cool = rand(1.0, 1.8);
              kn.reach = 20;
            }
          } else {
            kn.vx = kn.facing * (rage ? HORNED_RAGE_SPEED : HORNED_SPEED);
            kn.cool -= dt;
            if (kn.cool <= 0 && Math.abs(pc - bc) < 150 && s.onGround) {
              kn.act = "swing";
              kn.timer = 1.3;
              playBump();
            }
          }
        } else if (kn.kind === "skeleton") {
          // THE SKELETON KNIGHT: walks up to you, shakes for a split second, then slashes far in front of him.
          // Jump over the slash and land on his head.
          if (kn.act === "walk") {
            kn.facing = towards;
            kn.vx = kn.facing * 46;
            kn.cool -= dt;
            if (kn.cool <= 0 && Math.abs(pc - bc) < (s.levelMode ? 95 : RUN_SKELETON_TRIGGER)) {
              kn.act = "wind";
              kn.timer = 0.28;
              kn.vx = 0;
            }
          } else if (kn.act === "wind") {
            kn.vx = 0;
            kn.timer -= dt;
            if (kn.timer <= 0) {
              kn.act = "swing";
              kn.timer = 0.25;
              beep(900, 200, 0.12, 0.05, "sawtooth");
            }
          } else if (kn.act === "swing") {
            kn.vx = kn.facing * 70;
            kn.timer -= dt;
            if (kn.timer <= 0) {
              kn.act = "rest";
              kn.timer = 0.45;
            }
          } else {
            kn.vx = 0;
            kn.timer -= dt;
            if (kn.timer <= 0) {
              kn.act = "walk";
              kn.cool = rand(0.25, 0.7);
            }
          }
        } else {
          // WARLORD COLOSSUS: shield up, giant sword. Pulls the sword back, then SLAMS it down in
          // front of him and a shockwave runs along the floor (jump it). After a slam he needs a
          // moment to lift the sword again: that's your chance to land on his head.
          // At half health he gets angry: faster, shockwaves both ways, and he jumps at you.
          const sp = angry ? 1.45 : 1;
          if (kn.act === "walk") {
            kn.facing = towards;
            kn.vx = kn.facing * 24 * sp;
            kn.ang += (SW_IDLE - kn.ang) * Math.min(1, dt * 4);
            kn.cool -= dt;
            if (kn.cool <= 0) {
              if (Math.abs(pc - bc) < 130 && Math.random() < 0.7) {
                kn.act = "wind";
                kn.timer = untilBeat((angry ? 0.5 : 0.75) + 0.26) - 0.26; // (the slam lands on a beat)
                kn.vx = 0;
                playBump();
              } else if (angry && Math.random() < 0.4) {
                kn.act = "hop";
                kn.vy = -360;
                kn.vx = kn.facing * 110;
                playBump();
              } else {
                // eyes start glowing... sound waves incoming
                kn.act = "beam";
                kn.timer = untilBeat(0.6); // (the first wave fires on a beat)
                kn.waves = EYE_WAVES;
                kn.vx = 0;
              }
            }
          } else if (kn.act === "wind") {
            kn.vx = 0;
            kn.timer -= dt;
            kn.ang += (SW_BACK - kn.ang) * Math.min(1, dt * 8);
            if (kn.timer <= 0) {
              kn.act = "swing";
              kn.timer = 0.26;
              beep(500, 90, 0.25, 0.08, "sawtooth");
            }
          } else if (kn.act === "swing") {
            kn.vx = 0;
            kn.timer -= dt;
            const k = 1 - Math.max(0, kn.timer) / 0.26;
            kn.ang = SW_BACK + (SW_SLAM - SW_BACK) * k * k;
            if (kn.timer <= 0) {
              kn.ang = SW_SLAM;
              const tip = knightSwordPoint(kn, 1);
              s.kwaves.push({ x: tip.x, dir: kn.facing, life: 1.1 });
              if (angry) s.kwaves.push({ x: tip.x, dir: -kn.facing, life: 1.1 });
              s.shake = 0.25;
              burst(tip.x, 8 * T - 2, 14, KNIGHT_DUST, 80);
              playBump();
              kn.act = "rest";
              kn.timer = angry ? 0.9 : 1.3;
            }
          } else if (kn.act === "beam") {
            kn.vx = 0;
            kn.timer -= dt;
            if (kn.timer <= 0) {
              fireEyeWaves(kn);
              kn.waves -= 1;
              if (kn.waves > 0) kn.timer = untilBeat(0.25); // the next wave, on the next beat, aimed at where you are now
              else {
                kn.act = "rest";
                kn.timer = 0.6;
              }
            }
          } else if (kn.act === "hop") {
            if (onFloor && kn.vy >= 0) {
              // lands: shockwaves both ways
              const b = knightBox(kn);
              s.kwaves.push({ x: b.x1, dir: -1, life: 1 }, { x: b.x2, dir: 1, life: 1 });
              s.shake = 0.3;
              playBump();
              kn.vx = 0;
              kn.act = "rest";
              kn.timer = 0.8;
            }
          } else {
            kn.vx = 0;
            kn.timer -= dt;
            if (kn.timer <= 0) {
              kn.act = "walk";
              kn.cool = rand(1.1, 1.9) / sp;
            }
          }
        }
        kn.vy = Math.min(420, kn.vy + GRAVITY * dt);
        kn.x += kn.vx * dt;
        kn.y += kn.vy * dt;
        if (kn.y > floorY) {
          kn.y = floorY;
          kn.vy = 0;
        }
        kn.x = Math.max(s.cam - d.hb[0] + 4, Math.min(s.cam + W - d.hb[1] - 4, kn.x));

        // his weapons hurt you
        if (s.invuln <= 0) {
          const px1 = hx();
          const px2 = hx() + HB_W;
          const py1 = hy();
          const py2 = hy() + HB_H;
          let hitMe = false;
          if (kn.kind === "horned") {
            const m = maceBall(kn);
            if (m.x + 8 > px1 && m.x - 8 < px2 && m.y + 8 > py1 && m.y - 8 < py2) hitMe = true;
          } else if (kn.kind === "skeleton" && kn.act === "swing") {
            const r = skeletonSwordBox(kn);
            if (r.x2 > px1 && r.x1 < px2 && r.y2 > py1 && r.y1 < py2) hitMe = true;
          } else if (kn.kind === "warlord" && kn.act === "swing") {
            for (let k = 0.3; k <= 1.001; k += 0.08) {
              const p = knightSwordPoint(kn, k);
              if (p.x > px1 - 2 && p.x < px2 + 2 && p.y > py1 - 2 && p.y < py2 + 2) hitMe = true;
            }
          }
          if (hitMe) {
            hurt();
            return;
          }
        }

        // touching his body hurts, landing on his head hurts HIM (except the horned warrior)
        const bx = knightBox(kn);
        if (hx() + HB_W > bx.x1 && hx() < bx.x2 && hy() + HB_H > bx.y1 && hy() < bx.y2) {
          const onTop = cameDown(bx.y1, 16);
          if (onTop) {
            s.y = bx.y1 - HB_Y - HB_H - 1;
            if (kn.kind === "horned") {
              s.vy = STOMP_BOUNCE;
              popup(bc, bx.y1 - 10, "NOPE! SHOOT HIM");
              playBump();
            } else if (kn.inv > 0) {
              s.vy = STOMP_BOUNCE;
              playBump();
            } else {
              kn.hp -= 1;
              kn.hit = 0.4;
              kn.inv = kn.kind === "warlord" ? 1.2 : 0.7;
              s.vy = -300;
              s.airJumped = false;
              if (kn.kind === "warlord") {
                // he shakes you off: you get thrown away from him and can't steer for a moment
                s.vx = (pc < bc ? -1 : 1) * 260;
                s.vy = -340;
                s.knockT = 0.45;
              }
              burst(bc, bx.y1, 18, KNIGHT_DUST, 90);
              s.shake = 0.15;
              playStomp();
              if (kn.hp <= 0) {
                kn.dead = 1.8;
                kn.vx = 0;
                s.kwaves = [];
                s.kshots = [];
                popup(bc, bx.y1 - 10, kn.kind === "warlord" ? "THE WARLORD FALLS!" : "CRUMBLED!");
                playTrollDeath();
              } else {
                popup(bc, bx.y1 - 10, `${kn.hp} LEFT`);
                kn.act = "stagger";
                kn.timer = 0.5;
                kn.vx = (bc > pc ? 1 : -1) * 110;
                if (kn.kind === "warlord") {
                  kn.ang = SW_IDLE;
                  if (kn.hp === Math.ceil(kn.maxHp / 2)) {
                    s.flash = 2;
                    s.flashText = "THE WARLORD IS ANGRY NOW!";
                    if (!kn.p2) startWarlordPhase2(kn);
                  }
                }
              }
            }
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
      }
      // the arena's bonus blocks refill every few seconds
      s.bossRefill += dt;
      if (s.bossRefill > 10) {
        s.bossRefill = 0;
        for (let k = 0; k < 22; k++) {
          const c = colAt(s.bossCol + k);
          if (c.bonus >= 0 && c.used) {
            c.used = false;
            c.bump = 0.15;
          }
        }
      }
    }
    // ---------- LEVEL 4: TOMBFELL ----------
    if (s.woodsGlitch > 0) s.woodsGlitch -= dt;
    const tomb = s.tboss;
    if (tomb) {
      const tFloor = 8 * T;
      const pcx = hx() + HB_W / 2;
      if (tomb.hit > 0) tomb.hit -= dt;
      if (tomb.bump > 0) tomb.bump -= dt;
      if (tomb.busy > 0) tomb.busy -= dt;
      if (tomb.dead > 0) {
        // glitching away
        tomb.dead -= dt;
        if (Math.random() < 0.8) burst(tomb.x + rand(2, TOMB_W - 2), tomb.y + rand(2, TOMB_H), 2, GLITCH, 60);
        if (tomb.dead <= 0) {
          s.tboss = null;
          s.bossState = "none"; // the screen scrolls again
          if (s.levelMode) {
            s.flash = 2.5;
            s.flashText = "TOMBFELL IS DOWN! GO HIT THE BONG";
            if (s.power === "fire") s.fireTime = Math.min(s.fireTime, FIRE_TIME);
            s.ammo = Math.min(s.ammo, 5);
          } else {
            runBossBeaten("tombfell"); // the infinite run: points, the boss spin, on you go
          }
        }
      } else {
        tomb.facing = pcx < tomb.x + TOMB_W / 2 ? -1 : 1;
        if (tomb.part === 1) {
          // PART 1: he floats up high, drifting from side to side, and sends one wall of doves after another
          const tx = s.cam + W / 2 - TOMB_W / 2 + Math.sin(s.t * 0.6) * 95;
          const ty = 50 + Math.sin(s.t * 1.7) * 4; // just under his health bar
          tomb.x += (tx - tomb.x) * Math.min(1, dt * 2);
          tomb.y += (ty - tomb.y) * Math.min(1, dt * 3);
          tomb.cast -= dt;
          if (tomb.busy <= 0 && tomb.cast <= 0 && !tomb.doves.some((d) => d.state === "fly")) {
            sendDoveWall(tomb);
            tomb.cast = DOVE_WALL_GAP;
          }
        } else if (tomb.part === 2) {
          // PART 2: he stands on the ground behind his shield while cats drop out of the trees
          const tx = tomb.side > 0 ? s.cam + W - TOMB_W - 12 : s.cam + 12;
          tomb.x += (tx - tomb.x) * Math.min(1, dt * 5);
          tomb.y += (tFloor - TOMB_H - tomb.y) * Math.min(1, dt * 4);
          tomb.cast -= dt;
          const awake = tomb.cats.filter((c) => c.act !== "ball" && c.act !== "roll").length;
          if (tomb.busy <= 0 && tomb.cast <= 0 && awake < TOMB_CAT_MAX && tomb.cats.length < 4) {
            tomb.cast = TOMB_CAT_EVERY;
            // it lands away from you and away from him
            let cx = s.cam + W / 2;
            for (let tries = 0; tries < 12; tries++) {
              cx = s.cam + 30 + Math.random() * (W - 74);
              if (Math.abs(cx + 7 - pcx) > 70 && Math.abs(cx + 7 - (tomb.x + TOMB_W / 2)) > 56) break;
            }
            if (Math.abs(cx + 7 - pcx) <= 70) cx = pcx < s.cam + W / 2 ? s.cam + W - 100 : s.cam + 86;
            tomb.cats.push({ x: cx, y: -16, vx: 0, vy: 0, dir: pcx < cx ? -1 : 1, act: "drop", timer: 0, kick: 0, bounces: 0 });
            beep(900, 600, 0.12, 0.035, "triangle");
          }
        } else if (tomb.bear) {
          // PART 3: he rides the giant bear. It stamps (your warning), then charges across the
          // screen and crashes into the tree at the edge: he falls off, and now your shots hurt him.
          const br = tomb.bear;
          const edgeL = s.cam + 4;
          const edgeR = s.cam + W - GBEAR_W - 4;
          br.timer -= dt;
          if (br.act === "enter") {
            br.x += br.dir * 70 * dt;
            if (br.dir < 0 ? br.x <= edgeR : br.x >= edgeL) {
              br.x = br.dir < 0 ? edgeR : edgeL;
              br.act = "paw";
              br.timer = GBEAR_PAW;
              beep(150, 60, 0.4, 0.07, "sawtooth");
            }
          } else if (br.act === "paw") {
            if (br.timer <= 0) {
              br.act = "charge";
              beep(110, 50, 0.5, 0.07, "sawtooth");
            }
          } else if (br.act === "charge") {
            br.x += br.dir * (GBEAR_SPEED + (TOMB_PART_HP - tomb.hp) * GBEAR_SPEED_UP) * dt;
            if (Math.random() < 0.5) {
              s.particles.push({ x: br.x + (br.dir < 0 ? GBEAR_W - 6 : 6), y: tFloor - 3, vx: -br.dir * rand(10, 40), vy: rand(-40, -10), color: "#8a7f96", life: rand(0.2, 0.4) });
            }
            if (br.dir < 0 ? br.x <= edgeL : br.x >= edgeR) {
              // CRASH! Into the tree at the edge
              br.x = br.dir < 0 ? edgeL : edgeR;
              br.act = "dizzy";
              br.timer = GBEAR_DIZZY;
              tomb.fallen = true;
              tomb.x = br.dir < 0 ? br.x + GBEAR_W + 12 : br.x - TOMB_W - 12; // he tumbles off behind it
              s.shake = 0.35;
              burst(br.dir < 0 ? s.cam + 8 : s.cam + W - 8, 70, 26, ["#5f8f4a", "#3f6b3a", "#a8324a", "#5e5e68"], 110);
              beep(120, 40, 0.4, 0.08, "sawtooth");
              playBump();
              s.flash = 2;
              s.flashText = "HE FELL OFF! SHOOT HIM!";
              if (!hasFire() || s.ammo < 2) {
                // the crash shakes a spell leaf out of the tree when you're low on shots
                s.powerups.push({ x: s.cam + W / 2 - 7, y: 8, vx: 0, vy: 0, kind: s.bossSpell });
                playPowerAppear();
              }
            }
          } else if (br.timer <= 0) {
            // nobody shot him in time: he climbs back on and the bear turns round
            tomb.fallen = false;
            br.dir = -br.dir;
            br.act = "paw";
            br.timer = GBEAR_PAW;
            beep(150, 60, 0.4, 0.07, "sawtooth");
          }
          if (tomb.fallen) tomb.y = Math.min(tFloor - TOMB_H, tomb.y + 220 * dt);
          else {
            tomb.x = br.x + (GBEAR_W - TOMB_W) / 2;
            tomb.y = tFloor - GBEAR_H - TOMB_H + 16;
          }
          // the bear hurts while it walks in and while it runs. Stamping is only the warning, so you're
          // never caught standing next to it the moment it wakes up (and never while it's dizzy)
          if ((br.act === "charge" || br.act === "enter") && s.invuln <= 0 && hx() + HB_W > br.x + 8 && hx() < br.x + GBEAR_W - 8 && hy() + HB_H > tFloor - GBEAR_H + 8) {
            hurt();
            return;
          }
        }

        // his doves
        for (const d of tomb.doves) {
          if (d.wait > 0) {
            d.wait -= dt; // still blinking its "!" at the edge
            continue;
          }
          if (d.state === "home") {
            // the pink dove you jumped on flies straight back into him
            const ax = tomb.x + TOMB_W / 2 - (d.x + 8);
            const ay = tomb.y + 20 - (d.y + 5);
            const dist = Math.hypot(ax, ay) || 1;
            d.vx = (ax / dist) * 300;
            d.vy = (ay / dist) * 300;
            if (dist < 16) {
              d.state = "gone";
              hitTombfell(["#ff7ad9", "#ff2bd6", "#ffffff"]);
              break;
            }
          }
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          if (d.state !== "fly") continue;
          if (hx() + HB_W > d.x + 2 && hx() < d.x + 16 && hy() + HB_H > d.y + 1 && hy() < d.y + 10) {
            if (cameDown(d.y, 10)) {
              // you jumped on it
              s.vy = STOMP_BOUNCE;
              s.airJumped = false;
              if (d.pink) {
                d.state = "home";
                popup(d.x + 8, d.y - 8, "GO GET HIM!");
                beep(700, 1500, 0.15, 0.05, "triangle");
              } else {
                d.state = "gone";
                s.bonus += PTS_FLYER;
                popup(d.x + 8, d.y - 8, `+${PTS_FLYER}`);
                burst(d.x + 8, d.y + 5, 10, ["#ffffff", "#c9d2e6"], 60);
                playStomp();
              }
            } else if (s.invuln <= 0) {
              hurt();
              return;
            }
          }
        }
        tomb.doves = tomb.doves.filter((d) => d.state !== "gone" && (d.wait > 0 || (d.x > s.cam - 40 && d.x < s.cam + W + 40 && d.y > -40)));

        // his cats
        for (const c of tomb.cats) {
          c.timer -= dt;
          if (c.kick > 0) c.kick -= dt;
          c.vy = Math.min(420, c.vy + GRAVITY * dt);
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          let onFloor = false;
          if (c.y >= tFloor - 14) {
            c.y = tFloor - 14;
            c.vy = 0;
            onFloor = true;
          }
          const touching = hx() + HB_W > c.x + 2 && hx() < c.x + 12 && hy() + HB_H > c.y + 2 && hy() < c.y + 12;
          const onTop = cameDown(c.y, 10);
          if (c.act === "ball") {
            // curled up: walk into it (or jump on it) to kick it. It never hurts you.
            if (c.timer <= 0) {
              c.act = "gone";
              burst(c.x + 7, c.y + 7, 8, ["#1a1622", "#9a8fb8", "#ffffff"], 45);
            } else if (touching && c.kick <= 0) {
              const dir = onTop ? (s.facing >= 0 ? 1 : -1) : pcx < c.x + 7 ? 1 : -1;
              c.act = "roll";
              c.vx = dir * CAT_BALL_SPEED;
              c.bounces = 0;
              if (onTop) s.vy = STOMP_BOUNCE;
              beep(300, 700, 0.1, 0.05, "square");
            }
            continue;
          }
          if (c.act === "roll") {
            // kicked: bounces off the edges of the screen (twice), knocks over every cat in its way...
            if ((c.x < s.cam + 2 && c.vx < 0) || (c.x > s.cam + W - 16 && c.vx > 0)) {
              if (tomb.short) {
                // The quick fight in the infinite run: a ball that misses him is just gone. (It used to bounce back off the wall
                // and hit him anyway, so aiming never mattered.)
                c.act = "gone";
                burst(c.x + 7, c.y + 7, 8, ["#1a1622", "#9a8fb8", "#ffffff"], 45);
                playBump();
                continue;
              }
              c.bounces += 1;
              c.vx = -c.vx;
              playBump();
              if (c.bounces > 2) {
                c.act = "gone";
                burst(c.x + 7, c.y + 7, 8, ["#1a1622", "#9a8fb8", "#ffffff"], 45);
                continue;
              }
            }
            for (const o of tomb.cats) {
              if (o === c || o.act === "ball" || o.act === "roll" || o.act === "gone") continue;
              if (c.x + 14 > o.x && c.x < o.x + 14 && c.y + 14 > o.y && c.y < o.y + 14) {
                o.act = "gone";
                s.bonus += PTS_WALKER;
                popup(o.x + 7, o.y - 6, `+${PTS_WALKER}`);
                burst(o.x + 7, o.y + 7, 10, ["#1a1622", "#9a8fb8", "#ffffff"], 55);
                playStomp();
              }
            }
            // ...and smashes straight through his shield
            if (tomb.part === 2 && c.x + 14 > tomb.x + 4 && c.x < tomb.x + TOMB_W - 4) {
              c.act = "gone";
              hitTombfell(["#1a1622", "#ffe14a", "#ffffff"]);
              break;
            }
            continue;
          }
          // an awake cat: drops out of the tree, comes for you, crouches (red eyes), pounces
          if (c.act === "drop") {
            if (onFloor) {
              c.act = "walk";
              c.timer = 0.5;
            }
          } else if (c.act === "walk") {
            c.dir = pcx < c.x + 7 ? -1 : 1;
            c.vx = c.dir * (CAT_SPEED + 14);
            if (c.timer <= 0 && Math.abs(pcx - (c.x + 7)) < CAT_SEE + 10) {
              c.act = "crouch";
              c.timer = CAT_CROUCH;
              c.vx = 0;
            }
          } else if (c.act === "crouch") {
            c.vx = 0;
            if (c.timer <= 0) {
              c.act = "leap";
              c.vy = CAT_LEAP_UP;
              c.vx = c.dir * CAT_LEAP_SPEED;
              beep(700, 1100, 0.08, 0.03, "triangle");
            }
          } else if (c.act === "leap" && onFloor) {
            c.act = "walk";
            c.timer = CAT_REST;
          }
          c.x = Math.max(s.cam + 2, Math.min(s.cam + W - 16, c.x));
          if (touching) {
            if (onTop) {
              // you jumped on it: it curls into a ball
              s.vy = STOMP_BOUNCE;
              s.airJumped = false;
              c.act = "ball";
              c.timer = CAT_BALL_LIFE;
              c.kick = 0.3;
              c.vx = 0;
              popup(c.x + 7, c.y - 8, "KICK IT AT HIM!");
              playStomp();
            } else if (s.invuln <= 0) {
              hurt();
              return;
            }
          }
        }
        tomb.cats = tomb.cats.filter((c) => c.act !== "gone");

        // his spell shield: it never hurts you, it just throws you off (and it eats your shots).
        // While he floats (part 1) you pass straight through him, so he can't knock you into his doves.
        const onHim = hx() + HB_W > tomb.x + 5 && hx() < tomb.x + TOMB_W - 5 && hy() + HB_H > tomb.y + 6;
        if (tomb.fallen) {
          // off the bear and dizzy: jumping on him still does nothing
          if (onHim && s.vy > 0 && hy() + HB_H - (tomb.y + 6) < 14) {
            s.vy = STOMP_BOUNCE;
            if (tomb.bump <= 0) {
              tomb.bump = 0.5;
              popup(tomb.x + TOMB_W / 2, tomb.y - 8, "SHOOT HIM!");
              playBump();
            }
          }
        } else if (tomb.part !== 1 && onHim && hy() < (tomb.part === 3 ? tFloor - GBEAR_H + 8 : tomb.y + TOMB_H)) {
          if (tomb.part === 3 || (s.vy > 0 && hy() + HB_H - (tomb.y + 6) < 14)) {
            s.vy = -280; // off the top of it (on the bear it always lifts you over)
          } else {
            s.vx = (pcx < tomb.x + TOMB_W / 2 ? -1 : 1) * 190;
            s.vy = Math.min(s.vy, -170);
            s.knockT = 0.22;
          }
          if (tomb.bump <= 0) {
            tomb.bump = 0.5;
            popup(tomb.x + TOMB_W / 2, tomb.y - 8, "SHIELD!");
            playBump();
          }
        }
      }
    }
    if (updateBlizzard(dt)) return; // (an ice spike hit you)
    // Shockwave statues (Level 3, in the throne room before the Warlord): when you're near they wake up, a red "!" shows, then they slam the
    // floor and send a shockwave both ways. It's the lesson for his own slams: jump the wave.
    for (const st of s.statues) {
      if (st.x < s.cam - 40 || st.x > s.cam + W + 40) continue;
      st.timer -= dt;
      if (st.act === "idle" && st.timer <= 0) {
        st.act = "wind";
        st.timer = 0.7;
        beep(300, 150, 0.15, 0.05, "sawtooth");
      } else if (st.act === "wind" && st.timer <= 0) {
        st.act = "slam";
        st.timer = 0.5;
        s.kwaves.push({ x: st.x + 14, dir: -1, life: 1.1 }, { x: st.x + 14, dir: 1, life: 1.1 });
        s.shake = 0.2;
        burst(st.x + 14, 8 * T - 2, 12, KNIGHT_DUST, 70);
        playBump();
      } else if (st.act === "slam" && st.timer <= 0) {
        st.act = "idle";
        st.timer = 2.4;
      }
    }
    for (const c of s.cover) c.rise = Math.min(1, c.rise + dt * 2.5); // (the Warlord's pillars rise out of the floor)
    // WARLORD's shockwaves running along the floor: jump over them
    for (const w of s.kwaves) {
      w.x += w.dir * 150 * dt;
      w.life -= dt;
      if (w.life > 0 && s.invuln <= 0) {
        const pcx = s.x + HB_X + HB_W / 2;
        if (Math.abs(pcx - w.x) < 8 && hy() + HB_H > 8 * T - 10) {
          w.life = 0;
          hurt();
          return;
        }
      }
    }
    s.kwaves = s.kwaves.filter((w) => w.life > 0 && w.x > s.cam - 20 && w.x < s.cam + W + 20);
    // WARLORD's sound waves from his eyes: dodge them
    for (const w of s.kshots) {
      w.x += w.vx * dt;
      w.y += w.vy * dt;
      w.life -= dt;
      // a pillar in the way stops the wave (stand right behind one)
      for (const c of s.cover) {
        if (c.rise >= 0.9 && w.x + 4 > c.x && w.x - 4 < c.x + 18 && w.y > 8 * T - 56) {
          w.life = 0;
          burst(w.x, w.y, 6, KNIGHT_DUST, 50);
          playBump();
          break;
        }
      }
      if (w.life > 0 && s.invuln <= 0 && w.x + 4 > hx() && w.x - 4 < hx() + HB_W && w.y + 4 > hy() && w.y - 4 < hy() + HB_H) {
        w.life = 0;
        hurt();
        return;
      }
    }
    s.kshots = s.kshots.filter((w) => w.life > 0 && w.x > s.cam - 20 && w.x < s.cam + W + 20 && w.y > -80 && w.y < H + 20);

    // The bong: touch it to finish the level
    const bg = s.bong;
    if (s.levelMode && bg && s.lbossState !== "fight") {
      if (hx() + HB_W > bg.x + 2 && hx() < bg.x + BONG_W - 2 && hy() + HB_H > bg.y + 4 && hy() < bg.y + BONG_H) {
        finishLevel();
        return;
      }
    }

    // The troll (or, every other fight, the bigger giant): walks at you, sometimes jumps at
    // you. Shots hurt him; the giant additionally needs a finishing stomp once he's down.
    const b = s.boss;
    if (s.bossState === "fight" && b) {
      const isGiant = b.kind === "giant";
      const bw = isGiant ? GIANT_W : TR_W;
      const bh = isGiant ? GIANT_H : TR_H;
      const bhx = isGiant ? GIANT_HX : TR_HX;
      const bhy = isGiant ? GIANT_HY : TR_HY;
      const bhw = isGiant ? GIANT_HW : TR_HW;
      const bhh = isGiant ? GIANT_HH : TR_HH;
      if (b.dead > 0) {
        b.dead -= dt;
        b.y += 30 * dt;
        if (Math.random() < 0.5) burst(b.x + rand(6, bw - 6), b.y + rand(10, bh), 2, isGiant ? ["#c68bff", "#8a4fc0", "#ffffff"] : [LIGHT_GREEN, GREEN, "#ffffff"], 40);
        if (b.dead <= 0) {
          const kind = b.kind;
          s.boss = null;
          s.bossState = "none";
          runBossBeaten(kind);
        }
      } else if (b.dazed > 0) {
        // Down but not out: he just lies there while you line up the finishing stomp
        b.dazed -= dt;
        b.vy = Math.min(420, b.vy + GRAVITY * dt);
        b.y += b.vy * dt;
        if (b.y > 8 * T - bh) {
          b.y = 8 * T - bh;
          b.vy = 0;
        }
        const bx1 = b.x + bhx;
        const by1 = b.y + bhy;
        if (hx() + HB_W > bx1 && hx() < bx1 + bhw && hy() + HB_H > by1 && hy() < by1 + bhh) {
          // (Any landing on him while you're falling counts, not just one dead-straight down on his head:
          // he's a tall box lying there, and a jump from the side puts your feet deeper than 14px at first touch.)
          if (s.vy > 0 && hy() + HB_H - by1 < bhh * 0.7) {
            // The finishing move!
            s.vy = STOMP_BOUNCE;
            b.dazed = 0;
            b.dead = 1.6;
            popup(b.x + bw / 2, b.y - 6, "GIANT DOWN!");
            playTrollDeath();
          }
          // Otherwise touching him while he's down is harmless — no hurt() here
        }
        if (b.dazed <= 0 && b.dead <= 0) {
          // Ran out of time without being stomped: he gets back up
          b.hp = GIANT_DAZE_HP;
          popup(b.x + bw / 2, b.y - 10, "GETTING BACK UP!");
        }
      } else {
        if (b.hit > 0) b.hit -= dt;
        const speedMul = isGiant ? GIANT_SPEED_MULT : 1;
        const pc = s.x + HB_X + HB_W / 2;
        const tc = b.x + bhx + bhw / 2;
        const dir = pc < tc ? -1 : 1;
        const onGround = b.y >= 8 * T - bh - 0.5;
        if (onGround && b.hit <= 0.2) {
          b.facing = dir;
          b.vx = dir * TROLL_SPEED * bossSpeed() * speedMul;
          b.jumpTimer -= dt;
          if (b.jumpTimer <= 0 && Math.abs(pc - tc) < 120) {
            b.vy = TROLL_JUMP;
            b.vx = dir * 75 * bossSpeed() * speedMul;
            b.jumpTimer = rand(1.8, 3.2) / bossSpeed();
            playBump();
          }
        }
        b.vy = Math.min(420, b.vy + GRAVITY * dt);
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.y > 8 * T - bh) {
          if (b.vy > 200) s.shake = 0.12; // heavy landing
          b.y = 8 * T - bh;
          b.vy = 0;
        }
        b.x = Math.max(s.cam - bhx, Math.min(s.cam + W - bw + bhx, b.x));
        // Touching him hurts, unless you land on top of him (he's too big to squash, you just bounce off)
        const bx1 = b.x + bhx;
        const by1 = b.y + bhy;
        if (hx() + HB_W > bx1 && hx() < bx1 + bhw && hy() + HB_H > by1 && hy() < by1 + bhh) {
          if (cameDown(by1, 12)) {
            s.vy = STOMP_BOUNCE;
            popup(b.x + bw / 2, b.y - 6, "NOPE!");
            playBump();
          } else if (s.invuln <= 0) {
            hurt();
            return;
          }
        }
      }
      // The two stash boxes in the arena refill every few seconds
      s.bossRefill += dt;
      if (s.bossRefill > BOSS_BOX_REFILL) {
        s.bossRefill = 0;
        for (let k = 0; k < BOSS_ARENA; k++) {
          const c = colAt(s.bossCol + k);
          if (c.bonus >= 0 && c.used) {
            c.used = false;
            c.bump = 0.15;
          }
        }
      }
    }

    updatePet(dt); // BOBO (does nothing until you've won him)

    // MAGNET (a spin prize): leaves and coins close to you fly to you
    const magnetRange = MAGNET_RANGE[Math.min(s.perks.magnet, MAGNET_RANGE.length - 1)];
    if (magnetRange > 0) {
      const mx = hx() + HB_W / 2;
      const my = hy() + HB_H / 2;
      for (const l of s.leaves) {
        if (l.taken) continue;
        const half = l.small ? 4 : 7;
        const dx = mx - (l.x + half);
        const dy = my - (l.y + half);
        const dist = Math.hypot(dx, dy);
        if (dist > magnetRange || dist < 1) continue;
        // a coin is a coin because of the spot it sits on, so remember what it is before it moves
        if (l.coin === undefined) l.coin = isCoin(l);
        const step = Math.min(dist, MAGNET_PULL * dt);
        l.x += (dx / dist) * step;
        l.y += (dy / dist) * step;
      }
    }

    // Weed leaves: points. Gold coins: money for outfits.
    for (const l of s.leaves) {
      if (l.taken) continue;
      const size = l.small ? 8 : 14;
      if (hx() + HB_W > l.x && hx() < l.x + size && hy() + HB_H > l.y && hy() < l.y + size) {
        collectLeaf(l);
      }
    }
    s.leaves = s.leaves.filter((l) => !l.taken && (s.inBonus || l.x > s.cam - 40)); // the Void keeps everything, you can walk back

    // Hearts: an extra life (max 4)
    for (const h of s.hearts) {
      if (h.taken) continue;
      if (hx() + HB_W > h.x && hx() < h.x + 14 && hy() + HB_H > h.y && hy() < h.y + 12) {
        h.taken = true;
        if (s.lives < maxLives()) {
          s.lives += 1;
          popup(h.x + 7, h.y - 4, "+1 LIFE");
        } else {
          s.bonus += 200;
          popup(h.x + 7, h.y - 4, "+200");
        }
        burst(h.x + 7, h.y + 6, 16, [PINK, "#ffffff", DARK_PINK], 60);
        playHeart();
      }
    }
    s.hearts = s.hearts.filter((h) => !h.taken && (s.inBonus || h.x > s.cam - 40));
  };

  // ---------- Drawing ----------

  const drawSfxIcon = (ctx: CanvasRenderingContext2D, color: string) => {
    const x = 6;
    const y = 5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + 2, 2, 3);
    ctx.fillRect(x + 2, y + 1, 1, 5);
    ctx.fillRect(x + 3, y, 1, 7);
    if (sfxOnRef.current) {
      ctx.fillRect(x + 5, y + 2, 1, 3);
      ctx.fillRect(x + 7, y + 1, 1, 5);
    } else {
      ctx.fillStyle = PINK;
      for (let i = 0; i < 5; i++) {
        ctx.fillRect(x + 5 + i, y + 1 + i, 1, 1);
        ctx.fillRect(x + 9 - i, y + 1 + i, 1, 1);
      }
    }
  };

  // The sound effects slider: a thin bar going down from the speaker icon (top = loud, bottom = quiet)
  const SFX_SLIDER = { x: 9, top: 18, bottom: 58 };
  const drawSfxSlider = (ctx: CanvasRenderingContext2D, color: string) => {
    const { x, top, bottom } = SFX_SLIDER;
    const vol = sfxOnRef.current ? sfxVolRef.current : 0;
    const knobY = Math.round(bottom - vol * (bottom - top));
    ctx.globalAlpha = sfxDragRef.current ? 1 : 0.75;
    ctx.fillStyle = INK;
    ctx.fillRect(x - 1, top - 1, 5, bottom - top + 2);
    ctx.fillStyle = "#6e6478";
    ctx.fillRect(x, top, 3, bottom - top);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, knobY, 3, bottom - knobY);
    // knob
    ctx.fillStyle = INK;
    ctx.fillRect(x - 3, knobY - 2, 9, 5);
    ctx.fillStyle = color === INK ? "#ffffff" : color;
    ctx.fillRect(x - 2, knobY - 1, 7, 3);
    ctx.globalAlpha = 1;
  };
  // Is this canvas point on the slider? (a bit wider than it looks, easier to grab)
  const onSfxSlider = (cx: number, cy: number) => cx < 22 && cy >= SFX_SLIDER.top - 5 && cy <= SFX_SLIDER.bottom + 5;
  const sfxFromY = (cy: number) => setSfxVolume((SFX_SLIDER.bottom - cy) / (SFX_SLIDER.bottom - SFX_SLIDER.top));

  const textBox = (ctx: CanvasRenderingContext2D, text: string, y: number) => {
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
    ctx.fillStyle = INK;
    ctx.fillText(text, W / 2, y);
  };

  // Same as textBox, but it flashes pink and white really fast so you can't miss it
  // (used for power-up hints like PRESS S TO SHOOT)
  const flashBox = (ctx: CanvasRenderingContext2D, text: string, y: number, t: number) => {
    const w = ctx.measureText(text).width + 12;
    const x = Math.round(W / 2 - w / 2);
    const pinkTurn = Math.floor(t * 8) % 2 === 0; // swaps 8 times a second
    ctx.fillStyle = INK; // dark outline
    ctx.fillRect(x - 1, y - 4, Math.round(w) + 2, 16);
    ctx.fillStyle = pinkTurn ? PINK : "#ffffff";
    ctx.fillRect(x, y - 3, Math.round(w), 14);
    ctx.fillStyle = pinkTurn ? "#ffffff" : PINK;
    ctx.fillText(text, W / 2, y);
  };

  const drawBoard = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const status = boardStatusRef.current;
    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.fillStyle = INK;
    ctx.textAlign = "center";

    if (status !== "ok") {
      ctx.fillText(s.levelMode ? `LVL ${s.level} DONE!` : "GAME OVER", W / 2, 40);
      ctx.fillText(s.levelMode ? `YOUR TIME ${fmtTime(s.levelMs)}` : `YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 58);
      ctx.fillText(status === "loading" ? "LOADING SCORES..." : "SCOREBOARD OFFLINE", W / 2, 80);
    } else {
      ctx.fillText(s.levelMode ? `LVL ${s.level} BEST TIMES` : "TOP 10", W / 2, 8);
      const b = boardRef.current;
      if (b.length === 0) ctx.fillText("NO SCORES YET", W / 2, 60);
      const MEDALS = ["#ffd700", "#c8ccd6", "#cd7f32"]; // gold, silver, bronze
      b.slice(0, 10).forEach((e, i) => {
        const y = 22 + i * 11;
        // every row wiggles a little, like an old screen
        const wob = Math.round(Math.sin(s.t * 2.2 + i * 0.8) * 1.5);
        ctx.save();
        ctx.translate(wob, 0);
        if (i < 3) {
          ctx.fillStyle = MEDALS[i];
          ctx.fillRect(24, y - 2, W - 48, 11);
          // a shine sweeping across the gold one
          if (i === 0) {
            const sx = 24 + ((s.t * 90) % (W + 40)) - 20;
            ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
            ctx.fillRect(Math.round(sx), y - 2, 6, 11);
            ctx.fillRect(Math.round(sx) + 8, y - 2, 2, 11);
          }
        }
        if (e.name === myNameRef.current) {
          // your own row: pink frame
          ctx.fillStyle = PINK;
          ctx.fillRect(22, y - 3, W - 44, 1);
          ctx.fillRect(22, y + 9, W - 44, 1);
          ctx.fillRect(22, y - 3, 1, 13);
          ctx.fillRect(W - 23, y - 3, 1, 13);
        }
        ctx.fillStyle = INK;
        ctx.textAlign = "left";
        ctx.fillText(`${String(i + 1).padStart(2, " ")} ${e.name}`, 28, y);
        ctx.textAlign = "right";
        ctx.fillText(s.levelMode ? fmtTime(LEVEL_TIME_BASE - e.score) : pad(e.score), W - 28, y);
        ctx.restore();
      });
      ctx.textAlign = "center";
      ctx.fillText(s.levelMode ? `YOUR TIME ${fmtTime(s.levelMs)}` : `YOU SMOKED ${Math.floor(s.score)} GRAMS`, W / 2, 134);
    }

    if (Math.floor(s.t * 2) % 2 === 0) ctx.fillText(s.levelMode ? "OK TO GO ON" : "OK TO PLAY AGAIN", W / 2, 148);

    // Old screen effect: scanlines, a slow rolling bright band, a little flicker, dark corners
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
    const band = (s.t * 30) % (H + 30) - 30;
    ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
    ctx.fillRect(0, Math.round(band), W, 14);
    ctx.fillStyle = `rgba(0, 0, 0, ${0.03 + Math.abs(Math.sin(s.t * 13)) * 0.03})`;
    ctx.fillRect(0, 0, W, H);
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  };

  // One twisted tree, drawn as outlines. Its branches sway a little in the wind.
  const drawTree = (ctx: CanvasRenderingContext2D, x: number, baseY: number, height: number, seed: number, sway: number) => {
    const t = state.current.t;
    const branch = (x1: number, y1: number, len: number, angle: number, depth: number, id: number) => {
      const a = angle + Math.sin(t * 0.9 + seed * 3 + id) * 0.05 * (5 - depth) * sway;
      const x2 = x1 + Math.cos(a) * len;
      const y2 = y1 + Math.sin(a) * len;
      // bend each branch sideways so it looks crooked
      const bend = (hash(seed * 13 + id) - 0.5) * len * 0.8;
      ctx.lineWidth = depth >= 3 ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2 + bend, (y1 + y2) / 2, x2, y2);
      ctx.stroke();
      if (depth <= 0) return;
      const spread = 0.45 + hash(seed + id * 7) * 0.5;
      branch(x2, y2, len * 0.72, a - spread, depth - 1, id * 2 + 1);
      branch(x2, y2, len * 0.66, a + spread * 0.85, depth - 1, id * 2 + 2);
    };
    branch(x, baseY, height, -Math.PI / 2 + (hash(seed) - 0.5) * 0.3, 4, 0);
  };

  // A sign in the secret area at the start. colX is which tile column (negative = left of start)
  // its left edge sits at. header is optional; without one the sign just shows the names.
  const drawSecretSign = (
    ctx: CanvasRenderingContext2D,
    cam: number,
    colX: number,
    names: string[],
    header?: string
  ) => {
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    const padX = 16;
    const lineH = 9;
    const measureList = header ? [header, ...names] : names;
    let maxW = 0;
    measureList.forEach((n) => {
      const mw = ctx.measureText(n).width;
      if (mw > maxW) maxW = mw;
    });
    const w = Math.max(124, Math.ceil(maxW) + padX * 2);
    const namesTop = header ? 18 : 8;
    const h = namesTop + names.length * lineH + 8;
    const x = Math.round(colX * T - cam);
    const y = 22;
    ctx.fillStyle = INK;
    ctx.fillRect(x + 14, y + h, 4, 8 * T - y - h);
    ctx.fillRect(x + w - 18, y + h, 4, 8 * T - y - h);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
    if (header) {
      ctx.fillStyle = "#ffc800";
      ctx.fillText(header, x + w / 2, y + 6);
    }
    ctx.fillStyle = "#ffffff";
    names.forEach((n, i) => ctx.fillText(n, x + w / 2, y + namesTop + i * lineH));
  };

  // Background for each zone (moves slower than the level, so it feels far away)
  // A big weed leaf (7 fingers), used for the Weedland background
  const drawBigLeaf = (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, angle: number, color: string) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    const fingers: [number, number][] = [[-1.35, 0.45], [-0.9, 0.7], [-0.45, 0.9], [0, 1], [0.45, 0.9], [0.9, 0.7], [1.35, 0.45]];
    for (const [a, l] of fingers) {
      const len = l * size;
      ctx.save();
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, size * 0.09, len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillRect(-1, 0, 2, size * 0.45);
    ctx.restore();
  };

  // WEEDLAND (Level 1): a green fantasy sky with giant swaying leaves and glowing spores
  const drawWeedland = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const cam = s.cam;
    const g = ctx.createLinearGradient(0, -200, 0, H);
    g.addColorStop(0, WL_SKY_TOP);
    g.addColorStop(1, WL_SKY_BOTTOM);
    ctx.fillStyle = g;
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    const wb = weedBgRef.current;
    const custom = !!wb && wb.complete && wb.naturalWidth > 0;
    if (custom && wb) {
      // your picture, scrolling slowly and wrapping (transparent parts show the green sky behind it)
      const bw = H * (wb.naturalWidth / wb.naturalHeight);
      const off = -((cam * WEEDLAND_BG_PARALLAX) % bw);
      for (let x = Math.round(off); x < W; x += Math.round(bw)) ctx.drawImage(wb, x, 0, Math.round(bw) + 1, H);
    } else {
    // soft sun
    ctx.fillStyle = "rgba(255, 250, 190, 0.8)";
    ctx.beginPath();
    ctx.arc(W - 50, 26, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 250, 190, 0.3)";
    ctx.beginPath();
    ctx.arc(W - 50, 26, 22, 0, Math.PI * 2);
    ctx.fill();
    // far hills
    ctx.fillStyle = "#5fb85a";
    for (let x = -4; x < W + 4; x += 4) {
      const hgt = 26 + Math.sin((x + cam * 0.1) * 0.02) * 10 + Math.sin((x + cam * 0.1) * 0.05) * 5;
      ctx.fillRect(x, H - 44 - hgt, 4, hgt + 60);
    }
    // giant leaves swaying (far = pale, near = darker)
    for (const [par, gap, size, color] of [
      [0.2, 90, 34, "rgba(80, 170, 70, 0.45)"],
      [0.4, 130, 48, "rgba(40, 130, 50, 0.55)"],
    ] as [number, number, number, string][]) {
      const base = Math.floor((cam * par) / gap);
      for (let i = -1; i < W / gap + 2; i++) {
        const idx = base + i;
        const x = idx * gap - cam * par + hash(idx + 17) * 30;
        const sway = Math.sin(s.t * 0.9 + idx) * 0.12;
        drawBigLeaf(ctx, x, H - 40 - hash(idx + 3) * 20, size, sway, color);
      }
    }
    }
    // glowing spores floating up
    for (let k = 0; k < 22; k++) {
      const x = ((((hash(k) * 600 - cam * 0.5 + Math.sin(s.t + k) * 6) % (W + 20)) + W + 20) % (W + 20)) - 10;
      const y = H - ((s.t * (8 + hash(k + 5) * 10) + hash(k + 9) * H) % (H + 20));
      ctx.fillStyle = k % 3 === 0 ? "#fff7a8" : "#eaffc0";
      ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
  };

  // A pixel pine tree with snow on its branches
  const drawPine = (ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, dark: string) => {
    ctx.fillStyle = "#4a3222";
    ctx.fillRect(Math.round(x) - 1, baseY - 4, 3, 4);
    for (let k = 0; k < 3; k++) {
      const w = h * (0.55 - k * 0.13);
      const top = baseY - 4 - h * (0.35 + k * 0.28);
      const bot = baseY - 4 - h * (k * 0.22);
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x - w / 2, bot);
      ctx.lineTo(x + w / 2, bot);
      ctx.fill();
      ctx.fillStyle = "#f4f9fc";
      ctx.fillRect(Math.round(x - w / 2), Math.round(bot) - 2, Math.round(w), 2);
    }
    ctx.fillStyle = "#f4f9fc";
    ctx.fillRect(Math.round(x) - 1, Math.round(baseY - 4 - h * 0.91), 3, 2);
  };

  // SNOWY MOUNTAINS (Level 2): blue sky, snowy peaks, pine forest, a little town, snow falling
  const drawSnowland = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const cam = s.cam;
    const g = ctx.createLinearGradient(0, -200, 0, H);
    g.addColorStop(0, "#5fb4d6");
    g.addColorStop(1, "#cfeaf5");
    ctx.fillStyle = g;
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    // clouds
    ctx.fillStyle = "#eef6fa";
    for (let k = 0; k < 5; k++) {
      const cx = ((((hash(k) * 500 - cam * 0.05 - s.t * 3) % (W + 80)) + W + 80) % (W + 80)) - 40;
      const cy = 14 + hash(k + 7) * 30;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.arc(cx + 10, cy - 4, 10, 0, Math.PI * 2);
      ctx.arc(cx + 22, cy, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    // far mountains with snow caps
    const base = Math.floor((cam * 0.1) / 90);
    for (let i = -1; i < W / 90 + 2; i++) {
      const idx = base + i;
      const mx = idx * 90 - cam * 0.1 + hash(idx) * 30;
      const mh = 50 + hash(idx + 4) * 30;
      const my = 112;
      ctx.fillStyle = idx % 2 ? "#2f5d4a" : "#3a6b56";
      ctx.beginPath();
      ctx.moveTo(mx - 60, my);
      ctx.lineTo(mx, my - mh);
      ctx.lineTo(mx + 60, my);
      ctx.fill();
      ctx.fillStyle = "#f4f9fc";
      ctx.beginPath();
      ctx.moveTo(mx - 16, my - mh + 16);
      ctx.lineTo(mx, my - mh);
      ctx.lineTo(mx + 16, my - mh + 16);
      ctx.lineTo(mx + 6, my - mh + 12);
      ctx.lineTo(mx, my - mh + 17);
      ctx.lineTo(mx - 7, my - mh + 12);
      ctx.fill();
    }
    // a little town far away, with lit windows
    const tb = Math.floor((cam * 0.2) / 160);
    for (let i = -1; i < W / 160 + 2; i++) {
      const idx = tb + i;
      const tx = idx * 160 - cam * 0.2 + 40;
      for (let h = 0; h < 4; h++) {
        const hx2 = Math.round(tx + h * 13);
        const hy2 = 104 - (h % 2) * 3;
        ctx.fillStyle = ["#b0584a", "#6d8ab0", "#c9a14a", "#7c5aa0"][(idx + h) & 3];
        ctx.fillRect(hx2, hy2, 10, 8);
        ctx.fillStyle = "#f4f9fc";
        ctx.beginPath();
        ctx.moveTo(hx2 - 1, hy2);
        ctx.lineTo(hx2 + 5, hy2 - 5);
        ctx.lineTo(hx2 + 11, hy2);
        ctx.fill();
        ctx.fillStyle = "#ffe27a";
        ctx.fillRect(hx2 + 3, hy2 + 3, 2, 2);
      }
    }
    // pine forest
    const pb = Math.floor((cam * 0.35) / 34);
    for (let i = -1; i < W / 34 + 2; i++) {
      const idx = pb + i;
      const px = idx * 34 - cam * 0.35 + hash(idx + 11) * 14;
      drawPine(ctx, px, 128, 30 + hash(idx + 2) * 18, idx % 3 ? "#1f6b3a" : "#175a30");
    }
    // snow falling
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 40; k++) {
      const fx = ((((hash(k) * 700 - cam * 0.6 + Math.sin(s.t + k) * 8) % (W + 10)) + W + 10) % (W + 10)) - 5;
      const fy = ((s.t * (14 + hash(k + 3) * 16) + hash(k + 8) * (H + 10)) % (H + 10)) - 5;
      ctx.fillRect(Math.round(fx), Math.round(fy), k % 4 ? 1 : 2, k % 4 ? 1 : 2);
    }
  };

  // LEVEL 3 backdrop: your cathedral, with the vines, grey squiggles, red title and its echoes wiggling.
  // It scrolls at half speed and lines up exactly when the WARLORD arena locks.
  const drawKeep = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    ctx.fillStyle = "#1c0a18";
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    const im = keepImgsRef.current;
    const ok = (k: string) => !!im[k] && im[k].complete && im[k].naturalWidth > 0;
    const t = s.t * Math.PI;
    // draws a picture one row at a time, each row nudged sideways by a wave = the wiggle
    const wig = (k: string, dx: number, w: number, y0: number, y1: number, amp: number, freq: number, speed: number, ph: number) => {
      if (!ok(k)) return;
      for (let y = y0; y <= y1; y++) {
        const shift = Math.round(amp * Math.sin(y * freq + t * speed + ph));
        ctx.drawImage(im[k], 0, y, w, 1, Math.round(dx) + shift, y, w, 1);
      }
    };
    const rel = (s.cam - s.kfinalCol * T) * 0.5;
    const off = -(((rel % KEEP_TILE) + KEEP_TILE) % KEEP_TILE);
    for (let i = 0; i < 2; i++) {
      const dx = Math.round(off + i * KEEP_TILE);
      if (ok("back")) ctx.drawImage(im.back, 0, 0, KEEP_TILE, 128, dx, 0, KEEP_TILE, 128);
      wig("vines", dx, KEEP_TILE, 28, 122, 1.4, 0.18, 1.0, 0);
      wig("grey", dx, KEEP_TILE, 6, 88, 1.6, 0.45, 1.7, 0);
      if (ok("candles")) ctx.drawImage(im.candles, 0, 0, KEEP_TILE, 128, dx, 0, KEEP_TILE, 128);
    }
    // the big WARLORD COLOSSUS title only hangs in his arena
    const ax = -rel;
    if (s.kfinalCol > 0 && ax > -W && ax < W) {
      wig("echo", ax, W, 5, 57, 2.6, 0.3, 1.4, 2);
      wig("title", ax, W, 17, 71, 1.0, 0.35, 1.2, 0);
    }
  };

  // LEVEL 4 backdrop: the "painted" sky (glitchy static in the colours of TOMBFELL's covers, slowly
  // crawling), thin dark trees far away and big trunks with ivy up close. Every hit on TOMBFELL
  // slides the sky's colours along (s.woodsPaint).
  const drawWoodsTrunk = (ctx: CanvasRenderingContext2D, x: number, w: number, seed: number) => {
    const top = -84;
    const tall = 8 * T - top;
    ctx.fillStyle = "#3e3e4a";
    ctx.fillRect(x, top, w, tall);
    ctx.fillStyle = "#565664";
    ctx.fillRect(x + 2, top, Math.floor(w / 3), tall); // the light side of the bark
    ctx.fillStyle = "#2a2a34";
    ctx.fillRect(x + w - 2, top, 2, tall);
    for (let k = 0; k < 14; k++) {
      // cracks in the bark
      ctx.fillRect(x + 1 + Math.floor(hash(seed * 31 + k) * (w - 3)), Math.floor(hash(seed * 17 + k * 3) * 118), 1, 5 + Math.floor(hash(k + seed) * 9));
    }
    // ivy climbing up it: a red stem with green leaves
    for (let y = 122; y > 4; y -= 7) {
      const vx = x + Math.round(w / 2 + Math.sin(y * 0.09 + seed) * (w / 2 - 3));
      ctx.fillStyle = "#a8324a";
      ctx.fillRect(vx, y, 1, 7);
      const left = (Math.floor(y / 7) + seed) % 2 === 0;
      ctx.fillStyle = "#35603a";
      ctx.fillRect(vx + (left ? -5 : 1), y, 5, 4);
      ctx.fillStyle = "#5f8f4a";
      ctx.fillRect(vx + (left ? -4 : 2), y, 3, 2);
    }
  };
  // The big PAINTED WORLD title in his arena: first letters in a pale box, like on the cover
  const drawWoodsTitle = (ctx: CanvasRenderingContext2D, ax: number) => {
    const s = state.current;
    ctx.save();
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const words: [string, number, number][] = [
      ["PAINTED", ax + 96, 66],
      ["WORLD", ax + 126, 96],
    ];
    words.forEach(([word, x, y], i) => {
      const jit = Math.floor(s.t * 5 + i * 3) % 11 === 0 ? 2 : 0; // a little glitch now and then
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = "#e8d8ff";
      ctx.fillRect(x - 3 + jit, y - 21, 24, 25);
      ctx.font = `bold 24px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = "#14101c";
      ctx.fillText(word[0], x + jit, y);
      ctx.font = `20px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = "#ff4fd8";
      ctx.fillText(word.slice(1), x + 25, y);
      ctx.fillStyle = "#3cf0ff";
      ctx.fillText(word.slice(1), x + 27, y);
      ctx.fillStyle = "#f0e6ea";
      ctx.fillText(word.slice(1), x + 26 + jit, y);
    });
    ctx.restore();
  };
  const drawWoods = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    ctx.fillStyle = "#0c0a16";
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
    // the painted sky, in little blocks
    const CW = 8;
    const CH = 4;
    const off = Math.floor(s.cam * 0.2);
    const col0 = Math.floor(off / CW);
    const sub = off % CW;
    const n = WOODS_SKY.length;
    const drift = s.t * 0.22;
    const lastCol = Math.ceil(W / CW) + 1;
    for (let gy = -20; gy < (8 * T) / CH; gy++) {
      // every row is torn sideways a little, and the tear jumps now and then
      const tear = Math.floor(hash(gy * 7 + Math.floor(s.t * 0.8 + hash(gy) * 5)) * 4);
      let runStart = 0;
      let runIdx = -1;
      for (let gx = 0; gx <= lastCol; gx++) {
        let idx = -1;
        if (gx < lastCol) {
          const wx = gx + col0 + tear;
          const v = Math.sin(wx * 0.29 + gy * 0.15 + drift) + Math.sin(wx * 0.06 - gy * 0.41 - drift * 0.8) + hash(wx * 13 + gy * 57) * 1.1;
          idx = (((Math.floor((v + 2) * 2.1) + s.woodsPaint * 3) % n) + n) % n;
        }
        if (idx !== runIdx) {
          if (runIdx >= 0) {
            ctx.fillStyle = WOODS_SKY[runIdx];
            ctx.fillRect(runStart * CW - sub, gy * CH, (gx - runStart) * CW, CH);
          }
          runStart = gx;
          runIdx = idx;
        }
      }
    }
    // night falls over it, so the game in front stays easy to read
    ctx.fillStyle = "rgba(14, 8, 28, 0.58)";
    ctx.fillRect(-4, -84, W + 8, 8 * T + 84);
    // far away: thin dark trees
    const far = s.cam * 0.4;
    ctx.fillStyle = "#120c1e";
    for (let i = Math.floor(far / 29) - 1; i <= Math.floor((far + W) / 29) + 1; i++) {
      const tx = Math.round(i * 29 + hash(i) * 14 - far);
      ctx.fillRect(tx, -84, 2 + Math.floor(hash(i + 40) * 3), 8 * T + 84);
      const by = 20 + Math.floor(hash(i + 7) * 70);
      const dir = hash(i + 3) < 0.5 ? -1 : 1;
      for (let k = 1; k <= 6; k++) ctx.fillRect(tx + dir * k * 2, by - k, 2, 1); // a branch
    }
    // closer: big trunks with ivy growing up them
    const near = s.cam * 0.7;
    const GAP = 170;
    for (let i = Math.floor(near / GAP) - 1; i <= Math.floor((near + W) / GAP) + 1; i++) {
      drawWoodsTrunk(ctx, Math.round(i * GAP + 40 + hash(i + 90) * 60 - near), 18 + Math.floor(hash(i + 5) * 8), i);
    }
    // his arena: the big title hangs in it, and a thick tree stands at each edge (the bear crashes into those)
    const ax = Math.round(s.tfinalCol * T - s.cam);
    if (s.tfinalCol > 0 && ax > -W - 20 && ax < W + 20) {
      drawWoodsTitle(ctx, ax);
      drawWoodsTrunk(ctx, ax - 10, 18, 3);
      drawWoodsTrunk(ctx, ax + W - 8, 18, 8);
    }
  };

  // A painted zone background (PAINTED_BGS), wiggling to the beat. Returns false if that zone has none or its picture isn't there.
  const drawPaintedBackground = (ctx: CanvasRenderingContext2D, zone: number): boolean => {
    const def = PAINTED_BGS[zone];
    const entry = paintedBgRef.current[zone];
    if (!def || !entry) return false;
    const im = entry.img;
    if (!im.complete || im.naturalWidth <= 0) return false;
    const s = state.current;
    // the picture shrunk to the game's height once, so every strip below is a quick 1:1 copy
    const tw = Math.max(1, Math.round(H * (im.naturalWidth / im.naturalHeight)));
    let cache = entry.cache;
    if (!cache || cache.width !== tw) {
      cache = document.createElement("canvas");
      cache.width = tw;
      cache.height = H;
      const cc = cache.getContext("2d");
      if (!cc) return false;
      cc.imageSmoothingEnabled = true;
      cc.imageSmoothingQuality = "high";
      cc.drawImage(im, 0, 0, tw, H);
      entry.cache = cache;
    }
    ctx.fillStyle = def.sky;
    ctx.fillRect(-4, -1200, W + 8, H + 1400); // (covers the screen when the camera scrolls up)
    const off = (((s.cam * def.parallax) % tw) + tw) % tw;
    const beat = beatPropRef.current?.current;
    const kick = beat && Number.isFinite(beat.kick) ? Math.max(0, beat.kick) : 0;
    const sway = beat && Number.isFinite(beat.sway) ? beat.sway : 0;
    const amp = (FIELD_WIGGLE_BASE + FIELD_WIGGLE_KICK * kick) * s.bgWiggle;
    const strip = amp > 0.25 ? 2 : H; // (still: one copy. Wiggling: a thin strip at a time, each pushed sideways a little differently)
    for (let y = 0; y < H; y += strip) {
      let dx = 0;
      if (strip < H) {
        const wave = Math.sin(y * FIELD_WIGGLE_RIPPLE + s.t * 3.2) * amp + Math.sin(y * FIELD_WIGGLE_RIPPLE * 2.3 - s.t * 4.1) * amp * 0.4;
        dx = Math.round(wave + sway * amp * 0.6); // (and the whole picture leans left, then right, with the beat)
      }
      let sx = (((off - dx) % tw) + tw) % tw;
      let x = 0;
      while (x < W) {
        const w = Math.min(tw - sx, W - x);
        ctx.drawImage(cache, sx, y, w, strip, x, y, w, strip);
        x += w;
        sx = 0;
      }
    }
    return true;
  };

  // A colour wash over the Keep's backdrop, different in each wing (it blends from one to the next over about 12 tiles)
  const drawWingTint = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    if (!s.levelMode) return;
    const col = (s.cam + W / 2) / T;
    const i = wingAt(col);
    const cur = KEEP_WINGS[i];
    const prev = KEEP_WINGS[Math.max(0, i - 1)];
    const k = i === 0 ? 1 : Math.min(1, (col - cur.from) / 12);
    const mix = (n: number) => prev.tint[n] + (cur.tint[n] - prev.tint[n]) * k;
    ctx.fillStyle = `rgba(${Math.round(mix(0))}, ${Math.round(mix(1))}, ${Math.round(mix(2))}, ${mix(3).toFixed(3)})`;
    ctx.fillRect(-4, -1200, W + 8, H + 1400);
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, zone: number) => {
    const s = state.current;
    const cam = s.cam;
    if (zone === LEVEL_ZONE) {
      drawWeedland(ctx);
      return;
    }
    if (zone === LEVEL_SNOW) {
      drawSnowland(ctx);
      return;
    }
    if (zone === LEVEL_KEEP) {
      drawKeep(ctx);
      drawWingTint(ctx);
      return;
    }
    if (zone === LEVEL_WOODS) {
      drawWoods(ctx);
      return;
    }

    if (zone === VOID_ZONE) {
      // SoundCloud Void: dark room with a moving sound wave, tinted a bit differently per room
      const pal = VOID_PALETTES[s.voidPal] || VOID_PALETTES[0];
      ctx.fillStyle = pal.bg;
      // Extended upward so it still fully covers the screen when the vertical camera scrolls up
      ctx.fillRect(-4, -1200, W + 8, H + 1400);
      // (one band of sound wave per screen, so the tall rooms keep it going all the way up)
      const bands = s.camY < -20 ? Math.min(4, Math.ceil(-s.camY / H) + 1) : 1;
      for (let band = 0; band < bands; band++) {
        for (let i = 0; i < W / 4 + 1; i++) {
          const h = 10 + (Math.sin(s.t * 3 + i * 0.5 + band) + 1) * 14 + hash(i + band * 31) * 12;
          ctx.fillStyle = i % 2 === 0 ? pal.a : pal.b;
          ctx.fillRect(i * 4, 64 - band * H - h / 2, 3, h);
        }
      }
      return;
    }

    if (zone >= FIELD_ZONE_START && zone < FIELD_ZONE_START + FIELD_IMAGES.length) {
      // A cover-art field: the backdrop is the pixelated cover, ground/platforms stay plain.
      // Fallback fill first, only shows if the image hasn't loaded yet.
      ctx.fillStyle = SCREEN;
      ctx.fillRect(-4, -1200, W + 8, H + 1400);
      const img = fieldImagesRef.current[zone - FIELD_ZONE_START];
      if (img && img.complete && img.naturalWidth > 0) {
        // Stack extra copies directly above the visible one, so jumping high (which
        // scrolls the screen up) reveals more of the same cover instead of a plain gap.
        const COPIES_ABOVE = 6;
        const wiggle = FIELD_WIGGLE[zone - FIELD_ZONE_START];
        for (let i = -COPIES_ABOVE; i <= 0; i++) {
          const top = i * H;
          if (top > s.camY + H || top + H < s.camY) continue; // not on screen
          if (!wiggle) {
            ctx.drawImage(img, 0, top, W, H);
            continue;
          }
          // Wiggle: draw the cover in thin strips, each one nudged sideways by a slow wave
          const STRIP = 4;
          const sh = img.naturalHeight / (H / STRIP);
          for (let y = 0; y < H; y += STRIP) {
            const off = Math.sin(s.t * 1.6 + (top + y) * 0.07) * 3;
            ctx.drawImage(img, 0, (y / STRIP) * sh, img.naturalWidth, sh, -4 + off, top + y, W + 8, STRIP + 1);
          }
        }
      }
      if (zone - FIELD_ZONE_START === F_CORAL - FIELD_ZONE_START) {
        // Underwater: darker blue water on top of the cover, with light rippling through
        ctx.fillStyle = "rgba(8, 40, 90, 0.38)";
        ctx.fillRect(-4, -1200, W + 8, H + 1400);
        ctx.fillStyle = "rgba(170, 225, 255, 0.22)";
        for (let band = 0; band < 5; band++) {
          const by = 14 + band * 30;
          for (let x = 0; x < W; x += 2) {
            const y = by + Math.sin(s.t * 1.4 + x * 0.05 + band) * 4 + Math.sin(s.t * 0.7 + x * 0.013) * 3;
            ctx.fillRect(x, Math.round(y), 2, 1);
          }
        }
      }
      // Wash out the darker covers a bit so the level on top of them is easy to see
      const wash = FIELD_WASH[zone - FIELD_ZONE_START] ?? 0;
      if (wash > 0) {
        ctx.fillStyle = `rgba(255, 255, 255, ${wash})`;
        ctx.fillRect(-4, -1200, W + 8, H + 1400);
      }
      return;
    }

    if (drawPaintedBackground(ctx, zone)) return; // your painted background for this zone, if there is one (wiggles to the music)
    ctx.fillStyle = zone === Z_CLOUDS ? CLOUD_SKY : zone === Z_TREES ? TREE_SKY : zone === Z_SMOKE ? SMOKE_SKY : SCREEN;
    // Extended upward so it still fully covers the screen when the vertical camera scrolls up
    ctx.fillRect(-4, -1200, W + 8, H + 1400);

    if (zone === 0) {
      // Rolling hills
      ctx.fillStyle = HILLS;
      const off = -((cam * 0.3) % 120);
      for (let i = -1; i < 4; i++) {
        const x = off + i * 120;
        ctx.beginPath();
        ctx.moveTo(x, 130);
        ctx.quadraticCurveTo(x + 50, 70, x + 100, 130);
        ctx.fill();
      }
    } else if (zone === 1) {
      // Far-away speaker stacks
      const base = Math.floor((cam * 0.3) / 40);
      for (let i = -1; i < W / 40 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 40 - cam * 0.3);
        const h = 40 + Math.floor(hash(idx) * 50);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 130 - h, 30, h);
        ctx.fillStyle = SCREEN;
        for (let yy = 130 - h + 6; yy < 124; yy += 14) {
          ctx.beginPath();
          ctx.arc(x + 15, yy + 4, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (zone === 2) {
      // City skyline with lit windows
      const base = Math.floor((cam * 0.25) / 24);
      for (let i = -1; i < W / 24 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 24 - cam * 0.25);
        const h = 30 + Math.floor(hash(idx + 7) * 70);
        ctx.fillStyle = HILLS;
        ctx.fillRect(x, 140 - h, 22, h);
        ctx.fillStyle = "#e7b3e0";
        for (let yy = 140 - h + 4; yy < 134; yy += 8) {
          for (let xx = 3; xx < 20; xx += 6) {
            if (hash(idx * 31 + yy + xx) > 0.55) ctx.fillRect(x + xx, yy, 2, 3);
          }
        }
      }
    } else if (zone === Z_TREES) {
      // Twisted trees: a far row (light) and a near row (dark), both swaying
      ctx.lineCap = "round";
      ctx.strokeStyle = TREE_FAR;
      let base = Math.floor((cam * 0.15) / 46);
      for (let i = -1; i < W / 46 + 2; i++) {
        const idx = base + i;
        const x = idx * 46 - cam * 0.15 + hash(idx + 40) * 16;
        drawTree(ctx, x, 150, 22 + hash(idx + 5) * 14, idx + 100, 1);
      }
      ctx.strokeStyle = TREE_NEAR;
      base = Math.floor((cam * 0.35) / 80);
      for (let i = -1; i < W / 80 + 2; i++) {
        const idx = base + i;
        const x = idx * 80 - cam * 0.35 + hash(idx + 9) * 24;
        drawTree(ctx, x, 160, 30 + hash(idx + 2) * 16, idx, 1.6);
      }
      ctx.lineCap = "butt";
    } else if (zone === Z_SMOKE) {
      // Smoke Ocean: a sea of smoke on the horizon, with the ghost ship drifting by
      const sea = 104;
      const trip = W + 90;
      const bx = Math.round(W + 10 - ((cam * 0.08 + s.t * 7) % trip));
      const bob = Math.round(Math.sin(s.t * 1.6) * 2);
      const ship = shipRef.current;
      if (ship && ship.complete && ship.naturalWidth > 0) {
        // your drawing: the ship sits on its own smoke, which sinks into the sea
        drawImageSafe(ctx, ship, bx, sea - 50 + bob);
      } else {
        // backup boat if the picture isn't there
        drawPixels(ctx, BOAT, bx, sea - 38 + bob, { K: INK, b: "#7a4a3a", B: "#543028", W: "#f5f0e6", S: "#8f8499", M: "#3c2822" }, 2);
      }
      for (let xx = -2; xx < W + 4; xx += 4) {
        const wave = Math.sin(s.t * 1.5 + (xx + cam * 0.3) * 0.08) * 2;
        ctx.fillStyle = SMOKE_SEA_DARK;
        ctx.fillRect(xx, Math.round(sea + wave - 2), 4, H);
        ctx.fillStyle = SMOKE_SEA;
        ctx.fillRect(xx, Math.round(sea + wave), 4, H);
      }
      // slow smoke streaks on the sea
      ctx.fillStyle = SMOKE_STREAK;
      for (let k = 0; k < 6; k++) {
        const sx = Math.round((((hash(k) * 400 - cam * 0.3 - s.t * 12) % 300) + 300) % 300) - 22;
        ctx.fillRect(sx, sea + 10 + k * 8, 18 + Math.round(hash(k + 3) * 14), 2);
      }
    } else {
      // Pink clouds drifting in the sky
      const base = Math.floor((cam * 0.2) / 70);
      for (let i = -1; i < W / 70 + 2; i++) {
        const idx = base + i;
        const x = Math.round(idx * 70 - cam * 0.2 + Math.sin(s.t * 0.3 + idx) * 4);
        const y = 20 + Math.floor(hash(idx + 3) * 60);
        ctx.fillStyle = "#fbe3f6";
        ctx.beginPath();
        ctx.arc(x + 14, y + 10, 10, 0, Math.PI * 2);
        ctx.arc(x + 28, y + 6, 13, 0, Math.PI * 2);
        ctx.arc(x + 42, y + 10, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x + 12, y + 10, 32, 10);
      }
    }
  };

  // One floating cloud island from screen x0 to x1, standing surface at gy.
  // The top puffs slowly breathe and the whole cloud bobs a tiny bit.
  const drawCloud = (ctx: CanvasRenderingContext2D, x0: number, x1: number, gy: number, seed: number) => {
    const t = state.current.t;
    const w = x1 - x0;
    const top = gy + Math.round(Math.sin(t * 1.3 + seed) * 1);
    const thick = Math.min(30, 17 + Math.round(w * 0.12));
    const tops: [number, number, number][] = [];
    const topCount = Math.max(2, Math.round(w / 10));
    for (let k = 0; k < topCount; k++) {
      const cx = x0 + 5 + (k * (w - 10)) / (topCount - 1);
      const r = 6 + hash(seed * 7 + k) * 3 + Math.sin(t * 1.8 + k * 1.3 + seed) * 0.8;
      tops.push([cx, top + r - 1, r]);
    }
    const bottoms: [number, number, number][] = [];
    const botCount = Math.max(1, Math.round(w / 14));
    for (let k = 0; k < botCount; k++) {
      const cx = botCount === 1 ? x0 + w / 2 : x0 + 7 + (k * (w - 14)) / (botCount - 1);
      const r = 5 + hash(seed * 3 + k + 50) * 3 + Math.sin(t * 1.4 + k + seed) * 0.6;
      bottoms.push([cx, top + thick - r, r]);
    }
    const shape = (grow: number) => {
      ctx.beginPath();
      for (const [cx, cy, r] of [...tops, ...bottoms]) {
        ctx.moveTo(cx + r + grow, cy);
        ctx.arc(cx, cy, r + grow, 0, Math.PI * 2);
      }
      ctx.rect(x0 + 2 - grow, top + 5 - grow, w - 4 + grow * 2, thick - 9 + grow * 2);
      ctx.fill();
    };
    ctx.fillStyle = PINK; // outline
    shape(1);
    ctx.fillStyle = CLOUD;
    shape(0);
    // soft pink shadow along the bottom, little white shine on top
    ctx.fillStyle = "#f3c6ec";
    for (const [cx, cy, r] of bottoms) {
      ctx.beginPath();
      ctx.arc(cx, cy + 1, Math.max(1, r - 2), 0, Math.PI);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < tops.length; k += 2) {
      const [cx, cy, r] = tops[k];
      ctx.fillRect(Math.round(cx - 3), Math.round(cy - r + 3), 2, 2);
    }
  };

  // Finds every cloud island on screen (in PINK CLOUDS) and draws each one as a single cloud
  const drawCloudIslands = (ctx: CanvasRenderingContext2D, cam: number) => {
    const isCloud = (c: Column) => c.zone === Z_CLOUDS && c.ground >= 0 && !c.pipe;
    const first = Math.floor(cam / T);
    const last = first + Math.ceil(W / T) + 1;
    let col = first;
    // start from the beginning of an island that sticks out on the left
    while (col > first - 30 && isCloud(colAt(col - 1)) && colAt(col - 1).ground === colAt(col).ground && isCloud(colAt(col))) col--;
    while (col <= last) {
      const c = colAt(col);
      if (!isCloud(c)) {
        col++;
        continue;
      }
      let end = col + 1;
      while (end < col + 40 && isCloud(colAt(end)) && colAt(end).ground === c.ground) end++;
      drawCloud(ctx, col * T - cam, end * T - cam, c.ground * T, col);
      col = end;
    }
  };

  const drawGround = (ctx: CanvasRenderingContext2D, c: Column, col: number, x: number) => {
    const s = state.current;
    const gy = c.ground * T;
    if (c.pipe) return;
    if (c.zone === LEVEL_WOODS) {
      // dark forest floor with moss on top and a red leaf stem here and there
      ctx.fillStyle = "#1c1420";
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = "#2c2232";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 11, 3, 2);
      ctx.fillRect(x + ((col * 5) % 9) + 1, gy + 22, 2, 2);
      ctx.fillStyle = "#35603a";
      ctx.fillRect(x, gy, T, 5);
      ctx.fillRect(x + ((col * 3) % 12), gy + 5, 2, 2); // moss hanging down
      ctx.fillStyle = "#5f8f4a";
      ctx.fillRect(x, gy, T, 2);
      ctx.fillStyle = "#a8324a";
      ctx.fillRect(x + ((col * 5) % 11) + 2, gy + 3, 2, 1);
      return;
    }
    if (c.zone === LEVEL_KEEP) {
      // stone floor tiles, like the arena floor in your drawing
      ctx.fillStyle = "#28242e";
      ctx.fillRect(x, gy, T, H - gy);
      for (let yy = gy; yy < H; yy += T) {
        ctx.fillStyle = "#48424e";
        ctx.fillRect(x + 1, yy + 1, T - 2, T - 2);
      }
      ctx.fillStyle = "#5a5462";
      ctx.fillRect(x + 1, gy + 1, T - 2, 2);
      return;
    }
    if (c.zone === VOID_ZONE) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = GREEN;
      ctx.fillRect(x, gy, T, 2);
      // weed pattern in the floor
      if (gy < H - 12) drawPixels(ctx, LEAF, x + 4, gy + 6, { G: DARK_GREEN, D: "#10401a" });
      return;
    }
    if (c.zone === Z_TREES) {
      // Dark soil with crooked roots
      ctx.fillStyle = TREE_SOIL;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = TREE_ROOT;
      const o = (col * 5) % 8;
      ctx.fillRect(x + o, gy + 5, 5, 1);
      ctx.fillRect(x + o + 4, gy + 6, 1, 4);
      const o2 = (col * 3) % 9;
      ctx.fillRect(x + o2 + 2, gy + 16, 6, 1);
      ctx.fillRect(x + o2 + 2, gy + 17, 1, 3);
      ctx.fillStyle = TREE_TOP;
      ctx.fillRect(x, gy, T, 2);
      return;
    }
    if (c.zone === Z_SMOKE) {
      // A floor made of smoke, gently puffing
      const wob = Math.sin(s.t * 2 + col * 0.9) * 1.5;
      ctx.fillStyle = SMOKE_SHADE;
      ctx.fillRect(x, gy + 5, T, H - gy);
      ctx.fillStyle = SMOKE_EDGE;
      ctx.beginPath();
      ctx.arc(x + 4, gy + 4 + wob, 5, 0, Math.PI * 2);
      ctx.arc(x + 12, gy + 4 - wob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.beginPath();
      ctx.arc(x + 4, gy + 5 + wob, 5, 0, Math.PI * 2);
      ctx.arc(x + 12, gy + 5 - wob, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x, gy + 5, T, 4);
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.fillRect(x + ((col * 7 + Math.floor(s.t * 6)) % 14), gy + 15, 3, 1);
      ctx.fillRect(x + ((col * 11 + Math.floor(s.t * 4)) % 13), gy + 24, 4, 1);
      return;
    }
    if (c.zone === 3) {
      // Cloud islands are drawn as whole floating clouds in drawCloudIslands
      return;
    }
    if (c.zone === 2) {
      ctx.fillStyle = ROOF;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = ROOF_LINE;
      for (let yy = gy + 6; yy < H; yy += 8) ctx.fillRect(x, yy, T, 1);
      ctx.fillRect(x + (col % 2) * 8 + 3, gy + 6, 1, H - gy - 6);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 1);
      return;
    }
    if (c.zone === 1) {
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = PINK;
      ctx.fillRect(x, gy, T, 2);
      for (let yy = gy + 5; yy + 8 < H; yy += 14) {
        ctx.fillStyle = DARK_PINK;
        ctx.fillRect(x + 4, yy, 8, 8);
        ctx.fillStyle = INK;
        ctx.fillRect(x + 6, yy + 2, 4, 4);
        ctx.fillStyle = PINK;
        ctx.fillRect(x + 7, yy + 3, 2, 2);
      }
      return;
    }
    if (c.zone === LEVEL_SNOW) {
      // a thick layer of snow on dark earth
      ctx.fillStyle = "#5a4636";
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = "#453427";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 14, 3, 2);
      ctx.fillStyle = "#dfeef6";
      ctx.fillRect(x, gy, T, 7);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#b8d2e2";
      ctx.fillRect(x + ((col * 5) % 10) + 2, gy + 5, 4, 1);
      ctx.fillStyle = "#dfeef6";
      ctx.fillRect(x + ((col * 3) % 12), gy + 7, 3, 2); // drips of snow
      return;
    }
    if (c.zone === LEVEL_ZONE) {
      // rich soil with grass on top and little tufts
      ctx.fillStyle = WL_SOIL;
      ctx.fillRect(x, gy, T, H - gy);
      ctx.fillStyle = "#1e3417";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 9, 2, 2);
      ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 19, 2, 2);
      ctx.fillStyle = WL_GRASS;
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#a6f07e";
      ctx.fillRect(x + ((col * 3) % 12) + 1, gy - 2, 1, 2);
      ctx.fillRect(x + ((col * 7) % 12) + 3, gy - 1, 1, 1);
      ctx.fillStyle = "#3f8a34";
      ctx.fillRect(x, gy + 3, T, 1);
      return;
    }
    if (drawFieldGround(ctx, c, col, x, gy)) return;
    ctx.fillStyle = INK;
    ctx.fillRect(x, gy, T, H - gy);
    ctx.fillStyle = PINK;
    ctx.fillRect(x, gy, T, 2);
    ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 7, 2, 2);
    ctx.fillRect(x + ((col * 5) % 10) + 3, gy + 20, 2, 2);
    void s;
  };

  // A spinning gear (TOP SHELF FIELD, under the ground)
  const drawGear = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number) => {
    ctx.fillStyle = "#5a606e";
    for (let k = 0; k < 8; k++) {
      const a = angle + (k * Math.PI) / 4;
      ctx.fillRect(Math.round(cx + Math.cos(a) * (r + 1) - 1.5), Math.round(cy + Math.sin(a) * (r + 1) - 1.5), 3, 3);
    }
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#8c94a2";
    ctx.beginPath();
    ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2a2d34";
    ctx.fillRect(Math.round(cx) - 1, Math.round(cy) - 1, 3, 3);
    // a spoke so you can see it turning
    ctx.fillRect(Math.round(cx + Math.cos(angle) * (r - 3)) - 1, Math.round(cy + Math.sin(angle) * (r - 3)) - 1, 2, 2);
  };

  // Ground for the cover-art fields. Returns false for fields that keep the plain look.
  const drawFieldGround = (ctx: CanvasRenderingContext2D, c: Column, col: number, x: number, gy: number) => {
    const s = state.current;
    const depth = H - gy;
    if (c.zone === F_GAF) {
      // dark soil with a row of little nugs on top
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#2e6e28";
      ctx.fillRect(x, gy, T, 3);
      ctx.fillStyle = "#5cb84a";
      ctx.fillRect(x + 1, gy - 1, 5, 3);
      ctx.fillRect(x + 9, gy - 1, 6, 3);
      ctx.fillStyle = "#ff8c28";
      ctx.fillRect(x + 3, gy, 1, 1);
      ctx.fillRect(x + 12, gy, 1, 1);
      ctx.fillStyle = "#2e6e28";
      ctx.fillRect(x + ((col * 7) % 11) + 2, gy + 9, 3, 3);
      ctx.fillStyle = "#5cb84a";
      ctx.fillRect(x + ((col * 7) % 11) + 3, gy + 9, 1, 1);
      return true;
    }
    if (c.zone === F_PSP) {
      // black plastic with d-pads and buttons
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#4aa3ff";
      ctx.fillRect(x, gy, T, 2);
      ctx.fillStyle = "#3c3c48";
      if (col % 2 === 0) {
        ctx.fillRect(x + 4, gy + 8, 7, 3);
        ctx.fillRect(x + 6, gy + 6, 3, 7);
      } else {
        ctx.fillStyle = "#ff5fe0";
        ctx.fillRect(x + 4, gy + 7, 2, 2);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(x + 8, gy + 10, 2, 2);
      }
      return true;
    }
    if (c.zone === F_IPOD) {
      // polished silver, like the back of an old iPod, with a shine sliding across
      ctx.fillStyle = "#c9ced8";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#e9ecf2";
      ctx.fillRect(x, gy + 4, T, 3);
      ctx.fillStyle = "#a9afbb";
      ctx.fillRect(x, gy + 12, T, 2);
      ctx.fillRect(x, gy + 20, T, 1);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, gy + 1, T, 2);
      // moving diagonal shine
      const shine = (((col * T - s.t * 40) % 96) + 96) % 96;
      if (shine < T) {
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        for (let k = 0; k < 10; k++) ctx.fillRect(x + ((shine + k) % T), gy + 3 + k, 2, 1);
      }
      return true;
    }
    if (c.zone === F_SPT) {
      // a rainbow floor
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, depth);
      RAINBOW_STRIPES.forEach((color, i) => {
        ctx.fillStyle = color;
        ctx.fillRect(x, gy + i, T, 1);
      });
      ctx.fillStyle = "#ff78c8";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 11, 2, 2);
      return true;
    }
    if (c.zone === F_TOP) {
      // riveted steel with gears turning underneath
      ctx.fillStyle = "#3a3e48";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = INK;
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#d7dce6";
      ctx.fillRect(x, gy + 1, T, 2);
      ctx.fillStyle = "#8c94a2";
      ctx.fillRect(x, gy + 3, T, 2);
      ctx.fillStyle = INK;
      ctx.fillRect(x + 2, gy + 2, 1, 1);
      ctx.fillRect(x + 13, gy + 2, 1, 1);
      if (depth > 22) drawGear(ctx, x + 8, gy + 15, 5, s.t * 2.2 * (col % 2 === 0 ? 1 : -1) + (col % 2) * 0.4);
      return true;
    }
    if (c.zone === F_CORAL) {
      // sand, with corals growing out of it here and there
      ctx.fillStyle = "#e8cf8f";
      ctx.fillRect(x, gy, T, depth);
      ctx.fillStyle = "#5a3c1e";
      ctx.fillRect(x, gy, T, 1);
      ctx.fillStyle = "#f7e6b8";
      ctx.fillRect(x, gy + 1, T, 1);
      ctx.fillStyle = "#c2a060";
      ctx.fillRect(x + ((col * 7) % 12) + 2, gy + 6, 1, 1);
      ctx.fillRect(x + ((col * 5) % 10) + 4, gy + 12, 1, 1);
      const pick = hash(col * 3 + 11);
      if (pick < 0.45 && !c.pipe) {
        const which = pick < 0.15 ? 0 : pick < 0.3 ? 1 : 2 + (Math.floor(s.t * 2 + col) % 2);
        drawPixels(ctx, CORALS[which], x + 1 + Math.floor(hash(col) * 2), gy - 14, CORAL_COLORS, 2);
      }
      return true;
    }
    return false;
  };

  const drawBrick = (ctx: CanvasRenderingContext2D, x: number, by: number, zone: number) => {
    // Cover-art fields: each has its own thing to jump on
    if (zone === F_GAF || zone === LEVEL_ZONE) return drawPixels(ctx, NUG, x, by, NUG_COLORS);
    if (zone === LEVEL_WOODS) {
      // a mossy log
      ctx.fillStyle = "#14101c";
      ctx.fillRect(x, by, T, T);
      ctx.fillStyle = "#6a5a4a";
      ctx.fillRect(x + 1, by + 1, T - 2, T - 2);
      ctx.fillStyle = "#544638";
      ctx.fillRect(x + 1, by + 9, T - 2, 6);
      ctx.fillStyle = "#5f8f4a";
      ctx.fillRect(x + 1, by + 1, T - 2, 3);
      ctx.fillStyle = "#14101c";
      ctx.fillRect(x + 5, by + 6, 1, 5);
      ctx.fillRect(x + 11, by + 8, 1, 5);
      return;
    }
    if (zone === LEVEL_KEEP) {
      // a cracked stone block
      ctx.fillStyle = "#28242e";
      ctx.fillRect(x, by, T, T);
      ctx.fillStyle = "#5a5462";
      ctx.fillRect(x + 1, by + 1, T - 2, T - 2);
      ctx.fillStyle = "#48424e";
      ctx.fillRect(x + 1, by + 8, T - 2, 7);
      ctx.fillStyle = "#28242e";
      ctx.fillRect(x + 7, by + 1, 1, 7);
      ctx.fillRect(x + 4, by + 8, 1, 7);
      return;
    }
    if (zone === LEVEL_SNOW) {
      // an ice block
      ctx.fillStyle = "#3a7fa8";
      ctx.fillRect(x, by, T, T - 3);
      ctx.fillStyle = "#bfe8ff";
      ctx.fillRect(x + 1, by + 1, T - 2, T - 5);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 1, by + 1, T - 2, 2);
      ctx.fillRect(x + 3, by + 5, 1, 4);
      ctx.fillRect(x + 4, by + 4, 1, 1);
      ctx.fillStyle = "#8fd0f0";
      ctx.fillRect(x + 9, by + 7, 4, 1);
      return;
    }
    if (zone === F_PSP) return drawPixels(ctx, HANDHELD, x, by + 1, HANDHELD_COLORS);
    if (zone === F_IPOD) return drawPixels(ctx, PLAYER, x, by, PLAYER_COLORS);
    if (zone === F_SPT) return drawPixels(ctx, RAINBOW, x, by, RAINBOW_COLORS);
    if (zone === F_TOP) return drawPixels(ctx, METAL, x, by, METAL_COLORS);
    if (zone === F_CORAL) return drawPixels(ctx, REEF, x, by, REEF_COLORS);
    if (zone === Z_TREES) {
      // a crooked branch
      ctx.fillStyle = INK;
      ctx.fillRect(x, by, T, 7);
      ctx.fillStyle = TREE_ROOT;
      ctx.fillRect(x, by + 1, T, 5);
      ctx.fillStyle = TREE_TOP;
      ctx.fillRect(x, by, T, 1);
      ctx.fillStyle = TREE_SOIL;
      ctx.fillRect(x + ((x & 8) ? 3 : 10), by + 2, 2, 2);
      return;
    }
    if (zone === Z_SMOKE) {
      // a puff of smoke
      ctx.fillStyle = SMOKE_EDGE;
      ctx.fillRect(x, by + 1, T, T - 4);
      ctx.fillStyle = SMOKE_LIGHT;
      ctx.fillRect(x, by + 2, T, T - 6);
      return;
    }
    if (zone === 3 || zone === VOID_ZONE) {
      // cloud puffs / void blocks
      ctx.fillStyle = zone === 3 ? CLOUD : "#2d1838";
      ctx.fillRect(x, by + 2, T, T - 4);
      ctx.fillStyle = zone === 3 ? PINK : GREEN;
      ctx.fillRect(x, by + 2, T, 1);
      return;
    }
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by, T, T);
    ctx.fillStyle = PINK;
    ctx.fillRect(x + 1, by + 1, T - 2, T - 2);
    ctx.fillStyle = DARK_PINK;
    ctx.fillRect(x, by + 7, T, 1);
    ctx.fillRect(x + 7, by, 1, 7);
    ctx.fillRect(x + 3, by + 8, 1, 8);
    ctx.fillRect(x + 11, by + 8, 1, 8);
  };

  // The way down into the Void: a dark well with the void swirling in its mouth and sparks drifting up
  // out of it. Once you've been in, it goes grey and shuts. (In the code it's still called "pipe".)
  // It's drawn in two halves, one per tile: left half first, then the right half.
  // A tall pillar of a Void room (it starts above the screen and goes all the way down), same look as the pipe wells
  const drawTallPillar = (ctx: CanvasRenderingContext2D, c: Column, x: number) => {
    const top = c.ground * T;
    ctx.fillStyle = INK;
    ctx.fillRect(x, top, T, H - top);
    ctx.fillStyle = "#2a1240";
    ctx.fillRect(x, top + 2, T, H - top);
    ctx.fillStyle = "#5a2a86";
    ctx.fillRect(x, top, T, 3);
    ctx.fillRect(x + T - 3, top, 2, H - top);
  };
  // A trampoline pad. It squashes flat for a moment when you land on it.
  const drawSpring = (ctx: CanvasRenderingContext2D, x: number, top: number, bump: number) => {
    const squash = bump > 0 ? 3 : 0;
    const padY = top - 8 + squash;
    ctx.fillStyle = INK;
    ctx.fillRect(x + 1, top - 3, 14, 3); // the base
    ctx.fillRect(x, padY - 1, 16, 5); // the pad's outline
    ctx.fillStyle = PINK;
    ctx.fillRect(x + 1, padY, 14, 3);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(x + 2, padY, 6, 1);
    ctx.fillStyle = INK; // the springs under it
    ctx.fillRect(x + 4, padY + 4, 2, Math.max(1, top - 3 - (padY + 4)));
    ctx.fillRect(x + 10, padY + 4, 2, Math.max(1, top - 3 - (padY + 4)));
  };
  const drawPipe = (ctx: CanvasRenderingContext2D, c: Column, x: number) => {
    const s = state.current;
    const top = c.ground * T;
    const left = c.pipe === 1;
    const used = c.pipeUsed;
    // the well itself: a dark block with straight sides
    ctx.fillStyle = INK;
    ctx.fillRect(x, top, T, H - top);
    ctx.fillStyle = used ? "#6c6474" : "#2a1240";
    ctx.fillRect(x + (left ? 2 : 0), top + 2, T - 2, H - top);
    // a lighter stripe down the outside edge
    ctx.fillStyle = used ? "#8a8292" : "#5a2a86";
    ctx.fillRect(left ? x + 2 : x + T - 5, top + 2, 3, H - top);
    if (!used) {
      // pink streaks getting pulled down into it
      for (let k = 0; k < 3; k++) {
        const fall = (s.t * 22 + k * 11 + (left ? 0 : 5)) % 30;
        ctx.fillStyle = k === 1 ? "#ff8ff0" : PINK;
        ctx.fillRect(x + (left ? 7 : 3) + k * 3, Math.round(top + 9 + fall), 1, 4);
      }
    }
    if (left) return;
    // (from here on: things that stretch across both halves, drawn with the right half so nothing paints over them)
    const x0 = x - T; // left edge of the whole well
    if (used) {
      // shut: a flat grey lid
      ctx.fillStyle = "#8a8292";
      ctx.fillRect(x0 + 2, top + 2, 2 * T - 4, 4);
      ctx.fillStyle = "#555060";
      ctx.fillRect(x0 + 6, top + 4, 2 * T - 12, 1);
      return;
    }
    // the mouth: pitch black, with two bright bits circling round and round in it
    ctx.fillStyle = "#000000";
    ctx.fillRect(x0 + 4, top + 2, 2 * T - 8, 6);
    for (let k = 0; k < 2; k++) {
      const a = s.t * 4 + k * Math.PI;
      const sx = Math.round(x0 + T - 2 + Math.cos(a) * 9);
      const sy = top + 4 + Math.round(Math.sin(a) * 1.5);
      ctx.fillStyle = k === 0 ? "#ff8ff0" : "#c070ff";
      ctx.fillRect(sx, sy, 4, 2);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(sx + (Math.cos(a) > 0 ? 3 : 0), sy, 1, 1);
    }
    // sparks drifting up out of it
    const sparkColors = [PINK, "#ffffff", "#c070ff"];
    for (let k = 0; k < 3; k++) {
      const rise = (s.t * 0.7 + k / 3) % 1;
      if (rise > 0.85) continue; // each one blinks out near the top
      ctx.fillStyle = sparkColors[k];
      ctx.fillRect(Math.round(x0 + 8 + k * 7 + Math.sin(s.t * 3 + k * 2) * 2), Math.round(top - 2 - rise * 14), 2, 2);
    }
  };

  // The pink start screen: two big blocks
  const drawHome = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    ctx.fillStyle = "#e05fc8";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#d24fba";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.fillText(GAME_TITLE, W / 2 + 1, 7);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(GAME_TITLE, W / 2, 6);
    const blocks = [
      { title: ["PINK RUN", "INFINITE"], text: ["SURVIVE THE", "LONGEST, COLLECT", "THE HIGHEST", "SCORE!"], foot: `HI ${pad(s.best)}` },
      {
        title: ["PINK", "LEVELS"],
        text: ["BEAT THE LEVELS,", "HIT THE BONG,", "SET THE", "FASTEST TIME!"],
        foot: `${Object.keys(s.levelBest).filter((k) => !!LEVELS[Number(k) - 1]).length}/${LEVELS_PLAYABLE} DONE`,
      },
    ];
    blocks.forEach((b, i) => {
      const bx = i === 0 ? 8 : W / 2 + 4;
      const bw = W / 2 - 12;
      const by = 20;
      const bh = 124;
      const picked = s.homeChoice === i;
      const on = Math.floor(s.t * 3) % 2 === 0;
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = picked ? (on ? "#ffffff" : "#ffd6f4") : "#8a1f86";
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = picked ? "#ff8ae0" : "#b43aa4";
      ctx.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = INK;
      b.title.forEach((t, k) => ctx.fillText(t, bx + bw / 2, by + 8 + k * 11));
      ctx.fillStyle = picked ? INK : "#f8d8f0";
      b.text.forEach((t, k) => ctx.fillText(t, bx + bw / 2, by + 36 + k * 10));
      // a little picture: you running / the bong
      if (i === 0) {
        const sprite = spritesRef.current[s.outfit];
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          ctx.drawImage(sprite, (Math.floor(s.t * 6) % 2) * SPRITE_W, 0, SPRITE_W, SPRITE_H, bx + bw / 2 - 12, by + 78, SPRITE_W, SPRITE_H);
        }
      } else {
        drawPixels(ctx, BONG, bx + bw / 2 - 10, by + 80, BONG_COLORS, 2);
      }
      ctx.fillStyle = INK;
      ctx.fillText(b.foot, bx + bw / 2, by + bh - 11);
    });
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        s.homeChoice === 2 ? "OK TO OPEN THE SHOP, DOWN TO GO BACK" : s.homeChoice === 3 ? "OK TO SEE YOUR BOSS CARDS, DOWN = BACK" : "< > PICK, UP: CARDS + SHOP, OK TO GO",
        W / 2,
        H - 12
      );
    }
    // The SHOP button (top right): UP to get on it, OK to go in. Shows your gold coins.
    const shopOn = s.homeChoice === 2;
    const sx = W - 98;
    const sy = 2;
    const sw = 90;
    const sh = 12;
    ctx.fillStyle = INK;
    ctx.fillRect(sx - 2, sy - 2, sw + 4, sh + 4);
    ctx.fillStyle = shopOn ? (Math.floor(s.t * 3) % 2 === 0 ? "#ffffff" : "#ffd6f4") : "#8a1f86";
    ctx.fillRect(sx - 1, sy - 1, sw + 2, sh + 2);
    ctx.fillStyle = shopOn ? "#ffd700" : "#b43aa4";
    ctx.fillRect(sx + 1, sy + 1, sw - 2, sh - 2);
    ctx.fillStyle = shopOn ? INK : "#f8d8f0";
    ctx.textAlign = "left";
    ctx.fillText("SHOP", sx + 5, sy + 2);
    ctx.textAlign = "right";
    ctx.fillText(`${Math.min(s.coins, 9999)}`, sx + sw - 4, sy + 2);
    drawCoin(ctx, sx + 41, sy + 2);
    // The CARDS button (top left): your boss cards, and how many you have
    const cardsOn = s.homeChoice === 3;
    const cbx = 8;
    ctx.fillStyle = INK;
    ctx.fillRect(cbx - 2, sy - 2, sw + 4, sh + 4);
    ctx.fillStyle = cardsOn ? (Math.floor(s.t * 3) % 2 === 0 ? "#ffffff" : "#ffd6f4") : "#8a1f86";
    ctx.fillRect(cbx - 1, sy - 1, sw + 2, sh + 2);
    ctx.fillStyle = cardsOn ? "#ffd700" : "#b43aa4";
    ctx.fillRect(cbx + 1, sy + 1, sw - 2, sh - 2);
    ctx.fillStyle = cardsOn ? INK : "#f8d8f0";
    ctx.textAlign = "left";
    ctx.fillText("CARDS", cbx + 5, sy + 2);
    ctx.textAlign = "right";
    ctx.fillText(`${s.cards.length}/${BOSS_CARDS.length}`, cbx + sw - 4, sy + 2);
    ctx.textAlign = "center";
  };

  // ---------- BOSS CARDS: the card before a fight, and your collection ----------
  const drawBossIntro = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const it = s.intro;
    const card = it ? BOSS_CARDS.find((c) => c.id === it.id) : undefined;
    if (!it || !card) return;
    ctx.fillStyle = "rgba(22, 12, 29, 0.92)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    // the card drops in from the top
    const k = Math.min(1, (s.t - it.at) / 0.35);
    const cy = Math.round(-CARD_H + (6 + CARD_H) * (1 - (1 - k) * (1 - k)));
    drawBossCard(ctx, card, (W - CARD_W) / 2, cy, true, s.t);
    const left = (W - CARD_W) / 4; // middle of the space left of the card
    const right = W - left;
    ctx.fillStyle = Math.floor(s.t * 6) % 2 === 0 ? "#ff5fe0" : "#ffffff";
    // the main bosses get their own shout
    ctx.fillText(card.main ? "MAIN" : "BOSS", left, 34);
    ctx.fillText(card.main ? "BOSS!" : "FIGHT!", left, 46);
    ctx.fillStyle = "#ffd700";
    if (s.cards.includes(card.id)) {
      ctx.fillText("YOU HAVE", left, 100);
      ctx.fillText("HIS CARD", left, 110);
    } else {
      ctx.fillText("BEAT HIM", left, 100);
      ctx.fillText("TO KEEP", left, 110);
      ctx.fillText("THE CARD", left, 120);
    }
    if (k >= 1 && Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText("OK TO", right, 70);
      ctx.fillText("FIGHT", right, 82);
    }
  };
  const drawCards = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    ctx.fillStyle = "#1a1030";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#22163c";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.font = `8px ${fontFamily}`;
    const n = BOSS_CARDS.length;
    const card = BOSS_CARDS[s.cardIndex] ?? BOSS_CARDS[0];
    drawBossCard(ctx, card, (W - CARD_W) / 2, 6, s.cards.includes(card.id), s.t);
    const left = (W - CARD_W) / 4;
    const right = W - left;
    ctx.fillStyle = "#ffd700";
    ctx.fillText("BOSS", left, 8);
    ctx.fillText("CARDS", left, 18);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.cardIndex + 1}/${n}`, right, 13);
    // one little card per boss: gold = you have it, grey = locked, white frame = the one you're looking at
    BOSS_CARDS.forEach((c, i) => {
      const dx = Math.round(left - (n * 10) / 2 + i * 10);
      if (i === s.cardIndex) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(dx - 1, 37, 9, 12);
      }
      ctx.fillStyle = s.cards.includes(c.id) ? "#f0c030" : "#5a5a5a";
      ctx.fillRect(dx, 38, 7, 10);
    });
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ff5fe0";
      ctx.fillText("<", (W - CARD_W) / 2 - 10, 76);
      ctx.fillText(">", (W + CARD_W) / 2 + 10, 76);
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillText("YOU HAVE", left, 112);
    ctx.fillText(`${s.cards.length} OF ${n}`, left, 122);
    ctx.fillStyle = "#d8b8e8";
    ctx.fillText("OK / ESC", right, 112);
    ctx.fillText("BACK", right, 122);
  };

  // ---------- PINK SHOP: the screen ----------
  const drawCoin = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    ctx.fillStyle = "#6b4a00";
    ctx.fillRect(x, y, 8, 8);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(x + 1, y + 1, 6, 6);
    ctx.fillStyle = "#fff3a0";
    ctx.fillRect(x + 2, y + 2, 2, 2);
  };
  const drawShop = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const on = Math.floor(s.t * 3) % 2 === 0;
    ctx.fillStyle = "#2a1040";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#33164d";
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    ctx.fillText("PINK SHOP", W / 2 + 1, 6);
    ctx.fillStyle = "#ffd700";
    ctx.fillText("PINK SHOP", W / 2, 5);
    // your gold coins (top right)
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`${s.coins}`, W - 8, 5);
    drawCoin(ctx, W - 20 - String(s.coins).length * 8, 4);

    // The list on the left
    const first = shopFirstRow();
    for (let i = first; i < Math.min(SHOP_ROWS.length, first + SHOP_VISIBLE); i++) {
      const row = SHOP_ROWS[i];
      const y = SHOP_TOP + (i - first) * SHOP_ROW_H;
      ctx.textAlign = "left";
      if (row.kind === "head") {
        ctx.fillStyle = "#ffd700";
        ctx.fillText(row.label, 8, y);
        const lx = 8 + row.label.length * 8 + 4;
        ctx.fillStyle = "#6a3a8a";
        ctx.fillRect(lx, y + 3, 214 - lx, 1);
        continue;
      }
      const picked = i === s.shopIndex;
      if (picked) {
        ctx.fillStyle = on ? PINK : "#ff5fe0";
        ctx.fillRect(6, y - 1, 208, SHOP_ROW_H);
      }
      let label = "BACK";
      let tag = ""; // OWNED / WORN / SOON
      let price = 0;
      if (row.kind === "spell") {
        label = row.spell.name;
        if (s.spells.includes(row.spell.id)) tag = "OWNED";
        else price = row.spell.cost;
      } else if (row.kind === "soon") {
        label = row.label;
        tag = "SOON";
      } else if (row.kind === "bskin") {
        label = boboSkinName(row.outfit);
        if (s.petSkin === row.outfit.id) tag = "WORN";
        else if (boboOwns(row.outfit.id)) tag = "OWNED";
        else if (row.outfit.cost) price = boboSkinCost(row.outfit);
        else tag = "LOCKED";
      } else if (row.kind === "skin") {
        label = row.outfit.name;
        if (s.outfit === row.outfit.id) tag = "WORN";
        else if (s.unlocked.includes(row.outfit.id)) tag = "OWNED";
        else price = row.outfit.cost ?? 0;
      }
      const dim = row.kind === "soon";
      ctx.fillStyle = picked ? "#ffffff" : dim ? "#8f7fa6" : "#e8d0f0";
      ctx.fillText(label, 12, y);
      ctx.textAlign = "right";
      if (price > 0) {
        // gold = you can afford it, pale red = not yet (white on the highlighted line)
        ctx.fillStyle = picked ? "#ffffff" : s.coins >= price ? "#ffd700" : "#c08a9a";
        ctx.fillText(`${price}`, 210, y);
        drawCoin(ctx, 210 - String(price).length * 8 - 10, y - 1);
      } else if (tag) {
        ctx.fillStyle = picked ? "#ffffff" : dim ? "#8f7fa6" : "#6fdc5a";
        ctx.fillText(tag, 210, y);
      }
    }

    // The picture on the right: the skin, or the spell doing its thing
    const px = 222;
    const py = 17;
    const pw = 106;
    const ph = 99;
    ctx.fillStyle = INK;
    ctx.fillRect(px - 2, py - 2, pw + 4, ph + 4);
    ctx.fillStyle = "#8a1f86";
    ctx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
    ctx.fillStyle = "#170a24";
    ctx.fillRect(px, py, pw, ph);
    const row = SHOP_ROWS[s.shopIndex];
    const drawDude = (id: OutfitId, x: number, y: number, scale: number) => {
      const sprite = spritesRef.current[id];
      if (sprite && sprite.complete && sprite.naturalWidth > 0) {
        const frame = sprite.naturalWidth >= SPRITE_W * 3 ? 2 : 0;
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, SPRITE_W * scale, SPRITE_H * scale);
      } else {
        ctx.fillStyle = OUTFIT_FALLBACK[id];
        ctx.fillRect(x + HB_X * scale, y + HB_Y * scale, HB_W * scale, HB_H * scale);
      }
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, pw, ph);
    ctx.clip();
    const mx = px + pw / 2;
    const my = py + ph / 2;
    if (row && row.kind === "spell") {
      drawDude(s.outfit, Math.round(mx - SPRITE_W / 2), Math.round(my - SPRITE_H / 2), 1);
      const t = (s.t * 1.3) % 1;
      for (let k = 0; k < SPIKE_COUNT; k++) {
        const a = (k / SPIKE_COUNT) * Math.PI * 2;
        const d = 16 + t * 34;
        const spx = Math.round(mx + Math.cos(a) * d - 2);
        const spy = Math.round(my + 4 + Math.sin(a) * d - 2);
        ctx.fillStyle = "#b050f0";
        ctx.fillRect(spx, spy, 4, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(spx + 1, spy + 1, 2, 2);
      }
    } else if (row && row.kind === "soon") {
      ctx.textAlign = "center";
      ctx.fillStyle = on ? "#ff5fe0" : "#8a1f86";
      ctx.fillText("? ? ?", mx, my - 4);
    } else if (row && row.kind === "bskin") {
      // BOBO, big, in the skin you're looking at (he bounces a little)
      const cols = BOBO_SKIN_COLORS[row.outfit.id] ?? BOBO_COLORS;
      ctx.globalAlpha = row.outfit.id === "ghost" ? 0.7 : 1;
      drawPixels(ctx, BOBO[Math.floor(s.t * 3) % 2], Math.round(mx - 40), Math.round(my - 30 - (Math.floor(s.t * 3) % 2)), cols, 5);
      ctx.globalAlpha = 1;
    } else {
      drawDude(row && row.kind === "skin" ? row.outfit.id : s.outfit, Math.round(mx - SPRITE_W), Math.round(my - SPRITE_H), 2);
    }
    ctx.restore();

    // Two lines about the highlighted thing
    let line1 = s.shopFromPause ? "BACK TO YOUR GAME" : "BACK TO THE START SCREEN";
    let line2 = "";
    if (row && row.kind === "spell") {
      line1 = row.spell.info[0];
      line2 = row.spell.info[1];
    } else if (row && row.kind === "soon") {
      line1 = "NEW SPELLS ARE ON THE WAY";
    } else if (row && row.kind === "bskin") {
      const bo = row.outfit;
      const bcost = boboSkinCost(bo);
      if (s.petSkin === bo.id) line1 = "BOBO IS WEARING THIS ONE";
      else if (boboOwns(bo.id)) line1 = "PRESS OK TO PUT IT ON BOBO";
      else if (!bo.cost) {
        line1 = "BOBO GETS THIS ONE FREE";
        line2 = `WHEN YOU UNLOCK ${bo.name}`;
      } else if (s.coins >= bcost) line1 = `PRESS OK TO BUY (${bcost} COINS)`;
      else {
        line1 = `YOU NEED ${bcost - s.coins} MORE COINS`;
        line2 = "GOLD COINS HIDE AMONG THE LEAVES";
      }
    } else if (row && row.kind === "skin") {
      const cost = row.outfit.cost ?? 0;
      if (s.outfit === row.outfit.id) line1 = "YOU'RE WEARING THIS ONE";
      else if (s.unlocked.includes(row.outfit.id)) line1 = "PRESS OK TO WEAR IT";
      else if (s.coins >= cost) line1 = `PRESS OK TO BUY (${cost} COINS)`;
      else {
        line1 = `YOU NEED ${cost - s.coins} MORE COINS`;
        line2 = "GOLD COINS HIDE AMONG THE LEAVES";
      }
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(line1, W / 2, 121);
    ctx.fillStyle = "#d8b8e8";
    ctx.fillText(line2, W / 2, 132);
    if (s.shopMsg && s.t - s.shopMsgAt < 2) flashBox(ctx, s.shopMsg, 146, s.t);
    else if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText("\u2191\u2193 BROWSE \u00b7 OK BUY \u00b7 ESC BACK", W / 2, 146);
    }
  };

  // ---------- The level map ----------
  // Which level you have to beat before you can walk to stop i (0 = nothing, it's open).
  // Normally that's the level right before it. A hidden level ("coming soon") doesn't count:
  // you walk straight past its stop once the level before THAT one is done.
  const mapNeeds = (i: number) => {
    let need = i;
    while (need > 0 && need <= ALL_LEVELS.length && !LEVELS[need - 1]) need--;
    return need;
  };
  const mapUnlocked = (i: number) => {
    const need = mapNeeds(i);
    return need === 0 || !!state.current.levelBest[String(need)] || localTesting();
  };

  // The points walked from stop `from` to the next/previous stop `to`
  const mapPath = (from: number, to: number): [number, number][] => {
    const A = MAP_NODES[from];
    const B = MAP_NODES[to];
    if (to === from + 1) return [[A.x, A.y], ...B.path, [B.x, B.y]];
    return [[A.x, A.y], ...[...A.path].reverse(), [B.x, B.y]];
  };

  // Arrow keys / WASD on the map: walk along the path that leaves your stop in that direction
  const mapMove = (dx: number, dy: number) => {
    const s = state.current;
    if (s.mapWalk) return;
    const here = s.levelPick;
    for (const to of [here + 1, here - 1]) {
      if (to < 0 || to >= MAP_NODES.length) continue;
      const pts = mapPath(here, to);
      const [x0, y0] = pts[0];
      const [x1, y1] = pts[1];
      const sx = Math.sign(x1 - x0);
      const sy = Math.sign(y1 - y0);
      if ((dx !== 0 && sx === dx) || (dy !== 0 && sy === dy)) {
        if (!mapUnlocked(to)) {
          s.flash = 1.5;
          s.flashText = `LOCKED - BEAT LVL ${mapNeeds(to)} FIRST`;
          beep(200, 140, 0.12, 0.05, "square");
          return;
        }
        s.mapWalk = { pts, d: 0, to };
        return;
      }
    }
  };

  const updateMap = (dt: number) => {
    const s = state.current;
    const w = s.mapWalk;
    if (!w) return;
    w.d += MAP_WALK_SPEED * dt;
    let total = 0;
    for (let i = 1; i < w.pts.length; i++) total += Math.hypot(w.pts[i][0] - w.pts[i - 1][0], w.pts[i][1] - w.pts[i - 1][1]);
    if (w.d >= total) {
      s.levelPick = w.to;
      s.mapWalk = null;
      beep(660, 880, 0.06, 0.04, "square");
    }
  };

  // Where you are on the map right now (walking or standing), and which way you face
  const mapPos = (): { x: number; y: number; face: number; moving: boolean } => {
    const s = state.current;
    const w = s.mapWalk;
    if (!w) {
      const n = MAP_NODES[s.levelPick];
      return { x: n.x, y: n.y, face: 1, moving: false };
    }
    let d = w.d;
    for (let i = 1; i < w.pts.length; i++) {
      const [x0, y0] = w.pts[i - 1];
      const [x1, y1] = w.pts[i];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (d <= len || i === w.pts.length - 1) {
        const k = len > 0 ? Math.min(1, d / len) : 1;
        return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, face: x1 < x0 ? -1 : 1, moving: true };
      }
      d -= len;
    }
    const n = MAP_NODES[w.to];
    return { x: n.x, y: n.y, face: 1, moving: true };
  };

  const drawMapIcon = (ctx: CanvasRenderingContext2D, icon: MapIcon, x: number, y: number) => {
    const s = state.current;
    ctx.fillStyle = INK;
    if (icon === "weed") drawPixels(ctx, LEAF, x - 7, y - 7, { G: GREEN, D: DARK_GREEN }, 2);
    else if (icon === "snow") {
      ctx.fillStyle = "#2f5d4a";
      ctx.beginPath();
      ctx.moveTo(x - 8, y + 6);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 8, y + 6);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 2);
      ctx.lineTo(x, y - 7);
      ctx.lineTo(x + 3, y - 2);
      ctx.fill();
    } else if (icon === "speaker") {
      ctx.fillRect(x - 6, y - 7, 12, 14);
      ctx.fillStyle = "#777";
      ctx.beginPath();
      ctx.arc(x, y - 3, 2, 0, Math.PI * 2);
      ctx.arc(x, y + 3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon === "skull") drawPixels(ctx, MAP_SKULL, x - 7, y - 7, { W: "#ece6d6", K: INK }, 2);
    else if (icon === "dove") drawPixels(ctx, DOVE[0], x - 11, y - 9, DOVE_COLORS, 2);
    else if (icon === "roof") {
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.fill();
      ctx.fillStyle = "#5a2a6a";
      ctx.fillRect(x - 6, y, 12, 7);
      ctx.fillStyle = "#ffd23c";
      ctx.fillRect(x - 3, y + 2, 2, 2);
      ctx.fillRect(x + 2, y + 2, 2, 2);
    } else if (icon === "cloud") {
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(x - 4, y + 1, 4, 0, Math.PI * 2);
      ctx.arc(x + 1, y - 2, 5, 0, Math.PI * 2);
      ctx.arc(x + 5, y + 2, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (icon === "tree") {
      ctx.strokeStyle = "#3a1f5a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 7);
      ctx.lineTo(x, y - 1);
      ctx.lineTo(x - 5, y - 6);
      ctx.moveTo(x, y - 1);
      ctx.lineTo(x + 4, y - 7);
      ctx.moveTo(x, y + 2);
      ctx.lineTo(x + 5, y - 1);
      ctx.stroke();
    } else if (icon === "ship") {
      ctx.fillStyle = "#7a4a3a";
      ctx.fillRect(x - 7, y + 1, 14, 4);
      ctx.fillStyle = INK;
      ctx.fillRect(x, y - 7, 1, 8);
      ctx.fillStyle = "#8f8499";
      ctx.fillRect(x + 1, y - 6, 5, 4);
      ctx.fillStyle = "#f5f0e6";
      ctx.fillRect(x - 5, y - 2, 3, 3);
    } else if (icon === "coral") drawPixels(ctx, CORALS[0], x - 7, y - 7, CORAL_COLORS, 2);
    else if (icon === "bong") {
      drawPixels(ctx, BONG, x - 10, y - 20, BONG_COLORS, 2);
      void s;
    }
  };

  // The level map screen
  const drawLevelSelect = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    // grassy map
    ctx.fillStyle = "#7cc86a";
    ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = k % 2 ? "#6cb85c" : "#8cd87a";
      ctx.fillRect(Math.round(hash(k) * W), Math.round(hash(k + 50) * H), 6 + Math.round(hash(k + 9) * 10), 3);
    }
    for (let k = 0; k < 9; k++) {
      const lx = Math.round(hash(k + 200) * (W - 20));
      const ly = 36 + Math.round(hash(k + 300) * (H - 60));
      drawPixels(ctx, LEAF, lx, ly + Math.round(Math.sin(s.t * 2 + k)), { G: "#4e9e44", D: "#3a7a32" }, 1);
    }
    // the path
    for (let i = 1; i < MAP_NODES.length; i++) {
      const pts = mapPath(i - 1, i);
      const open = mapUnlocked(i);
      for (let j = 1; j < pts.length; j++) {
        const [x0, y0] = pts[j - 1];
        const [x1, y1] = pts[j];
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = 0; d <= len; d += 6) {
          const px = Math.round(x0 + ((x1 - x0) * d) / len);
          const py = Math.round(y0 + ((y1 - y0) * d) / len);
          ctx.fillStyle = INK;
          ctx.fillRect(px - 2, py - 2, 5, 5);
          ctx.fillStyle = open ? "#f2dea0" : "#9aa08a";
          ctx.fillRect(px - 1, py - 1, 3, 3);
        }
      }
    }
    // the stops
    MAP_NODES.forEach((n, i) => {
      const open = mapUnlocked(i);
      const done = !!s.levelBest[String(i + 1)];
      const big = n.icon === "bong";
      const r = big ? 14 : 11;
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = open ? MAP_BADGE[n.icon] : "#8a8a8a";
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fill();
      // (while Level 4 is hidden its stop shows a plain cloud instead of the dove)
      if (open) drawMapIcon(ctx, i === TOMBFELL_STOP && !TOMBFELL_LEVEL_SHOWN ? "cloud" : n.icon, n.x, n.y + (big ? 8 : 0));
      else {
        // padlock
        ctx.fillStyle = INK;
        ctx.fillRect(n.x - 4, n.y - 1, 9, 7);
        ctx.fillRect(n.x - 3, n.y - 5, 1, 4);
        ctx.fillRect(n.x + 3, n.y - 5, 1, 4);
        ctx.fillRect(n.x - 3, n.y - 6, 7, 1);
        ctx.fillStyle = "#ffd23c";
        ctx.fillRect(n.x, n.y + 1, 1, 2);
      }
      if (done) {
        // gold star: beaten
        ctx.fillStyle = INK;
        ctx.fillRect(n.x + r - 5, n.y - r - 1, 7, 7);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(n.x + r - 4, n.y - r, 5, 5);
      }
      if (big) {
        ctx.font = `8px ${fontFamily}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = INK;
        ctx.fillText("BOSS FIGHT", n.x - 12, n.y + r + 4);
        ctx.fillStyle = "#ff2832";
        ctx.fillText("BOSS FIGHT", n.x - 13, n.y + r + 3);
      }
    });
    // you
    const me = mapPos();
    const sprite = spritesRef.current[s.outfit];
    const frame = me.moving ? Math.floor(s.t * 8) % 2 : 0;
    const px = Math.round(me.x - SPRITE_W / 2);
    const py = Math.round(me.y - 8 - SPRITE_H + (me.moving ? 0 : Math.sin(s.t * 3)));
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.save();
      if (me.face < 0) {
        ctx.translate(px + SPRITE_W, py);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
      } else {
        ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, px, py, SPRITE_W, SPRITE_H);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = PINK;
      ctx.fillRect(px + HB_X, py + HB_Y, HB_W, HB_H);
    }
    // info about the stop you're on
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    if (!s.mapWalk) {
      const i = s.levelPick;
      const lv = LEVELS[i];
      const last = i === MAP_NODES.length - 1;
      textBox(ctx, lv ? `LVL ${i + 1}: ${lv.name}` : last ? `LVL ${i + 1}: THE FINAL BOSS` : `LVL ${i + 1}`, 6);
      const best = s.levelBest[String(i + 1)];
      textBox(ctx, lv ? (best ? `BEST ${fmtTime(best)}${medalTag(i + 1)}  -  OK TO PLAY` : "OK TO PLAY") : i === WARLORD_STOP && !WARLORD_SHOWN ? WARLORD_SOON_TEXT : "COMING SOON", 18);
    }
    if (s.flash > 0) textBox(ctx, s.flashText, 34);
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = INK;
      ctx.fillText("ARROWS / WASD TO WALK, ESC BACK", W / 2 + 1, H - 9);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("ARROWS / WASD TO WALK, ESC BACK", W / 2, H - 10);
    }
  };

  // " GOLD NO-HIT" after a level's best time on the level-select line
  const medalTag = (level: number) => {
    const m = state.current.medals[String(level)];
    return m ? `${m.time ? " " + m.time.toUpperCase() : ""}${m.nohit ? " NO-HIT" : ""}` : "";
  };

  // You hit the bong
  const drawLevelDone = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const since = s.t - s.doneAt;
    if (since < 0.6) return; // let the smoke show first
    ctx.fillStyle = "rgba(22, 60, 20, 0.75)";
    ctx.fillRect(0, 0, W, H);
    textBox(ctx, `LVL ${s.level} DONE!`, 20);
    textBox(ctx, LEVELS[s.level - 1]?.name ?? "", 34);
    textBox(ctx, `TIME ${fmtTime(s.levelMs)}`, 56);
    const best = s.levelBest[String(s.level)];
    if (s.newBest) {
      if (Math.floor(s.t * 4) % 2 === 0) textBox(ctx, "NEW BEST TIME!", 70);
    } else if (best) {
      textBox(ctx, `YOUR BEST ${fmtTime(best)}`, 70);
    }
    const md = s.medal;
    if (md && md.time) textBox(ctx, `${md.time.toUpperCase()} MEDAL${md.newTime ? " - NEW!" : ""}`, 83);
    textBox(ctx, "PINKMANE HIT THE BONG", 97);
    if (md && md.nohit) textBox(ctx, `NO-HIT STAR${md.newNoHit ? " - NEW!" : ""}`, 109);
    if (md && md.skin) textBox(ctx, "WARLORD SKIN UNLOCKED!", 109);
    if (since > 1 && Math.floor(s.t * 2) % 2 === 0) textBox(ctx, "OK TO GO ON", 120);
  };

  // Thin line at the bottom: the zones you ran through (solid), the zones coming up (faded),
  // you (pink marker) and the next troll (green face at the end)
  const drawProgress = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    if (s.levelMode) {
      const end = s.bong ? s.bong.x : s.cols.length * T;
      const x0 = 10;
      const x1 = W - 20;
      const y = H - 4;
      const part = Math.max(0, Math.min(1, s.farthest / end));
      ctx.fillStyle = INK;
      ctx.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 4);
      ctx.fillStyle = "#4a3d55";
      ctx.fillRect(x0, y, x1 - x0, 2);
      ctx.fillStyle = WL_GRASS;
      ctx.fillRect(x0, y, Math.round((x1 - x0) * part), 2);
      // the boss arena
      const ax = x0 + Math.round((x1 - x0) * Math.min(1, (s.bossCol * T) / end));
      ctx.fillStyle = "#ff283c";
      ctx.fillRect(ax, y - 2, 2, 6);
      for (const ka of s.karenas) {
        ctx.fillRect(x0 + Math.round((x1 - x0) * Math.min(1, (ka.col * T) / end)), y - 2, 2, 6);
      }
      // you
      const me = x0 + Math.round((x1 - x0) * part);
      ctx.fillStyle = INK;
      ctx.fillRect(me - 2, y - 5, 5, 4);
      ctx.fillStyle = PINK;
      ctx.fillRect(me - 1, y - 4, 3, 2);
      // the bong at the end
      drawPixels(ctx, BONG, x1 + 4, y - 11, BONG_COLORS, 1);
      return;
    }
    const lo = s.bossCount * BOSS_EVERY;
    const hi = lo + BOSS_EVERY;
    const x0 = 10;
    const x1 = W - 20;
    const y = H - 4;
    const px = (v: number) => Math.round(x0 + Math.max(0, Math.min(1, (v - lo) / (hi - lo))) * (x1 - x0));
    ctx.fillStyle = INK;
    ctx.fillRect(x0 - 1, y - 1, x1 - x0 + 2, 4);
    ctx.fillStyle = "#4a3d55";
    ctx.fillRect(x0, y, x1 - x0, 2);
    // zones already done
    const marks = s.zoneMarks;
    for (let i = 0; i < marks.length; i++) {
      const from = px(marks[i].score);
      const to = px(Math.min(i + 1 < marks.length ? marks[i + 1].score : s.score, s.score));
      if (to > from) {
        ctx.fillStyle = ZONE_COLORS[marks[i].zone % ZONE_COLORS.length];
        ctx.fillRect(from, y, to - from, 2);
      }
    }
    // zones coming up (a guess: they're far away in distance, your points add on top)
    const curZone = Math.floor(Math.floor(s.farthest / T) / ZONE_LEN);
    let segStart = s.score;
    ctx.globalAlpha = 0.4;
    for (let k = 0; k < 12 && segStart < hi; k++) {
      const zoneIdx = curZone + k;
      const end = Math.min(hi, (zoneIdx + 1) * ZONE_LEN + s.bonus);
      if (end > segStart) {
        ctx.fillStyle = ZONE_COLORS[zoneIdx % ZONE_COLORS.length];
        ctx.fillRect(px(segStart), y, px(end) - px(segStart), 2);
        if (end < hi) {
          ctx.fillStyle = INK;
          ctx.fillRect(px(end), y - 1, 1, 4);
        }
      }
      segStart = Math.max(segStart, end);
    }
    ctx.globalAlpha = 1;
    // you
    const me = px(s.score);
    ctx.fillStyle = INK;
    ctx.fillRect(me - 2, y - 5, 5, 4);
    ctx.fillStyle = PINK;
    ctx.fillRect(me - 1, y - 4, 3, 2);
    // the troll waiting at the end
    const tx = x1 + 3;
    ctx.fillStyle = INK;
    ctx.fillRect(tx - 1, y - 5, 9, 8);
    const nextBoss = bossKindAt(s.bossCount); // green troll, white snowman, purple giant, red skeleton, TOMBFELL (dark blue, pointy hat)
    const giantNext = nextBoss === "giant";
    ctx.fillStyle = s.bossState === "fight" && Math.floor(s.t * 6) % 2 === 0 ? "#ffffff" : giantNext ? "#8a4fc0" : nextBoss === "tombfell" ? "#3a1d8a" : nextBoss === "snowman" ? "#dff0ff" : nextBoss === "skeleton" ? "#b03844" : "#6aa84f";
    ctx.fillRect(tx, y - 4, 7, 6);
    if (nextBoss === "tombfell") {
      // his hat
      ctx.fillStyle = INK;
      ctx.fillRect(tx - 1, y - 6, 9, 2);
      ctx.fillRect(tx + 1, y - 8, 5, 2);
      ctx.fillRect(tx + 2, y - 10, 3, 2);
      ctx.fillStyle = "#3cf0ff";
      ctx.fillRect(tx + 3, y - 8, 1, 1);
    }
    if (giantNext) {
      // his horns
      ctx.fillStyle = INK;
      ctx.fillRect(tx - 2, y - 8, 3, 4);
      ctx.fillRect(tx + 6, y - 8, 3, 4);
      ctx.fillStyle = "#f3e9c8";
      ctx.fillRect(tx - 1, y - 7, 1, 3);
      ctx.fillRect(tx + 7, y - 7, 1, 3);
    }
    ctx.fillStyle = "#c81428";
    ctx.fillRect(tx + 1, y - 3, 1, 1);
    ctx.fillRect(tx + 4, y - 3, 1, 1);
    ctx.fillStyle = "#a0e65a";
    ctx.fillRect(tx + 1, y, 3, 2);
  };

  // Frozen screen before a boss fight: pick the fireball or the ice ray (shown flying for real)
  const drawSpellPick = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const b = s.boss;
    ctx.fillStyle = "rgba(22, 12, 29, 0.95)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("PICK YOUR SPELL", W / 2, 14);
    ctx.fillStyle = "#ffc800";
    const need = b ? b.maxHp : s.lboss ? s.lboss.maxHp : s.kboss ? s.kboss.maxHp : 0;
    const runSnow = !!s.lboss && !s.levelMode; // the snowman in the infinite run works like the troll: few shots, stash boxes
    const shots = s.kboss ? HORNED_AMMO : b || runSnow ? BOSS_START_SHOTS : need + BOSS_SPARE_SHOTS;
    ctx.fillText(
      s.tboss
        ? `${TOMB_AMMO} SHOTS. THEY ONLY WORK ONCE HE'S OFF THE BEAR`
        : s.kboss || b || runSnow
          ? `${shots} SHOTS, IT TAKES ${need}. USE THE STASH BOXES`
          : `${shots} SHOTS, IT TAKES ${need}`,
      W / 2,
      26
    );
    const options = s.spells.includes("spike") ? 3 : 2;
    for (let i = 0; i < options; i++) {
      const bx = options === 3 ? 56 + i * 80 : i === 0 ? W / 2 - 78 : W / 2 + 14;
      const by = 42;
      const bw = 64;
      const bh = 58;
      const picked = s.spellChoice === i;
      ctx.fillStyle = picked ? (Math.floor(s.t * 4) % 2 === 0 ? PINK : "#ff5fe0") : "#555555";
      ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
      ctx.fillStyle = "#111111";
      ctx.fillRect(bx, by, bw, bh);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bh);
      ctx.clip();
      // a little floor
      ctx.fillStyle = "#333333";
      ctx.fillRect(bx, by + bh - 8, bw, 8);
      if (i === 0) {
        // the real fireball, bouncing along
        const t = (s.t * 0.9) % 1;
        const fx = Math.round(bx + 4 + t * (bw - 12));
        const fy = Math.round(by + bh - 14 - Math.abs(Math.sin(s.t * 7)) * 22);
        ctx.fillStyle = "#ff7a00";
        ctx.fillRect(fx, fy, 5, 5);
        ctx.fillStyle = "#ffc800";
        ctx.fillRect(fx + 1, fy + 1, 3, 3);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(fx + 2, fy + 2, 1, 1);
      } else if (i === 1) {
        // the real ice ray, flying straight
        const t = (s.t * 1.3) % 1;
        const ix = Math.round(bx - 6 + t * (bw + 12));
        const iy = by + bh - 24;
        ctx.fillStyle = "#1d4fa8";
        ctx.fillRect(ix - 3, iy, 10, 4);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(ix - 2, iy + 1, 8, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(ix + 4, iy + 1, 2, 2);
        for (let k = 1; k < 5; k++) {
          ctx.fillStyle = ICE[k % 4];
          ctx.fillRect(ix - 3 - k * 4, iy + ((k * 3) % 4), 2, 1);
        }
      } else {
        // the spike shot: spikes flying out in every direction
        const t = (s.t * 1.4) % 1;
        const mx = bx + bw / 2;
        const my = by + (bh - 8) / 2;
        ctx.fillStyle = "#5a1a8a";
        ctx.fillRect(mx - 2, my - 2, 4, 4);
        for (let k = 0; k < SPIKE_COUNT; k++) {
          const a = (k / SPIKE_COUNT) * Math.PI * 2;
          const d = 5 + t * 24;
          const sx = Math.round(mx + Math.cos(a) * d - 2);
          const sy = Math.round(my + Math.sin(a) * d - 2);
          ctx.fillStyle = "#b050f0";
          ctx.fillRect(sx, sy, 4, 4);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(sx + 1, sy + 1, 2, 2);
        }
      }
      ctx.restore();
      ctx.fillStyle = picked ? "#ffffff" : "#9b8fa6";
      ctx.fillText(["FIRE", "ICE", "SPIKE"][i], bx + bw / 2, by + bh + 6);
      ctx.fillText(["BOUNCES", "STRAIGHT", "ALL WAYS"][i], bx + bw / 2, by + bh + 16);
    }
    if (Math.floor(s.t * 2) % 2 === 0) {
      ctx.fillStyle = "#ffffff";
      ctx.fillText("< > PICK, OK TO FIGHT", W / 2, H - 20);
    }
  };

  // ---------- The wax moment: drawing ----------
  // How strong the wobble (wig) and the colours (col) are right now, 0 to 1, from how long it has been going (see the 3 parts above)
  const waxTripLevels = () => {
    const e = WAX_TRIP_SECONDS - state.current.waxTrip; // seconds since it started
    const tail = Math.max(0.001, WAX_TRIP_SECONDS - WAX_TRIP_FULL - WAX_TRIP_MID);
    let wig = 1;
    let col = 1;
    if (e > WAX_TRIP_FULL) {
      const k = Math.min(1, (e - WAX_TRIP_FULL) / WAX_TRIP_MID); // part 2: a bit calmer
      wig = 1 - (1 - WAX_TRIP_MID_WIGGLE) * k;
      col = 1 - (1 - WAX_TRIP_MID_COLOUR) * k;
    }
    if (e > WAX_TRIP_FULL + WAX_TRIP_MID) {
      const k = Math.min(1, (e - WAX_TRIP_FULL - WAX_TRIP_MID) / tail); // part 3: coming down to nothing
      const ease = k * k * (3 - 2 * k);
      wig = WAX_TRIP_MID_WIGGLE * (1 - ease);
      col = WAX_TRIP_MID_COLOUR * (1 - ease);
    }
    const ramp = Math.min(1, e / 0.5); // it builds up over the first half second
    return { wig: wig * ramp, col: col * ramp };
  };

  // The wobble after the rip: the finished picture is put back in thin strips, each one swaying sideways on a
  // travelling wave, while the colours slowly turn round and round. It builds up quickly, then eases off and stops.
  const drawWaxTrip = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const { wig, col } = waxTripLevels();
    if (wig <= 0.001 && col <= 0.001) return;
    let buf = tripBufRef.current;
    if (!buf) {
      buf = document.createElement("canvas");
      buf.width = W;
      buf.height = H;
      tripBufRef.current = buf;
    }
    const bc = buf.getContext("2d");
    if (!bc) return;
    bc.drawImage(ctx.canvas, 0, 0);
    const STRIP = 4;
    const sway = WAX_TRIP_WIGGLE * wig;
    for (let y = 0; y < H; y += STRIP) {
      const dx = Math.round(Math.sin(s.t * 7 + y * 0.09) * sway + Math.sin(s.t * 3.1 + y * 0.21) * sway * 0.5);
      ctx.drawImage(buf, 0, y, W, STRIP, dx, y, W, STRIP);
    }
    const hue = s.waxHue;
    ctx.save();
    ctx.globalCompositeOperation = "hue"; // keeps the light and dark of the picture, swaps the colours
    ctx.globalAlpha = 0.6 * col;
    ctx.fillStyle = `hsl(${hue.toFixed(0)}, 100%, 55%)`;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "saturation"; // and turns the colours up
    ctx.globalAlpha = 0.75 * col;
    ctx.fillStyle = "hsl(0, 100%, 50%)";
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "overlay"; // a second colour a third of a turn away, so it never looks like one flat tint
    ctx.globalAlpha = 0.3 * col;
    ctx.fillStyle = `hsl(${((hue + 120) % 360).toFixed(0)}, 100%, 50%)`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  };

  const drawWax = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const t = s.waxT;
    const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
    const ease = (k: number) => {
      const x = clamp01(k);
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    };
    // --- the zoom: 0 = the normal game screen, 1 = zoomed in on you. It goes in at the start and back out at the end.
    const zin = ease(t / WAX_T_ZOOM);
    const zout = ease((t - (WAX_T_END - WAX_T_OUT)) / WAX_T_OUT);
    const k = zin * (1 - zout);
    const z = 1 + (WAX_ZOOM - 1) * k;
    const fx = s.waxFx;
    const fy = s.waxFy;
    const cx = fx + (WAX_STAGE_X - fx) * k; // where his middle point is on the screen right now
    const cy = fy + (WAX_STAGE_Y - fy) * k;
    const mx = (x: number) => cx + (x - fx) * z; // a spot on the frozen screen -> where it is on the zoomed screen
    const my = (y: number) => cy + (y - fy) * z;
    const out = t - WAX_T_EXHALE; // seconds since the exhale started (negative before it)
    const R = (x: number, y: number, w: number, h: number) => ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));

    ctx.save();
    // the cough: when the smoke comes out the whole screen kicks for a moment
    if (out > 0 && out < 0.5) {
      const kick = 1 - out / 0.5;
      ctx.translate(Math.round(Math.sin(t * 90) * 3 * kick), Math.round(Math.cos(t * 70) * 2 * kick));
    }
    ctx.fillStyle = "#16101d";
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // 1) the frozen world, zoomed in on you (and BOBO, if you have him)
    ctx.save();
    ctx.translate(cx - fx * z, cy - fy * z);
    ctx.scale(z, z);
    if (s.waxSnap) ctx.drawImage(s.waxSnap, 0, 0);
    if (s.pet) {
      ctx.translate(0, -Math.round(s.camY));
      drawPet(ctx, s.cam);
    }
    ctx.restore();

    // 2) the world dims down to a dark stage, with a spotlight on you
    const dim = 0.93 * ease((t - WAX_T_ZOOM * 0.5) / (WAX_T_INTRO - WAX_T_ZOOM * 0.5)) * (1 - zout);
    ctx.fillStyle = `rgba(22, 12, 29, ${dim.toFixed(3)})`;
    ctx.fillRect(-4, -4, W + 8, H + 8);

    // 3) you: drawn live on top, so you can lean in to the bong
    const leanIn = ease((t - (WAX_T_HIT - 0.55)) / 0.55); // leans in for the pull...
    const recoil = ease(out / 0.35); // ...and throws his head back on the exhale
    const lean = WAX_LEAN * leanIn * (1 - recoil);
    const pulling = t >= WAX_T_HIT && t < WAX_T_EXHALE;
    const tremble = pulling ? Math.round(Math.sin(t * 50)) : 0;
    const bob = t >= WAX_T_INTRO && !pulling ? Math.round(Math.sin(t * 3)) : 0;
    const left = Math.round(mx(fx - 12) + (lean + tremble) * (z / WAX_ZOOM));
    const top = Math.round(my(fy - 18)) + bob;
    const pw = Math.round(SPRITE_W * z);
    const ph = Math.round(SPRITE_H * z);
    if (dim > 0.02) {
      // a soft pink spotlight behind him
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `rgba(255, 95, 200, ${(0.05 * dim).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(left + pw / 2, top + ph / 2, 44 + i * 16, 62 + i * 14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const sprite = spritesRef.current[s.outfit];
    const flip = s.facing < 0 && t < WAX_T_ZOOM; // he turns to face the bong once the stage is dark
    if (sprite && sprite.complete && sprite.naturalWidth > 0) {
      ctx.save();
      if (flip) {
        ctx.translate(left + pw, top);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite, 0, 0, SPRITE_W, SPRITE_H, 0, 0, pw, ph);
      } else {
        ctx.drawImage(sprite, 0, 0, SPRITE_W, SPRITE_H, left, top, pw, ph);
      }
      ctx.restore();
    } else {
      ctx.fillStyle = OUTFIT_FALLBACK[s.outfit];
      R(left + HB_X * z, top + HB_Y * z, HB_W * z, HB_H * z);
    }

    // 4) the rig: a bong held up to his mouth, with a glass banger on the side
    const sc = WAX_BONG_SC;
    const u = sc / 5; // (the torch and the sparks were drawn for a bong 5 big)
    const bongA = ease((t - WAX_T_ZOOM * 0.9) / 0.5) * (1 - ease((t - (WAX_T_END - WAX_T_OUT)) / 0.25));
    const stageLeft = WAX_STAGE_X - 12 * WAX_ZOOM;
    const stageTop = WAX_STAGE_Y - 18 * WAX_ZOOM;
    const rx = Math.round(stageLeft + WAX_MOUTH_X * WAX_ZOOM + WAX_LEAN + 2 - 5 * sc);
    const ry = Math.round(stageTop + WAX_MOUTH_Y * WAX_ZOOM - 2 + (1 - bongA) * 14);
    const bowlX = rx + 8 * sc;
    const bowlY = ry + 7 * sc;
    const heating = t >= WAX_T_HEAT && t < WAX_T_HIT;
    if (bongA > 0.01) {
      ctx.globalAlpha = bongA;
      if (heating) {
        // the torch heats the banger: a warm glow behind the rig
        const glow = 0.14 + 0.06 * Math.sin(t * 14);
        ctx.fillStyle = `rgba(255, 150, 40, ${glow.toFixed(3)})`;
        R(bowlX - 18 * u, bowlY - 14 * u, 40 * u, 30 * u);
        ctx.fillStyle = `rgba(255, 190, 80, ${(glow * 0.9).toFixed(3)})`;
        R(bowlX - 9 * u, bowlY - 7 * u, 22 * u, 16 * u);
      }
      drawPixels(ctx, BONG, rx, ry, BONG_COLORS, sc);
      // the dab: amber wax in the banger (it glows while the torch is on it)
      ctx.fillStyle = heating ? "#ffe08a" : t >= WAX_T_HIT ? "#b8860b" : "#ffb03c";
      R(bowlX, bowlY, sc, sc);
      if (heating) {
        // the torch: a grey can and a blue flame that licks the banger
        ctx.fillStyle = INK;
        R(bowlX + 26 * u, bowlY - 6 * u, 24 * u, 16 * u);
        ctx.fillStyle = "#9b8fa6";
        R(bowlX + 28 * u, bowlY - 4 * u, 20 * u, 12 * u);
        ctx.fillStyle = "#5a4a6a";
        R(bowlX + 22 * u, bowlY, 6 * u, 4 * u);
        const lick = Math.floor(t * 4) % 2; // a slow flicker
        ctx.fillStyle = "#1d4fa8";
        R(bowlX + (6 - lick * 2) * u, bowlY, (16 + lick * 2) * u, 4 * u);
        ctx.fillStyle = "#4aa3ff";
        R(bowlX + (9 - lick * 2) * u, bowlY + u, (13 + lick * 2) * u, 2 * u);
        ctx.fillStyle = "#ffffff";
        R(bowlX + 16 * u, bowlY + u, 6 * u, 2 * u);
        // little sparks jumping off the hot wax
        for (let i = 0; i < 7; i++) {
          const age = (t * 1.7 + i * 0.29) % 1;
          const sx = bowlX + 2 + (hash(i + 1) - 0.5) * 26 * u * age;
          const sy = bowlY - 2 - age * 30 * u;
          ctx.fillStyle = `rgba(${i % 2 ? "255, 225, 120" : "255, 150, 50"}, ${(1 - age).toFixed(2)})`;
          R(sx, sy, 2, 2);
        }
      }
      if (t >= WAX_T_HIT) {
        // the pull: bubbles in the water, the neck fills with milky smoke (it clears again on the exhale)
        const fill = t < WAX_T_EXHALE ? Math.min(1, (t - WAX_T_HIT) / 1.4) : Math.max(0, 1 - out / 0.7);
        const h = 7 * sc * fill;
        ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
        R(rx + 4 * sc, ry + 8 * sc - h, 2 * sc, h);
        if (t < WAX_T_EXHALE) {
          for (let i = 0; i < 7; i++) {
            const up = (t * 46 + i * 11) % (24 * u);
            ctx.fillStyle = i % 2 === 0 ? "#ffffff" : "#bfe3ff";
            R(rx + (2 + ((i * 37) % 6)) * sc + 1, ry + 13 * sc - up, 2, 2);
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    // 5) THE EXHALE: it pours out of HIS mouth, billows out in every direction and fills the whole screen
    if (out > 0) {
      const haze = 0.34 * Math.min(1, out / 1.2) * Math.min(1, Math.max(0, 3.3 - out) / 0.9);
      ctx.fillStyle = `rgba(235, 240, 255, ${haze.toFixed(3)})`;
      ctx.fillRect(-4, -4, W + 8, H + 8);
      const clearUp = clamp01((WAX_T_END - 0.1 - t) / 0.9); // everything thins out over the last second, so it never cuts away
      const puff = (px: number, py: number, r: number, a0: number, tint: number) => {
        const a = a0 * clearUp;
        ctx.fillStyle = tint === 0 ? `rgba(255, 215, 245, ${a.toFixed(3)})` : tint === 1 ? `rgba(255, 255, 255, ${a.toFixed(3)})` : `rgba(205, 225, 255, ${a.toFixed(3)})`;
        ctx.fillRect(Math.round(px - r), Math.round(py - r / 2), Math.round(r * 2), Math.round(r));
        ctx.fillRect(Math.round(px - r / 2), Math.round(py - r), Math.round(r), Math.round(r * 2));
        ctx.fillRect(Math.round(px - r * 0.8), Math.round(py - r * 0.8), Math.round(r * 1.6), Math.round(r * 1.6));
      };
      const ox = left + WAX_MOUTH_X * z;
      const oy = top + WAX_MOUTH_Y * z;
      // (Every puff has its own direction and size, worked out from its number so nothing flickers.)
      for (let i = 0; i < 44; i++) {
        const age = out - i * 0.05;
        if (age <= 0 || age > 3) continue;
        const ang = (hash(i * 3.1) - 0.5) * Math.PI * 2; // every direction (a bit more up than down)
        const speed = 34 + hash(i * 7.7) * 70;
        const px = ox + Math.cos(ang) * speed * age * (1 + age * 0.35);
        const py = oy + Math.sin(ang) * speed * age * (1 + age * 0.2) - age * 10;
        const r = 5 + age * (14 + hash(i * 5.3) * 16);
        puff(px, py, r, 0.5 * Math.min(1, age / 0.25) * Math.max(0, 1 - age / 3), i % 3);
      }
      // ...and big slow clouds bloom all over the screen until everything is smoke
      for (let i = 0; i < 16; i++) {
        const age = out - 0.5 - i * 0.07;
        if (age <= 0 || age > 2.8) continue;
        const px = hash(i * 9.1) * W;
        const py = hash(i * 4.7) * H;
        const r = 10 + age * (22 + hash(i * 2.3) * 16);
        puff(px, py, r, 0.3 * Math.min(1, age / 0.6) * Math.max(0, 1 - age / 2.8), (i + 1) % 3);
      }
    }

    // 6) the words go on top of the smoke so you can always read them
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    const typed = (text: string, from: number, y: number, color: string) => {
      const n = Math.max(0, Math.min(text.length, Math.floor((t - from) / 0.045)));
      if (n <= 0) return;
      ctx.textAlign = "left";
      const x = Math.round(W / 2 - ctx.measureText(text).width / 2);
      ctx.fillStyle = INK;
      for (const [dx, dy] of [[1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillText(text.slice(0, n), x + dx, y + dy); // outline
      ctx.fillStyle = color;
      ctx.fillText(text.slice(0, n), x, y);
    };
    ctx.globalAlpha = 1 - zout;
    typed(WAX_LINE_1, WAX_T_INTRO + 0.2, 10, "#ffffff");
    typed(WAX_LINE_2, WAX_T_LINE2, 23, "#ffc800");
    if (t >= WAX_T_EXHALE) {
      typed(WAX_LINE_3, WAX_T_EXHALE + 0.6, 135, "#ff5fe0");
      if (t >= WAX_T_EXHALE + 2 && Math.floor(s.t * 2) % 2 === 0) {
        ctx.textAlign = "center";
        ctx.fillStyle = "#ffffff";
        ctx.fillText(touchPadRef.current ? "A = KEEP GOING" : "JUMP = KEEP GOING", W / 2, 148);
      }
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = "center";

    // the freeze: a quick flash, like a camera
    if (t < 0.2) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.55 * (1 - t / 0.2)).toFixed(3)})`;
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }
    ctx.restore();
  };

  // ---------- STASH SPIN: drawing ----------

  // The little prize icons at the bottom left while you run: one per prize you hold, pink dots = how many times
  const drawPerkHud = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    let x = 8;
    const y = H - 31;
    for (const p of PERKS) {
      const n = s.perks[p.id as PerkId];
      if (!n) continue;
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, 13, 17);
      ctx.fillStyle = p.curse ? "#f7b0b8" : SCREEN; // curses sit on red
      ctx.fillRect(x + 1, y + 1, 11, 11);
      // the icon fades while it's used up: the shield until the next zone, SECOND WIND for good
      if ((p.id === "shield" && s.shield <= 0) || (p.id === "revive" && s.reviveUsed)) ctx.globalAlpha = 0.3;
      drawPixels(ctx, p.art, x + 2, y + 2, p.colors, 1);
      ctx.globalAlpha = 1;
      for (let i = 0; i < perkMax(p); i++) {
        ctx.fillStyle = i < n ? (p.curse ? "#ff5a64" : "#ff5fe0") : "#4a3d55";
        ctx.fillRect(x + 1 + i * 4, y + 13, 3, 3);
      }
      x += 15;
    }
  };

  // SHIELD: the bubble around you (one little orb circling it for every hit it can still take)
  const drawShieldBubble = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
    const s = state.current;
    const cx = x + SPRITE_W / 2;
    const cy = y + SPRITE_H / 2 + 1;
    const rx = 15;
    const ry = 21;
    ctx.fillStyle = "rgba(159, 232, 255, 0.14)";
    ctx.fillRect(cx - rx + 4, cy - ry + 4, rx * 2 - 8, ry * 2 - 8);
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const shine = a > Math.PI * 1.05 && a < Math.PI * 1.45; // top left
      ctx.fillStyle = shine ? "#ffffff" : i % 2 === 0 ? "#9fe8ff" : "#4aa3ff";
      ctx.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * ry), 1, 1);
    }
    for (let k = 0; k < s.shield; k++) {
      const a = s.t * 2.2 + (k / Math.max(1, s.shield)) * Math.PI * 2;
      const ox = Math.round(cx + Math.cos(a) * rx);
      const oy = Math.round(cy + Math.sin(a) * ry);
      ctx.fillStyle = "#1d4fa8";
      ctx.fillRect(ox - 2, oy - 2, 4, 4);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(ox - 1, oy - 1, 2, 2);
    }
  };

  // The machine: a purple cabinet with three reel windows (gold for the BOSS SPIN)
  const drawSpin = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;
    const sp = s.spin;
    if (!sp) return;
    const trim = sp.boss ? "#ffd700" : PINK;
    const trimDark = sp.boss ? "#8a6400" : DARK_PINK;
    const trimLight = sp.boss ? "#fff3a0" : "#ff5fe0";
    const allLanded = sp.landed >= 3;
    const ready = spinCanPick();
    const slow = Math.floor(s.t * 2) % 2 === 0; // slow blink, twice a second

    ctx.fillStyle = "rgba(22, 12, 29, 0.8)";
    ctx.fillRect(0, 0, W, H);
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";

    // the lever on the right: it gets pulled when the machine opens
    const pull = sp.t < 0.2 ? sp.t / 0.2 : Math.max(0, 1 - (sp.t - 0.2) / 0.5);
    const ballY = 30 + Math.round(pull * 30);
    ctx.fillStyle = INK;
    ctx.fillRect(296, 64, 9, 14);
    ctx.fillStyle = trimDark;
    ctx.fillRect(297, 66, 6, 10);
    ctx.fillStyle = INK;
    ctx.fillRect(300, ballY + 4, 4, 68 - ballY - 4);
    ctx.fillStyle = "#9b8fa6";
    ctx.fillRect(301, ballY + 4, 2, 68 - ballY - 4);
    ctx.fillStyle = INK;
    ctx.fillRect(297, ballY - 1, 10, 10);
    ctx.fillStyle = trim;
    ctx.fillRect(298, ballY, 8, 8);
    ctx.fillStyle = trimLight;
    ctx.fillRect(299, ballY + 1, 3, 3);

    // the cabinet
    ctx.fillStyle = INK;
    ctx.fillRect(40, 5, 256, 150);
    ctx.fillStyle = "#2a1640";
    ctx.fillRect(42, 7, 252, 146);
    ctx.fillStyle = "#3d2260";
    ctx.fillRect(42, 7, 252, 2);
    ctx.fillRect(42, 7, 2, 146);
    // the sign on top, with a row of little lights that take turns
    ctx.fillStyle = trim;
    ctx.fillRect(42, 7, 252, 17);
    ctx.fillStyle = trimDark;
    ctx.fillRect(42, 22, 252, 2);
    const chase = Math.floor(s.t * 3);
    for (let i = 0; i < 31; i++) {
      ctx.fillStyle = (i + chase) % 3 === 0 ? "#ffffff" : trimDark;
      ctx.fillRect(46 + i * 8, 9, 2, 2);
    }
    drawPixels(ctx, LEAF, 50, 14, { G: trimDark, D: trimDark }, 1);
    drawPixels(ctx, LEAF, 279, 14, { G: trimDark, D: trimDark }, 1);
    const title = sp.boss ? "BOSS STASH SPIN" : "STASH SPIN";
    ctx.fillStyle = trimDark;
    ctx.fillText(title, W / 2 + 1, 14);
    ctx.fillStyle = sp.boss ? INK : "#ffffff";
    ctx.fillText(title, W / 2, 13);

    // the three reels
    for (let r = 0; r < 3; r++) {
      const wx = SPIN_WIN.x + r * SPIN_WIN.step;
      const wy = SPIN_WIN.y;
      const landed = sp.t >= sp.stops[r];
      const picked = allLanded && (sp.jackpot || (sp.took >= 0 ? sp.took === r : sp.pick === r));
      // frame
      ctx.fillStyle = INK;
      ctx.fillRect(wx - 4, wy - 4, SPIN_WIN.w + 8, SPIN_WIN.h + 8);
      ctx.fillStyle = picked ? (sp.took >= 0 ? "#ffffff" : Math.floor(s.t * 4) % 2 === 0 ? trim : trimLight) : "#5a4a6a";
      ctx.fillRect(wx - 3, wy - 3, SPIN_WIN.w + 6, SPIN_WIN.h + 6);
      ctx.fillStyle = INK;
      ctx.fillRect(wx - 1, wy - 1, SPIN_WIN.w + 2, SPIN_WIN.h + 2);
      // the window (the same pale green as the game's screen)
      ctx.fillStyle = SCREEN;
      ctx.fillRect(wx, wy, SPIN_WIN.w, SPIN_WIN.h);
      ctx.fillStyle = landed && perkDef(sp.reels[r]).curse ? "#e0303a" : HILLS; // a curse has red edges
      ctx.fillRect(wx, wy, SPIN_WIN.w, 5);
      ctx.fillRect(wx, wy + SPIN_WIN.h - 5, SPIN_WIN.w, 5);
      // the icons rolling down
      ctx.save();
      ctx.beginPath();
      ctx.rect(wx, wy, SPIN_WIN.w, SPIN_WIN.h);
      ctx.clip();
      const left = reelLeft(r);
      const base = Math.floor(left);
      const thud = landed && sp.t - sp.stops[r] < 0.1 ? 2 : 0; // a tiny bounce when it lands
      for (const k of [base, base + 1]) {
        const id = sp.strips[r][k];
        if (!id) continue;
        const d = perkDef(id);
        drawPixels(ctx, d.art, wx + 12, wy + 4 + thud + Math.round((k - left) * SPIN_WIN.h), d.colors, 4);
      }
      ctx.restore();
      // the two little pointers that mark the middle of the window
      ctx.fillStyle = trimDark;
      ctx.fillRect(wx, wy + 20, 3, 4);
      ctx.fillRect(wx + SPIN_WIN.w - 3, wy + 20, 3, 4);
      // prizes you didn't take go dark
      if (sp.took >= 0 && !picked) {
        ctx.fillStyle = "rgba(22, 12, 29, 0.65)";
        ctx.fillRect(wx, wy, SPIN_WIN.w, SPIN_WIN.h);
      }
      // the arrow above the one you're on
      if (picked && sp.took < 0 && ready) {
        const ax = wx + SPIN_WIN.w / 2;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(ax - 3, wy - 9 + (slow ? 0 : 1), 6, 2);
        ctx.fillRect(ax - 2, wy - 7 + (slow ? 0 : 1), 4, 1);
        ctx.fillRect(ax - 1, wy - 6 + (slow ? 0 : 1), 2, 1);
      }
      // under each reel: how many of that prize you have (the new ones blink)
      if (landed && sp.reels[r] !== "snack") {
        const id = sp.reels[r] as PerkId;
        const have = s.perks[id];
        const gain = sp.took >= 0 ? 0 : sp.jackpot ? 2 : 1;
        const most = perkMax(perkDef(id));
        for (let i = 0; i < most; i++) {
          const px = wx + SPIN_WIN.w / 2 - (most * 12 - 4) / 2 + i * 12;
          ctx.fillStyle = INK;
          ctx.fillRect(px - 1, wy + SPIN_WIN.h + 6, 10, 5);
          ctx.fillStyle = i < have ? LIGHT_GREEN : i < have + gain && slow ? "#ffffff" : "#4a3d55";
          ctx.fillRect(px, wy + SPIN_WIN.h + 7, 8, 3);
        }
      }
    }

    // the text panel under the reels
    ctx.fillStyle = INK;
    ctx.fillRect(48, 94, 240, 41);
    ctx.fillStyle = "#160c1d";
    ctx.fillRect(49, 95, 238, 39);
    if (!allLanded) {
      ctx.fillStyle = "#9b8fa6";
      ctx.fillText(sp.boss ? "BOSS DOWN! RARE PRIZES INSIDE" : "KEEP 1 OF THE 3 PRIZES", W / 2, 103);
      ctx.fillText("STACK A PRIZE UP TO 3 TIMES", W / 2, 117);
    } else {
      const shown = sp.jackpot ? 1 : sp.took >= 0 ? sp.took : sp.pick;
      const d = perkDef(sp.reels[shown]);
      const have = d.id === "snack" ? 0 : s.perks[d.id as PerkId];
      let head = d.name;
      if (sp.took >= 0) head = sp.jackpot ? `GOT ${d.name} X2!` : `GOT ${d.name}!`;
      else if (sp.jackpot) head = `JACKPOT! ${d.name} X2`;
      else if (d.curse) head = `CURSE: ${d.name}`;
      else if (d.id !== "snack" && perkMax(d) === 1) head = `${d.name}  RARE!`;
      else if (d.id !== "snack") head = `${d.name}  LV ${have + 1}/${perkMax(d)}`;
      // (BOBO has a different line for each level)
      const level = Math.max(0, sp.took >= 0 ? have - 1 : have);
      const info = d.infoAt ? d.infoAt[Math.min(level, d.infoAt.length - 1)] : d.info;
      ctx.fillStyle = d.curse ? "#ff5a64" : sp.jackpot && !slow ? "#ffffff" : "#ffc800";
      ctx.fillText(head, W / 2, 99);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(info[0], W / 2, 111);
      ctx.fillText(info[1], W / 2, 122);
    }

    // what to press
    if (ready && slow) {
      ctx.fillStyle = "#ffffff";
      const ok = touchPadRef.current ? "A = TAKE IT" : "JUMP = TAKE IT";
      ctx.fillText(sp.jackpot ? ok : `< > CHOOSE   ${ok}`, W / 2, 141);
    }
  };

  const draw = (ctx: CanvasRenderingContext2D) => {
    const s = state.current;

    // The wax moment: its first frame takes a picture of the frozen world WITHOUT you or your dog in it
    // (drawing a frame never changes the game, so it's safe to draw one more). The zoom uses that picture.
    if (s.mode === "wax" && !s.waxSnap && !s.waxHide) {
      const pic = document.createElement("canvas");
      pic.width = W;
      pic.height = H;
      const pc = pic.getContext("2d");
      if (pc) {
        pc.imageSmoothingEnabled = false;
        const keep = { shake: s.shake, flash: s.flash, hint: s.hintTime };
        s.shake = 0;
        s.flash = 0;
        s.hintTime = 0;
        s.waxHide = true;
        try {
          draw(pc);
        } finally {
          s.waxHide = false;
          s.shake = keep.shake;
          s.flash = keep.flash;
          s.hintTime = keep.hint;
        }
      }
      s.waxSnap = pic;
    }

    if (s.mode === "board") {
      drawBoard(ctx);
      return;
    }
    if (s.mode === "home") {
      drawHome(ctx);
      return;
    }
    if (s.mode === "shop") {
      drawShop(ctx);
      return;
    }
    if (s.mode === "cards") {
      drawCards(ctx);
      return;
    }
    if (s.mode === "levelSelect") {
      drawLevelSelect(ctx);
      return;
    }

    const cam = Math.round(s.cam);
    const viewZone = s.inBonus ? VOID_ZONE : colAt(Math.floor((cam + W / 2) / T)).zone;

    ctx.save();
    if (s.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
    ctx.translate(0, -Math.round(s.camY));

    drawBackground(ctx, viewZone);
    if (!s.inBonus && cam < 0) {
      drawSecretSign(ctx, cam, -10, MY_GOATS);
      drawSecretSign(ctx, cam, -22, SHOUT_OUTS, "SHOUT OUT:");
    }
    if (!s.inBonus) drawCloudIslands(ctx, cam);

    const firstCol = Math.floor(cam / T);

    // Level: ground, bricks, thin lines, bonus blocks, pipes
    for (let col = firstCol; col <= firstCol + W / T + 1; col++) {
      const c = colAt(col);
      const x = col * T - cam;
      if (c.ground >= 0 && !c.pipe) drawGround(ctx, c, col, x);
      else if (c.ground <= -2 && !c.pipe) drawTallPillar(ctx, c, x);
      if (c.pipe) drawPipe(ctx, c, x);
      if (c.spring && c.ground >= 0) drawSpring(ctx, x, c.ground * T, c.bump);
      if (c.block >= 0) drawBrick(ctx, x, c.block * T, c.zone);
      if (c.block2 >= 0) drawBrick(ctx, x, c.block2 * T, c.zone);
      if (c.line !== -1) {
        const ly = c.line * T;
        const blinking = c.crumble > 0 && Math.floor(s.t * (c.crumble < 1 ? 16 : 8)) % 2 === 0;
        ctx.fillStyle = INK;
        ctx.fillRect(x, ly, T, c.lineTh + 1);
        const fieldLine: Record<number, string> = {
          [F_GAF]: "#5cb84a",
          [F_PSP]: "#4aa3ff",
          [F_IPOD]: "#f5f5fa",
          [F_TOP]: "#c9ced8",
          [F_CORAL]: "#ff6f91",
          [LEVEL_ZONE]: "#4caa3c",
          [LEVEL_SNOW]: "#9fdcff",
          [LEVEL_KEEP]: "#b23a48",
          [LEVEL_WOODS]: "#5f8f4a",
        };
        ctx.fillStyle = blinking
          ? "#ffffff"
          : c.zone === VOID_ZONE
            ? LIGHT_GREEN
            : c.fragile > 0
              ? "#ff5fe0"
              : fieldLine[c.zone] ?? PINK;
        ctx.fillRect(x, ly, T, c.lineTh);
        if (c.zone === F_SPT && !blinking) {
          // rainbow lines
          for (let i = 0; i < c.lineTh; i++) {
            ctx.fillStyle = RAINBOW_STRIPES[i % RAINBOW_STRIPES.length];
            ctx.fillRect(x, ly + i, T, 1);
          }
        }
        if (c.zone === F_TOP && !blinking) {
          ctx.fillStyle = INK;
          ctx.fillRect(x + 7, ly + Math.floor(c.lineTh / 2), 1, 1);
        }
        if (c.zone === LEVEL_WOODS && !blinking) {
          // a vine: little leaves hanging off it, on a red stem
          ctx.fillStyle = "#35603a";
          ctx.fillRect(x + 2 + ((col * 5) % 4), ly + c.lineTh + 1, 3, 3);
          ctx.fillRect(x + 10 + ((col * 3) % 3), ly + c.lineTh + 1, 3, 2);
          ctx.fillStyle = "#a8324a";
          ctx.fillRect(x + 3 + ((col * 5) % 4), ly + c.lineTh, 1, 1);
        }
        // vanishing lines get little dashes so you can spot them
        if (c.fragile > 0 && !blinking) {
          ctx.fillStyle = INK;
          ctx.fillRect(x + 4, ly, 1, c.lineTh);
          ctx.fillRect(x + 11, ly, 1, c.lineTh);
        }
      }
      if (c.bonus >= 0) {
        const by = c.bonus * T - (c.bump > 0 ? Math.round(Math.sin((c.bump / 0.15) * Math.PI) * 4) : 0);
        if (c.used) {
          ctx.fillStyle = "#555555";
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = "#777777";
          ctx.fillRect(x + 2, by + 2, T - 4, T - 4);
        } else {
          ctx.fillStyle = INK;
          ctx.fillRect(x, by, T, T);
          ctx.fillStyle = Math.floor(s.t * 3) % 2 === 0 ? "#ff7a00" : PINK;
          ctx.fillRect(x, by, T, 1);
          ctx.fillRect(x, by + T - 1, T, 1);
          ctx.fillRect(x, by, 1, T);
          ctx.fillRect(x + T - 1, by, 1, T);
          drawPixels(ctx, LEAF, x + 4, by + 4, { G: "#ff7a00", D: "#ffc800" }, 1);
        }
      }
    }

    // Leaves and hearts
    for (const l of s.leaves) {
      if (isCoin(l)) {
        // spinning gold coin
        const spin = Math.abs(Math.cos(s.t * 4 + l.x));
        const cw = Math.max(2, Math.round(12 * spin));
        const cx = Math.round(l.x - cam + 7 - cw / 2);
        const cy = Math.round(l.y) + 1 + Math.round(Math.sin(s.t * 4 + l.x) * 2);
        ctx.fillStyle = "#6b4a00";
        ctx.fillRect(cx - 1, cy, cw + 2, 12);
        ctx.fillRect(cx, cy - 1, cw, 14);
        ctx.fillStyle = "#ffd700";
        ctx.fillRect(cx, cy, cw, 12);
        ctx.fillStyle = "#b8860b";
        if (cw > 5) ctx.fillRect(cx + Math.floor(cw / 2) - 1, cy + 3, 2, 6);
        ctx.fillStyle = "#fff3a0";
        if (cw > 3) ctx.fillRect(cx + 1, cy + 1, 2, 3);
        continue;
      }
      if (l.small) {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x * 0.05)), { G: LIGHT_GREEN, D: GREEN }, 1);
      } else {
        drawPixels(ctx, LEAF, l.x - cam, l.y + Math.round(Math.sin(s.t * 4 + l.x) * 2), { G: GREEN, D: DARK_GREEN }, 2);
      }
    }
    // Level signs (lore) and the bong at the end (the infinite run has signs too: the boss signs)
    if (s.levelMode || s.signs.length > 0) {
      for (const sg of s.signs) {
        const sx = Math.round(sg.x - cam);
        if (sx < -20 || sx > W + 20) continue;
        const gy = colAt(Math.floor(sg.x / T)).ground * T;
        ctx.fillStyle = "#5a3a1e";
        ctx.fillRect(sx + 7, gy - 14, 2, 14);
        ctx.fillStyle = INK;
        ctx.fillRect(sx, gy - 22, 16, 10);
        ctx.fillStyle = "#c8945a";
        ctx.fillRect(sx + 1, gy - 21, 14, 8);
        ctx.fillStyle = "#5a3a1e";
        ctx.fillRect(sx + 3, gy - 19, 10, 1);
        ctx.fillRect(sx + 3, gy - 16, 7, 1);
      }
      if (s.cpCol >= 0) {
        // the checkpoint flag: grey until you touch it, then gold and waving
        const fx = Math.round(s.cpCol * T - cam);
        if (fx > -20 && fx < W + 20) {
          const gy = colAt(s.cpCol).ground * T;
          const on = !!s.cp;
          ctx.fillStyle = INK;
          ctx.fillRect(fx + 6, gy - 32, 3, 32);
          ctx.fillStyle = on ? "#ffd700" : "#9b8fa6";
          ctx.fillRect(fx + 7, gy - 32, 1, 32);
          for (let k = 0; k < 12; k++) {
            const wave = on ? Math.round(Math.sin(s.t * 6 + k * 0.5) * 1.5) : 0;
            ctx.fillStyle = INK;
            ctx.fillRect(fx + 9 + k, gy - 31 + wave, 1, 12 - (k >> 1));
            ctx.fillStyle = on ? (k % 4 < 2 ? "#ffd700" : "#ffef8a") : "#8a7f96";
            ctx.fillRect(fx + 9 + k, gy - 30 + wave, 1, 10 - (k >> 1));
          }
          if (on) {
            ctx.fillStyle = INK;
            ctx.fillRect(fx + 12, gy - 28, 4, 4);
            ctx.fillStyle = "#ff5fe0";
            ctx.fillRect(fx + 13, gy - 27, 2, 2);
          }
        }
      }
      if (s.bong) {
        const bx = Math.round(s.bong.x - cam);
        drawPixels(ctx, BONG, bx, s.bong.y, BONG_COLORS, 2);
        // a little smoke curling out of the top while it waits for you
        if (s.mode !== "levelDone") {
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          for (let k = 0; k < 3; k++) {
            const t = (s.t * 0.8 + k / 3) % 1;
            ctx.fillRect(Math.round(bx + 9 + Math.sin(s.t * 3 + k * 2) * 3), Math.round(s.bong.y - 2 - t * 20), 2, 2);
          }
        }
      }
    }

    // The secret jetpack, floating on its shelf
    if (s.jetItem) {
      const ji = s.jetItem;
      const jx = Math.round(ji.x - cam);
      const jy = ji.y - Math.round(Math.abs(Math.sin(s.t * 3)) * 3);
      // Ghostly "MY GOATS" label floating above the jetpack, pulsing like a spirit
      // (kept bright and outlined so it stays readable against any background)
      const ghostAlpha = 0.75 + Math.sin(s.t * 2) * 0.2;
      ctx.save();
      ctx.font = `9px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.shadowColor = "rgba(190,255,225,0.95)";
      ctx.shadowBlur = 9;
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(20,10,30,${Math.min(1, ghostAlpha + 0.1)})`;
      ctx.strokeText("MY GOATS", jx + 9, jy - 8);
      ctx.fillStyle = `rgba(230,255,242,${ghostAlpha})`;
      ctx.fillText("MY GOATS", jx + 9, jy - 8);
      ctx.restore();
      // Little reminder that the jetpack's fuel runs out
      ctx.save();
      ctx.font = `6px ${fontFamily}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#ffffff";
      ctx.fillText(`ONLY TILL SCORE ${JET_UNTIL}`, jx + 22, jy + 9);
      ctx.restore();
      drawPixels(ctx, JETPACK, jx, jy, { K: INK, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 2);
      if (Math.floor(s.t * 4) % 2 === 0) {
        ctx.fillStyle = "#ffc800";
        ctx.fillRect(jx - 4, jy + 2, 2, 2);
        ctx.fillRect(jx + 20, jy + 8, 2, 2);
        ctx.fillRect(jx + 8, jy - 5, 2, 2);
      }
    }
    for (const h of s.hearts) {
      const bob = Math.round(Math.sin(s.t * 5 + h.x) * 2);
      drawPixels(ctx, HEART, h.x - cam + 1, h.y + bob + 1, { P: INK }, 2);
      drawPixels(ctx, HEART, h.x - cam, h.y + bob, { P: Math.floor(s.t * 4) % 2 === 0 ? PINK : "#ff5fe0" }, 2);
    }

    // The golden leaf: spins (squashes side to side) and sparkles
    if (s.goldLeaf) {
      const gl = s.goldLeaf;
      const spin = Math.cos(s.t * 3);
      const cx = gl.x - cam + 7;
      const cy = gl.y + 7 + Math.round(Math.sin(s.t * 2.5) * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(Math.max(0.15, Math.abs(spin)), 1);
      drawPixels(ctx, LEAF, -8, -8, { G: "#b8860b", D: "#b8860b" }, 2); // dark edge
      drawPixels(ctx, LEAF, -7, -7, { G: spin > 0 ? "#ffd700" : "#ffe866", D: "#b8860b" }, 2);
      ctx.restore();
      ctx.fillStyle = "#fff3a0";
      for (let k = 0; k < 4; k++) {
        const a = s.t * 2 + (k * Math.PI) / 2;
        if ((Math.floor(s.t * 6) + k) % 2 === 0) ctx.fillRect(Math.round(cx + Math.cos(a) * 12), Math.round(cy + Math.sin(a) * 12), 2, 2);
      }
    }

    // Flaming weed leaves (the power-up)
    for (const pu of s.powerups) {
      const x = pu.x - cam;
      const [main, dark] = POWER_COLORS[pu.kind];
      const sparks = powerSparks(pu.kind);
      drawPixels(ctx, LEAF, x, pu.y, { G: main, D: dark }, 2);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = sparks[(Math.floor(s.t * 12) + k) % 3];
        ctx.fillRect(Math.round(x + 2 + k * 4 + rand(-1, 1)), Math.round(pu.y - 3 - rand(0, 3)), 2, 2);
      }
    }

    // Fireballs
    for (const f of s.fireballs) {
      const x = Math.round(f.x - cam);
      const y = Math.round(f.y);
      if (f.pet) {
        // the dog's little shot
        ctx.fillStyle = "#ff5fc8";
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 1, y + 1, 2, 2);
        continue;
      }
      if (f.spike) {
        // a purple spike with a short tail pointing back to where it came from
        ctx.fillStyle = "#5a1a8a";
        ctx.fillRect(x + 1 - Math.sign(Math.round(f.vx)) * 3, y + 1 - Math.sign(Math.round(f.vy)) * 3, 2, 2);
        ctx.fillStyle = "#b050f0";
        ctx.fillRect(x, y, 4, 4);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x + 1, y + 1, 2, 2);
        continue;
      }
      if (f.ice) {
        // a straight icy streak
        ctx.fillStyle = "#1d4fa8";
        ctx.fillRect(x - 3, y, 10, 4);
        ctx.fillStyle = "#4aa3ff";
        ctx.fillRect(x - 2, y + 1, 8, 2);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(f.vx > 0 ? x + 4 : x - 2, y + 1, 2, 2);
        continue;
      }
      ctx.fillStyle = "#ff7a00";
      ctx.fillRect(x, y, 5, 5);
      ctx.fillStyle = "#ffc800";
      ctx.fillRect(x + 1, y + 1, 3, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x + 2, y + 2, 1, 1);
    }

    // Monsters (squashed flat when beaten)
    for (const e of s.enemies) {
      const x = e.x - cam;
      if (e.kind === "eye") {
        if (e.alive) {
          const frame = EYE_FRAMES[pmod(Math.floor(s.t * EYE_FPS + e.x * 0.05), EYE_FRAMES.length)];
          drawPixels(ctx, e.vx > 0 ? flipRows(frame) : frame, x - 2, e.y - 6, EYE_COLORS, 1);
        } else {
          ctx.fillStyle = "#ff5fae";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (e.kind === "bong") {
        const fading = e.vx === 0 && (e.idle ?? 0) > BONG_IDLE_LIFE - 3;
        if (!fading || Math.floor(s.t * 8) % 2 === 0) {
          const bob = e.vx === 0 ? Math.round(Math.sin(s.t * 4 + e.x) * 0.6) : 0;
          drawPixels(ctx, MINI_BONG, x - 3, e.y - 8 + bob, BONG_COLORS, 2);
        }
        continue;
      }
      if (e.kind === "bear") {
        // Level 4: a black bear (its eye turns red once it's angry)
        if (e.alive) {
          const fr = BEAR[Math.floor(s.t * (Math.abs(e.vx) > BEAR_SPEED + 1 ? 9 : 4) + e.x * 0.1) % 2];
          const angry = (e.hp ?? BEAR_HP) < BEAR_HP;
          drawRimmed(ctx, e.vx < 0 ? fr : flipRows(fr), Math.round(x), Math.round(e.y), angry ? BEAR_ANGRY_COLORS : BEAR_COLORS, 2);
        } else {
          ctx.fillStyle = "#231a16";
          ctx.fillRect(x + 2, e.y + BEAR_H - 5, BEAR_W - 4, 5);
        }
        continue;
      }
      const ez = colAt(Math.floor(e.x / T)).zone;
      if (ez === LEVEL_WOODS) {
        // Level 4: doves and cats
        if (e.kind === "flyer") {
          if (e.alive) {
            const fr = DOVE[Math.floor(s.t * 8 + e.phase) % 2];
            drawPixels(ctx, e.vx > 0 ? flipRows(fr) : fr, Math.round(x) - 2, Math.round(e.y) - 3, DOVE_COLORS, 2);
          } else {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const dir = e.dir ?? (e.vx < 0 ? -1 : 1);
          const fr = e.act === "crouch" ? CAT[2] : e.act === "leap" ? CAT[1] : CAT[pmod(Math.floor(s.t * 7 + e.x * 0.1), 2)];
          drawRimmed(ctx, dir < 0 ? fr : flipRows(fr), Math.round(x) - 4, Math.round(e.y) - 2, CAT_COLORS, 2);
        } else {
          ctx.fillStyle = "#1a1622";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === LEVEL_KEEP) {
        // Level 3: crows (with the smoke wisp), skeletons with knives, and oni
        if (e.kind === "flyer") {
          if (e.alive) {
            const fr = KN_CROW[Math.floor(s.t * 10 + e.phase) % KN_CROW.length];
            const right = e.vx > 0;
            drawPixels(ctx, right ? fr : flipRows(fr), x - (right ? 8 : 12), e.y - 8, KN_CROW_COLORS, 2);
          } else {
            ctx.fillStyle = "#1e1e28";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          if (e.phase === 1) {
            const fr = KN_ONI[pmod(Math.floor(s.t * 10 + e.x * 0.1), KN_ONI.length)];
            drawPixels(ctx, fr, x - 12, e.y - 16 - bob, KN_ONI_COLORS, 2);
          } else {
            const fr = KN_SKEL_WALK[Math.floor(s.t * 6) % 2];
            const faceLeft = e.act === "wind" || e.act === "slash" ? (e.dir ?? -1) < 0 : e.vx < 0;
            drawPixels(ctx, faceLeft ? flipRows(fr) : fr, x, e.y - bob, KN_SKEL_WALK_COLORS, 2);
            if (e.act === "wind") {
              // the red "!": it's about to slash
              ctx.fillStyle = "#ff2a2a";
              ctx.fillRect(Math.round(x) + 6, Math.round(e.y) - 13, 3, 7);
              ctx.fillRect(Math.round(x) + 6, Math.round(e.y) - 4, 3, 3);
            } else if (e.act === "slash") {
              ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
              ctx.lineWidth = 2;
              ctx.beginPath();
              const sl = faceLeft;
              ctx.arc(Math.round(x) + (sl ? 4 : 10), Math.round(e.y) + 8, 15, sl ? Math.PI * 0.68 : -Math.PI * 0.32, sl ? Math.PI * 1.32 : Math.PI * 0.32);
              ctx.stroke();
            }
          }
        } else {
          ctx.fillStyle = e.phase === 1 ? "#c4282e" : "#ece6d6";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === LEVEL_SNOW) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 8 + e.phase) % 2) || 0;
            const rows = e.vx > 0 ? CROW[frame].map((r) => r.split("").reverse().join("")) : CROW[frame].map((r) => r);
            drawPixels(ctx, e.vx > 0 ? rows : rows.map((r) => r.split("").reverse().join("")), x, e.y, CROW_COLORS, 2);
          } else {
            ctx.fillStyle = "#1e1e28";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, SNOWMAN, x, e.y - bob, SNOWMAN_COLORS, 2);
        } else {
          ctx.fillStyle = "#fafcff";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_IPOD) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 16) % 2) || 0;
            const charging = e.shoot !== undefined && e.shoot < 0.4 && Math.floor(s.t * 16) % 2 === 0;
            drawPixels(ctx, DRONE[frame], x, e.y, charging ? DRONE_COLORS_CHARGING : DRONE_COLORS, 2);
          } else {
            ctx.fillStyle = "#ffd000";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, HORNED, x, e.y - 2 - bob, HORNED_COLORS, 2);
        } else {
          ctx.fillStyle = "#8a5a2b";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_GAF) {
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.abs(Math.floor(s.t * 10 + e.phase) % 2) || 0;
            drawPixels(ctx, BAT[frame], x, e.y, BAT_COLORS, 2);
          } else {
            ctx.fillStyle = "#2c2c34";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, BOMB, x, e.y - 2 - bob, Math.floor(s.t * 12) % 2 ? BOMB_COLORS : BOMB_COLORS_2, 2);
        } else {
          // squashed bomb goes poof
          ctx.fillStyle = "#e0283a";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_CORAL || ez === F_TRIPPY) {
        const coral = ez === F_CORAL;
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.floor(s.t * 8 + e.phase) % 2;
            if (coral) {
              // seahorses face the way they swim
              const rows = e.vx > 0 ? SEAHORSE[frame].map((r) => r.split("").reverse().join("")) : SEAHORSE[frame];
              drawPixels(ctx, rows, x, e.y - 2, SEAHORSE_COLORS, 2);
            } else {
              const rows = e.vx > 0 ? DRAGONFLY[frame].map((r) => r.split("").reverse().join("")) : DRAGONFLY[frame];
              drawPixels(ctx, rows, x, e.y, DRAGONFLY_COLORS, 2);
            }
          } else {
            ctx.fillStyle = coral ? "#5a8cff" : "#3c82ff";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, coral ? URCHIN : BACTERIA, x, e.y - bob, coral ? URCHIN_COLORS : BACTERIA_COLORS, 2);
        } else {
          ctx.fillStyle = coral ? "#8c5ad2" : "#3cd23c";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (ez === F_SPT) {
        // SMALL PRETTY TITTIES FIELD: fairies shitting rainbows, and devil bunnies
        if (e.kind === "flyer") {
          if (e.alive) {
            const frame = Math.floor(s.t * 8 + e.phase) % 2;
            // rainbow trail out of her behind, on the side she's flying away from
            const back = e.vx > 0 ? -1 : 1;
            for (let i = 0; i < 6; i++) {
              ctx.fillStyle = RAINBOW_STRIPES[i];
              const wave = Math.round(Math.sin(s.t * 6 + i * 0.3) * 1);
              ctx.fillRect(back > 0 ? x + 12 : x - 14, e.y + 8 + i + wave, 20, 1);
            }
            drawPixels(ctx, FAIRY[frame], x, e.y, FAIRY_COLORS, 2);
          } else {
            ctx.fillStyle = "#9646dc";
            ctx.fillRect(x + 2, e.y + 10, 14, 3);
          }
        } else if (e.alive) {
          const bob = Math.floor(s.t * 6 + e.x) % 2;
          drawPixels(ctx, BUNNY, x, e.y - bob, BUNNY_COLORS, 2);
        } else {
          ctx.fillStyle = "#fff0f8";
          ctx.fillRect(x, e.y + 10, 14, 4);
        }
        continue;
      }
      if (e.kind === "flyer") {
        if (e.alive) {
          const frame = Math.abs(Math.floor(s.t * 8 + e.phase) % 2) || 0;
          drawPixels(ctx, FLYER[frame], x, e.y, ez === F_PSP ? PSP_FLYER_COLORS : { G: LIGHT_GREEN, D: DARK_GREEN, W: "#ffffff" }, 2);
        } else {
          ctx.fillStyle = LIGHT_GREEN;
          ctx.fillRect(x + 2, e.y + 10, 14, 3);
        }
      } else if (e.alive) {
        const bob = Math.floor(s.t * 6 + e.x) % 2;
        drawPixels(ctx, HATER, x, e.y - bob, ez === F_PSP ? PSP_WALKER_COLORS : { G: "#8a8a8a", K: INK, W: "#ffffff" }, 2);
      } else {
        ctx.fillStyle = "#8a8a8a";
        ctx.fillRect(x, e.y + 10, 14, 4);
      }
    }

    // The troll (or the bigger giant), with wiggly green stink lines around him
    if (s.boss) {
      const b = s.boss;
      const isGiant = b.kind === "giant";
      const bw = isGiant ? GIANT_W : TR_W;
      const scale = isGiant ? GIANT_SCALE : 2;
      const bx = Math.round(b.x - cam);
      const walking = Math.abs(b.vx) > 5 && b.vy === 0;
      const by = Math.round(b.y) - (walking && Math.floor(s.t * 6) % 2 === 0 ? 1 : 0);
      for (let k = 0; k < (isGiant ? 6 : 4); k++) {
        const lx = bx + 2 + k * (isGiant ? 16 : 13);
        const rise = (s.t * 14 + k * 5) % 10;
        for (let j = 0; j < 7; j++) {
          ctx.fillStyle = isGiant ? (j % 2 === 0 ? "#c68bff" : "#6a2a9a") : j % 2 === 0 ? "#7fc24a" : "#4e8f2a";
          ctx.fillRect(Math.round(lx + Math.sin(s.t * 7 + j * 0.9 + k) * 2), Math.round(by + 4 - rise - j * 2), 1, 2);
        }
      }
      const flash =
        (b.hit > 0 && Math.floor(s.t * 20) % 2 === 0) ||
        (b.dead > 0 && Math.floor(s.t * 14) % 2 === 0) ||
        (b.dazed > 0 && Math.floor(s.t * 10) % 2 === 0);
      const look = isGiant ? GIANT_COLORS : TROLL_COLORS; // the giant is purple
      const colors = flash ? Object.fromEntries(Object.keys(look).map((k) => [k, "#ffffff"])) : look;
      const hornsUp = isGiant ? GIANT_HORN_ROWS * scale : 0; // his horns stick out above his head
      if (isGiant) drawPixels(ctx, b.facing > 0 ? GIANT_ROWS_RIGHT : GIANT_ROWS, bx, by - hornsUp, colors, scale);
      else drawPixels(ctx, b.facing > 0 ? TROLL_RIGHT : TROLL, bx, by, colors, scale);
      // little health bar over his head
      if (b.dead <= 0 && b.dazed <= 0) {
        const barW = isGiant ? 46 : 30;
        ctx.fillStyle = INK;
        ctx.fillRect(bx + (isGiant ? 9 : 6), by - 7 - hornsUp, barW + 2, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(bx + (isGiant ? 10 : 7), by - 6 - hornsUp, barW, 2);
        ctx.fillStyle = LIGHT_GREEN;
        ctx.fillRect(bx + (isGiant ? 10 : 7), by - 6 - hornsUp, Math.round((barW * Math.max(0, b.hp)) / b.maxHp), 2);
      }
      // a drip hanging off his tongue now and then
      if (!flash && b.dazed <= 0 && Math.floor(s.t * 3) % 2 === 0) {
        ctx.fillStyle = look.T;
        const tx = b.facing > 0 ? bx + bw - 12 : bx + 6;
        ctx.fillRect(tx, by + (isGiant ? 39 : 26), 6, 2);
      }
    }

    // On the outfit-select screen, dim everything drawn so far (background, ground, jetpack
    // sign, etc.) so the big character preview below stands out against it
    if (s.mode === "select") {
      ctx.fillStyle = "rgba(10, 6, 14, 0.55)";
      ctx.fillRect(-4, -4, W + 8, H + 8);
    }

    // Bubbles (coral field)
    for (const b of s.bubbles) {
      const bx = Math.round(b.x - cam);
      const by = Math.round(b.y);
      ctx.strokeStyle = "#e8fbff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx + 0.5, by + 0.5, b.r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(bx - 1, by - 1, 1, 1);
    }

    // Drone lasers (red, like the ice shot)
    for (const l of s.lasers) {
      const lx = Math.round(l.x - cam);
      const ly = Math.round(l.y);
      ctx.fillStyle = "#96001e";
      ctx.fillRect(lx - 1, ly - 1, 14, 5);
      ctx.fillStyle = "#ff2a3a";
      ctx.fillRect(lx, ly, 12, 3);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(l.vx > 0 ? lx + 9 : lx + 1, ly + 1, 2, 1);
      ctx.fillStyle = "rgba(255, 60, 80, 0.5)";
      ctx.fillRect(l.vx > 0 ? lx - 8 : lx + 13, ly + 1, 7, 1);
    }

    // Bong smoke
    for (const m of s.smoke) {
      ctx.fillStyle = `rgba(245, 245, 250, ${Math.min(0.85, m.life / 2)})`;
      ctx.beginPath();
      ctx.arc(Math.round(m.x - cam), Math.round(m.y), m.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // The evil weed leaf (Level 1 boss), with a little health bar over it
    if (s.lboss && s.lboss.kind === "snowman") {
      const lb = s.lboss;
      const lx = Math.round(lb.x - cam);
      const walking = Math.abs(lb.vx) > 5 && lb.vy === 0;
      const ly = Math.round(lb.y) - (walking && Math.floor(s.t * 6) % 2 === 0 ? 1 : 0) + (lb.dazed > 0 ? 2 : 0);
      const flash = (lb.hit > 0 && Math.floor(s.t * 20) % 2 === 0) || (lb.dead > 0 && Math.floor(s.t * 14) % 2 === 0);
      const colors = flash ? whiteOf(EVIL_SNOWMAN_COLORS) : EVIL_SNOWMAN_COLORS; // (cached: no new objects every frame)
      const rows = lb.facing > 0 ? flipRows(EVIL_SNOWMAN) : EVIL_SNOWMAN;
      drawPixels(ctx, rows, lx, ly, colors, 2);
      if (lb.dazed > 0) {
        // dizzy stars circling his hat
        for (let k = 0; k < 3; k++) {
          const a = s.t * 5 + (k * Math.PI * 2) / 3;
          ctx.fillStyle = k % 2 ? "#ffe27a" : "#ffffff";
          ctx.fillRect(Math.round(lx + SN_W / 2 + Math.cos(a) * 14), Math.round(ly + 2 + Math.sin(a) * 4), 3, 3);
        }
      } else if (lb.dead <= 0) {
        ctx.fillStyle = INK;
        ctx.fillRect(lx + 6, ly - 7, 32, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(lx + 7, ly - 6, 30, 2);
        ctx.fillStyle = "#ff283c";
        ctx.fillRect(lx + 7, ly - 6, Math.round((30 * Math.max(0, lb.hp)) / lb.maxHp), 2);
      }
      // speech bubble when the fight starts
      if (lb.speech > 0 && s.mode === "running") {
        const text = "GIVE ME ALL YOUR WEED!";
        ctx.font = `8px ${fontFamily}`;
        ctx.textBaseline = "top";
        ctx.textAlign = "center";
        const tw = ctx.measureText(text).width + 8;
        const bx = Math.max(4, Math.min(W - tw - 4, lx + SN_W / 2 - tw / 2));
        const by = Math.max(24, ly - 26);
        ctx.fillStyle = INK;
        ctx.fillRect(bx - 1, by - 1, tw + 2, 14);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(bx, by, tw, 12);
        ctx.fillStyle = INK;
        ctx.fillRect(Math.round(lx + SN_W / 2) - 2, by + 13, 4, 2);
        ctx.fillRect(Math.round(lx + SN_W / 2) - 1, by + 15, 2, 2);
        ctx.fillText(text, bx + tw / 2, by + 2);
      }
    } else if (s.lboss) {
      const lb = s.lboss;
      const lx = Math.round(lb.x - cam);
      const ly = Math.round(lb.y + (lb.dive > 0 ? 0 : Math.sin(s.t * 6) * 1));
      const flash = (lb.hit > 0 && Math.floor(s.t * 20) % 2 === 0) || (lb.dead > 0 && Math.floor(s.t * 14) % 2 === 0);
      const colors = flash ? { K: "#ffffff", G: "#ffffff", g: "#ffffff", R: "#ffffff", W: "#ffffff" } : EVIL_COLORS;
      // dark aura
      ctx.fillStyle = "rgba(60, 0, 80, 0.25)";
      ctx.beginPath();
      ctx.arc(lx + EL_W / 2, ly + EL_H / 2, EL_W / 2 + 4 + Math.sin(s.t * 4) * 2, 0, Math.PI * 2);
      ctx.fill();
      drawPixels(ctx, EVIL_LEAF, lx, ly, colors, 2);
      if (lb.dead <= 0) {
        ctx.fillStyle = INK;
        ctx.fillRect(lx + 5, ly - 7, 32, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(lx + 6, ly - 6, 30, 2);
        ctx.fillStyle = "#ff283c";
        ctx.fillRect(lx + 6, ly - 6, Math.round((30 * Math.max(0, lb.hp)) / lb.maxHp), 2);
      }
    }

    // ?hitboxes=1 (for testing): RED = touching this hurts you, GREEN = coming down on this counts as a stomp, BLUE = you
    if (hitboxesRef.current) {
      ctx.lineWidth = 1;
      for (const e of s.enemies) {
        if (!e.alive || e.kind === "bong") continue;
        const ew = e.kind === "flyer" ? 18 : 14;
        const ex = Math.round(e.x - cam);
        ctx.strokeStyle = "rgba(60, 255, 90, 0.95)"; // the stomp zone: from a little above it down to where your feet can still be
        ctx.strokeRect(ex + 0.5, Math.round(e.y) - 6 + 0.5, ew, 16);
        ctx.strokeStyle = "rgba(255, 50, 50, 0.95)"; // the part that hurts
        ctx.strokeRect(ex + 2 + 0.5, Math.round(e.y) + 2 + 0.5, ew - 4, 10);
      }
      ctx.strokeStyle = "rgba(70, 170, 255, 0.95)";
      ctx.strokeRect(Math.round(s.x + HB_X - cam) + 0.5, Math.round(s.y + HB_Y) + 0.5, HB_W, HB_H);
    }
    // the evil snowman's ice spikes: they form on the ceiling (glittering, a faint line shows where they'll land), then drop
    for (const ic of s.icicles) {
      const ix = Math.round(ic.x - cam);
      const len = Math.max(2, Math.round(ic.len));
      const jit = ic.act === "grow" ? Math.round(Math.sin(s.t * 40 + ic.x) * Math.max(0, ic.grow / ICICLE_GROW)) : 0;
      if (ic.act === "grow" && ic.grow > 0) {
        ctx.fillStyle = "#cfeaff"; // frost on the ceiling where it's forming
        ctx.fillRect(ix - 6, 0, 12, 2);
        if (ic.grow > ICICLE_GROW * 0.45) {
          ctx.fillStyle = "rgba(190, 230, 255, 0.35)"; // the warning: where it will land
          for (let yy = len + 6; yy < 8 * T; yy += 6) ctx.fillRect(ix, yy, 1, 3);
        }
      }
      for (let r = 0; r < len; r++) {
        const wdt = Math.max(1, Math.round(8 * (1 - r / ICICLE_LEN)));
        const rx = Math.round(ix - wdt / 2) + jit;
        ctx.fillStyle = INK;
        ctx.fillRect(rx - 1, Math.round(ic.y) + r, wdt + 2, 1);
        ctx.fillStyle = r % 6 < 2 ? "#ffffff" : "#bfe6ff";
        ctx.fillRect(rx, Math.round(ic.y) + r, wdt, 1);
        if (wdt > 2) {
          ctx.fillStyle = "#7fc3f0";
          ctx.fillRect(rx + wdt - 1, Math.round(ic.y) + r, 1, 1);
        }
      }
      if (ic.act === "grow" && Math.floor(s.t * 14 + ic.x) % 3 === 0) {
        ctx.fillStyle = "#ffffff"; // a glint at the tip
        ctx.fillRect(ix - 1 + jit, Math.round(ic.y) + len, 3, 1);
        ctx.fillRect(ix + jit, Math.round(ic.y) + len - 1, 1, 3);
      }
    }
    // the crypt's wall torches
    for (const tc of s.torches) {
      const tx = Math.round(tc.x - cam);
      if (tx < -20 || tx > W + 20) continue;
      ctx.fillStyle = INK;
      ctx.fillRect(tx + 4, tc.y + 8, 4, 8); // the bracket
      ctx.fillRect(tx + 2, tc.y + 6, 8, 3);
      ctx.fillStyle = "#6b5a4a";
      ctx.fillRect(tx + 5, tc.y + 9, 2, 6);
      if (tc.lit) {
        const fl = Math.floor(s.t * 10 + tc.x) % 3;
        ctx.fillStyle = "#ff8c1e";
        ctx.fillRect(tx + 3, tc.y - 2 - fl, 6, 8 + fl);
        ctx.fillStyle = "#ffd23c";
        ctx.fillRect(tx + 4, tc.y - fl, 4, 6 + fl);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(tx + 5, tc.y + 2, 2, 3);
      } else if (Math.floor(s.t * 1.5 + tc.x) % 3 !== 0) {
        ctx.fillStyle = "#7a2a10"; // a dying ember
        ctx.fillRect(tx + 5, tc.y + 4, 2, 2);
      }
    }
    // the stone statues that wake up before the Warlord
    for (const st of s.statues) {
      const sx = Math.round(st.x - cam);
      if (sx < -40 || sx > W + 40) continue;
      const shake = st.act === "wind" ? Math.round(Math.sin(s.t * 50)) : 0;
      drawPixels(ctx, KN_SKEL[0], sx - 14 + shake, 8 * T - 58 + (st.act === "slam" ? 2 : 0), STATUE_COLORS, 2);
      if (st.act === "wind") {
        ctx.fillStyle = "#ff2a2a";
        ctx.fillRect(sx + 12, 8 * T - 72, 3, 7);
        ctx.fillRect(sx + 12, 8 * T - 63, 3, 3);
      }
    }
    // the Warlord's pillars (phase 2): stand behind one and his eye waves can't touch you
    for (const c of s.cover) {
      const px = Math.round(c.x - cam);
      const hh = Math.round(56 * c.rise);
      ctx.fillStyle = INK;
      ctx.fillRect(px - 1, 8 * T - hh - 1, 20, hh + 1);
      ctx.fillStyle = "#8a909c";
      ctx.fillRect(px, 8 * T - hh, 18, hh);
      ctx.fillStyle = "#b9bfca";
      ctx.fillRect(px + 2, 8 * T - hh, 4, hh);
      ctx.fillStyle = "#5d626d";
      ctx.fillRect(px + 13, 8 * T - hh, 5, hh);
      if (hh > 8) ctx.fillRect(px, 8 * T - hh, 18, 4);
    }
    // LEVEL 3 knights
    const kd = s.kboss;
    if (kd) {
      const d = KN_DIM[kd.kind];
      const flash = (kd.hit > 0 && Math.floor(s.t * 20) % 2 === 0) || (kd.dead > 0 && Math.floor(s.t * 14) % 2 === 0);
      const walking = Math.abs(kd.vx) > 5 && kd.vy === 0 && kd.act !== "stagger";
      const bob = walking && Math.floor(s.t * 6) % 2 === 0 ? 1 : 0;
      const jitter = kd.act === "stagger" || (kd.kind === "skeleton" && kd.act === "wind") ? Math.round(Math.sin(s.t * 60)) : 0;
      const kx = Math.round(kd.x - cam) + jitter;
      const ky = Math.round(kd.y) - bob;
      const left = kd.facing < 0;
      if (kd.kind === "horned") {
        if (kd.dead <= 0 && kd.hp <= kd.maxHp - HORNED_AMMO) {
          // raging: a red glow around him
          ctx.fillStyle = `rgba(255, 40, 40, ${0.25 + Math.sin(s.t * 12) * 0.1})`;
          ctx.beginPath();
          ctx.ellipse(kx + d.w / 2, ky + d.h / 2 + 2, d.w / 2 + 6, d.h / 2 + 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const rows = left ? KN_HORNED : flipRows(KN_HORNED);
        drawPixels(ctx, rows, kx, ky, flash ? whiteOf(KN_HORNED_COLORS) : KN_HORNED_COLORS, 2);
        if (kd.dead <= 0) {
          // chain + the spiked ball with its wiggling tendrils
          const h = hornedHand(kd);
          const m = maceBall(kd);
          for (let k = 1; k < 6; k++) {
            const cx = Math.round(h.x + ((m.x - h.x) * k) / 6 - cam);
            const cy = Math.round(h.y + ((m.y - h.y) * k) / 6);
            ctx.fillStyle = "#0c0c10";
            ctx.fillRect(cx - 2, cy - 2, 4, 4);
            ctx.fillStyle = "#a8b0bd";
            ctx.fillRect(cx - 1, cy - 1, 2, 2);
          }
          const fr = KN_MACE[Math.floor(s.t * 10) % KN_MACE.length];
          drawPixels(ctx, fr, Math.round(m.x - cam) - 27, Math.round(m.y) - 29, KN_MACE_COLORS, 2);
        }
      } else if (kd.kind === "skeleton") {
        const fr = KN_SKEL[Math.floor(s.t * 10) % KN_SKEL.length];
        const skelColors = s.levelMode ? KN_SKEL_COLORS : KN_SKEL_RUN_COLORS; // red in the infinite run
        drawPixels(ctx, left ? fr : flipRows(fr), kx, ky, flash ? whiteOf(skelColors) : skelColors, 2);
        if (kd.dead <= 0 && kd.act === "wind") {
          // a red "!" over his head: he's about to swing
          ctx.fillStyle = "#ff2a2a";
          ctx.fillRect(kx + d.w / 2 - 1, ky - 6, 3, 7);
          ctx.fillRect(kx + d.w / 2 - 1, ky + 3, 3, 3);
        }
        if (kd.dead <= 0 && kd.act === "swing") {
          // the slash
          const r = skeletonSwordBox(kd);
          const cx = (left ? r.x2 : r.x1) - cam;
          ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          if (left) ctx.arc(cx, ky + 34, skeletonReach() - 6, Math.PI * 0.68, Math.PI * 1.32);
          else ctx.arc(cx, ky + 34, skeletonReach() - 6, -Math.PI * 0.32, Math.PI * 0.32);
          ctx.stroke();
        }
      } else {
        const angry = kd.hp <= Math.ceil(kd.maxHp / 2);
        const rows = WARLORD_ROWS[angry ? 1 : 0];
        drawPixels(ctx, left ? rows : flipRows(rows), kx, ky, flash ? whiteOf(WARLORD_ROW_COLORS) : WARLORD_ROW_COLORS, 3);
        // shield on his front arm
        const shx = left ? kx + 12 : kx + d.w - 12 - 30;
        drawPixels(ctx, left ? WL_SHIELD : flipRows(WL_SHIELD), shx, ky + 50, flash ? whiteOf(WL_SHIELD_COLORS) : WL_SHIELD_COLORS, 3);
        if (kd.dead <= 0) {
          // swoosh behind the blade while it comes down
          const p = warlordPivot(kd);
          const px = Math.round(p.x - cam) + jitter;
          const py = Math.round(p.y) - bob;
          if (kd.act === "swing") {
            const a0 = swordAngle(kd, SW_BACK);
            const a1 = swordAngle(kd);
            ctx.strokeStyle = "rgba(255, 220, 220, 0.4)";
            ctx.lineWidth = 6;
            ctx.beginPath();
            if (left) ctx.arc(px, py, SW_GRIP * 2 - 10, a1, a0);
            else ctx.arc(px, py, SW_GRIP * 2 - 10, a0, a1);
            ctx.stroke();
          }
          // the giant sword
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(swordAngle(kd) + Math.PI / 2);
          drawPixels(ctx, WL_SWORD, -7, -SW_GRIP * 2, flash ? whiteOf(WL_SWORD_COLORS) : WL_SWORD_COLORS, 2);
          ctx.restore();
          // eyes charging up before the sound-wave blast
          if (kd.act === "beam") {
            const e = warlordEye(kd);
            const ex = Math.round(e.x - cam) + jitter;
            const ey = Math.round(e.y) - bob;
            const r = 2 + Math.round(Math.max(0, 0.6 - kd.timer) * 10);
            ctx.fillStyle = Math.floor(s.t * 20) % 2 === 0 ? "#ff2a2a" : "#ffffff";
            ctx.fillRect(ex - 8 - r, ey - Math.ceil(r / 2), 16 + r * 2, r);
          }
        }
      }
      // small health bar over the horned warrior and the skeleton knight
      if (kd.dead <= 0 && kd.kind !== "warlord") {
        const b = knightBox(kd);
        const bw = 30;
        const hbx = Math.round((b.x1 + b.x2) / 2 - cam - bw / 2) + jitter;
        const hby = ky + (kd.kind === "horned" ? -6 : 2);
        ctx.fillStyle = INK;
        ctx.fillRect(hbx - 1, hby - 1, bw + 2, 4);
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(hbx, hby, bw, 2);
        ctx.fillStyle = "#ff283c";
        ctx.fillRect(hbx, hby, Math.round((bw * Math.max(0, kd.hp)) / kd.maxHp), 2);
      }
    }
    // LEVEL 4: TOMBFELL, his doves, his cats and the giant bear
    const td = s.tboss;
    if (td) {
      const tFloor = 8 * T;
      const gi = Math.floor(s.t * 8);
      const white = td.hit > 0 && td.dead <= 0 && Math.floor(s.t * 20) % 2 === 0;
      // his robe: the G / g pixels run through the glitch colours
      const wizColors: Record<string, string> = white
        ? whiteOf(TOMB_WIZ_COLORS)
        : { ...TOMB_WIZ_COLORS, G: GLITCH[gi % GLITCH.length], g: GLITCH[(gi + 2) % GLITCH.length], o: GLITCH[(gi + 4) % GLITCH.length] };
      const wx = Math.round(td.x - cam);
      const wy = Math.round(td.y);
      const wizRows = td.facing < 0 ? TOMB_WIZ : flipRows(TOMB_WIZ);
      const stars = (cx: number, cy: number) => {
        // dizzy: little stars going round his head
        for (let k = 0; k < 3; k++) {
          const a = s.t * 6 + k * 2.09;
          ctx.fillStyle = k === 1 ? "#ffffff" : "#ffe14a";
          ctx.fillRect(Math.round(cx + Math.cos(a) * 11), Math.round(cy + Math.sin(a) * 3), 2, 2);
        }
      };
      const drawWizard = () => {
        if (td.dead > 0) {
          // glitching away: every line of him slides sideways, and more and more lines drop out
          for (let r = 0; r < wizRows.length; r++) {
            if (Math.random() > td.dead / 2) continue;
            drawPixels(ctx, [wizRows[r]], wx + Math.round(rand(-7, 7)), wy + r * 2, wizColors, 2);
          }
          return;
        }
        drawPixels(ctx, wizRows, wx + (td.fallen ? Math.round(Math.sin(s.t * 14) * 1.5) : 0), wy, wizColors, 2);
        if (td.fallen) stars(wx + TOMB_W / 2, wy - 2);
        else {
          // his spell shield
          ctx.strokeStyle = GLITCH[gi % GLITCH.length];
          ctx.globalAlpha = 0.5 + Math.sin(s.t * 6) * 0.2;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(wx + TOMB_W / 2, wy + TOMB_H / 2 + 1, TOMB_W / 2 + 5, TOMB_H / 2 + 5, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
      };
      const br = td.bear;
      const drawBear = () => {
        if (!br) return;
        const shake = br.act === "paw" ? Math.round(Math.sin(s.t * 50) * 1.5) : 0;
        const fr = BEAR[br.act === "charge" || br.act === "enter" ? Math.floor(s.t * 10) % 2 : 0];
        const bx = Math.round(br.x - cam) + shake;
        const by = tFloor - GBEAR_H + (br.act === "dizzy" ? 1 : 0);
        drawRimmed(ctx, br.dir < 0 ? fr : flipRows(fr), bx, by, br.act === "dizzy" ? BEAR_COLORS : BEAR_ANGRY_COLORS, 4);
        const headX = br.dir < 0 ? bx + 8 : bx + GBEAR_W - 8;
        if (br.act === "dizzy") stars(headX, by - 2);
        if (br.act === "paw" && Math.floor(s.t * 8) % 2 === 0) {
          // a red "!": it's about to run
          ctx.fillStyle = "#ff2a2a";
          ctx.fillRect(headX - 1, by - 16, 3, 8);
          ctx.fillRect(headX - 1, by - 6, 3, 3);
        }
      };
      if (td.part === 3 && !td.fallen) {
        drawWizard(); // sitting on the bear: the bear is drawn over his legs
        drawBear();
      } else {
        drawBear();
        drawWizard();
      }
      for (const d of td.doves) {
        if (d.state === "gone") continue;
        if (d.wait > 0) {
          // the warning: a "!" blinks at the edge where it's about to come in
          if (Math.floor(s.t * 10) % 2 === 0) {
            const ex = d.from > 0 ? W - 9 : 6;
            ctx.fillStyle = INK;
            ctx.fillRect(ex - 1, Math.round(d.y) - 1, 5, 13);
            ctx.fillStyle = d.pink ? "#ff7ad9" : "#ffffff";
            ctx.fillRect(ex, Math.round(d.y), 3, 6);
            ctx.fillRect(ex, Math.round(d.y) + 8, 3, 3);
          }
          continue;
        }
        const fr = DOVE[Math.floor(s.t * 10 + d.y) % 2];
        const dx = Math.round(d.x - cam) - 2;
        const dy = Math.round(d.y) - 5;
        if (d.pink) {
          // the pink one glows
          ctx.fillStyle = `rgba(255, 79, 216, ${0.28 + Math.sin(s.t * 10) * 0.12})`;
          ctx.beginPath();
          ctx.arc(dx + 11, dy + 9, 13, 0, Math.PI * 2);
          ctx.fill();
        }
        drawPixels(ctx, d.vx < 0 ? fr : flipRows(fr), dx, dy, d.pink ? DOVE_PINK_COLORS : DOVE_COLORS, 2);
      }
      for (const c of td.cats) {
        if (c.act === "gone") continue;
        const cx = Math.round(c.x - cam) - 4;
        const cy = Math.round(c.y) - 2;
        if (c.act === "ball" || c.act === "roll") {
          if (c.act === "ball" && c.timer < 2 && Math.floor(s.t * 10) % 2 === 0) continue; // about to wake up and leave
          drawRimmed(ctx, c.act === "roll" && Math.floor(s.t * 14) % 2 === 0 ? flipRows(CAT[3]) : CAT[3], cx, cy, CAT_COLORS, 2);
          continue;
        }
        if (c.act === "drop") {
          // its shadow, where it's going to land
          ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
          ctx.fillRect(cx + 3, tFloor - 2, 16, 2);
        }
        const fr = c.act === "crouch" ? CAT[2] : c.act === "walk" ? CAT[Math.floor(s.t * 8) % 2] : CAT[1];
        drawRimmed(ctx, c.dir < 0 ? fr : flipRows(fr), cx, cy, CAT_COLORS, 2);
      }
    }
    // WARLORD's sound waves (wiggly red frequencies)
    for (const w of s.kshots) {
      const a = Math.atan2(w.vy, w.vx);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let i = -7; i <= 7; i++) {
        const off = Math.sin(i * 0.9 + s.t * 25) * 3;
        ctx.fillStyle = Math.abs(i) < 5 ? "#ff2a2a" : "#ff8fa0";
        ctx.fillRect(Math.round(w.x - cam + ca * i - sa * off) - 1, Math.round(w.y + sa * i + ca * off) - 1, 2, 2);
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(Math.round(w.x - cam) - 1, Math.round(w.y) - 1, 2, 2);
    }
    // shockwaves
    for (const w of s.kwaves) {
      const wx = Math.round(w.x - cam);
      const red = Math.floor(s.t * 20) % 2 === 0;
      ctx.fillStyle = red ? "#ff2a2a" : "#ffffff";
      ctx.fillRect(wx - 4, 8 * T - 9, 8, 9);
      ctx.fillStyle = red ? "#ffffff" : "#ff2a2a";
      ctx.fillRect(wx - 2, 8 * T - 13, 4, 4);
      ctx.fillStyle = "rgba(255, 42, 42, 0.5)";
      ctx.fillRect(wx - 4 - w.dir * 8, 8 * T - 5, 8, 5);
    }

    // You
    const blinking = s.invuln > 0 && Math.floor(s.t * 12) % 2 === 0;
    const showYou = ["select", "ready", "running", "pipe", "golden", "choose", "paused", "spin", "wax"].includes(s.mode) && !s.waxHide;
    if (s.pet && s.mode !== "select" && !s.waxHide) drawPet(ctx, cam); // BOBO, just behind you
    if (showYou && !blinking) {
      const previewOutfit = s.mode === "select" ? OUTFITS[s.selectIndex].id : s.outfit;
      const levelOutfit = s.levelMode ? LEVELS[s.level - 1]?.outfit : undefined;
      const levelSprite = levelOutfit ? levelSpritesRef.current[levelOutfit] : undefined;
      const sprite =
        s.mode !== "select" && levelSprite && levelSprite.complete && levelSprite.naturalWidth > 0
          ? levelSprite
          : spritesRef.current[previewOutfit];
      // Frames: 0 and 1 = walking. Sheets with a 3rd frame (72px wide) use it for standing still
      // (classic + trippy: he raises the joint to his mouth and smoke curls up).
      const hasIdle = !!sprite && sprite.naturalWidth >= SPRITE_W * 3;
      const walking = s.onGround && Math.abs(s.vx) > 5;
      const frame = walking ? Math.floor(s.runAnim * 10) % 2 : hasIdle && (s.onGround || s.mode === "select") ? 2 : 0;

      if (s.mode === "select") {
        // Big centered portrait, so it's obviously the whole point of this screen
        const scale = 2.4;
        const bigW = SPRITE_W * scale;
        const bigH = SPRITE_H * scale;
        const bx = Math.round(W / 2 - bigW / 2);
        const by = 32;
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, bx, by, bigW, bigH);
        } else {
          ctx.fillStyle = OUTFIT_FALLBACK[previewOutfit];
          ctx.fillRect(bx + HB_X * scale, by + HB_Y * scale, HB_W * scale, HB_H * scale);
        }
      } else {
        const x = Math.round(s.x - cam);
        const y = Math.round(s.y);
        ctx.save();
        if (s.mode === "pipe") {
          // Only draw the part above the pipe while sinking in
          const c = colAt(s.pipeCol);
          ctx.beginPath();
          ctx.rect(0, -2000, W, 2000 + c.ground * T); // (everything above the pipe's mouth, however high up it is)
          ctx.clip();
        }
        // Jetpack on your back
        if (s.jetpack || s.sipFuel > 0) {
          const bx = s.facing > 0 ? x + 2 : x + SPRITE_W - 7;
          const by = y + 13;
          drawPixels(ctx, JET_SMALL, bx, by, { K: INK, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 1);
          if (s.flying && Math.floor(s.t * 20) % 2 === 0) {
            drawPixels(ctx, JET_SMALL_FLAME, bx, by + 8, { O: "#ff7a00", Y: "#ffc800" }, 1);
          }
        }
        if (sprite && sprite.complete && sprite.naturalWidth > 0) {
          if (s.facing < 0) {
            ctx.translate(x + SPRITE_W, y);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, 0, 0, SPRITE_W, SPRITE_H);
          } else {
            ctx.drawImage(sprite, frame * SPRITE_W, 0, SPRITE_W, SPRITE_H, x, y, SPRITE_W, SPRITE_H);
          }
        } else {
          ctx.fillStyle = OUTFIT_FALLBACK[previewOutfit];
          ctx.fillRect(x + HB_X, y + HB_Y, HB_W, HB_H);
        }
        ctx.restore();
        // IPOD USER FIELD: white earbuds, the wire running down into a little player in his pocket
        if (!s.inBonus && colAt(Math.floor((s.x + SPRITE_W / 2) / T)).zone === F_IPOD) {
          const px = (n: number) => (s.facing > 0 ? x + n : x + SPRITE_W - 1 - n);
          const sway = Math.round(Math.sin(s.t * 5) * 0.6);
          ctx.fillStyle = INK;
          ctx.fillRect(Math.min(px(7), px(9)), y + 11, 3, 3);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(Math.min(px(8), px(9)), y + 12, 2, 2);
          // the wire
          const wire: [number, number][] = [[9, 14], [9, 15], [10, 16], [10, 17], [10 + sway, 18], [10 + sway, 19], [9, 20], [9, 21]];
          for (const [wx, wy] of wire) ctx.fillRect(px(wx), y + wy, 1, 1);
          // the little player in his pocket
          ctx.fillStyle = INK;
          ctx.fillRect(Math.min(px(8), px(10)), y + 22, 3, 4);
          ctx.fillStyle = "#f7f7fb";
          ctx.fillRect(Math.min(px(8), px(10)), y + 22, 3, 3);
          ctx.fillStyle = "#9fd4ff";
          ctx.fillRect(Math.min(px(8), px(10)) + 1, y + 22, 1, 1);
        }
      }
    }

    // SHIELD prize: the bubble around you while it can still take a hit
    if (s.shield > 0 && showYou && s.mode !== "select") drawShieldBubble(ctx, Math.round(s.x - cam), Math.round(s.y));

    for (const p of s.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cam), Math.round(p.y), 2, 2);
    }

    ctx.restore();

    // LEVEL 4: the world is being "repainted" (TOMBFELL just got hit): strips of the picture slide
    // sideways and colour bars flash over it
    if (s.woodsGlitch > 0) {
      for (let k = 0; k < 7; k++) {
        const gy = Math.floor(Math.random() * 16) * 8;
        const gh = 4 + Math.floor(Math.random() * 3) * 4;
        ctx.drawImage(ctx.canvas, 0, gy, W, gh, Math.round(rand(-24, 24)), gy, W, gh);
        if (k < 3) {
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = GLITCH[Math.floor(Math.random() * GLITCH.length)];
          ctx.fillRect(0, gy, W, 2 + k);
          ctx.globalAlpha = 1;
        }
      }
    }

    // The wax afterglow (off by default, see WAX_AFTERGLOW): the colours slowly breathe brighter, then darker
    if (WAX_AFTERGLOW && s.wax && !s.levelMode && s.mode !== "select") {
      const breath = Math.sin(((s.t - s.waxAt) * Math.PI * 2) / WAX_PULSE_SECONDS);
      ctx.save();
      if (breath > 0) {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = `rgba(255, 150, 230, ${(WAX_PULSE_BRIGHT * breath).toFixed(3)})`;
      } else {
        ctx.globalCompositeOperation = "multiply";
        ctx.fillStyle = `rgba(60, 20, 90, ${(WAX_PULSE_DARK * -breath).toFixed(3)})`;
      }
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // The blizzard: a cold haze and snow falling over the whole screen
    if (s.blizzard > 0.02 && !s.waxHide) {
      ctx.fillStyle = `rgba(190, 220, 255, ${(0.13 * s.blizzard).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
      for (const fl of s.flakes) {
        ctx.fillStyle = fl.big ? "#ffffff" : "rgba(255, 255, 255, 0.8)";
        const sz = fl.big ? 3 : 2;
        ctx.fillRect(Math.round(fl.x), Math.round(fl.y), sz, sz);
      }
    }
    // The crypt is dark: a circle of light around you and around each lit torch, everything else dimmed (in little blocks)
    if (s.dark > 0.02 && s.levelMode && !s.waxHide) {
      const lights: [number, number, number][] = [[s.x - cam + SPRITE_W / 2, s.y - s.camY + SPRITE_H / 2, PLAYER_LIGHT]];
      for (const tc of s.torches) lights.push([tc.x - cam + 6, tc.y - s.camY + 8, tc.lit ? TORCH_LIGHT : TORCH_EMBER]);
      const CELL = 6;
      for (let cy = 0; cy < H; cy += CELL) {
        for (let cx = 0; cx < W; cx += CELL) {
          let best = 0;
          for (const [lx, ly, lr] of lights) {
            const d = Math.hypot(cx + CELL / 2 - lx, cy + CELL / 2 - ly);
            if (d < lr) best = Math.max(best, 1 - d / lr);
          }
          const k = best * best * (3 - 2 * best);
          const a = DARK_MAX * s.dark * (1 - k);
          if (a > 0.02) {
            ctx.fillStyle = `rgba(8, 4, 24, ${a.toFixed(3)})`;
            ctx.fillRect(cx, cy, CELL, CELL);
          }
        }
      }
    }
    // Point popups
    ctx.font = `8px ${fontFamily}`;
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    for (const p of s.popups) {
      ctx.fillStyle = INK;
      ctx.fillText(p.text, Math.round(p.x - cam) + 1, Math.round(p.y - s.camY) + 1);
      ctx.fillStyle = p.text.startsWith("+1") ? PINK : "#ffc800";
      ctx.fillText(p.text, Math.round(p.x - cam), Math.round(p.y - s.camY));
    }

    // HUD (score, lives, powers) — none of it means anything yet on the outfit-select
    // screen, so it stays hidden there and the screen is just the character picker
    const hudInk = viewZone === VOID_ZONE ? (VOID_PALETTES[s.voidPal] || VOID_PALETTES[0]).ink : viewZone === LEVEL_KEEP || viewZone === LEVEL_WOODS ? "#f0e6ea" : INK;
    if (s.mode !== "select") {
    drawSfxIcon(ctx, hudInk);
    drawSfxSlider(ctx, hudInk);
    ctx.fillStyle = hudInk;
    ctx.textAlign = "left";
    ctx.fillText(s.levelMode ? fmtTime(s.levelTime * 1000) : pad(s.score), 22, 6);
    ctx.textAlign = "right";
    if (s.levelMode) {
      const best = s.levelBest[String(s.level)];
      ctx.fillText(best ? `BEST ${fmtTime(best)}` : `LVL ${s.level}`, W - 6, 6);
    } else {
      ctx.fillText(`HI ${pad(s.best)}`, W - 6, 6);
    }
    // gold coins you have
    ctx.fillStyle = "#6b4a00";
    ctx.fillRect(W - 45, 16, 8, 8);
    ctx.fillStyle = "#ffd700";
    ctx.fillRect(W - 44, 17, 6, 6);
    ctx.fillStyle = "#fff3a0";
    ctx.fillRect(W - 43, 18, 2, 2);
    ctx.fillStyle = hudInk;
    ctx.fillText(`${s.coins}`, W - 6, 16);

    // Hearts = lives (levels: up to 4. Infinite run: 3, or 4 with the EXTRA HEART prize)
    const heartStep = Math.min(16, Math.floor(64 / (maxLives() - 1)));
    for (let i = 0; i < maxLives(); i++) {
      const x = W / 2 - 34 + i * heartStep;
      drawPixels(ctx, HEART, x + 1, 5, { P: INK }, 1);
      drawPixels(ctx, HEART, x, 4, { P: i < s.lives ? PINK : "#9b8fa6" }, 1);
    }
    // LEVEL 3: WARLORD's huge health bar across the top
    if (s.kboss && s.kboss.kind === "warlord" && s.kboss.dead <= 0) {
      const kn = s.kboss;
      const bw = 280;
      const bx = Math.round(W / 2 - bw / 2);
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 2, 25, bw + 4, 12);
      ctx.fillStyle = "#3a2a3a";
      ctx.fillRect(bx, 27, bw, 8);
      ctx.fillStyle = kn.hp <= Math.ceil(kn.maxHp / 2) && Math.floor(s.t * 4) % 2 === 0 ? "#ff6070" : "#ff283c";
      ctx.fillRect(bx, 27, Math.round((bw * Math.max(0, kn.hp)) / kn.maxHp), 8);
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(bx, 27, Math.round((bw * Math.max(0, kn.hp)) / kn.maxHp), 2);
      ctx.textAlign = "center";
      ctx.fillStyle = INK;
      ctx.fillText(KN_NAMES[kn.kind], W / 2 + 1, 40);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(KN_NAMES[kn.kind], W / 2, 39);
      // the beat: two little squares that shrink onto every beat (his slams and eye waves land on it)
      const bph = ((s.t - WARLORD_BEAT_OFFSET) % warlordBeatLen()) / warlordBeatLen();
      const bsz = Math.max(2, Math.round(8 - bph * 6));
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 10 - (bsz >> 1) - 1, 31 - (bsz >> 1) - 1, bsz + 2, bsz + 2);
      ctx.fillRect(bx + bw + 10 - (bsz >> 1) - 1, 31 - (bsz >> 1) - 1, bsz + 2, bsz + 2);
      ctx.fillStyle = bph < 0.15 ? "#ffffff" : "#ff5fe0";
      ctx.fillRect(bx - 10 - (bsz >> 1), 31 - (bsz >> 1), bsz, bsz);
      ctx.fillRect(bx + bw + 10 - (bsz >> 1), 31 - (bsz >> 1), bsz, bsz);
    }

    // LEVEL 4: TOMBFELL's huge health bar across the top, in the middle (like WARLORD's).
    // It has 3 sections, one per part of the fight: the pink one (doves) empties first, then the
    // yellow one (cats), then the orange one (bear).
    if (s.tboss && s.tboss.dead <= 0) {
      const tbar = s.tboss;
      const bw = 279; // 3 sections of 93
      const bx = Math.round(W / 2 - bw / 2);
      const sec = bw / 3;
      const filled = Math.round((bw * Math.max(0, tbar.hp)) / tbar.maxHp);
      // left to right: bear, cats, doves (the quick fight in the infinite run is cats only: all yellow)
      const partColors = tbar.short ? ["#ffe14a", "#ffe14a", "#ffe14a"] : ["#ff8f40", "#ffe14a", "#ff7ad9"];
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 2, 25, bw + 4, 12);
      ctx.fillStyle = "#3a2a3a";
      ctx.fillRect(bx, 27, bw, 8);
      for (let i = 0; i < 3; i++) {
        const x0 = bx + i * sec;
        const w = Math.min(sec, filled - i * sec);
        if (w <= 0) break;
        // the section you're working on right now blinks a little
        const now = i === 3 - tbar.part && Math.floor(s.t * 4) % 2 === 0;
        ctx.fillStyle = now ? "#ffffff" : partColors[i];
        ctx.fillRect(x0, 27, w, 8);
        ctx.fillStyle = partColors[i];
        ctx.fillRect(x0, 29, w, 6);
      }
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.fillRect(bx, 27, filled, 2);
      // the lines between the sections, and a thinner one for every single hit
      for (let k = 1; k < tbar.maxHp; k++) {
        ctx.fillStyle = INK;
        const lx = bx + Math.round((bw * k) / tbar.maxHp);
        if (k % TOMB_PART_HP === 0) ctx.fillRect(lx - 1, 27, 2, 8);
        else ctx.fillRect(lx, 32, 1, 3);
      }
      ctx.textAlign = "center";
      ctx.fillStyle = INK;
      ctx.fillText("TOMBFELL", W / 2 + 1, 40);
      ctx.fillStyle = "#ffffff";
      ctx.fillText("TOMBFELL", W / 2, 39);
    }

    // Fire power: 5 fireball icons + a blinking orange timer bar along the bottom
    if (hasFire() && s.ammo > 5) {
      // lots of shots (boss fight): one icon and the number
      const [shotMain, shotShine] = hudShot(s.power);
      ctx.fillStyle = shotMain;
      ctx.fillRect(W / 2 - 36, 14, 4, 4);
      ctx.fillStyle = shotShine;
      ctx.fillRect(W / 2 - 35, 15, 2, 2);
      ctx.fillStyle = hudInk;
      ctx.textAlign = "left";
      ctx.fillText(`x${s.ammo}`, W / 2 - 30, 13);
    } else if (hasFire()) {
      const [shotMain, shotShine] = hudShot(s.power);
      for (let i = 0; i < 5; i++) {
        const x = W / 2 - 36 + i * 6;
        ctx.fillStyle = i < s.ammo ? shotMain : "#9b8fa6";
        ctx.fillRect(x, 14, 4, 4);
        if (i < s.ammo) {
          ctx.fillStyle = shotShine;
          ctx.fillRect(x + 1, 15, 2, 2);
        }
      }
    }
    // Double jumps left: turquoise cubes
    for (let i = 0; i < s.doubleJumps; i++) {
      const x = W / 2 + 10 + i * 7;
      ctx.fillStyle = "#138a7a";
      ctx.fillRect(x, 14, 5, 5);
      ctx.fillStyle = "#3de0c8";
      ctx.fillRect(x, 14, 4, 4);
    }
    // Boss health bar
    if (s.boss && s.bossState === "fight") {
      const b = s.boss;
      const label = b.kind === "giant" ? "GIANT" : "TROLL";
      ctx.fillStyle = hudInk;
      ctx.textAlign = "left";
      ctx.fillText(bossRound() === 0 ? label : `${label} ${bossRound() + 1}`, W / 2 - 60, 25);
      const bw = 72;
      const bx = W / 2 + 6;
      ctx.fillStyle = INK;
      ctx.fillRect(bx - 1, 25, bw + 2, 8);
      if (b.dazed > 0) {
        ctx.fillStyle = "#ffc800";
        ctx.fillText("STOMP HIM!", bx, 26);
      } else {
        ctx.fillStyle = "#9b8fa6";
        ctx.fillRect(bx, 26, bw, 6);
        const part = Math.max(0, b.hp) / b.maxHp;
        ctx.fillStyle = part > 0.5 ? LIGHT_GREEN : part > 0.25 ? "#ffc800" : "#e0303a";
        ctx.fillRect(bx, 26, Math.round(bw * part), 6);
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(bx, 26, Math.round(bw * part), 1);
      }
    }
    // Jetpack: a little icon + fuel bar under the score while you have it
    if (s.jetpack || s.perks.jetSip > 0) {
      drawPixels(ctx, JETPACK, 22, 16, { K: hudInk, P: PINK, p: DARK_PINK, W: "#ffffff", g: "#78788a" }, 1);
      const fuelFrac = s.jetpack ? s.jetFuel / JET_FUEL_MAX : s.sipFuel / Math.max(1, sipMax()); // (the JETPACK SIP prize has its own small tank)
      const fbx = 38;
      const fby = 20;
      const fbw = 40;
      ctx.fillStyle = hudInk;
      ctx.fillRect(fbx - 1, fby - 1, fbw + 2, 6);
      ctx.fillStyle = "#3a3a3a";
      ctx.fillRect(fbx, fby, fbw, 4);
      ctx.fillStyle = fuelFrac > 0.4 ? "#ffc800" : fuelFrac > 0.15 ? "#ff7a00" : "#e0303a";
      ctx.fillRect(fbx, fby, Math.round(fbw * fuelFrac), 4);
    }
    if (hasFire() && s.power === "fire" && s.bossState !== "fight") {
      const left = Math.min(1, s.fireTime / fireTimeMax());
      const low = s.fireTime < 4;
      const barOn = !low || Math.floor(s.t * 8) % 2 === 0;
      ctx.fillStyle = INK;
      ctx.fillRect(8, H - 12, W - 16, 4);
      if (barOn) {
        ctx.fillStyle = Math.floor(s.t * 6) % 2 === 0 ? "#ff7a00" : "#ffc800";
        ctx.fillRect(9, H - 11, Math.max(0, Math.round((W - 18) * left)), 2);
      }
    }
    if (!s.levelMode) drawPerkHud(ctx); // the spin prizes you hold (infinite run only)
    } // end of the select-mode HUD gate

    if (s.mode !== "ready" && s.mode !== "select") drawProgress(ctx);

    // Messages
    const blink = Math.floor(s.t * 2) % 2 === 0;
    ctx.textAlign = "center";
    if (s.mode === "select") {
      const o = OUTFITS[s.selectIndex];
      const owned = s.unlocked.includes(o.id);
      textBox(ctx, "CHOOSE YOUR PINKMANE", 8);
      textBox(ctx, o.name, 20);
      // The big portrait itself is drawn further down, right in the middle of the screen
      const canBuy = !owned && !!o.cost && s.coins >= o.cost;
      textBox(ctx, owned ? "PRESS OK TO WEAR IT" : canBuy ? `PRESS OK TO BUY (${o.cost} COINS)` : `LOCKED \u2014 ${howToGet(o)}`, 118);
      textBox(ctx, `GOLD COINS: ${s.coins}`, 130);
      if (!s.storageOk) textBox(ctx, "BROWSER STORAGE BLOCKED \u2014 WON'T SAVE", 141);
      if (blink) textBox(ctx, "\u2190 \u2192 BROWSE OUTFITS", 152);
    } else if (s.mode === "ready" && s.levelMode) {
      textBox(ctx, `LVL ${s.level}: ${LEVELS[s.level - 1]?.name ?? ""}`, 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const best = s.levelBest[String(s.level)];
      textBox(ctx, best ? `YOUR BEST: ${fmtTime(best)}` : "REACH THE BONG AS FAST AS YOU CAN", 70);
    } else if (s.mode === "ready") {
      textBox(ctx, GAME_TITLE, 36);
      if (blink) textBox(ctx, "PRESS OK TO START", 54);
      const top = boardRef.current[0];
      if (boardStatusRef.current === "ok" && top) textBox(ctx, `#1 ${top.name} ${pad(top.score)}`, 70);
      textBox(ctx, "ESC: CHANGE GAME TYPE", 90);
    } else if ((s.mode === "running" || s.mode === "pipe") && s.flash > 0) {
      textBox(ctx, s.flashText, 36);
    } else if (s.mode === "dying") {
      textBox(ctx, "GAME OVER", 40);
      if (s.t - s.deadAt > 0.4) textBox(ctx, "OH MY GOD, THEY KILLED PINKMANE!", 58);
      if (s.t - s.deadAt > 1.2) textBox(ctx, "YOU BASTARDS!", 72);
    } else if (s.mode === "entry") {
      textBox(ctx, "NEW TOP 10 SCORE!", 30);
      textBox(ctx, `YOU SMOKED ${Math.floor(s.score)} GRAMS`, 44);
    }
    // Hint on top of an unused pipe
    if (s.mode === "running" && pipeUnderFeet() >= 0 && blink) {
      textBox(ctx, s.inBonus ? "PRESS DOWN TO LEAVE" : "PRESS DOWN TO ENTER", 88);
    }

    if (s.mode === "choose") drawSpellPick(ctx);
    if (s.mode === "bossIntro") drawBossIntro(ctx);
    if (s.mode === "spin") drawSpin(ctx);
    if (s.mode === "wax" && !s.waxHide) drawWax(ctx);
    if (s.waxTrip > 0 && ["running", "hurt", "pipe"].includes(s.mode) && !s.waxHide) drawWaxTrip(ctx);
    // Lore sign you're standing next to
    if ((s.levelMode || s.signs.length > 0) && s.mode === "running" && s.flash <= 0) {
      const near = s.signs.find((sg) => Math.abs(sg.x + 8 - (s.x + SPRITE_W / 2)) < (sg.r ?? 36));
      if (near && near.text) near.text.split("\n").forEach((line, i) => textBox(ctx, line, 30 + i * 12));
    }
    // "How to use it" hint the first time you get a power-up (PRESS S TO SHOOT etc.)
    // Drawn AFTER the lore signs so it's always on top, and pushed below the sign's text so they don't overlap
    if (s.mode === "running" && s.hintTime > 0 && s.flash <= 0) {
      const sign = s.signs.find((sg) => Math.abs(sg.x + 8 - (s.x + SPRITE_W / 2)) < (sg.r ?? 36));
      const signLines = sign && sign.text ? sign.text.split("\n").length : 0;
      const hintY = signLines > 0 ? Math.min(H - 30, 30 + signLines * 12 + 6) : 52;
      flashBox(ctx, s.hintText, hintY, s.t);
    }
    if (s.mode === "levelDone") drawLevelDone(ctx);
    if (s.mode === "paused") {
      ctx.fillStyle = "rgba(22, 12, 29, 0.7)";
      ctx.fillRect(0, 0, W, H);
      textBox(ctx, "PAUSED", 26);
      PAUSE_OPTIONS.forEach((label, i) => {
        const picked = s.pauseChoice === i;
        const text = (picked ? "> " : "") + label;
        const y = 42 + i * 14;
        const w = ctx.measureText(text).width + 10;
        ctx.fillStyle = picked ? PINK : SCREEN;
        ctx.fillRect(Math.round(W / 2 - w / 2), y - 2, Math.round(w), 12);
        ctx.fillStyle = picked ? "#ffffff" : INK;
        ctx.fillText(text, W / 2, y);
      });
      if (blink) textBox(ctx, "\u2191\u2193 CHOOSE \u00b7 OK CONFIRM", 132);
    }
  };

  // Start the game loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // Outfits with `recolor`: if their own PNG isn't there, repaint the classic picture instead
    const repaint = new Set<OutfitId>();
    const makeRepaints = () => {
      const base = spritesRef.current.classic;
      if (!base || !base.complete || base.naturalWidth === 0) return;
      repaint.forEach((id) => {
        const o = OUTFITS.find((x) => x.id === id);
        const made = o && o.recolor ? recolorSprite(base, o.recolor) : null;
        if (made) spritesRef.current[id] = made;
        repaint.delete(id);
      });
    };
    OUTFITS.forEach((o) => {
      const img = new Image();
      if (o.id === "classic") img.onload = makeRepaints;
      if (o.recolor) {
        img.onerror = () => {
          repaint.add(o.id);
          makeRepaints();
        };
      }
      if (o.id === "warlord") {
        // no PNG of your own: build him from the boss's pixel art
        img.onerror = () => {
          const made = makeWarlordSprite();
          if (made) spritesRef.current[o.id] = made;
        };
      }
      img.src = o.file;
      spritesRef.current[o.id] = img;
    });
    LEVELS.forEach((lv) => {
      if (!lv || !lv.outfit || levelSpritesRef.current[lv.outfit]) return;
      const img = new Image();
      img.src = lv.outfit;
      levelSpritesRef.current[lv.outfit] = img;
    });
    const ship = new Image();
    ship.src = "/game/ghostship.png";
    shipRef.current = ship;
    fieldImagesRef.current = FIELD_IMAGES.map((src) => {
      const im = new Image();
      im.src = src;
      return im;
    });
    deathSoundRef.current = new Audio(DEATH_SOUND);
    const bossSound = new Audio(TROLL_DEATH_SOUND);
    bossSound.preload = "auto";
    trollSoundRef.current = bossSound;
    window.addEventListener("pinkmane-level-control", levelMusicControl);
    const weedBg = new Image();
    weedBg.src = WEEDLAND_BG;
    weedBgRef.current = weedBg;
    for (const [zoneNo, def] of Object.entries(PAINTED_BGS)) {
      const im = new Image();
      im.src = def.src;
      paintedBgRef.current[Number(zoneNo)] = { img: im, cache: null };
    }
    Object.entries(KEEP_IMAGES).forEach(([k, src]) => {
      const im = new Image();
      im.src = src;
      keepImgsRef.current[k] = im;
    });

    // Owner code: open the site once with ?owner=YOURCODE on each of your devices
    try {
      const params = new URLSearchParams(window.location.search);
      const ownerParam = params.get("owner");
      if (ownerParam) {
        localStorage.setItem(OWNER_KEY, ownerParam);
        params.delete("owner");
        const rest = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : ""));
      }
    } catch {}

    state.current.storageOk = storageAvailable();

    try {
      sfxOnRef.current = localStorage.getItem(SFX_KEY) !== "off";
      const savedVol = localStorage.getItem(SFX_VOL_KEY);
      if (savedVol !== null && !Number.isNaN(Number(savedVol))) sfxVolRef.current = Math.max(0, Math.min(1, Number(savedVol)));
      const saved = Number(localStorage.getItem(BEST_KEY));
      if (saved > 0) state.current.best = saved;
      const savedName = localStorage.getItem(NAME_KEY);
      if (savedName) {
        nameRef.current = savedName;
        setName(savedName);
      }
      const savedCoins = Number(localStorage.getItem(COINS_KEY));
      if (savedCoins > 0) state.current.coins = savedCoins;
      const savedUnlocked = JSON.parse(localStorage.getItem(UNLOCKED_KEY) || "[]");
      if (Array.isArray(savedUnlocked) && savedUnlocked.length) {
        state.current.unlocked = Array.from(new Set(["classic", ...savedUnlocked])) as OutfitId[];
      }
      const savedMedals = JSON.parse(localStorage.getItem(LEVEL_MEDALS_KEY) || "{}");
      if (savedMedals && typeof savedMedals === "object" && !Array.isArray(savedMedals)) state.current.medals = savedMedals;
      const savedPetSkins = JSON.parse(localStorage.getItem(PET_SKINS_KEY) || "[]");
      if (Array.isArray(savedPetSkins)) state.current.petSkins = OUTFITS.map((o) => o.id).filter((id) => savedPetSkins.includes(id));
      const savedPetSkin = localStorage.getItem(PET_SKIN_KEY) as OutfitId | null;
      if (savedPetSkin && boboOwns(savedPetSkin)) state.current.petSkin = savedPetSkin;
      const savedSpells = JSON.parse(localStorage.getItem(SPELLS_KEY) || "[]");
      if (Array.isArray(savedSpells)) {
        state.current.spells = SHOP_SPELLS.map((sp) => sp.id).filter((id) => savedSpells.includes(id));
      }
      const savedCards = JSON.parse(localStorage.getItem(CARDS_KEY) || "[]");
      if (Array.isArray(savedCards)) {
        state.current.cards = BOSS_CARDS.map((c) => c.id).filter((id) => savedCards.includes(id));
      }
      // Test shortcut (only on your own computer, never on the real site):
      // open  http://localhost:3000/?coins=1000  and you have 1000 gold coins to try the shop with
      if (localTesting()) {
        const testCoins = Number(new URLSearchParams(window.location.search).get("coins"));
        if (testCoins > 0) state.current.coins = Math.floor(testCoins);
      }
      const savedOutfit = localStorage.getItem(OUTFIT_KEY) as OutfitId | null;
      if (savedOutfit && state.current.unlocked.includes(savedOutfit) && OUTFITS.some((o) => o.id === savedOutfit)) {
        state.current.outfit = savedOutfit;
        state.current.selectIndex = OUTFITS.findIndex((o) => o.id === savedOutfit);
      }
    } catch {}

    loadBoard();
    loadLevelProgress();
    newGame();

    // Keyboard: ← → / A D walk, ↑ / W jump (Space and Enter jump through the iPod),
    // F / X shoot, ↓ / S go down a pipe (or shoot), M = game sounds on/off
    const keyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const k = e.key;
      const mode = state.current.mode;
      // Space / Enter reach the game through the page (as OK). Remember if this one is just the key being held down.
      if (k === " " || k === "Enter") okRepeatRef.current = e.repeat;
      // Esc (or P) pauses / unpauses
      if (k === "Escape" || k === "p" || k === "P") {
        const st = state.current;
        if (mode === "running") pauseGame();
        else if (mode === "paused") resumeGame();
        else if (k === "Escape" && mode === "select" && st.fromPause) {
          // picking an outfit from the pause menu: Esc goes back to the pause menu
          st.fromPause = false;
          st.mode = "paused";
        } else if (k === "Escape" && mode === "shop" && st.shopFromPause) {
          // the shop opened from the pause menu: Esc goes back to the pause menu
          st.shopFromPause = false;
          st.mode = "paused";
        } else if (k === "Escape" && (mode === "select" || mode === "levelSelect" || mode === "shop" || mode === "cards")) st.mode = "home";
        else if (k === "Escape" && mode === "ready") st.mode = st.levelMode ? "levelSelect" : "home";
        return;
      }
      // The pink start screen
      if (mode === "home") {
        // 0 / 1 = the two game types. UP goes to the buttons on top: 3 = CARDS (left), 2 = SHOP (right).
        const hc = state.current.homeChoice;
        const top = hc >= 2;
        if (k === "ArrowLeft" || k === "a" || k === "A") state.current.homeChoice = top ? 3 : 0;
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.homeChoice = top ? 2 : 1;
        if ((k === "ArrowUp" || k === "w" || k === "W") && !top) state.current.homeChoice = hc === 0 ? 3 : 2;
        if ((k === "ArrowDown" || k === "s" || k === "S") && top) state.current.homeChoice = hc === 3 ? 0 : 1;
        return;
      }
      // Your boss cards: left / right to flip through them (OK or Esc goes back)
      if (mode === "cards") {
        if (k === "ArrowLeft" || k === "a" || k === "A") cardMove(-1);
        if (k === "ArrowRight" || k === "d" || k === "D") cardMove(1);
        return;
      }
      // The shop: up / down to browse (OK buys, Esc goes back)
      if (mode === "shop") {
        if (k === "ArrowUp" || k === "w" || k === "W") shopMove(-1);
        if (k === "ArrowDown" || k === "s" || k === "S") shopMove(1);
        return;
      }
      // The level map: walk with arrows / WASD
      if (mode === "levelSelect") {
        if (k === "ArrowLeft" || k === "a" || k === "A") mapMove(-1, 0);
        if (k === "ArrowRight" || k === "d" || k === "D") mapMove(1, 0);
        if (k === "ArrowUp" || k === "w" || k === "W") mapMove(0, -1);
        if (k === "ArrowDown" || k === "s" || k === "S") mapMove(0, 1);
        return;
      }
      // Browsing outfits before the game starts
      if (mode === "select") {
        if (k === "ArrowLeft" || k === "a" || k === "A")
          state.current.selectIndex = (state.current.selectIndex + OUTFITS.length - 1) % OUTFITS.length;
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.selectIndex = (state.current.selectIndex + 1) % OUTFITS.length;
        return;
      }
      // The wax moment: jump (or OK) skips the rest once the hit is done
      if (mode === "wax") {
        if (!e.repeat && (k === "ArrowUp" || k === "w" || k === "W")) {
          okRepeatRef.current = false;
          press();
        }
        return;
      }
      // The prize machine: left / right to choose, jump (or OK) to take it
      if (mode === "spin") {
        const goLeft = k === "ArrowLeft" || k === "a" || k === "A";
        const goRight = k === "ArrowRight" || k === "d" || k === "D";
        const goUp = k === "ArrowUp" || k === "w" || k === "W";
        // keep track of what you're holding, so you carry on walking the moment the run continues
        if (goLeft) heldRef.current.left = true;
        if (goRight) heldRef.current.right = true;
        if (goUp || k === " ") heldRef.current.up = true;
        if (e.repeat) return; // a key that's just being held down doesn't count
        if (goLeft) spinMove(-1);
        if (goRight) spinMove(1);
        if (goUp) spinTake();
        return;
      }
      // Picking a spell before a boss fight
      if (mode === "choose") {
        const options = state.current.spells.includes("spike") ? 3 : 2;
        if (k === "ArrowLeft" || k === "a" || k === "A") state.current.spellChoice = Math.max(0, state.current.spellChoice - 1);
        if (k === "ArrowRight" || k === "d" || k === "D") state.current.spellChoice = Math.min(options - 1, state.current.spellChoice + 1);
        return;
      }
      // Choosing an option on the pause menu
      if (mode === "paused") {
        const n = PAUSE_OPTIONS.length;
        if (k === "ArrowUp" || k === "w" || k === "W") state.current.pauseChoice = (state.current.pauseChoice + n - 1) % n;
        if (k === "ArrowDown" || k === "s" || k === "S") state.current.pauseChoice = (state.current.pauseChoice + 1) % n;
        return;
      }
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = true;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = true;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") heldRef.current.up = true;
      if (k === "ArrowUp" || k === "w" || k === "W") jump();
      if (k === "ArrowDown" || k === "s" || k === "S") down();
      if (k === "f" || k === "F" || k === "x" || k === "X") shoot();
      if (k === "m" || k === "M") toggleSfx();
      // Test shortcuts (only on your own computer, never on the real site): while running in the infinite run,
      // 9 opens a STASH SPIN right now, 0 opens a BOSS SPIN, 8 opens a spin that shows the prizes in order,
      // 7 starts the wax moment, 6 brings the next boss.
      // A run where you used one of them never goes on the scoreboard.
      if ((k === "9" || k === "0") && mode === "running" && !state.current.levelMode && localTesting()) {
        state.current.testRun = true;
        state.current.spinQueue.push(k === "0");
        state.current.spinWait = 0;
      }
      // 7 = the wax moment right now. 6 = jump your grams to just before the next boss (he shows up a screen later).
      if ((k === "7" || k === "6") && mode === "running" && !state.current.levelMode && !state.current.inBonus && localTesting()) {
        const st = state.current;
        st.testRun = true;
        if (k === "7") openWax(true); // (replays the rip as often as you like, to polish it)
        if (k === "6" && st.bossState === "none") {
          st.bonus += Math.max(0, BOSS_EVERY * (st.bossCount + 1) - 250 - st.score);
        }
      }
      // 8 = a test spin that walks through every prize in order, three at a time, so you can get a specific one
      if (k === "8" && mode === "running" && !state.current.levelMode && localTesting()) {
        const st = state.current;
        const ids = PERKS.map((p) => p.id);
        const i = st.testSpin % ids.length;
        st.testSpin = (i + 3) % ids.length;
        st.testRun = true;
        openSpin(false, [ids[i], ids[(i + 1) % ids.length], ids[(i + 2) % ids.length]]);
      }
      if (k === "-" || k === "_") setSfxVolume((sfxOnRef.current ? sfxVolRef.current : 0) - 0.1);
      if (k === "=" || k === "+") setSfxVolume((sfxOnRef.current ? sfxVolRef.current : 0) + 0.1);
    };
    const keyUp = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") heldRef.current.left = false;
      if (k === "ArrowRight" || k === "d" || k === "D") heldRef.current.right = false;
      if (k === " " || k === "ArrowUp" || k === "w" || k === "W") heldRef.current.up = false;
    };
    // Let go of everything if the window loses focus (so you don't keep flying or walking)
    // (and pause the game if it was running)
    const releaseAll = () => {
      heldRef.current = { left: false, right: false, up: false };
      touchUpRef.current = false;
      pauseGame();
    };
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", releaseAll);
    // The big A button on phones. It comes straight from the page the moment the finger touches it:
    // OK in the menus, JUMP in the game, and keeping it held flies the jetpack.
    const padButton = (e: Event) => {
      const d = (e as CustomEvent<{ btn?: string; down?: boolean }>).detail;
      if (!d || d.btn !== "a") return;
      if (d.down) {
        heldRef.current.up = true;
        okRepeatRef.current = false; // a finger on the button is always a fresh press
        press();
      } else {
        heldRef.current.up = false;
      }
    };
    window.addEventListener("pinkmane-pad", padButton);

    // Add ?perf=1 to the address to see a little frame-time meter in the corner (and long frames in the console).
    // "GAME" is how long the game's own code took. If a frame is long but GAME is small, the hiccup isn't the game
    // (it's the page behind it, the sound, or the graphics card).
    const perfOn = new URLSearchParams(window.location.search).get("perf") !== null;
    hitboxesRef.current = new URLSearchParams(window.location.search).get("hitboxes") !== null; // ?hitboxes=1 draws every enemy's danger zone (red) and stomp zone (green)
    const perfGaps: number[] = [];
    const perfJs: number[] = [];
    const drawPerfMeter = (c: CanvasRenderingContext2D, gap: number, js: number) => {
      perfGaps.push(gap);
      perfJs.push(js);
      if (perfGaps.length > 180) {
        perfGaps.shift();
        perfJs.shift();
      }
      if (gap > 50) console.warn(`[perf] long frame: ${gap.toFixed(0)}ms (the game's own code: ${js.toFixed(1)}ms) mode=${state.current.mode}`);
      const worst = Math.max(...perfGaps);
      const avg = perfGaps.reduce((a, b) => a + b, 0) / perfGaps.length;
      const worstJs = Math.max(...perfJs);
      const long = perfGaps.filter((g) => g > 40).length;
      c.save();
      c.fillStyle = "rgba(0, 0, 0, 0.7)";
      c.fillRect(W - 112, H - 30, 110, 28);
      c.font = `8px ${fontFamily}`;
      c.textAlign = "left";
      c.textBaseline = "top";
      c.fillStyle = worst > 40 ? "#ff6070" : "#7dff9a";
      c.fillText(`${Math.round(1000 / Math.max(1, avg))}FPS WORST ${Math.round(worst)}MS`, W - 108, H - 27);
      c.fillStyle = "#ffffff";
      c.fillText(`GAME ${worstJs.toFixed(1)}MS  LONG ${long}`, W - 108, H - 16);
      c.restore();
    };
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const gap = now - last; // milliseconds since the last frame
      const dt = Math.min(0.033, gap / 1000);
      last = now;
      const t0 = perfOn ? performance.now() : 0;
      update(dt);
      draw(ctx);
      syncLevelMusic();
      if (perfOn) drawPerfMeter(ctx, gap, performance.now() - t0);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", keyDown);
      window.removeEventListener("keyup", keyUp);
      window.removeEventListener("blur", releaseAll);
      window.removeEventListener("pinkmane-pad", padButton);
      audioCtxRef.current?.close().catch(() => {});
      stopStutters();
      levelMusicRef.current?.pause();
      levelMusicOnRef.current = false;
      levelMusicReportRef.current = "";
      releaseAllPageMusic(); // leaving the game: your music carries on
      window.dispatchEvent(new CustomEvent("pinkmane-level-song", { detail: null }));
      window.removeEventListener("pinkmane-level-control", levelMusicControl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to OK / Enter / Space from the iPod controls (jump)
  useEffect(() => {
    if (actionSignal !== firstSignal.current) press();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionSignal]);

  const buttonStyle: React.CSSProperties = {
    fontFamily,
    fontSize: "clamp(8px, 2.4vw, 11px)",
    border: "none",
    padding: "6px 10px",
    cursor: "pointer",
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        // Phones: hold the left or right third to walk, tap the middle to jump,
        // swipe down in the middle to shoot / go down a pipe. Speaker icon (top-left) = sounds.
        onPointerDown={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cx = (e.clientX - rect.left - (rect.width - W * scale) / 2) / scale;
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          if (cx < 20 && cy < 14) {
            toggleSfx();
            return;
          }
          if (onSfxSlider(cx, cy)) {
            e.currentTarget.setPointerCapture(e.pointerId);
            sfxDragRef.current = true;
            sfxFromY(cy);
            return;
          }
          const mode = state.current.mode;
          if (mode === "entry") return;
          if (mode === "home") {
            state.current.homeChoice = cy < 17 && cx > W - 104 ? 2 : cy < 17 && cx < 104 ? 3 : cx < W / 2 ? 0 : 1;
            press();
            return;
          }
          if (mode === "cards") {
            // tap left / right of the card to flip, tap the card to go back
            if (cx < (W - CARD_W) / 2) cardMove(-1);
            else if (cx > (W + CARD_W) / 2) cardMove(1);
            else press();
            return;
          }
          if (mode === "shop") {
            // tap a line to highlight it, tap it again (or anywhere else) to buy / wear it
            const first = shopFirstRow();
            const i = first + Math.floor((cy - (SHOP_TOP - 1)) / SHOP_ROW_H);
            const onList = cx < 216 && cy >= SHOP_TOP - 1 && i < first + SHOP_VISIBLE && i < SHOP_ROWS.length;
            if (onList && SHOP_ROWS[i].kind === "head") return;
            if (onList && i !== state.current.shopIndex) state.current.shopIndex = i;
            else shopPick();
            return;
          }
          if (mode === "levelSelect") {
            const here = state.current.levelPick;
            const near = (i: number) => i >= 0 && i < MAP_NODES.length && Math.hypot(MAP_NODES[i].x - cx, MAP_NODES[i].y - cy) < 22;
            if (near(here)) press();
            else if (near(here + 1) || near(here - 1)) {
              const to = near(here + 1) ? here + 1 : here - 1;
              const pts = mapPath(here, to);
              mapMove(Math.sign(pts[1][0] - pts[0][0]), Math.sign(pts[1][1] - pts[0][1]));
            }
            return;
          }
          if (mode === "paused") {
            // tap an option on the pause menu to pick it
            const row = Math.floor((cy - 40) / 14);
            if (row >= 0 && row < PAUSE_OPTIONS.length) {
              state.current.pauseChoice = row;
              press();
            }
            return;
          }
          if (mode === "spin") {
            // the prize machine: tap a reel to highlight it, tap the highlighted one again to take it
            const sp = state.current.spin;
            if (!sp || cy < SPIN_WIN.y - 6 || cy > SPIN_WIN.y + SPIN_WIN.h + 14) return;
            const r = Math.max(0, Math.min(2, Math.floor((cx - (SPIN_WIN.x - 7)) / SPIN_WIN.step)));
            if (sp.jackpot || sp.pick === r) spinTake();
            else spinMove(r - sp.pick);
            return;
          }
          if (mode === "choose") {
            state.current.spellChoice = state.current.spells.includes("spike")
              ? Math.max(0, Math.min(2, Math.floor((cx - 48) / 80)))
              : cx < W / 2 ? 0 : 1;
            pickSpell(state.current.spellChoice);
            return;
          }
          if (mode !== "running") {
            press();
            return;
          }
          // phones with the big thumb buttons: the screen itself doesn't walk or jump any more
          if (touchPadRef.current) return;
          if (cx < W * 0.33) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = -1;
          } else if (cx > W * 0.67) {
            e.currentTarget.setPointerCapture(e.pointerId);
            touchRef.current = 1;
          } else if (cy > H * 0.6) {
            down();
          } else {
            // tap = jump, keep holding = fly (with the jetpack)
            e.currentTarget.setPointerCapture(e.pointerId);
            touchUpRef.current = true;
            jump();
          }
        }}
        onPointerMove={(e) => {
          if (!sfxDragRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = Math.min(rect.width / W, rect.height / H);
          const cy = (e.clientY - rect.top - (rect.height - H * scale) / 2) / scale;
          sfxFromY(cy);
        }}
        onPointerUp={() => {
          if (sfxDragRef.current) {
            sfxDragRef.current = false;
            beep(520, 780, 0.08, 0.05, "square"); // a little test sound at the new volume
          }
          touchRef.current = 0;
          touchUpRef.current = false;
        }}
        onPointerCancel={() => {
          sfxDragRef.current = false;
          touchRef.current = 0;
          touchUpRef.current = false;
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: SCREEN,
          touchAction: "none",
          cursor: "pointer",
        }}
      />

      {showGolden && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 11,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            padding: "8px",
            textAlign: "center",
            background: "rgba(22, 12, 29, 0.88)",
            fontFamily,
            color: "#fff",
          }}
        >
          <div style={{ fontSize: "clamp(10px, 3vw, 15px)", color: "#ffd700" }}>YOU FOUND THE GOLDEN LEAF!</div>
          <div style={{ fontSize: "clamp(8px, 2.2vw, 11px)", color: "#ffd700" }}>+{PTS_GOLD} GRAMS</div>
          <div style={{ fontSize: "clamp(8px, 2.2vw, 11px)", lineHeight: 1.6 }}>
            SECRET TRACK: STUTTERS REMIX
            <br />
            NOW PLAYING IN THE VOID
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
            {STUTTERS_LINK && (
              <button onClick={() => closeGolden(true)} style={{ ...buttonStyle, background: "#ffd700", color: INK }}>
                GET THE PRIVATE LINK
              </button>
            )}
            <button onClick={() => closeGolden(false)} style={{ ...buttonStyle, background: "#bbb", color: INK }}>
              {goldBefore ? "SKIP, GOT IT ALREADY" : "SKIP"}
            </button>
          </div>
        </div>
      )}

      {showEntry && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: "12%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            zIndex: 10,
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={12}
            placeholder="YOUR NAME"
            onChange={(e) => {
              const v = e.target.value.toUpperCase().replace(/[^A-Z0-9 _.\-]/g, "");
              nameRef.current = v;
              setName(v);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitName();
              if (e.key === "Escape") skipEntry();
            }}
            style={{
              fontFamily,
              fontSize: "clamp(10px, 3vw, 13px)",
              width: "60%",
              textAlign: "center",
              padding: "6px",
              background: INK,
              color: "#fff",
              border: `2px solid ${PINK}`,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={submitName} disabled={saving} style={{ ...buttonStyle, background: PINK, color: "#fff" }}>
              {saving ? "SAVING..." : "SAVE"}
            </button>
            <button onClick={skipEntry} style={{ ...buttonStyle, background: "#bbb", color: INK }}>
              SKIP
            </button>
          </div>
          {message && (
            <div style={{ fontFamily, fontSize: "clamp(7px, 2vw, 9px)", color: "#b00020" }}>{message}</div>
          )}
        </div>
      )}
    </>
  );
}
