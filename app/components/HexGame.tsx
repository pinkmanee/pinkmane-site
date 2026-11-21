"use client";

import { useEffect, useRef } from "react";
import { ScorePanel, type ScoreApi } from "./Scoreboard";
import { KIT, SKIN_COLORS, drawOverScreen, drawStartScreen, makeArcade, rainbow, type Arcade, type ShopRow } from "./PinkShop";

// PINK HEXAGON: walls close in on the middle, slip through the gaps with your little triangle. Survive as long as you can.
//   hold ← → (or A D) / click wheel / hold the left or right half of the screen = go round
//   SPACE / OK / tap = start      ESC / P / the II button = pause menu      S / DOWN on the start + game over screen = PINK SHOP
//   M = sounds on / off, - and + = FX volume (or the speaker + slider top left)
// The middle hexagon and the walls pulse to the song that's playing. The colours keep changing (see THE COLOURS below).
// MONEY: VIBES. 1 for every 2 seconds you survive.
// This one stays on the iPod screen (256 x 160) on purpose: the old-school look.
// ONLINE TOP 10: board id "hex" (scores are times in hundredths of a second, see Scoreboard.tsx).

type BeatState = { kick: number; sway: number; bass: number; quake: number; live: boolean };
type Props = {
  // Goes up by 1 every time the player presses OK / Enter / Space
  actionSignal: number;
  // Degrees the click wheel was turned since the last frame (filled in by the page)
  spinRef: React.MutableRefObject<number>;
  // The pixel font from the page, so the game text matches the iPod
  fontFamily: string;
  // Follows the iPod mute button
  muted: boolean;
  touch?: boolean;
  // the music's beat from the page (kick = 1 on a kick drum, then fades). Without it, a steady 140 BPM.
  beatRef?: React.MutableRefObject<BeatState>;
};

type Mode = "ready" | "running" | "dying" | "over";
// One ring of walls coming in: which of the 6 sides have a wall, and how far away it is
type Wave = { d: number; sides: boolean[] };
type Particle = { x: number; y: number; vx: number; vy: number; color: string; life: number };

const GAME_TITLE = "PINK HEXAGON";

// Game size in pixels (the iPod screen)
const W = 256;
const H = 160;
const CX = 128;
const CY = 84;

const SIDE = Math.PI / 3; // 60 degrees
const COS30 = Math.cos(Math.PI / 6);
const PLAYER_R = 20; // how far the triangle circles from the middle
const CORE = 11; // size of the middle hexagon
const WALL_TH = 8; // wall thickness
const SPAWN_D = 175; // walls start this far out
const TURN_SPEED = 5.2; // keyboard / touch turning speed (radians per second)

// Without the page's beat: a steady pulse at this tempo
const BPM = 140;
const BEAT = 60 / BPM;

// Saved in the visitor's browser
const BEST_KEY = "pinkhex-best";
const FX_KEY = "pinkhex-sfx";
const SHOP_KEY = "pinkhex-shop";

// Plays on Game Over: public/sounds/killed.mp3
const DEATH_SOUND = "/sounds/killed.mp3";

// Stage changes at these many seconds
const STAGES = [10, 20, 30, 45, 60, 90];
// THE COLOURS (like the real game): bright walls on two dark shades of the same colour, and the colour never sits still.
//  - it slides round the colour wheel the whole time (HUE_DRIFT degrees a second, a bit faster every stage)
//  - the two background shades swap places on the beat, and the background pulses brighter on every kick
//  - every new stage jumps to its own colour (STAGE_HUES, in degrees: 315 pink, 25 orange, 195 ice blue, 55 yellow...)
const STAGE_HUES = [315, 25, 195, 55, 275, 0, 140];
const HUE_DRIFT = 14; // degrees per second the colour slides on its own (bigger = changes faster)
const HUE_DRIFT_UP = 6; // ...plus this much more for every stage
const SWAP_EVERY_BEATS = 1; // the background shades swap every this many beats (2 = calmer)
const hsl = (h: number, sat: number, l: number) => `hsl(${Math.round(((h % 360) + 360) % 360)}, ${sat}%, ${Math.round(l)}%)`;
type Pal = { a: string; b: string; wall: string; edge: string; core: string };
// the colours for a hue (pulse = the beat, it brightens the background a little)
const colorsFor = (h: number, pulse = 0): Pal => ({
  a: hsl(h, 62, 21 + pulse * 5),
  b: hsl(h, 70, 13 + pulse * 4),
  wall: hsl(h, 95, 57),
  edge: hsl(h, 100, 82),
  core: hsl(h, 70, 9),
});

const INK = "#111111";
const PINK = "#d63cc8";
const BOOM = [PINK, "#8a1f86", "#ffffff", INK, "#ffc800"];

// ---------- the PINK SHOP ----------
const SKINS: { id: string; name: string; price: number }[] = [
  { id: "pink", name: "PINK", price: 0 },
  { id: "toxic", name: "TOXIC", price: 40 },
  { id: "ice", name: "ICE", price: 80 },
  { id: "fire", name: "FIRE", price: 120 },
  { id: "rainbow", name: "RAINBOW", price: 200 },
  { id: "gold", name: "SILVER", price: 320 },
];
const TRAILS: { id: string; name: string; price: number; info: string }[] = [
  { id: "none", name: "NO TRAIL", price: 0, info: "JUST THE TRIANGLE" },
  { id: "pink", name: "PINK TRAIL", price: 60, info: "A PINK TAIL BEHIND YOU" },
  { id: "fire", name: "FIRE TRAIL", price: 140, info: "SPARKS FLY OFF YOU" },
  { id: "rainbow", name: "RAINBOW TRAIL", price: 220, info: "EVERY COLOUR BEHIND YOU" },
];
const SHOP_ROWS: ShopRow[] = [
  { kind: "head", label: "TRIANGLES" },
  ...SKINS.map((k): ShopRow => ({ kind: "item", id: `skin:${k.id}`, name: `${k.name} TRIANGLE`, prices: [k.price], wear: true, info: [`A ${k.name} TRIANGLE`, ""] })),
  { kind: "head", label: "TRAILS" },
  ...TRAILS.map((k): ShopRow => ({ kind: "item", id: `trail:${k.id}`, name: k.name, prices: [k.price], wear: true, info: [k.info, ""] })),
  { kind: "back" },
];

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}
const randInt = (n: number) => Math.floor(Math.random() * n);
// Angle between -PI and PI
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
// Scores are saved in hundredths of a second: 1234 = 12.34 seconds
const fmtTime = (cs: number) => (Math.floor(cs) / 100).toFixed(2);

// Wall patterns. Each returns waves (sides with walls) and the gap after each wave.
function makePattern(time: number): { sides: boolean[]; gap: number }[] {
  const r = randInt(6);
  const on = (list: number[]) => {
    const s = [false, false, false, false, false, false];
    for (const i of list) s[(((r + i) % 6) + 6) % 6] = true;
    return s;
  };
  const easy = time < 10;
  const choices = easy ? [0, 1, 2] : [0, 1, 2, 3, 4, 5];
  const pick = choices[randInt(choices.length)];
  const space = easy ? 70 : 55;
  switch (pick) {
    case 0: // one gap
      return [{ sides: on([1, 2, 3, 4, 5]), gap: space }];
    case 1: // two gaps, opposite
      return [{ sides: on([1, 2, 4, 5]), gap: space }];
    case 2: // half circle, then the other half
      return [
        { sides: on([0, 1, 2]), gap: 45 },
        { sides: on([3, 4, 5]), gap: space },
      ];
    case 3: // every other side, flipping
      return [
        { sides: on([0, 2, 4]), gap: 34 },
        { sides: on([1, 3, 5]), gap: 34 },
        { sides: on([0, 2, 4]), gap: space },
      ];
    case 4: {
      // the gap walks around: follow it
      const dir = Math.random() < 0.5 ? 1 : -1;
      const out = [];
      for (let k = 0; k < 5; k++) out.push({ sides: on([1, 2, 3, 4, 5].map((i) => i + k * dir)), gap: k === 4 ? space : 24 });
      return out;
    }
    default: // two walls, then four
      return [
        { sides: on([0, 3]), gap: 30 },
        { sides: on([1, 2, 4, 5]), gap: space },
      ];
  }
}
// A point on a hexagon with this apothem (distance from the middle to the middle of an edge)
const hexPoint = (apothem: number, corner: number) => {
  const r = apothem / COS30;
  const a = corner * SIDE;
  return [Math.cos(a) * r, Math.sin(a) * r];
};
const triColor = (skin: string, t: number) => (skin === "rainbow" ? rainbow(t) : (SKIN_COLORS[skin] ?? SKIN_COLORS.pink)[1]);
// the money icon: a little pulsing hexagon
const vibeIcon = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = INK;
  ctx.fillRect(x + 2, y, 4, 8);
  ctx.fillRect(x, y + 2, 8, 4);
  ctx.fillRect(x + 1, y + 1, 6, 6);
  ctx.fillStyle = PINK;
  ctx.fillRect(x + 2, y + 2, 4, 4);
};

export default function HexGame({ actionSignal, spinRef, fontFamily, muted, touch = false, beatRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boardRef = useRef<ScoreApi | null>(null);
  const firstSignal = useRef(actionSignal);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const touchRef = useRef(touch);
  touchRef.current = touch;
  const beat = useRef(beatRef);
  beat.current = beatRef;
  const pressRef = useRef<(() => void) | null>(null);
  const arcRef = useRef<Arcade | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const isTouch = () => touchRef.current || coarse;
    const held = { ccw: false, cw: false };
    let touchSide = 0; // -1 = holding the left half, 1 = the right half

    const s = {
      mode: "ready" as Mode,
      angle: -Math.PI / 2, // where the triangle is (in the spinning world)
      waves: [] as Wave[],
      queue: [] as { sides: boolean[]; gap: number }[],
      nextIn: 0, // distance until the next wave comes in
      rot: 0, // how much the whole world is turned
      rotSpeed: 0.7,
      flipIn: 6,
      time: 0, // survival time in seconds
      best: 0, // in hundredths of a second
      stage: 0,
      hue: STAGE_HUES[0], // the colour right now (degrees round the colour wheel)
      swap: false, // the two background shades swapped
      beats: 0,
      kickHigh: false,
      flashText: "",
      textTimer: 0,
      particles: [] as Particle[],
      trail: [] as { a: number; life: number }[],
      t: 0,
      clock: 0,
      shake: 0,
      whiteout: 0,
      run: 0, // vibes this game
      newBest: false,
    };
    try {
      s.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {}
    const scoreNow = () => Math.floor(s.time * 100);
    const palette = () => colorsFor(s.hue, pulseNow());

    // ---------- pause, shop, FX (the same in every game, see PinkShop.ts) ----------
    const bankRun = () => {
      s.run = Math.floor(s.time / 2);
      if (s.run > 0) arc.shop.add(s.run);
    };
    const arc = makeArcade({
      W,
      H,
      font: fontFamily,
      fxKey: FX_KEY,
      shopKey: SHOP_KEY,
      rows: SHOP_ROWS,
      moneyName: "VIBES",
      icon: vibeIcon,
      preview: (c, id, box, t) => drawPreview(c, id, box.x + box.w / 2, box.y + box.h / 2, t),
      panelPreview: (c, cx, cy, t) => drawPreview(c, null, cx, cy, t),
      ink: INK,
      muted: () => mutedRef.current,
      touch: isTouch,
      playing: () => s.mode === "running",
      menuScreen: () => s.mode === "ready" || (s.mode === "over" && s.t > 0.6),
      busy: () => boardRef.current?.busy() ?? false,
      restart: () => {
        newGame();
        s.mode = "running";
        playStart();
      },
      leaving: () => {
        if (s.mode === "running") bankRun();
      },
      stats: () => `TIME ${fmtTime(scoreNow())}  +${Math.floor(s.time / 2)} VIBES`,
      pauseBtn: { x: 24, y: 3 },
    });
    arcRef.current = arc;
    const beep = arc.beep;
    const deathSound = new Audio(DEATH_SOUND);

    const playStart = () => beep(220, 880, 0.25, 0.05, "sawtooth");
    const playStage = () => [523, 784, 1047].forEach((f, i) => beep(f, f, 0.09, 0.05, "square", i * 0.08));
    const playHit = () => beep(300, 50, 0.3, 0.14, "sawtooth");
    const playDeath = () => {
      const g = arc.fx.on && !mutedRef.current ? arc.fx.vol : 0;
      if (g <= 0) return;
      deathSound.volume = g;
      deathSound.currentTime = 0;
      deathSound.play().catch(() => {});
    };

    // ---------- the game ----------
    const wallSpeed = () => Math.min(120, 48 + s.time * 1.1);
    // Is there a wall touching the triangle if it stood at this angle?
    const blockedAt = (angle: number) => {
      const a = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const side = Math.floor(a / SIDE) % 6;
      const center = side * SIDE + SIDE / 2;
      // Distance of the triangle toward that side's wall (walls are straight hexagon edges)
      const pd = PLAYER_R * Math.cos(a - center);
      for (const w of s.waves) {
        if (!w.sides[side]) continue;
        if (pd + 2 >= w.d && pd - 2 <= w.d + WALL_TH) return true;
      }
      return false;
    };
    // Turn the triangle, but walls block it from the side
    const moveBy = (delta: number) => {
      const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.05));
      const step = delta / steps;
      for (let i = 0; i < steps; i++) {
        const next = s.angle + step;
        if (blockedAt(next)) break;
        s.angle = wrap(next);
      }
    };
    const newGame = () => {
      boardRef.current?.hide();
      s.waves = [];
      s.queue = [];
      s.nextIn = 40;
      s.rot = 0;
      s.rotSpeed = 0.7;
      s.flipIn = rand(5, 8);
      s.time = 0;
      s.stage = 0;
      s.hue = STAGE_HUES[0];
      s.particles = [];
      s.trail = [];
      s.whiteout = 0;
      s.angle = -Math.PI / 2;
      s.run = 0;
      s.newBest = false;
      s.t = 0;
    };

    // OK / Enter / Space / tapping the screen
    const press = () => {
      arc.wakeSound(); // browsers only allow sound after a click, so wake it up here
      if (s.mode === "ready") {
        newGame();
        s.mode = "running";
        playStart();
      } else if (s.mode === "over" && s.t > 0.6) {
        if (boardRef.current?.busy()) return;
        newGame();
        s.mode = "running";
        playStart();
      }
    };
    pressRef.current = press;

    const die = () => {
      s.mode = "dying";
      s.t = 0;
      s.shake = 0.4;
      s.whiteout = 0.35;
      const px = Math.cos(s.angle + s.rot) * PLAYER_R;
      const py = Math.sin(s.angle + s.rot) * PLAYER_R;
      for (let i = 0; i < 40; i++) s.particles.push({ x: CX + px, y: CY + py, vx: rand(-110, 110), vy: rand(-110, 110), color: BOOM[randInt(BOOM.length)], life: rand(0.5, 1.2) });
      const score = scoreNow();
      if (score > s.best) {
        s.best = score;
        s.newBest = true;
        try {
          localStorage.setItem(BEST_KEY, String(score));
        } catch {}
      }
      bankRun();
      playHit();
      playDeath();
    };
    const gameOver = () => {
      s.mode = "over";
      s.t = 0;
      boardRef.current?.gameOver(scoreNow(), s.time);
    };

    // how hard the music is hitting right now (0..1)
    const pulseNow = () => {
      const b = beat.current?.current;
      if (b && b.live) return Math.max(0, Math.min(1, b.kick));
      const phase = (s.clock % BEAT) / BEAT;
      return Math.max(0, 1 - phase * 4);
    };

    const update = (dt: number) => {
      s.t += dt;
      if (s.shake > 0) s.shake -= dt;
      if (s.whiteout > 0) s.whiteout -= dt;
      if (s.textTimer > 0) s.textTimer -= dt;
      for (const p of s.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2 * dt;
        p.vy *= 1 - 2 * dt;
        p.life -= dt;
      }
      s.particles = s.particles.filter((p) => p.life > 0);
      for (const tr of s.trail) tr.life -= dt;
      s.trail = s.trail.filter((tr) => tr.life > 0);

      // THE COLOURS keep moving (on the start screen too): the hue slides, and the background shades swap on the beat
      s.hue += (HUE_DRIFT + Math.min(s.stage, STAGE_HUES.length - 1) * HUE_DRIFT_UP) * dt;
      const kick = pulseNow();
      if (kick > 0.85 && !s.kickHigh) {
        s.kickHigh = true;
        s.beats += 1;
        if (s.beats % SWAP_EVERY_BEATS === 0) s.swap = !s.swap;
      } else if (kick < 0.3) s.kickHigh = false;

      // The world keeps spinning slowly even on the start screen
      if (s.mode === "ready" || s.mode === "over") {
        s.rot += 0.5 * dt;
        spinRef.current = 0;
        return;
      }
      if (s.mode === "dying") {
        s.rot += s.rotSpeed * 0.3 * dt;
        if (s.t > 1.5) gameOver();
        return;
      }

      s.time += dt;
      // Your turning: click wheel, keyboard, touch
      const wheel = (spinRef.current * Math.PI) / 180;
      spinRef.current = 0;
      let turn = wheel;
      if (held.ccw || touchSide < 0) turn -= TURN_SPEED * dt;
      if (held.cw || touchSide > 0) turn += TURN_SPEED * dt;
      if (turn !== 0) moveBy(turn);
      // the trail
      if (arc.shop.wearingName("trail") !== "none") s.trail.push({ a: s.angle, life: 0.35 });

      // The world spins, faster over time, and sometimes flips direction
      const spin = Math.min(2.4, 0.7 + s.time * 0.025);
      s.rotSpeed = Math.sign(s.rotSpeed || 1) * spin;
      s.flipIn -= dt;
      if (s.flipIn <= 0) {
        s.rotSpeed = -s.rotSpeed;
        s.flipIn = rand(4, 8);
      }
      s.rot += s.rotSpeed * dt;

      // Stages (new colours every time)
      if (s.stage < STAGES.length && s.time >= STAGES[s.stage]) {
        s.stage += 1;
        s.hue = STAGE_HUES[Math.min(s.stage, STAGE_HUES.length - 1)]; // a whole new colour
        s.flashText = `STAGE ${s.stage + 1}`;
        s.textTimer = 1.4;
        s.whiteout = 0.2;
        playStage();
      }

      // Walls come in
      const move = wallSpeed() * dt;
      for (const w of s.waves) w.d -= move;
      s.waves = s.waves.filter((w) => w.d + WALL_TH > CORE - 2);
      s.nextIn -= move;
      if (s.nextIn <= 0) {
        if (s.queue.length === 0) s.queue = makePattern(s.time);
        const next = s.queue.shift();
        if (next) {
          s.waves.push({ d: SPAWN_D, sides: next.sides });
          s.nextIn = next.gap;
        }
      }
      // Crushed by a wall
      if (blockedAt(s.angle)) die();
    };

    // ---------- drawing ----------
    const drawTriangle = (c: CanvasRenderingContext2D, a: number, color: string, scale = 1) => {
      const tip = (PLAYER_R + 4) * scale;
      const base = (PLAYER_R - 1) * scale;
      c.fillStyle = color;
      c.strokeStyle = INK;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(Math.cos(a) * tip, Math.sin(a) * tip);
      c.lineTo(Math.cos(a - 0.2) * base, Math.sin(a - 0.2) * base);
      c.lineTo(Math.cos(a + 0.2) * base, Math.sin(a + 0.2) * base);
      c.closePath();
      c.fill();
      c.stroke();
    };
    const trailColor = (trail: string, i: number, t: number) =>
      trail === "rainbow" ? rainbow(t, i) : trail === "fire" ? ["#ffd84a", "#ff7a00", "#ff3b1a"][i % 3] : PINK;
    // the shop's preview + the SHOP panel: the triangle going round a little hexagon
    const drawPreview = (c: CanvasRenderingContext2D, id: string | null, cx: number, cy: number, t: number) => {
      const pp = colorsFor(s.hue);
      c.fillStyle = pp.a;
      c.fillRect(cx - 50, cy - 50, 100, 100);
      const skin = id && id.startsWith("skin:") ? id.split(":")[1] : arc.shop.wearingName("skin");
      const trail = id && id.startsWith("trail:") ? id.split(":")[1] : arc.shop.wearingName("trail");
      c.save();
      c.translate(cx, cy);
      const core = 7 + pulseNow() * 2;
      c.fillStyle = pp.core;
      c.strokeStyle = pp.wall;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const [x, y] = hexPoint(core, i);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      c.stroke();
      const a = t * 2.5;
      if (trail !== "none") {
        for (let i = 1; i < 10; i++) {
          c.globalAlpha = 1 - i / 10;
          c.fillStyle = trailColor(trail, i, t);
          const ta = a - i * 0.12;
          c.fillRect(Math.round(Math.cos(ta) * 15) - 1, Math.round(Math.sin(ta) * 15) - 1, 2, 2);
        }
        c.globalAlpha = 1;
      }
      drawTriangle(c, a, skin === "pink" ? pp.edge : triColor(skin, t), 0.8);
      c.restore();
    };

    const draw = () => {
      const pal = palette();
      const pulse = pulseNow();
      ctx.save();
      if (s.shake > 0) ctx.translate(Math.round(rand(-3, 3)), Math.round(rand(-3, 3)));
      ctx.translate(CX, CY);
      ctx.rotate(s.rot);
      // the whole world jumps a little on the beat
      const zoom = 1 + pulse * 0.035;
      ctx.scale(zoom, zoom);
      // Background: 6 slices in two shades
      for (let i = 0; i < 6; i++) {
        ctx.fillStyle = (i % 2 === 0) !== s.swap ? pal.a : pal.b;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(i * SIDE) * 260, Math.sin(i * SIDE) * 260);
        ctx.lineTo(Math.cos((i + 1) * SIDE) * 260, Math.sin((i + 1) * SIDE) * 260);
        ctx.closePath();
        ctx.fill();
      }
      // Walls
      for (const w of s.waves) {
        for (let i = 0; i < 6; i++) {
          if (!w.sides[i]) continue;
          const inner = Math.max(CORE, w.d);
          const outer = w.d + WALL_TH;
          if (outer <= CORE) continue;
          const [x1, y1] = hexPoint(inner, i);
          const [x2, y2] = hexPoint(inner, i + 1);
          const [x3, y3] = hexPoint(outer, i + 1);
          const [x4, y4] = hexPoint(outer, i);
          ctx.fillStyle = pal.wall;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.lineTo(x3, y3);
          ctx.lineTo(x4, y4);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = pal.edge;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      // Middle hexagon, pulsing to the beat
      const core = CORE + pulse * 3;
      ctx.fillStyle = pal.core;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const [x, y] = hexPoint(core, i);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = pal.wall;
      ctx.lineWidth = 2;
      ctx.stroke();
      // the trail, then you: the triangle
      const trail = arc.shop.wearingName("trail");
      if (trail !== "none" && s.mode === "running") {
        s.trail.forEach((tr, i) => {
          ctx.globalAlpha = Math.max(0, tr.life / 0.35);
          ctx.fillStyle = trailColor(trail, i, s.clock);
          ctx.fillRect(Math.round(Math.cos(tr.a) * PLAYER_R) - 1, Math.round(Math.sin(tr.a) * PLAYER_R) - 1, 2, 2);
        });
        ctx.globalAlpha = 1;
      }
      // (the free PINK triangle takes the level's colour, like the real game; skins you bought keep theirs)
      const skinNow = arc.shop.wearingName("skin");
      if (s.mode === "ready" || s.mode === "running") drawTriangle(ctx, s.angle, skinNow === "pink" ? pal.edge : triColor(skinNow, s.clock));
      ctx.restore();

      for (const p of s.particles) {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
      }
      if (s.whiteout > 0) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, s.whiteout * 2.5)})`;
        ctx.fillRect(0, 0, W, H);
      }

      // HUD
      ctx.font = `8px ${fontFamily}`;
      ctx.textBaseline = "top";
      ctx.textAlign = "right";
      const boxText = (text: string, x: number, y: number) => {
        const w = ctx.measureText(text).width + 6;
        ctx.fillStyle = INK;
        ctx.fillRect(Math.round(x - w + 3), y - 2, Math.round(w), 12);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(text, x, y);
      };
      if (s.mode === "running" || s.mode === "dying") {
        boxText(`TIME ${fmtTime(scoreNow())}`, W - 5, 5);
        boxText(`BEST ${fmtTime(s.best)}`, W - 5, H - 13);
      }
      ctx.textAlign = "center";
      if (s.mode === "running" && s.textTimer > 0) {
        const w = ctx.measureText(s.flashText).width + 8;
        ctx.fillStyle = INK;
        ctx.fillRect(Math.round(W / 2 - w / 2), 28, Math.round(w), 12);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(s.flashText, W / 2, 30);
      }

      if (s.mode === "ready") {
        const top = boardRef.current?.top();
        drawStartScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          title: GAME_TITLE,
          sub: "SURVIVE THE WALLS",
          lines: [
            [isTouch() ? "HOLD LEFT/RIGHT" : "← → = GO ROUND", "#ffffff"],
            ["IT PULSES TO", KIT.lilac],
            ["THE MUSIC", KIT.lilac],
          ],
          start: isTouch() ? "TAP TO START" : "SPACE = START",
          best: top ? `#1 ${top.name} ${fmtTime(top.score)}` : s.best > 0 ? `BEST ${fmtTime(s.best)}` : undefined,
          hint: isTouch() ? "TAP THE SPEAKER = SOUNDS" : "M = SOUNDS  -/+ = FX VOLUME",
          kick: pulse,
        });
        arc.drawPanels(ctx, s.clock);
      }
      if (s.mode === "over") {
        drawOverScreen(ctx, fontFamily, {
          W,
          H,
          t: s.clock,
          age: s.t,
          title: "GAME OVER",
          score: `TIME ${fmtTime(scoreNow())}`,
          best: `BEST ${fmtTime(s.best)}`,
          newBest: s.newBest,
          stats: `STAGE ${s.stage + 1}`,
          again: isTouch() ? "TAP = AGAIN" : "SPACE = AGAIN",
          saved: `+${s.run} VIBES SAVED`,
        });
        if (s.t > 0.4) arc.drawPanels(ctx, s.clock);
      }
      // (the speaker is white on the dark stages)
      arc.drawOverlays(ctx, s.clock);
    };

    // ---------- keys (capture: true = before the page, so the pause menu / shop / FX keys go there first) ----------
    const onKeyFirst = (e: KeyboardEvent) => {
      if (arc.key(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") held.ccw = true;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") held.cw = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") held.ccw = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") held.cw = false;
    };
    window.addEventListener("keydown", onKeyFirst, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    // ---------- taps: hold the left or right half of the screen to go round ----------
    const toGame = (cx: number, cy: number) => {
      const r = canvas.getBoundingClientRect();
      const sc = Math.min(r.width / W, r.height / H);
      return { x: (cx - r.left - (r.width - W * sc) / 2) / sc, y: (cy - r.top - (r.height - H * sc) / 2) / sc };
    };
    const onDown = (e: PointerEvent) => {
      const g = toGame(e.clientX, e.clientY);
      if (arc.tap(g.x, g.y)) {
        if (arc.dragging()) canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (arc.frozen()) return;
      if (s.mode !== "running") {
        press();
        return;
      }
      canvas.setPointerCapture(e.pointerId);
      touchSide = g.x < W / 2 ? -1 : 1;
    };
    const onMove = (e: PointerEvent) => {
      if (arc.dragging()) arc.drag(toGame(e.clientX, e.clientY).y);
    };
    const onUp = () => {
      if (arc.dragging()) arc.drag(-1);
      touchSide = 0;
    };
    canvas.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    const onHidden = () => {
      if (document.hidden && s.mode === "running") arc.setPause(true);
    };
    document.addEventListener("visibilitychange", onHidden);

    newGame();

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.max(0, Math.min(0.033, (now - last) / 1000)); // (never below 0: the first frame can be a hair early)
      last = now;
      s.clock += dt;
      arc.tick(dt);
      if (arc.frozen()) {
        spinRef.current = 0;
        held.ccw = held.cw = false;
        touchSide = 0;
      } else update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyFirst, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.removeEventListener("visibilitychange", onHidden);
      if (s.mode === "running") bankRun();
      arc.closeSound();
      pressRef.current = null;
      arcRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontFamily]);

  // OK / Enter / Space from the page (the pause menu or shop gets it first when open)
  useEffect(() => {
    if (actionSignal === firstSignal.current) return;
    if (arcRef.current?.ok()) return;
    pressRef.current?.();
  }, [actionSignal]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          imageRendering: "pixelated",
          background: "#2a0a26",
          touchAction: "none",
          cursor: "pointer",
        }}
      />
      <ScorePanel game="hex" title={GAME_TITLE} apiRef={boardRef} fontFamily={fontFamily} width={W} height={H} format={fmtTime} minScore={100} />
    </>
  );
}
